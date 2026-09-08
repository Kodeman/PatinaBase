# Wave 3 · designer lane — adversarial review, round 3

Reviewer context, not the implementer. Worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w3-designer`, branch
`agreement/w3-designer`, `git rev-parse --show-toplevel` pasted at the top of the
session. Read against `build/contract.md`, `build/rulings-2026-09-06.md`,
`build/waves/w3/build-sheet.md`, `w1`/`w2` wave reports, `w3/env.md`, and —
because Wave 3's lanes are concurrent — the **current** bodies of
`00578_design_build_kind.sql` / `00579_trade_agreements.sql` and
`backend-notes.md` in `.codex/worktrees/agent-agr-w3-backend`.

## Gates, run in this worktree by the reviewer

| Command | Result |
|---|---|
| `pnpm --filter @patina/designer-portal type-check` | **clean** — `tsc --noEmit`, no output |
| `pnpm --filter @patina/designer-portal test` (FULL) | **544 suites / 6658 tests / 12 snapshots — all passed**, 28.2 s |
| `pnpm --filter @patina/designer-portal lint` | 205 problems (**2 errors**, 203 warnings). Both errors pre-existing: `piece-room-save-gate.test.tsx:159` `import/first`, `hooks/__tests__/use-commercial-documents.test.ts:930` `rules-of-hooks`. `git diff main...HEAD --name-only` lists neither file. |

**Flag-off byte-identity, verified independently rather than taken on trust.**
`git diff main 248f3a7b2 --stat -- apps/designer-portal/src/components/document apps/designer-portal/src/lib packages`
returns only the new snapshot test, its `.snap`, and the T0 types commit — so the
pin was genuinely taken on main's tree before Wave 3 touched the folder.
`git log --follow` on the `.snap` shows one commit (the pin), never an `-u`
refresh, and the full jest run passes its 12 snapshots at HEAD. The flag-off room
is the paper Wave 2 shipped. (Caveat, nit-level: the pin sits on main **plus**
the T0 types commit; `COMMERCIAL_DOCUMENT_KINDS` is only read by a parse guard,
so nothing renders from it.)

**Round 2's four findings are fixed.** D6 — `withCostBasisCents` is routed
through all three writers of the pricing-basis payload and the key is on the
type; the DB's guard at `00578:5247-5250` only judges once `basis` and
`costLines` are non-empty, and `blankPayload` lays `costBasisCents: null`, which
that guard skips. D7 — `TradeAgreementListItem` is a literal copy of
`list_trade_agreements`' key list (00579:995-1026), verified key for key. D8 —
both readers answer `null`, neither radio is pressed, `scheduleOfValues` returns
`[]` for a null mode. D9 — `withDepositFirst` re-seats row 0 on every write.

---

## Findings

### B1 · blocker · confidence 0.95
**`useRecordAgreementDrawLienWaiver` writes a table whose INSERT grant and policy
the backend has withdrawn — the lien-waiver act cannot work in production.**
`packages/supabase/src/hooks/use-design-build.ts:249` still does
`.from('agreement_draw_lien_waivers').insert({…})`. `00578:581-582` DROPs
`agreement_draw_lien_waivers_studio_write` and creates nothing in its place;
`00578:592-595` is `REVOKE ALL … FROM PUBLIC, anon, authenticated` followed by
`GRANT SELECT … TO authenticated` only. The comment above it states the rule:
"There is NO INSERT policy and NO INSERT grant on the waiver ledger." The one
door is `public.record_agreement_draw_lien_waiver(p_draw_id, p_waiver_type,
p_contact_id, p_through_date, p_amount_cents, p_storage_path, p_received_at)`
(00578 PART 5b, `:615-712`), which additionally **snapshots the trade's name
itself** off `studio_contacts` and **stamps `recorded_by` from the session** —
so the hook's `contactDisplayName` and `recordedBy` inputs are not its arguments
either. The backend published this to this lane by name:
`backend-notes.md` "Owed, added to §7" item 1 — *"designer lane — REQUIRED.
`packages/supabase/src/hooks/use-design-build.ts:249` writes
`agreement_draw_lien_waivers` with `.from(...).insert(...)`. That grant is gone.
… Its jest test mocks the client, so the suite will stay green while production
would not: this one has to be read, not run."* Walk step 16's "record a
conditional progress lien waiver against draw 2" is unperformable, and
`lien-waiver-attachments.tsx:100-106` renders `error.message` verbatim, so the
studio would read a raw Postgres string ("permission denied for table
agreement_draw_lien_waivers"), which is itself a copy refusal.
*Fix*: `.rpc('record_agreement_draw_lien_waiver', {…})`, map the returned
`{ id, drawId, drawKey, waiverType, contactDisplayName, throughDate,
amountCents, receivedAt }`, drop `contactDisplayName`/`recordedBy` from the
input, and write a spec built from a literal copy of the RPC's argument list
(the D7 pattern).

### D17 · major · confidence 0.9
**The designer's live "client's copy" preview shows none of the turnkey money —
it prints "Recorded with your agreement." where the homeowner reads the whole
schedule.**
`agreement-composer.tsx:681-688` builds `previewProps` from the local `parts`
and feeds `ServiceAgreementPreview`, which renders `AgreementPartsBody`
(`service-agreement-preview.tsx:106`). `agreement-parts-body.tsx`'s
`switch (part.variant)` handles `rate_card · ceiling · retainer · cadence ·
procurement · flat · per_phase` and falls to `default: return <RecordedLine />`
at `:280-283`. `pricing_basis`, `draws` and `allowances` all land there. The
homeowner's actual door renders them in full — the client lane's
`design-build-body.tsx` has `scheduleOfValues()` at `:193`, a "Schedule of
values" heading at `:311` and a `DrawsLeaf` at `:352`, fed by the backend's
`_agreement_schedule_of_values` (00578:1300). So the sticky rail, the
"Client copy preview" sheet and the Review & send sheet all tell the studio her
client will read a bare line reading "Recorded with your agreement." for the
pricing basis, the draws and the allowances. R27 is the ruling this breaks —
"the designer's live preview renders through the same body component contract as
the client, so the first composed agreement cannot drift" — and the file's own
comment at `:61-64` says the fallback exists to match the client shell's
sentence, which it no longer does. Walk step 5's chips are right; the paper
beside them is wrong.
*Fix*: give `agreement-parts-body.tsx` the three turnkey cases, reading the same
derivations the client body does (or share one renderer), and pin it with a jest
case asserting the preview and the client body print the same lines for the
Halvorsen fixture.

### D18 · major · confidence 0.8
**R39's toggle can hide the pricing basis, the draws or the allowances, and
nothing refuses it — the homeowner would sign a construction contract that names
no price.**
`part-editor.tsx` now renders the "Hidden from your client" checkbox for **every**
part when `onToggleClientVisible` is supplied, and `agreement-composer.tsx:844`
supplies it for every part of a document under all three flags. Readiness's
hidden-fee guard is scoped to `FEE_VARIANTS = ["rate_card", "flat", "per_phase"]`
(`readiness.ts:78`, `:318-328`), so `pricing_basis` / `draws` / `allowances`
never earn `HIDDEN_FEE_BLOCKER`. Server-side there is no guard either:
`_agreement_design_build_part` (00578:1451-1467) selects the payload with **no**
`client_visible` predicate, so the send arm validates and materializes a hidden
pricing basis happily — while `get_client_commercial_document_bundle` filters
`AND ap.client_visible` (00578:7379). Net: send succeeds, the ledger is
materialized, and the homeowner's page carries no pricing basis, no schedule of
values and no draws. This is R21/R25/R22's whole point turned inside out, and it
is reachable in two clicks from the room this lane built.
*Fix (this lane's half)*: extend the hidden-part guard to the turnkey money
variants with its own sentence, or refuse the toggle on the three of them; flag
the server half to the backend lane (a `client_visible` predicate on
`_agreement_design_build_part`, or a send refusal).

### D19 · major · confidence 0.75
**The deposit draw can never be billed from the studio surface, so
D-W3-2's own designed failure has no recovery path.**
`draw-ledger.tsx:109-111` computes `billable` and then `:129` renders the act
only when `billable && draw.drawKey !== DEPOSIT_DRAW_KEY` — the deposit's button
is suppressed at every state, with the comment "The deposit is not issued from
here." D-W3-2 makes the deposit invoice a *separately failable* call after the
signature ("If that second call errors, the route still returns `ok: true` with
`depositOffer: null` and logs server-side"), and §4.4's own copy promises the
homeowner *"You can pay now, or your studio will send it."* When that call fails
— or the homeowner ignores the offer — the studio has no control anywhere to
send it. `issue_agreement_draw_invoice` accepts the deposit at `client_signed`
and at `executed`, so the act exists; only the UI withholds it.
*Fix*: render "Bill this draw" for the deposit too once a signature exists and no
invoice is on it, or record the deliberate omission and correct §4.4's copy.

### D10 · minor · confidence 0.9 · carried, unfixed
**§4.3's second error state was not built.** The sheet requires that on a double
count "the supervision clause **AND** the pricing-basis markup field both go
into an error state". `supervision-clause.tsx:59,73` sets `aria-invalid` on both
supervision inputs and prints the copy plus `noDoubleCountAside`; the markup
`Input` at `pricing-basis-editor.tsx:151-164` has no error state, no
`aria-invalid`, and `validatePricingBasis` never consults
`validateNoDoubleCount`. Half of a three-layer rule.

### D11 · minor · confidence 0.9 · carried, unfixed
**The room accepts a sub markup the database refuses.**
`_validate_pricing_basis_payload` bounds `subMarkupBps` to 0–5000 and returns
"The markup on the trades runs from 0% to 50%." (00578:847-853). `readiness.ts`
reads `readSubMarkupBps` only for the double-count pair; `validatePricingBasis`
(`design-build.ts:474-527`) bounds `feeBps` alone. An 80% markup is green in the
room and refused at Save.

### D20 · minor · confidence 0.85 · reshaped from round 2's D12
**The Trade Agreement composer offers a send the RPC will refuse.**
`create_trade_agreement` requires a start date ("a trade agreement needs a start
date", 00579:439-445) and a numeric `payWhenPaidDays` in 0–60 ("say how many days
after the studio is paid the trade is paid, from 0 to 60", 00579:449-455). The
composer's `ready` predicate (`trade-agreement-composer.tsx:82-87`) requires only
a sub, a title, a scope and a positive price; `startOn` is free to be empty
(`:102`) and a cleared "Paid within · days" sends `null` (`:107`). Both refusals
are studio-worded, so round 2's "raw message" half is void — what stands is a
room that offers an act it knows the server will refuse. Pressing "Send to the
trade" with no start date also runs `create` first, which is D21 below.

### D14 · minor · confidence 0.6 · carried, ruled-by-the-lane
**R39's toggle reaches only studios the third flag has reached.**
`agreement-composer.tsx:844-848` supplies `onToggleClientVisible` only when
`designBuildOn` (all three flags). R39 was ruled as Wave 3's answer to a Wave 2
walk finding (W2R2-07). The lane records the choice deliberately
(`designer-notes.md`, "Deviations" item 3) with the program's flag-off rule as
its reason, which is a defensible reading — this now needs an orchestrator
ruling rather than a code change either way.

### D15 · minor · confidence 0.75 · carried
**Walk step 16's route does not exist.** Trade Agreements are mounted in the
turnkey composer's right rail (`agreement-composer.tsx:915-919`, under
`turnkeyOn`), and the strip's acts require `document.projectId` (`index.tsx:47`),
which for an origin agreement is non-null only after countersign. Step 16 says
"Money room → Trade Agreements → New". §4.1 explicitly allows the right-rail
placement. Correct the walk script, not the code.

### D13 · minor · confidence 0.6 · carried, unfixed
**`DesignBuildAgreement` is a false narrowing target.**
`packages/types/src/commercial.ts` declares top-level
`pricingBasis`/`scheduleOfValues`/`draws`/`allowances`/`attachments` on the union
member. The bundle emits a nested `designBuild: { documentId, subDisclosure,
draws[], retainageHeldCents, subs[] }` (backend-notes §7), and the client lane
declared its own reader rather than using this type. A consumer narrowing
`document.kind === 'design_build'` type-checks its way to `document.pricingBasis`,
which is `undefined` at runtime.

### m1 · minor · confidence 0.9 · carried, unfixed
**`subMarkupBps` is written and validated but still absent from I-1's payload
type and dropped by the reader.** `pricing-basis-editor.tsx:160` writes it,
`readSubMarkupBps` reads it off the raw payload, the DB reads it twice
(00578:847, :1126). `DesignBuildPricingBasisPayload`
(`packages/types/src/agreement.ts:320-337`) does not declare it and
`readPricingBasis` (`design-build.ts:104-125`) does not carry it, so a
round-trip through the typed shape loses the markup. Unchanged since round 1.

### m2 · minor · confidence 0.9 · carried, unfixed
**`useAgreementJurisdictionNotices()` still fires on the flag-off path.**
`agreement-composer.tsx:198` has no `enabled` guard — unlike the attestation
(`:192-194`) and the draw ledger (`:205-207`) beside it — and the hook takes no
such argument (`use-design-build.ts:153-168`). Every studio on `agreement-parts`
with `design-build` off requests a relation that does not exist until the
migration lands. It fails soft (`if (error) return []`), but the program rule is
that the flag-off portals render exactly as Wave 2 shipped, and a network call
Wave 2 never made is not that.

### m12 · minor · confidence 0.85 · carried, unfixed
**Readiness and the template picker flash false refusals while the reads load.**
`attestationLive` is false while `useStudioLicenseAttestation` is loading and
`enabledJurisdictions` is `[]` while the notices query loads
(`agreement-composer.tsx:192-202`), so the first render of every turnkey draft
adds `TURNKEY_ATTESTATION_BLOCKER` plus a `heldNoticeBlocker` per attached
jurisdiction, and `template-picker-sheet.tsx:167-168` draws the turnkey template
locked with "Add your licensing attestation…" for a studio that has one.
Fail-closed is right; flashing a refusal at an attested studio is not.

### m13 · minor · confidence 0.8 · carried, unfixed
**A fractional draw percentage cannot be typed, an empty retainage field becomes
zero, and the DB's two-decimal rule is never asked.**
`draws-editor.tsx:211-214`: `value={draw.pct === 0 ? "" : String(draw.pct)}` with
`Number(event.target.value) || 0` — typing "0.5" is impossible because the
intermediate "0." collapses to 0 and re-renders empty; "12.5" loses its dot the
same way. `:149-153`: `percentToBps(…) ?? 0` contradicts `money.ts:26-27`'s own
stated rule that an empty field is not a zero. And
`_validate_draws_payload` returns "A draw percentage carries at most two decimal
places." (00578) — a question the room never asks.

### m11 · minor · confidence 0.8 · carried, unfixed
**A voided draw invoice cannot be re-issued, and a voided one still reads
"Sent".** `draw-ledger.tsx:109-111` gates on `!draw.invoiceId`, so any invoice at
all — including a voided one — hides the act, making SQL-T7's "allows a re-issue
after the invoice is voided" unreachable from the room; `drawStanding`
(`:38-42`) answers "Sent" for any non-paid `invoiceId`.

### D21 (was m10) · minor · confidence 0.8 · carried, unfixed
**A failed send leaves an orphan draft, and the natural retry creates a second
Trade Agreement.** `trade-agreement-composer.tsx:89-129` awaits
`create.mutateAsync` then `send.mutateAsync`; a send throw sets a note and skips
`onDone()`, but the created agreement persists and pressing "Send to the trade"
again re-runs `create`. The row already offers "Send the link again"
(`trade-agreement-row.tsx:70-86`), which is where the retry belongs.

### m8 · minor · confidence 0.8 · carried, unfixed
**Analytics still fire from leaves, where §4.1 says they fire from the
composer's container.** `turnkey/draw-ledger.tsx:77`,
`turnkey/lien-waiver-attachments.tsx:94`,
`commercial/trade-agreements/trade-agreement-composer.tsx:114`,
`account/licensing-attestation-card.tsx:111`. The namespaced module is used
throughout (no raw `posthog.capture`), so half the rule is kept. Lift them or
record the deviation in the lane notes.

### m7 · minor · confidence 0.9 · carried, unfixed
**A shared analytics module is reformatted wholesale for a ~30-line addition.**
`git diff main...HEAD --numstat -- apps/designer-portal/src/lib/analytics/document-events.ts`
→ `99 56`. The sampled diff is single→double quote conversion on pre-existing
constants (`posthog-js` import, `LAST_DOC_KEY`, `RECENT_DOCS_KEY`, the
`typeof window` guards, `DoorWeight`, `WayfindingSource`). Unrequested style
churn on a file three waves touch, inflating the merge surface.

### m4 · minor · confidence 0.7 · carried, unfixed
**Studio-facing copy prints an internal payload key.** `design-build.ts:562`
returns "The first draw is the deposit, and its key is \`deposit\`." and `:541`
"Every draw needs a key." The paper register does not print code identifiers and
there is no key control for the designer to act on. The database says the same
thing (00578, `'The first draw is the deposit, and it is keyed "deposit".'`), so
this is a program-wide copy call rather than this lane's alone — and, since D9's
`withDepositFirst` now re-seats row 0 on every write, the room's sentence is
close to unreachable anyway.

### n3 · nit · confidence 0.7 · new
**The picker's "Account → Studio" link is a full-page navigation out of a room
holding unsaved parts.** `template-picker-sheet.tsx:190-197` is a plain
`<a href="/desk?account=studio">`. The doorway is real (`desk-doorway.tsx:133`,
`ACCOUNT_PAGES` carries `'studio'`), but the composer keeps its composition in
local state and the same sheet already warns about `unsavedChanges` before
materializing. A hard navigation discards them silently.

### n4 · nit · confidence 0.7 · new
**The shelf line for the turnkey template promises a part the rail will not
carry.** `template-picker-sheet.tsx:186` prints
`template.parts.map(entry => entry.title).join(" · ")`. `patina.design_build`
now carries **eleven** entries — the eleventh is `patina.flow_down`,
`'title', 'Flow-down'`, `'enabled', false` (00578 PART 13) — and
`materialize_agreement_template` refuses to compose a disabled entry, so the
picker lists "… · Flow-down" and the rail then shows ten parts (which is what
walk step 4 and the lane's own e2e assert).

### m3 · nit · confidence 0.85 · carried, unfixed
**`SEEDED_JURISDICTIONS` titles differ in casing from the shipped seed.**
`jurisdiction-attachments.tsx:33-38` says "Notice of cancellation (Wisconsin)";
the seed says "Notice of **C**ancellation (Wisconsin)" (00578:396-420, all six).
Once counsel enables a state the held list and the enabled list will disagree on
casing in the same strip.

### n2 · nit · confidence 0.8 · carried, unfixed
**The draws table's Remove button wraps onto a second grid row.** The row grid
has six tracks (`draws-editor.tsx:180`); the "Hold" checkbox label occupies
column 6, and the Remove button then carries `className="col-start-6"` (`:241`),
forcing an implicit second row.

### n5 · nit · confidence 0.7 · new
**The new e2e config inherits `reuseExistingServer: !process.env.CI`.**
`playwright.design-build.config.ts:38` spreads `base`, and
`playwright.config.ts:99` sets that. The Wave 1 close-out already recorded this
hazard for the client config ("the config does not pin the flag override in
`webServer.env` and reuses an existing server — run e2e only against a server
started with the override"). Here the override *is* pinned, but a dev server
already up on :3000 without it is silently reused and the spec fails on absent
flag-gated UI.

### n6 · nit · confidence 0.95 · new (gate not run)
**E2E-1 is written and has never been executed.** `designer-notes.md` says so
plainly; the spec needs the wave's two migrations on the local stack and this
lane may not reset it. Recorded so the integration steward runs
`pnpm --filter @patina/designer-portal test:e2e -- --config playwright.design-build.config.ts --project=chromium`
after the reset. (Deviations from §4.1's file name and from §4.2's four-edit
account-page shape are recorded in the lane notes with Wave 1/Wave 2 precedent
and read as acceptable.)

### n1 · nit · confidence 0.8 · carried
**A portal jest suite reads a dated program artifact by relative path.**
`design-build-arithmetic.test.ts:33` resolves
`../../../../../../artifacts/agreement-composed-2026-09-06/source/fixtures.json`.
On-brief (J-5); it breaks whenever the program directory is archived.

---

## What was checked and found sound

- **Scope.** `git diff main...HEAD --name-only` lists nothing outside
  `apps/designer-portal/`, `packages/types/`, `packages/supabase/` and
  `artifacts/`. No file from the client, sub, edge or backend lanes; none of the
  explicitly-forbidden files (`commercial/trade/*`, `roster/*`,
  `service-agreement-drafting-room.tsx`, `playwright.config.ts`).
- **Vocabulary.** No "clause library", "contract builder", "variant", "AI",
  "gate", "task", "dashboard", "overdue" or emoji in any rendered string; the
  three occurrences of "subcontract" are all in comments. No badges, no
  colour-as-status, no checkmark-as-status (`trade-agreement-status.tsx` says so
  in its header and keeps it). The chip reads "record only", per R38.
- **The no-double-count copy is byte-identical to the database's.**
  `DESIGN_BUILD_COPY.noDoubleCount` matches `_validate_no_double_count`'s
  `RETURN` string character for character, and the aside is §4.3's second line.
- **The 34-word disclaimer ships verbatim** and no word count is rendered
  anywhere (`licensing-attestation-card.test.tsx` asserts the card matches no
  `\d+ words?` pattern).
- **The licensing gate.** The template is listed and disabled, never hidden, with
  §4.2's one-line reason; Billing is untouched (the card is a sibling block, the
  three-line insertion is an import + a flag read + a mount); the card is
  read-only for a non-admin; `licenseAttestationIsLive` compares calendar dates,
  matching `expires_on > current_date`.
- **R11 is dark.** No enable control exists anywhere in the diff; the held list
  is code-resident because the SELECT policy admits `enabled` rows only
  (00578:377-379); `heldNoticeBlocker` refuses a send carrying one, matching
  00578's own refusal.
- **Zero Stripe.** No `create-checkout-session`, no Stripe key, no
  `stripe-webhook` reference anywhere in the diff (D-W3-1 held).
- **I-7 matches the edge lane**: `'agreement_draw_ready'` exists in
  `commercial-document-notify/core.ts:24` and `index.ts:40`, keyed on `eventId`,
  and the composer passes the `agreement_draw_invoices` row id.
- **The sub-disclosure mode is written to both places in one act**
  (`sub-disclosure-clause.tsx:67-73`), which is what keeps
  `_agreement_sub_disclosure` from answering `'conflict'`.
- **Arithmetic.** `computeDrawGross` / `computeRetainage` / `drawTable` /
  `scheduleOfValues` are integer-only, no `toFixed`, no float comparison, last
  row takes the remainder; the closed-book pro-rating matches
  `_agreement_schedule_of_values`'s formula
  (`round(basis * sum / cost)`, last line = `sum − allocated`). One cosmetic
  drift, not a finding on arithmetic: the open-book fee line is
  `{id:'fee', label:'Fee · 18%'}` here and `{id:'__fee', label:'Design and
  construction fee'}` in SQL — worth folding into D17's fix so the two surfaces
  name it once.

## Verdict

**block** — one blocker (B1, the lien-waiver door, published to this lane by the
backend and not acted on) and three majors (D17 the preview drift, D18 the
hideable pricing basis, D19 the unbillable deposit). Everything round 2 raised as
a blocker or major is genuinely fixed; what remains from round 2 are its minors,
untouched.
