# W4 surfaces + help — adversarial code review, round 13

Branch `build/people-room-crm-2026-09-11`, worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`.
Scope read in full: the three surface reports (`w4-paperwork-report.md`,
`w4-studio-report.md`, `w4-help-report.md`), every changed file under
`apps/client-portal/src`, `apps/designer-portal/src`,
`packages/supabase/src/hooks`, `packages/help-system/src`,
`studios/help-system/scripts` — `git diff 0249e1eff..HEAD`, 76 files.
Prior fix log: `w4-fix-log-r12.md`. Settled and not findings: every ruling in
`rulings.md` §3.

## Verdict

**0 blocking · 0 major · 30 minor.** `clean = true`.

r12's one code major (M-1, the paperwork sheet's disclosure a11y) is **FIXED**.
All twenty-nine carried minors are **still open**. One fresh minor (m-30).

---

## 1. Prior-round re-check

### The r12 major

| Finding | r13 | Evidence |
|---|---|---|
| **M-1** — `PaperworkSheet`'s disclosure button unmounted when the panel opened, so focus was lost and `aria-expanded` never existed | **FIXED** | `apps/client-portal/src/components/paperwork/paperwork-sheet.tsx` — the `Button` is now always mounted with `aria-expanded={isOpen}` and `aria-controls={formId}`; the panel is `<div id={formId} hidden={!isOpen} ref=…>` with `{isOpen && <PaperworkUploadForm …/>}` inside; a `focusFormKey` effect moves focus to `panel?.querySelector('input, select, textarea, button, [href]')`; `paperworkOpenedSentence(title)` is written into the single `aria-live="polite" role="status"` region at `:190`. |

### The twenty-nine carried minors — every one re-checked

| # | r13 | Evidence this round |
|---|---|---|
| m-1 designer-portal unsubscribe ignores `scope` | **OPEN** | `apps/designer-portal/src/app/preferences/unsubscribe/page.tsx:5-6` `PageProps` is still `{token, status, type}`; no `scope` anywhere in the file. |
| m-2 "from this studio" copy vs the org-less write | **OPEN** | `packages/notifications/src/unsubscribe.ts:188-191` is still `.eq('value', channel.value).in('channel_kind',['email','ap_email']).in('status',['active','bounced'])` with no organization filter. The r12 fix added a *profile* suppression mirror above it; the org scope is unchanged. Severity note in §5. |
| m-3 `touchKeys.list` sorts but does not dedupe | **OPEN** | `packages/supabase/src/hooks/use-touches.ts:352` — `[...(filters?.subjectIds ?? [])].filter(Boolean).sort()`, no `Set`. |
| m-4 mint `T23:59:59Z` cuts the named last day short | **OPEN** | `paperwork-link-act.tsx:144` `expiresAt: chosenDay ? \`${chosenDay}T23:59:59Z\` : null`. The door dies 17:59:59 Central on the day the band names. |
| m-5 `PaperworkLinkAct` one-shot `choice` initializer | **OPEN** | `paperwork-link-act.tsx:96-98` `useState(windowEnd ? "window" : "thirty")`, no sync effect on `windowEnd`. |
| m-6 constant live-region string on receipt | **OPEN** (narrowed) | `paperwork-sheet.tsx:108` `setAnnouncement(receiptSentence)` with `receiptSentence` invariant per sheet — a second send for the same row writes the same string and is not announced. The *open* path at `:190` is now distinct per row, so only the receipt half remains. |
| m-7 upload-form error paragraph mounts with content | **OPEN** | `paperwork-upload-form.tsx:255-259` — `{state === 'error' && message && <p role="status">…}`; the region is created already populated. |
| m-8 no bare `/paperwork` middleware leg | **OPEN** | `middleware.ts:150` `startsWith('/paperwork/')` only, against `/pay`'s two-leg test at `:143`. |
| m-9 PostHog redaction comment says "all six" over a seven-prefix list | **OPEN** | `apps/client-portal/src/lib/analytics/posthog.ts:78-81` — the comment names seven prefixes and closes "one generic pattern covers all six". |
| m-10 `people-help-content.ts` header contradicts the promoted keys | **OPEN** | `studios/help-system/scripts/people-help-content.ts:42-53` still opens "The six word/concept tooltip surfaceKeys" over a twelve-item list and still says they are "NOT promoted to named constants … this wave's scope named exactly three new registry keys". They are promoted. |
| m-11 `w4-help-report.md` §3 closing paragraph stale | **OPEN** | `w4-help-report.md:80` "Promoting them later is additive and safe" after §3 already promotes them. |
| m-12 `client-portal type-check` RED on the branch | **OPEN** (pre-existing) | Re-run this round: EXIT=2, one error, in generated output — `.next/types/app/page.ts(37,29) TS2344`. `git diff origin/main..HEAD -- apps/client-portal/src/app/page.tsx` is empty. Not W4's. |
| m-13 door's raw refusals printed verbatim on the firm's page | **OPEN** | `paperwork-upload-form.tsx:129-137` — `answer.error` is printed as-is when it is a string. |
| m-14 "Ask an owner or admin" on a member-level refusal | **OPEN** | `use-paperwork-links.ts:65` and `use-inbound-documents.ts:78-80`; both RPCs gate on `is_active_studio_member` (00637:565, :324), not on owner/admin. |
| m-15 all eighteen help documents are unreachable | **OPEN** (declared, owed to W6) | `grep -rn useHelpContent apps/designer-portal/src/components/document/{people,roster}` → zero hits. Recorded as a W6 deferral in `w4-fix-log-r12.md`. |
| m-16 `word/paper` tooltip attributes the paper word to the firm alone | **OPEN** | `people-help-content.json:55` "…the compliance paper behind this person's firm." R-BA folds the person's own documents in too. |
| m-17 `chips` tooltip speaks in changelog voice | **OPEN** | `people-help-content.json:88` "Six groups replace the old eleven roles." |
| m-18 `wayInFact` embeds a UTC-sliced date in a durable record | **OPEN** | `site-access-card.tsx:72` `rosterShortDate(changedAt)` on `project_site_access_cards.changed_at` (a `timestamptz`, 00625:107). Still minor on the r10–r12 ground: nothing reads `studio_touches.notice_of` back onto a face, and the card's own line (`site-access-card.tsx:702-703`) uses the same reckoning, so face and record agree with each other. |
| m-19 `useRevokePaperworkLink` exported and called by nothing | **OPEN** | Only non-test references are its own definition (`use-paperwork-links.ts:231`) and the barrel re-export (`hooks/index.ts:673`). |
| m-20 the notice-log's result sentence is not announced | **OPEN** | `notice-log.tsx:220-222` — `{note && <p className=…>{note}</p>}`, no `aria-live`, `role="status"` or `role="alert"`. |
| m-21 the firm is never told when its own door closes | **OPEN** | No `expires_at` / `expiresAt` reference in `app/paperwork/[token]/page.tsx` or `paperwork-sheet.tsx`; `PaperworkContext.expires_at` is carried and never printed. |
| m-22 `DocumentAction`'s loading state uses native `disabled` | **OPEN** (pre-existing, house-wide) | `document-action.tsx:309` `disabled={unavailable && !held}`; `:267` `aria-disabled={unavailable \|\| undefined}`. A `held` act is correctly `aria-disabled` only; a `loading` act with `held=false` still natively disables. |
| m-23 the three surface reports' own numbers are stale | **OPEN** (drifted again) | `w4-paperwork-report.md:156` still "Client type-check … **clean**" (actual EXIT=2); `:157` still "154 suites, 2523 tests … 76.84 / 72.71 / 76.56 / 79.18" (actual this round 157 / 2574 / 77.36 / 73.15 / 77.08 / 79.73); `:112-113` still "95.23 … 99.37 / 92.5 / 96.55 / 100" (actual 95 / 100 / 100 / 100 and 97.63 / 92.07 / 97.36 / 98.32). |
| m-24 the paperwork window helpers derive "today" from a UTC slice | **OPEN** | `use-paperwork-links.ts:103` `at.toISOString().slice(0, 10)` and `:135` `now.toISOString().slice(0, 10)`. R-CB's named grep was `.slice(0, 10)` on `*_at` fields, which these are not, so the ruling's sweep did not reach them. |
| m-25 `/paperwork/[token]` exports no route `metadata` | **OPEN** | No `export const metadata` in the page. `/pay/used/page.tsx:5-9`, `/plans`, `/pay`, `/trade`, `/rfq` each set `robots` **and** `referrer: 'no-referrer'`. The noindex half is covered by `middleware.ts:187-188`; the referrer policy is not. |
| m-26 `w4-paperwork-report.md` stale beyond m-23 | **OPEN** | Same two passages re-read this round; unchanged. |
| m-27 `w4-studio-report.md` §6/§7 contradict `w4-paperwork-report.md` | **OPEN** | Unchanged. (§7's CSP "owed" entry is in fact already landed — see §4.) |
| m-28 `seat-window-band.tsx`'s docstring still carries the claim its constant lost | **OPEN** | `seat-window-band.tsx:12` "Moving it moves all three" — the r11 M-1 fix corrected `WINDOW_CONSEQUENCE_SENTENCE` at `:74-78` but not the docstring above it. |
| m-29 `buildPaperworkRows` ranks and sorts on an unguarded `STATE_RANK` lookup | **OPEN** | `paperwork-model.ts:328` `STATE_RANK[existing.state] <= STATE_RANK[state]` and `:376` `STATE_RANK[a.state] - STATE_RANK[b.state]`; an unmapped state yields `NaN` and an arbitrary order. |

---

## 2. Blocking criteria — each one checked, none met

| Criterion | Result | Evidence |
|---|---|---|
| A token accepted without verification | **Not met** | `apps/client-portal/src/app/paperwork/[token]/page.tsx` shape-checks `PAPERWORK_TOKEN_PATTERN = /^[0-9a-f]{64}$/`, takes a rate-limit hit (`paperwork_link_rate_limit_hit`) keyed to `normalizeCallerIp(resolveClientIp(await headers()))` and refuses on `limitError \|\| withinLimit === false`, then resolves through `resolve_paperwork_link`. The edge function re-verifies independently: `supabase/functions/paperwork-upload/core.ts:243` rate limit, `:260` `resolve_paperwork_link`, `:332` `paperwork_link_storage_context` (the storage key comes from the token row, never from the request body). `resolve_paperwork_link` is `GRANT EXECUTE … TO service_role` only (00637:895-897). |
| A verified document overwritten | **Not met** | `record_inbound_compliance_document` **INSERTs** a new row (00637:982) with `verified_at` NULL and leaves the incumbent alone; supersession happens only at `confirm_inbound_document`. Storage is `upload(key, file, { contentType, upsert: false })` (`core.ts:355`) under a per-upload `crypto.randomUUID()` segment. |
| Cross-tenant read/write | **Not met** | `studio_touches`: RLS `USING (public.is_active_studio_member(organization_id))`, SELECT-only to `authenticated`, no INSERT/UPDATE/DELETE policy (00635:209-222). `paperwork_link_tokens`: same shape (00637:318-331), and an `assert_paperwork_token_company()` row trigger (`:316`). `v_access_grants` REVOKEd from anon (00637:1531). Storage: `compliance_documents_member_read` gates SELECT on `is_active_studio_member(storage.foldername(name)[1]::uuid)` and there is no client-side write policy at all (00637:585-592). |
| RLS / grant / storage-policy hole | **Not met** | Every new function is `REVOKE ALL … FROM PUBLIC, anon` first; the three token-facing functions (`resolve_paperwork_link`, `paperwork_link_storage_context`, `paperwork_link_rate_limit_hit`) are granted to `service_role` only. `paperwork_link_rate_limits` is REVOKEd from `authenticated` entirely. |
| Email sent to a dead/unsubscribed channel | **Not met** | No new send path in W4. `record_inbound_compliance_document` writes an in-app `notification_log` row (`'compliance_document_inbound'`, `'in_app'`), not mail. |
| A forged unsubscribe crossing subjects | **Not met** | `applyUnsubscribeToken` still resolves the token to a channel id before writing; the address-wide write is by the channel's own `value` with `eq`, not `ilike` (the wildcard trap is called out in the file's own note). The cross-*studio* breadth of that write is m-2, a copy/scope mismatch, not a forgery. |
| A `/pay` link broken by the backfill | **Not met** | `useRegenerateInvoiceLink` writes nothing to cache and `invalidateInvoiceEffects` no longer touches `['invoice-link', id]` (R-BV). The folio's bounce band cannot contradict itself: a successful mint populates `minted` → `clientInvoiceUrl`, which switches the band to its address branch before any stale sentence renders. `InvoiceLink.token` is `string \| null` and `invoiceLinkIsLive` gates on `expiresAt`. |
| Reset failure | **Not met** | Migrations replay clean on the local stack; `supabase status` healthy; no reserved number (00595–00620) used — W4's band is 00623–00638. |

