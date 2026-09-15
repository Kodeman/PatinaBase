# W4 — round-2 adversarial code review (surfaces + help)

Worktree `.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`,
HEAD `322538551` ("fix(people-crm): W4 round-1 review …").

Scope read in full: `w4-paperwork-report.md`, `w4-studio-report.md`, `w4-help-report.md`,
`w4-fix-log-r1.md`, and every file this wave changed under `apps/client-portal/src`,
`apps/designer-portal/src`, `packages/supabase/src/hooks`, `packages/help-system/src`,
`studios/help-system/scripts` (53 files, `git diff 0249e1eff..HEAD`). Every ruling in
`rulings.md` §3 was treated as settled. No prod anything; no migration minted; no
`db push`, no `functions deploy`, no secrets.

**Verdict: NOT CLEAN — one blocking, five major, sixteen minor.**

---

## 1. Gates re-run at HEAD

| Gate | Command | Result |
|---|---|---|
| Supabase type-check | `pnpm --dir packages/supabase type-check` | **clean** (exit 0) |
| help-system type-check | `pnpm --dir packages/help-system type-check` | **clean** (exit 0) |
| Designer type-check | `pnpm --dir apps/designer-portal type-check` | **clean** (exit 0) |
| Client type-check | `pnpm --dir apps/client-portal type-check` | **RED as the tree stands** (see minor 14); clean with the stale `.next/types` moved aside |
| admin-portal build | `pnpm --dir apps/admin-portal build` (local env inline) | **green** (exit 0, full route table printed) |
| Client jest + coverage | `npx jest --coverage` in `apps/client-portal` | **154 suites / 2526 tests pass** |
| Designer jest (touched areas) | `npx jest src/components/document/people src/components/document/roster src/lib/help-system` | **49 suites / 717 tests pass** |
| Supabase vitest (W4 files) | `npx vitest run …people-crm-w4 …use-invoices …people-crm-foundation` | **3 files / 132 tests pass** |
| Help dry-run seed | `node studios/help-system/scripts/run-people-help-seed.mjs` | **18 written (dry), 0 errored** |

### Client-portal coverage (floor 70 / 60 / 70 / 70)

```
File                                | % Stmts | % Branch | % Funcs | % Lines
------------------------------------|---------|----------|---------|--------
All files                           |   76.86 |    72.69 |   76.56 |    79.2
 src/app/paperwork/[token]           |   95.23 |      100 |     100 |     100
  page.tsx                           |   95.23 |      100 |     100 |     100
 src/components/paperwork             |    99.4 |    91.02 |   96.55 |     100
  paperwork-model.ts                  |     100 |    89.13 |     100 |     100
  paperwork-sheet.tsx                 |     100 |      100 |     100 |     100
  paperwork-upload-form.tsx           |   98.48 |    91.66 |   88.88 |     100

Test Suites: 154 passed, 154 total
Tests:       2526 passed, 2526 total
```

**The floor holds** and every new client-portal file ships with its own suite
(`paperwork-model.test.ts`, `paperwork-sheet.test.tsx`, `paperwork-upload-form.test.tsx`,
`app/paperwork/[token]/__tests__/page.test.tsx`). `middleware.test.ts` and
`app-chrome.test.tsx` each gained a real `/paperwork` case.

### Client type-check tail (as the tree stands)

```
.next/types/app/page.ts(37,29): error TS2344: Type '{ searchParams?: … } | undefined'
  does not satisfy the constraint 'PageProps'.
  Type 'undefined' is not assignable to type 'PageProps'.
 ELIFECYCLE  Command failed with exit code 2.
```

`src/app/page.tsx` is untouched by this wave (`git diff 0249e1eff..HEAD` on it is empty)
and `.next/` is gitignored. With the generated tree moved aside the check is clean. Minor
14 says why it still matters.

---

## 2. Round-1 findings, re-measured at HEAD

