# W4 (paperwork upload door) — runtime QA, round 13

Worktree: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`
Branch: `build/people-room-crm-2026-09-11`
Run: 2026-09-16, local production builds (`next start`), fresh local DB reset before the run.
Ports: designer-portal 3000, client-portal 3002 — both confirmed free before start and confirmed free again after teardown (`lsof -nP -iTCP:3000/3002 -sTCP:LISTEN` empty). No port conflict encountered; PORT RULE not invoked.

## What ran

- `pnpm --filter @patina/designer-portal build --webpack` and `pnpm --filter @patina/client-portal build --webpack`, both green, inline env only (no `.env.local` created): `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`, anon/service keys from `supabase status -o env` (never printed), `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live`, `NEXT_PUBLIC_FLAG_OVERRIDES=the-document-pilot:true`, plus each portal's `.env.example` localhost service vars.
- `next start` for both portals in the background; `supabase functions serve paperwork-upload --no-verify-jwt` in the background.
- Playwright: `apps/client-portal/tests/paperwork-link.spec.ts` (3/3 passed — firm-facing paper table, expired-link dead-sheet, unverified upload landing) and `apps/designer-portal/e2e/people/paperwork-inbound.spec.ts` (1/1 passed — mint/send/confirm, paper word flip), both against the already-running `next start` servers (`reuseExistingServer: true`).
- `deno test --no-check -A --config supabase/functions/deno.json supabase/functions/_tests/paperwork-upload.test.ts` — 19/19 passed (token resolution, dead-token no-oracle, malformed-token short-circuit, insert-only RPC, storage-key tenancy, mime/size allowlist, rate-bucket address handling).
- `psql -f supabase/tests/people/w4_channels_touches_paperwork_test.sql` — all 22 named pgTAP-style blocks passed, including the two named-BLOCKING risk areas from `w4-data-edge-report.md` (§12 Checkout-address survival through the return window, §13 the `nonce_return_origin` mint guard) and the CRM-29 sha256/30-day/fresh-address/one-silence block (§4).
- Manual walk as Leah (`designer@patina.dev` / `password123`, password fallback — see Finding F-2) against Twin Cities Drywall & Plaster / Frank Bauer / Rosa Delgado on the Okonkwo residence project:
  - Minted a paperwork link, opened it as an anonymous "Rosa" in a fresh tab at the raw token URL, uploaded a small synthetic PDF as a licence. It landed unverified (`awaiting_check`) on both the firm-facing page and the studio's Paper table (R-BU, MAJOR-2 from r12 — still fixed).
  - Confirmed the document on the studio side; the firm's paper word flipped to `current` on both faces (company card Paper table and the firm's own `/paperwork/[token]` page).
  - Unsubscribed via the client-portal landing page's confirm flow; queried Postgres directly before/after and confirmed both `studio_contact_channels.status` and the matching `profiles.email_suppressed` flipped together (dual-ledger MAJOR-2 from r12 — still fixed).
  - Site Access card: confirmed PR-r live ("The code is held off Patina; ask Luis Ochoa.").
  - Logged "who was told": ticked a previously-untold name (Frank Bauer) in the checklist (confirmed it started unticked, matching S-6), saved. The card's "WHO WAS TOLD" sentence updated first (added Frank Bauer, plus "One more name is on the notice."); a fresh `studio_touches` row then confirmed in Postgres (`subject_type='project'`, `notice_of` = the way-in sentence, `notified_refs` = Frank Bauer's `project_parties.id`, `decision_class='none'`, `authority_check='n/a'` — consistent with the table's own check constraint and with this being a notice-of-a-prior-decision, not a fresh decision).
  - Acceptance-list spot checks (`upload-door-spec.md` §9):
    - #3 (cross-tenant/forged `company_id`): covered by the Deno suite's "storage key takes its studio and firm from the token, never the form" and by the SQL suite's tenancy/RLS blocks (§2b, §5b) — not independently re-walked live this round given that coverage.
    - #4 (expired/revoked/unknown token, no existence oracle): live-checked — revoking a freshly-minted token immediately made it indistinguishable from an unknown/malformed token (same "This link isn't available" copy, same generic dead sheet). See Finding F-1 for the literal-"404" wording gap between the spec/report and the actual (deliberate) HTTP-200 behavior.
    - #10 (oversized/wrong-mime rejected before the RPC): covered by the Deno suite ("a file outside the mime allowlist or over 15 MB never uploads").
    - #11 (Revoke act): live-checked on a freshly-minted token — REVOKE opens an inline two-step confirm with an optional "why it closes" reason field, "CLOSE THIS DOOR" shows a "Paperwork link closed." toast and the Access Grants band immediately reads "No grant on file."; the same raw token then 200s into the generic dead sheet with no distinguishing detail (see F-1 on the status code specifically).
  - Accessibility (M-1 fix, live on `/paperwork/[token]`): scripted check of the "Add COI, general liability" disclosure button — `aria-expanded` false→true on click, `aria-controls` points at a real, now-existing panel id, focus lands inside the panel (on its file input), and an `aria-live="polite"` region announces "The COI, general liability form is open." Fix holds.
- Browser console: clean throughout every act above (mint, upload, confirm, revoke, unsubscribe, log-who-was-told). One error was logged earlier in the session, unrelated to any of the above — see Finding F-2.
- Teardown: all three background processes (`next start` ×2, `functions serve`) stopped via TaskStop; `lsof` confirms ports 3000 and 3002 free again.

## Re-check of `w4-fix-log-r12.md`

| Item | r12 status | r13 result |
|---|---|---|
| MAJOR-1 — anonymous door rate-limit sweep cron | fixed | **still fixed** — SQL suite block 16 passed live (broom scheduled at :23, sweeps the day-old row, leaves the live one) |
| MAJOR-2 — unsubscribe dual-ledger (channel token also suppresses `profiles`) | fixed | **still fixed** — re-walked live, confirmed in Postgres |
| MAJOR-2 (studio report's own numbering) — `compliance_state` excludes pending/unverified documents (R-BU) | fixed | **still fixed** — re-walked live end to end (mint → anonymous upload → `awaiting_check`, never `current`, on both faces) |
| MAJOR-3 — field-link Paperwork section not built for crew/site-contact holders | recorded, deferred to W6, not a fresh finding | **unchanged** — still absent by design, not re-flagged here |
| M-1 — `paperwork-sheet.tsx` accessible disclosure | fixed | **still fixed** — scripted aria/focus/live-region check passed live |

No regressions found in any r12 item.

## Rulings

Nothing here contradicts a `rulings.md` §3 ruling; R-BU, R-CA, R-AD, R-AF, PR-r, S-6/S-7 were all directly exercised and held.

## Findings

See structured output. Summary:

- **F-1 (minor)** — `upload-door-spec.md` §9 items 4 and 11, and `w4-paperwork-report.md`'s test-coverage line, describe the dead/revoked-token page response as "404s the page" / "all 404", but the live `apps/client-portal/src/app/paperwork/[token]/page.tsx` deliberately returns HTTP 200 with a custom `DeadLink` sheet for every dead flavor (malformed, unknown, expired, revoked) — confirmed with `curl -o /dev/null -w '%{http_code}'`. This is an intentional, already-documented fix from a prior round (code comment: "THE DEAD DOOR, WHICH IS NOT A HOMEOWNER'S 404 (W4 r2 MAJOR-4)" — an actual 404 used to bounce a paperwork contact with no Patina account into the portal's authenticated sign-in wall). The behavior is functionally correct and safe (identical response across all dead flavors, no existence oracle, matches the edge function's own 403 for the same cases) — only the spec/report wording is stale.
- **F-2 (major, low confidence, likely out of W4's own scope)** — Leah's designer-portal sign-in via "Email me a one-time code" failed twice during this walk ("We couldn't sign you in just now. Please try again."), and the browser console recorded one logged `AppError` from that flow (`.../auth/signin/page-*.js`). I fell back to the password flow (`designer@patina.dev` / `password123`), which worked immediately, and did not further root-cause the OTP path (could be a genuine OTP/mailer issue, or a QA-side timing/Inbucket-retrieval artifact of this local run). This is the only console error observed in the entire session — everything else (mint, upload, confirm, revoke, unsubscribe, log-who-was-told) stayed clean. Flagging because "browser console clean throughout" was a binding requirement and a real logged error did occur, but it sits outside the W4 paperwork-door/people-room surfaces this pass otherwise covers.
- **F-3 (minor, QA-methodology)** — My designer-portal build env omitted `NEXT_PUBLIC_CLIENT_PORTAL_URL` (present in `apps/designer-portal/.env.example` but not called out in this task's required inline-env list), so every "shown once" paperwork-link address this round printed the production hostname (`client.patina.cloud`) instead of `localhost:3002`. I substituted the correct host by hand for every link before using it. No mechanics of the door itself were affected (token generation, hashing, and resolution are host-independent), but this is worth carrying forward to r14's env setup, and is at minimum a documentation gap if this var is ever similarly missed in a real deploy.

## Screenshots

Not saved to `artifacts/people-room-crm-2026-09-11/build/qa-w4-r13/` this round: the browser-automation tool available in this session returns screenshots as inline image results with no exposed on-disk path or save primitive, and no cached copies were found under `/tmp` or the session's scratch directories to copy forward. Every act in the walk above was still visually verified inline (screenshot-per-step) before moving on; the directory was created (currently empty) for the next round to populate if a save path becomes available.
