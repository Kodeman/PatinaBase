"""
Configuration management for Aesthete Engine.
Uses pydantic-settings for environment variable management.
"""
from functools import lru_cache
from typing import Optional

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore"
    )

    # Application
    env: str = Field(default="development", description="Environment name")
    service_name: str = Field(default="aesthete-engine")
    version: str = Field(default="1.0.0")
    log_level: str = Field(default="INFO")
    port: int = Field(default=8000)

    # Database
    database_url: str = Field(
        default="postgresql+asyncpg://patina:password@localhost:5432/patina"
    )
    db_pool_size: int = Field(default=20)
    db_max_overflow: int = Field(default=10)

    # Redis
    redis_url: str = Field(default="redis://localhost:6379/0")
    redis_max_connections: int = Field(default=50)

    # MLflow
    mlflow_tracking_uri: str = Field(default="http://localhost:5000")
    mlflow_artifact_uri: str = Field(default="s3://patina-mlflow-artifacts")
    mlflow_s3_endpoint_url: Optional[str] = Field(default=None)

    # OpenSearch
    opensearch_host: str = Field(default="localhost")
    opensearch_port: int = Field(default=9200)
    opensearch_use_ssl: bool = Field(default=True)
    opensearch_verify_certs: bool = Field(default=True)

    # Model Configuration
    embedding_model_name: str = Field(default="clip-vit-b-32")
    embedding_dim: int = Field(default=768)
    score_vec_dim: int = Field(default=32)
    alpha_img_text: float = Field(default=0.6, ge=0.0, le=1.0)

    # Scoring Weights
    weight_vec: float = Field(default=0.45)
    weight_text: float = Field(default=0.10)
    weight_price: float = Field(default=0.10)
    weight_size: float = Field(default=0.10)
    weight_rules: float = Field(default=0.15)
    weight_pop: float = Field(default=0.05)
    weight_new: float = Field(default=0.05)
    weight_penalty: float = Field(default=0.30)

    # Performance
    vector_top_k: int = Field(default=500)
    lexical_top_k: int = Field(default=300)
    default_limit: int = Field(default=20)
    cache_ttl_seconds: int = Field(default=600)
    batch_size: int = Field(default=32)

    # Observability
    otlp_endpoint: str = Field(default="http://localhost:4318")
    enable_tracing: bool = Field(default=True)
    enable_metrics: bool = Field(default=True)

    # Feature Flags
    enable_mmr_diversity: bool = Field(default=True)
    mmr_lambda: float = Field(default=0.8, ge=0.0, le=1.0)
    enable_precompute: bool = Field(default=True)
    enable_explainability: bool = Field(default=True)

    # Rate Limiting
    rate_limit_recommendations: int = Field(default=30)
    rate_limit_feedback: int = Field(default=120)

    @field_validator("log_level")
    @classmethod
    def validate_log_level(cls, v: str) -> str:
        """Validate log level."""
        valid_levels = ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]
        v_upper = v.upper()
        if v_upper not in valid_levels:
            raise ValueError(f"Invalid log level. Must be one of {valid_levels}")
        return v_upper

    @property
    def is_production(self) -> bool:
        """Check if running in production."""
        return self.env.lower() == "production"

    @property
    def is_development(self) -> bool:
        """Check if running in development."""
        return self.env.lower() == "development"


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