| r1 finding | Status at HEAD | Evidence |
|---|---|---|
| B-1 pay-link readers | **FIXED as scoped** — 00638 re-heads both bodies; `adaptDesignBuildDepositOffer` no longer requires a token; `door-gate.tsx` falls to `/?invoice=<id>` (and `/` honours `?invoice=`, `page.tsx:39`). The letterbox leg is still open → MAJOR-4 below |
| B-2 out-touch tenancy | Edge/`_shared` — outside this review's read scope; not re-measured |
| M-1 sms-inbound verdict | Edge — outside scope |
| M-2 `access_grants_invoice_links` expiry | **FIXED** — 00637 §9b branch 9 emits `il.expires_at` |
| M-3 confirm pre-check legs | **HALF FIXED** — the SQL now raises all four, but two of the four tokens reach the studio's face raw → MAJOR-1 below |
| M-4 sms-inbound touches | Edge — outside scope |
| M-5 folio mint invalidate | **FIXED** — `useRegenerateInvoiceLink.onSuccess` keeps `setQueryData` and no longer invalidates |
| QA-B1 / MAJOR-2 unchecked + refused paper reads current | **FIXED** both halves — `compliance_state` carries `rejected_at IS NULL` and `NOT (inbound AND verified_at IS NULL)` (00637 §1b:187-189); `retainedComplianceDocuments` carries the same predicate |
| QA-M1 client CSP | **FIXED** — `next.config.js:133-144` derives http+ws origins from `NEXT_PUBLIC_SUPABASE_URL` onto both branches |
| MAJOR-1 "Received" about the studio's own paper | **FIXED** — `resolve_paperwork_link`'s `awaiting_check` carries the `inbound` leg; `buildPaperworkRows` lets only held paper speak the word |
| MAJOR-3 revoke leaves the mint band claiming a live door | **FIXED** — `useRevokeAccessGrant.onSuccess` invalidates `['paperwork-links']` |
| MAJOR-4 ruling id on the face | **FIXED** — `paperwork-link-act.tsx:257` reads "Name the day it closes. There is no clock to fall back on."; the test asserts no `R-x` token in the rendered document |
| MAJOR-5 twelve unregistered surfaceKeys | **FIXED** — all 17 authored keys resolve in BOTH `packages/help-system/src/surfaceKeys.ts` and the designer mirror (checked programmatically, 0 missing) |
| MAJOR-6 em-dashes in help copy | **FIXED** — 0 em- or en-dashes across all 18 documents |

---

## 3. Findings

### BLOCKING-1 — the paperwork bearer token is shipped to PostHog in the clear

**Where:** `apps/client-portal/src/lib/analytics/posthog.ts:99` (`HEX_BEARER_IN_URL`), and
its mirror `apps/designer-portal/src/lib/analytics/posthog.ts:87-88`.

The wave registered `/paperwork` in the two registries it knew about —
`src/middleware.ts:149` and `src/components/layout/app-chrome.tsx:26` — and missed the
third. The analytics redactor's alternation is still the seven-prefix list:

```js
const HEX_BEARER_IN_URL =
  /\/(share|rfq|evidence|plans|pay|trade)\/(?:return\/)?[0-9a-f]{64}(?![0-9a-f])/gi;
```

`PageviewTracker` (`PostHogProvider.tsx:14-18`) captures `$pageview` with
`$current_url: pathname` on every load, autocapture is on by default, and
`before_send: sanitizePostHogEvent` is the only scrubber. Run against the shipped
regexes:

```
paperwork: https://client.patina.cloud/paperwork/aaaaaaaa…(64 hex, verbatim)
pay      : https://client.patina.cloud/pay/[redacted]
```

`NEXT_PUBLIC_POSTHOG_KEY` is a committed literal in `apps/client-portal/wrangler.jsonc:29`,
so this is live on the real deploy, not dormant. The token is not a read credential: whoever
holds it can read the studio's name, the firm's name and the firm's whole compliance
position, and can POST documents into the studio's `compliance-documents` bucket and its
`studio_compliance_documents` table until the door's chosen end date — which R-AD lets a
studio set months out. Every `/paperwork/<token>` pageview, autocapture event and
help-system event puts that capability into a third-party analytics store, and session
replay is not disabled here either.

The file's own comment block is the specification this missed: "*/trade is the second one
that is a live capability rather than a read … so the prefix must be registered here as
well as in middleware.ts and app-chrome.tsx*". `posthog-privacy.test.ts` has one test per
prefix (share, rfq, evidence, plans, pay, trade, field) and no `paperwork` case, so nothing
could see the gap.

