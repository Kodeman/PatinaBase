# Quick Start Guide - Enhanced Project Service

## Setup

### 1. Install Dependencies
```bash
cd /home/middle/patina/services/projects
pnpm install
```

### 2. Configure Environment
```bash
cp .env.example .env
```

Edit `.env`:
```env
DATABASE_URL="postgresql://user:password@localhost:5432/patina_projects"
REDIS_HOST=localhost
REDIS_PORT=6379
CORS_ORIGIN=http://localhost:3000
JWT_SECRET=your-secret-key
```

### 3. Run Database Migrations
```bash
pnpm prisma:generate
pnpm prisma:migrate
```

### 4. Start the Service
```bash
# Development mode with hot reload
pnpm dev

# Production mode
pnpm build
pnpm start:prod
```

The service will be available at `http://localhost:3001`

## Key API Endpoints

### Timeline
- `GET /projects/:id/timeline` - Full project timeline
- `POST /projects/:id/timeline/segments` - Create segment
- `GET /projects/:id/timeline/progress` - Progress metrics
- `POST /projects/:id/timeline/activity` - Log activity

### Approvals
- `POST /projects/:id/approvals` - Create approval
- `GET /projects/:id/approvals/pending` - Pending approvals
- `POST /projects/:id/approvals/:approvalId/approve` - Approve
- `POST /projects/:id/approvals/:approvalId/reject` - Reject

### Notifications
- `GET /notifications` - Get user notifications
- `PATCH /notifications/preferences` - Update preferences
- `POST /notifications/push-token` - Register device

### Analytics
- `GET /projects/:id/analytics` - Dashboard analytics
- `GET /projects/:id/analytics/engagement` - Engagement metrics
- `GET /analytics/user` - User analytics

### Real-Time (WebSocket)
- Connect: `ws://localhost:3001/projects`
- Events: `timeline:segment:updated`, `approval:requested`, etc.

## Client Examples

### REST API (JavaScript)
```javascript
const response = await fetch('http://localhost:3001/projects/123/timeline', {
  headers: {
    'Authorization': 'Bearer YOUR_JWT_TOKEN'
  }
});
const timeline = await response.json();
```

### WebSocket (JavaScript)
```javascript
import { io } from 'socket.io-client';

const socket = io('ws://localhost:3001/projects', {
  auth: { token: 'YOUR_JWT_TOKEN' }
});

socket.on('connected', () => {
  socket.emit('subscribe:project', { projectId: '123' });
});

socket.on('approval:requested', (data) => {
  console.log('New approval:', data);
});
```

### cURL
```bash
# Get timeline
curl -H "Authorization: Bearer TOKEN" \
  http://localhost:3001/projects/123/timeline

# Create approval
curl -X POST \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Material Approval","approvalType":"material","assignedTo":"client-id"}' \
  http://localhost:3001/projects/123/approvals
```

## Database Schema

### New Tables
- `timeline_segments` - Project timeline phases
- `client_activities` - Activity tracking
- `approval_records` - Approval workflows
- `engagement_metrics` - Analytics aggregates
- `notification_preferences` - User preferences
- `notifications` - Notification records
- `active_connections` - WebSocket tracking

### View Data
```bash
pnpm prisma:studio
```

## Background Jobs

Redis and Bull queues handle:
- Email notifications
- SMS notifications
- Push notifications
- Daily/weekly digests

Monitor queues:
```bash
# Redis CLI
redis-cli
> KEYS bull:notifications:*
```

## Testing

### Run Tests
```bash
pnpm test           # Unit tests
pnpm test:watch     # Watch mode
pnpm test:cov       # Coverage
pnpm test:e2e       # E2E tests
```

### Manual Testing

1. **Timeline**: Create a project, add segments, update progress
2. **Approvals**: Create approval, approve/reject, add comments
3. **Analytics**: Log activities, view engagement metrics
4. **WebSocket**: Connect, subscribe, receive real-time updates
5. **Notifications**: Create notification, check delivery

## Troubleshooting

### Database Connection Issues
```bash
# Check PostgreSQL is running
pg_isready

# Reset database
pnpm prisma:migrate reset
```

### Redis Connection Issues
```bash
# Check Redis is running
redis-cli ping

# Should return: PONG
```

### WebSocket Not Connecting
- Check CORS settings in `main.ts`
- Verify JWT token is valid
- Check firewall/proxy settings

### Build Errors
```bash
# Clean and rebuild
rm -rf dist node_modules
pnpm install
pnpm build
```

## Monitoring

### Health Check
```bash
curl http://localhost:3001/health
```

### Metrics
- Active WebSocket connections: Check Redis `active_connections` table
- Queue status: Bull dashboard or Redis CLI
- API performance: Enable Swagger at `/api/docs`

## Development Tips

1. **Hot Reload**: Use `pnpm dev` for automatic restart
2. **Debug**: Use VS Code debugger with launch config
3. **API Docs**: Visit `http://localhost:3001/api/docs` for Swagger UI
4. **Prisma Studio**: Run `pnpm prisma:studio` to visualize data

## Production Checklist

- [ ] Set strong `JWT_SECRET`
- [ ] Configure production database URL
- [ ] Set up Redis cluster for high availability
- [ ] Configure proper CORS origins
- [ ] Enable HTTPS
- [ ] Set up monitoring (e.g., DataDog, New Relic)
- [ ] Configure log aggregation
- [ ] Set up automated backups
- [ ] Review rate limiting settings
- [ ] Enable compression middleware
- [ ] Configure CDN for static assets

## Support

- Full Documentation: `BACKEND_ENHANCEMENTS.md`
- Architecture: `ARCHITECTURE.md`
- API Reference: `API_REFERENCE.md`
