"""
Main recommendation service orchestrating the pipeline.
"""
import hashlib
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import uuid4

import numpy as np
from sqlalchemy.ext.asyncio import AsyncSession

from app.cache.redis_cache import RecommendationCache, RedisCache
from app.config import get_settings
from app.core.diversification import ConstraintFilter, MMRDiversifier
from app.core.explainability import ExplainabilityEngine
from app.core.rules import RuleEngine
from app.core.scoring import HybridScorer
from app.ml.vector_search import HybridSearchEngine, VectorSearchEngine

settings = get_settings()
logger = logging.getLogger(__name__)


class RecommendationService:
    """
    Main recommendation service implementing the full pipeline from PRD.
    """

    def __init__(
        self,
        session: AsyncSession,
        redis_cache: Optional[RedisCache] = None,
    ):
        """
        Initialize recommendation service.

        Args:
            session: Database session
            redis_cache: Optional Redis cache
        """
        self.session = session
        self.vector_engine = VectorSearchEngine(session)
        self.search_engine = HybridSearchEngine(self.vector_engine)
        self.scorer = HybridScorer()
        self.rule_engine = RuleEngine(session)
        self.diversifier = MMRDiversifier(
            lambda_param=settings.mmr_lambda,
        )
        self.explainer = ExplainabilityEngine()

        # Caching
        self.redis_cache = redis_cache
        if redis_cache:
            self.rec_cache = RecommendationCache(redis_cache)
        else:
            self.rec_cache = None

    async def get_recommendations(
        self,
        profile_id: str,
        context: Dict[str, Any],
        filters: Optional[Dict[str, Any]] = None,
        limit: int = 20,
        include_explanations: bool = True,
    ) -> Dict[str, Any]:
        """
        Get personalized recommendations.

        Args:
            profile_id: User profile ID
            context: Context information
            filters: Optional filters
            limit: Number of results
            include_explanations: Whether to include explanations

        Returns:
            Recommendations with metadata
        """
        trace_id = str(uuid4())

        # Check cache
        if self.rec_cache:
            cached = await self.rec_cache.get_recommendations(
                profile_id, context, filters
            )
            if cached:
                logger.info(f"Cache hit for profile {profile_id}")
                return {
                    "trace_id": trace_id,
                    "results": cached,
                    "from_cache": True,
                }

        # Get profile (in production, fetch from Style Profile service)
        profile = await self._get_profile(profile_id)

        # Step 1: Candidate Generation
        candidates, candidate_meta = await self._generate_candidates(
            profile, context, filters
        )

        logger.info(
            f"Generated {len(candidates)} candidates for profile {profile_id}"
        )

        # Step 2: Constraint Filtering (hard filters)
        candidates = ConstraintFilter.apply_hard_filters(
            candidates, profile, context
        )

        # Deduplicate
        candidates = ConstraintFilter.deduplicate(candidates)

        logger.info(
            f"After hard filters: {len(candidates)} candidates"
        )

        # Step 3: Rule Evaluation
        rule_effects = await self.rule_engine.evaluate_rules(
            products=candidates,
            profile_id=profile_id,
            designer_id=profile.get("designerId"),
            collection_id=context.get("collectionId"),
            category=context.get("category"),
        )

        # Remove blocked products
        candidates = [
            c for c in candidates
            if rule_effects.get(c["product_id"], 0.0) != -999.0
        ]

        logger.info(
            f"After rule filtering: {len(candidates)} candidates"
        )

        # Step 4: Scoring & Re-ranking
        scored_products = self.scorer.score_batch(
            products=candidates,
            profile=profile,
            context=context,
            rule_effects=rule_effects,
        )

        # Step 5: Diversity (MMR)
        if settings.enable_mmr_diversity and len(scored_products) > limit:
            diversified = self.diversifier.diversify(
                candidates=scored_products,
                limit=limit * 2,  # Get more for better diversity
            )
        else:
            diversified = scored_products

        # Take top N
        final_results = diversified[:limit]

        # Step 6: Explanations
        explanations = []
        if include_explanations and settings.enable_explainability:
            explanations = self.explainer.generate_batch_explanations(
                products=final_results,
                profile=profile,
                context=context,
            )

        # Build response
        results = []
        for i, product in enumerate(final_results):
            result = {
                "product_id": product["product_id"],
                "score": product["score"],
                "reasons": [
                    {
                        "type": k,
                        "facet": "",
                        "weight": v
                    }
                    for k, v in product.get("score_breakdown", {}).items()
                ],
                "source": product.get("sources", product.get("source", [])),
            }

            if include_explanations and i < len(explanations):
                result["explanation"] = explanations[i]

            results.append(result)

        # Cache results
        if self.rec_cache:
            await self.rec_cache.set_recommendations(
                profile_id,
                context,
                results,
                filters=filters,
                ttl=settings.cache_ttl_seconds,
            )

        # Build metadata
        metadata = {
            "total_candidates": candidate_meta.get("total_results", 0),
            "after_filters": len(candidates),
            "final_count": len(results),
            "model_version": "rec-1.0.0",
            "embedding_model": settings.embedding_model_name,
            "weights": self.scorer.get_weights(),
        }

        return {
            "trace_id": trace_id,
            "model": {
                "version": "rec-1.0.0",
                "embeddingModel": settings.embedding_model_name,
            },
            "rules_version": datetime.now().isoformat(),
            "results": results,
            "metadata": metadata,
        }

    async def get_similar_products(
        self,
        product_id: str,
        limit: int = 20,
        filters: Optional[Dict[str, Any]] = None,
        include_explanations: bool = False,
    ) -> Dict[str, Any]:
        """
        Get products similar to a reference product.

        Args:
            product_id: Reference product ID
            limit: Number of results
            filters: Optional filters
            include_explanations: Whether to include explanations

        Returns:
            Similar products with metadata
        """
        trace_id = str(uuid4())

        # Find similar products using vector search
        similar = await self.vector_engine.search_by_product(
            product_id=product_id,
            top_k=limit * 2,  # Get more for filtering
            exclude_self=True,
        )

        # Apply filters if provided
        if filters:
            # Simple filter implementation
            if "category" in filters:
                similar = [
                    s for s in similar
                    if s.get("category") in filters["category"]
                ]

        # Take top N
        results = similar[:limit]

        # Format results
        formatted_results = [
            {
                "product_id": r["product_id"],
                "score": r["similarity"],
                "reasons": [
                    {"type": "visual_similarity", "facet": "", "weight": r["similarity"]}
                ],
                "source": ["vec"],
            }
            for r in results
        ]

        return {
            "trace_id": trace_id,
            "reference_product_id": product_id,
            "results": formatted_results,
            "metadata": {
                "total_found": len(similar),
                "returned": len(results),
            },
        }

    async def _generate_candidates(
        self,
        profile: Dict[str, Any],
        context: Dict[str, Any],
        filters: Optional[Dict[str, Any]] = None,
    ) -> tuple[List[Dict[str, Any]], Dict[str, Any]]:
        """
        Generate candidate products using hybrid search.

        Args:
            profile: User profile
            context: Context information
            filters: Optional filters

        Returns:
            Tuple of (candidates, metadata)
        """
        # Get profile vector
        score_vec = np.array(profile.get("scoreVec", []))

        # Build query text from context and filters
        query_text = self._build_query_text(context, filters)

        # Hybrid search
        candidates, metadata = await self.search_engine.hybrid_search(
            query_vector=score_vec if len(score_vec) > 0 else None,
            query_text=query_text,
            top_k_vec=settings.vector_top_k,
            top_k_lex=settings.lexical_top_k,
            vector_weight=settings.weight_vec,
            text_weight=settings.weight_text,
        )

        # Enrich candidates with product data
        # In production, batch fetch from Catalog service
        enriched = await self._enrich_candidates(candidates)

        return enriched, metadata

    async def _get_profile(self, profile_id: str) -> Dict[str, Any]:
        """
        Get user profile.
        In production, fetch from Style Profile service.

        Args:
            profile_id: Profile ID

        Returns:
            Profile data
        """
        # Mock profile for now
        # In production: async HTTP call to Style Profile service
        return {
            "id": profile_id,
            "scoreVec": list(np.random.randn(settings.score_vec_dim)),
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
                "minimalist": 0.5,
            },
        }

    async def _enrich_candidates(
        self, candidates: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Enrich candidates with full product data.

        Args:
            candidates: Candidate products

        Returns:
            Enriched products
        """
        # In production: batch fetch from Catalog service
        # For now, add mock data
        enriched = []

        for candidate in candidates:
            enriched_product = {
                **candidate,
                # Mock data
                "price": np.random.randint(500, 3000),
                "brand": np.random.choice(["Article", "West Elm", "CB2", "Design Within Reach"]),
                "primaryColor": np.random.choice(["walnut", "oak", "white", "gray"]),
                "subcategory": np.random.choice(["sofas", "chairs", "tables", "storage"]),
                "priceBand": "comfort",
                "materials": ["walnut", "fabric"],
                "dimensions": {
                    "width": np.random.randint(60, 120),
                    "depth": np.random.randint(30, 80),
                    "height": np.random.randint(30, 60),
                },
                "stockStatus": np.random.choice(["in_stock", "in_stock", "in_stock", "out_of_stock"]),
                "leadTimeDays": np.random.randint(0, 30),
                "viewCount": np.random.randint(0, 1000),
                "saveCount": np.random.randint(0, 100),
                "purchaseCount": np.random.randint(0, 50),
                "createdAt": datetime.now().isoformat(),
                "isDiscontinued": False,
                "licenseExpired": False,
            }
            enriched.append(enriched_product)

        return enriched

    @staticmethod
    def _build_query_text(
        context: Dict[str, Any], filters: Optional[Dict[str, Any]] = None
    ) -> str:
        """Build query text from context and filters."""
        parts = []

        if context.get("room"):
            parts.append(context["room"])

        if filters:
            if "category" in filters:
                parts.extend(filters["category"])
            if "brand" in filters:
                parts.extend(filters["brand"])

        return " ".join(parts) if parts else ""
