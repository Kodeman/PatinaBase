# Gallery (Direction A): build decisions

Kody chose Direction A, "Gallery", for the homeowner client page on 24 October 2026, and ruled
on everything below in an interview that day. The build works from this file and the rewritten
usability spec, not from the chat.

## Decisions

1. **Money on the band.** The asks line names the amount of the most urgent item only:
   "$600.00 past due, and the sofa." With several overdue: "Two invoices past due, $700.00, and
   the sofa." The open total stays in the drawer. When nothing is waiting: "Nothing from Maren
   today", linking to the invoices. Code writes the line from live state, never the edition.
2. **Anchors are permanent addresses.** No email or Stripe change.
   - `#doorstep`, `#ledger`, `#letterbox` open the drawer, most urgent invoice on top.
   - `#approvals` opens the drawer at the approval.
   - After a payment, the `#letterbox` return opens the drawer with a receipt line on top
     ("Paid $600.00 on 24 October. Thank you."); the paid invoice leaves the list.
   - `#note`, `#road`, `#previously`, `#mat` scroll to Maren's note, the room sentence, Earlier,
     and the footer.
   - The drawer opens over the page; Back and Escape close it; focus returns to what opened it.
3. **Hero eligibility.** A full-screen hero must be at least 2000px long side and 1200px short
   side, on a real scene (not a white catalogue ground), and an installed, studio, workshop or
   scan photograph, never a concept render. Code enforces it. When nothing qualifies, the arrival
   is the paint card (the job's palette as full-height stripes). Never stock, never a weak photo.
   Catalogue clippings appear only at piece size on paper. The designer previews the phone and
   laptop crops with the band in place and can drag the focal point before approving.
4. **Editions.** New composer prompt version shaped for Gallery: band headline 3–6 words and at
   most 40 characters; chapter names 2–4 words (shown only in Menu); one sentence per photograph,
   at most 25 words; all checked by code. The designer's Press band shows exactly what June sees.
   Already-approved editions keep rendering; a headline too long for the band falls back to the
   house name. No forced re-compose at launch.
5. **Drawer order.** One drawer. The two asks first, in the band's order: the past-due invoice
   with Pay, then the approval in full (photograph and caption, the changes in words, the
   consequence note above the act, green hold-to-approve with the amount, and an "Ask Maren a
   question" link that drafts a reply, never sends). Then a rule and "Also open, $775.00" with
   the other invoices as quiet rows, each with its own Pay. With both asks done, the drawer opens
   on the invoice list.
6. **Other houses.** The band speaks only for the house June is standing in. Menu lists the other
   house right after the asks, with today's waiting sentence ("Lake Cottage, a paper is waiting
   there."). The footer keeps "Your other projects" as today.
7. **Purpose sentence.** Dropped from the page for good. The invite letter
   (`supabase/functions/_shared/client-letter.ts`) gains: "You can pay invoices and approve
   pieces there, and Maren will write when something needs you." No welcome overlay or tour.
8. **Scroll cue.** The arrival is the viewport height minus 48px, so the first line of the hero's
   caption shows below the band. No arrow, label or animation.
9. **Rollout.** Everyone at once, no flag. Today's page is replaced in one release. The
   automated gate must cover every email and Stripe anchor, Pay and Approve end to end, 390 and
   1440, and an accessibility pass. Rollback: redeploy the previous client-portal version.
10. **Piece detail.** Chapters stay one photograph, one caption, one sentence. Each room chapter
    ends with "Every piece in the living room", opening a drawer of rows (thumbnail, name, status
    in words, expected date when known; no counts or bars). The floor plan moves into Menu as
    "The house". "Where things stand" folds into each room's sentence. Earlier and the documents
    move to the footer beside invoices and "Call Maren Holt". Nothing June sees today is deleted.
11. **Spec rulings**, to be written into `docs/specs/_active/client-portal-homeowner-usability.md`
    as decided by Kody, 24 October 2026:

| # | Rule today | Ruling |
|---|---|---|
| 1 | Purpose sentence on arrival | Dropped; the invite letter says it once |
| 2 | Six-link row as page furniture | One Menu: asks, the other house, chapters, The house, invoices, documents, Call Maren Holt |
| 3 | Three standing lines | One band line naming the most urgent amount |
| 4 | Every invoice on the page | All in the drawer, asks first, then "Also open" |
| 5 | No image above the first money act (Q1) | Allowed; Pay is one tap from the band line |
| 6 | Photographs capped at 72% (C2) | Lifted on the homeowner page (viewport minus 48px; heroes per decision 3); the 120px cap stays on studio surfaces |
| 7 | Numbered chapter eyebrows | Dropped; captions name photographs, Menu names chapters |

Unchanged: 16px text, 44px targets, 48px final act, status in words, green only on Pay and
Approve, consequence note above the act, 360/390 and 200% zoom.

Mockup and notes: `direction-a/`. Deck: https://claude.ai/artifact/Qz6K8Fz9vHqesvAY9RMydo
