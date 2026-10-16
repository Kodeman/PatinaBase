# Study D: recovery flows, from each billing blocker to fixed and billed

US-35 · SQ-1024 · 2026-10-16 · read from code at `f3c7fb53a`. No product source changed and no dev server was run.
Diagrams: [`flows.html`](./flows.html) has one inline-SVG flow per blocker, with today's path on the left and the proposed path on the right.

**Input set.** This study uses the US-35 contract's seed blockers 1–8. Study A (inventory/) extends that list and Study E (deck/) reconciles the two.
**What "fixed and billed" means here.** A draft is created and opens as the folio, or, for send, the email goes out.
**How steps are counted.** One step is one deliberate act by the person: a press, a pick, a commit-on-blur, or a navigation. Ticking the lines is the work itself, so it is counted once and not as a step. Re-ticking after the work was lost shows as **+N**. Counts are read from the code paths. Study B (walk/) should confirm them in the running portal.

---

## 0. Findings that shape every flow

These come from reading the code. Each one changes what a "shortest path" can honestly be.

| # | Finding | Evidence |
|---|---|---|
| F1 | **The composer's work lives only while the composer is mounted.** Every tick, override, deposit %, ad-hoc row, memo and term is a `useState` inside `InvoiceComposer`. The host has one overlay slot (`composer \| folio \| null`). Closing the sheet with Esc, the backdrop or the folio handoff unmounts the composer, and every tick is lost. | `invoice-composer.tsx:209-243`; `invoice-overlays.tsx:67-70, 96, 116-131` |
| F2 | **Repair sheets open *beneath* the composer today.** The composer and folio are `PaperFolioSheet` at `z-[60]`. The household sheet and the Account sheet are `DocSheet` at `z-50`. A repair sheet opened from inside the composer would render under it. `topActiveModalDialog()` already orders Esc correctly once the stacking is fixed. | `paper-folio-sheet.tsx` (`z-[60]`), `doc-sheet.tsx:369` (`z-50`), `household-sheet.tsx:384`, `account-sheet.tsx:171` |
| F3 | **A route change does not close the composer.** `InvoiceOverlays` is mounted in `app/(document)/layout.tsx:148`, so moving from `/doc/[id]` to `/desk?account=studio` keeps the composer open. The only fix-it link the composer has today ("set the studio rate →") therefore opens the Account · Studio page underneath the composer that is still showing (inferred from code; Study B to confirm). | `invoice-composer.tsx:962-967`; `desk-doorway.tsx:139`; `account-sheet.tsx:92-96` |
| F4 | **The composer already knows most blockers before Draft.** `selectedProject` is the `useProjects()` row (client and studio). `ffePartition.unpriced`, `ratePendingEntries`, `depositPctValid`, `billingFiguresMissing` and `studioMissing` are all computed before the act. Only the server-side refusals (claim time, billing lines, send) are post-submit by nature. | `invoice-composer.tsx:252-255, 265, 281-337, 517-519, 565-577` |
| F5 | **Contract correction: linking a client is not open to "any designer on the project".** `set_document_client` locks the project and refuses unless `projects.designer_id` is the caller ("no project owned by you"). The client must also be a `designer_clients` row of *that* designer. A teammate on the project who is not its designer cannot link the client, so the no-client flow needs a non-fixer branch. | `supabase/migrations/00385_set_document_client_relationship_consistency.sql:44-61, 63-87` |
| F6 | **Most unpriced FF&E lines have no client-price field anywhere.** In the Price lens only labor lines have an editable client price (`clientEditable: labor && !tradeScope && !released`). For a placed line, "no writer of a placed line's client price exists (D19 is not built)". The line card never types it (R5/R8). On an active job the a7 sentence sends price changes through Record a change. The composer's "set a client price to bill" points at a fix that exists only for labor lines. | `pieces/price-lens.tsx:13-17, 98-100, 402`; `schedule/line-card.tsx:9-12`; `overlays/record-a-change-sheet.tsx:3-12` |
| F7 | **Fixing the rate or the studio may not release hours already logged.** Naming a studio "prices only hours logged AFTER the stamp (P-4 — no backfill)". The rate resolver runs only inside the time-entry classifier trigger, and `project_unbilled_time` reads the stored `te.rate_source`. So adding a rate-card row likely leaves existing "rate pending" hours pending until each entry is written again (to confirm in Study A). | `use-time-tracking.ts:1150-1153, 1176-1177`; `00599_resolve_time_rate_cents.sql:559-601`; `00617_rate_pending_never_invoiced.sql:30-33` |
| F8 | **Send fails after issue.** "Send the invoice" runs `issue_invoice` first, then the `invoice-send` edge function. A `no_recipient` (422) leaves the invoice issued and numbered, and the note shows the bare code. | `invoice-folio.tsx:257-298`; `supabase/functions/invoice-send/index.ts:255-288`; `use-invoices.ts:1150-1162` |

