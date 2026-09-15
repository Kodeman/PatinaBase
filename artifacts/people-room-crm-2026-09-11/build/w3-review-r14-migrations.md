# W3 (P2) — adversarial migration review, round 14

Worktree `.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`,
head `61a780967`. Local Postgres only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`).
**No prod touched. No server started. No port taken. No migration minted, no product file edited.**

Read in full: `00628`–`00633`; the bodies they re-issue or replace
(`assert_compliance_holder` 00623, `sync_person_affiliation_from_pointer` 00592,
`identity_paper_state` / `rolodex_card_for_party_phone` / `link_rolodex_card_to_parties` 00626,
`update_updated_at_column` 00212); `assert_project_party_cards`, `project_tenant_org`,
`project_recorded_studio`, `compliance_state`, `identity_phone_numbers`, every trigger on
`project_parties` and on `studio_contact_channels`;
`supabase/tests/people/w3_merge_sweep_household_test.sql`; `w3-data-report.md`;
`w3-fix-log-r13.md`; `w3-review-r13-migrations.md`; `rulings.md`; `direction.md`
§3.1/§3.4/§5/§7/§8/§9; `crm-model.md` §4 + CRM-24; `SPEC.md` §5.4/§5.7; `w1a-report.md`,
`w1b-report.md`, `w2a/b/c-report.md`, `w2-review-r15-qa.md`; `briefing/fixture.md` §4.
Also read, because the finding below lands on a face:
`apps/designer-portal/src/components/document/people/reach-access.tsx`.

**Verdict: NOT clean — ONE BLOCKING, zero major, twenty minor.**

Both r13 majors are **FIXED and re-measured**. The blocking finding is fresh: it is r6
BLOCKING-1's own statement, one column short of R-BN.

---

## 1. Gates run this round

| Gate | Result |
|---|---|
| `pnpm --dir … supabase:reset` (full replay + every seed) | **rc=0, clean replay**, head `00633` |
| `people/w1a_identity_channels_consent_test.sql` | rc=0 — "All W1a assertions passed." |
| `people/w1b_compliance_authority_directory_test.sql` | rc=0 — "All W1b assertions passed." |
| `people/w3_merge_sweep_household_test.sql` | rc=0 — "W3 SQL suite: all blocks passed", 11l and 11m (a–f) included |
| `rls/people_directory_scope_test.sql` · `rls/studio_contacts_test.sql` · `rls/project_roster_test.sql` · `rls/anon_table_grant_narrowing_test.sql` · `rls/studio_contacts_backfill_test.sql` | rc=0 each |
| `python3 scripts/generate-legacy-grants.py` | re-run — **no diff** (2766 replayed statements) |
| `SUPABASE_DB_URL=… pnpm db:generate` | **no diff** — no type drift |
| migration numbering | 00628–00633, all above 00627, none inside the reserved 00595–00620 |
| `cron.job` after the clean reset | `compliance-document-expiry-sweep · 0 6 * * * · active`, body `SELECT public.sweep_compliance_expiries();` |
| the sweep actually ran on the restarted stack | `job_runs`: one `skipped` + one `succeeded {"notices":3,"scanned":3,"notified":6}` **186 µs apart** — two concurrent invocations, and the advisory-lock/`job_runs` shape answered exactly as 00574 designs. Three notices on file, six `notification_log` rows across **two** users (the studio's owner and admin) |
| function ACL / `proconfig` sweep over all 21 wave functions (`pg_proc`) | no `anon`, no `PUBLIC`; every DEFINER pins `search_path=public`; `sweep_compliance_expiries` service_role-only; every trigger function postgres/service_role only. One deviation, m3 |
| table ACL + RLS on the three new tables | `studio_contact_merges` / `studio_compliance_notices`: RLS on, `authenticated=r`, SELECT policy only. `client_households`: `authenticated=arwd`, four policies. No `anon` on any of the three |
| `studio_contacts` policy graft vs 00417:219-262 | byte-for-byte 00417 plus `merged_into IS NULL` on exactly the three member clauses; the admin leg deliberately not re-issued. Measured live from `pg_policy` |
| every FK into `studio_contacts` (20, re-enumerated from `pg_constraint`) | each repointed, structurally unreachable, or a declared freeze. `client_households.member_person_ids` (an array, no FK) is repointed too |
| R-AY (record-only consent) | no W3 migration reads or writes `project_parties.sms_consent_*` for a verdict or writes `studio_channel_consent`. Measured: after a fold the survivor's identity reads `opted_out` off the ABSORBED card's number, with no consent write (probe C) |
| `project_consent_org()` callers on a fresh reset | twelve, the enumeration `00628:64-69` gives. See m5 for the one it mis-describes |
| 00628 backfill outcome | 8 projects, 5 still `studio_id IS NULL`, all five ambiguous — R-BD holds, measured |
| 00633 | `client_decisions` 6 rows, all `court='client'`; widened CHECK admits a strict superset |
| cross-tenant sweep (probe B) | studio B's owner reads **0** of studio A's households, merge lineage, notices and cards |
| standing sweep (probe B) | a plain member of A: reads the household (1 row); forging lineage → `permission denied for table studio_contact_merges`; deleting a notice → `permission denied for table studio_compliance_notices`; **erasing** the figure → `household_threshold_forbidden`; **raising** it → `household_threshold_forbidden`; through the RPC → `household_threshold_forbidden` |
| cross-studio household seat (probe B) | a member of BOTH studios cannot seat studio A's household member on studio B's job — refused (see m10) |

### Every r13 finding re-checked

| r13 | State |
|---|---|
| **MAJOR-1** — the merge aborted with `party_studio_contact_other_studio`, the guard's third door | **FIXED.** `probe-r13-a.sql` re-run on a fresh reset: both resolvers still answer non-NULL (the fixture still reproduces), and the merge now answers **`merge_seat_card_other_studio`** with the job in DETAIL. `00629:1590-1642` states the guard's own three legs against the guard's own resolvers, over the EFFECTIVE pointers, over only the seats the merge writes. Block 11l passes, with its control |
| **MAJOR-2** — a firm-duplicate fold moved `project_parties.updated_at` and flipped an uncarded identity's Directory row | **FIXED.** `probe-r13-d.sql` re-run: `seat=fb40…0002 job=LIVE job firm=<NULL> last_touch=2026-09-05` **before and after**. `project_parties_touch_updated_at()` (`00629:1230-1261`) stands down under `patina.suppress_party_touch`, set at `:2380` and cleared at `:2436` with all four seat statements inside. Trigger keeps its 00212 name (verified live), `proconfig {search_path=public}` where 00212's had none, ACL postgres/service_role only. Block 11m a–f passes, including the ARMED negative control and the narrowness control |
| qa owed-1 — the bring-forward acceptance text vs the seed | **RULED** since r13: R-BP (`rulings.md` §3). Not a migration finding |
| m1 · m2 · m3 · m4 · m5 · m6 · m7 · m8 · m9 · m10 · m11 · m12 · m13 · m14 · m15 | **ALL OPEN**, each re-measured or re-read this round. m9 and m10 are widened below |

---

## 2. BLOCKING-1 — a merge DESTROYS `studio_contact_channels.sms_capable`, and the survivor's Reach row then says Patina was never told the line takes texts

**Severity: blocking. Confidence: high (measured on a fresh reset, rolled back; the face traced to source).**

This is r6 BLOCKING-1's own statement, one column short. R-BN, in terms:

> "A merge never deletes a typed fact. Every collision between the absorbed card and the
> survivor reduces onto the survivor before the absorbed row goes: channel status worst-first
> with its date, verified and preferred OR'd, label COALESCEd…"

`00629:1688-1722`'s reduction carries **six** columns — `status`, `status_at`, `verified`,
`verified_at`, `preferred`, `label`. `studio_contact_channels` carries a **seventh** typed
column, and the reduction does not name it:

```
sms_capable  | boolean | not null | false
```

`00629:1724-1730` then DELETEs the absorbed row outright. The value is gone from the table —
not stranded on an unreachable card, gone, which is r6 B-1's own standard.

### Why `sms_capable` is a typed fact and not bookkeeping

00593 says so in its own banner (`00593:381-382`): *"sms_capable STAYS AT ITS `false` DEFAULT
UNLESS THERE IS EVIDENCE."* It is not derivable from the row — `channel_kind` is `mobile` on a
backfilled card whether or not the number is a cell — and W2 gave it the one writer it had
never had. `reach-access.tsx:304-306` names that act:

> "CR13-1: …and the room can say a line takes texts. `sms_capable` had no caller anywhere in
> the build, so a `false` written by 00593's backfill stood for ever."

The act is `useUpdateStudioContactChannel({ smsCapable: true })`
(`use-studio-contacts.ts:953`), pressed from the button labelled **"This line takes texts"**
(`reach-access.tsx:590`). It is exactly as typed as `label` and `preferred`, both of which the
reduction does carry.

### Measured

`artifacts/…/build/probe-r14-a-sms-capable.sql` — fresh reset, one transaction, ROLLBACKed.
crm-model §4 rule 2's canonical duplicate and direction §3.1's duplicate band literal ("These
two cards share a phone."): two live person cards in one studio, both holding a `mobile` row on
`+16125550941`. PR-o pre-picks the older, blanker card as survivor; the studio had pressed
"This line takes texts" on the newer one.

```
A-a BEFORE  absorbed row sms_capable=t  survivor row sms_capable=f
A-b AFTER   survivor row sms_capable=f  (rows left on folded card: 0)
A-c sms_capable WAS DESTROYED by the fold
```

### The face

`reach-access.tsx:290-291`:

```ts
const unconfirmedSmsLine =
  showConsent && isPhoneChannel(String(channel.channel_kind)) && !channel.sms_capable;
