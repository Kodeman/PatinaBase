# Rulings: studio buying review (2026-10-05)

Kody ruled these on 2026-10-05, interviewed with multiple-choice options after the deck was published. The questions as asked are in `synthesis/direction.md` §9.

## New from this review

| ID | Ruling |
|---|---|
| **R-PB1** | **Warn only.** On a job with no agreement behind it, ordering goes through without the client's yes. The Order Assistant states the consequence plainly. |
| **R-PB2** | **Offer an in-studio release gate, off by default, per order.** When a studio turns it on, a junior's PO waits as "Held for release" until an owner or admin releases it. |
| **R-PB3** | **Refuse to send with no ship-to.** The PDF preview still renders. (This lets C-02 ship refuse-send in Phase 0.) |
| **R-PB4** | **A studio card over a shared maker record.** Resolve an existing global `vendors` row by website, then by name, before creating one. The studio's terms, account number and contacts live on its private card. |
| **R-PB5** | **Allow "read by next act"** as a reading inside the Document's Project section, beside "by room" and "by maker". No separate page and no new nav zone. |
| **R-PB6** | **The studio seat (owner/admin, System B) gates margin and release.** Fix provisioning of the old `studio_owner` role (System A) so it is granted or retired. |
| **R-PB7** | **Store buys, finds, freight/riders and reimbursables bill at cost** by default, each on its own invoice line. The studio can override per line. |
| **R-PB8** | **No vendor write-in in v1.** Vendors reply as today, and the studio enters or confirms quotes and acks. |
| **R-PB9** | **Claim-window defaults:** 72 hours for the vendor and 5 days for concealed carrier damage when a vendor account sets none. Each vendor account can set its own. |

## Older rulings that gate Phase 2

| ID | Ruling |
|---|---|
| **V1 · margin pocket** | **Carved from the maker's trade discount** ("carved, not stacked", v4 ~18%). The studio's markup is untouched; the maker pays. Recorded in `docs/vision/VISION-DECISIONS.md`. |
| **R1 · who sees margin** | **Everyone in the studio, by default; owners can restrict it.** This is a studio setting. |
| **R5 · client price below trade** | **Allowed.** Show the negative markup plainly and warn at the floor. Activation stops silently clamping it. |
| **R8 · post-sale edits** | A line is **editable until it is on a sent authorization. After that, void the authorization to edit. Once signed, any change is a change order** the client re-approves. |

## Still open

- **R6:** price-age thresholds (Leah).
- **R7:** the client and dates (Leah, with counsel).
- **R9:** the floor posture (Leah). The plan keeps "warn, never block" as a draft.
- **R2, R3, R4, R10, R11:** the pricing-mechanics items this review did not touch.
- **R-DI4 / R-DI5:** trade on imported lines, and margin on off-marketplace pieces. V1 rules the maker lane only; R-DI5 stays open.
- **The V10 extension** and the **Agent OS studio review of agent drafts.**

## What the rulings change in the plan

- **Phase 0:** C-02 refuses to send with no ship-to (R-PB3).
- **Phase 1 and 2 items unblocked:**
  - C-12 trade discount (R1)
  - C-16 client price on the line card (R1, R5)
  - C-21 price-bearing changes (R8)
  - C-25 and C-26 billing at cost (R-PB7)
  - C-30 substitutes (R5, R8)
  - C-32 held for release (R-PB2, R-PB6)
  - C-33 next act (R-PB5)
  - C-20 claim clock defaults (R-PB9)
  - the maker lane beside studio lanes (V1)
- **R1's default flips today's behavior.** Margin is owner-only today; the new default is visible to everyone, with owners able to restrict. That is a visible change for existing studios and should be told to them before it ships.
