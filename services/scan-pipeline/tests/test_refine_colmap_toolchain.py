from __future__ import annotations

import hashlib
import json
import os
import sys
import time
from pathlib import Path, PurePosixPath

import pytest
from _colmap_toolchain import (
    allowlisted_argv,
    canonical_manifest_bytes,
    load_fake_toolchain,
    plan_fake_command,
    qualified_manifest_fields,
    write_toolchain,
)

from patina_scan_worker import pycolmap_cuda_smoke
from patina_scan_worker import refine_colmap_toolchain as toolchain_module
from patina_scan_worker.refine_adapter import AdapterError, RefineDeadline
from patina_scan_worker.refine_colmap_toolchain import (
    COMMAND_ENVIRONMENT_ALLOWLIST,
    OWED_BOX_VALUES,
    QUALIFIED_APP_DIR,
    QUALIFIED_COLMAP_PREFIX,
    QUALIFIED_CUDA_ROOT,
    TOOLCHAIN_MANIFEST_RELATIVE_PATH,
    ColmapExecutableIdentity,
    ColmapToolchain,
    PinnedColmapCommand,
    assert_qualified_box_identity,
    build_command_environment,
    carried_deadline_probe,
    load_colmap_toolchain,
    parse_toolchain_manifest,
    plan_pinned_colmap_command,
    plan_qualified_colmap_command,
    validate_allowlisted_argv,
    validate_command_environment,
    verify_executable_identity,
)
from patina_scan_worker.refine_native_process import NativeChildContext

UNIT_DIR = Path(__file__).resolve().parents[1]


def _qualified_manifest(**overrides):
    return parse_toolchain_manifest(
        canonical_manifest_bytes(qualified_manifest_fields(**overrides))
    )


def _workspace(tmp_path: Path) -> Path:
    workspace = tmp_path / "work"
    workspace.mkdir()
    workspace.chmod(0o700)
    return workspace


# ---------------------------------------------------------------------------
# Posture
# ---------------------------------------------------------------------------


def test_toolchain_policy_flags_remain_false_and_owed_values_are_listed():
    assert toolchain_module.TOOLCHAIN_POLICY_QUALIFIED is False
    assert toolchain_module.EXECUTABLE_IDENTITY_QUALIFIED is False
    assert toolchain_module.COMMAND_ENVIRONMENT_QUALIFIED is False
    assert len(OWED_BOX_VALUES) >= 4
    assert all(type(value) is str and value for value in OWED_BOX_VALUES)


def test_pinned_constants_match_the_in_repo_colmap_builder():
    builder = (UNIT_DIR / "install-colmap-4.0.2.sh").read_text(encoding="utf-8")
    # Every pin is asserted as the builder's own complete `readonly` line, so a
    # constant that merely *resembles* the receipt -- a dropped parenthesis, a
    # truncated prefix -- can no longer satisfy a substring match.  This is the
    # class of drift that shipped `colmapBuildBanner` without its parentheses:
    # an operator transcribing the second line of `colmap -h` got a hard
    # rejection from a constant that looked right.
    for line in (
        f"readonly COLMAP_PREFIX={QUALIFIED_COLMAP_PREFIX}",
        f"readonly EXPECTED_COMMIT={toolchain_module.QUALIFIED_COLMAP_SOURCE_COMMIT}",
        f"readonly EXPECTED_SOURCE_TREE={toolchain_module.QUALIFIED_COLMAP_SOURCE_TREE}",
        f'readonly EXPECTED_BUILD="{toolchain_module.QUALIFIED_COLMAP_BUILD_BANNER}"',
        f"readonly CUDA_ROOT={QUALIFIED_CUDA_ROOT}",
        f"readonly CC_11={toolchain_module.QUALIFIED_HOST_C_COMPILER}",
        f"readonly CXX_11={toolchain_module.QUALIFIED_HOST_CXX_COMPILER}",
        f"readonly COLMAP_VERSION={toolchain_module.QUALIFIED_COLMAP_VERSION}",
    ):
        assert line in builder.splitlines(), line
    # The banner is the parenthesized `colmap -h` line.  PyCOLMAP's
    # `COLMAP_build` attribute is the same text without them; the two surfaces
    # must stay distinct, so neither pin may be "fixed" into the other.
    assert toolchain_module.QUALIFIED_COLMAP_BUILD_BANNER == (
        f"({pycolmap_cuda_smoke.EXPECTED_BUILD})"
    )


# ---------------------------------------------------------------------------
# Manifest and executable identity
# ---------------------------------------------------------------------------


def test_loading_binds_the_manifest_digest_to_the_installed_binary(tmp_path):
    prefix = tmp_path / "colmap"
    binary = write_toolchain(prefix)
    toolchain = load_fake_toolchain(prefix)
    try:
        assert toolchain.identity.path == str(binary)
        assert toolchain.identity.sha256 == hashlib.sha256(
            binary.read_bytes()
        ).hexdigest()
        assert toolchain.identity.size_bytes == binary.stat().st_size
        assert toolchain.qualified is False
        assert os.fstat(toolchain.executable_descriptor).st_ino == binary.stat().st_ino
    finally:
        toolchain.close()


def test_toolchain_close_is_idempotent(tmp_path):
    prefix = tmp_path / "colmap"
    write_toolchain(prefix)
    toolchain = load_fake_toolchain(prefix)
    toolchain.close()
    toolchain.close()
    with pytest.raises(OSError):
        os.fstat(toolchain.executable_descriptor)


def test_binary_content_drift_is_rejected(tmp_path):
    prefix = tmp_path / "colmap"
    binary = write_toolchain(prefix)
    payload = bytearray(binary.read_bytes())
    payload[-2:] = b"#\n"
    binary.write_bytes(bytes(payload))

    with pytest.raises(AdapterError) as raised:
        load_fake_toolchain(prefix)

    assert raised.value.code == "REFINE_TOOLCHAIN_UNQUALIFIED"
    assert str(raised.value) == (
        "COLMAP toolchain executable differs from its manifest"
    )


