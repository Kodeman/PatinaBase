"""Killable POSIX process boundary for future native Refine engine calls.

PyCOLMAP calls into native code and cannot be interrupted safely by a Python
thread timeout.  This module starts a fresh ``spawn`` interpreter, establishes
that child as a new POSIX session, and loads the requested engine entry point
only after the parent validates that boundary and returns an exact readiness
acknowledgement.  The parent accepts a result only after the session leader
exits inside the one shared :class:`RefineDeadline`.

The boundary deliberately transports bounded canonical JSON made only from
exact built-in JSON containers/scalars, not Python/native objects or hostile
container subclasses. Future handler entry points must therefore load PyCOLMAP
inside the child, use scratch paths from the request, and return evidence needed
by the parent. They must also be explicitly marked as in-process-only: native
threads are allowed, but an entry point may not spawn an OS child and then
return while that process remains alive. Timeout cleanup kills a whole process
group; successful cleanup relies on this narrower contract. Any durable
artifact publication remains parent-only and must occur only after this
function returns successfully. The Item 4A qualifier remains in-process until
the production handler contract is built and separately qualified.

Scratch is parent-owned. When a caller asks for one, the parent provisions a
private 0700 workspace, pins it and its container by descriptor, leases a
duplicate descriptor down to the child over SCM_RIGHTS, and performs bounded
descriptor-relative cleanup after every child outcome. The child is never given
the path and never removes the root, so a SIGKILLed child cannot strand it.
Containment rests on parent ownership, not on path secrecy: a compromised child
could still resolve its own descriptor through Linux procfs, and a hostile
same-UID actor that already knows the container can still race the cleanup
window. Cleanup therefore pins each entry by descriptor before touching it —
which is what makes an inode-number comparison sound on a filesystem that
recycles inode numbers — quarantine-renames it to an unguessable name inside
the pinned directory, and refuses to remove anything whose identity changed.
That bounds the race rather than eliminating it: the final removal is still
name-based. See ``_purge_leased_entry`` for exactly what is and is not claimed.

Engine outputs travel the other way over the same kind of transport. The parent
names the closed seven-token universe up front; the child opens exactly those
names under the leased ``work/`` directory and hands the descriptors back over
SCM_RIGHTS with a declared size/digest ledger. The parent does not trust that
ledger: it independently opens the same names relative to its OWN pinned lease
descriptor and requires the transported descriptor to be the same ``(st_dev,
st_ino)``.

The descriptor the caller receives is then NEITHER of those. Binding the
child's descriptor to the parent's own open proves *which inode* the engine
wrote; it cannot make that inode stop changing. Anything still holding a
writable descriptor to it -- an escaped grandchild, or any same-UID process
that can read this parent's ``/proc/<pid>/fd`` -- can rewrite those bytes after
the parent has hashed them, and can restore ``st_mtime_ns`` with ``futimens``
so that no ``fstat`` comparison shows it. No single ``fstat`` field survives
both the lease purge and a forging writer, so the freeze is not attempted by
observation at all.

Instead the parent COPIES each output, at receipt, into an ``O_TMPFILE |
O_EXCL`` anonymous file it creates itself in a private 0700 directory on the
lease's own filesystem, and keeps that descriptor. That copy never had a name
in any directory, ``linkat`` can never give it one, and no other process ever
held a descriptor to it. The digest the caller is given is the parent's own
measurement OF THE COPY, read positionally from the copy's own descriptor, and
the run is refused unless it reproduces the child's declaration. Freezing is
therefore a property of how the object was constructed rather than a claim
about what was observed.

What construction alone cannot close is not a name at all: it is
``ptrace_may_access``. Any same-UID process that passes that check against this
parent can take a descriptor out of its table, and there is more than one call
that asks. ``/proc/<pid>/fd`` is the familiar one -- procfs IS a name, and
``proc_fd_access_allowed`` gates the reopen with ``PTRACE_MODE_READ_FSCREDS``.
``pidfd_open(2)`` plus ``pidfd_getfd(2)`` is the other, and it uses no name and
no procfs whatsoever; it gates on ``PTRACE_MODE_ATTACH_REALCREDS``. An earlier
revision of this docstring named only the procfs route and called it "exactly
one route", which under-enumerated: MEASURED at euid 1000 with seccomp
unconfined, a same-UID non-descendant took a held descriptor straight out of the
holder's table with ``pidfd_getfd``, and where the holder had that object open
``O_RDWR`` it wrote through the stolen handle. The two routes are not equally
dangerous to THIS channel -- ``pidfd_getfd`` returns the holder's own open file
description, which here is read-only, while the procfs route can reopen the
inode ``O_RDWR`` -- but both are unauthorised access to a parent-private
descriptor and both are closed by the same act. Docker's default seccomp profile
answers ``EPERM`` for ``pidfd_getfd``, which is why that route stays invisible in
an ordinary container.

Before the first copy exists the parent therefore drops its own ``dumpable``
flag, which makes ``__ptrace_may_access`` refuse EVERY mode -- so both routes
close at once -- to everyone without ``CAP_SYS_PTRACE``. The price is paid in
debuggability, not only in core files: see
``_seal_process_against_procfs_descriptor_theft`` for what an operator can and
cannot still do afterwards, and
``NATIVE_ENGINE_OUTPUT_BYTES_FROZEN_AGAINST_SURVIVING_DESCRIPTORS`` for the
exact scope and for what is still excluded.

The lease is still purged, and the parent still holds each lease-side
descriptor across that purge -- not to prove the returned bytes are frozen,
which the copy already settles, but to catch a child that hardlinked an
artifact out of its sandbox. That is a statement about the child's behaviour,
not about the caller's bytes.

WHAT THE PARENT DOES NOT YET VERIFY: nothing here checks that
``aligned-sparse-model-v1.tar`` is a correct Sim(3) alignment of the seed and
raw pre-BA models, and nothing here computes or compares a pose digest. Those
bytes remain a child PROPOSAL that this module transports intact and proves
identical to the file the parent can see; deciding whether the proposal is
*true* is item 6, which recomputes the alignment and the pose digest from the
descriptors this channel returns. Until item 6 lands,
``NATIVE_ENGINE_OUTPUT_ALIGNMENT_VERIFIED_BY_PARENT`` is False and no caller may
treat an aligned model as verified.
"""

from __future__ import annotations

import errno
import hashlib
import importlib
import json
import math
import multiprocessing
import os
import re
import secrets
import signal
import stat
import sys
import time
from collections.abc import Iterable, Iterator, Mapping
from dataclasses import dataclass, field
from json.encoder import encode_basestring_ascii
from multiprocessing.connection import Connection, wait
from types import MappingProxyType
from typing import Any

from .refine_adapter import AdapterError, RefineDeadline

NATIVE_CHILD_MAX_REQUEST_BYTES = 64 * 1024
NATIVE_CHILD_MAX_RESPONSE_BYTES = 256 * 1024
NATIVE_CHILD_MAX_ERROR_BYTES = 1024
NATIVE_CHILD_MAX_PINNED_FILES = 64
NATIVE_CHILD_MAX_PINNED_TOKEN_BYTES = 64
NATIVE_CHILD_MAX_PINNED_FILE_BYTES = 128 * 1024 * 1024
NATIVE_CHILD_MAX_PINNED_TOTAL_BYTES = 4 * 1024 * 1024 * 1024
# --- The reviewed child->parent output universe (I96 contract clause 5). ------
# Seven descriptors travel back up: the six persistent engine artifacts the
# publisher may later commit, plus one scratch raw pre-BA model snapshot that
# exists only so the evidence builder can compare a fixed track universe before
# and after bundle adjustment.  The scratch snapshot is NEVER published.
#
# The tuple is closed on purpose.  Both ends refuse a token outside it, so the
# child cannot choose what leaves the boundary -- only what those seven files
# contain.  That is the whole reason the parent can treat the transported
# descriptors as corroboration rather than as a proposal about identity.
NATIVE_ENGINE_PERSISTENT_OUTPUT_TOKENS = (
    "adapter-v2.json",
    "aligned-sparse-model-v1.tar",
    "database-v1.db",
    "engine-command-evidence-v1.json",
    "pairs-v2.txt",
    "seed-model-v1.tar",
)
NATIVE_ENGINE_SCRATCH_OUTPUT_TOKENS = ("raw-triangulated-model-snapshot-v1.tar",)
NATIVE_ENGINE_OUTPUT_TOKENS = tuple(
    sorted(
        (
            *NATIVE_ENGINE_PERSISTENT_OUTPUT_TOKENS,
            *NATIVE_ENGINE_SCRATCH_OUTPUT_TOKENS,
        )
    )
)
#: Exactly the reviewed universe, not a generic ceiling.  The pinned-input side
#: proved 64 files; the output side deliberately proves seven, because every
#: additional name would be an unreviewed artifact leaving the boundary.
NATIVE_CHILD_MAX_OUTPUT_FILES = len(NATIVE_ENGINE_OUTPUT_TOKENS)
#: Per-file and aggregate output ceilings.  These are ENGINEERING ESTIMATES, not
#: measurements: at the 400-frame pilot cap a COLMAP database with SIFT
#: descriptors is the largest artifact (order 1-2 GiB), and each sparse-model tar
#: is order 100-300 MiB.  The ceilings sit above that with room to spare while
#: still refusing a runaway.  The parent hashes every accepted byte under the one
#: carried deadline, so an oversized-but-admissible output fails on time rather
#: than silently stalling.  Item 7's real run on scan 95266be1 is what will
#: replace these estimates with a measurement.
NATIVE_CHILD_MAX_OUTPUT_FILE_BYTES = 4 * 1024 * 1024 * 1024
NATIVE_CHILD_MAX_OUTPUT_TOTAL_BYTES = 8 * 1024 * 1024 * 1024
#: The item-6 seam, stated as a fact rather than a placeholder.  This module
#: transports and identity-binds the aligned model; it does not recompute the
#: Sim(3) that produced it and does not compare any pose digest.  Item 6 attaches
#: exactly here: it consumes the parent-owned descriptors this channel returns
#: (``seed-model-v1.tar``, ``raw-triangulated-model-snapshot-v1.tar`` and
#: ``aligned-sparse-model-v1.tar``), recomputes the alignment from the first two,
#: and refuses the third unless its own transform and pose digest agree.  Nothing
#: in this module may be read as that verification having happened.
NATIVE_ENGINE_OUTPUT_ALIGNMENT_VERIFIED_BY_PARENT = False
#: What "frozen" means for the descriptors this channel returns, stated as a
#: fact rather than a hope.  It is True because the returned descriptor is a
#: private anonymous COPY (``O_TMPFILE | O_EXCL``) the parent created after the
#: child was already running, not the lease-side object the engine wrote:
#:
#:   * no directory entry ever pointed at it, so no ``open`` by path reaches it;
#:   * ``O_EXCL`` makes ``linkat`` on it fail, so no name can be created later;
#:   * it was never transported over SCM_RIGHTS and never inherited across an
#:     ``execve``, so no child, grandchild, or escaped descendant ever held a
#:     descriptor to it.  The non-inheritance half is MEASURED across a real
#:     fork+exec with ``close_fds`` disabled, not read off the flags -- see the
#:     note on :func:`_frozen_output_copy` for which guard actually delivers it
#:     and which are restatements that no test can individually kill.
#:
#: THE ROUTES THAT ARE LEFT, and what closes them.  The gate is
#: ``ptrace_may_access`` on this process, NOT procfs; procfs is only the most
#: familiar way to reach it.  A same-UID process that passes that check can:
#:
#:   * reopen ANY descriptor in this process's table through ``/proc/<pid>/fd``
#:     (``proc_fd_access_allowed`` -> ``PTRACE_MODE_READ_FSCREDS``), and
#:   * take a descriptor outright with ``pidfd_open(2)`` + ``pidfd_getfd(2)``
#:     (``PTRACE_MODE_ATTACH_REALCREDS``), which involves NO name and NO procfs
#:     at all -- an earlier revision of this comment enumerated only the first
#:     route and called ``/proc/<pid>/fd`` "exactly one route", which was wrong.
#:
#: Both are closed by the same act, because both funnel through
#: ``__ptrace_may_access``.  MEASURED, euid 1000, this repository's Linux test
#: container (``6.12.76`` aarch64, overlayfs, no Yama), seccomp UNCONFINED:
#: against an unsealed target ``pidfd_getfd`` returned a descriptor (rc=4,
#: errno=0), and where the holder had that object open ``O_RDWR`` the attacker
#: wrote through it; sealed, the same attempt returned ``EPERM``.  The
#: descriptors THIS channel hands out are read-only, so a pidfd theft of one is a
#: read rather than a rewrite -- which is exactly why
#: ``test_the_sealed_boundary_refuses_a_pidfd_getfd_theft`` asserts that the
#: syscall was REFUSED and not merely that the bytes are unchanged; the latter is
#: green against a process with no seal at all.  Under Docker's DEFAULT seccomp
#: profile ``pidfd_getfd`` returns ``EPERM`` whether or not the target is sealed,
#: which is why this route is invisible in an ordinary container and why that
#: test skips there rather than reporting a proof it did not make.
#:
#: ``yama.ptrace_scope`` does NOT gate the PROCFS route at any setting, and an
#: earlier revision of this comment claiming it did was wrong.  That correction is
#: READ OFF THE KERNEL SOURCE, not measured: ``yama_ptrace_access_check`` returns
#: 0 immediately unless the request carries ``PTRACE_MODE_ATTACH``, while
#: ``/proc/<pid>/fd`` reaches ``ptrace_may_access`` through
#: ``proc_fd_access_allowed`` with ``PTRACE_MODE_READ_FSCREDS``, which Yama never
#: inspects.  ALSO READ OFF THE SOURCE, and pointing the other way: the
#: ``pidfd_getfd`` route DOES carry ``PTRACE_MODE_ATTACH_REALCREDS``, so a Yama
#: host at ``ptrace_scope >= 1`` would additionally restrict that one for a
#: non-descendant.  Neither statement is confirmed here -- no environment this
#: repository can run ships Yama at all -- and no reader should treat either as
#: confirmed.  Nothing in this module's posture depends on Yama either way.
#:
#: THE PROCFS ROUTE ITSELF IS MEASURED, and the measurement is a gate rather than
#: a transcript: in this repository's Linux test container (``6.12.76`` aarch64,
#: overlayfs, no Yama) a same-UID non-descendant holding no ``CAP_SYS_PTRACE``
#: reopened a held descriptor ``O_RDWR`` through ``/proc/<pid>/fd`` and rewrote
#: it, at both ``euid 0`` and ``euid 1000``.
#:
#: What closes both is :func:`_seal_process_against_procfs_descriptor_theft`,
#: which drops this process's ``dumpable`` flag before any frozen copy exists.
#: ``__ptrace_may_access`` refuses every mode -- including
#: ``PTRACE_MODE_READ_FSCREDS`` -- once ``get_dumpable(mm) != SUID_DUMP_USER``,
#: unless the caller holds ``CAP_SYS_PTRACE``.  In the same container the same
#: attacker then got ``EACCES`` and the holder's bytes were unchanged, INCLUDING
#: when it had already opened ``/proc/<pid>/fd`` as a directory before the seal
#: ran -- the access check is on each ``openat``, not on the directory open, so
#: the seal is not a race an attacker wins by starting early.  Both are pinned:
#: ``test_the_sealed_boundary_refuses_a_same_uid_procfs_reopen`` and
#: ``test_a_procfs_directory_opened_before_the_seal_still_cannot_be_used``.  The
#: nameless route is pinned separately by
#: ``test_the_sealed_boundary_refuses_a_pidfd_getfd_theft``, which SKIPS wherever
#: its own positive control cannot be built.
#:
#: WHAT IS STILL EXCLUDED, and is not claimed: root, and any process holding
#: ``CAP_SYS_PTRACE`` in this process's user namespace.  Such an actor can
#: equally attach to the parent and rewrite its memory, so no property of this
#: channel could survive it.
NATIVE_ENGINE_OUTPUT_BYTES_FROZEN_AGAINST_SURVIVING_DESCRIPTORS = True
#: Name prefix for the private 0700 directory the frozen copies are born in.
#: It is a SIBLING of the lease inside the operator's container, never the lease
#: itself: the lease is purged with the child's scratch, and an anonymous file
#: cannot be created against a directory that has already been removed (Linux
#: returns ``EPERM``), so anchoring the copies inside the lease would make them
#: impossible to mint at exactly the moment they are needed.
NATIVE_OUTPUT_FREEZE_VAULT_PREFIX = "patina-refine-native-freeze-"
#: This process's own file-descriptor table.  Used for exactly one thing: to
#: reopen a copy the parent JUST created read-only, so the descriptor handed to
#: the caller carries no write access.
#:
#: ``/proc/<pid>/fd/<n>`` IS a name, and an earlier revision of this comment
#: denying that was wrong: any same-UID process that passes ``ptrace_may_access``
#: can open it.  What makes it safe to use here is not that it cannot be named
#: but that :func:`_seal_process_against_procfs_descriptor_theft` has already
#: made this process's entry unopenable to everyone without ``CAP_SYS_PTRACE``.
#: Nothing outside this process can redirect an entry in it, and the entry stops
#: existing when the descriptor closes.
NATIVE_OUTPUT_FREEZE_ALIAS_DIRECTORY = "/proc/self/fd"
#: ``prctl`` options.  CPython exposes no binding for either, so the UAPI numbers
#: are written out; they are fixed by ``include/uapi/linux/prctl.h`` and have not
#: moved since 2.6.13.  ``SUID_DUMP_DISABLE`` is the value that makes
#: ``__ptrace_may_access`` refuse every mode without ``CAP_SYS_PTRACE``.
_PR_GET_DUMPABLE = 3
_PR_SET_DUMPABLE = 4
_SUID_DUMP_DISABLE = 0
NATIVE_CHILD_TERM_GRACE_S = 0.10
NATIVE_CHILD_KILL_REAP_S = 1.0
NATIVE_WORKSPACE_NAME_PREFIX = "patina-refine-native-workspace-"
NATIVE_WORKSPACE_QUARANTINE_PREFIX = "patina-refine-native-purge-"
# The lease root is a container, never a working directory.  Packet extraction
# requires an empty directory at borrow, and an exec'd COLMAP given TMPDIR/cwd
# would violate that precondition the moment ordering shifted, so each consumer
# gets its own child of the root.  One purge still reclaims everything, at
# depth 2.
NATIVE_WORKSPACE_PACKET_SUBDIRECTORY = "packet"
NATIVE_WORKSPACE_TEMP_SUBDIRECTORY = "tmp"
NATIVE_WORKSPACE_COMMAND_SUBDIRECTORY = "work"
NATIVE_WORKSPACE_SUBDIRECTORIES = (
    NATIVE_WORKSPACE_PACKET_SUBDIRECTORY,
    NATIVE_WORKSPACE_TEMP_SUBDIRECTORY,
    NATIVE_WORKSPACE_COMMAND_SUBDIRECTORY,
)
#: Every leased scratch name is ``NATIVE_WORKSPACE_NAME_PREFIX`` plus 32 hex
#: characters from :func:`_workspace_scratch_name`, so the lease root's length
#: is fully determined by the operator's container path.
NATIVE_WORKSPACE_NAME_BYTES = len(NATIVE_WORKSPACE_NAME_PREFIX) + 32
# --- One argv byte budget, spent by two layers. ------------------------------
# The COLMAP command layer caps every argv item; ``refine_colmap_toolchain``
# imports the ceiling below as ``_MAX_OPTION_VALUE_BYTES`` rather than restating
# it.  Every path option it accepts is the lease root plus a
# ``/<surface>/<name>`` tail, so the two numbers are one budget and were split
# across two modules that could not see each other: provisioning accepted a
# container up to 4096 bytes while argv refused anything over 1024, and a
# scratch root in the gap minted a lease that provisioned cleanly and then made
# every command permanently unplannable.  That gap is unreachable on macOS,
# whose PATH_MAX is 1024, which is why it survived a full review cycle.
#
# The budget is declared HERE, in the layer that mints the path, and imported
# upward.  ``refine_colmap_toolchain`` already imports this module, so the
# reverse edge would be a cycle; and the direction is right on the merits --
# the command layer only has to *read* a ceiling, while this module cannot mint
# a usable lease without knowing it.
NATIVE_WORKSPACE_MAX_ARGV_ITEM_BYTES = 1024
#: Bytes reserved inside that ceiling for the ``/<surface>/<name>`` tail a leased
#: path option appends to the lease root.  The longest tail in the reviewed I87
#: operation plan and seven-descriptor output design is
#: ``/work/engine-command-evidence-v1.json`` (37 bytes).  This is a guaranteed
#: floor, not a cap: a short container leaves far more than 64 bytes of tail
#: room, and the argv ceiling remains the thing actually enforced on argv.
NATIVE_WORKSPACE_MAX_ARGV_PATH_TAIL_BYTES = 64
#: The usable lease-root budget that follows.  Deliberately *not* PATH_MAX: a
#: lease longer than this is refused at provisioning, because the alternative is
#: a directory that exists and can never carry a command.
NATIVE_WORKSPACE_MAX_PATH_BYTES = (
    NATIVE_WORKSPACE_MAX_ARGV_ITEM_BYTES - NATIVE_WORKSPACE_MAX_ARGV_PATH_TAIL_BYTES
)
# Contract for the COLMAP command supervisor (item 3), which is NOT satisfied
# by this module alone:
#   * cwd  = context.workspace_subdirectory_path("work")
#   * TMPDIR = context.workspace_subdirectory_path("tmp")
#     Both are absolute, verified against the leased descriptor at receipt, and
#     free of a /proc/self/fd alias, so `resolve(strict=True) == path` holds and
#     an argv allowlist that rejects relative paths is satisfiable.  That claim
#     is only true because `provision_native_workspace_lease` now REFUSES a
#     `workspace_parent_directory` that is not its own realpath: with a
#     symlinked component anywhere in the operator's container path the check
#     fails and the supervisor rejects the leased work/ outright.
#   * The argv confinement root is context.workspace_path() -- the LEASE ROOT,
#     not work/.  packet/, tmp/ and work/ are all inside it, so an --image_path
#     into the extracted packet is admissible while anything outside the lease
#     is refused.  Rooting confinement at cwd rejects the packet.
#   * The supervisor receives a directory it did NOT create.  Its private
#     workspace validation must accept a pre-existing owned 0700 directory and
#     must not assume ownership of removal: the parent removes the whole lease
#     tree after every child outcome, including SIGKILL.  A child-side rmdir of
#     work/ or tmp/ would fight the parent's purge, not help it.
# Two distinct bounds, not one.  Sharing a single number made a directory at
# the per-directory cap consume the entire whole-tree budget, so cleanup
# abandoned every sibling it had not reached yet and stranded them for good.
NATIVE_WORKSPACE_MAX_DIRECTORY_ENTRIES = 4096
NATIVE_WORKSPACE_MAX_TOTAL_ENTRIES = 65536
# COLMAP runs under ``work/`` — one level down from the lease root — so the
# bound has to leave a working tree real headroom below that.
NATIVE_WORKSPACE_MAX_DEPTH = 16
NATIVE_WORKSPACE_NAME_ATTEMPTS = 8
# ``O_PATH`` references an entry of any type — symlink, unix socket, mode-0
# file — without reading it, following it, or blocking.  Linux has it and the
# qualified production host is Linux; macOS does not, so a few entry types
# there fall back to an unpinned name stat whose identity is only as strong as
# the filesystem's inode-number reuse policy.  This flag exists so that
# degradation is inspectable instead of implied.
NATIVE_WORKSPACE_ENTRY_PIN_IS_UNIVERSAL = hasattr(os, "O_PATH")

