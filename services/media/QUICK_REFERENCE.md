# Media Service - Quick Reference

## 🚀 Quick Start

```bash
# Development
docker-compose up -d
npm run start:dev

# Access
- API: http://localhost:3000
- Docs: http://localhost:3000/api/docs
- Health: http://localhost:3000/health
```

## 📁 Project Structure

```
services/media/
├── src/modules/
│   ├── upload/          # PAR generation
│   ├── assets/          # Metadata & CRUD
│   ├── transform/       # Image processing
│   ├── 3d/             # 3D pipeline
│   ├── jobs/           # Job queues
│   ├── storage/        # OCI Storage
│   └── security/       # Virus scanning
├── prisma/schema.prisma # Database schema
├── k8s/                # Kubernetes manifests
└── test/               # E2E tests
```

## 🔌 API Endpoints

### Upload
```http
POST /v1/media/upload
POST /v1/media/upload/:sessionId/confirm
```

### Assets
```http
GET    /v1/media/assets/{id}
PATCH  /v1/media/assets/{id}
GET    /v1/media/assets/{id}/renditions
POST   /v1/media/assets/{id}/reprocess
GET    /v1/media/search?kind=IMAGE&limit=20
```

### 3D
```http
GET    /v1/media/3d/{assetId}/preview
POST   /v1/media/3d/convert
```

### Jobs
```http
GET    /v1/media/jobs?state=FAILED
GET    /v1/media/jobs/{id}
POST   /v1/media/jobs/{id}/retry
GET    /v1/media/qc/issues
GET    /v1/media/queue/stats
```

## 🗄️ Data Models

### MediaAsset
```typescript
{
  id: string
  kind: "IMAGE" | "MODEL3D"
  role?: "HERO" | "ANGLE" | "LIFESTYLE" | "DETAIL" | "AR_PREVIEW"
  status: "PENDING" | "PROCESSING" | "READY" | "FAILED" | "BLOCKED"
  width, height, format
  phash, blurhash, palette  // Image metadata
  license?: {...}           // Rights info
  renditions: AssetRendition[]
  threeD?: ThreeDAsset
}
```

### ThreeDAsset
```typescript
{
  glbKey, usdzKey
  triCount, nodeCount, materialCount, textureCount
  widthM, heightM, depthM  // Meters
  arReady: boolean
  lods: [{lod, triCount, key}]
  snapshots: {front, iso, top}
}
```

## ⚙️ Configuration

### Required Environment Variables
```bash
DATABASE_URL=postgresql://user:pass@host:5432/db
REDIS_HOST=localhost
OCI_REGION=us-ashburn-1
OCI_BUCKET_RAW=media-raw
OCI_BUCKET_PROCESSED=media-processed
OCI_BUCKET_PUBLIC=media-public
```

### Feature Flags
```bash
VIRUS_SCAN_ENABLED=true
3D_PROCESSING_ENABLED=true
BACKGROUND_REMOVAL_ENABLED=false
```

## 🔄 Processing Flow

### Image Pipeline
```
Upload → Virus Scan → EXIF Fix → sRGB Convert →
Generate Renditions → Extract Metadata →
Upload to Processed Bucket → Emit Event
```

### 3D Pipeline
```
Upload → Virus Scan → Parse → Normalize (Y-up, meters) →
Optimize Geometry (Draco) → Optimize Materials (PBR) →
Generate LODs → Export GLB/USDZ →
Generate Snapshots → Emit Event
```

## 📊 Key Metrics

### SLO Targets
- Image processing: **p95 < 60s**
- 3D processing: **p95 < 180s**
- Error rate: **< 0.5% weekly**
- CDN hit rate: **≥ 80%**

### Monitoring Endpoints
```http
GET /health
GET /metrics  # Prometheus format
```

## 🐳 Docker Commands

### Development
```bash
docker-compose up -d              # Start all services
docker-compose logs -f media-api  # View logs
docker-compose down               # Stop services
```

