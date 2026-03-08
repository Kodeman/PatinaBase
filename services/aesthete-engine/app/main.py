"""
Main FastAPI application for Aesthete Engine.
"""
import logging
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.models import CurrentModelsResponse, HealthResponse, ModelInfo
from app.api.v1 import feedback, recommendations, rules, embeddings, explain, batch
from app.cache.redis_cache import RedisCache
from app.config import get_settings
from app.observability.tracing import setup_tracing, instrument_app
from app.observability.metrics import metrics_endpoint

settings = get_settings()

# Setup tracing
setup_tracing(service_name=settings.service_name)

# Configure logging
logging.basicConfig(
    level=settings.log_level,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Global Redis cache
redis_cache = RedisCache()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    # Startup
    logger.info(f"Starting {settings.service_name} v{settings.version}")
    logger.info(f"Environment: {settings.env}")

    # Connect to Redis
    await redis_cache.connect()

    # Set Redis cache in recommendations module
    recommendations.set_redis_cache(redis_cache)

    yield

    # Shutdown
    logger.info("Shutting down...")
    await redis_cache.disconnect()


# Create FastAPI app
app = FastAPI(
    title="Patina Aesthete Engine",
    description="Recommendation and similarity engine for Patina",
    version=settings.version,
    lifespan=lifespan,
    docs_url="/docs" if not settings.is_production else None,
    redoc_url="/redoc" if not settings.is_production else None,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if settings.is_development else [],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Instrument app with OpenTelemetry
instrument_app(app)


# Exception handlers
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Global exception handler."""
    logger.error(f"Unhandled exception: {exc}", exc_info=True)

    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": {
                "code": "INTERNAL.ERROR",
                "message": "Internal server error",
                "details": str(exc) if settings.is_development else None,
            }
        },
    )


# Include routers
app.include_router(recommendations.router)
app.include_router(feedback.router)
app.include_router(rules.router)
app.include_router(embeddings.router)
app.include_router(explain.router)
app.include_router(batch.router)


# Health endpoints
@app.get("/healthz", response_model=HealthResponse)
async def health_check():
    """Health check endpoint."""
    return HealthResponse(
        status="healthy",
        service=settings.service_name,
        version=settings.version,
        timestamp=datetime.now(),
    )


@app.get("/readyz", response_model=HealthResponse)
async def readiness_check():
    """Readiness check endpoint."""
    # Check dependencies (DB, Redis, etc.)
    try:
        # Check Redis
        is_ready = await redis_cache.exists("health_check")

        if not is_ready:
            # Set a test key
            await redis_cache.set("health_check", {"status": "ok"}, ttl=60)

        return HealthResponse(
            status="ready",
            service=settings.service_name,
            version=settings.version,
            timestamp=datetime.now(),
        )
    except Exception as e:
        logger.error(f"Readiness check failed: {e}")
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "status": "not_ready",
                "service": settings.service_name,
                "error": str(e),
            },
        )


@app.get("/v1/models/current", response_model=CurrentModelsResponse)
async def get_current_models():
    """Get current model versions and configuration."""
    from app.core.scoring import HybridScorer

    scorer = HybridScorer()

    return CurrentModelsResponse(
        ranking_model=ModelInfo(
            version="rec-1.0.0",
            embedding_model=settings.embedding_model_name,
        ),
        embedding_model=ModelInfo(
            version=settings.embedding_model_name,
            embedding_model=settings.embedding_model_name,
        ),
        weights=scorer.get_weights(),
        version=settings.version,
    )


# Root endpoint
@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "service": settings.service_name,
        "version": settings.version,
        "status": "running",
        "docs": "/docs" if not settings.is_production else "disabled",
    }


@app.get("/metrics")
async def metrics():
    """Prometheus metrics endpoint."""
    return metrics_endpoint()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=settings.port,
        reload=settings.is_development,
        log_level=settings.log_level.lower(),
    )
