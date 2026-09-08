# Rulings, vision, voice, and deck conventions that bind this feature

Source: exploration pass, 8 September 2026 (read-only). Verified against the repo at commit 02eb0a95f.

All paths repo-relative to `/Users/kody/Code/patina-merged` unless absolute.

---

## 1. Vision — the homeowner, the promise, and how Patina appears

**`docs/vision/VISION.md`**

§2 Who we serve:
> "**Homeowners** are the *studio's* clients, arriving by word of mouth. The first homeowner beta cohort is Middle West's active design clients (Kody's words: "active Patina customers" — read as the studio's current clients; confirm). **Patina does not sell to homeowners.**"
> "Neither is Patina's customer in its own right — yet. The studio is."

§4 How we please our clients:
> "**To the homeowner:** *you're engaged every day, and you and your designer are looking at the same agreed direction.* Fewer surprises. The decision record is the relationship."
> "**To both:** pricing is one page, public, and stable. No lock-in, no hidden fees. Your data exports."

§6 Saying no to (binds homeowner-facing copy and UI):
> "**The "AI" label.** Non-negotiable. It's Designer-Taught Intelligence."
> "**Consumer-first thinking.** The homeowner is the studio's client. Any consumer push that outruns the studio count is drift."
> "**Tab / zone / dashboard UI, shadows, red/green status, badges.** One living Document, typography-first."
> "**Funnel-spam growth.** 1:1 and relationship-driven."

**`docs/vision/VISION-DECISIONS.md`**

- **S4** — "Service promise. Studio: "you won't notice Patina." Homeowner: "engaged daily, one agreed direction." Never optimize the studio surface for engagement."
- **V8 (ruled 2026-09-04)** — "**The web client page is surface #1's client-facing face — the homeowner-facing side of The Document — not a fourth ranked surface.** The Document is where the studio keeps the record; the client page is where the studio's own client reads it. One record, two doors." And its consequence: "The web client page **may be designed for daily return** the same way the iOS client app already is under V7: a person checking in on her own house is not the engagement Patina refuses to chase in a designer's working tools."
- **V7 (ruled 2026-09-02)** — the tab-bar carve-out for iOS; every other §6 refusal applies unchanged.

**Answer to "white-labeled / co-branded / Patina-branded":** the Vision file itself never uses those words. The governing ruling is **PP-1** (§3 below), which is neither pure white-label nor co-brand: **studio-authored, Patina credited once, at the bottom, in the smallest type** — "Prepared by {Studio} · Sent through Patina", "No Patina wordmark above the colophon."

**V1–V5 and client-facing identity:** *none of V1–V5 touches it.* V1 (margin pocket), V2 (studio price), V4 (entity), V5 (thesis line) are money/legal/tagline. **V3** is the closest and only adjacent one — "Pause the consumer Founding Circle (0/200) until at least one studio beyond Leah's is live?" — i.e. a marketing-cohort question, not an identity ruling. The client-facing identity rulings are **V8**, **PP-1/PP-9**, and **R7** (approvals), not V1–V5.

**Live conflict worth flagging:** VISION **V5** lists *"Where Time Adds Value"* as an **open ruling** ("canon or retire?"), while the brand-voice skill states it as the tagline and `docs/marketing/founding-onboarding/copy-deck.md` signs T0 with it. Same for the Pledge: VISION §3/V6 says "No Pledge language becomes public or contractual before counsel reviews it", while the skill's hard rules instruct stating the 25% Pledge "plainly and contractually." An invite-email copy spec must not inherit either from the skill unread.

---

## 2. Brand voice skill

**`.claude/skills/patina-brand-voice/SKILL.md`** — 44 lines, **no `references/` directory, no other files in the skill.** (Confirmed: `ls -R` returns only `SKILL.md`.)

Verbatim, the parts that bind homeowner-facing email copy:

> **Voice attributes**: "Confident yet unpretentious — expert warmth, never arrogance." · "Sensory & tangible — words you can touch: linen, leather, cedar, grain, hand-turned, kiln-dried." · "Story-driven — every piece has provenance." · "Plain-spoken Midwest — honest, specific, zero luxury-brand haze."

