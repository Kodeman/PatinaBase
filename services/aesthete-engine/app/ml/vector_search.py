"""
Vector similarity search using pgvector.
Provides ANN (Approximate Nearest Neighbors) search capabilities.
"""
from typing import Dict, List, Optional, Tuple

import numpy as np
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings

settings = get_settings()


class VectorSearchEngine:
    """
    Vector search engine using pgvector PostgreSQL extension.
    Provides efficient similarity search with HNSW indexing.
    """

    def __init__(self, session: AsyncSession):
        """
        Initialize vector search engine.

        Args:
            session: Database session
        """
        self.session = session

    async def search_similar(
        self,
        query_vector: np.ndarray,
        top_k: int = 100,
        model_name: Optional[str] = None,
        filters: Optional[Dict] = None,
    ) -> List[Dict]:
        """
        Search for similar products using cosine similarity.

        Args:
            query_vector: Query embedding vector
            top_k: Number of results to return
            model_name: Filter by specific model name
            filters: Additional filters (product_id, variant_id, etc.)

        Returns:
            List of results with product_id, similarity score, and metadata
        """
        # Convert numpy array to PostgreSQL vector format
        vector_str = "[" + ",".join(map(str, query_vector.tolist())) + "]"

        # Build query with pgvector cosine similarity
        query = """
            SELECT
                product_id,
                variant_id,
                model_name,
                1 - (vector <=> :query_vector::vector) as similarity
            FROM embeddings
            WHERE 1=1
        """

        params = {"query_vector": vector_str, "top_k": top_k}

        # Add model filter
        if model_name:
            query += " AND model_name = :model_name"
            params["model_name"] = model_name

        # Add product filter
        if filters and "product_ids" in filters:
            query += " AND product_id = ANY(:product_ids)"
            params["product_ids"] = filters["product_ids"]

        # Order by similarity and limit
        query += """
            ORDER BY vector <=> :query_vector::vector
            LIMIT :top_k
        """

        result = await self.session.execute(text(query), params)
        rows = result.fetchall()

        return [
            {
                "product_id": row[0],
                "variant_id": row[1],
                "model_name": row[2],
                "similarity": float(row[3]),
                "source": "vec",
            }
            for row in rows
        ]

    async def search_by_product(
        self, product_id: str, top_k: int = 20, exclude_self: bool = True
    ) -> List[Dict]:
        """
        Find similar products to a given product.

        Args:
            product_id: Reference product ID
            top_k: Number of results to return
            exclude_self: Whether to exclude the reference product

        Returns:
            List of similar products
        """
        # Get the product's embedding
        query = """
            SELECT vector
            FROM embeddings
            WHERE product_id = :product_id
            LIMIT 1
        """

        result = await self.session.execute(text(query), {"product_id": product_id})
        row = result.fetchone()

        if not row:
            return []

        # Convert vector back to numpy array (assuming stored as binary)
        query_vector = np.frombuffer(row[0], dtype=np.float32)

        # Search for similar products
        results = await self.search_similar(query_vector, top_k=top_k + 1)

        # Exclude the product itself if requested
        if exclude_self:
            results = [r for r in results if r["product_id"] != product_id]

        return results[:top_k]

    async def batch_search(
        self, query_vectors: List[np.ndarray], top_k: int = 100
    ) -> List[List[Dict]]:
        """
        Perform batch similarity search.

        Args:
            query_vectors: List of query vectors
            top_k: Number of results per query

        Returns:
            List of result lists (one per query)
        """
        results = []
        for query_vector in query_vectors:
            result = await self.search_similar(query_vector, top_k=top_k)
            results.append(result)
        return results

    async def create_index(
        self,
        m: int = 16,
        ef_construction: int = 200,
        index_name: str = "embeddings_hnsw_idx",
    ):
        """
        Create HNSW index for fast similarity search.

        Args:
            m: Number of connections per layer (HNSW parameter)
            ef_construction: Size of dynamic candidate list (HNSW parameter)
            index_name: Name of the index
        """
        query = f"""
            CREATE INDEX IF NOT EXISTS {index_name}
            ON embeddings
            USING hnsw (vector vector_cosine_ops)
            WITH (m = {m}, ef_construction = {ef_construction})
        """

        await self.session.execute(text(query))
        await self.session.commit()

    async def set_query_ef(self, ef_search: int = 64):
        """
        Set the ef_search parameter for queries.
        Higher values = better recall but slower.

        Args:
            ef_search: Size of dynamic candidate list for search
        """
        query = f"SET hnsw.ef_search = {ef_search}"
        await self.session.execute(text(query))

    async def get_embedding_stats(self) -> Dict:
        """
        Get statistics about embeddings in the database.

        Returns:
            Statistics dictionary
        """
        query = """
            SELECT
                COUNT(*) as total_embeddings,
                COUNT(DISTINCT product_id) as unique_products,
                COUNT(DISTINCT model_name) as num_models,
                model_name,
                COUNT(*) as count_per_model
            FROM embeddings
            GROUP BY model_name
        """

        result = await self.session.execute(text(query))
        rows = result.fetchall()

        stats = {
            "total_embeddings": 0,
            "unique_products": 0,
            "models": {},
        }

        if rows:
            stats["total_embeddings"] = rows[0][0]
            stats["unique_products"] = rows[0][1]

            for row in rows:
                model_name = row[3]
                count = row[4]
                stats["models"][model_name] = count

        return stats


