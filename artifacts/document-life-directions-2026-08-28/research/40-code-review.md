# 10 — Adversarial code review

`document-life/integration` (`1b93def1a`) vs `origin/main` (`21c1f613`) · reviewed 2026-08-28
Spec of record: `artifacts/document-life-directions-2026-08-28/mock/final/FINAL.md` §1–§2
Canon: `apps/designer-portal/CLAUDE.md` (D1, D4 as amended by R126), `eslint.config.mjs:67–140`, `patina-portal-features`

Reviewer wrote none of this code. Read-only pass over the branch, the worktree at
`.codex/worktrees/agent-life-integration`, and the shipped gates.

---

## Verdict

| ship | ship-after-fixes | do-not-ship |
|---|---|---|
| | **✔ this one** | |

Nothing here is unsafe, nothing is a hydration or a11y break, and the gates the lane built are
better than the ones it replaced. But three things ship a **worse** signal than main does — the
RegionRule default silently demoting eleven unreviewed surfaces (S1), eight FF&E states collapsing
onto one clay plate (S5), and the decision-due resting tint deleted with nothing in its place (S6) —
and the mono-floor sweep (S2/S3) ships an invariant that is both inverted and unenforced. Those are
the fixes required.

### Gate evidence

| Gate | Result |
|---|---|
| `npx jest` (designer-portal, full) | **458 suites / 5134 tests / 1 snapshot — all green** |
| `npx tsc --noEmit` | **exit 0** |
| `npx eslint src` | exit 1 — **2 errors, both pre-existing** in files this branch never touches (`piece-room-save-gate.test.tsx:159` `import/first` rule-not-found; `use-commercial-documents.test.ts:930` rules-of-hooks). 200 warnings, none attributable. |
| Sweep purity | 911 − / 911 + ; **0 non-pure pairs**; all 914 literal edits target `11px` |
| Pathspec | 270 files with and without the pathspec — **no stray file** |

### Counts

| blocker | high | medium | low | verified-ok |
|---|---|---|---|---|
| 0 | 3 | 11 | 12 | 8 |

---

## Findings

### 1 · Correctness — hydration, memory/perf, a11y, motion

