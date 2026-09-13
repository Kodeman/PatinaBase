# W1b — final review, round 16: tests, types, behaviour

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`, branch
`build/people-room-crm-2026-09-11`. Local DB only
(`postgresql://postgres:postgres@127.0.0.1:54322/postgres`, this wave's sole owner for this
session). **Nothing touched on Strata.**

**Verdict: CLEAN. Zero BLOCKING, zero MAJOR.** Every prior finding through r15 checked and
confirmed fixed; no new finding survived independent probing this round.

## 0. Prior fix log (r15) — re-checked

`w1b-final-fix-log-r15.md` claimed two MAJOR fixes. Both independently re-run this round, not
just re-read:

- **MAJOR-1** (`00593_studio_contact_channels.sql`, `assert_studio_contact_identity_stable`, the
  sixth holder / R-AR) — ran `build/probe58-r15-major1-negative-control.sql` fresh. TX1 (pre-fix
  body restored) still reproduces the hole (`*** CARD MOVED TO THE SECOND STUDIO — no guard
  fired ***`, identity row left reading `not_asked` over the record's own `opted_out`); TX2 (shipped
  body) refuses the move (`studio_contact_identity_held`, hint counts `1 seat(s) stamped with this
  card`), a restatement still writes, closing the seat reopens the door. Output matches the fix
  log's pasted transcript line for line. **FIXED, confirmed.**
- **MAJOR-2** (`00626_people_directory_v4_seats.sql`, contacts branch → `reach_state_for_identity`,
  R-BG) — ran `build/probe59-r15-major2-negative-control.sql` fresh. OLD `reach_state_for(profile,
  card, NULL)` still reads `field_link` for a foreign seat; NEW `reach_state_for_identity` reads
  `on_paper`, the Directory row reads `on_paper | seat_count 0`, and the control (a seat + live link
  on the card's own studio's job) still reads `field_link`. **FIXED, confirmed.**

Both SQL suites this round: `w1a_identity_channels_consent_test.sql` (block 47, the MAJOR-1
regression) and `w1b_compliance_authority_directory_test.sql` (block 25, the MAJOR-2 regression)
both pass — see §1.

## 1. Every SQL test under `supabase/tests/people`, full output

```
$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w1a_identity_channels_consent_test.sql
...
NOTICE:  45. a moved seat's parked request no longer aborts the consent write, and resend asks the record (final-run MAJOR-3, MAJOR-1): passed
NOTICE:  45h. a release that raises is a warning, not an aborted consent act (final-run MAJOR-3): passed
NOTICE:  46. the opted_out phone freeze asks the RECORD ... (r14 BLOCKING-1): passed
NOTICE:  47. a seat stamped with the card holds it ... (r15 MAJOR-1, R-AR): passed
NOTICE:  All W1a assertions passed.
ROLLBACK
$ echo EXIT=$?
EXIT=0

$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w1b_compliance_authority_directory_test.sql
...
NOTICE:  18. 00627's four DEFINER readers on a studio-less job ... (r9 BLOCKING-1): passed
NOTICE:  19. the supersede is re-reckoned at every READ ... transitive ... (r9 MAJOR-1 / r10 MAJOR-1): passed
NOTICE:  20. studio_contact_id is guarded like the rest of the R-AP family ... (r9 MAJOR-2): passed
NOTICE:  21. 00624's stage backfill ... (r12 MAJOR-1): passed
NOTICE:  22. the auto-link keeps one human one identity IN THE RECORD ... (r12 MAJOR-2): passed
NOTICE:  23. the auto-linked seat prints the identity's paper word ... (r13 MAJOR-2 / r13 MAJOR-1 residue): passed
NOTICE:  24. the reach word reduces over exactly the seats the row nests ... (r14 MAJOR-1): passed
NOTICE:  25. the CONTACTS branch's reach word reduces over the seats the row nests ... (r15 MAJOR-2): passed
NOTICE:  All W1b assertions passed.
ROLLBACK
$ echo EXIT=$?
EXIT=0
```

Run twice: once on the pre-existing stack, once immediately after a full `pnpm supabase:reset`
(§4), and once more after replaying all five W1b migration files over the populated database
(§5) — identical pass, `EXIT=0` all three times, 47 and 25 blocks respectively.

## 2. Types regenerate clean — with one flagged tooling flake

```
$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
    pnpm --dir .../agent-people-build db:generate
$ git -C .../agent-people-build diff --stat packages/supabase/src/database.types.ts
(empty)
```

