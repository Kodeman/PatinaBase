# W4 Runtime QA — Round 6

Local production build QA against both portals for the paperwork-upload door (W4), performed
against the local Supabase stack (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`) and
local production builds of designer-portal (:3000) and client-portal (:3002), with
`paperwork-upload` served locally (`supabase functions serve paperwork-upload --no-verify-jwt`).

Inputs read in full before the walk: `w4-paperwork-report.md`, `w4-data-edge-report.md`,
`w4-studio-report.md`, `upload-door-spec.md` §3/§6/§9, `w4-fix-log-r5.md`, `rulings.md` §3.

## Procedure followed

1. PORT RULE applied to 3000/3002 — both free at start, no orphan process found.
2. `supabase db reset --workdir .../agent-people-build` (local DB owned by this wave).
3. `next build` for designer-portal and client-portal with the inline local env (no
   `.env.local` created or read; values sourced from `supabase status -o env`, never printed).
4. `next start` for both, backgrounded, on 3000/3002.
5. `supabase functions serve paperwork-upload --no-verify-jwt --workdir .../agent-people-build`,
   backgrounded, against local API (:54321).
6. Both portals' Playwright suites run against the local prod build for the new specs.
7. Manual walk as Leah (designer, signed in) + Rosa (guest, bearer-token `/paperwork/[token]`,
   fresh browser context at 390px) via the local Mailpit/Inbucket-equivalent flow — mint,
   upload, inbound band, confirm, paper-word flip, unsubscribe landing + next-send refusal,
   "log who was told" + touch.
8. Console checked clean on both portals.
9. Full teardown: designer/client servers and all `supabase functions serve` processes killed;
   ports 3000/3002 confirmed free (no listeners) after teardown.

## Gates (this round, local build)

- Designer-portal Playwright: `apps/designer-portal/test-results/.last-run.json` →
  `{"status":"passed","failedTests":[]}`.
- Client-portal Playwright: `apps/client-portal/test-results/.last-run.json` →
  `{"status":"passed","failedTests":[]}`.
- Designer-portal browser console: no messages (clean) on `/doc/d0e00000-…000a` through the
  full call-sheet → site-access-card → notice-log flow.
- Client-portal browser console: clean throughout the paperwork upload and unsubscribe walk.
- Both portal dev servers emitted only the known, pre-existing `next start` +
  `output: standalone` warning (documented across many prior QA rounds — w2/w3 reports — not a
  new finding).

## Walk evidence

All screenshots at
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build/artifacts/people-room-crm-2026-09-11/build/qa-w4-r6/`:

1. `01-mint-designer-card.jpg` — Leah mints a paperwork link for Twin Cities Drywall & Plaster
   from the company card.
2. `02-upload-receipt-390.jpg` — Rosa's `/paperwork/[token]` page at 390px after uploading a
   generated COI PDF; page reads "Received." — matches upload-door-spec §3 copy exactly.
3. `03-inbound-band-designer.jpg` — the company card's inbound-queue band shows 1 document
   waiting for check, with doc type/date/firm-name copy per §6.
4. `04-confirmed-designer-paper.jpg` — after Leah confirms, the Paper table shows 3 rows, all
   current.
5. `05-firm-page-flipped.jpg` — Rosa's firm-facing page after confirm: all 3 document types read
   "current" — the paper word only flips on paper the studio holds (P-2), confirmed end to end.
6. `06-unsubscribe-applied.jpg` — the unsubscribe landing after Rosa's click, address-scope copy:
   "We've stopped all email from this studio to this address, including invoices and purchase
   orders." (W4 r5 F2 fix, still correct — the reader does not print the narrow token type).
7. `07-notice-logged-designer.jpg` — after "Log who was told" → select Rosa Delgado → "Save this
   note," the site-access card's "Who was told" line reads: "The way in changed 16 Oct 2026, by
   Leah Hartwell. Told: Luis Ochoa, Ngozi Eze, Joe Wozniak, Dana Kowalski, Rosa Delgado." with
   "One more name is on the notice." confirming the write.

### Send-refusal proof (beyond the existing unit test)

After Rosa's unsubscribe click, I ran a throwaway Deno script
(`/tmp/claude/w4-r6/walk-send-refusal.ts`) importing the **real** production
`supabase/functions/_shared/send-email.ts` (not a test double) against the real local DB:

- `resolveContactChannel()` → `status: "unsubscribed"`.
- `channelRefusesSend(status)` → `true`.
- `prepareCompliantEmail(...)` for a `po_sent` email to Rosa's address →
  `{"state":"suppressed","reason":"channel_unsubscribed", ...}`.

This proves the send gate genuinely refuses the next send to the now-unsubscribed channel,
walking the real code path end to end, not just the existing fake-client unit test.

### "Log who was told" — card-first, notice-second (S-7)

Confirmed via direct DB read after the UI action:

- `project_site_access_cards.told_refs` for the Okonkwo residence grew from 4 to 5 refs,
  gaining Rosa Delgado's `project_parties` id
  (`d0e30000-0000-0000-0000-000000000014`).
- A new `studio_touches` row landed:
  `subject_type='project'`, `subject_id` = Okonkwo residence, `direction='out'`,
  `notice_of='The way in changed 16 Oct 2026. Lockbox, version 3.'`,
  `notified_refs={d0e30000-...-000014}` (told_count 1) — matching the exact shape documented in
  `w4-studio-report.md` §5 ("project / out / … / 1 told"), and only naming the **newly** added
  person (not re-notifying the four already told), which is correct incremental-notice
  semantics.
- Resolved the notified ref against `project_parties`: `display_name = "Rosa Delgado"`,
  `company_name = "Twin Cities Drywall & Plaster"`, `project_id` = Okonkwo residence — the touch
  names the correct seat, in the correct studio/project, confirming W4R5-QA-F3 (cross-studio
  touch naming wrong seat) has not regressed.

## Re-check of round-5 fixes

| Fix | Status |
|---|---|
| W4R5-QA-F1 / R5-MAJOR-1 (pay-link expiry tested below the `v_dead` branch) | **Still fixed.** Confirmed present in `00636_invoice_link_hardening.sql` (comment "W4 r5 F1" at the `v_dead` branch, expiry check strictly after it). |
| W4R5-QA-F2 (unsubscribe landing printing the narrow token type instead of the actual scope) | **Still fixed.** Walked live: address-scope copy in `06-unsubscribe-applied.jpg` reads the whole-mailbox sentence, not "po sent emails." `appliedCopy()` in `page.tsx` branches on `outcome.scope`, confirmed by reading the file. |
| R5-MAJOR-2 / W4R5-QA-F3 (cross-studio inbound touch named wrong seat) | **Still fixed.** `recordConsentTouches` present in `supabase/functions/sms-inbound/pipeline.ts`; independently, this round's own "log who was told" touch correctly named the seat within the correct project/studio (see above). |

## Findings

None. Zero blocking, zero major, zero minor findings this round.

Everything walked — mint, guest upload at 390px, unverified-paper landing, inbound-queue band,
confirm, paper-word flip on both the designer and firm sides, unsubscribe application, next-send
refusal (proven against real send-gate code), and "log who was told" with its card-first/
notice-second dual write — behaved exactly per `upload-door-spec.md` and matches every ruling in
`rulings.md` §3. No new issues surfaced, and none of the round-1 through round-5 findings have
regressed.

**"clean" = true (zero blocking, zero major).**

## Teardown confirmation

- Designer-portal (:3000) server: killed.
- Client-portal (:3002) server: killed.
- All `supabase functions serve paperwork-upload` processes (including stray extras
  accumulated across this round's server-crash troubleshooting) killed.
- Post-teardown check: `lsof -nP -iTCP:3000 -sTCP:LISTEN` and `-iTCP:3002` both return no
  listeners. Ports confirmed free.

## Note on environment instability (not a product finding)

Mid-walk, the client-portal `next start` background process died unexpectedly (`ELIFECYCLE …
exit code 143`, i.e. SIGTERM) between separate tool invocations, apparently a process-group/
session-teardown artifact of the sandboxed shell rather than anything in the product. It was
restarted and the remainder of the walk completed normally with the client-portal, designer-
portal, and edge function all confirmed healthy immediately before final teardown. Flagged here
for visibility only — not scored as a finding.
