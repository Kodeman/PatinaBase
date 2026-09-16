# W4 — surfaces + help · adversarial code review, round 11

Worktree: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`
Branch: `build/people-room-crm-2026-09-11`
Reviewer context: fresh. Prior fix log read: `build/w4-fix-log-r10.md`. Prior review read: `build/w4-review-r10-code.md`.
Three surface reports read in full: `w4-paperwork-report.md`, `w4-studio-report.md`, `w4-help-report.md`.
Settled and out of scope: every ruling in `artifacts/people-room-crm-2026-09-11/rulings.md` §3.
No prod call of any kind: no `db push`, no `functions deploy`, no secret set, no `.env.local` created, no server started, no port taken.

**Verdict: NOT clean — 0 blocking, 1 major, 25 minor.**

---

## 1. Prior-round re-check

| r10 finding | Then | Now | Evidence |
|---|---|---|---|
| **M-1** — the person card's coarse "Last touch" printed the UTC calendar day of a `timestamptz` | major | **FIXED** | `views/person-profile.tsx` now passes `touchInstantDay(person.last_touch_at)` into the `LastTouchLine` fallback. R-CB's sweep carried the same correction into `reach-access.tsx` (`heldChannelReason`, `channelRowParts`, `ruleSummary`), `people-format.ts` `lastOpenDay`, and `access-grant-list.tsx` (`grantEndsSentence`, `grantRowParts`). `use-touches.ts` exports `touchInstantDay`/`touchInstantIsoDay` on `STUDIO_TIME_ZONE = 'America/Chicago'`. |
| m-1 designer-portal unsubscribe ignores `scope` | minor | **OPEN** | `apps/designer-portal/src/app/preferences/unsubscribe/page.tsx:5-7` `PageProps` is still `{token, status, type}`; :44-46 branches on `outcome.type` only. |
| m-2 "from this studio" copy vs the org-less write | minor | **OPEN** | `packages/notifications/src/unsubscribe.ts:170-175` is still `.eq('value', channel.value).in('channel_kind', ['email','ap_email']).in('status', ['active','bounced'])` with no organization filter; `apps/client-portal/src/app/preferences/unsubscribe/page.tsx:174` still says "from this studio". See §5 note. |
| m-3 `touchKeys.list` sorts but does not dedupe | minor | **OPEN** | `use-touches.ts:352` `[...(filters?.subjectIds ?? [])].filter(Boolean).sort()`; `useTouches` dedupes only its own local copy at :373. |
| m-4 mint `T23:59:59Z` cuts the named last day short | minor | **OPEN** | `paperwork-link-act.tsx:144` `expiresAt: chosenDay ? \`${chosenDay}T23:59:59Z\` : null`. |
| m-5 `PaperworkLinkAct` one-shot `choice` initializer | minor | **OPEN** | `paperwork-link-act.tsx:96` `useState<PaperworkWindowChoice>(windowEnd ? "window" : "thirty")`, no sync effect. |
| m-6 constant live-region string | minor | **OPEN** | `paperwork-sheet.tsx:72` `setAnnouncement(receiptSentence)` with `receiptSentence` invariant. |
| m-7 upload-form error paragraph mounts with content | minor | **OPEN** | `paperwork-upload-form.tsx:256` `<p … role="status">` rendered only when `state === 'error' && message`. |
| m-8 no bare `/paperwork` middleware leg | minor | **OPEN** | `middleware.ts:150` `const isPaperworkPage = req.nextUrl.pathname.startsWith('/paperwork/');` vs `/pay`'s two-leg test. |
| m-9 PostHog redaction comment says "all six" over a seven-prefix list | minor | **OPEN** | `apps/client-portal/src/lib/analytics/posthog.ts:78-82` names `/share, /rfq, /evidence, /plans, /pay, /trade and /paperwork` then says "one generic pattern covers all six". |
| m-10 `people-help-content.ts` header contradicts the promoted keys | minor | **OPEN** | `studios/help-system/scripts/people-help-content.ts:42-53` still says the concept keys "are NOT promoted to named constants … this wave's scope named exactly three new registry keys". All 17 are in both registries (§4). |
| m-11 `w4-help-report.md` §3 closing paragraph stale | minor | **OPEN** | §3 promotes the keys at the top, then closes with "this wave's word/concept keys do not [register] … Promoting them later is additive and safe." |
| m-12 `client-portal type-check` RED on the branch | minor | **OPEN** | Still exit 1, single generated-output error; see §3. |
| m-13 door's raw refusals printed verbatim on the firm's page | minor | **OPEN** | `paperwork-upload-form.tsx:131-139` still `setMessage(… ? answer.error : …)`. |
| m-14 "Ask an owner or admin" on a member-level refusal | minor | **OPEN** | `use-paperwork-links.ts:65` and `use-inbound-documents.ts:79` unchanged; both RPCs gate on `is_active_studio_member`. |
| m-15 all eighteen help documents are unreachable | minor | **OPEN** | `grep -rn 'peopleFirm\|callSheetSiteAccess\|callSheetBringForward' apps/designer-portal/src` outside `document-surface-keys.ts` → **zero hits**. Declared scope boundary owed to W6. |
| m-16 `word/paper` tooltip attributes the paper word to the firm alone | minor | **OPEN** | `people-help-content.json:55` "the compliance paper behind this person's firm." |
| m-17 `chips` tooltip speaks in changelog voice | minor | **OPEN** | `people-help-content.json:88` "Six groups replace the old eleven roles." |
| m-18 `wayInFact` embeds a UTC-sliced date in a durable record | minor | **OPEN** | `site-access-card.tsx:72` `const day = changedAt ? rosterShortDate(changedAt) : null;` |
| m-19 `useRevokePaperworkLink` exported and called by nothing | minor | **OPEN** | Only callers are seven jest mocks and `people-crm-w4.test.ts:101,372`. No face calls it. |
| m-20 the notice-log's result sentence is not announced | minor | **OPEN** | `notice-log.tsx` has no `aria-live`, `role="status"` or `role="alert"`. |
| m-21 the firm is never told when its own door closes | minor | **OPEN** | `app/paperwork/[token]/page.tsx` and `paperwork-sheet.tsx` contain no `expires_at`/`expiresAt` reference. |
| m-22 `DocumentAction`'s loading state uses native `disabled` | minor | **OPEN** | `document-action.tsx:166` `const unavailable = disabled \|\| loading;` then `disabled={unavailable && !held}`; `heldMark` only when `isHeld`. Pre-existing, house-wide. |
| m-23 the three surface reports' own numbers are stale | minor | **OPEN** | `w4-paperwork-report.md:156` still records "Client type-check … **clean**"; :157 still "154 suites, 2523 tests … 76.84 / 72.71 / 76.56 / 79.18". Actual: RED, and 157 / 2572 / 77.33 / 73.13 / 77.05 / 79.71 (§3). |

