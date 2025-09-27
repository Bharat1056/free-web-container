#!/bin/bash
set -e

# =============================
# Automated Blue-Green Deployment Script
# =============================

# Configuration
APP_NAME="lovable"
BLUE_PORT=3000
GREEN_PORT=3001
HEALTH_URL="http://localhost/api/health"
ACTIVE_FILE="/etc/nginx/upstreams/active.conf"
BLUE_FILE="/etc/nginx/upstreams/blue.conf"
GREEN_FILE="/etc/nginx/upstreams/green.conf"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

success() {
    echo -e "${GREEN}✅ $1${NC}"
}

warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

error() {
    echo -e "${RED}❌ $1${NC}"
}

# Function to ensure upstream configuration files exist
ensure_upstream_files() {
    log "Ensuring nginx upstream configuration files exist..."

    # Create upstreams directory if it doesn't exist
    sudo mkdir -p /etc/nginx/upstreams

    # Create blue upstream file if it doesn't exist
    if [ ! -f "$BLUE_FILE" ]; then
        echo "server 127.0.0.1:$BLUE_PORT;" | sudo tee $BLUE_FILE > /dev/null
        log "Created blue upstream file"
    fi

    # Create green upstream file if it doesn't exist
    if [ ! -f "$GREEN_FILE" ]; then
        echo "server 127.0.0.1:$GREEN_PORT;" | sudo tee $GREEN_FILE > /dev/null
        log "Created green upstream file"
    fi

    # Create initial active file if it doesn't exist (default to blue)
    if [ ! -f "$ACTIVE_FILE" ]; then
        echo "server 127.0.0.1:$BLUE_PORT;" | sudo tee $ACTIVE_FILE > /dev/null
        log "Created initial active upstream file (defaulting to blue)"
    fi

    success "Upstream files are ready"
}

# Function to detect current active environment
detect_current_active() {
    if [ -f "$ACTIVE_FILE" ]; then
        if grep -q "$BLUE_PORT" "$ACTIVE_FILE"; then
            echo "blue"
        elif grep -q "$GREEN_PORT" "$ACTIVE_FILE"; then
            echo "green"
        else
            echo "unknown"
        fi
    else
        echo "blue"  # Default to blue if no active file
    fi
}

# Function to wait for health check
wait_for_health() {
    local port=$1
    local environment=$2
    local max_attempts=20
    local attempt=1

    log "Waiting for $environment (port $port) to become healthy..."

    while [ $attempt -le $max_attempts ]; do
        if curl -fs "http://localhost:$port/api/health" >/dev/null 2>&1; then
            success "$environment is healthy! (attempt $attempt/$max_attempts)"
            return 0
        fi

        log "Health check attempt $attempt/$max_attempts failed, retrying in 3 seconds..."
        sleep 3
        ((attempt++))
    done

    error "$environment failed health checks after $max_attempts attempts"
    return 1
}

# Function to switch nginx upstream
switch_nginx_upstream() {
    local new_environment=$1
    local new_port=$2

    log "Switching nginx upstream to $new_environment (port $new_port)..."

    # Update active upstream file
    echo "server 127.0.0.1:$new_port;" | sudo tee $ACTIVE_FILE > /dev/null

    # Test nginx configuration
    if sudo nginx -t; then
        # Reload nginx
        sudo systemctl reload nginx
        success "Nginx switched to $new_environment successfully"
        return 0
    else
        error "Nginx configuration test failed"
        return 1
    fi
}

# Function to cleanup old containers
cleanup_old_containers() {
    local old_environment=$1

    log "Cleaning up old $old_environment containers..."

    # Use proper container naming pattern for blue-green deployment
    local container_name="lovable-app-${old_environment}-dev"

    # Stop and remove old containers
    docker stop "$container_name" 2>/dev/null || log "Container $container_name not found (OK)"
    docker rm "$container_name" 2>/dev/null || log "Container $container_name not found (OK)"

    success "Old $old_environment containers cleaned up"
}

# Function to deploy new container
deploy_new_container() {
    local environment=$1
    local port=$2
    local image_tag=$3

    log "Deploying new $environment container on port $port..."

    # Use proper container naming pattern for blue-green deployment
    local container_name="lovable-app-${environment}-dev"

    # Remove any existing container with the same name
    docker rm -f "$container_name" 2>/dev/null || true

    # Run new container with proper environment file
    local env_file=".env.dev"
    if [ ! -f "$env_file" ]; then
        env_file=".env.prod"
    fi

    docker run -d \
        --name "$container_name" \
        -p "${port}:3000" \
        --env-file "$env_file" \
        "${APP_NAME}:${image_tag}"

    success "New $environment container deployed as $container_name"
}

