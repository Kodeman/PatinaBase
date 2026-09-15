# W4 (P3) — round-3 adversarial code review: the three surfaces + help

Worktree `.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`,
HEAD `36148de9b`. Read in full: `w4-paperwork-report.md`, `w4-studio-report.md`,
`w4-help-report.md`, `w4-fix-log-r2.md`, and every file changed under
`apps/client-portal/src`, `apps/designer-portal/src`, `packages/supabase/src/hooks`,
`packages/help-system/src`, `studios/help-system/scripts` between `0249e1eff` (W3
close-out) and HEAD — 61 files, 6 529 insertions. `rulings.md` §3 treated as settled.
No prod: no `db push`, no `functions deploy`, no secrets, no migration minted, no
`--commit` to Sanity. Nothing in the working tree was modified by this review.

**Verdict: NOT clean — zero blocking, four major, eighteen minor.**

---

## 0. Gates, re-run at HEAD

| Gate | Command | Result |
|---|---|---|
| Supabase type-check | `pnpm --filter @patina/supabase type-check` | **clean** (exit 0) |
| help-system type-check | `pnpm --dir packages/help-system type-check` | **clean** (exit 0) |
| Designer type-check | `pnpm --dir apps/designer-portal type-check` | **clean** (exit 0) |
| Client type-check | `pnpm --dir apps/client-portal type-check` | **RED** — one error, pre-existing (minor 11) |
| admin-portal build | `npx next build --webpack` (inline local env) | **green**, exit 0, full route table |
| client-portal build | `npx next build --webpack` (inline local env) | **green**, exit 0, `ƒ /paperwork/[token]` present |
| Client jest + coverage | `npx jest --coverage` in `apps/client-portal` | **154 suites / 2 537 tests pass**; all-files **76.88 / 72.65 / 76.62 / 79.23** vs the 70/60/70/70 floor |
| Designer jest (touched areas) | `npx jest src/components/document/people src/components/document/roster src/lib/analytics src/lib/help-system` | **55 suites / 774 tests pass** |
| Supabase vitest (whole package) | `npx vitest run` in `packages/supabase` | **107 files / 1 425 pass, 12 skipped** |
| Deno — the r2 blocking gate | `deno test --allow-all --config supabase/functions/deno.json supabase/functions/_tests/email-channel-status.test.ts` | **17 passed, 0 failed**; `deno.lock` absent from the repo root afterwards |
| Help dry run | `node studios/help-system/scripts/run-people-help-seed.mjs` | **18 written (dry), 0 errored** |

### Client type-check tail (the one red)

```
> @patina/client-portal@0.1.0 type-check
> tsc --noEmit

.next/types/app/page.ts(37,29): error TS2344: Type '{ searchParams?: Promise<Record<string, string | string[] | undefined>> | undefined; } | undefined' does not satisfy the constraint 'PageProps'.
  Type 'undefined' is not assignable to type 'PageProps'.
 ELIFECYCLE  Command failed with exit code 1.
```

Re-run **after a fresh `next build`** regenerated `.next/types` — still red, so it is a live
source issue, not a stale artifact: `apps/client-portal/src/app/page.tsx:21` declares
`props?:` optional. That file was last touched in `7ff6c085d`, which
`git merge-base --is-ancestor 7ff6c085d 0249e1eff` confirms predates this wave. Pre-existing,
not W4's — but the gate is red and `w4-paperwork-report.md` §6 records it as "clean".

### Client coverage, pasted

```
All files                            |   76.88 |    72.65 |   76.62 |   79.23 |
 src/app/paperwork/[token]           |      95 |      100 |     100 |     100 |
 src/components/paperwork            |   98.91 |    91.13 |   96.96 |   99.37 |
  paperwork-model.ts                 |     100 |    89.13 |     100 |     100 |
  paperwork-sheet.tsx                |   97.22 |      100 |     100 |   96.87 |
  paperwork-upload-form.tsx          |   98.48 |    91.66 |   88.88 |     100 |

Test Suites: 154 passed, 154 total
Tests:       2537 passed, 2537 total
```

