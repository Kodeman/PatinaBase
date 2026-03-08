"""
Tests for hybrid scoring module.
"""
import pytest

from app.core.scoring import HybridScorer


@pytest.fixture
def scorer():
    """Create scorer instance."""
    return HybridScorer()


@pytest.fixture
def sample_product():
    """Sample product data."""
    return {
        "product_id": "p123",
        "price": 1500,
        "brand": "Article",
        "primaryColor": "walnut",
        "subcategory": "sofas",
        "priceBand": "comfort",
        "materials": ["walnut", "fabric"],
        "dimensions": {"width": 84, "depth": 36, "height": 32},
        "stockStatus": "in_stock",
        "leadTimeDays": 7,
        "viewCount": 500,
        "saveCount": 50,
        "purchaseCount": 10,
        "createdAt": "2024-01-01T00:00:00Z",
        "isDiscontinued": False,
        "licenseExpired": False,
        "vec_score": 0.85,
        "lex_score": 0.6,
    }


@pytest.fixture
def sample_profile():
    """Sample user profile."""
    return {
        "id": "user123",
        "budgetBand": {
            "min": 800,
            "max": 2500,
            "comfortMin": 1000,
            "comfortMax": 2000,
        },
        "blockedMaterials": [],
        "preferredMaterials": ["walnut", "oak"],
        "roomDimensions": {"living": {"width": 200, "depth": 180, "height": 96}},
    }


@pytest.fixture
def sample_context():
    """Sample context."""
    return {"room": "living", "slot": "feed", "strictSize": False}


def test_score_product(scorer, sample_product, sample_profile, sample_context):
    """Test single product scoring."""
    result = scorer.score_product(
        product=sample_product,
        profile=sample_profile,
        context=sample_context,
        rule_effect=0.0,
    )

    assert "score" in result
    assert "score_breakdown" in result
    assert "raw_signals" in result
    assert result["score"] > 0


def test_price_fit_perfect(scorer, sample_product, sample_profile, sample_context):
    """Test perfect price fit."""
    price_fit = scorer._compute_price_fit(sample_product, sample_profile)

    # Product price (1500) is in comfort zone (1000-2000)
    assert price_fit == 1.0


def test_price_fit_outside_budget(scorer, sample_profile, sample_context):
    """Test price outside budget."""
    expensive_product = {"price": 5000}

    price_fit = scorer._compute_price_fit(expensive_product, sample_profile)

    # Should be 0.0 since outside max budget (2500)
    assert price_fit == 0.0


def test_size_fit(scorer, sample_product, sample_profile, sample_context):
    """Test size fit computation."""
    size_fit = scorer._compute_size_fit(sample_product, sample_profile, sample_context)

    assert 0.0 <= size_fit <= 1.0


def test_popularity_score(scorer, sample_product):
    """Test popularity computation."""
    popularity = scorer._compute_popularity(sample_product)

    assert 0.0 <= popularity <= 1.0
    assert popularity > 0  # Should have some popularity with given counts


def test_violations_blocked_material(scorer, sample_profile, sample_context):
    """Test violation detection for blocked materials."""
    profile_with_block = {
        **sample_profile,
        "blockedMaterials": ["leather", "fabric"],
    }

    product_with_fabric = {"materials": ["walnut", "fabric"], "stockStatus": "in_stock"}

    violations = scorer._compute_violations(
        product_with_fabric, profile_with_block, sample_context
    )

    # Should have violation for blocked material
    assert violations >= 1.0


def test_batch_scoring(scorer, sample_product, sample_profile, sample_context):
    """Test batch product scoring."""
    products = [
        {**sample_product, "product_id": f"p{i}", "vec_score": 0.9 - i * 0.1}
        for i in range(5)
    ]

    results = scorer.score_batch(
        products=products, profile=sample_profile, context=sample_context
    )

    assert len(results) == 5
    # Should be sorted by score descending
    assert results[0]["score"] >= results[1]["score"]
    assert all("score" in r for r in results)


def test_weights_customization():
    """Test custom weight initialization."""
    custom_scorer = HybridScorer(
        w_vec=0.5,
        w_text=0.2,
        w_price=0.1,
        w_size=0.05,
        w_rules=0.1,
        w_pop=0.03,
        w_new=0.02,
        w_penalty=0.4,
    )

    weights = custom_scorer.get_weights()

    assert weights["vec"] == 0.5
    assert weights["text"] == 0.2
    assert weights["penalty"] == 0.4