def test_binary_size_drift_is_rejected(tmp_path):
    prefix = tmp_path / "colmap"
    binary = write_toolchain(prefix)
    binary.write_bytes(binary.read_bytes() + b"# grown\n")

    with pytest.raises(AdapterError) as raised:
        load_fake_toolchain(prefix)

    assert str(raised.value) == (
        "COLMAP toolchain executable is not the manifest identity"
    )


def test_missing_manifest_is_rejected(tmp_path):
    prefix = tmp_path / "colmap"
    write_toolchain(prefix)
    (prefix / TOOLCHAIN_MANIFEST_RELATIVE_PATH).unlink()

    with pytest.raises(AdapterError) as raised:
        load_fake_toolchain(prefix)

    assert str(raised.value).startswith("cannot open the COLMAP toolchain file")


def test_missing_prefix_is_rejected(tmp_path):
    with pytest.raises(AdapterError) as raised:
        load_fake_toolchain(tmp_path / "absent")

    assert str(raised.value) == "cannot resolve the COLMAP toolchain prefix"


def test_unreadable_prefix_is_rejected(monkeypatch, tmp_path):
    prefix = tmp_path / "colmap"
    write_toolchain(prefix)
    real_open = os.open

    def refuse(path, flags, *args, **kwargs):
        if path == prefix:
            raise PermissionError(13, "Permission denied")
        return real_open(path, flags, *args, **kwargs)

    monkeypatch.setattr(os, "open", refuse)

    with pytest.raises(AdapterError) as raised:
        load_fake_toolchain(prefix)

    assert str(raised.value).startswith("cannot open the COLMAP toolchain prefix")


@pytest.mark.parametrize(
    ("mutation", "message"),
    (
        ("pretty", "COLMAP toolchain manifest is not canonical JSON"),
        ("extra-key", "COLMAP toolchain manifest has an unknown or missing field"),
        ("missing-key", "COLMAP toolchain manifest has an unknown or missing field"),
        ("schema", "COLMAP toolchain manifest schema is unsupported"),
        ("not-json", "COLMAP toolchain manifest is not canonical ASCII JSON"),
        ("list", "COLMAP toolchain manifest is not canonical JSON"),
    ),
)
def test_noncanonical_manifests_are_rejected(tmp_path, mutation, message):
    prefix = tmp_path / "colmap"
    write_toolchain(prefix)
    manifest_path = prefix / TOOLCHAIN_MANIFEST_RELATIVE_PATH
    document = json.loads(manifest_path.read_text())
    if mutation == "pretty":
        payload = (json.dumps(document, indent=2) + "\n").encode("ascii")
    elif mutation == "extra-key":
        document["unexpected"] = "value"
        payload = canonical_manifest_bytes(document)
    elif mutation == "missing-key":
        document.pop("cudaRoot")
        payload = canonical_manifest_bytes(document)
    elif mutation == "schema":
        document["schema"] = "patina-refine-colmap-toolchain-manifest-v2"
        payload = canonical_manifest_bytes(document)
    elif mutation == "list":
        payload = canonical_manifest_bytes([document])
    else:
        payload = b"{not json}\n"
    manifest_path.write_bytes(payload)

    with pytest.raises(AdapterError) as raised:
        load_fake_toolchain(prefix)

    assert str(raised.value) == message


def test_manifest_prefix_must_match_its_installation(tmp_path):
    prefix = tmp_path / "colmap"
    write_toolchain(prefix, manifest_overrides={"colmapPrefix": "/opt/colmap/9.9.9"})

    with pytest.raises(AdapterError) as raised:
        load_fake_toolchain(prefix)

    assert str(raised.value) == (
        "COLMAP toolchain manifest prefix does not match its installation"
    )


@pytest.mark.parametrize(
    ("field", "value"),
    (
        ("colmapExecutableSha256", "NOTAHASH"),
        ("colmapExecutableSizeBytes", 0),
        ("colmapExecutableSizeBytes", "4096"),
        ("cudaRoot", "usr/local/cuda-11.8"),
        ("cudaRoot", "/usr/local/../cuda"),
        ("nvccVersion", "11.8.89 (with spaces)"),
        ("pycolmapWheelSha256", "ABCDEF"),
        ("colmapBuildBanner", ""),
    ),
)
def test_manifest_field_shapes_are_enforced(field, value):
    fields = qualified_manifest_fields(**{field: value})

    with pytest.raises(AdapterError):
        parse_toolchain_manifest(canonical_manifest_bytes(fields))


def test_manifest_byte_ceiling_is_enforced():
    fields = qualified_manifest_fields(colmapBuildBanner="x" * 127)
    payload = canonical_manifest_bytes(fields)
    padded = payload + b"\x00" * toolchain_module._MAX_TOOLCHAIN_MANIFEST_BYTES

    with pytest.raises(AdapterError) as raised:
        parse_toolchain_manifest(padded)

    assert str(raised.value) == "COLMAP toolchain manifest exceeds its byte ceiling"


@pytest.mark.parametrize("mode", (0o777, 0o775, 0o707))
def test_group_or_other_writable_binary_is_rejected(tmp_path, mode):
    prefix = tmp_path / "colmap"
    write_toolchain(prefix, executable_mode=mode)

    with pytest.raises(AdapterError) as raised:
        load_fake_toolchain(prefix)

    assert str(raised.value) == "COLMAP toolchain file has unsafe ownership or mode"


def test_world_writable_prefix_directory_is_rejected(tmp_path):
    prefix = tmp_path / "colmap"
    write_toolchain(prefix)
    prefix.chmod(0o777)
    try:
        with pytest.raises(AdapterError) as raised:
            load_fake_toolchain(prefix)
    finally:
        prefix.chmod(0o755)

    assert str(raised.value) == "COLMAP toolchain prefix has unsafe ownership or mode"


