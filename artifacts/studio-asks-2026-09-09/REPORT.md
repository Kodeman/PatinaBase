# Studio asks, 2026-09-09 — ship report

Program: three studio asks (lead phone, return-to-lead, edit people). Branch
`studio-asks/2026-09-09`. Main pushed at `119c10db0294ebd6c4c9e945c3b3af30853e3745`.

## What shipped

**Migrations (Strata):** `00583_lead_contact_phone.sql`, `00585_return_lead_to_new.sql` (the
program's second migration landed at `00585`, not `00584` — `00584` was claimed on origin/main by
an unrelated, concurrently-merged `studio_comember_rls_sweep` branch; the collision was caught in
review and the slot renumbered before merge), plus a small follow-up, `00586_discovery_prefill_is_not_content.sql`,
fixing a defect QA found in the return-to-lead guard (see below). No migration redefines an object
a later file also redefines; lineage for every redefined function/view (`begin_discovery`,
`ceremony_complete`, `hydrate_lead_relationship_contact`, `people_directory`) was traced to its true
prior body each round and diffed line-for-line before merge.

**Feature 1 — Lead contact (phone).** `leads.contact_phone` / `contact_phone_e164`,
`designer_clients.client_phone` / `client_phone_e164`; `hydrate_lead_relationship_contact` and
`begin_discovery` carry phone the same way they already carried email; `people_directory` (v5,
00583) surfaces it via `COALESCE(l.contact_phone, hp.phone)`. Old leads with a phone only in free
prose are not backfilled (R145).

**Feature 2 — Return to lead.** `public.return_to_lead(uuid)` and
`public.return_to_lead_check(uuid)`, both `SECURITY DEFINER`, `search_path` pinned to
`'public', 'pg_temp'`, `REVOKE ... FROM PUBLIC` then granted to `service_role` + `authenticated`
only (no `anon`). Offered on the Discovery folder and as an Undo toast after "Accept · begin"
(R146). Files: the RPC pair in `00585`; portal wiring for the folder action and the toast under
`apps/designer-portal/src` (Desk + doc/[id] routes, per the deploy bundle grep evidence below).

**Feature 3 — Editing people.** Studio-member edit doors on rolodex cards and field parties
(`project_parties`), "Edit details" on captured clients from People, read-only enforcement for
account holders' own name/email/phone and for makers, project-roster history left untouched by a
later card edit (R147). Files: People room components and the party/rolodex edit sheets under
`apps/designer-portal/src` (`AddPersonSheet`, rolodex/party edit forms, `HouseholdSheet`'s
edit-details path), plus hook changes in `packages/supabase` (`useUpdateStudioContact`,
`useUpdateClientContact`, party phone/consent handling).

## Review rounds and what they caught

Three implementation lanes (f1 = lead phone + return-to-lead SQL/RPC, f2 = return-to-lead UI/RLS,
f3 = editing people), each independently reviewed three rounds before merge.

**f1 (lead phone, SQL fidelity + return-to-lead SQL).**
- Round 1: SQL diffs against true prior bodies confirmed clean (no lost guard/COALESCE/branch);
  found two reproducible behavioral defects — a stale `*_e164` left behind when a phone is cleared
  (F1), and the new "Phone on file" editor being unclearable on a lead-derived household because
  the hydrate trigger keeps re-filling it (F3) — plus two code-reading defects (a dead branch
  reading a field `useLead` never selects; `useAcceptLead` clobbering a phone the migration's own
  comment says to preserve).
- Round 2: F1/F3 and the round-1 findings fixed and verified. Caught a real merge-time collision —
  origin/main had independently claimed `00584` — before it could land as two files sharing one
  migration version; also flagged the pre-existing e2e spec (`action-visibility.spec.ts:271`) that
  asserts the old single-"Contact"-field shape and can never pass again (not PR-gated).
  `useAcceptLead` clobber reappeared one branch over and was called out again.
- Round 3: renumbering to `00585` confirmed correct and vacant on origin/main; a profile-holder
  phone-precedence guard's own banner was found to overstate what it actually closes (a
  client-invite path can still leave a stale captured phone outranking a profile's own number) —
  logged as a judgment call for Kody rather than patched blind.

**f2 (return-to-lead UI + authority/RLS).**
- Round 1: found a critical cross-studio authority gap — the check validated `designer_clients.designer_id`
  but never `leads.designer_id`, so a designer in a different studio could plant a relationship row
  pointing at a foreign accepted lead and un-accept it. Reproduced end-to-end on the local DB.
  Also: generic error fallback masking the server's real refusal sentence, and the guard never
  checking the relationship row's own studio-authored content (notes, corrected name/phone) before
  deleting it.
- Round 2: the cross-studio hole closed on both ends and independently re-verified with a planted
  foreign `lead_id`. Found a second, narrower authority gap (nothing required the row being deleted
  to be the lead's *canonical* relationship, letting a second `designer_clients` row on the same
  lead cause the wrong-row deletion this migration exists to prevent) plus a missing index on the
  live thread-existence probe and an Undo-band CSS token miss that could park it under the Studio
  Drawer at desktop width.
- Round 3: this is the round that produced **00586**. The "no content exists" guard's own SQL test
  asserted that a Discovery room with a room type and square footage but no name, or a lifestyle
  row with no free-text, counted as "no content" and could be silently discarded by the revert —
  a real data-loss path. Fixed by widening the content check to the fields DiscoveryRoom and
  LifestyleRow actually carry. The remaining cross-studio finding from round 1 (a foreign
  `lead_id` denial-of-service on the Undo door, distinct from the closed escalation) was still open
  at round 3 and is not yet fixed — see Owed to Kody.

