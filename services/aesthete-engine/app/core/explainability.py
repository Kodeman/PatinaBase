"""
Explainability module for recommendation transparency.
Generates human-readable and machine-readable explanations.
"""
from typing import Any, Dict, List, Optional


class ExplainabilityEngine:
    """
    Generate explanations for recommendations.
    Provides both technical feature contributions and human-readable reasons.
    """

    # Human-readable templates
    REASON_TEMPLATES = {
        "vec_sim": {
            "high": "Strong style match with your {facets} preferences",
            "medium": "Good style alignment with your profile",
            "low": "Partial style match",
        },
        "price_fit": {
            "perfect": "Within your comfort budget range",
            "good": "Within your acceptable budget",
            "low": "Outside your typical budget range",
        },
        "size_fit": {
            "perfect": "Perfect fit for your {room} space",
            "good": "Good fit for your {room}",
            "poor": "May be challenging to fit in {room}",
        },
        "rule_boost": {
            "positive": "Recommended by your designer",
            "negative": "Deprioritized per designer preferences",
        },
        "popularity": {
            "high": "Popular choice among similar profiles",
            "medium": "Well-regarded by customers",
        },
        "freshness": {
            "new": "Recently added to catalog",
            "classic": "Established product",
        },
        "material": {
            "match": "Features preferred {material} finish",
            "avoid": "Contains materials you typically avoid",
        },
    }

    @staticmethod
    def generate_explanation(
        product: Dict[str, Any],
        score_breakdown: Dict[str, float],
        raw_signals: Dict[str, float],
        profile: Dict[str, Any],
        context: Dict[str, Any],
        rules_applied: List[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Generate comprehensive explanation for a recommendation.

        Args:
            product: Product data
            score_breakdown: Weighted score contributions
            raw_signals: Raw signal values
            profile: User profile
            context: Context information
            rules_applied: List of rules that affected this product

        Returns:
            Explanation with technical and human-readable components
        """
        # Sort contributions by absolute value
        contributions = [
            {"type": k, "weight": v, "percentage": 0.0}
            for k, v in score_breakdown.items()
        ]

        total_positive = sum(c["weight"] for c in contributions if c["weight"] > 0)

        # Calculate percentages
        for contrib in contributions:
            if total_positive > 0 and contrib["weight"] > 0:
                contrib["percentage"] = (contrib["weight"] / total_positive) * 100

        contributions.sort(key=lambda x: abs(x["weight"]), reverse=True)

        # Generate human-readable reasons
        reasons = ExplainabilityEngine._generate_reasons(
            contributions, raw_signals, product, profile, context
        )

        # Build rule explanations
        rule_explanations = []
        if rules_applied:
            for rule in rules_applied:
                rule_explanations.append(
                    {
                        "rule_id": rule.get("id"),
                        "effect": rule.get("effect"),
                        "weight": rule.get("weight"),
                        "reason": rule.get("description", "Designer preference"),
                    }
                )

        # Constraint notes
        constraints = ExplainabilityEngine._check_constraints(product, profile, context)

        return {
            "product_id": product["product_id"],
            "total_score": product.get("score", 0.0),
            "contributions": contributions,
            "reasons": reasons,
            "rules": rule_explanations,
            "constraints": constraints,
            "metadata": {
                "profile_id": profile.get("id"),
                "context": context,
                "model_version": product.get("model_version"),
            },
        }

    @staticmethod
    def _generate_reasons(
        contributions: List[Dict[str, Any]],
        raw_signals: Dict[str, float],
        product: Dict[str, Any],
        profile: Dict[str, Any],
        context: Dict[str, Any],
    ) -> List[str]:
        """Generate human-readable reasons."""
        reasons = []

        # Top 3-4 contributing factors
        for contrib in contributions[:4]:
            contrib_type = contrib["type"]
            weight = contrib["weight"]
            percentage = contrib["percentage"]

            if weight <= 0 or percentage < 5:  # Skip low contributions
                continue

            if contrib_type == "vec_sim":
                signal = raw_signals.get("vec_sim", 0.0)
                if signal > 0.7:
                    # Extract top facets from profile
                    facets = ExplainabilityEngine._get_top_facets(profile)
                    reasons.append(
                        ExplainabilityEngine.REASON_TEMPLATES["vec_sim"][
                            "high"
                        ].format(facets=facets)
                    )
                elif signal > 0.4:
                    reasons.append(
                        ExplainabilityEngine.REASON_TEMPLATES["vec_sim"]["medium"]
                    )

            elif contrib_type == "price_fit":
                signal = raw_signals.get("price_fit", 0.0)
                if signal >= 1.0:
                    reasons.append(
                        ExplainabilityEngine.REASON_TEMPLATES["price_fit"]["perfect"]
                    )
                elif signal >= 0.5:
                    reasons.append(
                        ExplainabilityEngine.REASON_TEMPLATES["price_fit"]["good"]
                    )

            elif contrib_type == "size_fit":
                signal = raw_signals.get("size_fit", 0.0)
                room = context.get("room", "your space")
                if signal >= 0.8:
                    reasons.append(
                        ExplainabilityEngine.REASON_TEMPLATES["size_fit"][
                            "perfect"
                        ].format(room=room)
                    )
                elif signal >= 0.5:
                    reasons.append(
                        ExplainabilityEngine.REASON_TEMPLATES["size_fit"]["good"].format(
                            room=room
                        )
                    )

            elif contrib_type == "rule_boost":
                if weight > 0:
                    reasons.append(
                        ExplainabilityEngine.REASON_TEMPLATES["rule_boost"]["positive"]
                    )

            elif contrib_type == "popularity":
                signal = raw_signals.get("popularity", 0.0)
                if signal > 0.6:
                    reasons.append(
                        ExplainabilityEngine.REASON_TEMPLATES["popularity"]["high"]
                    )

            elif contrib_type == "freshness":
                signal = raw_signals.get("freshness", 0.0)
                if signal > 0.8:
                    reasons.append(
                        ExplainabilityEngine.REASON_TEMPLATES["freshness"]["new"]
                    )

        # Material preferences
        materials = product.get("materials", [])
        preferred_materials = profile.get("preferredMaterials", [])

        for material in materials:
            if material in preferred_materials:
                reasons.append(
                    ExplainabilityEngine.REASON_TEMPLATES["material"]["match"].format(
                        material=material
                    )
                )
                break

        # Stock status
        if product.get("stockStatus") == "in_stock":
            reasons.append("Currently in stock and ready to ship")

        return reasons

    @staticmethod
    def _get_top_facets(profile: Dict[str, Any]) -> str:
        """Extract top style facets from profile."""
        facets = []

        # Look for style facets in profile
        style_facets = profile.get("styleFacets", {})

        # Get top 2 facets
        sorted_facets = sorted(
            style_facets.items(), key=lambda x: x[1], reverse=True
        )[:2]

        facets = [facet[0].replace("_", " ").title() for facet in sorted_facets]

        if not facets:
            return "style preferences"

        return " & ".join(facets)

    @staticmethod
    def _check_constraints(
        product: Dict[str, Any], profile: Dict[str, Any], context: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """Check and document constraint satisfaction."""
        constraints = []

        # Budget constraint
        price = product.get("price", 0)
        budget_band = profile.get("budgetBand", {})
        min_budget = budget_band.get("min", 0)
        max_budget = budget_band.get("max", float("inf"))

        if min_budget <= price <= max_budget:
            constraints.append(
                {
                    "type": "budget",
                    "satisfied": True,
                    "note": f"Within budget range (${min_budget}-${max_budget})",
                }
            )
        else:
            constraints.append(
                {
                    "type": "budget",
                    "satisfied": False,
                    "note": f"Outside budget range (${price} vs ${min_budget}-${max_budget})",
                }
            )

        # Material constraint
        blocked_materials = set(profile.get("blockedMaterials", []))
        product_materials = set(product.get("materials", []))

        if blocked_materials & product_materials:
            constraints.append(
                {
                    "type": "materials",
                    "satisfied": False,
                    "note": f"Contains blocked material: {blocked_materials & product_materials}",
                }
            )
        else:
            constraints.append(
                {"type": "materials", "satisfied": True, "note": "No blocked materials"}
            )

        # Availability
        stock_status = product.get("stockStatus", "unknown")
        constraints.append(
            {
                "type": "availability",
                "satisfied": stock_status == "in_stock",
                "note": f"Stock status: {stock_status}",
            }
        )

        # Lead time
        lead_time_days = product.get("leadTimeDays", 0)
        lead_time_tolerance = context.get("leadTimeTolerance", "medium")

        max_acceptable = {"low": 7, "medium": 21, "high": 60}.get(
            lead_time_tolerance, 21
        )

        constraints.append(
            {
                "type": "lead_time",
                "satisfied": lead_time_days <= max_acceptable,
                "note": f"{lead_time_days} days (tolerance: {lead_time_tolerance})",
            }
        )

        return constraints

    @staticmethod
    def generate_batch_explanations(
        products: List[Dict[str, Any]],
        profile: Dict[str, Any],
        context: Dict[str, Any],
        rules_map: Optional[Dict[str, List[Dict[str, Any]]]] = None,
    ) -> List[Dict[str, Any]]:
        """
        Generate explanations for multiple products.

        Args:
            products: List of scored products
            profile: User profile
            context: Context information
            rules_map: Map of product_id to applied rules

        Returns:
            List of explanations
        """
        rules_map = rules_map or {}
        explanations = []

        for product in products:
            product_id = product["product_id"]
            explanation = ExplainabilityEngine.generate_explanation(
                product=product,
                score_breakdown=product.get("score_breakdown", {}),
                raw_signals=product.get("raw_signals", {}),
                profile=profile,
                context=context,
                rules_applied=rules_map.get(product_id, []),
            )
            explanations.append(explanation)

        return explanations
