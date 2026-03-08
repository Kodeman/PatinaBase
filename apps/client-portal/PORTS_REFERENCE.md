# Service Ports Quick Reference

## Client Portal Configuration

### Frontend Ports
- **Client Portal**: `3010` (this app)
- **Designer Portal**: `3000`
- **Admin Portal**: `3001`

### Backend Service Ports (from CLAUDE.md)

| Service | Port | WebSocket | Description |
|---------|------|-----------|-------------|
| **user-management** | 3010 | ❌ | Authentication & users |
| **catalog** | 3011 | ❌ | Product catalog |
| **style-profile** | 3012 | ❌ | Style preferences |
| **search** | 3013 | ❌ | OpenSearch integration |
| **media** | 3014 | ❌ | Media processing |
| **orders** | 3015 | ❌ | Order management |
| **projects** | **3016** | ✅ `/projects` | **WebSocket server** |
| **comms** | 3017 | ✅ `/messages` | Real-time messaging |
| **notifications** | 3018 | ❌ | Notifications |

### Infrastructure Ports
- **PostgreSQL**: `5432`
- **Redis**: `6379`
- **OpenSearch**: `9200`
- **MinIO**: `9000` (API), `9001` (Console)
- **PgAdmin**: `5050`
- **Mailhog**: `8025` (UI), `1025` (SMTP)

## Current Client Portal Configuration

```bash
# API Services
NEXT_PUBLIC_PROJECTS_API_URL=http://localhost:3016
NEXT_PUBLIC_MEDIA_API_URL=http://localhost:3014
NEXT_PUBLIC_COMMS_API_URL=http://localhost:3017
NEXT_PUBLIC_NOTIFICATIONS_API_URL=http://localhost:3018

# WebSocket (Socket.IO)
NEXT_PUBLIC_WS_URL=http://localhost:3016
NEXT_PUBLIC_WS_NAMESPACE=/projects

# Real-time Updates (disabled by default)
NEXT_PUBLIC_ENABLE_REAL_TIME_UPDATES=false
```

## WebSocket Details

### Projects Service (Port 3016)
- **Library**: Socket.IO
- **Namespace**: `/projects`
- **Protocol**: `http://` or `https://` (not `ws://`)
- **Events**:
  - `timeline:segment:updated`
  - `approval:requested`
  - `approval:approved`
  - `approval:rejected`
  - `project:status:changed`
  - `activity:logged`

### Comms Service (Port 3017)
- **Library**: Socket.IO
- **Namespace**: `/messages`
- **Protocol**: `http://` or `https://` (not `ws://`)
- **Events**:
  - `message:new`
  - `message:read`
  - `typing:started`
  - `typing:stopped`
  - `thread:updated`

## Common Port Issues

### ❌ Wrong Configuration
```bash
# These are INCORRECT
NEXT_PUBLIC_PROJECTS_API_URL=http://localhost:3007  # Wrong port
NEXT_PUBLIC_WS_URL=ws://localhost:3006/ws           # Wrong everything
```

### ✅ Correct Configuration
```bash
# These are CORRECT
NEXT_PUBLIC_PROJECTS_API_URL=http://localhost:3016  # Correct port
NEXT_PUBLIC_WS_URL=http://localhost:3016            # Correct protocol & port
NEXT_PUBLIC_WS_NAMESPACE=/projects                  # Correct namespace
```

## Quick Port Test

Test if services are running:

```bash
# Check if projects service is running
curl http://localhost:3016/health

# Check if media service is running
curl http://localhost:3014/health

# Check if comms service is running
curl http://localhost:3017/health

# Check WebSocket (requires Socket.IO client)
# Cannot use curl for Socket.IO connections
```

## Starting Services

```bash
# From monorepo root

# Start infrastructure
pnpm db:up

# Start specific services
pnpm --filter @patina/projects dev      # Port 3016
pnpm --filter @patina/media dev         # Port 3014
pnpm --filter @patina/comms dev         # Port 3017
pnpm --filter @patina/notifications dev # Port 3018

# Start client portal
pnpm --filter @patina/client-portal dev # Port 3010
```

## Port Conflicts

If you get "port already in use" errors:

```bash
# Find what's using the port
lsof -i :3016

# Kill process on port
lsof -ti:3016 | xargs kill -9

# Or use a different port
PORT=3020 pnpm dev
```

## See Also

- **CLAUDE.md** - Authoritative source for all port assignments
- **WEBSOCKET_SETUP.md** - Complete WebSocket configuration guide
- **QUICK_START_GUIDE.md** - Development setup instructions
