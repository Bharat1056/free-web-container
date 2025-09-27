# Docker Deployment Guide

Complete guide for setting up and deploying the Lovable application using Docker with blue-green deployment strategy.

## 📁 Directory Structure

```
docker/
├── instructions/          # Configuration files and templates
│   ├── Dockerfile                 # Production Docker image
│   ├── Dockerfile.dev             # Development Docker image
│   ├── docker-compose.app.yml     # Production compose file
│   ├── docker-compose.dev.yml     # Development compose file
│   ├── nginx-lovable.conf         # Unified nginx config (dev + prod)
│   ├── env.prod.template          # Production environment template
│   └── env.dev.template           # Development environment template
├── scripts/               # Deployment and management scripts
│   └── deploy-blue-green-automated.sh  # Automated blue-green deployment script
└── README.md             # This file
```

## 🏗️ Architecture Overview

### Production Environment

```
┌─────────────────────────────────────┐
│  System Nginx (Port 80)            │ ← Always running
│  ┌─────────────────────────────────┐│
│  │  Blue Environment (Port 3000)  ││ ← Can be stopped/started
│  │  Green Environment (Port 3001) ││ ← Can be stopped/started
│  └─────────────────────────────────┘│
└─────────────────────────────────────┘
```

### Development Environment

```
┌─────────────────────────────────────┐
│  System Nginx (Port 8080)          │ ← Always running
│  ┌─────────────────────────────────┐│
│  │  Blue Environment (Port 3000)  ││ ← Can be stopped/started
│  │  Green Environment (Port 3001) ││ ← Can be stopped/started
│  └─────────────────────────────────┘│
└─────────────────────────────────────┘
```

## 🐳 Docker Hub Configuration

This project uses Docker Hub to store and distribute container images for faster deployments.

### Required GitHub Secrets

Add these secrets to your GitHub repository (Settings → Secrets and variables → Actions):

#### Docker Hub Authentication:

- **`DOCKERHUB_USERNAME`** - Your Docker Hub username
- **`DOCKERHUB_TOKEN`** - Your Docker Hub access token (not password!)

#### VPS Connection:

- **`VPS_SSH_PRIVATE_KEY`** - Your private SSH key for VPS access
- **`VPS_HOST`** - Your VPS IP address or domain
- **`VPS_USER`** - SSH username for your VPS
- **`VPS_PROJECT_PATH`** - Full path to your project directory on VPS

#### Production Environment Secrets:

- **`MYSQL_ROOT_PASSWORD`** - MySQL root password
- **`MYSQL_DATABASE`** - Database name (e.g., `lovable_prod`)
- **`MYSQL_USER`** - MySQL username
- **`MYSQL_PASSWORD`** - MySQL user password
- **`DATABASE_URL`** - Full database connection string
- **`GROQ_API_KEY`** - Your Groq API key
- **`GEMINI_API_KEY`** - Your Google Gemini API key
- **`OPENAI_API_KEY`** - Your OpenAI API key
- **`E2B_API_KEY`** - Your E2B API key
- **`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`** - Clerk publishable key
- **`CLERK_SECRET_KEY`** - Clerk secret key
- **`INNGEST_BASE_URL`** - Inngest base URL
- **`INNGEST_EVENT_KEY`** - Inngest event key
- **`INNGEST_SIGNING_KEY`** - Inngest signing key

#### Development Environment Secrets (Optional - can reuse prod keys):

- **`MYSQL_ROOT_PASSWORD_DEV`** - Dev MySQL root password
- **`MYSQL_DATABASE_DEV`** - Dev database name (e.g., `lovable_dev`)
- **`MYSQL_USER_DEV`** - Dev MySQL username
- **`MYSQL_PASSWORD_DEV`** - Dev MySQL user password
- **`DATABASE_URL_DEV`** - Dev database connection string
- **`GROQ_API_KEY_DEV`** - Dev Groq API key
- **`GEMINI_API_KEY_DEV`** - Dev Gemini API key
- **`OPENAI_API_KEY_DEV`** - Dev OpenAI API key
- **`E2B_API_KEY_DEV`** - Dev E2B API key
- **`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY_DEV`** - Dev Clerk publishable key
- **`CLERK_SECRET_KEY_DEV`** - Dev Clerk secret key
- **`INNGEST_EVENT_KEY_DEV`** - Dev Inngest event key
- **`INNGEST_SIGNING_KEY_DEV`** - Dev Inngest signing key

