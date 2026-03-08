# Media Search & Analytics Module

Team Lima implementation of advanced media search, analytics, and AI-powered features for the Patina Product Catalog Phase 2.

## Overview

This module provides comprehensive search capabilities, AI-powered media intelligence, analytics tracking, and reporting for the Patina media service.

## Features

### 1. Media Search Service (`media-search.service.ts`)

Advanced search capabilities across multiple dimensions:

#### Visual Similarity Search
- **Vector Embeddings**: Uses perceptual hashing and embeddings for visual similarity
- **Cosine Similarity**: Calculates similarity scores between images
- **Configurable Threshold**: Adjust sensitivity for similarity matching
- **Duplicate Detection**: Identifies exact and near-duplicate assets

```typescript
// Search by existing asset
const results = await searchService.searchBySimilarity({
  sourceAssetId: 'asset-123',
  threshold: 0.85,
  limit: 50
});

// Search by uploaded image
const results = await searchService.searchBySimilarity({
  sourceImage: imageBuffer,
  threshold: 0.90
});
```

#### Color-Based Search
- **Dominant Color**: Search by primary color
- **Color Palette**: Search across entire color palette
- **Exact Match**: Find assets with specific hex colors
- **Similar Colors**: Tolerance-based color matching

```typescript
const results = await searchService.searchByColor({
  hexColor: '#FF5733',
  mode: ColorSearchMode.DOMINANT,
  tolerance: 20
});
```

#### Text Search
- **Tag Search**: Search across asset tags
- **Metadata Search**: Query product IDs, variant IDs
- **OCR Content**: Search extracted text from images
- **Fuzzy Matching**: Flexible text matching

```typescript
const results = await searchService.searchByText({
  query: 'modern sofa',
  fuzzy: true,
  fields: ['tags', 'productId', 'textContent']
});
```

#### Metadata Search
- **Filter by Product**: Product and variant IDs
- **Filter by Kind**: IMAGE, MODEL_3D
- **Filter by Role**: HERO, ANGLE, DETAIL
- **Date Range**: Filter by creation date

```typescript
const results = await searchService.searchByMetadata({
  filters: {
    productId: 'product-123',
    kind: 'IMAGE',
    role: 'HERO'
  }
});
```

### 2. AI Features Service (`ai-features.service.ts`)

AI-powered image processing and analysis:

#### Auto-Tagging
- **Computer Vision**: AI-generated tags from image analysis
- **Object Detection**: Identifies objects in images
- **Scene Analysis**: Classifies scene type (product, lifestyle, etc.)
- **Category Extraction**: Automatic categorization

```typescript
const result = await aiService.autoTagImage(imageBuffer, assetId);
// Returns: { tags, categories, objects, scene }
```

#### Smart Cropping
- **Focus Detection**: Identifies primary subjects
- **Multiple Aspect Ratios**: 1:1, 4:3, 16:9, 3:4, 9:16
- **Optimal Composition**: Centers crops on detected subjects
- **Confidence Scores**: Quality indicators for each suggestion

```typescript
const crops = await aiService.generateSmartCrops(imageBuffer, ['1:1', '16:9']);
```

#### Background Removal
- **API Integration**: Supports remove.bg and similar services
- **Fallback Processing**: Local threshold-based removal
- **Transparency Detection**: Identifies alpha channels
- **Confidence Scoring**: Quality assessment

```typescript
const result = await aiService.removeBackground(imageBuffer);
// Returns: { success, outputBuffer, mask, confidence }
```

#### Product Detection
- **Lifestyle Image Analysis**: Detects products in contextual scenes
- **Bounding Boxes**: Precise location data
- **Primary Product**: Identifies main subject
- **Category Classification**: Product type detection

```typescript
const detection = await aiService.detectProducts(imageBuffer);
// Returns: { products, totalCount, primaryProduct, confidence }
```

#### Quality Scoring
- **Comprehensive Analysis**: Multi-factor quality assessment
- **Sharpness Detection**: Blur and focus analysis
- **Exposure Analysis**: Under/over exposure detection
- **Composition Scoring**: Layout and framing evaluation
- **Noise Level**: Image noise assessment
- **Issue Identification**: Specific quality problems
- **Recommendations**: Actionable improvement suggestions

```typescript
const quality = await aiService.calculateQualityScore(imageBuffer);
// Returns: { overall, breakdown, issues, recommendations }
```

### 3. Analytics Service (`analytics.service.ts`)

Performance metrics and engagement tracking:

#### Event Tracking
- **View Events**: Track asset impressions and duration
- **Download Events**: Monitor asset downloads
- **Source Attribution**: Track traffic sources
- **Session Analytics**: User session tracking

```typescript
await analyticsService.trackView({
  assetId: 'asset-123',
  userId: 'user-456',
  duration: 30,
  source: 'catalog'
});
```

#### Asset Metrics
- **View Count**: Total and unique viewers
- **Download Count**: Total downloads
- **Engagement Score**: Composite performance metric
- **Average Duration**: View time analytics
- **Top Sources**: Traffic source analysis

