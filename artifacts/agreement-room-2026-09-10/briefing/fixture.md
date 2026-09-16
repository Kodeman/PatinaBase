# Fixture — the Okonkwo house

One fixture for the whole program. Every specimen, every wireframe, every memo
and every deck sheet uses these names and these figures and **no others**.

---

## 1 · The parties and the paper

| Field | Value |
|---|---|
| Studio | Middle West Studio, Madison |
| Client | Dave Okonkwo |
| Client account | `dave@okonkwo.test` |
| Document | Design services agreement · V1 · DRAFT |
| Date | 10 September 2026 |
| Parts | the nine standard parts, in the order `PATINA_STANDARD_AGREEMENT_PARTS` seeds them (`packages/types/src/agreement.ts:96-106`) |
| Estimate | $22,200.00 of professional time |
| Ceiling | $24,000.00 |
| Retainer | $5,000.00 |
| Role rates | Principal $185.00 / hour · Designer $140.00 / hour · Assistant $85.00 / hour |

**The one new figure.** Step 7 of the task script adds a Flat fee part. Its title
is **Concept fee** and its amount is **$2,400.00**. This is the only figure in
this program not carried over from the plan, and it is introduced here so every
seat writes the same number. Nothing else is invented: no other names, no other
amounts, no other dates.

The $22,200.00 estimate describes the resting fixture — the nine standard parts
as written below, before the Concept fee is added. This file does not recompute
it, and no seat should.

---

## 2 · The nine standard parts, as they would read in a finished agreement

Figures live only in `schedule` parts. The two clause parts and the two list
parts carry no money (R5). "Not yet set" is R21's own wording, taken from
`packages/types/src/agreement-copy.ts:38`.

### 1 · Services — clause

> Middle West Studio provides interior design services for the Okonkwo house:
> concept development, design documentation, and selections. The studio draws
> the rooms, specifies the pieces and finishes, and coordinates with the trades
> doing the work. Furnishings and purchasing stay outside this agreement.

### 2 · Deliverables — list

> — Concept presentation for each room in scope
> — Design documentation — plans, elevations, and finish schedules
> — Selection schedules naming maker, finish, and lead time
> — One walkthrough at installation

### 3 · Exclusions — list

> — Construction labor and permits
> — Structural, mechanical, electrical, and plumbing engineering
> — Purchasing, freight, and installation of furnishings

### 4 · Role rates — schedule / `rate_card` · *creates authority*

| Role | Rate |
|---|---|
| Principal | $185.00 / hour |
| Designer | $140.00 / hour |
| Assistant | $85.00 / hour |

> Professional time is billed at the rate of the person who worked it.

### 5 · Ceiling — schedule / `ceiling` · *creates authority*

> $24,000.00

> Professional time stops at this figure. Work past it needs a written
> authorization first.

(Required whenever a rate card is present — R4. The uncapped alternative is
`AGREEMENT_PART_COPY.ceilingUncapped`, `agreement-copy.ts:17`: "No ceiling —
professional time is billed as it is worked.")

### 6 · Furnishings deposit — schedule / `procurement` · *creates authority · deposit only*

> Not yet set

(R21. The part exists and prints its name; the figure is unwritten, and the
paper says so rather than printing `0%`.)

### 7 · Retainer — schedule / `retainer` · *creates authority*

> $5,000.00

> Credited against the first invoices.

> Design work begins after the fully executed agreement and retainer payment.

(The third line is `AGREEMENT_PART_COPY.retainerOnPayment`,
`agreement-copy.ts:19-20`, selected by `activationPolicy: "retainer_paid"`.)

### 8 · Billing cadence — schedule / `cadence` · *creates authority*

> Monthly

> Additional work requires written authorization before it can be invoiced.

(The second line is `AGREEMENT_PART_COPY.cadenceNote`, `agreement-copy.ts:24-25`
— always printed under a cadence part, with or without a chosen cadence.)

### 9 · Terms — clause

> This agreement stands until the work it describes is finished, or until either
> party ends it in writing with fourteen days' notice. Drawings, schedules, and
> specifications the studio prepares stay the studio's work; the Okonkwos hold a
> license to use them for this house. Invoices are due on receipt, and work
> pauses on an invoice unpaid for thirty days. Wisconsin law governs this
> agreement.

### 10 · Concept fee — schedule / `flat` · *creates authority* — added at step 7

> $2,400.00

> A flat fee for the concept phase, invoiced once at its presentation.

---

## 3 · Leah's task script — 13 steps

Run it once against today's page (the code, `kody-screenshot.png`, and the local
plates if present), then once against **each** direction.

**Record per step:** clicks · scrolls · mode switches · estimated seconds ·
uncertainties. Every "where am I, did it save" moment is a finding, not a note.

| # | Step | What to watch |
|---|---|---|
| 1 | Open the draft. | Note the title, note "Saved", note what the aside says. |
| 2 | Set the client account. | |
| 3 | Write Services. | Check it on the paper **without leaving the field**. |
| 4 | Deliverables: add one line, remove one. | |
| 5 | Rate card — three roles. Then the ceiling. | Note readiness **while the ceiling is still unset** (R4). |
| 6 | Retainer $5,000. | The first attention item clears. Does the count move **with a sentence** (W3R3-03)? |
| 7 | Add a part → Flat fee (Concept fee, $2,400.00). | Where does it land, and how do you place it? |
| 8 | Hide Exclusions (R39). | What does the paper do? |
| 9 | Move Billing cadence above Retainer. | Pointer first, then keyboard. |
| 10 | Terms. | The second attention item clears. |
| 11 | Preview the client's copy. | Is it the paper you were editing? Would you still need this act? |
| 12 | Review & send. | Read the consequence sentence. Does it still speak in seven facets (N4)? |
| 13 | Find "Return to the seven facets" untold. | **Do not take it.** |

---

## 4 · What the fixture is for

- Every money figure a specimen prints traces to §1 or §2 of this file.
- Every name a specimen prints traces to §1.
- The deck's fact-check re-greps every `path:line` and traces every figure here.
  A figure that appears nowhere in this file is a defect.
