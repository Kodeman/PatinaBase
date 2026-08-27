# Synthesis — the review lead's verdict (2026-08-26)

Written by the orchestrating reviewer after reading both v2 directions, the eight critiques and the
three judges. This is what the deck's recommendation section presents, attributed to the review
lead — not to a judge, and not to a seat.

## 1. What the judges said, and where they split

| Judge | A | B | Winner | The one sentence |
|---|---|---|---|---|
| J1 · Homeowner return | 30 | 32 | B | A is better at not lying (draw-only-when-something-moved wins Walt); B is better at not hiding (Maya's browse door, Ruth's rooms, Ordered over both rails). |
| J2 · Purchase + designer trust | 27 | 34 | B | B seats the designer on every row she wrote and snapshots attribution before money moves. |
| J3 · Feasibility | 35 | 30 | A | A's budgeted 10-day slice, zero new columns on `direct_orders`, the completest Apple reading, and the only rollback section that names what cannot be rolled back. |

Two judges prefer B's destination; the feasibility judge prefers A's first move. Read together they
are not in conflict: **B is the better place to end up, A is the safer way to start, and their first
slices share most of their plumbing.**

## 2. What the two directions actually share

Both directions, in their first slice, build the same six things:

1. **"What moved while you were away"** on the first screen, drawn from rows the home already fetches
   (`BadgeCountService`, the studio queue, `leads`, `project_phases`), with one stored last-seen.
2. **The designer visible** on Today — name, studio, one line of what she is doing — gated on SP-07
   (the one-line `client_request_id` filter fix that makes portal-created leads promote the tier).
3. **A labelled Studio door** with a waiting count where the unlabelled monogram sits today (B's own
   tab-bar fallback; free under C1).
4. **Push on money** — `apns-send` call sites on proposal-sent, invoice-due and decision-asked, each
   carrying a `notification_log_id`; the decision path needs an `AFTER INSERT` trigger in the 00289
   shape because `00092` is a cron, not a write path.
5. **The unread dot earned** from a stored read, not hard-coded `true`.
6. **Direct orders settle onto the existing fulfillment rail** (`fulfillment-intake` → `fulfillment_orders`),
   with `designer_id / project_id / commission_rate` snapshotted on `direct_orders` at create — three
   additive columns, no second order table, no second notification path.

Plus the twenty shared planks — of which SP-01 (the product-detail trap), SP-02 (the browse grid),
SP-03 (the share link that hands over the designer portal), SP-04 (SIGNED on an accepted proposal;
the sign sheet restating the amount) and SP-07 are not direction choices at all. They are repairs,
and they are the first thing to ship.

## 3. Where they differ, and what each difference costs

| Difference | Direction A | Direction B | Canon touched |
|---|---|---|---|
| The home | Option B's Today stands; one `WHAT MOVED` line that draws only when something moved; the Next Move carries the dated queue | A Record card at every tier — two eyebrows, NEEDS YOU / MOVED, rolling 7 days — replaces the single Next Move; a house rail below it | C23 (B-3), C2/C3 (B-4) |
| Navigation | No tab bar; Studio via the labelled control, the Next Move and the Companion | A hand-rolled four-tab bar (Today · Spaces · Pieces · Studio) with the Companion in its trailing slot; 105 `navigate(to:)` sites, dual roots for a release | C1 (B-1), C8 (B-2) |
| Buy with a designer engaged | Never draws — "Ask Leah to source this" pre-empts Buy for any client with a live designer relationship | "Ask Leah to source this" primary; "Buy it myself" secondary, credited to Leah with a disclosure line | C24 (B-5), C11 (B-6) |
| Guest and discovering mornings | No daily reward staged; an honest weekly one (an unread story, a real dot); A's day begins at sign-in | The Record mounts at every tier (a saved piece repriced or withdrawn, the story, NEW THIS WEEK at a ≥3 floor); a weekly promise, not a daily one | — |
| First slice | 10 iOS days + an edge/SQL lane; no amendments | W1 = the Record + snapshot store + designer embeds + Studio control + push; no amendment needed for W1 itself | — |

