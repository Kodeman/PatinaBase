# W4 — surfaces + help · adversarial code review, round 10

Worktree: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`
Branch: `build/people-room-crm-2026-09-11`
Reviewer context: fresh. Prior fix log read: `build/w4-fix-log-r9.md`. Prior review read: `build/w4-review-r9-code.md`.
Three surface reports read in full: `w4-paperwork-report.md`, `w4-studio-report.md`, `w4-help-report.md`.
Settled and out of scope: every ruling in `artifacts/people-room-crm-2026-09-11/rulings.md` §3.

**Verdict: NOT clean — 0 blocking, 1 major, 23 minor.**

---

## 1. Prior-round re-check

| r9 finding | Then | Now | Evidence |
|---|---|---|---|
| **M-1** — a firm re-sending a refused paper got no receipt | major | **FIXED** | `paperwork-model.ts` `receivedReading()` now branches `row.state !== 'not_on_file' && row.state !== 'refused'`, so `refused` falls through to the `awaiting_check` rewrite with `blocksSentence`/`reasonSentence` cleared and `openByDefault:false`. `paperwork-sheet.tsx:118` `const isReceived = sentThisVisit \|\| row.awaitingCheck;` — the `row.state !== 'refused'` guard is gone. `jest src/components/paperwork src/app/paperwork` → 4 suites / 66 passed. |
| m-1 designer-portal unsubscribe ignores `scope` | minor | **OPEN** | `apps/designer-portal/src/app/preferences/unsubscribe/page.tsx:6` `PageProps` still `{token, status, type}`; :44 reads `outcome.type` only. |
| m-2 "from this studio" copy vs the org-less write | minor | **OPEN** | `packages/notifications/src/unsubscribe.ts:170-175` still `.eq('value', …).in('channel_kind',…).in('status',…)` with no organization filter. |
| m-3 stale `['invoice-link']` after Regenerate | minor | **CLOSED** | `use-invoices.ts:1481-1489` now carries the "NOTHING IS WRITTEN TO THE CACHE (R-BV)" comment r9 asked for. |
| m-4 `touchKeys` sorts but does not dedupe | minor | **OPEN** | `use-touches.ts` `touchKeys.list` → `[...(filters?.subjectIds ?? [])].filter(Boolean).sort()`; `useTouches` dedupes only its own local copy. |
| m-5 UTC day arithmetic in the link-window helpers | minor | **OPEN** | `paperwork-link-act.tsx` still composes `expiresAt: \`${chosenDay}T23:59:59Z\``. |
| m-6 `PaperworkLinkAct` one-shot `choice` initializer | minor | **OPEN** | `useState<PaperworkWindowChoice>(windowEnd ? "window" : "thirty")`, no sync. |
| m-7 constant live-region string | minor | **OPEN** | `paperwork-sheet.tsx` `setAnnouncement(receiptSentence)` with `receiptSentence` invariant. |
| m-8 upload-form error `role="status"` mounts with content | minor | **OPEN** | `paperwork-upload-form.tsx` `{state === 'error' && message && (<p … role="status">…)}`. |
| m-9 no bare `/paperwork` middleware leg | minor | **OPEN** | `middleware.ts` `const isPaperworkPage = req.nextUrl.pathname.startsWith('/paperwork/');` vs `/pay`'s two-leg test. (`app-chrome.tsx` DOES handle the bare form.) |
| m-10 PostHog comment count drift | minor | **OPEN** | `apps/client-portal/src/lib/analytics/posthog.ts:78-82` — the list now names seven prefixes, the sentence still says "one generic pattern covers all six". |
| m-11 `people-help-content.ts` header contradicts the promoted keys | minor | **OPEN** | `studios/help-system/scripts/people-help-content.ts:42-53` still says the concept keys "are NOT promoted to named constants … this wave's scope named exactly three new registry keys". Fifteen are in both registries. |
| m-12 `w4-help-report.md` §3 closing paragraph stale | minor | **OPEN** | §3 promotes the twelve at the top and then closes with "this wave's word/concept keys do not [register] … Promoting them later is additive and safe". |
| m-13 `client-portal type-check` RED on the branch | minor | **OPEN** | Still exit 1, see §3. `apps/client-portal/src/app/page.tsx` byte-identical to `origin/main` (`git diff origin/main...HEAD` empty). |

---

## 2. Blocking criteria — each one checked, none met

