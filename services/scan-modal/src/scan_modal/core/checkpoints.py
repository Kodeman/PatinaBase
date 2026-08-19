"""Which checkpoint the splat is exported from, decided from held-out metrics.

WHY THIS EXISTS
───────────────
W2 measured the seeded run's held-out PSNR peaking at **16.36 dB at step 4 000**,
holding a plateau to about 18 000, and then falling to **13.54 by 29 000** — below
where the unseeded run ended (W2-EVIDENCE.md §13.6). The artifact that got stored
was the last checkpoint, so the pipeline spent forty-five minutes of L4 training
past its own best result and then shipped the worse one. Cutting the iteration
budget helps (see `default_max_iterations` in `jobs/splat_job.py`), but a budget
is a guess made before the run; the eval curve is a measurement made during it,
and the peak moves with the room. Exporting from the best checkpoint is the part
that does not need to be guessed.

WHY PSNR STOPPED BEING THE SELECTOR (W2-EVIDENCE.md §14.6 item 1)
───────────────────────────────────────────────────────────────
Re-reading the same held-out curve at full checkpoint resolution found the
"peak" PSNR result decided by a **0.013 dB** margin over its nearest competing
checkpoint — noise, not signal, on a sparse-view room splat. Over the identical
window, held-out **LPIPS moved 0.19, monotonically** — a perceptual-similarity
metric that actually tracked the run instead of oscillating within measurement
error. So the rule is now: **LPIPS (lower is better) is primary**, and PSNR
is only the tiebreak for an exact LPIPS tie, and the fallback for a run whose
event file has PSNR but no usable LPIPS series. Both numbers are still carried
on every `CheckpointChoice` — see its docstring — because a stored artifact
should be readable without re-deriving which metric decided it.

WHAT NERFSTUDIO 1.1.5 ACTUALLY GIVES US, READ OFF ITS SOURCE
────────────────────────────────────────────────────────────
- `Trainer.eval_iteration` writes eval metrics through `writer.put_dict`, and
  `Writer.write_scalar_dict` names each scalar `f"{name}/{key}"`. splatfacto's
  `Model.get_image_metrics_and_images` (`nerfstudio/models/splatfacto.py`)
  returns `metrics_dict = {"psnr": ..., "ssim": ..., "lpips": ...}` — LPIPS is
  computed **unconditionally** alongside PSNR (`self.lpips = LearnedPerceptual-
  ImagePatchSimilarity(normalize=True)`, `metrics_dict["lpips"] = float(lpips)`)
  every single eval iteration; only the extra `cc_*` (colour-corrected) variants
  are gated behind `config.color_corrected_metrics`. `get_average_eval_image_
  metrics` (`pipelines/base_pipeline.py`) passes that same dict through
  unfiltered. **No training-invocation flag is needed to emit LPIPS** — it is
  on the wire the moment PSNR is.
- The held-out curve is therefore the tensorboard scalar pair
  **`Eval Images Metrics Dict (all images)/{psnr,lpips}`**, emitted every
  `steps_per_eval_all_images` (1 000 for splatfacto), with
  `Eval Images Metrics/{psnr,lpips}` (one image, every 100) as a weaker second
  source for each — same cadence, same preference order, same tag scheme,
  because both scalars come out of the same `put_dict` call.
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
    "EVAL_LPIPS_TAGS",
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
#: the number §14.6 reports; the second is a single eval image and is noisier,
#: but it is emitted 10× more often and is better than exporting blind.
#: The PRIMARY selection signal — see the module docstring for why PSNR (below)
#: was demoted to a tiebreak/fallback.
EVAL_LPIPS_TAGS = (
    "Eval Images Metrics Dict (all images)/lpips",
    "Eval Images Metrics/lpips",
)

#: Same preference order and cadence as `EVAL_LPIPS_TAGS` — both scalars come
#: off the same `put_dict` call (see module docstring). Kept as the tiebreak for
#: an exact LPIPS tie, and as the whole basis when a run has no usable LPIPS
#: series (older event file, tag missing, all-NaN).
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

    Both `lpips` and `psnr` are carried regardless of which one decided the
    choice, so a stored artifact can be read without re-deriving the rule:

    - `reason == "best_lpips"`: `lpips` is the winning value; `psnr` is that
      same step's reading if one exists (it decided nothing unless `lpips` was
      exactly tied with another candidate).
    - `reason == "psnr-fallback"`: the run had no usable held-out LPIPS series
      at all, so the old PSNR-only rule picked the step; `lpips` is None.
    - `reason == "latest_no_eval_metrics"`: neither metric was usable; both are
      None and the choice is the newest checkpoint on disk.
    """

    step: int
    lpips: float | None
    psnr: float | None
    reason: str
    #: How many (step, value) pairs were available, at checkpointed steps, for
    #: whichever metric decided the choice (LPIPS normally, PSNR on fallback).
    considered: int = 0


