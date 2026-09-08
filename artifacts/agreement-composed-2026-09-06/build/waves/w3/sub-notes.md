# Wave 3 · lane `sub` — notes

Branch `agreement/w3-sub`, worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w3-sub`, base `112e6f838` + the T0 types commit `1bc317855`.

## What shipped

The `/trade/[token]` tree in the client portal — the login-less page a
subcontractor opens from the link their studio sends, and signs on (P14, R16,
R13).

| File | What it is |
|---|---|
| `apps/client-portal/src/app/trade/[token]/types.ts` | The token format gate (its OWN `/^[0-9a-f]{64}$/` literal, never an import from `rfq/[token]/types.ts` — a separate credential gets a separate gate), the frozen `TradeAgreementLinkDTO`, and the readers that turn the eight essentials into sentences. |
| `.../page.tsx` | Server component. `force-dynamic`, `robots: {index:false, follow:false}`, `referrer: 'no-referrer'`, format gate before any DB round trip, one `resolve_trade_agreement_link` call through `createServiceClient()`, `notFound()` on any null. |
| `.../trade-agreement-signature.tsx` | The act: `SignatureLine` (typed full name + `SIGNATURE_NOTICE`) and `HoldAction` (press-and-hold, the same held act the homeowner's own signature uses). |
| `.../actions.ts` | `'use server'` `signTradeAgreement` — calls `sign_trade_agreement_by_token` DIRECTLY, no pre-resolve. |
| `.../__tests__/{page,actions,trade-agreement-signature}.test.tsx` | 44 cases. |
| `src/middleware.ts`, `src/components/layout/app-chrome.tsx` | `/trade` registered as the seventh bearer-token guest prefix. |
| `tests/trade-agreement-link.spec.ts` | The e2e touchpoint (E2E-3): fresh `BrowserContext`, no session, sign, dead links. |

## Decisions this lane made, and why

**The `/rfq/[token]` posture is copied, not adapted.** Format gate before the
DB, single RPC through the service client, `notFound()` on every miss, submit
as a `'use server'` action calling the RPC directly with no pre-resolve. The
last one is the load-bearing copy: only the RPC can tell a link that never
existed (`invalid_link`) from a live token whose agreement was withdrawn
(`agreement_void`) from one already signed (`already_signed`, which returns the
original receipt rather than raising). A pre-resolve call would answer NULL for
the withdrawn case and flatten three sentences into one wrong one — the exact
reasoning written out at `rfq/[token]/actions.ts:5-18`.

**The action reads BOTH classification channels.** `sign_trade_agreement_by_token`
may classify on the returned JSONB (`status`) or by raising a message carrying
the same token. Both are read, so a backend that raises and a backend that
returns produce the same sentence on the page, and neither can fall through to
a raw DB message. Only the withdrawn case gets its own sentence; `invalid_link`
and every unrecognized failure read alike, so a dead link never confirms it
once existed.

**The signature IP is read the way the prime's own e-signature route reads it**
— `resolveClientIp(await headers())`, Cloudflare's edge header first, never a
value the browser hands us. It is passed as `p_signed_ip`; the fingerprint is
computed inside the RPC's transaction (RC-3), not here.

**The instruments are the portal's own, not new ones.** `SignatureLine` carries
the electronic-signature sentence (`SIGNATURE_NOTICE`, drift-guarded in
`consent-copy.ts`) and `HoldAction` is the held act (P-18) the homeowner's
signature already uses — so a sub signs with the same gesture and the same ink
rather than a second, lesser one invented for guests. Following
`signature-line.tsx`'s NO VALIDATION VOICE rule, the act simply stays unarmed
until there is a name; it never reports that the rule is empty.

**A bare `YYYY-MM-DD` is a calendar day, not an instant.** `formatLongDate`
parses the schedule's `startOn` from local date parts — `new Date('2026-10-12')`
is UTC midnight and prints as the 11th anywhere west of Greenwich, which would
have slid every start date by a day. A full timestamp (`signed_at`) is still
read as an instant.

**A lien-waiver policy key is never printed raw.** Three known policies map to
sentences; an unknown key falls back to the plain sentence true of every policy,
so a database value can never become UI copy (R7).

**R13 is enforced by type and by test, at both levels.** The DTO types exactly
the keys §4.5 freezes; `page.test.tsx` hands the page a DTO with
`clientPriceCents`, `gmp`, `scheduleOfValues`, `draws`, `projectName`, `bids`
and `otherSubCount` bolted on and asserts none of their strings or figures
reaches the DOM. `projectName` in particular: studios name projects after the
people who live in them, so a project name hands the sub the client's surname
(00424:576-600). The signature component gets the same defensive-props
assertion.

**Route shape.** `/trade/[token]` is NOT the authenticated client surface
R135/V8 rules to one page — it is a seventh bearer-token GUEST prefix beside
`/share`, `/field`, `/rfq`, `/evidence`, `/plans` and `/pay`, exempt for the
same reason those six are. Said in the page's own header comment so a reviewer
does not read it as an R135 violation.

## Middleware / chrome

`/trade` was added in the three places `/rfq` appears: the prefix const, the
no-store + noindex header set, and the `isPublicPage` disjunction; plus
`PUBLIC_PREFIXES` in `app-chrome.tsx` so the page renders chrome-less and no
`callbackUrl=/trade/<token>` can ever be built (the `/pay` S-10 lesson). The
S8 comment's "six bearer prefixes" is corrected to seven. Both files' existing
tests learned the new prefix.

## Gates

| Command | Result |
|---|---|
| `pnpm --dir apps/client-portal type-check` | Two errors, **both pre-existing on this branch's base and both in `client`-lane files** (`commercial-document-shell.tsx:26` and `door-gate.tsx:266` have not learned `design_build`, which the T0 types commit `1bc317855` added to `COMMERCIAL_DOCUMENT_KINDS` at HEAD). Zero errors in any file this lane owns. |
| `npx jest src/app/trade src/__tests__/middleware.test.ts src/components/layout/__tests__/app-chrome.test.tsx` | 5 suites, 110 tests, all pass. |
| `pnpm --dir apps/client-portal test` (full) | **132 suites, 2130 tests, all pass.** |
| `pnpm --dir apps/client-portal test:coverage` | Global 74.72 / 70.23 / 74.76 / 77.02 — above the 70/60/70/70 floor, no threshold failure. The `trade` tree itself: 95.65 / 94.87 / 100 / 99. |
| `npx playwright test tests/trade-agreement-link.spec.ts --list` | Compiles and collects: 4 tests, chromium. |

## Not verified here, and why

- **The e2e spec was NOT executed.** It mints through migration 2's objects
  (`studio_trade_agreements`, `studio_trade_agreement_signatures`,
  `studio_trade_agreement_tokens`, `mint_trade_agreement_token`), which the
  `backend` lane had not written at the time of this lane's work, and the wave
  brief forbids writing to the shared local Supabase stack during the build.
  It compiles and collects; the integration steward runs it after migration 2
  lands. It needs `SUPABASE_SERVICE_ROLE_KEY` exported from `supabase status`
  (the repo's secret scan rejects the demo service-role JWT in a committed
  file, so `playwright.config.ts` reads it from the environment).
- **The page was not driven in a browser.** The RPCs it calls do not exist yet
  on any stack.
- `pnpm --filter @patina/client-portal lint` was not run — per
  `patina-verification`, this portal's ESLint config does not resolve under
  ESLint 9 and its result is not meaningful.

## Contract this lane holds the backend to (I-4)

- `resolve_trade_agreement_link(p_token) → jsonb`: `studioName`,
  `agreementTitle`, `contactDisplayName`, `scope`, `priceCents`, `currency`,
  `schedule {startOn, durationDays, sequencing}`, `retainageBps`,
  `payWhenPaidDays`, `insuranceCertificateRequired`, `lienWaiverPolicy`,
  `state`, `existingSignature {signedName, signedAt} | null` — and NULL on
  every miss (bad hash, revoked, expired, draft, void, not in `sent|signed`).
- `sign_trade_agreement_by_token(p_token, p_signed_name, p_signed_ip) → jsonb`:
  a `status` of `signed` | `already_signed` | `agreement_void` |
  `invalid_link`, with `signedName` and `signedAt` on the first two. Raising
  with those tokens in the message works identically.

---

# Round 1 — adversarial review, fixes applied

Findings S1, S3, S4 and S5 are addressed here. S2 is confirmed and left alone:
it is not this lane's work.

## S1 (blocker) — the signing token was reaching PostHog raw

`/trade` had been registered in `middleware.ts` and `app-chrome.tsx` but not in
`HEX_BEARER_IN_URL` in `apps/client-portal/src/lib/analytics/posthog.ts`, which
is the fourth site a bearer prefix must be declared and the only scrub on the
send path (`before_send: sanitizePostHogEvent`, autocapture left on). Every
`$pageview` on the page — and every `client_making_action_*` event from the
`HoldAction` this page is the first guest surface to mount — carried the raw
64-hex token. What leaks is not a read capability but a LIVE SIGNING
CREDENTIAL: anyone with the URL can sign the Trade Agreement as the sub.

Fixed by adding `trade` to the alternation, plus two new cases in
`posthog-privacy.test.ts` (the seventh prefix case, and a held-action event
case) — the suite now enumerates all six hex prefixes. This is independent of
the `design-build` flag and must land before the client-portal deploy.

## S3 (major) — `revalidatePath` could eat the receipt it had just earned

`actions.ts` copied `rfq/[token]/actions.ts`'s `revalidatePath` after a
successful submit. That is safe for an RFQ, whose token stays live; it is not
safe here, because §3.2 revokes the token in the same transaction as the
signature. The Server Action's re-render of the current route would resolve the
now-spent token to NULL and `notFound()` would replace the just-inked receipt.

Removed. The receipt renders from the component's own state and the route is
`force-dynamic`, so the call bought nothing even in the benign case.
`actions.test.ts` now pins the absence (`expect(revalidatePath).not
.toHaveBeenCalled()`) rather than its presence.

## S5 (major) — the sign RPC's answer is now read failure-first

The build sheet freezes resolve's DTO (I-4) but freezes no success shape for
`sign_trade_agreement_by_token` — §3.2 names only the three failure
classifications. The lane had invented a success shape and pinned it against
itself, so a backend answering `{ ok: true }` or snake_case names would have
printed "This link is no longer active." to a sub whose signature had just
committed.

The reading is inverted. A recognised failure word (`invalid_link`,
`not_found`, `expired`, `revoked` → the dead-link sentence; `agreement_void`,
`void`, `voided` → the withdrawn sentence), on a `status`, `outcome` or
`result` key or as a bare string, is a failure. An empty answer is a failure.
**Anything else the RPC handed back without raising is a committed signature**,
whatever it named its keys — `signedName`/`signed_name` and
`signedAt`/`signed_at` are both read, the typed name standing in when the
receipt carries none. Five new cases in `actions.test.ts` cover snake_case, an
`ok`-shaped answer, an `outcome`-keyed answer, and every failure word.

This is hardening, not a substitute for the freeze. **Still owed before
integration:** an I-3-style one-page freeze of this RPC's return shape, with
either the action or the migration moved onto it.

## S4 (major) — ESCALATED, not decided in-lane

The build sheet contradicts itself and the lane had quietly picked a side:

- §3.2 revokes a signed agreement's token inside the signing transaction, and
  §687 lists `revoked` among `resolve_trade_agreement_link`'s NULL cases.
- §4.5 types the DTO with `"state": "sent" | "signed"` and
  `existingSignature | null`, and says an already-signed agreement shows "the
  settled receipt: name, date, and nothing to press".
- §8 step 16 requires that "a fresh load of the same URL still shows the
  receipt" **and** that "a revoked-token URL 404s".

Under §3.2, resolve can never answer for a signed agreement, so `state:
'signed'` and `existingSignature` are unreachable in production, the
`already_signed` classification can never fire (a replay hits a revoked token),
and a sub who reopens their own signed link reads "Page not found" — which
reads as if the signature vanished.

**No code change makes both true, and this lane does not own the RPC.** What
changed:

- The contradiction is written into `page.tsx`'s header comment rather than
  left as an in-lane assumption.
- The e2e no longer pins the 404 for the re-open. It now asserts the part both
  readings agree on — a re-open is never a second signable form — using
  `getByText(/page not found/i).or(getByTestId('trade-agreement-receipt'))`.
  Re-pin it to the single ruled horn once the ruling lands.
- The DTO keys stay (I-4 freezes them) and
  `trade-agreement-signature.tsx`'s `existingSignature` branch stays: it is
  already correct for the other horn and needs no edit if the ruling goes that
  way.

**Ruling needed from the orchestrator, one of:**

1. `resolve_trade_agreement_link` keeps answering read-only for a `signed`
   agreement through its spent token — which is what makes §4.5's `state` and
   `existingSignature` keys mean anything, and what step 16's first clause
   describes; or
2. §4.5's two keys and step 16's "still shows the receipt" sentence are struck,
   and the 404 is the ruled behaviour.

## S2 (blocker) — confirmed, and NOT this lane's work

`pnpm --filter @patina/client-portal type-check` exits 2 on this branch with
exactly two errors, both caused by the shared T0 commit appending
`design_build` to `COMMERCIAL_DOCUMENT_KINDS`:

```
src/components/commercial-document-shell.tsx(26,7): error TS2741: Property 'design_build' is missing in type '{ design_services: string; service_addendum: string; furnishings_authorization: string; trade_scope: string; }' but required in type 'Record<"design_services" | "furnishings_authorization" | "service_addendum" | "design_build" | "trade_scope", string>'.
src/components/threshold/door-gate.tsx(266,7): error TS2322: Type '"design_services" | "furnishings_authorization" | "service_addendum" | "design_build" | "trade_scope"' is not assignable to type 'MakingGateKind'.
  Type '"design_build"' is not assignable to type 'MakingGateKind'.
