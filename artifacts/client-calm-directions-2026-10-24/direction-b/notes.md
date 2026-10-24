# Direction B: Lookbook

## Concept

The page reads like a printed lookbook about June's house. On a wide screen a photograph takes
60% of the width at full height and stays pinned while a narrow column of quiet words scrolls
beside it; each chapter brings its own photograph and pushes the last one away, with no script.
On a phone the photograph stacks above its words at 4:5. Each chapter carries only a Playfair
headline from the edition, one or two sentences and the caption. Everything the studio is asking
of June folds into one framed "For you" card: two lines in words, each one tap. The card sits
directly after the arrival headline on desktop and right under the arrival photograph on a phone.
Opening either line lands on the papers view (`pay.html`), where the past-due invoice and its
forest Pay act come first, the other five invoices sit below as quiet rows, and the sofa approval
with its linen swatch follows.

**Remember this:** one photograph at a time, a few words beside it, and everything we need from
June in one card.

Measured by the oracle on the arrival screen: 37 words and 58% photograph at 390×844; 37 words
and 56% photograph at 1440×900.

## What it removes or moves

Measured against today's page (`inputs/today-prod-2026-10-23-page.jpg`):

- **Letterhead block** (studio, house name, "Prepared for"): shrinks to one slim line with the
  studio name. "Prepared for June Brennan" moves to the colophon; "Elm Street House" moves to the
  closing section and the papers view's title.
- **Purpose sentence** ("Pay invoices, review approvals..."): removed. The "For you" card says the
  two actual asks instead of describing the page.
- **Six-link row**: becomes three quiet links, Papers, Maren and Contact.
- **Drawn hero**: replaced by the edition's hero photograph at full height. The drawing returns
  only when a job has no photograph (rank 4; see the zero-photo job).
- **Large "Where the house stands" headline and its numbered eyebrow**: replaced by the edition's
  own short headline ("The sideboard, on the bench."). No numbered eyebrows anywhere.
- **Three standing rows** (amount due, nothing waiting, invoices open): folded into the card's two
  lines. "Six invoices are open, $1,375.00 in all." moves to the closing section and the papers
  view.
- **Status sentences and the project-sections rail** (Discovery, Design...): the rail is
  dropped; the stage moves into the "Next, the living room" chapter as a sentence ("Elm Street
  House is in procurement... 22 January 2027").
- **Invoice section on the page**: moves behind one tap to the papers view.
- **Maren's note**: keeps its own chapter, beside a walnut photograph, inside `[data-letter]`.

## Spec rules this direction changes

Every row is a founder decision; none is settled by this mockup.

| Rule | Proposed | Why it buys calm | What June could miss |
|---|---|---|---|
| A purpose sentence on arrival. | Dropped. The "For you" card names the two real asks in words. | The first thing June reads is about her house and her two asks, not about the software. | A first-time visitor gets no one-line explanation of what the page is for; the studio's invite email has to carry it. |
| The link row "Invoices · Approvals · Progress · Updates · Documents · Contact Maren Holt" as page furniture. | A slim top line: studio name plus three links, Papers, Maren and Contact. Progress and Updates are the chapters themselves; Approvals live in the card and in Papers; Documents move into Papers. | Six underlined links were the busiest band on the screen. Three short words read as a masthead, not a control panel. | A homeowner who looks for a Documents or Approvals word in the top line will not find it; she has to know that Papers holds them. |
| Three standing lines above the first image. | Dropped. The two lines that need June (past due, sofa answer) live in the card; the count and total move to the end of the page and to Papers. | Nothing competes with the photograph or the headline; the card is the only framed thing on the screen. | "Nothing waiting on you" is no longer said in words when it is true; when the card is empty it disappears, and June has to read silence as all clear. |
| All invoices visible in four groups. | One tap away. The past-due invoice stands alone in front with its Pay act; the other five follow as quiet rows, each with its date and amount in words; no groups. | The arrival screen carries one money line instead of a ledger. | June does not see the invoices due today, 2 November, 14 November and 30 November until she opens Papers. The $100.00 due today is the closest miss. |
| The hero is never above the first money or approval act (Q1). | On desktop the photograph sits beside the card, on the same screen. On a phone the photograph sits above the card, which is still on the arrival screen (both asks visible without scrolling at 390×844). | The photograph leads, which is the reason June opens the page, while the asks stay in view. | On a short phone (under about 780px tall) the card's second line can fall below the fold until June scrolls. |
| Photography capped at 72% of the viewport (C2). | Uncapped in height: on desktop the photograph is full viewport height across 60% of the width; on a phone it is full width at 4:5. | One image owns the screen, like the references. | Each chapter's photograph takes a full screen of scrolling on a phone; a page with many chapters gets long. |
| Numbered chapter eyebrows. | Dropped. Each chapter has only its Playfair headline. | Removes a layer of small capitals and numbers that read as a report. | Chapters cannot be named by number in a call ("see section 3"); the studio refers to them by headline. |

## How editions drive it

An approved `client_editions.composition` supplies, and this direction shows:

- **Hero asset and focal point**: the arrival plate. The focal point maps straight to
  `object-position` on the pinned photograph, which is cropped differently at 60% × full height
  and at 4:5.
- **Chapter headlines and standing sentences**: each chapter's Playfair headline and its one or
  two sentences, in the studio's voice.
- **Chapter order**: the order of the chapter sections, and so the order the pinned photographs
  replace each other.
- **Alt text and caption fields**: the `<img alt>` and the caption's what · whose · when line.

It drops: any edition eyebrow or kicker, and any third sentence (the column holds two). Code still
picks image rank (installed photograph, studio board or scan, maker's photograph, drawn
silhouette) per chapter; the edition never overrides rank.

Code, not the edition, owns the "For you" card: it lists only open asks (a past-due or due-today
invoice, an approval waiting on June), each as one sentence with its amount or subject. When there
are none the card is not drawn.

When a new edition is approved the page changes in three places: the arrival photograph and its
headline, the chapter order and sentences, and the captions. The card and the papers view change
only when the money or approvals change, not with the edition.

## Zero-photo job

`empty.html` keeps the same split on the same paper. The plate column turns to stock and carries
what the studio actually has: the sideboard drawn from its specification with the four house
paints beneath it, a drawn plan of the living room beside Maren's note, the sofa drawn with a chip
of the oatmeal linen colour, and the paint as four tall swatches. Captions say "drawn" and
"Drawn from the specification. Photographs to follow." There are no stock images and nothing is
presented as June's room. The card, the headlines and the papers are unchanged, so June's two
jobs work the same on day one.

## Risks

- **The pinned split depends on the column being long enough.** A chapter with one short sentence
  pins its photograph over a tall paper column; the page relies on generous vertical space, which
  some will read as empty. Each chapter is set at 130% of the screen height to give the pin room.
- **Placeholder photographs.** Several plates are studio references (the sofa, the living room
  light). Captions say "for reference" and name the studio board as whose, but in production a
  reference must never sit as the arrival hero; rank rules have to keep a board image below a
  maker's or installed photograph.
- **The card is the only route to money on arrival.** If the card logic misses an ask, June has
  no other cue on the first screen. Papers in the top line is the fallback.
- **Paint colours are drawn approximations** of fictional names; the studio would supply real
  values.
- **No dark neutral is added**; a very bright hero photograph against paper can feel washed out.
  The palette is the brief's light palette only, and all three faces (Playfair Display, Inter,
  DM Mono) are kept.
- **Long phone scroll.** Five chapters of 4:5 photographs make a long page on a phone; the studio
  should keep editions to four or five chapters.
