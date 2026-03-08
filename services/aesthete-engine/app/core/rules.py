"""
Rule engine for boost/bury/block operations.
Implements HITL (Human-in-the-Loop) teaching via designer rules.
"""
import json
from datetime import datetime
from typing import Any, Dict, List, Optional, Set

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Rule


class RuleEngine:
    """
    Rule engine for recommendation steering.
    Supports boost, bury, and block effects with scoping and priority.
    """

    VALID_EFFECTS = {"boost", "bury", "block"}
    VALID_SCOPES = {"global", "designer", "user", "collection", "category"}

    # Priority order (higher index = higher priority)
    SCOPE_PRIORITY = ["global", "category", "collection", "designer", "user"]

    def __init__(self, session: AsyncSession):
        """
        Initialize rule engine.

        Args:
            session: Database session
        """
        self.session = session
        self._rule_cache = {}
        self._cache_version = None

    async def get_applicable_rules(
        self,
        profile_id: Optional[str] = None,
        designer_id: Optional[str] = None,
        collection_id: Optional[str] = None,
        category: Optional[str] = None,
    ) -> List[Rule]:
        """
        Get all applicable rules for a context.

        Args:
            profile_id: User profile ID
            designer_id: Designer ID
            collection_id: Collection ID
            category: Product category

        Returns:
            List of applicable rules
        """
        query = select(Rule).where(
            and_(
                Rule.active == True,
                (Rule.start_at.is_(None)) | (Rule.start_at <= datetime.now()),
                (Rule.end_at.is_(None)) | (Rule.end_at >= datetime.now()),
            )
        )

        result = await self.session.execute(query)
        all_rules = result.scalars().all()

        # Filter rules by scope
        applicable = []

        for rule in all_rules:
            if self._is_rule_applicable(
                rule, profile_id, designer_id, collection_id, category
            ):
                applicable.append(rule)

        return applicable

    def _is_rule_applicable(
        self,
        rule: Rule,
        profile_id: Optional[str],
        designer_id: Optional[str],
        collection_id: Optional[str],
        category: Optional[str],
    ) -> bool:
        """Check if a rule applies to the given context."""
        scope = rule.scope

        if scope == "global":
            return True
        elif scope == "user" and profile_id:
            # Check if rule targets this user
            return rule.predicate.get("userId") == profile_id
        elif scope == "designer" and designer_id:
            return rule.predicate.get("designerId") == designer_id
        elif scope == "collection" and collection_id:
            return rule.predicate.get("collectionId") == collection_id
        elif scope == "category" and category:
            return rule.predicate.get("category") == category

        return False

    async def evaluate_rules(
        self,
        products: List[Dict[str, Any]],
        profile_id: Optional[str] = None,
        designer_id: Optional[str] = None,
        collection_id: Optional[str] = None,
        category: Optional[str] = None,
    ) -> Dict[str, float]:
        """
        Evaluate rules and compute effect for each product.

        Args:
            products: List of products to evaluate
            profile_id: User profile ID
            designer_id: Designer ID
            collection_id: Collection ID
            category: Product category

        Returns:
            Map of product_id to cumulative rule effect
        """
        # Get applicable rules
        rules = await self.get_applicable_rules(
            profile_id, designer_id, collection_id, category
        )

        # Initialize effects
        effects = {p["product_id"]: 0.0 for p in products}
        blocked_products = set()

        # Group rules by scope priority
        rules_by_scope = {}
        for rule in rules:
            if rule.scope not in rules_by_scope:
                rules_by_scope[rule.scope] = []
            rules_by_scope[rule.scope].append(rule)

        # Evaluate rules in priority order
        for scope in self.SCOPE_PRIORITY:
            if scope not in rules_by_scope:
                continue

            for rule in rules_by_scope[scope]:
                for product in products:
                    product_id = product["product_id"]

                    # Skip if already blocked
                    if product_id in blocked_products:
                        continue

                    # Check if rule matches product
                    if self._matches_predicate(product, rule.predicate):
                        if rule.effect == "block":
                            # Block overrides everything
                            blocked_products.add(product_id)
                            effects[product_id] = -999.0  # Sentinel value
                        elif rule.effect == "boost":
                            effects[product_id] += rule.weight
                        elif rule.effect == "bury":
                            effects[product_id] -= rule.weight

        # Clamp effects to [-1.0, 1.0] (excluding blocked)
        for product_id in effects:
            if effects[product_id] != -999.0:
                effects[product_id] = max(-1.0, min(1.0, effects[product_id]))

        return effects

    def _matches_predicate(
        self, product: Dict[str, Any], predicate: Dict[str, Any]
    ) -> bool:
        """
        Check if a product matches a rule predicate.

        Args:
            product: Product data
            predicate: Rule predicate (JSON logic)

        Returns:
            True if predicate matches
        """
        # Simple predicate evaluation (can be extended with json-logic-py)
        for key, condition in predicate.items():
            # Skip scope identifiers
            if key in ["userId", "designerId", "collectionId", "category"]:
                continue

            product_value = product.get(key)

            if isinstance(condition, dict):
                # Handle operators
                if "$in" in condition:
                    if product_value not in condition["$in"]:
                        return False
                elif "$eq" in condition:
                    if product_value != condition["$eq"]:
                        return False
                elif "$ne" in condition:
                    if product_value == condition["$ne"]:
                        return False
                elif "$gt" in condition:
                    if product_value <= condition["$gt"]:
                        return False
                elif "$lt" in condition:
                    if product_value >= condition["$lt"]:
                        return False
                elif "$gte" in condition:
                    if product_value < condition["$gte"]:
                        return False
                elif "$lte" in condition:
                    if product_value > condition["$lte"]:
                        return False
            else:
                # Direct equality
                if product_value != condition:
                    return False

        return True

    async def create_rule(
        self,
        scope: str,
        predicate: Dict[str, Any],
        effect: str,
        weight: float,
        created_by: str,
        start_at: Optional[datetime] = None,
        end_at: Optional[datetime] = None,
    ) -> Rule:
        """
        Create a new rule.

        Args:
            scope: Rule scope
            predicate: Matching predicate
            effect: Effect type
            weight: Effect weight
            created_by: Creator ID
            start_at: Optional start time
            end_at: Optional end time

        Returns:
            Created rule

        Raises:
            ValueError: If invalid parameters
        """
        # Validate
        if scope not in self.VALID_SCOPES:
            raise ValueError(f"Invalid scope: {scope}")
        if effect not in self.VALID_EFFECTS:
            raise ValueError(f"Invalid effect: {effect}")
        if not -1.0 <= weight <= 1.0:
            raise ValueError("Weight must be between -1.0 and 1.0")

        # Validate predicate doesn't use sensitive attributes
        self._validate_predicate(predicate)

        # Create rule
        rule = Rule(
            scope=scope,
            predicate=predicate,
            effect=effect,
            weight=weight,
            created_by=created_by,
            start_at=start_at,
            end_at=end_at,
            active=True,
        )

        self.session.add(rule)
        await self.session.commit()
        await self.session.refresh(rule)

        return rule

    async def update_rule(
        self, rule_id: str, updates: Dict[str, Any]
    ) -> Optional[Rule]:
        """
        Update an existing rule.

        Args:
            rule_id: Rule ID
            updates: Fields to update

        Returns:
            Updated rule or None if not found
        """
        query = select(Rule).where(Rule.id == rule_id)
        result = await self.session.execute(query)
        rule = result.scalar_one_or_none()

        if not rule:
            return None

        # Update fields
        for key, value in updates.items():
            if hasattr(rule, key):
                setattr(rule, key, value)

        await self.session.commit()
        await self.session.refresh(rule)

        return rule

    async def delete_rule(self, rule_id: str) -> bool:
        """
        Delete (deactivate) a rule.

        Args:
            rule_id: Rule ID

        Returns:
            True if deleted, False if not found
        """
        query = select(Rule).where(Rule.id == rule_id)
        result = await self.session.execute(query)
        rule = result.scalar_one_or_none()

        if not rule:
            return False

        rule.active = False
        await self.session.commit()

        return True

    def _validate_predicate(self, predicate: Dict[str, Any]):
        """
        Validate that predicate doesn't use sensitive attributes.

        Args:
            predicate: Predicate to validate

        Raises:
            ValueError: If predicate contains sensitive attributes
        """
        # Blacklist sensitive attributes
        sensitive_attrs = {
            "userId",
            "userName",
            "email",
            "location",
            "demographics",
            "ethnicity",
            "religion",
            "political",
        }

        for key in predicate.keys():
            if key in sensitive_attrs:
                raise ValueError(
                    f"Cannot create rule with sensitive attribute: {key}"
                )

    async def preview_rule_impact(
        self,
        predicate: Dict[str, Any],
        effect: str,
        weight: float,
        test_products: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """
        Preview the impact of a rule before creating it.

        Args:
            predicate: Rule predicate
            effect: Rule effect
            weight: Rule weight
            test_products: Products to test against

        Returns:
            Impact summary
        """
        affected = []
        unaffected = []

        for product in test_products:
            if self._matches_predicate(product, predicate):
                affected.append(product["product_id"])
            else:
                unaffected.append(product["product_id"])

        return {
            "total_products": len(test_products),
            "affected_count": len(affected),
            "affected_products": affected[:10],  # Sample
            "effect": effect,
            "weight": weight,
            "estimated_impact": len(affected) / len(test_products) if test_products else 0,
        }