```

Both files are client-lane pathspecs per build-sheet §2.4; neither is touched by
this branch. Zero errors in `src/app/trade/**`, `middleware.ts`,
`app-chrome.tsx` or `lib/analytics/posthog.ts`. Editing them here would collide
with the client lane's own edit, so they are left alone. **The integration
steward must re-run this gate after the client lane lands, before merging
either branch.**

## Gates, round 1

| Command | Result |
|---|---|
| `pnpm --filter @patina/client-portal type-check` | **FAIL, exit 2** — the two S2 errors above, both cross-lane, 0 in sub-lane files |
| `pnpm --filter @patina/client-portal test` | **PASS** — 132 suites, 2136 tests (was 2130; +6 from S1 and S5) |
| `pnpm --filter @patina/client-portal test:coverage` | **PASS** — 74.74 / 70.25 / 74.79 / 77.06 against the 70 / 60 / 70 / 70 floor |

`tests/trade-agreement-link.spec.ts` still cannot run: its fixtures need the
backend lane's migration, which does not exist yet on any stack.

Advisory: `prettier --check` warns on every file this lane touched, including
the two it only edited — `posthog.ts` at `main` warns identically, so the drift
predates the wave and is not the lane's.

---

# Round 2 — the five findings

Commit: `6a8c32217 fix(client): ink a trade signature only on positive evidence,
and never in the wrong name` (4 files, +179 / −21). Two findings are code, three
are not this lane's to close.

## N2 (major) — FIXED: a success allowlist, and a reload instead of a claim

Round 1's S5 fix made the answer FAILURE-first: a recognised failure word or an
empty answer was a failure, and everything else was a committed signature. That
closed one hole and opened its mirror. `sign_trade_agreement_by_token`'s return
shape is still unfrozen, so a sixth classification the backend adds later —
`not_sent`, `contact_mismatch`, `token_consumed`, `error` — returned without
raising would have fallen straight through to the receipt and printed
"Signed. Dana Hall" to a sub with no signature row. The sub walks away believing
they signed. That is strictly worse than the sentence S5 was protecting against.

Neither pure reading is safe, because an unheard-of word belongs to neither
list. So the action now inks a receipt only on **positive evidence**:

- a recognised success word — `signed`, `saved`, `already_signed`; **or**
- a receipt key actually present on the answer — `signedName` / `signed_name` /
  `signedAt` / `signed_at`, non-empty string only (a `signed_at: null` is not a
  receipt).

Everything else returns the new `{ status: 'unknown' }`, which asserts neither
outcome. `trade-agreement-signature.tsx` answers it with
`window.location.reload()` — the reload half of S5's own recommended hardening,
which round 1 dropped — using the portal's existing idiom (`quiz-flow.tsx:98`,
`site-request-guest.tsx:872`), guarded by `typeof window !== 'undefined'`. The
page comes back saying whatever is actually true of that token. Nothing is
inked, no alert is raised, and the act is not settled.

Recognised failure words keep their own sentences exactly as before, and the
S5 shapes stay green: `{ ok: true, signed_at: … }` is still a signature (it
carries a receipt key), `[{ status: 'signed' }]` is still a signature (a
success word), and a snake_case receipt still reads as one.

Note the interaction with S4: under the implemented §3.2 reading, the reload
after an `unknown` lands on a token that may already be spent, so the sub may
read "Page not found". That is the honest answer to "I cannot tell you whether
this committed" — it is not a receipt over nothing, and it changes if S4 is
ruled the other way.

Tests added to `__tests__/actions.test.ts` (4) and
`__tests__/trade-agreement-signature.test.tsx` (1):

- four unknown refusal words (`not_sent`, `contact_mismatch`,
  `token_consumed`, `error`) each → `unknown`;
- `{ ok: true }` with no receipt key at all → `unknown`;
- `{ status: 'contact_mismatch', signed_at: null }` → `unknown` (an empty
  receipt key is not evidence);
- `{ status: 'not_sent', signed_at: '…' }` → `saved` (the other half of the
  OR: a real `signed_at` IS the signature);
- the component: on `unknown`, `location.reload` is called once, no receipt
  renders, no "Signed." renders, and no alert is raised.

## N3 (major) — FIXED: a replay never carries the replayer's name

`signedName: readString(row, …) ?? signedName` was correct for a fresh
signature and wrong for a replay. §4.5 and RC-1 both require the replay to show
THE ORIGINAL receipt, and the RPC's shape is unfrozen, so a bare
`{ status: 'already_signed' }` rendered "Signed. <whoever just typed a name>".
Reachable without any backend bug: two people hold the emailed link, A signs,
B's already-loaded page completes its hold, B reads a receipt in B's name over
A's signature.

`already_signed` now returns the receipt's own name **or null** — never the
typed fallback, which is kept only on `saved`. `SignTradeAgreementResult`'s
`already_signed` arm widens to `signedName: string | null`, and the `Receipt`
component builds its second line from `[signedName, date].filter(Boolean)`, so
a nameless replay prints the date alone and a receipt with neither prints no
second line at all. The existing "Dana Hall · 6 September 2026" rendering is
unchanged.

Tests: two in `actions.test.ts` (`already_signed` with a date but no name →
`signedName: null`; a bare `already_signed` → both null) and one component test
asserting the receipt shows "Signed." and "6 September 2026" and does NOT show
the name the replayer just typed.

## S2 (blocker) — re-confirmed, still NOT this lane's work

The gate is red on this branch for exactly the same two cross-lane errors as
round 1, unchanged by the round-2 fix:

```
src/components/commercial-document-shell.tsx(26,7): error TS2741: Property 'design_build' is missing …
src/components/threshold/door-gate.tsx(266,7): error TS2322: Type '"design_build"' is not assignable to type 'MakingGateKind'.
```

`tsc` reports every error in the project, and **both** are in client-lane files
(build-sheet §2.4) that `git diff main...HEAD --name-only` shows this branch
does not touch — so this lane's own files carry zero type errors.

I also tried to prove the merged state green by grafting the three fixed files
from `agreement/w3-client` in temporarily. It does not work as a proof and the
graft was reverted immediately (`git checkout HEAD -- <the three paths>`,
working tree confirmed clean of them afterwards): those three files import
`@/components/commercial/design-build-body`, `./deposit-offer` and a
`designBuild` key on `CommercialDocumentBundle` that only exist on the full
client branch, so a partial graft trades two errors for four. **The gate can
only be run green on the integration merge, by the steward, after
`agreement/w3-client` lands.** No edit is made here: editing those two files in
this lane would collide with the client lane's own edit of the same lines.

## N5 (major) — acknowledged, and blocking on the backend, not on this lane

Nothing here has executed against a database, because
`resolve_trade_agreement_link`, `sign_trade_agreement_by_token` and
`mint_trade_agreement_token` exist on no branch — `agreement/w3-backend` still
carries no migration. `tests/trade-agreement-link.spec.ts` therefore still only
`--list`s:

```
Total: 4 tests in 1 file   (all [chromium])
```

unchanged by round 2. The bid-ledger half of R13 is proven at the unit level
(`page.test.tsx` and `trade-agreement-signature.test.tsx` bolt a full studio
ledger onto the props and assert none of it reaches the DOM), and the round-2
work above is proven the same way. **Integration must not merge this branch
until migration 2 lands, the sign RPC's return shape is frozen I-3-style, and
`pnpm --filter @patina/client-portal test:e2e -- tests/trade-agreement-link.spec.ts --workers=1`
has actually run green.** When that shape is frozen, the N2 allowlist above is
the thing to check it against: if the frozen success word is not one of
`signed` / `saved` / `already_signed` and the receipt keys are spelled some
third way, the action will read a real signature as `unknown` and reload —
safe, but wrong, and a one-line fix at that point.

## S4 (major) — still open, still the orchestrator's to rule

No ruling has arrived, so nothing changed: `page.tsx`'s header still writes the
contradiction out rather than assuming a side, and
`trade-agreement-link.spec.ts` still asserts only what both horns agree on
(`getByText(/page not found/i).or(getByTestId('trade-agreement-receipt'))`,
plus zero signable form and zero name field). The two horns are restated
above under "S4 (major) — ESCALATED". Re-pin the e2e to the single ruled horn
once it lands. N2's reload path inherits the same ruling, as noted above.

## Gates, round 2

| Command | Result |
|---|---|
| `pnpm --filter @patina/client-portal type-check` | **FAIL, exit 2** — the same two S2 cross-lane errors, 0 in this lane's files |
| `pnpm --filter @patina/client-portal test` | **PASS** — 132 suites, 2144 tests (was 2136; +8 from N2 and N3) |
| `pnpm --filter @patina/client-portal test:coverage` | **PASS** — 74.78 / 70.28 / 74.79 / 77.10 against the 70 / 60 / 70 / 70 floor; `src/app/trade/[token]` at 94.66 / 92.92 / 100 / 99.21 |
| `jest src/app/trade` | **PASS** — 3 suites, 56 tests |
| `playwright … trade-agreement-link.spec.ts --list` | 4 tests, chromium — still cannot RUN (N5) |

Advisory unchanged: `prettier --check` warns on the two source files this
round touched, as it did at round 1 and as it does at `main` for their
neighbours.
