# Press B6 — fix notes

One line per finding from `critique/review.md` (Opus) and `critique/review.sol.md` (Sol).
Scope for this pass: `marketing/runs/2026-10-08-studio-door/` only — no edits to `marketing/canon/`,
`marketing/templates/` or `marketing/tools/`, and no Midjourney generation (human hand-off). Findings
that need one of those are marked "skipped — out of scope" and left for the main session / Kody.

## Cross-piece (review.md)

- **Eyebrow everywhere** ("THE PAGE BEHIND THE ROOMS" on every piece, incl. P05's unused frontmatter
  `eyebrow` and P08's headline duplicate): skipped — out of scope. `eyebrow` is set in
  `compose.mjs`'s `varsFor()` from `plan.concept.name` for every kind; the one-pager and poster
  kinds never read `data.eyebrow`/the concept line from copy. Fixing it means editing
  `marketing/tools/compose.mjs` (a tool) or `plan.json`'s shared `concept.name` (which every other
  piece also reads) — flagged for the main session, not a per-copy fix.
- **Compose outputs for social/pin** (caption/hashtags/alt never reach `out/`): skipped — out of
  scope. This is `compose.mjs`/`social.html`/`pin.html` behavior (no caption/alt output files are
  written), a tool change, not a copy edit. Flagged for the main session.
- **Template-level fixes** (email footer tagline, poster bleed, one-pager two-column, P05 eyebrow):
  skipped — out of scope, as the review itself notes. These are in `marketing/templates/`.
- **Re-review required after Midjourney lands**: not applicable to this pass — no images were
  generated or dropped in (Midjourney is Kody's hand-off, per the run rules). Every "image is a
  placeholder" finding below is skipped for the same reason, not repeated per piece.

## P01

- Opus #1 (image placeholder): skipped — out of scope (Midjourney hand-off; this agent does not
  generate or request images).
- Opus #2 (caption/hashtags/alt don't reach `out/`): skipped — out of scope, same as cross-piece
  compose note above.
- Opus #3 (eyebrow reads as a riddle alone): skipped — out of scope, same as cross-piece eyebrow
  note (not a copy frontmatter field for this kind).
- Opus #4 (status line lands as a non sequitur after the promise): **applied**. Folded "The app and
  marketplace are pre-launch [C24]" into the ask sentence with a semicolon, per the suggested fix.
- Sol #1 (image placeholder): skipped — same as Opus #1.
- Sol #2 ("The morning the new hire doesn't ask" should state the benefit, e.g. "Your first hire
  knows where the job stands"): skipped — contradicts the established concept. The headline
  pattern (a scene, not a stated benefit) is deliberate and consistent across the batch (P05's
  title, P06's cover sub-line, the plan's own `concept.idea`), and review.md's pass note explicitly
  credits "Headlines stand alone" as a voice win, not a defect.

## P02

- Opus #1 (image placeholder): skipped — out of scope, Midjourney hand-off.
- Opus #2 (`caption: >-` folds three paragraphs into one block): **applied**. Changed to
  `caption: |` with blank lines between the moment, the quote and the product paragraph.
- Opus #3 (one idea per piece — cut "No dashboards, no task manager, no tab bars" since it's slide
  5's idea elsewhere): **applied**. Removed that sentence from the caption; the quote now carries
  the "process, not a person" idea alone.
- Opus #4 (hashtags `#interiordesignstudio`/`#firsthire` are generic): **applied**. Dropped both,
  kept `#milwaukeedesign`/`#madisoninteriors`, added `#bayview` (place-specific, matches the piece's
  Third Ward/Bay View setting).
- Opus #5 (spelling: "retelling" here vs. "re-tell"/"re-telling" elsewhere): **applied** to this
  piece — changed the headline to "The handoff without the re-telling" to match P07's "re-telling".
  Left P04's "re-tell" (an infinitive verb, not the same word as the gerund) as is — hyphenation is
  already consistent there.
