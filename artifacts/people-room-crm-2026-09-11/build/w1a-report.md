# W1a — the data layer: identity, channels, consent

Branch `build/people-room-crm-2026-09-11`, worktree `.codex/worktrees/agent-people-build`.
Local Supabase only. Nothing was pushed to Strata; no `supabase db push`, no
`supabase functions deploy`.

---

## 1. What shipped

### Migrations (three, minted after this worktree's head `00591`)

| File | Carries |
|---|---|
| `supabase/migrations/00592_people_cards_affiliations_rules.sql` | `studio_contact_org()` + `project_party_designer()` helpers · `studio_contacts` person columns (`is_sole_proprietor`, `studio_verdict`, `studio_verdict_at`) and company columns (`legal_name`, `dba_name`, `company_kind` + CHECK, `trades`, `w9_on_file_at`, `tax_id_last4`, `remit_to`, `retainage_bps`, `warranty_until`, `paperwork_contact_person_id`, `signer_person_id`, `site_contact_person_id`) · new table `studio_person_affiliations` (+ `assert_affiliation_card_kinds()` and `studio_person_affiliations_distinct_cards_check`) · new table `studio_contact_rules` |
| `supabase/migrations/00593_studio_contact_channels.sql` | New table `studio_contact_channels` · **`normalize_channel_value(kind, value)`** — the one channel-key rule, shared with 00594's consent RPCs · **`channel_value_was_on_sms_rail(value)`** — the `sms_capable` evidence test (an `sms_conversations` thread, or an asked FIELD-kind seat) · `normalize_studio_contact_channel()` trigger (defers to the normaliser) · `assert_channel_owner_kind()` trigger — `owner_type` must equal the card's own `entity_kind` · four-part backfill from `studio_contacts.phone/email` and from `project_parties.phone/email` where `studio_contact_id` is set, carrying the `sms_capable` evidence rule below |
| `supabase/migrations/00594_studio_channel_consent.sql` | New table `studio_channel_consent` (PK `(organization_id, channel_kind, channel_value)`, carrying `refusal_unanswered` — the stored "a refusal stands that has not been answered") · `backfill_channel_consent_from_parties()` + its one call · `mirror_channel_consent_to_parties()` trigger · RPC `record_channel_consent(...)` · RPC `record_channel_reconsent(...)` (PR-m's named way back) · **REDEFINES two existing trigger functions**: `fc_dispatch_optin_invite` (lineage `00432:27-68`) and `_site_request_consent_granted_dispatch` (lineage `00374:3399-3444`) · `COMMENT ON TABLE public.project_parties` restating the mirror invariant (lineage `00212:46`) |

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
`mirror_channel_consent_to_parties`, `record_channel_consent`).

`python3 scripts/generate-legacy-grants.py` was re-run after the grants:
`supabase/seed/00-legacy-grants.sql` gained 186 lines over this wave's base
commit `700261663` ("baseline + 2628 replayed statements"). It regenerates with
an empty diff.

### Edge functions

- `supabase/functions/_shared/sms.ts` — new `channelConsentVerdict()`
  (`"refuse" | "allow" | "unknown"`), called in `sendPartySms()` **before** the
  existing gate, plus `resolveProjectOrg()` / `orgsOfProjects()`, which resolve
  a project's studio exactly as the SQL side does
  (`COALESCE(studio_id, _primary_studio_for(designer_id))`). It reads
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
10. **The org for a project is `projects.studio_id`,** with
    `_primary_studio_for(designer_id)` as the fallback (00317 both backfilled
    the column and trigger-maintains it) — **on both sides**. `sms.ts`'
    `resolveProjectOrg()` / `orgsOfProjects()` and `pipeline.ts`'
    `studiosHoldingPhone()` apply the same COALESCE the migration does, so the
    gate and the table cannot disagree about which studio a NULL-`studio_id`
    project belongs to (r1 M7).
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
    which would erase the only stored record of the refusal. **`not_asked` is
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
    door, `record_channel_reconsent()`, landing on `pending` — `granted` stays
    the recipient's to give by replying YES or START, and that is now enforced
    ACROSS the pair, not only at each door: this door refuses `granted` while
    the refusal reconsent superseded is still unanswered
    (`consent_awaiting_recipient`; decision 18 below). Read those two
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
    `opted_out`, and `record_channel_reconsent()` lands on `pending`. Stated
    that way each door held, but the PAIR did not: reconsent moved the row off
    `opted_out`, and the next recorded grant found a row the first gate no
    longer refused — two calls, any studio member, and a recorded STOP was back
    at `granted`, with the mirror clearing the party-row backstop `sendPartySms`
    falls back on. So the write door now ALSO refuses `granted` while an
    **unanswered** refusal stands — and (r4 B-1) that is read off a STORED
    FACT, `studio_channel_consent.refusal_unanswered`, not inferred from
    `opt_out_at`. A refusal is routinely DATELESS: the shipped portal writes
    `opted_out` party rows with a NULL `sms_opt_out_at` on purpose
    (`use-coordination.ts:604-617` — "opted out, date unknown" is the truth),
    every pre-00432 row carries no date either, and the fold mints that whole
    population verbatim, so the date test failed OPEN for exactly the records
    the first prod push creates. The flag is raised by every writer that records
    a refusal (the fold, `record_channel_consent`, `record_channel_reconsent`,
    the inbound STOP rail) and lowered only by a `granted` write. The date test
    is KEPT alongside it, so a `service_role` writer that dates a refusal
    without raising the flag still fails closed
    (`consent_awaiting_recipient`). What answers a refusal is the
    recipient's own YES/START, which the inbound rail writes directly — lowering
    the flag and stamping a fresh `consented_at`; after that this door opens
    again. A record already at
    `granted` may still restate its evidence — the number is sendable either
    way, and refusing there would strand a folded row whose dates disagree with
    its status, since `reconsent()` requires `status = 'opted_out'`. SQL
    blocks 16 and 16B (the dateless refusal).

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

