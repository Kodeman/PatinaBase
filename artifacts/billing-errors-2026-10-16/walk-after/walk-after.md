# US-35 walk-after: the fixed composer on a client-less project

Walked 2026-10-16 against main `91c1d5100`, which contains the SQ-1019 fix `9af30e16e`. Ticket SQ-1027. The "before" walk is [../walk/walk.md](../walk/walk.md) §1 and §6.

## Verdict

| Step | Result | One line |
|---|---|---|
| 1. Held Draft on the Document | **PASS** | The act is held, the consequence sentence shows, the reason goes to `role=status`, focus moves to Link a client, and nothing is written. |
| 2. Link a client → sheet over composer → Draft | **FAIL** | The household sheet opens *under* the composer, so nothing visible happens. The lines survive, and once the client is linked Draft succeeds. |
| 3. From the desk / ⌘K → `/doc/{id}?sheet=household` | **PARTIAL** | The link is correct and the route opens the sheet on a fresh load. After a click-through, though, the ⌘K composer stays mounted on top and hides the sheet again. |
| 4. 390 px, step 1 | **PASS with layout defects** | The held behaviour is correct. The ad-hoc "×" buttons and the TOTAL figure spill past the panel edge, and the scrim stops part-way down a long panel. |
| 5. Keyboard only, steps 1–2 | **FAIL at step 2** | Step 1 works by keyboard and focus lands visibly on Link a client. Enter then sends focus into the invisible sheet. Esc drops focus to `<body>`. |

**Worst problem first:** in every entry point, Link a client opens the household sheet underneath the composer. The sheet layer is `.doc-sheet-layer` (`fixed z-50`). The composer is `.paper-folio-overlay` (`fixed z-[60]`). A designer presses the fix the composer just pointed them to and sees nothing change. Focus has moved into a dialog they cannot see. Their next Tab or keypress goes to the hidden sheet, or Esc silently closes it. This is the same "invisible stacked sheet" class Study B found in §3 (03c/03d).

## Setup

- **Runtime.** Local Supabase was already up on `127.0.0.1:54321`. I started the designer portal alone from the main checkout (HEAD `91c1d5100`, which contains `9af30e16e`) with `pnpm turbo run dev --filter=@patina/designer-portal` on :3000. I did not run `pnpm dev` or reset the DB, and I read no `.env` file.
- **Target check.** Chrome already had a session as `designer@patina.dev` (Leah Hartwell). The session JWT `iss` is `http://127.0.0.1:54321/auth/v1`, and the tab made no `*.supabase.co` requests. The headless Playwright run signed in through the dev-accounts panel. It also saw `iss` = `http://127.0.0.1:54321/auth/v1` and made 0 `supabase.co` requests.
- **Client-less projects.** Instead of nulling Fenwick Lodge, I used existing seeded local projects that have `client_id is null` and `studio_id` set, found with a read-only psql query: Okonkwo residence `d0e…000a` (steps 1–2), Halloran House `f19…0001` (steps 3 and 5) and Quill Lane Porch `f19…0005` (step 4).
- **Browser.** I used Chrome automation at 1400×863 for steps 1–3 and 5. For step 4 I used headless Playwright 1.58.2 at 390×844, DPR 2, because Chrome resize does not work here (see Study B).
- **Data written, all local and kept:**
  - Okonkwo residence: linked to the household **Client User** (`client@patina.dev`), which set `client_id` = `a0000000-…-0005`
  - Okonkwo residence: one draft invoice `db42c332…` with two ad-hoc lines totalling $850, "ZZ US-35 Design consultation" $600 and "ZZ US-35 Site measure" $250
  - No other writes. The step 3–5 composers were left undrafted, and Halloran House and Quill Lane Porch are still client-less.
- **Diagnostic override (step 2 only).** To finish step 2 I raised the sheet layer in DevTools (`.doc-sheet-layer{z-index:70}` and the Radix popper to 80). Screenshot 02b is labelled DIAGNOSTIC because a real user cannot do this. I removed the override before I returned to the composer and pressed Draft.
- **Dev server.** I stopped it with TaskStop, port 3000 is free and no dev process remains. The dev server had rewritten `apps/designer-portal/next-env.d.ts` in the main checkout, and I restored the committed content.
- **Screenshots.** Saved as PNG, at most 1600 px on the long side, with a 128-colour palette (Pillow). Every file is under 160 KB.