_PROTOCOL_VERSION = 1
_ENTRYPOINT_PATTERN = re.compile(r"^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*:[A-Za-z_]\w*$")
_ACK_READY = b"ready-accept-v1"
_ACK_ACCEPT = b"accept-v1"
_TIMEOUT_CODE = "REFINE_ENGINE_TIMEOUT"
_FAILED_CODE = "REFINE_ENGINE_FAILED"
_INVALID_INPUT_CODE = "REFINE_INPUT_INVALID"
#: Every site raising this stays FATAL, re-examined against the errno split
#: below and deliberately left alone.  A cleanup failure is not a statement
#: about capacity, it is a statement that this boundary could not PROVE it
#: released what it took -- a descriptor, a process group, a scratch tree.  The
#: retryable codes all mean "the same task will succeed once the host has the
#: resource again"; that is precisely what an unproven release does not support,
#: because the next attempt takes a second set of the same resources on top of
#: a first set nobody accounted for.  Containment, not capacity.
_CLEANUP_FAILED_CODE = "REFINE_ENGINE_CLEANUP_FAILED"
#: A full lease filesystem is an EXPECTED operational condition for this channel,
#: not a defect, so it gets its own code instead of arriving as an unexplained
#: ``OSError``.  The operator-facing fix is disk headroom; see the transient
#: headroom contract on :func:`_frozen_output_copy`.
#:
#: This string is also a ``RefineFailureCode`` member in ``refine_runner``, and
#: it is RETRYABLE there.  The two constants are compared by
#: ``test_the_no_space_token_is_literally_the_one_the_native_boundary_raises``,
#: because a code minted here and unknown up there does not simply lose its
#: label: the runner's ``AdapterError`` handler falls through to the FATAL
#: ``ARTIFACT_INVALID``, so an unrecognised code silently converts a disk that
#: filled for ten minutes into a task that is dead forever.
_NO_SPACE_CODE = "REFINE_ENGINE_NO_SPACE"
#: The SAME defect shape as ``_NO_SPACE_CODE``, found by auditing every other
#: raise site in this module rather than by another outage.
#:
#: ``_FAILED_CODE`` is retryable in the runner's taxonomy but the runner's
#: ``AdapterError`` handler does not name it, so it falls through to the FATAL
#: ``ARTIFACT_INVALID``.  That fallthrough is CORRECT for the overwhelming
#: majority of this module's ``_FAILED_CODE`` sites, which report DETERMINISTIC
#: facts -- an absent platform primitive, a malformed ledger, a token set that
#: does not match its request, a child that answered with the wrong protocol.
#: Re-running those produces the identical refusal, so failing them fast is the
#: right behaviour and blanket-routing them to retryable would be worse than the
#: bug it fixed.
#:
#: A small minority are not deterministic at all.  Provisioning this module's
#: OWN private scratch -- the workspace lease and the engine-output freeze vault
#: -- can be refused by the HOST rather than by anything about the task: no free
#: inodes or blocks, an exhausted descriptor table, a scratch root the operator
#: has not created yet, or a run of colliding random names.  Nothing about the
#: task or its inputs is wrong in any of those, and every one of them has an
#: operator fix after which the SAME task succeeds.  Those sites raise this code
#: instead, and ``refine_runner`` classifies it RETRYABLE, exactly as it does
#: for ``_NO_SPACE_CODE``.
#:
#: The split rule, so a future raise site lands on the right side of it: use
#: this code only when the refusal is about a resource the HOST failed to
#: supply.  Use ``_FAILED_CODE`` when the refusal is a statement about the task,
#: the platform's capabilities, or an actor that tampered with our scratch --
#: including every "not a fresh private directory" check, which reports a
#: same-UID actor rather than a shortage and must stay fatal.
#:
#: One arm is deliberately outside that rule and says so:
#: :func:`_workspace_provisioning_refusal` classifies a RAW ``OSError`` by errno
#: and DEFAULTS to this code for an errno nobody has reasoned about.  It is not
#: claiming the shortage contract for those; it is choosing the recoverable side
#: of an asymmetric bet, because the retry budget is bounded and a wrong FATAL
#: is not.  The argument is at that function, not here.
_SCRATCH_UNAVAILABLE_CODE = "REFINE_ENGINE_SCRATCH_UNAVAILABLE"
_CHILD_PROTOCOL_REJECT_EXIT_CODE = 74
_IN_PROCESS_ENTRYPOINT_MARKER = "__patina_refine_in_process_only__"
_JSON_STRING_CHUNK_CHARS = 1024
_JSON_OUTPUT_CHUNK_CHARS = 1024
# Individual cleanup entries stay small enough that a final 1 KiB report can
# retain more than one independently failing resource.
_MAX_CLEANUP_ERRORS = 32
_MAX_CLEANUP_ERROR_BYTES = 256
_ERROR_CODE_PATTERN = re.compile(r"^REFINE_[A-Z0-9_]{1,63}$")
_PINNED_FILE_TOKEN_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$")
_PINNED_FILE_READ_BYTES = 1024 * 1024
#: One chunk of the receipt-time freeze copy.  Deliberately the same number the
#: hashing loops use: the copy and the hash walk the same bytes under the same
#: carried deadline, so giving them different granularities would only make the
#: deadline behave differently between two halves of one operation.
_OUTPUT_FREEZE_COPY_BYTES = _PINNED_FILE_READ_BYTES
#: Everything the freeze needs from the platform.  ``O_TMPFILE`` is Linux-only
#: and there is no macOS/BSD equivalent that creates a never-named file, so this
#: channel is Linux-only BY CONSTRUCTION.  It fails closed rather than falling
#: back to create-then-unlink, which would open a window in which a name exists.
_OUTPUT_FREEZE_REQUIRED_OS_NAMES = ("O_TMPFILE", "O_EXCL", "O_CLOEXEC", "pread", "pwrite")
#: The errnos that mean "the filesystem could not take these bytes", separated
#: from every other write failure so the refusal can name disk space.  ``EDQUOT``
#: is included because a per-user quota on a filesystem with free blocks
#: presents to the operator as the same problem with the same fix.
_OUTPUT_FREEZE_NO_SPACE_ERRNOS = frozenset({errno.ENOSPC, errno.EDQUOT})
#: How a RAW ``OSError`` out of workspace-lease provisioning is classified: BY
#: ERRNO, because what makes a refusal retryable is the CONDITION and not the
#: exception type.  An earlier revision bucketed the whole ``OSError`` TYPE as
#: operational, on an enumeration ("ENOENT, ENOSPC, EMFILE, ENOMEM") that was
#: not the whole set the call can produce: ``os.open`` with
#: ``_workspace_directory_flags()`` also yields ENOTDIR for a scratch root that
#: is a regular file or a FIFO, ELOOP for a looping intermediate component,
#: ENAMETOOLONG for a component past the filesystem's limit, and EACCES/EPERM
#: for a root the service uid cannot enter.  None of those is a shortage and
#: every one reproduces identically on the next attempt.
#:
#: Each row is ``(errno name, errno number, code)``.  The name is carried so
#: the journal line can NAME the condition: ``NotADirectoryError`` is not in
#: ``_SAFE_EXCEPTION_LABELS``, so an ENOTDIR root used to journal only
#: "external exception" and told the operator nothing to act on.
#:
#: The load-bearing decision is which side an UNLISTED errno falls to, and it is
#: the RETRYABLE side; :func:`_workspace_provisioning_refusal` carries the
#: measurement and the argument.  Every retryable row below is therefore
#: redundant with that default IN THE CODE IT PRODUCES, and is written out
#: anyway for two reasons: each has been reasoned about individually and a
#: reader who found them absent could not tell a decision from an oversight, and
#: the row is what puts the errno's NAME in the journal line instead of
#: "unclassified errno".  The FATAL rows are the ones the default does not
#: produce at all, so those are the ones that have to be complete.
_WORKSPACE_PROVISIONING_ERRNOS: tuple[tuple[str, int, str], ...] = (
    # RETRYABLE -- SHORTAGE: the host could not supply a resource right now.
    # ``EDQUOT`` rides with ``ENOSPC`` for the reason it does in
    # ``_OUTPUT_FREEZE_NO_SPACE_ERRNOS``: to the operator it is the same
    # problem with the same fix.
    ("ENOSPC", errno.ENOSPC, _SCRATCH_UNAVAILABLE_CODE),
    ("EDQUOT", errno.EDQUOT, _SCRATCH_UNAVAILABLE_CODE),
    ("EMFILE", errno.EMFILE, _SCRATCH_UNAVAILABLE_CODE),
    ("ENFILE", errno.ENFILE, _SCRATCH_UNAVAILABLE_CODE),
    ("ENOMEM", errno.ENOMEM, _SCRATCH_UNAVAILABLE_CODE),
    # RETRYABLE -- NOT REACHABLE RIGHT NOW: the configured root is a real
    # configuration that the host cannot currently present.
    #
    # ``ENOENT`` is the arguable one and it sits here DELIBERATELY.  It covers
    # both a scratch root the operator never created -- a deterministic
    # misconfiguration -- and a root whose mount is not up yet, which is
    # transient and self-heals.  The two mistakes cost asymmetrically: retrying
    # the misconfiguration costs a BOUNDED delay (``complete_agent_task``,
    # ``supabase/migrations/00297_agent_tasks_queue.sql:414``, fails the task for
    # good once ``attempts >= max_attempts``, with 1min then 5min backoff), while
    # failing the not-yet-mounted root outright kills a scan the very next
    # attempt would have completed.  The bounded cost is taken.
    ("ENOENT", errno.ENOENT, _SCRATCH_UNAVAILABLE_CODE),
    # ``ESTALE`` and ``ETIMEDOUT`` are the canonical "come back" errnos for a
    # scratch root on NFS or any network-backed store: a handle invalidated by
    # the server, and a server that did not answer inside its timeout.
    ("ESTALE", errno.ESTALE, _SCRATCH_UNAVAILABLE_CODE),
    ("ETIMEDOUT", errno.ETIMEDOUT, _SCRATCH_UNAVAILABLE_CODE),
    # ``EAGAIN`` is the kernel asking to be called again, which is the literal
    # definition of this side.
    ("EAGAIN", errno.EAGAIN, _SCRATCH_UNAVAILABLE_CODE),
    # ``EIO`` is a media or transport error.  It can mean a dying disk, which no
    # retry fixes -- but a dying disk is exactly the case where a bounded retry
    # costs minutes and a wrong FATAL costs the scan outright.
    ("EIO", errno.EIO, _SCRATCH_UNAVAILABLE_CODE),
    # ``EBUSY`` means the object is in use AT THIS MOMENT -- a mount in
    # progress, a device another holder has open.
    ("EBUSY", errno.EBUSY, _SCRATCH_UNAVAILABLE_CODE),
    # ``ENETDOWN``: the network the scratch root lives behind is down.
    ("ENETDOWN", errno.ENETDOWN, _SCRATCH_UNAVAILABLE_CODE),
    # FATAL -- A STATEMENT ABOUT THE OPERATOR'S CONFIGURATION rather than about
    # the host's momentary state.  These are the rows that must be complete,
    # because nothing else produces this side.
    #
    # ``ELOOP``: a symlink loop inside the configured path.  No mount coming up
    # unwinds a loop; the operator built it.
    #
    # ELOOP and ENOTDIR are BOTH translated earlier than this table -- by
    # ``_refuse_a_symlinked_workspace_container`` before the open for the shapes
    # a by-name probe can see, and by the container open's own arm otherwise.
    # NOT every symlink shape is visible to the pre-open probes, measured: a
    # self-looping INTERMEDIATE component leaves ``lstat`` failing ELOOP and
    # non-strict ``realpath`` returning the path unchanged, so that one is
    # settled at the open instead.  These two rows are therefore for a LATER
    # syscall under the scratch root producing one of them; they are kept so
    # that case cannot fall through to the retryable default by omission.
    ("ELOOP", errno.ELOOP, _FAILED_CODE),
    # ``ENOTDIR``: a component of the configured path is not a directory -- a
    # regular file, a FIFO or a device sitting where a directory was configured.
    ("ENOTDIR", errno.ENOTDIR, _FAILED_CODE),
    # ``EACCES``/``EPERM``: the service uid cannot enter the configured root.
    # Permission bits, ownership, capabilities and immutable attributes are all
    # deployment configuration; none of them changes while nobody is looking.
    ("EACCES", errno.EACCES, _FAILED_CODE),
    ("EPERM", errno.EPERM, _FAILED_CODE),
    # ``EROFS``: the root is on a read-only mount.  Honest caveat -- this is not
    # always a mount-option CHOICE, because the kernel forces a read-only
    # remount after some I/O errors.  What puts it on this side either way is
    # that recovery is an operator action (remount, fsck, repoint the root) and
    # not a wait.
    ("EROFS", errno.EROFS, _FAILED_CODE),
    # ``ENAMETOOLONG``: a component of the configured root, or the whole path,
    # is past the filesystem's limit.  A length does not change while nobody is
    # looking.  MEASURED reachable on Linux and macOS for a single component
    # over 255 bytes in a path well inside this module's own
    # ``NATIVE_WORKSPACE_MAX_PATH_BYTES`` ceiling, so the ceiling does not
    # pre-empt it.
    ("ENAMETOOLONG", errno.ENAMETOOLONG, _FAILED_CODE),
)
_WORKSPACE_PROVISIONING_CLASSIFICATION = MappingProxyType(
    {number: (name, code) for name, number, code in _WORKSPACE_PROVISIONING_ERRNOS}
)
_NATIVE_CHILD_CONTEXT_SEAL = object()


class _ChildBoundaryTimeout(TimeoutError):
    pass


class _ChildTransportError(ValueError):
    pass


class _ChildJsonOverflow(OverflowError):
    pass


@dataclass(frozen=True)
class NativeChildContext:
    """The same absolute engine deadline, visible inside the spawned child."""

    expires_at_monotonic_s: float
    _pinned_files: Mapping[str, int] = field(
        default_factory=lambda: MappingProxyType({}),
        repr=False,
        compare=False,
    )
    _workspace_descriptor: int | None = field(
        default=None,
        repr=False,
        compare=False,
    )
    _workspace_path: str | None = field(
        default=None,
        repr=False,
        compare=False,
    )
    _workspace_subdirectory_paths: Mapping[str, str] = field(
        default_factory=lambda: MappingProxyType({}),
        repr=False,
        compare=False,
    )
    _boundary_seal: object | None = field(
        default=None,
        init=False,
        repr=False,
        compare=False,
    )
    _boundary_pid: int | None = field(
        default=None,
        init=False,
        repr=False,
        compare=False,
    )

    def remaining_seconds(self) -> float:
        remaining = self.expires_at_monotonic_s - time.monotonic()
        if not math.isfinite(remaining) or remaining <= 0:
            raise AdapterError(
                "refine native engine child deadline is exhausted",
                _TIMEOUT_CODE,
            )
        return remaining

    @property
    def pinned_file_tokens(self) -> tuple[str, ...]:
        """Return the canonical closed token set received from the parent."""

        return tuple(self._pinned_files)

    def pinned_file_descriptor(self, token: str) -> int:
        """Borrow one verified read-only descriptor for the entry point call."""

        if type(token) is not str:
            raise AdapterError(
                "native child pinned file token must be a string",
                _INVALID_INPUT_CODE,
            )
        try:
            return self._pinned_files[token]
        except KeyError as exc:
            raise AdapterError(
                "native child pinned file token is unavailable",
                _INVALID_INPUT_CODE,
            ) from exc

    @property
    def has_leased_workspace(self) -> bool:
        """Report whether the parent leased a writable workspace to this child."""

        return type(self._workspace_descriptor) is int

    def workspace_descriptor(self) -> int:
        """Borrow the parent-owned workspace root for descriptor-relative writes.

        This is the reverse of :meth:`pinned_file_descriptor`: pinned files are
        read-only inputs the parent hands down, while the workspace is the one
        writable directory the child may populate, and its contents travel back
        to the parent.  The child is not given a path, does not create the
        directory, and must not remove it; the parent provisions it before
        ``spawn`` and performs bounded cleanup after every child outcome,
        including SIGKILL.

        Known and deliberately unaddressed here (items 2/5 inherit it): this
        accessor does not itself re-authenticate the boundary, matching
        ``pinned_file_descriptor``'s existing posture.  Callers that must not
        touch scratch outside a verified child check
        ``is_verified_native_boundary`` first, as the extractor does.
        """

        descriptor = self._workspace_descriptor
        if type(descriptor) is not int:
            raise AdapterError(
                "native child workspace lease is unavailable",
                _INVALID_INPUT_CODE,
            )
        return descriptor

    def workspace_path(self) -> str:
        """Return the leased root's absolute path for exec surfaces only.

        A path exists here because an exec'd binary cannot be handed a
        descriptor: ``cwd=`` and ``getenv("TMPDIR")`` are path-typed by libc
        contract, and this module deliberately marks its descriptors
        non-inheritable, so nothing survives the exec.  The parent transports
        this string explicitly rather than letting anyone derive it from
        ``/proc/self/fd/N``: explicit transport is auditable, does not depend on
        procfs under ``ProtectSystem=strict``, and unlike a procfs alias it
        survives a consumer's ``resolve(strict=True) == path`` check.  The
        descriptor stays authoritative for every I/O and every cleanup; the
        child verified this string against it on receipt.

        The ``resolve(strict=True)`` claim rests on
        :func:`provision_native_workspace_lease` refusing a container that is
        not its own realpath.  Without that guard the claim was simply false --
        an operator scratch root reached through a symlink produced a lease the
        command supervisor rejected with "COLMAP command workspace may not
        traverse a symlink".  The operator constraint is therefore explicit: the
        configured scratch root must contain no symlinked component.
        """

        path = self._workspace_path
        if type(path) is not str:
            raise AdapterError(
                "native child workspace lease path is unavailable",
                _INVALID_INPUT_CODE,
            )
        return path

    def workspace_subdirectory_path(self, name: str) -> str:
        """Return one verified absolute child of the leased root."""

        if type(name) is not str:
            raise AdapterError(
                "native child workspace subdirectory name must be a string",
                _INVALID_INPUT_CODE,
            )
        try:
            return self._workspace_subdirectory_paths[name]
        except KeyError as exc:
            raise AdapterError(
                "native child workspace subdirectory is unavailable",
                _INVALID_INPUT_CODE,
            ) from exc

    @property
    def is_verified_native_boundary(self) -> bool:
        """Authenticate the context created for one isolated child entry point."""

        try:
            pid = os.getpid()
            isolated = os.getsid(0) == pid and os.getpgrp() == pid
        except BaseException:  # noqa: BLE001 - authentication must fail closed
            return False
        return (
            self._boundary_seal is _NATIVE_CHILD_CONTEXT_SEAL
            and self._boundary_pid == pid
            and isolated
        )


def _seal_native_child_context(context: NativeChildContext) -> NativeChildContext:
    """Seal only the final entry-point context after child descriptor receipt."""

    try:
        pid = os.getpid()
        isolated = os.getsid(0) == pid and os.getpgrp() == pid
    except BaseException as exc:  # noqa: BLE001 - normalize injected inspection
        raise _ChildTransportError(
            "native child context isolation cannot be inspected"
        ) from exc
    if not isolated:
        raise _ChildTransportError(
            "native child context cannot be sealed outside its isolated session"
        )
    object.__setattr__(context, "_boundary_seal", _NATIVE_CHILD_CONTEXT_SEAL)
    object.__setattr__(context, "_boundary_pid", pid)
    return context


@dataclass(frozen=True)
class NativePinnedFile:
    """Parent descriptor plus the exact immutable fingerprint sent to the child.

    This disabled prerequisite accepts only service-owned local regular files.
    Callers must not pass FUSE, network, removable, or other externally blocking
    filesystem descriptors: parent-side ``pread`` hashing is synchronous and
    cannot preempt a kernel-blocked read. Production composition must enforce
    that local-file contract or move validation behind another killable process
    boundary before registering Refine.
    """

    descriptor: int
    sha256: str
    size_bytes: int


@dataclass(frozen=True)
class NativeWorkspaceLease:
    """One parent-provisioned, descriptor-rooted 0700 workspace for a child.

    The parent creates the directory before any child exists, pins both the
    containing directory and the workspace itself by descriptor, and never
    re-resolves either by path for any I/O or any cleanup.  The child receives a
    duplicate of ``descriptor`` over SCM_RIGHTS, so it cannot outlive the
    workspace: cleanup is the parent's obligation on every outcome, including a
    SIGKILLed child that never ran Python cleanup at all.

    ``path`` is also transported, as an explicit protocol field, because an
    exec'd engine binary cannot receive a descriptor — ``cwd=`` and ``TMPDIR``
    are path-typed by libc contract.  Path secrecy was never a control here (a
    compromised child can read its own ``/proc/self/fd``); parent ownership is.
    The child verifies the string against its leased descriptor before use.
    """

    parent_descriptor: int
    name: str
    descriptor: int
    identity: tuple[int, int]
    path: str


@dataclass(frozen=True)
class _PinnedFileTransfer:
    token: str
    descriptor: int
    sha256: str
    size_bytes: int
    original_offset: int | None = None


@dataclass(frozen=True)
class _OutputTransfer:
    """One child-side output descriptor plus the digest the child DECLARES."""

    token: str
    descriptor: int
    sha256: str
    size_bytes: int


@dataclass(frozen=True)
class NativeEngineOutput:
    """One parent-owned private copy of an engine output, hashed by the parent.

    ``descriptor`` is a read-only descriptor for an anonymous file the PARENT
    created with ``O_TMPFILE | O_EXCL`` and filled by copying the lease-side
    object the engine wrote.  It is neither the descriptor the child sent nor
    the parent's own open of ``work/<token>``: both of those refer to an inode
    that other descriptors may still be able to write, and this one refers to an
    inode nothing else has ever been able to reach.  The lease-side open is
    still performed and still bound to the child's transported ``(st_dev,
    st_ino)`` -- that is what proves the copy was taken from the object the
    engine actually wrote -- but it is not what the caller receives.

    ``sha256`` and ``size_bytes`` are the parent's own measurements OF THE COPY,
    read positionally from ``descriptor`` itself.  The child declared the same
    values and the run was refused when they disagreed, so these fields never
    carry a number the parent did not compute on the exact bytes it is handing
    over.

    ``identity`` is the copy's ``(st_dev, st_ino)`` -- the identity of
    ``descriptor``, so a consumer that re-``fstat``s before use (the publisher
    does) is checking the object it will actually read.  ``source_identity`` is
    the lease-side inode the copy was taken from, retained for diagnostics only;
    nothing may be published against it.

    The descriptor is owned by the :class:`NativeEngineOutputs` bundle that holds
    it.  Borrowers must not close it.  It outlives the workspace purge trivially:
    the purge removes lease names, and this object never had one.

    ``verified_snapshot`` is the exact ``os.fstat`` tuple the copy carried at the
    instant the parent finished hashing it, kept for the internal consistency
    assertion in :func:`_unfrozen_output_errors`.  That assertion is NOT what
    makes the bytes frozen -- see
    ``NATIVE_ENGINE_OUTPUT_BYTES_FROZEN_AGAINST_SURVIVING_DESCRIPTORS``.
    """

    token: str
    descriptor: int
    sha256: str
    size_bytes: int
    identity: tuple[int, int]
    verified_snapshot: tuple[int, ...] = ()
    source_identity: tuple[int, int] | None = None


@dataclass(frozen=True)
class _OutputSourceWitness:
    """The lease-side descriptor, kept open only to watch what the child did.

    This is NOT part of the caller's handoff and never becomes one: the caller
    receives the private copy.  The witness exists so that, after the parent has
    removed every name it owns, ``st_nlink != 0`` can still reveal a child that
    hardlinked an engine artifact out of its sandbox.  That is a child-behaviour
    refusal -- the escaped name can no longer affect the bytes the caller holds,
    but a run whose engine smuggled artifacts out of its workspace is not a run
    this boundary is willing to call successful.
    """

    token: str
    descriptor: int
    identity: tuple[int, int]


@dataclass(frozen=True)
class _NativeOutputReceipt:
    """Everything one successful receipt produced, with distinct ownership.

    ``outputs`` are handed to the caller's sink; ``witnesses`` stay with the
    boundary and are closed by it before it returns, on every path.
    """

    outputs: tuple[NativeEngineOutput, ...]
    witnesses: tuple[_OutputSourceWitness, ...]


class NativeEngineOutputs:
    """Caller-created sink for the parent-owned engine output descriptors.

    The caller constructs this with the exact token set it expects, hands it to
    :func:`run_native_engine_child`, and closes it -- normally with ``with`` --
    when it is done reading.  Making the sink caller-owned is deliberate: the
    descriptors have to outlive the boundary call (the lease is purged before it
    returns) while still having exactly one owner and one deterministic close.

    An instance is single-use.  It refuses to be populated twice and refuses to
    be populated after it has been closed, so a recycled sink cannot silently
    hand a second run's caller the first run's descriptors.
    """

    __slots__ = ("_tokens", "_received", "_populated", "_closed")

    def __init__(self, tokens: Iterable[str]) -> None:
        self._tokens = _validated_output_request(tokens)
        self._received: Mapping[str, NativeEngineOutput] = MappingProxyType({})
        self._populated = False
        self._closed = False

    @property
    def tokens(self) -> tuple[str, ...]:
        """Return the canonical ordered token set this sink will accept."""

        return self._tokens

    @property
    def is_populated(self) -> bool:
        """Record that outputs were once adopted -- NOT an ownership predicate.

        This stays true after :meth:`close`, including when the boundary itself
        closed the sink because its cleanup failed after a successful receipt.
        A caller asking "do I still hold descriptors?" must read
        :attr:`is_closed`, or let :attr:`received` raise.
        """

        return self._populated

    @property
    def is_closed(self) -> bool:
        return self._closed

    @property
    def received(self) -> Mapping[str, NativeEngineOutput]:
        """Return the parent-verified outputs, keyed by canonical token."""

        if self._closed:
            raise AdapterError(
                "native engine outputs are closed",
                _INVALID_INPUT_CODE,
            )
        return self._received

    def descriptor(self, token: str) -> int:
        """Borrow one parent-owned output descriptor without taking ownership."""

        if type(token) is not str:
            raise AdapterError(
                "native engine output token must be a string",
                _INVALID_INPUT_CODE,
            )
        try:
            return self.received[token].descriptor
        except KeyError as exc:
            raise AdapterError(
                "native engine output token is unavailable",
                _INVALID_INPUT_CODE,
            ) from exc

    def _adopt(self, outputs: tuple[NativeEngineOutput, ...]) -> None:
        if self._closed or self._populated:
            raise AdapterError(
                "native engine output sink cannot be populated twice",
                _INVALID_INPUT_CODE,
            )
        if tuple(output.token for output in outputs) != self._tokens:
            raise AdapterError(
                "native engine outputs do not match their requested token set",
                _FAILED_CODE,
            )
        self._received = MappingProxyType({output.token: output for output in outputs})
        self._populated = True

    def close(self) -> tuple[str, ...]:
        """Close every held descriptor exactly once; report per-token failures.

        Idempotent because the held mapping is cleared before anything else can
        observe it, not because of a separate already-closed early return: a
        guard that no deletion can turn a test red is not a guard.
        """

        received = self._received
        self._received = MappingProxyType({})
        self._closed = True
        return _close_descriptors_safely(
            (output.token, output.descriptor) for output in received.values()
        )

    def __enter__(self) -> "NativeEngineOutputs":
        return self

    def __exit__(self, exc_type, exc, traceback) -> bool:
        close_errors = self.close()
        if not close_errors:
            return False
        if exc is None:
            raise _cleanup_failed_error(
                "native engine output cleanup failed",
                close_errors,
            )
        _add_cleanup_note(exc, close_errors)
        return False


def _validated_output_request(tokens: Iterable[str]) -> tuple[str, ...]:
    """Accept only a canonical, unique, in-universe output token request."""

    if type(tokens) is not tuple and type(tokens) is not list:
        raise AdapterError(
            "native engine output tokens must be an exact tuple or list",
            _INVALID_INPUT_CODE,
        )
    requested = tuple(tokens)
    if not requested or len(requested) > NATIVE_CHILD_MAX_OUTPUT_FILES:
        raise AdapterError(
            "native engine output token count is outside the reviewed universe",
            _INVALID_INPUT_CODE,
        )
    for token in requested:
        if type(token) is not str or token not in NATIVE_ENGINE_OUTPUT_TOKENS:
            raise AdapterError(
                "native engine output token is outside the reviewed universe",
                _INVALID_INPUT_CODE,
            )
    if len(set(requested)) != len(requested):
        raise AdapterError(
            "native engine output tokens must be unique",
            _INVALID_INPUT_CODE,
        )
    if requested != tuple(sorted(requested)):
        raise AdapterError(
            "native engine output tokens must use canonical order",
            _INVALID_INPUT_CODE,
        )
    return requested


def native_engine_entrypoint(target):
    """Declare a top-level target that never returns with live OS children.

    The decorator intentionally does not wrap ``target`` so its module-level
    import identity remains stable under the ``spawn`` start method.
    """

    if not callable(target):
        raise TypeError("native engine entry point marker requires a callable")
    setattr(target, _IN_PROCESS_ENTRYPOINT_MARKER, True)
    return target


def _iter_json_string(value: str) -> Iterator[str]:
    """Yield canonical ``ensure_ascii`` JSON without copying a huge string."""

    yield '"'
    for offset in range(0, len(value), _JSON_STRING_CHUNK_CHARS):
        encoded = encode_basestring_ascii(
            value[offset : offset + _JSON_STRING_CHUNK_CHARS]
        )
        yield encoded[1:-1]
    yield '"'


def _bounded_int_repr(value: int, *, maximum_bytes: int) -> str:
    # A base-10 integer has more than one digit per four binary bits.  Reject
    # impossible-to-fit integers before making their decimal copy; any
    # surviving representation is bounded by a small multiple of the cap.
    if int.bit_length(value) > (maximum_bytes + 1) * 4:
        raise _ChildJsonOverflow
    return int.__repr__(value)


def _json_string_content_size(value: str, *, maximum_bytes: int) -> int:
    size = 0
    for offset in range(0, len(value), _JSON_STRING_CHUNK_CHARS):
        encoded = encode_basestring_ascii(
            value[offset : offset + _JSON_STRING_CHUNK_CHARS]
        )
        size += len(encoded) - 2
        if size > maximum_bytes:
            raise _ChildJsonOverflow
    return size


def _sort_bounded_json_keys(value: dict[str, Any]) -> list[str]:
    """Sort only after callers prove the key-reference copy fits the cap."""

    return sorted(dict.keys(value))


def _validated_bounded_json_keys(
    value: dict[str, Any],
    *,
    maximum_bytes: int,
) -> list[str]:
    count = dict.__len__(value)
    # Braces + newline, commas, quoted empty keys, colons, and the smallest
    # possible one-byte values.  Reject before iterating or copying keys.
    minimum_document_bytes = 3 if count == 0 else (5 * count) + 2
    if minimum_document_bytes > maximum_bytes:
        raise _ChildJsonOverflow

    key_content_bytes = 0
    for key in dict.keys(value):
        if type(key) is not str:
            raise TypeError(
                "native child JSON object keys must be exact built-in strings"
            )
        key_content_bytes += _json_string_content_size(
            key,
            maximum_bytes=maximum_bytes - minimum_document_bytes,
        )
        if minimum_document_bytes + key_content_bytes > maximum_bytes:
            raise _ChildJsonOverflow
    return _sort_bounded_json_keys(value)


def _iter_canonical_json_chunks(
    value: Any,
    *,
    maximum_bytes: int,
    active_containers: set[int] | None = None,
) -> Iterator[str]:
    """Stream the supported stdlib JSON model in canonical byte order.

    Strings are escaped in bounded slices because ``JSONEncoder.iterencode``
    may emit one string value as a single unbounded chunk.  Container identity
    tracking preserves the stdlib encoder's circular-reference rejection.
    """

    if active_containers is None:
        active_containers = set()
    if value is None:
        yield "null"
        return
    if value is True:
        yield "true"
        return
    if value is False:
        yield "false"
        return
    value_type = type(value)
    if value_type is str:
        yield from _iter_json_string(value)
        return
    if value_type is int:
        yield _bounded_int_repr(value, maximum_bytes=maximum_bytes)
        return
    if value_type is float:
        if not math.isfinite(value):
            raise ValueError("Out of range float values are not JSON compliant")
        yield float.__repr__(value)
        return
    if value_type is list or value_type is tuple:
        marker = id(value)
        if marker in active_containers:
            raise ValueError("Circular reference detected")
        active_containers.add(marker)
        try:
            yield "["
            first = True
            for item in value:
                if not first:
                    yield ","
                first = False
                yield from _iter_canonical_json_chunks(
                    item,
                    maximum_bytes=maximum_bytes,
                    active_containers=active_containers,
                )
            yield "]"
        finally:
            active_containers.remove(marker)
        return
    if value_type is dict:
        marker = id(value)
        if marker in active_containers:
            raise ValueError("Circular reference detected")
        active_containers.add(marker)
        try:
            yield "{"
            first = True
            for key in _validated_bounded_json_keys(
                value,
                maximum_bytes=maximum_bytes,
            ):
                if not first:
                    yield ","
                first = False
                yield from _iter_json_string(key)
                yield ":"
                yield from _iter_canonical_json_chunks(
                    dict.__getitem__(value, key),
                    maximum_bytes=maximum_bytes,
                    active_containers=active_containers,
                )
            yield "}"
        finally:
            active_containers.remove(marker)
        return
    raise _ChildTransportError(
        "native child transport requires exact built-in JSON values"
    )


def _collect_bounded_json_chunks(
    chunks: Iterable[str],
    *,
    maximum_bytes: int,
    overflow_message: str,
) -> bytes:
    """Collect UTF-8 chunks without ever constructing output beyond ``cap``."""

    if type(maximum_bytes) is not int or maximum_bytes < 1:
        raise ValueError("native child JSON byte cap must be positive")
    safe_overflow_message = (
        _truncate_utf8(overflow_message, NATIVE_CHILD_MAX_ERROR_BYTES)
        if type(overflow_message) is str
        else "native child JSON exceeds the bounded transport"
    )
    output = bytearray()
    for chunk in chunks:
        if type(chunk) is not str:
            raise _ChildTransportError(
                "native child JSON encoder yielded a non-text chunk"
            )
        for offset in range(0, len(chunk), _JSON_OUTPUT_CHUNK_CHARS):
            piece = chunk[offset : offset + _JSON_OUTPUT_CHUNK_CHARS]
            encoded = piece.encode("utf-8")
            if len(output) + len(encoded) > maximum_bytes:
                raise _ChildTransportError(safe_overflow_message)
            output.extend(encoded)
    return bytes(output)


