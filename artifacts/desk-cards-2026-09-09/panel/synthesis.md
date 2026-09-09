# Synthesis — three Desk cards (Fable, 2026-09-09)

Five lenses (information architect, typographer, interaction designer, a practicing designer, an accessibility/system
critic) reviewed the screenshot's card against Patina's data model and design contract. Their memos are in this folder
(memo-*.md) — read all five before building. This file is the ruling on what to build.

## What every lens agreed on (build these into all three cards)

CUT from the screenshot's card:
- the "1 · Client: Kody" sub-line — the ordinal counts nothing; "Client:" is a spreadsheet label. Print the person bare.
- day counters ("Waiting on Kody for 30 days", "Proposal pending 44 days", "Sample, chosen 43 days") — a growing number is
  an accusation, not a fact. State DATES: "since 2 Sep", "respond by 10 Sep", "overdue since 4 Sep". An elapsed count only
  where the promise is already broken ("Overdue 6 days") — never both.
- the "Presented / Approved / In Production / Installed" strip — that is a PIECE's life, not a house's; it is a progress
  bar in prose; it is not Patina's stage vocabulary (brief · discovery · direction · proposal · project · install · care).
- the "15 projects" count line — a scoreboard of the studio's own volume; the day's line ("One thing is overdue — …") is
  a call, not a count.
- fifteen equal cards — one job is on fire and fourteen are fine; the page must look like that.

KEEP / ADD — the six registers, fixed order, one type role each:
1. Stage — one word on the existing stage plate (DM Mono 11 uppercase, white on --tab-*). Never "· 3" on a card.
2. Custody — whose hand it is in, from need.owner: "YOUR PEN" · "WITH NORA" (the person's first name when known,
   else "WITH THE CLIENT") · "WITH THE MAKER" · "AT REST". DM Mono 11 uppercase. Sits with the 7px mark.
3. Name — Playfair Display 500 20/1.3, --ink, wraps, NEVER truncates; oak-scored (1px underline) as the link.
4. Person · phase — Inter 14, --ink-muted: "Nora Ellison · Concept Development". No label.
5. The one true sentence — Inter 14 (15 in Card 3), --ink-muted; overdue clause in --terracotta-ink; money in the
   .t-money step (DM Mono 15, tabular). Grammar: [subject or figure] — [dated fact or required act]. One em dash max.
   Quiet = "Nothing needs your hand." and the card stops there.
6. The one act — DM Mono 13 uppercase, oak-scored tertiary tier (secondary two-score where the act moves a reminder
   or opens money), 44px target, aria-label "{act} — {name}". Never two acts. Quiet cards have no act; the name is the act.

