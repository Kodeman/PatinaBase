# Patina art direction — the canon for The Press

How Patina pieces look. Voice lives in `voice.md`; channel sizes live in `channels.json`.
`docs/vision/VISION.md` wins every conflict: typography first, no dashboards, no badges, no
red/green status, no shadows-as-decoration.

## 1. Palette

From `packages/patina-design-system/src/tokens/colors.ts` (`brandColors`). Hex is the exact
conversion of the token's rgb.

| name | token | rgb | hex | use |
|------|-------|-----|-----|-----|
| Patina off-white | `patinaOffWhite` | rgb(237 233 228) | #EDE9E4 | paper; default ground |
| Light gray | `lightGray` | rgb(245 242 237) | #F5F2ED | lifted paper, email body |
| White | `white` | rgb(255 255 255) | #FFFFFF | print bleed safety only |
| Clay beige | `clayBeige` | rgb(163 146 124) | #A3927C | hairlines, eyebrow labels, accent |
| Medium gray | `mediumGray` | rgb(184 176 166) | #B8B0A6 | rules, captions on dark |
| Mocha brown | `mochaBrown` | rgb(101 91 82) | #655B52 | secondary text, subheads |
| Dark gray | `darkGray` | rgb(74 69 63) | #4A453F | body text on paper |
| Charcoal | `charcoal` | rgb(63 59 55) | #3F3B37 | headlines; dark ground |

Theme anchors (`lightTheme`, OKLCH, use as written in CSS): background
`oklch(0.9582 0.0152 90.2357)`, foreground `oklch(0.376 0.0225 64.3434)`, primary
`oklch(0.618 0.0778 65.5444)`. Dark: background `oklch(0.2747 0.0139 57.6523)`, foreground
`oklch(0.9239 0.019 83.0636)`, primary `oklch(0.7264 0.0581 66.6967)`.

Do not use the functional colors (success, warning, error, info) in marketing: VISION §6 refuses
red/green status. No gradients. Flat paper, ink and one accent.

## 2. Typography

From `packages/patina-design-system/src/tokens/typography.ts`.

- **Headings: Playfair Display** (serif). Headlines, pull lines, the poster's one sentence.
  Sentence case. Regular or italic for warmth; bold sparingly.
- **Body: Inter.** Captions, email body, one-pager sections, deck body. 16 px minimum on screen,
  10 pt minimum in print.
- **Labels: DM Mono.** Eyebrows, dates, place lines, scene numbers, small caps-like labels with
  open tracking. DM Mono is a placeholder pending Leah's review (`monoDisplay` token); if she rules
  against it, fall back to JetBrains Mono (`mono`).
- One heading face, one body face, one label face per piece. No display novelties.

## 3. Photography and imagery

- **Rights-owned Midwest spaces.** Photographs come from studios, homes and job sites we have
  written permission to show. Credit the studio and photographer.
- **How studios work now (Kody, 2026-10-09).** A residential design studio today is a bright,
  current working office: laptops and a large monitor on the desk, a phone in hand, plans printed
  and pinned, and a sample library of fabric books, tile, stone, wood and finish samples on open
  shelves. Show that as it really is. Do not stage the work in a century-old workshop.
- **What to show:**
  - the studio's sample library, with a designer pulling fabric books or a tile and laying a scheme
    out on the table;
  - a designer at a desk working between a laptop, a monitor and printed plans;
  - plans in the space: a drawing set or tablet open in the house under construction, with the
    contractor, a trade or the client looking at the same page;
  - the house mid-build: framing, drywall, cabinet boxes going in, a kitchen island before its top;
  - materials up close as supporting shots, not the whole story.
- **People:** working adults of mixed ages, dressed for a studio or a job site, caught mid-task
  and looking at the work. Groups of two or three sharing one set of plans or one screen carry the
  "same page" idea. Faces may be in the frame at a natural distance; no portrait-style hero face
  and no one looking into the lens.
- **Never:** old-workshop nostalgia (antique hand tools, dusty benches, grime, sepia, worn
  hands as the subject); a studio with no computer in it; the stock look (staged smiles,
  handshakes, empty showrooms, a laptop alone on a marble desk); gradients, emoji, the glossy
  3D-render look, neon, lens-flare drama, coastal or skyline cues.
- **Faces in rights-owned photographs:** no real person's face as the hero unless that person has
  consented in writing.
- **Generated images are illustrations.** Never caption a Midjourney or FLUX image as a real
  project, a real client's home, a real maker's piece or a real studio. Never generate a likeness
  of a real person or a real maker's product.
- **No screenshots of the product** as hero images. If the Document appears, it is on paper or a
  screen seen in a room, with real-looking work on it.

## 4. Composition per channel

Sizes and formats are in `marketing/canon/channels.json`; these are the layout habits.

- **instagram-4x5 / linkedin-portrait (1080×1350):** image owns the top two thirds; headline in
  Playfair on paper below, DM Mono eyebrow above it. Keep text out of the outer 64 px.
- **pinterest-2x3 (1000×1500):** tall image, headline set over a paper band at the foot, never
  over the photo. One material close-up beats a whole room.
- **linkedin-landscape (1200×627):** image left 60%, words right on paper. Headline ≤ 8 words.
  Assume the feed crops to the centre.
