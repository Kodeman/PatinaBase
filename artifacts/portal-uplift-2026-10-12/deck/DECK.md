# US-27 W5 · The Portal Uplift: the founders' deck (SQ-811)

A 30-sheet HTML presentation for the founding partners. It carries Direction A from the Desk across the designer portal's nine areas. Every area has before and after at 1440 and 390: walk screenshots for Today, live specimen frames for Proposed. It ends on twenty founder questions, and each one has ruling fields.

- `src/index.html` is the source deck. Edit this file.
- `build.mjs` builds the source into `index.html`, one self-contained page. **Do not edit `index.html` by hand.**
- Build with `node artifacts/portal-uplift-2026-10-12/deck/build.mjs`. The pinned verifier adds `&& node artifacts/portal-uplift-2026-10-12/specimens/check.mjs`.
- Built size at commit: **6,581,016 bytes (6.28 MB)**, under the 16 MB limit. 37 walk screenshots are inlined once each across 41 uses, and the page holds 49 specimen frames.

## What the build checks (it fails on any miss)

- **Frames.** Every proposed and dark frame in `specimens/SPEC.md` §1 and §2.1 is shown exactly once. It must be an `<iframe sandbox="allow-scripts" name="frame-<slug>-<kind><n>" srcdoc="{{SPECIMEN_<SLUG>_<W>}}">`. Each token appears once per frame of its file. Every today frame's screenshot appears as a `{{WALK:<file>}}` image.
- **No shadows.** None in the deck CSS and none in any specimen.
- **Colours.** No colour literal outside a `--` token declaration, in the deck CSS or in inline styles.
- **Wording.** The word "AI" never appears in the copy.
- **ASCII.** Script and style are ASCII only. Non-ASCII in the markup becomes numeric entities.
- **Network.** Only Google Fonts hosts are reached, and there are no protocol-relative URLs.
- **Inlining.** The number of data URIs equals the number of unique screenshots.
- **Size.** The page is 16 MB or less.

## Page contract

- `<title>The Portal Uplift</title>`.
- Every colour is a token on `:root`. Dark mode redefines the tokens under `@media (prefers-color-scheme: dark) :root:not([data-theme="light"])` and again under `:root[data-theme="dark"]`. The body has an explicit background.
- No `box-shadow`. External loads are Google Fonts only.
- The page works at 390 with no horizontal scroll, and every target is 44 px.
- The source is a fragment, like US-26's. The Artifact host adds the document skeleton.

## Walk screenshots and the specimen frames (orchestrator notes 2 and 3)

There are two constraints:

- Each `walk/*.jpg` is inlined **once** as a data URI.
- The specimens run as sandboxed `srcdoc` frames (`allow-scripts` only, so each frame has an opaque origin). They cannot reach the deck's images directly.

The build reconciles the two:

1. In each specimen body it renames `<img src="../walk/x.jpg">` to `data-walk-src="x.jpg"`. No image bytes go into any `srcdoc`.
2. The deck's first `<img>` for a file carries the data URI, and later uses carry only `data-walk`. The deck script copies the `src` across.
3. A bootstrap is injected into every frame. It reads the frame id from `window.name` and sets `#<frame-id>&nobar`. It hides the specimen chrome and the "proposed measured at render" marks lines. It posts `{deckSpecH}` so the frame shows at full height. For any walk image visible in its frame, it posts `{deckWalk:[names]}`.
4. The deck answers `{deckWalkData:{name:dataURI}}` only for names it holds, and sends that answer only to the asking frame.
5. A height posted before the deck's listener existed would be lost. The deck therefore sends every frame `{deckAsk:1}` once it is listening, and again on each frame's `load`. The frame then re-sends.

The proposed and dark frames show no Today image. In practice the bridge therefore carries nothing, but it stays correct if a frame ever does show one. The render check exercised the bridge directly: it returned the data URI for a held name and dropped an unknown one.

## Marks

Today figures print the walk's measured marks (`text · controls · colour · edges`, WALK §0) where the walk counted that view. The 390 views and some sheets were not counted separately, and they print no marks. **The proposed frames' marks are not yet measured.** The specimens say "proposed measured at render", and the deck hides those lines rather than show a placeholder count. The render pass owes them.

## Founder rulings

Sheet 30 has twenty `fieldset.ruling[data-q="u-qN"]` blocks, each with a choice of Accept or Decline and an optional note.

