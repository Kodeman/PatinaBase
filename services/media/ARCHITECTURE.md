# Media & 3D Pipeline - Architecture Documentation

## Executive Summary

The Patina Media & 3D Pipeline Service is a cloud-native, microservices-based system built on Oracle Cloud Infrastructure (OCI) that handles the complete lifecycle of media assets from upload to CDN delivery. It processes both 2D images and 3D models with enterprise-grade quality controls, security scanning, and performance optimization.

## System Architecture

### High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                          Client Layer                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │   iOS App    │  │   Designer   │  │      Admin Portal       │  │
│  │   (SwiftUI)  │  │    Portal    │  │      (Next.js)          │  │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘  │
└────────────────────────────┬─────────────────────────────────────────┘
                             │
                             │ HTTPS/TLS 1.3
                             ▼
┌──────────────────────────────────────────────────────────────────────┐
│                          Edge Layer (OCI)                             │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  WAF (Web Application Firewall) → DDoS Protection              │ │
│  └────────────────────────┬───────────────────────────────────────┘ │
│                           ▼                                          │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  OCI API Gateway                                                │ │
│  │  • JWT Validation (OIDC via Identity Domains)                  │ │
│  │  • Rate Limiting (per-user, per-IP)                            │ │
│  │  • Request Routing & Path Rewrite                              │ │
│  │  • CORS Policy Enforcement                                      │ │
│  └────────────────────────┬───────────────────────────────────────┘ │
└────────────────────────────┼──────────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────────┐
│                      Application Layer (OKE)                          │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    Media API Service (NestJS)                 │  │
│  │                                                                │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │  │
│  │  │   Upload     │  │    Assets    │  │   Transform      │   │  │
│  │  │   Module     │  │    Module    │  │    Module        │   │  │
│  │  └──────────────┘  └──────────────┘  └──────────────────┘   │  │
│  │                                                                │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │  │
│  │  │     3D       │  │    Jobs      │  │   Security       │   │  │
│  │  │   Module     │  │   Module     │  │    Module        │   │  │
│  │  └──────────────┘  └──────────────┘  └──────────────────┘   │  │
│  │                                                                │  │
│  │  Replicas: 3-10 (HPA based on CPU/Memory)                     │  │
│  └──────────────────────────┬───────────────────────────────────┘  │
│                              │                                       │
│                              ▼                                       │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │              Background Workers (Containerized)               │  │
│  │                                                                │  │
│  │  ┌──────────────────────┐        ┌──────────────────────┐   │  │
│  │  │  Transform Workers   │        │    3D Workers        │   │  │
│  │  │  • Image Processing  │        │  • GLB/USDZ Export   │   │  │
│  │  │  • Rendition Gen     │        │  • Geometry Optimize │   │  │
│  │  │  • Metadata Extract  │        │  • Material Convert  │   │  │
│  │  │  Replicas: 2-20      │        │  • Snapshot Render   │   │  │
│  │  └──────────────────────┘        │  Replicas: 1-10      │   │  │
│  │                                   └──────────────────────┘   │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                  Supporting Services                          │  │
│  │                                                                │  │
│  │  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐    │  │
│  │  │  imgproxy   │  │   ClamAV     │  │     Redis        │    │  │
│  │  │  (On-demand │  │   (Virus     │  │  (BullMQ Queues) │    │  │
│  │  │  transforms)│  │   Scanning)  │  │                  │    │  │
│  │  └─────────────┘  └──────────────┘  └──────────────────┘    │  │
│  └──────────────────────────────────────────────────────────────┘  │
└───────────────────────────┬───────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────────┐
│                        Data Layer (OCI)                               │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  PostgreSQL 16 (OCI Database Service)                          │ │
│  │  • Asset metadata, renditions, 3D stats                        │ │
│  │  • Job state, upload sessions                                  │ │
│  │  • License records, QC issues                                  │ │
│  │  • Backup: Daily snapshots, 7-day retention                    │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  OCI Object Storage (Multi-bucket Architecture)                │ │
│  │                                                                 │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐   │ │
│  │  │ media-raw    │  │media-process │  │  media-public     │   │ │
│  │  │ (Private)    │  │  (Private)   │  │  (CDN-backed)     │   │ │
│  │  │              │  │              │  │                   │   │ │
│  │  │ • Upload via │  │ • Renditions │  │ • Public assets   │   │ │
│  │  │   PAR        │  │ • Optimized  │  │ • Cached at edge  │   │ │
│  │  │ • 15min TTL  │  │   models     │  │ • Lifecycle: 90d  │   │ │
│  │  │              │  │ • Previews   │  │                   │   │ │
│  │  └──────────────┘  └──────────────┘  └───────────────────┘   │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  OCI CDN (Edge Delivery)                                        │ │
│  │  • Global edge locations                                        │ │
│  │  • Cache-Control headers                                        │ │
│  │  • Origin pull from media-public bucket                         │ │
│  │  • Target hit rate: ≥80%                                        │ │
│  └────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│                    Events & Observability Layer                       │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  OCI Streaming (Event Bus)                                      │ │
│  │  Topics:                                                        │ │
│  │  • media.upload.requested                                       │ │
│  │  • media.uploaded                                               │ │
│  │  • media.processed                                              │ │
│  │  • media.failed                                                 │ │
│  │  • media.rights.expiring                                        │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  OpenTelemetry → OCI APM/Monitoring/Logging                    │ │
│  │  • Distributed tracing                                          │ │
│  │  • Metrics: latency, error rate, throughput                     │ │
│  │  • Structured logs with correlation IDs                         │ │
│  │  • SLO dashboards and alerts                                    │ │
│  └────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Media API Service (NestJS)