def test_non_executable_binary_is_rejected(tmp_path):
    prefix = tmp_path / "colmap"
    write_toolchain(prefix, executable_mode=0o644)

    with pytest.raises(AdapterError) as raised:
        load_fake_toolchain(prefix)

    assert str(raised.value) == (
        "COLMAP toolchain executable is not the manifest identity"
    )


def test_elf_requirement_rejects_a_shebang_script(tmp_path):
    prefix = tmp_path / "colmap"
    write_toolchain(prefix)

    with pytest.raises(AdapterError) as raised:
        load_colmap_toolchain(
            prefix,
            remaining_seconds=lambda: 30.0,
            require_elf=True,
            owner_uid=os.geteuid(),
        )

    assert str(raised.value) == "COLMAP toolchain executable is not an ELF binary"


def test_the_installed_prefix_must_be_owned_by_root_by_default(tmp_path):
    """A prefix owned by the *executing* identity is no longer trusted.

    ``_trusted_metadata_ok`` used to accept ``st_uid in (0, os.geteuid())``.
    For a prefix owned by whoever runs the worker that guarantee is worthless
    after the hash: the same identity can rewrite the binary at any time.  The
    qualified box installs ``root:root`` ``0755``, so the production default is
    ``root`` and nothing else.
    """

    prefix = tmp_path / "colmap"
    write_toolchain(prefix)
    assert prefix.stat().st_uid == os.geteuid() != 0

    with pytest.raises(AdapterError) as raised:
        load_colmap_toolchain(
            prefix,
            remaining_seconds=lambda: 30.0,
            require_elf=False,
        )

    assert raised.value.code == "REFINE_TOOLCHAIN_UNQUALIFIED"
    assert str(raised.value) == "COLMAP toolchain prefix has unsafe ownership or mode"


@pytest.mark.parametrize("owner_uid", (-1, True, 1.0, "0", None))
def test_the_declared_owner_uid_must_be_an_exact_non_negative_int(tmp_path, owner_uid):
    prefix = tmp_path / "colmap"
    write_toolchain(prefix)

    with pytest.raises(AdapterError) as raised:
        load_colmap_toolchain(
            prefix,
            remaining_seconds=lambda: 30.0,
            require_elf=False,
            owner_uid=owner_uid,
        )

    assert str(raised.value) == "COLMAP toolchain load requires a declared owner uid"


def test_the_recorded_identity_carries_the_inode_timestamps(tmp_path):
    prefix = tmp_path / "colmap"
    binary = write_toolchain(prefix)
    toolchain = load_fake_toolchain(prefix)
    try:
        metadata = binary.stat()
        assert toolchain.identity.ctime_ns == metadata.st_ctime_ns
        assert toolchain.identity.mtime_ns == metadata.st_mtime_ns
    finally:
        toolchain.close()


def test_executable_identity_rejects_a_swapped_inode(tmp_path):
    prefix = tmp_path / "colmap"
    binary = write_toolchain(prefix)
    toolchain = load_fake_toolchain(prefix)
    try:
        verify_executable_identity(
            toolchain.identity, toolchain.executable_descriptor
        )
        replacement = tmp_path / "replacement"
        replacement.write_bytes(binary.read_bytes())
        replacement.chmod(0o755)
        replacement.replace(binary)

        with pytest.raises(AdapterError) as raised:
            verify_executable_identity(
                toolchain.identity, toolchain.executable_descriptor
            )
    finally:
        toolchain.close()

    assert raised.value.code == "REFINE_ENGINE_FAILED"
    assert str(raised.value) == (
        "pinned COLMAP executable identity changed before execution"
    )


def test_executable_identity_rejects_an_in_place_byte_swap(tmp_path):
    """Same-length ``pwrite`` into the verified inode must be rejected.

    Nothing about the inode changes: only the bytes do, and the qualified path
    execs that very descriptor.
    """

    prefix = tmp_path / "colmap"
    binary = write_toolchain(prefix, program="print('unused')")
    toolchain = load_fake_toolchain(prefix)
    try:
        verify_executable_identity(toolchain.identity, toolchain.executable_descriptor)
        original = binary.read_bytes()
        swapped = original.replace(b"print('unused')", b"print('pwned!')")
        assert len(swapped) == len(original)
        assert swapped != original
        descriptor = os.open(binary, os.O_WRONLY)
        try:
            assert os.pwrite(descriptor, swapped, 0) == len(swapped)
        finally:
            os.close(descriptor)

        with pytest.raises(AdapterError) as raised:
            verify_executable_identity(
                toolchain.identity, toolchain.executable_descriptor
            )
    finally:
        toolchain.close()

    assert raised.value.code == "REFINE_ENGINE_FAILED"
    assert str(raised.value) == (
        "pinned COLMAP executable identity changed before execution"
    )


def test_executable_identity_requires_a_recorded_identity():
    with pytest.raises(AdapterError) as raised:
        verify_executable_identity(object(), 0)

    assert raised.value.code == "REFINE_ENGINE_FAILED"


def test_executable_identity_missing_path_is_a_fixed_failure(tmp_path):
    identity = ColmapExecutableIdentity(
        path=str(tmp_path / "absent"),
        sha256="0" * 64,
        size_bytes=1,
        device=1,
        inode=1,
        nlink=1,
        mode=0o100755,
        uid=0,
        gid=0,
        ctime_ns=1,
        mtime_ns=1,
    )

    with pytest.raises(AdapterError) as raised:
        verify_executable_identity(identity, 0)

    assert str(raised.value) == (
        "cannot re-verify the pinned COLMAP executable identity"
    )
    assert raised.value.__cause__ is None


# ---------------------------------------------------------------------------
# Qualified box identity
# ---------------------------------------------------------------------------


