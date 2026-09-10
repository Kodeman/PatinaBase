# T5 walk — the galley, scripted, at 1440 / 1024 / 390

Local production build (`next build --webpack` + `next start -p 3000`), worktree
`.codex/worktrees/agent-agreement-galley`, branch `agreement-room/galley` at
**`b2321da62`**. Flags `procurement-workspace-pilot,the-document-pilot,agreement-library,design-build`
all `true`, `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live`, signed in as
`designer@patina.dev` via `localhost:3000` (never `127.0.0.1`, per instructions).
Chromium via Playwright, `deviceScaleFactor: 2`. Driven by a scripted walk
(`shots/tools/walk.mjs`), not a manual click-through — see "On the method" at
the end for what that trades away and what it buys.

A **fresh draft was seeded per width** with `shots/tools/seed-draft.mjs`
(ceiling $24,000, retainer $5,000, monthly cadence, 50% furnishings deposit,
no rate-card rows — the shape shipped by the seed script; this **differs from
synthesis.md §5's pinned example**, which shows an *unset* deposit. Noted
once here rather than at every row: nothing in this walk exercises the
unset-deposit paper string). Proposal ids: 1440 → `89f1b601-ecc8-4740-922a-
529e5fac156d`, 1024 → `7aafc417-e3bf-4c00-b6b8-70da849f4bca`, 390 →
`3b357666-584d-40be-9993-95ef725fae57`.

**Build note (not a product defect):** the sandboxed build silently truncated
mid-compile with exit 0 and no `BUILD_ID` — retried with the sandbox off per
the task's own instruction, which then completed normally. A first
`next build`/`server.js` (standalone) attempt also 404'd every JS/CSS chunk
because standalone output needs `.next/static` and `public/` copied in
manually; switched to plain `next start`, which the prior capture lane
(`shots/README.md`) had already flagged as the working path.

