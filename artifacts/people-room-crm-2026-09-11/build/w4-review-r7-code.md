# W4 surfaces + help — adversarial code review, round 7

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`, branch
`build/people-room-crm-2026-09-11`. Changed-file baseline `0f671b149` (the W4 data+edge
commit), HEAD `d2c8069fc`.

**Verdict: NOT clean — 0 blocking, 4 major, 17 minor.**

Read in full this round: the three surface reports (`w4-paperwork-report.md`,
`w4-studio-report.md`, `w4-help-report.md`), the r6 fix log and r6 review, and every changed
file under `apps/client-portal/src`, `apps/designer-portal/src`,
`packages/supabase/src/hooks`, `packages/help-system/src`, `studios/help-system/scripts`,
plus the migrations and edge functions those files stand on (00635–00638,
`paperwork-upload/core.ts`, `_shared/invoice-links.ts`, `_shared/invoice-checkout-driver.ts`,
`_shared/send-email.ts`, `invoice-send`, `sms-inbound/pipeline.ts`) and
`docs/design/the-document/upload-door-spec.md`.

No server was started; ports 3000 and 3002 were never bound. No prod mutation: no `db push`,
no `functions deploy`, no `secrets set`. No `.env.local` was created and no key was printed.

---

## 1. Prior round re-checked — every r6 finding

Source: `.../build/w4-fix-log-r6.md`, which states plainly that **R-BT, R-BU and R-BV are
NOT in this pass**. Those three are therefore carried forward as findings below, not as
fix-log misses.

| r6 finding | State | Evidence |
|---|---|---|
| **M-1** bounce band said "this invoice has no link yet" on every invoice it could appear on | **FIXED** | `invoice-folio.tsx:815-820` now branches three ways on `linkIsLive` / `linkHasExpired` / else, and the live branch says the address is shown once and that regenerating kills the address already sent. R-BW satisfied. |
| **m-1** designer-portal unsubscribe landing drops `scope` | **OPEN** | The client-portal pair (`app/api/unsubscribe/route.ts` → `app/preferences/unsubscribe/page.tsx`) forwards and speaks from `scope`; the designer-portal copy still speaks one outcome. |
| **m-2** minted invoice address parked in the query cache | **OPEN, and worse than r6 measured** | Promoted to **M-1 (r7)** below: four mutations now explicitly invalidate that key, so eviction is deterministic, not a refetch race. |
| **m-3** paperwork report §1/§4 stale | **OPEN** | §1 still says the page calls `notFound()`; `app/paperwork/[token]/page.tsx` renders a local `DeadLink()` at HTTP 200 (`data-testid="paperwork-dead-link"`). §4 still claims an e2e uuid/token grep assertion that no spec contains. |
| **m-4** test counts wrong in all three reports | **OPEN** | Measured this round: 23 / 11 / 12 / 7 / 8 / 11 / 3 / 9 / 47 across the named suites; the reports' numbers do not match. |
| **m-5** help comment + seed-script docstring wrong | **OPEN** | `studios/help-system/scripts/people-help-content.ts:42-53` still says the twelve concept keys are NOT promoted — they are, in both registries (validator below: 0 missing). `seed-people-help.ts` still names `CallSheet.SiteAccess` / `CallSheet.BringForward`, which exist in neither registry, and its per-surface doc counts are wrong. |
| **m-6** UTC where the studio clock is Chicago | **OPEN** | `people-format.ts` `lastOpenDay`, `use-paperwork-links.ts` `thirtyDaysOut` and `firmEngagementWindowEnd` all slice `toISOString()`; `paperwork-link-act.tsx` writes `` `${chosenDay}T23:59:59Z` ``, which closes the door at ~18:00 Chicago on the day the designer named. `touchInstantDay` (Chicago, via `Intl`) is the correct pattern and is used for grant rows. |
| **m-7** bare `/paperwork` asymmetry | **OPEN** | `middleware.ts` gates on `pathname.startsWith('/paperwork/')` only; `app-chrome.tsx` `PUBLIC_PREFIXES` carries the bare `'/paperwork'` and matches `pathname === prefix`. `/pay` has both legs. A bare `/paperwork` request is chrome-free but not no-store/noindex. |
| **m-8** upload-form error region | **OPEN** | `paperwork-upload-form.tsx` mounts the error `<p role="status">` only when there is an error, so the first failure is announced only by luck of the re-render; it is `status`, not `alert`, and the file input has no `aria-describedby` pointing at it. |
| **m-9** seat-window-band held state | **OPEN but weakened** | `record_notice`, `confirm_inbound_document` and `reject_inbound_document` all gate on `is_active_studio_member` (any member), so no owner/admin held state is owed. What remains is only that the band offers no held explanation for a non-member viewer, who cannot reach the surface anyway. |
| **m-10** `resolve_paperwork_link` supersession walk | **OPEN** | 00637 filters `superseded_by IS NULL` flat; `compliance_state` walks the chain transitively. A two-hop supersession can present differently on the two faces. |
| **m-11** `touchKeys.list()` does not dedupe | **OPEN** | `use-touches.ts` — `useTouches` dedupes `subjectIds` before the fetch, `touchKeys.list()` does not, so two renders with the same set in a different order (or with a duplicate) key two cache entries for one query. |
| **m-12** `today = new Date()` default param | **OPEN** | `company-card.tsx` takes `today = new Date()` as a default parameter, so every render produces a new identity and the downstream `useMemo` never hits. |
| **m-13** client-portal type-check RED | **OPEN, pre-existing** | Confirmed not W4: the erroring file `apps/client-portal/src/app/page.tsx` was last touched in `7ff6c085d` (2026-09-07), and `git merge-base --is-ancestor 7ff6c085d 0f671b149` succeeds. |

---

## 2. Blocking criteria — all eight ruled out

| Criterion | Finding |
|---|---|
| Token accepted without verification | **No.** `resolve_paperwork_link` matches `token_hash = encode(digest(p_token,'sha256'),'hex')` and requires `revoked_at IS NULL AND expires_at > now()`. The page pre-validates `/^[0-9a-f]{64}$/` and calls `paperwork_link_rate_limit_hit(p_ip)` first. `paperwork-upload/core.ts` re-resolves the token server-side and takes org and company from the token row, never from the request body. |
| Verified document overwritten | **No.** `record_inbound_compliance_document` INSERTs a new row `inbound = true, verified_at = null`; supersession is by `superseded_by`. Nothing UPDATEs a verified row. |
| Cross-tenant read/write | **No.** `studio_touches` and `paperwork_link_tokens` RLS is `is_active_studio_member(organization_id)`. The guest write path is service-role inside the edge function and stamps org/company from the resolved token. |
| RLS / grant / storage-policy hole | **No.** The `compliance-documents` bucket has no anon INSERT policy; SELECT is studio-member only. `record_touch` is `service_role`; `record_notice`, `confirm_inbound_document`, `reject_inbound_document` are `is_active_studio_member`-gated. The twelfth access-grant tier `paperwork_link` revokes through `revoke_paperwork_link(p_token_id, p_reason)`. |
| Email to a dead/unsubscribed channel | **No.** `channelRefusesSend(channel.status)` still short-circuits in `_shared/send-email.ts`. |
| Forged unsubscribe crossing subjects | **No.** Tokens are HMAC-signed (`packages/notifications/src/tokens.ts`); the channel leg resolves an id then writes by that row's own `value`. |
| `/pay` link broken by the backfill | **No.** 00636 writes `token_hash` before nulling `token`; the backfill sets active rows to `now() + 30d`; `parseInvoiceLink` keeps the row but refuses a null token, so no `/pay/null` reaches a clipboard or an `href`. (The *return-nonce* rotation is a separate defect — M-3 below — not the backfill.) |
| Reset failure | **Not applicable.** No migration minted this round; the local DB replays clean and the reserved band 00595–00620 was not touched. |

---

## 3. Findings

### M-1 — MAJOR (confidence: high) — R-BV is not implemented, and four acts now evict the one-time address
**`packages/supabase/src/hooks/use-invoices.ts:393`, plus `useRegenerateInvoiceLink.onSuccess`**

R-BV rules that the minted address lives in component state and that the
`['invoice-link', id]` invalidation is dropped. Neither happened.

```ts
function invalidateInvoiceEffects(queryClient, projectId?, invoiceId?) {
  queryClient.invalidateQueries({ queryKey: ['invoices'] });
  if (invoiceId) {
    queryClient.invalidateQueries({ queryKey: ['invoice-link', invoiceId] });  // R-BV: drop this
  }
  ...
}
```

and the mint still writes into that same key:

```ts
onSuccess: (link, { invoiceId }) => {
  queryClient.setQueryData(['invoice-link', invoiceId], link);
},
```

Since 00636, `get_invoice_link` returns `token: NULL` unconditionally, so a refetch of that
key replaces the minted address with a row `parseInvoiceLink` reports as address-less, and
`invoice-folio.tsx:686` unmounts Copy (`canShareLink && clientInvoiceUrl`).
`invalidateInvoiceEffects` is called with `invoiceId` by **`useIssueInvoice` (1011)**,
**`useRecordPayment` (1057)**, **`useSendInvoice` (1117)** and **`useVoidInvoice` (1538)**.
So: designer regenerates a link, the folio prints *"This address is shown once. Copy it now —
reopening this folio will not show it again."*, and then any of Record payment / Send /
Void — all one click away in the same folio — deletes the address before it is copied. r6
graded this medium-confidence minor on a refetch race; with these four call sites it is
deterministic and the copy on screen makes a promise the cache immediately breaks.

*Fix:* implement R-BV — hold the minted address in the folio's own state, and delete line 393.

---

### M-2 — MAJOR (confidence: high) — R-BU is not implemented; the firm's page contradicts itself
**`supabase/migrations/00637_paperwork_upload_door.sql` (`resolve_paperwork_link`) and
`apps/client-portal/src/components/paperwork/paperwork-model.ts`**

R-BU rules one row per doc *type*, with `awaiting_check` as a *state*. The RPC still returns
one row per *document* with `awaiting_check` as a boolean flag
(`doc.inbound AND doc.verified_at IS NULL AND doc.rejected_at IS NULL`), and
`PaperworkDocument.state` is `'current' | 'lapses_soon' | 'lapsed'` — there is no
`'awaiting_check'` member. `buildPaperworkRows` folds a pending document into a
receipt-only contribution, so a firm whose only COI is the one it just uploaded reads, on one
page:

> COI, general liability is not on file.
> Received. {Studio} will confirm it.

Two sentences about one document, one line apart, that disagree. The record is unambiguous
(a row exists, unverified); the reader is not.

*Fix:* implement R-BU — group in SQL by doc type and return `state = 'awaiting_check'`, then
add that member to the client union and give it its own sentence in `rowSentence`.

---

### M-3 — MAJOR (confidence: high) — R-BT is not implemented; Cancel at Stripe kills the emailed /pay address
**`supabase/functions/_shared/invoice-checkout-driver.ts:195-205`,
`supabase/migrations/00636_invoice_link_hardening.sql`,
`apps/client-portal/src/app/pay/return/[nonce]/route.ts`**

R-BT rules that cancel never rotates and that the nonce rotates at most once. Neither holds.
`invoiceCheckoutReturnBase` returns the nonce address for **both** `'success'` and
`'cancelled'`, and `resolve_invoice_return_nonce` rotates the token unconditionally. So a
homeowner who opens the emailed `/pay/<token>`, reaches Stripe and presses **Cancel** lands
on `/pay/return/<nonce>`, which rotates — and the address in their inbox is now dead. Worse,
the route is a plain GET: a refresh or a back-button re-issue rotates a second time and kills
the address the browser is currently sitting on. 00636's own banner names this as a "KNOWN
HAZARD" rather than closing it.

*Fix:* implement R-BT — route `cancelled` back to the un-rotated `/pay/<token>`, and make
`resolve_invoice_return_nonce` idempotent (consume the nonce, return the already-rotated
token on a repeat).

---

### M-4 — MAJOR (confidence: medium) — a refused document vanishes from the firm's only face, without a word
**`supabase/migrations/00637_paperwork_upload_door.sql` (`resolve_paperwork_link`),
`docs/design/the-document/upload-door-spec.md` §3**

`resolve_paperwork_link` filters `AND doc.rejected_at IS NULL`. So after a studio presses
Reject in `inbound-queue-band.tsx` — supplying the required reason, which 00637 stores in
`rejection_reason` — the firm's `/paperwork/<token>` page silently reverts from *"Received.
{Studio} will confirm it."* to *"{Doc type} is not on file."* The refusal and its reason are
in the record and reach nobody: the chase is an agent draft that lands `awaiting_review`, and
Agent OS forbids automated external sends. The firm re-uploads the same rejected paper, or
concludes the upload never arrived.

Spec §3's copy table has four states (current / lapsing / lapsed / not on file) and no
refused state, so this may be a panel decision owed rather than a coding slip — but as built,
a studio act that the product treats as a communication produces no communication, and the
firm's reader disagrees with what actually happened to its document.

*Fix:* either return the rejected row with a `refused` state and a sentence that names the
reason, or rule explicitly that the refusal travels by a human-sent message and say so in
§3.

---

### m-1 — MINOR (confidence: high)
**`apps/designer-portal/src/app/.../unsubscribe` landing copy**

The client-portal pair forwards `scope` and `appliedCopy()` branches on it; the
designer-portal landing still speaks a single outcome, so a scoped unsubscribe reads as a
total one on that portal. Carried from r6.

### m-2 — MINOR (confidence: high) — report accuracy, never holds the gate
**`.../build/w4-paperwork-report.md` §1**

§1 says the route calls `notFound()` on a bad or dead token. It does not: it renders a local
`DeadLink()` at HTTP 200 with `data-testid="paperwork-dead-link"`, which is the better
behaviour (an enumerable 404 tells a scanner which tokens exist). The report is wrong about
its own code.

### m-3 — MINOR (confidence: high) — report accuracy
**`.../build/w4-paperwork-report.md` §4**

§4 claims an e2e assertion that greps the page for uuids/tokens. No spec in
`apps/client-portal/e2e` contains such an assertion.

### m-4 — MINOR (confidence: high) — report accuracy
**All three surface reports**

Test counts do not match the suites. Measured this round: 23 / 11 / 12 / 7 / 8 / 11 / 3 / 9 /
47.

### m-5 — MINOR (confidence: high) — comment accuracy
**`studios/help-system/scripts/people-help-content.ts:42-53`,
`studios/help-system/scripts/seed-people-help.ts`**

The first says the twelve concept keys are NOT promoted to `surfaceKeys.ts`; they are, in
both registries (validator: 0 missing in canonical, 0 missing in the mirror). The second
names `CallSheet.SiteAccess` and `CallSheet.BringForward`, which exist in neither registry
(the real keys are `CallSheetSiteAccess`, `CallSheetBringForward`, `CallSheetSiteAccessTold`),
and its per-surface document counts are wrong.

### m-6 — MINOR (confidence: medium)
**`apps/designer-portal/src/components/document/people/people-format.ts` (`lastOpenDay`),
`packages/supabase/src/hooks/use-paperwork-links.ts` (`thirtyDaysOut`,
`firmEngagementWindowEnd`),
`apps/designer-portal/src/components/document/people/paperwork-link-act.tsx`**

All four compute the studio's day in UTC (`toISOString().slice(0,10)`) where the studio clock
is `America/Chicago` — the pattern `touchInstantDay` already establishes in `use-touches.ts`.
`` `${chosenDay}T23:59:59Z` `` additionally closes the paperwork door at ~18:00 Chicago on the
day the designer named, so a firm told "open through Friday" finds it shut on Friday evening.

### m-7 — MINOR (confidence: medium)
**`apps/client-portal/src/middleware.ts` vs
`apps/client-portal/src/components/layout/app-chrome.tsx`**

`middleware.ts` has only the `startsWith('/paperwork/')` leg; `app-chrome.tsx` also matches
the bare `'/paperwork'`. `/pay` carries both legs in both files. A bare `/paperwork` request
therefore renders chrome-free but without the no-store/noindex headers.

### m-8 — MINOR (confidence: low)
**`apps/client-portal/src/components/paperwork/paperwork-upload-form.tsx`**

The error paragraph is conditionally mounted rather than a persistent live region, is
`role="status"` rather than `role="alert"`, and the file input carries no `aria-describedby`
pointing at it. The sheet's own live region (`paperwork-sheet.tsx`) is done correctly and is
the pattern to copy.

### m-9 — MINOR (confidence: low) — weakened from r6
**`apps/designer-portal/src/components/document/roster/seat-window-band.tsx`**

r6 wanted a held state for a viewer without rights. `record_notice` gates on
`is_active_studio_member` (any member), so every viewer who can reach the band can perform
the act; nothing is owed beyond the existing honest two-write failure sentence.

### m-10 — MINOR (confidence: low)
**`supabase/migrations/00637_paperwork_upload_door.sql`**

`resolve_paperwork_link` filters `superseded_by IS NULL` flat where `compliance_state` walks
the supersession chain transitively. A two-hop chain can read differently on the firm's face
and the studio's.

### m-11 — MINOR (confidence: medium)
**`packages/supabase/src/hooks/use-touches.ts`**

`useTouches` dedupes and sorts `subjectIds` before fetching; `touchKeys.list()` does not, so
the same logical query can occupy two cache entries.

### m-12 — MINOR (confidence: medium)
**`apps/designer-portal/src/components/document/people/company-card.tsx`**

`today = new Date()` as a default parameter mints a fresh identity every render and defeats
the downstream `useMemo`.

### m-13 — MINOR (confidence: high) — context, not a W4 defect
**`apps/client-portal` type-check**

RED, pre-existing:

```
.next/types/app/page.ts(37,29): error TS2344: Type '{ searchParams?: Promise<Record<string, string | string[] | undefined>> | undefined; } | undefined' does not satisfy the constraint 'PageProps'.
  Type 'undefined' is not assignable to type 'PageProps'.
