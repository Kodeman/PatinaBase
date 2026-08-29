export const meta = {
  name: 'document-lens-w5a-deck',
  description: 'W5a: eight part authors write the fifteen sections of the deck "The Smart Lens" in parallel, one runner builds presentation.html and renders the headless QA sweep, then a fact-checker and a visual-QA seat attack the built page in fresh contexts',
  phases: [
    { title: 'Parts', detail: 'eight authors in parallel — haiku x1 (cover, limits, colophon), sonnet x5 (ask, today, found, mobile+walkthrough, roads), opus x2 (thesis through motion in the merge author\'s voice; the build section)' },
    { title: 'Build', detail: 'one runner concatenates the parts into presentation.html and renders every section at 1440/390 x light/dark, both commands unsandboxed' },
    { title: 'Check', detail: 'fact-check traces every number, F-id and quote to a file on disk; visual QA reads every deck-qa PNG — both fresh contexts, in parallel' },
  ],
}

const REPO = '/Users/kody/Code/patina-merged'
const OUT = REPO + '/artifacts/document-lens-proposal-2026-08-28'
const DECK = OUT + '/mock/deck-parts'

const S5_CANON = "## §5 Canon latitude\n\n```\nCANON LATITUDE (2026-08-28, Kody): the ruling ledger docs/design/the-document/DECISIONS.md\n(last id R126) is CONTEXT, not constraint. Amend freely. Do NOT price amendments and do NOT\npenalise them — a refuter labels what a move amends, for the record only. Four hard no-gos\nstand and are not re-proposable:\n  NG1  D1 — one document at a time. No split view, no tabs, no peek/hold, no persistent\n       global nav over an open doc. Esc / Put down is the exit.\n  NG2  D4 shadow budget — exactly one token, --elevation-sheet: 0 1px 2px rgba(44,41,38,.08),\n       at three sites (margin chip, open ledger sheet, studio drawer). Zero other shadows.\n       Mockups, fragments and deck must show 0 box-shadow beyond that token (computed-style\n       sweep, not source grep).\n  NG3  The Thumb Index — removed by Kody, \"do not re-propose\".\n  NG4  The R126 ratified visual register is the FLOOR — 40px Playfair letterhead, 24px Playfair\n       region heads, five-step scale 40/24/18/15/14, mono 11px floor, three rule weights\n       (--rule-hair 1px 10% / --rule-mid 1.5px #2C2926 / --rule-strong 2px + hairline double),\n       paper #FCFAF6, rail stock #E8E3DB, desk #FAF7F2, charcoal #2C2926, the -ink text\n       companions (clay #7C5E30, terracotta #9C5340, golden-hour #79651E, sage #5F6B57), muted\n       ramp #4E4339/#5A4E43/#65594E, filled stamps (~1.18:1 tint, 1.5px pigment border, charcoal\n       word, -1.5deg), six saturated stage tab plates (--tab-brief #497093 … --tab-install\n       #823832, white label), the ink-pool hover wash (clip-path circle from the pointer, 260ms\n       in / 200ms out, --ease-editorial cubic-bezier(0.22,1,0.36,1), ~1.12:1 over own ground,\n       flat -still tint under reduced motion), 48px product crops on catalog-linked lines.\n       The proposal BUILDS ON this register; it does not restyle it. \"Typography goes no further\n       than the mockup\" (R126). THE STUDIO desk block is untouched.\nKody's taste on record: large tinted surfaces read as \"silly/terrible\"; colour belongs on small\nstate-carrying things; \"the sections and animated highlighting\" were loved; \"don't push the\ntypography further\".\nEverything else — composition, mount order, disclosure, motion, the spine's job, the header's\njob, spacing tokens, what appears when — is open ground.\n```"

const MOCKUP_URL = args && args.mockupUrl ? String(args.mockupUrl) : ''
const MOCKUP_URL_LINE = MOCKUP_URL
  ? `use exactly this URL, handed to you by the orchestrator: ${MOCKUP_URL}`
  : `read it from the "Mockup Artifact" line in ${OUT}/RESUME.md and use it verbatim, character for character. If that line is absent, write the steps with no links, say so plainly in your report-back notes, and never invent a URL.`

const PROGRAM = `You are one agent in "The Document — The Smart Lens" (2026-08-28): a multi-agent design program on the Patina designer portal's document surface, /doc/[id] — one paper per engagement, with its letterhead, its job ticket, its guide sentence, its regions, its left spine and its right margin. Patina connects interior designers with makers of custom furnishings. Nothing in the product is changed by this program; the deliverables are one proposal, one clickable mockup and one deck. Repo ${REPO}. Program folder ${OUT}.

You are in W5 — THE DECK. The deck is titled "The Smart Lens". It is assembled from seventeen files in ${DECK} and built into ${OUT}/presentation.html.

HARD RULES
1. Durable path: write every deliverable to the exact absolute path you are given. The orchestrator reads the FILE. Never write to /tmp or a scratchpad.
2. Forbidden: git add / commit / stash / push; editing anything under ${REPO}/apps, ${REPO}/packages, ${REPO}/supabase or ${REPO}/docs; starting or stopping dev servers. You may write only the files your brief names.
3. Never invent a number, a label, a quote, a file path or a finding id. Everything printed in this deck traces to a file on disk under ${OUT}/research, ${OUT}/source, ${OUT}/probe or ${OUT}/mock. If a figure would help and no file carries it, write "no usage data was available to this review" instead of estimating.
4. Quote labels and copy verbatim — exact case, exact middots, exact punctuation. Never paraphrase a label.
5. Your final message IS the return value. Return ONLY the compact structured summary the schema asks for — never the file contents, never prose around it.`

