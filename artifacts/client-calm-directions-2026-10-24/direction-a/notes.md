# Direction A, "Gallery"

## Concept

The page is a walk through a gallery of June's house arriving: one photograph per screen, each with
only its wall label and at most one sentence in Maren's voice. The arrival is a single photograph,
edge to edge and the full height of the screen, at 390 and at 1440. It carries only the studio's
name, one "Menu" control, and a solid warm-charcoal band at its foot. The band holds the edition
headline and, under it, everything June has to do in one quiet line: "Two things from Maren: an
invoice past due, and the sofa." That line opens a drawer with the $600.00 invoice and its Pay act
on top. Everything else (the six-link row, the purpose sentence, the standing rows, the numbered
chapters) is removed or put behind Menu. The arrival shows 19 words. The photograph's element covers
100% of the screen; with the band, about 77% of the phone screen and 86% of the desktop screen
still show the photograph itself.

**The one sentence to remember:** the photographs get the page, and the asks get one line.

## What it removes or moves

Compared with today's page (`inputs/today-prod-2026-10-23-page.jpg`):

- **Letterhead block** (studio, house name, "Prepared for"): reduced to the studio name in a small
  chip at top left. The house name and "Prepared for June Brennan" move to the footer and the Menu.
- **Purpose sentence** ("Pay invoices, review approvals, and follow your project here."): removed.
  The asks line does that job.
- **Six-link row**: removed from the page. One "Menu" control at top right opens the page index:
  the two asks with their amounts, then the chapters, Maren's note, all invoices, documents and
  "Call Maren Holt".
- **Drawn hero at 72% height**: replaced by a photograph that fills the screen (the drawing returns
  only on a job with no photographs).
- **Large chapter headline above the fold**: becomes the edition headline, 5 words, on the band.
- **Three standing rows** (amount due, waiting on you, invoices open): folded into one line on the
  band. The amounts are one tap away in the drawer.
- **Numbered chapter eyebrows** ("01 · …", "02 · INVOICES"): removed. Chapters have no titles;
  each photograph's caption names it.
- **Invoices in four groups on the page**: moved into the drawer (`pay.html`). The past-due invoice
  and its Pay act come first, the other five sit beneath as quiet rows, then the sofa approval.
- **Project sections list**: removed. The one thing that matters (the living room installation,
  22 January 2027) is the living room's sentence.
- **Footer**: house name, status in words, four quiet rows (invoices, sofa approval, documents,
  call Maren) and the colophon.

## Spec rules this direction changes

Each row is a founder decision.

| Rule | Proposed | Why it buys calm | What June could miss |
|---|---|---|---|
| A purpose sentence on arrival. | Dropped. The asks line on the band tells June what the page wants from her today. | One fewer line of explanation on the arrival screen. The photograph speaks first. | A first-time visitor gets no one-line explanation of what the page is for. The invitation email has to carry that. |
| The link row "Invoices · Approvals · Progress · Updates · Documents · Contact Maren Holt" as page furniture. | Replaced by one "Menu" control at top right. It opens the page index, which lists the two asks with their amounts first. | Six links become one word. Nothing on the arrival competes with the photograph. | Documents and Contact are one tap deeper. June may not guess that Menu is where Documents lives. |
| Three standing lines above the first image. | Folded into one line on the band: "Two things from Maren: an invoice past due, and the sofa." The amounts and dates are in the drawer, one tap away. | Three lines and three numbers become one sentence in Maren's voice. | The amounts ($600.00, $7,480.00) are not on the arrival screen. June sees that something is owed and what it is, but not how much until she taps. |
| All invoices visible in four groups. | All six invoices live in the drawer: the past-due one on top with its Pay act, the other five as quiet rows beneath, with amounts and due dates in words. The page footer shows only "$1,375.00 open". | The page stays a sequence of photographs. Money has its own room. | June cannot scan every invoice while scrolling the photographs; she has to open the drawer. |
| The hero never above the first money or approval act (Q1). | The hero comes first and fills the screen. The money and approval acts are one tap away, from the asks line on the hero's own band. Reachability holds: Pay $600.00 and Approve $7,480.00 are each at most two taps from the arrival (asks line, then the act; or Menu, then the item). | The photograph is the reason June opens the page, so it gets the first screen. | The Pay act is never on the arrival screen. A homeowner who reads nothing may not tap the line. The band's contrast and the arrow are all that carry it. |
| Photography capped at 72% of the viewport (C2). | The arrival photograph is the full viewport height at both sizes, with a solid band over its foot. Chapter photographs take up to 72–78% of the screen height, one per screen. | This is the gallery feeling in the references: one image owns the screen. | Nothing of the page below shows on arrival, so June has to know to scroll. On a short laptop the band covers more of the photograph. |
| Numbered chapter eyebrows. | Removed. Chapters have no headings; the caption's first line (what · whose · when) names each photograph, and the Menu lists chapters by name. | Fewer labels and no numbers. Words are captions. | No visible chapter titles, so the order of the story depends on the studio choosing photographs that explain themselves. |

