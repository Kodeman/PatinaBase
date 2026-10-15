# Press B5 review — 2026-10-08-studio-door (second pass, real images)

Reviewed as the owner of a small Madison studio in the month she hires her first designer. Every
rendered output under `out/` from the 2026-10-09 render was opened at real size (PNGs, the deck PDF
page by page, the poster PDF and preview, the email HTML and PNG, the pitch markdown, eleven frames
pulled from the video) and compared with `copy/P0n.final.md`, `canon/voice.md`,
`canon/art-direction.md`, `canon/channels.json` and `canon/claims.md`. This pass supersedes the
2026-10-08 review, which was written against IMAGE PENDING placeholders.

## State of the run (read first)

- **Every image is now Midjourney.** `mj/assets.json` marks J01–J11 `midjourney`; `mj/picks.json`
  picks one file per job; no FLUX placeholder is in use anywhere. **J12 (the dining-room clip)
  landed 2026-10-09 11:00** (`mj/inbox/J12/J12-1.mp4`, `midjourney`) and is in the P09 cut; the
  J09 still stand-in is out (see P09, re-reviewed 11:08).
- **P05 did not render.** `ledger.json` 2026-10-09T14:13:57: `one-pager overflows: content is 1180 px
  on a 1056 px page; cut copy`. There is no `out/P05/`. The one-pager is reviewed from
  `compose/P05/index.html` and the copy only.
- **P09 rendered** (FFmpeg is on PATH now): `out/P09/P09.mp4`, 1080×1920, 30.000 s, H.264, 30 fps,
  re-rendered 2026-10-09 11:08 with the J12 clip. It still has **no audio stream at all**.
- Claim markers are stripped from every text output (`grep -I` over `out/` finds none). No banned
  word appears in any rendered text (the only hits are inside base64 image data). The only
  "dashboard" is the sanctioned "no dashboards" line (C06). All quotes keep attribution.
- Landed since the first pass: social/pin captions and alt now reach `out/` as `.caption.txt` and
  `.alt.txt`; the email footer tagline is gone (now "Middle West Studio · Madison, Wisconsin"); the
  poster PDF has its bleed (MediaBox 1314×1746 pt = 18.25×24.25 in); the deck images are no longer a
  side panel; P05 is single-column with the frontmatter eyebrow; the concept eyebrow is off the
  social, pin and poster pieces.
- **Lost since the first pass:** `compose/P06/index.html` was regenerated at 09:13 on 10-09, which
  wiped the B6 hand edits that lived only in that file. The rendered deck again numbers its content
  slides 02–09 (speaker notes say 1–8) and the closing eyebrow again reads "NEXT". The copy-level
  fix ("built inside a studio") survived because it lives in `copy/P06.final.md`.
- `board.html` is stale: its P05 card still embeds the placeholder-era preview and the first
  review's text. Rebuild the board after this pass.

Severity: **high** = fails the piece or blocks it from the board; **medium** = fix before Kody
shares it; **low** = polish.

---

## P01 — social, instagram-4x5 (`out/P01/P01.png`, 1080×1350)

**What I see.** J01-1 owns the top 900 px: a long pale-oak work table in a dim studio, a
handwritten page in the foreground, walnut blocks and offcuts at left, a jar of pencils, a dark
drafting board under a pair of hands at right, a cup of coffee, bare misty trees through a big
window. The band below is off-white paper with the Playfair headline "The morning the new hire
doesn't ask." at x = 72 (clear of the 64 px margin), the wordmark small at the foot. No eyebrow.
Caption (83 words, three paragraphs), three hashtags and alt text are in `P01.caption.txt` /
`P01.alt.txt`, markers stripped. Palette and type match art-direction §1–2. No face in frame: the
figure is cropped to a sleeve and two hands.

| # | Severity | Finding | Fix |
|---|---|---|---|
| 1 | low | The source is 960×1200, scaled 1.125× to fill 1080 px. It holds up on a phone, but the page's handwriting and the grain on the walnut are a touch soft against the crisp Playfair. | Upscale J01-1 once in Midjourney (Upscale Subtle) before compose; the same file feeds P05 and P06 slide 4. |
| 2 | low | Alt says "hands opening a drawing set". In the picture the hands rest on a drafting board and a ruler; the drawing set is closed. Alt is meant to describe the image plainly. | "A pair of hands resting on a drafting board beside a single handwritten page on a white oak work table, walnut offcuts and a cup of coffee, in soft window light." |
| 3 | low | The paper band is 450 px tall and the headline uses the top 140 px of it; the 250 px of empty paper above the wordmark reads a little unfinished at feed size. Quiet is the brand, so this is a judgment call. | Either set the headline at ~72 px (from ~64) or move the wordmark up to sit two lines under the headline. Decide once for P01 and P03 together. |
| 4 | low | The caption's second paragraph is the product line and the third is the ask; the first-hire moment and "She opens the client's page" are strong, but "Your client sees the same page: one agreed direction." is the fourth idea in 83 words. Voice §6.5. | Optional: cut "Your client sees the same page: one agreed direction." here (it is P03's and P06 slide 5's line) and let the handoff carry the post. |

