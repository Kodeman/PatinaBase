# US-35 walk-after-repair: the repaired composer on client-less projects

Walked 2026-10-16 against main `f09a3599d`, which contains SQ-1028 (`827c5b30d` repair, merged with `60d038a74`). Ticket SQ-1030. This repeats the SQ-1027 walk in [../walk-after/walk-after.md](../walk-after/walk-after.md).

## Verdict

| Step | Result | One line |
|---|---|---|
| 1. Held Draft on the Document | **PASS** | The act is held, the consequence sentence shows, focus moves to Link a client, and the reason goes to `role=status`. `aria-describedby` on Draft points at that status line. |
| 2. Link a client → sheet above composer → Esc → link → Draft | **PASS** | The household sheet now opens visibly above the composer and holds focus. Esc closes only the sheet and returns focus to Link a client. After linking, the lines are intact, the stale reason is cleared and Draft succeeds. |
| 3. ⌘K composer → Link a client | **PASS** | After the client-side navigation to `/doc/{id}?sheet=household`, the sheet opens visibly above the still-mounted ⌘K composer. Esc returns focus to Link a client. |
| 4. 390×844, step 1 | **PASS with layout defects** | The held behaviour is correct. The "×" buttons and the TOTAL still overflow the panel edge. |
| 5. Keyboard only, steps 1–2 | **PASS with one focus gap** | Everything works by keyboard. After linking, though, focus falls to `<body>`, and it takes 73 Tabs through the covered Document to get back to Draft the invoice. |
| 6. Non-lead | **PASS** | Studio Manager, who is not the project's `designer_id`, sees "Ask Leah Hartwell to link one." with no Link a client act. The held reason names Leah. |

The SQ-1027 high-severity defect, where the sheet opened under the composer, is fixed at every entry point.

## Setup

- **Runtime.** Local Supabase was already up on `127.0.0.1:54321`. I started the designer portal alone from the main checkout (`main` = `f09a3599d`) with `pnpm turbo run dev --filter=@patina/designer-portal` on :3000. I did not run `pnpm dev` or reset the DB, and I read no `.env` file.
- **Target check.** I decoded the session JWT on every run. `iss` was `http://127.0.0.1:54321/auth/v1` each time, and the runs made 0 requests to `*.supabase.co`.
- **Browser.** Every step ran in headless Playwright 1.58.2 (Chromium). Steps 1–3, 5 and 6 used 1400×900. Step 4 used 390×844 at DPR 2. I signed in through the dev-accounts panel as `designer@patina.dev` (Leah Hartwell, the lead on every project used). Step 6 used `studio_manager@patina.dev` (Studio Manager, admin of the same studio).
- **Projects.** All were seeded local projects with `client_id is null` and `studio_id` set:
  - Halloran House `f19…0001` for steps 1–2
  - Quill Lane Porch `f19…0005` for steps 3, 4 and 6
  - Harrow Road Flat `f19…0002` for the first step-5 run
  - Wren Street Library `f19…0003` for the step-5 rerun
- **Data written, all local and kept:**
  - Halloran House: linked to the household **Client User** (`client_id` = `a0000000-…-0005`). One draft invoice `a0f6f8f5…` for $850 with two ad-hoc lines, "ZZ US-35 repair walk · design consultation" $600 and "· site measure" $250.
  - Harrow Road Flat: linked to **Client User** by keyboard. No invoice: the first keyboard run stopped after the link (see step 5).
  - Wren Street Library: linked to **Client User** by keyboard. One draft invoice `0546958a…` for $5,890, made of the two ad-hoc lines plus the pre-ticked FF&E "Library ladder and rail, walnut" $5,040.
  - Quill Lane Porch is still client-less, and its composers were left undrafted.
- **Dev server.** I stopped it with TaskStop, and :3000 is free. The dev server had rewritten `apps/designer-portal/next-env.d.ts` in the main checkout (`./.next/dev/types/routes.d.ts`). I restored the committed bytes, and `cmp` against `HEAD` is clean. Another `next dev -p 3011` under `~/Code/PatinaWebsite` is not mine and I left it alone.
- **Probe output.** The JSON for every step is under the board verification folder `…/verification/SQ-1030/step*.json`.

---

## 1. Client-less project → two ad-hoc lines → Draft the invoice — PASS

[01a](01a-before-press-consequence-and-link.png) · [01b](01b-draft-pressed-held-focus-link-a-client.png)

- **Before pressing.** "Halloran House has no client yet. Link one to bill it." sits above the act with **Link a client** under it (§A6). Draft is already `aria-disabled="true"`, not natively disabled, at opacity 1. `aria-describedby="_r_q_"` points at the `role="status"` paragraph, which is empty and `sr-only` at this point.
- **After pressing Draft the invoice** (two lines, $850):
  - The status line `_r_q_` becomes visible and reads **"Link a client before drafting this invoice."** Draft's `aria-describedby` still points at it.
  - Focus is on the **Link a client** anchor.
  - No `role=alert`, no terracotta band, no "tuple".