**Fix:** add `paperwork` to the alternation in both portals' `posthog.ts` (the designer file
is also still missing `trade`), and add the matching case to
`apps/client-portal/src/lib/analytics/__tests__/posthog-privacy.test.ts`.

---

### MAJOR-1 — two of `confirm_inbound_document`'s refusals reach the studio as raw schema tokens

**Where:** `packages/supabase/src/hooks/use-inbound-documents.ts:44-59`
(`INBOUND_REFUSAL_SENTENCES`).

00637 §9 raises four named refusals. The map carries two of them
(`compliance_confirm_needs_a_live_date`, `compliance_confirm_drops_a_gate`) and not the
two r1's M-3 added:

```
$ grep -rn "compliance_confirm_already_lapsed\|compliance_confirm_ends_sooner" packages apps supabase
supabase/migrations/00637_paperwork_upload_door.sql:856:  RAISE EXCEPTION 'compliance_confirm_already_lapsed'
supabase/migrations/00637_paperwork_upload_door.sql:866:  RAISE EXCEPTION 'compliance_confirm_ends_sooner'
supabase/tests/people/w4_channels_touches_paperwork_test.sql:808  (assertion)
supabase/tests/people/w4_channels_touches_paperwork_test.sql:833  (assertion)
```

Nothing in TypeScript names them. `asInboundDocumentError` falls through its loop and its
RLS branch and returns `message || …`, i.e. the bare Postgres message, which
`InboundRow`'s `role="alert"` paragraph prints verbatim. Both are ordinary firm behaviour —
a firm renews a COI for a shorter term, or sends a dated certificate that has already
lapsed — so the studio meets `compliance_confirm_ends_sooner` on the company card as the
whole explanation. That is exactly the defect S-10 and R-BS exist to prevent, and it is the
harm MAJOR-4 was raised for last round on a different face.

`w4-fix-log-r1.md` M-3 states "Both new tokens get their sentence in
`packages/supabase/src/hooks/use-inbound-documents.ts`". They do not (see minor 3).

---

### MAJOR-2 — the mint band offers an engagement window that has already passed, and the RPC then refuses it

**Where:** `packages/supabase/src/hooks/use-paperwork-links.ts:115-133`
(`firmEngagementWindowEnd`) with
`apps/designer-portal/src/components/document/people/paperwork-link-act.tsx:87, 98, 178-188`.

`firmEngagementWindowEnd` returns the latest `on_site_to` / `warranty_until` across the
firm's seats with no `off_job_at`, **with no test that the day is in the future**.
`mint_paperwork_link` (00637:470-475) applies one:

```sql
WHEN v_window_end IS NOT NULL
 AND v_window_end::timestamptz + interval '1 day' > now()
     THEN v_window_end::timestamptz + interval '1 day'
ELSE NULL      -- → RAISE paperwork_link_window_required
```

So for any firm holding an open seat whose `on_site_to` has passed — which is the ordinary
state of a crew nobody has stamped off the job — the band opens with `choice = "window"`
pre-selected, prints "The door can end with this firm's work here, 1 March 2026.", offers
the radio "Ends with the job — 1 March 2026", and the press sends `expiresAt: null`. The
RPC refuses, and `asPaperworkLinkError` prints "This firm has no open engagement here, so
the door needs an end date." — the exact opposite of the sentence the studio read one line
above, on the default choice. The room's leading act on this card refuses itself.

A second, narrower leg of the same divergence: the RPC additionally scopes its window to
`project_tenant_org(pp.project_id) = v_org`, which the face does not, so a seat on a
studio-less legacy project (R-BD / R-BI) produces the same contradiction.

No test covers a past window — `paperwork-link-act.test.tsx`'s window cases both use a
future date.

---

### MAJOR-3 — the homeowner's letterbox no longer offers a pay address for any invoice

**Where:** `apps/client-portal/src/components/threshold/letterbox.tsx:131, 290, 297-313`,
against `00636_invoice_link_hardening.sql:121` and `get_invoice_link` (00636:332-380).

