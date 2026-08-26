# Direction A — **Everything Prints**

*The Document — Wayfinding Review · 2026-08-25 · Lane A · verified against `main@695addb5f`*
*Amendments to ruled canon: **zero**. New ledger entries: I144–I149, all additive, all reverts (§7).*
*v2 — revised against both critiques (C-AP-01…12, C-AF-01…08); log in §11.*

---

## 0. Name and summary

**Everything Prints.**

Nearly every door this review found missing is already built and already routed — the plan room, the
spec book, the call sheet, the claim drawer on an FF&E line, the send-wall line. What is missing is
the *printing*: the word sits on a shelf she cannot see at 1280 (F01), or lives only behind a chord
she was never shown (F49, F50, F82), or the act that names it is a shrug (F18). Direction A changes
no structure. It changes **what mounts where** (F14), **which act leads** (F34/F08), **what the
seven sentences say** (F18), **which doors are printed rather than recalled** (⌘K gets a doorway and
its `This surface` group the four document-scoped rows), and **what we call one thing**
(F17/F35/F09). Every move is a string, a mount condition, an election, a registry row, or one small
derivation costed in §7.

---

## 1. Thesis

**The structural commitment.** Direction A keeps the shelved-spine organ exactly as I136 built it —
index, rooms block, shelves, all ≥1440 — and pays for the narrower tiers the way C12 already rules a
demoted act must be paid for: **each door moves onto the body it acts on**, and the one
width-independent register the product owns (⌘K) becomes a printed doorway instead of a chord.
Direction B deletes that organ and stands a new one on the paper. That is the difference — not
degree: A extends the mount conditions of components B removes.

**One falsifiable sentence:** every artifact and every next act on this surface already exists in
code, so printing each one where she is already looking moves each of the five worst tasks across a
named threshold at 1280 without adding a surface, a tier, a mode, or one doctrine amendment. Stated
ordinally, because no re-walk has been run (C-AF-07): T6 and T14 cross from *"needs a guess"* to
*"the door is on screen"*; T5 and T13 from *"gave up / left the document"* to *"a second guess that
lands"*; T2 from *"could not find it"* to *"one printed door answers it, one stage at a time"* —
explicitly not to a fleet read (C-AP-02). If any of the five still needs a chord she was never shown
or a word she never saw printed, the direction has failed. v1's tenths-place scores are withdrawn as
authored arithmetic; the instrument defines the scale as a walker's rating.

---

## 2. The IA / map — every surface, every door, act-counts

Notation: `[1440 · 1280 · 390]` = acts from the named surface; **Δ** marks a change with its finding
id; `SP-xx` a shared plank. Baselines from anatomy §7 (`10-code-anatomy.md:718–810`).

### 2.1 From `/desk`

```
/desk
├─ header → ＋ Capture a lead · begin a Brief | ＋ Open a project · no proposal needed |
│  Find anything ⌘K                                [1·1·1]  Δ both sub-labels print (F24)
├─ Needs your hand · {n}  → folio card → /doc/{id}  [1·1·1]  Δ eyebrow + reach line reconciled (F23)
│  └─ folio ledger act                             [1·1·1]  Δ the need's own verb (F18)
├─ The studio today (was Studio pulse)  Δ renamed + recomposed (F39, F65)
│  └─ stage phrase, scored ink → ⌘K, that word typed [2·2·2] Δ secondary door (F04)
├─ Recent boards → /board/{id}                     [1·1·1]
└─ The Studio  (Contents — labels + doorways only, R95)   Δ static sub-labels throughout (F38)
   ├─ Rooms:   Library · People · The Scans        [1·1·1]  Δ `The Rooms`→`The Scans` (F17)
   ├─ Ledgers: Orders · Accounts · Hours · The Post [1·1·1]
   └─ Begin:   Open a project · Draft a design agreement · Draw an invoice · new ·
               Add a maker · Open the Drafting Room [1·1·1] Δ Drafting Room joins Begin (F51)
```

**F51 is not free** (C-AF-01). `desk-contents.tsx:136–138` filters `STUDIO_ROOMS` to
`scope === 'global'` *deliberately* — the Drafting Room has no standalone route without a proposal
in hand — and `verbHandlers` (`:159–165`) assumes no id is needed. Landing this row means porting
⌘K's fallback (`command-bar.tsx:371–375`) into a shared `openDraftingRoom()` opener: its own costed
line in §7, and v1's gloss "a label and a doorway" is withdrawn.

**⌘K from the Desk** (`command-bar.tsx`), Δ four moves:

| Move | Was | Now | Finding |
|---|---|---|---|
| **Empty query** (nothing typed) | groups begin `In hand · Recent boards · Recent · This surface…` (`:503–583`) | a new first group **`WHERE THE WORK STANDS`** — one row per live stage, `In install · 1 · Okonkwo kitchen` — printed **without typing** | F04 **blocker**, primary route |
| Typed a stage word (`install`, `proposal`) | `No match — Browse the Help Center` | the same group, filtered to that stage | F04 |
| Typed `spec book`, `call sheet`, `plan room`, `boards` | nothing, or `No match` | rows paired with a recent document: `Spec book · Vandersteen` | F29, F48, F50 (SP-16), F82 |
| Group order · Recent rows · placeholder | Begin above Rooms & ledgers; two rows both bold `Aspen`; `…ask the Engine…` | reversed; full title on the row; `Find a document or a ledger…` | F37, F13, **SP-07** |

**Why the empty-query group, and not the sentence** (C-AP-01). v1 hung the whole T2 answer on
clicking the phrase `one in install` inside an italic Playfair sentence two sections down the Desk —
a target P3 has no reason to believe is clickable, on a block she already misreads
(`27-panel-p3.md:513`). The primary route is now ⌘K's own empty state, which is recognition: open
the register from the header door she can see, and the studio's stages are listed as rows before she
types a character. The sentence's stage phrases keep their doorway — drawn as scored ink with the
underline the surface uses for every act (C6), not as bare prose — but they are a **second** way in,
and the ordinal claim for T2 in §10 assumes only the ⌘K branch is found unaided.