One fixed, twenty-three still open, all twenty-three minor.

---

## 2. Blocking criteria — each one checked, none met

| Criterion | Result | Evidence |
|---|---|---|
| A token accepted without verification | **No** | `app/paperwork/[token]/page.tsx` format-gates on `PAPERWORK_TOKEN_PATTERN = /^[0-9a-f]{64}$/` before any round-trip; then `paperwork_link_rate_limit_hit` (refuse on `limitError \|\| withinLimit === false`); then `resolve_paperwork_link`, which re-tests the pattern, matches `token_hash = encode(digest(p_token,'sha256'),'hex')`, and returns NULL unless `status='active' AND expires_at > now()`. `paperwork-upload/core.ts` re-tests the pattern and re-verifies via `paperwork_link_storage_context` and again inside `record_inbound_compliance_document`. |
| A verified document overwritten | **No** | `record_inbound_compliance_document` inserts `inbound=true, verified_at NULL`. The `verified_at IS NULL OR rejected_at IS NULL` CHECK plus the R-BU `grouped` CTE keep the confirmed row as *the* row; no update path touches a verified row. `retainedComplianceDocuments`' new `held` predicate (`!doc.rejected_at && !(doc.inbound && !doc.verified_at)`) keeps an unverified inbound out of the held set without deleting anything. |
| Cross-tenant read/write | **No** | `paperwork_link_tokens`: RLS on, `REVOKE ALL … FROM PUBLIC, anon, authenticated`, one SELECT policy `USING (is_active_studio_member(organization_id))`; `use-paperwork-links.ts` `TOKEN_COLUMNS` names its columns and never `token_hash`. `studio_touches`: RLS on, one SELECT policy on `is_active_studio_member`, no write policy, `GRANT SELECT` only. `resolve_paperwork_link` filters documents by both `holder_id` and `organization_id`. `v_access_grants` branch 12 emits `grant_id = 'paperwork_link:' \|\| plt.id::text`, `subject_type='company'`, `subject_id = plt.company_id` — which is what `ACCESS_GRANT_REVOKE_ROUTES.paperwork_link`'s `keySegment: 1` and `FIRM_SCOPED_ACCESS_GRANT_TIERS` read. The address-wide unsubscribe write is broad by design (see m-2). |
| RLS / grant / storage-policy hole | **No** | `paperwork_link_rate_limits` service-role-only, RLS on, no policy; `paperwork_link_storage_context` service-role-only. No GRANT/REVOKE touched this round and no migration minted (`00637` is the wave's last; reserved 00595–00620 untouched). |
| Email sent to a dead/unsubscribed channel | **No** | No new send path in W4's surfaces. `record_notice` and `log_site_access_told` are records, not sends; the reject chase lands `awaiting_review` on the agent queue. |
| A forged unsubscribe crossing subjects | **No** | `applyUnsubscribeToken` verifies the signed token before doing anything; `parseUnsubscribeSubject` only routes and requires the literal `channel:` prefix. `applyChannelUnsubscribe` resolves the channel by its **id from the token**, then keys on that row's own `value` — a holder cannot name another address, cannot move a `dead` row (`.in('status',['active','bounced'])`), and cannot reach an SMS channel. |
| A `/pay` link broken by the backfill | **No** | `InvoiceLink.token` is `string \| null` end to end; `invoiceLinkIsLive` is the live test; `letterbox.tsx` no longer reads `useInvoiceLink` at all and opens `Settlement` in place behind an `aria-expanded` disclosure; `door-gate.tsx` falls back to `/?invoice=${encodeURIComponent(bundleOffer.invoiceId)}`. No href can be `/pay/undefined`. |
| Reset failure | **No** | No migration minted or edited this round. |

---

## 3. Gates — pasted tails

All run from the worktree with `pnpm --dir` / `--filter`. Never chained `cd`.

```
supabase type-check ............................... EXIT=0   (tsc --noEmit)
help-system type-check ............................ EXIT=0   (tsc --noEmit)
designer-portal type-check ........................ EXIT=0
admin-portal build ................................ EXIT=0
client-portal type-check .......................... EXIT=1   (pre-existing, not W4's)
client-portal jest --coverage ..................... EXIT=0
designer-portal jest (people/roster/accounts/help/analytics) EXIT=0
supabase vitest (people-crm-w4, use-invoices, people-crm-foundation) EXIT=0
help seed dry run ................................. 18 written, 0 errored
```

**admin-portal build** (`pnpm --dir apps/admin-portal build`):

```
> @patina/admin-portal@0.1.0 build
> next build --webpack

▲ Next.js 16.2.10 (webpack)
⚠ The "middleware" file convention is deprecated. Please use "proxy" instead.
  Creating an optimized production build ...
EXIT=0
```

**client-portal jest --coverage** (`pnpm --dir apps/client-portal test:coverage`):

```
Test Suites: 157 passed, 157 total
Tests:       2572 passed, 2572 total

All files                       |   77.33 |    73.13 |   77.05 |   79.71 |
 src/app/paperwork/[token]       |   95.00 |   100.00 |  100.00 |  100.00 |
 src/components/paperwork        |   97.94 |    91.75 |   97.14 |   98.78 |
 src/lib/utils/client-ip.ts      |  100.00 |   100.00 |  100.00 |  100.00 |
EXIT=0
```

Floor 70 / 60 / 70 / 70 — **held** on all four, with margin (77.33 / 73.13 / 77.05 / 79.71).

**client-portal type-check** (`pnpm --dir apps/client-portal type-check`) — EXIT 1, one error:

```
.next/types/app/page.ts(37,29): error TS2344: Type '{ __tag__: "/"; __param_position__: "first"; ... }'
  does not satisfy the constraint ...
EXIT=1
```

Generated output, not source. `git diff origin/main...HEAD -- apps/client-portal/src/app/page.tsx` is **empty** — the file is byte-identical to `origin/main`; the cause is its `HomePage(props?: {...})` optional parameter against Next 16's generated `PageProps`. Not W4's, but the paperwork report should stop asserting the opposite (m-23).

**designer-portal jest** (people, roster, accounts, help-system, analytics):

```
Test Suites: 61 passed, 61 total
Tests:       848 passed, 848 total
EXIT=0
```

**supabase vitest**:

```
Test Files  3 passed (3)
Tests       153 passed (153)
EXIT=0
```

**help seed dry run**:

```
[W4-help] dry-run: 18 written, 0 errored
```

---

## 4. Help — registry parity, caps, determinism

Machine-checked against `studios/help-system/scripts/people-help-content.json`:

```
docs: 18
unique ids: 18
all deterministic (no drafts./random ids): True
  helpContent.designer-portal--document--people--intro
  helpContent.designer-portal--document--people--empty
  helpContent.designer-portal--document--people--word--reach
  helpContent.designer-portal--document--people--word--consent
surfaceKeys: 17   missing in packages/help-system/src/surfaceKeys.ts: []   missing in the designer mirror: []
regex-invalid (^[a-z0-9-]+(/[a-z0-9-]+)+$): []
em-dashes (U+2014): 0
```

Caps checked against the **nested** Sanity shape (`tooltipContent.body`, `emptyStateContent.heading`/`.description`, `helpArticleContent`) — tooltip/fieldHelper body ≤160, emptyState heading ≤50, description ≤300: **0 violations**, longest tooltip body 157 chars.

Registry parity is complete in both directions: every one of the 17 surface keys exists in `packages/help-system/src/surfaceKeys.ts` **and** in `apps/designer-portal/src/lib/help-system/document-surface-keys.ts`. The residue is copy (m-10, m-11, m-16, m-17) and reachability (m-15).

---

## 5. Findings

### MAJOR

**M-1 — the seat window's consequence sentence claims it re-dates doors it does not re-date.** *(fresh)* Confidence: **high**.

`apps/designer-portal/src/components/document/roster/seat-window-band.tsx`:

```ts
export const WINDOW_CONSEQUENCE_SENTENCE =
  'The window bands this seat on the Call Sheet and dates the doors it holds. ' +
  'The change is recorded with whoever you say was told.';
```

"dates the doors it holds" is present-tense and unconditional: the reader is told that moving the window moves the expiry of the doors this seat already has. It does not. `create_field_link` (`supabase/migrations/00627_access_grants_and_field_link_window.sql:555-625`) computes `expires_at` **at mint** — `max(on_site_to, warranty_until) + interval '1 day'`, else the caller's date, else 90 days — and there is no re-dating trigger, rule or later `UPDATE` anywhere on `project_field_links`. The band writes the window through `updateParty.mutateAsync` and then records a notice; neither touches an issued link.

Proved against the local DB (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`) in a transaction that was rolled back — a field link minted against a window ending 2027-08-27, then the window narrowed by a day:

```
               link_id                |     before_expiry      | status | on_site_from | before_window | warranty_until
--------------------------------------+------------------------+--------+--------------+---------------+----------------
 c33e421c-c695-4b44-a208-d1b649cd71ea | 2027-08-28 00:00:00+00 | active | 2026-09-08   | 2027-08-27    |
UPDATE 1
               link_id                |      after_expiry      | status | after_window | door_still_open
--------------------------------------+------------------------+--------+--------------+-----------------
 c33e421c-c695-4b44-a208-d1b649cd71ea | 2027-08-28 00:00:00+00 | active | 2026-09-09   | t
```

The window moved; `expires_at` did not; the door is still open. A studio that shortens a seat's window because a trade left the job reads this sentence as "and their way in now ends then", closes the band, and leaves a live field link standing past the window it was told bounded it. This is a reader disagreeing with the record — **major**, not blocking: nothing is granted that was not already granted, and the revoke act on the access-grant list still closes the door on demand.

*Fix (copy, not behaviour — the mint-time derivation is the ruled design):* say what is true, e.g. "The window bands this seat on the Call Sheet and dates the doors minted from here on. Doors already open keep the dates they were given — close one from Access if the window moved under it." Alternatively make the claim true by re-dating `project_field_links.expires_at` from the new window in the same write, but that is a behaviour change and belongs to a ruling, not to a review.

### MINOR

All twenty-three r10 minors above remain open and are not restated here; their current evidence is in §1. Two are fresh this round.

**m-24 — the paperwork window helpers derive "today" from a UTC slice.** *(fresh)* Confidence: high.
`packages/supabase/src/hooks/use-paperwork-links.ts:100-104` `thirtyDaysOut` → `at.setDate(at.getDate() + 30); return at.toISOString().slice(0, 10);` and :135 `firmEngagementWindowEnd` → `const today = now.toISOString().slice(0, 10);`. Between 19:00 and midnight Central, `toISOString()` has already rolled to the next UTC date, so "thirty days" prints as thirty-one and "open seats" is filtered against tomorrow. Same family as m-4 and m-18, at two further sites; the R-CB sweep corrected the *reading* helpers but not these two *writing* ones. *Fix:* route both through the `STUDIO_TIME_ZONE` day helpers `use-touches.ts` already exports (`touchInstantIsoDay`).

**m-25 — `/paperwork/[token]` exports no route `metadata`.** *(fresh)* Confidence: medium.
`apps/client-portal/src/app/paperwork/[token]/page.tsx` has no `export const metadata`, where `/plans/[token]`, `/pay/[token]`, `/trade/[token]` and `/rfq/[token]` each set `robots: { index: false, follow: false }` **and** `referrer: 'no-referrer'`. The noindex half is covered — `middleware.ts:187-188` sets `Cache-Control: private, no-store` and `X-Robots-Tag: noindex, nofollow` on the bearer block, which `/paperwork/` joins. The uncovered half is the referrer policy: the page's 64-hex token sits in the URL path, and only the browser default (`strict-origin-when-cross-origin`) keeps it out of the `Referer` on the form's cross-origin POST to the edge function. `/field`, `/evidence` and `/share` set no metadata either, so the new door matches the majority of the existing precedent rather than breaking a contract — which is why this is minor and not major. *Fix:* add the four-line `metadata` block the other four bearer routes carry.

**Note on m-2 (severity).** The literal reading of the round-11 brief's major bar — "a reader disagreeing with the record" — fits m-2: `appliedCopy()` says "from this studio" over a write that stops the address at **every** studio. r9 and r10 both landed it at minor on the reasoning that the write's breadth is deliberate and mirrors the ruled inbound-STOP posture (a mailbox's verdict is the mailbox's), and that the copy **understates** rather than overstates what happened, so no one is surprised by a door still open. I hold that severity rather than re-litigate it a third time, and record the tension here so Fable can overrule it in one line if it wants to.

---

## 6. Surface checks

### The paperwork door (`/paperwork/[token]`)

| Check | Result | Evidence |
|---|---|---|
| No nav | **Pass** | The page renders `DeadLink()` or `PaperworkSheet` and nothing else; `app-chrome.tsx` excludes the `/paperwork` prefix from the header tree (bare and token forms both). No `<nav>`, no header, no footer link. |
| No homeowner data | **Pass** | `resolve_paperwork_link` returns the firm's own name, the expected doc types and the firm's own document states. No project, no client, no address, no other firm. |
| No caveat/schema words | **Pass** | `EXPECTED_DOC_TYPES`, `STATE_RANK`, `rowSentence`, `blocksSentence`, `reasonSentence` speak in "Current / Lapses in 30 days / Lapsed / Not on file" and plain sentences. No "COI record", no "holder_type", no "compliance_state", no column name reaches the page. |
| Mobile-first | **Pass** | Single-column sheet, disclosure rows, no table, no fixed width; the upload form stacks. |
| Keyboard-reachable | **Pass** | Every row is a real `<button>` disclosure with `aria-expanded`; receipts take focus via `receiptRefs`; the upload act uses `aria-disabled={state === 'sending'}` with a `if (state === 'sending') return;` guard rather than HTML `disabled`, so focus is never stolen mid-send; `aria-required={expiryRequired}` rather than HTML `required`, so the browser's own bubble never pre-empts the page's sentence. |
| Errors say what to do | **Partial** | The page's own refusals do ("Choose the file first.", "Give the date it expires.", "That did not go through. Try again."). The door's refusals are printed verbatim (m-13), and two of them send the reader to an owner who cannot help (m-14). Both minor, both r10 carry-overs. |
| A test per new client-portal file | **Pass** | `app/paperwork/[token]/page.tsx` → `__tests__/page.test.tsx`; `paperwork-model.ts`, `paperwork-sheet.tsx`, `paperwork-upload-form.tsx` → three suites under `components/paperwork/__tests__`; `app/pay/used/page.tsx` → `__tests__/page.test.tsx`; the modified `client-ip.ts`, `middleware.ts`, `letterbox.tsx`, `door-gate.tsx`, `app-chrome.tsx`, `posthog.ts`, `unsubscribe/page.tsx`, `api/unsubscribe/route.ts`, `pay/return/[nonce]/route.ts` each have their suite updated. Coverage holds (§3). |
| Rate limit cannot be switched off by a header (R-CA) | **Pass** | `normalizeCallerIp` strips `ip:port` and `[v6]:port`, validates v4 strictly and v6 by shape-with-a-colon, returns null otherwise; `paperwork_link_rate_limit_hit(text, text, integer)` buckets by the link's own row id when the address is unreadable. `limitError` refuses. |

### Designer surfaces

| Check | Result | Evidence |
|---|---|---|
| Two-step confirms | **Pass** | `inbound-queue-band.tsx` confirms and rejects both behind an explicit second panel; the reject panel holds its act until a reason is written (`held={!reasonWritten} disabled={!reasonWritten}` + `aria-describedby={heldId}`). `seat-window-band.tsx` and `paperwork-link-act.tsx` both open a panel before they write. |
| PR-n gating | **Pass** | The mint band is an R-AD radio choice (thirty days / the firm's window) with no free date entry; nothing is minted until the leader act is taken. |
| Invalidations | **Pass** | `useMintPaperworkLink` → `paperworkLinkKeys.forCompany` + `accessGrantKeys.all`. `useRevokeAccessGrant` adds `['paperwork-links']`. `invalidateInbound` → `inboundDocumentKeys.all` + `invalidateComplianceFanout(holderId)` + `complianceKeys.all`. `useRecordNotice` → `touchKeys.all`. Checked for a gap: `00637` writes **no** `studio_touches` row (grep for `record_touch`/`studio_touches` in the file is empty), so the inbound acts owe no touch invalidation. |
| aria-disabled not disabled | **Pass, with a house-wide caveat** | `DocumentAction` renders `disabled={unavailable && !held}` and adds `aria-disabled` via `heldMark`, so `held={cond} disabled={cond}` is the correct idiom and every new W4 band uses it for its gated acts. The `loading` path still natively disables (m-22) — pre-existing in an unchanged file. |
| Document grammar | **Pass** | Consequence sentences on every act; `DocumentActionRow`/`Group` for regions; the ≤1-leader guard is satisfied in each new band (`primary` + `tertiary`, or `danger` + `tertiary`). |
| DocSheet | **Pass** | The new bands mount inside the existing card/sheet frames; no new modal, no new overlay. |
| Consequence sentences are true | **FAIL (M-1)** | `WINDOW_CONSEQUENCE_SENTENCE` — §5. |
| Hooks above early returns / hydration gate | **Pass** | Every new component declares its hooks before any conditional return; `paperwork-sheet.tsx` and `paperwork-upload-form.tsx` are client components with no pre-hydration branch. |
| `@patina/supabase` only, canonical keys | **Pass** | All four new hook modules export their own `*Keys` factories and every face reads through them; no ad-hoc `fetch` to Supabase from a designer component. |
| `@patina/types`, `ui/controls` + design-system | **Pass** | No redefined domain type; controls come from the portal's `ui/controls`. |
| Analytics via `people-events.ts` | **Pass** | `peopleEvents.grantMinted({tier:'paperwork_link', …})`; no direct `posthog.capture` in a new band. |
| dist rebuilds | **Pass** | `packages/supabase` and `packages/help-system` both type-check clean and the admin build (which consumes both dists) is EXIT=0. |

---

## 7. What I did not run, and why

- **Playwright**: not run this round. No new or changed e2e spec on the branch (`git diff --name-status` over the W4 base touches no `e2e/` file), and the surfaces this round's finding concerns is a copy claim provable from the schema and the DB directly, which it was. Nothing was started on 3000 or 3002, so the port rule did not engage.
- **`supabase db push` / `functions deploy` / secrets**: forbidden by the brief and not attempted.

---

## 8. Verdict

**0 blocking. 1 major (M-1, fresh). 25 minor (23 carried from r10, 2 fresh).** Not clean.

The wave's machinery is sound: the door verifies before it reads, the limiter cannot be turned off by a header, no verified document can be overwritten, every new table is tenant-scoped with RLS and a member predicate, the help registries are in parity with zero cap violations and deterministic ids, every new client-portal file ships with a test, and the coverage floor holds with margin. The one thing that stops it being clean is a sentence: the seat-window band tells a studio that moving a window re-dates the doors that seat already holds, and the database says it does not.
