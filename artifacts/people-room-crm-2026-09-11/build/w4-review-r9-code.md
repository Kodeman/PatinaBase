# W4 — surfaces + help · adversarial code review, round 9

Worktree: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`
Branch: `build/people-room-crm-2026-09-11`
Reviewer context: fresh. Prior fix log read: `build/w4-fix-log-r8.md`.
Settled and out of scope: every ruling in `artifacts/people-room-crm-2026-09-11/rulings.md` §3.

**Verdict: NOT clean — 0 blocking, 1 major, 13 minor.**

---

## 1. Prior-round re-check

| r8 finding | Severity then | Now | Evidence |
|---|---|---|---|
| MAJOR-1 — a row sent this visit still printed "W-9 is not on file." one line above its own receipt | major | **FIXED** | `paperwork-model.ts:290` `receivedReading()` exists and is *applied*: `paperwork-sheet.tsx:86` `const row = sentThisVisit ? receivedReading(source) : source;`. Not a claim — the call site is there. |
| MAJOR-2 — issuing/sending an invoice left the `['invoice-link', id]` fact stale | major | **FIXED** | `use-invoices.ts` exports `invalidateInvoiceLinkFact(queryClient, invoiceId)`; wired in `useIssueInvoice.onSuccess` and `useSendInvoice.onSettled`. `invalidateInvoiceEffects` correctly no longer touches it (`void invoiceId`, R-BV). |
| r8 m-1 designer-portal unsubscribe ignores `scope` | minor | **OPEN** | `apps/designer-portal/src/app/preferences/unsubscribe/page.tsx` still has no `scope` in `PageProps`; reads `outcome.type` only. Client portal was fixed; designer was not. |
| r8 m-6 "from this studio" copy vs the org-less write | minor | **OPEN** | `packages/notifications/src/unsubscribe.ts` `applyChannelUnsubscribe` still `.eq('value', …).in('channel_kind', …).in('status', …)` with no organization filter. |
| r8 m-7 stale `['invoice-link']` after Regenerate | minor | **OPEN** | `useRegenerateInvoiceLink` writes nothing to the cache by design (R-BV). Not user-visible — see §5. |
| r8 m-8 `touchKeys` sorts but does not dedupe `subjectIds` | minor | **OPEN** | `use-touches.ts` `touchKeys`. |
| r8 m-10 UTC day arithmetic in the link-window helpers | minor | **OPEN** | `use-paperwork-links.ts` `thirtyDaysOut`/`firmEngagementWindowEnd`; `paperwork-link-act.tsx` `T23:59:59Z`. |
| r8 m-11 `PaperworkLinkAct` one-shot `choice` initializer | minor | **OPEN** | `useState` initializer only reads the window on first mount. |
| r8 m-12 constant live-region string suppresses a second announcement | minor | **OPEN** | `paperwork-sheet.tsx` `setAnnouncement(receiptSentence)` — same string, no re-announce. |
| r8 m-13 upload-form error `role="status"` mounted with its content | minor | **OPEN** | `paperwork-upload-form.tsx`. |
| r8 m-14 no bare `/paperwork` middleware leg | minor | **OPEN** | `middleware.ts` `startsWith('/paperwork/')` only, unlike `/pay`'s two-leg test. |

---

## 2. Blocking criteria — each one checked, none met

| Criterion | Result | Evidence |
|---|---|---|
| A token accepted without verification | **No** | `app/paperwork/[token]/page.tsx` format-gates on `PAPERWORK_TOKEN_PATTERN = /^[0-9a-f]{64}$/` *before* any DB call, then verifies through `resolve_paperwork_link`, which hashes and matches `token_hash`. Malformed / unknown / revoked / expired all return the same NULL, so a dead link never confirms anything. |
| A verified document overwritten | **No** | `record_inbound_compliance_document` inserts `inbound=true, verified_at NULL`; `resolve_paperwork_link`'s `grouped` CTE keeps the confirmed row as *the* row with `awaiting_check` riding as a flag (R-BU). No update path touches a verified row. |
| Cross-tenant read/write | **No** | `paperwork_link_tokens` has RLS enabled, `REVOKE ALL … FROM PUBLIC, anon, authenticated`, and a single SELECT policy `USING (public.is_active_studio_member(organization_id))`. Every write is a SECURITY DEFINER RPC granted to authenticated/service_role only. `resolve_paperwork_link` filters documents by **both** `holder_id = v_row.company_id` **and** `organization_id = v_row.organization_id`. |
| RLS / grant / storage-policy hole | **No** | `paperwork_link_rate_limits` is service_role-only with RLS on and no policy. `paperwork_link_storage_context` is service_role-only. `compliance_documents_member_read` unchanged in shape. `v_access_grants` SELECT to authenticated/service_role as before. |
| Email sent to a dead/unsubscribed channel | **No** | No new send path in W4's surfaces; the notices this wave writes are records (`record_notice`), not sends, consistent with the Agent-OS no-automated-external-sends rule. |
| A forged unsubscribe crossing subjects | **No** | The unsubscribe token path is unchanged in verification; the r8 `scope` work is presentation only. (The org-less *breadth* of the write is a copy-accuracy minor, m-6 — it does not let one subject unsubscribe another.) |
| A `/pay` link broken by the backfill | **No** | `payToken: string \| null` is threaded end to end (`lib/commercial-documents.ts` → `door-gate.tsx` → `letterbox.tsx`) with a real fallback `/?invoice=${encodeURIComponent(bundleOffer.invoiceId)}`. A null token degrades to the invoice route, never to a broken href. |
| Reset failure | **No** | Migrations replay; 00637 is idempotent throughout (`IF NOT EXISTS`, `DROP … IF EXISTS` before each `CREATE POLICY`/`CREATE TRIGGER`/`ADD CONSTRAINT`). Migration order holds R-BX. |

---

## 3. Gates

All run from the worktree with `pnpm --dir … --filter …`; no `.env.local` created; no server started; nothing pushed to prod.

```
supabase type-check .................................... EXIT=0
help-system type-check ................................. EXIT=0
designer-portal type-check ............................. EXIT=0
admin-portal build (after shared-package edits) ........ EXIT=0
client-portal type-check ............................... EXIT=1  (pre-existing, see below)
```

`client-portal type-check` tail:

```
.next/types/app/page.ts(37,29): error TS2344: Type 'typeof import(".../src/app/page")' does not
  satisfy the constraint 'AppPageConfig<"/">'.
  Types of property 'default' are incompatible.
    Type 'undefined' is not assignable to type 'PageProps<"/">'.
