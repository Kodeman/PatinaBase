# VoiceOver script: the billing spotlight (R2), about 10 minutes

**For Kody.** This is a record of K15. He already cleared it in R186, "OK to ship, fix straight from inside the window". Each step says what to do, what VoiceOver should say (the wording may vary a little), and has a box to tick.

## Before you start (about 1 minute)

- **Local only.** `apps/designer-portal/.env.local` must have `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`.
- Run `pnpm dev:designer` and open `http://localhost:3000` in **Safari** (best with VoiceOver) or Chrome.
- Sign in as `designer@patina.dev` / `password123`.
- **Fixtures:** in `artifacts/spotlight-2026-10-16/R2`, run `node walk-seed.mjs` once, then `node fixtures.mjs base`.
  - These give you Ashgrove Mudroom (no client), Wren Street Library (milestone, no client) and Juniper Row (a household with no email).
  - To repeat step 2, clear Ashgrove's client: `update projects set client_id=null where name='Ashgrove Mudroom'` (local psql, `session_replication_role=replica`).
- **VoiceOver:** turn it on with ⌘F5. VO = Control+Option. Use **Tab / Shift-Tab** to move between controls and **VO+→** to read on.

## Script

| # | Do | You should hear | Pass |
|---|---|---|---|
| 1 | Open **Ashgrove Mudroom**. Tab to **Project financials** and press Return, then Tab to **Draft an invoice** and press Return. | "Draw an invoice, dialog", then the sheet's first control. | ☐ |
| 2 | Tab to **Draft the invoice**. | "Draft the invoice, dimmed button" (or "unavailable"), then the reason: "Link a client before drafting this invoice." | ☐ |
| 3 | Press **Return** on Draft. | "2 things need attention. First: Link a client before drafting this invoice." Focus is on "Link a client, link". | ☐ |
| 4 | Press **Tab** a few times, then **Shift-Tab**. | Only controls inside the lit windows (the lines, Add line, Link a client) and the bar ("Next", "Close"). Nothing from the dimmed parts of the sheet or from the page behind it. | ☐ |
| 5 | Press **Esc** once. | The spotlight closes and the "Draw an invoice" dialog stays. Focus is back on "Draft the invoice". Press Esc a second time only to check that the sheet closes then, and reopen it. | ☐ |
| 6 | Press Return on Draft again, then Return on **Link a client**. | "The household, dialog". The household sheet is above the composer. | ☐ |
| 7 | Tab to **Link a household…**, press Return, type "Client", choose **Client User** with the arrows and Return. | The options are read ("Client User, client@patina.dev · Linden Attic"). After the pick: "Client User", Email client@patina.dev. | ☐ |
| 8 | Press **Esc** to put the household sheet back. | Back in "Draw an invoice". *Known (finding 2): the spotlight has closed although "Add at least one line first" remains. Note whether anything is announced.* | ☐ |
| 9 | Press Return on **Draft the invoice**. Then, inside the window, tick **ZZ Oak entry bench** with Space. | "1 thing needs attention: Add at least one line first." After Space: "checked". The spotlight closes and focus goes to "Draft the invoice", which is no longer dimmed. | ☐ |
| 10 | Close the composer (Esc). Open **Wren Street Library**, then use VO+U → Form controls (or Tab) to find **Generate invoice** in Payment schedule. | "Generate invoice, dimmed button", then "Wren Street Library has no client yet. Link one to bill it." | ☐ |
| 11 | Press Return on Generate invoice, then Esc. | "1 thing needs attention…". Tab moves only between "Link a client" and "Close". After Esc, focus is back on "Generate invoice" and nothing was drafted. | ☐ |
| 12 | Open **Juniper Row**. Open the draft invoice from the Money margin ("Margin · N"), then Tab to **Send the invoice**. | "Send the invoice, dimmed button", then "Add Juniper's email to send this." | ☐ |
| 13 | Press Return on Send. | "1 thing needs attention: Add Juniper's email to send this." Focus is on "Add their email". The invoice is still a **draft**: the header still says DRAFT. | ☐ |
| 14 | Press Return on **Add their email**. | "The household, dialog", above the folio, with focus in the email field. Type an address, Tab to **Save** and press Return. | ☐ |
| 15 | Return to the folio (Esc if the sheet is still open). | Focus is on "Send the invoice", no longer dimmed, and no spotlight. *Optional: Send then reads "Send the invoice · $450.00". Locally the email fails without a Resend key, and the folio says "Could not send — issued as INV-…".* | ☐ |
| 16 | Turn VoiceOver off (⌘F5). | — | ☐ |

**Timing:** steps 1–9 take about 5 minutes, steps 10–11 about 1.5 minutes, and steps 12–15 about 2.5 minutes. With setup, the total is about 10 minutes.

## Known from the headless walk

So that a missing bar is not mistaken for a VoiceOver problem:

- On a tall sheet, the bar holding the reason, **Next** and **Close** can sit above the visible screen. VoiceOver still reads it and Tab still reaches it. This is finding 1 in `report.md`.
- In the "no-studio" composer, **Next** stops at "2 of 3". This is finding 3.

Verdict: ☐ pass ☐ pass with notes ☐ fail. Notes:
