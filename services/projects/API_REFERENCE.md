# Project Tracking Service - API Reference

**Base URL**: `http://localhost:3004/v1`
**Authentication**: Bearer JWT Token
**Documentation**: `http://localhost:3004/api/docs`

---

## API Endpoints Summary

| Module | Endpoints | Description |
|--------|-----------|-------------|
| Projects | 5 | Project lifecycle management |
| Tasks | 6 | Task tracking with workflows |
| RFIs | 5 | Request for Information |
| Change Orders | 7 | Approval workflows |
| Issues | 4 | Punch list tracking |
| Daily Logs | 4 | Field notes |
| Documents | 5 | Document versioning |
| Milestones | 5 | Milestone tracking |
| Audit | 4 | Audit trail (admin) |
| **TOTAL** | **48+** | **Complete API** |

---

## 1. Projects API

### POST /v1/projects
Create a new project (optionally from approved proposal)

**Permissions**: Designer, Admin

**Request:**
```json
{
  "proposalId": "uuid",           // Optional: import from proposal
  "title": "Kitchen Remodel",
  "clientId": "client-uuid",
  "designerId": "designer-uuid",
  "startDate": "2025-01-15",      // Optional
  "endDate": "2025-06-30",        // Optional
  "budget": 75000,                // Optional
  "currency": "USD",              // Optional, default: USD
  "description": "Full kitchen renovation" // Optional
}
```

**Response:**
```json
{
  "id": "project-uuid",
  "title": "Kitchen Remodel",
  "clientId": "client-uuid",
  "designerId": "designer-uuid",
  "status": "draft",
  "budget": "75000.00",
  "currency": "USD",
  "createdAt": "2025-10-03T10:00:00Z",
  "updatedAt": "2025-10-03T10:00:00Z",
  "tasks": [],
  "rfis": [],
  "changeOrders": [],
  "issues": []
}
```

---

### GET /v1/projects
List projects (filtered by user role)

**Permissions**: Designer (own), Client (own), Admin (all)

**Query Parameters:**
- `clientId` - Filter by client
- `designerId` - Filter by designer
- `status` - Filter by status (draft|active|substantial_completion|closed)
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 20, max: 100)

**Response:**
```json
{
  "data": [
    {
      "id": "project-uuid",
      "title": "Kitchen Remodel",
      "status": "active",
      "_count": {
        "tasks": 15,
        "rfis": 2,
        "changeOrders": 1,
        "issues": 3
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 42,
    "totalPages": 3
  }
}
```

---

### GET /v1/projects/:id
Get project details with recent activity

**Permissions**: Designer (own), Client (own), Admin (all)

**Response:**
```json
{
  "id": "project-uuid",
  "title": "Kitchen Remodel",
  "clientId": "client-uuid",
  "designerId": "designer-uuid",
  "status": "active",
  "budget": "75000.00",
  "tasks": [...],              // Recent 10 tasks
  "rfis": [...],               // Recent 5 open RFIs
  "changeOrders": [...],       // Recent 5 COs
  "issues": [...],             // Recent 5 open issues
  "milestones": [...],         // All milestones
  "_count": {
    "tasks": 15,
    "rfis": 2,
    "changeOrders": 1,
    "issues": 3,
    "dailyLogs": 10,
    "documents": 25
  }
}
```

---

### PATCH /v1/projects/:id
Update project details

**Permissions**: Designer (own), Admin (all)

**Request:**
```json
{
  "title": "Updated Title",     // Optional
  "status": "active",            // Optional
  "endDate": "2025-07-15",      // Optional
  "budget": 80000                // Optional
}
```

---

### GET /v1/projects/:id/stats
Get project statistics

**Permissions**: Designer (own), Client (own), Admin (all)

**Response:**
```json
{
  "tasks": {
    "todo": 5,
    "in_progress": 3,
    "blocked": 1,
    "done": 6
  },
  "rfis": {
    "open": 2,
    "answered": 3,
    "closed": 5
  },
  "issues": {
    "open": 2,
    "investigating": 1,
    "resolved": 4
  },
  "changeOrders": {
    "draft": 0,
    "submitted": 1,
    "approved": 2,
    "rejected": 0
  }
}
```

---

