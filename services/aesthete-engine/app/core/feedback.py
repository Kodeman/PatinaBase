"""
Teaching feedback integration for HITL (Human-in-the-Loop) learning.
Processes designer and user feedback to improve recommendations.
"""
from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import uuid4

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Feedback, Label


class FeedbackProcessor:
    """
    Process feedback from users and designers.
    Integrates with training pipeline for model improvement.
    """

    VALID_ACTIONS = {"approve", "reject", "replace_with", "similar_to"}

    def __init__(self, session: AsyncSession):
        """
        Initialize feedback processor.

        Args:
            session: Database session
        """
        self.session = session

    async def record_feedback(
        self,
        profile_id: str,
        product_id: str,
        action: str,
        context: Dict[str, Any],
        weight: float = 1.0,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Feedback:
        """
        Record user/designer feedback.

        Args:
            profile_id: User profile ID
            product_id: Product ID
            action: Feedback action (approve, reject, etc.)
            context: Context of the recommendation
            weight: Feedback weight (importance)
            metadata: Additional metadata

        Returns:
            Created feedback record

        Raises:
            ValueError: If action is invalid
        """
        if action not in self.VALID_ACTIONS:
            raise ValueError(f"Invalid action: {action}. Must be one of {self.VALID_ACTIONS}")

        # Merge metadata into context
        full_context = {**context}
        if metadata:
            full_context["metadata"] = metadata

        feedback = Feedback(
            profile_id=profile_id,
            product_id=product_id,
            action=action,
            context=full_context,
            weight=weight,
            ts=datetime.now(),
        )

        self.session.add(feedback)
        await self.session.commit()
        await self.session.refresh(feedback)

        return feedback

    async def get_feedback_history(
        self,
        profile_id: Optional[str] = None,
        product_id: Optional[str] = None,
        action: Optional[str] = None,
        limit: int = 100,
    ) -> List[Feedback]:
        """
        Retrieve feedback history.

        Args:
            profile_id: Filter by profile ID
            product_id: Filter by product ID
            action: Filter by action type
            limit: Maximum number of results

        Returns:
            List of feedback records
        """
        query = select(Feedback)

        conditions = []
        if profile_id:
            conditions.append(Feedback.profile_id == profile_id)
        if product_id:
            conditions.append(Feedback.product_id == product_id)
        if action:
            conditions.append(Feedback.action == action)

        if conditions:
            query = query.where(and_(*conditions))

        query = query.order_by(Feedback.ts.desc()).limit(limit)

        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def get_feedback_stats(
        self, profile_id: Optional[str] = None, days: int = 30
    ) -> Dict[str, Any]:
        """
        Get feedback statistics.

        Args:
            profile_id: Optional profile ID filter
            days: Number of days to analyze

        Returns:
            Statistics dictionary
        """
        from datetime import timedelta

        cutoff_date = datetime.now() - timedelta(days=days)

        query = select(Feedback).where(Feedback.ts >= cutoff_date)

        if profile_id:
            query = query.where(Feedback.profile_id == profile_id)

        result = await self.session.execute(query)
        feedbacks = list(result.scalars().all())

        # Compute stats
        stats = {
            "total_feedback": len(feedbacks),
            "by_action": {},
            "avg_weight": 0.0,
            "unique_profiles": len(set(f.profile_id for f in feedbacks)),
            "unique_products": len(set(f.product_id for f in feedbacks)),
        }

        for action in self.VALID_ACTIONS:
            action_feedbacks = [f for f in feedbacks if f.action == action]
            stats["by_action"][action] = len(action_feedbacks)

        if feedbacks:
            stats["avg_weight"] = sum(f.weight for f in feedbacks) / len(feedbacks)

        return stats

    async def extract_training_signals(
        self, profile_id: str, limit: int = 1000
    ) -> List[Dict[str, Any]]:
        """
        Extract training signals from feedback for a profile.

        Args:
            profile_id: Profile ID
            limit: Maximum number of signals

        Returns:
            List of training signals
        """
        query = (
            select(Feedback)
            .where(Feedback.profile_id == profile_id)
            .order_by(Feedback.ts.desc())
            .limit(limit)
        )

        result = await self.session.execute(query)
        feedbacks = list(result.scalars().all())

        signals = []
        for feedback in feedbacks:
            signal = {
                "profile_id": feedback.profile_id,
                "product_id": feedback.product_id,
                "action": feedback.action,
                "label": self._action_to_label(feedback.action),
                "weight": feedback.weight,
                "timestamp": feedback.ts.isoformat(),
                "context": feedback.context,
            }
            signals.append(signal)

        return signals

    @staticmethod
    def _action_to_label(action: str) -> int:
        """
        Convert feedback action to training label.

        Args:
            action: Feedback action

        Returns:
            Numeric label (-1, 0, or 1)
        """
        label_map = {
            "approve": 1,
            "similar_to": 1,
            "reject": -1,
            "replace_with": 0,  # Neutral - indicates search for alternative
        }
        return label_map.get(action, 0)


class LabelManager:
    """
    Manage product labels for teaching and categorization.
    """

    def __init__(self, session: AsyncSession):
        """
        Initialize label manager.

        Args:
            session: Database session
        """
        self.session = session

    async def add_label(
        self,
        product_id: str,
        code: str,
        weight: float = 1.0,
        source: str = "designer",
        actor_id: Optional[str] = None,
    ) -> Label:
        """
        Add a label to a product.

        Args:
            product_id: Product ID
            code: Label code (e.g., "mid_century", "scandinavian")
            weight: Label weight
            source: Label source (designer, ml, import)
            actor_id: ID of the actor who added the label

        Returns:
            Created label
        """
        label = Label(
            product_id=product_id,
            code=code,
            weight=weight,
            source=source,
            actor_id=actor_id,
        )

        self.session.add(label)
        await self.session.commit()
        await self.session.refresh(label)

        return label

    async def add_labels_batch(
        self, labels_data: List[Dict[str, Any]]
    ) -> List[Label]:
        """
        Add multiple labels in batch.

        Args:
            labels_data: List of label data dictionaries

        Returns:
            List of created labels
        """
        labels = []

        for data in labels_data:
            label = Label(
                product_id=data["product_id"],
                code=data["code"],
                weight=data.get("weight", 1.0),
                source=data.get("source", "designer"),
                actor_id=data.get("actor_id"),
            )
            labels.append(label)

        self.session.add_all(labels)
        await self.session.commit()

        for label in labels:
            await self.session.refresh(label)

        return labels

    async def get_product_labels(self, product_id: str) -> List[Label]:
        """
        Get all labels for a product.

        Args:
            product_id: Product ID

        Returns:
            List of labels
        """
        query = select(Label).where(Label.product_id == product_id)

        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def get_labels_by_code(self, code: str, limit: int = 100) -> List[Label]:
        """
        Get all products with a specific label.

        Args:
            code: Label code
            limit: Maximum number of results

        Returns:
            List of labels
        """
        query = select(Label).where(Label.code == code).limit(limit)

        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def delete_label(self, label_id: str) -> bool:
        """
        Delete a label.

        Args:
            label_id: Label ID

        Returns:
            True if deleted, False if not found
        """
        query = select(Label).where(Label.id == label_id)
        result = await self.session.execute(query)
        label = result.scalar_one_or_none()

        if not label:
            return False

        await self.session.delete(label)
        await self.session.commit()

        return True

    async def get_label_stats(self) -> Dict[str, Any]:
        """
        Get label statistics.

        Returns:
            Statistics dictionary
        """
        query = select(Label)
        result = await self.session.execute(query)
        labels = list(result.scalars().all())

        # Count by code
        code_counts = {}
        source_counts = {}

        for label in labels:
            code_counts[label.code] = code_counts.get(label.code, 0) + 1
            source_counts[label.source] = source_counts.get(label.source, 0) + 1

        # Top labels
        top_labels = sorted(code_counts.items(), key=lambda x: x[1], reverse=True)[:20]

        return {
            "total_labels": len(labels),
            "unique_codes": len(code_counts),
            "unique_products": len(set(l.product_id for l in labels)),
            "by_source": source_counts,
            "top_labels": dict(top_labels),
        }
