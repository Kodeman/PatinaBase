# Press B6 — fix notes (P01, P04, P06, P07)

One line per finding from `review.md` and `review.sol.md`: applied or skipped, and why. Kody's
note going into this pass: there are no photographs of the house, only the builder's rendering —
confirmed again for this pass ("I dont have photos, just the rendering on the website"). That
fact rules out every fix that calls for swapping in a real interior/detail photo; those are
marked skipped below with that reason, matching how `review.md` itself scoped them (same-day fix
vs. reprint fix).

This is a copy-only pass: P01/P04/P06/P07 are all template pieces (social, poster, one-pager), so
only `copy/<id>.final.md` was edited, then `compose.mjs` and `render.mjs` re-run. Fixes that
require editing `marketing/templates/*` (type size, margin-top:auto, a DM Mono "Illustration"
label, CSS crop/object-position) are out of scope for this run — the rules forbid touching
templates/tools — and are skipped below with that reason.

## review.md

- **X1** (high, rights) — Applied. `hold/README.md` confirms Kippley's written OK is not yet on
  record. Changed the prose notes in `P01.final.md`, `P06.final.md`, `P07.final.md` from "used
  with Kippley's written OK" to "pending Kippley's written OK" (the rendered pieces themselves
  never claimed the OK — only these internal notes did). Recording the actual OK requires editing
  `docs/marketing/partners/kippley.md`, which is outside this run folder, so that stays undone.
- **X2** (medium, glossy render on three pieces) — Skipped. No real interior photograph exists
  (Kody: "I dont have photos, just the rendering on the website"). `review.md` already names this
  the right same-day choice; the only available same-day action (caption it as a rendering) was
  already true before this pass. Reprint-only fix (swap in a real photo), not available now.
- **X3** (low, `mj/assets.json` source metadata) — Skipped. Not a copy/compose/render edit path
  this pass is scoped to touch (copy fixes → lint; template pieces → recompose; deck/video →
  compose edit). `review.md`'s own fix names "whoever next runs ingest," not a copy edit.
- **P01-1** (high, rights) — Applied via X1.
- **P01-2** (medium, headline/caption vs. driveway image) — Applied. Caption reordered: "Every
  room holds decisions you can't see from the doorway" now follows the opening line directly
  (one of the two fixes `review.md` offered); the Parade/Kippley sentence follows it.
- **P01-3** (medium, no eyebrow) — Applied. Confirmed `compose.mjs` reads a generic frontmatter
  `eyebrow` field for every kind (social included) and the social template renders it, so this
  was a copy-level fix, not a template gap. Added `eyebrow: "Waunakee · Madison Fall Parade of
  Homes"` to `P01.final.md`. Re-rendered: the eyebrow now fills the bottom-third empty paper.
- **P01-4** (low, credit buried on last line) — Applied. Merged "Rendering: Kippley Custom
  Carpentry." into the same paragraph as the Kippley-naming sentence, "in one breath" as
  suggested.
- **P01-5** (low, crop) — Skipped. Compose/template-level (image crop math in `render.mjs`), not
  a copy edit; reviewer also said "none required."