| id | sev | conf | file:line | finding + failure scenario |
|---|---|---|---|---|
| **C1** | medium | 0.80 | `src/components/document/region/fold-seam.tsx:49,54,72` | The seam is SSR'd with `motion-safe:opacity-0 motion-safe:-translate-y-[4px]`; only a post-hydration `requestAnimationFrame` flips `settled`. **A folded region's only control is invisible for the whole hydration window.** Scenario: slow link or a hydration error on `/doc/<id>` → the Pieces seam renders as a blank 44px band with no visible "unfold", and the user has no way to know the region is there. Fix: keep `settled` out of the first paint (a CSS keyframe with `animation-fill-mode: both`, the same shape `.desk-settle` already uses) rather than a JS-gated opacity. |
| **C2** | medium | 0.75 | `src/app/globals.css:380,393` + `src/components/document/desk-roster.tsx:90–94` | `.desk-settle` is never removed. The CSS comment *states the mitigation the code does not implement*: "Lanes drop `.desk-settle` on animationend; `display: none` cancels and REPLAYS a running animation, so a class left on re-settles the whole roster on every return to the desk." No lane drops it. Scenario: any ancestor that toggles `display:none` (a responsive `hidden`/`min-[…]:block` wrapper, the product tour overlay, print preview, a browser tab restore) replays the 320ms staggered settle across all sixteen lines. |
| **C3** | medium | 0.70 | `src/components/document/row-wash.tsx:24–26` | `markInkPoint` runs on **every** `pointermove`: a `getBoundingClientRect()` **read** followed by two `style.setProperty` **writes**, on a row that is concurrently interpolating a `clip-path` transition. That is a read-after-write layout thrash, and `clip-path` circle animation is not compositor-promoted in Chromium/WebKit — so each move costs a style recalc plus a full row repaint. Scenario: sweeping the pointer down a 36-line FF&E ledger on a low-end laptop → visible jank. Cheap fix: cache the rect on `pointerenter` (the row never moves during hover — the spec guarantees it) and drop the per-move `getBoundingClientRect`. |
| **C4** | low | 0.90 | `src/components/document/row-wash.tsx:32` | `useRowWash` calls no React hook. The `use` prefix is cosmetic, forces rules-of-hooks on every caller for no reason, and allocates a fresh object each render. Handler identities are module-stable so there is no child re-render cost — naming only. |
| **C5** | low | 0.85 | `src/app/globals.css:337–338, 345–348` | `.has-wash:focus-within .row-wash` is declared **after** the hover rule at equal specificity and carries `transition: none`. A row that holds focus and is then hovered snaps the wash to centre with no sweep; blurring snaps it shut. The spec asks for the sweep on pointer and a static wash on keyboard — the combined case is unruled and currently reads as a glitch. |
| **C6** | low | 0.80 | `src/components/document/ffe-section.tsx:457, 462` | The anchored-line tint `bg-[rgba(196,165,123,0.08)]` lives on the inner grid **button**, which paints above the `z-index:-1` wash. On the one row the user was just deep-linked to, the hover wash is largely masked. |
| **C7** | low | 0.60 | `src/components/document/ffe-section.tsx:462` | `.has-wash { isolation: isolate }` turns every FF&E `<li>` into a stacking context. Verified: nothing inside a row is absolutely positioned or z-indexed today, so this is **latent**, not live. The first popover/tooltip added inside a row will paint under later sibling rows. |
| **C8** | medium | 0.85 | `src/components/document/ffe-section.tsx:381–387` | Raw `<img src={product.images[0]}>` with **no `onError`**. A 403 / 404 / expired catalog URL renders the browser's broken-image glyph inside the 48px box instead of falling back to the ruled rail-stock slot — and the slot exists two lines below. Secondary: the full-resolution catalog asset is downloaded to paint 48px (`'@next/next/no-img-element': 'off'` at `eslint.config.mjs:62`, so lint will never say so); `loading="lazy"` only defers it. |
| **C9** | ok | 0.95 | — | **Reduced motion is complete.** Every new animation/transition is covered: `.desk-settle` → `animation: none` (`globals.css:399`); `.row-wash` → flat `--wash-*-still` tint + `transition: none` (`:404`); `.has-wash:hover/.focus-within .row-wash` → `clip-path: none` (`:411`); `.row-wash-score::after` → `transition: none`; the filled Stamp's `transition-[background-color,border-color]`, the FoldSeam settle and arrow flip, and `doc-sheet-up` are all `motion-safe:` gated. No gap found. |
| **C10** | ok | 0.90 | `desk-roster.tsx:59–68`; `ffe-section.tsx:375` | **Hydration is safe and no hook sits after an early return.** `settledOnce` is written only in `useEffect`, which never runs during SSR, so the server always emits `desk-settle` + `--i` and the client's first render agrees; React 18 StrictMode's double render re-runs the `useState` initializer but keeps the first result. `useRowWash()` is the first call past destructuring in both `JobLine` and `FFELine` — `FFELine` has exactly one `return`, at its end. |
| **C11** | ok | 0.95 | `stamp.tsx:59` | `variant="filled"` with no `tone` correctly falls through to the outline branch, and it is tested (`stamp.test.tsx`, "falls back to the outline when a filled stamp names no tone"). |
| **C12** | ok | 0.85 | `desk-roster.tsx:191–195` | Tab plates are **not** colour-only state: the `<h3>` still carries `{group.label} · {group.count}` as text, `text-white` clears 5.22–8.20:1 on all six pigments (gated), and the six step down in value so a greyscale/CVD read keeps the ladder. `alt=""` on the thumbs is correct — decorative, the piece name sits beside it. The row's focusable act (`<Link href={line.jobHref}>`) is unchanged apart from losing its own `hover:decoration`, which `.row-wash-score::after` replaces at row scope. |

### 2 · Spec fidelity

