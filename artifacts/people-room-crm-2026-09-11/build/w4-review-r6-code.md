# W4 surfaces + help — adversarial code review, round 6

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`, branch
`build/people-room-crm-2026-09-11`. Base for the changed-file set: `0f671b149`.

**Verdict: NOT clean — 0 blocking, 1 major, 13 minor.**

Read in full this round: the three surface reports (`w4-paperwork-report.md`,
`w4-studio-report.md`, `w4-help-report.md`), every changed file under
`apps/client-portal/src`, `apps/designer-portal/src`, `packages/supabase/src/hooks`,
`packages/help-system/src`, `studios/help-system/scripts`, plus the migrations and edge
functions those files depend on (00635–00638, `sms-inbound/pipeline.ts`,
`_shared/invoice-links.ts`, `invoice-send`, `paperwork-upload`).

---

## 1. Prior-round fix log: every r5 finding re-checked

Source: `.../build/w4-fix-log-r5.md`.

| r5 finding | State | Evidence |
|---|---|---|
| Invoice-link expiry tested ABOVE the dead check | **FIXED** | `00636_invoice_link_hardening.sql` — the expiry test now sits below `v_dead := v_link.status = 'closed' OR v_invoice.status = 'void';`, so an expired-but-active row reads dead rather than being resurrected. |
| client-portal unsubscribe landing dropped `scope` | **FIXED** | `apps/client-portal/src/app/api/unsubscribe/route.ts` `outcomePage()` forwards `scope`; `apps/client-portal/src/app/preferences/unsubscribe/page.tsx:70,173` speaks from the scope. |
| STOP / START / YES filed no consent touch | **FIXED** | `supabase/functions/sms-inbound/pipeline.ts` — `recordConsentTouches(...)` wired at 1015 (STOP), 1073 (START), 1155 (YES). HELP deliberately left on `conv.party_id`. |
| Regenerate gated on an address it can never have | **FIXED (r4 MAJOR-1)** | `invoice-folio.tsx:694` — Regenerate is gated on `canShareLink` alone; only Copy (674) also requires `clientInvoiceUrl`. See M-1 below for the sentence that did not follow. |

Earlier rounds spot-checked and still holding: the `awaiting_check` inbound leg in
`resolve_paperwork_link`; `compliance_state`'s `rejected_at IS NULL` and
`NOT (inbound AND verified_at IS NULL)` predicates; `retainedComplianceDocuments`'s `held`
filter; `/paperwork` in both posthog redactors; `FIRM_SCOPED_ACCESS_GRANT_TIERS`;
`lastOpenDay` hoisted to `people-format.ts`; `touchInstantDay`; the calm `DeadLink`;
the paperwork sheet's persistent live region; `aria-controls="letterbox-letter"` resolving
to the real id at `letterbox.tsx:399`.

---

## 2. Blocking criteria — all ruled out

| Criterion | Finding |
|---|---|
| Token accepted without verification | No. `resolve_paperwork_link` matches on `token_hash = encode(digest(p_token,'sha256'),'hex')` and requires `revoked_at IS NULL` and `expires_at > now()`. The page pre-validates `/^[0-9a-f]{64}$/` and rate-limits on caller IP before the resolve. |
| Verified document overwritten | No. `record_inbound_compliance_document` inserts a new row with `inbound = true, verified_at = null`; nothing UPDATEs a verified row. Supersession is by `superseded_by`, never in place. |
| Cross-tenant read/write | No. `studio_touches` and `paperwork_link_tokens` RLS are `is_active_studio_member(organization_id)`; the guest write path is service-role-only inside the edge function and stamps the org from the resolved token, not from the request. |
| RLS / grant / storage-policy hole | No. The `compliance-documents` storage policy is SELECT-only for studio members; there is no anon INSERT. `record_touch` is `service_role`, `record_notice` is studio-gated. |
| Email to a dead/unsubscribed channel | No. `channelRefusesSend(channel.status)` still short-circuits in `_shared/send-email.ts:449`. |
| Forged unsubscribe crossing subjects | No. Tokens are HMAC-signed (`packages/notifications/src/tokens.ts`); the channel leg resolves an id, then writes by that row's own `value`. |
| `/pay` link broken by the backfill | No. 00636 writes `token_hash` before nulling `token`, and the expiry backfill sets active rows to `now() + 30d`. `parseInvoiceLink` rejects a null token, so no `/pay/null` ever reaches a clipboard or an `href`. |
| Reset failure | Not applicable; no migration was minted this round and the local DB replays clean. |

---

## 3. Findings

### M-1 — MAJOR (confidence: high)
**`apps/designer-portal/src/components/document/accounts/invoice-folio.tsx:781-784`**

The email-bounce recovery band's else-branch reads:

> "Email did not reach the client, and this invoice has no link yet. Regenerate link, above, mints one you can send them."

The first clause is false for every invoice the band is ever shown on, and it will be false
forever.

1. The band is mounted by `setShowClientFallback(!result.emailSent)` (line 256) and
   `setShowClientFallback(true)` (265) — both inside `doIssueAndSend`.
2. `doIssueAndSend` runs the `invoice-send` edge function, which calls `letterPortalUrl`
   → `ensureInvoiceLinkUrl` → **`ensure_invoice_link`**, and that RPC *mints* a link
   (`supabase/functions/_shared/invoice-links.ts:57`, `invoice-send/index.ts:266`). The
   mint happens before the send attempt, so by the time the band renders, an **active
   link row exists**.
3. The band takes the else-branch because `clientInvoiceUrl` is null — and since 00636,
   `get_invoice_link` returns `token: NULL` unconditionally, so `parseInvoiceLink`
   (`use-invoices.ts:1295`) rejects every row and `useInvoiceLink` is null for *every*
   invoice, forever. The hook's own doc comment says so in as many words: *"this hook
   answers 'no address to copy', never 'no link exists'"* (`use-invoices.ts:1306`).

So the surface renders "no address to copy" as "no link yet". The wave rewrote the second
half of this sentence in r4 and left the first half standing.

Worse, the sentence directs the designer to Regenerate, and the regenerate confirm panel a
few lines up says:

> "The old link stops working. Anyone who has it will see a dead page."

Two statements about the same record, on the same surface, one paragraph apart: there is no
link yet / the old link stops working. The designer acts on the first, and if the resend
later succeeds or the client already holds an emailed `/pay/<token>` from a prior send, the
regenerate silently kills the address the household is standing on — which is exactly the
outcome this band's copy told her could not happen.

*Fix:* say what is true — there is no address this surface can show you, and Regenerate
mints a fresh one that kills whatever address was already sent. For example:
`"Email did not reach the client. Patina cannot show you the address it already minted — only a fresh one can be handed out. Regenerate link, above, mints one you can send them, and the previously sent address stops working."`
Alternatively, distinguish "no row" from "no readable token" by having the folio ask
`hasLiveInvoiceLink` (already implemented in `_shared/invoice-links.ts:98` for
`create-checkout-session`) and gate the sentence on that.

---

### m-1 — MINOR (confidence: high)
**`apps/designer-portal/src/app/api/unsubscribe/route.ts` + `apps/designer-portal/src/app/preferences/unsubscribe/page.tsx`**

The third copy of the unsubscribe route/landing pair still drops `scope`. The route sets
only `status` and `type` on the redirect; the page prints
`We've unsubscribed you from ${humanize(outcome.type)} emails.` for any `ok` outcome. For
an `address`-scope write (the account-less recipient path,
`packages/notifications/src/unsubscribe.ts:184`) the actual write is
`update studio_contact_channels set status='unsubscribed' where value = <address>` across
every email-kind row and every studio — the whole mailbox — while the page names one
category.