const CANON = `CANON LATITUDE — instruments.md §5, verbatim. The ruling ledger is CONTEXT, not constraint; amendments are never priced and never penalised. Only NG1-NG4 are closed, and two of them bind this deck's own markup as well as the design it argues: NG2 (zero box-shadow beyond the one token — the build fails on any) and NG4 (the R126 register is the floor, and the deck neither restyles it nor pushes the typography further).

${S5_CANON}`

const AUTHORING = `THE AUTHORING CONTRACT — read ${DECK}/DECK.md IN FULL before you write a character. It is the authority on: the fifteen sections with their exact ids, index titles, eyebrows and registers (§1); the shape of a section and every type and grid class (§2); the two registers .reg-paper and .reg-dark (§3); the FRAGMENT marker syntax and how a mock is pulled in and scaled (§4); the <img data-shot="FILE.png"> and <!-- shot:FILE.png --> syntax and the .lvl level chips (§5); the F-chip and .voice quote shapes (§6); tables inside .dk-tablewrap (§7); voice (§8); the budget and hygiene rules (§9); and the hand-back checklist (§10). Where this brief and DECK.md disagree on a class or a shape, DECK.md wins.

ALSO READ and follow the brand-voice skill at ${REPO}/.claude/skills/patina-brand-voice/SKILL.md. Understatement. No exclamation marks. No emoji anywhere, ever — not as a marker, a glyph or a bullet. Never write "users said", "designers told us", "research shows", or any count of people: every seat in this program is simulated and the deck says so. Never use elevated, curated, luxury, bespoke, seamless, effortless or delight — nor magical, unlock or delightful. If the proposal genuinely does one of those things, say what it does instead, never the adjective.

NON-NEGOTIABLE PART RULES
- One <section> per part file, opened and closed inside your file, nothing outside it, with the exact id, class and data-index-title from DECK.md §1 and the eyebrow in the section's own <p class="hour"><b>...</b></p>.
- No <style>, no <script>, no inline font-size, colour or margin. The two structural exceptions DECK.md allows are a style="width:..." on a table column and the width/height a fragment's own inner div carries. If you need a class that does not exist, say so in your report-back notes rather than inventing one inline. The classes available to you include .dk-wrap .dk-grid .dk-grid--flip .dk-grid--even .dk-prose .dk-stage .dk-full .dk-two .dk-band .dk-h2 .dk-h3 .dk-h4 .dk-lede .dk-p .dk-note .dk-ul .dk-rule .dk-tablewrap .dk-table .dk-table--compare .dk-table--compare3 .dk-num .dk-row-h .dk-strip-grid .ev-grid .ev-fig .ev-fig__shot .ev-fig__cap .ev-fig__meta .lvl .lvl--sim .lvl--code .lvl--inf .f-chips .f-chip .f-chip--s0 .f-chip--s1 .f-chip--s2 .f-chip--s3 .q-card .q-card__n .q-card__q .q-card__why .q-card__meta .voice .voice__q .voice__who .voice__seat .voice__role .hour .plank .dk-screen.
- ZERO box-shadow and ZERO drop-shadow( anywhere in your part. The build hard-fails on either (NG2 / D4).
- 30 000 characters of HTML per part file at most; 5 fragments at most; 8 shots at most. Fragments count against the part that includes them.
- Every F## you print must resolve in ${OUT}/research/31-verified-findings.md and its .json sibling. Read that file and use its real ids with its real titles. Never print an F-id you have not seen there. Tint each chip by the finding's own scroll state: .f-chip--s0 for top, --s1 for seam, --s2 for mid, --s3 for foot.
- Every claim about the live app carries its .lvl chip: sim-verified where a shot in ${OUT}/shots shows it, code-read where a file:line says it (print the path in the caption), inferred where it is reasoned from the two (say from what).
- Fragments are referenced by NAME ONLY, as <!-- FRAGMENT name --> or <!-- FRAGMENT name | col=N -->. Run ls ${OUT}/mock/fragments first. If a fragment your brief names is absent, SKIP it, never invent it, and name it in your report-back notes. Never rescale a mock by hand and never put an <img> inside a fragment.
- Shots are referenced as <img data-shot="FILE.png" alt="..."> or <!-- shot:FILE.png --> only — never a relative src, never a hand-written data URI. Run ls ${OUT}/shots first and consult ${OUT}/research/01-shot-ledger.md, which is authoritative on what each shot shows and which are verified. Skip any shot the ledger marks unverified or absent, and say so in your notes.
- A mock is a proposal and belongs on paper; a screenshot of today's app is evidence and belongs in a .reg-dark band. Never put the two side by side as if they were the same kind of object.
- DO NOT RUN node mock/deck-parts/build.mjs OR node mock/deck-parts/qa-run.cjs. Eight authors are writing in parallel and a concurrent build would race on presentation.html. A separate runner builds after you all return.`

const partOutput = (files) => `OUTPUT RULES
1. Write ${files.length === 1 ? 'exactly this file' : 'exactly these ' + files.length + ' files'} and nothing else: ${files.join(' , ')}.
2. Before handing back, for each file you wrote: run wc -c on it (that number is your chars), grep it for box-shadow and for drop-shadow( (both must return nothing), and grep it for font-size, color: and margin inside a style attribute (must return nothing).
3. Do not run build.mjs and do not run qa-run.cjs.
4. Your final message IS the return value: return ONLY {parts:[{part, chars, fragments_used, f_ids, path} — one entry per file you wrote], notes}. notes is at most 400 characters and names every fragment or shot you had to skip, every class you needed and did not have, and everything you could not source. Never paste the HTML.`

const PART_ROW = { type: 'object', properties: {
  part: { type: 'string', description: 'the file name, e.g. 07-header.html' },
  chars: { type: 'number', description: 'wc -c of the file you wrote' },
  fragments_used: { type: 'array', items: { type: 'string' } },
  f_ids: { type: 'array', items: { type: 'string' } },
  path: { type: 'string', description: 'absolute path' } },
  required: ['part', 'chars', 'fragments_used', 'f_ids', 'path'] }

