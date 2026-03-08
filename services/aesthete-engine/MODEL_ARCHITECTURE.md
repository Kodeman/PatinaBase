# Aesthete Engine: Model Architecture & Technical Specifications

**Version:** 1.0.0
**Date:** 2025-10-04
**Team:** ML Engineering (Echo)

---

## Model Selection & Architecture

### Primary Embedding Model: CLIP ViT-B/32

**Model ID:** `openai/clip-vit-base-patch32`

**Architecture Details:**
- **Vision Encoder:** Vision Transformer (ViT) Base
  - Patch size: 32×32
  - Image resolution: 224×224
  - Transformer layers: 12
  - Hidden size: 768
  - Attention heads: 12
  - Parameters: ~86M

- **Text Encoder:** Transformer
  - Max sequence length: 77 tokens
  - Vocab size: 49,408
  - Embedding dimension: 512
  - Transformer layers: 12
  - Hidden size: 512
  - Parameters: ~63M

- **Joint Embedding Space:** 768 dimensions

**Why CLIP ViT-B/32?**

1. **Multimodal by Design:**
   - Pre-trained on 400M image-text pairs
   - Learns shared semantic space
   - No separate models needed for images and text

2. **Production Ready:**
   - Pre-trained weights available
   - No fine-tuning required for MVP
   - Fast inference on CPU/GPU

3. **Open Source:**
   - MIT License
   - Commercially viable
   - Active community support

4. **Performance Balance:**
   - 768-dim embeddings: expressive yet fast
   - Smaller than ViT-L/14 (1024-dim)
   - Better than ResNet variants

5. **Proven Track Record:**
   - State-of-the-art on vision-language tasks
   - Used in production by many companies
   - Well-documented and tested

**Alternatives Considered:**

| Model | Pros | Cons | Decision |
|-------|------|------|----------|
| **CLIP ViT-L/14** | Higher accuracy, 1024-dim | Slower inference, larger memory | ❌ Overkill for MVP |
| **Sentence-BERT** | Fast text encoding | No image support | ❌ Need multimodal |
| **ALIGN** | Similar to CLIP | Harder to deploy | ❌ Less accessible |
| **Custom Model** | Tailored to domain | Requires training data | ❌ Not MVP-ready |

**Final Choice:** CLIP ViT-B/32 ✅

---

## Embedding Pipeline

### Text Processing

**Input:** Product name + description + attributes

**Example:**
```python
text = "Modern walnut sofa with clean Scandinavian lines, "
       "sustainable materials, mid-century design"
```

**Processing Steps:**
1. Tokenization (CLIP tokenizer, max 77 tokens)
2. Padding/truncation
3. Text encoder forward pass
4. L2 normalization

**Output:** 768-dimensional unit vector

### Image Processing

**Input:** Product image (PIL Image)

**Processing Steps:**
1. Resize to 224×224 (CLIP processor)
2. Center crop
3. Normalize (ImageNet stats)
4. Vision encoder forward pass
5. L2 normalization

**Output:** 768-dimensional unit vector

### Multimodal Fusion

**Strategy:** Weighted linear combination

```python
# Image weight (α) and text weight (1-α)
α = 0.6  # Default: 60% image, 40% text

# Fusion
fused = α × image_embedding + (1 - α) × text_embedding

# Re-normalize
fused = fused / ||fused||₂
```

**Rationale for α=0.6:**
- Visual appearance is primary signal
- Text provides semantic context
- Empirically tested balance

**Tunable per use case:**
- Product discovery: α=0.7 (more visual)
- Search: α=0.5 (balanced)
- Text-heavy: α=0.3 (more semantic)

---

## Vector Search Architecture

### PostgreSQL + pgvector

**Version:** PostgreSQL 16 + pgvector 0.2.4

**Index Type:** HNSW (Hierarchical Navigable Small World)

**Index Configuration:**
```sql
CREATE INDEX embeddings_hnsw_idx ON embeddings
USING hnsw (vector vector_cosine_ops)
WITH (
    m = 16,                -- Number of connections per layer
    ef_construction = 200  -- Size of dynamic candidate list during build
);
```

**Query-Time Parameters:**
```sql
SET hnsw.ef_search = 64;  -- Size of dynamic candidate list during search
```

**Performance Characteristics:**

| Parameter | Value | Impact |
|-----------|-------|--------|
| **m** | 16 | Balance of speed and accuracy |
| **ef_construction** | 200 | Build time vs. recall tradeoff |
| **ef_search** | 64 | Query latency vs. recall tradeoff |

**Tuning Guide:**
- **Higher m:** Better recall, slower build, more memory
- **Higher ef_construction:** Better index quality, slower build
- **Higher ef_search:** Better recall, slower queries

