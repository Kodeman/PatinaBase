# Judge J2 — Purchase & designer trust

**Rubric:** `source/instruments.md` §8. Would D1 / D2 / D3 send clients here (0–10 each), and is the purchase path
Apple-compliant, designer-attributed and trustworthy for a $4,000 piece (0–10). Total /40 per direction.
**Read:** `source/direction-a.md` (v2), `source/direction-b.md` (v2), `source/shared-planks.md` (SP-01…SP-20, inherited by both —
neither direction is scored for a plank), the eight critiques, `research/36-findings-by-theme.md`,
`research/31-verified-findings.json`, `research/2x-panel-d1/d2/d3.md`.
**Not averaged with J1 or J3.** Panel voices are simulated (§11).

**Scored against, verbatim, the three walk-away lines:**
- D1: *"A 'Buy now' button on a piece with no designer attribution… If my client buys the sideboard I specified and I get
  neither the margin nor a line on the schedule, Patina has become a retailer using my client list."* (`2x-panel-d1.md:360-364`)
- D2: *"The day a client tells me they filed a second design request because the app gave them nothing that recognized we
  were already working together."* (`2x-panel-d2.md:239-241`)
- D3: *"…no commission, no project link, and no way for me to even know it happened until something arrives broken."*
  (`2x-panel-d3.md:207-212`)

Both directions inherit SP-04 (the "SIGNED" mislabel, F02/F03), SP-07 (the duplicate-request funnel, F10/F24/F25/F73/F74/F111/F128/F175 —
one upstream cause: `DesignRequestStatusService.fetchLeadRows` filters on `client_request_id IS NOT NULL`) and SP-05 (F20, the portal
instruction rendered to the client). Those close D2's stated walk-away and half of D1's list **in both directions**, so neither is
credited for them; the scores below are what each direction adds on top.

---

## Scores

