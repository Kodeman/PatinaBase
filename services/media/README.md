# Patina Media & 3D Pipeline Service

Complete media asset processing pipeline for images and 3D models, built on Oracle Cloud Infrastructure (OCI).

## Overview

The Media & 3D Pipeline Service provides a robust, scalable solution for:

- **Image Processing**: Upload, transform, optimize, and deliver images with multiple renditions
- **3D Asset Pipeline**: Convert, optimize, and validate GLB/USDZ models for web and AR
- **Virus Scanning**: Automatic malware detection using ClamAV
- **Metadata Extraction**: EXIF, color palette, perceptual hashing, blurhash generation
- **CDN Integration**: Optimized delivery through OCI CDN
- **Background Jobs**: Async processing with BullMQ and Redis

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Client Applications                      │
│              (iOS App, Designer Portal, Admin)               │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                  OCI API Gateway + WAF                       │
│              (JWT Auth, Rate Limiting, CORS)                 │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    Media API Service                         │
│  ┌────────────┬────────────┬────────────┬─────────────┐    │
│  │   Upload   │   Assets   │ Transform  │   Jobs      │    │
│  │  Controller│ Controller │  Controller│  Controller │    │
│  └────────────┴────────────┴────────────┴─────────────┘    │
│                                                              │
│  ┌────────────┬────────────┬────────────┬─────────────┐    │
│  │ OCI Storage│  Metadata  │   Image    │    3D       │    │
│  │  Service   │  Extractor │ Transform  │ Processing  │    │
│  └────────────┴────────────┴────────────┴─────────────┘    │
└──────────────────────────┬──────────────────────────────────┘
                           │
                ┌──────────┴──────────┐
                ▼                     ▼
    ┌──────────────────┐   ┌──────────────────┐
    │   BullMQ Queues  │   │   PostgreSQL     │
    │  (Redis-backed)  │   │  (Asset Metadata)│
    └────────┬─────────┘   └──────────────────┘
             │
    ┌────────┴────────┐
    ▼                 ▼
┌─────────┐      ┌─────────┐
│Transform│      │   3D    │
│ Workers │      │Workers  │
└─────────┘      └─────────┘
    │                 │
    └────────┬────────┘
             ▼
┌─────────────────────────────┐
│   OCI Object Storage        │
│  ┌────────┬────────┬──────┐ │
│  │  Raw   │Process │Public│ │
│  │ Bucket │ Bucket │Bucket│ │
│  └────────┴────────┴──────┘ │
└─────────────────────────────┘
             │
             ▼
┌─────────────────────────────┐
│         OCI CDN             │
│   (Edge-cached delivery)    │
└─────────────────────────────┘
```

## Features

### Image Pipeline
- ✅ Multiple format support: JPEG, PNG, WebP, AVIF
- ✅ Automatic rendition generation (256px - 2048px)
- ✅ EXIF orientation correction and metadata stripping
- ✅ Color space conversion to sRGB
- ✅ Perceptual hashing (pHash) for deduplication
- ✅ Blurhash generation for progressive loading
- ✅ Color palette extraction (k-means clustering)
- ✅ Quality metrics (sharpness, brightness, contrast)
- ✅ Dimension validation per role (hero ≥1600px, angle ≥1200px)

### 3D Pipeline
- ✅ Format support: GLB, GLTF, FBX, OBJ, DAE, USDZ
- ✅ Geometry optimization (welding, decimation, Draco compression)
- ✅ Material conversion to PBR metallic-roughness
- ✅ Texture optimization (KTX2 with Basis Universal)
- ✅ LOD generation (LOD0: 100%, LOD1: 50%, LOD2: 25%)
- ✅ USDZ export for iOS AR Quick Look
- ✅ Preview snapshot generation (front, iso, top views)
- ✅ Physical dimension calculation in meters
- ✅ AR readiness validation

### Storage & Delivery
- ✅ OCI Object Storage with PAR (Pre-Authenticated Requests)
- ✅ Three-bucket strategy: raw, processed, public
- ✅ CDN integration for global delivery
- ✅ Virus scanning with ClamAV
- ✅ Automatic lifecycle policies

### Background Processing
- ✅ BullMQ job queues with Redis
- ✅ Separate workers for images and 3D
- ✅ Automatic retry with exponential backoff
- ✅ Job progress tracking and monitoring
- ✅ Priority-based processing

## API Endpoints

### Upload & PAR Generation
```
POST /v1/media/upload
```
Generate Pre-Authenticated Request for direct upload to OCI Object Storage.

**Request:**
```json
{
  "kind": "IMAGE|MODEL3D",
  "filename": "hero-image.jpg",
  "fileSize": 1024000,
  "mimeType": "image/jpeg",
  "productId": "prod-123",
  "role": "HERO"
}
```

**Response:**
```json
{
  "assetId": "550e8400-e29b-41d4-a716-446655440000",
  "uploadSessionId": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "parUrl": "https://objectstorage.us-ashburn-1.oraclecloud.com/p/abc123...",
  "targetKey": "raw/images/550e8400.../hero-image.jpg",
  "headers": {
    "x-content-type": "image/jpeg"
  },
  "expiresAt": "2025-10-03T12:30:00Z"
}
```

### Asset Management
```
GET    /v1/media/assets/{id}              # Get asset metadata
PATCH  /v1/media/assets/{id}              # Update asset
GET    /v1/media/assets/{id}/renditions   # List renditions
POST   /v1/media/assets/{id}/reprocess    # Reprocess asset
GET    /v1/media/search                   # Search assets
```

### 3D Assets
```
GET    /v1/media/3d/{assetId}/preview     # Get 3D preview
POST   /v1/media/3d/convert               # Convert 3D model
```

### Jobs & Monitoring
```
GET    /v1/media/jobs                     # List jobs
GET    /v1/media/jobs/{id}                # Get job status
POST   /v1/media/jobs/{id}/retry          # Retry failed job
POST   /v1/media/jobs/{id}/cancel         # Cancel job
GET    /v1/media/qc/issues                # List QC issues
GET    /v1/media/queue/stats              # Queue statistics
```

## Data Model

### MediaAsset
```prisma
model MediaAsset {
  id          String   @id @default(uuid())
  kind        AssetKind // IMAGE | MODEL3D
  productId   String?
  variantId   String?
  role        AssetRole? // HERO | ANGLE | LIFESTYLE | DETAIL | AR_PREVIEW
  rawKey      String   @unique
  processed   Boolean  @default(false)
  status      AssetStatus @default(PENDING)
  width       Int?
  height      Int?
  format      String?
  phash       String?  // Perceptual hash
  palette     Json?    // Color palette
  blurhash    String?  // Blurhash for preview
  license     Json?    // License metadata
  qcIssues    Json?    // Quality control issues
  scanStatus  ScanStatus
  createdAt   DateTime @default(now())

  renditions  AssetRendition[]
  threeD      ThreeDAsset?
  jobs        ProcessJob[]
}
```

### ThreeDAsset
```prisma
model ThreeDAsset {
  id            String   @id
  assetId       String   @unique
  glbKey        String?
  usdzKey       String?
  triCount      Int?
  nodeCount     Int?
  materialCount Int?
  textureCount  Int?
  widthM        Float?   // Dimensions in meters
  heightM       Float?
  depthM        Float?
  arReady       Boolean  @default(false)
  lods          Json?    // LOD levels
  snapshots     Json?    // Preview images
}
```

## Configuration

### Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/patina_media

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# OCI Object Storage
OCI_CONFIG_FILE=~/.oci/config
OCI_REGION=us-ashburn-1
OCI_OBJECT_STORAGE_NAMESPACE=your-namespace
OCI_BUCKET_RAW=media-raw
OCI_BUCKET_PROCESSED=media-processed
OCI_BUCKET_PUBLIC=media-public

# CDN
CDN_DOMAIN=cdn.patina.app

# Image Processing
IMGPROXY_URL=http://localhost:8080

# Security
VIRUS_SCAN_ENABLED=true
CLAMAV_HOST=localhost
CLAMAV_PORT=3310

# Feature Flags
BACKGROUND_REMOVAL_ENABLED=false
3D_PROCESSING_ENABLED=true
```