```

**Not W4's.** `apps/client-portal/src/app/page.tsx` is byte-identical to `origin/main` (`git diff --stat origin/main...HEAD -- apps/client-portal/src/app/page.tsx` is empty; the last commit touching it, `7ff6c085d`, is on main). The cause is that file's optional props parameter (`export default async function HomePage(props?: {…})`), which Next 15's generated `PageProps` check rejects. Recorded as gate context (minor m-13 below), not as a W4 defect.

### client-portal jest, with coverage

```
Test Suites: 157 passed, 157 total
Tests:       2568 passed, 2568 total

------------|---------|----------|---------|---------|
File        | % Stmts | % Branch | % Funcs | % Lines |
------------|---------|----------|---------|---------|
All files   |   77.31 |    73.09 |   77.04 |   79.68 |
------------|---------|----------|---------|---------|
```

Floor is 70 / 60 / 70 / 70 (`global` threshold). **Holds with margin on all four.**

Every new client-portal file ships with its test:

| New file | Test |
|---|---|
| `app/paperwork/[token]/page.tsx` | `app/paperwork/[token]/__tests__/page.test.tsx` |
| `components/paperwork/paperwork-model.ts` | `components/paperwork/__tests__/paperwork-model.test.ts` |
| `components/paperwork/paperwork-sheet.tsx` | `components/paperwork/__tests__/paperwork-sheet.test.tsx` |
| `components/paperwork/paperwork-upload-form.tsx` | `components/paperwork/__tests__/paperwork-upload-form.test.tsx` |
| `app/pay/used/page.tsx` | `app/pay/used/__tests__/page.test.tsx` |
| `app/pay/return/[nonce]/route.ts` | `app/pay/return/[nonce]/__tests__/route.test.ts` |

### designer-portal jest (people / roster / accounts / help-system)

```
Test Suites: 55 passed, 55 total
Tests:       798 passed, 798 total
```

### supabase vitest

```
 ✓ src/hooks/__tests__/people-crm-w4.test.ts
 ✓ src/hooks/__tests__/use-invoices.test.ts

 Test Files  2 passed (2)
      Tests  118 passed (118)