r5 fixed the admin and client copies and explicitly scoped this one out. Graded **minor,
not major**, because no live sender currently routes an address-scope unsubscribe here:
`generateChannelUnsubscribeUrl` defaults to `https://admin.patina.cloud`, and the only
override, `digest-dispatcher`'s `DIGEST_BASE_URL` (which *does* default to
`https://app.patina.cloud`), passes `userId`, so it takes the account leg. It becomes a
major the first time an account-less sender passes `unsubscribeBaseUrl: DIGEST_BASE_URL`.

*Fix:* mirror the client-portal `outcomePage()` / `appliedCopy()` change, or lift the
renderer into `@patina/notifications` so there is one copy, not three.

---

### m-2 — MINOR (confidence: medium)
**`packages/supabase/src/hooks/use-invoices.ts` — `useRegenerateInvoiceLink.onSuccess`**

`onSuccess` now only does `queryClient.setQueryData(['invoice-link', invoiceId], link)`;
the `invalidateQueries` was removed in the r1 M-5 fix. That is correct in itself (an
invalidate would refetch `get_invoice_link`, which returns null, and erase the minted
address). But the designer-portal React Query defaults
(`apps/designer-portal/src/lib/react-query.ts`) are `staleTime: 5min` and
`refetchOnReconnect: true`, so a network blip or a remount more than five minutes after the
mint refetches that key anyway and the freshly minted address disappears from under Copy
with no explanation.

