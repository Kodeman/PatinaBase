# W4 — adversarial code review, round 8 (surfaces + help)

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`.
Scope: `apps/client-portal/src`, `apps/designer-portal/src`,
`packages/supabase/src/hooks`, `packages/help-system/src`,
`studios/help-system/scripts`, plus the three surface reports
(`w4-paperwork-report.md`, `w4-studio-report.md`, `w4-help-report.md`)
and the prior fix log `w4-fix-log-r7.md`.

**Verdict: NOT CLEAN — 0 blocking, 2 major, 16 minor.**

Every ruling in `rulings.md` §3 is treated as settled and is not a finding.
MAJOR-2 below is not a dispute of R-BV; it is the interaction between R-BV and
R-BW, and the fix named there satisfies both.

---

## 1. Prior-round re-check (`w4-review-r7-code.md`)

| r7 | What it said | r8 status |
|---|---|---|
| MAJOR-1 | R-BV: the minted invoice address must live in folio state, not the cache | **FIXED.** `invoice-folio.tsx:146` holds `minted`, keyed by invoice id (`:318`); `invalidateInvoiceEffects` is `void invoiceId` with the `['invoice-link', id]` leg deleted (`use-invoices.ts:397-420`); `invoice-folio-minted-address.test.tsx` runs the real hook and asserts `readsAfterSend === readsBeforeSend` |
| MAJOR-2 | R-BU: an unchecked upload must not read `current` (or `not on file`) beside its own receipt | **FIXED ON RELOAD, OPEN IN SESSION.** 00637 groups by type and `awaiting_check` is a state; `paperwork-model.ts` prints "not yet checked". But nothing re-reads after a send — see **MAJOR-1** this round |
| MAJOR-3 | R-BT: cancel must not rotate; a spent nonce must land readable | **FIXED.** `invoice-checkout-driver.ts` returns `invoiceLinkUrl(CLIENT_PORTAL_URL, token)` for `cancelled`; `resolve_invoice_return_nonce` claims `return_nonce_consumed_at` in one UPDATE and answers jsonb; `pay/return/[nonce]/route.ts:111-119` 303s a spent nonce to `/pay/used` |
| MAJOR-4 | A refused document must reach the firm with the studio's reason | **FIXED.** `PaperState` carries `refused`; `reasonSentence()`; `paperwork-sheet.tsx:105-112` prints it and re-opens the form; covered by `paperwork-sheet.test.tsx` |
| m-1 | designer-portal unsubscribe landing is not scope-aware | **OPEN** → m-1 |
| m-2 | paperwork report §1 claims `notFound()` | **OPEN** → m-2 |
| m-3 | paperwork report §4 claims an e2e uuid/token body grep | **OPEN** → m-3 |
| m-4 | test counts in the surface reports do not match the suites | **OPEN** → m-4 |
| m-5 | help script comments are stale / name non-existent keys | **OPEN** → m-5 |
| m-6 | UTC day arithmetic where the studio clock is America/Chicago | **OPEN** → m-6 |
| m-7 | middleware has no bare `/paperwork` leg | **OPEN** → m-7 |
| m-8 | upload-form error paragraph is `role="status"`, unmounted, undescribed | **OPEN** → m-8 |
| m-9 | seat-window held state for a viewer without rights | **CLOSED** (informational in r7; `record_notice` gates on `is_active_studio_member`) |
| m-10 | 00637 flat supersession vs `compliance_state`'s recursive walk | **OPEN** → m-9 |
| m-11 | `touchKeys.list()` does not sort/dedupe | **PARTIAL** — it sorts and filters now (`use-touches.ts:327`); no dedupe → m-10 |
| m-12 | `today = new Date()` default parameter | **OPEN** → m-11 |
| m-13 | client-portal type-check RED, pre-existing | **OPEN (context)** → m-12 |
| m-14 | `use-coordination.ts:722` calls `project_consent_org` | **CLOSED — not a defect.** R-BD retires `project_consent_org()` as a *tenant* resolver ("every tenant resolution for a project uses `project_tenant_org()`"). These call sites resolve which org owns the CONSENT record, and 00621 makes `channel_consent_status(project_consent_org(...))` the canonical pair for exactly that (`00621:89,104,154,190`) |
| m-15 | posthog comment says "all six", regex covers seven | **OPEN** → m-13 |
| m-16 | the paperwork rate-limit gate fails open, unremarked | **CLOSED — accepted.** It is now remarked as a decision in the page docblock: "An unreadable limiter lets the request through — this is friction on guessing, not the credential." |
| m-17 | seat-window band emits no analytics | **OPEN and WIDENED** → m-14 |

---

## 2. Blocking criteria — none met

| Criterion | Evidence |
|---|---|
| A token accepted without verification | `paperwork/[token]/page.tsx` gates on `/^[0-9a-f]{64}$/` before any DB call; `resolve_paperwork_link` matches on the sha256 hash and filters revoked/expired rows; `pay/return/[nonce]` gates the same shape and resolves through the SECURITY DEFINER RPC only |
| A verified document overwritten | 00637's upload path inserts an inbound row; nothing UPDATEs a confirmed `studio_compliance_documents` row from the firm's door. `refused`/`awaiting_check` are states on the read, not writes over the record |
| Cross-tenant read/write | The token is keyed to `(organization_id, company_id)`; every CTE in `resolve_paperwork_link` joins from the resolved link row. `paperwork-upload/core.ts` resolves studio + firm FROM THE TOKEN, never from the request body |
| RLS / grant / storage-policy hole | No grant, policy or RLS statement changed in the surfaces under review this round; 00637's function is SECURITY DEFINER with a pinned `search_path` |
| Email to a dead or unsubscribed channel | R-BY's guard stands: `invoice-reminders` / `invoice-send` hold rather than ship on a live attempt; `letterPortalUrl` falls back to `${baseUrl}/?invoice=<id>` (a real door-gate route) instead of a dead `/invoices/<id>` |
| Forged unsubscribe crossing subjects | `applyUnsubscribeToken` is unchanged; the client route forwards `scope` without widening it |
| A `/pay` link broken by the backfill | `payToken: string | null` is threaded through `commercial-documents.ts`; `door-gate.tsx` falls back to `/?invoice=<id>` when the token is null. `/pay/<token>` addresses already sent are untouched by 00636 (the row is the same; only the plaintext column is frozen) |
| Reset failure | Local replay green; migration numbers on this branch are above the reserved 00595–00620 band (00621–00637) |

---

## 3. Findings

### MAJOR-1 — the firm's page contradicts itself the moment it is used (confidence: high)
**`apps/client-portal/src/components/paperwork/paperwork-sheet.tsx:32,82-123`**

`rows` is `useMemo(() => buildPaperworkRows(context), [context])`, and `context`
is a prop of the server-rendered page. There is no `router.refresh()`, no
revalidate, no refetch anywhere under `src/components/paperwork/` or
`src/app/paperwork/` (grep for `router|refresh|revalidate` returns nothing). A
send therefore changes local state only:

```tsx
const isReceived = row.state !== 'refused' && (received[row.key] === true || row.awaitingCheck);
...
<p className="type-body text-[var(--text-primary)]">{row.sentence}</p>
...
{isReceived && (<p ... data-paperwork-receipt={row.key}>{receiptSentence}</p>)}
```

So on the primary path — a `not_on_file` row whose form opens itself, the firm
attaches the W-9, the upload succeeds — the page renders:

> **W-9 is not on file.**
> Received. Local Dev Studio will confirm it.

Two sentences about one document, one paragraph apart, disagreeing. That is
verbatim the defect r7 MAJOR-2 raised ("it read 'Licence is not on file.'
beside the same receipt — a second disagreement about the same paper"), and
`paperwork-model.ts:258-265` claims it fixed. It did not: R-BU changed what the
DATABASE says on the next load. It did not change what this page says during
the visit in which the firm actually acts, which is the only visit most firms
make.

The model already mints the right sentence — `rowSentence('awaiting_check',
title, null)` → "W-9, not yet checked." — so the fix is local: `markReceived`
should move the row to `awaiting_check` (state, sentence, `blocksSentence`
recomputed) rather than only flagging a receipt.

The existing test locks the gap in rather than catching it:
`paperwork-sheet.test.tsx:166` ("swaps a sent form for the receipt sentence")
clicks `Send W-9` and asserts the receipt appears and the form is gone. It never
asserts what the row's own sentence says, so
`getByText('W-9 is not on file.')` still passes after the click. The r7 test at
`:62` passes `state: 'awaiting_check'` in from the server — the reload path, not
the send path.

**Fix**: on `markReceived(key)`, replace the row (or overlay it) with the
`awaiting_check` reading, and extend the send test to assert the sentence
changes.

---

### MAJOR-2 — the invoice recovery band tells the designer there is no link, on the one path where there always is one (confidence: high)
**`apps/designer-portal/src/components/document/accounts/invoice-folio.tsx:109,327-331,835-839`**
**`packages/supabase/src/hooks/use-invoices.ts:397-420,1358-1362`**

R-BW made the bounce band branch on link EXISTENCE and the clock:

```tsx
const linkIsLive = invoiceLinkIsLive(invoiceLink);
const linkHasExpired = !linkIsLive && invoiceLink?.status === 'active';
```

`invoiceLink` comes from `useInvoiceLink(invoiceId)` (`:109`), whose key is
`['invoice-link', invoiceId]`. **Nothing invalidates that key any more.** R-BV
deleted the only invalidation (`invalidateInvoiceEffects` is now `void
invoiceId;`), and a grep for `'invoice-link'` across `packages/supabase/src` and
`apps/designer-portal/src` finds exactly one producer (the query itself) and
zero invalidations — the remaining hits are comments and a test asserting the
absence. Designer-portal query defaults are `staleTime: 5min`,
`refetchOnWindowFocus: false` (`lib/react-query.ts:177-194`), and the band is a
state change inside a mounted folio, so there is no remount to refetch on
either.

The failure is on the band's own primary path. `doIssueAndSend` (`:244-281`) and
`doResend` (`:283-304`) are the two callers that set `showClientFallback`, and
**neither sets `minted`** — only `doRegenerateLink` does (`:352`). So
`clientInvoiceUrl` is null and the band falls into the else branch, which reads
`invoiceLink` as it was fetched **before** the send. For a draft invoice with no
link — the common case, since the folio is usually opened to issue it — that
value is null, so:

- `linkIsLive` = false, `linkHasExpired` = false → the band prints
  *"Email did not reach the client, and this invoice has no live link.
  Regenerate link, above, mints one you can send them."*
- but `invoice-send` mints a link before it attempts the send, which the file's
  own comment at `:829-834` states as the reason the three-way sentence exists:
  *"the band is mounted from `doIssueAndSend`, and `invoice-send` mints a link
  before it attempts the send — so a link always existed"*.

The band is asserting the opposite of the record it is describing, at the moment
the designer is deciding what to do about a household that did not get its
invoice. That is r6 M-1 restored — this time by a stale read rather than a wrong
branch.

This is not a challenge to R-BV. R-BV's parenthetical premise — "post-00636
that refetch can only ever parse to null" — is true of the TOKEN and false of the
ROW, and R-BW is what made the row load-bearing. Both rulings hold if the band's
read is refreshed without the address riding along, which 00636 guarantees
(`get_invoice_link` answers `token: NULL` forever). Two fixes satisfy both:

1. have `useSendInvoice` / `useIssueInvoice` invalidate `['invoice-link', id]`
   (the refetch cannot carry an address); or
2. have `doIssueAndSend` / `doResend` seed the band from the send result the way
   `doRegenerateLink` seeds `minted`.

A test belongs with it: the current `invoice-folio-minted-address.test.tsx`
proves there is no refetch after a send, which is exactly the behaviour that
breaks the band.

---

### m-1 — MINOR (confidence: medium)
**`apps/designer-portal/src/app/preferences/unsubscribe/page.tsx`,
`apps/designer-portal/src/app/api/unsubscribe/route.ts`**

The client-portal pair forwards `scope` and `appliedCopy()` branches on
`scope === 'address'`; neither designer-portal file mentions `scope` at all
(grep: zero hits). A scoped unsubscribe therefore reads as a total one on that
portal. Carried from r6/r7, unchanged.

### m-2 — MINOR (confidence: high) — report accuracy, never holds the gate
**`artifacts/people-room-crm-2026-09-11/build/w4-paperwork-report.md:21`**

Still says the route calls `notFound()` on every miss. It renders a local
`DeadLink()` at HTTP 200 with `data-testid="paperwork-dead-link"` — which is the
better behaviour and which the spec's own NOTE (`paperwork-link.spec.ts:197-205`)
explains. The report is wrong about its own code.

### m-3 — MINOR (confidence: high) — report accuracy
**`w4-paperwork-report.md:86-93`**

Two false claims in one paragraph. (a) "An e2e assertion greps the rendered body
for a uuid shape and for the raw token" — `tests/paperwork-link.spec.ts` contains
no such assertion; its only `uuid` mention (`:284`) is about the storage key. (b)
"A dead door … renders the portal's ordinary not-found page" — it renders this
page's own dead sheet, which the same spec's NOTE says was the point of W4 r2
MAJOR-4. The report contradicts both the code and the spec it ships with.

### m-4 — MINOR (confidence: high) — report accuracy
**All three surface reports**

Counts measured this round: designer component suites — inbound-queue-band **7**
(report: 6), paperwork-link-act **11** (report: 8), touch-line 3 (report: 3),
seat-window-band **9** (report: 7); `packages/supabase` `people-crm-w4.test.ts`
**54** (report: 35); designer full jest **599 suites / 7 779 tests** (report:
598 / 7 754). The drift is rounds of fixes adding tests without the reports
being re-measured.

### m-5 — MINOR (confidence: high) — comment and report accuracy
**`studios/help-system/scripts/people-help-content.ts:42-53`,
`studios/help-system/scripts/seed-people-help.ts:5-7`,
`w4-help-report.md` §3**

Three stale statements about the same fact. (a) `people-help-content.ts` still
says the concept keys "are NOT promoted to named constants in
`packages/help-system/src/surfaceKeys.ts` — this wave's scope named exactly three
new registry keys". They are promoted, in both registries (validator this round:
0 missing canonical, 0 missing mirror). (b) `seed-people-help.ts` names
`CallSheet.SiteAccess` and `CallSheet.BringForward`, which exist in neither
registry (the real constants are `CallSheetSiteAccess`, `CallSheetBringForward`).
(c) `w4-help-report.md` §3 opens "exactly 3 new keys were added" (against §1's
"+15") and still carries the superseded paragraph — "this wave's word/concept
keys do not [register], since promoting them wasn't in scope" — immediately below
the paragraph that corrects it.

Help content itself is clean: all 17 distinct surfaceKeys exist in
`surfaceKeys.ts` and in the designer mirror, every body is within the schema
caps, `_id`s are deterministic and unique, no duplicate
`(surfaceKey, contentType, persona)` triple, and no em-dashes.

### m-6 — MINOR (confidence: medium)
**`apps/designer-portal/src/components/document/people/people-format.ts:64`,
`packages/supabase/src/hooks/use-paperwork-links.ts:103,135`,
`apps/designer-portal/src/components/document/people/paperwork-link-act.tsx:144`**

All still compute the studio's day in UTC (`toISOString().slice(0, 10)`) where
the studio clock is `America/Chicago` — the pattern `touchInstantDay` already
establishes in `use-touches.ts`. `` expiresAt: `${chosenDay}T23:59:59Z` ``
additionally shuts the paperwork door at ~18:00 Chicago on the day the designer
named, so a firm told "open through Friday" finds it closed on Friday evening —
against R-AD, which has the studio naming the door's end date.

### m-7 — MINOR (confidence: medium)
**`apps/client-portal/src/middleware.ts:150` vs
`apps/client-portal/src/components/layout/app-chrome.tsx`**

`isPaperworkPage` is `startsWith('/paperwork/')` only; `isPayPage` (`:142`)
carries both `pathname === '/pay'` and the prefix, and `app-chrome.tsx` matches
the bare `'/paperwork'` too. A bare `/paperwork` request therefore renders
chrome-free but without the no-store/noindex headers.

### m-8 — MINOR (confidence: low)
**`apps/client-portal/src/components/paperwork/paperwork-upload-form.tsx`**

The error paragraph is conditionally mounted rather than a persistent live
region, is `role="status"` rather than `role="alert"`, and the file input carries
no `aria-describedby` pointing at it. The sheet's own live region
(`paperwork-sheet.tsx:73-75`) is the pattern to copy.

### m-9 — MINOR (confidence: low)
**`supabase/migrations/00637_paperwork_upload_door.sql`**

`resolve_paperwork_link`'s `held` CTE filters `superseded_by IS NULL` flat, where
`compliance_state` walks the supersession chain recursively (R-BF). A two-hop
chain can read differently on the firm's face and the studio's. (The lapse gate,
`cardinality(blocks) > 0`, is identical in both — not a finding.)

### m-10 — MINOR (confidence: low)
**`packages/supabase/src/hooks/use-touches.ts:323-330`**

`touchKeys.list()` now filters and sorts `subjectIds` (fixing half of r7 m-11)
but does not dedupe, while `useTouches` does. `['a','a','b']` and `['a','b']`
still occupy two cache entries for one logical query.

### m-11 — MINOR (confidence: medium)
**`apps/designer-portal/src/components/document/people/company-card.tsx:258`**

`today = new Date()` as a default parameter mints a fresh identity every render
and defeats the downstream `useMemo`.

### m-12 — MINOR (confidence: high) — context, not a W4 defect
**`apps/client-portal` type-check**

RED, and pre-existing:

```
.next/types/app/page.ts(37,29): error TS2344: Type '{ searchParams?: Promise<Record<string, string | string[] | undefined>> | undefined; } | undefined' does not satisfy the constraint 'PageProps'.
  Type 'undefined' is not assignable to type 'PageProps'.
