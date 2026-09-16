# The four candidate directions

The panel ranks all four. Three get built: **B always**, plus the two
highest-ranked of A / C / D. The unbuilt one gets one deck sheet.

No ranking and no preference is expressed here. Each direction is stated in the
program plan's own terms, then given a width schematic.

**How to read the schematics.** Two per direction: one at a 1440 viewport, one
at 390. Column widths are labelled in CSS pixels. Where a number is not given by
the plan it is marked *(residual)* — arithmetic from the surrounding band, for
the SPEC to pin, not a decision made here. Today's room for comparison: a 1240
content band, `260 / 524 / 320` with 36px gaps, one breakpoint at 1180px
(`agreement-composer.tsx:719-820`).

---

## A · The paper is the page, edited in place

**Shape.** Full-width client's copy at a ~720–760px measure. Selecting a part
turns it into its editor on the paper — the clause textarea and the list editor
sit where the part prints. Structured money parts (rate card, ceiling, retainer,
cadence, deposit) get a margin editor instead. The rail collapses to a margin
outline carrying the word "needs attention". "+ Add a part" lives at the seams
between parts.

**Must prove.** A money part edited on or beside the paper, at 1440 and at 390,
with the fee-floor blocker visible. Keyboard reorder and add-a-part without a
pointer. Where "2 of 9 parts need attention" and the fee-floor sentence live once
the aside is gone. That the editing chrome **wraps** `agreement-parts-body.tsx`
rather than forking it (R27 / R51).

**Crux (plan, verbatim).** "the margin at 1024; editing chrome must wrap
`agreement-parts-body.tsx`, not fork it; seam acts must survive keyboard."

**House-sheet rules to check it against.** #6 (seam acts are acts and take a
tier), #7 (a consequence sentence above any terminal act placed on the paper),
#8 (`aria-disabled` on the outline's held rows and on Save), #9 (an unwritten
part renders nothing — R21 — so its seam must still be reachable), #4 (no
shadow may separate the editing state from the paper), #2 (the editor's type
must be one of the seven steps, and money fields `.t-money`).

```
1440  ┌──────────────────────────── 1440 viewport ────────────────────────────┐
      │ room bar · title · N of 9 need attention · Review & send              │
      ├───────────────────────────────────────────────────────────────────────┤
      │ 100 │  200 outline   │36│      760 paper      │36│  208 margin  │ 100 │
      │(res)│    (residual)  │  │                     │  │  (residual)  │(res)│
      │     ├────────────────┤  ├─────────────────────┤  ├──────────────┤     │
      │     │ Services       │  │ ── Services ──────  │  │              │     │
      │     │ Deliverables   │  │ [textarea in place] │  │              │     │
      │     │ Exclusions     │  │ + Add a part (seam) │  │              │     │
      │     │ Role rates     │  │ ── Deliverables ──  │  │              │     │
      │     │   needs attn   │  │ — Concept present.  │  │              │     │
      │     │ Ceiling        │  │ ── Role rates ────  │  │ ROLE RATES   │     │
      │     │ Furn. deposit  │  │ [selected · money]  │  │ Principal $  │     │
      │     │ Retainer       │  │                     │  │ Designer  $  │     │
      │     │   needs attn   │  │ ── Ceiling ───────  │  │ Assistant $  │     │
      │     │ Billing cad.   │  │ Not yet set         │  │ ─────────    │     │
      │     │ Terms          │  │ ── Terms ─────────  │  │ names no fee │     │
      │     └────────────────┘  └─────────────────────┘  └──────────────┘     │
      └───────────────────────────────────────────────────────────────────────┘
        readiness: count + fee-floor sentence live in the right margin
```

```
390   ┌──── 390 ────┐
      │ room bar    │
      ├─────────────┤
      │ 16│ 358 │16 │   one column, paper measure = 358
      │   ├─────┤   │
      │   │2 of 9 needs attention · names no fee   (band, above the paper)
      │   ├─────┤   │
      │   │ ── Services ──          │
      │   │ [textarea in place]     │
      │   │ + Add a part (seam)     │
      │   │ ── Role rates ──        │
      │   │ [money editor unfolds   │
      │   │  full width — the       │
      │   │  margin has nowhere     │
      │   │  to go at this width]   │
      │   │ ── Ceiling ──           │
      │   │ Not yet set             │
      │   └─────────────────────────┘
      │ outline reached from the room bar; reorder by Move up / Move down
      └─────────────────────────────┘
```

---

## B · Builder as overlay — Kody's hunch, built regardless of rank

