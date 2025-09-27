#!/bin/bash
set -e

# =============================
# Nginx Blue-Green Setup Script
# =============================

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

# Function to check if running as root
check_root() {
    if [ "$EUID" -eq 0 ]; then
        error "This script should not be run as root. Please run as a regular user with sudo privileges."
        exit 1
    fi
}

# Function to check if nginx is installed
check_nginx() {
    if ! command -v nginx &> /dev/null; then
        error "Nginx is not installed. Please install nginx first:"
        echo "  Ubuntu/Debian: sudo apt update && sudo apt install nginx"
        echo "  CentOS/RHEL: sudo yum install nginx"
        exit 1
    fi
    success "Nginx is installed"
}

# Function to backup existing nginx config
backup_nginx_config() {
    if [ -f "/etc/nginx/sites-available/default" ]; then
        log "Backing up existing default nginx configuration..."
        sudo cp /etc/nginx/sites-available/default /etc/nginx/sites-available/default.backup.$(date +%Y%m%d_%H%M%S)
        success "Default configuration backed up"
    fi
}

# Function to install nginx configuration
install_nginx_config() {
    log "Installing nginx configuration for blue-green deployment..."

    # Copy nginx config to sites-available
    sudo cp docker/instructions/nginx-lovable.conf /etc/nginx/sites-available/lovable

    # Create symbolic link to enable the site
    sudo ln -sf /etc/nginx/sites-available/lovable /etc/nginx/sites-enabled/lovable

    # Remove default site if it exists
    sudo rm -f /etc/nginx/sites-enabled/default

    success "Nginx configuration installed"
}

# Function to create upstream directories and files
setup_upstream_files() {
    log "Setting up nginx upstream configuration files..."

    # Create upstreams directory
    sudo mkdir -p /etc/nginx/upstreams

    # Create blue upstream file
    echo "server 127.0.0.1:3000;" | sudo tee /etc/nginx/upstreams/blue.conf > /dev/null

    # Create green upstream file
    echo "server 127.0.0.1:3001;" | sudo tee /etc/nginx/upstreams/green.conf > /dev/null

    # Create initial active file (default to blue)
    echo "server 127.0.0.1:3000;" | sudo tee /etc/nginx/upstreams/active.conf > /dev/null

    success "Upstream files created successfully"
}

# Function to test nginx configuration
test_nginx_config() {
    log "Testing nginx configuration..."

    if sudo nginx -t; then
        success "Nginx configuration test passed"
        return 0
    else
        error "Nginx configuration test failed"
        return 1
    fi
}

# Function to reload nginx
reload_nginx() {
    log "Reloading nginx service..."

    if sudo systemctl reload nginx; then
        success "Nginx reloaded successfully"
        return 0
    else
        error "Failed to reload nginx"
        return 1
    fi
}

# Function to enable nginx on boot
enable_nginx() {
    log "Enabling nginx to start on boot..."

    if sudo systemctl enable nginx; then
        success "Nginx enabled to start on boot"
    else
        warning "Failed to enable nginx on boot (may already be enabled)"
    fi
}

# Function to check nginx status
check_nginx_status() {
    log "Checking nginx status..."

    if sudo systemctl is-active --quiet nginx; then
        success "Nginx is running"
    else
        warning "Nginx is not running. Starting nginx..."
        sudo systemctl start nginx
    fi
}

# Function to show nginx configuration summary
show_config_summary() {
    log "Nginx configuration summary:"
    echo ""
    echo "📁 Configuration files:"
    echo "  - Main config: /etc/nginx/sites-available/lovable"
    echo "  - Enabled: /etc/nginx/sites-enabled/lovable"
    echo "  - Upstreams: /etc/nginx/upstreams/"
    echo ""
    echo "🌐 Server blocks:"
    echo "  - Production: your-domain.com:80"
    echo "  - Development: dev.your-domain.com:8080"
    echo ""
    echo "🔄 Upstream configuration:"
    echo "  - Blue: 127.0.0.1:3000"
    echo "  - Green: 127.0.0.1:3001"
    echo "  - Active: $(cat /etc/nginx/upstreams/active.conf)"
    echo ""
    echo "📋 Next steps:"
    echo "  1. Update 'your-domain.com' in /etc/nginx/sites-available/lovable with your actual domain"
    echo "  2. Update DNS records to point to this server"
    echo "  3. Run: ./docker/scripts/deploy-blue-green-automated.sh setup"
    echo "  4. Deploy your application: ./docker/scripts/deploy-blue-green-automated.sh deploy latest"
}

