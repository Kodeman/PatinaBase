"""
Tests for recommendation service and endpoints.
"""
import pytest
import numpy as np
from unittest.mock import AsyncMock, MagicMock, patch

from app.core.recommendation_service import RecommendationService
from app.core.scoring import HybridScorer
from app.core.rules import RuleEngine


@pytest.fixture
def mock_session():
    """Mock database session."""
    session = AsyncMock()
    return session


@pytest.fixture
def mock_redis():
    """Mock Redis cache."""
    redis = AsyncMock()
    redis.get = AsyncMock(return_value=None)
    redis.set = AsyncMock(return_value=True)
    return redis


@pytest.fixture
def sample_profile():
    """Sample user profile."""
    return {
        "id": "profile123",
        "scoreVec": list(np.random.randn(32)),
        "budgetBand": {
            "min": 500,
            "max": 3000,
            "comfortMin": 800,
            "comfortMax": 2000,
        },
        "blockedMaterials": ["leather"],
        "preferredMaterials": ["walnut", "oak"],
        "roomDimensions": {
            "living": {"width": 200, "depth": 180, "height": 96}
        },
        "styleFacets": {
            "scandinavian": 0.8,
            "mid_century": 0.6,
        },
    }


@pytest.fixture
def sample_products():
    """Sample product list."""
    return [
        {
            "product_id": "p1",
            "price": 1200,
            "brand": "Article",
            "primaryColor": "walnut",
            "subcategory": "sofas",
            "materials": ["walnut", "fabric"],
            "dimensions": {"width": 80, "depth": 35, "height": 32},
            "stockStatus": "in_stock",
            "leadTimeDays": 5,
            "viewCount": 500,
            "saveCount": 50,
            "purchaseCount": 10,
            "createdAt": "2025-09-01T00:00:00",
            "isDiscontinued": False,
            "licenseExpired": False,
            "vec_score": 0.85,
            "lex_score": 0.10,
        },
        {
            "product_id": "p2",
            "price": 2500,
            "brand": "West Elm",
            "primaryColor": "oak",
            "subcategory": "chairs",
            "materials": ["oak", "leather"],
            "dimensions": {"width": 30, "depth": 30, "height": 40},
            "stockStatus": "in_stock",
            "leadTimeDays": 10,
            "viewCount": 300,
            "saveCount": 30,
            "purchaseCount": 5,
            "createdAt": "2025-08-15T00:00:00",
            "isDiscontinued": False,
            "licenseExpired": False,
            "vec_score": 0.75,
            "lex_score": 0.15,
        },
    ]


class TestHybridScorer:
    """Test hybrid scoring logic."""

    def test_score_product(self, sample_products, sample_profile):
        """Test product scoring."""
        scorer = HybridScorer()
        product = sample_products[0]
        context = {"room": "living", "strictSize": False}

        scored = scorer.score_product(product, sample_profile, context)

        assert "score" in scored
        assert "score_breakdown" in scored
        assert scored["score"] > 0
        assert "vec_sim" in scored["score_breakdown"]
        assert "price_fit" in scored["score_breakdown"]

    def test_price_fit_in_comfort_zone(self, sample_products, sample_profile):
        """Test price fit calculation for comfort zone."""
        scorer = HybridScorer()
        product = sample_products[0]  # price 1200, in comfort zone

        price_fit = scorer._compute_price_fit(product, sample_profile)
        assert price_fit == 1.0

    def test_price_fit_outside_budget(self, sample_products, sample_profile):
        """Test price fit for product outside budget."""
        scorer = HybridScorer()
        product = {**sample_products[0], "price": 5000}  # Above max budget

        price_fit = scorer._compute_price_fit(product, sample_profile)
        assert price_fit == 0.0

    def test_size_fit_calculation(self, sample_products, sample_profile):
        """Test size fit calculation."""
        scorer = HybridScorer()
        product = sample_products[0]
        context = {"room": "living", "strictSize": False}

        size_fit = scorer._compute_size_fit(product, sample_profile, context)
        assert 0.0 <= size_fit <= 1.0

    def test_violations_blocked_materials(self, sample_products, sample_profile):
        """Test violation detection for blocked materials."""
        scorer = HybridScorer()
        product = {**sample_products[1], "materials": ["leather"]}  # Blocked
        context = {}

        violations = scorer._compute_violations(product, sample_profile, context)
        assert violations >= 1.0

    def test_score_batch(self, sample_products, sample_profile):
        """Test batch scoring."""
        scorer = HybridScorer()
        context = {"room": "living"}

        scored = scorer.score_batch(sample_products, sample_profile, context)

        assert len(scored) == len(sample_products)
        assert all("score" in p for p in scored)
        # Results should be sorted by score
        assert scored[0]["score"] >= scored[-1]["score"]


