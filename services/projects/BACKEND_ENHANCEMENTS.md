# Project Service - Backend Enhancements

**Team Echo Deliverable** - Immersive Client Portal Backend System

## Overview

This document describes the comprehensive backend enhancements made to the Patina Project Service to support the immersive client portal with real-time features, analytics, and approval workflows.

## Architecture

The enhanced system follows a modular, event-driven architecture with real-time capabilities:

```
┌─────────────────────────────────────────────────────────────┐
│                     Client Applications                      │
│              (Designer Portal, Client Portal)                │
└───────────────┬─────────────────────┬───────────────────────┘
                │                     │
        REST API│              WebSocket│
                │                     │
┌───────────────▼─────────────────────▼───────────────────────┐
│                    Projects Service                          │
│  ┌────────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │ Timeline   │  │Approvals │  │Analytics │  │WebSocket │  │
│  │  Module    │  │  Module  │  │  Module  │  │ Gateway  │  │
│  └────────────┘  └──────────┘  └──────────┘  └──────────┘  │
│  ┌────────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │Notifications│  │ Projects │  │  Events  │  │  Audit   │  │
│  │   Module   │  │  Module  │  │  Module  │  │  Module  │  │
│  └────────────┘  └──────────┘  └──────────┘  └──────────┘  │
└─────────────────────────┬───────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          │               │               │
    ┌─────▼─────┐   ┌────▼────┐   ┌─────▼──────┐
    │PostgreSQL │   │  Redis  │   │Bull Queues │
    │  Database │   │  Cache  │   │(Background)│
    └───────────┘   └─────────┘   └────────────┘
```

## New Database Models

### 1. TimelineSegment
Represents phases and segments of the project timeline.

**Fields:**
- `id`, `projectId`, `title`, `description`
- `phase`: planning | design | procurement | construction | completion
- `status`: pending | in_progress | completed | delayed
- `progress`: 0-100 percentage
- `startDate`, `endDate`
- `dependencies`: Array of dependent segment IDs
- `deliverables`: Array of deliverable descriptions
- `order`: Display order

**Relations:**
- Belongs to Project
- Has many ClientActivities
- Has many ApprovalRecords

### 2. ClientActivity
Tracks all client interactions and engagement.

**Fields:**
- `id`, `projectId`, `segmentId`, `userId`
- `activityType`: view | comment | approve | reject | upload | download | discuss
- `entityType`: segment | approval | document | task | milestone
- `entityId`: Reference to the entity
- `duration`: Time spent in seconds
- `ipAddress`, `userAgent`
- `metadata`: Additional context

**Use Cases:**
- Track client engagement
- Calculate time-on-page analytics
- Generate activity feeds
- Measure interaction patterns

### 3. ApprovalRecord
Manages approval workflows with digital signatures.

**Fields:**
- `id`, `projectId`, `segmentId`
- `title`, `description`
- `approvalType`: design | budget | material | milestone | change_order | final
- `status`: pending | approved | rejected | needs_discussion
- `priority`: low | normal | high | urgent
- `requestedBy`, `assignedTo`
- `dueDate`, `approvedAt`, `rejectedAt`
- `approvedBy`, `rejectedBy`, `rejectionReason`
- `documents`: Array of document references
- `comments`: Array of discussion comments
- `signature`: Digital signature data with timestamp and IP

**Features:**
- Digital signature capture
- Discussion threads
- Due date tracking
- Priority-based sorting

### 4. EngagementMetrics
Aggregated engagement analytics per project.

**Fields:**
- `projectId` (unique), `clientId`
- `totalViews`, `totalTimeSpent`
- `lastActivity`
- `approvalVelocity`: Average days to approval
- `responseRate`: Percentage of timely responses
- `satisfactionScore`: 1-5 scale
- `commentsCount`, `approvalsCount`, `rejectionsCount`
- `documentsViewed`, `documentsDownloaded`

**Auto-updated by:**
- ClientActivity logging
- Approval workflow actions
- Document interactions

### 5. NotificationPreference
User-specific notification settings.

