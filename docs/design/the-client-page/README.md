# The Client Page — two paths for the homeowner's page

**Status: proposed, unruled — 3 September 2026.** No migration was minted, no
component written, no route touched, no feature flag created. These files exist
to earn a ruling, not to document one.

## The ask

The team's words: the top navigation bar makes the client portal *feel like any
other portal*. Give the homeowner **one page** — no chrome above it, nowhere else
to go, every fact surfacing on the page, depth opening in place. Two distinct
paths, each with a full mockup, for Kody and Leah to choose between.

## The diagnosis

Harper Vale opens a link from a text message and meets a header. Counted against
the code, it carries **fourteen controls reaching seven destinations**: the
wordmark (to a projects list she does not need), a project switcher, four primary
links (Today, Decisions, Proposals, Invoices), *More ▾* holding three more
(Budget, Documents, Orders), and seven right-side utilities, two of them
conditional. Underneath sits the body we ruled for on 5 August and built: The
Making v1, behind the PostHog flag `single-pane`, deployed inert. **Nobody has
walked it.** The wound is not the spine; it is that we shipped the page body and
left the filing cabinet standing around it, and the letterhead then apologised
with three corner links to `/budget`, `/messages` and `/documents`. One move
answers it: kill the chrome, and make the page the whole portal.

The page is not a fourth ranked surface. It is the homeowner-facing face of **The
Document** (S1), where she signs, pays, and reads the record. The homeowner
remains the *studio's* client; Patina does not sell to her (S2).

## The two paths

| | Path | The thesis |
|---|---|---|
| **A** | The Attendance | The page is the studio's daily attendance on her house — one standing sentence, one dated note from Nora, and the whole portal hanging off that note as enclosures she draws out where she stands. The ruled spine survives as the page's left margin rule, cut square where an act is owed. |
| **B** | The Threshold | The page is a section cut through the Vale residence, taken down the stair. Every ask she owes is a door that is actually shut, the records are what she finds standing in each room, money sits at every threshold, and time stands in the margin as a story pole. |

Two ends of one axis: **is the homeowner's page ordered by time or by place?**
Everything else — letterhead, standing sentence, gate, stamps, colophon, the
voice rule, scored ink, no chrome — is shared.

## The fixture

Both mockups render one canonical fictional job: the **Vale residence**, Des
Moines, on **5 August 2026** — Harper Vale (client), Nora Quist of Quist
Interiors (designer), Dan Okafor (contractor), Prairie Coat Painting (trade),
Harmon Bench Works of Dayton, Ohio (maker). Names, amounts and dates come from
that sheet verbatim: no invented rooms, no rounded totals, no second client.

Every mockup must visibly surface the same **five facts**: **authorization
No. 7** ($6,890 — sconces $2,340, drapery $2,890, runner $1,660) at top
prominence; the **walnut credenza** $8,400 in production at Harmon Bench Works,
Dayton; the **paintwork** awaiting acceptance with its **$1,440** release; the
**money standing** ($61,400 agreed of $85,000, Invoice No. 4 balance $9,125 due
15 August); and the **phase**, Procurement.

## The recommendation

Read straight, the comparison in §07 returns a split verdict: **B wins every row
about the reading experience; A wins the three rows about cost.**

**Rule for Path B · The Threshold as the destination.** It is the page that
answers the team's actual ask — unique to Patina, engaging, the house made
visible — and its data risk is smaller than the memo feared: Patina already holds
project rooms, per-room FF&E items, and LiDAR room scans, so the section drawing
has a source no other portal can copy.

Path A's voice risk is the one to watch — nine days of designer silence leaves a
nine-day-old note at the top of the page — and the Path A mock answers it with a
specimen state, **view without a note**: Nora's note block is absent, the
standing sentence holds the top alone, and authorization No. 7 introduces itself
with "Sent 4 August by Quist Interiors."

**Path A is the surer, cheaper ship, and it is also what B degrades to for a
project with no drawn rooms.** Every device of B above the drawing — doorplate,
doorstep sentence, letterbox, note, gates with a typed name, stamps, mat — is A's
with a house between them. So the build order is A's shell first, as B's
no-geometry state, then the drawing. Steal nothing from B into A: A is B's ground
floor. What is asked for here is a ruling, not a start date — rule, then schedule
against the ranked surfaces.

## The two open questions

1. **Who writes the note** — Nora in her own words, or the studio's standing
   sentence alone? Shipping the first while operating the second is the one way
   either path turns out badly.
2. **Where the drawing comes from** — the room scans, the plan set, or a key the
   studio draws once per project? Generated, imported and authored are three
   different builds.

## Lineage

- Ruled devices and fixture from [The Single Pane](../the-single-pane/README.md)
  — 5 August 2026, B · The Making with A's letterhead, C's stamps, D's standing
  sentence and voice.
- House shell — tokens, scored ink, the no-shadow rule — from the Call Sheet
  proposal by way of the Authorized Schedule.
- Diagnosis from the client journey audit of 31 July 2026
  (`artifacts/patina-client-journey-audit-2026-07-31/`) and the shipped portal
  (`apps/client-portal/src/components/layout/` and `.../making/`).

## Files

- [`path-a-the-attendance.html`](./path-a-the-attendance.html) — Path A, full
  mockup; the Vale residence at 5 August, signable, with `view as 4 Aug` and
  `view without a note` specimen states.
- [`path-b-the-threshold.html`](./path-b-the-threshold.html) — Path B, full
  mockup; same day, same facts, drawn as a house.
- [`the-client-page-two-paths.html`](./the-client-page-two-paths.html) — the
  proposal, in nine numbered sections: the wound, the one rule, the panel, what
  both paths share, Path A, Path B, compared, the recommendation, the colophon.
  Both first-viewport figures are embedded, so it needs no external images.
- `README.md` — this file.
- `shots/` — `path-a-desktop.png` · `path-a-phone.png` ·
  `path-a-first-viewport.png` · `path-b-desktop.png` · `path-b-phone.png` ·
  `path-b-first-viewport.png`. The two first-viewport plates are the figures
  embedded in the proposal.

## Published

Private links; anyone with the URL can read them, and they are not listed
publicly.

- Path A · The Attendance —
  <https://claude.ai/code/artifact/8e6b29ac-0f33-419a-858b-8dd69a00a1ad>
- Path B · The Threshold —
  <https://claude.ai/code/artifact/b551651c-2cd9-4404-a74d-a04c02fe00e3>
- The proposal —
  <https://claude.ai/code/artifact/751f2632-195d-4800-893b-fd6b2087747e>