```typescript
const metrics = await analyticsService.getAssetMetrics('asset-123', 30);
// Returns: { viewCount, downloadCount, engagementScore, topSources }
```

#### Bandwidth Analytics
- **Traffic Measurement**: Total bytes transferred
- **Cost Calculation**: CDN cost estimates
- **Format Breakdown**: Usage by file format
- **Regional Analysis**: Geographic distribution

```typescript
const bandwidth = await analyticsService.getBandwidthMetrics('month');
// Returns: { totalBytes, costEstimate, breakdown }
```

#### Storage Analytics
- **Total Usage**: Assets and bytes
- **Breakdown Analysis**: By kind, format, status
- **Growth Metrics**: Upload trends
- **Cost Projections**: Storage cost estimates

```typescript
const storage = await analyticsService.getStorageMetrics();
// Returns: { totalAssets, totalSizeBytes, breakdown, costEstimate }
```

#### Performance Metrics
- **Top Performers**: Best performing assets
- **Engagement Trends**: Performance over time
- **Conversion Rates**: View-to-download ratios
- **Comparative Analysis**: Period-over-period comparison

```typescript
const topAssets = await analyticsService.getTopPerformingAssets(10, 'engagement');
```

### 4. Intelligence Service (`intelligence.service.ts`)

Media intelligence and compliance:

#### Duplicate Detection
- **Exact Duplicates**: Identical hash matching
- **Near Duplicates**: High similarity detection
- **Visual Variants**: Similar composition detection
- **Dimension Matching**: Size comparison
- **Color Analysis**: Palette similarity

```typescript
const duplicates = await intelligenceService.detectDuplicates('asset-123', 0.9);
// Returns: { duplicates, totalFound, confidence }
```

#### Missing Asset Detection
- **Required Roles**: HERO, ANGLE, 3D detection
- **Product Coverage**: Asset completeness per product
- **Recommendations**: Specific improvement suggestions

```typescript
const missing = await intelligenceService.detectMissingAssets('product-123');
// Returns: [{ productId, missingRoles, recommendations }]
```

#### Compliance Checking
- **Quality Standards**: Minimum quality thresholds
- **Dimension Requirements**: Size validation
- **Format Compliance**: Allowed formats
- **Copyright Detection**: Watermark identification
- **Content Moderation**: Inappropriate content flagging
- **Severity Levels**: Critical, high, medium, low

```typescript
const compliance = await intelligenceService.checkCompliance('asset-123');
// Returns: { compliant, issues, warnings, score }
```

#### Brand Consistency
- **Color Consistency**: Palette uniformity
- **Style Analysis**: Visual coherence
- **Quality Consistency**: Standard deviation
- **Format Standardization**: File type uniformity
- **Outlier Detection**: Inconsistent assets

```typescript
const consistency = await intelligenceService.calculateBrandConsistency(['product-1']);
// Returns: { overall, metrics, outliers, recommendations }
```

#### SEO Optimization
- **Alt Text Generation**: AI-powered descriptions
- **Title Optimization**: SEO-friendly titles
- **Meta Description**: Search engine optimization
- **Tag Recommendations**: Keyword suggestions
- **Filename Optimization**: URL-friendly names
- **Impact Analysis**: SEO improvement potential

```typescript
const seo = await intelligenceService.generateSEOOptimizations('asset-123');
// Returns: { score, optimizations, recommendations }
```

### 5. Reporting Service (`reporting.service.ts`)

Comprehensive reporting and dashboards:

#### Usage Reports
- **Period Analysis**: Custom date ranges
- **Summary Metrics**: Totals and aggregates
- **Breakdown Analysis**: By product, kind, role
- **Trend Visualization**: Daily/weekly trends
- **Top Assets**: Best performers

```typescript
const report = await reportingService.generateUsageReport(startDate, endDate);
// Returns: { summary, breakdown, trends, topAssets }
```

#### Performance Dashboard
- **Overview Metrics**: Total assets, quality scores
- **Top Performers**: Best assets
- **Poor Performers**: Issues to address
- **Quality Distribution**: High/medium/low
- **Health Metrics**: Duplicates, missing assets, compliance

```typescript
const dashboard = await reportingService.generatePerformanceDashboard();
// Returns: { overview, performance, quality, health }
```

#### Cost Analysis
- **Storage Costs**: Per GB pricing
- **Bandwidth Costs**: Transfer pricing
- **Processing Costs**: Transform and AI costs
- **Projections**: Future cost estimates
- **Recommendations**: Cost savings opportunities

```typescript
const costs = await reportingService.generateCostAnalysis(startDate, endDate);
// Returns: { costs, projections, recommendations }
```

#### Optimization Report
- **Format Conversion**: WebP/AVIF opportunities
- **Compression**: Size reduction potential
- **Duplicate Removal**: Storage savings
- **Unused Assets**: Archive candidates
- **Impact Analysis**: Potential improvements

```typescript
const optimization = await reportingService.generateOptimizationReport();
// Returns: { opportunities, actions, impact }
```