---

## 3. Gates — commands and tails

All run in the worktree with `pnpm --dir` / `git -C`; no `.env.local` exists or was created; local values passed inline where a build or server needed them.

```
designer-portal type-check ........ EXIT=0
@patina/supabase type-check ....... EXIT=0
packages/help-system type-check ... EXIT=0
client-portal type-check .......... EXIT=2
    .next/types/app/page.ts(37,29): error TS2344: Type 'OmitWithTag<…>' does not
    satisfy the constraint '{ [x: string]: never; }'.
    — generated output, pre-existing; `git diff origin/main..HEAD --
      apps/client-portal/src/app/page.tsx` is empty. m-12.
admin-portal build ................ EXIT=0
    Route table printed in full; BUILD_ID written; ƒ /preferences/unsubscribe present.
```

```
client-portal jest --coverage
    Test Suites: 157 passed, 157 total
    Tests:       2574 passed, 2574 total
    ----------------------------------|---------|----------|---------|---------|
    File                              | % Stmts | % Branch | % Funcs | % Lines |
    ----------------------------------|---------|----------|---------|---------|
    All files                         |   77.36 |    73.15 |   77.08 |   79.73 |
     src/app/paperwork/[token]        |   95    |   100    |  100    |  100    |
     src/components/paperwork         |   97.63 |    92.07 |   97.36 |   98.32 |
    ----------------------------------|---------|----------|---------|---------|
    Floor 70 / 60 / 70 / 70 — HOLDS on all four.
```