Voice: passes. The reader is the studio owner; the homeowner is "your client". Midwest: Shorewood
Hills. Pre-launch stated. No numbers without markers in the copy. Image is an illustration and is
never captioned as a real studio.

---

## P02 — social, linkedin-landscape (`out/P02/P02.png`, 1200×627)

**What I see.** J02-1 on the left 720 px (60 %): a tall-windowed loft with cracked plaster, a dark
panel, a long table with drawings and walnut boards in the foreground, one figure walking away
(motion-blurred, no readable face) and one seated at the near table with head bowed. Paper on the
right with the Playfair headline "The handoff without the re-telling" and the wordmark at the foot.
Caption (71 words, three paragraphs with breaks), three place hashtags and alt text written to
`out/`. The quote keeps "(Interior Designers Hub)". Both figures sit in the centre band, so the
feed's centre crop keeps them.

| # | Severity | Finding | Fix |
|---|---|---|---|
| 1 | low | The seated hire reads as a man (short dark hair, broad shoulders); the caption says "one living page per client that **she** can read without you". Nobody will object, but the picture and the line disagree. | Either neutralise the caption ("that your new hire can read without you") or, at the next J02 roll, ask for the hire's hair tied back and keep the no-face framing. Apply the same decision to P09 #5. |
| 2 | low | The room reads as a painter's loft or a woodshop (bare lath, a scorched panel, stacked lumber in the uncropped source) more than a design studio in the Third Ward. The crop hides the lumber; what remains is fine, but it is the least "studio" image in the batch. | Acceptable as is. If J02 is re-rolled, add "a pinned sample board on the wall" and `--no lumber, workshop`. |
| 3 | low | The headline hyphen "re-telling" was chosen for batch consistency; set in Playfair at 44 px the hyphen breaks the word's rhythm. | Keep for consistency, or drop the hyphen batch-wide ("retelling", "retell") in one pass: P02 headline, P04 paragraph 1, P07 paragraph 2. |

Voice: passes. Quote attributed [C12]. "Built for the year you hire and the work doubles" carries
[C03]. Pre-launch stated. Midwest: Bay View. Alt opens with "Illustration." as it should.

---

## P03 — pin, pinterest-2x3 (`out/P03/P03.png`, 1000×1500)

**What I see.** J03-4 owns the top 1120 px: two quartersawn white oak blocks on crumpled unbleached
linen, a page of pencil notes under them with a frayed burlap scrap at its corner, warm diffuse
light. A large weathered stump or bark slab fills the top-right quarter. The paper band at the foot
carries "The brief, the sample, the yes." in Playfair and the wordmark. Caption 47 words, three
hashtags, alt text in `out/`. Headline never sits over the photo. Palette is the warmest in the
batch and matches the clay/paper tokens closely.

| # | Severity | Finding | Fix |
|---|---|---|---|
| 1 | medium | The stump at top right is a stray prop: it owns roughly a quarter of the image, reads as firewood or driftwood, and pulls the eye away from the oak sample and the page (the picks note flagged it). A pin lives on one clean close-up. The crop cannot remove it: the source is 896×1344 scaled to 1000×1500 and only the vertical 380 px is cropped. | Re-roll J03 with the same prompt plus `--no stump, log, bark, driftwood, firewood`; or use Midjourney's vary-region on J03-4 to replace the top-right with linen and table. Until then, set `object-position: bottom` on the pin image so the top 380 px (most of the stump) is what gets cropped and more of the page shows. |
| 2 | low | Alt says "a fabric tag pinned at its corner"; the picture has a frayed burlap scrap lying on the page, nothing pinned. | "…a page of pencil notes with a frayed burlap swatch at its corner, in soft window light." |
| 3 | low | The caption's lead "Unbleached linen and quartersawn white oak on a page of pencil notes." names exactly what is in the picture: good. "Save it for the morning your first hire starts." is the reason to save, also good. Nothing to fix; noting that this is the strongest copy-to-image match in the batch. | None. |
| 4 | low | Same empty-paper note as P01 #3: 380 px band, headline at the top of it, wordmark far below. | Decide with P01 #3. |
| 5 | low | Pinterest is a broadcast channel (plan `contentTest.reason` flags it against VISION's 1:1-through-Leah's-network acquisition). Not a defect of the piece; the board card should carry the note. | Note on the card: "broadcast channel; in this round to show the Press output." |

