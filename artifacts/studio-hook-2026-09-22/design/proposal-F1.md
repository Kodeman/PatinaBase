# Proposal F1 — One real job, together, this week

**Lens:** F1 · concierge. Kody's R133 setting-up call becomes a scripted 45-minute working session in which ONE live job is moved into Patina with the designer, ending with an artifact she sends to a real client or vendor before the call ends.
**Author:** Claude Fable proposer, 2026-09-22. **Evidence:** the eight reports under `artifacts/studio-hook-2026-09-22/research/`, cited as `NN §x`. Code paths are from `main` @ `966d6ca67`, read this session, not run.
**Audience:** Patina Leadership (Kody, Leah) and the beta studios.

---

## 1. Thesis

Studios pop out because the first hour costs them and the first payoff is weeks away. The dossier shows both halves: the cost is front-loaded (one bulk importer in the whole portal, for vendor spreadsheets — `02 §0`, `§3`; six checklist rows, none of them "bring your work in" — `02 §1.14`), and the payoff is back-loaded (Leah, the only real studio, took 32 days to her first project and 42 to first payment, and has never sent an agreement from Patina — `03 §4`, `08 G2`). The literature agrees on the mechanism: switching-cost inertia plus no immediate personal payoff, not confusion about value (`06 §7`, `§8`).

**The one bet:** the payoff can move from week six to minute forty-five, without new product, by making the setting-up call a *working session on her real job* rather than a demonstration — and by removing the three or four in-product steps that make "send it before we hang up" impossible today. Superhuman did this before it built self-serve onboarding and graduated out on its own schedule (`06 §2`). Patina already has the doctrine (R133 — `04 §b.11`), an invite that refuses to send without a personal sentence (`01 §7`, `designer-invite/index.ts:177-179`), and a customer count (one) that makes concierge the cheapest lever available (`06 §2-3`).

What this is **not**: not a tour (R94/R97 stand — `04 §b.1`), not a sample project (rejected — `04 §b.4`), not an import product (the CSV "bring your book" needs its own ruling — `04 §a.1n`), and not automation of the call (R133). It is a script, an intake, a few small precondition removals, and a record.

---

## 2. Premises this lens stands on

| Premise | Where |
|---|---|
| Acquisition is 1:1; self-signup is dead and unused | `01 §1b`, `03 §1`, `08 G12` |
| The invited designer's studio is auto-named after *her*; the checklist hard-codes that row done | `01 §1a` (`00295:269-277`), `01 §6` (`studio-setup.ts:90-91`) |
| Cold Desk to a client-receivable document is ~12–16 inputs across 4 surfaces; the fast lanes (`Open a project`, `Draft a design agreement`) are untaught | `01 §2` |
| The send gate wants: exact client relationship, terms, role rates if a rate card, a ceiling if it bills time, a named fee | `01 §2` row 13, `00575:655-690` |
| Production holds one real studio (Middle West) and one unnamed hire (`1a94f78f`); every other seat is Kody or QA | `08 G1-G2` |
| Leah's studio: 1 project, 6 proposals (1 sent, 0 signed), 10 invoices, 13 clients, 0 products, 0 contacts; invoicing is the loop she completes | `03 §2`, `§6.2` |
| "Manual ways" is unobserved; L5 was prepared 2026-08-18 and never run; no R133 call has a script or record | `08 G3-G4`, `G6` |
| Nothing can measure a fix; the one reliable ledger is server-side `engagement_events` (00291) | `03 §5`, `§8.3`, `08 G9` |
| Day-one value must not depend on the homeowner logging in (0 signed; First Letter accept leg unverified) | `06 §6`, `08 G8` |

**One correction to the brief's framing, verified in the migration.** Since 00575, `proposal_service_terms` is a *projection* written by `upsert_agreement_parts` once a proposal carries parts (`00575` header N-5; Part 5 `:2228-2264`). For a **flat-fee** agreement the five preconditions collapse to two: an exact `designer_clients` relationship (which `ClientPicker`'s invite-and-link mints) and one fee part with cents > 0 (`_agreement_fee_unnamed`, `:452`). Role rates and a ceiling bite only when a rate-card part is present (`:334`, `:387`). The 45-minute send is reachable *today* on the flat-fee road; the gate need not be touched. This is a reading, not a run — the first session proves or disproves it.