```
designer-portal jest (8 W4 suites) ... 8 suites / 106 tests, all pass
packages/supabase vitest (w4 + invoices) ... 2 files / 118 tests, all pass
help dry-run seed ................... 18 written, 0 errored
help validator ...................... 18 docs, 17 distinct surfaceKeys,
                                      0 missing from surfaceKeys.ts,
                                      0 missing from the designer mirror,
                                      0 regex-invalid, 0 duplicate _ids,
                                      0 duplicate (surfaceKey, kind, order) triples,
                                      0 em-dashes, 0 en-dashes,
                                      every length within its cap
surface-key parity test ............. 6/6 pass
```

Every new `apps/client-portal/src` file ships with a test:

```
src/app/paperwork/[token]/page.tsx        → __tests__/page.test.tsx
src/app/pay/used/page.tsx                 → __tests__/page.test.tsx
src/components/paperwork/paperwork-model.ts       → __tests__/paperwork-model.test.ts
src/components/paperwork/paperwork-sheet.tsx      → __tests__/paperwork-sheet.test.tsx
src/components/paperwork/paperwork-upload-form.tsx→ __tests__/paperwork-upload-form.test.tsx
```

Playwright: `apps/client-portal/playwright.config.ts:48-50` pins one project,
`chromium`. No `waitForTimeout` in either new spec; `expect.poll` is used for
every DB read (`paperwork-inbound.spec.ts:209`, `:246`, and after).