**Shape.** The paper is the page. An act — "Edit the parts" — opens a widened
sheet or drawer holding today's rail and editor, essentially unchanged. The
paper stays visible and updates behind it at 1440: drawer ≤480, paper ≥720. At
390 the drawer becomes a full-screen sheet with "Back to the paper".

**Must prove.** That the paper visibly updates while the drawer is open at 1440.
Where readiness lives **when the drawer is closed** — the count and the
fee-floor sentence have no aside to sit in. A money part edited inside the
drawer at 480 and at 390. Focus placement on open and on close, and the return
of focus to the part that was being edited.

**Crux (plan, verbatim).** "every edit becomes open→edit→close; readiness when
the drawer is closed."

**House-sheet rules to check it against.** #4 (a drawer over paper with no
shadow — the separation must be a rule, a ground change, or a measure change),
#5 (no "modal" language, no spinner while the paper re-renders), #7 (the
consequence sentence for Review & send, wherever that act ends up relative to
the drawer), #8 (the drawer's own dismiss and the Save act stay focusable with
reasons), #3 (the drawer's internal rhythm is the same 24px module as the
paper).

```
1440  ┌──────────────────────────── 1440 viewport ────────────────────────────┐
      │ room bar · title · N of 9 need attention · Review & send              │
      ├───────────────────────────────────────────────────────────────────────┤
      │  DRAWER OPEN                                                          │
      │ │◄──── 480 drawer ────►│      │◄──────── 720+ paper ────────►│        │
      │ ┌──────────────────────┐      ┌──────────────────────────────┐        │
      │ │ RAIL      │ EDITOR   │      │ DESIGN SERVICES AGREEMENT V1 │        │
      │ │ Services  │ CLAUSE   │      │ Okonkwo — design services    │        │
      │ │ Deliver.  │ Services │      │ DRAFT                        │        │
      │ │ Exclus.   │ [textarea│      │ ──────────────────────────── │        │
      │ │ Role rat. │  ...    ]│      │ Services                     │        │
      │ │  needs    │          │      │ Interior design services,…   │        │
      │ │ Ceiling   │          │      │ Deliverables                 │        │
      │ │ Retainer  │          │      │ — Concept presentation       │        │
      │ │  needs    │          │      │ — Design documentation       │        │
      │ │ Terms     │          │      │ Role rates                   │        │
      │ │ + Add     │          │      │ Principal · Designer · Asst  │        │
      │ └──────────────────────┘      └──────────────────────────────┘        │
      │  Close ← returns focus to the part just edited                        │
      ├───────────────────────────────────────────────────────────────────────┤
      │  DRAWER CLOSED                                                        │
      │        │◄────────────── 720–760 paper, centred ──────────────►│       │
      │        Edit the parts  ·  2 of 9 need attention  ·  names no fee      │
      └───────────────────────────────────────────────────────────────────────┘
```

```
390   ┌──── 390 ────┐        ┌──── 390 ────┐
      │ THE PAPER   │        │ THE DRAWER  │  (full-screen sheet)
      ├─────────────┤        ├─────────────┤
      │ Edit the    │  ───►  │ ← Back to   │
      │ parts       │        │   the paper │
      │             │        ├─────────────┤
      │ 2 of 9 need │        │ Services    │
      │ attention   │        │ Deliverables│
      │ names no fee│        │ Exclusions  │
      ├─────────────┤        │ Role rates  │
      │ Services    │        │   needs attn│
      │ Interior…   │        │ Ceiling     │
      │ Deliverables│        ├─────────────┤
      │ — Concept   │        │ CLAUSE      │
      │ — Design d. │        │ Services    │
      │ Role rates  │        │ [textarea]  │
      │ Ceiling     │        │             │
      │ Not yet set │        │ + Add a part│
      └─────────────┘        └─────────────┘
        the paper is not visible while the drawer is open at 390
```

---

## C · Two panes, right-sized

**Shape.** The rail and the editor fuse into one accordion column of ~580px —
the `facet-section.tsx` "exactly one open" precedent, already in this room's
sibling. The paper gets ~720px. The least change of the four: today's editors,
today's readiness placement, one fewer column.

**Must prove.** That the editor is workable at a narrower measure than today's
524 minus the accordion's own head and indent. Reorder inside an accordion,
pointer and keyboard. Where readiness sits now that the third column is gone.
A money part — the rate card's three roles — inside the accordion at 1440 and
at 390.

**Crux (plan, verbatim).** "the editor gets narrower than today; may stay
clunky."

