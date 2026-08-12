# Patina Threads — Product Requirements Document

**Version:** 1.0 (draft for owner review)
**Owner:** Kody
**Date:** 2026-07-15
**Companion docs:** `threads-implementation-spec.md` (engineering), `patina-threads-rcs-concept.html` (approved concept deck)
**Suggested routing:** `Strata/PRDs/Patina-Threads-PRD-v1.md` → promote to `Patina-docs/02-product/` on sign-off

---

## 1. Overview

Patina Threads is a conversational project layer delivered over **Twilio RCS Business Messaging with automatic SMS/MMS fallback**. It lets homeowner clients and field trades complete routine project actions — approving selections, choosing delivery windows, paying deposits, coordinating install day — inside their native messaging app, with no login, no app install, and no new account.

Threads is the *last-fifty-feet* system: the bridge between Patina's structured project data and the thumb of the person who needs to answer one question about it.

**The channel thesis:** text has a ~98% open rate; RCS adds a verified branded sender (Patina name, Strata Mark, verification badge), rich cards, carousels, quick-reply chips, and in-thread webviews — and Twilio degrades every message to plain SMS automatically when a device can't do RCS. One send, every phone.

## 2. Problem

1. **Approvals stall.** Clients who would say "yes" in five seconds take days when the yes lives behind a portal login. Every stalled approval pushes lead times, deliveries, and the designer's calendar downstream.
2. **Field coordination is off the record.** Trades will never adopt Patina software. Their coordination happens over personal texts and voicemail — invisible to the project record, unrecoverable when disputes arise.
3. **The designer is the human router.** Relaying the client's yes, the freight window, and the installer's punch item is switchboard work consuming skill time. Industry research in our knowledge base puts designer admin load at 60–70% of the week; the installation phase alone demands daily client contact.

## 3. Goals

| # | Goal | Signal |
|---|------|--------|
| G1 | Collapse approval cycle time from days to hours | Median time from `client_ready` → decision |
| G2 | Deposits cleared within 24h of proposal approval (Rail A) | Time-to-deposit via the payment flow |
| G3 | Field truth lands in the project record | % installs with Threads-captured check-ins/photos |
| G4 | Zero new burden on designers | No new designer inbox; escalations arrive pre-summarized in existing surfaces |
| G5 | The channel itself builds trust | Opt-out rate < 2%; verified-sender delivery share |

### Non-goals

- **Not a marketing channel.** Consent scope is transactional-service only. Widening scope is a separate decision (Open Question 6) requiring separate opt-in.
- **Not a designer chat replacement.** Design critique, taste, revisions, contracts, and anything emotional stay with the designer and the portal.
- **Not a second inbox for Leah.** Zero net-new obligations for designers.
- **Not a repository.** Contracts, proposals, scans, and the ledger live in deep surfaces; the thread carries pointers, never the artifacts.
- **Not a conversationalist.** Threads never improvises taste, negotiates, or argues. Structured first, interpreted second, human always.

## 4. Users

| User | Posture | Notes |
|------|---------|-------|
| **Homeowner client** | RCS-rich, SMS twin always authored | One thread per client relationship; project context switches labeled inside it |
| **Trade contact** (installer, receiver, freight) | SMS-first by design; RCS upgrade rides free | Terse field grammar — address, codes, times, reply codes. Entire flow must work on a flip phone |
| **Designer** | Beneficiary, not participant | Thread outcomes write to Designer Portal (Pipeline, client record timeline). Design-question escalations surface as five-second swipe cards |
| **Patina ops (Kody)** | Escalation target | Exceptions land in Mission Control Approval Inbox with transcript + Concierge Copilot draft reply |

**Out of scope v1:** makers/manufacturers (structured, document-heavy coordination belongs in the Manufacturer Portal).

## 5. Scope by phase

| Phase | Name | Contents | Gate |
|-------|------|----------|------|
| **0** | Foundations | Twilio RCS agent verification + A2P 10DLC registration; consent capture in onboarding; consent audit table; edge-function webhook receiver; thread event schema; legal review of consent language | Legal sign-off on consent language; carrier registrations approved |
| **1** | Notify & confirm | Outbound order/shipping milestones; delivery confirmations via YES/NO + reply codes; Run Log visibility of every send; pilot on one live Middlewest project | Pilot project selected (OQ8); Phase 0 complete |
| **2** | Decisions | Selection-approval carousels writing to FF&E schedule; delivery-window chips writing to project schedule; Stripe payment webview (Rail A deposits); Designer Portal thread timeline | Phase 1 stable on pilot |
| **3** | Two-way field | Site Cards; arrival/completion chips; MMS punch-item capture → R2; Tier-2 intent classification via ML sidecar; escalation cards in Approval Inbox with Copilot drafts; post-project quarterly check-ins | Phase 2 metrics green; OQ7 (trade identity) resolved |

Sequencing intent: **Phases 0–1 ship before Design Chicago (September 2026)** — "your clients approve selections by text, verified under a branded experience" is a designer-recruiting line on the floor.

## 6. Functional requirements

Requirement IDs are stable; Claude Code should reference them in commits and the Run Log.