Floor holds. Every new client-portal file ships with its test — `page.tsx` →
`src/app/paperwork/[token]/__tests__/page.test.tsx`, and each of the three
`src/components/paperwork/*` files has its own `__tests__` sibling (53 cases across the four,
measured at HEAD). No new client-portal source file lacks one.

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

---

## 1. The named checks, answered

### Help — clean on every named check

Measured, not read:

- **All 17 surfaceKeys exist in BOTH registries.** A script walked the 18 docs' `surfaceKey`
  values and grepped `packages/help-system/src/surfaceKeys.ts` and
  `apps/designer-portal/src/lib/help-system/document-surface-keys.ts` for each as a quoted
  literal: 17/17 present in both (r1 MAJOR-5 closed). Fifteen constants were added to each
  file and the counts agree with `w4-help-report.md` §1.
- **Caps hold.** Every `tooltipContent.body` ≤ 160 (max measured 157, `.../people/contact-rule`
  and `.../people/person/access-grant`) against `helpContent.ts`'s `Rule.required().max(160)`;
  the one `emptyState` is heading 22 ≤ 50, description 194 ≤ 300. The helpArticle carries
  title + `oneSentenceAnswer` + six non-empty blocks, which is the schema's required shape.
- **No em-dashes.** A recursive walk of every string in all 18 docs for `[—–]` returns zero
  (r1 MAJOR-6 closed).
- **Deterministic `_id`s.** 18 docs, 18 distinct `_id`s, all of the form
  `helpContent.<surfaceKey with / → -->`; 18 distinct `(surfaceKey, contentType, persona)`
  triples; every `surfaceKey` matches the schema's `^[a-z0-9-]+(\/[a-z0-9-]+)+$`. The runner
  is `createOrReplace` on those ids, so a re-run replaces rather than duplicates.
- **Dry run pasted above**; `--commit` requires both the flag and `SANITY_AUTH_TOKEN`
  (`run-people-help-seed.mjs:21,30-35`), and neither was supplied.

Two stale docblocks, minor only: see minors 14 and 15.

### The paperwork page — clean on every named check

- **No nav, no chrome.** `/paperwork` joins `PUBLIC_PREFIXES` in
  `app-chrome.tsx:26`, and `AppChrome` renders no header or drawer on either branch — it only
  stamps `data-portal-shell`. `page.tsx` renders one `<main>`, a `<header>` with the firm's name
  and the h1, and the sheet.
- **No homeowner data.** `resolve_paperwork_link` (00637:640-646) returns exactly
  `studio_name`, `company_name`, `expires_at` and a `documents` array of
  `doc_type / doc_label / expires_on / blocks / state / awaiting_check`; its document subquery
  is scoped `holder_id = v_row.company_id AND organization_id = v_row.organization_id`. Probed
  live against the local DB with a hand-minted token on Northgate Electric: the answer carries
  no ids, no file paths, no person names, no project. The page adds nothing.
- **No caveat or schema words.** Stripping block comments from the four paperwork files and
  the four new designer files and grepping for `R-[A-Z]`, `PR-[a-z]`, `CRM-\d`, `§`, and the
  schema tokens (`verified_at`, `subject_type`, `studio_verdict`, `organization_id`,
  `awaiting_check`) finds only code identifiers, never a rendered string. r1 MAJOR-4's
  "R-AD leaves no clock to fall back on" is gone — `paperwork-link-act.tsx:257` now reads
  "Name the day it closes. There is no clock to fall back on."
- **Mobile-first.** `max-w-lg px-4 py-10 sm:px-6`, a `clamp(1.6rem, 6vw, 2.2rem)` title, and
  `min-h-[44px]` on every control and field (`paperwork-upload-form.tsx:42,217`,
  `paperwork-sheet.tsx:125`).
- **Keyboard-reachable.** Every control is a native `<button>` or `<input>`; the submit is held
  with `aria-disabled` and an early return (`paperwork-upload-form.tsx:66,218`) and never
  `disabled`.
