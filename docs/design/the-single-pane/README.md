# The Single Pane — four directions for the client portal

**Status: proposal — nothing built.** Written 5 August 2026. No migration was
minted, no component written, no route touched, no feature flag created. The
deck exists to earn a ruling, not to document one.

Harper Vale has one job in flight: her own house, in procurement, with one
signature waiting on her. The portal greets her with a projects list even
though there is exactly one project, then hands her a header carrying fifteen
affordances — nine of which lead away from the job she came for — and a page
of twelve to fourteen stacked sections where the activity feed, the team, and
the documents each appear twice. Roughly twenty-six competing elements stand
between the front door and the sentence that matters: *furnishings
authorization No. 7 is waiting for your name.* Underneath the clutter is a
second problem — the client received a plainer subset of the brand. The
studio's side of Patina reads like a letterhead; the client's side got borders
and a badge.

## The deck

[`the-single-pane-four-directions.html`](./the-single-pane-four-directions.html)
— 16 slides, self-contained, no shadows, every picture drawn in CSS. Slides
01–05 and 14–16 are the shell: the wound, the missing language, the ground
rules, the fixture, the compared matrix, the ruling, the colophon. Slides
06–13 are the four directions, inlined at the four `SLOT` comments from
fragment files in [`_fragments/`](./_fragments/).

## The four directions

| | Direction | The thesis |
|---|---|---|
| **A** | The House Book | The engagement is one typeset book — a document Harper reads front to back, composed and dated, not a surface that reorders itself while she watches. |
| **B** | The Making | One progress spine with gates. The house advances through named states, and every gate that needs Harper's hand stops the spine until she gives it. |
| **C** | The Walkthrough | The house is the interface. You move through rooms — library, entry, bedroom — and the work, the money, and the asks are what you find in each one. |
| **D** | The Correspondence | Letters from the studio are the record. Nora writes; the letters accumulate; signing, accepting, and settling all happen inside the letter that asked. |

## The fixture

Every screen in the deck renders one canonical fictional job — the Vale
residence, Des Moines, on 5 August 2026 — stated in full as an HTML comment at
the top of the deck's `<body>` and as a specimen table on slide 05. Cast:
Harper Vale (client), Nora Quist of Quist Interiors (designer), Dan Okafor
(general contractor), Prairie Coat Painting (trade), Harmon Bench Works of
Dayton, Ohio (maker). Builders may not deviate from that sheet: no invented
rooms, no rounded totals, no second client. Same data, four shapes — the
differences you see are the direction, not the data.

Every full-bleed mock must visibly surface the same five facts: the No. 7
signature ask at top prominence, the credenza in production at Harmon Bench
Works, the paintwork awaiting acceptance with its $1,440 release, the money
standing ($61,400 of $85,000; Invoice No. 4 balance $9,125 due 15 August), and
the phase (Procurement).

## The ruling

**Awaiting.** No R-number has been cut. Three questions shape it, and they are
on slide 15:

1. Is the pane a document or a feed?
2. How much of today's route surface survives v1?
3. Does the Document language arrive whole, or by degrees?

## Lineage

- House shell — tokens, slide machinery, mock scopes, scored ink, the
  annotation rail — inherited from
  [`the-call-sheet-ui-proposal.html`](../studio-rosters/the-call-sheet-ui-proposal.html)
  by way of
  [`the-authorized-schedule-proposal.html`](../authorized-schedule/the-authorized-schedule-proposal.html).
- Compared-matrix and ruling grammar borrowed from
  [`the-document-schedule-four-directions.html`](../the-document/the-document-schedule-four-directions.html).
- Diagnosis drawn from the client journey audit of 31 July 2026
  (`artifacts/patina-client-journey-audit-2026-07-31/`).
- Constraints are the house's: no shadows anywhere, self-contained single file,
  scored ink instead of filled buttons, Patina voice throughout.