00636 sets `invoice_links.token = NULL` for every row, freezes the column with
`chk_invoice_links_token_frozen`, and `get_invoice_link` now returns
`jsonb_build_object('token', NULL, …)` unconditionally. `parseInvoiceLink`
(`use-invoices.ts:1288-1298`) rejects a non-64-hex token and yields `null`, so
`useInvoiceLink` is null for every invoice — and the letterbox renders its terminal act
(`Pay $X`, `actionKey: invoice_open_link`) and its consequence sentence only
`{invoiceLink && …}`. On the homeowner's own house page, the pay act and the line "This
opens payment. Nothing is charged until you choose how to pay." are now gone for
**every** invoice, everywhere.

Not blocking: emailed `/pay/<token>` addresses still resolve (the backfill hashed them
before nulling the column, 00636:103-106) and `_shared/invoice-links.ts` still mints on
every send, and the opened letterbox still carries `Settlement` (settle-in-place), so the
money rail is not severed. But a shipped, ruled act on the client's primary surface
disappeared in this wave with no face-side change and no ruling.

It is disclosed — `w4-data-edge-report.md:109-117, 212-213` and the fix log's "Observed,
not fixed" — and no round-1 finding named it. Naming it now so it reaches a ruling before
ship rather than after.

---

### MAJOR-4 — a dead paperwork link dead-ends the firm on the homeowner's 404

**Where:** `apps/client-portal/src/app/paperwork/[token]/page.tsx:50, 77` →
`apps/client-portal/src/app/not-found.tsx`.

Every miss — revoked, expired, unknown, malformed — renders the portal's generic sheet:
"404 / Page not found / The page you're looking for doesn't exist or has been moved." with
one act, "Go to home", pointing at `/`. For a firm's paperwork contact that act is
unreachable by construction: `/` is not public, so the middleware bounces her to
`/auth/signin?callbackUrl=/` — a sign-in wall in front of a homeowner's house, offered to a
subcontractor's office manager who has no Patina account and never will. Nothing tells her
the link expired or that the studio can open another.

