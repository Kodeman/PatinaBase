# W4 (P3) — round-4 adversarial code review (surfaces + help)

Worktree `.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`,
HEAD `4730eb0b1` ("fix(people-crm): W4 round-3 review — 11 major").

W4's scope taken as `git diff 0249e1eff..HEAD` (the four W4 commits: `0f671b149`,
`322538551`, `36148de9b`, `4730eb0b1`). Every changed file under
`apps/client-portal/src`, `apps/designer-portal/src`, `packages/supabase/src/hooks`,
`packages/help-system/src` and `studios/help-system/scripts` was read in full.
`rulings.md` §3 treated as settled throughout. No prod anything: no `db push`, no
`functions deploy`, no secrets. No file in the repo was changed by this round (two
temporary probe specs were written, run, and deleted; `git status` is as found).

**Verdict: NOT clean — one major, zero blocking.**

---

## 0. Gates, re-run at HEAD

| Gate | Command | Result |
|---|---|---|
| Supabase type-check | `pnpm --filter @patina/supabase type-check` | **clean, exit 0** |
| Designer type-check | `pnpm --dir apps/designer-portal type-check` | **clean, exit 0** |
| help-system type-check | `pnpm --dir packages/help-system type-check` | **clean, exit 0** |
| Client type-check | `pnpm --dir apps/client-portal type-check` | **RED — pre-existing, not W4's** (minor 11) |
| admin-portal build | `npx next build --webpack` (inline local env) | **exit 0**, `ƒ /preferences/unsubscribe` present |
| admin middleware jest | `npx jest src/__tests__/middleware-auth.test.ts` | **11 passed** |
| Client jest + coverage | `npx jest --coverage` in `apps/client-portal` | **154 suites / 2 538 tests pass**, floor holds |
| Designer jest (touched areas) | `npx jest src/components/document/people src/components/document/roster src/lib/analytics src/lib/help-system` | **55 suites / 779 tests pass** |
| Supabase vitest (W4 file) | `npx vitest run src/hooks/__tests__/people-crm-w4.test.ts` | **54 passed** |
| Surface-key parity | `npx jest src/lib/help-system/surface-key-parity.test.ts` | **6/6 pass** |
| Help dry-run seed | `node studios/help-system/scripts/run-people-help-seed.mjs` | **18 written (dry), 0 errored** |
| Migration ledger | `select version … order by version desc` on the local DB | `00638, 00637, 00636, 00635, 00634` — matches HEAD; nothing in the reserved `00595–00620` band |

### Supabase / designer / help type-check tails

```
> @patina/supabase@0.0.1 type-check
> tsc --noEmit
EXIT=0

> @patina/designer-portal@0.1.0 type-check
> tsc --noEmit
EXIT=0

> @patina/help-system@0.1.0 type-check
> tsc --noEmit
EXIT=0
```

### Client type-check tail (the one red — pre-existing)

```
> @patina/client-portal@0.1.0 type-check
> tsc --noEmit

.next/types/app/page.ts(37,29): error TS2344: Type '{ searchParams?: Promise<Record<string, string | string[] | undefined>> | undefined; } | undefined' does not satisfy the constraint 'PageProps'.
  Type 'undefined' is not assignable to type 'PageProps'.
 ELIFECYCLE  Command failed with exit code 1.
EXIT=1
```

Provenance measured, not assumed — `apps/client-portal/src/app/page.tsx`'s last commit
(`7ff6c085d`) is an ancestor of W4's base `0249e1eff`:

```
git merge-base --is-ancestor 7ff6c085d 0249e1eff  →  PRE-EXISTING (before W4)
```

### admin-portal build tail

```
├ ƒ /preferences/unsubscribe
…
ƒ Proxy (Middleware)
○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
EXIT=0
```

### Client coverage, pasted (floor 70/60/70/70)

```
All files                          |    76.9 |     72.7 |   76.63 |   79.25 |

 src/app/paperwork/[token]         |      95 |      100 |     100 |     100 |
 src/components/paperwork          |   98.91 |    91.13 |   96.96 |   99.37 |
  paperwork-model.ts               |     100 |    89.13 |     100 |     100 | 193-217,225-228,236
  paperwork-sheet.tsx              |   97.22 |      100 |     100 |   96.87 | 28
  paperwork-upload-form.tsx        |   98.48 |    91.66 |   88.88 |     100 | 102,146

Test Suites: 154 passed, 154 total
Tests:       2538 passed, 2538 total
EXIT=0
```