### Production Build
```bash
docker build -t media-service .
docker build -f Dockerfile.worker -t media-worker .
```

## ☸️ Kubernetes Commands

### Deploy
```bash
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/hpa.yaml
```

### Monitor
```bash
kubectl get pods -n patina -l service=media
kubectl logs -f deployment/media-api -n patina
kubectl top pods -n patina
```

### Scale
```bash
kubectl scale deployment media-transform-worker --replicas=10
```

## 🧪 Testing

```bash
npm test                  # Unit tests
npm run test:e2e         # E2E tests
npm run test:cov         # Coverage report
```

## 🔍 Troubleshooting

### Common Issues

**Upload fails with 403**
- Check PAR expiry (15-min TTL)
- Verify OCI credentials
- Check bucket permissions

**Processing stuck**
- Check Redis connection
- Verify worker pods running
- Check job queue depth: `GET /v1/media/queue/stats`

**Virus scan errors**
- Verify ClamAV running
- Check signature database updated
- Disable if not critical: `VIRUS_SCAN_ENABLED=false`

**3D conversion fails**
- Check triangle count < 500k
- Verify format support (GLB, GLTF, FBX, OBJ)
- Check worker memory limits

### Debug Commands

```bash
# Check job status
curl http://localhost:3000/v1/media/jobs/{jobId}

# Retry failed job
curl -X POST http://localhost:3000/v1/media/jobs/{jobId}/retry

# View QC issues
curl http://localhost:3000/v1/media/qc/issues

# Queue stats
curl http://localhost:3000/v1/media/queue/stats
```

## 📦 Dependencies

### Core
- NestJS 10
- TypeScript 5
- Prisma 5
- PostgreSQL 16
- Redis 7

### Processing
- Sharp (images)
- gltf-transform (3D)
- Draco compression
- Basis Universal (KTX2)

### Infrastructure
- BullMQ (jobs)
- OCI SDK
- ClamAV (scanning)
- imgproxy (transforms)

## 🔗 Related Docs

- [README.md](./README.md) - Full documentation
- [ARCHITECTURE.md](./ARCHITECTURE.md) - Architecture deep-dive
- [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md) - Build summary
- [PRD](../../docs/features/06-media-pipeline/Patina_Media_3D_Pipeline_PRD_OCI.md) - Requirements

## 🎯 Key Files

| File | Purpose |
|------|---------|
| `src/main.ts` | Entry point |
| `src/app.module.ts` | Root module |
| `src/modules/upload/upload.service.ts` | PAR generation |
| `src/modules/assets/metadata-extraction.service.ts` | Metadata extraction |
| `src/modules/transform/image-transform.service.ts` | Image processing |
| `src/modules/3d/3d-processing.service.ts` | 3D pipeline |
| `src/modules/jobs/job-queue.service.ts` | Job orchestration |
| `prisma/schema.prisma` | Database schema |

## 🚨 Production Checklist

- [ ] Update OCI credentials in secrets
- [ ] Configure DNS for API endpoint
- [ ] Set up CDN distribution
- [ ] Enable virus scanning
- [ ] Configure monitoring dashboards
- [ ] Set up alerting (PagerDuty/Slack)
- [ ] Run load tests
- [ ] Security audit
- [ ] Backup verification
- [ ] Document runbooks

## 💡 Tips

1. **Use idempotency keys** for uploads in production
2. **Enable virus scanning** for all uploaded files
3. **Monitor queue depth** to detect bottlenecks
4. **Pre-warm CDN** for popular assets
5. **Use spot instances** for workers to save 50% cost
6. **Archive raw files** after 30 days
7. **Set up cross-region replication** for disaster recovery
8. **Use HPA** to handle traffic spikes automatically

## 📞 Support

- Issues: GitHub Issues
- Docs: https://docs.patina.app/media
- Team: #media-pipeline on Slack
