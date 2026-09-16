# W4 (P3) — round-5 adversarial code review: surfaces + help

Worktree `.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`,
HEAD `43de00dc8` (`fix(people-crm): W4 round-4 review — 5 major`).

Scope as briefed: every changed file under `apps/client-portal/src`,
`apps/designer-portal/src`, `packages/supabase/src/hooks`, `packages/help-system/src`,
`studios/help-system/scripts`, read in full against
`w4-paperwork-report.md`, `w4-studio-report.md`, `w4-help-report.md`, plus the prior
fix log `w4-fix-log-r4.md`. `rulings.md` §3 treated as settled.

**Verdict: CLEAN — zero blocking, zero major.** Twenty-two minors below, sixteen of them
carried unchanged from r3/r4 and six new. No migration minted, no prod anything, no
server started on 3000/3002 (this is the code round; no Playwright run).

---

## 0. Gates, re-run at HEAD

### Designer type-check — exit 0
```
> @patina/designer-portal@0.1.0 type-check .../apps/designer-portal
> tsc --noEmit
EXIT=0
```

### `@patina/supabase` type-check — exit 0
```
> @patina/supabase@0.0.1 type-check .../packages/supabase
> tsc --noEmit
EXIT=0
```

### `@patina/help-system` type-check — exit 0
```
> @patina/help-system@0.1.0 type-check .../packages/help-system
> tsc --noEmit
EXIT=0
```

### Client type-check — RED, pre-existing (re-measured)
```
> @patina/client-portal@0.1.0 type-check .../apps/client-portal
> tsc --noEmit

.next/types/app/page.ts(37,29): error TS2344: Type '{ searchParams?: Promise<Record<string, string | string[] | undefined>> | undefined; } | undefined' does not satisfy the constraint 'PageProps'.
  Type 'undefined' is not assignable to type 'PageProps'.
 ELIFECYCLE  Command failed with exit code 2
EXIT=2
```
The generated check is against `src/app/page.tsx`'s optional `props?` parameter, last
touched by `7ff6c085d`. `git merge-base --is-ancestor 7ff6c085d 0249e1eff` → **true**:
the error predates W4's base and no file this wave touched appears in it. Minor 11 below
still stands (the paperwork report records this gate as "clean").

### admin-portal build (shared-package edits: `@patina/supabase`, `@patina/notifications`) — exit 0
```
├ ƒ /pipeline/[slug]
├ ○ /pipeline/onboarding
├ ○ /pipeline/review
├ ƒ /preferences/unsubscribe
├ ○ /privacy
...
ƒ  Proxy (Middleware)
○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
EXIT=0
```
(`npx next build --webpack`, local env inline — no `.env.local` created.)

### Client jest + coverage — 154 suites / 2 540 tests, floor holds
```
File                                       | % Stmts | % Branch | % Funcs | % Lines |
All files                                  |    76.9 |     72.7 |   76.63 |   79.26 |
 src/app/paperwork/[token]                 |      95 |      100 |     100 |     100 |
  page.tsx                                 |      95 |      100 |     100 |     100 |
 src/components/paperwork                  |   98.92 |    91.13 |   96.96 |   99.37 |
  paperwork-model.ts                       |     100 |    89.13 |     100 |     100 |
  paperwork-sheet.tsx                      |   97.22 |      100 |     100 |   96.87 |
  paperwork-upload-form.tsx                |    98.5 |    91.66 |   88.88 |     100 |

Test Suites: 154 passed, 154 total
Tests:       2540 passed, 2540 total
```
Floor **70 / 60 / 70 / 70** → **76.9 / 72.7 / 76.63 / 79.26**. Holds.

**Every new client-portal file ships with its test** (`git diff --name-status`, 8 added
source files, 4 of them `__tests__`): `page.tsx` → `page.test.tsx` (9),
`paperwork-model.ts` → 23, `paperwork-sheet.tsx` → 11, `paperwork-upload-form.tsx` → 12.
The four modified non-test files (`middleware.ts`, `app-chrome.tsx`, `posthog.ts`,
`letterbox.tsx`, `door-gate.tsx`, `commercial-documents.ts`) each gained cases in their
existing suites.