Every new `apps/client-portal` file ships with its own test:

| New file | Its test | Cases |
|---|---|---|
| `src/app/paperwork/[token]/page.tsx` | `src/app/paperwork/[token]/__tests__/page.test.tsx` | 9 |
| `src/components/paperwork/paperwork-model.ts` | `__tests__/paperwork-model.test.ts` | 23 |
| `src/components/paperwork/paperwork-sheet.tsx` | `__tests__/paperwork-sheet.test.tsx` | 10 |
| `src/components/paperwork/paperwork-upload-form.tsx` | `__tests__/paperwork-upload-form.test.tsx` | 11 |

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

No `--commit` was run; nothing reached Sanity.

---

## 1. The named checks, answered

### Help — clean on every named check

All 18 documents validated programmatically against BOTH registries at HEAD, rather
than by eye:

```
docs: 18
keys missing from a registry: 0        ← every surfaceKey exists in
                                          packages/help-system/src/surfaceKeys.ts AND
                                          apps/designer-portal/src/lib/help-system/document-surface-keys.ts
em-dashes: 0
(no duplicate _id, no duplicate (surfaceKey, contentType, persona) triple,
 every surfaceKey matches ^[a-z0-9-]+(\/[a-z0-9-]+)+$,
 every tooltip/fieldHelper body ≤160, every emptyState heading ≤50 / description ≤300,
 every helpArticle carries title + oneSentenceAnswer + a non-empty body array,
 every _id is the deterministic `helpContent.<dash-doubled path>` form)
```

15 keys were added to each registry (`PeopleFirm`, the eleven word/concept keys,
`CallSheetSiteAccess`, `CallSheetBringForward`, `CallSheetSiteAccessTold`) and the
parity suite agrees in both directions (6/6). r1 MAJOR-5 and r1 MAJOR-6 are
**closed and re-measured**. Two docblocks are stale — minors 6 and 7 below.

### The paperwork page — every named check but one

| Check | At HEAD |
|---|---|
| No nav | ✓ `/paperwork` joins `PUBLIC_PREFIXES` (`app-chrome.tsx:26`) → `data-portal-shell="public"`; the portal's shell carries no header, drawer or switcher at all |
| No homeowner data | ✓ `resolve_paperwork_link` (00637) returns only `studio_name`, `company_name`, `expires_at` and a document array with no ids, file paths or uploader names; the page adds nothing |
| No caveat / schema words | ✓ every sentence comes from `paperwork-model.ts`'s copy table; the doc-type and gate words come from `COMPLIANCE_DOC_TYPE_LABELS` / `COMPLIANCE_BLOCK_LABELS`, which are human phrases ("COI, general liability", "site access", "the draw"); no consequence sentence anywhere |
| Mobile-first | ✓ `max-w-lg px-4 py-10 sm:px-6`, `clamp()` title, every control `min-h-[44px]` |
| Keyboard-reachable | ✓ every field has a `<label htmlFor>`, the submit is a real `<button type="submit">`, the act is `aria-disabled` in flight and never `disabled` — **except** that two `other_named` forms collide on their ids (MAJOR-1) |
| Errors say what to do | ✓ "Choose the file first.", "Give the date it expires.", "That did not go through. Try again.", "Wait a minute, then open the link again.", and the door's own refusals verbatim |
| Client-portal coverage | ✓ floor holds; four new files, four new test files (table above) |

### Token handling and tenancy — no hole found

- The page format-gates the token (`/^[0-9a-f]{64}$/`) before any round trip, then
  resolves it SERVER-SIDE through the service-only RPC. The raw token never reaches a
  client bundle except as the route segment the visitor already holds.
- Both portals redact it from analytics: `HEX_BEARER_IN_URL` now names
  `share|rfq|evidence|plans|pay|trade|paperwork` in `apps/client-portal/src/lib/analytics/posthog.ts:100`
  and `apps/designer-portal/src/lib/analytics/posthog.ts:93`. r2 BLOCKING-1 closed.
- `mint_paperwork_link` gates on `is_active_studio_member(v_org)`; `resolve_paperwork_link`
  scopes its document read on BOTH `holder_id` and `organization_id`.
- RLS measured live, not read:

```
paperwork_link_tokens | paperwork_link_tokens_member_select | SELECT | {authenticated} | is_active_studio_member(organization_id)
studio_compliance_documents | …_member_select/_update/_delete | … | {authenticated} | is_active_studio_member(organization_id)
```

  `paperwork_link_tokens` carries no INSERT/UPDATE/DELETE policy at all, so every write
  goes through a SECURITY DEFINER RPC. `usePaperworkLinks` and `useInboundDocuments`
  filter only on `company_id`/`holder_id` and are safe because of those policies;
  `TOKEN_COLUMNS` deliberately omits `token_hash`.
