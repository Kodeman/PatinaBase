# Critique — Direction A ("Everything Prints"), feasibility lens

*Critic: Sonnet · reviewing `source/direction-a.md` against `apps/designer-portal/CLAUDE.md`,
`research/10-code-anatomy.md`, `research/11-canon-digest.md`, `source/instruments.md` §5, and the
live tree at `main@695addb5f`. Every finding below was checked against the actual file, not just
the anatomy doc's citation of it, unless stated otherwise.*

No finding below disputes the direction's central move (print what already exists where the body
acts on it) or its doctrine discipline, which is real and mostly holds up — see the closing note.
The findings are about specific costed moves whose engineering surface is under-stated, one claim
that is asserted but not actually delivered by any move in the document, and the unmethodved
obviousness-score arithmetic the thesis rests on.

---

## C-AF-01 — F51's "join Begin" is costed as a string change; the code says it isn't one

**Severity: high · Confidence: 0.92**

**Direction A's claim (§2.1, §7):** `Open the Drafting Room` "joins Begin" in Desk Contents
(`desk-contents.tsx`), listed under **Lexicon pass** in the Costs table as "strings only," and
§10 glosses it "R95-safe: a label and a doorway."

**What the code says.** `desk-contents.tsx:136–138`:

```ts
// Global rooms only — the document-scoped Drafting Room is excluded (it has no
// standalone doorway without a proposal in hand).
const rooms = STUDIO_ROOMS.filter((room) => room.scope === 'global');
```

The Begin column is built from `STUDIO_VERBS` (`registry.tsx:252–327`), and `drafting-room` is
not in that array — it lives in `STUDIO_ROOMS` with `scope: 'document'`
(`registry.tsx:120–133`), whose only working destination is `/drafting/{proposalId}`
(`registry.tsx:130`; `command-bar.tsx:374`). ⌘K's own Drafting Room row only works today because
`command-bar.tsx:371–375` runs a fallback: open the in-hand draft if one exists, **else open
`openDraftProposalPicker()`** — a stateful chooser, not a static route. Desk Contents has no
concept of "the draft in hand" (there is no document open on `/desk`) and no wiring to
`openDraftProposalPicker`; every other Begin row (`draft-proposal`, `draw-invoice`, `add-maker`)
resolves through a static `verbHandlers` map (`desk-contents.tsx:159–165`) that assumes no id is
needed. Making `Open the Drafting Room` land correctly from the Desk means porting ⌘K's
fallback-picker logic into `desk-contents.tsx` (or promoting `drafting-room` into `STUDIO_VERBS`
with a new opener) — the exact functional wiring the inline comment says was deliberately left
out. Direction A's Costs table lists no file for this at all; it appears only in the "Lexicon
pass" row, which is strings-only by its own description.

**What would fix it:** add a `driveOpenDraftingRoom()` helper (reusing
`openDraftProposalPicker`/in-hand-draft logic from `command-bar.tsx:371–375`) to the Costs table
as its own line, separate from the lexicon pass, and drop "a label and a doorway" from the §10
gloss — it is a doorway with new logic behind it.

---

## C-AF-02 — F04's ⌘K stage-word group is a new aggregation, not a "match table" entry

**Severity: medium · Confidence: 0.7**

**Direction A's claim (§2.1 Costs table):** "⌘K stage answer, paired document-scoped rows, group
order, plan-room/spec-book registry rows | `command-bar.tsx:340–680`, `registry.tsx:77–351` |
**match table + two registry entries**."