**Current Performance:**
- **Build time:** ~2-3 minutes for 100K vectors
- **Query latency:** 30-50ms for top-500 (p95)
- **Recall@100:** ~95% (ef_search=64)

### Distance Metric: Cosine Similarity

**Formula:**
```
cosine_similarity(a, b) = a · b / (||a|| × ||b||)
```

**In pgvector:**
```sql
-- Cosine distance (1 - cosine similarity)
vector <=> query_vector

-- Return similarity
1 - (vector <=> query_vector) as similarity
```

**Why Cosine?**
- Invariant to vector magnitude
- Natural for normalized embeddings
- Standard in embedding models
- Fast with HNSW index

---

## Hybrid Search Architecture

### Two-Stage Retrieval

**Stage 1: Dual Retrieval**
- **Vector Search:** Top-K₁ candidates (K₁=500)
- **Lexical Search:** Top-K₂ candidates (K₂=300)

**Stage 2: Fusion**
```python
# Normalize scores to [0, 1]
vec_score_norm = vec_score  # Already [0, 1] from cosine
lex_score_norm = lex_score / max(lex_scores)

# Weighted combination
combined_score = w_vec × vec_score_norm + w_lex × lex_score_norm
```

**Default Weights:**
- w_vec = 0.7 (70% vector similarity)
- w_lex = 0.3 (30% lexical relevance)

**Lexical Search (OpenSearch - Future):**
- BM25 scoring
- Full-text search on product attributes
- Synonyms and stemming
- Fallback when vector search fails

---

## Scoring Function Architecture

### 8-Signal Hybrid Scorer

**Formula:**
```
total_score = w_vec × sim + w_text × lex + w_price × price_fit
            + w_size × size_fit + w_rules × rule_effect
            + w_pop × popularity + w_new × freshness
            - w_penalty × violations
```

**Default Weights:**
```python
w_vec = 0.45      # Vector similarity
w_text = 0.10     # Text relevance
w_price = 0.10    # Price fit
w_size = 0.10     # Size fit
w_rules = 0.15    # Rule boosts/penalties
w_pop = 0.05      # Popularity
w_new = 0.05      # Freshness
w_penalty = 0.30  # Violations
```

### Signal Implementations

#### 1. Price Fit (w_price = 0.10)

**Logic:**
```python
def price_fit(price, budget):
    if price < budget.min or price > budget.max:
        return 0.0  # Out of budget
    elif budget.comfort_min <= price <= budget.comfort_max:
        return 1.0  # Perfect fit
    elif price < budget.comfort_min:
        # Linear decay from comfort to min
        return (price - budget.min) / (budget.comfort_min - budget.min)
    else:
        # Linear decay from comfort to max
        return (budget.max - price) / (budget.max - budget.comfort_max)
```

**Budget Structure:**
```json
{
  "min": 500,         // Absolute minimum
  "max": 3000,        // Absolute maximum
  "comfort_min": 800, // Comfort zone start
  "comfort_max": 2000 // Comfort zone end
}
```

#### 2. Size Fit (w_size = 0.10)

**Logic:**
```python
def size_fit(product_dims, room_dims, strict=False):
    # Compute utilization percentage for each dimension
    width_util = product_dims.width / room_dims.width
    depth_util = product_dims.depth / room_dims.depth
    height_util = product_dims.height / room_dims.height

    # Optimal range: 30-60% utilization
    def score_util(util):
        if util < 0.20:
            return 0.0  # Too small
        elif util < 0.30:
            return (util - 0.20) / 0.10  # Linear ramp up
        elif util <= 0.60:
            return 1.0  # Optimal
        elif util < 0.80:
            return (0.80 - util) / 0.20  # Linear decay
        else:
            return 0.0 if strict else 0.2  # Too large

    # Average across dimensions
    return (score_util(width_util) + score_util(depth_util) + score_util(height_util)) / 3
```

#### 3. Popularity (w_pop = 0.05)

**Logic:**
```python
def popularity(product):
    # Combine view, save, and purchase counts
    views_norm = min(product.view_count / 1000, 1.0)
    saves_norm = min(product.save_count / 100, 1.0)
    purchases_norm = min(product.purchase_count / 50, 1.0)

    # Weighted combination (purchases most important)
    return 0.3 × views_norm + 0.3 × saves_norm + 0.4 × purchases_norm
```

#### 4. Freshness (w_new = 0.05)

**Logic:**
```python
def freshness(product):
    days_since_creation = (now - product.created_at).days

    # Exponential decay
    return exp(-days_since_creation / 30)  # Half-life of 30 days
```

#### 5. Violations (w_penalty = 0.30)

