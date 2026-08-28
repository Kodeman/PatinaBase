# RESUME — The Life Review (designer portal, "bring it to life") — closed 2026-08-28

## The ask (verbatim)

> You are a senior UI designer, Review the current designer portal and make recommendations to
> bring more life to the page, designers are complaining it is too flat and everything blends
> together. Only suggest UI improvements and dont change the UX or workflow. Present three
> optinos in an HTML presentation for the Patina team to weigh in on.

## Rulings taken at plan time (2026-08-28)

- **Lean pipeline** — roughly 10 subagents, not the full 25-agent house pipeline used on prior
  Document-program decks.
- The deck **poses a bounded D4 (shadow) amendment as a question only** — prose in the questions
  section (`13-questions.html`, Q04), no mockup in any lane shows a shadow, and no direction
  depends on it landing either way.
- Scope is UI-only: every route, component, interaction, label and IA stays identical across
  today and all three directions. No product code changes anywhere in this program.

## Phase table — what happened

| Phase | What | Output |
|---|---|---|
| Scaffold | kit port, build/QA tooling, deck-parts skeleton | `mock/kit.css`, `KIT.md`, `mock/deck-parts/{build.mjs,qa-run.cjs,DECK.md,00-head.html,99-script.html}` |
| Evidence | fresh boot, 22 shots (1440 + 390) + DOM measurements | `research/01-shot-ledger.md`, `research/12-measurements.{md,json}`, `shots/*.png` (22) |
| Priors | verbatim prior-program quotes + canon digest, self-verified | `research/13-priors.md`, `research/11-canon-digest.md`, `research/VERIFICATION.md` (10/10 + 8/8 re-greppable) |
| Audit | one simulated senior-designer seat against the fresh evidence | `research/20-audit.md`, `research/31-findings.{md,json}` — **25 findings: 4 blocker / 11 high / 9 medium / 1 low** |
| Directions v1 | three UI-only directions + 9 shared planks + the D4 amendment | `source/direction-{a,b,c}-v1.md`, `source/shared-planks.md`, `source/amendment-elevation.md` |
| Critique | one fresh critic, feasibility + designer's-eye, scorecard | `source/critique.md` — **39 defects (D01–D39)** |
| v2 | authors answer every defect | `source/direction-{a,b,c}.md` (v2 in place, v1 kept as `-v1.md`) |
| Critique re-read | same critic re-verifies v2, finds residue | `source/critique.md` "v2 re-read" — **35 resolved / 4 partly / 0 unresolved / 0 disputed**, plus **D40–D49** (10 new defects from the re-read) |
| v3 | authors answer D40–D49 | `source/direction-{a,b,c}.md` (final, v3) |
| Deck parts | 14 sections + head/script authored against DECK.md | `mock/deck-parts/01-cover.html` … `14-colophon.html` |
| Build / QA | render + probe pass | `mock/deck-qa/*.png`, `mock/deck-qa/qa-results.json` (not committed) |
| Fact-check | every number/ratio/token/quote/F-id/score traced to source | `research/60-deck-check.md` — ~95 rows checked, 7 fixed (stale post-v3 figures), 0 unsourced |
| Overflow fix | `.dk-strip-grid` given an explicit `minmax(0,1fr)` column template (4→2→1 at 1100/640px) so the "one column, four ways" strip stops overflowing at narrow widths | `mock/deck-parts/00-head.html:459-461` |
| Publish | Artifact tool, favicon, title | **https://claude.ai/code/artifact/f333f3f1-c2d5-4d79-8480-7e22f7330500** — v1-three-directions, 2026-08-28, 2.31 MB, 14 sections, 14 inline mockups, 8 evidence shots, 0 box-shadow |

## The three directions

- **A — Ink on Paper** (type + tonal contrast, inside D4, lowest cost). Signature: the section
  head — Strata mark, mono label, Playfair name, 1.5px charcoal rule — riding a five-step
  Playfair scale and three paper stocks ≥1.15:1 apart. Risk: the desk ground moves off white
  (`#FAF7F2` → `#E0D6C4`, scoped to `/desk`), the one move a team can reject on sight after three
  years of one cream; if refused, A's two rail stocks still stand on their own.
- **B — Honest Materials** (color, tint, imagery, texture, inside D4). Signature: paper tinted by
  document movement (the six `--phase-*` hues at 4–8%), filled status stamps, a charcoal
  letterhead/red-letter band, catalog-linked FF&E thumbnails. Risk: reads as "a dashboard" —
  the critic's harshest single line — and the tints, even after a v3 retune, still tell one
  movement from another by hue alone (pairwise stock separation 1.000–1.007:1).
