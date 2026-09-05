# Wave 2 — designer lane notes

Lane: designer portal (`approvals/w2-designer`).
Worktree: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w2-designer`
(`git rev-parse --show-toplevel` confirmed).
Base sha: `107549568c23b321fe413284de75164bde5852c9` — matches `env.md`.

Items: **P-13 (composer half)** and **P-17 (designer half)**. Nothing else was touched.

---

## P-13 — the designer's one-line why

### Where it lives

The Stage-2 composer is `apps/designer-portal/src/components/document/approvals/project-approval-document.tsx`
(`submitDraft` → `useCreateProjectApproval`); the hook is
`packages/supabase/src/hooks/use-project-approvals.ts:553`. Confirmed by the brief's grep — the
only two call sites are that composer and the supersede form in the same file.

### What was built

**The field.** First on the paper, above the gate anatomy, labelled
`What would you tell her about this?` with the help line
`One line. She reads it under the question.` Optional (no `required`), `maxLength={200}` with the
change handler also slicing at 200 so a paste cannot overrun it.

It sits **outside** `GateCeremony`, deliberately. A gate has six parts and no more (R2 · M2, the
`gate-anatomy.tsx` header comment, and the suite's own
`stages the authoring flow as the six named gate parts` test which asserts the fieldset list
exactly). Making the why a seventh fieldset would have broken that contract; putting it above the
ceremony satisfies "above everything else" and leaves the six intact.

**The live count.** `whyRemainingLine()` in `project-approval-model.ts` — silent until twenty
characters remain, then words only: `Twenty characters left.` … `One character left.` …
`No characters left.` Never a figure, on purpose (VISION: words where words will do); a counter
running from the first keystroke is a meter on a sentence she is still writing, so it stays quiet
until the cap is actually close. The help paragraph carries `aria-live="polite"` and is the field's
`aria-describedby` target, so the count is announced without a second live region duplicating
visible text.

**The wire.** `ProjectApprovalCreatePayload` gains `why?: string | null`.
`useCreateProjectApproval` trims it and spreads `p_why` into the RPC args **only when non-empty**:

```ts
const why = input.payload.why?.trim() ?? '';
…
...(why ? { p_why: why } : {}),
```

So until the backend lane's migration merges, every existing call shape is byte-for-byte what it
was and the old signature still takes it. `p_why` is a top-level RPC argument, not a `p_payload`
key — that is what the brief specified; **if the backend lane instead freezes the why inside
`p_payload`, this one spread is the only line that changes.** Flagged as an advisory.

**The reading view.** `ProjectApprovalReview` gains `why`, parsed with `nullableString` (absent →
null, so artifacts minted before the column read as no-why rather than throwing). It renders under
the question in the unfolded gate as a new `GateWhy` block in `gate-anatomy.tsx` — her sentence in
the reading face, signed `— {given name}`.

### Two decisions worth the orchestrator's eye

1. **`why` is OPTIONAL on the `ProjectApprovalReview` interface** (`why?: string | null`), not
   required. Making it required broke every fixture in the client portal that is typed
   `: ProjectApprovalReview` (`approval-ask.test.tsx`, `client-attention.test.ts`,
   `threshold.tsx:251`) — the web lane's files, mid-wave. `parseProjectApprovalReview` always sets
   the key, so nothing reads `undefined` off a parsed row; the optionality exists only so the
   other lane's literals still compile. The web lane can consume `review.why` today.

2. **Attribution resolves the VIEWER's given name, not the author's.** The projection carries no
   author id or name (`parseProjectApprovalReview` — there is no `createdBy`), so the given name
   comes from `useAuth().user.name` through a pure `givenName()` helper (first word, or null — an
   empty name signs nothing rather than guessing). For Leah's studio, viewer == composer and the
   line is correct. **A studio co-member reading a peer's approval would see her own given name
   under someone else's sentence.** Closing that needs an author field on the projection — a
   backend change nobody in Wave 2 was briefed for. Recorded, not invented.

### What could not be verified

No rendered check — worktrees carry no `.env`, so no dev server. Owed at integration: open the
composer on a real project, confirm the field is first on the paper, type past 180 characters and
watch the words appear, submit and read the frozen why under the question. Also unverified end to
end: `p_why` actually landing in `project_approval_artifacts`, which needs the backend lane's
migration.

---

## P-17 — the stamp on the designer's ground

### What was wrong

`proposal-watch.tsx`'s `SignedSeal` drew `<Stamp label="SIGNED" color="var(--color-sage)" />` on a
sage plate (`bg-[rgba(168,181,160,0.12)]`). Sage is a green, and a green mark on the single most
consequential state is exactly the read VISION §6 refuses. `deriveStamp` in
`proposal-watch-derivation.ts` minted the same sage SIGNED.

### What was built

A small **local** component, `apps/designer-portal/src/components/document/signed-stamp.tsx` — no
shared package component this wave, per the brief. It implements the eleven-state grammar's four
dials for the Signed row:

| Dial | Value |
|---|---|
| Border weight | **doubled** — 1.5px outer plus an inset rule at `inset-[2.5px]` |
| Border pigment | mocha at the settled border opacity (`color-mix(… 88%)`); inner rule at 42% |
| Word ink | `var(--color-mocha)` at full strength — legibility never degrades |
| Rotation | `-1.1deg` |

No fill (`bg-transparent`), no shadow. The sage plate behind the seal is gone with it — a mocha
stamp on a green wash would have moved the refusal three inches to the left rather than closing it.
`deriveStamp`'s `accepted` case now mints `SIGNED` in mocha, border and ink.

**Why not reuse the portal's `Stamp`.** `stamp.tsx` is a single-rule mark at `-1.5deg` that a dozen
non-approval surfaces already draw (FF&E, orders, procurement trail). Changing it would have moved
every one of them; the grammar's doubled rule has no expression there at all.

**The pigments travel as CSS custom properties**, not as an inline `borderColor`. jsdom's CSSOM
drops `color-mix(...)` on a typed colour property — the first cut of the stamp set `borderColor`
inline and the test read back `""`. Custom properties survive `setProperty`, so the value is both
correct in a browser and readable in a test.

**No green check to retire on the surfaces touched.** Grepped the whole
`components/document` tree for `CheckCircle`, `<Check`, `checkmark`, `✓` and `✔`: zero hits. The
green check P-17 names lives on the CLIENT portal's `commercial-document-shell.tsx` — the web
lane's ground, per the Wave 1 report's own row 17.

### Left alone, on purpose (advisories, not scope)

- `red-letter-zone.tsx:31` maps `proposal_signed: 'var(--color-sage)'` — a sage pigment for a signed
  state on the Desk's need lines. Same family as this refusal, outside the brief's named files.
- `deriveStamp`'s `viewed` → `VIEWED` in sage is a reading state, not an approval outcome; sage
  stays a material pigment there per ux/02 §5, so it was not moved.
- No aging step (30-day border 0.88→0.74 / rule 0.42→0.26) was built. The brief named four dials
  and aging is not one of them; the grammar's aging rule is unimplemented on this surface.

---

## Gates

Run from a bare `cd` into the worktree, per the brief.

| # | Command | Result |
|---|---|---|
| 1 | `pnpm --filter @patina/designer-portal type-check` | **PASS** — `tsc --noEmit`, no output, exit 0 |
| 2 | `pnpm --filter @patina/designer-portal lint` | **2 errors, both pre-existing and in files this lane never opened** — `piece-room-save-gate.test.tsx:159` (`Definition for rule 'import/first' was not found`) and `use-commercial-documents.test.ts:930` (`rules-of-hooks`). Neither appears in `git status`. `npx eslint` over the eleven files this lane changed: **0 errors, 2 warnings**, both pre-existing (`project-approval-document.tsx:228` exhaustive-deps on `approvals`, which predates this change; `proposal-watch.tsx:146` an unused eslint-disable that was already there). |
| 3 | `pnpm --filter @patina/designer-portal test -- <9 suites>` | **PASS** — `Test Suites: 9 passed, 9 total · Tests: 100 passed, 100 total` |
| 4 | `pnpm --filter @patina/supabase type-check` | **PASS** — exit 0 |
| 5 | `pnpm --filter @patina/supabase test -- src/hooks/__tests__/use-project-approvals.test.ts` | **PASS** — `18 passed (18)` |
| 6 | `pnpm --filter @patina/admin-portal build` (the strictest gate) | **PASS** — exit 0, full route table emitted. Needed `pnpm turbo build --filter=@patina/admin-portal^...` first: the worktree bootstrap only built the designer portal's upstream deps, so `@patina/api-client`'s dist was absent and the first attempt failed `Module not found: Can't resolve '@patina/api-client'`. Not a code defect — a cold worktree. |