*Fix:* park the minted address outside the query cache (component state, or a separate key
with `staleTime: Infinity` / `gcTime` that the folio owns), so a refetch of the read query
cannot evict the one-time-emitted value.

---

### m-3 — MINOR (confidence: high) — report accuracy, never holds the gate
**`.../build/w4-paperwork-report.md` §1 and §4**

- §1 says the page calls `notFound()` on every miss and §4 says it "renders the portal's
  ordinary not-found page". Both are stale: r2 MAJOR-4 replaced that with a local
  `DeadLink()` returning a 200-status calm sheet
  (`apps/client-portal/src/app/paperwork/[token]/page.tsx`, `data-testid="paperwork-dead-link"`).
- §4 claims an e2e assertion greps the response body for a uuid shape and the raw token.
  No such assertion exists in `apps/client-portal/tests/paperwork-link.spec.ts`.

---

### m-4 — MINOR (confidence: high) — report accuracy
**All three report files: test counts**

Stated vs actual `it(`/`test(` blocks: `paperwork-model` 21 → **23**; `paperwork-sheet`
8 → **11**; `paperwork/[token]/page.test` 9 → **6**; `inbound-queue-band` 6 → **7**;
`paperwork-link-act` 8 → **11**; `seat-window-band` 7 → **9**; the vitest `people-crm-w4`
file 35 → **46** `it(` blocks (54 tests at runtime, with `it.each`).

---

### m-5 — MINOR (confidence: high) — comment accuracy
**`studios/help-system/scripts/people-help-content.ts:42-53` and `seed-people-help.ts` header**

- `people-help-content.ts:42-53` still states the twelve concept keys are NOT promoted to
  the canonical registry. Round 1 MAJOR-5 reversed that; all fifteen keys are in
  `packages/help-system/src/surfaceKeys.ts` and the designer mirror, and
  `surface-key-parity.test.ts` enforces it.
- `seed-people-help.ts`'s header names two constants that do not exist:
  `CallSheet.SiteAccess` and `CallSheet.BringForward`. The real identifiers are
  `CallSheetSiteAccess` and `CallSheetBringForward`.

---

### m-6 — MINOR (confidence: medium)
**`apps/designer-portal/src/components/document/people/people-format.ts` (`lastOpenDay`) and `packages/supabase/src/hooks/use-paperwork-links.ts` (`thirtyDaysOut`)**

Both derive a calendar day with `toISOString().slice(0,10)`, i.e. **UTC**, while r3
deliberately re-based `touchInstantDay` on `America/Chicago` via `Intl.DateTimeFormat` for
exactly this reason. The three surfaces sit next to each other: `PaperworkLinkAct` offers a
default expiry from `thirtyDaysOut(now)`, prints it back through `lastOpenDay(expiresAt)`,
and the grant row beside it prints minted/used through `touchInstantDay`. An evening press
in Chicago (after 19:00 CDT / 18:00 CST) offers and prints a day later than every
Chicago-based sibling on the same card.

*Fix:* route `thirtyDaysOut` and `lastOpenDay` through the same Chicago formatter
`touchInstantDay` uses.

---

### m-7 — MINOR (confidence: medium)
**`apps/client-portal/src/middleware.ts` vs `apps/client-portal/src/components/layout/app-chrome.tsx`**

`app-chrome.tsx` adds bare `'/paperwork'` to `PUBLIC_PREFIXES`, so the chrome treats
`/paperwork` (no token) as a nav-free public page. `middleware.ts` matches only
`pathname.startsWith('/paperwork/')`, so bare `/paperwork` falls through to the
authenticated branch and gets redirected to sign-in rather than the public handling the
chrome expects. This is the same asymmetry S-10 closed for `/pay`, which carries an
explicit `=== '/pay'` leg alongside its prefix test.

