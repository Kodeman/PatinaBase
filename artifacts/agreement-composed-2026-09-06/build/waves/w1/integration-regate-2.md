# Wave 1 — RE-GATE 2, the close-out

**The Agreement, Composed** · Wave 1 (*loosen the room*) · 2026-09-07
Reviewer: re-gate lane, second pass. **I did not write this code.**

```
$ git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w1-integration rev-parse --show-toplevel
/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w1-integration
$ git rev-parse HEAD
fb811e6037c930521bb650bd1982ffc1b09da927
$ git branch --show-current
agreement/w1-integration
```

**Verdict: NOT gate-clean — by one ruling, and only one.**

Every gate is green. Every probe refuses. R22, R23, R24, R25, R26, R29 hold as
ruled; R27 holds in the half that matters and is looser than its words in the
other. **R28 does not hold on any document a homeowner can actually be sent.**
The billing cadence that R28's own banner names as the harm — *"the cadence
printed 'Monthly' on the page the homeowner signs under a schedule nobody had
chosen"* — still prints Monthly. The `COALESCE(…, 'monthly')` the ruling removed
was never the thing that put it there; `proposal_service_terms.billing_cadence`
is `NOT NULL DEFAULT 'monthly'` and the seven-facet room's blank form ships that
value on every save. Proof in §4, F1.

Nothing here costs data integrity. F1 is a term on the page she signs.

---

## 0 · A note on where these documents live

The program brief's read-list points at
`/Users/kody/Code/patina-merged/artifacts/agreement-composed-2026-09-06/build/waves/w1/`
— the **main checkout's** copy, which is four files behind: it carries no
`backend-review-r3.md`, `backend-review-r4.md`, `designer-review-r3.md` or
`integration-regate.md`. The authoritative set is the one tracked on this
branch, in this worktree (`git ls-files` lists all 23). Every quotation below is
from the worktree copy. This report is written to the worktree path and
committed there; a copy is left at the brief's path so the orchestrator finds it
where it was asked for.

---

## 1 · The stack matches the branch. It was not reset.

`00575_agreement_parts.sql` was edited again by the close-out lane (+156 lines
across R22/R25/R28), so the ledger number proves nothing on its own. Every
function body in the file was read out of `pg_proc.prosrc` and compared to the
file text:

```
$ psql … -c "select version from supabase_migrations.schema_migrations order by version desc limit 6"
 00575 / 00574 / 00573 / 00572 / 00571 / 00569

$ python3 …   # every CREATE OR REPLACE FUNCTION body in 00575 vs pg_proc.prosrc
functions defined in 00575: 19  bodies checked: 19
MISSING from db: none
MISMATCH (file body not in applied prosrc): none
```

Marker probes for the three close-out edits, read out of the catalog, not the
file:

| Ruling | Probe | Applied |
|---|---|---|
| R22 | `_agreement_fee_unnamed` exists | `1` |
| R22 | call sites = `send_commercial_document`, `_sign_design_services_agreement_authorized`, `_issue_design_services_agreement_on_paper`, `upsert_agreement_parts` | `4` |
| R25 | `get_client_commercial_document_bundle` carries `'composed', EXISTS` | `true` |
| R28 | `materialize_standard_parts` seeds `'cents', v_terms.retainer_amount_cents` (no `COALESCE(…,0)`) | `true` |
| R28 | `materialize_standard_parts` no longer carries `v_defaults.cadence, 'monthly'` | `true` |
| R26 | `select count(*) from proposal_agreement_parts` (the seed fixture) | `7` |

The stack is the close-out tree. **No reset was performed by this re-gate**, and
`stack-notice.md` records that. `git status --porcelain` is empty; migration
`00575` is still unique against `origin/main` (`3a9472f92`, head `00574`).

---

## 2 · The probes, written fresh and run straight through the granted RPCs