Courtesy check (not a briefed gate): `pnpm --filter @patina/client-portal type-check` fails with 9
pre-existing errors, all from an unbuilt `@patina/aesthete-quiz` dist in this cold worktree. **None
mention `why` or `ProjectApprovalReview`** — the optional-field decision above holds.

## Files

- `packages/supabase/src/hooks/use-project-approvals.ts`
- `packages/supabase/src/hooks/__tests__/use-project-approvals.test.ts`
- `apps/designer-portal/src/components/document/approvals/project-approval-document.tsx`
- `apps/designer-portal/src/components/document/approvals/project-approval-document.test.tsx`
- `apps/designer-portal/src/components/document/approvals/project-approval-model.ts`
- `apps/designer-portal/src/components/document/approvals/project-approval-model.test.ts`
- `apps/designer-portal/src/components/document/approvals/gate-anatomy.tsx`
- `apps/designer-portal/src/components/document/approvals/approvals-region-head.test.tsx`
- `apps/designer-portal/src/components/document/signed-stamp.tsx` (new)
- `apps/designer-portal/src/components/document/__tests__/signed-stamp.test.tsx` (new)
- `apps/designer-portal/src/components/document/proposal-watch.tsx`
- `apps/designer-portal/src/lib/document/proposal-watch-derivation.ts`
- `apps/designer-portal/src/lib/document/__tests__/proposal-watch-derivation.test.ts`

