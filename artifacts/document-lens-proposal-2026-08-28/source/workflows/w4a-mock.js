export const meta = {
  name: 'document-lens-w4a-mock',
  description: 'W4a: extend the kit with the .lens-* namespace, build the one-file scroll-driven clickable mockup from SPEC.md and the ratified proposal, shoot every dev-bar state, simulate the Artifact host, and probe it from a second seat against the eighteen C.8 items',
  phases: [
    { title: 'Kit', detail: 'M0 writes mock/lens.css and updates mock/final/tokens.css and mock/KIT.md from proposal §3/§4 and SPEC C.4' },
    { title: 'Build', detail: 'MB builds mock/final/index.html and mock/final/FINAL.md against every C.* section of SPEC.md' },
    { title: 'Shoot', detail: 'shooter runs shoot-final.mjs over every dev-bar state and scroll jump; host-sim reproduces the Artifact host insertion-after-load' },
    { title: 'Probe', detail: 'MR, a different seat from the builder, writes and runs review-clickthrough.mjs over the eighteen C.8 items into REVIEW.md' },
  ],
}

const REPO = '/Users/kody/Code/patina-merged'
const OUT = REPO + '/artifacts/document-lens-proposal-2026-08-28'
const LIFE = REPO + '/artifacts/document-life-directions-2026-08-28/mock/final'
const DP_MODULES = REPO + '/apps/designer-portal/node_modules'

const ASK = "> \"We are getting close to a design that feels right on the document. The spine on the left is still cluttered and could be better utilized to navigate the ins and outs of the document. The main header contains great info but takes up most of the screen height when opened up, each section is crammed into the next and the margin seems cramped for the space needed for the functionality it contains. Have a team of UI and UX designers sit down with the Patina engineering and interior design teams. Work with them to design the document so that it contains the needed information and actions, while feeling uncluttered and peaceful. Explore animations, content that appears when it needs to and lends to space when it isn't needed in frame. Think of the document as a smart lens that is always adjusting focus on what is needed as the designers move through the document. Present your strongest proposal to achieve this in an html document accompanied with a high fidelity mockup showcasing how the team will accomplish this challenging User experience and UI requirements.\""

const S5_CANON = "## §5 Canon latitude\n\n```\nCANON LATITUDE (2026-08-28, Kody): the ruling ledger docs/design/the-document/DECISIONS.md\n(last id R126) is CONTEXT, not constraint. Amend freely. Do NOT price amendments and do NOT\npenalise them — a refuter labels what a move amends, for the record only. Four hard no-gos\nstand and are not re-proposable:\n  NG1  D1 — one document at a time. No split view, no tabs, no peek/hold, no persistent\n       global nav over an open doc. Esc / Put down is the exit.\n  NG2  D4 shadow budget — exactly one token, --elevation-sheet: 0 1px 2px rgba(44,41,38,.08),\n       at three sites (margin chip, open ledger sheet, studio drawer). Zero other shadows.\n       Mockups, fragments and deck must show 0 box-shadow beyond that token (computed-style\n       sweep, not source grep).\n  NG3  The Thumb Index — removed by Kody, \"do not re-propose\".\n  NG4  The R126 ratified visual register is the FLOOR — 40px Playfair letterhead, 24px Playfair\n       region heads, five-step scale 40/24/18/15/14, mono 11px floor, three rule weights\n       (--rule-hair 1px 10% / --rule-mid 1.5px #2C2926 / --rule-strong 2px + hairline double),\n       paper #FCFAF6, rail stock #E8E3DB, desk #FAF7F2, charcoal #2C2926, the -ink text\n       companions (clay #7C5E30, terracotta #9C5340, golden-hour #79651E, sage #5F6B57), muted\n       ramp #4E4339/#5A4E43/#65594E, filled stamps (~1.18:1 tint, 1.5px pigment border, charcoal\n       word, -1.5deg), six saturated stage tab plates (--tab-brief #497093 … --tab-install\n       #823832, white label), the ink-pool hover wash (clip-path circle from the pointer, 260ms\n       in / 200ms out, --ease-editorial cubic-bezier(0.22,1,0.36,1), ~1.12:1 over own ground,\n       flat -still tint under reduced motion), 48px product crops on catalog-linked lines.\n       The proposal BUILDS ON this register; it does not restyle it. \"Typography goes no further\n       than the mockup\" (R126). THE STUDIO desk block is untouched.\nKody's taste on record: large tinted surfaces read as \"silly/terrible\"; colour belongs on small\nstate-carrying things; \"the sections and animated highlighting\" were loved; \"don't push the\ntypography further\".\nEverything else — composition, mount order, disclosure, motion, the spine's job, the header's\njob, spacing tokens, what appears when — is open ground.\n```"

