# Judge — feasibility lens (J2)

*2026-08-25 · verified against `main@695addb5f`. Read in full: both v2 directions, all four
critiques, both revision logs, `shared-planks.md`, `31-verified-findings`. Item-reach cells
re-counted independently; C14 claims checked against `10-code-anatomy.md` §3 and the `wt-` shots.*

**Neither direction is returned.** Every major move in both carries a findings citation —
A: F14/F48/F18/F04/F49/F51; B: F01/F14/F48/F60/F04/F16. Both are scored.

---

## 0. What I verified in the tree first

Five load-bearing claims both decks rest on. All check out; two need correcting.

| Claim | Verdict |
|---|---|
| The shelved blocks' gate is a **mount predicate**, not C8's width rule | **True.** `page.tsx:934-952`: `row.engagement_kind === 'project' && row.project_id && row.active_section === 'project'`. C8's `hidden min-[1440px]:block` is a separate line, `doc-spine.tsx:133`. F14's `canon_truth` is `open` in `31-verified-findings.json`. A's zero-amendment routing is sound; B's B1 correctly amends the *other* line. |
| `Spec book →` is dead code on install | **True, at A's re-cited line.** `ffe-section.tsx:1058-1063` is `{mode === 'project' && …}` nested inside the `mode === 'install' \|\| selecting` branch (`:1031`). Deleting one condition is the whole fix. `:1009-1015` is the unrelated project-branch ledger entry. `w1440-doc-install.png` shows the Install head with **no ledger acts at all**. |
| The care head reads `Install` | **True.** `ffe-section.tsx:1036-1038` ternary keys off `mode`; `page.tsx:1429-1445` passes `mode="install" sectionKey="care"`. SP-01's fix is real and one condition. |
| The receivable (F16 / `$17,500 owed`) is new query wiring | **False — cheaper than B priced it.** `useProjectInvoices` (`packages/supabase/src/hooks/use-invoices.ts:457`), the open-receivables selector (`:566`) and `invoiceDaysOverdue` (`:581`) already exist. It is a new *consumer*, not new wiring. B's 2 days is generous; A's `Owed` / `Not drawn` rungs are equally cheap. |
| Worktable inherits the spine (C14) | **True; both decks state it correctly.** `wt-delivery-project-1440.png` shows `IN THIS DOCUMENT` + `THE SHELVES` (Plan room · Spec book · Mood boards · Call sheet · Knowledge) standing under the flag. `wt-finalize-1440.png` shows the shelves collapsed to `The client's copy` alone — matching `shelves.ts:69-75` (`subject: proposal`, `worktable`-gated) and a separate `finalizeShelvedSpine` at `page.tsx:1063`. A's §9 Finalize claim and B's ninth-row plan are accurate. |

Two findings of my own, cutting across both decks:

**J-01 — no boards destination exists below 1440.** `app/(document)` has `board/[boardId]/page.tsx`
but **no boards-list route**; `shelf-panel.tsx:94` is `min-[1440px]:block` and `page.tsx:550-562`
force-closes an open shelf below it. So A's "1280 boards = 2 acts" and B's "Boards = 1 act at every tier" both terminate on a door
nobody has built. One new route or sheet, ~2 days, unpriced in both.

**J-02 — spec book at 1280 is already 1 act.** `w1280-doc-project-rich.png` prints `SPEC BOOK →` on
the FF&E head. B's §4 still reads that cell `unreachable → 1`. It is `1 → 1` on project sections; the real
gain is install and care, which B has anyway.

---

## 1. Scores

Anchors are `instruments.md` §7 verbatim. Axes 4-7 carry the weight in this lens.

### Direction A — *Everything Prints*

