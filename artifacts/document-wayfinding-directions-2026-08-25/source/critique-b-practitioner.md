# Critique — Direction B, practitioner lens (P1–P4 seats)

*The Document — Wayfinding Review · 2026-08-25 · reviewer role: CRITIC on Direction B*
*Verified against `main@695addb5f`; sources: `source/direction-b.md`, `source/direction-a.md`,
`source/instruments.md` §2/§5/§8, `research/30-collated-findings.md`, `research/26-panel-p2.md`,
`research/27-panel-p3.md`, `research/28-panel-p4.md`, `research/25-panel-p1.md`.*

Findings are numbered C-BP-01…C-BP-09, most-material first. No severity filter applied.

---

## C-BP-01 — The room lens is extended below 1440 without a named amendment

**Severity:** blocker · **Confidence:** 0.75

C8 bundles two separate clauses under one id: *(a)* "index/rooms/shelves ≥1440 only" and *(b)*
"room lens lifts, never filters" (`instruments.md` §5, C8: `I136 (:8427ff), errata (:8543)`).
30-collated keeps them distinct — F60's `already_ruled` reads "C8 (room lens is part of the
shelved-spine ≥1440 restriction)", cited on its own row, separately from F01/F14's citations of the
mount-gate clause.

Direction B's amendment B1 quotes only the mount-gate clause — *"The spine grows three blocks —
≥1440px only"* — and prices giving up "the shelved spine as an organ." It says nothing about the
lens. Yet the direction's own item-reach table claims the lens now works everywhere: "Rooms ... now
1280 unreachable (F60) · **B: 1**" and "390 ... chip lifts" (§4), and §6 M2 states plainly:
"clicking one lifts it across FF&E, the spec leaf and the boards leaf... (C8's lens doctrine,
**unchanged**)" — while §7 Keeps says the opposite in the same document: "The room lens that lifts
and never filters — C8's lens clause, **extended** to two more widths."