def checkpoint_step(name: str) -> int | None:
    """The step encoded in a checkpoint file name, or None if it is not one."""
    match = _CHECKPOINT_NAME.match(name)
    return int(match.group(1)) if match else None


def checkpoint_steps(names: Iterable[str]) -> list[int]:
    """Every step with a checkpoint on disk, ascending and deduplicated."""
    steps = {step for name in names if (step := checkpoint_step(name)) is not None}
    return sorted(steps)


def _scored_at_steps(
    pairs: Mapping[int, float] | Sequence[tuple[int, float]],
    exportable: set[int],
) -> dict[int, float]:
    """One metric's (step, value) pairs, restricted to steps with a checkpoint.

    A step can be written more than once across a resume; the later write is
    the one that describes the checkpoint now on disk, so later entries in
    `pairs` overwrite earlier ones for the same step. NaN is not a measurement.
    """
    items = pairs.items() if isinstance(pairs, Mapping) else pairs
    scored: dict[int, float] = {}
    for step, value in items:
        step = int(step)
        if step in exportable and value == value:  # NaN is not a measurement
            scored[step] = float(value)
    return scored


def select_checkpoint(
    lpips_by_step: Mapping[int, float] | Sequence[tuple[int, float]],
    psnr_by_step: Mapping[int, float] | Sequence[tuple[int, float]],
    available_steps: Sequence[int],
) -> CheckpointChoice | None:
    """Pick the checkpoint with the best held-out LPIPS, PSNR as tiebreak.

    The search is deliberately restricted to steps that HAVE a checkpoint. Eval
    runs every 1 000 steps and checkpoints land every 2 000, so the best eval
    step is often one we cannot export from; interpolating to a neighbour would
    be asserting a metric for a checkpoint nobody measured. Picking the best
    among the exportable ones is the honest version of the same idea.

    LPIPS is lower-is-better and is the primary signal (see the module
    docstring for why: on a sparse-view room splat PSNR's "best" checkpoint was
    a 0.013 dB margin — noise — while LPIPS moved 0.19 monotonically over the
    same window). Ties on LPIPS are broken by the HIGHER PSNR at that step, and
    a step with no PSNR reading loses any such tie. A run with no usable LPIPS
    series at all (missing tag, all-NaN, no event file) falls back to the old
    best-PSNR rule, recorded as `reason="psnr-fallback"`.

    Ties (on whichever metric decided it) go to the EARLIER step: two
    checkpoints of equal held-out quality are not equal artifacts — the earlier
    one has had less opportunity to overfit.

    Returns None only when there is no checkpoint at all; a run with checkpoints
    but no usable metrics still gets a choice (the latest), so the caller never
    has to invent one.
    """
    steps = sorted({int(s) for s in available_steps})
    if not steps:
        return None

    exportable = set(steps)
    lpips_scored = _scored_at_steps(lpips_by_step, exportable)
    psnr_scored = _scored_at_steps(psnr_by_step, exportable)

    if lpips_scored:
        def _key(step: int) -> tuple[float, float, int]:
            # Lower LPIPS wins; among ties, higher PSNR wins (so its negation
            # sorts first); a step with no PSNR reading loses any such tie.
            psnr_tiebreak = -psnr_scored[step] if step in psnr_scored else float("inf")
            return (lpips_scored[step], psnr_tiebreak, step)

        best_step = min(lpips_scored, key=_key)
        return CheckpointChoice(
            step=best_step,
            lpips=lpips_scored[best_step],
            psnr=psnr_scored.get(best_step),
            reason="best_lpips",
            considered=len(lpips_scored),
        )

    if psnr_scored:
        best_step = min(psnr_scored, key=lambda s: (-psnr_scored[s], s))
        return CheckpointChoice(
            step=best_step,
            lpips=None,
            psnr=psnr_scored[best_step],
            reason="psnr-fallback",
            considered=len(psnr_scored),
        )

    return CheckpointChoice(
        step=steps[-1],
        lpips=None,
        psnr=None,
        reason="latest_no_eval_metrics",
        considered=0,
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
