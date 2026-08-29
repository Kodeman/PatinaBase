export const meta = {
  name: 'document-lens-w4b-mock-fix',
  description: 'W4b: a fresh builder seat applies REVIEW.md and answers every R-nn in FINAL.md, the mockup is reshot and re-host-simmed, a fresh prober re-runs the clickthrough into REVIEW-2.md, and a cutter drives the live mockup to twelve named states and writes the deck fragments',
  phases: [
    { title: 'Fix', detail: 'MB2, a fresh builder seat, copies index.html to build/index-v1.html, applies REVIEW.md and answers every R-nn' },
    { title: 'Reshoot', detail: 'shooter and host-sim run again over the fixed mockup, same briefs, same counts' },
    { title: 'Probe2', detail: 'MR2, a fresh prober seat, re-runs review-clickthrough.mjs unchanged into REVIEW-2.md' },
    { title: 'Fragments', detail: 'FC drives the live mockup to twelve named states, writes mock/fragments/*.html, and runs the deck build in smoke mode' },
  ],
}

const REPO = '/Users/kody/Code/patina-merged'
const OUT = REPO + '/artifacts/document-lens-proposal-2026-08-28'
const LIFE = REPO + '/artifacts/document-life-directions-2026-08-28/mock/final'
const DP_MODULES = REPO + '/apps/designer-portal/node_modules'

const ASK = "> \"We are getting close to a design that feels right on the document. The spine on the left is still cluttered and could be better utilized to navigate the ins and outs of the document. The main header contains great info but takes up most of the screen height when opened up, each section is crammed into the next and the margin seems cramped for the space needed for the functionality it contains. Have a team of UI and UX designers sit down with the Patina engineering and interior design teams. Work with them to design the document so that it contains the needed information and actions, while feeling uncluttered and peaceful. Explore animations, content that appears when it needs to and lends to space when it isn't needed in frame. Think of the document as a smart lens that is always adjusting focus on what is needed as the designers move through the document. Present your strongest proposal to achieve this in an html document accompanied with a high fidelity mockup showcasing how the team will accomplish this challenging User experience and UI requirements.\""

const S5_CANON = "## §5 Canon latitude\n\n```\nCANON LATITUDE (2026-08-28, Kody): the ruling ledger docs/design/the-document/DECISIONS.md\n(last id R126) is CONTEXT, not constraint. Amend freely. Do NOT price amendments and do NOT\npenalise them — a refuter labels what a move amends, for the record only. Four hard no-gos\nstand and are not re-proposable:\n  NG1  D1 — one document at a time. No split view, no tabs, no peek/hold, no persistent\n       global nav over an open doc. Esc / Put down is the exit.\n  NG2  D4 shadow budget — exactly one token, --elevation-sheet: 0 1px 2px rgba(44,41,38,.08),\n       at three sites (margin chip, open ledger sheet, studio drawer). Zero other shadows.\n       Mockups, fragments and deck must show 0 box-shadow beyond that token (computed-style\n       sweep, not source grep).\n  NG3  The Thumb Index — removed by Kody, \"do not re-propose\".\n  NG4  The R126 ratified visual register is the FLOOR — 40px Playfair letterhead, 24px Playfair\n       region heads, five-step scale 40/24/18/15/14, mono 11px floor, three rule weights\n       (--rule-hair 1px 10% / --rule-mid 1.5px #2C2926 / --rule-strong 2px + hairline double),\n       paper #FCFAF6, rail stock #E8E3DB, desk #FAF7F2, charcoal #2C2926, the -ink text\n       companions (clay #7C5E30, terracotta #9C5340, golden-hour #79651E, sage #5F6B57), muted\n       ramp #4E4339/#5A4E43/#65594E, filled stamps (~1.18:1 tint, 1.5px pigment border, charcoal\n       word, -1.5deg), six saturated stage tab plates (--tab-brief #497093 … --tab-install\n       #823832, white label), the ink-pool hover wash (clip-path circle from the pointer, 260ms\n       in / 200ms out, --ease-editorial cubic-bezier(0.22,1,0.36,1), ~1.12:1 over own ground,\n       flat -still tint under reduced motion), 48px product crops on catalog-linked lines.\n       The proposal BUILDS ON this register; it does not restyle it. \"Typography goes no further\n       than the mockup\" (R126). THE STUDIO desk block is untouched.\nKody's taste on record: large tinted surfaces read as \"silly/terrible\"; colour belongs on small\nstate-carrying things; \"the sections and animated highlighting\" were loved; \"don't push the\ntypography further\".\nEverything else — composition, mount order, disclosure, motion, the spine's job, the header's\njob, spacing tokens, what appears when — is open ground.\n```"

