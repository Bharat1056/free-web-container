#!/bin/bash

# Smart Docker Compose script that switches between dev and prod
# Usage: ./docker-compose.sh up -d dev    # Start development
#        ./docker-compose.sh up -d prod   # Start production
#        ./docker-compose.sh down dev     # Stop development
#        ./docker-compose.sh down prod    # Stop production

# Check if at least 2 arguments are provided
if [ $# -lt 2 ]; then
    echo "❌ Usage: $0 <command> <environment>"
    echo ""
    echo "Commands:"
    echo "  up -d    Start services"
    echo "  down     Stop services"
    echo "  logs     View logs"
    echo "  ps       Show status"
    echo ""
    echo "Environments:"
    echo "  dev      Development environment"
    echo "  prod     Production environment"
    echo ""
    echo "Examples:"
    echo "  $0 up -d dev     # Start development"
    echo "  $0 up -d prod    # Start production"
    echo "  $0 down dev      # Stop development"
    echo "  $0 down prod     # Stop production"
    echo "  $0 logs dev      # View development logs"
    exit 1
fi

# Extract command and environment
COMMAND="$1"
ENVIRONMENT="$2"

# Handle "up -d" command
if [ "$COMMAND" = "up" ] && [ "$3" = "-d" ]; then
    COMMAND="up -d"
fi

# Determine which compose file and env file to use
if [ "$ENVIRONMENT" = "dev" ]; then
    COMPOSE_FILE="docker-compose.dev.yml"
    ENV_FILE=".env.dev"
    echo "🚀 Starting Development Environment..."
elif [ "$ENVIRONMENT" = "prod" ]; then
    COMPOSE_FILE="docker-compose.prod.yml"
    ENV_FILE=".env.prod"
    echo "🚀 Starting Production Environment..."
else
    echo "❌ Invalid environment: $ENVIRONMENT"
    echo "   Use 'dev' or 'prod'"
    exit 1
fi

# Check if environment file exists
if [ ! -f "$ENV_FILE" ]; then
    echo "❌ Environment file $ENV_FILE not found!"
    echo "   Please create it from the example file."
    exit 1
fi

# Execute the docker-compose command
echo "📋 Using: $COMPOSE_FILE with $ENV_FILE"
echo "🔧 Command: docker-compose -f $COMPOSE_FILE --env-file $ENV_FILE $COMMAND"
echo ""

docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" $COMMAND

# Show helpful info after starting services
if [ "$COMMAND" = "up -d" ]; then
    echo ""
    echo "✅ Services started successfully!"
    echo ""
    echo "📱 Next.js App: http://localhost:3000"
    echo "⚡ Inngest: http://localhost:8288"
    echo "🗄️  MySQL: localhost:3306"
    echo ""
    echo "📋 Useful commands:"
    echo "  $0 logs $ENVIRONMENT     # View logs"
    echo "  $0 ps $ENVIRONMENT       # Show status"
    echo "  $0 down $ENVIRONMENT     # Stop services"
fi
