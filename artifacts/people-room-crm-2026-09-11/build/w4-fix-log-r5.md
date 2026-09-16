# W4 fix log — round 5

Branch `build/people-room-crm-2026-09-11`, worktree `.codex/worktrees/agent-people-build`.
Five findings in, three distinct defects (the data-edge and QA reviews each reported two of
them under their own taxonomies): the pay-link expiry ordering (`R5-MAJOR-1` = `W4R5-QA-F1`),
the client portal's untouched unsubscribe sibling (`W4R5-QA-F2`), and the cross-studio inbound
touch (`R5-MAJOR-2` = `W4R5-QA-F3`). Nothing else was changed.

---

## 1. `W4R5-QA-F1` / `R5-MAJOR-1` — blocking — a closed pay link went silent on deploy day

**FIXED** in `supabase/migrations/00636_invoice_link_hardening.sql` (unapplied on prod; edited
in place per `supabase/CLAUDE.md`).

`resolve_invoice_link` tested `expires_at <= now()` in the same `IF` as the `revoked` check —
two statements *above* `v_dead := v_link.status = 'closed' OR v_invoice.status = 'void'`. The
backfill at :119 dates every non-active row from `COALESCE(revoked_at, created_at)`, so every
link closed before the migration lands already past expiry. Both together: on deploy every
client holding a `/pay/<token>` for an invoice she had already paid (or that was withdrawn)
would have got `apps/client-portal/src/app/pay/[token]/page.tsx:55-62`'s generic `DeadLink`
instead of the ruled K5/M10 withdrawn/settling receipt. Forward-going it also killed every
receipt 30 days after its last mint.

The fix is the one both reviews named first: the expiry test now sits **below** `v_dead`, so an
expiry silences only a LIVE pay door. A closed link's sheet is a receipt, not a bearer pay door
— and it was never payable anyway, since `resolve_invoice_link_for_checkout` (:841 in the
edited file) still requires `l.status = 'active'` *and* `(l.expires_at IS NULL OR l.expires_at >
now())`. The backfill's `ELSE COALESCE(revoked_at, created_at)` is kept, so a dead row still
carries the date it died on for the folio to read.

Four comment sites that stated the old rule were corrected rather than left to drift: the banner
(:13-18), `COMMENT ON COLUMN invoice_links.expires_at`, `COMMENT ON FUNCTION
resolve_invoice_link`, and the backfill's own block comment — which now names the resolver
ordering as a dependency instead of the neutral "Dead rows keep the date they died on".
`build/w4-data-edge-report.md` §4 carries the same correction (the finding called out that the
report stated the rule as neutral).

**New coverage** — `supabase/tests/people/w4_channels_touches_paperwork_test.sql`, block **4c**
(`4c. a closed link past its backfilled expiry still answers the withdrawn sheet, and still buys
nothing`). It mints a link on the seeded `sent` invoice, closes it in `_void_invoice_authorized`'s
exact shape (`status='closed'`, `revoked_at = now() - 90 days`) with `expires_at` dated from
`revoked_at` the way the backfill dates it, and asserts (b) the sheet is not NULL, (c)
`kind = 'withdrawn'`, (d) `resolve_invoice_link_for_checkout` still returns nothing for it.
Block 4's existing assertion (i) — an *active* link past its expiry resolves to NULL — is
untouched and still passes, so the expiry has not been weakened where it bites.

The parallel **code** review (`w4-review-r5-code.md` §1, "The /pay rail is not broken by the
backfill") cleared the rail on the *hash* backfill only — `token_hash` is written before `token`
is nulled, so emailed addresses keep resolving — and did not reach the *expiry* backfill. Its
BLOCKING and MAJOR lists are both empty; nothing from it is in this round's scope.

**Not changed:** `resolve_invoice_link_for_checkout`'s own expiry conjunct (it is `AND`ed with
`status='active'`, so the ordering question does not arise there), and the backfill statement
itself.