```

so after the fold the survivor's Reach row prints, verbatim (`:556-560`, its act at `:565-592`):

> **"Patina has not been told this line takes texts, so nothing about texting can be written
> down on it yet."**

over a line the studio had told Patina takes texts, on the card it just folded in. That is a
wrong fact on a face (SPEC §7; direction §1 line 4 makes this card the record's home).

And it takes an act away. `channelConsentAxis()` (`:137-142`) returns `null` for a phone with
`sms_capable = false`, so `consentable` is false and the whole recording band goes with it —
including **PR-m's manual opt-out**, the one door a studio has for a verbal STOP it heard, which
R-AY makes the only place that fact can live. `reach-access.tsx:271-285` states why that
mattered enough to build CR13-1 in the first place; the fold puts the row back in the state
CR13-1 exists to escape, and the way out is for the studio to re-assert by hand a fact it had
already asserted.

### Blast radius

`sms_capable = true` on **10 of the 21 seeded person mobiles** (measured). The population is
every merge where both cards carry a row on the same `(channel_kind, value)` and their
`sms_capable` disagree — which is the SHARED-PHONE duplicate, the single commonest merge the
room offers and the one direction §3.1's band is written around. No colliding pair exists on
the seeded book today (0 measured), which is exactly why no gate catches it: r6 B-1's own
population, and its own blind spot. Block 10's B-1 pin uses an **email** row
(`w3_…_test.sql:2681-2682`), where `sms_capable` cannot vary.

### Where a fix belongs (not prescriptive)

The reduction's SET list is the natural home — `sms_capable = s.sms_capable OR u.merged_sms_capable`,
beside `verified` and `preferred`, which are the same shape and the same argument. The pin is
block 10's B-1 shape over a `mobile` row instead of an `email` one. Whether any of the row's
remaining untyped columns (`created_by`, `created_at`) belong in the reduction is a separate
question this finding does not open.

---

## 3. Major

**None this round.** Both r13 majors are fixed and re-measured (§1).

---

## 4. Minor

### n1 — NEW: 00628's NOTICE reports the designer-domain-role delta over EVERY stamped project, not the ones it stamped
**minor · high confidence · deploy-relevant.** `00628:178-182`:

```sql
SELECT count(*) INTO v_role_delta
  FROM public.projects p
 WHERE p.studio_id IS NOT NULL            -- every project that has a studio, ever
   AND p.designer_id IS NOT NULL
   AND NOT public.has_designer_domain_role(p.designer_id);
