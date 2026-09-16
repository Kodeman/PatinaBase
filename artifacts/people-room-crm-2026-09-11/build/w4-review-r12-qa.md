# W4 — runtime QA, round 12

Runtime QA of local **production builds** (`next build` + `next start`, never `next dev`)
of both the designer portal (:3000) and client portal (:3002), against the local Supabase
stack, against `upload-door-spec.md` §3/§6/§9 and the three W4 surface reports
(`w4-paperwork-report.md`, `w4-studio-report.md`, `w4-help-report.md`). Every ruling in
`rulings.md` §3 is treated as settled and is not re-litigated as a finding. Prior fixes in
`w4-fix-log-r11.md` (MAJOR-1, MAJOR-2, M-1) were re-checked against the current code, not
just assumed.

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`, branch
`build/people-room-crm-2026-09-11`, local DB
`postgresql://postgres:postgres@127.0.0.1:54322/postgres`. No prod anything touched: no
`db push`, no `functions deploy`, no secrets set. No new migration was needed.

**Verdict: CLEAN.** Zero blocking, zero major. Five informational/minor notes below, none
of which gate — three are about this QA session's own tooling, not the product.

---

## What was walked

1. **Reset + local production builds.** `supabase db reset --workdir .` (local stack only),
   then `next build` and `next start` for both portals with the local stack's env values
   passed inline (no `.env.local`, none created) — `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` from `supabase status -o
   env`, `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live`,
   `NEXT_PUBLIC_FLAG_OVERRIDES=the-document-pilot:true`, and each portal's local service
   URLs. Both started in the background on :3000/:3002 after the PORT RULE listener check
   found nothing orphaned on either port. `supabase functions serve paperwork-upload
   --no-verify-jwt --workdir .` served in the background for the upload door.

2. **The mint → upload → inbound → confirm → flip cycle**, walked as Leah (designer
   portal) and Rosa (client portal, fresh browser context):
   - Leah opens Twin Cities Drywall & Plaster's company card and mints a paperwork link.
     The address is shown once, with "Ends 16 October 2026" and a Revoke act
     (`01-leah-mint-link.jpg`).
   - Rosa opens the minted link fresh (no cookies, no login) and uploads a small generated
     PDF as the licence.
   - Rosa's page shows "Licence, not yet checked." / "Received. Local Dev Studio will
     confirm it." (`03-rosa-upload-receipt.jpg`) — the row lands with `source='field_link'`,
     `inbound=true`, `verified_by`/`verified_at` NULL, exactly per spec §5.
   - Leah's company card shows the access grant ("Paperwork link … Ends 16 October 2026" +
     Revoke) and the Paper region's inbound queue band ("1 DOCUMENT WAITING FOR YOUR
     CHECK", the licence row, Confirm/Reject) (`02-inbound-band-and-grant.jpg`).
   - Leah confirms. The band empties, the licence flips to CURRENT, and a toast confirms
     the write (`04-confirm-flip-current.jpg`). `compliance_state()`'s worst-first
     reduction, its exclusion of `rejected_at IS NOT NULL` and `(inbound AND verified_at IS
     NULL)` rows, and the notification recipients all matched spec and R-AC.
   - `reject_inbound_document()`'s body (migrations, read directly) confirmed it only
     writes `studio_compliance_documents` and calls `enqueue_agent_task(... p_status =>
     'awaiting_review')` — no send code anywhere in it, consistent with the Agent OS "no
     automated external sends" rule.

3. **Unsubscribe via the landing.** No natural W4 flow currently mints a
   `channel:<uuid>` unsubscribe token for a paperwork chase specifically (paperwork chases
   never auto-send — see above), so to exercise the real, shipped CRM-12 mechanism
   (migration 00635, `packages/notifications`) a token was hand-signed for Rosa's email
   channel, matching `generateUnsubscribeToken`'s exact shape (`HS256`, issuer
   `patina:notifications`, 72h expiry). Opening it on `/preferences/unsubscribe` produced
   `status=applied&type=compliance_document_inbound&scope=address`
   (`05-rosa-unsubscribed.jpg`), and `studio_contact_channels` confirmed every row sharing
   that email (`channel_kind IN ('email','ap_email')`, `status IN ('active','bounced')`) was
   set to `status='unsubscribed'` — the address-wide scope from the W4 r4 MAJOR-2 fix,
   correctly distinguished from the narrower account-scoped path. There is no live
   paperwork-chase send to re-attempt and see refused (see note 5 below); the mechanism
   itself was verified directly instead.

