# Wave 3 · lane `sub` — adversarial review, round 1

Reviewer context: separate from the implementer. Branch `agreement/w3-sub`, worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w3-sub`, base `112e6f838` + the
cherry-picked T0 types commit.

```
$ git -C .../agent-agr-w3-sub rev-parse --show-toplevel
/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w3-sub

$ git log --oneline main..HEAD
3168756b1 docs(agreements): W3 sub lane notes
1454cf602 test(client): the trade agreement guest link, end to end
25ecd421a feat(client): register /trade as the seventh bearer-token guest prefix
c63b1cd1a feat(client): the sub's Trade Agreement token page
1bc317855 feat(types): agreement parts vocabulary and payloads (T0)

15 files changed, 1675 insertions(+), 8 deletions(-)
```

**Verdict: fix.** Two blockers, three majors, four minors. Nothing in the lane's own product
code is architecturally wrong — the `/rfq/[token]` posture is copied faithfully and the R13
absences are enforced by type *and* by test at both levels. The blockers are (a) a bearer
credential that reaches PostHog unredacted because the fourth registration site for a guest
prefix was missed, and (b) the lane's named type gate is red on this branch.

---

## Gates, run by the reviewer

| Command | Result |
|---|---|
| `pnpm --filter @patina/client-portal type-check` | **FAIL, exit 1** — 2 errors (both in `client`-lane files; see S2) |
| `pnpm --filter @patina/client-portal test` | **PASS** — 132 suites, 2130 tests, 1 snapshot |
| `pnpm --filter @patina/client-portal test:coverage` | **PASS** — global 74.72 / 70.23 / 74.76 / 77.02 vs the 70/60/70/70 floor; `src/app/trade/[token]` itself 95.65 / 94.87 / 100 / 99 |
| `git status --porcelain -- apps packages supabase artifacts` | clean |

Verbatim type-check output:

```
src/components/commercial-document-shell.tsx(26,7): error TS2741: Property 'design_build' is
  missing in type '{ design_services: string; service_addendum: string;
  furnishings_authorization: string; trade_scope: string; }' but required in type
  Record<"design_services" | "furnishings_authorization" | "service_addendum" |
  "design_build" | "trade_scope", string>
src/components/threshold/door-gate.tsx(266,7): error TS2322: Type '... | "design_build" | ...'
  is not assignable to type 'MakingGateKind'.
```

Not run: the e2e (`tests/trade-agreement-link.spec.ts`) — its fixtures need migration 2's
objects, which the `backend` lane has not written yet (its branch carries only T0 + notes).
`pnpm --filter @patina/client-portal lint` not run (per `patina-verification`, this portal's
ESLint config does not resolve under ESLint 9 and a result would be meaningless).

---

## Build-sheet §2.5 item trace

| Item | Delivered | Note |
|---|---|---|
| `app/trade/[token]/page.tsx` | yes | `force-dynamic`, `robots {index:false, follow:false}`, `referrer:'no-referrer'`, format gate before the DB, one `resolve_trade_agreement_link` through `createServiceClient()`, `notFound()` on any null — all matching `rfq/[token]/page.tsx:39-47` |
| `.../actions.ts` | yes | `'use server'`, calls `sign_trade_agreement_by_token` directly with no pre-resolve (the `rfq/[token]/actions.ts:5-18` rationale) |
| `.../types.ts` | yes | own `/^[0-9a-f]{64}$/` literal, not an import from `rfq/[token]/types.ts`; DTO matches §4.5's 13 frozen keys exactly |
| `.../trade-agreement-signature.tsx` | yes | typed name (`SignatureLine`, carrying `SIGNATURE_NOTICE`) + press-and-hold (`HoldAction`) |
| `.../__tests__/{page,actions,trade-agreement-signature}.test.tsx` | yes | 44 cases |
| `middleware.ts` (three places) | yes | prefix const `:118`, header block `:167-176`, `isPublicPage` `:191` |
| `app-chrome.tsx` `PUBLIC_PREFIXES` | yes | `:16` |
| `tests/trade-agreement-link.spec.ts` | yes | fresh `BrowserContext`, `expect.poll` for the DB read, no `waitForTimeout` |
| bid ledger never rendered (R13) | yes | pinned in `page.test.tsx` and in the signature component's own defensive-props case |
| jest + coverage floor | yes | see gates |

The T0 types commit `1bc317855` is byte-identical (patch-id `7cc8b055…`) to the same commit on
all four sibling lane branches — the sanctioned handshake, not a scope leak.

---

## Findings

### S1 · BLOCKER (confidence 0.95) — the sub's signing token reaches PostHog unredacted
`apps/client-portal/src/lib/analytics/posthog.ts:94`

Registering a new bearer prefix in this portal has **four** sites, not the three §2.5 names.
The fourth is the analytics redaction law:

```ts
const HEX_BEARER_IN_URL =
  /\/(share|rfq|evidence|plans|pay)\/(?:return\/)?[0-9a-f]{64}(?![0-9a-f])/gi;
