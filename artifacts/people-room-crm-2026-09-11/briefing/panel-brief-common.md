# Panel brief: the shared charge

Briefing file 3 of 3. Every seat reads this file first, then `fixture.md`, then `current-state.md` §A–§D and §F. `current-state.md` §E is read only after your findings are written (§5 below).

---

## 1. Kody's ask, verbatim

> Assemble a team of construction experts with a team of UX UI designers. Their goal is have a working session and brainstorm what the perfect CRM for construction looks like. Tracking people involved from every aspect of the project and different forms of contact from account access, app access, email or text only, etc. The team should identify the key components and pieces to track, then think about how that integrates into Patina's People room… This is a tactical business function, we can skip all the prose and use real world business terms.

Two halves. First: what a construction CRM must track (people, firms, roles, reach, consent, documents, authority, lifecycle). Second: how that lands in the People room and the Call Sheet as they exist today.

---

## 2. Rulings already taken

| ID | Ruling | Effect on the panel |
|---|---|---|
| PR-1 | Lens = studio-led residential design-build. Hartwell Studio holds the owner agreement; the GC works under the studio's direction. | Commercial GC-led CRMs (Procore, Buildertrend as GC tools) are references, not the target. The fixture is the target. |
| PR-2 | One redesign direction, not three. The panel converges on one proposal for the People room and the Call Sheet. | Seats argue for elements; the synthesis (`synthesis/crm-model.md`, then the deck) picks one shape. No A/B/C specimens. |
| PR-3 | The customer is the studio. Homeowners are the studio's clients; trades and makers are the studio's vendors (`docs/vision/VISION-DECISIONS.md:19`). | A trade portal, a homeowner CRM, or a GC-facing product is a side journey. Tag it (§6), write it up, do not build the direction around it. |
| PR-4 | Surfaces are ranked: The Document → iOS → marketplace (`VISION-DECISIONS.md:18`). | The People room and the Call Sheet are Document surfaces. Patina Field (iOS) is second. |
| PR-5 | Prior product decisions in `current-state.md` §F (rolodex = `studio_contacts` studio-wide; roster = parties + team behind `v_project_roster`; code-resident vocab over TEXT; STUDIO default lens; Call Sheet as a DocSheet) stand unless Kody overrules. | Context, not a veto. A finding may propose overturning one; it is tagged `AMENDMENT-ASK` and still written in full. |

---

## 3. What a seat must read

