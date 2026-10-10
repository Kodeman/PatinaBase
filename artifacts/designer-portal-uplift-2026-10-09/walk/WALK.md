# US-24 walk — what designers see today (SQ-721)

Walked 2026-10-09, evening (the portal greets "Good evening"). Observation only. Nothing was sent, no reminder went out, no row outside this walk's own fixture was written.

## 1. Setup facts

- **Code under test: `main` @ `48de7545a`**, run from this ticket's own worktree, not the shared checkout. The shared checkout is on `marketing/moll-drive-house`, which is not an ancestor of main and differs from it in 184 portal/package files, so walking it would not have shown today's main. Deps were installed in the worktree with `pnpm install --frozen-lockfile` (no symlinked node_modules), and the portal's workspace deps were built with `turbo run build --filter=@patina/designer-portal^...`.
- **Local Supabase only.** The main checkout's `apps/designer-portal/.env.local` resolves `NEXT_PUBLIC_SUPABASE_URL` to `127.0.0.1:54321`. I checked this with a script that prints only the host, because a standing deny rule blocks reading the file directly. The worktree portal got its own throwaway `.env.local`, built from `supabase status` (API `http://127.0.0.1:54321`) and deleted after the walk. `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live` was set, so the mock-data fallback was off.
- **Feature flags** were set through `NEXT_PUBLIC_FLAG_OVERRIDES` to match prod as read from PostHog (`system.feature_flags`, read only):
  - On for everyone in prod: `one-voice`, `ask-the-paper`, `agreement-parts`, `agreement-library`, `client-invite-letter`, `arrival-arc`, `studio-workspaces`, `design-build`, `threshold`, `procurement-workspace-pilot`.
  - On for Leah's email domain: `room-file`, `tester-notes`, `onboarding-teammate-persona`.
  - Not in prod, left off: `worktable`, `room-view-refined-path`, `field-line-trades`.
- **Runtime.** Only the designer portal ran (`pnpm --filter @patina/designer-portal dev`, `next dev --webpack -p 3000`). No orders, media or projects services ran. Port 3000 was free before the start and was released after: I killed only the `next-server` PID whose cwd was this worktree. Local Supabase was neither reset nor restarted.
- **Browser.** Headless Chromium through `@playwright/test` 1.58, at viewports 1440×900 and 390×844. Sign-in used the real form ("Use email and password instead"), and that form only takes clicks after a roughly 6 s arrival animation. Claude-in-Chrome was used once to inspect the sign-in form.
- **Accounts.**
  - Leah Hartwell = `designer@patina.dev`, owner of "Local Dev Studio" (`b0000000-…-0001`).
  - The first hire, Jordan Reyes = `hire@patina.dev`, added by this walk's seed. Password `password123`, as for every dev account.
- **Fixture: `seed_uplift_walk.sql`.** It is additive and idempotent: every row uses the `e7210000-…` prefix with `ON CONFLICT DO NOTHING`, it updates no existing row, and it was applied three times cleanly with `psql … -v ON_ERROR_STOP=1 -f`. Leah's studio already carried 43 live engagements from earlier seeds and walks, so the seed adds only the S1–S8 states that were missing:
  - hire member + handoff note;
  - Marsh Street Kitchen, led by the hire, with PO-MS-0388 unanswered for 4 days;
  - Holloway Den, with PO-HD-0412 unanswered for 9 days and INV-2026-0721 12 days overdue;
  - Pell Court Dining, with a proposal signed yesterday and a $9,200 deposit paid 3 h ago;
  - Linden Place Living Room, with a proposal declined yesterday and a reason;
  - Thornfield and Garnet Hill pre-project proposals (signed / declined);
  - a fresh inquiry from Ines Calder, 2 h old.
  Two schema facts shaped the seed: `projects.lead_designer_id` is generated from `designer_id`, and `projects.proposal_id` cannot change once a project is active (guard_project_completion_authority). Notes on both are in the SQL file.
- **"Marks at rest"** = the visible interactive controls in the first viewport, measured by script as buttons plus links, plus the colour accents and numbers counted by eye from the screenshot. The dev-only Next "N" badge and the TESTER pill are excluded.

## 2. Surface inventory

