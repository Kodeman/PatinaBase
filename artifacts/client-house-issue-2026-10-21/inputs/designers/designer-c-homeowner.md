# Designer C — Homeowner experience + accessibility: June's page

Grounded in code: `since-yesterday.tsx` dims only opt-in `data-dimmable` elements and never the doorplate/doorstep/letterbox/gates; `ArrivalLine` and `LandmarkLedger` sit under the doorplate outside the dimming; `room-band.tsx` already renders a `ConceptRenderPlate` as a `figure` with the on-image "Concept · not installed" label.

## 1. June's week (Procurement, Elm Street House)

**Mon.** Email: "Birchwood Studio sent you an invoice." She lands on `#letterbox`. Purpose sentence, link row, then "$600.00 is past due · Pay". She pays. The page is the receipt. **Tue.** She opens it out of habit; everything is dimmed to 0.3 except the standing sentence, which says the same thing it said yesterday: *Now: Procurement. Next: Living room installation. Target 22 January 2027.* The sameness is the reassurance. **Wed.** Maren's letter arrives (16 Oct update). The `#note` unit carries the forest tick; the rest sleeps. She replies. **Thu.** A workshop photo of the walnut sideboard arrives; the living room RoomBand gets a new plate, captioned *Walnut sideboard, in the workshop · photographed by Harmon Bench Works · 15 October 2026*. The page re-leads with it. She shows Arlo. **Fri.** Nothing changed. She reads the sideboard caption again. **Sat.** She looks at the Lake Cottage from `#mat`. **Sun.** "Living room sofa, edition 2" is still awaiting her; it was never urgent, so the page never said so. She approves it with the hold.

**Five honest return hooks:** (1) the edition changing with the job: a new plate, a new letter, a new invoice, nothing else; (2) the standing sentence, unchanged most days, which is the point; (3) "since yesterday" dimming, so a glance answers "anything?" in two seconds; (4) the dated photo plate, a thing to show someone; (5) the record itself: paid invoices and approvals as a ledger she can trust.

**Five dishonest hooks, forbidden:** streaks/"you've visited 4 days running"; "% complete" or progress bars; unread counts or badges in the link row; manufactured novelty (rotating heroes, "piece of the day", auto-cycling carousels); nudges disguised as news ("Don't miss…", "Still waiting on you!", scheduled re-sends).

## 2. Image-led page vs the woman who owes $600

Risk: a full-viewport hero turns the first screen into a brochure for a house she is already paying for, hides the past-due amount, and reads to a low-confidence user as "wrong website".

**Rule: the hero goes below the link row and below the first money/approval line.** The letterhead is the arrival; the image is the first chapter. Arrival at 390px, 740px visible:

