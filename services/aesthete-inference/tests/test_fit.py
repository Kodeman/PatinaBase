"""BT MAP taste refit tests (design §8.2/§8.3/§14.4 — Wave 4A).

Model-free (the fit endpoints never touch the embedder). Synthetic separable
data: draw a ground-truth θ*, random φ pairs, choices by sign(θ*ᵀΔφ) — the
fit must recover a predictive θ; the prior must dominate at low n; the decay
must let recent evidence beat stale evidence.
"""

from __future__ import annotations

import numpy as np
from conftest import AUTH

from app.fit import backtest, fit_bt_map, pairwise_auc

DIM = 94
RNG_SEED = 41


def synth_judgments(
    theta_true: np.ndarray,
    n: int,
    rng: np.random.Generator,
    age_days: float = 0.0,
    weight: float = 1.0,
    flip: bool = False,
) -> list[dict]:
    """Pairs whose choice follows sign(θ*ᵀΔφ) — linearly separable by design."""
    out = []
    for _ in range(n):
        phi_a = rng.standard_normal(DIM)
        phi_b = rng.standard_normal(DIM)
        margin = float(theta_true @ (phi_a - phi_b))
        wins_a = margin > 0
        if flip:
            wins_a = not wins_a
        out.append(
            {
                "phi_a": phi_a.tolist(),
                "phi_b": phi_b.tolist(),
                "choice": "a" if wins_a else "b",
                "weight": weight,
                "age_days": age_days,
            }
        )
    return out


# ── the core fit ──────────────────────────────────────────────────────────────


def test_fit_recovers_separable_taste():
    rng = np.random.default_rng(RNG_SEED)
    theta_true = rng.standard_normal(DIM)
    judgments = synth_judgments(theta_true, 200, rng)

    result = fit_bt_map(judgments, theta_prior=None)

    assert result.converged
    assert result.n_used == 200
    assert result.n_skipped == 0
    assert result.dim == DIM
    assert result.train_accuracy is not None and result.train_accuracy >= 0.95
    # The fitted direction aligns with the ground truth.
    cos = float(
        result.theta @ theta_true / (np.linalg.norm(result.theta) * np.linalg.norm(theta_true))
    )
    assert cos > 0.8


def test_neither_and_both_are_skipped_not_learned():
    rng = np.random.default_rng(RNG_SEED)
    theta_true = rng.standard_normal(DIM)
    judgments = synth_judgments(theta_true, 20, rng)
    judgments.append({**judgments[0], "choice": "neither"})
    judgments.append({**judgments[1], "choice": "both"})

    result = fit_bt_map(judgments, theta_prior=None)
    assert result.n_used == 20
    assert result.n_skipped == 2


def test_zero_usable_judgments_returns_the_prior():
    prior = [0.5] * DIM
    result = fit_bt_map(
        [{"phi_a": [0.0] * DIM, "phi_b": [0.0] * DIM, "choice": "neither"}],
        theta_prior=prior,
    )
    assert result.n_used == 0
    assert result.train_accuracy is None
    assert np.allclose(result.theta, prior)


# ── prior behavior (§8.2: regularize toward θ_H, relax as n grows) ────────────


def test_prior_dominates_at_low_n():
    rng = np.random.default_rng(RNG_SEED)
    theta_true = rng.standard_normal(DIM)
    prior = -theta_true  # the house disagrees with this designer completely

    few = fit_bt_map(synth_judgments(theta_true, 3, rng), theta_prior=prior.tolist())
    many = fit_bt_map(synth_judgments(theta_true, 300, rng), theta_prior=prior.tolist())

    def cos_to_prior(theta: np.ndarray) -> float:
        return float(theta @ prior / (np.linalg.norm(theta) * np.linalg.norm(prior)))

    # 3 judgments barely move θ off the house; 300 pull it to the designer.
    assert cos_to_prior(few.theta) > 0.9
    assert cos_to_prior(many.theta) < 0.5
    # λ relaxes with n: λ = 0.5·30/(30+n)
    assert np.isclose(few.lambda_used, 0.5 * 30 / 33)
    assert np.isclose(many.lambda_used, 0.5 * 30 / 330)


def test_null_prior_means_zero_vector():
    rng = np.random.default_rng(RNG_SEED)
    theta_true = rng.standard_normal(DIM)
    judgments = synth_judgments(theta_true, 50, rng)
    a = fit_bt_map(judgments, theta_prior=None)
    b = fit_bt_map(judgments, theta_prior=[0.0] * DIM)
    assert np.allclose(a.theta, b.theta, atol=1e-8)


# ── decay (§8.2: w_t = r_t · exp(−Δt/τ), τ = 180 d) ──────────────────────────