const PROGRAM = `You are one agent in "The Document — The Smart Lens" (2026-08-28): a multi-agent design program on the Patina designer portal's document surface, /doc/[id] — one paper per engagement, with its letterhead, its job ticket, its guide sentence, its regions, its left spine and its right margin. Patina connects interior designers with makers of custom furnishings. Nothing in the product is changed by this program; the deliverables are a proposal, a clickable mockup and a deck. Repo ${REPO}.

You are in W4b — THE FIX PASS. The mockup is built and probed. Its review is on disk. Your job is to answer the review, prove the answer, and cut the deck's fragments from the living thing.

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
- ${OUT}/mock/final/index.html — the mockup as built in W4a. ${OUT}/mock/final/FINAL.md — its build note.
- ${OUT}/mock/final/REVIEW.md — the prober's eighteen-item verdict and its numbered R-nn findings.
- ${OUT}/source/proposal.md — THE ratified proposal. §3 is the lens mechanics table; §4 organ by organ; §5 the state machine; §6 the frame budget.
- ${OUT}/source/shared-planks.md · ${OUT}/source/specimen.md (the Vandersteen data, verbatim in the mockup) · ${OUT}/source/brief.md §A.3 (SC1-SC13).
- ${OUT}/mock/kit.css · ${OUT}/mock/KIT.md · ${OUT}/mock/lens.css · ${OUT}/mock/final/tokens.css.
- ${OUT}/mock/assets/fonts/fonts-data-uri.css · ${OUT}/mock/img/*.jpg.
- ${OUT}/research/12-layout-measurements.md and .json — today's numbers the mockup must beat.
- ${OUT}/research/01-shot-ledger.md and ${OUT}/shots/*.png — today's document, captured; w1440-rich-s0.png and w1440-rich-s1.png are what the TODAY fragments must match.
- The life chassis at ${LIFE}/ — index.html, FINAL.md §4 (motion vocabulary), shoot-final.mjs, host-sim.mjs, review-clickthrough.mjs.
- ${OUT}/mock/deck-parts/build.mjs — the deck build; it inlines mock/fragments/*.html and fails on a fragment older than index.html.`

const CANON_BLOCK = `CANON LATITUDE — instruments.md §5, verbatim. The ruling ledger is CONTEXT, not constraint. Do not price amendments and do not penalise them. Only NG1-NG4 are closed, and NG2 and NG4 are the two this wave can break by accident.

${S5_CANON}`

const brief = (body) => `${PROGRAM}

${body}

${INPUTS}

${SANDBOX}

${CANON_BLOCK}`

const FIX_SCHEMA = { type: 'object', properties: {
  fixed: { type: 'array', items: { type: 'string' }, description: 'R-nn ids fixed' },
  accepted: { type: 'array', items: { type: 'string' }, description: 'R-nn ids accepted and narrowed' },
  dropped: { type: 'array', items: { type: 'string' }, description: 'R-nn ids dropped with a reason' },
  bytes: { type: 'number', description: 'wc -c of the fixed index.html' },
  non_ascii: { type: 'number', description: 'must be 0' },
  notes: { type: 'string', description: 'max 400 chars: what the fixes cost, any R-nn that could not be answered and why' },
}, required: ['fixed', 'accepted', 'dropped', 'bytes', 'non_ascii', 'notes'] }

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