---

## 2. `W4R5-QA-F2` — major — the client portal's unsubscribe sibling contradicted the record

**FIXED** in `apps/client-portal/src/app/api/unsubscribe/route.ts` and
`apps/client-portal/src/app/preferences/unsubscribe/page.tsx`.

Round 4 (`W4R4-2`) taught the **admin** portal's pair to speak from the `scope` the write
actually covered. The client portal carries its own separate copy of both files and neither was
touched; its route dropped `scope` when building the redirect and its page branched only on
`type === 'all_marketing'` vs a bare `humanizeType(type)`. A real channel-scoped token applied
through this portal stops the whole address in `studio_contact_channels` while the confirmation
printed "We've unsubscribed you from po sent emails" — the reader disagreeing with the record on
the one act whose whole purpose is saying what just happened.

Took the finding's first option (mirror admin's fix) rather than the shared-helper option,
because lifting the renderer into `@patina/notifications` is a shared-package edit that pulls
the admin-portal build gate and a rewrite of admin's page into a round scoped to three fixes.

- **route.ts** — `outcomePage()` now forwards `scope` alongside `status` and `type`. The
  tokenless branch's literal gained `scope: undefined` so the union stays accessible without a
  cast. The RFC 8058 one-click POST path (no `Accept: text/html`) is untouched: still a bare 200
  or the JSON refusal.
- **page.tsx** — `searchParams` accepts `scope`; the settled-outcome literal validates it to
  `'address' | 'account' | undefined` exactly as admin's does; the applied copy moved into an
  `appliedCopy()` with admin's three branches, and the `address` branch drops the "Manage
  Preferences" link (there is no account to manage) for "Ask the studio to send again and they
  can turn it back on."

