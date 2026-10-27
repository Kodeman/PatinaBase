# Source register and reference provenance

## Authority

| Source | Use |
|---|---|
| User approval and prior feedback, preserved in FOUNDER-DIRECTION.md | Intent and accepted direction |
| Root `AGENTS.md` and `.agents/skills/` | Current repository execution/data/deployment constraints |
| `apps/designer-portal/CLAUDE.md` | Current Document seams plus this branch’s dated Round 8 pointer; its conventions explicitly retire the original pilot flag |
| `docs/vision/VISION.md`, `VISION-DECISIONS.md` | Studio-first product, commercial rules, V22 draft-first sends, related later rulings |
| `docs/design/the-document/DECISIONS.md` | Append-only history; read later corrections, not just seeded rules |
| `docs/design/house-sheet/SPEC.md` | Existing semantic production stocks/type/rhythm and amendments to reconcile with round eight |
| Current source at `ee9c450a5` | What is implemented in source; runtime/deployment remains to be verified |
| Frozen Room Proof 08 | Approved look/flow and representative behavior; local fictional state is not an implementation contract |

## Frozen review material

The original round-eight commit is `e8f92b772b702303e560583bd57ab785a1974b73`; its 52 files were carried onto this integration branch without modification. Earlier linked studies were copied verbatim from the local round-seven review bundle so that the reference's design-history links work in a fresh checkout. They remain history, not competing active specifications.

Included directories under `artifacts/`:

- `room-proof-round8-2026-10-23` — approved target.
- `room-proof-round7-2026-10-23` — cabinetry, configurable responsibility and service acceptance.
- `room-proof-round6-2026-10-22` — practice modes and workflows; includes simulated perspective caveat.
- `room-proof-round5-2026-10-22` — design evidence, Field and integrated room work.
- `room-proof-round4-2026-10-22` — approval/purchasing/correspondence depth.
- `room-proof-round3-2026-10-22`, `room-proof-round2-2026-10-21`, `room-proof-workflows-2026-10-21` — linked evolution and operational mapping.

`evidence/reference-manifest.json` lists repository-relative paths and SHA-256 digests. Do not edit these studies to make a production PR pass. New prototypes/evidence belong in a new dated location. Font licenses and image provenance stay with the original artifacts. No fictional names or prices should be copied into live profiles or defaults.

## Load-bearing source paths

CODEBASE-MAP.md and DOMAIN-CONTRACTS.md identify symbols and paths. [The source inventory](evidence/current-source-inventory.json) records baseline SHA-256 hashes of inspected anchors, not deployment evidence; later instruction-pointer edits do not rewrite that baseline. Additional verification anchors are `apps/designer-portal/package.json`, `next.config.js`, `playwright*.config.ts`, `jest.config.*`, root `package.json`, `scripts/bundle-budget.config.json`, `.github/workflows/ai-quality-gate.yml`, `policy-quality.yml` and `integration.yml`.

The independent review and subsequent source reconciliation are preserved under [review](review/claude-code-plan-review.md), with all findings dispositioned in [the preparation record](PREPARATION-RECORD.md). Reviewer recommendations are evidence to assess, not new authority. In particular, source inspection narrowed claims about DNT/consent, three-level design-build gates, native artifact decoding and linked-worktree tooling.

Known stale guidance was explicitly corrected during preparation: older Next 15 summaries, `(portal)/portal` routing, `the-document-pilot`, and a verification-skill paragraph claiming no CI quality gates. Do not edit unrelated skills as part of this redesign just to repair their historical text; use current source and root instructions, and record any correction that affects a task.

Accessibility target source: [W3C WCAG 2.2 Recommendation](https://www.w3.org/TR/WCAG22/), consulted 23 October 2026. It is a delivery target, not a claim of existing conformance. Prior external design/process references remain attributed in their archived study and were not revalidated as part of this source-focused preparation.
