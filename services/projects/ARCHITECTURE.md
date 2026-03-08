# Project Tracking Service - Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CLIENT APPLICATIONS                          │
├──────────────┬──────────────┬──────────────┬─────────────────────────┤
│ Designer     │ Client iOS   │ Admin Portal │ Contractor App (future) │
│ Portal       │ App          │              │                         │
└──────┬───────┴──────┬───────┴──────┬───────┴─────────┬───────────────┘
       │              │              │                 │
       └──────────────┴──────────────┴─────────────────┘
                            │
                            ▼
       ┌────────────────────────────────────────────┐
       │     OCI WAF + Load Balancer + API GW      │
       └────────────────────┬───────────────────────┘
                            │
                            ▼
       ┌────────────────────────────────────────────┐
       │   PROJECT TRACKING SERVICE (NestJS)       │
       │   Port: 3004                               │
       │   Version: 1.0.0                           │
       └────────────────────┬───────────────────────┘
                            │
            ┌───────────────┼───────────────┐
            │               │               │
            ▼               ▼               ▼
    ┌──────────┐    ┌──────────┐    ┌──────────┐
    │PostgreSQL│    │  Redis   │    │  OCI     │
    │    16    │    │  Cache   │    │ Object   │
    │  (Prisma)│    │  Queue   │    │ Storage  │
    └──────────┘    └──────────┘    └──────────┘
            │
            ▼
    ┌──────────────┐
    │ OCI Streaming│
    │   (Events)   │
    └──────────────┘
            │
            ▼
    ┌──────────────────────────────────────────┐
    │     DOWNSTREAM SERVICES (Consumers)      │
    ├──────────┬───────────┬────────┬──────────┤
    │ Proposals│  Catalog  │ Orders │  Comms   │
    └──────────┴───────────┴────────┴──────────┘
```

---

## Module Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    APP MODULE (Root)                        │
└─────────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┴───────────────────┐
        │                                       │
┌───────▼─────────┐                  ┌──────────▼──────────┐
│  CORE MODULES   │                  │  FEATURE MODULES    │
├─────────────────┤                  ├─────────────────────┤
│ • PrismaModule  │                  │ • ProjectsModule    │
│ • ConfigModule  │                  │ • TasksModule       │
│ • EventsModule  │                  │ • RfisModule        │
│ • AuditModule   │                  │ • ChangeOrdersModule│
│                 │                  │ • IssuesModule      │
│                 │                  │ • DailyLogsModule   │
│                 │                  │ • DocumentsModule   │
│                 │                  │ • MilestonesModule  │
└─────────────────┘                  └─────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│                    SHARED UTILITIES                         │
├─────────────────────────────────────────────────────────────┤
│ • Guards (Auth, Roles, ProjectAccess)                       │
│ • Decorators (CurrentUser, Roles)                           │
│ • Interceptors (Logging, Transform)                         │
│ • Filters (Exception handling)                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Request Flow

### Authenticated Request Flow
```
1. Client Request
   ↓
2. AuthGuard (JWT validation)
   ↓
3. RolesGuard (Check user role)
   ↓
4. ProjectAccessGuard (Check project access)
   ↓
5. Controller (Route handler)
   ↓
6. Service (Business logic)
   ↓
7. Prisma (Database transaction)
   ├─→ Main entity operation
   ├─→ Create audit log
   └─→ Create outbox event
   ↓
8. EventEmitter (Emit in-memory event)
   ↓
9. Response to client
```

### Background Event Publishing
```
Every 10 seconds (Cron):
   ↓
1. EventsService.processOutboxEvents()
   ↓
2. Fetch unpublished events (limit 100)
   ↓
3. For each event:
   ├─→ Publish to OCI Streaming
   ├─→ Mark as published
   └─→ Or increment retry count (max 5)
   ↓