- **Errors say what to do.** "Choose the file first.", "Give the date it expires.",
  "That did not go through. Try again.", the door's own verbatim refusals, and the rate sheet's
  "Wait a minute, then open the link again." The dead sheet
  (`page.tsx:56-70`) names no party and offers no destination.

### Token handling, tenancy, storage — no hole found

- `resolve_paperwork_link` is `service_role`-only (00637:651-653) and the page holds a service
  client; the format gate (`page.tsx:81`) runs before any round-trip; malformed, unknown,
  revoked and expired all render the same sheet.
- `uploadPaperwork` verifies the token's shape, then re-derives the studio and firm from
  `paperwork_link_storage_context(token)` **before** the storage write
  (`paperwork-upload/core.ts:176,202-213`), and `record_inbound_compliance_document` re-verifies
  it a third time (00637:692-698). Nothing the browser sends names the firm.
- RLS on both new tables is tenant-scoped — `studio_touches_member_select` and
  `paperwork_link_tokens_member_select` are both `USING (is_active_studio_member(organization_id))`
  with no INSERT/UPDATE/DELETE policy — so `useTouches`' un-org-filtered `.in('subject_id', …)`
  and `usePaperworkLinks`' `.eq('company_id', …)` cannot read across tenants.
- `storage.objects` carries exactly one policy for `compliance-documents`
  (`compliance_documents_member_read`, SELECT, `authenticated`); there is no anon or
  authenticated write policy, so only `service_role` puts objects in the bucket.
- Migrations: no duplicate numbers on the branch, ledger at `00638`, and nothing in the
  reserved `00595–00620` band.

### The /pay rail is not broken

`door-gate.tsx:283-286`'s `/?invoice=<id>` fallback lands on the homeowner's own authenticated
house page (`DoorGate` is mounted only from `threshold.tsx:876` and `letterbox-door.tsx:163`),
never a guest surface, so it does not dead-end. The letterbox's terminal act opens the letter
and `Settlement` — the settle-in-place till — renders inside it (`letterbox.tsx:362-382`), so
the act is not inert. The emailed `/pay/<token>` sheet is untouched.

### Every prior finding, re-measured

| Round | Finding | At HEAD |
|---|---|---|
| r1 code MAJOR-1 | firm told its studio's own paper "was received" | **FIXED** — `awaiting_check` gained the `inbound` leg (00637:769) and `buildPaperworkRows` lets only held paper speak the word |
| r1 code MAJOR-2 | unchecked upload moves the paper word | **FIXED** — `retainedComplianceDocuments`' `held()` predicate (`use-studio-contacts.ts:1630`) mirrors the SQL |
| r1 code MAJOR-3 | revoke leaves the mint band claiming a live door | **FIXED** — `useRevokeAccessGrant` invalidates `['paperwork-links']` (`use-access-grants.ts:349`) |
| r1 code MAJOR-4 | ruling id on the face | **FIXED** — `paperwork-link-act.tsx:257` |
| r1 code MAJOR-5 | 12 surfaceKeys in neither registry | **FIXED** — 17/17 in both, measured |
| r1 code MAJOR-6 | 26 em-dashes in the help copy | **FIXED** — 0, measured |
| r1 data B-1 | design-build deposit `/pay` link dead | **FIXED** — `payToken: string \| null` + the `/?invoice=` fallback |
| r1 data M-5 | folio's copy act inert | **FIXED**, with a new fragility — see minor 5 |
| r2 code BLOCKING-1 | paperwork token shipped to PostHog | **FIXED** — `paperwork` (and `trade`) in `HEX_BEARER_IN_URL` in both portals |
| r2 qa W4R2-1 (BLOCKING) | suppression gate dead against the real schema | **FIXED** — `studio_contacts!inner(organization_id)` (`_shared/send-email.ts:164`); the Deno suite runs 17/17 |
| r2 code MAJOR-1 / data MAJOR-1 | two refusals reach the studio as raw tokens | **FIXED** — all eight `compliance_*` tokens 00637 raises are in `INBOUND_REFUSAL_SENTENCES` (grep-verified against the migration) |
| r2 code MAJOR-2 | mint band offers a window that has passed | **HALF FIXED** — the ahead-of-today leg landed; the tenant-scope leg is still open (**MAJOR-4** below) |
| r2 code MAJOR-3 / data MAJOR-2 | letterbox offers no pay act | **FIXED** in substance, with a new a11y defect (**MAJOR-3** below) |
| r2 code MAJOR-4 | dead link dead-ends on the homeowner's 404 | **FIXED** — `DeadLink` |
| r2 code MAJOR-5 | upload outcome silent to AT, focus destroyed | **FIXED** for the first send; see minor 4 for the second |
| r2 qa W4R2-2 | live `paperwork_link` grant never reaches Access grants | **FIXED** — `FIRM_SCOPED_ACCESS_GRANT_TIERS` |
| r2 data MAJOR-3 | bounce write-back dropped for an unattributable letter | **FIXED** — `writeChannelStatus` before the `matched:false` return (`resend-webhook/index.ts:229`) |
| r2 data MINOR 9 / 10 / 11 / 18 | storage policy org-scoped, orphan object, no `p_file_path` prefix check, uuid-cast idiom | **ALL STILL OPEN** — carried, minor 18 |