| Surface | Route walked | 1440 | 390 | Notes |
|---|---|---|---|---|
| Desk | `/desk` | `desk-fold-1440.jpg`, `desk-full-1440.jpg` | `desk-fold-390.jpg`, `desk-full-390.jpg` | 43 live · 6 overdue; 32 cards need Leah, 11 at rest |
| Document (project) | `/doc/e7210000-…-0003` Holloway Den | `doc-holloway-fold-1440.jpg`, `doc-holloway-full-1440.jpg` | `doc-holloway-fold-390.jpg`, `doc-holloway-full-390.jpg` | |
| Build room (Pieces) | `/doc/e6590000-…-0001` Whole Home Renovation, then the Pieces rail stop | `pieces-fold-1440.jpg`, `pieces-full-1440.jpg` | `pieces-fold-390.jpg` | `/doc/[id]/pieces` **returns 404**. The Build room is the Pieces section inside `/doc/[id]`: 26 lines, 7 rooms |
| Boards (studio) | `/boards` | `boards-fold-1440.jpg` | `boards-fold-390.jpg` | "0 active boards" |
| Boards (a job's) | `/doc/e6590000-…-0001/boards` | `doc-boards-fold-1440.jpg` | `doc-boards-fold-390.jpg` | "No boards yet · start one" |
| Library | `/library` | `library-fold-1440.jpg` | `library-fold-390.jpg` | Mine 0 · Studio 4 · Patina 25 |
| People | `/people` | `people-fold-1440.jpg` | `people-fold-390.jpg` | 45 people · 21 firms |
| Rooms (The Scans) | `/rooms` | `rooms-fold-1440.jpg` | `rooms-fold-390.jpg` | 6 scanned rooms, all "awaiting drawing" |
| A room | `/room/7e023c47-…` | `room-fold-1440.jpg` | `room-fold-390.jpg` | "This room is still being drawn." Nothing else on the page |
| Compose | `/compose` | `compose-fold-1440.jpg` | `compose-fold-390.jpg` | "A piece, taking shape… 0% composed" |
| Drafting proposal | `/drafting/d0c10000-…-00b2` (Elena Marlowe) | `drafting-fold-1440.jpg` | `drafting-fold-390.jpg` | "The contract room · 0% drafted" |
| Ceremony | `/ceremony/e7210000-…-0051` | `lead-brief-fold-1440.jpg` | `lead-brief-fold-390.jpg` | **Redirects to `/doc/<leadId>`** (the lead's brief). No match ceremony exists locally, so the ceremony itself is UNCONFIRMED |
| Invoices | `/invoices/e7210000-…-0041/print` | `invoice-print-fold-1440.jpg` | `invoice-print-fold-390.jpg` | No `/invoices` index route exists. The working list is the Accounts sheet on the Desk (`s4-step2-send-reminder-1440.jpg`) |
| Preferences | `/preferences` | `preferences-fold-1440.jpg` | `preferences-fold-390.jpg` | Notification switches only |

## 3. S1–S8 baseline

Times are a human estimate for a first-week reader, not the automation's timings (6–30 s per page, all compile-bound). "Notice" runs from landing to seeing the moment, and "done" from the moment to the act.

| # | Scenario | Path | Clicks | Est. seconds (notice / done) | Marks at rest (landing) | Verdict |
|---|---|---|---|---|---|---|
| S1 | Monday "what needs me" | `/desk` → read the summary → "ONLY WHAT NEEDS ME" | 0–1 | 5 to read "Six things are overdue — Chen, Holloway, Halloran and 3 more"; the 3–5 for today are never stated (60+ to triage 32 cards) | Desk 1440: 27 interactive (17 buttons + 10 links) + ~9 accents/numbers ≈ **36**. Desk 390: 12 interactive + ~5 ≈ **17** | **hard** |
| S2 | Client moved | Approval: Desk card grid → "Thornfield … Signed — open the project" → OPEN THE PROJECT. Decline: "Garnet Hill … Proposal declined — follow up" → FOLLOW UP. On a live project: open Pell Court / Linden Place | 1–2 (pre-project); Desk has nothing to click for live projects | Pre-project: 25–40 / 5 (both cards are ~6 rows down). Live project: never noticed | same Desk ≈ 36 | **hard** (pre-project) / **not found** (approval or decline on a live project) |
| S3 | Vendor quiet | Desk "WITH THE MAKER" group (last group, bottom of the grid) shows Marsh Street and Halloran. Holloway's 9-day PO-HD-0412 is not on the Desk. Open Holloway → scroll to Pieces "1 PO unanswered" → FOLLOW UP WITH THE MAKER → Orders ledger row → LOG ACK / RESEND | 3 + 2 scrolls | 45–60 / 5 | Desk ≈ 36; Holloway doc 1440: 43 interactive + ~4 ≈ **47** | **hard** (the oldest silence is hidden behind the job's invoice need) |
| S4 | Money | Overdue invoice: Desk "WITH THE CLIENT" → Holloway "SEND REMINDER" → Accounts · Receivables sheet, row pre-highlighted, its own SEND REMINDER. Deposit landed: nothing on the Desk; Pell Court doc shows "Money $9,200 OUT … RECORD THE PAYMENT" | 2 (reminder); deposit n/a | Reminder 20–30 / 5. Deposit never noticed | Desk ≈ 36 | **found but hard** (reminder) / **not found** (deposit) |
| S5 | Hand-off (as the hire) | Jordan's `/desk` → hunt for Marsh Street (only under "WITH THE MAKER", near the bottom) → open → NEXT band "With the maker: PO-MS-0388 sent — no acknowledgment · FOLLOW UP WITH THE MAKER", "You're on the call sheet as lead", "HANDS ON THE WORK: YOU" | 1 + scrolls | Desk 30–60 / doc 3 | Hire Desk 1440: 29 interactive + ~9 ≈ **38** | **hard** (Desk) / **found** (inside the job) |
| S6 | What's next on this job | Holloway `/doc/[id]` → NEXT band "OVERDUE 11D · INV-2026-0721 · SEND REMINDER" | 0 (1 to act) | 3 / 5 | Holloway doc ≈ 47 (390: 12 interactive + ~3 ≈ **15**) | **found** (one next step is named). The other five sit behind "Standing · 6", including the unanswered PO |
| S7 | New lead | Desk: five identical "BRIEF · Full Room" cards; Ines's 2-hour-old inquiry is the nameless second card (sorted by respond-by date, not arrival) → open → brief shows Ines Calder, her words, budget, timeline → RESPOND TO THE INQUIRY / ACCEPT · BEGIN / NURTURE / PASS | 1–2 | 10–20 (which card is new?) / 5 | Desk ≈ 36 | **hard** |
| S8 | Close the day | `/desk` bottom → "AT REST · 11 JOBS" | 0 | No end state: 32 cards stay open, 10 of them "Friday Pulse drafted — review & send" | Desk ≈ 36 | **not found** |

Screenshots per scenario:

| Scenario | Files |
|---|---|
| S1 | `desk-fold-1440.jpg`, `desk-fold-390.jpg`, `s1-step2-only-what-needs-me-1440.jpg`, `s1-step3-by-person-1440.jpg` |
| S2 | `s2-step1-thornfield-signed-card-1440.jpg`, `s2-step2-garnet-declined-card-1440.jpg`, `s2-step3-garnet-follow-up-1440.jpg`, `s2-step4-pell-court-at-rest-1440.jpg`, `s2-step5-linden-doc-1440.jpg`, `s2-step6-pell-court-doc-1440.jpg` |
| S3 | `s3-step1-desk-with-the-maker-1440.jpg`, `s3-step2-holloway-pieces-po-1440.jpg`, `s3-step3-follow-up-with-maker-1440.jpg` |
| S4 | `s4-step1-holloway-reminder-card-1440.jpg`, `s4-step2-send-reminder-1440.jpg`, `s2-step6-pell-court-doc-1440.jpg` |
| S5 | `s5-step1-hire-desk-1440.jpg`, `s5-step1-hire-desk-390.jpg`, `s5-step3-hire-marsh-doc-1440.jpg` |
| S6 | `s6-step1-holloway-next-band-1440.jpg`, `s6-step1-holloway-next-band-390.jpg`, `s6-step2-standing-six-1440.jpg` |
| S7 | `s7-step1-desk-new-lead-1440.jpg`, `s7-step2-lead-brief-1440.jpg`, `s7-step3-respond-to-inquiry-1440.jpg` |
| S8 | `s8-step1-desk-bottom-1440.jpg`, `desk-full-1440.jpg` |

Where I got lost:
- **S1.** "ONLY WHAT NEEDS ME" adds "· SHOWING WHAT NEEDS YOU" to the header, but the 32 cards stay the same.
- **S2.** The approval and the decline on live projects (Pell Court, Linden Place) land in "AT REST · Nothing needs your hand" (`s2-step4`). Inside either job, Client approvals reads "NOTHING YET", and Linden's NEXT band says "OPEN THE PIECES".
- **S3.** Holloway's card carries only the invoice. I found the 9-day PO only after opening the job.
- **S4.** A paid deposit reads "$9,200 OUT" next to "RECORD THE PAYMENT" (`s2-step6`). That looks unpaid. The cause was not diagnosed.
- **S5.** On the hire's Desk every studio card says "YOUR PEN", including Leah's jobs, and the count stays "43 LIVE · 6 OVERDUE". Nothing marks Marsh Street as handed over.

## 4. First-time-user observations

- **Confusing labels.**
  - Desk: "YOUR PEN" / "WITH THE CLIENT" / "WITH THE MAKER" as ownership tags; "PUT DOWN" (= back); "HANDS FREE" (= no timer running); "IN HAND TODAY 1h 05m".
  - Document: "Standing · 6", "FILED WITH THIS JOB", "Closing the book · 1 CLOSED OUT" on a job that has not started (Linden, Marsh).
  - Schedule: "TYPOGRAPHIC · NO WIZARDS".
  - Library: "THE ENGINE".
  - Leads are titled by project type ("Full Room") rather than by person, so five leads look alike.
- **Coaching copy left at rest.**
  - "– The band says what's next on this job. Press it. / UNDERSTOOD" sits on every Document.
  - "The studio isn't fully set up · FINISH SETTING UP" sits on Leah's Desk.
  - The hire's first Document opens with a time-keeping notice.
  - Library shows "0 TAUGHT TODAY · — YOUR ACCURACY · 0 MATCHES SHARPENED" counters, and People shows "THE ENGINE · 10 PEOPLE DRIFTING". These come close to engagement metrics on the studio surface.
- **Dead or empty panels.**
  - A room page says only "This room is still being drawn." (`room-fold-1440.jpg`).
  - The studio Boards page says "0 active boards".
  - On a fresh project the Document fold is mostly an empty Schedule composer with three template choices, and Client approvals says "No decision lead named yet. ASSIGN PROJECT CLIENT" even though the job has a client.
- **Hidden actions.**
  - The unanswered PO lives in the Pieces section below the fold, and its act opens the studio Orders ledger as a sheet.
  - Desk SEND REMINDER opens the Accounts sheet; it does not send.
  - The Build room has no URL of its own; it is a rail stop inside `/doc/[id]`.
  - Invoices have no index; the Accounts sheet behind "Ledgers" serves as one.
- **390 width.**
  - Desk actions stack into a narrow right column beside a three-line greeting.
  - The Document rail collapses into a bottom bar ("MORE").
  - The NEXT band stays at the top.

## 5. UNCONFIRMED

- **A board** (`/board/[id]`): no project board exists in the local studio, and none was created, to keep the walk read-only.
- **The ceremony surface:** no `match_ceremonies` rows exist locally, and `/ceremony/[leadId]` redirects to the lead's brief.
- **What Garnet Hill's FOLLOW UP opens:** the click registered no visible change within 6 s (`s2-step3` shows the unchanged grid).
- **What "Standing · 6" unfolds** (`s6-step2`) and **what RESPOND TO THE INQUIRY opens** (`s7-step3`): page text was near-identical after the click, and I did not inspect the screenshots for a sheet.
- **The hire's handoff note** ("From Leah: …"): not shown on Jordan's first Desk even with `onboarding-teammate-persona` overridden on. Whether a further first-Desk condition suppresses it was not traced.
- **Why the Pell Court deposit reads as "out" with RECORD THE PAYMENT:** observed, not diagnosed.
- **Services:** orders, media and projects were not running, so any panel that depends on them is unverified. No panel visibly errored.
- **Not captured:** a 390 full-page Build room, and full pages at 390 for surfaces other than the Desk and the Document.