4. Log success/failure
```

---

## Data Model (Simplified)

```
┌──────────────┐
│   Project    │
│ (Core Entity)│
└──────┬───────┘
       │
       ├─1:N─┬──► Task
       │     └──► RFI
       │     └──► ChangeOrder
       │     └──► Issue
       │     └──► DailyLog
       │     └──► Document
       │     └──► Milestone
       │
       └─1:1──► Proposal (external)
       └─1:1──► Client (external)
       └─1:1──► Designer (external)

┌──────────────┐      ┌──────────────┐
│ OutboxEvent  │      │  AuditLog    │
│ (System)     │      │ (System)     │
└──────────────┘      └──────────────┘
```

---

## Module Responsibilities

### 1. Projects Module
**Purpose**: Project lifecycle management

**Responsibilities:**
- Create projects from proposals
- Manage project status (draft → active → substantial_completion → closed)
- Aggregate statistics from child entities
- Role-based filtering (clients see own, designers see own, admins see all)

**Key Methods:**
- `create()` - Import from proposal
- `findAll()` - Role-filtered list
- `findOne()` - Full project with recent activity
- `update()` - Update project details
- `getStats()` - Aggregate counts by status

---

### 2. Tasks Module
**Purpose**: Task tracking with workflow enforcement

**Responsibilities:**
- Create/update/delete tasks
- Enforce status transitions
- Bulk operations
- Assignment and due date tracking

**Status Workflow:**
```
todo → in_progress → done
  ↓         ↓
cancelled  blocked
```

**Key Methods:**
- `create()` - Create task
- `update()` - Update with transition validation
- `bulkUpdateStatus()` - Bulk status change
- `validateStatusTransition()` - Enforce workflow

---

### 3. RFIs Module
**Purpose**: Request for Information workflow

**Responsibilities:**
- Create RFIs with questions
- Track responses
- Priority and due date management
- Overdue alerts

**Key Methods:**
- `create()` - Create RFI
- `update()` - Answer RFI
- `getOverdue()` - Find overdue RFIs

---

### 4. Change Orders Module
**Purpose**: Change order approval workflow

**Responsibilities:**
- Create change orders
- Submit for approval
- Client approval/rejection
- Implementation tracking
- Immutability after approval

**Workflow:**
```
draft → submitted → approved/rejected → implemented
```

**Key Methods:**
- `create()` - Create CO
- `submit()` - Submit for approval
- `approve()` - Client approval/rejection
- `markImplemented()` - Mark complete
- `getPendingApprovals()` - Client pending list

---

### 5. Issues Module
**Purpose**: Punch list and defect tracking

**Responsibilities:**
- Issue creation with severity
- Photo attachment support
- Assignment workflow
- Resolution tracking

**Key Methods:**
- `create()` - Create issue
- `update()` - Update status/resolution
- `findAll()` - List with filtering

---

### 6. Daily Logs Module
**Purpose**: Field notes and progress documentation

**Responsibilities:**
- Daily log entries (unique per project/date)
- Weather tracking
- Photo attachments
- Activity logging

**Key Methods:**
- `create()` - Create log (enforces uniqueness)
- `findAll()` - List with date range
- `update()` - Update log

---

### 7. Documents Module
**Purpose**: Document storage with versioning

**Responsibilities:**
- Document upload
- Automatic versioning
- Category management
- Object storage integration

**Key Methods:**
- `create()` - Upload document (auto-version)
- `getVersions()` - Get all versions
- `remove()` - Delete document

---

### 8. Milestones Module
**Purpose**: Project milestone tracking

**Responsibilities:**
- Milestone creation
- Target date management
- Completion tracking
- Display ordering

**Key Methods:**
- `create()` - Create milestone
- `update()` - Update status
- `remove()` - Delete milestone

---

### 9. Events Module
**Purpose**: Transactional outbox event publishing

**Responsibilities:**
- Listen to domain events
- Store events in database (transactional)
- Background processing (every 10s)
- Publish to OCI Streaming
- Retry logic (max 5 attempts)
- Cleanup old events (7 day retention)

**Key Methods:**
- `handle*()` - Event listeners (20+ handlers)
- `createOutboxEvent()` - Store event transactionally
- `processOutboxEvents()` - Background job (cron)
- `publishToStream()` - OCI Streaming publish
- `cleanupPublishedEvents()` - Daily cleanup

---

### 10. Audit Module
**Purpose**: Immutable audit trail for compliance

**Responsibilities:**
- Query audit logs
- Entity history
- Project audit trail
- Export for compliance

**Key Methods:**
- `queryLogs()` - Search audit logs
- `getEntityHistory()` - Full entity history
- `getProjectAuditTrail()` - Project audit
- `exportAuditTrail()` - Compliance export

---

## Security Architecture

### Authentication Flow
```
1. Client sends Bearer token
   ↓
