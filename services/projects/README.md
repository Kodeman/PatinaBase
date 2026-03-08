# Patina Project Tracking Service

## Overview

The Project Tracking Service manages the complete lifecycle of design execution projects, from approved proposal to project closeout. It provides workflows for tasks, RFIs, change orders, issues, daily logs, documents, and milestones.

## Features

- **Project Management**: Create projects from approved proposals, track status lifecycle
- **Task Tracking**: Hierarchical tasks with assignees, due dates, and status workflows
- **RFIs (Requests for Information)**: Threaded Q&A with priority and due dates
- **Change Orders**: Full approval workflow with client consent
- **Issue Tracking**: Punch list management with severity levels
- **Daily Logs**: Field notes with photos, weather, activities
- **Document Management**: Versioned document storage and retrieval
- **Milestones**: Track key project deliverables and dates
- **Event Publishing**: Transactional outbox pattern for reliable event delivery
- **Audit Trail**: Complete immutable audit log for compliance

## Architecture

### Tech Stack
- **Framework**: NestJS 10.x
- **Database**: PostgreSQL 16 (via Prisma ORM)
- **Cache/Queue**: Redis 7.x
- **Events**: OCI Streaming (via outbox pattern)
- **Storage**: OCI Object Storage (for documents/photos)

### Key Patterns
- **Transactional Outbox**: All events stored in database, then published asynchronously
- **RBAC**: Role-based access control (admin, designer, client, contractor)
- **Audit Logging**: All mutations logged for compliance
- **Event Sourcing**: Complete change history via audit logs

## API Endpoints

### Projects (8 endpoints)
```
POST   /v1/projects                    # Create project
GET    /v1/projects                    # List projects (role-filtered)
GET    /v1/projects/:id                # Get project details
PATCH  /v1/projects/:id                # Update project
GET    /v1/projects/:id/stats          # Project statistics
```

### Tasks (6 endpoints)
```
POST   /v1/projects/:projectId/tasks           # Create task
GET    /v1/projects/:projectId/tasks           # List tasks
GET    /v1/projects/:projectId/tasks/:id       # Get task
PATCH  /v1/projects/:projectId/tasks/:id       # Update task
DELETE /v1/projects/:projectId/tasks/:id       # Delete task
POST   /v1/projects/:projectId/tasks/bulk-update # Bulk update
```

### RFIs (5 endpoints)
```
POST   /v1/projects/:projectId/rfis            # Create RFI
GET    /v1/projects/:projectId/rfis            # List RFIs
GET    /v1/projects/:projectId/rfis/overdue    # Overdue RFIs
GET    /v1/projects/:projectId/rfis/:id        # Get RFI
PATCH  /v1/projects/:projectId/rfis/:id        # Update/answer RFI
```

### Change Orders (7 endpoints)
```
POST   /v1/projects/:projectId/change-orders           # Create CO
GET    /v1/projects/:projectId/change-orders           # List COs
GET    /v1/change-orders/:id                           # Get CO
PATCH  /v1/change-orders/:id/submit                    # Submit for approval
PATCH  /v1/change-orders/:id/approve                   # Approve/reject (client)
PATCH  /v1/change-orders/:id/implement                 # Mark implemented
GET    /v1/change-orders/pending-approvals             # Client pending COs
```

### Issues (4 endpoints)
```
POST   /v1/projects/:projectId/issues          # Create issue
GET    /v1/projects/:projectId/issues          # List issues
GET    /v1/projects/:projectId/issues/:id      # Get issue
PATCH  /v1/projects/:projectId/issues/:id      # Update issue
```

### Daily Logs (4 endpoints)
```
POST   /v1/projects/:projectId/logs            # Create log
GET    /v1/projects/:projectId/logs            # List logs
GET    /v1/projects/:projectId/logs/:id        # Get log
PATCH  /v1/projects/:projectId/logs/:id        # Update log
```

### Documents (5 endpoints)
```
POST   /v1/projects/:projectId/documents           # Upload document
GET    /v1/projects/:projectId/documents           # List documents
GET    /v1/projects/:projectId/documents/:id       # Get document
GET    /v1/projects/:projectId/documents/versions/:title # Get versions
DELETE /v1/projects/:projectId/documents/:id       # Delete document
```

### Milestones (5 endpoints)
```
POST   /v1/projects/:projectId/milestones      # Create milestone
GET    /v1/projects/:projectId/milestones      # List milestones
GET    /v1/projects/:projectId/milestones/:id  # Get milestone
PATCH  /v1/projects/:projectId/milestones/:id  # Update milestone
DELETE /v1/projects/:projectId/milestones/:id  # Delete milestone
```

### Audit (4 endpoints - admin only)
```
GET    /v1/audit/logs                          # Query audit logs
GET    /v1/audit/entity/:type/:id              # Entity history
GET    /v1/audit/projects/:projectId           # Project audit trail
GET    /v1/audit/export                        # Export audit logs
```