| y (px) | Element |
|---|---|
| 0–96 | Doorplate: Birchwood Studio · Elm Street House · June & Arlo Brennan (letterhead, not fixed) |
| 96–132 | Purpose sentence, 16px: "Pay invoices, review approvals, and follow your project here." |
| 132–196 | Link row, wrapped to two lines, 44px targets: Invoices · Approvals · Progress · Updates · Documents · Contact Maren Holt |
| 196–244 | Standing line, 16px: "Six invoices are open; $600.00 is past due. One edition awaits your approval." (each clause a link to its anchor) |
| 244–520 | **Hero plate**, 16:10 at 358px wide = 224px tall, inside a framed card (#FFFDF9 / 1px #C9C7BD / 8px), caption below in 12px `.t-meta`, chapter headline above it in the display step |
| 520–740 | `#doorstep` begins: status sentence, then the first letterbox item ("Invoice 0142 · $600.00 · past due · Pay") with the consequence note above the forest button |

A 390px hero never exceeds 224px (16:10, one card wide) so the first act is always in the first 740. On desktop the plate may widen to the content column but never to the viewport; no `100vh`. No video.

## 3. Reading the images

**Caption grammar (model proposes, designer approves, never auto-publishes):** `what · whose · when`, sentence case, three segments separated by middle dots, each a plain noun phrase, no adjectives of praise. The model fills from structured fields (item name, source type, source party, date); it may not invent any segment. A plate with an unfillable segment is not shown; the silhouette is.

- Installed: *Reading chair, installed in the living room · photographed by Birchwood Studio · 3 September 2026*
- Workshop: *Walnut sideboard, in the workshop · photographed by Harmon Bench Works · 15 October 2026*
- Maker catalogue: *The same model, from Harmon Bench Works' catalogue · not her piece · hers is in production.* Say "this model", never "your sideboard".
- Studio board/scan: *Living room, scan drawing · by Birchwood Studio · 2 June 2026*
- Concept: on-image label "Concept · not installed" ≥14px, plus caption *Concept render of the living room · by Birchwood Studio · 12 May 2026 · not installed*.
- Silhouette: *Walnut sideboard · drawing · photograph to follow*.

**Alt text** = the caption's first two segments plus the source kind: `alt="Walnut sideboard in the workshop, photograph from Harmon Bench Works"`. Never "image of". **Load failure:** swap `<img>` for the silhouette SVG inside the same `figure`; `figcaption` stays and gains a trailing *· picture did not load*. No broken glyph, no blank fill, no spinner.

## 4. Re-composition without the ground shifting

**Never moves:** doorplate; purpose sentence; link row order and labels; every anchor; the four invoice groups and their order; chapter order (doorstep → approvals → rooms → road → note → previously → mat); the colophon.

**May change, only when the job moves:** the hero plate (the newest real photograph of a piece on this job, else the studio's current board, else no hero, never a filler); the chapter headline above it; the plate palette (border and caption tint drawn from the photo); the RoomBand lead image.

**Not a trigger:** time passing, visits, or model whim. Re-composition is an event in the ledger, so "since yesterday" treats it as one changed unit: the hero gets the forest tick, everything else dims as usual, and the notice sits directly under the plate, in Maren's voice, as the first line of her letter rather than system chrome:

> *The page now opens on your sideboard; the workshop sent photographs on 15 October. Everything else is where it was. — Maren*

Palette shifts are limited to the plate card; the page stock, ink, forest, and note colours never change.

## 5. Accessibility spec for plates

- `<figure>` with `<img alt>` and `<figcaption>`. Decorative duplicates get `alt=""`.
- Caption ink is **never** placed on the photo. It sits on a fixed stock: #FFFDF9 card with the house `--text-muted` ink (≥4.5:1 against the card per R140). The job palette tints only the 1px border and an optional 4px rule. If a palette colour is ever a background, the ink is chosen from two fixed inks (paper or charcoal) by computed contrast at render, 4.5:1 floor, fallback to the plain card. On-image label "Concept · not installed" sits on a #FFFDF9 chip, not raw photo.
- Focus order: doorplate → purpose sentence → link row (6 links) → standing-line links → hero figure (only if it links to its RoomBand; otherwise not focusable) → first act. VoiceOver reads: studio, house, purpose sentence, "list, 6 items", standing line, "figure, Walnut sideboard in the workshop… caption …", then the invoice.
- Reduced motion: no plate transitions; `since-yesterday`'s 300ms opacity drops to 0 under `prefers-reduced-motion`. No autoplay anything, ever.
- 200% zoom at 390px (effective 195px): plate stays 16:10 at container width, caption wraps, never truncates; headline wraps to three lines rather than shrinking below 16px.
- Targets 44px; a tappable plate has a visible label ("See the living room"), not an image-only link.

## 6. The engagement test

1. Would Maren say this to June's face, in these words?
2. Does it still make sense if June visits once a month?
3. Does it change only when the job changes?
4. Is it true in the caption-grammar sense (what · whose · when), with no segment invented?
5. Would June lose anything if it were removed?

| Element | 1 | 2 | 3 | 4 | 5 | Verdict |
|---|---|---|---|---|---|---|
| Hero plate (real photo, captioned) | yes | yes | yes | yes | yes | Keep, below acts |
| Numbered chapter indices | yes | yes | yes | n/a | no | Allow as quiet wayfinding; never as progress |
| "New since your last visit" | yes | yes | yes | yes | yes | Keep; it is the dimming, not a badge |
| "Piece in making" provenance block | yes | yes | yes | yes | yes | Keep: maker, material, order date, expected date, workshop photo |
| Maker brand story | no | yes | no | partial | no | Reject on homeowner page; one maker line in provenance is enough |
| Paid-invoice archive | yes | yes | yes | yes | yes | Keep; it is the record |

## 7. Fitosauna

**Reject:** full-viewport video hero; repeated "Get a consultation" CTA; testimonials; guarantees; auto-advancing carousels; sticky blurred header; menu overlay/hamburger; stock lifestyle people; parallax and scroll-triggered reveals; "trusted by" badges; countdowns or urgency; chat widget.

**Keep:** calm, unhurried copy; numbered sections as quiet wayfinding; a warm two-tone palette, one stock and one ink; generous whitespace and one column; captions set under images; type scale with one display size and a readable body.

## 8. Founder questions (most important first)

1. **May imagery ever sit above the first money or approval act?** Recommend no at every viewport; the letterhead and standing line open, the plate is the first chapter.
2. **May a maker's brand story appear on the homeowner's page?** Recommend no; one provenance line (maker · town · in production since · photographed when) is the ceiling.
3. **Shadow or no shadow on plates?** Spec and V9 say no shadows; a photo on a 1px #C9C7BD card is enough. If you want depth, it is the border tint from the job palette, not a drop shadow.