const PROGRAM = `You are one agent in "The Document — The Smart Lens" (2026-08-28): a multi-agent design program on the Patina designer portal's document surface, /doc/[id] — one paper per engagement, with its letterhead, its job ticket, its guide sentence, its regions, its left spine and its right margin. Patina connects interior designers with makers of custom furnishings. Nothing in the product is changed by this program; the deliverables are a proposal, a clickable mockup and a deck. Repo ${REPO}.

You are in W4 — THE MOCKUP. The proposal is ratified and on disk. Your job is to make it run.

THE ASK (Kody, 2026-08-28) — verbatim, quoted in every brief:
${ASK}

HARD RULES
1. Durable paths: write every deliverable to the exact absolute path you are given under ${OUT}/ (mkdir -p as needed). The orchestrator reads the FILES. Never write to /tmp or a scratchpad.
2. Forbidden: git add / commit / stash / push; editing anything under apps/, packages/, supabase/, docs/; starting or stopping dev servers. You MAY write files under ${OUT}/ only. The one exception is the node_modules symlink described below, which is a symlink and is never committed.
3. Report EVERY finding, deviation and failure with severity AND confidence where the schema asks for them. Do not filter by perceived importance — the orchestrator filters. Recall beats precision here.
4. Quote what is on screen and what is in the spec verbatim. Never paraphrase a label, a token value or a spec clause.
5. Your final message IS the return value. Return ONLY the compact structured summary the schema asks for — never the full report, never prose around it. The full work goes to your paths on disk.`

const SANDBOX = `SANDBOX AND PLAYWRIGHT

- Every command that launches Playwright or Chromium, and every 'sips' call, must be run with dangerouslyDisableSandbox: true on the Bash tool — headless Chromium cannot claim a mach port inside the sandbox. Use that flag for THOSE COMMANDS ONLY; every other command stays sandboxed.
- Log each such command VERBATIM by appending a section headed "## Commands run unsandboxed (<your role>)" to ${OUT}/research/00-env-and-ids.md — one bullet per command with the command, and one clause saying why the sandbox had to be off. Append; never rewrite that file.
- Playwright scripts under ${OUT}/mock/final/ resolve '@playwright/test' through a node_modules symlink. Before running anything, check for ${OUT}/mock/final/node_modules and create it if absent:
    ln -s ${DP_MODULES} ${OUT}/mock/final/node_modules
  It is a symlink into the designer-portal workspace. Never commit it, never copy it, never delete the target.`

const INPUTS = `INPUTS ON DISK (absolute; read the ones your brief names, in full, before you write anything)

- ${OUT}/mock/final/SPEC.md — THE architecture spec for the mockup. Every C.* section is binding.
- ${OUT}/source/proposal.md — THE ratified proposal (W3b). §3 is the lens mechanics table; §4 is organ by organ; §5 is the lens state machine; §6 is the frame budget.
- ${OUT}/source/shared-planks.md — the planks both directions agreed on.
- ${OUT}/source/specimen.md — the Vandersteen residence data. It appears in the mockup VERBATIM: every name, date, dollar figure and count.
- ${OUT}/source/brief.md §A.3 — SC1 through SC13, the success criteria the probe prints.
- ${OUT}/mock/kit.css and ${OUT}/mock/KIT.md — the drawing kit and its manual.
- ${OUT}/mock/final/tokens.css — the Life Review's :root block, the R126 register.
- ${OUT}/mock/lens.css — the .lens-* namespace for this program's mechanics.
- ${OUT}/mock/assets/fonts/fonts-data-uri.css — Playfair variable, Playfair italic variable, Inter variable, DM Mono 300/400/500, already base64.
- ${OUT}/mock/img/*.jpg — the catalog crops.
- ${OUT}/research/12-layout-measurements.md and .json — today's measured numbers, the ones the mockup must beat.
- ${OUT}/research/01-shot-ledger.md and ${OUT}/shots/*.png — today's document, captured.
- The life chassis at ${LIFE}/ — index.html (read its <script> for the module pattern), FINAL.md (§4 is the motion vocabulary), shoot-final.mjs, host-sim.mjs, review-clickthrough.mjs.`

const CANON_BLOCK = `CANON LATITUDE — instruments.md §5, verbatim. The ruling ledger is CONTEXT, not constraint. Do not price amendments and do not penalise them. Only NG1-NG4 are closed, and NG2 and NG4 are the two this wave can break by accident.

${S5_CANON}`

const brief = (body) => `${PROGRAM}

${body}

${INPUTS}

${SANDBOX}

${CANON_BLOCK}`

const KIT_SCHEMA = { type: 'object', properties: {
  classes: { type: 'array', items: { type: 'string' }, description: 'every .lens-* class written, by selector' },
  tokens_added: { type: 'array', items: { type: 'string' }, description: 'every custom property added, name only' },
  contrast_ok: { type: 'boolean', description: 'true only if contrast-check.mjs exited 0' },
  notes: { type: 'string', description: 'max 400 chars: the shadow-line count, any /* contrast: ignore */ added and on which token, anything the proposal asked for that the register could not express' },
}, required: ['classes', 'tokens_added', 'contrast_ok', 'notes'] }