4. **Log who was told, and the touch.** On the Okonkwo residence Site Access Card, "WHO WAS
   TOLD" read "The way in changed 16 Oct 2026, by Leah Hartwell. Told: Luis Ochoa, Ngozi
   Eze, Joe Wozniak, Dana Kowalski." (post-reset clean state, 4 names). "Log who was told" →
   checked Carol Nyström → "Save this note". The card updated immediately to include "Carol
   Nyström" (5 names) with the confirmation "One more name is on the notice." — the
   card-write-first half of S-7. `studio_touches` then held exactly one new row:
   `subject_type='project'`, `direction='out'`, `notice_of='The way in changed 16 Oct 2026.
   Lockbox, version 3.'` (the card's own sentence, no code, per PR-r), `notified_refs`
   holding Carol's one seat id — the durable-second half of S-7, confirmed by direct query
   (0 rows before, 1 after).
   - **Seeing the touch elsewhere:** Carol Nyström's person profile (`/people?person=…026`)
     shows, under HISTORY, "Worked 1 of the studio's project. Last touch 16 Sep 2026." —
     exactly the `LastTouchLine` behavior `w4-studio-report.md` §2(b) describes: every
     clause the record does not hold (channel, decision class, authority sentence — all
     empty/`none`/`n/a` on this touch) is dropped rather than guessed, leaving only the bare
     date. `people_directory` has no row for Carol (0 rows), confirming this came from
     `studio_touches` directly and not the coarse rolodex fallback, matching the report's
     description of the population E13 has no row for yet.

5. **Playwright, the new specs, against the running local-prod builds** (not `next dev`,
   `reuseExistingServer: true` in both configs):
   - `apps/client-portal/tests/paperwork-link.spec.ts` — **3 passed** (chromium).
   - `apps/designer-portal/e2e/people/paperwork-inbound.spec.ts` — **1 passed**, 2 skipped
     (webkit/firefox projects are configured to skip this spec; chromium is the one that
     runs it).
   - `apps/designer-portal/e2e/people/call-sheet.spec.ts -g "logging who was told"` — **1
     passed**, 2 skipped (same chromium-only pattern).
   - No cross-test poisoning of the seeded studio was observed — `paperwork-link.spec.ts`'s
     own cleanup (see note 3 in the r11 re-check below) removed every fixture it minted.

6. **Re-checking `w4-fix-log-r11.md` against the current code** (not assumed fixed):
   - **MAJOR-1** (Playwright spec poisoned the seeded studio): the file's header still
     documents "CLEANUP IS THIS FILE'S OWN JOB (W4 r11 MAJOR-1)" and every fixture minted
     in `mintDoor()` is torn down in `afterAll` — confirmed present, and the r12 Playwright
     run (note 5 above) left no leftover `Paperwork E2E …` cards.
   - **MAJOR-2** (rate-bucket existence-oracle leak): read
     `paperwork_link_rate_limit_hit()`'s live body in `00637_paperwork_upload_door.sql` —
     the liveness predicate (`t.status = 'active' AND t.expires_at > now()`) and the
     hashed-token fallback bucket for a dead/unminted token are both present, with the
     comment explicitly naming "THE LIVENESS PREDICATE IS THE RESOLVERS' OWN (W4 r11
     MAJOR-2)". Confirmed still fixed, not regressed.
   - **M-1** (seat-window consequence-sentence copy): `seat-window-band.tsx` still carries
     the r11 comment and the corrected sentence. Confirmed still fixed.

7. **Console.** Both portals' key surfaces (designer person profile, client unsubscribe
   outcome page) were reloaded fresh and read with `read_console_messages` after the
   reload; zero messages on either — clean.

8. **Shutdown.** Designer portal (:3000, PID 25514) and client portal (:3002, PID 25502)
   killed; `supabase functions serve paperwork-upload` (wrapper PID 25790, CLI PID 25795)
   killed and confirmed unreachable afterward (`OPTIONS` → no response). `lsof -nP
   -iTCP:3000 -sTCP:LISTEN` and the :3002 equivalent both came back empty after shutdown —
   ports confirmed free. No orphaned `chrome-headless-shell`/Playwright processes remained.

---

## Findings

