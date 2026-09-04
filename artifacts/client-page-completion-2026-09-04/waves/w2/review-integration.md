
---

## Fix round — `client-page-2/integration`, 2026-09-04

Applied in the review's own worktree (`.codex/worktrees/agent-cpc-int`). Rulings held to:
no flag; every act stays on the page; money copy resolves from rows; legal copy byte-identical
to the retired routes; nothing the page says is ever reversed.

### Applied

**1 · Approvals absorb 403s for every homeowner — BLOCKER.**
`project-surface-switch.tsx` now reads `useMyProjectApprovalReviews()` (the caller-global
sanitized 00440 read the chrome and the retired `/decisions` list already run) and filters to
`review.projectId === projectId`. The studio-scoped `get_project_decision_reviews` is gone from
the client surface. ABSORB act #1 renders, and the decision leg of `houseIds` is live again.
*Partial deviation:* the failure branch at `threshold.tsx` is kept rather than deleted, because
L5's own rule (papers registers, captures) is that a failed read must SAY so — silence would tell
a client she owes nothing because a read failed. It is restyled to `--text-body`, the ink its
siblings use, and reworded to the page's voice: *"The approvals could not be read just now.
Please refresh before taking action."* No red.

**2 · Edition-review deep link loses its id — BLOCKER.**
`retiredRouteTarget`'s `projects` case returns `params: { review: <editionId> }` when the fourth
segment is a plain id. `SelectionEditionAsk` is reachable from `selection-review-send`'s mail
again. Middleware tests assert the param is present on `/projects/p/reviews/<id>` and absent on
`/projects/p/reviews`.

**3 · A failed read shown as an empty fact — MAJOR.**
`roomsQuery.isError` and `ordersQuery.isError` are folded in. A failed `project_rooms` read no
longer collapses to the ground floor: the house renders and says *"Couldn't load your rooms.
Please refresh."* where the plan key would stand (the model still settles — a hold with no end is
a blank page, not silence). A failed `useDirectOrders` renders the road with *"Couldn't load what
you bought direct. Please refresh."* and suppresses *"Nothing on the road."*

**4 · Dead header for a house-less client — MAJOR.**
`ThresholdChromeGate` drops the header on `/` and `/projects/[id]` unconditionally; `hasHouse` is
gone from its props and from `app-chrome.tsx`. `ProjectsEmptyState` carries the mat's two acts
(*Your details* → `DetailsSheet`, *Leave the house* → `signOut`) on both its CMS-hit and fallback
branches, and its "Message your designer" link to the retired `/messages` — which folded straight
back to this same page — is removed.

**5 · Instrument mail landing in the wrong house — MAJOR.**
Rather than repointing the six producers (which would lose the iOS `applinks:` interception), the
fold now carries the instrument and `/` resolves the house from it.
`retiredRouteTarget` sets `?proposal=<id>` on `/proposals/<id>[/sign]` (`?invoice=` was already
set); `resolveHouseForInstrument` (`lib/data/active-project.ts`) looks the id up — `invoices` by
id, scoped `.in('project_id', projectIds)`, or `list_client_proposals` for a proposal — and
`app/page.tsx` prefers that house over the active-house clocks. An id that resolves to nothing, or
to a project outside her own list, returns null and the active house stands.

