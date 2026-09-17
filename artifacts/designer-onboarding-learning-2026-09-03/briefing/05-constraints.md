# Constraints any onboarding proposal must obey — sourced, verified 2026-09-03

Every rule below is quoted from its source file, read directly in this session (or, where noted, cross-referenced from a file that was read).

---

## 1. Vision-level constraints (`docs/vision/VISION.md` — wins over every other doc)

**The refusal on engagement optimization (§4):**
> *"To the studio: **you won't notice Patina.** It is not a place you go. It prompts and collects information when and where you need it, then gets out of the way. Success is that she doesn't notice — so **we will never optimize the studio surface for engagement.**"*

This is the single hardest constraint on any onboarding proposal: a tour, a checklist, a nudge, an email drip are all, in one reading, engagement-optimization instruments. The existing surfaces thread this by being **one-shot and receding** (margin notes: "Appears once · Recedes on use"; tours: "never auto-start again" once completed/abandoned) rather than recurring engagement loops. Any new mechanism should be checked against whether it recurs, nags, or measures "time in app" as success.

**Homeowner promise, for contrast (§4):**
> *"To the homeowner: **you're engaged every day**, and you and your designer are looking at the same agreed direction."*

Note the asymmetry is deliberate and load-bearing: engagement is the *homeowner's* promise, never the studio's. An onboarding proposal aimed at the designer inherits the studio's "won't notice" contract, not the homeowner's "engaged every day" one.

**"Never AI" (§6):**
> *"**The 'AI' label.** Non-negotiable. It's Designer-Taught Intelligence."*

Confirmed live in the codebase's own naming: nothing in the reviewed help/tour/analytics code uses "AI" — the Engine (`EngineResults`, ⌘K's "Ask the Engine") is the closest surfaced concept, and it's named "the Engine," never "AI."

**No engagement metrics as success measure (§6):**
> *"**Engagement metrics** as a success measure for the studio surface."* (listed under "Saying no to")

**No dashboards, no tab bars, no zone UI (§5):**
> *"**The Document.** One living document per engagement. No dashboards, no task manager, no tab bars. Truth-framing over taste-framing."*
Also (§6): *"**Tab / zone / dashboard UI, shadows, red/green status, badges.**"* — listed among refusals.

**No scope creep / side journeys (§6):**
> *"**Scope creep and side journeys.** A feature that doesn't serve §2's studio at §2's moment waits."*

**The feature test (§8):**
> *"Before building: which surface (§1), which studio moment (§2), which stream (§3), which promise (§4)? If the answer is 'none of them,' it's a side journey — log it and park it."*
Any onboarding proposal should be run through this test explicitly: which surface (The Document, §1 — onboarding for the next 12 months is a Document-only problem, not iOS or marketplace), which studio moment (§2 — see below), which stream (§3 — onboarding serves neither stream directly but gates activation into both), which promise (§4 — "won't notice").

---

## 2. Who the onboarding is for — facts about the audience

**VISION §2, quoted:**
> *"A growing design studio at the moment it adds its first hands while its workload doubles. Leah's studio first; then a pool of studios like hers, Ring 01 (Madison / Milwaukee) outward. That is a trigger, not a demographic. The studio owner is delegating for the first time, her own hours are already spoken for twice, and the thing she cannot afford is a new system to learn. Acquisition is 1:1 through Leah's network — never SEO strangers."*

Implications for onboarding design:
- The person signing up is often **not the sole user** — she's bringing on hands who also need to learn the system, likely with less context than she has (see the studio setup checklist's "Invite your crew" step, and the `crewInvited`/`memberCountBeyondSelf` derivation in `studio-setup.ts`).
- She is time-poor by construction ("her own hours are already spoken for twice") — this is the strongest argument in the existing system for the Desk Walkthrough's own framing: *"Six stops, about a minute"* and the founding-email copy's *"ten quiet minutes."*
- Acquisition is 1:1 and warm (Leah's network), not cold-funnel — the T0 invite email is written in Kody's own voice with a required `{{personal_observation}}` token, not a generic drip opener. Onboarding copy throughout assumes the recipient already trusts the sender.

**Leah's actual pilot behavior** (`discoverability-review-2026-07.html`, §1, quoted verbatim — see file 03 §12 for full context):
> *"Very slick." / "It almost seems too easy." / "Loves where this is going — but still needs the complete functionality available in the portal."*

She fled to the legacy portal at least twice within two structured sessions; the team's own debrief guessed the cause was *"⌘K gap or naming gap"* before confirming it via the `zone_flight` telemetry. **The single most important fact from this review for onboarding design:** Leah did not fail on the tour or the modal — she failed on **ambient, day-40 wayfinding**, after any one-time onboarding moment would have already faded. A polished first-run experience did not prevent flight to the old tool; what closed the gap (per the review's recommended rulings, R93–R96) was making the *permanent* surfaces (the palette, the margin, a standing contents index, the ledger sheets) self-teaching, not adding a better tour. Any new onboarding proposal should weigh investment between "the first hour" and "the ambient hundred hours after" with this evidence in mind — the existing gap was almost entirely in the latter.