def test_qualified_box_identity_accepts_the_receipted_values():
    assert assert_qualified_box_identity(_qualified_manifest()) is None


@pytest.mark.parametrize(
    ("field", "value"),
    (
        ("appDir", "/opt/patina/scan-pipeline-next"),
        ("colmapBuildBanner", "Commit deadbee on 2026-03-18 with CUDA"),
        ("colmapPrefix", "/opt/colmap/4.0.3"),
        ("colmapSourceCommit", "0" * 40),
        ("colmapSourceTree", "1" * 40),
        ("colmapVersion", "4.0.3"),
        ("cudaArchitecture", "86"),
        ("cudaRelease", "12.0"),
        ("cudaRoot", "/usr/local/cuda-12.0"),
        ("hostCCompiler", "/usr/bin/gcc-12"),
        ("hostCxxCompiler", "/usr/bin/g++-12"),
        ("nvccVersion", "12.0.140"),
        ("nvidiaDriverVersion", "590.1.2"),
        ("pycolmapVersion", "4.0.3"),
    ),
)
def test_qualified_box_identity_rejects_every_pinned_drift(field, value):
    with pytest.raises(AdapterError) as raised:
        assert_qualified_box_identity(_qualified_manifest(**{field: value}))

    assert raised.value.code == "REFINE_TOOLCHAIN_UNQUALIFIED"
    assert field in str(raised.value)


@pytest.mark.parametrize("version", ("11.5", "11.5.0", "11.5.7"))
def test_host_compiler_series_accepts_its_patch_releases(version):
    assert (
        assert_qualified_box_identity(_qualified_manifest(hostCompilerVersion=version))
        is None
    )


@pytest.mark.parametrize("version", ("11.4.0", "11.50", "12.5", "1.11.5"))
def test_host_compiler_series_rejects_anything_else(version):
    with pytest.raises(AdapterError) as raised:
        assert_qualified_box_identity(_qualified_manifest(hostCompilerVersion=version))

    assert "hostCompilerVersion" in str(raised.value)


# ---------------------------------------------------------------------------
# Command allowlist
# ---------------------------------------------------------------------------


def test_the_allowlist_is_exactly_the_i87_cli_surface():
    assert set(toolchain_module.COLMAP_COMMAND_ALLOWLIST) == {"point_triangulator"}


def test_the_backend_argv_builder_satisfies_the_allowlist(tmp_path):
    from patina_scan_worker.refine_colmap_backend import (
        primary_point_triangulator_argv,
    )

    workspace = _workspace(tmp_path)
    argv = primary_point_triangulator_argv(
        colmap=Path("/opt/colmap/4.0.2/bin/colmap"),
        database_path=workspace / "database.db",
        image_path=workspace / "images",
        seed_model_path=workspace / "seed",
        triangulated_model_path=workspace / "triangulated",
    )

    assert (
        validate_allowlisted_argv(
            argv,
            executable_path="/opt/colmap/4.0.2/bin/colmap",
            workspace=workspace,
        )
        == argv
    )


@pytest.mark.parametrize(
    "subcommand",
    ("gui", "mapper", "pose_prior_mapper", "bundle_adjuster", "model_converter"),
)
def test_non_allowlisted_subcommands_are_rejected(tmp_path, subcommand):
    workspace = _workspace(tmp_path)
    argv = list(allowlisted_argv("/opt/colmap/4.0.2/bin/colmap", workspace))
    argv[1] = subcommand

    with pytest.raises(AdapterError) as raised:
        validate_allowlisted_argv(
            argv,
            executable_path="/opt/colmap/4.0.2/bin/colmap",
            workspace=workspace,
        )

    assert str(raised.value) == "COLMAP subcommand is not on the pilot allowlist"


def test_argv0_must_be_the_verified_executable(tmp_path):
    workspace = _workspace(tmp_path)
    argv = allowlisted_argv("/usr/local/bin/colmap", workspace)

    with pytest.raises(AdapterError) as raised:
        validate_allowlisted_argv(
            argv,
            executable_path="/opt/colmap/4.0.2/bin/colmap",
            workspace=workspace,
        )

    assert str(raised.value) == "pinned COLMAP argv[0] is not the verified executable"


def test_option_order_must_be_exact(tmp_path):
    workspace = _workspace(tmp_path)
    argv = list(allowlisted_argv("/opt/colmap/4.0.2/bin/colmap", workspace))
    argv[2], argv[3], argv[4], argv[5] = argv[4], argv[5], argv[2], argv[3]

    with pytest.raises(AdapterError) as raised:
        validate_allowlisted_argv(
            argv,
            executable_path="/opt/colmap/4.0.2/bin/colmap",
            workspace=workspace,
        )

    assert str(raised.value) == (
        "COLMAP subcommand options must use the allowlisted order"
    )


@pytest.mark.parametrize(
    "extra",
    (("--gpu_index", "0"), ("--Mapper.num_threads", "8")),
)
def test_undeclared_options_cannot_be_appended(tmp_path, extra):
    workspace = _workspace(tmp_path)
    argv = allowlisted_argv("/opt/colmap/4.0.2/bin/colmap", workspace) + extra

    with pytest.raises(AdapterError) as raised:
        validate_allowlisted_argv(
            argv,
            executable_path="/opt/colmap/4.0.2/bin/colmap",
            workspace=workspace,
        )

    assert str(raised.value) == (
        "COLMAP subcommand argv does not match its allowlisted shape"
    )


@pytest.mark.parametrize(
    ("index", "value"),
    ((11, "0"), (13, "1"), (15, "7")),
)
def test_literal_option_values_are_exact(tmp_path, index, value):
    workspace = _workspace(tmp_path)
    argv = list(allowlisted_argv("/opt/colmap/4.0.2/bin/colmap", workspace))
    argv[index] = value

    with pytest.raises(AdapterError) as raised:
        validate_allowlisted_argv(
            argv,
            executable_path="/opt/colmap/4.0.2/bin/colmap",
            workspace=workspace,
        )

    assert str(raised.value) == "COLMAP subcommand option value is not allowlisted"