**What's actually being asked for.** `STUDIO_ROOMS`/`STUDIO_LEDGERS`/`STUDIO_VERBS` are small,
fixed, hand-authored arrays (`registry.tsx:77–327`) matched by `matchSurfaces(query)`
(`registry.tsx:344–351`) — a label+alias substring match against a **static list of surfaces**,
never against the studio's live documents. Typing `install` and getting back `group **In install ·
1**` (F04's fix) requires scanning the studio's *entire live engagement set*, grouping by
`active_section`, and counting/labelling per group — a different kind of operation than anything
`matchSurfaces` does today.

The good news, found by checking rather than assuming: the data is already loaded. ⌘K already
imports `useDeskEngagements` (`command-bar.tsx:32, 180`) and builds `liveDocs` from
`data?.folders`/`data?.chips` (`command-bar.tsx:282–283`) for its `Recent` group — so the raw rows
(each carrying `active_section: SectionKey`, `desk-derivation.ts:55`) are present in memory. The
move is therefore feasible without a new query. But it is still new derivation code — a
group-by-stage reducer over `liveDocs`, wired into the results list alongside the registry match —
not an addition to the registry's match table. Direction A's cost line conflates two different
mechanisms (a static-surface matcher and a live-document grouper) under one estimate.

**What would fix it:** split the Costs-table row into "registry: plan-room/spec-book rows" (true
match-table work) and "stage-word grouping: new reducer over `useDeskEngagements` data, wired into
`command-bar.tsx`'s results builder" (new derivation, same file, but a different shape of work).

---

## C-AF-03 — The FF&E leader election (F34/F08) is costed as a comparator; it needs cross-line scanning + targeted scroll/unfold

**Severity: medium · Confidence: 0.6**

**Direction A's claim (§3, §7):** "FF&E leader election + <1180 head recomposition |
`ffe-section.tsx:971–1021, 1116–1125` | **ordering function + one layout rule**."

Today the FF&E ledger's index-0 slot is a two-way choice: `releaseInHead ? ffeReleaseEntry :
ffeAddToProjectEntry` (`ffe-section.tsx:1013–1021`) — a boolean flag already computed elsewhere
and threaded in as a prop. Direction A's M2/M5 mocks elect `FILE THE CLAIM` as the leader instead,
routed to "the FF&E line's PO detail" / the specific damaged line's unfold state — i.e., the leader
is no longer a fixed choice between two region-level acts, it is now conditioned on **whether any
one of this project's FF&E lines carries a live `damage_claim`/`awaiting_inspection` or
`po_unacknowledged` state**, and its `onClick` must scroll to and unfold *that specific row*, not
open a region-level sheet. That is new logic in two parts: (a) a needs-scan across the project's
FF&E rows to find the sharpest live exception (comparable in shape to
`document-guide-inputs.ts:93–104`'s per-row need derivation, which Direction A does not cite as
reused here), and (b) new click-to-target plumbing — `highlightLineId` already exists as a prop on
`FFESection` (used for margin-item/guide anchors) and could plausibly be reused, but Direction A's
Costs table names neither the needs-scan function nor the highlight-targeting reuse; "ordering
function" undersells (a) and doesn't mention (b) at all.

**What would fix it:** name the needs-scan source explicitly (reuse or parallel
`document-guide-inputs.ts`'s per-row derivation) and confirm `highlightLineId` is the intended
targeting mechanism for the elected leader's click — or budget a new one.

---

## C-AF-04 — F48's cited fix location is not the actual guard (line-citation error, inherited)

**Severity: low · Confidence: 0.9**

**Direction A's claim (§7 Costs, §8 files):** "`Spec book →` ungated | `ffe-section.tsx:1009–1015`
| remove a mode guard."

At `main@695addb5f`, `ffe-section.tsx:1009–1015` is the **unconditional** `ffeSpecBookEntry` object
literal (`label: 'Spec book', href: .../spec-book, ...`) — there is no guard there to remove. The
actual guard that hides the Spec book link on install documents is a *second*, independently
rendered `Spec book →` link at `ffe-section.tsx:1058–1063`:

```tsx
{mode === 'project' && (
  <Link href={`/doc/${projectId}/spec-book`} ...>Spec book →</Link>
)}
```

nested inside the `mode === 'install' || selecting` branch (`:1031`) — the branch that owns the
heading text and ledger for install-mode documents. Because that whole branch only ever runs when
`mode === 'install'` (excluding the `selecting` case), the inner `mode === 'project'` check inside
it is always false in the reachable path, and the link never prints on install (confirmed by
tracing both branches; matches F48's claim). Deleting that one inner condition **is** a one-line
fix and does what Direction A wants — the move itself is sound — but it sits ~50 lines from where
the direction and the underlying anatomy doc (`10-code-anatomy.md`, same citation) both point.
Since Direction A inherits its own citation from that doc without re-verifying it against the live
tree, an implementer handed this brief would go looking in the wrong place first.

**What would fix it:** re-cite `ffe-section.tsx:1058–1063`, and note the object literal at
`:1009–1015` is unrelated (it is the ledger entry used by the *other*, already-unconditional,
project-mode branch at `:1116–1125`).

---

## C-AF-05 — SP-01 (care head stops saying "Install") is asserted but never budgeted

**Severity: low · Confidence: 0.85**

Direction A states in §4 ("the care head stops calling itself `Install`") and lists SP-01 among
"addressed" findings in §10, and includes it in the first slice (§8, item 2). But no file appears
for it anywhere in §7's Costs table, and §8's file list (`document-guide.ts`, `page.tsx`,
`ffe-section.tsx` "one guard," `red-letter-zone.tsx`, `command-bar.tsx`) doesn't separately name
the change SP-01 needs.

Checked against the code: `FFESectionProps.mode: 'project' | 'install'` (`ffe-section.tsx:640`) —
there is no `'care'` value. `page.tsx:1429–1445` invokes `<FFESection ... mode="install"
sectionKey="care" .../>` for care documents — the heading ternary at `ffe-section.tsx:1036–1038`
(`mode === 'install' ? 'Install' : 'Project · FF&E'`) reads `mode`, not `sectionKey`, so a care
document's FF&E head literally prints `Install` today (this is the bug SP-01 names). The fix is
small — `sectionKey` is already threaded as a prop, so switching the heading condition to consult
it is plausibly a few lines inside the same `ffe-section.tsx` edit F48 already touches — but it is
a distinct edit to a distinct piece of logic (the heading text derivation, not the Spec book guard)
and Direction A's Costs table doesn't say so.

**What would fix it:** add a Costs-table row (or fold it explicitly into the `ffe-section.tsx`
row) naming the heading ternary and stating it should key off `sectionKey`, not `mode`.

---

## C-AF-06 — F08 is claimed "addressed" but no move in the direction reduces the door count

**Severity: medium · Confidence: 0.75**

F08's claim (findings JSON, medium severity): "the `Design authority` head prints `DRAW AN
INVOICE`, `AMENDMENT` and `HOURS · THIS PROJECT ↗` side by side; the FF&E head adds `BILL 3
UNINVOICED`, ⌘K adds `Draw an invoice for {Project}` and the Desk's `BEGIN` column a fourth.
Nothing signposts which is the door." Direction A's §10 lists F08 in the "Medium and low findings
addressed" line without a distinct move cited (only the lexicon rename `Design authority` → `Money`
is described in §5, addressing F09/F61 — a *name* problem, not a *multiplicity-of-doors* problem).

Checked against M2 (§6): the Money region still prints, unchanged in count, `DRAW AN INVOICE
(leader) · ADD A CHANGE · HOURS · THIS PROJECT ↗`; the FF&E head still carries its own `BILL
UNINVOICED`; ⌘K still carries `Draw an invoice for {Project}`; the Desk header still carries its
own invoice-adjacent doorway. Renaming the region doesn't reduce or signpost among these — a
designer with F08's actual complaint (which door is *the* door for a money question) still faces
the same four-to-five competing entries after Direction A ships. F08 should either move to
Direction A's "Not addressed" list with a reason, or the direction should name the specific move
that closes it (there isn't one in the document as written).

---

## C-AF-07 — The obviousness-score jumps in §10 have no stated derivation

**Severity: medium · Confidence: 0.8**

§10's coverage table asserts precise task scores — T2 1.50→**3.4**, T5 2.50→**4.0**, T6
2.58→**4.2**, T14 2.78→**4.0**, T13 2.78→**3.8** — and the thesis itself is framed as falsifiable
against these exact numbers ("lifts each of the five worst tasks... by at least a full point... if
any of the five still requires recall... the direction has failed," §1). But no re-walk was run
(the deliverable is a proposal deck, not a re-tested product), and the review's own instrument
(`instruments.md` §1) defines "Obviousness: 1–5" as a **first-person walker's rating**, produced by
a persona narrating a specific screen, not a number a direction's author can compute from a move
list. Nothing in Direction A states how `3.4` was arrived at as opposed to, say, `2.9` or `3.8` —
there's no scoring rubric bridging "⌘K answers a stage word + one Desk sentence" to a specific
tenths-place obviousness score. This is the single most load-bearing claim in the document (it's
the thesis's own falsifiability test) and it's the least evidenced. This applies to Direction B's
coverage table too, so it isn't a defect unique to A, but a feasibility reviewer has to flag it
where it sits: the deck's central quantitative claim rests on unshown arithmetic.

**What would fix it:** either drop the tenths-place precision and state the claim ordinally ("T2
crosses from 'could not find it' to 'a second guess' — i.e., 1→3 on the instrument's own scale"),
or actually re-run the five walks against the mocks before the numbers ship in the deck.

---

## C-AF-08 — Minor: "zero amendments" undersells the ledger-write cost to Kody

**Severity: low · Confidence: 0.6**

§7 states "Amendment ledger: empty" as if the doctrine cost were nil. Read literally against the
judge rubric's axis 5 ("Zero — or one that closes a known-open item" scores a 9), this is accurate
and a real strength of the direction — no D/R entries are touched. But the same paragraph proposes
**five new I-entries** (I144–I148) plus a request that Kody formalize the verbal C19 (Thumb Index)
removal into DECISIONS.md. That's process work for Kody regardless of engineering cost, and a
reader skimming "zero amendments, empty ledger" could reasonably expect zero ledger-writing
overhead, which isn't quite what's being asked. Not a doctrine violation — just a framing gap
between "no amendments" and "no ledger work."

---

## Distinct by construction (A vs. B)?

**Yes — A and B are not "B = A plus more."** They diverge on the one axis that would make that
charge stick: what happens to the shelved-spine organ (running index, rooms block, shelves,
`doc-spine.tsx:135`). Direction A **keeps** it — every move in this critique operates on it,
extends its mount condition, and reuses its existing components (`DocSpineShelvedBlocks`,
`spine-rooms-block.tsx`, `spine-shelves-block.tsx`) unchanged. Direction B **deletes** it (amendment
B1) and replaces it with a new organ printed on the paper itself (`job-ticket.tsx`). A reader
handed both decks would not describe B as A with extra features bolted on — B trades away
components A relies on and stands up a structurally different answer to the same findings (F01,
F14, F60). Where they do overlap heavily — the shared-planks lexicon pass (Design authority→Money,
Knowledge retired, Rooms→Scans, Studio books→Ledgers) and the seven-sentence rewrite's intent — that
overlap is by the review's own design (`instruments.md` §6: "Shared planks... adopted identically
by both lanes"), not evidence of one direction subsuming the other.

One asymmetry worth flagging to the judges directly, though it isn't a feasibility defect in A: A's
per-stage organ (§3) is a *reconciliation* — `deriveDocumentGuide`'s six-step precedence "stands
exactly as built," only the strings and one tie-break change. B's organ (§3.1) *replaces* rung 6
with a new function, `deriveTicketLeader`. Both are Lane-legal (A is tightening-only by
construction; B is licensed to restructure and names/prices its amendment), but a judge scoring
axis 4 ("Distance from today") should weigh that A's guide change is genuinely a smaller diff than
its FF&E-leader-election move (C-AF-03 above) makes it look — the leader election is the one place
in Direction A that reads more like new derivation logic than "composition, labels, placement, copy
only."

---

## Summary table

| id | title | severity | confidence |
|---|---|---|---|
| C-AF-01 | F51 Desk-Contents doorway costed as free; code shows it needs new picker logic | high | 0.92 |
| C-AF-02 | F04 ⌘K stage-word group is new aggregation, not a registry match | medium | 0.7 |
| C-AF-03 | FF&E leader election needs cross-line scan + targeted unfold, not just ordering | medium | 0.6 |
| C-AF-04 | F48 fix cites the wrong ~50-line window (right move, wrong location) | low | 0.9 |
| C-AF-05 | SP-01 (care head heading) never budgeted in Costs or first-slice file list | low | 0.85 |
| C-AF-06 | F08 claimed addressed; no move actually reduces the money-door count | medium | 0.75 |
| C-AF-07 | Task obviousness-score jumps (thesis's own falsifiability test) unmethoded | medium | 0.8 |
| C-AF-08 | "Zero amendments" framing undersells 5 new I-entries + a C19 ledger ask | low | 0.6 |