**Fields:**
- `userId` (unique)
- `email`, `emailAddress`
- `sms`, `phoneNumber`
- `push`, `pushTokens`: Array of device tokens
- `channels`: Granular preferences by notification type
- `frequency`: immediate | daily_digest | weekly_digest
- `quietHours`: Start and end times

### 6. Notification
Notification records with multi-channel delivery.

**Fields:**
- `id`, `userId`, `projectId`
- `type`: approval_requested | status_update | comment | milestone | deadline | etc.
- `priority`: low | normal | high | urgent
- `title`, `message`, `actionUrl`
- `channels`: Which channels to use (email, sms, push)
- `status`: pending | sent | failed | read
- `sentAt`, `readAt`
- `deliveryStatus`: Channel-specific delivery tracking

### 7. ActiveConnection
WebSocket connection tracking.

**Fields:**
- `id`, `userId`, `projectId`, `socketId`
- `userAgent`, `ipAddress`
- `connectedAt`, `lastPingAt`

**Use Cases:**
- Real-time presence tracking
- Connection management
- Cleanup stale connections

## API Endpoints

### Timeline API

#### `POST /projects/:projectId/timeline/segments`
Create a new timeline segment.

**Request Body:**
```json
{
  "title": "Design Phase",
  "description": "Complete interior design and material selection",
  "phase": "design",
  "startDate": "2025-02-01",
  "endDate": "2025-03-15",
  "progress": 0,
  "dependencies": ["segment-id-1"],
  "deliverables": ["Floor plans", "Material boards", "3D renderings"],
  "order": 1
}
```

#### `GET /projects/:projectId/timeline`
Get full project timeline with all segments.

**Response:**
```json
{
  "projectId": "proj-123",
  "projectStatus": "active",
  "startDate": "2025-01-15",
  "endDate": "2025-12-31",
  "overallProgress": 45,
  "segmentCount": 5,
  "segments": [...]
}
```

#### `GET /projects/:projectId/timeline/segment/:segmentId`
Get detailed information about a specific segment.

#### `PATCH /projects/:projectId/timeline/segment/:segmentId`
Update segment details or progress.

#### `POST /projects/:projectId/timeline/activity`
Log client activity on the timeline.

**Request Body:**
```json
{
  "segmentId": "seg-123",
  "activityType": "view",
  "entityType": "segment",
  "entityId": "seg-123",
  "duration": 45
}
```

#### `GET /projects/:projectId/timeline/upcoming?days=30`
Get upcoming events, milestones, and deadlines.

#### `GET /projects/:projectId/timeline/progress`
Get detailed progress metrics.

**Response:**
```json
{
  "overallProgress": 45,
  "phaseProgress": {
    "planning": 100,
    "design": 75,
    "construction": 20
  },
  "statusDistribution": {
    "completed": 2,
    "in_progress": 2,
    "pending": 1
  },
  "timeProgress": 35,
  "milestoneCompletionRate": 60,
  "totalSegments": 5
}
```

### Approvals API

#### `POST /projects/:projectId/approvals`
Create a new approval request.

**Request Body:**
```json
{
  "segmentId": "seg-123",
  "title": "Material Selection Approval",
  "description": "Please review and approve the selected materials",
  "approvalType": "material",
  "priority": "high",
  "assignedTo": "client-user-id",
  "dueDate": "2025-02-15",
  "documents": ["doc-1", "doc-2"]
}
```

#### `GET /projects/:projectId/approvals?status=pending`
Get all approvals for a project, optionally filtered by status.

#### `GET /projects/:projectId/approvals/pending`
Get pending approvals sorted by priority and due date.

#### `GET /projects/:projectId/approvals/:approvalId`
Get specific approval details.

#### `POST /projects/:projectId/approvals/:approvalId/approve`
Approve an approval request.

**Request Body:**
```json
{
  "comments": "Looks great! Approved.",
  "signature": {
    "data": "base64-signature-image",
    "timestamp": "2025-02-14T10:30:00Z"
  }
}
```

#### `POST /projects/:projectId/approvals/:approvalId/reject`
Reject an approval request.

**Request Body:**
```json
{
  "reason": "Color palette needs revision",
  "comments": "Please consider warmer tones"
}
```