class TestRuleEngine:
    """Test rule engine."""

    @pytest.mark.asyncio
    async def test_create_rule(self, mock_session):
        """Test rule creation."""
        engine = RuleEngine(mock_session)

        rule = await engine.create_rule(
            scope="global",
            predicate={"material": {"$in": ["walnut", "oak"]}},
            effect="boost",
            weight=0.5,
            created_by="designer123",
        )

        # Verify session.add was called
        assert mock_session.add.called

    @pytest.mark.asyncio
    async def test_invalid_scope(self, mock_session):
        """Test invalid scope raises error."""
        engine = RuleEngine(mock_session)

        with pytest.raises(ValueError, match="Invalid scope"):
            await engine.create_rule(
                scope="invalid_scope",
                predicate={},
                effect="boost",
                weight=0.5,
                created_by="user123",
            )

    def test_matches_predicate_in_operator(self, sample_products):
        """Test predicate matching with $in operator."""
        engine = RuleEngine(MagicMock())
        product = sample_products[0]

        predicate = {"materials": {"$in": ["walnut"]}}
        assert engine._matches_predicate(product, predicate) is True

        predicate = {"materials": {"$in": ["maple"]}}
        assert engine._matches_predicate(product, predicate) is False

    def test_matches_predicate_comparison_operators(self, sample_products):
        """Test predicate matching with comparison operators."""
        engine = RuleEngine(MagicMock())
        product = sample_products[0]

        # Greater than
        assert engine._matches_predicate(product, {"price": {"$gt": 1000}}) is True
        assert engine._matches_predicate(product, {"price": {"$gt": 1500}}) is False

        # Less than
        assert engine._matches_predicate(product, {"price": {"$lt": 1500}}) is True
        assert engine._matches_predicate(product, {"price": {"$lt": 1000}}) is False

    @pytest.mark.asyncio
    async def test_preview_rule_impact(self, mock_session, sample_products):
        """Test rule impact preview."""
        engine = RuleEngine(mock_session)

        predicate = {"materials": {"$in": ["walnut"]}}
        impact = await engine.preview_rule_impact(
            predicate=predicate,
            effect="boost",
            weight=0.5,
            test_products=sample_products,
        )

        assert impact["total_products"] == 2
        assert impact["affected_count"] >= 0
        assert "affected_products" in impact


class TestRecommendationService:
    """Test recommendation service."""

    @pytest.mark.asyncio
    async def test_get_recommendations(self, mock_session, mock_redis, sample_profile):
        """Test getting recommendations."""
        service = RecommendationService(mock_session, mock_redis)

        # Mock the internal methods
        service._get_profile = AsyncMock(return_value=sample_profile)
        service._generate_candidates = AsyncMock(
            return_value=(
                [
                    {
                        "product_id": "p1",
                        "vec_score": 0.85,
                        "price": 1200,
                        "materials": ["walnut"],
                    }
                ],
                {"total_results": 1},
            )
        )

        result = await service.get_recommendations(
            profile_id="profile123",
            context={"room": "living"},
            limit=20,
        )

        assert "trace_id" in result
        assert "results" in result
        assert len(result["results"]) > 0

    @pytest.mark.asyncio
    async def test_get_similar_products(self, mock_session, mock_redis):
        """Test getting similar products."""
        service = RecommendationService(mock_session, mock_redis)

        # Mock vector search
        service.vector_engine.search_by_product = AsyncMock(
            return_value=[
                {"product_id": "p2", "similarity": 0.90},
                {"product_id": "p3", "similarity": 0.85},
            ]
        )

        result = await service.get_similar_products(
            product_id="p1", limit=20
        )

        assert "trace_id" in result
        assert "results" in result
        assert result["reference_product_id"] == "p1"

    def test_build_query_text(self):
        """Test query text building."""
        context = {"room": "living"}
        filters = {"category": ["sofas", "chairs"], "brand": ["Article"]}

        query = RecommendationService._build_query_text(context, filters)

        assert "living" in query
        assert "sofas" in query or "chairs" in query


@pytest.mark.asyncio
async def test_recommendation_endpoint_success(mock_session, mock_redis):
    """Test recommendation endpoint returns success."""
    from app.api.v1.recommendations import get_recommendations
    from app.api.models import RecommendationRequest

    request = RecommendationRequest(
        profile_id="profile123",
        context={"room": "living"},
        limit=20,
    )

    # Mock the service
    with patch("app.api.v1.recommendations.RecommendationService") as MockService:
        mock_service = MockService.return_value
        mock_service.get_recommendations = AsyncMock(
            return_value={
                "trace_id": "trace123",
                "results": [],
                "model": {"version": "1.0", "embeddingModel": "clip"},
            }
        )

        result = await get_recommendations(request, mock_session)

        assert "trace_id" in result
        assert result["trace_id"] == "trace123"