## 🚀 How It Works

### Production Deployment (main branch):

1. **Build**: GitHub Actions builds the Docker image using `docker/instructions/Dockerfile`
2. **Push**: Image is pushed to Docker Hub as `yourusername/lovable:latest`
3. **Deploy**: VPS pulls the image and starts containers
4. **Result**: Faster deployment, no building on VPS

### Development Deployment (dev branch):

1. **Build**: GitHub Actions builds the Docker image using `docker/instructions/Dockerfile.dev`
2. **Push**: Image is pushed to Docker Hub as `yourusername/lovable-dev:dev`
3. **Deploy**: VPS pulls the image and starts containers with hot reload
4. **Result**: Development environment with live code changes

## 📋 Prerequisites

- Ubuntu/Debian VPS with Docker and Docker Compose installed
- Domain name pointing to your VPS
- SSL certificate (optional but recommended)
- Docker Hub account

## 🔧 Setup Steps

### 1. Install System Nginx

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install nginx
sudo apt install nginx -y

# Enable and start nginx
sudo systemctl enable nginx
sudo systemctl start nginx
```

### 2. Configure Nginx

```bash
# Copy the unified nginx configuration (works for both dev and prod)
sudo cp docker/instructions/nginx-lovable.conf /etc/nginx/sites-available/lovable

# Edit the configuration to match your domains
sudo nano /etc/nginx/sites-available/lovable
# Change 'your-domain.com' to your actual production domain
# Change 'dev.your-domain.com' to your actual development domain

# Enable the site
sudo ln -s /etc/nginx/sites-available/lovable /etc/nginx/sites-enabled/

# Remove default nginx site
sudo rm -f /etc/nginx/sites-enabled/default

# Test nginx configuration
sudo nginx -t

# Reload nginx
sudo systemctl reload nginx
```

### 3. Setup Environment Files

#### For Production:

```bash
# Copy the production template
cp docker/instructions/env.prod.template .env.prod

# Edit with your actual values
nano .env.prod
# Fill in all your API keys, passwords, etc.
```

#### For Development:

```bash
# Copy the development template
cp docker/instructions/env.dev.template .env.dev

# Edit with your actual values
nano .env.dev
# Fill in all your API keys, passwords, etc.
```

### 4. Make Deployment Script Executable

```bash
chmod +x docker/scripts/deploy-blue-green-automated.sh
```

### 5. Initial Deployment

#### For Production:

```bash
# Deploy to blue environment first
./docker/scripts/deploy-blue-green-automated.sh deploy prod blue

# Check status
./docker/scripts/deploy-blue-green-automated.sh status
```

#### For Development:

```bash
# Deploy to blue environment first
./docker/scripts/deploy-blue-green-automated.sh deploy dev blue

# Check status
./docker/scripts/deploy-blue-green-automated.sh status
```

## 🔄 Blue-Green Deployment

The deployment script supports zero-downtime deployments with automatic health checks and traffic switching.

### Manual Deployment

#### Production:

```bash
# Deploy to blue environment
./docker/scripts/deploy-blue-green-automated.sh deploy prod blue

# Deploy to green environment
./docker/scripts/deploy-blue-green-automated.sh deploy prod green

# Check current status
./docker/scripts/deploy-blue-green-automated.sh status
```

#### Development:

```bash
# Deploy to blue environment
./docker/scripts/deploy-blue-green-automated.sh deploy dev blue

# Deploy to green environment
./docker/scripts/deploy-blue-green-automated.sh deploy dev green

# Check current status
./docker/scripts/deploy-blue-green-automated.sh status
```

### Automated Deployment (GitHub Actions)

The deployment script can be integrated into your GitHub Actions workflow:

```yaml
- name: Deploy with Blue-Green Strategy
  run: |
    ssh ${{ secrets.VPS_USER }}@${{ secrets.VPS_HOST }} << 'EOF'
      cd ${{ secrets.VPS_PROJECT_PATH }}

      # Auto-detect and deploy to opposite environment
      ./docker/scripts/deploy-blue-green-automated.sh deploy prod
    EOF
```

## 🌐 Port Configuration

### Development Environment

- **App**: 3000/3001 (blue/green)
- **MySQL**: 3307
- **Inngest**: 8289
- **Nginx**: 8080

### Production Environment

- **App**: 3000/3001 (blue/green)
- **MySQL**: 3306
- **Inngest**: 8288
- **Nginx**: 80

## 🔍 Monitoring and Logs

### View Application Logs

```bash
# View logs for specific environment
docker logs -f lovable-app-blue
docker logs -f lovable-app-green