### 6.1 Consent & lifecycle

- **TH-01** Express written consent is captured at project kickoff via a dedicated, plainly-worded checkbox (never buried in terms). Trades consent per-engagement at their onboarding touchpoint.
- **TH-02** All consent events (grant, revoke, scope, channel) are written to an **append-only** audit table with timestamp, source, and verbatim language shown.
- **TH-03** The first message to any contact confirms enrollment and states message purpose, expected frequency, HELP, and STOP.
- **TH-04** STOP (and carrier-standard variants) is honored instantly at the Twilio layer and mirrored to our record; all automated sends to that contact cease. Opting out of the channel never degrades service — portal and email continue.
- **TH-05** HELP returns a short help message with a human contact path.
- **TH-06** A revoked contact can re-opt-in via START; re-consent is a new audit event.

### 6.2 Identity & channel

- **TH-10** One phone number / one verified RCS agent identity ("Patina") for the life of the relationship. Never a bare long code presented without branding context in copy.
- **TH-11** A contact with multiple projects gets clearly labeled context switches inside one thread — never a second number.
- **TH-12** Channel selection is automatic (Twilio capability detection). Every template ships with both an RCS form and an authored SMS twin; the SMS twin is a designed artifact, not a truncation (see §6.6).
- **TH-13** Delivery/read receipts are recorded per message where the channel provides them; logic must never *assume* read state on SMS.

### 6.3 Outbound sending discipline

- **TH-20** Quiet hours: automated sends only between **09:00–19:00 recipient-local**. Exception class `day_of_logistics` (e.g., crew running late) may breach quiet hours only toward participants in that day's scheduled event.
- **TH-21** Client-facing decision requests are throttled to **one batch per day per client**.
- **TH-22** Read-aware nudging: an RCS message that is read but unanswered earns exactly **one** reminder after 48h. SMS (no read state) earns one reminder after 72h, worded gentler.
- **TH-23** Every automated send is recorded in the Mission Control **Run Log** (template key, contact, channel used, trigger).
- **TH-24** Idempotency: a given trigger event can never produce duplicate sends (idempotency key per trigger + template + contact).

### 6.4 Journeys

**J1 — Welcome (Phase 1).** Triggered on consent. Confirms enrollment (TH-03), introduces the designer with a card, and may nudge incomplete intake ("2 questions left on your style profile") at most once.

**J2 — Milestones (Phase 1).** Order placed / shipped / arrived-at-hub notes in brand voice with maker story snippets. Informational; no reply expected; replies route to Tier handling (§6.5).

**J3 — Selection approval (Phase 2).** Designer marks FF&E items `client_ready` in the Designer Portal → Threads composes **the Shelf** (carousel, max 5 cards; single item = the Card). Card = catalog hero image, item name, price, designer's note, actions **Approve this piece** / **Ask Leah a question** / **See it in your room** (deep link to iOS AR when the client has the app). Approvals write to the FF&E schedule with actor + timestamp; questions open a designer escalation with the item attached; confirmations echo running progress ("2 of 3 approved").

**J4 — Delivery window (Phase 2).** Shipment reaches local hub → client is offered carrier windows as chips (windows filtered to client availability preferences captured at kickoff). Selection writes to project schedule, notifies the receiving trade's thread, and schedules day-before + morning-of confirmations; morning-of includes crew first names and an **Add to calendar** action. Reschedule affordance persists until a stated cutoff.

**J5 — Payment (Phase 2, Rail A only).** Proposal/order total approved → summary card (pieces, total, what happens next) with **Review & pay securely** opening a **Stripe-hosted checkout in an in-thread webview**. SMS twin carries the same Stripe destination via a branded short link. Success posts a receipt card. One send per invoice plus one read-aware reminder before price-hold expiry. **Hard rules:** no payment data ever appears in a thread; nobody is ever asked to text a number; anti-phishing line ("we never ask for card details by text") travels with every money message; no urgency mechanics — the price-hold date is mentioned once, plainly.

**J6 — Install day (Phase 3, trades).** Evening before: **Site Card** — tappable address/map, access notes, codes, staging, run-of-show pointer. Morning-of chips: **On our way / Late / Problem**; "On our way" timestamps departure and notifies the client thread. During work: any inbound photo files to the project record (R2) with sender + timestamp; captions containing flag words (`damage`, `short`, `missing`, `broken`) create punch items routed to the ops Approval Inbox. **Wrapped up** closes the visit and triggers the client walkthrough prompt.

**J7 — Close & check-ins (Phase 3).** Reveal moment message, care-guide pointer, then quarterly check-ins (still transactional scope: warranty/service, not promotion).

### 6.5 Inbound handling — three tiers

