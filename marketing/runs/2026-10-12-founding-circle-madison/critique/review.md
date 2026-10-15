# Review — 2026-10-12-founding-circle-madison (Press B5)

Reviewer: Fable (separate context from the draft, judge and compose seats). Read as the Founding
Circle reader this batch addresses (a Madison-area homeowner, V21) and as the studio owner behind
her. Judged against `marketing/canon/voice.md`, `art-direction.md`, `channels.json`, `claims.md`,
`plan.json` and each piece's `copy/<P>.final.md`. Every finding is reported; nothing filtered.

Rendered outputs reviewed: `out/P01–P04/*.png` + caption/alt, `out/P05/P05.png` + `P05.html`,
`out/P07/P07.pdf` + preview, `out/P08/pitch.md`. **P06 has no rendered output** (render failed).

## Batch-wide

**Voice gates: pass.** No "AI", "artificial intelligence", "machine learning", "algorithm" or
"powered by" in any rendered piece. No Pledge language. The held tagline appears nowhere (P06 was
allowed it once and did not use it; fine). Every "200" sits in a sentence with [C33]; "2026"
is a year and exempt; "twenty years" / "two hundred" are spelled out. Every place is Madison,
Middleton, Milwaukee or Wisconsin. All eight lint files are clean (0 errors, 0 warnings). All seven
stills are Midjourney (no FLUX placeholders).

**BW-1 — HIGH — The visible "Illustration" label is missing on every rendered image (P01, P02,
P03, P04, P05, P07).** `plan.json` artDirection and every piece brief require the word
"Illustration" on the image where a credit would sit; `critique/picks.md` repeats it ("must carry
the 'Illustration' label on its piece"). None of the six renders show it. Root cause is split:
(a) `templates/poster.html` has an `.image-label` slot fed by frontmatter `imageLabel`, but
`copy/P07.final.md` never sets `imageLabel`; (b) `templates/social.html`, `pin.html`, `email.html`
and `one-pager.html` have **no** label slot, so P01–P06 cannot show it whatever the copy says
(compose only passes `imageLabel` for `kind: poster`). Alt text does say "Illustration" on
P01–P06, which satisfies the screen reader but not the rule.
Fix: (a) add `imageLabel: "Illustration"` to `copy/P07.final.md` frontmatter and re-render.
(b) For P01–P06 the main session must decide one of: extend the four templates and `compose.mjs`
with the same `.image-label` slot (a canon/tool edit, outside this run), or accept the alt-text-only
label for this batch and record that ruling in the run. Until one of those happens the batch
does not meet its own hard rule.

**BW-2 — MEDIUM — The DM Mono eyebrow "Madison · Fall 2026" is missing on P01, P02, P03 and
P07.** art-direction §4 and each copy file call for it; only P04 (which sets `eyebrow:
"Middleton · Fall 2026"` in frontmatter) and P06 (frontmatter set, unrendered) carry it. `compose.mjs`
falls back to `plan.json place` / `concept.place` / brief `place`, and this plan has none, so the
eyebrow renders empty and the template hides it. Side effect: the Instagram word blocks are a
62 px headline floating in ~450 px of paper with nothing above it.
Fix: add `eyebrow: "Madison · Fall 2026"` to the frontmatter of `P01.final.md`, `P02.final.md`,
`P03.final.md` and `P07.final.md`; recompose and re-render.

**BW-3 — LOW — Headline punctuation is inconsistent across the social set.** P01, P02, P03 end
with a full stop; P04 ("Before the room takes shape") and P07 ("A place at the table") do not.
Playfair sentence-case headlines read either way; pick one. Suggest no full stop on all five
(poster and pin already read as titles).

---

## P01 — social, instagram-4x5 (`out/P01/P01.png`)

Render: 1080×1350, image rows 0–900 (two thirds), paper band below, headline Playfair 62 px at
x≈75 (inside the 64 px rule), "Patina" wordmark small at the foot. Caption and alt match
`P01.final.md` exactly with markers stripped.

- **P01-1 — HIGH** — No visible "Illustration" label on the image. See BW-1.
- **P01-2 — MEDIUM** — No eyebrow; see BW-2. Fix: `eyebrow: "Madison · Fall 2026"`.
- **P01-3 — LOW** — Both women wear broad, bright smiles while looking at a linen swatch. It is
  not "looking at camera", and the sample-to-window moment is exactly the brief, but the smiles
  edge toward the "staged smiles" look art-direction §3 lists under Never. `picks.md` weighed this
  against J01-1 (candid, linen not held up) and chose J01-2; I'd keep J01-2 but flag it for Kody's
  eye. Fix if he agrees: swap to J01-1 and accept the weaker linen moment, or regenerate with
  "quiet, considering" added to the mood clause.
- **P01-4 — LOW** — Caption line "Patina is being built a few miles away, around a real designer's
  eye and Midwest makers" sits next to C14 ("Patina's intelligence is a real designer's eye", status
  `todo`). As written it describes the people building it, not a product capability, and carries
  no number, so it passes; just do not let it drift toward "Patina has a designer's eye".
  No change needed.
