# Patina Aesthete Engine

**Recommendation and Similarity Engine for Patina Design Platform**

## Overview

The Aesthete Engine is a multimodal recommendation system that combines vector similarity search, rule-based steering, and hybrid scoring to deliver personalized product recommendations for interior designers and clients.

### Key Features

- **Multimodal Embeddings**: CLIP-style image + text fusion for product representation
- **Hybrid Retrieval**: Vector similarity (pgvector) + lexical search (OpenSearch)
- **Intelligent Scoring**: Combines 8+ signals (style, price, size, rules, popularity, freshness)
- **MMR Diversification**: Ensures diverse results across brands, categories, and attributes
- **Rule Engine**: Designer-driven boost/bury/block rules with priority resolution
- **Explainability**: Machine-readable and human-readable explanations for every recommendation
- **Teaching Loop**: Feedback integration for continuous improvement
- **MLflow Integration**: Model versioning, experimentation, and A/B testing

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    API Gateway (FastAPI)                     │
├─────────────────────────────────────────────────────────────┤
│  Recommendations │ Similar Products │ Feedback │ Rules/Admin │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌──────────────┐      ┌──────────────┐      ┌─────────────┐
│   Candidate  │      │   Scoring &  │      │    Rule     │
│  Generation  │──────▶  Re-ranking  │◀─────│   Engine    │
└──────────────┘      └──────────────┘      └─────────────┘
        │                     │
        │                     ▼
        │             ┌──────────────┐
        │             │     MMR      │
        │             │ Diversity    │
        │             └──────────────┘
        │                     │
        ▼                     ▼
┌──────────────────────────────────────┐
│         Explainability Engine         │
└──────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────┐
│      Redis Cache + DB Logging        │
└──────────────────────────────────────┘
```

## Quick Start

### Prerequisites

- Python 3.11+
- Docker & Docker Compose
- PostgreSQL 16 with pgvector
- Redis 7+

### Local Development

1. **Clone and setup**:
   ```bash
   cd services/aesthete-engine
   cp .env.example .env
   ```

2. **Install dependencies**:
   ```bash
   pip install -r requirements-dev.txt
   ```

3. **Start services**:
   ```bash
   docker-compose up -d
   ```

4. **Run migrations**:
   ```bash
   alembic upgrade head
   ```

5. **Start application**:
   ```bash
   uvicorn app.main:app --reload
   ```

6. **Access API**:
   - API: http://localhost:8000
   - Docs: http://localhost:8000/docs
   - Health: http://localhost:8000/healthz

### Running Tests

```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=app --cov-report=html

# Run specific test file
pytest tests/test_scoring.py