```

---

## 4. Surface checks

### 4a. `/paperwork/[token]` — the guest door

- **No nav.** The page renders a bare `<main>`; it imports no header, no `ClientNav`, no shell. `middleware.ts` puts `/paperwork` in `isPublicPage` *and* in the bearer block that stamps `Cache-Control: no-store` and `X-Robots-Tag: noindex`. It sits beside `/field`, `/evidence`, `/pay` as the eighth bearer route and is listed in the README route map.
- **No homeowner data.** `resolve_paperwork_link` returns exactly `studio_name`, `company_name`, `expires_at`, `documents[]` — and each document carries only `doc_type`, `doc_label`, `expires_on`, `blocks`, `state`, `awaiting_check`, `refusal_reason`. No ids, no file paths, no uploader names, no project, no homeowner.
- **No caveat/schema words.** Grepped the paperwork components for `caveat|schema|RLS|tenant|organization_id|holder_id|uuid` in rendered strings: none. Copy is "Licence, lapsed 1 May.", "Received. <Studio> will confirm it."
- **Mobile-first.** Single column, `space-y-6`, no fixed widths, no horizontal scroll container.
- **Keyboard-reachable.** Every act is a real `<button>` or a real form control. `aria-disabled={state === 'sending'}` on submit rather than `disabled` — the control stays focusable. `aria-required={expiryRequired}` rather than HTML `required`. Receipt focus is moved deliberately via `receiptRefs` and a polite `role="status"` region.
- **Errors say what to do.** `DeadLink()` gives the firm a sheet with no destination and no next-step guess; the upload form's failure paragraph names the failure and leaves the form filled (only `file` is cleared on success, so number/issuer/issuedOn/expiresOn survive).
- **Fails open on the limiter.** `paperwork_link_rate_limit_hit` errors are swallowed and the resolve proceeds. Correct: a limiter outage must not lock a firm out of its own paperwork, and the resolve itself is still the verification.

### 4b. Designer surfaces

- **Two-step confirms.** `inbound-queue-band.tsx` (confirm / refuse), `paperwork-link-act.tsx` (mint / revoke), `seat-window-band.tsx` all gate the second step behind an inline confirm rather than a modal.
- **PR-n gating.** Present and correct on the new bands.
- **Invalidations complete.** `useConfirmInboundDocument` / `useRejectInboundDocument` call `invalidateInbound` **and** `invalidateComplianceFanout`, which hits `complianceKeys.all`, `studioContactKeys.detail(holderId)`, `peopleKeys.all` and `peopleSeatKeys.all` — every reader of the paper word. `useMintPaperworkLink` invalidates `paperworkLinkKeys.forCompany` + `accessGrantKeys.all`; `useRevokeAccessGrant` additionally invalidates `['paperwork-links']`, so revoking from the grants surface refreshes the link surface.
- **aria-disabled, not disabled.** The house idiom is honoured: `DocumentAction` computes `disabled={unavailable && !held}` and always emits `aria-disabled`, so `held={!reasonWritten} disabled={!reasonWritten}` keeps the control focusable and marked, which is the rule, not a violation of it.
- **Document grammar.** Sentences, not labels, throughout the new bands ("The record of the change did not save — …", `wayInFact`, `touchSentence`, `inboundDecisionSentence`).
- **Hooks above early returns.** `touch-line.tsx`'s `LastTouchLine` places `useLastTouch` above its early return; `roster-row.tsx` passes `subjectIds: expanded && isSeat ? [seatId] : []` rather than conditionally calling the hook.

### 4c. Help

- 18 documents, **17 distinct surface keys**.
- Every key exists in **both** `packages/help-system/src/surfaceKeys.ts` and the designer mirror `apps/designer-portal/src/lib/help-system/document-surface-keys.ts` (15 new in each; the other two were already present). Verified by set-difference in both directions: empty.
- 0 duplicate `_id`s, 0 duplicate (type, surfaceKey, locale) triples, deterministic `_id`s and block `_key`s.
- 0 em-dashes and 0 en-dashes in the content payload.
- All caps within the `helpContent` schema limits (tooltip body ≤160, emptyState heading ≤50, description ≤300) — re-validated against the *nested* fields (`tooltipContent.body`, `emptyStateContent.heading`/`.description`, `helpArticleContent.*`) after a first validator read the wrong top-level keys and silently passed everything.

Dry run:

```
$ node studios/help-system/scripts/run-people-help-seed.mjs --dry-run
…
18 written, 0 errored
```

No Sanity push, no `db push`, no `functions deploy`, no secrets set.

---

## 5. Findings

### MAJOR

**M-1 — a firm that re-sends a refused paper is told it is still refused, and the record says otherwise on the next load.**
`apps/client-portal/src/components/paperwork/paperwork-sheet.tsx:88` · `apps/client-portal/src/components/paperwork/paperwork-model.ts:290-301`

`receivedReading()` returns a `refused` row untouched, and the sheet's `isReceived` excludes `refused` outright:

```ts
if (row.state === 'refused') return row;
…
const isReceived = row.state !== 'refused' && (sentThisVisit || row.awaitingCheck);
```

So when a firm uploads a replacement for a document the studio refused, the POST succeeds, the row is written `inbound=true, verified_at NULL, rejected_at NULL` — and the page prints **no receipt at all**. It keeps the refusal sentence, keeps the refusal reason, and keeps the form open, as though nothing was sent.

The record disagrees within seconds. `resolve_paperwork_link`'s `grouped` CTE reads `refused_paper` only for a type with nothing else standing (`CASE WHEN h.group_key IS NOT NULL … WHEN u.group_key IS NOT NULL THEN 'awaiting_check' ELSE 'refused' END`, and `refusal_reason` is `CASE WHEN h.group_key IS NULL AND u.group_key IS NULL THEN r.rejection_reason END`). The very next load therefore reads `awaiting_check` with no reason — the correct word. Only the visit in which the firm actually acts shows the wrong one.

This is the r7 M-4 shape, and `w4-fix-log-r8.md` §6 records that it was deliberately left standing ("That behaviour was not in the brief and was left exactly as it stood"). It is nonetheless a reader disagreeing with the record at the exact moment of the act, and the firm's most likely reading is that the upload failed — so it re-uploads, or gives up and calls the studio. That is a major.

*Fix:* in `receivedReading`, treat `refused` like `not_on_file`: move it to `awaiting_check`, drop `sentence` to the awaiting-check sentence, and clear `reasonSentence` and `blocksSentence`, which is precisely the reading 00637 will hand back on the next load. Then drop the `row.state !== 'refused'` guard from `isReceived` so the receipt prints and focus moves as it does for every other type. Keep the refusal visible for a refused row that has *not* been re-sent this visit — the r7 M-4 behaviour is right until the firm acts.

### MINOR

**m-1 — designer-portal unsubscribe still ignores `scope`.**
`apps/designer-portal/src/app/preferences/unsubscribe/page.tsx` — no `scope` in `PageProps`; the page reads `outcome.type` only, so the confirmation sentence cannot name what was actually unsubscribed. The client portal was fixed in r8 (`scope` carried across the redirect, `appliedCopy()` speaking from scope); the designer twin was not. Copy accuracy on a confirmation page — report, do not gate. *Fix:* mirror the client-portal change.

**m-2 — "from this studio" copy overstates an org-less write.**
`packages/notifications/src/unsubscribe.ts` `applyChannelUnsubscribe` updates `.eq('value', channel.value).in('channel_kind', ['email','ap_email']).in('status', ['active','bounced'])` with no organization filter, while the confirmation copy speaks of this studio. The write is broader than the sentence. This does **not** cross subjects (the address is the subject), so it is accuracy, not forgery. *Fix:* either add `.eq('organization_id', …)` or change the copy to say the address is unsubscribed everywhere.

**m-3 — `['invoice-link', id]` stays stale after Regenerate.**
`packages/supabase/src/hooks/use-invoices.ts` `useRegenerateInvoiceLink` writes nothing to the cache and returns `{token: data, status:'active', expiresAt: null}` (R-BV, deliberate). Not user-visible: `clientInvoiceUrl` becomes non-null, so `invoice-folio.tsx` takes the "Send them this link" branch and never reaches the three-sentence bounce band. Noted so the next reader does not rediscover it. *Fix:* none required; a comment at the hook would save the trip.

**m-4 — `touchKeys` sorts `subjectIds` but does not dedupe them.**
`packages/supabase/src/hooks/use-touches.ts`. Two callers passing the same id twice mint two cache entries for one query. Harmless today (every call site passes a singleton). *Fix:* `[...new Set(subjectIds)].sort()`.

**m-5 — UTC day arithmetic in the link-window helpers.**
`packages/supabase/src/hooks/use-paperwork-links.ts` `thirtyDaysOut` (UTC `.slice()`) and `firmEngagementWindowEnd`; `apps/designer-portal/src/components/document/people/paperwork-link-act.tsx` composes `expiresAt: chosenDay ? \`${chosenDay}T23:59:59Z\` : null`. The room's clock is `STUDIO_TIME_ZONE` (America/Chicago), which `use-touches.ts` uses correctly. A link chosen to end "31 May" dies at 18:59 local on the 31st. *Fix:* build the boundary in the studio zone, as `touchDay` does.

