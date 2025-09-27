#!/bin/bash

# Blue-Green Deployment Script for Lovable
# Usage: ./deploy-blue-green.sh [blue|green] [dev|prod]

set -e  # Exit on any error

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
INSTRUCTIONS_DIR="$PROJECT_ROOT/docker/instructions"
NGINX_CONFIG="/etc/nginx/sites-available/lovable"
LOG_FILE="/var/log/lovable-deployment.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"
    exit 1
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$LOG_FILE"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "$LOG_FILE"
}

# Function to check if a port is in use
check_port() {
    local port=$1
    if netstat -tuln | grep -q ":$port "; then
        return 0  # Port is in use
    else
        return 1  # Port is free
    fi
}

# Function to wait for health check
wait_for_health() {
    local port=$1
    local max_attempts=60
    local attempt=1

    log "Waiting for health check on port $port..."

    while [ $attempt -le $max_attempts ]; do
        if curl -f -s "http://localhost:$port/api/health" > /dev/null 2>&1; then
            success "Health check passed on port $port"
            return 0
        fi

        log "Health check attempt $attempt/$max_attempts failed, waiting 5 seconds..."
        sleep 5
        ((attempt++))
    done

    error "Health check failed after $max_attempts attempts on port $port"
}

# Function to switch nginx traffic
switch_nginx_traffic() {
    local new_port=$1
    local old_port=$2

    log "Switching nginx traffic from port $old_port to port $new_port..."

    # Use single nginx config file for both environments
    NGINX_CONFIG_FILE="/etc/nginx/sites-available/lovable"

    # Backup current config
    sudo cp "$NGINX_CONFIG_FILE" "$NGINX_CONFIG_FILE.backup.$(date +%s)"

    # Update nginx config
    sudo sed -i "s/server 127.0.0.1:$old_port;/server 127.0.0.1:$old_port backup;/" "$NGINX_CONFIG_FILE"
    sudo sed -i "s/server 127.0.0.1:$new_port backup;/server 127.0.0.1:$new_port;/" "$NGINX_CONFIG_FILE"

    # Test nginx config
    if sudo nginx -t; then
        # Reload nginx
        sudo systemctl reload nginx
        success "Nginx traffic switched to port $new_port"
    else
        error "Nginx config test failed, reverting changes"
        sudo cp "$NGINX_CONFIG_FILE.backup.$(date +%s)" "$NGINX_CONFIG_FILE"
        exit 1
    fi
}

# Function to cleanup old containers
cleanup_old_containers() {
    local old_port=$1

    log "Cleaning up old containers on port $old_port..."

    # Find and stop containers using the old port
    local old_containers=$(docker ps --format "{{.Names}}" --filter "publish=$old_port")

    if [ -n "$old_containers" ]; then
        log "Stopping old containers: $old_containers"
        echo "$old_containers" | xargs docker stop
        echo "$old_containers" | xargs docker rm
        success "Old containers cleaned up"
    else
        log "No old containers found on port $old_port"
    fi
}

# Main deployment function
deploy() {
    local target_color=$1
    local environment=$2

    log "Starting blue-green deployment..."
    log "Target color: $target_color"
    log "Environment: $environment"

    # Determine ports
    local blue_port="3000"
    local green_port="3001"

    if [ "$target_color" = "blue" ]; then
        local new_port=$blue_port
        local old_port=$green_port
    else
        local new_port=$green_port
        local old_port=$blue_port
    fi

    log "Deploying to port $new_port (color: $target_color)"

    # Check if target port is already in use
    if check_port $new_port; then
        warning "Port $new_port is already in use, stopping existing containers..."
        cleanup_old_containers $new_port
    fi

    # Set environment variables based on environment
    if [ "$environment" = "dev" ]; then
        export APP_PORT=$new_port
        export MYSQL_PORT="3307"
        export INNGEST_PORT="8289"
        export MYSQL_CONTAINER_NAME="lovable-mysql-$target_color-dev"
        export APP_CONTAINER_NAME="lovable-app-$target_color-dev"
        export INNGEST_CONTAINER_NAME="lovable-inngest-$target_color-dev"
        export COMPOSE_FILE="$INSTRUCTIONS_DIR/docker-compose.dev.yml"
    else
        export APP_PORT=$new_port
        export MYSQL_PORT="3306"
        export INNGEST_PORT="8288"
        export MYSQL_CONTAINER_NAME="lovable-mysql-$target_color-prod"
        export APP_CONTAINER_NAME="lovable-app-$target_color-prod"
        export INNGEST_CONTAINER_NAME="lovable-inngest-$target_color-prod"
        export COMPOSE_FILE="$INSTRUCTIONS_DIR/docker-compose.app.yml"
    fi

    export DEPLOYMENT_VERSION="$(date +%s)"
    export NODE_ENV="$environment"

    # Load environment file
    if [ -f "$PROJECT_ROOT/.env.$environment" ]; then
        log "Loading environment file: .env.$environment"
        set -a  # Automatically export all variables
        source "$PROJECT_ROOT/.env.$environment"
        set +a
    else
        warning "Environment file .env.$environment not found, using defaults"
    fi

    # Deploy new version
    log "Deploying new version..."
    docker-compose -f "$COMPOSE_FILE" up -d

    # Wait for health check
    wait_for_health $new_port

    # Switch nginx traffic
    switch_nginx_traffic $new_port $old_port

    # Wait a bit for traffic to stabilize
    log "Waiting for traffic to stabilize..."
    sleep 30

    # Cleanup old containers
    cleanup_old_containers $old_port

    # Show final status
    log "Deployment completed successfully!"
    log "Active port: $new_port"
    log "Active color: $target_color"

    # Show running containers
    log "Running containers:"
    docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
}

# Function to show current status
show_status() {
    log "Current deployment status:"

    if check_port 3000; then
        log "Blue environment (port 3000): ACTIVE"
    else
        log "Blue environment (port 3000): INACTIVE"
    fi

    if check_port 3001; then
        log "Green environment (port 3001): ACTIVE"
    else
        log "Green environment (port 3001): INACTIVE"
    fi

    log "Nginx configuration:"
    grep -A 2 "upstream lovable_backend" "$NGINX_CONFIG" || log "Nginx config not found"

    log "Running containers:"
    docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
}

# Main script logic
main() {
    case "${1:-}" in
        "blue")
            deploy "blue" "${2:-production}"
            ;;
        "green")
            deploy "green" "${2:-production}"
            ;;
        "status")
            show_status
            ;;
        "help"|"-h"|"--help")
            echo "Usage: $0 [blue|green|status] [dev|prod]"
            echo ""
            echo "Commands:"
            echo "  blue     Deploy to blue environment (port 3000)"
            echo "  green    Deploy to green environment (port 3001)"
            echo "  status   Show current deployment status"
            echo "  help     Show this help message"
            echo ""
            echo "Environments:"
            echo "  dev      Development environment"
            echo "  prod     Production environment (default)"
            ;;
        *)
            error "Invalid command. Use 'help' for usage information."
            ;;
    esac
}

# Run main function with all arguments
main "$@"
