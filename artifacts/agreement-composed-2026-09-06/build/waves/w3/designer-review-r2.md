# Wave 3 · designer lane — adversarial review, round 2

Reviewer context: fresh, not the implementer. Worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w3-designer`
(`git rev-parse --show-toplevel` pasted below), branch `agreement/w3-designer`,
11 commits ahead of `main`, 64 files / +11,903 −124.

```
/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w3-designer
```

**Verdict: BLOCK.** Two blockers, both cross-lane integration breaks that no
gate in this lane can see, because both live on the wire between the composer
and RPCs the backend lane has already written. Everything round 1 raised as a
blocker or a major is genuinely fixed; most of round 1's minors were not
touched at all.

---

## Gates, run by the reviewer in this worktree

| Command | Result |
|---|---|
| `pnpm turbo build --filter=@patina/types` | 1 successful, FULL TURBO |
| `pnpm --filter @patina/designer-portal type-check` | **clean** — `tsc --noEmit`, no output |
| `pnpm --filter @patina/designer-portal lint` | **205 problems (2 errors, 203 warnings)**. Both errors pre-existing: `rooms/piece/piece-room-save-gate.test.tsx:159` (`import/first` rule not found) and `hooks/__tests__/use-commercial-documents.test.ts:930` (`rules-of-hooks`). `git diff main...HEAD --stat` on both files **and** `eslint.config.mjs` is empty — byte-identical to base. |
| `pnpm --filter @patina/designer-portal test` (full) | **544 suites / 6642 tests / 12 snapshots — all passed**, 29.3s |

**The flag-off pin is honest.** `agreement-composer-design-build-off.test.tsx.snap`
(1,546 lines) was written at `248f3a7b2`, *before* any Wave 3 source landed, and
`git log` on the snapshot shows no commit since. The test file itself was touched
once afterwards (`1b3a2abcd`) and the whole diff is one added jest mock
(`licenseAttestationIsLive: () => false`) — the assertions and the snapshot are
untouched. 12 snapshots pass with no `-u`.

---

## Round-1 findings — verified

| id | Status |
|---|---|
| **D1** blocker (paired `setParts` writes collide) | **FIXED.** `mutate` now takes `AgreementPart[] \| ((current) => AgreementPart[])` (`agreement-composer.tsx:347-355`) and `changePayload`, `writePart`, `setClientVisible`, `renamePart` all pass the updater. `agreement-composer-turnkey.test.tsx:326-407` drives both acts through the real state container and asserts the allowance's cost line and the clause's own `mode` both land. |
| **D2** major (flag-off readiness failed open; §4.1 read-only prose missing) | **FIXED.** `readiness.ts:345-346` binds `turnkeyFloor = isTurnkey && turnkey ? turnkey : null` and `:439` reads the same binding for the fee-floor exemption. `agreement-composer.tsx:249-250` adds `turnkeyFrozen` to `readOnly`. Covered by `agreement-composer-turnkey.test.tsx:408-437`. |
| **D3** major (colliding draw keys, no rename) | **FIXED for collisions** — `mintDrawKey` (`draws-editor.tsx:57-79`) reads the keys in use, `retainage_release` and `deposit` included, and counts past them. **A different dead end remains**: see D9 below. |
| **D4** major (allowance rebuild deleted lines, reordered the SOV) | **FIXED.** `allowances-editor.tsx:66-101` walks `costLines` in place; a line the editor never wrote is left where it stands and named by `unbackedAllowanceLine` as an advisory note, never a blocker. |
| **D5** major (`patina.licensing_attestation` rendered as a rail row) | **FIXED.** `parts-rail.tsx:112-131` filters `kind === "attestation"` out of the rows, the sortable set and the empty-state test, and translates rail indices to composition indices in `moveRow`. Confirmed against the backend's own seed: `00578:7455-7460` says the eleventh entry is a studio-level record, not a rail row. |
| **m6** ("files outside §2.3's pathspecs") | **NOT A FINDING — round 1 over-called it.** `client-note-composer.tsx:135`, `service-agreement-instruments.tsx:62`, `document-guide.ts:524/:667`, `document-guide-inputs.ts:73` and `packages/supabase/src/hooks/use-proposals.ts:250` are each named as `[designer]` rows in build sheet §3.3. The `use-proposals.ts` change is §3.3's own instruction ("already missing `'trade_scope'` — fix both in one edit"). |
| **m1 m2 m3 m4 m7 m8 m9 m10 m11 m12 m13 n1 n2 n3** | **NOT ADDRESSED.** The lane's fix log says "all five addressed, no minors deferred" — the five are D1–D5; every minor and nit is unchanged in the tree. Re-reported below with fresh evidence where the evidence moved. |

---

## New findings

### D6 · BLOCKER — the pricing basis never carries `costBasisCents`, so **no design-build agreement can be saved**

`_validate_pricing_basis_payload` (backend `00578:637-640`) requires the key:

```sql
IF NOT public._agreement_is_int(p_payload->'costBasisCents')
   OR (p_payload->>'costBasisCents')::bigint <> v_sum THEN
  RETURN 'The cost basis must equal the cost lines beneath it, to the cent.';
