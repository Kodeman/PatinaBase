# W4 — Runtime QA, round 14 (local production builds, both portals)

Worktree: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`
Branch: `build/people-room-crm-2026-09-11`
Local DB: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`
Scope read in full: `w4-paperwork-report.md`, `w4-studio-report.md`, `w4-help-report.md`,
`upload-door-spec.md` §3/§6/§9, `w4-fix-log-r13.md`, `w4-review-r13-qa.md`.
Settled and not re-litigated: every ruling in `rulings.md` §3.

Sibling reviews landed in this same round in this same folder — `w4-review-r14-code.md`
(adversarial code review: 0 blocking / 0 major / 33 minor) and `w4-review-r14-data-edge.md`
(data + edge review, with live probes: 0 blocking / 0 major / 13 minor). This report does not
re-derive their findings; it is the independent runtime walk against **local production builds**
(`next build --webpack` + `next start`, not `next dev`) of both portals plus the live
`paperwork-upload` edge function, exercised end-to-end through the browser and Mailpit.

## Verdict

**0 blocking · 0 major · 2 minor — clean = true.**

---

## 1. Environment (binding recipe followed)

- PORT RULE applied to 3000 and 3002 before starting anything: `lsof -nP -iTCP:3000/3002
  -sTCP:LISTEN` found no listeners at the start of this round, so no kill was needed.
- `supabase status --workdir <worktree> -o env` read live for local anon/service-role keys
  (never printed beyond passing as env to the commands below).
- Designer portal built with `pnpm --filter @patina/designer-portal build --webpack` and client
  portal with `pnpm --filter @patina/client-portal build --webpack`, both with every var each
  portal's own `.env.example` lists pointed at `127.0.0.1`/`localhost`, plus
  `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live`, `NEXT_PUBLIC_FLAG_OVERRIDES=the-document-pilot:true`.
  Both builds succeeded (`webpack` build path, no `next dev`).
- Started in the background: `PORT=3000 pnpm --filter @patina/designer-portal start` (pid 70041),
  `PORT=3002 pnpm --filter @patina/client-portal start` (pid 70168), and
  `supabase functions serve paperwork-upload --no-verify-jwt --workdir <worktree>` (pid 70244).
- No `.env.local` created anywhere; no `supabase db push`; no `supabase functions deploy`; no
  secrets set. No prod mutation of any kind.