```

`apps/client-portal/src/app/page.tsx` was last touched in `7ff6c085d` (2026-09-07), an
ancestor of the W4 base `0f671b149`. `.next/types/app/paperwork/[token]/page.ts` exists, so
the new route **is** inside the type-check's reach and contributes no error of its own.

### m-14 — MINOR (confidence: high) — pre-existing
**`packages/supabase/src/hooks/use-coordination.ts:722`**

Still calls `project_consent_org`, which R-BD retires. Not introduced by W4, but it sits in
a file W4 edits and will outlive the wave if nobody claims it.

### m-15 — MINOR (confidence: high) — comment accuracy
**`apps/client-portal/src/lib/analytics/posthog.ts`**

The regex now covers seven prefixes (`share|rfq|evidence|plans|pay|trade|paperwork`); the
comment above it still says "one generic pattern covers all six".

### m-16 — MINOR (confidence: medium)
**`apps/client-portal/src/app/paperwork/[token]/page.tsx`**

The rate-limit gate is `if (!limitError && withinLimit === false)` — it fails **open**. A
malformed `x-forwarded-for` with no `cf-connecting-ip` makes Postgres raise `22P02` on the
inet cast, `limitError` is truthy, and the resolve proceeds unthrottled. (`
paperwork_link_rate_limit_hit` returns true on a NULL ip, so the NULL case is closed; the
cast-error case is not.) Fail-open is arguably the right default for a door a real firm needs
to reach — but it is unremarked, and it is the one path an enumerator controls.

### m-17 — MINOR (confidence: medium)
**`apps/designer-portal/src/components/document/roster/seat-window-band.tsx`**

Every other new act in this wave emits through `people-events.ts` (`grantMinted`,
`noticeRecorded`, …). The seat-window band writes the window and the notice and emits
nothing, so the one act that changes who may be on site is invisible in the funnel.

---

## 4. Convention checks

| Rule | Result |
|---|---|
| `@patina/supabase` hooks, canonical keys, complete invalidations | Holds, with the R-BV exception at M-1. `touchKeys`, `paperworkLinkKeys`, `inboundDocumentKeys` follow the `all`/`forX`/`list` shape; `invalidateInbound` fans out through `invalidateComplianceFanout` + `complianceKeys.all`; `useMintPaperworkLink` invalidates `paperworkLinkKeys.forCompany` + `accessGrantKeys.all`; `useUpdateProjectParty` invalidates project-parties, project-roster, `peopleKeys.all`, `peopleSeatKeys.all` and client households. |
| Hooks above early returns; hydration gate | Holds. `roster-row.tsx` has no return before its hooks (the only `return` at 134 is inside a helper; 734 is the JSX). `company-card.tsx`, `inbound-queue-band.tsx`, `paperwork-link-act.tsx`, `seat-window-band.tsx` all declare hooks unconditionally. |
| `@patina/types`; `ui/controls` + design-system | Holds; no local re-definition of a shared domain type, no raw `<button>`/`<input>` in the new designer bands. |
| Analytics via `people-events.ts` | Holds except m-17. |
| Document grammar; DocSheet | Holds. The new bands are sentences about the record, not labels; `DocSheet` is used for the sheets. |
| `aria-disabled`, never `disabled` | Holds. `DocumentAction` renders `disabled={unavailable && !held}` and `aria-disabled="true"`, so a held act keeps focus; the reject-reason hold in `inbound-queue-band.tsx` prints `REJECT_HELD_SENTENCE` and wires `aria-describedby`. `paperwork-upload-form.tsx` uses `aria-disabled` with an early return, and `aria-required` never HTML `required`. |
| dist rebuilds | `@patina/supabase` and `@patina/help-system` type-checks are clean against the built dists; the admin-portal build (which consumes them) is green. |
| Paperwork page: no nav, no homeowner data, no caveat/schema words, mobile-first, keyboard-reachable, errors say what to do | Holds. `app-chrome.tsx` excludes `/paperwork`; the page reads only the resolved token row (studio name, doc types, expiries) and no homeowner record; no "schema", "caveat", "compliance object" language; the sheet is single-column with a persistent `aria-live` region and focus moved to the receipt paragraph; `DeadLink()` tells the reader to ask the studio for a fresh link. |
| Every new client-portal file ships with a test | Holds. `git diff --name-status 0f671b149..HEAD` shows 4 new source files under `apps/client-portal/src` and 4 matching `__tests__` siblings. |
| Two-step confirms; PR-n gating | Holds. `inbound-queue-band.tsx` and `paperwork-link-act.tsx` both arm then confirm; the revoke route goes through `revoke_paperwork_link` with a required reason. |
| Playwright chromium-pinned, no `waitForTimeout`, `expect.poll` for DB | Holds. The client config declares only a `chromium` project; the designer spec opens `test.skip(({ browserName }) => browserName !== 'chromium')`; zero `waitForTimeout` in the new specs; `expect.poll` at `paperwork-link.spec.ts:258` and `paperwork-inbound.spec.ts:209,247,284`. |
| Help: keys in both registries, caps, deterministic ids, no em-dashes | Holds — see §5. |

---

## 5. Gate tails

**designer-portal type-check**

```
> @patina/designer-portal@0.1.0 type-check
> tsc --noEmit