**Purpose**: Primary REST API for media operations

**Responsibilities**:
- Handle upload intents and PAR generation
- Asset metadata CRUD operations
- Job orchestration and monitoring
- Search and filtering
- Admin operations

**Key Technologies**:
- NestJS 10 (TypeScript)
- Prisma ORM
- Class-validator for DTOs
- Swagger/OpenAPI for docs
- Bull for job queues

**Scaling**:
- Horizontal: 3-10 pods via HPA
- Triggers: CPU >70%, Memory >80%
- Max response time: 300ms (p95)

### 2. Transform Workers

**Purpose**: Process image transformations asynchronously

**Responsibilities**:
- Generate renditions (256px - 2048px)
- Format conversion (JPEG, PNG, WebP, AVIF)
- EXIF orientation correction
- Metadata extraction (pHash, blurhash, palette)
- Quality metrics calculation

**Key Technologies**:
- Sharp (high-performance image processing)
- exif-parser
- node-vibrant (color palette)
- blurhash

**Scaling**:
- Horizontal: 2-20 workers
- Job-based autoscaling via queue depth
- SLO: <60s p95 per image

### 3. 3D Workers

**Purpose**: Process 3D model conversions and optimizations

**Responsibilities**:
- Import GLB/GLTF/FBX/OBJ/DAE
- Normalize (Y-up, meters, center pivot)
- Geometry optimization (Draco compression)
- Material conversion (PBR)
- Texture optimization (KTX2)
- LOD generation
- USDZ export for AR
- Preview snapshot rendering

**Key Technologies**:
- gltf-transform (GLB processing)
- Draco compression
- Basis Universal (KTX2)
- Custom USDZ exporter

**Scaling**:
- Horizontal: 1-10 workers
- CPU-intensive, higher resource limits
- SLO: <180s p95 per model

### 4. Storage Service (OCI Object Storage)

**Bucket Architecture**:

**media-raw (Private)**
- Uploaded via PAR (15-min TTL)
- Original files preserved
- Lifecycle: Archive after 30 days
- Encryption: AES-256 at rest

**media-processed (Private)**
- Optimized renditions
- Processed 3D models
- Preview images
- Access via signed URLs or PAR

**media-public (CDN-backed)**
- Public-facing assets
- CDN origin pull
- Lifecycle: Delete after 90 days if unused
- Cache-Control: public, max-age=31536000

### 5. Job Queue System (BullMQ + Redis)

**Queue Types**:
- `media:image_process` - Image pipeline
- `media:image_transform` - On-demand transforms
- `media:model3d_convert` - 3D conversion
- `media:model3d_optimize` - 3D optimization
- `media:snapshot_generate` - 3D preview rendering
- `media:virus_scan` - Malware scanning
- `media:metadata_extract` - Metadata extraction

**Features**:
- Priority-based processing
- Exponential backoff retry (max 3 attempts)
- Job progress tracking
- Dead letter queue for failures
- Idempotency via job ID

### 6. Virus Scanner (ClamAV)

**Purpose**: Malware detection and quarantine

