# W1a — the data layer: identity, channels, consent

Branch `build/people-room-crm-2026-09-11`, worktree `.codex/worktrees/agent-people-build`.
Local Supabase only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`).
Nothing was pushed to Strata: no `supabase db push`, no `supabase functions deploy`.

**This report was rewritten at the R-AS close-out (2026-09-12).** Ten review
rounds (r1–r10) shaped 00592/00593/00594; the last six of them kept finding the
same class of defect in one place — the COPY of the consent verdict that lived
on `project_parties.sms_consent_*`. R-AS ends the class instead of the instance:
`studio_channel_consent` is the single source of truth, the mirror is retired,
the eight legacy columns are frozen, and every reader goes through one function.
Sections 1–4 describe the shape as it now stands; section 5 is what that costs
and who owes it.

**Amended after close-out review round 3 (2026-09-12).** That round found the
blast radius of the freeze on readers nobody had counted: three SQL readers
(§2.3b, migration `00621`), one shipped cron (§4, `field-daily`) and one
reachable portal write path (§5.2, a phone correction on an `opted_out` seat).
All five are fixed in this pass rather than owed to W2; §5.1's site-request gap
is sharpened, not fixed, and stays W2's.

---

## 1. The model, in one paragraph

Consent is a fact about a **(studio, channel kind, channel value)** pair. It
lives in `public.studio_channel_consent`, one row per pair, carrying the grant's
evidence set (`source`, `evidence`, `recorded_at`, `disclosure_version`,
`recorded_by`, `consented_at`) and, beside it, **the refusal's own**
(`opt_out_source`, `opt_out_evidence`, `opt_out_recorded_at`,
`opt_out_recorded_by`, `opt_out_at`), plus the stored fact `refusal_unanswered`
and `origin_project_id` so R-Q's sentence can name the job. Two acts, two
evidence sets, one row — which is precisely what one evidence set on a
`project_parties` seat could never be.

Three writers, and no others:

| Writer | What it may write |
|---|---|
| `record_channel_consent(org, kind, value, status, source, evidence, disclosure_version, origin_project_id)` | the studio's own verdict, through the evidence gate and the transition gate |
| `record_channel_reconsent(org, kind, value, source, evidence, disclosure_version, origin_project_id)` | PR-m's fresh consent as EVIDENCE over a standing refusal; never the status |
| the inbound SMS rail (`sms-inbound/pipeline.ts`, service_role) | the recipient's own STOP / START / YES — the only writer that lowers `refusal_unanswered` |

One reader, `public.channel_consent_status(org, kind, value)` — STABLE SQL,
**SECURITY INVOKER**, so the table's member-only RLS is the whole access rule.
`v_project_roster` and `people_directory` both go through it.

---

## 2. What R-AS removed, and what replaced it

### 2.1 Removed outright

| Object | Was | Now |
|---|---|---|
| `public.mirror_channel_consent_to_parties()` | AFTER INSERT/UPDATE on `studio_channel_consent`, pushing the verdict + evidence onto every party row in that studio on that number | **dropped** (`DROP FUNCTION IF EXISTS`, and `DROP TRIGGER IF EXISTS mirror_channel_consent_to_parties_trg` for a stack that replayed an earlier 00594) |
| the mirror's narrow site-request release | inside the mirror: `site_request_dispatch_after_consent()` for the seats it had just moved onto `granted` | gone with it — see §5.1 |
| the redefinition of `public.fc_dispatch_optin_invite()` | 00432's body + a `patina.suppress_consent_dispatch` guard, grafted into 00594 | **not redefined at all.** 00432:27-68 stands as shipped |
| the redefinition of `public._site_request_consent_granted_dispatch()` | 00374's body + the same guard | **not redefined at all.** 00374:3399-3444 stands as shipped |
| `patina.suppress_consent_dispatch` | a transaction-local flag two trigger bodies read | nothing sets it and nothing reads it — probe 1 below returns `fns_reading_suppress_flag = 0` |
| R-AQ's wordless-refusal branch | the mirror deciding, as a set, which of the seat's four evidence columns to NULL | **no longer applies.** R-AQ was a rule about what to copy; nothing is copied. `R-AN` (evidence refreshed, never nulled) still governs the record itself |

The two trigger-function redefinitions were the clearest sign the mirror was the
wrong shape: a cache write had to reach past two shipped triggers that text real
people, through one shared flag, or one recorded `pending` became one opt-in SMS
per seat on a 10DLC campaign. With nothing writing the seats, neither trigger
can fire from a consent act at all, and both keep their shipped bodies.

### 2.2 Added

| Object | Shape |
|---|---|
| `public.refuse_legacy_consent_write()` + trigger `refuse_legacy_consent_write_trg` | `BEFORE UPDATE OF` the eight `sms_consent_*` / `sms_opt_out_at` columns on `project_parties`. Refuses a real change with `consent_legacy_column_frozen` unless `current_setting('app.consent_legacy_write', true) = 'on'`. Compares OLD/NEW as a tuple, so **restating** the same values (a whole-row UPDATE that names them) still writes; `BEFORE UPDATE OF` fires on column MENTION, not on change, and the shipped portal writes whole rows |
| `public.project_consent_org(uuid)` | STABLE SQL, **SECURITY DEFINER**, `SET search_path TO 'public'`, `REVOKE ALL … FROM PUBLIC, anon` + `GRANT EXECUTE … TO authenticated, service_role`. `COALESCE(projects.studio_id, _primary_studio_for(designer_id))` — the one resolver both views and every writer answer from (close-review r1 MAJOR-1, §2.3) |
| `public.channel_consent_status(uuid, text, text)` | STABLE SQL, SECURITY INVOKER, `SET search_path TO 'public'`, `REVOKE ALL … FROM PUBLIC, anon` + `GRANT EXECUTE … TO authenticated, service_role`. Returns NULL when the studio holds no record, which is what `not_asked` means; callers that must print a word COALESCE it. **The verdict is `status` AND `refusal_unanswered` together** (close-review r2 MAJOR-2): a record carrying an unanswered refusal reads `opted_out` whatever its status column says, which is what the send gate (`channelConsentVerdict`) and the write gate already do with the flag — so the room cannot print "Texting" for a number every send is refused on |
| `public.record_channel_invite(uuid, text, text, text, text, text, uuid)` | plpgsql, **SECURITY DEFINER**, `SET search_path TO 'public'`, `REVOKE ALL … FROM PUBLIC, anon` + `GRANT EXECUTE … TO authenticated, service_role`. The ADD path's door (close-review r2 MAJOR-1). Studio-member gated **before** its read, normalises through `normalize_channel_value()`, and records the invite through `record_channel_consent(…, 'pending', …)` — every gate of that door applies — only when this studio holds no standing, **sendable** `granted`. Where one stands the record is returned untouched and nothing is written. A `granted` carrying an unanswered refusal is not "standing": the call falls through and is refused as `consent_awaiting_recipient` |
| `COMMENT ON COLUMN` × 8 | each of the frozen columns reads `legacy; read studio_channel_consent …` |
| `COMMENT ON TABLE public.project_parties` | 00212:46's text, with the mirror invariant replaced by the freeze |

### 2.3 Readers repointed (grafted from their grep-winners, one line each changed)

| View | Lineage (grep-winner) | Change |
|---|---|---|
| `public.v_project_roster` | `00419_project_roster_wiring.sql:94-156` | party branch: `pp.sms_consent_status` → `COALESCE(channel_consent_status(project_consent_org(pp.project_id), 'sms', pp.phone_e164), 'not_asked')`. Team branch, every other column, byte-identical — and since close-review r1 the view needs no join to `projects` at all, so this is again exactly one expression changed |
| `public.people_directory` | `00221 → 00281 → 00420 → 00478 → 00583 → 00589:696-935` (v6) | party branch: `status_raw` and `meta->>'sms_consent_status'` both read the same function. Five other branches byte-identical. W1b's v4 rebuild keeps this read |

**The org expression** is one call: `public.project_consent_org(pp.project_id)`
— `COALESCE(projects.studio_id, _primary_studio_for(designer_id))`, SECURITY
DEFINER, `SET search_path TO 'public'`, `REVOKE ALL … FROM PUBLIC, anon` +
`GRANT EXECUTE … TO authenticated, service_role`. The shape
`studio_contact_org(uuid)` already takes (`00592:65-76`).

It cannot simply call `public._primary_studio_for()` from inside the view:
`00484:1221`/`:1278-1289` revoked EXECUTE on that function from every PostgREST
role and a `security_invoker` view checks function permissions against the
CALLER — probed directly:

```
$ psql … -c "CREATE VIEW zz WITH (security_invoker=true) AS
             SELECT public._primary_studio_for(p.designer_id) FROM projects p;
             SET ROLE authenticated; SELECT * FROM zz LIMIT 1;"