# Function to rollback on failure
rollback() {
    local failed_environment=$1
    local rollback_environment=$2
    local rollback_port=$3

    warning "Rolling back to $rollback_environment due to $failed_environment failure..."

    # Switch back to the working environment
    switch_nginx_upstream "$rollback_environment" "$rollback_port"

    # Clean up the failed environment
    cleanup_old_containers "$failed_environment"

    error "Deployment failed and rolled back to $rollback_environment"
    exit 1
}

# Main deployment function
deploy() {
    local environment=${1:-"dev"}
    local target_color=${2:-""}
    local image_tag=${3:-"latest"}

    log "Starting automated blue-green deployment with image: ${APP_NAME}:${image_tag}"
    log "Environment: $environment"
    log "Target color: $target_color"

    # Ensure upstream files exist
    ensure_upstream_files

    # Determine target environment and ports
    local new_environment
    local new_port
    local old_environment
    local old_port

    if [ -n "$target_color" ]; then
        # Use provided target color
        new_environment="$target_color"
        if [ "$target_color" = "blue" ]; then
            new_port=$BLUE_PORT
            old_environment="green"
            old_port=$GREEN_PORT
        else
            new_port=$GREEN_PORT
            old_environment="blue"
            old_port=$BLUE_PORT
        fi
        log "Using provided target color: $target_color"
    else
        # Auto-detect current active environment
        local current_active=$(detect_current_active)
        if [ "$current_active" = "blue" ]; then
            new_environment="green"
            new_port=$GREEN_PORT
            old_environment="blue"
            old_port=$BLUE_PORT
        else
            new_environment="blue"
            new_port=$BLUE_PORT
            old_environment="green"
            old_port=$GREEN_PORT
        fi
        log "Auto-detected: Current active: $current_active, Deploying new: $new_environment"
    fi

    log "Deploying to: $new_environment on port $new_port"

    # Deploy new container
    deploy_new_container "$new_environment" "$new_port" "$image_tag"

    # Wait for health check
    if ! wait_for_health "$new_port" "$new_environment"; then
        rollback "$new_environment" "$old_environment" "$old_port"
    fi

    # Switch nginx upstream
    if ! switch_nginx_upstream "$new_environment" "$new_port"; then
        rollback "$new_environment" "$old_environment" "$old_port"
    fi

    # Cleanup old containers
    cleanup_old_containers "$old_environment"

    success "🎉 Blue-green deployment completed successfully!"
    log "Active environment: $new_environment (port $new_port)"
    log "Old environment: $old_environment (cleaned up)"
}

# Function to show current status
show_status() {
    log "Current deployment status:"
    echo ""

    local current_active=$(detect_current_active)
    echo "Active environment: $current_active"

    if [ "$current_active" = "blue" ]; then
        echo "Active port: $BLUE_PORT"
        echo "Standby port: $GREEN_PORT"
    else
        echo "Active port: $GREEN_PORT"
        echo "Standby port: $BLUE_PORT"
    fi

    echo ""
    echo "Running containers:"
    docker ps --filter "name=${APP_NAME}_" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

    echo ""
    echo "Nginx upstream configuration:"
    if [ -f "$ACTIVE_FILE" ]; then
        cat "$ACTIVE_FILE"
    else
        echo "No active upstream file found"
    fi
}

# Function to show help
show_help() {
    echo "Automated Blue-Green Deployment Script"
    echo ""
    echo "Usage: $0 [COMMAND] [ENVIRONMENT] [TARGET_COLOR] [IMAGE_TAG]"
    echo ""
    echo "Commands:"
    echo "  deploy [ENV] [COLOR] [TAG]  Deploy new version"
    echo "  status                      Show current deployment status"
    echo "  setup                       Ensure nginx upstream files exist"
    echo "  help                        Show this help message"
    echo ""
    echo "Parameters:"
    echo "  ENV      Environment (dev/prod, default: dev)"
    echo "  COLOR    Target color (blue/green, default: auto-detect)"
    echo "  TAG      Docker image tag (default: latest)"
    echo ""
    echo "Examples:"
    echo "  $0 deploy                    # Deploy latest image (auto-detect color)"
    echo "  $0 deploy dev                # Deploy to dev environment"
    echo "  $0 deploy dev green          # Deploy to green dev environment"
    echo "  $0 deploy dev blue latest    # Deploy latest to blue dev environment"
    echo "  $0 status                    # Show current status"
    echo "  $0 setup                     # Ensure nginx files exist"
}

# Main script logic
case "${1:-deploy}" in
    "deploy")
        deploy "$2" "$3" "$4"
        ;;
    "status")
        show_status
        ;;
    "setup")
        ensure_upstream_files
        ;;
    "help"|"-h"|"--help")
        show_help
        ;;
    *)
        error "Unknown command: $1"
        show_help
        exit 1
        ;;
esac
