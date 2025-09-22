#!/bin/bash

# Start production services
echo "🚀 Starting Lovable Production Environment..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Check if .env.prod exists
if [ ! -f .env.prod ]; then
    echo "📝 Creating .env.prod file from env.prod..."
    cp env.prod .env.prod
    echo "⚠️  Please update .env.prod file with your production values before running!"
    echo "   - Change all passwords to secure values"
    echo "   - Update API keys to production keys"
    echo "   - Set correct domain URLs"
    exit 1
fi

# Start production services
docker-compose -f docker-compose.prod.yml --env-file .env.prod up -d

# Wait for services to be ready
echo "⏳ Waiting for services to start..."
sleep 15

# Check service health
echo "🔍 Checking service health..."

# Check MySQL
if docker-compose -f docker-compose.prod.yml exec mysql mysqladmin ping -h localhost --silent; then
    echo "✅ MySQL is ready"
else
    echo "❌ MySQL is not ready"
fi

# Check Next.js app
if curl -f http://localhost:3000 > /dev/null 2>&1; then
    echo "✅ Next.js app is ready"
else
    echo "⏳ Next.js app is starting..."
fi

# Check Inngest
if curl -f http://localhost:8288 > /dev/null 2>&1; then
    echo "✅ Inngest is ready"
else
    echo "⏳ Inngest is starting..."
fi

echo ""
echo "🎉 Production services are running!"
echo ""
echo "📱 Next.js App: http://localhost:3000"
echo "⚡ Inngest: http://localhost:8288"
echo "🗄️  MySQL: localhost:3306"
echo ""
echo "📋 Useful commands:"
echo "  docker-compose -f docker-compose.prod.yml logs -f app     # View app logs"
echo "  docker-compose -f docker-compose.prod.yml logs -f inngest # View Inngest logs"
echo "  docker-compose -f docker-compose.prod.yml logs -f mysql   # View MySQL logs"
echo "  docker-compose -f docker-compose.prod.yml down            # Stop all services"
echo ""
