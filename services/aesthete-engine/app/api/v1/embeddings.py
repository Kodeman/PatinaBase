"""
Embeddings API endpoints.
"""
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from PIL import Image
import io

from app.db import get_db
from app.ml.embeddings import EmbeddingModel
from app.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1", tags=["embeddings"])

# Initialize embedding model
embedding_model = None


def get_embedding_model() -> EmbeddingModel:
    """Get or create embedding model instance."""
    global embedding_model
    if embedding_model is None:
        embedding_model = EmbeddingModel(
            model_name="openai/clip-vit-base-patch32",
            device="cpu",  # Use CPU for API, GPU for batch jobs
        )
    return embedding_model


# Request/Response Models
class ComputeEmbeddingRequest(BaseModel):
    """Request to compute embedding for a product."""

    product_id: str = Field(..., description="Product ID")
    text: Optional[str] = Field(None, description="Product text (name + description)")
    image_url: Optional[str] = Field(None, description="Product image URL")
    alpha: float = Field(default=0.6, ge=0.0, le=1.0, description="Image weight")


class EmbeddingResponse(BaseModel):
    """Embedding computation response."""

    product_id: str
    embedding_dim: int
    model_name: str
    success: bool
    message: str


class BatchEmbeddingRequest(BaseModel):
    """Request to compute embeddings for multiple products."""

    products: List[ComputeEmbeddingRequest] = Field(
        ..., description="List of products"
    )
    batch_size: int = Field(default=32, ge=1, le=100, description="Batch size")


class BatchEmbeddingResponse(BaseModel):
    """Batch embedding response."""

    total: int
    successful: int
    failed: int
    results: List[EmbeddingResponse]


@router.post("/embeddings/compute", response_model=EmbeddingResponse)
async def compute_embedding(
    request: ComputeEmbeddingRequest,
    session: AsyncSession = Depends(get_db),
) -> EmbeddingResponse:
    """
    Compute embedding for a single product.

    Accepts either text, image URL, or both.
    Stores the embedding in the database.
    """
    try:
        model = get_embedding_model()

        # Prepare inputs
        image = None
        if request.image_url:
            # In production, fetch image from OCI Object Storage
            # For now, skip image processing
            logger.warning(f"Image URL provided but not implemented: {request.image_url}")

        text = request.text

        if not image and not text:
            raise ValueError("Either text or image_url must be provided")

        # Compute embedding
        embedding = model.encode_product(
            image=image, text=text, alpha=request.alpha
        )

        # Store in database
        from sqlalchemy import text as sql_text

        vector_str = "[" + ",".join(map(str, embedding.tolist())) + "]"

        query = """
            INSERT INTO embeddings (product_id, model_name, vector, created_at)
            VALUES (:product_id, :model_name, :vector::vector, NOW())
            ON CONFLICT (product_id, model_name)
            DO UPDATE SET vector = :vector::vector, updated_at = NOW()
        """

        await session.execute(
            sql_text(query),
            {
                "product_id": request.product_id,
                "model_name": settings.embedding_model_name,
                "vector": vector_str,
            },
        )
        await session.commit()

        return EmbeddingResponse(
            product_id=request.product_id,
            embedding_dim=len(embedding),
            model_name=settings.embedding_model_name,
            success=True,
            message="Embedding computed and stored successfully",
        )

    except ValueError as e:
        logger.error(f"Invalid request: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": {
                    "code": "EMBEDDING.INVALID",
                    "message": str(e),
                    "details": None,
                }
            },
        )
    except Exception as e:
        logger.error(f"Error computing embedding: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": {
                    "code": "EMBEDDING.ERROR",
                    "message": "Failed to compute embedding",
                    "details": str(e) if settings.is_development else None,
                }
            },
        )


@router.post("/embeddings/batch", response_model=BatchEmbeddingResponse)
async def compute_batch_embeddings(
    request: BatchEmbeddingRequest,
    session: AsyncSession = Depends(get_db),
) -> BatchEmbeddingResponse:
    """
    Compute embeddings for multiple products in batch.

    More efficient than individual requests for bulk operations.
    """
    try:
        model = get_embedding_model()
        results = []
        successful = 0
        failed = 0

        for product_req in request.products:
            try:
                # Compute embedding
                text = product_req.text
                embedding = model.encode_product(
                    image=None, text=text, alpha=product_req.alpha
                )

                # Store in database
                from sqlalchemy import text as sql_text

                vector_str = "[" + ",".join(map(str, embedding.tolist())) + "]"

                query = """
                    INSERT INTO embeddings (product_id, model_name, vector, created_at)
                    VALUES (:product_id, :model_name, :vector::vector, NOW())
                    ON CONFLICT (product_id, model_name)
                    DO UPDATE SET vector = :vector::vector, updated_at = NOW()
                """

                await session.execute(
                    sql_text(query),
                    {
                        "product_id": product_req.product_id,
                        "model_name": settings.embedding_model_name,
                        "vector": vector_str,
                    },
                )

                results.append(
                    EmbeddingResponse(
                        product_id=product_req.product_id,
                        embedding_dim=len(embedding),
                        model_name=settings.embedding_model_name,
                        success=True,
                        message="Success",
                    )
                )
                successful += 1

            except Exception as e:
                logger.error(f"Error processing {product_req.product_id}: {e}")
                results.append(
                    EmbeddingResponse(
                        product_id=product_req.product_id,
                        embedding_dim=0,
                        model_name=settings.embedding_model_name,
                        success=False,
                        message=str(e),
                    )
                )
                failed += 1

        await session.commit()

        return BatchEmbeddingResponse(
            total=len(request.products),
            successful=successful,
            failed=failed,
            results=results,
        )

    except Exception as e:
        logger.error(f"Batch embedding error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": {
                    "code": "EMBEDDING.BATCH.ERROR",
                    "message": "Batch processing failed",
                    "details": str(e) if settings.is_development else None,
                }
            },
        )


@router.post("/embeddings/upload")
async def upload_and_embed(
    file: UploadFile = File(...),
    product_id: str = None,
    session: AsyncSession = Depends(get_db),
):
    """
    Upload an image and compute its embedding.

    Useful for designer uploads or admin tools.
    """
    try:
        # Read image
        contents = await file.read()
        image = Image.open(io.BytesIO(contents))

        # Compute embedding
        model = get_embedding_model()
        embedding = model.encode_image(image)

        # Store if product_id provided
        if product_id:
            from sqlalchemy import text as sql_text

            vector_str = "[" + ",".join(map(str, embedding.tolist())) + "]"

            query = """
                INSERT INTO embeddings (product_id, model_name, vector, created_at)
                VALUES (:product_id, :model_name, :vector::vector, NOW())
                ON CONFLICT (product_id, model_name)
                DO UPDATE SET vector = :vector::vector, updated_at = NOW()
            """

            await session.execute(
                sql_text(query),
                {
                    "product_id": product_id,
                    "model_name": settings.embedding_model_name,
                    "vector": vector_str,
                },
            )
            await session.commit()

        return {
            "product_id": product_id,
            "embedding_dim": len(embedding),
            "message": "Image embedded successfully",
        }

    except Exception as e:
        logger.error(f"Upload and embed error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": {
                    "code": "EMBEDDING.UPLOAD.ERROR",
                    "message": "Failed to process upload",
                    "details": str(e) if settings.is_development else None,
                }
            },
        )
