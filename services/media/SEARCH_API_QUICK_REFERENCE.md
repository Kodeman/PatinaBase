# Search & Analytics API Quick Reference

Quick reference guide for Team Lima's Media Search & Analytics API.

## Base URL
```
/search
```

---

## 🔍 Search Endpoints

### Visual Similarity Search
```http
POST /search/similarity
Content-Type: application/json

{
  "sourceAssetId": "asset-123",  // OR "sourceImage": Buffer
  "threshold": 0.85,
  "limit": 50
}
```

### Color Search
```http
POST /search/color
Content-Type: application/json

{
  "hexColor": "#FF5733",
  "mode": "DOMINANT",  // DOMINANT | PALETTE | EXACT | SIMILAR
  "tolerance": 20,
  "limit": 50
}
```

### Text Search
```http
POST /search/text
Content-Type: application/json

{
  "query": "modern sofa",
  "fields": ["tags", "productId", "textContent"],
  "fuzzy": true,
  "limit": 50
}
```

### Metadata Search
```http
POST /search/metadata
Content-Type: application/json

{
  "filters": {
    "productId": "product-123",
    "kind": "IMAGE",
    "role": "HERO"
  },
  "limit": 50
}
```

---

## 🤖 AI Features

### Auto-Tag Image
```http
POST /search/ai/auto-tag/:assetId
```
**Returns**: `{ tags, categories, objects, scene }`

### Smart Crop Suggestions
```http
POST /search/ai/smart-crop/:assetId?ratios=1:1,16:9
```
**Returns**: Array of crop suggestions with coordinates

### Remove Background
```http
POST /search/ai/remove-background/:assetId
```
**Returns**: `{ success, outputBuffer, confidence }`

### Detect Products
```http
POST /search/ai/detect-products/:assetId
```
**Returns**: `{ products, totalCount, primaryProduct }`

### Quality Score
```http
POST /search/ai/quality-score/:assetId
```
**Returns**: `{ overall, breakdown, issues, recommendations }`

---

## 📊 Analytics

### Track View
```http
POST /search/analytics/track/view
Content-Type: application/json

{
  "assetId": "asset-123",
  "userId": "user-456",
  "duration": 30,
  "source": "catalog"
}
```

### Track Download
```http
POST /search/analytics/track/download
Content-Type: application/json

{
  "assetId": "asset-123",
  "userId": "user-456",
  "sizeBytes": 1024000
}
```

### Get Asset Metrics
```http
GET /search/analytics/metrics/:assetId?days=30
```
**Returns**: `{ viewCount, downloadCount, engagementScore, topSources }`

### Bandwidth Metrics
```http
GET /search/analytics/bandwidth?period=month
```
**Period**: `hour` | `day` | `week` | `month`

### Storage Metrics
```http
GET /search/analytics/storage
```
**Returns**: `{ totalAssets, totalSizeBytes, breakdown, costEstimate }`

### Top Performing Assets
```http
GET /search/analytics/top-performing?limit=10&metric=engagement
```
**Metric**: `views` | `downloads` | `engagement`

---

## 🛡️ Intelligence

### Detect Duplicates
```http
GET /search/intelligence/duplicates/:assetId?threshold=0.9
```
**Returns**: `{ duplicates, totalFound, confidence }`

### Missing Assets
```http
GET /search/intelligence/missing-assets?productId=product-123
```
**Returns**: Array of `{ productId, missingRoles, recommendations }`

### Compliance Check
```http
GET /search/intelligence/compliance/:assetId
```
**Returns**: `{ compliant, issues, warnings, score }`

### Brand Consistency
```http
GET /search/intelligence/brand-consistency?productIds=p1,p2
```
**Returns**: `{ overall, metrics, outliers, recommendations }`

### SEO Optimization
```http
GET /search/intelligence/seo/:assetId
```
**Returns**: `{ score, optimizations, recommendations }`

---

## 📈 Reporting