#### `POST /projects/:projectId/approvals/:approvalId/discuss`
Add a discussion comment.

**Request Body:**
```json
{
  "comment": "Can we schedule a call to discuss the materials?"
}
```

#### `PUT /projects/:projectId/approvals/:approvalId/signature`
Add or update digital signature.

**Request Body:**
```json
{
  "data": "base64-signature-image",
  "signerName": "John Doe"
}
```

#### `GET /projects/:projectId/approvals/metrics`
Get approval velocity and metrics.

**Response:**
```json
{
  "total": 25,
  "approved": 18,
  "rejected": 2,
  "pending": 5,
  "overdue": 1,
  "approvalRate": 90,
  "avgApprovalTimeDays": 2.5,
  "avgByPriority": {
    "urgent": 1.2,
    "high": 2.1,
    "normal": 3.5
  }
}
```

### Notifications API

#### `POST /notifications`
Create a notification (admin/designer only).

**Request Body:**
```json
{
  "userId": "client-123",
  "projectId": "proj-123",
  "type": "approval_requested",
  "priority": "high",
  "title": "New Approval Required",
  "message": "Material selection needs your approval",
  "actionUrl": "/projects/proj-123/approvals/appr-456",
  "channels": {
    "email": true,
    "sms": false,
    "push": true
  }
}
```

#### `POST /notifications/batch`
Create multiple notifications in batch.

#### `GET /notifications?status=pending&limit=50`
Get notifications for current user.

**Response:**
```json
{
  "data": [...],
  "total": 25,
  "unread": 5
}
```

#### `PATCH /notifications/:id/read`
Mark notification as read.

#### `POST /notifications/read-all?projectId=proj-123`
Mark all notifications as read (optionally for specific project).

#### `GET /notifications/preferences`
Get notification preferences for current user.

#### `PATCH /notifications/preferences`
Update notification preferences.

**Request Body:**
```json
{
  "email": true,
  "sms": false,
  "push": true,
  "frequency": "immediate",
  "quietHours": {
    "start": "22:00",
    "end": "08:00"
  },
  "channels": {
    "approval_requested": {
      "email": true,
      "sms": true,
      "push": true
    }
  }
}
```

#### `POST /notifications/push-token`
Register a push notification device token.

### Analytics API

#### `GET /projects/:projectId/analytics`
Get comprehensive analytics dashboard.

**Response:**
```json
{
  "projectId": "proj-123",
  "engagement": {...},
  "approvalVelocity": {...},
  "satisfaction": {...},
  "recentActivity": {...},
  "generatedAt": "2025-02-14T10:00:00Z"
}
```

#### `GET /projects/:projectId/analytics/engagement`
Get detailed engagement metrics.

**Response:**
```json
{
  "projectId": "proj-123",
  "clientId": "client-123",
  "totalViews": 145,
  "totalTimeSpent": 18000,
  "lastActivity": "2025-02-14T09:45:00Z",
  "approvalVelocity": 2.5,
  "responseRate": 95.5,
  "satisfactionScore": 4.5,
  "activityBreakdown": {...},
  "timeAnalytics": {...}
}
```

#### `GET /projects/:projectId/analytics/activity?days=30`
Get activity breakdown for specified period.

**Response:**
```json
{
  "periodDays": 30,
  "totalActivities": 234,
  "breakdown": {
    "view": { "count": 150, "totalDuration": 12000 },
    "comment": { "count": 45, "totalDuration": 0 },
    "approve": { "count": 20, "totalDuration": 0 }
  }
}
```

#### `GET /projects/:projectId/analytics/time-based?days=30`
Get time-based analytics (hourly/daily patterns).

**Response:**
```json
{
  "periodDays": 30,
  "dailyActivity": {...},
  "hourlyDistribution": {...},
  "peakEngagementHour": 14,
  "totalEngagementMinutes": 300
}
```

#### `GET /projects/:projectId/analytics/approvals`
Get approval velocity metrics.

#### `GET /projects/:projectId/analytics/satisfaction`
Get client satisfaction metrics.

#### `GET /analytics/user?projectId=proj-123`
Get analytics for current user across all projects (or specific project).

#### `GET /projects/:projectId/analytics/entity/:entityType/:entityId`
Get interaction tracking for specific entity.