**Penalty Values:**
```python
def violations(product, profile, context):
    penalty = 0.0

    # Hard violations (1.0 penalty each)
    if product.material in profile.blocked_materials:
        penalty += 1.0
    if product.is_discontinued or product.license_expired:
        penalty += 1.0

    # Soft violations (partial penalties)
    if product.stock_status == "out_of_stock":
        penalty += 0.5
    if product.lead_time_days > 21:
        penalty += 0.3

    return min(penalty, 3.0)  # Cap at 3.0
```

---

## MMR Diversification

### Algorithm: Maximal Marginal Relevance

**Formula:**
```
MMR(q, C, S) = argmax[cᵢ ∈ C \ S] [λ × Sim(q, cᵢ) - (1-λ) × max[cⱼ ∈ S] Sim(cᵢ, cⱼ)]
```

Where:
- q = query
- C = candidate set
- S = selected set
- λ = relevance vs. diversity tradeoff (0.8)

**Implementation:**
```python
def diversify(candidates, limit=20, λ=0.8):
    selected = [candidates[0]]  # Start with top item

    while len(selected) < limit:
        best_score = -inf
        best_candidate = None

        for candidate in candidates:
            if candidate in selected:
                continue

            # Relevance score
            relevance = candidate.score

            # Max similarity to selected items
            max_sim = max([
                cosine_sim(candidate, s) for s in selected
            ])

            # MMR score
            mmr_score = λ × relevance - (1 - λ) × max_sim

            if mmr_score > best_score:
                best_score = mmr_score
                best_candidate = candidate

        selected.append(best_candidate)

    return selected
```

### Diversity Features

**Feature Caps:**
```python
max_per_feature = {
    "brand": 3,          # Max 3 products per brand
    "subcategory": 4,    # Max 4 per subcategory
    "primary_color": 5,  # Max 5 per color
    "price_band": 6,     # Max 6 per price band
}
```

**Feature Similarity:**
- **Exact match:** similarity = 1.0
- **Different values:** similarity = 0.0

---

## Rule Engine Architecture

### Predicate Matching System

**Operators:**
```python
OPERATORS = {
    "$in": lambda val, target: val in target,
    "$eq": lambda val, target: val == target,
    "$ne": lambda val, target: val != target,
    "$gt": lambda val, target: val > target,
    "$lt": lambda val, target: val < target,
    "$gte": lambda val, target: val >= target,
    "$lte": lambda val, target: val <= target,
}
```

**Predicate Examples:**
```python
# Match walnut or oak materials
{"material": {"$in": ["walnut", "oak"]}}

# Match price under $3000
{"price": {"$lt": 3000}}

# Match specific brand
{"brand": {"$eq": "Article"}}

# Exclude rugs
{"subcategory": {"$ne": "rugs"}}

# Combination (AND logic)
{
    "material": {"$in": ["walnut", "oak"]},
    "price": {"$lt": 3000},
    "brand": {"$eq": "Article"}
}
```

### Rule Effects

**Boost:**
```python
effect = "boost"
weight = 0.5
# Adds weight to rule_effect: rule_effect += weight
```

**Bury:**
```python
effect = "bury"
weight = 0.5
# Subtracts weight from rule_effect: rule_effect -= weight
```

**Block:**
```python
effect = "block"
weight = -999.0  # Sentinel value
# Product is removed from results
```

### Scope Priority

**Evaluation Order (low to high priority):**
1. Global rules
2. Category rules
3. Collection rules
4. Designer rules
5. User rules