```

and `:184` prints it as *"% **stamped** project(s) have a designer with no designer domain
role"*. The statement above it stamps only `WHERE studio_id IS NULL AND n_orgs = 1`; every
project that already carried a `studio_id` is counted too. The number exists to quantify one
thing — the delta between this file's predicate and `set_project_studio_id()`'s
(`00628:44-50`) — and R-BD / report §10 item 5 owe it to the W7 preflight. Locally both
readings are 0 (3 stamped projects, all with the domain role), so no gate sees it; on Strata it
reports the whole book.

### n2 — NEW: `contact_rule_blocks_contact()` has no caller anywhere, and its COMMENT states a rule the file stopped making at r5
**minor · high confidence · measured.** `00629:909-933` mints the function and grants it to
`authenticated`. Grepped: no caller in `supabase/` (outside 00629's own banner and the
regenerated grants file), none in `apps/`, none in `packages/`. `00629:1425` records why —
r5 M-2 replaced R-BL's hard-block test with subsumption — but the function's own COMMENT still
reads:

> "merge_studio_contacts() **refuses on it** so a recorded block cannot vanish into an absorbed
> card (00629 r4 B-2)."

and §4d's banner says "stated here because the merge **now refuses on it** (r4 B-2)". Neither
is true of the shipped body. A function granted to every authenticated caller whose own record
describes a gate it does not make.

### n3 — NEW: `00631:334` pins its `updated_at` obligation to a test block that does not exist
**minor · high confidence · measured.** *"the pin lives in the SQL suite (w3 **block 12**, w1b
block 21's shape) on seats it stages itself."* The suite has **eleven** numbered blocks
(`w3_…_test.sql` §§1–11) and no block 12; the actual pin is **block 7d**
(`:1904-2103`), which r12's fix log names correctly. A shipped migration banner pointing a
future reader at a block that isn't there.

### n4 — m10, WIDENED and measured: `add_household_member()` raises the guard's raw token on the OTHER-STUDIO door too
**minor · high confidence · measured.** r13 recorded the studio-less half. Probe B measures the
second: a member of studios A and B calls `add_household_member(<A's household>, <A's card>,
'client_rep', <B's job>)` and gets

```
B3 cross-studio seat refused -> party_studio_contact_other_studio
```

**No cross-tenant write occurs** — 00624's guard holds, which is the important half — but the
RPC inserts the seat (`00632:373-380`) before it has resolved any studio at all, so 00624 answers
for it and `asHouseholdError()` knows none of that vocabulary. The household band happens to
call `writeErrorMessage()` (`household-band.tsx:360`), which does carry sentences for
`party_studio_contact_other_studio` and `party_card_project_has_no_studio`
(`write-error.ts:32`, `:57`), so no token reaches the face today. The finding is that the refusal is
the neighbouring file's and not this file's own — `household_grant_project_has_no_studio` is
defined two statements later for one of the same conditions — and that a second reader of this
RPC inherits nothing.

### n5 — NEW: the notice's subject builds a possessive by concatenation
**minor · medium confidence · cosmetic, on a face.** `00630:412-415` and `:439-448` write
`v_holder || '''s paper has lapsed'`. The seeded book's own lapsed holder is **Ostrom
Builders**, so the notification the principal reads is "Ostrom Builders's paper has lapsed."
A notification is a face (the argument `00630:416-425` already makes for `v_paper`).

### m1 — the nightly sweep still announces paper held by a card the studio has PUT AWAY
**minor · high confidence · carried from r10/r11/r12/r13, re-read.** `00630:376-394` carries
`sc.merged_into IS NULL` and no `archived_at` leg, so a lapsed COI on an archived firm card
still writes a notice and an in-app notification to every owner and admin, deep-linking
`/people?firm=<id>` to a card `useStudioContacts(…, { includeArchived: false })` does not
return. 0 archived holders in the seeded book, so no gate sees it.

### m2 — deleting a household, or dropping a member from the array, still orphans the money grants it sourced
**minor · high confidence · carried, structural.** `00632:259-266` (the owner/admin DELETE
policy) and any direct `PATCH member_person_ids` leave open `project_party_authority` rows
carrying `source_clause = 'client_households.co_threshold_cents'` standing with no household
behind them. `set_household_threshold()` (`00632:560-596`) is the only closer and it keys on the
household's own member array, which the delete has already emptied.

### m3 — `resolve_merged_contact()` is still the wave's one function with no pinned `search_path`
**minor · high confidence · carried, re-measured.** `00629:368-385`; `pg_proc.proconfig` is NULL
for it and `{search_path=public}` for the other twenty. SECURITY INVOKER and fully
schema-qualified, so the exposure is narrow — but it is called twice per emitted Directory row
from inside `identity_paper_state()` (`00629:1157-1160`), which is SET-pinned, and the wave's
own stated rule is that every function pins.

### m4 — `w3-data-report.md:132` still says "33 papers in total" where the database says 36
**minor · high confidence · carried, re-measured.** `compliance_document_state()` over all
36 rows: `current` 9, `held` 24, `lapsed` 2, `lapses_soon` 1 = **36**. The four state counts in
the same sentence are right; the total is not.

### m5 — the `project_consent_org()` enumeration still describes one call site inaccurately
**minor · medium confidence · carried, re-measured.** `00628:56-80` and report §6 say all twelve
remaining callers are "the CONSENT LEDGER'S KEY — not a guard and not a reducer".
`00629:2920-2924` is `CASE WHEN public.is_active_studio_member(public.project_consent_org(
q0.project_id)) THEN COALESCE(identity_consent_status(…), 'not_asked') END` — a membership
GUARD on whether the affirmative word renders. The behaviour is right and deliberate (w1b r6
MAJOR-1: it narrows, never widens); the sentence enumerating it is not.

### m6 — two small internal inconsistencies in 00629
**minor · high confidence · carried, re-measured.** `v_merge_id` is declared (`:1282`), assigned
(`:2514`) and never read. And `studio_contact_merges`' COMMENT (`:306-314`) says "a merge that
happened is a fact nobody may forge or take back" beside `GRANT SELECT, INSERT, UPDATE, DELETE
… TO service_role` (`:354`) — true of `authenticated`, not of every writer.

### m7 — `people_directory`'s own COMMENT was not re-issued, so the database's record of the view still describes v4
**minor · high confidence · carried, re-measured.** `CREATE OR REPLACE VIEW` keeps the existing
comment; `obj_description('public.people_directory'::regclass) ~ 'merged_into'` answers **false**.
Neither of §6's two declared deltas (the `merged_into` fold, the TEAM branch's tenant leg)
reaches the object's own record.

### m8 — `identity_paper_state()` runs four recursive walks per emitted Directory row
**minor · medium confidence · carried.** `00629:1156-1170`: two `resolve_merged_contact()`
recursive CTEs (depth cap 16) on top of the two `compliance_state()` walks (depth cap 64) it
already made, on a function called once per CONTACTS row and once per PARTY row. `identity_seats`
was materialised in W1b r11 for exactly this class of cost on the same view; the merged-card
resolution is a no-op for every unmerged card, which is all of them today.

### m9 — WIDENED: `w3-data-report.md` is stale in six more places, and the report is what the W7 preflight reads
**minor · high confidence · carried and widened.**

* `:45` "Refusals, in order: … **Eleven**, not eight" — there are **thirteen**
  (`merge_seat_on_studioless_project`, r11; `merge_seat_card_other_studio`, r13).
* the same line's citations are ~300 lines out: `merge_survivor_archived` is `00629:1370` not
  `:983`, `merge_two_logins` `:1398` not `:1011`, `merge_contact_rule_conflict` `:1479` not
  `:1092`.
* `:41` says `people_directory` is 00626 "plus **one line**"; `:320` and `00629:2600-2610` say
  **two deltas**. The report contradicts itself about a cross-tenant narrowing.
* §1's Objects table and §9's function list omit `project_parties_touch_updated_at()` (§4g,
  r13 MAJOR-2) and `contact_rule_blocks_contact()` entirely.
* §8 says the suite is "12 blocks as of r7"; it is eleven numbered blocks, grown by r11–r13's
  sub-blocks.
* §1's line citations for the merges table (`00629:331`, `:333-334`) name the `ENABLE ROW LEVEL
  SECURITY` line and the SELECT policy, not the DROP/REVOKE/GRANT they describe (`:350-354`).

### m10 — see n4 (widened and measured)

### m11 — 00628's backfill bumps `projects.updated_at` for every project it repairs
**minor · low confidence · carried.** `update_projects_updated_at` is BEFORE UPDATE FOR EACH ROW
on `projects` and `00628:117-122` does not bracket it. Unlike `project_parties.updated_at`,
nothing in this program ranks by `projects.updated_at`; recorded because 00624's stated
obligation is about bulk column rewrites generally and this is one.

### m12 — a notice is SPENT even when nobody was told
**minor · high confidence (mechanism) · narrow population · carried.** `00630:399-409` writes the
`studio_compliance_notices` row and increments `v_notices` first; `:454-486` then writes one
`notification_log` row per **active owner or admin** and never checks that any landed. A studio
whose only active members are plain `member`s has the `(document_id, state, expires_on)` key
permanently consumed while `v_notified` stays 0, and nothing but a date change clears it
(`:290-296`) — so it is never told about that paper at that date again, even after an owner is
added. The symmetric rule the file states one statement earlier ("the notification is written
only where the notice row actually landed, so the two records can never disagree") does not hold
in this direction.

### m13 — after a firm-to-firm fold an uncarded seat's Directory row names the folded card's spelling
**minor · high confidence · carried (measured r13).** The seat's free-text
`project_parties.company_name` snapshot (`00629:2846`, the PARTY branch's meta bag) is deliberately never written by the
merge (`:2394-2396` argues the case for the CROSS fold, where keeping the folded firm's name is
right). On a same-kind firm fold the argument does not carry: the row prints a firm name off a
card the Directory emits no row for, beside a `company_id` that says otherwise. Minor because
the two names are the same firm.

### m14 — 00630's `merged_into` leg describes merge behaviour that r3 replaced
**minor · high confidence · carried, re-read.** `00630:381-392` says
"merge_studio_contacts() leaves an absorbed document on the absorbed card wherever the survivor
holds no successor to retire it (00629 §5, crm-model §4) — correctly". §5 has not done that
since r3 W3-R3-1: `00629:2252-2256` moves EVERY absorbed head unconditionally and `:2263-2273`
walks the lineage behind it, so no document remains on a merged card at all (chains deeper than
16 renewals excepted). The leg is pure defence in depth; the comment states it as load-bearing
and cites a rule that was reversed.

### m15 — `add_household_member()` does not read `archived_at`
**minor · medium confidence · carried, re-read.** `00632:340-348` refuses a card that is
missing, in another studio, not a person, or merged away — but not one the studio has PUT AWAY.
`assert_client_household_members()` (`:123-136`) makes the same four tests and the same
omission. So a card `useStudioContacts(…, { includeArchived: false })` hides can still be made a
household member and seated on a job through the RPC, which is the shape
`merge_survivor_archived` (r5 M-4) exists to refuse one table over.

---

## 5. What was checked and found sound (not findings)

* **The two r13 majors, re-measured on a fresh reset.** §1's table carries the numbers.
* **Merge is transactional and orphans nothing.** All 20 FK columns into `studio_contacts`
  re-enumerated from `pg_constraint`, plus `client_households.member_person_ids` (an array, no
  FK). Each is repointed, structurally unreachable for the kind pair, or a declared R-BN
  standing pointer that `resolve_merged_contact()` / `identity_paper_state()` (§4f) resolve
  forward. `warranty_contact_person_id` has no reader on any face outside tests and is
  repointed anyway.
* **The household, folded.** Probe C: a household holding BOTH ids, the duplicate as primary.
  After the fold `member_person_ids` holds the survivor once, `primary_member_person_id` has
  moved to it, `resolve_merged_contact(dup)` answers the survivor, and `people_directory` emits
  **one** row for the pair.
* **R-AY, measured.** Probe C: the absorbed card's own number carries an `opted_out` record; the
  survivor's identity read `not_asked` before the fold and `opted_out` after, with **no** consent
  write anywhere. `identity_phone_numbers()`'s channel leg is what carries it.
* **No automated external send rides the merge.** `fc_optin_invite_dispatch` is AFTER INSERT OR
  UPDATE on `project_parties` and fires on every seat repoint; its first three guards read the
  frozen consent columns, which the merge never writes, so OLD and NEW are identical and it
  returns before `invoke_edge_function`. `refuse_legacy_consent_write_trg` names phone /
  phone_e164 / the eight consent columns, none of which the merge touches on a seat.
* **The `updated_at` replacement is strictly stronger.** `update_updated_at_column()` is
  SECURITY INVOKER with **no** `proconfig`; `project_parties_touch_updated_at()` is the same
  body plus the stand-down, with `search_path=public` pinned and postgres/service_role-only ACL.
  The trigger keeps its 00212 name, so 00624:806/819, 00626:580/591 and 00631:335/404 still
  bracket the same object (verified live).
* **The two reckonings agree.** `compliance_state()` (00623) and `compliance_document_state()`
  (00630) were diffed leg by leg on the live bodies: same transitive walk, same depth cap, same
  three retirement legs (in force, gates carried, same `doc_type`), same
  `cardinality(blocks) > 0` gate, same 30-day window. The coupling m14's neighbour names is real
  and currently consistent.
* **The sweep's contention path, in the wild.** Two concurrent invocations 186 µs apart on the
  restarted stack produced one `skipped` row and one `succeeded {"notices":3,"scanned":3,
  "notified":6}` — three notices on file, not six, and six notifications across exactly the
  owner and the admin. No `notification_log` row for a plain member.
* **The `studio_contacts` policy graft.** 00417:219-262 byte for byte plus `merged_into IS NULL`
  on the three member clauses; the admin leg not re-issued, held to `archived_at` by
  `assert_merged_into_write()`. Measured from `pg_policy`.
* **Households RLS and PR-n.** Four policies, all carrying the tenant leg beside
  `is_studio_comember()` (the declared narrowing of direction §7's line), owner/admin on DELETE
  and on any write carrying `co_threshold_cents`, plus `assert_household_threshold_principal()`
  reading the CHANGE so an ERASE is refused too. Probe B measures all four doors shut against a
  plain member, including the RPC.
* **Court widening.** Purely additive; 6 live rows, all `client`; `project_tasks.owner`
  deliberately not widened, with the reason stated.
* **R-BD backfill.** `WHERE studio_id IS NULL` is the idempotency; `n_orgs = 1` is the only
  stamp; all five local studio-less projects have an ambiguous designer and stay NULL.
* **The bid columns.** Eight, `date` throughout, money in integer cents with a `>= 0` CHECK, the
  vocabulary as a named CHECK (not an enum), the backfill bracketed and guarded on
  `bid_outcome IS NULL`, and no prior `bid_*` column anywhere in the ledger for the ADD to
  collide with.

---

## 6. Probes written this round

Committed beside this file under `artifacts/people-room-crm-2026-09-11/build/`, all one
transaction and ROLLBACKed, all on a freshly reset database:

* `probe-r14-a-sms-capable.sql` — BLOCKING-1, with the before/after values printed.
* `probe-r14-b-tenant-and-standing.sql` — the cross-tenant sweep, the four household-money
  doors against a plain member, the forged-lineage and notice-delete doors, and the
  cross-studio household seat.
* `probe-r14-c-household-fold.sql` — the household repoint with both ids as members and the
  duplicate as primary, the consent word after the fold, and the Directory row count.

r13's `probe-r13-a.sql` and `probe-r13-d.sql` were re-run unchanged as the two fix controls.
