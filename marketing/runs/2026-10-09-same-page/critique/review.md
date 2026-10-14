# Press B5 review: Same page (2026-10-09)

Reviewed as the studio owner at the first-hire moment. Every rendered output under `out/` was opened
at real size (PNGs, both PDFs page by page, the email HTML and its PNG, the pitch markdown, and
thirteen frames pulled from the 30 s video), then compared against `copy/<P>.final.md`,
`canon/voice.md`, `canon/art-direction.md`, `canon/channels.json` and `canon/claims.md`. Every
finding is listed; nothing is filtered. Lint (`critique/lint-P0?.json`) is clean on all nine, so
what follows is what lint cannot see.

Severity: **high** = blocks the piece; **medium** = fix before Kody shares it; **low** = polish.

Voice-rule sweep across all nine renders: no "AI", "artificial intelligence", "machine learning",
"algorithm" or "powered by"; no Pledge language; no held tagline; no coastal place; every number
cites a verified claim in its sentence in the source copy, and compose stripped the markers
cleanly (no stray `[Cnn]` in any render). No piece calls Patina a CRM, portal or platform. No
piece captions an image as a real project, client, studio or maker.

Summary: P05 did not render (high). P08 is at a sixth of print resolution (high). P06's key slide
loses the page it is about (high). Everything else is medium or low.

---

## P01 · social · instagram-4x5 · `out/P01/P01.png`

What I see: 1080×1350. J01 fills the top 900 px (two thirds), paper band below with the Playfair
headline "Same page, before the cabinets go in." in sentence case and a small "Patina" mark at the
foot. Three people, one tablet with a floor plan, wrapped cabinet boxes, bare studs, overcast
light through window openings. Reads well at phone size; the headline is large and in the safe
area. Palette is paper and charcoal; no gradient, no badge.

- **medium · The "Founding 50" eyebrow is missing.** The final copy's visual note (and the
  concept's art direction) calls for a DM Mono eyebrow "Founding 50" above the headline. The
  social template has the slot (`compose/P01/index.html` `.eyebrow`, hidden when empty) and compose
  left it empty, so the only trace of the ask on the image is nothing; the ask lives in the
  caption alone. Fix: fill the eyebrow with "Founding 50" (compose input), re-render.