const BUILD_SCHEMA = { type: 'object', properties: {
  bytes: { type: 'number', description: 'wc -c of mock/final/index.html' },
  non_ascii: { type: 'number', description: 'LC_ALL=C grep -c of non-ASCII lines; must be 0' },
  mechanism: { type: 'string', description: 'max 200 chars: the scroll mechanism chosen and the one-clause reason' },
  deviations: { type: 'array', items: { type: 'object', properties: {
    spec_section: { type: 'string', description: 'the C.* id' },
    what: { type: 'string', description: 'max 160 chars' },
    reason: { type: 'string', description: 'max 200 chars' } },
    required: ['spec_section', 'what', 'reason'] } },
  path: { type: 'string' },
}, required: ['bytes', 'non_ascii', 'mechanism', 'deviations', 'path'] }

const SHOOT_SCHEMA = { type: 'object', properties: {
  ok: { type: 'boolean' },
  shots: { type: 'number', description: 'PNGs written to mock/final/shots/' },
  external: { type: 'number', description: 'external requests over the whole load; must be 0' },
  page_errors: { type: 'number', description: 'console errors plus unhandled rejections; must be 0' },
  bytes: { type: 'number', description: 'file size of index.html as the shooter measured it' },
  shadow_classes: { type: 'array', items: { type: 'string' }, description: 'every distinct class whose computed box-shadow is not none; expect exactly the three --elevation-sheet sites' },
  shadow_value: { type: 'string', description: 'the computed value observed, verbatim' },
  notes: { type: 'string', description: 'max 400 chars: which states shot, anything that would not reach' },
}, required: ['ok', 'shots', 'external', 'page_errors', 'bytes', 'shadow_classes', 'shadow_value', 'notes'] }

const HOSTSIM_SCHEMA = { type: 'object', properties: {
  ok: { type: 'boolean' },
  static_paint: { type: 'boolean', description: 'the rest state painted from markup plus CSS BEFORE any script re-executed' },
  mock_ready: { type: 'boolean', description: 'window.__mockReady === true after the scripts were re-executed' },
  errors: { type: 'number', description: 'console errors plus page errors; must be 0' },
  external: { type: 'number', description: 'external requests; must be 0' },
  notes: { type: 'string', description: 'max 300 chars' },
}, required: ['ok', 'static_paint', 'mock_ready', 'errors', 'external', 'notes'] }

const PROBE_SCHEMA = { type: 'object', properties: {
  pass: { type: 'number' }, fail: { type: 'number' },
  blocking: { type: 'number', description: 'findings at severity blocker' },
  findings: { type: 'array', items: { type: 'object', properties: {
    id: { type: 'string', description: 'R-01 upward' },
    severity: { type: 'string', enum: ['blocker', 'high', 'medium', 'low'] },
    confidence: { type: 'number' },
    title: { type: 'string', description: 'max 80 chars' } },
    required: ['id', 'severity', 'confidence', 'title'] } },
  sc: { type: 'object', properties: {
    SC1: { type: 'string' }, SC2: { type: 'string' }, SC3: { type: 'string' },
    SC4: { type: 'string' }, SC11: { type: 'string' }, SC12: { type: 'string' } },
    required: ['SC1', 'SC2', 'SC3', 'SC4', 'SC11', 'SC12'],
    description: 'the observed number or map for each, as a short string' },
  report_path: { type: 'string' },
}, required: ['pass', 'fail', 'blocking', 'findings', 'sc', 'report_path'] }

phase('Kit')