**Primitives the proposals reuse (no new ones invented):** `DocumentAction held` plus `onHeldActivate` (§A5), the §A6 consequence sentence, `ActFailLine` (R83, no retry on sends or money writes), and the `MESSAGE_WITHHELD` reason+repair pair in `act-names.ts:217-221` ("Link a client first." / `Link a client`), which is already the house shape for a held act with a repair beside it. Also reused: `HouseholdSheet startEditing` (F3-R2-16), `useStampProjectPricingStudio`, `useSetLaborLinePrice`, `useSetStudioMemberRate`, `FOCUS_FFE_LINE_EVENT` with the pending-request pattern, and the Price lens.

**Shared mechanisms the flows assume (for E to reconcile; not decided here):**

- **M1 · One readiness read for the composer.** It returns an ordered list of `{reason, repair act, who can fix, focus target}`, following the precedent of `rooms/drafting/agreement/readiness.ts` `blockersForPart`. The Draft act is `held` while the list is non-empty. Activating it moves focus to the first repair and writes the reason to the status line (§A5). The §A6 sentence above Draft names the first blocker.
- **M2 · Repairs stack above the composer.** A repair sheet opened from the composer or folio renders above `z-[60]`, and the composer stays mounted underneath. That makes "fix in a sheet over the composer and come back" possible without losing work.
- **M3 · Parking for fixes that must leave the sheet.** A fix that needs the page (Pieces → Price lens) has two options. Either the composer is hidden but stays mounted, with a return act, or the selection is kept per project for the session. This is a trade-off for Kody (see the open questions).
- **M4 · "Ask your studio owner" is a note the designer sends.** A copyable note names the project, the gap and the act ("Name the studio on Kuehn Whole Home Renovation, in its Hours"). The designer sends it themselves. Nothing is sent automatically.

---

## Summary

