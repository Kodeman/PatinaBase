# Direction C — "Album"

## Concept

The house is an album, and its photographs are the navigation. June arrives on one large photograph,
the hero the studio chose for this edition, with the house name set large across its foot. Under it
sits a contact sheet: one photograph per room or piece in progress (Living room, the sideboard, the
sofa linen, Kitchen, Bedroom), each with a short label and its caption. A tile opens that room's page
further down, where every piece is a photograph, a caption and one line of status in words. Money and
approvals leave the main page for their own quiet page, Papers, and the album carries exactly one
line about them, in words, just under the photograph. Chrome is three words: the studio's name,
"Papers" and "Maren".

**The one sentence to remember:** June opens an album of her house; the papers live on their own
page, one line away.

## What it removes or moves

Measured against today's production page (`inputs/today-prod-2026-10-23.png`):

- **Purpose sentence** ("Pay invoices, review approvals, and follow your project here."): removed.
  The photograph and the house name say what the page is; the Papers line says what is asked.
- **Six-link row** (Invoices · Approvals · Progress · Updates · What changed · Documents · Contact):
  removed. Two words remain in the chrome, "Papers" and "Maren". The contact sheet is the
  navigation for the house itself.
- **Drawn hero above the fold**: replaced by the edition's photograph (a drawing only when no
  photograph exists; see Zero-photo job).
- **Large "Where the house stands" headline**: replaced by the house name, set on the photograph.
- **Three standing rows** (amount due, waiting-on-you, open invoices): folded into one line,
  "Papers: one invoice past due, one answer for Maren →".
- **Numbered chapter eyebrows** ("01 · …", "02 · INVOICES"): removed. Rooms are named by their
  tile label and their page heading.
- **Invoices chapter** (all invoices in four groups on the main page): moved to Papers. The $600.00
  past-due invoice leads with its Pay act; the other five follow as quiet rows.
- **Approvals chapter**: moved to Papers, beside the invoices, with the linen swatch.
- **"Project sections" progress rail** (Discovery, Design, …): removed. Each room page carries one
  standing line instead ("Installation is planned for 22 January 2027.").
- **"What changed" and "Updates"**: folded into Maren's note, shown as one quoted line after the
  contact sheet, with "Read Maren's note" opening the full letter at the end of the album.
- **Documents**: belong in Papers in a production build (contracts and signed papers sit beside the
  invoices); not drawn in this concept.

On arrival the page now shows four kinds of thing instead of a dozen: the studio's name and two
words, one photograph with the house name, its caption, and one line about the papers.

## Spec rules this direction changes

Each row is a founder decision. The usability spec is
`docs/specs/_active/client-portal-homeowner-usability.md`.

| Rule | Proposed | Why it buys calm | What June could miss |
|---|---|---|---|
| A purpose sentence on arrival. | Drop it. The house name on the photograph and the Papers line do the work. | One fewer sentence before the photograph; the page reads as her house, not as a portal. | A first-time visitor is not told in so many words that she can pay here. The invitation email has to say it once. |
| The link row "Invoices · Approvals · Progress · Updates · Documents · Contact Maren Holt" as page furniture. | Replace it with two words in the chrome, "Papers" and "Maren". The contact sheet is the navigation for the house. | Six underlined links were the busiest thing on the screen; two quiet words leave the photograph alone. | Progress, Updates and Documents are no longer one tap from the top under their own names. Updates live in Maren's note; Documents move into Papers; progress is one line per room. |
| Three standing lines above the first image. | One line under the hero: "Papers: one invoice past due, one answer for Maren →". | One line in words replaces three boxed rows, and it sits under the photograph, not in front of it. | The line names no amounts, so June does not see $600.00 until she taps. The job's phase (Procurement) moves off the arrival into the Living room page. |
| All invoices visible in four groups. | Move every invoice to Papers. The $600.00 past-due invoice comes first with its Pay act; the other five follow as rows with their dates and amounts. | Money stops taking up the album. On Papers, one decision is in front of her at a time. | The $100.00 due today is not named on the main page. Papers lists it first among the rows; the line on the album says "past due", not "due today". |
| The hero never above the first money or approval act (Q1). | The hero comes first. The money and the approval are one tap away, on Papers, from a line that shows on the arrival screen at 390 and at 1440. | The photograph owns the first screen, as in every reference. | Pay $600.00 and Approve $7,480.00 are each two taps from arrival instead of one. If June ignores the Papers line, nothing else on the album presses her. |
| Photography capped at 72% of the viewport (C2). | Lift the cap on arrival; the hero stops short of the fold so the caption and the Papers line always show. On the room pages a photograph may run the full measure. | The photograph is the reason she opens the page; capping it shrank the one thing she came for. | On a short laptop screen the hero, caption and Papers line fill the screen; the contact sheet starts just under the fold. |
| Numbered chapter eyebrows. | Drop them. Rooms are named by their tile label and their page heading. | Numbers read as a form to be completed; names read as rooms in a house. | Nothing tells June how many rooms there are or where she is in the album. The contact sheet is the map. |