**House-sheet rules to check it against.** #2 (a rate card's three role rows at
a narrower measure without dropping below the 11px floor or truncating), #4 (no
truncation in the accordion heads), #6 (the accordion head is an act and takes a
tier; `aria-expanded` is not `aria-pressed` — §A5 amended §F-E), #9 (a closed
section with nothing written renders its name and nothing else), #8 (the held
rows).

```
1440  ┌──────────────────────────── 1440 viewport ────────────────────────────┐
      │ room bar · title · N of 9 need attention · Review & send              │
      ├───────────────────────────────────────────────────────────────────────┤
      │  52 │◄──── 580 accordion ────►│36│◄──── 720 paper ────►│ 52          │
      │(res)│                          │  │                     │(res)        │
      │     ┌──────────────────────────┐  ┌─────────────────────┐             │
      │     │ ▸ Services               │  │ DESIGN SERVICES     │             │
      │     │ ▾ Deliverables           │  │ AGREEMENT · V1      │             │
      │     │   BODY                   │  │ Okonkwo — design    │             │
      │     │   — Concept presentation │  │ services agreement  │             │
      │     │   — Design documentation │  │ DRAFT               │             │
      │     │   — Selection schedules  │  │ ─────────────────── │             │
      │     │   + Add a line           │  │ Services            │             │
      │     │ ▸ Exclusions             │  │ Interior design…    │             │
      │     │ ▸ Role rates  needs attn │  │ Deliverables        │             │
      │     │ ▸ Ceiling                │  │ — Concept present.  │             │
      │     │ ▸ Furnishings deposit    │  │ — Design document.  │             │
      │     │ ▸ Retainer    needs attn │  │ Role rates          │             │
      │     │ ▸ Billing cadence        │  │ Ceiling             │             │
      │     │ ▸ Terms                  │  │ Not yet set         │             │
      │     │ + Add a part             │  │ Retainer            │             │
      │     └──────────────────────────┘  └─────────────────────┘             │
      │     2 of 9 need attention · names no fee  (head of the left column)   │
      └───────────────────────────────────────────────────────────────────────┘
```

```
390   ┌──── 390 ────┐
      │ room bar    │
      ├─────────────┤
      │ 2 of 9 need attention · names no fee
      ├─────────────┤
      │ ▸ Services  │   one column, 358 measure
      │ ▾ Deliverab.│   exactly one open
      │   — Concept │
      │   — Design  │
      │   + Add line│
      │ ▸ Exclusions│
      │ ▸ Role rates│
      │    needs    │
      │ ▸ Ceiling   │
      │ ▸ Retainer  │
      │ ▸ Terms     │
      │ + Add a part│
      ├─────────────┤
      │ Preview the client's copy →  (the paper is a separate view at 390)
      └─────────────┘
```

---

## D · The galley — proof above, pencil beneath

**Shape.** A single column at paper measure with two thin margins. Each part is
rendered read-only by the **real** body component. Selecting a part unfolds its
existing editor directly beneath it, one open at a time. The left margin is an
outline carrying attention words; the right margin carries marginal notes — the
fee-floor sentence sits beside the seam where the fee would print. Reorder is
Move up / Move down on the part head plus drag on the outline. A full-page
proof route replaces the 640px sheet.

**Must prove.** A per-part read-only render taken from
`agreement-parts-body.tsx` without forking it. That unfolding an editor does not
shift the reading position of the part above it. The money state — a rate card
unfolded beneath its own printed form. The full-page proof route, and whether
the "Preview client copy" act survives it.

**Crux (plan, verbatim).** "needs a per-part export from
`agreement-parts-body.tsx`; fold/unfold must not shift the reading position."

**House-sheet rules to check it against.** #9 (an unwritten part prints nothing
— R21 — so the galley must still offer its fold), #7 (a marginal note is not a
consequence sentence; the consequence sentence still belongs above the terminal
act), #3 (fold/unfold must land on the 24px module, and the margins are the
page measure's residual — §A4 caps the band at 1100 and prose at 65ch), #2
(marginal notes at `.t-meta` 12px, never below 11), #4 (no shadow marks the
unfolded editor; no truncation in the outline).