| Cell | A | B | One line of reasoning |
|---|---|---|---|
| **D1 · Leah — "what do my clients see of me, and does this help or compete?"** | **7** | **9** | **A** names her where the shipped contract already has room — the Companion hint reads `LEAH HARTWELL · YOUR DESIGNER` on quiet days too, the Next Move names her on what she raised, and Buy is pre-empted for any client with a live relationship (A §6) — but she lives inside a collapsed 120 pt orb, and at `discovering` A concedes "there is no such label, and D1's 'browsing beside me' habit has no home-screen anchor at all" (A §8.1). **B** gives her a permanent home block with portrait, studio and one line of what she is doing (B §6.1), makes her the *subject* of every row she wrote (*"Leah asked about the rug colour."*), and prices the data that makes that possible — only `InvoicesAPIClient.swift:194` embeds a designer today, so B adds one `designer:profiles!…` embed to Decisions/Proposals/Projects in W1 (B §6.2). A promises her name on those rows without naming that delta. F09, F79, F25. |
| **D2 · Priya — "cut my inbox in half or triple it?"** | **6** | **8** | The inbox that must shrink is *"where is my invoice / where is my sofa."* **A** admits its own biggest gap: on a quiet day Ruth's only route to the Studio is the monogram or the orb, "the single largest thing Direction B can beat A on" (A §8.1) — F126/F134 stand (the whole Studio behind a 36 pt unlabelled control in the hardest-reached corner). A does earn real credit for the one thing B does not think about: the Companion's suggested row is **state-driven** — `Message Leah` only when the queue is empty — because "a UI that promotes messaging by default on every visit is tuned to generate inbound mail — the opposite of D2's test" (A §6). **B** fixes reachability with or without its amendment: even if `house-first` never flips, W1 ships "a **labelled `Studio` control with a waiting count**" (B-1's fallback), and W4's **Ordered** screen (M8) answers "where is it" over *both* rails, which is D2's Tuesday. B's volume risk is real and I dock it: `Ask Leah to source this` is the **primary** act on every piece at engaged/activeProject, and `Message` sits on the home, the piece and the decision — mitigated, not removed, by `rpc_start_project_thread` being idempotent per project so entries land in one conversation rather than new inbox items (B §6.3). |
| **D3 · Tom — "who gets paid, who's responsible when it arrives damaged, does it show on my FF&E schedule?"** | **7** | **9** | **Paid:** both insert `designer_earnings` keyed on the `order_id` column reserved since `00014:307`, idempotent behind a partial unique index. **Responsible:** A backs the claim with `fulfillment_exceptions` (`00350:186-200`) and gates Buy on a non-null `returns_policy_key`; B goes further and makes it a **ship condition** — W4 ships Path A only with a config-driven responsibility paragraph on the sheet *and* on `Order placed.`, plus "one reachable human — an address or a number, not the word 'support'", routed to Patina support cc'd to the designer of record, with the claim posting into the project thread "because D3's lived experience is that the client calls their designer regardless of who is officially responsible" (B §5). **Schedule:** this is the cell. A declines — "The FF&E line is written in the designer portal — outside this lane, and A says so" (A §5), with no wave and no ledger row. B gives it **W7**, "a read-only list of attributed orders filterable by project", in the wave table and the delta ledger. **Notice:** A's only designer-facing item is a wave-2 *prerequisite* ("confirm the designer-facing notify covers sign / pay / decide / thread-opened"); B ships the notice on the day — a system message into the thread at settle: *"Ruth bought the Heirloom Oak Dining Table — $4,200.00, credited at the piece's trade rate."* F22 (=F26), F152, F19, F66, F90, F198, F202. |
| **Purchase path — compliant · attributable · trustworthy for a $4,000 piece** | **7** | **8** | **Compliance is a tie on substance and A wins on thoroughness**: identical rail (physical goods, external payment, hosted Stripe Checkout in `SFSafariViewController`, no IAP — C15/C25), and A alone names the design-fee invoice as a service under 3.1.3(d)/(e) and cites Sign in with Apple for 4.8. Both correctly flag SP-20's account deletion (5.1.1(v)) as release-gating and both gate the button on Kody's Stripe Tax ruling. **Attribution decides the cell.** A takes **"Zero new columns on `direct_orders`"** — the resolved designer rides the Checkout **session metadata** to settle (A §5, "Attribution, written once"). Between create and settle, Patina's own payable row does not know who is credited, and reconciling the earnings ledger means joining through Stripe — the inverse of this repo's standing rule that *internal payable-state tables are the source of truth: reconcile Stripe toward them, never the reverse* (CLAUDE.md). A's tie-break makes it concrete: two roster designers, same-day tie, "files the order uncredited rather than guessing" — an uncredited order is D1's stated exit. B snapshots `designer_id`, `project_id`, `commission_rate` **on `direct_orders` at create, immutable after `paid`** (B-5), which is the same three additive columns `00301_marketplace_vitals.sql:37-40` says are missing. **Trust:** A's sheet is better for Walt — freight folded into `amount_cents` and a printed `Total $4,550.00` that equals the session's `amount_total`, versus B's "Delivery and tax are added at payment", which leaves the $4,200 buyer walking into Safari without a total. A's `photo_verified_at` — a human signs off on the picture or the piece is not sellable — is the sharpest answer to F06 in either document. Against that, B is more careful where being wrong costs most: the fit line draws **only after SP-19's segmented unit control lands**, because today's 12×13 / 6×13 pt `ft / m` toggle silently persists its unit and two of three walks left with a 2,713 sq ft living room (F40 = F109) — A prints the same fit line off the same room data without naming the dependency; B handles ACH explicitly (`us_bank_account` is live on that session, F157) where A's poll-timeout copy does not; and B repoints the direct-order `success_url` off the client-portal page behind a web login (`create-checkout-session:554`), where A draws the extra Safari **Done** tap and defers. F12, F17, F144, F151, F153, F78/F83. |
| **Total** | **27 / 40** | **34 / 40** | |

---

## Verdict

**Direction B, 34 to 27.** It wins on the three things a designer actually tests: she is a seat on the screen and a name on
every row she wrote; the money is attributed on Patina's own payable row before it moves; and she learns about the order on
the day, on the rail she already uses, with a wave number against the FF&E join instead of a sentence declining it.

**What must ship first, in this order — attribution and the notice before the button.**

1. **B's W1 as written, with no amendment.** The record, the three `designer:profiles` embeds (she gets a name on decisions,
   proposals and projects), the four money/decision pushes each passing a `notification_log_id`, and — this is the part I
   would not let slip — **B-1's fallback: the monogram becomes a labelled `Studio` control with a waiting count**. That is
   the single highest-consensus designer complaint (F126, F134, F11) fixed in the first slice, whether or not Kody ever
   rules on the tab bar.
2. **SP-07's one-line filter, then B's designer seat (W3).** The seat renders from `DesignRequestStatusService.promotedRequest`;
   without the `client_request_id IS NOT NULL` fix it draws nothing. The seat depends on the plank; it does not replace it.
