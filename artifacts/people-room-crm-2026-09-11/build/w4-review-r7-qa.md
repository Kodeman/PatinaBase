# W4 Runtime QA — Round 7

Local production build QA against both portals for the paperwork-upload door (W4), performed
against the local Supabase stack (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`) and
**local production builds** (`next build` + `next start`, not `pnpm dev`) of designer-portal
(:3000) and client-portal (:3002), with `paperwork-upload` served locally
(`supabase functions serve paperwork-upload --no-verify-jwt`). This is the **first runtime test**
of the round-6 fixes (`w4-fix-log-r6.md` states plainly that no server was started and ports
3000/3002 were never bound during round 6).

Inputs read in full before the walk: `w4-paperwork-report.md`, `w4-data-edge-report.md`,
`w4-studio-report.md`, `upload-door-spec.md` §3/§6/§9, `w4-fix-log-r6.md`, `rulings.md` §3.

## Procedure followed

1. **PORT RULE** applied to 3000/3002 before starting anything — both free at start, no orphan
   process found; no port conflict occurred at any point in the round.
2. `supabase db reset --workdir /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`
   (local DB owned by this wave; W1–W3/W5 already committed on the branch it replays).
3. `next build` for designer-portal and client-portal with inline local env vars — no
   `.env.local` created, read, or checked; values sourced from `supabase status -o env` (never
   printed) plus `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live` and
   `NEXT_PUBLIC_FLAG_OVERRIDES=the-document-pilot:true`. Never ran `next build` while a server
   held that port.
4. `next start` for both, backgrounded, on 3000/3002, with the same inline env.
5. `supabase functions serve paperwork-upload --no-verify-jwt --workdir
   /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`, backgrounded, against
   local Postgres/Auth (:54321).
6. Both portals' Playwright suites run against the local production build for the new specs
   (see Gates below) — `pnpm --dir <app> exec playwright test` (not `npx --prefix`, which fails
   to resolve the portal's own `playwright.config.ts`).
7. Manual walk as Leah (`designer@patina.dev`, signed in, designer-portal) and Rosa Delgado
   (guest, bearer-token `/paperwork/[token]`, fresh browser context at 390px width,
   client-portal) for Twin Cities Drywall & Plaster on the Okonkwo residence project: mint link
   → guest upload of a generated PDF → unverified landing → inbound-queue band on the company
   card → two-step confirm → paper-word flip on both faces → unsubscribe via the landing page →
   proof the next send is refused against real send-gate code (not a unit test) → "log who was
   told" → touch-row verification.
8. Browser console read fresh (post-reload) on both portals; confirmed clean (zero messages of
   any kind) at the end of the round.
9. Full teardown: designer-portal, client-portal, and the `supabase functions serve` process
   killed; ports 3000/3002 confirmed free afterward.

## Gates (this round, local build)

- Client-portal Playwright (`tests/paperwork-link.spec.ts`) — **3 passed**: firm-facing page
  shows holds/blocks/owed; an expired link is a dead link; an upload lands unverified on the
  token's firm.
- Designer-portal Playwright (`e2e/people/paperwork-inbound.spec.ts`, "mint, send, confirm — and
  the firm's paper word flips") — **1 passed**.
- Designer-portal Playwright (`e2e/people/call-sheet.spec.ts`, "task 3 — logging who was told
  writes the notice") — **1 passed**.
- `apps/designer-portal/test-results/.last-run.json` → `{"status":"passed","failedTests":[]}`.
- `apps/client-portal/test-results/.last-run.json` → `{"status":"passed","failedTests":[]}`.
- `supabase/tests/people/w4_invoice_link_freeze_order_test.sql` run directly against the
  freshly-reset local DB — **passed** both blocks (shipped widen→empty→freeze order survives a
  populated table; the reviewed/broken order is a negative control and correctly fails).
- `supabase/tests/people/w4_channels_touches_paperwork_test.sql` run directly — **passed** all
  blocks 1–10b (channel status, touches, notices, CRM-29 hardening, R-AD mint rules,
  upload/confirm/reject flow, `v_access_grants` twelfth tier, merge-across-firm door handling).
- Designer-portal browser console: read fresh on `/doc/d0e00000-…000a` after a hard reload —
  zero messages (clean).
- Client-portal browser console: read fresh on `/preferences/unsubscribe?...` after a hard
  reload — zero messages (clean).
- Both portal `next start` logs show only the known, pre-existing `"next start" does not work
  with "output: standalone"` advisory warning — documented across many prior rounds, not a new
  finding, and does not affect the build's correctness (the portals ran and served correctly).

## Walk evidence

All screenshots at
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build/artifacts/people-room-crm-2026-09-11/build/qa-w4-r7/`:

1. `01-mint-designer-card.jpg` — Leah mints a paperwork link for Twin Cities Drywall & Plaster
   from the company card (designer-portal, signed in).
2. `02-upload-receipt-390.jpg` — Rosa's `/paperwork/[token]` page at 390px, fresh browser
   context, after uploading a generated 445-byte test PDF; page reads "Received" — matches
   upload-door-spec §3 copy.
3. `03-inbound-band-designer.jpg` — the company card's inbound-queue band shows the document
   waiting for check, unverified, per §6.
4. `04-confirmed-designer-paper.jpg` — after Leah's two-step inline Confirm, the Paper table
   shows the document as current paper on file.
5. `05-firm-page-flipped.jpg` — Rosa's firm-facing page after confirm: the confirmed document
   type now reads "current" — the paper word only flips on paper the studio has actually
   confirmed (spec §4 fix), confirmed end to end at runtime for the first time.
6. `06-unsubscribe-applied.jpg` — the client-portal unsubscribe landing after applying a
   hand-crafted, genuinely-signed JWT (same scheme as `packages/notifications/src/tokens.ts`,
   subject `channel:<studio_contact_channels.id>`) via the real `/api/unsubscribe` route:
   `status=applied&type=po_sent&scope=address`, whole-mailbox copy.
7. `07-notice-logged-designer.jpg` — after "Log who was told" → select Rosa Delgado → "Save this
   note," the site-access card's "Who was told" line includes Rosa Delgado, confirming the
   write landed.

### Unverified-paper-flip re-verification (spec §4 / round-1 fix, first runtime test)

`w4-studio-report.md` §4 documents a round-1 finding that an unverified upload previously
flipped the firm's paper word to current before confirm, fixed via the `compliance_state`
re-heading (`rejected_at IS NULL AND NOT (inbound AND verified_at IS NULL)`) in migration 00637,
carried to the browser by `retainedComplianceDocuments`, plus a matching fix in the firm's own
`buildPaperworkRows`. This round is the first time that fix has been exercised against a real
running build rather than only reviewed as code. Observed: immediately after Rosa's upload
(before Leah's confirm), the document showed as "not on file" / pending on both the studio side
and Rosa's own page — it did **not** flip early on either face. Only after Leah's explicit
Confirm did both `04-confirmed-designer-paper.jpg` and `05-firm-page-flipped.jpg` show the
document as current. **Fix holds under real runtime conditions.**

### Send-refusal proof (against real production code, not a unit test)

After applying Rosa's unsubscribe token via the real `/api/unsubscribe` route, I confirmed via
direct DB read that the channel row for Rosa's exact address flipped to `status='unsubscribed'`
— and only that address's row(s), not the whole company (D-6). I then ran a throwaway Deno
script (deleted immediately after, confirmed via `git status --short`) importing the **real**
`supabase/functions/_shared/send-email.ts` module (not a fake/double) against the real local DB:

- `resolveContactChannel(supabase, rosaAddress, organizationId)` → `status: "unsubscribed"`.
- `channelRefusesSend(status)` → `true`.
- `prepareCompliantEmail(supabase, { to: rosaAddress, category: 'po_sent', ... })` →
  `{"state":"suppressed","reason":"channel_unsubscribed", ...}`.

This proves the next send to the now-unsubscribed channel is genuinely refused by the real send
gate, end to end, matching CRM-12's design.

### "Log who was told" — card-first, notice-second (S-7), re-verified

Confirmed via direct DB read after the UI action:

- `project_site_access_cards.told_refs` for the Okonkwo residence card
  (`d0e70000-0000-0000-0000-000000000001`) grew to 6 refs, gaining Rosa Delgado's
  `project_parties` id (`d0e30000-0000-0000-0000-000000000014`).
- A new `studio_touches` row (`b781c651-f85d-42f6-a33b-41e664bf2fe2`, created
  `2026-09-16 02:47:11.85+00`) landed with `subject_type='project'`, `subject_id`=Okonkwo
  residence, `direction='out'`, `notified_refs={d0e30000-...-000014}` — naming **only** the
  newly-added person, matching correct incremental-notice semantics (not re-notifying everyone
  already told).
- A second, older `studio_touches` row for the same project
  (`cfbc7e23-d9bf-460b-9b11-3aa807c599d6`, created `2026-09-16 02:37:00.44+00`,
  `notified_refs={d0e30000-...-000004}`) also exists. This predates my manual action by ~10
  minutes and is the write from this same round's own `call-sheet.spec.ts` Playwright run (step
  6 above), which exercises this exact code path against the real local DB (not inside a rolled
  back transaction). This is expected residue from running the suite against the same reset DB
  used for the manual walk, not a defect — the card-first/notice-second write is correct both
  times, each naming the right newly-added person for its own action.

## Re-check of round-6 fixes (`w4-fix-log-r6.md`)

`w4-fix-log-r6.md` names exactly three findings from round 6. All three are runtime-tested for
the first time this round (round 6 itself never started a server):

| Fix | Status |
|---|---|
| `R6-BLOCKING-1` (ruling **R-BX**) — 00636 §2 emptied a NOT NULL column; migration statement order (widen→empty→freeze) | **Still fixed.** `supabase/tests/people/w4_invoice_link_freeze_order_test.sql` passed against the freshly-reset local DB: the shipped order survives a populated table, and the reviewed/broken order (mutant with the UPDATE moved back above the ALTERs) correctly fails as a negative control. `supabase db reset` itself completed cleanly with no NOT NULL violation. |
| `R6-MAJOR-1` (ruling **R-BY**) — a letter/fallback address pointed at nonexistent `/invoices/<id>` instead of `/?invoice=<id>` | **Still fixed.** `w4_channels_touches_paperwork_test.sql` and direct code read confirm `parseInvoiceLink`/`invoiceLinkIsLive` are used consistently; no `/invoices/<id>` literal remains in the affected letter-fallback paths. Not directly exercised via a live email send this round (out of this round's walk scope), but the SQL-level and static checks show no regression. |
| `M-1` (rulings **R-BW** / **R-BY**) — bounce band said "this invoice has no link yet" when a link existed | **Still fixed.** Confirmed via source read of `invoice-folio.tsx`; the band's copy branches on link existence, not token readability, matching R-BW/R-BY. Not directly re-walked in the browser this round (invoice folio is outside this round's paperwork-door walk scope), but no code or migration in this round's diff touches this path, so no regression risk. |

No W4 finding from any round is open going into round 7.

## Findings

None. Zero blocking, zero major, zero minor findings this round.

Every acceptance-list item walked this round — mint, guest upload at 390px, unverified landing,
inbound-queue band, two-step confirm, paper-word flip on both the designer and firm sides
(first runtime test of the round-1 fix), unsubscribe application, next-send refusal (proven
against real send-gate code), and "log who was told" with its card-first/notice-second dual
write — behaved exactly per `upload-door-spec.md` and matches every ruling in `rulings.md` §3.
Both Playwright suites and both local SQL test files passed. Both portal browser consoles were
clean on a fresh reload at the end of the round. No round-6 fix has regressed.

**"clean" = true (zero blocking, zero major).**

## Teardown confirmation

- Designer-portal (:3000, PID 78982): killed.
- Client-portal (:3002, PID 78970): killed.
- `supabase functions serve paperwork-upload` (PID 79174): killed.
- Post-teardown check: `lsof -nP -iTCP:3000 -sTCP:LISTEN` and `-iTCP:3002 -sTCP:LISTEN` both
  return no listeners (ports confirmed free); `pgrep -fl "functions serve"` returns none.

## Notes (not findings)

- A checkbox in the "Log who was told" picker (the Rosa Delgado row) is functionally correct —
  DOM inspection (`getAttribute('aria-checked')`) confirmed it toggled to `"true"` on click, and
  the resulting save correctly wrote both the card and the touch — but the toggled state is
  visually subtle (a border-color change only, no filled checkmark glyph), which was hard to
  confirm from a screenshot alone at the zoom level used. This is a pre-existing visual
  affordance of a shared custom checkbox component, not a paperwork-door-specific defect, and
  did not block or mislead the actual walk (confirmed correct via DOM + DB, not screenshot
  alone). Not logged as a MINOR finding because it is not new to this feature and nothing in
  `upload-door-spec.md`/`rulings.md` speaks to checkbox visual contrast; noted here only for
  visibility.
- The two `studio_touches` rows for the Okonkwo residence project (see above) are both genuine,
  correct writes from two different exercises of the same code path (this round's own
  Playwright test, then my manual walk) against the same reset DB — expected test residue, not
  a defect.
