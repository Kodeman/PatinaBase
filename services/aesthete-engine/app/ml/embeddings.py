"""
Embedding computation using CLIP-style multimodal models.
Supports both image and text encoding with fusion.
"""
import io
from typing import Dict, List, Optional, Tuple

import numpy as np
import torch
from PIL import Image
from transformers import CLIPModel, CLIPProcessor

from app.config import get_settings

settings = get_settings()


class EmbeddingModel:
    """
    CLIP-style embedding model for products.
    Encodes images and text into a shared embedding space.
    """

    def __init__(
        self,
        model_name: str = "openai/clip-vit-base-patch32",
        device: Optional[str] = None,
    ):
        """
        Initialize the embedding model.

        Args:
            model_name: HuggingFace model identifier
            device: Device to run on ('cpu', 'cuda', or None for auto-detect)
        """
        self.model_name = model_name
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")

        # Load model and processor
        self.model = CLIPModel.from_pretrained(model_name).to(self.device)
        self.processor = CLIPProcessor.from_pretrained(model_name)

        # Set to eval mode
        self.model.eval()

        self.embedding_dim = settings.embedding_dim
        self.alpha = settings.alpha_img_text

    @torch.no_grad()
    def encode_image(self, image: Image.Image) -> np.ndarray:
        """
        Encode an image to embedding vector.

        Args:
            image: PIL Image

        Returns:
            Normalized embedding vector (numpy array)
        """
        inputs = self.processor(images=image, return_tensors="pt").to(self.device)
        image_features = self.model.get_image_features(**inputs)

        # Normalize
        image_features = image_features / image_features.norm(dim=-1, keepdim=True)

        return image_features.cpu().numpy()[0]

    @torch.no_grad()
    def encode_text(self, text: str) -> np.ndarray:
        """
        Encode text to embedding vector.

        Args:
            text: Text string (product name, description, etc.)

        Returns:
            Normalized embedding vector (numpy array)
        """
        inputs = self.processor(text=[text], return_tensors="pt", padding=True).to(
            self.device
        )
        text_features = self.model.get_text_features(**inputs)

        # Normalize
        text_features = text_features / text_features.norm(dim=-1, keepdim=True)

        return text_features.cpu().numpy()[0]

    @torch.no_grad()
    def encode_product(
        self,
        image: Optional[Image.Image] = None,
        text: Optional[str] = None,
        alpha: Optional[float] = None,
    ) -> np.ndarray:
        """
        Encode a product using image and/or text.
        Fuses both modalities if available.

        Args:
            image: Product image (optional)
            text: Product text (name + description + attributes)
            alpha: Image weight in fusion (default: self.alpha)

        Returns:
            Normalized fused embedding vector

        Raises:
            ValueError: If neither image nor text is provided
        """
        if image is None and text is None:
            raise ValueError("At least one of image or text must be provided")

        alpha = alpha if alpha is not None else self.alpha

        if image is not None and text is not None:
            # Fuse image and text embeddings
            img_emb = self.encode_image(image)
            txt_emb = self.encode_text(text)

            # Weighted fusion
            fused = alpha * img_emb + (1 - alpha) * txt_emb

            # Re-normalize
            fused = fused / np.linalg.norm(fused)
            return fused

        elif image is not None:
            return self.encode_image(image)
        else:
            return self.encode_text(text)

    def encode_batch_images(self, images: List[Image.Image]) -> np.ndarray:
        """
        Encode a batch of images efficiently.

        Args:
            images: List of PIL Images

        Returns:
            Normalized embedding matrix (num_images x embedding_dim)
        """
        with torch.no_grad():
            inputs = self.processor(images=images, return_tensors="pt").to(self.device)
            image_features = self.model.get_image_features(**inputs)

            # Normalize each embedding
            image_features = image_features / image_features.norm(
                dim=-1, keepdim=True
            )

            return image_features.cpu().numpy()

    def encode_batch_text(self, texts: List[str]) -> np.ndarray:
        """
        Encode a batch of texts efficiently.

        Args:
            texts: List of text strings

        Returns:
            Normalized embedding matrix (num_texts x embedding_dim)
        """
        with torch.no_grad():
            inputs = self.processor(text=texts, return_tensors="pt", padding=True).to(
                self.device
            )
            text_features = self.model.get_text_features(**inputs)

            # Normalize each embedding
            text_features = text_features / text_features.norm(dim=-1, keepdim=True)

            return text_features.cpu().numpy()

    @staticmethod
    def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
        """
        Compute cosine similarity between two vectors.

        Args:
            a: First vector
            b: Second vector

        Returns:
            Cosine similarity score
        """
        return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))

    @staticmethod
    def cosine_similarity_matrix(
        queries: np.ndarray, candidates: np.ndarray
    ) -> np.ndarray:
        """
        Compute cosine similarity matrix between query and candidate vectors.

        Args:
            queries: Query vectors (num_queries x dim)
            candidates: Candidate vectors (num_candidates x dim)

        Returns:
            Similarity matrix (num_queries x num_candidates)
        """
        # Normalize if not already normalized
        queries_norm = queries / np.linalg.norm(queries, axis=1, keepdims=True)
        candidates_norm = candidates / np.linalg.norm(
            candidates, axis=1, keepdims=True
        )

        # Matrix multiplication for batch cosine similarity
        return np.dot(queries_norm, candidates_norm.T)


class ONNXEmbeddingModel:
    """
    ONNX Runtime version of the embedding model for faster CPU inference.
    Use this in production for better performance.
    """

    def __init__(self, onnx_model_path: str):
        """
        Initialize ONNX embedding model.

        Args:
            onnx_model_path: Path to ONNX model file
        """
        import onnxruntime as ort

        self.session = ort.InferenceSession(
            onnx_model_path, providers=["CPUExecutionProvider"]
        )
        self.processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")

    def encode_image(self, image: Image.Image) -> np.ndarray:
        """Encode image using ONNX runtime."""
        inputs = self.processor(images=image, return_tensors="np")
        onnx_inputs = {self.session.get_inputs()[0].name: inputs["pixel_values"]}
        outputs = self.session.run(None, onnx_inputs)

        # Normalize
        embedding = outputs[0]
        embedding = embedding / np.linalg.norm(embedding)
        return embedding[0]

    def encode_text(self, text: str) -> np.ndarray:
        """Encode text using ONNX runtime."""
        inputs = self.processor(text=[text], return_tensors="np", padding=True)
        onnx_inputs = {
            name: inputs[key]
            for name, key in zip(
                [inp.name for inp in self.session.get_inputs()],
                ["input_ids", "attention_mask"],
            )
        }
        outputs = self.session.run(None, onnx_inputs)

        # Normalize
        embedding = outputs[0]
        embedding = embedding / np.linalg.norm(embedding)
        return embedding[0]