def _bounded_json_bytes(
    value: Any,
    *,
    maximum_bytes: int,
    overflow_message: str,
) -> bytes:
    def chunks_with_terminal_newline() -> Iterator[str]:
        yield from _iter_canonical_json_chunks(
            value,
            maximum_bytes=maximum_bytes,
        )
        yield "\n"

    try:
        return _collect_bounded_json_chunks(
            chunks_with_terminal_newline(),
            maximum_bytes=maximum_bytes,
            overflow_message=overflow_message,
        )
    except _ChildTransportError:
        raise
    except _ChildJsonOverflow as exc:
        raise _ChildTransportError(
            _truncate_utf8(
                overflow_message
                if type(overflow_message) is str
                else "native child JSON exceeds the bounded transport",
                NATIVE_CHILD_MAX_ERROR_BYTES,
            )
        ) from exc
    except (RecursionError, TypeError, ValueError, OverflowError) as exc:
        raise _ChildTransportError(
            _bounded_diagnostic(
                "native child transport requires finite JSON values: ",
                _exception_summary(exc),
            )
        ) from exc


def _bounded_request(request: Mapping[str, Any]) -> bytes:
    if type(request) is not dict:
        raise AdapterError(
            "refine native child request must be an exact built-in JSON object",
            _FAILED_CODE,
        )
    try:
        payload = _bounded_json_bytes(
            request,
            maximum_bytes=NATIVE_CHILD_MAX_REQUEST_BYTES,
            overflow_message=(
                "refine native child request exceeds the bounded transport"
            ),
        )
    except _ChildTransportError as exc:
        raise AdapterError(
            _safe_exception_message(
                exc,
                fallback="refine native child request transport failed",
            ),
            _FAILED_CODE,
        ) from exc
    return payload


# This is deliberately a tuple searched with ``is``. A dict lookup can invoke
# a hostile exception metaclass's dynamic ``__hash__`` implementation.
_SAFE_EXCEPTION_LABELS: tuple[tuple[type[BaseException], str], ...] = (
    (AdapterError, "AdapterError"),
    (_ChildBoundaryTimeout, "child boundary timeout"),
    (_ChildJsonOverflow, "child JSON overflow"),
    (_ChildTransportError, "child transport error"),
    (AssertionError, "AssertionError"),
    (AttributeError, "AttributeError"),
    (BaseException, "BaseException"),
    (BrokenPipeError, "BrokenPipeError"),
    (ChildProcessError, "ChildProcessError"),
    (ConnectionError, "ConnectionError"),
    (EOFError, "EOFError"),
    (Exception, "Exception"),
    (FileNotFoundError, "FileNotFoundError"),
    (ImportError, "ImportError"),
    (json.JSONDecodeError, "JSONDecodeError"),
    (KeyboardInterrupt, "KeyboardInterrupt"),
    (MemoryError, "MemoryError"),
    (OSError, "OSError"),
    (OverflowError, "OverflowError"),
    (PermissionError, "PermissionError"),
    (ProcessLookupError, "ProcessLookupError"),
    (RecursionError, "RecursionError"),
    (RuntimeError, "RuntimeError"),
    (SystemExit, "SystemExit"),
    (TimeoutError, "TimeoutError"),
    (TypeError, "TypeError"),
    (UnicodeDecodeError, "UnicodeDecodeError"),
    (ValueError, "ValueError"),
)


def _bounded_diagnostic(
    *parts: Any,
    maximum_bytes: int = NATIVE_CHILD_MAX_ERROR_BYTES,
) -> str:
    """Join exact built-in strings without constructing text beyond the cap."""

    if type(maximum_bytes) is not int or maximum_bytes < 1:
        maximum_bytes = NATIVE_CHILD_MAX_ERROR_BYTES
    output = bytearray()
    for part in parts:
        text = part if type(part) is str else "invalid diagnostic"
        for offset in range(0, len(text), _JSON_STRING_CHUNK_CHARS):
            encoded = text[offset : offset + _JSON_STRING_CHUNK_CHARS].encode(
                "utf-8",
                errors="replace",
            )
            remaining = maximum_bytes - len(output)
            if len(encoded) > remaining:
                output.extend(encoded[:remaining])
                if maximum_bytes >= 3:
                    return (
                        bytes(output[: maximum_bytes - 3]).decode(
                            "utf-8",
                            errors="ignore",
                        )
                        + "..."
                    )
                return bytes(output).decode("utf-8", errors="ignore")
            output.extend(encoded)
    return bytes(output).decode("utf-8")


def _truncate_utf8(value: str, maximum_bytes: int) -> str:
    return _bounded_diagnostic(value, maximum_bytes=maximum_bytes)


def _safe_exception_details(exc: BaseException) -> tuple[str, str | None]:
    """Return fixed type metadata and only exact built-in string arguments."""

    exception_type = type(exc)
    label = None
    for candidate, candidate_label in _SAFE_EXCEPTION_LABELS:
        if exception_type is candidate:
            label = candidate_label
            break
    if label is None:
        return "external exception", None
    try:
        args = BaseException.args.__get__(exc, BaseException)
    except BaseException:
        return label, None
    if type(args) is tuple:
        count = tuple.__len__(args)
        if count <= 4:
            for index in range(count):
                message = tuple.__getitem__(args, index)
                if type(message) is str:
                    return label, message
    return label, None


def _safe_exception_message(
    exc: BaseException,
    *,
    fallback: str,
) -> str:
    _label, message = _safe_exception_details(exc)
    if message is None:
        message = fallback if type(fallback) is str else "external exception"
    return _truncate_utf8(message, NATIVE_CHILD_MAX_ERROR_BYTES)


def _validated_error_code(value: Any) -> str:
    if (
        type(value) is str
        and len(value) <= 64
        and _ERROR_CODE_PATTERN.fullmatch(value) is not None
    ):
        return value
    return _FAILED_CODE


def _safe_adapter_error_code(exc: BaseException) -> str:
    if type(exc) is not AdapterError:
        return _FAILED_CODE
    try:
        return _validated_error_code(object.__getattribute__(exc, "code"))
    except BaseException:
        return _FAILED_CODE


def _error_envelope(exc: BaseException) -> Mapping[str, Any]:
    label, message = _safe_exception_details(exc)
    return {
        "protocolVersion": _PROTOCOL_VERSION,
        "kind": "error",
        "code": _safe_adapter_error_code(exc),
        "exceptionType": label,
        "message": _truncate_utf8(
            message if message is not None else label,
            NATIVE_CHILD_MAX_ERROR_BYTES,
        ),
    }


def _send_envelope(connection: Connection, envelope: Mapping[str, Any]) -> None:
    payload = _bounded_json_bytes(
        envelope,
        maximum_bytes=NATIVE_CHILD_MAX_RESPONSE_BYTES,
        overflow_message="native child result exceeds the bounded transport",
    )
    connection.send_bytes(payload)


def _resolve_entrypoint(value: str):
    if type(value) is not str or _ENTRYPOINT_PATTERN.fullmatch(value) is None:
        raise _ChildTransportError(
            "native child entry point must be module.path:function_name"
        )
    module_name, function_name = value.split(":", 1)
    module = importlib.import_module(module_name)
    target = getattr(module, function_name, None)
    if target is None or not callable(target):
        raise _ChildTransportError("native child entry point is not callable")
    if getattr(target, _IN_PROCESS_ENTRYPOINT_MARKER, False) is not True:
        raise _ChildTransportError(
            "native child entry point must declare the in-process-only contract"
        )
    return target


def _receive_exact_child_ack(
    connection: Connection,
    *,
    expected: bytes,
    context: NativeChildContext,
    phase: str,
) -> None:
    """Receive one deadline-bounded exact ACK without an oversized read."""

    try:
        acknowledged = connection.poll(context.remaining_seconds())
    except (EOFError, OSError) as exc:
        raise _ChildTransportError(
            _bounded_diagnostic(
                "cannot wait for native child ",
                phase,
                " acknowledgement: ",
                _exception_summary(exc),
            )
        ) from exc
    if not acknowledged:
        raise AdapterError(
            _bounded_diagnostic(
                "native child ",
                phase,
                " acknowledgement exceeded the shared deadline",
            ),
            _TIMEOUT_CODE,
        )
    try:
        acknowledgement = connection.recv_bytes(len(expected))
    except (EOFError, OSError) as exc:
        raise _ChildTransportError(
            _bounded_diagnostic(
                "cannot receive native child ",
                phase,
                " acknowledgement: ",
                _exception_summary(exc),
            )
        ) from exc
    if acknowledgement != expected:
        raise _ChildTransportError(
            _bounded_diagnostic(
                "native child ",
                phase,
                " acknowledgement is invalid",
            )
        )


#: Index of ``st_ctime_ns`` inside a :func:`_descriptor_snapshot` tuple.  Named
#: because :func:`_frozen_snapshot_fields` must drop exactly that field and
#: nothing else; a silent reshuffle here would weaken the freeze proof.
_DESCRIPTOR_SNAPSHOT_CTIME_INDEX = 5
_DESCRIPTOR_SNAPSHOT_FIELDS = 7


def _descriptor_snapshot(
    metadata: os.stat_result,
    descriptor: int,
    *,
    token: str,
) -> tuple[int, ...]:
    try:
        offset = os.lseek(descriptor, 0, os.SEEK_CUR)
    except OSError as exc:
        raise AdapterError(
            f"native pinned file {token} offset is unavailable",
            _INVALID_INPUT_CODE,
        ) from exc
    return (
        metadata.st_dev,
        metadata.st_ino,
        metadata.st_mode,
        metadata.st_size,
        metadata.st_mtime_ns,
        metadata.st_ctime_ns,
        offset,
    )


def _restore_descriptor_offset(
    descriptor: int,
    *,
    token: str,
    offset: int,
) -> None:
    try:
        os.lseek(descriptor, offset, os.SEEK_SET)
    except OSError as exc:
        raise AdapterError(
            f"native pinned file {token} shared offset could not be restored",
            _CLEANUP_FAILED_CODE,
        ) from exc


def _descriptor_access_mode(descriptor: int) -> int:
    try:
        import fcntl
    except ImportError as exc:  # pragma: no cover - POSIX platforms provide fcntl
        raise AdapterError(
            "native pinned file access-mode inspection is unavailable",
            _FAILED_CODE,
        ) from exc
    try:
        return fcntl.fcntl(descriptor, fcntl.F_GETFL) & os.O_ACCMODE
    except OSError as exc:
        raise AdapterError(
            "native pinned file descriptor flags are unavailable",
            _INVALID_INPUT_CODE,
        ) from exc


def _validate_pinned_descriptor(
    descriptor: int,
    *,
    token: str,
    expected_sha256: str,
    expected_size: int,
    remaining_seconds,
    expected_snapshot: tuple[int, ...] | None = None,
) -> tuple[int, ...]:
    """Verify one read-only regular descriptor without changing its offset."""

    try:
        remaining_seconds()
    except AdapterError:
        raise
    except BaseException as exc:
        raise AdapterError(
            "cannot inspect the native pinned file deadline",
            _FAILED_CODE,
        ) from exc
    if not hasattr(os, "pread"):
        raise AdapterError(
            "native pinned files require descriptor-relative reads",
            _FAILED_CODE,
        )
    try:
        before = os.fstat(descriptor)
    except OSError as exc:
        raise AdapterError(
            f"native pinned file {token} descriptor is unavailable",
            _INVALID_INPUT_CODE,
        ) from exc
    if not stat.S_ISREG(before.st_mode):
        raise AdapterError(
            f"native pinned file {token} must be a regular file",
            _INVALID_INPUT_CODE,
        )
    if _descriptor_access_mode(descriptor) != os.O_RDONLY:
        raise AdapterError(
            f"native pinned file {token} must be opened read-only",
            _INVALID_INPUT_CODE,
        )
    before_snapshot = _descriptor_snapshot(
        before,
        descriptor,
        token=token,
    )
    if expected_snapshot is not None and before_snapshot != expected_snapshot:
        if (
            len(expected_snapshot) == len(before_snapshot)
            and before_snapshot[-1] != expected_snapshot[-1]
        ):
            _restore_descriptor_offset(
                descriptor,
                token=token,
                offset=expected_snapshot[-1],
            )
        raise AdapterError(
            f"native pinned file {token} changed after transfer validation",
            _INVALID_INPUT_CODE,
        )
    if before.st_size != expected_size:
        raise AdapterError(
            f"native pinned file {token} size does not match its ledger",
            _INVALID_INPUT_CODE,
        )

    digest = hashlib.sha256()
    offset = 0
    while offset < expected_size:
        remaining_seconds()
        read_size = min(_PINNED_FILE_READ_BYTES, expected_size - offset)
        try:
            chunk = os.pread(descriptor, read_size, offset)
        except OSError as exc:
            raise AdapterError(
                f"native pinned file {token} could not be read",
                _INVALID_INPUT_CODE,
            ) from exc
        if not chunk:
            raise AdapterError(
                f"native pinned file {token} ended before its declared size",
                _INVALID_INPUT_CODE,
            )
        digest.update(chunk)
        offset += len(chunk)
    try:
        trailing = os.pread(descriptor, 1, expected_size)
        after = os.fstat(descriptor)
    except OSError as exc:
        raise AdapterError(
            f"native pinned file {token} final verification failed",
            _INVALID_INPUT_CODE,
        ) from exc
    if trailing:
        raise AdapterError(
            f"native pinned file {token} exceeds its declared size",
            _INVALID_INPUT_CODE,
        )
    after_snapshot = _descriptor_snapshot(
        after,
        descriptor,
        token=token,
    )
    if before_snapshot != after_snapshot:
        if before_snapshot[-1] != after_snapshot[-1]:
            _restore_descriptor_offset(
                descriptor,
                token=token,
                offset=before_snapshot[-1],
            )
        raise AdapterError(
            f"native pinned file {token} changed during verification",
            _INVALID_INPUT_CODE,
        )
    if digest.hexdigest() != expected_sha256:
        raise AdapterError(
            f"native pinned file {token} sha256 does not match its ledger",
            _INVALID_INPUT_CODE,
        )
    remaining_seconds()
    return after_snapshot


def _close_descriptors_safely(
    descriptors: Iterable[tuple[str, int]],
) -> tuple[str, ...]:
    errors: list[str] = []
    for token, descriptor in descriptors:
        try:
            os.close(descriptor)
        except BaseException as exc:
            errors.append(
                _bounded_diagnostic(
                    "cannot close native pinned file ",
                    token,
                    ": ",
                    _exception_summary(exc),
                    maximum_bytes=_MAX_CLEANUP_ERROR_BYTES,
                )
            )
    return tuple(errors)


def _prepare_pinned_files(
    values: Mapping[str, NativePinnedFile] | None,
    *,
    deadline: RefineDeadline,
) -> tuple[_PinnedFileTransfer, ...]:
    """Validate a closed ledger and duplicate its exact descriptors for transfer."""

    if values is None:
        return ()
    if type(values) is not dict:
        raise AdapterError(
            "native pinned files must be an exact token-to-file dictionary",
            _INVALID_INPUT_CODE,
        )
    count = dict.__len__(values)
    if count > NATIVE_CHILD_MAX_PINNED_FILES:
        raise AdapterError(
            "native pinned file count exceeds the transfer limit",
            _INVALID_INPUT_CODE,
        )

    try:
        rows = tuple(dict.items(values))
    except RuntimeError as exc:
        raise AdapterError(
            "native pinned file dictionary changed during validation",
            _INVALID_INPUT_CODE,
        ) from exc
    if len(rows) != count or dict.__len__(values) != count:
        raise AdapterError(
            "native pinned file dictionary changed during validation",
            _INVALID_INPUT_CODE,
        )
    for token, _value in rows:
        if type(token) is not str:
            raise AdapterError(
                "native pinned file tokens must be unique safe bounded strings",
                _INVALID_INPUT_CODE,
            )

    seen_descriptors: set[int] = set()
    declared_total_bytes = 0
    contracts: list[_PinnedFileTransfer] = []
    for token, value in sorted(rows, key=lambda item: item[0]):
        deadline.remaining_seconds()
        if (
            len(token) > NATIVE_CHILD_MAX_PINNED_TOKEN_BYTES
            or _PINNED_FILE_TOKEN_PATTERN.fullmatch(token) is None
        ):
            raise AdapterError(
                "native pinned file tokens must be unique safe bounded strings",
                _INVALID_INPUT_CODE,
            )
        if type(value) is not NativePinnedFile:
            raise AdapterError(
                f"native pinned file {token} has the wrong contract type",
                _INVALID_INPUT_CODE,
            )
        descriptor = value.descriptor
        expected_sha256 = value.sha256
        expected_size = value.size_bytes
        if (
            type(descriptor) is not int
            or descriptor < 0
            or descriptor in seen_descriptors
        ):
            raise AdapterError(
                "native pinned file descriptors must be unique non-negative integers",
                _INVALID_INPUT_CODE,
            )
        if (
            type(expected_sha256) is not str
            or re.fullmatch(r"[0-9a-f]{64}", expected_sha256) is None
            or type(expected_size) is not int
            or expected_size < 0
        ):
            raise AdapterError(
                f"native pinned file {token} has an invalid fingerprint ledger",
                _INVALID_INPUT_CODE,
            )
        if expected_size > NATIVE_CHILD_MAX_PINNED_FILE_BYTES:
            raise AdapterError(
                f"native pinned file {token} exceeds the per-file byte limit",
                _INVALID_INPUT_CODE,
            )
        declared_total_bytes += expected_size
        if declared_total_bytes > NATIVE_CHILD_MAX_PINNED_TOTAL_BYTES:
            raise AdapterError(
                "native pinned files exceed the aggregate byte limit",
                _INVALID_INPUT_CODE,
            )
        seen_descriptors.add(descriptor)
        contracts.append(
            _PinnedFileTransfer(
                token=token,
                descriptor=descriptor,
                sha256=expected_sha256,
                size_bytes=expected_size,
            )
        )

    seen_identities: set[tuple[int, int]] = set()
    prepared: list[_PinnedFileTransfer] = []
    try:
        for contract in contracts:
            deadline.remaining_seconds()
            try:
                duplicate = os.dup(contract.descriptor)
            except OSError as exc:
                raise AdapterError(
                    f"native pinned file {contract.token} could not be duplicated",
                    _INVALID_INPUT_CODE,
                ) from exc
            transfer = _PinnedFileTransfer(
                token=contract.token,
                descriptor=duplicate,
                sha256=contract.sha256,
                size_bytes=contract.size_bytes,
            )
            prepared.append(transfer)
            try:
                os.set_inheritable(duplicate, False)
            except OSError as exc:
                raise AdapterError(
                    (
                        f"native pinned file {contract.token} could not be made "
                        "non-inheritable"
                    ),
                    _FAILED_CODE,
                ) from exc
            snapshot = _validate_pinned_descriptor(
                duplicate,
                token=contract.token,
                expected_sha256=contract.sha256,
                expected_size=contract.size_bytes,
                remaining_seconds=deadline.remaining_seconds,
            )
            identity = (snapshot[0], snapshot[1])
            if identity in seen_identities:
                raise AdapterError(
                    "native pinned files must reference unique regular-file identities",
                    _INVALID_INPUT_CODE,
                )
            seen_identities.add(identity)
            prepared[-1] = _PinnedFileTransfer(
                token=contract.token,
                descriptor=duplicate,
                sha256=contract.sha256,
                size_bytes=contract.size_bytes,
                original_offset=snapshot[-1],
            )
    except BaseException as exc:
        close_errors = _close_descriptors_safely(
            (value.token, value.descriptor) for value in prepared
        )
        if close_errors:
            raise _cleanup_failed_error(
                "native pinned file preparation failed",
                close_errors,
            ) from exc
        raise
    return tuple(prepared)


def _validated_pinned_ledger(
    value: object,
) -> tuple[tuple[str, str, int], ...]:
    if type(value) is not tuple or len(value) > NATIVE_CHILD_MAX_PINNED_FILES:
        raise _ChildTransportError("native child pinned-file ledger is invalid")
    seen: set[str] = set()
    declared_total_bytes = 0
    rows: list[tuple[str, str, int]] = []
    for row in value:
        if type(row) is not tuple or len(row) != 3:
            raise _ChildTransportError("native child pinned-file ledger is invalid")
        token, expected_sha256, expected_size = row
        if (
            type(token) is not str
            or len(token) > NATIVE_CHILD_MAX_PINNED_TOKEN_BYTES
            or _PINNED_FILE_TOKEN_PATTERN.fullmatch(token) is None
            or token in seen
            or type(expected_sha256) is not str
            or re.fullmatch(r"[0-9a-f]{64}", expected_sha256) is None
            or type(expected_size) is not int
            or expected_size < 0
            or expected_size > NATIVE_CHILD_MAX_PINNED_FILE_BYTES
        ):
            raise _ChildTransportError("native child pinned-file ledger is invalid")
        declared_total_bytes += expected_size
        if declared_total_bytes > NATIVE_CHILD_MAX_PINNED_TOTAL_BYTES:
            raise _ChildTransportError(
                "native child pinned-file ledger exceeds its byte limit"
            )
        seen.add(token)
        rows.append((token, expected_sha256, expected_size))
    if tuple(sorted(seen)) != tuple(row[0] for row in rows):
        raise _ChildTransportError(
            "native child pinned-file ledger must use canonical token order"
        )
    return tuple(rows)


def _receive_pinned_files(
    connection: Connection | None,
    ledger: tuple[tuple[str, str, int], ...],
    *,
    context: NativeChildContext,
) -> tuple[Mapping[str, int], Mapping[str, tuple[int, ...]]]:
    """Receive and independently verify the parent's SCM_RIGHTS descriptors."""

    if not ledger:
        if connection is not None:
            raise _ChildTransportError(
                "native child received an unexpected pinned-file transport"
            )
        return MappingProxyType({}), MappingProxyType({})
    if connection is None:
        raise _ChildTransportError("native child pinned-file transport is unavailable")

    received: dict[str, int] = {}
    snapshots: dict[str, tuple[int, ...]] = {}
    seen_identities: set[tuple[int, int]] = set()
    try:
        from multiprocessing.reduction import recv_handle

        for token, expected_sha256, expected_size in ledger:
            if not connection.poll(context.remaining_seconds()):
                raise AdapterError(
                    "native pinned file transfer exceeded the shared deadline",
                    _TIMEOUT_CODE,
                )
            descriptor = recv_handle(connection)
            received[token] = descriptor
            os.set_inheritable(descriptor, False)
            snapshot = _validate_pinned_descriptor(
                descriptor,
                token=token,
                expected_sha256=expected_sha256,
                expected_size=expected_size,
                remaining_seconds=context.remaining_seconds,
            )
            identity = (snapshot[0], snapshot[1])
            if identity in seen_identities:
                raise AdapterError(
                    "native child pinned files repeat a regular-file identity",
                    _INVALID_INPUT_CODE,
                )
            seen_identities.add(identity)
            snapshots[token] = snapshot
    except BaseException as exc:
        close_errors = _close_descriptors_safely(received.items())
        if close_errors:
            raise AdapterError(
                _bounded_cleanup_report(
                    "native child pinned-file receipt failed",
                    close_errors,
                ),
                _CLEANUP_FAILED_CODE,
            ) from exc
        raise
    return MappingProxyType(received), MappingProxyType(snapshots)


def _output_file_open_flags() -> int:
    """Open an engine output for reading without following or blocking on it."""

    # ``O_NOFOLLOW`` refuses a symlink planted at the canonical name.
    # ``O_NONBLOCK`` refuses to hang inside ``open`` if the name is a FIFO; the
    # regular-file check that follows then rejects it outright.
    return (
        os.O_RDONLY
        | getattr(os, "O_CLOEXEC", 0)
        | getattr(os, "O_NOFOLLOW", 0)
        | getattr(os, "O_NONBLOCK", 0)
    )


def _open_leased_output_directory(workspace_descriptor: int) -> int:
    """Open the leased ``work/`` surface relative to the pinned lease root."""

    try:
        return os.open(
            NATIVE_WORKSPACE_COMMAND_SUBDIRECTORY,
            _workspace_directory_flags(),
            dir_fd=workspace_descriptor,
        )
    except OSError as exc:
        raise AdapterError(
            "native engine output directory is unavailable inside the lease",
            _INVALID_INPUT_CODE,
        ) from exc


def _accumulated_output_bytes(
    token: str,
    size_bytes: int,
    running_total: int,
) -> int:
    """Bound one output's size and the running aggregate, or fail closed.

    Extracted so the ceilings are reachable by a test.  Inline, the only way to
    exercise a 4 GiB per-file or 8 GiB aggregate refusal would be to actually
    produce those bytes, which means in practice they would never be exercised
    at all -- and an unexercised ceiling is indistinguishable from a missing one.
    """

    if size_bytes <= 0:
        raise AdapterError(
            f"native engine output {token} is empty",
            _INVALID_INPUT_CODE,
        )
    if size_bytes > NATIVE_CHILD_MAX_OUTPUT_FILE_BYTES:
        raise AdapterError(
            f"native engine output {token} exceeds the per-file byte limit",
            _INVALID_INPUT_CODE,
        )
    total = running_total + size_bytes
    if total > NATIVE_CHILD_MAX_OUTPUT_TOTAL_BYTES:
        raise AdapterError(
            "native engine outputs exceed the aggregate byte limit",
            _INVALID_INPUT_CODE,
        )
    return total


def _open_child_outputs(
    tokens: tuple[str, ...],
    *,
    context: NativeChildContext,
) -> tuple[_OutputTransfer, ...]:
    """Open and measure exactly the parent-named outputs inside the child.

    The child chooses nothing here.  ``tokens`` came from the parent, the names
    are resolved only relative to the leased ``work/`` descriptor, and the digest
    computed below is a DECLARATION the parent will independently reproduce
    before it accepts anything.
    """

    if not tokens:
        return ()
    if not context.is_verified_native_boundary:
        raise _ChildTransportError(
            "native child cannot export outputs outside its verified boundary"
        )
    work_descriptor = _open_leased_output_directory(context.workspace_descriptor())
    transfers: list[_OutputTransfer] = []
    declared_total_bytes = 0
    try:
        for token in tokens:
            context.remaining_seconds()
            try:
                descriptor = os.open(
                    token,
                    _output_file_open_flags(),
                    dir_fd=work_descriptor,
                )
            except OSError as exc:
                raise AdapterError(
                    f"native engine output {token} could not be opened",
                    _INVALID_INPUT_CODE,
                ) from exc
            transfers.append(
                _OutputTransfer(
                    token=token,
                    descriptor=descriptor,
                    sha256="",
                    size_bytes=0,
                )
            )
            os.set_inheritable(descriptor, False)
            metadata = os.fstat(descriptor)
            if not stat.S_ISREG(metadata.st_mode):
                raise AdapterError(
                    f"native engine output {token} must be a regular file",
                    _INVALID_INPUT_CODE,
                )
            size_bytes = metadata.st_size
            declared_total_bytes = _accumulated_output_bytes(
                token,
                size_bytes,
                declared_total_bytes,
            )
            digest = hashlib.sha256()
            offset = 0
            while offset < size_bytes:
                context.remaining_seconds()
                read_size = min(_PINNED_FILE_READ_BYTES, size_bytes - offset)
                try:
                    chunk = os.pread(descriptor, read_size, offset)
                except OSError as exc:
                    raise AdapterError(
                        f"native engine output {token} could not be read",
                        _INVALID_INPUT_CODE,
                    ) from exc
                if not chunk:
                    raise AdapterError(
                        f"native engine output {token} ended before its size",
                        _INVALID_INPUT_CODE,
                    )
                digest.update(chunk)
                offset += len(chunk)
            transfers[-1] = _OutputTransfer(
                token=token,
                descriptor=descriptor,
                sha256=digest.hexdigest(),
                size_bytes=size_bytes,
            )
        context.remaining_seconds()
    except BaseException:
        close_errors = _close_output_transfers(tuple(transfers))
        transfers.clear()
        if close_errors:
            raise AdapterError(
                _bounded_cleanup_report(
                    "native engine output preparation failed",
                    close_errors,
                ),
                _CLEANUP_FAILED_CODE,
            )
        raise
    finally:
        directory_errors = _close_descriptors_safely(
            (("native engine output directory", work_descriptor),)
        )
        if directory_errors:
            _close_output_transfers(tuple(transfers))
            transfers.clear()
            raise AdapterError(
                _bounded_cleanup_report(
                    "native engine output directory cleanup failed",
                    directory_errors,
                ),
                _CLEANUP_FAILED_CODE,
            )
    return tuple(transfers)


def _close_output_transfers(
    transfers: tuple[_OutputTransfer, ...],
) -> tuple[str, ...]:
    return _close_descriptors_safely(
        (transfer.token, transfer.descriptor) for transfer in transfers
    )


def _output_ledger_rows(
    transfers: tuple[_OutputTransfer, ...],
) -> list[list[Any]]:
    return [
        [transfer.token, transfer.sha256, transfer.size_bytes] for transfer in transfers
    ]


def _send_native_outputs(
    connection: Connection | None,
    transfers: tuple[_OutputTransfer, ...],
    *,
    destination_pid: int,
    context: NativeChildContext,
) -> None:
    """Hand every measured output descriptor up to the parent, in ledger order."""

    if not transfers:
        return
    if connection is None:
        raise _ChildTransportError("native engine output transport is unavailable")
    from multiprocessing.reduction import send_handle

    for transfer in transfers:
        context.remaining_seconds()
        # As with the pinned-input transport, CPython acknowledges SCM_RIGHTS
        # only on Darwin, where this send waits on an untimed recv.  Linux -- the
        # qualified platform -- does not acknowledge.
        send_handle(connection, transfer.descriptor, destination_pid)
    context.remaining_seconds()


