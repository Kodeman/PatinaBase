# Brief: a calm, photo-forward homeowner page (three directions)

## The feedback

The design team likes the editions: the studio composes and approves each version of the page,
and the page changes only when the job moves. They do not like how the page looks. They say it is
"way too busy and text forward". They want it to feel **calm and photo-forward**, like the
awwwards references they gave for the first redesign.

Today's production page (`inputs/today-prod-2026-10-23.png`) opens with a letterhead, a purpose
sentence, a six-link row, a drawn hero, a large headline, three standing rows and numbered
chapter heads. That is a dozen distinct elements before the first photograph does any work.

References (`inputs/refs/`; the measured analysis is
`../client-house-issue-2026-10-21/inputs/inspiration/INSPIRATION.md`):

- **Stanzza** (`stanzza-desktop-0.jpg`, `stanzza-mobile-0.jpg`): one dim full-bleed interior,
  one centred serif line, and only two controls ("Menu", "Request a call").
- **Era Residence** (`era-residence-desktop-0.jpg`, `era-residence-mobile-0.jpg`): a full-bleed
  photograph, a huge serif title and a minimal nav.
- **fitosauna** (`fitosauna-awwwards-gallery-1.jpg`, `fitosauna-mobile-0.jpg`): a dark, quiet
  product photograph, a large headline and very little text.

What they share: one image owns the screen, there are three to five words of display type,
controls stay small and few, and there is plenty of empty space. Nothing on the screen competes
with the photograph.

## Who reads it

June Brennan, the homeowner. The page belongs to her studio, Birchwood Studio in Madison, WI;
Maren Holt is her designer. June opens it every day or two. Two jobs must stay easy:

1. Paying what she owes.
2. Answering what the studio has asked her.

The photographs are the reason she opens the page. The asks are the reason the studio sends it.

## Fixtures (verbatim; no real people)

- **Studio and people:** Birchwood Studio, Madison WI. Maren Holt, (608) 555-0148. June & Arlo
  Brennan; the page is "Prepared for June Brennan".
- **House:** Elm Street House. It is in Procurement; the next step is the Living room
  installation, targeted for 22 January 2027.
- **Invoices:** six open, $1,375.00 in total.
  - INV-2026-014: $600.00, past due since 25 September 2026.
  - INV-2026-019: $100.00, due today.
  - INV-2026-017: $300.00 of $800.00, due 2 November 2026.
  - INV-2026-022: $250.00, due 14 November 2026.
  - INV-2026-023: $50.00, due 30 November 2026.
  - INV-2026-024: $75.00.
- **Approval:** "Living room sofa, edition 2", $7,480.00.
  - Oatmeal performance linen replaces wool bouclé.
  - The arm goes from 26 in to 24 in.
  - It adds two weeks; the sofa is ready nine weeks from the fabric order.
- **In production:** the walnut sideboard, at Harmon Bench Works in Dayton, OH (a fictional
  maker).
- **Maren's note**, 16 October 2026:
  > The page now opens on your sideboard; the workshop sent photographs on 15 October.
  > Everything else is where it was.
- **Paint** (fictional brands): Halvorsen, Morning Oat · Larkin Prairie, Pale Birch ·
  Halvorsen, Kettle Clay · Halvorsen, Bur Oak Green.

## Photographs

Use the 18 placeholder photographs in `../client-house-issue-2026-10-21/inputs/photos/`.
Reference them by relative path from your `direction-x/` folder; do not copy them. Licences are
in that folder's `MANIFEST.md`.

Every photograph is a `<figure>` with an `<img alt>` and a `<figcaption>`:

- The caption's first line is exactly **what · whose · when**, for example
  `Walnut top, planed · Harmon Bench Works · 15 October 2026`.
- A second line reads `Placeholder photograph`.
- A caption can be small and quiet (DM Mono, 12–15px, oak ink). It can sit below the photograph,
  or on a solid paper band at the photograph's edge. It never sits on the photograph itself.

A concept render keeps the mark "Concept · not installed" (at least 14px). Never present stock
or generated imagery as the client's own home.

## How editions drive the page (the part the team loves; keep it)

An approved edition (`client_editions.composition`) supplies:

- the hero asset and its crop or focal point;
- the chapter headlines and standing sentences, in the studio's voice;
- the chapter order;
- each image's alt text and caption fields.