# Function to show help
show_help() {
    echo "Nginx Blue-Green Setup Script"
    echo ""
    echo "Usage: $0 [COMMAND]"
    echo ""
    echo "Commands:"
    echo "  setup     Setup nginx for blue-green deployment (default)"
    echo "  status    Show nginx status and configuration"
    echo "  test      Test nginx configuration"
    echo "  reload    Reload nginx configuration"
    echo "  help      Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 setup              # Setup nginx for blue-green deployment"
    echo "  $0 status             # Show current nginx status"
    echo "  $0 test               # Test nginx configuration"
}

# Function to show status
show_status() {
    log "Nginx Blue-Green Status:"
    echo ""

    # Check nginx status
    if sudo systemctl is-active --quiet nginx; then
        echo "🟢 Nginx: Running"
    else
        echo "🔴 Nginx: Not running"
    fi

    # Check configuration files
    echo ""
    echo "📁 Configuration files:"
    if [ -f "/etc/nginx/sites-available/lovable" ]; then
        echo "  ✅ Main config: /etc/nginx/sites-available/lovable"
    else
        echo "  ❌ Main config: /etc/nginx/sites-available/lovable (missing)"
    fi

    if [ -L "/etc/nginx/sites-enabled/lovable" ]; then
        echo "  ✅ Enabled: /etc/nginx/sites-enabled/lovable"
    else
        echo "  ❌ Enabled: /etc/nginx/sites-enabled/lovable (missing)"
    fi

    # Check upstream files
    echo ""
    echo "🔄 Upstream files:"
    if [ -f "/etc/nginx/upstreams/blue.conf" ]; then
        echo "  ✅ Blue: $(cat /etc/nginx/upstreams/blue.conf)"
    else
        echo "  ❌ Blue: /etc/nginx/upstreams/blue.conf (missing)"
    fi

    if [ -f "/etc/nginx/upstreams/green.conf" ]; then
        echo "  ✅ Green: $(cat /etc/nginx/upstreams/green.conf)"
    else
        echo "  ❌ Green: /etc/nginx/upstreams/green.conf (missing)"
    fi

    if [ -f "/etc/nginx/upstreams/active.conf" ]; then
        echo "  ✅ Active: $(cat /etc/nginx/upstreams/active.conf)"
    else
        echo "  ❌ Active: /etc/nginx/upstreams/active.conf (missing)"
    fi

    # Check listening ports
    echo ""
    echo "🌐 Listening ports:"
    sudo netstat -tulpn | grep nginx | awk '{print "  📡 " $1 " " $4}' || echo "  ❌ No nginx ports found"
}

# Main setup function
setup() {
    log "Starting nginx blue-green setup..."

    # Pre-flight checks
    check_root
    check_nginx

    # Setup steps
    backup_nginx_config
    install_nginx_config
    setup_upstream_files

    # Test and reload
    if test_nginx_config; then
        reload_nginx
        enable_nginx
        check_nginx_status
        success "🎉 Nginx blue-green setup completed successfully!"
        show_config_summary
    else
        error "Setup failed due to nginx configuration errors"
        exit 1
    fi
}

# Main script logic
case "${1:-setup}" in
    "setup")
        setup
        ;;
    "status")
        show_status
        ;;
    "test")
        test_nginx_config
        ;;
    "reload")
        if test_nginx_config; then
            reload_nginx
        else
            error "Cannot reload nginx due to configuration errors"
            exit 1
        fi
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
