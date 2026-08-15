# Patina Deployment - Coolify Quick Start Guide

## Table of Contents
1. [Prerequisites](#1-prerequisites)
2. [Cloudflare Setup](#2-cloudflare-setup)
3. [Generate Secrets](#3-generate-secrets)
4. [Deploy Supabase](#4-deploy-supabase)
5. [Deploy Backend Services](#5-deploy-backend-services)
6. [Deploy Frontend Apps](#6-deploy-frontend-apps)
7. [Configure Mobile & Extension](#7-configure-mobile--extension)
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

---

## 2. Cloudflare Setup

### 2.1 Create Cloudflare Tunnel

```bash
# Install cloudflared
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared
chmod +x /usr/local/bin/cloudflared

# Login and create tunnel
cloudflared tunnel login
cloudflared tunnel create patina

# Note the tunnel ID and credentials file path
```

### 2.2 Configure DNS Records

In Cloudflare Dashboard -> DNS -> Records:

| Type | Name | Target | Proxy |
|------|------|--------|-------|
| CNAME | app | `<tunnel-id>.cfargotunnel.com` | Proxied |
| CNAME | admin | `<tunnel-id>.cfargotunnel.com` | Proxied |
| CNAME | client | `<tunnel-id>.cfargotunnel.com` | Proxied |
| CNAME | api | `<tunnel-id>.cfargotunnel.com` | Proxied |
| CNAME | supabase | `<tunnel-id>.cfargotunnel.com` | Proxied |
| CNAME | storage | `<tunnel-id>.cfargotunnel.com` | Proxied |
| CNAME | realtime | `<tunnel-id>.cfargotunnel.com` | Proxied |
| CNAME | storage-admin | `<tunnel-id>.cfargotunnel.com` | Proxied |

### 2.3 Deploy Tunnel Configuration

```bash
cp cloudflare-tunnel-config.yml ~/.cloudflared/config.yml

# Edit and replace <TUNNEL_ID> with your actual tunnel ID
nano ~/.cloudflared/config.yml

# Test
cloudflared tunnel run patina

# Install as service
sudo cloudflared service install
sudo systemctl enable cloudflared
sudo systemctl start cloudflared
```

### 2.4 SSL/TLS Settings

In Cloudflare Dashboard -> SSL/TLS:
- Set encryption mode to **Full**
- Enable **Always Use HTTPS**
- Enable **Automatic HTTPS Rewrites**

---

## 3. Generate Secrets

```bash
echo "JWT_SECRET=$(openssl rand -base64 32)"
echo "POSTGRES_PASSWORD=$(openssl rand -base64 24)"
echo "REDIS_PASSWORD=$(openssl rand -base64 16)"
echo "MINIO_ROOT_PASSWORD=$(openssl rand -base64 24)"
echo "REALTIME_SECRET_KEY_BASE=$(openssl rand -base64 64)"
```

### Generate Supabase Keys

Visit: https://supabase.com/docs/guides/hosting/jwt-generator

1. Enter your JWT_SECRET
2. Generate ANON key (role: "anon")
3. Generate SERVICE_ROLE key (role: "service_role")

---

## 4. Deploy Supabase

### 4.1 Create Project in Coolify

1. Open Coolify Dashboard
2. **+ New Project** -> Name: `Patina Infrastructure`

### 4.2 Add Supabase Stack

1. **+ Add Resource** -> Docker Compose
2. Name: `Supabase Stack`
3. Paste contents of `docker-compose.supabase.yml`

### 4.3 Configure Environment Variables

```env
POSTGRES_PASSWORD=<generated>
JWT_SECRET=<generated>
ANON_KEY=<generated>
SERVICE_ROLE_KEY=<generated>
SITE_URL=https://app.patina.cloud
API_EXTERNAL_URL=https://api.patina.cloud
ADDITIONAL_REDIRECT_URLS=https://app.patina.cloud,https://admin.patina.cloud,https://client.patina.cloud,patina://
DASHBOARD_USERNAME=supabase
DASHBOARD_PASSWORD=<strong-password>
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_USER=resend
SMTP_PASS=<resend-api-key>
SMTP_ADMIN_EMAIL=hello@patina.cloud
```

### 4.4 Deploy and Verify

```bash
# Test Kong API Gateway
curl https://api.patina.cloud/rest/v1/ -H "apikey: <anon-key>"

# Test Studio (should redirect to login)
curl -I https://supabase.patina.cloud
```

---

## 5. Deploy Backend Services

### 5.1 Add Backend Services Stack

1. **+ Add Resource** -> Docker Compose
2. Name: `Backend Services`
3. Paste contents of `docker-compose.services.yml`

### 5.2 Configure Environment Variables

```env
POSTGRES_PASSWORD=<same-as-supabase>
REDIS_PASSWORD=<generated>
JWT_SECRET=<same-as-supabase>
MINIO_ROOT_USER=patina
MINIO_ROOT_PASSWORD=<generated>
STRIPE_SECRET_KEY=<your-stripe-key>
STRIPE_WEBHOOK_SECRET=<your-webhook-secret>
EASYPOST_API_KEY=<your-easypost-key>
```

### 5.3 Set Network

Set the network to `patina_network` (external) so services can reach Supabase Postgres and each other.

### 5.4 Deploy and Verify

```bash
# Health checks
curl http://localhost:3015/health  # Orders
curl http://localhost:3014/health  # Media
curl http://localhost:3016/health  # Projects
```

---

## 6. Deploy Frontend Apps

### Option A: Docker Compose (Manual)

1. **+ Add Resource** -> Docker Compose
2. Name: `Frontend Apps`
3. Paste contents of `docker-compose.frontend.yml`

### Option B: Git Deployment (Recommended for auto-deploy on push)

For each portal (designer, admin, client):

1. **+ Add Resource** -> Public/Private Repository
2. Repository: `your-org/patina`
3. Branch: `main`
4. Build Pack: **Dockerfile** (point to `infra/Dockerfile.nextjs`)
5. Build args: `APP_NAME=designer-portal` (or admin-portal, client-portal)

### Environment Variables (all portals)

```env
NEXT_PUBLIC_SUPABASE_URL=https://api.patina.cloud
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
ORDERS_SERVICE_URL=http://orders:3015
MEDIA_SERVICE_URL=http://media:3014
PROJECTS_SERVICE_URL=http://projects:3016
```

### Domain Configuration

| Portal | Domain | Host Port |
|--------|--------|-----------|
| Designer | app.patina.cloud | 3000 |
| Admin | admin.patina.cloud | 3001 |
| Client | client.patina.cloud | 3002 |

---

## 7. Configure Mobile & Extension

### 7.1 iOS App

Update API configuration in the iOS project to point to production:
- Supabase URL: `https://api.patina.cloud`
- Supabase Anon Key: your production anon key

Configure in Supabase Auth -> URL Configuration:
- Add `patina://auth/callback` to redirect URLs

### 7.2 Chrome Extension

The extension connects directly to Supabase. Update environment config:
- Supabase URL: `https://api.patina.cloud`
- Supabase Anon Key: your production anon key

---

## 8. Verification & Testing

### Health Checks

```bash
# Frontend portals
curl https://app.patina.cloud      # Designer Portal
curl https://admin.patina.cloud    # Admin Portal
curl https://client.patina.cloud   # Client Portal

# Supabase API
curl https://api.patina.cloud/rest/v1/ -H "apikey: $ANON_KEY"
```

### Authentication Test

```bash
curl -X POST https://api.patina.cloud/auth/v1/signup \
  -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"testpassword123"}'
```

### Database Test

```bash
curl https://api.patina.cloud/rest/v1/products?select=id,name \
  -H "apikey: $ANON_KEY"
```

---

## 9. Monitoring & Maintenance

### View Logs
- Go to each Coolify resource -> Logs tab
- Enable log streaming for real-time monitoring

### Database Backup

```bash
# Manual backup
docker exec supabase-db pg_dump -U postgres postgres > backup_$(date +%Y%m%d).sql

# Automated daily backup via cron
0 2 * * * docker exec supabase-db pg_dump -U postgres postgres | gzip > /backups/patina_$(date +\%Y\%m\%d).sql.gz
```

### Updates

```bash
# Rebuild and redeploy via Coolify dashboard
# Or pull latest and redeploy:
docker compose -f docker-compose.services.yml pull
docker compose -f docker-compose.services.yml up -d
```

---

## Troubleshooting

**Container won't start:**
- Check logs in Coolify
- Verify environment variables are set
- Check for port conflicts: `lsof -i :<port>`

**Can't reach service through Cloudflare:**
- Verify tunnel is running: `systemctl status cloudflared`
- Check tunnel config hostnames match DNS records
- Verify Cloudflare DNS is proxied (orange cloud icon)

**NestJS service can't connect to database:**
- Ensure services are on `patina_network`
- Check DATABASE_URL schema parameter (`?schema=svc_orders`)
- Verify Postgres is healthy: `docker exec supabase-db pg_isready`

**Frontend can't reach backend services:**
- Verify service URLs use Docker service names (e.g., `http://orders:3015`)
- Check that all services are on the same Docker network
- Ensure NestJS services are healthy before starting frontals

---

## Support

- Coolify Documentation: https://coolify.io/docs
- Supabase Self-Hosting: https://supabase.com/docs/guides/self-hosting
- Cloudflare Tunnel: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/
