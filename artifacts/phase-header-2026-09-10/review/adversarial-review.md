# Adversarial review — `the-standing-head.html`

Reviewer: a separate context; did not build the deck. Checked against `panel/synthesis.md`, `panel/brief.md`,
the four shots in `review/shots/`, the ten section shots in `review/shots/sections/`, the token source
`artifacts/desk-cards-2026-09-09/three-cards-for-the-desk.html`, and the live code in this worktree
(`apps/designer-portal/…`) for every defect claim.

Every finding is listed. Severity and confidence are independent judgements; Fable filters.

---

## Fidelity to the synthesis

1. **high · high · §7 `#paragraph`, lines 1145, 1176, 1198, 1222** — **The Standing Paragraph prints the
   eleven-stage vocabulary on every single frame, and its whole thesis is that the vocabulary leaves the
   glass.** The lede says the head "speaks in the studio's own voice"; the side-by-side row says "Off the
   glass; a mono caption at the section rule **if at all**"; the Touches say "the stage sub-label leaves the
   head entirely". Yet all three desktop mocks and the 390 mock print it at the section rule: `Discovery &
   Programming · Core · Stage 02`, `Concept / Schematic · Core · Stage 05`, `Design Development · Core ·
   Stage 06 · Week 3 of 9`. Worse, the Cedar Lane caption reprints **Stage 05** — the exact broken
   `SECTION_STAGE` mapping (`direction → concept_schematic`, verified at
   `apps/designer-portal/src/lib/document/workflow-stage-derivation.ts:92-100`) that A3 and R1 exist to
   escape. A designer comparing directions will read Direction 3 as the one that *keeps* the machinery.
   **Fix:** show the caption on the Project frame only (where a resolver anchors it, per R1's lean), and
   print `— stage door —` or nothing at Discovery/Direction; or, if the caption is meant to be there,
   rewrite the lede, the Touches and the side-by-side row to say so.

2. **high · high · §6 `#band`, line 996 vs line 1084** — **Direction 2 prints `$212,000` in the band it
   itself declares to be "the one declared head", then claims R140 is untouched.** Line 996 puts
   `$212,000` right-flush in band line 1 of the Sonnenberg mock. Line 1084 (Honors) reads "The register of
   R126 and **R140 is untouched**". Direction 1's Honors (line 877) states the opposite rule explicitly —
   "the owed figure outranks the agreed, so **$212,000 does not print in a head**." Both cannot be right.
   Direction 2's `Touches` list (`R111 · R66 · I114 · I118`) omits R140 entirely, and so does the
   side-by-side "Rulings crossed" cell. **Fix:** either drop `$212,000` from Direction 2's band line 1, or
   add `R140` to Direction 2's Touches and to the side-by-side cell and delete the "R140 is untouched"
   clause.

3. **med · high · §7 `#paragraph`, line 1157; side-by-side line ~1320** — Direction 3 also prints
   `$212,000` in its facts line — the head — and also omits R140 from its Touches
   (`R111 I114 R113 R126 R66`) and from the side-by-side "Rulings crossed" cell. Same fix: add R140 or
   drop the agreed figure.

4. **med · high · §2 `#today`, lede line 481 vs note line 582** — The lede says "Two of the six are not
   true"; the note four inches below says "Blocks **3 and 4** are a per-stop constant" — which makes three
   of six untrue, and only block 3 carries the `Constant` flag. The synthesis (A2) says the same thing
   loosely; the deck should not inherit the arithmetic error. **Fix:** flag block 4 as `Constant` too and
   say "three of the six", or narrow the note to block 3 and describe block 4 as "the same constant, drawn".

5. **med · high · §4 `#carries`, lines 690 and 697** — The same sentence appears twice inside one figure
   in two different forms: reg 2 prints "Three of five essentials are in hand **and** her call ran
   **6 September 2026**." and reg 4 (the band reprise, which is supposed to be that head at 56px) prints
   "Three of five essentials are in hand**;** her call ran **6 September**." If the band is the head's
   reprise, the reprise should not rewrite the head. **Fix:** make both read identically (the synthesis's
   Direction-3 wording, "Three of five essentials in hand; her call ran 6 September", is the shortest).