> **Hard rules**
> "Technology is the silent enabler. NEVER lead with AI, algorithm, engine mechanics, ML, or "powered by" language in external copy. Outcomes first."
> "Designers are the intelligence layer. Never "our designers" as labor, never gig framing, never "unlimited revisions" energy."
> "The 25% Pledge is stated plainly and contractually: "a quarter of our commission goes back to the designers who teach the system." No hedging."
> "Midwest examples and testimonials only. No coastal signifiers (no "NYC penthouse," no "LA modern")."
> "Numbers in copy must be true and sourced. No puffery stats."

> **Lexicon**
> "Prefer: patina, provenance, heirloom, grain, workshop, maker, hand-built, honest materials, grows with your space, trade, studio."
> "Avoid: disrupt, revolutionize, AI-powered, curated (overused), luxury, elevated (as filler), bespoke (unless literally custom), gig, marketplace-speak in consumer copy."

> **Formats**
> "Outreach: ≤150 words, one specific personal observation about THEIR work in the first two sentences, one concrete ask, zero flattery filler."
> "Decks/docs: Playfair headlines, Inter body, DM Mono labels; understatement over exclamation."

**Not found in the skill:** the phrase "Designer-Taught Intelligence" (it lives only in `VISION.md` §1/§5 and §6's refusal of the "AI" label); any email-specific section beyond "Outreach"; any rule about how to refer to Patina on client surfaces (that lives in PP-1). There is no `references/` file to read.

---

## 3. Prior design docs bearing on client-facing branding and first touch

### 3.1 Portal polish review — **the binding branding law** (PP-1, PP-9)
`artifacts/portal-polish-review-2026-09-08/rulings.md`

> **PP-1** — Principle 1 — the studio is the author; Patina is the press → "**Client pages only, not the Desk.** Letterhead law and colophon law on homeowner surfaces (house page, decision papers, standalone invoice); **no Patina wordmark above the colophon on client pages.** The designer portal's wordmark and footer stay as they are."
> **PP-9** — "The Desk keeps its PATINA wordmark and footer identity."
> **PP-6** — "**Amend the rulings now, before any build.** Record V-entries in docs/vision/VISION-DECISIONS.md; amend I107, R126 and R135 … Build starts on amended rules." (Note: the next free V number is **V9**; no V9 entry exists in VISION-DECISIONS.md yet — the PP-6 amendment is **owed, not landed**.)

`artifacts/portal-polish-review-2026-09-08/synthesis.md` §3.1, the rule verbatim:

> "**Rule:** every client surface opens with a two-sided letterhead — studio left, "Prepared for <Client>" right — and closes with a colophon, "Prepared by <Studio> · Sent through Patina". **No Patina wordmark above the colophon. Never a placeholder identity.** The designer's full name and date on every note. **Copy in the studio's voice.**"
> "**What changes:** "Tell us what you would like to change." → "Tell Leah what you'd like to change." … The studio note signs "Leah Hartwell · Local Dev Studio · 3 September 2026", not "— L.". **Where the client's display name is unset, the right-hand slot prints nothing.**"

Same file, DECLINE table — explicit bans on client surfaces:
> "| PATINA wordmark or "us" copy on client surfaces | BE-01, BE-02, BE-05 |"
> "| Pills, status dots, badges |" · "| Green success fill |" · "| A spinner |" · "| ✓ glyphs as typography |" · "| The "LW" avatar disc | BE-10 — a chat convention on a letter |"

Build spec implementing it: `docs/superpowers/specs/2026-09-08-portal-polish-build-design.md` §3.1 and `docs/superpowers/plans/2026-09-08-portal-polish-build.md` Lane H1 — "**No PATINA wordmark exists on the Threshold today and none is added**; the assertion is a test, because a refusal nobody tests is a refusal that expires."

### 3.2 The Client Page — two paths / the Threshold (shipped)
`docs/design/the-client-page/README.md` — Path B · The Threshold shipped 4 Sept 2026, unflagged, to every client. Relevant to arrival:

> "Harper Vale opens a link from a text message and meets a header." (the diagnosis — the arrival surface is reached from a link in a message, not from a bookmark)
> "The page is not a fourth ranked surface. It is the homeowner-facing face of **The Document** (S1)… **The homeowner remains the *studio's* client; Patina does not sell to her (S2).**"
> Anchor map an invite email would have to target: "approvals and design reviews land on `#doorstep`, proposals on `#door`, invoices on `#letterbox`, budget on `#ledger`, documents on `#mat-papers`, orders on `#road`, messages and inbox on `#note`, a named decision on its own ask (`#approval-<decisionId>`), room scans on `#doorstep`, and account/preferences/settings on `#mat`."
> Two open questions still recorded: "**Who writes the note** — Nora in her own words, or the studio's standing sentence alone? Shipping the first while operating the second is the one way either path turns out badly."

`docs/design/the-client-page/the-client-page-two-paths.html:605` — the voice rule as shipped:
> "**One voice rule, enforced in code rather than taste.** The page's own voice is third person, dated, plain. First person appears only inside a quoted note from a named human — Nora, 4 August."

### 3.3 The Single Pane (5 Aug 2026, ruled)
`docs/design/the-single-pane/README.md`

> "Underneath the clutter is a second problem — **the client received a plainer subset of the brand. The studio's side of Patina reads like a letterhead; the client's side got borders and a badge.**"
> Ruling: "B · The Making, with A's letterhead, C's stamps, and D's standing sentence + voice."
> Direction D's stance, kept as the voice standard: "**Nothing here speaks in a system voice. Every element is authored — dated, first-person, signed.** The house is not reported to Harper; it is written to her." (`the-single-pane-four-directions.html:1898`)

### 3.4 The Arrival Arc — the closest existing precedent for a studio-authored first contact
`docs/design/the-document/the-document-arrival-arc-package.md` (ruled; built as **R106**, see `DECISIONS.md:3761`)

> "**The ruling: accept is a threshold, not a button.**"
> "**1 · Accept claims immediately.** On accept the request is claimed and the client's iOS app shows a held state at once: *"Middle Studio has taken your request in hand — introduction on its way."* **Truth-framed: it reports what happened, it does not speak in the designer's voice.** No client sits claimed and greeted by silence, and **the system never impersonates her hand.**"
> "*What it asks — the designer's hand.* A scaffolded composer: a context line assembled from the payload ("Elena scanned her living room · leans warm-minimal · 25–40k") sits above; **the words below are hers. Nothing pre-written, nothing auto-sent.** Optional voice-note attachment."
> "**Send is gated** on non-empty words AND ≥2 slots — **nothing sends itself.**"
> "**3 · Put-downable, not atomic.** Leaving mid-ceremony parks it as a Needs Your Hand card — *"Introduce yourself to Elena"* — draft preserved."
> "Push: named and specific ("You're matched — Middle Studio accepted your living-room request"), **never generic**."
> Rejected for the record: "**editable template intro**" (i.e. a pre-filled draft the designer edits was explicitly rejected in favour of a blank composer with a context line above it).

### 3.5 "The Decision, Delivered" — client approval experience
`artifacts/client-approval-experience-2026-09-03/` (proposal.html + ux/*), rulings at `build/rulings-2026-09-04.md`.

Adopted rulings that bind any homeowner email:
> **R7** — "**The studio signs client mail: designer given name, studio name, city** (omit city when unknown)." (Wave-1 close refined: "Resolve from `profiles.city`, then `organizations.address->>'city'`; omit when both are empty.")
> **R16** — "Patina goes quiet after the overdue notice. Push honors an 8am–8pm local window."
> **Vocabulary (binding on every surface)** — "**Never "gate", "task", "dashboard", "AI", "overdue" in copy a homeowner reads. No guilt, no apology, no invented timing, no numbers where words will do.**"

`ux/03-behavior-and-copy.md` §6, the branding rule stated most directly:
> "Every body below is designer-voiced and studio-signed. **Patina does not sign emails to homeowners.** Replacing the current *"— Patina"* sign-off with the studio's own name is the single most vision-aligned change in this section: **the studio leads, Patina is quiet.**"

`ux/01-journey-architecture.md`, the thesis line for the whole homeowner surface:
> "**Delight is Leah's studio speaking clearly, on Patina's paper, with Patina never taking the byline.**"

Its Moment-1/Moment-2 diagnosis is the nearest thing on file to a first-touch spec:
> "**Broken.** A linkless email is a dead end that reads as machine mail. "Reminder" on first contact makes the studio look as though it has already been waiting."
> "**Polished.** A short note in the designer's voice, studio name at the top: **one sentence of why, one line of what changes, one button.**"
> "The sign-in screen, when its callback points at an approval or proposal, says whose it is first: *"Leah's studio sent you something to look at. Sign in and it opens."*"

`ux/03-behavior-and-copy.md` §2 principles that constrain a welcome/invite:
> "**Engaged every day means there is something true to read every day. It never means we ask for something every day.**"
> "2. **Curiosity is earned with substance.** A notice that names the thing — the white oak, the back hall, the maker — earns the open. "Something needs you" trains her to ignore us."
> "3. **Reciprocity flows from the designer, never from the system.**"
> "5. **One ask per notice.** One decision, one door, one link."
> Blacklist rows: false urgency · countdown timers · streaks/stats · "Confetti, celebration animation, sound" · guilt copy · apologetic copy ("*"Just a gentle nudge"* … reads like Patina is embarrassed to be there") · red/green status · "**Social proof** — There are no other people. It would be a lie."

### 3.6 Onboarding campaign / drip
`docs/superpowers/plans/2026-09-03-designer-onboarding-learning.md` — designer-side, but carries the **strongest existing precedent for a studio-written personal note on an invite**:

> **Task L8: Accept-invite names the studio; the owner's handoff note** — `ALTER TABLE organization_members ADD COLUMN handoff_note text CHECK (char_length(handoff_note) <= 280)`; "`studio-invite-modal.tsx` (optional textarea "**A line for her first day**", 280 chars)"; rendered on arrival as a MarginNote "*"— From {owner first name}: {handoff_note}"*"; and "`accept-invite/page.tsx` (heading shows `organization_name`)".
> **Task L9: Drip retiming E2–E9** — conditions so emails skip when the activation event already happened, "cap cadence with `delay_days` ≥ 7 between emails".

`docs/marketing/founding-onboarding/copy-deck.md` — the 17-email designer campaign; T0 is a **designer** invite (`from: Kody at Patina <kody@patina.cloud>`, subject "An invitation to Patina"). Its conventions section is the closest house standard for email templates:
> "`{{personal_observation}}` on T0 is **required** — no send without it."
> "**Letters (T0, N2, W0, E10) must render as letters — no feature grids, no screenshots, generous line spacing.**"
> "Bodies are written to be read whole with images off, each with exactly one primary CTA."
> Note this deck is **Patina-signed and Patina-branded** — correct for a designer invite, and the exact opposite of PP-1/R7 for a homeowner invite.

---

## 4. Existing mentions of invites, invitations, personal notes, custom messages

Every hit that constrains an invite-email feature:

| Source | Quote / ruling |
|---|---|
| `docs/design/the-document/DECISIONS.md:2632` **R73 · Invite-on-send** | "Linking a no-account household to a proposal (or a decision, or any client-facing act) sends a **magic-link invite carrying the document**; the client-portal account is created when they open it. The ClientPicker's dead "NO PATINA ACCOUNT" rows become a live **"invite & link"** act… Signing stays in the client portal… **One identity model, one new email leg.**" |
| `docs/design/the-document/DECISIONS.md:8284` **J2** | "**J2 — invite-on-select becomes arm-then-confirm**, and the consent step is reachable without a mouse." Also `docs/design/doc-polish/deck.html:612`: "Picklist auto-invite, no confirm → **Arm-then-confirm; selection never sends.**" |
| `artifacts/client-approval-experience-2026-09-03/ux/03-behavior-and-copy.md:166-172` — the **only drafted invitation email in the repo aimed at a household**, studio-signed | "Invitation email, studio-signed: > Subject `Anne added you to the Van Hise project` *(example)* · Preheader `Read the plans, join the conversation.` · Body: *"Dave — Anne added you to the Van Hise kitchen and back hall. You can read the plans, the specs, and the numbers, and talk with me right in the project. Anne signs off on decisions, so nothing is waiting on you. **Open the project →** — Leah Kochaver, Middle West Studio · Madison"*" |
| same, P-29 | **DEFERRED**: "loop in a household member … greenfield auth/RLS … R3 says do not ship the co-approver in twelve months. Build it as its own program." So that invitation email is **written but not built**. |
| `artifacts/client-approval-experience-2026-09-03/discovery/01-designer-approval-creation.md:398` | The shipped proposal send sheet already has: "**Recipient**, **CC (optional)**, **Expires after**, **Personal message** (textarea, placeholder *"Write a personal note to your client…"*)". |
| `artifacts/client-approval-experience-2026-09-03/discovery/02-client-portal-journey.md:42` | That personal message renders in the branded email as a `callout`, between the kind-specific description and the `Investment:` line. |
| `docs/design/the-document/DECISIONS.md:1850` | "a sheet carrying recipient, CC, expiry, and a personal note (the matrix's …)" — the send-sheet shape carried into The Document. |
| `docs/design/the-document/patina-proposal-authoring-prototype.html:273` | Field label **"A personal note"**, prefilled specimen: *"Hi Sarah — here's everything we discussed, laid out room by room. Take your time; I'm happy to walk through any of it. — Leah"* |
| `docs/prds/consolidated/08-client-portal.md:145` | "**Client lifecycle**: `client-invite` (POST send + `/accept`; token lands at `${CLIENT_PORTAL_URL}/auth/invite/{token}`)." Public allowlist includes `/auth/invite/*` (`:59`). |
| `docs/prds/consolidated/10-comms-email-notifications.md:61,144` | `client-invite` is one of the domain senders; all client email goes through Resend via `supabase/functions/_shared/branded-email.ts` (`renderBrandedShell`, `heading`, `paragraph`, `ctaButton`, `muted`, `callout`, `spacer`) — inline HTML string builders, **not** `packages/email` templates (`artifacts/client-approval-experience-2026-09-03/discovery/04-backend-and-notifications.md:227`). |
| `docs/prds/consolidated/01-designer-portal.md:163` | "Invite reuses the client-invite path (`useAddClient`, `invite:true`) rather than a dedicated team-member flow." |
| `artifacts/client-approval-experience-2026-09-03/discovery/04-backend-and-notifications.md:37` | Precedent for freezing invite content: `00388` outbox row carries "a full immutable render snapshot (`recipient_email`, `designer_name`, `studio_name`/`logo`, `client_portal_path`, etc.) so the edge function never re-derives content from mutable rows after the fact — **the record of what the client was actually shown is frozen at send time.**" |

**Not found anywhere in `docs/` or `artifacts/`:** the strings "why am I getting this", "why you're getting this", "receiving this", "welcome email", or any spec for a homeowner **welcome/first-arrival** email distinct from a document-carrying send. There is also no ruling on a Patina-branded vs studio-branded **From: address / sender name** for `client-invite` — R7 rules the *signature*, not the envelope.

---

## 5. Presentation conventions for decks delivered to the Patina team

Two established idioms. Both are **single self-contained HTML files**, no build step, no server, external requests only for three Google Fonts families, and both are published as private Claude Artifacts with the link recorded in the folder README.

### Idiom A — the scrolling proposal document (recommended for a feature proposal)
Representative: **`artifacts/agreement-composed-2026-09-06/proposal.html`** (2,175 lines) and **`artifacts/invoice-standalone-2026-09-06/proposal.html`** (1,225 lines).

Layout, in order:
1. `<style>` opening with a `:root` token block, then `@media (prefers-color-scheme: dark)` and a `:root[data-theme="dark"]` twin (an explicit theme toggle is supported).
2. `<div class="shell" data-prose-total="900">` — a word budget for the whole document.
3. `<header class="masthead">` — `.eyebrow` reading "Patina · The Document · proposal for the Patina and Middle West Studio team · 6 September 2026"; `<h1>` in two lines; a `.standing` one-sentence thesis; then a `.masthead-meta` grid of **Prepared for / Lanes / Standing** — where "Standing" states honestly e.g. "Nothing here is built · Fifteen proposals, three waves, sixteen rulings".
4. `<nav class="index">` — numbered contents `00`…`14` + Appendix, anchor links.
5. `<section id="…" data-prose-cap="60">` per chapter, each opening with `<div class="opener"><p class="eyebrow">Twelve</p><h2>Rulings</h2></div>` — **section numbers spelled as words in the eyebrow**, digits only in the contents rail.
6. **The rulings section** is a table: `# | Ruling | Recommendation | Owner | Blocks`, rows `R1`…`R16` with `id="r1"` so every mention elsewhere in the deck deep-links back (`<a href="#rulings">R6</a>` appears ~20 times inline). Lede: "*Each of these is a recommendation, not a decision. The owner column names who rules; disagreement is the useful response.*" Owner column names real people — Kody / Leah (practice) / Leah (ear) / Counsel.
7. **"What stays out"** — an explicit non-goals list, each item naming the ruling that owns it.
8. **"How to respond"** — the approve/comment affordance. Verbatim: "**Comment on the Artifact** on the line it concerns." · "**Rule R1–R16** — Kody owns ten; Leah R3, R7 and R13…" · "**Walk the Okonkwo fixture** in the portal against M1 — thirty minutes gets further than reading." Followed by a `.qgroup` of numbered open questions for the Middle West team.
9. **Appendix** — "Citations, sources, panel, vision test".

Supporting tooling in the same folder, part of the house style: `source/proposal.md` (the spine in Markdown), `source/fixtures.json` + `source/check-fixture.mjs` ("Recomputes all 65 fixture figures; fails loudly on drift"), `source/check-prose.mjs` (the word-budget gate reading `data-prose-cap`/`data-prose-total`), `review/render-check.mjs`, and a README folder-map table.

### Idiom B — the slide deck
Representative: **`artifacts/portal-polish-review-2026-09-08/deck/index.html`** ("Paper, Polished", 4,551 lines). `<section class="slide" id="slide-N" data-label="…">` × 18, each with an `<h2 class="t-d1">`; slides 14–16 are `spec-slide` embeds of the three specimens; slide 17 is "Keep · modify · decline" as a `table.sheet`; slide 18 is "What happens next, and the evidence register". Rulings for this idiom were **not** in the deck — they were extracted afterwards to a sibling `rulings.md` as a `No. | Question | Ruling` table (PP-1…PP-9) plus a "**What these rulings do not decide**" list.

Third example if a two-option comparison is wanted: `docs/design/the-client-page/the-client-page-two-paths.html` — "nine numbered sections: the wound, the one rule, the panel, what both paths share, Path A, Path B, compared, the recommendation, the colophon", with both full mockups as sibling files and first-viewport plates embedded so it needs no external images.

### Visual language / tokens
The canonical token sheet is **`artifacts/portal-polish-review-2026-09-08/specimens/SPEC.md` §A**, adopted as the type-and-rhythm contract for both portals by **PP-5**: "Paste this block verbatim. Do not add tokens. **Do not use a hex literal anywhere else in the file.**"

Shared values across all three decks: paper `#FAF7F2` / doc-paper `#FCFAF6` / rail `#E8E3DB`; ink `#2C2926` (13.53:1) with the muted ramp `#4E4339` / `#5A4E43` / `#65594E`; state pigments clay `#C4A57B`+`#7C5E30`, golden `#E8C547`+`#79651E`, terracotta `#D4A090`+`#9C5340`, sage `#A8B5A0`+`#5F6B57`; mocha `#5C4A3C`; charcoal `#2C2926` as the only filled terminal act. Fonts: **Playfair Display** display, **Inter** body (the agreement deck substitutes **Newsreader**), **DM Mono** labels/money — which matches the brand-voice skill's "Playfair headlines, Inter body, DM Mono labels". Seven type steps + a 15px money step, 24px module, three radii, three paper stocks. **No shadows** (an eslint gate enforces this in the app; the decks honour it), no reveal motion, no pills/badges/dots, `color-scheme: light dark` with a dark twin.

---

## 6. `docs/design/the-document/` — the designer's client-management flow today

**Ground truth screenshot of what exists now:** `docs/design/the-document/screenshots/dissolve/fix-round/d1-people-add-client-open.png` — The People Room, "ADD PERSON" top-right, opening a sheet:

- Eyebrow `ADD · TO YOUR ROSTER`, heading **"Bring someone in"**
- Sub: *"Add a client to your directory. They appear on your roster at once; an optional invite gives them a Patina login."*
- Role picker: `A CLIENT · A MAKER · A GC · A SUB · AN INSTALLER · A RECEIVER`
- Fields: **FULL NAME (OPTIONAL)** (`e.g. Sarah Whitfield`) · **EMAIL** (`sarah@whitfield.com`)
- Checkbox, checked by default: **"Send a magic-link invite to Patina"**
- Escape hatch: *"Not a client yet? Add a lead in the pipeline."*
- Acts: `ADD TO ROSTER` · `CANCEL`

Note for the UX team: **there is no message/note field on this sheet today**, and the checkbox literally says "invite to **Patina**" — which is the one string on the designer's side that presumes Patina-branded framing of the client's first touch. Related: `d2-people-after-close.png` in the same folder; `docs/design/the-document/screenshots/dissolve/e1-people-threads.png` and `e2-people-role-maker.png` for the room around it.

Text sources for the same flow:
- `docs/design/the-document/people/the-document-people-room-package.md` — the People Room build package: "**Scope = everyone.** One unified directory of people: clients, makers/vendors, GCs, team"; audit targets named as "`/portal/clients` (page.tsx, ClientListItem, **AddClientDialog**, FilterRow, MetricsRow), `useClients`"; "full team invite/management stays /portal/team".
- `DECISIONS.md:2716` (R73 walk record) — "ClientPicker invite-and-link: service-role invite creates the auth user + profile and links the SAME designer_clients row — walked fully live: capture → discovery → direction → drafting → **invite & link** → SENT".
- `docs/_archive/specs/Redesign/patina-client-management-design.html` — the archived (superseded) client-management design; only mentions "personal note" in a nurture-prompt context, nothing about invites.

---

## What I could not find

- **No V9 entry** in `VISION-DECISIONS.md`. PP-6 requires the PP-1…PP-5 amendments be recorded there before build; that record does not exist yet, so PP-1 currently lives only in the artifact.
- **No spec, plan, or ruling for a homeowner "welcome" or "first arrival" email** distinct from a document-carrying send. The nearest artifacts are R73 (invite-on-send carries a document), the deferred household "loop in" invitation (P-29), and the designer-side handoff note (L8).
- **No "why am I getting this" / "receiving this" language anywhere** in `docs/` or `artifacts/` — no ruling on explaining provenance to a cold recipient.
- **No ruling on the From: name / sender address / reply-to for homeowner mail.** R7 rules the sign-off; PP-1 rules the page. `client-invite` currently sends via `_shared/branded-email.ts` through Resend; the designer campaign's precedent (`from: Kody at Patina <kody@patina.cloud>`) is designer-track and contradicts R7 if copied.
- **No `references/` directory in the brand-voice skill** — SKILL.md is the whole skill.
- **No first-arrival state spec for the Threshold.** The closest is panel finding N8 ("The Threshold's quiet day is silence, not a stated reassurance") recommending a "nothing needs you today" line, which PP-2…PP-5 did not rule on directly.
- **`docs/design/the-document/screenshots/reaudit-2026-07/` is empty**; `docs/design/the-client-page/shots/` holds the two-path plates but no invite/arrival screens.
