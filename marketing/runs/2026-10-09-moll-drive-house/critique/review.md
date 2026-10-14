# Press B5 — review of the rendered pieces (P01, P04, P06, P07)

Reviewed 2026-10-09 against `marketing/canon/voice.md`, `art-direction.md`, `channels.json` and
`claims.md`, as the owner of a Madison studio at the first-hire moment. Rendered files read:
`out/P01/P01.png` (+ caption and alt), `out/P04/P04-preview.png` + `P04.pdf`,
`out/P07/P07-preview.png` + `P07.pdf`, and `compose/P06/index.html` (P06 has no render; see
below). Copy compared against `copy/P0x.final.md`.

Kody's note for this run: there are no photographs of the house, only the builder's rendering
from the Parade listing. Every finding about imagery takes that as the fact it is: the rendering
is the right same-day choice, and the findings say what it costs and what to do about it.

Checked for every piece and clean: no "AI" / "artificial intelligence" / "machine learning" /
"algorithm" / "powered by"; no Pledge language; the held tagline is absent; every number carries
a verified `[Cnn]` in the same sentence (C23, C25, C27, C28 checked against `claims.md`; 1987 is
a year); Midwest places only; the ask in every piece is to studios and none to homeowners; nothing
says or implies the house ran on Patina. Fonts in both PDFs are embedded (Playfair Display Regular
and Italic, Inter Regular); `P04.pdf` MediaBox is 1314×1746 pt (18.25×24.25 in, bleed included),
`P07.pdf` is 612×792 pt (letter).

Severity: **high** = do not post or print as is; **medium** = fix before the Thursday print or the
next post; **low** = fix when the file is next touched.

---

## Cross-cutting (applies to P01, P06, P07)

### X1 · high · Rights to the rendering are claimed in the copy and still owed in the hold note

What I see: `copy/P01.final.md`, `P06.final.md` and `P07.final.md` each say the rendering is
"used with Kippley's written OK". `hold/README.md` says the opposite: "Needs Matt Kippley's written
OK before it is printed or posted." Nothing in the run records the OK.

Fix: before P01 posts or P06/P07 print, record Matt Kippley's written OK (date, channel) in
`docs/marketing/partners/kippley.md` per C25/C28's source doc, or change the three copy notes to
"pending Kippley's written OK" so the board does not read permission that does not exist yet.

### X2 · medium · The rendering is the look art-direction refuses, on three of four pieces

What I see: the J01/J06/J07 file is a glossy 3D exterior render: saturated sky, electric-green
lawn, CGI shrubs. `art-direction.md` §3 lists "the glossy 3D-render look" under Never, and the
concept's art direction asked for real, credited photographs, daylight through real windows.
Same frame on P01, P06 and P07; Leah will hand P06 and P07 together with the identical picture.

Fix (same-day): keep it, captioned as a rendering (it is). Fix (reprint): the first interior
photograph Leah or Kippley supplies replaces it on P06 (the brief wanted the warm wood and rear
windows) and the P01 repost; P07 may keep the front of the house. Until then, crop P06's band
differently from P07's (see P06-4) so the two sheets do not read as one flyer.

### X3 · low · `mj/assets.json` records the rendering as `source: "midjourney"`

What I see: J01, J06 and J07 are marked `midjourney` by ingest. It is neither a Midjourney image
nor a FLUX placeholder; it is a third-party rendering with its own rights line. The board will
show it under the wrong rule (illustration, never a real project) when it is in fact a picture of
the real house.

Fix: whoever next runs ingest records these three as a rights-owned third-party rendering (credit
Kippley) rather than `midjourney`; a note in `mj/picks.md` already says as much.

---

## P01 · social · instagram-4x5 · `out/P01/P01.png`

Render: 1080×1350, image in the top 900 px, headline "Open this weekend in Waunakee" in Playfair
at 62 px on paper, wordmark bottom right. Caption and alt exported to text. Lint clean.

### P01-1 · high · see X1 (rights). Do not post until the OK is on record.

### P01-2 · medium · The words send her into the rooms; the picture stays on the lawn

What I see: headline "Open this weekend", caption "walk this house slowly" and "Every room holds
decisions you can't see from the doorway", alt text and image: the front elevation, no doorway,
no room. The studio owner is promised rooms and shown a driveway render. P01's brief asked for
"the room Leah would send a designer to first, from the doorway".

Fix (today): keep the caption, it is honest, but let the headline match what is shown, e.g.
"Open this weekend in Waunakee" stays and the caption's last line becomes the one that does the
work; or swap the order so "Every room holds decisions you can't see from the doorway" is the
first line after the studio line. Fix (repost / second weekend): the doorway photo the brief asked
for.