# Run integration tests only
pytest -m integration
```

## API Endpoints

### Recommendations

**POST /v1/recommendations**

Get personalized recommendations for a user profile.

```json
{
  "profile_id": "user123",
  "context": {
    "room": "living",
    "slot": "feed",
    "strictSize": false
  },
  "filters": {
    "category": ["sofas", "chairs"],
    "brand": ["Article"]
  },
  "limit": 20,
  "include_explanations": true
}
```

**Response**:
```json
{
  "trace_id": "uuid",
  "model": {
    "version": "rec-1.0.0",
    "embeddingModel": "clip-vit-b-32"
  },
  "rules_version": "2025-10-03T12:00:00Z",
  "results": [
    {
      "product_id": "p123",
      "score": 0.87,
      "reasons": [
        {"type": "vec_sim", "facet": "scandinavian", "weight": 0.34},
        {"type": "rule_boost", "id": "R-42", "weight": 0.12}
      ],
      "source": ["vec", "lex"],
      "explanation": { /* detailed explanation */ }
    }
  ]
}
```

### Similar Products

**POST /v1/similar-products**

Find products similar to a reference product.

```json
{
  "product_id": "p123",
  "limit": 20,
  "filters": {}
}
```

### Feedback

**POST /v1/feedback**

Submit designer/user feedback on recommendations.

```json
{
  "profile_id": "user123",
  "product_id": "p456",
  "interaction": "approve|reject|replace_with|similar_to",
  "context": {},
  "weight": 1.0
}
```

### Rules Management

**POST /v1/rules** - Create rule
**PATCH /v1/rules/{id}** - Update rule
**GET /v1/rules** - List rules
**DELETE /v1/rules/{id}** - Delete rule

**Example Rule**:
```json
{
  "scope": "designer",
  "predicate": {
    "material": {"$in": ["walnut", "oak"]},
    "price": {"$lt": 3000}
  },
  "effect": "boost",
  "weight": 0.3,
  "created_by": "designer123"
}
```

## Recommendation Algorithm

### Pipeline Overview

1. **Candidate Generation** (Hybrid Retrieval)
   - Vector ANN search via pgvector HNSW (top-500)
   - Lexical search via OpenSearch (top-300)
   - Union and deduplicate

2. **Hard Constraint Filtering**
   - Blocked materials → drop
   - Banned vendors → drop
   - Size violations (if strict) → drop
   - Discontinued/expired → drop

3. **Rule Evaluation**
   - Fetch applicable rules (global → category → collection → designer → user)
   - Apply effects: boost (+), bury (-), block (remove)
   - Resolve conflicts by priority and weight sum

4. **Hybrid Scoring**
   ```
   score = w_vec × sim + w_text × lex + w_price × price_fit
         + w_size × size_fit + w_rules × rule_effect
         + w_pop × popularity + w_new × freshness
         - w_penalty × violations
   ```

   Default weights:
   - `w_vec = 0.45` (vector similarity)
   - `w_text = 0.10` (lexical relevance)
   - `w_price = 0.10` (price fit to budget)
   - `w_size = 0.10` (size fit to room)
   - `w_rules = 0.15` (rule effects)
   - `w_pop = 0.05` (popularity)
   - `w_new = 0.05` (freshness)
   - `w_penalty = 0.30` (violations)

5. **MMR Diversification** (λ = 0.8)
   - Balance relevance vs diversity
   - Enforce caps: max 3 per brand, 4 per subcategory
   - Features: brand, color, subcategory, price band

6. **Explainability Generation**
   - Compute contribution percentages
   - Generate human-readable reasons
   - Document constraint satisfaction
   - Link to applied rules

### Embedding Construction

**Product Embedding**:
```
v_img = CLIP_image_encoder(product_image)  # 768-d
v_txt = CLIP_text_encoder(name + desc + attrs)  # 768-d

v_product = normalize(α × v_img + (1-α) × v_txt)
```

Default `α = 0.6` (60% image, 40% text)

**Profile Vector**:
- 32-dimensional style preference vector from Style Profile service
- Mapped to product embedding space via learned projection

### Caching Strategy

- **Recommendation Cache**: (profileId, context) → top-100, TTL 5-15 min
- **Candidate Sets**: Precomputed nightly for active users
- **Model Info**: Cached model versions, TTL 1 hour
- **Invalidation**: On profile update, rules change, or model switch

## Configuration

Key environment variables (see `.env.example`):

### Model Configuration
```bash
EMBEDDING_MODEL_NAME=clip-vit-b-32
EMBEDDING_DIM=768
SCORE_VEC_DIM=32
ALPHA_IMG_TEXT=0.6
```

### Scoring Weights
```bash
WEIGHT_VEC=0.45
WEIGHT_TEXT=0.10
WEIGHT_PRICE=0.10
WEIGHT_SIZE=0.10
WEIGHT_RULES=0.15
WEIGHT_POP=0.05
WEIGHT_NEW=0.05
WEIGHT_PENALTY=0.30
```

### Performance Tuning
```bash
VECTOR_TOP_K=500
LEXICAL_TOP_K=300
CACHE_TTL_SECONDS=600
BATCH_SIZE=32
```

### Feature Flags
```bash
ENABLE_MMR_DIVERSITY=true
MMR_LAMBDA=0.8
ENABLE_EXPLAINABILITY=true
ENABLE_PRECOMPUTE=true
```

## Deployment

### Kubernetes

```bash
# Apply configurations
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secret.yaml
kubectl apply -f k8s/deployment.yaml

# Check status
kubectl get pods -n patina -l app=aesthete-engine

# View logs
kubectl logs -n patina -l app=aesthete-engine --tail=100 -f
```

### Docker Build

```bash
# Build production image
docker build -t aesthete-engine:latest --target production .

# Run container
docker run -p 8000:8000 \
  -e DATABASE_URL=postgresql://... \
  -e REDIS_URL=redis://... \
  aesthete-engine:latest