@pytest.mark.parametrize(
    "value",
    (
        "/etc/passwd",
        "relative/database.db",
        "/tmp/../etc/shadow",
        "",
    ),
)
def test_path_options_must_stay_inside_the_workspace(tmp_path, value):
    workspace = _workspace(tmp_path)
    argv = list(allowlisted_argv("/opt/colmap/4.0.2/bin/colmap", workspace))
    argv[3] = value or "x"
    if not value:
        argv[3] = str(workspace)

    with pytest.raises(AdapterError) as raised:
        validate_allowlisted_argv(
            argv,
            executable_path="/opt/colmap/4.0.2/bin/colmap",
            workspace=workspace,
        )

    assert "pinned COLMAP path option" in str(raised.value)


def test_path_options_reject_workspace_traversal(tmp_path):
    workspace = _workspace(tmp_path)
    argv = list(allowlisted_argv("/opt/colmap/4.0.2/bin/colmap", workspace))
    argv[3] = str(workspace / ".." / "escape.db")

    with pytest.raises(AdapterError) as raised:
        validate_allowlisted_argv(
            argv,
            executable_path="/opt/colmap/4.0.2/bin/colmap",
            workspace=workspace,
        )

    assert str(raised.value) == (
        "pinned COLMAP path option must stay inside its workspace"
    )


def test_argv_item_ceiling_is_explicit(tmp_path):
    workspace = _workspace(tmp_path)
    argv = ("/opt/colmap/4.0.2/bin/colmap",) * (toolchain_module._MAX_ARGV_ITEMS + 1)

    with pytest.raises(AdapterError) as raised:
        validate_allowlisted_argv(
            argv,
            executable_path="/opt/colmap/4.0.2/bin/colmap",
            workspace=workspace,
        )

    assert str(raised.value) == "pinned COLMAP argv exceeds the allowlist item limit"


@pytest.mark.parametrize("item", (b"/opt/colmap", "", "with\x00nul"))
def test_argv_items_must_be_exact_non_empty_strings(tmp_path, item):
    workspace = _workspace(tmp_path)

    with pytest.raises(AdapterError) as raised:
        validate_allowlisted_argv(
            ("/opt/colmap/4.0.2/bin/colmap", "point_triangulator", item),
            executable_path="/opt/colmap/4.0.2/bin/colmap",
            workspace=workspace,
        )

    assert str(raised.value) == "pinned COLMAP argv must be exact non-empty strings"


def test_argv_container_faults_do_not_leak(tmp_path):
    class Hostile:
        def __iter__(self):
            raise RuntimeError("DO_NOT_LEAK_ARGV")

    with pytest.raises(AdapterError) as raised:
        validate_allowlisted_argv(
            Hostile(),
            executable_path="/opt/colmap/4.0.2/bin/colmap",
            workspace=_workspace(tmp_path),
        )

    assert str(raised.value) == "cannot normalize the pinned COLMAP argv"
    assert "DO_NOT_LEAK" not in str(raised.value)


# ---------------------------------------------------------------------------
# Environment allowlist
# ---------------------------------------------------------------------------


def test_production_environment_is_the_exact_closed_allowlist(tmp_path):
    workspace = _workspace(tmp_path)
    environ = dict(
        build_command_environment(_qualified_manifest(), workspace=workspace)
    )

    assert environ == {
        "CUDA_CACHE_PATH": "/opt/patina/scan-pipeline/.cache/nv",
        "CUDA_HOME": "/usr/local/cuda-11.8",
        "HOME": "/opt/patina/scan-pipeline",
        "LANG": "C",
        "LC_ALL": "C",
        "LD_LIBRARY_PATH": "/usr/local/cuda-11.8/lib64",
        "PATH": "/usr/local/cuda-11.8/bin",
        "QT_QPA_PLATFORM": "offscreen",
        "TMPDIR": str(workspace),
        "XDG_CACHE_HOME": "/opt/patina/scan-pipeline/.cache",
        "XDG_CONFIG_HOME": "/opt/patina/scan-pipeline/.config",
        "XDG_DATA_HOME": "/opt/patina/scan-pipeline/.data",
        "XDG_STATE_HOME": "/opt/patina/scan-pipeline/.state",
    }
    assert tuple(sorted(environ)) == COMMAND_ENVIRONMENT_ALLOWLIST


def test_production_environment_matches_the_installed_systemd_sandbox(tmp_path):
    """Every writable surface must already be a systemd ReadWritePaths entry."""

    base = (UNIT_DIR / "patina-scan-worker.service").read_text(encoding="utf-8")
    gpu = (UNIT_DIR / "patina-scan-worker.gpu.conf").read_text(encoding="utf-8")
    read_write = next(
        line.split("=", 1)[1].split()
        for line in base.splitlines()
        if line.startswith("ReadWritePaths=")
    )
    environ = dict(
        build_command_environment(_qualified_manifest(), workspace=_workspace(tmp_path))
    )

    for name in toolchain_module._APP_DIR_CONFINED_ENVIRONMENT:
        value = PurePosixPath(environ[name])
        assert value == PurePosixPath(QUALIFIED_APP_DIR) or any(
            value.is_relative_to(PurePosixPath(entry)) for entry in read_write
        ), name
    assert f"Environment=CUDA_CACHE_PATH={environ['CUDA_CACHE_PATH']}" in gpu
    assert f"Environment=CUDA_HOME={environ['CUDA_HOME']}" in gpu
    for name in (
        "XDG_CONFIG_HOME",
        "XDG_CACHE_HOME",
        "XDG_DATA_HOME",
        "XDG_STATE_HOME",
    ):
        assert f"Environment={name}={environ[name]}" in base