| id | sev | conf | file:line | finding + failure scenario |
|---|---|---|---|---|
| **S1** | **high** | 0.85 | `src/components/document/region/region-rule.tsx:13` | `weight = 'mid'` is the **default**, so **eleven previously-unreviewed call sites** silently changed from a 6px-tall double rule (`2px #2C2926` top + `1px rgba(44,41,38,.18)` bottom, 6px box) to a **1.5px** single bottom border — a 4.5px vertical shrink *and* a demotion in rank. Sites: `project-mood-boards.tsx:282,332` · `care-band.tsx:250,304` · `schedule-rule-region.tsx:182,200` · `schedule-spine.tsx:1064` · `money-region.tsx:233,254` · `project-approval-document.tsx:566,590`. FINAL.md rules "the mockup draws exactly one" strong rule — but the mockup draws **none of those eleven surfaces**, so the default demoted them by omission rather than by ruling. Scenario: a designer opens Schedule or the approval document and the movement openers that used to read as movement openers are now section-enders, and every one of those blocks shifts up 4.5px. No test covers it (`region-rule.test.tsx` asserts class strings only). Fix: pass `weight` explicitly at all 12 sites, after a look at each. |
| **S2** | **high** | 0.90 | commit `1b93def1a` (236 files) | The sweep is the **inverse** of FINAL.md's "typography goes no further than the mockup." It raised 911 literals across People/outreach, coordination, rooms/piece and commercial-trade surfaces the mockup never draws — and touched **none** of the four files this direction itself restyled (`ffe-section.tsx`, `doc-letterhead.tsx`, `region/fold-seam.tsx`, `stamp.tsx`, all 0 lines in the sweep). Result: the mockup's own surfaces keep their sub-floor labels — `ffe-section.tsx` 8/8/8.5/9/9/9/9.5/10.5px (×8), `doc-letterhead.tsx:77,87` 10px, `fold-seam.tsx:78,81` 9.5/9px, `stamp.tsx:80` 10px — while unrelated surfaces were floored. Scenario: Kody walks the desk and the document, sees the same 8px coverage stamp and 9px slug he asked to be raised, and finds forty screens he never reviewed reset instead. |
| **S3** | medium | 0.95 | 36 files under `src/components/document/**` | The floor is **not established**. 69 sub-11px literals survive at the tip, down to `text-[0.4rem]` = 6.4px (`people/outreach/audiences-tab.tsx:169`) and `text-[0.42rem]` = 6.72px ×4 (`relationship-journey.tsx:50`, `people/ops/thread-row.tsx:53`, `audiences-tab.tsx:153,226`, `rooms/piece/facet-field.tsx:74`). Files the sweep **did** touch still hold survivors (`thread-row.tsx:53`, `outreach-bits.tsx:125`, `person-bits.tsx:154`) — so the pass was non-exhaustive even within its own scope. There is no lint rule holding the floor, so it rots on the next commit. |
| **S4** | medium | 0.85 | `src/lib/document/desk-derivation.ts:581,818`; `stamp.tsx:22` | **Filled stamps landed on FF&E lines only.** `desk-derivation.ts` was wired with `tone: 'decision'` and `tone: 'damaged'`, but no desk consumer passes `variant="filled"` — grep finds exactly one `variant="filled"` in the whole app (`ffe-section.tsx:433`). The desk's DECISION DUE / CLAIM OPEN stamps still render outline and the new `tone` field is dead data. Separately `--fill-anchor-tint` is referenced only in `stamp.tsx`'s `TONE_FILL` map; nothing renders `tone="anchor"`, so FINAL §2's anchored-line highlight — and the `.phase-row.is-anchored { color: var(--text-primary) }` rule it prints — is unimplemented. |
| **S5** | **high** | 0.80 | `src/components/document/ffe-section.tsx:198–201`; `stamp.tsx:59–74` | `ffeStampTone` collapses **ordered / production / shipped / received / delivered / installed / every `trade-*` progress state** onto `tone: 'ordered'`, and the `filled` branch of `Stamp` **discards the caller's `color` and `ink` entirely** in favour of `TONE_BORDER[tone]`. So eight states that used to separate by border ink now render as the identical clay plate, differing only by the word. FINAL §2 lists exactly four filled recipes and records that `--fill-production-tint`, `--fill-delivered-tint` and `--fill-approval-tint` were **deleted** — which is a reason to leave those states on the outline, not a licence to paint them ORDERED's pigment. Scenario: a designer scanning Pieces for what is still on order sees delivered and installed lines wearing the ordered-money plate. Fix: keep `variant="outline"` for any state with no ruled fill, or make the filled branch fall back to `color`/`ink` for the border. |
| **S6** | medium | 0.85 | `src/components/document/ffe-section.tsx:457` | The resting `bg-[rgba(232,197,71,0.05)]` on decision-due rows was **deleted with no replacement** — the golden wash only appears on hover/focus. That was a resting, at-a-glance signal, not a hover affordance, and FINAL never asks for its removal (it removes *bands*, not per-row state tints). Scenario: the ledger no longer shows which lines are blocked on a client decision without hovering each one; the DECISION DUE stamp is the only remaining cue and it is at the far right of the row. |
| **S7** | medium | 0.75 | `src/components/document/overlays/doc-sheet.tsx:371` | `doc-elevated` is on the **generic** `DocSheet` panel, not "the open ledger sheet". Every Document overlay in the app now carries the elevation — invoice composer, item composer, open-item sheet, touchpoint sheet, review-request sheet, and every other `DocSheet` caller. Three *code* sites; many *visual* sites. R126 rules "exactly three sites", and the gate counts files, so it cannot tell the difference (see T1). |
| **S8** | low | 0.85 | `src/components/document/household-chip.tsx:46` | The client line moved to `--color-clay-ink` but kept `transition-colors group-hover:text-[var(--color-clay-ink)]` — it now transitions to the colour it already is. Dead hover affordance on the letterhead's client line. |
| **S9** | low | 0.70 | `globals.css:56` vs FINAL.md §2 | Naming drift: FINAL calls the third stock `--rail-stock`; code and both gates use `--doc-rail-stock`. Harmless, but spec→token diffing will miss it. |
| **S10** | ok | 0.95 | — | **Everything else in §1–§2 checks out.** `git diff --stat -- …desk-contents.tsx` is **empty** — THE STUDIO block is byte-identical to main. Nothing from B that shouldn't be there: no `--stock-*` token exists, no `.stage-group` band, no tinted document sheet (`--doc-paper #FCFAF6` unchanged), no charcoal band anywhere in the diff, and the movement word takes A's mono eyebrow. From A: 40px Playfair title at `-0.015em` / `leading-[1.08]` on **both** letterhead branches (`doc-letterhead.tsx:59`, `letterhead-vitals.tsx:491,509`); 24px region names + 11px eyebrow over `doc-rule-mid` (`region-head.tsx:124,131`); three rule weights as three tokens; three real muted inks (`#4E4339`/`#5A4E43`/`#65594E`); `--doc-rail-stock #E8E3DB` on both the spine (`doc-spine.tsx:44`) and the margin rail (`margin-rail.tsx:258`); margin chips as lifted `--doc-paper` on it. Wash tones per stage/state are correct and tested — six stage pigments off `RosterGroup.key` (care→install), and golden / terracotta / clay for decision-due / damaged / everything else. Elevation is spent at **exactly** three non-test source sites: `margin-item.tsx:46`, `overlays/doc-sheet.tsx:371`, `studio-drawer.tsx:289`. `.folio-face`'s deletion is safe — `git grep folio-face origin/main -- apps/designer-portal` returns only its own three globals.css lines, zero consumers, exactly as R126 claims. |