```

`apps/client-portal/src/app/page.tsx` was last touched in `7ff6c085d`
(2026-09-07), an ancestor of the W4 base `0f671b149`, and declares
`props?: { searchParams?: … }`. `.next/types/app/paperwork/[token]/page.ts`
exists, so the new route is inside the type-check's reach and contributes no
error of its own. W4 did not cause this and cannot be held on it, but the gate
cannot go green until someone drops the `?` on that root page's props.

### m-13 — MINOR (confidence: high) — comment accuracy
**`apps/client-portal/src/lib/analytics/posthog.ts:81`**

`HEX_BEARER_IN_URL` covers seven prefixes
(`share|rfq|evidence|plans|pay|trade|paperwork`); the comment above it still says
"one generic pattern covers all six". The redaction itself is correct.

### m-14 — MINOR (confidence: medium)
**`apps/designer-portal/src/components/document/roster/seat-window-band.tsx`,
`apps/designer-portal/src/components/document/people/inbound-queue-band.tsx`**

Neither emits through `people-events.ts`, while their neighbours do
(`notice-log.tsx` → `peopleEvents.siteAccessChanged`, `paperwork-link-act.tsx` →
`peopleEvents.grantMinted({tier:'paperwork_link'})`). `PEOPLE_EVENT_NAMES` holds
twelve names and none covers a notice, a window move, or a document
confirm/reject. The studio report discloses the confirm/reject half as decision
S-9 ("**Owed if Fable wants the rate of refusals measured**"); the seat-window
half — the act that changes who may be on site — is not disclosed anywhere. So
the two acts with the most operational consequence in this wave are the two
invisible in the funnel.

### m-15 — MINOR (confidence: low) — gate integrity, not a product defect
**`apps/admin-portal` build**

Under the default heap, `pnpm --dir apps/admin-portal build` **exits 0 after
dying in compile**: no `BUILD_ID`, `.next/` holding only
`cache/diagnostics/package.json/trace/types`, and
`.next/diagnostics/build-diagnostics.json` reading `{"buildStage":"compile"}`.
It completes only with `NODE_OPTIONS=--max-old-space-size=8192` (verified: full
route table, `BUILD_ID=D1yRIZfKurnlUxzp-V_Uw`). Anyone running this gate the
obvious way gets a green that proves nothing. Worth pinning the heap in the
script before W7 leans on it.

### m-16 — MINOR (confidence: low)
**designer-portal jest, full run**

One unidentified suite failed in 1 of 4 full runs this round (that run counted
7 767 tests against 7 779 in the other three, with no `✕` — a suite that failed
to complete rather than an assertion). Three consecutive re-runs were clean. Not
reproducible enough to name, but a flaky suite in the wave's own gate is worth a
watch.

---

## 4. Convention checks

| Rule | Result |
|---|---|
| `@patina/supabase` hooks, canonical keys | Pass — `touchKeys`, `paperworkLinkKeys`, `inboundDocumentKeys`, `accessGrantKeys`, `complianceKeys` all factory-shaped |
| Complete invalidations | **One hole** — `['invoice-link', id]` has no invalidator (MAJOR-2). Everything else fans out: mint → `paperworkLinkKeys.forCompany` + `accessGrantKeys.all`; inbound → `invalidateComplianceFanout` + `complianceKeys.all`; notice → `touchKeys.all` |
| Hooks above early returns, hydration gate | Pass — checked every new/changed component in both portals |
| `@patina/types` | Pass — no local redefinition of a shared domain type |
| `ui/controls` + design-system | Pass in the client portal and in `paperwork-link-act` / `inbound-queue-band`; `seat-window-band.tsx` uses raw `<button>`/`<input>` (pre-existing style in the roster, not raised) |
| Analytics via `people-events.ts` | **m-14** |
| Document grammar, DocSheet | Pass — inline act panels, one at a time, never modal-on-modal |
| `aria-disabled` not `disabled` for held acts | Pass — `DocumentAction` keeps `disabled={unavailable && !held}` with `heldMark`; `paperwork-link-act` held-with-`aria-describedby`; `paperwork-upload-form` uses `aria-disabled` while sending |
| Two-step confirms, PR-n gating | Pass — inbound confirm/reject and regenerate all carry a confirm panel; reject requires a reason and `REJECT_HELD_SENTENCE` holds it |
| dist rebuilds | `packages/help-system` rebuilt (ESM + CJS + DTS); `packages/supabase` type-check clean |
| Playwright chromium-pinned, no `waitForTimeout`, `expect.poll` for DB | Pass — `tests/paperwork-link.spec.ts` names `--project=chromium`, contains no `waitForTimeout` |
| Paperwork page: no nav, no homeowner data, no caveat/schema words, mobile-first, keyboard-reachable, errors say what to do | Pass — `[data-portal-shell="public"]`, `getByRole('navigation')` count 0, no ids/paths/names in the RPC's answer, no "removed/suspended/terminated" copy, labelled inputs with `aria-required`, focus moved to the receipt after a send |
| Every new client-portal file ships with its test | Pass — `paperwork/[token]/page`, `paperwork-sheet`, `paperwork-model`, `paperwork-upload-form`, `pay/used/page`, `api/unsubscribe/route`, `preferences/unsubscribe/page`, `commercial-documents`, `door-gate`, `letterbox` all have suites |
| Help: every surface key in `surfaceKeys.ts` AND the mirror, lengths within caps, deterministic `_id`s, no em-dashes | Pass (see m-5 for the stale prose about it) |

---

## 5. Gates

### client-portal jest + coverage
```
All files                          |   77.29 |    73.08 |   77.03 |   79.67 |
 src/app/api/unsubscribe           |     100 |     90.9 |     100 |     100 |
 src/app/paperwork/[token]         |      95 |      100 |     100 |     100 |
 src/app/pay/used                  |      60 |      100 |     100 |     100 |
 src/app/preferences/unsubscribe   |   78.26 |    81.81 |     100 |   85.71 |
 src/components/paperwork          |   97.88 |    91.39 |   97.05 |   98.74 |
  paperwork-model.ts               |   97.67 |    89.65 |     100 |   98.55 |
  paperwork-sheet.tsx              |   97.22 |      100 |     100 |   96.87 |
  paperwork-upload-form.tsx        |    98.5 |    91.66 |   88.88 |     100 |

