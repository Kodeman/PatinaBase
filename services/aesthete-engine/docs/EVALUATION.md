# Evaluation Metrics & Testing Strategy

**Comprehensive Quality Assessment for Aesthete Engine**

## Table of Contents

1. [Offline Metrics](#offline-metrics)
2. [Online Metrics](#online-metrics)
3. [Quality Assurance](#quality-assurance)
4. [A/B Testing Framework](#ab-testing-framework)
5. [Monitoring & Alerts](#monitoring--alerts)

---

## Offline Metrics

**Frequency**: Weekly evaluation on historical data

### 1. Ranking Quality

#### NDCG@K (Normalized Discounted Cumulative Gain)

**Purpose**: Measure ranking quality with position-based discounting

**Formula**:
```
NDCG@K = DCG@K / IDCG@K

where:
  DCG@K = Σ(i=1 to K) [rel_i / log2(i + 1)]
  IDCG@K = DCG@K for perfect ranking
  rel_i = relevance score at position i
```

**Relevance Labels**:
- Purchased/Added to Cart: `rel = 3`
- Saved/Favorited: `rel = 2`
- Clicked/Viewed: `rel = 1`
- Rejected by Designer: `rel = -1`
- No interaction: `rel = 0`

**Target**: NDCG@10 ≥ 0.65, NDCG@20 ≥ 0.70

**Implementation**:
```python
from sklearn.metrics import ndcg_score

def evaluate_ndcg(recommendations, ground_truth, k=10):
    """
    Args:
        recommendations: List of (product_id, score) tuples
        ground_truth: Dict of product_id -> relevance label
        k: Cutoff position
    """
    # Get top-k
    top_k = recommendations[:k]

    # Build relevance array
    relevances = [ground_truth.get(pid, 0) for pid, _ in top_k]

    # Compute NDCG
    ndcg = ndcg_score([relevances], [range(k, 0, -1)])

    return ndcg
```

#### MRR (Mean Reciprocal Rank)

**Purpose**: Measure rank of first relevant item

**Formula**:
```
MRR = (1/|Q|) × Σ(q=1 to |Q|) [1 / rank_q]

where rank_q is position of first relevant item for query q
```

**Target**: MRR ≥ 0.50

**Implementation**:
```python
def compute_mrr(recommendations, ground_truth):
    """Find position of first relevant item."""
    for rank, (pid, score) in enumerate(recommendations, start=1):
        if ground_truth.get(pid, 0) > 0:
            return 1.0 / rank
    return 0.0
```

#### Precision@K & Recall@K

**Precision@K**: Fraction of relevant items in top-K
```
P@K = |{relevant items} ∩ {top-K items}| / K
```

**Recall@K**: Fraction of all relevant items found in top-K
```
R@K = |{relevant items} ∩ {top-K items}| / |{all relevant items}|
```

**Target**: P@10 ≥ 0.40, R@20 ≥ 0.60

### 2. Coverage & Diversity

#### Catalog Coverage

**Purpose**: Ensure recommendations aren't limited to subset of catalog

**Formula**:
```
Coverage = |{unique products recommended}| / |{total catalog}|
```

**Breakdown**:
- Overall coverage
- Per-category coverage
- Per-brand coverage
- Per-price-band coverage

**Target**:
- Overall ≥ 60% over 30 days
- Per-category ≥ 40%

#### Diversity Metrics

**Intra-List Diversity (ILD)**:
```python
def intra_list_diversity(recommendations):
    """Average pairwise distance within list."""
    distances = []

    for i in range(len(recommendations)):
        for j in range(i+1, len(recommendations)):
            # Compute similarity (inverse of diversity)
            sim = cosine_similarity(
                recommendations[i].embedding,
                recommendations[j].embedding
            )
            distances.append(1 - sim)

    return np.mean(distances)
```

**Target**: ILD ≥ 0.40

**Feature Entropy**:
```python
def feature_entropy(recommendations, feature='brand'):
    """Measure diversity via entropy."""
    from scipy.stats import entropy

    # Count feature values
    value_counts = Counter(r[feature] for r in recommendations)
    probabilities = [count/len(recommendations)
                    for count in value_counts.values()]

    return entropy(probabilities, base=2)
```

**Target**: Brand entropy ≥ 1.5, Category entropy ≥ 1.2

#### Serendipity

**Purpose**: Measure unexpected but relevant recommendations

**Formula**:
```
Serendipity = Σ relevance(i) × unexpectedness(i) / |recommendations|

where:
  unexpectedness(i) = 1 - similarity(i, user_history)
```

**Implementation**:
```python
def serendipity_score(recommendations, user_history, ground_truth):
    serendipity = 0

    for item in recommendations:
        relevance = ground_truth.get(item.id, 0)

        # Compute distance to user history
        if user_history:
            max_sim = max(
                cosine_similarity(item.embedding, hist.embedding)
                for hist in user_history
            )
            unexpectedness = 1 - max_sim
        else:
            unexpectedness = 1.0

        serendipity += relevance * unexpectedness

    return serendipity / len(recommendations)
```

**Target**: Serendipity ≥ 0.50

### 3. Fairness & Bias

#### Supplier Fairness

**Measure**: Distribution of recommendations across suppliers

```python
def supplier_fairness(recommendations):
    """Gini coefficient for supplier distribution."""
    supplier_counts = Counter(r.supplier for r in recommendations)

    # Gini coefficient (0 = perfect equality, 1 = perfect inequality)
    values = sorted(supplier_counts.values())
    n = len(values)
    index = np.arange(1, n + 1)

    gini = ((2 * np.sum(index * values)) / (n * np.sum(values))) - ((n + 1) / n)

    return gini
```

**Target**: Gini ≤ 0.60

#### Demographic Parity (Safety Check)

**Ensure**: No correlation between recommendations and sensitive attributes

```python
def check_demographic_parity(recommendations_by_group):
    """Compare recommendation distributions across demographic groups."""
    # Should NOT differ significantly
    # Use Chi-square test or KL divergence

    distributions = []
    for group, recs in recommendations_by_group.items():
        dist = Counter(r.category for r in recs)
        distributions.append(dist)

    # Chi-square test
    from scipy.stats import chi2_contingency

    contingency_table = # ... build from distributions
    chi2, p_value, dof, expected = chi2_contingency(contingency_table)

    # p_value > 0.05 indicates no significant difference (good)
    return p_value
```

**Target**: p-value > 0.05 (no significant difference across demographics)

---

## Online Metrics

**Frequency**: Real-time tracking with daily dashboards

### 1. Engagement Metrics

#### Click-Through Rate (CTR@K)

**Formula**:
```
CTR@K = (Number of clicks on top-K) / (Number of impressions)
```

**Tracked at**: K ∈ {1, 3, 5, 10, 20}

**Target**: CTR@10 ≥ 8%, CTR@20 ≥ 12%

#### Save/Add-to-Cart Rate

**Formula**:
```
Save Rate = (Number of saves) / (Number of impressions)
ATC Rate = (Number of add-to-cart) / (Number of impressions)
```

**Target**:
- Save Rate ≥ 3%
- ATC Rate ≥ 1.5%

#### Designer Override Rate

**Formula**:
```
Override Rate = (Designer rejects/replacements) / (Total recommendations)
```

**Target**: Override Rate ≤ 20% (lower is better)

**Breakdown**:
- Reject: Designer explicitly rejects recommendation
- Replace: Designer swaps with alternative
- Modify: Designer adjusts product details

### 2. Business Metrics

#### Conversion Lift

**Baseline**: Cold start recommendations (no personalization)

**Formula**:
```
Conversion Lift = (Conversion_personalized - Conversion_baseline) / Conversion_baseline × 100%
```

**Target**: ≥ 15% lift over baseline

#### Time-to-Selection

**Measure**: Time from recommendation display to designer selection

**Formula**:
```
Avg Time-to-Selection = Σ (selection_time - display_time) / Number of selections
```

**Target**: ≤ 30 seconds (indicates confident recommendations)

#### Proposal Completion Rate

**Formula**:
```
Completion Rate = (Proposals with ≥ 5 items from recs) / (Total proposals)
```

**Target**: ≥ 40%

### 3. System Performance

#### Latency

**Percentiles**: p50, p95, p99

**Targets**:
- p50 ≤ 150ms
- p95 ≤ 250ms
- p99 ≤ 500ms

**Breakdown**:
- Candidate generation: p95 ≤ 100ms
- Vector search: p95 ≤ 50ms
- Scoring: p95 ≤ 50ms
- MMR diversification: p95 ≤ 30ms

#### Cache Hit Rate

**Formula**:
```
Cache Hit Rate = (Cache hits) / (Total requests) × 100%
```

**Target**: ≥ 40% for hot profiles

#### Error Rate

**Formula**:
```
Error Rate = (Failed requests) / (Total requests) × 100%
```

**Target**: ≤ 0.1%

### 4. Data Quality

#### Embedding Freshness

**Measure**: Age of product embeddings

**Formula**:
```
Avg Embedding Age = Σ (now - embedding.created_at) / Number of embeddings
```

**Target**: ≤ 7 days

#### Out-of-Stock Ratio in Top-N

**Formula**:
```
OOS Ratio = (Out-of-stock items in top-N) / N
```

**Target**: ≤ 10%

#### Rule Hit Rate

**Formula**:
```
Rule Hit Rate = (Recommendations affected by rules) / (Total recommendations)
```

**Target**: 20-40% (indicates active rule usage)

---

## Quality Assurance

### 1. Golden Test Sets

**Purpose**: Regression testing across releases

**Structure**:
```python
GOLDEN_TESTS = [
    {
        'profile_id': 'test_001',
        'context': {'room': 'living', 'slot': 'feed'},
        'expected_top_5': ['p1', 'p2', 'p3', 'p4', 'p5'],
        'min_score': 0.80,
        'diversity_threshold': 0.40
    },
    # ... 100+ test cases
]
```

**Validation**:
```python
def validate_golden_test(test_case, actual_results):
    """Ensure recommendations meet quality bar."""
    # 1. Top-5 overlap
    expected = set(test_case['expected_top_5'])
    actual = set(r['product_id'] for r in actual_results[:5])
    overlap = len(expected & actual) / len(expected)

    assert overlap >= 0.60, f"Top-5 overlap too low: {overlap}"

    # 2. Score threshold
    assert actual_results[0]['score'] >= test_case['min_score']

    # 3. Diversity
    diversity = intra_list_diversity(actual_results)
    assert diversity >= test_case['diversity_threshold']
```

### 2. Synthetic Evaluations

**Profile Archetypes**:
```python
ARCHETYPES = {
    'minimalist': {
        'styleFacets': {'minimalist': 0.9, 'scandinavian': 0.7},
        'budgetBand': {'min': 500, 'max': 2000}
    },
    'luxury': {
        'styleFacets': {'contemporary': 0.8, 'luxury': 0.9},
        'budgetBand': {'min': 3000, 'max': 10000}
    },
    'eclectic': {
        'styleFacets': {'bohemian': 0.8, 'eclectic': 0.9, 'vintage': 0.6},
        'budgetBand': {'min': 500, 'max': 3000}
    }
}
```

**Expected Behaviors**:
- Minimalist → Clean lines, neutral colors, simple forms
- Luxury → High-end brands, premium materials, designer pieces
- Eclectic → Diverse styles, unique pieces, bold colors

### 3. Expert Reviews

**Weekly**: ML team + designers review sample recommendations

**Rubric** (1-5 scale):
- **Relevance**: Does it match the style profile?
- **Practicality**: Does it fit constraints (budget, size)?
- **Diversity**: Are results varied and interesting?
- **Explainability**: Are explanations clear and accurate?

**Target**: Average score ≥ 4.0

---

## A/B Testing Framework

### 1. Experiment Design

**Randomization**: Hash-based user assignment

```python
def get_experiment_variant(user_id: str, experiment_id: str) -> str:
    """Deterministic variant assignment."""
    hash_val = int(hashlib.md5(f"{experiment_id}:{user_id}".encode()).hexdigest(), 16)
    assignment = (hash_val % 1000) / 1000.0

    if assignment < 0.5:
        return "control"
    else:
        return "treatment"
```

**Minimum Sample Size**:
```python
def calculate_sample_size(baseline_rate, mde, alpha=0.05, power=0.80):
    """
    Calculate required sample size.

    Args:
        baseline_rate: Baseline conversion rate (e.g., 0.10)
        mde: Minimum detectable effect (e.g., 0.15 for 15% lift)
        alpha: Significance level
        power: Statistical power
    """
    from statsmodels.stats.power import zt_ind_solve_power

    effect_size = (baseline_rate * (1 + mde) - baseline_rate) / np.sqrt(baseline_rate * (1 - baseline_rate))

    n = zt_ind_solve_power(effect_size=effect_size, alpha=alpha, power=power)

    return int(np.ceil(n))
```

### 2. Experiment Types

#### Weight Tuning
```json
{
  "experiment": "weight_optimization_v1",
  "control": {
    "w_vec": 0.45,
    "w_rules": 0.15
  },
  "treatment": {
    "w_vec": 0.50,
    "w_rules": 0.20
  },
  "duration": "14 days",
  "success_metric": "CTR@10"
}
```

#### MMR Lambda
```json
{
  "experiment": "mmr_lambda_test",
  "control": {"lambda": 0.8},
  "treatment": {"lambda": 0.9},
  "success_metric": "diversity + engagement"
}
```

#### Model Comparison
```json
{
  "experiment": "embedding_model_v2",
  "control": {"model": "clip-vit-b-32"},
  "treatment": {"model": "clip-vit-l-14"},
  "success_metric": "NDCG@10"
}
```

### 3. Statistical Analysis

**Test**: Two-sample t-test or Chi-square (depending on metric)

```python
def analyze_ab_test(control_data, treatment_data, metric='conversion'):
    """Statistical significance testing."""
    from scipy.stats import ttest_ind, chi2_contingency

    if metric in ['ctr', 'conversion', 'save_rate']:
        # Proportion test
        control_successes = sum(control_data)
        treatment_successes = sum(treatment_data)

        contingency = [
            [control_successes, len(control_data) - control_successes],
            [treatment_successes, len(treatment_data) - treatment_successes]
        ]

        chi2, p_value, dof, expected = chi2_contingency(contingency)

        lift = (treatment_successes/len(treatment_data) - control_successes/len(control_data)) / (control_successes/len(control_data))

    else:
        # Continuous metric (e.g., latency, score)
        t_stat, p_value = ttest_ind(treatment_data, control_data)

        lift = (np.mean(treatment_data) - np.mean(control_data)) / np.mean(control_data)

    return {
        'p_value': p_value,
        'significant': p_value < 0.05,
        'lift': lift,
        'control_mean': np.mean(control_data),
        'treatment_mean': np.mean(treatment_data)
    }
```

### 4. Decision Framework

**Rollout Criteria**:
1. ✅ p-value < 0.05 (statistically significant)
2. ✅ Lift ≥ MDE (minimum detectable effect)
3. ✅ No degradation in secondary metrics
4. ✅ No increase in error rate or latency

**Rollback Criteria**:
1. ❌ Error rate > 1%
2. ❌ p95 latency > 500ms
3. ❌ Negative feedback from designers
4. ❌ System instability

---

## Monitoring & Alerts

### 1. SLO Dashboards

**Grafana Dashboard Structure**:
```yaml
dashboards:
  - name: "Aesthete Engine - SLOs"
    panels:
      - title: "Latency (p95)"
        query: "histogram_quantile(0.95, rec_request_duration_seconds)"
        threshold: 250ms
        alert: true

      - title: "Error Rate"
        query: "rate(rec_errors_total[5m])"
        threshold: 0.1%
        alert: true

      - title: "Cache Hit Rate"
        query: "rec_cache_hits / rec_cache_requests"
        threshold: 40%

      - title: "CTR@10"
        query: "rec_clicks_top10 / rec_impressions"
        threshold: 8%
```

### 2. Alert Rules

#### Critical (PagerDuty)
```yaml
alerts:
  - name: "High Error Rate"
    condition: "error_rate > 1% for 5 minutes"
    severity: critical

  - name: "SLO Breach - Latency"
    condition: "p95_latency > 500ms for 10 minutes"
    severity: critical

  - name: "Service Down"
    condition: "up == 0 for 2 minutes"
    severity: critical
```

#### Warning (Slack)
```yaml
alerts:
  - name: "Elevated Latency"
    condition: "p95_latency > 250ms for 15 minutes"
    severity: warning

  - name: "Low Cache Hit Rate"
    condition: "cache_hit_rate < 30% for 30 minutes"
    severity: warning

  - name: "High Override Rate"
    condition: "override_rate > 30% for 1 hour"
    severity: warning
```

### 3. Drift Detection

**Embedding Distribution Drift**:
```python
from scipy.stats import ks_2samp

def detect_embedding_drift(current_embeddings, baseline_embeddings):
    """Kolmogorov-Smirnov test for distribution shift."""
    # Test each dimension
    drift_scores = []

    for dim in range(current_embeddings.shape[1]):
        statistic, p_value = ks_2samp(
            current_embeddings[:, dim],
            baseline_embeddings[:, dim]
        )
        drift_scores.append(p_value)

    # Alert if significant drift in >10% of dimensions
    drift_ratio = sum(p < 0.01 for p in drift_scores) / len(drift_scores)

    if drift_ratio > 0.10:
        alert("Embedding drift detected", {"ratio": drift_ratio})
```

**Performance Degradation**:
```python
def detect_performance_degradation(current_metrics, baseline_metrics, window='7d'):
    """Compare current vs baseline metrics."""
    degradations = []

    for metric, threshold in METRIC_THRESHOLDS.items():
        current = current_metrics[metric]
        baseline = baseline_metrics[metric]

        if metric in ['error_rate', 'latency']:
            # Lower is better
            if current > baseline * (1 + threshold):
                degradations.append(metric)
        else:
            # Higher is better (CTR, conversion, etc.)
            if current < baseline * (1 - threshold):
                degradations.append(metric)

    if degradations:
        alert("Performance degradation", {"metrics": degradations})
```

---

## Evaluation Cadence

### Daily
- Online metrics (CTR, conversion, latency)
- Error rates and system health
- Cache performance

### Weekly
- Offline metrics (NDCG, diversity, coverage)
- Golden test validation
- Expert reviews (sample)

### Monthly
- Comprehensive model evaluation
- A/B test analysis and rollout decisions
- Drift analysis
- Fairness audits

### Quarterly
- Algorithm roadmap review
- External benchmark comparison
- Research paper review and integration