## Development

### Prerequisites
- Node.js 20+
- PostgreSQL 16
- Redis 7
- Docker & Docker Compose (for local development)

### Setup

```bash
# Install dependencies
npm install

# Generate Prisma client
npm run prisma:generate

# Run migrations
npm run prisma:migrate

# Start development server
npm run start:dev

# Run workers
npm run worker:transform
npm run worker:3d
```

### Docker Compose

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f media-api

# Stop services
docker-compose down
```

## Deployment

### Kubernetes (OKE)

```bash
# Apply ConfigMaps and Secrets
kubectl apply -f k8s/configmap.yaml

# Deploy services
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/hpa.yaml

# Check status
kubectl get pods -n patina -l service=media
kubectl logs -f deployment/media-api -n patina
```

### Build & Push Images

```bash
# Build API image
docker build -t iad.ocir.io/patina/media-service:latest .

# Build worker image
docker build -f Dockerfile.worker -t iad.ocir.io/patina/media-worker:latest .

# Push to OCI Registry
docker push iad.ocir.io/patina/media-service:latest
docker push iad.ocir.io/patina/media-worker:latest
```

## Testing

```bash
# Unit tests
npm test

# E2E tests
npm run test:e2e

# Test coverage
npm run test:cov
```

## SLO Targets (from PRD)

- **Image Processing**: p95 < 60s end-to-end
- **3D Processing**: p95 < 180s end-to-end
- **Error Rate**: < 0.5% per week
- **CDN Hit Rate**: ≥ 80% (steady state)
- **API Availability**: 99.9%

## Monitoring & Observability

### Health Check
```
GET /health
```

### Metrics
- Processing latency (p50, p95, p99)
- Queue depth per job type
- Error rate by type
- CDN hit rate
- Storage utilization

### OpenTelemetry
All services emit traces to OCI APM:
- Request traces
- Job execution traces
- Database queries
- External service calls

## License Management

Assets include licensing metadata:
```json
{
  "licenseType": "stock|custom|royalty-free",
  "attribution": "Photographer Name",
  "expiresAt": "2026-01-01T00:00:00Z",
  "usageScope": ["web", "ar", "print"],
  "sourceVendorId": "vendor-123"
}
```

Automatic alerts at 30/7/1 days before expiry.

## Security

- **PAR URLs**: 15-minute TTL, single-use
- **Virus Scanning**: ClamAV integration, automatic quarantine
- **EXIF Stripping**: Privacy protection for public images
- **Rate Limiting**: Per-user and per-IP limits
- **Authentication**: JWT validation via OCI Identity Domains

## Support

For issues and questions:
- GitHub Issues: https://github.com/patina/media-service/issues
- Documentation: https://docs.patina.app/media
- Slack: #media-pipeline

## Roadmap

- [ ] Background removal integration
- [ ] GPU acceleration for 3D processing
- [ ] Video transcoding pipeline
- [ ] Advanced CAD import (STEP, IGES)
- [ ] AI-powered quality scoring
- [ ] Multi-region replication