- **P01-6** (low, "this weekend" time-sensitivity) — Skipped, no change needed. Today is Friday,
  October 9 (the run's own `Schedule:` note: "Post today, Friday October 9"), so "Open this
  weekend" is true at post time per the brief.
- **P04-1** (high, 17 pt ask on an 18×24 sign) — Skipped. Fix is a template type-size change
  (`.body` font-size in `templates/poster.html`), out of scope for a copy-only pass. Reviewer's
  own note: "the copy can help by ending on the URL as its own sentence, which it already does" —
  no copy change was actually asked for.
- **P04-2** (high, image at ~102 ppi, missing 5400×7200 upscale) — Skipped. Requires upscaling or
  replacing the Midjourney asset file; this run's rules forbid generating/fetching Midjourney
  images, and no upscale tool is part of the prescribed copy→compose→render path. Needs the
  compose/asset owner outside this pass.
- **P04-3** (medium, generated cabinet reads as the house's cabinetry) — Partially applied. The
  DM Mono "Illustration" label and the image swap are both template/asset-level and out of scope.
  Applied the documentation-level fix: rewrote the "Image rule" paragraph in `P04.final.md` from
  a conditional ("if J04 is the Midjourney texture...") to a definite statement, since J04 is in
  fact the Midjourney texture per `mj/picks.json`, and added a line that it "sits only as texture
  under the headline, not as a picture of this house's cabinetry." Does not change what prints on
  the poster.
- **P04-4** (medium, five inches of blank paper under the body) — Skipped. Template fix
  (`margin-top:auto` on `.body`), out of scope.
- **P04-5** (low, "Pre-launch." as a one-word sentence) — Applied. Body now reads "...Patina is
  pre-launch [C24]; start at patina.cloud/designers." (33 words, under the 35-word poster body
  limit).
- **P04-6** (low, J04 pick check) — No fix needed; reviewer confirmed the pick is good.
- **P04-7** (low, no eyebrow on the poster) — Skipped by design, per the reviewer's own note:
  adding one would crowd the band.
- **P06-1** (high, 7 px render overflow) — Applied. Replaced "Cover: the builder's rendering,
  courtesy of Kippley Custom Carpentry." with "Rendering: Kippley Custom Carpentry." in section 4
  (frontmatter and the duplicate markdown body). Re-ran render: P06 now produces
  `out/P06/P06.pdf` and `out/P06/P06-preview.png` (it previously failed with no output).
- **P06-2** (medium, "Cover:" is the wrong word) — Applied via P06-1.
- **P06-3** (high, rights) — Applied via X1.
- **P06-4** (medium, same crop as P07) — Skipped. Fix is a CSS `object-position` change in
  `templates/one-pager.html`, out of scope for a copy-only pass; the underlying cause (one
  rendering image, no second photo) is the same as X2.
- **P06-5** (low, "an honest hour" is unclear) — Applied, with a different wording than the
  review's literal suggestion. The suggested text, "an hour with Kody and Leah to walk us through
  it," adds enough words to push the page back over the render limit the P06-1 fix just cleared
  (confirmed by re-rendering: it failed again at the same 1063/1056 px overflow). Used "an hour
  with us" instead — "us" resolves against "Kody and Leah" named twice more in the same section —
  which clarifies who without re-breaking the page fit. Re-rendered clean.
- **P06-6** (low, band resolution) — No fix needed for Thursday, per reviewer. Confirmed no stock
  listing photo is in use.
- **P07-1** (high, rights) — Applied via X1.
- **P07-2** (medium, "designed" repeated across heading and body) — Applied, combined with the
  sol review's heading fix (same underlying finding). Heading changed from "Designed by Middle
  West Studio. Built by Kippley Custom Carpentry." to "Interiors by Middle West Studio. Built by
  Kippley Custom Carpentry."; body changed from "Middle West Studio, a residential design studio
  in Madison, designed the interiors [C28]." to "Middle West Studio is a residential design
  studio in Madison [C28]." — the heading now carries "interiors," the body only adds what the
  heading lacks, and "designed" is no longer said three times.
- **P07-3** (medium, promised eyebrow missing) — Applied. Added `eyebrow: "Moll Drive · Waunakee
  · Fall Parade"` to the frontmatter, matching the text the piece's own Layout note already
  promised and matching P06's eyebrow.
- **P07-4** (medium, credit buried mid-section, "Cover:") — Applied. Split "The house" section's
  body into two paragraphs; the credit is now its own line, "Rendering: Kippley Custom
  Carpentry.", separate from the listing description.
- **P07-5** (low, band crop clips roofline) — Skipped. Compose/template-level crop, out of scope.
- **P07-6** (low, "The hands" may read unclear to homeowners) — No fix; reviewer said none
  required, body makes it clear by the second line.
- **P07-7** (low, same frame as P01/P06) — Skipped; reviewer said P07 is the right sheet to keep
  the front-of-house frame on (brief's allowed fallback), nothing beyond P06-4 to do.

## review.sol.md

- **P01 #1** (label the image as a rendering, confirm the claim) — No change needed; already
  true. The caption already ends "Rendering: Kippley Custom Carpentry." and the alt text already
  reads "Builder's rendering of the front of the Moll Drive house..." — the image is already
  labeled as a rendering, not presented as a photograph.
- **P01 #2** (add dates/hours/address, or drop the time-sensitive headline) — Skipped. The
  caption already states the Parade dates with a citation ("October 9–11 and 16–18 [C27]");
  adding exact hours or a street address isn't in the brief or seed copy and would mean inventing
  presentation details not sourced for this piece (brief: "never invent" rooms/materials/details;
  C30 — Leah's day/hours — is still `todo`). The headline itself is accurate for today's post
  date (see P01-6).
- **P04 #1** (use a permitted project photo, or identify the image as an illustration) —
  Addressed as far as a copy-only pass allows; see P04-3 above (Image rule paragraph rewritten to
  state plainly that J04 is the Midjourney texture, not the house). No permitted project photo of
  a detail/sample exists to swap in (no photographs exist at all, per Kody).
- **P04 #2** (swap the door image for a material sample or installation detail) — Skipped. Same
  reason: no other image exists to swap in; the brief explicitly allows "a Midjourney texture or
  a real detail photo" for P04's visual, and only the former is available.
- **P06 #1** (no render to review) — Resolved as a side effect of the P06-1 fix above: P06 now
  renders and produces an attachable PDF/preview.
- **P07 #1** (confusing "Designed by" credit on the first line) — Applied; see P07-2 above (the
  combined review.md + review.sol fix).
- **P07 #2** ("Since 1987" needs verification) — No change; already satisfied. `review.md`'s own
  "Copy read" line for P07 confirms "'since 1987' cites C25 in sentence," and `claims.md` C25 is
  `verified` with a named source (kippleycustomcarpentry.com, "Since 1987"). The sol review missed
  the existing marker.

## Summary

Applied: X1, P01-2, P01-3, P01-4, P04-3 (partial), P04-5, P06-1, P06-2, P06-3, P06-5 (reworded),
P07-1, P07-2, P07-3, P07-4, sol-P06#1 (resolved as a side effect).
Skipped (template/asset/out-of-scope or already satisfied): X2, X3, P01-1 (dup of X1), P01-5,
P01-6, P04-1, P04-2, P04-4, P04-6, P04-7, P06-4, P06-6, P07-5, P07-6, P07-7, sol-P01#1,
sol-P01#2, sol-P04#2, sol-P07#2, P06-3/P07-1 (dup of X1).
