"""
Database models for Aesthete Engine.
Based on the Prisma schema from the PRD.
"""
from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import uuid4

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    Index,
    Integer,
    LargeBinary,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

Base = declarative_base()


class ModelVersion(Base):
    """Model version tracking for reproducibility."""

    __tablename__ = "model_versions"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # "ranking" | "embedding"
    params: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    archived_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    def __repr__(self) -> str:
        return f"<ModelVersion(name={self.name}, type={self.type})>"


class Embedding(Base):
    """Product/variant embeddings with pgvector support."""

    __tablename__ = "embeddings"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    product_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    variant_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    model_name: Mapped[str] = mapped_column(String(255), nullable=False)
    # Note: pgvector column should be defined via Alembic migration
    # vector: Mapped[List[float]] = mapped_column(Vector(768))
    vector: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (Index("idx_embeddings_product_id", "product_id"),)

    def __repr__(self) -> str:
        return f"<Embedding(product_id={self.product_id}, model={self.model_name})>"


class CandidateSet(Base):
    """Precomputed candidate sets for caching."""

    __tablename__ = "candidate_sets"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    profile_id: Mapped[str] = mapped_column(String(255), nullable=False)
    context_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    model_name: Mapped[str] = mapped_column(String(255), nullable=False)
    items: Mapped[List[Dict[str, Any]]] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    ttl: Mapped[int] = mapped_column(Integer, nullable=False)

    __table_args__ = (
        Index("idx_candidate_sets_profile_context", "profile_id", "context_hash"),
    )

    def __repr__(self) -> str:
        return f"<CandidateSet(profile_id={self.profile_id}, context={self.context_hash})>"


class Rule(Base):
    """Business rules for recommendation steering."""

    __tablename__ = "rules"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    scope: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # global|designer|user|collection|category
    predicate: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False)
    effect: Mapped[str] = mapped_column(
        String(20), nullable=False
    )  # boost|bury|block
    weight: Mapped[float] = mapped_column(Float, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    start_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    end_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_by: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    def __repr__(self) -> str:
        return f"<Rule(scope={self.scope}, effect={self.effect}, active={self.active})>"


class Label(Base):
    """Product labels for teaching and categorization."""

    __tablename__ = "labels"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    product_id: Mapped[str] = mapped_column(String(255), nullable=False)
    code: Mapped[str] = mapped_column(String(100), nullable=False)
    weight: Mapped[float] = mapped_column(Float, default=1.0, nullable=False)
    source: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # designer|ml|import
    actor_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (Index("idx_labels_product_code", "product_id", "code"),)

    def __repr__(self) -> str:
        return f"<Label(product_id={self.product_id}, code={self.code})>"


class RecommendationLog(Base):
    """Audit log for recommendations with full provenance."""

    __tablename__ = "recommendation_logs"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    trace_id: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    profile_id: Mapped[str] = mapped_column(String(255), nullable=False)
    request: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False)
    results: Mapped[List[Dict[str, Any]]] = mapped_column(JSON, nullable=False)
    model: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False)
    rules_version: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    def __repr__(self) -> str:
        return f"<RecommendationLog(trace_id={self.trace_id}, profile_id={self.profile_id})>"


class Feedback(Base):
    """User/designer feedback for teaching the engine."""

    __tablename__ = "feedback"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    profile_id: Mapped[str] = mapped_column(String(255), nullable=False)
    product_id: Mapped[str] = mapped_column(String(255), nullable=False)
    action: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # approve|reject|replace_with|similar_to
    context: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False)
    weight: Mapped[float] = mapped_column(Float, default=1.0, nullable=False)
    ts: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (Index("idx_feedback_profile_ts", "profile_id", "ts"),)

    def __repr__(self) -> str:
        return f"<Feedback(profile_id={self.profile_id}, action={self.action})>"
