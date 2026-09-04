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

---

# Fix round

Against `artifacts/client-page-completion-2026-09-04/waves/w1/l3-review.md` (21 findings: 0 blockers,
6 major, 9 minor, 6 nit). **Every finding was acted on — none rejected.** #5 and #15 are absorb gaps
the review itself offered a ruling for instead of code; both take the ruling branch and are recorded
below.

## Fixed, by finding number

**1 · major — an unresolved kind is no longer read as legacy.**
`door-gate.tsx` now resolves `resolvedKind: CommercialDocumentKind | null`
(`proposal.kind ?? bundle.data?.document?.kind ?? null`) and keeps the old `kind` (`?? 'legacy'`) only
for the copy that must name something. `DoorActs.kind` is `CommercialDocumentKind | null`; while it is
null, **Decline** is withheld (so nothing can take the legacy rail and skip
`POST /api/proposals/[id]/decline`'s fail-closed resolution) and so is **Read it in full**.
Ask and Request a change stand — neither branches on the rail.

**2 · major — the leaf stops asking for her name once she declines.**
`DoorGate` passes `onDeclined` and holds a `declined` flag: the header line reads
`Shut. You declined it.` instead of `…it opens on your name`, the consent box and the name field go
`disabled`, `ready` is false so **Sign** disarms, and the hint reads
`You declined this paper. Your studio has been told.` No copy now reverses itself while the refetch
is in flight.

**3 · major — the reading always says something.** `instrument-reading.tsx` folds `!bundle.data` into
the refusal branch (`This paper could not be drawn just now. Reload to try again.`, `role="alert"`)
and gives a legacy row its own quiet line (`This is an older paper. Ask your studio for a copy of
it.`, testid `instrument-reading-unprinted`). No unfold can now open `aria-expanded="true"` on an
empty region — in the door or in Previously.

**4 · major — focus comes back to the act that opened the panel.** `toggle(key, event)` parks
`event.currentTarget` on an `openerRef`; that ref is passed as `restoreFocusRef` to both the confirm
and the "Never mind" act of every panel, which is what `ScoredAction`'s `restoreFocus` (rAF →
`.focus()`, run in the click handler's `finally`) exists for.

**5 · major — RULING, not code: legacy papers and the per-line verdict loop are RETIRED, not
absorbed.** `threshold.tsx:295/316` drops `kind === 'legacy'` from both `signatureGates` and
`instrumentReceipts`, so a legacy proposal is already invisible on the Threshold; the C3 per-line
feedback loop (`proposals.feedback_enabled`, 00267) was gated on the old route's `isActionable` and
has no surface here. Ruling for integration to carry into the retirement plan: **when
`/proposals/[id]` is retired, legacy proposals and per-line feedback go with it.** The legacy decline
rail is still kept in code for fidelity (and is what #1 protects), because a legacy row can still be
reached by id even though the Threshold does not list one. If the studio still holds live legacy
papers at cutover, this ruling has to be reversed before the route is deleted — that is a
plan-level call, not a lane one.

**6 · major — the old page's expiry gate is back.** `DoorProposal` gains `validUntil?: string | null`;
`threshold.tsx` fills it from the row (`proposal.valid_until`, one line — the commercial summary does
not carry the date). `DoorActs.hasPassed()` is the old page's guard verbatim (falsy → not expired,
`NaN` → not expired, `< Date.now()` → expired), and once it has passed **Ask / Request a change /
Decline** are all withheld. **Read it in full** stays: reading a paper is not acting on it, and the
old route printed the document for an expired proposal too. Signing is unaffected here — the sign
route enforces `valid_until` itself (`sign/route.ts:117`).

**7 · minor — the ask is not offered where there is no thread.** `'question'` drops out of the acts
array when `projectId` is null. The in-handler refusal sentence stays as the type narrowing and a
belt-and-braces guard, but it is now unreachable by clicking.

**8 · minor — in-flight latches.** `askLatch` / `changeLatch` / `declineLatch` refs, each set before
the await and cleared in `finally`, mirroring `door-gate.tsx:131-133`. Two clicks in one tick now
send once.

**9 · minor — a receipt no longer stands over the next panel.** `toggle()` clears `receipt` as well as
`error`; `onDecline` clears it too, so the stamp is alone.

**10 · minor — a cut instrument line keeps its own words.** `previously.tsx` hoists
`truncated = isTruncated(entry.label)` and, when an instrument line is truncated, prints the full
label above the reading rather than instead of it.

**11 · minor — the declined stamp is announced.** `role="status"` on `door-declined`.

**12 · minor — the six missing cases.** Added to `door-acts.test.tsx`: "Never mind" closes a panel and
leaves the acts standing; the pending state (loading label `Sending`, disabled textarea, disabled
dismiss); the stale receipt (#9); the ask panel's description copy (plus its heading, #18); the
double-click latch (#8); the withheld ask (#7); the null-kind withholding (#1); expired / not-expired
(#6); the announced stamp (#11); the danger variant and per-act `aria-controls` (#17, #19).
`instrument-reading.test.tsx`: the two dead-read branches now assert sentences (#3).
`previously.test.tsx`: a truncated instrument line printing its own words (#10) and an instrument
entry whose id does **not** match `instrument:<id>` falling back to the label unfold.
`door-gate.test.tsx`: the stub now witnesses `kind` and `validUntil` and can fire `onDeclined`, with
cases for the null kind (#1), the carried `validUntil` (#6) and the disarmed signature block (#2).

**13 · minor — the letter names the paper.** `DoorActs` takes `title` and posts
`About <title>\n\n<question>` (bare question when the title is empty). The old flow put the client
*in* the thread holding the proposal, which supplied that context; a letter has to carry it, and a
page with two open doors gives the studio nothing to tell them apart otherwise. **Copy ruling for
integration to confirm with L4**: the prefix is plain (`About …`), not a rendered reference chip, and
it is the only new sentence this lane invents on the send path.

**14 · minor — `onDeclined` is no longer dead surface.** Resolved by #2.

**15 · minor — RULING for integration: archived papers.** Declined / expired / superseded proposals
(`partitionProposals.archived`) and the old list's "This edition was replaced… Open the current
edition" guidance still have no home: doors take only `sent`, Previously only `accepted`. This lane
does not invent a Previously state for them (that is `derive.ts`'s shape, which L3 is forbidden to
touch, and the words are a copy call). **Raised as a plan-level ruling: `/proposals` may not be
retired until archived papers land somewhere on the Threshold — most naturally as Previously entries
with their own state words.**

**16 · nit — copy-fidelity correction.** The review is right that the report's byte-copy claim has one
exception. **Corrected here: the confirm *loading* labels drop the old dialogs' ellipsis** —
"Declining…" → `Declining`, "Sending…" → `Sending` — to match the house idiom the shipped door
already set (`door-gate.tsx:477`, `Signing`). Everything else (dialog titles, descriptions, field
labels, placeholders including the `’` in "What’s holding you back?", validation sentences, error
fallbacks, the 1000-char caps and the `n / 1000` counters) remains byte-identical to
`ProposalDeclineDialog` / `CommercialDeclineDialog` / `ProposalRequestChangeDialog`.

**17 · nit — the decline confirm carries `variant="danger"`**, the weight without a colour (`Panel`
gained a `confirmVariant` prop defaulting to `secondary`).

**18 · nit — the panel title is an `<h3>`**, styled as it was, so the panel is reachable by heading.

**19 · nit — one panel id per act.** `panelIdFor(key)`; a collapsed act carries no `aria-controls` at
all, so nothing advertises a region holding another act's content.

**20 · nit — print.** Confirmed and recorded: **"Download PDF" (`window.print()`,
`/proposals/[id]` page.tsx:172-179) is retired for proposals**, not absorbed. The inventory does not
count it as an act (§85 = decline / request change / clarify / replay), the reading is now on the page
itself, and invoices keep their print route via L2 (`/invoices/[id]/print`).

**21 · nit — no colon in the id.** `previously-body-${entry.id.replace(/:/g, '-')}`.

## Rejected

None. (#5 and #15 are absorb gaps taken as rulings — the branch the review itself offered — rather
than absorbed in code; the reasoning for each is above.)

## Files touched in the fix round

- `apps/client-portal/src/components/threshold/door-acts.tsx` (#1, #4, #6, #7, #8, #9, #11, #13, #17,
  #18, #19)
- `apps/client-portal/src/components/threshold/door-gate.tsx` (#1, #2, #6, #14) — 8 small hunks, all
  inside the existing signature block plus the `DoorActs` call
- `apps/client-portal/src/components/threshold/instrument-reading.tsx` (#3)
- `apps/client-portal/src/components/threshold/previously.tsx` (#10, #21)
- `apps/client-portal/src/components/threshold/threshold.tsx` (#6) — **one added field**
  (`validUntil: proposal.valid_until ?? null`) in the `signatureGates` map; no other change
- the four test files above

## Gate output (fix round, verbatim tails)

`pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-cpc-l3/apps/client-portal type-check`
```
> @patina/client-portal@0.1.0 type-check /Users/kody/Code/patina-merged/.codex/worktrees/agent-cpc-l3/apps/client-portal
> tsc --noEmit
```
(no diagnostics)

`pnpm --dir …/apps/client-portal test -- threshold making`
```
Test Suites: 32 passed, 32 total
Tests:       603 passed, 603 total
Snapshots:   0 total
Time:        5.861 s, estimated 6 s
Ran all test suites matching /threshold|making/i.
```
(588 → 603; +15 cases, none removed — the two rewritten cases replaced behaviours that changed)

`npx eslint src/components/threshold` (from `apps/client-portal`)
```
exit=0
```
(no output, 0 errors, 0 warnings)

## Still not verified after the fix round

Everything under "Not verified" above still stands, minus the legacy-decline note, which is now a
recorded ruling (#5). Three additions:

- **Focus restoration (#4) is not asserted in a test.** It is wired through `ScoredAction`'s existing
  `restoreFocusRef` path (rAF + `.focus()`); jsdom would need an rAF flush to prove it and the
  assertion would test `ScoredAction`, which has its own suite. Worth one keyboard pass in the
  browser walk.
- **The expiry gate (#6) reads `Date.now()` at render.** A door left open across the boundary does not
  re-render itself; the acts withdraw on the next render. The old page had the same property.
- **The question prefix (#13) has not been seen in a real thread** — check it against L4's letters
  after the merge, and confirm the studio side reads `About <title>` as intended.