### 2.2 From an open document (project section)

```
/doc/[id]
├─ STUDIO DRAWER (≥1180) → Find anything ⌘K      [1·1·—] Δ new printed door (C-AP-05)
├─ SPINE  (col 1)
│  ├─ ← Put down                                 [1·1·—] Δ the word prints at 1280 too (F02)
│  ├─ seven marks + active label                          Δ the active section's name prints at 1280 (F02)
│  ├─ In this document (running index) — approvals · schedule · FF&E ·  [1·—·—]
│  │  **Money  $17,500 owed**                     Δ renamed; reports the live rung (F09, F61)
│  ├─ Rooms (this job's; lifts, never filters)    [1·—·—] Δ placeholder row at zero rooms (F72)
│  ├─ The shelves                                 [1·—·—]
│  │  Plan room · the drawing set (Δ gloss, F17) · Spec book · by room ·
│  │  Mood boards → leaf ends in `Start a board` (Δ F30) · Call sheet · who is on the job
│  │  ⊗ Knowledge — RETIRED                       Δ closes known-open I136 (F12)
│  └─ In hand · timer
│  ⟹ Δ the whole shelved block now mounts on install and care documents, **at ≥1440** (F14 **blocker**)
├─ PAPER  (col 2 — every door below prints at every width, all [1·1·1])
│  ├─ letterhead → Message {Family} · Preview as · Sharing · Call sheet · {n}  Δ leader yields with no client (F52)
│  ├─ guide / red-letter zone → one act (§3) · Client approvals → New approval ·
│  │  Schedule dates → Adjust dates (**SP-02**) · Schedule → the phase spine
│  ├─ Folio · + File · **Plan room →**            Δ new in-flow door, same route (T6)
│  ├─ Project · FF&E — elected leader (F34, F08) · line unfold [2·2·2] · Edit spec details →
│  │  (**SP-19**) · Add a room (C12) · **Spec book →** Δ ungated (F48 **blocker**, see §7)
│  ├─ Money → Draw an invoice · Add a change · Hours ↗   Δ renamed (F09), + two rungs (F16)
│  └─ Closing the book · The record (F90) · colophon → Brief a vendor · Hold · Archive ·
│     **Add to the team** (**SP-10**)
├─ MARGIN (col 3 ≥1440; `Margin ← · {n}` tab 1180–1439) Δ the tab carries its count (F78)
└─ MOBILE BAR (<1180)
   ├─ In this document / {Section} → spine sheet [1] · centre: the elected act, untruncated Δ (F07)
   └─ More → **In this document**: Plan room · Spec book · Boards · Call sheet [2] Δ new group ·
      Find anything ⌘K [2] Δ (F49 **blocker**) · Time in hand · The Post · Ledgers · Leave a note
```

**⌘K's `This surface` group, everywhere** (`command-bar.tsx:573`). Today it carries the call sheet
(`:547`) and — on the empty query only — the plan room (`:562–572`). Δ: it carries all four
document-scoped surfaces on the **empty query**, so at 1280 a board is two acts and neither is
recall — the drawer prints `Find anything`, and the row is on screen before she types. SP-16 wires
the same rows into the typed branch. That is the answer to C-AP-05: a printed door plus a printed
row, not a remembered word.