---

## 3. The Setting-Up Session

### 3.1 Pre-call intake — what she sends, 48 hours before

Asked by Kody in his own words, after she has said yes but **before** the invite email is sent (§3.2). Only the first item is required.

1. **One live job.** Client name and email, the address, and *where the job stands this week* — "she owes me a deposit", "I'm about to send the agreement", "we're mid-install and I need to bill". This picks the artifact (§3.3).
2. **The paper that job already has.** Her current agreement (PDF or Google Doc), the schedule if one exists (spreadsheet or PDF), the last invoice she sent that client. Attachments; nothing re-typed by her.
3. **The studio's name as it appears on her letterhead**, and a logo file.
4. **How she charges** — flat, hourly per role, or per phase — and her usual deposit.
5. **One screenshot of how she tracks the jobs that will *not* be in Patina yet.** This closes `08 G4` at zero cost: the referent of "manual ways", captured before session one.

Kody logs what arrived and in what format (M7). Two of five intakes arriving with a PDF schedule triggers M4.

### 3.2 The 45 minutes

The invite goes out **during** the session. The reason is Superhuman's (`06 §2`): her first touch of the product is guided, on her job. The walkthrough modal that auto-opens on first `/desk` paint (`01 §2` row 4) gets "Show me later" (R130) so it does not compete with the work; the licensed tour stays available for later.

| Min | Beat | On screen | Kody, in substance |
|---|---|---|---|
| 0–3 | The job, in her words | nothing yet | "Tell me about [client]. What do they need from you this week?" Confirm the artifact. |
| 3–6 | The letter | Kody sends the invite from the admin dialog with the studio name (M2) and the personal sentence. She clicks, lands on `/desk`, "Show me later". | "Your desk. Empty because your work isn't in it yet. Let's put one job in." |
| 6–10 | Name and rate, once | Account → Studio: confirm name and logo (pre-loaded, M2/M3); rate card if she bills hourly, else skip. | "This is the only setup we'll do. Everything else is the job." |
| 10–16 | The household | `Open a project` (4 fields — `01 §2`, `open-project-sheet.tsx:7-12`): household via invite-and-link with the intake email; title; budget band; start date. No lead, no Discovery. | "A repeat client on a handshake. Four fields; that's the project." |
| 16–20 | The paper she has | Her agreement PDF open beside her. If a PDF schedule arrived and M4 exists: upload; rows land unverified beside the schedule. | "Nothing on this page gets typed twice." |
| 20–38 | The artifact (§3.3) | Compose and send. She drives. | Every minute on her client, not the product. |
| 38–42 | Confirm it left | The `proposal_sent` / `invoice_sent` / letter row is visible in the document's margin. | "Your client has it. You didn't learn anything; you sent something." |
| 42–45 | The one question | Kody writes the answer in the record. | "What did you do this morning, for any job, that you'd have wanted in here?" Then: "Tuesday, ten minutes, same question." |

If it runs over, the artifact still goes out; rate card and logo wait. The ending is non-negotiable: **something real leaves Patina addressed to a real person before the call ends.** That is the activation event (`06 §1`: not "created a project" — "sent a real thing to a real client").

### 3.3 Which artifact — chosen by where the job stands

The single-player rule (`06 §6`) and 0-signed (`08 G8`) decide: the artifact lands in the client's inbox and is *done* without the client logging in.

