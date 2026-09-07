# T0 TYPES — Wave 2 handshake notes

Date: 2026-09-07. Lane: T0 (types-first handshake), backend worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w2-backend`
(branch `agreement/w2-backend`).

## What shipped

One file touched: `packages/types/src/agreement.ts`, extended (never rewritten).
Every existing W1 export is byte-identical — the diff is pure addition after
`StudioAgreementDefaults`. No `packages/types/src/index.ts` edit was needed:
its barrel already does `export * from "./agreement"` (line 37), and none of
the new names collide with anything already exported from the package (grepped
across `packages/types/src/*.ts`).

Additions, grouped by the Wave 2 proposal item they serve:

- **P5 (fee schedules)** — the four W2 schedule payloads not already in W1's
  file: `PercentPayload` (percent_of_cost / percent_of_spend, one editor with
  a `basis` toggle per build-sheet §4.1), `CostPlusPayload`, `DayRatePayload`,
  `PackagePayload`. All four are record-only in W2 (R9) — no terms
  projection, no authority column, no consent fragment; the doc comments say
  so. The other eleven schedule payloads (rate_card, ceiling, retainer,
  cadence, flat, per_phase, procurement, pricing_basis, draws, allowances)
  already existed from W1 and were left untouched.
- **P4 (the Library)** — `AgreementTemplatePartEntry` (one entry of
  `agreement_templates.parts`: an inline body or a `studio.*` reference, with
  optional `required`/`clientVisible` overrides — build-sheet §3.2 step 4),
  `AgreementTemplate` (`public.agreement_templates` row shape), and
  `StudioAgreementPart` (`public.studio_agreement_parts` row shape).
- **P8 (change history)** — `AGREEMENT_PART_EVENT_ACTIONS` (the CHECKed
  action vocabulary: added/edited/removed/reordered/renamed/materialized)
  and `AgreementPartEvent` (`public.agreement_part_events` row shape).
- **P6 (the client's copy from parts, R12)** — `AgreementExecutionSnapshot`
  (`public.agreement_execution_snapshots` row shape: html, partSet,
  documentHash, createdAt).

## What was deliberately NOT added here

- `ConsentPart` — the build sheet (§5.1) defines this directly in
  `apps/client-portal/src/components/threshold/consent-copy.ts`, an
  ADD-ONLY file the client lane owns; it is not a `packages/types` export.
- Any edit to `packages/types/src/commercial.ts` — the W2 backend lane's
  `packages/types` pathspec (build-sheet §2) lists only `agreement.ts` and
  `index.ts`. The four new columns on `proposal_service_terms` /
  `project_billing_authorities` (`retainerCreditRule`, `feeBasis`,
  `feeAmountCents`, `feeSchedule`) are consumed directly off RPC results by
  the backend lane's own hooks (`use-agreement-library.ts`,
  `use-agreement-part-events.ts`) and are out of this lane's file list.
- `AUTHORITY_VARIANTS`, `AGREEMENT_PART_KINDS`, `AGREEMENT_SCHEDULE_VARIANTS`,
  `AGREEMENT_TEMPLATE_CLASSES`, `PATINA_STANDARD_AGREEMENT_PARTS`,
  `AGREEMENT_PART_COPY` (in the separate `agreement-copy.ts`, also W1) — all
  W1, already shipped, untouched.

## Gates run (backend worktree)

```
pnpm --filter @patina/types type-check   → clean, no output
pnpm turbo build --filter=@patina/types  → 1 successful, 1 total (cache miss, fresh build)
```

## Handshake

- Commit `68532c2a140586c88d3448d81bebffda3fc6ef34` — "feat(types): agreement
  parts vocabulary and payloads (T0)" — on `agreement/w2-backend`.
- Cherry-picked cleanly (no conflicts) onto `agreement/w2-designer` and
  `agreement/w2-client`, landing as `213686f399cf6f9635daf1dbad03dd822e3786e4`
  on both (cherry-pick mints a new commit object; content is identical).
- `pnpm turbo build --filter=@patina/types` re-run in all three worktrees —
  designer and client both hit the shared turbo cache (`FULL TURBO`, same
  content hash `a61c55641db1eaff` as the backend build) and each worktree's
  own `packages/types/dist/agreement.d.ts` was confirmed on disk (own
  timestamp, `AgreementTemplate` present in all three).

## Advisory

`git commit` printed a Prettier formatting warning on `agreement.ts`
("Staged files have formatting drift; this is advisory locally"). Checked:
the same warning fires against W1's pre-existing content in this file too
(single-quoted strings, condensed one-line interfaces) — it is a pre-existing
repo/file convention mismatch, not something this change introduced. Left
as-is rather than running `prettier --write` across the whole file, which
would have reformatted W1's untouched exports and broken the "keep every
existing export byte-identical" instruction.