- **P01-5 — LOW** — Composition: ~200 px of empty paper between the headline and the wordmark.
  The eyebrow fix (BW-2) fills the top of the block; nothing else needed.

Copy check: headline 7 words (≤ 8), caption 68 words (40–90), 3 specific hashtags, one ask stated
as the plain address, cap not mentioned (allowed), pre-launch stated [C24], monthly say [C35],
address [C38]. Alt opens with "Illustration." and never calls it a real home. Pass.

## P02 — social, instagram-4x5 (`out/P02/P02.png`)

Render: same frame as P01. Headline one line. Image: a maker at a bright bench, laptop open, CNC
router and tall windows behind, a wide white oak panel with a printed drawing half under it. No
hand tools, hands are not the subject, no furniture as subject. Modern and bright as the brief asks.

- **P02-1 — HIGH** — No visible "Illustration" label. See BW-1.
- **P02-2 — MEDIUM** — No eyebrow; see BW-2.
- **P02-3 — LOW** — The maker is looking at the laptop, not "checking a white oak board against
  the drawing" as the brief and alt text say; the drawing is half covered by the board. The alt
  still describes the frame honestly enough (board, drawing, laptop, CNC all present), so this is
  believability, not accuracy. Fix if desired: J02-1 stays; or re-roll J02 with "eyes on the
  drawing beside the board" and keep the no-hand-tools gate that ruled out J02-2/J02-4.
- **P02-4 — LOW** — Dead paper under the one-line headline (~260 px). Eyebrow fix helps; could
  also let the headline wrap to two lines by setting `max-width` lower, but that is a template
  edit; leave.

Copy check: headline 5 words, caption 85 words (within 40–90), hashtags 3 and specific, one ask,
pre-launch [C24], monthly questions [C35], address [C38]; no "curated/luxury/bespoke"; names no
maker or piece. "Whose work would you want to live with?" is the strongest line in the batch. Pass.

## P03 — social, instagram-4x5 (`out/P03/P03.png`)

Render: sample library with labelled wood/tile samples on open shelves, plans pinned, monitor
showing a floor plan, laptop, scheme of samples blurred in the foreground, bare trees and parked
cars out the window (late fall, reads Madison). No people, as the brief requires so no figure stands
in for Kody or Leah. Screens show no legible words.

- **P03-1 — HIGH** — No visible "Illustration" label. See BW-1.
- **P03-2 — MEDIUM** — No eyebrow; see BW-2.
- **P03-3 — LOW** — Midjourney tell: a white articulated object behind the laptop (a desk lamp
  whose arm geometry is wrong, reading like a small wind turbine). Small, mid-frame, most readers
  will not notice; a Madison designer might. Fix: inpaint/vary-region it out, or accept.
- **P03-4 — LOW** — Headline "Plans pinned up, a few miles from home." leans on "home" meaning
  the reader's house; on its own in a feed it can read as the studio being a few miles from its own
  home. The caption resolves it ("built at Middle West Studio in Madison"). Optional fix: "Plans
  pinned up, a few miles from you."
- **P03-5 — LOW** — The caption's byline "Kody and Leah" sits after a blank line inside the
  caption text file; on Instagram that renders fine. No change.

