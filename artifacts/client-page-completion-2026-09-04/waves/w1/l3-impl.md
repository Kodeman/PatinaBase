# L3 — Door acts (implementation report)

Lane: **L3 — Door acts** · worktree `.codex/worktrees/agent-cpc-l3` · branch `client-page-2/l3`
(from `origin/main` @ `26b15145e`).

Absorbs `/proposals` and `/proposals/[id]`: the four answers the old detail route took besides
signing — **Read it in full**, **Ask a question**, **Request a change**, **Decline** — now happen on
the door leaf, in place. Signed instruments in Previously unfold into the same reading.

## What was built

### 1. `components/threshold/instrument-reading.tsx` (new)
The old detail route's read view, extracted so anything can lay it in:
`useClientCommercialDocument(proposalId)` → `<CommercialDocumentShell bundle={…} />` — the same
component and the same `get_client_commercial_document_bundle` read the route rendered.
- loading → "Drawing this paper." (the door's own hold sentence)
- error → "This paper could not be drawn just now. Reload to try again." (`role="alert"`; the exact
  sentence `door-gate.tsx`'s hint already prints on a failed bundle read — no thrown string as content)
- `data === null` or `kind === 'legacy'` → renders nothing (the shell returns null for legacy, so an
  unfold there would be an empty promise)

**This is L5's export**: `import { InstrumentReading } from './instrument-reading'` for executed
instruments in the papers sheet.

### 2. `components/threshold/door-acts.tsx` (new)
A tertiary scored-ink acts row on the leaf (mock's `.acts` / `si ter` idiom: `aria-expanded` +
`aria-controls` on one panel region), each act unfolding in place — no dialog, no route, no header.
One panel open at a time.

| Act | Hook | Payload |
|---|---|---|
| Read it in full | `InstrumentReading` (above) | — (omitted entirely for `kind === 'legacy'`) |
| Ask a question | `useStartProjectThread` → `useSendMessage` | `mutateAsync(projectId)` then `{ threadId, body }` |
| Request a change | `useRequestProposalChange` | `{ proposalId, feedback }` |
| Decline (non-legacy) | `useDeclineCommercialDocument(proposalId, projectId)` | `mutateAsync(reason \| undefined)` → `POST /api/proposals/[id]/decline` |
| Decline (legacy) | `useDeclineProposal` | `{ proposalId, reason }` |

Decline branches exactly as `app/proposals/[id]/page.tsx` branched it (`CommercialDeclineDialog` for
non-legacy, `ProposalDeclineDialog` for legacy). On success it stamps `Declined <day month>.` in
place (`data-testid="door-declined"`) and the three asks stop being offered; the door itself then
leaves the page on the next proposals refetch (the decline invalidations already do that).
Change/ask print a one-line receipt (`data-testid="door-acts-receipt"`).

**Ask a question is a letter, not a route.** `ProposalClarifyButton` started the project thread and
then navigated to `/messages?thread=…`; the thread is still started with the same
`rpc_start_project_thread` hook and the question is posted into it from the page.

### 3. `components/threshold/door-gate.tsx` (edited — 2 hunks)
Import + one mount inside the leaf, after `SpineGate`, guarded by `!signedAt` so the acts leave with
the leaf when the door opens on her name. No other change.

### 4. `components/threshold/previously.tsx` (edited — 3 hunks)
An instrument receipt is now always foldable and unfolds into `InstrumentReading` instead of its own
label. The proposal id comes from the receipt id `instrument:<proposalId>` that `threshold.tsx:310`
mints and `deriveThreshold` carries through untouched. A note (or an instrument entry with any other
id shape) keeps the old label unfold exactly.

## Copy sources (byte-copied unless noted)

| String | Source |
|---|---|
| "Decline this document?" / "Your studio will be notified. You can share a reason to help them respond — this is optional." / "Reason (optional)" / "What’s holding you back?" / "Decline document" | `components/commercial-document-shell.tsx` `CommercialDeclineDialog` |
| "Decline this proposal?" / "Your designer will be notified…" / "Decline proposal" / "Failed to decline proposal" | `components/proposals/ProposalDeclineDialog.tsx` |
| "Request a change" / "Tell your designer what you’d like adjusted. This won’t decline the proposal — it stays open while they take a look." / "Your note" / "What would you like to change?" / "Send note" / "Add a note so your designer knows what to change." / "Failed to send your note" / receipt "Your note was sent" | `components/proposals/ProposalRequestChangeDialog.tsx` (its `toast({description:'Your note was sent'})` becomes an in-place receipt line — the Threshold has no toast) |
| "Ask a question" (act label) | `components/proposals/ProposalClarifyButton.tsx` |
| 1000-char caps + "n / 1000" counters | all three dialogs |
| "Drawing this paper." / "This paper could not be drawn just now. Reload to try again." | `components/threshold/door-gate.tsx` hint |

**New copy** (the old surface had none, because it navigated instead of composing): the ask panel's
description "Your question goes to your studio as a letter. It won’t decline the paper — it stays
open while they answer.", field label "Your question", placeholder "What would you like to know?",
validation "Add a question so your studio knows what to answer.", receipt "Your question was sent.",
the no-project hold "This paper is not filed under a project, so there is no thread to ask in.", the
declined stamp "Declined <day month>.", and "Never mind" in place of the dialogs' "Cancel" (house
voice for a dismiss — the confirmation copy itself is unchanged).

## Tests

- `__tests__/door-acts.test.tsx` (new, 11 tests) — the four acts offered; no reading on a legacy row;
  read unfolds/folds; ask starts the thread and posts the body; ask validates; change sends the old
  payload + receipt; change validates; commercial decline hits the decline route and stamps the day;
  legacy decline hits `decline_proposal` with `reason: undefined`; declined stops asking; a refused
  decline says why and keeps the typed words; no project → the ask is held.
- `__tests__/instrument-reading.test.tsx` (new, 5 tests) — holds while in flight; refusal sentence on
  error; renders the **real** `CommercialDocumentShell` over a real bundle fixture; silent on legacy;
  silent on a null read.
- `__tests__/previously.test.tsx` (+1 test) — a signed instrument unfolds into the reading with the
  right proposal id, and folds back. `../instrument-reading` stubbed.
- `__tests__/door-gate.test.tsx` (+2 tests) — the acts hang on the leaf while the paper is asking,
  and go with the leaf once it is signed. `../door-acts` stubbed.
- `__tests__/threshold.test.tsx` (+1 mock block, no test changes) — `jest.mock('../door-acts')`
  returning null. **Required**: that file mocks `@patina/supabase` and `use-commercial-client` with
  named `jest.fn()`s and `resetMocks: true` wipes factory implementations, so a real `DoorActs` under
  it would read `.isPending` off `undefined`. Integration lane: this is the only shared-file edit in
  the lane and it is 6 additive lines beside the other `jest.mock` calls.

## Gate output (verbatim)

`pnpm --dir …/apps/client-portal type-check`
```
> @patina/client-portal@0.1.0 type-check /Users/kody/Code/patina-merged/.codex/worktrees/agent-cpc-l3/apps/client-portal
> tsc --noEmit
```
(no diagnostics; required `pnpm turbo build --filter=@patina/client-portal^...` first — without the
workspace dists tsc reports ~20 `TS2307 Cannot find module '@patina/types'` from packages/supabase)

`pnpm --dir …/apps/client-portal test -- threshold making`
```
Test Suites: 32 passed, 32 total
Tests:       588 passed, 588 total
Snapshots:   0 total
Time:        16.299 s
Ran all test suites matching /threshold|making/i.
```

`npx eslint src/components/threshold` (from `apps/client-portal`)
```
exit=0
```
(no output, 0 errors, 0 warnings)

## Not verified

- **No browser or e2e pass.** Nothing was run against a real database or a dev server: every act is
  proven at the hook boundary in jsdom, not against `request_proposal_change`, `decline_proposal`,
  `POST /api/proposals/[id]/decline` or `rpc_start_project_thread` in the running stack. Integration
  owns the e2e.
- **Visual fidelity unchecked** — no screenshot of the acts row or the unfolded instrument against
  `path-b-the-threshold.html`; the unfold panels are typographic and hairline-ruled by construction
  (no shadow, no badge, no tab) but nobody has looked at them.
- **The reading's own layout inside the leaf.** `CommercialDocumentShell` is a 760px white paper
  article with its own type scale; it is laid in on `--bg-warm` with a hairline, unverified at phone
  width.
- **Legacy decline is unreachable from the Threshold today** — `threshold.tsx:294` drops
  `kind === 'legacy'` from `signatureGates`, so the legacy branch exists for fidelity with the old
  page and is covered only by its unit test.
- **`ask a question` and L4.** L4 owns correspondence (`TheNote` reply, thread letters in Previously).
  The question posted here lands in the same project thread `/messages` used, but the two surfaces
  were not built together — after the merge, check the question appears in L4's letters and that the
  two composers do not read as two different things.
- **Analytics keys** (`door_read`/`door_question`/`door_change`/`door_decline` + the confirm keys) are
  new `ScoredAction` action keys; nothing downstream consumes them yet.
- Coverage thresholds were not run (`test -- <dirs>` only); the full jest + coverage pass is
  integration's gate.
