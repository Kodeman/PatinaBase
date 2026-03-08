# Roomscan Client Association & Scan Viewer

**Product Specification — Designer Portal**

---

**Document Version:** 1.0  
**Date:** January 2026  
**Status:** Draft  
**Owner:** Kody (Technical) / Leah (Design Validation)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Problem Statement](#problem-statement)
3. [User Research & Personas](#user-research--personas)
4. [Feature 1: Roomscan-Client Association](#feature-1-roomscan-client-association)
   - [Overview](#association-overview)
   - [Association Triggers](#association-triggers)
   - [Data Model](#data-model)
   - [User Flows](#user-flows)
   - [API Specification](#association-api-specification)
5. [Feature 2: Scan Viewer for Designer Portal](#feature-2-scan-viewer-for-designer-portal)
   - [Overview](#viewer-overview)
   - [Core Capabilities](#core-capabilities)
   - [Interface Design](#interface-design)
   - [Navigation Modes](#navigation-modes)
   - [Technical Architecture](#technical-architecture)
   - [API Specification](#viewer-api-specification)
6. [Implementation Plan](#implementation-plan)
7. [Success Metrics](#success-metrics)
8. [Edge Cases & Error Handling](#edge-cases--error-handling)
9. [System Integration](#system-integration)
10. [Appendices](#appendices)

---

## Executive Summary

This specification defines two interconnected features that form the foundation of designer-client collaboration within the Patina ecosystem.

When a homeowner scans their living room at 9pm on a Tuesday—phone in hand, walking slowly around the sofa—they're creating more than spatial data. They're capturing the *context* a designer needs to do meaningful work. The challenge is getting that context from the consumer's pocket to the designer's workflow without friction, without data loss, and without requiring anyone to think about the technology.

These features solve the handoff problem that plagues every design consultation: the designer who arrives at a site visit only to realize they needed different measurements, or the virtual designer who can't quite visualize the space from photos alone.

### Core Insight

> Every roomscan represents a potential project. The faster we connect that scan to a designer who can act on it, the more value we create for everyone in the ecosystem.

### Key Metrics at a Glance

| Metric | Value |
|--------|-------|
| Average Scanned Room Size | 17.1 m² |
| Time to Scan + Associate | 10-15 minutes |
| Target Initial Load Time | < 2 seconds |
| Measurement Accuracy | ± 2 cm |

---

## Problem Statement

### Current State Pain Points

#### 1. The Photo Folder Chaos
Designers receive 47 photos in an email titled "my living room." No context on which wall faces what, no measurements, no sense of scale. They spend the first 30 minutes of every consultation just getting oriented.

#### 2. The Measurement Mismatch
Client says "it's about 12 feet." They mean 10'8". That 16-inch difference means the sectional doesn't fit. Now everyone's frustrated and the designer looks incompetent.

#### 3. The Association Gap
Room scans exist in isolation. When a lead comes through, designers can't easily connect previous exploration to the current conversation. Context gets lost between touchpoints.

### The Hidden Cost

> Our research with Middlewest Studio revealed that designers spend an average of **45 minutes per client** just gathering and organizing spatial information before any design work begins. That's nearly 30% of a typical 2.5-hour initial consultation spent on what should be automated.

---

## User Research & Personas

### Primary Persona: The Solo Designer

- **Profile:** Independent Practitioner, 3-10 years experience
- **Pain Point:** Can't do site visits for every inquiry
- **Quote:** *"I need to see the space before I quote. But I can't do a site visit for every inquiry. If I could just see their room, I'd know in 5 minutes if this is a fit."*

### Secondary Persona: The Aspirational Homeowner

- **Profile:** Consumer App User, Budget $5K-$25K
- **Pain Point:** Doesn't want to repeat information they've already provided
- **Quote:** *"I scanned my room to play with furniture ideas. Now I'm actually thinking about hiring someone. Can't they just... use what I already did?"*

### User Stories

**Designer Perspective:**
> As a designer, I want to see a client's room scan attached to their lead card **so that** I can assess project scope and compatibility before my first conversation with them.

**Consumer Perspective:**
> As a consumer, I want my room scans to transfer to any designer I contact through Patina **so that** I don't have to explain my space twice or take more photos.

**Viewer Perspective:**
> As a designer, I want to navigate a 3D room scan in my browser **so that** I can understand spatial relationships, take measurements, and plan furniture layouts without a site visit.

---

## Feature 1: Roomscan-Client Association

### Association Overview

Room scans don't exist in a vacuum. They belong to spaces, and spaces belong to people—people who might become clients. The association system creates these connections automatically while preserving the consumer's control over their data.

### Association Triggers

The system creates scan-client associations through three distinct pathways:

| Trigger Event | Association Type | Designer Visibility | Consumer Action Required |
|---------------|------------------|---------------------|--------------------------|
| **Designer Request** — Consumer taps "Get Design Help" in app | Explicit • Full Access | All scans shared by consumer | Select which rooms to share |
| **Lead Conversion** — Designer accepts lead, client confirms | Project-Bound | Scans linked to project scope | Confirm designer access |
| **Existing Client Match** — Consumer email matches CRM record | Suggested • Pending Approval | Preview only until approved | Approve linking accounts |

> **Privacy by Design:** Consumers always see exactly what designers can access. Every association displays a clear "Shared with [Designer Name]" indicator on the scan card in their iOS app.

### Data Model

#### Core Association Entity

```typescript
interface RoomScanClientAssociation {
  id: string;                          // UUID
  roomScanId: string;                  // FK to room_scans table
  clientId: string;                    // FK to clients table (designer's CRM)
  consumerId: string;                  // FK to consumers table (app user)
  designerId: string;                  // FK to designers table
  
  // Association metadata
  associationType: 'explicit' | 'project_bound' | 'suggested';
  status: 'pending' | 'active' | 'revoked' | 'expired';
  
  // Access control
  accessLevel: 'full' | 'preview' | 'measurements_only';
  expiresAt: Date | null;              // null = no expiration
  
  // Audit trail
  createdAt: Date;
  createdBy: string;                   // Who initiated
  approvedAt: Date | null;
  approvedBy: string | null;           // Consumer confirmation
  
  // Project linking (optional)
  projectId: string | null;            // FK to projects table
}
```

#### Extended Room Scan Interface

```typescript
interface RoomScanWithAssociations extends RoomScanData {
  associations: RoomScanClientAssociation[];
  sharedWith: DesignerSummary[];
  accessibleBy: {
    designerId: string;
    accessLevel: string;
    projectContext?: string;
  }[];
}
```

#### Database Schema Extension

```sql
-- New junction table for scan-client associations
CREATE TABLE room_scan_associations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_scan_id UUID NOT NULL REFERENCES room_scans(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  consumer_id UUID NOT NULL REFERENCES consumers(id),
  designer_id UUID NOT NULL REFERENCES designers(id),
  
  association_type VARCHAR(20) NOT NULL CHECK (
    association_type IN ('explicit', 'project_bound', 'suggested')
  ),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'active', 'revoked', 'expired')
  ),
  access_level VARCHAR(20) NOT NULL DEFAULT 'full' CHECK (
    access_level IN ('full', 'preview', 'measurements_only')
  ),
  
  expires_at TIMESTAMPTZ,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL,
  approved_at TIMESTAMPTZ,
  approved_by UUID,
  revoked_at TIMESTAMPTZ,
  revoked_by UUID,
  
  UNIQUE(room_scan_id, designer_id)  -- One association per designer per scan
);

-- Index for designer lookups
CREATE INDEX idx_associations_designer 
  ON room_scan_associations(designer_id, status);

-- Index for consumer privacy dashboard
CREATE INDEX idx_associations_consumer 
  ON room_scan_associations(consumer_id, status);
```

### User Flows

#### Flow 1: Consumer Requests Designer Help

This is the primary "happy path" where a consumer actively seeks design assistance.

```
Consumer in iOS App → Taps "Get Design Help" → Selects Rooms to Share → Confirms Sharing → Lead Created
```

**iOS Screen: Share Rooms with Designer**

```
┌─────────────────────────────────────────────────────────────────┐
│  [Header]                                                        │
│  "Select Rooms to Share"                                         │
│  Designers see your room dimensions, layout, and photos          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  [✓] Living Room                           17.1 m² • 100%        │
│      Scanned Jan 15                                              │
│      [Preview thumbnail]                                         │
│                                                                  │
│  [ ] Master Bedroom                        14.2 m² • 60%         │
│      Incomplete - Tap to finish                                  │
│      [Preview thumbnail with overlay]                            │
│                                                                  │
│  [ ] Kitchen                               Not scanned           │
│      + Scan now                                                  │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│  What designers will see:                                        │
│  • 3D room layout with measurements                              │
│  • Window and door locations                                     │
│  • Existing furniture (if detected)                              │
│  • Your style preferences                                        │
│                                                                  │
│  What designers won't see:                                       │
│  • Your address (until you share it)                             │
│  • Personal photos on walls                                      │
│  • Financial information                                         │
├─────────────────────────────────────────────────────────────────┤
│  [  Share 1 Room & Request Designer  ]  (Primary Button)         │
└─────────────────────────────────────────────────────────────────┘
```

#### Flow 2: Designer Views Incoming Lead with Scans

From the designer's perspective, room scans appear as enriched context on lead cards.

```
Designer Portal → Lead Inbox → Lead Card (with scan badge) → Expand Scan Preview → Open Full Viewer
```

**Designer Portal: Lead Inbox**

```
┌─────────────────────────────────────────────────────────────────┐
│  NEW LEADS (3)                                  Filter ▼  Sort ▼ │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  [SCAN] Sarah M. • Living Room Refresh              Score: 87   │
│  ─────────────────────────────────────────────────────────────── │
│                                                                  │
│  ┌──────────┐  Budget: $8,000-$12,000                           │
│  │ [3D      │  Timeline: 2-3 months                             │
│  │  scan    │  Style: Modern Traditional                        │
│  │  thumb]  │  Distance: 4.2 miles                              │
│  │          │                                                    │
│  │  17.1m²  │  "Looking to update our living room. We have     │
│  └──────────┘   two kids and a dog, so durability..."           │
│                                                                  │
│  [🔍 View Scan]  [Accept]  [Decline]  [Save for Later]          │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│  James K. • Full Home Design                        Score: 72   │
│  ─────────────────────────────────────────────────────────────── │
│  Budget: $25,000+  •  No scans yet  •  15.8 miles               │
│                                                                  │
│  [Accept]  [Request Scans]  [Decline]  [Save for Later]         │
└─────────────────────────────────────────────────────────────────┘
```

#### Flow 3: Associating Scan with Existing Client

When a designer's existing CRM client creates a Patina account, the system suggests linking their records.

> **Smart Matching:** The system matches on email address first, then suggests matches based on name + approximate location. All suggested matches require explicit consumer approval—we never automatically link accounts.

### Association API Specification

#### Create New Association (Consumer-Initiated)

```http
POST /api/v1/room-scans/{scanId}/share
```

**Request:**
```json
{
  "designerId": "string | null",
  "accessLevel": "full | preview",
  "message": "string (optional)",
  "includeStyleProfile": true
}
```

**Response:**
```json
{
  "associationId": "string",
  "status": "pending",
  "sharedAt": "Date",
  "designer": {
    "id": "string",
    "name": "string",
    "avatar": "string"
  }
}
```

#### Designer Requests Access to Scan

```http
POST /api/v1/associations/request
```

**Request:**
```json
{
  "consumerId": "string",
  "roomScanIds": ["string"],
  "leadId": "string (optional)",
  "accessLevel": "full | measurements_only"
}
```

**Response:**
```json
{
  "requestId": "string",
  "status": "pending_consumer_approval",
  "expiresAt": "Date"
}
```

#### Consumer Approves/Denies Access Request

```http
POST /api/v1/associations/{associationId}/respond
```

**Request:**
```json
{
  "action": "approve | deny",
  "accessLevel": "full | preview (optional, can downgrade)",
  "expiresAt": "Date (optional)"
}
```

#### Revoke Association

```http
DELETE /api/v1/associations/{associationId}
```

**Response:**
```json
{
  "status": "revoked",
  "revokedAt": "Date"
}
```

#### List Associations for a Scan (Consumer View)

```http
GET /api/v1/room-scans/{scanId}/associations
```

**Response:**
```json
{
  "associations": [
    {
      "id": "string",
      "designer": {
        "id": "string",
        "name": "string",
        "avatar": "string",
        "company": "string"
      },
      "accessLevel": "string",
      "status": "string",
      "sharedAt": "Date",
      "lastAccessedAt": "Date",
      "project": {
        "id": "string",
        "name": "string",
        "status": "string"
      }
    }
  ]
}
```

#### List All Accessible Scans for a Designer

```http
GET /api/v1/designers/{designerId}/accessible-scans
```

**Query Parameters:**
- `clientId` (optional) — Filter by client
- `projectId` (optional) — Filter by project
- `status` (optional) — Filter by association status

**Response:**
```json
{
  "scans": [
    {
      "id": "string",
      "roomName": "string",
      "dimensions": "RoomDimensions",
      "scanQuality": "number",
      "thumbnailUrl": "string",
      "association": "AssociationSummary",
      "client": {
        "id": "string",
        "name": "string"
      }
    }
  ],
  "pagination": {}
}
```

---

## Feature 2: Scan Viewer for Designer Portal

### Viewer Overview

The Scan Viewer transforms LiDAR point clouds into an interactive planning environment. It's not just about seeing the room—it's about understanding the space well enough to design for it.

### Performance Targets

| Metric | Target |
|--------|--------|
| Initial Load Time | < 2 seconds |
| Navigation Frame Rate | 60 fps |
| Measurement Accuracy | ± 2 cm |
| Minimum Scan Quality | 92% |

### Core Capabilities

#### 1. Spatial Navigation
Orbit, pan, and zoom through the 3D mesh. First-person walkthrough mode lets designers experience the space at eye level. Preset views (top-down floor plan, each wall elevation) provide quick orientation.

#### 2. Interactive Measurement
Click any two points to get precise distance. Measure wall-to-wall, floor-to-ceiling, window widths, and clearances. Measurements persist and can be exported to proposals.

#### 3. Annotation System
Drop pins with notes directly in 3D space. "Move power outlet here." "Window faces north—good natural light." Annotations sync across team members and persist with the scan.

#### 4. Furniture Placement Preview
Drag products from the Patina catalog into the room to check fit. Not full AR—just bounding boxes with dimensions. Enough to answer "will a 96" sofa fit?"

### Interface Design

#### Viewer Layout

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ← Back to Lead                    Sarah M.'s Living Room                    │
│  ────────────────────────────────────────────────────────────────────────── │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────┐ ┌──────────┐ │
│  │                                                            │ │ DETAILS  │ │
│  │                                                            │ │          │ │
│  │                                                            │ │ Room     │ │
│  │                   ┌─────────────────┐                     │ │ 17.1 m²  │ │
│  │                   │                 │                     │ │ 184 ft²  │ │
│  │                   │    [3D Room     │                     │ │          │ │
│  │                   │     Mesh        │                     │ │ Ceiling  │ │
│  │                   │   Visualization │                     │ │ 2.7 m    │ │
│  │                   │       ]         │                     │ │          │ │
│  │                   │                 │                     │ │ Windows  │ │
│  │                   └─────────────────┘                     │ │ 2        │ │
│  │                                                            │ │          │ │
│  │   ┌─────────────────────────────────────────────────┐     │ │ Doors    │ │
│  │   │ 🧭 Orbit  │ 👁 Walk  │ ⬆ Top  │ 🧱 Walls │     │ │ 1        │ │
│  │   └─────────────────────────────────────────────────┘     │ │          │ │
│  │                                                            │ │──────────│ │
│  │   [📏 Measure]  [📌 Annotate]  [🪑 Place Furniture]       │ │ SCAN     │ │
│  │                                                            │ │ Quality  │ │
│  └───────────────────────────────────────────────────────────┘ │ ████████ │ │
│                                                                  │ 94%      │ │
│  ┌───────────────────────────────────────────────────────────┐ │          │ │
│  │  MEASUREMENTS (3)                                [Export] │ │ Scanned  │ │
│  │  ──────────────────────────────────────────────────────── │ │ Jan 15   │ │
│  │  North Wall Width .............. 4.52 m (14' 10")         │ │          │ │
│  │  Window to Corner .............. 1.23 m (4' 0")           │ │──────────│ │
│  │  Floor to Ceiling .............. 2.74 m (9' 0")           │ │ ACTIONS  │ │
│  └───────────────────────────────────────────────────────────┘ │          │ │
│                                                                  │ [Share]  │ │
│  ┌───────────────────────────────────────────────────────────┐ │ [Export] │ │
│  │  ANNOTATIONS (2)                                   [+ Add]│ │ [Add to  │ │
│  │  ──────────────────────────────────────────────────────── │ │ Proposal]│ │
│  │  📌 "Fireplace is gas - check if venting..."              │ │          │ │
│  │  📌 "Traffic flow from hallway - keep clear"              │ │          │ │
│  └───────────────────────────────────────────────────────────┘ └──────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Navigation Modes

| Mode | Input | Behavior | Best For |
|------|-------|----------|----------|
| **Orbit** (Default) | Left-drag rotates, scroll zooms, right-drag pans | Camera orbits around room center | Initial orientation, overall room feel |
| **Walkthrough** | WASD movement, mouse look, scroll adjusts eye height | First-person navigation at human scale | Experiencing sightlines, traffic flow |
| **Floor Plan** | Orthographic top-down, drag to pan | 2D view with wall outlines | Layout planning, furniture arrangement |
| **Wall Elevation** | Click wall to select, auto-positions camera | Flat-on view of selected wall | Art placement, window treatments |

### Measurement Tool Interaction

**Workflow:**

1. Click `[📏 Measure]` button — cursor changes to crosshair
2. Click first point on mesh surface → Blue dot appears → "Select second point" tooltip
3. Click second point → Line drawn between points → Distance displayed at midpoint → Panel updates with measurement details
4. Measurement persists until deleted (click X) or session ends (auto-saved to scan)

**Snap Points:**
- Wall corners (auto-detected)
- Window edges
- Door frames
- Floor/ceiling intersections

```
┌──────────────────────────────────────┐
│                                      │
│        [●]─────── 3.42m ──────[●]    │
│                  11' 2"              │
│                                      │
└──────────────────────────────────────┘
```

### Technical Architecture

#### Component Architecture

```typescript
interface ScanViewerProps {
  scanId: string;
  accessLevel: 'full' | 'preview' | 'measurements_only';
  onMeasurementCreated?: (measurement: Measurement) => void;
  onAnnotationCreated?: (annotation: Annotation) => void;
  initialViewMode?: ViewMode;
}

type ViewMode = 'orbit' | 'walkthrough' | 'floorplan' | 'elevation';

interface ScanViewerState {
  // Loading states
  meshLoadProgress: number;        // 0-100
  texturesLoaded: boolean;
  
  // Navigation
  viewMode: ViewMode;
  cameraPosition: Vector3;
  cameraTarget: Vector3;
  
  // Tools
  activeTool: 'none' | 'measure' | 'annotate' | 'place';
  pendingMeasurement: Partial<Measurement> | null;
  
  // Data
  measurements: Measurement[];
  annotations: Annotation[];
  placedFurniture: PlacedItem[];
}
```

#### Data Interfaces

```typescript
interface Measurement {
  id: string;
  startPoint: Vector3;
  endPoint: Vector3;
  distance: number;              // meters
  distanceFormatted: {
    metric: string;              // "3.42 m"
    imperial: string;            // "11' 2""
  };
  label?: string;                // User-provided name
  createdAt: Date;
  createdBy: string;
}

interface Annotation {
  id: string;
  position: Vector3;
  normal: Vector3;               // Surface normal for pin orientation
  text: string;
  category: 'note' | 'question' | 'issue' | 'opportunity';
  createdAt: Date;
  createdBy: string;
  resolvedAt?: Date;
}
```

#### Progressive Loading Strategy

| Time | Stage | Details |
|------|-------|---------|
| 0-500ms | Bounding Box & Dimensions | Render wireframe room outline with basic measurements. Designer can see room size immediately. |
| 500ms-1.5s | Low-Poly Mesh (LOD 0) | Load simplified mesh (~10K triangles). Walls, floor, ceiling visible. Navigation enabled. |
| 1.5s-3s | Medium Detail (LOD 1) | Stream higher-resolution mesh (~50K triangles). Windows, doors, architectural details visible. |
| 3s+ | Full Detail + Textures (LOD 2) | Complete mesh with captured textures. Photo-realistic rendering where captured. |

> **Performance Note:** Mesh data is stored in USDZ format (Apple's native AR format) and converted to glTF for web rendering. We maintain both formats to enable seamless iOS ↔ Web parity without re-processing.

### Viewer API Specification

#### Get Scan Data for Viewer

```http
GET /api/v1/room-scans/{scanId}/viewer-data
```

**Response:**
```json
{
  "scan": {
    "id": "string",
    "roomName": "string",
    "dimensions": "RoomDimensions",
    "scanQuality": "number",
    "capturedAt": "Date",
    "features": "DetectedFeatures"
  },
  "assets": {
    "meshLOD0": { "url": "string", "size": "number" },
    "meshLOD1": { "url": "string", "size": "number" },
    "meshLOD2": { "url": "string", "size": "number" },
    "textureAtlas": { "url": "string", "size": "number" }
  },
  "metadata": {
    "wallSegments": "WallSegment[]",
    "windowPositions": "BoundingBox[]",
    "doorPositions": "BoundingBox[]",
    "snapPoints": "Vector3[]"
  },
  "annotations": "Annotation[]",
  "measurements": "Measurement[]",
  "placedFurniture": "PlacedItem[]"
}
```

#### Save Measurement

```http
POST /api/v1/room-scans/{scanId}/measurements
```

**Request:**
```json
{
  "startPoint": { "x": "number", "y": "number", "z": "number" },
  "endPoint": { "x": "number", "y": "number", "z": "number" },
  "label": "string (optional)"
}
```

**Response:**
```json
{
  "id": "string",
  "distance": "number",
  "distanceFormatted": {
    "metric": "string",
    "imperial": "string"
  }
}
```

#### Save Annotation

```http
POST /api/v1/room-scans/{scanId}/annotations
```

**Request:**
```json
{
  "position": { "x": "number", "y": "number", "z": "number" },
  "normal": { "x": "number", "y": "number", "z": "number" },
  "text": "string",
  "category": "note | question | issue | opportunity"
}
```

#### Export Scan Data for Proposal

```http
GET /api/v1/room-scans/{scanId}/export
```

**Query Parameters:**
- `format`: `pdf | png | json`
- `views`: `all | floorplan | elevations`
- `includeMeasurements`: `boolean`
- `includeAnnotations`: `boolean`

**Response:**
```json
{
  "exportUrl": "string",
  "expiresAt": "Date"
}
```

---

## Implementation Plan

### Phased Rollout

```
Phase 1 ──────► Phase 2 ──────► Phase 3 ──────► Phase 4
Foundation     Core Viewer     Tools & Polish  Beta & Iterate
Weeks 1-3      Weeks 4-6       Weeks 7-9       Weeks 10-12
```

### Phase 1: Foundation (Weeks 1-3)

**Focus:** Database schema, association API, basic consumer sharing flow in iOS app

**Deliverables:**
- [ ] Schema migration for associations table
- [ ] Association CRUD endpoints
- [ ] iOS: "Share with Designer" flow
- [ ] Designer Portal: Association badges on leads

### Phase 2: Core Viewer (Weeks 4-6)

**Focus:** Three.js viewer with navigation modes and basic measurements

**Deliverables:**
- [ ] Viewer component scaffolding
- [ ] Progressive mesh loading pipeline
- [ ] Orbit and floor plan navigation
- [ ] Point-to-point measurement tool

### Phase 3: Tools & Polish (Weeks 7-9)

**Focus:** Annotation system, furniture placement, export functionality

**Deliverables:**
- [ ] Annotation pins with categories
- [ ] Walkthrough navigation mode
- [ ] Bounding box furniture placement
- [ ] PDF/PNG export for proposals

### Phase 4: Beta & Iterate (Weeks 10-12)

**Focus:** Middlewest Studio testing, refinements, performance optimization

**Deliverables:**
- [ ] Leah validates with real client data
- [ ] Performance profiling & optimization
- [ ] Edge case handling (poor scans, etc.)
- [ ] Documentation and onboarding flow

---

## Success Metrics

### Key Performance Indicators

| Metric | Target |
|--------|--------|
| Leads with Scans | 80% |
| Time to First View | < 30 seconds |
| Measurements per Scan | 3+ |
| Consultation Prep Time Reduction | -45 minutes |

### Detailed Metrics Table

| Metric | Current State | 30-Day Target | 90-Day Target | Measurement Method |
|--------|---------------|---------------|---------------|-------------------|
| **Association Rate** — % of scans shared with designers | 0% | 40% | 80% | `associations / total_scans` |
| **Viewer Engagement** — Avg time in scan viewer per session | N/A | 3 minutes | 5 minutes | Session duration tracking |
| **Measurement Adoption** — % of viewer sessions with measurements | N/A | 50% | 75% | `measurement_events / viewer_sessions` |
| **Lead Qualification Speed** — Time from lead receipt to accept/decline | 4.2 hours | 2 hours | 45 minutes | `lead_response_time` average |
| **Export Usage** — % of viewed scans exported to proposals | N/A | 20% | 40% | `exports / unique_scan_views` |

---

## Edge Cases & Error Handling

### Low-Quality Scans

**Trigger:** Scan quality falls below 70%

**Behavior:**
- Display warning badge on scan card
- Offer guidance on how consumer can improve the scan
- Viewer still loads but measurements show confidence intervals
- Prompt: "This scan may have measurement inaccuracies"

### Revoked Access

**Trigger:** Consumer revokes access mid-project

**Behavior:**
- Designer sees "Scan No Longer Available" state
- Measurements and annotations they created remain visible
- Mesh is removed from viewer
- Clear messaging about what happened

### Incomplete Scans

**Trigger:** Scan completion < 60%

**Behavior:**
- Show partial mesh with "incomplete" overlay regions
- System prompts consumer to complete scan before sharing
- If shared anyway, designer sees clear incomplete indicators
- Measurements limited to completed regions

### Large File Sizes

**Trigger:** Room size > 50m²

**Behavior:**
- Implement aggressive LOD streaming
- Initial view may take longer to reach full detail
- Progress indicator shows loading status
- Option to load "Quick View" with reduced detail

---

## System Integration

### Integration Points

| System | Integration Type | Data Flow |
|--------|------------------|-----------|
| **iOS App** | Source of Truth | Scans created here → uploaded to S3 → metadata to DB |
| **Lead Inbox** | Consumer | Displays scan badges, quick preview, link to viewer |
| **Client CRM** | Consumer | Associates scans with client records, displays scan history |
| **Proposal Builder** | Consumer | Imports measurements, floor plan images for proposals |
| **Project Tracking** | Reference | Links scans to projects, tracks which scans inform which work |
| **The Aesthete Engine** | Input | Room dimensions inform furniture size recommendations |

### Data Flow Diagram

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   iOS App   │────▶│     S3      │────▶│  PostgreSQL │
│  (RoomPlan) │     │  (Assets)   │     │  (Metadata) │
└─────────────┘     └─────────────┘     └─────────────┘
                           │                    │
                           ▼                    ▼
                    ┌─────────────┐     ┌─────────────┐
                    │   CDN       │     │  Designer   │
                    │  (Delivery) │     │   Portal    │
                    └─────────────┘     └─────────────┘
                           │                    │
                           └──────────┬─────────┘
                                      ▼
                              ┌─────────────┐
                              │ Scan Viewer │
                              │  (Three.js) │
                              └─────────────┘
```

---

## Appendices

### Appendix A: Glossary

| Term | Definition |
|------|------------|
| **Room Scan** | 3D spatial capture of a room created via iOS RoomPlan API. Includes point cloud, mesh, dimensions, and detected features. |
| **Association** | The relationship between a room scan and a designer/client pair. Controls access permissions and tracks usage. |
| **LOD (Level of Detail)** | Progressive mesh quality levels. LOD 0 is lowest detail (fastest load), LOD 2 is full detail with textures. |
| **Snap Point** | Pre-calculated positions where measurements naturally align—corners, edges, architectural features. |
| **Scan Quality Score** | 0-100% metric indicating completeness and accuracy. Factors include coverage, lighting, stability during capture. |

### Appendix B: Technology Stack

| Component | Technology |
|-----------|------------|
| 3D Rendering | Three.js (WebGL) |
| Mesh Format (Storage) | USDZ (Apple native) |
| Mesh Format (Web) | glTF 2.0 |
| Asset Storage | AWS S3 |
| Asset Delivery | CloudFront CDN |
| Database | PostgreSQL with PostGIS |
| API Layer | Node.js / Express |
| iOS Capture | RoomPlan API (iOS 16+) |

### Appendix C: Related Documentation

- **iOS App Design Document:** `/02-product/ios-app/design-document.md`
- **Designer Portal PRD:** `/02-product/designer-portal/prd.md`
- **Aesthete Engine Ecosystem:** `/02-product/aesthete-engine/ecosystem.md`
- **API Standards:** `/04-api/api-standards.md`
- **Data Models:** `/03-architecture/data-models/README.md`

### Appendix D: Open Questions

1. **Scan Retention Policy:** How long do we retain scans after project completion? Proposal: 2 years with option to archive.

2. **Multi-Designer Access:** Can a consumer share the same scan with multiple designers? Current assumption: Yes, each association is independent.

3. **Offline Viewer:** Should designers be able to download scans for offline viewing? Phase 2 consideration.

4. **Annotation Visibility:** Are consumer annotations visible to designers? Current assumption: No, separate annotation spaces.

---

*Document Version: 1.0 | Last Updated: January 2026*  
*Synthesized from Patina-docs repository for product development*
