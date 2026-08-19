"""Which checkpoint the splat is exported from.

Everything here is at the pure seam: synthetic metric lists and synthetic file
names in, a choice out. The tensorboard read and the yaml write live in
`jobs/splat_job.py` and are exercised there with real files on a tmp path — no
test in this repo needs an event file or a GPU to pin this decision down.

LPIPS is the primary selector, PSNR the tiebreak and the fallback when a run
has no usable LPIPS series (W2-EVIDENCE.md §14.6 item 1: on the measured
sparse-view curve, PSNR's "best" checkpoint won by 0.013 dB — noise — while
LPIPS moved 0.19 monotonically over the same window). The `MEASURED_CURVE`
fixture below is that PSNR curve (W2-EVIDENCE.md §13.6): a fast rise to a peak
around step 4 000, a plateau to ~18 000, then a decline that ends BELOW where
an unseeded run would have finished — kept here as the fixture for the
PSNR-only fallback path, since a run with no LPIPS series is exactly the case
that curve was originally measured to fix.
"""

from __future__ import annotations

import pytest

from scan_modal.core.checkpoints import (
    CheckpointChoice,
    checkpoint_step,
    checkpoint_steps,
    select_checkpoint,
    with_load_step,
)

# The shape of §13.6's seeded run, sampled at the eval cadence. PSNR only —
# used below as the fallback-path fixture (no LPIPS series available).
MEASURED_CURVE = [
    (1000, 14.90), (2000, 15.81), (3000, 16.11), (4000, 16.36), (5000, 16.30),
    (6000, 16.28), (7000, 16.19), (8000, 16.22), (9000, 16.05), (10000, 15.94),
    (11000, 15.61), (12000, 15.40),
]
MEASURED_CHECKPOINTS = [2000, 4000, 6000, 8000, 10000, 12000]

# LPIPS at the same checkpointed steps, moving monotonically as §14.6 found —
# disagreeing with MEASURED_CURVE's PSNR peak at 4 000.
MEASURED_LPIPS_CURVE = [
    (2000, 0.41), (4000, 0.35), (6000, 0.30), (8000, 0.27), (10000, 0.24), (12000, 0.22),
]
# PSNR at those same six steps only, for the disagreement test.
MEASURED_PSNR_AT_CHECKPOINTS = [
    (2000, 15.81), (4000, 16.36), (6000, 16.28), (8000, 16.22), (10000, 15.94), (12000, 15.40),
]


# ── file names ──────────────────────────────────────────────────────────────


def test_checkpoint_step_reads_nerfstudios_own_name_format():
    # `Trainer.save_checkpoint`: f"step-{step:09d}.ckpt"
    assert checkpoint_step("step-000004000.ckpt") == 4000
    assert checkpoint_step("step-000000000.ckpt") == 0
    assert checkpoint_step("step-000030000.ckpt") == 30000


@pytest.mark.parametrize("name", [
    "config.yml", "step-000004000.ckpt.tmp", "step-.ckpt", "stepped-1.ckpt",
    "step-0004000.ckpt.bak", "", "step-abc.ckpt",
])
def test_checkpoint_step_refuses_anything_that_is_not_one(name):
    assert checkpoint_step(name) is None


def test_checkpoint_steps_sorts_dedupes_and_ignores_strangers():
    names = [
        "step-000012000.ckpt", "config.yml", "step-000004000.ckpt",
        "step-000004000.ckpt", "events.out.tfevents.123.host.1.0",
    ]
    assert checkpoint_steps(names) == [4000, 12000]


def test_checkpoint_steps_of_an_empty_directory_is_empty():
    assert checkpoint_steps([]) == []


# ── the choice: LPIPS is primary ────────────────────────────────────────────


def test_lpips_and_psnr_disagree_lpips_wins():
    """The whole point of the switch. PSNR peaks at step 4 000 (16.36 dB); LPIPS
    is best (lowest) at step 12 000 — the two metrics pick different steps, and
    LPIPS must be the one that decides."""
    choice = select_checkpoint(
        MEASURED_LPIPS_CURVE, MEASURED_PSNR_AT_CHECKPOINTS, MEASURED_CHECKPOINTS,
    )
    assert choice == CheckpointChoice(
        step=12000, lpips=0.22, psnr=15.40, reason="best_lpips", considered=6,
    )


