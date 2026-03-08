"""
MMR (Maximal Marginal Relevance) diversification for recommendations.
Ensures diverse results across brands, categories, colors, and price bands.
"""
from typing import Any, Dict, List, Set

import numpy as np


class MMRDiversifier:
    """
    Maximal Marginal Relevance diversification.
    Balances relevance with diversity to avoid redundant recommendations.
    """

    def __init__(
        self,
        lambda_param: float = 0.8,
        diversity_features: List[str] = None,
        max_per_feature: Dict[str, int] = None,
    ):
        """
        Initialize MMR diversifier.

        Args:
            lambda_param: Balance between relevance and diversity (0-1)
                         Higher = more relevance, Lower = more diversity
            diversity_features: Features to diversify on
            max_per_feature: Maximum items per feature value
        """
        self.lambda_param = lambda_param
        self.diversity_features = diversity_features or [
            "brand",
            "primaryColor",
            "subcategory",
            "priceBand",
        ]
        self.max_per_feature = max_per_feature or {
            "brand": 3,
            "subcategory": 4,
            "primaryColor": 5,
            "priceBand": 6,
        }

    def diversify(
        self,
        candidates: List[Dict[str, Any]],
        limit: int = 20,
        embeddings: Dict[str, np.ndarray] = None,
    ) -> List[Dict[str, Any]]:
        """
        Apply MMR diversification to candidates.

        Args:
            candidates: Scored candidate products
            limit: Number of items to select
            embeddings: Optional embeddings for similarity computation

        Returns:
            Diversified list of products
        """
        if not candidates:
            return []

        if len(candidates) <= limit:
            return candidates

        # Track selected items and their features
        selected = []
        selected_indices = set()
        feature_counts = {feat: {} for feat in self.diversity_features}

        # Always select the top item first
        selected.append(candidates[0])
        selected_indices.add(0)
        self._update_feature_counts(candidates[0], feature_counts)

        # Iteratively select items balancing relevance and diversity
        while len(selected) < limit and len(selected_indices) < len(candidates):
            best_idx = None
            best_score = -float("inf")

            for idx, candidate in enumerate(candidates):
                if idx in selected_indices:
                    continue

                # Check feature constraints
                if not self._check_feature_constraints(candidate, feature_counts):
                    continue

                # Compute MMR score
                relevance_score = candidate.get("score", 0.0)

                # Diversity score (based on feature similarity to selected items)
                diversity_score = self._compute_diversity_score(
                    candidate, selected, embeddings
                )

                # MMR score
                mmr_score = (
                    self.lambda_param * relevance_score
                    + (1 - self.lambda_param) * diversity_score
                )

                if mmr_score > best_score:
                    best_score = mmr_score
                    best_idx = idx

            # If no valid candidate found (all constraints violated), break
            if best_idx is None:
                break

            # Add to selected
            selected.append(candidates[best_idx])
            selected_indices.add(best_idx)
            self._update_feature_counts(candidates[best_idx], feature_counts)

        return selected

    def _check_feature_constraints(
        self, candidate: Dict[str, Any], feature_counts: Dict[str, Dict[str, int]]
    ) -> bool:
        """
        Check if candidate violates diversity constraints.

        Args:
            candidate: Candidate product
            feature_counts: Current feature counts

        Returns:
            True if constraints are satisfied
        """
        for feature in self.diversity_features:
            value = candidate.get(feature)
            if value is None:
                continue

            max_count = self.max_per_feature.get(feature, float("inf"))
            current_count = feature_counts[feature].get(value, 0)

            if current_count >= max_count:
                return False

        return True

    def _update_feature_counts(
        self, product: Dict[str, Any], feature_counts: Dict[str, Dict[str, int]]
    ):
        """
        Update feature counts after selecting a product.

        Args:
            product: Selected product
            feature_counts: Feature counts to update
        """
        for feature in self.diversity_features:
            value = product.get(feature)
            if value is not None:
                feature_counts[feature][value] = (
                    feature_counts[feature].get(value, 0) + 1
                )

    def _compute_diversity_score(
        self,
        candidate: Dict[str, Any],
        selected: List[Dict[str, Any]],
        embeddings: Dict[str, np.ndarray] = None,
    ) -> float:
        """
        Compute diversity score for a candidate.

        Args:
            candidate: Candidate product
            selected: Already selected products
            embeddings: Optional embeddings for similarity

        Returns:
            Diversity score (higher = more diverse)
        """
        if not selected:
            return 1.0

        # Feature-based diversity
        feature_diversity = self._feature_diversity(candidate, selected)

        # Embedding-based diversity (if available)
        if embeddings and candidate["product_id"] in embeddings:
            embedding_diversity = self._embedding_diversity(
                candidate, selected, embeddings
            )
            # Combine both
            return 0.6 * feature_diversity + 0.4 * embedding_diversity

        return feature_diversity

    def _feature_diversity(
        self, candidate: Dict[str, Any], selected: List[Dict[str, Any]]
    ) -> float:
        """
        Compute feature-based diversity.

        Args:
            candidate: Candidate product
            selected: Selected products

        Returns:
            Feature diversity score
        """
        diversity_scores = []

        for feature in self.diversity_features:
            candidate_value = candidate.get(feature)
            if candidate_value is None:
                continue

            # Count how many selected items share this feature value
            matches = sum(
                1 for item in selected if item.get(feature) == candidate_value
            )

            # Diversity is higher when fewer matches
            diversity = 1.0 - (matches / len(selected))
            diversity_scores.append(diversity)

        return np.mean(diversity_scores) if diversity_scores else 0.5

    def _embedding_diversity(
        self,
        candidate: Dict[str, Any],
        selected: List[Dict[str, Any]],
        embeddings: Dict[str, np.ndarray],
    ) -> float:
        """
        Compute embedding-based diversity (minimum similarity).

        Args:
            candidate: Candidate product
            selected: Selected products
            embeddings: Product embeddings

        Returns:
            Embedding diversity score
        """
        candidate_emb = embeddings.get(candidate["product_id"])
        if candidate_emb is None:
            return 0.5

        similarities = []
        for item in selected:
            item_emb = embeddings.get(item["product_id"])
            if item_emb is not None:
                sim = np.dot(candidate_emb, item_emb) / (
                    np.linalg.norm(candidate_emb) * np.linalg.norm(item_emb)
                )
                similarities.append(sim)

        if not similarities:
            return 0.5

        # Diversity is 1 - maximum similarity
        max_similarity = max(similarities)
        return 1.0 - max_similarity


