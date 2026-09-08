# W3 client lane — adversarial review, round 3

Reviewer: separate context; did not write this code.
Worktree: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w3-client`
(`git -C … rev-parse --show-toplevel` → the same path).
Branch `agreement/w3-client`, 16 commits on `main..HEAD`.

## Gates, run by the reviewer

```
cd /Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w3-client

pnpm --filter @patina/client-portal type-check
  → tsc --noEmit, no output

pnpm --filter @patina/client-portal test
  → Test Suites: 131 passed, 131 total
    Tests:       2165 passed, 2165 total
    Snapshots:   1 passed

pnpm --filter @patina/client-portal test:coverage   → exit 0, floors met
  All files                74.81 / 70.27 / 74.98 / 77.14
  design-build-body.tsx    90.00 / 76.15 / 88.23 / 94.33   uncovered 541-553, 637
  consent-copy.ts          96.66 / 87.61 /100.00 / 98.33   uncovered 223, 351
  deposit-offer.tsx       100.00 /100.00 /100.00 /100.00
  door-gate.tsx            95.48 / 88.96 / 88.00 / 98.33
  letterbox-door.tsx       96.96 / 86.72 / 90.90 / 97.80
  commercial-documents.ts  87.93 / 86.01 / 95.74 / 92.17   uncovered 652-675
```

Working tree clean (only sandbox `.env.example` read denials in `git status`).
No Stripe call, no Checkout, no PDF in the diff — the sign route's own drift
guard asserts both absences.

## What round 2 asked for, and what happened

| r2 | verdict now |
|---|---|
| N1 blocker — the two consent halves said different words | **FIXED in the sentence, REOPENED by the redaction** — see C1 |
| N2 blocker — nothing writes `costBasisCents` | **being fixed on the designer lane, UNCOMMITTED** — see C3 |
| N3 major — the R12 keepsake was the design-services renderer's | **FIXED cross-lane**: `_render_agreement_snapshot_html` gained a `design_build` arm at `00578:7859` |
| N4 major — E2E-2 never executed | **carried**, and now demonstrably would not have caught C1/C2 either |
| N5–N17, F5–F18 | **all carried unchanged** — the round-3 pass edited three files and touched none of them |

The only product commit since round 2 is `cacf8c359`; `b0943d362` is notes.
The N1 sentence pin is real and I verified it mechanically:

```
TS  consent-copy.ts HALVORSEN_DESIGN_BUILD_CONSENT
SQL supabase/tests/commercial/design_build_test.sql:802
len 323 == 323, IDENTICAL: True
```

`compose_agreement_consent` is redefined once across both Wave 3 migrations
(`00578:7607`, no second graft in `00579`) and its `design_build` arm now agrees
with `designBuildFragments` arm for arm, including the contract-sum gate.

---

## C1 · blocker · The door composes the consent from a REDACTED payload; the record files the unredacted one. N1 is reopened under the default disclosure.

`get_client_commercial_document_bundle` now redacts the turnkey pricing basis
before it crosses to the client (`00578:7372-7375`):

```sql
'payload', CASE WHEN v_proposal.document_kind = 'design_build'
  THEN public._agreement_redact_client_payload(
         ap.kind, ap.variant, ap.payload,
         public._agreement_sub_disclosure(p_proposal_id))
  ELSE ap.payload END,
```

and `_agreement_redact_client_payload` (`00578:1408-1441`) returns, for
anything that is not exactly `open_book`:

```sql
v_payload := v_payload || jsonb_build_object(
  'contractSumCents', to_jsonb(v_sum),
  'scheduleOfValues', public._agreement_schedule_of_values(v_payload, p_disclosure));
