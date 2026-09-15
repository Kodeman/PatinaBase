# W3 (P2) — adversarial migration review, round 24

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`, branch
`build/people-room-crm-2026-09-11`, HEAD `96fcc861b`.
Local Postgres only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`).
**No prod touched. No migration minted. No server started. No port taken.** Every write in this
round was made inside a transaction and ROLLBACKed.

**Verdict: CLEAN — ZERO BLOCKING, ZERO MAJOR. Eleven minor (six carried open from r23, five new).**

Both of r23's majors are **fixed and re-measured at HEAD** (§2). Nothing in the wave's seven
migrations, its RLS, its grants or its SQL suite fails a blocking or major test this round: tenant
isolation holds on every new object, the merge orphans nothing, the sweep writes only to
owners and admins of the holding studio, consent is untouched by every file, and the reset and all
three SQL suites replay clean.

---

## 1. Gates run this round (all green)

| Gate | Result |
|---|---|
| `pnpm --dir … supabase:reset` | **clean** — "Finished supabase db reset on branch main." |
| `supabase/tests/people/w1a_identity_channels_consent_test.sql` | **All W1a assertions passed.** |
| `supabase/tests/people/w1b_compliance_authority_directory_test.sql` | **All W1b assertions passed.** (26 blocks) |
| `supabase/tests/people/w3_merge_sweep_household_test.sql` | **W3 SQL suite: all blocks passed** — 21 numbered blocks, `13f` last, 24 `passed` notices |
| `python3 scripts/generate-legacy-grants.py` | **no diff** — "baseline + 2767 replayed statements" |
| `SUPABASE_DB_URL=… pnpm db:generate` | **no diff** in `packages/supabase/src/database.types.ts` |
| `pnpm --filter @patina/supabase type-check` | clean (`EXIT=0`) |
| `pnpm --filter designer-portal type-check` | clean (`EXIT=0`) |
| migration numbering | `git diff --name-only main...HEAD -- supabase/migrations` shows **00628–00634 and nothing in 00595–00620**; nothing below 00621 minted; working tree clean under `supabase/` |

### Report figures re-measured against the freshly reset database

Every number `w3-data-report.md` states that this round can move was taken again. **All correct.**

| Report claim | Measured |
|---|---|
| §1 "seventeen `RAISE EXCEPTION` sites over fifteen distinct tokens" | 17 sites / 15 tokens between `00629:1284` and `:2764`; `merge_contact_not_found` ×3 (`:1329`, `:1352`, `:1357`), the other fourteen once each. `MERGE_REFUSAL_SENTENCES` holds **15** keys |
| §0 "21 numbered blocks, 13f last" | block headers in the suite: `1 1b 1c 2 2b 3 4 5 6 7 8 9 10 11 12 13 13b 13c 13d 13e 13f` = **21**, `13f` last |
| §2 "36 papers: 9 current, 24 held, 2 lapsed, 1 lapses_soon" | 36 / 9 / 24 / 2 / 1 |
| §2 the three swept papers and their dates | Ostrom Builders 2025-12-31 `lapsed`, Northgate Electric 2026-03-31 `lapsed`, Lakeshore Painting Co. 2026-10-08 `lapses_soon` |
| §2 / §10.6 "3 notices and 6 in-app notifications" | `{"notices":3,"scanned":3,"notified":6}`; 2 active owner/admin members in the holding studio |
| §6 "8 projects, 3 stamped, 5 NULL, 5 ambiguous, 0 carrying seats" | 8 / 3 / 5; all five designer-of-record holds **2** active design-studio memberships; **0** seats on any of the five |
| §8 "the wave's highest hand number is 00634" | correct |

### Tenant isolation, probed directly (not inferred)

As `cf100000-…-0001` (a member of no Patina design studio in the seeded book), against Local Dev
Studio's rows: `merge_studio_contacts` → `merge_not_a_member`; `set_household_threshold` →
`household_not_found`; `add_household_member` → `household_not_found`; `archive_studio_contact` →
`studio_contact_not_found`; `resolve_merged_contact` → NULL; `compliance_document_state` → NULL;
`client_households` / `studio_compliance_notices` / `studio_contact_merges` / `people_directory` →
**0 rows each**.

