# US-24 R2: information architecture, wayfinding and actionable moments

Reviewer R2 on the US-24 panel (SQ-723). The lens is where the signals for S1–S8 come from, where they surface, where they get lost, and what single "needs you" model the studio should have. Canon is **waived** (BRIEF §2); wherever a proposal departs from it, the ruling it would need is named. Not waived: VISION §4 "the studio won't notice Patina" (no engagement optimisation, no red-dot anxiety), the "Designer-Taught Intelligence" wording, accessibility, and honesty.

**Inputs read:** US-24 BRIEF (story contract rev 1); `R/briefing/current-state.md`; `R/walk/WALK.md` and its screenshots; `docs/vision/VISION.md` §2–§6; `docs/vision/VISION-DECISIONS.md` V9 and V11; `artifacts/document-running-a-job-2026-10-07/delivery/rulings.md` (US-19 rulings, the prior wayfinding thinking). I traced the code paths behind the walk where the IA question depended on them. I did not open any other file under `R/review/`.

**Conventions.** `R` = `artifacts/designer-portal-uplift-2026-10-09`. Code citations are `path:line` relative to the repo, with `apps/designer-portal/src/` shortened to `src/`. Walk citations name a file in `R/walk/`. **Severity** runs from **S1** (a scenario fails because of it) through S2 (a scenario is slow or misleading), S3 (friction or a learnability cost) to **S4** (minor). To keep the two scales apart, scenarios are always written "scenario S3" in prose; tables label the columns.

---

## 1. Verdict

**The portal is not short of signals. It has too many need engines that do not agree, and the one the designer lands on throws most of them away.**

Five places currently answer "what needs me", each with its own selection rule:

1. **The Desk card** keeps one need per job (`deskLeadNeed`), then re-sorts the cards by *whose hand* the need sits in (the studio, then the client, then the maker), not by consequence.
2. **The Document band**: `Next` plus the `Standing · N` sheet, ranked by the US-19 D2 class table (`need-class.ts`).
3. **Region heads** on the paper. Pieces and Money each elect their own leader as a filled act.
4. **The Post**, an event feed (`notification_log` plus `procurement_notifications`) behind a bell dot.
5. **The Ledgers** (Orders and Accounts), studio-wide lists hidden as sheets.

The Desk models **standing state** only. **Events**, the things that just happened (signed, declined, paid, acknowledged), either go to The Post or vanish once a job has become a project. Ownership exists only at job grain and the Desk does not read it. The only "done" memory in the system is the invoice chase stamp. So Monday has no bounded answer (scenario S1), live-project moves and landed deposits are never noticed (scenarios S2 and S4), maker silence always sorts last (scenario S3), the hire sees the studio's pen on everything (scenario S5), and there is no end of day (scenario S8).

**Yes, there should be one model:** one ranked, de-duplicated list of standing needs per job, each need keyed to the record it is about, with one comparator (the D2 class table, already built). The same list is read at three depths: a bounded **Day Sheet** of no more than five lines across jobs on the Desk, the job's **Next** on the paper, and the full **Standing** list one press away. Events enter that list as needs ("Pell Court signed yesterday: order the pieces") rather than as a separate inbox. "Done" is recorded by doing the act, or by a dated "not today" that the system remembers. That is my pick (§5, Model A). Most of it reuses machinery the codebase already has.

**Worth keeping as-is:** the D2 class table and `selectNext` (`src/lib/document/need-class.ts:23-125`). The day line's principle that "a line contradicting the first card means neither is trusted" (`src/lib/document/desk-roster-derivation.ts:677-690`). The Post's "on your Desk" cross-reference (`src/components/document/overlays/post-sheet.tsx:18-20`). The invoice chase that clears its own need (`src/lib/document/desk-derivation.ts:964-969`). And the Standing sheet as a one-press list.

---

## 2. Findings

