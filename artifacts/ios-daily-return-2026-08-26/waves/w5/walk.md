# W5 — walk (the purchase wave, acceptance)

Walker, review device `973D1724-90BF-4A0A-B02D-481D561547B3` (iPhone 17 Pro, iOS 26.5), 2026-08-28.
Installed `.codex/worktrees/agent-dr-w5-integration/.build/dd/Build/Products/Debug-iphonesimulator/Patina.app`
via `xcrun simctl install` (unsandboxed). `-DeploymentTarget local` on every launch; flag-on runs add
`-PatinaFlags direct-orders`. Full evidence — every shot, every DB query, every exact copy string —
is in `research/01-shot-ledger.md` §"w5 walk"; this file is the PASS/FAIL/BLOCKED verdict per script
item.

**Stripe key re-checked before the walk** (read-only, length/prefix/tail only, per `steward.md` §2's
method): `STRIPE_SECRET_KEY` is still `sk_test_…alls`, 32 characters — the placeholder. Unchanged
from the steward's finding; no agent action can fix this, it needs Kody's real `sk_test_` key.
`direct_orders.tax_shipping_enabled` is `false` (00540's seeded default, untouched).

## Verdicts

| # | Item | Verdict | Note |
|---|---|---|---|
| 1 | `client@patina.dev` on a gated piece → `Ask Leah to source this` is primary, **no Buy exists**; send → lands in a project thread (`comms_messages`) | **PASS** | Message + piece + price all correct in the thread. The thread lands on `Birch Hollow`, not `Aspen Loft Refresh` — see "Carried forward" below; this is a pre-existing ambiguity (`activeProject(in:)`'s `.first` over 3 simultaneously-active projects), not a W5 regression, and not scored a FAIL because the acceptance script only asks "does it land in *a* project thread", which it does. |
| 2 | `james.okafor@example.com` (engaged, no project) → same, into his lead's thread | **FAIL** (as first attempted) / feature itself proven correct on retry | First attempt, immediately after an in-process Settings → Sign Out from `client@patina.dev`: the send silently failed (`We couldn't send that. Your designer hasn't seen it yet.`), no thread/message written. Root cause: `DesignerThreadOpener` reads process-lifetime singletons (`BadgeCountService.shared.projects`) that were not refreshed after the account switch, so it resolved James against **client@patina.dev's stale project id** — the server correctly refused the cross-tenant `rpc_start_project_thread` call (Postgres log: `caller is not part of project …`), so nothing leaked, but the user-facing send failed. A full `terminate`+`launch` (no sign-out/in) then reproduced item 2 exactly as specified: message landed in James's own direct thread. See "Carried forward". |
| 3 | guest → Buy → auth sheet, no `direct_orders` row written | **PASS** | `Sign in to order` sheet with Cancel; `direct_orders` count 0 before and after. |
| 4 | homeowner with no designer → Buy → order sheet shows size/lead time/maker/total/responsibility paragraph/honest tax line → tap Buy | **PASS (content) / BLOCKED (checkout)** | No seeded account in this DB currently has `DesignerRelationship.isLive == false` — every homeowner resolves live via a non-terminal lead with `designer_id` set (`steward.md`'s "alternates" all carry a claimed lead). Signed up a fresh account (`w5walk-discovering@patina.test`, plain email/password sign-up through the app's own UI, not a DB write) to get a true no-designer client. Order sheet content is fully correct and honest (see ledger). **`Continue to payment` is disabled** with the reason `Delivery and tax are not included yet, so we can't take payment for this piece yet.` — `tax_shipping_enabled = false` gates checkout by design (critique M14, confirmed in `c1-tasks.md:73`), independently of the Stripe key. Tapped anyway: no-op, no request fired, `direct_orders` stayed 0. **The Stripe-key/test-Checkout/4242-card/webhook/psql-proof chain in the script cannot be reached at all on this stack** — not because of the placeholder key specifically, but because the checkout button is disabled before any Stripe call would happen. This is the environment-block the build plan itself named ("W5 walk gated on a real test key") plus one more precondition (`tax_shipping_enabled`) that is also Kody's ruling, not engineering's. |
| 5 | Ordered shows the seeded shipped fulfillment order with carrier/tracking | **PASS (with a correct, deliberate omission)** | List row: `Meadow Linen Sectional` · Shipped Aug 24 · arriving Sep 3 · "Leah ordered this for you." Detail: rail at Shipped, `Message Leah` / `See the piece` / `Report a problem`. **No `Track with the carrier` row** — verified correct: seed carrier is `Pilot Freight` (white-glove/LTL), not in `CarrierTracking.templates`'s parcel-carrier map, so the row is honestly withheld rather than guessing a URL (`CarrierTracking.swift`'s own doc comment). |
| 6 | flip a line stage to delivered in local Postgres, relaunch → the record shows the MOVED row with the real date | **PASS** | After the flip + fresh relaunch, Today's MOVED row reads `Meadow Linen Sectional arrived. Ordered by Leah. Aug 28.` — today's real date. Bonus verification: attempting to revert the flip was **refused** by `enforce_fulfillment_line_transition()` (`illegal transition delivered -> shipped`) — the state machine is a real server-side guard, not cosmetic. Left at `delivered`; next `supabase db reset` restores seed state. |
| 7 | flag off → no Buy anywhere, Ask/Ask-about unchanged | **PASS** | `client@patina.dev` on the gated piece: still `Ask Leah to source this` / `Add to room`, no Buy (R3 is not flag-gated). Guest on the same piece: `Ask about this piece`, no Buy. |

**ok = no FAIL** per the role brief's own rule (BLOCKED is not FAIL) — but item 2 genuinely FAILed
on its first, most-representative attempt (a real account switch, which is exactly what a walker or
any real second user does), so this walk's honest top-line is: **6 PASS, 1 BLOCKED (items 4's money
chain), 1 FAIL (item 2's first attempt; the underlying send mechanism is otherwise correct).**

## Carried forward — for Fable, not decided here

1. **Cross-account cache staleness in `DesignerThreadOpener` (new finding, this walk).**
   `BadgeCountService.shared.projects` / `DesignRequestStatusService.shared.liveLead` are
   process-lifetime `@Observable` singletons. Signing out of one account and into another **inside
   the same running app process**, without a full relaunch, leaves them holding the *previous*
   account's data until whatever background refresh eventually runs. `DesignerThreadOpener.currentRelationship`
   reads both directly with no staleness guard, so a client who has just switched accounts can have
   the "Ask your designer" flow silently misfire against the wrong project. The server's own
   authorization (`rpc_start_project_thread`'s membership check) caught it here and refused the
   write — no cross-tenant data was actually created — but the send fails with a generic-sounding
   error and no thread is created for a real request the user made. This is not new W5 code causing
   the staleness (the singletons predate W5), but W5's `DesignerThreadOpener` is the first place that
   exercises them against a write RPC with a real authorization check behind it, so it is the first
   place the staleness becomes user-visible as a failure rather than a stale display. Likely fix
   shape: reset/invalidate `BadgeCountService` and `DesignRequestStatusService` on sign-out (or key
   them by user id and refuse stale reads), not something this walk should decide.
2. **`client@patina.dev`'s "Ask Leah" lands on `Birch Hollow`, not `Aspen Loft Refresh`.** This
   client has three simultaneously-`active` projects with the same designer, and
   `DesignerRelationshipResolver.activeProject(in:)` is `projects.first { … }` with no tie-break
   rule for "more than one active project, same designer" — the plan only names a tie-break for the
   *roster* case (`mostRecent`, same-day → none). Confirmed via the ledger that `w5-c1`'s own lane
   walk hit the identical `…-d3` target independently, so this is a stable, reproducible artifact of
   row order (not request-to-request nondeterminism) but still an unspecified case in the resolver's
   contract. Whether this seed shape (3 active projects, 1 designer, no tie-break) is realistic
   enough to need a rule is a product call, not this walk's to make.
3. **The full purchase/Checkout/webhook/psql chain remains unreachable on local**, now for two
   independent reasons: the placeholder `STRIPE_SECRET_KEY` (steward-named) and
   `tax_shipping_enabled = false` (also steward-named, and the one that actually blocks the tap
   before Stripe is ever called). Both are Kody rulings, not engineering gaps — the responsibility
   paragraph is already real, production-quality copy (`fulfillment_config`, verified, not
   placeholder text), so the tax/shipping ruling is the one remaining lever.
4. **No seeded account in this local DB has `DesignerRelationship.isLive == false`.** All 7 seeded
   homeowners carry a non-terminal lead with `designer_id` set. `steward.md`/`02-steward-boot.md`
   §6's "alternates" list (`marcus.wright`, `elena.ruiz`, `sarah.chen`, `lily.tanaka`,
   `david.nielsen`) does **not** solve this — their lead `status` varies (`new`/`viewed`/`contacted`)
   but every one of them is `designer_id`-set and non-terminal, so every one of them is `isLive =
   true` exactly like `james.okafor`. A future wave's D lane may want to seed one true
   no-designer homeowner directly (or note the gap the way `direct-orders-dev.sql` already notes
   the photo-verification one), so the next walker does not have to sign up a throwaway account
   again.

## Data written by this walk, disclosed rather than cleaned

- `auth.users` + `profiles`: one new row, `w5walk-discovering@patina.test`, role `homeowner`, created
  through the app's own sign-up UI (not a direct DB write); verified server-side to carry no leads,
  projects, or roster rows.
- `comms_threads` / `comms_messages`: two new threads, two new messages — `client@patina.dev` →
  `Birch Hollow` project thread; `james.okafor@example.com` → a new direct thread with his designer.
  Both carry the real piece name and price, sent by the account that appears to have sent them.
- `fulfillment_order_items` id `f5000000-0000-4000-8000-000000000002`: `line_state` advanced
  `shipped → delivered` (the walk script's own item 6); `fulfillment_shipments` id
  `f5000000-0000-4000-8000-000000000005.delivered_at` set to the flip time. **Attempting to revert
  this was refused by the database's own transition guard** (`enforce_fulfillment_line_transition()`)
  — left at `delivered`; the next `supabase db reset` restores it.
- `direct_orders`: **zero rows created, start to finish.** Every path that could reach
  `create_direct_order` either hit the guest auth wall first (item 3) or reached a `Continue to
  payment` disabled by `tax_shipping_enabled = false` before any RPC fired (item 4).
- No secret value was read, printed, or written anywhere; the Stripe key check used only
  length/prefix/tail, per `steward.md`'s own method.

## Leave state

Signed in as `client@patina.dev`, flag off, on the Daily Room, light appearance, default text size —
`shots/w5-17-leavestate-flagoff-client-daily-room.png`.

## Worktrees / simulators — untouched by this walker

Per role: walker makes no git writes and does not retire worktrees or simulator clones (steward's
job, or the orchestrator's, per `integration.md` §7). Everything the steward listed as "still
standing" at hand-off (`agent-dr-w5-{d,a11y,c1,c2,integration}`, `dr-w5-{a11y,c1,c2,int}`) is
untouched by this walk. The review device `973D1724-…` itself only had the app
uninstalled/reinstalled once, mid-walk, to force a clean signed-out state (see ledger, `w5-08`
onward) — the app is back on it, correctly signed in, per the leave state above.
