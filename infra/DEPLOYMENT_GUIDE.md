# Patina Deployment Stack
## Infrastructure: Proxmox -> Coolify -> Cloudflare Tunnel -> patina.cloud

---

## Architecture Overview

```
+-----------------------------------------------------------------------------+
|                           CLOUDFLARE TUNNEL                                 |
|                        (*.patina.cloud routing)                             |
+-----------------------------------------------------------------------------+
|                                                                             |
|  +---------------+ +---------------+ +---------------+ +---------------+   |
|  | app.          | | admin.        | | client.       | | api.          |   |
|  | patina.cloud  | | patina.cloud  | | patina.cloud  | | patina.cloud  |   |
|  +-------+-------+ +-------+-------+ +-------+-------+ +-------+-------+   |
|          |                 |                 |                 |             |
|          v                 v                 v                 v             |
+-----------------------------------------------------------------------------+
|                             COOLIFY                                         |
|                       (Container Orchestration)                             |
+-----------------------------------------------------------------------------+
|                                                                             |
|  FRONTEND APPS (Next.js 15)                                                |
|  +------------------+ +------------------+ +------------------+            |
|  | Designer Portal  | | Admin Portal     | | Client Portal    |            |
|  | :3000            | | :3001            | | :3002            |            |
|  +------------------+ +------------------+ +------------------+            |
|          |                    |                    |                        |
|          +--------------------+--------------------+                        |
|          | (proxy via @patina/api-routes)                                   |
|          v                                                                  |
|  NESTJS SERVICES (internal only, not publicly exposed)                     |
|  +------------------+ +------------------+ +------------------+            |
|  | Orders           | | Media            | | Projects         |            |
|  | (NestJS) :3015   | | (NestJS) :3014   | | (NestJS) :3016   |            |
|  | Stripe, EasyPost | | S3, imgproc      | | WebSocket, FSM   |            |
|  +------------------+ +------------------+ +------------------+            |
|                                                                             |
|  SUPABASE STACK (self-hosted)                                              |
|  +---------------------------------------------------------------+        |
|  | +----------+ +----------+ +----------+ +----------+           |        |
|  | | Kong API | | Auth     | | Realtime | | Storage  |           |        |
|  | | :8000    | | :9999    | | :4000    | | :5000    |           |        |
|  | +----------+ +----------+ +----------+ +----------+           |        |
|  | +----------+ +----------+ +----------+ +----------+           |        |
|  | | Postgres | | Studio   | | Functions| | imgproxy |           |        |
|  | | :5432    | | :3010    | | :9000    | | :5001    |           |        |
|  | +----------+ +----------+ +----------+ +----------+           |        |
|  +---------------------------------------------------------------+        |
|                                                                             |
|  INFRASTRUCTURE                                                            |
|  +------------------+ +------------------+                                 |
|  | Redis            | | MinIO            |                                 |
|  | :6379            | | :9000/:9001      |                                 |
|  +------------------+ +------------------+                                 |
|                                                                             |
+-----------------------------------------------------------------------------+
|                              PROXMOX                                        |
|                          (Virtualization Layer)                             |
+-----------------------------------------------------------------------------+
```

---

## Subdomain Structure

| Subdomain | Service | Port | Purpose |
|-----------|---------|------|---------|
| `app.patina.cloud` | Designer Portal | 3000 | Designer workspace |
| `admin.patina.cloud` | Admin Portal | 3001 | Platform administration |
| `client.patina.cloud` | Client Portal | 3002 | Client project tracking |
| `api.patina.cloud` | Supabase Kong | 8000 | Auth, REST API, Storage, Functions |
| `supabase.patina.cloud` | Supabase Studio | 3010 | Database admin UI |
| `realtime.patina.cloud` | Supabase Realtime | 4000 | WebSocket connections |
| `storage.patina.cloud` | Supabase Storage | 5000 | File storage (direct) |
| `storage-admin.patina.cloud` | MinIO Console | 9001 | Object storage admin |

**Not publicly exposed** (internal Docker network only):
- Orders service (:3015) — proxied via portal API routes
- Media service (:3014) — proxied via portal API routes
- Projects service (:3016) — proxied via portal API routes
- Redis (:6379)
- MinIO API (:9000)
- PostgreSQL (:5432) — available via TCP tunnel at db.patina.cloud

---

## Deployment Order

### Phase 1: Foundation
1. **Supabase Stack** — Postgres, Auth, Realtime, Storage, Edge Functions, Studio
2. **Redis** — Caching and BullMQ job queues
3. **MinIO** — S3-compatible object storage for media service

### Phase 2: Backend Services
4. **Orders Service** — Stripe payments, EasyPost shipping
5. **Media Service** — Image processing, S3 storage
6. **Projects Service** — Real-time collaboration, WebSocket

### Phase 3: Frontend Applications
7. **Designer Portal** — app.patina.cloud
8. **Admin Portal** — admin.patina.cloud
9. **Client Portal** — client.patina.cloud

### Phase 4: Verification
10. Health checks pass for all services
11. Auth flow works end-to-end
12. Cloudflare Tunnel routes correctly

---

## Prerequisites

### 1. Cloudflare Configuration

Configure these DNS records in Cloudflare:

```
Type    Name                    Content                         Proxy
CNAME   app                     <tunnel-id>.cfargotunnel.com    Proxied
CNAME   admin                   <tunnel-id>.cfargotunnel.com    Proxied
CNAME   client                  <tunnel-id>.cfargotunnel.com    Proxied
CNAME   api                     <tunnel-id>.cfargotunnel.com    Proxied
CNAME   supabase                <tunnel-id>.cfargotunnel.com    Proxied
CNAME   storage                 <tunnel-id>.cfargotunnel.com    Proxied
CNAME   realtime                <tunnel-id>.cfargotunnel.com    Proxied
CNAME   storage-admin           <tunnel-id>.cfargotunnel.com    Proxied
```

### 2. Generate Required Secrets

```bash
# JWT Secret for Supabase (must match across all services)
openssl rand -base64 32

# ANON Key and SERVICE_ROLE Key
# Use JWT secret at: https://supabase.com/docs/guides/hosting/jwt-generator

# Database Password
openssl rand -base64 24

# Redis Password
openssl rand -base64 16

# MinIO Password
openssl rand -base64 24
```

See `infra/.env.example` for the full list of required environment variables.

---

## Docker Compose Files

| File | Contents | Coolify Resource Name |
|------|----------|-----------------------|
| `docker-compose.supabase.yml` | Full Supabase stack | Supabase Stack |
| `docker-compose.services.yml` | Redis + MinIO + 3 NestJS services | Backend Services |
| `docker-compose.frontend.yml` | 3 Next.js portals | Frontend Apps |
| `cloudflare-tunnel-config.yml` | Tunnel routing rules | (deployed on host) |

All compose files use the shared `patina_network` (external) for inter-service communication.

---

## Next Steps

See individual configuration files:
- `docker-compose.supabase.yml` — Supabase stack
- `docker-compose.services.yml` — Backend services
- `docker-compose.frontend.yml` — Frontend applications
- `cloudflare-tunnel-config.yml` — Tunnel routing
- `.env.example` — Environment variables template
- `PORT_REFERENCE.md` — Port and subdomain mapping
- `QUICKSTART.md` — Step-by-step deployment guide