| Axis | Score | Reason |
|---|---|---|
| **1 · Obviousness of next act** | **7** | Above the 6 anchor ("one real act per stage in studio language"): all seven `stageCopy` strings (`document-guide.ts:91-141`) become verb+object, `Review now`'s default retires (`:242`), the zero-row hole closes (`red-letter-zone.tsx:25` → fall through), and the tie-break now ranks a dated outside deadline first (C-AP-06 accepted). Reason is already carried (`document-guide.tsx:83-86`, `{owner} · blocks {blocks}`). Short of 9: F08's four money doors survive as four — A only makes three of them name their scope (§4), so a competing-leader condition persists at the money question; and two of seven headlines (⌥) are date templates not yet written. |
| **2 · Findability ≤2 acts** | **6** | The 6 anchor exactly — "all 7 classes ≤2 at ≥1440, ≤2 exceptions below." My recount after A: at 1280, plans 1 (Folio row), spec book 1 (ungated), money 1, schedule 1, people 1, products 1, boards 2, rooms-lens unavailable (declared), spec attrs 3 (declared). Two declared exceptions is the anchor. It does not reach higher because the boards cell rests on **J-01** — a below-1440 destination that does not exist — and because the 2-act path there is ⌘K, which is a printed door but still a register. |
| **3 · First-week legibility (P3)** | **6** | "Every label decodable without a glossary." A retires `Knowledge` (`shelves.ts:62-68`), renames `Design authority` → `Money` at region, rung and index row (`document-index.ts:36-52`, `money-region.tsx:309-313`, `spine-shelved-blocks.tsx:109-115`), `The Rooms` → `The Scans` (`registry.tsx:106-119`), and adds a static sub-label to every Contents row (F38). It keeps `Project · FF&E` — the one head P3's own assignment names first (`instruments.md` §2, P3). One known-opaque label survives by choice. Not below 6, not above it. |
| **4 · Distance from today** | **8** | Adds no tier, reorders nothing (`PROJECT_PAPER_ORDER` untouched, C11), changes no section grammar, writes no `active_section`, touches no data model. But it is not the pure 9 anchor either: four genuinely new derivations land — the FF&E leader election (today a two-way boolean at `ffe-section.tsx:1013-1021`, C-AF-03), ⌘K's stage group (a reducer over `liveDocs`, `command-bar.tsx:282-283`, C-AF-02), a spread-aware index (`spine-shelved-blocks.tsx:118-122` maps a fixed `DOCUMENT_INDEX_KEYS`), and `openDraftingRoom()` (C-AF-01). Each is independently revertable; none is structural. |
| **5 · Doctrine cost** | **9** | The 9 anchor, both halves. Zero D/R entries touched — verified: the F14 fix edits `page.tsx:934-952`, a mount predicate whose finding is `canon_truth: open`, and leaves `doc-spine.tsx:133`'s `min-[1440px]` gate alone. And it **closes a known-open item** — `Knowledge` names a non-existent surface (`instruments.md` §5 known-open list) — by subtraction. The six proposed I-entries (I144-I149) plus the C19 ratification are ledger writes, not amendments; C-AF-08 is a framing point, not a doctrine cost. |
| **6 · Effort to first value** | **8** | Between the 6 and 9 anchors. The first slice's two blockers are the cheapest fixes in either deck: one deleted condition (`ffe-section.tsx:1058-1063`, read in the tree) and one edited predicate (`page.tsx:938`). The guide rewrite is strings plus a comparator in a 398-line file. The ⌥ headlines have their data on the page already (`scheduleFacts?.positionText`, `page.tsx:941`). 5-7 days is credible; 7-9 with `worktable.test.tsx` and guide unit tests. Held off 9 because the slice ships as one wave rather than in days — but every piece of it is valuable alone, which is the 9 anchor's real test. |
| **7 · Risk** | **8** | No data-model change, no migration, no sealing or send-seal semantics, no I114 dependency (the F42 sentence is deletable on a ruling). Additive and reversible by revert. Two live risks, both named honestly: (a) it ships **un-flagged** onto GA, so a bad string reaches every designer at once; (b) mounting the index on install/care means index rows must not point at regions that never mount — money does not seam on install (I141), so a fourth row would be a dead scroll-spy target. A states the three-row answer; the implementer must hold it. Also four extra project-scoped queries per install document load (`useProjectFFEItems`, `usePlanRoom`, `useProjectOwnedBoards`, `useProjectBillingAuthority`, `spine-shelved-blocks.tsx:75-84`) — a cost, not a correctness risk. |