6. **med · med · §4 `#carries`, line 686 heading and lines 703-733** — The synthesis's A7 names **three**
   registers (what · where · next). The deck promotes this to "**Five** registers, fixed order" by adding
   "the band as reprise" and "the stage as door". Those are true panel positions but they are not registers
   the head carries — they are dispositions of two other elements. The section then shows a fourth head
   design (a Masthead/Paragraph hybrid with "The essentials" + `WORKFLOW STAGE ▸`) that is none of the
   three directions. **Fix:** keep the numbered register at three and demote 4 and 5 to a two-line note, or
   retitle to "What every head carries, and what yields to it".

7. **med · high · deck-wide** — **A5 and A6 never reach the glass.** The synthesis's A5 ("the name prints
   twice; the glyph prints twice") and A6 ("the register is inverted — seven sizes before one fact; the
   smallest type on the page answers 'where'") are unanimous panel findings and neither appears anywhere in
   the deck (`grep -i "twice\|register is inverted\|smallest type"` → no hits). A5 matters most because
   Direction 2 reproduces it (finding 12). **Fix:** add both to §1's lede or as two annotation flags on
   blocks 1 and 6 of the replica.

8. **low · med · §5 `#masthead`, lines 787, 815; §6 `#band`, line 1136** — Acts invented beyond the
   synthesis: Cedar Lane gains a second tertiary "Scope the third room" (Masthead), Sonnenberg gains "Open
   the FF&E schedule" (Masthead), and Cedar Lane gains a `+1 more` in Direction 2 that the synthesis's
   Cedar Lane line does not carry. All are plausible and consistent with "the leader + the tool row", but
   they are additions to a spine the deck is supposed to present verbatim. **Fix:** either note in the spec
   `dl` that the tool row is illustrative, or trim to the synthesis's acts.

9. **low · high · §2 `#today`, line 493** — The replica prints block 1's vitals at `t-body-sm` (14px),
   following the brief's table. The code prints them at **11px**
   (`doc-letterhead.tsx` ~line 92: `text-[11px] text-[var(--text-muted)]`), and the synthesis's A6 rests on
   exactly that — "the line that answers 'where does this stand' is the smallest type on the page (11px
   vitals)". Rendering them at 14 softens the argument the deck is making. **Fix:** print the vitals at 11px
   (`t-head` without the uppercase, or a one-off 11px Inter) and let the replica prove A6 on sight.

## Does each head answer what / where / next in one glance?

10. **med · high · §5 `#masthead`, Sonnenberg mock lines 806-822** — **Direction 1's Project head states
    "where" twice and "what" zero times.** The running head reads `Project · Design Development · Core ·
    Stage 06 · Estimated`; the standing sentence opens `Week 3 of 9 toward 14 November 2026`. Both are
    position. There is no subject line, no room count, no size — and R140 (as Direction 1 reads it) forbids
    the one number that would say how big the job is. So the direction the side-by-side calls "the most
    complete answer to *what is this project*" is, at the Project stop, the one head that never says what
    the project is. **Fix:** give Sonnenberg a subject line at Playfair italic 20 (`Eleven pieces · 1908
    Ingersoll` or the assembled line), and move the stage phrase behind the `Ledger ▸` door so the running
    head is not the second "where".

11. **low · med · §5 `#masthead`, Cedar Lane mock lines 776-790** — The "what" is `Cedar Lane Study` +
    *Nora Ellison* — a job name and a person, no nouns of the job. The cut list's row 1 promises "the nouns
    of the job, or nothing"; Cedar Lane gets a name instead. **Fix:** either add the nouns
    (`Three rooms · Beaverdale`) or say in the spec that the subject yields to the client name when the
    title already carries the nouns.

12. **med · high · §6 `#band`, Discovery mock lines 894-901; all three mocks** — **Direction 2's head never
    answers "what", and it prints the name twice and the glyph twice — the exact defect A5 names.** The
    letterhead is glyph + `Edna Courtney`; band line 1 is `EDNA COURTNEY · DISCOVERY`; the readiness caption
    carries a second glyph. Same on Cedar Lane and Sonnenberg. The Departs paragraph (line 1088) mentions
    only the readiness act and the silent region head. **Fix:** say it plainly in Departs — "the name and
    the glyph print twice; this direction accepts A5 in exchange for R127" — so Kody rules with eyes open.

