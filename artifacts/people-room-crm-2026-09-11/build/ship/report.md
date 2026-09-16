# Ship report — People Room CRM in production (2026-09-16)

Program: "Everyone on the Job" — the People room rebuilt as a construction CRM
(panel `2026-09-11`, build program `build/people-room-crm-2026-09-11`).
Worktree: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`.
This report closes W7 and the whole program. Sources: `deploy-log.md`,
`verify-report.md`, `sanity-push.md`, `walk-script.md`, `integration-report.md`,
`w5-ship-report.md`, `w6-fix-log-r2.md`, `build-sheet.md`, `README.md` — all in
this directory unless noted.

---

## 1. What shipped

### 1a. Migrations — Strata (`bkvcixdmuyejfzcijpdg`), 21 files, all applied

`00592`-`00594`, `00621`-`00638` (`supabase db push --include-all`). New
tables (9, all confirmed present post-push): `client_households`,
`paperwork_link_tokens`, `project_party_authority`,
`project_site_access_cards`, `studio_channel_consent`,
`studio_compliance_documents`, `studio_contact_channels`,
`studio_contact_merges`, `studio_touches`. `people_directory` gained
`scope, reach_state, consent_status, paper_state, contact_rule_summary,
seat_count`. A daily `cron.job` (`jobid=59`, `0 6 * * *`,
`sweep_compliance_expiries()`) is active. A private `compliance-documents`
storage bucket exists (`public=false`). (`deploy-log.md` §1a; `verify-report.md`
§4 re-confirmed the cron row and — separately — that `pg_policies` on
`project_site_access_cards` grants no client-visible access, studio-membership
only.)

### 1b. Edge functions — 34/34 deployed, 0 blocked

6 with `--no-verify-jwt` (fulfillment-po, invoice-link-checkout,
**paperwork-upload — new function, first deploy**, resend-webhook,
sms-inbound, stripe-webhook); 28 with `verify_jwt=true` (full list in
`deploy-log.md` §1b). `verify-report.md` §3 independently re-queried
`supabase functions list` and confirmed all 34 `ACTIVE`, `paperwork-upload` at
`version: 1`, `verify_jwt` flags matching the declared 6/28 split, and that
`campaign-dispatch`/`spec-pdf` genuinely had "no change" (their bundle content
was already live from an earlier ship, not a failed redeploy).

### 1c. Cloudflare Workers (portals)

No standalone service Worker in this program's scope (edge-api excluded per
`deploy-plan.md`).

- **designer** - `patina-designer-portal`, version
  `466fc671-2c99-42dd-833d-d87ca7d4752d` (deployed 2026-09-16T17:35:46Z),
  above the prior good row `eab16705-...` (2026-09-15, hour-tracking).
- **client** - `patina-client-portal`, version
  `6f41b63e-13d4-42b4-a0b5-b88355def9e5` (deployed 2026-09-16T17:37:11Z),
  above the prior good row `83f2dcef-...` (2026-09-15, hour-tracking).

Both bottom-row positions re-confirmed independently in `verify-report.md` §1.

### 1d. iOS - Patina Field, TestFlight build 5

`w5-ship-report.md`: build **5** (marketing version 0.1), ASC app
`cloud.patina.field` (id `6805156812`), build id
`23a23b88-5ac3-484a-bb94-e38f6e6e8ea2`, processing state **VALID**. Gate green
(build/tests/lint/3 copy sweeps). Highest verified claim is **sim-verified**
(iPhone 17 Simulator), not device-verified — see §3 anomalies. Not assigned to
any tester group; export compliance not declared — both are Kody's ASC steps.

### 1e. Sanity - 18 help documents, published

`sanity-push.md`: project `kv3qrinl` / dataset `production`, pushed via the
**Sanity MCP** (OAuth `kody.kochaver@gmail.com`), not the CLI token (which
lacks `create` rights — see §3 anomaly #1). 17 documents created, **1 document
replaced in place**: `helpContent--designer-portal--document--people` (the
live doc on the (surfaceKey=`designer-portal/document/people`,
contentType=`fieldHelper`, persona=`all`) triple) was patched and republished
under its existing `_id`, never duplicated. All 18 published; the collision
triple re-queried and resolves to exactly one document. `verify-report.md` §6
independently re-ran the same published-perspective query this run and got
**20** (18 pushed + 2 pre-existing), matching exactly.

**Two pre-existing People docs are flagged for Kody's copy review** (untouched
by this push):
- `helpContent--designer-portal--document--people--guide--overview`
  (`designer-portal/document/people/guide/overview`, helpArticle) — opens
  "Everyone the studio works with — clients, makers, trades, and field
  parties — as one directory, with threads, reviews, and each person's whole
  journey on their page."
- `helpContent--designer-portal--document--people--person`
  (`designer-portal/document/people/person`, fieldHelper) — opens "The whole
  journey on one page — proposals, projects, threads, touchpoints — derived,
  never a separate log."

---

## 2. Verification evidence

All of the following is independently re-checked in `verify-report.md`
against live Strata/Cloudflare state, not merely restated from `deploy-log.md`:

| Check | Result |
|---|---|
| Both portals' bottom deployment rows match this run | PASS |
| All 34 edge function versions/timestamps (incl. the two no-ops) | PASS |
| `paperwork-upload` behavioral probe (`400 "unsupported content type"` from the Deno runtime, not a gateway 401/404) | PASS |
| `client.patina.cloud/paperwork/not-a-token` renders the app's own invalid-token copy, not a platform 404 | PASS |
| `cron.job` expiry-sweep row | PASS |
| `pg_policies` on `project_site_access_cards` — no client-visible grant | PASS |
| `v_access_grants` resolves a real row | PASS |
| `wrangler tail` on `patina-designer-portal`, 18 requests across `/people`/`/desk`/a doc route | PASS — zero errors, ~66s window (not the full 90s requested — sandbox has no `timeout(1)`; reported honestly, not rounded up) |
| Sanity 20-document count on the People/Call-Sheet surface keys | PASS |
| People-room marker strings in served chunks | **NOT CONCLUSIVE** — route is auth-gated; unauthenticated probing can only reach shared chunks (0/6 markers found there, expected). Only a signed-in walk confirms the shipped UI text. |
| `people_directory` row count via service-role SQL | **NOT CONCLUSIVE (by design)** — the view keys every branch on `auth.uid()`/studio-membership; a no-session probe legitimately sees 0 regardless of data. Underlying tables confirm real data landed: `project_parties`=11, `studio_contacts`=3. |

**No 500s, no exceptions, zero prod mutations from any verification step.**

---

## 3. Anomalies and what was left open

1. **`deploy-log.md`'s Sanity status is stale relative to `sanity-push.md`.**
   `deploy-log.md` §1e reports Sanity as "BLOCKED — `SANITY_AUTH_TOKEN` lacks
   `create` rights. Not re-attempted this run." `sanity-push.md` (same
   program, same day) shows it was completed via a separate auth path (Sanity
   MCP OAuth). Not a defect — the content is live and re-verified — but the
   two logs disagree and a future reader should not re-block on an
   already-solved step. Recorded, not corrected in place (both are historical
   run logs).
2. **Chunk-string probe on `/people` is inconclusive, not a pass** — the only
   real confirmation of the shipped People-room UI text is the signed-in walk
   (§4 below).
3. **`people_directory` DB probe is inconclusive by construction**, not a red
   flag — see table above.
4. **`wrangler tail` ran ~66s of the requested 90s** due to sandbox tooling
   (no `timeout(1)` binary); no errors surfaced in the shorter window, so a
   re-run was not judged necessary but is reported as short rather than
   rounded up.
5. **iOS device pass never happened.** Both paired iPhones (17 Pro Max
   `00008150-00016C8A21DA401C`, 13 Pro `00008110-001630212231801E`) were
   locked throughout W5; the binary is built, signed and **installed** on the
   17 Pro Max, but no screen was ever driven on hardware. The `tel:` dialer
   prompt itself — the one behavior the Simulator structurally cannot show —
   is **unverified at any level**, compile-green only
   (`FieldRosterRules.swift:133`).
6. **W6's nine "OURS" designer e2e reds, re-triaged: 0 are PRODUCT.**
   `integration-report.md` §12 re-ran all nine under one reproducible
   procedure (fresh reset + lens seed + `paperwork-upload` served locally with
   `EMAIL_DEV_MODE=dry_run`, Playwright's own `webServer`). Six are
   **pre-existing** reds in code this branch never touched (a stale `MMM-D`
   regex against a `D-Month` sentence in `margin-handoffs.spec.ts`; an ARIA
   `role="combobox"` vs. `textbox` query mismatch from a 2026-09-08 commit in
   `help-panel.spec.ts`; a private sign-in helper in `wave2-screenshots.spec.ts`
   x2 that dies before any document page loads; a 390px-hidden-by-design
   margin-rail node in `wp3-screenshots.spec.ts`; a nondeterministic
   `help_state` write-through race in `desk-walkthrough.spec.ts` that moves
   line-to-line run to run). Two are **environmental** — the
   `client-invite-letter` flag never reached a hand-started dev server in the
   earlier run (`add-client-letter.spec.ts:47`/`123`); passes clean once the
   flag and the stack's actual HS256 keys are supplied. One was
   **test-side and is now fixed** (`bring-forward.spec.ts:264`, commit
   `d8ea9e7a5` — the test needed to bring forward someone task 5 left behind,
   not the person it re-picked).
7. **§7's "final clean full run" pre-existing reds** (unrelated to this
   program, recorded for completeness, not gating): the
   `studio_id_not_designer_studio` trigger-tightening cluster, ~30
   `lens-*` infra-gap reds, `schedule-region-head.test.tsx`, a
   `fulfillment-po` Deno `TS2345`, a `stripe-rail.test.ts` seed issue,
   `field-coordination`/`library-configuration`/`action-visibility` specs, 20
   legacy `catalog/**` reds against a relocated `/catalog` route, 21 legacy
   `crm/**` reds against a dead `/crm/kanban` route, and the client's
   `threshold.spec.ts:354` (confirmed to reproduce even on a clean single
   pass). None of these were touched or are gating; full evidence in
   `integration-report.md`.
8. **F3 (console `TypeError: Failed to fetch` bursts on `/desk` and `/people`
   immediately after navigation) is the one W6 finding still open** — all of
   F1 (a blocking seed-file `EXCEPTION`/`END` mismatch), F2 (R-CC Hours act
   absent on a teammate card), F4/F4-new (`addSub()`'s hard-coded phone
   colliding with seeded "Frank Bauer"), and F5 (`pay-link.spec.ts:571`, a
   stale fixture, fixed at `0f29187f3`) are **FIXED and re-verified**
   (`build-sheet.md` W6 row). F3 needs re-checking against this Strata-backed
   prod build — that is one of the Kody-only walk steps below.
9. **`walk-script.md` predates some of these fixes.** Its check 3 and check 6
   still describe the Hours-button-missing and wrong-first-phone-number
   findings as open "known issues," but per `build-sheet.md` those are the F2
   and (a differently-numbered) F3-in-`w6-qa.md` findings, both since fixed
   and re-verified. The walk script's own pointer is also slightly
   inconsistent — it tells the reader to read Finding F2 before check 6, but
   check 6 (phone order) maps to `w6-qa.md`'s own F3, not F2; check 3 (Hours
   button) is the one that maps to F2. Kody should expect both to work now,
   not to reproduce the "known issue" framing as written.

**Zero product defects survived triage. Zero prod mutations outside the
declared deploy chain. No step in the ordered deploy-plan.md command list
stopped the chain** (`deploy-log.md` Summary table).

---

## 4. Kody-only steps (owed, unchanged by this report)

1. **Signed-in prod walk** — full ten-check walk in `walk-script.md`, as
   Leah on `app.patina.cloud`, PLUS the Patina Field TestFlight section and
   the "what to tell Leah's studio" section. Specifically:
   - **The R-CC Hours act on a COLLEAGUE's card** — W6 only walked Leah's own
     card; check 3 in `walk-script.md` (Priya Natarajan, a studio team
     member) is the one that exercises the fixed F2 path and has not been
     walked signed-in yet.
   - **The console `Failed to fetch` re-check on `/desk` and `/people`** (F3,
     the one open finding — §3 item 8 above) against this prod build.
   - A `/paperwork/[token]` link and an invoice pay-link folio, post-migration.
2. **Sanity copy review** on the two pre-existing People docs listed in §1e
   above (`.../people/guide/overview`, `.../people/person`) — untouched by
   this push, flagged only.
3. **R-AY overrule check** — `rulings.md` records R-AY (record-only consent:
   `studio_channel_consent` is the sole gate any RPC/view/trigger/edge path
   consults) as superseding PR-x's phone-global seat-check lean, "unless Kody
   overrules." Still pending Kody's decision either way
   (`integration-report.md` §9, `build-sheet.md`).
4. **The TEAM-branch cross-studio visibility ruling** — `people_directory`'s
   TEAM leg (co-member visibility for `project_team_members` rows) was fixed
   for tenant scoping in W3 (`w3-fix-log-r1.md` M-7, re-verified
   `w3-review-r2-migrations.md`), but no explicit Kody ruling on the intended
   cross-studio visibility policy for that branch is recorded in
   `rulings.md`. Surface it for a ruling rather than treating the code fix as
   the final word.
5. **Ambiguous studio-less projects** — R-BD (W3 backfills
   `projects.studio_id`) and R-BI (no auto-link for a seat added on a
   studio-less project until backfill runs) are both recorded but the
   backfill's edge cases on genuinely orphaned projects are Kody's call if
   any surface during the walk.
6. **Tell Leah's studio** — per `walk-script.md`'s own script: the People
   room now shows everyone in one place (designers, subs, GCs, clients)
   instead of separate lists; the Call Sheet's "who holds the key" line is
   new and worth pointing out on the next project walkthrough. (Both the
   Hours-button and phone-order caveats in that script are now believed fixed
   per §3 item 9 — confirm on the walk before repeating the caveat to Leah.)
7. **R-CC card-head reading he may overrule** — the Hours act's placement
   "present, once, at the top of the card" for a studio team member
   (`walk-script.md` check 3) is a ruling Kody may want to revisit once he
   sees it live, not just confirm.
8. **R-CD wording ruling on three composed sentences** in
   `add-person-sheet.tsx` (none of these have been ruled on; they are the
   sheet's own composed voice, not copy-reviewed):
   - "Couldn't read which studio keeps this job's book. Press again to try
     once more."
   - "Couldn't read your standing in this job's studio. Press again to try
     once more."
   - "This job isn't attached to a studio yet, so there is nowhere to record
     the authority."
   - "You're not on the studio that keeps this job's book, so there is
     nowhere to record the authority."
9. **Residual R-CD minors R2, R4-R9** — `w6-fix-log-r2.md`'s sixth amendment
   closed F-B1/F-B2/F-B3 and its seventh amendment closed R1/R3/F-2, but
   explicitly states: "the sixth re-review returned CLEAN — the cluster's
   substance holds — and listed R2 and R4-R9 as owed minors, **still owed
   after this commit**." None of R2, R4-R9 block the ship (the seventh
   amendment's own author judged R3's in-code guard unreachable from the UI
   and left it as defense-in-depth, untested, by design) — they are named
   here so they aren't lost, not because they're blocking.
10. **A Sanity token with `create` rights** — if any future help-content push
    needs the CLI path again rather than the MCP OAuth workaround used this
    time.
11. **TestFlight tester-group assignment + export-compliance declaration**
    (build 5, ASC app `6805156812`) — both are manual ASC steps, not
    CLI-automatable.
12. **Unlock a phone for the Field device pass** — Kody's Phone (17 Pro Max,
    `00008150-00016C8A21DA401C`) already has the binary installed; relaunching
    it and confirming the `tel:` dialer prompt on "Call Luis Ochoa,
    superintendent" is the one behavior claim this program could never make
    on the Simulator.
13. **The pre-existing reds on main** recorded in `integration-report.md` §7
    /§10/§12 (trigger-tightening cluster, legacy `catalog/**` and `crm/**`
    suites, the command-palette contention cluster, etc.) — none block this
    ship and none were touched, but they are inherited test debt worth a
    separate cleanup decision.

---

## 5. Rollback

**Portals** (revert to the prior good version):
```
npx wrangler rollback --name patina-designer-portal --message "revert people-room-crm"
  # or: cd apps/designer-portal && wrangler versions deploy eab16705-27fd-4edc-8e0b-abd995a21bc1@100%
npx wrangler rollback --name patina-client-portal --message "revert people-room-crm"
  # or: cd apps/client-portal && wrangler versions deploy 83f2dcef-46cf-4284-a298-d1ff16d1a666@100%
```

**Edge functions** (redeploy the prior git ref for any of the 34, e.g.):
```
git checkout <prior-good-sha> -- supabase/functions/<fn>
supabase functions deploy <fn> --project-ref bkvcixdmuyejfzcijpdg
```
(`paperwork-upload` has no prior version — a rollback there means disabling or
deleting the function via `supabase functions delete paperwork-upload
--project-ref bkvcixdmuyejfzcijpdg`, since it was a first deploy, not a
redeploy.)

**Migrations** — this program does not ship a `down` migration set; the 21
files are additive (new tables/columns/cron/bucket). A genuine rollback needs
a hand-written reversal migration, reviewed before applying — do not run
`supabase db reset` against prod.

**Sanity** — `discard_drafts`/`version_discard` on the 17 newly created
document ids, and `unpublish_documents` + restore the pre-push body of
`helpContent--designer-portal--document--people` from `sanity-push.md`'s
recorded pre-push state (§ "Pre-push state").

**TestFlight** — build 5 is unassigned to any tester group; withholding the
group assignment (§4 item 11) is itself the safest "rollback" until a device
walk confirms the `tel:` behavior.

---

## 6. Program status

**W0-W7 all DONE.** Zero product-defect reds remain unclassified. Zero prod
mutations outside the declared chain. The program is live: 21 migrations, 34
edge functions (1 new), 2 portal Workers, 18 Sanity help documents, and a
TestFlight build, all independently re-verified in `verify-report.md`. What
remains is Kody's own steps in §4 — none of them block calling this shipped.