#### Export Formats
- **CSV Export**: Spreadsheet-compatible
- **JSON Export**: Programmatic access

```typescript
const csv = await reportingService.exportReportAsCSV(report);
const json = await reportingService.exportReportAsJSON(report);
```

## API Endpoints

All endpoints are available under `/search`:

### Search Endpoints
- `POST /search/similarity` - Visual similarity search
- `POST /search/color` - Color-based search
- `POST /search/text` - Text search
- `POST /search/metadata` - Metadata search
- `POST /search/hybrid` - Hybrid multi-dimensional search

### AI Features Endpoints
- `POST /search/ai/auto-tag/:assetId` - Auto-tag image
- `POST /search/ai/smart-crop/:assetId` - Generate smart crops
- `POST /search/ai/remove-background/:assetId` - Remove background
- `POST /search/ai/detect-products/:assetId` - Detect products
- `POST /search/ai/quality-score/:assetId` - Calculate quality score

### Analytics Endpoints
- `POST /search/analytics/track/view` - Track view event
- `POST /search/analytics/track/download` - Track download event
- `GET /search/analytics/metrics/:assetId` - Get asset metrics
- `GET /search/analytics/bandwidth` - Get bandwidth metrics
- `GET /search/analytics/storage` - Get storage metrics
- `GET /search/analytics/top-performing` - Get top performers

### Intelligence Endpoints
- `GET /search/intelligence/duplicates/:assetId` - Detect duplicates
- `GET /search/intelligence/missing-assets` - Detect missing assets
- `GET /search/intelligence/compliance/:assetId` - Check compliance
- `GET /search/intelligence/brand-consistency` - Brand consistency
- `GET /search/intelligence/seo/:assetId` - SEO optimizations

### Reporting Endpoints
- `POST /search/reports/usage` - Generate usage report
- `GET /search/reports/performance-dashboard` - Performance dashboard
- `POST /search/reports/cost-analysis` - Cost analysis
- `GET /search/reports/optimization` - Optimization report
- `POST /search/reports/export/csv` - Export as CSV
- `POST /search/reports/export/json` - Export as JSON

## Integration

### OpenSearch Integration (Recommended)

For production deployment, integrate with OpenSearch for advanced vector similarity search:

```typescript
// Example OpenSearch integration
import { Client } from '@opensearch-project/opensearch';

const client = new Client({
  node: process.env.OPENSEARCH_URL,
});

// Index asset with embedding
await client.index({
  index: 'media-assets',
  body: {
    assetId: 'asset-123',
    embedding: vectorEmbedding,
    metadata: assetMetadata,
  },
});

// Vector similarity search
const result = await client.search({
  index: 'media-assets',
  body: {
    query: {
      knn: {
        embedding: {
          vector: queryEmbedding,
          k: 10,
        },
      },
    },
  },
});
```

### Time-Series Analytics

Implement time-series data storage for analytics:

```typescript
// Example with TimescaleDB
CREATE TABLE asset_analytics (
  time TIMESTAMPTZ NOT NULL,
  asset_id TEXT NOT NULL,
  view_count INTEGER,
  download_count INTEGER,
  bandwidth_bytes BIGINT,
  PRIMARY KEY (time, asset_id)
);

SELECT create_hypertable('asset_analytics', 'time');
```

## Testing

Run comprehensive tests:

```bash
# Unit tests
npm test -- media-search.service.spec.ts
npm test -- ai-features.service.spec.ts
npm test -- analytics.service.spec.ts
npm test -- intelligence.service.spec.ts
npm test -- reporting.service.spec.ts

# All search module tests
npm test -- --testPathPattern=search

# Coverage
npm run test:cov
```

## Configuration

Required environment variables:

```env
# AI Services
BACKGROUND_REMOVAL_API_KEY=your_key_here
BACKGROUND_REMOVAL_API_URL=https://api.remove.bg/v1.0/removebg
VISION_API_KEY=your_vision_api_key

# Cost Configuration
STORAGE_COST_PER_GB=0.025
BANDWIDTH_COST_PER_GB=0.085

# OpenSearch (Optional)
OPENSEARCH_URL=https://opensearch.example.com
OPENSEARCH_USERNAME=admin
OPENSEARCH_PASSWORD=admin
```

## Performance Considerations

1. **Vector Search**: For large catalogs (>10,000 assets), use OpenSearch or similar vector database
2. **Caching**: Implement Redis caching for frequently accessed analytics
3. **Batch Processing**: Process AI features asynchronously via job queue
4. **Indexing**: Create database indexes on frequently queried fields
5. **Aggregations**: Pre-calculate aggregations for faster reporting

## Future Enhancements

- [ ] Multi-modal search (text + image)
- [ ] Advanced ML models (CLIP, ResNet)
- [ ] Real-time analytics dashboard
- [ ] Predictive analytics
- [ ] A/B testing framework
- [ ] Recommendation engine
- [ ] Automated optimization workflows

## Team Lima

Implementation by Team Lima - Media Analytics & Search Specialists

For questions or support, contact the Patina Platform Team.
