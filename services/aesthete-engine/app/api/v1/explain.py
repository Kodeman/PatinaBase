"""
Explainability API endpoints.
"""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.models import Explanation
from app.db import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1", tags=["explainability"])


class ExplainRequest(BaseModel):
    """Request for recommendation explanation."""

    trace_id: str = Field(..., description="Trace ID from recommendation response")
    product_id: str = Field(..., description="Product ID to explain")


class ExplainResponse(BaseModel):
    """Explanation response."""

    trace_id: str
    product_id: str
    explanation: Explanation
    recommendation_context: dict


@router.get("/recommendations/{trace_id}/explain", response_model=ExplainResponse)
async def explain_recommendation(
    trace_id: str,
    product_id: str,
    session: AsyncSession = Depends(get_db),
) -> ExplainResponse:
    """
    Get detailed explanation for a specific recommendation.

    Retrieves the full provenance and reasoning for why a product
    was recommended, including all score components, rules applied,
    and constraints checked.
    """
    try:
        # Fetch recommendation log from database
        from sqlalchemy import text as sql_text

        query = """
            SELECT request, results, model, rules_version
            FROM recommendation_requests
            WHERE id = :trace_id
            LIMIT 1
        """

        result = await session.execute(sql_text(query), {"trace_id": trace_id})
        row = result.fetchone()

        if not row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={
                    "error": {
                        "code": "EXPLAIN.NOT_FOUND",
                        "message": f"Recommendation with trace_id {trace_id} not found",
                        "details": None,
                    }
                },
            )

        request_data, results_data, model_data, rules_version = row

        # Find the specific product in results
        product_result = None
        for result_item in results_data:
            if result_item.get("product_id") == product_id:
                product_result = result_item
                break

        if not product_result:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={
                    "error": {
                        "code": "EXPLAIN.PRODUCT_NOT_FOUND",
                        "message": f"Product {product_id} not found in recommendation results",
                        "details": None,
                    }
                },
            )

        # Build detailed explanation
        from app.core.explainability import ExplainabilityEngine

        explainer = ExplainabilityEngine()

        # Generate comprehensive explanation
        explanation = explainer.generate_explanation(
            product_result, request_data.get("context", {}), {}
        )

        return ExplainResponse(
            trace_id=trace_id,
            product_id=product_id,
            explanation=explanation,
            recommendation_context={
                "model": model_data,
                "rules_version": rules_version,
                "request": request_data,
            },
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error explaining recommendation: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": {
                    "code": "EXPLAIN.ERROR",
                    "message": "Failed to generate explanation",
                    "details": str(e),
                }
            },
        )


@router.post("/explain/preview", response_model=ExplainResponse)
async def preview_explanation(
    request: ExplainRequest,
    session: AsyncSession = Depends(get_db),
) -> dict:
    """
    Preview explanation for a product without requiring a trace_id.

    Useful for debugging or admin tools.
    """
    try:
        # Mock explanation for preview
        from app.core.explainability import ExplainabilityEngine

        explainer = ExplainabilityEngine()

        # Fetch product data
        from sqlalchemy import text as sql_text

        query = """
            SELECT product_id, vector
            FROM embeddings
            WHERE product_id = :product_id
            LIMIT 1
        """

        result = await session.execute(
            sql_text(query), {"product_id": request.product_id}
        )
        row = result.fetchone()

        if not row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={
                    "error": {
                        "code": "EXPLAIN.PRODUCT_NOT_FOUND",
                        "message": f"Product {request.product_id} not found",
                        "details": None,
                    }
                },
            )

        # Generate mock explanation
        mock_product = {
            "product_id": request.product_id,
            "score": 0.85,
            "score_breakdown": {
                "vec_sim": 0.40,
                "text_rel": 0.08,
                "price_fit": 0.10,
                "size_fit": 0.09,
                "rule_boost": 0.12,
                "popularity": 0.04,
                "freshness": 0.04,
                "penalties": -0.02,
            },
        }

        explanation = explainer.generate_explanation(mock_product, {}, {})

        return {
            "trace_id": "preview",
            "product_id": request.product_id,
            "explanation": explanation,
            "note": "This is a preview explanation based on current product state",
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error previewing explanation: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": {
                    "code": "EXPLAIN.PREVIEW.ERROR",
                    "message": "Failed to generate preview",
                    "details": str(e),
                }
            },
        )
