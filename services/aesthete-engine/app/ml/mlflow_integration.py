"""
MLflow integration for model registry and experiment tracking.
"""
import logging
from typing import Any, Dict, List, Optional

import mlflow
from mlflow.tracking import MlflowClient

from app.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)


class MLflowModelRegistry:
    """
    MLflow model registry integration.
    Manages model versioning, staging, and production deployment.
    """

    def __init__(self):
        """Initialize MLflow client."""
        mlflow.set_tracking_uri(settings.mlflow_tracking_uri)
        self.client = MlflowClient()

    def get_production_model(self, model_name: str) -> Optional[Dict[str, Any]]:
        """
        Get the current production model.

        Args:
            model_name: Model name in registry

        Returns:
            Model info or None if not found
        """
        try:
            # Get latest version in Production stage
            versions = self.client.get_latest_versions(
                model_name, stages=["Production"]
            )

            if not versions:
                logger.warning(f"No production version found for model: {model_name}")
                return None

            latest_version = versions[0]

            return {
                "name": model_name,
                "version": latest_version.version,
                "run_id": latest_version.run_id,
                "stage": latest_version.current_stage,
                "source": latest_version.source,
                "tags": latest_version.tags,
            }

        except Exception as e:
            logger.error(f"Error getting production model: {e}")
            return None

    def get_staging_model(self, model_name: str) -> Optional[Dict[str, Any]]:
        """
        Get the current staging model.

        Args:
            model_name: Model name in registry

        Returns:
            Model info or None if not found
        """
        try:
            versions = self.client.get_latest_versions(model_name, stages=["Staging"])

            if not versions:
                return None

            latest_version = versions[0]

            return {
                "name": model_name,
                "version": latest_version.version,
                "run_id": latest_version.run_id,
                "stage": latest_version.current_stage,
                "source": latest_version.source,
            }

        except Exception as e:
            logger.error(f"Error getting staging model: {e}")
            return None

    def promote_to_production(
        self, model_name: str, version: str, archive_existing: bool = True
    ) -> bool:
        """
        Promote a model version to production.

        Args:
            model_name: Model name
            version: Version to promote
            archive_existing: Whether to archive existing production version

        Returns:
            True if successful
        """
        try:
            # Archive existing production versions if requested
            if archive_existing:
                prod_versions = self.client.get_latest_versions(
                    model_name, stages=["Production"]
                )
                for pv in prod_versions:
                    self.client.transition_model_version_stage(
                        name=model_name,
                        version=pv.version,
                        stage="Archived",
                    )

            # Promote new version
            self.client.transition_model_version_stage(
                name=model_name, version=version, stage="Production"
            )

            logger.info(f"Promoted {model_name} v{version} to Production")
            return True

        except Exception as e:
            logger.error(f"Error promoting model to production: {e}")
            return False

    def register_model(
        self,
        run_id: str,
        model_name: str,
        artifact_path: str = "model",
        tags: Optional[Dict[str, str]] = None,
    ) -> Optional[str]:
        """
        Register a new model version.

        Args:
            run_id: MLflow run ID
            model_name: Model name
            artifact_path: Path to model artifact in run
            tags: Optional tags

        Returns:
            Version number or None if failed
        """
        try:
            result = mlflow.register_model(
                model_uri=f"runs:/{run_id}/{artifact_path}", name=model_name
            )

            # Add tags if provided
            if tags:
                for key, value in tags.items():
                    self.client.set_model_version_tag(
                        name=model_name, version=result.version, key=key, value=value
                    )

            logger.info(f"Registered {model_name} version {result.version}")
            return result.version

        except Exception as e:
            logger.error(f"Error registering model: {e}")
            return None

    def get_model_versions(
        self, model_name: str, limit: int = 10
    ) -> List[Dict[str, Any]]:
        """
        Get model version history.

        Args:
            model_name: Model name
            limit: Maximum number of versions

        Returns:
            List of model versions
        """
        try:
            versions = self.client.search_model_versions(
                f"name='{model_name}'", max_results=limit
            )

            return [
                {
                    "version": v.version,
                    "stage": v.current_stage,
                    "run_id": v.run_id,
                    "created_at": v.creation_timestamp,
                    "tags": v.tags,
                }
                for v in versions
            ]

        except Exception as e:
            logger.error(f"Error getting model versions: {e}")
            return []