Code decides image rank:

1. installed photograph;
2. studio board or room scan;
3. maker's photograph;
4. drawn silhouette.

Each direction must say which edition fields it shows, which it drops, and what changes on the
page when a new edition is approved.

## What every direction must keep (authority; not negotiable)

- **The studio is the author** (V9 P1). The studio's name appears at the top. The page ends with
  `Prepared by Birchwood Studio · Sent through Patina`. No Patina wordmark sits above that line.
- **Nothing measures June** (V8/V9): no counts styled as scores, no streaks, no percentages, no
  progress bars, no "3 / 7" denominators.
- **Words to avoid:** no "AI", "generated", "curated", "luxury", "seamless", "elevated",
  "bespoke", and no exclamation marks. Write in the studio's plain Midwest voice.
- **Money and dates are visible**, at 15px or more, wherever they appear.
- **Status in words.** Never use red. Forest green (`#3E5145`) fills only a final act that
  carries an amount (Pay $600.00; Approve $7,480.00).
- **Sizes:** body text is at least 16px, and touch targets are at least 44×44px. The page works
  at 390px and at 1440px with no horizontal scroll.
- **Light only.** The palette starts from paper `#FAF7F2`, stock `#FCFAF6`, ink `#2C2926`,
  oak ink `#4E4339` and hairline `#E8E3DB`. A direction may add one deep neutral for photo-led
  bands (for example a warm charcoal), and it must say so.
- **Type:** Playfair Display, Inter and DM Mono (Google Fonts link). A direction may drop one
  face.
- **Motion:** none required. If you add any, keep it on-mount only and respect
  `prefers-reduced-motion`.
- **Reachability:** June can reach the $600.00 past-due payment and the $7,480.00 approval from
  the arrival screen in at most two taps.

## What a direction may change (Kody: "free to propose changes")

The usability spec (`docs/specs/_active/client-portal-homeowner-usability.md`) sets these
rules today:

- a purpose sentence on arrival;
- the link row "Invoices · Approvals · Progress · Updates · Documents · Contact Maren Holt" as
  page furniture;
- three standing lines above the first image;
- all invoices visible in four groups;
- the hero never above the first money or approval act (Q1);
- photography capped at 72% of the viewport (C2);
- numbered chapter eyebrows.

A direction may move, fold, hide behind one tap, or drop any of these. Every change goes in the
`## Spec rules this direction changes` table in `notes.md`, as a founder decision. Each row has:

- **Rule**: the rule as it stands today.
- **Proposed**: what this direction does instead.
- **Why it buys calm**: what the change gives June.
- **What June could miss**: the risk, said honestly.

## Deliverable per direction (`direction-<x>/`)

- `index.html`: the homeowner page as a static responsive page. Inline `<style>`, or one
  `style.css` beside it. No JavaScript is needed; one small script is fine if your direction
  needs a drawer.
  - It is measured at 390×844 and 1440×900.
  - **On the arrival screen at both sizes:** no more than 40 visible words, and photographs
    cover at least 50% of the screen.
  - **Across the whole page:** no paragraph over 60 words, except Maren's letter, which goes
    inside `[data-letter]`.
- `pay.html`: the money moment as your direction stages it, with the $600.00 past-due invoice in
  front of June and the Pay act visible. This might be an open drawer, a papers view or an
  expanded card. Show where the other five invoices are.
- `empty.html`: the same page for a job with **no photographs yet**, on the same paper. The
  palette swatches, drawn silhouettes and type carry it. This must be honest: no stock images.
- `notes.md`, with exactly these sections:
  - `## Concept`: one paragraph, plus the one sentence the founders should remember.
  - `## What it removes or moves`: a list measured against today's page.
  - `## Spec rules this direction changes`: the table described above.
  - `## How editions drive it`.
  - `## Zero-photo job`.
  - `## Risks`.
- `renders/`: written by the oracle below. Do not hand-edit it.

## Done oracle

```sh
node artifacts/client-calm-directions-2026-10-24/tools/check-direction.mjs <x>
```

It must print `PASS` and write the PNG renders. Look at your own renders before you submit. Calm
is a visual judgement that the numbers only bound: if the page looks busy, it is not done.
