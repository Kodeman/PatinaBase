# Field Companion · Wave 2 — "Nothing the app says about a capture is a lie"

Wave 2 removed the three places where Patina Field asserted something false about a capture, and
paid the frozen-seam debt in one commit while a `ContentState` shape change was still free.

- **Branch:** `feat/field-companion-w2`
- **Plan:** `../../plans/wave-2-plan.md` (7 tasks, Task 0 pre-flight → Task 6 wave gate)
- **Plan review:** `../../plans/wave-2-plan-review.md` (fully applied before execution)
- **Spec:** `../../field-companion-package.md` · **Rulings:** `../../field-companion-rulings.md`
  (ratified by Kody 2026-08-24 — all decided, none re-opened here)
- **Wave report:** `../../wave-2-report.md`

## What is in this directory

| File | What it holds |
|---|---|
| `progress.md` | The SDD ledger — every dispatch, gate result, review verdict, fix round and ruling, in the order it happened. The recovery map. |
| `rulings-index.md` | Every `Ruling:` the conductor made, with what each costs if it was wrong. |
| `device-pass.md` | The C5 device pass: which criteria were exercised, which were not, and why. |

## Method

Executed with `superpowers:subagent-driven-development`: a fresh implementer per task, a
separate-context reviewer per task, a bounded fix loop, and a whole-branch review at the end. The
implementer never reviewed its own work. Every gate ran in the foreground through one wrapper
(`capture-gate.sh`'s three steps against a per-worktree DerivedData path, plus an explicit
`swiftlint lint --quiet --strict`, because a green `capture-gate.sh all` does not prove lint ran).
