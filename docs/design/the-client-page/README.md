# The Client Page — two paths for the homeowner's page

**Status: shipped, no flag — 4 September 2026.** Path B · The Threshold is
ruled and built. Kody's ruling of 2026-09-04 (`docs/design/the-document/DECISIONS.md`
**R135**; `docs/vision/VISION-DECISIONS.md` **V8**) sent it to every client on
the platform with no `threshold`/`single-pane` gate: the client portal's
authenticated surface is now the single page this document proposed, not a
proposal awaiting a decision. The delivery plans are
`docs/superpowers/plans/2026-09-04-client-page-completion.md` (built the
Threshold out to cover every act the old routes performed) and
`docs/superpowers/plans/2026-09-04-client-portal-retirement.md` (deleted the
old route tree, the header, and both flags once the Threshold covered them).
The rest of this file is kept as written — the diagnosis and the two paths are
still the record of how B was chosen over A — with the route map and instrument
locations below describing what actually shipped.

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

## Shipped: the single-page route map

`apps/client-portal`'s authenticated surface is one page per project, opened
at `/` (the client's active project) or `/projects/[projectId]` (a named
one). Every other address a client, an email, a cron job, iOS, or the
extension might still hold redirects to an anchor on that page rather than
rendering a route of its own — the full map lives in
`apps/client-portal/README.md` and the redirect table in
`docs/superpowers/plans/2026-09-04-client-portal-retirement.md`'s End state
section; in short: approvals and design reviews land on `#doorstep`,
proposals on `#door`, invoices on `#letterbox`, budget on `#ledger`,
documents on `#mat-papers`, orders on `#road`, messages and inbox on `#note`,
room scans on `#room-<roomId>` (or `#doorstep` when the room can't be
resolved), and account/preferences/settings on `#mat`. Public, token,
auth, and system routes (share links, the sign endpoints, the checkout
return URL, `/preferences/unsubscribe`) are untouched — they were never part
of the header's route tree and carry no anchor.

## Shipped: where the instruments live

Every act the old route tree performed now happens in place, inside
`apps/client-portal/src/components/threshold/`. `threshold.tsx` composes the
page from its instruments: `doorplate.tsx` (names the house),
`doorstep.tsx`/`approval-ask.tsx`/`review-ask.tsx`/`scope-change-ask.tsx`
(what's owed — approvals, design reviews, scope-change decisions),
`door-gate.tsx`/`door-acts.tsx` (proposals — sign, ask a question, request
changes, decline, read in full), `letterbox.tsx`/`earlier-invoices.tsx`/
`payment-method-chooser.tsx`/`settlement.tsx` (money — settle the balance,
prior invoices, the checkout return-URL reader), `the-road.tsx`/
`road-orders.tsx` (pieces and direct orders), `the-note.tsx`/
`correspondence.tsx` (the studio's note and the reply thread),
`papers-sheet.tsx` (the plan set and executed instruments, a laid-in sheet
overlay), `room-band.tsx`/`room-capture.tsx` (rooms as captured, with
share/revoke), `house-ledger.tsx`/`story-pole.tsx` (the money standing and
the phase), `previously.tsx`/`since-yesterday.tsx`/`instrument-reading.tsx`
(the record of what's already settled), `mat.tsx`/`details-sheet.tsx`/
`other-houses.tsx` (a client's own details, notification preferences, and —
for a multi-project client — the other houses she can switch to), and
`plan-key.tsx`/`wall-gate.tsx`/`ground-floor.tsx` (the section drawing and
its gates). The six instruments Path B inherited from The Making v1 —
`scored-action`, `spine-gate`, `spine-toll`, `tracking-row`,
`standing-sentence`, `making-spine` — moved from `components/making/` to
`components/threshold/instruments/`, imports updated, their tests kept
green; `commercial/journey-stepper` stayed where it was. Nothing opens a new
route: every one of these renders in place, unfolding, lifting, or laying a
sheet over the page the client is already standing on.

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
