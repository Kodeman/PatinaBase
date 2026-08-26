# Critique — Direction B, "The Shop Ticket" — feasibility lens

*Critic pass, adversarial, separate context from the author. Verified against
`main@695addb5f`, `docs/design/the-document/DECISIONS.md`,
`artifacts/document-wayfinding-directions-2026-08-25/research/{10-code-anatomy,11-canon-digest,31-verified-findings}.md/.json`,
and `source/instruments.md`. Every finding reported regardless of severity, per the review's
adversarial-review rule (no severity filter — Fable filters at synthesis).*

---

## C-BF-01 — §9's flag-on landing silently amends I139 and I141 without naming them

**Severity:** blocker · **Confidence:** 0.85

**Evidence.** Direction B's Amendment ledger (§7) names exactly two amendments: **B1** (amends
C8/I136, "The spine grows three blocks — ≥1440px only" — verified verbatim at
`DECISIONS.md:8435`) and **B2** (amends C14/I138, "the flag off is main's composition exactly" —
verified at `DECISIONS.md:8741`). But §9's "Flag on — the Worktable" section makes two more
deletions of ratified Worktable features, neither named in §7:

- *"the rooms rail is deleted, because `Rooms` is a ticket row on every table..."* — the rooms
  rail is one of **I139**'s four ratified Speccing-table tools: *"Fills W2's empty slots:
  rooms-rail, scheme, boards-strip, reach-in..."* (canon digest (C)). I139 is a ratified,
  shipped-GA entry (behind `worktable`), not a draft.
- *"the money seam is deleted, because the `Money` row is a truer version of the same
  compression..."* — the money seam is **I141**'s own ratified Delivery-table device: *"Money
  compresses to one scored seam line ('$X committed of $Y authority')... folded by declaration on
  the table, remembered on its own `money-table` key."* (canon digest (C)).

Both are structural deletions of named, ratified canon entries. Instruments.md §5's amendment
rule is binding and mechanical: *"a direction may amend ruled canon only by (a) naming the entry
by id and quoting the clause, (b) stating the trade... (c) stating the rollback. **Unnamed or
unpriced → rejected on sight, doctrine-cost score 1.**"* §7's Amendment ledger covers neither
I139 nor I141 — no quoted clause, no gain/give-up/rollback for either.

**What would fix it.** Add **B3** (amends I139: quote the rooms-rail sentence, state the trade —
gains a stable Rooms location across tables, gives up the Speccing table's dedicated rooms
instrument — and the rollback) and **B4** (amends I141: quote the money-seam sentence, same
form) to §7. Absent that, on the instruments.md rubric's axis 5 ("Doctrine cost") Direction B
is sitting on at least four amendments total, two of them currently unnamed — which the rule
reads as an automatic score of 1, not the "two named amendments" the direction currently presents.

---

## C-BF-02 — The item-reach table conflates "unreachable" with "⌘K-only, 2 acts" at 1280, inflating today's baseline badness

**Severity:** high · **Confidence:** 0.7