ERROR:  permission denied for function _primary_studio_for
```

**This was inlined in the first cut, and that was a defect** (close-review r1
MAJOR-1). The inlined subquery is textually identical to `00315:64-79` and
behaviourally is not: the function is a definer and a subquery in an invoker
view is not, so the copy saw only the memberships the CALLER's own
`organization_members` RLS showed it, while `backfill_channel_consent_from_parties()`,
`record_channel_consent()`'s seat gate and the send rail saw every membership.
For a project with `studio_id IS NULL` whose designer belongs to two studios the
reader and the writer named different studios, and the reader then printed the
OTHER studio's verdict. Probed on a fixture (`probe29-close-r1-major1.sql`,
Carol a member of Alpha and an admin of Beta, her project carrying no
`studio_id`, Beta holding the refusal and Alpha a grant for the same number):

```
=== the DEFINER answer (every writer: fold, RPC seat gate, send rail) ===
             definer_org              |             resolver_org
--------------------------------------+--------------------------------------
 b1000000-…-00000000000b              | b1000000-…-00000000000b   ← Beta

=== BEFORE: the expression the views used to inline, as Alpha's owner ===
 inlined_org = b1000000-…-00000000000a   ← Alpha
 word_before = granted                   ← Alpha's ledger, for Beta's seat

=== AFTER: the resolver, and the word the shipped view now prints ===
 resolver_org_as_alice = b1000000-…-00000000000b
 word_after            = not_asked        ← Beta's ledger is closed to her
