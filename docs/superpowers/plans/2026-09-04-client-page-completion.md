# Client Page Completion — Plan (runs FIRST, before the retirement plan)

> **For agentic workers:** executed through Workflow scripts (one per wave). Each lane: own worktree
> `.codex/worktrees/agent-cpc-<lane>` on branch `client-page-2/<lane>` from `origin/main` (26b15145e or
> newer); explicit pathspecs; Conventional Commit; push; a SEPARATE reviewer; a fix round; then the
> integration lane merges onto `client-page-2/integration`. Lane reports go to
> `artifacts/client-page-completion-2026-09-04/waves/w1/<lane>.md` (durable path), never only the scratchpad.
> Every agent's FINAL action is its structured report — even when steps failed.

**Rulings (Kody 2026-09-04):** everyone gets the new portal, no feature flag; retire the old portal; use
workflows. Earlier rulings stand: Path B is the page; Path A its ground floor; any owning-studio member
writes the note; the drawing is a generated key.

**Goal:** the Threshold performs every act the old routes performed, in place, for solo and multi-project
clients, on real data — so the retirement plan can delete the old surface without loss.

**Spec of record:** `docs/superpowers/specs/2026-09-04-the-client-page-design.md` (§3 data map) +
`docs/design/the-client-page/path-b-the-threshold.html` (UI truth) + inventory §8 (the ABSORB list):
`artifacts/client-page-completion-2026-09-04/research/RETIRE-INVENTORY.md`.

## Global constraints (every lane)
- VISION §6: no shadows, red/green, badges, tabs, header, hamburger; scored-ink acts (`ScoredAction`);
  typography-first; page voice third person, first person only in a quoted note; never "AI". Money in cents.
- "Absence is silence": never guess, never print an error string as content; hold until sources settle
  (`threshold.tsx` settle gate); no copy that later reverses.
- Everything opens IN PLACE: unfold, lift, laid-in sheet/overlay inside the page — never a route change,
  never a header. Deep-link anchors are the ids fixed in Lane 5 of the first plan plus `#room-<roomId>`.
- Reuse existing `@patina/supabase` hooks and portal-local hooks; add a hook to `@patina/supabase` only
  when none exists (export from the barrel; vitest; admin build gate). No new tables in this plan.
- Types from `@patina/types` / generated `database.types.ts`. Tests ship with every file (jest floor
  70/60/70/70). Gates: `pnpm --filter @patina/client-portal type-check`, `test -- <your dirs>`, `npx eslint
  <your dirs>` 0 errors; full `test` at integration.
- `making/*` is reused, not edited (except where a lane below says otherwise). Keep `standing-sentence.ts`
  strings; new sentences live in `lib/threshold/standing.ts`.
- Flags: Lane L8 removes the `threshold`/`single-pane` reads; all other lanes leave the switch alone and
  build inside `components/threshold/`.
- Commits: pathspec-restricted; push the lane branch; never touch `main`. Sandbox: worktree add, pnpm
  install, Supabase CLI, Chromium and push need the Bash sandbox disabled — retry per command on a sandbox
  error. No local DB reset in lanes (jest only); the integration lane owns the stack.

## Wave 1 lanes (parallel)

### L1 — Approvals in place (Opus)
Absorbs `/decisions`, `/decisions/[id]`. `DoorstepApproval` in `threshold.tsx` currently links to
`/decisions/[id]`. Build `components/threshold/approval-ask.tsx`: the project approval as a doorstep ask —
title, what it decides, due date, the studio's rationale, comments thread (`useDecisionComments`), and
the acts Approve / Ask a question / Decline via `useRespondProjectApproval` (and the decision hooks the
old page used: read `src/app/decisions/[id]/page.tsx` for the exact hooks and payloads, copy them). On
respond: stamp "Approved <date>" / "Declined <date>" in place; ledger/sentence refresh via the existing
invalidations. Replace `DoorstepApproval` with it; keep `id="approval-<id>"` and `data-threshold-unit`.
Tests: renders the ask; approve calls the hook with the old page's payload; comment posts; declined state.