Confirmed empty on the final run. **One thing worth flagging, not a code finding:** the very first
invocation of `pnpm --dir ... db:generate` in this session silently wrote an EMPTY-schema
`database.types.ts` (`public: { Tables: { [_ in never]: never } ... }`, 179 lines, `git diff --stat`
showing 38 016 deletions) even though the underlying `supabase gen types typescript --db-url ...`
exit code was 0 and printed no error — only the CLI's own "new version available" notice. Running
the exact same `pnpm db:generate` command again immediately after produced the correct 38 186-line
file with a clean (empty) diff, and a third run after a full reset was clean again. Calling the
`supabase` CLI binary directly (`npx supabase gen types typescript --db-url ... --debug`) on the
same connection also succeeded every time, showing a normal SCRAM handshake against port 54322.
This reproduced once out of four `db:generate` invocations this round and never reproduced under
direct CLI invocation — it looks like a transient hiccup in the pnpm-wrapped shell redirection
(`> src/database.types.ts` racing something), not a defect in the migrations or the generator's
inputs. Filed as a MINOR/environment note, not a finding against the branch: **always run
`git diff --stat` after `db:generate` and re-run if it comes back non-trivially large — don't trust
a bare exit code.**

`pnpm --filter @patina/supabase type-check` → clean, no output, exit 0.
`pnpm --filter @patina/designer-portal type-check` → clean, no output, exit 0.

## 3. Role probes — designer, a real client account, anon, and a genuine cross-tenant studio member

The brief named "a client account" — I used the actual `client@patina.dev` seed row
(`a0000000-…-0005`, the `homeowner`/`client` role in `dev-accounts.sql`), not an arbitrary other
account, since PR-w's own probe in `probe58-w1b-directory-as-designer.sql` tests with
`a0000000-…-0001` (which `dev-accounts.sql` names `uid_superadmin`, not the client) — that probe is
still a valid negative control (a superadmin is also not a studio co-member), but it is mislabeled
in its own `\echo`. Not re-litigating it as a finding (PR-w's RLS has no client branch at all, so
*no* non-member reads it, labelled correctly or not), but noting the mislabel for whoever next edits
that probe file.

```sql
SET LOCAL role = 'authenticated';
SELECT set_config('request.jwt.claims', json_build_object('sub','<uid>','role','authenticated')::text, true);
```

**As designer@patina.dev (Local Dev Studio owner):**
```
             obj             | count
-----------------------------+-------
 people_directory            |    62
 people_directory_seats      |    31
 project_party_authority     |    11
 project_site_access_cards   |     1
 studio_compliance_documents |    36
 v_access_grants             |    13
```

**As client@patina.dev (real client/homeowner account, `designer_clients.client_id` for two
designers including Leah, but a studio member of neither Local Dev Studio nor Leah Hartwell org):**
```
             obj             | count
-----------------------------+-------
 people_directory            |     0
 people_directory_seats      |     0
 project_party_authority     |     0
 project_site_access_cards   |     0
 studio_compliance_documents |     0
 v_access_grants             |     0
```
Zero across all six objects — confirms PR-w (no client leg) and R-BB (consent reduces over the
studio's own records, gated on studio membership, never open to a non-member) hold for a real
client-role account, not just a vacuously-unrelated uid.

**As anon:**
```
NOTICE:  project_site_access_cards: permission denied (expected)
NOTICE:  studio_compliance_documents: permission denied (expected)
NOTICE:  project_party_authority: permission denied (expected)
NOTICE:  people_directory_seats: permission denied (expected)
NOTICE:  v_access_grants: permission denied (expected)
ERROR:  permission denied for table studio_contacts
HINT:  Grant the required privileges to the current role with: GRANT SELECT ON public.studio_contacts TO anon;
```
All five tables/views refuse anon at the grant. `people_directory` itself is `security_invoker`
with `anon_select=t` at the view level (the pre-existing local-only `00-legacy-grants.sql` blanket,
named in the w1b report as "one pre-existing artefact, not mine") but querying it as anon still
**errors** (permission denied on the underlying `studio_contacts`), rather than silently returning
rows — confirmed fail-closed, matching the report's claim in substance (the report says anon "reads
nothing through RLS"; empirically it reads nothing because the query raises before RLS is even
reached, which is at least as safe).

**As a genuine cross-tenant studio member** (`cf100000-…-0001`, owner of "Phase One Synthetic
Studio", a member of neither Local Dev Studio nor Leah Hartwell — a real second-tenant probe, not
just an unaffiliated uid):
```
 people_directory rows w/ Local Dev org meta                    | 0
 project_site_access_cards on Okonkwo/Lindqvist                 | 0
 studio_compliance_documents (any)                               | 0
 project_party_authority on Okonkwo/Lindqvist                    | 0
```
Confirms tenant isolation independent of the client-vs-studio-member axis above.

