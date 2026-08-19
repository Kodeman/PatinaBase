"""Which checkpoint the splat is exported from, decided from held-out metrics.

WHY THIS EXISTS
───────────────
W2 measured the seeded run's held-out PSNR peaking at **16.36 dB at step 4 000**,
holding a plateau to about 18 000, and then falling to **13.54 by 29 000** — below
where the unseeded run ended (W2-EVIDENCE.md §13.6). The artifact that got stored
was the last checkpoint, so the pipeline spent forty-five minutes of L4 training
past its own best result and then shipped the worse one. Cutting the iteration
budget helps (see `default_max_iterations`), but a budget is a guess made before
the run; the eval curve is a measurement made during it, and the peak moves with
the room. Exporting from the best checkpoint is the part that does not need to
be guessed.

WHAT NERFSTUDIO 1.1.5 ACTUALLY GIVES US, READ OFF ITS SOURCE
────────────────────────────────────────────────────────────
- `Trainer.eval_iteration` writes eval metrics through `writer.put_dict`, and
  `Writer.write_scalar_dict` names each scalar `f"{name}/{key}"`. splatfacto's
  `get_image_metrics_and_images` returns the key `psnr`. So the held-out curve
  is the tensorboard scalar **`Eval Images Metrics Dict (all images)/psnr`**,
  emitted every `steps_per_eval_all_images` (1 000 for splatfacto), with
  `Eval Images Metrics/psnr` (one image, every 100) as a weaker second source.
- There is **no JSON metrics file** written during `ns-train`; `benchmark_info`
  belongs to the separate `ns-eval` command. The event file is the only on-disk
  record, it sits in the run directory itself (`relative_log_dir` defaults to
  `./`), and it is written only when `--vis` includes tensorboard — which
  `train_argv` passes.
- `ns-export gaussian-splat` has **no checkpoint flag**. `Exporter` carries only
  `load_config` and `output_dir`, and `eval_setup` → `eval_load_checkpoint`
  takes `sorted(...)[-1]` of the checkpoint directory when `config.load_step is
  None`. But `load_step` is read straight from the parsed yaml and — unlike
  `load_dir`, which `eval_setup` unconditionally recomputes — is never
  overwritten. So **setting `load_step` in a copy of `config.yml` is the
  supported lever**, and it is non-destructive: no checkpoint is pruned, and the
  resume path still finds the newest one.

Everything in this module is pure. The tensorboard read and the file write live
in `jobs/splat_job.py`, where the rest of this stage's IO is.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterable, Mapping, Sequence

__all__ = [
    "CHECKPOINT_GLOB",
    "EVAL_PSNR_TAGS",
    "LOAD_STEP_PATTERN",
    "CheckpointChoice",
    "checkpoint_step",
    "checkpoint_steps",
    "select_checkpoint",
    "with_load_step",
]

#: nerfstudio writes `step-{step:09d}.ckpt` (`Trainer.save_checkpoint`).
CHECKPOINT_GLOB = "*.ckpt"
_CHECKPOINT_NAME = re.compile(r"^step-(\d+)\.ckpt$")

#: In preference order. The first is the average over ALL held-out images and is
#: the number §13.6 reports; the second is a single eval image and is noisier,
#: but it is emitted 10× more often and is better than exporting blind.
EVAL_PSNR_TAGS = (
    "Eval Images Metrics Dict (all images)/psnr",
    "Eval Images Metrics/psnr",
)

#: `yaml.dump` writes a `TrainerConfig` with sorted keys at column 0, so the
#: root config's `load_step` is the only one that can match an anchored pattern
#: with no leading whitespace. Nested configs, if one ever gains the field, are
#: indented and cannot be hit by accident.
LOAD_STEP_PATTERN = re.compile(r"^load_step:.*$", re.MULTILINE)


@dataclass(frozen=True)
class CheckpointChoice:
    """Which step to export from, and why — the `why` is provenance, not a log.

    `psnr` is None whenever the choice was not made from a measurement, which is
    the same condition as `reason != "best_eval_psnr"`. Both are carried so a
    stored artifact can be read without re-deriving the rule.
    """

    step: int
    psnr: float | None
    reason: str
    #: How many (step, psnr) pairs were available at checkpointed steps.
    considered: int = 0


def checkpoint_step(name: str) -> int | None:
    """The step encoded in a checkpoint file name, or None if it is not one."""
    match = _CHECKPOINT_NAME.match(name)
    return int(match.group(1)) if match else None


def checkpoint_steps(names: Iterable[str]) -> list[int]:
    """Every step with a checkpoint on disk, ascending and deduplicated."""
    steps = {step for name in names if (step := checkpoint_step(name)) is not None}
    return sorted(steps)


def select_checkpoint(
    psnr_by_step: Mapping[int, float] | Sequence[tuple[int, float]],
    available_steps: Sequence[int],
) -> CheckpointChoice | None:
    """Pick the checkpoint with the best held-out PSNR.

    The search is deliberately restricted to steps that HAVE a checkpoint. Eval
    runs every 1 000 steps and checkpoints land every 2 000, so the best eval
    step is often one we cannot export from; interpolating to a neighbour would
    be asserting a metric for a checkpoint nobody measured. Picking the best
    among the exportable ones is the honest version of the same idea.

    Ties go to the EARLIER step: two checkpoints of equal held-out quality are
    not equal artifacts — the earlier one has had less opportunity to overfit,
    and §13.6's curve falls monotonically after its plateau.

    Returns None only when there is no checkpoint at all; a run with checkpoints
    but no usable metrics still gets a choice (the latest), so the caller never
    has to invent one.
    """
    steps = sorted({int(s) for s in available_steps})
    if not steps:
        return None

    pairs = psnr_by_step.items() if isinstance(psnr_by_step, Mapping) else psnr_by_step
    exportable = set(steps)
    scored: dict[int, float] = {}
    for step, value in pairs:
        step = int(step)
        if step in exportable and value == value:  # NaN is not a measurement
            # A step can be written more than once across a resume; the later
            # write is the one that describes the checkpoint now on disk.
            scored[step] = float(value)

    if not scored:
        return CheckpointChoice(
            step=steps[-1],
            psnr=None,
            reason="latest_no_eval_metrics",
            considered=0,
        )

    best_step = min(scored, key=lambda s: (-scored[s], s))
    return CheckpointChoice(
        step=best_step,
        psnr=scored[best_step],
        reason="best_eval_psnr",
        considered=len(scored),
    )


def with_load_step(config_text: str, step: int) -> str:
    """Return `config.yml` text that pins `ns-export` to one checkpoint.

    A line rewrite rather than a yaml round-trip: re-dumping would require
    `yaml.load`ing nerfstudio's own class graph and writing back every field of
    it, which is a large blast radius for a one-integer change to a file we did
    not author. The `load_step:` line is emitted by `yaml.dump`'s sorted-key
    output at column 0 and there is exactly one of them.

    Raises ValueError if the line is not found exactly once — the caller treats
    that as "export from the latest checkpoint" rather than guessing, because a
    config this code does not recognise is not one it should be editing.
    """
    matches = LOAD_STEP_PATTERN.findall(config_text)
    if len(matches) != 1:
        raise ValueError(f"expected exactly one top-level load_step line, found {len(matches)}")
    return LOAD_STEP_PATTERN.sub(f"load_step: {int(step)}", config_text, count=1)