IF p_disclosure = 'open_book' THEN RETURN v_payload; END IF;
RETURN v_payload - 'costLines' - 'feeBps' - 'costBasisCents' - 'subMarkupBps';
```

`_agreement_sub_disclosure` returns `COALESCE(v_clause, v_basis)` — NULL when
neither is set — so **closed book is the shipping default and the fail-closed
mode**, and on that path the client receives a pricing-basis payload with **no
`costLines`, no `feeBps`, no `costBasisCents`**.

`door-gate.tsx:248-254` builds `consentParts` from `bundle.data.parts` — those
redacted payloads — and `:723` renders `composeConsentLine(kind, consentParts)`.
`compose_agreement_consent` reads `public.proposal_agreement_parts` **directly**
(`00578:7676-7690`), unredacted. So the two halves are fed different inputs:

| closed-book payload | TS half (the sentence she ticks) | SQL half (the sentence filed) |
|---|---|---|
| `cost_plus_gmp`, `gmpCents` set | `designBuildContractSumCents` reads `gmpCents` → basis fragment said. `consentRows(payload.costLines)` = `[]` → **"the schedule of values" omitted** | `jsonb_array_length(v_basis->'costLines') > 0` on the authored row → **"the schedule of values" said** |
| `cost_plus`, no ceiling | `consentInt(payload.costBasisCents)` = null → sum null → **no basis fragment and no schedule-of-values fragment at all** | cost basis + fee > 0 → **"the cost-plus pricing basis" and "the schedule of values" both said** |

`sign/route.ts:412-425` files `commercialBundle.consentSentence` — the
database's — and `record/page.tsx:163` prints it back to her (R36). She ticks
one sentence and keeps another, which is exactly the defect `cacf8c359` was
written to close. The round-2 pin cannot see it: `HALVORSEN_DESIGN_BUILD_CONSENT`
is asserted in jest against an **authored** fixture (`consent-copy.test.ts`
carries `costLines`), and in SQL against the authored row. Neither half is ever
given the shape the RPC actually sends.

**Fix.** `designBuildFragments`' `pricing_basis` arm must read the projected
keys the redaction supplies — `contractSumCents` for the sum and
`scheduleOfValues` for the breakdown — falling back to `costBasisCents` /
`costLines` only when they are present (open book). Then add a jest case whose
pricing-basis payload is a **redacted** one (`basis` + `gmpCents` +
`contractSumCents` + `scheduleOfValues`, no `costLines`) and assert it composes
the same 323-character sentence.

## C2 · blocker · Under closed book the homeowner's turnkey page renders no schedule of values, and a cost-plus agreement prints "Not yet set" where the paper names a price.

Same root cause, the render half. `readPricingBasis`
(`design-build-body.tsx:138-175`) reads only `payload.costLines`,
`payload.feeBps`, `payload.gmpCents/nteCents/fixedCents`. `grep -n
"scheduleOfValues\|contractSumCents" design-build-body.tsx` finds **no read of
either projected key** — `contractSumCents` appears only as the name of the
field the component computes for itself.

On a closed-book bundle (the default):

- `costLines` = `[]` → `costBasisCents` = 0 → `scheduleOfValues(reading)` returns
  `[]` at its first guard (`:195`), so `ScheduleOfValuesLeaf` returns `null`
  (`:306`) and **the whole Schedule of values section disappears** — while the
  R12 keepsake renders the full pro-rated table from the same projected array
  (`00578:8141-8158`) and the consent sentence names it. Three surfaces, one
  paper, and the live page is the one that shows least.
- `basis: 'cost_plus'` → `stated` = null and `derived` = null (`feeBps` gone),
  so `contractSumCents` = null and `PricingBasisLeaf` prints
  `AGREEMENT_PART_COPY.notYetSet` (`:284`) over an agreement whose contract sum
  the database states in `contractSumCents`.

Every closed-book fixture in this lane carries `costLines`
(`commercial-document-shell-design-build.test.tsx:48-64, 231, 264-272, 290-291`)
and so does the e2e seed (`design-build-door.spec.ts:141-142`), which is why
2165 green tests say nothing about it. The e2e does not assert
`design-build-sov` at all, so even the run deferred to integration would pass
over this.

**Fix.** Read `payload.scheduleOfValues` when the payload carries one and
`payload.contractSumCents` when it carries one; keep the local derivation as the
open-book path. Add a redacted-payload case to
`commercial-document-shell-design-build.test.tsx` and an SOV assertion to the
e2e.

## C3 · major · Cross-lane: `costBasisCents` (r2's N2) is fixed only in the designer lane's WORKING TREE — no branch carries it.

```
git -C .codex/worktrees/agent-agr-w3-designer status --porcelain -- packages/types
 M packages/types/src/agreement.ts