---

## 1. Client-less project → two ad-hoc lines → Draft the invoice — PASS

[01a](01a-draft-pressed-held-link-a-client.png)

- **Before pressing.** The consequence sentence "Okonkwo residence has no client yet. Link one to bill it." sits above the act with a **Link a client** act under it. This already shows before any line is added, so §A6 is met.
- **After pressing Draft the invoice** (two lines, $850):
  - The act is held: `aria-disabled="true"`, not natively disabled, at opacity 1.
  - A `role="status"` line inside the composer reads **"Link a client before drafting this invoice."**
  - Focus moves to the **Link a client** button. It is applied a moment after the press, and a check at ~0 ms still saw the Draft button.
  - No terracotta error box, no "tuple", no Try again, no `role=alert`.
  - The DB has 0 invoice rows for the project, so the press wrote nothing.
- **Minor.** The held Draft act looks the same as an enabled one (same ink, same underline). That follows "never opacity .5". The reason is only conveyed after pressing, which §A5 allows.

## 2. Link a client → household sheet → link → return → Draft — FAIL (sheet hidden), recovery PASS

[02a](02a-link-a-client-pressed-sheet-hidden-under-composer.png) · [02b DIAGNOSTIC](02b-DIAGNOSTIC-sheet-raised-z70-to-show-it.png) · [02c](02c-returned-lines-kept-stale-reason.png) · [02d](02d-draft-succeeds.png)

