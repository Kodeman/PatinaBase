"""Which checkpoint the splat is exported from.

Everything here is at the pure seam: synthetic metric lists and synthetic file
names in, a choice out. The tensorboard read and the yaml write live in
`jobs/splat_job.py` and are exercised there with real files on a tmp path — no
test in this repo needs an event file or a GPU to pin this decision down.

The curve the fixtures imitate is the measured one (W2-EVIDENCE.md §13.6): a
fast rise to a peak around step 4 000, a plateau to ~18 000, then a decline that
ends BELOW where an unseeded run would have finished. Exporting the last
checkpoint of that curve is what W2 shipped, and it is the case every test here
is really about.
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

# The shape of §13.6's seeded run, sampled at the eval cadence.
MEASURED_CURVE = [
    (1000, 14.90), (2000, 15.81), (3000, 16.11), (4000, 16.36), (5000, 16.30),
    (6000, 16.28), (7000, 16.19), (8000, 16.22), (9000, 16.05), (10000, 15.94),
    (11000, 15.61), (12000, 15.40),
]
MEASURED_CHECKPOINTS = [2000, 4000, 6000, 8000, 10000, 12000]


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


# ── the choice ──────────────────────────────────────────────────────────────


def test_the_measured_curve_selects_its_peak_not_its_last_step():
    """The whole point. On §13.6's curve the last checkpoint is 12 000 and the
    best exportable one is 4 000 — a 0.96 dB difference the old code threw away
    every run."""
    choice = select_checkpoint(MEASURED_CURVE, MEASURED_CHECKPOINTS)
    assert choice == CheckpointChoice(
        step=4000, psnr=16.36, reason="best_eval_psnr", considered=6,
    )


def test_only_steps_with_a_checkpoint_are_candidates():
    """Eval runs every 1 000 steps and checkpoints land every 2 000, so the true
    peak is often at a step nothing can be exported from. Picking 3 000's metric
    and then exporting 4 000's weights would be a number attached to the wrong
    artifact."""
    curve = [(1000, 10.0), (3000, 99.0), (4000, 20.0), (6000, 15.0)]
    choice = select_checkpoint(curve, [2000, 4000, 6000])
    assert choice is not None
    assert choice.step == 4000 and choice.psnr == 20.0
    # 3 000's 99.0 was the best number in the file and is correctly ignored.
    assert choice.considered == 2


def test_a_tie_goes_to_the_earlier_checkpoint():
    """Equal held-out quality is not an equal artifact: the earlier one has had
    less opportunity to overfit, and §13.6's curve only falls after its plateau."""
    curve = [(2000, 16.0), (4000, 16.0), (6000, 16.0)]
    choice = select_checkpoint(curve, [2000, 4000, 6000])
    assert choice is not None and choice.step == 2000


def test_a_monotonically_improving_run_selects_its_last_checkpoint():
    """A denser capture that never overfits must still work — the mechanism
    must not be biased toward early stopping, only toward the measurement."""
    curve = [(s, 10.0 + s / 1000) for s in range(1000, 13000, 1000)]
    choice = select_checkpoint(curve, MEASURED_CHECKPOINTS)
    assert choice is not None and choice.step == 12000
    assert choice.reason == "best_eval_psnr"


def test_no_metrics_at_all_falls_back_to_the_latest_and_says_so():
    choice = select_checkpoint([], MEASURED_CHECKPOINTS)
    assert choice == CheckpointChoice(
        step=12000, psnr=None, reason="latest_no_eval_metrics", considered=0,
    )


def test_metrics_that_share_no_step_with_a_checkpoint_fall_back_too():
    choice = select_checkpoint([(1000, 20.0), (3000, 21.0)], [2000, 4000])
    assert choice is not None
    assert choice.step == 4000 and choice.reason == "latest_no_eval_metrics"


def test_no_checkpoints_at_all_is_no_choice():
    assert select_checkpoint(MEASURED_CURVE, []) is None


def test_a_mapping_and_a_pair_list_are_the_same_input():
    as_pairs = select_checkpoint(MEASURED_CURVE, MEASURED_CHECKPOINTS)
    as_mapping = select_checkpoint(dict(MEASURED_CURVE), MEASURED_CHECKPOINTS)
    assert as_pairs == as_mapping


def test_a_step_written_twice_keeps_the_later_write():
    """A resumed run re-evaluates steps it already logged. The event file keeps
    both, in order, and the second describes the checkpoint now on disk."""
    choice = select_checkpoint([(4000, 20.0), (2000, 15.0), (4000, 12.0)], [2000, 4000])
    assert choice is not None and choice.step == 2000 and choice.psnr == 15.0


def test_a_nan_is_not_a_measurement():
    choice = select_checkpoint([(2000, float("nan")), (4000, 14.0)], [2000, 4000])
    assert choice is not None and choice.step == 4000 and choice.psnr == 14.0


def test_all_nan_degrades_to_the_latest_rather_than_choosing_a_nan():
    choice = select_checkpoint([(2000, float("nan")), (4000, float("nan"))], [2000, 4000])
    assert choice is not None
    assert choice.step == 4000 and choice.psnr is None
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