Marks: 7px dot. Colors MUST be the ink members of the pigment pairs (critic F2): urgent = --terracotta-ink #9C5340,
waiting on someone else = --clay-ink #7C5E30 (or mocha #5C4A3C), at rest = 1px --ink-faint ring. aria-hidden, with the
custody word as its text equivalent. Never the material pigments (#D4A090 etc. — 2.1:1).

Depth: D4 zero shadow, everywhere. Face = --paper-doc on --paper ground + 1px --hairline. The edge is decorative by
ruling (critic F1: no token reaches 3:1) — the box groups, the text carries everything. Radii 2px/3px only — never the
retired folder card's 0 8px 8px 8px.

Hover: the shipped ".row-wash" — the stage pigment washing across the face as a clip-path circle from the pointer,
at ~6–8% opacity, 260ms; the name's oak score thickens/turns clay. No lift, no transform, no shadow. Focus: 2px solid
--clay-ink outline, 2px offset (NOT --clay — that's a live bug at 2.18:1). Press on the act: the score thickens 1→2px.
prefers-reduced-motion: transitions off. forced-colors: mark gets border: 3.5px solid currentColor.

Dates: "12 Aug" — day, 3-letter month, no period, year only if not this year. Tabular numerals only in columns/values.

## The three cards (build all three, each as a live-rendered specimen with the fixture)

### Card 1 — "The Sheet" (the classic card, done under the contract)
A sheet of paper on the desk. 3 columns ≥1024 (24px gutters), 2 at 640–1023, 1 below 640. --paper-doc face, hairline,
2px radius, 24px padding, align-items:start (cards take their own height — a quiet card IS shorter and lighter).
Anatomy top→bottom: [stage plate top-left] [mark + custody word top-right] / name (min-height two lines reserved so
neighbours share baselines) / person · phase / one sentence / hairline rule / the act, right-aligned, full-width 44px
band. Link = the name (not the whole box); the card takes :hover/:focus-within and paints the name's score.
Order: by need (designer-owned overdue → designer-owned → client-owned → maker-owned → at rest), oldest first, then name.
Show: 6 cards (Vandersteen overdue · Sonnenberg money · Halvorsen with client · Cedar Lane your pen · Marcus Wright new
lead · Osterberg quiet). Then a 390px phone frame beside it showing the single-column version (act band 48px full width).

### Card 2 — "The Ledger Entry" (the wide card — a roster row given an internal grid)
The typographer's shape. One per row, full width, top hairline (--hairline-strong), 24px 0 padding, transparent on the
ground; an URGENT entry takes a --paper-doc full-bleed band (a lighter sheet laid on the ground). Internal grid:
24px mark | 320px name block (name + person·phase beneath) | 1fr sentence (44ch max) | 132px value column (date or
money, DM Mono 15 tabular, right-aligned) | 96px act. align-items: baseline. The win: dates and money ALIGN down the page
across 45 entries — the one thing the roster could never do. Grouped under the seven stage plates like the roster
(stage-first order, needs-first within a stage). Show the same 6 jobs plus 3 more quiet ones so a column of aligned
values is visible (e.g. "4 Sep" "12 Aug" "$17,500" "7 Sep" "10 Sep"). Then the 390px frame: collapses to
16px | 1fr, value moves under the sentence left-aligned, act at the band's right — it degrades back into the roster row.

### Card 3 — "The Claim" (cards only for jobs with a claim on her hand; the rest stay roster rows)
The interaction designer's ruling: a card is a treatment for NEED, not a container for a JOB. Jobs with a need render
as cards (custody-first: mark + custody word ABOVE the name, then name, person·phase, sentence in Inter 15 up to two
lines, then a full-width 44px act band). The link is scoped to the upper block (custody+name+person, min 88px) as an
absolutely-positioned sibling behind the face; the act is a separate target below. Quiet jobs render beneath as plain
roster rows under a hairline labelled "AT REST · 9 JOBS" (name · client · "nothing needs your hand" · Open). At 16 jobs
that is ~5 cards over ~11 rows; at 45, ~6 over 39 — the shape that survives density. Include a small "16 jobs / 45 jobs"
toggle (aria-pressed chips, like the existing Desk specimen) so Kody can see the density claim; the 45-job fixture can
reuse the 43 fictional jobs from artifacts/portal-polish-review-2026-09-08/specimens/designer-desk.html plus two.
Then the 390px frame: the cards single-column, at-rest rows unchanged.

## Presentation structure ("Three Cards for the Desk")

Utilitarian-editorial: it is a design proposal Kody will read and share with Leah's studio. Same visual language as
the existing specimens (the token block, type scale, action tiers and specimen-meta strip from
artifacts/portal-polish-review-2026-09-08/specimens/designer-desk.html — reuse that CSS verbatim where it applies; it
is already dual-theme).

1. Head: title, one-paragraph brief (the ask; what the screenshot showed; that prod today is the roster and the
   2026-08-26 "never a card" rule is knowingly revisited on Kody's instruction).
2. "What we would cut, and why" — five short entries (the CUT list above), each: the screenshot's copy → the replacement
   copy, one sentence of reason. Set as before/after pairs, not a table of prose.
3. "What every card carries" — the six registers as an annotated anatomy diagram (one exploded card with numbered
   callouts; numbering is legitimate here — the registers ARE an order).
4. Card 1, Card 2, Card 3 — each: name + one-line thesis, the live specimen (desktop), the 390px frame, a compact spec
   (type · tokens · geometry · hover/focus · order), "honors / departs" (two or three lines), and "what it costs".
5. "Side by side" — one comparison table: two-second question answered? · 15 jobs · 45 jobs · 390px · departs from
   "never a card" how far · dates/money comparable down the page · quiet jobs cost.
6. "Rulings for Kody" — five, numbered (they are a list of decisions, not a sequence):
   R1 Do quiet jobs get cards at all? (IA + designer + interaction say no; Card 3 encodes that; Card 1 gives them a
      shorter card; Card 2 gives them a row-height entry.)
   R2 Does the card replace the roster or become a third facet beside "Only what needs me" / "By person"? (Typographer:
      replace, one rendering; a view switcher is one step from the dashboard the vision refuses.)
   R3 Does the Desk rank or merely mark? Need-first order puts Patina's judgement top-left; stage-first is never wrong
      and never helpful. Panel leans rank, with the reason printed on the card so a wrong rank is legible.
   R4 The card edge: no existing token reaches 3:1 on paper (hairline 1.20:1, strong 1.30:1) and D4 bans the shadow.
      Accept a decorative edge (the text carries everything) or amend "no new token" for one boundary grey (~#8F8C88).
      Panel: accept the decorative edge.
   R5 Amend the 2026-08-26 rule in writing ("one line per job in the roster; a job with a claim on the studio's hand may
      take a card") rather than leave it contradicted in silence.
   Plus a short "found along the way" note: two live defects in prod — the roster's 7px mark is drawn in the material
   pigments (#D4A090 2.13:1, #8B9CAD 2.64:1) and every designer-portal focus ring uses --color-clay (2.18:1) instead of
   the spec'd clay-ink (5.61:1). One-token swaps each, independent of the cards.
7. Colophon: the five lenses, date, fixture is fictional (Leah Hartwell · Local Dev Studio, Des Moines), every render is
   HTML/CSS not an image.

Copy voice: load the patina-brand-voice skill. Sentence case. "Designer-Taught Intelligence", never "AI". No emoji.
The page must read at rest (no opacity-0 waits), both themes, no horizontal body scroll (phone frames sit in an
overflow-x:auto container if needed), no external images. Fonts via fonts.googleapis.com (Playfair Display, Inter,
DM Mono) with real fallback stacks.