*Fix:* add the `=== '/paperwork'` leg to `isPaperworkPage`, matching the `/pay` precedent.

---

### m-8 — MINOR (confidence: low)
**`apps/client-portal/src/components/paperwork/paperwork-upload-form.tsx`**

The form's error message renders in a `<p role="status">` that is *conditionally mounted*
— it enters the DOM only when an error exists. Several screen readers do not announce a
live region that did not exist at the time of the change; the reliable pattern (which this
wave already used correctly for receipts in `paperwork-sheet.tsx`) is a persistently
mounted, empty region that is then filled. The sheet's persistent region carries receipts
only, not upload errors, so an upload failure may be silent for an assistive-tech user.

*Fix:* mount the error paragraph unconditionally with an empty string, as the sheet does.

---

### m-9 — MINOR (confidence: low)
**`apps/designer-portal/src/components/document/roster/seat-window-band.tsx`**

The band has no owner/admin held state with a visible reason — the R-BS household-band
shape that both close-seat surfaces implement (`held` + `disabled` on `DocumentAction`
plus a visible `*_HELD_SENTENCE` wired through `aria-describedby`). A non-owner who can see
the band gets a write that will be refused by RLS with a raw error rather than a held act
that says why up front. `InboundQueueBand` in the same wave does this correctly for its
reject act.

---

### m-10 — MINOR (confidence: low)
**`supabase/migrations/00637_*.sql` — `resolve_paperwork_link` vs `compliance_state`**

`resolve_paperwork_link` excludes retired documents with a flat
`superseded_by IS NULL`, while `compliance_state` (R-BF) walks supersession transitively.
For a chain A → B → C where B is itself superseded, the two reducers give different answers
to "what does this firm hold": the guest page can show a document the designer's own
compliance band has already retired. No correctness consequence found for the current data
shape (chains longer than one hop are not produced by any current write path), so this is a
divergence to close rather than a live defect.

---

### m-11 — MINOR (confidence: medium)
**`packages/supabase/src/hooks/use-touches.ts:323-333`**

`touchKeys.list()` sorts and Boolean-filters `subjectIds` but does not dedupe, while
`useTouches`'s `queryFn` dedupes via `new Set(...)`. `['a','a']` and `['a']` are therefore
two cache entries backed by one identical network read — a duplicated fetch and a stale
half. No current caller passes duplicates, so the effect is latent.

*Fix:* `[...new Set(...)].sort()` in the key builder.

---

### m-12 — MINOR (confidence: medium)
**`apps/designer-portal/src/components/document/people/company-card.tsx:258`**

`today = new Date()` as a default parameter is re-evaluated on every render, so the
`useMemo` at 404-409 (`firmEngagementWindowEnd(allSeats ?? [], firmId, today)`) has a
dependency that changes every render and never memoizes; same for `paperHeldClause(docs, today)`
at 534 and `chaseTargetDocument(docs, today)` at 551. No hydration risk — `CompanyCard` is
only mounted after `openFirm` is set by a click (`people-room.tsx:525`), so it never renders
on the server pass — but the memo is doing nothing it was written to do.

*Fix:* `const today = useMemo(() => todayProp ?? new Date(), [todayProp])`.

---

### m-13 — MINOR (confidence: high) — context, not a W4 defect
**`apps/client-portal` type-check is RED, pre-existing**

`pnpm --dir apps/client-portal type-check` fails with
`.next/types/app/page.ts(37,29): error TS2344`. Root cause:
`apps/client-portal/src/app/page.tsx` declares `export default async function HomePage(props?: {...})`,
whose optional props argument does not satisfy the generated `PageProps` constraint. That
file was last touched in `7ff6c085d`, which predates W4's base `0f671b149`, and rounds r2–r5
measured the same failure. Not attributable to this wave; recorded so the gate tail below
is not read as a W4 regression.

---

## 4. Convention checks — passed