const FRAG_SCHEMA = { type: 'object', properties: {
  fragments: { type: 'array', items: { type: 'object', properties: {
    name: { type: 'string' }, width: { type: 'number' }, height: { type: 'number' },
    bytes: { type: 'number' } },
    required: ['name', 'width', 'height', 'bytes'] } },
  build_ok: { type: 'boolean', description: 'SMOKE=1 node mock/deck-parts/build.mjs exited 0' },
  build_line: { type: 'string', description: 'the FRAGMENTS N inlined line, verbatim' },
  box_shadow: { type: 'number', description: 'the box-shadow count the deck build reported' },
  notes: { type: 'string', description: 'max 400 chars' },
}, required: ['fragments', 'build_ok', 'build_line', 'box_shadow', 'notes'] }

phase('Fix')

const fix = await agent(brief(`YOUR SEAT: MB2 — BUILDER v2, A FRESH SEAT. You did not build v1. You inherit ${OUT}/mock/final/index.html and the review written against it, and you answer that review. Read REVIEW.md in full before you touch anything.

FIRST, BEFORE ANY EDIT: preserve v1.
    mkdir -p ${OUT}/build && cp ${OUT}/mock/final/index.html ${OUT}/build/index-v1.html
If that copy does not exist, stop and make it. It is the only way back.

THEN APPLY ${OUT}/mock/final/REVIEW.md. Every R-nn in it gets one of exactly three answers, and every one of them gets its answer written into a new section of ${OUT}/mock/final/FINAL.md headed "Review responses":
  - FIX — you changed the mockup. Say what changed, in which C.* section's terms.
  - ACCEPT AND NARROW — the finding is real but smaller than stated. Say what the narrower true claim is, and what you did about it.
  - DROP WITH REASON — the finding is wrong, or it asks for something the proposal or a no-go forbids. Say which, and cite the clause.
NO R-nn goes unanswered. A silent R-nn is a failure of this seat, not a judgement call. Answer the low-severity ones too.

CONSTRAINTS THAT DO NOT MOVE WHILE YOU FIX
- SPEC.md's C.* sections are still binding, all of them. A fix that breaks a C.* item is not a fix; if a review item and a C.* item genuinely conflict, that is a DROP WITH REASON naming both.
- The Vandersteen data stays verbatim from ${OUT}/source/specimen.md. Do not simplify a number to make a layout work.
- tokens.css stays the R126 register plus only the four lens families. Do not restyle, do not push the typography, no large tinted surface, colour only on small state-carrying things.
- box-shadow only as .doc-elevated { box-shadow: var(--elevation-sheet) } at the three sites; drop-shadow nowhere.
- Pure ASCII, zero external requests, one file, static markup plus CSS still paints the rest state if init fails, delegated listeners only, __mockInit() plus the readyState guard, window.__mockReady and window.__lensSettled() still exposed.
- Every duration still written calc(<base> * var(--motion-scale, 1)); reduced motion still one shared selector list with the media query.
- No hover-only affordance anywhere.

RE-RUN THE BUILDER'S OWN THREE PRINTS AND PASTE THEM VERBATIM INTO FINAL.md, alongside v1's:
  cd ${OUT}/mock/final && wc -c index.html
  cd ${OUT}/mock/final && LC_ALL=C grep -c '[^ -~\\t]' index.html      -> must be 0
  cd ${OUT}/mock/final && grep -c 'box-shadow' index.html

Deliver exactly this. Name the exact gate. No generic verify padding. No unrequested feature, no refactor, no abstraction the review did not ask for.

Your final message IS the return value: return ONLY {fixed, accepted, dropped, bytes, non_ascii, notes} where the three arrays hold R-nn ids.`),
  { label: 'MB2 builder v2 (apply REVIEW.md)', phase: 'Fix', model: 'opus', effort: 'high', schema: FIX_SCHEMA })

if (!fix) {
  log('MB2 died — v1 stands unfixed; stopping')
  return { gate: 'FAIL', reason: 'builder v2 returned nothing', fix: null, shoot: null, hostsim: null, probe2: null, fragments: null }
}
log(`Fix: ${fix.fixed.length} fixed, ${fix.accepted.length} accepted-and-narrowed, ${fix.dropped.length} dropped; ${fix.bytes} bytes, non_ascii=${fix.non_ascii}`)

phase('Reshoot')

