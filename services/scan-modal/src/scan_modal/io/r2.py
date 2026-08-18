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

__all__ = ["R2Error", "r2_client", "get_object", "put_object"]


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
