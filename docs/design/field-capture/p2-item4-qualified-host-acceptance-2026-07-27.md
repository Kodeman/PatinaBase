# Field Capture P2 Item 4 — DeskDev qualified-host acceptance

Date: 2026-07-27

Qualification host: `DeskDev`

Code commit measured: `77b4ff19cd00ae9848338b34afb0e18abc676bb8`
(branch `field-capture/refine-i97-final`)

Scope: the four item-4 acceptance clauses named in the ordered next-work packet
— Linux child-subreaper behaviour, adopted-child reaping and quiescence,
escaped-`setsid` descendant handling, cleanup precedence — plus the gate, the
kernel-thread parser, the `PR_SET_DUMPABLE` seal, the descriptor-theft routes,
and the `O_TMPFILE` freeze. No COLMAP, no CUDA, no GPU, no scan, no queue, no
Strata, no Storage.

## Verdict

**All nine measured criteria reproduced on the qualified host**, with one result
recorded as a measured blind spot rather than a pass (criterion 4, below) and
one sub-clause recorded as in-repo coverage rather than a host measurement
(criterion 5's drain branch, below).

The handoff document previously recorded item 4 as `◐ EVIDENCE PRODUCED` because
its other acceptance clauses had no repo receipt. This document is that receipt.
It does **not** close item 4 as a program gate — see the boundary section.

## Provenance of the code that was measured

The measured tree is `services/scan-pipeline` at git tree
`afc42fc16a99e29497f04d712b09cf5e01805f62`, transported to the host as a
`git archive` tar and re-hashed on arrival:

```console
$ git -C <worktree> rev-parse HEAD
77b4ff19cd00ae9848338b34afb0e18abc676bb8
$ git -C <worktree> rev-parse HEAD:services/scan-pipeline
afc42fc16a99e29497f04d712b09cf5e01805f62
$ git -C <worktree> archive --format=tar HEAD services/scan-pipeline > sp.tar
$ shasum -a 256 sp.tar          # macOS side
b3be4b700e95051a4b4279d154ecce0f805acb77d9094e0a2d8f016360d8bbe3
$ sha256sum /home/kody/sp.tar   # DeskDev side
b3be4b700e95051a4b4279d154ecce0f805acb77d9094e0a2d8f016360d8bbe3
```

Nothing installed under `/opt/patina` was executed, modified, or read for
behaviour. The measurements ran from the unpacked tree under `~/q4`, against a
private venv (`pytest 9.1.1`, `httpx 0.28.1`, `numpy 2.5.1`) created for this
run and destroyed with it.

Two static facts of that tree, read directly:

- `src/patina_scan_worker/config.py:46` → `DEFAULT_STAGES = "ingest,solve,drawings"`.
- No module-level `*QUALIFIED*` flag is `True`
  (`grep -rhE "QUALIFIED[A-Za-z_]* = True" src/patina_scan_worker/*.py | wc -l` → `0`),
  and `NATIVE_ENGINE_OUTPUT_ALIGNMENT_VERIFIED_BY_PARENT = False`.

## Host identity

```console
$ hostname
DeskDev
$ id
uid=1000(kody) gid=1000(kody) groups=1000(kody),4(adm),24(cdrom),27(sudo),30(dip),46(plugdev),100(users),114(lpadmin),983(ollama),984(docker)
$ uname -a
Linux DeskDev 7.0.0-28-generic #28~24.04.1-Ubuntu SMP PREEMPT_DYNAMIC Wed Jul  1 15:50:57 UTC 2 x86_64 x86_64 x86_64 GNU/Linux
$ head -3 /etc/os-release
PRETTY_NAME="Ubuntu 24.04.3 LTS"
NAME="Ubuntu"
VERSION_ID="24.04"
$ df -hT /
Filesystem     Type  Size  Used Avail Use% Mounted on
/dev/nvme0n1p6 ext4  140G  111G   23G  84% /
$ cat /proc/sys/kernel/yama/ptrace_scope
1
$ umask
0002
$ python3 -VV
Python 3.12.3 (main, Jun 19 2026, 12:46:00) [GCC 13.3.0]
```

`/` is a single ext4 filesystem on `/dev/nvme0n1p6`; there is no separate `/tmp`
or `/home`. `TMPDIR` was pinned to `/home/kody/q4/t` (15 bytes) for every pytest
run so `/tmp/pytest-of-kody` was neither written to nor removed. At that length
`_container_of_length` (`tests/test_refine_workspace_seam.py:1368`) did not
misfire; a longer prefix has produced a setup-artifact failure there before.

## Worker posture — untouched

`patina-scan-worker` is the owner's live P1 production worker. It was read with
`systemctl show` only. No unit was started, stopped, reloaded, or edited.

Before any measurement:

```console
$ systemctl show patina-scan-worker -p ActiveState -p SubState -p ExecMainPID \
    -p ExecMainStartTimestamp -p ExecMainStartTimestampMonotonic -p NRestarts
NRestarts=0
ExecMainStartTimestamp=Mon 2026-07-27 05:41:53 CDT
ExecMainStartTimestampMonotonic=15443079
ExecMainPID=5126
ActiveState=active
SubState=running
```

After every measurement and after cleanup: byte-identical (`ActiveState=active`,
`SubState=running`, `ExecMainPID=5126`,
`ExecMainStartTimestamp=Mon 2026-07-27 05:41:53 CDT`,
`ExecMainStartTimestampMonotonic=15443079`, `NRestarts=0`).

The worker's `STAGES` value lives in `/etc/patina/scan-worker.env`, which uid
1000 cannot read (`Permission denied`). This receipt therefore does **not**
restate the running worker's stage list; it records only that the unit's
identity and start timestamp are unchanged.

`/opt` was left alone: `/opt/patina` mtime `2026-07-22 12:16:10`,
`/opt/patina/scan-pipeline` mtime `2026-07-23 19:12:33`, `/opt/colmap` mtime
`2026-07-19 06:30:49`, all as found.

## 1 — The gate

```console
$ cd ~/q4/services/scan-pipeline
$ export TMPDIR=/home/kody/q4/t
$ ~/q4/.venv/bin/python -m pytest -q tests/test_refine*.py tests/test_storage.py -rs
```

| run | umask | result |
|-----|-------|--------|
| 1 | `0022` | `1139 passed in 44.18s` |
| 2 | `0022` | `1139 passed in 42.81s` |
| 3 | `0022` | `1139 passed in 42.65s` |
| 4 | `0002` (ambient login umask) | `1139 passed in 42.95s` |

**Skip list: empty.** `-rs` printed no short-test-summary section in any of the
four runs — there were no skipped tests to report, not merely a zero in a
counter line. Collection confirms the selection was whole:

```console
$ ~/q4/.venv/bin/python -m pytest --collect-only -q tests/test_refine*.py tests/test_storage.py | tail -1
1139 tests collected in 0.32s
```

1139 collected, 1139 passed, 0 skipped, 0 deselected. This matches I97's
recorded host figure of 1139 passed / 0 skipped.

## 2 — Linux child-subreaper behaviour (shipped helpers)

Measured through `refine_colmap_command._linux_child_subreaper_state`,
`._enable_linux_child_subreaper`, `._pre_command_child_errors`,
`._post_command_quiescence_errors` and `._restore_linux_child_subreaper` — the
shipped functions, not a local `prctl`.

```json
{
  "probe_pid": 1026208,
  "subreaper_state_initial": false,
  "pre_command_child_errors": [],
  "enable_returned_previous_state": false,
  "subreaper_state_after_enable": true,
  "intermediate_pid": 1026209,
  "intermediate_reaped_pid": 1026209,
  "intermediate_wait_status": 0,
  "grandchild_pid": 1026210,
  "grandchild_self_reported_ppid": 1026208,
  "grandchild_ppid_equals_probe_pid": true,
  "grandchild_proc_stat_while_alive": {"state": "S", "ppid": 1026208, "pgrp": 1026207},
  "quiescence_errors_while_grandchild_alive": [
    "native owner retains a live adopted COLMAP descendant"
  ],
  "grandchild_proc_stat_unreaped_zombie": {"state": "Z", "ppid": 1026208, "pgrp": 1026207},
  "quiescence_errors_after_grandchild_exit": [],
  "waitpid_after_helper": "ECHILD (the shipped helper consumed it)",
  "grandchild_proc_entry_exists_after_reap": false,
  "restore_errors": [],
  "subreaper_state_after_restore": false
}
```

The transition is complete and reversible: `false → true → false`, with
`_enable_linux_child_subreaper` returning the prior state `false` and
`_restore_linux_child_subreaper` returning no errors. The intermediate process
forked a grandchild and exited; the grandchild's own `getppid()` and the
independent `/proc/1026210/stat` read both give ppid `1026208` — the probe — so
reparenting to the subreaper is confirmed twice. The grandchild was still in the
probe's *original* process group (`pgrp 1026207`), so this is adoption, not group
membership. While it lived, the shipped quiescence scan refused. Once it became
an unreaped zombie (`state "Z"`, ppid still `1026208`), the shipped scan returned
no errors, and the immediately following `waitpid(-1, WNOHANG)` raised `ECHILD`
— the helper, not the probe, consumed the zombie.

## 3 — Adopted-child reaping and quiescence (real child group leader)

Scoped deliberately to a forked child that made itself a group leader.
`_success_group_quiescence_errors` issues `killpg(leader, SIGSTOP)`; passing the
probe's own pgid would SIGSTOP the probe. That is a probe bug, not a product
bug, and it is the reason both phases below use a real child leader.

Phase A — leader alive with a live same-group descendant:

```json
{
  "leader_pid": 1026363,
  "descendant_pid": 1026364,
  "leader_is_its_own_group_leader": true,
  "descendant_proc_stat": {"state": "S", "ppid": 1026363, "pgrp": 1026363},
  "members_named_by_scan": [1026364],
  "quiescence_errors": ["native child process group retains descendant members"],
  "leader_proc_stat_after_freeze": {"state": "T", "ppid": 1026362, "pgrp": 1026363},
  "descendant_proc_stat_after_freeze": {"state": "T", "ppid": 1026363, "pgrp": 1026363}
}
```

`_linux_process_group_members` **names the member** (`1026364`), and
`_success_group_quiescence_errors` reports non-quiescent. Both leader and
descendant read `state "T"` afterwards, so the freeze the scan depends on really
happened.

Phase B — leader alone and dead (exited, deliberately unreaped):

```json
{
  "leader_pid": 1026365,
  "leader_proc_stat": {"state": "Z", "ppid": 1026362, "pgrp": 1026365},
  "members_named_by_scan": [],
  "quiescence_errors": []
}
```

Quiescent, as required. Both phases were cleaned up inside the probe
(`phase_a_cleanup_reaped: [1026363, 1026364]`, `phase_b_cleanup_reaped:
[1026365, 0]`), and the subreaper flag was restored to `false` with no errors.

## 4 — Escaped `setsid` descendant (measured blind spot)

A child leader forked a descendant that called `setsid()`:

```json
{
  "leader_pid": 1026368,
  "leader_proc_stat": {"state": "S", "ppid": 1026367, "pgrp": 1026368, "session": 1026360},
  "escapee_pid": 1026369,
  "escapee_proc_stat": {"state": "S", "ppid": 1026368, "pgrp": 1026369, "session": 1026369},
  "escapee_has_own_pgrp": true,
  "escapee_has_own_session": true,
  "escapee_pgrp_differs_from_leader_group": true,
  "group_scan_members_while_escapee_alive": [],
  "group_quiescence_errors_while_escapee_alive": [],
  "escapee_reparented_to_probe": true,
  "waitpid_scan_errors_while_escapee_alive": [
    "native owner retains a live adopted COLMAP descendant"
  ],
  "waitpid_scan_errors_after_escapee_exit": [],
  "escapee_proc_entry_exists_after_reap": false
}
```

The escapee has its own process group and its own session (`pgrp = sid = 1026369`),
and the group scan **cannot see it**: `_linux_process_group_members(leader)`
returns empty and `_success_group_quiescence_errors(leader)` reports *quiescent*
while a live descendant of that leader exists.

This is a documented blind spot, not a defect. The design does not rely on the
group scan to catch an escapee; containment is the frozen private copy
(criterion 9), which an escaped descendant cannot reach because it has no name
and the holding process is sealed. What is *also* measured here is that the
escapee does not slip past the run silently: once the leader exited, the escapee
reparented to the subreaper (`escapee_reparented_to_probe: true`) and the shipped
adoption scan refused with `native owner retains a live adopted COLMAP
descendant`, which is a cleanup error and therefore fails the call closed
(criterion 5). Detected, not contained — exactly what the module docstring says.

## 5 — Cleanup precedence

The source order in `refine_colmap_command.run_inherited_colmap_command` is
`cleanup_errors` (line 836) → `drain_errors` (841) → `primary_error` (844) →
non-zero `returncode` (856).

Measured by driving the **real** `run_inherited_colmap_command` inside a **real**
`setsid` session leader (`is_dedicated_session_and_group_leader: true`), with
**no** monkeypatching of the subreaper, the pre-command child check, or the
quiescence scan (`monkeypatched_helpers: []`). The only fixture is the
repository's own fake COLMAP prefix from `tests/_colmap_toolchain.py`, which is
what makes a child launchable without executing COLMAP. Each precedence case is
paired with a control that runs the same program with the residue removed, so
the error the cleanup failure supersedes is measured rather than assumed.

| case | program | outcome |
|------|---------|---------|
| a — control, success | exits 0 | `ColmapCommandResult`, `returncode 0`, tail `cli-done` |
| b — success + residue | exits 0, leaves a live descendant | `REFINE_ENGINE_CLEANUP_FAILED` — `native owner retains a live adopted COLMAP descendant` |
| c — success + residue holding stdout | exits 0, descendant keeps the pipe | `REFINE_ENGINE_CLEANUP_FAILED` — `inherited COLMAP log drain did not stop; native owner retains a live adopted COLMAP descendant` |
| d — control, non-zero exit | exits 3 | `REFINE_ENGINE_FAILED` — `COLMAP command failed (3): cli-failed` |
| e — non-zero exit + residue | exits 3, leaves a live descendant | `REFINE_ENGINE_CLEANUP_FAILED` — `native owner retains a live adopted COLMAP descendant` |
| f — control, deadline timeout | sleeps 30 s under a 1.0 s deadline | `REFINE_ENGINE_TIMEOUT` — `COLMAP command exceeded the carried RefineDeadline` |
| g — deadline timeout + residue | same, plus a live descendant | `REFINE_ENGINE_CLEANUP_FAILED` — `native owner retains a live adopted COLMAP descendant` |

d→e and f→g are the precedence measurements: identical programs, identical
deadlines, and the only difference is the residue. The error a caller would
otherwise have received (`REFINE_ENGINE_FAILED`, `REFINE_ENGINE_TIMEOUT`) is
replaced by `REFINE_ENGINE_CLEANUP_FAILED`. a→b is the fail-closed measurement:
a command that succeeded still refuses to return a result. Every residue process
was killed and reaped inside the probe (`reaped_during_case_cleanup` non-empty
for b, c, e, g).

**Not measured on the host:** precedence over the `drain_errors` branch in
isolation. On this host the drain fault surfaced as a *cleanup* error
(`inherited COLMAP log drain did not stop`, case c), not as a `drain_errors`
entry, so no case produced `drain_errors` non-empty with `cleanup_errors` empty
to compare against. That branch is covered in-repo by
`tests/test_refine_colmap_command.py::test_popen_exception_is_fixed_and_cleanup_failure_takes_precedence`,
which ran green inside the four gate runs above; it is in-repo coverage, not a
host measurement, and is labelled as such.

## 6 — The kernel-thread parser on real `/proc`

Every live `/proc/<pid>/stat` row on the host was fed through the shipped
`refine_native_process._read_linux_process_stat` → `_parse_linux_process_stat`
(`refine_native_process.py:3557`).

```json
{
  "rows_read": 529,
  "rows_vanished_mid_walk": 0,
  "parse_failures": [],
  "parse_failure_count": 0,
  "identity_mismatches": [],
  "pgrp_zero_count": 259,
  "pgrp_zero_userland_count": 0,
  "pgrp_zero_userland": [],
  "pgrp_zero_all_have_no_VmSize": true,
  "pgrp_zero_all_have_empty_cmdline": true,
  "pgrp_zero_sample_first_5": [
    {"pid": 10, "has_VmSize": false, "cmdline_len": 0},
    {"pid": 100, "has_VmSize": false, "cmdline_len": 0},
    {"pid": 1000193, "has_VmSize": false, "cmdline_len": 0},
    {"pid": 1000542, "has_VmSize": false, "cmdline_len": 0},
    {"pid": 1003163, "has_VmSize": false, "cmdline_len": 0}
  ]
}
```

**529 rows read, 0 parse failures, 259 rows with `pgrp == 0`, 0 of them
userland.** Kernel-thread status was confirmed by two independent signals for
every one of the 259: no `VmSize` line in `/proc/<pid>/status` *and* an empty
`/proc/<pid>/cmdline`. Both hold for all 259; neither holds for any of them
partially. The reported PID in each row equalled the directory name in every
case (`identity_mismatches: []`).

This is the same class of measurement I97 recorded (283 of 547 at the time); the
absolute numbers differ because the host's process table differs run to run. The
load-bearing facts — zero parse failures and zero userland `pgrp 0` rows — hold.

## 7 — The `PR_SET_DUMPABLE` seal versus the `/proc` scan

One process, measured on both sides of a single call to the shipped
`refine_native_process._seal_process_against_procfs_descriptor_theft`
(`refine_native_process.py:2359`). The process made itself a group leader and
forked one live same-group child as the positive control, so an empty scan
result cannot masquerade as success.

```json
{
  "pid": 1028437, "pgid": 1028437, "uid": 1000, "is_group_leader": true,
  "yama_ptrace_scope": "1",
  "positive_control_child_pid": 1028439,

  "pre_seal_dumpable": 1,
  "pre_seal_proc_survey": {
    "foreign_uid_proc_entries_seen": 387,
    "foreign_uid_stat_rows_parsed": 387,
    "foreign_uid_stat_rows_refused": []
  },
  "pre_seal_group_members": [1028439],
  "pre_seal_positive_control_found": true,

  "post_seal_dumpable": 0,
  "post_seal_proc_survey": {
    "foreign_uid_proc_entries_seen": 387,
    "foreign_uid_stat_rows_parsed": 387,
    "foreign_uid_stat_rows_refused": []
  },
  "post_seal_group_members": [1028439],
  "post_seal_positive_control_found": true,
  "post_seal_own_proc_fd_listing": ["0", "1", "2", "3", "4", "5"]
}
```

The seal took effect (`dumpable 1 → 0`). It did **not** blind the scan the
cleanup path depends on: 387 foreign-uid `/proc/<pid>/stat` rows were seen and
387 parsed on both sides, with zero refusals, and the live positive-control
child was found in the group scan on both sides. The sealed process can still
read its own `/proc/self/fd`.

A **sibling** process — same uid, launched by the same shell, `observer_ppid
1028433 ≠ target 1028437`, so not a child — attempted the reopen:

```json
"pre_seal_procfs_reopen": {
  "path": "/proc/1028437/fd/3", "result": "succeeded",
  "bytes_read": "PATINA-I97-QUALIFIED-HOST-RECEIPT-SECRET"
},
"post_seal_procfs_reopen": {
  "path": "/proc/1028437/fd/3", "result": "refused",
  "errno": 13, "errno_name": "Permission denied"
}
```

Unsealed, the sibling read the target's held descriptor outright. Sealed, the
open is refused `EACCES`.

## 8 — The descriptor-theft routes

**`yama.ptrace_scope`** — `cat /proc/sys/kernel/yama/ptrace_scope` → `1`.

**Procfs re-open with a live positive control** — measured in criterion 7 above:
succeeded pre-seal, `EACCES` post-seal, with the group scan's positive control
found on both sides so the post-seal refusal cannot be an artifact of an empty
scan.

**`pidfd_open` + `pidfd_getfd`** — the target granted `PR_SET_PTRACER_ANY`
before the pre-seal attempt (`pr_set_ptracer_any_rc: 0`, `errno 0`), so under
`yama.ptrace_scope=1` the unsealed attempt is not merely refused by Yama:

```json
"pre_seal_pidfd_getfd": {
  "stage": "pidfd_getfd", "result": "succeeded", "rc": 4,
  "bytes_read": "PATINA-I97-QUALIFIED-HOST-RECEIPT-SECRET"
},
"post_seal_pidfd_getfd": {
  "stage": "pidfd_getfd", "result": "refused", "rc": -1,
  "errno": 1, "errno_name": "Operation not permitted"
}
```

Unsealed **succeeds with the grant** (the sibling stole the descriptor and read
the bytes). Sealed returns `EPERM`. Because the same syscall succeeded moments
earlier in the same process pair, the `EPERM` is attributable to the seal and
not to a seccomp profile refusing `pidfd_getfd` outright — which is the
condition under which I97's in-repo test skips.

## 9 — The `O_TMPFILE` freeze on real ext4

Measured through the shipped chain `provision_native_workspace_lease`
(`:4672`) → `_open_output_freeze_vault` (`:2489`) → `_frozen_output_copy`
(`:2710`) — the same three calls the parent's output-receipt path makes. Not a
re-implementation.

```json
{
  "container": "/home/kody/q4/frz",
  "lease_path": "/home/kody/q4/frz/patina-refine-native-workspace-61ace7b23980bb6f16b58712c02ca147",
  "lease_filesystem": {"mount_point": "/", "fs_type": "ext4", "source": "/dev/nvme0n1p6"},
  "source": {"st_dev": 66310, "st_ino": 7881146, "st_nlink": 1, "size": 4127},
  "token": "adapter-v2.json",
  "vault_name": "patina-refine-native-freeze-cb9ff0a1cbe2ee8c22228e3cffef7b44",
  "vault_listing_at_open": [],
  "process_dumpable_after_vault_open": 0,
  "frozen": {"descriptor": 8, "st_dev": 66310, "st_ino": 7881148, "st_nlink": 0,
             "size": 4127, "mode_octal": "0o100600"},
  "frozen_is_a_different_inode_from_the_source": true,
  "frozen_procfs_alias": "/home/kody/q4/frz/patina-refine-native-freeze-cb9ff0a1cbe2ee8c22228e3cffef7b44/#7881148 (deleted)",
  "frozen_bytes_match_source": true,
  "vault_listing_after_freeze": [],
  "attempt_to_give_the_copy_a_name": {"result": "refused", "errno": 18,
                                      "errno_name": "Invalid cross-device link"},
  "vault_release_errors": [],
  "frozen_bytes_after_vault_removal": true,
  "lease_release_errors": [],
  "frozen_bytes_after_lease_purge": true,
  "source_name_still_exists_after_purge": false,
  "container_listing_after_purge": []
}
```

The filesystem is genuinely ext4 (`/dev/nvme0n1p6` mounted at `/`, resolved from
the lease's own `st_dev` through `/proc/self/mountinfo`), not overlayfs or tmpfs.
The frozen copy is a different inode from its source, has `st_nlink 0`, and its
`/proc/self/fd` alias reads `#7881148 (deleted)`. The vault directory is empty
both at open and after the copy exists — nothing is ever named inside it.
`linkat` through `/proc/self/fd` refused with `EXDEV (18)`; the copy cannot be
given a name even by the process holding it. Opening the vault applied the seal
(`process_dumpable_after_vault_open: 0`) before any copy existed.

A **sibling** shell, same uid, launched by the same parent shell, tried to reach
it by name, by directory walk, and through procfs while the descriptor was held:

```console
--- ls -a VAULT (/home/kody/q4/frz/patina-refine-native-freeze-cb9ff0a1cbe2ee8c22228e3cffef7b44) ---
.
..
--- find CONTAINER for any regular file ---
/home/kody/q4/frz/patina-refine-native-workspace-61ace7b23980bb6f16b58712c02ca147/work/engine-output-source.bin
--- ls -l /proc/$TARGET_PID/fd ---
ls: cannot open directory '/proc/1031265/fd': Permission denied
--- cat /proc/$TARGET_PID/fd/$FROZEN_FD ---
cat: /proc/1031265/fd/8: Permission denied
```

Stated exactly: the sibling **could** see and read the lease-side *source* file,
because the lease is 0700 owned by the same uid — that is expected and is not
what the freeze protects. What it could not reach is the frozen copy: the vault
directory contains nothing, a whole-container `find` returns no frozen file, and
`/proc/<pid>/fd` is refused.

After `_release_output_freeze_vault` and `_release_workspace_lease`, the frozen
bytes were still readable from the held descriptor
(`frozen_bytes_after_vault_removal` and `frozen_bytes_after_lease_purge` both
`true`), the source name was gone, and the container listing was empty — the
purge left no residue.

## What this receipt does **not** establish

- **No composition exists.** Nothing here runs materializer → raster → backend →
  runner → publisher. Item 6 (raw pre-BA and refined snapshots, child-proposed
  alignment, parent-recomputed Sim3 and pose digests) is unbuilt;
  `NATIVE_ENGINE_OUTPUT_ALIGNMENT_VERIFIED_BY_PARENT` is `False` in the measured
  tree.
- **No COLMAP and no GPU ran.** The only child processes launched were the
  repository's fake COLMAP fixture from `tests/_colmap_toolchain.py`, whose
  "binary" is a Python script. No CUDA, no `nvcc`, no `pycolmap`, no doctor, no
  `nvidia-smi`. Nothing under `/opt/colmap` was executed.
- **No real scan ran.** Scan `95266be1` was not touched. No packet was extracted,
  no frames were read, no reconstruction was attempted.
- **No production DB or Storage was touched.** No Strata query, no PostgREST RPC,
  no `room-scans` Storage call, no queue claim, no stage registration, no
  migration.
- **No installed artifact was changed.** `/opt/patina`, `/opt/colmap`, `/etc`,
  `/var/lib/patina` and every unit file are as found. `install.sh` and
  `install-colmap-*.sh` were not run. Nothing was `pip install`ed outside a venv
  created and destroyed inside `~/`.
- **Nothing here moves activation closer.** `DEFAULT_STAGES` remains
  `ingest,solve,drawings`, every `*QUALIFIED*` flag remains `False`, Refine
  remains unregistered and undispatched, and the persistent worker was not
  reconfigured. No flag was flipped.
- **This is not an item-4 sign-off.** It receipts the four named acceptance
  clauses and the supporting measurements. Whether item 4 closes as a program
  gate is a ruling, not a measurement, and the remaining hard gates —
  comparable reprojection/registration/verified-loop evidence on local-scratch
  `95266be1`, queue replay/fork, the four-manifest Present join, registration,
  and every GPU queue stage — are untouched by this document.
- **One sub-clause is in-repo coverage, not a host measurement:** precedence over
  the `drain_errors` branch in isolation (criterion 5).
- **The host measurements are not reproducible from this repository.** They
  depend on a real Linux `/proc`, a real ext4 filesystem, an unconfined seccomp
  profile, and this host's process table. A macOS gate has no `/proc`; a
  container gate has its own PID namespace with no kernel threads in it. That is
  the same gap that hid the `pgrp == 0` blocker until I97's host run.

## Host cleanup

Every artifact this run created was removed. `~/q4` (tree, venv, probes, all
scratch) and `~/sp.tar` are gone; `ls -A ~` before and after removal differs by
exactly one line (`q4`). `/tmp/pytest-of-kody` was neither written nor removed
and still holds `pytest-1`, `pytest-2`, `pytest-3`, `pytest-current` with its
pre-existing mtimes. Two throwaway `ls` listings were written to `/tmp` to make
that before/after comparison and were deleted in the same command; they are the
only bytes this run wrote outside `~/`. Pre-existing directories belonging to
earlier runs (`~/agent-i97-item5`, `~/i97-gate-hygiene-verify`) were left
untouched.

Final posture:

```text
patina-scan-worker  ActiveState=active  SubState=running
                    ExecMainPID=5126
                    ExecMainStartTimestamp=Mon 2026-07-27 05:41:53 CDT
                    NRestarts=0
```

— identical to the pre-run reading.