const PARTS_SCHEMA = { type: 'object', properties: {
  parts: { type: 'array', items: PART_ROW },
  notes: { type: 'string', description: 'max 400 chars' } },
  required: ['parts', 'notes'] }

const JOB_COVER = `YOUR PARTS — three short files, in this order: ${DECK}/01-cover.html, ${DECK}/14-limits.html, ${DECK}/15-colophon.html.

READ FIRST: ${OUT}/research/00-env-and-ids.md (it names the main sha — take that commit verbatim), ${OUT}/RESUME.md (its "Mockup Artifact" line carries the mockup Artifact URL; the deck's own Artifact URL may not be recorded yet), ${OUT}/source/plan.md (its phase table and its wave sections are the agent census), ${OUT}/source/proposal.md (its thesis gives the cover its one line).

1. 01-cover.html — id "cover", class "dk-sec reg-paper", data-index-title "Cover", NO eyebrow. The title "The Smart Lens" as the deck's .dk-h1; one line under it saying what the deck argues, drawn from proposal.md's thesis, in a plain sentence under twenty words; the date 2026-08-28; and the provenance line "main@<sha>" using the sha from 00-env-and-ids.md. Close with a .dk-note carrying the standing disclosure: the seats behind this deck are simulated and there is no usage data behind it. Under 4 000 characters.

2. 14-limits.html — id "limits", eyebrow "LIMITS", data-index-title "Limits", .reg-paper. The heading says what this deck does not claim. Print these six limits, one per row of a .dk-ul or a .dk-table, each a plain sentence: (a) no user research was run — no designer was observed, interviewed or surveyed; (b) every seat in the panel is a simulated seat; (c) the evidence is local dev seed data — the rich document carries 3 FF&E lines and 0 rooms, so any finding that depends on a long schedule is thinner here than it would be on a real sixty-line one; (d) the mockup is a stylesheet and a script over the invented Vandersteen specimen, not the product; (e) the frame-budget figures in the proposal are design targets, not measured outcomes; (f) nothing here is built, and no product code was changed. Under 6 000 characters.

3. 15-colophon.html — id "colophon", eyebrow "COLOPHON", data-index-title "Colophon", .reg-paper. Print: the provenance (main@<sha>, 2026-08-28); the program folder path ${OUT}; the two Artifact URLs from RESUME.md — the mockup's for certain, and if the deck's own URL is not yet recorded there, say plainly that the deck's URL is the page the reader is on rather than inventing one; the sizes — run wc -c on ${OUT}/presentation.html and on ${OUT}/mock/final/index.html and print both figures in bytes, labelling the deck figure "as of the previous build"; and the agent census taken from the phase table and wave sections of ${OUT}/source/plan.md — the waves, and how many agent seats each ran. Under 8 000 characters.`

const JOB_ASK = `YOUR PART: ${DECK}/02-ask.html — id "ask", eyebrow "THE ASK", data-index-title "The ask", .reg-paper.

READ FIRST: ${OUT}/source/plan.md, ${OUT}/RESUME.md, ${OUT}/source/proposal.md, ${OUT}/source/brief.md.

1. THE ASK, VERBATIM. Open the section with Kody's ask printed BYTE-IDENTICAL to the sentence beginning "Ask (verbatim in every brief):" inside the Context paragraph of ${OUT}/source/plan.md. Copy it out of that file with a tool; do not retype it from memory, do not correct its punctuation, do not shorten it, do not paraphrase it, do not drop or add a dash or a comma. Set it as a blockquote — DECK.md gives you the .voice shape and the .dk-lede shape; pick one. A later fact-check diffs your text against that file character by character. After it, in your own words, name the four things the ask says are failing today: the spine, the header, the sections, the margin.
2. What this deck is: a proposal, not a build. Say the program's shape in three or four sentences — the evidence pass, the ten-seat panel, the refuters, two rival proposals judged and merged into one, the mockup, this deck. Every count comes from ${OUT}/source/plan.md; invent no seat counts.
3. The two Artifacts: this deck, and the clickable mockup that goes with it. Print the mockup's Artifact URL from the "Mockup Artifact" line in ${OUT}/RESUME.md as a real <a href="...">link</a>. If that line is absent, print no link, and say so in your report-back notes rather than printing a wrong one.
4. The standing disclosure DECK.md §6 requires: what kind of evidence backs this deck and what does not — simulated seats, local seed data, no usage data.`

const JOB_TODAY = `YOUR PART: ${DECK}/03-today.html — id "today", eyebrow "TODAY", data-index-title "The portal today", class "dk-sec reg-dark". THIS SECTION IS EVIDENCE AND IT IS IN THE DARKROOM. Shots of the live app belong here; no mock of the proposal belongs here.

READ FIRST: ${OUT}/research/12-layout-measurements.md and its .json sibling for exact values, ${OUT}/probe/03-interactive-probe.md, ${OUT}/research/10-code-anatomy.md, ${OUT}/research/01-shot-ledger.md, ${OUT}/research/31-verified-findings.md.

Build it in this order:
1. THE FOUR-STATE SCROLL STRIP AT 1440 — a .dk-strip-grid of four .ev-fig figures carrying the shots w1440-rich-s0.png, w1440-rich-s1.png, w1440-rich-s2.png and w1440-rich-s3.png, each captioned with its state (s0 top, s1 seam, s2 mid, s3 foot) and with what is actually on screen at that offset, labels quoted verbatim.
2. The same story at the other two widths: w1280-rich-s0.png and w1280-rich-s1.png, then m390-rich-s0.png and m390-rich-s1.png. Say what the 1180-1439 tier does to the rail and to the margin, and what 390 does.
3. Optionally, at most two fragments — today-s0-1440 and today-s1-1440 — as today's paper redrawn from the kit. Use them only if ls ${OUT}/mock/fragments shows them; they are optional, and for evidence a shot beats a redrawn fragment.
4. THE MEASUREMENT TABLES, from 12-layout-measurements.md, each inside a .dk-tablewrap, values exact and unrounded: (a) the header stack before the first region head, in px and as a percentage of the viewport, per width and per scroll state; (b) spine ink as a percentage of the rail (inkPx over railHeightPx) with the longest empty run; (c) the set of distinct inter-region gaps — the file gives {6, 29, 56} — printed as a set, with the site each gap comes from; (d) margin chip density: width, mode and chip count per width; (e) the frame budget at s1.
5. THE PROBE FACTS, from ${OUT}/probe/03-interactive-probe.md, in the probe's own numbers: the 283px hard jump at scrollY 280 when the ticket pins; that the fold drops focus to body; and the CLS the probe measured over its scripted scroll, in both motion registers.
Every claim carries its .lvl chip, and where a verified finding covers it, its F-chip.`