- **Pressing Link a client** fires the open-household event. The sheet *does* mount and takes focus (`activeElement` = the sheet's container). It renders at `z-50`, below the composer's `z-[60]` overlay, and `elementFromPoint` at the sheet's centre hits the composer. **On screen nothing changes** (02a). The household picker's Radix popover is also `z-50` and opens hidden too.
- **What a designer would think.** "Link a client does nothing." A second press re-opens the same hidden sheet. Esc closes the hidden sheet, leaves the composer open and puts focus on `<body>`.
- **With the diagnostic raise** (02b), the sheet reads "No client linked · Link a household…". Picking a household without a Patina account (The Okonkwo household) shows an inline "Send invite" confirm, which I cancelled. Picking **Client User** links at once and the sheet switches to "Client User · Active".
- **Return** (Esc, override removed): both ad-hoc lines and values are intact (02c). Two problems:
  - The consequence sentence and Link a client act are correctly gone, but the stale `role=status` reason **"Link a client before drafting this invoice." stays** under the totals after the client is linked. It now contradicts the state.
  - Focus is on `<body>`, not back on the composer.
- **Draft the invoice** then succeeds and opens "Draft invoice · Client User · Okonkwo residence · Draft", with both lines at $850.00 (02d). The DB shows one `draft` invoice.

## 3. Composer from the desk / ⌘K → Link a client — PARTIAL

[03a](03a-cmdk-composer-no-client-link.png) · [03b](03b-cmdk-link-navigated-sheet-hidden-under-composer.png) · [03c](03c-direct-load-sheet-household-opens.png)

- **Opening.** ⌘K → "Draft an invoice" opens the composer with a document picker. Projects without a client are now labelled in the picker ("Halloran House — no client yet", "Chen Residence — no client yet", …), which is new and good. With Halloran House picked, the consequence sentence and a **Link a client** link show *before* any press (03a). Its `href` is `/doc/f1900000-0000-4000-8000-000000000001?sheet=household`, as specified.
- **Clicking it.** The URL changes client-side to `/doc/…?sheet=household` and the household sheet mounts. But the ⌘K composer is global and **stays open on top**, so the sheet is hidden behind it again (03b). Same z-order defect as step 2. Esc closes the hidden sheet and leaves the composer.
- **Fresh load of the same URL.** It opens the household sheet visibly over the Document (03c). The route itself works. What breaks it is the composer staying mounted across the navigation.
- **Style inconsistency (low).** Off the Document, Link a client renders as a plain sentence-case underlined link. On the Document it is the uppercase mono DocumentAction. They are the same act in two visual grammars.

## 4. 390 px, step 1 — PASS with layout defects

[04](04-390-draft-pressed-held-reason.png)

The 390 run used Quill Lane Porch. At 390 the Document shows "Bill 1 uninvoiced" rather than "Draft an invoice", so the composer opened from there, with the Teak porch bench ticked plus two ad-hoc lines ($3,020). Pressing the held Draft the invoice:

- Focus moved to Link a client, and `role=status` reads "Link a client before drafting this invoice.". The consequence sentence "Quill Lane Porch has no client yet. Link one to bill it." sits above it, and there is no horizontal page scroll (`scrollWidth` 390).
- **Defect (medium).** The ad-hoc rows still overflow: the remove "×" for each line sits outside the panel's right edge. Study B saw the same in 01g, so it is not fixed.
- **Defect (low).** "TOTAL $3,020.00" runs into and past the panel's right edge.
- **Defect (low).** The panel is taller than the viewport (top at −177 px, height 1039 px). Its grey scrim ends part-way down, so below about the totals line the page behind shows un-dimmed beside the panel.
- **Note.** Playwright refuses a normal click on the held act because it treats `aria-disabled` as not enabled, so the run used `force: true`. Assistive tech and real users can still activate it, which is the point of §A5.
- The Next dev badge "N" overlaps the start of "Draft the invoice". This only happens in dev.

## 5. Keyboard only, steps 1–2 — step 1 PASS, step 2 FAIL

[05a](05a-keyboard-enter-on-draft-focus-to-link-a-client.png) · [05b](05b-keyboard-tab-focus-inside-hidden-sheet.png)

Run on Halloran House. Script placed focus once on the Document's "Draft an invoice" button. Everything after was Tab, Shift+Tab, Enter, Esc and typing.

- Enter opens the composer and focus goes to the composer panel.
- Tab order: in-full/deposit radios → FF&E checkbox → description → qty → unit → × → Add line → tax → terms → memo → Link a client → Draft the invoice. This is logical.
- Add line keeps focus on Add line. The new row is above it, so the user has to Shift+Tab ×4 to reach the new description. This is minor and not a regression.
- **Enter on Draft the invoice:** the act is held, the reason appears in `role=status`, and focus moves to **Link a client** with a clear 2 px focus ring (05a). PASS.
- **Enter on Link a client:** focus stays on the button with nothing visible. One Tab puts focus on the hidden sheet's "Put back · Esc" button, so the keyboard user is now inside an invisible dialog (05b). FAIL.
- **Esc** closes the hidden sheet and focus drops to `<body>` rather than back to Link a client. A second Esc closes the composer and returns focus to the Document's "Draft an invoice". Closing the composer discards the typed lines, as before the fix.
- A keyboard user cannot link a client from the composer at all.

## Findings, worst first

1. **High: the household sheet opens under the composer** (steps 2, 3 and 5). Seen on `.doc-sheet-layer` `z-50` vs `.paper-folio-overlay` `z-[60]`, and the household picker popover is `z-50` too. The designer sees Link a client "do nothing", and keyboard and screen-reader focus moves into a dialog nobody can see. This breaks the whole recovery path the fix set out to provide. In step 3 it shows up because the ⌘K composer stays mounted across the `/doc/{id}?sheet=household` navigation.
2. **Medium: Esc from the household sheet drops focus to `<body>`** instead of returning it to the Link a client act inside the composer (steps 2 and 5).
3. **Medium: stale held reason after the gap is fixed.** "Link a client before drafting this invoice." stays in `role=status` after the client is linked and the consequence sentence has gone (02c). The designer is told to do something already done.
4. **Medium, 390: ad-hoc row "×" buttons fall outside the composer panel.** Unchanged since Study B 01g.
5. **Low, 390:** TOTAL spills past the panel edge, and the scrim stops part-way down a panel taller than the viewport.
6. **Low:** Link a client has two visual grammars, a DocumentAction on the Document and a plain sentence-case link off it.

What the fix does deliver: the "canonical billing tuple" dead end is gone; the gap is named before and after pressing; the act is held per §A5; nothing is written on a held press; lines survive while the client is linked; and once linked, Draft works first time.