def test_environment_rejects_a_missing_or_extra_variable(tmp_path):
    workspace = _workspace(tmp_path)
    manifest = _qualified_manifest()
    environ = dict(build_command_environment(manifest, workspace=workspace))
    environ["LD_PRELOAD"] = "/tmp/evil.so"

    with pytest.raises(AdapterError) as raised:
        validate_command_environment(environ, manifest=manifest, workspace=workspace)

    assert str(raised.value) == (
        "COLMAP command environment is not exactly the allowlist"
    )

    environ.pop("LD_PRELOAD")
    environ.pop("QT_QPA_PLATFORM")
    with pytest.raises(AdapterError):
        validate_command_environment(environ, manifest=manifest, workspace=workspace)


@pytest.mark.parametrize(
    "name",
    toolchain_module._APP_DIR_CONFINED_ENVIRONMENT,
)
def test_environment_writable_surfaces_may_not_escape_app_dir(tmp_path, name):
    workspace = _workspace(tmp_path)
    manifest = _qualified_manifest()
    environ = dict(build_command_environment(manifest, workspace=workspace))
    environ[name] = "/var/tmp/escape"

    with pytest.raises(AdapterError) as raised:
        validate_command_environment(environ, manifest=manifest, workspace=workspace)

    assert str(raised.value) == f"COLMAP command environment {name} escapes APP_DIR"


def test_environment_tmpdir_must_be_the_private_workspace(tmp_path):
    workspace = _workspace(tmp_path)
    manifest = _qualified_manifest()
    environ = dict(build_command_environment(manifest, workspace=workspace))
    environ["TMPDIR"] = "/tmp"

    with pytest.raises(AdapterError) as raised:
        validate_command_environment(environ, manifest=manifest, workspace=workspace)

    assert str(raised.value) == (
        "COLMAP command TMPDIR must be the private command workspace"
    )


@pytest.mark.parametrize(
    ("value", "message"),
    (
        ("", "COLMAP command environment LANG must be a non-empty string"),
        ("café", "COLMAP command environment LANG must be ASCII"),
        ("C\nLD_PRELOAD=x", "COLMAP command environment LANG contains control bytes"),
        ("x" * 5000, "COLMAP command environment LANG exceeds its byte ceiling"),
    ),
)
def test_environment_values_are_bounded_ascii(tmp_path, value, message):
    workspace = _workspace(tmp_path)
    manifest = _qualified_manifest()
    environ = dict(build_command_environment(manifest, workspace=workspace))
    environ["LANG"] = value

    with pytest.raises(AdapterError) as raised:
        validate_command_environment(environ, manifest=manifest, workspace=workspace)

    assert str(raised.value) == message


def test_environment_requires_a_validated_manifest(tmp_path):
    with pytest.raises(AdapterError) as raised:
        build_command_environment(object(), workspace=_workspace(tmp_path))

    assert str(raised.value) == (
        "COLMAP command environment requires a validated manifest"
    )


# ---------------------------------------------------------------------------
# Deadline propagation
# ---------------------------------------------------------------------------


def _context(seconds: float) -> NativeChildContext:
    return NativeChildContext(time.monotonic() + seconds)


def test_carried_probe_returns_the_minimum_of_context_and_deadline():
    probe = carried_deadline_probe(
        _context(600.0), RefineDeadline(time.monotonic() + 5.0)
    )

    assert probe() <= 5.0


def test_carried_probe_rejects_a_lookalike_context():
    class Forged:
        expires_at_monotonic_s = time.monotonic() + 60.0

        def remaining_seconds(self):
            return 60.0

    with pytest.raises(AdapterError) as raised:
        carried_deadline_probe(Forged(), RefineDeadline(time.monotonic() + 5.0))

    assert raised.value.code == "REFINE_ENGINE_FAILED"


def test_carried_probe_fails_closed_on_an_exhausted_deadline():
    with pytest.raises(AdapterError) as raised:
        carried_deadline_probe(_context(60.0), RefineDeadline(time.monotonic() - 1.0))

    assert raised.value.code == "REFINE_ENGINE_TIMEOUT"


def test_binary_hashing_observes_the_carried_deadline(tmp_path):
    prefix = tmp_path / "colmap"
    write_toolchain(prefix)
    calls = {"count": 0}

    def probe() -> float:
        calls["count"] += 1
        # 1 = entry, 2 = manifest read, 3 = the first executable hash block.
        if calls["count"] > 2:
            raise AdapterError("deadline exhausted", "REFINE_ENGINE_TIMEOUT")
        return 10.0

    with pytest.raises(AdapterError) as raised:
        load_colmap_toolchain(
            prefix,
            remaining_seconds=probe,
            require_elf=False,
            owner_uid=os.geteuid(),
        )

    assert raised.value.code == "REFINE_ENGINE_TIMEOUT"
    assert calls["count"] == 3


def test_a_failed_hash_releases_the_executable_descriptor(monkeypatch, tmp_path):
    prefix = tmp_path / "colmap"
    write_toolchain(prefix)
    closed: list[int] = []
    real_close = os.close
    monkeypatch.setattr(
        os,
        "close",
        lambda descriptor: (closed.append(descriptor), real_close(descriptor))[1],
    )
    opened: list[int] = []
    real_open = os.open
    monkeypatch.setattr(
        os,
        "open",
        lambda *args, **kwargs: (
            opened.append(real_open(*args, **kwargs)) or opened[-1]
        ),
    )

    def probe() -> float:
        if len(opened) >= 3:
            raise AdapterError("deadline exhausted", "REFINE_ENGINE_TIMEOUT")
        return 10.0

    with pytest.raises(AdapterError):
        load_colmap_toolchain(
            prefix,
            remaining_seconds=probe,
            require_elf=False,
            owner_uid=os.geteuid(),
        )

    assert set(opened) == set(closed)