---

## 2. MAJOR

### MAJOR-1 — the inbound queue asks the studio to confirm "Other": a firm's own name for its paper is dropped on the one face where the act is taken

`packages/supabase/src/hooks/use-inbound-documents.ts:94-97`

```ts
const label =
  COMPLIANCE_DOC_TYPE_LABELS[doc.doc_type as ComplianceDocType] ??
  doc.doc_label ??
  doc.doc_type;
```

`COMPLIANCE_DOC_TYPE_LABELS.other_named === 'Other'` (`use-studio-contacts.ts:1453`) is truthy,
so `?? doc.doc_label` is unreachable for the one doc_type whose whole point is that the label
carries the meaning. The same card names the same paper correctly everywhere else:

- the company card's Paper table — `compliance-table.tsx:40-47`,
  `if (doc.doc_type === "other_named") return doc.doc_label ?? "Other";`
- the firm's own `/paperwork` page — `paperwork-model.ts:110-115`, the identical branch.

**Failure, concretely.** Twin Cities Drywall's paperwork contact sends the asbestos abatement
permit the studio already holds an `other_named` row for (the door requires a `doc_label` for
that type — `paperwork-upload/core.ts:181-186`, and the DB CHECK
`studio_compliance_documents_doc_label_check` enforces it). The band reads:

```
1 document waiting for your check
Other, uploaded 15 Sep 2026 by Twin Cities Drywall.      [Confirm]  [Reject]
```

Confirm retires the paper on file and opens whatever gate it held; Reject files a refusal the
firm reads. Both are taken on a document the studio has not been told the name of — while the
table three lines below prints "Asbestos abatement permit".

Proved by construction (node, both branches side by side) rather than asserted: no case in
`packages/supabase/src/hooks/__tests__/people-crm-w4.test.ts` or
`apps/designer-portal/src/components/document/people/__tests__/inbound-queue-band.test.tsx`
passes `other_named` — `grep -rn "other_named"` over both files returns nothing.

**Fix:** give `inboundDocumentLine` `documentTypeLabel`'s branch, and add the `other_named`
case to both suites. Confidence: **high**.

### MAJOR-2 — the seat window band destroys focus when it opens, and its `aria-controls` names nothing

`apps/designer-portal/src/components/document/roster/seat-window-band.tsx:140-162`

Collapsed, the component returns *only* a trigger:

```tsx
if (!open) {
  return (
    <div …>
      <button type="button" data-edit-window={seatId} onClick={() => setOpen(true)}
              aria-expanded={false} aria-controls={bandId} …>
        {onSiteFrom || onSiteTo ? 'Change the window' : 'Set the window'}
      </button>
    </div>
  );
}
```