No migration was minted by this lane. No production mutation was run.

---

# Round 1 fix pass — 2026-09-05

Two majors from the adversarial review (D1, D2). Both closed. No other change.

## D1 — the frozen why was signed by its reader, not its author

`project-approval-document.tsx:520` read `givenName(user?.name)` off `useAuth()` — the
**viewer**. A studio co-member opening a peer's approval saw her own given name under
someone else's sentence, on an immutable, client-facing record. The lane's first pass knew
this and shipped it anyway with a comment; that was the wrong call.

**Decision.** The attribution now comes off the record, never off the reader:

- `ProjectApprovalReview` gains `whyAuthorName?: string | null` (the display name of the
  hand that wrote the why), parsed by `parseProjectApprovalReview` as
  `nullableString(row, 'whyAuthorName')` — null on every projection that does not carry it.
- The render site is `<GateWhy attribution={givenName(review.whyAuthorName)}>`. With no
  author on the record, `givenName(null)` is `null` and `GateWhy` prints the sentence
  **unsigned**. Unsigned is honest; wrongly signed is not.
- `useAuth` is no longer imported by this component, and the suite's `@/hooks/use-auth`
  mock is gone with it.

**Why not edit 00569.** The other option the review offered was adding an author name to
the backend lane's `jsonb_build_object` beside `'why'`. That migration is in the *backend*
lane's worktree and is not in this branch (`supabase/migrations` here ends at 00568), so
editing it from here would either be lost or collide at integration. The read side is now
in place and inert: the day the projection emits `whyAuthorName`, the signature lights up
with no portal change. **⚠ Owed at integration:** the backend lane (or a follow-up) must
project the author's display name under exactly the key `whyAuthorName`. Any other key
leaves the sentence unsigned — safe, but unsigned.

## D2 — SIGNED was mocha on the watch and still sage on the Desk