```
1440  ┌──────────────────────────── 1440 viewport ────────────────────────────┐
      │ room bar · title · N of 9 need attention · Review & send              │
      ├───────────────────────────────────────────────────────────────────────┤
      │ 84 │◄─ 240 outline ─►│36│◄──── 720 galley ────►│36│◄─ 240 notes ─►│84│
      │(res)                 │  │                      │  │               (res)
      │    ┌─────────────────┐  ┌──────────────────────┐  ┌───────────────┐   │
      │    │ Services        │  │ Services             │  │               │   │
      │    │ Deliverables    │  │ Interior design …    │  │               │   │
      │    │ Exclusions      │  │ ──────────────────── │  │               │   │
      │    │ Role rates      │  │ Deliverables         │  │               │   │
      │    │   needs attn    │  │ — Concept present.   │  │               │   │
      │    │ Ceiling         │  │ ──────────────────── │  │               │   │
      │    │ Furn. deposit   │  │ Role rates      ▾    │  │ This agreement│   │
      │    │ Retainer        │  │ ┌ EDITOR unfolds ──┐ │  │ names no fee. │   │
      │    │   needs attn    │  │ │ Principal  $185  │ │  │ Add a rate    │   │
      │    │ Billing cadence │  │ │ Designer   $140  │ │  │ card, a flat  │   │
      │    │ Terms           │  │ │ Assistant  $ 85  │ │  │ fee, or a     │   │
      │    │                 │  │ └──────────────────┘ │  │ per-phase fee.│   │
      │    │ + Add a part    │  │ Ceiling              │  │               │   │
      │    └─────────────────┘  │ Not yet set          │  │               │   │
      │                         └──────────────────────┘  └───────────────┘   │
      │  Read the whole paper →   (full-page proof route, at 720 measure)     │
      └───────────────────────────────────────────────────────────────────────┘
```

```
390   ┌──── 390 ────┐
      │ room bar    │
      ├─────────────┤
      │ 16│ 358 │16 │  margins collapse; notes become inline lines
      │   ├─────┤   │
      │   │2 of 9 need attention                    │
      │   ├─────┤   │
      │   │ Services                  ▸ │
      │   │ Interior design services,…  │
      │   │ ─────────────────────────── │
      │   │ Role rates                ▾ │
      │   │ ┌ EDITOR ─────────────────┐ │
      │   │ │ Principal   $185 / hour │ │
      │   │ │ Designer    $140 / hour │ │
      │   │ │ Assistant   $ 85 / hour │ │
      │   │ └─────────────────────────┘ │
      │   │ This agreement names no fee.│  ← the note, inline at the seam
      │   │ ─────────────────────────── │
      │   │ Ceiling                   ▸ │
      │   │ Not yet set                 │
      │   └─────────────────────────────┘
      │ Read the whole paper →                       │
      └──────────────────────────────────────────────┘
```

---

## The shared treatment — all three built directions

These three changes are common to every built specimen, whichever directions are
chosen. Stated verbatim in substance from the plan:

### 1 · The header reduction

- Title = the **client's name**, with the email as fallback. (Today the title is
  `document.title`, which on the captured production draft reads
  `j.enzenroth@gmail.com — design services agreement` —
  `agreement-composer.tsx:732-734`.)
- The client account becomes an **inline act in the "Prepared for" line**,
  `aria-disabled` with the owner reason. (Today it is a labelled `ClientPicker`
  block plus a helper sentence — `agreement-composer.tsx:765-797`.)
- **Save is replaced by its dated record.** (Today `Save agreement` / `Saved`
  with the native `disabled` attribute — `agreement-composer.tsx:756-762`; house
  sheet §A5 "taken" at `SPEC.md:373-378` is the pattern for an act replaced by
  its record.)

### 2 · The send sheet, rewritten in parts vocabulary

- **N4 closed.** No fixed seven-item enumeration; no "facet" on the studio's
  face.
- **The consequence sentence is composed from the parts actually present** — and
  only the client-visible ones (R33, R21's floor reading).
- The homeowner's door carries the same fixed enumeration today and
  over-promises the same way; the panel says whether the door's sentence moves
  with it.

Today's sentence, for the before/after inventory
(`service-agreement-send-sheet.tsx:105-112`): *"{Name} receives the services,
rates, retainer policy, billing cadence, ceiling, and terms. Their signature
preserves consent; the agreement still awaits the studio countersignature before
work is authorized."* And at `:153`: *"Ready to send · every contractual facet is
present."*

### 3 · The return act, with a consequence sentence and a confirm

`Return to the seven facets` discards the parts. Today it fires
`discard_agreement_parts` on the first press, with no consequence sentence and
no confirm (`agreement-composer.tsx:747-754` → `:637-648`). House sheet §A6
requires a consequence sentence above every terminal act, in every state,
saying what the act does *and* what it does not do.

R24 fixes that the act **exists** (draft only, studio side) and that the
seven-facet room's notice names it. R24 does not fix its label — a rename is a
legitimate `AMENDMENT-ASK`, and the banned-word list carves out `facet` for this
one string on that basis.