The one gap I went looking for — `people_directory`'s PARTY branch gates the consent WORD on
`is_active_studio_member(project_consent_org(...))` (`00629:3185`) but hands the two consent DATES
to `identity_consent_evidence(project_consent_org(...), …)` at `:3258` with **no** membership leg —
is closed by construction and measured closed: the view carries
`WITH (security_invoker = true)` (`00629:2881`, confirmed in `pg_class.reloptions`),
`identity_consent_evidence` / `identity_consent_status` / `channel_consent_status` are all SECURITY
**INVOKER**, and `studio_channel_consent` has RLS `is_active_studio_member(organization_id)`. Probed
as the outsider: 0 consent rows, 0 evidence rows, NULL status.

### The merge orphans nothing (probed)

Every FK column into `studio_contacts` was enumerated from `pg_constraint` (20 columns over 12
tables), plus every uuid/uuid[] column in the schema whose NAME looks like a card pointer but
carries no FK (`client_households.member_person_ids`, `project_party_authority.copy_to`,
`project_site_access_cards.told_refs`). A real fold on the seeded book
(`d0e10000-…-0012` Pete Rusk into `d0e10000-…-0008` Erin Sato, ROLLBACKed) leaves **0** dangling
references on all of them, 0 Directory rows for the folded card, 1 lineage row, and
`resolve_merged_contact()` answering the survivor. `copy_to` holds *engagement* ids and
`told_refs` is written only with seat ids by `useLogSiteAccessTold` — seats survive a fold, so
neither is an orphan.

---

## 2. r23's findings, re-checked at HEAD