class MLflowExperimentTracker:
    """
    Experiment tracking for recommendation system.
    """

    def __init__(self, experiment_name: str):
        """
        Initialize experiment tracker.

        Args:
            experiment_name: Name of the experiment
        """
        mlflow.set_tracking_uri(settings.mlflow_tracking_uri)
        self.experiment_name = experiment_name

        # Get or create experiment
        experiment = mlflow.get_experiment_by_name(experiment_name)
        if experiment is None:
            self.experiment_id = mlflow.create_experiment(experiment_name)
        else:
            self.experiment_id = experiment.experiment_id

    def start_run(
        self, run_name: Optional[str] = None, tags: Optional[Dict[str, str]] = None
    ):
        """
        Start a new MLflow run.

        Args:
            run_name: Optional run name
            tags: Optional tags

        Returns:
            MLflow run context manager
        """
        return mlflow.start_run(
            experiment_id=self.experiment_id, run_name=run_name, tags=tags
        )

    def log_metrics(self, metrics: Dict[str, float], step: Optional[int] = None):
        """
        Log metrics to current run.

        Args:
            metrics: Metrics dictionary
            step: Optional step number
        """
        for key, value in metrics.items():
            mlflow.log_metric(key, value, step=step)

    def log_params(self, params: Dict[str, Any]):
        """
        Log parameters to current run.

        Args:
            params: Parameters dictionary
        """
        mlflow.log_params(params)

    def log_model(
        self,
        model: Any,
        artifact_path: str = "model",
        registered_model_name: Optional[str] = None,
    ):
        """
        Log model to current run.

        Args:
            model: Model object
            artifact_path: Path to save artifact
            registered_model_name: Optional name to register in model registry
        """
        mlflow.pyfunc.log_model(
            artifact_path=artifact_path,
            python_model=model,
            registered_model_name=registered_model_name,
        )

    def log_artifact(self, local_path: str, artifact_path: Optional[str] = None):
        """
        Log an artifact to current run.

        Args:
            local_path: Local file path
            artifact_path: Optional artifact path in run
        """
        mlflow.log_artifact(local_path, artifact_path)


class ABTestManager:
    """
    A/B testing support for model experiments.
    """

    def __init__(self):
        """Initialize A/B test manager."""
        self.client = MlflowClient()

    def create_ab_test(
        self,
        test_name: str,
        model_a: str,
        model_b: str,
        split_ratio: float = 0.5,
        tags: Optional[Dict[str, str]] = None,
    ) -> str:
        """
        Create a new A/B test.

        Args:
            test_name: Test name
            model_a: Control model name
            model_b: Treatment model name
            split_ratio: Traffic split ratio for model B
            tags: Optional tags

        Returns:
            Test ID (run ID)
        """
        with mlflow.start_run(run_name=test_name) as run:
            # Log test configuration
            mlflow.log_params(
                {
                    "model_a": model_a,
                    "model_b": model_b,
                    "split_ratio": split_ratio,
                    "test_type": "ab_test",
                }
            )

            if tags:
                mlflow.set_tags(tags)

            mlflow.set_tag("test_status", "active")

            return run.info.run_id

    def get_model_assignment(
        self, test_id: str, user_id: str, split_ratio: float = 0.5
    ) -> str:
        """
        Get model assignment for a user in A/B test.

        Args:
            test_id: Test ID
            user_id: User ID
            split_ratio: Split ratio

        Returns:
            Model identifier ('A' or 'B')
        """
        # Deterministic hash-based assignment
        import hashlib

        hash_val = int(hashlib.md5(f"{test_id}:{user_id}".encode()).hexdigest(), 16)
        assignment_val = (hash_val % 1000) / 1000.0

        return "B" if assignment_val < split_ratio else "A"

    def log_ab_test_result(
        self, test_id: str, model: str, metrics: Dict[str, float]
    ):
        """
        Log A/B test results.

        Args:
            test_id: Test ID (run ID)
            model: Model identifier
            metrics: Metrics to log
        """
        with mlflow.start_run(run_id=test_id):
            for key, value in metrics.items():
                mlflow.log_metric(f"{model}_{key}", value)

    def conclude_ab_test(
        self, test_id: str, winner: str, notes: Optional[str] = None
    ):
        """
        Conclude an A/B test.

        Args:
            test_id: Test ID
            winner: Winning model ('A' or 'B')
            notes: Optional conclusion notes
        """
        with mlflow.start_run(run_id=test_id):
            mlflow.set_tag("test_status", "concluded")
            mlflow.set_tag("winner", winner)
            if notes:
                mlflow.set_tag("conclusion_notes", notes)

            logger.info(f"A/B test {test_id} concluded. Winner: {winner}")
