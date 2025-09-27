# GitHub Secrets Template for Development Environment

This template shows all the GitHub secrets you need to configure for your development environment deployment. Add these secrets to your GitHub repository under **Settings → Environments → development**.

## 🔐 Required Environment Secrets for Development Environment

### Docker Hub Authentication

```
DOCKERHUB_USERNAME=your_dockerhub_username
DOCKERHUB_TOKEN=your_dockerhub_access_token
```

### VPS Connection

```
VPS_SSH_PRIVATE_KEY=your_private_ssh_key_for_vps_access
VPS_HOST=your_vps_ip_address_or_domain
VPS_USER=ssh_username_for_your_vps
VPS_PROJECT_PATH=full_path_to_your_project_directory_on_vps
```

### Development Database Configuration

```
MYSQL_ROOT_PASSWORD=your_dev_mysql_root_password
MYSQL_DATABASE=lovable_dev
MYSQL_USER=your_dev_mysql_username
MYSQL_PASSWORD=your_dev_mysql_user_password
DATABASE_URL=mysql://username:password@localhost:3307/lovable_dev
```

### Development API Keys

```
GROQ_API_KEY=your_groq_api_key_for_dev
GEMINI_API_KEY=your_google_gemini_api_key_for_dev
OPENAI_API_KEY=your_openai_api_key_for_dev
E2B_API_KEY=your_e2b_api_key_for_dev
```

### Development Authentication (Clerk)

```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key_for_dev
CLERK_SECRET_KEY=your_clerk_secret_key_for_dev
```

### Development Inngest Configuration

```
INNGEST_EVENT_KEY=your_inngest_event_key_for_dev
INNGEST_SIGNING_KEY=your_inngest_signing_key_for_dev
```

## 📝 How to Add These Secrets

1. Go to your GitHub repository
2. Click on **Settings** tab
3. In the left sidebar, click **Environments**
4. Click **New environment** and name it `development`
5. In the development environment, click **Add secret**
6. Add each secret with the exact name and value from the template above

## 🔄 Production Environment

For production deployment, create a separate `production` environment with the same secret names but production values:

```
# Production Environment Secrets (same names, different values):
MYSQL_ROOT_PASSWORD=your_prod_mysql_root_password
MYSQL_DATABASE=lovable_prod
MYSQL_USER=your_prod_mysql_username
MYSQL_PASSWORD=your_prod_mysql_user_password
DATABASE_URL=mysql://username:password@localhost:3306/lovable_prod
GROQ_API_KEY=your_prod_groq_api_key
GEMINI_API_KEY=your_prod_gemini_api_key
OPENAI_API_KEY=your_prod_openai_api_key
E2B_API_KEY=your_prod_e2b_api_key
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_prod_clerk_publishable_key
CLERK_SECRET_KEY=your_prod_clerk_secret_key
INNGEST_EVENT_KEY=your_prod_inngest_event_key
INNGEST_SIGNING_KEY=your_prod_inngest_signing_key
```

## 🚀 Development Environment Details

Your development environment will run on:

- **Next.js App**: Port 3001 (http://your-vps:3001)
- **Inngest Dev Server**: Port 8289 (http://your-vps:8289)
- **MySQL Database**: Port 3307
- **Hot Reload**: Enabled for development

## ⚠️ Security Notes

- Never commit actual secret values to your repository
- Use strong, unique passwords for database credentials
- Consider using separate API keys for development and production
- Regularly rotate your secrets and API keys
- Keep your VPS SSH private key secure and never share it

## 🔧 Troubleshooting

If deployment fails, check:

1. All required secrets are properly set in GitHub
2. VPS SSH access is working
3. Docker Hub credentials are correct
4. Database connection strings are properly formatted
5. API keys are valid and have proper permissions
