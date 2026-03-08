"""
Rules management API endpoints.
"""
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.models import RuleRequest, RuleResponse, RuleUpdateRequest
from app.core.rules import RuleEngine
from app.db import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1", tags=["rules"])


@router.post("/rules", response_model=RuleResponse, status_code=status.HTTP_201_CREATED)
async def create_rule(
    request: RuleRequest,
    session: AsyncSession = Depends(get_db),
) -> RuleResponse:
    """
    Create a new recommendation rule.

    Rules can boost, bury, or block products based on predicates.
    """
    try:
        engine = RuleEngine(session)

        rule = await engine.create_rule(
            scope=request.scope,
            predicate=request.predicate,
            effect=request.effect,
            weight=request.weight,
            created_by=request.created_by,
            start_at=request.start_at,
            end_at=request.end_at,
        )

        return RuleResponse(
            id=rule.id,
            scope=rule.scope,
            predicate=rule.predicate,
            effect=rule.effect,
            weight=rule.weight,
            active=rule.active,
            start_at=rule.start_at,
            end_at=rule.end_at,
            created_by=rule.created_by,
            created_at=rule.created_at,
        )

    except ValueError as e:
        logger.error(f"Invalid rule: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": {
                    "code": "RULE.INVALID",
                    "message": str(e),
                    "details": None,
                }
            },
        )
    except Exception as e:
        logger.error(f"Error creating rule: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": {
                    "code": "RULE.ERROR",
                    "message": "Failed to create rule",
                    "details": None,
                }
            },
        )


@router.patch("/rules/{rule_id}", response_model=RuleResponse)
async def update_rule(
    rule_id: str,
    request: RuleUpdateRequest,
    session: AsyncSession = Depends(get_db),
) -> RuleResponse:
    """Update an existing rule."""
    try:
        engine = RuleEngine(session)

        updates = {}
        if request.active is not None:
            updates["active"] = request.active
        if request.weight is not None:
            updates["weight"] = request.weight
        if request.end_at is not None:
            updates["end_at"] = request.end_at

        rule = await engine.update_rule(rule_id, updates)

        if not rule:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={
                    "error": {
                        "code": "RULE.NOT_FOUND",
                        "message": f"Rule {rule_id} not found",
                        "details": None,
                    }
                },
            )

        return RuleResponse(
            id=rule.id,
            scope=rule.scope,
            predicate=rule.predicate,
            effect=rule.effect,
            weight=rule.weight,
            active=rule.active,
            start_at=rule.start_at,
            end_at=rule.end_at,
            created_by=rule.created_by,
            created_at=rule.created_at,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating rule: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": {
                    "code": "RULE.ERROR",
                    "message": "Failed to update rule",
                    "details": None,
                }
            },
        )


@router.get("/rules", response_model=List[RuleResponse])
async def list_rules(
    scope: Optional[str] = Query(None, description="Filter by scope (e.g., 'designer:123')"),
    active: Optional[bool] = Query(None, description="Filter by active status"),
    session: AsyncSession = Depends(get_db),
) -> List[RuleResponse]:
    """List rules with optional filters."""
    try:
        engine = RuleEngine(session)

        # Parse scope filter
        profile_id = None
        designer_id = None
        collection_id = None
        category = None

        if scope:
            if scope.startswith("designer:"):
                designer_id = scope.split(":")[1]
            elif scope.startswith("user:"):
                profile_id = scope.split(":")[1]
            elif scope.startswith("collection:"):
                collection_id = scope.split(":")[1]
            elif scope.startswith("category:"):
                category = scope.split(":")[1]

        rules = await engine.get_applicable_rules(
            profile_id=profile_id,
            designer_id=designer_id,
            collection_id=collection_id,
            category=category,
        )

        if active is not None:
            rules = [r for r in rules if r.active == active]

        return [
            RuleResponse(
                id=r.id,
                scope=r.scope,
                predicate=r.predicate,
                effect=r.effect,
                weight=r.weight,
                active=r.active,
                start_at=r.start_at,
                end_at=r.end_at,
                created_by=r.created_by,
                created_at=r.created_at,
            )
            for r in rules
        ]

    except Exception as e:
        logger.error(f"Error listing rules: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": {
                    "code": "RULE.ERROR",
                    "message": "Failed to list rules",
                    "details": None,
                }
            },
        )


@router.delete("/rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_rule(
    rule_id: str,
    session: AsyncSession = Depends(get_db),
):
    """Delete (deactivate) a rule."""
    try:
        engine = RuleEngine(session)

        success = await engine.delete_rule(rule_id)

        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={
                    "error": {
                        "code": "RULE.NOT_FOUND",
                        "message": f"Rule {rule_id} not found",
                        "details": None,
                    }
                },
            )

        return None

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting rule: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": {
                    "code": "RULE.ERROR",
                    "message": "Failed to delete rule",
                    "details": None,
                }
            },
        )
