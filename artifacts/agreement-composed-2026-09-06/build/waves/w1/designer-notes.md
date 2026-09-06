# Wave 1 · designer lane — notes

Branch `agreement/w1-designer` · worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w1-designer`
Base `4c0b7b17b` + the T0 types commit `bab1b9b92`
(`feat(types): agreement parts vocabulary and payloads (T0)`), which was
already cherry-picked onto the branch when the lane opened.

## What shipped, per build-sheet §2.2

| Item | Where | Commit |
|---|---|---|
| Flag-off snapshot, generated on the UNMODIFIED room | `…/drafting/service-agreement-drafting-room.test.tsx` + `__snapshots__/` | `ba80eee66` |
| P0 · DTO collapse onto `@patina/types` + F-2 nullability | `lib/document/commercial-documents.ts`, `hooks/use-commercial-documents.ts`, `project-authority-band.tsx`, `money-region.tsx`, `service-agreement-preview.tsx` | `d22154b64` |
| P2 · `assessAgreementReadiness` + the R4 floor | `…/drafting/agreement/readiness.ts`, `part-kinds.ts` | `7ec84085b` |
| Part renderer + preview `parts` prop + the "Not yet set" fix | `commercial/agreement-parts-body.tsx`, `commercial/service-agreement-preview.tsx` | `82df3d974` |
| Bundle gains `parts`; `useSaveAgreementParts`, `useMaterializeStandardParts` | `hooks/use-commercial-documents.ts` | `9a9cf78bc` |
| P1 · `AgreementComposer` + rail + editors + add menu + the flag branch | `…/drafting/agreement/*`, `service-agreement-drafting-room.tsx` | `67bf4d825` |
| P3 · Account → Studio "Agreement defaults" card | `account/account-studio-page.tsx`, `hooks/use-studio-agreement-defaults.ts` | `fedd8542a` |
| E2E walk + its derived Playwright config | `e2e/agreement/agreement-parts.spec.ts`, `playwright.agreement.config.ts` | `2c2692a91` |
| Ink token + account-suite stub | `parts-rail.tsx`, `account/__tests__/account-studio-page.test.tsx` | `c7cc6e209` |

## Flag-off byte-identity — how it is evidenced

The snapshot in `__snapshots__/service-agreement-drafting-room.test.tsx.snap`
was written by running the suite against the room **before any W1 edit
touched it**, and committed in `ba80eee66` — a commit that changes only the
test file and the snapshot. The flag branch landed four commits later
(`67bf4d825`); the snapshot passed unchanged on the re-run and again on the
full suite. A snapshot written after the change would have proved nothing,
which is why it is its own commit at the head of the lane.

The room's only edits are: one `useFeatureFlag` call above every early
return, `flagLoading` folded into the existing loading branch (same component,
same string), and one `if (partsOn) return <AgreementComposer …>` before the
existing `ServiceAgreementEditor` call, which is byte-identical. Plus one
`?? 0` on `dollars(terms.billingCeilingCents)`, forced by the P0 widening; the
seven-facet room's `emptyTerms` writes `0` and its hook writes an integer, so
the rendered value is unchanged (the snapshot confirms it).

## Decisions and deviations to review

1. **Parts hooks are app-local, not `@patina/supabase`.** §2.2 assigns
   `useSaveAgreementParts` / `useMaterializeStandardParts` to
   `apps/designer-portal/src/hooks/use-commercial-documents.ts` (this lane);
   §2.4's hook table lists the same names under `@patina/supabase` (the
   backend lane). §2.2 is the per-lane source of truth, and this lane may not
   touch `packages/**`, so they are app-local, next to
   `useSaveServiceAgreement`, and they read/write the same RPCs with the same
   argument names. **Integration decision owed**: keep one or collapse onto
   the package hook.
2. **`useStudioAgreementDefaults` is app-local for the same reason**
   (`apps/designer-portal/src/hooks/use-studio-agreement-defaults.ts`). §2.1
   gives the package hook to the backend lane and §2.2 gives the card to this
   one; the card could not be built and gated without a hook. Its query key is
   the frozen interface's key — `['studio-agreement-defaults', studioId]` — so
   the two are the same cache, and collapsing is a one-line import swap.
3. **Both new reads fail soft on a missing relation.**
   `fetchAgreementParts` and `useStudioAgreementDefaults` resolve to `[]` /
   the platform defaults when the table is absent, instead of throwing. 00575
   lands on Strata separately from the Worker, and a portal in that window
   must render exactly what it rendered before — this is also what makes the
   flag-off Contract Room and the Account page survive the gap. Every other
   read in the bundle still throws.
4. **`ServiceAgreementSendSheet` gained an optional `readinessOverride`.**
   Not in §2.2's file list. Without it, the sheet computes readiness with
   `assessServiceAgreementReadiness`, which demands a role rate AND a ceiling
   unconditionally — a false-red that would refuse a send a legitimately
   flat-fee composition is entitled to under R4 (walk step 12's flat-fee leg).
   The prop is omitted on the flag-off path, so nothing moves there.
5. **`project-authority-band.tsx` and `money-region.tsx` were edited**, also
   outside §2.2's list, because F-2 widens `ceilingCents` / `remainingCents`
   to `number | null` and both printed `money(remainingCents)`. They now print
   `No ceiling` / `no ceiling` rather than `$0` — review criterion N.
6. **`playwright.config.ts` was NOT edited.** The pre-commit secret scan reads
   a changed file's full staged content and that file carries the local demo
   `service_role` JWT, so any edit to it is blocked
   (`feedback_playwright_config_secret_scan_trap.md`). The flag override lives
   in a derived config, `apps/designer-portal/playwright.agreement.config.ts`,
   the same shape as `playwright.ship-bar.config.ts`. Run the spec with
   `--config playwright.agreement.config.ts`.
7. **R-5 is implemented exactly as §4.4 states it** — "at least one part whose
   `variant` is in `AUTHORITY_VARIANTS` and whose typed value is set". Note
   for the reviewer: `AUTHORITY_VARIANTS` includes `cadence` and `retainer`,
   so a materialized agreement with cadence `monthly` and a `0` retainer
   satisfies R-5 even though it names no fee. That is what the frozen rule and
   its test table say (`ceiling only` and `flat only` are both expected
   `ready: true`), so it was implemented as written rather than narrowed to
   rate_card/flat/per_phase — which is what the blocker *sentence* names.
   Flagging it rather than deviating.
8. **"N of M parts need attention" counts distinct parts carrying a blocker.**
   Blockers that belong to no part (kind, state, the R-5 class floor) are
   rendered as their own lines under the count; the client-account blocker is
   excluded from the count, exactly as the seven-facet counter excludes it.
9. **No help-copy drift fix.** The build sheet assigns none to this lane;
   grep found no help-system copy naming the seven facets or the Contract
   Room's counter.
10. **`kind`/`variant` are handled defensively everywhere.** They are
    un-CHECKed vocabulary columns, so the mapper, the readiness pass, both
    editors' dispatch, and the renderer all fall through to a read-only card /
    a muted line rather than throwing. Covered by tests in all three files.

## Gates — commands run and their real output

Run from a bare `cd` into the worktree.

```
pnpm --filter @patina/designer-portal type-check
  → tsc --noEmit, no output, exit 0

pnpm --filter @patina/designer-portal lint
  → 205 problems (2 errors, 203 warnings)
    BOTH errors are pre-existing on `main`, in files this lane never touched:
      src/components/document/rooms/piece/piece-room-save-gate.test.tsx:159
        error  Definition for rule 'import/first' was not found
      src/hooks/__tests__/use-commercial-documents.test.ts:930
        error  React Hook "useSendTradeRfq" is called in function "mutationFnOf" …
    Neither appears in `git diff --name-only 4c0b7b17b..HEAD`.
  Scoped to this lane's files:
    npx eslint <the 13 files this lane changed>
      → 1 problem (0 errors, 1 warning) — a pre-existing unused
        eslint-disable on account-studio-page.tsx's studio-logo <img>,
        untouched, its line number shifted by the new card.

pnpm --filter @patina/designer-portal test -- \
  src/components/document/rooms/drafting/agreement
  → 3 suites, 54 tests, all passed

pnpm --filter @patina/designer-portal test -- \
  src/components/document/rooms/drafting/service-agreement-drafting-room.test.tsx
  → 1 suite, 8 tests passed, 1 snapshot PASSED (flag-off byte-identity)

pnpm --filter @patina/designer-portal test -- src/components/document/account
  → 12 suites, 187 tests, all passed

pnpm --filter @patina/designer-portal test          # THE full suite
  → Test Suites: 521 passed, 521 total
    Tests:       6275 passed, 6275 total
    Snapshots:   2 passed, 2 total
```

Two suites failed on the first full run and were fixed in `c7cc6e209`:

- `src/lib/document/__tests__/contrast.test.ts` — "finds no base pigment spent
  as text anywhere under src/". The rail's required dot used
  `text-[var(--color-clay)]`; it is now `--color-clay-ink`. A real F56 catch.
- `src/components/document/account/__tests__/account-studio-page.test.tsx` —
  that suite renders the page with no `QueryClientProvider`, so the new
  defaults hook's `useQuery` threw. Stubbed there the way every other hook on
  that page already is; the card's own behaviour is covered in
  `agreement-defaults-card.test.tsx`.

## Not verified

- **The e2e spec was never executed.** It needs migration 00575 on the local
  stack (`proposal_agreement_parts`, `materialize_standard_parts`,
  `upsert_agreement_parts`), which is the backend lane's, and this lane is
  forbidden from writing to the shared local stack. Grepped for
  `page.waitForTimeout` in `e2e/agreement/` — none; DB assertions use
  `expect.poll` through `e2e/helpers/supabase-admin.ts`.
- **No live-data walk.** `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live
  pnpm dev:minimal` was not run — same reason: the tables do not exist yet on
  the shared stack. Everything above is type-check, lint and jest.
- **Only chromium is contemplated for e2e**, by design (the spec is
  chromium-pinned).
- **`pnpm --filter @patina/admin-portal build`** — the repo's strictest gate
  for a `@patina/types` change — was NOT run here. This lane changed no
  `packages/**` file (the types commit is the backend lane's T0), but the
  integration step should still run it.
- **`@patina/types` dist**: the lane's turbo build was done at worktree
  bootstrap (env.md); no further `packages/**` edit was made, so no rebuild
  was needed.

## Files this lane changed

```
apps/designer-portal/playwright.agreement.config.ts                    (new)
apps/designer-portal/e2e/agreement/agreement-parts.spec.ts             (new)
apps/designer-portal/src/components/document/account/account-studio-page.tsx
apps/designer-portal/src/components/document/account/__tests__/account-studio-page.test.tsx
apps/designer-portal/src/components/document/account/__tests__/agreement-defaults-card.test.tsx   (new)
apps/designer-portal/src/components/document/commercial/agreement-parts-body.tsx                  (new)
apps/designer-portal/src/components/document/commercial/agreement-parts-body.test.tsx             (new)
apps/designer-portal/src/components/document/commercial/money-region.tsx
apps/designer-portal/src/components/document/commercial/project-authority-band.tsx
apps/designer-portal/src/components/document/commercial/service-agreement-preview.tsx
apps/designer-portal/src/components/document/commercial/service-agreement-send-sheet.tsx
apps/designer-portal/src/components/document/rooms/drafting/service-agreement-drafting-room.tsx
apps/designer-portal/src/components/document/rooms/drafting/service-agreement-drafting-room.test.tsx
apps/designer-portal/src/components/document/rooms/drafting/__snapshots__/service-agreement-drafting-room.test.tsx.snap  (new)
apps/designer-portal/src/components/document/rooms/drafting/agreement/agreement-composer.tsx      (new)
apps/designer-portal/src/components/document/rooms/drafting/agreement/parts-rail.tsx              (new)
apps/designer-portal/src/components/document/rooms/drafting/agreement/part-editor.tsx             (new)
apps/designer-portal/src/components/document/rooms/drafting/agreement/add-part-menu.tsx           (new)
apps/designer-portal/src/components/document/rooms/drafting/agreement/part-kinds.ts               (new)
apps/designer-portal/src/components/document/rooms/drafting/agreement/readiness.ts                (new)
apps/designer-portal/src/components/document/rooms/drafting/agreement/__tests__/readiness.test.ts (new)
apps/designer-portal/src/components/document/rooms/drafting/agreement/__tests__/agreement-composer.test.tsx (new)
apps/designer-portal/src/components/document/rooms/drafting/agreement/__tests__/parts-rail.test.tsx        (new)
apps/designer-portal/src/hooks/use-commercial-documents.ts
apps/designer-portal/src/hooks/use-studio-agreement-defaults.ts                                   (new)
apps/designer-portal/src/lib/document/commercial-documents.ts
apps/designer-portal/src/lib/document/__tests__/commercial-documents.test.ts
```

Nothing under `packages/**`, `supabase/**` or `apps/client-portal/**` was
touched by this lane. `git diff --stat 4c0b7b17b..HEAD` on
`account-studio-page.tsx` reports **448 insertions, 0 deletions** — the
Billing card is untouched, byte for byte.

## Review criteria this lane can speak to

- **S · DTO collapse behaviour.** `COMMERCIAL_DOCUMENT_KINDS` widened with
  `'trade_scope'`, so `asCommercialDocumentKind('trade_scope')` now returns
  `'trade_scope'` instead of coercing to `'legacy'`. Every branch found by
  `grep -rn "document_kind\b" apps/designer-portal/src` calls
  `commercialDocumentExperience(row.document_kind)` on the RAW string, not the
  coerced kind, and that function routes `'trade_scope'` through its
  `default:` to `'legacy'` — the same answer as before. The two consumers of
  the coerced value (`mapDocument().kind` → readiness/preview;
  `proposalGuideFacts.documentKind` → `document-guide*.ts`) compare against
  `'design_services'` / `'service_addendum'` only, which `'trade_scope'` fails
  either way. Two pinned cases added in
  `lib/document/__tests__/commercial-documents.test.ts`.
- **J · flag-off byte-identity, designer.** See the section above.
- **L / M · readiness false-green and false-red.** 27 cases in
  `readiness.test.ts`, one per rule row plus the flat-fee and uncapped
  positives. The DB half of L is the backend lane's.
- **T · unknown-kind resilience.** Covered three times: the composer opens
  `kind: 'wormhole'` in `UnsupportedPartCard`, the renderer prints one muted
  line, and readiness returns `ready: true` — none throws, none prints JSON.
- **V · vocabulary.** No "clause library", no "contract builder", no "facet"
  in composer copy; no badge, count chip, red/green, checkmark or emoji. The
  required marker is a mono middot in `--color-clay-ink`, and a blocked row
  reads `needs attention` in the aged-oak mono register.
- **U · wave leakage.** No `save_agreement_part`,
  `save_agreement_as_template`, `materialize_agreement_template`,
  `studio_agreement_parts`, `agreement_templates`, `compose_agreement_consent`
  or `agreement_execution_snapshots` anywhere in this lane's diff. The add
  menu offers blank kinds only; `Save as template…` is not rendered.
