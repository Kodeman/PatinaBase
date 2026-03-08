"""
API request/response models (Pydantic schemas).
"""
from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


# Request Models
class RecommendationRequest(BaseModel):
    """Request for personalized recommendations."""

    profile_id: str = Field(..., description="User profile ID")
    context: Dict[str, Any] = Field(
        default_factory=dict, description="Context information (room, slot, etc.)"
    )
    filters: Dict[str, Any] = Field(
        default_factory=dict, description="Additional filters"
    )
    limit: int = Field(default=20, ge=1, le=100, description="Number of results")
    include_explanations: bool = Field(
        default=True, description="Include explanations in response"
    )


class SimilarProductsRequest(BaseModel):
    """Request for similar products."""

    product_id: str = Field(..., description="Reference product ID")
    limit: int = Field(default=20, ge=1, le=100, description="Number of results")
    filters: Dict[str, Any] = Field(
        default_factory=dict, description="Additional filters"
    )
    include_explanations: bool = Field(
        default=False, description="Include explanations"
    )


class FeedbackRequest(BaseModel):
    """User/designer feedback."""

    profile_id: str = Field(..., description="User profile ID")
    product_id: str = Field(..., description="Product ID")
    interaction: str = Field(
        ..., description="Interaction type: approve|reject|replace_with|similar_to"
    )
    context: Dict[str, Any] = Field(
        default_factory=dict, description="Interaction context"
    )
    weight: float = Field(default=1.0, ge=0.0, le=1.0, description="Feedback weight")


class RuleRequest(BaseModel):
    """Create/update rule request."""

    scope: str = Field(..., description="Rule scope: global|designer|user|collection|category")
    predicate: Dict[str, Any] = Field(..., description="Matching predicate (JSON logic)")
    effect: str = Field(..., description="Effect: boost|bury|block")
    weight: float = Field(..., ge=-1.0, le=1.0, description="Effect weight")
    start_at: Optional[datetime] = Field(None, description="Optional start time")
    end_at: Optional[datetime] = Field(None, description="Optional end time")
    created_by: str = Field(..., description="Creator ID")


class RuleUpdateRequest(BaseModel):
    """Update rule request."""

    active: Optional[bool] = None
    weight: Optional[float] = Field(None, ge=-1.0, le=1.0)
    end_at: Optional[datetime] = None


class LabelRequest(BaseModel):
    """Add label request."""

    product_id: str = Field(..., description="Product ID")
    code: str = Field(..., description="Label code")
    weight: float = Field(default=1.0, ge=0.0, le=1.0)
    source: str = Field(default="designer", description="Source: designer|ml|import")
    actor_id: Optional[str] = Field(None, description="Actor ID")


class LabelBatchRequest(BaseModel):
    """Batch add labels request."""

    labels: List[LabelRequest] = Field(..., description="List of labels to add")


# Response Models
class ScoreContribution(BaseModel):
    """Score contribution breakdown."""

    type: str
    weight: float
    percentage: float


class Constraint(BaseModel):
    """Constraint check result."""

    type: str
    satisfied: bool
    note: str


class RuleExplanation(BaseModel):
    """Rule explanation."""

    rule_id: str
    effect: str
    weight: float
    reason: str


class Explanation(BaseModel):
    """Recommendation explanation."""

    product_id: str
    total_score: float
    contributions: List[ScoreContribution]
    reasons: List[str]
    rules: List[RuleExplanation]
    constraints: List[Constraint]
    metadata: Dict[str, Any]


class RecommendationResult(BaseModel):
    """Single recommendation result."""

    product_id: str
    score: float
    reasons: Optional[List[ScoreContribution]] = None
    source: List[str] = Field(default_factory=list, description="Sources: vec|lex")
    explanation: Optional[Explanation] = None


class ModelInfo(BaseModel):
    """Model version information."""

    version: str
    embedding_model: str


class RecommendationResponse(BaseModel):
    """Recommendations response."""

    trace_id: str = Field(..., description="Trace ID for debugging")
    model: ModelInfo = Field(..., description="Model version info")
    rules_version: Optional[str] = Field(None, description="Rules version timestamp")
    results: List[RecommendationResult] = Field(..., description="Recommendation results")
    metadata: Dict[str, Any] = Field(
        default_factory=dict, description="Additional metadata"
    )


class SimilarProductsResponse(BaseModel):
    """Similar products response."""

    trace_id: str
    reference_product_id: str
    results: List[RecommendationResult]
    metadata: Dict[str, Any] = Field(default_factory=dict)


class FeedbackResponse(BaseModel):
    """Feedback response."""

    feedback_id: str
    status: str = "recorded"
    message: str = "Feedback recorded successfully"


class RuleResponse(BaseModel):
    """Rule response."""

    id: str
    scope: str
    predicate: Dict[str, Any]
    effect: str
    weight: float
    active: bool
    start_at: Optional[datetime]
    end_at: Optional[datetime]
    created_by: str
    created_at: datetime


class LabelResponse(BaseModel):
    """Label response."""

    id: str
    product_id: str
    code: str
    weight: float
    source: str
    actor_id: Optional[str]
    created_at: datetime


class CurrentModelsResponse(BaseModel):
    """Current models information."""

    ranking_model: Optional[ModelInfo]
    embedding_model: Optional[ModelInfo]
    weights: Dict[str, float]
    version: str


class HealthResponse(BaseModel):
    """Health check response."""

    status: str
    service: str
    version: str
    timestamp: datetime


class ErrorResponse(BaseModel):
    """Error response."""

    error: Dict[str, Any] = Field(..., description="Error details")

    class Config:
        schema_extra = {
            "example": {
                "error": {
                    "code": "REC.INPUT.INVALID",
                    "message": "Unknown profileId",
                    "details": None,
                }
            }
        }