const kit = await agent(brief(`YOUR SEAT: M0 — KIT EXTENSION. You write the CSS vocabulary the builder draws with. You do not build the mockup and you do not touch mock/final/index.html.

READ FIRST, in full: ${OUT}/source/proposal.md §3 (the lens mechanics table) and §4 (organ by organ); ${OUT}/mock/final/SPEC.md C.4; ${OUT}/mock/kit.css; ${OUT}/mock/KIT.md; ${OUT}/mock/final/tokens.css.

WRITE ${OUT}/mock/lens.css — the .lens-* namespace. It already exists as a three-line header stub; keep the header, extend it, do not start over.

1. One class per mechanic the proposal's §3 table names, in the .lens-* namespace:
   - the condensation states (the lens line open and closed, and the transition between them);
   - the three density states, .lens-density-full, .lens-density-reading, .lens-density-condensed, matching SPEC C.5's data-density values;
   - the seam / lens line itself;
   - the navigator and the reading line in the rail.
   Name every class after the mechanic it serves, and put the §3 row's 'from->to' values into the declaration so the CSS and the table cannot drift.
2. EVERY animated class gets its reduced-motion sibling UNDER ONE SHARED SELECTOR LIST. Write the reduced form once, in one rule block, whose selector list is reached both by @media (prefers-reduced-motion: reduce) and by the [data-motion="reduced"] attribute the dev bar sets. Never two rulesets that can drift apart — SPEC C.6 makes the diff between them a probe blocker.
3. Every duration in this file is written calc(<base> * var(--motion-scale, 1)). A hard-coded duration cannot be watched at 4x and cannot be shown to settle.
4. Add to lens.css the R126 tokens the kit lacks:
   --doc-rail-stock: #E8E3DB;
   --elevation-sheet: 0 1px 2px rgba(44,41,38,.08);
   .doc-elevated { box-shadow: var(--elevation-sheet) }
   That .doc-elevated rule is the ONE allowed shadow declaration in this file. Keep it on a single line, and note it in the file header in a comment saying it is the only one and why (NG2, D4, three sites: margin chip, open ledger sheet, studio drawer).
5. Add ONLY these new custom properties, and nothing else: --lens-h-open, --lens-h-closed, --doc-region-gap, and --density-ink-full, --density-ink-reading, --density-ink-condensed. Every new COLOUR carries its computed contrast ratio against paper #FCFAF6 in a trailing CSS comment, e.g.
   --density-ink-condensed: #65594E; /* 5.31:1 on --doc-paper #FCFAF6 */
   A comment without a number is a defect. A property beyond these six needs a line in KIT.md saying why the register did not already have it — and prefer not needing one.
6. Update ${OUT}/mock/final/tokens.css: the Life Review :root block stays VERBATIM (it is the R126 register and a retyped value is a silent NG4 break). Append only the four new families above, in their own clearly headed block, each colour carrying its ratio comment.
7. Update ${OUT}/mock/KIT.md: one new section documenting every .lens-* class — selector, what it is for, its from->to, its reduced-motion form, and the §3 row it implements.

THE GATE YOU RUN, and the numbers you report:
  cd ${OUT} && grep -cE 'box-shadow|drop-shadow' mock/lens.css        -> must print exactly 1 (the .doc-elevated line, and nothing else; the count is line-based, so keep that declaration on one line)
  cd ${OUT} && node research/contrast-check.mjs mock/lens.css mock/kit.css ; echo "exit=$?"   -> must exit 0
If the checker's token regex does not classify the --density-ink-* family as text tokens and therefore misses them, do NOT loosen the checker and do NOT restyle a colour to dodge it: add a trailing /* contrast: ignore */ ONLY to a non-text token, say in your return notes exactly which token you marked and why it is not text, and report that the family went unchecked so the prober can pick it up.

Deliver exactly this. No unrequested classes, no restyle of the register, no refactor of kit.css.

Your final message IS the return value: return ONLY {classes, tokens_added, contrast_ok, notes}.`),
  { label: 'M0 kit-extend (lens.css, tokens.css, KIT.md)', phase: 'Kit', model: 'sonnet', effort: 'medium', schema: KIT_SCHEMA })

if (!kit) {
  log('M0 died — the builder has no .lens-* vocabulary to draw with; stopping')
  return { gate: 'FAIL', reason: 'kit-extend returned nothing', kit: null, build: null, shoot: null, hostsim: null, probe: null }
}
log(`Kit: ${kit.classes.length} lens classes, ${kit.tokens_added.length} tokens, contrast_ok=${kit.contrast_ok}`)

phase('Build')

