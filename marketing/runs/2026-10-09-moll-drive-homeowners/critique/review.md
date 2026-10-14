# Render review (Press B5): P01, P04, P06, P07

Reviewed as the studio owner at the first-hire moment, against `marketing/canon/voice.md`,
`art-direction.md`, `channels.json` and `claims.md`. Every finding is listed; nothing filtered.

What was looked at: `out/P01/P01.png` + caption/alt txt; `out/P04/P04.pdf` (page 1) and
`P04-preview.png`; `out/P07/P07.pdf` (page 1) and `P07-preview.png`; P06 has **no `out/` folder**
(render failed, `ledger.json` 17:19:39), so its composition `compose/P06/index.html` was opened and
screenshotted instead. Copy compared against `copy/<id>.final.md` and the held versions in
`hold/fill-versions/`.

Voice rules that fail a piece: none tripped in any of the four. No "AI"/"machine learning"/
"algorithm"/"powered by", no Pledge language, no held tagline, no coastal place names. Every
two-digit number sits in a sentence with a verified marker (`[C27]` dates, `[C25]` 1987; years
are excepted). All markers used (C01, C04, C05, C24, C25, C26, C27, C28, C29) are `verified`
rows; C30 (todo) is never cited. Lint JSONs for all four are clean.

Craft limits, measured on the rendered text (markers stripped): P01 headline 5 words, caption
72 words, 3 hashtags. P04 headline 6, subhead 12, body 32. P06 sections 64/48/52/62. P07
sections 16/39/32/62. All inside the limits.

---

## Batch-level (applies to P01, P06, P07)

**B1 · high · Rights gate on the Kippley listing rendering.** J01, J06 and J07 are the same file
(`moll-drive-rendering-kippley-listing.png`, 1692×929), pulled from Kippley's Parade listing
(`static.wixstatic.com`, per `hold/README.md`). The hold README states plainly: "Needs Matt
Kippley's written OK before it is printed or posted." P01 is scheduled to post today (Fri Oct 9)
and P06/P07 print Thu Oct 15. Nothing in the run records that OK. Fix: record the written OK in
`docs/marketing/partners/kippley.md` (main session / Kody) before P01 posts or P06/P07 go to print;
until then the three pieces are blocked, not just "held for review".

**B2 · medium · One image carries four pieces, and it is a glossy 3D render.** The identical
exterior rendering is the hero of P01, P03, P06 and P07. Art direction §3 lists "the glossy
3D-render look" under Never; the brief allows a credited rendering as the stopgap, so this is a
judgment call, not a rule break. Seen as the studio owner: a saturated lawn, a gradient sky and no
real daylight is exactly the look the canon avoids, and the two printed flyers on the same counter
(P06, P07) will look like the same sheet twice. Fix: for the reprint, get one real interior photo
from Leah or Kippley for J01/J06 (a room from the doorway, the warm wood and rear windows), and keep
the exterior for P07 only.

**B3 · low · `mj/assets.json` labels J01, J06 and J07 as `"source": "midjourney"`.** They are the
builder's rendering, not generated images. If the board or any later step reads that field it will
badge three real-house pieces as illustrations, or apply the "never caption a generated image as the
house" rule to them. Fix: ingest should mark them `photo` (or a `rendering` value) with the credit;
no copy change needed.

---

## P01 · social · instagram-4x5 (`out/P01/P01.png`, 1080×1350)

