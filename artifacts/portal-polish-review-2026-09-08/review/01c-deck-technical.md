# Adversarial review — the deck's technical build

**Target:** `deck/index.html` ("Paper, Polished", 18 sheets, scroll-snap, three
`<iframe srcdoc>` live specimens on sheets 14–16).
**Reviewer:** fresh context, technical lens only (rendering, DOM, keyboard,
network, static CSS/HTML checks, code citations). Content/copy fidelity
against the synthesis and panel narrative is covered in `01d-deck-content.md`;
specimen-internal design is covered in `01a`/`01b`. I did not build this deck
and took nothing from any builder's report on trust — every finding below was
re-derived from a fresh render, a fresh Playwright script, or a fresh read of
the cited file.

**Method.** Read `tools/README.md` and `specimens/SPEC.md` §A. Re-rendered the
deck myself into `$TMPDIR/deck-review/` (actual path resolved to
`/var/folders/.../T/deck-review/` — see note under Environment below):
all 18 slides × {1440, 390} viewport-only; all 18 × 1440 full-page; sheets
1/6/9/12/14/17 × 1440 dark; sheets 12/14 × 1440 reduced-motion. Wrote five
throwaway Playwright scripts (in the scratchpad) for keyboard nav, deep
links, tab order/focus-visible (incl. inside the iframes via
`frame.contentFrame()`), the reveal system's actual timing, the three
specimens' meta-strip switchers, network requests, and load timing. Ran a
Python static-analysis pass over the raw HTML (iframe `srcdoc` payloads
regex-isolated and unescaped separately from the shell) for box-shadow,
text-overflow, ✓, inline `font-size`, hex literals outside token blocks,
heading order, alt text, figure captions, duplicate ids, and a byte-for-byte
diff of each `srcdoc` against the live `specimens/*.html`. Opened 40+ PNGs
(full-resolution crops, not just thumbnails) to hunt the suspected
hint/counter overlap. Checked 16 `file:line` code citations against the repo
and 20+ panel-ID citations against `panel/*.md`.

**Environment note.** On this Mac, Chromium fails inside the Bash sandbox
with `MachPortRendezvousServer: Permission denied`, exactly as
`tools/README.md` warns — reproduced once, then every render/Playwright call
in this review ran with the sandbox disabled. Doing so also changes
`$TMPDIR` (sandboxed: `/tmp/claude-501`; unsandboxed: a `/var/folders/...`
path) — files written by an unsandboxed `render.mjs` call land in the
**unsandboxed** `$TMPDIR`, not the one named in the task. All paths below are
the real, unsandboxed ones.