**Response:**
```json
{
  "entityType": "segment",
  "entityId": "seg-123",
  "totalInteractions": 45,
  "uniqueUsers": 3,
  "totalViews": 35,
  "totalTimeSpentSeconds": 1800,
  "byUser": {...}
}
```

#### `PUT /projects/:projectId/analytics/satisfaction`
Update satisfaction score (1-5).

**Request Body:**
```json
{
  "score": 4.5
}
```

### Enhanced Projects API

#### `GET /projects/:id/client-view`
Get client-safe project data (filtered for client portal).

**Features:**
- Only shows client-relevant documents
- Includes pending approvals assigned to client
- Calculates overall progress
- Includes engagement metrics

**Response:**
```json
{
  "id": "proj-123",
  "title": "Modern Loft Renovation",
  "status": "active",
  "overallProgress": 45,
  "pendingApprovalsCount": 3,
  "timeline": [...],
  "milestones": [...],
  "approvals": [...],
  "documents": [...],
  "engagement": {...}
}
```

#### `GET /projects/:id/progress`
Get comprehensive progress metrics.

**Response:**
```json
{
  "projectId": "proj-123",
  "status": "active",
  "overallProgress": 45,
  "phaseProgress": {
    "planning": 100,
    "design": 75,
    "construction": 20
  },
  "timeProgress": 35,
  "taskCompletionRate": 60,
  "milestoneCompletionRate": 80,
  "timeline": {
    "totalDuration": 365,
    "daysElapsed": 128,
    "daysRemaining": 237
  },
  "health": {
    "isOnSchedule": true,
    "isBehindSchedule": false,
    "isAheadOfSchedule": false
  }
}
```

#### `GET /projects/:id/activity-feed?limit=50&offset=0`
Get activity feed for project.

**Response:**
```json
{
  "activities": [
    {
      "id": "act-1",
      "type": "audit",
      "entityType": "approval_record",
      "action": "approved",
      "actor": "client-123",
      "timestamp": "2025-02-14T10:00:00Z"
    },
    {
      "id": "act-2",
      "type": "client_activity",
      "activityType": "view",
      "userId": "client-123",
      "entityType": "segment",
      "timestamp": "2025-02-14T09:45:00Z",
      "duration": 45
    }
  ],
  "total": 234,
  "hasMore": true
}
```

#### `GET /projects/:id/upcoming?days=30`
Get upcoming events and deadlines.

**Response:**
```json
{
  "milestones": [...],
  "tasks": [...],
  "approvals": [...],
  "segments": [...],
  "totalEvents": 12
}
```

## WebSocket Real-Time API

### Connection

Connect to `/projects` namespace:

```javascript
import { io } from 'socket.io-client';

const socket = io('ws://localhost:3000/projects', {
  auth: {
    token: 'your-jwt-token'
  }
});

socket.on('connected', (data) => {
  console.log('Connected:', data);
});
```

### Subscribe to Project Updates

```javascript
socket.emit('subscribe:project', { projectId: 'proj-123' });

socket.on('subscribed:project', (data) => {
  console.log('Subscribed to project:', data.projectId);
});
```

### Real-Time Events

#### Timeline Updates
```javascript
socket.on('timeline:segment:updated', (data) => {
  // data: { segmentId, projectId, oldStatus, newStatus, oldProgress, newProgress }
});
```

#### Approval Events
```javascript
socket.on('approval:requested', (data) => {
  // data: { approvalId, projectId, assignedTo, approvalType, priority }
});

socket.on('approval:approved', (data) => {
  // data: { approvalId, projectId, approvedBy }
});

socket.on('approval:rejected', (data) => {
  // data: { approvalId, projectId, rejectedBy, reason }
});

socket.on('approval:discussed', (data) => {
  // data: { approvalId, projectId, userId }
});
```

#### Project Status
```javascript
socket.on('project:status:changed', (data) => {
  // data: { projectId, oldStatus, newStatus }
});
```

#### Activity Tracking
```javascript
socket.on('activity:logged', (data) => {
  // data: { projectId, userId, activityType }
});
```

### Presence Tracking