- **email (600 px):** letter first. One image at most, under the opening paragraph, full width.
  Readable with images off. Paper ground, Inter body, Playfair only for the subject-like heading.
- **one-pager-letter (8.5×11 in):** margins ≥ 0.75 in. Eyebrow, Playfair title, one image band,
  three or four sections in a single column, CTA at the foot. Print-safe: no full-bleed dark ground.
- **deck-16x9 (1920×1080):** one idea per slide, headline top-left, generous paper. Images full
  bleed or not at all. DM Mono footer line for sources.
- **poster-18x24 (3:4, 300 dpi):** one image, one Playfair line readable from six feet, subhead and
  body in the bottom quarter. Bleed 0.125 in. Image at 5400×7200 px or upscaled to it.
- **video-9x16 (≤ 30 s) / video-16x9 (≤ 60 s):** open on the work in the first two seconds: a
  sample library, plans on site, a screen and a set of drawings.
  On-screen text in the middle third, ≤ 7 words, Inter. The Patina mark once, at the end, on paper.

## 5. Midjourney house style

Midjourney is a human step. Kody pastes prompts from `mj/prompts.md` into midjourney.com and drops
the results into `mj/inbox/<J>/`. Nothing automates Midjourney.

SREF: {{SREF}}

(Kody replaces `{{SREF}}` with the house style-reference code. Until then, `mj-pack` leaves the
placeholder in and warns.)

**Default parameters:** `--v 8.1 --style raw`, plus `--ar` from the piece's channel and
`--sref {{SREF}}`. Example full tail: `--ar 4:5 --style raw --v 8.1 --sref {{SREF}}`.
Prompts in `plan.json` carry the prompt text only; `mj-pack` adds the parameters.

**Prompt grammar:** subject · material · light · lens · mood · Midwest place cue. One clause each,
comma-separated, concrete nouns over adjectives.

**Example prompts (text only):**

1. an interior designer in her thirties pulling a fabric book from the open shelves of a studio
   sample library, rows of fabric books, tile and wood samples behind her, bright even daylight
   from large windows, 35mm at eye level, candid and mid-task, a contemporary design studio in
   Madison, Wisconsin
2. a designer at a white oak desk working between a laptop and a large monitor showing a floor
   plan, printed plans and a tile sample beside the keyboard, clean daylight and soft overhead
   light, 50mm over the shoulder, focused, a bright modern studio office in Milwaukee's Third Ward
3. a designer, a contractor in a work jacket and a homeowner standing in a framed-out kitchen
   looking at the same set of plans on a tablet, studs, drywall stacks and cabinet boxes around
   them, overcast daylight through new window openings, 35mm documentary, a new-build house
   in Waunakee, Wisconsin
4. a kitchen mid-install with cabinet boxes in place, the island waiting for its top and a
   printed elevation taped to the wall, plywood, painted cabinetry and drywall, daylight from a
   rear window wall, 28mm from the doorway, work in progress, a new home outside Madison
5. two designers at a large studio table laying out a scheme of fabric, tile, a wood door sample
   and printed plans while a laptop sits open at the end, daylight from tall windows, 50mm from
   slightly above, collaborative, a contemporary design studio in Madison
6. a phone and a printed drawing set on a kitchen island under construction, a tape measure
   beside them, quartz sample and painted cabinet door, morning light, 85mm close, the start of
   a site visit, a new-build house in Wisconsin

**Negative list** (append to every prompt as one `--no` clause):
`--no text, letters, words, watermark, logo, signage, gradient, emoji, glossy render, CGI, 3d render,
plastic, chrome, neon, lens flare, HDR, oversaturated, stock photo, smiling at camera, looking at
camera, posed portrait, handshake, antique workshop, hand tools, sepia, grime, distressed, skyline,
palm trees, ocean, beach, mountains, penthouse, marble everywhere`

Screens in a frame show plans, elevations or photos with no legible words; `--no text` keeps them
unreadable, which is what we want.

## 6. Image to video (Midjourney V8 animate)

- Animate from a chosen still (the video job's `startFrom`). Use **low motion**.
- **One camera move per clip**, named in the motion prompt: a slow push-in, a slow lateral slide,
  or a slow tilt down. No orbiting, no zoom-and-pan combinations, no fast cuts inside a clip.
- Subject motion stays small: a person turning a page of plans, a fabric book set down, a
  contractor pointing at a wall.
- **Clips are ≤ 10 s.** A 30 s 9:16 piece is three or four clips cut together in the hyperframes
  composition, not one long extension.
- Reject any clip where faces, hands or materials warp, text appears, or the light flickers.

## 7. FLUX (local placeholders only)

- `flux.mjs` wraps `mflux-generate` (schnell) to fill jobs Midjourney has not answered yet, so
  compose and the board can run end to end.
- **FLUX images are placeholders. Never final, never approved, never published.** `ingest` marks
  them `flux-placeholder` and the board shows a PLACEHOLDER badge on every piece that uses one.
- FLUX prompts use the same grammar with the place cue simplified; no style reference applies.
- A piece is ready for review only when every image on it came from Midjourney or a rights-owned
  photograph.
