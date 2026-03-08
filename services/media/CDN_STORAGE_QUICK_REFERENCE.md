# CDN & Storage Quick Reference Guide

## Team Juliet Implementation Summary

### 🚀 Quick Start

```bash
# 1. Install dependencies (if not already installed)
cd services/media
npm install

# 2. Configure environment
cp .env.cdn.example .env
# Edit .env with your AWS/CloudFront credentials

# 3. Setup lifecycle policies
npm run cli -- storage:setup-lifecycle

# 4. Setup CDN policies
npm run cli -- cdn:setup-policies

# 5. Enable optimizations
npm run cli -- cdn:enable-optimizations
```

### 📦 Core Components

| Component | Location | Purpose |
|-----------|----------|---------|
| **Multi-Storage Service** | `src/modules/storage/multi-storage.service.ts` | Orchestrates storage across providers |
| **S3 Provider** | `src/modules/storage/providers/s3-storage.provider.ts` | AWS S3 implementation |
| **CDN Manager** | `src/modules/storage/cdn/cdn-manager.service.ts` | CloudFront orchestration |
| **CloudFront Provider** | `src/modules/storage/cdn/cloudfront-cdn.provider.ts` | CloudFront implementation |
| **Storage Module** | `src/modules/storage/storage.module.ts` | NestJS module exports |

### 🔥 Common Operations

#### Upload Asset
```typescript
import { MultiStorageService, StorageTier } from '@/modules/storage';

// Upload with automatic tiering
await multiStorage.upload(
  'products/chair-hero.jpg',
  buffer,
  {
    contentType: 'image/jpeg',
    tier: StorageTier.HOT,
    metadata: { productId: '123' }
  }
);
```

#### Get CDN URL
```typescript
import { CDNManagerService } from '@/modules/storage/cdn';

// Simple URL
const url = cdnManager.getCDNUrl('products/chair.jpg');

// Optimized URL with transformations
const optimizedUrl = cdnManager.getCDNUrl('products/chair.jpg', {
  width: 1200,
  height: 800,
  format: 'webp',
  quality: 85
});
```

#### Purge Cache
```typescript
// Purge specific paths
await cdnManager.purgeCachePaths([
  '/products/123/*',
  '/thumbnails/products/123/*'
]);

// Purge by pattern
await cdnManager.purgeCacheByPattern('/products/*.jpg');

// Purge everything
await cdnManager.purgeCache({ purgeAll: true });
```

#### Check for Duplicates
```typescript
const result = await multiStorage.checkDuplication(imageBuffer);

if (result.isDuplicate) {
  console.log(`Duplicate found: ${result.existingKey}`);
  // Use existing file instead of uploading
} else {
  // Upload new file
  await multiStorage.upload(key, imageBuffer);
}
```

#### Get Storage Analytics
```typescript
const analytics = await multiStorage.getStorageAnalytics();

console.log(`Total: ${analytics.totalSize / 1e9} GB`);
console.log(`Cost: $${analytics.costEstimate}/month`);
console.log(`Objects: ${analytics.totalObjects}`);
```

### 🎯 Storage Tiers

| Tier | Use Case | Cost/GB | Access Time | Example Content |
|------|----------|---------|-------------|-----------------|
| **HOT** | Frequently accessed | $0.023 | Instant | Thumbnails, recent uploads |
| **WARM** | Occasionally accessed | $0.0125 | Instant | Older products, seasonal items |
| **COLD** | Rarely accessed | $0.004 | Minutes | Archived products, backups |
| **ARCHIVE** | Long-term storage | $0.00099 | Hours | Compliance, historical data |

### 🌍 CDN Edge Locations

**CloudFront provides 400+ edge locations worldwide:**

- **North America:** 90+ locations
- **Europe:** 80+ locations
- **Asia Pacific:** 60+ locations
- **South America:** 20+ locations
- **Middle East/Africa:** 30+ locations

### ⚡ Cache Policies

| Content Type | TTL | Immutable | Use Case |
|--------------|-----|-----------|----------|
| Processed Images | 1 year | ✅ | Product photos |
| Thumbnails | 30 days | ❌ | Preview images |
| Raw Uploads | 1 day | ❌ | Unprocessed files |
| 3D Models | 1 year | ✅ | GLB/USDZ files |
| API Responses | 5-10 min | ❌ | Catalog data |
| Dynamic Content | No cache | ❌ | Real-time data |

### 🔒 Security Features

```typescript
// Signed URLs (time-limited access)
const signedUrl = await cdnManager.getSignedUrl('premium/model.glb', 3600);

// Security Headers (automatic)
await cdnManager.setupSecurityHeaders();
// Sets: CSP, HSTS, X-Frame-Options, X-Content-Type-Options, etc.

// WAF Protection (configured)
// - Rate limiting: 10,000 req/min
// - DDoS protection
// - SQL injection prevention
```

### 📊 Monitoring

```typescript
// Performance Analytics
const analytics = await cdnManager.getPerformanceAnalytics(
  new Date('2024-01-01'),
  new Date('2024-01-31')
);

console.log(`Cache Hit Rate: ${analytics.cacheHitRate * 100}%`);
console.log(`Bandwidth: ${analytics.bandwidth / 1e9} GB`);
console.log(`Requests: ${analytics.requests.toLocaleString()}`);
console.log(`Avg Latency: ${analytics.avgLatency}ms`);

// Bandwidth Report
const report = await cdnManager.getBandwidthReport(startDate, endDate);
console.log(`Total Bandwidth: ${report.totalBandwidth / 1e9} GB`);
console.log(`Estimated Cost: $${report.costEstimate}`);
```