const JOB_FOUND = `YOUR PART: ${DECK}/04-found.html — id "found", eyebrow "FINDINGS", data-index-title "What we found", class "dk-sec reg-dark".

READ FIRST: ${OUT}/research/31-verified-findings.md and its .json sibling (the survivors, with seats, severity, width, scroll_state, why_it_blocks and frame_cost_estimate), ${OUT}/research/30-collated-findings.md (for its FRAME BUDGET table), ${OUT}/research/25-panel-p1.md, ${OUT}/research/27-panel-p3.md, ${OUT}/research/29-panel-e1.md.

1. THE TOP 12 TO 15 SURVIVING FINDINGS as one .dk-table inside a .dk-tablewrap: F-id, severity, scroll_state, and one line naming the defect. Keep 31-verified-findings.md's own order — by number of seats descending, then severity descending — and its own ids and titles. Never renumber and never invent. Give each row's F-id its scroll-state chip class.
2. THE FRAME-BUDGET MEANS PER SCROLL STATE, from the FRAME BUDGET table in 30-collated-findings.md: for top, seam, mid and foot, the mean fraction of the frame that was carrying the task, with the count of walk lines behind each mean. Print it as a .dk-table with .dk-num cells. These are the panel's estimates from simulated walks — say so in the caption; they are not measurements.
3. FOUR TO SIX VERBATIM QUOTES from the panel reports as .voice blockquotes: at least one from P1 (25-panel-p1.md), one from P3 (27-panel-p3.md) and one from E1 (29-panel-e1.md). Quote each sentence exactly as written in the report. Every .voice carries a .voice__role naming the seat as a simulated seat, per DECK.md §6.`

const JOB_MERGE = `YOUR PARTS — five files, and they are the centre of the deck. You write them in one sitting, in ONE VOICE: THE MERGE AUTHOR'S. The single proposal at ${OUT}/source/proposal.md is yours — you made these calls. Write as the author of the argument, not as a summarist of someone else's document.

Files: ${DECK}/05-thesis.html, ${DECK}/06-spine.html, ${DECK}/07-header.html, ${DECK}/08-body.html, ${DECK}/09-motion.html.

READ FIRST, in full: ${OUT}/source/proposal.md (the merged proposal; its eleven sections are the source of every mechanism and every number you print), ${OUT}/source/shared-planks.md, ${OUT}/source/judge-practitioner.md, ${OUT}/source/judge-feasibility.md, ${OUT}/research/31-verified-findings.md, ${OUT}/research/12-layout-measurements.md, ${OUT}/research/10-code-anatomy.md, ${OUT}/mock/final/FINAL.md and ${OUT}/mock/final/REVIEW-2.md (what the mockup actually does and what the prober found), ${OUT}/research/01-shot-ledger.md.

05-thesis.html — id "thesis", eyebrow "THESIS", data-index-title "The thesis", .reg-paper. The document as a smart lens: what that means mechanically, not metaphorically. Print the four lens laws in proposal.md's own words for them — do not rename them — as four .q-card blocks or a four-row table, each with the sentence that makes it falsifiable. Carry proposal.md's one falsifiable sentence verbatim and set it off. Then "what it is not": at least four things a reader will expect that this proposal deliberately does not do, taken from proposal.md's Refuses section, each with the reason it was refused rather than deferred.

06-spine.html — id "spine", eyebrow "SPINE", data-index-title "The document spine", .reg-paper. What the rail is today and what it becomes. State the second-look test — "something earns the left edge only if it is true across the whole document at once, or true outside this document" — say which of today's tenants it rules out, and say what the rail shows instead: position, extent, exception, distance. Pull both fragments, side by side in a .dk-two or a .dk-strip-grid, today labelled today and after labelled proposed: <!-- FRAGMENT spine-before-360 | col=360 --> and <!-- FRAGMENT spine-after-360 | col=360 -->. Give the numbers: today's ink percentage from 12-layout-measurements.md, and what the proposal targets. Answer the pre-work spreads, where the running index prints nothing today.

07-header.html — id "header", eyebrow "HEADER", data-index-title "The letterhead/header", .reg-paper. The header holds the right information and eats the frame. Print the header stack in mount order with the px each organ costs — 10-code-anatomy.md and 12-layout-measurements.md carry both — then the lens line that replaces the two-state fold. Pull <!-- FRAGMENT header-before-720 | col=720 --> and <!-- FRAGMENT header-after-720 | col=720 -->, then the full-width pair <!-- FRAGMENT today-s1-1440 --> against <!-- FRAGMENT lens-s1-1440 -->: today's seam and the lens's seam at the same offset. Say exactly what the seam still prints at its shortest, and name every --doc-seam-height consumer that has to change, from 10-code-anatomy.md.

08-body.html — id "body", eyebrow "BODY", data-index-title "The document body", .reg-paper. Sections, spacing and the margin. The one region-spacing token that replaces the per-site set {6, 29, 56}; folded-by-choice against condensed-by-position, and how a still screenshot tells them apart; the line of at most forty characters each region must be able to say when condensed; and what the 232px margin gets. Pull <!-- FRAGMENT lens-s2-1440 -->. Use .dk-table--compare3 where three columns — today, proposed, what it costs — genuinely earn it.

09-motion.html — id "motion", eyebrow "MOTION", data-index-title "Motion and state", .reg-paper. Print the FULL mechanics table from section 3 of proposal.md — every row, every column, INCLUDING THE REDUCED-MOTION COLUMN: trigger, what changes, from-to, duration and easing, reduced-motion equivalent, what never moves, F-ids. No cell may be empty and no row may be dropped. Every value matches proposal.md verbatim: no rounding, no "about". Put it in a .dk-tablewrap. Then pull <!-- FRAGMENT motion-grammar-1080 | col=1080 --> and <!-- FRAGMENT reduced-1440 -->, and in the prose state the hysteresis numbers and the mechanism that delivers zero layout shift.

Voice: this is the argument, so it argues. Understatement, no exclamation marks, no adjective doing a mechanism's work. Where a mock reads more calmly, credit the mechanism by name — never a vague improvement.
Budget: each of the five files under 30 000 characters on its own.`