def test_planning_requires_a_carried_deadline_probe(tmp_path):
    prefix = tmp_path / "colmap"
    write_toolchain(prefix)
    toolchain = load_fake_toolchain(prefix)
    try:
        with pytest.raises(AdapterError) as raised:
            plan_pinned_colmap_command(
                allowlisted_argv(toolchain.identity.path, _workspace(tmp_path)),
                toolchain=toolchain,
                workspace=_workspace(tmp_path) if False else tmp_path / "work",
                remaining_seconds=None,
                descriptor_exec=False,
            )
    finally:
        toolchain.close()

    assert str(raised.value) == (
        "pinned COLMAP planning requires a carried deadline probe"
    )


# ---------------------------------------------------------------------------
# Sealing and the qualified planner
# ---------------------------------------------------------------------------


def test_a_handbuilt_pinned_command_is_never_verified(tmp_path):
    forged = PinnedColmapCommand(
        argv=("/opt/colmap/4.0.2/bin/colmap", "point_triangulator"),
        environ=(),
        workspace=str(tmp_path),
        identity=ColmapExecutableIdentity(
            path="/opt/colmap/4.0.2/bin/colmap",
            sha256="0" * 64,
            size_bytes=1,
            device=1,
            inode=1,
            nlink=1,
            mode=0o100755,
            uid=0,
            gid=0,
            ctime_ns=1,
            mtime_ns=1,
        ),
        executable_descriptor=0,
        executable_alias="/bin/sh",
        # Claiming the production shape by hand buys nothing: the seal, not the
        # flags, is what proves this module built the plan in this process.
        descriptor_pinned=True,
        qualified=True,
    )

    assert forged.is_verified_pinned_command is False


def test_a_sealed_plan_is_bound_to_the_planning_process(monkeypatch, tmp_path):
    prefix = tmp_path / "colmap"
    write_toolchain(prefix)
    workspace = _workspace(tmp_path)
    toolchain = load_fake_toolchain(prefix)
    try:
        execution = plan_fake_command(toolchain, workspace)
        assert execution.is_verified_pinned_command is True
        assert execution.workspace == str(workspace)
        assert execution.descriptor_pinned is False
        assert execution.executable_alias == toolchain.identity.path
        monkeypatch.setattr(os, "getpid", lambda: 1)
        assert execution.is_verified_pinned_command is False
    finally:
        toolchain.close()


def test_descriptor_exec_alias_points_at_the_open_descriptor(monkeypatch, tmp_path):
    prefix = tmp_path / "colmap"
    write_toolchain(prefix)
    workspace = _workspace(tmp_path)
    fake_proc = tmp_path / "proc-fd"
    fake_proc.mkdir()
    monkeypatch.setattr(toolchain_module, "_PROC_FD_ROOT", PurePosixPath(fake_proc))
    toolchain = load_fake_toolchain(prefix)
    try:
        execution = plan_pinned_colmap_command(
            allowlisted_argv(toolchain.identity.path, workspace),
            toolchain=toolchain,
            workspace=workspace,
            remaining_seconds=lambda: 30.0,
            descriptor_exec=True,
        )
        assert execution.descriptor_pinned is True
        assert execution.executable_alias == str(
            fake_proc / str(toolchain.executable_descriptor)
        )
        assert execution.passed_descriptors() == (toolchain.executable_descriptor,)
    finally:
        toolchain.close()


def test_descriptor_exec_requires_a_real_proc_fd_root(monkeypatch, tmp_path):
    prefix = tmp_path / "colmap"
    write_toolchain(prefix)
    workspace = _workspace(tmp_path)
    monkeypatch.setattr(
        toolchain_module, "_PROC_FD_ROOT", PurePosixPath(tmp_path / "absent")
    )
    toolchain = load_fake_toolchain(prefix)
    try:
        with pytest.raises(AdapterError) as raised:
            plan_pinned_colmap_command(
                allowlisted_argv(toolchain.identity.path, workspace),
                toolchain=toolchain,
                workspace=workspace,
                remaining_seconds=lambda: 30.0,
                descriptor_exec=True,
            )
    finally:
        toolchain.close()

    assert str(raised.value) == (
        "descriptor-pinned COLMAP execution requires Linux /proc/self/fd"
    )


def test_qualified_planner_rejects_an_unqualified_toolchain(tmp_path):
    prefix = tmp_path / "colmap"
    write_toolchain(prefix)
    workspace = _workspace(tmp_path)
    toolchain = load_fake_toolchain(prefix)
    try:
        with pytest.raises(AdapterError) as raised:
            plan_qualified_colmap_command(
                allowlisted_argv(toolchain.identity.path, workspace),
                toolchain=toolchain,
                workspace=workspace,
                context=_context(60.0),
                deadline=RefineDeadline(time.monotonic() + 60.0),
            )
    finally:
        toolchain.close()

    assert str(raised.value) == (
        "production COLMAP planning requires the qualified toolchain"
    )


def test_qualified_planner_still_rechecks_the_box_identity(tmp_path):
    prefix = tmp_path / "colmap"
    write_toolchain(prefix)
    workspace = _workspace(tmp_path)
    toolchain = load_fake_toolchain(prefix, qualified=True)
    try:
        with pytest.raises(AdapterError) as raised:
            plan_qualified_colmap_command(
                allowlisted_argv(toolchain.identity.path, workspace),
                toolchain=toolchain,
                workspace=workspace,
                context=_context(60.0),
                deadline=RefineDeadline(time.monotonic() + 60.0),
            )
    finally:
        toolchain.close()

    assert "drifted from the qualified box" in str(raised.value)