### 💰 Cost Optimization

```typescript
// Archive unused assets (dry run first)
const wouldArchive = await multiStorage.archiveUnusedAssets(90, true);
console.log(`Would archive ${wouldArchive.length} assets`);

// Actually archive
await multiStorage.archiveUnusedAssets(90, false);

// Optimize storage tiers
await multiStorage.optimizeStorageTier('old-product.jpg', 120);

// Setup lifecycle policies
await multiStorage.setupLifecyclePolicies();
```

### 🚀 Delivery Optimizations

| Feature | Status | Benefit |
|---------|--------|---------|
| **HTTP/3** | ✅ Enabled | 20-30% faster on mobile |
| **Brotli Compression** | ✅ Enabled | 15-20% smaller files |
| **WebP Auto-Convert** | ✅ Enabled | 25-35% smaller images |
| **AVIF Auto-Convert** | ✅ Enabled | 50% smaller images |
| **Lazy Loading** | ✅ Enabled | Faster initial page load |
| **GeoDNS** | ✅ Enabled | Route to nearest edge |
| **Adaptive Bitrate** | ✅ Enabled | Optimized video streaming |

### 🔧 Configuration Snippets

#### Enable All Optimizations
```typescript
await cdnManager.enableDeliveryOptimizations();
```

#### Setup Standard Cache Policies
```typescript
await cdnManager.setupCachePolicies();
```

#### Configure GeoDNS
```typescript
await cdnManager.configureGeoDNS();
```

#### Preload Critical Assets
```typescript
await cdnManager.preloadCriticalAssets({
  critical: ['/hero.jpg', '/main.jpg'],
  high: ['/products/*.jpg'],
  low: ['/archive/*.jpg']
});
```

### 📈 Performance Benchmarks

**Expected Results:**

- **Cache Hit Rate:** 85%+ (well-configured policies)
- **Global Latency:** <50ms (CloudFront edge)
- **Bandwidth Savings:** 30-40% (compression + format optimization)
- **Storage Costs:** 40-60% reduction (tiering)
- **Deduplication Savings:** 15-25% (duplicate detection)

### 🐛 Troubleshooting

#### High Cache Miss Rate
```bash
# Check cache policies
aws cloudfront get-distribution-config --id $DISTRIBUTION_ID

# Review CloudWatch metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/CloudFront \
  --metric-name CacheHitRate \
  --dimensions Name=DistributionId,Value=$DISTRIBUTION_ID
```

#### High Storage Costs
```typescript
// Get detailed analytics
const analytics = await multiStorage.getStorageAnalytics();

// Check tier distribution
console.log(analytics.tierDistribution);

// Run optimization
await multiStorage.optimizeStorageTier(key, lastAccessDays);
```

#### Slow CDN Performance
```typescript
// Get performance analytics
const perf = await cdnManager.getPerformanceAnalytics(start, end);

// Check recommendations
console.log(perf.recommendations);

// Verify HTTP/3 is enabled
await cdnManager.enableDeliveryOptimizations();
```

### 🧪 Testing

```bash
# Unit tests
npm test -- storage
npm test -- cdn

# Integration tests
npm test -- multi-storage.service.spec.ts
npm test -- cloudfront-cdn.provider.spec.ts

# Load testing
artillery run tests/cdn-load-test.yml
```

### 📚 Key Interfaces

#### StorageOptions
```typescript
interface StorageOptions {
  tier?: StorageTier;
  contentType?: string;
  cacheControl?: string;
  metadata?: Record<string, string>;
  encryption?: boolean;
  redundancy?: 'STANDARD' | 'REDUCED';
}
```

#### PurgeOptions
```typescript
interface PurgeOptions {
  paths?: string[];
  tags?: string[];
  pattern?: string;
  purgeAll?: boolean;
}
```

#### ImageOptions
```typescript
interface ImageOptions {
  width?: number;
  height?: number;
  format?: 'webp' | 'avif' | 'jpeg' | 'png';
  quality?: number;
  lazyLoad?: boolean;
}
```

### 🔗 Useful Commands

```bash
# Check CloudFront distribution status
aws cloudfront get-distribution --id $DISTRIBUTION_ID

# List invalidations
aws cloudfront list-invalidations --distribution-id $DISTRIBUTION_ID

# Get S3 bucket size
aws s3 ls s3://patina-processed --recursive --summarize

# CloudWatch metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/S3 \
  --metric-name BucketSizeBytes \
  --dimensions Name=BucketName,Value=patina-processed
```

### 📞 Support

- **Documentation:** `/services/media/CDN_STORAGE_IMPLEMENTATION.md`
- **Team:** Team Juliet
- **Slack:** `#team-juliet`
- **Email:** `juliet@patina.dev`

### 🎯 Key Metrics to Track

1. **Cache Hit Rate** → Target: >85%
2. **Average Latency** → Target: <50ms
3. **Storage Cost/GB** → Target: <$0.015/GB (with tiering)
4. **Bandwidth Cost** → Monitor daily
5. **Deduplication Rate** → Expected: 15-25%

### 🔄 Regular Maintenance

**Daily:**
- Monitor cache hit rates
- Check error logs
- Review bandwidth usage

**Weekly:**
- Run storage analytics
- Check deduplication savings
- Review cost trends

**Monthly:**
- Optimize storage tiers
- Archive unused assets
- Review and update cache policies
- Analyze performance metrics

**Quarterly:**
- Review lifecycle policies
- Update security headers
- Benchmark against SLAs
- Plan capacity upgrades

---

**Last Updated:** 2025-10-06
**Version:** 1.0.0
**Team:** Juliet