- The rate bucket fails OPEN on a NULL address (`paperwork_link_rate_limit_hit` returns
  true), so a visitor behind a proxy that sets no header is never locked out by a
  shared bucket.

### The /pay rail is not broken by the backfill

00636 hashes every live token **before** nulling the plaintext
(`UPDATE … SET token_hash = invoice_link_token_hash(token) WHERE token_hash IS NULL
AND token IS NOT NULL;` then `UPDATE … SET token = NULL`), and gives every active row a
fresh 30 days rather than dating it from `created_at`. A `/pay/<token>` address a client
already holds still resolves. 00638 re-heads the two readers 00636 missed. The client
letterbox no longer reads `useInvoiceLink` at all, so no emailed address is minted or
revoked by a page load.

### Prior findings, re-measured at HEAD

| Round | Finding | At HEAD |
|---|---|---|
| r3 MAJOR-1 (data) | channel gate skipped on `userId` letters | **FIXED** — `send-email.ts:448-453`, `recordChannel` split from the gate |
| r3 MAJOR-2 (data) | unsubscribe landing untested | **FIXED** — `packages/notifications/src/__tests__/unsubscribe.test.ts` exists |
| r3 MAJOR-3 (data) | a firm merge stranded the paperwork door | **FIXED** — 00629:2721-2770 repoints/revokes `paperwork_link_tokens` in both branches |
| r3 MAJOR-4 (data) | the room printed the UTC day | **FIXED** — `touchInstantDay` + `STUDIO_TIME_ZONE` (`use-touches.ts:173-222`), read by `touchDate` and `inboundDocumentLine` |
| r3 MAJOR-5 (data) | `flushDeferredMessages` wrote no touch | **FIXED** — `_shared/sms.ts:1231` `p_actor_ref: "sms-dispatch-flush"` |
| r3 MAJOR-6 (data) | account-less unsubscribe hit a sign-in wall | **FIXED** — `admin-portal/src/middleware.ts:37`; build + 11 tests green |
| r3 QA MAJOR-1 | mint band's before/after disagreed by a day | **FIXED** — `lastOpenDay` in `people-format.ts`, used by `paperworkMintedSentence` and `WHOLE_DAY_BOUNDARY_TIERS` |
| r3 code MAJOR-1 | inbound queue said "Other" | **FIXED** — `use-inbound-documents.ts:105-110` branches on `other_named` ahead of the map |
| r3 code MAJOR-2 | seat window band destroyed focus, dangling IDREF | **HALF FIXED** — the trigger/panel half landed; the SAVE half the finding also named is still open (minor 1) |
| r3 code MAJOR-3 | letterbox money act removed itself | **FIXED** — `payHere = invoice !== null && balanceCents > 0`, `aria-expanded`, focus into `role="group"`, `role="status"` region |
| r3 code MAJOR-4 | mint band not tenant-scoped | **FIXED in substance** — every branch now names its day, so the RPC never re-derives (minor 4 notes the residue) |
| r1/r2 majors (all) | — | re-verified closed; none regressed |
| r3 minors 1–18 | — | **all still open** (they were never in the r3 fix brief); re-reported below where they are still true |

---

## 2. MAJOR

### MAJOR-1 — two `other_named` upload forms on `/paperwork/[token]` collide on every field id, so the second form's fields are unlabelled and its labels focus the first form's controls

`apps/client-portal/src/components/paperwork/paperwork-upload-form.tsx:62`

```ts
const fieldId = (name: string) => `paperwork-${docType}-${name}`;
```

The id is keyed on `docType`. But `paperwork-model.ts:191-195` **deliberately** keeps two
differently-named `other_named` papers as two separate rows — decision P-3 in
`w4-paperwork-report.md`, "Otherwise a roof warranty would retire an asbestos permit on
the face" — and both carry `docType === 'other_named'`:

```ts
function groupKey(doc) {
  return doc.doc_type === 'other_named'
    ? `other_named:${(doc.doc_label ?? '').trim().toLowerCase()}`
    : doc.doc_type;
}
```

So the sheet computes a unique `row.key` for each and then throws it away when it builds
the form's ids. Measured, not reasoned — a probe rendering one firm holding an "Asbestos
permit" and a "Roof warranty" with both forms open:

```
INPUT IDS = ["paperwork-coi_gl-file", … ,
             "paperwork-other_named-file","paperwork-other_named-number",
             "paperwork-other_named-issuer","paperwork-other_named-issued_on",
             "paperwork-other_named-expires_on",
             "paperwork-other_named-file","paperwork-other_named-number",
             "paperwork-other_named-issuer","paperwork-other_named-issued_on",
             "paperwork-other_named-expires_on"]

DUPLICATE IDS = ["paperwork-other_named-file","paperwork-other_named-number",
                 "paperwork-other_named-issuer","paperwork-other_named-issued_on",
                 "paperwork-other_named-expires_on"]

LABEL FORs    = [… "paperwork-other_named-file" ×2, "paperwork-other_named-number" ×2,
                 "paperwork-other_named-issuer" ×2, "paperwork-other_named-issued_on" ×2,
                 "paperwork-other_named-expires_on" ×2]
```

What it costs the firm: `getElementById` and `label[for]` both resolve to the FIRST
match, so on the Roof warranty form every label points at the Asbestos permit form's
control. A pointer user clicking "File" under Roof warranty focuses the wrong file input
and, on the second field, types the certificate number into the wrong form. A screen
reader announces the second form's five fields with no accessible name at all
(the first form has taken every association), on a page whose entire purpose is five
labelled fields. The forms themselves still post correctly — the state is React's, not
the DOM's — so the harm is squarely the a11y contract and the pointer mis-target, not a
wrong write.

Not caught because `paperwork-sheet.test.tsx` never renders two `other_named` rows at
once, and `paperwork-model.test.ts` asserts the two rows stay apart at the MODEL level
only.

**The fix is one line**, and the unique key already exists: pass `row.key` down as a
`fieldPrefix` and build `paperwork-${fieldPrefix}-${name}`, or `useId()` per form
instance. Add the two-`other_named` case to `paperwork-sheet.test.tsx`.

---

## 3. MINOR (reported, never gating)