No blocking findings. No major findings. The five items below are informational/minor and
do not gate (three are about this session's own QA tooling, not the product; the other two
are process notes named honestly per the task's "never filter" instruction).

### MINOR-1 — `supabase functions serve <name>` serves every function, not just `<name>`

**Severity:** minor · **Confidence:** high

**Claim:** Invoking `supabase functions serve paperwork-upload --no-verify-jwt --workdir .`
brought up every edge function in the workdir, not only `paperwork-upload` — verified by
curling an unrelated function (`aesthete-ask`) and getting a 200/204 response despite it
never being named on the command line.

**This is Supabase CLI (2.117.0) behavior, not a W4 product defect** — the flag scopes
which function's logs/reload the CLI reports, not which functions it loads. Named for the
record per the task's "never filter" instruction; nothing to fix in this repo.

### MINOR-2 — mobile-width (390px) rendering could not be literally confirmed this round

**Severity:** minor · **Confidence:** high (about the limitation itself; the product's
mobile behavior was not independently disproven)

**Claim:** `resize_window` to 390×844 did not change the actual rendered viewport in this
session's Chrome automation environment — `read_page` continued to report the desktop
viewport regardless of when the resize call was made, and screenshots rendered at desktop
widths throughout. This is a tooling limitation of the current claude-in-chrome
environment, not a finding against the product. Functional testing (the full mint → upload
→ confirm cycle) proceeded and passed at the available width; the literal 390px rendering
was not independently confirmed this round and should not be read as either passing or
failing an a11y/responsive contract — it is simply unverified by this session.

### MINOR-3 — this session's own env script had gone stale across the context-compaction boundary

**Severity:** minor (QA-process note, not a product finding) · **Confidence:** high

**Claim:** `/tmp/claude/env-common.sh`, written earlier in this session, carried a
truncated/stale `SUPABASE_SERVICE_ROLE_KEY` value by the time the Playwright suites ran
after this session's context-compaction boundary — the client-portal spec failed all three
tests on first attempt with `SUPABASE_SERVICE_ROLE_KEY must be exported from the LOCAL
stack`, and a length check confirmed the value in the file was far short of a real JWT.
Regenerating the file from a fresh `supabase status -o env` fixed it immediately; all three
specs then passed. No product code was involved — this was purely this QA session's own
scratch file going stale. Named for the record; nothing to fix in the repo.

### MINOR-4 — `supabase_pooler_supabase` reported stopped during this session

**Severity:** minor · **Confidence:** medium

**Claim:** `supabase status --workdir .` printed `Stopped services:
[supabase_pooler_supabase]` during this round's runs. Core services (Postgres on :54322,
Auth/REST/Storage/Functions on :54321, Studio on :54323) remained up throughout, and every
DB operation in this walk went through the direct Postgres port, so no tested flow was
observed to depend on the pooler. Named for the record since the task says never filter;
not a W4 product finding, and not chased further (out of scope for this wave).

### MINOR-5 — "confirm the next send is refused" has no live paperwork-chase send to refuse

**Severity:** minor (report/scope-accuracy note) · **Confidence:** high

**Claim:** `upload-door-spec.md` does not describe an unsubscribe flow, and the paperwork
chase path never sends email automatically — `reject_inbound_document()`'s body (read
directly from `00637_paperwork_upload_door.sql`) only calls `enqueue_agent_task(...
p_status => 'awaiting_review')`, consistent with the Agent OS "no automated external
sends — drafts land `awaiting_review`" rule, and no other code path in this wave sends a
paperwork-related email either. So there is no live send this task's "confirm the next send
is refused" clause can be run against for this specific door. Note 3 above shows the
underlying channel-unsubscribe mechanism (CRM-12) does work correctly when exercised
directly; this note is only that the paperwork-chase send it would gate does not exist yet
to test end-to-end. Not a defect — the send simply has not been built, by design.

---

## Screenshots

`artifacts/people-room-crm-2026-09-11/build/qa-w4-r12/`:

- `01-leah-mint-link.jpg` — company card, minted link address, "shown once"
- `02-inbound-band-and-grant.jpg` — access grant + inbound queue band
- `03-rosa-upload-receipt.jpg` — Rosa's post-upload page
- `04-confirm-flip-current.jpg` — post-confirm: band empty, licence CURRENT
- `05-rosa-unsubscribed.jpg` — unsubscribe landing success page
