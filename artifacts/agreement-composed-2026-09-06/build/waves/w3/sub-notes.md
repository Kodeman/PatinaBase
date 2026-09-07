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