**Evidence.** §4's table marks **Boards**, **Documents — plans**, and **People** as "now
**unreachable**" at 1280 today. But anatomy §7's own reachability inventory — the source Direction
B says it draws act-counts from (§2: "Act counts are from the anatomy's own reachability inventory
(§7) for today") — lists these as **⌘K-only, 2 acts**, not unreachable:
`⌘K → "The plan room" | /doc/{engagementId}/plans | 2 | **⌘K-only**` (anatomy §7);
`⌘K → "Open the call sheet" | Call Sheet overlay | 2` (People's roster instrument aside).
`CommandBar` is mounted unconditionally in the `(document)` layout (`layout.tsx:75`) with no width
gate anywhere in anatomy's width-regime table (§5) — the only cited visibility problem is **F49**,
scoped explicitly to **390** ("No visible way to open ⌘K anywhere on a phone"), not 1280. At 1280
(a laptop tier, where every persona in the brief works from a laptop, not a touchscreen) the ⌘K
keyboard shortcut has no documented width gate, so these classes should read "2, ⌘K-only" at 1280
today, matching anatomy's own methodology, not "unreachable."

**Why it matters.** This isn't cosmetic — it feeds directly into the thesis's own falsifiability
claim (§1b: "if the install and care spreads still lose reach that the project spread has..., the
thesis is wrong") and into the judge rubric's axis 2 ("Findability ≤2 acts"). Overstating today's
1280 baseline as fully broken (rather than merely poor) makes Direction B's "now 1" fix look like a
bigger win than the evidence supports, and a verifier re-deriving the table from anatomy §7 directly
will find the mismatch.

**What would fix it.** Re-derive every 1280 cell in §4 from anatomy §7's literal act-count column,
distinguishing "unreachable" (no path exists, e.g. Call sheet from `/desk`) from "2, ⌘K-only."

---

## C-BF-03 — The direction's own row count contradicts itself: "seven" vs. "eight" vs. "nine"

**Severity:** medium · **Confidence:** 0.75

**Evidence.** The name, thesis, and title all commit to **seven**: §0 "one band under the
letterhead, **seven rows**"; §1 thesis "the **seven** things a designer reaches for (rooms · pieces
· drawings · boards · money · dates · people)" — that list has exactly seven nouns, and **spec
book is not one of them**. But §2.2's actual ticket table lists **eight** rows (Rooms, Pieces,
Drawings, **Spec**, Boards, Money, Dates, People), every mock (M2/M3/M5) draws all eight, and §9
says outright: *"the ticket itself — **same eight lines**, same values, same doors."* §4's
item-reach table then further splits **nine** distinct reach paths (Rooms, Products, — its spec
attributes, Boards, Documents—plans, Documents—spec book, Money, Schedule, People).

**Why it matters.** Instruments.md §6's falsifiability test for a direction rests on covering the
stated classes cleanly; a judge or a future implementer working from the thesis's "seven things" as
the spec will build a seven-row ticket and miss Spec entirely, or will notice the thesis undercounts
its own deliverable and discount the document's rigor on axis 1.

**What would fix it.** Either fold `Spec` into `Drawings` as one `Documents` row (matching
instruments.md §6's own item-reach class list — "documents (plans/spec book)" is one class there)
and keep "seven" true throughout, or fix the thesis/title prose to say "eight" and update §1's
falsifiability list to include spec book explicitly.

---

## C-BF-04 — Which tasks the ticket-mounting change actually moves is stated two different ways

**Severity:** medium · **Confidence:** 0.6

**Evidence.** §4's "Install and care, explicitly" paragraph: *"Under Direction B the ticket is
mounted by the document, not the section... That single change moves **T6 (2.58), T13 (2.78) and
T14 (2.78)** off the floor."* §7's Amendment ledger, B1 "Gains": *"closing F01, F14, F48, F60, F72
and half of F82, and moving three of the five worst tasks (**T5 2.50, T6 2.58, T14 2.78**)."* The
two lists disagree on the third task — T13 in one place, T5 in the other — for what is claimed to
be the same underlying change.

**What would fix it.** Reconcile: name the same three (or explain why the sets differ — e.g. T5 is
moved by the ticket generally, T13 specifically by the install/care mount fix), and cite consistent
figures.

---

## C-BF-05 — "No migration, every value already read" is false for the new receivable row

**Severity:** medium-high · **Confidence:** 0.6

**Evidence.** §7 Costs table's closing line: *"No migration, no data-model change; **every ticket
value is already read by the spine blocks or the region heads.**"* §8 First slice: *"the derivation
is a re-read of values `spine-shelved-blocks.tsx:103–150` already computes."* But the ticket's
`Money` row in every mock carries a receivable that neither of those sources produces: M2 draws
`Money    $141,600 ordered · $17,500 owed you, 22 days · $12,300 deposit not drawn`. Anatomy §6.2
gives the *only* money value the spine currently reads: `Reading…` / `Authority unread` /
`{$} authorized` / `No authority yet` (`spine-shelved-blocks.tsx:109–115`) — no invoice-age or
receivable figure. Anatomy §6.3's `money-region.tsx` rows are `Authority` / `Plan` / `Committed` /
`Moved` (`:308–336`) — again no receivable row; F16 itself is the finding that this figure is
**unanswerable inside the document today** (`known-open:I141`). Direction B is right that this is
fair game (I141's known-open, no amendment needed) — but it cannot simultaneously be "already read"
by the existing region heads and be the fix for a finding whose entire premise is that no existing
surface reads it. This is new query wiring into Accounts/invoice data, not a re-read.

**What would fix it.** Either scope the receivable row out of the 8-day first slice (ship it as a
wave-two addition once the query exists) or price the new data dependency explicitly in §8's
estimate and Files list.

---

## C-BF-06 — The 8-working-day first-slice estimate looks tight against its own described scope

**Severity:** medium · **Confidence:** 0.55

**Evidence.** §8 estimates 8 working days for: a new organ + derivation, deleting two spine blocks,
ungating the shelves' ≥1440 constraint, and — per the Costs table — giving `shelf-panel.tsx:94` "a
below-1440 route mode" it does not have today (anatomy §3.3: the leaf is `hidden … min-[1440px]:block`
and force-closed below 1440 with no alternate route mode described anywhere in the anatomy), removing
the force-close-on-resize logic (`page.tsx:553–562`), and — most substantively — making
`room-lens-context.tsx` work below 1440 for the first time. C8/I136 states this has never existed:
*"The hold releases if the window drops below 1440px, where nothing on screen could put it down"*
(`DECISIONS.md:8462-ish`). Building a first-ever sub-1440 room lens (plus the new receivable query
from C-BF-05) inside 8 days, alongside a new derivation module and component, is optimistic; the
estimate's own justification ("the derivation is a re-read of values already computes") is the part
C-BF-05 shows is not fully true.

**What would fix it.** State the below-1440 lens work and the receivable query as their own
estimated line items rather than folding them into "one component, one flag, one width rule."

---

## C-BF-07 — B2's own amendment may be self-inflicted, not structurally required

**Severity:** low · **Confidence:** 0.4

**Evidence.** B2 amends C14/I138 "conditionally": *"This binds only if Kody reads that clause as a
standing guarantee about *any* future flag rather than a statement about `worktable` at I138."*
`job-ticket` is declared as its own, separate, fail-closed flag (§7 Costs: "One new fail-closed
flag, `job-ticket`"). Nothing in I138's quoted clause ("the flag off is main's composition exactly")
is about the `worktable` flag's own byte-identity, not a freeze on shipping any other feature ahead
of Kody's still-owed worktable walk. By naming this amendment defensively, Direction B may be
inflating its own doctrine-cost count on the judge rubric's axis 5 beyond what the mechanism
actually requires — worth Kody's explicit read rather than assumed as a live conflict.

**What would fix it.** Either drop B2 if `job-ticket` genuinely doesn't touch `worktable`'s
byte-identity guarantee, or keep it but make the "conditional" framing sharper about exactly which
future-Kody-reading it's hedging against.

---

## C-BF-08 — Worst-off persona: P4 (FF&E/procurement-heavy), on the spec-attribute exception

**Severity:** medium · **Confidence:** 0.55

**Evidence.** Instruments.md's P4 brief: *"Tolerance medium; **rejects any composition that
separates a piece from its PO state.**"* Direction B's own declared exception #1 (§4): *"Spec
attributes of one FF&E line = 3 acts at every tier (`Ticket › Pieces` → line unfold → `Edit spec
details →`)."* Today, at ≥1440, the FF&E region's own line unfold already carries PO/movement/
receiving state directly (anatomy: "The FF&E line unfolds on the paper for PO, movement, receiving
and room assignment" — F57), so a designer reading a line's PO state is at most one region-level
unfold away. Under Direction B the `Pieces` ticket row is a rolled-up exceptions summary
("`Pieces` leads with exceptions") that is a layer *above* the FF&E region rather than a
replacement for it — the FF&E region itself is untouched (§2.2: "REGIONS — ... mount order
unchanged, C11"). P4's install-day-minus-10 reconciliation (checking every line's PO state against
receiving) is not obviously faster reading a rolled-up ticket row plus the same unchanged FF&E
region below it; it may in fact add a decision ("do I read the ticket's exceptions or scroll to the
region?") that a persona this specifically intolerant of split piece/PO views would resent.

**What would fix it.** State explicitly whether the Pieces ticket row is meant to *replace* a
glance at the FF&E region for P4's workflow, or is purely a summary — and if the latter, name that
as a declared cost against P4 rather than leaving it implicit.

---

## C-BF-09 — Distinct-by-construction check

**Result: distinct by construction. Not "A plus more."**

Direction A works entirely inside the existing surfaces (composition, mount order, labels, leader
election, guide precedence) and adds zero new components — it is explicit that it changes "no
structure." Direction B introduces a genuinely new organ (`job-ticket.tsx` + `ticket-derivation.ts`)
that relocates data out of the shelved spine into the paper itself, deletes two existing spine
blocks (`spine-rooms-block.tsx`, `spine-shelves-block.tsx`), and changes width-availability rules
that have held since I136 (below-1440 room lens, below-1440 shelf access). These are different
information-architecture bets, not an incremental superset of A's moves. A reader would not call B
"A plus more" — B removes furniture A leaves standing and adds furniture A never proposes.

---

## Summary table

| id | severity | confidence | title |
|---|---|---|---|
| C-BF-01 | blocker | 0.85 | §9 flag-on deletes I139's rooms rail and I141's money seam — both unnamed amendments |
| C-BF-02 | high | 0.70 | Item-reach table marks 1280 as "unreachable" where anatomy shows ⌘K-only, 2 acts |
| C-BF-03 | medium | 0.75 | Row count contradicts itself: "seven" (thesis) vs. "eight" (§9) vs. "nine" (§4 table) |
| C-BF-04 | medium | 0.60 | Which three tasks the ticket-mount fix moves is stated inconsistently (T13 vs. T5) |
| C-BF-05 | medium-high | 0.60 | "No migration, already read" is false for the new receivable/`Owed you` row |
| C-BF-06 | medium | 0.55 | 8-day estimate under-prices the first-ever below-1440 room lens + new query wiring |
| C-BF-07 | low | 0.40 | B2's amendment may be self-inflicted / not structurally required |
| C-BF-08 | medium | 0.55 | Worst-off persona P4 — spec-attribute exception adds a layer between piece and PO state |
| C-BF-09 | — | — | Distinct-by-construction: yes, confirmed |

**Worst-off persona overall: P4** (FF&E/procurement-heavy) — see C-BF-08.
