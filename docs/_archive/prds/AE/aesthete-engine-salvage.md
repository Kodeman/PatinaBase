# Aesthete Engine — salvage notes from the legacy service

**Source:** `services/aesthete-engine/` (71 files, built Dec 2025, never deployed), deleted in Wave 0C per design §16 (git history is the archive — this doc pins the ideas we keep, verbatim, with provenance).
**Deleted at:** the Wave 0C commit immediately following this one.
**What replaces what:** design doc `docs/prds/AE/aesthete-engine-system-design.md` §10.3 (scoring + MMR), §10.6 (why payload), §10.7 (frozen contracts), §16 (reconciliation table).

---

## (a) Scoring weights + retrieval constants

From `services/aesthete-engine/app/config.py:51-87`:

```python
    # Model Configuration
    embedding_model_name: str = Field(default="clip-vit-b-32")
    embedding_dim: int = Field(default=768)
    score_vec_dim: int = Field(default=32)
    alpha_img_text: float = Field(default=0.6, ge=0.0, le=1.0)

    # Scoring Weights
    weight_vec: float = Field(default=0.45)
    weight_text: float = Field(default=0.10)
    weight_price: float = Field(default=0.10)
    weight_size: float = Field(default=0.10)
    weight_rules: float = Field(default=0.15)
    weight_pop: float = Field(default=0.05)
    weight_new: float = Field(default=0.05)
    weight_penalty: float = Field(default=0.30)

    # Performance
    vector_top_k: int = Field(default=500)
    lexical_top_k: int = Field(default=300)
    default_limit: int = Field(default=20)
    cache_ttl_seconds: int = Field(default=600)
    batch_size: int = Field(default=32)

    # Observability
    otlp_endpoint: str = Field(default="http://localhost:4318")
    enable_tracing: bool = Field(default=True)
    enable_metrics: bool = Field(default=True)

    # Feature Flags
    enable_mmr_diversity: bool = Field(default=True)
    mmr_lambda: float = Field(default=0.8, ge=0.0, le=1.0)
    enable_precompute: bool = Field(default=True)
    enable_explainability: bool = Field(default=True)

    # Rate Limiting
    rate_limit_recommendations: int = Field(default=30)
    rate_limit_feedback: int = Field(default=120)
```

The combined score (`app/core/scoring.py:99-109`):

```python
        # Combined score
        total_score = (
            self.w_vec * sim_score
            + self.w_text * lex_score
            + self.w_price * price_fit
            + self.w_size * size_fit
            + self.w_rules * rule_effect
            + self.w_pop * popularity
            + self.w_new * freshness
            - self.w_penalty * violations
        )
```

**Lands in:** `match_weight_profiles` v1 seed. The 8-signal priors map to the new 10-term weights per the lineage column in design §10.3 (vec .45 → style_dense .30 split three ways; rules .15 → taste .12; price .10 → budget .10; size .10 → context .05; pop .05 → behavioral .05; new .05 → patina .05; penalty .30 → P −.30 unchanged). `vector_top_k=500` is the ANN candidate-pool prior for §10.2; `mmr_lambda=0.8` carries into (b) below.

---

## (b) The MMR diversifier — λ + per-feature caps

From `services/aesthete-engine/app/core/diversification.py:16-43` (constructor defaults):

```python
    def __init__(
        self,
        lambda_param: float = 0.8,
        diversity_features: List[str] = None,
        max_per_feature: Dict[str, int] = None,
    ):
        """
        Initialize MMR diversifier.

        Args:
            lambda_param: Balance between relevance and diversity (0-1)
                         Higher = more relevance, Lower = more diversity
            diversity_features: Features to diversify on
            max_per_feature: Maximum items per feature value
        """
        self.lambda_param = lambda_param
        self.diversity_features = diversity_features or [
            "brand",
            "primaryColor",
            "subcategory",
            "priceBand",
        ]
        self.max_per_feature = max_per_feature or {
            "brand": 3,
            "subcategory": 4,
            "primaryColor": 5,
            "priceBand": 6,
        }
```

The MMR selection score (`diversification.py:99-103`):

```python
                # MMR score
                mmr_score = (
                    self.lambda_param * relevance_score
                    + (1 - self.lambda_param) * diversity_score
                )
```

Diversity blends feature dissimilarity with embedding dissimilarity when vectors exist (`diversification.py:187-194`):

```python
        # Embedding-based diversity (if available)
        if embeddings and candidate["product_id"] in embeddings:
            embedding_diversity = self._embedding_diversity(
                candidate, selected, embeddings
            )
            # Combine both
            return 0.6 * feature_diversity + 0.4 * embedding_diversity

        return feature_diversity
```

with embedding diversity = `1.0 - max_similarity` over the already-selected set (`diversification.py:260-262`). Selection is greedy: the top-scored item is always taken first, then iterate under the per-feature caps (`diversify()`, lines 45–118).

**Lands in:** design §10.3 diversification — "salvaged MMR (λ = 0.8; caps ≤ 3/brand, ≤ 5/dominant-color) before slotting." The subcategory/priceBand caps are dropped in v1 (category is a filter, budget a scored term); revisit if result sets read monotone.

---

## (c) Rule predicate jsonb schema + scope precedence

The persisted shape, from `services/aesthete-engine/prisma/schema.prisma:18-39`:

```prisma
model Rule {
  id         String   @id @default(uuid())
  scope      String   // user|designer|collection|category|global
  scopeId    String?  // ID of user, designer, collection, or category
  name       String
  description String? @db.Text
  predicate  Json     // Rule conditions (product attributes, tags, etc.)
  effect     String   // boost|bury|block
  weight     Float    @default(1.0)
  status     String   @default("draft") // draft|in_review|staging|production|archived
  version    Int      @default(1)
  createdBy  String
  updatedBy  String?
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  activatedAt DateTime?

  @@index([scope, scopeId])
  @@index([status])
  @@index([createdBy])
  @@map("rules")
}
```