Nothing with `id={bandId}` is in the DOM while collapsed, so the IDREF is dangling. On press the
entire collapsed branch is replaced by the band — **the button that was pressed is unmounted**,
so focus falls to `document.body`. A keyboard user on a Call Sheet with thirty roster rows
presses "Set the window" and is returned to the top of the document. The same happens on save
(`save()`'s `setOpen(false)` at :128/:133 while focus sits on "Write the window").

This is the room's own stated rule, broken in a file the wave added, with two correct siblings
in the same folder:

- `roster-row.tsx:14` — "The unfold trigger carries `aria-expanded` AND `aria-controls`
  pointing at the panel's **real id** (SPEC §7 #5)" — implemented at `:741` + `:867`
  (`<div id={panelId} hidden={!expanded}>`, always rendered).
- `notice-log.tsx:82-93` — trigger always rendered with `aria-expanded={open}`, panel
  `<div id={panelId} hidden={!open}>` always rendered.
- The wave's own `paperwork-link-act.tsx:153-163` gets it right too.

**Fix:** the three-line pattern the siblings use — keep the trigger rendered with
`aria-expanded={open}`, and wrap the band in `<div id={bandId} hidden={!open}>`.
Confidence: **high**.

### MAJOR-3 — the homeowner's terminal money act removes itself on press: focus destroyed, nothing announced

`apps/client-portal/src/components/threshold/letterbox.tsx:145, 310-328`

```ts
const payHere = invoice !== null && balanceCents > 0 && !open;
```

```tsx
{payHere && (
  <ScoredAction actionKey="invoice_open_link" … variant="terminal"
    aria-controls="letterbox-letter"
    onClick={() => { setOpen(true); revealReturnAnchor(slot.current); }}>
    {`Pay ${formatCurrency(invoice.balanceCents)}`}
  </ScoredAction>
)}
```

`ScoredAction` with no `href` renders a `<button>` (`instruments/scored-action.tsx:210`). Pressing
it sets `open`, which makes `payHere` false, which unmounts the button under the caret. Focus
falls to `document.body`; `revealReturnAnchor` only calls `scrollIntoView`
(`src/lib/threshold/checkout-return.ts:219-226`) and there is no live region on this surface, so
nothing is announced. The act also carries `aria-controls` with **no** `aria-expanded`, unlike
its sibling two lines down (`letterbox.tsx:335-336`), so it never announced itself as a
disclosure either.

This is new in this round: before W4 r2 the act was `href={invoiceLinkPath(token)}`, a navigation,
so there was nothing to lose focus from. It is the same defect class the round's own
client-portal sheet was held to one round earlier (r2 MAJOR-5), on the money path rather than the
paper one, and the r2 test that covers the behaviour ("drops the act once the letter is open")
asserts only that the button is gone.

**Fix:** keep the act rendered (held, or relabelled once open), or move focus to the `Settlement`
heading and announce it, the way `paperwork-sheet.tsx:52-56,76` now does. Confidence: **high**.

### MAJOR-4 — carried forward and still open: the mint band's window is not tenant-scoped the way the RPC's is

`packages/supabase/src/hooks/use-paperwork-links.ts:125-147` +
`apps/designer-portal/src/components/document/people/company-card.tsx:291,405-409`

The face derives the window from `usePeopleSeats({ all: true })`, filtering only on
`seat.company_id === companyId` and `!seat.off_job_at`. `mint_paperwork_link` derives it with a
third predicate the face does not carry (00637:459-463):

```sql
AND public.project_tenant_org(pp.project_id) = v_org
```

and `people_directory_seats` admits rows the face cannot distinguish — measured from the live
view definition, its WHERE is

```sql
WHERE (is_active_studio_member(project_tenant_org(pp.project_id))
       OR pj.designer_id = auth.uid() OR pj.lead_designer_id = auth.uid()
       OR pj.created_by = auth.uid())
  AND (is_studio_comember(...) ...)
```

so a seat on a project with `studio_id IS NULL` (R-BD / R-BI's legacy population) is visible to
its designer of record and feeds `firmEngagementWindowEnd`, while `project_tenant_org` answers
NULL for it and the RPC's `max(d)` sees nothing. The band then prints "The door can end with this
firm's work here, <date>", pre-selects that radio, and the press meets
`paperwork_link_window_required` — the refusal whose own sentence is "This firm has no open
engagement here", directly contradicting the line above it.

This is r2 MAJOR-2's second leg. `w4-fix-log-r2.md` names it "**Named, not closed** … Owner: W7
preflight. Ruling asked of Fable." No such ruling stands in `rulings.md` §3, so by this round's
rules it is an open finding, recorded at the severity r2 gave it rather than downgraded by the
deferral. Confidence: **high** on the mechanism, **medium** on the residual population after W3's
`projects.studio_id` backfill.

---

## 3. MINOR (reported, never gating)

1. **`use-inbound-documents.ts:45`** — "All six tokens 00637 can raise are named here". There are
   eight `compliance_*` tokens and the map correctly names all eight; the sentence is stale from
   before r2's fix.
2. **Two refusal sentences misdirect the reader.** `use-paperwork-links.ts:64-65`
   ("Ask an owner or admin of the studio") and `use-touches.ts:345-346` ("This job's notices are
   not yours to write. Ask an owner or admin") both describe an owner/admin gate; 00637:450 and
   00635:352 gate on `is_active_studio_member`. `record_notice`'s refusal also fires when
   `project_tenant_org` is NULL (R-BI's studio-less jobs), where "not yours to write" is simply
   the wrong explanation and no owner can help.
3. **`paperwork-upload-form.tsx:223-227`** — the failure region is mounted *with* its content
   (`{state === 'error' && message && <p role="status">…}`). A live region inserted alongside its
   text is unreliably announced; the sheet's own region (`paperwork-sheet.tsx:76`) is always
   mounted, which is the pattern this file should copy. A refusal is also an alert rather than a
   status — `roster-row.tsx:300-310` records that exact ruling ("r7 MAJOR-4 — A REFUSAL IS AN
   ALERT, NOT A STATUS") for this programme.
4. **`paperwork-sheet.tsx:58,68`** — `setAnnouncement(receiptSentence)` writes the *same constant
   string* for every row, so a second upload in one visit mutates nothing in the live region and
   is not re-announced; the sentence also names no document. (The focus move to the receipt
   paragraph does convey the outcome, which keeps this minor.) `w4-fix-log-r2.md`'s MAJOR-5 test
   title "announces only the row that was sent" overstates what the region actually says.
5. **`use-invoices.ts:1392-1404`** — `useRegenerateInvoiceLink` now only `setQueryData`s and never
   invalidates, so the minted address lives in one cache entry. Any other invoice mutation still
   runs `invalidateInvoiceEffects`, which invalidates `['invoice-link', invoiceId]`
   (`use-invoices.ts:393`), and so does a remount past the five-minute staleTime — either nulls
   the freshly minted address out from under the Copy control. Worth a sentence on the face
   ("This address is shown once") the way the paperwork mint has one.
6. **UTC-day arithmetic on three date choices.** `thirtyDaysOut` and `firmEngagementWindowEnd`
   slice `toISOString()` (`use-paperwork-links.ts:103,135`) and the mint sends
   `${chosenDay}T23:59:59Z` (`paperwork-link-act.tsx:113`). A US-Central studio pressing after
   19:00 local reads a day one off the day it meant, and the door closes 18:59:59 local.
7. **`use-touches.ts:259-269`** — `touchKeys.list` sorts `subjectIds` but does not dedupe, while
   `useTouches` dedupes before querying (`:284`); two cache keys can name one result set.
8. **`packages/notifications/src/unsubscribe.ts:130-160`** — `applyChannelUnsubscribe` discards
   `type`: a one-click unsubscribe from a single notification type marks the address
   `unsubscribed` on every email-kind row sharing its value, which the send gate then reads for
   *all* mail including POs and RFQs. The returned outcome still names `type` as though the stop
   were scoped to it.
9. **`paperwork-link-act.tsx:86-88`** — `choice` is seeded once from `windowEnd`. Seats arrive
   asynchronously, so a firm that does have a window commonly renders the "Ends with the job"
   radio *unchecked* beside a pre-selected "Thirty days".
10. **`page.tsx:110-117`** — `studio_name` has a fallback ("the studio"); `company_name` has none,
    so a card with neither `company_name` nor `full_name` prints an empty eyebrow above the h1.
11. **The client type-check gate is RED at HEAD** — `.next/types/app/page.ts(37,29) TS2344`
    against `apps/client-portal/src/app/page.tsx:21`'s optional `props?`. Reproduced after a
    fresh `next build`, so it is live, not a stale artifact; `git merge-base --is-ancestor` puts
    the file's last change before this wave, so it is not W4's. `w4-paperwork-report.md` §6
    records the gate as "clean".
12. **Two report "owed" lists are now false.** `w4-paperwork-report.md` §7 still lists the company
    card's inbound-queue band and the mint/revoke acts as owed — "today a paperwork link can only
    be minted from SQL" — and `w4-studio-report.md` §7 still lists `/paperwork/[token]` as "still
    outstanding". All three shipped in this same wave.
13. **Two test counts are stale.** `w4-paperwork-report.md` §5 sums 21 + 8 + 12 + 9 = 50 jest
    cases across the four paperwork files; HEAD runs **53**. `w4-studio-report.md` §1 says the new
    vitest file holds 35; HEAD runs **48**.
14. **`studios/help-system/scripts/people-help-content.ts`** docblock still states the twelve
    concept surfaceKeys "are NOT promoted to named constants in
    `packages/help-system/src/surfaceKeys.ts`" and calls promotion "a follow-up". r1 MAJOR-5
    promoted all twelve, which `w4-help-report.md` §3 records and this review verified.
15. **`studios/help-system/scripts/seed-people-help.ts`** docblock names
    `SurfaceKeys.DesignerPortal.Document.{…,CallSheet.SiteAccess,CallSheet.BringForward}`; the
    constants are flat — `CallSheetSiteAccess` / `CallSheetBringForward`. It also says "five
    surfaces" where the content is authored against seventeen keys.
16. **`seat-window-band.tsx:103-138`** — `save()` writes a `record_notice` unconditionally, so a
    press that changed neither date files a durable record that the fact changed.
17. **`paperwork-sheet.tsx:110-130`** — an opened upload form has no way back; only a successful
    send collapses it. A firm that opens the wrong row is left with the form standing.
18. **Carried from r2, still open and still minor:** the `compliance-documents` storage read
    policy is org-scoped rather than (org, company) and still uses the
    `(storage.foldername(name))[1]::uuid` cast idiom (verified live from `pg_policy`); a refused
    `record_inbound_compliance_document` leaves the uploaded object orphaned in the bucket
    (`paperwork-upload/core.ts:243-249` returns without deleting); and that RPC still does not
    check `p_file_path` against the token's own `{org}/{company}/` prefix.

---

## 4. What this round did not cover

- No Playwright run: this is the code round, and the wave's own e2e (`paperwork-link.spec.ts`,
  `paperwork-inbound.spec.ts`, `threshold.spec.ts`) were run by the r2 fix wave. No server was
  started on 3000 or 3002, so the port rule was not exercised.
- No `supabase db reset`: the migration ledger replays to `00638`, numbering carries no
  duplicates and nothing in the reserved `00595–00620` band, and this round minted no migration,
  so a reset had nothing new to prove and the shared local stack was left as found.
- The local DB was left as found. Three probe writes were made and all three are gone: the two
  `studio_compliance_documents` probes ran inside `BEGIN … ROLLBACK`, and the one
  `paperwork_link_tokens` row minted against Northgate Electric with a known-hash token was
  deleted at the end of the round (`DELETE 1`, re-counted to 0).