## 4. Fixture words — F-11, F-12, F-16, F-27, checked against `briefing/fixture.md`

Queried live as `designer@patina.dev` against the seeded Okonkwo/Lindqvist fixture (post-reset,
§4 below).

| # | Person | `reach_state` | `consent_status` | `paper_state` | Fixture says | Match |
|---|---|---|---|---|---|---|
| F-11 | Dana Kowalski | `field_link` | `granted` | `lapsed` | COI lapsed 2026-03-31; consent granted (2025-05-02, carried by phone) | **Yes** — `lapsed` is exactly right (30-day window is long past); two seats nest beneath the one identity row (`seat_count 2`), Lindqvist seat itself reads `on_paper`/warranty, Okonkwo seat reads `field_link` — the identity row takes the best (`field_link`) per PD-12's reduction |
| F-12 | Pete Rusk | `field_link` | `opted_out` | `current` | STOP on the Lindqvist thread; Okonkwo row *created* `not_asked`, COI exp 2027-01-15 (not lapsed) | **Yes** — the identity's `consent_status` reads the record's own verdict (`opted_out`, phone-scoped, R-AY/R-AU), not the stale per-seat `not_asked` the fixture's *problem* narrative (G-3) describes; that G-3 gap is exactly what this program's consent-record work retires. `paper_state=current` matches (2027-01-15 has not lapsed). Both seat lines individually: Lindqvist `on_paper`/`opted_out`, Okonkwo `field_link`/`opted_out` — the phone-global refusal follows him onto the new job as designed |
| F-16 | Amara Osei | `on_paper` | `granted` | `lapses_soon` | "on paper (would be `account` if the FK were set)"; COI/W-9 yes, Lakeshore's cert deliberately `CURRENT_DATE+23` | **Yes** — `on_paper` (not `account`) confirms G-5's documented gap (`project_parties.profile_id` never written for her) is still honestly unresolved, exactly as fixture and report §6 say it should be; `lapses_soon` confirms the moving 23-day window is live. `profile_id` on the Directory row reads NULL, consistent |
| F-27 | Ray Thao | `on_paper` | `not_asked` | `not_on_file` | AHJ inspector, phone/email only, never texted, no paper owed | **Yes** — `not_on_file` is the correct underlying fact (a lender/AHJ is never asked for paper, C13/R-A); the *display* rule that hides this word for lenders/inspectors is a UI decision (R-A/C13/C24) the view deliberately does not encode (SQL block 12g asserts the split), so the raw fact reading `not_on_file` here is correct, not a leak. `contact_rule_summary` reads "Never text. Use: email, office, portal_311. Hours: Weekdays 08:00 to 16:00." exactly as fixture describes |

All four match the fixture's *target* state (the state this program's rulings establish), not the
fixture's *pre-fix problem* narrative — which is the correct thing to match, since G-3/G-5/G-14 are
named-and-retired gaps, not acceptance criteria.

## 5. The seed runs on reset — reproduced live, twice

```
$ pnpm supabase:reset
... 27 "Applying migration ..." lines ending 00627, then 20260910152111 ...
Seeding data from supabase/seed/people_crm_dev.sql...
Seeding data from supabase/seed/99-local-edge-settings.sql...
Finished supabase db reset on branch main.
{"target":"local","version":"","message":"Reset local database."}

$ psql ... -At -c "select count(*) from supabase_migrations.schema_migrations;"
555
```
Run twice this round (once before the role/fixture probes, once after replaying all five W1b
migration files individually — §7) — identical, `RESET_EXIT=0` both times, ledger `555` both times.
`config.toml` confirmed: `[db.seed].sql_paths` and `[remotes.staging.db.seed].sql_paths` both carry
`./seed/people_crm_dev.sql` (lines 60 and 88), matching the derivation-rule comment (staging = local
minus `00-legacy-grants.sql` and `99-local-edge-settings.sql`, plus `cloudflare-phase1-staging.sql`)
— no drift between the two arrays beyond what the comment documents.

## 6. A client role cannot see `project_site_access_cards` — confirmed, with the strongest test available

Beyond §3's zero-row read as `client@patina.dev`, I read the LIVE policy definitions from
`pg_policies` (not the migration file, per the "probe the object" rule) to confirm what's actually
enforced post-reset:

```
project_site_access_cards_studio_select | SELECT | (is_active_studio_member(project_recorded_studio(project_id)) AND is_studio_comember(project_designer(project_id)))
project_site_access_cards_studio_insert | INSERT | ... same, as WITH CHECK
project_site_access_cards_studio_update | UPDATE | ... same, both USING and WITH CHECK
project_site_access_cards_studio_delete | DELETE | ... same, as USING
```

