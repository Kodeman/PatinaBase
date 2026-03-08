"""
Prometheus metrics setup.
"""
import logging
from typing import Optional

from prometheus_client import Counter, Histogram, Gauge, generate_latest, CONTENT_TYPE_LATEST
from fastapi import Response
from app.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)

# Define metrics
recommendation_requests = Counter(
    "aesthete_recommendation_requests_total",
    "Total recommendation requests",
    ["status", "profile_id"],
)

recommendation_latency = Histogram(
    "aesthete_recommendation_latency_seconds",
    "Recommendation request latency",
    ["endpoint"],
    buckets=[0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0],
)

candidate_count = Histogram(
    "aesthete_candidate_count",
    "Number of candidates generated",
    ["source"],
    buckets=[10, 50, 100, 200, 500, 1000, 2000],
)

cache_hits = Counter(
    "aesthete_cache_hits_total",
    "Cache hit count",
    ["cache_type"],
)

cache_misses = Counter(
    "aesthete_cache_misses_total",
    "Cache miss count",
    ["cache_type"],
)

rule_evaluations = Counter(
    "aesthete_rule_evaluations_total",
    "Rule evaluation count",
    ["effect", "scope"],
)

embedding_computations = Counter(
    "aesthete_embedding_computations_total",
    "Embedding computation count",
    ["model", "status"],
)

feedback_events = Counter(
    "aesthete_feedback_events_total",
    "Feedback events recorded",
    ["action", "profile_id"],
)

model_inference_latency = Histogram(
    "aesthete_model_inference_latency_seconds",
    "Model inference latency",
    ["model_name"],
    buckets=[0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5],
)

active_experiments = Gauge(
    "aesthete_active_experiments",
    "Number of active A/B experiments",
)


def metrics_endpoint() -> Response:
    """
    Prometheus metrics endpoint.

    Returns:
        Metrics in Prometheus format
    """
    metrics_data = generate_latest()
    return Response(content=metrics_data, media_type=CONTENT_TYPE_LATEST)


class MetricsCollector:
    """Helper class for collecting metrics."""

    @staticmethod
    def record_recommendation(status: str, profile_id: str):
        """Record recommendation request."""
        recommendation_requests.labels(status=status, profile_id=profile_id).inc()

    @staticmethod
    def record_latency(endpoint: str, duration: float):
        """Record endpoint latency."""
        recommendation_latency.labels(endpoint=endpoint).observe(duration)

    @staticmethod
    def record_candidates(source: str, count: int):
        """Record candidate count."""
        candidate_count.labels(source=source).observe(count)

    @staticmethod
    def record_cache_hit(cache_type: str):
        """Record cache hit."""
        cache_hits.labels(cache_type=cache_type).inc()

    @staticmethod
    def record_cache_miss(cache_type: str):
        """Record cache miss."""
        cache_misses.labels(cache_type=cache_type).inc()

    @staticmethod
    def record_rule_evaluation(effect: str, scope: str):
        """Record rule evaluation."""
        rule_evaluations.labels(effect=effect, scope=scope).inc()

    @staticmethod
    def record_embedding(model: str, status: str):
        """Record embedding computation."""
        embedding_computations.labels(model=model, status=status).inc()

    @staticmethod
    def record_feedback(action: str, profile_id: str):
        """Record feedback event."""
        feedback_events.labels(action=action, profile_id=profile_id).inc()

    @staticmethod
    def record_inference_latency(model_name: str, duration: float):
        """Record model inference latency."""
        model_inference_latency.labels(model_name=model_name).observe(duration)

    @staticmethod
    def set_active_experiments(count: int):
        """Set active experiments count."""
        active_experiments.set(count)