| Criterion | Result | Evidence |
|---|---|---|
| A token accepted without verification | **No** | `app/paperwork/[token]/page.tsx` format-gates on `/^[0-9a-f]{64}$/` before any round-trip, then `resolve_paperwork_link`, which re-tests the pattern, matches `token_hash = encode(digest(p_token,'sha256'),'hex')` and returns NULL unless `status = 'active' AND expires_at > now()` (00637:590-599). `paperwork-upload/core.ts` re-tests `TOKEN_PATTERN` at :221 and re-verifies through `paperwork_link_storage_context` at :264 and again inside `record_inbound_compliance_document`. |
| A verified document overwritten | **No** | `record_inbound_compliance_document` inserts `inbound=true, verified_at NULL`; the verify/reject CHECK (`verified_at IS NULL OR rejected_at IS NULL`) and the R-BU `grouped` CTE keep the confirmed row as *the* row. No update path touches a verified row. |
| Cross-tenant read/write | **No** | `paperwork_link_tokens`: RLS on, `REVOKE ALL … FROM PUBLIC, anon, authenticated`, one SELECT policy `USING (is_active_studio_member(organization_id))`; `usePaperworkLinks` names its columns and never `token_hash`. `studio_touches`: RLS on, one SELECT policy `USING (is_active_studio_member(organization_id))`, no write policy, `GRANT SELECT` only (00635:209-222). `resolve_paperwork_link` filters documents by both `holder_id` and `organization_id`. The address-wide unsubscribe write is broad by design and mirrors the ruled inbound-STOP behaviour (see m-2). |
| RLS / grant / storage-policy hole | **No** | `paperwork_link_rate_limits` service-role-only with RLS on and no policy; `paperwork_link_storage_context` service-role-only; `python3 scripts/generate-legacy-grants.py` was clean at r9 and no GRANT/REVOKE was touched this round. |
| Email sent to a dead/unsubscribed channel | **No** | No new send path in W4's surfaces. `record_notice` and `log_site_access_told` are records, not sends; the chase drafts `awaiting_review`. |
| A forged unsubscribe crossing subjects | **No** | `applyUnsubscribeToken` still verifies the signed token before doing anything; `parseUnsubscribeSubject` only routes. The channel path resolves the channel by its *id from the token* and then keys on that row's own `value` — a holder cannot name another address. |
| A `/pay` link broken by the backfill | **No** | `DesignBuildDepositOffer.payToken` is `string \| null` end to end; `adaptDesignBuildDepositOffer` no longer nulls the whole offer on a missing token; `door-gate.tsx:277` falls back to `/?invoice=${encodeURIComponent(bundleOffer.invoiceId)}`; `letterbox.tsx` no longer reads `useInvoiceLink` at all and opens the letter in place. No href can be `/pay/undefined`. |
| Reset failure | **No** | No migration minted this round; no schema file edited. 00637 remains idempotent (`IF NOT EXISTS`, `DROP … IF EXISTS` before each policy/trigger/constraint). |

---

## 3. Gates

All run from the worktree with `pnpm --dir`. No `.env.local` created, no server started, no port taken, no prod call of any kind.

```
supabase type-check ............................... EXIT=0
help-system type-check ............................ EXIT=0
designer-portal type-check ........................ EXIT=0
admin-portal build ................................ EXIT=0
client-portal type-check .......................... EXIT=1  (pre-existing, not W4's)
client-portal jest --coverage ..................... EXIT=0
designer-portal jest (people/roster/help/doc/analytics) EXIT=0
supabase vitest people-crm-w4 ..................... EXIT=0
help dry-run seed ................................. 18 written, 0 errored
```

**supabase type-check**
```
> @patina/supabase@0.0.1 type-check
> tsc --noEmit
EXIT=0
```

**help-system type-check**
```
> @patina/help-system@0.1.0 type-check
> tsc --noEmit
EXIT=0
```

**designer-portal type-check**
```
> @patina/designer-portal@0.1.0 type-check
> tsc --noEmit
EXIT=0
```

**admin-portal build** (run after the shared `packages/supabase` + `packages/help-system` edits)
```
ƒ Proxy (Middleware)

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
EXIT=0
```

**client-portal type-check** — RED, pre-existing:
```
> @patina/client-portal@0.1.0 type-check
> tsc --noEmit

.next/types/app/page.ts(37,29): error TS2344: Type '{ searchParams?: Promise<Record<string, string | string[] | undefined>> | undefined; } | undefined'
  does not satisfy the constraint 'PageProps'.
  Type 'undefined' is not assignable to type 'PageProps'.
ELIFECYCLE Command failed with exit code 1.
EXIT=1
```
`git diff --stat origin/main...HEAD -- apps/client-portal/src/app/page.tsx` → empty. Not W4's; recorded as m-12 so a reader of the wave's report is not surprised by a required gate that does not return 0.