```javascript
socket.emit('presence:get', { projectId: 'proj-123' });

socket.on('presence:update', (data) => {
  // data: { projectId, activeUsers: [...], count: 3 }
});
```

### Keep-Alive

```javascript
setInterval(() => {
  socket.emit('ping');
}, 30000);

socket.on('pong', (data) => {
  console.log('Pong:', data.timestamp);
});
```

### Unsubscribe

```javascript
socket.emit('unsubscribe:project', { projectId: 'proj-123' });
```

## Background Jobs (Bull Queues)

### Notification Queue

**Jobs:**
- `send-email`: Send email notification
- `send-sms`: Send SMS notification
- `send-push`: Send push notification
- `send-digest`: Send daily/weekly digest

**Configuration:**
```typescript
{
  redis: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
  },
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2000
  }
}
```

## Event System

The service uses `@nestjs/event-emitter` for internal event handling:

### Event Types

- `project.created`
- `project.status_changed`
- `timeline.segment.created`
- `timeline.segment.updated`
- `approval.requested`
- `approval.approved`
- `approval.rejected`
- `approval.discussed`
- `activity.logged`

### Event Listeners

WebSocket gateway automatically listens for events and broadcasts to subscribed clients.

## Security Features

### Authentication
- JWT token validation for REST APIs
- JWT token validation for WebSocket connections
- Role-based access control (RBAC)

### Authorization
- Project access guards
- Client can only access their own projects
- Designers can only access assigned projects
- Admins have full access

### Data Privacy
- Client-safe data filtering
- Sensitive document filtering
- Activity tracking with IP logging
- Digital signature verification

## Performance Optimizations

### Database
- Indexed fields for fast queries
- Composite indexes on frequently queried combinations
- Connection pooling via Prisma

### Caching
- Redis caching for frequently accessed data
- WebSocket connection state in memory
- Presence tracking optimization

### Pagination
- All list endpoints support pagination
- Default limits to prevent overwhelming responses
- Offset-based pagination

### Real-Time
- Room-based broadcasting for efficiency
- Connection cleanup for stale connections
- Ping/pong for connection health

## Deployment Considerations

### Environment Variables
```env
DATABASE_URL=postgresql://...
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=...
CORS_ORIGIN=https://client.patina.com
JWT_SECRET=...
```

### Dependencies
- PostgreSQL 16+
- Redis 6+
- Node.js 20+
- Socket.io 4+

### Migrations
Run Prisma migrations to create new tables:
```bash
cd services/projects
npm run prisma:migrate
npm run prisma:generate
```

### Running the Service
```bash
# Development
npm run dev

# Production
npm run build
npm run start:prod
```

## Testing

### Unit Tests
```bash
npm test
```

### Integration Tests
```bash
npm run test:e2e
```

### WebSocket Testing
Use Socket.io client library or Postman WebSocket support.

## Monitoring & Observability

### Metrics to Track
- WebSocket connection count
- Active subscriptions per project
- Notification delivery success rate
- Approval velocity trends
- Client engagement scores
- API response times

### Logging
- All actions logged to AuditLog
- WebSocket connections/disconnections logged
- Failed notification deliveries logged
- Error tracking with stack traces

## Future Enhancements

1. **Video Integration**: Add support for video call scheduling and recording
2. **Document Collaboration**: Real-time collaborative document editing
3. **AI Insights**: ML-powered project health predictions
4. **Mobile Push**: Native mobile push notification support
5. **Advanced Analytics**: Custom dashboards and reports
6. **Workflow Automation**: Configurable approval workflows

## API Versioning

Current version: `v1`

All endpoints are prefixed with `/api/v1` (configured in main.ts).

## Rate Limiting

- 100 requests per minute per IP
- Configured via `@nestjs/throttler`
- Custom limits for specific endpoints

## Support

For issues or questions:
- Internal documentation: `/services/projects/README.md`
- Architecture details: `/services/projects/ARCHITECTURE.md`
- API reference: `/services/projects/API_REFERENCE.md`

---

**Delivered by Team Echo** - Backend Enhancements for Immersive Client Portal
**Date:** 2025-10-06
**Version:** 1.0.0