**f3 (editing people).**
- Round 1: found that a company-only rolodex card's `full_name` could be silently overwritten by a
  no-op Save (prefill/diff fallback mismatch); that a party's phone could be repointed while its
  granted SMS consent stayed attached with no reset; that client-contact edits never invalidated
  the People directory cache; and that the help-article build item (item 5) was inert — nothing in
  the app renders a `tooltip`-kind doc.
- Round 2: found the SMS-consent fix was a regression in the other direction — any phone edit,
  including a bare reformat, reverted an `opted_out` party back to `not_asked`, erasing the only
  stored record of a STOP reply. Also: the help article still unseeded, and notes-editing riding a
  `hasProfile` branch that nothing in the codebase ever sets, making it unreachable.
- Round 3: confirmed the load-bearing `people_directory` plumbing (`person_id`/`studio_contact_id`
  resolution) is sound and cache invalidation reaches the directory and profile head. Found the
  party edit form has no loaded-data guard, so clicking Edit inside the fetch window and saving
  clears company/trade/phone/email; and the SMS-consent fix from round 2 was only half-applied
  (still writes `opted_out` with a cleared timestamp, contradicting its own new docstring).

## QA flows and outcomes

| Flow | Result |
|---|---|
| A — Lead with both (name, email, phone) | pass |
| B — Undo toast | fail |
| C — Folder action (Move back to New Lead) | fail |
| D — Phone carries to designer_clients | pass |
| E — People edit (studio/field contact + captured client) | pass |
| F — Console errors during flows | pass |

Flow B and C failures trace to the same root cause QA found before `00586` closed it: accepting a
lead auto-creates an essentially-empty `client_discovery` stub row, and the original revert guard
treated the row's mere existence as "filled in," refusing "Move back to New Lead" from the very
first Discovery visit — before a designer had entered anything. `00586` widens the content check
to look at actual field values rather than row existence. The Undo toast itself (Flow B) rendered
correctly with its Undo affordance; the click-to-revert leg was not exercised because the toast
auto-dismissed before a retry landed, and two follow-up leads created to retry hit an unrelated
Brief-render defect (a captured lead sometimes renders "Nothing yet" with no Accept · begin
control, though the DB row is correct) that blocked further attempts. Full detail:
`artifacts/studio-asks-2026-09-09/qa/QA-NOTES.md`; screenshots in
`artifacts/studio-asks-2026-09-09/qa/screenshots/` (both JPGs under 60 KB, no compression needed).

## Deploy evidence

- Main at `119c10db0294ebd6c4c9e945c3b3af30853e3745`.
- Strata migrations applied: `00583_lead_contact_phone.sql`, `00585_return_lead_to_new.sql`,
  `00586_discovery_prefill_is_not_content.sql`; `supabase migration list` shows 00583/00584/00585/00586
  all local==remote.
- Prod objects confirmed via `supabase db dump --schema public`: `leads.contact_phone`,
  `designer_clients.client_phone` present with 00583 comments; `public.return_to_lead(uuid)` and
  `public.return_to_lead_check(uuid)` exist, `SECURITY DEFINER`, `search_path` pinned to
  `'public','pg_temp'`; grants REVOKE-then-GRANT to `service_role`/`authenticated` only, no `anon`
  on either function; `people_directory` view body carries the phone COALESCE, comment `v5 (00583)`;
  the live `return_to_lead_check` body carries 00586's content-ladder fix.
- Worker `patina-designer-portal`: deployment `960bc3eb-17d1-480a-a2ba-453084c049cb`, created
  2026-09-10T01:38:59Z, 100% traffic, `app.patina.cloud`. `wrangler deployments list` bottom row
  matches. `wrangler tail` ~60s: 2 requests, both `Ok`, zero errors.
- Bundle greps confirm the shipped code is present: `return_to_lead` and `contact_phone` in the
  deployed client chunk; `Move back to New Lead` in the `doc/[id]` page chunk; both strings present
  across `.open-next` handler/server/client artifacts; zero occurrences of `127.0.0.1:54321`
  anywhere in the built assets (no local Supabase URL leaked into the prod bundle); the prod
  project ref `bkvcixdmuyejfzcijpdg.supabase.co` is the one inlined.
- `curl` checks: `/api/version` → 200 (x2), `/` → 200, both static chunks fetched → 200 with the
  expected byte sizes and grep hits.

Only `patina-designer-portal` was deployed — the feature set is designer-portal-only. The other
three portals were not touched or redeployed.

## Owed to Kody

- A signed-in production walk of all three flows. Nothing in this program has been exercised by a
  human against the live Worker; every deploy-evidence item above is schema-, artifact-, or
  transport-level, not an observed authenticated session.
- Tell Leah's studio the three asks shipped.
- The deferred lead stage-history ledger (no record of accept/revert events) — flagged in R146 as
  open, not resolved.
- From QA: the round-3 f2 finding that a foreign-studio `lead_id` can still be planted to
  permanently deny a victim's own Undo door (distinct from the escalation closed in round 2) was
  still open at last review and has not been re-verified fixed.
- From QA: the Brief-render defect where a captured lead sometimes shows "Nothing yet" with no
  Accept · begin control, reproduced on 2 of 2 follow-up leads in the QA session, not yet
  root-caused past reproduction.

## notVerified (this recording pass)

- Signed-in behavior of any of the three features in production (see Owed to Kody).
- Whether the f2 round-3 foreign-`lead_id` denial-of-service finding has since been fixed —
  the review transcripts available to this report end at round 3 for f2.
- The SQL test suites were not re-run by this recorder; pass/fail counts above are drawn from the
  deploy chain's own record, not independently reproduced here.
- `pnpm --dir <wt> supabase:reset` and `database.types.ts` drift were not re-run by this recorder.