### Direction B — *The Shop Ticket*

| Axis | Score | Reason |
|---|---|---|
| **1 · Obviousness of next act** | **8** | Above the 6 anchor. B writes fourteen states, not seven — a sentence *and* a rest state per section (§3.3) — so no stage can shrug even when nothing is wrong, which is the gap A's `project` default ("nothing is waiting on you") leaves open. `deriveTicketLeader` computes the sentence from the eight rows on screen, so the guide structurally cannot name what the map does not show; that is the 9 anchor's "reason visible." It also fixes F07 at 390 by registering the zone's first row as the mobile primary (`red-letter-zone.tsx` mirroring `document-guide.tsx:52-64`). Short of 9 on one internal contradiction: §3.3's `project` headline elects the PO (rank 3) while its own tie-break puts the specimen's two dated approvals at rank 2. |
| **2 · Findability ≤2 acts** | **8** | Genuinely reaches toward the 9 anchor — rooms, plans, spec, money, dates all become one act at 1440, 1280 and 390 **on all seven sections**, with the ticket itself as visible scent. That is more than A can buy. Two cells are over-claimed and I re-counted them: **J-02**, spec book at 1280 is already 1 on project sections (`w1280-doc-project-rich.png`), so the "unreachable → 1" cell overstates the gain; and **J-01**, `Boards = 1` below 1440 terminates on a route that does not exist. One declared exception at 3 (spec attrs, `ffe-section.tsx` + the spec-book route, F57). |
| **3 · First-week legibility (P3)** | **8** | The strongest single move for P3 in either deck: eight school words in one column — Rooms, Pieces, Drawings, Spec, Boards, Money, Dates, People — is recognition, not recall, which is exactly what P3's brief demands. B also removes one more opaque label than A (`Project · FF&E` → `Pieces`, sub `the FF&E schedule, by room`, C-BP-02 accepted so head and row carry one word, C20) and keeps `plan room` as a trade word on the leaf while `Drawings` faces the junior. Not 9 because the ticket is a ninth thing to learn and `Pieces` is a new noun for a class that already had two. |
| **4 · Distance from today** | **3** | The 3 anchor's neighbourhood. B adds an organ to the top of the paper that has never existed (`job-ticket.tsx` + `ticket-derivation.ts`), **deletes two shipped components** (`spine-rooms-block.tsx`, `spine-shelves-block.tsx`), removes the ≥1440 gate from `shelves.ts:33-110`, gives `shelf-panel.tsx:94` a route mode it has never had, removes the force-close at `page.tsx:550-562`, unwinds the lens's matchMedia release (`room-lens-context.tsx:35-55`), replaces guide rung 6, and in wave two replaces the Desk's folio grid, `studio-pulse.tsx` and `recent-boards-strip.tsx` with a roster. It stops short of reordering `PROJECT_PAPER_ORDER` and adds no tier — which is why this is a 3 and not lower. |
| **5 · Doctrine cost** | **3** | The 3 anchor: "≥2 amendments." B1 (C8/I136 mount gate, quoted at `DECISIONS.md:8427`ff) and B2 (I136's lens-release clause, `:8461-8462`) are both correctly formed — id named, clause quoted, trade priced, rollback stated, the I138-A5 shape. v1's unnamed I139/I141 deletions are genuinely withdrawn: §7 and §9 of v2 now say both stand and the ticket anchors to them (C-BF-01 closed). **Not a 1** — nothing is unnamed. But there is a third live item: the C14/I138 "flag off is main's composition exactly" reading, presented as a ruling request rather than an amendment. Honest framing, and I accept it as named; it is still an unresolved doctrine claim that resolves into a third amendment if Kody reads the clause broadly. |
| **6 · Effort to first value** | **4** | Between the 3 and 6 anchors. B's 12 days is right on one line and wrong on three. Cheaper than priced: the receivable (the hooks exist — `use-invoices.ts:457, 566, 581`), so ~1 day not 2. More expensive than priced: (a) the below-1440 lens is not "remove a listener" — `room-lens-context.tsx:35-55` releases because the *put-down affordance* lives in the ≥1440 spine, so B must build a second affordance and re-test the lens across three tiers × seven sections; (b) **J-01**, the Boards row needs a route nobody has built; (c) the flag matrix — `job-ticket` × `worktable` × 7 sections, with `clientcopy` (`shelves.ts:69-75`) living inside the block B deletes, so a proposal document with both flags on loses its one shelf unless the ninth row ships in slice one, which §8 says it does not. Realistically 16-20 days. And nothing is valuable until the whole organ lands — the slice is indivisible, which is the 3 anchor's "first slice is a program" pulling against the real 12-16 day ceiling. |
| **7 · Risk** | **5** | Just under the 6 anchor ("fail-closed flag"). B does declare one — `job-ticket`, fail-closed by the portal's own default (`use-feature-flag.ts:119-120, 158-164`) — and touches no data model, no migration, no sealing, and has no I114 dependency (§5's mapping is a candidate; placement reads `active_section`, the phase cell reads the schedule). Two things hold it at 5. First, an internal contradiction with rollback consequences: §7's Costs say *delete* `spine-rooms-block.tsx` and `spine-shelves-block.tsx`, while B1's rollback promises the flag "restores both blocks byte-identically." A deleted component cannot be restored by a flag; the deletion must be a flag branch or the rollback is a claim, not a mechanism. Second, the lens below 1440 is a first-ever behaviour whose failure mode (a hold nobody can put down at a width where the affordance scrolls away) is exactly what I136's clause was written to prevent. |

