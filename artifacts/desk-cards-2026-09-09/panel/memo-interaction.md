# Memo — interaction design, the studio-moment lens

**The scene:** 8:10am, coffee, first client call at 9. Leah isn't browsing her studio, she's triaging it — "what bites
me today, can I clear it before the call." Rows answer that natively; cards answer *recognition* questions. So the card
must earn its box, and one thing justifies it: holding **whose hand the job is in, what it wants, and the one act** at
rest, in a position she learns by week two. A card carrying less than the roster row is decoration. I read the shipped
roster first; these rulings extend its grammar rather than invent a parallel one.

## 1. Findings on the screenshot's card

1. **Every status line is a clock; none states custody.** Whose pen it's in is the morning's most decision-relevant
   bit, smuggled into prose — "Waiting on Kody" doesn't even resolve, client or designer? *(high)*
2. **Day-counts are guilt, not information.** A 44-day-old proposal on a dormant-by-agreement job is fine; a 3-day-old
   unanswered mark-up before today's call is urgent. A number that only grows is engagement in a cardigan. *(high)*
3. **The "Presented / Approved / In Production / Installed" strip is a progress bar in disguise** — four labels to say
   one word, and its vocabulary doesn't match the seven sections (brief…care). Two stage languages on one page. Cut it.
   Likewise "1 · Client: Kody": an unlabeled counter reads as a badge. *(high)*
4. **The grid has no order,** so the most urgent job lands wherever it falls. The roster's value is that position
   encodes priority; an unordered grid hands that burden back to her eyes. *(high)*
5. **No card is actionable** — the sweep becomes sixteen round trips. Without a per-card act the card is a straight
   regression on the roster, whose per-row act is what makes the sweep possible at all. *(high)*
6. **A card fixes a real defect:** the roster's name link is a ~20–24px text link in a `py-2.5` row — the Desk's one
   sub-44px target (the act is correctly `min-h-[44px]`). A card's upper block gives it an honest 88px zone. The
   strongest functional argument *for* the card. *(high)*
7. Fifteen Playfair names at equal weight are fifteen competing headlines; in the roster they stack on one left edge
   and become a list. And one hairline can't separate warm paper on warm paper — the face needs `--paper-doc` on
   `--paper` *plus* the hairline, or the grid reads as graph paper. *(med-high)*

## 2. Recommendation

**Load-bearing ruling: cards are a treatment for *need*, not a container for a *job*.** Jobs with a need render as
cards; quiet jobs render as roster rows under a hairline rule labelled `AT REST — 9 JOBS`. The predicate already
exists: `filterRosterToNeeds` keeps `line.mark !== null`. At 16 jobs that's ~3 cards over 13 rows; at 45, ~6 over 39.
This is what survives density, and it settles the roster-vs-card fight without either side losing — the 2026-08-26 rule
holds for the body of the list; the card is the emphasis granted to a job with a claim on her.

Five registers, fixed order, always present, never folded:

| # | Register | Type | Grammar |
|---|---|---|---|
| 1 | **Custody** — 7px mark + one word | DM Mono 11 uc .08em | `YOUR PEN` · `WITH NORA` · `WITH THE MAKER` · `AT REST` |
| 2 | **Name** | Playfair 500 / 20px, wrap never truncate | "Cedar Lane Study" |
| 3 | **Client · phase** | Inter 14, `--ink-muted` | "Nora Ellison · Concept Development" |
| 4 | **The need**, 2 lines allowed | Inter 15, ink; `--ink-faint` at rest | "2 rooms awaiting your mark-up — Nora replied last night" |
| 5 | **One act**, never two | `DocumentAction`, DM Mono 13 uc | "REVIEW DECISIONS" |

Custody sits *above* the name: it's both the scan key and the sort key. Money joins register 4 in `.t-money` tabular —
"$17,500 overdue since 12 Aug" — amounts aligning down a column being a real win of the card form. **Copy ruling:
dates, not day-counts.** "Overdue since 4 Sep", never "44 days". A date is a fact; a growing counter is an accusation.

## 3. Shape

