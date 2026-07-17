"""Storage REST client for the ``room-scans`` bucket.

Reads bundle artifacts (service-role key bypasses storage RLS on read); item 11
adds drawing uploads under the ``room_file/{userId}/{scanId}/v{version}/…``
prefix. ``room-scans`` is PRIVATE, so downloads go through the authenticated
object endpoint with the service-role key.
"""

from __future__ import annotations

import os

import httpx

from .config import Settings
from .errors import PermanentError, TransientError


class StorageClient:
    def __init__(self, session: httpx.Client, settings: Settings):
        self._s = session
        self._cfg = settings
        self._bucket = settings.room_scans_bucket

    def download_to(self, object_key: str, dest_path: str) -> int:
        """Download a bucket object to ``dest_path``. Returns bytes written.

        404 → PermanentError token MISSING_FILE (the caller decides transient-vs-
        fatal by attempt count). 5xx / network → TransientError.
        """
        os.makedirs(os.path.dirname(dest_path), exist_ok=True)
        url = f"/storage/v1/object/{self._bucket}/{object_key}"
        try:
            with self._s.stream("GET", url) as resp:
                if resp.status_code == 404:
                    raise PermanentError(
                        f"object not found: {object_key}", token="MISSING_FILE"
                    )
                if resp.status_code >= 500:
                    raise TransientError(
                        f"storage GET {object_key} -> {resp.status_code}"
                    )
                if resp.status_code >= 400:
                    raise PermanentError(
                        f"storage GET {object_key} -> {resp.status_code}: "
                        f"{resp.read()[:200]!r}",
                        token="MISSING_FILE",
                    )
                written = 0
                with open(dest_path, "wb") as fh:
                    for chunk in resp.iter_bytes(chunk_size=1 << 20):
                        fh.write(chunk)
                        written += len(chunk)
                return written
        except httpx.HTTPError as exc:
            raise TransientError(f"storage GET {object_key}: {exc}") from exc

    def list_reachable(self) -> bool:
        """doctor probe: a list against the bucket succeeds (proves the service
        key authenticates and Storage is reachable over 443)."""
        try:
            resp = self._s.post(
                f"/storage/v1/object/list/{self._bucket}",
                json={"prefix": "", "limit": 1},
            )
        except httpx.HTTPError:
            return False
        return resp.status_code < 400

    def upload_bytes(self, object_key: str, data: bytes, content_type: str) -> None:
        """Upsert an object (used by drawings/item 11 and by verification
        fixtures). POST + x-upsert:true, mirroring the iOS uploader."""
        url = f"/storage/v1/object/{self._bucket}/{object_key}"
        try:
            resp = self._s.post(
                url,
                content=data,
                headers={"content-type": content_type, "x-upsert": "true"},
            )
        except httpx.HTTPError as exc:
            raise TransientError(f"storage PUT {object_key}: {exc}") from exc
        if resp.status_code >= 400:
            raise RuntimeError(
                f"storage PUT {object_key} -> {resp.status_code}: {resp.text[:200]}"
            )