def test_qualified_loader_uses_only_the_pinned_prefix(monkeypatch):
    seen: dict[str, object] = {}

    def fake_load(prefix, *, remaining_seconds, require_elf, qualified, **extra):
        seen.update(
            prefix=prefix,
            require_elf=require_elf,
            qualified=qualified,
            # Production must not pass an owner uid at all: it takes the root
            # default.  A test-only relaxation leaking into this path would be
            # exactly the amplifier the review found.
            extra=extra,
        )
        raise AdapterError("stop", "REFINE_TOOLCHAIN_UNQUALIFIED")

    monkeypatch.setattr(toolchain_module, "load_colmap_toolchain", fake_load)

    with pytest.raises(AdapterError):
        toolchain_module.load_qualified_colmap_toolchain(
            context=_context(60.0),
            deadline=RefineDeadline(time.monotonic() + 60.0),
        )

    assert seen == {
        "prefix": Path(QUALIFIED_COLMAP_PREFIX),
        "require_elf": True,
        "qualified": True,
        "extra": {},
    }


def test_a_plan_carries_its_qualification_and_descriptor_pinning(monkeypatch, tmp_path):
    """The two facts the supervisor needs must travel inside the sealed plan.

    Without them a plan built from any prefix with ``descriptor_exec=False``
    was structurally indistinguishable from the production form.
    """

    prefix = tmp_path / "colmap"
    write_toolchain(prefix)
    workspace = _workspace(tmp_path)
    fake_proc = tmp_path / "proc-fd"
    fake_proc.mkdir()
    monkeypatch.setattr(toolchain_module, "_PROC_FD_ROOT", PurePosixPath(fake_proc))

    for toolchain_qualified in (False, True):
        toolchain = load_fake_toolchain(prefix, qualified=toolchain_qualified)
        try:
            for descriptor_exec in (False, True):
                execution = plan_pinned_colmap_command(
                    allowlisted_argv(toolchain.identity.path, workspace),
                    toolchain=toolchain,
                    workspace=workspace,
                    remaining_seconds=lambda: 30.0,
                    descriptor_exec=descriptor_exec,
                )
                assert execution.qualified is toolchain_qualified
                assert execution.descriptor_pinned is descriptor_exec
        finally:
            toolchain.close()


@pytest.mark.parametrize("descriptor_exec", (1, 0, "yes", None))
def test_planning_requires_an_exact_descriptor_exec_flag(tmp_path, descriptor_exec):
    prefix = tmp_path / "colmap"
    write_toolchain(prefix)
    workspace = _workspace(tmp_path)
    toolchain = load_fake_toolchain(prefix, qualified=True)
    try:
        with pytest.raises(AdapterError) as raised:
            plan_pinned_colmap_command(
                allowlisted_argv(toolchain.identity.path, workspace),
                toolchain=toolchain,
                workspace=workspace,
                remaining_seconds=lambda: 30.0,
                descriptor_exec=descriptor_exec,
            )
    finally:
        toolchain.close()

    assert str(raised.value) == (
        "pinned COLMAP planning requires an exact descriptor_exec flag"
    )


@pytest.mark.skipif(
    not sys.platform.startswith("linux"),
    # This test asserts only the alias *string*; it launches nothing.  What it
    # proves off a real /proc is that planning resolves the live descriptor
    # number, not that the descriptor is what gets exec'd -- that is
    # test_descriptor_pinned_child_runs_the_pinned_inode_on_linux.
    reason="the real /proc/self/fd alias string exists only on Linux",
)
def test_real_proc_fd_alias_is_used_on_linux(tmp_path):
    prefix = tmp_path / "colmap"
    write_toolchain(prefix)
    workspace = _workspace(tmp_path)
    toolchain = load_fake_toolchain(prefix)
    try:
        execution = plan_pinned_colmap_command(
            allowlisted_argv(toolchain.identity.path, workspace),
            toolchain=toolchain,
            workspace=workspace,
            remaining_seconds=lambda: 30.0,
            descriptor_exec=True,
        )
        assert execution.executable_alias == (
            f"/proc/self/fd/{toolchain.executable_descriptor}"
        )
    finally:
        toolchain.close()


def test_planning_requires_a_real_toolchain(tmp_path):
    class Forged:
        identity = ColmapExecutableIdentity(
            path="/opt/colmap/4.0.2/bin/colmap",
            sha256="0" * 64,
            size_bytes=1,
            device=1,
            inode=1,
            nlink=1,
            mode=0o100755,
            uid=0,
            gid=0,
            ctime_ns=1,
            mtime_ns=1,
        )
        manifest = _qualified_manifest()
        executable_descriptor = 0
        qualified = True

    with pytest.raises(AdapterError) as raised:
        plan_pinned_colmap_command(
            allowlisted_argv("/opt/colmap/4.0.2/bin/colmap", _workspace(tmp_path)),
            toolchain=Forged(),
            workspace=tmp_path / "work",
            remaining_seconds=lambda: 30.0,
            descriptor_exec=False,
        )

    assert str(raised.value) == "pinned COLMAP planning requires a verified toolchain"
    assert type(ColmapToolchain) is type


def test_a_symlinked_prefix_is_rejected(tmp_path):
    prefix = tmp_path / "colmap"
    write_toolchain(prefix)
    linked = tmp_path / "colmap-link"
    linked.symlink_to(prefix, target_is_directory=True)

    with pytest.raises(AdapterError) as raised:
        load_fake_toolchain(linked)

    assert str(raised.value) == "COLMAP toolchain prefix may not traverse a symlink"


def test_prefix_resolution_failures_are_fixed(monkeypatch, tmp_path):
    prefix = tmp_path / "colmap"
    write_toolchain(prefix)
    monkeypatch.setattr(
        Path,
        "resolve",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(
            RuntimeError("DO_NOT_LEAK_RESOLVE")
        ),
    )

    with pytest.raises(AdapterError) as raised:
        load_fake_toolchain(prefix)

    assert str(raised.value) == "cannot resolve the COLMAP toolchain prefix"
    assert raised.value.__cause__ is None
    assert "DO_NOT_LEAK" not in str(raised.value)
