# D1 — The buying spine: target interaction and information architecture

**Role:** principal interaction designer. **Date:** 2026-10-05. **Repo:** main @ `4207b8e2d`, main checkout only.
**Inputs:** briefs `briefing/current-state-buying-flow.md` and `briefing/current-state-intake.md`; memos `research/r1-buying-flow.md` (today's clicks), `r2-item-intake.md` (intake and field survival), `r3-ffe-buyer.md` (how studios buy, 48-point checklist), `r4-competitors.md`, `r5-studio-moment.md` (first hire, the two role systems).
**Evidence rule:** code only, no portal walk. `DP/` = `apps/designer-portal/src/`.
**Confidence on code claims:**
- **[H]** I read the line myself this pass.
- **[M]** A research memo read it; I checked nearby code, not the exact line.
- **[I]** Inferred from the shape of the code.

Design proposals themselves carry no confidence tag. Each one states the data it needs and whether that data exists.

**Held open, never resolved here:**
- **V1**, the margin pocket.
- Pricing-mechanics **R1–R11** (`artifacts/pricing-mechanics-2026-09-05/README.md:40-45`).
- The deck-import price basis, **R-DI4/R-DI5** (`docs/vision/VISION-DECISIONS.md:339-378`).

Every place a screen would need one of these answers is marked **ruling needed**. The screen shows the safe default, which is today's behaviour. I also raise four **new** questions this design surfaces. They are listed as N1–N4 in §8. They are not resolved either.

---

## 1. The answer, short

1. **Yes: one buying spine per job. It is not a new page.** The spine is the Project section of The Document, the same FF&E rows, given a second and third *reading*: `read by · room · maker · next act`. Room is today's reading. **Maker** groups the same lines by vendor, then by PO, and adds status and money columns. **Next act** groups the lines by what each one is waiting on. Catalog, ad-hoc, custom/workroom, finds, store buys and Patina-maker lines all sit in these rows together. The Orders book stays the *cross-job* register of the same facts. When it opens from a job, it opens on that job.
2. **The row is the line, meaning the thing the client agreed to.** A PO is a group of lines. Freight, receiving, storage and similar costs are *riders* folded under the PO or line they belong to. They never pose as pieces. Samples and memos are parked as a side journey.
3. **One readiness rule decides when any line is orderable.** One pure derivation feeds the line unfold, the Vendors page "Order all" and the order paper. Today there are two rules, and they disagree (`DP/components/document/line-unfold.tsx:75` vs `orders-book-vendors.tsx:80-84` **[H]**). The rule speaks in reasons, not refusals: *needs a maker · needs a trade cost · needs the client's yes · needs the CFA*. That gives an off-catalog line the same path to a PO as a catalog line: fill in what it lacks.
4. **"Add anything" lands every source on one line card.** The sources are library, link, photo, vendor quote PDF, schedule import, deck, custom piece, find and named need. The card is called *"The line, as it will be bought."* It asks for the same buy facts whatever the source, and lets you create a maker inline.
5. **The Order Assistant becomes the order paper.** It stops being four steps in a side panel. It becomes the PO itself, editable in place: ship-to, freight, terms, a note to the vendor. The send is the paper's terminal act, with the amount inside the label. This retires the second send UI and the hardcoded ship-to.
6. **The money-losing holes get acts on the rows where the work already happens:**
   - ack check (compare the vendor's acknowledgment to our PO)
   - status advance, with tracking
   - recording what the studio paid
   - the claim clock
   - "Placed" on install
   - billing a deposit, then a balance

   Most of these wire up backend that already exists and has no caller. For example, `useLogPaymentPaid`, `useUpdatePurchaseOrderStatus` and `useAdvancePaymentToDue` have zero portal callers (grep this pass: only `packages/supabase/src/hooks/{index,use-procurement}.ts` and a test reference them **[H]**). `start_purchase_order_change` exists with no UI (`supabase/migrations/00435_ffe_ga_rpc_boundaries.sql:849-869` **[H]**).
7. **On the phone:** Field does the site check-in (the receiver's dock). The portal at 390 does the owner's release of a junior's held orders, plus quick store-buy records. Field is "The Document off-desk", not a fourth surface (V11 companion entry, `VISION-DECISIONS.md:249-252` **[H]**).

---

## 2. The grammar I am designing with

These are house rules, with sources. Every screen below uses only these.

| Idiom | Rule | Source |
|---|---|---|
| **Unfold** | A line opens in place under itself. The schedule never routes away to show a line. | `DP/components/document/ffe-section.tsx:531-575` **[H]** |
| **Sheet** | A laid paper overlay (`DocSheet`), 640px, or 760px with `wide`. It never unmounts the document beneath. The head is icon + DM-mono title + page + "put back · esc". | `DP/components/document/overlays/doc-sheet.tsx:4-23,227-228,385` **[H]** |
| **Text-link pages** | Book pages and lenses are DM-mono words, never tabs: `Ledger · The Week · Receiving · Vendors`; `project · all …`; `payment · due · pending · paid`. | `DP/components/document/orders-ledger.tsx:1-14,56-61,156-161` **[H]** |
| **Three act tiers + terminal** | Tertiary is a scored word. Secondary is the two-score word. **Terminal** is filled charcoal, spent only where money moves or a paper is signed, with the amount inside the label ("Send to Hale · $6,900.00"). One consequence sentence sits above every terminal act. Use `aria-disabled` with a named reason, never `disabled`. Once done, the act is replaced by its dated record. | `docs/design/house-sheet/SPEC.md` §A5 **[H]**; V9 principle 3, `VISION-DECISIONS.md:166-169` **[H]** |
| **Zero shadows** | No depth except the one `--elevation-sheet` token, at three sites. | `apps/designer-portal/CLAUDE.md` D4 **[H]** |
| **Stamps, not badges** | A stamp is a 1px-bordered text pill, a table's state column. No red/green state, no counts in bubbles. | `VISION.md` §6; V11 `VISION-DECISIONS.md:236-241` **[H]** |
| **Front matter over rows** | A total may only sit above the rows that produced it. A bare total is a dashboard, and dashboards are refused. | V11 `VISION-DECISIONS.md:228-233` **[H]** |
| **Reasons, not refusals** | An ineligible line shows a lowercase mono reason where its stamp would be. | `ffe-section.tsx:461-466` **[H]** |
| **Inline failure** | No toasts. A failure reads as an inline band at the act site. | DECISIONS I109 / R83 **[H]**. The Order Assistant's two payment prompts are still silent toasts, `order-assistant/index.tsx`, listed there **[H]** |
| **Honesty rule** | A lifecycle step is drawn as settled only where a fact proves it. Steps with no fact read `no-record`. | `DP/lib/document/procurement-lifecycle.ts:11-18` **[H]** |
| **Capture where the work happened; review in the drawer ledger** | Amended D9. | `VISION-DECISIONS.md:253-255` **[H]** |
| **Drafts, never sends** | Anything Patina drafts for a vendor or client lands for a human to release. | CLAUDE.md Agent OS rules |
| **Type** | Money is DM Mono 15px tabular (`.t-money`). Names are Playfair (`.t-d3`). Running heads are DM Mono 11px caps (`.t-head`). Wrap, never truncate. 24px module. | `docs/design/house-sheet/SPEC.md` §A3–A4 **[H]** |

The names I keep: **Desk, Document, Project section, unfold, Orders book, Ledger, The Week, Receiving, Vendors, Accounts** (client invoices), **Studio Drawer**.

The new display words I introduce, each a plain noun: *the order paper*, *the buy* (a band), *read by maker / next act*, *a custom piece*, *a find*, *a store buy*, *riders*, *held for release*, *the acknowledgment check*, *placed*. None says "AI". Where Patina searches for something, the copy says "Patina looks for it."

---

## 3. Information architecture

### 3.1 Where each buying act lives

The home is where the act is *done*. The other doors open the same component.

| Act | Home (done here) | Other doors | Today |
|---|---|---|---|
| Add a piece (any source) | Document → Project section → **Add to the job** sheet | ⌘K "add"; Field capture; extension; deck review ledger | "Add a line" sheet with 5 rows, one dead (`DP/components/document/schedule/add-to-project-sheet.tsx:262-282` **[H]**) |
| Edit buy facts (maker, SKU, finish, dims, trade cost, lead) | **Line unfold → The buy band** | Spec book (stays the long-form room) | SKU/finish/dims are spec-book-only (`ffe-section.tsx:552-571` comment **[H]**). Price/vendor hooks throw "RPC-only" **[M]** |
| Ask for / record a quote | Line unfold → Quote cell | Vendors → Thread | `vendor_quote_requests` has no project or line link **[M]** |
| See what's ready, what's waiting | Project section, **read by next act** | Desk need lines | Absent. By Status was removed with the zones |
| Make a PO | **The order paper** (wide sheet) | Line unfold "Order"; Vendors "Order all"; read-by-maker group head "Order N" | Order Assistant side panel, 4 steps **[M]** |
| Hold / release (junior → owner) | The order paper → "Hold for release"; owner releases in Ledger's **Held for release** group | Desk need line for owners/admins | Absent (`r5` §2 step 3 **[H]** by grep) |
| Send | The order paper's terminal act | Ledger row "send →" opens the same paper | Two send UIs plus one orphan **[M]**; note field is a TODO (`DP/components/portal/procurement/po-send-actions.tsx:26` **[H]**) |
| Log ack + compare | **The acknowledgment check** sheet | Line unfold Order cell; Ledger row | Ledger and resend paper only; vendor # + ETA only **[H]** |
| Production / shipped / tracking | Line unfold → Movement cell; Ledger row unfold | The Week (read-only) | No writer **[H]** |
| Record a vendor payment | Ledger row unfold → Money; line unfold → Money cell | Ledger `payment · due` lens | No writer **[H]** |
| Receive / inspect / claim | Receiving page (desk); **Field check-in** (dock) | Line unfold Receiving cell | Desktop has no photos; no claim clock **[H]** |
| Place (install) / punch | Project section in **install mode** → line "Placed" | Field (site) | Install mode counts "N of M installed" (`ffe-section.tsx:1030-1036` **[H]**) but nothing writes `installed` **[M]** |
| Bill the client | Accounts (invoice composer), opened from the line "Bill" or section "Bill N uninvoiced" | Order paper consequence sentence "Bill the client first →" | Works; one billing slot per line **[M]** |

### 3.2 The map

```
                        STUDIO DRAWER (g o)                    DESK
                              │                                  │ need lines: "Hale hasn't acknowledged
                              ▼                                  │  PO 1042 · sent 6 days ago" · "2 orders
   ┌────────────── ORDERS BOOK (sheet, cross-job) ─────────────┐ │  held for your release · $9,720.00"
   │ Ledger · The Week · Receiving · Vendors                   │◄┘
   │ project · Kochaver ✕ all     payment · all due pending paid│
   │  ├ Held for release (only when the rule is on)            │
   │  ├ PO rows (vendor groups) ── unfold: lines · ack · money │
   └───────────▲───────────────────────────────▲───────────────┘
               │ opens scoped to the job        │ same order paper / ack check sheets
   ┌───────────┴─── THE DOCUMENT /doc/[id] ─────┴──────────────┐
   │ PROJECT section   read by · room · maker · next act        │
   │   rows = lines (pieces) ── riders fold under their PO      │
   │   line unfold: trail · The buy · Quote · Order · Movement  │
   │                · Money · Receiving   → acts open sheets:   │
   │       [Add to the job]  [The order paper]  [Ack check]     │
   │       [Record payment]  [Check in]  [Bill → Accounts]      │
   │ INSTALL section (install mode) — Placed · punch            │
   └────────────────────────────────────────────────────────────┘
               ▲ capture (V11/D9): Field · extension · deck · ⌘K
```

### 3.3 The one row grain and its kinds

A **line** is what the client agreed to, or will agree to. It is a row in `project_ffe_items`. Every line has a **kind**, shown as a quiet DM-mono word under the maker line, never a badge:

| Kind | Display word | Buys through | Notes |
|---|---|---|---|
| Trade catalog | *(no word: the default)* | PO to vendor | Today's lane |
| Patina maker | `from Patina` | Stripe checkout; Patina POs the maker | Existing `is_patina_catalog` branch (`00186:85`, Order Assistant skip **[M]**). **V1 ruling needed** on every money figure beyond "what the studio pays at checkout" |
| Custom / workroom | `custom · Hale Upholstery` | Work order (a PO to the workroom) | Parent of a fabric child line when COM |
| Fabric (COM/COL) | `fabric for: Sofa` | PO to the mill, ship-to = the workroom | New child link. Fields generalise `com_details` (`00413:59,71` **[M]**) |
| A find | `a find · Brimfield` | A **purchase record**, not a PO: one-time seller, paid now | New model |
| A store buy | `store buy · CB2` | A **purchase record** with a receipt and card last-4 | New model |
| Named need | `to be found` | Not orderable until resolved | Today's `tbd` (`add-line-sheet.tsx` via `create_named_project_need` **[H]** r2) |

**Riders** are costs that are not pieces: freight, crating, receiving, storage, install labour, buyer's premium. Each attaches to a PO, a purchase record or a line. They render as one indented row under their parent and roll into the invoice composer's "uninvoiced" set. **R1 ruling needed** on how a rider's cost and its billed figure show to the client and to staff. **Reimbursables** are riders whose parent is the job itself: printing, mileage, sample fees.

### 3.4 The one readiness rule

`orderReadiness(line)` is a pure derivation in `DP/lib/document/`, in the idiom of `stamp-derivation.ts`. It returns `ready` or a list of reasons, in this order:

1. `needs a maker`: no `vendor_id`, or no one-time seller for a find. A PO needs `vendor_id` and `selected` (`00449:125-133` **[M]**). `purchase_orders.vendor_id` is NOT NULL (`00148_procurement_workspace_v1.sql:54` **[H]**).
2. `needs a trade cost`: trade cost null or 0. Deck imports arrive this way by design (R-DI4), and paste-link drafts null it (`product-picker-modal.tsx:710` **[M]**).
3. `needs the client's yes`: commercial = released and authorized (existing hard gate). Residential = line status `approved`. **N1 ruling needed** on whether residential stays warn-only, which is the default proposed below.
4. `needs the CFA`: COM fabric lines with no recorded CFA approval. Warn only.
5. `waiting on a decision`: `blocked_by_decision_id`, the same test Vendors uses (`orders-book-vendors.tsx:80-84` **[H]**).
6. `already on PO 1042`.

Reasons 1, 2 and 6 hard-stop the order paper; the database refuses those cases anyway. Reasons 3 (on residential) and 4 *warn*. The warning is a consequence sentence above the terminal act, never a block. This holds the posture of R9 ("warn, never block", `r5` §4 **[M]**) and of today's coverage step (`step-coverage.tsx:245-251` **[M]**).

---

## 4. Proposals

Each proposal carries:
- a tag: **UPDATE** (grows today's UI) or **OVERHAUL** (replaces a component's shape)
- the feature test: surface / studio moment / stream / promise
- its screens, its states and an ASCII layout
- the data it needs
- any rulings it depends on

The Document's proposals come first.

---

### D1-01 · Read by maker and read by next act — the buying spine in the Project section · **UPDATE**

**Feature test:**
- **Surface:** The Document, Project section.
- **Moment:** the first hire takes over buying while Leah designs; "what's left to buy on Kochaver, and what is each piece waiting on?"
- **Stream:** subscription floor. It protects the upside.
- **Promise:** the studio doesn't notice Patina. It replaces the spreadsheet a buyer keeps beside the schedule. It is front matter over rows, not a dashboard.

**Today:** the section groups by room (R25). A line shows thumb, name ×qty, vendor line, coverage note, stamp, optional authorization stamp and price (`ffe-section.tsx:367-529` **[H]**). There is no money-out column and no grouping by vendor or by next act.

**Screen S1 — Project section, read by maker (desktop ≥1280, 1100px measure).** The section head gains one text-link lens on the right, in the Ledger's lens grammar.

```
PROJECT                                                    read by · room · maker · next act
                                                                     ───── (scored, active)
Kochaver Residence                                  + Add to the job     Bill 6 uninvoiced →

42 lines · 31 with a maker · 18 on a PO · 4 arriving this week
on POs $48,210.00 · paid out $21,400.00                       ← .t-money, front matter
───────────────────────────────────────────────────────────── (hairline-strong)

HALE UPHOLSTERY  · workroom             PO 1042 · sent 2 Oct · acknowledged 4 Oct · ~28 Oct
  [48] Sofa, COM · ×1                   Living room   [IN PRODUCTION]     $6,480.00
       custom · Hale Upholstery
       ↳ [32] Fabric for Sofa — Pindler Orly, Flax · 19 yd → ships to Hale
              Pindler & Pindler · PO 1043 · CFA approved 3 Oct      [IN TRANSIT]   $1,140.00
  [48] Ottoman, COM · ×1                Living room   [IN PRODUCTION]     $1,920.00
       ↳ freight · white glove to Badger Receiving (estimate)                 $420.00
  Deposit $4,410.00 paid 3 Oct · balance $4,410.00 due when it ships        Order paper →
───────────────────────────────────────────────────────────── (hairline)
VISUAL COMFORT                          not yet ordered · 3 ready
  [48] Sconce pair · ×2                 Den           [APPROVED]          $1,260.00
  [48] Pendant · ×1                     Kitchen       [APPROVED]            $890.00
  ...                                                       Order 3 from Visual Comfort →
───────────────────────────────────────────────────────────── (hairline)
NO MAKER YET · 5
  [48] Pair of reading chairs · ×2      Den     needs a maker · needs a trade cost     —
  [48] Vintage console                  Entry   a find · needs a seller                —
```

**Layout spec:**
- Group head row: vendor name in `.t-head` (DM Mono 11px caps). After it, a kind word in `.t-meta`. Right-aligned, the PO summary in `.t-meta`.
- Line rows keep today's grid (`grid-cols-[1fr_auto_auto]`): thumb 48px, name `.t-body-sm` medium, room `.t-meta`, Stamp, money `.t-money`.
- Child rows (fabric, riders) indent 24px and use a 32px thumb. Riders have no thumb, and the leading `↳` is drawn in `--ink-faint`.
- The group foot is one sentence in `.t-body-sm` naming the money state, plus one tertiary act on the right: "Order paper →" for an existing PO, or "Order N from {vendor} →" for ready lines.
- Groups run in this order: open POs by soonest ETA, then vendors with ready lines, then "No maker yet".

**The money column (the R1 problem, stated plainly).** In *read by maker* the right column is **what the studio pays the maker** (trade × qty). Every co-member already sees this figure on the vendor-facing PO and in the coverage step (`step-review.tsx:41-42` comment "Vendor-facing amounts are TRADE cost" **[H]**). In *read by room* the column stays the client figure, as today. **The two never sit side by side on one row in either reading.** Putting them together turns margin into one subtraction, and who may see margin is **R1, ruling needed**. Today margin is owner-only through the Financial lens, which checks a role nothing can grant to a second person (`r5` §3.1 **[H]**). Until R1 rules, the paired view lives only inside the Financial lens.

**Screen S2 — read by next act.** Same rows, grouped by the first readiness reason or the live lifecycle step:

```
NEEDS A MAKER · 5        NEEDS A TRADE COST · 3      NEEDS THE CLIENT'S YES · 4
READY TO ORDER · 6       AWAITING ACKNOWLEDGMENT · 2  ACK DIFFERS · 1
IN PRODUCTION · 9        ARRIVING · 4                 TO INSPECT · 2
CLAIM OPEN · 1           TO PLACE · 7                 PLACED · 12 (folded)
```

Each group is a `.t-head` running head over its rows. Empty groups do not render: absence is silence. "Placed" folds closed. Each group head carries at most one tertiary act, such as `Order all 6 →` or `Chase 2 →`, which opens the Vendors thread draft. No counts in bubbles: the number sits in the running head as text.

**States:** loading (rows as today); empty section (today's guided empty state); one reading persisted per viewer in localStorage, a per-viewer convenience only. While selecting for a release, readings are disabled and the lens words read `aria-disabled` with the reason "finish the release first".

**Data:** all reads exist. The rows already join PO and receiving (`stamp-derivation.ts` inputs **[H]**). Payments are PO-grain (`po_payments`, `00148:68-90` **[H]**), so paid-out shows only at the group foot, never apportioned to lines. *Next act* needs `orderReadiness` (§3.4, pure) plus `liveStep()` (`@patina/types`, already used by the Ledger **[H]**).

**Risk:** *read by next act* revives By Status, which was removed as a *route* in the R21 dissolve (DECISIONS I109 **[H]**). I found no ruling refusing it as a concept, so it is allowed as a reading inside the Document **[I]**. Kody should confirm.

---

### D1-02 · Add to the job — any source, one line card · **UPDATE**

**Feature test:**
- **Surface:** Document.
- **Moment:** a piece arrives by any road — a clip, a client's photo, a vendor's emailed quote, a workroom sketch, a find at Brimfield.
- **Stream:** subscription. Margin-bearing lines are fed accurately.
- **Promise:** one place to put anything. No second system.

**Today:** five rows. "Import a schedule" is a dead end that sets an error (`add-to-project-sheet.tsx:273-275` **[H]**). "Name a need" asks for name + qty only. Field capture loses SKU, finish, dims and trade cost at mint (`00530:666-674`, `r2` §0 **[H]** per r2). Placement never copies SKU/finish/dims to the line (`00435:224-241` **[M]**).

**Screen S3 — Add to the job (DocSheet, 640px).** It keeps today's row grammar (`min-h-16` rows, Playfair 14 label, 11px description, clay →). The rows are regrouped under three `.t-head` running heads:

```
ADD TO THE JOB · Kochaver Residence                                   put back · esc

FROM SOMETHING YOU HAVE
  From the Library            One product you already know.                        →
  Paste a link                Any page; Patina reads the product off it.           →
  From a photo                A picture of the piece; Patina looks for it.         →
  From a vendor's quote       A PDF quote or pro-forma; each line comes in for review. →
  Import a schedule           A spreadsheet or PDF schedule; same review.          →
  Bring in a deck             A PowerPoint or PDF board, on a board first.         →
NOT IN ANY CATALOG
  A custom piece              Made by a workroom, with or without the client's fabric. →
  A find                      An antique, vintage piece or auction lot.            →
  A store buy                 Something bought retail, on the studio card.         →
  Name a need                 A placeholder to resolve later.                      →
```

Row wiring:
- **From a photo** runs the Find-this-piece resolver (`board-find-this-piece.tsx`, `board-web-match`, behind its flag **[M]**). When the flag is off, the row reads `aria-disabled` "not switched on for this studio yet". The row never vanishes, and it is never a dead button.
- **From a vendor's quote** and **Import a schedule** wire to the existing backend: `stage_project_ffe_document_extraction`, `commit_project_ffe_import`, fn `project-ffe-document-extract` (**[M]**, r2 §1.8). The output is a **review ledger** in the deck import's grammar: grouped rows, "how it was found", the acts Keep · Swap · Paste a link · Keep as reference, one guarded bulk act (`artifacts/deck-import-2026-10-03/PLAN.md:60-72` **[H]**). Reusing one review grammar for decks, quotes and schedules keeps a single thing to learn.
- **Bring in a deck** is a doorway. It closes this sheet and opens a project board with the deck sheet.

**Screen S4 — the line card: "The line, as it will be bought."** Every source above ends here: pre-filled from what the source captured, and editable before saving. Same 640px sheet, page label = source ("from a link").

```
THE LINE, AS IT WILL BE BOUGHT · from a link                          put back · esc

[96 image plate]  Cove Sofa                                    (Playfair .t-d3, editable)
                  hale-upholstery.com/cove · read 5 Oct        (.t-meta, link)

MAKER        Hale Upholstery ▾        ← typeahead: studio's makers first, then all;
                                         last row "New maker: 'Hale Upholstery'…"
SKU          HU-88-COVE               FINISH      Ebonized oak legs
DIMENSIONS   W 88 · D 38 · H 32 in    QUANTITY    1
TRADE COST   $6,480.00  each          CLIENT PRICE  $9,720.00 each   ← ruling note below
LEAD TIME    10–12 weeks              ROOM        Living room ▾
KIND         ◉ catalog  ○ custom piece  ○ a find  ○ store buy  ○ from Patina (when it is)

Orderable once it has: a maker · a trade cost · the client's yes
                       has         has          needs        ← .t-meta, words not ticks

                                          Put it on the schedule   (secondary act)
```

**Inline "New maker".** Picking the last typeahead row unfolds four fields in place: name, orders email, website, specialty. These are the same four fields the People maker sheet asks for (`add-person-sheet.tsx`, brief **[M]**), with a note: "Saved to your studio's makers." Choosing **a find** swaps MAKER for SELLER: "One-time seller — name, where, how paid", with no orders email required.

**Data:**
- SKU/finish/dims are already writable by `authenticated` on `project_ffe_specs` through a column grant (`00435:984-985` **[H]** per r2). The card can write them right after placement.
- Trade cost, client price and vendor need a designer-facing RPC. None exists, and the hooks throw (`use-project-v2.ts:287-336` **[M]**).
- Vendor create inherits a known problem. `vendors` is global and any authenticated user can insert (`00058` **[M]**). The inline maker should write a studio card (`studio_contacts`, 00417 **[M]**) over the shared row. The data lead should rule that, not this memo.
- Field capture's lost fields (r2 §0) make this card the place where those fields get re-entered until the mint is fixed.

**Rulings:**
- The client price field is **R-DI4 / R5 / R8, ruling needed**. Default: the client price is pre-filled only from a retail price the source read. It is never computed from trade with a markup, because that is the open pricing-mechanics question (R1–R11). Once a line sits on a sent authorization, the field shows today's soft-lock sentence (`line-unfold.tsx:48-51` **[M]**).
- **V1** for the "from Patina" kind.

**States:**
- prefilled from source; partially filled (readiness words show "needs")
- maker not found → "New maker" row
- duplicate in project → today's Reuse / Separate need / Hold choice, moved to the foot (`add-to-project-sheet.tsx:298-305` **[H]**)
- saving
- inline failure band (R83)

---

### D1-03 · The line unfold grows from three cells to six · **UPDATE**

**Feature test:**
- **Surface:** Document line unfold, the most reused screen (r1 Mockup 2).
- **Moment:** one piece, one question — "where is it, what's owed, what's next".
- **Stream:** subscription.
- **Promise:** the act is where the designer is already looking, so there is no trip to the Ledger.

**Today:** three cells — Purchase order · Movement · Receiving — then the 15-step trail, the authorization strip, the claim band, room select, and an action row (`line-unfold.tsx` **[H]**, r1 Mockup 2). Ack is absent (no `LogAckInline` import; it is used only in `po-preview.tsx` and `orders-ledger.tsx` **[H]**). The status cannot advance.

**Screen S5 — the unfold (desktop).** Clay left border 3px, as today. Two cell rows, then the trail, then one action row.

```
│ THE BUY
│ Hale Upholstery · HU-88-COVE · Ebonized oak legs · W88 D38 H32 · ×1 · 10–12 wks · edit
│ ship to Badger Receiving, Madison (studio receiver)                       (.t-body-sm)
│
│ QUOTE              ORDER                MOVEMENT             MONEY OUT           RECEIVING
│ $6,480.00 · Hale   PO 1042              In production        Deposit $4,410.00   —
│ 18 Sep · valid     sent 2 Oct           arrives ~28 Oct      paid 3 Oct ••4471
│ to 18 Oct · pdf    ack 4 Oct · 1 diff.  tracking —           Balance $4,410.00
│ Record a quote     Check the ack →      Mark shipped →       due when it ships
│                                                              Record payment →
│
│ ① Cleared ─ ② Released ─ ③ Acknowledged ─ ④ (no record) ─ ⑤ ─ ⑥ In production ● ─ …
│
│ Bill · Add note · Order paper → · Fold
```

**Cell rules:**
- Each cell is a `.t-head` label over two to three `.t-body-sm` lines, then at most one tertiary act.
- At ≥1280 the five cells sit in one row. Below 1100px they wrap to 3 + 2. At 390 they stack (§5).
- **The buy** is one sentence of facts plus `edit`. `edit` turns the sentence into the S4 fields in place. Spec book long-form stays one link away ("Edit spec details →" stays, `ffe-section.tsx:561-571` **[H]**).

**Cell states:**
- *Quote:* `—` + "Ask for a quote" / "Record a quote" → quoted (price · vendor · date · valid-until · pdf) → lapsed. Lapsed shows the date in `--golden-ink` as text. The price-age threshold is **R6, ruling needed**: until it rules, show the valid-until date only, with no age glyph.
- *Order:* "Not yet ordered" + readiness reasons → "PO drafted" → "held for release" → "sent {date}" → "acknowledged {date}", with a diff count when the ack check found differences.
- *Movement:* status word + ETA + tracking. Acts advance it (D1-07).
- *Money out:* the payment schedule, one row per `po_payments` row, each "due/paid" plus a date. For the maker lane it reads "Paid at checkout {date}" (Stripe), and no other figure (**V1**).
- *Receiving:* as today, plus the claim clock line (D1-08).

**Action row.** One primary per region, as today (`DocumentActionGroup`, `ffe-section.tsx:552-559` comment **[H]**). The primary is chosen by the line's next act: Order → Check the ack → Mark shipped → Check in → Mark placed → Bill.

**Data:** reads exist. The new writes are listed per proposal below.

---

### D1-04 · The custom piece — frame and fabric as a linked pair · **OVERHAUL** (new model)

**Feature test:**
- **Surface:** Document.
- **Moment:** specifying upholstery or drapery in the client's own material. This is the most error-prone buy a studio makes (r3 §6 #3, #6).
- **Stream:** subscription. It protects margin. **V1 ruling needed** if COM fabric runs through the maker lane.
- **Promise:** fewer reorders, quietly.
- **Open ground:** no competitor links a fabric PO to a workroom order (r4 §4.1).

**Today:**
- COM exists only inside product configuration: `com_details {fabricName, mill, pattern, yardage, railroaded, shipTo, sidemark, secondLeadTimeWeeks, notes}` (`00413:45-71` **[M]**).
- There are no CFA hits and no yardage helper (r3 §3.6 **[H]**).
- `po-send` already prints COM instruction lines (`po-send/lib.ts:498` **[M]**).

**Screen S6 — A custom piece (DocSheet wide, 760px), two columns on one paper.** This is a table inside a sheet, not a split view, so it respects D1.

```
A CUSTOM PIECE · Kochaver Residence                                   put back · esc

Sofa, COM                                                  (Playfair .t-d3, editable)
Living room · ×1

THE WORK                                   THE FABRIC
Workroom   Hale Upholstery ▾               ◉ client's own (COM)  ○ workroom supplies
Model      Lawson arm, 88"                 Mill       Pindler & Pindler ▾
Drawing    lawson-88.pdf · attach          Pattern    Orly · Flax · 54" wide
Labour     $4,900.00                       Repeat     27" vertical · railroaded ○ yes ◉ no
Frame      $1,580.00                       Cost       $60.00 / yd

                                           YARDAGE
                                           Hale's chart (54" plain)     14 yd
                                           Repeat 27"                  + 4 yd
                                           Overage                     + 1 yd
                                           ─────────────────────────────────────
                                           Order                        19 yd   edit
                                           "Hale's own figure wins — type it over this."

                                           CFA  not yet requested
                                           Request a CFA from Pindler →   (draft, you send)

This makes two orders: 19 yd of Orly from Pindler & Pindler, shipped to Hale Upholstery
and tagged KOCHAVER-LR-SOFA; and the work from Hale, which will say "COM arriving
separately — Pindler PO ___".                                     (.t-body, consequence)

                                             Put the pair on the schedule  (secondary)
```

**Behaviour:**
- Two lines are written: the parent (kind custom) and the child (kind fabric, linked to the parent).
- The child's default ship-to is the parent's workroom address. The parent's PO note auto-carries "COM arriving separately — {mill} PO {n}, {yd} yd {pattern}, tagged {sidemark}" once the fabric PO is numbered.
- "Workroom supplies" collapses the right column to a fabric description on the workroom line, with no second order.
- The yardage helper shows its arithmetic and never hides it. The shop rule (r3 §3.6) is a starting figure. The designer types the workroom's number, which replaces "Order" and stores both.

**CFA states** (on the fabric line, Quote cell position):
- not requested → requested {date} (draft sent by a human) → received {date} · dye lot {n} → approved {date} by {name} (with photo) | rejected → re-request.
- An unapproved CFA makes the fabric PO's consequence sentence read: "No CFA approved yet. If the dye lot differs, the reorder is on the studio." It warns and never blocks.

**Data (all new):**
- a parent/child link on `project_ffe_items`
- COM fields on any line, generalising `com_details`
- a CFA record (requested / received / approved, dye lot, media)
- a yardage record

The nearest existing gate is the custom-commission "Submittal" milestone (`custom-commission-fulfillment.tsx:33-57` **[M]**). It can render beside this, but it is configuration-only.

---

### D1-05 · The order paper — the PO, editable in place, one send · **OVERHAUL** (of the Order Assistant)

**Feature test:**
- **Surface:** Document (sheet over the job) and Orders book.
- **Moment:** committing studio money to a vendor, done by the first hire.
- **Stream:** subscription. It protects margin.
- **Promise:** the paper the vendor gets is the paper you confirmed. There is no hidden placeholder.

**Today:**
- A four-step side panel: Review → Coverage → Details → Created (r1 §1 C **[M]**).
- The ship-to shown and copied is a hardcoded `"Middlewest Studio · Madison WI"` (`DP/components/portal/procurement/order-assistant/step-review.tsx:30-31,44` **[H]**). No ship-to input exists in the assistant (grep for `ship_to|shipTo|receiver` in `order-assistant/*.tsx` returns nothing **[H]**).
- `po-send` then fills a blank ship-to with the **client's site address** (`supabase/functions/po-send/index.ts:381-384` **[H]**).
- Send lives in two other components. `PoPreview` is the PDF-as-confirm; the older `PoSendActions` has a TODO note field.
- Payment prompts are silent toasts (I109 **[H]**).

**Screen S7 — the order paper (DocSheet wide, 760px).** The sheet *is* the PO. Editable values carry a dotted underline (the `DateTextInput` idiom). Clicking one edits in place. The letterhead is the studio's, because this paper goes to a vendor.

```
THE ORDER PAPER · draft                                               put back · esc
──────────────────────────────────────────────────────────────────────────────────
Middle West Studio                                    PURCHASE ORDER  · numbered at send
Madison, WI                                           to  Hale Upholstery
                                                          orders@haleupholstery.com
Sidemark      KOCHAVER-LR-SOFA ·············     Requested ship   week of 20 Oct ·····
Ship to       Badger Receiving · 1200 E Wash Ave, Madison ··· change ▾
              ( ◉ studio receiver  ○ the site — 418 Lakeview  ○ the workroom  ○ other )
Bill to       Middle West Studio
Freight       FOB origin · prepay & add · white glove to receiver ·····
──────────────────────────────────────────────────────────────────────────────────
1  Sofa, COM · Lawson arm 88" · HU-88 · legs Ebonized oak        ×1     $6,480.00
   COM arriving separately — Pindler PO 1043 · 19 yd Orly Flax · KOCHAVER-LR-SOFA
2  Ottoman, COM · HU-22 · legs Ebonized oak                      ×1     $1,920.00
   + freight · white glove estimate                                       $420.00
──────────────────────────────────────────────────────────────────────────────────
                                                         Total            $8,820.00
Terms   50% deposit · 50% before ship  (Hale's default) ▾
        Deposit $4,410.00 due 10 Oct ··· · balance $4,410.00 when it ships
Note to Hale   ┌──────────────────────────────────────────────────────────────┐
               │ Please confirm leg finish against the attached chip.          │
               └──────────────────────────────────────────────────────────────┘
──────────────────────────────────────────────────────────────────────────────────
The client paid for both pieces on invoice №0217 (1 Oct). Sending commits
$8,820.00 of studio money to Hale.                               (.t-body consequence)

  [ Send to Hale · $8,820.00 ]   Released by phone or portal — mark as sent
                                 Hold for release
```

**Fields, in order:** sidemark (prefill from today's generator, `order-assistant/sidemark.ts` **[M]**), requested ship date, **ship-to picker**, bill-to, freight terms, lines (trade cost, read-only here: edit on the line), riders, total, terms (today's five patterns, `step-details.tsx:28-34` **[M]**), note to vendor.

**Ship-to picker:**
- The options are the studio's receivers (D1-08), the site, the workroom (when the line is custom), or other.
- **Default = the studio's default receiver.** It is never the site, unless the studio set the site as its default.
- If no receiver is on file: "No receiver on file — pick the site or add one," with the site *unselected*. The terminal act reads `aria-disabled` "choose where this ships". This removes both today's placeholder and the silent site default.

**Consequence sentence variants**, one above the terminal act:
- *Covered:* the text above.
- *Not covered (residential):* "The client hasn't paid for 1 of these yet — sending fronts $1,920.00 of studio funds until they do." + tertiary `Bill the client first →`. This opens Accounts **with the order paper kept as a draft**. Today the assistant session is abandoned (`r1` §1 C **[M]**).
- *Line not approved (residential, N1):* "The client hasn't said yes to the Ottoman. If they change their mind, the studio owns it."
- *Commercial, not authorized:* the terminal act reads `aria-disabled` "release for authorization first". This is the existing hard gate (`authorization-derivation.ts:355-395` **[M]**).
- *CFA missing:* the sentence from D1-04.
- *Patina maker lane:* the terminal act becomes `Order from Patina · $X`, which goes to Stripe Checkout as today. Sidemark, ship-to and freight are hidden, because Patina carries them. The sentence reads "Patina places this order with {maker} and carries freight and claims." **V1, ruling needed:** no Patina margin or fee figure appears anywhere on this paper.

**States:**
1. draft
2. held for release (D1-12): the terminal act is replaced by "Held for {owner}'s release · 4 Oct · Maya"
3. sent: the act is replaced by its record, "Sent to orders@hale… · 4 Oct 10:12 · Maya", and the PO number is assigned
4. sent by phone/portal: "Released by phone · 4 Oct · Maya"
5. acknowledged: the paper shows "Hale's acknowledgment →"
6. changed: banner sentence "Change started 6 Oct — cancellation · reason" from `start_purchase_order_change` (D1-10)
7. cancelled
8. send failed: inline band

**Queue (Order all).** Several (vendor, project) papers open one after another in the same sheet, with a running head "2 of 3 · Visual Comfort". This keeps today's queue behaviour (`orders-book-vendors.tsx:102-209` **[M]**) with no tab-jumping.

**Retire:** `PoSendActions`, `PoSendPopover` (orphaned per r1 **[M]**), and the Created step. `PoPreview`'s PDF render becomes the paper's "See the PDF" tertiary act, keeping the R18 principle that the PDF is the confirmation.

**Data:**
- `purchase_orders.ship_to` (text) exists (00188 **[H]** comment). A receiver reference column is new.
- A freight-terms field is new.
- The vendor note uses `useSendPurchaseOrder`'s existing optional `message` (`po-send-actions.tsx:26-28` **[H]**).
- Riders need a PO cost-line table (new). `purchase_orders` has only `total_cents` (`00148:58` **[H]**).
- A held-for-release state is new (N2).

---

### D1-06 · The acknowledgment check · **UPDATE** (extends `LogAckInline`; new data)

**Feature test:**
- **Surface:** Document / Orders book sheet.
- **Moment:** the vendor's ack lands in the buyer's inbox. "Silence on a bad ack is acceptance" (r3 §2.2.6). It is the #1 money loss (r3 §6 #1).
- **Stream:** subscription. It protects upside.
- **Promise:** it catches the expensive mistake quietly, and a human sends the reply.

**Today:** `log_po_acknowledgment(po, vendor_po_number, confirmed_eta)` only (`00190:29-32` **[M]**). The inline form has those two fields (`po-preview.tsx` **[M]**). There is no line comparison, no ack document and no chase cron (`00189` **[M]**).

**Screen S8 — Hale's acknowledgment (DocSheet wide).**

```
HALE'S ACKNOWLEDGMENT · PO 1042                                       put back · esc
Attach their acknowledgment  ack-H55102.pdf · 4 Oct   (or: type what they confirmed)

Their order №   H-55102 ······        Their ship date   24 Oct ······

                       WE ORDERED                 THEY CONFIRMED
Sofa, COM   qty        1                          1 ·····                  agrees
            legs       Ebonized oak               Walnut ·····             differs
            price      $6,480.00                  $6,480.00 ·····          agrees
Ottoman     qty        1                          1                        agrees
            legs       Ebonized oak               Ebonized oak             agrees
            price      $1,920.00                  $1,980.00 ·····          differs · +$60.00
Freight                $420.00 estimate           $465.00 ·····            differs · +$45.00
Ship date              week of 20 Oct             24 Oct                   agrees
──────────────────────────────────────────────────────────────────────────────────
3 differences. Silence on a wrong acknowledgment counts as accepting it.

  Draft a reply to Hale about 3 differences      (secondary → draft lands for review)
  Accept as acknowledged anyway                  (tertiary; consequence sentence first)
```

**Rules:**
- The THEY CONFIRMED column pre-fills with WE ORDERED. The buyer overtypes only what differs, so a clean ack is one click: "Everything agrees — log it."
- "agrees" / "differs" are words. "differs" is in `--terracotta-ink`; "agrees" is in `--ink-faint`, a quiet colour. No green, no ticks, no red fills.
- Price differences show the signed delta in `.t-money`.
- "Draft a reply" builds the message in the Vendors thread composer as a draft that lands `awaiting_review`. A human sends it, under the Agent OS rule.
- Accepting a price difference does **not** change the line's client price. Any knock-on to the client is **R8, ruling needed** (post-sale edits). The design offers "Start a change →" (D1-10) next to the price row, and nothing more.
- Extracting the ack from the PDF could reuse `project-ffe-document-extract` **[I]**. Without it, typing over the pre-fill is the floor.

**Chase:** if a PO is sent and has no ack after N business days, the Desk carries one need line: "Hale hasn't acknowledged PO 1042 · sent 6 days ago · Chase →". The act opens a thread draft. The line appears once and is not repeated. N is a studio setting (default 3, after r3 §3.5). No push, no email to the designer. This holds the promise not to optimise the studio surface for engagement.

**States:**
1. not sent
2. sent, no ack
3. ack logged, all agree: the record reads "Acknowledged 4 Oct · H-55102 · everything agreed"
4. ack logged, differences open
5. differences replied to (date)
6. differences accepted (who, date)

**Data:** new ack lines (per PO line: field, ordered value, confirmed value, state) and an ack document (media). Ledger row: "ack · 3 differences" replaces "no ack".

---

### D1-07 · Movement — production, shipped, tracking, ETA history · **UPDATE**

**Feature test:**
- **Surface:** Document unfold and Ledger row.
- **Moment:** the vendor emails "it ships Friday".
- **Stream:** subscription.
- **Promise:** status stops drifting from reality. Today there is "no button to press" (r5 §2 step 6).

**Today:** the Movement cell edits only `confirmed_eta` (`line-unfold.tsx:83-180` **[H]** header). `useUpdatePurchaseOrderStatus` has zero callers **[H]**. There is no carrier or tracking field.

**Movement cell, expanded in place** (no sheet; it is small):

```
MOVEMENT
In production · since 6 Oct                       ← status word + dated record
arrives ~28 Oct  ·····  (was ~14 Oct · moved 2 Oct, "Hale's email")
Mark shipped →
   ┌ unfolds: Carrier ▾ (LTL · parcel · white glove · their truck) · PRO/tracking ····
   │          ship date ···· · BOL attach · Save as shipped (secondary)
```

**Rules:**
- The next status is the only act shown: `Mark in production` → `Mark shipped` → (delivery comes from Receiving check-in).
- Each act is replaced by its dated record: "Shipped 22 Oct · Estes PRO 4471-0091".
- Each ETA edit asks for an optional reason, "why it moved". The cell keeps the last change in grey. The full history is in the Ledger row unfold.
- After an ETA slip of more than N days, the line offers "Draft a note to the client →", a draft for review. **R7, ruling needed** (the client and dates, counsel on wording). Until it rules, the act is hidden.

**States:** confirmed (not yet in production) → in production → shipped (with or without tracking) → delivered; shipped with no ETA shows "NO DATE" as today (r1 Mockup 1).

**Data:**
- Wire `useUpdatePurchaseOrderStatus` (`packages/supabase/src/hooks/use-procurement.ts:770` **[M]**). The status cascade to items exists (`00184:194` **[M]** per r3).
- New: carrier, tracking/PRO, BOL media and ETA-change history columns. The maker lane already models shipment mode (`00350:163` **[M]**). Mirror its words.

---

### D1-08 · Receiving hand-off — receivers, the receiving notice, the claim clock · **UPDATE**

**Feature test:**
- **Surface:** Orders book → Receiving, plus Field (dock).
- **Moment:** delivery day at the receiver.
- **Stream:** subscription.
- **Promise:** one dated sentence instead of a missed window. The open ground here is phone receiving with claims inside the design platform (r4 §4.2).

**Today:**
- No receiver entity: `receiver` exists only as a login-less project party kind (`00281:48-53` **[M]**).
- The "30-day window" is a stats window (`orders-book-receiving.tsx:10` **[M]**).
- Desktop photos are a placeholder (`log-inspection-drawer.tsx:456-467` **[M]**). iOS photos cannot be opened on the web **[M]**.

**Receivers.** A receiver is a People card of kind *receiver*: address, contact, dock hours, storage terms (free days, then monthly rate). One is marked the studio's default. Receivers are what the order paper's ship-to picker lists. Kind `receiver` already exists on project parties. A *studio-level* receiver card is new.

**Receiving notice.** When a PO is marked shipped to a receiver, the PO's Receiving cell offers "Tell Badger what's coming →". It drafts: "Expect 2 cartons for KOCHAVER-LR-SOFA from Hale Upholstery, ~28 Oct, Estes PRO 4471-0091. COM sofa — inspect legs." The draft lands for review; a human sends it.

**Screen S9 — Receiving page row with the claim clock** (Orders book, today's queue grammar, `orders-book-receiving.tsx` **[M]**):

```
AWAITING INSPECTION · 2
PO 1042 · Hale Upholstery                                         Check in   open document →
Kochaver · delivered 28 Oct to Badger Receiving · tell Hale by Fri 31 Oct, 5 pm

OPEN CLAIMS · 1
Hale Upholstery · Kochaver                                 [VENDOR NOTIFIED]   Mark resolved ↓
drafted 28 Oct · Hale told 29 Oct · damaged · 4 photos  view
window: Hale's 72 h · carrier's 5 days (concealed) — both met
```

**Claim clock rules:**
- From the delivered date + the vendor's claims window (a new field on the studio's vendor card, default 72 h), the row prints one dated sentence: "tell Hale by {date, time}".
- If it passes uninspected, the sentence turns `--golden-ink` and reads "Hale's window closed {date} — you can still file." Nothing turns red.
- The Desk need line appears once, the day before the deadline.
- `vendor_profiles.claims_window_days` (`00350:57-58` **[M]**) is the maker-lane precedent. Copy its shape onto studio vendor cards.

**Check in (desktop).** Today's `LogInspectionDrawer`, plus:
- a real photo input (`<input type=file accept=image/* capture>`, which also serves 390 web)
- per line: count received, condition (clean / damaged / short), "noted on the BOL" toggle
- a photo strip that opens iOS-taken photos

This needs the media route that today returns a raw storage key (`orders-book-receiving.tsx:33-49` comment, per r1 **[M]**).

**States:** arriving · delivered awaiting check-in · checked in clean (→ Settled fold) · partial (short n) · damaged → claim drafted → vendor notified → resolved | replacement linked (D1-10).

---

### D1-09 · Placed — the install manifest · **UPDATE**

**Feature test:**
- **Surface:** Document Install section, plus Field on site.
- **Moment:** install day.
- **Stream:** subscription.
- **Promise:** close-out without paperwork. Close-out is blocked today because nothing can set `installed` (`closure-derivation.ts:191-199` **[M]** per r3).

**Today:** the Install section exists (`mode: 'install'`, meta "N of M installed", `ffe-section.tsx:788,1030-1036` **[H]**). There is no writer of `installed` **[M]**.

**Screen S10 — Install section:**

```
INSTALL                                                            12 of 31 placed
Living room · 6 of 8 placed                       Mark the room placed · 2 left →
  [48] Sofa, COM            [RECEIVED]   at Badger · on the 6 Nov truck       Placed
  [48] Ottoman, COM         [PLACED]     placed 6 Nov · Maya                   punch
  [48] Sconce pair ×2       [DELIVERED]  not yet inspected — check in first  (reason)
```

**Rules:**
- `Placed` is a tertiary act per line, replaced by its record "placed 6 Nov · Maya".
- A line that is delivered but not checked in shows the reason "not yet inspected — check in first" instead of the act. It warns. A secondary "Place it anyway" sits behind the reason.
- `punch` opens a margin item tied to the line, for example "touch-up on left arm · Hale · due 13 Nov". Whether coordination `punch` rows link to an FF&E line is unverified (r3 K2 **[L]**). A line link is likely new.
- "on the 6 Nov truck" uses The Week's delivery events where they exist.
- Steps 11 Stored and 12 Install released stay `no-record` until a fact exists. The honesty rule holds.

**Data:** a designer-facing RPC to set `installed`, because the status is RPC-guarded (`guard_ffe_rpc_mutation`, 00435 **[M]**). A punch→line link.

---

### D1-10 · Changes after ordering — cancel, credit, substitute, replace · **UPDATE** (UI over existing backend)

**Feature test:**
- **Surface:** Document unfold and order paper.
- **Moment:** a backorder, discontinuation or damaged piece in month four.
- **Stream:** both. It protects margin and the deposit.
- **Promise:** the client agrees to one direction, and the trail survives to month nine.

**Today:** `start_purchase_order_change` takes kinds `vendor_change | cancellation | credit | claim | remedy | new_scope`, requires a reason of at least 5 characters, takes a prior snapshot, and rebuilds the PO if it is unsent and unpaid (`00435:849-869` **[H]**). The repricing guard is at `00456:5-23` **[M]**. There is no UI.

**Act:** in the order paper and the unfold Order cell, the tertiary act `Start a change →` unfolds a short form:
- **Kind:** Cancel / Credit / Swap the maker / Replace (after a claim) / Add scope
- **Reason** (required)
- **For a substitution:** "Pick the alternate" from this line's alternates (`design_disposition = alternate`, 00434 **[M]**)

The consequence sentence uses the RPC's own answer:
- `rebuildable` true: "Nothing was sent or paid, so this PO is cancelled and the lines go back to ready."
- `rebuildable` false: "Hale has this order. Send them the change in writing — draft below."

**Client re-approval for a substitution:** the line returns to "needs the client's yes", and the swap rides the client page's existing decision papers. **R5** (a substitute priced below trade) and **R8** (post-sale edits) are **ruling needed**. The design stops at "the line needs the client's yes again" and draws no price behaviour.

**States:** change started · vendor told (draft sent) · credit expected $X · credit received (records a refund `po_payments` row; `refunded` state exists per 00277, `procurement-lifecycle.ts:37` **[H]**) · replaced by PO {n} (linked both ways).

---

### D1-11 · Money out — record what the studio paid · **UPDATE**

**Feature test:**
- **Surface:** Orders book Ledger and Document unfold.
- **Moment:** the weekly bill run. The first hire pays the Hale deposit by card.
- **Stream:** subscription.
- **Promise:** internal payable tables are the source of truth (Agent OS rule). Today "the studio gets 'balance due' notices it cannot clear" (r3 §3.7).

**Today:** `po_payments` (deposit/balance/milestone; pending → due → paid; paid requires `paid_date`) exists (`00148:68-92` **[H]**). The due cron fires (`00189` **[M]**). No writer exists for paid **[H]**.

**Screen S11 — Ledger row unfold, Money band:**

```
PO 1042 · Hale Upholstery     [IN PRODUCTION]   ~28 Oct
Kochaver · $8,820.00 · sent 2 Oct · acknowledged 4 Oct · 3 differences      open document →
  MONEY OUT
  Deposit   $4,410.00   paid 3 Oct · card ••4471 · Maya
  Balance   $4,410.00   due when it ships                     Record payment →
     ┌ unfolds in place:
     │ Paid on   3 Oct ·····     Amount  $4,410.00 ·····
     │ How       ◉ card ••4471 ▾  ○ ACH  ○ check № ····  ○ other
     │ Receipt   attach ·         Note ···················
     │                                 Record the balance · $4,410.00   (secondary)
```

**Rules:**
- **Recording is secondary, not terminal.** The money moved outside Patina; this act only writes the record. Terminal stays reserved for Stripe's `Pay $X` on the maker lane. That keeps the house rule honest: the filled act means money moves *here*.
- Amount pre-fills with the row's amount. Editing it records a partial payment, which shows as "paid $2,000.00 of $4,410.00".
- Cards are remembered as last-4 labels per studio. Card numbers are never stored.
- **Ledger front matter, using the existing lens** (`payment · due`, `orders-ledger.tsx:156-161` **[H]**): "Due to makers this week $8,140.00 across 3", with exactly those three rows beneath (V11 test met).
- Changing terms after creation uses `useUpdateVendorPaymentTerms`, which has no caller **[H]**. It sits as a tertiary act "change terms" on the Money band, allowed only before the first payment is recorded.

**Store buys and finds** use the same record form, at purchase time, with no PO (D1-13).

**Data:** wire `useLogPaymentPaid` (`use-procurement.ts:602` **[M]**). New: a method enum, card label, receipt media and partial amount. Today `po_payments` has `paid_date` but no method or amount-paid **[H]** (00148 DDL).

---

### D1-12 · Held for release — the first hire drafts, an owner releases · **UPDATE** (new state; **N2 ruling needed**)

**Feature test:**
- **Surface:** Document order paper; Orders book Ledger; Desk.
- **Moment:** the exact VISION trigger: "the day Leah is no longer the only person who can commit the studio's money" (r5 §0).
- **Stream:** subscription floor.
- **Promise:** she delegates without learning a second system. Off by default, so the studio that doesn't want it never sees it.

**Today:** any active non-guest member can create and send a PO. There is no internal approval concept anywhere (`r5` §2 step 3, §3.2 **[H]** per r5).

**Setting** (studio settings, Account sheet). One sentence with two inputs:

> Orders over **$ [2,500]** wait for **[an owner or admin ▾]** to release them.   ○ off (default)

This uses **System B** seats (`organization_members.role` owner/admin). It deliberately avoids System A's `studio_owner`, which no one can grant to a second person (`r5` §3.1 **[H]**).

**Flow:**
1. Maya's order paper, over the threshold: the terminal act is replaced by `Hold for release` (secondary). The consequence sentence reads: "Orders over $2,500 wait for Leah or Sam to release them. Hale won't see this until then."
2. The paper's record reads "Held for release · 4 Oct · Maya", with Maya's note.
3. **Ledger: a `HELD FOR RELEASE` group** sits at the top, only for owners/admins and only when non-empty. Each row shows vendor · project · total · who held it · held date.
4. **Desk need line** (owners/admins only, once): "Maya is holding 2 orders for your release · $9,720.00 · Release →". The total sits over the rows it opens (V11).
5. Leah opens the same order paper. Her terminal act reads `Release to Hale · $8,820.00`, which sends it. A tertiary act, `Send back to Maya with a note`, returns the paper to draft with Leah's note as a margin item.
6. Records read "Released by Leah · 4 Oct 14:02 · sent to orders@hale…" or "Sent back by Leah · 'Check the leg finish first.'"

**Why a ruling is needed (N2):** this is the first in-studio spend gate. R9's posture is "warn, never block" for money floors. A hold is a block by choice, chosen by the studio. Kody should rule whether Patina offers it at all, whether the threshold is per order or per vendor, and whether admins count as releasers. Also: who sees margin on the held paper is **R1**. The release paper shows trade cost only, as today.

---

### D1-13 · Lanes without a PO — a find, a store buy · **OVERHAUL** (new purchase-record model)

**Feature test:**
- **Surface:** Document; portal at 390.
- **Moment:** a flea-market find, or a run to CB2 on the studio card.
- **Stream:** subscription. Billed product carries margin, **R1/V1** where relevant.
- **Promise:** the studio buys everything in one place, and "buy one thing from someone who isn't a vendor" is solved. Nobody does this today (r4 §4.3).

**Today:** no model. A find needs an invented vendor row (r2 §4 **[M]**). Card purchases have zero hits **[M]**.

**A purchase record** is not a PO. It is written at or after the moment of purchase and attached to a line:

```
A STORE BUY · Pair of table lamps                                     put back · esc
Where          CB2 · Chicago ·····             When     5 Oct ·····
Paid           $389.00 ·····  incl. tax $32.00 ·····   on card ••4471 ▾
Receipt        receipt-cb2.jpg · attach (photo on the phone)
Returns        by 4 Nov ·····  (store's window)
Ships          ◉ carried by us  ○ delivered to receiver  ○ delivered to the site
                                             Record the buy · $389.00   (secondary)
```

A find adds:
- **Seller:** one-time seller: name, where (Brimfield / dealer / auction house), contact
- **Buyer's premium**, as a rider
- **Condition notes + photos**
- **"Non-returnable"**, checked by default
- **Getting it home:** freight rider, carrier

**The spine treats a purchase record like a PO.** It appears in *read by maker* under the seller's name with the kind word. In *next act* it skips "Awaiting acknowledgment" and goes straight to arriving or to inspect. The return-by date shows in the Receiving cell as one dated sentence, "returns close 4 Nov".

**Data (new):** a purchase-record table (seller text or vendor, paid amount, tax, method/card label, receipt media, return-by, non-returnable, ship mode), linked to lines and riders. Whether a store buy's sales tax is recoverable or billed is a **CPA matter** (r3 §3.1). The design records tax as its own figure and decides nothing.

---

### D1-14 · Client billing in the spine — deposit, then balance, plus riders · **UPDATE**

**Feature test:**
- **Surface:** Document → Accounts.
- **Moment:** "never spend the studio's money ahead of the client's" (r3 §2.2.4).
- **Stream:** both.
- **Promise:** no hidden fees, from studio to client too.

**Today:**
- "Bill" per line and "Bill N uninvoiced" work (`ffe-section.tsx` R76 header **[H]**).
- There is one live billing slot per FF&E line, so a product deposit and then a balance on the same line must be faked (`00187:116,133` **[M]**).
- Tax is one rate over the whole subtotal (`packages/shared/src/invoice/index.ts:71-81` **[M]**).

**Proposal:**
- In *read by room*, the money column's billing word (today's coverage note) gains the deposit stage: "deposit billed №0217 · paid" then "balance unbilled".
- The section's `Bill N uninvoiced →` opens the composer with two pre-tick groups, "deposits owed (50%)" and "balances owed", plus a third group, "riders and reimbursables". Each rider shows cost and a billed figure. **R1, ruling needed** on whether cost shows to the client and how the billed figure is set. Until it rules, riders pre-fill billed = cost, with no markup. **R7** covers the deposit wording to the client.
- The order paper's "Bill the client first →" hands the exact uncovered lines to this composer and keeps the paper as a draft (D1-05).

**Data:** relax one-slot-per-line to one slot per (line, stage) (00187, new). Rider invoice lines. Per-line taxability is needed but is **a CPA matter, not designed here**.

---

## 5. Phone, 390 wide

Phone rules: a 16px gutter, a content column 358px wide, bottom sheets (D13, `DP/components/document/mobile/mobile-sheets.tsx:1-10` **[H]**), acts at least 44px tall, terminal acts full-width at the foot, everything wraps. Field screens follow Field's own SwiftUI type, and the structure below carries over.

### 5.1 Story A — "Thursday at Badger Receiving": Maya checks in the Hale delivery (Patina Field)

**Feature test:**
- **Surface:** Field = The Document off-desk (V11).
- **Moment:** delivery day. The first hire is at the dock and Leah is on a site.
- **Stream:** subscription.
- **Promise:** one dated sentence instead of a missed claim window. Capture is where the work happened; review is in the Receiving ledger (D9 amended).

**Today in Field:**
- `ArrivingPOsScreen` lists POs with "PO {n}" / "ETA {date}" and an empty state "Nothing arriving right now." (`apps/mobile/Capture/Capture/Features/Receiving/ArrivingPOsScreen.swift:118-150` **[H]**).
- `ReceivingInspectionScreen` takes up to N photos with "Photos help the desktop team triage. Capture damage from multiple angles.", notes, outcome and damage description, then "Inspection saved" (`ReceivingInspectionScreen.swift:104-393` **[H]**).
- Inspection is **PO-grain**. There are no per-line counts, no BOL notation and no claim clock **[I]** from the screen copy.

**Frame A1 — Arriving at Badger (Field):**
```
┌──────────────────────────────────────┐
│ ARRIVING · Badger Receiving          │  ← receiver chosen once, remembered
│ Thursday 28 October                  │
│                                      │
│ KOCHAVER-LR-SOFA                     │  ← sidemark first: it's what's on the carton
│ Hale Upholstery · PO 1042            │
│ 2 pieces · Estes PRO 4471-0091       │
│ tell Hale by Fri 31 Oct, 5 pm        │  ← appears after check-in starts
│                         Check in  →  │
│──────────────────────────────────────│
│ KOCHAVER-DEN-SCONCE                  │
│ Visual Comfort · PO 1047 · 1 carton  │
│                         Check in  →  │
└──────────────────────────────────────┘
```

**Frame A2 — Check in PO 1042, per line:**
```
┌──────────────────────────────────────┐
│ ← Arriving        PO 1042 · Hale     │
│ Delivered today, 10:40               │
│ ☐ Damage noted on the carrier's BOL  │  ← the one claims fact that can't be redone
│──────────────────────────────────────│
│ [64] Sofa, COM                       │
│      received  [ − 1 + ] of 1        │
│      ◉ clean  ○ damaged  ○ short     │
│      + photos (0)                    │
│──────────────────────────────────────│
│ [64] Ottoman, COM                    │
│      received  [ − 1 + ] of 1        │
│      ○ clean  ◉ damaged  ○ short     │
│      [ph][ph][ph][ph]  + photo       │
│      What's wrong  ┌───────────────┐ │
│                    │ split seam,   │ │
│                    │ left corner   │ │
│                    └───────────────┘ │
│──────────────────────────────────────│
│ 1 damaged. Hale wants written notice │
│ with photos by Fri 31 Oct, 5 pm.     │  ← consequence sentence
│ ┌──────────────────────────────────┐ │
│ │      Save the check-in           │ │  ← primary (not terminal: no money)
│ └──────────────────────────────────┘ │
└──────────────────────────────────────┘
```

**Frame A3 — Saved:**
```
┌──────────────────────────────────────┐
│ Checked in · 28 Oct 10:52 · Maya     │
│ Sofa clean · Ottoman damaged         │
│                                      │
│ Tell Hale by Fri 31 Oct, 5 pm.       │
│ Draft the notice to Hale →           │  ← draft lands for review (phone or desk)
│                                      │
│ Leah will see this on her Desk.      │
└──────────────────────────────────────┘
```

**What lands where:**
- The Receiving page row moves to Open claims ("drafted").
- The line stamps read RECEIVED and DAMAGED. DAMAGED is item-grain, which needs the per-line attribution (`stamp-derivation.ts:12-15` **[H]**).
- The Desk gets one need line, for Leah and for Maya.
- Photos open on the web through the media-route fix in D1-08.

**Data:** per-line counts per inspection exist via `record_project_ffe_receipt_batch` (`use-procurement.ts:1391-1411` **[M]**). The BOL-noted flag, the per-line condition in Field and the vendor claims window are new.

**Without Field (portal at 390):** Orders book → Receiving → row → `Check in` opens the same per-line form as a bottom sheet. The web photo input uses `capture`.

### 5.2 Story B — "Between site visits": Leah releases Maya's held orders (portal at 390)

**Feature test:**
- **Surface:** Document's Desk and Orders book at phone width.
- **Moment:** delegation, the VISION trigger.
- **Stream:** subscription.
- **Promise:** she releases in under a minute, with no second app. Depends on **N2**.

**Frame B1 — Desk (mobile shell):**
```
┌──────────────────────────────────────┐
│ PATINA                    Thu 28 Oct │
│                                      │
│ Kochaver Residence                   │
│ Maya is holding 2 orders for your    │
│ release · $9,720.00          Release→│  ← need line, once; text, no badge
│                                      │
│ Hale's window closes Fri 5 pm —      │
│ Ottoman damaged          See claim → │
└──────────────────────────────────────┘
```

**Frame B2 — Orders book, bottom sheet, scoped to the job:**
```
┌──────────────────────────────────────┐
│ ORDERS · Ledger            put back  │
│ project · Kochaver ✕                 │
│                                      │
│ HELD FOR RELEASE · 2 · $9,720.00     │  ← front matter over its own rows
│ Hale Upholstery · $8,820.00          │
│ held 28 Oct · Maya          open  →  │
│ Visual Comfort · $900.00             │
│ held 28 Oct · Maya          open  →  │
└──────────────────────────────────────┘
```

**Frame B3 — The order paper, compact (bottom sheet, scrolls):**
```
┌──────────────────────────────────────┐
│ THE ORDER PAPER · held   put back    │
│ Hale Upholstery                      │
│ to orders@haleupholstery.com         │
│                                      │
│ Ship to  Badger Receiving            │
│ Sidemark KOCHAVER-LR-SOFA            │
│ Terms    50% / 50% · deposit         │
│          $4,410.00 due 10 Oct        │
│──────────────────────────────────────│
│ [48] Sofa, COM ×1         $6,480.00  │
│      COM from Pindler PO 1043        │
│ [48] Ottoman, COM ×1      $1,920.00  │
│      + freight estimate     $420.00  │
│                  Total    $8,820.00  │
│──────────────────────────────────────│
│ Maya: "Leg finish matches the chip   │
│ Hale sent — photo in the thread."    │
│──────────────────────────────────────│
│ The client paid for both pieces on   │
│ №0217. Releasing sends this to Hale  │
│ and commits $8,820.00 of studio      │
│ money.                               │
│ ┌──────────────────────────────────┐ │
│ │   Release to Hale · $8,820.00    │ │  ← terminal, full width
│ └──────────────────────────────────┘ │
│   Send back to Maya with a note      │  ← tertiary
└──────────────────────────────────────┘
```

**Frame B4 — the record that replaces the act:**
```
│ Released by Leah · 28 Oct 14:02      │
│ Sent to orders@haleupholstery.com    │
│ PO 1042                              │
```

**Edge states:**
- Release fails → inline band above the act: "Couldn't send to Hale — the address bounced last time. Mark as sent instead, or fix the address."
- The client hasn't paid → the consequence sentence switches to the fronting sentence from D1-05, and the act still works (warn).
- Leah is a `member`, not owner/admin → the group does not render for her.

### 5.3 Story C (short) — Maya's store buy at CB2 (portal at 390)

Add to the job → **A store buy** → bottom sheet with the D1-13 form. The receipt uses the camera through the file input. "Card ••4471" is remembered. The lamps line moves to "arriving · carried by us", and the return window sits in its Receiving cell. Billing it is **R1** (product at client price, or a reimbursable at cost). The form records the cost only.

---

## 6. Feature test roll-up

| # | Proposal | Tag | Surface | Studio moment | Stream | Promise | Rulings |
|---|---|---|---|---|---|---|---|
| D1-01 | Read by maker / next act | UPDATE | Document, Project section | First hire takes over buying | Floor; protects upside | No side spreadsheet; front matter over rows | **R1** (In/Out pairing) |
| D1-02 | Add to the job + line card | UPDATE | Document sheet | A piece arrives by any road | Floor | One place for anything | **R-DI4, R5, R8, V1** |
| D1-03 | Six-cell unfold | UPDATE | Document unfold | One piece, one question | Floor | Act where she's looking | **R6, V1** |
| D1-04 | Custom piece: frame + fabric | OVERHAUL | Document sheet | Specifying COM | Floor; **V1** if maker lane | Fewer reorders | V1 |
| D1-05 | The order paper | OVERHAUL | Document / Orders sheet | Committing studio money | Floor; protects upside | The paper sent is the paper confirmed | **V1, N1** |
| D1-06 | Acknowledgment check | UPDATE | Document / Orders sheet | Ack lands in the inbox | Floor; protects upside | Catches #1 loss quietly; human sends | **R8** |
| D1-07 | Movement + tracking | UPDATE | Unfold / Ledger | "It ships Friday" | Floor | Status stops drifting | **R7** |
| D1-08 | Receivers, notice, claim clock | UPDATE | Receiving / Field | Delivery day | Floor | One dated sentence | — |
| D1-09 | Placed + punch | UPDATE | Install section / Field | Install day | Floor | Close-out clears | — |
| D1-10 | Changes after ordering | UPDATE | Unfold / order paper | Backorder, damage | Both | One agreed direction | **R5, R8** |
| D1-11 | Record what we paid | UPDATE | Ledger / unfold | Weekly bill run | Floor | Internal payables are truth | — |
| D1-12 | Held for release | UPDATE | Order paper / Ledger / Desk | Delegating money | Floor | Delegate without a new system | **N2, R1** |
| D1-13 | A find, a store buy | OVERHAUL | Document / 390 | Flea market, retail run | Floor; **R1/V1** | Everything in one place | R1 |
| D1-14 | Deposit then balance; riders billed | UPDATE | Document → Accounts | Fund before spending | Both | No hidden fees | **R1, R7** |

**Engagement check:**
- No proposal adds a push, a streak, a score, a count bubble or a recurring nudge.
- The Desk need lines are one-shot and dated (ack chase, held orders, claim deadline). Each disappears when its act is done.
- The only totals are front matter over their rows. That covers `S1`'s section head, the Ledger "due this week" and "held for release" (V11).

---

## 7. Order of work (design view, for the synthesis)

Sequenced by money lost per week of delay (r3 §6) and by how much is pure wiring.

1. **Wiring, no new models (UPDATE):**
   - D1-11 record paid (`useLogPaymentPaid`)
   - D1-07 status acts (`useUpdatePurchaseOrderStatus`), without tracking first
   - `LogAckInline` in the unfold Order cell, the minimum of D1-06
   - Ledger opens on `initialContext.projectId`. Today it starts with `projectLens = null` (`orders-ledger.tsx:156-158` **[H]**).
   - Note-to-vendor via the existing `message`
   - Retire `PoSendActions` and the toast prompts
2. **Stop the wrong address:** the ship-to picker plus studio receivers (D1-05 part, D1-08 part). Until receivers exist, the minimum fix is to remove the placeholder and force a choice between "the site" and "type an address". Never default silently.
3. **The spine:** D1-01 readings, the §3.4 readiness rule (also fixes the two disagreeing rules), D1-03 cells, D1-02 line card with inline maker and wired import/quote staging.
4. **New models:**
   - D1-06 full comparison
   - D1-08 claim clock
   - D1-09 Placed
   - D1-10 change UI
   - D1-13 purchase records
   - D1-04 custom pair + CFA
   - D1-14 deposit/balance
5. **After rulings:** D1-12 (N2); In/Out pairing (R1); rider markup (R1); price-age glyphs (R6); client delay notes (R7).

**Parked as side journeys** (log in `VISION-DECISIONS.md` if anyone proposes them):
- the samples & memos library (r3 M1)
- a job P&L screen (it is a dashboard unless it is front matter over rows; R1/V1-blocked)
- vendor reliability scores (refused, V11 `VISION-DECISIONS.md:236-241`)
- client-facing order tracking beyond what the client page already mirrors (V8 governs it)

**Seam to re-check after US-15:** the deck-import PLAN found every promote path writing `candidate`, dropping vendor, and writing retail as trade (`artifacts/deck-import-2026-10-03/PLAN.md:10-18` **[H]**). Fixes SQ-384…387 landed on main (git log **[H]**). Whether every promote path now yields an orderable line is **[I]**. The readiness rule makes whatever remains *visible* as reasons instead of silent dead ends.

---

## 8. Rulings this design touches

**Existing, held open:**
- **V1:** every "from Patina" money figure beyond the checkout amount; COM through the maker lane.
- **R1:** the In/Out pairing on one row; rider cost vs billed visibility; billing store buys.
- **R5:** substitutes priced below trade; client price on the line card.
- **R6:** price-age and quote-lapse glyph thresholds. Until ruled, show dates only.
- **R7:** client delay notes; deposit wording.
- **R8:** price changes after an ack or authorization; substitution.
- **R-DI4 / R-DI5:** the deck price basis (trade empty until confirmed); V1 on off-marketplace pieces.

**New, raised by this design (not resolved):**
- **N1 — Is the client's yes a hard gate on residential jobs?** Today residential lines at `specified`/`quoted` are orderable (`line-unfold.tsx:75` **[H]**). Proposed default: warn with a consequence sentence; keep commercial hard. *Kody.*
- **N2 — Does Patina offer an in-studio release threshold** (D1-12)? Per order or per vendor? Do admins release? *Kody, with Leah on practice.*
- **N3 — Studio-scoped makers.** Inline maker creation multiplies writes to the global, insert-anyone `vendors` table (00058 **[M]**). Should a studio's new maker be a studio card over a shared row? *Data lead / Kody.*
- **N4 — Does *read by next act* re-open what the R21 dissolve closed** (By Status)? I read it as allowed inside the Document **[I]**. *Kody.*

---

## 9. Mockup builder checklist

Build at 1280 (Document measure 1100px) and 390, light and dark, using `docs/design/house-sheet/SPEC.md` tokens only.

| Screen | Size | States to draw |
|---|---|---|
| S1 Project section, read by maker | 1280 | Open PO group with COM child + rider; vendor with 3 ready lines; "No maker yet" group; reading lens active state |
| S2 Project section, read by next act | 1280 | 8 non-empty groups; "Placed" folded |
| S3 Add to the job | 640 sheet | Default; "From a photo" `aria-disabled` (flag off) |
| S4 The line, as it will be bought | 640 sheet | Prefilled from link; "New maker" unfolded; "A find" seller swap; readiness words mixed |
| S5 Line unfold, six cells | 1280 / 390 stacked | Not ordered (reasons); in production with 1 ack difference; delivered awaiting check-in |
| S6 A custom piece | 760 sheet | COM with yardage math; CFA requested; "workroom supplies" collapsed |
| S7 The order paper | 760 sheet | Draft covered; not covered (fronting sentence); no receiver on file (`aria-disabled`); held; sent record; Patina maker lane |
| S8 Acknowledgment check | 760 sheet | Pre-filled clean; 3 differences; replied record |
| S9 Receiving with claim clock | Orders sheet | Awaiting with deadline; window closed (golden-ink); claim with photos |
| S10 Install section | 1280 | Room with Placed records; reason "check in first"; punch |
| S11 Ledger Money band | Orders sheet | Deposit paid record; balance unfolded "Record payment"; "Due to makers this week" front matter |
| A1–A3 Field check-in | 390 (Field) | Arriving list; per-line check-in with one damaged; saved with deadline |
| B1–B4 Release on phone | 390 (portal) | Desk need line; held group; compact paper with terminal; released record |

The terminal act appears only on the order paper's send/release, on `Order from Patina`, and on `Pay $X` (Stripe). Recording payments, check-ins, placing and adding lines are secondary or tertiary.

---

## 10. What I verified this pass, and what I did not

**Read myself [H]:**
- `line-unfold.tsx:75` ORDERABLE
- `step-review.tsx:30-44` placeholder
- `po-send/index.ts:368-392` site-address default
- zero callers of the three payment/status hooks (grep)
- `orders-ledger.tsx` pages, lenses, `projectLens` starting null
- `orders-book-vendors.tsx:76-84` isOrderable
- `po-send-actions.tsx:22-28` TODO
- `ffe-section.tsx` FFELine grid, install mode, spec-book door
- `add-to-project-sheet.tsx:258-345`
- `stamp-derivation.ts`, `procurement-lifecycle.ts` and `@patina/types` step labels
- `00148` PO/payment DDL; `00435:849-869` change RPC
- `doc-sheet.tsx` widths
- house-sheet SPEC §A
- `apps/designer-portal/CLAUDE.md` D1/D4
- VISION.md; V9/V11 text
- DECISIONS I109
- Field receiving screen copy
- deck-import PLAN seam list

**Taken from the research memos, spot-checked nearby only [M]:**
- RPC bodies in 00186/00190/00449/00413/00530
- vendors RLS (00058)
- the 00187 one-slot rule
- invoice tax
- closure derivation
- Field per-line receipt RPC

**Not verified:**
- whether the US-15 fixes made every promote path orderable
- whether iOS Field writes `installed`
- whether punch rows link to FF&E lines
- the studio address source for a default receiver
- any live behaviour (out of scope by ruling)