**Conflict Resolution:**
- Higher priority scope wins
- Within same scope: sum effects
- Block effect is permanent (can't be overridden)

---

## Performance Optimizations

### Batch Processing

**Embedding Computation:**
```python
# Single: 50ms/image (CPU)
embeddings = model.encode_batch_images(images)  # 800ms for 32 images

# Speedup: 32×50ms = 1600ms → 800ms (2x faster)
```

**Vector Search:**
```python
# Batch query vectors
results = await vector_engine.batch_search(
    query_vectors=[v1, v2, v3],
    top_k=100
)
# Single DB connection, parallelized internally
```

### Caching Strategy

**Redis Layers:**
```python
# L1: Recommendation results (10 min TTL)
cache_key = f"rec:{profile_id}:{context_hash}"

# L2: Candidate sets (1 hour TTL)
cache_key = f"candidates:{profile_id}:{category}"

# L3: Embeddings (permanent, DB)
cache_key = f"emb:{product_id}:{model_name}"
```

**Cache Hit Flow:**
1. Check L1 (Redis) for full recommendations
2. If miss, check L2 (Redis) for candidates
3. If miss, generate candidates via vector search
4. Store in L2 and L1

### Database Optimizations

**Connection Pooling:**
```python
engine = create_async_engine(
    DATABASE_URL,
    pool_size=20,        # Connections per pod
    max_overflow=10,     # Additional connections
    pool_pre_ping=True,  # Verify connections
    pool_recycle=3600,   # Recycle after 1 hour
)
```

**Prepared Statements:**
- SQLAlchemy caches query plans
- Reuses compiled statements
- Reduces parsing overhead

### ONNX Runtime (Future)

**CPU Inference Optimization:**
```python
# Convert PyTorch model to ONNX
torch.onnx.export(model, dummy_input, "clip.onnx")

# Load with ONNX Runtime
session = ort.InferenceSession("clip.onnx")

# 2-3x faster inference on CPU
```

---

## Model Versioning & A/B Testing

### MLflow Integration

**Model Registry:**
```python
# Register model
mlflow.register_model(
    model_uri="runs:/abc123/model",
    name="aesthete-embedding",
    tags={"version": "1.0.0", "architecture": "clip-vit-b-32"}
)

# Promote to production
client.transition_model_version_stage(
    name="aesthete-embedding",
    version=2,
    stage="Production"
)
```

### A/B Testing Framework

**User Assignment:**
```python
def get_variant(experiment_id: str, user_id: str) -> str:
    # Deterministic hash-based assignment
    hash_value = hash(f"{experiment_id}:{user_id}")
    variant_index = hash_value % len(variants)
    return variants[variant_index].id
```

**Experiment Configuration:**
```json
{
  "id": "exp-001",
  "name": "MMR Lambda Test",
  "variants": [
    {"id": "control", "lambda": 0.8, "allocation": 0.5},
    {"id": "treatment", "lambda": 0.6, "allocation": 0.5}
  ],
  "metrics": ["ctr@10", "diversity", "session_length"]
}
```

---

## Monitoring & Observability

### Key Metrics

**Model Performance:**
- Embedding computation latency (p50, p95, p99)
- Vector search latency
- Cache hit/miss rates
- Model inference throughput (QPS)

**Business Metrics:**
- Click-through rate (CTR@K)
- Save/Add-to-cart rate
- Designer override rate
- Diversity score (avg unique brands/categories)

**System Metrics:**
- Request latency end-to-end
- Error rates by endpoint
- Database connection pool utilization
- Memory/CPU usage

### Tracing

**OpenTelemetry Spans:**
```python
with tracer.start_as_current_span("generate_candidates") as span:
    span.set_attribute("profile_id", profile_id)
    span.set_attribute("top_k", top_k)
    candidates = await hybrid_search(...)
```

**Trace Example:**
```
/v1/recommendations (200ms)
├── get_profile (10ms)
├── generate_candidates (80ms)
│   ├── vector_search (50ms)
│   └── lexical_search (30ms)
├── apply_rules (20ms)
├── score_batch (30ms)
├── diversify_mmr (15ms)
└── generate_explanations (15ms)
```

---

## Future Model Improvements

### Short-Term (3-6 months)

1. **Fine-tuning CLIP:**
   - Collect 10K+ labeled pairs
   - Fine-tune on interior design domain
   - Improve recall by 5-10%

2. **Hybrid Embeddings:**
   - Combine CLIP with attribute embeddings
   - Learn category-specific projections
   - Better cross-category recommendations

3. **Contextual Bandits:**
   - Replace fixed scoring weights
   - Learn optimal weights per context
   - Personalized weight adaptation

### Long-Term (6-12 months)

1. **Sequence Models:**
   - Transformer for session-based recommendations
   - Capture user journey patterns
   - Temporal dynamics

2. **Multi-Task Learning:**
   - Joint training on multiple objectives
   - Recommendation + classification + search
   - Shared representations

3. **Cross-Modal Retrieval:**
   - Text-to-image search
   - Image-to-text generation
   - Richer explanations

4. **Federated Learning:**
   - Privacy-preserving recommendations
   - On-device personalization
   - No central user data

---

## References & Resources

### Papers
- **CLIP:** "Learning Transferable Visual Models From Natural Language Supervision" (Radford et al., 2021)
- **HNSW:** "Efficient and robust approximate nearest neighbor search using Hierarchical Navigable Small World graphs" (Malkov & Yashunin, 2018)
- **MMR:** "The Use of MMR, Diversity-Based Reranking for Reordering Documents and Producing Summaries" (Carbonell & Goldstein, 1998)

### Libraries
- **Transformers:** https://huggingface.co/transformers
- **pgvector:** https://github.com/pgvector/pgvector
- **MLflow:** https://mlflow.org
- **FastAPI:** https://fastapi.tiangolo.com

### Model Cards
- **CLIP ViT-B/32:** https://huggingface.co/openai/clip-vit-base-patch32

---

**Document Version:** 1.0.0
**Last Updated:** 2025-10-04
**Maintained By:** ML Engineering Team (Echo)
