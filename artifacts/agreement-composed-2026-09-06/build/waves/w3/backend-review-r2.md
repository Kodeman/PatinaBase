# Wave 3 · backend lane — adversarial review, round 2

**Reviewer**: separate context, did not write this code · **Date**: 2026-09-07
**Branch**: `agreement/w3-backend` · **Worktree**: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w3-backend`
**Commits reviewed**: `03ab57f49 … 7916c16e1` (14), round-2 fixes in `e63c1c630` (883+/13−), `d485123ac` (tests), `53f3e4785` (seed + types), `7916c16e1` (log).

Round 1 returned four blockers and three majors. **All four blockers and all
three majors are genuinely fixed at source, verified on a fresh clone.** Every
one of round 1's thirteen minors and nits is **still open** — none was
addressed, and two of them got one function wider.

Two of the round-2 fixes changed a shape another lane already consumes, and
neither consuming lane has moved. Those are this round's blockers, and neither
is fixable in this lane.

---

## Gates run by the reviewer (not read from the lane log)

Scratch clone `patina_w3r2`, `pg_dump --no-owner -Fc` of the shared stack (head
`00577`, 531 ledger rows) → `pg_restore`, then the lane's two migrations. Dropped
at the end.

```
psql -d patina_w3r2 -v ON_ERROR_STOP=1 -f supabase/migrations/00578_design_build_kind.sql  → COMMIT, exit 0
psql -d patina_w3r2 -v ON_ERROR_STOP=1 -f supabase/migrations/00579_trade_agreements.sql   → COMMIT, exit 0

supabase/tests/commercial/design_build_test.sql     → 18 PASS blocks, exit 0
   T1 T4 T6 T10 T5/T9 T9 T11 (ledger) T13/T8 T3 T14 T7 T2/T15 T16 T17 T18 T19 T12
supabase/tests/commercial/trade_agreement_test.sql  →  8 PASS blocks, exit 0
   A1 A2 A3(seven links) A5 A4 A6/A7/A8 A9 (ACL)

edge_api/public_sd_hardening_contract_test.sql      → exit 0
edge_api/public_rpc_authorization_contract_test.sql → exit 0
commercial/agreement_parts_test.sql                 → exit 0
commercial/agreement_library_test.sql               → exit 0
commercial/agreement_fee_schedules_test.sql         → exit 0   (W2 keepsake + hash==fingerprint)
commercial/agreement_parts_projection_test.sql      → exit 0
commercial/multi_studio_signature_test.sql          → exit 0
billing/studio_invoice_test.sql                     → exit 0

bash scripts/run-sql-tests.sh (PGURL → the clone)
   total 166 · green 132 · expected-fail 21 · unexpected-fail 13 · effective-green 153/166
   The thirteen are name-for-name the lane's thirteen, every one a clone artifact
   (probed: billing/invoice_links fails on `relation "cron.job" does not exist`).

python3 scripts/generate-legacy-grants.py → git diff supabase/seed/00-legacy-grants.sql: EMPTY (in sync)
supabase gen types typescript --db-url …/patina_w3r2 → diff vs the committed file: 95 lines,
   ALL of them `Relationships` FK entries the clone lost in pg_restore. No table, column or
   function entry differs. (Filtered check for any non-FK line: no output.)
