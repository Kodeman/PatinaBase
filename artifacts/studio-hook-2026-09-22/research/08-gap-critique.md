# 08 — Completeness critique: what the dossier is missing

**Lane:** adversarial completeness review of lanes 01–07 for the design-solution team.
**Date:** 2026-09-22. **Repo state:** `main` @ `905852709`.
**Method:** read all seven reports in full; then went looking for what they did not — Leah's own record (DECISIONS.md L-entries, the Leah-session docs, project memory), the money surface in code, the Patina Field first-run flow, and the identity of every production seat lane 03 built inferences on. No prod SQL was run in this lane; every production number below is lane 03's, re-read against memory and artifact records that name the seats.

**Evidence key.** **VERIFIED** — I read the cited file/line this session. **INFERRED** — assembled from verified parts, stated as such. **UNAVAILABLE** — named, not reached.

---

## 0. The one-paragraph answer

The dossier is strong on *mechanism* — how the first session is wired, what cannot be imported, which rulings bind, what the literature says — and nearly empty on *the subject*. It never names the customer it is about. Production holds exactly two people who are not Kody or a Kody test identity: **Leah** (`ce3aee90`, Middle West Studio) and one unnamed designer she invited on 09-04 (`1a94f78f`). Lane 03's seat-level story — "delegated designers churn, the studio manager who did work on day 0 stayed" — is built on Kody QA-ing his own product: the retained "studio manager" is `kody@middlewest.studio`, the "drop-off" seats are `tester@patina.cloud` and a `+founding-test` Gmail. Meanwhile the one real thing the data says — **Leah's own studio has moved one project into Patina in seven weeks, has never sent a proposal from it, and completes only the invoicing loop** — is in lane 03's tables and attributed to nobody. The single document that would map how Leah actually runs a job (Leah Session 05: "where did the hours go, which phase makes her sigh, which tool would you refuse to give up") was prepared on 2026-08-18 and never run. Every "Leah" the team has read since is an agent playing her. Add to that: the studio never sees a price, there is no code path to pay one, and the in-product money story is inverted (the Pledge is rendered to every studio while the subscription is nowhere). A solution team proposing "how to hook switching studios" today would be designing against an imagined studio, an unspecified "manual way," and a money story the customer has never been shown.

---

## 1. The gaps, ranked by how much they would change the proposals

### G1 · The studios in the problem statement are not in the data — and the data that *is* there is mostly Kody

**What is missing.** The brief says "new studios come in, get excited, then pop back out." Lane 03 found 5 organizations, all Kody's or Middlewest's, and said so honestly (§1). But it then built §2.1 and §4 — the delegated-seat drop-off pattern and the day-0-value retention claim — on seats it could not identify, and the synthesis summary carried them forward as findings. Resolving the seats against memory:

| Seat | Lane 03's reading | Who it actually is | Source (VERIFIED) |
|---|---|---|---|
| `19e7ae9b` studio_manager, Middle West | "the strongest seat in prod — day-0 value drives retention" | **kody@middlewest.studio — Kody**, admin/Studio Manager at Leah's studio | memory `project_stray_studio_removal_2026_09_09.md` ("kody@middlewest.studio (`19e7ae9b-…`) now has exactly one membership: Middle West Studio … role admin / Studio Manager") |
| `86cdd0aa` designer, Middle Studio | "signed in, opened a document, never came back — 18 days" | **tester@patina.cloud**, the QA account used for the 09-01 invite probes and the 09-03 onboarding prod walk | `artifacts/ios-testflight-polish-2026-09-01/research/A3-prod.md:148`; memory `project_studio_invite_onboarding_fixes_2026_09_01.md:17`; `project_client_page_two_paths_2026_09_03.md:80` |
| `69063af4` gmail, unsubscribed at step 0 | "the only non-Kody-identity designer who ever hit the drip cold, opted out immediately" | **kody.kochaver+founding-test@gmail.com**, the drip smoke-test user, *neutralized by hand* on 2026-07-12 ("unsubscribed, is_designer=false, role removed") | memory `project_designer_onboarding_campaign.md:16` |
| `48e1ca60` owner, "Kody Designer" | never signed in | kody+designer | `project_client_page_two_paths_2026_09_03.md:80` |
| `00fd18b2` owner, "Kody Kochaver" | set up, never drove a job; walked through 25 drip steps | a studio literally named "Kody Kochaver" | lane 03 §1 (INFERRED from name) |
| `4c106571` bookkeeper, Middle Studio | never accepted, removed | invited into Kody's studio; identity UNAVAILABLE | — |
| `386de416` | dormant | PROBE-W4-THROWAWAY-STUDIO | lane 03 |
| `ce3aee90` owner, Middle West | "the principal … 32 days to first project" | **Leah** | memory `project_ios_testflight_polish_2026_09_01.md:239` ("Leah `ce3aee90-…` / Middle West Studio `7ba72774-…`") |
| `1a94f78f` designer, Middle West | "set up, never drove a job — dormant 18 days" | **UNAVAILABLE — the only seat nobody can name.** Invited 09-04 to Leah's studio. | no memory or artifact match (grep) |