```

### Auto-scaling

HPA configuration scales pods based on:
- CPU utilization (target: 70%)
- Memory utilization (target: 80%)
- Min replicas: 3, Max replicas: 10

## Monitoring & Observability

### Metrics (Prometheus)

- `rec_request_duration_seconds` - Request latency histogram
- `rec_candidate_count` - Number of candidates generated
- `rec_cache_hit_rate` - Cache hit rate
- `rec_rule_evaluation_duration` - Rule evaluation time

### Tracing (OpenTelemetry)

Distributed tracing enabled for:
- Full recommendation pipeline
- Vector search queries
- Rule evaluation
- Cache operations

### Logging

Structured JSON logs with:
- `trace_id` - Request trace ID
- `profile_id` - User profile
- `model_version` - Model version used
- `latency_ms` - Request latency

## Performance Targets (SLOs)

- **Latency**: p95 < 250ms, p99 < 500ms (N=20)
- **Throughput**: 30 QPS sustained
- **Availability**: 99.9%
- **Freshness**: ≤ 60s from profile/catalog change to reflected recs

## MLflow Integration

### Model Registry

```python
from app.ml.mlflow_integration import MLflowModelRegistry

registry = MLflowModelRegistry()

# Get production model
model = registry.get_production_model("embedding-model")

# Promote to production
registry.promote_to_production("embedding-model", version="3")
```

### A/B Testing

```python
from app.ml.mlflow_integration import ABTestManager

ab_test = ABTestManager()

# Create test
test_id = ab_test.create_ab_test(
    test_name="mmr-lambda-test",
    model_a="baseline",
    model_b="mmr-0.9",
    split_ratio=0.5
)

# Get assignment
model = ab_test.get_model_assignment(test_id, user_id)
```

## Evaluation Metrics

### Offline Metrics (Weekly)
- **NDCG@K** (K∈{5,10,20}): Ranking quality
- **MRR**: Mean reciprocal rank
- **Coverage**: Catalog coverage across categories
- **Diversity**: Entropy on brand/category/color
- **Fairness**: No sensitive attribute correlation

### Online Metrics (Daily)
- **CTR@K**: Click-through rate
- **Save/ATC Rate**: Save or add-to-cart rate
- **Override Rate**: Designer reject/replace rate
- **Conversion Lift**: vs. cold start baseline

## Development

### Project Structure

```
aesthete-engine/
├── app/
│   ├── api/           # API endpoints
│   │   ├── v1/        # v1 routes
│   │   └── models.py  # Pydantic models
│   ├── core/          # Core logic
│   │   ├── scoring.py
│   │   ├── diversification.py
│   │   ├── rules.py
│   │   ├── explainability.py
│   │   ├── feedback.py
│   │   └── recommendation_service.py
│   ├── ml/            # ML modules
│   │   ├── embeddings.py
│   │   ├── vector_search.py
│   │   └── mlflow_integration.py
│   ├── db/            # Database
│   │   ├── models.py
│   │   └── database.py
│   ├── cache/         # Caching
│   │   └── redis_cache.py
│   ├── config.py      # Configuration
│   └── main.py        # FastAPI app
├── tests/             # Tests
├── k8s/              # Kubernetes manifests
├── docker/           # Docker configs
├── scripts/          # Utility scripts
└── docs/             # Documentation
```

### Code Quality

```bash
# Format code
black app tests
isort app tests

# Lint
ruff check app tests

# Type check
mypy app
```

## Troubleshooting

### Common Issues

**1. High Latency**
- Check pgvector index: `EXPLAIN ANALYZE SELECT ... ORDER BY vector <=> ...`
- Increase `ef_search` parameter for HNSW
- Enable caching and precompute

**2. Poor Recommendations**
- Review scoring weights in config
- Check rule conflicts: `GET /v1/rules?active=true`
- Validate embeddings quality: inspect similarity distributions

**3. Cache Issues**
- Verify Redis connection: `redis-cli PING`
- Check TTL settings
- Monitor cache hit rate

## Contributing

1. Create feature branch: `git checkout -b feature/xyz`
2. Write tests for new functionality
3. Ensure `pytest` passes and coverage > 80%
4. Format and lint code
5. Submit PR with description

## License

Proprietary - Patina Design Platform

## Support

- Documentation: `/docs` in running service
- Issues: GitHub Issues
- Team: ML Team @ Patina