R13 is unqualified. The first pass moved the proposal-watch seal to mocha and left the
Desk's need line green, which is precisely the "two pigments for one meaning across the
table" that ux/02 §5 exists to close. Fixed, in both places that paint it:

- `desk-derivation.ts` — new `STAMP.mocha` (`color`/`ink` both `var(--color-mocha)`; there
  is no `--color-mocha-ink` token, and the word is the pigment at full strength, matching
  `proposal-watch-derivation.ts:137`). The `proposal_signed` need now spreads `STAMP.mocha`.
  Only the SIGNED label moved — `DELIVERED` and `PULSE` keep sage, which stays a material
  hue rather than an approval one.
- `red-letter-zone.tsx` — the `proposal_signed` folio dot follows to `var(--color-mocha)`.
  That map is a hand-copy of the STAMP palette by design (SP-20), and the existing
  palette-membership test reads the STAMP block out of source, so it still holds.

## Gates (fix pass)

| # | Command | Result |
|---|---|---|
| 1 | `pnpm --filter @patina/supabase type-check` | **PASS** — `tsc --noEmit`, no output |
| 2 | `pnpm --filter @patina/designer-portal type-check` | **PASS** — `tsc --noEmit`, no output |
| 3 | `pnpm --filter @patina/designer-portal lint` | **2 errors, unchanged and pre-existing** — `piece-room-save-gate.test.tsx:159` (`import/first` rule not found) and `use-commercial-documents.test.ts:930` (`rules-of-hooks`). Neither file is touched by this branch (`git diff --name-only 107549568 HEAD`) nor by this pass. |
| 4 | `pnpm --filter @patina/designer-portal test -- <7 suites>` | **PASS** — `Test Suites: 7 passed, 7 total · Tests: 179 passed, 179 total` |
| 5 | `pnpm --filter @patina/designer-portal test -- src/lib/document/__tests__/ src/components/document/__tests__/folder-card` | **PASS** — `99 passed, 99 total · 2017 tests` (the whole desk-derivation neighbourhood, to prove the pigment swap broke nothing downstream) |
| 6 | `pnpm --filter @patina/supabase test -- src/hooks/__tests__/use-project-approvals.test.ts` | **PASS** — `19 passed (19)` |
| 7 | `pnpm --filter @patina/admin-portal build` | **PASS** — `✓ Compiled successfully in 25.2s`, 137 static pages, full route table |

## Tests added or changed in this pass

- `use-project-approvals.test.ts` — the parser reads `whyAuthorName` and stays null without it.
- `project-approval-document.test.tsx` — the why is signed with its **author's** given name;
  a new case proves it stands unsigned (no em dash at all) when the record names no author.
- `desk-derivation.test.ts` — the SIGNED need stamps `var(--color-mocha)`, and not sage.
- `red-letter-zone.test.tsx` — the signed folio dot renders `data-stamp-color` mocha.

## Files (fix pass)

- `packages/supabase/src/hooks/use-project-approvals.ts`
- `packages/supabase/src/hooks/__tests__/use-project-approvals.test.ts`
- `apps/designer-portal/src/components/document/approvals/project-approval-document.tsx`
- `apps/designer-portal/src/components/document/approvals/project-approval-document.test.tsx`
- `apps/designer-portal/src/lib/document/desk-derivation.ts`
- `apps/designer-portal/src/lib/document/__tests__/desk-derivation.test.ts`
- `apps/designer-portal/src/components/document/red-letter-zone.tsx`
- `apps/designer-portal/src/components/document/__tests__/red-letter-zone.test.tsx`

A rendered check is still owed at integration — no dev server runs in a worktree.
No migration minted. No production mutation run.

## Advisory — a W1 suite that started failing at midnight, not from this pass

Running the whole document neighbourhood (`src/lib/document/__tests__/` +
`src/components/document/__tests__/`, 144 suites / 2425 tests) leaves **one** failure:

```
FAIL src/components/document/__tests__/client-note-composer.test.tsx
  ● ClientNoteComposer — standing note › retire calls the retire mutation …
    Unable to find an element with the text: Taken down Sep 4. It moves to Previously.
    …rendered: Taken down Sep 5. It moves to Previously.
```