const JOB_MOBILE = `YOUR PARTS: ${DECK}/10-mobile.html and ${DECK}/11-walkthrough.html.

READ FIRST: ${OUT}/source/proposal.md (its 390 section and its lens state machine), ${OUT}/research/12-layout-measurements.md, ${OUT}/research/01-shot-ledger.md, ${OUT}/mock/final/FINAL.md, ${OUT}/mock/final/SPEC.md, ${OUT}/RESUME.md.

10-mobile.html — id "mobile", eyebrow "MOBILE", data-index-title "Mobile", .reg-paper. The 1280 tier and the 390 form. At 1280: what the lens does with the 56px glyph rail and the margin sheet — the shots w1280-spine-glyph-rail.png and w1280-margin-sheet-open.png are evidence for what it is today. At 390: the same lens in one column — pull <!-- FRAGMENT lens-390 | col=390 --> on paper, and set today's shot <img data-shot="m390-rich-s1.png"> inside a .dk-band.reg-dark under the prose that names it. The mock is a proposal and stays on paper; the shot is evidence and stays in the dark. Say which desktop tasks are reachable at 390 and name the target sizes.

11-walkthrough.html — id "walkthrough", eyebrow "WALKTHROUGH", data-index-title "Walkthrough", .reg-paper. A NUMBERED WALK of the four states — s0 at rest, s1 the seam, s2 a region in focus, s3 the foot — and EACH STEP IS A REAL LINK into the clickable mockup, written as <a href="THE_URL">the words</a>. THE URL: ${MOCKUP_URL_LINE}
Per state: what the designer is doing, what the lens does, what she can see at that offset that she cannot see there today, and WHAT TO CLICK IN THE DEV BAR to land on it. The dev bar's buttons are named in ${OUT}/mock/final/FINAL.md and ${OUT}/mock/final/SPEC.md — quote their labels verbatim and never invent a button. Pull <!-- FRAGMENT lens-s0-1440 -->, <!-- FRAGMENT lens-s1-1440 --> and <!-- FRAGMENT lens-s2-1440 --> beside the steps they belong to. Close on one line telling the reader the mockup is a stylesheet and a script over invented data, not the product.`

const JOB_BUILD = `YOUR PART: ${DECK}/12-build.html — id "build", eyebrow "BUILD", data-index-title "What it takes to build", .reg-paper. Its heading answers the ask's own last clause: how the team will accomplish this.

READ FIRST, in full: section 9 of ${OUT}/source/proposal.md (the engineering path and its waves), ${OUT}/research/29-panel-e1.md (the engineering feasibility seat — its cost bands, its three riskiest things, its file:line citations), ${OUT}/source/critique-feasibility.md (where the feasibility critic said the proposal was wrong), ${OUT}/research/10-code-anatomy.md (the test blast radius and every --doc-seam-height consumer).

1. THE WAVES, as a table or one block each. Per wave: its name and what it delivers on its own; the FILES BY REAL PATH it touches; the mechanism in one sentence; the TESTS TO REWRITE OR DELETE by real path; the gate that must be green; and the rollback.
2. Answer explicitly, each in its own short block, what becomes of: (a) use-region-fold's three voices; (b) the ticket seam and every --doc-seam-height consumer; (c) the running-index observer's -20% 0px -62% 0px band and its 700ms jump lock. Name the 1500-character regex in lib/document/__tests__/stage2-approval-cutover-contract.test.ts:19 and say what happens to it. Name the two gates that stay green: lib/document/__tests__/shadow-gate.test.ts and contrast.test.ts.
3. THE THREE NAMED RISKS from proposal.md's Risks section, cross-checked against 29-panel-e1.md's own ranking. Each with the file it lands in, its cost band in E1's bands (days, week, weeks), and THE FALSIFYING OBSERVATION — the thing the team would see in the first week of building that proves the risk real.
4. THE CROSS-CHECK, and it is the point of this part: wherever proposal.md's engineering path and 29-panel-e1.md or critique-feasibility.md disagree — on a cost band, a mechanism, or which tests break — say so in the deck, in one line, naming both sides. A build section that hides the engineering seat's doubt is worse than no build section at all.

EVERY PATH MUST EXIST. Before you write a repo path into the deck, run ls on it from ${REPO}. If ls fails the path is wrong: find the real one with a search, or drop the claim. Report in your notes every path you had to correct or drop. Real file:line references carry the .lvl--code chip with the path printed in the caption.`