---

## 4. Surface checks

**The paperwork page (`/paperwork/[token]`).** No nav — the route is outside the
app shell and `middleware.ts:150` folds it into both the `no-store`/`noindex`
bearer block and `isPublicPage`. No homeowner data: the page reads only the
firm's own compliance rows through `resolve_paperwork_link`. No caveat or
schema words — `rowSentence` / `blocksSentence` / `reasonSentence` in
`paperwork-model.ts` speak in plain paper words (`Current`, `Lapsed`,
`Not on file`), and `DeadLink()` names no firm, studio or paper. Mobile-first
and keyboard-reachable: the sheet is a native disclosure with
`aria-expanded`/`aria-controls` and a focus move into the panel; the form uses
`aria-required` (never HTML `required`) and `aria-disabled` on submit with a
`if (state === 'sending') return;` guard, so the control stays focusable.
Errors say what to do — with the one exception at m-13, where the door's raw
refusal string is printed verbatim. CSP: `apps/client-portal/next.config.js:118-144`
derives `connect-src` origins (http + ws) from `NEXT_PUBLIC_SUPABASE_URL`, so
the form's direct POST to `/functions/v1/paperwork-upload` is allowed — the
`w4-studio-report.md` §7 "owed" entry is a round-1 fix already landed (m-27).