---

## 3. "The studio won't notice Patina" — operationalized in the current code

This is not just a vision-doc line; it shows up as concrete implementation discipline:

- **Once-only, receding, never re-triggered.** `margin-note.tsx`'s own doc: *"A note shows at most once per person and recedes permanently the first time it is either dismissed (×) OR its named action fires... after which it never renders again on any surface."* Caption literally states the contract to the user: *"Appears once · Recedes on use."*
- **Tours never re-auto-start once resolved.** `desk-walkthrough-gate.ts`: *"A tour is resolved once completed OR abandoned — either way it must never auto-offer again (spec §4.7 rule 1)."* Same rule inherited from the retired `first-signin-tour.tsx`'s comment quoting the same spec section.
- **No badges, no pulsing counts.** From the Document's own canon (`DECISIONS.md` D8, quoted): *"Studio Drawer persistent on every screen; ledgers open as overlay sheets; collapsed by default, **no badges, no pulsing counts**."*
- **The whisper, not the checklist, is the exception that proves the rule** — `StudioSetupWhisper` deliberately does NOT use the once-only contract (it re-derives live), but is gated tightly: owner-only, `openCount >= 2`, single line, no counter chrome. Even this recurring nudge stays a single Playfair-italic sentence with one action word, never a progress bar or a persistent badge.

---

## 4. Typography lock and visual canon

**The three-typeface system, confirmed in `globals.css`:**
```css
--font-display: var(--font-heading), 'Playfair Display', Georgia, 'Times New Roman', serif;
--font-body: var(--font-inter), -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
--font-meta: var(--font-mono), 'DM Mono', 'SF Mono', 'Fira Code', monospace;
```
In practice throughout every file read this session: **Playfair Display italic** for the "voice" register (margin note bodies, whisper copy, empty-state titles, welcome-modal-adjacent prose — always `font-heading ... italic`), **Inter** for ordinary body copy, **DM Mono, uppercase, letter-spaced** for eyebrows/labels/captions/shortcut chips (e.g. `"Appears once · Recedes on use"`, group headings in ⌘K, the `G L` shortcut chip). A new onboarding surface should not introduce a fourth typeface or a sans-serif "friendly UI" voice register — the existing system has exactly two registers (Playfair-italic for teaching prose, DM-mono for structural/meta labels) and no third.

**D4 — zero shadows, no exceptions (locked decision, `DECISIONS.md`):**
> *"D4 | No shadows. Anywhere. No exceptions. Value contrast + flat stacked edges + folder tab; mechanically enforced via lint, CI-blocking."*
Confirmed enforced in code: the Desk Walkthrough explicitly overrides the shared package's default `shadow-lg` coachmark styling to `shadow-none` (`desk-walkthrough.tsx`, `COACHMARK_CLASSNAME`); the contextual help panel does the same (`document-help.tsx`, `className="shadow-none"`). D4 has been amended twice for narrow, named exceptions (the folio pickup affordance's hover shadow, gated to `prefers-reduced-motion: no-preference`, and — per `DECISIONS.md` line ~9981 — three additional sites in R126, "The Life Review") — but the default for any new onboarding chrome must be **zero shadow**, and any exception needs its own explicit ruling, not an assumption.

**D8 — no badges, no pulsing counts** (quoted above, §3) — a coachmark step-counter or a "3 of 6" progress dot would run against this if applied to persistent chrome (the Desk Walkthrough's own step sequence is transient, on-screen only during the tour itself, which is why it's permitted — R94 explicitly *forbids* a step counter on the margin note: *"carries no step counter (R94 forbids all of those)"*).

