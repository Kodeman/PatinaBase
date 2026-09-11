# Fix log — round 1 (fixer)

Target: `artifacts/hour-tracking-2026-09-11/deck/src/index.html` (only file touched).

## Fixed

- **C-1** — Sheet 02 heading "Six cells. One passes outright." → "Six cells. Two pass outright." (:328, unchanged marks at Who/Project already m-full).
- **C-2** — Sheet 03 heading "...Two surfaces are empty columns." → "...One empty column: the admin portal." Ann text rewritten: admin portal has no capability; client portal carries one read-only, unbroken-down invoice line (matches its own m-half mark).
- **C-3** — Sheet 04 friction-table Source cells: replaced fabricated finding ids (CR-98, WEB-33, FS-86, CR-101, MOB-34) with seat + "§3" citations (CR §3, WEB §3, FS §3, MOB §3), since the counts are sourced from memos' §3 tables, not per-id. (REP-37/CR-117/REP-45/WEB-64/FS-96/120/121/124/146 do not appear anywhere in the deck — nothing to fix there.)
- **C-4** — Sheet 11: "17–25" eng-days (critical-path fig and Path B sentence) corrected to "15–25" to match the deck's own wave-band arithmetic (3-5+6-10+3-5+3-5).
- **C-5** — Sheet 12 rows #3/#9: merged #9's duplicated view-leg citation into #3 (W0, now cites 00412:2676-2682 "both legs"); #9's citation narrowed to 00177:111,118 (the column drop only), Thing text clarified.
- **C-6** — Sheet 12 heading "Twenty-three removals" → "Twenty-three dispositions — nineteen deletions, four rulings/corrections" (4 non-removals: #12, #20, #22, #23). Added an `.ann` note pointing to where synthesis §8's nudge-rule/Live-Activity rows now live (HT-34/HT-31 on sheet 14; Live Activity strike also on sheet 09).
- **C-7** — Converted all three free-standing paragraphs into keyed table content: sheet 05 gained a "Provenance" column (re-verification note on holes 1–2 only); sheet 09 gained a tfoot "Legend — 'online only'" row; sheet 11's stage table gained a "Why" column (content only on stage 2).
- **C-8** — Sheet 06 guest row: "My hours" and "A project's" changed from absent to partial ("rostered"), Gate cell updated to note `is_project_team_member` (00484:626-644) has no role filter and grants a rostered guest project-level read despite exclusion from `time_entries_studio_read`.
- **C-9** — HT-4 seats "2 · 0" → "1 seat (CR) · 0"; HT-24 seats "3 · 0" → "2 seats (FS, CR) · 0", per synthesis.md:168's seat-count definition.
- **C-10** — Compressed multi-sentence `.ann` paragraphs on sheets 03 and 07 to one clause each (the read-already-exists note; History; Blast radius). Kept the already-single-sentence ones as-is.
- **C-11** — Sheet 07 "Backfill is mandatory" ann: added "(synthesis said W0 — the plan moves it behind the resolver)".
- **C-12** — Risk #4 "four concurrent worktrees" → "three concurrent worktrees" (matches the deck's own 2-3 fig and stage-table peak of 3).
- **C-13** — Sheet 15 "Green-light W0: Three days" → "Three to five days", with the hook-module item named and marked droppable.
- **C-14** — Sheet 12 row #8 citation "00412:2675" → "00412:2677,2680" (the actual rate-leg lines).
- **C-15** — Sheet 12 row #10 citation "hours-ledger.tsx:660-676" → "hours-ledger.tsx:683-700 (pill) · hours-ledger.tsx:184 (state)".
- **C-16** — Sheet 12 row #15 citation split: ":320 (the default)" vs ":467 (useStartTimer — sets only when provided, no default)".
- **C-17** — Sheet 07 "writable only by the legacy scope builder" → "authored only through the legacy proposal scope builder and copied in by the 00066 conversion (00066:525-535)"; sheet 12 row #8's citation annotated with the same clarification (writes `proposal_change_order_terms`, copied to `projects.change_order_terms` by 00066:525-535). Note: the finding's second anchor (sheet 05 :679) does not actually contain this phrase — checked and confirmed only one occurrence exists (sheet 07); fixed the real one.
- **C-18** — Sheet 06 member row "A project's" changed from half ("rostered") to full ("co-member"), aligning with the scope table's own "rostered project members OR studio co-members" grant (a `member`-role user is always a studio co-member). Gate cell updated to cite both `time_entries_studio_read` and `is_project_team_member`.
- **C-19** — Added an `.ann` "Open question" note under sheet 06's permission table naming the unresolved `is_org_admin_or_owner` organization-id derivation and pointing to HT-10, per architecture.md:24/:289.
- **C-20** — Added a "Findings count" colophon row showing the 218/203/210/239 arithmetic and that 218 is carried from synthesis.md:3 without independent re-derivation.
- **C-21 / TD-7** (duplicate findings, one fix) — Sheet 05 heading "Two rate holes" → "Four money holes — two are rate holes"; holes 3–4 moved out of `<tfoot>` into `<tbody>` as ordinary rows.
- **C-22** — Sheet 02 "Log an hour anywhere" mark changed from absent to half, with quantifier "0 taps in a document, impossible off one" added.
- **C-23** — Sheet 12 row #13 citation annotated "(both copies: docs/design/the-document/ and docs/product/)"; Gate cell updated to say "edit both copies".
- **C-25** — Positive finding, no fix required.
- **C-26** — Colophon's Briefing row amended to cite `current-state.md §0 and §2 (surface capability tables)`.
- **TD-1** — Table-collapse breakpoint raised from `max-width: 860px` to `max-width: 1200px`, so the block-card (already-legible) layout engages before any `.wide`/`.widest` table clips at 1024/1180/1440.
- **TD-2** — Keydown handler now exempts any target inside `.scroller` (`t.closest('.scroller')` early-return); all `.scroller` elements get `tabindex="0"` and a default `aria-label` via script, restoring native horizontal-scroll-by-arrow-key behavior when focused.
- **TD-3** — Paging keys narrowed to ArrowLeft/ArrowRight and j/k only; ArrowUp/ArrowDown/PageUp/PageDown are no longer intercepted, so the browser's native vertical scroll works inside an overflowing slide. The on-screen hint ("← → · j k") was already accurate and needed no change.
- **TD-4** — Rewrote the position-tracking logic to a single source: a scroll-driven, rAF-throttled `nearest()` that measures each slide's `getBoundingClientRect().top`. Removed the IntersectionObserver block and all keyboard-triggered `mark()` calls (go()/Home/End no longer call mark directly) — the counter now only updates from where the page actually is.
- **TD-5** — `--oak` (4.20:1) replaced with `--ink-faint` (6.35:1) for `.verdicts .k`, `table.sheet td.id`/`th.id`, and `.ann .k`. Left `--oak` on `.gutter .rule` and the link underline (only need 3:1).
- **TD-6** — Same fix as C-1.
- **TD-8** — Same fix as C-6.
- **TD-9** — Same fix as C-13.
- **TD-10** — Added `@media (max-width: 700px) { #idx { display: none; } }`; increased `.slide` bottom padding from 104px to 140px to reserve clearance from the fixed pill at wider widths.
- **TD-11** — Added a `.no-caps { text-transform: none; }` utility and wrapped "project_time_entries" in `<code class="no-caps">` on the cover count tile, so the identifier no longer renders as PROJECT_TIME_ENTRIES.
- **TD-12** — Added `:root[data-theme="light"]{color-scheme:light}` and `color-scheme: dark;` inside the existing `:root[data-theme="dark"]` block, so an explicit theme choice controls UA chrome regardless of OS preference.
- **TD-13** — Added `aria-labelledby` to all 15 `<table class="sheet...">` elements, pointing at the nearest heading id (added `id="h6b"` to sheet 06's second `<h3>`, which had none).
- **TD-14** — Added a `.visually-hidden` paragraph right after the skip link stating the arrow-key/j-k paging shortcuts, so AT users are told they exist (the `#idx` pill itself stays `aria-hidden`).
- **TD-15 / TD-16** — Recorded as a colophon deviation note (page measure 1240 vs spec 1100 — narrowing would worsen TD-1; block gaps off the 12/24 module; `.t-head` used beyond running heads) rather than changing the layout or amending SPEC.md, per the findings' own "record" alternative.
- **TD-18** — `.skip` switched from `left:-9999px` to the same `clip-path: inset(50%)` technique used for `<thead>`, with `.skip:focus` restoring normal visible layout; added `tabindex="-1"` to `#sheet-2` so focus lands there when the skip link is activated.
- **TD-20** — Added a colophon "Paths" row: citations are relative to `apps/designer-portal/src/` and `supabase/migrations/`, on `origin/main`.

## Skipped

- **C-24** — reason: addressed to the orchestrator ("supply the contract, or rule whether a criteria-table slide and a NOT-in-v1 slide were required"), not an index.html content fix; no DECK CONTRACT file exists to diff against, and I am not authorized to invent slide-scope decisions.
- **TD-17** — reason: finding's own fix is "Leave it; recorded so a later reviewer does not re-find it." No code change requested.
- **TD-19** — reason: finding's own fix is "No action; recorded." The unused tokens are the verbatim §A1 block, which the house sheet instructs to paste unchanged.
- **TD-21** — reason: accepted per the finding's own first alternative (laptop-first business deck); rendering sheet 03/14 as a single "present on: …" sentence per capability at 390px is a materially larger redesign than a targeted fix pass, and the block-card fallback is otherwise correct.
- **TD-22** — reason: orchestrator's call per the finding itself ("Orchestrator's call — fix in the synthesis or accept"); the deck is faithful to synthesis.md's own HT-30 grouping, so no unilateral deck change was made.
- **TD-23** — reason: the finding's fix targets `review/shots/render-check.cjs`, a file outside the single file (`deck/src/index.html`) I was authorized to edit.
