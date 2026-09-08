# Wave 3 · client lane — adversarial review, round 2

Reviewer context, not the implementer and not the round-1 fix agent.
Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w3-client`
(`git rev-parse --show-toplevel` pasted below), branch `agreement/w3-client`,
13 commits ahead of `main`, 27 files, +4468/−38.

```
/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w3-client
```

Round 1 filed F1–F18. This round verifies each, reads the four fix commits, and
— because the backend lane has since published `00578`/`00579` — checks the
cross-lane claims the lane could only *name* in round 1. Three of them are now
settled, and two of them are settled badly.

## Gates, run in this worktree

```
pnpm --dir …/agent-agr-w3-client/apps/client-portal type-check
  → tsc --noEmit, no output (clean)

pnpm --dir …/agent-agr-w3-client/apps/client-portal test:coverage
  → Test Suites: 131 passed, 131 total
    Tests:       2161 passed, 2161 total
    Snapshots:   1 passed, 1 total
    All files             74.78 / 70.25 / 74.96 / 77.12   (floor 70/60/70/70)
    design-build-body.tsx    90.00 / 76.15 / 88.23 / 94.33  (uncovered 541-553, 637)
    deposit-offer.tsx       100.00 /100.00 /100.00 /100.00
    consent-copy.ts          97.70 / 88.88 /100.00 / 99.06
    door-acts.tsx            92.30 / 91.30 / 85.71 / 94.89
    door-gate.tsx            95.48 / 88.96 / 88.00 / 98.33
    letterbox-door.tsx       96.96 / 86.72 / 90.90 / 97.80  (uncovered 397, 521)
    threshold.tsx            95.46 / 81.42 / 93.10 / 97.56
    commercial-documents.ts  87.93 / 86.01 / 95.74 / 92.17  (uncovered 652-675)