- **Job about to start → a flat-fee design agreement.** ⌘K `Draft a design agreement` (`draft-proposal-opener.tsx:1-22`) makes an empty draft for the household; `materialize_standard_parts` seeds nine parts from `studio_agreement_defaults` or built-ins (`00575:3073+`); she pastes her scope prose into the clause parts (a real path — `02 §1.5`), sets one flat fee, sends from `SendSheet` (`send-sheet.tsx:1-16`). The flat-fee road clears the gate with relationship plus fee (§2). The client signs later; the *send* is the artifact.
- **Mid-flight and money owed → an invoice.** The loop Leah already completes (`03 §6.2`, 18 paid of 42). ⌘K `Draw an invoice · {project}` (`command-bar.tsx:823`) → `issue_invoice` → `invoice-send`, which resolves the recipient down to `designer_clients.client_email` for a client with no account (`invoice-send/index.ts:18-21`). Lines typed from her last invoice.
- **Mid-flight, nothing owed → the First Letter.** `client-invite` (live 09-09, `01 §4`). Weakest of the three: accept leg unverified (`08 G8`). Fallback, not default.

The agreement is preferred for a new studio: it is the one Leah has never sent (`08 G2`) and the one whose absence keeps the money rail empty (0 signed, 0 POs — `03 §6.1`, `§6.4`).

---

## 4. The moves

Costs: **S** ≤ a day; **M** two to four days; **L** a week or more. Each names surface / studio moment / stream / promise (VISION §8) and any ruling touched.

| ID | Move | Cost | Surface / moment / stream / promise | Rulings |
|---|---|---|---|---|
| M1 | The Setting-Up Session: intake + script + ending artifact | S | Document / first two days / subscription floor / "won't notice Patina" | R133 (this *is* the call); R130; R94/R97 untouched |
| M2 | Name the studio at the invite | S | Document (letterhead) / first two days / floor / no hidden system | none |
| M3 | The concierge seat, 30 days | S | Document / first two days / floor / "won't notice" | needs a privacy ruling; R133 |
| M4 | "Bring the schedule" PDF door — built only if intakes arrive as PDF | M | Document (project schedule) / first two days / **margin upside** / "your data comes in" | V9 (text-only unverified rows); R96/R134 (a sheet, not a page) |
| M5 | The Handoff Session for the first hire + widen the teammate persona to that studio | S | Document / day the hire accepts / floor / "won't notice" | R133 (second call); R125 (widening an existing flag) |
| M6 | The Tuesday line — four weekly 10-minute calls + the manual-ways ledger | S | none in product / weeks 1–4 / floor / "won't notice" | R133; R131 (no recurring notes); no automated sends |
| M7 | The record and the measurement floor | S | internal only | none (internal; V11 does not govern a file no studio sees) |

### M1 · The Setting-Up Session

**What.** §3 as written, plus the rule that the session ends only when an artifact has left. Screen-share; she drives. Script at `docs/pilot/setting-up-session.md`; process, outside code, as R133 says.

**Evidence.** R133 ruled, not built, no script or record (`04 §a.1l`, `08 G6`). Superhuman's mandatory call (`06 §2`). Fast lanes exist, untaught (`01 §2`, `§9.5`). Flat-fee road clears the gate (§2). Day-one value distinguished the one retained seat in prod — and that seat was Kody's, so this is a shape to test, not a finding (`03 §4`, `08 G1`).

**Time-saved, this week.** Leah's next house not in Patina goes from "not in Patina" to an agreement or invoice in the client's inbox in ≤45 minutes, against the 32 days her first project took (`03 §4`, `ce3aee90`). Against her *manual* time no number is claimed yet — the intake asks ("draft to sent, how long today?") and the record writes both numbers side by side. **Known by:** `engagement_events` `project_created` and `proposal_sent`/`invoice_sent` for her user id inside the session window (`00291`, server-side); the record's minute marks.

### M2 · Name the studio at the invite

**What.** A required "Studio name" field in the admin `InviteDesignerDialog` (`InviteDesignerDialog.tsx:128-134` has only Display Name today), passed through `/api/admin/designers/invite` to `designer-invite`, written as `profiles.business_name` **in the same profile upsert** that sets `is_designer` (`designer-invite/index.ts:230-236`). `fc_provision_studio_on_designer` COALESCEs `business_name` first (`00295:269-277`), so the studio is born with her studio's name. No migration.

**Evidence.** Studio named after the person; checklist declares it branded (`01 §1a`, `§6`, `§9.2`). The name is the first thing on every proposal and invoice she sends.