### 3 · The sweep

| id | sev | conf | evidence | finding |
|---|---|---|---|---|
| **W1** | ok | 1.00 | `git show 1b93def1a --stat` | **Proven 1:1.** 236 files, 911 − / 911 +. Every (−, +) pair is byte-identical after normalising `text-\[(\d+(\.\d+)?)(px\|rem)\]` → **0 non-pure pairs**. All 914 literal edits target `11px`; the three `(12px → 12px)` entries are second literals on lines that carried two. Nothing but the font-size literal moved in any of the 236 files. |
| **W2** | medium | 0.85 | 5 sites | **A raised glyph now overflows its fixed box.** `h-[13px] w-[13px] … border-[1.5px] text-[11px] font-bold leading-none` leaves a **10px content box for an 11px bold `✓`**. Sites: `work-block.tsx:220`, `care-band.tsx:380`, `coordination/item-composer.tsx:921`, `coordination/coordination-work.tsx`, `rooms/library/rolodex-picker.tsx`. Previously 7–8px, which fit. Scenario: every checked task tick in Work Block, Care and the item composer draws its checkmark past the 13px rounded border. Marginal at 15px (`studio-setup-checklist.tsx`, 12px inner); fine at 16/17/18/26px. |
| **W3** | low | 0.70 | 2 sites | Labels raised inside a truncating fixed column now truncate earlier: `account-nameplate.tsx` `max-w-[120px] truncate` mono uppercase `tracking-[0.08em]`, and `rooms/drafting/schedule-line-unfold.tsx` `max-w-[260px] truncate`. `truncate` handles it — cosmetic loss of visible characters only, no clip. |
| **W4** | — | — | — | See **S2** — labels raised that the mockup keeps smaller, and the mockup's own labels left un-raised. |