**Designer surfaces.** Two-step confirms on both destructive acts:
`inbound-queue-band.tsx` carries `CONFIRM_CONSEQUENCE_SENTENCE`,
`REJECT_REASON_PROMPT` and `REJECT_HELD_SENTENCE`, with
`held={!reasonWritten} disabled={!reasonWritten}` plus `aria-describedby` and a
`role="alert"` error. PR-n gating holds: `held` acts render `aria-disabled`
through `heldMark`, never native `disabled` (`document-action.tsx:267`, `:309`).
Invalidations are complete: `invalidateInbound` fans to
`inboundDocumentKeys.all` + `invalidateComplianceFanout` + `complianceKeys.all`;
mint invalidates `paperworkLinkKeys.forCompany` + `accessGrantKeys.all`; revoke
adds the literal `['paperwork-links']` leg and is cycle-free. Document grammar
holds across the new bands (fact, then act, then consequence); no DocSheet is
introduced — every new band is inline. Canonical keys come from
`@patina/supabase` hooks throughout; analytics go through `people-events.ts`
(`peopleEvents.grantMinted({ tier: 'paperwork_link', expiry_source })`), and the
minted token never enters an event payload.

**Help.** All 17 distinct surfaceKeys across the 18 documents exist in
`packages/help-system/src/surfaceKeys.ts` **and** in the designer mirror
`apps/designer-portal/src/lib/help-system/document-surface-keys.ts` (15 new keys
each side, parity test 6/6). Every title, one-sentence answer and body is within
its cap. `_id`s are deterministic (`helpContent.<surfaceKey with / → -->`), with
no duplicates and no duplicate `(surfaceKey, kind, order)` triple. No em-dashes
or en-dashes anywhere in the content. Dry-run pasted above.

---

## 5. Fresh finding

**m-30 — `paperwork-inbound.spec.ts` sweeps only at the head of its own run, and
its broom is narrower than its litter.** *(fresh)* Confidence: high.

`apps/designer-portal/e2e/people/paperwork-inbound.spec.ts:42-48` defines
`clearEarlierRuns()`, called once at `:173` **before** the journey, and it
deletes only `studio_compliance_documents` rows matching
`.like("number", "GL-E2E-%")`. The spec has no `afterAll`, `afterEach` or
per-test cleanup. Each run therefore leaves behind, in the shared local
Postgres:

- one **live** `paperwork_link_tokens` row (`status = 'active'`) on the firm it
  picked — so that firm's card in the seeded dev studio permanently shows a
  "Paperwork link" access grant that no test minted on purpose;
- one object in the `compliance-documents` storage bucket
  (`core.ts`-shaped key, never deleted);
- the `notification_log` row and `studio_touches` row that
  `record_inbound_compliance_document` writes;
- the `studio_compliance_documents` row itself until the *next* run of this same
  spec.

This is the class the r11 code MAJOR-1 was about — `paperwork-link.spec.ts` was
made to clean up after itself for exactly this reason, and its own header note
("`supabase db reset` is not a broom a test may lean on") applies here verbatim.

**Held at minor**, deliberately, because unlike r11 M-1 no gate actually breaks:
every SQL assertion that counts these tables is scoped to a fixed fixture id
(`w4_channels_touches_paperwork_test.sql:1129`, `:1169` filter on `v_dup` /
`v_survivor`; `w1b_compliance_authority_directory_test.sql:484`, `:3500`,
`:3593`, `:3606` filter on seeded `holder_id`s), the one unscoped count
(`w1b…:2929`) is read as a manufacturer-org caller who cannot see dev-studio
rows at all, and `firmWithNoPaper()` only ever picks a firm holding no paper, so
none of the asserted fixtures can be chosen. The spec also self-recovers: the
next run's broom frees every firm the previous runs consumed.

**Fix:** move `clearEarlierRuns()` into a `test.afterAll` as well as the
`beforeAll` position, and widen it to revoke or delete the
`paperwork_link_tokens` rows it minted (by the `company_id` it picked) and
remove the storage objects it uploaded (by the keys it built), the way
`apps/client-portal/tests/paperwork-link.spec.ts` does in its own `afterAll`.

---

## 6. Severity note carried forward (m-2)

`applyChannelUnsubscribe` writes across every studio that holds the same email
address, while the client-portal confirmation says "from this studio". Held at
minor through r9–r13 on the standing ground that the write is *broader* than the
copy, never narrower — nobody keeps receiving mail they asked to stop. It is a
copy/scope mismatch, not a forged unsubscribe crossing subjects, so it does not
meet the blocking criterion. It is recorded here each round so the call stays a
call and not an omission.