**Headline judgment.** The deck's engineering is unusually solid — zero
console errors or warnings across 62 captures, zero horizontal overflow,
fully working keyboard nav and deep links, all three embedded specimens are
byte-identical to their current source files and fully interactive inside
their sandboxed iframes, and fifteen of sixteen code citations I opened point
exactly where they claim. It has one real, reproducible visual bug — the
task's own suspicion was correct in kind, wrong in detail: the fixed
bottom corner chrome (`#hint` and `#chrome`) genuinely overlaps and hides
in-flow text, but on sheets **8, 11, 14, 16** in my renders (not 6, which
rendered clean), on **both** desktop and mobile, on **both** the left
(`#hint`) and right (`#chrome`) corners depending on the sheet. It also has
one broken citation (`room-band.tsx:26-30`, which is prose comment, not the
code it's cited for) and one citation that traces to nothing (`DECISIONS.md
:3775`), plus a scroll-reveal animation that a one-shot global timer quietly
disables for the whole deck about 1.2 seconds after load.

---

## Findings

`ID | severity | confidence | sheet | claim | evidence | fix`

### A · The fixed-chrome overlap (the single biggest finding)

**T01 | P1 | high | 8, 11 (1440) | The fixed bottom-right `#chrome` (counter + prev/next) renders on top of and hides in-flow text.** On sheet 8, the counter chip `08 / 18` sits directly over the word "signed" in "...a signe[d]" (BE-26's invoice entry). On sheet 11, the chip `11 / 18` sits over "[o]ne family for money: DM Mono tabular figures..." — the leading "o" is hidden behind the chip. | Full-resolution crops of `deck-viewport-slide-8-1440.png` and `deck-viewport-slide-11-1440.png` (bottom-right 500×260px). Reproduced by direct pixel inspection, not inference — the characters are visibly cut by the chip's opaque background. | `#chrome` is `position: fixed`, so it floats over whatever content happens to land at that screen position when a sheet's rendered height exceeds/approaches the 900px viewport. Reserve real clearance: either give `#deck` a `scroll-padding-bottom` sized to the chrome's footprint so scroll-snap never rests with content under it, or give every `.slide` a bottom "safe zone" the layout can't fill (a `min-height` calc that accounts for chrome height, or simply audit each sheet's copy length against 900px and trim).

**T02 | P1 | high | 14, 16 (1440) | The fixed bottom-left `#hint` ("← → OR SPACE TO NAVIGATE") renders on top of and hides in-flow text — this is the overlap the task suspected, just on different sheets than named.** Sheet 14: the annotation row "ROOMS AS A SENTENCE · IA-31, IX-41, VC-..." and its body text run behind the hint pill, truncating both the id list and the first line of prose. Sheet 16: "...[a] stamp, a subject, an authorization number, the / parties, a date..." (the "THE RECORD" entry) wraps with its first word hidden behind the pill. | Full-resolution crops of `deck-viewport-slide-14-1440.png` and `deck-viewport-slide-16-1440.png` (bottom-left 480×230px). | Same fix as T01 — this is one bug (fixed chrome vs. variable content height), not two; it happens to show on the left corner on some sheets and the right on others depending on which column of a `.cols-2`/`.cols-3` grid runs long. Sheet 6 — the task's other named suspect — rendered clean in this pass (see "Verified OK"); the bug is real but its exact set of affected sheets is sensitive to render conditions (font metrics / exact content), so don't treat "6 and 14" or "8, 11, 14, 16" as a closed list — re-check every sheet after any copy edit.

**T03 | P2 | high | 9 (390) | The same overlap reproduces at mobile width, not just 1440.** The counter chip `09 / 18` sits over "hidden outright a[nd its six]..." in the story-pole finding row (this is the row that also carries the wrong `room-band.tsx:26-30` citation — see T-C1). | Full-resolution crop of `deck-viewport-slide-9-390.png` bottom-right. `#hint` correctly `display:none`s at ≤760px per its media query, but `#chrome` does not, and it collides here. | Same fix as T01, verified at both breakpoints before calling it fixed.

**T04 | P3 | low | 3 (390) | Not a true overlap, but the chrome sits close enough to a swatch's hex label to read as one.** `#A47836` (the "Material ochre" swatch label) ends immediately beside the `03 / 18` chip. No characters are hidden here, unlike T01–T03. | Full-resolution crop of `deck-viewport-slide-3-390.png` bottom-right. | Give the fixed chrome a minimum clearance margin from in-flow content (e.g. an opaque scrim a few px wider than the visible pill) so a near-miss doesn't read as a collision even when it technically isn't cutting characters.

### B · Citations that don't hold up

**T05 | P1 | high | 9 | `room-band.tsx:26-30` does not support the claim it's cited for.** The claim: "Empty rooms render as outlined ~370×25px rectangles holding a 9px room name — Hall and Stair." Lines 26–30 of that file are prose comment ("THE DRAWING IS GENERATED, NOT ILLUSTRATED. Nothing about the room's real geometry reaches the client portal...") — no rectangle, no room name, no font size. The actual empty-room render (the `feet.length === 0` branch, with the `<rect>` and the `<text fontSize={FOOT_TYPE}>{roomName}</text>`) is at **lines 134–157** (`<rect>` at 145, `<text>`/`fontSize` at 146–155). | `sed -n '26,30p'` vs `sed -n '134,157p'` of `apps/client-portal/src/components/threshold/room-band.tsx`, confirmed with `cat -n`. | Repoint the citation to `room-band.tsx:134-157` (or tighten to `:145,151` for the rect/fontSize lines specifically, matching how the deck cites the same file elsewhere at `:53,70,230`).

**T06 | P1 | high | 17 | `DECISIONS.md:3775` (cited for "Photographs only for installed work; the label floor on drawn geometry") traces to nothing.** There are two `DECISIONS.md`-named files in the repo. `docs/vision/VISION-DECISIONS.md` is only 138 lines — line 3775 doesn't exist. `docs/design/the-document/DECISIONS.md` is 10,757 lines and line 3775 *does* exist, but it's mid-paragraph about Room View / RoomPlan scan geometry ("parametric re-render, Patina's hand") — unrelated to photographs or label floors; a repo-wide grep for the claim's own language ("label floor", "eleven-pixel", "installed work", "Photographs only") returns nothing in either file. | `wc -l` both files; `sed -n '3770,3780p'` both; `grep -rn` the claim phrases across both `DECISIONS.md` files. | This citation appears to be inherited: `panel/visual-craft-designer.md`'s **VC-40** entry (a *different* claim, about captioning a generated room "your home") carries `touches: DECISIONS.md:3775` — itself unverifiable by the same test — and the deck's sheet 17 "rulings a change would touch" list reuses that exact `DECISIONS.md:3775` string for an unrelated ruling. Either find and cite the real ruling for the photograph-hierarchy/label-floor rule, or drop the `touches:` reference; don't carry forward an already-broken citation into a new context.

### C · The scroll-reveal system

**T07 | P2 | high | all (mechanism-level; visible on any sheet reached more than ~1.2s after load) | The one-shot global safety-net timer effectively disables the scroll-triggered fade-in for the entire deck, not just for the sheet it's supposedly protecting.** `window.setTimeout(() => slides.forEach(s => s.classList.add('seen')), 1200)` runs once, 1.2 seconds after the script starts — not per-slide, not on first-intersection. Measured directly: with **zero scrolling**, at t=1500ms after `page.goto()`, every one of the 18 `.slide` elements already carries the `seen` class (`opacity:1`, `transform:none`) — before a viewer could plausibly have scrolled past the cover. | Playwright: loaded the deck fresh, waited 1500ms with no interaction, evaluated `slides.map(s => s.classList.contains('seen'))` → `[true×18]`. Separately, to confirm the fade genuinely starts hidden: jumped `#deck.scrollTop` straight to the bottom then straight back to 0 (simulating "scroll past quickly and back"), and at t=250ms (*before* the 1200ms timer) sheet 9's first `.main` child measured `opacity:0`, `transform:matrix(1,0,0,1,0,6)` and `slide.classList.contains('seen') === false` — so the per-slide IntersectionObserver genuinely hadn't caught it yet at that point. | This technically satisfies the letter of "nothing stays permanently invisible" — the blunt timeout guarantees recovery — but it means the deck's own reveal design (`opacity 0→1`, staggered per child, `.42s` ease) is only ever demonstrated during the first ~1.2 seconds of a page load, i.e. essentially never for a real viewer. Either remove the global timer and trust the `IntersectionObserver` (which already re-arms itself correctly — see "Verified OK"), or make the safety net a **per-slide** bounded timeout keyed to that slide's own first intersection, not a single deck-wide one-shot.

### D · Load, lazy-loading, network

**T08 | P3 | med | 14–16 (mechanism) | `loading="lazy"` on the three specimen `srcdoc` iframes doesn't defer anything measurable in this environment.** All three iframes' `contentDocument` bodies are fully populated, and their independent Google-Fonts sub-requests fire at t≈68–70ms — essentially simultaneous with the main document's own font requests at t=28ms — well before any scroll toward sheets 14–16 (which sit ~11,000px down a document that is 18,103px tall). | Playwright network trace with per-request timestamps (`page.on('request', ...)`) plus a direct read of `iframe.contentDocument.body.children.length` immediately after `load`, before any scroll. | Present as informational: the markup is honest (`loading="lazy"` is really there) but functionally inert for `srcdoc` iframes on a `file://` document in headless Chromium, so don't rely on it to keep the ~430KB of embedded specimen HTML off the critical path. If deferring that weight matters (e.g. once this is hosted rather than opened as a local file), re-measure under real network conditions rather than trusting the attribute.

**T09 | P3 | low | 14–16 | Each embedded specimen re-requests the shared Google Fonts stylesheet and its `woff2` files independently.** 4 total `<link>`-driven CSS fetches (1 main + 3 iframes) and roughly 2× the `woff2` file requests of the main document alone, because each `srcdoc` iframe is a separate browsing context with its own `<link>` and its own cache partition behavior in this trace. | Same network trace as T08 — `frame: 'sub'` entries duplicate every `frame: 'main'` font URL. | Not a real user-facing problem (unavoidable without sharing an origin, which `srcdoc` + `sandbox="allow-scripts allow-same-origin"` mostly already grants — browsers commonly dedupe identical cross-frame requests from HTTP cache in practice); flagged only because the task asked for a full request inventory.

**T10 | P3 | low | deck-wide (dead code) | Dark-mode *manual override* tokens (`:root[data-theme="dark"]`, and the `:root:not([data-theme="light"])` guard on the `prefers-color-scheme` block) are fully defined in the stylesheet but unreachable.** Nothing in the deck's `<script>` or markup ever sets `data-theme` on any element — there is no visible toggle. Only the OS-level `prefers-color-scheme` path is exercised (which is what my `--dark` renders used, and it works correctly — see "Verified OK"). | `grep -n 'data-theme'` over the shell's script block: zero matches outside the CSS itself. | Not a functional bug — dark mode renders correctly via the OS path — but if a manual light/dark toggle was intended (the CSS clearly anticipates one), it was never wired up. Either add the toggle control or drop the `data-theme` selectors as unused.

### E · A moving target worth flagging, not chasing

**T11 | — | high | n/a | `specimens/SPEC.md` was amended on disk partway through this review.** A new line ("Amended after review 01 — see §F...") and several inline "(amended §F-X)" markers appeared (e.g. `.t-money` changed from `font-family: var(--font-meta); font-size: 12px` to "DM Mono, 15px / 1.5"), but the file (884 lines) contains no actual `# §F` section body to read the amendments from — only the inline forward-references. | Noticed via the system's own file-changed notice; confirmed by grepping `§F` (7 inline hits, no heading) and diffing line counts (817→884). | This review evaluated the deck against §A as read at task start, which is what the deck was built against and what the task asked me to check it against. Flagging because if §F really does move `.t-money` to 15px, the deck's own `.t-money` class (`index.html:149`, currently `font-size: 12px`) and its **live, hand-authored** specimens on sheets 11–13 (not the embedded iframes — those already match `specimens/*.html` byte-for-byte, see "Verified OK") would need a follow-up pass once §F actually has a readable body.

---

## Verified OK

- **Console / overflow**, all 62 captures (`deck-viewport` ×36, `deck-full` ×18, `deck-dark` ×6, `deck-rm` ×2): zero `errors`, zero `warnings`, `horizontalOverflow: false` throughout, including every 390px capture.
- **Keyboard nav**: `ArrowRight`/`ArrowLeft`, `PageDown`/`PageUp`, `Space`/`Shift+Space`, `Home`/`End` each move exactly one sheet (or to the first/last) and correctly update `#counter` text and `#progress` width.
- **Deep links**: `#slide-9` and `#slide-17` land on the correct sheet at first paint (no flash of sheet 1).
- **Tab reachability + focus-visible**: `Tab` reaches `#prev`/`#next` from both a late-deck start (`#slide-18`, 2 tabs) and an iframe-heavy start (`#slide-14`, 102 tabs — expected, since sheets 14–16's three specimens together carry ~99 of their own focusable elements before `#chrome`). Focus-visible renders as a solid 2px ring both on the outer chrome buttons and on every `.act` inside each sandboxed iframe (confirmed via `iframe.contentFrame().activeElement` computed style, not just the outer `<iframe>` element).
- **`prefers-reduced-motion: reduce`**: confirmed the whole reveal system is neutralized (`opacity:1`, `transform:none`, `transitionDuration≈0.00001s`) on first paint, before any scroll — matches SPEC §A11 verbatim.
- **IntersectionObserver reveal (baseline mechanism)**: works correctly on its own terms — re-arms per slide, adds `seen` and never removes it; the only issue is the global timer in T07, not the observer itself.
- **`.spec-wrap` never animated**: confirmed the deck's own comment/rule (`.slide .main > .spec-wrap { opacity:1; transform:none; transition:none; }`) is present and correctly exempts the three iframes from the reveal transform, avoiding the Chromium rasterization bug the deck's own comment names.
- **Iframe interactivity**: all three specimens' meta-strip switchers work when clicked via `frame()`: Specimen 1 — Default/Quiet day/After acceptance (`aria-pressed` toggles correctly each time); Specimen 2 — 16 jobs/43 jobs, plus the in-page roster facets `#facet-needsme`/`#facet-byperson` (these are *not* in the outside `.specimen-meta .switcher` — they're in-page controls per the specimen's own roster-head block — SPEC's table heading groups them under "meta-strip switcher" loosely, worth a wording fix in SPEC.md but not a deck or specimen bug); Specimen 3 — Default/Noted/Accepted/Save failed.
- **`srcdoc` fidelity**: all three embedded payloads are byte-for-byte identical, after HTML-unescaping, to the current `specimens/client-house.html`, `specimens/designer-desk.html`, `specimens/decision-moment.html` (compared with a Python diff, not eyeballed) — no stale embed.
- **Static CSS/HTML checks** (shell only, iframe `srcdoc` payloads excluded from these counts since they're separately-versioned files): `box-shadow` 0, `text-overflow` 0, `✓` 0, inline `style="...font-size:..."` 0.
- **Hex literals outside `:root`**: only `#1F1D1A` (pre-cleared by the task, inside `.act--terminal:hover`) and the six values inside `.quoted-tokens` (lines 117–122) — a clearly commented, explicitly slide-3-scoped block quoting the *outside proposal's own* foreign palette for comparison, not an undocumented stray literal.
- **Fonts**: the `<link>` URL matches SPEC §A2 verbatim (Playfair 400/500/italic-400, Inter 400/500/600, DM Mono 400/500); the deck's own `<style>` block only ever declares `font-weight: 400` or `500` — no 600/700, no synthesized bold anywhere, and every `<th>`/`<b>` carries an explicit class resetting the UA-bold default to a loaded weight (`.t-head` → 500; `#counter b` → 500).
- **Exactly one `<h1>`** (sheet 1); all 17 remaining sheets use exactly one `<h2>` each; no skipped heading levels; no `<h3>` needed or present in the shell.
- **Images/captions**: all 13 `<img>` elements carry non-empty, descriptive `alt` text; all 16 `<figure>` elements have a `<figcaption>` naming a real source file (`shots/...` or `specimens/...`); every one of those cited files exists on disk.
- **No duplicate `id` attributes** in the shell document (27 ids, all unique).
- **`lang="en"`** on `<html>`; `<title>Paper, Polished</title>` present well inside the first 8KB.
- **Load/size**: file is 1,709,000 bytes (~1.7MB, mostly the three embedded specimens plus ~15 base64 JPEG plates); `load` fired at ~419ms and first paint/FCP at ~228ms in a local headless run (not representative of a cold real-network load, given everything is `file://`).
- **Network**: only `fonts.googleapis.com` and `fonts.gstatic.com` are ever requested (plus the `file://` document itself) — confirmed with a full request trace, no other external host.
- **Dark mode** (sheets 1, 6, 9, 12, 14, 17 spot-checked): good contrast throughout; hairlines render at their specified low alpha and stay visible; `.act--terminal` correctly inverts to a light-filled/dark-text button exactly as the deck's own CSS comment promises (both tokens flip); the focus ring's `--clay-ink` correctly lifts to its lighter dark-mode value; the live specimen iframe on sheet 14 correctly follows the OS dark preference into its own document, matching the surrounding deck rather than clashing with it.
- **Citations — file:line** (16 clusters checked, well beyond the requested 12): `story-pole.tsx:88-89,153-176,233`; `doorstep.tsx:83-90`; `command-bar.tsx:1074-1095`; `room-band.tsx:53,70,230`; `plan-key.tsx:24-35`; `wall-gate.tsx:279`; `scored-action.tsx:601-612,:288`; `tracking-row.tsx:187,210`; `mat.tsx:16-18`; `globals.css:690-701,409-428` (both correctly in `apps/designer-portal/src/app/globals.css`, disambiguated from the two other same-named files in the monorepo) plus `desk-roster.tsx:110`; `eslint.config.mjs:83-101` (resolves correctly to `apps/designer-portal/eslint.config.mjs`, the only one of three same-named files whose content — a `D4`-labeled `no-restricted-syntax` rule banning `shadow-*`/`box-shadow` — actually matches). All fifteen of these hold real, on-point code; only `room-band.tsx:26-30` (T05) is wrong.
- **Citations — panel IDs** (20+ checked against `panel/*.md`, well beyond the requested 12): `IX12`, `N1`, `N10`, `VC-40`, `IX42`, `IA-17`, `A23`, `C15`, `C01`, `BE-01`, `BE-02`, `BE-23`, `BE-30`, `BE-09`, `A01`, `A12`, `A13`, `A16`, `A30`, `A31`, `A36`, `A37`, `A48` all trace to real findings in the matching panel file with accurate paraphrase and matching evidence.
- **Nothing placeholder**: no `TODO`/`FIXME`/`Lorem ipsum` anywhere; the only two "placeholder" hits in the whole file are the deck correctly *quoting* the shipped portal's own placeholder-imagery finding (sheet 9), not placeholder content in the deck itself.

---

## Top five findings

1. **T01/T02/T03 — fixed-chrome overlap is real and worse than suspected**: confirmed on sheets 8, 11 (right/`#chrome`, 1440), 14, 16 (left/`#hint`, 1440), and 9 (right/`#chrome`, 390) — characters genuinely hidden behind the pills, not just crowded.
2. **T06 — `DECISIONS.md:3775` traces to nothing** in either candidate file, and appears inherited from an already-broken citation in `panel/visual-craft-designer.md` (VC-40), then repurposed for an unrelated ruling on sheet 17.
3. **T05 — `room-band.tsx:26-30` is the wrong line range** for its claim; the real empty-room-rectangle code is at lines 134-157.
4. **T07 — the scroll-reveal fade-in is globally disabled ~1.2s after load** by a one-shot timer, not a per-slide mechanism, so the deck's own reveal design is only ever demonstrated in the first ~1.2 seconds of a session.
5. **Everything else checked out unusually well**: zero console errors/warnings across 62 captures, all keyboard/deep-link/focus behavior correct, all three `srcdoc` embeds byte-identical to their source files and fully interactive, and 35 of 37 code/panel citations opened held up exactly.

Full findings, evidence, and the "Verified OK" list are in
`/Users/kody/Code/patina-merged/artifacts/portal-polish-review-2026-09-08/review/01c-deck-technical.md`.