| Seat type | Must read | Also read |
|---|---|---|
| Construction seats (CS1–CS6) | this file · `fixture.md` · `current-state.md` §A–§D, §F (then §E after findings) | `docs/design/studio-rosters/README.md` for what the Call Sheet program shipped |
| UX seats (IA / IX / VC / FM / LH / AX) | this file · `fixture.md` · `current-state.md` §A–§D, §F (then §E after findings) · `synthesis/crm-model.md` (the construction seats' merged model, when it lands) | `docs/design/house-sheet/SPEC.md` §A in full, then §F; `docs/design/studio-rosters/the-call-sheet-ui-proposal.html` |
| Synthesis (CRM-) | every construction memo | `current-state.md` §E in full |

Evidence you may cite: a `path:line` in the worktree, a fixture row `F-nn`, a `current-state.md` section or gap `G-n`, a house-sheet §, a ruling `PR-n` / `PD-n`. No claim without one.

Off limits: production, Strata, PostHog, `pnpm dev`. The code is read at the worktree; nothing is run.

---

## 4. Deliverable per seat

One memo per seat: `panel/construction/memo-<seat>.md` or `panel/ux/memo-<seat>.md`. In this order.

1. **Non-table text.** Construction seats ≤ 900 words. UX seats ≤ 1,200 words. Short declarative lines. Business terms. No em-dashes.
2. **Findings table**, exactly these columns:

```
ID | P1–P3 | confidence | claim | evidence | proposed
```

   - `ID`: your prefix + number (§8).
   - `P1–P3`: P1 blocks the direction; P2 must be fixed or ruled out in writing; P3 is a nit.
   - `confidence`: high / med / low. Low-confidence findings are wanted.
   - `claim`: one sentence, a fact or a defect.
   - `evidence`: `path:line`, `F-nn`, `G-n`, `PD-n`, or a house-sheet §.
   - `proposed`: one sentence. If it needs a ruling overturned, prefix `AMENDMENT-ASK:`.
   - After the cold-findings pass (§5), each row also carries `new` / `known(G-n)` / `touches(G-n)` at the end of the `proposed` cell.

   Report every finding. Severity filters depress recall; the synthesis filters, you do not.

3. **"Ranked top 5 things Patina must track that it does not today."** Five numbered lines. Each names the fact, the object it belongs to (person / firm / party-on-job / studio), and the fixture row that proves the need.
4. **"What would change my mind."** Three to five lines. The concrete evidence or specimen that would move your top-5 or a P1.

Seats with a required artifact (a state table, a field inventory, a data-model sketch, an a11y acceptance list, a feasibility table) attach it after item 4 under its own heading. Tables, matrices, numbered lists only.

---

## 5. Cold-findings rule

1. Write your findings table BEFORE opening `current-state.md` §E (the gaps register G-1…G-24).
2. Then open §E and mark every finding:
   - `new`: not on the register.
   - `known(G-n)`: the same item; name the row.
   - `touches(G-n)`: adjacent; say how in five words or fewer.
3. Do not delete a finding because it is known. Recall is measured against a list you had not seen.

`current-state.md` §A–§D, §F, §G are safe to read first and you should.

---

## 6. Governance

| Constraint | Source | What it means for a finding |
|---|---|---|
| The studio is the customer; homeowners and trades are not | `VISION-DECISIONS.md:19` (S2) | A feature whose payer or primary user is a homeowner, a GC, or a sub is a side journey |
| Never optimize the studio surface for engagement | `VISION-DECISIONS.md:21` (S4) | No dashboards, badges, counts-as-motivation, streaks, or "activity" chrome in the People room or Call Sheet |
| Surfaces ranked Document → iOS → marketplace | `VISION-DECISIONS.md:18` (S1) | Propose for the Document first; iOS second; nothing for a trade app |
| Designer-Taught Intelligence, never "AI" | `CLAUDE.md` vision block; `ask-bar.tsx:8` | The words on any face |
| House sheet rules for faces | `docs/design/house-sheet/SPEC.md` §A5, §A13 | No pills, status dots, badges, count chips, ✓ glyphs, spinners, shadows, truncation on a specimen; ruling ids never on a face |
| Prior decisions PD-1…PD-14 | `current-state.md` §F | Context, not a veto |

Anything outside these constraints is tagged `AMENDMENT-ASK` in the `proposed` cell, written up in full, and routed to the deck's ruling sheet. Never dropped, never quietly folded into a compliant version. If your strongest idea needs an amendment, say so and also give the compliant version.

---

## 7. Vocabulary

Use the trade's words. Memos and tables may use any of these freely. Faces (the words a designer reads on a specimen) follow the house sheet and the Patina lexicon.

| Term | Meaning in this panel |
|---|---|
| Owner / owner's rep | the homeowner, or the person the homeowner delegates to sign |
| AHJ | authority having jurisdiction; the city building inspector (F-27) |
| Preconstruction | the phase from agreement to permit: budgeting, subs bidding, submittals of samples |
| Sub tier | first-tier sub (contracts with the GC) vs second-tier (contracts with a sub) |
| COI | certificate of insurance (GL, workers' comp, auto), with an expiry |
| W-9 | tax form the studio or GC holds before paying a firm |
| License | state or municipal contractor / trade license, with number and expiry |
| Lien waiver | conditional (on payment) then unconditional (after payment), per draw |
| Retainage | the percent held back from each sub payment until completion |
| Draw | a periodic payment request against the schedule of values; certified by the lender's inspector (F-26) |
| Change order (CO) | a signed change to scope, price, or time; the fixture's $2,500 threshold |
| RFI | request for information, from the field to the architect or designer, with a due date and a court |
| Submittal | a product data / shop drawing / sample sent for approval, with revisions |
| Punch list | the closeout defects list, walked by the superintendent and the designer |
| Court | Patina's word for whose turn it is (`client_decisions.court`, `current-state.md` §E G-15) |
| Reach | Patina's word for how a person is actually reachable: account / field link / on paper (PD-12) |
| Rolodex | `studio_contacts`, the studio's shared book (PD-1) |
| Call Sheet | the project roster DocSheet (PD-6) |
| Party | a `project_parties` row: one person, on one job, with a kind and a trade |

Words that do not go on a studio face: "AI", "CRM", "dashboard", "wizard", "badge", "pill", "chip", "modal", "toast", "spinner", any `R\d+` / `PR-\d+` / `G-\d+` id. Memos may use all of them.

---

## 8. ID prefixes

| Prefix | Who | Example |
|---|---|---|
| CS1 … CS6 | the six construction seats, one prefix each, as the roster assigns | `CS3-4` |
| CRM- | the synthesis (`synthesis/crm-model.md`) | `CRM-12` |
| IA | information architecture seat | `IA-2` |
| IX | interaction seat | `IX-5` |
| VC | visual and house-sheet craft seat | `VC-1` |
| FM | field-model and feasibility seat (data, RLS, vocab) | `FM-7` |
| LH | Leah's seat, the practicing designer | `LH-3` |
| AX | accessibility and system critic | `AX-2` |
| PR- | rulings, taken or asked (`AMENDMENT-ASK` items get a PR- number at synthesis) | `PR-6` |
| G- | gaps register rows in `current-state.md` §E | `G-14` |
| F- | fixture rows in `fixture.md` §2 | `F-16` |
| PD- | prior decisions in `current-state.md` §F | `PD-4` |

One id per finding, never reused across memos. The synthesis maps `CSn-m` to `CRM-k` and keeps the crosswalk in its own table.