### 4 · Tests

| id | sev | conf | file:line | finding |
|---|---|---|---|---|
| **T1** | medium | 0.90 | `src/lib/document/__tests__/shadow-gate.test.ts:129–136` | "spends `.doc-elevated` at no more than the three ruled sites" counts **files containing the string**, not elements wearing the class, and walks only `components/document/**`. One file could put `doc-elevated` on twenty elements and pass; a `doc-elevated` in `src/app/**`, `src/components/ui/**` or a workspace package is invisible; `toBeLessThanOrEqual(3)` also passes at 0. This is the gate that lets **S7** through. |
| **T2** | ok | 0.90 | same file:104–111 | **Yes, it would catch a new shadow in a `.module.css`.** `stylesheets()` walks every `.css` under `src/`, and the assertion is a frozen **exact-array** inventory naming `components/timeline/MilestoneCard.module.css` — a second entry fails the `toEqual`. It does not see a Tailwind `shadow-*` class or an inline `boxShadow` in TSX, but `eslint.config.mjs:85–107` covers exactly those (`Literal`/`TemplateElement` regex + `Property[key.name='boxShadow']`). The two halves together are complete for `src/`. Confirmed no false positive: the gate's own `/box-shadow…/` regex literals do **not** trip the D4 `no-restricted-syntax` rule (lint run is clean on both new test files). |
| **T3** | medium | 0.80 | `src/lib/document/__tests__/contrast.test.ts:215–380` | The extension genuinely gates the rail, the four fills, the six tabs and the three muted steps on their **real parsed values** — good work, and the rail is measured against the register it actually prints rather than the cross-product. But it gates **none of the eighteen `--wash-*` / `--wash-*-still` tokens**: `parseTokens` is hex-only, so every rgba wash is invisible. FINAL's stated invariant — "every wash lands at ~1.12:1 over its own ground", the whole point of "the rule is the ratio, not the alpha" — is unmeasured and unenforced, and the wash is a ground that body text prints on. A retune of any wash alpha lands silent. |
| **T4** | low | 0.70 | `src/components/document/__tests__/quiet-type-foundation.test.ts:41–50` | Kind-changed, not strictly weakened. The old assertion pinned the **alias form** (`--text-muted: var(--color-quiet-ink)`), which guaranteed "small copy is a quiet ink, never a material pigment". The replacement only asserts ≥6.3:1 on off-white — a warm clay-ish pigment would satisfy it. Coverage widened (adds `--text-subtle`); the pigment guarantee is gone. The inline comment claims "the guarantee is unchanged"; it is not. |
| **T5** | low | 0.85 | `src/components/document/desk-roster-settle.test.tsx:104–113` | The second `it` depends on the first having consumed the module flag. `jest -t 'never settles again'` in isolation **fails**. The file header explains why the file is separate but does not mark the ordering dependency. |
| **T6** | low | 0.60 | `region/__tests__/region-rule.test.tsx` | Class-string assertions only. Nothing covers the 6px→1.5px geometry change or its eleven call sites (**S1**), and nothing anywhere asserts the mono floor (**S3**). |
| **T7** | ok | 0.90 | — | **The new tests assert behaviour where it matters, and nothing was weakened to pass.** `row-wash.test.tsx` drives the real rect arithmetic (clientX 340 − left 100 → `--ink-x: 240px`) and asserts the wash is `aria-hidden`; `ffe-section-life.test.tsx` renders the real `FFESection` against mocked query data and asserts the img/slot branch, the three wash tones from real derived state, and the stamp variant/tone contract; `stamp.test.tsx` covers the tone-missing fallback and asserts every motion class is `motion-safe:`-prefixed; `fold-seam.test.tsx` covers the settle and its reduced-motion gating. **1 snapshot, passing, unmodified.** No `.skip`, no `xit`, no loosened matcher in the diff. |

