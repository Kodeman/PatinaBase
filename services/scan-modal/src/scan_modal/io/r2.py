"""R2 object access from Modal — boto3 against the R2 S3 endpoint.

Not used by `verify`, whose inputs arrive as presigned HTTPS URLs; `splat` and
`renders` write their artifacts here in W2. Credentials arrive as a Modal Secret.

The two checksum settings are load-bearing, not defensive noise: the 2025 AWS
SDK default flipped to always-on checksums, which collides with R2's partial
checksum matrix and fails otherwise-valid PUTs.
"""

from __future__ import annotations

import os
from typing import Any

__all__ = [
    "R2Error",
    "ARTIFACTS_BUCKET_ENV",
    "r2_client",
    "artifacts_bucket",
    "get_object",
    "put_object",
    "put_file",
    "sha256_file",
]

#: The derived-artifact bucket for this environment (plan R4: staging is
#: `patina-staging-media-artifacts-us`). Never hard-coded — the staging and
#: production buckets differ, and a wrong literal would write production
#: artifacts from a staging run.
ARTIFACTS_BUCKET_ENV = "R2_ARTIFACTS_BUCKET"


class R2Error(RuntimeError):
    """R2 is misconfigured in this environment."""


def r2_client() -> Any:
    import boto3
    from botocore.config import Config

    endpoint = os.environ.get("R2_ENDPOINT")
    if not endpoint:
        raise R2Error("R2_ENDPOINT is not set")
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        region_name="auto",
        aws_access_key_id=os.environ.get("R2_ACCESS_KEY_ID"),
        aws_secret_access_key=os.environ.get("R2_SECRET_ACCESS_KEY"),
        config=Config(
            request_checksum_calculation="when_required",
            response_checksum_validation="when_required",
        ),
    )


def get_object(bucket: str, key: str, client: Any | None = None) -> bytes:
    client = client or r2_client()
    return client.get_object(Bucket=bucket, Key=key)["Body"].read()


def put_object(
    bucket: str,
    key: str,
    body: bytes,
    content_type: str,
    client: Any | None = None,
) -> dict[str, Any]:
    client = client or r2_client()
    return client.put_object(Bucket=bucket, Key=key, Body=body, ContentType=content_type)


def artifacts_bucket() -> str:
    bucket = os.environ.get(ARTIFACTS_BUCKET_ENV)
    if not bucket:
        raise R2Error(f"{ARTIFACTS_BUCKET_ENV} is not set")
    return bucket


def sha256_file(path: Any, chunk_size: int = 1 << 20) -> tuple[str, int]:
    """(hex digest, size). Streamed — a room splat is hundreds of megabytes and
    must never be held in memory twice just to be hashed."""
    import hashlib

    digest = hashlib.sha256()
    size = 0
    with open(path, "rb") as handle:
        while True:
            chunk = handle.read(chunk_size)
            if not chunk:
                break
            digest.update(chunk)
            size += len(chunk)
    return digest.hexdigest(), size


def put_file(
    bucket: str,
    key: str,
    path: Any,
    content_type: str,
    client: Any | None = None,
) -> dict[str, Any]:
    """Streaming PUT from a file on disk. Returns `{"sha256", "size_bytes", "etag"}`.

    The checksum is computed here, on the bytes we are about to send, so the
    registry row records what was actually uploaded rather than what some
    earlier step believed it had written.
    """
    client = client or r2_client()
    sha256, size = sha256_file(path)
    with open(path, "rb") as handle:
        response = client.put_object(Bucket=bucket, Key=key, Body=handle, ContentType=content_type)
    etag = (response or {}).get("ETag")
    if isinstance(etag, str):
        etag = etag.strip('"')
    return {"sha256": sha256, "size_bytes": size, "etag": etag}