- Opus #6 (caption/hashtags/alt don't reach `out/`): skipped — out of scope, same as cross-piece.
- Sol #1 (image placeholder): skipped — same as Opus #1.
- Sol #2 (headline doesn't say what the hire receives): skipped — contradicts the brief. The
  angle is explicitly the quote-led "process that outlives the person who wrote it"; the caption
  (not the headline) carries what the studio gets, by design (voice.md "one idea per piece").

## P03

- Opus #1 (image placeholder): skipped — out of scope, Midjourney hand-off.
- Opus #2 (caption repeats "brief" three times in twenty words): **applied**. Changed "...on one
  living page, from brief to install [C04]" to "...on one living page that lasts to the install
  [C04]", per the suggested fix.
- Opus #3 (caption/hashtags at the exact limit, no headroom): **applied**. Dropped
  `#interiordesignprocess`, leaving 3 of 4 hashtag slots.
- Opus #4 (Pinterest is a broadcast channel; note for the board card): skipped — not a copy-level
  finding. It's a note for the board/card annotation, not text in `copy/P03.final.md`; nothing to
  edit here. (The acquisition-model flag is already recorded in `plan.json`'s `contentTest.reason`.)
- Opus #5 (caption/hashtags/alt don't reach `out/`): skipped — out of scope, same as cross-piece.
- Sol #1 (image placeholder): skipped — same as Opus #1.
- Sol #2 (headline lists objects, not the benefit): skipped — contradicts the brief. "The brief,
  the sample, the yes." is the piece's angle verbatim from `plan.json`, and the caption's next
  sentence already states the benefit ("...on one living page that lasts to the install").

## P04

- Opus #1 (footer tagline "Designer-Taught Intelligence for growing design studios." is a held-back
  tagline per voice.md §3/§4): skipped — out of scope. The line is hard-coded in
  `marketing/templates/email.html`'s footer, not in copy frontmatter or body. Flagged for the main
  session.
- Opus #2 (`{{business_address}}`/`{{unsub_url}}`/`{{prefs_url}}` render literally): skipped — out
  of scope. Send-time merge-tag fill, not a copy edit; the template comment already documents this
  as intentional until a real send.