## 4. The verdict

**Build A's first slice as B's W1, and put the three real differences to Kody with the slice in
hand.** Concretely:

- **Now (no ruling needed):** the repair planks SP-01…SP-09, SP-18, SP-20; then the six shared items
  in §2 rendered A's way (within Option B's contract) — the `WHAT MOVED` line, the dated Next Move,
  the designer in the Companion's header and hint, the labelled Studio control, push on money, the
  earned dot; the attribution columns on `direct_orders`. Gate: `ios-gate.sh all`, a Simulator pass
  at Dynamic Type XXL and dark on Today, Studio, the Companion panel, invoice/proposal/decision
  detail, and a device push probe before the permission moment ships.
- **Ruling 1 — the home (C23 vs B-3/B-4).** With the slice on a phone, decide whether Today becomes
  B's Record card and house rail. B's card is an additive mount ("removing it restores Option B's
  Today exactly"), so it can ship behind a fail-closed `house-first` flag evaluated once at launch.
  Recommendation: yes, after the slice — it is what the homeowner and designer judges paid for.
- **Ruling 2 — the tab bar (C1, B-1/B-2).** The most expensive and riskiest item in either direction,
  and the one R29 deferred "post-Track-D". Recommendation: do not decide it from a deck. Ship the
  labelled Studio control (B's fallback) in the slice, walk it, then rule — if yes, B-1/B-2 behind the
  same flag, both roots kept for one release.
- **Ruling 3 — Buy when a designer is engaged, and the R32 sequence.** Both directions agree on
  attribution now (free) and on gating Buy behind buyability, a responsibility paragraph with a
  reachable human, and a Stripe Tax / shipping ruling. Recommendation: A's pre-emption as the default
  (no Buy for a client with a live designer) until the designer-side settle notice is device-proven,
  then B's "Buy it myself" with its disclosure. Building direct orders ahead of R32's reviews and
  scope-change items is a conscious reversal — both directions name it; Kody rules it.

## 5. Grafts the winner must take, whichever way the rulings go

From J1/J2/J3, deduplicated:
- Draw nothing when nothing moved — no "Nothing moved since Thursday" at guest/discovering (A → B).
- The empty-queue Next Move names the project phase from `current_phase` already on the wire (A → B).
- Card weight follows content; six-hour suppression on re-opens (A → B).
- `products.photo_verified_at` as a human sign-off in the buyability gate (A → B).
- Credit the roster designer (`designer_clients`) at `products.commission_rate`, else `fulfillment_config` 0.16; a tie files uncredited (A → B).
- Print the session's real total on the order sheet; fold flat shipping into `amount_cents`; never send a buyer into Safari with no number (A → B).
- State-driven "Message Leah" — suggested only when nothing is waiting (D2's inbox test) (A → B).
- No painted "Confirmed" on a fulfillment row no vendor has acknowledged — "We'll email you when it ships." (A → B).
- Label the monogram `Studio` with its waiting count (B → A, free under C1).
- The config-driven responsibility paragraph + one reachable human, printed on the order sheet and on Order placed (B → A).
- `BadgeCountService` retains its rows; `StudioQueueBuilder` emits per-item rows — both are slice files (B → A).
- Widen `payment_intent_data.metadata`, not the Checkout session's; pass `notification_log_id` on every push (J3).

## 6. What this review could not settle

- No usage data (PostHog OAuth needed a person) and no prod counts (no read path without a secret) —
  every return claim here is reasoned from the product, not measured.
- No device: Apple Pay inside the hosted Checkout, push delivery end-to-end, LiDAR/AR paths.
- The local stack was booted from a deleted worktree and every edge function 503s locally — the
  Companion's server-backed replies and the Checkout hand-off were never seen; restart the stack from
  main before the next walk.
- Live vs test Stripe keys on Strata.
- Whether `client_visibility_tier` defaulting to `milestone` — which strips line prices from every
  proposal a client is asked to sign — is policy or accident.
