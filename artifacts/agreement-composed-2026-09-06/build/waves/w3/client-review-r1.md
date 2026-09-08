# Wave 3 · client lane — adversarial review, round 1 (2026-09-07)

Branch `agreement/w3-client` @ `206c283fd`, worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w3-client`
(`git -C … rev-parse --show-toplevel` →
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w3-client`).

Reviewer did not write this code. **Verdict: fix** — no blocker; four majors,
one of which (F1) needs an orchestrator ruling rather than a code change, and
two of which (F3, F4) are cross-lane and cannot close inside this lane.

Base `112e6f838` + the T0 types commit. `git diff f25fa65be b854dad52` (this
lane's T0 vs the designer lane's T0) is **empty** — the two branches carry
byte-identical trees at T0, so the duplicate `packages/types` commit will merge
without conflict.

## Gates run by this review, in this worktree

Note: a bare `cd <worktree>` does **not** persist between Bash calls in an
agent thread, and `pnpm --filter @patina/client-portal …` from a non-persisted
cwd runs against the **main checkout** (it did, once, and failed on main's own
stale `.next/types` error). Every gate below was run with `pnpm --dir <wt>/apps/client-portal`.

```
pnpm --dir …/agent-agr-w3-client/apps/client-portal type-check
  → tsc --noEmit, no output (clean)

pnpm --dir …/agent-agr-w3-client/apps/client-portal test
  → Test Suites: 131 passed, 131 total
    Tests:       2156 passed, 2156 total
    Snapshots:   1 passed

pnpm --dir …/agent-agr-w3-client/apps/client-portal test:coverage
  → same counts; floors (70/60/70/70) met
    All files              74.78 / 70.25 / 74.95 / 77.11
    design-build-body.tsx  90.00 / 76.15 / 88.23 / 94.33
    deposit-offer.tsx     100.00 /100.00 /100.00 /100.00
    consent-copy.ts        97.69 / 88.88 /100.00 / 99.06
    door-acts.tsx          92.30 / 91.30 / 85.71 / 94.89
    door-gate.tsx          95.48 / 88.96 / 88.00 / 98.33
    letterbox-door.tsx     96.96 / 86.72 / 90.90 / 97.80

git status --porcelain (worktree)  → clean
```