- **Observation (low).** After a mouse press, the moved focus shows no visible ring (01b). The keyboard press does show the ring (05a). This is `:focus-visible` behaving as designed, but a pointer user gets no visual cue that focus moved.

## 2. Link a client → household sheet → Esc → link → Draft — PASS

[02a](02a-link-a-client-sheet-above-composer.png) · [02b](02b-esc-closes-sheet-focus-on-link-a-client.png) · [02c](02c-household-picker-above-composer.png) · [02d](02d-client-linked-in-sheet.png) · [02e](02e-returned-lines-intact-reason-cleared.png) · [02f](02f-draft-succeeds.png)

- **Pressing Link a client** opens the household sheet. Its `.doc-sheet-layer` is now `z-index: 65`, above the folio's 60.
  - `elementFromPoint` at the sheet centre lands in the sheet, not the composer.
  - The stack state is `top`, and focus is inside the sheet ("No client linked · Link a household…", 02a).
- **Esc** closes only the sheet. The composer stays open with both lines, and focus returns to the **Link a client** anchor (02b).
- **The picker popover** opens above both layers, at the `z-[70]` class (02c).
  - **Observation (low):** the search "Client User" lists **two identical "Client User · client@patina.dev" rows**. The designer cannot tell which to pick. This is probably seeded duplicate households, but the picker gives no distinguishing detail.
- **Picking Client User** links at once, and the sheet shows "Client User · Email client@patina.dev · Relationship Active" (02d). Focus then sits on `<body>` while the sheet is still open.
- **Return (Esc).**
  - Both lines and prices are intact.
  - The consequence sentence and the Link a client act are gone.
  - **The status line is empty and back to `sr-only`, so the stale-reason defect from SQ-1027 is fixed.**
  - Draft is no longer `aria-disabled` and has no `aria-describedby` (02e).
  - Focus is on `<body>`, because the act it would return to has unmounted. See step 5 for the keyboard cost.
- **Draft the invoice** succeeds first time. It opens "Draft invoice · Client User · Halloran House · Draft" with both lines at $850.00 (02f). The DB has one `draft` invoice.

## 3. Composer from ⌘K → Link a client — PASS

[03a](03a-cmdk-composer-quill-lane-link-a-client.png) · [03b](03b-cmdk-link-navigated-sheet-above-composer.png) · [03c](03c-cmdk-esc-closes-sheet.png)

- **Opening.** From `/desk`, ⌘K → "Draft an invoice" → Enter opens the composer. The document picker labels the client-less projects "— no client yet". Halloran House, linked in step 2, has lost its label.
- **With Quill Lane Porch picked,** the consequence sentence and Link a client (`href=/doc/f19…0005?sheet=household`) show before any press. Draft is held and described (03a).
- **Clicking Link a client** navigates client-side to `/doc/f19…0005?sheet=household`. The ⌘K composer stays mounted at z 60, and the household sheet opens at z 65 above it, takes focus, and the centre hit-test lands in the sheet (03b). This is the SQ-1027 failure, now fixed.
- **Esc** closes the sheet. The composer stays, and focus returns to Link a client (03c).
- **Observation (low).** The URL keeps `?sheet=household` after Esc, so a reload re-opens the household sheet.
- **Unchanged (low).** Off the Document, Link a client is now the same uppercase DocumentAction as on it. The SQ-1027 "two visual grammars" finding is resolved.

## 4. 390 px, step 1 — PASS with layout defects

[04a](04a-390-draft-pressed-held-reason.png)

The run used Quill Lane Porch. At 390 the Document's entry is "Bill 1 uninvoiced", which opens the composer with the Teak porch bench ticked. I added two ad-hoc lines ($3,450) and pressed the held Draft with `force: true`, because Playwright treats `aria-disabled` as not enabled.

- **Held behaviour passes.** The consequence sentence "Quill Lane Porch has no client yet. Link one to bill it." shows, and the status line reads "Link a client before drafting this invoice." Focus is on Link a client, and `aria-describedby` points at the status line. There is no page-level horizontal scroll (`documentElement.scrollWidth` 390).
- **Defect (medium), unchanged since Study B and SQ-1027.** The "×" Remove line buttons sit at x 376–400. The panel's right edge is at 372 and the viewport is 390, so the buttons are outside the panel and partly off-screen.
  - The panel's own `scrollWidth` is 414 against a `clientWidth` of 352.