EXIT=0
```

**`@patina/supabase` type-check** — clean, EXIT=0.
**`@patina/help-system` type-check** — clean, EXIT=0.

**client-portal type-check** — RED, pre-existing (m-13):

```
.next/types/app/page.ts(37,29): error TS2344: Type '{ searchParams?: Promise<Record<string, string | string[] | undefined>> | undefined; } | undefined' does not satisfy the constraint 'PageProps'.
  Type 'undefined' is not assignable to type 'PageProps'.
```

**client-portal jest --coverage**

```
Test Suites: 156 passed, 156 total
Tests:       2555 passed, 2555 total

All files                          |   77.29 |    73.01 |   77.01 |   79.66
 src/app/paperwork/[token]         |   95    |   100    |  100    |  100
 src/components/paperwork          |   98.92 |    91.13 |   96.96 |   99.37
 src/app/api/unsubscribe           |  100    |    90.9  |  100    |  100
 src/app/preferences/unsubscribe   |   78.26 |    81.81 |  100    |   85.71
```

Floor 70/60/70/70 — **HOLDS**, globally and on every new directory.

**designer-portal jest** (people / roster / accounts / help-system)

```
Test Suites: 54 passed, 54 total
Tests:       796 passed, 796 total
```

**@patina/supabase vitest** (people-crm-w4, use-invoices, people-crm-foundation)

```
Test Files  3 passed (3)
Tests  153 passed (153)
```

**admin-portal build after the shared edits** — EXIT=0, full route table printed (includes
`ƒ /preferences/unsubscribe`).

**Help key + cap validator** (both registries, all 18 documents)

```
count 18
missing canonical: []
missing mirror: []
bad regex: []
dup ids: []  dup triples: []
cap issues: []
dashes: []
article shape: []
types: { fieldHelper: 4, emptyState: 1, tooltip: 12, helpArticle: 1 }
```

**Help seed dry run** (default mode; `--commit` not passed, nothing written to Sanity)

```
[W4-help] dry-run: 18 written, 0 errored
```

All 18 lines carry deterministic `_id`s; block `_key`s are `phb1..phb6` / `phb1s1..`.

---

## 6. What would make this clean

M-1, M-2 and M-3 are three rulings the fix log says were deliberately deferred — R-BV, R-BU,
R-BT. Implementing them closes three of the four majors. M-4 needs a panel sentence (or a
`refused` state) before it can be coded. The seventeen minors, by the brief's own rule, never
hold the gate; m-2 through m-5 are report and comment accuracy and can be swept in one pass.
