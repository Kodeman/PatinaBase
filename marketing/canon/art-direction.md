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

- **Rights-owned Midwest spaces.** Photographs come from studios, homes and workshops we have
  written permission to show. Credit the studio and photographer.
- **What to show:** materials (white oak, walnut, linen, plaster, brass gone soft), grain up close,
  daylight through a real window, hands at work (sanding, marking a drawing, pinning a sample),
  real studios mid-job: a sample board half-pinned, a tape measure on a sill, a drawing with notes.
- **Never:** the stock look (staged smiles, empty showrooms, laptop-on-a-marble-desk), gradients,
  emoji, the glossy 3D-render look, neon, lens-flare drama, coastal or skyline cues.
- **Faces:** no person's face as the hero unless that person has consented in writing. Prefer
  hands, backs, shoulders, a figure at the edge of frame.
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
- **video-9x16 (≤ 30 s) / video-16x9 (≤ 60 s):** open on texture or hands in the first two seconds.
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

1. a designer's hand pinning a linen swatch to a sample board, unbleached linen and walnut veneer
   chips, soft north window light, 50mm at eye level, quiet and focused, a converted brick
   warehouse studio in Milwaukee's Third Ward
2. a white oak dining table mid-install, hand-rubbed oil finish catching the grain, low late
   afternoon sun across plank floors, 35mm wide from the doorway, calm and settled, a 1920s
   bungalow in Madison's Vilas neighborhood
3. two pairs of hands over a drawing set on a work table, graphite notes and a brass scale ruler,
   overcast daylight from a long window, 85mm close crop, collaborative and unhurried, a small
   design studio above a Main Street storefront in Mineral Point, Wisconsin
4. a maker planing a cherry board in a timber-frame workshop, curled shavings on the bench, dusty
   shafts of morning light, 50mm at bench height, patient and exacting, rural Driftless Area
   barn workshop in winter
5. a half-finished living room with drop cloths, plaster walls and a single upholstered chair
   waiting in place, wool boucle and raw plaster, diffuse snow-light through tall windows,
   28mm from the corner, anticipation, a Prairie School house in Oak Park, Illinois
6. a tape measure, a fabric ring and a phone resting on a deep window sill, cotton, steel and
   painted pine, early morning frost light, 100mm macro, quiet beginning of a workday, a farmhouse
   on the edge of Door County

**Negative list** (append to every prompt as one `--no` clause):
`--no text, letters, words, watermark, logo, signage, gradient, emoji, glossy render, CGI, 3d render,
plastic, chrome, neon, lens flare, HDR, oversaturated, stock photo, smiling at camera, face in focus,
skyline, palm trees, ocean, beach, mountains, penthouse, marble everywhere`

## 6. Image to video (Midjourney V8 animate)

- Animate from a chosen still (the video job's `startFrom`). Use **low motion**.
- **One camera move per clip**, named in the motion prompt: a slow push-in, a slow lateral slide,
  or a slow tilt down. No orbiting, no zoom-and-pan combinations, no fast cuts inside a clip.
- Subject motion stays small: dust in light, a hand finishing a stroke, a curtain lifting.
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