### L2 — Money in place (Opus)
Absorbs `/invoices`, `/invoices/[id]`, `/orders`. (a) Letterbox: "Settle the balance" starts checkout in
place via `useStartCheckout` + `useInvoicePaymentOptions` (the old `payment-method-chooser.tsx` logic,
copied); return URL `/projects/<id>#letterbox?checkout=success|cancel` — the letterbox reads `?checkout=`
on mount and shows "Paid <date>. Receipt in your email." / "Nothing changed." then cleans the query; edit
`making/spine-toll.tsx`'s outbound link (`spine-toll.tsx:112`) to an in-place act prop (this is the one
sanctioned `making/` edit; keep The Making's tests green). (b) "Earlier invoices" unfold in the letterbox:
every invoice (paid/open) as dated one-line receipts with "Print" → the existing `/invoices/[id]/print`
route in a new tab (print is a document, not chrome; it stays). (c) Direct orders: pieces from
`useDirectOrders` render on the road with their stop; "Pay for this piece" → `useStartDirectOrderCheckout`
with the same return-URL pattern. Tests for all three; the return-URL reader.

### L3 — Door acts (Opus)
Absorbs `/proposals`, `/proposals/[id]` (`/proposals/[id]/sign` is already the door). DoorGate gains
"Ask a question" (posts to the proposal's thread via the hook the old detail page used —
`useClientProposalFeedback` / comms), "Request changes" and "Decline" (`useDeclineProposal`, with the old
page's confirmation copy, byte-copied), and a "Read it in full" unfold that renders the instrument's
sections/items (the old detail page's read view, in place). Signed instruments in Previously unfold to
the same read view. Tests per act.

### L4 — Correspondence (Opus)
Absorbs `/messages`, `/inbox`. TheNote gains a reply field ("Write back") posting to the project's comms
thread (`useThreads`/`useSendMessage`; find the project thread the way `/messages` does); Previously lists
thread messages as letters (studio first person, client's own in plain type) with `useThreadRealtime`;
unread messages tick `note`/`previously` through `changed` (derive.ts: add message timestamps to the
changed rule — additive). Inbox notifications become Previously receipts (notification_log via
`useInboxNotifications`), marked read by the reading mark (`useMarkAllClientNotificationsRead` on the
same mount as `mark_project_read`). Mute/unmute act in the mat. Tests.

### L5 — Papers and rooms (Opus)
Absorbs `/documents`, `/scans`, `/scans/[id]`. Mat "The papers" → a laid-in sheet overlay inside the page
(`components/threshold/papers-sheet.tsx`): plan set via `useClientPlanSet` grouped as the old page did
(`documents/group.ts` copied), each sheet opening its viewer in the overlay; project documents
(`useProjectDocuments`); instruments (executed) → the door read view (L3's export). Room band "The room as
captured" → `useRoomScans` plate with share/revoke acts (`useShareRoomScan`, `useRevokeScanAccess`) and
the scan viewer in place. Overlay: no shadow, paper on paper with a hairline, dismissed by the same tab
that opened it, `role="dialog"`, focus trap, Esc. Tests.

### L6 — Asks: reviews and scope changes (Sonnet)
Absorbs `/reviews`, `/projects/[id]/reviews/[editionId]`, `/projects/[id]/scope-change/*`. Pending design
review requests (`useMyPendingReviewRequests`) render as doorstep asks with the edition in place and
"Send your review" (`useSubmitReview`, the old form's fields copied); submitted reviews in Previously.
Scope change: "Ask for a change" act in the mat and on a room band opens the old request form in place
(hooks from `scope-change/new/page.tsx`); a pending scope-change decision renders as a doorstep ask with
the old decide acts. Tests.

### L7 — Your details (Sonnet)
Absorbs `/account`, `/preferences`, `/settings/notifications`, sign-out. Mat "Your details" → in-place
sheet: name/email/phone (`useProfile`/`useUpdateProfile`), notification preferences (the old settings
page's hooks), data export/erase acts ONLY if the API routes have callers (inventory says none → omit and
say so). `/preferences/unsubscribe` stays a route (public; the retirement plan fixes middleware). "Leave the
house" = the portal's sign-out (already wired). Tests.

### L8 — Multi-project and routing, no flag (Opus)
Absorbs `/projects` (the list) and the header's project switcher. (a) `src/app/page.tsx` (`/`) renders the
Threshold for the client's ACTIVE project = the project with the greatest `greatest(updated_at, latest
note sent_at, latest invoice updated_at)` among `client_id = auth.uid()` (server-side, same fetchers
`projects/[projectId]/page.tsx` uses; extend `fetchClientProjects` only if needed); with zero projects
render the existing empty state minus header. (b) Mat gains "Your other houses": every other project as a
line linking to `/projects/<id>`; doorplate already names the house. (c) Remove the flag: `ProjectSurfaceSwitch`
renders `<Threshold>` unconditionally (delete the `single-pane`/`threshold` branches and the
`SinglePaneSoloRedirect` mount; keep `projectView` analytics firing once); `ThresholdChromeGate` → the
header is never rendered on `/` or `/projects/[id]` for any project count; `ThresholdRouteCollapse` fires
for every client (solo → its project; multi → `/`), no flag read. Do NOT remove the wrangler override var
(the ship lane does). Tests: active-project selection; other houses; switch renders Threshold with no flag
mock; chrome gate drops the header regardless of count.

### L9 — Real-data robustness and mock fidelity (Opus)
(a) Story pole: when a project has no `project_phases`, graduate from the house's six canonical phases
(Discovery · Design · Design refinement · Procurement · Installation · Completion) with the current one
inferred from the project's `currentPhase`/status; date ranges omitted. (b) Ledger: "of $X planned" from
the plan total else Σ `project_rooms.budget_cents`; owed row carries "· due <day month>"; "Held" row from
the wall bundles (already) and "Awaiting your name" from open doors. (c) Reading-mark dateline "Read here
on the <day in words>." beside the since control (from `usePreviousReadingMark`). (d) The note pinned to
the first open door's leaf as a short quote + "Read the note" anchor to `#note` (mock fidelity, no
duplication of the full body). (e) Room drawings: interior line work — a wall line, a floor line, the
door opening on the plan-key side; footprints already exist. (f) Tester-notes widget: it overlaps the
letterbox act on phone — add a page-level bottom padding equal to the widget's footprint and move the
widget's anchor to the right on ≤600px if it is portal-owned (find it under `components/`; if it is a
package, pad only). Tests for a–d.

## Wave 2 — Integration (one lane, Opus) then Fable review
Merge L1…L9 onto `client-page-2/integration` (subjects `chore(client-page-2): merge <lane> — …`); resolve
conflicts faithfully (expected: `threshold.tsx`, `mat.tsx`, `derive.ts` touched by several lanes — merge
in the order L9, L8, L1, L2, L3, L4, L5, L6, L7 and re-run each lane's tests after each merge); full gates:
DB reset + SQL suite (154/154 effective), `@patina/supabase` test + type-check, client type-check + full
jest with coverage, designer type-check + jest, admin build; e2e: `threshold.spec.ts` extended — solo
client lands on `/` and sees no header; multi-project client sees other houses; approve an approval;
settle-the-balance reaches the checkout start (mock Stripe); write back to the note; open the papers
sheet; the redirect from `/projects`. Report the first-viewport render (desktop + phone) to
`artifacts/client-page-completion-2026-09-04/waves/w2/`. Then the retirement plan's R1–R4.

## Not in this plan
Plan-set drawings replacing the key (later); the Today editorial feed (retired, not absorbed); data
export/erase (no callers); new tables.