**Workflow**:
1. Intercept all uploaded files
2. Scan buffer/stream
3. Quarantine if infected
4. Update asset status
5. Emit security event

**Configuration**:
- Signature updates: Daily
- Scan timeout: 30s
- Max file size: 500MB
- Fallback: Quarantine on error

## Data Flow

### Image Upload & Processing Flow

```
1. Client Request
   └→ POST /v1/media/upload
      {kind: "IMAGE", filename: "hero.jpg", ...}

2. API Service
   └→ Validate intent (MIME, size, role)
   └→ Create MediaAsset record (status: PENDING)
   └→ Generate object key: raw/images/{assetId}/hero.jpg
   └→ Create PAR (15-min TTL, ObjectWrite)
   └→ Create UploadSession
   └→ Return: {assetId, parUrl, targetKey, expiresAt}

3. Client Direct Upload
   └→ PUT {parUrl}
      Headers: {x-content-type: image/jpeg}
      Body: <binary image data>

4. Object Storage Event
   └→ Trigger: ObjectCreated event
   └→ Webhook → API Service
   └→ Update UploadSession (status: UPLOADED)
   └→ Update MediaAsset (rawKey: ...)

5. Job Enqueue
   └→ Create ProcessJob (type: IMAGE_PROCESS, state: QUEUED)
   └→ BullMQ.add('media:image_process', {jobId, assetId})

6. Transform Worker (picks job)
   └→ Download from raw bucket
   └→ Virus scan (ClamAV)
      ├→ If infected: Quarantine, STOP
      └→ If clean: Continue
   └→ Apply EXIF orientation
   └→ Convert to sRGB
   └→ Strip EXIF (privacy)
   └→ Generate renditions (sizes × formats)
      ├→ 256px × [jpeg, webp, avif]
      ├→ 512px × [jpeg, webp, avif]
      ├→ ... up to 2048px
   └→ Extract metadata
      ├→ pHash (perceptual hash)
      ├→ Blurhash (preview)
      ├→ Color palette (k-means)
      ├→ Quality metrics
   └→ Validate dimensions vs role
      ├→ HERO: ≥1600px short edge
      ├→ ANGLE: ≥1200px short edge
   └→ Upload renditions to processed bucket
   └→ Update MediaAsset
      ├→ status: READY
      ├→ width, height, format
      ├→ phash, blurhash, palette
      ├→ qcScore, qcIssues
   └→ Create AssetRendition records
   └→ Update ProcessJob (state: SUCCEEDED)

7. Event Emission
   └→ OCI Streaming: media.processed
      {assetId, renditions: [...], metadata: {...}}

8. Downstream Consumers
   └→ Catalog Service: Index asset
   └→ Search Service: Update index
   └→ Aesthete Engine: Generate embeddings
```

### 3D Model Upload & Processing Flow

```
1-4. [Same as Image flow, with kind: MODEL3D]

5. Job Enqueue
   └→ ProcessJob (type: MODEL3D_CONVERT)
   └→ BullMQ.add('media:model3d_convert', {jobId, assetId})

6. 3D Worker (picks job)
   └→ Download from raw bucket
   └→ Virus scan
   └→ Parse model (detect format)
   └→ Validate constraints
      ├→ Triangles ≤500k
      ├→ Nodes ≤500
      ├→ Textures ≤8
      ├→ Materials: PBR only
   └→ Normalize
      ├→ Convert units to meters
      ├→ Rotate to Y-up axis
      ├→ Center pivot at base
      ├→ Zero root rotations
   └→ Optimize geometry
      ├→ Weld vertices
      ├→ Remove degenerates
      ├→ Mesh decimation (target tri count)
      ├→ Apply Draco compression
   └→ Optimize materials & textures
      ├→ Convert to PBR metallic-roughness
      ├→ Pack ORM textures (Occlusion/Roughness/Metallic)
      ├→ Convert to KTX2 (Basis Universal)
      ├→ Resize if >4K
   └→ Generate LODs
      ├→ LOD0: 100% (original optimized)
      ├→ LOD1: 50% tri count
      ├→ LOD2: 25% tri count
   └→ Export GLB
      ├→ Embed/external textures
      ├→ KHR_draco_mesh_compression
      ├→ Upload to processed bucket
   └→ Export USDZ (for iOS AR Quick Look)
      ├→ Bake materials for compatibility
      ├→ Embed textures (no KTX2)
      ├→ Upload to processed bucket
   └→ Generate preview snapshots
      ├→ Render: front, iso, top views
      ├→ Neutral lighting, white BG
      ├→ 1600px JPEG
      ├→ Upload to previews/3d/{assetId}/
   └→ Calculate dimensions (AABB)
      ├→ widthM, heightM, depthM, volumeM3
   └→ Validate AR readiness
      ├→ GLB loads successfully
      ├→ USDZ loads successfully
      ├→ File sizes <25MB each
   └→ Update MediaAsset + ThreeDAsset
   └→ ProcessJob (state: SUCCEEDED)

7. Event: media.processed (with 3D metadata)
```