**Hit targets — reuse the recorded precedent.** `folder-card.tsx` solved this and wrote down why: the link is an
absolutely-positioned **sibling behind** the face, never a wrapper, because `<button>` inside `<a>` is an invalid
content model; the face is `pointer-events-none` and controls opt back in with `pointer-events-auto`. Adopt it with one
change: **scope the link to the upper block** (custody + name + client·phase, min 88px), not full-bleed. Full-bleed
makes a 200px box a navigation trap on a trackpad slip and blocks selecting the need sentence — she copies client names
into email. Beneath, the act is a **full-width 44px band** (≈280×44 at 3-col, not the 90×20 of the word's ink), ≥8px
clear above.

**Keyboard:** name-link → act → next card. Two stops, DOM order, no roving tabindex — the roster's shipped model. Mark,
client and phase aren't focusable. Keep `aria-label={label — name}`, or eleven cards all announce "Open the job".

**Focus — don't invent a ring for the act.** The name takes the roster's ring (`outline-2 offset-2 var(--color-clay)`)
drawn around the *whole upper block*, so focus reveals the click zone. The act keeps Scored Ink's deliberate
`outline: none` plus its `‸` proofreader caret and clay scores. Two focus languages is correct — it says which stop
she's on, without color.

**Hover/press — inherit `.row-wash`.** The Desk's hover is already the right zero-shadow answer: stage pigment sweeping
open as `clip-path: circle(0 → 150%)` from the exact pointer contact point (260ms), focus taking the same tint
instantly from centre; no text recolors, nothing moves. Apply it to the card face verbatim, keeping `.row-wash-score`
so the name's 1px rule scales in clay. The act keeps `.da-pool` — the 3.5px bead gathering under the finger, flooding
to 140% on press with its sanctioned `translateY(1px)`. **Card hover = a pigment wash; act hover = a gathering bead.**
One addition a card needs that a row doesn't: `.row-wash-score` fires on *row* hover, so hovering the act would also
underline the name — suppress it (`:has(.da-act:hover)`) so she never sees two lit targets.

**Order — by need, then custody, then date.** This **inverts the shipped sort**, which groups by fixed stage order
first. Stage-first is right for a roster, where the seven `<h3>` plates are headings she can skip, and wrong for a
grid, which has none — so stage-first scatters urgency across five rows of boxes. Not recency either: `updated_at` is a
feed, rewarding whichever job made noise and reshuffling all day, destroying the spatial memory that makes a grid worth
having. Fix one thing while here: `tier` is `0` only when *overdue*, so a non-overdue urgent need (damage claim,
declined proposal) never jumps the queue. Bands: designer-owned & overdue → designer-owned → client-owned & nudgeable →
maker-owned → at rest; oldest-first within a band; break ties on **name**, not `engagementId` (a UUID tiebreak is
stable but arbitrary). **The payoff: the top row of the grid is her morning.**

**Day's line and facets.** A coherence problem to fix first: `deriveDeskDayLine` selects by its own rule (oldest
overdue + newest lead + client-answered-within-24h) while the grid orders by another. Tolerable in a roster with stage
plates; in a grid, where position *is* the message, a line contradicting the first row means she trusts neither. Either
the line quotes the grid's first three, or it visibly says it's a different cut. Its `#roster-line-{id}` anchors need a
landing treatment — a jumped-to card should take the focus wash, or the jump lands invisibly mid-grid. **"Only what
needs me"** is worth more in a grid (16 → 3, one row) and should be the heavier facet, but stays off by default; the AT
REST rule does that work without hiding anything on first paint. **"By person" is a view, not a filter:** keep the
shipped person plates in `--doc-rail-stock` (people never take a stage pigment) and the constant labels (IX18).

**390px.** Single column, 16px margins, register order unchanged — the phone is the same card, narrower. The measured
roster fix is mandatory: `min-w-0 [overflow-wrap:anywhere]` on **both** name link and state paragraph, or one long name
sets the min-width (roster measured `scrollWidth 437/390` before, 390/390 after). Act band 48px, full width. Press
feedback becomes mandatory with no hover. At-rest jobs collapse to rows regardless of count.

**Three specimens:** Vandersteen (your pen, overdue, "OPEN THE SCHEDULE") · Halvorsen (with the client, "SEND
REMINDER", ledger-button variant) · Osterberg (at rest, no act).

## 4. Contract: honored and departed

- **D1** honored — no tabs or split view; watch the facets never harden into one.
- **D4** honored — depth is `--paper-doc` on `--paper` plus a hairline; motion is wash and bead, both existing, no new
  token. ⚠ The retired card's `rounded-[0_8px_8px_8px]` is **off-contract** (radii 2px/3px only) — inherit neither that
  radius nor its two translated depth sheets.
- **No badges / no red-green** honored — the only chroma is the 7px mark and the wash pigment. No status chip.
- **No engagement** honored and hardened — no unread counts, dots, "last active", dwell timers, streaks, percentages,
  progress bars, load animation, or recency-rewarding sort. The one permitted count is a quantity of *work* in a need
  sentence, never a quantity of attention.
- **"Never a card" (2026-08-26) — knowingly departed, narrowly.** Cards only where `mark !== null`, rows for the rest,
  nothing folded on first paint. Worth it because the need sentence wants two lines and the name wants a 44px target —
  neither of which a row gives without becoming a paragraph.
- **Standing discipline:** the card holds the row's information *plus one thing*. A sixth register means delete the card.

## 5. The risk I want Kody to rule on

**Does the Desk rank, or does it merely mark?** Need-ordering means Patina re-ranks Leah's studio every morning, and
the top-left card is us telling a designer what to care about first — a real claim on a surface promising "you won't
notice Patina." It costs more in a grid than a roster because position *is* the message: one stale due date puts a fine
job top-left flagged overdue and the instrument loses credibility in a glance. The safe alternative (stage order, as
shipped) is never wrong and never helpful. I'd rank, with the reason printed plainly on the card ("overdue since
4 Sep") so a wrong rank is legible and correctable rather than mysterious — but it's his call, it should be recorded as
a ruling, and every later Desk decision inherits it.
