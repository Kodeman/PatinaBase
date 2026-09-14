# W3 (P2) — adversarial migration review, round 4

Worktree `.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`.
Local Postgres only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`). **No prod touched.
No server started.** Every measurement below was taken in a `BEGIN … ROLLBACK` probe or on a fresh
`pnpm supabase:reset`.

Read in full: `w3-data-report.md`; `00628`, `00629`, `00630`, `00631`, `00632`, `00633`;
`w3_merge_sweep_household_test.sql`; `rulings.md`; `direction.md` §3.1/§3.4/§5/§7/§8/§9;
`crm-model.md` §4 + CRM-24; `SPEC.md` §5.4/§5.7; `w1a/w1b/w2a/w2b/w2c` reports;
`w2-review-r15-qa.md`; `fixture.md` §4; `w3-fix-log-r3.md`.

**Verdict: NOT clean — 3 blocking, 3 major, 8 minor.**

---

## 0. Gates I ran myself

| Gate | Result |
|---|---|
| `pnpm --dir … supabase:reset` (full replay + every seed) | rc=0, head `00633`. The Supabase CLI telemetry write needs `dangerouslyDisableSandbox` — harness, not product |
| `supabase/tests/people/w3_merge_sweep_household_test.sql` | rc=0 — "W3 SQL suite: all blocks passed" |
| `supabase/tests/people/w1a_identity_channels_consent_test.sql` | rc=0 |
| `supabase/tests/people/w1b_compliance_authority_directory_test.sql` | rc=0 |
| `supabase/tests/rls/people_directory_scope_test.sql` · `studio_contacts_test.sql` · `project_roster_test.sql` | rc=0 |
| `python3 scripts/generate-legacy-grants.py` | re-run, **no diff** — the committed file is current |
| `SUPABASE_DB_URL=… pnpm db:generate` | **no diff** — no type drift |
| `cron.job` | `compliance-document-expiry-sweep` · `0 6 * * *` · `SELECT public.sweep_compliance_expiries();` |
| studio-less projects after replay | 5 of 8, all with an ambiguous designer (2 memberships), 0 carrying seats — matches `w3-data-report.md` §6 exactly |

⚠ `pnpm db:generate` truncates `packages/supabase/src/database.types.ts` to 0 bytes when the CLI
fails, because the script is a `>` redirect. It failed once under the sandbox; I re-ran it
unsandboxed and the file is restored byte-identical. Worth knowing before the deploy preflight.

## 0b. Prior findings (`w3-fix-log-r3.md`) — all **FIXED**

| Prior | State | Evidence |
|---|---|---|
| W3-R3-1 every absorbed head moves | fixed | `00629:1098-1157` — three ordered statements; suite blocks 1/1b/1c |
| W3-R3-2 `bid_quoted_by` against the RECORD | fixed | `00631:180-193` refuses on `project_recorded_studio() IS NULL`, card checked against both resolvers |
| W3-R3-3 merged number resolves forward | fixed | `00629:493-523` maps candidates through `resolve_merged_contact()` then re-reads the head |
| W3-R3-4 legacy scalars join the channel union · `identity_phone_numbers()` 3rd leg | fixed | `00629:964-984`; `identity_phone_numbers()` carries the typed-voice-lines leg, no consent read (R-AY holds) |
| W3-R3-5 lineage no longer forgeable | fixed | `00629:325-329`; measured: a plain member's INSERT → `permission denied for table studio_contact_merges` |
| QA-1 picker trade resolver | fixed | `rolodex-picker.tsx:458 tradeFor()` at all three call sites |
| QA-2 390 mini-row name floor | fixed | `party-mini-row.tsx:189,236` — `min-w-[8rem] flex-1 sm:min-w-0`, `flex-wrap sm:flex-nowrap` |
| QA-3 `bring-forward.spec.ts` sheet wait | fixed | `bring-forward.spec.ts:111-113` waits on `[data-doc-sheet-title]` |
| MAJOR-1 firm on every seat the picker creates | fixed | `rolodex-picker.tsx:542,600` both write `firmNameFor(c)` |
| MAJOR-2 unfindable household | fixed | `household-band.tsx:188,275-289` |
| MAJOR-3 raw refusal tokens | fixed | four catches route through `writeErrorMessage()` |
| MAJOR-4 merge sentence | fixed as written — but see **B-3** below, which is the *new* half of the same sentence |

Also re-verified green: non-member merge refused; cross-tenant seat through
`add_household_member()` refused (`party_studio_contact_other_studio`); plain member refused
archive (`studio_contact_archive_forbidden`), threshold erase (`household_threshold_forbidden`),
household delete (0 rows), hand-set `merged_into` (`studio_contact_merge_pointer_forbidden`),
notice insert and `sweep_compliance_expiries()` (`permission denied`); an outsider reads 0
households, 0 notices, 0 merge rows and `resolve_merged_contact() → NULL`. Sweep recipients are
exactly the active `owner`/`admin` of the **holding** org (6 rows over 3 notices, checked
per-document); a second run writes 0 notices and 0 notifications. No W3 migration reads or writes
a consent table or a frozen `sms_consent_*` column.

---

# BLOCKING

## B-1 · A merge throws away the person's Patina account, and the reach word lies

`00629:929-1268` (`merge_studio_contacts()` repoints channels, affiliations, rules, paper,
designations, seats, bid pointer, household — **and never `studio_contacts.profile_id`**);
`people_directory` CONTACTS branch `00629:1837`
(`reach_state_for_identity(sc.profile_id, sc.id::text)`); `reach_state_for_identity()` leg 1 is
`WHEN p_profile_id IS NOT NULL THEN 'account'`.

crm-model §4 rule 1 makes `profile_id` the **proof**-strength identity key, and the state table on
the same page says a text-only sub who later gets an account has `profile_id` written **on the
person card**. PR-o pre-picks the **older** card as survivor, and
`compare-merge-sheet.tsx:63-70 preferredSurvivorId()` implements exactly that — so the default
pick is precisely the card that predates the account.

**Measured** (fresh reset, `$TMPDIR/w3r4/p1.sql`): two cards for one human, the newer carrying
`profile_id`. Before the merge the Directory row reads `reach_state = account`. After
`merge_studio_contacts(old, new, 'manual')`:

```
AFTER | Chidi Old | profile_id = (null)      | merged_into = (null)
AFTER | Chidi New | profile_id = a0…0005     | merged_into = fa1…000a
directory rows for this human → person_id Chidi Old · reach_state = on_paper · profile_id (null)
```

One row, and it says `On paper` over a human who is signed in to Patina. Direction §3.8 makes
`Account` a reach word the studio acts on; §3.4 SPEC §5.4 #5 prints it on the Call Sheet's client
side; PR-k's whole point is that an account is "optional and additive" — a merge may not subtract
it. The login itself is not lost from the database, but it is unreachable from the room: the card
that holds it emits no Directory row, no picker entry, and no `?person=` target (see B-3).

Same statement, same loss: the survivor's `email` column on `people_directory` goes back to the
survivor's own (blank here), so the Directory row's address disappears too; only the Channels
region (which reads `studio_contact_channels`) still shows it.

**Fix**: repoint `profile_id` onto the survivor when the survivor has none (and refuse, named,
when both cards carry *different* logins — that is a real conflict the studio must rule on), or
reduce `reach_state` over the identity's merged lineage rather than the survivor's own column.

## B-2 · A merge silently drops a "do not contact" block, and the sheet says it moved

`00629:1022-1031` — the merged card's contact rule is repointed **only** `AND NOT EXISTS (a rule
on the survivor)`; otherwise it stays on the absorbed card as "history".
`compare-merge-sheet.tsx:99-100` tells the studio, without qualification:
`"<merged>'s seats, channels, contact rule and firm designations move onto <survivor>"`.

**Measured** (`$TMPDIR/w3r4/p11.sql`), survivor carrying a benign rule, duplicate carrying the hard
block:

```
BEFORE survivor rule      | Use: email, mobile.
BEFORE dup rule           | Do not use: after_hours, dispatch, email, mobile, office.
AFTER  survivor rule      | Use: email, mobile.
rules left on merged card | 1
```

After the merge, `contact_rule_summary()` — which feeds the Directory row, the roster row, the
person card and the company-card crew line (R-S, R-BL, C29) — reads "Use: email, mobile" for a
human the studio recorded as do-not-contact. The block sits on a card no surface opens. This is
Leah task 4's acceptance criterion inverted ("Every attempted contact and every future pick shows
'write Rosa instead'"), and it is the same class of harm C30 ruled on for an opt-out: the cost of
a missed refusal is a compliance violation, so it may not hide.

Nothing in the room warns: the sheet's sentence asserts the opposite, and W4's Compare & merge has
no field-level pick to offer (the RPC takes three arguments and none of them is a field choice).

**Fix**: carry the **stricter** rule forward (a `channels_forbidden` / `route_to_person_id` rule
outranks a permissive one), or refuse the merge with a named refusal when both cards carry a rule
and one of them blocks, so the studio rules on it — and make the sentence conditional either way.

## B-3 · "…so an old link still opens this person" is false in this build

`compare-merge-sheet.tsx:105`; `00629:1858-1866` (`people_directory` CONTACTS branch gains
`AND sc.merged_into IS NULL`); `packages/supabase/src/hooks/use-people.ts:290-305`
(`usePerson()` = `from('people_directory').eq('person_id', personId)`);
`apps/designer-portal/src/components/document/people/people-room.tsx:240-254`
(`?person=<id>` → `setOpenPerson({id: person, …})` → `usePerson(id)`).

`resolve_merged_contact()` exists and is granted to `authenticated`, but **no reader in the repo
calls it**:

```
$ grep -rn "resolve_merged_contact\|resolveMergedContact" apps/designer-portal/src packages/supabase/src
packages/supabase/src/hooks/use-studio-contacts.ts:60   (a comment)
packages/supabase/src/hooks/use-studio-contacts.ts:1809 (a comment)
```

`useStudioContacts` additionally filters `.is('merged_into', null)`
(`use-studio-contacts.ts:215`). So a bookmarked, emailed or cross-linked `/people?person=<old id>`
— the exact thing the sentence promises — opens an empty card. The sheet is live, not a specimen:
`directory-view.tsx:70,526` mounts `CompareMergeSheet` from the duplicate band.

**Fix**: resolve `?person=` / `?firm=` through `resolve_merged_contact()` before opening (one RPC
call in the deep-link effect), or delete the clause until W4 wires it. The sentence is on a face
today; the promise is not.

---

# MAJOR

## M-1 · The sole-proprietor fold — crm-model §4's one permitted cross-kind merge — aborts on any firm that has renewed its paper

`00629:1158-1170` (the `ELSE` branch: **one unordered** `UPDATE … SET holder_id = p_survivor …
WHERE holder_id = p_merged`), against `00629:1124-1157` (the same-kind branch, deliberately split
into three ordered statements for exactly this reason — r2 B2-2's own banner at `00629:1085-1097`).

`assert_compliance_holder()`'s **structural** leg `compliance_successor_other_holder`
(`00629:694-699`) requires `superseded_by` to name a document held for the **same** `holder_id`.
`v_retiring` (the r2/B2-2 fix) only suppresses the two *time-varying* legs; this one always runs.
In the cross-kind branch the whole chain moves in one statement, so whether the merge survives
depends on the order the executor reaches the rows in.

**Measured, deterministic** (`$TMPDIR/w3r4/p10.sql` — a sole proprietor, their one-man firm, and a
COI renewed once, with a probe trigger printing the order):

```
NOTICE: probe: moving fc4…0001 (pred of fc4…0002); successor holder currently fc2…000a  <- still the firm
NOTICE: MERGE FAILED: compliance_successor_other_holder
```

The identical construction returned `MERGE OK` on other runs — it is order-dependent, so it will
pass a suite and fail on a real book. The failure mode is the one r2 B2-2 already described: Leah's
"Compare & merge" on that pair fails every time with a schema token naming nothing she did, and
there is no path in the room past it. F-11 Dana Kowalski — "owner-operator", "Sole proprietor",
holding the fixture's only lapsed-then-renewed certificate — is the motivating case.

**Fix**: give the cross-kind branch the same-kind branch's shape — move the heads
(`superseded_by IS NULL`) first, then walk the retired rows outermost-first in the depth-capped
loop. The `holder_type` rewrite rides along unchanged.

## M-2 · The wave report tells Fable a cross-tenant name leak is unfixed, and 00629's own §6 banner says the view changed by one line — both are wrong

`00629:1320-1323` ("Grafted from 00626:1388-1909 verbatim, with **ONE** line added to the CONTACTS
branch's WHERE. Every branch, every predicate … are 00626's byte for byte") against
`00629:1758-1768`, which adds the tenant leg to the **TEAM** branch; and
`w3-data-report.md` §7 "The finding that is owed, not fixed … **Reported for Fable, not changed**"
plus §10.1 "The TEAM-branch tenant leg (§7). A ruling, not a defect fix. **Owed to Fable.**"

Code-only diff of the two view bodies (comments stripped) returns exactly two deltas:

```
@@ TEAM branch
+AND ( public.is_active_studio_member(public.project_tenant_org(tm.project_id))
+OR pj.designer_id      = (select auth.uid())
+OR pj.lead_designer_id = (select auth.uid())
+OR pj.created_by       = (select auth.uid()) )
@@ CONTACTS branch
+AND sc.merged_into IS NULL
```

So a visibility narrowing that changes who reads a studio's teammate names, job titles and staff
roles shipped in this wave, and the deliverable Fable reads says it did not. Fable cannot rule on
a change it is told was deferred, and the report's §8 gate table certifies a different artefact
than the one on disk.

Two more drifts in the same report:

* §10.4 lists "the travel-list picker (SPEC §5.7, R-BM)" as owed to W4 — but R-BM rules it **W3
  scope**, and `apps/designer-portal/src/components/document/roster/travel-list-pane.tsx:44-56`
  already renders "What travels" / "What stays behind" beside a multi-select picker with
  "Put back" (`rolodex-picker.tsx:876`).
* §3's column table lists **five** bid columns; `00631:53-62` adds **eight** — `bid_asked_at`,
  `bid_quoted_at` and `bid_selected_at` (and their backfill legs) are absent from the report's
  "Written / Not written" tables while `00631:307-372` writes two of them.

**Fix**: bring `w3-data-report.md` §3, §7, §10.1 and §10.4 and `00629`'s §6 banner onto the record,
and hand Fable the TEAM-branch narrowing as a change made, not a question parked.

## M-3 · A merge strands the absorbed firm's live agreement links where no People-room door can reach them

`merge_studio_contacts()` repoints four `project_parties` pointers, three `studio_contacts`
designations, channels, affiliations, rules, paper and the household array — but **not**
`studio_trade_agreements.contact_id` or `studio_trade_agreement_tokens.contact_id`, the only two
FK columns into `studio_contacts` that a firm merge leaves behind (FK census below).

`access_grants_trade_agreement_links()` keys those tokens on
`subject_type = 'contact', subject_id = a.contact_id`, and
`company-card.tsx:373-389` passes `firmGrantSubjectIds = [card.id]` — the **survivor's** id — into
`ReachAccess`. Direction §5.1's company variant says "Access grants lists firm-scoped tokens
only", and `agreement_link` is the one tier keyed on a firm (the file's own CR7-2 comment says
so). After the merge the survivor's company card lists none of the absorbed firm's live agreement
links, and the card that does key them emits no Directory row, so the People room's Revoke can no
longer close a door that is still open.

FK census (`pg_constraint`, `confrelid = studio_contacts`), unrepointed columns only:

```
agreement_draw_lien_waivers.contact_id        (ON DELETE SET NULL)
studio_trade_agreements.contact_id            (ON DELETE SET NULL)
studio_trade_agreement_tokens.contact_id      (ON DELETE CASCADE)
```

Confidence is medium on the consequence only because the agreements room may still list a token
under its own agreement; it is high on the data fact and on the company card.

**Fix**: repoint all three in the same transaction (a firm survivor for the agreement tables, and
the cross-kind fold too), or state on the company card that the absorbed card's agreements did not
travel.

---

# MINOR

## m-1 · `people_directory`'s view COMMENT was not re-issued and is now stale

`00629:1324` uses `CREATE OR REPLACE VIEW`, which preserves the existing comment, and `00629` never
re-states it. Measured: `obj_description('public.people_directory')` still reads "v7 (00626 …)" and
`ilike '%merged%'` is **false** — the one durable description of the room's central view says
nothing about `merged_into` or the TEAM tenant leg. Every prior wave in this program re-issued the
comment with the view.

## m-2 · `00630`'s justification for the `merged_into IS NULL` sweep leg is stale

`00630:245-256` argues the leg is needed because "merge_studio_contacts() leaves an absorbed
document on the absorbed card wherever the survivor holds no successor to retire it … correctly".
r3 W3-R3-1 reversed exactly that: every absorbed document now moves. The leg is still worth keeping
(rows past the depth-16 cap, and any pre-00629 pointer), but the reason on the file is the rule
that was overturned.

## m-3 · `resolve_merged_contact()` pins no `search_path`

`00629:343-360` — `LANGUAGE sql STABLE`, no `SET search_path`, granted to `authenticated`, while
its two siblings in this family (`compliance_state()` 00623, `compliance_document_state()`
`00630:64`) both pin it. Every relation inside is schema-qualified, so there is no live exploit;
it is a consistency gap in a function called from inside a SECURITY DEFINER body
(`rolodex_card_for_party_phone()`, `00629:508`).

## m-4 · Both depth caps silently strand rows rather than refusing

`00629:1137` (the compliance walk, `FOR i IN 1..16`) and `00629:357` (`h.depth < 16`). A supersede
chain deeper than sixteen leaves its tail on the absorbed card, where `00630:257`'s sweep, all
three pickers and `people_directory` skip it — the same invisibility r3 W3-R3-1 was written to
close, just past the cap. Cheap fix: `RAISE` when the loop exits at 16 with rows still matching.

## m-5 · The sweep's possessive reads "Ostrom Builders's paper has lapsed"

`00630:277-279`. Measured on the seeded book:
`subject = "Ostrom Builders's paper has lapsed"`. SPEC §7 / §5.7 #8 hold notification copy to the
room's own voice, and a notification is a face.

## m-6 · The merge RPC offers no field-level pick, and the sheet says nothing about what the survivor's own columns overwrite

`merge_studio_contacts(p_survivor, p_merged, p_matched_on)`. Every scalar on the absorbed card —
`specialties`, `trades`, `studio_verdict`, `is_sole_proprietor`, `do_not_contact`,
`company_kind`, `reach_preference` — is dropped with no face saying so, and PR-o's "which card
survives" is the studio's only lever. B-1 and B-2 are the two cases where that silence is a
defect; the rest is a design gap W4's sheet cannot close without a new RPC argument. Naming it here
so it is a decision rather than an omission.

## m-7 · `client_households_studio_delete` drops the co-member leg its three siblings carry

`00632:259-266` gates DELETE on `is_active_studio_member(organization_id) AND
is_org_admin_or_owner(organization_id)`, while SELECT/INSERT/UPDATE (`00632:223-257`) all carry
`is_studio_comember(designer_id)` beside the tenant leg. An owner/admin of the household's org may
therefore delete a household whose designer of record they share no studio with. Defensible, but
it is an asymmetry the file's own §RLS banner does not mention.

## m-8 · Sweep residue was left on the shared local database, contrary to the r3 fix log

Before my reset the DB carried 3 `studio_compliance_notices` rows, 6
`notification_log` rows of type `compliance_document_expiry` addressed to the seeded owner and
admin, and 4 `job_runs` rows for `compliance-document-expiry-sweep` (one `skipped`).
`w3-fix-log-r3.md` states "residue reset away afterwards (0 notices, 0 job_runs on the DB left
behind)". The other program shares this Postgres. Cleared by my `supabase:reset`; flagged because
the claim and the database disagreed.

---

## Checked and clean

* **Merge is one transaction and cannot orphan a channel, a document or a seat.** Channels
  deduplicate then repoint with `owner_type` rewritten (`00629:929-984`, `assert_channel_owner_kind`
  satisfied); every absorbed document moves head-first (`00629:1124-1157`); every seat pointer —
  `studio_contact_id`, `company_id`, `warranty_contact_person_id`, `bid_quoted_by_person_id` — is
  repointed under the merged-card guard (`00629:1187-1228`). `fc_optin_invite_dispatch` does **not**
  re-fire on the seat repoint (its `OLD`-already-pending leg returns first), so a merge sends
  nothing.
* **No company into a person** except crm-model §4's sole-proprietor exception, in one direction,
  stated twice — in the RPC (`00629:916-927`) and in the pointer trigger (`00629:181-189`), so
  service_role and a repair script are held to it too.
* **`merged_into` is unforgeable.** Two policy legs plus `assert_merged_into_write()` with the
  00594 GUC door; measured refusal as a plain member; the FK's `ON DELETE SET NULL` carve-out is
  correctly narrowed to "the survivor no longer exists".
* **`assert_compliance_holder()` graft is faithful** — diffed against `00623`: three added lines
  (`v_retiring` and its two guards), seven legs in the same order, every HINT byte for byte.
* **`studio_contacts_member_insert` / `_update` graft is faithful** — diffed against `00417:224-247`,
  one predicate added to each of three clauses; the admin leg correctly not re-issued.
* **The sweep** takes `pg_try_advisory_xact_lock`, writes one `job_runs` row per invocation, skips
  on contention, swallows its own exception without re-RAISE (00300/00574 idiom), is
  service_role-only, is idempotent on `(document_id, state)` and notifies owners and admins of the
  **holding** studio only. The cron is guarded by the `EXISTS` unschedule, the body is
  schema-qualified, and the registry COMMENT is the only exception-swallowing block.
* **`compliance_document_state()`** agrees with `compliance_state()` on the 30-day window, the
  `cardinality(blocks) > 0` gate and R-BF's transitive walk (bodies compared side by side).
* **00633** is purely additive; `court` was `client` on all seeded rows and the widened CHECK is a
  strict superset. `project_tasks.owner` correctly untouched.
* **00628** stamps nothing where the designer holds zero or several active design-studio
  memberships, fires rather than bypasses `set_project_studio_id()` (which takes its
  `v_postgres_migration` return under `db push`), and is idempotent on `studio_id IS NULL`.
* **`project_consent_org()`** — I re-enumerated the twelve callers; every one is the consent
  ledger's key, and grafting them onto the caller-relative `project_tenant_org()` would make one
  number read two verdicts. R-BD's retirement is scoped to guards and reducers and W1b finished
  that half. Correct as shipped, and the reasoning is on the file (`00628:56-85`).
* **R-AY holds throughout**: no W3 migration reads or writes `studio_channel_consent`,
  `record_channel_consent()` or a frozen `project_parties.sms_consent_*` column. The only mention
  is the party branch's `meta.sms_consent_status`, which carries the record's own word from 00594.
* **Money is integer cents** (`co_threshold_cents`, `bid_amount_cents`), both with `>= 0` CHECKs;
  vocabularies are named CHECK constraints, not enums; all six files carry a banner with LINEAGE
  and are idempotent; every SECURITY DEFINER function pins `search_path` and carries
  `REVOKE ALL FROM PUBLIC, anon` with explicit grants both directions.
