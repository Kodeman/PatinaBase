# W1a — the data layer: identity, channels, consent

Branch `build/people-room-crm-2026-09-11`, worktree `.codex/worktrees/agent-people-build`.
Local Supabase only. Nothing was pushed to Strata; no `supabase db push`, no
`supabase functions deploy`.

---

## 1. What shipped

### Migrations (three, minted after this worktree's head `00591`)

| File | Carries |
|---|---|
| `supabase/migrations/00592_people_cards_affiliations_rules.sql` | `studio_contact_org()` + `project_party_designer()` helpers · `studio_contacts` person columns (`is_sole_proprietor`, `studio_verdict`, `studio_verdict_at`) and company columns (`legal_name`, `dba_name`, `company_kind` + CHECK, `trades`, `w9_on_file_at`, `tax_id_last4`, `remit_to`, `retainage_bps`, `warranty_until`, `paperwork_contact_person_id`, `signer_person_id`, `site_contact_person_id`) · new table `studio_person_affiliations` (+ `assert_affiliation_card_kinds()` and `studio_person_affiliations_distinct_cards_check`) · new table `studio_contact_rules` (+ `studio_contact_rules_channels_allowed_check` and `studio_contact_rules_channels_forbidden_check`, both `<@` an **EIGHT**-name vocabulary — the seven channel kinds plus the rule-only `sms` token, so "phone yes, text no" is writable on one line — r6 M6-5 widened by r4 R4-M2; `sms` is deliberately NOT a `studio_contact_channels.channel_kind`) · **`assert_studio_contact_designations()`** BEFORE INSERT/UPDATE on `studio_contacts` — `paperwork_contact_person_id` / `signer_person_id` / `site_contact_person_id` must each name a PERSON card in the SAME organization and never the row itself (r5 R-AP) · **`assert_studio_contact_rule_route()`** BEFORE INSERT/UPDATE on `studio_contact_rules` — the same test for `route_to_person_id` (r6 M6-4), and since r8 F1 it inspects EVERY rule, routed or not: `subject_type` person/company must equal the named card's own `entity_kind` (`rule_subject_kind_mismatch`) and `subject_type` engagement must name a `project_parties` row (`rule_subject_not_found`) |
| `supabase/migrations/00593_studio_contact_channels.sql` | New table `studio_contact_channels` · **`normalize_channel_value(kind, value)`** — the one channel-key rule, shared with 00594's consent RPCs · **`channel_value_was_on_sms_rail(value)`** — the `sms_capable` evidence test (an `sms_conversations` thread, or an asked FIELD-kind seat) · `normalize_studio_contact_channel()` trigger (defers to the normaliser) · `assert_channel_owner_kind()` trigger — `owner_type` must equal the card's own `entity_kind` · four-part backfill from `studio_contacts.phone/email` and from `project_parties.phone/email` where `studio_contact_id` is set, carrying the `sms_capable` evidence rule below · **`assert_studio_contact_identity_stable()`** BEFORE UPDATE OF `entity_kind`, `organization_id` on `studio_contacts` (r8 R-AR) — the change is refused with `studio_contact_identity_held` while any channel, designation, rule route or affiliation still points at the card, with a HINT naming what holds it; a restatement of the same values still writes, and after 00593's backfill essentially every card with a phone or an email is held |
| `supabase/migrations/00594_studio_channel_consent.sql` | New table `studio_channel_consent` (PK `(organization_id, channel_kind, channel_value)`, carrying `refusal_unanswered` — the stored "a refusal stands that has not been answered" — and **THE REFUSAL'S OWN EVIDENCE SET**, `opt_out_source` / `opt_out_evidence` / `opt_out_recorded_at` / `opt_out_recorded_by`, with `studio_channel_consent_opt_out_source_check` over the same five-name source vocabulary as the consent side (r8 W4-M2); those four are written by the fold, by `record_channel_consent`'s `opted_out` branch and by the inbound STOP rail, and by nothing else — `record_channel_reconsent` never touches them) · `backfill_channel_consent_from_parties()` + its one call (its `refusal` CTE takes the refusal's words only off a row whose evidence could BE the refusal's — r4 R4-M1, widened r10 M1 — and its `grant_evidence` CTE gives the record the group's best evidenced grant, five columns and the date together, where the winning row carries none, r9 M2) · `mirror_channel_consent_to_parties()` trigger · RPC `record_channel_consent(...)` · RPC `record_channel_consent`'s **email asymmetry** (r6 R6-M3): on `channel_kind = 'email'` — and only there — a fully evidenced `granted` passes the `opted_out` gate AND lowers `refusal_unanswered`, because email has no inbound START to answer with · RPC `record_channel_reconsent(...)` (PR-m's named way back; it dates the consent it records — `consented_at = now` beside the five evidence columns, r9 M1) · **REDEFINES two existing trigger functions**: `fc_dispatch_optin_invite` (lineage `00432:27-68`) and `_site_request_consent_granted_dispatch` (lineage `00374:3399-3444`) · `COMMENT ON TABLE public.project_parties` restating the mirror invariant (lineage `00212:46`) |

**Two functions are redefined, both grafted from their grep-winner bodies
verbatim** (`grep -rln "CREATE OR REPLACE FUNCTION[^(]*<name>" supabase/migrations/*.sql | sort | tail -1`):

| Redefined in 00594 | Grep-winner (lineage) | Delta |
|---|---|---|
| `public.fc_dispatch_optin_invite()` | `00432_twilio_activation_hardening.sql:27-68`; trigger `fc_optin_invite_dispatch` created `00284:254-257` | one guard, first statement — `patina.suppress_consent_dispatch` |
| `public._site_request_consent_granted_dispatch()` | `00374_field_site_request_loop.sql:3399-3444`; trigger `site_request_consent_granted_dispatch` created `00374:3446-3455` (untouched) | the same one guard, first statement |

Both are the two outward-facing AFTER-row triggers on `project_parties`; a
mirror write must fire neither. The `COMMENT ON TABLE public.project_parties`
in 00594 restates 00212:46's text and appends that invariant, so a third such
trigger cannot land unguarded.

Every other object in all three files is new or an `ADD COLUMN IF NOT EXISTS`;
`grep` for each new name across `supabase/migrations/*.sql` returned nothing
before I wrote them (`normalize_channel_value`, `record_channel_reconsent`,
`studio_contact_org`, `project_party_designer`,
`normalize_studio_contact_channel`, `backfill_channel_consent_from_parties`,
`mirror_channel_consent_to_parties`, `record_channel_consent`,
`channel_value_was_on_sms_rail`, `assert_studio_contact_designations`,
`assert_studio_contact_rule_route`, `assert_studio_contact_identity_stable`).

`python3 scripts/generate-legacy-grants.py` was re-run after the grants:
`supabase/seed/00-legacy-grants.sql` gained **216 lines** over this wave's base
commit `700261663`, and the generator's own line reads **"baseline + 2633
replayed statements"** (it was 210 / 2632 when this paragraph was last written,
and 186 / 2628 before the r5 and r6 rounds added their guards). Re-run at the
tip it regenerates with an empty diff:

```
$ git diff --stat 700261663 -- supabase/seed/00-legacy-grants.sql
 supabase/seed/00-legacy-grants.sql | 216 +++++++++++++++++++++++++++++++++++++
$ python3 scripts/generate-legacy-grants.py
wrote …/supabase/seed/00-legacy-grants.sql — baseline + 2633 replayed statements
$ git diff --stat -- supabase/seed/00-legacy-grants.sql
(empty)
```

### Edge functions

- `supabase/functions/_shared/sms.ts` — new `channelConsentVerdict()`
  (`"refuse" | "allow" | "unknown"`), called in `sendPartySms()` **before** the
  existing gate, plus `resolveProjectOrg()` / `orgsOfProjects()`, which resolve
  a project's studio to the same answer the SQL side does
  (`COALESCE(studio_id, <the designer's primary studio>)`) — over
  `organization_members`/`organizations`, never through the revoked
  `_primary_studio_for` RPC, and a failed resolve refuses rather than reading as
  "no studio" (r5 R-AM). It reads
  `studio_channel_consent` for `(org, 'sms', phone)`; refuses on `opted_out`;
  **refuses on a stale record** — any party row on this number belonging to the
  SAME studio that says `opted_out` outranks a `granted` record; allows on
  `granted` (the F-11 case: a seat created today for a number the studio
  recorded a grant for in 2025); and when no record exists for that studio falls
  back to "a party row on this number **in that same studio** is opted out →
  refuse". Both scans are studio-scoped on purpose: phone-globally they would
  re-open G-3, since an inbound STOP opts out every party row on the number in
  every studio, and a studio's first-ever outreach to a number it has never
  contacted would be silently blocked by a STOP it never received (R-AK). The
  fallback stays phone-global in exactly one place — when NO studio resolves for
  the send at all, where there is nothing to scope to and an unattributable send
  must not outrun a STOP. Underneath, the legacy `reduceConsent()` reduction
  stays as the fail-closed second check (PR-x); on the `partyId` path it reads
  that one party row, and on the phone-only path it reduces across the rows the
  caller could not attribute. `flushDeferredMessages()` runs the SAME two gates
  in the same order, keyed off the deferred row's own `party_id` (R-AH) — a
  second send path with a second consent gate is two answers to one question —
  and its second gate is narrowed to that party's own row, not reduced across
  every row on the number (r3r2 BLOCKING; decision 14).
- `supabase/functions/sms-inbound/pipeline.ts` — `loadPhoneParties()`,
  `studiosHoldingPhone()` (now over the shared `orgsOfProjects()`),
  `studiosHoldingRecord()`, `withRecordOnlyStudios()`, `writeChannelConsent()`,
  `grantPartiesForStudios()`. STOP/UNSUBSCRIBE/… upserts `opted_out` for every
  studio holding the number **by seat or by record** — a studio that holds a
  consent record but no party row (a removed seat today, a card-level consent
  once W2 lands) was invisible to the seat-only derivation, so its record sat at
  `granted` for ever while the number had said STOP. START/UNSTOP is a
  RE-subscription, so it upserts `granted` only for the studios whose own record
  for that number is currently `opted_out` (the refusal it lifts) or `pending`
  (the invite it answers). A studio at `not_asked`, or with no record at all, is
  left untouched **even when it holds a seat on the number** — holding a seat is
  not having asked (R-AJ). In practice nothing is lost: a STOP writes an
  `opted_out` record for every studio holding the number, so the studios a START
  can be answering always have one. A `YES` that confirms a
  pending invite upserts `granted` **only** for the studios that actually hold a
  pending row — no record-only union there. `origin_project_id` follows the
  CURRENT verdict in both writers (`t.projectId ?? prior`), matching
  `record_channel_consent`'s `COALESCE(EXCLUDED..., scc....)`. The existing
  `project_parties` writes are kept, and on the two GRANT branches they now run
  **before** the consent-record write, not after, and cover EVERY seat the
  target studios hold on the number rather than only the `pending` ones (r4
  M-2): `grantPartiesForStudios()` precedes `writeChannelConsent()` on START and
  on YES. Writing the record first consumed the seat's
  `pending → granted` transition through 00594's mirror, so 00374's
  `site_request_consent_granted_dispatch` never fired and every site request
  parked in `awaiting_consent` on that seat stayed parked for ever (r2r2 B-1).
  The order is load-bearing and must not be swapped back; `pipeline.ts:339-350`
  says so at the call site, and SQL block 13 asserts the released request. STOP
  keeps the opposite order (the record first, then the phone-global party
  write), since a refusal has no transition to consume.
  Three further rail rules landed in r7's second cycle and r10. **The STOP no
  longer restates the GRANT** (r7 R7-M1): `source` / `evidence` / `recorded_at`
  are carried through from the standing record on a refusal and written fresh
  only when this act MINTS the record, matching `record_channel_consent`'s
  UPDATE and INSERT legs one for one. **A failed read is a refusal, never an
  "unknown"** (r7 R7-M2): `channelConsentVerdict()`'s last phone-global scan now
  destructures `error` like its four siblings and refuses on it; before, a
  denied read read as "nobody here opted out" and lifted the primary gate.
  **And a STOP the rail could not fully record is not acknowledged** (r7 R7-M3):
  `loadPhoneParties()` and `studiosHoldingRecord()` check and log their reads,
  `writeChannelConsent()` reports `failed`, and if any of the three failed the
  branch answers Twilio **500** after clearing the inbound row's `twilio_sid` —
  releasing the idempotency claim so the retry actually re-runs, while the
  inbound STOP row itself (a 10DLC artifact) survives. That is a live
  Twilio-webhook behaviour change: this path used to answer 200 regardless.
  **And `optOutAllForPhone()` writes the refusal's own evidence set alongside
  the status** (r10 M1) — `sms_consent_source = 'inbound_sms'`, the keyword as
  it arrived, `recorded_at = now`, `recorded_by = NULL` — the same set the
  record gets and the same set 00594's mirror writes onto these seats for this
  verdict. Leaving the four alone left the commonest real refusal on the books —
  a seat with a recorded grant that then texted STOP — saying it was refused IN
  WRITING, per the studio's own form, months before the STOP, by the member who
  recorded the GRANT. `sms_consent_disclosure_version` is not touched: which
  disclosure the person was shown is a fact about the grant.
- `supabase/functions/_tests/fake-supabase.ts` — `upsert({onConflict})` now
  accepts a composite key (`"a,b,c"`). It previously treated the whole string as
  one column name, so a composite upsert matched the first row in the table.

---

## 2. Decisions taken (and why)

1. **The contact rule has exactly one home.** `studio_contacts` did **not** gain
   `never_text` / `do_not_contact` / `do_not_contact_reason` / `route_to_person_id`,
   as `direction.md` §7 listed. Per the orchestrator ruling the rule lives only
   in `studio_contact_rules`. Two homes for the same forbidding fact is how one
   of two readers misses it.
2. **`contact_kind` left alone.** Still free TEXT, no CHECK (`00417:82-87`).
   `company_kind` is the new, narrow vocabulary and takes a **CHECK, not an
   enum** — an enum `ADD VALUE` cannot be used in the transaction that adds it,
   and PD-4 keeps kind vocabularies code-resident.
3. **Card-owned RLS through a SECURITY DEFINER resolver.** Affiliations,
   channels and card-scoped rules gate on
   `is_active_studio_member(studio_contact_org(<card>))`. Resolving the org
   through a plain subquery on `studio_contacts` would make one table's RLS
   depend on another's, and a card the caller cannot see would read as "no org"
   rather than "not yours". `studio_contact_rules`' engagement leg gates on
   `is_studio_comember(project_party_designer(subject_id))`, matching
   `project_parties`' own posture (`00584:884-921`).
4. **Affiliations cannot straddle studios.** The INSERT/UPDATE `WITH CHECK` also
   requires `studio_contact_org(person_id) = studio_contact_org(company_id)`.
5. **`studio_channel_consent` grants `authenticated` SELECT and nothing else.**
   There is no INSERT/UPDATE/DELETE policy at all. `record_channel_consent()` is
   therefore the only door for the portal, by privilege — not by convention.
   Probed below.
6. **The backfill is a function, not a bare statement.**
   `backfill_channel_consent_from_parties()` is `SECURITY DEFINER`, revoked from
   `PUBLIC, anon, authenticated`, granted to `service_role`, and idempotent
   (`ON CONFLICT DO NOTHING` — re-running never overwrites a later decision). It
   is a function so the precedence rule the whole room now rests on can be
   tested directly rather than inferred from whatever happened to be in the
   database when the migration ran.
7. **Order inside 00594 is load-bearing.** The mirror trigger is created
   *after* the backfill runs. Created first, the backfill would push a studio's
   verdict down onto sibling party rows, and a row moving to evidenced-`pending`
   fires 00432's `fc_dispatch_optin_invite` — a real opt-in SMS, out of a
   migration. Noted in the file's banner.
8. **The mirror is guarded on the whole cached tuple**
   (status AND consented_at/opt_out_at/source/evidence/recorded_at/
   disclosure_version/recorded_by `IS DISTINCT FROM` the record's), so a
   re-record leaves already-identical rows alone but DOES refresh the evidence.
   Guarding on the status alone suppressed every evidence update too, which let
   a party row sit at `granted` with a NULL source, recorded_at and evidence —
   the 10DLC evidence for the send. Re-firing is held off by
   `patina.suppress_consent_dispatch`, not by the narrow status test.
9. **`record_channel_consent` keeps dates it did not restate.** A later grant
   does not erase `opt_out_at`, and vice versa — the room has to be able to
   print "granted 2 May 2025, opted out 3 Dec 2025" (R-Q).
10. **The org for a project is `projects.studio_id`,** with the designer's
    primary studio as the fallback (00317 both backfilled the column and
    trigger-maintains it) — **on both sides**. `sms.ts`' `resolveProjectOrg()` /
    `orgsOfProjects()` and `pipeline.ts`' `studiosHoldingPhone()` resolve the
    same fallback the migration does, so the gate and the table cannot disagree
    about which studio a NULL-`studio_id` project belongs to (r1 M7). **The SQL
    side calls `_primary_studio_for()`; the edge rail never does** (r5 M5-1,
    R-AM): that function is revoked from every PostgREST role (00483 —
    `proacl {postgres=X/postgres}`), so an RPC call answers the rail with 42501
    and a caller reading only `data` takes the error for "no studio". The rail
    reads `organization_members` joined to `organizations` instead, ranked the
    way 00315 ranks them (owner first, then earliest `joined_at`), and a FAILED
    resolve is a logged refusal, never a silent NULL.
11. **An unparseable phone keeps its raw text** in `studio_contact_channels.value`
    (the column is NOT NULL, so it cannot take the normaliser's NULL). The
    number the studio typed is never lost; it simply gets no E.164. The consent
    record keys on the SAME value, because both callers go through one function,
    `normalize_channel_value()` (00593) — stated twice, the rule drifted: the
    RPC refused what the trigger kept, leaving channel rows no consent record
    could be written for.
12. **The write door is a transition gate, not a value check.**
    `record_channel_consent()` requires source + evidence + disclosure_version
    for `pending`/`granted` and source + evidence for `opted_out` (PR-m), and
    refuses every transition OUT of `opted_out` — including to `not_asked`,
    which would erase the only stored record of the refusal. **On `sms`.** On
    `channel_kind = 'email'` a fully evidenced `granted` passes this gate and
    lowers `refusal_unanswered`, because email has no inbound START to answer a
    refusal with; that is decision 27 below and it is a ruling-level amendment
    to how PR-m reads on the two channels. **`not_asked` is
    refused outright as a target status** (`consent_not_recordable`, R-AG):
    there is nothing to record — it is the absence of a consent, not a verdict —
    and taking it was the one evidence-free door into the table, where four
    arguments erased a recorded grant, its source, its words and its disclosure
    version, from the record and, through the mirror, from every seat in the
    studio on that number. **No write may empty the evidence set**: source,
    evidence, disclosure_version and recorded_by keep what stands when the new
    verdict does not restate them. Laundering is closed by the evidence gate
    rather than by nulling — every status the door still accepts must supply its
    own source and evidence, so a status change has already restated them by the
    time it reaches the write. PR-m's way back
    ("always a fresh recorded consent or an inbound START") is a separate named
    door, `record_channel_reconsent()`, which is EVIDENCE-ONLY: it records the
    studio's fresh consent and leaves the record at `opted_out` with the
    refusal standing (r7 M7-2) — `granted` stays
    the recipient's to give by replying YES or START, and that is now enforced
    ACROSS the pair, not only at each door: this door refuses EVERY verdict but
    `opted_out` while the refusal reconsent superseded is still unanswered
    (`consent_awaiting_recipient`; decision 18 below — r6 B6-1 widened that gate
    off the verdict being written, because `pending` mirrors onto the seats
    exactly as `granted` does and was the ungated first hop). Read those two
    sentences together — a studio member holds both doors, so a guarantee that
    holds only per-door is not a guarantee at all. The optional half of the
    review's suggestion — capping the sms RPC at `pending` outright — was NOT
    taken: it would retire the `allow` branch M5 exists for and fixture F-11
    needs (a studio holding auditable prior express written consent).

13. **The no-record fallback reduces across the studio's own projects, never
    across tenants** (R-AK). `channelConsentVerdict()`'s fail-closed second
    check — the one PR-x keeps until the backfill is proven everywhere — now
    scans the resolving studio's own party rows, and `flushDeferredMessages()`'s
    own second check reads the deferred row's own party (decision 14). Phone-globally it blocked a
    studio's first-ever outreach to a number it had never contacted, because
    some unrelated studio once received a STOP from it, with no
    operator-visible reason and no expiry. The one surviving phone-global read
    is the case where no studio resolves at all.

14. **One consent gate, both send paths — BOTH halves of it** (R-AH).
    `flushDeferredMessages()` reads `channelConsentVerdict()` keyed off the
    deferred row's `party_id` before the legacy check, exactly as
    `sendPartySms()` does. Before this a studio's `granted` record died at quiet
    hours (the flush refused the send as `not_consented`) and a studio's
    `opted_out` record could be overruled on the flush by another studio's
    granted party row. The **second**, fail-closed check is now narrowed the
    same way `sendPartySms()` narrows it: when the deferred row names a party,
    the flush reads THAT party's own `sms_consent_status` rather than reducing
    across every row sharing the phone number, which is what
    `resolveRecipient()`'s `partyId` branch has always done. Unnarrowed it
    re-opened G-3 inside the quiet-hours path in both directions (r3r2
    BLOCKING): an unrelated studio's `opted_out` row suppressed the owning
    studio's own granted send, and — worse — an unrelated studio's `granted`
    row carried a real outbound SMS for a studio that had never obtained
    consent at all. `flushDeferredMessages` is called on the field-daily cron
    (`field-daily/core.ts:143`), so that was a live scheduled send path. The
    phone-global reduction survives only where the deferred row names no party
    — the same case `channelConsentVerdict()` keeps it for. Three tests in
    `_shared/sms.test.ts` cover both directions and the no-party case.

15. **`studio_person_affiliations` is the home of person-at-firm;
    `studio_contacts.company_id` is a derived pointer** (R-AI). 00592 backfills
    an open affiliation (`to_date` NULL) for every person already linked
    through `company_id`, and the two are bound **in both directions**:
    `sync_studio_contact_company_pointer()` re-derives `company_id` from the
    open affiliation, and `sync_person_affiliation_from_pointer()` opens (or
    closes) that affiliation when `company_id` is written directly. Without the
    backfill the company card's crew list (R-W) would have rendered empty for
    exactly the firms a studio has been using longest. Bound one way only — as
    this wave first shipped it — the hooks that still write `company_id`
    (`use-studio-contacts.ts:202, :234`) produced a card with a firm and **no
    affiliation row**, invisible to that same crew list, and the firm the
    designer chose was silently discarded by the next affiliation write (r2
    review M-3). The reverse trigger stands down for a cross-studio pointer
    (which the affiliation RLS refuses anyway) and holds
    `patina.suppress_affiliation_sync` while it writes, so the two halves
    cannot ping-pong. The COMMENT on both says which is the fact and which the
    pointer.

16. **A START is a re-subscription, not a first grant** (R-AJ). The inbound
    grant is scoped to studios whose record is `opted_out` or `pending`; a seat
    on the number is not an invitation.

17. **The card backfill does not invent SMS capability** (r2r2 M-2, sharpened
    by r4 M-1). A rolodex card holds ONE untyped number and nothing on it says
    which kind of line it is, so 00593's leg (a) leaves `sms_capable` at its
    `false` default unless there is EVIDENCE THAT THE NUMBER WAS ON AN SMS
    RAIL, which is what `public.channel_value_was_on_sms_rail(value)` answers:
    an `sms_conversations` thread on the normalised number (00282 — a thread
    exists only because a message moved), or a FIELD-kind `project_parties`
    seat on it (`gc | sub | installer | receiver`, `pipeline.ts`'s
    `FIELD_KINDS`) whose `sms_consent_status` has left `not_asked`. The test is
    phone-global on purpose: being an SMS line is a fact about the line, not
    about a studio's consent (that is `studio_channel_consent`'s job).
    "A party row exists on this card with this number" is NOT that evidence —
    `party_kind` also covers architect, photographer, stager, client,
    client_rep, vendor and other, so F-10 Sam Rowe ("never texted") and F-27 Ray
    Thao ("NEVER texted; scheduled through 311") came out of the fold marked
    SMS-capable, the exact assertion `sms_capable` exists to deny. Where there
    is no evidence the row is still written (the studio must see the number) but
    it is labelled `— line type unconfirmed`, so W1b's Reach editor can show
    which lines it is asking the studio to type. A blanket `true` would have
    asserted "an office line may be offered an SMS invite" (crm-model §2 CS4-7,
    direction §5.1) — and person cards carrying an office, showroom, dispatch or
    311-only number are ordinary in the fixture (F-13, F-14, F-17, F-20, F-27).
    The backfill runs once; a wrong `true` is a card the studio then has to
    correct by hand. **Leg (c) applies the same test** rather than the literal
    `true` it used to write, and labels an unevidenced roster number the same
    way, so the two legs agree by construction rather than racing the
    `ON CONFLICT`. SQL block 15 (15a–15g).

18. **The two consent doors compose, and neither walks a STOP back on its own**
    (r3r2 M-1). `record_channel_consent()` refuses every transition out of
    `opted_out`, and `record_channel_reconsent()` used to land on `pending`
    (since r7 M7-2 it does not move the status at all). Stated
    that way each door held, but the PAIR did not: reconsent moved the row off
    `opted_out`, and the next recorded grant found a row the first gate no
    longer refused — two calls, any studio member, and a recorded STOP was back
    at `granted`, with the mirror clearing the party-row backstop `sendPartySms`
    falls back on. So the write door now ALSO refuses every verdict but
    `opted_out` while an **unanswered** refusal stands (r6 B6-1: the gate asks
    whether a REFUSAL STANDS, never which verdict the caller is writing — a
    recorded `pending` erased the refusal and its date from every seat and left
    the `granted` behind it passing every leg, unrecoverable by reconsent()) — and (r4 B-1) that is read off a STORED
    FACT, `studio_channel_consent.refusal_unanswered`, not inferred from
    `opt_out_at`. A refusal is routinely DATELESS: the shipped portal writes
    `opted_out` party rows with a NULL `sms_opt_out_at` on purpose
    (`use-coordination.ts:604-617` — "opted out, date unknown" is the truth),
    every pre-00432 row carries no date either, and the fold mints that whole
    population verbatim, so the date test failed OPEN for exactly the records
    the first prod push creates. The flag is raised by every writer that records
    a refusal (the fold, `record_channel_consent`, `record_channel_reconsent`,
    the inbound STOP rail) and lowered, ON SMS, by ONE writer: the inbound
    rail's own `service_role` write on a YES/START. **No RPC in 00594 lowers it
    on SMS** — on EMAIL exactly one does, and deliberately (decision 27, r6
    R6-M3): there is no inbound START on an email address, so the studio's own
    fresh recorded consent is the whole of PR-m's way back there. On SMS (r7
    M7-1): the upsert used to exempt a record already AT `granted` from the
    gate — so its evidence could be restated — and then set the flag `false` on
    that very write, which after r6's M6-3 fix is the fact the SEND rail rests
    on. One ordinary granted-on-granted call by any studio member turned
    sending back on with no recipient involved, and
    `backfill_channel_consent_from_parties()` mints exactly that row on the
    first prod fold (a legacy seat reading `granted` with a stale
    `sms_opt_out_at` no later consent answered). The fold's behaviour is ruled
    correct — the refusal is the half that fails closed, whatever the status
    says — and the escape is gone. The date test
    is KEPT alongside it, so a `service_role` writer that dates a refusal
    without raising the flag still fails closed
    (`consent_awaiting_recipient`). What answers a refusal is the
    recipient's own YES/START, which the inbound rail writes directly — lowering
    the flag and stamping a fresh `consented_at`; after that this door opens
    again. A record already at `granted` is NOT exempt (r7 M7-1), and such a
    folded row is not stranded: recording the refusal is always open — the way
    forward — and from there `record_channel_reconsent()` puts the studio's
    fresh consent on the record. That door is evidence-only and re-callable
    (r7 M7-2): it used to land on `pending` "so the double opt-in still runs",
    but after M6-3 the flag refuses EVERY send including the opt-in invite, so
    the hop sent nothing, mirrored `pending` over the party-row refusal the
    send rail falls back on, and left the record off the one status the door
    needs — the studio was strictly worse off for calling it. PR-m's "a fresh
    recorded consent **or** an inbound START" now reads: the fresh recorded
    consent is what the studio may WRITE; the inbound START is what reopens
    SENDING. SQL
    blocks 16 and 16B (the dateless refusal), 26 (r7 M7-1) and 27 (r7 M7-2).

19. **Both sides of an affiliation must be the card they claim to be**
    (r3r2 M-2). `person_id` and `company_id` are both FKs into
    `studio_contacts`, which holds BOTH kinds of card, so the FKs permitted a
    firm as the person and a person as the firm — and since
    `_sync_person_company_pointer()` copies `company_id` onto
    `studio_contacts.company_id`, an affiliation with the same card on both
    sides produced a person card that is its own firm, which 00417's
    `studio_contacts_company_link_check` does not catch. A CHECK cannot reach
    another table, so `assert_affiliation_card_kinds()` is a BEFORE trigger
    (`affiliation_person_not_a_person` / `affiliation_company_not_a_company`),
    with `CHECK (person_id <> company_id)` behind it. `studio_contact_channels`
    had the same hole and gets the same shape of guard,
    `assert_channel_owner_kind()`. Two consequences: 00592's fold now also
    requires `c.entity_kind = 'company'`, leaving a pre-existing malformed
    legacy pointer for a human exactly as it leaves a cross-studio one; and
    `sync_person_affiliation_from_pointer()` stands down for such a pointer
    rather than raising out of the guard and taking the `studio_contacts` write
    with it. SQL block 17.

20. **The mirror's suppression is about SENDING, not about work** (r4 M-2).
    Standing both outward AFTER triggers down for a mirror write also stranded
    the DURABLE half: 00374's `_site_request_consent_granted_dispatch` is the
    only caller of `site_request_dispatch_after_consent()`, and the lifecycle
    sweep only promotes requests that already hold an outbox row. So a seat the
    mirror moved to `granted` — every seat of a studio-recorded grant, and every
    sibling seat an inbound YES covered beyond the ones it transitioned itself —
    read `granted` for ever while its site request sat in `awaiting_consent` for
    ever with `consent_status_snapshot` still saying `not_asked`. Two changes:
    (a) `mirror_channel_consent_to_parties()` captures the seats it is about to
    move onto `granted` and calls `site_request_dispatch_after_consent()` for
    their parked requests — **that function only, never
    `invoke_edge_function`**, so the snapshot and the `consent-granted` outbox
    row land in the same transaction while the eager wake-up, the one outward
    act, stays with the party-row trigger and the lifecycle sweep carries the
    row out; and (b) the inbound YES branch now writes party rows for EVERY seat
    the target studios hold on the number, not only the seats already at
    `pending` (`grantPartiesForStudios` lost its `onlyPending` argument; START
    already passed `false`). Which STUDIOS are targeted is still the narrow
    question — only the ones that actually asked (R-AJ) — and the record's
    `origin_project_id` still names the job the invite went out on. The two are
    idempotent against each other: on the inbound path the party write moves the
    seats first, so the mirror's capture comes back empty. SQL blocks 8
    (8b/8c/8c2/8c3) and 13 (13c/13c2/13c3/13d), plus
    `_tests/sms-inbound.test.ts`'s "YES grants every seat of the inviting
    studio, not only the pending one".

21. **The fold asks the refusal of EVERY seat in the group, and the refusal
    keeps its own words** (r8 W4-M1 / W4-M2). Two halves of one fact — a
    refusal is not the same fact as a verdict.
    (a) `backfill_channel_consent_from_parties()` gained a **`refusal` CTE**
    alongside `ranked`. `ROW_NUMBER()` drops every sibling seat before any
    predicate can see it, so a studio holding two seats on one number — a clean
    recent grant and a legacy row reading `granted` while carrying a stale
    opt-out no later consent answered — folded to a fully SENDABLE record: inside
    `granted` the tiebreak is the most recent date, so the clean grant won and
    the refusal went in the bin with the row that carried it. Nothing downstream
    caught it, because the send gate's second check and 00594's own seat gate
    both filter on `sms_consent_status = 'opted_out'` and the contaminated seat
    reads `granted`. `refusal` is computed over `party_org` (every seat), and
    the INSERT's `refusal_unanswered` is now `(f.org IS NOT NULL)` off a LEFT
    JOIN to it. A refusal counts when the seat says `opted_out` OR when it
    carries an `sms_opt_out_at` no later `sms_consented_at` answered. It only
    bites on the first prod fold, over real `project_parties` data — which is
    why the pre-push dry run in §5 must include this CTE.
    (b) `studio_channel_consent` gained **the refusal's own evidence set** —
    `opt_out_source` / `opt_out_evidence` / `opt_out_recorded_at` /
    `opt_out_recorded_by`. With one shared set, `record_channel_reconsent()`
    wrote the studio's `written` / "Signed a fresh consent…" straight over
    `inbound_sms` / "Replied STOP" while leaving `status = 'opted_out'`: the
    record still refused every send, but it could no longer say what the refusal
    was or that it arrived BY TEXT, which is the noun R-Q's sentence prints and
    the artifact a 10DLC audit asks for. The fold carries the refusing sibling's
    source and words into that set (the winning row is the grant, so its words
    are not the refusal's); `record_channel_consent`'s `opted_out` branch and
    the inbound STOP rail write it; **`record_channel_reconsent` never touches
    it** and the migration says so at the line. **The refusal's DATE comes off
    that same sibling** (r6 R6-M2): `opt_out_at` is
    `COALESCE(r.sms_opt_out_at, f.sms_opt_out_at)`, the winning row's date or,
    where the winner has none, the refusing sibling's. Taking it from the winner
    alone minted the record saying "it arrived by text, it said Replied STOP, it
    was written down on 2025-11-16" with the column that carries WHEN THEY
    REFUSED empty — R-Q's sentence lost its date for exactly this population,
    and the date test the write gate keeps alongside `refusal_unanswered` had
    nothing to read on any record the fold mints. SQL blocks 3 (3c4/3c5/3c6), 4
    (4d/4d2/4d3) and 27 (27b3/27b4/27d2/27g).

22. **A mirrored refusal carries the refusal's own words onto the seat, too**
    (r9 R5-M1). Decision 21(b) put a second evidence set on the RECORD;
    `project_parties` has no such second set, and the mirror was still copying
    the record's CONSENT columns onto the seat. So a seat that read
    (`opted_out`, `inbound_sms`, "Replied STOP") read (`opted_out`, `written`,
    "Signed a fresh consent…") the moment a studio put its own paperwork on the
    record through `record_channel_reconsent()` — and the seat is what every
    shipped surface reads, since W1a ships no hook for the new table. R-Q's
    sentence, read off the seat, became "Opted out in writing", naming the
    studio's own consent as the refusal, and the 10DLC artifact of how the STOP
    arrived was gone from the only copy those surfaces see.
    `mirror_channel_consent_to_parties()` now decides the seat's evidence from
    the verdict it is mirroring: when `NEW.status = 'opted_out'` the seat's
    `sms_consent_source` / `sms_consent_evidence` / `sms_consent_recorded_at` /
    `sms_consent_recorded_by` come from `NEW.opt_out_*` and from nothing else,
    falling back only to what the seat already holds — never a NULL over a
    non-null (R-AN). The record's CONSENT set is **not** a fallback here (r6
    R6-M1): it was, justified as covering "legacy rows minted before `opt_out_*`
    existed", a population 00594 makes impossible because it creates the table
    with all four columns. What that fallback really hit is the refusal with no
    source of its own — what the shipped portal writes on purpose
    (`use-coordination.ts` writes `opted_out` beside the not-asked columns),
    what every pre-00432 row carries, and what the fold mints verbatim — where
    `NEW.source` is the studio's own fresh consent from
    `record_channel_reconsent()`. The seat went from saying nothing about the
    refusal (honest) to reading (`opted_out`, `written`, "Signed a fresh consent
    form…", recorded today). Every writer that mints a refusal WITH words fills
    `opt_out_*`, so a NULL there means there were never any refusal words. The four
    precomputed values go into the tuple guard as well, or the write is
    suppressed as identical to what the seat already carries.
    `sms_consent_disclosure_version` has no refusal-side twin — it belongs to
    the disclosure the person was shown, not to how they refused — so it keeps
    coming from the record. The swap is scoped to refusals: a `granted` verdict
    mirrors the consent set as before. SQL blocks 4 (4d) and 27
    (27c2/27c3/27d3/27h/27i–27i5).

23. **A refusal with no words of its own leaves the SEAT with none either**
    (r8 R8-M1, ruling R-AQ). Decision 22's "never a NULL over a non-null"
    (R-AN) is right about a verdict that simply did not restate its evidence,
    and wrong about a refusal that HAS no evidence. `project_parties` holds one
    evidence set per seat, and a sibling seat in the same studio on the same
    number routinely holds the GRANT's — the studio's paperwork, dated the day
    of the grant. So on the sourceless refusal the portal and the fold really
    write, every COALESCE kept what the sibling held, and that seat sat at
    `opted_out` asserting the studio's own consent document AS the refusal:
    R-Q's sentence off the seat read "Opted out in writing, 2 Jan 2026". The
    mirror now decides the four evidence columns with a CASE, not a COALESCE:
    when `NEW.status = 'opted_out'` and `NEW.opt_out_source IS NULL`, all four
    are written NULL on every seat in the studio on that number — absent is
    what the seat must say, and it is what the shipped portal writes for the
    same verdict. Every other transition keeps R-AN's refresh-never-erase rule,
    including a refusal that does carry its own words.
    `sms_consent_disclosure_version` is not in the set: it belongs to the
    disclosure the person was shown, not to how they refused. SQL block 27
    (27i–27i5, sibling seat included).

24. **A card something points at cannot change what it is, or whose it is**
    (r8 R8-M2, ruling R-AR). The three card guards this wave adds all fire on
    the REFERENCING row, so one ordinary `UPDATE studio_contacts SET
    entity_kind = …` undid all three at once — a company card left carrying
    `owner_type = 'person'` channels, a designation naming a firm or a card in
    another studio, a rule routing across tenants — and `entity_kind` is a
    column the shipped data layer already writes on update
    (`use-studio-contacts.ts`). 00593 adds
    `assert_studio_contact_identity_stable()` as one BEFORE UPDATE OF
    `entity_kind`, `organization_id` trigger on `studio_contacts`, in the shape
    of the other three: it refuses with `studio_contact_identity_held` while
    any channel, designation, rule route or affiliation still points at the
    card, and its HINT names what holds it. A restatement of the same values is
    not a change and still writes (the shipped edit sheet sends a diff-only
    patch that never includes `entity_kind`); detaching the dependents opens
    the door again. SQL block 29 (29a–29f).

25. **The fold picks the refusing sibling by the refusal's own facts, not by
    row age** (r2 R2-M1). Both pickers in
    `backfill_channel_consent_from_parties()` fell back to
    `COALESCE(sms_opt_out_at, …, updated_at) DESC`, which ranks the refusing
    seats by most recently TOUCHED. The shipped portal writes `opted_out` party
    rows with a NULL date, a NULL source and no words on purpose
    (`use-coordination.ts`), and such a row is touched whenever anything on the
    roster changes — so its `updated_at` routinely outranks the 2025
    `sms_opt_out_at` of the seat that actually received the STOP. Everything
    the record then knows about the refusal comes off a row that knows nothing:
    `opt_out_at` NULL and all four `opt_out_*` NULL, permanently, because
    `ON CONFLICT DO NOTHING` means no later fold repairs it and
    `record_channel_reconsent()` never touches `opt_out_*` by design. R-Q's
    "Opted out by text, 3 Dec 2025" becomes unprintable and the carrier-audit
    artifact is gone. And because `opt_out_source` is NULL, decision 23's
    wordless-refusal branch then writes NULL over source / evidence /
    recorded_at / recorded_by on EVERY seat in the studio on that number —
    including the seat holding `inbound_sms` / "Replied STOP". R-AQ's premise
    ("a NULL here means there were never any refusal words") is true of the
    RECORD's writers and false of this picker, so the picker is what had to
    change: the `refusal` CTE now orders by words first — since r4 R4-M1 and
    r10 M1 that leg is "this row's evidence could BE the refusal's" rather than
    a bare `sms_consent_source IS NOT NULL` (decision 26) — then a date
    (`sms_opt_out_at IS NOT NULL`), then recency, and `ranked`'s within-status
    tiebreak carries the same two legs — written so they score equal for every
    row outside the refusal bucket, leaving "then the most recent granted"
    exactly as it was. The refusal's date also has a group-wide last resort,
    `max(sms_opt_out_at)` over the refusing seats, so a refusal that carries
    words but no date of its own still lands a real date instead of NULL. Fails
    closed either way — `refusal_unanswered` stood throughout — so this was
    evidence destruction, not a send-safety hole. SQL block 30
    (30a–30d); negative control
    `artifacts/people-room-crm-2026-09-11/build/probe20-r2-negative-control.sql`
    runs the pre-fix body beside the fixed one in one rolled-back transaction.

26. **The refusal's words come only off evidence that could BE the refusal's**
    (r4 R4-M1, widened by r10 M1). `project_parties` holds ONE evidence set per
    seat, and it belongs to whatever wrote the row's CURRENT status. The
    `refusal` CTE reads two shapes, and on both of them a status test alone
    hands the record the GRANT's paperwork as the refusal's own words:
    (a) the r8 W4-M1 shape — a seat whose status still says `granted` while it
    carries an unanswered opt-out date — where the evidence is plainly the
    grant's; and (b) **the commonest real refusal on the books** — a seat with a
    recorded grant that later texted STOP, which the shipped rail flipped to
    `opted_out` while leaving the grant's four columns standing (the other half
    of r10 M1 fixes the rail; see decision 30). Either way the fold minted
    `opt_out_source = 'written'`, `opt_out_evidence = "Signed the … kickoff
    form"`, an `opt_out_recorded_at` MONTHS BEFORE `opt_out_at`, and an
    `opt_out_recorded_by` naming the studio member who recorded the GRANT — the
    attribution r7 R7-M1 and r9 R5-M2 both ruled must be NULL on a rail-written
    STOP. R-Q's sentence printed "Opted out IN WRITING" for a refusal that
    arrived by text; and because `opt_out_source` came out non-NULL, decision
    23's wordless-refusal branch never fired, so the grant's paperwork was
    stamped onto every sibling seat in the studio on that number. Permanent:
    `ON CONFLICT DO NOTHING` never repairs it and `record_channel_reconsent`
    never touches `opt_out_*`. The four are now projected only when the row's
    evidence could plausibly belong to the refusal — it says so itself
    (`sms_consent_source = 'inbound_sms'`, which only the rail writes), or
    nothing contradicts it (`sms_consent_recorded_at >= sms_opt_out_at`, or one
    of the two dates is absent) — and otherwise NULL, all four together, which
    is the shape R-AQ reads. The same test is the `refusal` CTE's ranking leg,
    so a contaminated row no longer outranks an honest wordless refusal. The
    `ranked` picker is deliberately NOT given the test: its winner supplies the
    record's status, origin and CONSENT set, and on a STOP-flipped seat all
    three are right — the grant really was signed, and that belongs on the
    consent side. SQL blocks 30e and 30f (30f4 asserts the grant's paperwork
    standing on the consent side; 30f7/30f8 are the controls — a texted refusal
    and a refusal written down the day after it happened both keep their words).

27. **An email refusal has a way back; an SMS one does not** (r6 R6-M3, ruling
    branch (a)). Decision 18's "nothing but the recipient's own YES/START lowers
    `refusal_unanswered`" is an SMS sentence: on email that reply DOES NOT
    EXIST. The inbound rail is SMS-only, nothing in the tree writes an email
    consent row, and `record_channel_reconsent()` leaves the status where it
    stands — so an email refusal recorded by a studio member was PERMANENT, a
    dead end with no door. PR-m's way back is "a fresh recorded consent **or**
    an inbound START"; email has only the first half, so on email — and on email
    alone — `record_channel_consent` accepts a fully evidenced `granted` over an
    unanswered refusal and lowers the flag with it (`00594` upsert:
    `refusal_unanswered = CASE … WHEN EXCLUDED.channel_kind = 'email' AND
    EXCLUDED.status = 'granted' THEN false …`, plus the matching legs in the
    `WHERE`). Lowering the flag is not decoration — `channelConsentVerdict`
    refuses on it whatever the status says (r6 M6-3), so a door that did not
    would open onto nothing. Three things deliberately did not change: `pending`
    stays refused on email (the double opt-in is the SMS rail's dance, and the
    hint now says so instead of telling an email address to reply START); the
    evidence gate is untouched, so an email `granted` still needs source +
    evidence + disclosure_version; and the seat legs join on `pp.phone_e164`,
    which an email value never matches. SQL block 34 (34e/34e2 are the SMS
    control: the identical two acts, and the reconsent-then-grant composition,
    are still refused).

28. **The one home of the forbidding rule can say "never text"** (r4 R4-M2).
    `sms` was added to both `studio_contact_rules` CHECK arrays as a
    **rule-only** token, making the vocabulary eight names, not seven. It is
    deliberately NOT a `studio_contact_channels.channel_kind` (00593 still holds
    exactly seven): SMS is not a kind of channel in this model — it rides on
    `mobile` and is settled by `sms_capable`, which 00593 insists is a fact
    about the LINE, not a studio preference. Without the token decision 1's ONE
    home could not hold the fixture's own sentences (F-10 Sam Rowe "email only;
    phone for emergencies … never texted"; F-27 Ray Thao "phone and email only;
    NEVER texted; scheduled through 311"), both of which permit the voice call
    and forbid the text on the SAME line. SQL block 25 (25e writes that
    sentence; 25f holds the asymmetry — a `studio_contact_channels` row with
    `channel_kind = 'sms'` is still refused `23514`).

29. **A rule is filed under the noun its subject actually is** (r8 F1).
    `subject_type` was checked against nothing, and
    `assert_studio_contact_rule_route()` returned at its very first statement
    when `route_to_person_id IS NULL` — so a ROUTELESS rule, which is exactly
    what a plain "never texted" rule is, was never inspected at all. A rule with
    `subject_type = 'person'` naming a COMPANY card was accepted, and the RLS
    legs catch only the cross-FAMILY slip, never the wrong noun inside
    `studio_contacts`. The room looks a rule up by the noun of the card it is
    holding, so a rule filed under the other noun is invisible to every correct
    reader and a FORBIDDING rule fails OPEN — the two fixture cards above, lost
    inside the one home decision 1 gave them. The early return now sits BELOW a
    new subject test: for `person`/`company` the named card must exist and its
    `entity_kind` must equal `subject_type` (`rule_subject_kind_mismatch`), for
    `engagement` the id must exist in `project_parties`
    (`rule_subject_not_found`), and the org the route legs compare against comes
    off that same lookup. SQL block 31.

30. **The rail tells the truth about a STOP, or does not acknowledge it**
    (r7 R7-M1/R7-M2/R7-M3, r10 M1). Four rules on one act.
    (a) A STOP writes none of the CONSENT's five columns over a standing grant
    — the rail is held to the same rule `record_channel_consent` is (r6 R6-M1),
    leg for leg: the UPDATE leg carries the prior through, the MINTING leg
    writes the act's own source and words (r7 R7-M1).
    (b) The last phone-global scan in `channelConsentVerdict()` refuses on a
    read error instead of answering `"unknown"` — an "unknown" lifts the primary
    gate, and the legacy party-row check then carried the send past another
    studio's standing STOP (r7 R7-M2).
    (c) A STOP that could not be fully recorded is answered **500**, not 200,
    after clearing the inbound row's `twilio_sid` so Twilio's retry is not
    swallowed by the idempotency claim — a record-only studio (one holding a
    consent record but no seat) has no party-row backstop by construction, so a
    silently dropped write leaves its record at `granted` while the number has
    said STOP (r7 R7-M3). This changes what the live Twilio webhook returns.
    (d) `optOutAllForPhone()` writes the refusal's own evidence set onto the
    seats alongside the status (r10 M1) — see decision 26 for what the old
    behaviour cost. `_tests/sms-inbound.test.ts` covers all four.

31. **A fresh consent recorded over a refusal dates itself** (r9 M1).
    `record_channel_reconsent()` restates the studio's five evidence columns on
    every call, and `consented_at` was left alone on the reading that "the
    dates are kept". But `consented_at` is not an independent fact: it is the
    date OF THOSE FIVE (R-Q, `00594:159-170`), which is the rule decision 22
    (r6 R6-M1) enforces one function up. Left standing, one ordinary call
    through the door the `channel_opted_out` HINT sends studios to turned a
    record holding (`2 May 2025`, `written`, "Signed the kickoff form", `v3`)
    into one reading (`verbal`, "He said it is fine now", recorded today, `v9`)
    AGAINST 2 May 2025 — R-Q's grant sentence composing to "Verbal consent,
    2 May 2025", verbatim the failure r6 R6-M1 closed. And `v3`, the disclosure
    the person was actually shown at that grant, was destroyed on the record
    and, through the mirror's `COALESCE` (`00594:1016`), stamped as `v9` onto
    every seat in the studio on that number under an `opted_out` status.
    `consented_at = v_now` is now restated beside the five. Nothing else moves:
    `status` stays `opted_out`, `opt_out_at` keeps the day the refusal arrived,
    `refusal_unanswered` stays TRUE (r7 M7-2), and no gate opens —
    `record_channel_consent`'s granted leg tests `refusal_unanswered`, which
    this door keeps true, so "opted out 3 Dec 2025, fresh signed consent today,
    waiting on their reply" is exactly what the record says. SQL block 35, with
    16b4/16c2 and 16Bd carrying it on the composition path.

32. **The fold takes the CONSENT side off the group, not off the winning row**
    (r9 M2) — decision 26's mirror image. The commonest legacy shape is a
    studio holding a fully evidenced grant on one seat and the shipped portal's
    SOURCELESS, DATELESS `opted_out` on another seat on the same number
    (`use-coordination.ts` writes exactly that). The sourceless refusal wins the
    bucket — it must, it is the refusal — and the consent set came off that
    winner alone, so the record was minted with `source` / `evidence` /
    `recorded_at` / `disclosure_version` / `recorded_by` all NULL. Then the
    second half: `opt_out_source` came out NULL too, which is what decision
    23's (R-AQ) mirror branch reads as "this refusal has no words", so the
    mirror wrote NULL over all four evidence columns on EVERY seat in the studio
    on that number — including the seat that held the grant. `ON CONFLICT DO
    NOTHING` means no later fold repairs the record and `record_channel_reconsent`
    never touches `opt_out_*`, so the studio's proof of prior express written
    consent survived nowhere at all. A `grant_evidence` CTE now sits beside
    `refusal`, in the shape r8 W4-M1 established: one row per (studio, number),
    the group's best evidenced consent, projected onto the record's five consent
    columns AND `consented_at` — as one set, so the evidence and the date name
    the same act — where the winning row carries none. Its population is
    decision 26's words test read backwards (`refusal_words_are_its_own`, now
    computed once in `party_org` so the two CTEs cannot drift), so a refusal's
    own "Replied STOP" is never filed as a consent's evidence. A winner that
    carries its own consent evidence keeps it, unchanged: a STOP-flipped seat's
    grant paperwork (decision 26), and a refusal MINTING the record with its own
    words, which is what both other writers of a mint do (`record_channel_consent`'s
    INSERT leg, `sms-inbound/pipeline.ts`: "when this act MINTS the record there
    is no grant standing to protect"). SQL blocks 36 and 27i1b; 36d is the
    control — a group holding no grant has none invented for it.

---

## 3. Probes

Every output below was re-taken after the **r9 M1/M2** round (reconsent dating
its own consent, and the fold taking the consent side off the group), against a
full `supabase:reset` of the local stack. It has drifted three times in this wave: three rounds behind at r9
(R5-M2), a round and a half behind at r2 (R2-M2), and **five commits behind at
r10 (M2)** — where the paragraph standing here claimed the section was at the
tip while §2 was missing the email door, the rule-only `sms` token, the r8 F1
guard and the whole r7 second cycle, and the transcripts below printed a
seven-name CHECK the database contradicted. The re-take happens AFTER the
round's code lands; "it was re-taken last round" is not evidence that it is
current, so the counts below are the ones that catch it — 39 blocks, 38 notices,
80 deno cases, 216 / 2633 grant lines.

### Reset applies clean

```
$ pnpm --dir .codex/worktrees/agent-people-build supabase:reset
Applying migration 00591_notification_log_delivery.sql...
Applying migration 00592_people_cards_affiliations_rules.sql...
Applying migration 00593_studio_contact_channels.sql...
Applying migration 00594_studio_channel_consent.sql...
Applying migration 20260910152111_create_contact_messages.sql...
Seeding data from supabase/seed/00-legacy-grants.sql...
[...29 seed files...]
Finished supabase db reset on branch main.
{"target":"local","version":"","message":"Reset local database."}
```

### Objects, RLS, policies

```
          relname           | rls | policies
----------------------------+-----+----------
 studio_channel_consent     | t   |        1
 studio_contact_channels    | t   |        4
 studio_contact_rules       | t   |        4
 studio_person_affiliations | t   |        4
```

```
 studio_channel_consent_pkey | PRIMARY KEY (organization_id, channel_kind, channel_value)
```

### The RPC is the only write door

```
=== EXECUTE on record_channel_consent, by role ===
    rolname    | can_execute
---------------+-------------
 anon          | f
 authenticated | t
 service_role  | t

=== privileges on studio_channel_consent, by role ===
    rolname    | sel | ins | upd
---------------+-----+-----+-----
 anon          | f   | f   | f
 authenticated | t   | f   | f
 service_role  | t   | t   | t
```

### Functions: SECURITY DEFINER + pinned search_path

```
                proname                 | prosecdef |            proconfig            | anon_exec | auth_exec
----------------------------------------+-----------+---------------------------------+-----------+-----------
 _site_request_consent_granted_dispatch | t         | {search_path=public}            | f         | f
 _sync_person_company_pointer           | t         | {search_path=public}            | f         | f
 assert_affiliation_card_kinds          | t         | {search_path=public}            | f         | f
 assert_channel_owner_kind              | t         | {search_path=public}            | f         | f
 assert_studio_contact_designations     | t         | {search_path=public}            | f         | f
 assert_studio_contact_identity_stable  | t         | {search_path=public}            | f         | f
 assert_studio_contact_rule_route       | t         | {search_path=public}            | f         | f
 backfill_channel_consent_from_parties  | t         | {search_path=public}            | f         | f
 channel_value_was_on_sms_rail          | f         | {search_path=public}            | f         | f
 fc_dispatch_optin_invite               | t         | {search_path=public}            | f         | t
 mirror_channel_consent_to_parties      | t         | {search_path=public}            | f         | t
 normalize_channel_value                | f         | {search_path=public}            | f         | t
 normalize_studio_contact_channel       | f         | {"search_path=public, pg_temp"} | f         | t
 project_party_designer                 | t         | {search_path=public}            | f         | t
 record_channel_consent                 | t         | {search_path=public}            | f         | t
 record_channel_reconsent               | t         | {search_path=public}            | f         | t
 studio_contact_org                     | t         | {search_path=public}            | f         | t
 sync_person_affiliation_from_pointer   | t         | {search_path=public}            | f         | f
 sync_studio_contact_company_pointer    | t         | {search_path=public}            | f         | f
(19 rows)
```

Nineteen, not the eighteen this section listed before the r2 re-take and not
the fifteen it listed before r9's: the two designation guards
(`assert_studio_contact_designations`, r5 R-AP;
`assert_studio_contact_rule_route`, r6 M6-4), 00593's `sms_capable` evidence
test `channel_value_was_on_sms_rail`, and now the R-AR identity guard
`assert_studio_contact_identity_stable` (r8 R8-M2) had each shipped without
reaching this table.

(The THREE pointer functions added by R-AI — `_sync_person_company_pointer`,
`sync_studio_contact_company_pointer` and the reverse binding
`sync_person_affiliation_from_pointer` — hold EXECUTE for nobody: the triggers
run as the definer owner, and `_sync_person_company_pointer(uuid)` takes a
caller-supplied person id, so its REVOKE names `authenticated` too. The two
r3r2 kind guards, `assert_affiliation_card_kinds()` and
`assert_channel_owner_kind()`, hold nothing either, for the same reason — and
so do the two designation guards `assert_studio_contact_designations()` and
`assert_studio_contact_rule_route()`, and 00593's
`channel_value_was_on_sms_rail()`, which only the backfill calls.)

The two REDEFINED trigger functions keep the ACL `CREATE OR REPLACE` preserved:
`_site_request_consent_granted_dispatch` still holds nothing for `authenticated`
(00374's posture), `fc_dispatch_optin_invite` still holds the local
`00-legacy-grants.sql` baseline's EXECUTE. `anon` holds EXECUTE on none of them.

Both AFTER triggers on `project_parties` read the one guard:

```
$ psql … -Atc "select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
               where n.nspname='public' and p.prokind='f'
                 and pg_get_functiondef(p.oid) like '%patina.suppress_consent_dispatch%'"
_site_request_consent_granted_dispatch
fc_dispatch_optin_invite
mirror_channel_consent_to_parties

$ psql … -c "select tgname, p.proname from pg_trigger t join pg_proc p on p.oid=t.tgfoid
             where tgrelid='public.project_parties'::regclass and not tgisinternal;"
 fc_optin_invite_dispatch              | fc_dispatch_optin_invite                ← guarded
 normalize_phone_project_parties       | normalize_party_phone_e164              (BEFORE, pure)
 set_updated_at_project_parties        | update_updated_at_column                (BEFORE, pure)
 site_request_consent_granted_dispatch | _site_request_consent_granted_dispatch  ← guarded
```

(`authenticated=X` on the two trigger functions is the local
`00-legacy-grants.sql` baseline re-granting EXECUTE on every routine; the
migrations' own `REVOKE ... FROM PUBLIC, anon` is what governs on Strata. Same
posture as 00281's `normalize_party_phone_e164`. `backfill_...` shows the
explicit `REVOKE ... FROM authenticated` held.)

### Triggers

```
          relname           |                  tgname
----------------------------+-------------------------------------------
 studio_channel_consent     | mirror_channel_consent_to_parties_trg
 studio_channel_consent     | set_updated_at_studio_channel_consent
 studio_contact_channels    | assert_channel_owner_kind_trg
 studio_contact_channels    | normalize_studio_contact_channel_trg
 studio_contact_channels    | set_updated_at_studio_contact_channels
 studio_contact_rules       | assert_studio_contact_rule_route_trg
 studio_contact_rules       | set_updated_at_studio_contact_rules
 studio_person_affiliations | assert_affiliation_card_kinds_trg
 studio_person_affiliations | set_updated_at_studio_person_affiliations
 studio_person_affiliations | sync_studio_contact_company_pointer_trg
(10 rows)
```

`studio_contacts` carries the reverse half of the R-AI binding, the R-AP
designation guard and the R-AR identity guard, none of which lives on the four
tables above:

```
                  tgname                   |                proname
-------------------------------------------+---------------------------------------
 assert_studio_contact_designations_trg    | assert_studio_contact_designations
 assert_studio_contact_identity_stable_trg | assert_studio_contact_identity_stable
 normalize_phone_studio_contacts           | normalize_party_phone_e164
 set_updated_at_studio_contacts            | update_updated_at_column
 sync_person_affiliation_from_pointer_trg  | sync_person_affiliation_from_pointer
(5 rows)
```

Five, not the four this section listed before the r2 re-take: the R-AR identity
guard (`assert_studio_contact_identity_stable_trg`, BEFORE UPDATE OF
`entity_kind`, `organization_id`) is the fifth, and it sorts after the
designation guard by name — which is why SQL block 29d clears the designation
first, so that the OLDER guard is not the one that answers.

And the columns the refusal's own evidence set added to
`studio_channel_consent` (r8 W4-M2), with its CHECK:

```
$ psql … -c "select column_name from information_schema.columns
             where table_schema='public' and table_name='studio_channel_consent'
             order by ordinal_position"
organization_id · channel_kind · channel_value · status · consented_at ·
opt_out_at · refusal_unanswered · source · evidence · recorded_at ·
disclosure_version · recorded_by ·
opt_out_source · opt_out_evidence · opt_out_recorded_at · opt_out_recorded_by ·
origin_project_id · created_at · updated_at            (19 columns)

 studio_channel_consent_channel_kind_check     | CHECK (channel_kind = ANY (ARRAY['sms','email']))
 studio_channel_consent_opt_out_source_check   | CHECK (opt_out_source = ANY (ARRAY['verbal','written','web_form','inbound_sms','other']))
 studio_channel_consent_source_check           | CHECK (source = ANY (ARRAY['verbal','written','web_form','inbound_sms','other']))
 studio_channel_consent_status_check           | CHECK (status = ANY (ARRAY['not_asked','pending','granted','opted_out']))
 studio_contact_rules_channels_allowed_check   | CHECK (channels_allowed <@ ARRAY['mobile','office','dispatch','after_hours','email','ap_email','portal_311','sms'])
 studio_contact_rules_channels_forbidden_check | CHECK (channels_forbidden <@ ARRAY['mobile','office','dispatch','after_hours','email','ap_email','portal_311','sms'])
 studio_contact_rules_subject_type_check       | CHECK (subject_type = ANY (ARRAY['person','company','engagement']))
```

**EIGHT** names in the two rule vocabularies, not the seven this transcript
printed until r10 (M2): the rule-only `sms` token landed in r4 (R4-M2, decision
28) and the stale transcript was a printed CHECK the database contradicted.
`studio_contact_channels.channel_kind` still holds exactly seven — the asymmetry
is the point, and SQL block 25f holds it. The `channel_kind` CHECK on
`studio_channel_consent` (`sms | email`) is the one the email door of decision
27 turns on.

### SQL test

```
$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w1a_identity_channels_consent_test.sql
NOTICE:  1. affiliations + RLS: passed
NOTICE:  2. channel normalisation: passed
NOTICE:  3. consent backfill precedence: passed
NOTICE:  4. mirror + 5. record_channel_consent: passed
NOTICE:  6. mirror fan-out (B1) + backfill re-run (M1): passed
NOTICE:  7. widened vocabularies (M2/M3/M4): passed
NOTICE:  8. mirror fan-out, site-request leg (B-1): passed
NOTICE:  9. record_channel_consent transition gate (B-2): passed
NOTICE:  10. mirror evidence refresh (M-1): passed
NOTICE:  11. one normalisation + origin rule (M-3): passed
NOTICE:  12. affiliations are the home, company_id the pointer (R-AI): passed
NOTICE:  13. an inbound grant releases its parked site requests (B-1/M-2): passed
NOTICE:  14. the opted_out gate is part of the write (M-1): passed
NOTICE:  15. the card backfill does not invent SMS capability (M-2/M-1): passed
NOTICE:  16. the two consent doors do not compose past a STOP (M-1): passed
NOTICE:  16B. a DATELESS refusal fails closed too (r4 B-1): passed
NOTICE:  17. affiliation and channel kinds are enforced (M-2): passed
NOTICE:  18. the mirror never nulls an evidence column (R-AN): passed
NOTICE:  19. the write door reads the seats too (R-AL): passed
NOTICE:  20. the pointer moves one affiliation, not all of them (R-AO): passed
NOTICE:  21. the designated people are people, in this studio (R-AP): passed
NOTICE:  22. the seat gate is on the refusal, not the verdict (r6 B6-1/M6-1): passed
NOTICE:  23. the mirror keeps both dates (r6 M6-2): passed
NOTICE:  24. the routed person is a person, in this studio (r6 M6-4): passed
NOTICE:  25. the channel vocabulary is checked, both ways (r6 M6-5), and
         carries the rule-only `sms` token so "phone yes, text no" is
         writable (r4 R4-M2): passed
NOTICE:  26. no studio-side verdict lowers refusal_unanswered (r7 M7-1): passed
NOTICE:  27. reconsent is evidence-only and re-callable (r7 M7-2), leaves the
         refusal's own evidence standing (r8 W4-M2), the seat carries the
         refusal's own words too (r9 R5-M1), a sourceless refusal is never
         given the studio's consent as its words (r6 R6-M1) — nor left standing
         on the sibling seat (r8 R8-M1) — and a mirrored refusal never lends the
         seat the GRANT's recorder, words or date (r9 R5-M2): passed
NOTICE:  28. a studio-recorded refusal never speaks for a texted one, and the
         refusal keeps the date it arrived (r7 R7-M1): passed
NOTICE:  29. a held card cannot change what it is or whose it is — including
         the card a contact rule is filed against (r8 R8-M2, R-AR; r9 R5-M1):
         passed
NOTICE:  30. the fold picks the sibling that HOLDS the refusal, so a dateless
         portal refusal never erases the STOP's date or words — on the record
         or on the seats (r2 R2-M1): passed
NOTICE:  30e. a grant's paperwork is never filed as the refusal's own words,
         and the wordless refusal reaches both seats (r4 R4-M1): passed
NOTICE:  30f. a STOP over a standing grant is recorded wordless, the grant's
         paperwork stays on the consent side, and a real refusal keeps its
         words (r10 M1): passed
NOTICE:  31. a rule is filed under the noun its subject actually is (r8 F1): passed
NOTICE:  32. a recorded refusal never speaks for the grant it stands beside
         (r6 R6-M1): passed
NOTICE:  33. a blank evidence field cannot empty the evidence set (r6 R6-M2): passed
NOTICE:  34. an email refusal is recoverable by a fresh recorded consent and an
         SMS one is not (r6 R6-M3): passed
NOTICE:  35. a fresh consent recorded over a refusal carries its own date, so
         source, words, disclosure version and date name one act (r9 M1): passed
NOTICE:  36. the fold keeps the group's grant evidence when the winning row
         carries none, and never invents one for a group that holds none
         (r9 M2): passed
NOTICE:  All W1a assertions passed.
ROLLBACK
```

**39 blocks** — 1–36 plus 16B, 30e and 30f — and **38 notices**, because block
5's assertions live inside block 4's `DO`. This transcript has now been stale
three times: it ended at block 17 while eleven more had shipped (r9 R5-M2), at
block 27 while blocks 28 and 29 were passing (r2 R2-M2), and at block 30 while
30e and 31–34 were passing and block 25's own notice had changed under it
(r10 M2). The count is the check: `… | grep -c NOTICE` must read 39 (38 blocks
plus the closing line).

What it asserts: a studio member writes and reads an affiliation; a cross-studio
pair is refused; a stranger studio sees none and cannot write one. Phones
normalise to E.164 from three spellings, emails lowercase and trim, an
unparseable phone keeps its raw text. Two studios hold `+16125550142`: inside
Alpha the older STOP beats the newer grant, while Beta's `not_asked` is
untouched — and a second Alpha number proves the most-recent grant wins between
two grants. Re-running the fold does not overwrite a later decision. The mirror
writes the verdict onto both Alpha party rows and onto neither of Beta's. The
RPC normalises `(612) 555-0142` onto the existing record rather than minting a
second, keeps the earlier opt-out date through a new grant, refuses a member of
another studio and a user in no studio (`not_a_studio_member`), and
`authenticated` gets `42501` on a direct INSERT while still reading its own
studio's two records.

Blocks 6–7 are the r1-round regressions (B1/M1 and the widened vocabularies).
Blocks 8–11 are the r2 round: a mirrored `granted` fires neither of
`project_parties`' outward AFTER triggers while a direct party-row write still
fires both (8); the RPC's evidence requirement, its refusal of every transition
out of `opted_out`, the absence of evidence-laundering across a status change,
and `record_channel_reconsent()`'s behaviour including `no_opt_out_to_supersede`
and a non-member refusal (9); a same-status re-record refreshing the mirrored
evidence, plus a whole-table assertion that NO party row sits at `granted` with
a hollow evidence set (10); and one normalisation rule plus one origin rule
(11). Block 12 is the r3 round: opening an affiliation sets
`studio_contacts.company_id`, a direct legacy write to that column does not
survive the next affiliation write, closing or deleting the affiliation clears
it, 00592's fold statement leaves exactly one open row and is a no-op on a
re-run, and no person card anywhere points at a firm it has no open affiliation
with. Block 9 also gained the R-AG pair: the four-argument `not_asked` call is
refused (`consent_not_recordable`) with the grant and its whole evidence set
left standing, and an opt-out that restates its own words keeps the disclosure
version rather than nulling it.

Blocks 13–15 are the r2 re-review round: an inbound YES/START releases the site
requests parked in `awaiting_consent` — including the seat the studio never
asked on, which the record's mirror grants regardless — one dispatch per
request, and the record write that follows adds no second one (13); the "nothing leaves `opted_out`"
gate is part of the WRITE in both doors rather than a read before it, and a
refused grant leaves the refusal byte-for-byte intact (14); and 00593's card
backfill marks no number SMS-capable without a real SMS rail behind it — an
`sms_conversations` thread or an asked FIELD-kind seat — in leg (a) AND leg (c),
labelling the rest `line type unconfirmed`, with an architect card and an AHJ
desk line as the two cases that used to come out `true` (15). Blocks 16–17 are
the r3 re-review round: `record_channel_reconsent()` followed by a recorded
grant is refused (`consent_awaiting_recipient`) and only the recipient's own
inbound grant reopens that door (16), and block 16B proves the same for a
DATELESS refusal, the shape the shipped portal writes and the fold mints (r4
B-1); and an affiliation's `person_id` must be
a person card, its `company_id` a company card, never the same card, on INSERT
and UPDATE alike, with a channel's `owner_type` held to its card's
`entity_kind` and the legacy-pointer binding standing down rather than raising
through it (17).

Blocks 18–21 are the r5 round: the mirror refreshes an evidence column but
never nulls one, per column, across all five (18, R-AN); the write door refuses
a grant over a refusal standing on one of this studio's OWN party rows, with no
record behind it, and the only way past is a fresh `opted_out` record and then a
new grant (19, R-AL); the legacy pointer opens or closes only the affiliation it
names and leaves a person's other firms standing (20, R-AO); and the three
`studio_contacts` designations must each name a person card in the same studio,
never the row itself (21, R-AP). Blocks 22–25 are the r6 round: the write
door's seat test asks the send gate's own question — `sms_consent_status =
'opted_out'`, dated or not (22); the mirror keeps BOTH dates, so a record
carrying a verdict without an `opt_out_at` no longer wipes a real dated refusal
off every seat (23); `route_to_person_id` gets the same person-and-studio test
as the three designations (24); and `channels_allowed` / `channels_forbidden`
are held to the channel vocabulary in both directions — EIGHT names since r4
R4-M2, the seven channel kinds plus the rule-only `sms` token, with 25e writing
the fixture's "phone yes, text no" sentence on one line and 25f holding the
asymmetry, a `studio_contact_channels` row with `channel_kind = 'sms'` still
refused `23514` (25). Blocks
26–27 are the r7/r8/r9 rounds: no studio-side verdict lowers
`refusal_unanswered` — only the inbound rail's own write does (26, r7 M7-1); and
`record_channel_reconsent()` is evidence-only, leaves the record at `opted_out`,
stays re-callable, leaves the refusal's OWN evidence set untouched on the record
(27b3/27b4/27d2/27g, r8 W4-M2) and leaves the refusal's own source and words on
the SEAT (27c2/27d3, r9 R5-M1), while a later `granted` verdict mirrors the
consent set onto the seat as before (27h). Block 27 also carries the r6 R6-M1
case: the fold mints the shipped portal's SOURCELESS refusal wordless — while
27i1b (r9 M2) finds the group's real grant on the record's CONSENT side, which
is the only copy that survives R-AQ's seat wipe two legs later — and a reconsent
over it leaves the seat's source and words NULL rather than lending the refusal
the studio's own consent document (27i–27i5); block 3 carries r6
R6-M2 — the refusing sibling's own `sms_opt_out_at` lands on the record, so the
refusal's words and the refusal's date come off the same row (3c6).

Blocks 30e, 30f and 31–34 close the list, and until the r10 re-take none of them
appeared here. **30e** (r4 R4-M1): the fold never files a GRANT's paperwork as
the refusal's own words when the seat's status still reads `granted` over an
unanswered opt-out date — the date still lands, the words come out NULL, and the
wordless refusal then reaches both seats through R-AQ's branch. **30f** (r10 M1)
is the other shape and the commonest one: a seat with a recorded grant that
later texted STOP. The record is minted wordless (30f3), the refusal keeps its
date (30f2), and the grant's paperwork is not destroyed — 30f4 finds it on the
record's CONSENT side where it belongs. 30f7 and 30f8 are the controls that keep
the test a test: a refusal whose source says `inbound_sms`, and one a studio
wrote down the day AFTER it happened, both keep every one of their four columns.
**31** (r8 F1): a rule whose `subject_type` says `person` while `subject_id`
names a company card is refused `rule_subject_kind_mismatch` — routed or not,
which is the leg that was never inspected — and an `engagement` subject must
exist in `project_parties`. **32** (r6 R6-M1): a recorded refusal writes none of
the consent's five columns, so the grant it stands beside keeps its own 10DLC
artifact. **33** (r6 R6-M2): a blank evidence string is a blank, not a value, so
it cannot empty the evidence set. **34** (r6 R6-M3): an email refusal IS
recoverable by the studio's own fully evidenced `granted`, which lowers
`refusal_unanswered` and leaves `opt_out_at` and the refusal's words standing —
while 34e/34e2 prove the identical two acts on SMS, and the
reconsent-then-grant composition, are still refused. **35** (r9 M1): a fresh
consent recorded over a refusal carries its own date — 35b2 asserts
`consented_at = recorded_at` and not the 2 May 2025 grant it superseded, 35c
that nothing else moved (status, `opt_out_at`, `refusal_unanswered` and the
refusal's own words all stand), and 35d that the seat's disclosure version and
consent date name the same act. **36** (r9 M2): the fold folds a sourceless
portal refusal sitting beside a fully evidenced grant and puts that grant's five
columns AND its date on the record's consent side (36b) while the refusal stays
wordless (36a) and the seats are wiped by R-AQ (36c) — the record being the only
place the studio's proof of prior express written consent now survives; 36d is
the control, a group whose only evidence is a texted refusal's own words, which
gets no grant invented for it and no consent date at all.

### Deno tests

```
$ deno test --no-check --allow-all --config supabase/functions/deno.json \
    supabase/functions/_shared/sms.test.ts supabase/functions/_tests/sms-inbound.test.ts
ok | 80 passed | 0 failed (307ms)    # 38 in sms.test.ts, 42 in sms-inbound.test.ts

$ deno test --no-check --allow-all --config supabase/functions/deno.json \
    supabase/functions/_tests/ supabase/functions/_shared/
FAILED | 703 passed | 1 failed (3s)
  ./supabase/functions/_tests/stripe-rail.test.ts (uncaught error)
    error: (in promise) Error: supabaseKey is required.
```

(The suite for `sms-inbound` lives at `supabase/functions/_tests/sms-inbound.test.ts`;
`supabase/functions/sms-inbound/` itself holds no `*.test.ts`, so a literal
`deno test … supabase/functions/sms-inbound` reports "No test modules found".)

`stripe-rail.test.ts` fails identically with my three edge-function edits
stashed — it wants env from `_tests/test.env`, which the bare `deno test`
invocation does not load. Pre-existing, unrelated.

Cases added across the three rounds:
`_shared/sms.test.ts` — the studio's `opted_out` record blocks a send the party
row would allow; another studio's opt-out does **not** block the owning
studio's send (the G-3 bug, gone); with no record at all an opted-out sibling
party row still blocks; the studio's `granted` record carries a send the party
row would refuse (M5/F-11); a `granted` record never overrides an opted-out
party row; a NULL-`studio_id` project resolves its org off `organization_members`
(M7; r5 R-AM — not through the revoked `_primary_studio_for` RPC). **r2 B-3**: a stale `granted` record does not carry a send past this
studio's own STOP; another studio's opted-out party row does **not** block this
studio's `granted` record (the scan stays studio-scoped, or G-3 re-opens); the
stale-record scan resolves a NULL-`studio_id` project the same way. **r5
R-AM**: the primary studio is the owner-role `design_studio` read off the
tables, and a failed org resolve refuses the send instead of reading as "no
studio".
`_tests/sms-inbound.test.ts` — STOP writes one `opted_out` record per studio
(two studios, three party rows → two records); YES grants only for the studio
that actually invited; START upserts in place and keeps the earlier `opt_out_at`
and `disclosure_version`; YES does not grant a party row in a studio that never
invited (M6); STOP reaches a NULL-`studio_id` project through the designer's
primary studio, read off `organization_members` (M7, r5 R-AM). **r5 R-AN**: an
inbound YES carries the seat's `disclosure_version` and recorder onto the
record it mints. **r2 B-3(b)/M-3**: STOP reaches a studio that holds
a consent record but no party row; START lifts a seatless `opted_out` record but
leaves a seatless `not_asked` one alone; a STOP re-homes `origin_project_id`
onto the job it came from.

**r3r2**: `_shared/sms.test.ts` — the flush's SECOND gate is the deferred
row's own party: an unrelated studio's opted-out row no longer suppresses the
owning studio's granted send, an unrelated studio's granted row no longer
carries a send for a studio that never asked (a real outbound SMS before this),
and with no party on the deferred row the phone-global reduction still refuses
a STOP. Both failing directions were confirmed against the pre-fix code
(2 failed) before the narrowing landed.

**r7 second cycle / r10**: `_shared/sms.test.ts` — the last phone-global scan
refuses on a failed read instead of answering `"unknown"` (R7-M2).
`_tests/sms-inbound.test.ts` — a STOP over a standing written grant leaves the
grant's `source` / `evidence` / `recorded_at` alone on the record (R7-M1); a
STOP whose consent-record read fails, and one whose party read fails, are each
answered 500 with `twilio_sid` released, and the retry completes them, while a
STOP with every read clean still answers 200 (R7-M3); and **the two r10 cases**
— a STOP writes `inbound_sms` / "Inbound STOP" / `recorded_at = now` /
`recorded_by = null` over the grant's four columns on every seat while leaving
`sms_consent_disclosure_version` alone, and an `UNSUBSCRIBE` stamps its own
keyword on both the seats and the record rather than a generic "STOP".

**r3**: `_shared/sms.test.ts` — with no record, an opted-out sibling party row
**in the same studio** still blocks, another studio's does not, and with no
resolvable studio at all any opted-out row on the number still blocks (R-AK);
the flush honours the studio's `granted` record for a party row that has not
caught up, and suppresses on the studio's `opted_out` record even when the
party-row reduction would allow it (R-AH). `_tests/sms-inbound.test.ts` — START
does not grant a seat-holding studio whose record never left `not_asked`, does
grant one whose record is `pending`, and mints no record at all for a
seat-holding studio that has none (R-AJ).

Type check of the two files I edited:

```
$ deno check --config supabase/functions/deno.json \
    supabase/functions/_shared/sms.ts supabase/functions/sms-inbound/pipeline.ts
Check supabase/functions/_shared/sms.ts
Check supabase/functions/sms-inbound/pipeline.ts
```

(`sms-dispatch/index.ts` reports 11 type errors and `fulfillment-po/core.ts` one;
both reproduce on HEAD with my edits stashed. Pre-existing — the suites run
`--no-check` by their own header instructions.)

### Generated types

```
$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm db:generate
$ git diff --stat 700261663 -- packages/supabase/src/database.types.ts
 packages/supabase/src/database.types.ts | 508 ++++++++++++++++++++++++++++++++
 1 file changed, 508 insertions(+)
```

508 insertions, **zero deletions**. New table types `studio_channel_consent`,
`studio_contact_channels`, `studio_contact_rules`,
`studio_person_affiliations`; new function types
`backfill_channel_consent_from_parties`, `channel_value_was_on_sms_rail`,
`normalize_channel_value`, `project_party_designer`, `record_channel_consent`,
`record_channel_reconsent`, `studio_contact_org`; and the fifteen new
`studio_contacts` columns. `studio_channel_consent`'s Row/Insert/Update types
carry all nineteen columns, the four `opt_out_*` of the refusal's own evidence
set (r8 W4-M2) included — the 465 this section printed before r9's re-take
predated them. Nothing else. (Redefining `fc_dispatch_optin_invite` and
`_site_request_consent_granted_dispatch` changes no signature, so neither
appears in the diff.)

Re-running `db:generate` after the r9 (R5-M1) round leaves the committed file
unchanged (`git diff --stat packages/supabase/src/database.types.ts` → empty):
the mirror's change is a function body, adding no column and no signature. The
same held for the r3r2 and r6 rounds' trigger guards.

---

## 4. Importers of `_shared/sms.ts` — all redeploy in W7

`grep -rl "_shared/sms" supabase/functions --include=index.ts`:

1. `supabase/functions/site-request-dispatch/index.ts`
2. `supabase/functions/sms-dispatch/index.ts`

The wider `grep -rl "_shared/sms" supabase/functions` also reaches three
non-`index.ts` files that are bundled into their own deployables, so the real
redeploy list is **four functions**:

| Function | How it reaches `_shared/sms.ts` |
|---|---|
| `sms-dispatch` | `index.ts` imports it directly |
| `site-request-dispatch` | `index.ts` imports it directly |
| `field-daily` | `field-daily/core.ts` imports it; `index.ts` imports `core.ts` |
| `sms-inbound` | `sms-inbound/pipeline.ts` imports it (and is itself edited here) |

(`_shared/sms.test.ts` and `_tests/field-daily.test.ts` also import it; neither
deploys.)

---

## 5. Not done

- **Not applied to Strata.** No `supabase db push`, no `supabase functions
  deploy`, no `.env.local` repoint. Local only.
- **Migration numbers are provisional, but nothing collides today.** Scanned
  across all 140 local and remote refs
  (`git ls-tree --name-only <ref> supabase/migrations/ | grep 0059[2-4]`), the
  only refs holding 00592–00594 are this wave's own branch and its origin
  mirror; `origin/main`'s migration tip is still `00591_notification_log_delivery`.
  The hour-tracking wave, which earlier held these numbers, has moved up:
  `hour-tracking/integration` now carries `00595/00596/00597_time_entry_*` and
  `hour-tracking/server` carries those plus `00598_studio_member_rates` and
  `00599_resolve_time_rate_cents`. (The stale
  `00592_time_entry_claim_and_source` / `00593_project_unbilled_time_repair` /
  `00594_time_entry_auto_roster` rows this report earlier read out of the local
  `supabase_migrations.schema_migrations` were that wave's older numbering left
  behind in the shared local stack; the reset replaced them, and the ledger now
  reads `00592_people_cards_affiliations_rules`,
  `00593_studio_contact_channels`, `00594_studio_channel_consent`.) **Re-check
  the integration tip at merge and renumber if it has moved** — numbers stay
  provisional until then, per patina-parallel-work. Nothing here is applied to
  prod, so this side is the one that moves.
- **The backfills found nothing locally (0 channels, 0 consent rows).**
  Migrations run before seeds, so `studio_contacts` and `project_parties` were
  empty when 00593/00594 executed. The fold logic is proven by the SQL test
  against its own fixture, not by seed data. On Strata the backfills will do
  real work on first push. **Before that push, dry-run the fold** — and dry-run
  it WITH THE REFUSAL CTE. A bare `SELECT org, phone_e164, sms_consent_status
  FROM ranked WHERE rn = 1`, which is what this section said until r9 (R5-M2),
  reads only the winning seat and therefore cannot show `refusal_unanswered` —
  the one column decided by the `refusal` CTE's LEFT JOIN, the one behaviour
  W4-M1 changed, and the one that decides whether a studio may text the number
  at all after the fold. The runnable script is
  `artifacts/people-room-crm-2026-09-11/build/probe10-r9-fold-dry-run.sql`
  (the function's own CTE chain verbatim, INSERT replaced by SELECT); its shape
  is:

  ```sql
  SELECT r.org, r.phone_e164, r.sms_consent_status,
         (f.org IS NOT NULL) AS refusal_unanswered,
         COALESCE(r.sms_opt_out_at, f.sms_opt_out_at) AS opt_out_at,
         f.opt_out_source, f.opt_out_evidence, f.opt_out_recorded_at,
         -- r9 M2: and the CONSENT side as the fold will write it
         CASE WHEN r.sms_consent_source IS NULL AND g.org IS NOT NULL
              THEN g.sms_consent_source ELSE r.sms_consent_source END AS consent_source,
         CASE WHEN r.sms_consent_source IS NULL AND g.org IS NOT NULL
              THEN g.sms_consented_at   ELSE r.sms_consented_at   END AS consented_at
    FROM ranked r
    LEFT JOIN refusal f ON f.org = r.org AND f.phone_e164 = r.phone_e164
   WHERE r.rn = 1
   ORDER BY refusal_unanswered DESC, r.org, r.phone_e164;
  ```

  `opt_out_at` — WHEN THEY REFUSED — is printed beside `opt_out_recorded_at`
  (when it was written down) because those are two different facts and until
  r6's R6-M2 the dry run showed only the second: the fold took `opt_out_at` from
  the WINNING row while taking the refusal's words from the refusing sibling, so
  on this very fixture the operator read a dated refusal off a row about to be
  minted with none. The fold now takes both off the same row, and so does this
  script.

  It runs clean locally (0 rows — no seeded party phones), and on the W4-M1
  fixture the two dry runs disagree, which is the point:

  ```
  -- two seats, one number, one studio: a clean 2026 grant and a legacy row
  -- reading `granted` while carrying an unanswered 2025-11-16 opt-out
  NEW:  org=b2000000-…-00000000000a  +16125550777  granted  refusal_unanswered=t
        opt_out_at 2025-11-16 00:00:00+00
        inbound_sms | Replied STOP on the Rusk thread | 2025-11-16 00:00:00+00
        granted | unsendable 1 | records 1
  OLD:  org=b2000000-…-00000000000a  +16125550777  granted
  ```

  The old dry run hands the operator a sendable-looking `granted`; the new one
  says the record about to be minted is UNSENDABLE until the recipient's own
  YES/START (r1 review m14, r8 W4-M1, r9 R5-M2).

  **The script was re-cut again for r2 R2-M1 and once more for r10 M1**, and
  must be re-run from the branch tip, not from a copy taken earlier in this
  wave: both of its pickers now rank the refusing seats by the refusal's own
  facts — words, then date, then row recency — and carry the group-wide
  `max(sms_opt_out_at)` fallback, exactly as the function does; and since r10
  the WORDS leg is "this row's evidence could BE the refusal's" (`inbound_sms`,
  or an evidence date no earlier than the refusal), not a bare status test. A
  copy taken before r10 prints the studio's own kickoff paperwork in
  `opt_out_source` / `opt_out_evidence` for every seat that held a grant and
  then texted STOP — which on Strata is the commonest refusal there is — so the
  operator would sign off a fold that is about to record those refusals as made
  IN WRITING, months before they happened, by the member who recorded the grant.
  Checked on the r10 fixture, the dry run and the fold agree row for row:
  `+16125550504` comes back `opted_out / refusal_unanswered = t / opt_out_at
  2025-12-03` with all four `opt_out_*` blank, which is exactly what
  `backfill_channel_consent_from_parties()` then writes. A dry run taken with the old picker prints
  `opt_out_at`, `opt_out_source` and `opt_out_evidence` EMPTY for every studio
  whose dateless portal refusal happens to be the most recently touched seat on
  the number, so the operator reads "a refusal stands here and nothing is known
  about it" for records the fold will in fact mint with the STOP's own date and
  words. **What this dry run must show before the push**: for every row with
  `refusal_unanswered = t` that has a dated, worded STOP anywhere in its group,
  `opt_out_at` and `opt_out_source` are non-empty. A row coming back
  `refusal_unanswered = t` with all four `opt_out_*` empty is a group whose only
  refusals really are wordless (the portal's own shape) — and on those, and only
  those, the mirror will write NULL over the seats' four evidence columns
  (decision 23, R-AQ). The dry run carries the `grant_evidence` CTE too since
  r9 M2, so its `consent_source` / `consented_at` columns are the paperwork the
  fold will actually file: a group whose winning seat is the portal's sourceless
  refusal comes back showing the grant standing on the seat next door rather
  than a blank the operator would read as "this studio has no consent evidence
  for this number". Re-checked on a two-group fixture after that change, the dry
  run and the fold agree row for row on all seven columns (`+16125550911` and
  `+16125550912`, both `opted_out / refusal_unanswered = t`, both
  `consent_source = written / consented_at = 2025-05-02`). Checked on the
  earlier fixture, the dry run and the fold now agree row for row;
  `artifacts/people-room-crm-2026-09-11/build/probe20-r2-negative-control.sql`
  runs the pre-fix fold body beside the fixed one in one rolled-back transaction
  and shows the difference (record and both seats keep
  `inbound_sms` / "Replied STOP…" / 2025-12-03 with the fix; record and the
  sibling seat come out holding nothing without it).

  `backfill_channel_consent_from_parties()` can then be re-run afterwards as
  `service_role` without overwriting anything: the rows it folds reach the party
  rows through the mirror, which stands BOTH of `project_parties`' outward
  AFTER triggers down for its own write — 00432's opt-in invite and 00374's
  site-request consent dispatch — so a re-run sends no SMS (r2 B-1). It may mint
  durable `consent-granted` outbox work for site requests parked on seats a
  folded `granted` moves, which is the release those requests were owed (r4
  M-2); a folded record whose party rows already read `granted` moves nothing.
- **Out of W1a scope by instruction** (named so the next wave does not assume
  they landed): `studio_compliance_documents`, `project_party_authority`,
  `project_site_access_cards`, `client_households`, `studio_contact_merges`,
  `v_access_grants`, the `people_directory` rebuild, `project_parties`' new
  columns (`stage`, `on_site_from/to`, `site_access_mode`, `contracted_through`,
  `off_job_at/reason`, `company_id`, bid fields), the `create_field_link` expiry
  change (PR-d), and the `client_decisions.court` widening.
- **A studio with a seat but no consent record cannot be re-subscribed by a
  START** (R-AJ, by ruling). In practice a STOP writes an `opted_out` record for
  every studio holding the number, so the studios a START can answer always have
  one; the case with no record at all is a number that never received a STOP
  through this rail.
- **`project_parties.sms_consent_*` is not yet read-only.** It is a mirror by
  trigger, but the columns still carry their old grants and policies, and
  `sms-inbound` still writes them directly (deliberately: "the existing
  `project_parties` writes may remain"). Retiring those writes, and retiring the
  phone-global reduction in `sms.ts`, is the named follow-up PR-x asks for —
  after the backfill is proven on Strata.
- **No portal hook or UI.** `packages/supabase` gained only the regenerated
  `database.types.ts`; no React Query hook reads any of the new tables yet.
- **No PostHog flag** — per rulings §6 the program ships at 100% with no flag.