def _validated_output_ledger(
    value: object,
    expected_tokens: tuple[str, ...],
) -> tuple[tuple[str, str, int], ...]:
    """Accept only a canonical ledger naming exactly the requested tokens."""

    if type(value) is not list or len(value) != len(expected_tokens):
        raise AdapterError(
            "native engine output ledger is invalid",
            _FAILED_CODE,
        )
    declared_total_bytes = 0
    rows: list[tuple[str, str, int]] = []
    for row, expected_token in zip(value, expected_tokens, strict=True):
        if type(row) is not list or len(row) != 3:
            raise AdapterError(
                "native engine output ledger is invalid",
                _FAILED_CODE,
            )
        token, declared_sha256, declared_size = row
        if type(token) is not str or token != expected_token:
            raise AdapterError(
                "native engine output ledger does not match its requested tokens",
                _FAILED_CODE,
            )
        if (
            type(declared_sha256) is not str
            or re.fullmatch(r"[0-9a-f]{64}", declared_sha256) is None
        ):
            raise AdapterError(
                f"native engine output {token} declared an invalid digest",
                _FAILED_CODE,
            )
        if (
            type(declared_size) is not int
            or declared_size <= 0
            or declared_size > NATIVE_CHILD_MAX_OUTPUT_FILE_BYTES
        ):
            raise AdapterError(
                f"native engine output {token} declared an invalid size",
                _FAILED_CODE,
            )
        declared_total_bytes += declared_size
        if declared_total_bytes > NATIVE_CHILD_MAX_OUTPUT_TOTAL_BYTES:
            raise AdapterError(
                "native engine outputs exceed the aggregate byte limit",
                _FAILED_CODE,
            )
        rows.append((token, declared_sha256, declared_size))
    return tuple(rows)


def _transported_output_identity(
    child_descriptor: int,
    *,
    token: str,
    declared_size: int,
) -> tuple[int, int]:
    """Validate and close one transported descriptor, keeping only its identity.

    The transported descriptor exists to say "this exact inode is what the engine
    wrote".  It is never kept: the parent reads through its own open, so holding
    the child's open file description afterwards would only widen the window in
    which a child-side offset or mode could matter.
    """

    try:
        os.set_inheritable(child_descriptor, False)
        metadata = os.fstat(child_descriptor)
        if not stat.S_ISREG(metadata.st_mode):
            raise AdapterError(
                f"native engine output {token} must be a regular file",
                _INVALID_INPUT_CODE,
            )
        if _descriptor_access_mode(child_descriptor) != os.O_RDONLY:
            raise AdapterError(
                f"native engine output {token} must be transported read-only",
                _INVALID_INPUT_CODE,
            )
        if metadata.st_size != declared_size:
            raise AdapterError(
                f"native engine output {token} size does not match its ledger",
                _INVALID_INPUT_CODE,
            )
    except BaseException:
        close_errors = _close_descriptors_safely(((token, child_descriptor),))
        if close_errors:
            raise _cleanup_failed_error(
                "native engine output receipt failed",
                close_errors,
            )
        raise
    close_errors = _close_descriptors_safely(((token, child_descriptor),))
    if close_errors:
        raise _cleanup_failed_error(
            "native engine output receipt failed",
            close_errors,
        )
    return (metadata.st_dev, metadata.st_ino)


def _require_output_freeze_capabilities() -> None:
    """Refuse the output channel unless a never-named private copy is possible.

    This is the fail-closed the design depends on.  Without ``O_TMPFILE`` the
    only way to produce an unnamed file is to create a named one and unlink it,
    which leaves a window in which the name exists and a same-UID actor can open
    it -- exactly the escape this whole mechanism was built to remove.  A silent
    fallback to that would be worse than no channel at all, because callers
    would be told the bytes were frozen when they were not.

    The practical consequence is that the engine output handoff is **Linux
    only**.  macOS has no equivalent primitive, so this raises there rather than
    degrading, and the tests that exercise the channel skip rather than pass.
    """

    missing = [name for name in _OUTPUT_FREEZE_REQUIRED_OS_NAMES if not hasattr(os, name)]
    if os.name != "posix" or missing:
        raise AdapterError(
            "native engine outputs require O_TMPFILE anonymous files, which "
            "this platform does not provide; the engine output handoff is "
            "Linux-only and refuses to fall back to a named temporary",
            _FAILED_CODE,
        )
    if not os.path.isdir(NATIVE_OUTPUT_FREEZE_ALIAS_DIRECTORY):
        raise AdapterError(
            "native engine outputs require /proc/self/fd to drop write access "
            "on the parent's private copy",
            _FAILED_CODE,
        )


def _seal_process_against_procfs_descriptor_theft() -> None:
    """Make this process's ``/proc/<pid>/fd`` unopenable without CAP_SYS_PTRACE.

    This is what closes the one route the private-copy construction cannot: a
    same-UID process with no inherited descriptor can reopen ANY descriptor in
    this table -- the frozen copies included -- through ``/proc/<pid>/fd``, and
    rewrite it.  ``yama.ptrace_scope`` does not stop that at any setting, because
    Yama only inspects ``PTRACE_MODE_ATTACH`` while procfs descriptor access asks
    for ``PTRACE_MODE_READ_FSCREDS``.  Dropping ``dumpable`` does stop it:
    ``__ptrace_may_access`` refuses every mode once ``get_dumpable(mm) !=
    SUID_DUMP_USER`` unless the caller holds ``CAP_SYS_PTRACE``.

    FOUR CONSEQUENCES.  The first and third are the ones this channel depends on
    and each is pinned by the test named beside it; the second is reasoning
    nothing rests on, and is labelled as such; the fourth is a property of the
    flag.

    * **This process can still read its own table.**  ``proc_fd_permission``
      short-circuits for the owning thread group, so the ``/proc/self/fd`` reopen
      in :func:`_read_only_freeze_alias` keeps working: it returns the same
      ``(st_dev, st_ino)`` with ``st_nlink == 0`` after the seal.  Pinned by
      ``test_the_seal_leaves_the_parent_able_to_reopen_its_own_descriptors``.
    * **The spawned child is unaffected** -- REASONED, NOT MEASURED, and nothing
      here depends on it either way: ``dumpable`` is inherited across ``fork``
      and reset by ``execve``, and this module's child is a ``spawn`` child.
    * **Reading OTHER processes is unaffected.**  A reader's own ``dumpable``
      flag does not gate ``/proc/<pid>/stat``, so
      :func:`_linux_process_group_members` and the quiescence scan keep working.
      This is the consequence that would re-break a production blocker if it were
      wrong, so it is measured rather than argued: sealed, the scan read every
      ``/proc/<pid>/stat`` row present with zero failures and still found the
      members of this process's own group.  Pinned by
      ``test_the_seal_leaves_the_process_group_scan_able_to_read_other_processes``,
      whose own-group half is what keeps a scan that silently skipped every row
      from passing it.
    * **THIS PROCESS BECOMES UNDEBUGGABLE FROM HERE ON, NOT MERELY UNDUMPABLE.**
      That is the price, it is permanent for the life of the worker process, and
      it is not reversed on the way out -- reversing it would hand the route back
      while the caller still holds the descriptors.

      An earlier revision of this docstring said only that core dumps stop and
      told the operator to "use the journal and a live debugger instead".  The
      second half of that was WRONG and is the reason this paragraph is now
      specific: the seal is a ``ptrace_may_access`` refusal, so it takes the live
      debugger with it.  MEASURED at euid 1000 in this repository's Linux test
      container (``6.12.76`` aarch64), same process, unsealed then sealed, from a
      same-UID sibling holding no ``CAP_SYS_PTRACE``:

          PTRACE_SEIZE          rc=0        ->  rc=-1 EPERM
          open /proc/<pid>/mem  OK          ->  EACCES
          open /proc/<pid>/fd/N OK          ->  EACCES

      ``gdb -p``, ``py-spy dump``, ``eu-stack``, ``gcore`` and every other
      attach-based tool go through exactly those calls, so all of them are
      refused.  That sentence sits directly under a MEASURED table and used to
      carry no marker of its own, which made an inference read as a
      measurement.  It has since been CORROBORATED for ``py-spy`` specifically,
      on the same qualified Linux host as the table and not in this
      repository's containers: both primitives ``py-spy`` uses --
      ``process_vm_readv`` and reading ``/proc/<pid>/maps`` -- are refused
      post-seal.  The generalisation to "every other attach-based tool" is
      REASONED from the shared ``ptrace_may_access`` gate, not measured.  The
      production unit runs ``User=patina`` with
      ``NoNewPrivileges=true`` and grants no ``CAP_SYS_PTRACE``, so nothing there
      can bypass it -- not even the operator's own shell as ``patina``.

      WHAT AN OPERATOR CAN ACTUALLY DO, in order of cost:

        1. Read the journal.  Every refusal on this path is a typed
           ``AdapterError`` with a ``REFINE_*`` code and a bounded diagnostic;
           that is the designed post-mortem surface and it is unaffected.
        2. Attach BEFORE the first engine output handoff -- PARTIALLY EFFECTIVE,
           and the partiality is the point.  The seal is dropped by the first
           call to :func:`_open_output_freeze_vault` -- the only caller of this
           function -- and that is reached only from
           :func:`_receive_native_outputs` with a non-empty ledger, so a run with
           ``outputs=None`` never seals at all.  Whether an ALREADY-ATTACHED
           tracer survives the flag drop was previously REASONED here; it has
           since been MEASURED on a qualified Linux host (NOT in this
           repository's containers, which is why no test here re-checks it), and
           the reasoning was only half right.  The ptrace RELATIONSHIP does
           survive -- a tracer attached before the seal issued
           ``PTRACE_INTERRUPT`` afterwards with rc=0 -- but that same tracer's
           ``open("/proc/<pid>/mem")`` is then refused ``EACCES``.  So
           an operator who attaches early keeps process control (stop, continue,
           signal, wait) and LOSES the primary memory-read path, which is what
           most post-mortems actually want.  Attaching early is worth doing and
           is not a full substitute for a debuggable process.
        3. Reproduce off the production unit.  Running the same operation in a
           process that is allowed to hold ``CAP_SYS_PTRACE`` (or as root) leaves
           the route open by design -- the documented residual below -- so a
           deliberate debugging host can still be dumped and attached.

      There is no fourth option, and in particular there is no "raise dumpable
      again for a moment": doing so re-opens the descriptor-theft route while the
      caller still holds the frozen copies, which is the whole thing this
      function exists to prevent.

    Failure is fatal.  A process that could not be sealed is one where
    ``NATIVE_ENGINE_OUTPUT_BYTES_FROZEN_AGAINST_SURVIVING_DESCRIPTORS`` would be
    a false statement, and handing the caller descriptors under a claim this
    module could not keep is worse than refusing the run.
    """

    import ctypes

    library = ctypes.CDLL(None, use_errno=True)
    ctypes.set_errno(0)
    if library.prctl(_PR_SET_DUMPABLE, _SUID_DUMP_DISABLE, 0, 0, 0) != 0:
        raise AdapterError(
            _bounded_diagnostic(
                "cannot seal the refine native boundary against a same-UID "
                "/proc/<pid>/fd reopen: prctl(PR_SET_DUMPABLE, 0) failed with "
                "errno ",
                str(ctypes.get_errno()),
            ),
            _FAILED_CODE,
        )
    # Read back rather than trust the return value.  A seccomp filter or a
    # ptrace-stubbed libc that answers 0 without doing anything would otherwise
    # leave every frozen copy reachable while this module reported it sealed.
    if library.prctl(_PR_GET_DUMPABLE, 0, 0, 0, 0) != _SUID_DUMP_DISABLE:
        raise AdapterError(
            "the refine native boundary is still dumpable after "
            "prctl(PR_SET_DUMPABLE, 0); a same-UID process could reopen the "
            "frozen engine output descriptors through /proc/<pid>/fd",
            _FAILED_CODE,
        )


def _open_output_freeze_vault(lease: NativeWorkspaceLease) -> tuple[str, int]:
    """Create the parent-private 0700 directory the frozen copies are born in.

    Where this lives is a deliberate choice, not a convenience:

    * **Not the lease.**  The lease is purged before this call's caller returns,
      and Linux refuses ``O_TMPFILE`` against an already-removed directory
      (``EPERM``), so the copies could not be minted there at the moment they
      are needed.  The lease is also the one directory the child can write.
    * **Inside the operator's container**, as a sibling of the lease.  Anonymous
      files are allocated on the FILESYSTEM the anchor directory lives on, and
      ``provision_native_workspace_lease`` already refuses a lease whose
      ``st_dev`` differs from that container's.  Anchoring here is therefore the
      only placement that guarantees the copy is a same-filesystem copy without
      re-deriving the container from anything the child influenced.
    * **0700 and owned by us**, verified after the open rather than assumed, and
      on the same device as the lease -- also verified, so a container that was
      swapped between provisioning and now cannot silently move the copies onto
      another filesystem.

    The directory is always empty (nothing is ever named inside it), so its
    removal in :func:`_release_output_freeze_vault` cannot fail for
    ``ENOTEMPTY``, and its whole lifetime is inside one receipt call.

    TRANSIENT DISK HEADROOM, written down here because it is an operational
    precondition no reader could infer from the code: minting the frozen copies
    costs **1.00x the aggregate output payload IN ADDITION to what the lease
    already occupies**, and the two coexist.  All seven copies are minted before
    the vault is released, so at the instant the last one finishes the filesystem
    carries the lease's seven artifacts plus seven identical copies -- 2x
    payload.  It is not 3x: the lease is purged before ``storage`` stages
    anything, so the freeze copies and the staging copy are never concurrent.
    Peak is 2x payload at each of two separate moments and never more.  At the
    ``NATIVE_CHILD_MAX_OUTPUT_TOTAL_BYTES`` ceiling that means **8 GiB of free
    space beyond the lease**.  A filesystem that cannot supply it fails with
    ``REFINE_ENGINE_NO_SPACE`` from :func:`_frozen_output_copy` -- fully
    fail-closed, no short copy and no partial file -- not with a silent
    truncation.

    Sealing happens HERE, not at the boundary's pre-spawn capability check, and
    that placement is the point: this is the narrowest function that dominates
    every path to a frozen copy, including a direct call to
    :func:`_receive_native_outputs`.  Sealing at the boundary would leave a
    direct caller minting copies in a process a same-UID actor can still open.
    """

    _require_output_freeze_capabilities()
    # Before the first copy exists, never after: the descriptors this call is
    # about to create outlive the call, so the seal has to be in place before
    # any of them do.
    _seal_process_against_procfs_descriptor_theft()
    name: str | None = None
    for _attempt in range(NATIVE_WORKSPACE_NAME_ATTEMPTS):
        candidate = _workspace_scratch_name(NATIVE_OUTPUT_FREEZE_VAULT_PREFIX)
        try:
            os.mkdir(candidate, mode=0o700, dir_fd=lease.parent_descriptor)
        except FileExistsError:
            continue
        except OSError as exc:
            # OPERATIONAL, not deterministic: the reachable errnos here are all
            # host state (no free inodes or blocks, a container the operator
            # has since made unwritable, ENOMEM), never a fact about the task.
            raise AdapterError(
                "cannot create the native engine output freeze vault",
                _SCRATCH_UNAVAILABLE_CODE,
            ) from exc
        name = candidate
        break
    if name is None:
        # OPERATIONAL: every attempt collided with an existing name, which is a
        # transient condition of the container, not a property of this run.
        raise AdapterError(
            "cannot create a unique native engine output freeze vault",
            _SCRATCH_UNAVAILABLE_CODE,
        )
    try:
        descriptor = os.open(
            name,
            _workspace_directory_flags(),
            dir_fd=lease.parent_descriptor,
        )
    except OSError as exc:
        cleanup_errors = _release_output_freeze_vault(lease, None, name)
        if cleanup_errors:
            raise _cleanup_failed_error(
                "native engine output freeze vault setup failed",
                cleanup_errors,
            ) from exc
        # OPERATIONAL: the directory was created a moment ago and still exists;
        # what can refuse to OPEN it is an exhausted descriptor table (EMFILE,
        # ENFILE), ENOMEM, or a container an operator has just re-permissioned.
        raise AdapterError(
            "native engine output freeze vault is unreadable",
            _SCRATCH_UNAVAILABLE_CODE,
        ) from exc
    try:
        os.set_inheritable(descriptor, False)
        metadata = os.fstat(descriptor)
        # No ``S_ISDIR`` clause: ``_workspace_directory_flags`` carries
        # ``O_DIRECTORY``, so a non-directory fails the open above with ENOTDIR
        # and this expression is never reached with one.  A clause no deletion
        # can turn a test red is not a guard, so it is not written.
        if (
            metadata.st_uid != os.geteuid()
            or stat.S_IMODE(metadata.st_mode) != 0o700
            or metadata.st_dev != lease.identity[0]
            or os.listdir(descriptor)
        ):
            raise AdapterError(
                "native engine output freeze vault is not a fresh private "
                "directory on the lease filesystem",
                _FAILED_CODE,
            )
    except BaseException:
        cleanup_errors = _release_output_freeze_vault(lease, descriptor, name)
        if cleanup_errors:
            raise _cleanup_failed_error(
                "native engine output freeze vault setup failed",
                cleanup_errors,
            )
        raise
    return name, descriptor


def _release_output_freeze_vault(
    lease: NativeWorkspaceLease,
    descriptor: int | None,
    name: str | None,
) -> tuple[str, ...]:
    """Remove the freeze vault and close its descriptor; report what failed.

    Removal is by name relative to the lease's pinned container descriptor, and
    the vault is always empty, so ``ENOTEMPTY`` here means a same-UID actor put
    something inside a directory only this process should be able to enter.
    That is reported as a cleanup failure, which fails the run.
    """

    errors: list[str] = []
    if name is not None:
        try:
            os.rmdir(name, dir_fd=lease.parent_descriptor)
        except BaseException as exc:
            errors.append(
                _bounded_diagnostic(
                    "cannot remove the native engine output freeze vault: ",
                    _exception_summary(exc),
                    maximum_bytes=_MAX_CLEANUP_ERROR_BYTES,
                )
            )
    if type(descriptor) is int:
        errors.extend(
            _close_descriptors_safely(
                (("native engine output freeze vault", descriptor),)
            )
        )
    return tuple(errors)


def _read_only_freeze_alias(writable_descriptor: int, *, token: str) -> int:
    """Reopen the parent's just-written copy read-only and prove it is the same.

    The caller must never be handed a writable descriptor: every consumer of
    this channel reads positionally, and a write-capable handle sitting in a
    long-lived sink is a hazard with no matching use.  Access mode cannot be
    changed on an open descriptor, so the only way to drop it is to reopen.

    ``/proc/self/fd/<n>`` is this process's own descriptor table.  It IS a name
    -- ``/proc/<pid>/fd/<n>`` is exactly what a same-UID actor would open to
    reach these bytes -- and the reason using it here is sound is that
    :func:`_seal_process_against_procfs_descriptor_theft` has already made this
    process's entry unopenable without ``CAP_SYS_PTRACE``.  What remains true
    unconditionally is narrower: no other process can substitute an entry in it,
    it does not outlive the descriptor, and it cannot be created for an inode
    this process does not already hold.  The reopened descriptor is nevertheless
    bound back to the original by ``(st_dev, st_ino)``, regular-file type and
    link count, so the claim rests on a check rather than on that argument.

    Two checks that would look natural here are deliberately absent because no
    deletion of them could turn a test red: the reopened size cannot differ from
    the original's when both name one inode at one instant, and the access mode
    cannot be anything but ``O_RDONLY`` when this function is the only thing that
    opens it.  The read-only property is asserted by a test on the descriptor
    this channel actually hands out, which is where it can go red.
    """

    alias = f"{NATIVE_OUTPUT_FREEZE_ALIAS_DIRECTORY}/{writable_descriptor}"
    try:
        # No ``O_NOFOLLOW``: a procfs descriptor entry IS a magic symlink, and
        # refusing to follow it would refuse every copy this function exists for.
        readable = os.open(alias, os.O_RDONLY | os.O_CLOEXEC)
    except OSError as exc:
        raise AdapterError(
            f"native engine output {token} private copy could not be reopened "
            "read-only",
            _FAILED_CODE,
        ) from exc
    try:
        os.set_inheritable(readable, False)
        original = os.fstat(writable_descriptor)
        reopened = os.fstat(readable)
        if (
            (reopened.st_dev, reopened.st_ino) != (original.st_dev, original.st_ino)
            or not stat.S_ISREG(reopened.st_mode)
            or reopened.st_nlink != 0
        ):
            raise AdapterError(
                f"native engine output {token} private copy is not the anonymous "
                "file the parent just wrote",
                _FAILED_CODE,
            )
    except BaseException:
        close_errors = _close_descriptors_safely(((token, readable),))
        if close_errors:
            raise _cleanup_failed_error(
                "native engine output freeze failed",
                close_errors,
            )
        raise
    return readable


def _frozen_output_copy(
    source_descriptor: int,
    *,
    token: str,
    vault_descriptor: int,
    expected_size: int,
    remaining_seconds,
) -> tuple[int, tuple[int, int]]:
    """Copy one engine output into a never-named private file and keep THAT.

    ``O_TMPFILE`` creates an inode with no directory entry; ``O_EXCL`` makes it
    permanently un-linkable, so not even this process can give it a name later.
    Nothing is transported over SCM_RIGHTS, nothing is inherited across an
    ``execve``, and the file is created after the child is already running, so no
    descendant can ever have held a descriptor to it.

    HOW "not inherited" IS ACTUALLY DELIVERED, stated exactly because an earlier
    revision of this docstring credited it to the wrong thing.  The guarantee is
    CPython's: ``os.open`` sets ``FD_CLOEXEC`` on every descriptor it returns
    regardless of the flags it was passed (PEP 446).  The ``O_CLOEXEC`` below and
    the ``set_inheritable(..., False)`` that follows it are RESTATEMENTS of that
    -- deliberate, because the property must not silently depend on an
    interpreter detail, but behaviour-preserving on CPython and therefore not
    individually deletable-detectable: deleting either one, on either descriptor,
    changes nothing a test can see, and this docstring does not pretend
    otherwise.  What IS observed, across a real fork+exec with ``close_fds``
    disabled, is the property itself, by
    ``test_every_freeze_descriptor_is_non_inheritable_from_the_instant_it_is_opened``,
    ``test_the_writable_copy_is_not_inherited_while_the_engine_bytes_are_in_it``
    and
    ``test_the_descriptor_the_caller_receives_is_not_inherited_across_an_exec``.
    Flipping either ``set_inheritable`` to ``True`` -- which CLEARS the bit --
    turns one of those red; so would a creation path that yielded an inheritable
    descriptor.

    Bytes are moved with positional reads and writes: the source's file offset is
    never observed or disturbed, so the lease-side descriptor stays usable for
    the post-purge witness check.  Every chunk re-checks the one carried
    deadline, so a copy that cannot finish in the stage's remaining time fails on
    time instead of stalling.

    NOTE what this does NOT do: it does not verify the bytes.  A source that is
    being rewritten while it is copied simply produces a copy of something else,
    and the caller's digest check on the copy is what refuses that.  This
    function is only responsible for producing an object nothing can change.

    THE TRANSIENT HEADROOM THIS COSTS: one full extra copy of the payload, held
    at the same time as the lease-side original.  All seven copies exist before
    the vault is released, so peak occupancy while this runs is **2x the
    aggregate output payload** -- 8 GiB beyond the lease at the
    ``NATIVE_CHILD_MAX_OUTPUT_TOTAL_BYTES`` ceiling.  It is never 3x, because the
    lease is purged before ``storage`` stages anything and the freeze copies and
    the staging copy are therefore never concurrent.  A filesystem that runs out
    mid-copy fails closed with ``REFINE_ENGINE_NO_SPACE``: no short copy reaches
    the caller, no partial file survives (the anonymous inode dies with its
    descriptor) and the space is fully reclaimed.

    THE TIME IT COSTS is not the reason to worry about it.  Measured in this
    repository's Linux test container (aarch64, overlayfs, page cache warm):
    256 MiB in 0.07 s, 1 GiB in 0.38 s, 2 GiB in 0.70 s, plus 0.4-1.4 s for the
    kernel to write each back.  Extrapolated to the 8 GiB aggregate ceiling that
    is single-digit seconds against a 400-frame solve measured in minutes.  The
    number that can actually stop a run is the disk headroom above, not this one.

    THE THROUGHPUT NUMBERS ABOVE ARE CONTAINER FIGURES ON OVERLAYFS and item 7's
    real run on the GPU box is what replaces them; that hedge is still accurate
    and stays.

    A DIFFERENT FILESYSTEM PROPERTY HAS since been measured and is recorded here
    because it bit a test rather than a copy: when an allocation sequence
    repeats, the just-freed inode NUMBER comes straight back, so ``st_ino``
    inequality is NOT evidence that a file is a different file.  Reproduced, not
    argued: ``test_install_script`` failed as ``assert 7903675 != 7903675`` on a
    qualified host and as ``assert 6945173 != 6945173`` in this repository's own
    gate container, while content and sentinel evidence showed the file
    genuinely had been discarded and re-copied.

    THE MECHANISM IS DELIBERATELY NOT NAMED.  An earlier revision of this
    paragraph credited it to ext4 and to that container's ``/tmp`` being ext4;
    the container reports ``overlayfs`` and has no separate ``/tmp`` mount, so
    that provenance was wrong and the ext4-versus-overlayfs discriminator it
    implied is falsified by the very host it was claimed from.  Recycling is
    what was observed -- 20/20 in a direct probe of that container -- and
    recycling is all that is claimed.  This module already had to pin directory
    identity with an ``O_PATH`` descriptor for the same reason (see
    ``NATIVE_WORKSPACE_ENTRY_PIN_IS_UNIVERSAL``), and nothing added here may
    treat an inode number as an identity.
    """

    remaining_seconds()
    try:
        writable = os.open(
            ".",
            os.O_TMPFILE | os.O_RDWR | os.O_EXCL | os.O_CLOEXEC,
            0o600,
            dir_fd=vault_descriptor,
        )
    except OSError as exc:
        # A full filesystem cannot mint an inode either, and reporting that as
        # "this platform has no O_TMPFILE" would send the operator to look for a
        # kernel feature instead of for free blocks.
        if exc.errno in _OUTPUT_FREEZE_NO_SPACE_ERRNOS:
            raise AdapterError(
                f"native engine output {token} cannot be frozen: the freeze "
                "vault filesystem is out of space, so the parent cannot create "
                "the private copy; free disk space on the workspace container",
                _NO_SPACE_CODE,
            ) from exc
        raise AdapterError(
            f"native engine output {token} cannot be frozen: the workspace "
            "filesystem does not support O_TMPFILE anonymous files",
            _FAILED_CODE,
        ) from exc
    try:
        os.set_inheritable(writable, False)
        copied = 0
        while copied < expected_size:
            remaining_seconds()
            chunk = os.pread(
                source_descriptor,
                min(_OUTPUT_FREEZE_COPY_BYTES, expected_size - copied),
                copied,
            )
            if not chunk:
                # The ONLY bound on this loop.  A source truncated after its size
                # was read stops returning bytes; without this the loop would
                # spin on a fixed offset until the deadline rather than saying
                # what happened.
                raise AdapterError(
                    f"native engine output {token} ended before its declared size",
                    _INVALID_INPUT_CODE,
                )
            written = 0
            while written < len(chunk):
                remaining_seconds()
                try:
                    progress = os.pwrite(writable, chunk[written:], copied + written)
                except OSError as exc:
                    # A full lease filesystem is an EXPECTED operational
                    # condition at this ceiling, so it is named rather than
                    # arriving at the caller as "unexpected refine native
                    # boundary failure: OSError".  Every other errno stays
                    # unexpected on purpose: EIO is a disk fault, not headroom,
                    # and telling an operator to free space would be a wrong
                    # instruction rather than a vague one.
                    if exc.errno not in _OUTPUT_FREEZE_NO_SPACE_ERRNOS:
                        raise
                    raise AdapterError(
                        f"native engine output {token} cannot be frozen: the "
                        "freeze vault filesystem ran out of space mid-copy; the "
                        "handoff needs the whole output payload free in addition "
                        "to the lease, so free disk space on the workspace "
                        "container",
                        _NO_SPACE_CODE,
                    ) from exc
                if progress <= 0:
                    # The ONLY bound on the inner loop.  A ``pwrite`` that keeps
                    # returning zero -- a full filesystem answering short, say --
                    # would otherwise spin here forever on a fixed offset with no
                    # deadline check between iterations.  Deleting this is a hang,
                    # not a wrong answer.
                    raise AdapterError(
                        f"native engine output {token} private copy stopped "
                        "accepting bytes",
                        _FAILED_CODE,
                    )
                written += progress
            copied += len(chunk)
        remaining_seconds()
        # No size/type/link post-condition here.  The loop copies exactly
        # ``expected_size`` bytes or raises, and an ``O_TMPFILE`` file is a
        # nameless regular file by construction, so every such clause would be
        # undeletable-by-any-test.  The one property worth re-checking on a
        # DIFFERENT descriptor -- that the alias really is the same anonymous
        # inode -- is checked in ``_read_only_freeze_alias``, where a wrong
        # descriptor can actually make it fire.
        metadata = os.fstat(writable)
        readable = _read_only_freeze_alias(writable, token=token)
    except BaseException:
        close_errors = _close_descriptors_safely(((token, writable),))
        if close_errors:
            raise _cleanup_failed_error(
                "native engine output freeze failed",
                close_errors,
            )
        raise
    close_errors = _close_descriptors_safely(((token, writable),))
    if close_errors:
        raise _cleanup_failed_error(
            "native engine output freeze failed",
            (*close_errors, *_close_descriptors_safely(((token, readable),))),
        )
    return readable, (metadata.st_dev, metadata.st_ino)


