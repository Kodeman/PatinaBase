# Kody walk sheet — capture-launch W0-D1

A live, signed-in device walk this lane could not perform itself (no Chrome
profile, no Patina login, no built extension in this worktree). Fill one row
per URL while actually using the extension. The URLs match this lane's
harvested fixtures (`apps/extension/src/__tests__/fixtures/README.md`) so
what you see live can be checked against what the jsdom extraction audit
found (`artifacts/capture-launch-2026-08-29/extraction-report.json`) —
worth a skim first so you know what to watch for (e.g. RH's price is
member/regular and its width options are in feet; 1stDibs mis-detected the
currency as CHF; the Pinterest pin crashes extraction entirely in the audit
— see if it also breaks the live panel or just degrades).

## Setup

1. `pnpm --filter @patina/extension build` (produces
   `apps/extension/build/chrome-mv3-prod`).
2. Chrome → `chrome://extensions` → enable Developer mode → **Load unpacked**
   → select `apps/extension/build/chrome-mv3-prod`.
3. Sign in at **app.patina.cloud first**, in a normal tab, before opening the
   extension panel — the panel adopts that portal session automatically
   (`src/hooks/use-portal-session.ts`); signing into the panel's own QR/email
   flow is the fallback path, not the one designers will actually use day to
   day.
4. Pin the extension to the toolbar (puzzle-piece menu → pin) so opening it
   is one click, matching the onboarding flow's own instruction.
5. Time-to-save starts when you click the toolbar icon on the product page,
   ends when the S4/S5 terminal screen ("Saved to your library" / "Sent to
   your inbox") appears.

## P1 — Leah (all saves route to one project + one room)

Before starting: open the project you'll route into once, so "fill existing
slot" and "project inbox" have somewhere real to land; note the project/room
name below so later rows can note whether sticky context (sighted in
`click-paths.md`) actually carried it forward.

Project/room used: ______________________

| URL | Time-to-save (s) | Clicks | Fields fixed | Fields missing for tear sheet (SKU / dims / materials-finish / lead time / trade price / vendor) | Retailer/manufacturer correct? | Badge honesty | Surprise | Would I do this 30×/day? (y/n) |
|---|---|---|---|---|---|---|---|---|
| roomandboard.com — Stevens Sofas (`fixtures/roomandboard.com.stevens-sofas.html`) | | | | | | | | |
| dwr.com — Eames Lounge Chair and Ottoman (`fixtures/dwr.com.eames-lounge-chair-and-ottoman.html`) | | | | | | | | |
| rh.com — Jennifer Sofa (`fixtures/rh.com.jennifer-sofa.html`) | | | | | | | | |
| wayfair.com — Ebern Designs sofa (`fixtures/wayfair.com.ebern-designs-sofa.html`) | | | | | | | | |
| hedgehousefurniture.com — White Oak Marie Nightstand (indie Shopify maker) | | | | | | | | |
| pinterest.com — known-bad pin (board/roundup, not a product) | | | | | | | | |

All six saves above → the **same** project + room. Note in "surprise" if
sticky project/room actually carried across captures the way
`click-paths.md` predicts (project+room remembered, but the destination
dropdown itself resets to "Library only" every time — confirm whether that
matches what you see).

## P2 — Marcus (`fill_slot` repeatedly into a room with empty FF&E lines)

Before starting: open a room that already has several **empty** (unassigned)
FF&E line items, so there's something real to fill each time. Note which
room below.

Room used (with empty FF&E lines): ______________________

| URL | Time-to-save (s) | Clicks | Fields fixed | Fields missing for tear sheet (SKU / dims / materials-finish / lead time / trade price / vendor) | Retailer/manufacturer correct? | Badge honesty | Surprise | Would I do this 30×/day? (y/n) |
|---|---|---|---|---|---|---|---|---|
| hermanmiller.com — Eames Lounge Chair and Ottoman, 1st capture (`fixtures/hermanmiller.com.eames-lounge-chair-and-ottoman.html`) | | | | | | | | |
| hermanmiller.com — same page, 2nd capture (repeat `fill_slot` into a different empty line) | | | | | | | | |
| steelcase.com — Gesture chair (`fixtures/steelcase.com.gesture.html`) | | | | | | | | |
| visualcomfort.com — Talia Small Chandelier, trade pricing behind login (`fixtures/visualcomfort.com.talia-small-chandelier.html`) | | | | | | | | |

For the Herman Miller repeat row specifically: does `fill_slot` stay
selected as you move from one capture to the next, or does the destination
dropdown reset to "Library only" and force a re-select each time (predicted
by `click-paths.md` from `FFESlotPicker.tsx:63-65` — worth confirming
against the live panel, not just the code reading)? That single answer is
the biggest input to whether "30×/day" is actually survivable for Marcus.

## Column definitions

- **Clicks**: every discrete interaction (select change, button click, one
  text-field entry) from opening the panel to the terminal screen.
- **Fields fixed**: how many extracted fields you had to correct by hand
  before saving (name, price, description, materials, colors, finish,
  dimensions).
- **Fields missing for tear sheet**: which of SKU, dimensions,
  materials/finish, lead time, trade price, and vendor were *not* available
  anywhere in the panel — the fields a real spec-book tear sheet needs that
  this capture pass didn't get you.
- **Retailer/manufacturer correct?**: does the panel correctly distinguish
  who sells it (retailer) from who makes it (manufacturer) — the DWR/Herman
  Miller pairing is the sharpest test of this.
- **Badge honesty**: does the confidence badge (`high`/`medium`/`low`) match
  what you can see is actually right or wrong on the page? Note any case
  where a `high` badge shipped a wrong field, or a `low`/`medium` badge sold
  itself short on a page that was actually clean.
- **Surprise**: anything that didn't match your mental model of what should
  happen.
