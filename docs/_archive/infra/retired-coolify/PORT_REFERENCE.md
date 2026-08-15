# Patina Deployment - Port Mapping Reference

## Port Allocation

### Supabase Stack (docker-compose.supabase.yml)

| Service | Container Port | Host Port | Subdomain | Purpose |
|---------|---------------|-----------|-----------|---------|
| Kong API Gateway | 8000 | 8000 | api.patina.cloud | Main API endpoint |
| Kong SSL | 8443 | 8443 | - | SSL API (internal) |
| Studio | 3000 | 3010 | supabase.patina.cloud | Admin dashboard |
| Auth (GoTrue) | 9999 | - | (via Kong) | Authentication |
| REST (PostgREST) | 3000 | - | (via Kong) | REST API |
| Realtime | 4000 | 4000 | realtime.patina.cloud | WebSockets |
| Storage | 5000 | 5000 | storage.patina.cloud | File storage |
| imgproxy | 5001 | - | - | Image transforms |
| Functions | 9000 | - | (via Kong) | Edge functions |
| PostgreSQL | 5432 | 5432 | db.patina.cloud (TCP) | Database |
| Meta | 8080 | - | - | PG Meta API |

### Backend Services (docker-compose.services.yml)

| Service | Container Port | Host Port | Subdomain | Purpose |
|---------|---------------|-----------|-----------|---------|
| Redis | 6379 | 6379 | - | Cache/Queues |
| MinIO API | 9000 | 9000 | - | Object storage |
| MinIO Console | 9001 | 9001 | storage-admin.patina.cloud | MinIO admin |
| Orders (NestJS) | 3015 | 3015 | (internal) | Payments/shipping |
| Media (NestJS) | 3014 | 3014 | (internal) | Image processing |
| Projects (NestJS) | 3016 | 3016 | (internal) | Real-time collab |

### Frontend Apps (docker-compose.frontend.yml)

| Service | Container Port | Host Port | Subdomain | Purpose |
|---------|---------------|-----------|-----------|---------|
| Designer Portal | 3000 | 3000 | app.patina.cloud | Designer workspace |
| Admin Portal | 3000 | 3001 | admin.patina.cloud | Platform admin |
| Client Portal | 3000 | 3002 | client.patina.cloud | Client tracking |

---

## Cloudflare Tunnel Routing Summary

```yaml
# Frontend applications
app.patina.cloud      -> localhost:3000  # Designer Portal
admin.patina.cloud    -> localhost:3001  # Admin Portal
client.patina.cloud   -> localhost:3002  # Client Portal

# Supabase services
api.patina.cloud      -> localhost:8000  # Kong API Gateway (Auth, REST, Storage, Functions)
supabase.patina.cloud -> localhost:3010  # Supabase Studio
realtime.patina.cloud -> localhost:4000  # WebSockets
storage.patina.cloud  -> localhost:5000  # File storage (direct)

# Admin interfaces (protect with Cloudflare Access)
storage-admin.patina.cloud -> localhost:9001  # MinIO Console

# Database (TCP tunnel for migrations)
db.patina.cloud       -> tcp://localhost:5432  # PostgreSQL
```

---

## Internal Service URLs

For service-to-service communication within Docker network:

```bash
# Database
postgresql://postgres:${POSTGRES_PASSWORD}@supabase-db:5432/postgres

# Schema-isolated NestJS databases
postgresql://postgres:${POSTGRES_PASSWORD}@supabase-db:5432/postgres?schema=svc_orders
postgresql://postgres:${POSTGRES_PASSWORD}@supabase-db:5432/postgres?schema=svc_media
postgresql://postgres:${POSTGRES_PASSWORD}@supabase-db:5432/postgres?schema=svc_projects

# Redis
redis://:${REDIS_PASSWORD}@redis:6379

# Supabase Services (via Kong)
http://supabase-kong:8000

# NestJS Services (internal only, proxied via Next.js api-routes)
http://orders:3015
http://media:3014
http://projects:3016

# Object Storage
http://minio:9000
```

---

## Architecture Notes

1. **NestJS services are NOT publicly exposed.** Frontend portals proxy requests to them via `@patina/api-routes` middleware (Next.js API routes). This keeps service URLs server-side only.

2. **All portals run on container port 3000** but are mapped to different host ports (3000, 3001, 3002) for Cloudflare Tunnel routing.

3. **PostgreSQL is shared** — single Supabase Postgres instance. NestJS services use schema isolation (`svc_orders`, `svc_media`, `svc_projects`). Supabase tables live in the `public` schema.

4. **Redis (6379)** — Internal only. Never expose to public internet.

5. **Admin interfaces** — Protect with Cloudflare Access:
   - supabase.patina.cloud
   - storage-admin.patina.cloud

6. **WebSockets** — Cloudflare handles WebSocket upgrades automatically for realtime.patina.cloud.

7. **SSL/TLS** — Cloudflare terminates SSL. Internal traffic is HTTP within Docker network.