- Opus #3 (no image slot renders for email; J04 slot silently drops): skipped — out of scope. This
  is a `compose.mjs` bug (`varsFor()`'s email case builds `img` as `image ? <img> : ''` instead of
  using `imageBlock()`, so there's no "IMAGE PENDING" box the way every other kind gets one).
  Keeping `visual: J04` in the frontmatter (per the instruction to keep frontmatter fields) rather
  than silently dropping the job from the plan; flagged for the main session to fix the template
  logic.
- Opus #4 (no place anywhere in the letter): **applied**. Added "the Shorewood Hills client" to
  paragraph 1 and "in Madison" to "Kody builds it here in our studio in Madison [C01]."
- Opus #5 (person shifts mid-paragraph, "my memory" → "the owner's desk"): **applied**. Changed to
  first person throughout: "...every question comes back to my desk, and I cannot re-tell every
  house."
- Opus #6 (the Founding 50 ask circles twice across two paragraphs): **applied**. Merged into one
  paragraph: pre-launch status, then the seat-at-the-table offer, then the single apply instruction.
- Sol #1 ("The Founding 50" verification not visible in the render): skipped — not a defect. C23 is
  a `verified` row in `claims.md`; compose strips `[Cnn]` markers from every render by design
  (voice.md §8), so their absence in the rendered email is correct behavior, not missing evidence.
- Sol #2 ("apply" then "Reply here" reads as two asks; make the reply line a question-invitation):
  skipped — contradicts voice.md. §9's Email craft rule mandates the closing line verbatim: "End
  with a reply invitation: 'Reply here; it comes straight to me.'" That line is a courtesy sign-off,
  not a second ask; the single ask (apply to the Founding 50) is unchanged.

## P05

- Opus #1 (image placeholder): skipped — out of scope, Midjourney hand-off.
- Opus #2 (image band collapses to ~0.2in under `overflow:hidden`; conditionally trim section 2):
  skipped — out of scope. The root cause is `marketing/templates/one-pager.html`'s `.media{height:
  3.1in}` layout, a template fix for the main session. Trimming section 2's copy now, before that
  layout fix lands, wouldn't address the actual overflow and wasn't asked for independent of it.
- Opus #3 (two-column layout should be single column per art-direction §4): skipped — out of scope,
  `one-pager.html` CSS, flagged for the main session.
- Opus #4 (frontmatter `eyebrow` never renders; concept eyebrow shows instead): skipped — out of
  scope, same as the cross-piece eyebrow note (`compose.mjs`'s one-pager case never reads
  `data.eyebrow`).
- Opus #5 (the Founding 50 ask appears three times in the bottom third): **applied**. Shortened
  section 4's body to the suggested text, dropping the two duplicate "apply..." lines and keeping
  the ask only in the CTA line. Mirrored the same cut in the duplicate markdown body below the
  frontmatter so the file stays internally consistent.
- Opus #6 (byline wraps in the narrow label column): skipped — out of scope. CSS column-width issue
  in `one-pager.html`; no copy-text change reliably fixes a layout wrap.
- Opus #7 (section 1's "Until now every house lived in your head" implies the change already
  happened, ahead of pre-launch): **applied**. Changed to present tense: "Every house lives in your
  head, and that worked while you carried them alone." (both the frontmatter section and the
  duplicate markdown body below).
- Sol #1 (image band placeholder): skipped — out of scope, same as Opus #1/#2.
- Sol #2 ("The quote, the revision and the client's yes live on one page" reads as a current-product
  claim given pre-launch status elsewhere): skipped — contradicts voice.md. This is voice.md §10's
  own "Good" example sentence verbatim, and review.md's cross-reference already notes the identical
  objection was raised at cold-read and correctly rejected ("'so nobody asks twice' is the canon's
  own example"). The pre-launch status is stated honestly in section 3, a few lines later.
- Sol #3 ("Founding 50" needs a verified claim): skipped — not a defect, same reasoning as P04 Sol
  #1 (C23 is verified; markers are stripped from renders by design).

## P06

- Opus #1 (three placeholders, J05/J01/J06 missing): skipped — out of scope, Midjourney hand-off.
- Opus #2 (images are a 46%-width side panel, not full bleed, per art-direction §4): **applied**.
  Deck/video are hand-edited directly per the task rules, so this was fixable: `.bleed` now covers
  the entire slide (`inset:0`, negated against the slide's own padding so it reaches the true edge
  in both the live HTML and the print/PDF layout), with the text riding a paper card above it.
  Verified by rendering `out/P06/P06.pdf` and converting slides 2 and 9 to PNG — the clay
  placeholder now fills the full slide edge to edge.
- Opus #3 (numbering off by one vs. the speaker notes, which already read "Slide 1...Slide 8"):
  **applied**. Renumbered the deck's visible eyebrow/footer numbers from 02–09 to 01–08 (cover and
  close stay unnumbered), matching the existing speaker notes rather than renumbering the notes.
- Opus #4 (closing slide eyebrow "— NEXT" reads like a template leftover): **applied**. Changed to
  "— The ask".
- Opus #5 (slide 6/"who we are": "built by people who run jobs like yours" — Leah runs jobs, Kody
  builds): **applied**. Changed to "It is built inside a studio that runs jobs like yours," in both
  `copy/P06.final.md` and `compose/P06/index.html`.
- Opus #6 (10 pages vs. the brief's 6–8): skipped — the review's own verdict is "Fine as is," not a
  finding that asks for a change.
- Sol: no findings for P06.

## P07

- Opus #1 (no checkable story for an editor; the call ask has nothing to run or shoot — use the
  studio-visit ask the plan itself offers): **applied**. Changed the closing ask to "Come to the
  studio for an hour mid-job and see the page beside the drawings; Leah will walk you through a live
  house."
- Opus #2 (the material placeholder invites a generic fill): **applied**. Rewrote the bracket as an
  instruction naming the exact material and room, per the suggested text.
- Opus #3 ("Leah can speak to the studio work behind Patina" is vague): **applied**. Changed to
  "Leah has run this studio through this moment herself" (trimmed from the suggested "Middle West
  Studio in Madison" repeat to stay inside the 150-word lint limit after the other edits).
- Opus #4 ("a short call" should be "a twenty-minute call" if the call ask survives): skipped —
  superseded by #1; the call ask was replaced with the studio-visit ask, so there is no "short call"
  phrase left to qualify.
- Opus #5 (cut "before a room is ready to photograph" for word headroom): **applied** in spirit —
  that clause was removed as part of the #1 ask rewrite; additionally trimmed "in the morning" from
  paragraph 2 to clear the 150-word pr-pitch lint limit after all the above edits (152→149 words).
- Sol #1 (no P07 render was supplied to review): skipped — not a content defect. `ledger.json` shows
  `P07 render: ok, out/P07/pitch.md` from the original pass; the Sol review pass apparently ran
  without it, which is a review-process gap, not something to fix in the copy.

## P08

- Opus #1 (no bleed: `@page` is exactly 18×24in with 0 margin, no 0.125in bleed area despite the
  compose comment claiming there is one): skipped — out of scope. `poster.html`/render.mjs `@page`
  CSS, a template fix for the main session.
- Opus #2 (image placeholder; at 18×24 the real pick must be 5400×7200px): skipped — out of scope,
  Midjourney hand-off.
- Opus #3 (eyebrow duplicates the headline, "THE PAGE BEHIND THE ROOMS" over "The page behind the
  rooms."): skipped — out of scope, same as the cross-piece eyebrow note.
- Opus #4 (headline sits on the foot paper band, but the plan/J06 prompt reserve the image's upper
  third for it): skipped — out of scope. This is a layout decision between `poster.html`'s structure
  and the Midjourney prompt's framing, needing a call from the main session/art direction before
  Kody shoots J06, not a copy-text change.
- Opus #5 ("From Middle West Studio in Madison." is a sentence fragment): **applied**. Changed to
  "Made at Middle West Studio in Madison."
- Sol #1 (image placeholder): skipped — out of scope, same as Opus #2.
- Sol #2 (subhead states availability without the pre-launch qualifier used elsewhere): skipped —
  contradicts the brief. `plan.json`'s P08 claims list is deliberately `[C01, C04, C05, C23]`, with
  no C24; review.md's full pass gave this piece an unqualified "Voice: passes" with no such finding.
  Adding a pre-launch line to a six-feet-readable wall poster also works against the "words carry
  it, one idea" rule the same review praised.
- Sol #3 ("Founding 50" needs a verified claim): skipped — not a defect, same reasoning as P04 Sol
  #1.

## P09

- Opus #1 (no render; FFmpeg/FFprobe missing): not fixable in this pass. `ffmpeg`/`ffprobe` are
  still not on `PATH` in this environment; installing system packages is outside "write only inside
  this run folder" and wasn't asked for. Re-ran `render.mjs --piece P09` to confirm — same failure
  as the prior pass, reported below.
- Opus #2 (all four media assets are stand-ins; PENDING.md says don't render for real review until
  they land): skipped — out of scope, Midjourney hand-off (Kody drops files in `mj/inbox/`).
- Opus #3 (the URL is legible for only ~2.2s on the end card; scene 4's on-screen line has no
  address): **applied**. Moved the address onto scene 4's on-screen text ("Founding 50 ·
  patina.cloud/designers [C23]") and took 1s from scene 2 (8→7s) to extend the end card from 3s to
  4s, in both `copy/P09.final.md` and `compose/P09/index.html` (clip/text timings and the fade-in
  cues were all shifted to match).
- Opus #4 (no audio element exists; the render is silent, so on-screen text carries the whole
  piece): **applied the "tighten on-screen lines" branch**, not the "record VO" branch — recording
  Leah/Kody's voice isn't something this offline pass can do. Added "Shorewood" to scene 2's
  on-screen line ("She opens the Shorewood client's page.") so the place-specific detail the VO
  carries isn't lost when the piece plays silent.
- Opus #5 (J08 reused from scene 2's start frame; viewer sees the same table twice in 15s):
  skipped — the review itself frames this as "Acceptable for one idea; or..." — a judgment call it
  doesn't ask to be changed, and the alternative (swap to J09) is an asset/plan-level call about
  which image to use, not a copy fix.
- Opus #6 (the paper text box may cover the hands in J10/J07 depending on which pick lands): skipped
  — out of scope. This is a Midjourney-pick decision at B2 ("pick J07/J10 with the hands below
  ~1000px or above ~800px"), not something resolvable before a real image exists.
- Sol #1 (no P09 render was supplied to review): same situation as P07 Sol #1 — not a content
  defect; P09's render has failed since before this pass (FFmpeg missing), which is reported
  honestly rather than hidden, not something the Sol review pass could have seen either way.

---

# Press B6 — second fix pass (against the 10-09 09:24 review.md / 09:15 review.sol.md)

This review superseded the one above: it inspected the real Midjourney renders (`out/`) rather than
IMAGE PENDING placeholders, and caught that the first B6 pass's hand edits to `compose/P06/index.html`
were wiped by an intervening `compose.mjs` regenerate. Same scope as above: this run folder only, no
canon/templates/tools edits, no Midjourney generation. Claims checked against `canon/claims.md`: C23
("The Founding 50 is a circle of 50 working designers…") and C24 are both `verified` rows, so every
Sol finding that called the Founding 50 number or the pre-launch status unverified is not a defect —
noted once here, not repeated per piece.

## P01

- Opus #1 (image needs a Midjourney upscale): skipped — out of scope, Midjourney hand-off.
- Opus #2 (alt text says "opening a drawing set" but the hands rest on a drafting board, closed):
  **applied**. Alt now reads "resting on a drafting board beside a single handwritten page…".
- Opus #3 (empty paper above the headline reads unfinished; decide with P03): skipped — out of
  scope, template/layout CSS in `templates/social.html`, a main-session call paired with P03.
- Opus #4 (optional: cut "Your client sees the same page: one agreed direction" as the caption's
  fourth idea): skipped — contradicts the brief. `brief.md`'s P01 brief explicitly asks for both
  "one living page per client, from brief to install [C04]; the client sees the same page [C05]"
  in this piece's caption; dropping the C05 sentence would drop a brief-mandated claim, not just
  trim a judgment call.

## P02

- Opus #1 (the seated hire in J02 reads as a man; caption says "she can read without you"):
  **applied** the caption-neutralize branch (image re-roll is out of scope). Changed to "one
  living page per client that your new hire can read without you". Applied the same neutral
  wording to P09 scene 2, per this finding's own cross-reference.
- Opus #2 (room reads as a workshop more than a studio): skipped — reviewer's own verdict is
  "Acceptable as is," not a requested change.
- Opus #3 (the "re-telling" hyphen breaks Playfair's rhythm at 44px): skipped — reviewer offers
  "keep for consistency" as a valid option, and the prior pass already standardized the hyphenated
  form batch-wide for exactly that reason.

## P03

- Opus #1 (stray stump/log prop in the top-right quarter): skipped — out of scope. The suggested
  fallback (`object-position: bottom` on the pin image) is a `templates/pin.html` CSS change, which
  this pass may not edit; the real fix is a Midjourney re-roll or vary-region, Kody's hand-off.
- Opus #2 (alt text says "a fabric tag pinned" but the picture shows a frayed burlap scrap lying,
  not pinned): **applied**. Alt now reads "…with a frayed burlap swatch at its corner…".
- Opus #3 (caption-to-image match praised, no fix needed): nothing to change.
- Opus #4 (empty paper band, same note as P01 #3): skipped — out of scope, template/layout, pair
  with P01's decision.
- Opus #5 (Pinterest is a broadcast channel; note for the board card): skipped — not a copy-level
  finding; it is a board-card annotation already recorded in `plan.json`'s `contentTest.reason`.

## P04

- Opus #1 (`{{business_address}}` etc. render literally): skipped — out of scope, send-time
  merge-tag fill, template behavior already documented as intentional until a real send.
- Opus #2 (alt text names a "fabric ring" and "tape measure" that aren't in the picture, which has
  a bolt of linen and a roll of tape): **applied**. Alt now reads "A bolt of unbleached linen, a
  roll of tape and folded drawings…".
- Opus #3 (the J04 pick is dark/heavy for a letter): skipped — out of scope, Midjourney pick
  change.
- Opus #4 (open with Leah's own moment before the general claim, per voice.md §9 "write a
  letter"): **applied**. Swapped the first two sentences so the Shorewood Hills recollection opens
  the letter and the [C03] claim follows it.
- Opus #5 (two metaphors stacked: "seat at the table" + "bring … with you"): **applied**. Changed
  to "a seat in the Founding 50 [C23]… apply at patina.cloud/designers and bring one live project;
  Kody and I read every application [C23]."
- Sol #1 (replace the C03 opening sentence with an invented personal line, "We brought on our
  first designer when the work had outgrown my desk."): skipped — contradicts the brief and the
  plan's claims list, which requires C03 in P04, and invents a specific biographical fact about
  Leah's studio that isn't in canon. Opus #4's reorder achieves the same "personal moment first"
  goal without dropping the claim or inventing a fact.
- Sol #2 (apply + bring + reply reads as three asks; drop "bring a project" to a later exchange):
  skipped — contradicts the brief. `brief.md` defines the single ask as "apply to the Founding 50
  … and bring one live project" as one instruction, and voice.md §9 mandates the closing reply
  line verbatim as a courtesy sign-off, not a second ask. Same reasoning the first B6 pass used for
  an identical Sol finding.
- Sol #3 ("the app and the marketplace" is product language; replace with "Patina is not open
  yet."): skipped — contradicts the brief, which asks every piece to state "the app and
  marketplace are pre-launch [C24]" plainly; the current line tracks the verified C24 claim more
  precisely than the proposed replacement.
- Sol #4 (`{{business_address}}` unfilled): skipped — same as Opus #1.
- Sol #5 ("Founding 50" lacks a verified claim): not a defect — C23 is a verified row in
  `claims.md`.

## P05

- Opus #1 (high — the piece doesn't render: 1180px of content on a 1056px page): **applied**, and
  then applied again after the first cut still overflowed (1106px). Cuts, in order: dropped the
  duplicate "Kody and Leah, Middle West Studio" paragraph from section 4 (the `byline` frontmatter
  field already holds it); shortened section 2 to the ≈44-word version the review gave verbatim;
  cut section 1 to end at "…workload doubles [C03]."; dropped section 3's closing Founding-50
  sentence (the CTA already carries it). This round still read 1106px on a 1056px page, so a second
  pass trimmed further: section 1 drops "Shorewood Hills" and "and you tell the whole story again";
  section 2 drops the "quote, the revision and the client's yes…" middle sentence; section 3 drops
  "We are" / "Plainly:" filler. `out/P05/P05.pdf` now renders. The `.media` height / two-column
  layout changes the review also offered are template-level and stayed out of scope.
- Opus #2 (repetition: "one page" five times, "the drawings" twice): resolved as a side effect of
  Opus #1's cuts, as the review itself predicted.
- Opus #3 (title wraps to two lines, 9 words, longest in the batch): **applied**. Shortened to "The
  morning your first hire doesn't ask" (one of the two options the review offered).
- Opus #4 (append [C23] to "Kody and Leah read every application" for ledger completeness):
  **applied**.
- Sol #1 (no render was supplied to review): resolved procedurally — the overflow is fixed and
  `out/P05/P05.pdf` now exists; not a separate copy defect.

## P06

- Opus #1 (medium — the deck's prior B6 hand edits were wiped by a 09:13 `compose.mjs` regenerate;
  numbering back to 02–09, closing eyebrow back to "NEXT"): **re-applied** directly in
  `compose/P06/index.html` (deck pieces are hand-edited per the task rules): content slides
  renumbered 01–08 (eyebrow and footer) to match the speaker notes' "Slide 1…Slide 8"; closing
  slide eyebrow changed from "Next" to "The ask".
- Opus #2 (medium — image slides read as a 45%-height strip, not full bleed; art-direction §4):
  **partially applied**. The `.bleed{inset:0}` full-bleed CSS from the first B6 pass was still
  intact (not wiped), so the underlying mechanism is correct; the remaining issue was slide 2's
  paper band running tall because its body text was long. Shortened slide 2's body from 38 words
  (which duplicated the headline's [C03] claim) to the review's ~19-word suggestion ("Your hours
  are already spoken for twice…") and adjusted `object-position` on J05 toward the table, in both
  `compose/P06/index.html` and `copy/P06.final.md`. A further per-slide band-padding reduction, if
  still needed, is template-level (main session).
- Opus #3 (J05 pick reads derelict, off-palette green): skipped — out of scope, Midjourney re-roll.
- Opus #4 (slide 8's footer URL forced to caps by the DM Mono eyebrow style): **applied**.
  `text-transform:none` on that one footer span.
- Opus #5 (body text small at 26px for a laptop view): **applied**. Print body size raised to 30px,
  nothing else changed, per the review's own "nothing else" scope note.
- Opus #6 (cover sub-line and slide 4 headline repeat the same idea): skipped — reviewer's own
  verdict is "None required."
- Opus #7 (10 pages vs. the brief's 6–8): skipped — reviewer's own verdict is "Fine as is."
- Sol: no findings for P06.

## P07

- Opus #1 (medium — "Patina" is used in paragraph 3 before it's introduced): **applied**. Paragraph
  3 now opens "That page is Patina, a venture of Middle West Studio in Madison [C01]…".
- Opus #2 ("this studio" is ambiguous in a note signed by Kody): **applied**. Changed to "Leah has
  run Middle West through this moment herself."
- Opus #3 (the ask never says Madison until the sign-off): **applied**. "Come to the studio in
  Madison for an hour mid-job…".
- Opus #4 (the draft header should state the word budget so whoever fills the brackets knows):
  **applied**, worded to avoid a bare digit (which the lint's uncited-number rule would flag):
  "Fill the brackets first; keep the whole note brief." After the three applies above pushed the
  piece to 158 words (max 150; the lint counts the header and brackets, not just the "sent" body),
  trimmed "so the owner isn't re-telling every house" from paragraph 2 to clear the limit.
  `critique/lint-P07.json`: 0 errors.
- Sol #1 (no P07 render was supplied to review): skipped — not a content defect, a review-process
  gap (the piece has rendered to `out/P07/pitch.md` since the original pass).

## P08

- Opus #1 (high — no 0.125in bleed in the `@page` CSS despite the compose comment claiming one):
  skipped — out of scope, `templates/poster.html` / `render.mjs` `@page` rule, main session.
- Opus #2 (image placeholder; needs a 5400×7200px upscale at 18×24in): skipped — out of scope,
  Midjourney hand-off.
- Opus #3 (eyebrow duplicates the headline): skipped — out of scope, same as the cross-piece
  eyebrow note; `compose.mjs`'s poster case doesn't read a copy-level eyebrow field.
- Opus #4 (headline sits on the foot band, but the J06 prompt reserved the image's upper third for
  it): skipped — out of scope, a layout-vs-prompt decision for the main session before any re-roll.
- Opus #5 (optional: "Patina is made at Middle West Studio…" so the product name appears in body
  text, not just the small wordmark): **applied**. Body now opens that sentence with "Patina is
  made at…"; still 32 words, under the 35-word poster limit.
- Sol #1 (image placeholder): skipped — out of scope, same as Opus #2.
- Sol #2 ("Founding 50" lacks a verified claim): not a defect — C23 is a verified row in
  `claims.md`.

## P09

- Opus #1 (high — J12 still hasn't landed; scene 3 is a stand-in still with a pan): skipped — out
  of scope, Midjourney hand-off (Kody animates and drops the clip in `mj/inbox/J12/`).
- Opus #2 (high — both clips are 464×832 upscaled ~2.3× and slowed rather than extended): skipped —
  out of scope, needs a higher-res Midjourney download/extend, Kody's hand-off.
- Opus #3 (medium — the on-screen text box in scene 1 sits on top of the hands and the pins for
  4.8 of 6s): **applied**. Scene 1's on-screen `<p>` now sits at `top:1320px` (below the tray),
  clear of the hands.
- Opus #4 (medium — scenes 2 and 4 show the identical J08-4 frame six seconds apart, since J11's
  clip animates from that same still, reading as a loop glitch): **applied** the asset-swap branch.
  Scene 4 now uses `mj/inbox/J08/J08-1.png` (the two-person handoff frame Kody already dropped in,
  not a new Midjourney generation) copied in as `compose/P09/assets/J08-alt.png`, documented in
  `compose/P09/assets/README.md`.
- Opus #5 (medium — "She opens the Shorewood client's page" plays over a hand with a wedding ring;
  the copy's hire is always "she"): **applied** the on-screen-text branch (re-roll is out of
  scope). Changed to "Your new hire opens the Shorewood page." in both `compose/P09/index.html` and
  `copy/P09.final.md`, matching the P02 #1 fix.
- Opus #6 (medium — the film has no audio track at all): skipped — out of scope. Recording real VO
  needs Leah or Kody's voice, which this pass cannot produce; a synthesized silent or placeholder
  audio track would not be genuine room tone, so nothing was added. Still a silent cut.
- Opus #7 (medium — J09's plaster has stains/mould, reads abandoned not mid-job): skipped — out of
  scope, Midjourney re-roll needed before Kody animates it into J12.
- Opus #8 (low — scene 4's on-screen URL ends with a period, and the end card repeats the URL with
  one too): **applied**. Dropped the trailing period in scene 4; the end card now puts the URL on
  its own line with no period, the pre-launch sentence on the line under it.
- Opus #9 (low — the end-card line is Playfair italic; art-direction §4 wants on-screen text in
  Inter): **applied**. `.end-line` is now Inter 44px (was Playfair italic 48px).
- Opus #10 (low — scene 1's vase/bowls/shavings lean toward styled-lifestyle for the next J07
  roll): skipped — out of scope, a note for Kody's next Midjourney roll, not a current-asset fix.
- Opus #11 (low — a shadowed head/ear sits at the right edge in scenes 2 and 4): **applied** for
  scene 2 (`object-position:35% center` on the J11 clip crops the right edge). Scene 4's new J08-1
  pick (Opus #4) doesn't show the same head-at-edge framing, so no crop was needed there.
- Sol #1 (no P09 render was supplied to review): skipped — not a content defect, same reasoning as
  P07 Sol #1; `out/P09/P09.mp4` has rendered since FFmpeg landed on PATH.

## Verification

Hyperframes lint (video only, per the task rules): `compose/P09` — 0 errors, 0 warnings. (`compose/P06`
is a standalone print/slide deck, not a hyperframes composition — the task only asks for hyperframes
lint on video pieces, so it was not run against P06's deck mechanics.)

## P09 fix pass (B6, J12 in the cut)
- #1 (clips 464x832, slowed): skipped, needs a Midjourney upscale/extend by Kody; the 5.2 s fallback only applies if upscale is unavailable, not yet tried.
- #2 (J12 is a push-in, not a slide): applied. Scene note 3 and README say push-in; scene 3 fade moved 15.5 s to 14.2 s.
- #3 (silent): skipped, VO recording is a human step; board card should read "silent cut".
- #4 (plaster stains baked in): skipped, needs the J09 re-roll in Midjourney.
- #5 (scene 3 box covers window): applied, box at top 1180 px.
- #6 (24 fps in 30 fps render): skipped, render rate is fixed by the template; revisit with the upscaled clips.
- #7 (dangling dot): applied by removal; the address is off scene 4.
- #8 (ask shrinks to an address): applied, scene 4 on-screen is "Apply to the Founding 50 [C23]" (5 words); address stays on the end card.
- #9 (head at right edge): applied, object-position 28% on the J11 clip.
- #10 (scene 1 set dressing): skipped, a note for the next Midjourney roll.