Those two sentences cannot both be true. If the lens is "unchanged," F60 is not closed and the
coverage table's claim of "the lens moves to the ticket's room chips and works at every width" (row
F60, §10) is false. If the lens is "extended," that is a second doctrine change riding on B1's
ticket, and per the binding amendment rule (`instruments.md` §5: "a direction may amend ruled canon
only by (a) naming the entry by id and quoting the clause... Unnamed or unpriced → rejected on
sight, doctrine-cost score 1") it needs its own id, quote, trade and rollback. It has none. A judge
scoring axis 5 (doctrine cost) mechanically, as the rubric instructs, either finds a second unnamed
amendment (score 1, not the "one named amendment" B is banking on) or finds F60 unaddressed
(contradicting §10's own coverage claim).

**What would fix it:** either (a) name a B3 amendment against C8's lens clause specifically, with
its own quote/trade/rollback, or (b) drop the "chip lifts below 1440" claim from §4/§6/§7 and mark
F60 as an unfixed declared exception, the way Direction A does (§4 exception 2: "The room lens below
1440 = unavailable... No filter is added").

---

## C-BP-02 — `Pieces` is an unlexiconed fourth name for the thing F17 exists to fix

**Severity:** high · **Confidence:** 0.75

F17 ("Three different things are called a `room`") is exactly the class of finding B's lexicon
table (§5) exists to close, and B closes the room case cleanly (`Scans` / `Rooms` / `Drawings`, one
noun each). But the ticket introduces a brand-new noun, `Pieces`, for the FF&E line-item class —
and §5's lexicon table has no row for it. Read the mock at §6 M2: the ticket prints

```
Pieces     29 ordered · 6 delivered · 2 in transit · 1 damaged · 2 unspecified        →
```

five paper-inches above the region it summarizes, which prints its own, different name on the same
screen:

```
5. Regions ... `Project · FF&E` — head `4 groups · 36 lines · 2 awaiting authorization`
```

That is two names for one class of thing, printed on the same paper, in the same mock, in a
direction whose whole content-design plank is "recognition, never recall" for P3
(`instruments.md` §2: "Expects a list of what I'm supposed to do in school words... furniture
schedule"). P3's special assignment is to list every label she can't define from the word alone,
starting with `Design authority` and `Project · FF&E` — B answers the first and, unannounced,
adds a second unglossed noun for the second. Direction A does not introduce this new noun; its
item-reach table and mocks keep `Project · FF&E` as the one name throughout (`direction-a.md` §4,
§6 M2).

**What would fix it:** either give the ticket row the same name as the region (`Project · FF&E`,
accepting the wider label) or add `Pieces` to §5's lexicon table with a stated rationale and confirm
the region head is renamed to match — one name, not two, per C20.

---

## C-BP-03 — The first slice does not ship what the thesis and coverage table imply

**Severity:** high · **Confidence:** 0.6

§8 First Slice is explicit: "Ship the ticket on `project` and `install` documents only... Nothing
else... those are waves two and three." Care-stage documents are excluded from day-8 delivery.

But F14 — the finding B leans on hardest — is stated in 30-collated as vanishing "on install **and
care** documents" (F14, tasks T4 T5 T6 T13 T14 T15), and B's own §1 falsifiability test (b) reads:
"if the install **and care** spreads still lose reach that the project spread has (F14, F48), the
thesis is wrong." §10's coverage table then marks F14 "blocker | §4, §6 M5 — the ticket is mounted
by the document, not the section" with no caveat that this is a wave-two/three claim, not a
first-slice one. A reader or judge scoring axis 6 ("ships in days, moves a metric, valuable alone")
who reads §1's thesis and §10's coverage table without cross-checking §8 will believe the
care-stage fix ships in the 8-day slice. It does not — a designer standing in a closed-out care
document on day 9 still has no map, exactly as today, and Okonkwo's own care-stage document (the
Vandersteen job's eventual future state) is nowhere in the first-slice mocks (M5 draws `install`,
not `care`).

**What would fix it:** state in §8 (not just implicitly, via omission) that the F14 fix is partial
at first-slice and complete only by wave three; or, if care can ship alongside install at
negligible extra cost (the direction's own claim is that install/care are handled by one shared
mount condition, `engagement_kind === 'project'` with no `active_section` gate — §9's flag-off text
says the gate is removed entirely, which would seem to cover care for free), then say so and correct
§8 to include it. The current draft is internally inconsistent about which is true.

---

## C-BP-04 — P2's actual T9/oversight question is not answered by the Desk roster

**Severity:** medium · **Confidence:** 0.65

P2's special assignment (`instruments.md` §2) is "strict one-document focus (D1) meets an oversight
job — say where it costs her and what, unsoftened," and her own panel walk (`26-panel-p2.md` §
"Special assignment") names the actual Monday question precisely: *"what changed since Friday,
across all eleven, that I haven't been told needs me yet"* — distinct from "who's in install," and
her T9 line: *"Studio Pulse gives counts, never totals"* for "who still owes me."

Direction B's Desk roster (§2.1, §6 M1) answers T2 well — stage headings replace the phase-wide
`No match` — but the roster's job lines carry state and need text, not dollar figures, except where
an overdue item happens to mention a price (Byrne's `$9,400 · four milestones`). Nowhere does the
roster, or anything else in B, print a fleet total for "who still owes me" or a "since Friday"
delta across jobs. B's own coverage table does not claim to close F16 at the Desk level — F16 is
addressed "§6 M2 — a fifth money rung... `Owed you`... **and the ticket's `Money` row**" (§10), i.e.
per-document, not fleet-wide — so this is not a broken promise, but it is a persona left no better
off on the specific test the review instrument assigns her, in a direction that otherwise leans
hard on "this restructures the Desk to answer the phase-wide question." A direction that rebuilds
the Desk from a folio grid into a stage-grouped roster and does not use that occasion to put a
receivables figure on the line is a missed opportunity the deck should name, not omit.

**What would fix it:** either add a per-job `$ owed` or `$ moved since Friday` figure to the roster
line (a derived value the money region already computes, per B's own "Costs" table note that ticket
values are "already read by the spine blocks or the region heads") or explicitly log this as a
declared gap in §7/§10 the way F53 and F58 are logged.

---

## C-BP-05 — B2 is a conditional amendment, which the doctrine-cost rubric does not reward cleanly

**Severity:** medium · **Confidence:** 0.55

B2 (§7) is framed as "conditional, and pre-priced": *"This binds only if Kody reads that clause as
a standing guarantee about any future flag rather than a statement about `worktable` at I138."*
That is a genuine attempt at honesty, but it leaves B's doctrine-cost score indeterminate at
judging time. The rubric (`instruments.md` §7, axis 5) rewards "One named amendment with trade +
rollback" at a 6 and "Zero — or one that closes a known-open item" at a 9; a conditional amendment
whose bindingness depends on an interpretation Kody has not yet given sits outside both bands. If
J2 reads C14's clause the way B2's hedge worries about, B carries two priced amendments (B1 + B2)
rather than one, and the "8 working days" estimate in §8 (which assumes B2 need not resolve before
shipping) becomes contingent on a ruling the deck cannot control. Direction A carries zero
amendments and needs no such hedge.

**What would fix it:** either resolve the ambiguity before publishing (ask Kody the narrow question
B2 poses) or fold B2's cost fully into the headline doctrine-cost accounting rather than presenting
it as a footnote that might not apply.

---

## C-BP-06 — The 390 ticket seam line is the densest line in the deck with no wrap rule stated

**Severity:** medium · **Confidence:** 0.5

§6 M4 specifies the folded ticket at 390 as one scored line:

> `THE JOB · PROJECT · Procurement & Orders 4 of 6 · 1 damaged · $17,500 owed you   UNFOLD ↓`

That is job identity, section, phase-fraction, a damage count, a dollar figure and an act glyph, all
on one line at the narrowest tier the deck draws. The same M4 section explicitly claims to have
fixed a related but smaller problem — F87, region status truncating mid-word (§10: "Region status
text no longer truncates mid-word... wraps") — yet gives the ticket's own seam, which is denser than
any region status string in the deck, no wrap or truncation treatment at all. Compare the FF&E head
fix two lines later in the same mock, which gets an explicit multi-line layout rule ("line 1... line
2... line 3, wrapped"); the ticket seam gets none. This is the one line in the whole surface that
must always be legible at 390 (it is the map, per the direction's own thesis), and it is the one
line left unspecified.

**What would fix it:** state the wrap/truncation rule for the folded ticket seam explicitly, the way
M4 does for the FF&E head.

---

## C-BP-07 — A fourth element on the 390 mobile bar risks the crowding Direction A avoided

**Severity:** medium · **Confidence:** 0.5

§6 M4: "Between the context word and the centre act sits a new `⌘K`/`FIND` glyph button, 44×44 —
the first visible way to open the command bar on a phone (F49)." That puts four things on the
primary mobile bar: the context word (`IN THIS DOCUMENT / Project`), the new 44×44 ⌘K glyph, the
centre act (which can itself be a long string — B's own §6 M2 example is `SEND A REMINDER`, but the
tie-break table in §3.3 shows acts like `CHASE THE PO` and headlines running a full sentence), and
the `···  MORE` control. Direction A places the identical fix (F49) inside the `More` menu instead
— "`Find anything ⌘K`... **F49 blocker**" listed as a `More` row, not a bar element
(`direction-a.md` §2.2, §6 M4) — specifically because the mobile bar is the one place I135's
one-leader-per-region contract (C7) is enforced hardest and 44×44 discipline (C4/C6) leaves little
width to spare at 390px. B does not explain why it chose the more crowded option, and does not draw
the bar at full width with real string lengths to show it fits.

**What would fix it:** either show the composed bar at 390 with the longest real act label from §3.3
to demonstrate it fits, or move the ⌘K glyph into the `More` menu as Direction A does and drop the
"first visible way" framing (it would then be "first *reachable* way," matching A's own claim).

---

## C-BP-08 — "Zero acts" for T2 is untested at P2's actual scale

**Severity:** low · **Confidence:** 0.45

§0/§2.1 claims the stage-grouped Desk roster answers T2 "at zero acts." That is true by the
deck's own definition (no click required), but P2's persona brief states her studio carries *eleven*
live jobs, not the specimen's six (`instruments.md` §2: "eleven live jobs"; `26-panel-p2.md`: "my
eleven jobs" used throughout). Every mock in §6 draws the six-job Vandersteen fixture. At eleven
jobs, several stage groups (`PROJECT`, plausibly `INSTALL`) could hold three or four jobs each,
each printed as the multi-line format shown in M1 (need line + red-letter mark + act, per job). The
deck never demonstrates the roster at that density, so "zero acts, and it stays scannable" is
asserted for P2's persona but only drawn for a smaller studio. Given P2's own stated tolerance
("low-to-medium... will not tolerate asking a junior where something is" — a proxy for "will not
tolerate a slow scan either"), this is worth flagging as unverified at her actual scale, though it
is plausible the design holds up.

**What would fix it:** draw or at least describe M1 at eleven jobs with three in one stage group, to
show the format survives P2's real density, not just the specimen's.

---

## C-BP-09 — P4's worst friction (F58, `RECEIVED` vs `DELIVERED`) survives Direction B unchanged

**Severity:** low · **Confidence:** 0.6

P4's persona brief (`instruments.md` §2) states she "rejects any composition that separates a piece
from its PO state" — and the review's own F58 finding is exactly that: "The same FF&E line reads
`RECEIVED` on paper and `DELIVERED` in the spec book" (30-collated, seat P4). Direction B names this
directly in its declared exceptions (§4, exception 1: *"Two editable homes for one attribute is how
`RECEIVED` and `DELIVERED` came to disagree... One editable home, one visible route"*) — sounding
like a fix — but then defers it in §7 Refuses ("A second editable home for spec attributes (F58's
lesson)" is refused, meaning nothing *changes*, not that duplication is closed) and again in §10
("F58 | high | **deferred**"). This is consistent with Direction A, which defers F58 for the same
reason (`direction-a.md` §10: "Deferred — `RECEIVED` vs `DELIVERED` may be two true states..."). The
finding here is not that B is wrong to defer it — both directions correctly defer a data-model
question — but that B's own §4 prose ("One editable home, one visible route") reads as a present-
tense claim of resolution where §10 says "deferred," a wording inconsistency worth tightening so a
judge does not credit B with closing F58 by mistake.

**What would fix it:** rephrase §4's exception-1 prose from "One editable home, one visible route
[is what we get]" to "...is what a future data-model ruling should buy" to match §10's honest
"deferred."

---

## Cross-cutting answers

**Does a Tuesday actually get better, for whom, by how much?** Yes, materially, for the two personas
the direction targets hardest: P1 (Leah — the specimen's own subject; install-week reach on the
Okonkwo/Vandersteen documents genuinely goes from "unreachable at every width" to "one act, three
widths," which is the single largest concrete gain in either direction) and P3 (the ticket's plain
rows plus the roster's stage headings give a junior a vocabulary she can act on without asking).
P2 gets a real but partial win — T2 (phase-wide "who's in install") is solved cleanly by the
stage-grouped roster — but her stated Monday question is broader than T2 (see C-BP-04), and that
broader form is not addressed. P4's worst-named friction (F58) is explicitly deferred, identically
to Direction A, so she is no better and no worse off than under A on that specific complaint; her
spec-attribute reach stays a declared 3-act exception in both directions.

**Which of the five worst tasks stay bad?** T2 (1.50) — fixed, cleanly, by the roster. T6 (2.58) and
T14 (2.78) — fixed for `project` and `install` documents in the first slice, per §8; the deck's own
text is internally inconsistent about whether `care` documents are covered at first-slice time
(C-BP-03), so T13's care-adjacent form and T14's care-stage form (punch list / closeout) are not
provably fixed on day 8, only eventually. T5 (2.50, `direction` and `project` sections) is **not**
in the first slice's scope (`project` and `install` only) — a designer on a `direction`-stage
document still cannot reach a mood board below 1440 or via any door but ⌘K until wave two ships,
which the deck's headline claims ("moving three of the five worst tasks") do not flag as
first-slice-partial.

**Is Direction B distinct by construction from Direction A?** Yes. The two use structurally
different mechanisms to answer the same findings: A relocates existing doors to the bodies they
already act on and adds no new organ, no new mount condition beyond a section gate removed, and
zero amendments; B deletes two existing spine organs, invents a new one (`job-ticket.tsx` +
`ticket-derivation.ts`), rebuilds the Desk from a folio grid into a stage-grouped roster, and prices
one confirmed and one conditional doctrine amendment. A reader could not mistake B's mocks for "A
plus a few more strings" — the IA shape, the Desk composition, and the risk/cost profile all differ.
The overlap that exists (shared planks: SP-01…SP-20, most lexicon renames) is exactly the overlap
the review instrument mandates ("Shared planks... adopted identically by both lanes," `instruments.md`
§6) and does not erode distinctness.

**Worst-off persona under Direction B:** **P2.** Every other persona gets a clear, named win (P1 and
P3 the largest; P4 unchanged from today, which is at least not worse). P2's defining test — fleet
oversight under D1 — gets a genuine partial fix (T2) but the direction spends its one structural
rebuild of the Desk (the roster) without extending it to the other half of her own stated Monday
question (money, "what changed"), and does not name that gap in §7 or §10 the way it names F53 and
F58. She is not made worse off by B, but she is the persona whose own named test the direction
comes closest to answering and still leaves half-open without saying so.

## Report path

`/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/source/critique-b-practitioner.md`