**New coverage** — both files had **zero** tests; both now ship one, as the client-portal floor
requires.
- `src/app/preferences/unsubscribe/__tests__/page.test.tsx` — 8 cases: address scope prints the
  address sentence and no "po sent emails" and no Manage-Preferences link; account scope still
  names the type; `all_marketing` keeps its sentence; a missing scope falls back to the type; a
  scope value the record never writes is ignored; a bare token still *offers* rather than
  applies (this portal's no-mutating-GET rule); a refusal prints its own words; an empty arrival
  is malformed.
- `src/app/api/unsubscribe/__tests__/route.test.ts` — 7 cases: the browser POST carries
  `scope=address` over a 303; the GET carries `scope=account`; an outcome with no scope sets no
  `scope` param; a tokenless GET redirects `malformed` without touching the record; the one-click
  POST still answers a bare 200 with no `Location`; a tokenless one-click POST is a 400
  `missing_token`; a read failure is a 500 with its message.

**Out of scope, named:** `apps/designer-portal/src/app/api/unsubscribe/route.ts` +
`preferences/unsubscribe/page.tsx` are a *third* copy with the same drop. The finding named only
the client portal, so they were left alone. If Fable wants all three to agree, the shared
`@patina/notifications` helper is the right shape and is its own task.

---

## 3. `R5-MAJOR-2` / `W4R5-QA-F3` — major — the inbound touch named the wrong seat

**FIXED** in `supabase/functions/sms-inbound/pipeline.ts`.

`sms_conversations` is keyed on `(twilio_number, phone_e164)` and the rail sends from one
platform-wide `TWILIO_FROM_NUMBER` (`_shared/sms.ts`), so there is exactly ONE conversation row
per phone across every studio and `conv.party_id` is whichever seat the first outbound send
stamped. Every consent-keyword branch already computes the seat set the *consent write* uses —
`stopTargets`, `startTargets`, `yesTargets` — and then filed its touch against `conv.party_id`
instead. On a number two studios hold, the studio whose record actually moved got no touch: its
person card, seat line, roster row and `touchSentence` kept printing the previous contact while
its Directory row (which reads the record) already showed the new verdict. Two readers on one
card disagreeing — the defect `r1 M-4` and `r4 MAJOR-3` opened to close, left standing for the
multi-studio population.

New helper `recordConsentTouches(supabase, targets, fallbackPartyId, messageId, occurredAt)`
(beside `recordInboundTouch`, which it calls): de-duplicates `targets.flatMap(t => t.partyIds)`
and files one touch per answering seat, falling back to the conversation's seat only when the
target set holds none — a record-only studio has no seat by construction, and `record_touch`
already answers NULL for a studio-less seat. Wired into the three branches the finding's fix
names: STOP (over `stopTargets`), START (over `startTargets`), YES (over `yesTargets`).

**HELP was deliberately left on `conv.party_id`.** The claim lists it among the four, but the
prescribed fix names only STOP/START/YES — and correctly: HELP moves no consent record and
computes no target set (it reads `parties[0]` only for a studio name). Naming it here so the
omission is a decision, not an oversight; if Fable wants HELP to fan out over `parties`, that is
a separate ruling.

**New coverage** — `supabase/functions/_tests/sms-inbound.test.ts`, four cases:
- a STOP on a number two studios hold files **two** touches (`p1,p2`), not just the
  conversation's — with `subject_type=engagement`, `direction=in`, `authority_check=n/a` on both;
- a STOP reaching only a record-only studio (no seats on the phone) still files the
  conversation's seat — the fallback;
- a START re-granting two studios files a touch for each;
- a YES files exactly **one** touch, against `p2` — the seat of the only studio whose invite was
  in flight — while the conversation's stamped seat is `p1`. This is the finding's own scenario
  inverted into an assertion: before the fix it filed `p1`.

---

## Gates

| Gate | Command | Result |
|---|---|---|
| Local DB replay | `pnpm --dir <worktree> supabase:reset` | green — all migrations + seeds |
| W4 SQL suite | `psql -v ON_ERROR_STOP=1 -f supabase/tests/people/w4_channels_touches_paperwork_test.sql` | **green**, 4c included: `W4 SQL suite: all blocks passed`, `ROLLBACK` |
| Billing links suite | `psql -f supabase/tests/billing/invoice_links_test.sql` | green (no ERROR; ends `ROLLBACK`) |
| Edge-api RPC contract | `psql -v ON_ERROR_STOP=1 -f supabase/tests/edge_api/public_rpc_authorization_contract_test.sql` | green |
| Edge-api platform ACL | same, `platform_acl_compatibility_test.sql` | **red — pre-existing**, listed in `supabase/tests/KNOWN_FAILURES.md:51` (`PUBLIC holds a reachable … privilege`). No GRANT/REVOKE was written this round, so `seed/00-legacy-grants.sql` needed no regeneration |
| Edge tests (sms) | `deno test --allow-all --config supabase/functions/deno.json supabase/functions/_tests/sms-inbound.test.ts` | **62 passed / 0 failed** (58 before, +4) |
| Edge tests (sms rail) | same over `_shared/sms.test.ts` + `_tests/sms-status.test.ts` | 56 passed / 0 failed |
| Edge type-check | `deno check --config supabase/functions/deno.json supabase/functions/sms-inbound/index.ts` | clean; root `deno.lock` deleted after |
| Client type-check | `pnpm --dir apps/client-portal type-check` | **red only on the pre-existing** `.next/types/app/page.ts(37,29) TS2344` that r2/r3/r4 each measured against W4's base. No new error, none in a file this round touched |
| Client jest | `pnpm --dir apps/client-portal exec jest --coverage` | **156 suites / 2555 tests passed**, thresholds met — `All files 77.29 / 73.01 / 77.01 / 79.66` against the 70/60/70/70 floor |

No `_shared/*` edit, so no fan-out list changes: W7's redeploy set for this round is
`sms-inbound` alone. No migration was minted (00636 was edited in place, unapplied on prod). No
prod mutation of any kind; no server was started.
