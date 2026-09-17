# Wave 1 integration walk — designer-portal at 1440x900

Run: `node walk.mjs` from `apps/designer-portal` in the integration worktree, dev server on
`:3000` (env vars passed inline, not via `.env.local` — see steward notes below).

## Result: blocked by shared-machine infrastructure exhaustion, not a code defect

Every screenshot in this walk shows the `/auth/signin` page, not the authenticated surfaces the
plan asked to capture. `page.waitForURL(/\/(desk|portal)/)` never resolved because sign-in itself
never completed — the app's own UI surfaced "We couldn't reach Patina just now" and a "QR is
unavailable" state (see `login-FAILED.png`, `03-keys-sheet.png`).

Root cause, confirmed independently of the app: at the time of this run the host was under
extreme concurrent load from other agent sessions sharing the machine —
`uptime` load averages peaked at **347 / 476 / 507** (1/5/15-min) during the dev-server's cold
compile, and even after the compile finished and the front end started responding (200s on
`/auth/signin`), the **local Supabase stack's own auth container stopped answering**:
`curl http://127.0.0.1:54321/auth/v1/health` returned `Empty reply` / connection-reset
(`curl` exit 56) repeatedly over several minutes, and even `docker ps` itself hung for 60s+ at a
time — i.e. Docker Desktop's daemon was starved, not just the Next.js app. The Next.js server log
shows the same symptom independently: a server-side fetch to Supabase failed with
`Error: read ECONNRESET` while generating a QR-login session, minutes before any Playwright step
ran. `docker ps` was still not returning after 4+ minutes when this report was written, with the
load average still elevated (recovering: 347 → 22 → 10 across the run).

This is the documented "shared local Supabase, many concurrent worktrees" risk
(project memory: `feedback_shared_local_supabase_stack_last_reset_wins.md`,
`feedback_workflow_output_cap_and_sandbox_boot.md`) manifesting as full resource exhaustion
rather than a data race. It is outside this task's control to fix; the fix is time (the load
average was falling throughout) or fewer concurrent sessions on the host.

## What the walk did capture, and what it means

| # | Step | Screenshot | Result |
|---|---|---|---|
| — | login | `login-FAILED.png` | Sign-in submitted correctly (email + password filled, "Sign in" clicked) but the app's own auth-network-error toast fired: "We couldn't reach Patina just now." Never reached `/desk`. |
| 01 | Desk help panel (⌘K → Help…) | `01-desk-help-panel-FAILED.png` | Not reached — still on signin, ⌘K/Help row never appeared, click timed out. |
| 02 | Document help panel | `02-doc-help-panel-FAILED.png` | Not reached — no `/doc/` link exists pre-login. |
| 03 | `?` keys sheet | `03-keys-sheet.png` | **False capture** — this is still the signin page (QR panel showing "QR is unavailable. Tap to try again.", itself evidence of the same auth outage). `?` has no signin-page binding so nothing opened; the screenshot just confirms step 02's failure state. |
| 04a/04b | ⌘K "keys" / "words" | `04a-command-bar-keys.png`, `04b-command-bar-words.png` | Same — signin page, command bar not mounted pre-auth. |
| 05 | Walkthrough step 6 → lead sheet | `05-walkthrough-step6-FAILED.png` | Not reached. |
| 06 | Help Center Featured fallback | `06-help-center-featured.png` | `/help` redirected to signin (auth-gated route) — screenshot is the signin page again; `helpCenterHasFallbackLine: false` in `labels.json` is expected given this. |
| 07 | Account → Studio checklist | `07-studio-checklist-FAILED.png` | Not reached. |

None of these are evidence the merged Wave-1 code is broken — they are evidence the auth backend
was unreachable for the whole run. The code-correctness signal for this wave is the gate suite
below, which ran against the same worktree and passed in full before the walk was attempted.

## What to do next

Re-run `node walk.mjs` from `apps/designer-portal` once `docker ps` returns promptly and
`curl http://127.0.0.1:54321/auth/v1/health` returns `200` — no code or env changes needed, the
dev server env vars and the script are already correct (confirmed: the app served `/auth/signin`
at 200 with the login form correctly filled and submitted). Kody or a following session should
re-run this before treating the wave as walked; the merge/gate work below stands on its own
regardless.