**Total: 48+ API endpoints**

## Permissions

| Role       | Projects | Tasks | RFIs | Change Orders | Issues | Logs | Documents | Milestones | Audit |
|------------|----------|-------|------|---------------|--------|------|-----------|------------|-------|
| Admin      | Full     | Full  | Full | Full          | Full   | Full | Full      | Full       | Read  |
| Designer   | CRUD     | CRUD  | CRUD | Create/Submit | CRUD   | CRUD | CRUD      | CRUD       | -     |
| Client     | Read     | Read  | Read | Approve       | Create | Read | Read      | Read       | -     |
| Contractor | -        | Update| CRUD | -             | Update | CRUD | Upload    | -          | -     |

## Workflows

### Project Creation from Proposal
```
1. Designer creates project (POST /projects) with proposalId
2. Service fetches proposal data from Proposals service
3. Project created with status=draft
4. Designer can import items, budget, documents
5. Designer activates project (PATCH /projects/:id status=active)
```

### Task Lifecycle
```
Status Transitions:
  todo → in_progress → done
  todo → cancelled
  in_progress → blocked → in_progress
  in_progress → todo (reopen)
  done → in_progress (reopen)
```

### RFI Workflow
```
1. Designer/Contractor creates RFI (POST /rfis)
2. Assign to designer/vendor
3. Respond with answer (PATCH /rfis/:id)
4. Status: open → answered → closed
5. Overdue alerts for missed due dates
```

### Change Order Approval
```
1. Designer creates CO (POST /change-orders) status=draft
2. Designer submits (PATCH /change-orders/:id/submit) status=submitted
3. Client approves/rejects (PATCH /change-orders/:id/approve)
   - Approve: status=approved
   - Reject: status=rejected
4. Designer marks implemented (PATCH /change-orders/:id/implement)
5. CO locked after approval/rejection (immutable)
```

### Issue Resolution
```
1. Anyone creates issue (POST /issues) status=open
2. Assign to contractor/designer
3. Investigate: status=investigating
4. Resolve: status=resolved (with resolution notes)
5. Close: status=closed
```

## Events Published

All events use transactional outbox pattern:

- `project.created`, `project.status_changed`
- `task.created`, `task.status_changed`, `task.completed`, `task.deleted`, `task.bulk_updated`
- `rfi.created`, `rfi.status_changed`, `rfi.answered`
- `change_order.created`, `change_order.submitted`, `change_order.approved`, `change_order.rejected`, `change_order.implemented`
- `issue.created`, `issue.status_changed`, `issue.resolved`
- `log.created`
- `document.uploaded`
- `milestone.created`, `milestone.status_changed`, `milestone.completed`

## Integration Points

- **Proposals Service**: Import approved proposal data on project creation
- **Catalog Service**: Link to product procurement status
- **Orders Service**: Track fulfillment of project items
- **Comms Service**: Send notifications for assignments, approvals, due dates
- **Media Service**: Store/retrieve photos via PAR (pre-authenticated requests)

## Database Schema

See `/prisma/schema.prisma` for complete data model:
- Projects, Tasks, RFIs, ChangeOrders, Issues, DailyLogs, Documents, Milestones
- OutboxEvent (transactional event publishing)
- AuditLog (immutable audit trail)

## Development

### Setup
```bash
# Install dependencies
npm install

# Setup environment
cp .env.example .env
# Edit .env with your database credentials

# Generate Prisma client
npm run prisma:generate

# Run migrations
npm run prisma:migrate

# Start development server
npm run start:dev
```

### Testing
```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Test coverage
npm run test:cov
```

### API Documentation
```bash
npm run start:dev
# Open http://localhost:3004/api/docs
```

## Performance Targets

- **p95 Latency**:
  - Project fetch: < 250ms
  - Task update: < 200ms
  - RFI create: < 300ms
  - CO approval: < 400ms

- **Event Propagation**: ≤ 60s from mutation to downstream services

- **Availability**: 99.9% (core read APIs), 99.5% (write APIs)

## Monitoring

- **OTEL**: OpenTelemetry tracing for all requests
- **Metrics**: Task completion rates, RFI turnaround time, CO approval lead time
- **Alerts**: Overdue RFIs, pending COs, failed event publishing

## Security

- **Authentication**: Bearer JWT tokens (validated via AuthGuard)
- **Authorization**: Role-based access control (RolesGuard, ProjectAccessGuard)
- **Audit**: All mutations logged with actor, timestamp, changes
- **Data Protection**: PII masking, legal holds supported

## Future Enhancements

- Contractor portal and mobile app
- Advanced scheduling (Gantt, critical path)
- Payment applications and invoice workflows
- BIM/CAD integrations
- Real-time collaboration via WebSockets