### Designer jest (people · roster · accounts · help-system · analytics) — 60 suites / 839 tests
```
PASS src/lib/help-system/surface-key-parity.test.ts
Test Suites: 60 passed, 60 total
Tests:       839 passed, 839 total
```

### `@patina/supabase` vitest — 107 files / 1 431 tests
```
 Test Files  107 passed (107)
      Tests  1431 passed | 12 skipped (1443)
```
(`people-crm-w4.test.ts` alone: **54 passed**.)

### Help dry run, pasted
```
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
No `--commit`. Nothing written to Sanity.

---

## 1. The named checks, answered

### Help — clean on every named check

| Check | Result |
|---|---|
| Every surface key exists in `packages/help-system/src/surfaceKeys.ts` | **17/17** — measured by exact-string match over the JSON's `surfaceKey` values |
| …and in the designer mirror (`document-surface-keys.ts`) | **17/17** |
| Registry↔mirror parity | `surface-key-parity.test.ts` **6/6 pass** |
| Lengths within the schema's `Rule.max()` | tooltip/fieldHelper `body` ≤160 (longest **157**, `people/contact-rule` and `people/person/access-grant`), emptyState `heading` ≤50, `description` ≤300 — measured against `tooltipContent.body` / `emptyStateContent.*`, not a top-level `body` key |
| helpArticle shape | title + oneSentenceAnswer + non-empty body array present |
| Deterministic `_id`s | all 18 are `helpContent.<surfaceKey-with-double-dashes>[--suffix]`; no duplicates, no duplicate `(surfaceKey, contentType, persona)` triple |
| surfaceKey regex `^[a-z0-9-]+(\/[a-z0-9-]+)+$` | 18/18 |
| Em-dashes | **0** across every string in the JSON (U+2014 count 0; en-dash 0 too) |
| Dry run | pasted above, 18 written / 0 errored |
| `packages/help-system/dist` rebuilt | present and current — `dist/index.{js,cjs,d.ts}` all carry `designer-portal/document/people/firm` |

### The paperwork page — every named check passes

| Check | Evidence |
|---|---|
| No nav | `app-chrome.tsx` `PUBLIC_PREFIXES` gains `/paperwork` and matches `path === prefix \|\| startsWith(prefix + '/')` → `data-portal-shell="public"`; the page renders a bare `<main>`. e2e asserts `getByRole("navigation")` → 0 |
| No homeowner data | `resolve_paperwork_link` (00637:610-637) projects `doc_type, doc_label, expires_on, blocks, state, awaiting_check` plus studio name and company name only — no ids, no file paths, no uploader names; the page adds nothing |
| No caveat / schema words | every printed word comes from `COMPLIANCE_DOC_TYPE_LABELS` (9/9 of the `doc_type` CHECK vocabulary) and `COMPLIANCE_BLOCK_LABELS` (3/3 of the `blocks` vocabulary), so the `?? docType` / `?? block` fallbacks are unreachable for any row the CHECK admits. No consequence sentence — e2e greps `/will be removed\|suspended\|terminated/` → 0 |
| Mobile-first | `max-w-lg px-4 py-10 sm:px-6`, `clamp(1.6rem, 6vw, 2.2rem)` on the h1, every field and both acts `min-h-[44px]`, submit `w-full` |
| Keyboard-reachable | every control has a real `<label htmlFor>`; the submit is `<button type="submit">` with `aria-disabled` in flight and **never** `disabled` (`Button` forwards `aria-disabled` and sets no native `disabled`), the handler returning early on a second press. The r4 `other_named` id collision is **fixed**: `fieldPrefix={row.key}`, slugged |
| Errors say what to do | "Choose the file first." · "Give the date it expires." · "That did not go through. Try again." · door refusals printed verbatim · rate wall "Wait a minute, then open the link again." · dead door "The studio that sent it can open a new one." |

### Token handling and tenancy — no hole found

- The page format-gates `^[0-9a-f]{64}$` before any round-trip, then resolves through
  `resolve_paperwork_link`, which **hashes** (`encode(digest(p_token,'sha256'),'hex')`)
  and requires `status = 'active' AND expires_at > now()`. No plaintext compare anywhere;
  malformed / unknown / revoked / expired all die into one `<DeadLink />`.
- `record_inbound_compliance_document` re-derives the holder from the token row
  (00637:689-700), never from the browser's body.
- `paperwork_link_tokens`: RLS on, SELECT `is_active_studio_member(organization_id)`,
  `REVOKE ALL … FROM PUBLIC, anon, authenticated` then `GRANT SELECT` to authenticated;
  `mint`/`revoke` both gate on `is_active_studio_member`; `resolve` and the rate bucket
  are service_role only. `studio_touches` likewise member-SELECT with no write policy.
- No raw bearer reaches analytics: `/paperwork` is registered in **all three** registries
  — `client-portal/middleware.ts`, `client-portal/app-chrome.tsx`, and both
  `posthog.ts` `HEX_BEARER_IN_URL` patterns (client `:106` and designer `:93`).
  r2 BLOCKING-1 stays closed.
- Verified against the live local DB: `v_access_grants` carries the twelfth tier with
  `tier='paperwork_link'`, `subject_type='company'`, `subject_id` = the company card id,
  `grant_id = 'paperwork_link:<uuid>'` — which is exactly what `keySegment: 1` and
  `FIRM_SCOPED_ACCESS_GRANT_TIERS` read, so the revoke route resolves.

### The /pay rail is not broken by the backfill
00636 backfills `token_hash = invoice_link_token_hash(token)` (`:104-106`) **before**
`UPDATE invoice_links SET token = NULL` (`:121`), and every resolver looks up by hash.
Emailed `/pay/<token>` addresses keep working. The client portal's own two consumers were
re-headed rather than left to a null: `letterbox.tsx` drops `useInvoiceLink` entirely and
opens the in-place `Settlement` till it already carries (with `aria-expanded`,
`aria-controls="letterbox-letter"` — the id exists at `:399` — focus moved into the
`role="group"` region and a polite `role="status"` announcement); `door-gate.tsx` falls
back to `/?invoice=<id>`, which `useNamedInvoice()` in `letterbox.tsx:118-121` genuinely
reads and folds the slot to. `adaptDesignBuildDepositOffer` no longer nulls the whole
offer on a missing token. All three paths are covered by new cases in the existing suites.

### Designer surfaces — two-step confirms, gating, invalidations, aria, grammar

| Check | Result |
|---|---|
| Two-step confirms | Confirm (`Confirm` → consequence sentence → `Confirm the document` / `Not yet`), Reject (`Reject` → required reason → `Refuse it` / `Not now`), Mint (`Mint a paperwork link` → R-AD band with the date in words → `Open the door` / `Not now`), folio Regenerate (`Regenerate link` → "The old link stops working…" → `Replace the link`). All inline bands, no modal |
| `aria-disabled`, not `disabled` | every held act passes `held={…}` **with** `disabled={…}`; `DocumentAction:309` renders `disabled={unavailable && !held}` and adds `aria-disabled` via `heldMark`, so a held act keeps its tab stop and its `aria-describedby` reason is reachable. Verified for `reject-inbound-document-confirm`, `open-paperwork-link`, `Save this note` |
| Gating | mint/revoke/confirm/reject all gate on `is_active_studio_member` in 00637 — no PR-n authority act is introduced by this wave, so PR-n is not in play here |
| Invalidations | `useMintPaperworkLink` → `paperworkLinkKeys.forCompany` + `accessGrantKeys.all`; `useRevokePaperworkLink` → same; `useRevokeAccessGrant` → `accessGrantKeys.all` + `partySmsKeys.all` + the literal `['paperwork-links']` (cycle-avoiding, correct); confirm/reject → `inboundDocumentKeys.all` + `invalidateComplianceFanout(holderId)` + `complianceKeys.all`; `useRecordNotice` → `touchKeys.all`; `useUpdateProjectParty` (the new `onSiteFrom/onSiteTo` leg) → `project-parties`, `project-roster`, `peopleKeys.all`, `peopleSeatKeys.all` — which is what `firmEngagementWindowEnd`'s `allSeats` reads, so the mint band's date follows a window move |
| Hooks above early returns | `InboundQueueBand`, `LastTouchLine`, `PaperworkSheet`, `PaperworkUploadForm`, `SeatWindowBand`, `PaperworkLinkAct`, `RosterRow`'s new `useTouches` — all declared before any conditional return |
| `@patina/types` / design-system / `ui/controls` | no domain type redefined; the client page uses `@patina/design-system`'s `Button`, the designer surfaces `DocumentAction` / `DocumentActionRow` |
| Analytics via `people-events.ts` | mint emits `peopleEvents.grantMinted({tier:'paperwork_link', expiry_source})`, revoke reuses `grantRevoked`, the notice log `peopleEvents.siteAccessChanged`. S-9 (no confirm/reject event) is a declared decision |
| `retainedComplianceDocuments` ↔ `compliance_state` | the browser filter `!rejected_at && !(inbound && !verified_at)` is byte-for-byte the SQL predicate 00637 §1b added. The supersession walk still runs over the **unfiltered** row set, so a chain is never broken by the new filter |
| Document grammar / DocSheet | the new surfaces are inline bands inside existing regions; no sheet is opened, so DocSheet is not in play. Refusals sit in `role="alert"` on the designer side, held reasons in plain text beside the act |

### Prior findings, re-measured at HEAD

| r4 finding | Status |
|---|---|
| W4R4-1 — folio's two link acts unreachable | **FIXED** — `invoice-folio.tsx:688` Regenerate now stands on `canShareLink` alone; Copy keeps `clientInvoiceUrl`; the recovery band reads "Regenerate link, above, mints one you can send them."; `useInvoiceLink`'s docblock corrected. Suite default mock is `null` at module scope and in `beforeEach`; the four new cases model the real chain |
| W4R4-2 — account-less unsubscribe named the wrong scope | **FIXED** — `UnsubscribeOutcome.scope`, `applyChannelUnsubscribe` returns `'address'` on all three paths, the landing reads the scope through `appliedCopy()` and drops "Manage Preferences", and `GET /api/unsubscribe` carries `scope` across the redirect (`route.ts:46`) |
| W4R4-3 — sms-inbound START/YES wrote no touch | **FIXED** — `recordInboundTouch` call sites went 9 → **11** in `sms-inbound/pipeline.ts` |
| W4R4-4 — Access grants row printed the UTC day | **FIXED** — `grantRowParts` reads `touchInstantDay(granted_at / last_used_at)`; `formatSeatDate` import dropped. Verified on the live row: `granted_at 2026-09-16 00:52Z` → "15 Sep 2026" |
| W4R4-5 — two `other_named` forms collided on every field id | **FIXED** — `fieldPrefix` prop, sheet passes `row.key`, form slugs it; both suites carry the two-form case |
| r4 MINOR 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23 | all **still open** except 14, which is open with different numbers (re-measured below). None was claimed fixed |

---

## 2. BLOCKING

None.

## 3. MAJOR

None.

---

## 4. MINOR (reported, never gating)

**New this round (6).**

1. **`apps/designer-portal/src/components/document/people/company-card.tsx:934-941` — the
   whole mint band is a flex item inside the Paper act row.** `PaperworkLinkAct` is placed
   as the third child of a `DocumentActionRow`, whose frame is
   `flex flex-wrap items-center gap-2` (`document-action.tsx:404-408`), and the component
   returns a `<div>` containing the trigger, the R-AD panel (`fieldset`, three radios, a
   date field, a nested action row), the minted address paragraph and the `role="alert"`.
   So an opened band, and the printed address afterwards, are laid out beside "Record a
   document" and "Chase the renewal" rather than beneath the row. The nested
   `DocumentActionRow` is correctly excluded from the ≤1-leader guard (the DOM check uses
   `closest('[role="group"][data-action-region]') === frameRef.current`), so this is
   layout only. Not verified visually — no server was started this round.

2. **`packages/supabase/src/hooks/use-paperwork-links.ts:91-96` — `paperworkLinkUrl` reads
   `NEXT_PUBLIC_CLIENT_PORTAL_URL` with a hard-coded `https://client.patina.cloud`
   fallback.** In local dev without that var the mint band prints a **production** address
   for a token that only exists in the local stack. The folio's own equivalent
   (`resolveClientPortalOrigin(window.location.origin)`) keeps localhost → :3002 routing
   for exactly this reason. Cosmetic in prod; confusing locally.

3. **`apps/designer-portal/src/components/document/people/people-format.ts:63-67` —
   `lastOpenDay` still slices a UTC day, on a row whose siblings now read the studio
   clock.** `new Date(at - 1000).toISOString().slice(0, 10)`. For the two exclusive
   whole-day boundaries it is written for the answer is the same in both clocks, so no
   disagreement is visible today; but `create_field_link`'s ninety-day fallback stores a
   mid-afternoon stamp, and a field link dying at `2026-12-01T02:00:00Z` (30 Nov, 20:00
   CST) prints "Ends 1 December 2026" one line under "minted 30 Nov 2026" from
   `touchInstantDay`. Two clocks in one function file (r4 F1 moved half of it).

4. **`supabase/migrations/00637:466-475` + `paperwork-link-act.tsx:144` — a named day that
   has already passed in UTC is silently replaced.** The band sends
   `${chosenDay}T23:59:59Z`; the RPC takes it only `WHEN p_expires_at > now()`, otherwise
   falls through to the firm's engagement window, otherwise refuses. A Central-time studio
   naming *today* after 19:00 local therefore gets the job's end date instead of the day
   she typed. The post-mint sentence reads the RPC's own `expires_at`, so the face never
   lies — but nothing says a substitution happened.

5. **No designer surface reads a refused compliance document.** `reject_inbound_document`
   writes `rejected_by / rejected_at / rejection_reason` and 00637 keeps the row; the
   inbound band filters `.is('rejected_at', null)`, `retainedComplianceDocuments` filters
   `!doc.rejected_at`, and `resolve_paperwork_link` excludes it. Nothing in
   `apps/designer-portal/src` or `packages/supabase/src/hooks` reads the three columns
   (grep: only `database.types.ts` and the write path). Spec §7's retention says
   "queryable", not "visible", so this is a scope gap rather than a defect — but the
   studio cannot see what it refused or why, and the firm's re-upload arrives with no
   memory attached.