git -C … diff --stat HEAD -- packages/types/src/agreement.ts
 1 file changed, 32 insertions(+), 12 deletions(-)
```

`_validate_pricing_basis_payload` still refuses a payload without
`costBasisCents` (`00578:798-799`), called from `upsert_agreement_parts`
(`:4894`) and `send_commercial_document` (`:6656`). The designer's uncommitted
edit adds `costBasisCents: number` at `agreement.ts:327` and writes it
(`design-build.ts:122`), which resolves it — but until it is committed, walk
steps 5 and 10 still refuse and E2E-1/E2E-2 still cannot mint a fixture. Not
this lane's code; named so the orchestrator does not read r2's N2 as closed.

## C4 · major · The T0 types file is NOT byte-identical across the lanes, and client × designer conflicts on it today.

```
blob HEAD:packages/types/src/agreement.ts
  client   3afca26ab…  369 lines
  backend  3afca26ab…  369
  edge     3afca26ab…  369
  sub      3afca26ab…  369
  designer 4d8fa6fd4…  545   (+ uncommitted, 565 on disk)

git merge-tree --write-tree agreement/w3-client agreement/w3-designer
  CONFLICT (content): Merge conflict in packages/types/src/agreement.ts
```

`client-notes.md` §13 tells the orchestrator the opposite: "`packages/types/src/
agreement.ts` is the T0 handshake commit that is byte-identical on all five lane
branches; an edit from this worktree would break that identity." It is already
broken — by the lane that OWNS I-1, correctly — and the steward will meet the
conflict at merge. The client's own `DesignBuildPricingBasisPayload`
(`:314-325`) also declares `basis: PricingBasisKind` where the designer's is
`PricingBasisKind | null`.

Note also that `packages/types/**` is not in the client lane's §2.4 pathspec
list; the T0 commit `f25fa65be` is out of the declared scope, and the notes do
not record the widening.

## C5 · major · N4 carried: E2E-2 has still never executed.

`design-build-door.spec.ts` collects two tests and skips itself without
`agreement_draw_invoices` (throwing instead when `PATINA_W3_TURNKEY_GATE=1`).
`client-notes.md` §15 now measures why it cannot run from this worktree and
writes the steward a runbook, which is the right escalation — but the gate has
not run, and C1/C2 show it would not have caught the wave's real defects in its
current form. It needs the SOV assertion and a redacted-payload path before it
is worth running.

## C6 · major · `threshold.tsx` files a houseless door's question in the wrong project's thread.

`threshold.tsx:456-458` now admits `design_build` into `houseless` via
`isOriginKind` — the correct R30 carry. But `renderDoor` (`:730-746`) hands
**every** door `projectId={projectId}` (the house currently being read, never
the paper's own, which is NULL) and passes no `designerId`. `DoorGate` forwards
`studioProfileId={designerId}` (`:813-814`), which defaults to null, so
`DoorActs.canAsk` (`door-acts.tsx:147`) resolves through the project branch and
`startThread.mutateAsync(projectId)` (`:177-179`) files a question about a brand
new turnkey engagement into an unrelated existing project's thread.
`letterbox-door.tsx:163-173` already does it right (`projectId={null}`,
`designerId={door.designerId}`). Wave 3's own change is what makes a turnkey
prime reachable on that path.

**Fix.** In `renderDoor`, pass `projectId={mark.houseless ? null : projectId}`
and `designerId={paper.designerId}` for a houseless mark, and add a
`threshold.test.tsx` case asserting `rpc_start_direct_thread` is the call.

---

## Minors

**M1 · 0.95 ·** `letterbox-door.tsx:432` — `papersUnread = proposalsQuery.isError`
alone. `useClientProposals` is a plain `useQuery` with no `throwOnError` and no
cache reset, so a failed background refetch after a successful first load leaves
`isError` true **and** `data` populated: every door and record still renders and
"Your papers could not be drawn just now" prints above them (`:521`). Gate on
`isError && !data`.

**M2 · 1.00 ·** `commercial-documents.ts:648-675` — `adaptDesignBuildDraws` has
zero coverage (measured above), and `src/lib/commercial-documents.test.ts` is
not in this branch's diff although the module gained 142 lines. This is the
boundary that turns the RPC's jsonb into the money on the homeowner's page: the
snake_case aliases, the `sortOrder` sort, the `drawKey`-less row drop and the
"a waiver with no type is not a waiver" rule are all unproven. Its sibling
`adaptDesignBuildSubs` (`:683-697`) IS covered, which makes the gap look
accidental. §2.4: "Every new file in this lane ships with its test in the same
change."

**M3 · 0.85 ·** `design-build-body.tsx:392` — `retainageHeldCents` is typed
(`commercial-documents.ts:242`) and adapted (`:906-908`) and never read;
`DrawsLeaf` recomputes `draws.reduce(...)` over every ledger row and prints that
instead (`:428`). PART 12 defines the DB field as the sum over issued-or-paid
draws — a different number until the last draw is billed. Read the field or drop
it.

**M4 · 0.90 ·** `design-build-body.tsx:113-117, 163` — `readPricingBasis` derives
a contract sum for **every** basis and `BASIS_CEILING_LABEL`'s `?? 'Contract
price'` fallback prints it. For `cost_plus`, which by construction names no
ceiling, the page reads "The cost of the work, plus the studio's fee on it."
followed by "**Contract price** $84,134.00" — a figure nobody typed, under a
label the paper does not carry (R21/R28). The keepsake's arm mirrors it
(`00578:8128-8134`), so the drift is now two-sided and must be ruled once.
Derive only for `cost_plus` **and** label it as an estimate, or return null.

**M5 · 0.90 ·** `client-notes.md:206` still reads "`threshold.tsx:822` … **No
edit**. Not in this lane's pathspecs and left untouched," while `d5143787e`
edits that file (+14/-10) and C6 above is about the edit. The integration
steward reads §7.

**M6 · 0.85 ·** R27 drift on the open-book fee line: the client says "Design and
construction fee" (`:202`) and the SQL keepsake agrees verbatim
(`00578:1370`), while the designer's preview says `Fee · ${feeBps/100}%`
(`agreement/w3-designer:apps/designer-portal/src/lib/document/design-build.ts:
325-327`). Two of three surfaces agree; the designer's is the half to change.

**M7 · 0.80 ·** The lane's F1 ruling is now contradicted by the backend. The head
comment at `design-build-body.tsx:27-38` and `scheduleOfValues`' docstring
(`:178-192`) say closed book withholds the per-trade price *row*, not the
information, "(Not: so that no line CAN be read that way)". The RPC now strips
`costLines`, `feeBps`, `costBasisCents` outright at the client edge, so the
stated rationale describes a page the client will never be served. Re-rule RC-4
against the redaction that shipped.

**M8 · 0.70 ·** `sign/route.ts:89` — `const amount = row.netCents ?? row.net_cents
?? row.amountCents ?? row.amount_cents;`. I-3 permits a payload without
`netCents`, and the alias chain then names the **gross** on a money surface.
Return null instead.

**M9 · 0.70 ·** Walk step 13's "the offer is still there" was amended by the lane
rather than the orchestrator (`door-gate.tsx:176, 330, 509` — `depositOffer` is
component state, rendered only in the signing visit). The evidence for the
substitute (the letterbox re-mints it: `00578:6326-6334` + 00574's
`invoice_link_mint_on_issue`) is good, but the assertion that proves it
(`design-build-door.spec.ts:440-446`) has never run. Ratify or take the named
alternative (carry `invoiceId`/`payToken` on the draw-ledger projection).

## Nits

- **N-a** `design-build-body.tsx:541-553, 637` — `ListLeaf` and its dispatch line
  are uncovered; a list part on a turnkey agreement is unproven.
- **N-b** `letterbox-door.tsx:521` — the beside-a-letter retry callback is
  uncovered; only the empty-house placement's retry is clicked.
- **N-c** `deposit-offer.tsx:53` — "The first of five draws · due on signing."
  where §4.4 and walk step 13 both specify "Draw 1 of 5 · due on signing."
  Adopt the sheet's copy or record the deviation for the walk steward.
- **N-d** `deposit-offer.tsx:61-66` — RC-7: the offer still does not say the
  studio has not yet countersigned. One clause ("…or your studio will send it
  once they countersign.") closes it.
- **N-e** `deposit-offer.tsx:5` — the threshold surface imports `moneyToTheCent`
  from `@/components/commercial/design-build-body`, pulling the whole turnkey
  body into the threshold bundle. Move the formatter to `lib/utils/format`.
- **N-f** `design-build-body.tsx:84-95` — `moneyToTheCent` assumes a two-decimal,
  symbol-leading currency; `currency` is data-driven from
  `bundle.serviceTerms?.currency`. State the USD assumption or derive the
  fraction digits.
- **N-g** `design-build-body.tsx:101` — `percentFromBps(1850)` → "18.50%" where a
  studio says 18.5%. The SQL keepsake mirrors it (`00578:8114-8117`), so this is
  now a two-sided decision; the designer's `feeBps/100` says "18.5%".
- **N-h** `consent-copy.ts:445-458` — `composeSummaryLine`'s turnkey arm does not
  fall back to `summaryLineFor` when the noun list is empty, while
  `composeConsentLine` does (`:336-337`).
- **N-i** `design-build-body.tsx:372-374, 629-634, 638-643` — an unset draws part
  renders "Recorded with your agreement." where the Wave 1 re-gate ruled an
  unset money part renders nothing (R21). The SQL keepsake uses `c_recorded`
  here too, so rule once for both.
- **N-j** `design-build-body.tsx:383` — a draw authored at `pct` 0 prints "0%";
  `scheduleOfValues` prints "$0" for a zero cost line under closed book. Both
  refused by the send validators, so latent. `AllowancesLeaf` was fixed.
- **N-k** `sign/route.ts:96-104` — `payToken` is checked only for non-empty
  string before becoming `/pay/${encodeURIComponent(payToken)}`; the e2e asserts
  `/^\/pay\/[0-9a-f]{64}$/`. Test the shape server-side.
- **N-l** `door-acts.tsx:145-147` — `canAsk` is wider than
  `rpc_start_direct_thread`'s own relationship predicate
  (`00536_client_side_server_gaps.sql:147`): a household on a declined or expired
  lead is offered an act that refuses. The refusal is spoken in the house's own
  words and has a test, so accept the narrowing in the comment or gate the act.
- **N-m** `packages/types/src/commercial.ts:337` — `DesignBuildAgreement` is dead
  in the client portal (`grep` finds only its declaration and its union
  membership) while `DesignBuildDrawEntry` / `DesignBuildSubIdentity` are
  redefined portal-local. Reconcile or retire.
- **N-n** `design-build-door.spec.ts:368` — a fixed `page.waitForTimeout(HOLD_MS +
  400)` inside the gate. It is the gesture's own constant; say so in the header.
- **N-o** Flag-off is not a byte-for-byte no-op on the client surface: origin
  doors gained a fourth act, a failed papers read renders `PapersUnread` instead
  of `ProjectsEmptyState`, and `ORIGIN_DOCUMENT_KINDS`/`isOriginKind` govern both
  `letterbox-door.tsx` and `threshold.tsx` with no flag at all. For
  `design_services` the rendered answer is identical, so nothing regresses — but
  the ship note must say the rollback lever for the R30 carries is a revert, not
  the flag.

## Verdict

**block.** C1 and C2 are one root cause — the client composes and renders the
turnkey pricing basis from keys the bundle RPC strips under the shipping default
disclosure — and they land on the two things this wave exists to get right: the
sentence the homeowner ticks, and the money on the page she signs. Neither is
visible to any gate this lane runs, because every fixture in jest and in the e2e
feeds the authored payload rather than the projected one. C3, C4 and C5 are
cross-lane/integration items the steward must clear before a walk.
