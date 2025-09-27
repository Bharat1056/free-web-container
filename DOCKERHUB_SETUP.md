# Docker Hub Setup Guide

## 🐳 Docker Hub Configuration

This project now uses Docker Hub to store and distribute container images. Here's how to set it up:

## 📋 Required GitHub Secrets

Add these secrets to your GitHub repository (Settings → Secrets and variables → Actions):

### Docker Hub Authentication:

- **`DOCKERHUB_USERNAME`** - Your Docker Hub username
- **`DOCKERHUB_TOKEN`** - Your Docker Hub access token (not password!)

### VPS Connection (same as before):

- **`VPS_SSH_PRIVATE_KEY`** - Your private SSH key for VPS access
- **`VPS_HOST`** - Your VPS IP address or domain
- **`VPS_USER`** - SSH username for your VPS
- **`VPS_PROJECT_PATH`** - Full path to your project directory on VPS

### Production Environment Secrets:

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

### Development Environment Secrets (Optional - can reuse prod keys):

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

## 🚀 How It Works Now

### Production Deployment (main branch):

1. **Build**: GitHub Actions builds the Docker image using `Dockerfile`
2. **Push**: Image is pushed to Docker Hub as `yourusername/lovable:latest`
3. **Deploy**: VPS pulls the image and starts containers
4. **Result**: Faster deployment, no building on VPS

### Development Deployment (dev branch):

1. **Build**: GitHub Actions builds the Docker image using `Dockerfile.dev`
2. **Push**: Image is pushed to Docker Hub as `yourusername/lovable-dev:dev`
3. **Deploy**: VPS pulls the image and starts containers with hot reload
4. **Result**: Development environment with live code changes

## 🔧 Docker Hub Setup Steps

1. **Create Docker Hub Account**: Go to [hub.docker.com](https://hub.docker.com) and create an account
2. **Create Access Token**:
   - Go to Account Settings → Security
   - Click "New Access Token"
   - Give it a name (e.g., "GitHub Actions")
   - Copy the token (you won't see it again!)
3. **Add Secrets to GitHub**:
   - Go to your GitHub repository
   - Settings → Secrets and variables → Actions
   - Add `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN`

## 📊 Benefits of This Approach

- ✅ **Faster Deployments**: No building on VPS
- ✅ **Consistent Images**: Same image across environments
- ✅ **Better Caching**: Docker layer caching in GitHub Actions
- ✅ **Version Control**: Tagged images for rollbacks
- ✅ **Resource Efficient**: Less CPU/memory usage on VPS
- ✅ **Parallel Deployments**: Can deploy multiple environments simultaneously

## 🏷️ Image Tags

- **Production**: `yourusername/lovable:latest`
- **Development**: `yourusername/lovable-dev:dev`
- **Branch-specific**: `yourusername/lovable:main-abc123` (for specific commits)

## 🔄 Rollback Strategy

If you need to rollback:

1. Go to Docker Hub and find the previous working image
2. Update the docker-compose file to use the specific tag
3. Redeploy

## 🚨 Important Notes

- Make sure your VPS has enough disk space for Docker images
- The first deployment will be slower as it downloads the base images
- Subsequent deployments will be much faster due to layer caching
- Your Docker Hub account has storage limits (check your plan)
