"""
Batch processing and precompute API endpoints.
"""
import logging
from typing import List, Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1", tags=["batch"])


# Request/Response Models
class PrecomputeRequest(BaseModel):
    """Request to trigger precompute job."""

    profile_ids: Optional[List[str]] = Field(
        None, description="Specific profile IDs to precompute (or all active if None)"
    )
    categories: Optional[List[str]] = Field(
        None, description="Specific categories to precompute"
    )
    limit: int = Field(default=100, ge=1, le=500, description="Top-K to precompute")
    priority: str = Field(
        default="normal", description="Job priority: low|normal|high"
    )


class PrecomputeResponse(BaseModel):
    """Precompute job response."""

    job_id: str
    status: str
    profiles_count: int
    estimated_duration_minutes: int
    message: str


class JobStatusResponse(BaseModel):
    """Job status response."""

    job_id: str
    status: str
    progress: float
    created_at: datetime
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    result: Optional[dict]
    error: Optional[str]


@router.post("/batch/precompute", response_model=PrecomputeResponse)
async def trigger_precompute(
    request: PrecomputeRequest,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_db),
) -> PrecomputeResponse:
    """
    Trigger batch precompute of recommendations.

    Precomputes top-N recommendations for specified profiles or all active profiles.
    Results are cached for fast retrieval.
    """
    try:
        # Determine profiles to precompute
        if request.profile_ids:
            profile_ids = request.profile_ids
        else:
            # Fetch all active profiles (in production, call Style Profile service)
            profile_ids = await _get_active_profiles(session)

        # Create job
        from uuid import uuid4

        job_id = str(uuid4())

        # Estimate duration (rough estimate: 100ms per profile)
        estimated_duration = (len(profile_ids) * 100) / 60000  # minutes

        # Queue background task
        background_tasks.add_task(
            _run_precompute_job,
            job_id=job_id,
            profile_ids=profile_ids,
            categories=request.categories,
            limit=request.limit,
        )

        # Log job creation
        from sqlalchemy import text as sql_text

        query = """
            INSERT INTO outbox_events (id, type, payload, published, created_at)
            VALUES (:id, :type, :payload, false, NOW())
        """

        await session.execute(
            sql_text(query),
            {
                "id": job_id,
                "type": "batch.precompute.started",
                "payload": {
                    "profile_count": len(profile_ids),
                    "categories": request.categories,
                    "limit": request.limit,
                },
            },
        )
        await session.commit()

        return PrecomputeResponse(
            job_id=job_id,
            status="queued",
            profiles_count=len(profile_ids),
            estimated_duration_minutes=int(estimated_duration) + 1,
            message=f"Precompute job queued for {len(profile_ids)} profiles",
        )

    except Exception as e:
        logger.error(f"Error triggering precompute: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": {
                    "code": "BATCH.PRECOMPUTE.ERROR",
                    "message": "Failed to trigger precompute",
                    "details": str(e) if settings.is_development else None,
                }
            },
        )


@router.get("/batch/jobs/{job_id}", response_model=JobStatusResponse)
async def get_job_status(
    job_id: str,
    session: AsyncSession = Depends(get_db),
) -> JobStatusResponse:
    """
    Get status of a batch job.

    Returns current progress and results if completed.
    """
    try:
        # Fetch job status from database
        from sqlalchemy import text as sql_text

        query = """
            SELECT id, type, payload, published, created_at
            FROM outbox_events
            WHERE id = :job_id
            LIMIT 1
        """

        result = await session.execute(sql_text(query), {"job_id": job_id})
        row = result.fetchone()

        if not row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={
                    "error": {
                        "code": "BATCH.JOB_NOT_FOUND",
                        "message": f"Job {job_id} not found",
                        "details": None,
                    }
                },
            )

        job_id, job_type, payload, published, created_at = row

        # Determine status
        status_str = "completed" if published else "processing"

        return JobStatusResponse(
            job_id=job_id,
            status=status_str,
            progress=1.0 if published else 0.5,
            created_at=created_at,
            started_at=created_at,
            completed_at=created_at if published else None,
            result=payload if published else None,
            error=None,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting job status: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": {
                    "code": "BATCH.STATUS.ERROR",
                    "message": "Failed to get job status",
                    "details": str(e),
                }
            },
        )


async def _get_active_profiles(session: AsyncSession) -> List[str]:
    """Get list of active profile IDs."""
    # Mock implementation
    # In production, fetch from Style Profile service
    return [f"profile_{i}" for i in range(1, 11)]


async def _run_precompute_job(
    job_id: str,
    profile_ids: List[str],
    categories: Optional[List[str]],
    limit: int,
):
    """
    Run precompute job in background.

    This would typically be handled by a job queue (BullMQ, Celery, etc.)
    """
    try:
        logger.info(f"Starting precompute job {job_id} for {len(profile_ids)} profiles")

        # For each profile, compute and cache recommendations
        from app.cache.redis_cache import RedisCache
        from app.core.recommendation_service import RecommendationService

        redis_cache = RedisCache()
        await redis_cache.connect()

        # Mock session for background job
        # In production, create proper async session
        from app.db.database import get_async_session

        async for session in get_async_session():
            service = RecommendationService(session, redis_cache)

            for profile_id in profile_ids:
                try:
                    # Compute recommendations
                    context = {"slot": "precompute"}
                    if categories:
                        filters = {"category": categories}
                    else:
                        filters = None

                    await service.get_recommendations(
                        profile_id=profile_id,
                        context=context,
                        filters=filters,
                        limit=limit,
                        include_explanations=False,  # Skip for performance
                    )

                    logger.info(f"Precomputed for profile {profile_id}")

                except Exception as e:
                    logger.error(f"Error precomputing for {profile_id}: {e}")

            break  # Use first session

        await redis_cache.disconnect()

        logger.info(f"Completed precompute job {job_id}")

    except Exception as e:
        logger.error(f"Precompute job {job_id} failed: {e}", exc_info=True)