### 5 · Process

| id | sev | conf | evidence | finding |
|---|---|---|---|---|
| **P1** | medium | 0.85 | `DECISIONS.md` R126 | The R126 entry **does not mention the sweep at all** — the largest change on the branch by file count (236 files, 911 lines) is unrecorded, and it directly contradicts the entry's own "**Typography goes no further than the mockup**". It also omits the RegionRule default flip (**S1**) and the FF&E decision-due resting tint removal (**S6**). Everything the entry *does* claim is accurate — verified: the `.folio-face` history, the "eslint reads `.ts`/`.tsx` only, no stylelint anywhere" reasoning, the token values, and the gate description. |
| **P2** | ok | 1.00 | `git diff --name-only` ± pathspec | **Pathspec hygiene clean.** 270 files with and without `-- apps/designer-portal docs/design/the-document/DECISIONS.md`. No stray file, nothing outside the two allowed roots. |
| **P3** | low | 0.90 | `git log origin/main..` | Commit messages are Conventional and correctly scoped (`feat(document)`, `feat(desk)`, `feat(ffe)`, `test(document)`, `chore(document-life)`). The three merge commits use `chore(document-life): merge …`, avoiding the husky `merge:`-subject rejection. Lane structure (foundation → three lanes → integration → fixes → sweep) is legible. |
| **P4** | low | 0.90 | `npx eslint src` | The lint gate is **red on main and stays red** — 2 pre-existing errors in untouched test files. Not this branch's doing, but `pnpm lint` will not be a usable signal for the merge. |

---

## Fixes required before ship

1. **S1** — pass `weight` explicitly at all 12 `RegionRule` sites after looking at each of the eleven demoted surfaces, or flip the default back to `strong` and pass `mid` only where ruled.
2. **S5** — stop collapsing eight FF&E states onto the ORDERED fill. Either keep `variant="outline"` for any state with no ruled fill, or make `Stamp`'s filled branch fall back to the caller's `color`/`ink` for the border.
3. **S6** — restore a resting signal for decision-due lines, or get an explicit ruling that it goes.
4. **S2 / S3** — finish the floor *including the four files the direction itself restyled* and add a lint rule to hold it, **or** revert the sweep and land only the mockup's own surfaces. As it stands the branch ships an inverted, unenforced invariant across 236 files.
5. **W2** — the five `h-[13px]` tick boxes need a bigger box or a smaller glyph; an 11px bold `✓` does not fit a 10px content box.
6. **C1** — do not SSR the FoldSeam at `opacity-0`. Use a CSS keyframe with `animation-fill-mode: both`, as `.desk-settle` already does.
7. **C8** — add an `onError` on the FF&E thumbnail that falls back to the ruled slot two lines below it.
8. **P1** — record the sweep, the RegionRule default flip and the decision-due tint removal in R126.

## Should fix, not gating

**C2** (drop `.desk-settle` on `animationend`) · **C3** (cache the rect on `pointerenter`) · **S4** (either wire `variant="filled"` on the desk needs and the anchored line, or drop the dead `tone` field and `--fill-anchor-tint`) · **S7** (scope the elevation to the ledger sheet, not every `DocSheet`) · **T1** (count elements, walk all of `src/`) · **T3** (gate the eighteen wash tokens on the ~1.12:1 rule) · **C5**, **C6**, **S8**, **T5**.
