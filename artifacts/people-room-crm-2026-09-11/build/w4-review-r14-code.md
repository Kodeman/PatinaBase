# W4 — adversarial code review, round 14 (surfaces + help)

Worktree: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`
Branch: `build/people-room-crm-2026-09-11`
Scope read in full: `w4-paperwork-report.md`, `w4-studio-report.md`, `w4-help-report.md`, and every
changed file under `apps/client-portal/src`, `apps/designer-portal/src`,
`packages/supabase/src/hooks`, `packages/help-system/src`, `studios/help-system/scripts`.
Settled and not re-litigated: every ruling in `rulings.md` §3 (R-A … R-CB).

## Verdict

**0 blocking · 0 major · 33 minor — clean = true.**

Round 13's fix log (`w4-fix-log-r13.md`) touched only data/edge `MAJOR-1` and QA `F-2`; it states
plainly that "Every other finding in … `w4-review-r13-code.md` … Not in this round's scope." So all
30 code minors from r13 were re-checked individually against current source. All 30 are **OPEN**.
Three fresh minors are added (m-31 … m-33). Nothing in this wave meets any blocking criterion and
nothing meets the major bar.

---

## 1. Blocking criteria — each checked, none met

| # | criterion | verdict | evidence |
|---|---|---|---|
| B-a | a token accepted without verification | **not met** | `apps/client-portal/src/app/paperwork/[token]/page.tsx` — `PAPERWORK_TOKEN_PATTERN = /^[0-9a-f]{64}$/` gates before any round-trip; then `admin.rpc('paperwork_link_rate_limit_hit', …)` (fails closed: `if (limitError \|\| withinLimit === false)` refuses); only then `admin.rpc('resolve_paperwork_link', { p_token })`, a service-role-only SECURITY DEFINER that hashes and matches. `if (error \|\| !context) return <DeadLink />`. |
| B-b | a verified document overwritten | **not met** | `record_inbound_compliance_document` (00637) INSERTs a new `studio_compliance_documents` row with `inbound = true`, `verified_at = null`; it never UPDATEs an existing verified row. `confirm_inbound_document` / `reject_inbound_document` only stamp the inbound row they are given. |
| B-c | cross-tenant read/write | **not met** | `studio_touches`, `paperwork_link_tokens` and the 00637 RPCs all gate on `is_active_studio_member(organization_id)`; `useInboundDocuments` / `usePaperworkLinks` filter by holder/company and lean on that RLS. The guest page never reads with a user JWT — it uses the admin client server-side and returns only the resolved context. |
| B-d | RLS / grant / storage-policy hole | **not met** | `paperwork_link_storage_context` returns only the bucket path the resolved token owns; the upload rail is the `paperwork-upload` edge function (service role, server-side), never a client-side storage write. No new grant widens a role. |
| B-e | email sent to a dead/unsubscribed channel | **not met** | W4 adds no send path. The one new outbound-adjacent change is the r13 `resend-webhook` mirror, which only *adds* suppression. |
| B-f | a forged unsubscribe crossing subjects | **not met** | `apps/client-portal/src/app/api/unsubscribe/route.ts` still resolves the token to a channel id before any write; `scope` is carried for copy, never as authority. |
| B-g | a `/pay` link broken by the backfill | **not met** | `supabase/migrations/…00636…sql` computes `token_hash = invoice_link_token_hash(token)` (lines 162–164) **before** `UPDATE public.invoice_links SET token = NULL` (line 204). Emailed addresses keep resolving by hash. |
| B-h | reset failure | **not met** | The branch replays clean; no migration was minted this round, and 00637 is the highest on the branch (above the reserved 00595–00620 band). |

---

## 2. Gates (tails pasted)

```
@patina/supabase   type-check ......................... EXIT=0
packages/help-system type-check ....................... EXIT=0
designer-portal    type-check ......................... EXIT=0
client-portal      type-check ......................... EXIT=1
    .next/types/app/page.ts(37,29): error TS2344: Type '{ searchParams?: … } | undefined'
    does not satisfy the constraint 'PageProps'.
    → generated output, pre-existing. `git diff 0249e1eff..HEAD -- apps/client-portal/src/app/page.tsx`
      is EMPTY; `apps/client-portal/.gitignore:10` ignores `/.next/`. Filed as m-12, minor,
      not caused by this wave.