pnpm --filter @patina/supabase type-check → exit 0
pnpm --filter @patina/types type-check    → exit 0
```

### Method probes

- **Graft honesty (RC-9)** — `_render_agreement_snapshot_html` extracted from
  `00577` and from `00578` and diffed mechanically: the ONLY differences are
  `c_boundary_turnkey`, the seven new locals, the kind/disclosure lookup, the
  three schedule arms, and the boundary CASE. **No W2 line was reverted.**
- **Pins (RC-14)** — the diff of `public_sd_hardening_contract_test.sql` is 7
  insertions / 7 deletions, **every changed line a 64-hex literal**; no `ASSERT`
  removed. Eight pinned functions were redefined; seven are body-hashed and all
  seven DB hashes were matched against the file (`digest(prosrc)` per function).
  `_sign_design_services_agreement_authorized` is registered by signature only,
  not hashed — the lane's claim is true.
- **No new `issue_invoice_for_actor` caller** — the five `PERFORM
  app_private.issue_invoice_for_actor` sites in 00578 are all inside grafted
  pre-existing bodies; the draw rail calls `public.issue_invoice(uuid,date)`
  (00578:6734).
- **Seeded rows immutable** — UPDATE and DELETE of `patina.design_build` as
  `postgres` without the maintenance GUC both raise *"Patina agreement templates
  are immutable"*.
- **Flow-down (B4)** — the template carries 11 entries, 10 composable.
- **No bare extension calls** — grep for unqualified `gen_random_uuid/
  gen_random_bytes/digest` in both files: none.

---

## Round 1's findings, one by one

| id | round-1 severity | status |
|---|---|---|
| B1 keepsake carries no money | blocker | **FIXED** — PART 12c, verified by graft diff + T17 |
| B2 keepsake closes with a false sentence | blocker | **FIXED** — boundary is per-kind |
| B3 closed book publishes the book | blocker | **FIXED at the four named keys** — see R2-3, the residual is a new major |
| B4 flow-down clause missing | blocker | **FIXED** — seeded `enabled:false`, composed by nothing |
| M1 attestation part not materialized | major | **RULED and PUBLISHED** as F-W3-7 (banner + log §5 + §7) — accepted |
| M2 signed sub gets a 404 on reload | major | **FIXED** — `spent_at`; see R2-4 for the residual |
| M3 waiver written by a direct grant | major | **FIXED** — `record_agreement_draw_lien_waiver`; see R2-2 |
| m1 seven functions with no `search_path` | minor | **OPEN, now nine** |
| m2 RC-10 answer unrecorded | minor | **OPEN** — no `RC-10` string anywhere in the migrations or the log |
| m3 sub-disclosure mode unvalidated | minor | **OPEN** |
| m4 `'studio'` party never written | minor | **OPEN** |
| m5 `_studio_rw` policy is FOR ALL, grant is SELECT | minor | **OPEN** |
| m6 F-W3-4 / F-W3-6 not in the banner | minor | **OPEN** |
| m7 platform_acl file aborts before the registrations | minor | **OPEN** (no code fix owed; steward must run it whole) |
| m8 `materialize_agreement_template` clears the GUC to `''` | minor | **OPEN** |
| m9 `GRANT ALL … TO service_role` on the draw ledger is dead | minor | **OPEN** |
| n1 CA notice titled Cancellation, kind `mandated_contents` | nit | **OPEN** |
| n2 RC-8's `label` answer | nit | **mostly answered** in the table comment |
| n3 int4 money ceiling | nit | **OPEN** |

---

## R2-1 · BLOCKER — the closed-book pricing basis no longer renders on the homeowner's door

The B3 fix removes `costLines`, `feeBps`, `costBasisCents` and `subMarkupBps`
from the payload the client bundle hands over, and puts `contractSumCents` +
`scheduleOfValues` in their place. The client lane's shipped body derives
everything from `costLines`:

`apps/client-portal/src/components/commercial/design-build-body.tsx:194`
```ts
export function scheduleOfValues(reading: PricingBasisReading): ScheduleOfValuesLine[] {
  const { costLines, costBasisCents, contractSumCents } = reading;
  if (costLines.length === 0 || costBasisCents <= 0 || contractSumCents === null) return [];
```

With the redaction live, a closed-book turnkey door renders **no schedule of
values at all**, no cost-basis row and no fee row — while the keepsake frozen at
countersign renders the full pro-rated table. Walk step 11 requires *"The SOV
renders pro-rated (closed-book)"*, and the two surfaces the program spent R27 on
now say different things about the same document.

It fails silently, not loudly: `payloadRows(undefined)` returns `[]`, so the
section simply disappears. And the client lane's own jest fixture
(`commercial-document-shell-design-build.test.tsx:48-64`) still builds its
`closed_book` payload WITH `costLines`, so `J-3` stays green over a shape
production no longer produces.

The lane published this in `backend-notes.md` §7 item 2 ("client lane —
REQUIRED"). The client lane's branch head (`4a2e560b6`) has not moved on it.
**Not fixable in this lane** — the orchestrator must dispatch the client lane to
read `contractSumCents` and `scheduleOfValues` and to rebuild the closed-book
fixture from what the bundle actually emits.

## R2-2 · BLOCKER — the waiver door closed on the designer lane's hand

M3's fix withdrew the INSERT grant and the INSERT policy on
`agreement_draw_lien_waivers` (probed on the clone: `authenticated` INS=false,
one SELECT policy). The designer lane still writes the table directly:

`packages/supabase/src/hooks/use-design-build.ts:249`
```ts
const { data, error } = await supabase
  .from('agreement_draw_lien_waivers')
  .insert({ draw_id: input.drawId, … recorded_by: input.recordedBy })
```

Walk step 16 — *"record a conditional progress lien waiver from Cabinetry
against draw 2"* — now fails in production with a permission error. Its jest
mocks the Supabase client (`use-design-build.test.ts:227` asserts
`from('agreement_draw_lien_waivers')`), so the suite proves the broken call.

Published in `backend-notes.md` §7 item 1. Designer branch head still carries the
direct insert. **Not fixable in this lane**; the call must become
`.rpc('record_agreement_draw_lien_waiver', …)`.

## R2-3 · MAJOR — RC-4 is still not met: a trade's bid is one division away

B3 stops the raw cost lines crossing. It does not stop the bid being recovered,
because the pro-rated schedule is a **uniform multiple** of the cost lines and
the allowances part states the same lines **at cost on the same page**.

Probed on the clone with the lane's own Halvorsen figures:

```
_agreement_schedule_of_values(<basis>, 'closed_book') →
  Cabinetry & millwork 4 484 000 · Electrical 1 121 000 · Plumbing 849 600 ·
  General conditions 743 400 · Tile allowance 472 000 ·
  Plumbing fixtures allowance 413 000 · Lighting allowance 330 400
```

and the allowances part the same homeowner reads (`design_build_test.sql:187`,
template entry `patina.allowances` `clientVisible: true`) states
`tile 400 000 · fixtures 350 000 · lighting 280 000`.

`472000 / 400000 = 1.18` exactly → `4 484 000 / 1.18 = 3 800 000` = **$38,000**,
which is the cabinetry sub's own contract price in walk step 16. Every trade's
bid falls out of the homeowner's copy by one division, and the same pair of
tables is frozen into the keepsake by T17.

RC-4's wording is literal: *"under closed_book, does the SOV render pro-rated so
a sub's bid cannot be backed out of line ÷ (1 + fee)?"* — it can. The lane names
this honestly in `backend-notes.md` R1-2 and calls it a P-level decision rather
than a fix, which is a fair reading; it is **not ruled**, and shipping a turnkey
class whose closed book is arithmetically open is a decision for the
orchestrator, not for a lane log. Options: author the schedule independently of
the cost lines (moves the walk's pinned numbers), or state the allowances at the
same pro-rated multiple, or rule that closed book means "no line labelled as a
trade's price", which is what the code actually delivers.

## R2-4 · MINOR — `spent_at` is a good ruling made by the wrong party, and it expires

The M2 fix is the right shape: the token a signature spent resolves read-only,
every other revocation still resolves to NULL, and `sign_trade_agreement_by_token`
answers `already_signed` before it tests `status = 'active'` (00579, sign body
line 63 before line 69), so the two RPCs now agree. A3 proves seven kinds of
link.

Two residuals:

1. **RC-1 says the opposite** (*"Does a revoked token resolve to NULL rather than
   a 'this link was used' page?"*). §4.5 and walk step 16 say what the lane
   built. The lane resolved the conflict itself and recorded it. It needs the
   orchestrator's ratification, not a lane's.
2. **The receipt expires.** `resolve_trade_agreement_link` still requires
   `expires_at > now()`, and `expires_at` defaults to 30 days. A sub who signed
   loses their own receipt on day 31 — the surface has no login and no other way
   back in. A spent token should either not expire or the page should say what
   happened.

## R2-5 · MINOR (carried, now wider) — nine functions ship with no `search_path`

Probed `proconfig` on the migrated clone:

```
_agreement_contract_sum_cents      <NULL>
_agreement_draw_rows               <NULL>
_agreement_is_int                  <NULL>
_agreement_redact_client_payload   <NULL>   ← new this round
_agreement_schedule_of_values      <NULL>   ← new this round
_validate_allowances_payload       <NULL>
_validate_draws_payload            <NULL>
_validate_no_double_count          <NULL>
_validate_pricing_basis_payload    <NULL>
```

All nine hold `GRANT EXECUTE … TO authenticated`. All nine are SECURITY INVOKER,
so the exposure is bounded — but the program rule is *"Every migration: …
`search_path` pinned"*, every other function in the wave pins it (including
`_agreement_money_to_the_cent`, added in the same commit as two that do not), and
the two blessed by the round-2 change sit directly on the homeowner's disclosure
path. One line each.

## R2-6 · MINOR (carried) — the sub-disclosure mode is still unpoliced

`_agreement_sub_disclosure` (00578:1476) selects the first `clause` part whose
`payload->>'mode'` is non-empty — **no `part_key` filter** — and never checks the
value against `open_book | closed_book`. The send door refuses only NULL and
`'conflict'`.

The B3 fix reversed the *direction* of the consequence (an unrecognised mode now
fails closed instead of open), which is better. It is still wrong: a studio that
elects **open book** and mistypes it gets a closed book on the homeowner's page,
the keepsake and the bundle, with no refusal anywhere. Constrain the value at
upsert and at send, and scope the lookup to the sub-disclosure part.

## R2-7 · MINOR (carried) — the redaction is a denylist

`_agreement_redact_client_payload` removes four named keys and passes everything
else. Any key a later editor adds to a `pricing_basis` payload — a per-line
supplier note, a sub contact id — crosses to the homeowner by default. An
allowlist (`basis`, `gmpCents`/`nteCents`/`fixedCents`, `subDisclosure`,
`contractSumCents`, `scheduleOfValues`) would fail closed instead. The current
key set is fixed by the designer lane's editor, so nothing leaks today.

## R2-8 · MINOR (carried, unchanged) — the six from round 1 nobody touched

- **m4** — `studio_trade_agreement_signatures.party` models `'studio'`; the one
  INSERT in the wave (00579:874) hardcodes `'sub'`. Say "reserved" in the table
  comment or add the act.
- **m5** — `studio_trade_agreements_studio_rw` is `FOR ALL` with a WITH CHECK
  while `authenticated` holds SELECT only (probed: INS/UPD/DEL all false). The
  name promises a write path the ACL forbids.
- **m6** — `grep "F-W3-4\|F-W3-6" supabase/migrations/*.sql` → no output. Both
  findings live only in the lane log; the migration text should carry them.
- **m8** — `materialize_agreement_template` still ends with
  `set_config('app.commercial_document_id', '', true)` and captures no previous
  value, unlike every other site in the file (which all restore
  `COALESCE(v_previous_commercial, '')`). A nested caller loses its GUC.
- **m9** — `GRANT ALL ON agreement_draw_invoices TO service_role` is dead
  privilege: `guard_agreement_draw_ledger` raises `insufficient_privilege` on any
  INSERT/UPDATE/DELETE where `current_user <> 'postgres'`. Narrow the grant or
  admit the role.
- **m2/RC-10** — an authenticated designer can still flip
  `proposals.document_kind` to `'design_build'` by direct UPDATE; only the send
  door refuses. No code fix is owed, but RC-10 asks the question directly and
  the answer is still written down nowhere.

## R2-9 · NIT (carried) — CA notice, int4 money, per-row disclosure lookup

- The CA row is `kind = 'mandated_contents'` titled *"Notice of Cancellation
  (California)"*; the other five are `cancellation_notice`. Dark either way.
- `agreement_draw_invoices.gross_cents/net_cents/retainage_cents` and
  `studio_trade_agreements.price_cents` are `integer`: a turnkey contract sum
  above ~$21.47M overflows. Consistent with the repo; worth naming a ceiling for
  a construction class.
- `get_client_commercial_document_bundle` calls
  `_agreement_sub_disclosure(p_proposal_id)` inside the per-part `jsonb_agg`, so
  it is re-evaluated per row on every client read.

---

## Verdict

**fix.** The lane's own two migrations are sound: they apply clean, they graft
faithfully, their pins are honest, their ACLs are asserted by name, and 26 new
assertion blocks pass alongside every W1/W2 suite the sheet names. Round 1's
seven substantive findings are all closed.

What blocks the wave is two shapes this lane changed for good reasons and two
other lanes have not followed (R2-1, R2-2), and one review criterion — RC-4 —
that the fix improves without meeting (R2-3). None of the three can be closed
inside `agreement/w3-backend`.