def test_only_steps_with_a_checkpoint_are_candidates():
    """Eval runs every 1 000 steps and checkpoints land every 2 000, so the true
    peak is often at a step nothing can be exported from. Picking 3 000's metric
    and then exporting 4 000's weights would be a number attached to the wrong
    artifact."""
    lpips_curve = [(1000, 0.01), (3000, 0.001), (4000, 0.20), (6000, 0.15)]
    choice = select_checkpoint(lpips_curve, [], [2000, 4000, 6000])
    assert choice is not None
    assert choice.step == 6000 and choice.lpips == 0.15
    # 3 000's 0.001 was the best number in the file and is correctly ignored.
    assert choice.considered == 2


def test_a_tie_on_lpips_is_broken_by_the_higher_psnr():
    """Ruled: PSNR is the tiebreak when LPIPS ties exactly."""
    lpips = [(2000, 0.30), (4000, 0.30), (6000, 0.30)]
    psnr = [(2000, 15.0), (4000, 17.0), (6000, 16.0)]
    choice = select_checkpoint(lpips, psnr, [2000, 4000, 6000])
    assert choice is not None and choice.step == 4000 and choice.psnr == 17.0


def test_a_tie_on_both_metrics_goes_to_the_earlier_checkpoint():
    """Equal held-out quality is not an equal artifact: the earlier one has had
    less opportunity to overfit, and §13.6's curve only falls after its plateau."""
    lpips = [(2000, 0.30), (4000, 0.30), (6000, 0.30)]
    psnr = [(2000, 16.0), (4000, 16.0), (6000, 16.0)]
    choice = select_checkpoint(lpips, psnr, [2000, 4000, 6000])
    assert choice is not None and choice.step == 2000


def test_a_step_missing_psnr_loses_an_lpips_tie():
    """A step with no PSNR reading cannot win a tiebreak it has no evidence for."""
    lpips = [(2000, 0.30), (4000, 0.30)]
    psnr = [(4000, 10.0)]  # 2000 has no PSNR reading at all
    choice = select_checkpoint(lpips, psnr, [2000, 4000])
    assert choice is not None and choice.step == 4000 and choice.psnr == 10.0


def test_a_monotonically_improving_lpips_run_selects_its_last_checkpoint():
    """A denser capture that never overfits must still work — the mechanism
    must not be biased toward early stopping, only toward the measurement.
    LPIPS improving means DECREASING, unlike PSNR."""
    lpips = [(s, 30.0 - s / 1000) for s in range(1000, 13000, 1000)]
    choice = select_checkpoint(lpips, [], MEASURED_CHECKPOINTS)
    assert choice is not None and choice.step == 12000
    assert choice.reason == "best_lpips"


def test_a_mapping_and_a_pair_list_are_the_same_input():
    as_pairs = select_checkpoint(
        MEASURED_LPIPS_CURVE, MEASURED_PSNR_AT_CHECKPOINTS, MEASURED_CHECKPOINTS,
    )
    as_mapping = select_checkpoint(
        dict(MEASURED_LPIPS_CURVE), dict(MEASURED_PSNR_AT_CHECKPOINTS), MEASURED_CHECKPOINTS,
    )
    assert as_pairs == as_mapping


def test_a_step_written_twice_keeps_the_later_write():
    """A resumed run re-evaluates steps it already logged. The event file keeps
    both, in order, and the second describes the checkpoint now on disk."""
    lpips = [(4000, 0.10), (2000, 0.05), (4000, 0.40)]
    choice = select_checkpoint(lpips, [], [2000, 4000])
    assert choice is not None and choice.step == 2000 and choice.lpips == 0.05


def test_a_nan_is_not_a_measurement():
    choice = select_checkpoint([(2000, float("nan")), (4000, 0.14)], [], [2000, 4000])
    assert choice is not None and choice.step == 4000 and choice.lpips == 0.14


def test_no_checkpoints_at_all_is_no_choice():
    assert select_checkpoint(MEASURED_LPIPS_CURVE, MEASURED_PSNR_AT_CHECKPOINTS, []) is None


# ── the choice: missing-LPIPS falls back to PSNR ────────────────────────────


def test_no_lpips_series_falls_back_to_best_psnr():
    """Ruled: a run with no usable held-out LPIPS at all (older event file, tag
    missing) still gets a real choice — the old best-PSNR rule — and the
    fallback is recorded on the choice itself, not silently taken."""
    choice = select_checkpoint([], MEASURED_CURVE, MEASURED_CHECKPOINTS)
    assert choice == CheckpointChoice(
        step=4000, lpips=None, psnr=16.36, reason="psnr-fallback", considered=6,
    )