Voice: passes. Studio reader only; "Your client sees it too" keeps the homeowner as the studio's
client. Hashtags specific. Ask present [C23].

---

## P04 — email (`out/P04/P04.html`, `out/P04/P04.png` 600×1277)

**What I see.** 600 px paper shell, Playfair wordmark in the header, Playfair heading "When your
first hire asks about every house" (subject, 43 chars), Inter 16 px body, the J04-3 image full width
under the first paragraph (a bolt of linen, a roll of tape, folded drawings on a deep sill, low sun
through wavy old glass), five more short paragraphs, "Reply here; it comes straight to me.", signed
"Leah, Middle West Studio". Footer: wordmark + "Middle West Studio · Madison, Wisconsin"; below the
shell, `Patina · {{business_address}}` and `Unsubscribe · Manage preferences` as literal merge tags.
Body 188 words (120–220). Preheader present as hidden text. Dark-mode rules present. Reads fine
with images off.

| # | Severity | Finding | Fix |
|---|---|---|---|
| 1 | medium | `{{business_address}}`, `{{unsub_url}}` and `{{prefs_url}}` render literally. Intentional until a real send, but the board shows them, and a marketing email cannot go without a postal address. | Fill from the sender config at send time; until then the board card should say "footer merge tags unfilled". (Template/send-time, not copy.) |
| 2 | low | Alt says "A tape measure, a fabric ring and a folded drawing". The picture has a bolt of linen, a roll of tape and folded drawings; no fabric ring, and the tape is a roll not a measure. Alt should describe what is there. | "A bolt of unbleached linen, a roll of tape and folded drawings on a deep painted window sill, low morning sun through old glass." |
| 3 | low | The image is dark: the left two-thirds are near black and the subject sits in a thin band of light. Under a paragraph of warm copy on a phone in daylight it reads as a dark block before it reads as a sill. It is the right mood, just heavy for a letter. | Prefer a brighter J04 candidate if Kody re-rolls (J04-1 was cold, J04-4 gloomy per picks); or lift exposure half a stop on J04-3 before compose. |
| 4 | low | The first sentence is the general claim ("The year a studio brings on its first designer is the year its work doubles.") and the letter's own moment comes second. Voice §9: write a letter. Leah's moment is the stronger opener. | Swap the first two sentences: "When a new designer asks why the Shorewood Hills client chose the walnut, the answer should not have to come from my memory… The year a studio brings on its first designer is the year its work doubles." |
| 5 | low | "What I can offer today is a seat at the Founding 50 table." then "apply at patina.cloud/designers and bring one live project with you; Kody and I read every application." is one ask said in two sentences; fine, but "table" and "bring … with you" stack two metaphors. | "What I can offer today is a seat in the Founding 50. If you are hiring this season, apply at patina.cloud/designers and bring one live project; Kody and I read every application." |

Voice: passes the letter test (one ask, signed by a person, the reply line verbatim). Place: Shorewood
Hills, Madison. [C01] [C03] [C04] [C05] [C06] [C23] [C24] all verified. No Pledge, no prices, no
time saved, no tagline.

---

## P05 — one-pager, one-pager-letter (NO RENDER; `compose/P05/index.html`)

**What I see.** Nothing in `out/P05/`. The compose is correct in shape now: letter page, 0.75 in
margins, eyebrow "Founding 50 · Madison, WI" from the frontmatter, Playfair title on two lines, a
2.4 in image band (J01-1), four sections in a single column (heading above body), the CTA in
Playfair italic at the foot beside the wordmark. The template refuses to shrink anything
(`.page > * { flex-shrink: 0 }`) and render fails the piece instead of clipping it. Sections are
58/69/52/48 words; the fourth carries "Kody and Leah, Middle West Studio" as a second paragraph
because the template has no byline slot.

