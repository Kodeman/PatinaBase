"""
Redis caching layer for recommendations.
Provides fast access to precomputed results and candidate sets.
"""
import hashlib
import json
import logging
from typing import Any, Dict, List, Optional

import redis.asyncio as aioredis

from app.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)


class RedisCache:
    """
    Redis-based caching for recommendation results.
    """

    def __init__(self, redis_url: Optional[str] = None):
        """
        Initialize Redis cache.

        Args:
            redis_url: Redis connection URL
        """
        self.redis_url = redis_url or settings.redis_url
        self.client: Optional[aioredis.Redis] = None
        self.default_ttl = settings.cache_ttl_seconds

    async def connect(self):
        """Connect to Redis."""
        if not self.client:
            self.client = await aioredis.from_url(
                self.redis_url,
                max_connections=settings.redis_max_connections,
                decode_responses=True,
            )
            logger.info("Connected to Redis")

    async def disconnect(self):
        """Disconnect from Redis."""
        if self.client:
            await self.client.close()
            logger.info("Disconnected from Redis")

    async def get(self, key: str) -> Optional[Any]:
        """
        Get value from cache.

        Args:
            key: Cache key

        Returns:
            Cached value or None
        """
        if not self.client:
            await self.connect()

        try:
            value = await self.client.get(key)
            if value:
                return json.loads(value)
            return None
        except Exception as e:
            logger.error(f"Redis get error: {e}")
            return None

    async def set(
        self, key: str, value: Any, ttl: Optional[int] = None
    ) -> bool:
        """
        Set value in cache.

        Args:
            key: Cache key
            value: Value to cache
            ttl: Time to live in seconds

        Returns:
            True if successful
        """
        if not self.client:
            await self.connect()

        ttl = ttl or self.default_ttl

        try:
            serialized = json.dumps(value)
            await self.client.setex(key, ttl, serialized)
            return True
        except Exception as e:
            logger.error(f"Redis set error: {e}")
            return False

    async def delete(self, key: str) -> bool:
        """
        Delete value from cache.

        Args:
            key: Cache key

        Returns:
            True if deleted
        """
        if not self.client:
            await self.connect()

        try:
            result = await self.client.delete(key)
            return result > 0
        except Exception as e:
            logger.error(f"Redis delete error: {e}")
            return False

    async def delete_pattern(self, pattern: str) -> int:
        """
        Delete all keys matching pattern.

        Args:
            pattern: Key pattern (e.g., "rec:profile:*")

        Returns:
            Number of keys deleted
        """
        if not self.client:
            await self.connect()

        try:
            keys = []
            async for key in self.client.scan_iter(match=pattern):
                keys.append(key)

            if keys:
                return await self.client.delete(*keys)
            return 0
        except Exception as e:
            logger.error(f"Redis delete pattern error: {e}")
            return 0

    async def exists(self, key: str) -> bool:
        """
        Check if key exists.

        Args:
            key: Cache key

        Returns:
            True if exists
        """
        if not self.client:
            await self.connect()

        try:
            return await self.client.exists(key) > 0
        except Exception as e:
            logger.error(f"Redis exists error: {e}")
            return False

    @staticmethod
    def generate_cache_key(prefix: str, **kwargs) -> str:
        """
        Generate a cache key from parameters.

        Args:
            prefix: Key prefix
            **kwargs: Parameters to include in key

        Returns:
            Cache key
        """
        # Sort kwargs for consistent key generation
        sorted_params = sorted(kwargs.items())
        params_str = json.dumps(sorted_params, sort_keys=True)
        params_hash = hashlib.md5(params_str.encode()).hexdigest()[:12]

        return f"{prefix}:{params_hash}"


