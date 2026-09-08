# Wave 3 · lane `edge` — adversarial review, round 3

Reviewer context: separate from the implementer. Branch `agreement/w3-edge` @ `398da9f86`,
worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w3-edge`
(`git rev-parse --show-toplevel` pasted in the report). Base `main` @ `112e6f838`.

Round 3 reviews the state after the lane's round-2 fixes (`bf5bdd5f4`, `398da9f86`).
No new lane commits landed between round 2 and this read.

---

## 1 · Gates, run by the reviewer

```
deno test --allow-all --config …/supabase/functions/deno.json …/supabase/functions/_shared/
  → ok | 352 passed | 0 failed (1s)
deno test … supabase/functions/proposal-send/               → ok | 25 passed | 0 failed
deno test … supabase/functions/commercial-document-notify/  → ok | 47 passed | 0 failed
deno test … supabase/functions/trade-agreement-send/        → ok | 41 passed | 0 failed
deno check --config … trade-agreement-send/index.ts         → Check, no diagnostics
deno check --config … commercial-document-notify/index.ts   → Check, no diagnostics
deno check --config … proposal-send/index.ts                → Check, no diagnostics
ls .../deno.lock  → No such file (worktree root clean)
ls /Users/kody/Code/patina-merged/deno.lock → No such file (repo root clean)
```

Whole-tree sweep, for context: `deno test --no-check … supabase/functions/`
→ `1362 passed | 1 failed | 1 ignored`. The one failure is
`_tests/stripe-rail.test.ts` (`Error: supabaseKey is required` at `:34` — the
harness needs `--env-file supabase/functions/_tests/test.env`), and the type-check
failure the checked run hits is `fulfillment-po/core.ts:314` (`TS2345`,
`Uint8Array` vs `ArrayBuffer`). **Both reproduce on the untouched `main`
checkout** — verified by running `deno check` on `main`'s copy. Neither is this
lane's.

`git diff --stat main...HEAD -- supabase/functions/_shared` → two files, both
**new** (`trade-agreement-emails.ts`, `trade-agreement-emails.test.ts`). No
existing `_shared` file changed. `grep -rln "_shared/trade-agreement-emails"`
→ only `trade-agreement-send/lib.ts` and the new test. **The deploy set stays
exactly three functions**, as §2.2 requires.

`config.toml` parses clean: no duplicate sections, `[functions.trade-agreement-send]`
sits between `trade-rfq-send` and `invoice-check-intent`, `verify_jwt = true`.
No function in this wave carries `verify_jwt = false`.

## 2 · Independent byte-identity proofs (not the lane's own tests)

Two differentials run against `main`'s own module bodies, not against the lane's
pinned digests:

**`proposal-send/renderProposalEmail`** — `main`'s handler and the branch's
handler, same fixture, all five shipped kinds:

```
legacy                       IDENTICAL
design_services              IDENTICAL
furnishings_authorization    IDENTICAL
service_addendum             IDENTICAL
trade_scope                  IDENTICAL
```

**`commercial-document-notify/renderCommercialEmail`** — 10 transitions ×
5 shipped kinds × 2 audiences × 3 channel states × 2 `hasScan` values:

```
compared 600 combinations, drift=0
```

The `design_build` arm therefore cannot reach a shipped kind. DENO-3's own
digest table is a real pin (its digests differ from mine only because the
fixtures differ).

## 3 · The DB manifest, re-derived by the reviewer

The lane's round-2 manifest was re-read against the backend branch's applied SQL
(`agreement/w3-backend` @ `985e8ae94`), not taken on trust. Every row I checked
is correct:

| Claim | Verified at | Result |
|---|---|---|
| `send_trade_agreement RETURNS jsonb`, camelCase `state`/`sentAt` | `00579:513`, `:546-559` | correct — `jsonb_build_object('…','state',…,'sentAt',…)` |
| `sent_at = COALESCE(sent_at, now())` (first send only) | `00579:541` | correct |
| state gate `IN ('draft','sent')` | `00579:534` | correct |
| `GRANT EXECUTE … TO authenticated` | `00579:564` | correct — the anon-key-plus-caller-header client is right |
| `mint_trade_agreement_token RETURNS TABLE (id uuid, token text)` | `00579:577`, `RETURN QUERY :617` | correct — `data[0].token` |
| mint is `service_role` only, requires `state IN ('sent','signed')` | `00579:588-591`, `:599-603` | correct; commit-before-mint ordering is required and is what the lane does |
| `guard_trade_agreement_authored` is **column-scoped** | `00579:210-250` | correct — early return on `OLD.state='draft'`, then 21 content columns; `state`, `sent_at`, `signed_at`, `voided_at`, `void_reason`, `updated_at` absent |
| the 18 selected columns | `00579:47-87` | all present, spelled as selected |
| `is_active_studio_member(p_org uuid)`, granted `authenticated, service_role` | `00417:40`, `:58` | pre-existing, arg name matches |
| `agreement_draw_invoices(id, proposal_id, invoice_id)` | `00578:394-405` | all three present |
| `proposals.document_kind` admits `'design_build'` | `00578:123`, `:146` | both CHECKs widened |
| `studio_trade_agreement_tokens.created_by` nullable | `00579:182` | correct — a service-role mint leaves `auth.uid()` NULL |

**F7 and F16 are closed on the evidence.** F7's one real drift (`sent_at` vs
`sentAt`) was found and fixed by the lane in round 2 and the fix is right.
F16's worry does not bite: the guard is column-scoped in the applied SQL.

Cross-lane interfaces also check out: the designer lane posts
`agreement_draw_ready` (`turnkey/draw-ledger.tsx:88`, I-7) and invokes
`trade-agreement-send` with `{ agreementId, mode:'send' }`
(`use-trade-agreements.ts:239`, I-4), surfacing this function's `detail` string
verbatim to the studio. The sub lane's route is at
`apps/client-portal/src/app/trade/[token]/page.tsx`, matching the
`CLIENT_PORTAL_URL + '/trade/' + token` the letter builds.

## 4 · Findings

Severity/confidence per finding; the orchestrator filters. Nothing here is a
blocker and nothing is a major — **verdict `ship`**, with the carried list below
owed to integration.

### Minor

**E-R3-1 · SQL-A10 exists only on this lane's branch, and no test anywhere
asserts the resend behaviour.** (confidence 0.95)
The lane's round-2 fix amended `build-sheet.md` §3.2 (column-scoped guard, pinned
return shapes) and added SQL-A10. `grep -c "SQL-A10"` per branch:
`agreement/w3-edge` → 1; `main`, `w3-backend`, `w3-designer`, `w3-sub`,
`w3-client` → 0. The backend lane branched and finished before the amendment
existed; its `supabase/tests/commercial/trade_agreement_test.sql` (759 lines,
SQL-A1…A9) never sends an agreement twice — `grep -i "resend\|sent_at"` returns
nothing. The Deno side (`index.test.ts:659`) hands `commitSend` a stub returning
`sentAt: "2026-09-01T…"` and asserts the stub's own premise, so it would pass
identically if the RPC restamped. Net: `COALESCE(sent_at, now())` and the
column-scoped guard are both correct in `00579`, and both are untested. Also:
if the merge takes `main`'s copy of `build-sheet.md`, the amendment and SQL-A10
vanish. *Fix:* carry the §3.2 paragraph + SQL-A10 forward at merge, and write
SQL-A10 into `trade_agreement_test.sql`.

**E-R3-2 · A resend revokes the sub's live link before the letter is attempted;
a failed send leaves them with nothing.** (confidence 0.75)
`mint_trade_agreement_token` is revoke-then-mint (`00579:605-606`), and
`lib.ts:446` mints before `lib.ts:459` sends. On a **resend**, a `502
send_failed` (`lib.ts:473`/`:477`) has already killed the token the sub was
holding, and no replacement letter went out — the sub's working link is dead and
they were told nothing. Recoverable (state `'sent'` is still sendable, so the
designer can press Send again), and it cannot happen on a first send. *Fix:*
record it, or move the mint after a successful send for the resend case.

**F8 (carried, not fixed) · The turnkey letter suppresses the correctly-labelled
Retainer line along with the mislabelled ceiling.** (confidence 0.9)
`core.ts:251` — `const authority = isDesignBuild ? '' : [ceiling…, retainer…]`.
R9 sanctions a retainer part on `design_build` (`build-sheet.md:52`:
"+ `retainer`/`ceiling` if the studio adds those parts"), `00578:4996` includes
`'retainer'` in the projecting variant set, `00578:5110-5119` builds
`retainerAmountCents`, and `00578:5979-5994` issues the retainer invoice at
countersign for the class — SQL-T14 exists for exactly that path. The ceiling
label was the defect; the retainer label was correct in both classes.
`core.test.ts` now pins the suppression (`assert(!email.html.includes('Retainer'))`),
so the wrong behaviour is cemented. Reviewer probe: every `design_build` client
letter renders with **zero** `$` figures, including one carrying
`retainerCents: 1_200_000`. *Fix:* suppress or re-label only the ceiling line;
keep the retainer line, with a fixture asserting its presence.
(Adjacent, backend's not this lane's: `00578:5986`/`:5994` hard-code the invoice
description `'Design services retainer · …'` and metadata kind
`'design_services_retainer'` for a turnkey agreement.)

**F1 (carried, not fixed) · The subcontractor's letter carries the designer
portal's footer.** (confidence 0.95)
`trade-agreement-emails.ts:238` calls `renderBrandedShell` without `audience`,
which defaults to `"designer"` (`branded-email.ts:211`). Rendered and probed:
`Dashboard` → true, `Help center` → true, `app.patina.cloud` → true,
`desk?account=notifications` → true, `Email preferences` → true, "A workshop for
interior designers…" → true. The recipient has no Patina account by design
(R16), which the letter's own body says two paragraphs earlier ("no account, no
password") — every one of those links is a dead end for them. Inherited verbatim
from the shipped `trade-rfq-emails.ts:146-152`, so it is not a regression.
Reported as E6 (round 1) and F1 (round 2); unaddressed three rounds running.
*Fix:* pass explicit `footerLinks`/`businessAddress` for a login-less recipient.

**F2 (carried, not fixed) · A transient DB error collapses into `404
trade_agreement_not_found`.** (confidence 0.9)
`index.ts:122-125` logs and returns `null` on any Supabase error; `lib.ts:349`
turns `null` into 404. A pooler blip is indistinguishable to the designer from a
deleted row. Inherited from `trade-rfq-send/index.ts:106-110`.

**F10 (carried, accepted) · The `alreadySigned` receipt letter is
undeliverable.** (confidence 0.9)
`lib.ts:370` sets `alreadySigned = state === 'signed'`; `lib.ts:409-420` returns
409 for that state before the mint and the letter. In `send` mode
`alreadySigned` is therefore always false, so `buildTradeAgreementEmail`'s
receipt branch (`trade-agreement-emails.ts:160-174, :230`) can only ever render
into a `preview` JSON response the studio reads (`index.test.ts:755`), never into
the sub's inbox. The lane's own round-0 rationale for a signed resend ("the sub
lost the email") is unimplementable as shipped.

**F11 (carried, not fixed) · The lane log states the pre-fix contract at the top
and contradicts itself 250 lines down.** (confidence 0.95)
`edge-notes.md` §3 "Shape" item 3 still reads "The state ratchet has two terminal
values, not two" (typo) and "A resend of a signed agreement still re-mints and
re-emails … and `state` is omitted from the patch entirely" — both false since
round 1 (409; the RPC owns the write). The "Owed to the backend lane" preamble
still says "**migration 2 does not exist in this worktree**", contradicted by the
round-2 section above it in fact and below it in the file. Integration reading
top-down gets the wrong contract for the designer lane's Send control. *Fix:*
edit the statements in place; an appended fix log is not a correction.

### Nit

**F3 (carried) · DENO-5's forbidden-term loop remains vacuous — and its prescribed
fix was wrong.** (confidence 0.8)
`trade-agreement-emails.test.ts:215-252` calls `scope` "the only route by which any
of the forbidden facts below could reach this letter at all", then passes benign
prose, so the loop over `["halvorsen","84,134","gmp","bid",…]` asserts nothing
that could fail. **But** round 2's suggested fix — paste "Halvorsen" into `scope`
and assert absence — would make the test fail, because `scope` renders verbatim
by design. The real rule is "no param *other than* scope can carry one", and the
strong version of exactly that already exists at
`trade-agreement-send/index.test.ts:784-822` (a row with
`projectName`/`clientName`/`gmpCents`/`scheduleOfValues` bolted on, asserting none
reaches the letter, plus a one-figure count). The `$`-count assertion in the
`_shared` test is also real. Recorded so it is not re-raised; the honest fix is
one sentence of comment, not a new assertion.

**F12 (carried) · The 409 detail ternary is binary.** (confidence 0.9)
`lib.ts:413-415` — anything not `'signed'` is described as *"This Trade Agreement
has been withdrawn. Draft a new one to send."* Only `'void'` reaches the else
today (`00579:79-80`'s CHECK is `draft|sent|signed|void`). Now demonstrably
user-facing: the designer hook surfaces `detail` verbatim
(`use-trade-agreements.ts:220`).

**F13 (carried) · `TradeAgreementRow.contactDisplayName` is company-first, so the
field does not mean the column it is named after.** (confidence 0.85)
`index.ts:159-160` — `row.contact_company_name?.trim() || row.contact_display_name`.
In SQL the key always means the column: `00579:339`, `:552`, `:705`, `:956` all
emit `'contactDisplayName', … .contact_display_name`. Internal to this function
(it is only used for the greeting and never emitted under that key in a
response), so harmless — but the name is misleading across the lane boundary.

**F14 (carried, unruled) · The build sheet still contradicts itself on resending a
signed agreement.** (confidence 0.6)
`build-sheet.md:688-689` and walk step 16 say a signed agreement's token is
revoked in the signing transaction (`00579` PART 11 confirms it); DENO-4
(`:1028`) requires a test that "a resend of a `signed` agreement never downgrades
`state`", which presumes the resend happens. The lane refuses it with 409. Both
the `sub` and `designer` lanes depend on which reading holds. Rule it at
integration and record it beside R16.

**F15 (carried) · The `design_build` + `channel:'paper'` arm is unreachable by
design.** (confidence 0.9)
`core.ts:106-110` plus its test at `core.test.ts:418`. `00578:48-55` states
`_issue_design_services_agreement_on_paper` and
`_record_paper_client_signature_impl` "stay closed to `'design_build'` ON
PURPOSE", and `00578:1620-1628` confirms the guard's widening is deliberately
shut one level down at the RPC. Harmless defence; recorded so it is not read as
evidence that paper turnkey execution ships.

**F17 (carried) · `budget_published` keeps the design-services sentence for the
new kind.** (confidence 0.4)
`core.ts:138-145` has no turnkey arm, so a turnkey client is told acknowledging
the working budget "does not authorize purchasing" — literally true (the
checkpoint authorizes nothing in either class), but the framing for `design_build`
is the draw schedule. SQL-T15 expects a budget checkpoint to publish on a
design-build project, so the path is reachable. Either add a turnkey sentence or
record that the generic copy is intended.

**F4 (carried) · Assertion-library drift.** (confidence 0.9)
The two new test files import `std@0.168.0/testing/asserts.ts`;
`proposal-send/commercial-render.test.ts` imports `std@0.224.0/assert/mod.ts`.
Both already exist in the tree and `trade-rfq-send/index.test.ts:17` uses 0.168,
so the new files match their twin. Note only.

**F5 (carried) · Unreachable fallbacks for NOT NULL / CHECKed columns.**
(confidence 0.9) `index.ts:143-146` falls back to `"this scope of work"` and
`""`; `00579:61-62` declares both `NOT NULL CHECK (char_length(btrim(…)) > 0)`.
Harmless defence.

**F6 (carried) · `CallerUser.email` is resolved and carried but never read.**
(confidence 0.8) `lib.ts:120-123`, populated at `index.ts:100`. `trade-rfq-send`
carries the same dead field.

## 5 · Checked and clean

- **Scope.** Every changed path is inside §2.2's list, plus the shared T0 types
  commit `f108672f5` (`git diff agreement/w3-backend agreement/w3-edge --
  packages/types/src/{agreement,commercial}.ts` → empty; the same commit, not lane
  drift) and the program docs. No other lane touched `build-sheet.md`, so the
  amendment does not conflict.
- **Vocabulary.** No "clause library", "contract builder", "variant", "AI", or a
  database column name in any rendered string. The `design_build` copy matches
  §3.3:717's mandate word for word (label `design-build agreement`, eyebrow
  `Design-build`, heading `Your design-build agreement is ready`, CTA `Review
  agreement`). Homeowner letters probed for `gate`/`task`/`dashboard`/`overdue`:
  none (the `Dashboard` hits are the studio-audience footer, which is the shipped
  designer shell). An unrecognised `lien_waiver_policy` prints a sentence, never
  the stored value.
- **R5 / R13.** No turnkey client letter renders a `$` figure. `loadAgreement`'s
  select omits `project_id`, `source_proposal_id` and `sov_line_ids`, and
  `TradeAgreementEmailParams` has no field that could carry a client name, the
  GMP, an SOV or another sub's number.
- **`deposit_ready` stays closed to `design_build`** (`policy.ts:143-147`),
  per §3.3:731 and R15 — the offer reaches the client on the door, not by email.
- **`agreement_draw_ready` evidence** is exact parity with the shipped
  `trade_draw_ready` path: loader scoped `(id, proposal_id)`, policy requires
  `executed` + bound design-build document + `eventId` + `draw.id === eventId` +
  invoice `sent|partially_paid`, and the transition is event-scoped for
  idempotency.
- **No Stripe code** anywhere in the lane's diff (D-W3-1 honoured).
- **Nothing deployed, no migration written by this lane, no shared-stack write.**

---

## 6 · Verdict

**ship** — no blocker, no major. Twelve carried minors/nits and two new minors,
listed above; E-R3-1 (carry the build-sheet amendment forward and write SQL-A10)
is the one integration must actually act on before the deploy set is cut.