`tests/design-build-door.spec.ts` was **not** run by this review either: it
skips in `beforeAll` on a probe of `agreement_draw_invoices`, and the backend
lane's migration does not exist yet (`git diff main...agreement/w3-backend
--name-only` → three files, none a migration). See F4.

## What was checked and is right

- **The fail-open misroute is genuinely closed.** `SERVICES_SIGNING_KINDS` is a
  positive set (`sign/route.ts:35-39`); the `else` fall-through is replaced by
  `if (!SERVICES_SIGNING_KINDS.has(documentKind)) return 409 not_signable`
  (`:367-369`); `isClientSignedServicesRetry` reads the same set (`:237-238`).
  Enumerating the kinds: `legacy` is handled before the block, and
  `design_services` / `service_addendum` / `design_build` are all in the set, so
  **no existing kind changes behaviour** — the flag-off path for the shipped
  kinds is intact.
- **Which RPC ran is asserted three ways** — call order in
  `sign/__tests__/route.test.ts` (`['sign_design_services_agreement_with_trusted_ip',
  'issue_agreement_draw_invoice']`, plus `not.toContain` on both execute RPCs),
  the drift guard reading `sign/route.ts` off disk, and the e2e reading
  `commercial_document_signatures.metadata->>'via'` + a deposit draw row.
- **R15 / D-W3-2 is structural.** The deposit call sits after the signature RPC
  returned (`:451-454`), inside `offerDepositDraw`'s own try/catch, and every
  failure shape returns `null`: RPC error, thrown transport, `payToken` null,
  amount ≤ 0 — four jest cases, one per shape. Nothing about the offer touches
  `ready` (`door-gate.tsx:268-…`), the act's `disabled`, or any preflight;
  pinned by `takes no part in whether the act is armed`.
- **Zero Stripe code.** `git diff main...HEAD | grep -i stripe` returns only
  comments and the drift guard's own two `not.toContain` assertions.
- **R13 double-locked.** `adaptDesignBuildSubs` maps only the four known keys
  and discards the rest; `SubsLeaf` withholds `awardedPriceCents` unless
  `open_book`. Test `renders no bid, in either mode, however the bundle is
  padded` pads the DTO with `bids`/`losingBidCents`/`bidCount` and asserts
  absence in both modes.
- **The attestation never reaches the client** — `sections` filters
  `kind !== 'attestation'`, pinned by its own case.
- **RC-13's read-and-decide sites** are all commented in place:
  `commercial-document-shell.tsx:673-679` (design_build on the countersigned
  side, pinned by `still promises the countersignature that makes it
  effective`), `wall-gate.tsx:242-249`, `lib/threshold/derive.ts:65-73`.
- **Vocabulary.** No "gate"/"task"/"dashboard"/"overdue"/"variant"/"AI"/
  "clause library"/"contract builder" in any homeowner string; no badge, count
  chip, colour status or emoji; `countInWords(drawCount)` says the number in
  words. `KIND_LABEL` values carry no underscore (pinned by `it.each`).
- **Commits** are Conventional, trailer-free, pathspec-scoped; the working tree
  is clean; no `.claude/`, hooks, settings or `.env` touched; nothing pushed;
  no production mutation and no write to the shared local stack.

## Findings

| # | Sev | Conf | What |
|---|-----|------|------|
| F1 | major | 0.90 | Closed-book SOV is fully invertible — RC-4's protection is not achieved |
| F2 | major | 0.70 | The deposit offer does not survive a reload (walk step 13) |
| F3 | major | 0.95 | `compose_agreement_consent` has no `design_build` arm — filed sentence ≠ shown sentence |
| F4 | major | 0.90 | The lane's named e2e has never been executed and self-skips |
| F5 | minor | 0.70 | `offerDepositDraw` falls back to the gross figure when `netCents` is absent |
| F6 | minor | 0.85 | I-1's `DesignBuildAgreement` is dead; the ledger shapes are redefined portal-local |
| F7 | minor | 0.75 | "Ask a question" is now offered wider than `rpc_start_direct_thread` allows |
| F8 | minor | 0.70 | An unset `draws` part prints "Recorded with your agreement." (R28 re-gate F2) |
| F9 | minor | 0.65 | The no-ledger draw fallback can print `0%`, and a zero cost line `$0` (R21) |
| F10 | minor | 0.85 | Flag-off is not byte-identical on the client surface (the R30 carries) |
| F11 | nit | 0.80 | `moneyToTheCent` assumes a two-decimal, symbol-leading currency |
| F12 | nit | 0.90 | `deposit-offer.tsx` imports its money formatter from a document body module |
| F13 | nit | 0.85 | The drift guard pins the removed double negative by exact whitespace |
| F14 | nit | 0.95 | A source file rides in a `docs(agreements):` commit |
| F15 | nit | 0.90 | `ListLeaf` is uncovered — the `list` part kind is unproven on the turnkey body |
| F16 | nit | 0.80 | A fixed `page.waitForTimeout` inside the e2e gate |
| F17 | nit | 0.75 | `payToken` is not shape-validated before it becomes `payPath` |
| F18 | minor | 0.60 | RC-7: the offer's own copy does not say the studio has not yet signed |

### F1 · major · Closed-book pro-rating protects nothing, because the fee is printed beside it

`design-build-body.tsx:241-253` prints, on the homeowner's page, **Cost basis
$71,300** and **Fee 18%** — and `scheduleOfValues` (`:178-203`) renders each
closed-book line as `cost × sum ÷ basis`, i.e. cost × 1.18. So
`$44,840 ÷ 1.18 = $38,000` is exactly the cabinetry sub's cost, recoverable by
arithmetic from what is on the page. Even without the `Fee 18%` row the ratio
is recoverable: the SOV total is the GMP and the cost basis is stated, so the
multiplier is `GMP ÷ cost basis`.

RC-4 asks: *"under `closed_book`, does the SOV render pro-rated so a sub's bid
cannot be backed out of `line ÷ (1 + fee)`?"* — the answer here is **no**, and
the test that claims otherwise says so in a comment that is false in substance:

```
/* R13. Under closed book, no per-trade figure appears anywhere on the page:
   … The line the homeowner reads is $44,840 … and $38,000, the price
   Ridgeline was actually paid, is nowhere. */