---

## 2. The four answers

**Distinct by construction — yes, provably.** Not a rhetorical distinction: A edits the mount
predicate at `page.tsx:938` and leaves `doc-spine.tsx:133` standing; B deletes the two components
that predicate feeds. Opposite operations on the same lines. The overlap is the shared planks,
which §6 requires.

**Favoured: Direction A.** On the four weighted axes it takes 8/9/8/8 against 3/3/4/5. It is the
only one of the two that can be on a designer's screen this month, and its first slice closes two
blockers (F14, F48) with one deleted condition and one edited predicate that I read in the tree.
B is the better *product* answer at 1280 and 390 — one act on all seven sections is reach A cannot
buy — but it is a quarter, not a Tuesday.

**Worse off under A: P2**, the three-person-studio principal — her Monday eleven-job read is
refused outright (§7, "no fleet or roster tier"), so she still opens eleven documents while ⌘K's
stage group tells her who is in install and never what it costs.

**Honest sequencing.** A's first slice now, un-flagged, 5-7 days. A's remaining waves next. B's
slice **after** two things Kody owes: the flag-on Worktable walk (I143) and a C14 ruling on the
narrow reading — and built *on top of* A's mount fix, not instead of it, because A's fix is what
proves the four project-scoped hooks behave on install and care spreads before B stakes an organ on
them. Do not run them concurrently: both edit `ffe-section.tsx`, `page.tsx`, `command-bar.tsx`,
`document-index.ts` and `shelves.ts`.

**Graft into A, all Lane-A-legal:** (1) `Project · FF&E` → **`Pieces`**, sub `the FF&E schedule, by
room` — a string in `document-index.ts:36-52` plus the head, and it removes the one opaque label A
keeps. (2) B's **rest states** — a second sentence per section for when nothing is wrong, which is
what stops A's `project` default reading as a shrug. (3) B's **390 seam wrap rule** — two lines,
two exceptions, a third dropped whole, never abbreviated (A's M4 has the same F87 exposure and no
rule). (4) B's **flag-absent People string** — "the call sheet isn't turned on for this studio"
(U2 Q8; A prints `Call sheet · {n}` and says nothing when the flag is off). (5) B's honesty about
**J-01** — A should declare its 1280/390 boards cell as needing a below-1440 route that does not
exist, rather than costing it as a registry row.
