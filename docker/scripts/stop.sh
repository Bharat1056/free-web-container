#!/bin/bash

echo "🛑 Stopping Lovable Docker Environment..."

# Stop all services
docker-compose down

echo "✅ All services stopped"
echo ""
echo "💡 To remove all data (including database), run:"
echo "   docker-compose down -v"
echo ""