```

(`commercial-document-shell-design-build.test.tsx:365-378` — the assertion is
only that the *literal string* `$38,000` is not rendered.)

This is a spec tension the lane inherited: the build sheet's own walk step 5
and SQL-T6 define the closed-book SOV as exactly `cost × 1.18`, and for a
`cost_plus_gmp` prime the fee percentage is a contractual term the client is
entitled to know. **Needs an orchestrator ruling**, one of:
(a) accept and correct RC-4 and the test comment — closed-book hides *whose*
number each line is, not *what* it is, once the fee is disclosed; or
(b) withhold the `Cost basis` / `Fee` rows from the client's page under
`closed_book` (which still leaves `GMP ÷ Σ SOV`-free inversion impossible only
if the SOV is authored rather than derived — i.e. a backend change).
Not fixable inside the body alone.

### F2 · major · The offer is gone on reload

`depositOffer` is component state (`door-gate.tsx:176`), set only inside
`onSign` from the sign response (`:330`), and rendered only under
`{signedAt && …}` (`:509-517`). Nothing reconstructs it from the bundle. After
a reload the paper is a signed record — no door, no state, no offer.

Walk step 13 states the requirement literally: *"Ignore it, reload the door:
the signature still stands, **the offer is still there**, nothing is blocked."*
The lane's own e2e second test (`the offer is an offer: ignore it and the
signature still stands`) asserts the signature, the absence of
`no active projects yet` / `payment required` / `unavailable`, and the invoice
row — and conspicuously **not** the offer's presence.

Compounding it: a `client_signed` retry re-calls `issue_agreement_draw_invoice`
(`:451-454` fires whenever `signedState === 'client_signed'`), which SQL-T7
requires to refuse a re-issue over a live invoice — so the retry path returns
`depositOffer: null` too.

Mitigation, unverified by this review: the Letterbox resolves an invoice's own
pay link (`components/threshold/letterbox.tsx:139`, `useInvoiceLink`), so the
deposit invoice is probably still payable from the money surface — but that is
a different surface, a different sentence, and it is not what the walk asserts.
Either make the offer derivable from the bundle (the ledger already carries the
deposit draw and its invoice status) or amend walk step 13 by ruling.

### F3 · major · The sentence she reads and the sentence that is filed will differ

`public.compose_agreement_consent` (head resolved:
`grep -rln "CREATE OR REPLACE FUNCTION public.compose_agreement_consent"
supabase/migrations/*.sql | sort | tail -1` → `00577_agreement_fee_schedules.sql`)
carries no turnkey arm:

```
WHEN v_kind = 'furnishings_authorization' THEN …
WHEN v_kind = 'trade_scope' THEN …
WHEN v_kind IN ('design_services', 'service_addendum') THEN …
…
IF v_kind NOT IN ('design_services', 'service_addendum') THEN
  RETURN v_legacy;
```

The sign route files the **database's** sentence
(`sign/route.ts:412-425`, `p_consent.consentSentence` read off the bundle) while
`door-gate` renders `composeConsentLine('design_build', …)`. Until the backend
lane grafts the composer, a homeowner ticks one sentence and the signature row
records another. The contract lists the consent composer among the sites that
must learn the kind (contract §2 "Wave 3"; build sheet §3.3). The client lane
flagged this in `client-notes.md` §5 — correctly, and it is not this lane's to
fix — but it must be an integration gate, not a note. The backend branch has
produced no migration at all yet (`git diff main...agreement/w3-backend
--name-only` → `backend-t0-notes.md`, `packages/types/src/{agreement,commercial}.ts`).

### F4 · major · The named e2e touchpoint is an unrun file

`tests/design-build-door.spec.ts` (450 lines) is well-shaped — it mints through
the honest rails, seeds and removes the attestation, and asserts from the
database rather than the status code — but `beforeAll` calls
`test.skip(probe.error !== null, "the Wave 3 turnkey migration is not applied
…")`, and no such migration exists. `npx playwright test --list` collecting two
tests is not a gate. The skip is loud and by name, which is the right shape, but
E2E-2 is unproven and the wave cannot ship on it until the backend migration
lands and the spec is actually run against a reset stack (with
`SUPABASE_SERVICE_ROLE_KEY` exported and a dev server started **from this
worktree on a non-3002 port** — `playwright.config.ts` still pins `:3002` with
`reuseExistingServer: true`, the R30 N5 trap).

### F5 · minor · The offer can name the gross where the invoice charges the net

`sign/route.ts:89`:
`const amount = row.netCents ?? row.net_cents ?? row.amountCents ?? row.amount_cents;`
I-3 freezes the payload as `{ …, amountCents, retainageCents, netCents, … }`,
where `amountCents` is the draw's gross. A payload that omits `netCents` — the
exact shape I-3 permits — would make the offer name the gross while the invoice
bills the net. Latent today because the deposit draw carries zero retainage
(`_validate_draws_payload`: the first draw has `retainageApplies = false`), so
the two are equal. Prefer refusing (return `null`) when `netCents` is absent
rather than silently naming a larger number.

### F6 · minor · I-1's frozen interface is dead; the ledger shapes are redefined

T0 added `DesignBuildAgreement`, `DesignBuildDrawLedgerEntry`,
`DesignBuildScheduleOfValuesLine`, `DesignBuildAllowanceLine` and
`DesignBuildAttachment` to `packages/types/src/commercial.ts`, and the sheet's
stated reason (§3.3, packages row) is *"without it a design-build document is
only representable as the generic summary fallback, and the client body cannot
narrow to it."* In fact the client body narrows on `document.kind ===
'design_build'` against the **portal-local** `CommercialDocumentBundle` and
reads `bundle.parts` + `bundle.designBuild`; nothing in `apps/client-portal`
imports `DesignBuildAgreement`. The lane then defined its own
`DesignBuildDrawEntry` (adds `sortOrder`, makes `lienWaiver.receivedAt`
nullable) and `DesignBuildSubIdentity` (`subs` has no home in `@patina/types`
at all) in `lib/commercial-documents.ts`.

This mirrors the file's existing pattern (`TradeScopeAuthorization` is likewise
duplicated), so it is not a regression — but two shapes for one payload is
exactly what R27 was written against, and the divergence in field sets should be
reconciled or the types-package interfaces retired.

### F7 · minor · The ask is now offered wider than the RPC allows

`door-acts.tsx:145-147` offers "Ask a question" whenever
`projectId !== null || studioProfileId !== null`. `rpc_start_direct_thread`
(head `00536_client_side_server_gaps.sql:147`) additionally requires one of: an
**active** `designer_clients` row, a lead whose status is not
`declined`/`expired`, or a shared project. `designer_clients` rows are created
with `status = 'lead'` on the lead path (`00399:594-599`), so a household on a
`lead` roster row whose lead has been declined or expired would be offered an
act that raises `no relationship with that counterpart`. The house rule ("an act
that cannot complete is not offered") is now scoped wider than the thing it
guards. Mitigated — the refusal is spoken in the house's own words and has a
test (`says it refused the direct ask in its own words`) — so this is a
narrowing of the rule, not a broken act.

### F8 · minor · "Recorded with your agreement." over an unset money part

`design-build-body.tsx:357-358`: a `draws` part with no ledger and no authored
rows renders `<Recorded />`. The Wave 1 re-gate ruled the opposite for money
parts (rulings, "Re-gate 2 minors fixed before the walk": *"F2 — an unset
deposit part renders nothing on the homeowner's page (R21), not 'Recorded with
your agreement.'"*). The same applies to the `default` schedule arm (`:614-619`)
and the non-schedule fallback (`:623-628`). Unreachable on a **sent** paper
(PART 11 refuses a design-build send with no valid draws), so latent.

### F9 · minor · `0%` and `$0` are still reachable (R21)

`:368` — `row.pct === null ? '—' : \`${row.pct}%\`` prints `0%` for a draw
authored at zero. `scheduleOfValues` prints `$0` for a cost line with
`basisCents: 0` (closed book: `Math.round(0 × sum / basis)`). Both are refused
by the send validators, so latent, but R21's rule is "never print `$0` or `0%`
for an unset money part" and these two paths can.

### F10 · minor · The client surface is not byte-identical to Wave 2 with the flag off

J-7 says *"With `design-build:false`, the Contract Room and the client body
snapshots are unchanged from main."* True of the turnkey code — a `design_build`
document cannot exist with the flag off — but **not** of the client portal as a
whole: the R30 carries change shipped behaviour with no flag at all. Origin
doors now offer a fourth act (`door-acts.tsx`), and a failed papers read now
renders `PapersUnread` instead of `ProjectsEmptyState`
(`letterbox-door.tsx:425-433, 514-517`). Both are mandated by the lane brief and
ruled by R30 — the finding is only that the ship note must say the client portal
is not a no-op with the flag off, and the rollback lever for those two changes
is a revert, not the flag.

### F11–F17 · nits

- **F11** `moneyToTheCent` (`:71-84`) formats dollars through `Intl` with
  `maximumFractionDigits: 0` and appends the two cent digits as text. Correct for
  `USD` in `en-US`; wrong for a zero-decimal currency (JPY would gain a spurious
  `.40`) and for any currency whose symbol trails. `currency` comes from
  `bundle.serviceTerms?.currency`, so it is data-driven, not hard-coded.
- **F12** `deposit-offer.tsx:5` imports `moneyToTheCent` from
  `@/components/commercial/design-build-body`, pulling the whole turnkey body
  (and `@patina/types`) into the threshold surface. A shared cent-exact
  formatter belongs in `lib/utils/format`.
- **F13** `consent-copy.test.ts:62-65` pins the removed fail-open shape as an
  exact string including its newline and six spaces of indentation. A reformat
  that re-introduced the double negative with different whitespace would pass.
- **F14** `apps/client-portal/src/lib/threshold/derive.ts` (comment-only, but a
  source file) is committed in `206c283fd docs(agreements): W3 client lane notes`.
- **F15** `design-build-body.tsx:526-538` (`ListLeaf`) is uncovered per the
  coverage report — a `list` part on a turnkey agreement is unproven.
- **F16** `design-build-door.spec.ts:352` uses
  `page.waitForTimeout(HOLD_MS + 400)`. It is the gesture's own duration, which
  is defensible, but it is still a fixed sleep in a gate.
- **F17** `payToken` is only checked for `typeof === 'string' && length > 0`
  before `payPath = \`/pay/${encodeURIComponent(payToken)}\``. The e2e asserts
  the `/^\/pay\/[0-9a-f]{64}$/` shape; the route does not.

### F18 · minor · RC-7, argued

RC-7 asks whether it is defensible to ask the client for money before the
agreement is fully executed, and whether the door's copy is honest that the
studio has not yet signed. The build's answer: the deposit is billable at
`client_signed` (PART 10 step 3) and the offer reads *"Your deposit is ready —
$8,413.40 / Deposit at signing · due on signing. You can pay now, or your studio
will send it."* The honesty rests entirely on the sentence **above** it (the
consent line: *"my signature alone does not authorize work until the studio
countersigns"*) and on the record's "Awaiting countersignature" line. The offer
itself does not restate it. This reviewer's position: keep the `client_signed`
gate (moving it to `executed` ends P13's "one step"), and add one clause to the
offer — e.g. *"…or your studio will send it once they countersign."* — so the
money sentence is self-contained. Ruling, not a defect.

## Method notes

- Every graft/redefinition check in the METHOD list that concerns SQL —
  head-resolution, DROP of old arities, re-issued grants, pinned-hash re-pins,
  seeded-row immutability, `materialize` stripping owner refs — belongs to the
  backend lane and has **no SQL in this lane's diff** to check. The one SQL fact
  this review established for the client lane is F3.
- The lane sweep claim (`grep -rn "trade_scope" <lane pathspecs>`) was
  re-checked against `client-notes.md` §7 and the diff: every remaining
  `trade_scope` list-member site is either edited, commented as ruled, or out of
  the lane.
- Files changed vs `main`: 25, of which two (`packages/types/src/{agreement,
  commercial}.ts`) are the shared T0 commit and one is this program doc. Two
  files sit outside the build sheet's §2.4 pathspecs — `door-acts.tsx` and
  `letterbox-door.tsx` — and both are mandated by the lane brief's R30 carry.