def _receive_native_outputs(
    connection: Connection | None,
    ledger: tuple[tuple[str, str, int], ...],
    *,
    workspace_lease: NativeWorkspaceLease | None,
    deadline: RefineDeadline,
) -> _NativeOutputReceipt:
    """Bind the child's descriptors to the parent's opens, then copy and keep.

    For every token the parent receives the child's descriptor, opens the same
    canonical name relative to its OWN pinned lease root, and refuses the run
    unless the two descriptors are the same ``(st_dev, st_ino)``.  Neither check
    is sufficient alone: without the transported descriptor a name swapped
    between the engine's write and this open would go unnoticed; without the
    parent's own open a child could hand back any descriptor it liked.

    Together they establish WHICH inode the engine wrote.  They cannot establish
    that its bytes will stop changing, so the parent then copies that inode into
    an anonymous private file and hashes the copy.  What the caller receives is
    the copy; the lease-side descriptor is retained only as a witness for the
    post-purge hardlink check and is closed by the boundary itself.
    """

    if not ledger:
        return _NativeOutputReceipt((), ())
    if connection is None:
        raise AdapterError(
            "native engine output transport is unavailable",
            _FAILED_CODE,
        )
    if workspace_lease is None:
        raise AdapterError(
            "native engine outputs require a parent-provisioned workspace lease",
            _FAILED_CODE,
        )

    from multiprocessing.reduction import recv_handle

    # The capability refusal lives in ``_open_output_freeze_vault``, at the point
    # of use, and in ``run_native_engine_child``, before anything is spawned.
    # A third copy here was deletable with zero red -- the vault's own check
    # raised the identical error two statements later -- so it is not written.
    work_descriptor = _open_leased_output_directory(workspace_lease.descriptor)
    vault_name: str | None = None
    vault_descriptor: int | None = None
    received: list[NativeEngineOutput] = []
    witnesses: list[_OutputSourceWitness] = []
    seen_identities: set[tuple[int, int]] = set()
    try:
        vault_name, vault_descriptor = _open_output_freeze_vault(workspace_lease)
        for token, declared_sha256, declared_size in ledger:
            deadline.remaining_seconds()
            if not connection.poll(deadline.remaining_seconds()):
                raise AdapterError(
                    "native engine output transfer exceeded the shared deadline",
                    _TIMEOUT_CODE,
                )
            child_descriptor = recv_handle(connection)
            transported_identity = _transported_output_identity(
                child_descriptor,
                token=token,
                declared_size=declared_size,
            )
            try:
                source_descriptor = os.open(
                    token,
                    _output_file_open_flags(),
                    dir_fd=work_descriptor,
                )
            except OSError as exc:
                raise AdapterError(
                    (
                        f"native engine output {token} is not readable from the "
                        "parent-owned lease"
                    ),
                    _INVALID_INPUT_CODE,
                ) from exc
            witnesses.append(
                _OutputSourceWitness(
                    token=token,
                    descriptor=source_descriptor,
                    identity=transported_identity,
                )
            )
            parent_metadata = os.fstat(source_descriptor)
            if not stat.S_ISREG(parent_metadata.st_mode):
                raise AdapterError(
                    f"native engine output {token} must be a regular file",
                    _INVALID_INPUT_CODE,
                )
            if (
                parent_metadata.st_dev,
                parent_metadata.st_ino,
            ) != transported_identity:
                raise AdapterError(
                    (
                        f"native engine output {token} is not the object the child "
                        "transported"
                    ),
                    _INVALID_INPUT_CODE,
                )
            if transported_identity in seen_identities:
                raise AdapterError(
                    "native engine outputs must reference unique file identities",
                    _INVALID_INPUT_CODE,
                )
            seen_identities.add(transported_identity)
            # From here the lease-side object has done its whole job: it proved
            # which inode the engine wrote.  What the caller gets is a copy of it
            # that nothing else can reach.
            frozen_descriptor, frozen_identity = _frozen_output_copy(
                source_descriptor,
                token=token,
                vault_descriptor=vault_descriptor,
                expected_size=declared_size,
                remaining_seconds=deadline.remaining_seconds,
            )
            received.append(
                NativeEngineOutput(
                    token=token,
                    descriptor=frozen_descriptor,
                    sha256=declared_sha256,
                    size_bytes=declared_size,
                    identity=frozen_identity,
                    source_identity=transported_identity,
                )
            )
            # The parent's own bytes decide, and they are read from the COPY --
            # the exact object the caller will read.  A declared digest this does
            # not reproduce fails the run, so a source rewritten mid-copy is
            # caught here rather than being silently frozen.
            verified_snapshot = _validate_pinned_descriptor(
                frozen_descriptor,
                token=token,
                expected_sha256=declared_sha256,
                expected_size=declared_size,
                remaining_seconds=deadline.remaining_seconds,
            )
            received[-1] = NativeEngineOutput(
                token=token,
                descriptor=frozen_descriptor,
                sha256=declared_sha256,
                size_bytes=declared_size,
                identity=frozen_identity,
                verified_snapshot=verified_snapshot,
                source_identity=transported_identity,
            )
        deadline.remaining_seconds()
    except BaseException as exc:
        close_errors = (
            *_close_descriptors_safely(
                (output.token, output.descriptor) for output in received
            ),
            *_close_descriptors_safely(
                (witness.token, witness.descriptor) for witness in witnesses
            ),
        )
        directory_errors = (
            *_release_output_freeze_vault(
                workspace_lease, vault_descriptor, vault_name
            ),
            *_close_descriptors_safely(
                (("native engine output directory", work_descriptor),)
            ),
        )
        if close_errors or directory_errors:
            raise _cleanup_failed_error(
                "native engine output receipt failed",
                (*close_errors, *directory_errors),
            ) from exc
        raise
    directory_errors = (
        *_release_output_freeze_vault(workspace_lease, vault_descriptor, vault_name),
        *_close_descriptors_safely(
            (("native engine output directory", work_descriptor),)
        ),
    )
    if directory_errors:
        raise _cleanup_failed_error(
            "native engine output receipt failed",
            (
                *directory_errors,
                *_close_descriptors_safely(
                    (output.token, output.descriptor) for output in received
                ),
                *_close_descriptors_safely(
                    (witness.token, witness.descriptor) for witness in witnesses
                ),
            ),
        )
    return _NativeOutputReceipt(tuple(received), tuple(witnesses))


def _frozen_snapshot_fields(snapshot: tuple[int, ...]) -> tuple[int, ...]:
    """Return the snapshot fields a lease purge is not allowed to move.

    ``st_ctime_ns`` is dropped, and that is a measurement rather than a guess:
    removing the last name of an open file bumps ``st_ctime_ns`` and leaves
    ``st_mode``, ``st_size`` and ``st_mtime_ns`` untouched on both platforms this
    repository is built on (Linux 6.x/overlayfs and macOS/APFS were both
    measured).  Since the purge IS that removal, comparing ``st_ctime_ns``
    across it would fail every honest run -- and on Linux only once enough wall
    time separated the hash from the purge for the coarse inode clock to tick,
    which is the worst kind of guard: green on a fast container, red on the
    qualified host.

    SOMETHING IS GIVEN UP, and it is not recoverable.  ``st_ctime_ns`` was the
    only field in this tuple a writer cannot forge: a process holding an
    ``O_RDWR`` descriptor can ``pwrite`` same-length bytes and then restore
    ``st_mtime_ns`` with ``futimens``, leaving every remaining field identical.
    That was demonstrated, not theorised.  Dropping ``st_ctime_ns`` is still
    correct -- keeping it would fail honest runs -- which means no subset of
    ``fstat`` can prove these bytes did not change.  This comparison is
    therefore an internal consistency assertion about an object the parent
    constructed, NOT a defence against a hostile writer.  The defence is that
    the object being compared is a private anonymous copy no other descriptor
    has ever referred to; see
    ``NATIVE_ENGINE_OUTPUT_BYTES_FROZEN_AGAINST_SURVIVING_DESCRIPTORS``.
    """

    if len(snapshot) != _DESCRIPTOR_SNAPSHOT_FIELDS:
        raise AdapterError(
            "native engine output fingerprint has an unexpected shape",
            _FAILED_CODE,
        )
    return (
        *snapshot[:_DESCRIPTOR_SNAPSHOT_CTIME_INDEX],
        *snapshot[_DESCRIPTOR_SNAPSHOT_CTIME_INDEX + 1 :],
    )


def _unfrozen_output_errors(
    outputs: tuple[NativeEngineOutput, ...],
    witnesses: tuple[_OutputSourceWitness, ...],
) -> tuple[str, ...]:
    """Check two different things after the purge, for two different reasons.

    **The witnesses: did the child smuggle an artifact out of its sandbox?**
    At receipt time the child is still alive and the lease-side object still has
    a name, so a child that ``link``s ``work/<token>`` to any path outside the
    lease keeps a route to it that no receipt-time check can see -- the
    transported descriptor, the identity match and the parent's own digest are
    all satisfied by honest bytes.  Once the parent has removed every name it
    owns, ``st_nlink != 0`` on the lease-side descriptor names exactly that
    escape.  This no longer protects the caller's bytes (the caller holds a copy
    the escaped name cannot reach) and it is not claimed to; it refuses a run
    whose engine wrote outside the boundary it was given.

    **The outputs: is the descriptor being handed over the private copy?**
    ``st_nlink == 0`` and an unchanged :func:`_frozen_snapshot_fields` tuple are
    both construction invariants of an ``O_TMPFILE | O_EXCL`` file this process
    created, and which -- with the process sealed non-dumpable by
    :func:`_seal_process_against_procfs_descriptor_theft` -- no same-UID actor
    can reach.  Root and anything holding ``CAP_SYS_PTRACE`` still can; that is
    the residual the flag names and neither clause below is a defence against
    it.  They are asserted, not assumed, because
    the alternative is trusting that a later edit did not accidentally return
    the lease-side descriptor instead.  Neither clause is a defence against a
    hostile writer: ``futimens`` forges the second, and the first is trivially
    true of any unlinked file.  What makes the bytes frozen is that the object
    is a never-named copy, which is settled at receipt, not here.

    Errors are collected rather than raised so one bad token cannot hide the
    state of the other six in the report the caller receives.
    """

    errors: list[str] = []
    for witness in witnesses:
        try:
            witness_metadata = os.fstat(witness.descriptor)
        except BaseException as exc:
            errors.append(
                _bounded_diagnostic(
                    "native engine output ",
                    witness.token,
                    " could not be re-inspected after the purge: ",
                    _exception_summary(exc),
                    maximum_bytes=_MAX_CLEANUP_ERROR_BYTES,
                )
            )
            continue
        if witness_metadata.st_nlink != 0:
            errors.append(
                _bounded_diagnostic(
                    "native engine output ",
                    witness.token,
                    " is still reachable by name after the lease purge (",
                    _bounded_int_repr(witness_metadata.st_nlink, maximum_bytes=32),
                    " links)",
                    maximum_bytes=_MAX_CLEANUP_ERROR_BYTES,
                )
            )
    for output in outputs:
        if not output.verified_snapshot:
            errors.append(
                _bounded_diagnostic(
                    "native engine output ",
                    output.token,
                    " was never fingerprinted by the parent",
                    maximum_bytes=_MAX_CLEANUP_ERROR_BYTES,
                )
            )
            continue
        try:
            metadata = os.fstat(output.descriptor)
        except BaseException as exc:
            errors.append(
                _bounded_diagnostic(
                    "native engine output ",
                    output.token,
                    " could not be re-inspected after the purge: ",
                    _exception_summary(exc),
                    maximum_bytes=_MAX_CLEANUP_ERROR_BYTES,
                )
            )
            continue
        if metadata.st_nlink != 0:
            errors.append(
                _bounded_diagnostic(
                    "native engine output ",
                    output.token,
                    " private copy is reachable by name (",
                    _bounded_int_repr(metadata.st_nlink, maximum_bytes=32),
                    " links)",
                    maximum_bytes=_MAX_CLEANUP_ERROR_BYTES,
                )
            )
        try:
            current_snapshot = _descriptor_snapshot(
                metadata,
                output.descriptor,
                token=output.token,
            )
        except BaseException as exc:
            errors.append(
                _bounded_diagnostic(
                    "native engine output ",
                    output.token,
                    " could not be re-fingerprinted after the purge: ",
                    _exception_summary(exc),
                    maximum_bytes=_MAX_CLEANUP_ERROR_BYTES,
                )
            )
            continue
        try:
            frozen_now = _frozen_snapshot_fields(current_snapshot)
            frozen_then = _frozen_snapshot_fields(output.verified_snapshot)
        except BaseException as exc:
            errors.append(
                _bounded_diagnostic(
                    "native engine output ",
                    output.token,
                    " fingerprint could not be compared: ",
                    _exception_summary(exc),
                    maximum_bytes=_MAX_CLEANUP_ERROR_BYTES,
                )
            )
            continue
        if frozen_now != frozen_then:
            errors.append(
                _bounded_diagnostic(
                    "native engine output ",
                    output.token,
                    " changed after the parent verified it",
                    maximum_bytes=_MAX_CLEANUP_ERROR_BYTES,
                )
            )
    return tuple(errors)


def _child_entry(
    connection: Connection,
    pinned_connection: Connection | None,
    pinned_ledger: tuple[tuple[str, str, int], ...],
    workspace_connection: Connection | None,
    workspace_leased: bool,
    workspace_path: str | None,
    output_connection: Connection | None,
    output_tokens: tuple[str, ...],
    entrypoint: str,
    request_payload: bytes,
    expires_at_monotonic_s: float,
) -> None:
    """Spawn-safe fixed target; native modules are imported after ``setsid``."""

    received_files: Mapping[str, int] = MappingProxyType({})
    received_snapshots: Mapping[str, tuple[int, ...]] = MappingProxyType({})
    workspace_descriptor: int | None = None
    output_transfers: tuple[_OutputTransfer, ...] = ()
    terminal: Mapping[str, Any] | None = None
    try:
        if os.name != "posix" or not hasattr(os, "setsid"):
            raise _ChildTransportError(
                "refine native child requires POSIX session isolation"
            )
        if workspace_leased is not True and workspace_leased is not False:
            raise _ChildTransportError(
                "native child workspace lease declaration must be an exact boolean"
            )
        # The child re-derives the request rather than trusting the transported
        # tuple's shape: the two ends must agree on the closed universe or the
        # boundary refuses before anything is opened.
        requested_outputs: tuple[str, ...] = ()
        if output_tokens:
            requested_outputs = _validated_output_request(output_tokens)
        if bool(requested_outputs) != (output_connection is not None):
            raise _ChildTransportError(
                "native child output transport does not match its token request"
            )
        if requested_outputs and workspace_leased is not True:
            raise _ChildTransportError(
                "native child outputs require a parent-provisioned workspace lease"
            )
        os.setsid()
        pid = os.getpid()
        _send_envelope(
            connection,
            {
                "protocolVersion": _PROTOCOL_VERSION,
                "kind": "ready",
                "pid": pid,
                "processGroupId": os.getpgrp(),
                "sessionId": os.getsid(0),
                "pinnedFileCount": len(pinned_ledger),
                "workspaceLeased": workspace_leased,
                "workspacePath": workspace_path,
                "outputTokens": list(requested_outputs),
            },
        )
        context = NativeChildContext(expires_at_monotonic_s)
        _receive_exact_child_ack(
            connection,
            expected=_ACK_READY,
            context=context,
            phase="readiness",
        )
        validated_ledger = _validated_pinned_ledger(pinned_ledger)
        received_files, received_snapshots = _receive_pinned_files(
            pinned_connection,
            validated_ledger,
            context=context,
        )
        workspace_lease = _receive_workspace_lease(
            workspace_connection,
            leased=workspace_leased,
            path=workspace_path,
            context=context,
        )
        workspace_subdirectory_paths: Mapping[str, str] = MappingProxyType({})
        verified_workspace_path: str | None = None
        if workspace_lease is not None:
            (
                workspace_descriptor,
                verified_workspace_path,
                workspace_subdirectory_paths,
            ) = workspace_lease
        context = _seal_native_child_context(
            NativeChildContext(
                expires_at_monotonic_s,
                received_files,
                workspace_descriptor,
                verified_workspace_path,
                workspace_subdirectory_paths,
            )
        )
        context.remaining_seconds()
        request = json.loads(request_payload.decode("utf-8"))
        if type(request) is not dict:
            raise _ChildTransportError(
                "native child request did not decode to an object"
            )
        target = _resolve_entrypoint(entrypoint)
        result = target(request, context)
        context.remaining_seconds()
        for token, expected_sha256, expected_size in validated_ledger:
            _validate_pinned_descriptor(
                received_files[token],
                token=token,
                expected_sha256=expected_sha256,
                expected_size=expected_size,
                remaining_seconds=context.remaining_seconds,
                expected_snapshot=received_snapshots[token],
            )
        output_transfers = _open_child_outputs(
            requested_outputs,
            context=context,
        )
        terminal = {
            "protocolVersion": _PROTOCOL_VERSION,
            "kind": "result",
            "value": result,
            "outputLedger": _output_ledger_rows(output_transfers),
        }
        _bounded_json_bytes(
            terminal,
            maximum_bytes=NATIVE_CHILD_MAX_RESPONSE_BYTES,
            overflow_message="native child result exceeds the bounded transport",
        )
    except BaseException as exc:
        terminal = _error_envelope(exc)
    finally:
        cleanup_errors = list(_close_descriptors_safely(received_files.items()))
        if workspace_descriptor is not None:
            cleanup_errors.extend(
                _close_descriptors_safely(
                    (("child workspace lease", workspace_descriptor),)
                )
            )
        if pinned_connection is not None:
            cleanup_errors.extend(
                _close_connections_safely((("child pinned-file", pinned_connection),))
            )
        if workspace_connection is not None:
            cleanup_errors.extend(
                _close_connections_safely(
                    (("child workspace lease", workspace_connection),)
                )
            )
        if cleanup_errors:
            terminal = _error_envelope(
                AdapterError(
                    _bounded_cleanup_report(
                        "native child pinned-file cleanup failed",
                        tuple(cleanup_errors),
                    ),
                    _CLEANUP_FAILED_CODE,
                )
            )

    if terminal is None:  # pragma: no cover - every path sets a terminal envelope
        terminal = _error_envelope(
            AdapterError("native child produced no terminal result", _FAILED_CODE)
        )
    try:
        _send_envelope(connection, terminal)
    except BaseException:
        _close_output_transfers(output_transfers)
        output_transfers = ()
        for closable in (output_connection, connection):
            if closable is None:
                continue
            try:
                closable.close()
            except BaseException:
                pass
        return

    protocol_rejected = False
    try:
        # Descriptors only ever follow a "result".  That used to be a defensive
        # ``if`` that closed the transfers early -- unkillable by any external
        # test, because an error run fails identically either way.  It is now a
        # property of this control flow instead: the ONLY statement in this
        # module that puts an output descriptor on a wire is inside this branch,
        # so an envelope that is not a result cannot reach it at all.  The
        # ``finally`` below closes the transfers on both paths regardless.
        if terminal.get("kind") == "result":
            context = NativeChildContext(expires_at_monotonic_s)
            _send_native_outputs(
                output_connection,
                output_transfers,
                destination_pid=os.getppid(),
                context=context,
            )
    except BaseException:
        protocol_rejected = True
    finally:
        if _close_output_transfers(output_transfers):
            protocol_rejected = True
        output_transfers = ()
        if output_connection is not None:
            try:
                output_connection.close()
            except BaseException:
                protocol_rejected = True
    try:
        context = NativeChildContext(expires_at_monotonic_s)
        _receive_exact_child_ack(
            connection,
            expected=_ACK_ACCEPT,
            context=context,
            phase="result",
        )
    except BaseException:
        protocol_rejected = True
    finally:
        try:
            connection.close()
        except BaseException:
            protocol_rejected = True
    if protocol_rejected:
        raise SystemExit(_CHILD_PROTOCOL_REJECT_EXIT_CODE)


