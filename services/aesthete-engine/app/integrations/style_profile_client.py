"""
Style Profile Service client.
Fetches user style profiles and preferences.
"""
import logging
from typing import Any, Dict, Optional

import httpx

from app.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)


class StyleProfileClient:
    """
    Client for Style Profile service.
    Provides async methods to fetch user profiles and preferences.
    """

    def __init__(self, base_url: Optional[str] = None):
        """
        Initialize Style Profile client.

        Args:
            base_url: Base URL for Style Profile service
        """
        self.base_url = base_url or "http://style-profile-service:8000"
        self.timeout = 10.0  # seconds

    async def get_profile(self, profile_id: str) -> Dict[str, Any]:
        """
        Get user style profile.

        Args:
            profile_id: Profile ID

        Returns:
            Profile data including scoreVec, constraints, preferences
        """
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.get(
                    f"{self.base_url}/v1/profiles/{profile_id}",
                    headers={"Content-Type": "application/json"},
                )

                if response.status_code == 404:
                    logger.warning(f"Profile not found: {profile_id}")
                    return None

                response.raise_for_status()
                return response.json()

        except httpx.TimeoutException:
            logger.error(f"Timeout fetching profile {profile_id}")
            return None
        except Exception as e:
            logger.error(f"Error fetching profile {profile_id}: {e}")
            return None

    async def get_profile_batch(self, profile_ids: list[str]) -> Dict[str, Dict[str, Any]]:
        """
        Get multiple profiles in batch.

        Args:
            profile_ids: List of profile IDs

        Returns:
            Map of profile_id to profile data
        """
        try:
            async with httpx.AsyncClient(timeout=self.timeout * 2) as client:
                response = await client.post(
                    f"{self.base_url}/v1/profiles/batch",
                    json={"profile_ids": profile_ids},
                    headers={"Content-Type": "application/json"},
                )

                response.raise_for_status()
                data = response.json()
                return {p["id"]: p for p in data.get("profiles", [])}

        except Exception as e:
            logger.error(f"Error fetching batch profiles: {e}")
            return {}

    async def get_constraints(self, profile_id: str) -> Dict[str, Any]:
        """
        Get profile constraints (budget, materials, dimensions, etc.).

        Args:
            profile_id: Profile ID

        Returns:
            Constraints data
        """
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.get(
                    f"{self.base_url}/v1/profiles/{profile_id}/constraints",
                    headers={"Content-Type": "application/json"},
                )

                response.raise_for_status()
                return response.json()

        except Exception as e:
            logger.error(f"Error fetching constraints for {profile_id}: {e}")
            return {}

    async def update_profile_vector(
        self, profile_id: str, score_vec: list[float]
    ) -> bool:
        """
        Update profile score vector (for feedback learning).

        Args:
            profile_id: Profile ID
            score_vec: New score vector

        Returns:
            True if successful
        """
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.patch(
                    f"{self.base_url}/v1/profiles/{profile_id}/vector",
                    json={"score_vec": score_vec},
                    headers={"Content-Type": "application/json"},
                )

                response.raise_for_status()
                return True

        except Exception as e:
            logger.error(f"Error updating profile vector {profile_id}: {e}")
            return False