```

Working tree clean. Every commit is pathspec-scoped to `apps/client-portal/**`,
`packages/types/**` (the shared T0 commit) and the gitignored program docs. The
T0 types commit is byte-identical across all five lane branches
(`git patch-id --stable` → `7cc8b055…` on `f25fa65be`, `b854dad52`,
`03ab57f49`, `1bc317855`, `f108672f5`), so it will not conflict at integration.
No file this lane touched is touched by the `sub`, `designer` or `edge` lane.

## Round-1 findings — disposition

| id | disposition |
|---|---|
| F1 | **Ruled (a) and honestly written up.** The head comment, `scheduleOfValues`' docstring and the renamed test now say what closed book does and does not do. One consequence for the orchestrator survives — see N5. |
| F2 | **Amended by the lane's own ruling, not by the orchestrator's.** See N6. |
| F3 | **NOT resolved — it got worse.** The backend's `design_build` consent arm now exists and says different words. See N1. |
| F4 | **Still open.** The named gate has still never executed. See N4. |
| F5 F6 F7 F8 F9 F10 F11 F12 F15 F16 F17 F18 | left as filed, all re-verified as still present. |
| F13 | fixed — the drift pin is a whitespace-tolerant regex (`consent-copy.test.ts:66-68`). |
| F14 | historical only; the round-1 docs commit `ec1e3688a` touches the notes file alone. |

## New findings

### N1 · blocker · The two halves of the consent sentence do not match (F3, now provable)

Head resolved with the sheet's enumerator on the backend branch
(`agreement/w3-backend`, `001114278`): `compose_agreement_consent` is grafted at
`00578_design_build_kind.sql:7226` and *does* carry a `design_build` arm. Its
fragments are not this lane's.

| what | SQL 00578 | `consent-copy.ts` |
|---|---|---|
| `cost_plus_gmp` | `the cost-plus pricing basis and its guaranteed maximum price` | `the guaranteed maximum price` |
| `fixed` | `the fixed contract sum` | `the fixed contract price` |
| `tm_nte` | `the time-and-materials basis and its not-to-exceed amount` | `the not-to-exceed price` |
| allowances | `the allowances and what happens if they run over` | `the allowances` |
| retainer / ceiling | **no arm at all** | `DESIGN_BUILD_VARIANT_ORDER` carries both |
| when the basis fragment is said | only when `_agreement_contract_sum_cents > 0` | whenever `basis` is one of the four known strings |

The door renders the TypeScript sentence (`door-gate.tsx` → `composeConsentLine`)
and the sign route files the DATABASE's sentence
(`sign/route.ts:412-425`, `p_consent.consentSentence` read off the bundle), which
is then printed back to her as the record's own consent
(`app/proposals/[id]/record/page.tsx:163`, R36). On the Halvorsen fixture she
ticks *"…these design-build terms, the guaranteed maximum price, the schedule of
values…"* and the signature row keeps *"…these design-build terms, the cost-plus
pricing basis and its guaranteed maximum price, the schedule of values…"*.

The round-1 fix exported `DESIGN_BUILD_VARIANT_ORDER` and pinned it — but the
pin covers the ORDER only (`consent-copy.test.ts:612-620`), which is exactly the
half that already agreed. Nothing pins the words.

Fix: the orchestrator rules which half is canonical and the other is edited to
match byte-for-byte, plus a pin that compares the sentences and not just the
order (the honest form is an SQL test that runs `compose_agreement_consent` over
the Halvorsen fixture and compares to a literal this file also exports).

### N2 · blocker · No design-build agreement can be saved or sent (cross-lane, designer ↔ backend)

`_validate_pricing_basis_payload` (00578:637-640) refuses unless the payload
carries a `costBasisCents` field equal to the sum of the cost lines:

```sql
IF NOT public._agreement_is_int(p_payload->'costBasisCents')
   OR (p_payload->>'costBasisCents')::bigint <> v_sum THEN
  RETURN 'The cost basis must equal the cost lines beneath it, to the cent.';
```

That validator is called from `upsert_agreement_parts` (00578:4894) and from
`send_commercial_document` (00578:6656). But `costBasisCents` is not a field:
it is not in I-1's frozen `DesignBuildPricingBasisPayload`
(`packages/types/src/agreement.ts:314-326`), and the designer lane never writes
one — `git grep costBasisCents agreement/w3-designer` returns only
`design-build.ts`'s *function* of that name and its callers. So walk steps 5 and
10 both refuse, E2E-1 and E2E-2 cannot mint a fixture, and this lane's own e2e
cannot run.

Not the client lane's to fix. Recorded here because it is a wave stopper and the
client lane's contract reading is what surfaced it.

### N3 · major · The homeowner's permanent copy of a turnkey agreement is a design-services keepsake

`_countersign_design_services_agreement_impl` is grafted for `design_build`
(00578:5517, kind list at :5560) and still writes the R12 snapshot for any
document that carries parts (00578:6031-6042), through
`public._render_agreement_snapshot_html`. That renderer is **not** redefined in
either Wave 3 migration (`grep -n "CREATE OR REPLACE FUNCTION" 00578/00579` — it
is absent), and the build sheet never lists it among the sites that must learn
the kind.

Its head is `00577_agreement_fee_schedules.sql:476`. For a turnkey prime it
produces:

- `pricing_basis`, `draws` and `allowances` all fall into the `ELSE` arm at
  00577:664-668 → `<p>Recorded with your agreement.</p>`. The price, the schedule
  of values, the draw schedule and the allowances of an $84,134 contract are the
  three words "Recorded with your agreement."
- an unconditional closing sentence (00577:501-502, appended at :681-682):
  **"This agreement authorizes design services only. Furnishings, freight, tax,
  installation, and purchasing require a separate named furnishings
  authorization."** — false on a paper that prices the trades, and the exact
  sentence `design-build-body.tsx` was written to avoid
  (`commercial-document-shell.tsx:171-174`, and the test at
  `commercial-document-shell-design-build.test.tsx:511`).
- `_agreement_money` rounds to whole dollars (00577:433), so the cents the
  turnkey paper is built on are lost.

The client portal prints this verbatim at `/proposals/[id]/record`
(`record/page.tsx:175`). Fix belongs to the backend lane (a `design_build` arm in
the renderer, or a kind guard that writes no snapshot for the class and a client
fallback), but it is a client-facing R12/R37 defect and it should not ship.

### N4 · major · E2E-2 has still never been executed (F4)

`tests/design-build-door.spec.ts:296-310` probes `agreement_draw_invoices` and
`test.skip`s when the table is absent; the round-1 change added a `throw` when
`PATINA_W3_TURNKEY_GATE=1`, which closes the escape but does not run the gate.
The lane's own notes still say "Collected by Playwright (2 tests) but not run."
`npx playwright test --list` is not a gate. With N2 open it cannot pass yet
either. Integration must run it, from the integration worktree's own dev server
(`playwright.config.ts` pins `:3002` with `reuseExistingServer: true` — the R30
N5 trap).

### N5 · minor · RC-4's second half is answered "no" and the sheet still asks for "yes"

The round-1 ruling is sound and well evidenced (the allowance parts print at
cost, so `4720 ÷ 4000 = 1.18` recovers the multiplier whatever the header rows
show). The consequence is that §7's RC-4 — "under `closed_book`, does the SOV
render pro-rated so a sub's bid cannot be backed out of `line ÷ (1 + fee)`?" —
has the answer "it can be, and by design". That is a lane ruling against a named
review criterion; it needs the orchestrator's word in
`rulings-2026-09-06.md`, not only in `client-notes.md §11.1`.

### N6 · minor · Walk step 13 was amended by the lane, not by the orchestrator

`depositOffer` is still per-visit state (`door-gate.tsx:176`, set at `:330`,
rendered under `{signedAt && …}` at `:509`). The lane ruled step 13's "the offer
is still there" is honoured by the letterbox instead, and the evidence for that
is good: `issue_agreement_draw_invoice` writes the invoice with
`client_id = v_proposal.client_id` and a NULL `project_id` (00578:6326-6334), and
`00574`'s trigger mints its `/pay/<token>` link inside the same transaction, so
the deposit does stand in the project-less letterbox. But (a) the substitute
assertion has never run (N4), and (b) amending the walk script is the
orchestrator's call. The named alternative — add `invoiceId`/`payToken` to
PART 12's draw-ledger projection so the door can re-mint the sentence — is one
backend field.

### N7 · minor · "Your papers could not be drawn" prints over papers that were drawn

`letterbox-door.tsx:432` sets `papersUnread = proposalsQuery.isError` alone.
`useClientProposals` is a plain `useQuery` (`hooks/use-proposals-client.ts:10-12`)
with no `throwOnError` and no cache reset, so after a successful first load a
failed background refetch leaves `isError === true` **and** `data` populated.
`origins`, `sealed` and `kept` are all derived from `proposalsQuery.data`
(`:270`), so the page renders every door and record it already had and puts
"Your papers could not be drawn just now. Nothing on them has changed." above
them (`:521`), and suppresses "Nothing is waiting for you." (`:496`). The notice
is a claim the page has grounds for only when it has no data.

Fix: `proposalsQuery.isError && (proposalsQuery.data?.length ?? 0) === 0`, or the
`isLoadingError` flag, with a case for "stale data plus a failed refetch".

### N8 · minor · The draw-ledger adapter is untested

Coverage names `commercial-documents.ts` lines **652-675** uncovered — that is
the whole body of `adaptDesignBuildDraws`. `lib/commercial-documents.test.ts` is
not in this branch's diff at all, although the file gained ~135 lines. The
snake_case aliases, the `sortOrder` sort, the `drawKey`-less row drop and the
"a waiver with no type is not a waiver" rule are all unproven, on the adapter
that turns the RPC's jsonb into the money on the homeowner's page. The sibling
`adaptDesignBuildSubs` — the R13 boundary — *is* covered, which makes the gap
look accidental rather than considered.

### N9 · minor · `retainageHeldCents` is dead, and the body computes a different number

The adapter carries `designBuild.retainageHeldCents`
(`commercial-documents.ts:242`, `:906-908`) and nothing reads it
(`grep -rn retainageHeldCents apps/client-portal/src` → the type, the adapter,
two fixtures). `DrawsLeaf` recomputes its own total instead
(`design-build-body.tsx:392`, summing every ledger row), while PART 12 defines
the DB's field as "sum of retainage on issued-or-paid draws" — a different
number until the last draw is billed. The lane's own rule is "draws are read,
never recomputed". Either read the field or drop it; today the sentence
"$X is held back across the draws" is a second implementation of a money figure
the database already answers.

### N10 · minor · The turnkey prime standing on an existing house's doorstep asks the wrong studio thread

`threshold.tsx:456-458` now admits `design_build` into `houseless`
(correct — that is the R30 carry), and `renderDoor` (`:734-745`) hands every
door `projectId={projectId}` — the id of the house whose page is being read,
never the paper's own (which is NULL). `DoorGate` gets no `designerId` there,
so `DoorActs.canAsk` resolves through the project branch and
`startThread.mutateAsync(projectId)` files a question about a brand-new,
unrelated turnkey engagement in the existing project's thread. The shape
pre-dates this wave (it is R30's Wave-2 carry), but this change is what makes a
turnkey prime reachable on that surface. One line: pass the paper's own
`designerId` and let the origin branch take it, as `OriginDoor` already does
(`letterbox-door.tsx:170-173`).

### N11 · minor · `threshold.tsx` is outside the lane's declared pathspecs, and the notes still say it was not touched

The build sheet's §2.4 pathspec list does not carry
`components/threshold/threshold.tsx`; the R30 carry in the lane brief names only
`DoorActs` and the papers read. The round-1 fix `d5143787e` edited it (+14/−10),
and `client-notes.md §7` still reads "`threshold.tsx:822` … **No edit**, same
vocabulary. Not in this lane's pathspecs and left untouched." The edit is right
(without it a household with a house cannot see a turnkey prime); the record of
it is wrong, and the integration steward reads §7 to know what moved.

### N12 · minor · The designer's SOV and the client's SOV label the same line differently (R27)

The pro-rating agrees cent-for-cent (both `Math.round(basisCents × sum / cost)`
with the last row taking the remainder). Under `open_book` the fee line is
`Design and construction fee` on the homeowner's page
(`design-build-body.tsx:202`) and `Fee · 18%` in the designer's preview
(`agreement/w3-designer:apps/designer-portal/src/lib/document/design-build.ts:289-292`).
R27 exists so the designer's preview and the client's body cannot drift on the
first composed agreement; this is the drift, on the one derived table.

### N13 · minor · A price nobody wrote can print as the Guaranteed maximum price

`readPricingBasis` (`design-build-body.tsx:155-163`) falls back to
`Math.round(costBasis × (10000 + feeBps) / 10000)` for **every** basis when the
stated figure is absent, and `BASIS_CEILING_LABEL` then prints it under
"Guaranteed maximum price" / "Not to exceed" / "Contract price". The designer's
own `contractSumCents` returns `null` for a `cost_plus_gmp` with no `gmpCents`
(design-build.ts:212-226) and so does the database
(`_agreement_contract_sum_cents`, 00578:715-748). R28 — "nothing the designer did
not type prints as a term" — and R21 both say `NotYetSet` here. Latent on a sent
paper (00578:661-670 refuses an unstated GMP at send), but the `NotYetSet` branch
at `:284` is unreachable for any basis carrying a fee and cost lines, which is
every real one.

### Nits

- **N14** `percentFromBps(1850)` prints `18.50%`, not `18.5%`
  (`design-build-body.tsx:100-102`).
- **N15** `DepositOffer`'s place line reads "The first of five draws · due on
  signing"; §4.4 and walk step 13 specify "Draw 1 of 5 · due on signing", and the
  count includes the retainage-release row, which is not a draw
  (`deposit-offer.tsx:51-54`).
- **N16** `composeSummaryLine('design_build', …)` does not fall back to
  `summaryLineFor` when parts exist but carry no money part, while
  `composeConsentLine` does (`consent-copy.ts:445-458` vs `:332-342`).
- **N17** `letterbox-door.tsx:521`'s retry callback — the beside-a-letter
  placement — is uncovered; only the empty-house placement's retry is clicked.
- **N18** F15 stands: `design-build-body.tsx:541-553` (`ListLeaf`) and `:637`
  are still uncovered, so a `list` part on a turnkey agreement is unproven.

## Re-verified refusals and rules

- Vocabulary: no "clause library", "contract builder", "variant", "AI", "gate",
  "task", "dashboard" or "overdue" in any string this lane added; no emoji, no
  confetti, no numeric count chips (the draw count is spelled in words), no
  red/green status, no checkmark-as-status. `Agreement`/`Part`/`Attachment` used
  as R7 names.
- R5: no money in prose outside the typed money leaves.
- RC-6: the offer is nowhere in `ready` (`door-gate.tsx:247`), the act's
  `disabled`, or any preflight; it is set after `setSignedAt`, `setReceiptInked`
  and `onSigned?.()`; `null` renders nothing. Pinned by
  `door-gate.test.tsx:1042` and the drift guard's ordering assertion
  (`consent-copy.test.ts:73-84`).
- Zero Stripe: no `create-checkout-session`, no key, no webhook branch; the offer
  is `href="/pay/<token>"`. Greps pinned in the drift guard.
- RC-13: the sign route's fall-through is gone; `SERVICES_SIGNING_KINDS` is a
  positive set and an unrouted kind answers `409 not_signable`
  (`sign/route.ts:365-368`). `commercial-document-shell.tsx:679-681`'s double
  negative is read and ruled with a comment and a test. The RPC that ran is
  asserted from the DB in the e2e and from the call order in the route test.
- The deposit RPC is called through the service client, matching PART 10 step 2's
  exception; the backend grants `EXECUTE … TO authenticated, service_role`
  (00578:6414-6415), so that call is reachable.
- Flag-off: unchanged for every kind that exists today — `isOriginKind` returns
  the same answer for `design_services` as the literal it replaced, and
  `KIND_LABEL[commercial.kind]` is byte-identical for that kind. F10 stands: the
  R30 carries (the fourth act, `PapersUnread`) are unflagged by design and their
  rollback lever is a revert.

## Verdict

**fix.** Two blockers (N1, N2) and two majors (N3, N4). N2 and N3 are the
backend lane's to fix and N1 is the orchestrator's to rule; nothing in this
lane's own code is red, and both of its gates are green.