def _receive_envelope(
    connection: Connection,
    process: multiprocessing.Process,
    deadline: RefineDeadline,
) -> Mapping[str, Any]:
    timeout_s = deadline.remaining_seconds()
    try:
        ready = wait((connection, process.sentinel), timeout=timeout_s)
    except OSError as exc:
        raise AdapterError(
            _bounded_diagnostic(
                "cannot wait for refine native child response: ",
                _exception_summary(exc),
            ),
            _FAILED_CODE,
        ) from exc
    if not ready:
        raise _ChildBoundaryTimeout
    if connection not in ready:
        try:
            response_ready = connection.poll(0)
        except OSError as exc:
            raise AdapterError(
                _bounded_diagnostic(
                    "cannot inspect refine native child response: ",
                    _exception_summary(exc),
                ),
                _FAILED_CODE,
            ) from exc
        if not response_ready:
            raise AdapterError(
                "refine native child exited before its response",
                _FAILED_CODE,
            )
    try:
        payload = connection.recv_bytes(NATIVE_CHILD_MAX_RESPONSE_BYTES)
        envelope = json.loads(payload.decode("utf-8"))
    except (EOFError, OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise AdapterError(
            _bounded_diagnostic(
                "refine native child returned an invalid bounded response: ",
                _exception_summary(exc),
            ),
            _FAILED_CODE,
        ) from exc
    if type(envelope) is not dict:
        raise AdapterError(
            "refine native child response must be a JSON object",
            _FAILED_CODE,
        )
    if envelope.get("protocolVersion") != _PROTOCOL_VERSION:
        raise AdapterError(
            "refine native child response has an unsupported protocol version",
            _FAILED_CODE,
        )
    return envelope


def _parse_linux_process_stat(payload: bytes) -> tuple[int, int]:
    """Parse the PID and process-group fields from one bounded procfs stat row.

    EVERY CLAUSE BELOW IS LOAD-BEARING, and that is a sweep result rather than
    an assertion: a mutation sweep against the full gate selection found SIX of
    the nine clauses deletable with ZERO red, which is a hole per clause, not a
    style complaint.  The rows in
    ``test_linux_process_stat_parser_refuses_one_row_per_clause`` were written
    to close them and each names the clause it exists for.  Two of the holes
    were real defects rather than redundancy:

    * ``len(payload) > 8192`` pairs with :func:`_read_linux_process_stat`, which
      reads exactly 8193 bytes.  An over-long row therefore arrives TRUNCATED,
      and a truncated row still parses -- pid and the first three post-``comm``
      fields are at the FRONT -- so deleting this clause does not raise, it
      returns a confident wrong answer for a row the reader never saw the end
      of.  Nothing downstream re-checks the length.
    * ``not prefix.isdigit()`` is not covered by ``int(prefix)``.  ``int`` accepts
      a leading sign and surrounding whitespace where ``bytes.isdigit`` does not,
      so a ``comm`` containing " (" can push a signed or padded token into the
      pid position and be silently accepted as a pid.

    The remaining four (``type(payload) is not bytes``, ``len(payload) == 0``,
    ``opening <= 0``, ``closing <= opening``) were each masked by a NEIGHBOUR
    that raised ``ValueError`` too, so the class of the exception could not tell
    them apart.  They are pinned on the DIAGNOSTIC, which is the thing an
    operator reads and the thing that actually differs.
    """

    if type(payload) is not bytes or len(payload) == 0 or len(payload) > 8192:
        raise ValueError("Linux process stat payload is invalid")
    opening = payload.find(b" (")
    closing = payload.rfind(b") ")
    if opening <= 0 or closing <= opening:
        raise ValueError("Linux process stat payload is malformed")
    prefix = payload[:opening]
    fields = payload[closing + 2 :].split()
    if not prefix.isdigit() or len(fields) < 3:
        raise ValueError("Linux process stat fields are malformed")
    pid = int(prefix)
    process_group_id = int(fields[2])
    # ``pgrp == 0`` is a legitimate reading, not a parse failure. Every Linux
    # kernel thread reports it (no session, no process group), and so does any
    # task whose group leader is invisible in the reading PID namespace. On the
    # qualified host 283 of 547 live PIDs read that way, so rejecting the value
    # aborted the whole quiescence scan on the first kernel thread it walked
    # past and failed every successful native call with a cleanup error.
    #
    # Accepting it cannot hide a live group member: a member is recorded only
    # when its group equals the leader PID, and _linux_process_group_members
    # refuses any leader that is not strictly positive. A zero can therefore
    # never compare equal to a leader -- it is irrelevant to this scan, not
    # ignored by it. A negative identifier is still impossible in procfs, and
    # any other unreadable row still raises and stays fatal.
    if pid <= 0 or process_group_id < 0:
        raise ValueError("Linux process stat identifiers are invalid")
    return pid, process_group_id


def _read_linux_process_stat(path: str) -> tuple[int, int]:
    flags = os.O_RDONLY
    if hasattr(os, "O_CLOEXEC"):
        flags |= os.O_CLOEXEC
    descriptor = os.open(path, flags)
    try:
        payload = os.read(descriptor, 8193)
    finally:
        os.close(descriptor)
    return _parse_linux_process_stat(payload)


def _linux_process_group_members(
    group_leader_pid: int,
    *,
    deadline: RefineDeadline,
) -> tuple[int, ...]:
    """Inspect the frozen Linux group while its unreaped leader reserves the PGID."""

    # The membership test below is the only thing standing between a live
    # adopted descendant and a "quiescent" verdict, and it is an equality
    # against this PID. A zero or negative leader would make that comparison
    # meaningless -- 0 matches every kernel thread and addresses our own group
    # in killpg -- so refuse it here rather than assume the caller.
    if type(group_leader_pid) is not int or group_leader_pid <= 0:
        raise AdapterError(
            "Linux process group inspection requires a positive group leader",
            _CLEANUP_FAILED_CODE,
        )
    members: list[int] = []
    try:
        entries = os.scandir("/proc")
    except OSError as exc:
        raise AdapterError(
            _bounded_diagnostic(
                "cannot enumerate Linux process groups: ",
                _exception_summary(exc),
            ),
            _CLEANUP_FAILED_CODE,
        ) from exc
    with entries:
        for entry in entries:
            deadline.remaining_seconds()
            name = entry.name
            if type(name) is not str or not name.isdecimal():
                continue
            pid = int(name)
            if pid == group_leader_pid:
                continue
            try:
                reported_pid, process_group_id = _read_linux_process_stat(
                    f"/proc/{name}/stat"
                )
            except (FileNotFoundError, ProcessLookupError):
                continue
            except (OSError, ValueError) as exc:
                raise AdapterError(
                    _bounded_diagnostic(
                        "cannot inspect Linux process group member: ",
                        _exception_summary(exc),
                    ),
                    _CLEANUP_FAILED_CODE,
                ) from exc
            if reported_pid != pid:
                raise AdapterError(
                    "Linux process stat changed identity during group inspection",
                    _CLEANUP_FAILED_CODE,
                )
            if process_group_id == group_leader_pid:
                members.append(pid)
                if len(members) >= 4:
                    break
    return tuple(members)


def _success_group_quiescence_errors(
    *,
    group_leader_pid: int,
    deadline: RefineDeadline,
) -> tuple[str, ...]:
    """Freeze and inspect a successful child's group before reaping its leader."""

    deadline.remaining_seconds()
    try:
        os.killpg(group_leader_pid, signal.SIGSTOP)
    except ProcessLookupError:
        return ()
    except PermissionError as exc:
        if sys.platform == "darwin":
            # Darwin reports EPERM when the group contains only our dead,
            # unreaped leader. Every live descendant of this unprivileged child
            # retains our uid and would make the group signal succeed.
            return ()
        return (
            _bounded_diagnostic(
                "cannot freeze successful native child process group: ",
                _exception_summary(exc),
            ),
        )
    except OSError as exc:
        return (
            _bounded_diagnostic(
                "cannot freeze successful native child process group: ",
                _exception_summary(exc),
            ),
        )

    if sys.platform.startswith("linux"):
        # Repeat after the first scan. A descendant racing fork with SIGSTOP
        # cannot keep spawning once stopped; the second frozen snapshot closes
        # that delivery window while the unreaped leader still reserves PGID.
        for _attempt in range(2):
            members = _linux_process_group_members(
                group_leader_pid,
                deadline=deadline,
            )
            if members:
                return ("native child process group retains descendant members",)
            time.sleep(0)
        return ()
    if sys.platform == "darwin":
        return ("native child process group retains a live descendant",)
    return ("successful native child process-group inspection is unsupported",)


def _signal_group(
    group_leader_pid: int,
    sig: signal.Signals,
) -> OSError | None:
    try:
        os.killpg(group_leader_pid, sig)
    except ProcessLookupError:
        return None
    except OSError as exc:
        return exc
    return None


def _signal_error(sig: signal.Signals, exc: OSError) -> str:
    if sig is signal.SIGTERM:
        signal_label = "SIGTERM"
    elif sig is signal.SIGKILL:
        signal_label = "SIGKILL"
    else:
        signal_label = "signal"
    return _bounded_diagnostic(
        "cannot signal native child process group with ",
        signal_label,
        ": ",
        _exception_summary(exc),
    )


def _reap_proven_quiescent_leader(
    process: multiprocessing.Process,
) -> tuple[str, ...]:
    """Reap only the known leader after its group was frozen and proven empty."""

    errors: list[str] = []
    try:
        process.join(NATIVE_CHILD_KILL_REAP_S)
    except BaseException as exc:
        errors.append(
            _bounded_diagnostic(
                "cannot retry joining quiescent native child leader: ",
                _exception_summary(exc),
            )
        )
    try:
        leader_alive = process.is_alive()
    except BaseException as exc:
        errors.append(
            _bounded_diagnostic(
                "cannot inspect quiescent native child leader: ",
                _exception_summary(exc),
            )
        )
        leader_alive = True
    if leader_alive:
        try:
            process.kill()
        except BaseException as exc:
            errors.append(
                _bounded_diagnostic(
                    "cannot kill quiescent native child leader directly: ",
                    _exception_summary(exc),
                )
            )
        try:
            process.join(NATIVE_CHILD_KILL_REAP_S)
        except BaseException as exc:
            errors.append(
                _bounded_diagnostic(
                    "cannot join killed quiescent native child leader: ",
                    _exception_summary(exc),
                )
            )
    try:
        if process.is_alive():
            errors.append("quiescent native child leader could not be reaped")
    except BaseException as exc:
        errors.append(
            _bounded_diagnostic(
                "cannot confirm quiescent native child leader exit: ",
                _exception_summary(exc),
            )
        )
    return tuple(errors)


def _terminate_and_reap(
    process: multiprocessing.Process,
    *,
    group_leader_pid: int | None,
) -> tuple[str, ...]:
    """Bounded TERM/KILL cleanup; the direct session leader is always joined."""

    errors: list[str] = []
    if group_leader_pid is not None:
        error = _signal_group(group_leader_pid, signal.SIGTERM)
        if error is not None:
            errors.append(_signal_error(signal.SIGTERM, error))
        # Do not poll/join the leader before the final group signal: retaining
        # the unreaped leader prevents its PID/process-group ID being reused.
        time.sleep(NATIVE_CHILD_TERM_GRACE_S)
        error = _signal_group(group_leader_pid, signal.SIGKILL)
        if error is not None:
            message = _signal_error(signal.SIGKILL, error)
            if not (sys.platform == "darwin" and isinstance(error, PermissionError)):
                errors.append(message)
            # Darwin reports EPERM when the group contains only our dead,
            # unreaped leader. Every live descendant of this unprivileged
            # child retains our uid, so a live descendant would make the
            # signal succeed. Resolve that case while the leader still
            # reserves the PGID; never defer a numeric-PGID probe past reap.
    else:
        try:
            process.terminate()
        except (AttributeError, ProcessLookupError, OSError) as exc:
            errors.append(
                _bounded_diagnostic(
                    "cannot terminate native child before session setup: ",
                    _exception_summary(exc),
                )
            )

    try:
        process.join(NATIVE_CHILD_KILL_REAP_S)
    except (AssertionError, OSError, ValueError) as exc:
        errors.append(
            _bounded_diagnostic(
                "cannot join native child leader: ",
                _exception_summary(exc),
            )
        )
    try:
        leader_alive = process.is_alive()
    except (AssertionError, OSError, ValueError) as exc:
        errors.append(
            _bounded_diagnostic(
                "cannot inspect native child leader: ",
                _exception_summary(exc),
            )
        )
        leader_alive = True
    if leader_alive:
        try:
            process.kill()
        except (
            AttributeError,
            ProcessLookupError,
            AssertionError,
            OSError,
            ValueError,
        ) as exc:
            errors.append(
                _bounded_diagnostic(
                    "cannot kill native child leader: ",
                    _exception_summary(exc),
                )
            )
        try:
            process.join(NATIVE_CHILD_KILL_REAP_S)
        except (AssertionError, OSError, ValueError) as exc:
            errors.append(
                _bounded_diagnostic(
                    "cannot join killed native child leader: ",
                    _exception_summary(exc),
                )
            )
    try:
        leader_alive = process.is_alive()
    except (AssertionError, OSError, ValueError) as exc:
        errors.append(
            _bounded_diagnostic(
                "cannot confirm native child leader exit: ",
                _exception_summary(exc),
            )
        )
        leader_alive = True
    if leader_alive:
        errors.append("native child session leader could not be reaped")
    return tuple(errors)


def _exception_summary(exc: BaseException, *, maximum_bytes: int = 1024) -> str:
    label, message = _safe_exception_details(exc)
    if message is None:
        return _truncate_utf8(label, maximum_bytes)
    return _bounded_diagnostic(
        label,
        ": ",
        message,
        maximum_bytes=maximum_bytes,
    )


def _emergency_kill_and_reap(
    process: multiprocessing.Process,
    *,
    group_leader_pid: int | None,
) -> tuple[str, ...]:
    """Independent last-resort SIGKILL + reap after primary cleanup crashes."""

    errors: list[str] = []
    if group_leader_pid is not None:
        try:
            os.killpg(group_leader_pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        except BaseException as exc:
            errors.append(
                _bounded_diagnostic(
                    "emergency process-group SIGKILL failed: ",
                    _exception_summary(exc),
                )
            )
    else:
        try:
            process.kill()
        except ProcessLookupError:
            pass
        except BaseException as exc:
            errors.append(
                _bounded_diagnostic(
                    "emergency native child kill failed: ",
                    _exception_summary(exc),
                )
            )

    try:
        process.join(NATIVE_CHILD_KILL_REAP_S)
    except BaseException as exc:
        errors.append(
            _bounded_diagnostic(
                "emergency native child join failed: ",
                _exception_summary(exc),
            )
        )
    try:
        leader_alive = process.is_alive()
    except BaseException as exc:
        errors.append(
            _bounded_diagnostic(
                "emergency native child liveness check failed: ",
                _exception_summary(exc),
            )
        )
        leader_alive = True
    if leader_alive:
        try:
            process.kill()
        except ProcessLookupError:
            pass
        except BaseException as exc:
            errors.append(
                _bounded_diagnostic(
                    "emergency direct leader SIGKILL failed: ",
                    _exception_summary(exc),
                )
            )
        try:
            process.join(NATIVE_CHILD_KILL_REAP_S)
        except BaseException as exc:
            errors.append(
                _bounded_diagnostic(
                    "emergency killed leader join failed: ",
                    _exception_summary(exc),
                )
            )
    try:
        leader_alive = process.is_alive()
    except BaseException as exc:
        errors.append(
            _bounded_diagnostic(
                "emergency final leader liveness check failed: ",
                _exception_summary(exc),
            )
        )
        leader_alive = True
    if leader_alive:
        errors.append("emergency cleanup could not reap native child leader")

    return tuple(errors)


def _verify_cleanup_complete(
    process: multiprocessing.Process,
    *,
    group_leader_pid: int | None,
) -> tuple[str, ...]:
    """Prove the direct child is gone without addressing a possibly reused PGID.

    All process-group signals happen before the direct leader can be reaped.
    Once cleanup reaches this verifier, the numeric group identifier is no
    longer safe to inspect or signal and is intentionally ignored.
    """

    errors: list[str] = []
    leader_alive: bool | None = None
    try:
        process.join(0)
    except BaseException as exc:
        errors.append(
            _bounded_diagnostic(
                "cannot nonblocking-join native child during cleanup verification: ",
                _exception_summary(exc),
            )
        )
    try:
        leader_alive = process.is_alive()
    except BaseException as exc:
        errors.append(
            _bounded_diagnostic(
                "cannot inspect native child during cleanup verification: ",
                _exception_summary(exc),
            )
        )
    else:
        if leader_alive:
            errors.append(
                "native child leader remains alive after cleanup verification"
            )

    return tuple(errors)


def _normalize_cleanup_errors(errors: Any) -> tuple[str, ...] | None:
    if type(errors) is not tuple:
        return None
    count = tuple.__len__(errors)
    if count > _MAX_CLEANUP_ERRORS:
        return None
    normalized: list[str] = []
    for index in range(count):
        error = tuple.__getitem__(errors, index)
        if type(error) is not str or len(error) == 0:
            return None
        normalized.append(_truncate_utf8(error, _MAX_CLEANUP_ERROR_BYTES))
    return tuple(normalized)


def _cleanup_verification_errors(
    process: multiprocessing.Process,
    *,
    group_leader_pid: int | None,
) -> tuple[str, ...]:
    try:
        errors = _verify_cleanup_complete(
            process,
            group_leader_pid=group_leader_pid,
        )
    except BaseException as exc:
        return (
            _bounded_diagnostic(
                "native child cleanup verification raised ",
                _exception_summary(exc),
            ),
        )
    normalized = _normalize_cleanup_errors(errors)
    if normalized is None:
        return ("native child cleanup verification returned an invalid report",)
    return normalized


def _emergency_cleanup_errors(
    process: multiprocessing.Process,
    *,
    group_leader_pid: int | None,
) -> tuple[str, ...]:
    try:
        errors = _emergency_kill_and_reap(
            process,
            group_leader_pid=group_leader_pid,
        )
    except BaseException as exc:
        return (
            _bounded_diagnostic(
                "emergency native child cleanup raised ",
                _exception_summary(exc),
            ),
        )
    normalized = _normalize_cleanup_errors(errors)
    if normalized is None:
        return ("emergency native child cleanup returned an invalid report",)
    return normalized


def _leader_exit_observed_without_reap(
    process: multiprocessing.Process,
) -> tuple[bool | None, tuple[str, ...]]:
    """Observe the child sentinel without calling waitpid or releasing its PID."""

    try:
        sentinel = process.sentinel
        exited = wait((sentinel,), timeout=0)
    except BaseException as exc:
        return (
            None,
            (
                _bounded_diagnostic(
                    "cannot inspect native child sentinel before emergency cleanup: ",
                    _exception_summary(exc),
                ),
            ),
        )
    return bool(exited), ()


def _bounded_cleanup_report(
    message: str,
    cleanup_errors: tuple[str, ...],
) -> str:
    safe_message = _truncate_utf8(
        (message if type(message) is str else "refine native boundary cleanup failed"),
        NATIVE_CHILD_MAX_ERROR_BYTES,
    )
    normalized = _normalize_cleanup_errors(cleanup_errors)
    if normalized is None:
        normalized = ("native child cleanup returned an invalid uncertainty report",)
    parts: list[str] = [safe_message]
    if normalized:
        parts.append("; cleanup: ")
        for index, error in enumerate(normalized):
            if index:
                parts.append("; ")
            parts.append(error)
    return _bounded_diagnostic(*parts)


def _cleanup_process(
    process: multiprocessing.Process,
    *,
    group_leader_pid: int | None,
) -> tuple[str, ...]:
    """Run cleanup, prove its result, and fail closed on every uncertainty."""

    force_emergency = False
    try:
        errors = _terminate_and_reap(
            process,
            group_leader_pid=group_leader_pid,
        )
    except BaseException as exc:
        primary_errors = (
            _bounded_diagnostic(
                "native child cleanup raised ",
                _exception_summary(exc),
            ),
        )
        force_emergency = True
    else:
        normalized_errors = _normalize_cleanup_errors(errors)
        if normalized_errors is None:
            primary_errors = (
                "native child cleanup returned an invalid uncertainty report",
            )
            force_emergency = True
        else:
            primary_errors = normalized_errors

    # Decide whether a group signal is still identity-safe before any verifier
    # can join/reap the direct leader. If the sentinel is not ready, our live
    # child still owns its PID/PGID and an immediate group SIGKILL is safe. If
    # exit is already observable, primary cleanup may have reaped it; from that
    # point onward emergency cleanup is leader-only and no numeric PGID is ever
    # addressed again.
    exit_observed, observation_errors = _leader_exit_observed_without_reap(process)
    if exit_observed is False:
        observation_errors = (
            *observation_errors,
            "native child leader remains alive after cleanup verification",
        )
    emergency_group_leader_pid = group_leader_pid if exit_observed is False else None
    emergency_errors: tuple[str, ...] = ()
    emergency_attempted = force_emergency or exit_observed is not True
    if emergency_attempted:
        emergency_errors = _emergency_cleanup_errors(
            process,
            group_leader_pid=emergency_group_leader_pid,
        )

    verification_errors = _cleanup_verification_errors(
        process,
        group_leader_pid=None,
    )
    if verification_errors and not emergency_attempted:
        # Verification runs only after all identity-safe group work. A retry may
        # address the direct process object, but never the old numeric PGID.
        emergency_errors = _emergency_cleanup_errors(
            process,
            group_leader_pid=None,
        )
        verification_errors = (
            *verification_errors,
            *_cleanup_verification_errors(
                process,
                group_leader_pid=None,
            ),
        )

    combined = (
        *primary_errors,
        *observation_errors,
        *emergency_errors,
        *verification_errors,
    )
    normalized_combined = _normalize_cleanup_errors(combined)
    if normalized_combined is None:
        return ("native child cleanup produced excessive uncertainty",)
    return normalized_combined


def _cleanup_failed_error(
    message: str,
    cleanup_errors: tuple[str, ...],
) -> AdapterError:
    return AdapterError(
        _bounded_cleanup_report(message, cleanup_errors),
        _CLEANUP_FAILED_CODE,
    )


def _timeout_error(cleanup_errors: tuple[str, ...]) -> AdapterError:
    normalized = _normalize_cleanup_errors(cleanup_errors)
    if normalized is None:
        return _cleanup_failed_error(
            "refine native engine child exceeded the shared deadline",
            ("native child cleanup returned an invalid uncertainty report",),
        )
    if normalized:
        return _cleanup_failed_error(
            "refine native engine child exceeded the shared deadline",
            normalized,
        )
    return AdapterError(
        "refine native engine child exceeded the shared deadline",
        _TIMEOUT_CODE,
    )


def _close_connections_safely(
    connections: tuple[tuple[str, Any], ...],
) -> tuple[str, ...]:
    errors: list[str] = []
    for label, connection in connections:
        try:
            connection.close()
        except BaseException as exc:
            errors.append(
                _bounded_diagnostic(
                    "cannot close ",
                    label,
                    " native child transport: ",
                    _exception_summary(exc),
                )
            )
    return tuple(errors)


def _add_cleanup_note(exc: BaseException, errors: tuple[str, ...]) -> None:
    note = _bounded_cleanup_report(
        "non-masking native boundary cleanup report",
        errors,
    )
    try:
        BaseException.add_note(exc, note)
    except BaseException:
        return


def _send_pinned_files(
    connection: Connection | None,
    transfers: tuple[_PinnedFileTransfer, ...],
    *,
    destination_pid: int,
    deadline: RefineDeadline,
) -> None:
    if not transfers:
        if connection is not None:
            raise AdapterError(
                "native pinned-file transport exists without a ledger",
                _FAILED_CODE,
            )
        return
    if connection is None:
        raise AdapterError(
            "native pinned-file transport is unavailable",
            _FAILED_CODE,
        )
    try:
        from multiprocessing.reduction import send_handle

        for transfer in transfers:
            deadline.remaining_seconds()
            send_handle(connection, transfer.descriptor, destination_pid)
        deadline.remaining_seconds()
    except AdapterError:
        raise
    except OSError as exc:
        raise AdapterError(
            _bounded_diagnostic(
                "cannot transfer native pinned file descriptor: ",
                _exception_summary(exc),
            ),
            _FAILED_CODE,
        ) from exc


def _restore_transfer_offsets_safely(
    transfers: Iterable[_PinnedFileTransfer],
) -> tuple[str, ...]:
    """Restore shared open-file-description offsets before parent fd close."""

    errors: list[str] = []
    for transfer in transfers:
        original_offset = transfer.original_offset
        if original_offset is None:
            continue
        try:
            current_offset = os.lseek(
                transfer.descriptor,
                0,
                os.SEEK_CUR,
            )
        except OSError as exc:
            errors.append(
                _bounded_diagnostic(
                    "cannot inspect native pinned file ",
                    transfer.token,
                    " shared offset during parent cleanup: ",
                    _exception_summary(exc),
                    maximum_bytes=_MAX_CLEANUP_ERROR_BYTES,
                )
            )
            continue
        if current_offset == original_offset:
            continue
        try:
            os.lseek(
                transfer.descriptor,
                original_offset,
                os.SEEK_SET,
            )
        except OSError as exc:
            errors.append(
                _bounded_diagnostic(
                    "cannot restore native pinned file ",
                    transfer.token,
                    " shared offset during parent cleanup: ",
                    _exception_summary(exc),
                    maximum_bytes=_MAX_CLEANUP_ERROR_BYTES,
                )
            )
            continue
        errors.append(
            _bounded_diagnostic(
                "native pinned file ",
                transfer.token,
                " changed its shared offset; parent cleanup restored it",
                maximum_bytes=_MAX_CLEANUP_ERROR_BYTES,
            )
        )
    return tuple(errors)


_WORKSPACE_REQUIRED_DIR_FD_FUNCTIONS = (
    os.open,
    os.mkdir,
    os.stat,
    os.unlink,
    os.rmdir,
    os.rename,
)


def _require_workspace_platform_capabilities() -> None:
    """Refuse a workspace lease unless every removal can stay descriptor-bound."""

    try:
        supported = (
            os.name == "posix"
            and all(
                hasattr(os, constant)
                for constant in ("O_RDONLY", "O_DIRECTORY", "O_NOFOLLOW", "O_CLOEXEC")
            )
            and os.O_DIRECTORY != 0
            and os.O_NOFOLLOW != 0
            and hasattr(os, "supports_dir_fd")
            and all(
                function in os.supports_dir_fd
                for function in _WORKSPACE_REQUIRED_DIR_FD_FUNCTIONS
            )
            and hasattr(os, "supports_fd")
            and os.listdir in os.supports_fd
            and hasattr(os, "supports_follow_symlinks")
            and os.stat in os.supports_follow_symlinks
        )
    except BaseException:  # noqa: BLE001 - platform inspection must fail closed
        supported = False
    if not supported:
        raise AdapterError(
            "native workspace leases require descriptor-relative directory support",
            _FAILED_CODE,
        )


def _workspace_directory_flags() -> int:
    return os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC


def _workspace_provisioning_refusal(exc: OSError) -> tuple[str, str]:
    """Name the condition and pick the code for a raw provisioning ``OSError``.

    An errno this module has NOT reasoned about defaults to
    ``_SCRATCH_UNAVAILABLE_CODE`` -- the RETRYABLE side -- and the diagnostic
    still says the errno was unclassified rather than hiding it.

    An earlier revision of this docstring defended the opposite default, partly
    on the claim that "``_FAILED_CODE`` is also what this arm did before the
    split existed, so an unlisted errno cannot be a regression against the
    pre-split behaviour".  That was traced.  The arm WAS ``_FAILED_CODE`` from
    ``beb34abd`` through ``7539c5e5``; it was NOT at ``f10eee2b``, the immediate
    parent of the commit that introduced the split and the actual diff base,
    where every ``OSError`` on this path already raised
    ``_SCRATCH_UNAVAILABLE_CODE``.  Measured against that baseline through this
    module's own helper, a fatal default moved ESTALE, ETIMEDOUT, EAGAIN, EIO,
    EBUSY and ENETDOWN from retryable to ``REFINE_ENGINE_FAILED``, which
    ``refine_runner``'s ``AdapterError`` handler does not name and therefore
    routes to the FATAL ``ARTIFACT_INVALID``.  So the sentence was right about
    ancient history and wrong about the baseline it was defending.

    What the default rests on now is the asymmetry of the two mistakes, not a
    claim about history.  Retries are BOUNDED: ``complete_agent_task``
    (``supabase/migrations/00297_agent_tasks_queue.sql:414``) fails the task for
    good once ``attempts >= max_attempts``, with 1min then 5min backoff.  A
    permanent condition wrongly called retryable therefore spends an attempt
    budget and then fails anyway; a transient condition wrongly called fatal is
    unrecoverable, with nothing left to re-run.  The default belongs on the
    recoverable side and the fatal side is enumerated instead.

    What this does NOT claim: that every unlisted errno is transient.  ``EBADF``
    would be a defect in this module and no wait repairs it; under this default
    it spends the budget first.  That cost is accepted because it is bounded.
    An ``OSError`` carrying no errno at all lands here too, on the same terms.
    """

    classified = _WORKSPACE_PROVISIONING_CLASSIFICATION.get(exc.errno)
    if classified is None:
        return "unclassified errno", _SCRATCH_UNAVAILABLE_CODE
    return classified


def _final_component_is_a_symlink(path: str) -> bool:
    """Is the FINAL component of ``path`` itself a symlink?

    ``lstat`` answers this WITHOUT resolving the target, which is why it can run
    before the open: a root symlinked at a mount that is not up yet is still a
    symlinked root, and this module refuses one either way.

    Positive-only by construction.  Every ``OSError`` the lookup can raise --
    its own ENOENT, ENOTDIR, ELOOP, ENAMETOOLONG -- is swallowed to ``False``,
    so this call can only ever ADD a refusal.  It introduces no errno path of
    its own and it authorises nothing.
    """

    try:
        return stat.S_ISLNK(os.lstat(path).st_mode)
    except OSError:
        return False


def _canonical_form_differs(path: str) -> bool:
    """Does ``path`` resolve to something other than itself?

    The same question :func:`provision_native_workspace_lease` asks after its
    open, asked before it.  Non-strict ``realpath`` resolves what it can and
    normalises the rest, so an INTERMEDIATE symlink is visible here even when
    its target does not exist -- the shape :func:`_final_component_is_a_symlink`
    cannot see, because ``lstat`` follows intermediate components and then
    simply fails.

    Positive-only on the same terms, and for the same reason.
    """

    try:
        return os.path.realpath(path) != path
    except OSError:
        return False


def _refuse_a_symlinked_workspace_container(parent_directory: str) -> None:
    """Settle the symlink question BEFORE any ``os.open``, not from its errno.

    A symlinked scratch root is fatal in this module however the mount is
    doing: the canonical-form check after the open refuses it, and so does the
    consumer of the transported lease path.  What used to decide WHEN it was
    fatal was the errno the open happened to produce, and that made one operator
    mistake answer two ways.  MEASURED, in the gate container and on host ext4,
    for a root symlinked at a mount that is not up yet:

    * the FINAL component is the symlink -- ``os.open`` gives ENOTDIR, not ELOOP
      (``O_NOFOLLOW`` stops on the link and ``O_DIRECTORY`` then sees a
      non-directory), and that reached a fatal refusal;
    * an INTERMEDIATE component is the symlink -- ``os.open`` follows it, the
      absent target gives ENOENT, and ENOENT is on the retryable side of the
      errno table precisely to protect a root whose mount is not up.

    Same mistake, same operator fix, two verdicts, and the retryable one is the
    wrong terminal answer: once the mount IS up both shapes are refused fatally
    anyway, so the disagreement was only ever about when.

    Neither disjunct below subsumes the other, also measured: a self-looping
    symlink used AS the root has ``S_ISLNK`` true while non-strict ``realpath``
    returns it unchanged, and an intermediate symlink over an absent target has
    ``S_ISLNK`` unanswerable while ``realpath`` sees it.

    Nor do the two together see EVERY symlink shape, and that is stated rather
    than papered over.  A self-looping INTERMEDIATE component defeats both --
    measured, ``lstat`` fails ELOOP and non-strict ``realpath`` returns the path
    unchanged -- so it is settled at the open instead, by the ELOOP arm in
    :func:`provision_native_workspace_lease`, to the same fatal refusal.  What
    holds across the two mechanisms is that no symlink shape reaches the errno
    table; what this function adds is that the shapes an operator actually
    builds are decided without the errno being consulted at all.

    This is a PRE-EMPTION and not a guarantee.  Both probes are by name, and a
    root replaced between them and the open is not prevented here -- that would
    need a descriptor, and there is nothing to pin one to before the open.  What
    holds in that race is that the checks AFTER the open still refuse, fatally:
    the canonical-form check, which is bound to the pinned descriptor's
    ``(st_dev, st_ino)``, and the open arm's own ENOTDIR refusal.  Both are
    exercised for exactly that race by
    ``test_the_post_open_checks_still_refuse_a_symlink_the_pre_check_missed``.
    """

    if _final_component_is_a_symlink(parent_directory) or _canonical_form_differs(
        parent_directory
    ):
        raise AdapterError(
            "native workspace parent directory must not traverse a symlink",
            _INVALID_INPUT_CODE,
        )


def _workspace_entry_pin_flags() -> int:
    """Reference an entry itself: no symlink traversal, no read, no blocking."""

    if NATIVE_WORKSPACE_ENTRY_PIN_IS_UNIVERSAL:
        return os.O_PATH | os.O_NOFOLLOW | os.O_CLOEXEC
    # No ``O_PATH`` here (macOS).  ``O_NONBLOCK`` keeps a FIFO open from waiting
    # on a peer and ``O_NOFOLLOW`` keeps the reference on the named entry, but
    # this still cannot reference a unix socket or a mode-0 file.
    return os.O_RDONLY | os.O_NONBLOCK | os.O_NOFOLLOW | os.O_CLOEXEC


def _pin_leased_entry(
    directory_descriptor: int,
    name: str,
) -> tuple[int | None, OSError | None]:
    """Hold one entry's inode open so its inode number cannot be recycled.

    A held descriptor keeps the inode referenced, so the filesystem cannot free
    — and therefore cannot re-issue — its inode number while cleanup runs.  That
    is the whole reason the later ``(st_dev, st_ino)`` comparison means anything
    on Linux; see :func:`_purge_leased_entry`.
    """

    try:
        return (
            os.open(
                name,
                _workspace_entry_pin_flags(),
                dir_fd=directory_descriptor,
            ),
            None,
        )
    except FileNotFoundError as exc:
        return None, exc
    except OSError as exc:
        if NATIVE_WORKSPACE_ENTRY_PIN_IS_UNIVERSAL:
            return None, exc
        failure: OSError = exc
    symlink_flag = getattr(os, "O_SYMLINK", None)
    if type(symlink_flag) is int:
        # The macOS spelling for "reference the symlink, not its target".
        try:
            return (
                os.open(
                    name,
                    symlink_flag | os.O_RDONLY | os.O_CLOEXEC,
                    dir_fd=directory_descriptor,
                ),
                None,
            )
        except OSError as exc:
            failure = exc
    return None, failure


def _workspace_scratch_name(prefix: str) -> str:
    return prefix + secrets.token_hex(16)


def _close_workspace_descriptors(
    descriptors: tuple[tuple[str, int | None], ...],
) -> tuple[str, ...]:
    return _close_descriptors_safely(
        (label, descriptor)
        for label, descriptor in descriptors
        if type(descriptor) is int
    )


def provision_native_workspace_lease(
    parent_directory: str,
    *,
    deadline: RefineDeadline,
) -> NativeWorkspaceLease:
    """Create one private 0700 workspace and pin it plus its container by fd.

    ``parent_directory`` must be **canonical**: equal to its own ``realpath``.
    That is not cosmetic.  The leased root's path is transported to the child as
    the ``cwd=``/``TMPDIR`` exec surface, and the consumer of those surfaces
    (the pinned COLMAP command supervisor) refuses any directory for which
    ``resolve(strict=True) != path``.  ``O_NOFOLLOW`` guards only the final
    component, so a symlinked *intermediate* component used to be followed
    silently and produced a lease whose transported path the supervisor then
    rejected outright -- a contract this module's own accessor claimed to
    satisfy.  Requiring the canonical form closes that disagreement at the one
    boundary an operator can act on, and additionally rejects ``.``/``..``
    segments and trailing slashes, so the transported string is unambiguous.
    That requirement is asked twice: once BEFORE the open, where it settles the
    symlink question without depending on whether the mount behind a link is up
    (:func:`_refuse_a_symlinked_workspace_container`), and once after, bound to
    the pinned descriptor.

    ``parent_directory`` must also be **short enough**.  The leased root is the
    prefix of every COLMAP path option, and the command layer caps each argv item
    at :data:`NATIVE_WORKSPACE_MAX_ARGV_ITEM_BYTES`, so a container in the
    former gap between the two bounds provisioned cleanly and then made every
    command unplannable.  A container that cannot host a usable command is now
    refused up front, naming the actual and maximum byte counts.

    Residual, unchanged: the canonical check binds the string to the pinned
    descriptor at this instant.  Replacing an intermediate component afterwards
    is still not prevented here -- it requires write access to the operator's
    own container path, which remains trusted deployment configuration rather
    than child-controlled input.
    """

    _require_workspace_platform_capabilities()
    deadline.remaining_seconds()
    if type(parent_directory) is not str or not parent_directory:
        raise AdapterError(
            "native workspace parent directory must be a non-empty path",
            _INVALID_INPUT_CODE,
        )
    if not os.path.isabs(parent_directory):
        # The leased path is transported to the child as an exec surface, and a
        # relative one would mean something different in the child's cwd.
        raise AdapterError(
            "native workspace parent directory must be an absolute path",
            _INVALID_INPUT_CODE,
        )
    # Refuse a container that cannot host a usable command BEFORE anything is
    # created.  The lease root's length is fully determined here -- container
    # plus "/" plus a fixed-width scratch name -- so an unusable lease is an
    # operator configuration error, and it is reported as one, with the numbers
    # to act on.  Without this the lease provisioned fine and the failure
    # surfaced much later as "pinned COLMAP argv item exceeds its byte ceiling",
    # which names neither the lease nor the scratch root that caused it.
    lease_bytes = len(os.fsencode(parent_directory)) + 1 + NATIVE_WORKSPACE_NAME_BYTES
    if lease_bytes > NATIVE_WORKSPACE_MAX_PATH_BYTES:
        raise AdapterError(
            f"native workspace lease path would be {lease_bytes} bytes, over the "
            f"{NATIVE_WORKSPACE_MAX_PATH_BYTES}-byte maximum that leaves room for a "
            f"COLMAP path option; shorten the configured scratch root by at least "
            f"{lease_bytes - NATIVE_WORKSPACE_MAX_PATH_BYTES} bytes",
            _INVALID_INPUT_CODE,
        )
    # Settle the symlink question before anything is opened, so the two
    # component shapes of ONE operator mistake cannot answer differently
    # depending on whether the mount behind the link happens to be up.  The
    # shapes this cannot see by name are caught by the open's own arm below, so
    # between the two no symlink shape reaches the errno table at the bottom.
    _refuse_a_symlinked_workspace_container(parent_directory)
    flags = _workspace_directory_flags()
    parent_descriptor: int | None = None
    workspace_descriptor: int | None = None
    name: str | None = None
    created_subdirectories: list[str] = []
    try:
        try:
            parent_descriptor = os.open(parent_directory, flags)
        except OSError as open_exc:
            # ``O_DIRECTORY`` and ``O_NOFOLLOW`` PRE-EMPT two of the structural
            # checks below, so their errnos are translated back into those
            # checks' own refusals.  ENOTDIR on a regular file or a FIFO is the
            # ``S_ISDIR`` check arriving early, and gets that check's own
            # wording.
            #
            # The symlink disjunct is now the RACE RESIDUAL, not the primary
            # answer: ``_refuse_a_symlinked_workspace_container`` above settles
            # every symlink shape before this open runs, so reaching here with a
            # symlinked final component means the root was replaced between that
            # by-name probe and this open.  The verdict is deliberately the same
            # one the pre-open gate gives, so the race cannot change the answer
            # -- only which line reports it.
            if open_exc.errno == errno.ELOOP or (
                open_exc.errno == errno.ENOTDIR
                and _final_component_is_a_symlink(parent_directory)
            ):
                raise AdapterError(
                    "native workspace parent directory must not traverse a symlink",
                    _INVALID_INPUT_CODE,
                ) from open_exc
            if open_exc.errno == errno.ENOTDIR:
                raise AdapterError(
                    "native workspace parent directory must be an owned directory",
                    _INVALID_INPUT_CODE,
                ) from open_exc
            raise
        os.set_inheritable(parent_descriptor, False)
        parent_metadata = os.fstat(parent_descriptor)
        parent_mode = stat.S_IMODE(parent_metadata.st_mode)
        # The leased path is joined onto this string and transported as the
        # child's cwd/TMPDIR.  If any component is a symlink the transported
        # path fails the consumer's `resolve(strict=True) == path` check, so
        # refuse the container rather than mint a lease nobody can use.
        #
        # This repeats the pre-open gate's second probe ON PURPOSE, and it is
        # not dead: the pre-open probe is by name, this one runs against the
        # descriptor actually pinned and is followed immediately by the
        # ``(st_dev, st_ino)`` binding below.  A root swapped for a symlinked
        # path after the pre-open probe is caught here and nowhere else.
        canonical_parent = os.path.realpath(parent_directory)
        if canonical_parent != parent_directory:
            raise AdapterError(
                "native workspace parent directory must not traverse a symlink",
                _INVALID_INPUT_CODE,
            )
        # Bind that string to the descriptor actually pinned above, so the
        # canonical form is proven to name this leased container and not a
        # same-named directory elsewhere.
        canonical_metadata = os.stat(canonical_parent)
        if (canonical_metadata.st_dev, canonical_metadata.st_ino) != (
            parent_metadata.st_dev,
            parent_metadata.st_ino,
        ):
            raise AdapterError(
                "native workspace parent directory changed identity while opening",
                _INVALID_INPUT_CODE,
            )
        if (
            not stat.S_ISDIR(parent_metadata.st_mode)
            or parent_metadata.st_uid != os.geteuid()
        ):
            raise AdapterError(
                "native workspace parent directory must be an owned directory",
                _INVALID_INPUT_CODE,
            )
        if (
            parent_mode & (stat.S_IWGRP | stat.S_IWOTH)
            and not parent_mode & stat.S_ISVTX
        ):
            # A non-sticky group/world-writable container lets a foreign account
            # rename the leased workspace out from under its pinned descriptor.
            raise AdapterError(
                "native workspace parent directory is unsafely writable",
                _INVALID_INPUT_CODE,
            )
        for _attempt in range(NATIVE_WORKSPACE_NAME_ATTEMPTS):
            deadline.remaining_seconds()
            candidate = _workspace_scratch_name(NATIVE_WORKSPACE_NAME_PREFIX)
            try:
                os.mkdir(candidate, mode=0o700, dir_fd=parent_descriptor)
            except FileExistsError:
                continue
            name = candidate
            break
        if name is None:
            # OPERATIONAL, same shape as the freeze vault's: a name-collision
            # run in the operator's container, not a defect in this task.
            raise AdapterError(
                "cannot create a unique native workspace lease",
                _SCRATCH_UNAVAILABLE_CODE,
            )
        workspace_descriptor = os.open(name, flags, dir_fd=parent_descriptor)
        os.set_inheritable(workspace_descriptor, False)
        metadata = os.fstat(workspace_descriptor)
        named_metadata = os.stat(
            name,
            dir_fd=parent_descriptor,
            follow_symlinks=False,
        )
        if (
            not stat.S_ISDIR(metadata.st_mode)
            or metadata.st_uid != os.geteuid()
            or stat.S_IMODE(metadata.st_mode) != 0o700
            or (metadata.st_dev, metadata.st_ino)
            != (named_metadata.st_dev, named_metadata.st_ino)
            or metadata.st_dev != parent_metadata.st_dev
            or os.listdir(workspace_descriptor)
        ):
            raise AdapterError(
                "native workspace lease is not a fresh private directory",
                _FAILED_CODE,
            )
        path = os.path.join(parent_directory, name)
        if len(os.fsencode(path)) > NATIVE_WORKSPACE_MAX_PATH_BYTES:
            # Unreachable while `_workspace_scratch_name` yields exactly
            # NATIVE_WORKSPACE_NAME_BYTES, which the container check above
            # already budgeted for.  Retained so a change to the name generator
            # fails closed here rather than in argv validation.
            raise AdapterError(
                "native workspace lease path exceeds its bounded length",
                _INVALID_INPUT_CODE,
            )
        for subdirectory in NATIVE_WORKSPACE_SUBDIRECTORIES:
            os.mkdir(subdirectory, mode=0o700, dir_fd=workspace_descriptor)
            created_subdirectories.append(subdirectory)
    except BaseException as exc:
        cleanup_errors: list[str] = []
        for subdirectory in reversed(created_subdirectories):
            if workspace_descriptor is None:  # pragma: no cover - defensive
                break
            try:
                os.rmdir(subdirectory, dir_fd=workspace_descriptor)
            except OSError as cleanup_exc:
                cleanup_errors.append(
                    _bounded_diagnostic(
                        "cannot remove a failed native workspace subdirectory: ",
                        _exception_summary(cleanup_exc),
                        maximum_bytes=_MAX_CLEANUP_ERROR_BYTES,
                    )
                )
        if name is not None and parent_descriptor is not None:
            if cleanup_errors:
                # A subdirectory survived, so the root rmdir cannot succeed;
                # name what is being left behind instead of guessing at it.
                cleanup_errors.append(
                    _bounded_diagnostic(
                        "failed native workspace lease retained (",
                        name,
                        " retained)",
                        maximum_bytes=_MAX_CLEANUP_ERROR_BYTES,
                    )
                )
            else:
                try:
                    os.rmdir(name, dir_fd=parent_descriptor)
                except OSError as cleanup_exc:
                    cleanup_errors.append(
                        _bounded_diagnostic(
                            "cannot remove a failed native workspace lease (",
                            name,
                            " retained): ",
                            _exception_summary(cleanup_exc),
                            maximum_bytes=_MAX_CLEANUP_ERROR_BYTES,
                        )
                    )
        cleanup_errors.extend(
            _close_workspace_descriptors(
                (
                    ("failed workspace lease", workspace_descriptor),
                    ("failed workspace lease container", parent_descriptor),
                )
            )
        )
        if cleanup_errors:
            raise _cleanup_failed_error(
                "native workspace lease provisioning failed",
                tuple(cleanup_errors),
            ) from exc
        if type(exc) is AdapterError:
            raise
        if isinstance(exc, OSError):
            # Every structural refusal on this path has already raised its own
            # typed ``AdapterError`` above and is re-raised unchanged; what
            # reaches here is a raw ``OSError`` from the operator's scratch root
            # or from creating our own directories inside it.  Which of those it
            # is decides retryability, and the ERRNO is what says so -- the
            # exception TYPE does not, which is how a symlinked, non-directory
            # or unenterable root came to be treated as a shortage.  The
            # condition is named in the line as well as classified, because
            # ``_exception_summary`` degrades to "external exception" for every
            # ``OSError`` subclass outside ``_SAFE_EXCEPTION_LABELS``.
            condition, code = _workspace_provisioning_refusal(exc)
            raise AdapterError(
                _bounded_diagnostic(
                    "cannot provision a private native workspace lease (",
                    condition,
                    "): ",
                    _exception_summary(exc),
                ),
                code,
            ) from exc
        raise
    return NativeWorkspaceLease(
        parent_descriptor,
        name,
        workspace_descriptor,
        (metadata.st_dev, metadata.st_ino),
        path,
    )


def _purge_leased_entry(
    directory_descriptor: int,
    name: str,
    *,
    root_device: int,
    depth: int,
    budget: list[int],
    errors: list[str],
) -> None:
    """Remove one entry, refusing any object whose identity changed.

    ``(st_dev, st_ino)`` is not by itself an identity on Linux: a just-freed
    inode number comes straight back to the next creator, so an attacker who
    unlinks and recreates an entry inside the inspect/rename window presents a
    *different* object carrying the *same* number.  Measured on this
    repository's own gate container -- whose ``/tmp`` reports ``overlayfs``, not
    ext4, so the mechanism is NOT the ext4 allocator an earlier revision of this
    paragraph named -- unlink+recreate recycled the inode number 20/20 times,
    against 0/20 on macOS/APFS.  Which hosts recycle has not been isolated and
    is not claimed; that one this code runs on does is enough.  The entry is
    therefore first pinned by descriptor: a held reference keeps the inode from
    being freed, so its number cannot be re-issued while cleanup runs, and only
    then does equality actually mean sameness.  The pin also removes the older
    inspect/rename gap, because
    the recorded identity comes from ``fstat`` on that descriptor rather than
    from a second lookup of the name.

    The entry is then renamed to an unguessable quarantine name inside the same
    pinned directory and removed only if the quarantined name still resolves to
    the pinned identity.

    What this does **not** buy: the final ``unlinkat``/``rmdir`` is still
    name-based, so a same-UID actor that can ``readdir`` this directory may swap
    the quarantine name after that check.  For non-directory entries that
    residual swap is caught after the fact — the pinned inode's link count must
    strictly drop — unless the attacker also removes the pinned object; for
    directories it is not caught at all.  What holds unconditionally is blast
    radius: every mutation is a single-component ``renameat``/``unlinkat``/
    ``rmdir`` relative to a pinned descriptor, which cannot follow a symlink and
    cannot traverse out of this directory.

    Without ``O_PATH`` (macOS) a unix socket or a mode-0 file cannot be pinned
    side-effect-free; those degrade to the unpinned name stat, which is only as
    strong as the filesystem's inode-reuse policy.  On Linux — the qualified
    production platform — a failed pin is anomalous and refuses the removal.
    """

    if type(name) is not str or name in (".", "..") or "/" in name or not name:
        errors.append("leased native workspace entry name is not a safe component")
        return
    pin, pin_failure = _pin_leased_entry(directory_descriptor, name)
    try:
        if pin is not None:
            try:
                before = os.fstat(pin)
            except OSError as exc:
                errors.append(
                    _bounded_diagnostic(
                        "cannot inspect a pinned leased native workspace entry: ",
                        _exception_summary(exc),
                        maximum_bytes=_MAX_CLEANUP_ERROR_BYTES,
                    )
                )
                return
        else:
            if type(pin_failure) is FileNotFoundError:
                return
            if NATIVE_WORKSPACE_ENTRY_PIN_IS_UNIVERSAL:
                errors.append(
                    _bounded_diagnostic(
                        "cannot pin a leased native workspace entry: ",
                        _exception_summary(pin_failure),
                        maximum_bytes=_MAX_CLEANUP_ERROR_BYTES,
                    )
                )
                return
            try:
                before = os.stat(
                    name,
                    dir_fd=directory_descriptor,
                    follow_symlinks=False,
                )
            except FileNotFoundError:
                return
            except OSError as exc:
                errors.append(
                    _bounded_diagnostic(
                        "cannot inspect a leased native workspace entry: ",
                        _exception_summary(exc),
                        maximum_bytes=_MAX_CLEANUP_ERROR_BYTES,
                    )
                )
                return
        identity = (before.st_dev, before.st_ino)
        entry_type = stat.S_IFMT(before.st_mode)
        if before.st_dev != root_device:
            errors.append("leased native workspace entry crosses a filesystem boundary")
            return
        quarantine = _workspace_scratch_name(NATIVE_WORKSPACE_QUARANTINE_PREFIX)
        try:
            os.rename(
                name,
                quarantine,
                src_dir_fd=directory_descriptor,
                dst_dir_fd=directory_descriptor,
            )
        except FileNotFoundError:
            return
        except OSError as exc:
            errors.append(
                _bounded_diagnostic(
                    "cannot quarantine a leased native workspace entry: ",
                    _exception_summary(exc),
                    maximum_bytes=_MAX_CLEANUP_ERROR_BYTES,
                )
            )
            return
        try:
            quarantined = os.stat(
                quarantine,
                dir_fd=directory_descriptor,
                follow_symlinks=False,
            )
        except OSError as exc:
            errors.append(
                _bounded_diagnostic(
                    "cannot inspect a quarantined native workspace entry: ",
                    _exception_summary(exc),
                    maximum_bytes=_MAX_CLEANUP_ERROR_BYTES,
                )
            )
            return
        if (quarantined.st_dev, quarantined.st_ino) != identity or stat.S_IFMT(
            quarantined.st_mode
        ) != entry_type:
            errors.append(
                "leased native workspace entry identity changed before removal"
            )
            return
        if stat.S_ISDIR(quarantined.st_mode):
            child_descriptor: int | None = None
            try:
                child_descriptor = os.open(
                    quarantine,
                    _workspace_directory_flags(),
                    dir_fd=directory_descriptor,
                )
                child_metadata = os.fstat(child_descriptor)
                if (child_metadata.st_dev, child_metadata.st_ino) != identity:
                    errors.append(
                        "leased native workspace directory identity changed "
                        "before removal"
                    )
                    return
                _purge_leased_directory(
                    child_descriptor,
                    root_device=root_device,
                    depth=depth + 1,
                    budget=budget,
                    errors=errors,
                )
            except OSError as exc:
                errors.append(
                    _bounded_diagnostic(
                        "cannot open a quarantined native workspace directory: ",
                        _exception_summary(exc),
                        maximum_bytes=_MAX_CLEANUP_ERROR_BYTES,
                    )
                )
                return
            finally:
                if child_descriptor is not None:
                    errors.extend(
                        _close_workspace_descriptors(
                            (
                                (
                                    "quarantined native workspace directory",
                                    child_descriptor,
                                ),
                            )
                        )
                    )
            try:
                os.rmdir(quarantine, dir_fd=directory_descriptor)
            except FileNotFoundError:
                return
            except OSError as exc:
                errors.append(
                    _bounded_diagnostic(
                        "cannot remove a quarantined native workspace directory: ",
                        _exception_summary(exc),
                        maximum_bytes=_MAX_CLEANUP_ERROR_BYTES,
                    )
                )
            # A directory's link count is not a portable removal witness: after
            # ``rmdir`` Linux reports 0 while macOS still reports 2.  The
            # post-quarantine swap window therefore stays undetected here.
            return
        try:
            os.unlink(quarantine, dir_fd=directory_descriptor)
        except FileNotFoundError:
            return
        except OSError as exc:
            errors.append(
                _bounded_diagnostic(
                    "cannot remove a quarantined native workspace entry: ",
                    _exception_summary(exc),
                    maximum_bytes=_MAX_CLEANUP_ERROR_BYTES,
                )
            )
            return
        if pin is None:
            return
        # Post-hoc, not preventive: the removal targeted a name, so prove the
        # pinned object actually lost a link.  This catches a swap of the
        # quarantine name itself, which the identity check above cannot, but
        # stays silent if the attacker also removed the pinned object.
        try:
            after = os.fstat(pin)
        except OSError as exc:
            errors.append(
                _bounded_diagnostic(
                    "cannot confirm removal of a pinned native workspace entry: ",
                    _exception_summary(exc),
                    maximum_bytes=_MAX_CLEANUP_ERROR_BYTES,
                )
            )
            return
        if after.st_nlink >= before.st_nlink:
            errors.append("leased native workspace entry survived its own removal")
    finally:
        if pin is not None:
            errors.extend(
                _close_workspace_descriptors(
                    (("pinned native workspace entry", pin),)
                )
            )


def _purge_leased_directory(
    directory_descriptor: int,
    *,
    root_device: int,
    depth: int,
    budget: list[int],
    errors: list[str],
) -> None:
    """Empty one pinned directory within a fixed depth and entry budget."""

    if depth > NATIVE_WORKSPACE_MAX_DEPTH:
        errors.append("leased native workspace exceeds its bounded cleanup depth")
        return
    try:
        names = os.listdir(directory_descriptor)
    except OSError as exc:
        errors.append(
            _bounded_diagnostic(
                "cannot enumerate a leased native workspace directory: ",
                _exception_summary(exc),
                maximum_bytes=_MAX_CLEANUP_ERROR_BYTES,
            )
        )
        return
    if len(names) > NATIVE_WORKSPACE_MAX_DIRECTORY_ENTRIES:
        errors.append(
            "leased native workspace directory exceeds its bounded entry count"
        )
        return
    for name in names:
        if budget[0] <= 0:
            errors.append("leased native workspace cleanup exhausted its entry budget")
            return
        budget[0] -= 1
        _purge_leased_entry(
            directory_descriptor,
            name,
            root_device=root_device,
            depth=depth,
            budget=budget,
            errors=errors,
        )


def _restore_quarantined_workspace_root(
    lease: NativeWorkspaceLease,
    quarantine: str,
) -> str:
    """Put the provisioned name back so a stranded root stays findable."""

    try:
        os.rename(
            quarantine,
            lease.name,
            src_dir_fd=lease.parent_descriptor,
            dst_dir_fd=lease.parent_descriptor,
        )
    except OSError:
        return quarantine
    return lease.name


def _remove_leased_workspace_root(lease: NativeWorkspaceLease) -> tuple[str, ...]:
    """Quarantine and remove the workspace itself relative to its pinned parent.

    The lease descriptor holds the root inode open for the whole of cleanup, so
    the root's ``(st_dev, st_ino)`` is already recycle-proof here for the reason
    :func:`_purge_leased_entry` has to construct a pin to obtain.

    Emptiness is probed through that descriptor *before* the quarantine rename.
    An entry created after :func:`_purge_leased_directory` took its snapshot
    used to arrive here with no purge error at all, so the root was renamed and
    only then failed ``rmdir`` with ENOTEMPTY — leaving a live orphan under an
    unguessable name that appeared in no returned error.  Every failure path
    below therefore names the directory it left behind.
    """

    try:
        residue = os.listdir(lease.descriptor)
    except OSError as exc:
        return (
            _bounded_diagnostic(
                "cannot re-enumerate the leased native workspace root before "
                "removal: ",
                _exception_summary(exc),
                maximum_bytes=_MAX_CLEANUP_ERROR_BYTES,
            ),
        )
    if residue:
        return (
            _bounded_diagnostic(
                "leased native workspace root gained an entry after its purge (",
                lease.name,
                " retains ",
                _truncate_utf8(sorted(residue)[0], 96),
                ")",
                maximum_bytes=_MAX_CLEANUP_ERROR_BYTES,
            ),
        )
    try:
        named = os.stat(
            lease.name,
            dir_fd=lease.parent_descriptor,
            follow_symlinks=False,
        )
    except FileNotFoundError:
        return ("leased native workspace root disappeared before cleanup",)
    except OSError as exc:
        return (
            _bounded_diagnostic(
                "cannot inspect the leased native workspace root: ",
                _exception_summary(exc),
                maximum_bytes=_MAX_CLEANUP_ERROR_BYTES,
            ),
        )
    if (named.st_dev, named.st_ino) != lease.identity:
        return ("leased native workspace root name no longer resolves to the lease",)
    quarantine = _workspace_scratch_name(NATIVE_WORKSPACE_QUARANTINE_PREFIX)
    try:
        os.rename(
            lease.name,
            quarantine,
            src_dir_fd=lease.parent_descriptor,
            dst_dir_fd=lease.parent_descriptor,
        )
    except OSError as exc:
        return (
            _bounded_diagnostic(
                "cannot quarantine the leased native workspace root: ",
                _exception_summary(exc),
                maximum_bytes=_MAX_CLEANUP_ERROR_BYTES,
            ),
        )
    try:
        moved = os.stat(
            quarantine,
            dir_fd=lease.parent_descriptor,
            follow_symlinks=False,
        )
    except OSError as exc:
        return (
            _bounded_diagnostic(
                "cannot inspect the quarantined native workspace root (",
                quarantine,
                " retained): ",
                _exception_summary(exc),
                maximum_bytes=_MAX_CLEANUP_ERROR_BYTES,
            ),
        )
    if (moved.st_dev, moved.st_ino) != lease.identity:
        # Something else now answers to the provisioned name, so the object
        # under the quarantine name is not ours to move back.
        return (
            _bounded_diagnostic(
                "leased native workspace root identity changed before removal (",
                quarantine,
                " retained)",
                maximum_bytes=_MAX_CLEANUP_ERROR_BYTES,
            ),
        )
    try:
        os.rmdir(quarantine, dir_fd=lease.parent_descriptor)
    except OSError as exc:
        orphan = _restore_quarantined_workspace_root(lease, quarantine)
        return (
            _bounded_diagnostic(
                "cannot remove the leased native workspace root (",
                orphan,
                " retained): ",
                _exception_summary(exc),
                maximum_bytes=_MAX_CLEANUP_ERROR_BYTES,
            ),
        )
    return ()


def _release_workspace_lease(
    lease: NativeWorkspaceLease,
    *,
    leader_quiescent: bool,
) -> tuple[str, ...]:
    """Purge and remove the leased workspace, then close both pinned descriptors.

    This runs after every child outcome — normal return, timeout, SIGTERM, and
    SIGKILL — because the parent, not the child, owns the directory.  Work is
    bounded by depth and entry budget rather than the shared deadline so an
    exhausted deadline can never strand scratch.

    Known and deliberately unaddressed here (items 2/5 inherit both):

    * The bound is on *count and depth, not time*.  Every syscall below runs
      inside a ``finally`` and none of them is preemptible, so a stalled FUSE or
      network filesystem under the lease container makes the stage never
      complete — the queue lease then expires with a live orphan.  The workspace
      container must be a local filesystem.
    * A non-quiescent leader is reported but does not stop the purge, so a
      still-live child could race the entries being removed.  Refusing instead
      would trade a race for a guaranteed orphan, which is why it stands.
    """

    errors: list[str] = []
    if leader_quiescent is not True:
        errors.append(
            "leased native workspace cleanup ran without a proven-dead native child"
        )
    root_metadata: os.stat_result | None = None
    try:
        root_metadata = os.fstat(lease.descriptor)
    except OSError as exc:
        # Both of these branches leave the tree in place.  Name it, exactly as
        # the incomplete-purge branch below does: a retained directory is only
        # forensics if the caller learns which one it is, and neither branch
        # used to say.
        errors.append(
            _bounded_diagnostic(
                "cannot inspect the leased native workspace before cleanup (",
                lease.name,
                " retained): ",
                _exception_summary(exc),
                maximum_bytes=_MAX_CLEANUP_ERROR_BYTES,
            )
        )
    if root_metadata is not None:
        if (root_metadata.st_dev, root_metadata.st_ino) != lease.identity:
            errors.append(
                _bounded_diagnostic(
                    "leased native workspace identity changed before cleanup (",
                    lease.name,
                    " retained)",
                    maximum_bytes=_MAX_CLEANUP_ERROR_BYTES,
                )
            )
        else:
            purge_errors: list[str] = []
            _purge_leased_directory(
                lease.descriptor,
                root_device=root_metadata.st_dev,
                depth=0,
                budget=[NATIVE_WORKSPACE_MAX_TOTAL_ENTRIES],
                errors=purge_errors,
            )
            errors.extend(purge_errors)
            if purge_errors:
                # An incomplete purge must not rename or remove the root: the
                # retained directory keeps its provisioned name for forensics.
                # That name is only forensics if it reaches the caller, so it
                # is carried in the error rather than left to a prefix scan.
                errors.append(
                    _bounded_diagnostic(
                        "leased native workspace root retained after an "
                        "incomplete purge (",
                        lease.name,
                        " retained)",
                        maximum_bytes=_MAX_CLEANUP_ERROR_BYTES,
                    )
                )
            else:
                errors.extend(_remove_leased_workspace_root(lease))
    errors.extend(
        _close_workspace_descriptors(
            (
                ("native workspace lease", lease.descriptor),
                ("native workspace lease container", lease.parent_descriptor),
            )
        )
    )
    normalized = _normalize_cleanup_errors(tuple(errors))
    if normalized is None:
        # Collapsing an over-long report must not also lose the one string an
        # operator needs to find what was left behind.
        return (
            _bounded_diagnostic(
                "leased native workspace cleanup produced excessive uncertainty (",
                lease.name,
                " may be retained)",
                maximum_bytes=_MAX_CLEANUP_ERROR_BYTES,
            ),
        )
    return normalized


def _send_workspace_lease(
    connection: Connection | None,
    lease: NativeWorkspaceLease | None,
    *,
    destination_pid: int,
    deadline: RefineDeadline,
) -> None:
    if lease is None:
        if connection is not None:
            raise AdapterError(
                "native workspace lease transport exists without a lease",
                _FAILED_CODE,
            )
        return
    if connection is None:
        raise AdapterError(
            "native workspace lease transport is unavailable",
            _FAILED_CODE,
        )
    try:
        from multiprocessing.reduction import send_handle

        deadline.remaining_seconds()
        # Known and deliberately unaddressed here (items 2/5 inherit it): on
        # macOS CPython's sendfds waits on an untimed sock.recv(1)
        # acknowledgement, so this call is not preemptible by the deadline
        # bracketing it.  Linux — the qualified platform — does not acknowledge.
        # This is the pre-existing I94 pinned-file transport pattern.
        send_handle(connection, lease.descriptor, destination_pid)
        deadline.remaining_seconds()
    except AdapterError:
        raise
    except OSError as exc:
        raise AdapterError(
            _bounded_diagnostic(
                "cannot transfer the native workspace lease descriptor: ",
                _exception_summary(exc),
            ),
            _FAILED_CODE,
        ) from exc


def _verify_leased_workspace_subdirectory(
    root_descriptor: int,
    root_path: str,
    name: str,
) -> str:
    """Bind one subdirectory's transported path to its own descriptor."""

    descriptor = os.open(
        name,
        _workspace_directory_flags(),
        dir_fd=root_descriptor,
    )
    try:
        metadata = os.fstat(descriptor)
        path = os.path.join(root_path, name)
        named = os.stat(path, follow_symlinks=False)
        if (
            not stat.S_ISDIR(metadata.st_mode)
            or metadata.st_uid != os.geteuid()
            or stat.S_IMODE(metadata.st_mode) != 0o700
            or (metadata.st_dev, metadata.st_ino)
            != (named.st_dev, named.st_ino)
        ):
            raise AdapterError(
                "native child workspace subdirectory does not match its lease",
                _INVALID_INPUT_CODE,
            )
        if os.listdir(descriptor):
            raise AdapterError(
                "native child workspace subdirectory is not empty at receipt",
                _INVALID_INPUT_CODE,
            )
    finally:
        close_errors = _close_descriptors_safely(
            (("workspace lease subdirectory", descriptor),)
        )
        if close_errors:
            raise AdapterError(
                _bounded_cleanup_report(
                    "native child workspace subdirectory receipt failed",
                    close_errors,
                ),
                _CLEANUP_FAILED_CODE,
            )
    return path


def _receive_workspace_lease(
    connection: Connection | None,
    *,
    leased: bool,
    path: str | None,
    context: NativeChildContext,
) -> tuple[int, str, Mapping[str, str]] | None:
    """Receive and independently verify the parent's writable workspace root.

    The descriptor is authoritative.  ``path`` is the exec surface item 3 needs
    for ``cwd=``/``TMPDIR``, and it is accepted only after ``lstat`` on the
    string and ``fstat`` on the descriptor agree on ``(st_dev, st_ino)``, so a
    substituted or symlinked path cannot be used even though it arrives as text.
    """

    if leased is not True:
        if connection is not None:
            raise _ChildTransportError(
                "native child received an unexpected workspace lease transport"
            )
        if path is not None:
            raise _ChildTransportError(
                "native child received a workspace path without a lease"
            )
        return None
    if connection is None:
        raise _ChildTransportError(
            "native child workspace lease transport is unavailable"
        )
    if (
        type(path) is not str
        or not path
        or not os.path.isabs(path)
        or len(os.fsencode(path)) > NATIVE_WORKSPACE_MAX_PATH_BYTES
    ):
        raise _ChildTransportError(
            "native child workspace lease path is not a bounded absolute path"
        )
    from multiprocessing.reduction import recv_handle

    if not connection.poll(context.remaining_seconds()):
        raise AdapterError(
            "native workspace lease transfer exceeded the shared deadline",
            _TIMEOUT_CODE,
        )
    descriptor = recv_handle(connection)
    try:
        os.set_inheritable(descriptor, False)
        metadata = os.fstat(descriptor)
        named = os.stat(path, follow_symlinks=False)
        if (
            not stat.S_ISDIR(metadata.st_mode)
            or metadata.st_uid != os.geteuid()
            or stat.S_IMODE(metadata.st_mode) != 0o700
        ):
            raise AdapterError(
                "native child workspace lease is not a private owned directory",
                _INVALID_INPUT_CODE,
            )
        if (metadata.st_dev, metadata.st_ino) != (named.st_dev, named.st_ino):
            raise AdapterError(
                "native child workspace lease path does not resolve to its lease",
                _INVALID_INPUT_CODE,
            )
        if sorted(os.listdir(descriptor)) != sorted(NATIVE_WORKSPACE_SUBDIRECTORIES):
            raise AdapterError(
                "native child workspace lease does not hold its exact "
                "subdirectory set at receipt",
                _INVALID_INPUT_CODE,
            )
        subdirectory_paths = MappingProxyType(
            {
                name: _verify_leased_workspace_subdirectory(descriptor, path, name)
                for name in NATIVE_WORKSPACE_SUBDIRECTORIES
            }
        )
    except BaseException as exc:
        close_errors = _close_descriptors_safely((("workspace lease", descriptor),))
        if close_errors:
            raise AdapterError(
                _bounded_cleanup_report(
                    "native child workspace lease receipt failed",
                    close_errors,
                ),
                _CLEANUP_FAILED_CODE,
            ) from exc
        raise
    return descriptor, path, subdirectory_paths


def _validated_group_leader_pid(
    ready: Mapping[str, Any],
    *,
    process_pid: Any,
    transfer_count: int,
    workspace_lease: NativeWorkspaceLease | None,
    output_tokens: tuple[str, ...],
) -> int:
    """Authenticate the child's self-report and return its process-group leader.

    The ``pid > 0`` clause is what makes every downstream use of the return value
    safe at once.  A zero would be accepted by ``killpg`` as "my own process
    group", and the very first thing that addresses this number is an unguarded
    ``os.killpg(..., SIGSTOP)`` on the success path -- i.e. the worker freezing
    itself.  The child cannot report zero today (it sends ``os.getpid()``), so
    this is a fail-closed guard on an invariant, not a live defect.
    """

    reported_pinned_count = ready.get("pinnedFileCount")
    reported_output_tokens = ready.get("outputTokens")
    if (
        type(process_pid) is not int
        or process_pid <= 0
        or ready.get("pid") != process_pid
        or ready.get("processGroupId") != process_pid
        or ready.get("sessionId") != process_pid
        or (bool(transfer_count) and reported_pinned_count != transfer_count)
        or (not transfer_count and reported_pinned_count not in (None, 0))
        or ready.get("workspaceLeased") is not (workspace_lease is not None)
        or ready.get("workspacePath")
        != (None if workspace_lease is None else workspace_lease.path)
        or (bool(output_tokens) and reported_output_tokens != list(output_tokens))
        or (not output_tokens and reported_output_tokens not in (None, []))
    ):
        raise AdapterError(
            "refine native child did not establish its dedicated POSIX session",
            _FAILED_CODE,
        )
    return process_pid


def run_native_engine_child(
    entrypoint: str,
    request: Mapping[str, Any],
    *,
    deadline: RefineDeadline,
    pinned_files: Mapping[str, NativePinnedFile] | None = None,
    workspace_parent_directory: str | None = None,
    outputs: NativeEngineOutputs | None = None,
) -> Any:
    """Run one importable JSON engine operation in a killable child session.

    ``entrypoint`` is an import path, never a bound PyCOLMAP object.  Explicit
    ``spawn`` avoids inheriting a possibly initialized native/CUDA runtime.  A
    terminal result is not returned until the child leader exits and the shared
    deadline is checked again, so callers cannot enter publication after a
    timed-out native operation.

    ``workspace_parent_directory`` opts into one parent-provisioned 0700 scratch
    workspace.  The parent creates and pins it before the child exists, leases a
    descriptor down over SCM_RIGHTS, and removes it with bounded
    descriptor-relative cleanup after every outcome, so a SIGKILLed child cannot
    strand scratch.

    ``outputs`` opts into the seven-descriptor engine output handoff and requires
    a workspace lease.  The caller owns the sink and must close it; on success it
    holds one descriptor per requested token, each one a read-only handle on a
    never-named private copy this call took of the engine's output and hashed
    itself.  Those descriptors are unaffected by the lease purge, carry no name
    anywhere in the filesystem, were never transported or inherited, and cannot
    be taken out of this process's table by any same-UID actor -- neither through
    ``/proc/<pid>/fd`` nor through ``pidfd_getfd``, both of which the seal below
    refuses at their shared ``ptrace_may_access`` gate.  "Unreachable from any
    process" is therefore a claim about same-UID actors WITHOUT
    ``CAP_SYS_PTRACE`` and about nothing else; see
    ``NATIVE_ENGINE_OUTPUT_BYTES_FROZEN_AGAINST_SURVIVING_DESCRIPTORS`` for the
    exact scope and its residual.  This function closes the sink itself on
    every path that raises, INCLUDING a cleanup failure discovered after the
    return value was computed, so an exception never leaves a populated sink
    behind.

    Because that copy is made with ``O_TMPFILE``, ``outputs`` is **Linux only**
    and fails closed elsewhere rather than degrading to a named temporary.

    TWO SIDE EFFECTS OF ``outputs`` A CALLER MUST KNOW ABOUT.  First, the first
    receipt drops this process's ``dumpable`` flag permanently
    (:func:`_seal_process_against_procfs_descriptor_theft`), which is what closes
    both descriptor-theft routes and which **makes the worker undebuggable from
    that point on**: no core dump, and -- because the same flag gates
    ``ptrace_may_access`` -- no ``gdb -p``, no ``py-spy``, no
    ``/proc/<pid>/mem``, for anyone without ``CAP_SYS_PTRACE``.  That function's
    docstring lists what an operator can still do instead.  Second, minting the
    copies needs the whole output payload free on the workspace filesystem in
    addition to the lease -- 8 GiB at the aggregate ceiling; a filesystem that
    cannot supply it fails with ``REFINE_ENGINE_NO_SPACE``, which
    ``refine_runner`` classifies as RETRYABLE (``RefineFailureCode
    .ENGINE_NO_SPACE``): the operator frees disk and the same task runs again.

    What ``outputs`` does NOT give the caller is a verified alignment.  See
    ``NATIVE_ENGINE_OUTPUT_ALIGNMENT_VERIFIED_BY_PARENT``.
    """

    if os.name != "posix" or not hasattr(os, "killpg"):
        raise AdapterError(
            "refine native engine isolation requires POSIX process groups",
            _FAILED_CODE,
        )
    if type(entrypoint) is not str or _ENTRYPOINT_PATTERN.fullmatch(entrypoint) is None:
        raise AdapterError(
            "native child entry point must be module.path:function_name",
            _FAILED_CODE,
        )
    output_tokens: tuple[str, ...] = ()
    if outputs is not None:
        if type(outputs) is not NativeEngineOutputs:
            raise AdapterError(
                "native engine outputs must be an exact NativeEngineOutputs sink",
                _INVALID_INPUT_CODE,
            )
        if outputs.is_closed or outputs.is_populated:
            raise AdapterError(
                "native engine output sink must be unused",
                _INVALID_INPUT_CODE,
            )
        if workspace_parent_directory is None:
            # Deliberately worded differently from the child's equivalent refusal
            # so a test can prove the PARENT refused before anything was spawned.
            raise AdapterError(
                "native engine outputs require a workspace_parent_directory",
                _INVALID_INPUT_CODE,
            )
        # Fail before anything is spawned or provisioned.  A platform that
        # cannot mint a never-named file cannot honour this channel's contract,
        # and discovering that after the engine has run would mean either
        # throwing away real work or quietly weakening what the caller is told.
        _require_output_freeze_capabilities()
        output_tokens = outputs.tokens
    request_payload = _bounded_request(request)
    try:
        deadline.remaining_seconds()
    except AdapterError as exc:
        raise AdapterError(
            _safe_exception_message(
                exc,
                fallback="refine native boundary deadline failed",
            ),
            _safe_adapter_error_code(exc),
        ) from exc
    except Exception as exc:
        raise AdapterError(
            _bounded_diagnostic(
                "cannot inspect refine native boundary deadline: ",
                _exception_summary(exc),
            ),
            _FAILED_CODE,
        ) from exc
    except BaseException as exc:
        if type(exc) is KeyboardInterrupt or type(exc) is SystemExit:
            raise
        raise AdapterError(
            "cannot inspect refine native boundary deadline: external exception",
            _FAILED_CODE,
        ) from exc

    transfers = _prepare_pinned_files(pinned_files, deadline=deadline)
    workspace_lease: NativeWorkspaceLease | None = None
    if workspace_parent_directory is not None:
        try:
            workspace_lease = provision_native_workspace_lease(
                workspace_parent_directory,
                deadline=deadline,
            )
        except BaseException as exc:
            descriptor_errors = _close_descriptors_safely(
                (transfer.token, transfer.descriptor) for transfer in transfers
            )
            if descriptor_errors:
                raise _cleanup_failed_error(
                    "cannot provision the refine native workspace lease",
                    descriptor_errors,
                ) from exc
            raise
    parent_pinned_connection: Connection | None = None
    child_pinned_connection: Connection | None = None
    parent_workspace_connection: Connection | None = None
    child_workspace_connection: Connection | None = None
    parent_output_connection: Connection | None = None
    child_output_connection: Connection | None = None

    def _optional_transports() -> tuple[tuple[str, Any], ...]:
        return (
            *(
                (
                    ("parent pinned-file", parent_pinned_connection),
                    ("child pinned-file", child_pinned_connection),
                )
                if parent_pinned_connection is not None
                and child_pinned_connection is not None
                else ()
            ),
            *(
                (
                    ("parent workspace lease", parent_workspace_connection),
                    ("child workspace lease", child_workspace_connection),
                )
                if parent_workspace_connection is not None
                and child_workspace_connection is not None
                else ()
            ),
            *(
                (
                    ("parent engine output", parent_output_connection),
                    ("child engine output", child_output_connection),
                )
                if parent_output_connection is not None
                and child_output_connection is not None
                else ()
            ),
        )

    def _release_outputs_for_failure() -> tuple[str, ...]:
        nonlocal adopted_outputs
        if outputs is None:
            return ()
        # If ``_adopt`` refused the receipt, the sink never took ownership and
        # closing it would close nothing.  The descriptors are still open here.
        orphaned = () if outputs.is_populated else adopted_outputs
        # Clearing is what makes the SECOND call site safe.  This runs twice on
        # one path -- once because the run failed, once because cleanup must
        # raise -- and ``_release_workspace_lease`` allocates descriptors in
        # between.  Without this the second pass would close the same fd NUMBERS
        # again, which by then belong to whatever the lease release opened, and
        # report a "Bad file descriptor" per token for damage it caused itself.
        # ``outputs.close`` is already idempotent; this makes the orphan branch
        # idempotent too.
        adopted_outputs = ()
        return (
            *outputs.close(),
            *_close_descriptors_safely(
                (output.token, output.descriptor) for output in orphaned
            ),
        )

    def _release_lease_for_setup_failure() -> tuple[str, ...]:
        if workspace_lease is None:
            return ()
        return _release_workspace_lease(workspace_lease, leader_quiescent=True)

    try:
        context = multiprocessing.get_context("spawn")
        parent_connection, child_connection = context.Pipe(duplex=True)
        if transfers:
            parent_pinned_connection, child_pinned_connection = context.Pipe(
                duplex=True
            )
        if workspace_lease is not None:
            parent_workspace_connection, child_workspace_connection = context.Pipe(
                duplex=True
            )
        if output_tokens:
            parent_output_connection, child_output_connection = context.Pipe(
                duplex=True
            )
    except BaseException as exc:
        connection_errors: tuple[str, ...] = ()
        if "parent_connection" in locals() and "child_connection" in locals():
            connection_errors = _close_connections_safely(
                (
                    ("parent", parent_connection),
                    ("child", child_connection),
                    *_optional_transports(),
                ),
            )
        descriptor_errors = _close_descriptors_safely(
            (transfer.token, transfer.descriptor) for transfer in transfers
        )
        workspace_errors = _release_lease_for_setup_failure()
        cleanup_errors = (*connection_errors, *descriptor_errors, *workspace_errors)
        message = _bounded_diagnostic(
            "cannot create refine native child transport: ",
            _safe_exception_message(
                exc,
                fallback="transport setup failed",
            ),
        )
        if cleanup_errors:
            raise _cleanup_failed_error(message, cleanup_errors) from exc
        raise AdapterError(message, _FAILED_CODE) from exc
    pinned_ledger = tuple(
        (transfer.token, transfer.sha256, transfer.size_bytes) for transfer in transfers
    )
    try:
        process = context.Process(
            target=_child_entry,
            args=(
                child_connection,
                child_pinned_connection,
                pinned_ledger,
                child_workspace_connection,
                workspace_lease is not None,
                None if workspace_lease is None else workspace_lease.path,
                child_output_connection,
                output_tokens,
                entrypoint,
                request_payload,
                deadline.expires_at_monotonic_s,
            ),
            name="patina-refine-native",
            daemon=False,
        )
    except BaseException as exc:
        close_errors = _close_connections_safely(
            (
                ("parent", parent_connection),
                ("child", child_connection),
                *_optional_transports(),
            )
        )
        descriptor_errors = _close_descriptors_safely(
            (transfer.token, transfer.descriptor) for transfer in transfers
        )
        workspace_errors = _release_lease_for_setup_failure()
        message = _bounded_diagnostic(
            "cannot prepare refine native child: ",
            _safe_exception_message(
                exc,
                fallback="process construction failed",
            ),
        )
        cleanup_errors = (*close_errors, *descriptor_errors, *workspace_errors)
        if cleanup_errors:
            raise _cleanup_failed_error(message, cleanup_errors) from exc
        raise AdapterError(message, _FAILED_CODE) from exc
    started = False
    group_leader_pid: int | None = None
    reaped = False
    cleanup_handled = False
    adopted_outputs: tuple[NativeEngineOutput, ...] = ()
    # Boundary-owned, never the caller's: closed in the ``finally`` below on
    # every path, after the post-purge check that is their only purpose.
    source_witnesses: tuple[_OutputSourceWitness, ...] = ()
    # Explicit, not ``sys.exc_info()``: this function can legitimately be called
    # from inside an ``except`` block, where the ambient exception would make a
    # successful run look like a failing one and close the caller's descriptors.
    returned_successfully = False
    try:
        try:
            # Pipe/process construction can consume the entire absolute budget.
            # This final no-side-effect gate must remain adjacent to start().
            deadline.remaining_seconds()
            process.start()
        except OSError as exc:
            # LEFT FATAL, re-examined and decided rather than inherited.  A fork
            # or pipe refused for EAGAIN/ENOMEM/EMFILE really is a host shortage
            # and would classify cleanly against
            # ``_WORKSPACE_PROVISIONING_CLASSIFICATION`` -- but that table was
            # derived from, and is pinned against, ONE syscall surface: opening
            # and creating directories under the operator's scratch root.  Its
            # fatal side (ELOOP, ENOTDIR, EROFS) says nothing at all about
            # ``fork``, so reusing it here would be transplanting a proof
            # instead of making one.  Nothing on this branch can construct a
            # real fork-or-pipe shortage to pin the reclassification with, and
            # the standard the lease arm was held to was "construct the
            # condition for real".  A reclassification that cannot be
            # constructed is one that cannot be claimed, so this keeps the
            # pre-existing fatal behaviour until a real one can be built.
            raise AdapterError(
                _bounded_diagnostic(
                    "cannot start refine native child: ",
                    _safe_exception_message(
                        exc,
                        fallback="process start failed",
                    ),
                ),
                _FAILED_CODE,
            ) from exc
        started = True
        try:
            child_connection.close()
            if child_pinned_connection is not None:
                child_pinned_connection.close()
            if child_workspace_connection is not None:
                child_workspace_connection.close()
            if child_output_connection is not None:
                child_output_connection.close()
        except OSError as exc:
            raise AdapterError(
                _bounded_diagnostic(
                    "cannot close parent copy of native child transport: ",
                    _safe_exception_message(
                        exc,
                        fallback="transport close failed",
                    ),
                ),
                _FAILED_CODE,
            ) from exc

        ready = _receive_envelope(parent_connection, process, deadline)
        if ready.get("kind") != "ready":
            raw_message = ready.get("message")
            message = (
                _truncate_utf8(raw_message, NATIVE_CHILD_MAX_ERROR_BYTES)
                if type(raw_message) is str
                else "child failed before session setup"
            )
            raise AdapterError(
                message,
                _validated_error_code(ready.get("code")),
            )
        pid = _validated_group_leader_pid(
            ready,
            process_pid=process.pid,
            transfer_count=len(transfers),
            workspace_lease=workspace_lease,
            output_tokens=output_tokens,
        )
        group_leader_pid = pid
        try:
            parent_connection.send_bytes(_ACK_READY)
        except OSError as exc:
            raise AdapterError(
                _bounded_diagnostic(
                    "cannot acknowledge refine native child readiness: ",
                    _safe_exception_message(
                        exc,
                        fallback="readiness acknowledgement failed",
                    ),
                ),
                _FAILED_CODE,
            ) from exc
        _send_pinned_files(
            parent_pinned_connection,
            transfers,
            destination_pid=pid,
            deadline=deadline,
        )
        _send_workspace_lease(
            parent_workspace_connection,
            workspace_lease,
            destination_pid=pid,
            deadline=deadline,
        )

        terminal = _receive_envelope(parent_connection, process, deadline)
        kind = terminal.get("kind")
        if kind == "error":
            raw_message = terminal.get("message")
            message = (
                _truncate_utf8(raw_message, NATIVE_CHILD_MAX_ERROR_BYTES)
                if type(raw_message) is str
                else "native child failed"
            )
            raise AdapterError(
                message,
                _validated_error_code(terminal.get("code")),
            )
        if kind != "result" or "value" not in terminal:
            raise AdapterError(
                "refine native child returned an invalid terminal response",
                _FAILED_CODE,
            )
        if not output_tokens and terminal.get("outputLedger") not in (None, []):
            raise AdapterError(
                "refine native child declared engine outputs that were not requested",
                _FAILED_CODE,
            )
        if outputs is not None:
            receipt = _receive_native_outputs(
                parent_output_connection,
                _validated_output_ledger(
                    terminal.get("outputLedger"),
                    output_tokens,
                ),
                workspace_lease=workspace_lease,
                deadline=deadline,
            )
            adopted_outputs = receipt.outputs
            source_witnesses = receipt.witnesses
            outputs._adopt(adopted_outputs)

        try:
            parent_connection.send_bytes(_ACK_ACCEPT)
        except OSError as exc:
            raise AdapterError(
                _bounded_diagnostic(
                    "cannot acknowledge refine native child result: ",
                    _safe_exception_message(
                        exc,
                        fallback="result acknowledgement failed",
                    ),
                ),
                _FAILED_CODE,
            ) from exc
        try:
            exited = wait(
                (process.sentinel,),
                timeout=deadline.remaining_seconds(),
            )
        except OSError as exc:
            raise AdapterError(
                _bounded_diagnostic(
                    "cannot wait for refine native child leader exit: ",
                    _safe_exception_message(
                        exc,
                        fallback="leader exit wait failed",
                    ),
                ),
                _FAILED_CODE,
            ) from exc
        if not exited:
            raise _ChildBoundaryTimeout
        success_group_errors = _success_group_quiescence_errors(
            group_leader_pid=group_leader_pid,
            deadline=deadline,
        )
        if success_group_errors:
            descendant_cleanup_errors = _cleanup_process(
                process,
                group_leader_pid=group_leader_pid,
            )
            # Cleanup held the unreaped leader through its final group signal.
            # Never address this PGID again after cleanup may have released it.
            cleanup_handled = True
            reaped = True
            raise _cleanup_failed_error(
                "refine native child returned before its process group was quiescent",
                (*success_group_errors, *descendant_cleanup_errors),
            )

        try:
            process.join(deadline.remaining_seconds())
        except OSError as exc:
            message = _bounded_diagnostic(
                "cannot join refine native child leader: ",
                _safe_exception_message(
                    exc,
                    fallback="leader join failed",
                ),
            )
            direct_reap_errors = _reap_proven_quiescent_leader(process)
            # The group was proven empty before the first join. Retrying only
            # the direct leader cannot hit a recycled PGID.
            cleanup_handled = True
            reaped = True
            if direct_reap_errors:
                raise _cleanup_failed_error(
                    message,
                    direct_reap_errors,
                ) from exc
            raise AdapterError(message, _FAILED_CODE) from exc
        # The frozen group was proven empty while this unreaped leader still
        # reserved its PID. From here onward no code may signal/probe that PGID.
        reaped = True
        try:
            leader_alive = process.is_alive()
        except (AssertionError, OSError, ValueError) as exc:
            raise AdapterError(
                _bounded_diagnostic(
                    "cannot inspect refine native child leader after join: ",
                    _safe_exception_message(
                        exc,
                        fallback="leader inspection failed",
                    ),
                ),
                _FAILED_CODE,
            ) from exc
        if leader_alive:
            raise _ChildBoundaryTimeout
        exitcode = process.exitcode
        if type(exitcode) is not int or exitcode != 0:
            detail = (
                int.__str__(exitcode) if type(exitcode) is int else "unknown status"
            )
            raise AdapterError(
                _bounded_diagnostic(
                    "refine native child exited unsuccessfully (",
                    detail,
                    ")",
                ),
                _FAILED_CODE,
            )
        deadline.remaining_seconds()
        returned_successfully = True
        return terminal["value"]
    except _ChildBoundaryTimeout as exc:
        cleanup_errors = ()
        if started and not reaped:
            cleanup_errors = _cleanup_process(
                process,
                group_leader_pid=group_leader_pid,
            )
            cleanup_handled = True
        raise _timeout_error(cleanup_errors) from exc
    except AdapterError as exc:
        safe_message = _safe_exception_message(
            exc,
            fallback="refine native boundary failed",
        )
        cleanup_errors = ()
        if started and not reaped:
            cleanup_errors = _cleanup_process(
                process,
                group_leader_pid=group_leader_pid,
            )
            cleanup_handled = True
        if cleanup_errors:
            raise _cleanup_failed_error(
                safe_message,
                cleanup_errors,
            ) from exc
        raise AdapterError(
            safe_message,
            _safe_adapter_error_code(exc),
        ) from exc
    except Exception as exc:
        cleanup_errors = ()
        if started and not reaped:
            cleanup_errors = _cleanup_process(
                process,
                group_leader_pid=group_leader_pid,
            )
            cleanup_handled = True
        detail = _bounded_diagnostic(
            "unexpected refine native boundary failure: ",
            _exception_summary(exc),
        )
        if cleanup_errors:
            raise _cleanup_failed_error(detail, cleanup_errors) from exc
        raise AdapterError(detail, _FAILED_CODE) from exc
    except BaseException as exc:
        cleanup_errors = ()
        if started and not reaped:
            cleanup_errors = _cleanup_process(
                process,
                group_leader_pid=group_leader_pid,
            )
            cleanup_handled = True
        if cleanup_errors:
            raise _cleanup_failed_error(
                "unexpected refine native boundary failure",
                cleanup_errors,
            ) from exc
        if type(exc) is KeyboardInterrupt or type(exc) is SystemExit:
            raise
        raise AdapterError(
            _bounded_diagnostic(
                "unexpected refine native boundary failure: ",
                _exception_summary(exc),
            ),
            _FAILED_CODE,
        ) from exc
    finally:
        active_exception = sys.exc_info()[1]
        final_cleanup_errors: tuple[str, ...] = ()
        if started and not reaped and not cleanup_handled:
            final_cleanup_errors = _cleanup_process(
                process,
                group_leader_pid=group_leader_pid,
            )
        resource_errors = list(
            _close_connections_safely(
                (
                    ("parent", parent_connection),
                    ("child", child_connection),
                    *_optional_transports(),
                )
            )
        )
        offset_restore_errors = _restore_transfer_offsets_safely(transfers)
        resource_errors.extend(
            _close_descriptors_safely(
                (transfer.token, transfer.descriptor) for transfer in transfers
            )
        )
        leader_quiescent = not started
        if started:
            try:
                leader_alive = process.is_alive()
            except BaseException as exc:
                resource_errors.append(
                    _bounded_diagnostic(
                        "cannot inspect native child leader during final resource "
                        "cleanup: ",
                        _exception_summary(exc),
                    )
                )
                leader_alive = True
            if not leader_alive:
                leader_quiescent = True
                try:
                    process.close()
                except BaseException as exc:
                    resource_errors.append(
                        _bounded_diagnostic(
                            "cannot close native child process handle: ",
                            _exception_summary(exc),
                        )
                    )

        # A failing run never hands descriptors back.  The sink is caller-owned,
        # but leaving it populated after a raise would make the caller responsible
        # for cleaning up a run it was told had failed.
        output_cleanup_errors: tuple[str, ...] = ()
        if not returned_successfully:
            output_cleanup_errors = _release_outputs_for_failure()

        # The workspace is parent-owned, so it is removed after every outcome:
        # normal return, timeout, SIGTERM, and SIGKILL all arrive here with the
        # leader already reaped by the cleanup above.  This purge has nothing to
        # do with the descriptors the caller receives: those are private copies
        # in a vault that was created and removed inside the receipt call, and
        # they were already un-reopenable by path before this line ran.  What the
        # purge removes is the last name the LEASE-SIDE objects had, which is the
        # only reason the witness check below can tell an escaped hardlink from
        # an honest run.
        workspace_cleanup_errors: tuple[str, ...] = ()
        if workspace_lease is not None:
            workspace_cleanup_errors = _release_workspace_lease(
                workspace_lease,
                leader_quiescent=leader_quiescent,
            )

        # ONLY here, with every parent-owned name gone, is a child that
        # hardlinked an engine artifact out of the lease distinguishable from an
        # honest one.  The caller's bytes are already frozen by construction, so
        # this is no longer what makes the handoff safe -- it is a refusal of a
        # child that wrote outside the boundary it was given, plus an assertion
        # that the sink really holds the private copies.
        unfrozen_output_errors: tuple[str, ...] = ()
        if returned_successfully:
            unfrozen_output_errors = _unfrozen_output_errors(
                adopted_outputs,
                source_witnesses,
            )
        # The witnesses have now done their whole job.  They are boundary-owned
        # on every path, including the ones that never reached the check above.
        witness_cleanup_errors = _close_descriptors_safely(
            (witness.token, witness.descriptor) for witness in source_witnesses
        )
        source_witnesses = ()

        cleanup_must_raise = bool(
            final_cleanup_errors
            or offset_restore_errors
            or output_cleanup_errors
            or workspace_cleanup_errors
            or witness_cleanup_errors
            or unfrozen_output_errors
        )
        if cleanup_must_raise:
            # The caller is about to receive an exception instead of the sink,
            # so the sink is this function's to close -- even though the return
            # value was already computed.  ``close`` is idempotent, so the
            # already-failed path above cannot be double-charged here.
            output_cleanup_errors = (
                *output_cleanup_errors,
                *_release_outputs_for_failure(),
            )

        all_final_errors = (
            *final_cleanup_errors,
            *offset_restore_errors,
            *unfrozen_output_errors,
            *witness_cleanup_errors,
            *output_cleanup_errors,
            *workspace_cleanup_errors,
            *resource_errors,
        )
        if unfrozen_output_errors:
            raise AdapterError(
                _bounded_cleanup_report(
                    "native engine outputs were not frozen by the workspace purge",
                    all_final_errors,
                ),
                _INVALID_INPUT_CODE,
            ) from active_exception
        if cleanup_must_raise:
            raise _cleanup_failed_error(
                "refine native child cleanup failed",
                all_final_errors,
            ) from active_exception
        if resource_errors:
            if active_exception is not None:
                _add_cleanup_note(active_exception, tuple(resource_errors))
            else:
                raise _cleanup_failed_error(
                    "refine native boundary resource cleanup failed",
                    tuple(resource_errors),
                )