admin-portal       build ............................. EXIT=0 (full route table; ƒ /preferences/unsubscribe present)
```

```
client-portal  jest --coverage
    Test Suites: 157 passed, 157 total
    Tests:       2574 passed, 2574 total
    All files                        |   77.36 |   73.15 |   77.08 |   79.73
     src/app/paperwork/[token]        |   95    |  100    |  100    |  100
     src/components/paperwork         |   97.63 |   92.07 |   97.36 |   98.32
      paperwork-model.ts              |   97.77 |   90.16 |  100    |   98.63 | 201
      paperwork-sheet.tsx             |   96.29 |  100    |  100    |   95.83 | 32,37
      paperwork-upload-form.tsx       |   98.5  |   91.66 |   88.88 |  100    | 119,178
    Floor 70/60/70/70 — HOLDS on all four axes.

designer-portal jest (13 W4 suites) ..... 13 suites / 274 tests, all pass
packages/supabase vitest (3 files) ...... 3 files / 153 tests, all pass
help dry-run seed ....................... 18 written, 0 errored (no --commit)
help validator .......................... 18 docs, 17 distinct surfaceKeys, 0 missing canonical,
                                          0 missing mirror, 0 regex-invalid, 0 duplicate _ids,
                                          0 duplicate triples, 0 em-dashes, 0 en-dashes,
                                          caps OK (max tooltip body 157 ≤ 160)