- **low · Caption runs 91 words before markers; the rule is 40–90.** The judge's note says it
  was trimmed to ninety; it is one over (the sentence "A framed-out kitchen, three people over one
  tablet." is scene description the image already does). Fix: cut that sentence (8 words) and the
  caption lands at 83.
- **low · Alt text does not say the image is an illustration, while P02 and P03's alt does.**
  Fix: prefix the alt with "Illustration." for consistency with the other two feed pieces.
- **low · Paper band is 450 px with the headline in its top 150; the lower 250 px is empty
  except the mark.** Not wrong (generous paper is the house habit) but the headline could sit a
  little lower, or carry the eyebrow above it, so the band does not read as unfinished. Fix: solved
  by the eyebrow fix above.
- **low · Image: the designer's face is in sharp profile and quite large for "faces at a natural
  distance".** Within the rule (nobody looks at the lens; three people, one page), noting only
  because the P06 crop of the same image goes much further (see P06).

Copy checks: headline 7 words (≤ 8). Hashtags 3, specific. Each party's view stays inside C04 /
C05 / C31; no further contractor capability claimed. Pre-launch line present (C24). Ask present
(C23).

---

## P02 · social · linkedin-landscape · `out/P02/P02.png`

What I see: 1200×627. Image left 60 % (720 px), words right on paper. Headline "You hired. Every
call still comes to you." (8 words, at the limit) in Playfair, mark at the foot. The image shows a
large monitor with a kitchen elevation, a laptop, printed plans, a tile stack, a phone face down,
the sample library behind.

- **medium · The crop cuts the principal almost out of the frame.** The pick note for J02-3 says
  "keep the left designer in the frame"; the 60 % crop leaves only the right half of her face and
  her hands at the left edge, so "your first hire sits beside you" (caption) and "two designers at
  one monitor" (the reason J02-3 was picked over J02-1/2) does not read. What reads is one
  designer at a monitor and a sliver of someone else. Fix: shift the image's object-position left
  (or crop the source so both figures are in the left 720 px) and re-render; if the template's
  crop is fixed at centre, pick the crop in the source file instead.
- **low · Feed centre-crop risk.** Art direction says to assume LinkedIn crops to the centre; the
  headline sits in the right 40 % (x ≈ 770–1130), so a square or 4:5 centre crop would show the
  monitor and half the headline. This is the template's layout, not this piece's error; noting it
  so Kody looks at the LinkedIn preview before posting.
- **low · The monitor shows a CAD-style interface with toolbar rows that look like text.** Not
  legible at feed size, so it passes "screens show plans with no legible words"; flagging in case
  it is sharper on a desktop feed.

Copy checks: caption exactly 90 words before markers (limit 90). Third-party quote keeps its
attribution (Interior Designers Hub, C12). Hashtags 3. Pre-launch (C24) and ask (C23) present.
"no dashboards, task manager or tab bars" is a slightly compressed C06; acceptable.

---

## P03 · pin · pinterest-2x3 · `out/P03/P03.png`

What I see: 1000×1500. Tall image in the top ~1115 px, paper band at the foot carrying the
headline "The scheme goes with the job" (6 words, at the limit) and the mark. Hands in a cream
knit hold an open fabric book with a tile, a speckled stone and a white oak sample; a printed
plan, a tablet and a crystal on the table; sample shelves behind.

- **low · "Quartz chip" rendered as a quartz crystal.** The caption and alt say "a quartz chip"
  (a countertop sample); the image shows a raw mineral cluster on the plan. A designer will notice.
  Fix: change caption and alt to "a stone sample" or drop the chip from the list ("Oatmeal linen
  and a white oak door sample laid over the kitchen plan").
- **low · Caption says the materials are "laid over the kitchen plan"; the image shows the book
  held up above it.** Fix: "held over the kitchen plan" (one word) and the alt's "lay" → "hold".
- **low · The shelves behind read as a bookstore more than a sample library.** The pick note
  accepted this. The rule says one material close-up beats a whole room, and the close-up is
  there; noting only.
- **low · The paper band is 385 px with the headline in its top quarter and the rest empty.**
  Same habit as P01; acceptable for a pin, where the band is the save-able caption area.

Copy checks: 49 words (≤ 50). One sensory lead. A reason to save ("Save it for the handoff").
Studio reader only; no "shop". Hashtags 4 (limit). C04 / C05 / C23 cited.

---

## P04 · email · `out/P04/P04.html`, `out/P04/P04.png`

What I see: 600 px shell on light-gray paper with a hairline, "Patina" wordmark top-left,
Playfair heading "When every call on every job comes to you", Inter 16 px body, the one image
(J04: phone dark, drawing set open, tape measure, painted door sample, stone chip, snow outside)
full width under the opening paragraph, then the letter, the sign-off "Leah, Middle West Studio",
footer with address and unsubscribe placeholders. Reads with images off (alt text in place).
Dark-mode styles present.

- **low · Body is 222 words; the rule is 120–220.** The count includes the sign-off and the
  reply line. Fix: trim two words, e.g. "The samples are pulled and the drawings are open on the
  monitor, and still the client wants" → "The samples are pulled, the drawings are open, and still
  the client wants".
- **low · "Patina" appears three times (wordmark head, wordmark foot, legal footer).** The
  template's house frame, not the copy's fault; the voice rule's "mark once" is written for
  social/video. Noting so the template owner can decide whether the head wordmark stays on a
  letter that is meant to read as from Leah.
- **low · The opening sentence hedges: "a new hire may still need you to answer every
  question."** "May" softens the switchboard moment the whole batch is built on. Fix: "When the
  work doubles, a new hire still needs you to answer every question." (Also saves a word for the
  count above.)
- **low · "Kody builds it at Middle West Studio in Madison [C01]."** C01 verifies the venture;
  "Kody builds it" is C02 (verified, uncited). No number, so lint does not care. Fix: add [C02] in
  the source so the claim trail is complete.
- **low · `{{business_address}}`, `{{unsub_url}}`, `{{prefs_url}}` are unfilled placeholders.**
  By design (the Press never sends). Flagging so nobody forwards the HTML as-is.

Copy checks: subject 41 characters, plain. Preheader completes the thought. Exactly one ask.
Signed by a person. "Reply here; it comes straight to me." present. No prices, no time saved, no
Pledge. Each party's view inside C04 / C05 / C31 / C32 / C06. Pre-launch line honest (C24).

---

## P05 · one-pager · one-pager-letter · `out/P05/` (EMPTY)

What I see: nothing. `out/P05/` is empty. `ledger.json` records the render as **failed**:
"one-pager overflows: content is 1129 px on a 1056 px page; cut copy". The template refuses to
shrink or clip (by design), so the piece has no output for the board.

- **high · The one-pager did not render; 73 px (about 0.76 in, three to four body lines) too
  much copy for the letter page.** Fix, concrete and sufficient: (1) delete the signature line
  "Kody and Leah, Middle West Studio" from the end of the "What it asks of you" section body; the
  `byline` field already carries it and the section currently signs twice (saves one line plus a
  paragraph gap, ~30 px); (2) shorten the title to one line, "One page for the studio, a seat for
  the job." (the current two-line title at 30 pt costs ~45 px per line; this saves one line); that
  is ~75 px and clears the page. If Kody prefers the two-line title, instead cut "It is not a
  place you go." from "What it is not" and "on Tuesday" from the first section (two body lines).
  Re-render and confirm `out/P05/P05.pdf` and the preview appear.
- **low · Section word counts are fine (55 / 60 / 50 / 30, limit 70), so the overflow is the
  template's fixed 2.4 in image band plus the long title, not a long-copy problem.** Worth telling
  the template owner that four sections at 50–60 words plus a two-line title will not fit; the
  brief's own "three or four sections, ≤ 70 words" invites copy that overflows.
- **low · The markdown body carries a caption "*Illustration, not a client project.*" under the
  image that the template has no slot for; `imageLabel: "Illustration"` is what renders.** Once
  rendered, confirm the DM Mono "Illustration" label lands on the image band as it does on P08.

Copy checks (on the source, since there is no render): eyebrow "Founding 50 · Madison, WI" cites
C23. First section names the moment (C03). "Who is on the job" stays inside C04 / C05 / C31 / C32.
"What it is not" carries C06 / C01 / C08 / C24. Last section answers "what does it ask of me?"
with one CTA (C23). No feature grid, no comparison table, no prices.

---

## P06 · deck · deck-16x9 · `out/P06/P06.pdf` (10 pages), `out/P06/P06.png` (cover)

What I see: cover (eyebrow "Founding 50 · Madison, WI", "Same page", italic sub-line, footer
"Kody and Leah · Middle West Studio · October 2026"); eight content slides numbered 02–09; a
closing slide "Bring one live project." with the mark. Image slides (02, 05, 06) use a half-height
image band on top with the headline on paper beneath, DM Mono "ILLUSTRATION" in the footer. Quote
slides carry DM Mono source footers. Palette, type and footers follow art direction; no progress
bars, no lone numbers.

- **high · Slide 06 ("Your client reads the page; the contractor and the trades each hold a
  seat on the job") crops J01 to three faces and loses the tablet.** The 16:9 band takes the
  middle of the 4:5 image, so the page the slide is about is below the crop and the three faces
  fill the band at near-portrait scale, which is the art direction's "no portrait-style hero face"
  in a deck meant to be shown across a table. The speaker note walks "the three people in the
  picture… one floor plan on one tablet"; the tablet is not on the slide. Fix: move the band's
  crop down (object-position toward the lower third of J01) so heads sit at the band's top edge
  and the tablet is in frame, or use J10-4 (same scene, more room above the heads) for this slide.
- **medium · Slide 02 crops J05 to ceiling, soffit, the sample rail and the top of the monitor;
  the two designers at the table are cut off, with the crown of one head poking into the band's
  bottom edge.** The speaker note says this is "her studio on a normal day, two designers laying
  out fabric, tile and a door sample over printed plans"; none of that is visible, and the hanging
  fabric samples read as a clothes rail. Fix: object-position toward the lower half of J05-1 so
  the table, plans and both designers are in the band; or pick J05-3 (the note says it has the
  richer scheme layout) now that the headline no longer sits over the image.
- **medium · Slide 05 (J07) shows a nearly finished kitchen, not one mid-install.** Upper
  cabinets hung, hood on, walls painted, no island, no tablet; the crop removed the OSB subfloor,
  taped elevation and the island the pick note valued, and what remains contradicts the slide's
  "from brief to install" span and the brief's "the island waiting for its top". Fix:
  object-position toward the lower half of J07-4 so the island, tablet and taped sheet are in
  frame; if the band still reads finished, drop the image on this slide (art direction: "full
  bleed or not at all").
- **medium · Image slides are a half band over paper, not full bleed.** Art direction §4:
  "Images full bleed or not at all"; the speaker notes assume full bleed with the headline in the
  open wall space. This is the deck template's layout, and it does keep headlines off the image
  (a defensible trade), but it is what produced all three bad crops above. Flagging for the
  template owner; the per-slide fixes still apply either way.
- **low · Ten pages for a deck briefed at six to eight slides.** Eight content slides plus a
  cover and a closing card. Within the voice rule (ten or fewer for outreach). If Kody wants it
  tighter, merge slides 03 and 04 (the two quote slides) into one.
- **low · The closing slide's eyebrow reads "— NEXT".** An odd label on a close-line meant to
  hang in the air; the template's default. Fix: eyebrow "Founding 50" or none.
- **low · Cover footer carries "OCTOBER 2026" in DM Mono.** A year, so no marker needed; fine.
  Noting that a dated cover ages the deck if it is reused in winter.

Copy checks: every headline stands alone as a sentence. Body ≤ 40 words per slide. Quotes keep
attribution (C11, C09, C10), and the C09 em dash matches the ledger. Slide 06 keeps C05 and C31
separate. C06, C01, C08, C24, C23 all in their sentences. No CRM/portal/platform. No prices,
dates or time saved.

---

## P07 · pr-pitch · email · `out/P07/pitch.md`

What I see: a markdown draft headed "Subject: The page behind the kitchen you photographed",
marked **DRAFT. NOT SENT.**, bracketed placeholders for the editor's name, the story, the studio,
the builder and the detail, then the angle, the status line and one ask, signed "Kody, with
Leah / Middle West Studio".

- **medium · The two "specific, checkable observation" sentences are entirely placeholders, so
  the pitch cannot be judged against the outreach rule until they are filled, and it must not
  leave the run folder before they are.** This is what the cold-read resolution asked for (no
  invented Wauwatosa story), so it is the right state, not a defect of the draft; the finding is a
  gate. Fix: before any send, fill the four brackets from a real published story, verify the
  credits, and re-run lint on the filled text (a story title may introduce a number).
- **low · "The last frame held on [the detail the camera stayed on]" assumes a video or
  photo-essay format.** If the editor's piece was a print feature, "last frame" misreads. Fix:
  "The closing photograph held on […]" or leave for the sender to adapt once the story is chosen.
- **low · "an hour at Leah's studio" versus the plan's "a visit… or a twenty-minute call".**
  One ask (good) and an hour mid-job is a real ask of an editor; noting that twenty minutes was the
  plan's lighter option if the first reply is cool.

Copy checks: body 140 words (≤ 150). Subject 47 characters. One ask. No attachments promised, no
"exclusive", no flattery. C04, C05, C31, C01, C08, C24 in their sentences. Midwest only. Leah's
studio is the only studio named as using Patina, which keeps the "never claim another studio" rule.

---

## P08 · poster · poster-18x24 · `out/P08/P08.pdf`, `out/P08/P08-preview.png`

What I see: PDF page 1314×1746 pt = 18.25×24.25 in (18×24 plus 0.125 in bleed on every side,
correct). Preview 1752×2328. J06 in the top ~59 %: a designer, a contractor in a work jacket and a
homeowner in a quilted vest over one drawing set on a plywood island, the contractor pointing at
the plan, a taped elevation behind, bare trees through the windows. DM Mono "ILLUSTRATION" chip at
the image's lower-left edge. Paper band: Playfair "Everyone on the same page." (5 words), italic
subhead, Inter body, "Patina" at the foot. The headline is ~1 in tall and reads from six feet;
subhead and body are in the bottom quarter as the rule asks.

- **high · The image embedded in the print PDF is 928×1232 px, the raw Midjourney frame.** At
  18.25 in wide that is ~51 ppi; art direction §4 requires 5400×7200 (or an upscale to it) for a
  300 dpi poster. Printed, the three faces and the plan will be visibly soft and the taped
  elevation will smear. Fix: upscale J06-1 (Midjourney upscale, then a 4× local upscale, or a
  single 6× upscale) to ≥ 5400×7200, drop it in `mj/inbox/J06/` as the pick, re-run compose and
  render, and confirm `/Width` in the PDF is ≥ 5400.
- **low · Subhead is set in Playfair italic; the copy's layout note says Inter.** Art direction
  does not mandate Inter for a poster subhead and the italic looks right under the headline, so
  this is the copy note and the template disagreeing, not a fault. Fix: reconcile the note.
- **low · Generated-image artifacts to accept or not: the contractor's hair reads wet and
  oddly lit; the pointing hand's cuff and wrist are muddled; the island has a plywood top, which
  reads fine for "no top yet" but a designer may read it as a finished butcher-block.** None rise
  to the "reject" bar (no warped faces, no text). Noting for Kody's eye.
- **low · The paper band is the bottom 41 %, not the "bottom quarter".** The headline needs the
  room, and the body does sit in the bottom quarter; the rule is met in spirit.

Copy checks: headline ≤ 6 words, subhead 13 (≤ 14), body 35 (= limit). C04 / C05 / C31 / C01 /
C23 each in sentence. No QR. The mark once. Image labelled as illustration on the print.

---

## P09 · video · video-9x16 · `out/P09/P09.mp4`, `compose/P09/index.html`

What I see: 1080×1920, 30.000 s, H.264, **no audio stream**. Opens on the sample library (J11)
with no title card; the on-screen line fades in at 1.6 s. 0–8 s J11 push-in; 8–16 s J12 tilt
from monitor to plans, phone face-down at the edge; 16–24 s J13 lateral slide, the group looks up
at the wall; 24–30 s a paper card over the held J13 frame: eyebrow "FOUNDING 50", "Bring one live
project.", "patina.cloud/designers", "The app and marketplace are pre-launch.", "Patina". On-screen
text is Inter on a paper box at the top of the middle third, ≤ 7 words each. The composition
comments say clips were slowed from 5.2 s to 8 s with motion interpolation.

- **medium · The render is silent: there is no voice-over, no room tone, nothing.** The copy's
  VO carries the claims (C04, C05, C31, C23) and the switchboard moment; the on-screen lines alone
  say "Every call came to your phone." / "One page per client." / "One place for the agreed
  direction." The silent cut is fine for the board but must not be treated as the finished piece.
  Fix: record the eight VO lines per the script (one breath each, a beat after "your phone" and
  "the agreed direction"), lay them under the matching scenes, and re-render; or, if the piece is
  meant to run muted in feed, burn the VO as captions so the claims are carried.
- **medium · Scene 2 keeps the tail the pick note said to trim.** J12-2's last ~0.7 s has the
  sheet flipping toward the lens with a hand that is not attached to the figure; because the whole
  clip was slowed to fill 8 s, that tail is in the render at ~15.2–16 s (frame at 15.9 s: the sheet
  lifted toward the lens, hands on the keyboard and a second pair at the sheet's left edge). Fix:
  trim J12 to its first 4.5 s before slowing (or slow only that span to 8 s) so the clip settles on
  the plans as the note intends.
- **medium · Scene 3's on-screen box covers the payoff.** At 19.8–24 s the paper box
  ("One place for the agreed direction.") sits at y 660–~820 and overlaps the contractor's raised
  hand and the crown of his head as the group looks up at the wall; the "look up" is the scene's
  point. Fix: for this scene only, place the box lower in the middle third (top ≈ 1000 px, under
  the three faces and above the tablet) or at the top of the frame over the plain framing.
- **low · The raised arm in scene 3 appears to change owner.** At 20 s a sleeved arm points up
  from the left (the contractor per the clip prompt); at 23.5 s the designer in the grey vest is
  the one pointing, index finger up. Generated-video drift; it does not warp faces or materials.
  Fix: watch 19–24 s at speed; if the hand-off is visible in motion, cut the scene at 22 s and
  hold the frame to 24 s (the note already allows a held frame).
- **low · The 1.54× slow-down with motion interpolation.** The stills I pulled show no
  ghosting, but interpolation shows at playback. Fix: watch each clip at speed once; if it stutters
  or smears, use the clips at native length with a 1.5 s hold at the end of each scene instead.
- **low · Scene 1's shelves read as a bookstore for the first two seconds.** The pick note
  accepted this. The laptop in the foreground and the sample blocks on the right shelves make it a
  sample library by 3 s. Noting only.
- **low · The phone is in frame at the scene-2 payoff.** The resolution asked that the phone be
  kept out of the payoff; it sits untouched at the lower-right edge, which the compose note allows
  ("let it sit untouched at the edge"). Fine.

Copy checks: three scenes ≤ 10 s each plus a card, 30 s total (= channel max). Opens on the
work, not a logo. On-screen ≤ 7 words per scene (the end card's "onscreen" field is 9 words on
one line in the source, but the card breaks it into separate rows as the note says). The mark
once, at the end, on paper. No music. Claim markers stripped. Pre-launch line on the card (C24).

---

## Cross-piece notes

- **medium · Three of the nine renders mis-crop their picked image (P02, P06 slides 02/05/06),
  all for the same reason: the template's fixed band takes the centre of a frame the pick notes
  chose for a different third.** Each fix above is a per-slide object-position; the durable fix is
  a per-piece crop focus in `plan.json` or the compose input so the pick note's reasoning
  survives render.
- **low · The "ILLUSTRATION" label lands on P06's image slides and the P08 poster but not on
  P01/P02/P03.** The social and pin templates do not carry it (alt text does, where written).
  Consistent with art direction, which asks that generated images never be *captioned* as real
  rather than that they always be labelled; noting so Kody can decide on a house rule.
- **low · "Founding 50" is the only two-digit number in the batch and every instance cites
  C23.** Clean.
- Nothing in any render names a real neighbourhood, a real client, a real maker or a real studio
  other than Middle West. No coastal cue, no sepia, no antique workshop, no studio without a
  computer; the imagery matches the 2026-10-09 revision of art direction §3.
