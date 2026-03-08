# Aesthete Engine Recommendation Algorithm

**Detailed Technical Specification**

## Table of Contents

1. [Overview](#overview)
2. [Pipeline Architecture](#pipeline-architecture)
3. [Candidate Generation](#candidate-generation)
4. [Scoring Functions](#scoring-functions)
5. [Diversification](#diversification)
6. [Rule System](#rule-system)
7. [Explainability](#explainability)
8. [Performance Optimizations](#performance-optimizations)

---

## Overview

The Aesthete Engine implements a **hybrid multimodal recommendation system** that combines:

- **Content-based filtering** via CLIP-style embeddings
- **Collaborative signals** via popularity and feedback
- **Rule-based steering** for designer control
- **Constraint satisfaction** for practical feasibility

### Design Principles

1. **Explainability First**: Every recommendation must be explainable
2. **Designer in Control**: Rules and feedback steer outcomes
3. **Performance**: p95 latency < 250ms for 20 results
4. **Diversity**: Avoid redundancy across multiple dimensions

---

## Pipeline Architecture

```
Input: (profileId, context, filters)
  │
  ├─> 1. Candidate Generation
  │     ├─> Vector Retrieval (pgvector HNSW)
  │     ├─> Lexical Retrieval (OpenSearch)
  │     └─> Union & Deduplicate
  │
  ├─> 2. Hard Constraint Filtering
  │     ├─> Material blocks
  │     ├─> Vendor bans
  │     ├─> Size violations
  │     └─> Availability
  │
  ├─> 3. Rule Evaluation
  │     ├─> Fetch applicable rules
  │     ├─> Apply effects (boost/bury/block)
  │     └─> Resolve conflicts
  │
  ├─> 4. Hybrid Scoring
  │     ├─> Vector similarity
  │     ├─> Text relevance
  │     ├─> Price fit
  │     ├─> Size fit
  │     ├─> Rule effects
  │     ├─> Popularity
  │     ├─> Freshness
  │     └─> Penalties
  │
  ├─> 5. MMR Diversification
  │     ├─> Relevance-diversity tradeoff
  │     ├─> Feature constraints
  │     └─> Incremental selection
  │
  └─> 6. Explainability
        ├─> Contribution analysis
        ├─> Human-readable reasons
        └─> Trace logging

Output: Ranked list with explanations
```

---

## Candidate Generation

### Vector Retrieval (Primary)

**Objective**: Find products with similar style/aesthetics to user profile

**Method**: ANN search using pgvector HNSW index

```sql
SELECT product_id,
       1 - (embedding <=> query_vector) as similarity
FROM embeddings
WHERE model_name = 'clip-v1'
ORDER BY embedding <=> query_vector
LIMIT 500
```

**Index Configuration**:
- Algorithm: HNSW (Hierarchical Navigable Small World)
- Parameters: `M=16, ef_construction=200`
- Query tuning: `ef_search=64` for p95 < 50ms
- Distance: Cosine (via `<=>` operator)

**Query Vector Construction**:
```python
# From Style Profile (32-dim) to embedding space (768-dim)
query_vector = profile_projection_matrix @ score_vec
query_vector = normalize(query_vector)
```

### Lexical Retrieval (Fallback)

**Objective**: Capture exact matches and keyword-based relevance

**Method**: OpenSearch BM25 full-text search

```json
{
  "query": {
    "multi_match": {
      "query": "scandinavian walnut sofa",
      "fields": ["name^3", "description", "brand^2", "category"],
      "type": "best_fields",
      "fuzziness": "AUTO"
    }
  },
  "size": 300
}
```

**Query Construction**:
- Room type: "living room"
- Category filters: "sofas"
- Brand filters: "Article"
- Style facets: "scandinavian", "mid-century"

### Fusion Strategy

**Union Merge**:
```python
candidates = {}

for result in vector_results:
    candidates[result.product_id] = {
        'vec_score': result.similarity,
        'sources': ['vec']
    }

for result in lexical_results:
    if result.product_id in candidates:
        candidates[result.product_id]['lex_score'] = result.score
        candidates[result.product_id]['sources'].append('lex')
    else:
        candidates[result.product_id] = {
            'lex_score': result.score,
            'sources': ['lex']
        }
```

**Deduplication**: Keep first occurrence, merge scores

---

## Scoring Functions

### Hybrid Score Formula

```
score(i) = w_vec × sim_vec(i)
         + w_text × sim_lex(i)
         + w_price × fit_price(i)
         + w_size × fit_size(i)
         + w_rules × effect_rules(i)
         + w_pop × score_pop(i)
         + w_new × score_fresh(i)
         - w_penalty × penalty(i)
```

### Default Weights

| Component | Weight | Rationale |
|-----------|--------|-----------|
| Vector similarity | 0.45 | Primary style matching |
| Text relevance | 0.10 | Keyword/brand matching |
| Price fit | 0.10 | Budget alignment |
| Size fit | 0.10 | Spatial constraints |
| Rule effects | 0.15 | Designer steering |
| Popularity | 0.05 | Social proof |
| Freshness | 0.05 | Novelty |
| Penalties | 0.30 | Violation suppression |

### Component Functions

#### 1. Vector Similarity
```python
sim_vec(i) = cosine(embedding_i, query_vector)
           = dot(emb_i, q_vec) / (norm(emb_i) × norm(q_vec))
```

Range: [0, 1] (normalized)

#### 2. Price Fit
```python
def fit_price(product, profile):
    price = product.price
    min_budget = profile.budgetBand.min
    max_budget = profile.budgetBand.max
    comfort_min = profile.budgetBand.comfortMin
    comfort_max = profile.budgetBand.comfortMax

    if comfort_min <= price <= comfort_max:
        return 1.0  # Perfect fit
    elif min_budget <= price <= max_budget:
        if price < comfort_min:
            return 0.5 + 0.5 × (price - min_budget) / (comfort_min - min_budget)
        else:
            return 0.5 + 0.5 × (max_budget - price) / (max_budget - comfort_max)
    elif price < min_budget:
        return 0.3  # Too cheap (quality concern)
    else:
        return 0.0  # Too expensive
```

Range: [0, 1]

#### 3. Size Fit
```python
def fit_size(product, profile, context):
    room = context.room
    strict = context.strictSize

    prod_dims = product.dimensions
    room_dims = profile.roomDimensions[room]

    if strict:
        # Hard constraint
        if (prod_dims.width > room_dims.width or
            prod_dims.depth > room_dims.depth):
            return 0.0

    # Utilization scoring (optimal: 30-60% of room dimension)
    width_ratio = prod_dims.width / room_dims.width
    depth_ratio = prod_dims.depth / room_dims.depth

    def util_score(ratio):
        if ratio < 0.2: return 0.5      # Too small
        elif ratio < 0.3: return 0.7 + 3×(ratio - 0.2)
        elif ratio < 0.6: return 1.0    # Optimal
        elif ratio < 0.8: return 1.0 - 2×(ratio - 0.6)
        else: return 0.3                # Too large

    return (util_score(width_ratio) + util_score(depth_ratio)) / 2
```

Range: [0, 1]

#### 4. Popularity
```python
def score_pop(product):
    views = product.viewCount
    saves = product.saveCount
    purchases = product.purchaseCount

    # Weighted engagement
    engagement = (purchases × 10 + saves × 3 + views) / 100

    # Log scaling (prevents outliers)
    return min(log1p(engagement) / log1p(1000), 1.0)
```

Range: [0, 1]

#### 5. Freshness
```python
def score_fresh(product):
    age_days = (now - product.createdAt).days

    # Exponential decay (half-life = 30 days)
    return exp(-age_days / 30)
```

Range: [0, 1]

#### 6. Violations/Penalties
```python
def penalty(product, profile, context):
    violations = 0.0

    # Out of stock
    if product.stockStatus == 'out_of_stock':
        violations += 0.5

    # Blocked materials
    if profile.blockedMaterials ∩ product.materials:
        violations += 1.0  # Hard violation

    # Lead time
    if context.leadTimeTolerance == 'low' and product.leadTimeDays > 7:
        violations += 0.3

    # Discontinued
    if product.isDiscontinued:
        violations += 1.0

    return min(violations, 1.0)
```

Range: [0, 1]

---

## Diversification

### MMR Algorithm (Maximal Marginal Relevance)

**Objective**: Balance relevance and diversity

**Formula**:
```
MMR = λ × Relevance(i) + (1-λ) × Diversity(i)

where:
  λ = 0.8 (favor relevance)
  Relevance(i) = hybrid_score(i)
  Diversity(i) = min_similarity_to_selected(i)
```

**Algorithm**:
```python
def mmr_diversify(candidates, limit=20, λ=0.8):
    selected = []
    feature_counts = defaultdict(dict)

    # Always select top item first
    selected.append(candidates[0])
    update_feature_counts(candidates[0], feature_counts)

    while len(selected) < limit:
        best_score = -inf
        best_idx = None

        for idx, candidate in enumerate(candidates):
            if idx in selected_indices:
                continue

            # Check feature constraints
            if not satisfies_constraints(candidate, feature_counts):
                continue

            # Compute MMR score
            relevance = candidate.score
            diversity = compute_diversity(candidate, selected)

            mmr_score = λ × relevance + (1-λ) × diversity

            if mmr_score > best_score:
                best_score = mmr_score
                best_idx = idx

        if best_idx is None:
            break

        selected.append(candidates[best_idx])
        update_feature_counts(candidates[best_idx], feature_counts)

    return selected
```

### Diversity Features & Constraints

| Feature | Max per Result Set |
|---------|-------------------|
| Brand | 3 items |
| Subcategory | 4 items |
| Primary Color | 5 items |
| Price Band | 6 items |

**Diversity Score**:
```python
def compute_diversity(candidate, selected):
    # Feature-based diversity
    feature_div = 0
    for feature in ['brand', 'color', 'subcategory']:
        matches = sum(1 for s in selected
                     if s[feature] == candidate[feature])
        feature_div += (1 - matches / len(selected))

    feature_div /= 3  # Average

    # Embedding-based diversity (if available)
    if embeddings:
        similarities = [cosine(candidate.emb, s.emb) for s in selected]
        emb_div = 1 - max(similarities)

        return 0.6 × feature_div + 0.4 × emb_div

    return feature_div
```

---

## Rule System

### Rule Model

```python
class Rule:
    id: str
    scope: str  # global|designer|user|collection|category
    predicate: dict  # JSON logic
    effect: str  # boost|bury|block
    weight: float  # [-1.0, 1.0]
    active: bool
    start_at: datetime | None
    end_at: datetime | None
```

### Priority Resolution

**Order** (highest to lowest):
1. User-specific rules
2. Designer rules
3. Collection rules
4. Category rules
5. Global rules

**Conflict Resolution**:
- Same scope: Sum weights (clamped to [-1, 1])
- Different scopes: Higher priority wins
- Ties: Deterministic (by rule ID sort)

**Block Effect**: Overrides all other effects (removes product)

### Predicate Evaluation

**Example Predicates**:
```json
{
  "material": {"$in": ["walnut", "oak"]},
  "price": {"$lt": 3000},
  "brand": {"$ne": "CheapBrand"}
}
```

**Operators**:
- `$in`: Value in list
- `$eq`: Equality
- `$ne`: Not equal
- `$gt`, `$gte`: Greater than (or equal)
- `$lt`, `$lte`: Less than (or equal)

**Evaluation**:
```python
def matches_predicate(product, predicate):
    for field, condition in predicate.items():
        product_value = product[field]

        if '$in' in condition:
            if product_value not in condition['$in']:
                return False
        elif '$eq' in condition:
            if product_value != condition['$eq']:
                return False
        # ... other operators

    return True
```

### Example Rules

**1. Boost Sustainable Materials (Designer)**
```json
{
  "scope": "designer",
  "predicate": {
    "designerId": "d123",
    "materials": {"$in": ["reclaimed_wood", "bamboo", "recycled_metal"]}
  },
  "effect": "boost",
  "weight": 0.3
}
```

**2. Bury Fast Fashion Brands (Global)**
```json
{
  "scope": "global",
  "predicate": {
    "brand": {"$in": ["FastBrand1", "FastBrand2"]}
  },
  "effect": "bury",
  "weight": 0.4
}
```

**3. Block Specific Product (Collection)**
```json
{
  "scope": "collection",
  "predicate": {
    "collectionId": "c456",
    "productId": "p789"
  },
  "effect": "block",
  "weight": 1.0
}
```

---

## Explainability

### Contribution Analysis

**Percentage Calculation**:
```python
def compute_contributions(score_breakdown):
    total_positive = sum(v for v in score_breakdown.values() if v > 0)

    contributions = []
    for component, weight in score_breakdown.items():
        percentage = (weight / total_positive × 100) if total_positive > 0 else 0
        contributions.append({
            'type': component,
            'weight': weight,
            'percentage': percentage
        })

    # Sort by absolute weight
    contributions.sort(key=lambda x: abs(x['weight']), reverse=True)

    return contributions
```

### Human-Readable Reasons

**Template Mapping**:
```python
TEMPLATES = {
    'vec_sim': {
        'high': "Strong style match with your {facets} preferences",
        'medium': "Good style alignment",
    },
    'price_fit': {
        'perfect': "Within your comfort budget range",
        'good': "Within acceptable budget",
    },
    'size_fit': {
        'perfect': "Perfect fit for your {room} space",
    },
    # ...
}
```

**Example Output**:
```json
{
  "reasons": [
    "Strong style match with your Scandinavian & Mid-century preferences",
    "Within your comfort budget range",
    "Perfect fit for your living room space",
    "Recommended by your designer",
    "Features preferred walnut finish",
    "Currently in stock and ready to ship"
  ]
}
```

### Constraint Documentation

```json
{
  "constraints": [
    {
      "type": "budget",
      "satisfied": true,
      "note": "Within budget range ($800-$2500)"
    },
    {
      "type": "materials",
      "satisfied": true,
      "note": "No blocked materials"
    },
    {
      "type": "availability",
      "satisfied": true,
      "note": "Stock status: in_stock"
    },
    {
      "type": "lead_time",
      "satisfied": true,
      "note": "7 days (tolerance: low)"
    }
  ]
}
```

---

## Performance Optimizations

### 1. Indexing Strategy

**pgvector HNSW Index**:
```sql
CREATE INDEX embeddings_hnsw_idx
ON embeddings
USING hnsw (vector vector_cosine_ops)
WITH (m = 16, ef_construction = 200);

-- Query-time tuning
SET hnsw.ef_search = 64;
```

**Trade-offs**:
- `M`: Higher = better recall, more memory
- `ef_construction`: Higher = better index quality, slower build
- `ef_search`: Higher = better recall, slower queries

### 2. Caching Layers

**L1: In-Memory (Application)**
- Model weights and configs
- TTL: Infinity (invalidate on update)

**L2: Redis (Distributed)**
- Recommendation results: `(profileId, context) → top-100`
- TTL: 5-15 minutes
- Invalidation: Profile update, rules change, model switch

**L3: Database (Precompute)**
- `CandidateSet` table: Nightly batch jobs
- Top-100 per (profileId, categorySlot)
- TTL: 24 hours

### 3. Batch Operations

**Embedding Inference**:
```python
# Bad: One-at-a-time
for product in products:
    emb = model.encode(product.image)

# Good: Batched
embeddings = model.encode_batch([p.image for p in products])
```

**Vector Search**:
```python
# Use WITH clause for batch enrichment
WITH candidates AS (
    SELECT product_id, similarity
    FROM (
        SELECT product_id,
               1 - (vector <=> $1) as similarity
        FROM embeddings
        ORDER BY vector <=> $1
        LIMIT 500
    ) sub
)
SELECT c.*, p.*
FROM candidates c
JOIN products p ON c.product_id = p.id
```

### 4. Async I/O

```python
# Parallel candidate fetching
async def generate_candidates():
    vec_task = asyncio.create_task(vector_search())
    lex_task = asyncio.create_task(lexical_search())

    vec_results, lex_results = await asyncio.gather(vec_task, lex_task)

    return merge_results(vec_results, lex_results)
```

### 5. Circuit Breaker Pattern

```python
@circuit_breaker(failure_threshold=5, timeout=30)
async def vector_search():
    # If failures exceed threshold, fallback to:
    # - Cached results
    # - Lexical-only search
    # - Curated collections
```

---

## Algorithm Evolution Roadmap

### Current (MVP)
- Hybrid retrieval (vector + lexical)
- Rule-based steering
- MMR diversification
- Explainability

### Phase 2
- Collaborative filtering (co-view/co-purchase graphs)
- Sequence models (transformer over interaction history)
- Dynamic weight learning (per-user optimization)

### Phase 3
- Contextual bandits (online weight tuning)
- Deep RL for long-term engagement
- Multi-armed bandits for A/B testing automation

### Research Directions
- Contrastive learning for embedding quality
- Causal inference for recommendation bias
- Fairness constraints (supplier diversity)