```

`upsert_agreement_parts` calls it the moment the payload is judgeable
(`00578:4890-4898`: `basis` non-empty **and** `costLines` a non-empty array).
The seeded template lays the key down as NULL (`00578:7473`
`'basis', NULL, 'costLines', '[]'::jsonb, 'costBasisCents', NULL`), and nothing
in this lane ever writes it: `grep -rn "costBasisCents" apps/designer-portal/src packages`
returns only the derived TS **function** `costBasisCents(basis)` in
`lib/document/design-build.ts:188` and its call sites. `readPricingBasis`
(:104-113) does not read the key and `DesignBuildPricingBasisPayload`
(`packages/types/src/agreement.ts`) does not declare it.

Walk step 5, exactly: pick **Cost-plus with GMP**, type one cost line, press
**Save agreement** → `check_violation`, and the room prints the database's own
sentence, naming a "cost basis" for which the editor offers no field. There is
no path past it. The backend lane published the shape this lane had to write —
`backend-notes.md:428-431`: `pricing_basis { basis, costLines[...],
costBasisCents, feeBps?, gmpCents?, nteCents?, fixedCents?, subMarkupBps?,
subDisclosure? }`.

Second consequence, `cost_plus` only: `_agreement_contract_sum_cents`
(`00578:739-745`) derives that basis's sum **from `costBasisCents`**, so a
cost-plus turnkey agreement has a NULL contract sum server-side while
`contractSumCents` in the browser computes it from the cost lines — the
database and the room disagree about the one number the whole schedule sums to.

**Fix**: write `costBasisCents` in `pricing-basis-editor.tsx`'s `write()`
(recompute from the lines on every payload write, including the allowances
editor's `writePart` of `costLines`), declare it on
`DesignBuildPricingBasisPayload`, and add a test that asserts the payload the
composer hands `useSaveAgreementParts` satisfies the published shape.
Confidence 0.93 — contingent only on 00578 landing as written in
`agent-agr-w3-backend`.

### D7 · BLOCKER — `list_trade_agreements` returns camelCase; the mapper reads snake_case, so the whole Trade Agreements strip renders undefined

`list_trade_agreements` (backend `00579:950-981`) builds
`jsonb_build_object('id', …, 'title', …, 'contactDisplayName', …,
'priceCents', …, 'retainageBps', …, 'state', …, 'sentAt', …, 'signature', …)`
— camelCase, no `project_id`, no `studio_id`, no `created_at`, and the sub's
receipt under the key `signature`.

`mapTradeAgreement` (`packages/supabase/src/hooks/use-trade-agreements.ts:72-103`)
reads `row.project_id`, `row.price_cents`, `row.contact_display_name`,
`row.state`, `row.sent_at`, `row.sub_signature` — every one of them `undefined`
against the shipped DTO.

Rendered result, walk step 16: `turnkeyMoney(agreement.priceCents,
agreement.currency)` → **"$NaN"**; `agreement.contactCompanyName ??
agreement.contactDisplayName` → empty; `STATE_LABELS[agreement.state]` →
`undefined` (`trade-agreement-status.tsx:41-45`); and because
`agreement.state` is neither `"draft"` nor `"sent"`,
`trade-agreement-row.tsx:56-108` offers **no Send, no Send-again, no Withdraw**.
The strip lists rows that say nothing and do nothing.

`trade-agreements.test.tsx` passes because it feeds the components already-mapped
`TradeAgreement` objects and never exercises `mapTradeAgreement` against a real
RPC shape. (`create_trade_agreement`'s payload keys and `trade-agreement-send`'s
`{recipient, emailSent}` response **do** match — checked against `00579:406-489`
and `functions/trade-agreement-send/lib.ts:302-303`; it is only the list DTO.)

**Fix**: map the camelCase DTO (and fill `projectId`/`studioId` from the caller
or ask the backend to add them), with a spec that maps a literal copy of the
RPC's `jsonb_build_object` key list. Confidence 0.93.

### D8 · MAJOR — the room invents a pricing basis and a disclosure mode the designer never chose, and readiness stays green while the send refuses

Two payload defaults live in the *readers*, not in a designer's act:

- `readPricingBasis` (`design-build.ts:94-98`) falls back to `"cost_plus_gmp"`
  when `basis` is absent or unreadable;
- `readPricingBasis` (:99-103) and `readSubDisclosure` (:179-183) both fall back
  to `"closed_book"`.

The seeded template writes `basis: NULL` and the sub-disclosure clause's
`mode: NULL` (`00578:7473`, `:7487`). So on a freshly materialized turnkey
agreement the room shows **Cost-plus with GMP** pressed
(`pricing-basis-editor.tsx:106` `aria-pressed={basis.basis === kind}`) and
**Closed-book** pressed (`sub-disclosure-clause.tsx:76`), and the schedule of
values renders pro-rated — all of it from payloads that say nothing.

A designer who accepts what the room shows and types only the cost lines and the
GMP never writes `basis` or `subDisclosure`. Then:

- `validatePricingBasis` reads the *defaulted* object and returns null → the
  readiness panel is green and Review & send is offered;
- `upsert_agreement_parts` skips its pricing-basis branch entirely (`00578:4891`
  requires a non-empty `basis`), so Save succeeds and confirms the illusion;
- `send_commercial_document` refuses — `00578:6656` →
  `'Choose a pricing basis: fixed price, cost-plus, …'`, and `00578:6694-6697`
  → `'say whether the trades are priced open-book or closed-book'`.

This is a fail-open readiness panel on the exact question the wave exists to ask,
and it is also an R21/R28 breach: closed-book is a term the homeowner reads, and
nothing the designer did not type may print as a term.

**Fix**: keep the readers strict (`basis: null`, `mode: null` when absent), have
`validatePricingBasis` return "Choose how this agreement is priced." and the room
require an explicit disclosure choice, and render neither radio as pressed until
one is. Confidence 0.85.

### D9 · MAJOR — deleting the first draw leaves a schedule the designer cannot repair

`mintDrawKey(others, position)` answers `"deposit"` only for `position === 0`
(`draws-editor.tsx:64`), and a key, once minted, is frozen (`:161-171` mints only
when `draw.key` is falsy — and the Add button already minted one, so the label
handler's mint is unreachable for every button-created row).

Remove the deposit from `[deposit, rough_in_2, cabinets_3]` and the schedule's
first row is `rough_in_2`. `validateDrawSet` (`design-build.ts:506-508`) then
refuses — and so does the database (`00578:838-841`, *"The first draw is the
deposit, and it is keyed \"deposit\""*) — with no rename control anywhere in the
editor. Adding a row does not help: `position` is `draws.length`, never 0. The
only escape is deleting **every** draw and starting over, which the sentence
does not say.

**Fix**: re-mint the first row's key to `deposit` whenever the row at index 0
carries no invoice, or offer a rename on a draw that has not been billed.
Confidence 0.7.

### D10 · MINOR — §4.3's second error state was not built

Build sheet §4.3: *"the supervision clause **and the pricing-basis markup field**
both go into an error state"*. `supervision-clause.tsx:60,74` sets
`aria-invalid={refusal !== null}` on both supervision inputs; the markup field
in `pricing-basis-editor.tsx:146-159` has no error state, no `aria-invalid`, and
`validatePricingBasis` never consults the double-count rule. Half the rule's UI
is missing. Confidence 0.85.

### D11 · MINOR — the room lets a studio type a markup the database refuses

`_validate_pricing_basis_payload` bounds `subMarkupBps` to 0–5000 and returns
*"The markup on the trades runs from 0% to 50%."* (`00578:686-692`).
`validatePricingBasis` (`design-build.ts:424-472`) bounds `feeBps` by
`MAX_FEE_BPS` and never looks at `subMarkupBps` at all, so 80% is green in the
room and refused at Save. This is round 1's **n3**, now with a database sentence
behind it. Confidence 0.85.

### D12 · MINOR — a blank "Paid within · days" is refused by the RPC

`create_trade_agreement` requires the key to be a JSON **number**
(`00579:438-444`: `jsonb_typeof(p_payload->'payWhenPaidDays') <> 'number'` →
RAISE), while `trade-agreement-composer.tsx:110` sends
`payWhenPaidDays ? Number(payWhenPaidDays) : null` and the field is clearable.
The column itself is nullable in the contract (`pay_when_paid_days integer CHECK
(… IS NULL OR …)`). Clearing the field earns a raw refusal. Confidence 0.7.

### D13 · MINOR — I-1's `DesignBuildAgreement` does not describe anything the bundle emits

`packages/types/src/commercial.ts:337-346` declares
`DesignBuildAgreement extends CommercialDocumentSummary` with top-level
`pricingBasis / scheduleOfValues / draws / allowances / attachments`, and adds it
to `ClientCommercialDocumentBundle.document`. What the backend actually emits is
a nested `designBuild: { documentId, subDisclosure, draws[], retainageHeldCents,
subs[] }` (`00578` PART 12 / `backend-notes.md:406-411`), and the client lane
consequently declared its own `DesignBuildLedger`
(`apps/client-portal/src/lib/commercial-documents.ts:326,904-909`) rather than
using this type. The interface is therefore dead — and worse than dead: a
consumer narrowing `document.kind === 'design_build'` type-checks its way to
`document.pricingBasis`, which is `undefined` at runtime. Confidence 0.6.

### D14 · MINOR — R39's act reaches only studios the third flag has reached

`onToggleClientVisible` is passed only when `designBuildOn` is true
(`agreement-composer.tsx:844-848`), and `designBuildOn` requires all three flags.
R39 ruled the hidden-part toggle as Wave 3's answer to a **Wave 2** walk finding
(W2R2-07), so a studio on `agreement-parts` + `agreement-library` and not
`design-build` never gets the fix it was promised. Defensible under the
"flag off = Wave 2 exactly" rule, but it should be a ruling rather than a
side effect. Confidence 0.6.

### D15 · MINOR — the walk cannot be performed as written for step 16

Walk step 16 says *"Money room → Trade Agreements → New"*. The strip is mounted
only inside the turnkey composer's right rail (`agreement-composer.tsx:915-919`),
under `turnkeyOn`, and only when `document.projectId` is non-null — which for an
origin agreement is only true after countersign. The build sheet explicitly
allows the right-rail placement (§4.1), and the lane notes record the choice, so
this is a walk-script correction, not a defect. Confidence 0.7.

---

## Round-1 minors, re-verified as still open

| id | Where | Still true because |
|---|---|---|
| **m1** | `packages/types/src/agreement.ts` | `DesignBuildPricingBasisPayload` still omits `subMarkupBps`; `readPricingBasis` (`design-build.ts:104-113`) still drops it. The value survives only because the editors spread the raw payload. Folded into D6's fix. 0.9 |
| **m2** | `agreement-composer.tsx:198` | `useAgreementJurisdictionNotices()` still fires unconditionally — the hook takes no `enabled` argument at all (`use-design-build.ts:153-168`) — so every studio on `agreement-parts` with design-build off still requests the table. Fails soft, but "flag off renders exactly as Wave 2" includes the network. 0.9 |
| **m4** | `design-build.ts:486,507` | *"Every draw needs a key."* / *"…its key is \`deposit\`."* still print an identifier in the studio's face. The database says the same thing (`00578:838`), so this is a program-wide copy call rather than this lane's alone. 0.75 |
| **m7** | `lib/analytics/document-events.ts` | 99 insertions / 56 deletions for a ~30-line addition; the sample diff is single→double quote conversion on pre-existing constants. Unrequested churn on a shared file. 0.9 |
| **m8** | `turnkey/draw-ledger.tsx:79`, `turnkey/lien-waiver-attachments.tsx:94`, `trade-agreements/trade-agreement-composer.tsx:110` | §4.1: analytics "fired from the composer's container, never inline in a leaf". Still fired from leaves. The namespaced module is used, so no raw `posthog.capture`. 0.8 |
| **m10** | `trade-agreement-composer.tsx:88-127` | `submit(true)` still awaits create then send; a send failure skips `onDone()` and leaves the created draft behind, and pressing the button again re-runs `create`. 0.8 |
| **m11** | `turnkey/draw-ledger.tsx:38-42,108-110` | `billable = !draw.invoiceId && …` and `drawStanding` returns "Sent" for any `invoiceId`. SQL-T7's "allows a re-issue after the invoice is voided" is unreachable from the room, and a voided invoice reads as sent. 0.8 |
| **m12** | `agreement-composer.tsx:192-202`, `template-picker-sheet.tsx:163-164` | Neither read is suppressed while loading, so a studio that HAS attested sees the template drawn locked with *"Add your licensing attestation…"* and the readiness panel flashes `TURNKEY_ATTESTATION_BLOCKER` plus a held-notice blocker per attached jurisdiction on first render. Fail-closed is right; flashing a false refusal is not. 0.85 |
| **m13** | `turnkey/draws-editor.tsx:180-182, 117-123` | `value={draw.pct === 0 ? "" : String(draw.pct)}` with `Number(…) \|\| 0` still makes "0.5" untypeable (the intermediate "0." collapses), and `retainageBps: percentToBps(…) ?? 0` still coerces empty to zero against `money.ts`'s own stated rule. The DB additionally rejects a pct with more than two decimals (`00578:814-816`) — unasked in the room. 0.8 |

## Nits

- **m3** — `SEEDED_JURISDICTIONS` says "Notice of cancellation (Wisconsin)"
  (lowercase c); the seed says "Notice of Cancellation (Wisconsin)"
  (`00578:354-374`). Once counsel enables a state the held list and the enabled
  list will disagree on casing. The longer titles round 1 quoted are not in the
  shipped seed. 0.85
- **m9** — the attestation form's seed effect keys on `[onFile]`. React Query's
  structural sharing keeps the reference stable across a deep-equal refetch, so
  the "typing is wiped on window focus" claim is weaker than round 1 stated;
  still worth keying on `onFile?.attestedAt`. 0.4
- **n2** — `draws-editor.tsx:210` still puts `col-start-6` on Remove while the
  "Hold" label already occupies column 6 of a six-column grid; the button wraps
  to a second implicit row. 0.8
- **n1** — `design-build-arithmetic.test.ts:33` still resolves the dated program
  artifact directory by relative path. On-brief (J-5), recorded for whenever the
  program directory is archived. 0.8

## What is right

- The flag chain is honest: `designBuildOn = libraryOn && designBuildFlag &&
  !designBuildLoading`, and the pinned pre-Wave-3 snapshot proves the flag-off
  room is Wave 2's paper.
- `DESIGN_BUILD_COPY.noDoubleCount` is **byte-identical** to what
  `_validate_no_double_count` returns (`00578:971`) — the room really does print
  the database's own sentence, and §4.3's copy is verbatim.
- The 34-word disclaimer is verbatim and no word count is rendered anywhere.
- No badge, no count chip, no red/green, no checkmark-as-status, no emoji in any
  new surface; the vocabulary refusals hold (no "clause library", no "contract
  builder", no "variant", no "AI") — the only identifier that reaches studio copy
  is the draw key (m4).
- Zero Stripe code: `grep` over the lane's diff finds no `create-checkout-session`,
  no Stripe key, no `stripe-webhook`. The deposit is never billed from the room.
- Retainage is withheld, not billed: the ledger and the invoice both carry
  `netCents`.
- R13's studio half holds: the sub-disclosure identities table shows "Shown to
  your client" / "Held from your client" and never a bid.

## Not verified here

The client body, the sub's token page, the migrations themselves and the edge
functions are other lanes' reviews. Backend file:line citations above are read
from `agent-agr-w3-backend`'s working tree (`00578`, `00579`) as it stands today;
if integration changes those validators, D6, D7, D8, D11 and D12 must be
re-checked against the merged bodies.