**client-portal jest, with coverage**
```
Test Suites: 157 passed, 157 total
Tests:       2569 passed, 2569 total
Snapshots:   1 passed, 1 total

File                        | % Stmts | % Branch | % Funcs | % Lines |
All files                   |    77.3 |    73.09 |   77.04 |   79.68 |
 src/app/paperwork/[token]  |      95 |      100 |     100 |     100 |
 src/components/paperwork   |   97.94 |    91.75 |   97.14 |   98.78 |
  paperwork-model.ts        |   97.77 |    90.16 |     100 |   98.63 |
  paperwork-sheet.tsx       |   97.36 |      100 |     100 |   97.05 |
  paperwork-upload-form.tsx |    98.5 |    91.66 |   88.88 |     100 |
EXIT=0
```
Floor 70 / 60 / 70 / 70 — **holds with margin on all four**.

Every new client-portal file ships with its test (`git diff --name-status origin/main...HEAD | grep ^A`):

| New file | Test |
|---|---|
| `app/paperwork/[token]/page.tsx` | `app/paperwork/[token]/__tests__/page.test.tsx` |
| `components/paperwork/paperwork-model.ts` | `components/paperwork/__tests__/paperwork-model.test.ts` |
| `components/paperwork/paperwork-sheet.tsx` | `components/paperwork/__tests__/paperwork-sheet.test.tsx` |
| `components/paperwork/paperwork-upload-form.tsx` | `components/paperwork/__tests__/paperwork-upload-form.test.tsx` |
| `app/pay/used/page.tsx` | `app/pay/used/__tests__/page.test.tsx` |

**designer-portal jest** (`src/components/document/people`, `…/roster`, `src/lib/help-system`, `src/lib/document`, `src/lib/analytics`)
```
Test Suites: 166 passed, 166 total
Tests:       3132 passed, 3132 total
EXIT=0
```

**supabase vitest**
```
 ✓ src/hooks/__tests__/people-crm-w4.test.ts  (54 tests) 29ms
 Test Files  1 passed (1)
      Tests  54 passed (54)
EXIT=0
```