6. **`paperwork-upload-form.tsx:78` — the row-key slug can still collide.**
   `fieldPrefix.replace(/[^a-zA-Z0-9_-]+/g, '-')` maps `other_named:roof warranty` and
   `other_named:roof-warranty` to one id prefix, which is the r4 MAJOR-1 defect for that
   pathological pair. `groupKey` lower-cases and trims but does not normalise separators.
   A hash or an index would close it.

**Carried from r3/r4, re-measured and still open (16).**

7. **`seat-window-band.tsx:128,133` — the SAVE leg of r3 MAJOR-2 is still open and its
   test still overstates.** `save()` calls `setOpen(false)` on both branches while focus
   sits on "Write the window"; `seat-window-band.test.tsx:81` is titled *"survives a save
   with focus intact, and the panel closes rather than vanishes"* and asserts only
   `aria-expanded="false"`, the panel present, the panel `hidden` — never
   `document.activeElement`. (r4 minor 1.)

8. **`inbound-queue-band.tsx:127,186` — Confirm and Reject destroy the presser's focus.**
   `setStep("idle")` unmounts the pressed button and the refetch then removes the `<li>`.
   The outcome reaches `people-room.tsx:702`'s polite announcer, which is why this is
   reported rather than gated. `restoreFocusRef` on the idle row closes this and 7 at
   once. (r4 minor 2.)