class HybridSearchEngine:
    """
    Hybrid search combining vector similarity and lexical search.
    """

    def __init__(
        self, vector_engine: VectorSearchEngine, opensearch_client=None
    ):
        """
        Initialize hybrid search engine.

        Args:
            vector_engine: Vector search engine
            opensearch_client: OpenSearch client (optional)
        """
        self.vector_engine = vector_engine
        self.opensearch_client = opensearch_client

    async def hybrid_search(
        self,
        query_vector: Optional[np.ndarray] = None,
        query_text: Optional[str] = None,
        top_k_vec: int = 500,
        top_k_lex: int = 300,
        vector_weight: float = 0.7,
        text_weight: float = 0.3,
    ) -> Tuple[List[Dict], Dict]:
        """
        Perform hybrid search combining vector and lexical retrieval.

        Args:
            query_vector: Query embedding (for vector search)
            query_text: Query text (for lexical search)
            top_k_vec: Number of vector results
            top_k_lex: Number of lexical results
            vector_weight: Weight for vector similarity
            text_weight: Weight for text relevance

        Returns:
            Tuple of (combined results, metadata)
        """
        results = []
        sources = {"vec": 0, "lex": 0, "both": 0}

        # Vector search
        vec_results = {}
        if query_vector is not None:
            vec_results_list = await self.vector_engine.search_similar(
                query_vector, top_k=top_k_vec
            )
            vec_results = {r["product_id"]: r for r in vec_results_list}
            sources["vec"] = len(vec_results_list)

        # Lexical search (OpenSearch)
        lex_results = {}
        if query_text and self.opensearch_client:
            lex_results_list = await self._opensearch_query(query_text, top_k_lex)
            lex_results = {r["product_id"]: r for r in lex_results_list}
            sources["lex"] = len(lex_results_list)

        # Combine results
        all_product_ids = set(vec_results.keys()) | set(lex_results.keys())

        for product_id in all_product_ids:
            vec_score = vec_results.get(product_id, {}).get("similarity", 0.0)
            lex_score = lex_results.get(product_id, {}).get("score", 0.0)

            # Normalize and combine scores
            combined_score = vector_weight * vec_score + text_weight * lex_score

            result = {
                "product_id": product_id,
                "score": combined_score,
                "vec_score": vec_score,
                "lex_score": lex_score,
                "sources": [],
            }

            if product_id in vec_results:
                result["sources"].append("vec")
            if product_id in lex_results:
                result["sources"].append("lex")

            if len(result["sources"]) == 2:
                sources["both"] += 1

            results.append(result)

        # Sort by combined score
        results.sort(key=lambda x: x["score"], reverse=True)

        metadata = {
            "total_results": len(results),
            "sources": sources,
            "weights": {"vector": vector_weight, "text": text_weight},
        }

        return results, metadata

    async def _opensearch_query(
        self, query_text: str, top_k: int = 300
    ) -> List[Dict]:
        """
        Query OpenSearch for lexical results.

        Args:
            query_text: Search query
            top_k: Number of results

        Returns:
            List of results with scores
        """
        if not self.opensearch_client:
            return []

        # Placeholder for OpenSearch implementation
        # In production, implement actual OpenSearch queries
        return []