```

### Every new client-portal file ships with a test

`git diff --diff-filter=A --name-only 0249e1eff..HEAD -- apps/client-portal/src`:

```
app/api/unsubscribe/__tests__/route.test.ts
app/paperwork/[token]/__tests__/page.test.tsx
app/paperwork/[token]/page.tsx
app/pay/used/__tests__/page.test.tsx
app/pay/used/page.tsx
app/preferences/unsubscribe/__tests__/page.test.tsx
components/paperwork/__tests__/paperwork-model.test.ts
components/paperwork/__tests__/paperwork-sheet.test.tsx
components/paperwork/__tests__/paperwork-upload-form.test.tsx
components/paperwork/paperwork-model.ts
components/paperwork/paperwork-sheet.tsx
components/paperwork/paperwork-upload-form.tsx
```

Five new non-test files, five matching `__tests__` files, plus two tests added for pre-existing
files. No new client-portal file lacks a test.

---

## 3. Surface checks

### Paperwork page (`/paperwork/[token]`)

- **No nav** — `apps/client-portal/src/components/layout/app-chrome.tsx` carries `'/paperwork'` in
  `PUBLIC_PREFIXES`; the shell renders `data-portal-shell="public"` with no nav tree. Verified in
  the page test.
- **No homeowner data** — the resolved context carries firm/paper/expiry only; `DeadLink()` names no
  firm, studio or paper and offers no destination.
- **No caveat/schema words** — grepped the whole `components/paperwork` tree and the page: no
  "caveat", "schema", "record", "row", "field", "RLS", "RPC" in rendered copy.
- **Mobile-first** — single column, `max-w-*` wrappers, no fixed widths; the upload form stacks.
- **Keyboard-reachable** — disclosure is a real `<button>` with `aria-expanded` / `aria-controls`
  pointing at a live id; the r12 M-1 fix (button always mounted, panel `hidden`, focus moved into the
  panel on open) is verified present in `paperwork-sheet.tsx`.
- **Errors say what to do** — with the one exception filed as m-13, where the edge function's own
  refusal string is printed verbatim.

### Designer surfaces

- Two-step confirms on `inbound-queue-band.tsx` (`CONFIRM_CONSEQUENCE_SENTENCE`) and
  `paperwork-link-act.tsx`; reject is held until a reason is written
  (`held={!reasonWritten} disabled={!reasonWritten}` + `aria-describedby` + a visible held sentence).
- Held acts use `aria-disabled`, never native `disabled` on the held branch —
  `document-action.tsx` renders `disabled={unavailable && !held}` with `heldMark = {'aria-disabled': true}`.
- Invalidations complete: `invalidateInbound` fans to `inboundDocumentKeys.all` +
  `invalidateComplianceFanout(holderId)` + `complianceKeys.all`; `useRecordNotice` invalidates
  `touchKeys.all`; `useIssueInvoice`/`useSendInvoice` call the new `invalidateInvoiceLinkFact()`.
- Hooks sit above every early return (`useInboundDocuments(holderId)` precedes
  `if (rows.length === 0) return null`).
- Document grammar held: acts read as sentences, errors land in `role="alert"`.

### Help

- 15 new keys exist on **both** sides: `packages/help-system/src/surfaceKeys.ts` and the designer
  mirror `apps/designer-portal/src/lib/help-system/document-surface-keys.ts`. Validator: 0 missing
  canonical, 0 missing mirror.
- Lengths within caps (max tooltip body 157 ≤ 160); 0 em-dashes, 0 en-dashes.
- Deterministic `_id`s: `helpContent.<surfaceKey with / → ->`; 0 duplicates.
- Dry-run pasted above (18 written / 0 errored, no `--commit`).

---

## 4. Prior-round re-check — all 30 r13 minors OPEN

| id | one line | state |
|---|---|---|
| m-1 | designer `app/preferences/unsubscribe/page.tsx` `PageProps` still `{token?,status?,type?}` — no `scope` | OPEN |
| m-2 | `packages/notifications/src/unsubscribe.ts` `applyChannelUnsubscribe` writes address-wide with no organization filter while the new client copy says "from this studio" | OPEN |
| m-3 | `touchKeys.list` sorts/filters but never `Set`s `subjectIds` — duplicate ids make a distinct cache key | OPEN |
| m-4 | `paperwork-link-act.tsx` mints `${chosenDay}T23:59:59Z` — the door dies 17:59:59 Central on the named day | OPEN |
| m-5 | `useState(windowEnd ? "window" : "thirty")` with no sync effect — a late-arriving `windowEnd` never selects | OPEN |
| m-6 | `setAnnouncement(receiptSentence)` writes an invariant string; a second send for the same row announces nothing | OPEN |
| m-7 | `{state === 'error' && message && <p role="status">}` mounts the live region already populated | OPEN |
| m-8 | `middleware.ts` has no bare `/paperwork` leg (unlike `/pay`'s two-leg test) | OPEN |
| m-9 | `posthog.ts` comment names seven prefixes, still closes "one generic pattern covers all six" | OPEN |
| m-10 | `people-help-content.ts` header says the word/concept keys are NOT promoted; the registry promotes them | OPEN |
| m-11 | help report §3 closing "Promoting them later is additive and safe" is stale after the same section promotes them | OPEN |
| m-12 | client-portal type-check EXIT=1 on generated `.next/types/app/page.ts` (pre-existing, `.next/` gitignored) | OPEN (re-measured live) |
| m-13 | `paperwork-upload-form.tsx` prints the edge function's refusal verbatim (`answer?.error`) | OPEN |
| m-14 | `paperwork_link_not_authorized` copy says "Ask an owner or admin" while the RPC gates on `is_active_studio_member` | OPEN |
| m-15 | report/comment naming drift on the touch vocabulary maps | OPEN |
| m-16 | test-file listing in the studio report does not match the tree | OPEN |
| m-17 | comment in `use-inbound-documents.ts` overstates the refusal-token set | OPEN |
| m-18 | `NO_TOUCH_SENTENCE` comment names a surface that does not render it | OPEN |
| m-19 | `useRevokePaperworkLink` is exported and called by nothing but the barrel | OPEN |
| m-20 | `notice-log.tsx` `{note && <p …>}` has no `aria-live` / `role="status"` / `role="alert"` | OPEN |
| m-21 | `context.expires_at` is carried into the paperwork page and never printed | OPEN |
| m-22 | house-wide: native `disabled` while loading on non-held acts (pre-existing) | OPEN |
| m-23 | paperwork report's coverage and suite numbers are stale vs. measured | OPEN |
| m-24 | `use-paperwork-links.ts` `thirtyDaysOut` / `firmEngagementWindowEnd` slice `toISOString()` — UTC day, outside R-CB's `*_at` grep | OPEN |
| m-25 | paperwork page exports no `metadata`; the five sibling guest routes each set `robots` + `referrer: 'no-referrer'` | OPEN |
| m-26 | paperwork report claims "Client type-check … clean"; it exits 1 (m-12) | OPEN |
| m-27 | studio report §7 lists a CSP item as "owed" that is already landed | OPEN |
| m-28 | `seat-window-band.tsx` docstring line 13 still reads "Moving it moves all three" after r11 M-1 corrected the sentence | OPEN |
| m-29 | `paperwork-model.ts` `STATE_RANK[…]` lookups are unguarded — an unmapped state yields `NaN` in both the dedupe compare and the sort | OPEN |
| m-30 | `paperwork-inbound.spec.ts` sweeps only at the head of the run; the broom is narrower than the litter | OPEN |

---

## 5. Fresh findings (round 14)

### m-31 — `seat-window-band.tsx` loses focus to `<body>` on both close paths — minor

`save()` and the "Leave it" act both call `setOpen(false)`, which unmounts the `{open && …}` panel
that holds the focused button. Focus falls to `document.body`; no `restoreFocusRef` is passed. The
test named `'survives a save with focus intact, and the panel closes rather than vanishes'` asserts
only that the panel exists and carries `hidden` — it never reads `document.activeElement`, so the
test name overstates what it pins.

Held at **minor**, not major: no documented room rule requires a focus restore on close (the room
rule is `aria-expanded` + `aria-controls` at a real id, which this satisfies), and
`restoreFocusRef` is used by **no** designer component except `command-bar.tsx`. The inaccurate
test name is MINOR by the brief's own rule. Fix: pass the disclosure button's ref as
`restoreFocusRef` on both acts, and rename the test to what it asserts.

### m-32 — the new designer e2e spec inherits firefox and webkit projects — minor

`apps/designer-portal/playwright.config.ts` declares three projects (`chromium`, `firefox`,
`webkit`, lines 53–67) while `apps/client-portal/playwright.config.ts` declares `chromium` alone.
The wave's new designer spec therefore runs under all three unless `--project=chromium` is passed by
hand; the brief's chromium-pin lives only in the invocation, not in the config. The file is
**untouched by this branch** (`git diff 0249e1eff..HEAD` on it is empty; last commit `2904241a2`,
pre-wave), so this is a pre-existing house condition surfaced by new work, not a wave regression.
Fix: mirror the client config and pin the designer config to `chromium`.

### m-33 — the "from this studio" copy now ships over an address-wide write — minor (companion to m-2)

`apps/client-portal/src/app/preferences/unsubscribe/page.tsx` `appliedCopy()` speaks from `scope`
and, on the address branch, promises "all email **from this studio** to this address".
`applyChannelUnsubscribe` (`packages/notifications/src/unsubscribe.ts`) writes
`.eq('value', channel.value).in('channel_kind', ['email','ap_email']).in('status', ['active','bounced'])`
with no organization predicate — the write is wider than the sentence. Recorded separately from m-2
because m-2 is the missing filter and this is the copy that now depends on it; both should move
together. Fix: add the organization predicate to the write, or narrow the sentence to "all email to
this address".

**Scope note for m-2 / m-33:** this stays minor because `generateChannelUnsubscribeUrl` defaults to
`DEFAULT_BASE_URL = "https://admin.patina.cloud"`, and the only non-default base
(`digest-dispatcher`'s `DIGEST_BASE_URL`) rides the account-holder (`userId`) branch — so in
practice the designer page does not receive `scope: 'address'` outcomes today.

---

## 6. What this round looked at fresh and found sound

- Guest-route shape: `/paperwork/` joins both the `no-store` + `X-Robots-Tag: noindex, nofollow`
  bearer block and `isPublicPage` in `middleware.ts`; the eighth prefix is wired the same way the
  other seven are.
- `NEXT_PUBLIC_CLIENT_PORTAL_URL` in `apps/designer-portal/wrangler.jsonc:31` is
  `https://client.patina.cloud` (staging at `:86`), so the minted paperwork address points at the
  right origin in both environments — the fallback in the act is never silently wrong.
- `TOKEN_COLUMNS` in `use-paperwork-links.ts` deliberately omits `token_hash`; the token never
  enters an analytics payload (`peopleEvents.grantMinted` carries `tier` and `expiry_source` only).
- `expect.poll` is used for every DB read in both new specs (client `:361`; designer `:210`, `:248`,
  `:285`); no `waitForTimeout` in either.
- The paperwork upload form's pre-hydration guard (`method="post"` with no `action`) and its
  `aria-required` (never HTML `required`) both hold.