class RecommendationCache:
    """
    Specialized cache for recommendations.
    """

    def __init__(self, redis_cache: RedisCache):
        """
        Initialize recommendation cache.

        Args:
            redis_cache: Redis cache instance
        """
        self.cache = redis_cache

    async def get_recommendations(
        self,
        profile_id: str,
        context: Dict[str, Any],
        filters: Optional[Dict[str, Any]] = None,
    ) -> Optional[List[Dict[str, Any]]]:
        """
        Get cached recommendations.

        Args:
            profile_id: Profile ID
            context: Context information
            filters: Optional filters

        Returns:
            Cached recommendations or None
        """
        key = self._build_rec_key(profile_id, context, filters)
        return await self.cache.get(key)

    async def set_recommendations(
        self,
        profile_id: str,
        context: Dict[str, Any],
        recommendations: List[Dict[str, Any]],
        filters: Optional[Dict[str, Any]] = None,
        ttl: Optional[int] = None,
    ) -> bool:
        """
        Cache recommendations.

        Args:
            profile_id: Profile ID
            context: Context information
            recommendations: Recommendations to cache
            filters: Optional filters
            ttl: Time to live

        Returns:
            True if cached successfully
        """
        key = self._build_rec_key(profile_id, context, filters)
        return await self.cache.set(key, recommendations, ttl=ttl)

    async def invalidate_profile(self, profile_id: str) -> int:
        """
        Invalidate all cached recommendations for a profile.

        Args:
            profile_id: Profile ID

        Returns:
            Number of keys deleted
        """
        pattern = f"rec:profile:{profile_id}:*"
        return await self.cache.delete_pattern(pattern)

    async def invalidate_product(self, product_id: str) -> int:
        """
        Invalidate cache entries containing a product.

        Args:
            product_id: Product ID

        Returns:
            Number of keys deleted
        """
        # This is a simplification - in production, might need a reverse index
        pattern = f"rec:product:{product_id}:*"
        return await self.cache.delete_pattern(pattern)

    def _build_rec_key(
        self,
        profile_id: str,
        context: Dict[str, Any],
        filters: Optional[Dict[str, Any]] = None,
    ) -> str:
        """Build cache key for recommendations."""
        return RedisCache.generate_cache_key(
            prefix=f"rec:profile:{profile_id}",
            context=context,
            filters=filters or {},
        )


class CandidateSetCache:
    """
    Cache for precomputed candidate sets.
    """

    def __init__(self, redis_cache: RedisCache):
        """
        Initialize candidate set cache.

        Args:
            redis_cache: Redis cache instance
        """
        self.cache = redis_cache

    async def get_candidate_set(
        self, profile_id: str, context_hash: str
    ) -> Optional[List[Dict[str, Any]]]:
        """
        Get cached candidate set.

        Args:
            profile_id: Profile ID
            context_hash: Context hash

        Returns:
            Cached candidates or None
        """
        key = f"candidates:{profile_id}:{context_hash}"
        return await self.cache.get(key)

    async def set_candidate_set(
        self,
        profile_id: str,
        context_hash: str,
        candidates: List[Dict[str, Any]],
        ttl: Optional[int] = None,
    ) -> bool:
        """
        Cache candidate set.

        Args:
            profile_id: Profile ID
            context_hash: Context hash
            candidates: Candidate products
            ttl: Time to live

        Returns:
            True if cached successfully
        """
        key = f"candidates:{profile_id}:{context_hash}"
        return await self.cache.set(key, candidates, ttl=ttl)

    async def invalidate_candidates(self, profile_id: str) -> int:
        """
        Invalidate all candidate sets for a profile.

        Args:
            profile_id: Profile ID

        Returns:
            Number of keys deleted
        """
        pattern = f"candidates:{profile_id}:*"
        return await self.cache.delete_pattern(pattern)


class ModelVersionCache:
    """
    Cache for model version information.
    """

    def __init__(self, redis_cache: RedisCache):
        """
        Initialize model version cache.

        Args:
            redis_cache: Redis cache instance
        """
        self.cache = redis_cache

    async def get_current_model(self, model_name: str) -> Optional[Dict[str, Any]]:
        """
        Get current model version info.

        Args:
            model_name: Model name

        Returns:
            Model info or None
        """
        key = f"model:current:{model_name}"
        return await self.cache.get(key)

    async def set_current_model(
        self, model_name: str, model_info: Dict[str, Any], ttl: int = 3600
    ) -> bool:
        """
        Cache current model version info.

        Args:
            model_name: Model name
            model_info: Model information
            ttl: Time to live (default 1 hour)

        Returns:
            True if cached successfully
        """
        key = f"model:current:{model_name}"
        return await self.cache.set(key, model_info, ttl=ttl)

    async def invalidate_model(self, model_name: str) -> bool:
        """
        Invalidate cached model info.

        Args:
            model_name: Model name

        Returns:
            True if deleted
        """
        key = f"model:current:{model_name}"
        return await self.cache.delete(key)