- **C — The Dark Desk** (inversion; depth via value contrast, D4's own mechanism). Signature: the
  paper edge — Studio Drawer, DocSpine, MarginRail and the `/desk` ground go charcoal, one warm
  clay rule marks every sheet edge, the paper itself is untouched. Risk: heavier at night, and as
  drawn the inversion stops at four surfaces — `/library`, `/people` and the ledgers stay paper
  under only a dark drawer edge (extending them is priced separately, +3–4 days).

## The recommendation, in three

1. **The nine shared planks ship first, as their own lane, before any direction** — reading
   floor, three real muted inks, three rule weights, an ink for every pigment, a filling status
   state, a hover that reads, a drawer with its own ground, two visible rails, one ground per
   width. SP-01 alone is 1,749 `text-[<n>px]` literals across 252 files (4–6 days) and every
   lane's own numbers already assume it landed.
2. **Direction A ships next, as the floor, regardless of what else is picked** — the only lane
   whose separations reproduce to three decimals across two critiques, and the only one that adds
   rank above the shared floors rather than only inheriting them (+2–3 days on the planks).
3. **Then the team picks one visible move; the recommendation is C's chrome** (Studio Drawer,
   DocSpine, MarginRail, `/desk` ground, dark) over B's material, on value contrast being D4's own
   named mechanism, the mobile bar's own production precedent, and giving the desk an actual desk.
   Two grafts from B are taken either way — the charcoal letterhead/red-letter band (12.485:1, the
   strongest single answer to F09 in the deck) and the filled status stamps; B's movement tints
   and FF&E thumbnails wait (tints still fail their own separation test pairwise; thumbnails wait
   on the Strata `product_id` count — see Q06 below).

## The critic's v2 scorecard (re-read, v1 → v2, six axes, 1–10, never averaged)

| Axis | A · Ink on Paper | B · Honest Materials | C · The Dark Desk |
|---|---|---|---|
| Contrast & separation | 8 → **9** | 5 → **6** | 9 → **9** |
| Hierarchy & scan | 9 → **9** | 5 → **6** | 3 → **6** |
| Still Patina | 9 → **9** | 4 → **5** | 6 → **7** |
| Canon fit | 8 → **8** | 6 → **7** | 3 → **6** |
| Cost & reversibility | 6 → **6** | 4 → **5** | 5 → **5** *(was 3)* |
| Different-product risk (10 = low) | 8 → **8** | 3 → **5** | 2 → **4** |

`research/60-deck-check.md` flags, and leaves unresolved on purpose: these numbers are the
critic's v2 re-read scores, printed as-is in `11-compare.html`/`13-questions.html` even though the
underlying v3 fixes (D41/D42/D44, all "resolved in v3") plausibly move some of them further — no
v3 re-score exists in any source document, so the deck states the v2 numbers plus the v3 factual
corrections side by side rather than inventing a rescore.

## OWED — Kody's rulings

Eleven questions in `mock/deck-parts/13-questions.html`, none yet ruled:

1. **Does Direction A ship as the floor under whichever visible move the team picks?**
2. **After A, does the team take C's chrome, B's material, or neither?**
3. **Accept A's desk ground `#E0D6C4` scoped to `/desk`, or keep the desk white and take only the
   paper and rail stocks?**
4. **Close R72's dead exception and build the CSS gate D4's own text asks for, before deciding
   whether to admit one tokenized elevation?** — this is the D4/shadow amendment question
   (`source/amendment-elevation.md`).
5. **Accept B's movement told by hue alone, or drop the tints and keep the band and the stamps?**
6. **What is the production `product_id` count, and does it change the ruling on F15?** —
   locally `project_ffe_items` has 6 rows, 0 with a `product_id`; nobody in this program has the
   Strata figure. Run the count before ruling on B's thumbnail treatment.
7. **Does C's inversion stay at four surfaces, or extend to `/library`, `/people` and the ledgers
   too?** (+3–4 days if extended, none of it mocked here.)
8. **Do the planks ship as one lane before any direction, at SP-01's 4–6 days?**
9. **Does `contrast.test.ts`'s `parseTokens` get a light/dark split before C ships?** (priced at
   1 day, called non-optional; a separate exemption-list widening from five files to eleven.)
10. **Who fixes the desk's 390 overflow, and when?** — **F24**, severity medium, defect with **no
    owner**: 437 CSS px of content in a 390px viewport, 47px of overflow onto a fourth unpainted
    ground. Not fixed by any direction or plank in this deck; all twelve 390 mockups assume it
    repaired.