const build = await agent(brief(`YOUR SEAT: MB — THE BUILDER. You build the clickable mockup. It is not a picture of the proposal; it is the proposal running.

SOURCE OF TRUTH: ${OUT}/source/proposal.md and ${OUT}/mock/final/SPEC.md. Read both in full before you write a line. EVERY C.* section of SPEC.md is binding — C.1 shape, C.2 the scroll departure, C.3 data, C.4 tokens, C.5 the root state contract, C.6 the dev bar, C.7 the script, C.8 the probe list you must be built to survive, C.9 the fragments cut from you later, C.10 the checklist you sign off.

DELIVER TWO FILES: ${OUT}/mock/final/index.html and ${OUT}/mock/final/FINAL.md.

SHAPE (C.1)
- One file. No build step, no bundler, no <link>, no import map. It opens from disk.
- Pure ASCII. Ellipses are three dots, arrows are ->, dashes are - or --, and every non-ASCII glyph the design wants is an HTML entity or a CSS content escape.
- Fonts as data URIs, copied VERBATIM from ${OUT}/mock/assets/fonts/fonts-data-uri.css. Do not re-encode and do not add a face.
- ONE product crop inlined as a data URI from ${OUT}/mock/img/ — the 48px catalog thumb on a catalog-linked FF&E line, because NG4 keeps 48px crops on those lines and one has to be real. Everything else is drawn in CSS.
- Zero external requests: no https:// in any src, href, url(), @import, fetch or srcset.
- Under 2 MB target, 16 MB hard cap. If it approaches 2 MB, say what happened in FINAL.md.
- Static-first: markup plus CSS alone paint the REST STATE correctly with JavaScript disabled or failed. The whole script body sits inside try { } catch { } so one host-side surprise cannot leave a blank stage.

THE SCROLL DEPARTURE (C.2) — the critical one
- Three frames on one stage, all in the DOM at once, laid down the page: #frame-1440 at 1440x900 (rail | paper | margin), #frame-1280 at 1280x800 (glyph rail | paper, margin as a sheet), #frame-390 at 390x844 (one column, mobile bar).
- Each frame is overflow-y: auto with the paper inside it. Scrolling the frame IS scrolling the document. This is the interaction the whole proposal rests on; the Life Review switched screens with a dev bar and this one does not.
- EVERY IntersectionObserver is rooted at its frame: new IntersectionObserver(cb, { root: frameEl, rootMargin: '...', threshold: [...] }). One observer set per frame, built by one factory with the frame passed in. A root: null observer inside a scaled overflow container reports viewport geometry that has nothing to do with what the reader sees, and the density map, the reading index and the lens line would all be wrong in ways that look plausible in a screenshot.
- fit() scales DOWN ONLY: s = Math.min(1, (available - gutter) / nativeWidth), transform: scale(s), wrapper height set to nativeHeight * s so the scaled frame leaves no hole. Runs on load and on resize, for all three frames. Never above 1, so a shoot at 1560 gets 1:1 pixels.

DATA (C.3)
- The Vandersteen residence, VERBATIM from ${OUT}/source/specimen.md. Every number, name, date and dollar figure is the specimen's. No invented client, no lorem, no rounded-off money.
- The paper is long enough to scroll several screens at 1440. Blocks in mount order: letterhead (household, 40px Playfair title, stage plate, 11px mono vitals, the Phases fold, the in-hand timer row 0:47) · the lens line / header organ as proposal §4 composes it, one element with an open and a closed height · client approvals, the two overdue red-letter exceptions with owners · schedule, install Tuesday 2026-09-15 three weeks out and the dates rule · Pieces / FF&E with ALL FOUR ROOMS and AT LEAST 16 REAL LINES total (Living room 14, Dining room 8, Primary bedroom 9, Mudroom 5, with the states the specimen gives each) · Money with the nine figures verbatim · Care · The Record at the foot with the settled bars above it and no unfold hint on them · colophon. Plus the margin at 1440 and the rail as the proposal designs them.
- Where the specimen does not name a thing the design needs, invent it in the specimen's register — Wisconsin and Illinois places, real-sounding makers, plain Midwest nouns — and list every invention in FINAL.md under "What the mock does not claim".

TOKENS (C.4)
- ${OUT}/mock/final/tokens.css is the R126 register and goes in VERBATIM, plus only the four lens families M0 added (--lens-h-open, --lens-h-closed, --doc-region-gap, --density-ink-*). Nothing else. Draw with ${OUT}/mock/lens.css and ${OUT}/mock/kit.css; do not restyle either.
- box-shadow appears ONLY as .doc-elevated { box-shadow: var(--elevation-sheet) } at the three sites: margin chip, open ledger sheet, studio drawer. drop-shadow nowhere. This is checked by computed style, not source grep.

THE ROOT STATE CONTRACT (C.5) — published always, including at rest
- data-lens-state on each frame root: rest | reading | editing | condensed | mobile
- data-region on each region root: approvals | schedule | ffe | money | care | record, plus any the proposal adds
- data-density on each region root: full | reading | condensed
- data-reading-index on the rail root: the data-region of the region currently at full; NEVER null while the paper is in view (SC12)
- data-lens-open on the lens line: true | false; and --lens-height on it as a custom property carrying its current reserved height in px, so the probe samples SC3 without measuring
- data-motion on the stage root: normal | slow | reduced
- Exactly ONE region per frame at data-density="full" at any moment (SC11). If the proposal's state machine allows zero between regions or at the foot, say so explicitly in FINAL.md so the prober checks for that case by name instead.

THE DEV BAR (C.6) — chrome around the stage, never inside a frame, never in a fragment
Seven buttons carrying data-go and a live aria-pressed, one delegated listener: Rest (every frame to 0, lens open) · Condensed (#frame-1440 scrolled to 400, reached the way a designer reaches it) · Region in focus (#frame-1440 scrolled so FF&E is full) · 1280 (stage scrolls to #frame-1280) · 390 (stage scrolls to #frame-390) · Reduced motion (data-motion="reduced" on the stage root) · Slow motion 4x (data-motion="slow", which sets --motion-scale: 4).
- Reduced motion uses THE SAME SELECTOR LIST as the media query — one rule block reached by @media (prefers-reduced-motion: reduce) and by [data-motion="reduced"]. The prober diffs the media-query result against the toggle result and any difference is a blocker.
- EVERY duration is written calc(<base> * var(--motion-scale, 1)). A hard-coded duration cannot be slowed and a mechanic that cannot be watched at 4x cannot be shown to settle.
- Every state is reversible: Rest from any state returns to the rest state with nothing left over.

THE SCRIPT (C.7) — one IIFE inside try { } catch { }, in this module order, delegated listeners only (one click, one keydown, one pointermove on document; never a listener per row)
1. fit() — scale-down-only sizing for all three frames, on load and on resize.
2. lens(frame) — the lens line for one frame. A SENTINEL above the sticky element drives open/closed, never a scroll handler reading scrollTop, and the sentinel's height RESERVES the open height so the transition costs zero layout shift. Publishes data-lens-open and --lens-height.
3. focus(frame) — the density engine. TWO IntersectionObserver bands implementing hysteresis: one band promotes a region to full, a different and narrower band demotes it. Guarantees exactly one full per frame. Exposes settle(), a synchronous function forcing the settled state for the frame's current scroll position, so probes never wait on a velocity gate.
4. spine(frame) — the rail. SUBSCRIBES to focus; it does NOT construct a second observer, because two observers with two bands is how the reading index and the density map come to disagree. Owns the 700ms jump lock: after a rail target is clicked the index holds the clicked region and ignores observer callbacks until the smooth scroll settles.
5. motion() — reads prefers-reduced-motion, wires data-motion, owns --motion-scale.
6. devbar() — delegated, aria-pressed maintained on every button on every state change.
7. ink() — stamps ink ONCE on the state change that first brings them into view and never again (R16/R31). A stamp inside a closed disclosure waits for its opening. ink() only ever adds the inked class; nothing removes it.
8. pointAt() — writes --ink-x / --ink-y on pointermove for the ink-pool wash, on the act and on the row under it. One listener on document.
9. sheet() — the ledger overlay: a dialog with a focus trap, Escape to close, focus returned to the opener, and a defined landing element that is the sheet's first ACT, not whatever is first in DOM order.
10. window.__mockReady = true at the end of a successful init, and window.__lensSettled() returning a promise that resolves once every frame's density engine has settled — the deterministic hook the shooter and the prober wait on instead of sleeping.
HOST GUARD, do not skip: the Artifact host inserts this file into a live page's body AFTER load, so a naive DOMContentLoaded listener never runs and the page publishes dead. Init is a named function with a readyState guard:
  function __mockInit() { try { /* everything above */ } catch (e) { /* rest state stays painted */ } }
  if (document.readyState !== 'loading') { __mockInit(); } else { document.addEventListener('DOMContentLoaded', __mockInit); }

REGISTER
Draw in the R126 register EXACTLY — 40px Playfair letterhead, 24px Playfair region heads, the 40/24/18/15/14 scale, 11px mono floor, the three rule weights, paper #FCFAF6, rail stock #E8E3DB, charcoal #2C2926, the -ink companions, the muted ramp, the filled stamps, the six stage tab plates, the ink-pool hover wash at 260ms in / 200ms out on --ease-editorial with its flat -still tint under reduced motion, 48px crops on catalog-linked lines. Colour only on small state-carrying things; no large tinted surface. Read ${LIFE}/index.html's <script> for the module pattern this house already uses, and ${LIFE}/FINAL.md §4 for the motion vocabulary — speak that vocabulary; do not invent a second one.

BUILT TO PASS
SC1 through SC13 in ${OUT}/source/brief.md §A.3 are design targets you build to hit, and C.8's eighteen items are what a different seat will run against you tomorrow. Read both lists before you compose, and note in FINAL.md any target you believe is wrong, with the better target and the reason. No hover-only affordance anywhere — that is an automatic return.

FINAL.md MUST CONTAIN
- The scroll mechanism you chose and WHY, in its own section — sticky plus sentinel, scroll-driven animation timeline, observer-driven class swap, or whatever you chose — with what you rejected and the failure mode you were avoiding.
- Every SPEC deviation, one row each: the C.* section, what you did instead, and the reason. A deviation is legitimate; a silent one is not.
- "What the mock does not claim" — every invention beyond the specimen.
- The C.10 checklist, signed off item by item.
- The three prints below, pasted verbatim from your terminal.

THE PRINTS YOU RUN AND PASTE
  cd ${OUT}/mock/final && wc -c index.html
  cd ${OUT}/mock/final && LC_ALL=C grep -c '[^ -~\\t]' index.html      -> must be 0
  cd ${OUT}/mock/final && grep -c 'box-shadow' index.html

Deliver exactly this. Name the exact gate. No generic verify padding.

Your final message IS the return value: return ONLY {bytes, non_ascii, mechanism, deviations, path}.`),
  { label: 'MB builder (index.html + FINAL.md)', phase: 'Build', model: 'opus', effort: 'high', schema: BUILD_SCHEMA })