**Time-saved.** Honest and small: one rename act removed from the session (`account-studio-page.tsx:388-402`), and no first artifact carrying the wrong name. **Known by:** `organizations.name` at provisioning equals the intake's studio name; zero rename events in session one.

### M3 · The concierge seat, 30 days

**What.** Kody is seated `admin` in the studio for its first 30 days — as `kody@middlewest.studio` is in Middle West today (`03 §2.1`, `08 G1`) — and removed at the Handoff Session or day 30. With that seat, the evening before, he pre-loads *from what she sent*, using the same Account → Studio surfaces she will use: logo, rate rows, agreement defaults (deposit, cadence, exclusions — `account-studio-page.tsx:77-88`), the household with its email. She lands on a studio already set up, with the reason said out loud: "I put in what you sent me."

**Evidence.** The one import pattern that works in Patina is *somebody else does the entry* (`02 §1.10`, `§6.4`). Endowed progress holds only when the head start is real and its reason stated (`06 §10`). Paul Graham's manual scaffold (`06 §3`); the exit signal is the pattern repeating.

**Ruling needed.** Kody sees her whole book for 30 days — a VISION §4 trust question. Rule it, state it in the intake email, record it. If refused, the 6–10 beat absorbs the work and the session runs four to eight minutes longer.

**Time-saved.** Six to ten minutes off the session, and a first artifact carrying the right deposit, cadence and exclusions without her having discovered those fields exist. **Known by:** `studio_agreement_defaults` / `studio_member_rates` rows exist before her first `last_sign_in_at`; the artifact beat starts by minute 20.

### M4 · "Bring the schedule" — the PDF door (conditional)

**What.** A minimal door for `project-ffe-document-extract`: on the project schedule, an act "Bring the schedule · PDF" that stages a ≤25 MB PDF to `project-ffe-working`, calls the function, and lands rows *unverified* beside the schedule — the paperwork door's unverified-beside-verified queue (`use-inbound-documents.ts:14-26`, `02 §1.10`) — for her to confirm or refuse row by row. Text affordance, no badge, no fill. Built **only** if two of the first five intakes arrive with a PDF schedule; otherwise parked and the CSV ruling (`04 §a.1n`) is asked instead.

**Evidence.** Extractor, RPCs, bucket and hardening are built with zero portal callers (`02 §1.3`, `§5.1`; `project-ffe-document-extract/index.ts`, `00437:112,163`). FF&E re-entry is the largest re-typing burden (`02 §4` row 1, INFERRED). Her actual file type is unknown (`08 G4`) — hence the trigger.

**Time-saved.** A mid-flight job with a 30-line PDF schedule: ~20–30 minutes of hand entry (seven fields per line, `ffe-schedule-builder.tsx:235-400`) replaced by upload plus a row-by-row confirm. **Known by:** `stage_project_ffe_document_extraction` rows versus hand-inserted `project_ffe_items` for that project; the 16–20 beat's minutes. If confirming takes longer than typing, the door is wrong and we say so.

### M5 · The Handoff Session for the first hire

**What.** The second R133 call, scripted: owner and hire, 25 minutes, the day the hire accepts. Before it, Kody widens `onboarding-teammate-persona` from internal domains to that studio's (`01 §4`, `04 §a.1i`) so the arrival reads "You're in — {studio}" and the hire's coachmark copy shows ("Anything you begin here belongs to the studio, not to you" — `01 §5`). The owner writes the optional handoff note in the invite (`workspace-member-invite/index.ts:84,182-187`). On the call the hire opens the live job's document and does one real act — logs an hour, or adds a line the owner dictates. Not a tour; one act on one real job.

**Evidence.** The teammate arrival is the best-built moment in the product and is off for real studios (`01 §9.9`); the flag never left internal accounts (`04 §c`). The only unnamed real seat in prod is a hire invited to Leah's studio 09-04, dormant since (`08 G1`). "It would've been quicker to do it myself" / "half a day rather than two weeks of questions" (`07 §4` quotes 3, 7). A shared artifact dies when one person keeps it alive (`05` pattern 10) — the handoff is where the second keeper starts.

