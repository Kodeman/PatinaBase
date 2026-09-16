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

**Amended again after close-out review round 5 (2026-09-12).** Two fixes, both
on the same population — a seat whose studio cannot be resolved, or whose
refusal lives only on a frozen seat. The phone-correction refusal above was
closed at the portal door and not in the database, so it moved to 00594's own
freeze trigger (§5.2 bullet 1, SQL block 43); and a STOP on a project no studio
can be resolved for is no longer acknowledged 200 with nothing recorded anywhere
(§5.2 bullet 3, three Deno tests). The SEND fail-open for that population is
still Fable's policy call (§8).

**Amended again at the R-AW pass (2026-09-12), migration `00622`.** (R-AW is
what the W1 final-run brief calls it; `rulings.md` §3 records it as **R-AY**,
which is the canonical id. Both names mean the same ruling, and this report uses
R-AW throughout because the brief does.) R-AW supersedes PR-x's lean: `studio_channel_consent` is the only thing any gate or
reader consults for SMS consent, so `channelConsentVerdict` reads the record
alone (a missing record is `not_asked`, and `not_asked` refuses),
`record_channel_consent` lost its three inlined seat tests, and the
site-request rail — §5.1's "casualty", owed to W2 by every earlier round — is
paid: the consent-granted release trigger moves onto `studio_channel_consent`
and `site_request_send()` reads `channel_consent_status()` instead of writing a
frozen column. §5 is rewritten to the record-only model; §6 gains the R-AW
pass's own verification; §8 is corrected. **Kody may overrule R-AW**, and §5.1b
names the one place where reading its headline literally rather than its
enumerated points would go further than this pass did.

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
holding a real pre-fold `granted` — not behind `channelConsentVerdict` any more
(R-AW removed that), but in `sendPartySms`'s own surviving PR-x leg off
`resolveRecipient`. The justification narrowed with the R-AW pass rather than
disappearing, and the leg can only make these gates MORE permissive than the
send gate that follows; R-AW scopes its point 4 to 00594, so 00621 is untouched
and the residue is flagged in §5.1b(b). A gate that read the record ALONE would refuse
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
| `public.site_request_send(uuid)` | `00374_field_site_request_loop.sql:1265-1269` — moved a `not_asked` assignee to `pending` before dispatching a site request | **no longer a writer at all (R-AW, 00622).** It reads `channel_consent_status()` and writes no seat; the release trigger moved onto `studio_channel_consent` (§5.1) |
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

**AMENDED AT THE R-AW PASS.** `channelConsentVerdict(supabase, phone,
projectId)` reads the record and nothing else:

1. the owning studio cannot be RESOLVED (a read that errored) → **refuse** (R-AM);
2. the studio's record says `opted_out`, or `refusal_unanswered` is true → **refuse**;
3. the record says `granted` → **allow**; the record says `pending` → **unknown**,
   and `sendPartySms`'s invite gate owns it;
4. the record says `not_asked`, **or there is no record at all** → **refuse**.

`orgHasOptedOutParty()` is deleted (nothing else used it), and so is the
phone-global `project_parties` reduction that closed the unattributable branch.
That branch keeps its phone-global **RECORD** read, fail-closed: any studio's
recorded refusal on the number refuses a send that belongs to no studio at all,
and a read that errors refuses like its siblings. Branch 4 is the ruling's
substance — before it, a missing record fell through to the party row and a
pre-fold seat reading `granted` carried the send, which was the one path by
which a frozen column could still AUTHORISE a text. `reduceConsent()` survives
because `resolveRecipient` uses it, which is why `sendPartySms`'s and
`flushDeferredMessages`'s own second checks are still on the seat — §5.1b(b).

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
`"refuse"`, send on its `"allow"`, and on `"unknown"` honour a `granted` seat
exactly as `sendPartySms`'s own legacy gate still honours it — so the
pre-filter can never be narrower than the authority behind it. **Since R-AW
`"unknown"` means one thing only: a `pending` record.** "No record yet" is now
`"refuse"`, so a frozen `granted` seat the record knows nothing about gets no
digest (the field-daily test that asserted the opposite is inverted). A refused party is counted in
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