### P01-3 · medium · No eyebrow; the bottom third is a headline and 300 px of empty paper

What I see: `copy/P01.final.md` says "the DM Mono eyebrow carrying the place and date line";
`compose/P01/index.html` has `<p class="eyebrow"></p>` empty, because the social frontmatter has
no `eyebrow` field. Art-direction §4 wants "DM Mono eyebrow above" the headline on instagram-4x5.
The card reads as a headline floating above a lot of paper.

Fix: add an eyebrow to the social frontmatter (if the kind's contract allows one) reading
"Waunakee · Madison Fall Parade of Homes"; no digits, so no marker is needed in a stripped line.
If the kind cannot carry an eyebrow, that is a template gap to log, not something to hand-edit
here.

### P01-4 · low · Credit sits on the last line of the caption

What I see: "Rendering: Kippley Custom Carpentry." is the final line, below the fold on
Instagram, and the image itself carries no credit.

Fix: acceptable as is; if the caption is touched, move the credit to directly after the sentence
that names Kippley so it reads in one breath with the builder line.

### P01-5 · low · Crop

What I see: 1692×929 scaled to 900 px tall and centre-cropped to 1080: the left garage bay is
cut mid-door and the right wing is cut; porch, both gables and the chimney are whole; nothing
important sits in the outer 64 px. Fine for the channel.

Fix: none required. If re-composed, nudge the crop right by ~5% so the entry sits nearer centre.

### P01-6 · low · "Open this weekend" is only true if the post goes out Fri Oct 9

What I see: the caption gives both weekends [C27]; the headline commits to this one.

Fix: none if posted today. If it slips past Sunday, the headline becomes "Open next weekend in
Waunakee" (or "Open in Waunakee, two weekends").

Copy read: "If you run a studio and are bringing on your first hire, walk this house slowly" is the
right first line for the reader; "Every room holds decisions you can't see from the doorway" is the
best sentence in the batch. Headline 5 words, caption ~66 words, 3 hashtags, alt plain. Voice clean.

---

## P04 · poster · poster-18x24 · `out/P04/P04-preview.png`, `out/P04/P04.pdf`

Render: 18.25×24.25 in sheet with bleed; J04 (Midjourney oak doors, brass pulls, raking light,
trees in the window) fills the top 16.6 in; band below: headline at 1.15 in Playfair, italic
subhead at 0.42 in mocha, body Inter at 0.24 in, wordmark bottom right. No eyebrow. Lint clean.

### P04-1 · high · The one ask is the smallest type on the sign

What I see: the body, which carries the only ask ("Start at patina.cloud/designers"), is set at
0.24 in (about 17 pt) Inter on an 18×24 easel sign. From six feet (voice.md §9 Poster: "readable
from six feet") the headline reads, the subhead is marginal, the body and the URL do not. A
visitor who wants the page has to walk up to the easel and lean in.

Fix: in the poster template's body style, raise `.body` to at least 0.42 in (about 30 pt) and
set the URL on its own last line in Playfair at ~0.6 in; or shorten the body to two lines at
0.42 in. The body is 29 words; it fits. (A template change is for the compose owner; the copy can
help by ending on the URL as its own sentence, which it already does.)

### P04-2 · high · The image is placed at about 102 ppi for print

What I see: `P04.pdf` embeds J04 at its native 1856×2464 px over a 18.25 in wide, 16.6 in tall
area, about 102 ppi. Art-direction §4 and the J04 job note require 5400×7200 px ("upscale the
pick to 5400×7200 for print"); `mj/picks.md` notes the 2.9× upscale and it was not done. On an
easel the oak grain and the brass edges will print soft.

Fix: upscale the pick (`…9d5f40d0….png`) to 5400×7200 (Midjourney upscale or a local 3×
upscale), drop it into `mj/inbox/J04/` as the pick, re-compose and re-render before Thursday's
print.

### P04-3 · medium · The generated cabinet reads as the house's cabinetry

What I see: a Midjourney image of oak frame-and-panel doors with brass pulls sits directly over
"Interiors by Middle West Studio, for Kippley Custom Carpentry's Fall Parade home", on a sign that
stands inside the house, by a builder whose shop builds cabinetry [C26]. Nothing captions it as
the house, as the copy promises, but the juxtaposition does the captioning: a visitor will take it
for a cabinet in the next room. Art-direction §3: never present a generated image as a real
project or a real maker's piece.

Fix: one small DM Mono line at the foot of the band, "Illustration", left of the wordmark; or
replace J04 with the credited Kippley rendering ("Rendering: Kippley Custom Carpentry") until a
real detail photo exists. The copy's "Image rule" paragraph should say which.

### P04-4 · medium · Five inches of empty paper under the body

What I see: the band is 7.6 in tall; headline, subhead and body occupy the top ~3 in of it and
the wordmark sits alone at the foot. Art-direction §4: "subhead and body in the bottom quarter".
As printed, the words hover mid-band and the sign bottoms out on blank paper.

Fix: resolved by P04-1 if the type grows; otherwise anchor the body to the foot (margin-top:auto
on `.body`) so the ask sits at reading height for someone standing at the easel.

### P04-5 · low · "Pre-launch." as a one-word sentence

What I see: on a sign read mostly by homeowners, "Pre-launch." stands alone like a status chip.
The honesty is right; the form is product-speak.

Fix: "Patina is pre-launch; start at patina.cloud/designers." (still cites C24 in the copy file,
one sentence, 7 words).

### P04-6 · low · J04 pick check

What I see: shaker oak doors, two brass bar pulls whole and unwarped, raking light across the
grain, plaster wall, a divided-light window with trees. No text, no marble, no gloss, no face.
Pulls sit in the lower third of the image and survive the top-half crop. Good pick of the three.

Fix: none.

### P04-7 · low · No eyebrow on the poster

What I see: `<p class="eyebrow"></p>` is empty. A poster has no eyebrow field, and the headline
carries it, so this is by design.

Fix: none; noted so nobody adds one and crowds the band.

Copy read: headline 6 words, subhead 11, body 29. "Designers:" opens the only ask and keeps the
homeowner out of it. "this house is the kind of job we're building Patina for" is honest and in
tense. Voice clean.

---

## P06 · one-pager · one-pager-letter · NO RENDER (`compose/P06/index.html` only)

Ledger: `render … P06 … failed: "one-pager overflows: content is 1063 px on a 1056 px page; cut
copy"`. There is no `out/P06/`. This is the leave-behind Leah hands to designers; it is due at the
printer Thursday.

### P06-1 · high · The piece did not render; it is seven pixels over the page

What I see: compared with the earlier version that did fit (the fit test in this session's
scratchpad, which rendered clean), two lines grew: section two gained "We're building it so"
(now three lines) and the final credit grew into "Kody and Leah, Middle West Studio. Cover: the
builder's rendering, courtesy of Kippley Custom Carpentry." which wraps to two lines. Either line
alone is the seven pixels.

Fix: in `copy/P06.final.md` section 4, second paragraph, replace
"Cover: the builder's rendering, courtesy of Kippley Custom Carpentry." with
"Rendering: Kippley Custom Carpentry." (one line at the page measure; saves ~22 px). Keep
"We're building it so", which the cold read added for honesty. Re-run compose and render for P06
only.

### P06-2 · medium · "Cover:" is the wrong word on a one-sheet

What I see: the credit says "Cover:"; a letter-size leave-behind has an image band, not a cover.
Same wording on P07.

Fix: covered by P06-1 ("Rendering: Kippley Custom Carpentry.").

### P06-3 · high · see X1 (rights). Do not print until the OK is on record.

### P06-4 · medium · Same frame as P07, same crop, in the same hand

What I see: the composition's band is the identical centre crop of the identical rendering used on
P07. Leah hands P06 and P07 together; two sheets with the same picture at the same crop read as
duplicates and neither looks like a page about the inside of a house. The brief for J06 asked for
warm wood and the rear windows.

Fix: for Thursday, crop P06's band on the entry and porch (object-position toward the right third)
so it differs from P07's full-front crop; swap in the first credited interior photo for the
reprint. See X2.

### P06-5 · low · "an honest hour"

What I see: "One live project, the one you most want to hand off, and an honest hour." The hour
is with whom, doing what? The reader has to guess.

Fix: "and an hour with Kody and Leah to walk us through it." (still ≤ 70 words in the section).

### P06-6 · low · Band resolution

What I see: 1692 px across a 7 in band is ~242 ppi, under the 300 ppi print norm and the 2100 px
minimum in J06's job. Acceptable for a desk-printed leave-behind.

Fix: none for Thursday. Do not use `scratchpad/listing/ext.jpg` (5659×3767): it is a stock
living-room photograph from the listing page, not the house, and it is exactly the look the canon
refuses. `scratchpad/listing/rendering.png` (4608×1993) may be a larger copy of the same
rendering; if it is, drop it into `mj/inbox/J06/` (and J01/J07) and re-compose.

Copy read: four sections, each under 70 words; eyebrow renders in DM Mono; title in Playfair;
body 10.5 pt Inter; margins 0.75 in; paper ground, print-safe. "The next house, not this one"
and "so it did not run on Patina" say the honest thing plainly. "No dashboards, no task manager,
no tab bars" is VISION's own negation [C06], fine. Byline first names only. Voice clean.

---

## P07 · one-pager · one-pager-letter · `out/P07/P07-preview.png`, `out/P07/P07.pdf`

Render: letter, 0.75 in margins, Playfair title "The Moll Drive house", image band (rendering,
cropped to 1692×580 in the PDF), four ruled sections, italic CTA "Studios: patina.cloud/designers"
and wordmark in the foot. Fits with about an inch to spare. Lint clean.

### P07-1 · high · see X1 (rights). Do not print until the OK is on record.

### P07-2 · medium · The first section says the same thing twice

What I see: heading "Designed by Middle West Studio. Built by Kippley Custom Carpentry." then body
"Middle West Studio, a residential design studio in Madison, designed the interiors." The reader
gets "designed" three times in two lines, and a two-sentence heading set in Playfair reads as a
caption, not a heading.

Fix: keep the heading (it is the one line a visitor needs) and let the body add only what the
heading lacks: "Middle West Studio is a residential design studio in Madison [C28]." Or keep the
body and shorten the heading to "The rooms".

### P07-3 · medium · The eyebrow the layout promises is not on the page

What I see: `copy/P07.final.md` Layout says "DM Mono eyebrow (Waunakee · Fall Parade)". The
frontmatter has no `eyebrow` field (P06's does), so the rendered sheet opens on the title with no
place line; a visitor picking it up off the counter has to read to section three to learn where
they are.

Fix: add `eyebrow: "Moll Drive · Waunakee · Fall Parade"` to the P07 frontmatter, matching P06.
It adds ~30 px; the page has ~90 px spare above the foot rule.

### P07-4 · medium · Credit line buried mid-section and mis-worded

What I see: "The house" section ends "…and a finished walkout lower level. Cover: the builder's
rendering, courtesy of Kippley Custom Carpentry." The credit interrupts the listing description,
and "Cover" is wrong on a one-sheet (see P06-2).

Fix: make it its own paragraph in the same section (the template allows a second `<p>`):
"Above: the builder's rendering, courtesy of Kippley Custom Carpentry." or the shorter
"Rendering: Kippley Custom Carpentry." Keep it inside the section the template prints in full.

### P07-5 · low · Band crop clips the chimney and both gable peaks

What I see: the 7×2.4 in band takes the vertical centre of the rendering; the chimney top and the
left gable peak are cut by the band's top edge, and the lawn takes the bottom fifth.

Fix: shift the crop up (object-position 50% 30%) so the roofline is whole and less lawn shows;
same adjustment helps P06-4's differentiation if P06 takes a different crop.

### P07-6 · low · "The hands" as a section heading

What I see: a good, voice-true heading for a studio reader; a Parade homeowner may not catch
that it means the carpenters. Body makes it clear by the second line.

Fix: none required. If Leah finds it precious, "The crew" is the plain alternative.

### P07-7 · low · Same frame as P01 and P06

What I see: covered by X2 and P06-4. The front of the house is the brief's allowed fallback for
P07, so this is the right sheet to keep it on.

Fix: none beyond P06-4.

Copy read: four sections, each under 70 words; body 10.5 pt; print-safe; one ask, to studios, at
the foot; no date or hours (C30 stays todo); "This house was designed before Patina was ready; it
is the kind of job Patina is being built for" is the honest line in the right place. "since 1987"
cites C25 in sentence. Voice clean.

---

## Summary by severity

**High (block):**
- X1 — rendering rights claimed in copy, still owed per `hold/README.md` (P01, P06, P07).
- P04-1 — the poster's only ask is ~17 pt on an 18×24 sign; unreadable from six feet.
- P04-2 — poster image at ~102 ppi; the required 5400×7200 upscale was not done.
- P06-1 — P06 did not render (7 px overflow); fix is a one-line credit cut, then re-render.

**Medium (before Thursday's print / next post):**
- X2 — glossy 3D render on three pieces, same frame on all three; swap for interiors at reprint.
- P01-2 — headline/caption promise rooms, image shows the driveway.
- P01-3 — no eyebrow; bottom third is mostly empty paper.
- P04-3 — generated cabinet image reads as the house's cabinetry; label "Illustration" or swap.
- P04-4 — five inches of blank paper under the body.
- P06-2 / P07-4 — "Cover:" is the wrong word; P07's credit is buried mid-section.
- P06-4 — P06 and P07 carry the identical crop; differentiate for the hand-off.
- P07-2 — section one repeats itself.
- P07-3 — promised eyebrow missing from P07's frontmatter.

**Low:** X3, P01-4, P01-5, P01-6, P04-5, P04-6, P04-7, P06-5, P06-6, P07-5, P07-6, P07-7.