- No new migration minted this round (nothing above 00595–00620 was reserved for this session);
  branch head is `00638_pay_link_readers_reheaded.sql` (confirmed via `ls supabase/migrations |
  tail`, cross-checked against the data/edge review's MIN-1).

## 2. Automated gates run fresh this round

| Suite | Command | Result |
|---|---|---|
| Deno, edge function | `deno test --no-check -A --config supabase/functions/deno.json` (`_tests/paperwork-upload.test.ts`) | **19/19 passed** |
| Deno, email channel status | same config, `_tests/email-channel-status.test.ts` + `resend-webhook/` | **59/59 passed** (re-confirms r13 MAJOR-1 dual-ledger fix still holds) |
| SQL (pgTAP-style) | `psql -v ON_ERROR_STOP=1 -f supabase/tests/people/w4_channels_touches_paperwork_test.sql` | all 16 named blocks (+ sub-blocks) passed, transaction rolled back, no data persisted |
| Playwright, client-portal | `pnpm --dir apps/client-portal exec playwright test paperwork-link.spec.ts --project=chromium` | **3/3 passed** (3.2s) |
| Playwright, designer-portal | `pnpm --dir apps/designer-portal exec playwright test e2e/people/paperwork-inbound.spec.ts --project=chromium --workers=1` | **1/1 passed** (6.5s) |

All green, against the local-production builds actually running on 3000/3002 (`reuseExistingServer:
true`), not a dev server.

## 3. Manual walk (Leah, Inbucket/Mailpit, fresh context at 390px as Rosa)

1. Signed in fresh as `designer@patina.dev` via OTP retrieved live from Mailpit's HTTP API
   (`/api/v1/messages`) — succeeded on the first attempt, zero console errors. This directly
   reproduces r13 fix-log's conclusion that F-2 (OTP failure) was a stack-restart artifact, not a
   product defect: on a clean stack the OTP rail is green end to end.
2. Opened the Twin Cities Drywall & Plaster company card in **The People Room**, confirmed Rosa
   Delgado as paperwork contact / site contact, and used **Mint a paperwork link**. The link
   printed as `http://localhost:3002/paperwork/<64-hex-token>` — correctly `localhost:3002` this
   round because `NEXT_PUBLIC_CLIENT_PORTAL_URL=http://localhost:3002` was included in the
   designer-portal build env (see §5, re-check of r13 F-3). Screenshots
   `01-leah-signed-in-company-card.jpg`, `02-mint-paperwork-link.jpg`.
3. Opened the minted link in a **fresh browser context** at **390px width**, as Rosa (no Leah
   session, no cookies carried over). Uploaded a small synthetically-generated valid PDF
   (`coi-test.pdf`, 432 bytes) as a Licence document through `paperwork-upload-form.tsx`. The
   upload succeeded through the locally-served `paperwork-upload` edge function
   (`--no-verify-jwt`, credential checked in-body against the token) and the firm's own page
   immediately reflected the new document as **"Licence, not yet checked. Received. Local Dev
   Studio will confirm it."** — landing unverified, exactly per spec §3. COI and W-9 rows stayed
   `current`, undisturbed. Screenshot `03-firm-page-unverified-after-upload.jpg`.
4. Back on the studio side (Leah's session), the company card showed the **inbound queue band**:
   "1 DOCUMENT WAITING FOR YOUR CHECK — Licence, uploaded 16 Sep 2026 by Twin Cities Drywall &
   Plaster." with `CONFIRM` / `REJECT` acts, per §6. The **Access Grants** row for the paperwork
   link correctly flipped to `used 16 Sep 2026` (proving `last_used_at` bumped on upload).
   Screenshot `04-inbound-queue-band.jpg`.
5. Pressed **Confirm** through the documented two-step inline pattern (no modal). A toast read
   "Licence, uploaded 16 Sep 2026 by Twin Cities Drywall & Plaster is confirmed." and the Paper
   table gained a third `current` row (Licence, `MN-DRY-99001`, State of Minnesota, expires 1 Jan
   2028) alongside COI and W-9. Screenshot `05-confirm-act-toast.jpg`.
6. Reloaded the firm-facing `/paperwork/<token>` page (still the same fresh 390px context, no
   re-auth needed — bearer-token guest route): all three documents now read **"current."**,
   including Licence — the paper word correctly flipped on **both** faces from the same act.
   Screenshot `06-firm-page-paper-word-flipped.jpg`. This directly confirms the round-1 fix (both
   the `compliance_state()` DB reducer and the portal code excluding
   `inbound AND verified_at IS NULL` rows from the paper word) is still holding — an unverified
   upload never flipped the word on its own; only the studio's explicit Confirm did.
7. Unsubscribed Rosa's email channel via the client-portal landing page
   (`/preferences/unsubscribe?token=...`): the GET landing rendered the unsettled
   "Turn these emails off?" state without mutating anything (screenshot
   `07-unsubscribe-landing.jpg`); pressing the button POSTed to `/api/unsubscribe`, which applied
   the token and rendered "You've been unsubscribed." (screenshot
   `08-unsubscribed-confirmation.jpg`). A DB query immediately after confirmed
   `studio_contact_channels.status = 'unsubscribed'` for that channel.
8. Proved the **send-gate itself refuses the next send**, not just the DB column: ran a standalone
   script that imports the real `resolveContactChannel` / `channelRefusesSend` functions straight
   out of `supabase/functions/_shared/send-email.ts` and invoked them live against the local DB via
   `@supabase/supabase-js`. `channelRefusesSend(status)` returned `true` for the now-unsubscribed
   address — the actual production gate logic refuses the channel, not merely a status flag an
   unrelated code path might ignore.
9. Logged who was told on a project's site-access card ("Log who was told" → checked Chidi
   Okonkwo → Save). First attempt was lost to my own coordinate-click miss (see below); redone by
   `ref`, it succeeded: the sentence updated to "One more name is on the notice.", and DB
   verification confirmed both `studio_touches` (new row with the expected `notice_of`,
   `notified_refs`, `decision_class='none'`, `authority_check='n/a'`) and
   `project_site_access_cards.told_refs` (5 entries, 4 original + the new one) landed — proving
   the card-first-then-notice write pattern (S-7). Also re-confirmed the PR-r ruling live: "The
   code is held off Patina; ask Luis Ochoa." Screenshot `09-log-who-was-told-updated.jpg`.

**Not a product finding:** the first "Log who was told" save attempt was lost to my own
coordinate-click landing on the wrong element after a scroll shifted the dialog's layout — not a
disabled/inert control. Re-clicking the same targets by `ref` (via `find`/`read_page`) instead of
raw pixel coordinates succeeded immediately, with the correct DB writes landing on the very next
try and zero console errors either time. No visible error state was ever shown to a real user in
this sequence.

**Console clean** on every tab checked, at every point in the walk, including a final explicit
`read_console_messages(onlyErrors: true)` pass on all three tabs before teardown — all three came
back "No console errors or exceptions found for this tab."

## 4. Blocking-criteria checklist (my own runtime evidence)

| Criterion | Result | Basis |
|---|---|---|
| Token accepted without verification | not met | Only a 64-hex token minted by Leah's own mint act resolved; the fresh Rosa context had no other credential and the upload only succeeded because the token itself was valid and unexpired. |
| A verified document overwritten | not met | COI and W-9 (both `current`, held by the studio) were untouched by Rosa's upload or by the confirm act; the new Licence document landed as a separate row. |
| Cross-tenant read/write | not met | Rosa's fresh context could only reach Twin Cities Drywall & Plaster's own paperwork state; no other firm's data was reachable from that token. |
| RLS/grant/storage-policy hole | not met (within this walk's reach) | Upload only succeeded through the edge function's service-role write path, never a client-side storage write. (The storage-policy `::uuid`-cast gap is covered as MIN-5 in the sibling data/edge review — not something this runtime walk could trigger, since the only writer is the edge function.) |
| Email sent to a dead/unsubscribed channel | not met | The real send-gate function (`channelRefusesSend`), invoked live, refused the unsubscribed channel. |
| A forged unsubscribe crossing subjects | not met | Only Rosa's own minted/resolved channel token was used; no cross-subject attempt was needed to observe correct scoping (token resolves to exactly one channel). |
| `/pay` link broken by the backfill | not exercised this walk | Outside this round's assigned walk; covered live by the sibling data/edge review's probe (Q5), which passed. |
| Reset failure | not met | `supabase db reset --workdir <worktree>` completed cleanly at the start of the round; branch replayed with no migration minted this round. |

## 5. Re-check of round 13's QA findings

| id | r13 severity | r14 status | evidence |
|---|---|---|---|
| F-1 | minor | **still open, unchanged** | The dead-link door is an intentional HTTP 200 `DeadLink` page (code-documented: "THE DEAD DOOR, WHICH IS NOT A HOMEOWNER'S 404"), not the 404 the spec/report wording implies. Not re-curled fresh this round (r13 already did so rigorously); consistent with what this round observed on a stale pre-reset tab before this round's own walk began. Only the spec/report wording is stale — no code changed. |
| F-2 | major (then explained) | **confirmed non-reproducing** | Fresh OTP sign-in this round succeeded on the first attempt with zero console errors — matches fix-log-r13's conclusion exactly ("No designer-portal auth defect is filed... The OTP rail — send, delivery, code, verify, session — is green end to end"). |
| F-3 | minor | **confirmed FIXED (by build-env inclusion, not a code change)** | Including `NEXT_PUBLIC_CLIENT_PORTAL_URL=http://localhost:3002` in the designer-portal build env this round produced a correctly-hostnamed mint link (`localhost:3002/paperwork/...`) instead of r13's `client.patina.cloud`. This is live confirmation that r13's diagnosis (the env var was simply missing from that round's build command) was the entire cause. |

## 6. Findings

Both are minor per the taxonomy (accuracy of the wave's own report files / QA process) — neither
holds the gate.

### QA-1 — this round's own build-env recipe should standardize `NEXT_PUBLIC_CLIENT_PORTAL_URL` *(minor, high)*
r13 filed F-3 (minor) noting the designer-portal build env omitted
`NEXT_PUBLIC_CLIENT_PORTAL_URL`, causing the "shown once" mint-link address to print
`client.patina.cloud` instead of `localhost:3002` — cosmetic only, no mechanics affected. This
round's build explicitly included it and the address printed correctly. No code changed between
rounds; only the QA build command did.
**Fix:** none needed in the product. Future rounds' local-prod-build env recipes for the
designer portal should include `NEXT_PUBLIC_CLIENT_PORTAL_URL=http://localhost:3002` by default so
this doesn't have to be independently rediscovered each round.

### QA-2 — F-1's dead-link wording still not corrected in the spec/report *(minor, medium)*
Carried forward from r13 unchanged: `upload-door-spec.md`/the wave reports describe an expired
link as producing a 404, when the shipped, deliberate behavior is an HTTP 200 `DeadLink` page (a
documented anti-scanner design choice, not a bug). This round did not re-curl it fresh (already
done rigorously in r13), but nothing in this round's walk or the sibling reviews suggests the
behavior changed.
**Fix:** update the spec/report wording to describe the 200-status DeadLink page rather than
"404s".

## 7. Teardown

- Console-clean confirmed on all three browser tabs (designer-portal, client-portal ×2) via a
  final `read_console_messages(onlyErrors: true)` pass before closing them.
- All three browser tabs closed.
- Background processes stopped: designer `next start` (pid 70041), client `next start` (pid
  70168), `supabase functions serve paperwork-upload` (pid 70244) — all three no longer found by
  `ps -p` after `kill`.
- Ports re-verified free: `lsof -nP -iTCP:3000 -sTCP:LISTEN` and `lsof -nP -iTCP:3002
  -sTCP:LISTEN` both returned empty after teardown.
- `supabase status` confirms `supabase_edge_runtime_supabase` stopped (the `functions serve`
  process it belonged to was killed); the shared local DB/Auth/Storage stack was left running, as
  it is shared across sessions per this wave's ownership window.
- No migration was minted; no prod mutation of any kind occurred at any point this round.

## 8. Screenshots

All under `qa-w4-r14/`:
`01-leah-signed-in-company-card.jpg`, `02-mint-paperwork-link.jpg`,
`03-firm-page-unverified-after-upload.jpg`, `04-inbound-queue-band.jpg`,
`05-confirm-act-toast.jpg`, `06-firm-page-paper-word-flipped.jpg`,
`07-unsubscribe-landing.jpg`, `08-unsubscribed-confirmation.jpg`,
`09-log-who-was-told-updated.jpg`.