11. **Accept SP-06's hover floor at what it actually measures, `1.097:1`, against its own
    `≥1.09:1` promise?**

Once ruled, record the outcome as a new entry in `docs/design/the-document/DECISIONS.md` — the
ledger's last ruling entry is **R125** (2026-08-25, the Wayfinding program's build rulings), so
this program's ruling entry will be the next `R###` in sequence. No entry exists yet.

## RULED 2026-08-28 — "A, with a little of B's colour"

**Two steps, not one.** The team first ruled Direction B, Honest Materials, preferred, with
Direction A, Ink on Paper, a strong second. The design lead built a B-on-A hybrid to carry that
forward — B's materials laid onto A's skeleton, six movement-tinted desk bands bled edge to edge,
a tinted Project-stock document sheet, one charcoal band carrying the letterhead, the instrument
row and the red letter — and took it through two rounds of adversarial review (`mock/final/REVIEW.md`,
R01–R48) before Kody saw it. He ruled against the large tinted surfaces, not the review's own
findings, verbatim: *"the desk is starting to look silly with the banded colors edge to edge. and
the document with the dark header and yellow body looks terrible. Direction A would have been
better guidance, pulling in a little more of direction B's color, Maybe an animated color highlight
on hover."* The interview that followed produced the direction actually shipped.

**The final direction, in four lines:**
- Direction A, whole — the type scale, the three rule weights, the section head, the cream desk
  ground, the untinted paper, the spine/margin rail, margin chips as lifted paper.
- From B, exactly three things — filled stamps at ~1.18:1, the six saturated stage tabs as small
  plates on the roster heads, 48px thumbnails on catalog-linked lines. Removed: the tinted desk
  bands, the tinted document sheet, the charcoal band.
- New — the hover wash: a roster or FF&E line's own pigment opens under the pointer via the
  portal's ink-pool mechanic, landing at ~1.12:1 over its ground ("the rule is the ratio, not the
  alpha"); a flat tint under reduced motion.
- Depth stays one token, `--elevation-sheet`, at three sites (the Q04 amendment, not canon);
  motion stays the portal's own vocabulary, the roster settling once per load.

**Ruling (comment on the mockup):** THE STUDIO block on the desk keeps its deployed typography — untouched by any direction.

**Published:**
- Mockup — **https://claude.ai/code/artifact/bf781dba-3938-464d-849d-5787bbd79cd7** —
  `v2-a-with-b-colour`, one self-contained file, built and reviewed in `mock/final/`.
- Deck — republished at the same URL, **https://claude.ai/code/artifact/f333f3f1-c2d5-4d79-8480-7e22f7330500**,
  now carrying a fifteenth section, `mock/deck-parts/15-ruled.html` (id `ruled`, between Questions
  and Colophon), recording this ruling. 43/43 sampled text pairs ≥4.5:1 (floor 4.68), 0
  washed-row texts short, 0 external requests, no overflow at 1440/390, reduced-motion sweep 0,
  roster settle 0 after every return, two adversarial review rounds (R01–R48) dispositioned.

**Still open** — this ruling picks the direction; it does not close the standing questions in
`13-questions.html`, and it adds one:
- `Q04` — close R72's dead `.folio-face` exception and build the CSS gate before any elevation
  ships as canon.
- `Q06` — the production Strata `product_id` count, still unrun.
- `Q08` — whether the planks ship as their own lane first, at SP-01's 4–6 days.
- `Q09` — whether `contrast.test.ts`'s `parseTokens` gets its light/dark split before this ships.
- `Q10` — who fixes the desk's 390 overflow, `F24`, and when.
- `Q11` — whether SP-06's hover floor is accepted at `1.097:1` against its own `≥1.09:1` promise.
- `Q12` — new. Should the hover wash ship as a plank now (UI-only, touching only
  `desk-roster.tsx` and `ffe-section.tsx`), or wait for the direction it was built inside?

## NOT DONE / this program does not claim

- **Nothing built in the product.** Every direction is tokens, classes and mockups against
  `mock/direction-{a,b,c}.css` and `mock/fragments/*.html` — zero lines changed in
  `apps/designer-portal/src`.
- **No user research.** One simulated senior-interior-designer seat (Phase "Audit") walked the
  fresh evidence; that is not a panel, not a real designer, and not tested with a live person.
