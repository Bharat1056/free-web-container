# Docker Setup for Lovable

This directory contains Docker configuration for running the Lovable application with MySQL, Next.js, and Inngest services.

## Quick Start

1. **Copy environment variables:**

   ```bash
   cp env.example .env
   ```

2. **Update your API keys in `.env`:**

   - Add your Clerk authentication keys
   - Add your Groq API key
   - Add your E2B API key
   - Add your Inngest keys

3. **Start all services:**

   ```bash
   ./docker/scripts/start.sh
   ```

4. **Access your application:**
   - Next.js App: http://localhost:3000
   - Inngest Dev Server: http://localhost:8288
   - MySQL: localhost:3306

## Services

### MySQL Database

- **Port:** 3306
- **Database:** lovable
- **User:** lovable
- **Password:** lovablepassword
- **Root Password:** rootpassword

### Next.js Application

- **Port:** 3000
- **Hot Reload:** Enabled
- **Environment:** Development

### Inngest Dev Server

- **Port:** 8288
- **Connects to:** http://app:3000/api/inngest
- **Based on:** [Inngest Docker Documentation](https://www.inngest.com/docs/guides/development-with-docker)

## Scripts

### `./docker/scripts/start.sh`

Starts all services and checks their health.

### `./docker/scripts/stop.sh`

Stops all services gracefully.

### `./docker/scripts/reset.sh`

Stops all services and removes all data (including database).

### `./docker/scripts/logs.sh [service]`

Shows logs for all services or a specific service.

## Manual Commands

### Start services

```bash
docker-compose up -d
```

### Stop services

```bash
docker-compose down
```

### View logs

```bash
docker-compose logs -f app      # App logs
docker-compose logs -f inngest  # Inngest logs
docker-compose logs -f mysql    # MySQL logs
```

### Reset everything

```bash
docker-compose down -v
```

## Database Management

### Run Prisma migrations

```bash
docker-compose exec app npx prisma migrate dev
```

### Access MySQL directly

```bash
docker-compose exec mysql mysql -u lovable -p lovable
```

### Reset database

```bash
docker-compose down -v
docker-compose up -d
```

## Troubleshooting

### Services not starting

1. Check if Docker is running
2. Check if ports 3000, 3306, 8288 are available
3. View logs: `./docker/scripts/logs.sh`

### Database connection issues

1. Wait for MySQL to be ready (health check)
2. Check DATABASE_URL in .env
3. Verify MySQL logs: `docker-compose logs mysql`

### Inngest not connecting

1. Check INNGEST_DEV=1 in environment
2. Verify INNGEST_BASE_URL points to http://inngest:8288
3. Check Inngest logs: `docker-compose logs inngest`

## Environment Variables

Key environment variables for Docker setup:

- `DATABASE_URL`: MySQL connection string
- `INNGEST_DEV=1`: Enables Inngest dev mode
- `INNGEST_BASE_URL`: Points to Inngest service
- `NODE_ENV=development`: Development mode

## Production Considerations

For production deployment:

1. Change default passwords
2. Use proper secrets management
3. Configure proper networking
4. Set up monitoring and logging
5. Use production-grade MySQL configuration
