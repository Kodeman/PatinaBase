"""BT MAP taste refit (design §8.2) + chronological backtest (§8.3/§14.4).

Pure numpy, deterministic, stateless — the request carries everything
(judgments with precomputed φ features, the prior θ_H, hyperparameters);
the response carries θ_D + diagnostics. No DB access, no model files.

The math (design §8.2, implemented literally):

    θ_D = argmin_θ  Σ_t  w_t · log(1 + exp(−y_t · θᵀΔφ_t))  +  λ‖θ − θ_H‖²

    Δφ_t = φ_a − φ_b                  (φ per 00244's _aesthete_phi — the 94-d
                                       basis; the ordering contract lives in
                                       SQL and callers pass φ through verbatim)
    y_t  = +1 if choice = 'a', −1 if choice = 'b'
           ('neither'/'both' carry no pairwise preference — skipped, counted)
    w_t  = weight · exp(−age_days / τ)         τ = 180 d default
    λ    = λ0 · n0 / (n0 + n)                  λ0 = 0.5, n0 = 30 defaults
    prior mean = θ_H (regularize TOWARD the house, never toward zero;
                 a null prior means the zero vector — cold house, documented)

Solved by damped Newton with a halving line search: the objective is strictly
convex for λ > 0 (Hessian ⪰ 2λI), the dimension is small (94), and Newton
converges in a handful of iterations — no external optimizer dependency.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

MAX_NEWTON_ITER = 50
GRAD_TOL = 1e-6


class FitInputError(ValueError):
    """Caller/config error (mismatched dims etc.) — maps to HTTP 400."""


@dataclass(frozen=True)
class PreparedPairs:
    """Vectorized usable judgments: Δφ rows, outcomes, decayed weights."""

    delta_phi: np.ndarray  # (n, d)
    y: np.ndarray  # (n,) in {+1.0, −1.0}
    w: np.ndarray  # (n,) decayed weights
    n_skipped: int  # 'neither'/'both' rows (no pairwise preference)
    dim: int


@dataclass(frozen=True)
class FitResult:
    theta: np.ndarray
    converged: bool
    n_iter: int
    n_used: int
    n_skipped: int
    n_effective: float
    train_accuracy: float | None
    lambda_used: float
    dim: int


@dataclass(frozen=True)
class BacktestResult:
    pairwise_accuracy: float
    auc: float | None
    prior_accuracy: float
    prior_auc: float | None
    n_train: int
    n_test: int


def _sigmoid(z: np.ndarray) -> np.ndarray:
    # Numerically stable σ.
    out = np.empty_like(z, dtype=np.float64)
    pos = z >= 0
    out[pos] = 1.0 / (1.0 + np.exp(-z[pos]))
    ez = np.exp(z[~pos])
    out[~pos] = ez / (1.0 + ez)
    return out


def prepare_pairs(
    judgments: list[dict],
    tau_days: float,
    expected_dim: int | None = None,
) -> PreparedPairs:
    """Validate + vectorize. Raises FitInputError on dimension mismatches."""
    rows: list[np.ndarray] = []
    ys: list[float] = []
    ws: list[float] = []
    skipped = 0
    dim = expected_dim

    for i, j in enumerate(judgments):
        choice = j["choice"]
        if choice not in ("a", "b"):
            skipped += 1
            continue
        phi_a = np.asarray(j["phi_a"], dtype=np.float64)
        phi_b = np.asarray(j["phi_b"], dtype=np.float64)
        if phi_a.ndim != 1 or phi_b.ndim != 1 or phi_a.shape != phi_b.shape:
            raise FitInputError(
                f"judgment {i}: phi_a/phi_b must be 1-d and equal length "
                f"(got {phi_a.shape} vs {phi_b.shape})"
            )
        if dim is None:
            dim = int(phi_a.shape[0])
        elif int(phi_a.shape[0]) != dim:
            raise FitInputError(
                f"judgment {i}: feature dim {phi_a.shape[0]} != expected {dim}"
            )
        age = float(j.get("age_days") or 0.0)
        weight = float(j.get("weight") if j.get("weight") is not None else 1.0)
        rows.append(phi_a - phi_b)
        ys.append(1.0 if choice == "a" else -1.0)
        ws.append(weight * float(np.exp(-max(age, 0.0) / tau_days)))

    if dim is None:
        dim = 0
    if not rows:
        return PreparedPairs(
            delta_phi=np.zeros((0, dim)),
            y=np.zeros(0),
            w=np.zeros(0),
            n_skipped=skipped,
            dim=dim,
        )
    return PreparedPairs(
        delta_phi=np.vstack(rows),
        y=np.asarray(ys),
        w=np.asarray(ws),
        n_skipped=skipped,
        dim=dim,
    )


def _objective(
    theta: np.ndarray,
    X: np.ndarray,
    y: np.ndarray,
    w: np.ndarray,
    lam: float,
    prior: np.ndarray,
) -> float:
    z = y * (X @ theta)
    # log(1 + e^(−z)) stably: logaddexp(0, −z)
    loss = float(np.sum(w * np.logaddexp(0.0, -z)))
    d = theta - prior
    return loss + lam * float(d @ d)


def fit_bt_map(
    judgments: list[dict],
    theta_prior: list[float] | None,
    tau_days: float = 180.0,
    lambda0: float = 0.5,
    lambda_n0: float = 30.0,
) -> FitResult:
    """Nightly MAP refit per §8.2. theta_prior None → zero-vector prior."""
    expected_dim = len(theta_prior) if theta_prior is not None else None
    pairs = prepare_pairs(judgments, tau_days, expected_dim)
    n = int(pairs.y.shape[0])
    lam = lambda0 * lambda_n0 / (lambda_n0 + n)

    dim = pairs.dim if pairs.dim > 0 else (expected_dim or 0)
    prior = (
        np.asarray(theta_prior, dtype=np.float64)
        if theta_prior is not None
        else np.zeros(dim)
    )

    if n == 0:
        # No pairwise evidence: λ pulls θ exactly to the prior mean.
        return FitResult(
            theta=prior.copy(),
            converged=True,
            n_iter=0,
            n_used=0,
            n_skipped=pairs.n_skipped,
            n_effective=0.0,
            train_accuracy=None,
            lambda_used=lam,
            dim=dim,
        )

    X, y, w = pairs.delta_phi, pairs.y, pairs.w
    theta = prior.copy()
    converged = False
    n_iter = 0
    obj = _objective(theta, X, y, w, lam, prior)

    for n_iter in range(1, MAX_NEWTON_ITER + 1):
        z = y * (X @ theta)
        s = _sigmoid(-z)  # σ(−y·θᵀΔφ)
        grad = -(X.T @ (w * y * s)) + 2.0 * lam * (theta - prior)
        if float(np.max(np.abs(grad))) < GRAD_TOL:
            converged = True
            break
        r = w * s * (1.0 - s)
        H = (X.T * r) @ X + 2.0 * lam * np.eye(X.shape[1])
        try:
            step = np.linalg.solve(H, grad)
        except np.linalg.LinAlgError:  # pragma: no cover — λ>0 keeps H PD
            step = grad / (2.0 * lam)
        # Halving line search (the objective is convex; full Newton steps can
        # overshoot in early iterations on near-separable data).
        t = 1.0
        for _ in range(30):
            cand = theta - t * step
            cand_obj = _objective(cand, X, y, w, lam, prior)
            if cand_obj <= obj:
                theta, obj = cand, cand_obj
                break
            t *= 0.5
        else:  # no descent found — numerically at the optimum
            converged = True
            break

    acc = pairwise_accuracy(theta, X, y)
    return FitResult(
        theta=theta,
        converged=converged,
        n_iter=n_iter,
        n_used=n,
        n_skipped=pairs.n_skipped,
        n_effective=float(np.sum(w)),
        train_accuracy=acc,
        lambda_used=lam,
        dim=int(X.shape[1]),
    )


def pairwise_accuracy(theta: np.ndarray, X: np.ndarray, y: np.ndarray) -> float | None:
    """Fraction of pairs whose outcome θ predicts; exact ties credit 0.5."""
    if X.shape[0] == 0:
        return None
    margin = y * (X @ theta)
    return float(np.mean(np.where(margin > 0, 1.0, np.where(margin == 0, 0.5, 0.0))))


def pairwise_auc(theta: np.ndarray, X: np.ndarray, y: np.ndarray) -> float | None:
    """Rank AUC of p̂ = σ(θᵀΔφ) against the a-wins label. None if one class."""
    if X.shape[0] == 0:
        return None
    labels = y > 0
    n_pos = int(np.sum(labels))
    n_neg = int(labels.shape[0] - n_pos)
    if n_pos == 0 or n_neg == 0:
        return None
    scores = X @ theta  # monotone in p̂ — ranks identical
    order = np.argsort(scores, kind="stable")
    ranks = np.empty_like(order, dtype=np.float64)
    ranks[order] = np.arange(1, len(scores) + 1)
    # Average ranks over ties.
    for v in np.unique(scores):
        mask = scores == v
        if int(np.sum(mask)) > 1:
            ranks[mask] = float(np.mean(ranks[mask]))
    rank_sum_pos = float(np.sum(ranks[labels]))
    u = rank_sum_pos - n_pos * (n_pos + 1) / 2.0
    return float(u / (n_pos * n_neg))


def backtest(
    judgments: list[dict],
    theta_prior: list[float] | None,
    tau_days: float = 180.0,
    lambda0: float = 0.5,
    lambda_n0: float = 30.0,
    test_fraction: float = 0.3,
) -> BacktestResult:
    """Chronological split eval (§8.3/§14.4).

    Judgments are ordered oldest→newest by age_days DESCENDING (stable, so
    equal ages keep caller order). θ is fitted on the older (1−f) block and
    scored on the held-out newest block; θ_H (the prior, zeros when null) is
    scored on the same held-out block — the §14.4 dial-unlock comparison
    (θ_D beats θ_H by ≥ 5 accuracy points) falls out of one call.
    """
    if not 0.0 < test_fraction < 1.0:
        raise FitInputError(f"test_fraction must be in (0, 1), got {test_fraction}")
    usable = [j for j in judgments if j["choice"] in ("a", "b")]
    n = len(usable)
    if n < 3:
        raise FitInputError(f"backtest needs ≥ 3 usable (a/b) judgments, got {n}")

    order = sorted(range(n), key=lambda i: -float(usable[i].get("age_days") or 0.0))
    n_test = max(1, round(n * test_fraction))
    n_train = n - n_test
    if n_train < 2:
        n_test = n - 2
        n_train = 2
    train = [usable[i] for i in order[:n_train]]
    test = [usable[i] for i in order[n_train:]]

    fitted = fit_bt_map(train, theta_prior, tau_days, lambda0, lambda_n0)
    test_pairs = prepare_pairs(test, tau_days, fitted.dim or None)

    prior_vec = (
        np.asarray(theta_prior, dtype=np.float64)
        if theta_prior is not None
        else np.zeros(test_pairs.dim)
    )

    acc = pairwise_accuracy(fitted.theta, test_pairs.delta_phi, test_pairs.y)
    prior_acc = pairwise_accuracy(prior_vec, test_pairs.delta_phi, test_pairs.y)
    return BacktestResult(
        pairwise_accuracy=float(acc if acc is not None else 0.5),
        auc=pairwise_auc(fitted.theta, test_pairs.delta_phi, test_pairs.y),
        prior_accuracy=float(prior_acc if prior_acc is not None else 0.5),
        prior_auc=pairwise_auc(prior_vec, test_pairs.delta_phi, test_pairs.y),
        n_train=n_train,
        n_test=n_test,
    )
