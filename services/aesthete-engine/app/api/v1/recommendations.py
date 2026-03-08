"""
Recommendations API endpoints.
"""
import logging
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.models import (
    RecommendationRequest,
    RecommendationResponse,
    SimilarProductsRequest,
    SimilarProductsResponse,
)
from app.cache.redis_cache import RedisCache
from app.core.recommendation_service import RecommendationService
from app.db import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1", tags=["recommendations"])

# Global Redis cache (initialized in main app)
redis_cache: RedisCache = None


def set_redis_cache(cache: RedisCache):
    """Set global Redis cache instance."""
    global redis_cache
    redis_cache = cache


@router.post("/recommendations", response_model=RecommendationResponse)
async def get_recommendations(
    request: RecommendationRequest,
    session: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """
    Get personalized recommendations for a user.

    Returns top-N products ranked by hybrid scoring algorithm.
    """
    try:
        service = RecommendationService(session, redis_cache)

        result = await service.get_recommendations(
            profile_id=request.profile_id,
            context=request.context,
            filters=request.filters,
            limit=request.limit,
            include_explanations=request.include_explanations,
        )

        return result

    except ValueError as e:
        logger.error(f"Invalid request: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": {
                    "code": "REC.INPUT.INVALID",
                    "message": str(e),
                    "details": None,
                }
            },
        )
    except Exception as e:
        logger.error(f"Error getting recommendations: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": {
                    "code": "REC.INTERNAL.ERROR",
                    "message": "Internal server error",
                    "details": str(e) if logger.level == logging.DEBUG else None,
                }
            },
        )


@router.post("/similar-products", response_model=SimilarProductsResponse)
async def get_similar_products(
    request: SimilarProductsRequest,
    session: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """
    Get products similar to a reference product.

    Uses vector similarity based on product embeddings.
    """
    try:
        service = RecommendationService(session, redis_cache)

        result = await service.get_similar_products(
            product_id=request.product_id,
            limit=request.limit,
            filters=request.filters,
            include_explanations=request.include_explanations,
        )

        return result

    except ValueError as e:
        logger.error(f"Invalid request: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": {
                    "code": "REC.INPUT.INVALID",
                    "message": str(e),
                    "details": None,
                }
            },
        )
    except Exception as e:
        logger.error(f"Error getting similar products: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": {
                    "code": "REC.INTERNAL.ERROR",
                    "message": "Internal server error",
                    "details": str(e) if logger.level == logging.DEBUG else None,
                }
            },
        )