```

`trade` is absent. Proven:

```
$ node -e "<the two regexes verbatim, applied to https://client.patina.cloud/<p>/<64 a's>>"
rfq   -> https://client.patina.cloud/rfq/[redacted]
pay   -> https://client.patina.cloud/pay/[redacted]
trade -> https://client.patina.cloud/trade/aaaa…aaaa      # 64 hex, verbatim
```

That string leaves the browser. `src/app/providers.tsx:34` mounts `PostHogAnalyticsProvider`
around **every** route, public ones included; `PostHogProvider.tsx:14-18` fires
`posthog.capture('$pageview', { $current_url: pathname })` on every path change; `posthog.ts:180`
sets `before_send: sanitizePostHogEvent` as the only scrub, and `autocapture` is left at its
default (on), so every click on the page carries `$current_url` too. This page is also the
**first guest surface in the portal to mount `HoldAction`**, which fires
`client_making_action_shown` and `client_making_action_selected` — so the leak is not
hypothetical traffic, it is traffic this lane added.

What leaks is a *live signing credential*: until the sub signs, anyone holding that URL can sign
the Trade Agreement as them. This is precisely the argument `posthog.ts:84-87` already makes for
`/pay` ("a standing payment capability sitting in an analytics store").

`src/lib/analytics/__tests__/posthog-privacy.test.ts` enumerates one case per prefix
(`shareToken`, `rfqToken`, `evidenceToken`, `plansToken`, `payToken`) — the omission is
untested, which is why nothing caught it.

**Fix**: add `trade` to the alternation and a seventh case to `posthog-privacy.test.ts`. Both
files are outside every lane's declared pathspecs; the orchestrator should assign it here (the
sub lane owns the prefix registration) rather than leave it to integration.

### S2 · BLOCKER (confidence 1.0) — the lane's named type gate is red on this branch
`pnpm --filter @patina/client-portal type-check` → exit 1, two errors, output pasted above.

**Neither error is in a file this lane touched.** Both are in `client`-lane pathspecs (§2.4:
`commercial-document-shell.tsx`, `threshold/door-gate.tsx`) and both are caused by the shared T0
commit appending `'design_build'` to `COMMERCIAL_DOCUMENT_KINDS`. Confirmed by running the same
gate on the `backend` worktree (main + T0 + docs only), where the same two errors appear. Zero
errors sit in `src/app/trade/**`, `middleware.ts` or `app-chrome.tsx`.

Recorded as a blocker because the gate the brief names is red and no lane may merge on it; the
*work* is the client lane's, not a re-do here. The integration steward must confirm it goes green
once the client lane's branch lands, before merging either.

### S3 · MAJOR (confidence 0.65) — `revalidatePath` after a successful signature can replace the receipt with the 404 page
`apps/client-portal/src/app/trade/[token]/actions.ts:81`

The action copies `rfq/[token]/actions.ts:63`'s `revalidatePath(...)`. That copy is safe there
because an RFQ token stays live after a submit. It is **not** safe here: §3.2 requires
`sign_trade_agreement_by_token` to "revoke the token in the same transaction" as the signature,
and `resolve_trade_agreement_link` "returns NULL on every miss — bad hash, **revoked**, …".

A Server Action that revalidates returns a re-rendered RSC payload for the current route and the
router applies it. On that re-render `page.tsx:104` gets `dto === null` and calls `notFound()` —
so the sub, one beat after their hold completes, may watch their receipt be replaced by "Page not
found". The lane's own e2e would catch this (`expect(page.getByTestId('trade-agreement-receipt'))`
then `expect(page.getByText('Signed.'))` after `mouse.up()`), but the e2e has never been run.

Two conditions gate this: Next's post-action refresh semantics, and the backend actually revoking
in-transaction. Both are the specified behaviour.

**Fix**: drop the `revalidatePath` call — the component already renders the receipt from its own
state and the route is `force-dynamic`, so the call buys nothing here even in the benign case.

### S4 · MAJOR (confidence 0.85) — the "settled receipt on reload" the sheet promises cannot happen, and `state:'signed'` / `existingSignature` are dead by construction
`build-sheet.md` §4.5 vs §3.2 vs §8 step 16.

The sheet contradicts itself and the lane resolved it silently in one direction:

- §4.5's DTO types `"state": "sent" | "signed"` and `existingSignature | null`, and its page
  structure says *"already signed → the settled receipt: name, date, and nothing to press"*.
- §3.2 says the sign RPC revokes the token in the same transaction, and that `resolve` returns
  NULL for a revoked token.
- §8 step 16 requires: *"reloading shows the settled receipt, not a second form; the link is now
  spent (**a fresh load of the same URL still shows the receipt**, and a revoked-token URL 404s)."*

Under the implemented reading, a signed agreement's token is always revoked, so `resolve` always
answers NULL, so `page.tsx` always 404s: `state === 'signed'` and `existingSignature` are
unreachable, the component's `existingSignature` branch (`trade-agreement-signature.tsx:66`) is
reachable only from mocks, and `already_signed` can never fire either (a replay hits a revoked
token, which classifies as `invalid_link`, not `already_signed`). Walk step 16 fails as written,
and the sub who reopens their own signed link is told "Page not found" — which reads as if the
signature vanished.

The lane documented its reading (`page.tsx:8-20`, notes) and pinned it in the e2e ("A revoked
link resolves to nothing at all"), so this is a knowing choice, not an oversight — but it needed
escalating, not deciding in-lane. **Needs an orchestrator ruling**: either `resolve` keeps
answering for a `signed` agreement through its spent token (read-only, receipt view — which is
what makes §4.5's `state`/`existingSignature` keys mean anything), or §4.5's two keys and §8's
step-16 sentence are struck.

### S5 · MAJOR (confidence 0.80) — the sign RPC's return contract is invented, not frozen; a shape mismatch turns a *successful* signature into "This link is no longer active."
`apps/client-portal/src/app/trade/[token]/actions.ts:74-79`

§2.6 freezes I-4 (`resolve_trade_agreement_link`'s DTO) but freezes nothing for
`sign_trade_agreement_by_token`; §3.2 names only the classifications
(`invalid_link` / `already_signed` / `agreement_void`) and never a success key. The lane invented
`{ status: 'signed' | 'already_signed' | 'agreement_void' | 'invalid_link', signedName, signedAt }`
and pinned it in `actions.test.ts` — against itself, not against a backend that exists (the
`backend` branch is still T0-only).

The failure mode is the bad one. If the backend answers `{ ok: true, … }` or `{ outcome: 'signed' }`
or snake_case `signed_name`, then:

```ts
if (outcome !== 'signed' && outcome !== 'already_signed') return { status: 'invalid' };
```

…returns `invalid`, and the component prints **"This link is no longer active."** to a sub whose
signature *did* commit. Note the lane's own defensive habit is inconsistent here: it accepts both
error-message and data channels for classification, and accepts a single-row array, but does not
accept a snake_case or `ok`-shaped success (contrast `rfq/[token]/actions.ts:66-77`, which reads
both `amountCents` and `amount_cents`).

**Fix**: the orchestrator publishes the I-3-style one-page freeze for this RPC before integration,
and either the action or the migration moves to it. Cheap hardening in the meantime: treat any
answer that is not a recognised failure classification as success-with-unknown-receipt (reload the
page) rather than as `invalid`.

### S6 · MINOR (confidence 1.0) — the gate the brief names does not enforce the coverage floor
`apps/client-portal/package.json:13` — `"test": "jest"`, with no `--coverage`. The floor lives in
`jest.config.js:71-78` and is only applied by `test:coverage` (`jest --coverage`). The lane brief
and §6's "Client + sub" block both say `pnpm --filter @patina/client-portal test # coverage floor
70/60/70/70 is enforced` — it is not. I ran `test:coverage` explicitly; it passes (74.72 / 70.23 /
74.76 / 77.02). The integration gate list should name `test:coverage`.

### S7 · MINOR (confidence 0.9) — two receipt-date assertions are timezone-fragile
`__tests__/trade-agreement-signature.test.tsx` asserts `/Dana Hall · 7 September 2026/` for
`signedAt: '2026-09-07T15:04:00Z'` and `/6 September 2026/` for `'2026-09-06T11:00:00Z'`.
`formatLongDate` correctly treats a full timestamp as an instant and formats it in the runner's
local zone; there is no `TZ` pin in `jest.config.js`, `jest.setup.js` or the package scripts
(grepped). At UTC+9 or later the first assertion reads 8 September and fails. The same class of
defect is already on the main backlog for `threshold.spec.ts:158`. The *calendar-date* path
(`startOn`) is TZ-safe by construction and correctly so — this is only the two instant cases.
Fix: pass an explicit `signedAt` whose local rendering is unambiguous, or pin `TZ` for the suite.

### S8 · MINOR (confidence 0.6) — the fourth e2e case mints a token on a `void` agreement, which the RPC may refuse
`tests/trade-agreement-link.spec.ts:270` calls `mintTradeAgreement({ state: 'void' })`, which
INSERTs at `state='void'` and then calls `mint_trade_agreement_token`. §3.2 specifies
`void_trade_agreement` "revokes every live token", which implies minting for a void agreement is
not a supported operation; if the mint RPC guards on `state`, this test throws in setup instead of
asserting the dead link. Cheaper and truer to the flow: mint at `sent`, then flip to `void`
(service_role, out of band) before the page load.

### S9 · MINOR (confidence 0.85) — the e2e asserts `X-Robots-Tag` but not `Cache-Control`, and never the page's own meta
RC-2 asks for both headers and the page metadata. The spec checks
`response?.headers()['x-robots-tag']` only; `Cache-Control: private, no-store, max-age=0` — the
half that matters for a spent signing link sitting in an intermediary cache — is asserted nowhere
outside the unit-level `middleware.test.ts` matrix, and §9's production probe expects both. Add
the second header assertion, and (cheap) a `page.locator('meta[name=robots]')` check.

### S10 · NIT (confidence 1.0) — the guest-route list in `src/app/layout.tsx:52` was not updated
`// the token and guest routes (/share, /field, /rfq, /plans, /piece, /evidence)` — a comment, so
harmless in itself, but it is the same "list of bearer prefixes kept by hand in more than one
place" pattern that produced S1. Worth updating in the same change that fixes S1.

---

## Checks that passed, recorded so they are not re-litigated

- **R13 absences.** `TradeAgreementLinkDTO` types §4.5's 13 keys and no more; `page.test.tsx`
  hands the page a DTO with `clientPriceCents`, `gmp`, `scheduleOfValues`, `draws`, `projectName`,
  `bids`, `otherSubCount` bolted on and asserts none of `Halvorsen`, `Ridgeline Millwork`,
  `$84,134`, `8413400`, `$44,840`, `$8,413.40`, `$41,000` reaches the DOM; the signature component
  carries the same defensive-props case; the e2e reads `body.innerText` and asserts the same
  absences. No path from the page to `trade_scope_bids`, the prime, or another agreement exists in
  the client code — the page holds exactly one RPC call.
- **No login anywhere.** The page uses `createServiceClient()` server-side only; the action is
  `'use server'`; the middleware exempts `/trade/` from the sign-in gate (new test asserts no
  redirect and no `callbackUrl`, and that no response header carries the 64-hex token); `app-chrome`
  renders it chrome-less. The e2e asserts zero `sb-` cookies in the guest context.
- **Dead links are indistinguishable.** One `notFound()` for malformed, null and RPC-error alike;
  the page renders no "this link was used" sentence of its own; `classifyMessage` gives only
  `agreement_void` its own sentence and folds everything else — including a raw
  `permission denied for table foo` — into "This link is no longer active." (tested).
- **A database value never becomes copy.** `lienWaiverLine` falls back to a plain sentence for an
  unknown policy key, with a test asserting `some_future_policy` never renders. No column name,
  no "variant", no ruling id, no badge, no count chip, no red/green status, no checkmark-as-status,
  no emoji anywhere in the rendered strings. R7's "Trade Agreement, never 'subcontract' in UI copy"
  holds — "subcontractor" appears only in code comments.
- **The instruments are the portal's own.** `SignatureLine` (with `SIGNATURE_NOTICE` from
  `consent-copy.ts`, so the electronic-signature sentence cannot drift) + `HoldAction`, not a new
  guest-grade widget. The NO VALIDATION VOICE rule is followed: the act stays unarmed, nothing
  turns a colour, no "required" message.
- **Calendar dates do not slide.** `formatLongDate` parses `YYYY-MM-DD` from local parts rather
  than `new Date('2026-10-12')` (UTC midnight), so a start date does not print as the previous day
  west of Greenwich. Tested.
- **Commits.** Four lane commits plus the shared T0; explicit pathspecs only; Conventional Commits
  subjects; no `merge(...)` subject; no trailers; nothing outside §2.5's pathspecs (+ the T0
  handshake and the lane log, force-added under the gitignored `build/`). Working tree clean.
- **`page.test.tsx` DTO-extras assertion** is the one §2.6 I-4 asks for, copied from
  `rfq/[token]/__tests__/page.test.tsx`.

## Advisory (does not block)

- `/trade/[token]` ships **unflagged**, by the sheet's own design (§9's production probe expects
  `/trade/<bad-hex>` to 404 on `client.patina.cloud` regardless of the flag). It is inert only
  because no token can exist until the flagged designer surface and migration 2 are live. That is
  the right call — but it means S1 lands in production the moment the client portal is deployed,
  independent of whether Kody has created the `design-build` flag. Fix S1 before the deploy, not
  before the flag.
- The lane could not exercise anything against a database: the two RPCs it calls do not exist on
  any stack yet. Every backend-facing claim in this review is therefore contract-reading, not
  observation. RC-1 (token replay, same-transaction revocation, `token_hash` as the only stored
  form) and RC-3 (fingerprint computed inside the signing transaction) are entirely the backend
  lane's to prove; nothing in the sub lane's code can establish or violate them.