3. **B-5 before B-6.** The three attribution columns, the earnings credit keyed on `order_id` with its partial unique index,
   the settle→`fulfillment_intake` enqueue and the client-scoped SELECT policy over `fulfillment_orders` / `_items` /
   `_shipments` ship **before** any Buy control draws. D1 and D3 both named an unattributed buy-now as the end of the
   relationship; the order is not negotiable.
4. **Path A stays flagged off** until (a) Kody's Stripe Tax registration ruling, (b) the responsibility paragraph and one
   reachable human exist as real config, and (c) the designer settle notice is proven end to end. Paths B and C ship
   meanwhile — "asking a designer to source a piece is a complete answer to both questions" (B §5), and it is the answer
   D1 wants anyway.
5. **W7 keeps its ledger row.** The FF&E join is the sentence D3 opened with. It is the last thing to ship and the first
   thing he will ask about; if it falls out of the ledger, B loses the cell it won.

**Two open rulings this judge will not decide, and both directions correctly hand over:** R32's sequence (both build item #3
ahead of #1 and #2 — A calls it a reading with "Your call", B calls it a conscious reversal in B-6) and the tab bar (C1).
B's W1 is designed to be right either way; that is the reason its first slice survives a "no" from Kody.

**Where A is genuinely better and B is not, stated plainly, so the grafts below are read as required and not optional:**
A prints a total before Safari, A pays a designer who sent a client to browse without a lead, A refuses to promote messaging
by default, and A gates the picture on a human. Those four are the difference between B's 34 and a 38.

---

## Grafts — what B must take from A

1. **The roster-designer attribution case.** A credits a client on `designer_clients` (`00014:72-90`) who has *no* accepted lead and no project — "a client doing my sourcing for free" (D1), paid at `products.commission_rate` else `fulfillment_config.commission_rate_default` `{"rate":0.16}` (`00351:104`). B attributes only when a designer is engaged, so B's discovering-tier Buy is exactly the unattributed order D1 said ends it.
2. **A printed total on the order sheet.** Fold freight from `shipping_flat_cents` into `amount_cents` inside `create_direct_order` and print `Total $4,550.00`, equal to the session's `amount_total` — B's "Delivery and tax are added at payment" sends a $4,200 first-time buyer into Safari without a number.
3. **`products.photo_verified_at` as a column a human sets.** B's gate says "an image verified against the piece" without a mechanism; A makes verification a build-time non-null gate, which is the only real answer to F06 (a dining table shown with green velvet chairs, a planter shown as a mint plastic pot).
4. **The state-driven suggested row.** `Message Leah` surfaces when the waiting queue is *empty*, not on every visit — B's always-present Message rows are tuned against D2's stated test, and one idempotent thread does not by itself keep the volume down.
5. **A's compliance paragraph verbatim.** Name the design-fee invoice as a service billed externally under 3.1.3(d)/(e), and cite `SignInWithAppleButton.swift` for 4.8. B asserts compliance; A argues it, and the argument is what a reviewer reads.
6. **"Confirm the designer-facing notify covers sign / pay / decide / thread-opened" as a named prerequisite with an owner.** B ships the *order* notice but never audits whether sign / pay / decide already reach her — "a second silent inbox is D2's stated failure mode and it will not be discovered later" (A §6).
7. **A's relationship-scoped pre-emption as the default state of the `direct-orders` flag.** Buy does not draw for any client with a live designer relationship until B's settle notice is proven on a device — B's "Buy it myself" is the better end state, not the safer first state.
8. **A's refusal to draw a tracker that does not exist.** `Order placed.` says "Nordic Atelier starts it this week. We'll email you when it ships." rather than a four-step rail with no vendor acknowledgement behind it — B's M8 rail must not paint `Confirmed` on a `fulfillment_orders` row whose line states no one has moved.

---

## Failures / limits of this judgement

- Simulated panel; no designer was interviewed and no usage data was available to this review (§11).
- The purchase path is **unbuilt on iOS in both directions** — zero client code references `direct_order` at head — so every purchase claim here is a document read against migrations and edge functions (`research/12-backend-reality.md` §5, §12), not a walk.
- Apple Pay inside the Checkout (C25), the APNs round trip and universal links are **device claims** neither direction can prove; there is no installable TestFlight build (last expired 2026-08-10), and both directions say so.
- F57 (Studio rows invisible to VoiceOver) is a harness artifact and is not counted against either direction; F71/F95 (proposal line prices) is a server-side `client_visibility_tier` policy ruling, not a UI gap, and neither direction is charged for it.