const JOB_ROADS = `YOUR PART: ${DECK}/13-roads.html — id "roads", eyebrow "ROADS", data-index-title "Roads not taken", .reg-paper.

READ FIRST: ${OUT}/source/roads-not-taken.md, which is your whole source; and, for the provenance of each objection, ${OUT}/source/critique-design.md, ${OUT}/source/critique-feasibility.md, ${OUT}/source/critique-practitioner.md, ${OUT}/source/critique-access.md, ${OUT}/source/judge-practitioner.md, ${OUT}/source/judge-feasibility.md.

One block per road — a .q-card each, or one row each in a .dk-table, whichever suits roads-not-taken.md's own shape. Per road: what it was; why it was attractive; and THE KILLING OBJECTION, QUOTED VERBATIM WITH ITS SOURCE — the sentence that ended it, in quotation marks, attributed to the file and the seat that wrote it (a critic, a judge, or the engineering seat). An unattributed objection is not a road: if roads-not-taken.md gives no source for one, find the sentence in the critique or judge file and cite that, or say in your report-back notes that you could not source it and leave that road out.
Close on one line naming the two hard no-gos this program did not re-open — NG1, one document at a time, and NG3, the Thumb Index — because a reader will ask.`

const PART_JOBS = [
  { label: 'part:01+14+15 cover, limits, colophon', model: 'haiku', effort: 'low', brief: JOB_COVER,
    files: [DECK + '/01-cover.html', DECK + '/14-limits.html', DECK + '/15-colophon.html'] },
  { label: 'part:02 the ask', model: 'sonnet', effort: 'medium', brief: JOB_ASK,
    files: [DECK + '/02-ask.html'] },
  { label: 'part:03 the portal today', model: 'sonnet', effort: 'high', brief: JOB_TODAY,
    files: [DECK + '/03-today.html'] },
  { label: 'part:04 what we found', model: 'sonnet', effort: 'high', brief: JOB_FOUND,
    files: [DECK + '/04-found.html'] },
  { label: 'part:05-09 thesis, spine, header, body, motion (merge author)', model: 'opus', effort: 'high', brief: JOB_MERGE,
    files: [DECK + '/05-thesis.html', DECK + '/06-spine.html', DECK + '/07-header.html', DECK + '/08-body.html', DECK + '/09-motion.html'] },
  { label: 'part:10+11 mobile and walkthrough', model: 'sonnet', effort: 'medium', brief: JOB_MOBILE,
    files: [DECK + '/10-mobile.html', DECK + '/11-walkthrough.html'] },
  { label: 'part:12 what it takes to build', model: 'opus', effort: 'high', brief: JOB_BUILD,
    files: [DECK + '/12-build.html'] },
  { label: 'part:13 roads not taken', model: 'sonnet', effort: 'medium', brief: JOB_ROADS,
    files: [DECK + '/13-roads.html'] },
]

const partPrompt = (j) => `${PROGRAM}

${AUTHORING}

${CANON}

${j.brief}

${partOutput(j.files)}`

phase('Parts')
const authored = (await parallel(PART_JOBS.map(j => () =>
  agent(partPrompt(j), { label: j.label, phase: 'Parts', model: j.model, effort: j.effort, schema: PARTS_SCHEMA })
    .then(r => r ? { job: j.label, expected: j.files.length, ...r } : null)
))).filter(Boolean)

const partRows = authored.flatMap(a => a.parts || [])
const missingJobs = PART_JOBS.map(j => j.label).filter(l => !authored.some(a => a.job === l))
log(`Parts: ${authored.length}/8 authors returned, ${partRows.length} files written; missing authors: ${missingJobs.join(' | ') || 'none'}`)
if (partRows.length) {
  log(`Files: ${partRows.map(p => p.part + ' ' + p.chars + 'c').join(' · ')}`)
}
const overBudget = partRows.filter(p => p.chars > 30000).map(p => p.part)
if (overBudget.length) log(`OVER 30k CHARS: ${overBudget.join(', ')}`)

const QA_SCHEMA = { type: 'object', properties: {
  externalRequests: { type: 'number' },
  pageErrors: { type: 'number' },
  consoleErrors: { type: 'number' },
  overflow: { type: 'number' },
  mocksFit: { type: 'boolean' },
  fontsLoaded: { type: 'boolean' },
  indexRows: { type: 'number' },
  contrastFails: { type: 'number' },
  boxShadowSweep: { type: 'number' } },
  required: ['externalRequests', 'pageErrors', 'consoleErrors', 'overflow', 'mocksFit', 'fontsLoaded', 'indexRows', 'contrastFails', 'boxShadowSweep'] }

const BUILD_SCHEMA = { type: 'object', properties: {
  build_exit: { type: 'number' },
  parts: { type: 'number' },
  fragments: { type: 'number' },
  shots: { type: 'number' },
  box_shadow: { type: 'number' },
  non_ascii: { type: 'number' },
  size_mb: { type: 'number' },
  qa: QA_SCHEMA,
  summary: { type: 'string', description: 'max 400 chars: the first real problem, or the word clean' } },
  required: ['build_exit', 'parts', 'fragments', 'shots', 'box_shadow', 'non_ascii', 'size_mb', 'qa', 'summary'] }