Copy check: headline 7 words, caption 77 words, 3 hashtags, cap stated once as a cap ("limited
to 200 members [C33]", no remainder), [C01] [C24] [C36] [C34] [C37] [C38] all present and verified,
byline names only. Pass.

## P04 — pin, pinterest-2x3 (`out/P04/P04.png`)

Render: 1000×1500, tall image, paper band at the foot with the DM Mono eyebrow "— MIDDLETON ·
FALL 2026" and the Playfair headline, wordmark small at the foot. Headline never over the photo.
Image: two white oak sample squares, a folded natural-linen swatch, a pencil and a coffee cup on
a pencil perspective sketch of a room, cooktop edge at left, fall trees in the window. The sketch
holds no legible words. This is the cleanest render in the batch.

- **P04-1 — HIGH** — No visible "Illustration" label (pin template has no slot). See BW-1.
- **P04-2 — LOW** — Headline has no full stop while P01–P03 do; see BW-3.
- **P04-3 — LOW** — Caption is exactly 50 words with markers stripped (limit ≤ 50) and hashtags
  are exactly 4 (limit ≤ 4). Both at the ceiling, both pass; nothing to add later without cutting.

Copy check: headline 5 words (≤ 6), one sensory lead, a reason to save ("Planning a room this
fall?"), pre-launch [C24], monthly question [C35], address [C38]. Alt ends "An illustration."
Pass.

## P05 — email (`out/P05/P05.png`, `out/P05/P05.html`)

Render: 600 px, paper ground, Playfair for the subject-line heading, Inter body ~16 px, hidden
preheader present in the HTML, signed "Leah", footer "Patina / Middle West Studio · Madison,
Wisconsin", then an ESP rail "Patina · {{business_address}} / Unsubscribe · Manage preferences".
Body renders with images off (plain paragraphs). Subject 52 characters. Body 178 words (120–220).
Exactly one ask (patina.cloud/founding), ends "Reply here; it comes straight to me."

- **P05-1 — HIGH** — No "Illustration" label on the image; the brief requires it "labelled
  'Illustration'". The email template has no slot. See BW-1. The alt text does open with
  "Illustration:", which is what a reader with images off gets.
- **P05-2 — MEDIUM** — The image sits between "Hi ⟨FILL⟩," and the first paragraph, not "under
  the opening paragraph" (art-direction §4, plan brief). `compose.mjs` splits the body into
  markdown blocks and places the image after block 1, and block 1 is the greeting line. So the
  letter opens greeting → picture → first words, which is a newsletter rhythm, not a letter.
  Fix (copy side, inside this run): make the greeting and the opening paragraph one markdown block
  in `P05.final.md` (greeting line ending in a hard break of two spaces, paragraph on the next line)
  so the image lands after "…hear this from me first." Verify `markdownBlocks` keeps the hard
  break; if it does not, the alternative is a compose change to skip a one-line greeting block
  (tool edit, main session).
- **P05-3 — MEDIUM** — The brief asks the letter to name "a named material, a named room" from
  her clients' own rooms; the letter stays general ("rooms again, mine and the ones we worked on
  together"). Leah is writing to people whose houses she knows; one concrete line would make it
  hers. Fix: add a fill slot after the first sentence, e.g. "I still think about ⟨FILL: the room
  and one material, e.g. your dining room and that rift-sawn white oak⟩." Keeps the body inside
  220 words if the second paragraph's colon clause is trimmed.
- **P05-4 — LOW** — `{{business_address}}`, `{{unsub_url}}` and `{{prefs_url}}` render literally
  in the footer. The template leaves them for the ESP on purpose, and this is a draft the pipeline
  never sends, but the board will show the braces. Fix: nothing in this run; the main session
  should say on the board that the ESP fills them, or fill the address before Kody reviews.
- **P05-5 — LOW** — An "Unsubscribe · Manage preferences" rail under a personal letter from Leah
  to her own clients undercuts "a letter, not a newsletter" (voice §9). If this goes out from
  Leah's own mailbox 1:1, the rail is wrong; if it goes through an ESP, the law wants it. Decide
  the send path before the footer is judged. No change in this run.
- **P05-6 — LOW** — Image believability is good (sample board with linen and three wood swatches,
  a printed sketch, ottoman, armchair and lamp soft at the edges, maples in the window). The
  armchair is prominent but not the subject; passes the no-hero-furniture rule.

Copy check: [C01] [C24] [C35] [C36] [C34] [C37] [C33] [C38] all present and verified; cap stated
once as a cap; "It's an invitation, not a purchase" is the right honesty line; no "Hartwell", no
titles, no tagline, no "The Patina Team". Pass.

## P06 — one-pager, one-pager-letter (NO OUTPUT)

`ledger.json`: `render … failed — "one-pager overflows: content is 1171 px on a 1056 px page;
cut copy"`. `out/P06/` does not exist; `compose/P06/` holds only `image.png`. Nothing to judge
visually, so this section judges the copy and the pick.

- **P06-1 — HIGH** — The piece has no rendered PDF. Content is 115 px (~1.2 in, roughly 5–6 body
  lines at 10.5 pt / 1.55) over the letter page. The template is fixed (0.75 in margins, 30 pt
  title, 2.4 in image band, four ruled sections, CTA foot) and refuses to shrink by design, so the
  copy must lose about 90–100 words. Current section bodies run 65 / ~70 (intro + 5 bullets) /
  45 / 60 words. Concrete cuts that keep every claim and all five benefits as single lines:
  - §1 (65 → ~45): "Fall comes to Madison and the light drops low across rooms you know by heart.
    The living room that never got finished. The dining table you want made to last. A home like
    that is made by a designer's eye for the whole house and Midwest makers who let the grain show."
  - §2: keep the intro line and five bullets; trim "First access: first through the door at
    launch, first to test it as it's built [C34]." to "First access: first through the door at
    launch, and first to test it [C34]." so each bullet is certainly one line.
  - §3 (45 → ~32): "Kody and Leah, at Middle West Studio in Madison, Wisconsin [C01]. Patina
    starts with studios in Madison and Milwaukee and grows through Leah's network [C08]; the circle
    is open wherever you call home [C39]."
  - §4 (60 → ~30): "A little of your attention while the choices are still being made. Join at
    patina.cloud/founding; membership begins with a first letter from Kody [C38]. The circle is
    limited to 200 founding members [C33]." (drops the "From there, your part is the one you
    choose…" sentence, which repeats §2).
  Re-run compose + render; if it still overflows, the next lever is the template's 2.4 in band or
  0.34 in gap (canon edit, main session), not more copy.
- **P06-2 — HIGH (inherits BW-1)** — The one-pager template has no `imageLabel` slot, so the
  `imageLabel: "Illustration"` already in `P06.final.md` frontmatter will not render. Same fix
  path as BW-1(b).
- **P06-3 — LOW** — J06-2 pick (`compose/P06/image.png`): two women in a kitchen mid-renovation
  share a tablet; cabinet boxes, plans on the island box, a door leaning on the wall, fall trees out
  the window. Believable at band size. Two small tells: a black object (phone/stylus) over the
  tablet where the hands meet, and the "painted cabinet door sample" is a full door. At the 2.4 in
  band crop the hands and tablet sit mid-frame as picks.md predicted, so the tell is visible. Fix:
  accept, or vary-region the hands.
- **P06-4 — LOW** — The plan reserved the tagline for P06's footer; the copy does not use it and
  the one-pager template has no footer line for it anyway (foot = CTA + wordmark). Fine as is; if
  Kody wants the one brand moment, it would need a template slot. Information only.
- **P06-5 — LOW** — "Your name at launch: credited by name [C37]." and "Always a founder:
  founding-member status never expires [C37]." both cite C37; correct, C37 covers both. "white oak
  that will look better in twenty years" is spelled out, no marker needed. Pass.

## P07 — poster, poster-18x24 (`out/P07/P07.pdf`, `out/P07/P07-preview.png`)

Render: MediaBox 1314×1746 pt = 18.25×24.25 in (18×24 trim + 0.125 in bleed each side, correct per
channels.json). Image band top ~16.6 in, paper band below with Playfair headline ~1.15 in tall
(~83 pt), subhead in Playfair italic, Inter body ~0.4 in, wordmark bottom right. Text inset ~1.1 in
from the sheet edge. Image: a woman seen from behind holding a walnut sample to a tall mullioned
window, maples in low sun, dining chairs and a sideboard soft below. Face unseen; one figure, one
window, one sample; it reads from across a room. Hands and the sample hold their shape.

- **P07-1 — HIGH** — The PDF embeds the raw 928×1232 px Midjourney pick (confirmed by reading the
  image XObject: Width 928, Height 1232, FlateDecode). Across an 18.25 in sheet that is ~51 ppi;
  on a 300 dpi cafe print the image will be visibly soft and blocky at reading distance, and the
  maples/window mullions will show upscaling artefacts. art-direction §4 and `picks.md` both say
  "upscale to 5400×7200 before print"; it was not done. Fix: upscale J07-4 (Midjourney Upscale
  Subtle → then a 2× local upscaler, or straight to ≥ 5400×7200), drop it in `mj/inbox/J07/` as
  the pick, recompose and re-render. Verify the new PDF's image Width/Height before it goes on
  the board.
- **P07-2 — HIGH (inherits BW-1)** — No "Illustration" label on the image. The poster template
  is the one template that supports it; `P07.final.md` just never sets `imageLabel`. Fix: add
  `imageLabel: "Illustration"` to the frontmatter.
- **P07-3 — MEDIUM** — The byline "Kody and Leah" is missing from the print. The plan brief
  requires it ("Byline 'Kody and Leah', names only") and the copy specifies a signature under the
  body, but the poster template has no signature slot and compose passes only headline / subhead /
  body. Fix inside this run: end the body with it, "… Join at patina.cloud/founding [C38]. Kody
  and Leah" — body becomes 33 words (≤ 35).
- **P07-4 — MEDIUM** — No eyebrow "Madison · Fall 2026"; see BW-2. The template has the slot;
  the frontmatter lacks the field. Fix: `eyebrow: "Madison · Fall 2026"`.
- **P07-5 — LOW** — The copy specifies the subhead in Inter; the template sets it in Playfair
  italic. Playfair for a pull line is allowed by art-direction §2 and it looks right on the sheet;
  the mismatch is copy-spec vs template, not a rule break. Leave the render; update the copy note.
- **P07-6 — LOW** — The copy's separate DM Mono address line at the foot does not render (no
  template slot). The body already ends with the address, so the ask is on the sheet. Leave.
- **P07-7 — LOW** — The PDF image `alt` is the headline ("A place at the table"), because compose
  falls back to the headline when a poster has no `alt`. Add `alt:` to the frontmatter (the J07
  description) for the accessible PDF; cosmetic.
- **P07-8 — LOW** — Legibility: headline ~83 pt reads from well past six feet; the body at
  ~29 pt reads from about three feet, which is right for a wall poster the words carry. Pass.

Copy check: headline 5 words (≤ 6), subhead 12 (≤ 14), body 30 (≤ 35); "The table seats two
hundred [C33]" states the cap once, never a remainder; [C35] [C24] [C01] [C34] [C38] present;
no QR, no tagline. Pass.

## P08 — PR pitch (`out/P08/pitch.md`)

Rendered markdown, markers stripped, headed "DRAFT. NOT SENT." Subject 47 characters, plain. Body
~99 words excluding the fill slots (≤ 150). One ask (a studio visit on an arranged day while Leah
works through samples). No "exclusive", no attachments promised, no pitch adjectives, no
disrupt/revolutionize. Signed "Kody / Middle West Studio", no title.

- **P08-1 — MEDIUM** — The piece cannot be judged as outreach until the two fill slots (the story
  they ran; one checkable detail) are filled; as rendered its first two sentences are placeholders.
  That is by brief, but the board must not show it as send-ready. Fix: main session fills the
  slots per recipient before anything leaves; keep "DRAFT. NOT SENT." until then.
- **P08-2 — LOW** — "Leah and I are building Patina … grows through Leah's network" gives an
  editor a first name only, with no way to check who Leah is; the sign-off is also first name only.
  That is canon (voice §4, V4: first names, no titles), so it is not a defect in the draft, but a
  working editor will want a surname to verify. Raise with Kody as a V4 question rather than change
  it here (C02 "Leah Kochaver" is verified if he rules yes).
- **P08-3 — LOW** — "Before they open, we are asking homeowners in." is a slightly odd
  construction. Optional: "Before they open, we are inviting homeowners to help choose."
- **P08-4 — LOW** — The ask is the visit only; the brief allowed "a call, or a visit". One ask is
  correct; the visit is the stronger one for a lifestyle writer. No change.

Copy check: [C01] [C08] [C24] [C35] [C33] [C39] [C38] present and verified; cap stated as a cap;
"open wherever they live [C39]" matches the ledger. Pass.

---

## Summary of what must change before the board

1. BW-1 / P07-2: `imageLabel: "Illustration"` on P07 (one-line fix); a ruling or template slot
   for P01–P06, where no template can show the label today.
2. P06-1: cut the one-pager copy (~95 words, concrete rewrites above) and re-render; the piece
   currently has no output.
3. P07-1: upscale J07-4 to ≥ 5400×7200 and re-render the poster; the PDF holds a 928×1232 image.
4. BW-2: add `eyebrow: "Madison · Fall 2026"` to P01, P02, P03, P07.
5. P07-3: put "Kody and Leah" at the end of the poster body.
6. P05-2 / P05-3: move the email image under the first paragraph; add one named-room fill line.

Everything else is low and can ride to the board as-is with the notes above.