if (!build) {
  log('MB died — no mockup to shoot or probe; stopping')
  return { gate: 'FAIL', reason: 'builder returned nothing', kit, build: null, shoot: null, hostsim: null, probe: null }
}
log(`Build: ${build.bytes} bytes, non_ascii=${build.non_ascii}, ${build.deviations.length} SPEC deviations, mechanism: ${build.mechanism}`)

phase('Shoot')

const SHOOTER_PROMPT = brief(`YOUR SEAT: SHOOTER. The mockup is built at ${OUT}/mock/final/index.html. You capture it and you count what the gates count. You do NOT edit index.html — if something is wrong, you report it; the builder fixes it in the next wave.

ADAPT AND RUN ${OUT}/mock/final/shoot-final.mjs. It already exists, ported from the Life Review; extend it for this mockup's three frames and seven dev-bar states. Shots land in ${OUT}/mock/final/shots/.

Viewport 1560x1060 at deviceScaleFactor 2 — that holds the 1440x900 frame plus the dev bar at scale 1, so every shot is 1:1 with the drawn pixels.

WAIT DETERMINISTICALLY, in this order, before every capture: await document.fonts.ready; waitForFunction window.__mockReady === true; await window.__lensSettled(); then 700ms for the settle stagger and the stamp wipe. Never sleep instead of waiting on those hooks.

SHOOT EVERY DEV-BAR STATE AND EVERY SCROLL JUMP, one PNG each, named for the state: rest · condensed (#frame-1440 at scroll 400) · region-in-focus (FF&E at full) · foot (#frame-1440 scrolled to its end) · 1280 · 390 · reduced (data-motion="reduced") · slow-mid-transition (data-motion="slow" with --motion-scale 4, captured mid-transition so the mechanic is visible standing still).

PRINT, and return as numbers:
1. EXTERNAL REQUESTS over the whole load — count every request whose URL does not start with file://, data: or about:. Must be 0; list any that appear.
2. COMPUTED box-shadow CENSUS: walk every element, read getComputedStyle(el).boxShadow, and group the ones that are not 'none' BY CLASS. Expect exactly the three --elevation-sheet sites — margin chip, open ledger sheet, studio drawer — all reporting the same value. Print the class list, the count per class and the value verbatim. A fourth class is a blocker. Count filter: drop-shadow separately; it must be 0.
3. PAGE ERRORS — console errors plus unhandled rejections, both. Must be 0; print each.
4. FILE SIZE of index.html in bytes.

Deliver exactly this. Do not fix the mockup, do not rewrite the register, do not add shots beyond the eight states.

Your final message IS the return value: return ONLY {ok, shots, external, page_errors, bytes, shadow_classes, shadow_value, notes}. ok is true only when external is 0 AND page_errors is 0 AND every state shot.`)