1. **`seat-window-band.tsx:128,133` — r3 MAJOR-2's SAVE leg is still open, and the test
   named for it asserts nothing about focus.** The finding named both halves ("Saving did
   it again (`setOpen(false)` at :128/:133 with focus on 'Write the window')"). The fix
   landed the trigger/panel half only. Measured:

   ```
   ACTIVE AFTER SAVE = BODY | isBody = true | saveStillInDoc = false
   ```

   `seat-window-band.test.tsx:82` is titled "survives a save with focus intact" and
   asserts only `aria-expanded="false"`, panel present, panel `hidden` — never
   `document.activeElement`. Kept minor rather than re-raised as major because the
   sibling `notice-log.tsx:168` (pre-existing, W2/W3) closes the same way on save and no
   surface in `people/` or `roster/` uses `DocumentAction`'s own `restoreFocusRef`; the
   outcome IS announced through the row's polite `role="status"` (`roster-row.tsx:287-294`).
   The overstated test title is the part that should not stand.

2. **`inbound-queue-band.tsx:126-128,185-190` — Confirm and Reject destroy the focus of
   the studio member who pressed them.** `setStep("idle")` unmounts the pressed button,
   and the subsequent refetch removes the `<li>` entirely when the queue empties.
   Measured:

   ```
   ACTIVE AFTER CONFIRM = BODY | isBody = true | pressedStillInDoc = false
   ```

   Same room-wide pattern as minor 1, and the outcome reaches `people-room.tsx:701`'s
   standing polite announcer, so it is reported rather than gated. `restoreFocusRef` on
   the idle `Confirm`/`Reject` row would close both this and minor 1.

3. **`paperwork-sheet.tsx:58,68` — the live region writes the same constant for every
   row** (`setAnnouncement(receiptSentence)`), so a second upload in one visit mutates
   nothing and is not re-announced, and the sentence names no document. Carried from r3
   minor 4, still true. `letterbox.tsx:355-358` now has the same shape for its own
   money act (the same string on a second press).

4. **`paperwork-upload-form.tsx:223-227` — the failure region mounts WITH its text**
   (`{state === 'error' && message && <p role="status">…}`). A live region inserted
   alongside its content is unreliably announced; the sheet's own region
   (`paperwork-sheet.tsx:76`) is always mounted and is the pattern to copy. A refusal is
   also a `status` where `roster-row.tsx:300-310` records this programme's own ruling
   ("r7 MAJOR-4 — A REFUSAL IS AN ALERT, NOT A STATUS"). Carried from r3 minor 3.

5. **`paperwork-link-act.tsx:96-98` — `choice` is seeded once, before the seats arrive.**
   `usePeopleSeats({ all: true })` resolves after the card renders, so a firm that DOES
   have an engagement window commonly renders "Ends with the job — 21 November 2026"
   *unchecked* beside a pre-selected "Thirty days". Since r3 MAJOR-4 made every branch
   send its own day, the press now writes thirty days rather than the job's end — the
   date is still said out loud before the press, which keeps this minor. Carried from r3
   minor 9. A `useEffect` reseeding `choice` when `windowEnd` transitions null→date
   closes it; the same effect also covers the inverse transition, where `choice` stays
   `"window"` with no radio rendered and `chosenDay` falls to `null`.

6. **`studios/help-system/scripts/people-help-content.ts:42-53` — the docblock still says
   the twelve concept surfaceKeys "are NOT promoted to named constants in
   `packages/help-system/src/surfaceKeys.ts`" and calls promotion "a follow-up".** r1
   MAJOR-5 promoted all of them; this review measured 18/18 keys present in both
   registries. Carried from r3 minor 14.

7. **`studios/help-system/scripts/seed-people-help.ts:5-8` — the docblock names
   `SurfaceKeys.DesignerPortal.Document.{…,CallSheet.SiteAccess,CallSheet.BringForward}`.**
   The constants are flat (`CallSheetSiteAccess`, `CallSheetBringForward`,
   `CallSheetSiteAccessTold`); there is no `CallSheet` object to dot into. It also says
   "five surfaces" where the content is authored against 17 keys. Carried from r3 minor 15.

8. **`use-inbound-documents.ts:45` — "All six tokens 00637 can raise are named here".**
   Eight are listed and eight is correct; the sentence is stale from before r2's fix.
   Carried from r3 minor 1.

9. **Two refusal sentences misdirect the reader.** `use-paperwork-links.ts:64-65` ("Ask an
   owner or admin of the studio") and `use-touches.ts:409-410` ("This job's notices are
   not yours to write. Ask an owner or admin") both describe an owner/admin gate;
   00637:450 and 00635 gate on `is_active_studio_member`. `record_notice`'s refusal also
   fires when `project_tenant_org` is NULL (R-BI's studio-less jobs), where no owner can
   help. Carried from r3 minor 2.

10. **`use-touches.ts:321-334` — `touchKeys.list` sorts `subjectIds` but does not dedupe,
    while `useTouches` dedupes before querying (`:348`).** Two cache keys can name one
    result set. Carried from r3 minor 7.

11. **The client type-check gate is RED at HEAD** (`.next/types/app/page.ts(37,29) TS2344`,
    tail pasted in §0). Measured pre-existing by `git merge-base --is-ancestor`, so not
    W4's defect — but `w4-paperwork-report.md` §6 still records this gate as "clean" and
    `w4-fix-log-r3.md` records it as red. The report should agree with the fix log.
    Carried from r3 minor 11.

12. **`w4-paperwork-report.md` §1 says the page calls `notFound()` on every miss.** It
    renders `<DeadLink />` — r2 MAJOR-4 replaced `notFound()` precisely because the
    portal's generic sheet pointed a subcontractor at a guarded `/`. The table row is
    stale.

13. **Three report "owed" lists are false.** `w4-paperwork-report.md` §7 still lists the
    company card's inbound-queue band and the mint/revoke acts as owed ("today a
    paperwork link can only be minted from SQL"); `w4-studio-report.md` §7 still lists
    `/paperwork/[token]` as "still outstanding". All three shipped in this wave. Carried
    from r3 minor 12 — unchanged.

14. **Test counts in the reports are stale in three places.**
    `w4-paperwork-report.md` §5 lists 21 + 8 + 12 + 9 = 50 jest cases across the four
    paperwork files; HEAD runs **23 + 10 + 11 + 9 = 53** (measured per file).
    `w4-studio-report.md` §1 says the new vitest file holds 35; HEAD runs **54**.
    `w4-studio-report.md` §5 reports the supabase vitest suite at 1 411 passing;
    `w4-fix-log-r3.md` reports 1 431.

15. **UTC-day arithmetic on the mint band's three date choices.** `thirtyDaysOut`
    (`use-paperwork-links.ts:103`) and `firmEngagementWindowEnd` (`:135`) slice
    `toISOString()`, and the band sends `${chosenDay}T23:59:59Z`
    (`paperwork-link-act.tsx:144`). `use-touches.ts` now has `STUDIO_TIME_ZONE` and
    `touchInstantDay` for exactly this class of error; the mint band does not use them, so
    a US-Central studio pressing after 19:00 local reads and writes a day one off the day
    it meant, and the door closes 18:59:59 local. Carried from r3 minor 6.

16. **`firmEngagementWindowEnd` still carries no tenant predicate** (the residue r3
    MAJOR-4 deliberately left). `people_directory_seats` admits seats on projects with
    `studio_id IS NULL` through its designer-of-record legs, so the band can print "The
    door can end with this firm's work here, <date>" from a seat that is not this
    studio's job. Because the band now SENDS that day, the RPC accepts it rather than
    contradicting it — the door's end date is simply borrowed from a legacy seat. The
    date is shown before the press, which keeps this minor; scoping the face needs an
    organization id on the view, i.e. a migration.

17. **`seat-window-band.tsx:103-138` — `save()` writes a `record_notice`
    unconditionally**, so a press that changed neither date files a durable record that
    the fact changed. Carried from r3 minor 16.

18. **`paperwork-sheet.tsx:110-130` — an opened upload form has no way back**; only a
    successful send collapses it. A firm that opens the wrong row is left with the form
    standing. Carried from r3 minor 17.

19. **`page.tsx:110-115` — `studio_name` has a fallback ("the studio"); `company_name` has
    none**, so a card with neither `company_name` nor `full_name` prints an empty eyebrow
    above the h1. Carried from r3 minor 10.

20. **`use-invoices.ts` — `useRegenerateInvoiceLink` only `setQueryData`s and never
    invalidates**, so the minted address lives in one cache entry that any other invoice
    mutation's `invalidateInvoiceEffects` (or a remount past the staleTime) nulls out from
    under the Copy control. The paperwork mint says "This address is shown once" on the
    face; this one does not. Carried from r3 minor 5.

21. **Carried from r2/r3 and still open, all minor:** the `compliance-documents` storage
    read policy is org-scoped rather than (org, company) and still casts
    `(storage.foldername(name))[1]::uuid`; a refused `record_inbound_compliance_document`
    leaves the uploaded object orphaned in the bucket; and that RPC still does not check
    `p_file_path` against the token's own `{org}/{company}/` prefix. (r3 minor 18.)

22. **`packages/notifications/src/unsubscribe.ts` — `applyChannelUnsubscribe` discards
    `type`**: a one-click unsubscribe from one notification type marks the address
    `unsubscribed` on every email-kind row sharing its value, which the (now widened) send
    gate reads for ALL mail including POs and RFQs, while the returned outcome still names
    `type` as though the stop were scoped to it. Carried from r3 minor 8 — and the r3
    widening of the gate (`send-email.ts:448`) increases its blast radius, so it is worth
    a ruling before ship rather than after.

23. **`middleware.ts:148` — `isPaperworkPage` matches `startsWith('/paperwork/')` only.**
    A bare `/paperwork` is neither public nor `noindex`-headed; it 404s after a sign-in
    bounce rather than rendering the dead sheet. `/pay` handles both forms two lines
    above. Cosmetic; noted for symmetry.

---

## 4. What this round did not cover

- **No Playwright run and no server on 3000/3002.** This is the code round; the wave's own
  e2e (`paperwork-link.spec.ts`, `paperwork-inbound.spec.ts`) were read and checked for the
  binding conventions — chromium-pinned project, **zero** `waitForTimeout`, `expect.poll`
  for every DB assertion (1 in the client spec, 3 in the designer spec; the earlier
  single-line grep that read 0 was wrong — the idiom spans two lines) — but not executed.
  The port rule was therefore not exercised, and no port conflict was observed or reported.
- **No `supabase db reset`.** The ledger replays to `00638` with no duplicates and nothing
  in `00595–00620`; this round minted no migration and changed no file, so a reset had
  nothing new to prove and the shared local stack was left as found.
- **No writes to the local database.** Only `pg_policies` and `schema_migrations` were read.
- **The edge function's HTTP shell, CORS, rate bucket and mime/size refusals** are the data
  wave's twelve Deno tests and were not re-run here.
- Two probe specs were written into the worktree, run, and **deleted**
  (`roster/__tests__/zz-r4-probe.test.tsx`, `paperwork/__tests__/zz-r4-probe.test.tsx`);
  a third probe (double-submit on the upload form) showed the in-flight guard **holds**
  (1 fetch for 2 synchronous submits) and produced no finding.

This file needs `git add -f`.