| r23 finding | State |
|---|---|
| **MAJOR-1** — `merge_seat_authority_collision` named the repair that closes the LIVE seat | **FIXED.** `00629:1828-1834` adds the `CASE` that names the side (`merged` / `survivor` / `both`); `DETAIL` is `'<job> · <kind> · <side>'` (`:1854`); the HINT branches on the side and now says "Put THAT seat back in the bidding, then close it by hand … Closing the seat that is still open ends only what that one carried and leaves the standing grant standing." (`:1855-1870`). `merge_seat_collision`'s comment no longer offers "Revoke on its grant" (`:1712-1716`). `use-studio-contacts.ts:1980-2045` carries the same act and reads the third DETAIL word; the map holds **15** keys. Block `13d` walks the named repair end to end and passes |
| **MAJOR-2** — `w3-data-report.md` did not know the fourth refusal exists | **FIXED.** §0's `00629` row names the fourth pre-check, §1's ordered list ends at `merge_seat_authority_collision`, the count reads "fifteen distinct tokens over seventeen RAISE EXCEPTION sites", §1 gains "The fourth seat pre-check, and the premise R-BS took away", §9 carries the count and the DETAIL shape, §10 gains item 7 with the one-line measurement. All re-measured correct above |
| m1 · `resolve_merged_contact()` pins no `search_path` | **OPEN** — `pg_proc.proconfig` is NULL for it and `search_path=public` for all 21 other wave functions (§3 m1) |
| m2 · `add_household_member()` raises 00624's token on a studio-less job | **OPEN** — re-measured both branches (§3 m2) |
| m3 · double possessive in the sweep's notice | **OPEN** — re-measured: `Ostrom Builders's paper has lapsed` (§3 m3) |
| m4 · 00634's backfill contradicts the clamp beside it | **OPEN** — `00634:267-273` unchanged (§3 m4) |
| m5 · `contact_rule_blocks_contact()` has no caller and its COMMENT misstates the merge | **OPEN** (§3 m5) |
| m6 · 00631's prose names a trigger body that is no longer there | **OPEN** — `00631:315`, `:327` unchanged (§3 m6) |

---

## 3. Minor

### Carried open from r23

**m1 · `resolve_merged_contact(uuid)` pins no `search_path`.** *Confidence: high (read from
`pg_proc.proconfig`).* It is the only one of the wave's 22 functions with a NULL `proconfig`; the
other 21 all carry `search_path=public` (`link_rolodex_card_to_parties` carries
`public, pg_temp`). SECURITY INVOKER, so the exposure is small, but it is granted to
`authenticated` and resolves `public.studio_contacts` — and it is called from inside
`identity_paper_state()` and `rolodex_card_for_party_phone()`, which the Directory reads on every
row. `00629:386-403`.

**m2 · `add_household_member()` on a studio-less job raises 00624's token, not 00632's own
refusal.** *Confidence: high (measured twice, ROLLBACKed).* On `Aspen Loft Refresh` (one of the 5
of 8 local projects R-BI names), as the studio owner:
`add_household_member(h, card, 'client_rep', <studio-less job>)` → `ERROR:
party_card_project_has_no_studio`, and `…, 'client', …` → the same. Both come from the seat INSERT
at `00632:464-470`, before `household_grant_project_has_no_studio` at `:482-487` can run — so the
file's own named refusal is unreachable on both ordinary paths and
`HOUSEHOLD_REFUSAL_SENTENCES.household_grant_project_has_no_studio` is dead there. The face does
not print a schema word (`write-error.ts` maps the 00624 token), but the sentence it prints is the
seat-card one for an act that named no firm. Move the recorded-studio check above the seat INSERT,
or widen the sentence.

**m3 · The sweep's notification renders a double possessive.** *Confidence: high (measured on the
seeded book).* `00630:412-415` concatenates `v_holder || '''s …'` with no rule for a holder name
already ending in `s`: the second seeded lapse writes subject `Ostrom Builders's paper has lapsed`.
It reaches an in-app notice the principal reads.

**m4 · 00634's one-off backfill contradicts the clamp it sits beside.** *Confidence: high (read).*
`00634:267-273` ends every open grant on every seat with `off_job_at IS NOT NULL`, which includes a
seat dated by a recorded withdrawal — the one population R-BS rules must KEEP its open grants. It
is a no-op on a first apply (`off_job_at` and `bid_outcome` ship in one chain; locally the NOTICE
reports 0), but a re-apply over a book that has since used the Bidding band would end exactly the
grants the clamp exists to preserve. Exclude `bid_outcome = 'withdrawn'`, or say in the banner why
the backfill deliberately does not honour the clamp.

**m5 · `contact_rule_blocks_contact()` still has no caller, and its COMMENT still misstates the
merge.** *Confidence: high (re-grepped at HEAD).* `grep -rn contact_rule_blocks_contact supabase
packages apps` returns only `00629` itself, `seed/00-legacy-grants.sql` and `database.types.ts`.
Its COMMENT (`00629:946-947`) says `merge_studio_contacts()` "refuses on it", while the merge in
fact refuses on **subsumption** (`00629:1502-1517`, widened away from R-BL's formula at r5 M-2).

**m6 · 00631's prose names a trigger body that is no longer there.** *Confidence: high (read).*
`00631:315` and `:327` both name `update_updated_at_column()` as the body behind
`set_updated_at_project_parties`, which `00629:1248-1279` replaced with
`project_parties_touch_updated_at()`. The bracketing `DISABLE`/`ENABLE TRIGGER` at `00631:335`/`:404`
still names the right object, so nothing is broken — only the comment.

### New this round

**n1 · The wave's own files still say it is a six-migration wave.** *Confidence: high (read).*
`00628:2`, `00629:2`, `00630:2`, `00631:2`, `00632:2` and `00633:2` read "W3/P2 (1 of 6)" …
"(6 of 6)", and `00634:2` carries no position at all — it reads "W3/P2 (r19 MAJOR-1)". r21 MAJOR-3
corrected the *report* ("Earlier rounds described this as a six-migration wave and never named
`00634`"); the **files** were not corrected with it, so anyone counting the wave from the migration
folder — which is what the W7 deploy preflight does — reads six of seven and the one file that
gates money on a seat close is the one with no number. Same class as r19 MAJOR-2 / r21 MAJOR-3 /
r23 MAJOR-2, one artefact over.

**n2 · 00634 states, twice, an absolute invariant its own clamp removed.** *Confidence: high
(read).* `00634:146-147` — "The invariant holds absolutely in every path: NO closed seat carries an
open grant." — and the closing clause of `COMMENT ON FUNCTION
end_party_authority_at_seat_close()` (`00634:228-230`) — "otherwise the CLOSE ITSELF is refused …
so no closed seat can ever carry an open grant" — both predate R-BS and both are now false for the
withdrawal path, which the *same* COMMENT states plainly twelve lines earlier ("a seat dated that
way keeps its open grants until the principal closes the seat") and which `00629`'s fourth
pre-check exists entirely to catch. The file contradicts itself in one `COMMENT`. This is the
precise sentence whose staleness cost r22 a measured MAJOR: `merge_seat_collision`'s carve-out
quoted it, believed it, and let a fold through. Strike both, or scope them to the hand-close act.

**n3 · `merge_seat_on_studioless_project`'s HINT names an act with no door.** *Confidence: high on
the fact (grepped every portal and `packages/supabase`), medium on the severity.* The HINT reads
"Record that job's studio first, then merge." (`00629:1585-1587`). Nothing in any portal writes
`projects.studio_id` — the only writer is 00317's `set_project_studio_id()` trigger, whose own
derivation cannot resolve an ambiguous designer either — and the file's own comment two dozen lines
above says so ("nothing in the People room stamps a project's studio_id", `00629:1528-1529`). After
00628 the remaining population is exactly the ambiguous one R-BI rules a *listed* legacy residue,
so a duplicate pair with a seat on one of those jobs is unfoldable and the refusal sends the studio
to an act that does not exist. Filed minor rather than major because the population is **0 on the
local book** (00628's NOTICE: 5 remaining, 0 carrying seats), the refusal is correct and safe
(nothing is written), and R-BI already rules the residue owed to Kody with the W7 preflight count —
but it is r23 MAJOR-1's class (a refusal whose named repair the room cannot take) one refusal over,
so Fable may want to escalate it.

**n4 · The sweep skips a card the room FOLDED, but not one the studio PUT AWAY.** *Confidence:
medium (shape read and reasoned; no archived gating holder exists in the seed to measure).*
`00630:393` carries `AND sc.merged_into IS NULL` — r2 B2-4's fix — and nothing beside it about
`sc.archived_at`. An archived holder's dated, gating paper still earns its `lapses_soon` /
`lapsed` notice and an in-app notification to every owner and admin, with a deep link to a card
`useStudioContacts(…, { includeArchived: false })` does not return. Milder than the merged case —
`people_directory` *does* emit an archived card's row (`meta.archived_at`), so the link resolves —
and the unique key means it is said once, not nightly. Either add the leg or record in the banner
why archival is deliberately not a reason to stay silent.

**n5 · Deleting a household strands the money grants it sourced, with no act that can move or end
them.** *Confidence: high on the mechanism (read + grants read), low on reachability.*
`authenticated` holds DELETE on `client_households` behind an owner/admin policy
(`00632:302-312`), and `project_party_authority.source_household_id` is `ON DELETE SET NULL`
(`00632:347-349`). After such a delete the seat's open `money` row keeps
`source_clause = 'client_households.co_threshold_cents'` and `threshold_cents`, with
`source_household_id` NULL — so `set_household_threshold()` can never move it again (its loop asks
both legs, `00632:680-685`), `add_household_member()` treats it as a foreign grant
(`:541-542`), and the Call Sheet goes on printing "Signs money to $2,500." sourced to a household
that no longer exists. **No door in the room reaches it**: no delete hook for
`client_households` exists anywhere in `packages/supabase/src` or `apps/designer-portal/src`, so
today this is a raw-PostgREST act only. Either withhold DELETE from `authenticated` until the room
has a delete act that ends the grants first, or say in the column's COMMENT that a deleted
household's grants are the studio's to end by hand.

---

## 4. A note that is not a finding

The shared local box again carries **committed** sweep rows: 3 `studio_compliance_notices`,
6 `notification_log` rows of type `compliance_document_expiry` and 2 `job_runs` rows
(`succeeded` then `skipped`, 665 µs apart), all stamped `2026-09-15 17:12:31Z` — i.e. minutes
after my own `supabase db reset` and while my suite run was in flight. It is **not** the suite:
re-running `w3_merge_sweep_household_test.sql` afterwards left the `job_runs` count at 2, unchanged
(the file is one `BEGIN … ROLLBACK`). It is **not** the cron: `cron.job` holds the sweep at
`0 6 * * *` and `cron.job_run_details` shows no run of it. Two transactions 665 µs apart on one
database is another session's probe on the shared box — the same residue r23 §4 recorded. Logged
here only so round 25 does not file it as a product defect.

---

## 5. Scope note

This is the migration lane. `w3-review-r23-qa.md` returned clean and the code lane's own gates
(`admin-portal build`, the jest and vitest suites) were not re-run here; the two type-checks the
report cites were, and both pass.
