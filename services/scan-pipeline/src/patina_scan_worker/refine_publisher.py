"""Disabled manifest-last publication boundary for Refine outputs.

The queue stage is deliberately not registered.  This module accepts only a
fully validated :class:`~patina_scan_worker.refine_runner.RefineRunResult`,
revalidates its manifest contract, and delegates each create-only object write
to :class:`~patina_scan_worker.storage.StorageClient`.  Inline documents are
first copied to private ``O_EXCL`` files so file-backed and inline artifacts use
the same no-follow, same-descriptor storage primitive.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import re
import stat
import tempfile
from dataclasses import dataclass
from pathlib import Path

from .errors import PermanentError, TransientError
from .refine_adapter import (
    AdapterError,
    RefineDeadline,
    canonical_present_manifest_keys,
)
from .refine_runner import (
    REFINE_MANIFEST_NAME,
    RefineArtifact,
    RefineFileArtifact,
    RefineInlineArtifact,
    RefineRunError,
    RefineRunResult,
    validate_refine_result_for_publication,
)
from .storage import StorageClient


_SAFE_NAME = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]*")
_WRITE_CHUNK_BYTES = 1 << 20


@dataclass(frozen=True)
class CommittedRefineManifest:
    object_key: str
    sha256: str
    size_bytes: int
    created: bool


@dataclass(frozen=True)
class RefinePublicationReceipt:
    manifest: CommittedRefineManifest
    created_keys: tuple[str, ...]
    replayed_keys: tuple[str, ...]

    @property
    def created_count(self) -> int:
        return len(self.created_keys)

    @property
    def replayed_count(self) -> int:
        return len(self.replayed_keys)


@dataclass(frozen=True)
class _ValidatedPublication:
    prefix: str
    artifacts: tuple[RefineArtifact, ...]
    manifest: RefineInlineArtifact


def _canonical_json_bytes(value: object) -> bytes:
    try:
        encoded = json.dumps(
            value,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
            allow_nan=False,
        )
    except (TypeError, ValueError) as exc:
        raise PermanentError(
            "refine manifest is not canonical JSON",
            token="REFINE_ARTIFACT_VERIFY",
        ) from exc
    return (encoded + "\n").encode("utf-8")


def _require_budget(deadline: RefineDeadline, reserve_seconds: float) -> float:
    if (
        isinstance(reserve_seconds, bool)
        or not isinstance(reserve_seconds, (int, float))
        or not math.isfinite(float(reserve_seconds))
        or reserve_seconds < 0
    ):
        raise ValueError("completion reserve must be a finite non-negative number")
    try:
        remaining = deadline.remaining_seconds()
    except AdapterError as exc:
        raise TransientError(
            "refine publication deadline is exhausted",
            token="REFINE_ENGINE_TIMEOUT",
        ) from exc
    usable = remaining - float(reserve_seconds)
    if not math.isfinite(usable) or usable <= 0:
        raise TransientError(
            "refine publication cannot preserve the completion reserve",
            token="REFINE_ENGINE_TIMEOUT",
        )
    return usable


def _artifact_row(artifact: RefineArtifact) -> dict[str, object]:
    return {
        "name": artifact.name,
        "transportContentType": artifact.transport_content_type,
        "semanticMediaType": artifact.semantic_media_type,
        "sha256": artifact.sha256,
        "sizeBytes": artifact.size_bytes,
    }


def _artifact_ledger_matches(
    value: object,
    artifacts: tuple[RefineArtifact, ...],
) -> bool:
    if type(value) is not list or len(value) != len(artifacts):
        return False
    expected_keys = {
        "name",
        "transportContentType",
        "semanticMediaType",
        "sha256",
        "sizeBytes",
    }
    for row, artifact in zip(value, artifacts, strict=True):
        if (
            type(row) is not dict
            or set(row) != expected_keys
            or type(row.get("name")) is not str
            or type(row.get("transportContentType")) is not str
            or type(row.get("semanticMediaType")) is not str
            or type(row.get("sha256")) is not str
            or type(row.get("sizeBytes")) is not int
            or row != _artifact_row(artifact)
        ):
            return False
    return True


def _validate_result(
    result: RefineRunResult,
    *,
    user_id: str,
    scan_id: str,
) -> _ValidatedPublication:
    if type(result) is not RefineRunResult:
        raise PermanentError(
            "refine publisher requires an exact RefineRunResult",
            token="REFINE_ARTIFACT_VERIFY",
        )
    try:
        validate_refine_result_for_publication(result)
    except RefineRunError as exc:
        raise PermanentError(
            "refine result failed the strict publication contract",
            token="REFINE_ARTIFACT_VERIFY",
        ) from exc
    if type(result.files) is not tuple or len(result.files) < 2:
        raise PermanentError(
            "refine publication requires artifacts and a manifest",
            token="REFINE_ARTIFACT_VERIFY",
        )
    if type(result.files[-1]) is not RefineInlineArtifact:
        raise PermanentError(
            "refine manifest must be the final inline artifact",
            token="REFINE_ARTIFACT_VERIFY",
        )
    manifest = result.files[-1]
    if (
        manifest.name != REFINE_MANIFEST_NAME
        or manifest.transport_content_type != "application/json"
        or manifest.semantic_media_type != "application/json"
        or result.manifest_sha256 != manifest.sha256
    ):
        raise PermanentError(
            "refine manifest fingerprint or media type is invalid",
            token="REFINE_ARTIFACT_VERIFY",
        )
    try:
        document = json.loads(manifest.payload)
    except (TypeError, ValueError) as exc:
        raise PermanentError(
            "refine manifest cannot be parsed",
            token="REFINE_ARTIFACT_VERIFY",
        ) from exc
    if (
        type(document) is not dict
        or _canonical_json_bytes(document) != manifest.payload
        or type(document.get("schemaVersion")) is not int
        or document["schemaVersion"] != 1
        or document.get("status") != "complete"
        or document.get("productionEnablement") != "disabled"
    ):
        raise PermanentError(
            "refine manifest is not the disabled canonical contract",
            token="REFINE_ARTIFACT_VERIFY",
        )

    identity = document.get("identity")
    if type(identity) is not dict:
        raise PermanentError(
            "refine manifest identity is invalid",
            token="REFINE_ARTIFACT_VERIFY",
        )
    version = identity.get("roomFileVersion")
    if (
        type(user_id) is not str
        or not user_id
        or type(scan_id) is not str
        or not scan_id
        or identity.get("userId") != user_id
        or identity.get("scanId") != scan_id
        or type(version) is not int
        or version <= 0
    ):
        raise PermanentError(
            "refine manifest identity does not match the publication owner",
            token="REFINE_ARTIFACT_VERIFY",
        )
    try:
        expected_manifest_key = canonical_present_manifest_keys(
            user_id,
            scan_id,
            version,
        )["refine"]
    except (AdapterError, TypeError, ValueError) as exc:
        raise PermanentError(
            "refine manifest key identity is invalid",
            token="REFINE_ARTIFACT_VERIFY",
        ) from exc
    if result.manifest_key != expected_manifest_key:
        raise PermanentError(
            "refine manifest key is not canonical",
            token="REFINE_ARTIFACT_VERIFY",
        )

    artifacts = result.files[:-1]
    names: list[str] = []
    for artifact in artifacts:
        if type(artifact) not in (RefineFileArtifact, RefineInlineArtifact):
            raise PermanentError(
                "refine publication has an unsupported artifact type",
                token="REFINE_ARTIFACT_VERIFY",
            )
        if (
            type(artifact.name) is not str
            or _SAFE_NAME.fullmatch(artifact.name) is None
            or artifact.name == REFINE_MANIFEST_NAME
            or type(artifact.transport_content_type) is not str
            or not artifact.transport_content_type
            or type(artifact.semantic_media_type) is not str
            or not artifact.semantic_media_type
            or re.fullmatch(r"[0-9a-f]{64}", artifact.sha256) is None
            or type(artifact.size_bytes) is not int
            or artifact.size_bytes < 0
        ):
            raise PermanentError(
                "refine artifact metadata is invalid",
                token="REFINE_ARTIFACT_VERIFY",
            )
        if type(artifact) is RefineFileArtifact and (
            type(artifact.identity) is not tuple
            or len(artifact.identity) != 2
            or any(
                type(value) is not int or type(value) is bool
                for value in artifact.identity
            )
        ):
            # Publishing a borrowed descriptor without the identity it was
            # measured on would mean uploading whatever that fd number happens
            # to point at now.  The runner always attaches it.
            raise PermanentError(
                "refine file artifact is missing its measured file identity",
                token="REFINE_ARTIFACT_VERIFY",
            )
        names.append(artifact.name)
    if len(names) != len(set(names)) or names != sorted(names):
        raise PermanentError(
            "refine artifacts must be uniquely and canonically ordered",
            token="REFINE_ARTIFACT_VERIFY",
        )
    if not _artifact_ledger_matches(document.get("artifacts"), artifacts):
        raise PermanentError(
            "refine manifest artifact ledger does not match its payloads",
            token="REFINE_ARTIFACT_VERIFY",
        )
    return _ValidatedPublication(
        prefix=result.manifest_key.removesuffix(f"/{REFINE_MANIFEST_NAME}"),
        artifacts=artifacts,
        manifest=manifest,
    )


def _spool_inline(
    directory: Path,
    artifact: RefineInlineArtifact,
    *,
    deadline: RefineDeadline,
    reserve_seconds: float,
) -> int:
    """Spool one inline document and return a read-only descriptor for it.

    The write handle is closed and a fresh read-only descriptor is opened with
    ``O_NOFOLLOW`` before the file is unlinked, so the object published is the
    inode this function wrote and nothing can be substituted at the name after
    the fact.  Callers own the returned descriptor.
    """

    _require_budget(deadline, reserve_seconds)
    target = directory / artifact.name
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    flags |= getattr(os, "O_CLOEXEC", 0)
    flags |= getattr(os, "O_NOFOLLOW", 0)
    read_descriptor: int | None = None
    try:
        descriptor = os.open(target, flags, 0o600)
        try:
            handle = os.fdopen(descriptor, "wb")
        except OSError:
            try:
                os.close(descriptor)
            except OSError:
                pass
            raise
        with handle:
            view = memoryview(artifact.payload)
            offset = 0
            while offset < len(view):
                _require_budget(deadline, reserve_seconds)
                written = handle.write(view[offset : offset + _WRITE_CHUNK_BYTES])
                if written is None or written <= 0:
                    raise OSError("inline artifact spool made no progress")
                offset += written
            handle.flush()
            os.fsync(handle.fileno())
            written_stat = os.fstat(handle.fileno())
            written_identity = (written_stat.st_dev, written_stat.st_ino)
        read_flags = os.O_RDONLY | getattr(os, "O_CLOEXEC", 0)
        read_flags |= getattr(os, "O_NOFOLLOW", 0)
        read_descriptor = os.open(target, read_flags)
        metadata = os.fstat(read_descriptor)
        os.unlink(target)
    except OSError as exc:
        if read_descriptor is not None:
            try:
                os.close(read_descriptor)
            except OSError:
                pass
        raise TransientError(
            "refine inline artifact could not be spooled",
            token="REFINE_ARTIFACT_IO",
        ) from exc
    _require_budget(deadline, reserve_seconds)
    if (
        not stat.S_ISREG(metadata.st_mode)
        or (metadata.st_dev, metadata.st_ino) != written_identity
        or metadata.st_size != artifact.size_bytes
        or hashlib.sha256(artifact.payload).hexdigest() != artifact.sha256
    ):
        try:
            os.close(read_descriptor)
        except OSError:
            pass
        raise PermanentError(
            "refine inline artifact spool could not be verified",
            token="REFINE_ARTIFACT_VERIFY",
        )
    return read_descriptor


class RefinePublisher:
    """Publish a disabled Refine result in canonical order, manifest last."""

    def __init__(
        self,
        storage: StorageClient,
        *,
        spool_root: Path,
        completion_reserve_seconds: float,
    ) -> None:
        if not isinstance(storage, StorageClient):
            raise TypeError("storage must be a StorageClient")
        if not isinstance(spool_root, Path) or not spool_root.is_absolute():
            raise ValueError("spool_root must be an absolute Path")
        try:
            if spool_root.is_symlink():
                raise ValueError("spool_root must not be a symlink")
            resolved_root = spool_root.resolve(strict=True)
            root_stat = resolved_root.stat()
        except OSError as exc:
            raise ValueError("spool_root is unavailable") from exc
        if not stat.S_ISDIR(root_stat.st_mode):
            raise ValueError("spool_root must be a directory")
        if (
            isinstance(completion_reserve_seconds, bool)
            or not isinstance(completion_reserve_seconds, (int, float))
            or not math.isfinite(float(completion_reserve_seconds))
            or completion_reserve_seconds < 0
        ):
            raise ValueError("completion reserve must be finite and non-negative")
        self._storage = storage
        self._spool_root = resolved_root
        self._completion_reserve_seconds = float(completion_reserve_seconds)

    def publish(
        self,
        result: RefineRunResult,
        *,
        user_id: str,
        scan_id: str,
        deadline: RefineDeadline,
    ) -> RefinePublicationReceipt:
        if type(deadline) is not RefineDeadline:
            raise TypeError("deadline must be a RefineDeadline")
        _require_budget(deadline, self._completion_reserve_seconds)
        validated = _validate_result(result, user_id=user_id, scan_id=scan_id)
        created: list[str] = []
        replayed: list[str] = []

        try:
            temporary = tempfile.TemporaryDirectory(
                prefix="patina-refine-publish-",
                dir=self._spool_root,
            )
        except OSError as exc:
            raise TransientError(
                "refine publication spool directory could not be created",
                token="REFINE_ARTIFACT_IO",
            ) from exc
        with temporary:
            spool_dir = Path(temporary.name)

            def publish_artifact(
                artifact: RefineArtifact,
                *,
                object_key: str,
            ) -> bool:
                _require_budget(deadline, self._completion_reserve_seconds)
                # A file artifact's descriptor is BORROWED from the runner's
                # caller, so it must not be closed here.  A spooled inline
                # document's descriptor is owned by this call and always is.
                if type(artifact) is RefineFileArtifact:
                    return self._storage.publish_immutable_descriptor(
                        object_key,
                        artifact.descriptor,
                        artifact.transport_content_type,
                        expected_sha256=artifact.sha256,
                        expected_size=artifact.size_bytes,
                        user_id=user_id,
                        scan_id=scan_id,
                        # The runner measured this inode; storage re-proves the
                        # borrowed descriptor still points at it before staging.
                        expected_identity=artifact.identity,
                        deadline=deadline,
                        reserve_seconds=self._completion_reserve_seconds,
                    )
                spooled = _spool_inline(
                    spool_dir,
                    artifact,
                    deadline=deadline,
                    reserve_seconds=self._completion_reserve_seconds,
                )
                try:
                    return self._storage.publish_immutable_descriptor(
                        object_key,
                        spooled,
                        artifact.transport_content_type,
                        expected_sha256=artifact.sha256,
                        expected_size=artifact.size_bytes,
                        user_id=user_id,
                        scan_id=scan_id,
                        deadline=deadline,
                        reserve_seconds=self._completion_reserve_seconds,
                    )
                finally:
                    try:
                        os.close(spooled)
                    except OSError as exc:
                        raise TransientError(
                            "refine inline artifact spool could not be released",
                            token="REFINE_ARTIFACT_IO",
                        ) from exc

            for artifact in validated.artifacts:
                key = f"{validated.prefix}/{artifact.name}"
                was_created = publish_artifact(artifact, object_key=key)
                (created if was_created else replayed).append(key)

            manifest_key = f"{validated.prefix}/{validated.manifest.name}"
            manifest_created = publish_artifact(
                validated.manifest,
                object_key=manifest_key,
            )
            (created if manifest_created else replayed).append(manifest_key)

        _require_budget(deadline, self._completion_reserve_seconds)
        return RefinePublicationReceipt(
            manifest=CommittedRefineManifest(
                object_key=manifest_key,
                sha256=validated.manifest.sha256,
                size_bytes=validated.manifest.size_bytes,
                created=manifest_created,
            ),
            created_keys=tuple(created),
            replayed_keys=tuple(replayed),
        )