Test Suites: 157 passed, 157 total
Tests:       2563 passed, 2563 total
Snapshots:   1 passed, 1 total
```
Floor 70 / 60 / 70 / 70 — **holds** (77.29 / 73.08 / 77.03 / 79.67). EXIT=0.

### type-checks
```
=== apps/designer-portal ===   EXIT=0   (tsc --noEmit, no output)
=== apps/client-portal ===     EXIT=1
.next/types/app/page.ts(37,29): error TS2344: Type '{ searchParams?: Promise<Record<string, string | string[] | undefined>> | undefined; } | undefined' does not satisfy the constraint 'PageProps'.
  Type 'undefined' is not assignable to type 'PageProps'.
=== packages/supabase ===      EXIT=0
=== packages/help-system ===   EXIT=0
```
The client-portal failure is m-12 — pre-existing on the W4 base, not a W4 defect.

### admin-portal build (after shared edits)
```
├ ƒ /users/[id]
├ ○ /verification
└ ○ /waitlist

ƒ Proxy (Middleware)
○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand

PIPE_STATUS=0        BUILD_ID=D1yRIZfKurnlUxzp-V_Uw
```
Run with `NODE_OPTIONS=--max-old-space-size=8192` — see m-15 for why the default-heap
run exits 0 without building.

### designer-portal jest
```
Test Suites: 599 passed, 599 total
Tests:       7779 passed, 7779 total
```
(W4 paths alone: 55 suites / 797 tests.) See m-16 for the one-in-four flake.

### packages/supabase vitest (W4 hook suites)
```
 ✓ src/hooks/__tests__/use-invoices.test.ts            (64 tests)
 ✓ src/hooks/__tests__/people-crm-foundation.test.ts   (35 tests)
 ✓ src/hooks/__tests__/people-crm-w4.test.ts           (54 tests)

 Test Files  3 passed (3)
      Tests  153 passed (153)
```

### help registry validator + dry run
Canonical `surfaceKeys.ts` and the designer mirror: **0 missing** in either
direction across all 17 content surfaceKeys. Caps, uniqueness and `_id`
determinism verified against the JSON. Dry run re-read from the wave's own log:
`[W4-help] dry-run: 18 written, 0 errored`; no `--commit`, nothing written to
Sanity.

### Not run / not permitted
No `db push`, no `functions deploy`, no secrets set, no prod touch of any kind.
No server started on 3000 or 3002, so the PORT RULE was not exercised.
