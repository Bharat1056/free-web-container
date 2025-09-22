#!/bin/bash

# Start all services
echo "🚀 Starting Lovable Docker Environment..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating .env file from .env.example..."
    cp .env.example .env
    echo "⚠️  Please update .env file with your actual API keys before running the app."
fi

# Start services
docker-compose up -d

# Wait for services to be ready
echo "⏳ Waiting for services to start..."
sleep 10

# Check service health
echo "🔍 Checking service health..."

# Check MySQL
if docker-compose exec mysql mysqladmin ping -h localhost --silent; then
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
echo "🎉 Services are starting up!"
echo ""
echo "📱 Next.js App: http://localhost:3000"
echo "⚡ Inngest Dev Server: http://localhost:8288"
echo "🗄️  MySQL: localhost:3306"
echo ""
echo "📋 Useful commands:"
echo "  docker-compose logs -f app     # View app logs"
echo "  docker-compose logs -f inngest # View Inngest logs"
echo "  docker-compose logs -f mysql   # View MySQL logs"
echo "  docker-compose down            # Stop all services"
echo ""