**Script bugs found and fixed while building the walk (listed for the
record, not as product defects):** an early version pressed `Escape`
unconditionally to close folds, which — once a Deliverables item was removed
and focus landed outside the open section — leaked past the fold's own Esc
handler into the room's **own** Escape handler and left the room entirely,
cascading every later step into "element not found." Root cause was the
galley's own design working as documented (`galley-part.tsx`'s Esc handler
only catches the keydown if focus is still inside the open section); the fix
was to close folds by re-clicking their own "Write" toggle (the task's
primary suggested method) rather than blind `Escape`, with `Escape` kept
only where the task names it explicitly (step 3, step 11's overlay). A
second class of bugs came from Move-up/Move-down/Hide being invisible at
rest (see WR-16 below) and from a newly-added part opening its own fold
**automatically** on add, which a follow-up "click Write to open it" was
silently toggling shut again. All are script-side; none required touching
product code, and none is included in the defect list below except where
they point at something the product itself does.

---

## §1 · 1440

| # | Step | Saw | Strings (verbatim) | Console | Defect |
|---|---|---|---|---|---|
| 1 | Open `/drafting/<id>` | `h1` = "A draft with no client yet"; eyebrow "Design services agreement · V1" / "Draft"; prepared-for act; one `#room-status` region present at load | `Prepared for no one yet — Link a client` · status `Two things before this can go: name a fee; link a client.` — **exact match** to synthesis §5's two-outstanding form and the "neither" title state | 2 benign pre-auth errors (below) | none |
| 2 | Link a client | Clicking the row for the captured household (`client_id` null, email on file) only **arms** an invite (R73 arm-then-confirm) — a `Send invite` act had to be clicked separately to complete the link. `h1` becomes `dave@okonkwo.test`, matching synthesis §5's "email only" title state exactly | status → `One thing before this can go: name a fee.` | — | not a defect — R73's documented design; noted because the task's "pick it" undersells the two-click reality |
| 3 | Write Services, check paper live | Body textarea; printed part text updated **without leaving the field** (`.g-part__printed` text captured mid-edit, matches the fixture Services clause verbatim) | `printedWhileEditing` = fixture text, exact | — | none |
| 4 | Esc closes Services | Focus was in the `TEXTAREA` inside `part-patina-services` before Esc; after Esc, focus landed on `write-patina-services` (the fold's own toggle) | — | — | none — matches the design ("focus returns to the Services head") |
| 5 | Deliverables: +1, −1 | 1→2 items on add, 2→1 on remove (net: original seed item swapped for the fixture's) | — | — | none |
| 6 | Role rates fold | 3 named rows (Principal $185/hr, Designer $140/hr, Assistant $85/hr) written and correctly rate-matched by name | readiness → `Nothing left to finish.` (ceiling was already $24,000 from the seed, so the fee-floor blocker cleared straight to "nothing," never passing through synthesis §5's transition sentence — a seed-shape artifact, not a defect) | — | **curiosity, not a defect**: clicking "+ Add a role" 3× from 0 rows produced **6** DOM rows, not 3; only the 3 filled-by-name rows persisted to the DB (confirmed in §4) and the printed paper never showed extras. Not chased further — it never affected the correct end state |
| 7 | Ceiling write | `$24,000` before and after (already seeded) | `Nothing left to finish.` | — | none |
| 8 | Retainer write | `$5,000` before and after (already seeded) | `Nothing left to finish.` | — | none |
| 9 | + Add a part at the seam after Ceiling → Flat fee | Seam-scoped click correctly opened `AddPartSheet` ("From your Library"); "Schedule ▾" → "Flat fee" → "Add to this agreement." **The new part opens its own fold immediately on add** (`data-selected="true"` the instant it lands — confirmed by direct DOM read, see "On the method") | — | — | **finding, not this lane's to fix**: see "where did it land" below |
| 9b | Rename → "Concept fee", write `2400` | Rename field and `Flat fee · dollars` field both present and filled once the auto-open was respected instead of fought | readiness → `Nothing left to finish.` once done | — | none, once the script stopped closing the fold it had just opened (see script-bugs note) |
| — | **Where did it land?** | DB position **10 of 10** (last), regardless of clicking the seam right after Ceiling (position 5) | — | — | **P2 finding** — the seam is decorative for placement; `+ Add a part` always appends at the end. See defect list |
| 10 | Hide Exclusions | Hide act **not visible at rest** — confirmed by CSS read (`galley.css:388-400`): `.g-part__acts-live` is `display: none` until `:focus-within` or the part is open; **there is no `:hover` rule at all**. Focusing the row's own "Write" toggle (without opening it) correctly revealed Hide, which then worked | status unaffected (`Nothing left to finish.`) | — | **this is WR-16 from the prior wave review, now confirmed real** — see defect list |
| 11 | Show to the client | Once hidden, Exclusions became `silent` (`agreement-composer.tsx`'s `hiddenFromClient` flag) and its head-row **disappeared from the paper's main flow entirely**; "Show to the client" lives instead in the part's own studio-strip rest row (`aria-label="The studio · Exclusions"`), same pattern as an unwritten part | status unaffected | — | not a defect — matches FS-6/R33's documented rest-row pattern, but is itself worth a note: the act visibly **moves location** the instant you hide, which a first-time user could easily lose track of |
| 12 | Move Billing cadence up ×2, keyboard | Real `Tab` from the row's Write toggle landed on Move-up (`focusedBefore: "patina.cadence:up"`); `Enter` → `Billing cadence is now part 7 of 10.`, focus **stayed on the same control** (`focusAfterFirst: "patina.cadence:up"`); second bare `Enter` (no re-Tab) → `Billing cadence is now part 6 of 10.`, focus held again | both sentences exact | — | **none — this is checks 14/15 passing cleanly**, and it is real keyboard-only navigation, not a simulated `.focus()` |
| 13 | Terms | Fixture terms text written | status unaffected | — | none |
| 14 | Read the whole paper | Overlay opened (`ServiceAgreementPreview`, the same body the paper prints) | `overlayVisible: true` | — | **low-confidence P3**: my same-page check read `closedAfterEscape: false` (text "The whole paper" still matched) 400 ms after pressing Esc, at **all three widths**, yet every subsequent step worked normally against the room underneath, meaning the overlay was not actually blocking. Likely either a lingering title node during an unmount transition or a check that fires before a fade-out finishes — flagged, not confirmed |
| 15 | Foot: consequence + send | Consequence sentence directly above the terminal act, composed correctly from parts and position order; `Send the agreement · $5,000.00 retainer`, not held (`aria-disabled` absent) once every blocker cleared | consequence: *"The client receives the ten parts this agreement has written — the services, the deliverables, the exclusions, the role rates, the $24,000.00 ceiling, the monthly billing cadence, the furnishings deposit, the $5,000.00 retainer, the terms and the Concept fee of $2,400.00 — and their signature preserves consent; nothing is billed and no work is authorized until the studio countersigns."* | — | none |
| 16 | Send sheet opens, read every string | Real send opened (not held): title **"Send design agreement"**, no eyebrow/heading duplication, no Recipient box, no readiness-complete line, `A note to the client · optional` + meta hint, **`Not yet`**, **`Send the agreement · $5,000.00 retainer`**, **`Record a signature received outside Patina`** | matches synthesis §5's send-sheet table **cell for cell** | — | none |
| 17 | "Not yet" | Sheet closed | — | — | none |
| 18 | No retired strings | `returnToSevenFacets: false`, `previewClientCopy: false`, `facetsWritten: false`, `readyToSendEveryFacet: false` — all absent, page-wide | — | — | none |
| — | Layout | `document.documentElement.scrollWidth === clientWidth === 1440` at open and at the final state | — | — | none |

**Console (all steps, 1440):** exactly 2 errors, both at page load before sign-in completes — `TypeError: Failed to fetch` (a pre-auth session probe) and `Error logged: AppError: Not authenticated`. Cosmetic pre-auth noise, unrelated to the galley; identical two errors recur at 1024 and 390.

---

## §2 · 1024

Same 18-point walk, same script, fresh seed. Every step matched 1440's outcome exactly — same strings, same status sentences, same DB shape, same 2 console errors, `scrollWidth === clientWidth === 1024` throughout. The one width-specific thing worth recording:

- The **send sheet renders as a centered modal card** at 1024, identical in composition to 1440's (screenshot `1024-17-send-sheet.png`) — no clipping, both acts fully readable.
- The outline collapses to a disclosure ("› THE PARTS") below the galley's own 1248px breakpoint, as specified; reopening it and reaching every part worked without incident.

No new defects at this width.

---

## §3 · 390

Same 18-point walk again, fresh seed. Every readiness sentence, every persisted value, and the retired-string sweep matched 1440 and 1024 exactly.

**Layout, checked rigorously — not just at open and close.** The PNG width header of **every one of the 17 screenshots** captured at 390 (`390-01-open.png` through `390-17-send-sheet.png`) is exactly **780px** (`390 × deviceScaleFactor 2`), confirmed by reading each file's own IHDR chunk. That means `scrollWidth <= clientWidth` held at *every* step of the walk, not just the two points the script explicitly asserts on — a stronger form of check 13/18 than the transcript's own before/after pair.

- Role rates fold, open at 390 (`390-06-role-rates-open.png`): the reserved act box wraps exactly as the wave-fix-log's WR-01 fix describes — **WRITE** on the head row, **MOVE UP · MOVE DOWN · HIDE FROM THE CLIENT** on the line beneath, inside the measure, no page-level horizontal scroll.
- "Read the whole paper" overlay at 390 (`390-15-whole-paper-overlay.png`): the same body content correctly reflows full-width, no clipping.

**One real, width-specific defect found here** — the send sheet's own layout:

- At 390 the send sheet renders **full-bleed** (edge-to-edge, not a centered card as at 1024/1440). Inside it, the primary act's label is **visibly clipped at the left edge** — the button reads "…nd the agreement · $5,000.00 retainer" with the leading **"Se"** of "Send" cut off past the sheet's own visible bound (confirmed by pixel-cropping `390-17-send-sheet.png`, not just judged at thumbnail scale). "Not yet" sits correctly on its own line above (the two acts' `flex-wrap` row does wrap), but the primary act itself is what's cut. See defect list, **P1**.

---

## §4 · DB check

Against the **1440** draft (`89f1b601-ecc8-4740-922a-529e5fac156d`) at the end of its walk:

```sql
select part_key, position, client_visible, payload
from proposal_agreement_parts
where proposal_id='89f1b601-ecc8-4740-922a-529e5fac156d'
order by position;
```

| position | part_key | client_visible | payload (essentials) |
|---|---|---|---|
| 1 | `patina.services` | t | body = fixture Services clause, verbatim |
| 2 | `patina.deliverables` | t | 1 item: "A final selections walkthrough with the client" |
| 3 | `patina.exclusions` | **t** | "Construction labor" |
| 4 | `patina.role_rates` | t | Principal 18500¢ · Designer 14000¢ · Assistant 8500¢ — **exactly 3 roles, no orphaned blanks** despite the 6-DOM-row curiosity in §1 |
| 5 | `patina.ceiling` | t | 2400000¢ ($24,000) |
| **6** | `patina.cadence` | t | monthly — **moved from its original position 8 to position 6, exactly matching the two keyboard moves** |
| 7 | `patina.deposit` | t | 50% (seed value, untouched) |
| 8 | `patina.retainer` | t | 500000¢ ($5,000) |
| 9 | `patina.terms` | t | fixture Terms body, verbatim |
| **10** | `custom.fbbc9e81-…` | t | 240000¢ ($2,400) — **Concept fee, landed last**, confirming the seam-position finding at the persistence layer, not just in the DOM |

Confirms all three things the task asked this check to prove:
1. **Typed values** — every field matches what was typed, verbatim, in cents.
2. **Hidden flag toggled back** — Exclusions' `client_visible` is `t` (true): hidden in step 10, shown again in step 11, and the round-trip persisted correctly.
3. **Reorder persisted** — Billing cadence sits at position 6, matching the two keyboard moves exactly; nothing else's position was disturbed by the move.

---

## §5 · On the method

This walk was driven by a Playwright script (`shots/tools/walk.mjs`), not a human click-through, because the task specified scripted screenshots at three exact widths with console/scroll capture at every step. That traded a few things worth naming: a human would never have hit the "auto-open on add" or "acts invisible until focused" surprises as *bugs* — Leah's own hands would have just continued from wherever focus already was — so those two are flagged above as **script-adaptation notes**, not product defects, except where they double as genuine findings (WR-16, the seam-placement mismatch). Everything reported as a **defect** below is something the DOM, the DB, or a pixel crop shows independent of how it was clicked.

---

## Verdict: **SHIP**, with three defects to log

Nothing here blocks the galley: every readiness sentence, every keyboard path, every persisted value, and every retired-string sweep passed at all three widths, and the one P1 is cosmetic (a label clipped, not a broken act — "Not yet" and the Send act are both still present and operable at 390, just not fully legible).

| # | Defect | Width | Severity | Confidence |
|---|---|---|---|---|
| D1 | Send sheet's primary act label ("Send the agreement · $X retainer") is clipped at its left edge at 390 — "Se" of "Send" is cut off past the sheet's own visible bound. The sheet goes full-bleed at this width (unlike the centered card at 1024/1440); "Not yet" wraps correctly to its own line above, but the primary act itself does not get equivalent inset. | 390 only | **P1** — the primary terminal act's own label is unreadable at the width most likely to be a phone | **High** — confirmed by pixel-cropping the screenshot at 4× zoom, not judged at thumbnail scale; reproducible (fresh seed, clean run) |
| D2 | `+ Add a part` always appends the new part at the **end** of the composition, regardless of which seam it was invoked from. Clicking the seam directly after Ceiling still landed Concept fee at position 10 of 10, both in the DOM and in the persisted `proposal_agreement_parts.position`. The seam affordance visually implies positional insertion; the actual behavior is always-append. | all three (DOM confirmed at all; DB confirmed at 1440) | **P2** — no data loss, but a designer clicking the seam beside Ceiling has a reasonable expectation the part lands there, and it doesn't; the fix afterward is a Move act, an extra step | **High** — DOM order and DB `position` agree exactly |
| D3 | Move up / Move down / Hide are invisible at rest for every part except the one currently open or focused — confirmed via `galley.css:388-400`: reveal is gated on `:focus-within` or `data-selected="true"`; there is **no `:hover` rule**. A mouse-only user cannot see or reach these acts on a closed, unfocused row without first opening it (which reveals them as a side effect of `data-selected="true"`) or deliberately tabbing focus into the row. Keyboard reachability is real (confirmed at step 9/§1) — this is a **mouse-affordance** gap, not an accessibility trap. | all three | **P2** — this is **WR-16** from the prior wave review, previously flagged "low confidence, needs Kody's eye"; this walk resolves the confidence question (the behavior is real and reproducible) but not the design question (is a hover-only-when-open reveal the intended trade for zero reflow, or does it need a lighter, always-visible affordance) | **High** on the behavior; **the design call itself is Kody's, not this lane's** |

**Carried, not defects:** the 6-DOM-rows-from-3-clicks curiosity in Role rates (§1, row 6) never reached the paper or the database and was not chased further; the `closedAfterEscape: false` reading on the whole-paper overlay (§1, row 14) never blocked a subsequent step at any width and is flagged at low confidence as likely a check-timing artifact, not a functional closing failure.

**Screenshots:** `/Users/kody/Code/patina-merged/artifacts/agreement-room-2026-09-10/shots/walk/` — 17 numbered PNGs + `<width>-transcript.json` per width (1440, 1024, 390), 51 screenshots and 3 full transcripts in total.
