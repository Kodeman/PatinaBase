# Wave 3 · lane `sub` — adversarial review, round 2

Reviewer context: separate from the implementer. Branch `agreement/w3-sub`,
worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w3-sub`
(`git rev-parse --show-toplevel` pasted below). Ten commits on `main..HEAD`,
18 files, +2285 / −12.

```
$ git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w3-sub rev-parse --show-toplevel
/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w3-sub
```

## Gates, run by the reviewer

| Command | Result |
|---|---|
| `pnpm --filter @patina/client-portal type-check` | **FAIL — exit 1**, two errors, both in `client`-lane files this branch does not touch (see S2 below) |
| `pnpm --filter @patina/client-portal test` | **PASS** — 132 suites, 2136 tests, 1 snapshot |
| `pnpm --filter @patina/client-portal test:coverage` | **PASS** — global 74.74 / 70.25 / 74.79 / 77.06 against the 70 / 60 / 70 / 70 floor |
| `pnpm --filter @patina/client-portal test:e2e -- tests/trade-agreement-link.spec.ts` | **NOT RUNNABLE** — the fixtures need migration 2, which exists on no branch (see N5) |

Verbatim type-check output:

```
src/components/commercial-document-shell.tsx(26,7): error TS2741: Property 'design_build' is missing in type
  '{ design_services: string; service_addendum: string; furnishings_authorization: string; trade_scope: string; }'
  but required in type 'Record<"design_services" | "furnishings_authorization" | "service_addendum" | "design_build" | "trade_scope", string>'.