## Security Architecture

### Authentication & Authorization

**OCI Identity Domains (OIDC/OAuth2)**
- JWT access tokens (15-min expiry)
- Refresh tokens (7-day expiry)
- Standard scopes: `media:read`, `media:write`, `media:admin`
- Service-to-service: Client credentials flow

**API Gateway**
- JWT validation at edge
- Scope-based route authorization
- Rate limiting: 60/min per user, 1000/min per IP

### Data Protection

**In Transit**
- TLS 1.3 for all connections
- Certificate pinning for mobile clients
- Signed URLs for sensitive assets

**At Rest**
- AES-256 encryption (OCI default)
- Encrypted backups
- Secrets in OCI Vault/KMS

**Privacy**
- EXIF stripping for public images
- GPS data removed
- PII detection (planned)

### Abuse Prevention

**Virus Scanning**
- ClamAV integration
- Automatic quarantine
- Daily signature updates

**Upload Controls**
- PAR: 15-min TTL, single-use
- File size limits: Image 50MB, 3D 500MB
- MIME type validation
- Content inspection

**Rate Limiting**
- Upload intents: 60/min per user
- Reprocess: 30/min per user
- Admin scans: 10/min

## Observability & Monitoring

### Metrics (Prometheus/OCI Monitoring)

**Service Metrics**
- Request rate, latency (p50, p95, p99)
- Error rate by endpoint
- Active connections
- Pod CPU/Memory utilization

**Business Metrics**
- Assets processed/hour
- Processing duration by type
- Queue depth per job type
- CDN hit rate
- Storage utilization by bucket

**SLO Metrics**
- Image pipeline latency (target: <60s p95)
- 3D pipeline latency (target: <180s p95)
- Error rate (target: <0.5% weekly)
- API availability (target: 99.9%)

### Tracing (OpenTelemetry → OCI APM)

**Trace Hierarchy**
```
media.upload.request
├── auth.validate_jwt
├── storage.generate_par
├── db.create_asset
└── db.create_session

media.process.image
├── storage.download
├── virus.scan
├── image.extract_metadata
├── image.generate_renditions
│   ├── rendition.256px.webp
│   ├── rendition.512px.webp
│   └── ...
└── storage.upload_batch
```

### Logging (Structured JSON)

**Log Levels**
- ERROR: Failures, exceptions
- WARN: Retries, QC issues, near-limits
- INFO: Lifecycle events, job state changes
- DEBUG: Detailed processing steps

**Log Context**
- `requestId` (X-Request-Id)
- `traceId` (traceparent)
- `userId`
- `assetId`
- `jobId`

### Dashboards

**Operations Dashboard**
- Service health (all pods)
- Queue depths & processing rates
- Error rate trends
- P95 latency by endpoint

**SLO Dashboard**
- Image pipeline latency (hourly)
- 3D pipeline latency (hourly)
- Weekly error budget burn
- CDN hit rate (daily)

**Business Dashboard**
- Assets processed (by type, by day)
- Storage growth trends
- Top errors/QC issues
- License expiry pipeline

### Alerts

**Critical (PagerDuty)**
- API error rate >1% for 5min
- Queue depth >10k for 10min
- Database connection failures
- Object Storage quota >90%

**Warning (Slack)**
- SLO burn rate >2x for 1hr
- Worker pod crashes >3 in 10min
- Virus scan failures
- License expiring <7 days

## Performance Optimization

### Image Processing

**Sharp Configuration**
- Concurrency: Auto (CPU cores)
- Cache: 50MB tile cache
- Threads: Max available
- SIMD acceleration enabled

**Rendition Strategy**
- Parallel generation (Promise.all)
- Format priority: AVIF > WebP > JPEG
- Quality presets by size
- Progressive encoding

### 3D Processing