## How editions drive it

An approved edition (`client_editions.composition`) supplies, and this direction shows:

- **Hero asset and its crop or focal point**: the cover photograph. The focal point becomes the
  image's `object-position`, so the house name sits over quiet ground.
- **Chapter order**: the order of the contact-sheet tiles and of the room pages below, one to one.
  A chapter is a room or a piece in progress.
- **Chapter headlines**: the tile labels and room page headings. This direction asks the studio to
  keep them to two to four words ("Living room", "The sofa linen").
- **Standing sentences**: one line under each room heading ("Installation is planned for
  22 January 2027."). One sentence per room; a second is not shown.
- **Each image's alt text and caption fields**: every figure's `alt`, its what · whose · when line,
  and its second line.
- **The studio's note**: its first sentence is the quoted line after the contact sheet; the whole
  note is the letter at the end.

It drops: the purpose sentence, any chapter eyebrow or number, standing sentences above the first
image, and any headline longer than four words on a tile (the room page shows it in full).

Code, not the edition, decides:

- **Each tile's photograph by rank**: installed photograph, then studio board or room scan, then
  maker's photograph, then drawn silhouette. Today the Living room tile is a studio board; once the
  sideboard is installed, the tile becomes the installed photograph without a new edition.
- **The Papers line**: written from payable state (past due first, then answers owed). It is never
  part of the edition, and it disappears when nothing is owed or asked.
- **Piece status lines** ("In production at Harmon Bench Works in Dayton, Ohio.") come from order
  state, in words.

When a new edition is approved: the cover photograph and house-name placement change; tiles are
added, removed or reordered to match the new chapter order; Maren's quoted line becomes the new
note's first sentence; captions and alt text update. Nothing else moves, so June's album looks the
same from one edition to the next except where the job moved.

## Zero-photo job

`empty.html` is the same album on the same paper with no photographs. The cover is a large line
drawing of the hero piece (the walnut sideboard, drawn from the specification) on stock, with the
house's four paint colours as small chips beside it. The contact sheet keeps its shape: each tile is
a field of the room's chosen paint (Larkin Prairie, Pale Birch for the living room; Halvorsen,
Kettle Clay for the kitchen; Halvorsen, Bur Oak Green for the bedroom) with a single-weight drawing
of its piece on top. The sofa-linen tile is a flat colour of the sample, captioned "Sample with
Maren". The kitchen and bedroom pages carry their drawing on a wide field of their paint, and a short
"The paint" page lists the four colours by brand and name. Captions say "Drawn from the
specification", never "Photograph". No stock photograph stands
in for her house, and nothing is rendered to look installed. As photographs arrive, each tile
upgrades by rank on its own.

## Risks

- **The asks are one tap further away.** The album is calm because money left it. If June reads the
  album and skips the Papers line, the past-due invoice waits. Mitigation: the line sits directly
  under the photograph at both sizes, it is written in words, and it is the only sentence on the
  arrival screen that is not a name.
- **Board photographs can read as her house.** The room tiles use studio board images until
  installed photographs exist. Captions say "Board" and "The direction for the living room", but a
  quick reader could take them for her own rooms. Production builds need the board label kept, and
  the brief's "Concept · not installed" mark on anything rendered.
- **Tile labels need short headlines.** Studio-written chapter headlines longer than four words will
  be cut on the tile. That is an authoring constraint the studio has to accept.
- **Contact sheets grow.** A ten-room house makes a long sheet. Past six tiles the sheet should show
  the rooms in progress and fold finished rooms into one "Finished rooms" tile; not drawn here.
- **A close photograph can read as a texture.** This edition's cover is the planed walnut top of the
  sideboard, close up. It is the calmest frame the workshop sent, and the caption says what it is,
  but a founder may find it too abstract for a cover. A wider workshop photograph is the fallback.
- **The cover photograph needs quiet ground for the house name.** A busy maker photograph under white
  type fails. The ink scrim at the foot helps; the edition's focal point has to leave room for the
  name, and the editor should warn when it does not.
- **No added deep neutral.** This direction stays on the five-colour palette; the scrim under the
  house name is ink at partial opacity, not a new colour.