**REWRITTEN AT THE R-AW PASS (2026-09-12, migration 00622).** Everything this
section used to describe was a consequence of one decision: PR-x's lean, which
kept "the phone-global consent reduction in `sms.ts`" alive as a fail-closed
SECOND check over the frozen seats until the backfill was proven. **R-AW
supersedes PR-x's lean; Kody may overrule.** The argument is one sentence:
00594's own backfill folds EVERY seat into a record inside the same migration
(`opted_out` winning per org), and the freeze trigger means no seat has carried
news since — so a seat holds no fact the record does not already hold, and a
second reader of a frozen copy can only ever contradict the one live ledger.
`studio_channel_consent` is now the only thing any gate or reader consults for
SMS consent.

### 5.1 The site-request rail — PAID, not owed (00622)

R-AS called this rail the casualty and owed it to W2. R-AW pays it.

| Object | Was | Is (00622) |
|---|---|---|
| `public.site_request_send(uuid, timestamptz)` | 00374:1265-1269 read the assignee's verdict off `project_parties.sms_consent_status` and, for a `not_asked` assignee, **wrote** that column to `pending` — the write 00594 froze. A live, un-flag-gated designer act, and Patina Field's own "send a site request" (`SiteRequestContract.swift:15`), raised `consent_legacy_column_frozen` | reads `COALESCE(channel_consent_status(project_consent_org(project_id), 'sms', phone_e164), 'not_asked')` and writes **no seat**. A studio holding no record reads `not_asked` and the request parks in `awaiting_consent` exactly as before; recording the invite belongs to `record_channel_invite()` / `record_channel_consent()`. Everything else — every errcode, every snapshot column, the outbox cancellation, both return shapes — is 00374 verbatim |
| `public._site_request_consent_granted_dispatch()` + its trigger | `AFTER UPDATE OF sms_consent_status ON project_parties`. No consent act makes a party-row transition any more, so a request parked in `awaiting_consent` was **never released** | the trigger MOVES onto `studio_channel_consent`: `AFTER INSERT OR UPDATE OF status`, `WHEN` the verdict becomes a standing `granted` on an `sms` channel, and the body's own guard tests the TRANSITION (a restated grant releases nothing twice — the `WHEN` clause cannot ask that, because `OLD` does not exist on INSERT). The loop finds every `awaiting_consent` request whose assignee seat carries this record's phone in this record's studio, resolved through `project_consent_org()`. One dispatch per parked REQUEST — the fan-out the mirror caused is gone by construction, because the loop is over requests, not seats. The old trigger on `project_parties` is dropped, so a deliberate `app.consent_legacy_write` repair cannot text a trade |
| `public.site_request_dispatch_after_consent(uuid, timestamptz)` | 00374:1424 gated on the seat reading `granted`, which nothing can set | the same question, asked of the record. **This one is forced, not optional:** the trigger above is its only caller, so a body that can never be satisfied would raise inside the consent write and abort the consent act itself |

`site_request_resend()` is **NOT** repointed. R-AW enumerates the dispatch
trigger and `site_request_send()`; resend is not on the release path, so it is
left exactly as it stands — still gating on `project_parties.sms_consent_status
= 'granted'`, still unable to succeed for a party created after 00594. Owed,
and named in §8. Probe 5 in `probe44-r-aw-record-only.sql` prints the rail's
remaining seat readers as a list, so it cannot drift unnoticed.

### 5.1b What still reads the frozen seat — the list, after R-AW

Three classes, and the distinction matters.