- **`@patina/supabase` hooks, canonical keys, complete invalidations.** All five new/changed
  hook modules export a `*Keys` object with an `all` prefix and build list keys under it, so
  `invalidateQueries({queryKey: X.all})` prefix-matches. Verified end to end for the one
  fan-out the wave newly depends on: `useUpdateProjectParty.onSuccess` invalidates
  `peopleSeatKeys.all` = `['people-directory-seats']`, which prefix-matches
  `usePeopleSeats({all:true})`'s `peopleSeatKeys.list(filters)`, and the
  `people_directory_seats` view does carry `on_site_from`/`on_site_to`
  (`00626_people_directory_v4_seats.sql:2118-2119`), so a `SeatWindowBand` write refreshes
  the `firmEngagementWindowEnd` the paperwork act offers from. `useRecordNotice` invalidates
  `touchKeys.all`, refreshing `LastTouchLine`.
- **Hooks above early returns + hydration gate.** `InboundQueueBand` calls
  `useInboundDocuments` before its `return null`; `LastTouchLine` calls `useLastTouch`
  before its early return; `PaperworkLinkAct` and `SeatWindowBand` call every hook
  unconditionally. No `new Date()` crosses an SSR boundary (see m-12).
- **`@patina/types`.** No domain type redefined; the new row shapes are hook-local DB-row
  interfaces, consistent with the rest of `packages/supabase/src/hooks`.
- **`ui/controls` + design-system.** `apps/client-portal` has no `components/ui/` folder;
  the paperwork form uses `Button` from `@patina/design-system`. In
  `apps/designer-portal/src/components/document/people`, raw `<input>` with the local
  `FIELD` class is the established precedent — `access-grant-list.tsx`,
  `close-seat-act.tsx`, `company-card.tsx`, `party-profile-sheet.tsx`,
  `reach-access.tsx` and `record-document-sheet.tsx` all predate W4 and do it — so the new
  `paperwork-link-act.tsx` and `inbound-queue-band.tsx` following it is not a deviation.
- **Analytics via `people-events.ts`.** `PaperworkLinkAct` emits
  `peopleEvents.grantMinted({tier:'paperwork_link', expiry_source: …})`; no direct
  `posthog.capture` in any new file.
- **Document grammar / DocSheet / `aria-disabled` not `disabled`.** `DocumentAction`'s
  `held` + `disabled` renders `aria-disabled="true"` and keeps focus via
  `disabled={unavailable && !held}`. The reject act in `inbound-queue-band.tsx` uses
  `held={!reasonWritten}` with a visible `REJECT_HELD_SENTENCE` wired through
  `aria-describedby={heldId}`. Two-step confirms on every destructive designer act
  (regenerate, revoke, reject, close). `ScoredAction` used in the client portal.
- **dist rebuilds.** `@patina/help-system` rebuilt (ESM + CJS + DTS, green).
  `@patina/supabase` has no build script — nothing to rebuild there.
- **Playwright.** Both e2e specs are chromium-pinned, contain no `waitForTimeout`, and use
  `await expect.poll(...)` for DB assertions (written across lines, which is why a
  single-line grep reads zero).

### Paperwork route checks — passed
- No nav: `'/paperwork'` in `app-chrome.tsx`'s `PUBLIC_PREFIXES`; `middleware.ts` puts
  `/paperwork/` in both the no-store/noindex bearer block and `isPublicPage` (but see m-7
  for the bare-path asymmetry).
- No homeowner data: the page renders only `context.company_name`, the studio name, and the
  firm's own compliance rows. `resolve_paperwork_link` returns no household column.
- No caveat/schema words: `paperwork-model.ts`'s vocabulary is `documentTitle`,
  `blockWords`, `rowSentence`; no "COI", "schema", "caveat", "RLS", "row" in rendered copy.
- Mobile-first, keyboard-reachable, errors say what to do: single-column, `aria-required`
  never bare HTML `required`, `aria-disabled` on the sending submit with a re-entry guard,
  ids slugged from `fieldPrefix` so labels bind, focus moved to the receipt paragraph on
  success.
- Every new client-portal file ships with its test: `paperwork-model.ts`,
  `paperwork-sheet.tsx`, `paperwork-upload-form.tsx` and `app/paperwork/[token]/page.tsx`
  each have a sibling `__tests__` file (see the added-file list in §5).

### Help checks — passed
Fifteen new surface keys present in both `packages/help-system/src/surfaceKeys.ts` and
`apps/designer-portal/src/lib/help-system/document-surface-keys.ts`, guarded by
`surface-key-parity.test.ts`. Validator output in §5: 18 docs, zero missing keys, zero
em-dashes, zero duplicate or nondeterministic `_id`s, zero cap violations. `_id`s are
`helpContent.<dash-doubled surfaceKey>`. Seed script is dry-run by default (`--commit`
required to write); no commit was run.