class ConstraintFilter:
    """
    Hard and soft constraint filtering for candidates.
    """

    @staticmethod
    def apply_hard_filters(
        candidates: List[Dict[str, Any]], profile: Dict[str, Any], context: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """
        Apply hard constraint filters.

        Args:
            candidates: Candidate products
            profile: User profile
            context: Context information

        Returns:
            Filtered candidates
        """
        filtered = []

        blocked_materials = set(profile.get("blockedMaterials", []))
        strict_size = context.get("strictSize", False)

        for candidate in candidates:
            # Blocked materials
            product_materials = set(candidate.get("materials", []))
            if blocked_materials & product_materials:
                continue

            # Discontinued products
            if candidate.get("isDiscontinued", False):
                continue

            # License expired
            if candidate.get("licenseExpired", False):
                continue

            # Size constraints (if strict)
            if strict_size:
                room_type = context.get("room")
                if room_type:
                    product_dims = candidate.get("dimensions", {})
                    room_dims = profile.get("roomDimensions", {}).get(room_type, {})

                    if product_dims and room_dims:
                        if (
                            product_dims.get("width", 0) > room_dims.get("width", float("inf"))
                            or product_dims.get("depth", 0) > room_dims.get("depth", float("inf"))
                            or product_dims.get("height", 0) > room_dims.get("height", float("inf"))
                        ):
                            continue

            # Banned vendors
            banned_vendors = set(profile.get("bannedVendors", []))
            if candidate.get("vendor") in banned_vendors:
                continue

            filtered.append(candidate)

        return filtered

    @staticmethod
    def deduplicate(
        candidates: List[Dict[str, Any]], key: str = "product_id"
    ) -> List[Dict[str, Any]]:
        """
        Remove duplicate products.

        Args:
            candidates: Candidate products
            key: Key to use for deduplication

        Returns:
            Deduplicated candidates
        """
        seen = set()
        deduped = []

        for candidate in candidates:
            item_key = candidate.get(key)
            if item_key not in seen:
                seen.add(item_key)
                deduped.append(candidate)

        return deduped