**(a) Gone this pass.** The three inlined seat tests inside
`record_channel_consent` (R-AL's read-before-write gate at `00594:1696-1720`,
the same rule restated inside the upsert's `DO UPDATE … WHERE` at `:1972-1980`,
and the `NOT FOUND` branch's diagnosis at `:2040-2052`), and in
`_shared/sms.ts` both party-row legs of `channelConsentVerdict` —
`orgHasOptedOutParty()` (deleted; nothing else used it) and the phone-global
`project_parties` reduction in the unattributable branch. The unattributable
branch keeps its phone-global **RECORD** read, fail-closed, exactly as the
close-out added it.

`backfill_channel_consent_from_parties()` is the one permitted reader of
`project_parties.sms_consent_*`, and it reads at migration time. Probe 1 prints
`reads_seat_col = f` for all four consent RPCs and `t` for the fold alone.

**(b) Still on the seat, and deliberately so — W2's.**

| Reader | Where | Why it stays, and what it costs |
|---|---|---|
| `sendPartySms`'s own legacy legs | `_shared/sms.ts` — `recipient.consent === "opted_out"` refuses, `recipient.consent !== "granted"` refuses a non-invite, `!== "pending"` refuses an invite; `recipient.consent` comes off `resolveRecipient`, which reduces `project_parties` | **The last frozen-column reader in the send path.** R-AW's point 1 names only `channelConsentVerdict`, and its own words — "delete those helpers **if nothing else uses them**" — leave `reduceConsent()` standing, because `resolveRecipient` uses it. The asymmetry is deliberate: these legs can only ever REFUSE a send the record would allow, and an over-refusal is safe where an under-refusal is a 10DLC incident. **The visible consequence:** a legacy `opted_out` seat whose record reads `granted` (only reachable through the fold → reconsent → the recipient's own START) is `allow` at the verdict and still refused here. SQL block 44 asserts the record-side answer; the Deno test "a granted record does not override an opted-out party row — sendPartySms's legacy leg, not the verdict" names the residue in its own title. **If Kody wants the headline read literally rather than the enumeration, this is the one-line change, and it belongs with W2's other four.** |
| `flushDeferredMessages`'s second check | `_shared/sms.ts` — the deferred row's own party, then the phone-global reduction where there is no party to narrow to | the same reasoning, in the same file. R-AH keeps the primary gate identical to `sendPartySms`'s; the second check mirrors `sendPartySms`'s second check and moves with it |
| `mayTextField` (field-daily) | `field-daily/core.ts:70` — `party.sms_consent_status === "granted"` on the gate's `"unknown"` | a PRE-FILTER whose whole design rule is that it cannot be narrower than the authority behind it (close-out r3 MAJOR-2). `"unknown"` now means one thing only — a `pending` record — so this leg mirrors `sendPartySms`'s invite leg and nothing else. It moves when the row above it moves |
| the opt-in invite's evidence proof | `_shared/sms.ts` — `sms_consent_source / _evidence / _recorded_at / _disclosure_version` on the party row | a consent recorded ONLY through `record_channel_consent()` leaves those NULL, so the invite returns `consent_evidence_required`. The invite still works because the add-party INSERT writes the seat as well as the record (§3) — which is exactly what R-AS says nothing should rely on |
| the inbound YES gate | `sms-inbound/pipeline.ts` — `parties.some(p => p.sms_consent_status === 'pending')` | a seat state only the add-party INSERT can produce. START is the recipient's door and reads the verdict (R-AU); YES does not |
| `fc_dispatch_optin_invite` (00432) | the invite rail the portal's INSERT still drives | left on the seat on purpose: the INSERT is what fires it |
| 00621's two dispatch gates | `fc_dispatch_court_assignment` / `fc_dispatch_task_assignment` — `… AND v_party.sms_consent_status <> 'granted'` | the seat leg was justified by `sendPartySms` honouring a frozen `granted`. That justification is now narrower, not gone (the row above it). The leg can only make these gates MORE permissive than the send gate that follows, so the worst case is a dispatch whose text is then refused — never a text nobody consented to. R-AW scopes point 4 to 00594, so they are untouched here; **flagged for Kody** |
| `site_request_resend()` | 00374:1364 | §5.1 |
| Patina Field's `PunchCourtResolver` + `SupabaseSiteRequestService` | `PunchTaskWrite.swift:98-106`, `SupabaseSiteRequestService.swift:16-18`, `:513-519` | R-AV, W2, and the reason it is not a one-line change is §5.1b of the pre-R-AW report: `v_project_roster` has no `phone_e164` column yet. **One thing changed for the better:** the server half of the reason it "must not land before W2's server side" is now paid — `site_request_send()` no longer raises, so a repointed client would no longer be handed `consent_legacy_column_frozen` |
| `people_directory.meta.sms_consented_at / .sms_opt_out_at` | 00594:1366-1367 | dates, not a verdict; W1b's v4 rebuild reads them off the record (§5.3) |

**(c) Portal WRITERS of the frozen columns — unchanged, and still failing
loudly** (R-AW point 6; W2 removes them):

| Writer | Where | What happens |
|---|---|---|
| `useAddProjectParty` | `packages/supabase/src/hooks/use-coordination.ts:495-496` — an **INSERT** carrying `sms_consent_status` / `sms_consent_source` | unaffected by the freeze (it is `BEFORE UPDATE`), and it also records the invite through `record_channel_consent(…, 'pending', …)` before the insert. This is the one path that still makes the invite's evidence proof work |
| `useUpdateProjectParty`'s `revertsToOptedOut` branch | `use-coordination.ts:715-727` (UPDATE of the eight on a phone edit) | raises `consent_legacy_column_frozen`, caught and thrown as a sentence. Replacement: `record_channel_consent(…, 'opted_out', …)` |
| `useUpdateProjectParty`'s phone edit on an `opted_out` seat | `use-coordination.ts:669-708` (hook refusal) + 00594's own trigger (`consent_opted_out_phone_frozen`, R-AX) | refuses in a sentence. **Kept as-is on purpose:** it is a WRITE guard, not a verdict reader, and a frozen column is still a column nothing may quietly rewrite. R-AW does not touch it |
| `useRecordPartySmsConsent` | `use-coordination.ts:884-893` (UPDATE … `.eq('sms_consent_status','not_asked')`) | raises, in a sentence. Replacement: `record_channel_consent(…, 'pending', …)` |

### 5.2 What R-AW changes about the send verdict, and the one fail-open left

`channelConsentVerdict` is now four branches and no seat:

1. the owning studio could not be RESOLVED (a read that errored) → **refuse**, logged (R-AM);
2. the studio's record says `opted_out`, or `refusal_unanswered` is true → **refuse**;
3. the record says `granted` → **allow**; the record says `pending` → **unknown**, and `sendPartySms`'s invite gate owns it;
4. the record says `not_asked`, **or there is no record at all** → **refuse**.

Branch 4 is the ruling's substance. Before it, a missing record fell through to
the party row and a pre-fold seat reading `granted` carried the send — the one
path by which a frozen column could still AUTHORISE a text. Two Deno tests hold
it ("no record refuses even a seat frozen at granted", "a not_asked record
refuses, exactly as no record does").

**Three consequences the previous model carried, now gone:**

- **A legacy `opted_out` seat is no longer permanent.** R-AS's §5.2 bullet 1
  described a number carrying a pre-fold refusal on a seat as un-grantable and
  un-sendable for ever, even after the recipient replied START, with the way out
  being either W2 or a deliberate `app.consent_legacy_write` repair. The seat is
  not read, so the recipient's own START is the whole way out. SQL block 16Be
  walks it and 16Bf asserts both room readers print `granted` for that seat while
  the seat itself still says `opted_out`.
- **A refusal on ONE seat no longer makes the whole number unsendable** except
  where the FOLD said so — which is the correct place for that rule to live, and
  it still fails closed there (`refusal_unanswered` on the folded record, lifted
  only by the recipient's own YES/START). The stranding described before came
  from `orgHasOptedOutParty()` re-deriving a verdict from the frozen copy after
  the record had been answered.
- **The stale-record scan is gone**, and with it the "a `granted` record is never
  self-certifying" rule. It is self-certifying now, because the copy it was being
  checked against cannot change.

**The one fail-open, unchanged and still owed a POLICY ruling.** A project with
`studio_id IS NULL` whose designer holds no active `design_studio` membership
resolves to no org at all. The fold skipped it (`WHERE org IS NOT NULL`), so it
has no record; the inbound STOP can write no record for it either. R-AW keeps
the close-out's answer to the half that can be answered in code: the STOP is
**not acknowledged** (`500 / opt_out_incomplete`, the `twilio_sid` claim
released, Twilio retries — R-AT/R-AW's own `unattributated` flag), and the
unattributable SEND still asks every studio's RECORD on that number
phone-globally and refuses on any refusal or any failed read. What it cannot do
is require a record for a project that has no ledger to hold one, so an
unattributable send with a clean record scan still goes. Three options, all
policy: leave it, refuse every unattributable send outright, or give those
projects a studio. Fable's call, not this migration's.

And the reader-side half of that population is unchanged too:
`channel_consent_status(NULL, 'sms', …)` can never match a row, so both views
`COALESCE` to `not_asked` and `roster-derivation.ts:390`'s "N reachable by text"
under-counts for a seat the rail may still text.

### 5.3 Smaller, owed to W1b

- `people_directory.meta.sms_consented_at` / `.sms_opt_out_at` still read the
  frozen columns. `channel_consent_status()` returns a status only; the v4
  rebuild should read `studio_channel_consent.consented_at` / `.opt_out_at`.
- The portal's writers (§5.1b(c)) still exist and fail in a sentence. W2
  replaces the two UPDATE paths with the RPCs.
- **W1b now mints from 00623.** 00622 is this pass; 00595–00620 remain reserved
  for another program.

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

### The close-out r5 fixes (00594's freeze + the STOP's fifth flag)

One reset, clean, head `00621`; the SQL suite and the consent Deno subset re-run
after both edits. Nothing but the two findings' own files changed.

```
$ pnpm --dir … supabase:reset
RESET_EXIT=0   errors=0
Finished supabase db reset on branch main.
$ psql … -At -c "select version from supabase_migrations.schema_migrations order by version desc limit 4;"
20260910152111 / 00621 / 00594 / 00593

# MAJOR-1: both phone columns are now on the freeze trigger, beside the eight
$ psql … -At -c "select a.attname from pg_trigger tg join pg_class c on c.oid=tg.tgrelid
                 join pg_attribute a on a.attrelid=tg.tgrelid and a.attnum = ANY(tg.tgattr::int2[])
                 where c.relname='project_parties'
                   and tg.tgname='refuse_legacy_consent_write_trg' order by a.attname;"
phone / phone_e164 / sms_consent_disclosure_version / sms_consent_evidence /
sms_consent_recorded_at / sms_consent_recorded_by / sms_consent_source /
sms_consent_status / sms_consented_at / sms_opt_out_at

# …and the r5 review's own P5b probe, re-run (one rolled-back transaction)
NOTICE:  P5b AFTER FIX: phone-only UPDATE on an opted_out seat ->
         consent_opted_out_phone_frozen  (number now +16125550302)
NOTICE:  P5b HINT: This person replied STOP, and that refusal is attached to the
         number on file. Changing it would carry the refusal onto a number that
         never refused. Add them again with the corrected number instead.

$ psql … -v ON_ERROR_STOP=1 -f supabase/tests/people/w1a_identity_channels_consent_test.sql
PSQL_EXIT=0
45                                    # lines matching ": passed" (44 + block 43)
NOTICE:  43. an opted_out seat's number cannot move, and every other phone edit
         still can (close-out r5 MAJOR-1): passed
NOTICE:  All W1a assertions passed.
ROLLBACK

$ deno test --no-check -A --node-modules-dir=auto --config supabase/functions/deno.json \
    supabase/functions/_shared/sms.test.ts supabase/functions/_tests/sms-inbound.test.ts \
    supabase/functions/_tests/field-daily.test.ts
ok | 103 passed | 0 failed (366ms)    # 100 + the three BLOCKING-1 covers

# replay, each migration inside its own rolled-back transaction
--- replay 00594_studio_channel_consent --- EXIT=0 errors=0
--- replay 00621_consent_readers_repointed --- EXIT=0 errors=0

$ python3 scripts/generate-legacy-grants.py     # byte-identical, no GRANT/REVOKE moved
$ SUPABASE_DB_URL=… pnpm --dir … db:generate    # GEN_EXIT=0, no drift (a trigger is not a type)
```

---


### The R-AW pass (00622 + `_shared/sms.ts`)

Local only. Nothing pushed to Strata: no `supabase db push`, no
`supabase functions deploy`.

```
$ pnpm --dir .../agent-people-build supabase:reset      # twice, both clean
Finished supabase db reset on branch main.
{"target":"local","version":"","message":"Reset local database."}
$ psql … -At -c "select version from supabase_migrations.schema_migrations
                  order by version desc limit 3;"
20260910152111 / 00622 / 00621

# legacy grants regenerated BEFORE the reset, and stable on a re-run
$ python3 scripts/generate-legacy-grants.py
wrote …/supabase/seed/00-legacy-grants.sql — baseline + 2651 replayed statements
   # the diff is 00622's seven REVOKE/GRANTs and nothing else (42 lines added)

# generated types: NO drift. A redefined function body, a moved trigger and a
# restated grant are none of them types.
$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
    pnpm --dir … db:generate        # GEN_EXIT=0
$ diff -u <before> packages/supabase/src/database.types.ts | wc -l
0

# replay, inside its own rolled-back transaction
$ psql … -v ON_ERROR_STOP=1 -c "BEGIN;" \
    -f supabase/migrations/00622_consent_record_is_the_only_gate.sql -c "ROLLBACK;"
REPLAY_EXIT=0   errors=0   → COMMENT / ROLLBACK

$ psql … -v ON_ERROR_STOP=1 -f supabase/tests/people/w1a_identity_channels_consent_test.sql
PSQL_EXIT=0
46                                    # lines matching ": passed" (45 + block 44)
NOTICE:  8.   the record releases the parked site requests, once each (R-AW): passed
NOTICE:  16B. a DATELESS refusal fails closed too, and the recipient's START is
              the whole way out (r4 B-1 / R-AW): passed
NOTICE:  19.  the write door reads the record, and only the record (R-AW): passed
NOTICE:  22.  the record's gate is on the refusal, not the verdict, and the seat
              is not consulted at all (r6 B6-1/M6-1 under R-AW): passed
NOTICE:  44.  the site-request rail asks the record and writes no seat, and a
              record-granted / seat-refused number is sendable (R-AW): passed
NOTICE:  All W1a assertions passed.
ROLLBACK

$ deno test --no-check -A --node-modules-dir=auto --config supabase/functions/deno.json \
    supabase/functions/_shared/sms.test.ts supabase/functions/_tests/sms-inbound.test.ts \
    supabase/functions/_tests/field-daily.test.ts
ok | 103 passed | 0 failed (145ms)
$ deno check --no-lock --config supabase/functions/deno.json \
    supabase/functions/_shared/sms.ts supabase/functions/field-daily/core.ts \
    supabase/functions/sms-inbound/pipeline.ts      # all three clean
$ ls deno.lock → No such file or directory
```

**Which SQL blocks changed, and how.** Every assertion that read a seat for a
verdict is gone; the fact it protected is asserted on the record instead.

| Block | Was | Is |
|---|---|---|
| 8 | 8b asserted a recorded grant dispatches NOTHING; 8c asserted the gap (parked requests stay parked, "if this now passes the rail was repointed and this assertion is the one to update"); 8d proved 00374's shipped trigger still fired on a real party-row transition | 8b/8c: the grant releases each parked request **exactly once** (two seats, one number, two requests → 2 dispatches, both snapshots `granted`); 8d: a RESTATED grant releases nothing again (the transition gate); 8e: the trigger is off `project_parties` and on `studio_channel_consent`, and a deliberate `app.consent_legacy_write` repair now dispatches nothing at all |
| 16Be/16Bf | after the recipient's START, R-AL's frozen-seat gate still refused the write door; 16Bf needed an `app.consent_legacy_write` seat repair to open it | the START alone reopens the door, and both room readers print the record's `granted` while the seat still says `opted_out` |
| 19 | "the write door reads the seats too (R-AL)": a dated seat refusal with no record refused the grant | "the write door reads the record, and only the record": that grant LANDS, the seat is neither read nor written, and the real population still fails closed **through the fold** — 19c folds the same seat, the folded refusal refuses, and reconsent() + the recipient's answer is the only way through. 19pre asserts the source text of all four consent RPCs carries no `project_parties` and no `sms_consent_` at all |
| 22 | "the seat gate is on the refusal, not the verdict": a dateless and a dated seat refusal each refused `granted` and `pending` | the same two rules, on the RECORD (a dateless recorded refusal fails closed; `pending` is not a free first hop), plus the inverse: unfolded, neither seat refuses anything and neither is written. The fold is the gate |
| 44 (new) | — | the site-request rail. `site_request_send()` on a never-asked assignee **does not raise**, parks `awaiting_consent` with the record's word, writes no seat and mints no record; the studio's recorded grant then releases it through the record's own trigger; and R-AW's named case — a frozen `opted_out` seat whose record reads `granted`, reached the only honest way (fold → reconsent → the recipient's START) — is sendable: `channel_consent_status` says `granted`, `v_project_roster` prints it, `site_request_send()` goes straight to `send`, and `site_request_dispatch_after_consent()` succeeds |

**Which Deno tests changed.** Two removed with the legs they covered ("the
stale-record scan resolves a NULL-studio_id project from organization_members",
"a failed phone-global scan refuses the send instead of reading as no refusal" —
the record-scan version of the second one stays), five inverted or retitled,
one field-daily test inverted, and two added for branch 4. 103 passed.

**The negative control** —
`build/probe45-r-aw-negative-control.sql` restores the four pre-00622 bodies
(`00374:1220-1331`, `:1395-1460`, `:3399-3444` + its party-row trigger, and
`00594:1581-2087`) inside ONE rolled-back transaction and walks the same
fixtures, so blocks 8, 19 and 44 are visibly not tautologies:

```
NOTICE:  BEFORE 00622: dispatches from a recorded grant = 0 (00622: 1 per parked request)
NOTICE:  BEFORE 00622: parked requests released         = 0 (00622: 1)
NOTICE:  BEFORE 00622: site_request_send on a not_asked assignee -> consent_legacy_column_frozen (00622: no error)
NOTICE:  BEFORE 00622: grant over a frozen opted_out SEAT -> channel_opted_out (00622: it lands)
NOTICE:  BEFORE 00622: release trigger on project_parties = 1 (00622: 0, it is on studio_channel_consent)
```

**The object probe** — `build/probe44-r-aw-record-only.sql` (objects and access
only, never the ledger):

```
— 1. no consent RPC reads a frozen seat column
 backfill_channel_consent_from_parties | reads_seat_col = t | reads_seats = t   ← the one permitted reader
 channel_consent_status                | f | f
 record_channel_consent                | f | f
 record_channel_invite                 | f | f
 record_channel_reconsent              | f | f

— 2. channel_consent_status: status AND refusal_unanswered, nothing else
 security_definer = f | provolatile = s | {search_path=public}
 {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
 SELECT CASE WHEN scc.refusal_unanswered IS TRUE THEN 'opted_out'
             ELSE scc.status END FROM public.studio_channel_consent scc WHERE …

— 3. the release trigger has moved onto the record
 studio_channel_consent | site_request_consent_granted_dispatch |
   AFTER INSERT OR UPDATE OF status … WHEN (new.channel_kind = 'sms'
   AND new.status = 'granted' AND new.refusal_unanswered IS NOT TRUE)

— 4. project_parties' triggers after 00622
 fc_optin_invite_dispatch · normalize_phone_project_parties ·
 refuse_legacy_consent_write_trg · set_updated_at_project_parties
   (site_request_consent_granted_dispatch is gone)

— 5. the site-request rail: who still reads the frozen seat for a verdict
 _site_request_consent_granted_dispatch | f
 site_request_dispatch_after_consent    | f
 site_request_send                      | f
 site_request_resend                    | t   ← §5.1, owed
 fc_dispatch_court_assignment           | t   ← 00621, §5.1b(b)
 fc_dispatch_task_assignment            | t   ← 00621, §5.1b(b)
 fc_dispatch_optin_invite               | t   ← deliberate, §5.1b(b)

— 6. grants on everything 00622 redefined
 record_channel_consent                 | {postgres,authenticated,service_role}
 site_request_send                      | {postgres,authenticated,service_role}
 site_request_dispatch_after_consent    | {postgres,service_role}
 _site_request_consent_granted_dispatch | {postgres,service_role}
```

One pre-existing, unrelated red in the wider edge suite:
`supabase/functions/_tests/stripe-rail.test.ts` throws
`supabaseKey is required` at module top level because it needs
`SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_ANON_KEY` in the environment. It imports
nothing this pass touched. Everything else: `719 passed | 1 failed`.

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

**REWRITTEN AT THE R-AW PASS (2026-09-12).** Two of the three things that made
"W1a MUST NOT SHIP ALONE" true are paid by `00622`, and the third is narrowed.

**Paid this pass:**

- `site_request_send()` no longer raises `consent_legacy_column_frozen` for a
  `not_asked` assignee, from the portal or from Patina Field. It reads the
  record and writes no seat (§5.1, SQL block 44a).
- A site request parked in `awaiting_consent` is released again — by the
  studio's recorded grant, through a trigger that now lives on
  `studio_channel_consent` (§5.1, SQL blocks 8b/8c/44b).
- `site_request_dispatch_after_consent()` succeeds for a record-granted,
  seat-frozen assignee (SQL block 44d).
- A legacy `opted_out` seat is no longer permanent: the recipient's own START
  reopens the write door with no `app.consent_legacy_write` repair (SQL block
  16Be).

**Still true, and still means W1a does not ship alone:**

- **Patina Field's punch routing is dead until W2** (R-AV, close-out r4
  MAJOR-2). `PunchCourtResolver.resolve()` requires `smsConsentGranted`, sourced
  from `project_parties.sms_consent_status`, so every Field punch taken after
  this wave resolves `.noCourt`, is written with `owner_party_id = nil`, and
  reaches neither `fc_dispatch_task_assignment` (the trigger 00621 §2b exists to
  repoint), nor the GC's court, nor `field-daily`'s digest. It fails quietly and
  the app's own copy agrees with the wrong fact. **One thing got easier:** the
  server-side reason it "must not land before W2's server side" is now paid, so
  the repoint is a client change plus `phone_e164` on `v_project_roster`, not a
  cross-wave sequencing problem.
- `site_request_resend()` still gates on the frozen seat and still cannot
  succeed for a party created after 00594 (§5.1). It is not on the release path,
  and R-AW does not name it.
- Every phone edit of a seat currently `pending` or `granted`, and the party
  sheet's own consent act, still raise — in a sentence (§5.1b(c)). W2 replaces
  both with the RPCs.

**Owed:**

- The portal's two UPDATE writers (§5.1b(c)) — W2.
- `sendPartySms` / `flushDeferredMessages` / `mayTextField`'s surviving PR-x
  second check, the opt-in invite's evidence proof, and the inbound YES gate
  (§5.1b(b)) — W2. **If Kody reads R-AW's headline literally rather than its
  enumerated point 1, the first of those moves into this pass instead; §5.1b(b)
  states the one visible consequence of leaving it.**
- `site_request_resend()` (§5.1) — W2, with the rest of the rail.
- 00621's two dispatch gates keep a seat leg whose justification narrowed with
  this pass (§5.1b(b)) — **flagged for Kody**, since R-AW scopes point 4 to
  00594.
- Patina Field's `SupabaseSiteRequestService.swift` and
  `CaptureKit/Sync/PunchTaskWrite.swift` (R-AV) — W2, after `phone_e164` is
  appended to `v_project_roster`.
- `people_directory`'s two consent DATES (§5.3) — W1b's v4 rebuild.
- The unattributable-**send** fail-open (§5.2) — still needs Fable's POLICY
  ruling. A studio-less project has no ledger to write, so the send can only be
  closed by refusing every unattributable send or by giving those projects a
  studio. The STOP half is closed (500 / `opt_out_incomplete`, claim released).
- Nothing deployed. This pass added **00622**
  (`00622_consent_record_is_the_only_gate.sql`), so **W1b mints from 00623**;
  00595–00620 remain reserved for another program. `_shared/sms.ts` is edited
  again in this pass, so the deploy chain must redeploy EVERY function importing
  `_shared/sms.ts`.