- **Local seed data only.** All 22 shots, all measurements and all findings are against the local
  Supabase seed (`designer@patina.dev`); the one open production question (Q06, the Strata
  `product_id` count) is explicitly unanswered.
- **The colophon's own "what this deck does not claim"** (`mock/deck-parts/14-colophon.html`)
  covers the same ground in the deck itself: no user research, a simulated seat, local seed data,
  B's imagery scope.

## Environment notes

- **Dev server left running**: PID **52138**, port 3000, `next dev --webpack` (`dev:designer`,
  which also boots the orders/media/projects services via turbo). Booted with
  `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live NEXT_PUBLIC_FLAG_OVERRIDES='call-sheet:true,arrival-arc:true,room-file:true,studio-workspaces:true'`
  from the repo root — see `research/00-env-and-ids.md` §4 for the exact command.
- **Local Supabase** (Docker) was already running, untouched by this program: API `127.0.0.1:54321`,
  Postgres `127.0.0.1:54322`.
- **Seed account**: `designer@patina.dev` — the password is never printed here or anywhere in this
  program; read it from `supabase/seed/dev-accounts.sql` directly.
- A foreign dev server from an unrelated worktree (`.codex/worktrees/agent-ui-polish`) was found
  bound to :3000 at boot time and killed per the brief (`research/00-env-and-ids.md` §2) before
  this program's own server was started — no relation to this program's evidence.

## How to rebuild the deck

```bash
# from $PROGRAM, unsandboxed (build/QA both touch the filesystem the sandbox restricts):
node mock/deck-parts/build.mjs      # assembles the 17 parts → presentation.html
node mock/deck-parts/qa-run.cjs     # renders + probes into mock/deck-qa/ (not committed)

# to re-shoot the three direction previews (from apps/designer-portal, portal running):
bash ../../artifacts/document-life-directions-2026-08-28/mock/build-preview.sh
node ../../artifacts/document-life-directions-2026-08-28/mock/shoot-preview.mjs
```

## File ledger

- **`RESUME.md`, `presentation.html`** — this file; the published 2.31 MB deck.
- **`research/`** — evidence: env/id notes, shot ledger, measurements, priors, canon digest,
  verification self-check, the 25-finding audit, the deck fact-check, plus the capture/measure/
  contrast/debug scripts that produced them. (`node_modules` is a symlink, not staged.)
- **`shots/`** — 22 fresh 1440×900 + 390×844 PNGs of the live local build (desk, document
  surfaces at every stage, room/library/people, roster/spine/drawer/margin/FF&E/chip crops).
- **`source/`** — `plan.md`, `specimen.md`, the three directions (v1 + final v3), `critique.md`
  (v1 defects + v2 re-read + D40–D49), `shared-planks.md` (9 planks), `amendment-elevation.md`
  (the D4 question).
- **`mock/`** — the kit (`kit.css`, `KIT.md`, fonts, product crops), the three direction
  stylesheets, 15 mockup fragments, deck-build tooling (`build.mjs`, `qa-run.cjs`, `DECK.md`),
  17 deck-part HTML files (including `15-ruled.html`), 8 JPEG evidence crops in `deck-assets/`,
  and the preview PNGs/script used to sanity-check each direction before deck assembly. `deck-qa/`
  (QA screenshots) stays on disk, not staged.
- **`mock/final/`** — the ruled direction's own standalone build: `index.html` (the clickable
  mockup, published as `bf781dba-…`), `FINAL.md` (the direction as revised, token table, click
  map, gates), `REVIEW.md` (the two-round adversarial review of the pre-ruling B-on-A hybrid, kept
  as history), `tokens.css` (the `:root` block extracted for the contrast checker),
  `shoot-final.mjs` / `review-clickthrough.mjs` (the shoot and the adversarial probe),
  `host-sim.mjs`, `shots/` and `review-shots/` (the evidence PNGs). `node_modules` is a symlink to
  `apps/designer-portal/node_modules`, not staged.

## Resume prompt

"Read `artifacts/document-life-directions-2026-08-28/RESUME.md`. The Life Review is complete and
published (https://claude.ai/code/artifact/f333f3f1-c2d5-4d79-8480-7e22f7330500). Nothing is built
in the product. Kody owes rulings on the eleven questions in `mock/deck-parts/13-questions.html`
(including the D4 shadow amendment, Q04, and the ownerless F24 390-overflow defect, Q10) and the
Strata `product_id` count for Q06. Once ruled, record the outcome as the next `R###` entry in
`docs/design/the-document/DECISIONS.md` (last entry: R125). No build program has started."