const RUNNER = `${PROGRAM}

${CANON}

YOUR ROLE: BUILD RUNNER. The eight part authors have written their files into ${DECK}. Build the deck and render the QA sweep. You do not author and you do not fix.

1. Run these two commands, EACH AS ITS OWN Bash call, with dangerouslyDisableSandbox: true on both — build.mjs shells out to sips, which writes a scratch file into the system temp directory, and qa-run.cjs launches headless Chromium, which cannot claim its mach port inside the sandbox:
     cd ${OUT} && node mock/deck-parts/build.mjs
     cd ${OUT} && node mock/deck-parts/qa-run.cjs
   Capture each command's full stdout. If build.mjs exits non-zero: DO NOT edit any part file, DO NOT run qa-run.cjs, report build_exit with the failing line in summary, report every other number as -1, and go straight to step 4. A fixer wave owns repairs; you own the truth about what happened.
2. Parse build.mjs's summary block for: PARTS (parts concatenated) into parts; FRAGMENTS (inlined) into fragments; SHOTS (embedded) into shots; the box-shadow / drop-shadow gate result into box_shadow (the count it reports, 0 when the gate passed); the ASCII line's non-ascii bytes left into non_ascii; and the SIZE line, in MB, into size_mb.
3. Read ${OUT}/mock/deck-qa/qa-results.json and aggregate ACROSS EVERY entry in its "passes" object — there is one per viewport and theme (1440-light, 1440-dark, 390-light, 390-dark and any others present):
     externalRequests = the length of the top-level externalRequests array
     pageErrors       = the length of the top-level pageErrors array
     consoleErrors    = the length of the top-level consoleErrors array
     overflow         = the total number of overflowers summed across every pass
     mocksFit         = true only if, in every pass, no mock has fitsParent false and no mock has pastViewport true
     fontsLoaded      = true only if, in every pass, fontsStatus is loaded and the fonts array is non-empty
     indexRows        = the index.rows figure, reported as the MINIMUM across passes; it should equal index.sectionsWithTitle, and there are fifteen sections
     contrastFails    = the total number of contrast samples whose ratio is below 4.5, summed across every pass
     boxShadowSweep   = the total number of entries in "shadowed", summed across every pass
   Report the raw numbers you actually read. Never round and never estimate. If a field is genuinely absent from the JSON, report -1 for it and name it in summary.
4. Append to ${OUT}/research/00-env-and-ids.md a section headed exactly:
     ## Commands run unsandboxed (deck)
   listing verbatim every command you ran with the sandbox off, its exit code, and one line saying what it did and why it needed the sandbox off. If that heading is already in the file, append your entries beneath it rather than adding a second copy.
5. Your final message IS the return value: return ONLY {build_exit, parts, fragments, shots, box_shadow, non_ascii, size_mb, qa:{externalRequests, pageErrors, consoleErrors, overflow, mocksFit, fontsLoaded, indexRows, contrastFails, boxShadowSweep}, summary}. summary is at most 400 characters and names the first real problem, or the single word clean. Never paste the build log.`

phase('Build')
const build = await agent(RUNNER, { label: 'build + qa runner (unsandboxed)', phase: 'Build', model: 'sonnet', effort: 'low', schema: BUILD_SCHEMA })
if (!build) {
  log('Build runner died — no build result')
  return { gate: 'FAIL', reason: 'build runner returned nothing', parts: partRows, build: null, factcheck: null, visualqa: null }
}
log(`Build: exit ${build.build_exit} · ${build.parts} parts · ${build.fragments} fragments · ${build.shots} shots · ${build.size_mb} MB · box-shadow ${build.box_shadow} · non-ascii ${build.non_ascii}`)
log(`QA: ext ${build.qa.externalRequests} · pageErr ${build.qa.pageErrors} · consoleErr ${build.qa.consoleErrors} · overflow ${build.qa.overflow} · mocksFit ${build.qa.mocksFit} · fonts ${build.qa.fontsLoaded} · idxRows ${build.qa.indexRows} · contrast ${build.qa.contrastFails} · shadow ${build.qa.boxShadowSweep}`)

const FACTCHECK_SCHEMA = { type: 'object', properties: {
  rows: { type: 'number', description: 'how many claims you checked' },
  unsourced: { type: 'array', items: { type: 'string', description: 'max 160 chars, "<section>: <claim>"' } },
  brand_hits: { type: 'array', items: { type: 'string', description: 'max 160 chars, "<section>: <word>"' } } },
  required: ['rows', 'unsourced', 'brand_hits'] }

const VISUALQA_SCHEMA = { type: 'object', properties: {
  blocking: { type: 'array', items: { type: 'object', properties: {
    section: { type: 'string' }, view: { type: 'string', description: 'e.g. 1440-dark' },
    issue: { type: 'string', description: 'max 160 chars' } },
    required: ['section', 'view', 'issue'] } },
  should: { type: 'number' },
  note: { type: 'number' },
  pngs_read: { type: 'number' } },
  required: ['blocking', 'should', 'note', 'pngs_read'] }

const FACTCHECK = `${PROGRAM}

${CANON}

YOUR ROLE: DECK FACT-CHECK. Fresh context — you wrote none of this, and your job is to fail it.

THE ARTEFACT: ${OUT}/presentation.html, the built deck, fifteen sections. Read it. Where the built page is hard to read, read the part files under ${DECK}/ instead.

FOR EVERY number, ratio, px value, percentage, file:line, F-id, quoted sentence and factual claim printed in the deck, trace it to a file on disk under ${OUT}/research, ${OUT}/source, ${OUT}/probe or ${OUT}/mock/final. One row per claim: the section id, the claim as printed, the source file and where in it, and the verdict — "sourced" (the file says exactly this), "drifted" (the file says something near it; print both), or "UNSOURCED" (no file on disk says it).
- Measurements trace to ${OUT}/research/12-layout-measurements.md and .json. Probe facts trace to ${OUT}/probe/03-interactive-probe.md. Code claims trace to ${OUT}/research/10-code-anatomy.md, and where the deck prints a repo file:line, RUN ls ON EVERY SUCH PATH under ${REPO} and flag every one that does not exist. Findings trace to ${OUT}/research/31-verified-findings.md and .json. Mechanics values trace to ${OUT}/source/proposal.md VERBATIM — no rounding, no "about". Quotes trace to the panel report they are attributed to, character for character. Mockup behaviour traces to ${OUT}/mock/final/FINAL.md and ${OUT}/mock/final/REVIEW-2.md.
- EVERY F## printed anywhere in the deck must resolve in ${OUT}/research/31-verified-findings.md, and must carry the title that file gives it. An F-id that does not resolve, or resolves to a different finding, is UNSOURCED.
- THE ASK: the ask printed in section "ask" must be BYTE-IDENTICAL to the sentence beginning "Ask (verbatim in every brief):" in the Context paragraph of ${OUT}/source/plan.md. Extract both to files and run diff on them. Report any difference at all — a comma, a dash, a capital, a space.
- BRAND GREP over presentation.html: grep -oiE 'elevated|curated|luxury|bespoke|seamless|effortless|delight[a-z]*|magical|unlock' and, separately, look for exclamation marks, emoji, "users said", "designers told us", "research shows" and any count of people. Report every hit with the section it is in.
- INVENTED PRECISION: flag any figure presented as measured that its source marks as an estimate, a design target, or "added for this program"; and any panel-walk frame budget printed without the caveat that it is a simulated estimate.

WRITE the full result to ${OUT}/research/60-deck-factcheck.md: (1) the counts; (2) the full claim table; (3) UNSOURCED, one block each, with what it would take to source it; (4) the ask diff, verbatim, even when empty; (5) the brand hits; (6) repo paths printed in the deck that do not exist.

Report EVERY finding. Do not filter by perceived importance — the orchestrator filters. Recall beats precision.

Your final message IS the return value: return ONLY {rows, unsourced, brand_hits}, where rows is the number of claims you checked, unsourced is one short string per unsourced claim and brand_hits one per hit. Never paste the table.`