`/tmp/claude-501/regate2/regate2-probe.sql` — the lane's fixture prologue
(`agreement_parts_test.sql:57-197`) plus my own assertions, not the lane's. One
transaction, `ROLLBACK` at the end, `ON_ERROR_STOP=1`, **rc=0**. A probe that
did not refuse would have raised `… DID NOT REFUSE`; a probe that refused with
the wrong sentence would have raised `… REFUSED BUT WITH THE WRONG SENTENCE`.

```
R3 save            REFUSES: This agreement names no fee. Add a rate card, a flat fee, or a per-phase fee. [23514]
Q5 save            REFUSES: This agreement names no fee. Add a rate card, a flat fee, or a per-phase fee. [23514]
Q5 CONTROL:        the same composition, client-visible, SAVES
R22 send door      REFUSES: This agreement names no fee. … [23514]
SEND CONTROL:      with the fee on her page the agreement SENDS
R22 sign door      REFUSES: This agreement names no fee. … [23514]
R22 paper door     REFUSES: This agreement names no fee. … [23514]
P16                REFUSES: This agreement is composed from parts. Open it in the
                   Contract Room with parts on to change it. [23514]
P16 AFTERMATH:     nothing moved — ceiling 2400000, biweekly, 22500, 4 parts
P3b (authenticated)       REFUSES: permission denied for table proposal_service_terms [42501]
P3b rates (authenticated) REFUSES: permission denied for table proposal_service_rates [42501]
P3b delete (authenticated) REFUSES: permission denied for table proposal_service_terms [42501]
P3b (table owner)         REFUSES: This agreement is composed from parts. … [23514]
P3b rates (table owner)   REFUSES: This agreement is composed from parts. … [23514]
P3b GUC names another proposal REFUSES: This agreement is composed from parts. … [23514]
P3b AFTERMATH:     the cap still reads 2400000
CONTROL:           the seven-facet room still authors an uncomposed agreement (ceiling 500000)
ROLLBACK
```

**R3** — two clause parts, no money part at all. Refused at the save door in the
readiness panel's own sentence.

**Q5** — a rate card at $225/hr and a $24,000 ceiling, both `clientVisible:
false`. Refused. The identical composition with both parts visible saves, sends,
and returns a fingerprint — so the refusal is scoped to *what the homeowner
reads*, not to the shape.

**The three doors.** Send, sign and paper were each reached with a composition
that once named a fee and no longer does. Two mechanics worth recording:

- Between send and sign, `proposal_agreement_parts` is frozen
  (`guard_commercial_authored_child` — "immutable after its proposal leaves
  draft"). Reaching the sign door at all required suspending that trigger as the
  table owner (`session_replication_role = replica`). That the freeze had to be
  defeated first is itself the belt; R22's check on the sign door is the braces,
  and it holds.
- The paper door was probed through the granted wrapper
  `record_paper_client_signature(…, p_issue_on_paper => true)`, not the revoked
  impl.

**P16** — the co-member whose portal never got the flag calls
`upsert_design_services_draft` over a composed draft. Refused with the ruled
sentence and the ruled `agreement_composed` DETAIL, and the aftermath read is
exact: ceiling still 2,400,000, cadence still biweekly, rate still 22,500, four
parts untouched.

**P3b** — run five ways. As `authenticated`, UPDATE and DELETE on both
projection tables are `42501 permission denied` (R17(c) took the grant). As the
**table owner**, past every ACL and every policy, the trigger refuses in the same
sentence. Setting `app.agreement_projection` to a *different* proposal does not
open the door. The cap still reads 2,400,000.

**Control** — an uncomposed agreement is unmoved: the seven-facet room still
authors it. The refusal is scoped to composition, not to the door.

---

## 3 · R22–R29, each against the diff

### R22 · The fee floor lives in the database — **HOLDS**

`00575:446-489` adds `_agreement_fee_unnamed`, and it is asked at exactly the
four places `_agreement_floor_unmet` is asked:

```
662:     OR (public._agreement_requires_rate_card(p_proposal_id)     ← send_commercial_document
673:     AND public._agreement_floor_unmet(p_proposal_id) THEN
679:     AND public._agreement_fee_unnamed(p_proposal_id) THEN
959/966/971   ← _sign_design_services_agreement_authorized
1086/1094/1099 ← _issue_design_services_agreement_on_paper
2734/2742      ← upsert_agreement_parts
```

The fee set is the ruled one and no wider:

```sql
AND ap.client_visible
AND ap.kind = 'schedule'
AND (
  (ap.variant = 'rate_card' AND EXISTS (… roleName <> '' AND hourlyRateCents > 0))
  OR (ap.variant = 'flat'     AND jsonb_typeof(ap.payload->'cents') = 'number' AND … > 0)
  OR (ap.variant = 'per_phase' AND EXISTS (… phase cents > 0))
)
```

`rate_card`, `flat`, `per_phase` — a ceiling is a cap, a retainer is money held,
a cadence is when invoices go out; none of them qualifies. The backend
reviewer's suggested fix listed `retainer` among the fee set; the ruling did not,
and the code follows the **ruling**. Correct.

`jsonb_typeof` is asked before every cast, so a malformed payload fails the test
rather than raising mid-send. The predicate short-circuits on
`EXISTS (… parts)`, so a document with no parts is never asked — flag-off
byte-identity survives.

The room asks the same question with the same sentence:

```ts
// agreement/readiness.ts:63
const FEE_VARIANTS = ["rate_card", "flat", "per_phase"] as const;
// :245-248
"This agreement names no fee. Add a rate card, a flat fee, or a per-phase fee."
```

Byte-identical to the four `RAISE EXCEPTION` strings. `ceiling` was removed from
`FEE_VARIANTS` in the same commit. Panel and database ask one question.

Probes R3 and Q5 are pinned as SQL cases — `agreement_parts_test.sql` header
item (15) names both, and the suite passes (§5).

### R23 · One data layer — **HOLDS**

```
$ grep -rn --include='*.ts*' -E "useAgreementParts|useSaveAgreementParts|useDiscardAgreementParts|useMaterializeStandardParts|useStudioAgreementDefaults" apps packages | grep -v '^packages/supabase/src'
apps/…/agreement-composer.tsx:24-26   useDiscardAgreementParts, useMaterializeStandardParts, useSaveAgreementParts  ← from "@patina/supabase"
apps/…/account-studio-page.tsx:33      useStudioAgreementDefaults                                                   ← from "@patina/supabase"
apps/designer-portal/src/hooks/use-commercial-documents.ts:524-526                                                  ← a comment, not a definition
```

`apps/designer-portal/src/hooks/` holds no `use-agreement-parts.ts` and no
`use-studio-agreement-defaults.ts`. The portal-local `agreementPartsKey`,
`toPartPayload`, `settleAgreementParts`, `useSaveAgreementParts` and
`useMaterializeStandardParts` are gone (`b102f2038`, −84 lines). The package
tests stay (87 vitest files, 1068 passing).

The one thing that stayed behind is named and justified: the **bundle** read at
`use-commercial-documents.ts:371` still queries `proposal_agreement_parts`
directly, because it is this app's own composite and it resolves a missing
relation (42P01 / PGRST205 / 42501) to "this document has no parts" — the
behaviour that keeps a portal pointed at a pre-00575 database rendering exactly
what it rendered before. That is not a duplicate of the hooks; it is a different
function with a different contract, and its three error codes are covered
(`use-commercial-documents.test.ts:1232,1245,1260`).

### R24 · Composition is reversible — **HOLDS**

Composer, draft only (`readOnly = document.state !== "draft"`, `:110`), studio
side:

```tsx
{!readOnly && (
  <Button variant="secondary" onClick={() => void returnToFacets()} loading={discard.isPending}>
    {AGREEMENT_PART_COPY.returnToFacets}          // "Return to the seven facets"
  </Button>
)}
```

`returnToFacets` awaits `discard.mutateAsync()` then calls `onReturnToFacets?.()`;
the room above flips `returnedToFacets` and renders the seven facets for the rest
of the visit (`service-agreement-drafting-room.tsx:128,141`). Opening again
re-materializes — as ruled, untouched.

The seven-facet room names the act:

```
composedElsewhere: "This agreement is composed from parts. It is edited in the
Contract Room with parts on, where it can also be returned to the seven facets."
```

and holds both acts before she retypes anything — `disabled={composed}` on Review
& send (`:337`), `disabled={!dirty || composed}` on Save (`:366`), plus an early
`if (composed) return` in `reviewAndSend`. `composed` is
`(bundle.data.parts?.length ?? 0) > 0`, so every document today renders exactly
as it always has. `discard_agreement_parts` is granted to `authenticated` and
nothing else.

This closes the R17(b) half the first re-gate found open.

### R25 · The homeowner reads parts only — **HOLDS** (one nit, F4)

`get_client_commercial_document_bundle` emits `composed` on both branches — the
retired early return (`'composed', false`) and the main one:

```sql
'composed', EXISTS (
  SELECT 1 FROM public.proposal_agreement_parts ap
  WHERE ap.proposal_id = p_proposal_id
),
```

Read over **every** part, not the `client_visible`-filtered array beside it —
which is the whole point: an agreement whose every part the studio kept arrives
with `parts: []` and must still render as composed. The client shell branches on
`bundle.composed ?? bundle.parts.length > 0` and, when composed, renders
`<AgreementPartsBody>` and nothing else. The three-state adapter
(`commercial-documents.ts:626`) keeps `null` for a bundle that did not say, so
today's documents take today's path.

The only remaining read of `serviceTerms` on the composed path is the currency
and a null guard — F4, proved unreachable.

### R26 · The e2e assertion is real — **HOLDS**

`supabase/seed/the-client-page.sql` now lays the solo client's executed agreement
down composed: the proposal is inserted as a **draft**, then the terms row and
rates, then seven `proposal_agreement_parts`, then promoted to executed under
`app.proposal_accept_id` / `app.commercial_document_id`. That order is forced —
parts freeze when the proposal leaves draft, and once parts exist the money row
is a projection. The seed's own comment walks the four steps.

Live on the stack: `select count(*) from proposal_agreement_parts` → **7**.

The assertion is unconditional. The `if (await shell.getByTestId(
'agreement-parts-body').count()) { … } else { expect(parts.count()).toBe(0) }`
branch — which on every stack that existed took the leg that could not fail — is
gone, replaced by:

```ts
expect(await shell.getByTestId('agreement-parts-body').count()).toBe(1);
expect(await parts.count()).toBe(SEEDED_AGREEMENT_PART_TITLES.length);   // 7
expect(titles).toEqual(SEEDED_AGREEMENT_PART_TITLES);
expect(positions).toEqual([...positions].sort((a, b) => a - b));
expect(await shell.getByText(/require a separate named furnishings authorization/i).count()).toBe(1);
```

It **ran and passed** in this re-gate's e2e (§5, `threshold.spec.ts:415`) — the
one reading of a composed agreement that goes through the real RPC.

### R27 · One copy constant, both surfaces — **HOLDS in the half that matters**

`packages/types/src/agreement-copy.ts` is the single source, and both
`agreement-parts-body.tsx` files import `AGREEMENT_PART_COPY`,
`agreementRetainerActivation`, `agreementCadenceText`, `agreementDepositLine`.
`notYetSet` is defined once. Neither file retypes a client-facing sentence.

The second clause — *"the designer's live preview renders through the same body
component contract as the client"* — is delivered as **one spec, two
implementations**, which the designer file's own header says outright. They share
the contract (same part shape, same drop-the-section-when-a-leaf-draws-nothing
rule, same constants) but not the component, and two implementations can drift.
Three places where they already do: F3. None reachable through the W1 Add menu
except the whitespace case.

### R28 · Nothing the designer did not type prints as a term — **DOES NOT HOLD**

Four of the five seeded money parts obey the rule. The fifth does not, and it is
the one the ruling's own banner names. Full evidence in F1.

| Seeded part | Source after R28 | Verdict |
|---|---|---|
| `patina.ceiling` | `v_terms.billing_ceiling_cents` (nullable) | ✔ only when set |
| `patina.role_rates` | this document's rates, else the studio's default card | ✔ |
| `patina.deposit` | `COALESCE(v_terms.furnishings_deposit_percent, v_defaults.deposit_percent)` — both nullable | ✔ |
| `patina.retainer` | `v_terms.retainer_amount_cents` — `NOT NULL DEFAULT 0`, and 0 prints "Not yet set" (R21) | ✔ in effect |
| `patina.cadence` | `COALESCE(v_terms.billing_cadence, v_defaults.cadence)` — but `billing_cadence` is `NOT NULL DEFAULT 'monthly'` | ✘ **F1** |

### R29 · N1 gets its test — **HOLDS**

`agreement-composer.test.tsx` gains a two-case describe block covering both ends
of the two-click path:

- *"does not offer a second ceiling once the agreement carries one"* — opens the
  Add menu over a composition that already carries a ceiling, asserts `Ceiling`
  is absent **and** `Clause` is present, so the absence is a filter and not an
  unopened menu (R18's first click).
- *"reports a duplicate money part and holds the save"* — two ceilings, asserts
  the readiness sentence "An agreement carries only one ceiling.", dirties the
  composition so nothing else can be what holds the act, then asserts Save
  disabled, Review & send disabled, and `mockSaveParts` never called.

The sentence is built in one place (`duplicateMoneyBlocker`) and is the RPC's own
wording. Both cases pass in the full designer jest run.

---

## 4 · Findings

### F1 · major · confidence 0.85 — R28 is not delivered on any document a homeowner can be sent: a billing cadence nobody chose still prints "Monthly"

`supabase/migrations/00575_agreement_parts.sql:3101-3103`

R28's banner names the harm precisely: *"the cadence in particular printed
'Monthly' on the page the homeowner signs under a schedule nobody had chosen."*
The fix removed the literal from the `COALESCE`:

```sql
(p_proposal_id, 8, 'schedule', 'cadence', 'patina.cadence', 'Billing cadence',
 jsonb_build_object('cadence',
   COALESCE(v_terms.billing_cadence, v_defaults.cadence)),      -- was: , 'monthly'
 false, true),
```

But that literal was never what put "Monthly" on the page. The column is:

```
$ psql … information_schema.columns
billing_cadence | NO (not null) | 'monthly'::text
```

so `v_terms.billing_cadence` is **never** null whenever a terms row exists — and
the seven-facet room ships one on every save, its blank form pre-set to monthly
(`service-agreement-drafting-room.tsx:79`, `billingCadence: "monthly"`). Probe,
straight through the granted RPCs, on a draft saved with **no** `billingCadence`
key in the payload at all:

```
SEEDED patina.role_rates  →  {"roles": [{"roleName": "Lead Designer", …}]}
SEEDED patina.ceiling     →  {"cents": 2400000}
SEEDED patina.deposit     →  {"depositPercent": null}
SEEDED patina.retainer    →  {"cents": 0, …}
SEEDED patina.cadence     →  {"cadence": "monthly"}          ← nobody chose this
```

Both bodies then print it: `agreementCadenceText("monthly")` under a "Billing
cadence" heading, capitalized by the renderer — "Monthly", on the page she signs.

The branch R28 actually closed — `v_terms IS NULL`, i.e. a draft with no terms
row at all — cannot reach a homeowner. Probed:

```
AFTER MATERIALIZE: terms rows=0 parts=9
SEND REFUSED: design-services send requires terms, and role rates whenever
              a rate card is present [23514]
```

So the fix lands entirely in unreachable territory and the named harm survives
intact on every sendable document.

**Fix** — seed `patina.cadence` only from a cadence somebody chose. Either give
the projection a nullable "chosen" signal, or leave the part unset when the terms
row carries only the column default, and let the readiness panel ask for it (it
already does, per the migration's own comment).

**The honest counter-argument, for the orchestrator, not for me to settle**: the
room's cadence is a visible `<select>` reading "Monthly" that the designer saw and
saved, unlike a hidden `COALESCE`. If Kody or Leah rules that seeing and saving a
pre-set control *is* choosing, R28 is satisfied and this finding closes as a
ruling rather than a fix. Nothing in the ruling text says so today.

### F2 · minor · confidence 0.70 — an unset furnishings deposit says "Recorded with your agreement." under its own heading

`apps/client-portal/src/components/agreement-parts-body.tsx` (`ProcurementLeaf`)
and the designer twin's `case "procurement"`.

R28's outcome sentence is *"otherwise the part is unset and prints 'Not yet
set'."* For a deposit nobody set, the seeded payload is `{"depositPercent":
null}` (probed above) and both surfaces fall to `RecordedLine` — "Recorded with
your agreement." — which under a "Furnishings deposit" heading asserts that
something *was* recorded when nothing was. R21 separately reasons that a percent
has no "Not yet set" twin on today's paper and should draw nothing; the code
comments cite exactly that. So the implementation is defensible and honest about
figures, but it matches neither ruling's stated words.

The same shape reaches an unset retainer (`cents === null` → `RecordedLine`),
though only on the no-terms-row draft that F1 proves is unsendable — so on the
homeowner's page the retainer is always `{"cents": 0}` and correctly reads "Not
yet set".

**Fix** — either drop the section entirely for an unwritten deposit (R21's own
reasoning), or amend R28's sentence. A one-line ruling, not a redesign.

### F3 · minor · confidence 0.60 — the two body implementations drift in three places

`apps/client-portal/src/components/agreement-parts-body.tsx` vs
`apps/designer-portal/src/components/document/commercial/agreement-parts-body.tsx`

R27's second clause asks for one body contract; what shipped is one spec and two
implementations. Where they already disagree:

| Case | Client (the page she signs) | Designer preview |
|---|---|---|
| clause body `"   "` | `if (!body) return null` → **renders a naked heading over blank paper** | `if (!body.trim()) return null` → section dropped |
| list item text `"   "` | `filter(text.length > 0)` → renders `— ` | `filter(text.trim())` → dropped |
| `per_phase` phase with no cents | `phase.cents === null ? '—'` | `readPhases` coerces to `0` → prints **`$0.00`** |

The whitespace cases are reachable by typing a space and violate R21/R3-6 ("empty
clause/list parts render nothing, not a naked heading") on the client side. The
`per_phase` case would print `$0.00` for an unwritten figure — an R21 violation
in the preview — but `flat` and `per_phase` are deliberately absent from the W1
Add menu (`part-kinds.ts:170`), so nothing can compose one this wave.

**Fix** — trim in the client leaf, and give `readPhases` a nullable `cents`
before W2 opens `per_phase`.

### F4 · nit · confidence 0.90 — the composed client body still reads `bundle.serviceTerms`, twice

`apps/client-portal/src/components/commercial-document-shell.tsx:181-206`

```tsx
const terms = bundle.serviceTerms;
if (!terms) return null;                                    // ← guard
…
if (bundle.composed ?? bundle.parts.length > 0) {
  return <AgreementPartsBody parts={bundle.parts} currency={terms.currency} />;   // ← currency
}
```

R25 says the composed body "never falls back to `serviceTerms`". Two reads
survive: the null guard (a composed agreement with no terms row would render the
header, the execution mark and the footer around **nothing**) and the currency.

I probed the guard rather than trusting the comment: a materialized draft with no
terms row cannot be sent — `send_commercial_document` refuses with *"design-
services send requires terms, and role rates whenever a rate card is present"* —
so the blank page is unreachable through the product. Currency has no other
source in W1; W2's consultation/furnishings classes are where this needs
revisiting, and the file already says so.

Recorded so the next wave does not inherit it silently.

### F5 · nit · confidence 0.80 — `materialize_standard_parts` still writes a Services sentence the designer never typed

`supabase/migrations/00575_agreement_parts.sql:3064-3065`

```sql
jsonb_build_object('body', COALESCE(NULLIF(v_terms.scope, ''),
  'Interior design services, including concept development, design documentation, and selections.'))
```

R28's binding text is scoped to money parts, so this is outside the ruling — but
it is precisely the class the ruling's *title* names. A studio that opens the
Contract Room on a scopeless draft gets a scope paragraph Patina wrote,
`required: true`, `client_visible: true`, ready to be sent as a term of her
agreement. Flagged for the orchestrator, not fixed here.

### F6 · minor · confidence 1.00 — `authenticated` can TRUNCATE both projection tables

R17(c) withdrew INSERT/UPDATE/DELETE from `authenticated` and `anon`, and §2
proves it. TRUNCATE was not withdrawn, and TRUNCATE fires no row triggers and
observes no RLS:

```
BEGIN; SET LOCAL ROLE authenticated;
TRUNCATE public.proposal_service_terms;
NOTICE:  TRUNCATE as authenticated: ACCEPTED
ROLLBACK;
```

`authenticated` holds TRUNCATE on **306** public tables — this is the repo's
legacy grant shape, faithfully replayed by `seed/00-legacy-grants.sql`, not
something this wave introduced, and `KNOWN_FAILURES.md` /
`anon_table_grant_narrowing_test.sql` are unchanged from `origin/main`. It is
also not reachable through the product: PostgREST never issues TRUNCATE, and no
caller holds a direct Postgres connection as `authenticated`.

**Does not block W1.** Recorded because R17's "belt and braces" reads stronger
than it is, and the main backlog should carry it.

### F7 · advisory — the SQL gate has a blind spot exactly where 00575 lives

Six commercial suites are documented expected-fails: `authorized_schedule`,
`design_services_authority`, `design_services_gap_hardening`,
`executed_on_paper`, `trade_scope`, `trade_rfq`. Five of the six exercise the
send / sign / paper doors 00575 redefines.

They are **not** this wave's: `git diff origin/main..HEAD --
supabase/tests/KNOWN_FAILURES.md` is empty, and every one is documented against
the same pre-existing `designDisposition` readiness-gate drift
(`KNOWN_FAILURES.md:83-87`). The runner reports **0 unexpected failures**. So the
wave neither caused nor hid them — but the only SQL coverage of 00575's doors is
the two new agreement suites, and that is worth knowing before deploy.

One correction to the R21 backlog note: `direct_order_attribution_test.sql`
**passes** on this stack.

---

## 5 · Gates

Every command run from
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w1-integration`.

| Gate | Command | Result |
|---|---|---|
| Reviewer probes | `psql -v ON_ERROR_STOP=1 -f /tmp/claude-501/regate2/regate2-probe.sql` | **rc=0** — R3, Q5, P16, P3b all refuse (§2) |
| SQL suites | `scripts/run-sql-tests.sh` (unsandboxed) | **162 files · 141 green · 21 expected-fail · 0 unexpected** |
| SQL — this wave | `scripts/run-sql-tests.sh -f commercial` | `agreement_parts_test.sql` **PASS**, `agreement_parts_projection_test.sql` **PASS** |
| Types regen | `SUPABASE_DB_URL=…54322/postgres pnpm db:generate` | 1,135,292 bytes (not truncated) |
| Types diff | `git diff --exit-code packages/supabase/src/database.types.ts` | **no diff** |
| `@patina/types` | `type-check` · `turbo build` | clean · 1/1 |
| `@patina/supabase` | `type-check` · `test` | clean · **87 files, 1068 passed, 12 skipped** |
| designer-portal | `type-check` | clean |
| designer-portal | `test` (FULL jest) | **523 suites, 6332 tests, 2 snapshots — all passed** (24.3 s) |
| client-portal | `type-check` | clean |
| client-portal | `test:coverage` | **129 suites, 1995 tests passed**; coverage floor (70/60/70/70) met |
| admin-portal | `build` (unsandboxed) | **green** — the repo's strictest gate |
| client e2e | `playwright test --workers=1` against a server I started with the override | **34 passed, 3 failed — all three pre-existing** |

### The e2e server

The client Playwright config pins the local Supabase URL and anon key in
`webServer.env` but **not** `NEXT_PUBLIC_FLAG_OVERRIDES`, and sets
`reuseExistingServer: true` — the hazard the rulings record. So the server was
started by hand, not by Playwright:

```bash
eval "$(supabase status -o env | grep -E '^SERVICE_ROLE_KEY|^ANON_KEY')"
export SUPABASE_SERVICE_ROLE_KEY=… NEXT_PUBLIC_SUPABASE_ANON_KEY=… \
       NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
       NEXT_PUBLIC_FLAG_OVERRIDES=agreement-parts:true
pnpm dev            # :3002, ready in 376 ms
```

and the run carried the same service-role key and override. Real process env
beats `.env.local` in Next.js, so the prod-pointing `.env.local` hazard is closed
for this run by construction. The server was stopped afterwards.

### The three reds, each accounted for

```
plans-link.spec.ts:190     — named pre-existing red
share-link.spec.ts:114     — named pre-existing red
threshold.spec.ts:236      — "names the other houses on the mat…"  expected 2, received 7
```

The third needs its arithmetic shown, because the line number moved. R26 inserted
`SEEDED_AGREEMENT_PART_TITLES` (15 lines) at line 63, so every test below it
shifted by 15:

```
$ git show f1b0c31f1:apps/client-portal/tests/threshold.spec.ts | sed -n '158p;221p'
158:  test('prints the five facts the seed put in the house', …      ← the recorded TZ red
221:  test('names the other houses on the mat for a client who keeps several', … ← the recorded seed-drift red

$ sed -n '173p;236p' apps/client-portal/tests/threshold.spec.ts
173:  test('prints the five facts the seed put in the house', …
236:  test('names the other houses on the mat for a client who keeps several', …
```

`:236` **is** the recorded `threshold.spec.ts:221` seed-drift red, unmoved in
substance (a house count, expected 2, got 7). The recorded `:158` TZ red is now
`:173` and **passed** this run — timezone fragility, so it will not always.
**Nothing else was red.**

And the assertion this wave exists to make ran green:

```
[34/37] [chromium] › tests/threshold.spec.ts:415:7 › The Threshold — the client page
        › reads the composed agreement in full — its parts in position order
```

---

## 6 · What I did not verify

- **No production anything.** No `db push`, no `functions deploy`, no portal
  deploy, no Strata read or write.
- **No browser walk.** The composed room and the composed page were exercised
  through jest, Playwright and SQL — not driven by hand. The designer preview /
  client page pixel agreement behind F3 is reasoned from the two files, not seen
  side by side.
- **Designer e2e was not run** (`apps/designer-portal/e2e/agreement/…`) — it is
  not on the gate list I was given, and it needs its own flag-pinned server.
- **Lint was not run** anywhere. Per patina-verification, only designer-portal's
  config resolves, and its 2 pre-existing errors are recorded as byte-identical
  to `origin/main`.
- **The stack was not reset**, because it did not need to be (§1). The 19-body
  comparison is the evidence; a reset would have been the alternative proof.
- **F1's severity rests on a reading of R28's words.** I did not re-rule it.

---

## 7 · Verdict

`ok = false`, on **F1 alone**.

R22, R23, R24, R25, R26, R29 hold. R27 holds where it protects the homeowner.
The probes R3, Q5, P16 and P3b all refuse, at the save door, the send door, the
sign door and the paper door, in the readiness panel's own sentences. Every gate
on the list is green and the only three e2e reds are the recorded ones.

What stands between this wave and clean is one `COALESCE` that removed a literal
the column default was supplying anyway — a two-line fix, or a one-line ruling.