**Playwright** — not re-run this round (no server started, per the round's no-port posture). Both specs were statically checked: no `waitForTimeout` in either; `expect\n.poll(...)` is used for every DB read (`tests/paperwork-link.spec.ts:259`, `e2e/people/paperwork-inbound.spec.ts:210/248/285`).

---

## 4. Surface checks

### 4a. `/paperwork/[token]` — the guest door

- **No nav.** The page renders a bare `<main>` and imports no header, shell or `ClientNav`. `app-chrome.tsx` puts `/paperwork` in `PUBLIC_PREFIXES`, so the shell stamps `data-portal-shell="public"` and renders `display:contents` around the children — the portal carries no header, drawer or switcher on any route. `middleware.ts` puts it in `isPublicPage` **and** the bearer block that sets `Cache-Control: private, no-store, max-age=0` + `X-Robots-Tag: noindex, nofollow`. Listed in the README route map (line 81).
- **No homeowner data.** `resolve_paperwork_link` returns `studio_name`, `company_name`, `expires_at`, `documents[]`, each document carrying only `doc_type`, `doc_label`, `expires_on`, `blocks`, `state`, `awaiting_check`, `refusal_reason`. The page adds nothing. No project, no house, no homeowner, no other party.
- **No caveat/schema words.** A comment-stripped string scan of all four files for `organization_id|holder_id|RLS|tenant|schema|caveat|uuid|verified_at|doc_type|inbound|service_role|token_hash` returned one hit — the literal `'doc_type'` FormData key in `paperwork-upload-form.tsx`, which is a wire name, not a rendered string. Every rendered sentence is §3's copy table. One exception reaches the face on the error path only — see m-13.
- **Mobile-first.** `max-w-lg`, `px-4 sm:px-6`, single column, `space-y-6`, `clamp(1.6rem, 6vw, 2.2rem)` on the title, `min-h-[44px]` on every control and on the submit. No fixed widths, no horizontal scroll container.
- **Keyboard-reachable.** Every act is a real `<button>` or a real form control; every input has a `<label htmlFor>` whose id is built from the row's unique key (not the doc type, so two `other_named` forms cannot collide). `aria-disabled={state === 'sending'}` on submit, never `disabled` — the control stays focusable — and the handler returns early on a second press. `aria-required={expiryRequired}` rather than HTML `required`. Receipt focus is moved deliberately through `receiptRefs` + `tabIndex={-1}`, and a polite `role="status"` region is mounted empty at the top of the sheet.
- **Errors say what to do.** `DeadLink()` names no firm, studio or paper and offers no destination; the two in-form pre-checks say "Choose the file first." and "Give the date it expires."; the failure paragraph leaves number/issuer/dates filled. The exception is the door's own verbatim refusals — m-13.
- **Rate limiter fails open.** `paperwork_link_rate_limit_hit` errors are swallowed and the resolve proceeds; only an explicit `false` draws "Too many tries just now." Correct — the resolve is still the verification.
- **CSP.** `next.config.js:143-160` derives the Supabase connect origin from `NEXT_PUBLIC_SUPABASE_URL` through `withSupabase(...)` in both branches, so the round-1 QA-M1 fix is in place and the browser-side POST to `functions/v1/paperwork-upload` is allowed on any repoint. `form-action 'self'` covers the form's actionless `method="post"` pre-hydration fallback.

### 4b. Designer surfaces

- **Two-step confirms.** `inbound-queue-band.tsx` (Confirm → "Confirm the document"/"Not yet"; Reject → reason + "Refuse it"/"Not now"), `paperwork-link-act.tsx` (Mint a paperwork link → the R-AD band with its three named days → "Open the door"/"Not now"), `seat-window-band.tsx` (Set/Change the window → dates + consequence sentence → "Write the window"/"Leave it"). All inline, none a modal.
- **PR-n gating.** The three W4 acts are paper and access acts, not money grants: `mint_paperwork_link`, `revoke_paperwork_link`, `confirm_inbound_document` and `reject_inbound_document` all gate on `is_active_studio_member(org)` in the RPC, and the hooks translate the refusal. PR-n's owner/admin narrowing stays where it belongs — `close-seat-act.tsx`, `household-band.tsx`, `add-person-sheet.tsx` — and is untouched. See m-14 for the one copy inaccuracy this produces.
- **Invalidations complete.** `useConfirmInboundDocument`/`useRejectInboundDocument` → `inboundDocumentKeys.all` + `invalidateComplianceFanout(holderId)` + `complianceKeys.all`. `useMintPaperworkLink` → `paperworkLinkKeys.forCompany` + `accessGrantKeys.all`. `useRevokeAccessGrant` → `accessGrantKeys.all`, `['people-directory']`, `['people-directory-seats']`, `['project-roster']`, `partySmsKeys.all` and the literal `['paperwork-links']`. `useRecordNotice` → `touchKeys.all`. `useUpdateProjectParty` (the window write) → `['project-parties', id]`, `['project-roster', id]`, `peopleKeys.all`, `peopleSeatKeys.all`, `invalidateClientHouseholds`.
- **aria.** `held` + `disabled` together on the reject and the mint hold the control focusable and marked, with a visible `aria-describedby` sentence beside it. Bands use `aria-expanded` + `aria-controls` pointing at an always-present `<div id hidden>`, so no dangling IDREF and no focus loss on collapse. Errors are `role="alert"`.
- **Document grammar.** Sentences, never labels: `touchSentence`, `inboundDecisionSentence`, `wayInFact`, `windowWrittenSentence`, `paperworkWindowSentence`, `paperworkMintedSentence`, `CONFIRM_CONSEQUENCE_SENTENCE`, `REJECT_HELD_SENTENCE`.
- **Hooks above early returns.** `InboundQueueBand` calls `useInboundDocuments` before `if (rows.length === 0) return null`; `LastTouchLine` calls `useLastTouch` before its early return; `roster-row.tsx:393` passes `subjectIds: expanded && isSeat ? [seatId] : []` rather than conditionally calling.
- **Analytics.** `peopleEvents.grantMinted({tier:'paperwork_link', expiry_source})` and `peopleEvents.siteAccessChanged({region:'told', told_count})` match `people-events.ts`'s declared property shapes exactly. No new event name.

### 4c. Help

Validated programmatically against `studios/help-system/scripts/people-help-content.json`:

```
docs: 18
distinct surfaceKeys: 17
MISSING (from canonical registry OR the designer mirror): []
dup _ids: []
dup (surfaceKey|contentType|persona) triples: []
bad surfaceKey regex (^[a-z0-9-]+(\/[a-z0-9-]+)+$): []
cap violations (tooltip/fieldHelper body ≤160, emptyState heading ≤50, description ≤300): []
em-dashes: 0   en-dashes: 0
```

`_id`s are deterministic and derived from the surfaceKey (`helpContent.designer-portal--document--people--word--reach`, etc.) — every one printed in §5 below matches its key.

Registry: 15 new keys in `packages/help-system/src/surfaceKeys.ts` under `DesignerPortal.Document` and the same 15 in `apps/designer-portal/src/lib/help-system/document-surface-keys.ts`. Set-difference in both directions against the 17 keys the content uses: empty.

Dry run:
```
$ node studios/help-system/scripts/run-people-help-seed.mjs
[W4-help] DRY RUN — seeding 18 people-room help docs…
  📝 fieldHelper designer-portal/document/people (_id=helpContent.designer-portal--document--people--intro)
  📝 emptyState  designer-portal/document/people (_id=helpContent.designer-portal--document--people--empty)
  📝 tooltip     designer-portal/document/people/word/reach (_id=helpContent.designer-portal--document--people--word--reach)
  📝 tooltip     designer-portal/document/people/word/consent (_id=helpContent.designer-portal--document--people--word--consent)
  📝 tooltip     designer-portal/document/people/word/paper (_id=helpContent.designer-portal--document--people--word--paper)
  📝 tooltip     designer-portal/document/people/contact-rule (_id=helpContent.designer-portal--document--people--contact-rule)
  📝 tooltip     designer-portal/document/people/lens (_id=helpContent.designer-portal--document--people--lens)
  📝 tooltip     designer-portal/document/people/chips (_id=helpContent.designer-portal--document--people--chips)
  📝 helpArticle designer-portal/document/people/person (_id=helpContent.designer-portal--document--people--person--editing-details)
  📝 tooltip     designer-portal/document/people/person/consent (_id=helpContent.designer-portal--document--people--person--consent)
  📝 tooltip     designer-portal/document/people/person/access-grant (_id=helpContent.designer-portal--document--people--person--access-grant)
  📝 tooltip     designer-portal/document/people/person/authority (_id=helpContent.designer-portal--document--people--person--authority)
  📝 fieldHelper designer-portal/document/people/firm (_id=helpContent.designer-portal--document--people--firm--intro)
  📝 tooltip     designer-portal/document/people/firm/designations (_id=helpContent.designer-portal--document--people--firm--designations)
  📝 tooltip     designer-portal/document/people/firm/paper (_id=helpContent.designer-portal--document--people--firm--paper)
  📝 fieldHelper designer-portal/document/call-sheet/site-access (_id=helpContent.designer-portal--document--call-sheet--site-access--intro)
  📝 tooltip     designer-portal/document/call-sheet/site-access/told (_id=helpContent.designer-portal--document--call-sheet--site-access--told)
  📝 fieldHelper designer-portal/document/call-sheet/bring-forward (_id=helpContent.designer-portal--document--call-sheet--bring-forward--intro)

[W4-help] dry-run: 18 written, 0 errored
```

No `--commit`, no Sanity write, no `db push`, no `functions deploy`, no secrets set.

---

## 5. Findings

### MAJOR

**M-1 — the person card's coarse "Last touch" prints the UTC calendar day of a `timestamptz`, so an evening contact reads as the next day.**
`apps/designer-portal/src/components/document/people/views/person-profile.tsx:652-653`
Confidence: **high**.

```tsx
<LastTouchLine
  subjectIds={touchSubjectIds}
  fallback={
    formatSeatDate(person.last_touch_at?.slice(0, 10))
      ? `Last touch ${formatSeatDate(person.last_touch_at?.slice(0, 10))}.`
      : null
  }
/>
```

`people_directory.last_touch_at` is `COALESCE(dc.last_contacted_at, dc.last_project_at, dc.updated_at)` (00626:1478) over three `TIMESTAMPTZ` columns (`00062_client_management_v2.sql:24`), and PostgREST answers timestamptz in UTC. `.slice(0, 10)` therefore takes the **UTC** calendar day, and `formatSeatDate` (`seat-line.tsx:55-63`) regex-parses exactly those characters — its own doc comment says "Parsed by parts, never by `new Date(string)`", which is right for a DATE column and wrong for this one. A contact recorded at 21:30 CDT on 11 September prints "Last touch 12 Sep 2026."

This is the defect class W4 r3 MAJOR-4 already fixed once: `use-touches.ts` carries `touchInstantDay()` *for exactly this* ("`studio_touches.occurred_at` and `studio_compliance_documents.created_at` are timestamptz and PostgREST answers them in UTC … a text sent at 9:30pm CDT on 11 Sep read '12 Sep'"), and `inboundDocumentLine` uses it correctly. The fallback branch added in this wave does not.

It is not cosmetic and it is not rare. This is the **fallback**, so it is what the whole population `studio_touches` has no row for reads — i.e. essentially the entire rolodex today — and `updated_at` is rarely null, so almost every person card takes this branch. Roughly a fifth of all timestamps fall in the 19:00–24:00 local window that crosses. It is also the only absolute-date print of `last_touch_at` anywhere in the portal: `people-room.tsx:388`, `audience-rules.ts:85` and `people-derivation.ts` all use zone-agnostic `daysSince`/`humanizeSince`, so nothing else in the room can contradict it — the card simply states the wrong day and no second reading exists to catch it. The line sits directly beside `LastTouchLine`'s own E13 sentence, which *is* rendered on the studio's calendar, so once a person gains their first touch row the printed date can move a day for no reason the studio can see.

*Fix:* use the module that already exists — `touchInstantDay(person.last_touch_at)` from `@patina/supabase` — instead of `formatSeatDate(…slice(0,10))`. It handles the timestamptz and the bare-day cases and spells the month the way the rest of the room does. One import, one call, and the fallback and the record then agree.

### MINOR

**m-1 — designer-portal unsubscribe page ignores `scope`.** *(r9 m-1, open)* Confidence: high.
`apps/designer-portal/src/app/preferences/unsubscribe/page.tsx:6,44`. `PageProps` has no `scope` and the copy reads `outcome.type`, so a channel-subject click (`scope: 'address'`) is told "We've unsubscribed you from po sent emails" while the record stopped every category to that address. Reachable: `DIGEST_BASE_URL` falls back to `https://app.patina.cloud`. Narrow today (digests carry a `userId`, which routes to the `account` branch), which is why it stays minor. *Fix:* mirror the client-portal `scope` carry + `appliedCopy()`.

**m-2 — "from this studio" copy describes an org-less write.** *(r9 m-2, open)* Confidence: high.
`packages/notifications/src/unsubscribe.ts:170-175` updates every `email`/`ap_email` channel row sharing the address, across every organization; `apps/client-portal/src/app/preferences/unsubscribe/page.tsx` `appliedCopy()` says "We've stopped all email from this studio to this address." The breadth itself is deliberate and consistent with the ruled inbound-STOP posture (a mailbox's verdict is the mailbox's), so this is copy accuracy, not a tenancy hole. *Fix:* say the address is stopped everywhere, or add `.eq('organization_id', …)`.

**m-3 — `touchKeys.list` sorts `subjectIds` but does not dedupe them.** *(r9 m-4, open)* Confidence: high.
`packages/supabase/src/hooks/use-touches.ts`. `useTouches` dedupes its own local copy but the cache key does not, so two callers passing the same id twice mint two entries for one query. Harmless today — every call site passes a singleton. *Fix:* `[...new Set(subjectIds)].filter(Boolean).sort()` in the key.

**m-4 — the mint's `T23:59:59Z` boundary cuts the studio's named last day short by its UTC offset.** *(r9 m-5, open)* Confidence: high.
`paperwork-link-act.tsx` sends `${chosenDay}T23:59:59Z`. The room's clock is `STUDIO_TIME_ZONE = 'America/Chicago'`. A door the band said ends "21 November 2026" actually stops answering at 17:59 local on the 21st, so a firm uploading that evening gets the dead-link sheet on a day the studio named out loud — which is the whole point of R-AD's band. `lastOpenDay()` is UTC too, so the face and the post-mint sentence agree with each other and both are 6 hours optimistic about the record. *Fix:* build the boundary in the studio zone, the way `touchDay`/`touchInstantDay` already do.

**m-5 — `PaperworkLinkAct`'s `choice` is a one-shot `useState` initializer.** *(r9 m-6, open)* Confidence: high.
If `windowEnd` resolves or changes after first mount (the card's seats load asynchronously), the radio band keeps the stale default and can offer "Thirty days" while printing the engagement sentence. *Fix:* key the component on `windowEnd`, or sync in an effect.

**m-6 — the receipt live region is a constant string, so a second send announces nothing.** *(r9 m-7, open)* Confidence: high.
`paperwork-sheet.tsx` `setAnnouncement(receiptSentence)`; `receiptSentence` never varies. A reader who sends a W-9 and then a licence hears one receipt. *Fix:* include the document title, or append an invisible counter.

**m-7 — the upload form's error paragraph mounts with its content.** *(r9 m-8, open)* Confidence: medium.
`paperwork-upload-form.tsx` renders the `role="status"` element only when there is an error; some screen readers miss a region inserted already populated. *Fix:* mount it empty and fill it, as the sheet's own announcer does.

**m-8 — no bare `/paperwork` leg in the middleware.** *(r9 m-9, open)* Confidence: high.
`middleware.ts` `startsWith('/paperwork/')` only, while `/pay` tests both forms and `app-chrome.tsx`'s `PUBLIC_PREFIXES` test handles the bare form. Exactly `/paperwork` therefore falls outside both the bearer block and `isPublicPage`. Nothing is served there today. *Fix:* match `/pay`'s two-leg test.

**m-9 — the PostHog redaction comment says "all six" over a seven-prefix list.** *(r9 m-10, open)* Confidence: high.
`apps/client-portal/src/lib/analytics/posthog.ts:78-82`. The regex itself is correct and covers `paperwork`. Comment drift only.

**m-10 — `people-help-content.ts`'s header contradicts the promoted keys.** *(r9 m-11, open)* Confidence: high.
Lines 42-53 still say the twelve concept keys "are NOT promoted to named constants in `packages/help-system/src/surfaceKeys.ts` — this wave's scope named exactly three new registry keys". Fifteen are now in both registries. *Fix:* restate the header from the registries.

**m-11 — `w4-help-report.md` §3's closing paragraph is stale.** *(r9 m-12, open)* Confidence: high.
§3 opens with "ROUND 1 (review MAJOR-5) PROMOTED THE OTHER TWELVE" and closes with "this wave's word/concept keys do not [register] … Promoting them later is additive and safe." Report accuracy only.

**m-12 — `client-portal type-check` is RED on the branch.** *(r9 m-13, open)* Confidence: high.
Single generated-type error, pre-existing (`src/app/page.tsx` byte-identical to `origin/main`; `export default async function HomePage(props?: {…})` with an optional props parameter). Recorded because a required gate does not return 0. *Fix:* give `HomePage` a non-optional props parameter — outside this wave.

**m-13 — the door's raw refusals are printed verbatim on the firm's page, including a storage error and a tech phrase.** *(fresh)* Confidence: high.
`paperwork-upload-form.tsx` prints `answer.error` verbatim (decision P-6). Most of `paperwork-upload/core.ts`'s sentences are in the studio's voice, but two are not:
- `core.ts:287` → `` `upload failed: ${uploadError.message}` `` — an unbounded Supabase Storage message on a guest surface. A bucket name, an object path or a policy string reaching the firm would be the one schema word this page otherwise has none of.
- `core.ts:222 / :271 / :316` → `"invalid or expired token"`. Reachable without any failure: the studio revokes the door, or it expires, while the page is open. The firm presses Send and reads a phrase with the word *token* in it and no next step — on a page whose dead sheet is otherwise careful to say "The studio that sent it can open a new one."
*Fix:* map both at the surface, as the designer hooks map theirs — "That did not go through. Try again." for the storage case, and "This link has closed. Ask the studio to send a new one." for the token case.

**m-14 — "Ask an owner or admin" is the wrong next step for a refusal any active member could take.** *(fresh)* Confidence: high.
`use-paperwork-links.ts` `paperwork_link_not_authorized` → "This firm's book is not yours to write. Ask an owner or admin of the studio."; `use-inbound-documents.ts` has the same shape for its RLS fallback. Both RPCs gate on `is_active_studio_member(v_org)` (00637:457, :545), not on owner/admin, and the same token is raised for "no such firm". A designer who is simply in the wrong studio is sent to an owner who cannot help. *Fix:* "That firm's card is in another studio's book."

**m-15 — all eighteen help documents are unreachable.** *(fresh; declared in the wave's own §7)* Confidence: high.
`grep` over `apps/designer-portal/src` finds zero references to `peopleFirm`, `callSheetSiteAccess`, `callSheetBringForward` or any of the twelve concept keys outside the registry file itself, and zero `useHelpContent` callers under `components/document/people` or `…/roster`. Nothing on any face resolves any of the seventeen keys. The help report names this as owed to W6 and reported to Fable at round 1, so it is a declared scope boundary rather than a discovered defect — recorded here so it stays on the ledger, and because until a doorway exists nothing verifies that the keys resolve at all.

**m-16 — the `word/paper` tooltip attributes the paper word to the firm alone.** *(fresh)* Confidence: high.
`people-help-content.json`, `designer-portal/document/people/word/paper`: "the compliance paper behind this person's firm." `identity_paper_state(card, firm)` folds "the person's OWN paper AND their firm's, reduced worst-first, because a COI is the firm's and a master licence is the person's" (00626:79-83) — a fix made specifically because "a `holder_type='person'` lapse was reportable on a sole proprietor and invisible on everybody else". A designer chasing a lapsed master licence is pointed at the firm's card. Unreachable today (m-15), which is why it is minor. *Fix:* "the compliance paper behind this person and their firm, worst first."

**m-17 — the `chips` tooltip speaks in changelog voice.** *(fresh)* Confidence: medium.
"Six groups replace the old eleven roles." A designer opening help wants to know what the chips do, not what they replaced; a designer who never saw eleven roles is told about a room that no longer exists. *Fix:* drop the clause and name the six.

**m-18 — `wayInFact` embeds a UTC-sliced date into a durable record.** *(fresh)* Confidence: medium.
`site-access-card.tsx:72` `rosterShortDate(changedAt)`, where `project_site_access_cards.changed_at` is `timestamptz` (00625:107) and `rosterShortDate` → `dateParts` regex-slices the string (`roster-derivation.ts:563-587`). A change stamped at 20:00 CDT writes "The way in changed 17 Oct 2026." into `studio_touches.notice_of`, which nothing clears. It matches the card's own printed sentence exactly — which is the stated intent ("the record says what the face says") — so the reckoning to fix is the card's, not the notice's. Same family as M-1. *Fix:* move `rosterShortDate`'s timestamptz callers onto a studio-zone day.

**m-19 — `useRevokePaperworkLink` is exported and called by nothing.** *(fresh)* Confidence: high.
`packages/supabase/src/hooks/use-paperwork-links.ts`. The card's revoke goes through `useRevokeAccessGrant`'s routing table (S-8, correctly). Dead export, kept "for a surface holding the token row itself" — no such surface exists. Not inert on a face; report only.

**m-20 — the notice-log's result sentence is not announced.** *(fresh)* Confidence: medium.
`notice-log.tsx` renders `note` as a plain `<p>` outside any live region, and that is where both outcomes land — "3 more names are on the notice." and the two-write partial failure "… The record of the change did not save — …". A screen-reader user who presses Save this note hears nothing, including when half the act failed. The sheet's siblings (`seat-window-band`, `paperwork-sheet`, the company card's `announce`) all route their outcome through an announcer. *Fix:* pass the card's `announce` down, or give the band `role="status"`.

**m-21 — the firm is never told when its own door closes.** *(fresh)* Confidence: medium.
`resolve_paperwork_link` returns `expires_at` and the page ignores it. The studio's mint act says "{firm} can send their paper here until {date}"; the firm's page says nothing, and when the day passes the link simply becomes the dead sheet. Spec §3's region table does not ask for it, so this is a gap rather than a contract break — naming it so it is a decision rather than an omission.

**m-22 — `DocumentAction`'s loading state uses native `disabled`, not `aria-disabled`.** *(fresh; house-wide, not this wave's file)* Confidence: high.
`document-action.tsx:309-310` `disabled={unavailable && !held}` with `heldMark` applied only when `isHeld`, so `loading={mint.isPending}` with no `held` renders a natively disabled button and no `aria-disabled` — the browser blurs the focused control for the duration of the write. Every new W4 band uses that form (`confirm-inbound-document-confirm`, `open-paperwork-link`, `save-seat-window`, `confirm-who-was-told`). `document-action.tsx` is unchanged on this branch, so the idiom is pre-existing; r9 §4b's claim that it "always emits `aria-disabled`" is not what the file does. Report only.

**m-23 — the three surface reports' own numbers are stale.** *(fresh)* Confidence: high. Report accuracy only; never gates.
- `w4-paperwork-report.md` §5 gives 21 / 8 / 12 / 9 = 50 test cases across the four paperwork suites; the actual run is **66** (`jest src/components/paperwork src/app/paperwork` → 4 suites / 66 passed), and the per-file `it(` counts are 29 / 15 / 13 / 6.
- `w4-paperwork-report.md` §6 gives "154 suites, 2523 tests" and global 76.84 / 72.71 / 76.56 / 79.18; the actual run is **157 suites / 2569 tests**, global **77.3 / 73.09 / 77.04 / 79.68**.
- `w4-paperwork-report.md` §6 records "Client type-check — **clean**". It is RED on this branch (m-12), for a reason that is not this wave's but which the table should not assert against.
- `w4-studio-report.md` §1 gives "one new vitest file (`__tests__/people-crm-w4.test.ts`, 35)"; it holds **54** tests.
- `w4-studio-report.md` §7 still lists "`/paperwork/[token]` in the client portal (spec §3) — the firm's own page … still outstanding" under *Owed, and not done*. It shipped, in this wave, and is what `w4-paperwork-report.md` describes.

---

## 6. Constraints honoured

- No `db push`, no `functions deploy`, no secrets set, no Sanity `--commit`. Local DB only; no reset run; no migration minted; the reserved band 00595–00620 untouched.
- No `.env.local` created. No server started on 3000 or 3002 — no Playwright run and no `next build` against a live port; the admin build is the only build and 3001 was not serving.
- Absolute paths and `git -C` / `pnpm --dir` throughout; no chained `cd`; no `git add -A`.
- This file needs `git add -f`.