**m-6 — `PaperworkLinkAct`'s `choice` is a one-shot `useState` initializer.**
`paperwork-link-act.tsx`. If the firm's engagement window loads or changes after first mount, the radio band keeps the stale default. *Fix:* key the component on the window, or sync in an effect.

**m-7 — the receipt live region is a constant string, so a second send announces nothing.**
`apps/client-portal/src/components/paperwork/paperwork-sheet.tsx` — `setAnnouncement(receiptSentence)` with `receiptSentence` invariant. A screen reader hears the first receipt and nothing for the second type, because the text did not change. *Fix:* include the document title in the announced sentence, or append an invisible counter.

**m-8 — the upload form's error paragraph mounts with its content.**
`apps/client-portal/src/components/paperwork/paperwork-upload-form.tsx` — the `role="status"` element appears only when there is an error, so some screen readers miss the insertion. *Fix:* mount the region empty and fill it.

**m-9 — no bare `/paperwork` leg in the middleware.**
`apps/client-portal/src/middleware.ts` uses `pathname.startsWith('/paperwork/')`, while `/pay` uses `pathname === '/pay' || pathname.startsWith('/pay/')`. A request to exactly `/paperwork` falls outside the bearer block's `no-store` + `noindex` and outside `isPublicPage`. There is no page at that path, so nothing leaks today. *Fix:* match `/pay`'s two-leg test for consistency.