9. **`paperwork-sheet.tsx:58,68` — the live region writes the same constant for every
   row**, so a second upload in one visit mutates nothing and is not re-announced, and the
   sentence names no document. `letterbox.tsx:353-358` now has the same shape for its own
   money act. (r4 minor 3.)

10. **`paperwork-upload-form.tsx:240-244` — the failure region mounts WITH its text** and
    is a `role="status"`, where `roster-row.tsx:300-310` records this programme's own
    ruling ("a refusal is an alert, not a status"). The sheet's own always-mounted region
    (`paperwork-sheet.tsx:76`) is the pattern to copy. (r4 minor 4.)

11. **`paperwork-link-act.tsx:96-98` — `choice` is seeded once, before the seats arrive.**
    `usePeopleSeats({all:true})` resolves after the card renders, so a firm that DOES have
    a window commonly shows "Ends with the job — …" *unchecked* beside a pre-selected
    "Thirty days", and the press writes thirty days. A `useEffect` reseeding on the
    null→date transition (and the inverse) closes it. (r4 minor 5.)

12. **`studios/help-system/scripts/people-help-content.ts:42-54` — the docblock still says
    the concept surfaceKeys "are NOT promoted to named constants … a follow-up".** They
    were promoted in round 1; this review measured 17/17 present in both registries.
    (r4 minor 6.)