const VISUALQA = `${PROGRAM}

${CANON}

YOUR ROLE: DECK VISUAL QA. Fresh context — you wrote none of this. You LOOK at the deck rather than reading it.

1. Run ls ${OUT}/mock/deck-qa/. The QA runner rendered every one of the fifteen sections at 1440 and at 390, in light and in dark, as <section-id>-<viewport>-<theme>.png, plus as-read viewport shots. READ EVERY PNG IN THAT DIRECTORY with the Read tool — every single one. A section you did not open is a section you did not check, and you must say so rather than passing it. Report how many you opened.
2. Also read ${OUT}/mock/deck-qa/qa-results.json for what the machine already measured — overflowers, mocks that do not fit their parent or run past the viewport, low-contrast samples, index rows — so your eyes go to what it cannot see.
3. Classify EVERY defect as exactly one of:
   BLOCKING — the deck cannot be published like this: text clipped or overlapping; a mock cut off or blown past its column; unreadable contrast; a broken or missing image; a table running out of its box; a section rendering empty; a heading covered by the sticky index bar; or the wrong register (a proposal mock in the darkroom, or a live-app screenshot on paper).
   SHOULD — it reads badly but it is legible: cramped spacing, an orphaned line, a figure far from its caption, a strip breaking unevenly at 390, an inconsistent eyebrow.
   NOTE — a smaller thing worth one line.
4. Check both themes deliberately: a colour that fails only in dark is still a failure. Check 390 deliberately: a wide table must scroll inside its own box and nothing may escape the frame.

WRITE ${OUT}/research/61-deck-visualqa.md: (1) counts by class; (2) one row per defect — section, view (e.g. 1440-dark), class, what you see, and what would fix it; (3) the list of PNGs you opened, and any you could not.

Report EVERY defect with its class. Do not filter by perceived importance — the orchestrator filters.

Your final message IS the return value: return ONLY {blocking:[{section, view, issue}], should, note, pngs_read} — issue at most 160 characters; should and note are counts. Never paste the report.`

phase('Check')
const [factcheck, visualqa] = await parallel([
  () => agent(FACTCHECK, { label: 'deck fact-check', phase: 'Check', model: 'sonnet', effort: 'high', schema: FACTCHECK_SCHEMA }),
  () => agent(VISUALQA, { label: 'deck visual QA', phase: 'Check', model: 'sonnet', effort: 'medium', schema: VISUALQA_SCHEMA }),
])

const qa = build.qa
const qaClean = build.build_exit === 0 &&
  qa.externalRequests === 0 && qa.pageErrors === 0 && qa.consoleErrors === 0 &&
  qa.overflow === 0 && qa.contrastFails === 0 && qa.boxShadowSweep === 0 &&
  qa.mocksFit === true && qa.fontsLoaded === true && qa.indexRows === 15
const gate = qaClean ? 'pass' : 'FAIL'

const blockingCount = visualqa && visualqa.blocking ? visualqa.blocking.length : -1
const unsourcedCount = factcheck && factcheck.unsourced ? factcheck.unsourced.length : -1
const brandCount = factcheck && factcheck.brand_hits ? factcheck.brand_hits.length : -1
log(`Fact-check: ${factcheck ? factcheck.rows : 'null'} claims · ${unsourcedCount} UNSOURCED · ${brandCount} brand hits`)
log(`Visual QA: ${visualqa ? visualqa.pngs_read : 'null'} PNGs read · ${blockingCount} Blocking · ${visualqa ? visualqa.should : '-'} Should · ${visualqa ? visualqa.note : '-'} Note`)
log(`GATE ${gate} — ${blockingCount} Blocking, ${unsourcedCount} UNSOURCED for the fix wave`)

return {
  gate,
  parts: partRows.map(p => ({ part: p.part, chars: p.chars, fragments: p.fragments_used, f_ids: p.f_ids.length, path: p.path })),
  build,
  factcheck: factcheck
    ? { report: OUT + '/research/60-deck-factcheck.md', rows: factcheck.rows, unsourced: factcheck.unsourced, brand_hits: factcheck.brand_hits }
    : null,
  visualqa: visualqa
    ? { report: OUT + '/research/61-deck-visualqa.md', pngs_read: visualqa.pngs_read, blocking: visualqa.blocking, should: visualqa.should, note: visualqa.note }
    : null,
}