| # | Severity | Finding | Fix |
|---|---|---|---|
| 1 | high | **The piece does not exist.** Content is 1180 px on a 1056 px page (about 1.3 in, roughly six body lines plus a section's padding). Nothing can go on the board or a table until it renders. | Copy cuts (this agent's scope), about 130 px: (a) drop the "Kody and Leah, Middle West Studio" paragraph from section 4 (the frontmatter `byline` already holds it; ask the main session to render `byline` in the `.foot` next to the wordmark); (b) cut section 2 to ≈ 44 words: "One living page per client, from brief to install [C04]. The quote, the revision and the client's yes on one page, so nobody asks twice. Your client sees the same page: one agreed direction [C05]. No dashboards, no task manager, no tab bars [C06]." (the "first hire opens it at eight… you go back to the drawings" beat is already section 1's and P01's); (c) cut section 1 to ≈ 42 words by ending at "…and its workload doubles [C03]."; (d) cut section 3's last sentence ("The Founding 50 shapes the page per client with us while the rest is built [C23].") since section 4 and the CTA carry the Founding 50. If that still overflows, the template's `.media` goes from 2.4 in to 2.0 in (main session). Re-render and confirm `out/P05/P05.pdf` exists before the board. |
| 2 | medium | Even once it fits, section 2 at 69 words plus the CTA plus section 4 means the page says "one page" five times and "the drawings" twice. On a table at an event the reader skims; the repetition reads as padding. | The cuts in #1 remove three of the five. |
| 3 | low | The title "The morning your first hire doesn't need to ask" wraps to two lines at 30 pt inside the 6 in max-width and is the batch's longest headline (9 words). P01's "The morning the new hire doesn't ask." is the same idea in 7. | Use P01's line, or "The morning your first hire doesn't ask", which may still wrap but saves a word per line. |
| 4 | low | "Kody and Leah read every application." in section 4 is the C23 fact without the marker (lint passes because there is no digit). Harmless, but every other instance in the batch carries [C23]. | Append [C23] so the ledger stays complete. |

Voice: passes in the copy. Section 1 names the moment, section 4 answers "what does it ask of
me?", one CTA, no feature grid, no comparison. Midwest: Shorewood Hills, Madison, Milwaukee.
"so nobody asks twice" is the canon's own example sentence.

---

## P06 — deck, deck-16x9 (`out/P06/P06.pdf` 10 pages, `P06.html`, `P06.png` cover)

**What I see.** Ten pages at 1920×1080. Cover: eyebrow "— THE PAGE BEHIND THE ROOMS", Playfair
"The handoff morning", italic sub-line "One page per client your first hire can read.", DM Mono
footer "KODY AND LEAH, MIDDLE WEST STUDIO / OCTOBER 2026". Eight content slides, headline top-left
in Playfair 64 px, Inter 26 px body, DM Mono number eyebrow and footer. Three slides carry images
(J05-3 on 02, J01-1 on 04, J06-2 on 09) as a full-width band across the top ≈ 45 % of the slide with
the headline and body on a paper band below. Quote slide (03) carries both sources in the footer.
Slide 09 footer "PATINA.CLOUD/DESIGNERS". Closing slide: eyebrow "— NEXT", italic "Bring one live
project.", wordmark. Body ≤ 40 words on every slide (38/29/39/29/22/36/23/29). No progress bars, no
lone numbers, no prices. All quotes attributed.