The suite hardcodes `Sep 4` at lines 454 and 479 against a live clock, and the session
crossed midnight into 2026-09-05. `git log 107549568..HEAD -- <that file>` is **empty** —
neither this lane nor this pass has ever opened it, and nothing this branch changes is
reachable from that component. It is a W1 file with a date-frozen assertion that will now
fail every day. **Left untouched deliberately** (not in this lane's brief, and a W1 surface
another lane may hold); flagged for the integration steward, who should freeze the clock in
that suite rather than re-hardcode tomorrow's date.

---

# Fix pass 2 — round-2 review (F-01, F-02)

Two majors were handed back. Both are addressed below; the minors (F-03 aria-live,
F-04 newline collapse, F-05 supersede comment, F-07 two SIGNED grammars, F-10..F-12)
were not in this pass's list and are left where the reviewer put them.

## F-02 — the Document's Record still stamped Signed and Approved in sage. FIXED.

`apps/designer-portal/src/app/(document)/doc/[id]/page.tsx` (the settled-bar stamp in
`PreviousWork`) painted both marks with `--color-sage` / `--color-sage-ink`. Both now read
`var(--color-mocha)` for border and word alike, matching `STAMP.mocha` in
`desk-derivation.ts` and `SIGNED_STAMP_INK` in `signed-stamp.tsx`.

Sweep after this pass — `grep -n "color-sage" 'apps/designer-portal/src/app/(document)/doc/[id]/page.tsx'`
returns **nothing**. The six-row table the reviewer built is now mocha in all six places:
`proposal-watch.tsx`, `proposal-watch-derivation.ts`, `desk-derivation.ts`,
`red-letter-zone.tsx`, and the two stamps in `doc/[id]/page.tsx`.

The earlier claim that the fix pass closed "both places that paint it" was wrong; it closed
two of four. Recorded here rather than edited out of the earlier section.

### Tests

`doc/[id]/page.test.tsx` gains `describe('the settled stamps in the Record (P-17, R13)')`
with two cases — the Proposal's `Signed · {date}` and a gate-settled section's
`Approved · {date}`, each asserted `toHaveStyle({ borderColor: 'var(--color-mocha)',
color: 'var(--color-mocha)' })`. Two notes for whoever reads these next:

- the record's bodies only mount at density `full`, so the suite drives the supported
  `__setDensityForTest('full')` hook and presses **Open the record**; jsdom has no scrolling
  for the lens's observer to answer.
- `expect(el.style.borderColor)` reads back `""` for a `var()` value under jsdom's CSSOM —
  `toHaveStyle` is the assertion that works (the same shape `authorization-stamp.test.tsx`
  already uses).
- the file's `@/hooks/use-section-work` mock was frozen at `data: []` / `gateState:
  jest.fn()`. It is now driven by `mockSectionGates` and `mockGateState`, both reset in the
  outer `beforeEach` to the values that reproduce the old behaviour exactly (no gates,
  `'requested'`), so no existing case changes.

## F-01 — the attribution key no producer emits. DEFERRED, explicitly.

`GateWhy attribution={givenName(review.whyAuthorName)}` and the parser's
`whyAuthorName: nullableString(row, 'whyAuthorName')` are correct and forward-compatible,
and they are also **unobservable**: nothing emits the key.

```
$ grep -rn "whyAuthorName\|why_author\|whyAuthor" \
    /Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w2-backend/supabase \
    /Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w2-backend/packages
