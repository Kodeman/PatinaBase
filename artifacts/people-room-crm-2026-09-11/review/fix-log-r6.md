# Fix log — round 6, `people-room-390.html`

Builder B, 390. Two rulings applied to the 390 file (R-V, R-W), then every card walked at both
widths under Playwright and diffed. The 1440 file is canonical and was opened read-only.

## Applied

**R-V — person card regions.** `renderPerson()` now prints the Contact rule and Access grants
sub-heads and the Seats on projects region on every card, whether or not the record exists. The
fallback lines are the 1440 file's own strings, byte for byte: `No contact rule on file.`,
`No grant on file.`, `No open seat on this project.` Before this, all three regions were inside
`if (r)` / `if (g)` / `if (e)` and vanished whole; a card read on a phone could not distinguish an
absent fact from a missing region.

**R-W — crew-line link scope.** The company card's crew line was one `<a class="linkline">` wrapping
the name, the role and every designation. `crewLine()` now returns the designations only, and the
name is a `<button class="linkline" data-open-person>` beside them as plain text — matching the 1440
file's `personLink()`. The `.linkline` rule gained the button reset (`padding:0; border:0;
background:transparent; text-align:left; cursor:pointer`); its 44px min-height and oak underline are
unchanged.

Verified under Playwright, both widths, Twin Cities Drywall & Plaster:

```
--- W1440 Crew & designations region ---
   <BUTTON> acc-name="Rosa Delgado" h=21px  | line="Rosa Delgado · office manager · paperwork contact · site contact"
   <BUTTON> acc-name="Frank Bauer" h=21px  | line="Frank Bauer · owner, signer · signer"
--- W390 Crew & designations region ---
   <BUTTON> acc-name="Rosa Delgado" h=44px  | line="Rosa Delgado · office manager · paperwork contact · site contact"
   <BUTTON> acc-name="Frank Bauer" h=44px  | line="Frank Bauer · owner, signer · signer"
```

## The per-card walk

Every one of the 12 Directory person rows and 6 Directory firm rows was clicked open at 1440 and at
390 (18 cards × 2 widths = 36 card opens), and `body.innerText` plus the card's own `innerText` was
dumped for each. The two dumps were compared per card. Cells were split on tab as well as newline, so
a 1440 table row and its 390 label-over-value stack compare cell for cell; the repeated stack labels
(`TYPE`, `NUMBER`, `ISSUER`, `EXPIRES`, `STATE`, `HELD BY`, `BLOCKS`, `CHANNEL`, `CONSENT`) were
compared as a set, since SPEC §6.2 turns one table header into one label per document.

First pass, after R-V and R-W, 40 differing lines across 5 cards:

```
person:F-04=9 person:F-05=9 person:F-07=7 person:F-08=0 person:F-09=6 person:F-11=0
person:F-18=0 person:F-12=0 person:F-14=1 person:F-15=0 person:F-27=1 person:F-20=7
firm:marrow=0 firm:northgate=0 firm:tcdrywall=0 firm:stonehaven=0 firm:gnbank=0 firm:cped=0
```

Every firm card was already identical, so R-W landed clean. Two real content differences remained,
both in the person card's Channels sub-region, and both fixed in the 390 file toward the 1440 file.

**D1 — card-meta on a person with no firm (F-04 Adaeze Okonkwo, F-05 Chidi Okonkwo).** 390 printed
`Okonkwo household · client` and `Okonkwo household · household member`, appending the seat kind;
1440 prints `Okonkwo household`. The 390 `meta` expression dropped its
`(e && e.kind && e.kind !== p.roleAtFirm ? ' · ' + e.kind : '')` tail. A seat kind belongs on the seat
line, not in the identity line under the name — C1's rule, one width had drifted off it.

**D2 — channels fallback (F-04, F-05, F-07 Tom Marrow, F-09 Luis Ochoa, F-20 Claire Bissett).** For a
person carrying no entry in `FIXTURE.channels`, the 390 file synthesised a channel table out of
`p.phone` and `p.email` via a local `fallbackChannels()`, printing `Mobile · (612) 555-0104 ·
preferred`, a `CONSENT` label, a consent word and (for F-09) a consent sentence that the 1440 card
never shows. The 1440 file prints the bare `tel:` line and the email line, and `No channel on file.`
when there is neither. `fallbackChannels()` was deleted and the 390 branch now mirrors the 1440 one;
the empty-fixture case (F-15 Frank Bauer, `"F-15": []`, no phone, no email) still lands on
`No channel on file.` at both widths.

Second pass, after D1 and D2, 2 differing lines across 18 cards:

```
person:F-04=0 person:F-05=0 person:F-07=0 person:F-08=0 person:F-09=0 person:F-11=0
person:F-18=0 person:F-12=0 person:F-14=1 person:F-15=0 person:F-27=1 person:F-20=0
firm:marrow=0 firm:northgate=0 firm:tcdrywall=0 firm:stonehaven=0 firm:gnbank=0 firm:cped=0
```

## The two residual lines, and why they are layout

`person:F-14` (Rosa Delgado) and `person:F-27` (Ray Thao) each report one `1440-only: CONSENT`.
Both carry channel entries whose `consent` is `null` on every channel — Rosa's email and office
line, Ray's office line, email and 311 portal. At 1440 the channels table prints a `Consent` column
header with every cell in that column empty, because `wordEl()` returns `''` for a falsy word. At 390
the same data becomes a label-over-value stack, and a stack pair with no value is not printed at all.

That is SPEC §6.2's own instruction — "Tables become label-over-value stacks" — doing its work: a
column header is structural at 1440 and has no counterpart at 390 when every value under it is
blank. Printing a bare `CONSENT` label over nothing would read as a fact withheld rather than a fact
never recorded. Left as is. No other card at either width shows a difference of any kind.

## Render and §10

`tools/render.mjs`, 390 only, seven hashes, sandbox disabled (Chromium's Mach port bootstrap check
fails inside the sandboxed shell). Seven plates written, `people-room-390-console.json` reporting
nine captures, zero errors, zero warnings, `horizontalOverflow: false` on every one.

SPEC §10: last line is exactly `<!-- specimen-complete -->`; the forbidden grep
(`box-shadow|text-overflow|placeholder=| disabled`) returns 0; every phone on the face is one of
§3's `(612) 555-01NN` or the rolodex `(612) 555-0201/0202`; the token block and the class fragment
are byte for byte as pasted in §2; all 31 named literals of §5.2 and §5.3 appear on the 390 face.
File size 103,338 bytes.