| # | Severity | Finding | Fix |
|---|---|---|---|
| 1 | medium | **The B6 hand edits were overwritten.** `compose/P06/index.html` was regenerated at 09:13 on 10-09 from the copy, so the render again numbers content slides 02–09 while the speaker notes in `copy/P06.final.md` say "Slide 1 … Slide 8", and the closing eyebrow is back to "NEXT" (reads like a template leftover in a first sit-down). Anything fixed only in the compose HTML will be lost on every re-compose. | Either carry the fixes into the deck template / `compose.mjs` (main session: number content slides from 01, closing eyebrow "The ask"), or renumber the speaker notes 2–9 in `copy/P06.final.md` so copy and render agree without touching the tool. Re-apply "— The ask" after the next compose if the template is not changed. |
| 2 | medium | The three image slides show the picture as a strip. The paper band holding headline + body + footer takes ≈ 55 % of the slide, so the image is the top 45 %, centre-cropped. On slide 02 that crops J05 to a sample board, a lamp and a window: the long work table, the drawing set and the chair under the drop cloth that the prompt asked for are all below the crop. Art-direction §4: full bleed or not at all; this is neither. | Shrink the paper band: body on one or two lines (slide 02's body is 38 words, cut to ≈ 20: "Your hours are already spoken for twice. The one thing you cannot add is a new system to learn."), tighter band padding, and `object-position: 20% bottom` for J05 so the table shows. Or set the headline over the bare plaster at upper-left (the reason that plaster was reserved in the J05 prompt) and drop the band to a one-line footer. Template/compose change (main session). |
| 3 | low | Slide 02's J05-3 reads as a derelict room (crumbling, stained plaster) with bright summer green through the window. Green is off-palette and the picks note flagged both. Of the four candidates it was the calmest, which says the job needs a re-roll more than a different pick. | Re-roll J05 with `--no greenery, foliage, derelict, crumbling, stains` and "late autumn, bare trees"; keep the bare plaster upper-left. |
| 4 | low | Slide 09's footer URL is forced to caps by the DM Mono eyebrow style: "PATINA.CLOUD/DESIGNERS". A URL in caps reads as shouting and is harder to type back. | Footer in lower case for this slide (template: `text-transform: none` on footer URLs). |
| 5 | low | Five text-only slides leave the lower two-thirds empty paper; "generous paper" is the rule and it works across a table, but the 26 px body under a 64 px headline is small when the deck is shown on a laptop at arm's length. | Body 30–32 px in the print block; nothing else. |
| 6 | low | The cover sub-line "One page per client your first hire can read." and slide 04's headline "Give the new hire the whole job on one page." say the same thing; fine for a cover, noting only that slide 04 is where she will hear it twice. | None required. |
| 7 | low | Ten pages against the brief's six to eight; within voice.md's ≤ 10 for outreach. The closing slide is near-empty paper. | Fine as is, or end on slide 09, whose body already says "Bring one live project". |

Voice: passes. Evidence before claims (quote slide precedes the product). Honest status slide.
Headlines stand alone. [C01] [C03] [C04] [C05] [C06] [C08] [C10] [C11] [C23] [C24] all verified.
Speaker notes keep "Don't say any other studio uses Patina today."

---

## P07 — PR pitch, email (`out/P07/pitch.md`)

**What I see.** Subject "The page behind the rooms you publish" (37 chars). Marked **DRAFT. NOT
SENT.** "Fill the brackets first." Three bracketed placeholders, the material one rewritten as an
instruction. Body 133 words with the brackets (≤ 150). One ask: "Come to the studio for an hour
mid-job and see the page beside the drawings; Leah will walk you through a live house." Signed
"Kody, with Leah / Middle West Studio, Madison". No attachments, no "exclusive", no flattery. Not
sent; this agent sent nothing.

| # | Severity | Finding | Fix |
|---|---|---|---|
| 1 | medium | The editor never learns that "the page" is called Patina. Paragraph 2 offers "the page behind them: one living document per client"; paragraph 3 opens "Patina is a venture of Middle West Studio…" as if Patina had been introduced. Read cold, "Patina" lands as a word from nowhere. | Paragraph 3: "That page is Patina, a venture of Middle West Studio in Madison [C01], starting with studios in Madison and Milwaukee [C08]." |
| 2 | low | "Leah has run this studio through this moment herself." In a note signed by Kody, "this studio" is ambiguous (the editor's? the reader has just been told about Middle West). | "Leah has run Middle West through this moment herself." (two words longer; body stays ≤ 150 after the brackets are filled only if the filled observation is ≤ 2 sentences, so say so in the bracket note). |
| 3 | low | The ask asks a Milwaukee editor to come to Madison without saying where the studio is until the sign-off. | "Come to the studio in Madison for an hour mid-job…" |
| 4 | low | Word budget: 133 with brackets. Two real sentences of observation will add 15–25 words and push it to the limit. The draft header should say the limit out loud so whoever fills it knows. | Add to the header line: "Fill the brackets first; keep the body under 150 words." |

Voice: passes the outreach rule in shape (checkable observation first, one concrete ask, a visit
mid-job, which is the photographable thing). Midwest: Bay View placeholder, Madison, Milwaukee.
[C01] [C04] [C08] [C24] verified; markers stripped in `out/`.

---

## P08 — poster, poster-18x24 (`out/P08/P08.pdf`, `P08-preview.png` 1752×2328)

**What I see.** The sheet is 18.25×24.25 in (MediaBox 1314×1746 pt), 0.125 in bleed on all sides;
the image and paper band run to the sheet edge; text is inset 1 in from trim. J06-2 owns the top
≈ 16.6 in: a dim hall, an open painted door, low sun thrown across plank floors onto a work table
with a page and a drawing set, a pinned sample board on the far wall. The paper band below carries
"The page behind the rooms." in Playfair at 1.15 in, the italic subhead "Your first hire opens one
living page per client." (8 words), the Inter body (28 words, three sentences) and the wordmark
bottom right. No eyebrow (the duplicate is gone). Readable from six feet: the headline is ~1.15 in
tall, which reads at ten feet; the subhead at 0.42 in reads at four.

| # | Severity | Finding | Fix |
|---|---|---|---|
| 1 | high | **Print resolution.** The PDF embeds J06-2 at its native 928×1232 px across an 18.25 in width: about 51 dpi. Art-direction §4 requires the poster image at 5400×7200 px or upscaled to it. On a wall at six feet it will pass as a soft photograph; on a table or up close it will pixelate, and a print shop will flag it. | Upscale J06-2 in Midjourney (Upscale Creative or Subtle, 4×: 3712×4928), then a 2× upscale to ≥ 5400×7200 (any local upscaler), drop the result in as the J06 pick (it also sharpens P06 slide 09), re-compose and re-render P08. Confirm the PDF grows well past 1.7 MB. |
| 2 | medium | The copy and plan put the headline "across the top third" of the image, and the J06 prompt reserved "quiet shadow across the upper third" to hold it; the compose sets the headline on the foot band instead. As printed, the top of the picture is the dark door frame and hall with nothing on it, and the paper band is 7.6 in tall with 4 in of empty paper between the body and the wordmark. | Pick one before the upscale: (a) move the headline into the image's upper third in paper-coloured Playfair over the shadow (the plan's design), shrinking the band to ≈ 5 in for subhead, body and mark; or (b) keep the band and crop J06 lower (`object-position: center 70%`) so the lit table and the page, not the dark hall, fill the picture. Template decision (main session). |
| 3 | low | The image is centre-cropped from 3:4 to the band's 18.25×16.6 (about 2.9 in lost top and bottom). It keeps the door and table but trims the sunlit floor at the foot that was the picture's warmest part. | Covered by #2(b); otherwise `object-position: center 65%`. |
| 4 | low | Body: "Made at Middle West Studio in Madison." then "Apply to the Founding 50…" are two short sentences in a row after the long first one; fine, reads plain. Noting that the wordmark "Patina" is the only place the name appears on the poster, bottom-right at 0.42 in; from six feet a passer-by sees "The page behind the rooms." and no name. | Optional: "Patina is made at Middle West Studio in Madison." so the name appears in the body at reading distance. |

Voice: passes. Words carry it, no QR. Subhead ≤ 14, body ≤ 35. [C01] [C04] [C05] [C23] verified.
No pre-launch line on a wall poster by design (plan claims list).

---

## P09 — video, video-9x16 (`out/P09/P09.mp4`, 1080×1920, 30.000 s) — rerun 2026-10-09 11:08 with the J12 clip

**What I see.** Re-reviewed after Kody dropped `mj/inbox/J12/J12-1.mp4` (464×832, 24 fps, 5.21 s,
`assets.json` and `picks.json` both carry it as `midjourney`) and P09 re-rendered at 11:08
(`ledger.json` 2026-10-09T16:08:38Z, `status: ok`). Frames pulled at 0.5, 3, 6.5, 9.5, 12.5, 13.2,
14.5, 16, 18.5, 19.5, 22, 25.5, 26.5 and 29 s, a 1 fps strip of 13–19 s, a 12-frame tile of the J12
source, and 1:1 crops of scenes 1 and 3 and the end card. The render is H.264 1080×1920 at 30 fps,
900 frames, 30.000 s, 47 MB, **no audio stream** (ffprobe lists zero audio streams).

Scene 1 (0–6 s, J10 clip): two hands press brass pins into linen on a tray of walnut shavings and
oak strips, dust in the window light, pampas grass and bowls behind; "The week your first hire
starts." fades in at 1.2 s on a paper box now at y 1320–1450, over the shavings tray and the lower
oak board, clear of the hands. Scene 2 (6–13 s, J11 clip, cropped 35 % from the left): from above, a
hand with a pen over handwritten sheets and a pencil elevation on a dark board, brass rules; "Your
new hire opens the Shorewood page." on two lines at y 860. Scene 3 (13–19 s, **the J12 clip**): the
half-finished dining room, white oak table on drop cloths under a tall window, autumn trees outside,
stained raw plaster; "Your client sees the same page." fades in at 15.5 s. Scene 4 (19–26 s, J08-1
still, slow pan): the two-person handoff, a page passed across a white oak table by a brick wall;
"Founding 50 ·" / "patina.cloud/designers" on two lines. End card (26–30 s): "Patina" in Playfair
80 px, then in Inter 44 px mocha "patina.cloud/designers" on its own line, no period, and "The app
and marketplace are pre-launch." under it. Opens on hands at 0 s, mark once at the end on paper,
30 s exactly, on-screen lines 6/7/6/3 words in Inter 52 px, all inside the middle third except
scene 1's deliberate low box.

**The J12 clip itself.** Twelve sampled frames show a clean clip: the table, window, drop cloth
and plank floor hold their shape end to end, no warped edges, no text, no faces. Brightness
(YAVG) climbs smoothly 103 → 119 and back to 114 over the clip, a slow lighting ramp as the camera
clears the door frame, not a flicker. Nothing in the room moves on its own (the prompt's drop-cloth
draft did not happen; that is fine). What the camera does is the issue, below.

**Resolved since the second pass:** #1 (J12 landed and is in the cut; the J09 still is out), #3
(scene 1's box moved to y 1320, hands and pins are clear for all 6 s), #4 (scene 4 is J08-1, not
the J08-4 frame J11 opens from; no repeat), #5 (on-screen and VO now say "Your new hire opens the
Shorewood page", so the hand with the ring no longer contradicts a "she"), #8 (no period after the
URL in scene 4; the end card puts the address on its own line), #9 (end line is Inter 44 px, the
wordmark alone is Playfair).