def test_all_nan_lpips_with_usable_psnr_also_falls_back():
    """LPIPS can be present in the event file but unusable (all-NaN) — same
    fallback as it being entirely absent."""
    lpips = [(2000, float("nan")), (4000, float("nan"))]
    psnr = [(2000, 15.0), (4000, 20.0)]
    choice = select_checkpoint(lpips, psnr, [2000, 4000])
    assert choice is not None
    assert choice.step == 4000 and choice.lpips is None and choice.psnr == 20.0
    assert choice.reason == "psnr-fallback"


def test_psnr_fallback_ties_go_to_the_earlier_checkpoint():
    psnr = [(2000, 16.0), (4000, 16.0), (6000, 16.0)]
    choice = select_checkpoint([], psnr, [2000, 4000, 6000])
    assert choice is not None and choice.step == 2000 and choice.reason == "psnr-fallback"


# ── the choice: no usable metrics at all ────────────────────────────────────


def test_no_metrics_at_all_falls_back_to_the_latest_and_says_so():
    choice = select_checkpoint([], [], MEASURED_CHECKPOINTS)
    assert choice == CheckpointChoice(
        step=12000, lpips=None, psnr=None, reason="latest_no_eval_metrics", considered=0,
    )


def test_metrics_that_share_no_step_with_a_checkpoint_fall_back_too():
    lpips = [(1000, 0.10), (3000, 0.20)]
    psnr = [(1000, 20.0), (3000, 21.0)]
    choice = select_checkpoint(lpips, psnr, [2000, 4000])
    assert choice is not None
    assert choice.step == 4000 and choice.reason == "latest_no_eval_metrics"


def test_all_nan_on_both_metrics_degrades_to_the_latest_rather_than_choosing_a_nan():
    lpips = [(2000, float("nan")), (4000, float("nan"))]
    psnr = [(2000, float("nan")), (4000, float("nan"))]
    choice = select_checkpoint(lpips, psnr, [2000, 4000])
    assert choice is not None
    assert choice.step == 4000 and choice.lpips is None and choice.psnr is None
    assert choice.reason == "latest_no_eval_metrics"


# ── pinning the exporter ────────────────────────────────────────────────────
#
# `ns-export gaussian-splat` has no checkpoint flag: `eval_setup` globs the
# checkpoint dir and takes the max step whenever `config.load_step` is None, and
# — unlike `load_dir`, which it unconditionally recomputes — `load_step` is read
# straight from the yaml. So one line of the config is the entire lever.

CONFIG_YML = """!!python/object:nerfstudio.engine.trainer.TrainerConfig
data: !!python/object/apply:pathlib.PosixPath
- /cache/scan/v1
experiment_name: splatfacto
load_checkpoint: null
load_config: null
load_dir: null
load_step: null
machine: !!python/object:nerfstudio.configs.base_config.MachineConfig
  device_type: cuda
  num_devices: 1
max_num_iterations: 12000
method_name: splatfacto
"""


def test_with_load_step_pins_exactly_the_root_line():
    pinned = with_load_step(CONFIG_YML, 4000)
    assert "\nload_step: 4000\n" in pinned
    assert "load_step: null" not in pinned
    # Nothing else moved.
    assert pinned.replace("load_step: 4000", "load_step: null") == CONFIG_YML


def test_with_load_step_leaves_a_nested_field_of_the_same_name_alone():
    """`yaml.dump` writes the root config's keys at column 0 and every nested
    config indented, so an anchored pattern can only hit the one that matters."""
    text = CONFIG_YML.replace(
        "  num_devices: 1", "  num_devices: 1\n  load_step: 7\n"
    )
    pinned = with_load_step(text, 4000)
    assert "  load_step: 7" in pinned
    assert "\nload_step: 4000\n" in pinned


def test_with_load_step_replaces_a_previous_pin():
    already = CONFIG_YML.replace("load_step: null", "load_step: 8000")
    assert "\nload_step: 4000\n" in with_load_step(already, 4000)


def test_a_config_without_the_line_is_refused_rather_than_guessed_at():
    with pytest.raises(ValueError):
        with_load_step(CONFIG_YML.replace("load_step: null\n", ""), 4000)


def test_a_config_with_two_root_lines_is_refused():
    with pytest.raises(ValueError):
        with_load_step(CONFIG_YML + "load_step: null\n", 4000)
