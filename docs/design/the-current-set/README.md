# The Current Set

**Status: proposed — awaiting leadership feedback.** Written 6 August 2026.
Nothing is built: no migration was minted, no component written, no route
touched, no feature flag created. The deck exists to earn a ruling, not to
document one.

On 4 August, Abel Boone cut walnut uprights and case sides for the Whitlock
study with the west shelving bay at 34 1/2". The current drawing had said
33 3/4" since the first of the month — Nell had found a concealed steel column
chase on the 30 July site visit, replotted, and sent Rev C as a reply on an
email thread three subjects deep. Abel never opened it. Three surfaces held a
candidate for "the current drawing" — a plots folder full of `_FINAL2`
filenames, a mail thread, and a Folio that forked one sheet into two chips on a
title match — and not one of them owned the word *current*, or recorded who had
been sent what. The dry-fit failed on the sixth: $2,840 in walnut, nine working
days, one apology call to the client. Patina has learned to version everything
except the drawings.

## The deck

| File | Date | What it is |
|---|---|---|
| [`the-current-set-proposal.html`](./the-current-set-proposal.html) | 6 Aug 2026 | 18 slides, self-contained, no shadows, every picture drawn in CSS. Slides 01–05 are the wound, the inventory, the six laws, and the model; 06–10 are five full-bleed screens (the Light Table, the Plan Room and its drawing log, the sheet ID-401, the issue ceremony, and what the trade and the client each see); 11 is the delivery ladder; 12–14 are the three directions; 15–18 are the matrix, the ruling, the first cut, and the colophon. |

## The three directions

| | Direction | The thesis |
|---|---|---|
| **A** | The Deep Folio | One paper, deeper pockets. No new room — the folio unfold grows a Drawings shelf whose face is the current set, and the Light Table opens as an overlay. |
| **B** | **The Plan Room** *(recommended)* | The drawings get a room; the paper keeps its calm. A threshold band on `/doc/[id]` opens `/doc/[id]/plans`, where the log, the Light Table, the sheet detail, and the issue ceremony live at full size. |
| **C** | The Flat File | The room, plus the tray that fills it. Direction B's surface *and* a signed menu-bar agent watching a plots folder, shipping together in v1. |

**Why B.** The wound is ownership of the pointer, not upload friction. Nell
already uploads; Abel cut from Rev B because nothing owned "current" and
nothing recorded the send. The drop plus the Light Table closes that loop with
zero installs. A cannot hold a 24-sheet job, a print stack, a drawing log, and
a transmittal ledger inside a letterhead unfold. C stakes a new desktop
platform — installers, updates, notarization, support — on a surface that has
no users yet, and amplifies a habit the room has not created.

## The fixture

Every screen renders one canonical fictional job — the **Whitlock residence**,
a full-floor furnishing and millwork job — stated in full as a CONTRACT in an
HTML comment at the top of the deck's `<body>`. Same data in every mock; the
differences you see are the direction, not the data.

- **Cast.** Margot Whitlock (client) · Nell Adair of Adair Studio (designer,
  AutoCAD LT on a Mac, plots land in `~/Plots/Whitlock/`) · Abel Boone of Boone
  Millwork (the wound happens to him) · Otto Fenn of Fenn Metalworks · Vera
  Lindqvist of Lindqvist Upholstery · Doug Merrill of Merrill Bros.
  Construction (GC, "for information").
- **The sheet set (7).** ID-001 Cover & Sheet Index (B) · ID-101 Furniture Plan
  — Main Floor (B) · ID-201 Reflected Ceiling Plan — Main Floor (A) · ID-301
  Finish Plan — Main Floor (B) · **ID-401 Millwork Elevations — Study (C)** ·
  ID-402 Millwork Elevations — Banquette (B) · ID-501 Millwork Details — Study
  Shelving (C).
- **The revision event.** ID-401 Rev C narrows the study's west shelving bay
  from **34 1/2" to 33 3/4"** after a concealed steel column chase is found in
  the west wall on the 30 July site visit. ID-501 revises with it.
- **The timeline.** 8 Jul Rev A issued for pricing · 22 Jul Rev B emailed "for
  production" · 30 Jul chase found · 1 Aug Rev C plotted (`_FINAL`, then
  `_FINAL2`) · 2 Aug sent as a thread reply, never opened · 4 Aug Abel cuts
  from Rev B · 6 Aug the dry-fit fails.
- **In the proposed world.** Rev C is confirmed on the Light Table 1 Aug and
  issued 4 Aug as **"Production Set — 4 Aug 2026"** to Boone Millwork *for
  production*; for the three days between, the drawing log shows Boone amber —
  **"Boone Millwork holds Rev B."**
- **The ledger that produces every holder line.** 8 Jul: 7 prints filed at Rev A
  → issued as "Pricing Set — 8 Jul 2026" → transmitted *for pricing* to Boone,
  Fenn, Lindqvist. 22 Jul: 6 prints filed at Rev B (ID-201 unchanged) → flipped
  → issued as "Production Set — 22 Jul 2026" → transmitted *for production* to
  Boone and *for information* to Merrill. 1 Aug: 6 sheets filed (2 new prints,
  4 confirmed current) → ID-401 and ID-501 flipped to Rev C. Therefore Boone and
  Merrill hold Rev B, Fenn and Lindqvist hold Rev A, and ID-201 has never
  revised. Every "holds" line and every "last sent" date in the deck is read off
  those ten events — no transmittal exists that is not in the log.
- **Short hashes, kept distinct.** Print `sha 9f3a…` · set checksum `sha c41d…`
  · share token `tk_7e28…`.

Builders may not deviate from that sheet: no invented sheet numbers, no
rounded dimensions, no second trade. Every full-bleed mock must visibly
surface at least three of the five contract facts — ID-401; the 34 1/2" →
33 3/4" west bay; rev letters A/B/C dated 8 Jul / 22 Jul / 1 Aug; "Production
Set — 4 Aug 2026 · for production · Boone Millwork"; and the amber "Boone
Millwork holds Rev B."

## Open questions

1. **Does the Plan Room absorb the Room Files?** The scanner already produces
   versioned, checksummed drawing sets. If they register as system-authored
   sheets, scan output and Nell's plots share one log and one current set. If
   not, the project carries two drawing surfaces from day one.
2. **Can a transmittal ever be recalled?** Reissue-plus-notice — the record
   stands, amended — or true token revoke — the record admits erasure. The
   answer is the trust story we tell trades.
3. **Does the current set gate the client absolutely?** Is the client portal
   only ever the issued set, retiring `client_visible` as an independent toggle
   in the plan room, or does Shared survive as a middle state? One is calmer;
   the other is the toggle designers already know.

## Lineage

- House shell — tokens, slide machinery, mock scopes (`.doc` / `.exhibit`),
  scored ink, stamps, stacked paper, the annotation rail, the compared matrix,
  and the ruling grammar — inherited from
  [`the-single-pane-four-directions.html`](../the-single-pane/the-single-pane-four-directions.html)
  by way of
  [`the-authorized-schedule-proposal.html`](../authorized-schedule/the-authorized-schedule-proposal.html)
  and
  [`the-call-sheet-ui-proposal.html`](../studio-rosters/the-call-sheet-ui-proposal.html).
- The issue grammar — immutable revision ledger, snapshots, sha256, named
  audiences, drift detection — is the shipped Spec Book's, taken whole.
- Constraints are the house's: self-contained single file, no external fonts,
  scripts, images, or requests; no shadows anywhere; every picture drawn in
  CSS; scored ink instead of filled buttons; Patina voice throughout.