**Time-saved.** For the owner: the hire's "where is the [client] job?" is answered by the document, not by her — the handoff intake asks how many such questions she fielded last week; the Tuesday line asks again. For the hire: `first_document_opened_at` on day 0 (`00559`) and one 00291 event on the hire's own id inside the call. If `1a94f78f` is a real hire, this call is run with them first, this week.

### M6 · The Tuesday line

**What.** Four weekly ten-minute calls (or a text thread, her choice), weeks one to four, one fixed question: *"What did you do this week, for any job, that you wished was in here?"* Answers go to the record's manual-ways ledger with the tool named. Week two adds: "Shall we put the next house in?" — a second, shorter session. Nothing automated, nothing nudged in-product.

**Evidence.** Nobody knows what studios pop out *to* (`08 G4`); the only instrument is a person asking (`04 §c`). L2's "old-portal flights: 2+ — triggers NOT captured" was never collected (`08 G3`). Quiet reversion is silent by nature (`06 §8`).

**Time-saved.** None claimed for the calls; they *find* the next claim. Week one's honest output is a ranked list of the three things she did outside Patina, tool-named — what the second-wave proposals are built against instead of `02 §1`'s generic stack.

### M7 · The record and the measurement floor

**What.** (a) A one-page **session record** per studio at `docs/pilot/studios/<studio>.md`: intake received and format, invite sent at, minute marks per beat, artifact and recipient, her answer to the one question, what she re-typed versus pasted, what Kody promised. The R133 record that does not exist (`08 G6`) and the manual-ways ledger (`08 G4`) in one file. (b) Fix `designer_funnel` and `conversion_funnel` to filter on the names 00291 actually writes (`project_created`, `client_added`) instead of `project_create` / `client_interaction` (`03 §5.1-5.2`, `00038:51,90-92`, `00107:59`). One migration, no new tables or events.

