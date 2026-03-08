"""
Tests for MMR diversification.
"""
import pytest

from app.core.diversification import ConstraintFilter, MMRDiversifier


@pytest.fixture
def diversifier():
    """Create diversifier instance."""
    return MMRDiversifier(lambda_param=0.8)


@pytest.fixture
def sample_candidates():
    """Sample scored candidates."""
    return [
        {
            "product_id": "p1",
            "score": 0.95,
            "brand": "Article",
            "primaryColor": "walnut",
            "subcategory": "sofas",
            "priceBand": "comfort",
        },
        {
            "product_id": "p2",
            "score": 0.90,
            "brand": "Article",
            "primaryColor": "walnut",
            "subcategory": "sofas",
            "priceBand": "comfort",
        },
        {
            "product_id": "p3",
            "score": 0.85,
            "brand": "West Elm",
            "primaryColor": "oak",
            "subcategory": "chairs",
            "priceBand": "luxury",
        },
        {
            "product_id": "p4",
            "score": 0.80,
            "brand": "CB2",
            "primaryColor": "gray",
            "subcategory": "tables",
            "priceBand": "comfort",
        },
        {
            "product_id": "p5",
            "score": 0.75,
            "brand": "Article",
            "primaryColor": "white",
            "subcategory": "storage",
            "priceBand": "budget",
        },
    ]


def test_diversify_basic(diversifier, sample_candidates):
    """Test basic diversification."""
    result = diversifier.diversify(sample_candidates, limit=3)

    assert len(result) == 3
    # First item should always be top scorer
    assert result[0]["product_id"] == "p1"


def test_diversify_brands(diversifier, sample_candidates):
    """Test brand diversity enforcement."""
    result = diversifier.diversify(sample_candidates, limit=5)

    brands = [r["brand"] for r in result]

    # Should have diversity in brands (max 3 per brand by default)
    brand_counts = {}
    for brand in brands:
        brand_counts[brand] = brand_counts.get(brand, 0) + 1

    # No brand should exceed max limit
    for count in brand_counts.values():
        assert count <= 3


def test_diversify_categories(diversifier, sample_candidates):
    """Test category diversity."""
    result = diversifier.diversify(sample_candidates, limit=4)

    categories = [r["subcategory"] for r in result]

    # Should have some category diversity
    unique_categories = len(set(categories))
    assert unique_categories >= 2


def test_constraint_filter_hard():
    """Test hard constraint filtering."""
    profile = {
        "blockedMaterials": ["leather"],
        "bannedVendors": ["BadVendor"],
    }

    context = {"room": "living", "strictSize": True}

    candidates = [
        {
            "product_id": "p1",
            "materials": ["walnut", "fabric"],
            "vendor": "GoodVendor",
            "isDiscontinued": False,
        },
        {
            "product_id": "p2",
            "materials": ["leather", "metal"],
            "vendor": "GoodVendor",
            "isDiscontinued": False,
        },
        {
            "product_id": "p3",
            "materials": ["oak"],
            "vendor": "BadVendor",
            "isDiscontinued": False,
        },
        {
            "product_id": "p4",
            "materials": ["walnut"],
            "vendor": "GoodVendor",
            "isDiscontinued": True,
        },
    ]

    filtered = ConstraintFilter.apply_hard_filters(candidates, profile, context)

    # Only p1 should pass all filters
    assert len(filtered) == 1
    assert filtered[0]["product_id"] == "p1"


def test_deduplication():
    """Test candidate deduplication."""
    candidates = [
        {"product_id": "p1", "score": 0.9},
        {"product_id": "p2", "score": 0.8},
        {"product_id": "p1", "score": 0.85},  # Duplicate
        {"product_id": "p3", "score": 0.7},
    ]

    deduped = ConstraintFilter.deduplicate(candidates)

    assert len(deduped) == 3
    product_ids = [c["product_id"] for c in deduped]
    assert product_ids == ["p1", "p2", "p3"]


def test_mmr_with_custom_features():
    """Test MMR with custom diversity features."""
    diversifier = MMRDiversifier(
        lambda_param=0.7, diversity_features=["brand", "color"]
    )

    candidates = [
        {
            "product_id": f"p{i}",
            "score": 1.0 - i * 0.05,
            "brand": "Brand1" if i < 3 else "Brand2",
            "color": "red" if i % 2 == 0 else "blue",
        }
        for i in range(10)
    ]

    result = diversifier.diversify(candidates, limit=6)

    assert len(result) == 6

    # Check brand diversity
    brands = [r["brand"] for r in result]
    assert len(set(brands)) >= 2


def test_empty_candidates(diversifier):
    """Test handling of empty candidate list."""
    result = diversifier.diversify([], limit=10)

    assert result == []


def test_fewer_candidates_than_limit(diversifier, sample_candidates):
    """Test when candidates fewer than limit."""
    result = diversifier.diversify(sample_candidates[:3], limit=10)

    assert len(result) == 3