13. **med · high · §6 `#band`, Discovery mock lines 899 and 923** — Direction 2 states "where" twice, in two
    arithmetics, 60px apart: the band says "**Two essentials open** — working budget, how they live" and the
    caption below says "**3 of 5** essentials captured." That is A1's sin in miniature, inside the direction
    sold as "the least construction". **Fix:** drop the caption at pre-work (P5: a region with nothing new
    to say renders nothing) or make the caption the only count and the band name only the two gaps.

14. **low · med · §6 `#band`, lines 900 and 907** — `ADD WORKING BUDGET` appears twice on one screen (band
    act and door row 1). D1 is about rows sharing one act; this is the mirror problem — the leader and the
    first row are the same act. **Fix:** when the door is open, the band's act should read `ADD BOTH` or the
    first row should be the one that is not already the leader.

15. **low · med · §7 `#paragraph`, Vandersteen mock lines 1206-1220** — The Vandersteen head's facts line is
    `Install Thursday, 18 September — eight days out`, which is a *when*, not a *what*. The head never says
    what the Vandersteen job is. (The synthesis writes it this way, so the deck is faithful.) **Fix:** note
    in the spec `dl` that at install the date displaces the nouns, or add the nouns.

16. **low · med · §5 `#masthead`, line 785** — Direction 1's Discovery leader is `ADD WORKING BUDGET` while
    its own standing sentence names two open items ("budget comfort **and** how they live are still Edna's
    to answer"). Direction 3's `ASK EDNA FOR BOTH` solves this. The act is not ambiguous, but it is narrower
    than the sentence above it, which is a P3 mismatch (consequence sentence ≠ act). **Fix:** either widen
    the act or narrow the sentence.

## V9 non-licenses and token fidelity

17. **info · high · CSS lines 1-100** — `grep box-shadow` → **zero hits.** The `:root` block and both dark
    blocks are **byte-identical** to `three-cards-for-the-desk.html` (verified by `diff`). Colour literals
    are exactly the token set plus `#FFFFFF` for the stage-plate label (sanctioned by R126) and the three
    `rgba(…)` hairlines that are themselves tokens. No status dots, no ✓ glyphs, no tab bars, no red/green,
    the word "dashboard" appears nowhere, the word "AI" appears nowhere. **No action.**

18. **low · high · CSS lines 326, 345, 355** — `border-radius: 50%` on `.anno-no`, `.reg-marker`, `.reg-key`
    against R126's "radii 2/3px only". These are deck annotation chrome, never mock elements, and the same
    circles appear in the desk-cards deck at lines 240/266 — established precedent. **No action; recorded
    for completeness.**

19. **low · high · CSS lines 109, 116** — Two type steps beyond the source scale: `.t-d0` (64px) and
    `.t-body-20` (20px). Both are used **only** in the §1 replica of today's head (lines 491, 501, 544),
    where the brief specifies "Playfair ~64px" and "Inter ~20" — so they are the replica's evidence, not new
    house steps. **No action; consider a CSS comment saying so.**

20. **med · high · §2 `#today`, line 519** — The replica prints block 3 in `var(--oak)` on `--paper-doc`.
    Computed: **4.30:1** at 12px — the deck therefore ships a live sub-4.5:1 text pairing (which is the
    point of D3, and D3's numbers check out exactly: 4.30 on paper-doc, 4.20 on paper). It is deliberate
    evidence but an automated audit of the deck will flag it, and a reader on a bright screen may simply not
    read the line. **Fix:** keep the oak, and add `aria-describedby`/a visible micro-caption "printed at
    4.30:1 — see D3" so the failure is labelled rather than merely committed.

21. **info · high · contrast sweep** — All other pairings pass in both themes. Light: `ink` 13.87,
    `ink-muted` 9.22, `ink-subtle` 7.73, `ink-faint` 6.51, `clay-ink` 5.75, `terracotta-ink` 5.41 (all on
    paper-doc); on `rail` (readiness band) `ink` 11.32 / `ink-subtle` 6.31. Dark: every ink step ≥ 7.2 on
    paper-doc; `oak` rises to 5.61 so block 3 passes in dark and fails only in light. Stage plates with the
    white label: 5.22 (brief) to 8.20 (install) — the CSS comment claiming they must keep their light values
    is correct (lifting them would drop white below 4.5:1). **No action.**

22. **med · med · CSS line 176 (`.act--inline`)** — `.act--inline { min-height: 0; min-width: 0 }` defeats
    the 44px hit target for the oak-scored words inside sentences. Direction 3 leans on these as its
    navigation ("the owed items are oak-scored words that jump to their facet") — five of them across the
    mocks. At 16px Inter with a 3px pad the target is ~22px tall. **Fix:** either state the exception in the
    spec `dl` ("inline facet jumps are text links, not controls — the 44px rule applies to the acts"), or
    add `padding: 8px 0` with a negative margin so the hit box reaches 44 without moving the baseline.

23. **info · high · CSS lines 186-188, 446-454** — `focus-visible` is a 2px `--clay-ink` outline at 2px
    offset on `.act`, `a` and `button`; `prefers-reduced-motion` zeroes every transition, animation and
    `scroll-behavior` with `!important`; a `forced-colors` block hides the wash and re-borders every panel.
    Both theme blocks are complete: every token is defined on bare `:root`, redefined under
    `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }` and again under
    `:root[data-theme="dark"]`, with the seven plates deliberately excluded and the exclusion commented.
    **No action.**

## Render

24. **high · high · §6 `#band`, lines 921, 977, 1047 — visible in `sections/the-standing-head-band-1440.png`
    (y≈578-645), `1440-dark` slice 02 (y≈1110-1160) and the 390 shot (slice 06, top)** — **The silent region
    head renders as a ~50px empty band between two rules, in every theme and both widths.** The markup is
    `<h3 class="silent t-head">&#8203;</h3>` — a zero-width space inside a heading. Two consequences: (a) it
    reads as a rendering fault, not as the designed silence Direction 2's Departs paragraph describes;
    (b) it is an **empty heading**, a WCAG/axe failure, in a deck whose §6 criticises the portal's heading
    hygiene (D2, D4). Four instances. **Fix:** delete the `<h3>` and let the 2px rule carry the silence with
    `margin-bottom: 0`, or give the heading real text and `class="sr-only"` — never a ZWSP heading.

25. **high · high · deck-wide — no Direction or Project head is shown at 390** — The brief commissions "three
    directions, each rendered live at three phases (Discovery · Direction · Project), **desktop and 390**".
    The five `.phone-cap` frames are: Masthead → Discovery only; Band → Discovery pinned + Discovery below
    the pin; Paragraph → Discovery + Care. **Project never appears at 390 in any direction**, and Project is
    the hardest phone case: Direction 2's band line 1 must fit
    `SONNENBERG RESIDENCE · PROJECT · DESIGN DEVELOPMENT · WEEK 3 OF 9` plus a right-flush `$212,000` in
    56px, and Direction 1's running head must fit `PROJECT · DESIGN DEVELOPMENT · CORE · STAGE 06 ·
    ESTIMATED`. **Fix:** add a Project 390 frame to each direction (at minimum to Directions 1 and 2, where
    the long resolver phrase is the risk).

26. **med · high · all eleven figcaptions containing "1440"; confirmed in
    `sections/the-standing-head-masthead-1440.png` (the doc spans x=194→1246 = 1052px)** — **The "· 1440"
    captions are false at every width.** `.page` is `max-width: 1100px` with 24px padding, so a mock
    captioned 1440 renders at ~1052 CSS px on a 1440 viewport and at ~342 px inside a 390 viewport (where
    `.phone` drops its frame below 700px). A caption reading `CEDAR LANE STUDY · 1440 · DOOR OPEN` sitting
    above a 342px-wide mock is worse than no caption. **Fix:** caption them "desktop" (as the §1 replica
    already does), or hide the width token below 700px with a `@media` rule, or put each desktop mock in a
    `min-width: 1392px` inner box inside the existing `.stage-scroll`.

27. **med · high · CSS lines 240-246 (`.stage-scroll`) and 243 (`.doc`)** — `.stage-scroll { overflow-x:
    auto }` is inert: the `.doc` inside it has no `min-width`, so it always shrinks to the container and the
    scroller never scrolls. The nine desktop mocks therefore reflow instead of showing their true measure,
    which is what makes finding 26 possible. **Fix:** `.stage-scroll > .doc { min-width: 1392px }` (the real
    1440 measure less the portal's margins) — then the caption is true and the scroller earns its keep.

28. **med · high · §5 `#masthead`, lines 791-792 (repeated at 816-817, 843-844) — visible in
    `sections/the-standing-head-masthead-1440.png` at y≈463 and y≈487** — **A double rule under the
    Masthead's head.** `<hr class="rule-mid">` is immediately followed by `<hr class="rule-region">` with
    nothing between them, so the reader sees two parallel rules 24px apart while the spec `dl` claims
    "exactly one hairline-strong rule under the head; the 2px region rule first fires at THE ESSENTIALS". At
    this scale the 1px and 2px rules are hard to tell apart, so the deck's central typographic claim is
    contradicted by its own render. **Fix:** delete the `rule-mid` and let the region rule do the work, or
    put the region eyebrow between them so the second rule is visibly a region opening.

29. **med · med · §4 `#carries`, line 693** — The band reprise prints `ON SCROLL · 56PX` right-flush in band
    line 1 — the slot a real band uses for money or the resolver phrase. It is an annotation living inside
    the mock's content, indistinguishable in weight and colour from the `EDNA COURTNEY · DISCOVERY` beside
    it. **Fix:** move it out to the figure's `figcaption`, or set it in `--ink-faint` with a leading `—`.

30. **low · med · §2 `#today`, lines 507-534 — `sections/the-standing-head-today-1440.png`, y≈452-551** —
    The annotation column crowds at blocks 3/4/5: the `CONSTANT` flag sits at y≈474 between markers `3`
    (452) and `4` (499), and `FABRICATED` (551) sits ~100px above the "Nothing yet" line it flags, level
    with the region rule instead. **Fix:** give `.anno` rows a `min-height` matched to their body, or point
    the flags with a short leader.

31. **low · med · §3 `#cut` and §8 `#side-by-side` at 390 — 390 shot slice 01** — Both tables have
    `min-width: 760px` / `900px` inside an `overflow-x: auto` wrapper, so at 390 only the "Block" and "Was"
    columns are visible and there is no scroll affordance — the cut list, a core deliverable, reads as
    truncated. **Fix:** add a fading right edge or a `THE TABLE SCROLLS →` caption below 700px, or restack
    the cut list as definition rows at 390.

32. **info · high · all four `*-console*.json`** — `horizontalOverflow: false`, `errors: []`,
    `warnings: []` at both widths and both themes. Dark mode is clean throughout: no dark text on a light
    ground or the reverse anywhere in the slices reviewed (1440-dark ×6, 390-dark spot-checked). **No
    action.**

## Structure and accessibility

33. **low · high · lines 1207-1240 (and 831, 1027)** — The `.phone-rail` blocks sit **outside** any
    `<figure>` and carry a `<span class="phone-cap">` instead of a `<figcaption>`. Every desktop mock is a
    proper `figure`/`figcaption`; the five 390 mocks are not. **Fix:** wrap each `.phone-rail` in a
    `<figure>` with a `<figcaption>`.

34. **low · med · lines 466 and 1461** — `<section id="top">` and `<section id="colophon">` have no
    `aria-labelledby` (every other section does) and the colophon has no heading at all, so both are
    unnamed landmarks. **Fix:** give the `<h1>` an id and point `#top` at it; make the colophon a `<footer>`
    or add an `sr-only` heading.

35. **low · med · §2 `#today`, lines 507-534** — The annotation numbers are all `aria-hidden="true"` while
    the `Constant` / `Fabricated` flags are not, so a screen reader hears two orphaned words with no number
    to attach them to. **Fix:** put the number inside the flag's accessible text
    (`<span class="sr-only">Block 3 — </span>Constant`).

36. **low · low · deck-wide** — 66 placeholder `<a class="act" href="#…">` links are in the tab order and
    every one is `preventDefault`ed by the inline script. A keyboard reader tabs through 66 dead controls
    with real-sounding labels. **Fix:** leave them (they demonstrate the focus ring, which is worth
    something) but consider `tabindex="-1"` on the mock acts and one real "skip the specimens" link per
    section.

37. **info · high · structure sweep** — Exactly one `<title>` ("The Standing Head"). Heading order is
    h1 → h2 → h3 throughout with no skips (verified by extracting every heading tag in document order).
    Every `<section>` has an `id` and a `data-prose-cap`. Thirteen `<figure>` elements, thirteen
    `<figcaption>` elements. Both tables sit inside `overflow-x: auto` wrappers. The only external loads are
    `fonts.googleapis.com` and `fonts.gstatic.com`. **No action.**

## Copy

38. **med · high · deck-wide** — **Four dates print in two forms each.** `6 September` ×4 and
    `6 September 2026` ×1; `2 September` ×2 and `2 September 2026` ×1; `12 August` ×4 and `12 August 2026`
    ×1; `14 November` ×1 and `14 November 2026` ×1. V9 P2 mandates one date style ("11 September 2026") and
    the deck's own §1 argument rests on the head telling the truth in one voice. (The synthesis carries the
    same inconsistency, so this is inherited, not invented.) **Fix:** pick the long form for every date that
    prints in a head, and say so once in a spec `dd`; or rule the short form and use it everywhere.

39. **low · high · line 1078 ("in favour of") and line 1463 ("a practising designer")** — Two British
    spellings in an otherwise US-spelled deck ("Honors" ×3, "favor" in the synthesis, "practicing" in the
    brief). **Fix:** `favor`, `practicing`.

40. **info · high · copy sweep** — No typos found. `Kody` is spelled correctly (line 1345, "Rulings for
    Kody"). The forbidden word "AI" appears nowhere. "Dashboard" appears nowhere — though note the deck
    *drops* the synthesis's sharpest line about it ("a dashboard with one widget", A4) in favour of "It
    encodes no quantity — the length is grid arithmetic"; the replacement is accurate but less damning, and
    Kody's brief calls dashboards a non-license. Consider restoring it. Every `&mdash;` in the deck is
    spaced (` — `); no unspaced em-dashes exist. **No action beyond the optional restore.**

## The "today" replica

41. **info · high · §2 `#today`, lines 486-578** — The replica matches the brief's eight blocks in order and
    in copy: (1) glyph + `Edna Courtney` at 64 + `Edna Courtney · In discovery` + hairline; (2) `Finish what
    you need to know` at 20 + `ADD PROJECT TYPE AND NAMED ROOMS` double-scored + `+2 MORE`; (3)
    `DISCOVERY & PROGRAMMING · CORE · STAGE 02`; (4) the ~40% bar + `CORE · 02`; (5) 2px rule + `IN PROGRESS`
    + `Discovery` at 34 + `Nothing yet`; (6) the rail-ground band with glyph + `WORKING WITH EDNA COURTNEY`
    + `3 of 5 essentials captured — keep going` + `BEGIN THE DIRECTION`; (7) the three tools + `MOVE BACK TO
    NEW LEAD` + `This client's own details have been filled in.`; (8) the essentials eyebrow with its leader
    rule + `Scope & rooms … NOT YET ▸`. The six numbered "where" statements are the right six (blocks 1-6,
    with 7 and 8 correctly unnumbered), and the two flags land on the right two — block 3's stage line
    (`Constant`) and block 5's `Nothing yet` (`Fabricated`). **No action** except findings 4, 9 and 30 above.

42. **low · med · §2 `#today`, figcaption line 486** — The caption reads "… · **desktop** · name at 64,
    R126 rules 40" and stays "desktop" when the page is viewed at 390 (390 shot, slice 00), where the mock
    renders at ~342px and the 64px name wraps to two lines. Same class of problem as finding 26, but here
    the caption is at least describing the *source* screenshot rather than the render. **Fix:** "the
    screenshot Kody sent · desktop".

## Verified against code (no action — recorded so Fable can rely on them)

43. **info · high · §10 `#found`** — Every defect claim checks out in this worktree. D1: `act: guideAct`
    is one shared object built inside `guideInputs.map(...)` at `page.tsx` ~2145. D3: `--oak` (#8B7355) on
    `--paper-doc` computes to **4.30:1** and on `--paper` to **4.20:1**, exactly as claimed. D4/D5:
    `doc-letterhead.tsx` line 78 is
    `text-[32px] … tracking-[-0.015em]` and the vitals below carry `overflow-hidden text-ellipsis
    whitespace-nowrap`. D6: `lens-ladder-derivation.ts:556-561` is
    `case 'brief': case 'discovery': case 'direction': return empty('Nothing yet')`. The A3 inversion is
    real: `SECTION_STAGE` maps `direction → concept_schematic` (05) and `proposal → scope_engagement` (03).

44. **low · med · §10 `#found`, all seven `p.where` lines** — The paths omit the `apps/designer-portal/`
    prefix, so none is copy-pasteable, and D2's is an elision — `src/components/document/…/region-head.tsx`.
    The real file is `apps/designer-portal/src/components/document/region/region-head.tsx`. **Fix:** print
    full repo-relative paths; D2's ellipsis in particular will send someone hunting.

## Housekeeping

45. **low · med · `<body data-prose-total="1200">` vs the eleven `data-prose-cap` values** — The caps sum to
    **1240**, not 1200. Separately, counting only narrative prose (mocks, tables and phone rails excluded),
    five sections exceed their own cap: `carries` 104/90, `masthead` 234/120, `band` 249/120, `paragraph`
    264/120, `rulings` 358/320. The bulk of the overrun is the `spec` `dl` and the Honors/Departs pair in
    each direction. The source deck (`three-cards-for-the-desk.html`) carries no prose-cap attributes at
    all, so I cannot verify the convention's contract — flagged on arithmetic alone. **Fix:** raise the caps
    to the actual counts and the total to their sum, or trim the direction spec blocks.

46. **low · low · §8 line 1268 vs §5/6/7** — The section counter runs "Section one · two · three ·
    **Direction one · two · three** · Section four · five · six", so a reader tracking "Section three" jumps
    three screens to reach "Section four". Deliberate, but it makes the deck hard to reference in a meeting.
    **Fix:** number the directions "Section four / five / six" with the direction name as the h2, or drop
    the counter on the directions.

47. **low · low · §8 `#side-by-side`, "Lines before first content" row, The Band cell** — The cell claims
    "**3** (+ caption)", but every Band mock is rendered with the door **open**, which puts a door head plus
    two rows — four more lines — between the band and the first content region. The number and the picture
    disagree on the same page. **Fix:** render one Band mock with the door closed, or caption the number
    "3 with the door closed".

---

## Verdict

**Ship after the listed high items.** This is a careful, honest deck: the token block is byte-identical to
the house source, both theme blocks are complete and correctly guarded, contrast passes everywhere except
the one failure it is deliberately exhibiting, there is not a single `box-shadow`, badge, status dot, ✓
glyph, tab bar or red/green pairing in it, the word "AI" and the word "dashboard" never appear, the eight-block
replica of today's head matches the brief line for line with the right two lines flagged, and every one of
the seven defects in §6 checks out against the code in this worktree — including the arithmetic in D3, which
I recomputed. What stops it shipping as-is is four things that would actively mislead the ruling it exists to
support: Direction 3 prints on every frame the vocabulary its thesis says it removes (1); Direction 2 prints
`$212,000` in the band it calls the head while claiming R140 is untouched (2); the silent region head renders
as an empty band and an empty heading in four places (24); and no direction shows its Project head at 390 (25),
which is precisely where the long resolver phrase and the money line will break. Fix those four, take the
cheap wins on the date forms (38), the double rule (28) and the false "1440" captions (26-27), and this is
ready for Kody.