**Evidence.** `03 §5` (four instrumentation defects), `§8.3` (server-side ledger is the reliable one), `08 G9` (measurement is prerequisite work), `04 §c` (the last program's plan was never read back).

**Time-saved.** None for the studio. For leadership: the first before/after that is not pinned to zero. **Known by:** `designer_funnel` returns non-zero "Created First Project" the day the migration lands (4 exist — `03 §5.1`).

---

## 5. Learn first — runnable this month

1. **Run L5 Block 1 and Block 3 with Leah — 40 minutes, this week** (`leah-session-05-founders-sitdown.html:98-102` plus the money block). Log it as the L5 DECISIONS entry. §3.1 is a compressed L5; the real thing calibrates it (`08 G3`, `G5`).
2. **Ask Leah how many houses Middle West has live, where each lives, and why the one in Patina is in Patina** (`08 G2`). Replaces `02 §4`'s assumed studio shape and picks the first job.
3. **Identify `1a94f78f`.** If a real hire, run M5 with them before any new studio is invited (`08 G1`).
4. **Run the first Setting-Up Session on Leah's second house, timing every beat.** The only real studio and the least representative (a co-founder). Treat it as the dress rehearsal that proves the flat-fee road clears the gate in one sitting.
5. **Kody writes down the studios behind the problem statement** — names, dates, what they saw, what they went back to (`08 G1`). Without this the second session has no subject.
6. **Rule the concierge seat (M3) and V2 (price)** before the first non-Leah session. A studio moved in during a working session asks what it costs by minute 45; there is no page and no answer (`08 G5`).
7. **Confirm the flat-fee send road on local** — `Draft a design agreement` → flat fee → `send_commercial_document` — before relying on it live. §2 is a reading.

---

## 6. How we would know — without a dashboard

Rows in two places — the server-side `engagement_events` ledger (`00291`) and the per-studio record — read by Kody by hand, weekly. No tile, score or bar (V11).

- **Artifact out inside the session:** `proposal_sent` / `invoice_sent` (or a `client_invitations` row) for the owner's id, `created_at` inside the session window. Target: every session. This is the activation event; nothing else is.
- **Minutes per beat** from the record: working when the artifact beat starts by minute 20 and the artifact leaves by 40. Overruns are precondition findings, not failures.
- **Re-typed versus pasted versus pre-loaded**, counted from the record; should fall session over session as M2–M4 land.
- **Second house in by week two:** `projects` rows per studio and the Tuesday record — the proposal's own retention test, since one job in Patina is not a studio in Patina (`08 G2`).
- **The hire's first act:** `first_document_opened_at` on acceptance day and one 00291 event on the hire's id inside the Handoff Session (`00559`).
- **The manual-ways ledger**, tool-named, per studio per week. Its shrinking is the only "stopped popping out" measure claimed; its contents decide the next build.
- **Never reported:** sessions, time in app, sign-in days, drip opens (none exist — `03 §3.4`), tour completion (`04 §b.10`).

---

## 7. Stop doing

- **Sending the invite before the session.** It lands her on an empty Desk with a modal (`01 §2`), and the drip takes over on a weekly floor (`03 §3.3`). The invite goes out at minute 3.
- **E3 and E4 for concierge studios until the clipper is installable.** Both send her to "the Chrome update is under review" (`02 §1.12`, `08 G7`). Skip those steps for studios with a session record — an edit to `steps_json`, not new machinery (`00561`).
- **Rendering the Pledge band to unflagged studios** (`accounts-earnings-page.tsx:110-127`, `08 G5`). "The Pledge, returned to you · $0.00" before she has been told a price contradicts VISION §3; pull or flag it until counsel and V2.
- **Citing the delegated-seat retention story.** It is Kody and a QA login (`08 G1`, `G10.3`); cited here only as a shape to test.
- **Weekly pulse drafts for a concierge studio in month one** (156 unsent, 2 sent — `03 §6.3`). The Tuesday line is the pulse.

---

## 8. Risks

- **Does not scale, by design.** Seven sessions a week is Kody's ceiling; the exit is the pattern repeating (`06 §3`). When a beat stops changing across five studios it becomes product — the next proposal.
- **The flat-fee road may not clear the gate as read.** Learn-first 7 exists for this; fallback is the rate-card road, ten minutes longer.
- **The concierge seat may be refused.** The session survives, four to eight minutes longer; M2 still lands the name.
- **Leah is the only subject and the least representative.** A co-founder does not pop out. Everything here is a dress rehearsal until Kody names a studio that did (`03 §1`).
- **The client may do nothing with the artifact.** Acceptable — the send is the studio's payoff (`06 §6`). But 0 signed ever (`03 §6.1`) means the agreement's second half is unproven; week one's Tuesday asks "did they sign?"
- **IKEA-effect exposure.** Anything she builds that Patina then loses or overwrites destroys the attachment the labor created (`06 §9`; the add-sheet studio-loading race in project memory is the known case). Lost work in a session is a P0.
- **Kody's time is the floor stream's cost** — roughly three hours per studio in month one. Write it down against V2's candidate prices.
- **The honesty condition.** Pre-loaded state is attributed out loud. Silent pre-fill is the one condition under which endowed progress fails (`06 §10`) and is a lie about how much Patina did on its own.

---

## 9. Evidence quality

**Read this session:** all eight reports in full; `VISION.md` §1–8; V11; R133; `00575` header, `:334`, `:387`, `:452`, `:655-690`, `:2228-2264`, `:3073+`; `00295:255-300`; `studio-setup.ts:30-110`; `designer-invite/index.ts:176-262`; `InviteDesignerDialog.tsx`; `workspace-member-invite/index.ts`; `open-project-sheet.tsx`; `draft-proposal-opener.tsx`; `send-sheet.tsx`; `invoice-send/index.ts`; `client-invite/index.ts`; `project-ffe-document-extract/index.ts`; `00437`; `account-studio-page.tsx`; the L5 one-pager and sit-down script. **Inferred:** that the flat-fee road clears `send_commercial_document` in one sitting; every minute mark in §3.2; that an admin seat can pre-load defaults (Middle West precedent). **Unavailable:** any real studio other than Leah's; who `1a94f78f` is; Leah's house count and tool stack; whether any R133 call has happened; live flag state. No prod SQL was run; production numbers are lane 03's.