---

## 3. Probes

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
 relname                    | rls | policies
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
 backfill_channel_consent_from_parties  | t         | {search_path=public}            | f         | f
 fc_dispatch_optin_invite               | t         | {search_path=public}            | f         | t
 mirror_channel_consent_to_parties      | t         | {search_path=public}            | f         | t
 normalize_channel_value                | f         | {search_path=public}            | f         | t
 normalize_studio_contact_channel       | f         | {"search_path=public, pg_temp"} | f         | t
 record_channel_consent                 | t         | {search_path=public}            | f         | t
 record_channel_reconsent               | t         | {search_path=public}            | f         | t
 studio_contact_org                     | t         | {search_path=public}            | f         | t
 project_party_designer                 | t         | {search_path=public}            | f         | t
 _sync_person_company_pointer           | t         | {search_path=public}            | f         | f
 sync_studio_contact_company_pointer    | t         | {search_path=public}            | f         | f
 sync_person_affiliation_from_pointer   | t         | {search_path=public}            | f         | f
 assert_affiliation_card_kinds          | t         | {search_path=public}            | f         | f
 assert_channel_owner_kind              | t         | {search_path=public}            | f         | f
```

(The THREE pointer functions added by R-AI — `_sync_person_company_pointer`,
`sync_studio_contact_company_pointer` and the reverse binding
`sync_person_affiliation_from_pointer` — hold EXECUTE for nobody: the triggers
run as the definer owner, and `_sync_person_company_pointer(uuid)` takes a
caller-supplied person id, so its REVOKE names `authenticated` too. The two
r3r2 kind guards, `assert_affiliation_card_kinds()` and
`assert_channel_owner_kind()`, hold nothing either, for the same reason.)

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
 studio_channel_consent     | mirror_channel_consent_to_parties_trg
 studio_channel_consent     | set_updated_at_studio_channel_consent
 studio_contact_channels    | assert_channel_owner_kind_trg
 studio_contact_channels    | normalize_studio_contact_channel_trg
 studio_contact_channels    | set_updated_at_studio_contact_channels
 studio_contact_rules       | set_updated_at_studio_contact_rules
 studio_person_affiliations | assert_affiliation_card_kinds_trg
 studio_person_affiliations | set_updated_at_studio_person_affiliations
 studio_person_affiliations | sync_studio_contact_company_pointer_trg
```

(`studio_contacts` also carries `sync_person_affiliation_from_pointer_trg`, the
reverse half of the R-AI binding — it lives on that table, not on the four new
ones listed here.)

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
NOTICE:  13. an inbound grant releases its parked site requests (B-1): passed
NOTICE:  14. the opted_out gate is part of the write (M-1): passed
NOTICE:  15. the card backfill does not invent SMS capability (M-2): passed
NOTICE:  16. the two consent doors do not compose past a STOP (M-1): passed
NOTICE:  17. affiliation and channel kinds are enforced (M-2): passed
NOTICE:  All W1a assertions passed.
ROLLBACK
```

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

### Deno tests

```
$ deno test --no-check --allow-all --config supabase/functions/deno.json \
    supabase/functions/_shared/sms.test.ts supabase/functions/_tests/sms-inbound.test.ts
ok | 61 passed | 0 failed (90ms)     # 29 in sms.test.ts, 32 in sms-inbound.test.ts

$ deno test --no-check --allow-all --config supabase/functions/deno.json \
    supabase/functions/_tests/ supabase/functions/_shared/
FAILED | 684 passed | 1 failed (3s)
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
party row; a NULL-`studio_id` project resolves through `_primary_studio_for`
(M7). **r2 B-3**: a stale `granted` record does not carry a send past this
studio's own STOP; another studio's opted-out party row does **not** block this
studio's `granted` record (the scan stays studio-scoped, or G-3 re-opens); the
stale-record scan resolves a NULL-`studio_id` project through
`_primary_studio_for` too.
`_tests/sms-inbound.test.ts` — STOP writes one `opted_out` record per studio
(two studios, three party rows → two records); YES grants only for the studio
that actually invited; START upserts in place and keeps the earlier `opt_out_at`
and `disclosure_version`; YES does not grant a party row in a studio that never
invited (M6); STOP reaches a NULL-`studio_id` project through
`_primary_studio_for` (M7). **r2 B-3(b)/M-3**: STOP reaches a studio that holds
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
 packages/supabase/src/database.types.ts | 465 ++++++++++++++++++++++++++++++++
 1 file changed, 465 insertions(+)
```

Re-running `db:generate` after the r3r2 round leaves the committed file
unchanged (`git diff --stat packages/supabase/src/database.types.ts` → empty):
both new guards are trigger functions, adding no column and no signature.

465 insertions, **zero deletions**. New table types `studio_channel_consent`,
`studio_contact_channels`, `studio_contact_rules`,
`studio_person_affiliations`; new function types
`backfill_channel_consent_from_parties`, `normalize_channel_value`,
`project_party_designer`, `record_channel_consent`, `record_channel_reconsent`,
`studio_contact_org`; and the fifteen new `studio_contacts` columns. Nothing
else. (Redefining `fc_dispatch_optin_invite` and
`_site_request_consent_granted_dispatch` changes no signature, so neither
appears in the diff.)

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
  real work on first push. **Before that push, dry-run the fold** — run the
  `ranked` CTE from `backfill_channel_consent_from_parties()` as a bare
  `SELECT org, phone_e164, sms_consent_status FROM ranked WHERE rn = 1` against
  prod and read it, so the fold is seen before it is taken (r1 review m14).
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
