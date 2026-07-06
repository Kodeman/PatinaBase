# =============================================================================
# PATINA DEPLOYMENT - COOLIFY QUICK START GUIDE
# =============================================================================
#
# This guide walks through deploying the entire Patina stack on Coolify
# with Cloudflare Tunnel routing for patina.cloud
# =============================================================================

## Table of Contents
1. [Prerequisites](#1-prerequisites)
2. [Cloudflare Setup](#2-cloudflare-setup)
3. [Generate Secrets](#3-generate-secrets)
4. [Deploy Supabase](#4-deploy-supabase)
5. [Deploy Backend Services](#5-deploy-backend-services)
6. [Deploy Frontend Apps](#6-deploy-frontend-apps)
7. [Configure iOS App](#7-configure-ios-app)
8. [Verification & Testing](#8-verification--testing)
9. [Monitoring & Maintenance](#9-monitoring--maintenance)

---

## 1. Prerequisites

### Hardware Requirements (Minimum)
| Resource | Minimum | Recommended |
|----------|---------|-------------|
| CPU | 4 cores | 8 cores |
| RAM | 16 GB | 32 GB |
| Storage | 100 GB SSD | 250 GB NVMe |

### Software Requirements
- [ ] Proxmox VE installed and running
- [ ] Coolify installed (v4.x recommended)
- [ ] Cloudflare account with patina.cloud domain
- [ ] GitHub account (for frontend Git deployments)

### Access Requirements
- [ ] Coolify admin access
- [ ] Cloudflare dashboard access
- [ ] GitHub repository access (if using Git deployments)

---

## 2. Cloudflare Setup

### 2.1 Create Cloudflare Tunnel

```bash
# On your Proxmox host (or dedicated LXC container)

# Install cloudflared
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared
chmod +x /usr/local/bin/cloudflared

# Login to Cloudflare
cloudflared tunnel login

# Create the tunnel
cloudflared tunnel create patina

# Note the tunnel ID (e.g., a1b2c3d4-e5f6-7890-abcd-ef1234567890)
# Save the credentials file path (e.g., ~/.cloudflared/a1b2c3d4-e5f6-7890-abcd-ef1234567890.json)
```

### 2.2 Configure DNS Records

In Cloudflare Dashboard → DNS → Records, add these CNAME records:

| Type | Name | Target | Proxy |
|------|------|--------|-------|
| CNAME | @ | `<tunnel-id>.cfargotunnel.com` | Proxied |
| CNAME | www | `<tunnel-id>.cfargotunnel.com` | Proxied |
| CNAME | app | `<tunnel-id>.cfargotunnel.com` | Proxied |
| CNAME | api | `<tunnel-id>.cfargotunnel.com` | Proxied |
| CNAME | admin | `<tunnel-id>.cfargotunnel.com` | Proxied |
| CNAME | supabase | `<tunnel-id>.cfargotunnel.com` | Proxied |
| CNAME | storage | `<tunnel-id>.cfargotunnel.com` | Proxied |
| CNAME | realtime | `<tunnel-id>.cfargotunnel.com` | Proxied |
| CNAME | search | `<tunnel-id>.cfargotunnel.com` | Proxied |
| CNAME | ml | `<tunnel-id>.cfargotunnel.com` | Proxied |

### 2.3 Deploy Tunnel Configuration

```bash
# Copy the tunnel config
cp cloudflare-tunnel-config.yml ~/.cloudflared/config.yml

# Edit and replace <TUNNEL_ID> with your actual tunnel ID
nano ~/.cloudflared/config.yml

# Test the configuration
cloudflared tunnel run patina

# If working, install as a service
sudo cloudflared service install
sudo systemctl enable cloudflared
sudo systemctl start cloudflared
```

### 2.4 Cloudflare SSL/TLS Settings

In Cloudflare Dashboard → SSL/TLS:
- Set encryption mode to **Full (strict)** or **Full**
- Enable **Always Use HTTPS**
- Enable **Automatic HTTPS Rewrites**

---

## 3. Generate Secrets

Run these commands to generate all required secrets:

```bash
# Create a secrets file
cat > secrets.txt << 'EOF'
# Generated Patina Secrets
# Date: $(date)

# JWT Secret (32+ characters)
JWT_SECRET=$(openssl rand -base64 32)

# Database Password
POSTGRES_PASSWORD=$(openssl rand -base64 24)

# Redis Password
REDIS_PASSWORD=$(openssl rand -base64 16)

# Typesense API Key
TYPESENSE_API_KEY=$(openssl rand -hex 32)

# MinIO Password
MINIO_ROOT_PASSWORD=$(openssl rand -base64 24)

# Realtime Secret
REALTIME_SECRET_KEY_BASE=$(openssl rand -base64 64)
EOF

# Generate the actual values
JWT_SECRET=$(openssl rand -base64 32)
POSTGRES_PASSWORD=$(openssl rand -base64 24)
REDIS_PASSWORD=$(openssl rand -base64 16)
TYPESENSE_API_KEY=$(openssl rand -hex 32)
MINIO_ROOT_PASSWORD=$(openssl rand -base64 24)
REALTIME_SECRET_KEY_BASE=$(openssl rand -base64 64)

echo "JWT_SECRET=$JWT_SECRET"
echo "POSTGRES_PASSWORD=$POSTGRES_PASSWORD"
echo "REDIS_PASSWORD=$REDIS_PASSWORD"
echo "TYPESENSE_API_KEY=$TYPESENSE_API_KEY"
echo "MINIO_ROOT_PASSWORD=$MINIO_ROOT_PASSWORD"
echo "REALTIME_SECRET_KEY_BASE=$REALTIME_SECRET_KEY_BASE"
```

### Generate Supabase Keys

Visit: https://supabase.com/docs/guides/hosting/jwt-generator

1. Enter your JWT_SECRET
2. Generate ANON key (role: "anon")
3. Generate SERVICE_ROLE key (role: "service_role")
4. Save both keys securely

---

## 4. Deploy Supabase

### 4.1 Create Project in Coolify

1. Open Coolify Dashboard
2. Click **+ New Project**
3. Name: `Patina Infrastructure`
4. Click **Create**

### 4.2 Add Supabase Stack

1. Inside the project, click **+ Add Resource**
2. Select **Docker Compose**
3. Name: `Supabase Stack`
4. Paste the contents of `docker-compose.supabase.yml`

### 4.3 Configure Environment Variables

In Coolify → Resource → Environment Variables, add:

```env
# Core Configuration
POSTGRES_PASSWORD=<your-generated-password>
POSTGRES_PORT=5432
POSTGRES_DB=postgres
JWT_SECRET=<your-jwt-secret>
JWT_EXPIRY=3600

# Supabase Keys
ANON_KEY=<your-generated-anon-key>
SERVICE_ROLE_KEY=<your-generated-service-role-key>

# URLs
SITE_URL=https://app.patina.cloud
API_EXTERNAL_URL=https://api.patina.cloud
ADDITIONAL_REDIRECT_URLS=https://app.patina.cloud,https://admin.patina.cloud,patina://

# Studio
DASHBOARD_USERNAME=supabase
DASHBOARD_PASSWORD=<your-dashboard-password>
STUDIO_DEFAULT_ORGANIZATION=Patina
STUDIO_DEFAULT_PROJECT=Patina Platform

# Email (Optional for now)
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_USER=resend
SMTP_PASS=<your-resend-api-key>
SMTP_ADMIN_EMAIL=hello@patina.cloud
```

### 4.4 Configure Ports

Map these ports in Coolify:

| Service | Container Port | Host Port |
|---------|---------------|-----------|
| Kong (API) | 8000 | 8000 |
| Studio | 3000 | 3010 |
| Realtime | 4000 | 4000 |
| Storage | 5000 | 5000 |

### 4.5 Deploy

1. Click **Deploy**
2. Wait for all containers to be healthy (5-10 minutes)
3. Check logs for any errors

### 4.6 Verify Supabase

```bash
# Test Kong API Gateway
curl https://api.patina.cloud/rest/v1/ \
  -H "apikey: <your-anon-key>"

# Test Studio (should redirect to login)
curl -I https://supabase.patina.cloud
```

---

## 5. Deploy Backend Services

### 5.1 Add Backend Services Stack

1. In the same project, click **+ Add Resource**
2. Select **Docker Compose**
3. Name: `Backend Services`
4. Paste the contents of `docker-compose.services.yml`

### 5.2 Configure Environment Variables

```env
# Database (same as Supabase)
POSTGRES_PASSWORD=<same-as-supabase>

# Redis
REDIS_PASSWORD=<your-redis-password>

# Supabase Integration
ANON_KEY=<your-anon-key>
SERVICE_ROLE_KEY=<your-service-role-key>
JWT_SECRET=<your-jwt-secret>

# Search
TYPESENSE_API_KEY=<your-typesense-api-key>

# Storage
MINIO_ROOT_USER=patina
MINIO_ROOT_PASSWORD=<your-minio-password>

# AI (Optional)
OPENAI_API_KEY=<your-openai-key>
```

### 5.3 Configure Ports

| Service | Container Port | Host Port |
|---------|---------------|-----------|
| Redis | 6379 | 6379 |
| Typesense | 8108 | 8108 |
| Core Service | 4001 | 4001 |
| Intelligence Service | 4002 | 4002 |
| Analytics Service | 4003 | 4003 |
| MinIO | 9000 | 9000 |
| MinIO Console | 9001 | 9001 |
| Qdrant | 6333 | 6333 |

### 5.4 Set Network

**Important**: Set the network to `patina_network` (external) to allow communication with Supabase containers.

### 5.5 Deploy

1. Click **Deploy**
2. Wait for all services to be healthy

---

## 6. Deploy Frontend Apps

### Option A: Docker Compose (Manual)

Follow similar steps as backend services using `docker-compose.frontend.yml`.

### Option B: Git Deployment (Recommended)

#### 6.1 Consumer Web App

1. In the project, click **+ Add Resource**
2. Select **Public Repository** or **Private Repository (with GitHub)**
3. Repository: `your-org/patina-consumer-web`
4. Branch: `main`
5. Build Pack: **Nixpacks** or **Dockerfile**
6. Port: `3000`

**Environment Variables:**
```env
NODE_ENV=production
NEXT_PUBLIC_SUPABASE_URL=https://api.patina.cloud
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
NEXT_PUBLIC_API_URL=https://api.patina.cloud
NEXT_PUBLIC_APP_URL=https://app.patina.cloud
```

**Domain Configuration:**
- Add domain: `app.patina.cloud`
- Enable HTTPS (Coolify will use Cloudflare's certificate)

#### 6.2 Designer Portal

Repeat the same process for the Designer Portal:
- Repository: `your-org/patina-designer-portal`
- Domain: `admin.patina.cloud`

---

## 7. Configure iOS App

### 7.1 Update API Configuration

1. Copy `ios/APIConfiguration.swift` to your iOS project
2. Replace placeholder keys with your actual values:

```swift
// In APIConfiguration.swift
var supabaseAnonKey: String {
    switch Environment.current {
    case .production:
        return "YOUR_ACTUAL_ANON_KEY"  // Replace this
    // ...
    }
}
```

### 7.2 Configure Universal Links

Create `apple-app-site-association` file at `https://app.patina.cloud/.well-known/`:

```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appID": "YOUR_TEAM_ID.cloud.patina.app",
        "paths": [
          "/auth/*",
          "/room/*",
          "/product/*",
          "/designer/*"
        ]
      }
    ]
  },
  "webcredentials": {
    "apps": ["YOUR_TEAM_ID.cloud.patina.app"]
  }
}
```

### 7.3 Configure OAuth Redirect

In Supabase Studio → Authentication → URL Configuration:
- Add `patina://auth/callback` to redirect URLs

---

## 8. Verification & Testing

### 8.1 Health Checks

```bash
# Supabase API
curl https://api.patina.cloud/rest/v1/ -H "apikey: $ANON_KEY"

# Consumer Web App
curl https://app.patina.cloud/api/health

# Designer Portal
curl https://admin.patina.cloud/api/health

# Intelligence Service
curl https://ml.patina.cloud/health

# Search
curl https://search.patina.cloud/health
```

### 8.2 Authentication Test

```bash
# Sign up a test user
curl -X POST https://api.patina.cloud/auth/v1/signup \
  -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"testpassword123"}'
```

### 8.3 Database Test

```bash
# Query public data
curl https://api.patina.cloud/rest/v1/products?select=* \
  -H "apikey: $ANON_KEY"
```

---

## 9. Monitoring & Maintenance

### 9.1 View Logs in Coolify

- Go to each resource → Logs tab
- Enable log streaming for real-time monitoring

### 9.2 Backup Strategy

```bash
# Database backup (run on Proxmox host)
docker exec supabase-db pg_dump -U postgres postgres > backup_$(date +%Y%m%d).sql

# Automate with cron
0 2 * * * docker exec supabase-db pg_dump -U postgres postgres > /backups/patina_$(date +\%Y\%m\%d).sql
```

### 9.3 Scaling (Future)

For horizontal scaling:
1. Deploy additional instances via Coolify
2. Add to Cloudflare load balancer
3. Configure sticky sessions for WebSocket connections

### 9.4 Updates

```bash
# Pull latest images
docker-compose pull

# Redeploy via Coolify (zero-downtime)
# Click "Redeploy" in Coolify dashboard
```

---

## Troubleshooting

### Common Issues

**Container won't start:**
- Check logs in Coolify
- Verify environment variables
- Check port conflicts

**Can't reach service through Cloudflare:**
- Verify tunnel is running: `systemctl status cloudflared`
- Check tunnel config hostnames match DNS
- Verify Cloudflare DNS is proxied (orange cloud)

**Database connection fails:**
- Ensure services are on the same Docker network
- Check POSTGRES_PASSWORD matches across services
- Verify database is healthy: `docker exec supabase-db pg_isready`

**iOS app can't connect:**
- Verify CORS settings in Kong
- Check SSL certificate validity
- Ensure redirect URLs are configured in Supabase

---

## Support

- Coolify Documentation: https://coolify.io/docs
- Supabase Self-Hosting: https://supabase.com/docs/guides/self-hosting
- Cloudflare Tunnel: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/

---

*Last Updated: January 2025*