Effects, scopes, and precedence, from `app/core/rules.py:21-25`:

```python
    VALID_EFFECTS = {"boost", "bury", "block"}
    VALID_SCOPES = {"global", "designer", "user", "collection", "category"}

    # Priority order (higher index = higher priority)
    SCOPE_PRIORITY = ["global", "category", "collection", "designer", "user"]
```

Predicate operator vocabulary (mongo-style, evaluated key-by-key with AND semantics; scope-identifier keys `userId`/`designerId`/`collectionId`/`category` are skipped), from `app/core/rules.py:193-219`:

```python
            if isinstance(condition, dict):
                # Handle operators
                if "$in" in condition:
                    if product_value not in condition["$in"]:
                        return False
                elif "$eq" in condition:
                    if product_value != condition["$eq"]:
                        return False
                elif "$ne" in condition:
                    if product_value == condition["$ne"]:
                        return False
                elif "$gt" in condition:
                    if product_value <= condition["$gt"]:
                        return False
                elif "$lt" in condition:
                    if product_value >= condition["$lt"]:
                        return False
                elif "$gte" in condition:
                    if product_value < condition["$gte"]:
                        return False
                elif "$lte" in condition:
                    if product_value > condition["$lte"]:
                        return False
            else:
                # Direct equality
                if product_value != condition:
                    return False
```

Effect application semantics (`app/core/rules.py:156-168`): `block` overrides everything (sentinel `-999.0`, product removed), `boost` adds `+weight`, `bury` adds `-weight`, cumulative effects clamped to `[-1.0, 1.0]`. Rule weights are validated to `-1.0 <= weight <= 1.0` at creation (`rules.py:256-257`). Predicates may never key on sensitive attributes — blacklist at `rules.py:343-352`: `userId, userName, email, location, demographics, ethnicity, religion, political`.

**Lands in:** `taste_rules` — soft `boost`/`bury` as ±magnitude on S, scope priority collapsed to global < category < style (design §10.3); the jsonb operator vocabulary and the sensitive-attribute blacklist carry as-is. `block` becomes a hard pre-filter, not a score term. The draft→production `status` ladder is dropped (rules are designer-authored, active-on-create).

---

## (d) The `score_breakdown` / `raw_signals` response shape

From `services/aesthete-engine/app/core/scoring.py:111-134` (the return of `score_product`):

```python
        return {
            **product,
            "score": total_score,
            "score_breakdown": {
                "vec_sim": sim_score * self.w_vec,
                "text_rel": lex_score * self.w_text,
                "price_fit": price_fit * self.w_price,
                "size_fit": size_fit * self.w_size,
                "rule_boost": rule_effect * self.w_rules,
                "popularity": popularity * self.w_pop,
                "freshness": freshness * self.w_new,
                "penalties": violations * self.w_penalty,
            },
            "raw_signals": {
                "vec_sim": sim_score,
                "lex_score": lex_score,
                "price_fit": price_fit,
                "size_fit": size_fit,
                "rule_effect": rule_effect,
                "popularity": popularity,
                "freshness": freshness,
                "violations": violations,
            },
        }
```

The two-layer idea — **weighted contributions** (`score_breakdown`) for explanation alongside **unweighted signals** (`raw_signals`) for audit/replay — is the load-bearing salvage.

**Lands in:** the why payload (design §10.6): `terms` = the weighted contributions (renamed to the new 10-term vocabulary), `top_reasons[].contribution` sourced from them, and full per-term contributions persisted to `match_events` for audit — the `raw_signals` role. Computed in the same query that scores; there is no unexplained score path.

---

## (e) The room-size utilization curve

From `services/aesthete-engine/app/core/scoring.py:253-271` (inside `_compute_size_fit`):

```python
        # Compute utilization score (prefer reasonable space usage)
        width_ratio = product_width / room_width if room_width > 0 else 0
        depth_ratio = product_depth / room_depth if room_depth > 0 else 0

        # Optimal utilization is 30-60% of room dimension
        def utilization_score(ratio):
            if ratio < 0.2:
                return 0.5  # Too small
            elif ratio < 0.3:
                return 0.7 + (ratio - 0.2) * 3  # Ramp up
            elif ratio < 0.6:
                return 1.0  # Optimal
            elif ratio < 0.8:
                return 1.0 - (ratio - 0.6) * 2  # Ramp down
            else:
                return 0.3  # Too large

        return (utilization_score(width_ratio) + utilization_score(depth_ratio)) / 2
```

Surrounding semantics kept for context (`scoring.py:224-252`): no room in context → size fit `1.0` (no constraint); unknown dimensions on either side → `0.5`; under `strictSize`, any dimension exceeding the room returns `0.0` (hard fail — in the new design this is the penalty/pre-filter path, not the curve).

**Lands in:** `T_context` (design §10.3, weight .05): "room known: utilization curve (optimal 30–60% of room dimension, salvaged from the old scorer); else 0.5."

---

## Explicitly NOT salvaged (dies with the service)

Per design §16: the CLIP 512/768 dim bug, mock profiles, stubbed OpenSearch integration, MLflow tracking, the docker-compose stack, Redis-side precompute, and every `*_SUMMARY.md`/checklist doc in the service root. `weight_text` (lexical top-k fusion) has no successor term — keyword entry is the `aesthete_search` Typesense seam, not a score term.