**The Strata Mark — the one sanctioned progress device (R15, extended by R35, `DECISIONS.md`):**
> *"Ratifying Leah's Question 9, moderated. The mark becomes a progress device: its three lines render as fill-state mapped to the engagement's three movements... MOTION: exactly one — a slow breath (~3s ease, subtle opacity swell) on the ACTIVE spine marker only... 'Pulsing' beyond this is declined — **ambient motion is what the no-badge discipline exists to prevent.**"*
The Strata Mark is used as the glyph for `'document'`-kind rows in ⌘K (confirmed in `command-bar.tsx`'s `PaletteRow` type and `renderGlyph`). If an onboarding proposal needs to show "how far along" a designer is in setup, the Strata Mark idiom (three lines, fill-state, one sanctioned breath animation, `prefers-reduced-motion` disables it) is the only pre-approved progress visualization in the system — a percentage bar, a step-count badge, or a checklist progress ring would all be novel chrome outside canon.

**No red/green status, no tab bars, no dashboards** — direct from VISION §6 (quoted above) and structurally absent from every file read: the studio setup checklist uses a monochrome check-square (`✓` on sage-green fill vs. an unfilled ink-bordered square) rather than red/green semantic coloring for "not done."

---

## 5. D1 — strict one-document-at-a-time focus

**Locked decision, `DECISIONS.md`:**
> *"D1 | Strict one document at a time. No split view, no peek/hold. Esc or 'Put down' is the only exit; switching costs one trip through the Desk or a ⌘K jump."*

**Direct consequence for the Desk Walkthrough**, quoted from its own module doc:
> *"A WelcomeModal plus a six-step coachmark sequence that NEVER leaves `/desk` (a step routing into `/doc/` would auto-start the R4 timer, which must never lie — Design 1). This component is mounted once in the (document) layout and self-guards to the Desk; on every other surface it renders nothing."*

This is a hard technical + design constraint discovered directly in the code: **an onboarding tour cannot walk a designer into an actual document**, because entering a document starts a real, honest work timer (R4) — a tour step that entered `/doc/[id]` for demonstration purposes would either lie about time tracking or corrupt real data. Any proposal that wants to "show, don't tell" by walking through a live document needs a synthetic/sample document that never starts the timer, or must stay confined to the Desk exactly as the current tour does.

---

## 6. One-act-many-surfaces — the registry discipline

**`registry.tsx`'s own canon note:**
> *"The Studio Surface Registry — R93/R95's single definition of every room, ledger, and verb a designer can reach from inside a document. One entry, one icon, per surface; the Studio Drawer (D8), the ⌘K command bar, and the Desk's Contents page (R95) all read this list rather than keeping their own — so a surface renamed or re-iconed here changes everywhere at once, and the three surfaces can never quietly drift out of sync with each other."*

This is the structural fix the discoverability review demanded (Foundation item, "one shared studio-surface registry... One definition, one icon, no surface described twice") and it is now load-bearing: **any new onboarding surface that references a room/ledger/verb by name, icon, or shortcut must read those facts from `registry.tsx`, never hand-author them.** The registry's own `help: { surfaceKey, blurb }` field on every entry (confirmed for all 4 rooms, 5 ledgers, 5 verbs, and the 3 document-scoped surfaces) already exists specifically to be the one source for a one-line teaching blurb per surface — an onboarding proposal that wants per-surface intro copy should extend this field, not invent a parallel content source.

**Data-only discipline:** the registry file's own doc states, *"This file is DATA ONLY: no component imports, no event handlers, no `window` access, no React."* — a hard constraint on where such registry-adjacent content can live.

---

## 7. Brand-voice lexicon (`.claude/skills/patina-brand-voice/SKILL.md`)

Quoted directly (this skill's scope is external/customer-facing copy broadly — designer, maker, homeowner — so it applies to onboarding copy the same as marketing copy):

**Voice attributes:**
1. *"Confident yet unpretentious — expert warmth, never arrogance."*
2. *"Sensory & tangible — words you can touch: linen, leather, cedar, grain, hand-turned, kiln-dried."*
3. *"Story-driven — every piece has provenance."*
4. *"Plain-spoken Midwest — honest, specific, zero luxury-brand haze."*

**Hard rules directly relevant to onboarding:**
- *"Technology is the silent enabler. NEVER lead with AI, algorithm, engine mechanics, ML, or 'powered by' language in external copy. Outcomes first."* — consistent with VISION's "Designer-Taught Intelligence" rule; note the Engine ("Ask the Engine" in ⌘K) is a UI-internal mechanism name, not marketing copy about it.
- *"Designers are the intelligence layer. Never 'our designers' as labor, never gig framing."*
- *"The 25% Pledge is stated plainly and contractually... No hedging."* — but note VISION §3 flags the Pledge as **legal-gated, not yet public**: *"No Pledge language becomes public or contractual before counsel reviews it."* An onboarding proposal must not surface Pledge language until that gate clears.
- *"Midwest examples and testimonials only. No coastal signifiers."*
- *"Numbers in copy must be true and sourced. No puffery stats."*

**Lexicon — prefer:** patina, provenance, heirloom, grain, workshop, maker, hand-built, honest materials, grows with your space, trade, studio.
**Lexicon — avoid:** disrupt, revolutionize, AI-powered, curated (overused), luxury, elevated (as filler), bespoke (unless literally custom), gig, marketplace-speak in consumer copy.

**Format rule directly applicable:** *"Decks/docs: Playfair headlines, Inter body, DM Mono labels; understatement over exclamation."* — matches the typography lock in §4 above, and explicitly names "understatement over exclamation" as the tonal register, consistent with every piece of production copy quoted in file 03 (no exclamation points found in any margin note, tour step, or checklist copy read this session).

**Cross-check against existing onboarding copy:** the production strings quoted in file 03 already honor this voice closely — "Every live job lands here, one line each, grouped by stage," "The marks follow the work. Nothing on this list is something you tick — do the thing and the box fills." — plain-spoken, sensory-light but concrete, zero exclamation, zero AI-mechanics language. The founding-email copy deck goes further into the sensory/provenance register ("kiln-dried hardwood, honest joinery, pieces that earn their patina") appropriate to its outward-facing, pre-signup context — in-product copy is quieter and more procedural, which is itself a useful register distinction for a persona team to preserve.

---

## 8. The discoverability review's rulings — what they forbid/require for tours and palettes specifically

(Full context in file 03 §12; this section extracts only the constraining clauses.)

- **R93 (The Populated Palette) is "within canon"** — explicitly *not* a new ruling requiring approval, because *"R5 already made ⌘K the front door; this only finishes it."* This means ⌘K's centrality is settled canon (R5) and not open for an onboarding proposal to relitigate (e.g., proposing a separate "getting started" menu instead of teaching ⌘K itself would cut against established canon).
- **R94 (The Marginalia) forbids tours and step counters on the ambient teaching layer:** *"The studio should teach in pencil... First-touch notes appear once in the margin, then recede for good; nothing blocks, nothing repeats, nothing has to be dismissed."* And explicitly, from the review's own risk note on R94: *"notes written once and never revisited slowly describe an interface that has moved on"* — a named, acknowledged risk (content rot) that any proposal extending margin notes should account for (e.g., a mechanism for refreshing stale one-time copy as the product changes).
- **R96 (The Laid Sheet) carries an explicit guardrail that also bounds future onboarding chrome inside a ledger sheet:** *"a sheet stays one page"* — i.e., a ledger sheet (Orders, Accounts, Hours, The Post) must not grow tabs, wizard steps, or its own internal navigation for onboarding purposes; per the review, *"a sheet that grows tabs or its own navigation stops being a sheet and becomes a modal app."*
- **The review's own explicit citation of onboarding-tutorial research** (NN/g, "The Right Way to Do Onboarding Tutorials") as a rationale for R93+R94's "recognition over recall" approach — i.e., the review's argument for populated/ambient teaching *over* a walkthrough tour is grounded in published UX research the team has already bought into; a proposal leaning heavily on new modal tours over ambient/registry-driven teaching would need to argue against this established position, not merely restate the tour approach.
- **The Arc post-mortem is cited as a live cautionary precedent** inside the company's own canon: *"Arc built a beloved novel interface, then watched features strand and abandoned the product — a caution, not a template."* Any proposal introducing a genuinely novel interaction pattern (rather than extending ⌘K/registry/margin-note idioms already in place) should reckon with this citation explicitly.

---

## 9. Summary checklist for a persona proposal

Before proposing new onboarding mechanics, check each against:

1. Does it recur or nag, or does it recede permanently on first use/dismissal (R94 contract)? If it recurs, is it gated as tightly as `StudioSetupWhisper` (role + live-state derived, single line, no badge)?
2. Does it ever route through `/doc/[id]` in a way that would start the R4 timer dishonestly (D1)?
3. Does it introduce a shadow, a badge, a red/green status, a tab bar, or a progress bar/percentage outside the Strata Mark idiom (D4/D8/R15/R35)?
4. Does any per-surface copy duplicate what belongs in `registry.tsx`'s `help.blurb` field instead of reading from it (the one-registry discipline)?
5. Is the typography Playfair-italic (teaching voice) + DM-mono (structural/meta), with no new typeface or "friendly" sans-serif register?
6. Does the copy avoid "AI," lead with outcomes not mechanics, avoid the avoid-list lexicon, and stay in the understated Midwest register?
7. Does it touch the Pledge in any surfaced copy? (Must not, until legal clears it — VISION §3.)
8. Run the VISION §8 feature test explicitly: which surface, which studio moment, which stream, which promise — and log the answer.
9. Does it add a new modal tour rather than extending the ambient/registry/margin-note system the discoverability review already argued for over tours? If so, what specific evidence justifies departing from R93/R94's recognition-over-recall position?
10. Does it assume the current onboarding surface is discoverable and complete? It is not — §12 of file 03 and file 04's "discoverability verdict" both document real gaps (FirstSigninTour dead code confusing future readers, no shortcuts legend anywhere including a substantial undocumented Board Room shortcut set, "~142 of ~150" Sanity docs still placeholder, mobile getting no auto-tour at all) that a new proposal should either explicitly scope around or explicitly address.