const HOSTSIM_PROMPT = brief(`YOUR SEAT: HOST-SIM. You answer one question: does the mockup survive the Claude Artifact host, which inserts the file into a live page's body AFTER load so DOMContentLoaded has already fired?

RUN ${OUT}/mock/final/host-sim.mjs. It already exists, ported from the Life Review: a blank page, loaded; then the file's content inserted with insertAdjacentHTML; then its <script> texts RE-EXECUTED as fresh script elements with the same text, because innerHTML-inserted script text never runs on its own. Adapt it only as far as this mockup's structure requires.

REPORT, in this order:
1. STATIC PAINT BEFORE ANY SCRIPT — after the HTML is inserted and BEFORE you re-execute the script texts, is the rest state painted correctly from markup plus CSS alone? Screenshot it to ${OUT}/mock/final/shots/hostsim-static.png and say what is and is not there. This is SPEC C.1's static-first requirement and it is the thing that saves the Artifact if init throws.
2. window.__mockReady AFTER the scripts are re-executed. True or false.
3. CONSOLE AND PAGE ERRORS — every one, verbatim. Must be 0.
4. EXTERNAL REQUESTS — must be 0.

Do not edit index.html. If it fails, report the failure and the exact error; the builder fixes it in the next wave.

Your final message IS the return value: return ONLY {ok, static_paint, mock_ready, errors, external, notes}. ok is true only when static_paint AND mock_ready are true AND errors and external are both 0.`)

const [shoot, hostsim] = await parallel([
  () => agent(SHOOTER_PROMPT, { label: 'shooter (shoot-final.mjs, 8 states)', phase: 'Shoot', model: 'sonnet', effort: 'medium', schema: SHOOT_SCHEMA }),
  () => agent(HOSTSIM_PROMPT, { label: 'host-sim (insertion after load)', phase: 'Shoot', model: 'sonnet', effort: 'low', schema: HOSTSIM_SCHEMA }),
])
log(`Shoot: ok=${shoot ? shoot.ok : 'null'} external=${shoot ? shoot.external : '-'} errors=${shoot ? shoot.page_errors : '-'} shadow classes=${shoot ? shoot.shadow_classes.join(', ') : '-'}`)
log(`Host-sim: ok=${hostsim ? hostsim.ok : 'null'} static=${hostsim ? hostsim.static_paint : '-'} ready=${hostsim ? hostsim.mock_ready : '-'} errors=${hostsim ? hostsim.errors : '-'}`)

phase('Probe')