- **Defect (low), unchanged.** The totals group "TOTAL $3,450.00" ends at x 379, past the panel edge at 372. In the screenshot the last digits cross the panel border.
- **Defect (low), unchanged.** The panel is taller than the viewport (top −177, height 1034). The folio's grey scrim stops part-way down, so the Document shows un-dimmed below about the TOTAL line.
  - The same un-dimmed band shows at desktop size along the bottom ~80 px (y ≈ 760–840 in 01a/01b/02a, beside the left rail's "Project directory").
- The Next dev badge "N" overlaps the start of the status line at 390. This only happens in dev.

## 5. Keyboard only, steps 1–2 — PASS with one focus gap

[05a](05a-keyboard-enter-draft-held-focus-link-a-client.png) · [05b](05b-keyboard-enter-link-sheet-above-with-focus.png) · [05c](05c-keyboard-esc-focus-back-on-link-a-client.png) · [05d](05d-keyboard-client-linked.png) · [05e](05e-keyboard-returned-focus-on-body.png) · [05f](05f-keyboard-draft-succeeds.png)

I placed focus once by script on the Document's entry button. Everything after that was Tab, Shift+Tab, Enter, Esc and typing.

The first run was on Harrow Road Flat. It passed through Esc and through the keyboard link, then stopped at the return (see the gap below). The screenshots come from the full rerun on Wren Street Library, which behaved identically up to the return.

- **Composer.** Enter opens it. Tab reaches the line description, then Tab Tab reaches the unit price. Tab goes to Add line and Enter adds a row. Focus stays on Add line, so Shift+Tab is needed to reach the new description. Typing completes line 2.
- **Enter on Draft the invoice** holds it. The reason appears in `role=status`, and focus moves to **Link a client** with a visible 2 px focus ring (05a). PASS.
- **Enter on Link a client** opens the sheet visibly above the composer, with focus in it (05b). The first Tab lands on the sheet's "Put back · Esc" (Close sheet) button, inside the visible sheet. PASS. This was the SQ-1027 failure.
- **Esc** closes only the sheet, and focus returns to Link a client (05c). PASS.
- **Linking.** Enter on Link a client again, then Tab to "Link a household…", then Enter. Typing "Client User" and pressing Enter links the client (05d). PASS.
- **The gap (medium).** After the link, Esc closes the sheet and focus lands on `<body>` (05e), because the Link a client act it would return to no longer exists.
  - From `<body>`, Tab walks through the Document underneath the open composer: skip link, rail, Document controls, footer, ⌘K, inbox, account. That is 57 stops, all outside the folio.
  - Focus only re-enters the composer at the 58th stop, and **Draft the invoice is the 73rd Tab**.
  - A keyboard or screen-reader user is effectively dropped out of the composer at the moment the composer became ready to draft. It also shows that the composer folio does not keep focus inside itself once focus has left it.
  - On Harrow Road Flat my 40-Tab budget ran out before reaching Draft, which is why that run has no invoice.
- **Draft the invoice** (Enter, after the 73 Tabs) succeeds and opens "Draft invoice" (05f). The DB shows one `draft` invoice for $5,890.

## 6. Non-lead — PASS

[06](06-nonlead-ask-lead-no-act.png)

A seeded non-lead exists. `studio_manager@patina.dev` (Studio Manager) is admin of studio `b0…01` and is not `designer_id` (`a0…04`, Leah Hartwell) on Quill Lane Porch. The `projects_studio_select` policy (`is_studio_comember(designer_id)`) lets them open the project.

- The composer shows **"Quill Lane Porch has no client yet. Ask Leah Hartwell to link one."** There is **no Link a client act** (0 links in the folio).
- Pressing Draft holds it. The status reads **"Ask Leah Hartwell to link a client before drafting this invoice."**, and `aria-describedby` points at it.
- With no fix act to move to, focus stays on Draft the invoice. That is acceptable, because the reason is announced through the status line.
- Nothing was written.

## Findings, worst first

1. **Medium: after linking a client from the composer, focus drops to `<body>`** (steps 2 and 5).
   - The sheet's Esc restore target, Link a client, unmounts when the gap fills.
   - A keyboard user then has to Tab 73 times, 57 of them through the covered Document, to reach Draft the invoice.
   - The designer thinks the composer has gone or has lost its place. A screen-reader user hears the Document's skip link as if the dialog had closed.
   - Focus is also on `<body>` inside the still-open sheet right after the pick (02d).
2. **Medium, 390: the ad-hoc "×" Remove line buttons fall outside the composer panel** (x 376–400 against the panel edge at 372). They are partly off-screen and still unchanged since Study B and SQ-1027.
3. **Low, 390: TOTAL crosses the panel edge** (ends at 379 against 372).
4. **Low: the folio scrim stops short** of the bottom of the viewport. At 390 the cut is below the TOTAL line. At 1400×900 it is the last ~80 px, so part of the Document shows un-dimmed beside the composer.
5. **Low: duplicate "Client User · client@patina.dev" rows** in the household picker search. A designer cannot tell the two apart.
6. **Low: `?sheet=household` stays in the URL** after the sheet is put back from the ⌘K path, so a reload re-opens the sheet.
7. **Low: a mouse press on held Draft moves focus to Link a client with no visible ring**, because of `:focus-visible`. A sighted pointer user gets no cue beyond the status sentence.

Fixed since SQ-1027:
- The sheet lays above the composer on the Document and after ⌘K navigation, including its picker popover.
- Esc returns focus to Link a client.
- The stale held reason clears once the client is linked.
- Draft's `aria-describedby` points at the reason.
- Link a client has one visual grammar on and off the Document.
- Non-leads are told whom to ask and are shown no dead act.