src/components/threshold/door-gate.tsx(266,7): error TS2322: Type '"design_build"' is not assignable to type 'MakingGateKind'.
```

## Round 1 findings — disposition

| id | Round-1 severity | Status now | Evidence |
|---|---|---|---|
| **S1** | blocker | **FIXED** | `posthog.ts:100` is now `/\/(share\|rfq\|evidence\|plans\|pay\|trade)\/(?:return\/)?[0-9a-f]{64}(?![0-9a-f])/gi`; two new cases in `posthog-privacy.test.ts` cover the pageview/referrer/autocapture/nested paths **and** a `client_making_action_selected` event from `HoldAction`. Suite green. |
| **S2** | blocker | **CONFIRMED, still red — cross-lane** | Reproduced above. Neither file is in this branch's diff (`git diff main...HEAD --name-only`). `agreement/w3-client` fixes both: `commercial-document-shell.tsx` gains `design_build: 'Design-build agreement'` in `KIND_LABEL`, and `src/lib/analytics/events.ts` (+4) widens `MakingGateKind`. The steward must re-run this gate after the client lane lands. |
| **S3** | major | **FIXED** | `revalidatePath` is gone from `actions.ts` (no `next/cache` import at all); `actions.test.ts` mocks it and pins `expect(revalidatePath).not.toHaveBeenCalled()` on both the fresh-signature and the withdrawn paths, so a reintroduction fails the suite. |
| **S4** | major | **ESCALATED, not decided in-lane — correct** | `page.tsx:20-29` states the contradiction; the e2e's re-open assertion is now `getByText(/page not found/i).or(getByTestId('trade-agreement-receipt'))` plus "no second form, no signable act" — the part both horns agree on. **Still needs the orchestrator's ruling.** |
| **S5** | major | **ADDRESSED, with a new inverse risk** | The read is now failure-first (`actions.ts:120-139`). This removes "This link is no longer active." over committed ink. It introduces N2 below. The owed I-3-style freeze of `sign_trade_agreement_by_token` is still owed. |
| **S6** | minor | **OPEN, unchanged** | `apps/client-portal/package.json:13` is still `"test": "jest"`; the floor lives in `jest.config.js:70-77` and applies only under `--coverage`. Gate lists must name `test:coverage`. |
| **S7** | minor | **OPEN, unchanged** | `trade-agreement-signature.test.tsx:56` still asserts `7 September 2026` for `2026-09-07T15:04:00Z` and `:93` `6 September 2026` for `2026-09-06T11:00:00Z`; `grep TZ` over `jest.config.js`, `jest.setup.js`, `package.json` returns nothing. |
| **S8** | minor | **OPEN, unchanged** | `trade-agreement-link.spec.ts:284` still mints on a row INSERTed at `state:'void'`. |
| **S9** | minor | **OPEN, unchanged** | `trade-agreement-link.spec.ts:171` asserts `x-robots-tag` only; no browser-level `Cache-Control`, no `meta[name=robots]`. (The unit matrix in `middleware.test.ts:80-99` does assert both headers for `/trade`.) |
| **S10** | nit | **OPEN, unchanged** | `app/layout.tsx:52` still reads `(/share, /field, /rfq, /plans, /piece, /evidence)`. |

## New findings

### N1 · minor — `/trade` is missing from the FIFTH bearer-prefix list

`apps/client-portal/next.config.js:34`

```js
urlPattern: /^https?:\/\/[^/]+\/(pay|plans|share|rfq|evidence|field)\//,
handler: 'NetworkOnly',
```

The block's own comment says why the list exists: *"Cache Storage does not honour
`Cache-Control: no-store`, so the middleware's header would not have covered
this: a NetworkFirst entry would keep a revoked link's sheet (and, for /pay, a
live payment page) in the visitor's browser for thirty days."* With `/trade`
absent, the sub's signing page falls through to the catch-all
`{ urlPattern: /^https?.*/, handler: 'NetworkFirst', maxAgeSeconds: 30 days }`
— and the cache key is the URL, i.e. the raw 64-hex signing credential.

Production impact today is **nil**: `withPWA` is the identity function when
`OPEN_NEXT === 'true'`, and `infra/deploy-portal.sh:288` sets it, so no service
worker ships. The comment keeps the rule anyway "to protect non-OpenNext builds
and preview hosts, and to fail safe if the PWA is ever re-enabled" — which is
exactly the protection `/trade` does not get. Same hand-kept-list class as S1
and S10.

**Fix**: add `trade` to the alternation in the same change as S10.

### N2 · major — the failure-first read has no success allowlist, so an unknown refusal prints "Signed."

`apps/client-portal/src/app/trade/[token]/actions.ts:124-139`

`readOutcome` extracts a word from `status` / `outcome` / `result`; the word is
checked against `VOID_OUTCOMES` and `INVALID_OUTCOMES` and **everything else
falls through to a receipt**. The failure classifications are hard-coded to the
five the build sheet names today (`invalid_link`, `not_found`, `expired`,
`revoked`, plus the three void spellings). A backend that adds any sixth
refusal word — `not_sent`, `agreement_not_sent`, `contact_mismatch`,
`token_consumed`, `error` — returns without raising, and the page renders
`Signed.` with the sub's own typed name and no date over a signature that never
committed. That is the mirror of S5's defect and it is strictly worse: a sub who
believes they signed walks away, and the studio has no row.

S5's suggested interim hardening was "treat any answer that is not a recognised
failure classification as *success-with-unknown-receipt* (**reload the page**)" —
the reload is the half that was dropped.

**Fix**: accept success only on positive evidence — an outcome word in
`{'signed','saved','already_signed'}`, **or** a receipt key present
(`signedAt`/`signed_at`/`signedName`/`signed_name`). Anything else: neither a
receipt nor the dead-link sentence, but a reload of the page, which the RPC's own
resolve then answers truthfully. Then unpin the "ok-shaped answer carrying no
classification" case at `actions.test.ts:159-167` (that one is safe — it carries
`signed_at`) from the genuinely unknown-word case, and add a case for a refusal
word the action does not know.

### N3 · major — a replay can print the replayer's name as the signature

`apps/client-portal/src/app/trade/[token]/actions.ts:136-139`

```ts
status: outcome === 'already_signed' ? 'already_signed' : 'saved',
signedName: readString(row, ['signedName', 'signed_name']) ?? signedName,
```

The typed-name fallback is right for a fresh signature. On `already_signed` it is
not: §4.5 and RC-1 both require the replay to show **the original** receipt, and
`sign_trade_agreement_by_token`'s contract is unfrozen (S5), so a backend
answering a bare `{ status: 'already_signed' }` makes the page render
`Signed. <whoever just typed a name>`. Reachable in the live-token race: two
people hold the emailed link, A signs, B's already-loaded page holds the act, B
gets `already_signed` and reads a receipt in B's name.

`actions.test.ts:169-173` pins the good case (the receipt carries the name) and
`:136-140` pins the fallback for `{status:'signed'}` — the `already_signed`
fallback is untested and un-noticed.

**Fix**: no typed-name substitution on `already_signed`. If the receipt carries
no name, render the receipt without one (or reload), never with the replayer's.

### N4 · minor — the DTO's `state` is typed and never read

`page.tsx:102-131` renders the act purely on `existingSignature`; `state` is
declared in `types.ts:58` and used nowhere. Under horn 1 of the S4 ruling, a
signed agreement resolves with `state:'signed'`; if `existingSignature` is ever
null or omitted on that answer (a join miss, a DTO the backend trims), the page
offers a live signing form on an already-signed agreement. Belt and braces costs
one condition: render the act only when `state === 'sent' && !existingSignature`.
Worth deciding with S4 rather than separately.

### N5 · major (integration blocker, not lane work) — nothing in this lane has ever run against a backend

`git log --oneline main..agreement/w3-backend` is two commits (`03ab57f49` T0
types, `3a503fee2` its notes); `git diff main...agreement/w3-backend --stat --
supabase/migrations` is **empty**. Neither `resolve_trade_agreement_link` nor
`sign_trade_agreement_by_token` nor `mint_trade_agreement_token` exists on any
branch. Consequences the steward must carry:

- `tests/trade-agreement-link.spec.ts` — the sheet's own E2E-3 and a named item
  in this lane's brief — has never executed; it only `--list`s.
- I-4 (the resolve DTO) is asserted only against the lane's own fixtures.
- The sign RPC's return shape is still unfrozen (S5) and N2/N3 are unfalsifiable
  until it is.
- SQL-A1…A9 do not exist, so "a used or expired token cannot sign twice" is
  proven **only** at the action level (`actions.test.ts:78-95`, `:175-188`), never
  in the database.

The bid-ledger half of the same check *is* proven at this level: `page.test.tsx:194-225`
hands the page a DTO carrying `clientPriceCents`, `gmp`, `scheduleOfValues`,
`draws`, `projectName`, `bids`, `otherSubCount` and asserts none of `Halvorsen`,
`Ridgeline Millwork`, `$84,134`, `8413400`, `$44,840`, `$8,413.40`, `$41,000`
reaches the DOM; `trade-agreement-signature.test.tsx:136-156` repeats it for the
act. R13 is held by construction (the page destructures only typed keys) and by
test — but only above the RPC.

### N6 · nit — the two classification channels disagree

`actions.ts:54` classifies a **raised** message by `message.includes('agreement_void')`
alone, while the **returned** channel accepts `agreement_void` | `void` |
`voided` (`:58`). A backend that raises `agreement is void` therefore reads as
the dead-link sentence, not the withdrawn one — the exact flattening the file's
own header comment says it exists to prevent. Match the two sets.

### N7 · nit — the e2e fixture bypasses the create/send RPCs entirely

`trade-agreement-link.spec.ts:116-138` INSERTs `studio_trade_agreements` directly
at `state:'sent'` with `sent_at` stamped. The sheet's `create_trade_agreement`
"refuses when the studio has no live attestation" and `send_trade_agreement`
stamps the state; a direct INSERT skips both. That is a defensible fixture (the
spec has no studio session) but it means the spec proves nothing about the send
path, and it breaks in setup the moment the backend adds any INSERT-time guard.
Same family as S8. Worth one line in the spec's header saying which guards it is
knowingly stepping around, so a future failure reads as expected rather than as a
regression.

### N8 · nit — the shared error boundary speaks to a homeowner, not a sub

If `createServiceClient()` throws on a `/trade` request (missing
`SUPABASE_SERVICE_ROLE_KEY`), `app/error.tsx` renders "Back to your projects" to
a subcontractor with no account. No DB message leaks (the `<details>` block is
`NODE_ENV === 'development'` only, `error.tsx:48`), so RC-2's leak question is
answered no. Pre-existing and shared with `/rfq`, `/share`, `/plans`, `/pay` —
recorded for the main backlog, not this lane.

## What is right, and worth keeping

- The `/rfq/[token]` posture is copied rather than adapted: format gate before
  any round trip (`page.tsx:91`, its own literal at `types.ts:16`, never an
  import), one RPC through `createServiceClient`, `notFound()` on any null
  (`:100`), `force-dynamic`, `robots:{index:false,follow:false}`,
  `referrer:'no-referrer'`, and a `'use server'` submit that calls the RPC with
  **no pre-resolve** so the RPC alone classifies.
- All three middleware sites plus `app-chrome.tsx` plus (now) `posthog.ts`
  carry `/trade`; the unit matrix asserts both headers, and a new case proves an
  unauthenticated guest is not redirected and no header carries the token.
- No database value is ever printed as copy: an unknown `lienWaiverPolicy` falls
  back to a true sentence (`types.ts:150`, pinned at `page.test.tsx:176-185`).
- `formatLongDate` is right about the calendar-day/instant distinction — a bare
  `YYYY-MM-DD` start date is parsed from local parts, so it never slides a day.
- Vocabulary: "Trade Agreement" throughout, never "subcontract" in UI copy;
  no badge, no count chip, no red/green, no checkmark-as-status, no emoji; the
  act carries no validation voice. R7 clean.
- Commits are pathspec-explicit, Conventional, trailer-free; the T0 commit
  `1bc317855` is patch-id-identical (`7cc8b055dd97…`) to the T0 commit on all
  four sibling lane branches.

## Verdict

**fix.** One red named gate (S2 — cross-lane, already fixed on
`agreement/w3-client`, must be re-run at integration), three majors in this
lane's own code (N2, N3, and N5's "never run against a backend"), and six
minors/nits carried or new. Nothing off-brief, nothing out of scope, no
vocabulary refusal, no unrequested feature.

Owed before merge: the S4 ruling; the I-3-style freeze of
`sign_trade_agreement_by_token`; migration 2, then the e2e actually run.