**How this threads C8 without amending it.** C8 rules the three *shelved spine blocks* ≥1440 only
and the room lens lifting rather than filtering (I136 :8427, lens :8462–8471). All three stay where
C8 put them — at 1280 and 390 they appear in no form, and **the F14 fix is ≥1440-only by design**
(C-AP-09: B's is not — that is the lane difference, stated once here). C8 does not govern (a) *which
documents* they mount on: that gate is `engagement_kind === 'project' && active_section ===
'project'` (`page.tsx:938–952`), a mount condition, and F14's canon_truth is `open`; (b) the spine's
active label and put-down word, neither index nor room nor shelf, merely `hidden min-[1440px]:block`
(`doc-spine.tsx:52, 122–130`); (c) whether the *artifacts* have other doors. Below 1440 they are
reached where I137 SP4 (C12) already puts a demoted act — **on the body it acts on**.

---

## 3. The per-stage "what's next" organ

**Reconciliation, not replacement.** `deriveDocumentGuide`'s six-step precedence stands as built
(`document-guide.ts:316–397`): unavailable → paused → gate → operational need → proposal lifecycle →
stage default. Direction A changes the *copy* at steps 4–6, adds a tie-break, and closes one hole:

- **The hole (F77).** `RedLetterZone` returns `null` at `rows.length === 0`
  (`red-letter-zone.tsx:25`) after the page has already chosen it over the guide
  (`page.tsx:1111–1118`), so a document with a composed-but-empty need list prints **neither**. Δ:
  fall through to `DocumentGuide` — one conditional.
- **The tie-break (new; U2 Q4, F08, F41), reordered after C-AP-06.** v1 ranked ownership first,
  which would promote a one-day-old studio chore over a three-week-overdue client decision. Now:
  **(1) a hard outside deadline inside seven days** — a carrier window, a workroom's COM date, an
  install-blocking date — whoever owns it; **(2) what the studio can move today**
  (`owner === Designer`; the guide already carries `{owner} · blocks {blocks}`,
  `document-guide.tsx:83–86`); **(3) oldest overdue; (4) undated setup chores last.** Rank 1 reads
  dates the needs already carry. Losers print as the zone's next rows in their own stamp colour
  (**SP-20**). On the specimen rank 1 catches the reading chair's COM date, so the drawing is
  unchanged; the rule now survives urgency and ownership disagreeing.
- **`Review now` retires.** `needGuideAction`'s default (`document-guide.ts:242`) becomes the need
  kind's own verb — the kinds already carry distinct text (`folder-card.tsx:283–284`).

### The seven sentences

Each row: the **headline** (Playfair, one line), the **act** (DM Mono, scored ink, C6), where the act
lands, and what wins when a need outranks the default. Two of the seven are **templates over the
schedule's own date fields, not literal `stageCopy` strings** (C-AP-10) — marked ⌥ and costed in §7.

| Section | Headline (default state) | Act label | Δ from today (F18) |
|---|---|---|---|
| **brief** | `Decide on this inquiry` | `ACCEPT AND BEGIN` | was `Review the brief`; the folio's three verbs print beneath, unchanged |
| **discovery** | `Finish what you need to know` | `ADD SCOPE & ROOMS` | was `Continue Discovery` — **SP-18** |
| **direction** | `Draw up the direction` | `OPEN THE DRAFTING ROOM` | kept; the duplicate `CONTINUE DRAFTING` is demoted to a state line (F64) |
| **proposal** | `Sent Aug 19 · not opened yet` ⌥ | `NUDGE ERIN BYRNE` | was `Review signing controls` — **SP-12** |
| **project** | `The work is in motion — nothing is waiting on you` | `OPEN THE FF&E SCHEDULE` | was `Review active work` |
| **install** | `Install is three weeks out — Tuesday, September 15` ⌥ | `CHECK WHAT'S ARRIVING` | was `Review installation` |
| **care** | `Close the book on this one` | `RUN THE CLOSEOUT CHECKLIST` | was `Review closeout`; a care document now always shows a guide (F77) |

Each act lands on the body it names: the brief anchor · the first unfilled checklist row (`focusId`)
· `/drafting/{proposal_id}` (`:389–392`) · the send-wall state line (C13) ·
`ffe-region-heading-{projectId}` · FF&E's movement column · the `Closing the book` checklist.

### The states that outrank the default

| Trigger (existing derivation) | Headline | Act |
|---|---|---|
| `damage_claim` / `awaiting_inspection` | `The Fond du Lac console came in gouged — the carrier window closes tomorrow` | `FILE THE CLAIM` → the line's inspection drawer |
| `po_unacknowledged` | `PO-2026-0418 — fourteen days, no word from Sturdy Oak` | `CHASE STURDY OAK` → the line's PO detail (Δ: was routed to the Orders ledger, `:208–245`; the line is the body it acts on, C12) |
| client decision overdue | `The primary bedroom rug and nightstands — six days past due with Marit and Dale` | `CHASE THE APPROVAL` |
| designer spec overdue | `The reading chair fabric is three days past the workroom's COM date` | `PICK THE FABRIC` |
| `hesitating_proposal` | `Sent Aug 19 · six days, never opened` | `NUDGE ERIN BYRNE` |
| needs-attention reason · `unavailable` eyebrow | `Something on this job needs a decision.` · `Guidance is unavailable` | **SP-06** · **SP-08** |

Every act above is an existing destination. No new act is invented; five labels change and two
destinations are re-pointed at the body they act on.

---

## 4. The item-reach table

From an **open document**, project section, after Direction A. Counts are discrete acts; cells over
2 are declared exceptions.

| Item class | ≥1440 | 1280 | 390 |
|---|---|---|---|
| **Rooms** (this job's) | Spine `Rooms` row → lifts across paper + shelves — **1** | FF&E room headings — **0** (scroll); the lens has no substitute (F60, exception 2) | same — **0** |
| **Products** — an FF&E line | Index `Project · FF&E` → unfold — **2** | FF&E head on the paper → unfold — **1** | Mobile bar `In this document` → FF&E → unfold — **2** |
| **Products** — spec attributes | unfold → `Edit spec details →` — **3** *(exception 1)* | **2** | **3** |
| **Boards** | Shelf `Mood boards` → leaf → `Start a board` — **1** | Drawer `Find anything` → `This surface` → `Mood boards` — **2**, both printed | `More` → `In this document` → `Boards` — **2** |

| **Documents — plans** | Shelf `Plan room` — **1** | Folio row `Plan room →` — **1** | Folio row — **1** |
| **Documents — spec book** | Shelf `Spec book` — **1** | FF&E head `Spec book →` — **1** | same — **1** |
| **Money** · **Schedule** | Index rows — **1** each | On the paper — **1** each | On the paper — **1** each |
| **People** (this job's roster) | Letterhead `Call sheet · {n}` or the shelf — **1** | Letterhead `Call sheet · {n}` — **1** | Instruments row — **1** |

**From `/desk`** (after Δ): a folio card opens the document (1), so every cell above is +1 — except
the four document-scoped surfaces, which ⌘K pairs with a recent document (`Spec book · Vandersteen`
and its three siblings) — **2 acts** each (F29, F48, F51, F82). A stage question is **2 acts**:
header `Find anything ⌘K` → the `WHERE THE WORK STANDS` group, no typing (F04).

### Declared exceptions (every cell >2, and the two capability gaps)

1. **Spec attributes = 3.** Editable only in the spec-book route (F57); SP-19 adds the line-scoped
   link. Making them editable on the paper is a new editing surface — not Lane A.
2. **The room lens below 1440 = unavailable.** C8 makes the lens part of the ≥1440 spine and
   `room-lens-context.tsx` releases a held room below it (F60). No filter is added: at 1280 the room
   headings group, the *hold* is lost.
3. **Boards at 1280 = 2 via the register.** C9 keeps boards on the shelf outside speccing, C8 keeps
   the shelf ≥1440; after §2.2 both acts are printed — recognition twice, not the recall path P1
   named as her give-up point (`25-panel-p1.md:126–131`). §10 reports T5 per tier.
4. **`More` at 390 = 2.** One tap to open the group — the drawer's `Ledgers` cost today.

### One region owns money (F08, C-AF-06)

v1 listed F08 as addressed on the strength of a rename; a rename does not reduce a door count. The
move, labels only: **the Money region's `DRAW AN INVOICE` is the only unscoped invoice door**, and
every other names its scope — FF&E's `BILL 3 UNINVOICED LINES →`, ⌘K's `Draw an invoice ·
Vandersteen`, the Desk's `Draw an invoice · new`. Four doors stay four, each a different starting
point; three now say so, one is unqualified. C7 already governs which is inked.

### The Orders sheet gets the word she is looking for (F06, C-AP-03)

F06 fell through v1's coverage net; the stray `(F06-adjacent)` tag on the Folio's plan-room door was
a mislabel, removed. The move: Orders sheet rows print an acknowledgement state beside the existing
`RECEIVED / INSPECT`, `IN TRANSIT`, `NOT SENT` chips — `ACK JUL 29` or `NO ACK · 14 DAYS` — from the
fields `po_unacknowledged` already reads. That is the sheet P4 and P1 actually opened
(`28-panel-p4.md:227–240`, `25-panel-p1.md:250–256`), and the general form of T13. F67 stands:
Orders remains studio-wide.

### Install and care documents, explicitly (F14, F48, SP-01)

Today an install or care document loses the index, rooms block and every shelf at **every width**
(`page.tsx:938–952`); the `Spec book →` link sits inside a `mode === 'project'` guard nested *within*
the install branch (`ffe-section.tsx:1058–1063`), so it never prints (F48, blocker); and the care
head prints `Install`, because the heading ternary (`:1036–1038`) reads `mode`, not the
`sectionKey="care"` already threaded in (SP-01, F03).

**After Direction A:** the blocks mount on install and care at ≥1440, the index deriving from those
spreads' own mount order (C11 — approvals → schedule → ffe; money does not mount on install per
I141, so the index prints three rows and invents no fourth). The inner guard is deleted so
`Spec book →` prints on install. The ternary keys off `sectionKey`, so a care head reads **`Care`**
and its empty state **`No FF&E lines remain open for care.`** (SP-01, quoted exactly). Install reach
then equals the table above minus the money row — that gap stays open (I141). A second cost, named
honestly: F48 routes P4 to the spec book from more places while F58's `RECEIVED`/`DELIVERED`
mismatch is unresolved, so she meets that trust-breaking moment more often than today (C-AP-12).

---

## 5. Lexicon stance

Rule throughout (`patina-brand-voice`): plain-spoken Midwest, the studio word paired with the trade
word where the trade word is true, never engine/AI framing. Nothing is renamed for elegance — only
where two things share a word, one thing has three, or the word is not the thing.

| Old label (file:line) | New label | Why |
|---|---|---|
| `Design authority` — region name (`document-index.ts:36–52`, `money-region.tsx:295`) | **`Money`** (eyebrow `The money · one region`) | The region's own eyebrow already said MONEY; the head said the opposite and P2/P3 read it as permissions (F09). |
| `Design authority` — ladder rung 1 (`money-region.tsx:309–313`) | **`Budget · $184,500 approved`** | v1 kept `Authority` here, but P3 misread the bare *word* (`27-panel-p3.md:16`), so moving it down a level kept the risk (C-AP-07). `Design authority` now retires from the surface entirely. |
| Index row `Design authority / NO AUTHORITY YET` (`spine-shelved-blocks.tsx:109–115`) | **`Money / $17,500 owed`** | The index reported the one empty tier while $141,600 moved (F61). It now reports the live rung. |
| `Knowledge` shelf (`shelves.ts:62–68`) | **retired** | Named a surface that does not exist, redirected to a permanent drawer door, called itself three things (F12). I136 asked for the ruling; the answer is subtraction. |
| `The Rooms` — drawer + `g r` (`registry.tsx:106–119`) | **`The Scans`** · `measured rooms, from the field` | Three things were called room (F17); the letterhead already calls these *scans* (`letterhead-instruments.tsx:351`). `g r` and every alias stay. |
| `Studio pulse` (`studio-pulse.tsx:111`) | **`The studio today`** | `The Pulse` is already the client's Friday letter (`letterhead-instruments.tsx:368`). Recomposed (F39/F65). |
| `Studio books` (`studio-drawer.tsx:361`) | **`Ledgers`** | The Desk calls the same objects `Ledgers` (`desk-contents.tsx:204`); `books` collides with `Closing the book`. C20. |
| `Previous work · {n} complete` (`previous-work.tsx:45`) | **`The record · {n} complete`** | Canon names it The Record (I137 :8608); the screen never said so (F90). |

Shorter moves, same rule: `Plan room` keeps the trade word and gains the gloss `the drawing set`;
the spine's `Rooms` block is unchanged, since inside one document "rooms" means this job's rooms;
the fold seam becomes `Schedule dates` (SP-02) and the `Committed` row `Authorized` (SP-03); FF&E's
`Add to project` becomes `Add a line` and `Team…` becomes `Add to the team` (SP-09/SP-10); the
`Unsorted` group becomes `Not in a room yet`, pointing at the `Add a room` line already at the foot
of the list (F05, C12); the guide's boilerplate and ⌘K's Engine framing go to SP-06 and SP-07.
Kept: `Closing the book` and `The Post` (SP-11/SP-15 tie the inbox to `Message {Family}` without
merging them); `In this document`, reused by the mobile `More` group; and `THE STUDIO` — F94 wants
canon's `Contents`, but R95 governs the block's contents, not its name.

### The money ladder prints the whole specimen (C-AP-04)

v1 printed `Authorized` and `Moved` as the same $141,600 under two definitions and never printed §8's
invoiced or paid figures. The ladder now shows its arithmetic; all five figures appear:

```
Budget      $184,500 approved   what the client has agreed to fund
Plan        $171,240 specified  what the plan intends to spend
Authorized  $141,600 ordered    what is contractually owed to makers          (SP-03)
Moved       $62,700 in motion — ordered $141,600 less $78,900 paid out        (SP-04)
Owed        $17,500 out · Invoice 2026-114, 22 days · $96,400 billed to date  (F16)
Not drawn   $12,300 deposit · PO-2026-0418, 50% at release                    (F16)
```

`Moved` is now a different number from `Authorized` — the number SP-04's own gloss already claims it
is. Re-deriving that row is a small derivation, not a string; it is costed in §7.

### The seven section names vs the Patina Six (F42, I114)

Direction A **does not map them** — I114 is Kody's ruling and nothing here depends on it. One
sentence prints under the schedule's phase-template block, the one place both vocabularies appear on
one paper: *"The six phases are how the work is scheduled. The document's own sections — Brief
through Care — are how it is filed."* If Kody rules I114, that sentence is deleted.

---

## 6. Five mock screens — drawing instructions

All five render **the Vandersteen residence** (§8): today **Tuesday, August 25, 2026**, timer
**0:47**, The Post an unlabelled dot. Playfair for names and headlines, Inter for body, DM Mono for
every label, act, and status. Scored ink only — no boxes, fills, shadows (C2, C6); terracotta and
clay never carry body text (F56).

### M1 — `/desk` at ≥1440

Single 1120px measure, no rails.

1. **Header.** `Good afternoon, Leah` / `TUESDAY · AUGUST 25`; right-aligned `＋ CAPTURE A LEAD` sub
   `BEGIN A BRIEF`, `＋ OPEN A PROJECT` sub `NO PROPOSAL NEEDED` (F24), `FIND ANYTHING ⌘K`.
2. **Needs your hand · 5.** Eyebrow `NEEDS YOUR HAND  5`, beneath it `FIVE IN REACH · ONE QUIET
   BELOW` (F23). Five folio cards, each tabbed in its need kind's stamp colour (**SP-20**):
   Vandersteen `three days past the workroom's COM date` · `PICK THE FABRIC →` | Byrne `Sent Aug 19 ·
   six days, never opened` · `NUDGE ERIN BYRNE →` | Okonkwo `punch list still open` · `WORK THE PUNCH
   LIST →` | Reinhardt `0 of 5 essentials captured` · `ADD SCOPE & ROOMS →` (**SP-18**) | Kaminski
   `OPEN THE DRAFTING ROOM →`. Footer `5 IN REACH · 1 FOLDED BELOW`.
3. **The studio today** (F39/F65). One Playfair-italic sentence, each stage phrase drawn with the
   surface's own act underline — visibly a doorway, not prose: `One in install · one in procurement ·
   one in direction · one in discovery · one letter out.` Beneath, in Inter: `Since Friday: the
   console arrived damaged, and the Byrnes still haven't opened their agreement.`
4–5. **Recent boards** strip, unchanged; then **The Studio** (Contents, R95) — §2.1's three columns,
   every row now carrying a static sub-label (F38): `Library · pieces and makers ↗`, `The Scans ·
   measured rooms ↗`, `Orders · POs, receiving, claims`, and so on.
6. **⌘K, drawn open beside the artboard** (the T2 route). Empty query, nothing typed. First group
   `WHERE THE WORK STANDS`: `In install · 1  Okonkwo kitchen · punch list open`, `In procurement · 1
   Vandersteen residence`, `In direction · 1  Kaminski condo`, `In discovery · 1  Reinhardt lake
   house`, `Out for signature · 1  The Byrne remodel · sent Aug 19`. Then `RECENT`, `ROOMS &
   LEDGERS`, `BEGIN`, `STUDIO` (F37); placeholder `Find a document or a ledger…` (**SP-07**).
7. **Studio Drawer:** wordmark · `Library` · `People` · `The Scans` · `Ledgers ↑` · **`Find anything
   ⌘K`** (Δ) · `IN HAND TODAY 0:47` · `THE POST ●` (a dot, never a count — C4) · nameplate.

### M2 — `/doc/[Vandersteen]`, project section, ≥1440

Three columns: 200px spine · 1040px paper · 232px margin.

**Spine.** `← PUT DOWN` · seven marks, the fifth inked · `Project / ACTIVE` · then §2.2's three
blocks on the specimen's values: `IN THIS DOCUMENT` — approvals `2 awaiting decision`, `Schedule
Install Sept 2026`, `FF&E 36 pieces · 4 rooms`, **`Money $17,500 owed`** (Δ F09/F61); `ROOMS` — the
four rooms with their counts, under `Take a room in hand · nothing hides`; `THE SHELVES` — `Plan room
the drawing set · nothing filed`, `Spec book 34 specified · by room`, `Mood boards 3 boards`, `Call
sheet 5 on the roster` (Knowledge retired, F12). Foot: `● IN HAND 0:47  PAUSE  + LOG`.

**Paper, top to bottom.**

1. **Letterhead.** `Vandersteen residence` · italic `for Marit & Dale Vandersteen ↗` · vitals
   `PROCUREMENT & ORDERS · TARGET SEPT 2026 · $184,500`.
2. **Red-letter zone** — `NEEDS ATTENTION · IN ONE PLACE`, §3's two rows in tie-break order: the
   reading chair's COM date (`SPEC DUE` · `PICK THE FABRIC`) leads on rank 1, an outside deadline
   inside seven days; the primary bedroom approval (`DECISION DUE` · `CHASE THE APPROVAL`) follows.
3–7. **Instruments, seams, bodies** — `MESSAGE THE VANDERSTEENS · PREVIEW AS · SHARING · MILESTONES ·
   CALL SHEET · 5`; `Client approvals 2 awaiting decision UNFOLD ↓`; `Schedule dates  Install
   Tuesday, September 15  UNFOLD ↓` (**SP-02**); `Schedule · 6 phases · Procurement & Orders active`
   / `ADJUST DATES`, the F42 sentence once below it; `FOLIO · 4 FILES ＋ FILE  PLAN ROOM →`.
8. **Project · FF&E** — head `4 rooms · 36 lines · 1 damaged · 1 PO unanswered` · ledger
   **`FILE THE CLAIM`** (elected leader, F34/F08) · `SPEC THE 2 UNSPECIFIED →` · `BILL 3 UNINVOICED
   LINES →` · `ADD A LINE` (**SP-09**) · `SPEC BOOK →` · `FOLD ↑`. Body grouped by room heading —
   Living room 14 (console `DAMAGED` `$4,300`; reading chair `SPEC DUE`), Dining room 8 (`Sturdy Oak
   Woodworks` `ORDERED` `$14,880`, `PO-2026-0418 · sent Aug 11 · no acknowledgement in 14 days`),
   Primary bedroom 9 (`Hartland wool rug` `AWAITING APPROVAL`), Mudroom 5. Foot `ADD A ROOM` (C12).
9. **Money** — **drawn open, rungs on screen** (C-AP-08): the fold default keys off live money, so
   this project opens and F96's quiet one still folds. Head `Money` / eyebrow `THE MONEY · ONE
   REGION` / status `$17,500 owed · $12,300 not drawn` / ledger `DRAW AN INVOICE` (leader, the one
   unscoped invoice door) · `ADD A CHANGE` · `HOURS · THIS PROJECT ↗`; rungs as §5 prints them. The
   explainer drops the migration note (**SP-05**); `Sync from the schedule` becomes scored ink (F73).
10. **Closing the book** seam · **The record · 3 complete** (F90) · colophon `Middlewest Studio ·
    hands on the work: you` · `BRIEF A VENDOR` · `HOLD` · `ARCHIVE` · `ADD TO THE TEAM` (**SP-10**).
    **Margin:** `IN THE MARGIN ＋ NOTE` — `MONEY · DEPOSIT DUE / $12,300`, `DECISION · PRIMARY
    BEDROOM`, `MESSAGE · MUDROOM BENCH`, `SETTLED · 4 ↓`.

### M3 — `/doc/[Vandersteen]` at 1280

Two columns: 56px spine · paper · `MARGIN ← · 3` tab (F78).

**Spine at 56px.** `←` above `PUT / DOWN` in 8px DM Mono; seven marks stacked, and under the fifth
the active section's name — `PROJECT` — printed for the first time at this tier (F02). Then
`● IN HAND / 0:47`. **No index, no rooms block, no shelves** — C8 untouched.

**Drawer** (≥1180) carries `FIND ANYTHING ⌘K`; the artboard shows the register open on its empty
query, `THIS SURFACE` printed — `Plan room · Spec book · Mood boards · Call sheet`, each sub-labelled
`this project`. **Paper:** M2 at the narrower measure, each door on the body it acts on — `PLAN
ROOM →` on the Folio, `SPEC THE 2 UNSPECIFIED →` and `SPEC BOOK →` on the FF&E head, `CALL SHEET · 5`
on the instruments row. Boards ride the register. Every task in §4 but the room *lens* is answerable
at 1280 with no shelved block and no new tier.

### M4 — `/doc/[Vandersteen]` at 390

One column, full-bleed (C17). Letterhead → red-letter zone (two rows, act beneath each) →
instruments, one per line → margin chips → regions.

- **FF&E head recomposed (F28, blocker):** line 1 `Project · FF&E`, line 2 `4 rooms · 36 lines · 1
  damaged`, line 3 the acts in reading order — `FILE THE CLAIM` · `SPEC BOOK →` · `ADD A LINE`. The
  leader never overlaps the heading because it no longer shares its line; status never truncates
  mid-word (F87).
- **Mobile bar:** left `IN THIS DOCUMENT / Project`; centre the elected act at full length,
  `PICK THE FABRIC` (F07); right `··· MORE`.
- **`More` menu:** eyebrow `IN THIS DOCUMENT` — `Plan room`, `Spec book`, `Boards`, `Call sheet`;
  then `Find anything ⌘K` (F49, blocker); then `Time in hand · 0:47`, `The Post NEW` (**SP-15**),
  `Ledgers`, `Leave a note`. The mobile spine sheet is unchanged — F15 is ruled-against C8/D3.

### M5 — Tuesday 3:40pm: the carrier window (stage-specific)

**Why this one.** It proves the thesis: the claim already exists as a lifecycle on the FF&E line and
stays invisible until she leaves the job for the Orders ledger (T14, F14, F48).

- **FF&E head:** leader `FILE THE CLAIM`; its quiet line reads `The carrier window on the console
  closes tomorrow, Aug 26.`
- **The unfolded line**, Living room: `Brass-and-oak console — Fond du Lac Ironworks · ×1 · $4,300 ·
  DAMAGED` — `PO · CER-0091 · sent Jul 28 · acknowledged Jul 29` / `MOVEMENT · shipped Aug 15 ·
  delivered Aug 19` / `RECEIVING · top panel gouged, photographed Aug 19` / `CLAIM · drafted, not
  filed · window closes Aug 26` / acts `FILE THE CLAIM` · `SEE THE RECEIVING PHOTOS` · `EDIT SPEC
  DETAILS →` (**SP-19**).
- **Two rows below,** the Sturdy Oak line: `PO-2026-0418 · sent Aug 11 · no acknowledgement in 14
  days` · `CHASE STURDY OAK`. **Orders sheet inset:** the same PO studio-wide, reading
  `PO-2026-0418  STURDY OAK  NO ACK · 14 DAYS  IN TRANSIT` (F06).
- **Two mount-condition insets** (C-AP-11), beside the main artboard, both ≥1440: *install* — spine
  `IN THIS DOCUMENT / Client approvals · Schedule · Install · FF&E` plus `ROOMS` and `THE SHELVES`
  with `Spec book`; head `Install`, `SPEC BOOK →` printed. *care* — same spine; head reads
  **`Care`**, its empty state **`No FF&E lines remain open for care.`** (SP-01), and the guide prints
  `Close the book on this one` / `RUN THE CLOSEOUT CHECKLIST` where today it prints nothing (F77).
  Today both spines lose all three blocks at every width (F14), the spec book has no door (F48), and
  the care head says `Install` (F03).

---

## 7. Keeps · Refuses · Costs

**Keeps:** the Esc chain's LIFO · `← Put down` · the send-wall state line as the model for
state-plus-one-act (C13) · `Add a room` at the foot of the room list (C12) · nothing hover-gated ·
the index's scroll-spy · fold persistence · piece + PO state + price on one row · honest empties.

**Refuses:** no fleet or roster tier (C-AP-02 — P2's Monday read is Lane B's); no shelved block
below 1440 or on the mobile spine sheet (C8, D3); no room *filter*; no split/peek/tab (C1); no
drawer badge (C4); no toast (C5); no boxed act (C6); no second inked leader (C7); no boards on the
paper outside speccing (C9); no reorder of `PROJECT_PAPER_ORDER` (C11); no sealing semantics, no
`active_section`, no dependency on I114.

| Move | Files | Shape |
|---|---|---|
| Seven sentences, tie-break, `Review now` retirement; ⌥ install/care headlines | `document-guide.ts:91–141, 208–245, 316–397` | strings + one comparator; the ⌥ pair are templates over the schedule's date fields, not `stageCopy` strings (C-AP-10) |
| Zero-row zone falls through to the guide · shelved blocks mount on install/care | `page.tsx:1111–1118`, `red-letter-zone.tsx:25` · `page.tsx:938–952` | one conditional · one predicate (index rows follow the spread's mount order, C11) |
| `Spec book →` ungated | **`ffe-section.tsx:1058–1063`** — the inner `mode === 'project'` guard nested in the install branch (`:1031`); `:1009–1015` is the unrelated ledger entry for the project branch (C-AF-04) | delete one condition |
| Care head + empty state (SP-01) | `ffe-section.tsx:1036–1038` ternary — key off `sectionKey`, not `mode` (C-AF-05) | two strings, one condition |
| FF&E leader election | `ffe-section.tsx:971–1021, 1116–1125`; needs-scan reusing `document-guide-inputs.ts:93–104`; `highlightLineId` (already a prop) as the click target (C-AF-03) | new derivation + reused targeting, not ordering alone |
| Money rename, `Budget` rung, `Moved` re-derivation, `Owed`/`Not drawn`, fold default, index value | `money-region.tsx:245–336`, `document-index.ts:34–55`, `spine-shelved-blocks.tsx:103–116` | labels + 3 rows |
| Money-door scoping (F08) · Orders acknowledgement chip (F06) · lexicon pass | `ffe-section.tsx`, `command-bar.tsx`, `desk-contents.tsx`, Orders rows · `registry.tsx`, `shelves.ts`, `studio-drawer.tsx`, `studio-pulse.tsx`, `previous-work.tsx` | three labels, one derived chip, strings |
| Desk `Open the Drafting Room` | `desk-contents.tsx:136–165` + a shared `openDraftingRoom()` from `command-bar.tsx:371–375` (C-AF-01) | new opener, not a string |
| ⌘K `WHERE THE WORK STANDS` | `command-bar.tsx` results builder — group-by-stage over `liveDocs` (`:282–283`, already loaded, `:32, 180`) (C-AF-02) | new derivation, no new query |
| ⌘K `This surface` + paired rows + group order · drawer `Find anything ⌘K` · mobile `More` group | `command-bar.tsx:340–680`, `registry.tsx:77–351` · `studio-drawer.tsx` · `mobile-bar.tsx:237–339` | match table, registry rows, two menu rows (no badge, C4) |
| Compact spine prints its label + put-down word · skip link (F55) · contrast pass (F56) | `doc-spine.tsx:48–54, 122–130` · `(document)/layout.tsx` · tokens, ~374 sites | a breakpoint on two strings · one component · its own pass, costed |

**Amendment ledger: empty of amendments, not of work** (C-AF-08). Zero D- and zero R-entries are
touched, but six new I-entries are proposed — **I144** mount conditions (install/care spine,
spec-book gate, care head), **I145** leader election by state, **I146** the lexicon pass, **I147** ⌘K
stage answers and `This surface` rows, **I148** the mobile `In this document` group, **I149** the
drawer's `Find anything` door — plus a ledger entry recording Kody's verbal removal of the Thumb
Index (C19), which has no trace in DECISIONS.md. Six writes and one ratification of Kody's time.

---

## 8. First slice — "the sentence and the spine"

1. The seven stage sentences and acts, the reordered tie-break, the `Review now` retirement, the
   zero-row fall-through (F18, F41, F77).
2. The shelved blocks mount on install and care; the index derives from those spreads' own mount
   order; the inner `mode === 'project'` guard goes; the care head keys off `sectionKey` (F14, F48,
   **SP-01**).
3. Planks SP-06, SP-07, SP-08, SP-09, SP-12, SP-18 — string-only, all in these files.

**Files:** `document-guide.ts` · `page.tsx` (two predicates) · `ffe-section.tsx` (`:1058–1063` guard,
`:1036–1038` ternary) · `red-letter-zone.tsx` · `command-bar.tsx`. **Estimate: 5–7 days** (v1 said 4–6;
the ⌥ headlines are a derivation, C-AP-10).
**Leah-01 metric moved:** **time-to-true-read** first — the top sentence becomes an act instead of a
shrug on five of seven stages, and install and care stop opening blank. **Unaided acts** second: on
an install document the index, rooms and shelves reappear, so the spec book, plan room, roster and
boards stop being recall.

---

## 9. Landing on both baselines

**Flag off — today's paper.** Every move lands here first; none touches the `worktable` gate. The
guide, the zone, the spine, `PROJECT_PAPER_ORDER`, the registry, ⌘K, the drawer, the mobile bar and
every region head sit outside it (`page.tsx:280, 982`), so flag-off is the full direction.

**Flag on — the Worktable (C14, the destination).** Everything in §§3–6 is inherited unchanged:
`TableFrame` wraps the same regions rather than replacing them. **Delivery** — I141 lifts the release
ceremony to the table head; the leader election yields to the lift when it shows and elects the
sharpest exception when it does not. **Finalize** — the shelves swap to `The client's copy`, so M2's
four-shelf list is the project-subject list only and `Knowledge`'s retirement touches that list
alone. **Speccing** — the on-paper boards strip (C9/Q1) stays as ruled; every board door now reads
`Boards`, so three names become one (F62), and the rail's `+ Add a room` becomes `+ Add a room to
the scheme` (F63). Both papers then say the same seven sentences and open the same doors — the
precondition for the flag-on walk still owed (I143).

---

## 10. Coverage

**The five worst tasks, ordinally** (§1's thresholds). **T2** (1.50): the ⌘K stage group answers
"who's in install" one stage at a time — **P1's** version moves, **P2's** does not (her Monday fleet
read with totals is Lane B's, refused in §7). **T5** (2.50): ≥1440 and 390 move (leaf `Start a
board`, F30; a `More` row); 1280 stays two printed acts. **T6** (2.58): `Plan room →` on the Folio,
`Spec book →` ungated everywhere. **T14** (2.78): the claim leads the FF&E head and the guide, on the
line she stands on. **T13** (2.78): in-document via the line's provenance, general via F06's Orders
chip; **T9**'s studio-wide receivables stay unanswered.

**Blockers/highs addressed:** F02–F09, F14, F16–F18, F28–F30, F33, F35, F48–F52, F55, F57, F59, F61
(F04 partial by design). **Routed around:** F01 — no tier; doors move to the bodies they act on, plus
the register (ruled-against C8). **Out of scope:** F15, F32, F54, F60 (C8/D3/C14). **Deferred with
reasons:** F10 (chord hints need chrome), F53 (a new act surface), F56 (its own accessibility pass,
costed), F58 (a data ruling — and P4 pays for F48's wider reach, C-AP-12).
**Medium/low addressed:** F12, F13, F23, F24, F26, F34, F37–F44, F46, F47, F62–F65, F67, F72–F78,
F81–F83, F87, F88, F90–F93, F96, F100. **Not addressed:** F11, F21, F25, F45, F66, F70, F71,
F79–F80, F84–F86, F94–F95, F97–F99, F101.

---

## 11. Revision log

- **C-AP-01 accepted** — ⌘K's empty-query stage group leads T2; the Desk phrase is a second, ink-treated door ("cut the phrase" rejected).
- **C-AP-02 accepted** — §10 names whose T2/T9 moves (P1) and whose does not (P2).
- **C-AP-03 accepted** — F06 named and fixed (Orders acknowledgement chip); the mislabel removed.
- **C-AP-04 accepted** — `Moved` re-derived to $62,700; all five §8 money figures print.
- **C-AP-05 accepted** — 1280 boards use a printed drawer door and `This surface` row; T5 per tier.
- **C-AP-06 accepted in part** — dated urgency outranks ownership inside seven days; B's "money at risk" rank rejected as underivable here.
- **C-AP-07 accepted** — the rung becomes `Budget`; `Design authority` leaves the surface.
- **C-AP-08 accepted in part** — M2 already drew Money open and F96 is scoped to quiet projects; §6 now states the rule.
- **C-AP-09 accepted** — §2.2 states A's F14 fix is ≥1440-only by design.
- **C-AP-10 accepted** — two ⌥ headlines costed as templates; estimate 5–7 days.
- **C-AP-11 accepted in part** — M5 gains a drawn care inset with SP-01's strings; a sixth mock and a §8 amendment rejected (lane rules fix both).
- **C-AP-12 accepted** — §4 names P4's second-order cost beside F48.
- **C-AF-01 accepted** — F51 costed as a shared `openDraftingRoom()`.
- **C-AF-02 accepted** — the stage group costed as a reducer over `liveDocs`.
- **C-AF-03 accepted** — the election costed as a needs-scan plus `highlightLineId` targeting.
- **C-AF-04 accepted** — re-cited to `ffe-section.tsx:1058–1063`, re-checked in the live tree.
- **C-AF-05 accepted** — SP-01 costed at the `:1036–1038` ternary, keyed off `sectionKey`.
- **C-AF-06 accepted** — F08 gets a real move: one unscoped invoice door, the rest name their scope.
- **C-AF-07 accepted** — tenths-place scores withdrawn; thresholds stated ordinally.
- **C-AF-08 accepted** — §7 states six I-entries and one C19 ratification as ledger work.

**Thesis sharpened** (both critics judged the lanes distinct; §1 now says why structurally): A keeps
the shelved-spine organ and pays for narrow tiers by moving each door onto the body it acts on and
printing the register's own doorway; B deletes that organ. Opposite treatment of the same
components.