**m-10 — the PostHog redaction comment says "all six" but names seven prefixes, and omits `paperwork_link_tokens`.**
`apps/client-portal/src/lib/analytics/posthog.ts` and the designer twin. Comment-vs-code drift; the regex itself covers the paperwork token shape via the generic 64-hex rule. *Fix:* correct the count and name the new source.

**m-11 — `people-help-content.ts` header contradicts the promoted keys.**
`studios/help-system/scripts/people-help-content.ts` — the file header still describes an earlier key set than the 17 it now carries. *Fix:* update the header.

**m-12 — `w4-help-report.md` §3 closing paragraph is stale.**
`artifacts/people-room-crm-2026-09-11/build/w4-help-report.md` — the closing paragraph of §3 describes a count and a registry state the file's own table contradicts. Report accuracy only. *Fix:* re-state from the table.

**m-13 — `client-portal type-check` is RED on the branch.**
Pre-existing and not W4's (`apps/client-portal/src/app/page.tsx` byte-identical to `origin/main`; last touching commit `7ff6c085d` is on main). Recorded because a required gate does not currently return 0 on this branch and a reader of the wave's report should not be surprised by it. *Fix:* give `HomePage` a non-optional props parameter — outside this wave's scope.

---

## 6. Constraints honoured

- No `db push`, no `functions deploy`, no secrets set, no Sanity push. Local DB only; no reset run.
- No `.env.local` created; no server started on 3000 or 3002; no `pnpm dev`; no `next build` against a live port (the admin build is the only build, and 3001 was not serving).
- Absolute paths and `git -C` / `pnpm --dir --filter` throughout; no chained `cd`; no `git add -A`.
- No migration minted this round; the reserved band 00595–00620 untouched.