## 2. Tasks API

### POST /v1/projects/:projectId/tasks
Create a new task

**Permissions**: Designer, Admin

**Request:**
```json
{
  "title": "Install cabinets",
  "description": "Install all base and wall cabinets",
  "assigneeId": "contractor-uuid",  // Optional
  "dueDate": "2025-02-15",          // Optional
  "priority": "high",               // low|medium|high|urgent
  "order": 1                        // Optional, default: 0
}
```

**Response:**
```json
{
  "id": "task-uuid",
  "projectId": "project-uuid",
  "title": "Install cabinets",
  "status": "todo",
  "priority": "high",
  "order": 1,
  "createdAt": "2025-10-03T10:00:00Z"
}
```

---

### GET /v1/projects/:projectId/tasks
List all tasks for a project

**Permissions**: Designer, Client, Contractor, Admin

**Query Parameters:**
- `status` - Filter by status (todo|in_progress|blocked|done|cancelled)

**Response:**
```json
[
  {
    "id": "task-uuid",
    "title": "Install cabinets",
    "status": "in_progress",
    "priority": "high",
    "assigneeId": "contractor-uuid",
    "dueDate": "2025-02-15",
    "completedAt": null
  }
]
```

---

### PATCH /v1/projects/:projectId/tasks/:id
Update task (with status validation)

**Permissions**: Designer, Contractor, Admin

**Request:**
```json
{
  "status": "in_progress",      // Valid transitions only
  "assigneeId": "contractor-2", // Optional
  "dueDate": "2025-02-20"       // Optional
}
```

**Status Transitions:**
```
todo → in_progress, cancelled
in_progress → blocked, done, todo, cancelled
blocked → in_progress, cancelled
done → in_progress (reopen)
cancelled → todo
```

---

### DELETE /v1/projects/:projectId/tasks/:id
Delete a task

**Permissions**: Designer, Admin

**Response:** 204 No Content

---

### POST /v1/projects/:projectId/tasks/bulk-update
Bulk update task statuses

**Permissions**: Designer, Admin

**Request:**
```json
{
  "taskIds": ["task-1", "task-2", "task-3"],
  "status": "done"
}
```

**Response:**
```json
{
  "updated": 3,
  "taskIds": ["task-1", "task-2", "task-3"]
}
```

---

## 3. RFIs API

### POST /v1/projects/:projectId/rfis
Create a Request for Information

**Permissions**: Designer, Contractor, Admin

**Request:**
```json
{
  "title": "Cabinet dimensions",
  "question": "What are the exact dimensions for the island cabinets?",
  "assignedTo": "designer-uuid",  // Optional
  "dueDate": "2025-02-01",        // Optional
  "priority": "urgent"            // normal|urgent
}
```

---

### GET /v1/projects/:projectId/rfis
List RFIs

**Permissions**: Designer, Client, Contractor, Admin

**Query Parameters:**
- `status` - Filter by status (open|answered|closed|cancelled)

---

### GET /v1/projects/:projectId/rfis/overdue
Get overdue RFIs

**Permissions**: Designer, Admin

**Response:**
```json
[
  {
    "id": "rfi-uuid",
    "title": "Cabinet dimensions",
    "status": "open",
    "dueDate": "2025-01-30",
    "priority": "urgent",
    "project": {
      "id": "project-uuid",
      "title": "Kitchen Remodel"
    }
  }
]
```

---

### PATCH /v1/projects/:projectId/rfis/:id
Answer/update RFI

**Permissions**: Designer, Contractor, Admin

**Request:**
```json
{
  "answer": "Island cabinet dimensions are 36\"W x 24\"D x 36\"H",
  "status": "answered"
}
```

---

## 4. Change Orders API

### POST /v1/projects/:projectId/change-orders
Create a change order

**Permissions**: Designer, Admin

**Request:**
```json
{
  "title": "Upgrade to quartz countertops",
  "description": "Change from granite to premium quartz",
  "costImpact": 5000,           // Positive = increase
  "scheduleImpact": 7           // Days (positive = delay)
}
```

**Response:**
```json
{
  "id": "co-uuid",
  "projectId": "project-uuid",
  "title": "Upgrade to quartz countertops",
  "status": "draft",
  "costImpact": "5000.00",
  "scheduleImpact": 7,
  "createdAt": "2025-10-03T10:00:00Z"
}
```

