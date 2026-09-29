# Doctrine and rulings the production arrival must honour

Recon angle for the "project arrival" production build (`apps/designer-portal`, flag-gated). Read-only. Every claim below carries a `file:line` anchor actually opened, or is marked **not confirmed**.

Sources read: `docs/design/the-document/DECISIONS.md` (11,265 lines; R15:381, R35:1434, R127:10114, R143:10856, R150:11026, R154:11255); `docs/vision/VISION.md` (96 lines); `docs/vision/VISION-DECISIONS.md` (298 lines, V1–V11); `artifacts/designer-portal-motion-2026-09-25/design/concepts.md` (309 lines, §1/§6/§8); Sidequest tickets SQ-333 (ARRIVAL v3 MERGED CONTRACT comment), SQ-330 (UX Briefing spec, 4 parts), SQ-331 (Craft spec, 4 parts), SQ-342 (ticket description + comments); `git log --oneline -5` on `main` (HEAD `7dbd203bc`); the built mockup at `artifacts/designer-portal-motion-2026-09-25/design/cinematic/` (files committed 2026-09-27, matching SQ-342's merge time).

**Highest ruling id in `DECISIONS.md` is R154** (`DECISIONS.md:11255`, "*Entries add: R154 · last id = R154*" at `:11265`). **The next free number is R155.**

---

## (a) Hard constraints for the production arrival

1. **Never "AI."** Copy never says "AI" or "smart"; it is Designer-Taught Intelligence and the engine never announces itself (`VISION.md:66`; SQ-330 pt.1 Voice section, T7 test — cards/hints must contain none of "AI", "smart", "!", "Welcome", "owes", or a countdown number).
2. **Plain declarative voice.** Sentences end in a period; no exclamation marks, no "Welcome back," no pleading, no manufactured urgency on a quiet project. Custody is named neutrally — "Waiting on Edna:" never "Edna owes you" (R150 R2, `DECISIONS.md:11026-11040`, carried into SQ-330's voice rules).
3. **Numerals, weekday names, "Oct 16"-style dates** — SQ-330 pt.1 Voice.
4. **No lure.** No new badge, dot, count, pulse, streak, count-up, or unseen-count used as a hook, anywhere in the arrival (concepts.md §1 Laws, "No lure," `concepts.md:~150`; `VISION.md:73` "Tab / zone / dashboard UI, shadows, red/green status, badges"; V11's ledger test, `VISION-DECISIONS.md`).
5. **The preview rule — nothing is ever exclusive to the card.** Every fact and act on the arrival card must also exist on the resting page; the 10-second hold running out loses no fact (SQ-330 header + T3 test). This is the concrete, testable form of concepts.md §1's "Never absent at rest": an owed act, error, permission explanation, field label, decision-critical amount, or confirmation may never be hidden to make the page quiet.
6. **Ambient motion stays banned; performed motion is now explicitly permitted.** R154 (`DECISIONS.md:11255`) frees the former no-motion rule set (R15/R35/R127's ambient ban) but resolves only R-DM1 — "R-DM2–R-DM7 and the cinematic-arrival rulings R-DM8+ are not about the ambient ban and remain open for Kody" (`DECISIONS.md:11263`). The arrival's own compose/hold/hand-off/assembly sequence is performed motion, caused by page-open and then by her input — consistent with R154 — but R-DM2 (how much may disappear at rest) is the deck's stated central open question (concepts.md §6) and is **not** settled by R154.
7. **The reduced-motion floor is untouched and unconditional.** R154 explicitly carries forward every existing RM fallback (R15's breath disabling, R35's `.breathing`/`.sweeping` fallback, D12's crossfade, `DECISIONS.md:11259`) and the arrival adds its own: RM compose is opacity-only (150ms/line, no scale, no blur), the hold's hairline is absent, the hand-off is skipped ("carriers already at rest"), the assembly fades 0→1 with no draw, and **Skip stays visible under RM** (Craft §7, `R-DM29`/pre-renumber craft-R-DM29, and SQ-330 T11). This satisfies WCAG 2.2.1/2.2.2/2.3.3 independent of R154.
8. **No scale, blur, letter-building, or masks on ordinary revealed text** (concepts.md §1: "Astra declines the memo's .95–.97 scale on revealed text... for 4px travel," "no scale, blur, letter-building or masks on text"). This governs the Nine Moves grammar (Detail rises, Margin opens, etc.) generally. **The cinematic arrival's own headline carrier is a stated, bounded exception**, ruled separately (concepts.md §8 R-DM10, "52→34 scale: A built") and superseded in the actual build by the Craft spec's 56/44/34 "step-down fit" ladder (SQ-331 §1, "56·44·34 on the page's own ×1.3 step... every Document arrives"). The scale exception is scoped to that one carrier, in that one sequence; it does not license scale on any other in-page text.
9. **The mandatory floor stands inside the arrival too.** Desk needs and the day's line (R143, `DECISIONS.md:10856`), the editable household/vitals line, the Room head action, field labels, and complete ⌘K rows are visible at rest in every direction, including through the arrival's hold and after any arrival failure (concepts.md §1 "Mandatory floor").
10. **The studio surface is never optimized for engagement.** `VISION.md:73` ("we will never optimize the studio surface for engagement") and `VISION.md:74` bind The Document and the iOS Studio tab. The arrival must not measure dwell or delight (concepts.md §4: "never measure dwell or delight... No direction earns production approval from a beautiful replay alone"), must carry no telemetry framed as engagement, and any instrumentation added around play/hold/skip must answer a task question, not a stickiness one.
11. **Screen reader: exactly one announcement.** A single `role="status"` polite message at compose end — the card in slot order plus the instruction — and nothing at the hint, nothing at timeout, no second message at handoff, no `role="timer"` (SQ-330 §7, T8).
12. **The input model is fixed by Kody, not by the specs.** Any advancing input (defined precisely in SQ-333's contract O1(c): any keydown except Tab/Shift+Tab and lone modifiers, any pointerdown/touchstart/wheel, scroll keys, a touch swipe) ends the hold; **Escape also advances** (overriding both specs' original "Escape rests" assumption); "Skip arrival" is the only path straight to rest and stays visible in every mode, RM included.
13. **Input never cancels the assembly (Act 3) once started.** A click on an interactive control snaps the arrival to rest synchronously first, then activates that control exactly once (O1(d)).
14. **One arrival per visit, only on an unanchored open.** 30-minute visit boundary (reusing Return Teaching's `VISIT_GAP_MS`); an act-band link from the Desk (e.g. "Review finish") opens straight to the record with **no** arrival, because she was just briefed by the Desk card a second earlier (R-DM21, built as A).
15. **Failure means the ordinary, complete resting page** — never a half-built or blank one. A font-load timeout (O2, 1,500ms budget from `performance.timeOrigin`), a missing CSS sentinel, a hung script, or a blocked font each fall back to the fully-assembled static page (SQ-342 fix comment, "failure means the ordinary page").
16. **No special arrival for a first hand.** concepts.md's own recommendation (R-DM7, A) is "the same still Desk... this motion program must neither expand nor silently disable the existing teaching program" — no animated welcome or tour grafted onto the arrival. **Not confirmed** whether this was checked against Return Teaching's own first-run note in the actual build (see Gaps).
17. **Naming collision to avoid.** `apps/designer-portal/src/components/document/triage-bar.tsx:88` and `open-requests-strip.tsx:242` already gate an unrelated feature — the Match Ceremony / lead-acceptance flow — behind a PostHog flag literally named `arrival-arc` (`DECISIONS.md:3763`, I67). The production arrival's flag **must not** be named `arrival` or `arrival-arc`; those strings are already load-bearing for a different, shipped feature.

---

## (b) R-DM1–38: the complete table

**R-DM1–7 (concepts.md §6 — Kody's open rulings on the amended grammar):**

| # | Question | Recommended | Status |
|---|---|---|---|
| R-DM1 | May R15 allow performed motion, ambient still banned? | B | **Resolved by R154**, which "goes further than any of its three options" (`DECISIONS.md:11263`) |
| R-DM2 | How much secondary info may disappear at rest? | A (Open Edges) for default; compare in mockups first | **Open for Kody** — the deck's stated central question (concepts.md §6) |
| R-DM3 | May section facts join doc identity at 34px, amending R150? | A for Open Edges; B only as an explicit amendment elsewhere | **Open for Kody** |
| R-DM4 | Does deliberate scrolling count as addressing a section? | B for Reading Line only; A for default | **Open for Kody** |
| R-DM5 | When should a revealed explanation recede? | B, then C once pinned/entered | **Open for Kody** |
| R-DM6 | What must RM preserve where the concept depends on scroll-disclosure? | B for Reading Line; A for explicit-control directions | **Open for Kody** |
| R-DM7 | Should a first hand get a different arrival? | A (same still Desk) | **Open for Kody**; recommendation A is consistent with what was built (no distinct first-hand branch found), **not formally confirmed ruled** |

**R-DM8–17 (concepts.md §8 — the original cinematic-arrival proposal, pre-dating the actual build):**

| # | Question | Options | Built |
|---|---|---|---|
| R-DM8 | Performed open: daily vs news-only | A daily / B news-only | Not marked; superseded by Kody's later explicit ruling "every Document gets an arrival... daily" (SQ-333 contract) — effectively **A** |
| R-DM9 | Staging until 560ms | A=B | Moot |
| R-DM10 | 52→34 headline scale | A built / B `?scale=0` toggle | **A built** in the original proposal — but the *shipped* arrival uses the Craft spec's different 56/44/34 ladder (see constraint 8); R-DM10's exact numbers are **superseded**, not carried forward verbatim |
| R-DM11 | Replaces the D12 pick-up? | A=B | Moot; **not confirmed** whether the shipped code formally supersedes D12 (`DECISIONS.md:211`) or the two coexist for different gestures |
| R-DM12 | Reading position | A | Built — carried into SQ-330 §5's landing rule |
| R-DM13 | Work before stage | A=B | Moot; matches SQ-330's Ainsworth note ("the finish record sits on the Direction paper, R-DM13") |
| R-DM14 | Focus: keyboard-only vs doorway verbs | Both built | Built — SQ-330 §5's doorway/terminal focus rule is exactly this |
| R-DM15 | Cadence: daily vs owed item | A daily / B owed item | Both effectively present: daily play + owed-item card content |
| R-DM16 | Reduced motion: line-in-place vs instant | B built | Built — Craft §7's RM table keeps the line in place, not a pure instant snap |
| R-DM17 | Every hand alike | A=B | Moot; consistent with R-DM7 |

**R-DM18–24 (SQ-330, the UX Briefing spec — kept at their own numbers):**

| # | Topic | Recommended | Status |
|---|---|---|---|
| R-DM18 | Act on a quiet/milestone card | A: no act | **Built as A** (Whitfield: "no act, per R-DM18 A") |
| R-DM19 | Data behind "since you were last here" | A: add a per-designer, per-Document last-opened record | **Flagged data gap — not confirmed built as A.** SQ-330 itself: "No per-designer, per-Document last-opened record exists today... this slot is only true once one does." No migration for this appears in any read ticket. The shipped mockup's since-line runs on **fixture JSON**, not real tracking. See Gaps. |
| R-DM20 | A teammate's pen | A: name them ("With Tomás") | Recommended A; effectively re-ruled and fixed via R-DM38 below |
| R-DM21 | Act links from the Desk | A: no arrival on `#record` links | **Built as A** |
| R-DM22 | Timing adjustable (WCAG 2.2.1) | A: focus pauses the timer | **Built as A**, merged with Craft's hold/focus ruling (below) |
| R-DM23 | Desk headline: name vs count | A: name the top job | **Built as A** |
| R-DM24 | Overdue in the headline | A: "Overdue N days:" prefix | **Built as A** |

**R-DM25–36 (SQ-331, the Craft spec — originally numbered R-DM18–29 by its own author; SQ-333's O8 says "renumber to R-DM25–36 for Kody," but the same SQ-333 comment's operational sections (O1–O7) cite several of these **by their original Craft numbers** rather than the renumbered ones — an unresolved drafting inconsistency, flagged rather than silently resolved here):**

| Craft's own # | Topic | Recommended | Status |
|---|---|---|---|
| (craft) R-DM18 | Card type ladder | A: 56/44/34, step-down fit | **Built as A** — cited in O5 as "R-DM18'" (primed, to disambiguate from UX's own R-DM18) |
| (craft) R-DM19 | Phone card alignment | A: flush-left | **Built as A** |
| (craft) R-DM20 | Crown (Strata Mark) | A: shows true stage fill | **Built as A** |
| (craft) R-DM21 | Headline depth cue | A: 3px→0 blur, desktop only | **Built as A** |
| (craft) R-DM22 | Grow origin | A: column's left edge | **Built as A** |
| (craft) R-DM23 | Rules | A: drawn outward from focus point | **Built as A** |
| (craft) R-DM24 | Stagger | A: geometry field, `t = 520 + 1480·u^1.25` | **Built as A** |
| (craft) R-DM25 | Hold and focus | A: focus pauses the timer | **Merged into (final) R-DM22**, not a separate final number |
| (craft) R-DM26 | Frame guard | A: the guard ladder | **Built as A** — cited in O5 as "R-DM26" (unshifted) |
| (craft) R-DM27 | Closing settle | A: state word inks to clay last | **Built as A** |
| (craft) R-DM28 | Desk warning hand-off | A: travels as a carrier | **Built as A** — cited in O4 as "R-DM28" (unshifted) |
| (craft) R-DM29 | Skip under reduced motion | A: visible | **Built as A** — cited in O1(b) as "R-DM29" (unshifted) |

**R-DM37–38 (SQ-342 ticket description — "ORCHESTRATOR RULINGS, built as option A; Kody may overturn them"):**

| # | Topic | Ruling (built as A) |
|---|---|---|
| R-DM37 | Ainsworth's finish approval | Is **Procurement** work ("the workshop waits"). Moved out of Direction into Procurement in `document.html`; Direction returns to plain settled; the eyebrow, crown and landing now agree with `index.html:279`, which already said Procurement. |
| R-DM38 | Okafor-Bright's essentials | Are **Tomás's pen** (matching the Desk ledger, `index.html:220/230`), not Leah's. `document-okafor-bright.html` changed to the teammate form: headline is not "Yours to add…", F3 reads "With Tomás…", act follows the teammate rule (SQ-338 F10: teammate needs stay in bands 0/1; only the F3 wording changes; the Desk's own selection result is unchanged). |

Both are explicitly labeled **"Kody may overturn"** — they are engineering-expedient defaults, not doctrine Kody has personally ruled on.

---

## (c) Draft `DECISIONS.md` entry — next free id **R155**

> ### R155 · Arrival v3 ships behind a flag — the option-A rulings it embodies, the ones it leaves open — 2026-09-27 (DRAFT, not yet ruled)
>
> **What ships.** A cinematic arrival — the owed sentence opens centred, holds for input or 10 seconds, then flies to its resting place while the rest of the Desk or Document assembles around it — replaces the plain page-load for both the Desk and every Document, gated behind **[flag name TBD — not `arrival` or `arrival-arc`, both already load-bearing for the Match Ceremony flow, `triage-bar.tsx:88`]**. R154 (`:11255`) already frees the ambient-motion ban this depends on; this entry is the production ship record, not a new motion ruling.
>
> **The option-A rulings it embodies** (built, per the ARRIVAL v3 MERGED CONTRACT on SQ-333, and per SQ-330/SQ-331's own specs): R-DM18–24 (UX: no act on a quiet card, act-links bypass the arrival, focus pauses the 10s timer, the Desk headline names the top job, "Overdue N days:" prefixing); R-DM18–29-craft, renumbered R-DM25–36 (the 56/44/34 type ladder with step-down fit so every Document gets an arrival, flush-left phone alignment, the Strata Mark crown, the one desktop-only headline blur, the fixed-grid grow origin, drawn-outward rules, the geometry stagger field, the three-stage frame guard, the closing colour settle, the Desk warning traveling as a carrier, Skip staying visible under reduced motion); R-DM37 (Ainsworth's finish approval lives in Procurement) and R-DM38 (Okafor-Bright's essentials are Tomás's pen) — both explicitly marked **"Kody may overturn"** in their source ticket.
>
> **What it leaves open, and what shipping this quietly accepts.** R-DM2 — how much secondary information may disappear at rest — is unruled; the arrival ships with the "preview rule" (every card fact also lives on the resting page) as its de facto answer, without Kody choosing among Open Edges / Plain Lines / Reading Line for the wider Document. R-DM3–R-DM6 (section-fact scale, scroll-as-address, recede timing, the RM/scroll trade-off) are untouched. R-DM7 (first-hand treatment) is assumed-A, unconfirmed. **R-DM19** (the since-line's data source) ships on fixture data only — no per-designer, per-Document last-opened record exists in the schema; production data will make the "Since {anchor}:" line either wrong or absent until this is built or Kody rules for the B (approximate) option. V1–V5 (`VISION-DECISIONS.md`) are untouched and unresolved by this entry.
>
> *Entries add: R155 · last id = R155*

---

## (d) Doctrine the mockup contradicts, or leaves for production to fix

1. **R-DM19's data gap is real, not cosmetic.** The "since you were last here" line is core to the Briefing's premise (SQ-330 §4) but has no schema backing (`SQ-330 comment c_mujy2ncj_b35627`: "No per-designer, per-Document last-opened record exists today"). Shipping against real data without this will either print a wrong anchor or require silently falling back to option B (approximate from margin-rail recency) — a ruling Kody has not made.
2. **concepts.md's own mockup index is now stale on scale.** `concepts.md` §8/§5 documents a 52→34 headline scale (R-DM10); the actually-built Craft spec ships 56/44/34 with step-down fit. Anyone building from `concepts.md` alone (rather than the SQ-331 Craft spec) will implement the wrong numbers.
3. **The preview rule (T3) must be re-verified against real data, not fixture copy.** The mockup's `aria-hidden` card content is safe only because SQ-330's five and six fixtures were hand-checked against fixture resting-page text. Production needs must pass the same test against live `NEED_RULES`/`desk-schedule` data or the "never absent at rest" floor (constraint 9 above) is silently violated the first time a need's phrasing diverges between the card and the page.
4. **Focus during flight is a real hazard the spec names but the production build must re-prove.** O1(d)'s "snap to rest synchronously, then activate exactly once" rule is the only thing standing between a mid-assembly click and a focus/DOM-position mismatch; SQ-342's fix comment lists it as tested in the mockup's oracle (`cinematic-oracle.mjs`), but that oracle runs against static files, not the portal's real component tree — **not confirmed** against React hydration/remounts.
5. **The failure fallback needs re-verification inside the real build pipeline.** The mockup's "failure means the ordinary page" guards (a CSS custom-property sentinel, `document.fonts.check`, a `defer`-loaded script) were built and tested only against static HTML; the designer-portal's actual bundling, font loading (`next/font` or otherwise), and CSP are unverified against this exact failure path.
6. **First-hand teaching overlap is unconfirmed.** R-DM7 (recommended A, "same still Desk," "must neither expand nor silently disable the existing teaching program") references Return Teaching's own first-run note; nothing in the read tickets confirms the arrival and Return Teaching's onboarding flow were checked together for a brand-new teammate's very first Desk load.
7. **Flag-name collision.** `arrival-arc` is a live, shipped PostHog flag for the unrelated Match Ceremony feature (`DECISIONS.md:3763`). The production build must choose a distinct name before wiring the flag.

## Gaps (could not confirm)

- Whether the shipped `arrival.js`/`arrival.css` formally supersedes or coexists with D12's existing "pick up" raise-to-fill gesture (`DECISIONS.md:211`) — R-DM11 called this moot (A=B) but did not specify the mechanism; not read at the code level (out of this angle's remit).
- Whether R-DM7 and the first-hand/Return-Teaching interaction were tested together anywhere.
- Whether R-DM20 (teammate's pen, UX) and R-DM38 (Okafor-Bright fix) are the same ruling restated or two separate passes — the evidence available (ticket text only) does not show whether R-DM20 was implemented once and then had to be fixed via R-DM38, or was never implemented until R-DM38.
- The exact final craft numbering (R-DM25–36) is internally inconsistent inside SQ-333's own contract comment (see the table note in (b)); I have not resolved this and it should not be silently resolved by whoever writes the real R155 — ask the orchestrator which numbering the doctrine record should use.