2. AuthGuard extracts token
   ↓
3. Decode JWT payload
   ↓
4. Extract user context:
   - id (sub)
   - email
   - role
   - name
   ↓
5. Inject into request.user
```

### Authorization Layers

**Layer 1: RolesGuard**
- Check if user role matches required roles
- @Roles('admin', 'designer') decorator

**Layer 2: ProjectAccessGuard**
- Admin: Access all projects
- Designer: Only assigned projects
- Client: Only own projects
- Contractor: Assigned projects (future)

**Layer 3: Business Logic**
- Service-level validation
- Ownership checks
- Workflow enforcement

---

## Event Architecture

### Transactional Outbox Pattern

**Why?**
- Ensures events are never lost
- Atomic with database operations
- At-least-once delivery guarantee
- Resilient to service failures

**Flow:**
```
Database Transaction:
┌─────────────────────────────────────┐
│ 1. Update entity (e.g., Task)      │
│ 2. Create AuditLog                 │
│ 3. Create OutboxEvent              │
│ COMMIT                              │
└─────────────────────────────────────┘
        │
        ▼
Background Processor (every 10s):
┌─────────────────────────────────────┐
│ 1. Fetch unpublished events        │
│ 2. Publish to OCI Streaming        │
│ 3. Mark as published                │
│ 4. Retry on failure (max 5)        │
└─────────────────────────────────────┘
```

**Event Types Published:**
- `project.*` - Project lifecycle
- `task.*` - Task updates
- `rfi.*` - RFI workflow
- `change_order.*` - CO approval flow
- `issue.*` - Issue tracking
- `log.*` - Daily logs
- `document.*` - Document uploads
- `milestone.*` - Milestone progress

---

## Database Schema

### Core Tables
```sql
projects
  ├── tasks
  ├── rfis
  ├── change_orders
  ├── issues
  ├── daily_logs
  ├── documents
  └── milestones

System Tables:
  ├── outbox_events
  └── audit_logs
```

### Key Indexes
```sql
projects:
  - (clientId, status)
  - (designerId, status)
  - (status, startDate)

tasks:
  - (projectId, status)
  - (assigneeId, status)
  - (dueDate)

change_orders:
  - (projectId, status)
  - (status, createdAt)

outbox_events:
  - (type, published)
  - (createdAt)

audit_logs:
  - (entityType, entityId)
  - (action)
  - (createdAt)
```

---

## Integration Points

### External Services

**1. Proposals Service**
- **When**: Project creation with proposalId
- **What**: Fetch approved proposal data
- **Data**: Items, budget, documents, client info
- **Method**: HTTP GET /v1/proposals/:id

**2. Catalog Service**
- **When**: Project dashboard view
- **What**: Product procurement status
- **Data**: Which items are in-stock, on-order
- **Method**: HTTP GET /v1/catalog/items?projectId=...

**3. Orders Service**
- **When**: Project progress tracking
- **What**: Fulfillment status
- **Data**: Order status, delivery dates
- **Method**: HTTP GET /v1/orders?projectId=...

**4. Comms Service**
- **When**: Events published
- **What**: Send notifications
- **Data**: Task assignments, CO approvals, overdue items
- **Method**: OCI Streaming → Comms consumes events

**5. Media Service**
- **When**: Document/photo upload
- **What**: Generate PAR URLs, store files
- **Data**: Files, metadata
- **Method**: HTTP POST /v1/media/upload

---

## Performance Optimization

### Caching Strategy
```
Redis Cache:
  - Project summaries (TTL: 5 min)
  - User permissions (TTL: 10 min)
  - Statistics (TTL: 1 min)
