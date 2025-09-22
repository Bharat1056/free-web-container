#!/bin/bash

# Show logs for all services or specific service
if [ $# -eq 0 ]; then
    echo "📋 Showing logs for all services..."
    docker-compose logs -f
else
    SERVICE=$1
    echo "📋 Showing logs for $SERVICE..."
    docker-compose logs -f $SERVICE
fi
