"""
Tests for embedding computation.
"""
import pytest
import numpy as np
from PIL import Image

from app.ml.embeddings import EmbeddingModel


@pytest.fixture
def embedding_model():
    """Create embedding model instance."""
    return EmbeddingModel(device="cpu")


@pytest.fixture
def sample_image():
    """Create sample image."""
    return Image.new("RGB", (224, 224), color="red")


class TestEmbeddingModel:
    """Test embedding model."""

    def test_encode_text(self, embedding_model):
        """Test text encoding."""
        text = "Modern walnut sofa with clean lines"
        embedding = embedding_model.encode_text(text)

        assert isinstance(embedding, np.ndarray)
        assert len(embedding.shape) == 1
        assert np.linalg.norm(embedding) == pytest.approx(1.0, abs=1e-5)

    def test_encode_image(self, embedding_model, sample_image):
        """Test image encoding."""
        embedding = embedding_model.encode_image(sample_image)

        assert isinstance(embedding, np.ndarray)
        assert len(embedding.shape) == 1
        assert np.linalg.norm(embedding) == pytest.approx(1.0, abs=1e-5)

    def test_encode_product_text_only(self, embedding_model):
        """Test product encoding with text only."""
        text = "Scandinavian oak chair"
        embedding = embedding_model.encode_product(text=text)

        assert isinstance(embedding, np.ndarray)
        assert np.linalg.norm(embedding) == pytest.approx(1.0, abs=1e-5)

    def test_encode_product_image_only(self, embedding_model, sample_image):
        """Test product encoding with image only."""
        embedding = embedding_model.encode_product(image=sample_image)

        assert isinstance(embedding, np.ndarray)
        assert np.linalg.norm(embedding) == pytest.approx(1.0, abs=1e-5)

    def test_encode_product_fusion(self, embedding_model, sample_image):
        """Test product encoding with image and text fusion."""
        text = "Modern design chair"
        embedding = embedding_model.encode_product(
            image=sample_image, text=text, alpha=0.6
        )

        assert isinstance(embedding, np.ndarray)
        assert np.linalg.norm(embedding) == pytest.approx(1.0, abs=1e-5)

    def test_encode_product_no_input_raises_error(self, embedding_model):
        """Test encoding without input raises error."""
        with pytest.raises(ValueError, match="At least one"):
            embedding_model.encode_product()

    def test_cosine_similarity(self):
        """Test cosine similarity calculation."""
        vec1 = np.array([1.0, 0.0, 0.0])
        vec2 = np.array([1.0, 0.0, 0.0])
        vec3 = np.array([0.0, 1.0, 0.0])

        sim_same = EmbeddingModel.cosine_similarity(vec1, vec2)
        sim_orthogonal = EmbeddingModel.cosine_similarity(vec1, vec3)

        assert sim_same == pytest.approx(1.0)
        assert sim_orthogonal == pytest.approx(0.0)

    def test_cosine_similarity_matrix(self):
        """Test batch cosine similarity."""
        queries = np.array([[1.0, 0.0], [0.0, 1.0]])
        candidates = np.array([[1.0, 0.0], [0.0, 1.0], [0.5, 0.5]])

        sim_matrix = EmbeddingModel.cosine_similarity_matrix(queries, candidates)

        assert sim_matrix.shape == (2, 3)
        assert sim_matrix[0, 0] == pytest.approx(1.0)
        assert sim_matrix[0, 1] == pytest.approx(0.0)

    def test_encode_batch_text(self, embedding_model):
        """Test batch text encoding."""
        texts = [
            "Modern sofa",
            "Vintage chair",
            "Contemporary table",
        ]

        embeddings = embedding_model.encode_batch_text(texts)

        assert embeddings.shape[0] == len(texts)
        assert all(
            np.linalg.norm(embeddings[i]) == pytest.approx(1.0, abs=1e-5)
            for i in range(len(texts))
        )

    def test_encode_batch_images(self, embedding_model):
        """Test batch image encoding."""
        images = [
            Image.new("RGB", (224, 224), color="red"),
            Image.new("RGB", (224, 224), color="blue"),
        ]

        embeddings = embedding_model.encode_batch_images(images)

        assert embeddings.shape[0] == len(images)
        assert all(
            np.linalg.norm(embeddings[i]) == pytest.approx(1.0, abs=1e-5)
            for i in range(len(images))
        )
