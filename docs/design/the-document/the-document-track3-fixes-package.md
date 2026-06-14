# Handoff — The Document, Track 3 review fixes (F1–F4) + merge gates

**To:** Claude Code (implementation authority)
**From:** the design session — 2026-06-13 (the R41 Track 3 review)
**Reads against:** `DECISIONS.md` R41 · `the-document-spec-v1.4.md` · the slice entries I29–I33.
**Context:** Track 3 (slices 1–6) is reviewed and **blessed** (R41). This packages the four fixes the review named and the two gates to merge `the-document/track3-rooms-library` → main. Small, focused — most is correction and capture, not new surface.

---

## Part A — DECISIONS.md state (already appended; footer restored)

- **R41** (the Track 3 review) is appended; the integrity footer is recomputed and healthy:
  `*Entries: D1–D14 · O1–O7 (resolved) · I1–I33 · R1–R41 · L1–L3 · THE GO · FLIP CONFIRMED · last id = R41*`.
- R41 blessed the build (the Engine's no-persistence deviation, the Desk-receivable model, the cents fix, the derived signals), ruled the flagged calls, and named F1–F4 below. Nothing to re-paste — build to R41.

---

## Part B — the fixes

Standing rules unchanged: additive-only, real data, behind the `the-document-pilot` flag, one PR titled `the-document: track3 fixes — F1–F<n>`, end with the `DECISIONS.md` I-entry. **Audit before you build** — F3 especially may already have a daily cut.

### F1 · Land the ≥1280 screenshots (the record can't see its own surfaces)

Track 3 committed **no** screenshots — only `track-1/`, `track-2/`, and the `slice-*` dirs exist. Capture the desktop (≥1280) set for each new surface and commit to a new `screenshots/track-3/`:
- **The Library Room** — the three shelves; a capture landing in My Library; Quick Tags inline; Deep Analysis as a paper sheet over the Room; the foot stat line.
- **The Engine** — ⌘K with the "Ask the Engine" row → result-lines → Place → the "via the Engine" mark on the placed FF&E line; the librarian ask in the Library.
- **The Accounts book** — all three pages (Ledger · Receivables · Earnings), the front-matter band, the overdue receivable on the Desk, and the chase clearing it.
- **The Aesthete fold** — the Earnings two bands and the twinned Pledge sub-lines (returned-to-you / given-to-commons), the front-matter teaching lens.
- **The Composing Page** — `/compose` at a partial fill and near-complete, with the Strata Mark as the only progress.
- **Accept:** `screenshots/track-3/` exists and is committed, one ≥1280 capture per surface above. The ~390px set is **not** owed here — it rides the L4 device walk.

### F2 · Provisional rate constants — render real numbers, flagged provisional (no "—")

R41 ruled the Pledge a **separate match on top**: returned-to-you = the full 25% (real); the commons share is additive. Make the commons number visible:
- `PLEDGE_RATE = 0.25` (confirmed, keep).
- `COMMONS_MATCH_RATE = 0.10` — **provisional**, a named tunable constant beside the R10 / R22 / send-weave set (or alongside `pledge.ts`'s `PLEDGE_RATE`). The commons sub-line renders a real number (10% of the commission) with an in-product **"provisional"** tag, not "—".
- The **Designer-Selections vs Style-Matches** commission differential is upstream earnings — provisional-equal until brand sets it; the document renders whatever commission lands, so **no document change** is needed when the split is set. Note it in the I-entry; don't build for it.
- **Accept:** the Aesthete fold shows both Pledge sub-lines as real provisional figures (e.g., $84 returned · $33.60 to the commons on a $336 commission), with a visible provisional flag; the rates are named, tunable constants; `COMMONS_MATCH_RATE` is no longer null and nothing renders "—". `§14.15` stays open for the brand/finance finals — wiring them later is a constant change, no rebuild.

### F3 · The Library foot reads "taught today"

R32's foot line is "taught **today**"; the build shows lifetime `designer_teaching_stats` as a stand-in.
- **Audit first:** does a daily teaching cut already exist (a date-filtered read or view)? If yes, point the foot at it.
- If not, add an additive daily read (date-filtered query or a small view) for today's taught count; keep lifetime where it's used elsewhere.
- **Accept:** the Library Room foot reads the day's teaching (resets daily), live-verified; no migration if a date filter on the existing rows suffices.

### F4 · Doc-grammar re-skin of Promote / Nominate (non-blocking)

`PromoteToStudioModal` / `NominateToCatalogModal` are reused as-is — functional, correct movement, but portal-modal grammar.
- Re-skin into document grammar: a **paper sheet over the Room** (reuse the `RoomSheet` pattern already built for Deep Analysis in I29), no shadow (D4), flat edges.
- **Accept:** promote and nominate render as paper sheets in the Room (no portal-modal chrome/shadow); the movement (personal→studio, studio→catalog) is unchanged.
- **This is a follow-up polish — it does NOT block the merge.**

### Schema / sequence

- **Additive only.** F1 is capture (no code). F2 is constants + render (no schema). F3 is a date-filtered read or a small additive view (no destructive change). F4 is presentation. No destructive migrations (D7 holds for surviving zones).
- **Order:** F1 + F2 first (both designer-visible, quick), F3 next, F4 may follow the merge.

---

## Merge gates — `the-document/track3-rooms-library` → main

1. **L4 device check (human gate, Kody + Leah).** The Library Room, the Composing Page, and the Engine ask-and-place on Leah's phone — the Rooms physics are new (as the D13 walk was). GREEN means the shell is trustworthy for every future Room. This is where the ~390px captures get taken.
2. **F1 landed** (the ≥1280 screenshots committed). **F2 strongly preferred in the same PR** (it's a designer-visible correctness fix — no "—" in front of a designer). F3/F4 may ride or follow.

Rollback remains the pilot flag. After merge, surface week-one flight telemetry at the next review to rank any remaining dissolve work.

---

## Kickoff line (paste to start Claude Code)

> Land the Track 3 review fixes (R41, F1–F4): capture and commit the ≥1280 screenshots to `screenshots/track-3/` (F1); wire `COMMONS_MATCH_RATE = 0.10` provisional + render the commons Pledge sub-line as a real flagged-provisional number, not "—" (F2); make the Library foot read "taught today" (F3, audit for an existing daily cut first); then re-skin Promote/Nominate into a paper RoomSheet (F4, non-blocking) — all additive, behind the flag, one PR, ending with the I-entry; the merge to main waits on F1 + F2 and the L4 device walk.