| ID | Sev | Conf | Finding | Evidence |
|---|---|---|---|---|
| **R2-01** | S1 | high | **The Desk keeps one need per job and discards the rest.** `deriveNeeds` returns every need for a job, but the roster keeps only the elected lead (`deskLeadNeed`). Holloway's card carries the 11-day invoice. Its PO-HD-0412, unanswered for 9 days, appears nowhere on the Desk; it is visible only inside the job's `Standing · 6` sheet. One card per job means one need per job. | `src/lib/document/desk-derivation.ts:1714-1759`; `src/lib/document/desk-roster-derivation.ts:466-473`; `s3-step1-desk-with-the-maker-1440.jpg`, `s6-step2-standing-six-1440.jpg`; WALK §3, scenario S3 |
| **R2-02** | S1 | high | **The Desk and the Document rank by different rules.** Desk cards sort by `claimBand`: 0 = studio and overdue, 1 = studio, 2 = client, 3 = maker; within a band, by date (`desk-roster-derivation.ts:811-816,863-868`). The Document ranks by the D2 class table: class 1 blocks money or a signature, class 2 needs you, class 3 is setup (`need-class.ts:23-55`). On the Desk, ten class-2 "Friday Pulse" cards (studio pen) outrank Holloway's class-1 overdue invoice (owner: client, so band 2) and every maker silence (band 3). The "WITH THE MAKER" cards always sit at the bottom of the grid, whatever their age. | `src/lib/document/desk-roster-derivation.ts:811-868`; `src/lib/document/need-class.ts:23-55`; `src/lib/document/desk-derivation.ts:998` (invoice owner `client`); `desk-full-1440.jpg` |
| **R2-03** | S1 | high | **"Only what needs me" does nothing to the card grid, by construction, and "me" is not a person.** The facet's predicate (`mark !== null`) is the same predicate that put a line into the cards, so it can only hide the at-rest ledger below them. The walk saw the same 32 cards before and after. Custody "Your pen" means *the studio's* pen (`custodyWord`; US-19 D8 says "'Yours' is the studio's pen, never a named person"), so on the hire's Desk every job reads YOUR PEN. | `src/lib/document/desk-roster-derivation.ts:230-241,842,930-944`; `document-running-a-job-2026-10-07/delivery/rulings.md:226`; WALK §3 "Where I got lost" (S1, S5); `s1-step2-only-what-needs-me-1440.jpg`, `s5-step1-hire-desk-1440.jpg` |
| **R2-04** | S1 | high | **A client's move or a landed payment on a live project is never a Desk need.** `needProposal` fires only when `engagement_kind === 'proposal'`, that is, before the project exists. After that, signed and declined produce nothing, so Pell Court (signed) and Linden Place (declined) land in "AT REST · Nothing needs your hand". The Desk's payment read takes only `deposit_due / balance_due / milestone_due / payment_failed`; a payment that landed is never read. The data is there (proposal status, payment rows), and the edge functions emit `proposal_signed` and `payment_received` notifications, which can only reach the designer through The Post's dot (see R2-05). | `src/lib/document/desk-derivation.ts:1004-1030`; `src/hooks/use-desk-engagements.ts:149,813`; `supabase/functions/proposal-sign-confirmation/index.ts:153,188`; `supabase/functions/stripe-webhook/index.ts:518,1093`; `s2-step4-pell-court-at-rest-1440.jpg` |
| **R2-05** | S2 | medium | **Events and state live in two channels with no join.** The Post's Record merges `notification_log` and `procurement_notifications` behind a bell dot, and it cross-references a notice only when the Desk *already* shows its subject (R82). The case that matters, an event the Desk does *not* show (a signature or payment on a live project), is left as a dot on a bell in the drawer. The walk's fixture bypassed those functions, so no Post rows existed and this routing was not observed. Hence medium confidence. | `src/components/document/overlays/post-sheet.tsx:3-27`; `src/components/document/studio-drawer.tsx:160-164,521-545`; WALK §1 (direct-insert fixture) |
| **R2-06** | S2 | high | **One job's paper has three competing leaders.** On Holloway: the band's Next says `SEND REMINDER` (the invoice); the Pieces head carries a filled `FOLLOW UP WITH THE MAKER`; the Money head carries a filled `RECORD THE PAYMENT`. Those are two different acts on the same overdue invoice, plus a third elsewhere. Scenario S6 is "found" only because the band is read first. A hire who scrolls meets three primary acts. | `doc-holloway-full-1440.jpg`; current-state §4, S6 row (region heads elect their own leader, `src/components/document/ffe-section.tsx:1061-1114,2121-2186`) |
| **R2-07** | S2 | high | **The Standing sheet counts one fact twice.** PO-HD-0412 appears both as `STUCK · unanswered, 9 days` and as `NO ACK · sent, no acknowledgment`. The invoice appears as `NEXT` and again as `PAST DUE · $3,800 owed you`. `Standing · 6` holds only two distinct actionable facts plus three setup rows. `NeedLine` carries no stable record key (only `kind` and an optional ledger context), so nothing can de-duplicate across rules. The same gap blocks any "done" or "not today" memory (R2-11). | `s6-step2-standing-six-1440.jpg`; `src/lib/document/desk-derivation.ts:543-575` (NeedLine fields) |
| **R2-08** | S2 | high | **One fact reads differently in different places.** The rail says "Pieces · NOTHING YET" while the Pieces head says "1 PO unanswered". On Pell Court, after the $9,200 deposit was paid, the paper says "$9,200 OUT" next to `RECORD THE PAYMENT`, and the margin says `MONEY · SENT`. Holloway's invoice is "OVERDUE 11D" on the band and "12D OVERDUE" in Accounts. Each surface derives its own reading, so no number can be trusted at a glance. | `doc-holloway-full-1440.jpg`, `s2-step6-pell-court-doc-1440.jpg`, `s4-step2-send-reminder-1440.jpg`; WALK §3 "Where I got lost" (S4) |
| **R2-09** | S2 | high | **Job-grain ownership exists in the schema; the Desk and the paper do not read it.** `project_team_members` records `lead_designer` / `previous_lead` with `assigned_by` and `assigned_at`, and leads change through `reassign_project_lead`. `organization_members.handoff_note` exists too. US-19 cut the handoff line because "no handoff record exists". At job grain that is now stale: "Leah handed you Marsh Street on Tuesday" is a recorded fact. The Desk's By person groups on `document_state.designer_id` (the job lead), and nothing reads `previous_lead` or `assigned_at`. Need-grain assignment ("the cabinet chase is Jordan's") is still missing. | `R/walk/seed_uplift_walk.sql:63-86`; `supabase/migrations/00560_invite_handoff_note.sql`; `supabase/migrations/00590_engagement_subject.sql:66`; `src/lib/document/desk-roster-derivation.ts:1038-1044`; `document-running-a-job-2026-10-07/delivery/rulings.md:230-231` |
| **R2-10** | S2 | medium | **The hire's handoff note is a one-time slot on the wrong surface.** It is one of several once-only lines competing in `useDeskLineState`. It is behind `onboarding-teammate-persona`, appears once on the Desk, then is gone, and it never appears on the job it is about. The walk did not see it at all. Leah's Desk spends the same slot on "The studio isn't fully set up". A durable fact ("Marsh Street is yours; ask me before anything goes to the client") is treated as a tour beat. | `src/app/(document)/desk/page.tsx:231-254`; WALK §5 (hire's handoff note not shown); `desk-fold-1440.jpg` |
| **R2-11** | S2 | high | **There is no "handled", "waiting" or "not today" memory, except for one invoice stamp.** The only act that clears its own need without changing the underlying state is the receivable chase (`ar_last_chased_at`). Every other need stands until the world changes. So a 150-day-old Chen receivable owns slot 1 of the day line every morning. A PO chased an hour ago looks the same as one never chased. Scenario S8 has nothing to end on. No snooze, defer or dismiss record exists in the portal. | `src/lib/document/desk-derivation.ts:964-969`; `desk-fold-1440.jpg`; repo search for snooze/dismiss in `src/lib`, `src/components/document` (none outside tests) |
| **R2-12** | S2 | high | **A weekly ritual floods the claim grid.** `needPulseDue` makes every job with an unsent Pulse its own card from Friday, so 10 of the walk's 32 cards read "Friday Pulse drafted — review & send". It is one batch task presented as ten claims, and it pushes real exceptions further down. | `src/lib/document/desk-derivation.ts:1662-1677`; WALK §3 scenario S8; `desk-full-1440.jpg` |
| **R2-13** | S2 | high | **Two summaries above the grid, chosen by two rules.** "Six things are overdue — Chen, Holloway, Halloran and 3 more" is a selection by overdue status. The day line under it quotes the top three cards (Chen, then two nameless leads). The code's own principle says that disagreement costs trust (`desk-roster-derivation.ts:677-690`), and the overdue sentence breaks it. Neither one is "the three to five for today". | `desk-fold-1440.jpg`; `src/lib/document/desk-roster-derivation.ts:655-770` |
| **R2-14** | S2 | high | **Leads are nameless and sorted by deadline, not by arrival.** A lead card is titled by project type ("Full Room"), and its sort date is `lead_response_deadline`. Ines Calder's two-hour-old inquiry is the second of five identical cards. "New since you last looked" is not an attribute anywhere. The lead's name and `created_at` exist but are not surfaced. | `src/lib/document/desk-derivation.ts:1150-1179`; `s7-step1-desk-new-lead-1440.jpg`, `desk-fold-1440.jpg` |
| **R2-15** | S2 | medium | **Action depth cannot be predicted.** Some Desk acts open the job, some open a studio ledger sheet (`need.ledger`: SEND REMINDER opens Accounts · Receivables; FOLLOW UP WITH THE MAKER opens Orders), and the label does not say which. SEND REMINDER does not send. Vendor quiet (scenario S3) takes Desk → job → scroll → Pieces → Orders sheet → row → LOG ACK: three clicks, two scrolls and a sheet. | `src/lib/document/desk-derivation.ts:965-969,994-997`; WALK §3 scenario S3, §4 "Hidden actions"; `s3-step3-follow-up-with-maker-1440.jpg`, `s4-step2-send-reminder-1440.jpg` |
| **R2-16** | S3 | high | **The studio-wide queues already exist and are hidden under "Ledgers".** Orders (POs, receiving, claims) and Accounts (receivables, $38,810 owed, rows with SEND REMINDER) are the right lists for scenarios S3 and S4. They live behind "Ledgers ↑" in the bottom bar and in the Desk footer's "THE STUDIO", and nothing in the day summary links to them. | `s4-step2-send-reminder-1440.jpg`; `desk-full-1440.jpg` (footer index); `desk-fold-1440.jpg` (bottom bar) |
| **R2-17** | S3 | high | **The navigation has three idioms and no map.** Routes (Desk, `/doc/[id]`, Plan room, Spec book, Boards, Library, People, `/rooms`), regions on one paper (rail stops: Client approvals … The record), and overlay sheets (Orders, Accounts, Hours, The Post, Standing, Account). The acts for actionable moments mostly live in the third, least visible tier. Leaving a job is "PUT DOWN" back to the Desk; there is no job switcher; at 390 the rail collapses to "MORE". The Build room has no URL (`/doc/[id]/pieces` returns 404). | current-state §1–§2; WALK §2 (Build room 404), §4 "390 width"; `doc-holloway-full-1440.jpg` (rail, FILED WITH THIS JOB, bottom bar) |
| **R2-18** | S3 | high | **A private vocabulary stands between the hire and the map.** "The Scans" (= `/rooms`), "Ledgers", "The Post", "Put down" (= back), "Hands free" (= no timer), "Standing", "Filed with this job", "Your pen" / "With the maker", "In hand today". ⌘K and the Keys sheet exist, but they only help someone who already knows the words. The hire learns the map by asking Leah, which is exactly what scenario S5 is meant to remove. | WALK §4 "Confusing labels"; current-state §1 (CommandBar/RegistryShortcuts, `src/app/(document)/layout.tsx:106-120`) |
| **R2-19** | S3 | high | **Coaching and setup copy occupies the actionable slot.** "The band says what's next on this job. Press it. / UNDERSTOOD" appears under the band on every Document. "The studio isn't fully set up · FINISH SETTING UP" holds the Desk's single line slot. The hire's first Document opens with a time-keeping notice. Each takes the exact position a "what's yours" line would need. | `doc-holloway-full-1440.jpg`, `s2-step6-pell-court-doc-1440.jpg`, `desk-fold-1440.jpg`, `s5-step3-hire-marsh-doc-1440.jpg` |
| **R2-20** | S3 | medium | **The region that should carry scenario S2 says nothing.** On Pell Court (signed yesterday) and Linden (declined yesterday), Client approvals reads "NOTHING YET / No decision lead named yet · ASSIGN PROJECT CLIENT", although the job has a client and a signature. Linden's Next says "OPEN THE PIECES". The approvals model appears to be keyed on a decision lead, not on the proposal's outcome. Not traced in code, hence medium. | `s2-step5-linden-doc-1440.jpg`, `s2-step6-pell-court-doc-1440.jpg`; WALK §3 "Where I got lost" (S2) |
| **R2-21** | S3 | medium | **Engagement-style counters leak into the needs channel.** Library shows "0 TAUGHT TODAY · YOUR ACCURACY · 0 MATCHES SHARPENED", People shows "10 PEOPLE DRIFTING", and Accounts shows "TEACHING 0 TAUGHT". None of these is actionable today. They compete with real marks at rest and sit close to V11's refused list (score, streak, target). | WALK §4 "Coaching copy left at rest"; `s4-step2-send-reminder-1440.jpg`; VISION-DECISIONS V11 |
| **R2-22** | S4 | high | **The hire's first number is not theirs.** Jordan's Desk head reads "EVERY JOB · 43 LIVE · 6 OVERDUE", the studio total, and the day line names Leah's jobs (Chen, two leads). | `s5-step1-hire-desk-1440.jpg` |
| **R2-23** | S4 | medium | **Sealed rules hide later needs.** `deriveNeeds` stops the chain at a "sealed" result (for example `needProposal`), so the rules after it are never evaluated for that engagement. That is correct for a pre-project proposal today. It becomes a trap the moment live-project events (R2-04) are added as rules above a seal. | `src/lib/document/desk-derivation.ts:1748-1757` |

---

## 3. Scenarios S1–S8: where each one breaks

Root-cause key: **missing** = the data is not recorded; **not surfaced** = the data exists but no surface reads it; **buried** = it is surfaced but below, behind or against something else.

| Scenario | Today's path (walk) | Failure point | Root cause |
|---|---|---|---|
| **S1** Monday "what needs me" | `/desk` → overdue sentence + day line (3 items) + "and 29 more below" → 32 cards; ONLY WHAT NEEDS ME changes nothing. 0–1 clicks; 5 s to read the summary, 60+ s to triage. | The three to five for today are never stated. The cards are ordered by whose hand (R2-02), stale items lead (R2-11), and Pulses inflate the grid (R2-12). | **Buried** (every job's needs are computed, R2-01) plus **missing** (no handled/deferred memory, R2-11) |
| **S2** Client moved | Pre-project: a card about six rows down. Live project: nothing on the Desk; Client approvals says "NOTHING YET"; Next says "OPEN THE PIECES". | The live-project signature or decline never becomes a need (R2-04); the region is silent (R2-20); any notification lands in The Post (R2-05). | **Not surfaced** (proposal status present; rule scoped to pre-project), and **buried** where an event notice exists |
| **S3** Vendor quiet | Desk "WITH THE MAKER" group at the bottom shows Marsh and Halloran; Holloway's 9-day PO is absent → open Holloway → scroll to Pieces → FOLLOW UP → Orders sheet → LOG ACK / RESEND. 3 clicks + 2 scrolls; 45–60 s. | One need per card (R2-01), maker band always last (R2-02), act depth three tiers (R2-15). | **Buried** (Standing sheet and Orders ledger hold it, R2-16) |
| **S4** Money | Overdue: card → SEND REMINDER → Accounts sheet → SEND REMINDER (2 clicks, 20–30 s). Deposit landed: nothing on the Desk; the paper reads "$9,200 OUT · RECORD THE PAYMENT". | Payment-landed is not a Desk fact (R2-04); the paper contradicts the payment (R2-08). | Reminder: **buried**. Deposit: **not surfaced** (payment rows exist; Desk reads due/failed only) |
| **S5** Hand-off (the hire) | Jordan's `/desk`: 43 live, everything YOUR PEN → hunt for Marsh under WITH THE MAKER → open → band shows the PO chase; "HANDS ON THE WORK: YOU". Desk 30–60 s; in-job 3 s. | No "yours" on the Desk (R2-03, R2-22); handoff note unseen (R2-10); handoff record unread (R2-09). | Job grain: **not surfaced** (`project_team_members`, `handoff_note`). Need grain: **missing** |
| **S6** What's next on this job | Holloway → band: "OVERDUE 11D · INV-2026-0721 · SEND REMINDER". 0 clicks, 3 s. | Found, but region heads elect two more primary acts (R2-06), and Standing double-counts (R2-07). | **Buried** among competing leaders |
| **S7** New lead | Desk: five identical "BRIEF · Full Room" cards; Ines's is the second, nameless → open → brief → RESPOND. 1–2 clicks; 10–20 s to tell which is new. | Leads are untitled by person and sorted by deadline (R2-14). | **Not surfaced** (name and `created_at` exist) |
| **S8** Close the day | `/desk` bottom → "AT REST · 11 JOBS". 32 cards remain open. | No end state, no handled or waiting memory, no day boundary (R2-11). | **Missing** |

---

## 4. Candidate actionable-moment models

All three keep the D2 class table as the single comparator, and all three fix R2-01, R2-02, R2-04, R2-07 and R2-08 underneath. Those are data-model repairs, not UI choices. The models differ in where the list is *read*. Click and second estimates are mine, against the walk's baseline, for a first-week reader. The directions will measure them properly.

### Model A: one need list, three depths (the Day Sheet)

**Concept.** Every job keeps one de-duplicated, ranked list of standing needs, each keyed to its record (kind + PO, invoice or proposal id). It is read at three depths:

- **Day Sheet.** The top of the Desk shows at most five lines across all jobs: class 1, then class 2, then deadline. It is filtered to *mine* by default (job lead from `project_team_members`; later, need assignee), with "the studio's" one press away for Leah. Each line is a sentence with its act ("Holloway: PO-HD-0412, nine days without an answer · Chase the maker").
- **Next.** The job's band, the same list's head, unchanged in concept.
- **Standing.** The full list, one press away, as today but de-duplicated.

Events become needs: a signature becomes "order the pieces", a decline becomes "follow up", a landed deposit becomes "release the order"; a PO acknowledgment clears its chase. There is no separate inbox. Each line has its act, plus one quiet "Not today", which records a defer to the next working day. Doing the act clears the line (generalising `ar_last_chased_at`). A chased item moves to a "waiting on" reading with its since-date, instead of standing as yours. When the sheet is empty, the Desk says so once, then lists what is *waiting on others*, with dates. That list is the close-the-day reading (scenario S8): nothing is yours, and here is who holds the rest.

**Data.**
- Existing: `deriveNeeds` full lists (`desk-derivation.ts:1714`), `NEED_CLASS` and `selectNext` (`need-class.ts`), `ar_last_chased_at`, `proposals.status`, payment rows, `notification_log` / `procurement_notifications` (with read state), `project_team_members` (lead / previous_lead / assigned_at), `organization_members.handoff_note`, `leads.created_at` and name.
- New: a stable **need key** on `NeedLine`; a small **need-state record** per person (need key, handled_at, deferred_until, chased_at); live-project event rules (signed, declined, payment landed, PO acked) placed before any sealing rule (R2-23). Optional v2: a need-level **assignee**.

**Effect on S1–S8.**
- S1: five lines, read in under 10 s; 0 clicks to see, 1 to act.
- S2 and S4: the event is a line the morning after (deposit now noticed).
- S3: the 9-day PO can lead the sheet; 1 click to the Orders row, against 3 clicks and 2 scrolls today.
- S5: "mine" by default, plus "Leah handed you Marsh Street on 7 October" as a line backed by `assigned_at`.
- S6: unchanged band, de-duplicated sheet.
- S7: "Ines Calder asked about a full room, two hours ago" as a named line.
- S8: an end state that exists, with waiting-on dates.

**Calm risk.** This is the model most likely to become a to-do inbox. Guards that must be structural, not stylistic:
- a hard cap of five, with no overflow count ("the rest are on their jobs");
- no unread dots, no badges, no totals with no rows under them (V11);
- no streaks and no "cleared today";
- "Not today" carries no counter and no nag on return;
- the sheet is never pushed (no notifications).

If any guard is relaxed, this becomes the engagement surface VISION §4 forbids.

**Canon it breaks (rulings needed).**
- VISION §5 "no task manager" and V11 (a cross-job ranked list needs a ruling that a five-line bounded sheet whose rows are the jobs' own Next is not a task manager).
- US-19 Q6/Q9 ("a task list: cut") and D8 ("Yours is the studio's pen, never a named person"; no fifth custody word).
- R143 D3, D5, D6 and D7 (the claim-card grid, custody words and the three-line day line are replaced).
- R82 (The Post as the home of events; it keeps letters but loses notices that became needs).

### Model B: Next on every job (the roster reads only Next)

**Concept.** No cross-job queue. The Desk becomes one line per job, printing exactly that job's band Next. It is ordered by the D2 class and deadline, so it agrees with the paper. Its person facet actually filters to the jobs I lead. Events surface as the job's Next ("Pell Court: signed yesterday · Order the pieces"). There is no Day Sheet; the first few lines *are* the day.

**Data.**
- Existing: all of the above except need state.
- New: the need key, the live-project event rules, and the person facet re-pointed at `project_team_members`. A defer record is optional: without it, scenario S8 stays unsolved.

**Effect on S1–S8.**
- S1 improves: the first five lines are ranked by consequence. But it still reads one line per job across 43 jobs, and a second need on a job (Holloway's PO) still hides behind the first. About 15–25 s.
- S2, S4 and S7 are fixed as in A.
- S3 is only partly fixed (R2-01 persists by design).
- S5: the facet works, but there is no handoff line.
- S6: unchanged.
- S8: "no Next of mine due today" is a weak end state with no waiting-on reading.

**Calm risk.** Lowest. It adds nothing, removes the card grid, and halves the marks at rest. The risk is the opposite one: too quiet, so a second urgent need on a job is never seen.

**Canon it breaks.** R143 D3, D5 and D6 (card grid and custody bands replaced by a ranked line roster), and D8's ruling against a named owner if the facet prints a name. It stays within VISION §5.

### Model C: flags on the paper and an evening round

**Concept.** No list at all. Each need is marked inline where its fact lives (the PO row in Pieces, the invoice line in Money, the proposal in Client approvals), and the rail shows which regions carry a flag. The Desk is a plain roster of jobs with a flag mark. To close the day (scenario S8), a **Round** walks the flagged jobs one at a time: it opens each paper scrolled to its flag, offers act / not today / next, and ends at "the round is done".

**Data.** The same need key and need-state record as A (the Round needs "not today" to end). It also needs a region and row anchor on each need, which `deepLink` and `ledger.context` partly provide (`desk-derivation.ts:558-571`).

**Effect on S1–S8.**
- S1 is poor: it only shows which jobs are flagged; the three to five are never named.
- S2, S3 and S4 are good once inside a job: the flag sits on the record, 0 scrolls.
- S5 is good inside the job and poor on the Desk.
- S6 is good.
- S7 is unchanged.
- S8 is strong (the Round is an explicit closeout).

**Calm risk.** Medium. Inline flags multiply marks at rest on every paper. The Round is a ritual that can read as surveillance of the day's work, or as a chore.

**Canon it breaks.** "Never a lens on the paper" (waived, but it needs a ruling); V9 P5 "absence is silence"; US-19 D2 (band as the single door); VISION §6 "badges" (a flag mark is close to one).

---

## 5. My pick: Model A, built from the bottom up

**Pick: Model A**, with Model B's roster as the Desk below the Day Sheet. A list of at-rest jobs is still needed, and B's line roster is the calm form of it.

**Why.**

1. **Only A answers scenarios S1 and S8.** Leah has 16 to 43 jobs. Any model that makes her read per-job lines (B) or per-job flags (C) cannot name the three to five things in under 10 seconds. Nothing but a bounded cross-job list can say "that's the day".
2. **It is one model, not a fifth engine.** The Day Sheet, the band's Next and the Standing sheet become three readings of one keyed, de-duplicated list under the comparator US-19 already ratified. That retires the disagreements in R2-02, R2-06, R2-07, R2-08 and R2-13 at their source, rather than adding a surface on top.
3. **Most of it is already built.** `deriveNeeds` already computes every need; `selectNext` already ranks them; `ar_last_chased_at` already proves "the act clears the line"; `project_team_members` already records who was handed what and when. The genuinely new data is small: a need key, a per-person need-state row, and four event rules.
4. **The calm guard can be structural.** A hard cap, no counts, no dots, a defer that does not nag, and a "waiting on others" end state make the sheet *shrink* to empty as the day is done. That is the opposite of an engagement inbox, which grows to keep you there. If the founders cannot accept those guards as binding, my fallback is B: it is calmer, and it solves scenarios S2, S4 and S7, but it leaves S1 and S8 open.

**Build order (smallest first; each step pays off alone):**

1. Need key and de-duplication (fixes R2-07, and enables everything after it).
2. Desk ranks by the D2 class table instead of `claimBand` (R2-02).
3. Live-project event rules for signed, declined, payment landed and PO acked, placed above any seal (R2-04, R2-23).
4. Person grain from `project_team_members`, plus the handoff line on the job (R2-03, R2-09, R2-10).
5. The need-state record ("not today", chased → waiting on) (R2-11).
6. The Day Sheet itself, and one batched Pulse line (R2-12).

Rename the navigation words and the act labels in the same pass (R2-15, R2-18) so a hire can follow the sheet's acts to where they land.

**Questions this puts to the founders:**

- Is a five-line cross-job sheet, built from the jobs' own Next, a "task manager" under VISION §5? It needs a ruling either way.
- Should the hire's sheet default to *mine*, and may Leah's offer "the studio's"?
- Is "not today" acceptable, or does any defer become snooze-anxiety?
- Does The Post keep notices once they become needs, or only letters?