```

`channel_consent_status()` stays SECURITY INVOKER, so the degrade posture is
unchanged in the direction that matters: a caller who is not a member of the
owning studio reads NULL and the view COALESCEs to `not_asked`. What is gone is
the confident wrong answer. Test block 38 holds it.

`meta.sms_consented_at` / `meta.sms_opt_out_at` on `people_directory` still read
the frozen columns: `channel_consent_status()` returns a status, not dates.
Those two belong to W1b's v4 rebuild (§5.3).

### 2.3b Three more SQL readers, repointed at the close-out (00621)

00594 repointed the two readers the ROOM prints. The close-out review found
three more SQL readers of the frozen column that no round had counted — one of
them designer-facing today, two of them dispatch gates that had gone silent —
and `00621_consent_readers_repointed.sql` grafts all three from their
grep-winners, one expression each.

| Object | Lineage (grep-winner) | Change |
|---|---|---|
| `public.field_activity_summary` | `00282_sms_core.sql:571-593` (its only definition site) | `awaiting_reply_count`: `pp.sms_consent_status = 'pending'` → `channel_consent_status(project_consent_org(pp.project_id), 'sms', pp.phone_e164) = 'pending'`. The unreviewed-SMS and overdue-task counts, the party kinds, the `security_invoker` marker and the two grants are byte-identical |
| `public.fc_dispatch_court_assignment()` | `00284_field_dispatch_wiring.sql:101-145` | the consent gate: `v_party.sms_consent_status <> 'granted'` → `NOT COALESCE(channel_consent_status(project_consent_org(NEW.project_id),'sms',v_party.phone_e164) = 'granted', false) AND v_party.sms_consent_status <> 'granted'`. Every early return, the party-kind filter, the fire-and-forget `BEGIN/EXCEPTION`, the template key, the vars, the REVOKE and the trigger itself unchanged |
| `public.fc_dispatch_task_assignment()` | `00284_field_dispatch_wiring.sql:160-203` | the same one gate, the same way |

**Why the two dispatch gates keep a seat leg.** `sendPartySms` is the authority
on every message these triggers cause, and it still honours a frozen seat
holding a real pre-fold `granted` (the legacy reduction behind
`channelConsentVerdict`). A gate that read the record ALONE would refuse
dispatches the send rail itself would allow — a new silence in the name of
fixing one. The record word is `COALESCE`d to `false` because
`channel_consent_status()` returns NULL for "no record": without it a party with
no record would fall THROUGH a plpgsql `IF … OR NOT (NULL)` guard and dispatch.
Test block 42 asserts both the grant and the three refusals (unasked, recorded
refusal, non-field party).

---

## 3. Every writer of the frozen columns, found by grep

`grep -rn "UPDATE public.project_parties" supabase/migrations/*.sql` and
`grep -rn "sms_consent" packages apps services supabase/functions`:

| Writer | Where | What happens now |
|---|---|---|
| `public.site_request_send(uuid)` | `00374_field_site_request_loop.sql:1265-1269` — moves a `not_asked` assignee to `pending` before dispatching a site request | **raises `consent_legacy_column_frozen`.** The site-request rail reads consent off the seat throughout; repointing it is W2's (§5.1) |
| `useRecordPartySmsConsent` | `packages/supabase/src/hooks/use-coordination.ts:745-754` (UPDATE … `.eq('sms_consent_status','not_asked')`) | **raises.** Its replacement is `record_channel_consent(…, 'pending', …)` |
| `useUpdateProjectParty`'s `revertsToOptedOut` branch | `use-coordination.ts:~604` (phone edit re-refuses) | **raises.** Its replacement is `record_channel_consent(…, 'opted_out', …)` |
| `useAddProjectParty` | `use-coordination.ts` — an **INSERT** carrying the consent columns | **unaffected by the freeze** (it is BEFORE UPDATE), so a seat is still born carrying what the studio recorded at the door — and since close-review r1 (MAJOR-2) the same act ALSO records the invite on `studio_channel_consent` through `record_channel_consent(…, 'pending', …)`, before the insert. Without it both readers printed "Not asked" for a party Patina had just texted, and §3.8's `Invited` word was unreachable for every new party |
| `sms-inbound/pipeline.ts` `optOutAllForPhone()` / `grantPartiesForStudios()` | the phone-global STOP write and the scoped grant write | **deleted this wave.** The rail writes `studio_channel_consent` only (R-AJ's START scope unchanged) |
| `mirror_channel_consent_to_parties()` | 00594 | **deleted this wave** |
| one-time migration statements | `00281:142`, `00418:300,322` | untouched — they replay long before 00594 creates the trigger |
| `backfill_channel_consent_from_parties()` | 00594 | **reads** `project_parties`; writes only `studio_channel_consent`. Idempotent (`ON CONFLICT DO NOTHING`), and a re-run now sends nothing because it reaches no seat at all |

Nothing in the send rails sets `app.consent_legacy_write`, on purpose: a shipped
writer that still reaches for these columns fails loudly rather than quietly
writing a fact no reader reads.

---

## 4. Edge functions

### `supabase/functions/_shared/sms.ts`

`channelConsentVerdict(supabase, phone, projectId)` is unchanged in shape and
keeps the record as primary:

1. the owning studio cannot be RESOLVED (a read that errored) → **refuse** (R-AM);
2. the studio's record says `opted_out`, or `refusal_unanswered` is true → **refuse**;
3. `orgHasOptedOutParty()` — the org-scoped party-row fallback, **`opted_out`
   rows only**, never a positive (R-AK/R-AL) → **refuse**;
4. record says `granted` → **allow**; otherwise **unknown** and the legacy gates decide.

One change, forced by the freeze: the last branch — a send whose studio cannot
be resolved at all, where the reduction stays phone-global — now reads the
**records** phone-globally before the party rows. The inbound STOP's
phone-global party write used to be that branch's backstop; with the seats
frozen it has to be asked of the records, and a read that errors refuses like
its four siblings. `flushDeferredMessages` is unchanged: R-AH's re-check through
`channelConsentVerdict`, keyed off the deferred row's own party, then the legacy
party-row check narrowed to that same party.

`channelConsentVerdict` is now **exported** (close-out r3 MAJOR-2). It was
module-private, so a caller that pre-filtered its own recipients had to invent
its own consent test — and `field-daily` invented one on the frozen seat. A
pre-filter that asks this exact function cannot drift from what the send gate
will decide. Editing `_shared/sms.ts` means every importing function must be
redeployed, not only `field-daily` (§8).

### `supabase/functions/field-daily/core.ts`

Both recipient selects carried `.eq("sms_consent_status", "granted")` on
`project_parties` — the column 00594 froze — before `sendPartySms` was ever
called (`:154-157` for the digest, `:251-255` for the delivery confirms). Since
nothing writes a seat to `granted` any more, the cron's recipient set could only
shrink as the book turned over: **the daily digest and the delivery confirms
were dead for every consent recorded after the freeze**, and the send gate's
whole `"allow"` branch — the half of G-3 the record exists to provide — was
unreachable through this caller. It failed closed, silently, on a shipped
un-flagged pg_cron feature.

The filter is now `mayTextField(supabase, party)`: refuse on the gate's
`"refuse"`, send on its `"allow"`, and on `"unknown"` (no record yet, the fold
has not reached this pair) honour a pre-fold `granted` seat exactly as
`sendPartySms`'s own legacy gate still honours it. A refused party is counted in
`parties_skipped`, so a run that texts nobody says why in its own summary
instead of going quietly empty. Six Deno tests cover it, and the pre-fix core
fails two of them (§6).

### `supabase/functions/sms-inbound/pipeline.ts`

`optOutAllForPhone()` and `grantPartiesForStudios()` are deleted with their call
sites. A compliance keyword now writes `studio_channel_consent` and nothing
else. The STOP still reaches every studio on the number, seat or no seat
(`studiosHoldingPhone` ∪ `studiosHoldingRecord`), still refuses to acknowledge a
STOP it could not fully record (r7 R7-M3: 500, release the `twilio_sid` claim,
let Twilio retry), and a START still targets only the studios whose own record
reads `opted_out` or `pending` (R-AJ). `seatConsentEvidence()` remains — it
READS the studio's own seats for the disclosure version and recorder a grant
needs (R-AN).

**The STOP branch's 500 gate asks FOUR flags, not three** (close-out r4
BLOCKING-1). `studiosHoldingPhone()` took `orgsOfProjects()`'s `failed`, logged
it and dropped it — it returned `StudioTarget[]`, so the fourth read on that
branch, the studio ATTRIBUTION read, had no flag to be gated on. And
`orgsOfProjects()` returns an EMPTY map when the `projects` select errors, so a
transient failure there looked exactly like "no seat belongs to any studio": the
refusal was written for the studios that happen to hold a RECORD on the number
and for nobody else, Twilio got a 200, and the `twilio_sid` claim stood — so the
retry was answered `duplicate` and the branch never ran again. The studio that
lost the refusal is the ordinary one: a seat added with "text updates" unticked
holds a seat and NO record (`use-coordination.ts:464-499`), so
`withRecordOnlyStudios()` cannot union it back in. It could then tick "text
updates" later, `record_channel_invite` would find no record and no `opted_out`
seat, write `pending`, and `fc_optin_invite_dispatch` would send an opt-in
invite to a number that had replied STOP to the platform. R-AS deleted
`optOutAllForPhone()`'s phone-global party write, which used to be that case's
backstop, so this was a regression against pre-00594 behaviour rather than a
pre-existing gap. `studiosHoldingPhone()` now returns
`{ targets, failed }` and the STOP branch gates on all four. The START/YES legs
deliberately do NOT: a short target list there grants FEWER studios, which
leaves a standing refusal standing. Two Deno tests, and the pre-fix pipeline
fails one of them (§6).

**The START target filter asks the VERDICT, not the `status` column**
(close-out r4 MAJOR-1). `studiosHoldingRecord(from, ['opted_out','pending'])`
filtered on the raw column, and the fold mints records at `granted` and at
`not_asked` with `refusal_unanswered = true` on purpose (`00594:655-666`, the r8
W4-M1 shape). `channel_consent_status()` reads those as `opted_out` and every
studio-side door refuses them, so the design's whole answer for that population
is the recipient's own START — and the START could not reach it. The number was
unsendable for ever with **no recipient-side door at all**, while the party
sheet and the invite hook both printed "This number already opted out of Patina
texts. Only they can rejoin by replying START." (`use-coordination.ts:585`,
`:870`) and `record_channel_reconsent()` answered `no_opt_out_to_supersede`.
This was close-review r2 MAJOR-2's own defect one layer up: the room read the
verdict, the rail read the column. `studiosHoldingRecord` now folds the flag
through `recordVerdict()` — the same rule as `channel_consent_status()`
(`00594:948-956`) — so the rail and the room agree by construction. R-AJ's
narrowing is untouched: a `not_asked` record with no refusal standing still
reads `not_asked` and is still not a target. Two Deno tests, and the pre-fix
pipeline fails both (§6). **The YES leg is still on the frozen seat**
(`pipeline.ts` `parties.some(p => p.sms_consent_status === 'pending')`) and is
owed to W2 with the rest of §5.1b — START is the recipient's door, YES is not.

Since close-review r1 (BLOCKING-1) `writeChannelConsent()` checks its **upsert**
as well as its prior read. The read guard was there from r7; the write was not,
so `failed` could only ever be raised by a read — and with the record now the
only copy, an upsert that errored left the studio's record non-refusing while
the pipeline answered Twilio 200 and kept the `twilio_sid` idempotency claim, so
no retry ever came. A failed write now raises `failed` exactly as a failed read
does, and the STOP branch answers 500 / `opt_out_incomplete` and releases the
claim. Covered by "a STOP whose consent-record WRITE fails is not acknowledged,
and the retry completes it".

---

## 5. What this costs — owed, and to whom

### 5.1 The site-request rail is the casualty (W2)

`site_request_consent_granted_dispatch` (00374) fires on a **party-row**
transition to `granted`, and it is the only caller of
`site_request_dispatch_after_consent()`; the lifecycle sweep only promotes
requests that already hold an outbox row. No consent act makes a party-row
transition any more, so:

- a site request parked in `awaiting_consent` is **not released** when consent
  arrives (asserted as it stands, test block 8c — if that assertion ever starts
  failing, the rail was repointed and the assertion is the one to update);
- `site_request_send()` **raises** for a `not_asked` assignee (§3).

**It is worse than "not released yet", and the close-out review sharpened it
(r3, tests §7).** `site_request_send()` (`00374:1265-1271`),
`site_request_resend()` (`:1364`) and `site_request_dispatch_after_consent()`
(`:1424`) each gate on `project_parties.sms_consent_status = 'granted'`, and a
grep of the whole tree finds **no live writer that can set a seat to `granted`
any more** — the inbound rail's `grantPartiesForStudios()` was deleted this wave
and `useRecordPartySmsConsent` only ever flipped `not_asked` → `pending`. So
resend and dispatch-after-consent can never succeed for **any** party created
after this wave, for any number, whatever the studio's real
`studio_channel_consent` record says. Both RPCs are `GRANT EXECUTE … TO
authenticated` and reachable from the portal and from Patina Field.

A fourth file belongs beside `SiteRequestContract.swift` in that repoint:
`apps/mobile/Capture/Capture/Features/SiteRequests/SupabaseSiteRequestService.swift`
selects `project_parties.sms_consent_status` directly (`:17` party columns) and
turns it into a client-facing boolean (`:516`, `:524` —
`smsConsentGranted: consentStatus == "granted"`). Patina Field's assignee picker
will therefore show that badge FALSE for ever for a party whose consent the
studio holds and the room correctly prints as `granted`.

Repointing the site-request rail at the record is one change and it belongs with
that rail, not inside a consent migration. It is stated in 00594's header, in
`COMMENT ON TABLE public.project_parties`, and here.

`site_request_send()` is `GRANT EXECUTE … TO authenticated` (`00374:3546`), and
it is called from the portal **and from Patina Field** — `SiteRequestContract`
names the RPC at `apps/mobile/Capture/Capture/Features/SiteRequests/SiteRequestContract.swift:15`.
So the iOS "send a site request" act fails for any `not_asked` assignee too, not
only the portal's.

### 5.1b The rest of the rails that still read the frozen seat

Added after close-review r1 (MAJOR-4). §5.1 and §8 named the site-request rail
and the portal's two UPDATE writers; these four are on the seat as well, and
**replacing the two portal writers is not sufficient to restore the double
opt-in**, because the invite dispatch fires on a party row and the YES gate
reads a party row.

**Four more were found in the close-out round and are FIXED in this wave, not
owed to W2** (close-out r3 MAJOR-1/MAJOR-2/MAJOR-3). They were all silent, they
all failed closed, and one of them was designer-facing today:

| Rail | Where | Now |
|---|---|---|
| the Field Coordination **Desk rollup** | `field_activity_summary.awaiting_reply_count`, `00282:578-582` → `use-field-activity.ts:48-55` → `field-desk.tsx:44-52` ("N parties haven't opted in") | **repointed at the record**, 00621 §1. On the frozen column the count could never clear, so the Desk said a party had not opted in while the Call Sheet printed "Texting" for the same row. SQL test block 41 |
| `fc_dispatch_court_assignment` | `00284:118-123`, SECURITY DEFINER trigger on `client_decisions` | **repointed**, 00621 §2a. Assigning a coordination item to a sub whose consent the studio holds on the record dispatched no `sms_court_assignment` at all. SQL test block 42 |
| `fc_dispatch_task_assignment` | `00284:176-181`, SECURITY DEFINER trigger on `project_tasks` | **repointed**, 00621 §2b. Same mechanism, on task assignment. SQL test block 42 |
| `field-daily` (the 13:00 UTC cron) | `field-daily/core.ts:154-157` and `:251-255`, both `.eq("sms_consent_status","granted")` | **repointed at the send gate itself** — `mayTextField()` asks the exported `channelConsentVerdict`, the same function `sendPartySms` asks, so the pre-filter cannot drift from the authority. The daily digest and the delivery confirms were dead for every consent recorded after the freeze. Six Deno tests, and the pre-fix core fails two of them |

`fc_dispatch_optin_invite` (00432) and `_site_request_consent_granted_dispatch`
(00374) are deliberately left on the seat — the first is the invite rail the
portal's INSERT still drives (§3), the second belongs to the site-request
repoint (§5.1).

| Rail | Where | What it reads off the frozen seat |
|---|---|---|
| the opt-in invite's own evidence proof | `_shared/sms.ts:830-845` | `sms_consent_source / _evidence / _recorded_at / _disclosure_version` on the party row. A consent recorded ONLY through `record_channel_consent()` leaves those NULL, so the invite returns `consent_evidence_required`. Today the invite still works because the add-party INSERT writes the seat as well as the record (§3) — which is exactly what R-AS says nothing should rely on |
| the inbound YES gate | `sms-inbound/pipeline.ts:766` | `parties.some(p => p.sms_consent_status === 'pending')` — a seat state no consent ACT can produce any more (only the add-party INSERT can) |
| `resolveRecipient` | `_shared/sms.ts:552-568` | `recipient.consent` comes off the party row, now frozen at whatever it held at fold time |
| `flushDeferredMessages` | `_shared/sms.ts:1070-1085` | the deferred row's party consent, read the same way, so the flush answers the same question the same way |
| **Patina Field's punch routing** (added at close-out r4, MAJOR-2) | `CaptureKit/CaptureKit/Sync/PunchTaskWrite.swift:98-106` (`PunchCourtResolver.resolve`), fed by `SupabaseSiteRequestService.swift:16-18` (`partyColumns`) and `:513-519` (`smsConsentGranted: consentStatus == "granted"`) | `project_parties.sms_consent_status`, and nothing else. **This is more than the badge §5.1 names.** `resolve()` requires `smsConsentGranted`, so for every GC added after this wave — however solid the studio's `studio_channel_consent` grant — it returns `.noCourt`; by that file's own ruling 2 a `.noCourt` punch is written with `owner_party_id = nil` (`Capture/Services/Sync/LocalCaptureSyncService.swift:893-896`), and `fc_dispatch_task_assignment` returns early on `NEW.owner_party_id IS NULL` (`00621:207-209`). So **00621 §2b's repoint is inert on the Field path**: no `sms_court_assignment` text, the punch never lands in the GC's court at all (it becomes the designer's own task), and `field-daily`'s `owner_party_id`-keyed digest never lists it either. `PunchCourtCopy.intent` shows the designer the matching no-court sentence at tap time, so the app is *consistent* about a wrong fact — which is why nobody notices |

W2's scope is therefore: the site-request rail, the portal's two UPDATE writers,
**the opt-in invite dispatch and its evidence proof**, **the inbound YES gate**,
`resolveRecipient` / `flushDeferredMessages`, and **Patina Field's punch
routing** — all repointed at `studio_channel_consent`.

**Why the Field fix is not one query change.** The obvious repoint — source
`smsConsentGranted` from `v_project_roster.sms_consent_status`, which already
carries the record's verdict and is already `GRANT SELECT … TO authenticated`
(`00594:1142`) — does not fit as it stands: the view has no `phone_e164`
column, and `PunchCourtResolver` needs it beside the consent word (a party can
be consented and unreachable, which is the whole point of the second clause).
Probed on the applied local schema:

```
$ psql … -At -c "select string_agg(column_name, ', ' order by ordinal_position)
                   from information_schema.columns
                  where table_name='v_project_roster';"
roster_id, source, project_id, kind, display_name, company_name, email, phone,
trade, job_title, staff_role, studio_contact_id, profile_id, show_to_client,
has_active_field_link, sms_consent_status, updated_at
```

So the repoint costs a view redefinition (a W2 migration appending
`phone_e164` to both branches — no dependent views, so `CREATE OR REPLACE`
suffices) plus a `source = 'party'` filter and the `roster_id`/`kind` renames
through `ProjectPartyRow`.

**And it must not land before W2's server side.** `ProjectPartyRow` feeds
`assignee.smsConsentGranted` as well as `fieldParty.smsConsentGranted`, and the
site-request RPCs are still on the seat: `site_request_send()` UPDATEs
`project_parties.sms_consent_status` to `pending` (`00374:1265-1268`) — the
write 00594 froze — and `site_request_resend()` / `site_request_dispatch_after_consent()`
gate on `= 'granted'` (`:1364`, `:1424`). Repoint the client at the record on
its own and Patina Field would show the assignee as consented and then take
`consent_legacy_column_frozen` from the RPC it hands her to — a louder
inconsistency than today's uniformly-false badge. R-AV's "reads consent from
`v_project_roster.sms_consent_status`" is therefore scheduled with W2's
site-request rail, not split across waves; §8 states the consequence of
shipping W1a before it.

### 5.2 Two consequences of keeping PR-x's second check over frozen rows

- **A legacy `opted_out` seat is now permanent.** R-AL's seat gate on
  `record_channel_consent`, and `orgHasOptedOutParty()` in the send rail, both
  read `project_parties.sms_consent_status = 'opted_out'`. Nothing can move that
  row, so a number carrying a pre-fold refusal on a seat stays un-grantable and
  un-sendable for that studio **even after the recipient replies START**. It
  fails CLOSED, and the way out is either W2 retiring PR-x's check or a
  deliberate `app.consent_legacy_write` repair — test block 16Bf walks exactly
  that. **And a phone edit can no longer create one on a number that never
  refused** (close-out r3 MAJOR-4). `useUpdateProjectParty` used to leave an
  `opted_out` seat's consent columns alone on a phone change — deliberately, so
  the refusal was never erased — which meant the UPDATE named only
  `phone`/`phone_e164`, the freeze never fired, and the refusal rode onto the
  corrected number, where `orgHasOptedOutParty()` and both write doors' seat
  gates read it. The room then printed `not_asked` over a dead number (all three
  write doors refusing, nothing to reconsent against), or — where the corrected
  number was one the studio already held a real grant for, the commonest typo —
  printed `granted` while every send came back `opted_out`: G-3's sentence
  restored inside the record built to end it, reachable by fixing a digit.
  Pre-freeze the seat itself printed "Opted out", which was the visible clue.
  The hook now REFUSES a genuine phone change on an `opted_out` seat, in a
  sentence ("This person replied STOP, and that refusal is attached to the number
  on file…"), symmetrically with the freeze's refusal on a `pending`/`granted`
  seat; a cosmetic reformat of the same digits is not a change and still lands.
  **The population that remains:** seats already transplanted before this fix —
  any `opted_out` seat whose `phone_e164` is not the number its
  `sms_opt_out_at`/evidence actually belongs to — plus any future transplant done
  outside the hook (service_role, SQL, a direct PostgREST call). Nothing on any
  surface names them, and the durable fix is W2 retiring PR-x's seat check, which
  `rulings.md` PR-x already contemplates ("then retire it in a named
  follow-up"). Five hook tests hold the refusal.
- **A refusal on ONE seat makes the whole number unsendable for that studio,
  even where another seat holds a genuine later grant** (close-review r1/r2
  MINOR-7). `00594:666` sets `refusal_unanswered = (f.org IS NOT NULL)` and the
  `refusal` population (`:567-570`) tests each row against **its own**
  `sms_consented_at` only — never across seats. So a studio holding a 2025 STOP
  on one seat and a real 2026 re-grant on a *different* seat folds to one record
  that is unsendable until the recipient texts START. It fails
  CLOSED, consistent with r8 W4-M1's ruling ("the record is minted UNSENDABLE"),
  and since close-review r2 MAJOR-2 the room now SAYS so — `channel_consent_status()`
  reads that record as `opted_out`, so the Call Sheet and the Directory print
  "Opted out" rather than "Texting" for it. **Until the close-out r4 round that
  sentence was false**: the rail's START target filter read the raw `status`
  column, and this population's records sit at `granted` or `not_asked` with
  `refusal_unanswered` raised — so no START reached them, and the record was
  unsendable *permanently*, with no recipient-side door at all, while the party
  sheet named that door in so many words. The filter now asks the verdict
  (§4, MAJOR-1), so the START in this sentence is real. The studio still
  cannot lower the flag through any door — `record_channel_reconsent()` only
  adds evidence beside it — and that is deliberate (R-AJ: only the person who
  refused answers the refusal). **Two residues W2 still owes:** an inbound YES
  cannot lower it either, because the YES leg gates on a frozen `pending` seat;
  and where the refusing seat itself reads `opted_out`, bullet 1's frozen seat
  gate (`orgHasOptedOutParty()`, and both write doors' seat tests) still refuses
  the send after the START has cleared the record — the way out of that one is
  W2 retiring PR-x's seat check.
- **One fail-open, narrow and named.** A project with `studio_id IS NULL` whose
  designer holds no active `design_studio` membership resolves to no org at all.
  The fold skipped it (`WHERE org IS NOT NULL`), so it has no record; the
  inbound STOP now writes no record for it either, and no longer writes its
  seats. If such a seat carries a legacy `sms_consent_status = 'granted'`, a
  STOP does not stop it. Before this wave the phone-global party write covered
  it. The phone-global RECORD read added to `channelConsentVerdict` closes the
  case where **some** studio recorded the STOP; it cannot close the case where
  **no** studio could. Fable's call: leave it, refuse every unattributable send
  outright, or make an unresolvable org a loud 500 on the STOP branch.

### 5.3 Smaller, owed to W1b

- `people_directory.meta.sms_consented_at` / `.sms_opt_out_at` still read the
  frozen columns. `channel_consent_status()` returns a status only; the v4
  rebuild should read `studio_channel_consent.consented_at` / `.opt_out_at`.
- The portal's two UPDATE writers (§3) still exist and now fail loudly. W2
  replaces them with the RPCs. Since close-review r1 (MAJOR-3 / F2 / F3) they
  fail in a SENTENCE rather than in Postgres: both hooks catch
  `consent_legacy_column_frozen` and throw "Texting consent has moved to the
  studio's own record, and this screen hasn't caught up yet. Nothing was
  changed." The refusal itself is unchanged — the edit does not land.

---

## 6. Verification

### Reset

```
$ pnpm --dir .../agent-people-build supabase:reset
…
Finished supabase db reset on branch main.
{"target":"local","version":"","message":"Reset local database."}
```

Clean, with `supabase/seed/00-legacy-grants.sql` regenerated first
(`python3 scripts/generate-legacy-grants.py` → *baseline + 2638 replayed
statements* after close-review r1 added `project_consent_org`'s REVOKE/GRANT; the diff is the two new function REVOKE/GRANTs and
`v_project_roster`'s re-stated `GRANT SELECT … TO authenticated`, minus the
mirror's REVOKE).

### SQL test

`supabase/tests/people/w1a_identity_channels_consent_test.sql` (4,765 lines, one
transaction, ROLLBACKed). Every mirror-based block was removed and replaced with
the record-based assertion of the same fact:

| Block | Was | Is |
|---|---|---|
| 4 | the mirror opts out both Alpha seats | a consent act writes **no** seat; `v_project_roster` prints the record; Beta's record and Beta's roster are untouched (org isolation) |
| 6 | one `pending` mirrors onto three seats without firing 00432 | one `pending` reaches **no** seat, dispatches nothing; a direct party-row write (escape hatch) still dispatches once, proving 00432's shipped body is live; no function carries the suppression flag |
| 8 | a mirrored `granted` fires neither AFTER trigger, and the mirror still releases parked requests | a recorded `granted` reaches no seat and dispatches nothing; **8c asserts the gap** (requests stay parked); 8d proves 00374's shipped trigger still fires on a real transition |
| 10 | the mirror refreshes the seats' evidence | the RECORD's evidence is refreshed, never hollowed (R-AN) |
| 13 | the inbound YES releases three parked requests | **the freeze**: each of the eight columns refused with `consent_legacy_column_frozen`; restating writes; the escape hatch opens and closes with its own statement; INSERT untouched |
| 18 | the mirror never nulls an evidence column on the seat | the record's `disclosure_version` / `recorded_by` survive a write that does not restate them; the frozen seat is untouched; `v_project_roster` **and** `people_directory` both print the record |
| 23 | the mirror keeps both dates on the seat | the record keeps both dates; the seat keeps its own; the roster prints the record's |
| 27, 28, 30, 30e, 30f, 35, 36 | seat-side assertions of the mirror's evidence rules | the record-side assertion of the same fact, plus "the seat is never written" and "the roster prints the record" |
| 37 (new) | — | the mirror function and trigger are gone; the freeze trigger is on `project_parties`; both views reference `channel_consent_status`; neither still reads `pp.sms_consent_status`; **org isolation through RLS** — Alpha's member reads Alpha's verdict, Beta's member asking for Alpha's org gets NULL |
| 38 (new, close-review r1) | — | **one resolver**: on a `studio_id IS NULL` project whose designer belongs to two studios, `project_consent_org()` answers the writers' studio for every caller; the Alpha reader no longer prints Alpha's word for Beta's seat, the Beta reader reads its own refusal, neither view still inlines the primary-studio lookup, and the resolver is a definer with a pinned search_path, closed to anon |

```
$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w1a_identity_channels_consent_test.sql
…
NOTICE:  37. the record is the single source: no mirror, the legacy columns frozen,
         both readers on channel_consent_status(), and org isolation through RLS (R-AS): passed
NOTICE:  38. one resolver for the seat's studio: reader and writer agree, and no view
         prints another studio's consent word (close-review r1 MAJOR-1): passed
NOTICE:  All W1a assertions passed.
ROLLBACK
```

### Deno tests

```
$ deno test --no-check -A --node-modules-dir=auto --config supabase/functions/deno.json \
    supabase/functions/_shared/sms.test.ts supabase/functions/_tests/sms-inbound.test.ts
ok | 83 passed | 0 failed (119ms)
```

The 83rd is close-review r1's BLOCKING-1 cover: "a STOP whose consent-record
WRITE fails is not acknowledged, and the retry completes it" — reads pass, the
upsert errors, and the branch must answer 500 / `opt_out_incomplete`, write
nothing on either ledger, release the `twilio_sid` claim, and complete on the
retry.

Nine sms-inbound tests were rewritten from party-row assertions to record
assertions (STOP per studio; the refusal's own evidence on the record beside the
grant's; UNSUBSCRIBE's own keyword; YES/START scope; the not-acknowledged STOP),
each now also asserting the seats are left exactly as they stood. Two new
`sms.test.ts` tests cover the phone-global RECORD read in the unattributable
branch: one where another studio's recorded STOP refuses the send, one where a
failed read of that scan refuses rather than allows.

### Generated types

```
$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
    pnpm --dir .../agent-people-build db:generate
$ diff -u <before> packages/supabase/src/database.types.ts
+      channel_consent_status: {
+        Args: { p_channel_kind: string; p_channel_value: string; p_organization_id: string }
+        Returns: string
+      }
+      project_consent_org: { Args: { p_project_id: string }; Returns: string }
```

9 changed lines, all additions: the two new functions. Trigger functions do not
appear in generated types, so the mirror's removal shows there as nothing —
probe 1 is what proves it.

### Probe

`artifacts/people-room-crm-2026-09-11/build/probe27-ras-single-source.sql`
(objects and access only, never the ledger):

```
— 1. the mirror is gone (function + trigger)
 mirror_fn                 | 0
 mirror_trg                | 0
 fns_reading_suppress_flag | 0

— 2. project_parties' triggers
 fc_optin_invite_dispatch              | f
 normalize_phone_project_parties       | f
 refuse_legacy_consent_write_trg       | t   (BEFORE UPDATE OF)
 set_updated_at_project_parties        | f
 site_request_consent_granted_dispatch | f

— 3. the two shipped trigger functions carry their shipped bodies
 _site_request_consent_granted_dispatch | still_guarded = f
 fc_dispatch_optin_invite               | still_guarded = f

— 4. channel_consent_status
 channel_consent_status | security_definer = f | provolatile = s |
   {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}

— 5. both shipped readers
 people_directory | reads_record = t | still_reads_seat = f
 v_project_roster | reads_record = t | still_reads_seat = f

— 6. the legacy columns say what they are
 all eight sms_* columns → "legacy; read studio_channel_consen…"

— 7. studio_channel_consent write access
 {postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,authenticated=r/postgres}
```

### The close-out fixes (00621 + the two TypeScript doors)

Two resets, both clean, head `00621`; legacy grants regenerated (*baseline +
2644 replayed statements* — the diff is 00621's two restated view GRANTs and the
two trigger-function REVOKEs); `db:generate` shows **no drift** (a view's column
list and two trigger functions are not in generated types); the SQL suite is
**45 passed, exit 0**, the only `ERROR|FAIL` match being a block title:

```
NOTICE:  41. the Desk rollup counts the record's pending, not the frozen seat's,
         and agrees with the Call Sheet about the same person (close-out r3 MAJOR-1): passed
NOTICE:  42. the two 00284 dispatch gates reach a party the record granted, and still
         refuse an unasked, a refused and a non-field one (close-out r3 MAJOR-3): passed
NOTICE:  All W1a assertions passed.
```

**The negative control** —
`build/probe39-close-r3-fix-negative-control.sql` restores the pre-00621 bodies
inside one rolled-back transaction and walks the same fixtures, so the new
assertions are visibly not tautologies. One project, three field seats: Ove and
Vi hold the studio's recorded GRANT with their seats frozen at `pending`, Nan
holds the recorded INVITE with her seat frozen at `not_asked`:

```
=== AFTER 00621 (what ships) ===
 desk_awaiting_reply_count_after_00621 = 1
 counted_as_awaiting_after_00621       = Nan Sorley
 dispatches_after_00621                = 2      (task + court, for the granted party)

=== BEFORE 00621 (the shipped objects the review found) ===
 desk_awaiting_reply_count_before_00621 = 2
 counted_as_awaiting_before_00621       = Ove Berglund, Vi Odom
 dispatches_before_00621                = 0

 display_name | roster_word
 Nan Sorley   | pending
 Ove Berglund | granted     ← the Desk was counting these two as "haven't opted in"
 Vi Odom      | granted
```

`field-daily`, `_shared/sms.ts` and the two hooks:

```
$ deno test --no-check -A --node-modules-dir=auto --config supabase/functions/deno.json     supabase/functions/_shared/sms.test.ts supabase/functions/_tests/sms-inbound.test.ts     supabase/functions/_tests/field-daily.test.ts
ok | 96 passed | 0 failed (151ms)          # 83 + 13, six of them new

# negative control: the PRE-fix core against the new tests
$ git stash push -- supabase/functions/field-daily/core.ts
$ deno test … --filter "MAJOR-2" supabase/functions/_tests/field-daily.test.ts
FAILED | 0 passed | 2 failed | 11 filtered out
$ git stash pop

$ pnpm --dir … --filter @patina/supabase test
Test Files  100 passed (100)
     Tests  1253 passed | 12 skipped (1265)

$ pnpm --dir … --filter @patina/supabase   type-check   # clean
$ pnpm --dir … --filter @patina/designer-portal type-check   # clean
$ ls deno.lock → No such file or directory
```

---

## 7. Unchanged by this pass

Everything the earlier rounds settled in 00592/00593 and in the rest of 00594
stands exactly as they left it: R-AI (affiliations backfill + the derived
`company_id` pointer trigger), R-AO (N persons × N firms, siblings stand),
R-AP (the three designated people), R-AR (a held card cannot change its kind or
its studio), R-AG (`not_asked` refused outright), R-AL (the seat-refusal gate,
org-scoped), R-AN (evidence refreshed, never nulled — on the record),
r6 R6-M3 (the email asymmetry), r7 M7-1/M7-2 (no studio write lowers
`refusal_unanswered`; reconsent is evidence-only), r8 W4-M1/W4-M2 and r9 M1/M2
(the fold's refusal and grant CTEs), r10 M1 (a STOP over a standing grant is
recorded wordless).

---

## 8. Not done

**W1a MUST NOT SHIP ALONE.** Rulings §6 deploys one chain, and this wave on its
own leaves two designer-facing acts refusing:

- `site_request_send()` raises `consent_legacy_column_frozen` for any
  `not_asked` assignee — from the portal AND from Patina Field (§5.1). That is a
  hard error on a live, un-flag-gated act, with no flag to hide it behind. And
  `site_request_resend()` / `site_request_dispatch_after_consent()` can never
  succeed for any party created after this wave, whatever the record says,
  because nothing can move a seat to `granted` again (§5.1). Patina Field's
  `smsConsentGranted` badge reads FALSE for ever for the same reason.
- **Patina Field's punch routing is dead until W2** (close-out r4 MAJOR-2).
  `PunchCourtResolver.resolve()` requires the same `smsConsentGranted`, so every
  Field punch taken after this wave resolves `.noCourt`, is written with
  `owner_party_id = nil`, and reaches neither `fc_dispatch_task_assignment` (the
  trigger 00621 §2b exists to repoint), nor the GC's court, nor `field-daily`'s
  digest. It fails quietly and the app's own copy agrees with the wrong fact, so
  there is no visible symptom — which makes it the most likely of these to ship
  unnoticed. Details and the reason the roster-view repoint is not a one-line
  change: §5.1b.
- Every phone edit of a seat currently `pending` or `granted`, and every use of
  the party sheet's own consent act, raises too (§3). Since close-review r1 the
  hooks turn that into a written sentence instead of the raw Postgres string —
  but the act still fails, and until W2 there is no working substitute in the
  room. Since the close-out round a phone edit of an `opted_out` seat is refused
  too, in its own sentence, because the refusal cannot travel (§5.2).

Owed:

- The site-request rail (§5.1) — W2.
- The opt-in invite's evidence proof, the inbound YES gate, `resolveRecipient`
  and `flushDeferredMessages` (§5.1b) — W2. Repointing only the two portal
  writers does NOT restore the double opt-in.
- The portal's two UPDATE writers (§3) — W2.
- `people_directory`'s two consent DATES (§5.3) — W1b's v4 rebuild.
- Patina Field's `SupabaseSiteRequestService.swift` party-column select and its
  `smsConsentGranted` badge (§5.1) — W2, with the site-request rail — **and
  `CaptureKit/Sync/PunchTaskWrite.swift`'s `PunchCourtResolver`, which reads the
  same mapping and routes every Field punch on it** (§5.1b). Repointing the
  badge alone leaves punch routing dead; the fix wants `phone_e164` added to
  `v_project_roster` first.
- Retiring PR-x's seat check, which is what finally un-strands a transplanted or
  legacy `opted_out` seat (§5.2) — W2.
- The unattributable-send fail-open (§5.2) — needs Fable's ruling. Close-review
  r1 (F1) confirms it independently and names it a REGRESSION against pre-00594
  behaviour: the phone-global party write used to catch exactly this case.
- Nothing deployed. This close-out added **00621**
  (`00621_consent_readers_repointed.sql`), so **W1b mints from 00622**;
  00595–00620 remain reserved for another program. A `_shared/sms.ts` edit is in
  this pass (the `channelConsentVerdict` export), so the deploy chain must
  redeploy EVERY function importing `_shared/sms.ts`, not only `field-daily`.
