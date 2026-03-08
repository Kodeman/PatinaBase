"""
OCI Streaming client for event publishing.
"""
import json
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import uuid4

from app.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)


class StreamingClient:
    """
    Client for OCI Streaming service.
    Publishes events for recommendation logs, feedback, and model updates.
    """

    def __init__(self, stream_endpoint: Optional[str] = None):
        """
        Initialize streaming client.

        Args:
            stream_endpoint: OCI Streaming endpoint URL
        """
        self.stream_endpoint = stream_endpoint or settings.mlflow_tracking_uri
        self.enabled = True  # Feature flag

    async def publish_event(
        self,
        event_type: str,
        payload: Dict[str, Any],
        key: Optional[str] = None,
        headers: Optional[Dict[str, str]] = None,
    ) -> bool:
        """
        Publish an event to the stream.

        Args:
            event_type: Event type (e.g., "aesthete.rec.issued")
            payload: Event payload
            key: Optional partition key
            headers: Optional headers

        Returns:
            True if published successfully
        """
        if not self.enabled:
            logger.debug(f"Streaming disabled, skipping event: {event_type}")
            return True

        try:
            event = {
                "id": str(uuid4()),
                "type": event_type,
                "timestamp": datetime.utcnow().isoformat(),
                "payload": payload,
                "headers": headers or {},
            }

            # In production, use OCI SDK to publish
            # For now, log the event
            logger.info(f"Publishing event: {event_type}")
            logger.debug(f"Event data: {json.dumps(event, indent=2)}")

            # TODO: Implement actual OCI Streaming integration
            # import oci
            # stream_client = oci.streaming.StreamClient(config)
            # stream_client.put_messages(...)

            return True

        except Exception as e:
            logger.error(f"Error publishing event {event_type}: {e}")
            return False

    async def publish_recommendation_event(
        self,
        trace_id: str,
        profile_id: str,
        results: List[Dict[str, Any]],
        model_version: str,
        context: Dict[str, Any],
    ) -> bool:
        """
        Publish recommendation issued event.

        Args:
            trace_id: Recommendation trace ID
            profile_id: User profile ID
            results: Recommendation results
            model_version: Model version used
            context: Request context

        Returns:
            True if published
        """
        return await self.publish_event(
            event_type="aesthete.recommendation.issued",
            payload={
                "trace_id": trace_id,
                "profile_id": profile_id,
                "model_version": model_version,
                "result_count": len(results),
                "context": context,
            },
            key=profile_id,
        )

    async def publish_feedback_event(
        self,
        feedback_id: str,
        profile_id: str,
        product_id: str,
        action: str,
        weight: float,
        context: Dict[str, Any],
    ) -> bool:
        """
        Publish feedback recorded event.

        Args:
            feedback_id: Feedback ID
            profile_id: User profile ID
            product_id: Product ID
            action: Feedback action
            weight: Feedback weight
            context: Context

        Returns:
            True if published
        """
        return await self.publish_event(
            event_type="aesthete.feedback.recorded",
            payload={
                "feedback_id": feedback_id,
                "profile_id": profile_id,
                "product_id": product_id,
                "action": action,
                "weight": weight,
                "context": context,
            },
            key=profile_id,
        )

    async def publish_rule_event(
        self,
        rule_id: str,
        action: str,
        scope: str,
        effect: str,
        created_by: str,
    ) -> bool:
        """
        Publish rule change event.

        Args:
            rule_id: Rule ID
            action: Action (created, updated, deleted)
            scope: Rule scope
            effect: Rule effect
            created_by: Creator ID

        Returns:
            True if published
        """
        return await self.publish_event(
            event_type=f"aesthete.rule.{action}",
            payload={
                "rule_id": rule_id,
                "scope": scope,
                "effect": effect,
                "created_by": created_by,
            },
            key=rule_id,
        )

    async def publish_embedding_event(
        self,
        product_id: str,
        model_name: str,
        embedding_dim: int,
    ) -> bool:
        """
        Publish embedding computed event.

        Args:
            product_id: Product ID
            model_name: Model name
            embedding_dim: Embedding dimension

        Returns:
            True if published
        """
        return await self.publish_event(
            event_type="aesthete.embedding.computed",
            payload={
                "product_id": product_id,
                "model_name": model_name,
                "embedding_dim": embedding_dim,
            },
            key=product_id,
        )

    async def publish_model_event(
        self,
        model_name: str,
        version: str,
        stage: str,
        action: str,
    ) -> bool:
        """
        Publish model lifecycle event.

        Args:
            model_name: Model name
            version: Model version
            stage: Stage (staging, production)
            action: Action (promoted, archived)

        Returns:
            True if published
        """
        return await self.publish_event(
            event_type=f"aesthete.model.{action}",
            payload={
                "model_name": model_name,
                "version": version,
                "stage": stage,
            },
            key=model_name,
        )

    async def publish_batch(self, events: List[Dict[str, Any]]) -> int:
        """
        Publish multiple events in batch.

        Args:
            events: List of event dictionaries

        Returns:
            Number of successfully published events
        """
        success_count = 0

        for event in events:
            if await self.publish_event(
                event_type=event.get("type"),
                payload=event.get("payload", {}),
                key=event.get("key"),
                headers=event.get("headers"),
            ):
                success_count += 1

        return success_count
