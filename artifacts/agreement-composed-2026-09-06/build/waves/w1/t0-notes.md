# T0 TYPES lane — notes (Wave 1, "The Agreement, Composed")

Date: 2026-09-06. Scope: `packages/types` only (contract.md §1, build-sheet §2.4 + §2.1 + §4.6).

## What shipped

Commit `13bc4445c94a280f9c273e80fcc3e40cc57a01da` on `agreement/w1-backend`
("feat(types): agreement parts vocabulary and payloads (T0)"), cherry-picked
onto `agreement/w1-designer` (`bab1b9b92…`) and `agreement/w1-client`
(`4c46fd97e…`) — identical diff on all three (both cherry-picks applied
clean, no conflicts).

Files (all three worktrees, same three paths):

- `packages/types/src/agreement.ts` (new) — transcribed verbatim from
  build-sheet.md §2.4 (frozen cross-lane interface): `AGREEMENT_PART_KINDS`,
  `AGREEMENT_SCHEDULE_VARIANTS`, `AGREEMENT_TEMPLATE_CLASSES`,
  `AUTHORITY_VARIANTS`, every payload interface (`ClausePayload` …
  `AttestationPayload`), `AgreementPart`, `PATINA_STANDARD_AGREEMENT_PARTS`
  (nine parts, in order), `StudioAgreementDefaults`.
- `packages/types/src/commercial.ts` (modify) — the §4.6 "Move into
  packages/types/src/commercial.ts (backend lane)" edits:
  - `DesignServiceTerms.billingCeilingCents` → `number | null` (NULL =
    uncapped, F-2), `.updatedAt` → `string | null`, new
    `furnishingsDepositPercent: number | null` field with the R8 comment
    carried verbatim from `apps/designer-portal/src/lib/document/
    commercial-documents.ts` (`ServiceAgreementTerms.furnishingsDepositPercent`,
    the app-local interface this collapses onto).
  - `DesignServiceRate.effectiveAt` → `string | null`.
  - `ProjectBillingAuthoritySummary.ceilingCents` and `.remainingCents` →
    `number | null` (F-2). This one is not literally quoted in §4.6's code
    block (which only shows `DesignServiceTerms`/`DesignServiceRate`), but
    the surrounding prose ("`ProjectBillingAuthority.ceilingCents` and
    `.remainingCents` widen to `number | null`") names a type that only
    exists in `packages/types/src/commercial.ts` — and the designer lane's
    "May not touch: packages/**" forecloses it doing this edit — so the
    widening at the source has to land here. Grepped
    `packages/types/src` and `packages/supabase/src` for other
    `ceilingCents`/`remainingCents`/`billingCeilingCents`/`effectiveAt`
    readers within this lane's own scope: none found (all consumers live in
    `apps/designer-portal`, which is the designer lane's grep-every-reader
    obligation per contract.md:522 and build-sheet §4.6 items 1-3).
- `packages/types/src/index.ts` (modify) — one line,
  `export * from "./agreement";`, placed next to the existing
  `export * from "./commercial";` line.

## Gates run (backend worktree, before commit)

```
pnpm --filter @patina/types type-check   # tsc --noEmit — clean, no output
pnpm turbo build --filter=@patina/types  # tsc --build — 1 successful, 1 total
```

Both passed with no errors. After cherry-picking onto designer and client
worktrees, `pnpm turbo build --filter=@patina/types` was re-run in each
(bare `cd <worktree>` per call, never `pnpm --dir <wt> turbo build …` —
matches the `EACCES` gotcha noted in env.md). Both were cache hits against
the same content hash as the backend build (turbo's shared worktree cache),
and the resulting `dist/agreement.js` in both worktrees was inspected
directly and confirmed to contain the new exports (not stale).

## Advisory (non-blocking)

The pre-commit hook printed `[warn] Staged files have formatting drift; this
is advisory locally.` for `agreement.ts` and `commercial.ts` (Prettier
column alignment on the `PATINA_STANDARD_AGREEMENT_PARTS` table literal, in
`agreement.ts`, transcribed verbatim from the build sheet's own aligned
formatting). The commit was not blocked. Downstream lanes: `pnpm lint`
inside `packages/types` will likely flag the same drift if run; a
`prettier --write packages/types/src/{agreement,commercial}.ts` pass (out
of T0's exact-diff scope — the build sheet's code block is quoted verbatim
including its alignment) will silence it whenever a later lane touches
these files again.

## Handshake status

All three worktrees carry the T0 commit and have `@patina/types` built.
Backend lane is now clear to proceed with its migration/RPC/hooks work in
the same worktree; designer and client lanes can `pnpm --filter
@patina/designer-portal type-check` / `pnpm --filter @patina/client-portal
type-check` etc. against the real (non-frozen-text) types starting now.
