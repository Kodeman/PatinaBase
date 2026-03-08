"""
Catalog Service client.
Fetches product data and metadata.
"""
import logging
from typing import Any, Dict, List, Optional

import httpx

from app.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)


class CatalogClient:
    """
    Client for Catalog service.
    Provides async methods to fetch product data.
    """

    def __init__(self, base_url: Optional[str] = None):
        """
        Initialize Catalog client.

        Args:
            base_url: Base URL for Catalog service
        """
        self.base_url = base_url or "http://catalog-service:8000"
        self.timeout = 10.0  # seconds

    async def get_product(self, product_id: str) -> Optional[Dict[str, Any]]:
        """
        Get product details.

        Args:
            product_id: Product ID

        Returns:
            Product data
        """
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.get(
                    f"{self.base_url}/v1/products/{product_id}",
                    headers={"Content-Type": "application/json"},
                )

                if response.status_code == 404:
                    logger.warning(f"Product not found: {product_id}")
                    return None

                response.raise_for_status()
                return response.json()

        except httpx.TimeoutException:
            logger.error(f"Timeout fetching product {product_id}")
            return None
        except Exception as e:
            logger.error(f"Error fetching product {product_id}: {e}")
            return None

    async def get_products_batch(
        self, product_ids: List[str]
    ) -> Dict[str, Dict[str, Any]]:
        """
        Get multiple products in batch.

        Args:
            product_ids: List of product IDs

        Returns:
            Map of product_id to product data
        """
        try:
            async with httpx.AsyncClient(timeout=self.timeout * 2) as client:
                response = await client.post(
                    f"{self.base_url}/v1/products/batch",
                    json={"product_ids": product_ids},
                    headers={"Content-Type": "application/json"},
                )

                response.raise_for_status()
                data = response.json()
                return {p["id"]: p for p in data.get("products", [])}

        except Exception as e:
            logger.error(f"Error fetching batch products: {e}")
            return {}

    async def search_products(
        self,
        query: str,
        filters: Optional[Dict[str, Any]] = None,
        limit: int = 100,
    ) -> List[Dict[str, Any]]:
        """
        Search products by query and filters.

        Args:
            query: Search query
            filters: Filter criteria
            limit: Max results

        Returns:
            List of products
        """
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                payload = {"query": query, "limit": limit}
                if filters:
                    payload["filters"] = filters

                response = await client.post(
                    f"{self.base_url}/v1/products/search",
                    json=payload,
                    headers={"Content-Type": "application/json"},
                )

                response.raise_for_status()
                data = response.json()
                return data.get("results", [])

        except Exception as e:
            logger.error(f"Error searching products: {e}")
            return []

    async def get_product_variants(
        self, product_id: str
    ) -> List[Dict[str, Any]]:
        """
        Get product variants.

        Args:
            product_id: Product ID

        Returns:
            List of variants
        """
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.get(
                    f"{self.base_url}/v1/products/{product_id}/variants",
                    headers={"Content-Type": "application/json"},
                )

                response.raise_for_status()
                data = response.json()
                return data.get("variants", [])

        except Exception as e:
            logger.error(f"Error fetching variants for {product_id}: {e}")
            return []

    async def get_product_image_url(
        self, product_id: str, variant_id: Optional[str] = None
    ) -> Optional[str]:
        """
        Get product image URL from media service.

        Args:
            product_id: Product ID
            variant_id: Optional variant ID

        Returns:
            Image URL
        """
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                url = f"{self.base_url}/v1/products/{product_id}/media"
                if variant_id:
                    url += f"?variant_id={variant_id}"

                response = await client.get(
                    url, headers={"Content-Type": "application/json"}
                )

                response.raise_for_status()
                data = response.json()
                # Get primary image
                images = data.get("images", [])
                if images:
                    return images[0].get("url")
                return None

        except Exception as e:
            logger.error(f"Error fetching image for {product_id}: {e}")
            return None

    async def get_category_products(
        self, category: str, limit: int = 100, offset: int = 0
    ) -> List[Dict[str, Any]]:
        """
        Get products in a category.

        Args:
            category: Category name
            limit: Max results
            offset: Pagination offset

        Returns:
            List of products
        """
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.get(
                    f"{self.base_url}/v1/categories/{category}/products",
                    params={"limit": limit, "offset": offset},
                    headers={"Content-Type": "application/json"},
                )

                response.raise_for_status()
                data = response.json()
                return data.get("products", [])

        except Exception as e:
            logger.error(f"Error fetching category {category} products: {e}")
            return []