What I see: the exterior rendering fills the top 900 px, cropped cleanly (chimney and both gables
in frame, nothing cut at the 64 px edge). Paper band below with DM Mono eyebrow "WAUNAKEE · MADISON
FALL PARADE OF HOMES", Playfair headline "Open this weekend / in Waunakee" at 62 px, then roughly
190 px of empty paper and a "Patina" wordmark bottom-right. Palette and type match the canon
(#EDE9E4 paper, #3F3B37 ink, clay eyebrow). Caption and alt text files match the final copy with
markers stripped.

- **P01-1 · high · Blocked by B1 (rights).** Posts today; no written OK recorded.
- **P01-2 · medium · Caption opens on a room, the image is the front of the house.** First line:
  "From the doorway you see the finished room, not the brief, the sample board or the decisions
  behind it." The J01 job asked for "the room Leah would send a visitor to first, shot from the
  doorway"; the print cut swapped in the exterior and left the lead untouched. A reader looks at
  siding and a garage door while being told about a doorway and a room. Fix (today's cut, no new
  image): rewrite the lead for what is shown, e.g. "From the drive you see a finished house, not
  the brief, the sample board or the decisions behind every room." Fix (reprint): the interior
  photo J01 asked for.
- **P01-3 · medium · The card carries a Patina wordmark; the piece's own spec says "No Patina
  mark."** `copy/P01.final.md` line 22. The template's `.foot` prints "Patina" regardless. For a
  homeowner audience the mark is the only Patina mention anywhere on the card and the caption never
  explains it, so it reads as an unexplained brand on Middle West's post. Fix: compose should honor
  a per-piece `mark: none` (or the P01 frontmatter should set whatever flag the template respects);
  rerender.
- **P01-4 · medium · No credit on the image.** The P01 visual note says "Credit on the image: the
  photographer and rights owner, or 'Rendering: Kippley Custom Carpentry'." The render has no credit
  line; it lives only mid-caption. On Instagram the image travels without its caption (saves,
  shares, screenshots). Fix: a small DM Mono credit line over the bottom-left of the image (same
  treatment as the P04 "Illustration" label) reading "Rendering: Kippley Custom Carpentry"; keep the
  caption credit too.
- **P01-5 · medium · The eyebrow has the place but not the dates.** The plan's art direction and the
  copy note both call for the eyebrow to carry "the place and the Parade dates" (Waunakee · Fall
  Parade · Oct 9–11 and 16–18). The card alone says "Open this weekend" and never says which
  weekend; only the caption does. Fix: eyebrow "Waunakee · Fall Parade · October 9–11 and 16–18"
  (the dates are `[C27]` in the caption sentence; the eyebrow in frontmatter should carry the marker
  too so lint keeps agreeing).
- **P01-6 · low · ~190 px of dead paper between the headline and the wordmark.** Two short lines on
  a 450 px band. Adding the dated eyebrow (P01-5) and dropping the mark (P01-3) resolves most of it;
  otherwise move the image to 940 px and tighten `.words` padding.
- **P01-7 · low · "Open this weekend in Waunakee" is only true for the opening-weekend post.** The
  house is also open Oct 16–18. Fine for today's post; do not reuse this card for the second
  weekend without a new headline (P03 covers that).
- **P01-8 · low · Headline sits very close to the eyebrow's visual weight.** Minor: the 22 px gap
  between a tracked-out caps label and a 62 px serif reads tight. 28–32 px would breathe.

Copy that passes: specific, plain, Midwest, one ask (Leah at middlewest.studio), builder credited
and never beside Patina, no claim the house ran on Patina, alt text describes the image plainly.

---

## P04 · poster · poster-18x24 (`out/P04/P04.pdf`, 1314×1746 pt = 18.25×24.25 in with bleed)

What I see: the Midjourney oak-and-brass texture fills the top 16.6 in; the "ILLUSTRATION" label
sits bottom-left of the image on a translucent charcoal chip. Paper band below: DM Mono eyebrow
"MOLL DRIVE · WAUNAKEE · FALL PARADE OF HOMES", Playfair "Every room began as a brief" at 1.15 in,
italic Playfair subhead, Inter body, "Patina" wordmark small at bottom-right. Trim + bleed are
right (`@page 18.25in 24.25in`, text 1 in inside trim). One image, one idea, no QR. Palette and type
match the canon. Honesty rules hold: the image is labelled, never described as the house; Kippley
sits only in the subhead; Patina only in the body about the reader's own house; no day or hours.

- **P04-1 · medium · The image is embedded at 102 ppi, not 300.** `pdfimages -list`: 1856×1692 px
  across 18.25 in. `channels.json` sets 300 dpi; the J04 job note says "upscale the pick to
  5400×7200 px for print." It was not upscaled. Soft oak grain will survive a 3× enlargement better
  than most subjects and the viewing distance is six feet, but a print shop will flag it and the
  brass edge and the leaves will go soft up close. Fix: upscale the J04 pick (`..._f3fe39a4...png`)
  to 5400×7200 before compose (Midjourney upscale or a local upscaler), drop it in the inbox,
  rerender.
- **P04-2 · low · The "Illustration" label is 0.2 in (≈14 pt) on an 18×24 sheet.** It does its
  honesty job only up close; from the easel's viewing distance it vanishes. Fix: 0.28–0.3 in, same
  chip.
- **P04-3 · low · Body copy at 0.4 in (≈29 pt) is not six-feet legible.** The headline carries the
  six-foot rule; the subhead and body are read at arm's length, which is how an easel sign actually
  works. There is ~1.5 in of unused band below the body. Fix (optional): body 0.48 in, subhead
  0.5 in; still fits.
- **P04-4 · low · The pick's right third is a potted plant against a dark window.** The prompt
  asked for a plain cabinet door; the leaves compete with the pull and add a staged note. The
  other two J04 variants were not inspected for this review. Fix: compare the three inbox variants
  for a plainer door; or crop `object-position` left so the pull sits on the right third and the
  plant falls off the edge.
- **P04-5 · low · "Yours would start with one too."** The antecedent ("a brief") is in the headline
  three lines up; it reads fine on the sheet because the headline is huge, but it is the one
  sentence a cold reader has to re-read. Acceptable; noting only.
- **P04-6 · low · A Patina wordmark on an easel sign standing at Kippley's house.** Within the plan
  (one small mark at the foot). Just make sure the written OK from Kippley (B1) covers a
  Patina-marked sign on their easel, not only the rendering.

Copy that passes: headline 6 words, subhead 12, body 32; one ask; Leah first, Patina as a closing
clause with `[C04]`; no patina.cloud, no sign-up.

---

## P06 · one-pager · one-pager-letter (NO OUTPUT: `out/P06/` does not exist)

What I see: `ledger.json` records the render as **failed**: "one-pager overflows: content is
1097 px on a 1056 px page; cut copy". The template refuses to shrink or clip (`.page > *
{flex-shrink:0}`), so nothing was written. A headless screenshot of `compose/P06/index.html`
(taller viewport) shows the page laid out: eyebrow, title "The page behind your house", the same
exterior rendering in a 2.4 in band, four ruled sections, italic CTA and "Patina" at the foot. Type,
palette and margins match P07.

- **P06-1 · high · The piece did not render; it needs about 40 px (two to three body lines) cut.**
  The 1097 px measure includes the 0.75 in bottom margin, so roughly 30–40 words across the
  sections clears it. Concrete cuts that keep every claim and the honesty lines:
  - §4 "What it asks of you": drop ", whether you are building, remodeling or furnishing" (7
    words) and move "Rendering: Kippley Custom Carpentry." out of the body (4 words; see P06-2).
  - §1: drop ", and you may be picturing your own" (7 words); the heading already says it.
  - §2: drop the last sentence "Leah will talk you through the choices for your house." (10
    words); §4 says the same thing better.
  That is ~28 words (about two lines at 10.5 pt across the 7 in measure). If a credit line under the
  band is added (P06-2), cut one more line: §3 "going forward" at the end of the last sentence (two
  words) will not do it; drop "It is the kind of house Middle West will work on with you from one
  shared page, going forward." and let the previous sentence stand (the §2 heading already carries
  the going-forward promise). Rerender and confirm `out/P06/P06.pdf` exists.
- **P06-2 · medium · The image credit is a stray sentence inside §4's body.** "Rendering: Kippley
  Custom Carpentry." was appended to the last section during the print cut (hold diff) because the
  one-pager template has no credit slot under the band, which the copy comment (line 43) and art
  direction §3 both require ("Credit line under the band"). As rendered it reads as if Kippley
  rendered the conversation. Fix: the one-pager template needs a `credit` line under `.media` (DM
  Mono, 7.5–8 pt, clay); compose fills it from frontmatter; remove the sentence from §4.
- **P06-3 · medium · §1 describes an interior; the band shows the exterior.** "you can see the
  finished rooms: the warm wood, the kitchen's generous island, the rear windows onto the
  landscape" sits directly under a picture of siding and a garage. The J06 job asked for a room
  with the warm wood and rear windows in frame. Also identical to P07's band (see B2). Fix: the
  interior photo for the reprint; for the Oct 15 print, either accept it or reword the first
  sentence to "you can walk the finished rooms" so it stops pointing at the picture.
- **P06-4 · low · Title "The page behind your house" next to a flyer the reader is holding.** A
  homeowner may take "the page" to mean this sheet or a web page; the Document is never named until
  §3. It works once §2 is read. Fix (optional): "The one page behind your house" or leave.
- **P06-5 · low · Frontmatter `byline` ("Kody and Leah, Middle West Studio") is not rendered.** The
  template has no byline slot. Either accept (voice.md does not require a byline on a one-pager)
  or add it to `.foot` in Inter 8 pt; if added, it costs a line (see P06-1).
- **P06-6 · low · CTA punctuation differs from P07.** P06: "Talk to Leah at Middle West Studio:
  middlewest.studio"; P07: "Talk to Leah at Middle West Studio, middlewest.studio." Two sheets at
  the same counter should match. Fix: pick one (the P07 form reads better aloud).
- **P06-7 · low · Eyebrow is 8 pt DM Mono in clay (#A3927C) on paper.** About 2.3:1 contrast, below
  the 10 pt print floor set for body (labels are exempt, but this is the line that carries the
  dates). Fix: 8.5–9 pt and mocha (#655B52) for print.

Copy that passes: the honesty section ("it did not run on Patina", "pre-launch [C24]") is exactly
what the brief asked for and it is plain; no dashboards/task-manager talk; one CTA; byline from
people; no client lines about this spec house; C05 used only about working with the reader going
forward.

---

## P07 · one-pager · one-pager-letter (`out/P07/P07.pdf`, 612×792 pt)

What I see: letter page, 0.75 in margins, eyebrow "WAUNAKEE · 2026 MADISON FALL PARADE OF HOMES",
Playfair "The Moll Drive house" at 30 pt, the exterior rendering in the 2.4 in band (chimney
clipped at top, acceptable), four ruled sections, italic CTA "Talk to Leah at Middle West Studio,
middlewest.studio." and a "Patina" wordmark at the foot. Embedded image 1692×583 at 242 ppi, fine
for a flyer. Inter 10.5 pt body at the print floor. Palette and type match the canon. Honesty
lines hold: "This house did not run on Patina." in §4; Kippley only in §1 heading and §2; Patina
only in §4.

- **P07-1 · high · Blocked by B1 (rights).** Prints Thu Oct 15; no written OK recorded.
- **P07-2 · medium · §1 is a 16-word stub that repeats its own heading.** Heading: "Designed by
  Middle West Studio. Built by Kippley Custom Carpentry." Body: "You are standing in rooms designed
  by Middle West Studio, a residential design studio in Madison." The print cut deleted Leah's two
  FILL sentences (the light, the palette, the room she would show first) and left the frame. On the
  sheet it looks like the section lost its paragraph, which it did. Fix (Oct 15 print): fold the
  body into the heading, e.g. heading "Designed by Middle West Studio, Madison. Built by Kippley
  Custom Carpentry." with no body, and let §2 open; or get Leah's two sentences by Wednesday (the
  held version in `hold/fill-versions/P07.final.md` has the marker in place).
- **P07-3 · medium · Image credit misplaced in §3's body; the `credit` frontmatter is not rendered.**
  "Rendering: Kippley Custom Carpentry." ends the "The house" paragraph as if it were a feature of
  the house. The frontmatter has `credit:` and the copy comment (line 40) says "Print the credit
  under the band." Same template gap as P06-2. Fix: credit slot under `.media`; remove the sentence
  from §3.
- **P07-4 · low · "Middle West Studio" appears five times on one page** (eyebrow no, but §1 heading,
  §1 body, §4 twice, CTA). Plain-spoken turns into drumming. Fix: §4 "Middle West Studio would work
  with you..." → "Leah would work with you from one living page, from brief to install [C04]. That
  page is Patina, Middle West's own venture in Madison [C01]."
- **P07-5 · low · §4 names Patina twice in three sentences plus the wordmark.** For a counter flyer
  about the house, "That page is Patina, a venture of Middle West Studio in Madison. This house did
  not run on Patina." is honest and should stay; just note the density with the fix in P07-4.
- **P07-6 · low · Frontmatter `byline` not rendered** (same as P06-5).
- **P07-7 · low · Eyebrow 8 pt clay on paper** (same as P06-7).
- **P07-8 · low · Band crop clips the chimney and the tops of the trees.** `object-fit: cover` on a
  1692×929 source into a 7×2.4 in band. Acceptable; `object-position: 50% 35%` would keep the
  chimney cap and lose lawn instead.

Copy that passes: the Kippley section honors the craft with verified facts only (`[C25]`, `[C26]`),
no FILL text invented (no piece, no species, no materials beyond `[C29]`), one CTA, no sign-up or
patina.cloud, no day or hours for Leah.

---

## Summary by severity

| id | piece | sev | one line |
|----|-------|-----|----------|
| B1 / P01-1 / P07-1 | P01, P06, P07 | high | Kippley listing rendering has no recorded written OK; hold README blocks print and post |
| P06-1 | P06 | high | Render failed (overflow 1097/1056 px); no output file; cut ~30 words as listed |
| B2 | P01, P06, P07 | medium | One glossy 3D rendering is the hero of four pieces; get a real interior for the reprint |
| P01-2 | P01 | medium | Caption lead ("from the doorway... the finished room") contradicts the exterior image |
| P01-3 | P01 | medium | Patina wordmark rendered; piece spec says no mark |
| P01-4 | P01 | medium | No credit on the image; spec and art direction require it |
| P01-5 | P01 | medium | Eyebrow lacks the Parade dates; the card alone never says when |
| P04-1 | P04 | medium | Image embedded at 102 ppi; plan requires 5400×7200 (300 dpi) |
| P06-2 / P07-3 | P06, P07 | medium | Rendering credit is a stray sentence in body copy; template has no credit slot under the band |
| P06-3 | P06 | medium | §1 describes interior wood and rear windows under an exterior picture |
| P07-2 | P07 | medium | §1 is a 16-word stub repeating its heading after the FILL cut |
| B3 | batch | low | assets.json labels the rendering as midjourney |
| P01-6, P01-7, P01-8 | P01 | low | dead paper under headline; "this weekend" is one-weekend-only; tight eyebrow gap |
| P04-2..P04-6 | P04 | low | small Illustration label; 29 pt body; plant in frame; "one too" antecedent; mark on Kippley's easel needs to be in the OK |
| P06-4..P06-7 | P06 | low | title ambiguity; byline unrendered; CTA punctuation differs from P07; 8 pt clay eyebrow |
| P07-4..P07-8 | P07 | low | Middle West ×5; Patina density in §4; byline unrendered; 8 pt eyebrow; chimney clipped |