- **TH-40 (Tier 1, deterministic).** Chip payloads, reply codes, YES/NO/START/STOP/HELP resolve instantly against the newest open prompt for that contact+thread. Target: ~80% of traffic.
- **TH-41 (Tier 2, interpreted).** Free text goes to the ML sidecar for intent classification (`reschedule`, `question_about_item`, `confusion`, `frustration`, `off_topic`, …). Confident matches resolve or redirect gracefully. The thread may ask **one** clarifying question, never two. The thread never argues.
- **TH-42 (Tier 3, human).** Low confidence, any frustration signal, any request for a person, anything touching money disputes or design opinion → honest handoff copy ("Handing this to a person — you'll hear back today") + escalation. **No dead ends, no loops.**
- **TH-43** Distress or safety signals pause all automation on that thread and flag a human immediately.
- **TH-44** Escalation routing: ops/logistics → Mission Control Approval Inbox (exception card, transcript attached, Concierge Copilot draft reply for one-tap send). Design questions → Designer Portal client record + designer's existing swipe queue, pre-summarized to a five-second read. Money/disputes → Kody directly, never automated.

### 6.6 Fallback grammar (SMS twins)

- **TH-50** Every template's SMS twin is authored, versioned, and reviewed alongside the RCS form.
- **TH-51** SMS twins open with sender identity ("Patina:") — no branding survives fallback.
- **TH-52** Choice sets become numbered options; codes remain stable for the life of the decision. Numbers over words; YES/NO accepted as aliases where natural. Every set reserves an option for "none of these / talk to a person."
- **TH-53** One link per message, always on our domain (`patina.cloud/…`), never a raw third-party or shortener URL. Linked pages are view-complete without login.
- **TH-54** SMS twins target 1–2 segments (~160 chars each). A message that wants three segments wants a link instead.
- **TH-55** Inbound MMS photo capture behaves identically across channels.

### 6.7 Surfaces & record

- **TH-60** Designers read full thread history as a timeline inside the Designer Portal client record (alongside scans and style profiles) and may send manual messages under the Patina identity, attributed ("Leah at Patina").
- **TH-61** Thread outcomes write to their systems of record: approvals → FF&E schedule; windows → project schedule; payments → internal ledger (Stripe reconciled against it, never trusted as it); photos → R2 with project linkage.
- **TH-62** Twilio delivery logs are reconciled against our own thread event table on a schedule; discrepancies surface in Mission Control. The channel is never the record.

## 7. Content & conduct rules

| Never in a thread | Lives instead |
|---|---|
| Card numbers, banking details | Stripe-hosted checkout, always |
| Contracts & legal documents | Signature flow via webview/portal; thread carries the pointer |
| Marketing & promotion | Nowhere (v1 consent scope is transactional-only) |
| Design critique & taste debate | The designer relationship |
| Urgency mechanics near money | One plain mention of a price-hold date, maximum |

Voice: Patina brand voice compressed to message length — warm, specific, unpretentious; maker story snippets where natural. Trades get terse field grammar, all signal. Copy templates are drafted by Kody and reviewed by Leah (OQ4). Per Round3 canon, client-visible copy never uses the term "AI"; escalation copy says "a person."

## 8. Metrics & instrumentation

Weekly via PostHog into the Morning Brief:

- **Approval cycle time** (headline; capture portal baseline before launch)
- **Time to deposit** (Rail A, target < 24h)
- **Missed delivery windows** on Threads-scheduled deliveries (target ~0)
- **Containment** (threads resolved without human touch, target ~80%) and **escalation precision** (handoff speed, context completeness, zero loops)
- **Channel mix** (RCS vs SMS share by audience) and **grammar parity** (SMS-twin completion rates must not quietly underperform RCS)
- **Consent respect** (opt-out < 2%, zero quiet-hour breaches outside `day_of_logistics`, HELP rate as confusion signal)
- Soft signal: trade sentiment — do crews describe Patina jobs as easy?

## 9. Dependencies

- Twilio account with RCS agent verification (brand assets per OQ5) and A2P 10DLC — **long lead time; start immediately in Phase 0**
- Legal review: TCPA posture, consent language, quiet-hours policy (joins existing counsel package)
- Stripe Connect (Rail A) checkout sessions; internal ledger write path
- ML sidecar endpoint for intent classification (Phase 3)
- Designer Portal client-record timeline slot; Mission Control Approval Inbox + Run Log event contracts

## 10. Open questions (from the approved concept deck)

| # | Question | Owner | Blocks |
|---|----------|-------|--------|
| OQ1 | Name: "Patina Threads" public, or invisible capability? | Kody + Leah | Nothing (working title fine internally) |
| OQ2 | Leah's escalation rules of engagement & response-time promise | Leah | Phase 2 design-question routing copy |
| OQ3 | The off-limits list — is the line right? | Leah | Template set sign-off |
| OQ4 | Copy deck ownership + Leah teaching session on thread tone | Kody/Leah | Template content, not architecture |
| OQ5 | RCS brand assets (avatar at 34px, tagline crop) | Design | **Phase 0** agent verification |
| OQ6 | Ever widen consent to inspiration content? (Instinct: no) | Team | Nothing in v1 |
| OQ7 | Trades identity: "Patina" or studio name in copy? | Kody + Leah | **Phase 3** trade templates |
| OQ8 | Pilot project selection | Leah | **Phase 1** launch |
| OQ9 | Legal package: one counsel engagement or two? | Kody | Phase 0 exit |

---

*End of PRD. Engineering detail lives in `threads-implementation-spec.md`.*
