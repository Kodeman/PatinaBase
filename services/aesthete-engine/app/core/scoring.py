"""
Hybrid scoring and re-ranking logic for recommendations.
Implements the scoring function from the PRD.
"""
from typing import Any, Dict, List, Optional

import numpy as np

from app.config import get_settings

settings = get_settings()


class HybridScorer:
    """
    Hybrid scoring engine that combines multiple signals:
    - Vector similarity
    - Text relevance
    - Price fit
    - Size fit
    - Rule boosts/penalties
    - Popularity
    - Freshness
    """

    def __init__(
        self,
        w_vec: float = None,
        w_text: float = None,
        w_price: float = None,
        w_size: float = None,
        w_rules: float = None,
        w_pop: float = None,
        w_new: float = None,
        w_penalty: float = None,
    ):
        """
        Initialize scorer with weights.

        Args:
            w_vec: Weight for vector similarity
            w_text: Weight for text relevance
            w_price: Weight for price fit
            w_size: Weight for size fit
            w_rules: Weight for rule effects
            w_pop: Weight for popularity
            w_new: Weight for freshness
            w_penalty: Weight for penalties
        """
        self.w_vec = w_vec or settings.weight_vec
        self.w_text = w_text or settings.weight_text
        self.w_price = w_price or settings.weight_price
        self.w_size = w_size or settings.weight_size
        self.w_rules = w_rules or settings.weight_rules
        self.w_pop = w_pop or settings.weight_pop
        self.w_new = w_new or settings.weight_new
        self.w_penalty = w_penalty or settings.weight_penalty

    def score_product(
        self,
        product: Dict[str, Any],
        profile: Dict[str, Any],
        context: Dict[str, Any],
        rule_effect: float = 0.0,
    ) -> Dict[str, Any]:
        """
        Score a single product.

        Args:
            product: Product data with signals
            profile: User profile with preferences and constraints
            context: Context information (room, slot, etc.)
            rule_effect: Cumulative rule effect (-1.0 to 1.0)

        Returns:
            Scored product with breakdown
        """
        # Vector similarity (already computed)
        sim_score = product.get("vec_score", product.get("similarity", 0.0))

        # Text relevance (from lexical search)
        lex_score = product.get("lex_score", 0.0)

        # Price fit
        price_fit = self._compute_price_fit(product, profile)

        # Size fit
        size_fit = self._compute_size_fit(product, profile, context)

        # Popularity score
        popularity = self._compute_popularity(product)

        # Freshness score
        freshness = self._compute_freshness(product)

        # Penalties (violations)
        violations = self._compute_violations(product, profile, context)

        # Combined score
        total_score = (
            self.w_vec * sim_score
            + self.w_text * lex_score
            + self.w_price * price_fit
            + self.w_size * size_fit
            + self.w_rules * rule_effect
            + self.w_pop * popularity
            + self.w_new * freshness
            - self.w_penalty * violations
        )

        return {
            **product,
            "score": total_score,
            "score_breakdown": {
                "vec_sim": sim_score * self.w_vec,
                "text_rel": lex_score * self.w_text,
                "price_fit": price_fit * self.w_price,
                "size_fit": size_fit * self.w_size,
                "rule_boost": rule_effect * self.w_rules,
                "popularity": popularity * self.w_pop,
                "freshness": freshness * self.w_new,
                "penalties": violations * self.w_penalty,
            },
            "raw_signals": {
                "vec_sim": sim_score,
                "lex_score": lex_score,
                "price_fit": price_fit,
                "size_fit": size_fit,
                "rule_effect": rule_effect,
                "popularity": popularity,
                "freshness": freshness,
                "violations": violations,
            },
        }

    def score_batch(
        self,
        products: List[Dict[str, Any]],
        profile: Dict[str, Any],
        context: Dict[str, Any],
        rule_effects: Optional[Dict[str, float]] = None,
    ) -> List[Dict[str, Any]]:
        """
        Score a batch of products.

        Args:
            products: List of product data
            profile: User profile
            context: Context information
            rule_effects: Map of product_id to rule effect

        Returns:
            Scored and sorted products
        """
        rule_effects = rule_effects or {}
        scored = []

        for product in products:
            product_id = product["product_id"]
            rule_effect = rule_effects.get(product_id, 0.0)
            scored_product = self.score_product(product, profile, context, rule_effect)
            scored.append(scored_product)

        # Sort by score descending
        scored.sort(key=lambda x: x["score"], reverse=True)

        return scored

    def _compute_price_fit(
        self, product: Dict[str, Any], profile: Dict[str, Any]
    ) -> float:
        """
        Compute how well the product price fits the budget.

        Args:
            product: Product data
            profile: User profile with budget constraints

        Returns:
            Price fit score (0.0 to 1.0)
        """
        price = product.get("price", 0)
        budget_band = profile.get("budgetBand", {})

        min_budget = budget_band.get("min", 0)
        max_budget = budget_band.get("max", float("inf"))
        comfort_min = budget_band.get("comfortMin", min_budget)
        comfort_max = budget_band.get("comfortMax", max_budget)

        # Perfect fit in comfort zone
        if comfort_min <= price <= comfort_max:
            return 1.0

        # Acceptable fit in broader budget
        if min_budget <= price <= max_budget:
            # Linear decay from comfort zone
            if price < comfort_min:
                return 0.5 + 0.5 * (price - min_budget) / (comfort_min - min_budget)
            else:
                return 0.5 + 0.5 * (max_budget - price) / (max_budget - comfort_max)

        # Outside budget
        if price < min_budget:
            # Too cheap might indicate quality concerns
            return 0.3
        else:
            # Too expensive
            return 0.0

    def _compute_size_fit(
        self, product: Dict[str, Any], profile: Dict[str, Any], context: Dict[str, Any]
    ) -> float:
        """
        Compute how well the product size fits the space.

        Args:
            product: Product data
            profile: User profile
            context: Context with room information

        Returns:
            Size fit score (0.0 to 1.0)
        """
        room_type = context.get("room")
        strict_size = context.get("strictSize", False)

        if not room_type:
            return 1.0  # No size constraint

        product_dims = product.get("dimensions", {})
        room_dims = profile.get("roomDimensions", {}).get(room_type, {})

        if not product_dims or not room_dims:
            return 0.5  # Unknown dimensions

        # Check if product fits in room
        product_width = product_dims.get("width", 0)
        product_depth = product_dims.get("depth", 0)
        product_height = product_dims.get("height", 0)

        room_width = room_dims.get("width", float("inf"))
        room_depth = room_dims.get("depth", float("inf"))
        room_height = room_dims.get("height", float("inf"))

        # Check hard constraints
        if strict_size:
            if (
                product_width > room_width
                or product_depth > room_depth
                or product_height > room_height
            ):
                return 0.0

        # Compute utilization score (prefer reasonable space usage)
        width_ratio = product_width / room_width if room_width > 0 else 0
        depth_ratio = product_depth / room_depth if room_depth > 0 else 0

        # Optimal utilization is 30-60% of room dimension
        def utilization_score(ratio):
            if ratio < 0.2:
                return 0.5  # Too small
            elif ratio < 0.3:
                return 0.7 + (ratio - 0.2) * 3  # Ramp up
            elif ratio < 0.6:
                return 1.0  # Optimal
            elif ratio < 0.8:
                return 1.0 - (ratio - 0.6) * 2  # Ramp down
            else:
                return 0.3  # Too large

        return (utilization_score(width_ratio) + utilization_score(depth_ratio)) / 2

    def _compute_popularity(self, product: Dict[str, Any]) -> float:
        """
        Compute popularity score.

        Args:
            product: Product data

        Returns:
            Popularity score (0.0 to 1.0)
        """
        # Normalize view/save/purchase counts
        views = product.get("viewCount", 0)
        saves = product.get("saveCount", 0)
        purchases = product.get("purchaseCount", 0)

        # Weighted combination (purchases > saves > views)
        score = (purchases * 10 + saves * 3 + views) / 100

        # Apply log scaling to prevent extreme values
        return min(np.log1p(score) / np.log1p(1000), 1.0)

    def _compute_freshness(self, product: Dict[str, Any]) -> float:
        """
        Compute freshness/recency score.

        Args:
            product: Product data

        Returns:
            Freshness score (0.0 to 1.0)
        """
        from datetime import datetime, timedelta

        created_at = product.get("createdAt")
        if not created_at:
            return 0.5

        if isinstance(created_at, str):
            created_at = datetime.fromisoformat(created_at.replace("Z", "+00:00"))

        age_days = (datetime.now() - created_at.replace(tzinfo=None)).days

        # Exponential decay: new products get higher scores
        # Half-life of 30 days
        return np.exp(-age_days / 30)

    def _compute_violations(
        self, product: Dict[str, Any], profile: Dict[str, Any], context: Dict[str, Any]
    ) -> float:
        """
        Compute violation penalty score.

        Args:
            product: Product data
            profile: User profile
            context: Context information

        Returns:
            Violation penalty (0.0 to 1.0, higher = worse)
        """
        violations = 0.0

        # Out of stock
        if product.get("stockStatus") == "out_of_stock":
            violations += 0.5

        # Blocked materials
        blocked_materials = set(profile.get("blockedMaterials", []))
        product_materials = set(product.get("materials", []))
        if blocked_materials & product_materials:
            violations += 1.0  # Hard violation

        # Long lead time
        lead_time_days = product.get("leadTimeDays", 0)
        lead_time_tolerance = context.get("leadTimeTolerance", "medium")

        if lead_time_tolerance == "low" and lead_time_days > 7:
            violations += 0.3
        elif lead_time_tolerance == "medium" and lead_time_days > 21:
            violations += 0.3

        # Licensing/availability issues
        if product.get("isDiscontinued", False):
            violations += 1.0
        if product.get("licenseExpired", False):
            violations += 1.0

        return min(violations, 1.0)

    def get_weights(self) -> Dict[str, float]:
        """Get current weights."""
        return {
            "vec": self.w_vec,
            "text": self.w_text,
            "price": self.w_price,
            "size": self.w_size,
            "rules": self.w_rules,
            "pop": self.w_pop,
            "new": self.w_new,
            "penalty": self.w_penalty,
        }
