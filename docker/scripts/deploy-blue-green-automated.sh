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

# Function to create upstream configuration files
setup_upstream_files() {
    log "Setting up nginx upstream configuration files..."

    # Create upstreams directory
    sudo mkdir -p /etc/nginx/upstreams

    # Create blue upstream file
    echo "server 127.0.0.1:$BLUE_PORT;" | sudo tee $BLUE_FILE > /dev/null

    # Create green upstream file
    echo "server 127.0.0.1:$GREEN_PORT;" | sudo tee $GREEN_FILE > /dev/null

    # Create initial active file (default to blue)
    if [ ! -f "$ACTIVE_FILE" ]; then
        echo "server 127.0.0.1:$BLUE_PORT;" | sudo tee $ACTIVE_FILE > /dev/null
        log "Initial active upstream set to blue (port $BLUE_PORT)"
    fi

    success "Upstream files created successfully"
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

    # Stop and remove old containers
    docker stop "${APP_NAME}_${old_environment}" 2>/dev/null || log "Container ${APP_NAME}_${old_environment} not found (OK)"
    docker rm "${APP_NAME}_${old_environment}" 2>/dev/null || log "Container ${APP_NAME}_${old_environment} not found (OK)"

    success "Old $old_environment containers cleaned up"
}

# Function to deploy new container
deploy_new_container() {
    local environment=$1
    local port=$2
    local image_tag=$3

    log "Deploying new $environment container on port $port..."

    # Remove any existing container with the same name
    docker rm -f "${APP_NAME}_${environment}" 2>/dev/null || true

    # Run new container
    docker run -d \
        --name "${APP_NAME}_${environment}" \
        -p "${port}:3000" \
        --env-file .env.prod \
        "${APP_NAME}:${image_tag}"

    success "New $environment container deployed"
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
    local image_tag=${1:-"latest"}

    log "Starting automated blue-green deployment with image: ${APP_NAME}:${image_tag}"

    # Setup upstream files if they don't exist
    setup_upstream_files

    # Detect current active environment
    local current_active=$(detect_current_active)
    local new_environment
    local new_port
    local old_environment
    local old_port

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

    log "Current active: $current_active, Deploying new: $new_environment on port $new_port"

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
    echo "Usage: $0 [COMMAND] [OPTIONS]"
    echo ""
    echo "Commands:"
    echo "  deploy [IMAGE_TAG]  Deploy new version (default: latest)"
    echo "  status             Show current deployment status"
    echo "  setup              Setup nginx upstream files"
    echo "  help               Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 deploy                    # Deploy latest image"
    echo "  $0 deploy v1.2.3            # Deploy specific version"
    echo "  $0 status                   # Show current status"
    echo "  $0 setup                    # Setup nginx files"
}

# Main script logic
case "${1:-deploy}" in
    "deploy")
        deploy "$2"
        ;;
    "status")
        show_status
        ;;
    "setup")
        setup_upstream_files
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
