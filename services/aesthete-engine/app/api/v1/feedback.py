"""
Feedback API endpoints.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.models import FeedbackRequest, FeedbackResponse
from app.core.feedback import FeedbackProcessor
from app.db import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1", tags=["feedback"])


@router.post("/feedback", response_model=FeedbackResponse)
async def submit_feedback(
    request: FeedbackRequest,
    session: AsyncSession = Depends(get_db),
) -> FeedbackResponse:
    """
    Submit user/designer feedback on a recommendation.

    Feedback is used to improve future recommendations.
    """
    try:
        processor = FeedbackProcessor(session)

        feedback = await processor.record_feedback(
            profile_id=request.profile_id,
            product_id=request.product_id,
            action=request.interaction,
            context=request.context,
            weight=request.weight,
        )

        return FeedbackResponse(
            feedback_id=feedback.id,
            status="recorded",
            message="Feedback recorded successfully",
        )

    except ValueError as e:
        logger.error(f"Invalid feedback: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": {
                    "code": "FEEDBACK.INVALID",
                    "message": str(e),
                    "details": None,
                }
            },
        )
    except Exception as e:
        logger.error(f"Error recording feedback: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": {
                    "code": "FEEDBACK.ERROR",
                    "message": "Failed to record feedback",
                    "details": None,
                }
            },
        )