| # | Severity | Finding | Fix |
|---|---|---|---|
| 1 | high | **All three clips are still 464×832 and slowed.** J10, J11 and the new J12 are each 464×832, upscaled ≈ 2.3× to 1080×1920, and each was stretched (5.21 s → 6.0 / 7.0 / 6.0 s, 1.15×, 1.34×, 1.15×) to fill its scene. At 1:1 (scene 3 crop at 16 s) the plaster, the window mullions and the table edge are visibly soft with H.264 block texture, and the crisp Inter box sitting on top makes the softness obvious. Scene 2 moves at slow-motion pace. Art-direction §6: a 30 s piece is three or four clips cut together, not stretched. The inbox J12 file is 9.9 Mbps at 464×832, so this is Midjourney's un-upscaled download, not a transcode loss. | In Midjourney, run the video Upscale on each of J10-1, J11-1 and J12-1 before downloading (the upscaled download is ≈ 2× the pixels), and extend each clip once in Midjourney to reach its scene length instead of slowing it. Replace the three files in `mj/inbox/`, re-ingest, re-pick, re-conform, re-render. If upscale is not available, cut scene 1 and scene 3 to the clips' natural 5.2 s and give the spare 1.6 s to the end card; keep scene 2 at its natural length and let scene 4 absorb the rest. |
| 2 | medium | **The J12 motion is a push-in, not the lateral slide the copy describes.** The clip starts in the doorway (dark jambs both sides) and dollies forward: the jambs leave the frame by ≈ 1.7 s of the slowed scene and the camera keeps closing on the table to the last frame; the window grows from ≈ 150 px to ≈ 230 px wide at 540-px preview scale. The prompt asked for "one slow lateral slide across the doorway"; `copy/P09.final.md` scene note 3 says "one lateral slide … the on-screen line lands as the slide settles", and `assets/README.md` calls it "the doorway lateral slide". The move never settles, and it is the same move as scene 1 (J10 is also a push-in), so two of three clips make the same camera gesture. It passes art-direction §6 on its own (one named move, low motion, ≤ 10 s). | Either (a) accept the clip and make the words true: scene note 3 → "one slow push-in from the doorway; the line lands as the jambs clear the frame", README → "the doorway push-in", and move the scene 3 fade from 15.5 s to ≈ 14.2 s (just after the jambs clear) so the line is not waiting for a settle that never comes; or (b) re-animate J09-1 in Midjourney with the original lateral-slide prompt and a second try at low motion, and drop the result in `mj/inbox/J12/` as J12-2. (b) only pays if J09 is re-rolled first (see #4), since the stains are now baked into the clip. |
| 3 | medium | **Silent.** Unchanged from the second pass: the MP4 has no audio stream at all. The copy allows "room tone only, or nothing", so a silent cut is permitted, but a file with no audio track autoplays oddly in some feeds and the eight-line VO is still the piece's spine; without it the ask is an address, not "Apply … bring one live project." | Record the VO (Leah or Kody, room tone, no music, one breath per line, "patina dot cloud slash designers") and add it as an audio clip in the composition; at minimum lay a room-tone bed so the file carries an audio track. Label the board card "silent cut" until then. |
| 4 | medium | **The plaster stains are now baked into the clip.** J12 was animated from J09-1 as it stood: rust-brown water staining in a band across the wall and black blotches at the upper left, in every frame. With "Your client sees the same page." over it, the room reads as a house someone walked away from, not a job mid-install. The second pass asked for the J09 re-roll before the animate step; it did not happen. | Re-roll J09 with `--no stains, mould, water damage, peeling, cracks` and "fresh raw plaster, skim coat, drop cloths", pick, then animate that still for J12 (one move, low motion). Until then the clip is usable for the board with the stains flagged on the card. |
| 5 | low | **Scene 3's box covers the window and the table's far edge.** The paper box at y 860–990 lands on the lower sash of the window and the sill-to-tabletop junction, the two things the eye goes to in this frame (1:1 crop at 16 s). Scene 1 already has a per-scene `top`; scene 3 does not. | Give `#p09-s3-onscreen` `style="top:1180px"` (over the stretcher, legs and drop cloth, still inside the middle third's lower edge) so the window and the table top stay clear. Compose-level edit; it will be lost on re-compose unless carried into the template's per-scene offsets. |
| 6 | low | **24 fps clips in a 30 fps render.** All three conformed clips are 24 fps (`assets/*.mp4`, 144/168/144 frames) and the piece renders at 30 fps, so every fourth source frame is shown twice: a faint, regular stutter on slow camera moves, most visible on the J12 push-in and the J08 pan. | Render the piece at 24 fps, or conform the clips with frame interpolation (`minterpolate=fps=30` or the Midjourney extend step in #1, which outputs at the render rate if downloaded upscaled). |
| 7 | low | **The middle dot dangles.** "Founding 50 · patina.cloud/designers" wraps at 52 px in the 864 px box as "Founding 50 ·" / "patina.cloud/designers", so the dot hangs at the end of line 1 like a stray bullet. | Drop the dot and force the break: "Founding 50" / "patina.cloud/designers" as two rows (a `<br>` or two `.end-row` spans). Keeps the no-period rule and the 3-word count. |
| 8 | low | **The ask shrinks to an address in the silent cut.** With no VO, scene 4 says "Founding 50 · patina.cloud/designers" and the end card repeats the address; "Apply" and "Bring one live project" live only in the unrecorded VO. A viewer with sound off sees a label and a URL, not an ask. | If the VO is recorded, nothing to do. If the silent cut ships, scene 4 on-screen → "Apply to the Founding 50" (5 words) and keep the address on the end card alone; or add "Bring one live project." as a third end-card row in Inter 44 px. |
| 9 | low | **Scene 2 still shows a head at the right edge.** The 35 % crop trimmed most of the shoulder, but a dark head and ear remain at the right edge mid-frame for the first ≈ 2 s (frame at 6.5 s). Unlit and soft, so it passes the no-face rule; at phone size it reads as someone cropped off. | `object-position: 28% center` on `#p09-j11-clip`, or re-roll J08/J11 per the second pass (#5 there) when the clips are re-made for #1. |
| 10 | low | **Set dressing in scene 1** (pampas grass in a vase, a row of ceramic bowls, a tray of shavings) still leans toward the styled-tabletop look the negative list refuses; the "sample board" is a tray. Opens on hands and material, so it passes. Unchanged from the second pass. | At the J07/J10 re-roll for #1: "a pinned sample board, linen swatch and walnut veneer chips", `--no vase, pampas grass, bowls, styled, tabletop still life`. |

Voice: passes. The reader is the studio owner; the homeowner is "your client"; the hire is "your
new hire". Shorewood on screen and in the VO; no coastal cue. No "AI", no tagline, no Pledge, no
time saved, no price. "Founding 50" carries [C23] in every sentence that uses it in the copy, and
[C04] [C05] [C24] are all `verified`; markers are stripped from the render. Mark once, at the end,
on paper. Opens on hands at 0 s. No music. The stills and clips are never captioned as a real home or
studio. Lint (`critique/lint-P09.json`): zero errors, zero warnings.

**Board status:** no longer blocked on J12. Still **needs one Midjourney pass first** (#1 upscale +
extend, ideally with the J09 re-roll in #4 folded in) and a decision on #2. Can go on the board
now as a "silent cut, low-res clips" card if Kody wants to see it in sequence with the rest.

---

## Cross-piece notes

- **Compose overwrites hand edits.** Anything fixed in `compose/<P>/index.html` (deck numbering,
  "— The ask", any per-scene tweak in P09) is lost the next time compose runs from copy. Fixes
  must live in `copy/*.final.md`, in `plan.json`, or in the templates/tools (main session). This
  pass's P06 #1 is the proof.
- **Resolution across the batch.** All picks are Midjourney at native ~1 MP and all three clips are
  464×832. That is fine for 1080 px social and the email, borderline for the deck at 1920, and a
  rule break for the 18×24 poster (P08 #1) and the 1080×1920 video (P09 #2). One upscale pass on
  J01, J05, J06 and the three clips lifts five pieces.
- **"She" versus the pictures.** The copy's new hire is "she" in P01, P02, P04, P05, P06 and P09;
  the two pictures that show the hire (J02-1 seated figure, J08-4 hand with ring) read as men. Decide
  once: neutral wording ("your new hire") or re-roll those two jobs.
- **Template-level decisions still open (main session):** poster headline position (P08 #2), deck
  image band height / full bleed (P06 #2), deck numbering and closing eyebrow in the template (P06
  #1), one-pager `byline` slot and `.media` height (P05 #1), email merge tags (P04 #1).
- **Board is stale** for P05 (placeholder preview, first-pass review text). Rebuild `board.html`
  after P05 renders.
- **Ready for the board as is (after the low fixes):** P01, P02, P04, P07. **Needs one re-roll or
  upscale first:** P03, P06, P08. **Blocked:** P05 (no render). **P09** is unblocked (J12 in the cut) but
  still wants the clip upscale/extend and a VO before it leaves the board (P09 #1, #3).