## How editions drive it

An approved `client_editions.composition` supplies, and this direction shows:

- **Hero asset and focal point:** the arrival photograph. The focal point sets `object-position`
  separately for the tall phone crop and the wide desktop crop (`--focal`, `--focal-wide`).
- **Edition headline:** the first chapter headline, in 3–6 words, on the band.
- **Chapter order:** the order of the screens below the arrival, and the order in Menu.
- **Each image's alt text and caption fields:** the `alt`, and the wall label's what · whose · when.
- **Standing sentences:** at most one sentence per chapter, shown under its photograph.
- **The studio note:** Maren's letter near the end.

It drops:

- chapter headlines other than the first (the caption names each photograph instead);
- any second or third standing sentence per chapter;
- numbered eyebrows and purpose copy.

Code still decides image rank: installed photograph, then studio board or room scan, then maker's
photograph, then drawn silhouette. Code also writes the asks line from live state, not from the
edition: it counts what is waiting on June ("Two things", "One thing") and names each in words.
When nothing is waiting, the line reads "Nothing from Maren today" and links to the invoices.

When a new edition is approved, the arrival photograph, the headline, the chapter photographs and
their order, the sentences and Maren's note change together, at once. The asks line, the drawer and
the footer amounts do not wait for an edition; they follow the invoices and approvals.

## Zero-photo job

`empty.html` keeps the same rhythm, one field per screen, with no photographs and no stock images:

- **Arrival:** the house's four paint colours as full-height stripes, side by side, like a paint
  card (Halvorsen Morning Oat, Larkin Prairie Pale Birch, Halvorsen Kettle Clay, Halvorsen Bur Oak
  Green). Paint is a real record of the job, so it can fill the first screen honestly. The band,
  headline and asks line are the same as on the photographed page.
- **Chapters:** a drawn silhouette of the sideboard, a Pale Birch field, a drawn silhouette of the
  sofa, and a Bur Oak Green field. Each caption still reads what · whose · when, with a second line
  saying it is drawn from the specification or shown flat, and that photographs will follow.
- **Maren's note** says plainly that there are no photographs yet.

The paint colours on screen are approximate. The paint card is the authority, and the notes say so
in the page source.

## Risks

- **The asks line carries the money alone.** If June does not tap it, the past-due invoice stays
  unseen. Mitigations: the line sits on the arrival screen on every visit, it is in Maren's voice,
  and Menu lists both asks first with their amounts. This needs testing with a real homeowner.
- **Amounts are not on the arrival screen.** The line names the asks but not the sums. If the
  founders want a number on arrival, the line could read "An invoice past due, $600.00, and the
  sofa", which adds two words.
- **Placeholder photographs are uneven.** The sideboard placeholder is low resolution at 1440 and
  the shavings photograph is bright and textured. A real edition needs a hero chosen for a quiet
  full-screen crop. The studio should be told that the hero is cropped to both a tall and a wide
  screen.
- **A full-screen hero hides the page below.** There is no scroll cue on purpose. June may not know
  the photographs continue. The caption that sits just under the band and the band's edge are the
  only hints.
- **One added colour.** The warm charcoal band (`#2E2A26`) is the one deep neutral this direction
  adds. It is used only for the arrival band and the drawer's backdrop.
- **The drawer is a separate page in this mock** (`pay.html`). In the product it would open over
  the arrival and close back to it. Focus, the Escape key and the back button need care.