So: "4 of 10 seats with an activation event have `designer_first_signin` and nothing else" is three test accounts plus one seat in Kody's own studio. The "n=3 delegated seats" is Kody, a QA login, and one unknown. The only positive retention case is the founder.

**Why it changes the proposals.** Any proposal that cites "day-0 value separates retained seats" or "delegated designers churn while principals tolerate delay" is citing Kody. The evidence base for the brief's premise is what VISION says it is — 1:1 conversation — and *that conversation is not recorded anywhere in the repo or memory.* Which studios popped out? How many? What did they say they went back to? The dossier does not know and did not say it does not know.

**What would close it.** Kody writes down, in a page, the studios behind the sentence — names, dates, what he showed them, what they said. And Kody says who `1a94f78f` is. If it is Leah's real first hire, that person is the single most valuable interview subject for this brief and is dormant right now.

### G2 · Leah's own studio is the case study, and nobody named it

**What is missing.** Lane 03 §2 has the row and does not say whose it is:

> Middle West Studio · created 2026-08-03 · 3 active members · **1 project** · 3 leads · 13 clients · 6 proposals (1 out) · 10 invoices · 2 hours entries · 0 products · 0 contacts · 0 field captures · last write 2026-09-14.

And §4: the owner took **32 days** from signup to first project, **42** to first payment, has **never** had `proposal_sent` fire, and is the most-returning seat in production (26 distinct sign-in days). That owner is Leah (VERIFIED above). Read plainly: **Patina's first customer, co-founder, and voice has one house in the Document, has never sent an agreement from it, has captured nothing into the library, has nobody in the rolodex, and uses Patina mainly to invoice.** She keeps coming back — but to do what? The 10 invoices and 13 clients say: to bill. The 0 products / 0 contacts / 1 project say: the rest of her practice lives elsewhere.

That is Kody's sentence — "get excited to set things up, then pop back out into their manual ways" — observed on the founder's own studio, in production, with row counts. The dossier had it and did not connect it.

**Why it changes the proposals.** The first "hook" test is not a hypothetical beta studio; it is whether Leah moves her second, third, and eighth house in. Every proposal should be checked against *her* book — what she has, where it lives, what she would have to retype (lane 02 §4's 8–16-hour estimate assumed "8 projects / 30 lines each" as a placeholder; Leah's actual numbers are one phone call away). And the fact that invoicing is the loop she completes is a lead: the money-in surface may be the door the rest of the practice follows through.

**What would close it.** Ask Leah how many houses are live at Middle West right now, where each lives (which tool), and why the one that is in Patina is in Patina. That is a 20-minute conversation and it replaces most of lane 02 §4.

### G3 · There is no record of how Leah runs a job — the session that would produce one was never run, and the "Leah" in the artifacts is an agent