---

### PATCH /v1/change-orders/:id/submit
Submit change order for client approval

**Permissions**: Designer, Admin

**Response:**
```json
{
  "id": "co-uuid",
  "status": "submitted",
  "updatedAt": "2025-10-03T11:00:00Z"
}
```

---

### PATCH /v1/change-orders/:id/approve
Approve or reject change order

**Permissions**: Client (own projects), Admin

**Request:**
```json
{
  "action": "approve",          // approve|reject
  "reason": "Approved for implementation"
}
```

**Response:**
```json
{
  "id": "co-uuid",
  "status": "approved",
  "approvedBy": "client-uuid",
  "approvedAt": "2025-10-03T12:00:00Z",
  "reason": "Approved for implementation"
}
```

---

### PATCH /v1/change-orders/:id/implement
Mark change order as implemented

**Permissions**: Designer, Admin

**Response:**
```json
{
  "id": "co-uuid",
  "status": "implemented",
  "updatedAt": "2025-10-03T14:00:00Z"
}
```

---

### GET /v1/change-orders/pending-approvals
Get pending change orders for client

**Permissions**: Client, Admin

**Response:**
```json
[
  {
    "id": "co-uuid",
    "title": "Upgrade to quartz countertops",
    "status": "submitted",
    "costImpact": "5000.00",
    "project": {
      "id": "project-uuid",
      "title": "Kitchen Remodel"
    }
  }
]
```

---

## 5. Issues API

### POST /v1/projects/:projectId/issues
Create an issue

**Permissions**: Designer, Client, Contractor, Admin

**Request:**
```json
{
  "title": "Cabinet door misalignment",
  "description": "Upper cabinet doors are not aligned properly",
  "severity": "medium",         // low|medium|high|critical
  "assignedTo": "contractor-uuid",
  "metadata": {
    "location": "Kitchen - West Wall",
    "photos": ["photo-key-1", "photo-key-2"]
  }
}
```

---

### GET /v1/projects/:projectId/issues
List issues

**Query Parameters:**
- `status` - Filter by status (open|investigating|resolved|closed|wont_fix)

---

### PATCH /v1/projects/:projectId/issues/:id
Update issue

**Request:**
```json
{
  "status": "resolved",
  "resolution": "Doors realigned and adjusted"
}
```

---

## 6. Daily Logs API

### POST /v1/projects/:projectId/logs
Create a daily log entry

**Permissions**: Designer, Contractor, Admin

**Request:**
```json
{
  "date": "2025-02-10",
  "notes": "Installed base cabinets, plumbing rough-in complete",
  "weather": "Good",            // Good|Fair|Poor|N/A
  "photos": ["photo-key-1", "photo-key-2"],
  "attendees": ["contractor-1", "designer-1"],
  "activities": [
    "Base cabinet installation",
    "Plumbing rough-in",
    "Electrical inspection passed"
  ]
}
```

---

### GET /v1/projects/:projectId/logs
List daily logs

**Query Parameters:**
- `startDate` - Filter from date
- `endDate` - Filter to date

---

## 7. Documents API

### POST /v1/projects/:projectId/documents
Upload a document

**Permissions**: Designer, Contractor, Admin

**Request:**
```json
{
  "title": "Kitchen Floor Plan",
  "key": "projects/proj-123/drawings/floor-plan-v2.pdf",
  "category": "drawing",        // contract|drawing|spec|photo|invoice|other
  "size": 2048576,              // Bytes
  "mimeType": "application/pdf"
}
```

**Response:**
```json
{
  "id": "doc-uuid",
  "title": "Kitchen Floor Plan",
  "key": "projects/proj-123/drawings/floor-plan-v2.pdf",
  "category": "drawing",
  "version": 2,                 // Auto-incremented
  "uploadedBy": "designer-uuid",
  "createdAt": "2025-10-03T10:00:00Z"
}
```

---

### GET /v1/projects/:projectId/documents/versions/:title
Get all versions of a document