13. **`studios/help-system/scripts/seed-people-help.ts:5-8` — the docblock names
    `SurfaceKeys.DesignerPortal.Document.{…,CallSheet.SiteAccess,CallSheet.BringForward}`.**
    The constants are flat (`CallSheetSiteAccess`, `CallSheetBringForward`,
    `CallSheetSiteAccessTold`); there is no `CallSheet` object. It also says "five
    surfaces" where the content is authored against 17 keys. (r4 minor 7.)

14. **`use-inbound-documents.ts:45` — "All six tokens 00637 can raise are named here".**
    Eight are listed and eight is right (`grep RAISE EXCEPTION` on 00637 → 8 `compliance_*`
    tokens); the sentence is stale from before r2's fix. (r4 minor 8.)

15. **Two refusal sentences misdirect the reader.** `use-paperwork-links.ts:64-65` ("Ask
    an owner or admin of the studio") and `use-touches.ts:409-410` ("This job's notices
    are not yours to write. Ask an owner or admin") both describe an owner/admin gate;
    00637:450 and 00637:538 gate on `is_active_studio_member`, and `record_notice` also
    refuses when `project_tenant_org` is NULL (R-BI's studio-less jobs), where no owner can
    help. (r4 minor 9.)

16. **`use-touches.ts:321-334` — `touchKeys.list` sorts `subjectIds` but does not dedupe**,
    while `useTouches` dedupes before querying (`:348`). Two cache keys can name one result
    set. (r4 minor 10.)

17. **`w4-paperwork-report.md` §6 records the client type-check as "clean".** It is red at
    HEAD (§0 above), pre-existing, and `w4-fix-log-r3.md` and `-r4.md` both record it as
    red. The report should agree with the fix logs. (r4 minor 11.)

18. **`w4-paperwork-report.md` §1 says the page calls `notFound()` on every miss.** It
    renders `<DeadLink />` — r2 MAJOR-4 replaced `notFound()` precisely because the
    portal's generic sheet pointed a subcontractor at a guarded `/`. (r4 minor 12.)

19. **Three report "owed" lists are false.** `w4-paperwork-report.md` §7 still lists the
    company card's inbound-queue band and the mint/revoke acts as owed ("today a paperwork
    link can only be minted from SQL"); `w4-studio-report.md` §7 still lists
    `/paperwork/[token]` as "still outstanding". All three shipped in this wave.
    (r4 minor 13, unchanged.)

20. **Test counts in the reports are stale in four places, re-measured this round.**
    `w4-paperwork-report.md` §5 lists 21 + 8 + 12 + 9 = 50 jest cases across the four
    paperwork files; HEAD runs **23 + 11 + 12 + 9 = 55**. §6 reports "154 suites, 2523
    tests"; HEAD runs **154 / 2 540**, and the coverage figures it quotes
    (76.84 / 72.71 / 76.56 / 79.18) are now **76.9 / 72.7 / 76.63 / 79.26**.
    `w4-studio-report.md` §1 says the new vitest file holds 35; HEAD runs **54**. §5
    reports the supabase vitest suite at 1 411 passing; HEAD runs **1 431**.
    (r4 minor 14, re-measured.)

21. **UTC-day arithmetic on the mint band's date choices.** `thirtyDaysOut`
    (`use-paperwork-links.ts:100-104`) and `firmEngagementWindowEnd` (`:135`) slice
    `toISOString()`, and the band sends `${chosenDay}T23:59:59Z`
    (`paperwork-link-act.tsx:144`). `use-touches.ts` now carries `STUDIO_TIME_ZONE` and
    `touchInstantDay` for exactly this class of error; the mint band does not use them, so
    a US-Central studio pressing after 19:00 local offers and writes a day one off the day
    it meant. (r4 minor 15.)

22. **`firmEngagementWindowEnd` still carries no tenant predicate** (the residue r3 MAJOR-4
    deliberately left). `people_directory_seats` admits seats on projects with
    `studio_id IS NULL` through its designer-of-record legs, so the band can print "The
    door can end with this firm's work here, <date>" from a seat that is not this studio's
    job — and, since the band now SENDS that day, the RPC accepts it rather than
    contradicting it. Scoping the face needs an organization id on the view.
    (r4 minor 16.)

23. **`seat-window-band.tsx:103-138` — `save()` writes a `record_notice`
    unconditionally**, so a press that changed neither date files a durable record that
    the fact changed. (r4 minor 17.)

24. **`paperwork-sheet.tsx:110-133` — an opened upload form has no way back**; only a
    successful send collapses it. A firm that opens the wrong row is left with the form
    standing. (r4 minor 18.)

25. **`app/paperwork/[token]/page.tsx:110-115` — `studio_name` has a fallback ("the
    studio"); `company_name` has none**, so a card with neither `company_name` nor
    `full_name` prints an empty eyebrow above the h1. (r4 minor 19.)

26. **`use-invoices.ts:1395-1409` — `useRegenerateInvoiceLink` now `setQueryData`s and
    invalidates nothing at all.** Correct for the mint itself (the r4 fix), but
    `invalidateInvoiceEffects(queryClient, projectId, invoiceId)` still invalidates
    `['invoice-link', invoiceId]` from seven other invoice mutations (`:393`), so a Resend
    or a Record-payment taken before the address is copied refetches `get_invoice_link`,
    parses `token: NULL`, and the Copy act disappears with no sentence. Recoverable
    (Regenerate again), but the folio never says "this address is shown once" the way the
    paperwork mint band does. (r4 minor 20, re-framed.)

27. **`middleware.ts:148` — `isPaperworkPage` matches `startsWith('/paperwork/')` only.** A
    bare `/paperwork` is neither public nor `noindex`-headed; `/pay` handles both forms two
    lines above. `app-chrome.tsx` already handles both. Cosmetic. (r4 minor 23.)

28. **Outside the briefed dirs, carried and worth a ruling before ship:**
    `packages/notifications/src/unsubscribe.ts:170-175` — one click on one letter's
    unsubscribe marks **every** email-kind channel sharing that address `unsubscribed`,
    across every card and every studio, and the (r3-widened) send gate then refuses POs and
    invoices too. The token is HMAC-verified, so nothing is forged and nothing crosses a
    subject the recipient does not own; r4 fixed the *copy* so the landing now says what
    the write did. The policy itself is still a ruling owed, not a code defect. (r4 minor
    22.) The r2/r3 storage items — `compliance-documents` read policy org-scoped rather
    than (org, company), an orphaned object after a refused
    `record_inbound_compliance_document`, and that RPC not checking `p_file_path` against
    the token's own `{org}/{company}/` prefix — are unchanged. (r4 minor 21.)

---

## 5. What this round did not cover

- **No Playwright run and no server on 3000/3002.** This is the code round. Both specs
  were read for the binding conventions: `--project=chromium` (the client config declares
  chromium only), **zero** `waitForTimeout` in either, and `expect.poll` used for every DB
  assertion — `paperwork-link.spec.ts:258` (one document written) and
  `paperwork-inbound.spec.ts:210,248,285`.
- **No migration read for defects**, only for the contracts the portal code claims
  (00623 vocabulary, 00635 `record_touch` / RLS, 00636 backfill order and resolvers, 00637
  gates, projections and the twelfth grant tier). The migration wave has its own reviewer.
- **No visual pass**, so minor 1 is reported as structural reading, not as a rendering.
- **No prod anything**: no `db push`, no `functions deploy`, no secrets. No migration
  minted — the ledger head is still `00638` and nothing in the reserved `00595–00620` band
  was touched. The local database was read only (`select` probes against
  `v_access_grants`, `people_directory`, `studio_contacts`, `studio_touches`).

This file needs `git add -f`.
