#!/bin/bash

echo "🔄 Resetting Lovable Docker Environment..."

# Stop and remove all containers, networks, and volumes
docker-compose down -v

# Remove any orphaned containers
docker-compose down --remove-orphans

# Remove the app image to force rebuild
docker rmi lovable-app 2>/dev/null || true

echo "✅ Environment reset complete"
echo ""
echo "🚀 Run ./docker/scripts/start.sh to start fresh"
echo ""