| Blocker | Pre-knowable? | Earliest honest surface | Fix path (proposed) | Who fixes | Steps today → proposed | Work during detour |
|---|---|---|---|---|---|---|
| 1a No client (the project's designer) | Yes | Document band SETUP row (exists) → composer picker → held Draft | Sheet over the composer, then back | Project's designer | 11 + N, unguided → **5** | Lost → **kept** |
| 1b No client (teammate who isn't the project's designer) | Yes | Held Draft with reason | Ask the project's designer (note) | Project's designer | no path → **3 + wait** | Lost → kept while open (M3 for longer) |
| 1c No studio (owner/admin) | Yes | Held Draft with reason | Inline in the composer (one act) | Studio owner/admin | 8 + N, unguided → **3** | Lost → **kept** |
| 1d No studio (everyone else) | Yes | Held Draft with reason | Ask your studio owner (note) | Studio owner/admin | no path → **3 + wait** | Lost → kept while open |
| 2 Unpriced FF&E | Yes | Composer FF&E list, by line | Labor: inline price. Other lines: land on the Price lens, or none exists (D19) | Designer with money seat | 10 + N; often no path → **4** (labor) / **6** (landing) | Lost → **kept** (parked) |
| 3 Rate-pending hours | Yes | Composer hours group, by cause | Owner: inline rate. Others: ask. No studio: see 1c/1d | Studio owner/admin | 9 + N (and may not release, F7) → **4** | Lost → **kept** |
| 4 Deposit % / missing figures | Yes | At the input | Inline: focus moves to the input | Designer | 1, reason not at the act → **1** | Kept (today too) |
| 5 Partial failure and rollback | No (server) | At the act, after the press | Reason names the line; the refused line is unticked; retry the rest | Designer; support if stranded | 2–4, raw ids → **2** | Kept (today too); refused line unticked |
| 6 Send, no recipient | Mostly | Held Send before issue | Sheet over the folio (household EDIT), then back | Project's designer | 7, after issue → **3**, before issue | Message kept; invoice not issued early |
| 7 Raw error messages | No | At each act | Translate; retry only where it can help | Varies | n/a (copy) | n/a |
| 8 Studio invoice, no studio / missing fields | Yes | The composer's studio fields | Setup in the Account sheet over the composer / ask an owner; held → focus the field | Designer / owner | no act → **3–4** | Lost → **kept** |

---

## 1a. No client on the project, seen by the project's own designer (Leah, Kuehn)

**Today, from code (11 steps + N, and step 4 is a guess):**
1. Open *Draw an invoice* (Account band, Money head or ⌘K).
2. Tick the lines. This is the work, so it is not counted.
3. *Draft the invoice*. `canDraft` is true because it ignores client and studio (`:565-577`).
4. The throw at `use-invoices.ts:770` arrives in the uppercase-mono box (`:1389-1410`) as "INVOICE PROJECT IS MISSING ITS CANONICAL BILLING TUPLE". *Try again* (`:1399-1406`) throws the same error. Nothing names the client.
5. Close the composer. **All ticks are lost (F1).**
6. Open the band's sheet and find the SETUP row "No client linked" at its foot (`lens-band-derivation.ts:246, 340`: "never line 2").
7. *Link a client* opens *The household* sheet (`doc/[id]/page.tsx:2580-2582, 3542-3556`).
8. Pick the household.
9. Link it.
10. Close the sheet.
11. Reopen *Draw an invoice*, **re-tick +N**, then *Draft the invoice*.

**Pre-knowable:** yes. `selectedProject.client_id` is on the row the composer already holds (`:252`).

**Where to surface it earliest.** Four places, in order of earliness:
1. *Project creation.* `open-project-sheet.tsx:129-138` already asks, labelled "Select client (optional)" (see Prevention below).
2. *The Document band SETUP row.* It exists today, but it waits at the foot of the sheet.
3. *The composer's project picker.* The option can read "Kuehn Whole Home Renovation · no client yet".
4. *The composer act.* Draft is `held`.

**Proposed (5 steps):**
1. Open *Draw an invoice*. If it was opened from the Document, the project is already named.
   - *(No press)* The composer reads the missing client and holds Draft. The §A6 sentence above the act reads: "Kuehn Whole Home Renovation has no client yet. Link one to draft this invoice." *Link a client* sits beside it, using the `MESSAGE_WITHHELD` pattern. Ticking stays open while the act is held.
2. *Link a client* opens *The household* above the composer (M2).
3. Pick the household.
4. Link it. The sheet closes, focus returns to *Draft the invoice*, now live, and the ticks are intact.
5. *Draft the invoice*. The draft opens as the folio.

If Draft is activated while held, focus moves to *Link a client* and the reason goes to the status line (§A5). The press never does nothing silently.

**Who:** only the project's designer (F5). For teammates, see 1b.
**Work survival:** kept. The composer never unmounts.

**Prevention trade-off (presented, not decided):**

| Option | For | Against |
|---|---|---|
| A. Make the client required in `open-project-sheet` | No project ever reaches billing without a client. The blocker disappears at its source. | The sheet is for handshake projects ("a repeat client calls"). The household may not be in Patina yet. It adds a gate at creation, which works against the promise that the studio won't notice Patina. Projects arriving by other roads (capture lead, Field, imports) bypass it anyway, so the composer path is still needed. |
| B. Keep it optional and let the band raise the SETUP row when money first appears (first priced line, first logged hour, first milestone) | It asks at the moment of need, with no creation friction. It reuses an existing row. | It still appears after the work. It needs a rule for "money appears". Promoting a SETUP row above line 2 touches the band's class ordering (D2/D10), which is a design ruling. |
| C. Only the composer (picker annotation plus held act) | The smallest change, and it is the act where the gap actually matters. | Leah meets it at the worst moment, mid-billing, though with the work kept. |

These options don't exclude each other. C is needed in every case, because projects reach billing by roads other than the sheet. Whether to add A or B is Kody's call.

**Open questions (Kody/Leah):**
- Should the composer's project picker hide, annotate or keep projects without a client? Hiding them would recreate the dead end one step earlier.
- Is "Link a client" the act name inside the composer too (one name per act, `act-names.ts:135`)? It is assumed here.
- Leah: when you open a project on a handshake, how often is the household not yet in Patina?

---

## 1b. No client on the project, seen by a teammate who isn't its designer

**Today:** the same throw. No path inside Patina; the teammate cannot run `set_document_client` (F5).

**Proposed (3 steps for the teammate, plus the wait):**
1. Open *Draw an invoice*. The held sentence reads: "Kuehn Whole Home Renovation has no client yet. Only Leah, who runs this project, can link one."
2. *Copy a note for Leah* copies text such as "Kuehn Whole Home Renovation needs its client linked before it can be invoiced: The household → Link a client." The teammate sends it however the studio talks (M4).
3. After Leah links the client, the teammate reopens the composer (or it was never closed) and drafts.

**What non-fixers see:** a reason and a note to copy. Never a dead *Link a client* act.
**Work survival:** kept while the composer stays open. A teammate who closes it and waits loses the ticks, unless Kody picks M3's per-project selection memory.

**Open questions:** Should the RPC admit studio owners/admins, or any project team member? That is a permission ruling that changes this flow to the 1a shape. Copy-a-note or an in-app mention: does the studio have a channel Patina should use (Agent OS: never an automated external send)?

---

## 1c. No studio on the project, seen by a studio owner or admin

**Today (8 steps + N, and step 3 is a guess):**
1. Open the composer.
2. *Draft the invoice*. The same "canonical billing tuple" throw, for a different cause.
3. *Try again* throws the same error. Nothing names the studio.
4. Close the composer. **Ticks lost.**
5. Open the Hours ledger for the project and find "priced by · no studio yet" (`hours-ledger.tsx:1513-1560`).
6. *Name studio*.
7. Reopen the composer and **re-tick +N**.
8. *Draft the invoice*.

**Pre-knowable:** yes, from `selectedProject.studio_id`. The viewer's owner/admin role is on `useOrganizations()` (the composer already reads it, `:159-160`).

**Proposed (3 steps; 4 when the owner has two studios):**
1. Open the composer. Draft is held. The sentence reads: "Kuehn Whole Home Renovation isn't under a studio yet. Name the studio to draft." The act beside it uses the hours-ledger label, *Name studio*.
2. *Name studio* runs inline: it is a single RPC and needs no sheet. With two eligible studios, a choice comes first (that is the extra step). The consequence sentence has to say what the stamp means: "Names Middle West Studio as this project's studio. It can't be changed later, and only hours logged from now on are priced by it" (`use-time-tracking.ts:1150-1153, 1176`).
3. *Draft the invoice*.

**Who:** an owner or admin of a studio that employs the project's designer. The server decides (`useStampProjectPricingStudio` never pre-judges).
**Work survival:** kept.

**Open questions:**
- The act name: the hours ledger prints *Name studio* and the contract cites "Name the studio". One name per act needs a ruling and an `act-names.ts` row.
- The stamp is final. Should it ask once before stamping, or is the consequence sentence enough?
- After the stamp, hours logged earlier stay "rate pending" (F7). Does billing them need a re-price, or an ad-hoc line? See 3.

---

## 1d. No studio on the project, seen by everyone else

**Today:** the same throw. The hours ledger prints "no studio yet — hours here read 'rate pending'" with no act and no direction (`hours-ledger.tsx:1534-1537`). There is no path inside Patina.

**Proposed (3 steps for the designer, plus the wait):**
1. Open the composer. The held sentence reads: "Kuehn Whole Home Renovation isn't under a studio yet. Only a studio owner or admin can name it. Ask Leah."
2. *Copy a note for Leah* (M4). The owner's name comes from the studio roster. With no single owner, the note reads "your studio owner".
3. After the owner names the studio, *Draft the invoice*.

**What non-fixers see:** a reason, who can fix it, and a note. Never the *Name studio* act. Never the throw.
**Work survival:** as in 1b.
**Open question:** should the owner also see this gap on their own surfaces, such as a Desk or Studio SETUP line, so the note isn't the only way they hear about it?

---

## 2. Unpriced FF&E lines

**Today:** a muted line under the FF&E list reads "3 unpriced lines — set a client price to bill" (`invoice-composer.tsx:1164-1180`). It names no line and links nowhere, and the lines can't be ticked. To fix one, once the composer is open (that open is the first of the 10 steps):
1. Close the composer. **Ticks lost.**
2. Open Pieces and switch to the Price lens.
3. Find the line.
4. A labor line takes a typed client price (`price-lens.tsx:421-433`). Any other line has **no field** (F6). On an active job the a7 sentence sends the change through *Record a change*.
5. *Record a change*.
6. *On a piece*.
7. Choose the piece. That reaches a change order only when the line is on a live PO; otherwise the line just unfolds (`record-a-change-sheet.tsx:6-9`).
8. Reopen the composer and **re-tick +N**.
9. Draft.

That is 9 steps + N when a writer exists. For most placed lines on an active job **there is no path**.

**Pre-knowable:** yes, from `ffePartition.unpriced` (`lib/document/invoice-composer.ts:174-198`).

**Proposed:**

- *Labor lines (4 steps):*
  1. Open the composer. The unpriced list names each line.
  2. Type the line's client price in its own row. This is the same writer, `set_labor_line_price`, and the same "until released" rule.
  3. The line becomes tickable. Tick it.
  4. *Draft the invoice*.
- *Other lines (6 steps):*
  1. Open the composer.
  2. *Price it* on the named line. The composer parks (M3).
  3. The Price lens opens on that line's row, with focus on its price control.
  4. Make the change the house allows. Today that is *Record a change*; a D19 field if Kody builds one.
  5. *Back to the invoice*. The parked composer returns with its ticks.
  6. Tick the line and *Draft the invoice*.
- Where no change is possible yet, the row says so plainly: "Client price for Walnut console isn't set, and it can't be typed yet on an active job." There is no act. That is honest, not a dead link.

**The `price` landing sketch.** It extends the ⌘K landing that exists today:

```ts
// lib/document/registry.tsx:743-756 (today: 'order' | 'maker' | 'draft' | 'order-draft')
export interface FocusFfeLineRequest {
  itemId?: string;
  purchaseOrderId?: string;
  cell: 'order' | 'maker' | 'draft' | 'order-draft' | 'price';
}
```

- **Dispatch:** `focusFfeLinePending.request = { itemId, cell: 'price' }`, then `FOCUS_FFE_LINE_EVENT`. This is the same pending-request pattern, so it lands even when Pieces is folded.
- **Answer:** the Price lens, not the line unfold, owns the client price. The listener therefore has to (a) switch the Pieces region to the Price lens, (b) pick the line's room on the rail, then (c) `landOnControl()` the row's client-price input (labor), or, when it has no input, the row's *Record a change* act. Today `FFE_ACT_CONTROL` in `ffe-section.tsx:1172-1178` has no price entry; it needs a `price` selector on a stable `data-action-key`.
- **What it looks like:** scroll, then focus with the house focus ring, the same as every landing today (`ffe-section.tsx:1183-1197`). No scrim, spotlight or opacity. Those wait for Kody's pick from the deck (contract: out of scope, D4, and SPEC "never opacity:.5").
- **Return:** a *Back to the invoice* act at the row, or in the status line, re-shows the parked composer. Without M3 the return has nothing to restore.

**Who:** a designer with a money seat (the Price lens is absent without one, `price-lens.tsx:20`). Others see the line named, with "Ask Leah to price it".
**Work survival:** kept: inline for labor, parked for the rest.

**Open questions:**
- **D19.** Should a placed line's client price become typeable (before release, or always), or is *Record a change* the only door on an active job? The answer decides whether the 6-step path exists for most lines.
- Inline pricing inside the composer: a convenience for labor lines only, or a pattern Kody doesn't want (money typed in the billing sheet rather than in Pieces)?
- M3: is parking acceptable, or should "Price it" open a small price sheet *over* the composer, which needs a client-price writer first?

---

## 3. Rate-pending hours

**Today (9 steps + N for an owner, and it may not release the hours):**
1. The hours group lists rate-pending rows (not tickable). *set the studio rate →* is a `Link` to `/desk?account=studio` (`:962-967`). Click it.
2. The Account · Studio page opens beneath the composer, which is still open (F2, F3). Close the composer. **Ticks lost.**
3. Find the member's rate row.
4. Type the rate and blur. It saves on blur (`studio-rate-rows.tsx:7-9`).
5. Close the Account sheet.
6. Go back to the Document.
7. Reopen the composer.
8. **Re-tick +N.**
9. Draft.

**And then:** the resolver runs only when a time entry is written (F7), so the hours already logged may still read "rate pending" (Study A to confirm). For a teammate, the rate rows are read-only ("the studio's owner, or another admin, has to write it", `studio-rate-rows.tsx:127`): a dead end. On a no-studio project, a rate card cannot price the hours at all.

**Pre-knowable:** yes, from `ratePendingEntries` (`:330-337`). `rate_role` and `rate_source` are on the view (00617), so the cause can be told apart:

| Cause | Fix |
|---|---|
| (a) The project has no studio | See 1c/1d |
| (b) The member has no studio rate | Set that member's rate |
| (c) The member is an admin with a self-authored rate (00615) | Only the owner can price it |

**Proposed (owner, cause b: 4 steps):**
1. Open the composer. The group reads "2 hours by Sam have no rate yet." *Set Sam's rate* sits beside it.
2. Type the rate inline (`useSetStudioMemberRate`, the same write-through), or open Account · Studio over the composer (M2).
3. The hours re-read and can be ticked. If F7 is confirmed, the flow needs a server re-price act for the pending entries here; until that exists the honest sentence is "Rates set now price new hours. These 2 hours stay pending" plus Kody's ruling (see the open questions).
4. Tick the hours and *Draft the invoice*.

**What non-fixers see:** "Only a studio owner or admin sets rates. Ask Leah." and *Copy a note for Leah*. Never a link to a page they can't act on.
**Work survival:** kept. The composer never navigates away.

**Open questions:**
- **F7:** should setting a rate re-price an owner's pending hours, or do pending hours stay pending and get billed as an ad-hoc line? This is a money-truth ruling.
- When a project has no studio *and* pending hours, which repair comes first? (Proposed: name the studio, then the rate.)

---

## 4. Deposit percent out of range, or a line with no figure

**Today (1 step):** the deposit input shows "a percent above 0, at most 100" as `role=alert` beside it (`:1009-1017`). That part is good. But *Draft the invoice* is natively `disabled` (`:1368-1380`), so it drops out of the tab order and the reason is not reachable from the act. A rider with no estimate (`billingFiguresMissing`, `:517`) disables Draft with no reason at the act at all.

**Proposed (1 step):** Draft is `held`. Activating it moves focus to the deposit field, or to the rider row's amount, and writes the reason to the status line. The §A6 sentence names the gap ("The deposit needs a percent between 0 and 100.").
**Who:** the designer. **Work survival:** kept, as today.
**Open question:** should the deposit input be natively `disabled` when "in full" is chosen (`:1003`, with `disabled:opacity-50`)? It conflicts with SPEC "never opacity:.5". Flag it for the T1 fix rather than this study.

---

## 5. Partial failure after the draft is created, and the rollback

**Today:** the draft is created, then two follow-up writes run:
- **Claim time** fails (`:615-647`): the draft is deleted. If the delete also fails, the message carries the raw invoice id: "The draft {uuid} still holds those hours — void it to release them."
- **Billing lines** fail (`:653-681`): the RPC's own text shows, for example "add_invoice_billing_lines: purchase {uuid} is already billed" (00718:1020-1303). Then the draft is deleted, or the message reads "The draft {uuid} was kept — delete or void it."

*Try again* always re-runs the whole draft. The composer stays open, so **the work survives today**. But the refused line stays ticked, so a "line already billed" refusal (someone else billed it since the composer opened) fails again on retry. Steps today run 2–4: a retry that repeats the failure, then a guess.

**Pre-knowable:** no. These are server refusals and races.

**Proposed (2 steps):**
1. *Draft the invoice*. On refusal, an `ActFailLine` (role=alert) appears at the act. It names the line in designer words: "The Holloway sconce purchase was billed on another invoice after you opened this. It's been unticked." The composer re-reads its lists, the refused subject drops out, and every other tick stays.
2. *Draft the invoice* again with the rest. There is no *Try again* for a refusal that would repeat; *Try again* appears only for a transient failure (network, timeout), per the `ActFailLine` rule.

**Stranded draft** (the delete failed): no uuid. The sentence reads "This draft couldn't be cleaned up, and it still holds 6 hours. Open it to delete it." *Open the draft* opens the folio. Support is needed only if the folio can't delete it.

**Translation table:**

| Refusal | Designer sentence | Retry? |
|---|---|---|
| already billed / voided / was {status} | names the line; unticks it | No; draft the rest |
| not billable to the client | names the line; "not set to bill to the client" | No |
| rider has no estimate or actual | focuses that rider's amount (pre-knowable via `billingFiguresMissing`, see 4) | No |
| is in {currency}, the invoice in {currency} | names the line and both currencies | No |
| not a draft / not found / access denied | "This draft changed while you were working. Reopen the composer." | No |
| network / timeout | "The draft didn't reach Patina." | Yes |

**Who:** the designer. Support is involved only for a stranded draft the folio can't remove.
**Work survival:** kept (as today), and the refused line is now unticked instead of re-failing.

**Open question (for Kody; architecture):** one server transaction for draft, claim time and billing lines would remove rollback and stranding entirely. That is an RPC/migration change, outside US-35's no-migrations scope, and is recorded here only as the root alternative.

---

## 6. Send with no recipient email

**Today (7 steps):**
1. *Send the invoice*. Issue succeeds and the invoice is numbered. Then `invoice-send` returns `no_recipient` (422). The note reads: "Could not send — issued as INV-0042; no_recipient. Resend to retry." (`invoice-folio.tsx:291-297`).
2. Leave the folio.
3. Go to the Document.
4. Open *The household*.
5. *Edit*, then add the email and save.
6. Reopen the invoice (Accounts book) and its folio.
7. *Resend*.

The invoice was **issued before anyone could fix the address**. The fallback copy-link is offered.

**Pre-knowable:** mostly. The edge function resolves the recipient in three tiers: the invoice client's email, then the profile, then `designer_clients.client_email` (`invoice-send/index.ts:259-283`). The folio reads only `invoice.client?.email` (`:473`). To hold the act honestly, the folio needs the same three-tier answer: a read of the resolved recipient, not a second guess.

**Proposed (3 steps, before issue):**
- *(No press)* The folio holds *Send the invoice*. The sentence reads: "There's no email for the Kuehns yet. Add one to send, or issue and share the link." *Add their email* sits beside it.
1. *Add their email* opens *The household* in EDIT (`startEditing`) above the folio (M2).
2. Type the email and save. The sheet closes and focus returns to *Send the invoice*, now live. The designer's message is kept, because the folio stays mounted.
3. *Send the invoice*.

**After issue** (a race or a bounce): keep today's issued state. Say "Issued as INV-0042. There's no email for the Kuehns, so nothing was sent." and offer *Add their email*, then *Resend*. Bare codes are never shown.

**Who:** the project's designer. Household EDIT writes that designer's relationship row; the same limit as F5 applies to confirm. Non-fixers see "Ask Leah to add the Kuehns' email" and the copy-link fallback.
**Work survival:** the message text is kept. No issue happens until the act can complete.

**Open questions:**
- Is "issue now, send later" a real studio need (handing the invoice over by hand)? If so the held Send needs a sibling *Issue only*. Its act name and placement are a design ruling.
- The bounced/suppressed path already offers "Fix the address in People" (`invoice-folio.tsx:476-479`). Should the no-email path use the household sheet (proposed) or People (existing)? One door would be better.

---

## 7. Raw error text across invoice hooks

**Today:** `throw error` PostgrestError messages surface verbatim from update, upsert, delete, issue, record-payment, chase and void (`use-invoices.ts:346, 353, 369, 888, 926, 944, 977, 1011, 1042, 1092, 1203, 1587`). The same happens in `useGenerateMilestoneInvoice` (`use-account-page.ts:394-410`) and in `account-band.tsx:176-204` ("Could not draft the invoice — {raw}").

**Not pre-knowable** in general. The flow is the same for each act:
- **Refusal with a fixer:** name the gap and the fixer, as in 1a–1d, 3 and 6.
- **Refusal without a fix:** say what happened in designer words, with no retry.
- **Transient:** "didn't reach Patina", with *Try again*, except on sends and money writes (record payment, void), where the `ActFailLine` rule forbids retry. Those say "Check the invoice before trying again", because the first press may have landed.

The account-band milestone path should hit the same readiness (M1) *before* it calls the generator, so "Draft an invoice" from the band is held for the same reasons as the composer.
**Open question:** should a hook map these (one table in `@patina/supabase`), or each act site? That belongs to the implementation ticket, not this study.

---

## 8. Studio invoice (no house): no studio, or missing fields

**Today:**
- **No studio:** a muted line "no studio to draw from · this account belongs to none yet" (`invoice-composer.tsx:1382-1387`), with no act and no direction.
- **Missing household, "regarding" or lines** (`canDraftStudioInvoice`, `lib/document/invoice-composer.ts:712`): Draft is natively disabled, with no reason at the act.

**Pre-knowable:** yes, from `studioMissing` and the three fields.

**Proposed:**
- *A designer in no studio* (3 steps):
  1. The sentence reads "This account isn't part of a studio yet." *Set up your studio* opens Account · Studio above the composer (M2). For someone joining a studio instead: "Ask your studio owner to invite you" with a copyable note.
  2. Set up the studio, or accept the invite.
  3. Back in the composer with the fields kept, *Draft the invoice*.
- *Missing fields* (1 step each): Draft is held. Activating it focuses the first empty field (household → regarding → a line) and writes the reason to the status line.

**Who:** the designer creates a studio; an owner invites a member.
**Work survival:** kept (M2).
**Open question:** is studio creation from inside billing acceptable? Or should a studio-less account never see "the studio · no house" at all? The flag already fail-closes the choice. Hiding it moves the dead end rather than removing it.

---

## For Study E to reconcile

- **F5** corrects the contract's "any designer on the project" for the client link.
- **F6** shows that "set a client price" has no writer for most lines. The fix path depends on D19.
- **F7** shows that the rate and studio repairs may not release hours already logged.
- M1–M4 are the four mechanisms every proposed flow assumes. M2 (stacking) and M3 (parking) are the two whose absence breaks "work survives the detour".
- The step counts above are read from code. Study B's walk should replace them with observed counts where it can.