**What exists (VERIFIED):**
- **L1–L4, June 2026** (`docs/design/the-document/DECISIONS.md:639, 850, 1758`; `leah-session-01-first-tuesday.html`): four real observed walks of an early Document build. Useful, narrow, and stale (Slice 5/6, pre-Galley, pre-People-room). L2 recorded "Old-portal flights: **2+ — triggers NOT captured**"; L3 recorded her verbatim "Very slick" / "It almost seems too easy" and her stated reason for leaving the new UI: *"Loves where this is going but still needs the complete functionality available in the portal"* — i.e. flight was completeness-seeking, not friction. Q14 flight triggers, Q9 verbatim, and Q1/Q2 precision-recall were **missed twice** and "owed async." Nothing indicates the debts were ever collected.
- **L5, prepared 2026-08-18, never run** (`leah-session-05-one-pager.md`, `leah-session-05-founders-sitdown.html`, `leah-session-05-findings-template.md` — template blank). Block 1 (25 min) is the exact instrument this brief needs: *"Walk me through your most recent project — first contact to today. Where did the hours actually go?"* · *"Of a typical ten-hour project week, how does it split?"* · *"Which tool in your stack would you refuse to give up? Which one do you resent every time you open it?"* · *"Where do projects stall, and what is the client doing?"* Block 3 (15 min) is the money question: react to 4% client fee / 25% Pledge / 18% take. Block 5 asks "would your clients scan a room?" Field-companion research (`docs/design/field-companion/research/04-intent-and-rulings.md:38,147`) already flagged L5 as unrun on 2026-08-24; the 2026-08-02 library-variance memory records "Discovery = 5 SYNTHESIZED composite interviews — one real Leah session owed."
- **Relayed asks** (memory `project_studio_asks_three_features_2026_09_09.md`, `project_pricing_mechanics_proposal_2026_09_05.md`): two second-hand relays from "Leah's team" — lead phone+email, Discovery→Lead undo, People edit; and per-piece client price adjustment with verified-pricing dates. These are the only first-person studio asks on record since June, and both were built/proposed within days. Both were relayed by Kody, not captured from Leah.
- **Simulated Leah, at least four times since 09-08** (`artifacts/portal-polish-review-2026-09-08/panel/leah-studio-principal.md`, `artifacts/agreement-room-2026-09-10/panel/memo-leah.md` "I have sixteen jobs open", `artifacts/hour-tracking-2026-09-11/panel/memo-leah.md` "two hires this year, three active houses", `artifacts/people-room-crm-2026-09-11/panel/ux/ux-5-leah-walk.md`): agents writing in her voice, with a fabricated studio shape (16 jobs / 3 houses — inconsistent with each other and with prod's 1 project) and a fabricated surname. **"Leah Hartwell"** appears in seeds, rulings (First Letter R1/R3), and panels; VISION.md:25 says **Leah Kochaver**; the TestFlight memory says surname "UNCONFIRMED — 'Hartwell' was inferred." Lane 01 cites the "Leah Hartwell" seed as corroboration without noticing.

**Why it changes the proposals.** Lane 07 went to the open web for "how small studios run a job in their own words" and came back with 18 quotes from strangers and a Reddit gap, when the primary subject is the co-founder. Every proposal's "studio moment" is currently imagined. The simulated panels are a hazard: a reader skimming the artifacts folder will find four confident first-person Leah accounts and no marker that none of them is her.

**What would close it.** Run L5 Block 1 and Block 3 — 40 minutes — before the solution team writes a line. Log it as the L5 DECISIONS entry the template already reserves. Also: settle her surname.

### G4 · "Manual ways" is undefined and unobserved

**What is missing.** The brief's operative phrase has no referent. Lane 02 mapped Patina against a *generic* studio stack it assumed (spreadsheet, Pinterest, QuickBooks, texts); lane 07 confirmed that stack from web sources; lane 04 established there is zero instrumentation for anything outside Patina. Nobody knows what the studios who popped out popped out *to* — a spreadsheet, a Studio Designer seat, an iMessage thread, paper, Leah's Google Drive. L2's own "old-portal flights" shows the historical "manual way" for Leah was *the old Patina portal*, not a spreadsheet — a materially different problem (completeness) than the brief assumes (switching cost).

**Why it changes the proposals.** Import-first (lane 06 §4), sync-not-cutover (Linear pattern), concierge loading (lane 06 §3) each target a *specific* incumbent artifact. Without knowing whether the incumbent is an .xlsx, a Programa workspace, or a text thread, the team cannot pick, and lane 02's dormant-asset ranking (FF&E PDF extractor first) is a guess about which file type she actually has.

**What would close it.** L5 Q1.4 ("refuse to give up / resent"). Or, cheaper: ask Leah to screenshot how she is tracking the houses that are not in Patina.

### G5 · The money story is absent from onboarding and inverted in the product

**What is missing.** The brief asked directly whether the studio sees the subscription price and the furniture-margin story during onboarding. The dossier does not address it. Checked here:

- **No price anywhere a studio can see.** No pricing route or page in any portal (`find apps -iname '*pricing*'` → only an iOS ASC skill folder). No `/pricing` string in portal source. The 17-email drip never states a price (copy-deck read in lane 01; no `$` amounts in the spine). VISION §4 promises "pricing is one page, public, and stable" — that page does not exist. V2 (`VISION-DECISIONS.md:35-40`) is still open: "Keep Designer Pro $49 / Studio $149, or a single studio tier?" VERIFIED.
- **No way to pay.** `subscription_tier` is an enum (`free | professional | enterprise`, `packages/supabase/src/hooks/use-organizations.ts:18`) written by two migrations (00021, 00556) and read by nothing studio-facing; every org is `free` (lane 03). No Stripe subscription-mode checkout, no billing portal, no `create-subscription` function exists (`grep -rln "mode: 'subscription'" supabase/functions apps/designer-portal/src` → nothing). VERIFIED. The enum's tier names do not even match V2's candidate tiers.
- **The Pledge is shown to every studio, today, unflagged.** `apps/designer-portal/src/components/document/accounts/accounts-earnings-page.tsx:110-127` renders "What teaching returns · taught-taste income · the 25% Pledge" and "The Pledge, returned to you · year to date · $0.00 · No Via-Patina orders yet — the Pledge begins with your first." It is mounted by `accounts-book.tsx:190` from the studio drawer (`studio-drawer.tsx:572`) with no feature flag on the book (grep for `useFeatureFlag` in accounts-book.tsx → none). `lib/document/pledge.ts:1-40` hard-codes `PLEDGE_RATE = 0.25` and a "provisional 10%" commons match. VISION §3 says "No Pledge language becomes public or contractual before counsel reviews it" and §5 marks it "Legal-gated until counsel signs off." VERIFIED on both sides — a contradiction between VISION and shipped UI that the dossier's vision-constraint scan (lane 04) did not catch.
- **The margin story is invisible.** V1 (margin pocket) is open; the pricing-mechanics proposal (2026-09-05) found four unshared margin computations that disagree and every insert path shipping at 0% markup; 0 purchase orders and 0 concierge orders in prod (lane 03 §6.4). The studio is never told that Patina earns on furniture sold through her projects.

**Why it changes the proposals.** "Hooked" for a subscription product means *paying*. If the team proposes activation milestones without deciding when the price appears, it is proposing a free product. And the current in-product money message — *you will be paid* (Pledge) with no mention of *you will pay* (subscription) — is the opposite of VISION's "you pay us and we pay you" question (V6), which is explicitly "open — does it survive Leah's ear." It has been shipped to her ear already.

**What would close it.** A ruling on V2 (price) and on whether the Pledge band is pulled or flagged until counsel; L5 Block 3.

### G6 · The human onboarding — Kody's own calls — is the real onboarding today, and it is undocumented

**What is missing.** R133 makes two CS calls doctrine (setting-up call in the first 2 days; handoff call the day a hire accepts), run personally by Kody. `designer-invite` refuses to send without a `{{personal_observation}}` (lane 01 §7). Lane 06 §2–3 says the cheapest, best-evidenced lever is exactly this concierge motion. But there is no script, no record of any call that has happened, no note of what Kody demos, promises, or asks a studio to bring. The dossier treats onboarding as the product surface; for a 1:1-acquired customer the onboarding is the conversation, and the conversation is not in the corpus.

**Why it changes the proposals.** If the team proposes a concierge first session (lane 06's top lever), it needs to know what the current one already is — and whether it happened for the studios who popped out. If the honest answer is "no call happened, the invite went out and the drip took over," that is itself the finding.

**What would close it.** Kody writes the setting-up call as he actually runs it (or admits it has not been run), and notes which invitees got one.

### G7 · Patina Field's role in the first session is asserted by the drip and contradicted by everything else

**What is missing.** The brief asked about Field's role. No lane owns it; lane 02 covers Field only as an import surface (share-sheet empty, no photo-roll import) and lane 01 only via the E3 email. Assembled here:

- **The drip promises it on day 4.** E3 "Your eye, everywhere": *"Patina Field is the same shelf in your pocket… Both take about two minutes to set up. Do the clipper first."* (`copy-deck.md:220-250`, VERIFIED). The clipper is `under_review` with no install URL (lane 02); Field is not on the App Store.
- **Field is TestFlight-only and Leah's access is unconfirmed.** Field 0.1(6) on TestFlight (memory MEMORY.md); internal tester group = `kody@middlewest.studio` only; Leah's ASC invite was issued 2026-09-04 with expiry 09-07 and her tester add "waits on her acceptance"; the M4 gate "Leah retires the tape measure" was **deferred, not passed** (R113), and field-companion research on 08-24 "cannot confirm Leah has *ever* held the Field Capture app on a real site" (`04-intent-and-rulings.md:89`). Middle West Studio: **0 field captures, 0 room scans attributed**; `device_push_tokens` = 1 row, sandbox (lane 03). VERIFIED from memory/docs; the live TestFlight tester list is UNAVAILABLE.
- **Field's first run is not a studio's first run.** O1 "Capture in the room. Showrooms, markets, fabric houses…" (`WelcomeScreen.swift:27,32`); O2 signs in via Apple or email OTP and requires an existing workspace membership, with a "no workspace" dead end (`ConnectWorkspaceScreen.swift`, `OnboardingFlowView.swift`). It is a capture instrument for a designer already inside a studio, not a door.
- **Two different iOS apps are conflated across the dossier.** VISION §1 ranks "the iOS app" as surface #2 — that is *Patina* (the client/homeowner app, `apps/mobile/Patina`), "a marketing and qualification instrument the studio owns." Patina Field (`apps/mobile/Capture`) is the designer/trades tool. Lane 02 and the drip talk about Field; the vision constraint the brief quotes talks about Patina. No lane separates them.

**Why it changes the proposals.** Any proposal that makes capture-in-the-field or "scan a room" part of the hook has no evidence that the first customer has ever done it, and the two on-ramps the drip names are both shut. Conversely, the Field Line SMS rail (lane 02 §1.8) — the one surface that literally needs no learning — is the one thing on iOS that is *not* an app, and the team should be told that plainly.

**What would close it.** `asc testflight testers list` for Field; ask Leah whether Field is on her phone; decide whether Field is in the first month at all.

### G8 · The homeowner side is unproven, and some proposals will lean on it

**What is missing.** VISION's second promise is "you're engaged every day." Lane 06 §6 warns that day-one value must not depend on the homeowner. The data: **0 proposals have ever reached `signed`** (lane 03 §6.1); the First Letter (client invite) went live 09-09 but its accept leg "NOT verified in prod" and Leah's six provisional rulings plus Q5 are still owed (memory `project_client_invite_first_letter_2026_09_08.md`); lane 07 §3 item 5 says clients resist a new login. Nothing shows a real client of Leah's has opened a page, approved a line, or signed. The dossier has all three facts in three different lanes and never states the conclusion.

**Why it changes the proposals.** A "client-facing wow" hook (one of L5's four MVP-wedge candidates) is untested in the only studio that exists. Lane 06's single-player-first rule applies with force.

### G9 · Nothing can measure a fix, and one "unknown" was knowable

**What is missing.** Lane 03 §5 is thorough: funnel views pinned to zero by event-name mismatch, `conversion_funnel` at 4200%, `last_active_at` never written, 0 email opens across 400 rows, no `posthog.group()` so no per-studio view, `automation-processor` writes no `job_runs`. Lane 04 adds that the 2026-09-03 program's own measurement plan was never read back. What the dossier does not say: **a proposal cannot be scored before-and-after without a measurement wave first**, and that wave is prerequisite work, not a follow-up.

One open question repeated by lanes 01, 03 and 04 — *who flipped the drip sequences to `active` and when* — is answered in memory: **armed 2026-07-12 by the shipping session** ("SHIPPED + ARMED 2026-07-12 … both sequences ACTIVE", `project_designer_onboarding_campaign.md:16`). The dossier read code and migrations but not the operating memory.

### G10 · Contradictions and claims stated more firmly than their evidence

| # | Where | Claim | Status |
|---|---|---|---|
| 1 | Lane 03 §2 | "Middle Studio … (this is the founder's own studio)" beside "Middle West Studio … driving jobs (thinly)" | Ambiguous: both are founders' studios. Middle Studio = Kody; Middle West Studio = Leah (VERIFIED, memory). Lane 03 never says Middle West is Leah's. |
| 2 | Lane 03 §3.2 (1) | `69063af4` is "the only non-Kody-identity designer who ever hit the drip cold, opted out immediately" | **Wrong.** It is `kody.kochaver+founding-test@gmail.com`, hand-neutralized 07-12 (VERIFIED). |
| 3 | Lane 03 §2.1, §4, §8 (4)–(5) | Delegated designers churn; day-0 value retains | Rests on Kody (`19e7ae9b`) and QA (`86cdd0aa`). Withdraw. |
| 4 | Lane 01 §2 / Lane 04 (a) 1b | Step-6 tour CTA reads "Capture a lead" vs "To work" | Lane 04 resolves it (Sanity ctaLabel edited to "Capture a lead" 09-03 evening, per memory) but marks it unverified live; lane 01 states "Capture a lead" flatly. Minor; unverified live. |
| 5 | Lane 02 §4 | "roughly 8 to 16 hours of pure transcription" | Explicitly INFERRED with an assumed studio shape; the synthesis summary carries the number without the assumption. Leah's real shape replaces it (G2). |
| 6 | Lane 01 §1a | "`Leah Hartwell` … a person-named studio beside a real one" cited as corroboration | It is a local-dev seed; the surname is fabricated (VISION.md:25 "Leah Kochaver"; TestFlight memory: "surname UNCONFIRMED"). |
| 7 | Lane 04 (a) 2 | Studio Rosters / `call-sheet` "NOT deployed to prod" | Memory (MEMORY.md) says the flag is "retiring in the people-crm build"; People-room CRM shipped 09-16. Lane 04 flags it as stale — treat as superseded. |
| 8 | Lane 02 §1.12 | Chrome extension shut because "Submit not clicked" | From memory (2026-09-02); real CWS dashboard state UNAVAILABLE. Lane 02 says so; the summary does not. |
| 9 | Lane 02 §1.9 | "the runbook's own closing line" says the reported-hours card is flag-off | The line exists (`sms-10dlc-runbook.md:363-365`) but is dated to the Phase-3-absent state; lane 02 also says `FIELD_LINE_PHASE=3` was set 09-21. The flag claim is a PostHog-side fact nobody read live. |
| 10 | Lane 05 | Studio Designer "~3.7/5" | Competitor-sourced; lane 05 flags it. Do not quote. |
| 11 | Lane 06 §5, §11, §13 | Chameleon 53%/75%, Intercom 62/34, Gainsight, Bain figures | Lane 06 flags them as untraced. Do not quote. |
| 12 | Lane 07 §2, §3 item 8 | 36% admin time, 6 tools/6 logins, 20–40 hrs/mo reconciliation | Vendor marketing; lane 07 flags them. Do not quote. |
| 13 | Lane 01 §4 vs memory | `arrival-arc` "kody-only" vs "100%" | Unresolved in lane 01; moot for designer-created leads. Fine. |
| 14 | Lane 03 §0.2 vs lane 04 | PostHog per-org analysis "structurally impossible" (no groups) vs lane 04's "read what we already instrumented" | Not a contradiction, but together they mean the 2026-09-03 events can only be read per-user, and the user set is Kody. |

### G11 · Lanes that returned thin or unavailable evidence, and one lane nobody ran

- **Lane 01**: no browser walk, no live flags, no prod SQL; the self-signup failure branch is INFERRED (`SUPABASE_SERVICE_ROLE_KEY` binding unknown). No human timing.
- **Lane 02**: zero production row counts; all minutes inferred; catalog population unknown.
- **Lane 03**: PostHog unavailable; per-org analysis impossible; and, per G1, the seat identities were UNAVAILABLE to it and are now known.
- **Lane 04**: file-based only; did not read the 2026-09-01 invite-fixes memory or `project_designer_onboarding_campaign.md` (which answers its own open question 4-adjacent "who flipped").
- **Lane 05 / 07**: Reddit and LinkedIn feed posts unreachable across eight query attempts; "Foyr Spacecraft" and "Kaleidoscope" do not exist; Studio Designer/Mydoma primary review pages unreached; Canva unverified; no podcast transcripts.
- **Lane 06**: WebSearch-only; primary PDFs not read; weakest-tier stats flagged.
- **Not run by anyone**: (a) the admin-portal side of onboarding — how Kody actually invites a studio (`designer-invite` is admin-gated; the admin studio-management UI shipped 09-02) and what the invite email he sends says; (b) the client portal's first page as a homeowner sees it; (c) the studio-facing help content actually served by Sanity for `desk`/`doc` hosts; (d) any conversation with Leah.

### G12 · Two verified findings that risk being over-weighted

- **The `/auth/signup` dead end (lane 01 §1b)** is real and should be fixed or removed, but no one has ever used it: `designer_applications` 0, `founding_designer_applications` 0, `designer_prospects` 0, `waitlist` 1 (lane 03 §1). Acquisition is invite-only by doctrine. It is a hygiene item, not a hook.
- **The `studio-workspaces` single-flag risk (lane 01 §4)** is real but is a resilience issue, not an onboarding-design issue; it belongs in a deploy checklist, not the leadership deck.

---

## 2. Leah's voice — what the corpus actually holds

| Source | Real Leah? | Date | What it gives | Where |
|---|---|---|---|---|
| L1 first-Tuesday protocol + findings | Yes (observed) | 2026-06 | one-folder time-to-read; phone-reach instinct noted | `leah-session-01-first-tuesday.html`; DECISIONS L1 |
| L2 findings | Yes | 2026-06-12 | "punch card — comfortable"; write-first close-out vindicated; **old-portal flights 2+, triggers not captured**; Q1/Q2/Q9/Q14 debts owed | `DECISIONS.md:639-680` |
| L3 validation walk | Yes | 2026-06-12 | "Very slick" / "It almost seems too easy"; flight reason = completeness-seeking; her thresholds (idle <1 min; PO unsent 1d; unacknowledged 1d) | `DECISIONS.md:850-880` |
| L4 phone walk | Yes | 2026-06-14 | Rooms physics green on her phone; no findings | `DECISIONS.md:1758-1790` |
| Three studio asks | Relayed by Kody | 2026-09-09 | lead phone+email; Discovery→Lead undo; edit a People card | memory `project_studio_asks_three_features_2026_09_09.md` |
| Pricing-mechanics feedback | Relayed by Kody | 2026-09-05 | per-piece client price; spread margin; verified-pricing dates | memory `project_pricing_mechanics_proposal_2026_09_05.md` |
| First Letter rulings R3/R4/R7′/R8/R9/R11 + Q5 | Owed to Leah, unconfirmed | 2026-09-08 | — | memory `project_client_invite_first_letter_2026_09_08.md` |
| L5 founders' sit-down | **Never run** | prepped 2026-08-18 | would give: hours map, sigh phase, refused/resented tools, stall points, money reaction, client-moment map | `leah-session-05-*` |
| Panels "Leah Hartwell" ×4 | **No — simulated** | 2026-09-08 → 09-11 | fabricated studio shapes (16 jobs / 3 houses) | `artifacts/*/panel/*leah*` |
| Prod rows for Middle West Studio | Yes (behavioral) | 2026-08-03 → 09-14 | 1 project, 6 proposals (1 out, 0 signed), 10 invoices, 13 clients, 2 hours, 0 products/contacts/captures | lane 03 §2, §4 |

What is *not* there, anywhere: how many houses Middle West has open; which tool holds them; what she resents; whether she has read a single drip email; whether she has Field on her phone; what she thinks Patina should cost.

---

## 3. Open questions for Kody (the ones only he can answer, in priority order)

1. Which studios is the problem statement about? Names, dates, what they saw, what they said they went back to.
2. Who is `1a94f78f` (middlewest.studio designer, invited 09-04, dormant since)? If a real hire — can we talk to them this week?
3. How many houses does Middle West have live today, and where does each one live (tool/file)? Why is the one in Patina in Patina?
4. Can L5 Blocks 1 and 3 be run with Leah before the solution wave — 40 minutes?
5. Has a setting-up call (R133) ever been run? For whom? Is there a script?
6. V2: what does a studio pay, and when in the first month is that stated? Should the Pledge band in the Accounts book be pulled or flagged until counsel (VISION §3)?
7. Is Patina Field on Leah's phone? Is Field in the first month at all, or is the SMS rail the only field surface for now?
8. Leah's surname — Kochaver (VISION.md) or Hartwell (rulings, seeds, panels)?
9. Has any real homeowner of Leah's opened a client page, approved a line, or signed? (Prod says 0 signed, ever.)
10. Should a measurement fix (funnel views, `posthog.group()`, `job_runs` for the processor) be a precondition of the build, given nothing can currently score a change?

---

## 4. Evidence quality

**VERIFIED by file read this session:** all seven lane reports in full; VISION.md and VISION-DECISIONS.md (V1–V6, V7–V11 headings); DECISIONS.md L2/L3/L4 blocks; all three L5 docs; the four simulated-Leah panel headers; `accounts-earnings-page.tsx`, `accounts-book.tsx`, `studio-drawer.tsx:572`, `lib/document/pledge.ts`; `use-organizations.ts:18`; the absence of any subscription-mode Stripe code and any pricing route (greps recorded inline); Field `WelcomeScreen.swift`, `ConnectWorkspaceScreen.swift`, `OnboardingFlowView.swift`; `CaptureShareExtension/` empty; `sms-10dlc-runbook.md:363-365`; copy-deck E3; and the memory records that name each production seat (`project_ios_testflight_polish_2026_09_01.md:239`, `project_stray_studio_removal_2026_09_09.md`, `project_client_page_two_paths_2026_09_03.md:80`, `project_studio_invite_onboarding_fixes_2026_09_01.md:17`, `project_designer_onboarding_campaign.md:16`, `artifacts/ios-testflight-polish-2026-09-01/research/A3-prod.md:148`). **INFERRED:** that `00fd18b2` and `4c106571` are Kody test identities (from studio name and studio ownership, not a record); that Leah's returning sign-ins are for invoicing (from the row-count shape). **UNAVAILABLE:** identity of `1a94f78f` and `95b80df2`; live TestFlight tester list; live PostHog flag state; whether any R133 call has occurred; Leah's actual house count and tool stack; every production number here is lane 03's read, not re-queried. No mutation of anything was attempted.
