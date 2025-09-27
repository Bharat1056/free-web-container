# 🚀 **Complete Blue-Green Deployment Setup Guide**

This guide will help you set up **true automated Blue-Green deployment** with zero downtime using Docker, Nginx, and automated scripts.

## 🎯 **What You'll Get**

- **Zero-downtime deployments** - Users never see downtime
- **Automatic rollback** - If new deployment fails, automatically rolls back
- **Health checks** - Ensures new deployment is healthy before switching
- **Blue-Green switching** - Seamlessly switches between blue and green environments
- **Automated CI/CD** - GitHub Actions triggers deployments automatically

---

## 📋 **Prerequisites**

- VPS with Docker and Docker Compose installed
- Nginx installed on the system (not in Docker)
- Domain name configured to point to your VPS
- GitHub repository with secrets configured

---

## 🛠️ **Step 1: Initial VPS Setup**

### 1.1 Install Required Software

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Install Nginx
sudo apt install nginx -y

# Install Git
sudo apt install git -y
```

### 1.2 Clone Your Repository

```bash
# Clone your repository
git clone https://github.com/yourusername/your-repo.git
cd your-repo

# Make scripts executable
chmod +x docker/scripts/*.sh
```

---

## 🔧 **Step 2: Configure Nginx for Blue-Green**

### 2.1 Update Domain Names

Edit `docker/instructions/nginx-lovable.conf` and replace:

- `your-domain.com` with your actual production domain
- `dev.your-domain.com` with your actual development domain

### 2.2 Setup Nginx Configuration

```bash
# Run the nginx setup script
./docker/scripts/setup-nginx-blue-green.sh setup

# Check nginx status
./docker/scripts/setup-nginx-blue-green.sh status
```

### 2.3 Configure DNS

Update your DNS records:

```
your-domain.com → YOUR_VPS_IP
dev.your-domain.com → YOUR_VPS_IP
```

---

## 🐳 **Step 3: Configure Environment Variables**

### 3.1 Create Environment Files

```bash
# Copy template files
cp docker/instructions/env.prod.template .env.prod
cp docker/instructions/env.dev.template .env.dev

# Edit the files with your actual values
nano .env.prod
nano .env.dev
```

### 3.2 Required Environment Variables

Make sure these are set in your `.env.prod` and `.env.dev` files:

```bash
# Database
MYSQL_ROOT_PASSWORD=your_secure_password
MYSQL_DATABASE=your_database_name
MYSQL_USER=your_db_user
MYSQL_PASSWORD=your_db_password
DATABASE_URL=mysql://user:password@localhost:3306/database

# API Keys
GROQ_API_KEY=your_groq_key
GEMINI_API_KEY=your_gemini_key
OPENAI_API_KEY=your_openai_key
E2B_API_KEY=your_e2b_key

# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
CLERK_SECRET_KEY=your_clerk_secret_key

# Inngest
INNGEST_BASE_URL=your_inngest_url
INNGEST_EVENT_KEY=your_inngest_event_key
INNGEST_SIGNING_KEY=your_inngest_signing_key
```

---

## 🚀 **Step 4: Deploy Your Application**

### 4.1 Initial Deployment

```bash
# Deploy to blue environment (production)
./docker/scripts/deploy-blue-green-automated.sh deploy latest

# Check deployment status
./docker/scripts/deploy-blue-green-automated.sh status
```

### 4.2 Verify Deployment

```bash
# Test production
curl http://your-domain.com/api/health

# Test development (if deployed)
curl http://dev.your-domain.com:8080/api/health
```

---

## 🔄 **Step 5: Configure GitHub Actions**

### 5.1 GitHub Secrets

Add these secrets to your GitHub repository:

```
# Docker Hub
DOCKERHUB_USERNAME=your_dockerhub_username
DOCKERHUB_TOKEN=your_dockerhub_token

# VPS Access
VPS_HOST=your_vps_ip
VPS_USER=your_vps_username
VPS_SSH_PRIVATE_KEY=your_ssh_private_key
VPS_PROJECT_PATH=/path/to/your/project

# Application Secrets (same as .env files)
MYSQL_ROOT_PASSWORD=your_secure_password
MYSQL_DATABASE=your_database_name
MYSQL_USER=your_db_user
MYSQL_PASSWORD=your_db_password
DATABASE_URL=mysql://user:password@localhost:3306/database
GROQ_API_KEY=your_groq_key
GEMINI_API_KEY=your_gemini_key
OPENAI_API_KEY=your_openai_key
E2B_API_KEY=your_e2b_key
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
CLERK_SECRET_KEY=your_clerk_secret_key
INNGEST_BASE_URL=your_inngest_url
INNGEST_EVENT_KEY=your_inngest_event_key
INNGEST_SIGNING_KEY=your_inngest_signing_key
```

### 5.2 Test GitHub Actions

```bash
# Push to main branch (triggers production deployment)
git add .
git commit -m "Test production deployment"
git push origin main

# Push to dev branch (triggers development deployment)
git checkout dev
git add .
git commit -m "Test development deployment"
git push origin dev
```

---

## 🎯 **How Blue-Green Deployment Works**

### **Deployment Flow:**

1. **Current State**: Blue environment is active (port 3000)
2. **New Deployment**: Green environment starts (port 3001)
3. **Health Check**: Script waits for green to be healthy
4. **Traffic Switch**: Nginx switches from blue to green
5. **Cleanup**: Old blue containers are removed
6. **Next Deployment**: Green becomes old, new blue is deployed

### **Rollback Flow:**

1. **Deployment Fails**: Green environment fails health checks
2. **Automatic Rollback**: Script switches back to blue
3. **Cleanup**: Failed green containers are removed
4. **Status**: Blue remains active, deployment failed safely

---

## 🛠️ **Management Commands**

### **Deployment Commands:**

```bash
# Deploy latest version
./docker/scripts/deploy-blue-green-automated.sh deploy latest

# Deploy specific version
./docker/scripts/deploy-blue-green-automated.sh deploy v1.2.3

# Check deployment status
./docker/scripts/deploy-blue-green-automated.sh status
```

### **Nginx Commands:**

```bash
# Setup nginx
./docker/scripts/setup-nginx-blue-green.sh setup

# Check nginx status
./docker/scripts/setup-nginx-blue-green.sh status

# Test nginx configuration
./docker/scripts/setup-nginx-blue-green.sh test

# Reload nginx
./docker/scripts/setup-nginx-blue-green.sh reload
```

### **Manual Container Management:**

```bash
# View running containers
docker ps

# View container logs
docker logs lovable_blue
docker logs lovable_green

# Stop all containers
docker stop $(docker ps -q)

# Remove all containers
docker rm $(docker ps -aq)
```

---

## 🔍 **Troubleshooting**

### **Common Issues:**

1. **Nginx not starting:**

   ```bash
   sudo nginx -t  # Test configuration
   sudo systemctl status nginx  # Check status
   sudo journalctl -u nginx  # View logs
   ```

2. **Container health check failing:**

   ```bash
   docker logs lovable_blue  # Check logs
   curl http://localhost:3000/api/health  # Test health endpoint
   ```

3. **Port conflicts:**

   ```bash
   sudo netstat -tulpn | grep :3000  # Check port usage
   sudo lsof -i :3000  # Check what's using port
   ```

4. **DNS not resolving:**
   ```bash
   nslookup your-domain.com  # Test DNS resolution
   dig your-domain.com  # Detailed DNS info
   ```

### **Log Locations:**

- **Nginx logs**: `/var/log/nginx/access.log` and `/var/log/nginx/error.log`
- **Container logs**: `docker logs container_name`
- **System logs**: `sudo journalctl -u nginx`

---

## 🎉 **Success Indicators**

You'll know everything is working when:

✅ **Nginx is running** and listening on ports 80 and 8080
✅ **Health checks pass** for both environments
✅ **DNS resolves** to your VPS IP
✅ **GitHub Actions** deploy successfully
✅ **Zero downtime** during deployments
✅ **Automatic rollback** works on failures

---

## 📞 **Support**

If you encounter issues:

1. Check the logs using the commands above
2. Verify all environment variables are set correctly
3. Ensure DNS is pointing to your VPS
4. Test nginx configuration with `sudo nginx -t`
5. Check container health with `curl http://localhost:PORT/api/health`

---

## 🚀 **Next Steps**

Once your blue-green deployment is working:

1. **Set up SSL certificates** with Let's Encrypt
2. **Configure monitoring** and alerting
3. **Set up database backups**
4. **Implement staging environment**
5. **Add performance monitoring**

**Congratulations! You now have a production-ready, zero-downtime deployment system!** 🎉