```

### Database Optimization
```
- Connection pooling (min: 5, max: 20)
- Query timeout: 30s
- Prepared statements (Prisma)
- Batch operations for bulk updates
```

### API Performance
```
- Response compression (gzip)
- Rate limiting (100/min)
- Pagination (max 100 items)
- Selective field inclusion
```

---

## Monitoring & Observability

### Metrics
```
Business Metrics:
  - Projects created per day
  - Tasks completed per project
  - RFI turnaround time
  - CO approval lead time
  - Issue resolution time

Technical Metrics:
  - Request latency (p50, p95, p99)
  - Error rate by endpoint
  - Database query time
  - Event publishing lag
  - Cache hit rate
```

### Tracing
```
OpenTelemetry:
  - Request tracing (trace ID)
  - Database query spans
  - External API calls
  - Event publishing spans
```

### Logging
```
Structured Logs:
  - Request logs (method, path, status, duration)
  - Error logs (stack traces)
  - Audit logs (who, what, when)
  - Event logs (published, failed)
```

---

## Deployment Architecture

### Container
```
Docker Image:
  - Base: node:20-alpine
  - Multi-stage build
  - Production dependencies only
  - Health check endpoint
  - Size: ~300MB
```

### OCI Deployment
```
┌─────────────────────────────────────┐
│         OCI Load Balancer           │
└─────────────┬───────────────────────┘
              │
    ┌─────────┴─────────┬─────────────┐
    │                   │             │
┌───▼────┐      ┌──────▼──┐    ┌────▼───┐
│ Pod 1  │      │ Pod 2   │    │ Pod 3  │
│ (2 CPU)│      │ (2 CPU) │    │ (2 CPU)│
│ (4GB)  │      │ (4GB)   │    │ (4GB)  │
└────────┘      └─────────┘    └────────┘
    │               │              │
    └───────────────┴──────────────┘
                    │
        ┌───────────┴───────────┐
        │                       │
┌───────▼────────┐    ┌─────────▼────────┐
│ PostgreSQL     │    │     Redis        │
│ (Multi-AD)     │    │   (Cluster)      │
└────────────────┘    └──────────────────┘
```

---

## Disaster Recovery

### Backup Strategy
```
Database:
  - Automated daily backups
  - Point-in-time recovery (7 days)
  - Multi-AD replication

Object Storage:
  - Cross-region replication
  - Versioning enabled
  - Lifecycle policies

Events:
  - Outbox table backups
  - Event replay capability
```

### Failover
```
- Auto-scaling (min: 2, max: 10 pods)
- Health checks (every 30s)
- Rolling deployments
- Zero-downtime updates
```

---

## Development Workflow

```
1. Code Changes
   ↓
2. Run Tests (npm run test)
   ↓
3. Linting (npm run lint)
   ↓
4. Build (npm run build)
   ↓
5. Prisma Generate (npm run prisma:generate)
   ↓
6. Docker Build
   ↓
7. Push to Registry
   ↓
8. Deploy to OCI
   ↓
9. Health Check
   ↓
10. Smoke Tests
```

---

## Scaling Considerations

### Horizontal Scaling
- Stateless pods (scale to 10+)
- Load balancer distribution
- Session-less architecture

### Vertical Scaling
- Database: Scale up to 16 CPU, 64GB RAM
- Redis: Scale cluster to 6 nodes
- Object Storage: Unlimited

### Bottlenecks
- Database connections (max 100 per pod)
- Event publishing lag (monitor outbox size)
- Object storage throughput (rate limiting)

---

For detailed API documentation, see: **API_REFERENCE.md**
For implementation details, see: **IMPLEMENTATION_SUMMARY.md**