(no matches — re-run at 2026-09-05, unchanged from the reviewer's run)
```

`get_project_decision_reviews` as rewritten in the backend lane's
`00569_approval_why_viewer_role_and_receipt.sql` builds its row with `'why', artifact.why`
and `'viewerRole', …` and carries **no author of any kind** — not a name, not even the
creating actor's id, so there is nothing the portal could join client-side either.

This lane cannot fix it: the producer is a migration in another lane's worktree, and the
repo rules confine this agent to its own. So, per the finding's own second remedy, it is
recorded as **deferred** and the code is made to stop claiming otherwise:

- `packages/supabase/src/hooks/use-project-approvals.ts` — the `whyAuthorName` doc comment
  now says NOT YET PRODUCED, names 00569 as the projection that omits it, and states that
  P-13's attribution half is deferred until some projection emits that exact key.
- `project-approval-document.tsx` — the render-site comment says the same at the point of
  use: every row today renders unsigned, and this branch is the landing site, not evidence
  that it lands.

Behaviour is unchanged and was already covered both ways (`project-approval-document.test.tsx`
— signed with the author's given name, unsigned with none; `use-project-approvals.test.ts` —
parses a name, stays null without one). **What the orchestrator needs to rule:** either the
backend lane adds one line to 00569's `jsonb_build_object` under exactly the key
`whyAuthorName` (the composing designer's display name, resolved at insert onto
`project_approval_artifacts` or joined from the decision's creator), or P-13 ships with its
sentence unsigned and the wave report says so.

## Correction to this log (the reviewer's F-06)

The P-17 section above claims a zero-hit grep for `CheckCircle|<Check|checkmark|✓|✔` across
`components/document/`. That claim is false — the tree holds 35 such hits (e.g.
`spec-books/spec-book-workspace.tsx:1361`, `work-block.tsx:310`). What was actually
established, and all that was: **none of the 35 is a signed/approved status mark on a
proposal or approval surface this lane touched**, so nothing needed retiring under P-17's
"retire any green check used as a signed status". The zero claim is withdrawn.

## Gates (fix pass 2)

Issued as `pnpm --dir <worktree> --filter …` — this agent's cwd resets between calls.

| # | Command | Result |
|---|---|---|
| 1 | `pnpm --filter @patina/designer-portal type-check` | **PASS** — `tsc --noEmit`, `TC_EXIT=0` |
| 2 | `pnpm --filter @patina/designer-portal lint` | **EXIT 1 — `✖ 205 problems (2 errors, 203 warnings)`**, the identical count and the identical two errors the round-2 review recorded: `piece-room-save-gate.test.tsx:159` (`import/first` rule not found) and `use-commercial-documents.test.ts:930` (`rules-of-hooks`). Neither file is touched by this branch. |
| 3 | `pnpm --filter @patina/designer-portal test -- <8 suites>` | **PASS** — `Test Suites: 8 passed, 8 total · Tests: 280 passed, 280 total` (the 7 from the last pass plus `doc/[id]/page.test.tsx`) |
| 4 | `pnpm --filter @patina/supabase type-check` | **PASS** — `TC_EXIT=0` |
| 5 | `pnpm --filter @patina/supabase test -- src/hooks/__tests__/use-project-approvals.test.ts` | **PASS** — `Tests 19 passed (19)` |
| 6 | `pnpm --filter @patina/admin-portal build` | **PASS** — `BUILD_EXIT=0`, `✓ Compiled successfully in 19.6s`, full route table |

The five `not wrapped in act(…)` warnings in `page.test.tsx` are pre-existing: running the
suite filtered to the new describe (`-t "settled stamps in the Record"`) emits **0**.

## Files (fix pass 2)

- `apps/designer-portal/src/app/(document)/doc/[id]/page.tsx`
- `apps/designer-portal/src/app/(document)/doc/[id]/page.test.tsx`
- `apps/designer-portal/src/components/document/approvals/project-approval-document.tsx` (comment)
- `packages/supabase/src/hooks/use-project-approvals.ts` (comment)

## Advisories carried forward

- **`client-mirror.tsx:151`** still marks an answered decision `answered · {date}` in
  `--color-sage-ink`. The reviewer named it "one step further out"; F-02's fix directive
  named only the two `doc/[id]/page.tsx` stamps, so it was left alone. It is a lifecycle
  word in running text rather than an outcome stamp, but it is the last sage thing near
  this family on the designer's ground — a ruling would close the sweep.
- The W1 `client-note-composer.test.tsx` date-frozen failure recorded in the previous pass
  is unchanged and still owed to the integration steward.
- A rendered check is still owed at integration. No migration minted, no production
  mutation run.