def test_decay_lets_recent_judgments_beat_stale_ones():
    rng = np.random.default_rng(RNG_SEED)
    theta_true = rng.standard_normal(DIM)
    # The SAME 40 pairs judged twice: two years ago with flipped choices,
    # today following θ*. The evidence conflicts irreconcilably pair-by-pair,
    # so only the decayed weights (stale block ≈ 1.7% each at τ=180) decide.
    fresh = synth_judgments(theta_true, 40, rng, age_days=0.0)
    stale = [
        {**j, "age_days": 730.0, "choice": "b" if j["choice"] == "a" else "a"} for j in fresh
    ]

    result = fit_bt_map(stale + fresh, theta_prior=None)
    # Every prediction lands on the FRESH label (the stale copy is outweighed):
    # train accuracy is exactly the fresh share of total weight.
    fresh_only = fit_bt_map(fresh, theta_prior=None)
    cos = float(
        result.theta
        @ fresh_only.theta
        / (np.linalg.norm(result.theta) * np.linalg.norm(fresh_only.theta))
    )
    assert cos > 0.95  # decayed conflict leaves the fresh direction intact

    # n_effective reflects the decay: 40·exp(−730/180) + 40·1.0 ≈ 40.7
    expected = 40 * np.exp(-730.0 / 180.0) + 40.0
    assert np.isclose(result.n_effective, expected, rtol=1e-6)

    # Without decay (τ → ∞) the same conflicting evidence cancels to ~zero.
    no_decay = fit_bt_map(stale + fresh, theta_prior=None, tau_days=1e9)
    assert float(np.linalg.norm(no_decay.theta)) < 0.1 * float(
        np.linalg.norm(result.theta)
    )


def test_event_weights_scale_the_loss():
    rng = np.random.default_rng(RNG_SEED)
    theta_true = rng.standard_normal(DIM)
    # A weight-2.0 correction pair counts double in n_effective.
    j = synth_judgments(theta_true, 10, rng, weight=2.0)
    result = fit_bt_map(j, theta_prior=None)
    assert np.isclose(result.n_effective, 20.0)


# ── backtest (§8.3 chronological split / §14.4 dial gate) ─────────────────────


def test_backtest_scores_high_on_separable_history():
    rng = np.random.default_rng(RNG_SEED)
    theta_true = rng.standard_normal(DIM)
    # Chronology: older judgments have larger age_days. n_train must clear the
    # 94-d basis for held-out generalization (n < d would just interpolate).
    judgments = []
    for i in range(400):
        judgments += synth_judgments(theta_true, 1, rng, age_days=float(400 - i))

    result = backtest(judgments, theta_prior=None, test_fraction=0.3)
    assert result.n_train == 280
    assert result.n_test == 120
    # Deterministic seed → exact run-to-run repeatability. 0.80 clears the
    # §14.4 bar (≥ 0.72 @ 300) with margin; the τ-decay legitimately shrinks
    # the effective training mass (ages here run to 400 d).
    assert result.pairwise_accuracy >= 0.80
    assert result.auc is not None and result.auc >= 0.85
    # A zero prior is chance on held-out data — the §14.4 gap is real.
    assert abs(result.prior_accuracy - 0.5) < 0.25
    assert result.pairwise_accuracy - result.prior_accuracy >= 0.05


def test_backtest_prior_beats_fit_when_prior_is_the_truth():
    rng = np.random.default_rng(RNG_SEED)
    theta_true = rng.standard_normal(DIM)
    judgments = []
    for i in range(60):
        judgments += synth_judgments(theta_true, 1, rng, age_days=float(60 - i))
    result = backtest(judgments, theta_prior=theta_true.tolist(), test_fraction=0.3)
    # θ_H IS the ground truth here: the held-out prior accuracy is perfect.
    assert result.prior_accuracy >= 0.99
    assert result.pairwise_accuracy <= result.prior_accuracy + 1e-9


def test_pairwise_auc_handles_one_class():
    X = np.ones((3, 2))
    y = np.ones(3)
    assert pairwise_auc(np.ones(2), X, y) is None


# ── HTTP wire (auth + shapes; embedder never touched) ─────────────────────────


def http_fit_payload(n=6):
    rng = np.random.default_rng(7)
    theta_true = rng.standard_normal(DIM)
    return {
        "designer": {"theta_prior": None},
        "judgments": synth_judgments(theta_true, n, rng),
        "hyper": {"tau_days": 180, "lambda0": 0.5, "lambda_n0": 30},
    }


def test_fit_taste_requires_bearer_token(client):
    assert client.post("/fit/taste", json=http_fit_payload()).status_code == 401
    assert (
        client.post(
            "/fit/taste", json=http_fit_payload(), headers={"Authorization": "Bearer wrong"}
        ).status_code
        == 401
    )


def test_fit_taste_wire_shape(client):
    res = client.post("/fit/taste", json=http_fit_payload(), headers=AUTH)
    assert res.status_code == 200
    body = res.json()
    assert len(body["theta"]) == DIM
    assert body["converged"] is True
    assert body["n_used"] == 6
    assert body["n_skipped"] == 0
    assert body["n_effective"] > 0
    assert 0.0 <= body["train_accuracy"] <= 1.0
    assert body["dim"] == DIM


def test_fit_taste_rejects_mismatched_dims(client):
    payload = http_fit_payload(2)
    payload["judgments"][1]["phi_a"] = [0.0] * (DIM - 1)
    res = client.post("/fit/taste", json=payload, headers=AUTH)
    assert res.status_code == 400


def test_backtest_wire_shape(client):
    payload = http_fit_payload(30)
    payload["test_fraction"] = 0.3
    res = client.post("/fit/taste/backtest", json=payload, headers=AUTH)
    assert res.status_code == 200
    body = res.json()
    assert body["n_train"] + body["n_test"] == 30
    assert 0.0 <= body["pairwise_accuracy"] <= 1.0
    assert 0.0 <= body["prior_accuracy"] <= 1.0


def test_backtest_rejects_too_few_judgments(client):
    payload = http_fit_payload(2)
    res = client.post("/fit/taste/backtest", json=payload, headers=AUTH)
    assert res.status_code == 400
