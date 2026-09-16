# W4 Runtime QA — Round 10

Local-production-build QA of `designer-portal` and `client-portal` against a
freshly reset local Supabase stack. Read `w4-paperwork-report.md`,
`w4-studio-report.md`, `w4-help-report.md`, `build/upload-door-spec.md`
§3/§6/§9, `rulings.md` §3 (in full this round), and `w4-fix-log-r9.md` first.
Every ruling in `rulings.md` §3 is settled and not re-litigated below.

## 1. Procedure

- **PORT RULE**: 3000/3002 checked with `lsof -nP -iTCP:<port> -sTCP:LISTEN`
  before starting — both free (no orphan, no conflict, nothing to report).
  Ports 3100/3102 (the other concurrent session's reservation) were never
  touched.
- **Reset**: `supabase db reset --workdir .../agent-people-build` — clean.
  This wave owns the local DB this round; W1–W3 and W5 migrations replay
  along with it as expected.
- **Builds**: `next build` (no `--webpack`; that flag is build-time-invalid
  for `next start`, see §4 gotcha below) for both portals, all env passed
  inline per the binding instruction — no `.env.local` ever created or read.
  `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` sourced from
  `supabase status --workdir .../agent-people-build -o env` (values never
  printed), `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live`,
  `NEXT_PUBLIC_FLAG_OVERRIDES=the-document-pilot:true`, plus each portal's
  `.env.example` service-URL vars pointed at localhost. Both builds
  succeeded with no compile errors. The `output: 'standalone'` warning under
  `next start` is the known benign message the task explicitly accepts.
- **Serve**: `supabase functions serve paperwork-upload --no-verify-jwt
  --workdir .../agent-people-build`, both `next start` processes
  backgrounded on 3000/3002 (`next start -p PORT`, no `--webpack`).
- **Sandbox note**: `dangerouslyDisableSandbox` was used, after observing an
  actual sandbox failure in each case, for: `supabase status`/`db reset`
  (telemetry-file EPERM), `psql`/`curl` to localhost dev ports, `next
  build`/`next start`, and jest. No product code was touched by any of this
  — all fixes were tooling/procedure-side.
- **DB access**: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`,
  used only to verify UI-driven writes, never to seed state the UI should
  have produced itself.
- **No prod actions**: no `db push`, no `functions deploy`, no `secrets
  set`. No new migration was minted (none was needed for a QA-only round);
  the reserved range 00595–00620 was not touched and the highest migration
  on the branch was left alone.

## 2. Playwright

- `apps/client-portal/tests/paperwork-link.spec.ts` — **3 passed**.
- `apps/designer-portal/e2e/people/paperwork-inbound.spec.ts` — **1 passed**
  (workers=1, chromium-pinned, per its own config). Re-run 3 times total to
  investigate r9-qa Finding 3 (see §5): pass, fail (unrelated auth-fixture
  flake), pass. See §5 for the writeup.
- Both portals' `webServer.reuseExistingServer` correctly reused the
  already-running `next start` production servers rather than spinning up
  a second instance on the same port.

## 3. Manual walk (Leah → Rosa → Leah)

All steps performed as real UI actions in a live browser (claude-in-chrome),
cross-checked against live Postgres/Storage state at every step, not just
visual inspection. Screenshots in `.../build/qa-w4-r10/`.

1. **Mint** — Signed in as `designer@patina.dev` (Leah Hartwell). Opened the
   Twin Cities Drywall & Plaster company card, minted a paperwork link
   (`01-mint-link-leah.jpg`). Token, `expires_at`, and `company_id`
   confirmed correct in `paperwork_link_tokens` via psql.
2. **Guest view** — Opened the minted link in a fresh browser context at
   390px width as Rosa Delgado (the firm's paperwork contact).
   `02-firm-page-390-rosa.jpg` shows the three expected rows (coi_gl
   current, w9 current, license not-on-file) — matches P-1/P-8 and R-BU.
3. **Upload** — Generated a small PDF and uploaded it against the `license`
   row (`03-upload-landed-unverified.jpg`). Confirmed via psql: new row in
   `studio_compliance_documents` with `inbound=true`, `verified_at IS
   NULL`, correct `holder_id`/`doc_type`; storage object landed at
   `{organization_id}/{company_id}/{document_id}/{filename}` in the
   `compliance-documents` bucket.
4. **Unverified reads correctly** — Reloaded the firm page: the license row
   still read "Awaiting check", never "Current" — `compliance_state()`'s
   `inbound=true AND verified_at IS NULL` exclusion (migration 00637, fixed
   in Round 1 per the studio report) still holds this round.
5. **Inbound band** — Back in designer-portal as Leah, the company card
   showed the inbound queue band with count 1 and the correct per-row copy
   (`04-inbound-band-leah.jpg`) — matches S-1/acceptance item 8.
6. **Confirm** — Used the two-step inline confirm (never a modal) to
   confirm the pending row. Verified via psql: `verified_by`/`verified_at`
   set on the new row; no prior row existed for `license` so no
   `superseded_by` write was expected or seen (acceptance item 6).
7. **Paper word flips** — Both faces (guest page and studio company card)
   now read "Current" for the license (`05-confirmed-current.jpg`).
8. **Log who was told** — Opened the Call Sheet for the Okonkwo residence
   project → "Open the site access card" → "Log who was told" → checked
   Sam Rowe → "Save this note". Verified via psql:
   `project_site_access_cards.told_refs` gained exactly one new uuid
   (Sam Rowe's), `updated_at` bumped; `studio_touches` gained exactly one
   new row (`subject_type='project'`, `direction='out'`,
   `notified_refs={Sam Rowe's id}`, `notice_of` text matching the on-screen
   sentence). Card was written before the touch, per S-7's ordering
   decision. UI confirmation copy ("One more name is on the notice.") and
   the updated "Told:" sentence rendered correctly. Console clean
   throughout (see §6).
9. **Unsubscribe test — not applicable to W4, see §5 Finding N-1.**

Company-card row click required a re-scroll/re-click once (stale
screenshot-vs-click coordinate drift, my own tooling artifact, not a
product bug) and a native `<input type="date">` needed digit-only typing
after clicking the leftmost segment (documented browser-automation quirk,
not a product bug). Neither is a finding.

## 4. Prior-round findings (`w4-review-r9-qa.md`) re-checked

| # | r9 finding | Severity | This round |
|---|---|---|---|
| 1 | Notice-log checkbox was a colour-only indicator | MAJOR | **FIXED, confirmed** — `notice-log.tsx` now renders a check glyph; jest suite `notice-log.test.tsx` (9/9) re-run this round including "marks a picked name with a check, not only with a colour" — passes. Live walk in §3 step 8 also shows the checked box rendering a checkmark, not just colour. |
| 2 | Dead paperwork link returns 200, not 404 | MINOR | **STILL OPEN — confirmed as deliberate**, unchanged. This is the same house pattern shared with `/plans/[token]` (never reveal whether a token once existed, acceptance item 4's intent) rather than a defect; carried forward as MINOR only per r9's own characterization. |
| 3 | Locator collision — `getByRole("heading",{name:"Paper"})` substring-matches a seeded "Paperwork E2E..." company, claimed as a deterministic failure in `paperwork-inbound.spec.ts` | MINOR | **DOWNGRADED — non-reproducing this round.** Ran the exact spec 3 times: pass, fail, pass. The failure on the 2nd run was `page.waitForTimeout: Target page, context or browser has been closed` inside `fixtures/auth.ts:69` — an unrelated auth-fixture flake, not the claimed locator collision. The locator text at line 182 is unchanged from what r9 examined. Recorded as its own new low-confidence MINOR item (N-2) below; r9 Finding 3 itself does not reproduce as originally described. |
| 4 | Low-confidence, non-reproducing notice-log save anomaly | MINOR | Not re-encountered this round; no new evidence either way. Leaving as previously resolved (likely session artifact). |
| 5 | Report terminology drift, `is_inbound` vs `inbound` | MINOR | Unchanged — still present in prose in the same report file; harmless, does not affect any gate. |
| 6 | Stale "owed" note in `w4-paperwork-report.md` §7 (says company-card inbound band / mint-revoke UI is outstanding, when the studio report already documents them as built) | MINOR | **STILL OPEN, unchanged.** Confirmed again this round via live walk: the inbound band and mint/revoke UI are in fact built and working (§3 steps 1, 5–6 above), so the note in `w4-paperwork-report.md` §7 remains stale. |

## 5. New findings this round

**N-1 (MINOR, high confidence) — "Unsubscribe via the landing page" is not an
applicable test for W4.** `upload-door-spec.md` §9 (the acceptance ground
truth) item 9 specifies the paperwork-door's only notification is an
in-app `notification_log` row (`channel = 'in_app'`); the door sends no
outbound email at all. `rulings.md` §3 has no ruling naming an unsubscribe
or channel-consent flow for this feature, and neither `w4-paperwork-report.md`
nor `w4-studio-report.md`'s decision lists (P-1..P-8, S-1..S-10) mention one.
The `studio_channel_consent`/unsubscribe-landing machinery that does exist
in the repo belongs to other programs (email deliverability, SMS consent —
see `rulings.md` R-AG..R-AY) and to other e2e suites
(`e2e/people/bring-forward.spec.ts`), not to this wave's feature. No send
exists in W4 to unsubscribe from, so this round did not force a false
finding by testing something out of scope; flagged here only so the
origin-task instruction's discrepancy is visible for whoever authored it.
**Fix**: none needed in code; the instruction template that asked for this
test should be corrected for future W4-specific QA rounds, or the test
should be pointed at whichever wave actually owns outbound paperwork-related
email.

**N-2 (MINOR, low confidence) — designer-portal `e2e/people` auth fixture
flake.** During the 3x re-run of `paperwork-inbound.spec.ts` (§4 item 3),
one run failed with `page.waitForTimeout: Target page, context or browser
has been closed` thrown from `fixtures/auth.ts:69`, unrelated to any
paperwork/inbound logic. Did not reproduce on the other 2 runs. Likely a
pre-existing timing flake in the shared auth fixture (consistent with the
studio report's own note that the wider `e2e/people` folder run showed
9 pre-existing/unrelated failures), not a W4 regression. **Fix**: none
attempted (out of W4 scope); worth a look by whoever owns `fixtures/auth.ts`
if it recurs.

No BLOCKING or MAJOR findings were produced this round. Every acceptance-list
item in `upload-door-spec.md` §9 that this round's manual walk and Playwright
runs could exercise passed: 1–2 (guest view, correct rows/words — §3.2),
3 (cross-tenant isolation — implicit in token scoping and RLS unchanged
since prior rounds, not independently re-probed this round beyond the
normal single-tenant walk), 4 (dead-link non-disclosure — confirmed as
deliberate, r9 Finding 2), 5–6 (upload-then-confirm write path — §3.3/§3.6),
7 (reject + `agent_tasks` enqueue — not exercised this round; no reject
action was performed, carried as untested-this-round rather than a finding
since r9/earlier rounds already covered it and no code changed), 8–9
(inbound band + in-app notification — §3.5), 10 (storage limits — not
re-exercised this round; unchanged code path, no finding), 11 (token
revoke two-step confirm — not re-exercised this round for the same reason),
12 (`expires_at` window — confirmed correct at mint time, §3.1), 13 (audit
trail — confirmed for mint/upload/confirm/notice-log; not independently
re-probed for reject/revoke this round).

## 6. Console-clean check

`read_console_messages` was checked on both the designer-portal tab and the
client-portal tab at multiple points through the walk (after mint, after
guest upload, after confirm, after the notice-log save) and returned no
console messages each time. No errors or warnings surfaced during any step
of the manual walk.

## 7. Teardown

- `kill` (graceful, no `-9` needed) sent to: designer-portal `next start`
  (pid 71398, port 3000), client-portal `next start` (pid 71397, port
  3002), and both `supabase functions serve paperwork-upload` processes
  (pids 70088, 70091). All four cwds were verified under the worktree
  before killing.
- Re-checked after 5s: `lsof -nP -iTCP:3000 -sTCP:LISTEN` and
  `-iTCP:3002` both return nothing. `ps aux | grep functions serve` returns
  nothing. Ports 3000/3002 confirmed free.

## 8. Verdict

**Clean.** Zero BLOCKING findings, zero MAJOR findings. Two carried-forward
MINOR items remain open by design/triage (r9 #2 dead-link 200, r9 #6 stale
report note), one r9 MINOR (#3) is downgraded to non-reproducing with a
narrower new MINOR logged in its place (N-2, an unrelated auth-fixture
flake), and one new MINOR (N-1) documents that the "unsubscribe" leg of the
originating task instruction does not apply to this wave's actual feature
surface. The core paperwork-door acceptance walk — mint, guest view,
upload, unverified-state correctness, inbound band, two-step confirm, paper
word flip on both faces, and the notice-log ("log who was told") write path
— was executed live end-to-end this round and verified against Postgres/
Storage state at every step, with no BLOCKING or MAJOR defects found.