---

## 5. Gate tails

### designer-portal type-check
```
$ pnpm --dir apps/designer-portal type-check
> designer-portal@0.1.0 type-check
> tsc --noEmit
(no output)
```

### client-portal type-check — PRE-EXISTING RED (see m-13)
```
$ pnpm --dir apps/client-portal type-check
> client-portal@0.1.0 type-check
> tsc --noEmit
.next/types/app/page.ts(37,29): error TS2344: Type 'typeof import(".../apps/client-portal/src/app/page")' does not satisfy the constraint 'AppPageConfig<"/">'.
 ELIFECYCLE  Command failed with exit code 1.
```

### @patina/supabase type-check
```
$ pnpm --filter @patina/supabase type-check
> @patina/supabase@0.1.0 type-check
> tsc --noEmit
(no output)
```

### @patina/help-system type-check
```
$ pnpm --dir packages/help-system type-check
> @patina/help-system@0.1.0 type-check
> tsc --noEmit
(no output)
```

### admin-portal build (after shared edits)
Ran with the OS sandbox disabled — under macOS Seatbelt the webpack child worker is killed
silently and the build exits 0 with no route table and no `BUILD_ID`, which is
environmental, not a product failure.
```
$ pnpm --dir apps/admin-portal build
Route (app)                                   Size  First Load JS
...
ƒ /preferences/unsubscribe                     ...
...
EXIT=0
```

### client-portal jest with coverage
```
$ pnpm --dir apps/client-portal exec jest --coverage
Test Suites: 156 passed, 156 total
Tests:       2555 passed, 2555 total

File                          | % Stmts | % Branch | % Funcs | % Lines
------------------------------|---------|----------|---------|--------
All files                     |   77.29 |    73.01 |   77.01 |   79.66
 src/app/paperwork/[token]     |   95.00 |   100.00 |  100.00 |  100.00
 src/components/paperwork      |   98.92 |    91.13 |   96.96 |   99.37
 src/app/api/unsubscribe       |  100.00 |    90.90 |  100.00 |  100.00
 src/app/preferences/unsubscribe |  78.26 |  81.81 |  100.00 |   85.71
```
Floor is 70 / 60 / 70 / 70. **Holds** on all four axes with headroom.

### designer-portal jest (16 W4-touched suites)
```
Test Suites: 16 passed, 16 total
Tests:       300 passed, 300 total
```

### @patina/supabase vitest (3 W4 files)
```
Test Files  3 passed (3)
     Tests  149 passed (149)
```

### help content validator (dry run)
```
count 18
missing keys: []
em-dashes 0  en-dashes 0
dup ids 0
nondeterministic ids 0
cap violations []
dup triples 0
```

### New client-portal files (added since 0f671b149)
```
A apps/client-portal/src/app/api/unsubscribe/__tests__/route.test.ts
A apps/client-portal/src/app/paperwork/[token]/__tests__/page.test.tsx
A apps/client-portal/src/app/paperwork/[token]/page.tsx
A apps/client-portal/src/app/preferences/unsubscribe/__tests__/page.test.tsx
A apps/client-portal/src/components/paperwork/__tests__/paperwork-model.test.ts
A apps/client-portal/src/components/paperwork/__tests__/paperwork-sheet.test.tsx
A apps/client-portal/src/components/paperwork/__tests__/paperwork-upload-form.test.tsx
A apps/client-portal/src/components/paperwork/paperwork-model.ts
A apps/client-portal/src/components/paperwork/paperwork-sheet.tsx
A apps/client-portal/src/components/paperwork/paperwork-upload-form.tsx
```

---

## 6. Notes

- No production mutation of any kind was performed: no `db push`, no `functions deploy`, no
  secrets set. No migration was minted. No `.env.local` was created.
- No server was started, so the port rule's kill branch never applied. Ports 3000 and 3002
  are held by `next dev` processes whose cwd is under this worktree (this program's own
  orphans); they were left alone.
- Everything ruled in `artifacts/people-room-crm-2026-09-11/rulings.md` §3 was treated as
  settled and is not reported.