**Response:**
```json
[
  {
    "id": "doc-uuid-2",
    "title": "Kitchen Floor Plan",
    "version": 2,
    "createdAt": "2025-10-03T10:00:00Z"
  },
  {
    "id": "doc-uuid-1",
    "title": "Kitchen Floor Plan",
    "version": 1,
    "createdAt": "2025-09-15T10:00:00Z"
  }
]
```

---

## 8. Milestones API

### POST /v1/projects/:projectId/milestones
Create a milestone

**Permissions**: Designer, Admin

**Request:**
```json
{
  "title": "Cabinets Installed",
  "description": "All kitchen cabinets installed and secured",
  "targetDate": "2025-02-28",
  "order": 1
}
```

---

### PATCH /v1/projects/:projectId/milestones/:id
Update milestone

**Request:**
```json
{
  "status": "completed",        // pending|completed|delayed|cancelled
  "targetDate": "2025-03-05"
}
```

---

## 9. Audit API (Admin Only)

### GET /v1/audit/logs
Query audit logs

**Permissions**: Admin only

**Query Parameters:**
- `entityType` - Filter by entity (project|task|rfi|change_order|issue|daily_log|document)
- `entityId` - Filter by specific entity ID
- `action` - Filter by action (created|updated|deleted|approved|etc)
- `actor` - Filter by user who performed action
- `startDate` - Filter from date
- `endDate` - Filter to date
- `page` - Page number
- `limit` - Items per page

**Response:**
```json
{
  "data": [
    {
      "id": "audit-uuid",
      "entityType": "change_order",
      "entityId": "co-uuid",
      "action": "approved",
      "actor": "client-uuid",
      "changes": {
        "status": "approved",
        "approvedBy": "client-uuid"
      },
      "createdAt": "2025-10-03T12:00:00Z"
    }
  ],
  "pagination": { ... }
}
```

---

### GET /v1/audit/entity/:entityType/:entityId
Get complete history of an entity

**Response:**
```json
[
  {
    "id": "audit-1",
    "action": "created",
    "actor": "designer-uuid",
    "createdAt": "2025-10-01T10:00:00Z"
  },
  {
    "id": "audit-2",
    "action": "updated",
    "actor": "designer-uuid",
    "changes": { "status": "submitted" },
    "createdAt": "2025-10-02T11:00:00Z"
  },
  {
    "id": "audit-3",
    "action": "approved",
    "actor": "client-uuid",
    "changes": { "status": "approved" },
    "createdAt": "2025-10-03T12:00:00Z"
  }
]
```

---

### GET /v1/audit/projects/:projectId
Get complete audit trail for a project

**Response:**
All audit logs related to the project and its nested entities.

---

### GET /v1/audit/export
Export audit logs for compliance

**Response:**
Complete audit log dataset (no pagination).

---

## Error Responses

### 400 Bad Request
```json
{
  "statusCode": 400,
  "message": "Invalid status transition from 'done' to 'blocked'",
  "error": "Bad Request"
}
```

### 401 Unauthorized
```json
{
  "statusCode": 401,
  "message": "No authorization header",
  "error": "Unauthorized"
}
```

### 403 Forbidden
```json
{
  "statusCode": 403,
  "message": "You do not have access to this project",
  "error": "Forbidden"
}
```

### 404 Not Found
```json
{
  "statusCode": 404,
  "message": "Project not found",
  "error": "Not Found"
}
```

### 409 Conflict
```json
{
  "statusCode": 409,
  "message": "Daily log already exists for this date",
  "error": "Conflict"
}
```

---

## Rate Limiting

- **Default**: 100 requests per minute per IP
- **Burst**: Short bursts allowed up to 120 requests
- **Headers**:
  - `X-RateLimit-Limit`: Request limit
  - `X-RateLimit-Remaining`: Requests remaining
  - `X-RateLimit-Reset`: Time when limit resets

---

## Webhooks (Future)

Coming soon: webhook subscriptions for real-time event notifications.

**Planned Events:**
- `project.status_changed`
- `task.completed`
- `change_order.approved`
- `issue.created`

---

## SDK Support (Future)

Coming soon: Official SDKs for:
- JavaScript/TypeScript
- Python
- Swift (iOS)
- Kotlin (Android)

---

For interactive API testing, visit: **http://localhost:3004/api/docs**