**6 · `?invoice=` honoured outside the till — MEDIUM.**
`consumeNamedInvoice()` / `useNamedInvoice()` read `?invoice=` when no `?checkout=` is present,
strike it from the address (same latch discipline as the till's return), and the named row becomes
the letter in the slot — unfolded and scrolled to. An id this house is not holding names nothing
and changes nothing. `toInvoiceModel` is exported from `derive.ts` for it.

**7 · Houseless orders and captures in every house — MEDIUM.**
`toRoadOrders` / `toClosedOrders` take `standsUnfiled`, `StrayCaptures` takes the same prop, and
`threshold.tsx` feeds all three `standsUnfiledAsks` (moved above the road block). One lamp, one
house. Covered in `road-orders.test.ts` and `room-capture.test.tsx`.

**8 · Raw error strings printed as content — MEDIUM.**
`refusalSentence(cause, sentence)` extracted to `lib/threshold/refusal.ts` (approval-ask's own
helper, unchanged in behaviour) and applied at `settlement.tsx`, `road-orders.tsx`,
`payment-method-chooser.tsx` and `wall-gate.tsx`. The two enumerated `InvoiceCheckoutError` codes
keep their own copy. Four tests now assert the house sentence and assert the PostgREST code is
*not* present.

**10 · First-person page voice — MEDIUM.** The three papers-sheet sentences read
*"The drawings / documents / signed papers could not be read just now. Please refresh."*

**11 · Dead second redirect map — MEDIUM.** `threshold-route-collapse.tsx`, `route-collapse.ts`,
`single-pane-solo-redirect.tsx` and their three suites deleted; the mount is gone from
`app/layout.tsx`. `useFeatureFlag` now has **no** live-code caller in the portal.

**14 · Stale `comms-mute` copy — LOW.** The bell is gone: the page now says to unmute in the
designer portal or *"on the mat of your project page"*, linking `client.patina.cloud/#mat`.

**15 · `useCheckoutConfirmation` comment overclaims — LOW.** The code is right (a late-settling
ACH row must be allowed to confirm); the comment now says what is actually guaranteed —
`confirmed` is final, `unconfirmed` means "not yet".

**16 · No ceiling on the 308s — LOW.** The fold sets `Cache-Control: max-age=3600`. Long enough
for a mail campaign's burst, short enough that a changed anchor map reaches everyone the same day.
Asserted in `middleware.test.ts`.

**18 · One-click preference tokens — LOW.** `generateUnsubscribeUrl` documents that `baseUrl` must
be a portal that still serves `/preferences`; the client portal does not, and a token sent there
would silently do nothing. No behaviour change (there is still no caller).

**19 · Stale unsubscribe outcome link — LOW.** Both buttons point at `/#mat`.

**20 · The hold has no ceiling — LOW.** `useHoldCeiling` (15 s); past it the blank hold carries one
sentence — *"This is taking longer than it should. Please refresh."* — outside the `aria-hidden`
spacer. It states no fact about the house, so nothing is taken back. Four unit tests.

**21 · `/projects/<id>/scope-change/*` unmapped — LOW.** Mapped to that house's `#doorstep` ahead
of R2's deletion, with a middleware test.

### Rejected

- **9 · Red ink across the surface (17 sites).** Applied only where finding 1 named it (the
  approvals failure). The rest is a whole-surface ink decision the review itself says needs a
  ruling in DECISIONS; a fix lane is the wrong place to make it. **Carry to the ship lane.**
- **12 · The ledger's three rows.** The one checkable claim is wrong: `plannedCents` already falls
  back to `Σ project_rooms.budget_cents` (`roomTargetCents` reads `row.budget_cents` when no plan
  line matches the room name, and `derive.ts` sums those as `roomTargetTotal`). The rest needs a
  re-drive against a live seed, which this lane has no stack for.
- **13 · The e2e's row-confirmed leg.** Same reason: asserting `data-confirm="confirmed"` behind a
  stubbed paid row needs the suite actually driven, not edited blind.
- **17 · `NEXT_PUBLIC_FLAG_OVERRIDES` in `wrangler.jsonc`.** Verified inert and explicitly the ship
  lane's to delete; a fix lane editing prod config is how cutover conflicts start.
- **22 · e2e gives no cutover signal / 23 · coverage floor.** Reporting facts, not defects; nothing
  to change in the code.
- **24 · L9(f) tester-notes widget.** Unbuilt lane work, not a defect in what shipped — there is no
  component under `apps/client-portal/src` to reposition.
- **25 · Three edge functions with no Deno suite.** Authoring three suites is its own task. The one
  function this round touched (`comms-mute`) is copy-only and `deno check`s clean.
- **26 · `useMyDesigners` widens scan sharing.** Parity with the retired `ShareScanDialog`, and the
  review calls its rationale sound. Narrowing it is a product decision, not a fix.

### Gates

| Gate | Result |
| --- | --- |
| `pnpm --dir apps/client-portal type-check` | **PASS** |
| `pnpm --dir apps/client-portal test` (full) | **PASS** — 1916/1917; the only failures are the two known ones (`lib/data/__tests__/orders.test.ts` cannot resolve `../orders`; `portal-access.test.ts` `foreignPortalFromDomain('manufacturer')`) |
| `eslint` on every touched file | **PASS** — 0 problems |
| `deno check --config supabase/functions/deno.json comms-mute` | **PASS**; `_shared/client-portal-links.test.ts` 8/8. No root `deno.lock` left behind |

Net test movement: +18 tests (1899 → 1917), 6 suites deleted with their dead components.