The brief's own contract for this page is "errors say what to do". The house precedent
agrees on four of the seven sibling prefixes: `/share/[token]` ("The share link may have
been turned off or has expired. Ask the studio for a fresh link."), `/plans/[token]`
(`data-testid="plans-dead-link"`, same sentence), `/field/[token]` ("Ask your designer to
resend the request. For privacy, expired, revoked, and unknown links all look the same."),
`/evidence/[token]` ("a quiet 'This link has expired' page … deserves an explanation, not a
dead end"), and `/pay` has `/pay/dead`. Confidence is medium only because `/rfq` and
`/trade` do use bare `notFound()`, and this page was modelled on `/rfq`.

The e2e asserts the dead page is silent about the firm, the studio and the paper — which it
should stay. A calm dead-link sheet naming neither party satisfies both.

---

### MAJOR-5 — the upload's outcome is silent to assistive technology and destroys focus

**Where:** `apps/client-portal/src/components/paperwork/paperwork-sheet.tsx:52-74` and
`paperwork-upload-form.tsx:122-126`.

On a successful send, `onReceived()` marks the row received and deletes it from `opened`,
so the whole `<form>` — including the focused submit button — unmounts. Focus falls to
`document.body`. The only feedback is a plain `<p>` ("Received. {studio} will confirm
it.") inserted into a section with no live region anywhere on the page, so a screen-reader
user who presses "Send W-9" hears nothing at all and has lost her place in the document.
The failure path is announced (`role="status"` on the error paragraph); the success path is
not.

This is the one act on the page, and the page is explicitly a mobile, one-purpose surface.
The designer side of the same wave routes every act through `onAnnounce` into a live region;
this page has no equivalent. Confidence medium on severity, high on the behaviour.

---

### Minor findings (reported, never gate-holding)

1. **`asNoticeError` and `asPaperworkLinkError` name the wrong remedy.**
   `use-touches.ts:345` ("Ask an owner or admin of the studio") and
   `use-paperwork-links.ts:64-65` ("Ask an owner or admin of the studio"). Both RPCs gate on
   `public.is_active_studio_member` (00635:353, 00637:449), not on owner/admin. A studio
   member who is refused because the job belongs to another tenant is sent to ask a role that
   is not the gate.

2. **The mint receipt names the day after the window the band promised.** The band prints
   "The door can end with this firm's work here, 21 November 2026."; the RPC stores
   `v_window_end + interval '1 day'`, and `paperworkMintedSentence`
   (`paperwork-link-act.tsx:60-68`) slices that timestamp to a day, so the receipt reads
   "… can send their paper here until 22 November 2026." One offer, two dates.

3. **`w4-fix-log-r1.md` M-3 is inaccurate** — "Both new tokens get their sentence in
   `packages/supabase/src/hooks/use-inbound-documents.ts`" is false (MAJOR-1).

4. **`studios/help-system/scripts/people-help-content.ts:42-53` contradicts the code it
   documents** — it still says the twelve concept surfaceKeys "are NOT promoted to named
   constants … this wave's scope named exactly three new registry keys". Round 1's MAJOR-5
   promoted all twelve. `w4-help-report.md` §3 carries the same contradiction in its own
   closing paragraph ("this wave's word/concept keys do not [register]").

5. **`studios/help-system/scripts/seed-people-help.ts:12` miscounts its own coverage** —
   "2× fieldHelper / 6× tooltip / 1× emptyState → designer-portal/document/people". The
   actual `.../people` group is 1 fieldHelper + 1 emptyState, with the six tooltips at
   sub-paths.

6. **`w4-paperwork-report.md` §5 coverage numbers are stale.** It reports
   `components/paperwork 99.37 | 92.5 | 96.55 | 100`; measured at HEAD it is
   `99.4 | 91.02 | 96.55 | 100`, and the "new-file coverage" line (98.89 / 93.40 / 96.66 /
   100) does not reproduce either. The floor is not at risk; the numbers are.

7. **`deposit-offer.tsx:35` doc comment is stale after B-1** — "`/pay/<token>` — built by
   the sign route from the invoice's own link". The reload path now hands it
   `/?invoice=<id>`, and the module header at :26 still says "It is a plain link to the
   shipped payer surface (`/pay/<token>`)".

8. **18 help documents are unreachable on every face.** No component calls
   `useHelpContent()` or `useDocumentSurface()` against any of the 17 authored keys
   (confirmed by grep). `w4-help-report.md` §7 names W6 as the owner and the fix log records
   it, so this is carried, not new — but until W6 lands, the wave's whole help deliverable
   renders nowhere.

9. **The edge function's verbatim refusals include one that says nothing to do.**
   `paperwork-upload/core.ts:177, 213, 249` answer `"invalid or expired token"`, which
   `paperwork-upload-form.tsx:112-119` prints as-is. P-6 justifies verbatim printing on the
   grounds that those sentences "are already in the studio's voice"; this one is not, and it
   is the sentence a firm meets when the studio revokes the door mid-session.

10. **`touchKeys.list` sorts subjectIds but does not dedupe them, while `useTouches` does**
    (`use-touches.ts:263` vs `:284`). `[a, a]` and `[a]` are two cache entries for one query.

11. **`lastInboundDecision` orders by string comparison on `occurred_at`**
    (`use-touches.ts:222-224`). PostgREST is consistent about the offset today, so this
    holds; a row written with a different offset would sort wrong.

12. **`buildPaperworkRows` is undefined-safe but not undefined-correct for an unknown
    `state`** (`paperwork-model.ts:228, 294-297`). `STATE_RANK[state]` is `undefined` for any
    value outside the four, which makes both the worst-first fold and the final sort
    comparator non-deterministic. The RPC's `CASE` can only emit three values today.

13. **`thirtyDaysOut` derives the day in UTC from a local `now`**
    (`use-paperwork-links.ts:100-104`). A studio minting after ~19:00 US Central is offered,
    and sends, a day 31 local days out.

14. **The client type-check gate is red on a generated artifact.**
    `.next/types/app/page.ts(37,29)` fails against an unmodified `src/app/page.tsx`; the
    tree regenerates on every client `next build`, so the next runner rediscovers it. The fix
    log names it and leaves it; naming it again because the gate itself is the thing that is
    red.

15. **A studio's free-text `other_named` label is rendered on the firm's guest page.**
    `documentTitle` (`paperwork-model.ts:110-115`) prints `doc_label` verbatim to the firm,
    and `record-document-sheet` gives the studio no indication that the name it types will be
    read by the firm.

16. **`SeatWindowBand`'s collapsed toggle points `aria-controls` at nothing.**
    `seat-window-band.tsx:148` sets `aria-controls={bandId}` while the element carrying that
    id is only rendered in the open branch (`:159`).

---

## 4. What was checked and found sound

- **No nav, no homeowner data on `/paperwork/[token]`.** `RootLayout` carries no header,
  drawer or footer; `AppChrome` marks the prefix public (`data-portal-shell="public"`);
  the page renders one `<main>`, the firm's name, the studio's name, and the paper.
  `resolve_paperwork_link` hands back no ids, no file paths and no uploader names, and the
  page adds none. `/paperwork` is absent from `retired-routes.ts`, so nothing folds it.
- **The token is never accepted without verification.** Format gate before any round trip
  (`page.tsx:50`), hash lookup plus `status`/`expires_at` in the RPC (00637:583-587),
  company+org scoped document read, and the edge function re-verifies on its own
  (`core.ts:176, 206, 246-249`). Malformed, unknown, revoked and expired die into one NULL.
- **Cross-tenant.** `resolve_paperwork_link` filters `holder_id = v_row.company_id AND
  organization_id = v_row.organization_id`; `mint_paperwork_link` resolves the org from the
  company card and refuses a person card or another studio's book; `v_access_grants` branch
  12 is security_invoker over the base table's RLS.
- **`aria-disabled`, not `disabled`.** Every held act passes `held` + `disabled` to
  `DocumentAction`, which renders `disabled={unavailable && !held}` (false) plus
  `aria-disabled` and keeps the control focusable, with `aria-describedby` reaching a visible
  reason (`inbound-queue-band.tsx:173-217`, `paperwork-link-act.tsx:233-259`,
  `notice-log.tsx:176-182`). The guest form uses `aria-disabled` on the submit and returns
  early from the handler.
- **Two-step confirms.** Confirm and Reject are inline two-step with the consequence stated
  first and no modal; the reject reason is required and held with a sentence. The mint states
  R-AD's date and R-AF's replacement before the press.
- **Invalidations.** Mint and revoke both invalidate `paperwork-links` and
  `accessGrantKeys.all`; confirm/reject fan out through `invalidateComplianceFanout` +
  `complianceKeys.all` + `inboundDocumentKeys.all`; `record_notice` invalidates
  `touchKeys.all`; `useUpdateProjectParty` already invalidated `project-parties`,
  `project-roster`, `peopleKeys.all`, `peopleSeatKeys.all`.
- **Hooks above early returns.** `firmWindowEnd` (company-card:404) and `touchSubjectIds`
  (person-profile:287) both sit above their components' first `return`; the roster row's
  `useTouches` is called unconditionally with conditional arguments.
- **Analytics through `people-events.ts`** — `grantMinted({tier:'paperwork_link',
  expiry_source})` fits `GrantMintedProperties` exactly; no ad-hoc capture was added.
- **Help content.** 18 documents; all 17 surfaceKeys resolve in both registries; every
  `_id` is deterministic (`helpContent.<dash-doubled path>`) and unique; no duplicate
  `(surfaceKey, contentType, persona)` triple; every key matches the schema's
  `^[a-z0-9-]+(\/[a-z0-9-]+)+$`; tooltip/fieldHelper bodies ≤160 (longest 157), emptyState
  heading ≤50 and description ≤300; the helpArticle carries title, oneSentenceAnswer and six
  unique-keyed blocks; zero em- or en-dashes; no `_id` collision with the pre-existing
  `people-editing-details` quartet.
- **Playwright.** `apps/client-portal/tests/paperwork-link.spec.ts` and
  `apps/designer-portal/e2e/people/paperwork-inbound.spec.ts` contain no `waitForTimeout`;
  the DB assertion uses `expect.poll`; the client config declares exactly one project,
  `chromium`.