### Usage Report
```http
POST /search/reports/usage
Content-Type: application/json

{
  "startDate": "2024-01-01",
  "endDate": "2024-01-31"
}
```

### Performance Dashboard
```http
GET /search/reports/performance-dashboard
```
**Returns**: `{ overview, performance, quality, health }`

### Cost Analysis
```http
POST /search/reports/cost-analysis
Content-Type: application/json

{
  "startDate": "2024-01-01",
  "endDate": "2024-01-31"
}
```

### Optimization Report
```http
GET /search/reports/optimization
```
**Returns**: `{ opportunities, actions, impact }`

### Export CSV
```http
POST /search/reports/export/csv
Content-Type: application/json

{ ...report data... }
```

### Export JSON
```http
POST /search/reports/export/json
Content-Type: application/json

{ ...report data... }
```

---

## 📝 Quick Examples

### Search for Similar Images
```bash
curl -X POST http://localhost:3000/search/similarity \
  -H "Content-Type: application/json" \
  -d '{
    "sourceAssetId": "asset-123",
    "threshold": 0.85,
    "limit": 10
  }'
```

### Track Asset View
```bash
curl -X POST http://localhost:3000/search/analytics/track/view \
  -H "Content-Type: application/json" \
  -d '{
    "assetId": "asset-123",
    "userId": "user-456",
    "duration": 30,
    "source": "catalog"
  }'
```

### Get Top Performers
```bash
curl http://localhost:3000/search/analytics/top-performing?limit=10&metric=engagement
```

### Check Compliance
```bash
curl http://localhost:3000/search/intelligence/compliance/asset-123
```

### Generate Cost Report
```bash
curl -X POST http://localhost:3000/search/reports/cost-analysis \
  -H "Content-Type: application/json" \
  -d '{
    "startDate": "2024-01-01",
    "endDate": "2024-01-31"
  }'
```

---

## 🔑 Key Response Formats

### Search Response
```json
{
  "results": [
    {
      "assetId": "asset-123",
      "score": 0.92,
      "asset": { /* asset data */ }
    }
  ],
  "total": 50,
  "page": 1,
  "limit": 50,
  "hasMore": false,
  "searchTime": 145
}
```

### Quality Score Response
```json
{
  "overall": 0.85,
  "breakdown": {
    "sharpness": 0.9,
    "exposure": 0.8,
    "composition": 0.85,
    "colorBalance": 0.88,
    "noiseLevel": 0.15
  },
  "issues": [
    {
      "type": "exposure",
      "severity": "medium",
      "description": "Image is slightly underexposed",
      "suggestion": "Adjust exposure settings"
    }
  ],
  "recommendations": [
    "Good quality - ready for publication"
  ]
}
```

### Compliance Response
```json
{
  "assetId": "asset-123",
  "compliant": false,
  "issues": [
    {
      "type": "dimensions",
      "severity": "high",
      "description": "Hero image dimensions below minimum",
      "remedy": "Provide image with at least 1600px on shortest edge"
    }
  ],
  "warnings": [
    {
      "type": "metadata",
      "message": "No tags assigned",
      "suggestion": "Add descriptive tags for better discoverability"
    }
  ],
  "score": 0.65
}
```

---

## ⚡ Performance Tips

1. **Use pagination** for large result sets
2. **Cache frequent queries** with Redis
3. **Batch analytics events** for better performance
4. **Index frequently queried fields** in database
5. **Use OpenSearch** for production vector search
6. **Pre-calculate aggregations** for dashboards
7. **Implement rate limiting** for public APIs

---

## 🔐 Environment Variables

```env
# AI Services
BACKGROUND_REMOVAL_API_KEY=your_key
VISION_API_KEY=your_key

# Costs
STORAGE_COST_PER_GB=0.025
BANDWIDTH_COST_PER_GB=0.085

# OpenSearch (Optional)
OPENSEARCH_URL=https://opensearch.example.com
```

---

**Team Lima** - Quick Reference Guide