# View all logs
docker-compose -f docker/instructions/docker-compose.app.yml logs -f
```

### View Nginx Logs

```bash
# Access logs
sudo tail -f /var/log/nginx/access.log

# Error logs
sudo tail -f /var/log/nginx/error.log
```

### View Deployment Logs

```bash
# Deployment script logs
tail -f /var/log/lovable-deployment.log
```

## 🚨 Troubleshooting

### Common Issues

1. **Port already in use**

```bash
   # Check what's using the port
   sudo netstat -tulpn | grep :3000

   # Kill the process
   sudo kill -9 <PID>
```

2. **Nginx config test fails**

```bash
   # Test nginx config
   sudo nginx -t

   # Check for syntax errors
   sudo nginx -T
```

3. **Health check fails**

```bash
   # Test health endpoint manually
   curl -f http://localhost:3000/api/health
   curl -f http://localhost:3001/api/health
```

4. **Database connection issues**
   ```bash
   # Check MySQL container
   docker logs lovable-mysql-blue
   docker logs lovable-mysql-green
   ```

### Rollback Procedure

If a deployment fails, you can quickly rollback:

```bash
# Check current status
./docker/scripts/deploy-blue-green-automated.sh status

# If green is active and failing, switch back to blue
./docker/scripts/deploy-blue-green-automated.sh deploy prod blue

# If blue is active and failing, switch to green
./docker/scripts/deploy-blue-green-automated.sh deploy prod green
```

## 🔒 Security Considerations

1. **Firewall Configuration**

```bash
   # Only allow necessary ports
   sudo ufw allow 22    # SSH
   sudo ufw allow 80    # HTTP
   sudo ufw allow 443   # HTTPS
   sudo ufw enable
```

2. **SSL Certificate (Recommended)**

```bash
   # Install Certbot
   sudo apt install certbot python3-certbot-nginx -y

   # Get SSL certificate
   sudo certbot --nginx -d your-domain.com
```

3. **Environment Variables**
   - Never commit `.env.prod` to version control
   - Use strong passwords for database
   - Rotate API keys regularly

## 📊 Performance Monitoring

### Health Check Endpoint

The application includes a health check endpoint at `/api/health` that returns:

```json
{
  "database": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 3600,
  "environment": "production",
  "version": "1704067200"
}
```

### Monitoring Commands

```bash
# Check system resources
htop

# Check Docker resource usage
docker stats

# Check nginx status
sudo systemctl status nginx

# Check application status
./docker/scripts/deploy-blue-green-automated.sh status
```

## 🏷️ Docker Hub Image Tags

- **Production**: `yourusername/lovable:latest`
- **Development**: `yourusername/lovable-dev:dev`
- **Branch-specific**: `yourusername/lovable:main-abc123` (for specific commits)

## 📊 Benefits of This Setup

1. **Zero Downtime**: Users never experience service interruption
2. **Quick Rollback**: Can instantly switch back to previous version
3. **Health Monitoring**: Automatic health checks before traffic switching
4. **Resource Efficient**: Only one environment runs at a time
5. **Easy Management**: Simple commands for deployment and monitoring
6. **Faster Deployments**: No building on VPS
7. **Consistent Images**: Same image across environments
8. **Better Caching**: Docker layer caching in GitHub Actions
9. **Version Control**: Tagged images for rollbacks
10. **Parallel Deployments**: Can deploy multiple environments simultaneously

## 🚨 Important Notes

- Make sure your VPS has enough disk space for Docker images
- The first deployment will be slower as it downloads the base images
- Subsequent deployments will be much faster due to layer caching
- Your Docker Hub account has storage limits (check your plan)
- Never commit `.env.prod` or `.env.dev` files
- Use strong passwords for production
- Regularly rotate API keys
- Keep Docker images updated
- Monitor deployment logs for security issues

## 📞 Support

If you encounter any issues:

1. Check the deployment logs: `/var/log/lovable-deployment.log`
2. Check nginx logs: `/var/log/nginx/error.log`
3. Check application logs: `docker logs <container-name>`
4. Verify environment variables are set correctly
5. Ensure all required ports are available

---

**Happy Deploying! 🚀**
