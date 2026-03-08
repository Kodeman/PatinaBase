"""
OpenTelemetry tracing setup.
"""
import logging
from typing import Optional

from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
from opentelemetry.sdk.resources import Resource, SERVICE_NAME
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

from app.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)


def setup_tracing(service_name: str = "aesthete-engine") -> Optional[TracerProvider]:
    """
    Setup OpenTelemetry tracing.

    Args:
        service_name: Service name for traces

    Returns:
        TracerProvider instance or None if disabled
    """
    if not settings.enable_tracing:
        logger.info("Tracing disabled")
        return None

    try:
        # Create resource
        resource = Resource(attributes={SERVICE_NAME: service_name})

        # Create tracer provider
        provider = TracerProvider(resource=resource)

        # Create OTLP exporter
        otlp_exporter = OTLPSpanExporter(
            endpoint=settings.otlp_endpoint, insecure=True
        )

        # Add span processor
        span_processor = BatchSpanProcessor(otlp_exporter)
        provider.add_span_processor(span_processor)

        # Set global tracer provider
        trace.set_tracer_provider(provider)

        logger.info(f"Tracing initialized for {service_name}")
        logger.info(f"OTLP endpoint: {settings.otlp_endpoint}")

        return provider

    except Exception as e:
        logger.error(f"Failed to setup tracing: {e}")
        return None


def instrument_app(app):
    """
    Instrument FastAPI app with OpenTelemetry.

    Args:
        app: FastAPI application
    """
    if not settings.enable_tracing:
        return

    try:
        # Instrument FastAPI
        FastAPIInstrumentor.instrument_app(app)

        # Instrument HTTPX (for external service calls)
        HTTPXClientInstrumentor().instrument()

        logger.info("App instrumentation complete")

    except Exception as e:
        logger.error(f"Failed to instrument app: {e}")


def get_tracer(name: str = "aesthete-engine"):
    """
    Get tracer instance.

    Args:
        name: Tracer name

    Returns:
        Tracer instance
    """
    return trace.get_tracer(name)