**Draco Compression**
- Position quantization: 14 bits
- Normal/UV quantization: 10 bits
- Compression level: 7 (high)

**Texture Optimization**
- KTX2 + Basis Universal
- ETC1S compression (mobile-friendly)
- Mipmap generation
- Target: 2K max for mobile

### Caching Strategy

**Application Cache (Redis)**
- Asset metadata: TTL 1hr
- Job status: TTL 5min
- User sessions: TTL 15min

**CDN Cache (OCI)**
- Public assets: max-age=31536000 (1 year)
- Immutable content (hashed URLs)
- Vary: Accept (format negotiation)
- Stale-while-revalidate: 86400s

### Database Optimization

**Indexes**
- `MediaAsset`: (kind, status), (productId), (phash), (createdAt)
- `ProcessJob`: (assetId, state), (type, state), (state, queuedAt)
- `UploadSession`: (userId), (expiresAt)

**Connection Pooling**
- Min: 5, Max: 20 per pod
- Idle timeout: 10s
- Query timeout: 30s

## Disaster Recovery

### Backup Strategy

**Database**
- Automated daily snapshots
- Retention: 7 days
- Point-in-time recovery: 24hrs
- Cross-region replication (optional)

**Object Storage**
- Lifecycle rules: Archive raw >30 days
- Cross-region replication for critical assets
- Versioning enabled for processed bucket

### Recovery Procedures

**Database Failure**
1. Promote read replica (if multi-AD)
2. Update connection strings
3. Verify replication lag
4. Resume operations

**Object Storage Outage**
1. Fail over to cross-region bucket
2. Update CDN origin
3. Invalidate edge cache
4. Monitor sync lag

**Complete Region Failure**
1. Activate DR region (OCI Frankfurt)
2. DNS failover (TTL: 60s)
3. Restore from latest backup
4. Replay event log from Streaming

**RTO/RPO**
- RTO: 1 hour
- RPO: 15 minutes (event log replay)

## Cost Optimization

### Storage Tiers

- **Raw bucket**: Standard → Archive after 30 days
- **Processed bucket**: Standard (hot access)
- **Public bucket**: Standard + CDN

### Compute Optimization

- Spot instances for workers (up to 50% savings)
- Autoscaling: scale-to-zero for 3D workers off-peak
- Right-sized pods: CPU/Memory limits tuned per workload

### Data Transfer

- CDN reduces origin bandwidth by 80%
- In-region transfers (OCI Object Storage ↔ OKE)
- Compression: Brotli for text, AVIF/WebP for images

### Monitoring

- Monthly cost report by service
- Anomaly detection for unexpected spend
- Budget alerts at 80%/100% thresholds

## Appendix

### Tech Stack Summary

| Component | Technology | Version |
|-----------|-----------|---------|
| Runtime | Node.js | 20 LTS |
| Framework | NestJS | 10.x |
| Language | TypeScript | 5.x |
| Database | PostgreSQL | 16 |
| ORM | Prisma | 5.x |
| Cache/Queue | Redis | 7.x |
| Job Queue | BullMQ | 5.x |
| Image Processing | Sharp | 0.33.x |
| 3D Processing | gltf-transform | Custom |
| Virus Scan | ClamAV | Latest |
| Container Runtime | Docker | 24.x |
| Orchestration | Kubernetes (OKE) | 1.28+ |
| API Docs | Swagger/OpenAPI | 3.1 |
| Observability | OpenTelemetry | 1.x |

### Key Dependencies

```json
{
  "dependencies": {
    "@nestjs/core": "^10.3.0",
    "@prisma/client": "^5.8.0",
    "bullmq": "^5.1.0",
    "sharp": "^0.33.1",
    "oci-objectstorage": "^2.71.0",
    "blurhash": "^2.0.5",
    "node-vibrant": "^3.2.1"
  }
}
```

### API Reference

Full OpenAPI spec available at: `/api/docs`

Interactive documentation with request/response examples, authentication flows, and error codes.

### Related Documentation

- [PRD: Patina Media & 3D Pipeline](/home/middle/patina/docs/features/06-media-pipeline/Patina_Media_3D_Pipeline_PRD_OCI.md)
- [API Standards](/home/middle/patina/docs/features/16-api-standards/)
- [Infrastructure & DevOps](/home/middle/patina/docs/features/21-infra-devops/)
- [Security & Compliance](/home/middle/patina/docs/features/15-security-compliance/)