- **Drafts.** Each draft saves to `localStorage` under `us27-uplift-ruling-u-qN` as `{v, note}`. Every read and write sits in a try/catch, so the fields work without storage.
- **What the deck tells founders.** It says plainly that the drafts stay in this browser only and do not reach anyone, and that they should press **Copy my rulings** and send the text to Kody.
- **When the clipboard is blocked.** The text appears, selected, in a read-only box.

## Sheets

| # | id | Sheet | Source | Frames |
|---|---|---|---|---|
| 01 | s-cover | Cover, how to read, the arc | BRIEF | none |
| 02 | s-ask | Kody's ask, verbatim | BRIEF §1 | none |
| 03 | s-ruled | What V19 ruled | VISION-DECISIONS V19 | none |
| 04 | s-today | The portal today: patterns, broken at 390, marks | WALK | 4 walk shots |
| 05 | s-principle | The four moves, the card test, the depth ladder (light and dark), stage pigments | uplift (a), (b) | none |
| 06 | s-system | Seven components, the resolved seat splits, what stays different | uplift (b) | none |
| 07 | s-tokens | New tokens and the shadow evidence (U-Q12) | uplift (b) | none |
| 08 | s-areas | The nine areas with routes, change, filled act, effort and rulings | uplift (c) | none |
| 09–12 | s-desk … s-desk-dark | Area 1, the Desk: rest, acting, through the day, dark | uplift (c), (d) | desk t1/p1, t2/p7; p2, p3; p4, p5, p6, p8; d1, d2 |
| 13–14 | s-doc, s-doc-spec | Area 2, the Document and the spec book | uplift (c) | document t1/p1, t2/p2, t4/p4; t3/p3, t5/p5, d1 |
| 15 | s-rooms | Area 3, Rooms | uplift (c) | rooms t1/p1, t2/p2, t3/p3 |
| 16 | s-people | Area 4, People | uplift (c) | people t1/p1, t2/p2, t3/p3 |
| 17 | s-library | Area 5, Library | uplift (c) | library t1/p1, t2/p2, t3/p3 |
| 18–19 | s-boards, s-boardroom | Area 6, Boards and the board room | uplift (c) | boards t1/p1, t2/p2; t3/p3, t4/p4 |
| 20–21 | s-papers, s-ceremony | Area 7, Making papers | uplift (c) | papers t1/p1, p2, t3/p4; t2/p3, t4/p5 |
| 22–23 | s-money, s-money-acts | Area 8, Money | uplift (c) | money t1/p1, t2/p2, t5/p6, t6/p7; p3, t3/p4, t4/p5, d1 |
| 24–25 | s-chrome, s-chrome-pages | Area 9, Shared chrome | uplift (c) | chrome t1/p1, t2/p2, t6/p6, t7/p7; t3/p3, t4/p4, t5/p5 |
| 26 | s-desk-build | The Desk tree, new files, data changes 1–8 | uplift (d) | none |
| 27 | s-desk-rule | The top-five rule, x4/x6 corrected, states, S0 F1–F8 | uplift (d), (f) | none |
| 28 | s-house | House-sheet amendments G-1 to G-13 | uplift (e) | none |
| 29 | s-slices | Slices S0 to S12 | uplift (f) | none |
| 30 | s-questions | Twenty founder questions, groups A to D, with ruling fields | uplift (g) | none |

Each area's first sheet opens with:

- the moments the area serves;
- Today, Proposed, Components, Filled act and Effort, plus Risk where the uplift names one;
- the founder questions it rests on.

Captions for the proposed frames are each specimen's own frame caption. Today captions and alt texts come from the specimens' today frames.

## Render check

The render check is a headless Chromium run at 1440×900 and 390×844 on the built page, with the host's doctype and viewport added. It walked all 30 sheets. Results at both widths:

- The document and the deck are exactly as wide as the viewport, and no element runs past it.
- All 49 frames have `sandbox="allow-scripts"` and the right `#frame&nobar` hash, and all 49 settled at their posted height.
- All 41 images loaded.
- Zero computed shadows in the deck and in every frame.
- No console errors, and no requests beyond `data:`, `file:` and Google Fonts.
- Ruling drafts survived a reload. Copy produced the text, falling back to the selected box.

The evidence is outside the repo, in `~/.claude/sidequest/projects/patina-merged-5f06cee3/verification/SQ-811/`: `render.json`, plus sheet screenshots at both widths.