const probe = await agent(brief(`YOUR SEAT: MR — THE PROBER. You are a DIFFERENT SEAT from the builder. You did not build this mockup, you do not agree with it in advance, and YOU MUST NOT EDIT ${OUT}/mock/final/index.html or any file the builder owns. Your product is evidence and findings; the builder fixes.

WRITE AND RUN ${OUT}/mock/final/review-clickthrough.mjs. Port it from the Life Review's ${LIFE}/review-clickthrough.mjs — reuse its WCAG helpers rather than rewriting them, and keep its structure so a reader who knows that file can read this one.

COVER THE EIGHTEEN ITEMS OF SPEC.md C.8. Read C.8 in full first; this list is the same eighteen, restated so you cannot lose one:
1. External requests = 0 — a network census over the whole load.
2. Page errors = 0 — console errors AND unhandled rejections.
3. window.__mockReady is true under file:// AND under host-sim.mjs.
4. Computed box-shadow census = exactly the three --elevation-sheet sites, value 'rgba(44, 41, 38, 0.08) 0px 1px 2px 0px', every other element 'none'. Computed style, not source grep. filter: drop-shadow counted separately, must be 0.
5. Non-ASCII = 0, LC_ALL=C.
6. Every dev-bar state reachable AND reversible — enter each, assert its contract, press Rest, assert the rest state is equivalent in every C.5 attribute.
7. Condensation reaches steady state — a 20-step slow scroll through each density threshold at --motion-scale 4; assert no region's data-density changes more than once per step direction. No oscillation at any boundary.
8. CLS = 0 over a scripted 0-to-foot scroll at 1440, via PerformanceObserver on layout-shift, in the normal register AND the reduced register.
9. Nothing moves under the pointer — park the pointer on an FF&E line, scroll one threshold, assert the element at those coordinates is the same element.
10. Reduced-motion parity — diff the VISIBLE TEXT of every frame animated vs reduced at each dev-bar state; any word present in only one register FAILS. Plus 0 elements reporting a non-zero animation or transition duration 1s after entering any state, checked via the MEDIA QUERY and via the DEV-BAR TOGGLE, separately.
11. Keyboard order survives condensation — tab through at 1440 at scroll 0, 400 and 1200; assert DOM order preserved and NO focused element obscured by the pinned lens line (WCAG 2.4.11).
12. Nothing escapes the frame at 390 — scrollWidth <= clientWidth on #frame-390 and on every descendant that could overflow.
13. Composite contrast >= 4.5:1 per lens state, sampling actual RENDERED colours including density-reduced text.
14. The navigator lands where it says — click each rail target in turn; assert the named region head is at the top of the frame under the lens line, and data-reading-index matches the clicked region after the 700ms jump lock.
15. 1280 shows the margin as a SHEET — not a column, not missing; opened and closed, with focus behaviour.
16. SC1-SC4 and SC11-SC12 numbers PRINTED at scroll 0, 400 and 1200: first region head y, condensed band height, --lens-height, rail utilisation, the density map, the reading index.
17. Fonts loaded — all three families report loaded via document.fonts.check, and no fallback face is rendering.
18. Full tab-through with accessible names — every focusable element in order with its accessible name printed; an unnamed focusable is a defect.

WRITE ${OUT}/mock/final/REVIEW.md
- PASS or FAIL per item, all eighteen, each with the OBSERVED VALUE. No item skipped, no failure filtered, no item marked n/a.
- Evidence PNGs in ${OUT}/mock/final/review-shots/, referenced by filename from the item that needed them.
- Numbered findings R-01 upward, each with: title (<= 80 chars), severity (blocker | high | medium | low), confidence (0 to 1), the observed value, the C.8 item or SC number it violates, and the one-line change you would make. NEVER filter by perceived importance and never apply a severity floor — report every finding you have, including low. The orchestrator filters.
- A closing section naming anything in C.8 you could not test and exactly why.

For reference: the builder reported ${build.bytes} bytes, non_ascii ${build.non_ascii}, mechanism "${build.mechanism}", and ${build.deviations.length} declared SPEC deviations. The shooter reported external ${shoot ? shoot.external : 'unknown'} and shadow classes ${shoot ? JSON.stringify(shoot.shadow_classes) : 'unknown'}. Treat all of that as CLAIMS TO TEST, never as findings you may inherit.

Deliver exactly this. Name the exact gate. No generic verify padding.

Your final message IS the return value: return ONLY {pass, fail, blocking, findings, sc, report_path}. Never paste REVIEW.md into the return value.`),
  { label: 'MR prober (review-clickthrough.mjs, C.8 x18)', phase: 'Probe', model: 'opus', effort: 'high', schema: PROBE_SCHEMA })

if (!probe) {
  log('MR died — the mockup is unprobed; W4b has nothing to fix against')
  return { gate: 'FAIL', reason: 'prober returned nothing', kit, build, shoot, hostsim, probe: null }
}
log(`Probe: ${probe.pass} pass / ${probe.fail} fail, ${probe.blocking} blocking, ${probe.findings.length} findings`)

const shadowClasses = shoot && shoot.shadow_classes ? shoot.shadow_classes.length : 0
const reasons = []
if (build.non_ascii > 0) reasons.push(`non-ascii ${build.non_ascii}`)
if (!shoot) reasons.push('shooter returned nothing')
else if (shoot.external > 0) reasons.push(`${shoot.external} external requests`)
if (shadowClasses > 3) reasons.push(`box-shadow census has ${shadowClasses} classes: ${shoot.shadow_classes.join(', ')}`)

return {
  gate: reasons.length ? 'FAIL' : 'pass',
  reason: reasons.join('; ') || undefined,
  kit: { classes: kit.classes.length, tokens_added: kit.tokens_added, contrast_ok: kit.contrast_ok },
  build: { path: build.path, bytes: build.bytes, non_ascii: build.non_ascii, mechanism: build.mechanism, deviations: build.deviations.length },
  shoot: shoot ? { ok: shoot.ok, shots: shoot.shots, external: shoot.external, page_errors: shoot.page_errors, shadow_classes: shoot.shadow_classes, shadow_value: shoot.shadow_value } : null,
  hostsim: hostsim ? { ok: hostsim.ok, static_paint: hostsim.static_paint, mock_ready: hostsim.mock_ready, errors: hostsim.errors } : null,
  probe: { pass: probe.pass, fail: probe.fail, blocking: probe.blocking, findings: probe.findings.length, sc: probe.sc, report: probe.report_path },
}