const SHOOTER_PROMPT = brief(`YOUR SEAT: SHOOTER. The mockup at ${OUT}/mock/final/index.html has just been fixed against its review. You capture it again and you count what the gates count. You do NOT edit index.html — if something is wrong, you report it.

ADAPT AND RUN ${OUT}/mock/final/shoot-final.mjs. It already exists and was extended in W4a for this mockup's three frames and seven dev-bar states; adapt it only as far as the fixes require. Shots land in ${OUT}/mock/final/shots/, overwriting the previous pass.

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

const HOSTSIM_PROMPT = brief(`YOUR SEAT: HOST-SIM. You answer one question about the just-fixed mockup: does it survive the Claude Artifact host, which inserts the file into a live page's body AFTER load so DOMContentLoaded has already fired?

RUN ${OUT}/mock/final/host-sim.mjs. It already exists: a blank page, loaded; then the file's content inserted with insertAdjacentHTML; then its <script> texts RE-EXECUTED as fresh script elements with the same text, because innerHTML-inserted script text never runs on its own. Adapt it only as far as this mockup's structure requires.

REPORT, in this order:
1. STATIC PAINT BEFORE ANY SCRIPT — after the HTML is inserted and BEFORE you re-execute the script texts, is the rest state painted correctly from markup plus CSS alone? Screenshot it to ${OUT}/mock/final/shots/hostsim-static.png and say what is and is not there. This is SPEC C.1's static-first requirement and it is the thing that saves the Artifact if init throws.
2. window.__mockReady AFTER the scripts are re-executed. True or false.
3. CONSOLE AND PAGE ERRORS — every one, verbatim. Must be 0.
4. EXTERNAL REQUESTS — must be 0.

Do not edit index.html. If it fails, report the failure and the exact error.

Your final message IS the return value: return ONLY {ok, static_paint, mock_ready, errors, external, notes}. ok is true only when static_paint AND mock_ready are true AND errors and external are both 0.`)

const [shoot, hostsim] = await parallel([
  () => agent(SHOOTER_PROMPT, { label: 'shooter v2 (shoot-final.mjs, 8 states)', phase: 'Reshoot', model: 'sonnet', effort: 'medium', schema: SHOOT_SCHEMA }),
  () => agent(HOSTSIM_PROMPT, { label: 'host-sim v2 (insertion after load)', phase: 'Reshoot', model: 'sonnet', effort: 'low', schema: HOSTSIM_SCHEMA }),
])
log(`Reshoot: ok=${shoot ? shoot.ok : 'null'} external=${shoot ? shoot.external : '-'} errors=${shoot ? shoot.page_errors : '-'} shadow classes=${shoot ? shoot.shadow_classes.join(', ') : '-'}`)
log(`Host-sim v2: ok=${hostsim ? hostsim.ok : 'null'} static=${hostsim ? hostsim.static_paint : '-'} ready=${hostsim ? hostsim.mock_ready : '-'} errors=${hostsim ? hostsim.errors : '-'}`)

phase('Probe2')

const probe2 = await agent(brief(`YOUR SEAT: MR2 — THE PROBER, SECOND PASS, A FRESH SEAT. You did not build this mockup and you did not write the first review. YOU MUST NOT EDIT ${OUT}/mock/final/index.html or any file the builder owns.

RE-RUN ${OUT}/mock/final/review-clickthrough.mjs UNCHANGED. The instrument written in W4a is the instrument; changing it between passes makes the two reviews incomparable, which is the whole point of running it twice. If the script errors because the mockup's structure moved under it, fix ONLY the selector or hook that moved, record that repair in a "Probe repairs" section of REVIEW-2.md with the before and after, and change nothing about what the item asserts.

It covers the eighteen items of SPEC.md C.8: external requests 0 · page errors 0 · __mockReady under file:// and under host-sim · computed box-shadow census exactly the three --elevation-sheet sites at 'rgba(44, 41, 38, 0.08) 0px 1px 2px 0px' with drop-shadow 0 · non-ASCII 0 · every dev-bar state reachable and reversible · condensation reaches steady state over a 20-step slow scroll with no oscillation · CLS 0 over a scripted 0-to-foot scroll in both registers · nothing moves under the pointer · reduced-motion parity by visible-text diff and 0 running animations after 1s, via the media query AND the dev-bar toggle · keyboard order survives condensation with nothing focused behind the seam · nothing escapes the frame at 390 · composite contrast >= 4.5:1 per lens state · the navigator lands where it says · 1280 shows the margin as a sheet · SC1-SC4 and SC11-SC12 numbers printed at scroll 0, 400 and 1200 · fonts loaded · full tab-through with accessible names.

WRITE ${OUT}/mock/final/REVIEW-2.md, the same shape as REVIEW.md:
- PASS or FAIL per item, all eighteen, each with the OBSERVED VALUE. No item skipped, no failure filtered, no item marked n/a.
- Evidence PNGs in ${OUT}/mock/final/review-shots/, referenced by filename.
- Numbered findings R-01 upward for THIS pass, each with title (<= 80 chars), severity (blocker | high | medium | low), confidence (0 to 1), the observed value, the C.8 item or SC number it violates, and the one-line change you would make. NEVER filter by perceived importance and never apply a severity floor — report every finding, including low.
- A REGRESSION section: any item that passed in REVIEW.md and fails now, named, with what changed.
- A closing section naming anything in C.8 you could not test and exactly why.

The builder v2 reported: fixed ${JSON.stringify(fix.fixed)}, accepted-and-narrowed ${JSON.stringify(fix.accepted)}, dropped ${JSON.stringify(fix.dropped)}, ${fix.bytes} bytes, non_ascii ${fix.non_ascii}. The shooter reported external ${shoot ? shoot.external : 'unknown'} and shadow classes ${shoot ? JSON.stringify(shoot.shadow_classes) : 'unknown'}. Treat all of that as CLAIMS TO TEST — especially every id in the dropped list, which you re-test on its merits.

Deliver exactly this. Name the exact gate. No generic verify padding.

Your final message IS the return value: return ONLY {pass, fail, blocking, findings, sc, report_path}. Never paste REVIEW-2.md into the return value.`),
  { label: 'MR2 prober pass 2 (REVIEW-2.md)', phase: 'Probe2', model: 'opus', effort: 'high', schema: PROBE_SCHEMA })

log(`Probe 2: ${probe2 ? probe2.pass : 'null'} pass / ${probe2 ? probe2.fail : '-'} fail, ${probe2 ? probe2.blocking : '-'} blocking`)

phase('Fragments')

const fragments = await agent(brief(`YOUR SEAT: FC — THE FRAGMENT CUTTER. The deck does not screenshot the mockup; it inlines pieces of the living thing. You drive the fixed mockup to twelve named states and write each frame's DOM SUBTREE, not a picture, into ${OUT}/mock/fragments/.

THE INSTRUMENT: extend ${OUT}/mock/final/shoot-final.mjs, or write ${OUT}/mock/final/cut-fragments.mjs if that reads cleaner — either is fine, but say which you did. It drives the live mockup with Playwright, waits on document.fonts.ready, window.__mockReady === true and window.__lensSettled() before every cut, sets the state, and serialises the subtree.

WHAT EACH FRAGMENT FILE CONTAINS
- An OUTER WRAPPER carrying a LITERAL inline style="width:Npx;height:Npx" with real numbers read off the live geometry — not a variable, not a class, a literal, because the deck lays out against those numbers.
- A <style> block holding ONLY the CSS RULES THAT SUBTREE NEEDS, scoped under the wrapper's class so two fragments on one deck page cannot bleed into each other. Collect the rules from the live document by walking the matched rules for the subtree's elements; do not paste the whole stylesheet.
- The serialised DOM subtree of the frame's relevant part.
- A <figcaption> saying what the fragment shows, in the register of the deck.
- NO <img> elements. The catalog crops stay CSS url(img/x.jpg) so mock/deck-parts/build.mjs inlines them at build time; an <img> breaks that.
- ZERO computed box-shadow except the .doc-elevated sites. If the deck gate flags a shadow in a fragment, REPLACE it with a hairline rule in the fragment (a 1px --rule-hair edge) rather than deleting the element or the wrapper it sits on, and say in your notes which fragment and why.
- The dev bar is never in a fragment.

THE TWELVE, by name
  lens-s0-1440         1300x980   the proposed document at scroll 0, lens open
  lens-s1-1440         1300x980   the seam / condensed state, scrolled
  lens-s2-1440         1300x980   FF&E at full, neighbours yielded
  today-s0-1440        1300x980   TODAY's document at scroll 0
  today-s1-1440        1300x980   TODAY's ticket seam
  spine-before-360     rail width x 360   the rail as it is
  spine-after-360      rail width x 360   the rail as the proposal makes it
  header-before-720    paper width x 720  the header stack as it is - the frame-budget picture
  header-after-720     paper width x 720  the header organ as the proposal makes it
  motion-grammar-1080  1080 wide          the proposal §3 mechanics table drawn as a strip
  lens-390             390x844            the mobile form
  reduced-1440         1300x980           the reduced-motion register at the condensed state
Read the real width off the live rail and the live paper for the four *-before/*-after fragments and write it literally.

THE TWO TODAY FRAGMENTS ARE NOT CUT FROM THE MOCKUP. today-s0-1440 and today-s1-1440 are DRAWN from ${OUT}/mock/kit.css primitives to match ${OUT}/shots/w1440-rich-s0.png and ${OUT}/shots/w1440-rich-s1.png — open both PNGs with the Read tool and match what is actually in them: the mount order, the 40px letterhead, the job ticket unfolded and then pinned as its two-line seam, the spine, the margin. The whole point of the before/after pair is that the BEFORE is today, not a strawman drawn by the people proposing the change. Same for spine-before-360 and header-before-720. Do not soften today and do not exaggerate it; if you cannot tell what something is from the shot, say so in your notes rather than inventing it.

THEN RUN THE DECK BUILD, from ${OUT}:
    cd ${OUT} && SMOKE=1 node mock/deck-parts/build.mjs
Report the "FRAGMENTS N inlined" line VERBATIM and the box-shadow count it prints. If it fails on a stale fragment — build.mjs fails any fragment file older than mock/final/index.html — re-cut that fragment rather than touching timestamps. If any of its calls need 'sips', run that command with dangerouslyDisableSandbox: true and log it.

Deliver exactly this: twelve fragments and the build result. No thirteenth fragment, no deck-part edits, no restyle.

Your final message IS the return value: return ONLY {fragments, build_ok, build_line, box_shadow, notes}.`),
  { label: 'FC fragment cutter (12 fragments + deck smoke build)', phase: 'Fragments', model: 'sonnet', effort: 'medium', schema: FRAG_SCHEMA })

log(`Fragments: ${fragments ? fragments.fragments.length : 'null'} cut, build_ok=${fragments ? fragments.build_ok : '-'}, box_shadow=${fragments ? fragments.box_shadow : '-'}`)

const reasons = []
if (!probe2) reasons.push('prober pass 2 returned nothing')
else if (probe2.blocking > 0) reasons.push(`${probe2.blocking} blocking findings in REVIEW-2.md`)
if (!fragments) reasons.push('fragment cutter returned nothing')
else if (!fragments.build_ok) reasons.push('SMOKE=1 deck build failed')

return {
  gate: reasons.length ? 'FAIL' : 'pass',
  reason: reasons.join('; ') || undefined,
  fix: { fixed: fix.fixed.length, accepted: fix.accepted.length, dropped: fix.dropped.length, bytes: fix.bytes, non_ascii: fix.non_ascii },
  shoot: shoot ? { ok: shoot.ok, shots: shoot.shots, external: shoot.external, page_errors: shoot.page_errors, shadow_classes: shoot.shadow_classes } : null,
  hostsim: hostsim ? { ok: hostsim.ok, static_paint: hostsim.static_paint, mock_ready: hostsim.mock_ready, errors: hostsim.errors } : null,
  probe2: probe2 ? { pass: probe2.pass, fail: probe2.fail, blocking: probe2.blocking, findings: probe2.findings.length, sc: probe2.sc, report: probe2.report_path } : null,
  fragments: fragments ? { count: fragments.fragments.length, names: fragments.fragments.map(f => f.name), build_ok: fragments.build_ok, build_line: fragments.build_line, box_shadow: fragments.box_shadow } : null,
}