This is the double-gated form from r5 MAJOR-3 / r6 MAJOR-1 / r8 BLOCKING-1 (tenant-first via
`project_recorded_studio()`, ANDed with `is_studio_comember(project_designer())`) — **not** the
single-predicate form `w1b-report.md`'s own `probe57-w1b-objects.sql` §3 output shows
(`is_studio_comember(project_designer(project_id))` alone). That report probe output is stale
(captured before the r5–r8 hardening rounds); the live policy is the hardened one. No client leg
exists in any of the four policies, `anon` is revoked at the grant (§3), and there is no
`show_to_client` column on this table to construct one from (probe: `code_like_columns = 0` also
covers this — confirmed via `\d project_site_access_cards` showing no such column).

## 7. Idempotence / replay

```
$ for f in 00623 00624 00625 00626 00627; do
    psql ... -v ON_ERROR_STOP=1 -f supabase/migrations/${f}_*.sql
  done
```
All five replayed clean over the already-populated, already-reset database — `EXIT=0` each,
`DROP POLICY`/`CREATE POLICY`, `CREATE OR REPLACE FUNCTION`, `REVOKE`/`GRANT` idioms throughout, no
error. Both SQL suites re-run immediately after and still pass (§1).

## 8. Every reader of `people_directory` / `v_project_roster` columns — apps and packages

**`people_directory`** (grep for the literal string, `apps/` + `packages/`, `*.ts`/`*.tsx`):

Actual live readers (issue a query against the view, directly or via the two hooks):
- `packages/supabase/src/hooks/use-people.ts` — `usePeopleDirectory()` and `usePerson()`, both
  `select('*')` (confirmed at `:125` and `:161` sequence in the file; the report's line numbers).
- Every consumer of those two hooks (all downstream of the same two `select('*')` call sites, so
  type-safe against the appended columns by construction): `command-bar.tsx`, `desk-reconnect.tsx`,
  `people-room.tsx`, `views/directory-view.tsx`, `views/nurture-view.tsx`, `views/outreach-view.tsx`,
  `views/portfolio-view.tsx`, `outreach/audiences-tab.tsx`, `party-profile-sheet.tsx`,
  `views/person-profile.tsx`, plus their `__tests__` siblings.

Grep also surfaced ten files with the literal string `people_directory` that are **comments only**,
not queries — checked each individually, none issues its own `.from('people_directory')`:
`brief-section.tsx`, `overlays/household-sheet.tsx`, `directory/makers-marketplace.tsx`,
`person-bits.tsx`, `profile/maker-profile.tsx`, `roster/call-sheet-mount.tsx`, `roster/roster-row.tsx`,
`hooks/use-clients.ts`, `hooks/use-coordination.ts`, `hooks/use-vendors.ts`. These describe how a
write (a saved maker, an edited contact) later surfaces through the view, or how the Call Sheet's
`v_project_roster` differs from `people_directory` — none is a type-check or runtime risk from the
five appended columns. This confirms the w1b report's own claim ("all directory reads go through
`usePeopleDirectory`/`usePerson`") is accurate — no reader was missed.

**`v_project_roster`** (unchanged by this wave — not one of 00623–00627's five migrations):
only one live JS/TS reader exists: `packages/supabase/src/hooks/use-coordination.ts:1056`,
`useProjectRoster()`, `select('*')`, consumed by `call-sheet-mount.tsx`, `call-sheet.tsx`,
`roster-row.tsx`, `person-bits.tsx`, `letterhead-instruments.tsx`. Read the view definition live
(`pg_get_viewdef`) rather than trust a comment:
```sql
CASE WHEN is_active_studio_member(project_consent_org(pp.project_id))
     THEN COALESCE(channel_consent_status(project_consent_org(pp.project_id), 'sms', pp.phone_e164), 'not_asked')
     ELSE NULL END AS sms_consent_status
```
This already reads the RECORD's verdict (`channel_consent_status`), not a frozen seat column —
confirmed no divergence for this shipped reader. `project_consent_org()` here resolves to
`COALESCE(p.studio_id, _primary_studio_for(p.designer_id))` — deterministic per-project, not
caller-relative — which is exactly the "a record's studio must read the same for every caller"
property 00624's own banner cites as the reason `project_consent_org()` is deliberately kept for
consent-ledger reads even though R-BD retires it from guards/reducers elsewhere. Not a finding:
this is the documented, ruled split, not an oversight.

**Type-check**, both packages, no findings (§2): `@patina/supabase` and `@patina/designer-portal`
both `tsc --noEmit` clean.

## 9. Additional independent spot-checks (fresh eyes, not from the prior fix logs)

- `people_directory`, `people_directory_seats`, `v_access_grants` all confirmed
  `security_invoker=true` via `pg_class.reloptions` directly (not inferred from a comment) — the
  property every RLS-isolation claim in this report depends on.
- `compliance_state()`, `identity_paper_state()`, `reach_state_for_identity()`, `reach_state_for()`,
  `identity_consent_status()`, `identity_seat_count()`, `contact_rule_summary()` all confirmed
  `prosecdef=f` (SECURITY INVOKER) via `pg_proc` directly — none of R-BF's recursive supersede walk
  or the other verdict reducers runs with elevated privilege, so nothing here can read past a
  caller's own RLS boundary. `compliance_state()`'s recursive CTE is scoped to
  `holder_id = p_holder_id` throughout with a depth cap of 64; `superseded_by` cannot point at
  another holder's document (`compliance_successor_other_holder`, checked by
  `assert_compliance_holder`), so the chain cannot cross tenants even in principle.
- `refuse_legacy_consent_write_trg` read live via `pg_trigger`/`pg_get_triggerdef`: fires
  `BEFORE UPDATE OF` exactly the ten named columns (eight consent + `phone`/`phone_e164`); confirmed
  none of 00624's ten new `project_parties` columns (`stage`, `on_site_from`, `on_site_to`,
  `site_access_mode`, `contracted_through`, `off_job_at`, `off_job_reason`, `company_id`,
  `warranty_until`, `warranty_contact_person_id`) is on that trigger's column list — the freeze is
  intact and unwidened.

## 10. Not re-litigated (settled per rulings.md §3)

R-AY, R-AW, R-BD, R-BI, R-BE, R-BG, R-BF and the rest of §3 are treated as settled, not findings.
Specifically: the `projects.studio_id IS NULL` duplicate-identity residue (R-BI), the party-profile
sheet's 21-of-22 empty-sheet gap (R-BE, verified below is unchanged and fails safe), and
`project_consent_org()`'s continued use inside the consent ledger (R-BD's own carve-out) are not
reported as findings here.

**One thing checked, not a finding — R-BE's "empty sheet" is safe by construction.** Read
`party-profile-sheet.tsx:259-267`: when `usePerson()` returns null (21 of 22 uncarded field seats),
`meta` collapses to `{}`, so `consent` falls through both `person?.status_raw` and
`meta.sms_consent_status` to the literal default `'not_asked'` — never to a stale `'granted'` that
could mis-enable a send. Line 512 (`{person ? <ConsentChip .../> : null}`) additionally suppresses
the chip entirely rather than showing a wrong word. The gap is a UX debt (the sheet reads empty),
not a consent-safety hole — confirmed by reading the code, not assumed from the report's prose.

## Summary of commands run this round

```
psql ... -v ON_ERROR_STOP=1 -f supabase/tests/people/w1a_identity_channels_consent_test.sql   (×3)
psql ... -v ON_ERROR_STOP=1 -f supabase/tests/people/w1b_compliance_authority_directory_test.sql (×3)
SUPABASE_DB_URL=... pnpm --dir .../agent-people-build db:generate                              (×2, +1 direct CLI ×2)
git -C .../agent-people-build diff --stat packages/supabase/src/database.types.ts               (clean)
pnpm --filter @patina/supabase type-check                                                       (clean)
pnpm --filter @patina/designer-portal type-check                                                (clean)
pnpm supabase:reset                                                                              (×2, clean, ledger 555 both times)
psql ... -f artifacts/.../build/probe58-r15-major1-negative-control.sql                          (reproduced)
psql ... -f artifacts/.../build/probe59-r15-major2-negative-control.sql                          (reproduced)
role probes: designer / client@patina.dev / anon / cross-tenant studio owner, 6 objects each
fixture probes: F-11, F-12, F-16, F-27 live SELECTs against people_directory + seats
pg_policies / pg_class / pg_proc / pg_trigger direct reads (not migration-file trust)
replay of 00623–00627 individually over the populated DB                                        (×1 each, clean)
```

## Findings

None. Zero BLOCKING, zero MAJOR, zero MINOR beyond the two notes above (the `db:generate` tooling
flake, and the mislabeled uid in `probe58-w1b-directory-as-designer.sql`'s "CLIENT account" echo),
both already folded into their respective sections rather than listed separately, since neither is
a defect in the branch's migrations, tests, or app code.
