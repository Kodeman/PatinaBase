# W4 — surfaces + help · adversarial code review, round 12

Worktree: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`
Branch: `build/people-room-crm-2026-09-11` · HEAD `c4ca9b4df`
Reviewer context: fresh. Prior fix log read: `build/w4-fix-log-r11.md`. Prior review read: `build/w4-review-r11-code.md`.
Three surface reports read in full: `w4-paperwork-report.md`, `w4-studio-report.md`, `w4-help-report.md`.
Settled and out of scope: every ruling in `artifacts/people-room-crm-2026-09-11/rulings.md` §3 (R-A … R-CB).
No prod call of any kind: no `db push`, no `functions deploy`, no secret set, no `.env.local` created, no server started, no port taken on 3000 or 3002.

**Verdict: NOT clean — 0 blocking, 1 major, 29 minor.**

Every changed file under `apps/client-portal/src`, `apps/designer-portal/src`,
`packages/supabase/src/hooks`, `packages/help-system/src` and
`studios/help-system/scripts` was read in full against
`git diff 0249e1eff..HEAD` (77 files). Working tree is clean on every reviewed
path, so HEAD is what was read.

---

## 1. Prior-round re-check

| r11 finding | Then | Now | Evidence |
|---|---|---|---|
| **MAJOR-1** (data/edge) — the e2e spec poisoned the seeded studio | major | **FIXED** | `apps/client-portal/tests/paperwork-link.spec.ts:105` `mintedDoors`, `:149` `removeDoor`, `:209` `test.afterAll` with the hour-old sweep at `:227`. |
| **MAJOR-2** (data/edge) — the rate bucket was an existence oracle | major | **FIXED** | `00637_paperwork_upload_door.sql` — the `link:` lookup now carries `AND t.status = 'active' AND t.expires_at > now()`, and a well-formed token with no live link is keyed `'tok:' || encode(digest(p_token,'sha256'),'hex')`. `anon` is left only for a caller presenting no token. The function `COMMENT` records the ladder that exists. |
| **M-1** (code) — the seat window's consequence sentence claimed it re-dates doors | major | **FIXED** | `roster/seat-window-band.tsx:74-78` now reads "…dates the doors minted from here on. A door already open keeps the dates it was given — close it under Access grants if the window moved under it." (residue: the file's own docstring still carries the old claim — m-28.) |
| m-1 designer-portal unsubscribe ignores `scope` | minor | **OPEN** | `apps/designer-portal/src/app/preferences/unsubscribe/page.tsx:5-6` `PageProps` is still `{token, status, type}`; `:43-46` branches on `outcome.type` only. The client portal got the `scope` hop; the designer portal did not. |
| m-2 "from this studio" copy vs the org-less write | minor | **OPEN** | `packages/notifications/src/unsubscribe.ts:170-176` is still `.eq('value', channel.value).in('channel_kind',['email','ap_email']).in('status',['active','bounced'])` with no organization filter; `apps/client-portal/src/app/preferences/unsubscribe/page.tsx:172` still says "from this studio". Severity note in §5. |
| m-3 `touchKeys.list` sorts but does not dedupe | minor | **OPEN** | `use-touches.ts:352`; `useTouches` dedupes only its own local copy at `:373`. |
| m-4 mint `T23:59:59Z` cuts the named last day short | minor | **OPEN** | `paperwork-link-act.tsx:144`. `mint_paperwork_link` (00637:585) takes a caller-supplied `p_expires_at` verbatim, so the door dies 17:59:59 Central on the day the band named. |
| m-5 `PaperworkLinkAct` one-shot `choice` initializer | minor | **OPEN** | `paperwork-link-act.tsx:96-98`, no sync effect on `windowEnd`. |
| m-6 constant live-region string | minor | **OPEN** | `paperwork-sheet.tsx:72` `setAnnouncement(receiptSentence)` with `receiptSentence` invariant per sheet. |
| m-7 upload-form error paragraph mounts with content | minor | **OPEN** | `paperwork-upload-form.tsx:255-259`. |
| m-8 no bare `/paperwork` middleware leg | minor | **OPEN** | `middleware.ts:150` vs `/pay`'s two-leg test at `:142-143`. |
| m-9 PostHog redaction comment says "all six" over a seven-prefix list | minor | **OPEN** | `apps/client-portal/src/lib/analytics/posthog.ts:78-81`. |
| m-10 `people-help-content.ts` header contradicts the promoted keys | minor | **OPEN** | `studios/help-system/scripts/people-help-content.ts:42-53` still says they are "NOT promoted to named constants … this wave's scope named exactly three new registry keys", and calls twelve keys "The six". |
| m-11 `w4-help-report.md` §3 closing paragraph stale | minor | **OPEN** | §3 promotes the keys at the top, then closes "this wave's word/concept keys do not [register] … Promoting them later is additive and safe." |
| m-12 `client-portal type-check` RED on the branch | minor | **OPEN** | Re-run this round: EXIT=2, one generated-output error. Pre-existing — `git diff origin/main..HEAD -- apps/client-portal/src/app/page.tsx` is empty. §3. |
| m-13 door's raw refusals printed verbatim on the firm's page | minor | **OPEN** | `paperwork-upload-form.tsx:129-137`. |
| m-14 "Ask an owner or admin" on a member-level refusal | minor | **OPEN** | `use-paperwork-links.ts:64-65`, `use-inbound-documents.ts:78-80`; both RPCs gate on `is_active_studio_member` (00637:565). |
| m-15 all eighteen help documents are unreachable | minor | **OPEN** | `grep -rn 'peopleFirm\|callSheetSiteAccess\|callSheetBringForward' apps/designer-portal/src` outside `document-surface-keys.ts` → zero hits; `grep -rn useHelpContent` under `components/document/people` and `components/document/roster` → zero hits. Declared scope boundary owed to W6. |
| m-16 `word/paper` tooltip attributes the paper word to the firm alone | minor | **OPEN** | `people-help-content.json` — "the compliance paper behind this person's firm." R-BA folds the person's OWN documents in too. |
| m-17 `chips` tooltip speaks in changelog voice | minor | **OPEN** | `people-help-content.json` — "Six groups replace the old eleven roles." |
| m-18 `wayInFact` embeds a UTC-sliced date in a durable record | minor | **OPEN** | `site-access-card.tsx:72` `rosterShortDate(changedAt)`; `roster-derivation.ts:563-570` `dateParts` slices the leading 10 chars of a timestamptz. Confirmed still minor: nothing in the build reads `studio_touches.notice_of` back onto a face, and the card's own line (`site-access-card.tsx:702-703`) uses the same reckoning, so face and record agree with each other. |
| m-19 `useRevokePaperworkLink` exported and called by nothing | minor | **OPEN** | Only callers are seven jest mocks and `people-crm-w4.test.ts:101`. |
| m-20 the notice-log's result sentence is not announced | minor | **OPEN** | `notice-log.tsx:220-222` — `{note && <p …>}` with no `aria-live`, `role="status"` or `role="alert"`. |
| m-21 the firm is never told when its own door closes | minor | **OPEN** | No `expires_at` / `expiresAt` reference in `app/paperwork/[token]/page.tsx` or `paperwork-sheet.tsx`; `PaperworkContext.expires_at` is carried and never printed. |
| m-22 `DocumentAction`'s loading state uses native `disabled` | minor | **OPEN** | `document-action.tsx:309` `disabled={unavailable && !held}` with `heldMark` only when `isHeld`; `loading` with `held=false` natively disables. Pre-existing, house-wide. |
| m-23 the three surface reports' own numbers are stale | minor | **OPEN** | `w4-paperwork-report.md:156` still "Client type-check … **clean**" (actual EXIT=2); `:157` still "154 suites, 2523 tests … 76.84 / 72.71 / 76.56 / 79.18" (actual 157 / 2572 / 77.33 / 73.13 / 77.05 / 79.71); §5's per-file block still "95.23 … 99.37 / 92.5 / 96.55" (actual 95 / 100 / 100 / 100 and 97.94 / 91.75 / 97.14 / 98.78). |
| m-24 the paperwork window helpers derive "today" from a UTC slice | minor | **OPEN** | `use-paperwork-links.ts:103` and `:135`. R-CB's named grep is `.slice(0, 10)` on `*_at` fields, which these are not, so the ruling's sweep did not reach them. |
| m-25 `/paperwork/[token]` exports no route `metadata` | minor | **OPEN** | No `export const metadata` in the page; `/pay/used/page.tsx:5-9`, `/plans`, `/pay`, `/trade` and `/rfq` each set `robots` **and** `referrer: 'no-referrer'`. The noindex half is covered by `middleware.ts:187-188`; the referrer policy is not. |

**Two fixed of three majors, one fixed of the r11 code major. Twenty-five minors carried, all twenty-five still open.**

---

## 2. Blocking criteria — each one checked, none met

| Criterion | Result | Evidence |
|---|---|---|
| A token accepted without verification | **No** | `app/paperwork/[token]/page.tsx:39,81` format-gates on `/^[0-9a-f]{64}$/` before any round-trip; `:96` `paperwork_link_rate_limit_hit`, refusing on `limitError \|\| withinLimit === false`; `:112` `resolve_paperwork_link`, which re-tests the pattern, matches `token_hash = encode(digest(p_token,'sha256'),'hex')` and returns NULL unless `status='active' AND expires_at > now()`. The client never reads the token itself: the page holds the service client and the browser only POSTs the token to `paperwork-upload`, which re-verifies through `paperwork_link_storage_context` and again inside `record_inbound_compliance_document`. |
| A verified document overwritten | **No** | `record_inbound_compliance_document` inserts `inbound = true, verified_at NULL`; no update path touches a verified row. `retainedComplianceDocuments` (`use-studio-contacts.ts:1629-1633`) adds `!doc.rejected_at && !(doc.inbound && !doc.verified_at)` — it filters the held set without deleting anything, and `useInboundDocuments` reads the pending rows through a separate question. |
| Cross-tenant read/write | **No** | `paperwork_link_tokens`: `usePaperworkLinks` names `TOKEN_COLUMNS` (no `token_hash`) and filters by `company_id` under the table's `is_active_studio_member(organization_id)` SELECT policy. `useInboundDocuments` filters `holder_id` under the compliance table's own policy. `mint_paperwork_link` refuses a company card outside the caller's studio (00637:561-568, one refusal for "no such firm" and "not your studio"). `v_access_grants` branch 12 stamps `subject_type='company'`, `subject_id = plt.company_id`, which `FIRM_SCOPED_ACCESS_GRANT_TIERS` and `ACCESS_GRANT_REVOKE_ROUTES.paperwork_link.keySegment: 1` read. `record_notice` resolves the job's studio itself (R-BD). |
| RLS / grant / storage-policy hole | **No** | No migration minted or edited this round; no GRANT/REVOKE touched. `paperwork_link_rate_limit_hit` is `REVOKE ALL … FROM PUBLIC, anon, authenticated` + `GRANT … TO service_role` (00637:490-493). The reserved band 00595–00620 is untouched; the branch's highest migration is 00638. |
| Email sent to a dead/unsubscribed channel | **No** | No new send path in W4's surfaces. `record_notice` and `log_site_access_told` are records, not sends; the reject chase lands `awaiting_review` on the agent queue. |
| A forged unsubscribe crossing subjects | **No** | `applyUnsubscribeToken` verifies the signed token first; `applyChannelUnsubscribe` resolves the channel by the **id inside the token**, then keys the write on that row's own `value`, restricted to `channel_kind in ('email','ap_email')` and `status in ('active','bounced')`. A holder cannot name another address, cannot walk back a `dead` row and cannot reach an SMS channel. The new `scope` parameter is a redirect query value the landing page allow-lists to `"address" \| "account"` (`page.tsx:45-50`) — it changes copy only, never a write. |
| A `/pay` link broken by the backfill | **No** | `InvoiceLink.token` is `string \| null` end to end; `letterbox.tsx` no longer reads `useInvoiceLink` and opens `Settlement` in place behind `aria-expanded` / `aria-controls="letterbox-letter"` (the id exists at `:399`); `door-gate.tsx:284-287` falls back to `/?invoice=<id>` when `bundleOffer.payToken` is absent (R-BY's shape); `pay/return/[nonce]/route.ts` routes `spent` to `/pay/used` and rotates nothing (R-BT). No href can be `/pay/undefined`. |
| Reset failure | **No** | No migration minted or edited this round; `git status` is clean under `supabase/migrations`. |

---

## 3. Gates — pasted tails

All run from the worktree with `pnpm --dir` / `--filter`. Never a chained `cd`. No server started.

```
designer-portal type-check ........................ EXIT=0
supabase   (@patina/supabase) type-check .......... EXIT=0
help-system type-check ............................ EXIT=0
admin-portal build ................................ EXIT=0
client-portal type-check .......................... EXIT=2  (pre-existing, m-12)
client-portal jest --coverage ..................... EXIT=0  157 suites / 2572 tests
help seed dry run ................................. 18 written, 0 errored
help content validator (ad hoc) ................... 18 docs, 17 keys, 0 violations
registry parity (canonical + mirror) .............. 0 missing either way
```

**designer-portal type-check** (`pnpm --dir apps/designer-portal type-check`):

```
> @patina/designer-portal@0.1.0 type-check
> tsc --noEmit

EXIT=0
```

**supabase type-check** (`pnpm --filter @patina/supabase type-check`):

```
> @patina/supabase@0.0.1 type-check
> tsc --noEmit

EXIT=0
```

**help-system type-check** (`pnpm --dir packages/help-system type-check`):

```
> @patina/help-system@0.1.0 type-check
> tsc --noEmit

EXIT=0
```

**admin-portal build** (`pnpm --dir apps/admin-portal build`) — the shared-package
gate, since `packages/supabase` and `packages/help-system` both changed:

```
> @patina/admin-portal@0.1.0 build
> next build --webpack

▲ Next.js 16.2.10 (webpack)
⚠ The "middleware" file convention is deprecated. Please use "proxy" instead.
  Creating an optimized production build ...
EXIT=0
```

**client-portal type-check** (`pnpm --dir apps/client-portal type-check`) — EXIT 2, one error:

```
.next/types/app/page.ts(37,29): error TS2344: Type '{ searchParams?: Promise<Record<string, string | string[] | undefined>> | undefined; } | undefined'
  does not satisfy the constraint 'PageProps'.
  Type 'undefined' is not assignable to type 'PageProps'.
 ELIFECYCLE  Command failed with exit code 2.
EXIT=2
```

Generated output, not source. `git diff origin/main..HEAD -- apps/client-portal/src/app/page.tsx` is **empty** — the file is byte-identical to `origin/main`; the cause is its `HomePage(props?: {...})` optional parameter against Next 16's generated `PageProps`. Not W4's; but `w4-paperwork-report.md` §6 still asserts the opposite (m-23).

**client-portal jest --coverage** (`pnpm --dir apps/client-portal test:coverage`):

```
 src/app/paperwork/[token]      |      95 |      100 |     100 |     100 |
 src/components/paperwork       |   97.94 |    91.75 |   97.14 |   98.78 |
  paperwork-model.ts            |   97.77 |    90.16 |     100 |   98.63 | 201
  paperwork-sheet.tsx           |   97.36 |      100 |     100 |   97.05 | 32
  paperwork-upload-form.tsx     |    98.5 |    91.66 |   88.88 |     100 | 119,178
 src/lib/utils/client-ip.ts     |     100 |      100 |     100 |     100 |
All files                       |   77.33 |    73.13 |   77.05 |   79.71 |

Test Suites: 157 passed, 157 total
Tests:       2572 passed, 2572 total
Snapshots:   1 passed, 1 total
EXIT=0
```

Floor 70 / 60 / 70 / 70 — **held on all four with margin**. Every new
`apps/client-portal/src` file on the branch ships its own suite:
`app/paperwork/[token]/page.tsx`, `components/paperwork/paperwork-model.ts`,
`paperwork-sheet.tsx`, `paperwork-upload-form.tsx`, `app/pay/used/page.tsx` —
five new source files, five `__tests__` files — and the nine modified ones
(`middleware.ts`, `app-chrome.tsx`, `letterbox.tsx`, `door-gate.tsx`,
`posthog.ts`, `client-ip.ts`, `api/unsubscribe/route.ts`,
`preferences/unsubscribe/page.tsx`, `pay/return/[nonce]/route.ts`) each have
their suite updated or added.

**help seed dry run** (`node studios/help-system/scripts/run-people-help-seed.mjs`):

```
[W4-help] DRY RUN — seeding 18 people-room help docs…
  📝 fieldHelper designer-portal/document/people (_id=helpContent.designer-portal--document--people--intro)
  … 18 lines …
[W4-help] dry-run: 18 written, 0 errored
```

No `--commit`; nothing written to Sanity.

---

## 4. Help — registry parity, caps, determinism

Machine-checked against `studios/help-system/scripts/people-help-content.json`:

```
docs: 18
unique ids: 18
nondeterministic ids (drafts./uuid): []
surfaceKeys: 17
missing in packages/help-system/src/surfaceKeys.ts: []
missing in apps/designer-portal/src/lib/help-system/document-surface-keys.ts: []
regex-invalid (^[a-z0-9-]+(/[a-z0-9-]+)+$): []
duplicate (surfaceKey, contentType, persona) triples: []
em-dashes (U+2014): 0     en-dashes (U+2013): 0
cap / shape violations (tooltip+fieldHelper body ≤160, emptyState heading ≤50,
  description ≤300, helpArticle title+oneSentenceAnswer+body): []
```

Schema-word sweep over the whole JSON for `channels_forbidden`, `studio_verdict`,
`site_access_mode`, `holder_id`, `doc_type`, `compliance_state`, `subject_type`,
`party_kind`, `organization_id`, `token_hash`, `RLS`, `null`, `boolean`, `enum`,
`uuid`: **zero hits**. Every sentence reads in the room's own vocabulary.

Residue is copy (m-16, m-17), a stale header (m-10), a stale report paragraph
(m-11) and reachability (m-15) — none of which move the gate.

---

## 5. Findings

### MAJOR

**M-1 — the firm's paperwork rows open their form by deleting the act that opened it: no `aria-expanded`, no `aria-controls`, and focus falls to `document.body`.** *(fresh)* Confidence: **high** on the facts, **medium-high** on the severity call.

`apps/client-portal/src/components/paperwork/paperwork-sheet.tsx:141-164`:

```tsx
{isOpen ? (
  <PaperworkUploadForm … />
) : (
  <Button
    type="button"
    variant="ghost"
    size="sm"
    className="mt-2 min-h-[44px]"
    onClick={() => setOpened((prior) => ({ ...prior, [row.key]: true }))}
  >
    Add {row.title}
  </Button>
)}
```

Three things at once, on the one guest surface in this wave:

1. **The trigger is unmounted by its own press.** `isOpen` flips, the ternary
   swaps the `<Button>` out for the form, and the browser moves focus from the
   removed node to `document.body`. A keyboard or screen-reader user who
   presses "Add COI, general liability" is returned to the top of the document
   and has to traverse the header, the live region and every earlier row to
   reach the form she just asked for.
2. **It carries no `aria-expanded` and no `aria-controls`**, so nothing tells
   assistive technology that the control is a disclosure or that anything
   opened.
3. **Nothing is announced.** The sheet's one polite region
   (`paperwork-sheet.tsx:80-82`) is written only by `markReceived`, so the open
   transition is silent.

This is the program's own named defect class, ruled and fixed twice inside this
same wave and then reintroduced — or rather never fixed — on the firm's page:

- `roster/seat-window-band.tsx:151-162` (W4 r3 MAJOR-2) states the rule in the
  file: *"the trigger keeps its place with `aria-expanded`, and the panel is an
  always-present `<div id={panelId} hidden={!open}>`"*, and cites
  `roster-row.tsx:14` / SPEC §7 #5 as the room's rule.
- `threshold/letterbox.tsx:334-345` (W4 r3 MAJOR-3) took exactly this fix for
  the terminal money act: the act "keeps its place, says it is a disclosure
  (`aria-expanded`), moves the reader into the till it opened, and announces
  it — **the shape `paperwork-sheet.tsx` took for the same defect class one
  round earlier**". That parenthetical is about `markReceived` — the CLOSE
  transition. The OPEN transition was never given the same treatment.

The rows that carry an Add button are precisely the rows that are not already
open: `buildPaperworkRows` sets `openByDefault: state === 'refused'` for every
row built from a document and `true` only for an expected type with nothing on
file (`paperwork-model.ts:350, 371`). So a **lapsed** COI — the row this page
exists for — always presents the Add button, and always loses focus when
pressed.

Neither the jest suite nor the Playwright spec covers it: the eight sheet tests
click `Add …` by role and assert what renders, none asserts `aria-expanded` or
`document.activeElement`.

Not blocking: nothing is granted, nothing is overwritten and the act works with
a pointer. Major under the brief's "a11y contract broken" bar — the room states
the contract in its own source, and the guest-facing door is the one surface
where the reader has no account, no other route in, and no studio member beside
her.

*Fix (the shape the two siblings already ship):* keep the `<Button>` mounted,
give it `aria-expanded={isOpen}` and `aria-controls={formId}`, render the form
inside an always-present `<div id={formId} hidden={!isOpen}>`, and on open move
focus to the form's first control (or the form's own labelled group) and write
one sentence into the existing live region.

### MINOR

The twenty-five r11 minors above all remain open; their current evidence is in
§1 and is not restated. Four are fresh this round.

**m-26 — `w4-paperwork-report.md` is stale in two further places beyond m-23.** *(fresh)* Confidence: high.
§2's state table lists five states (`current`, `lapses soon`, `lapsed`, `not on
file`, `received`) over a model that now builds six, including the two R-BU and
W4 r7 M-4 added — `awaiting_check` ("{Doc type}, not yet checked.") and
`refused` ("{Doc type} was not accepted." plus the studio's reason)
(`paperwork-model.ts:162-178`). §7's "Owed, and not done" still lists **the
company card's inbound-queue band**, **the mint act** and **the revoke path** as
outside the scope and unbuilt — all three ship in
`w4-studio-report.md` §2 (`people/inbound-queue-band.tsx`,
`people/paperwork-link-act.tsx`, `use-access-grants.ts`'s twelfth-tier revoke
route). Report accuracy only; never holds the gate.

**m-27 — `w4-studio-report.md` §6 and §7 contradict `w4-paperwork-report.md`.** *(fresh)* Confidence: high.
§7 still says "`/paperwork/[token]` in the client portal (spec §3) — the firm's
own page. Named as W6 … and still outstanding"; the page shipped and is this
round's largest read. §6 still says "This machine's local Supabase stack runs no
edge runtime — there is no `supabase_edge_runtime_*` container"; the paperwork
report §6 records bringing it up with `supabase functions serve --no-verify-jwt`
and running the upload spec through the real function. Two reports, one machine,
two answers. Report accuracy only.

**m-28 — `seat-window-band.tsx`'s docstring still carries the claim its own constant just lost.** *(fresh)* Confidence: high.
`apps/designer-portal/src/components/document/roster/seat-window-band.tsx:9-14`:
"The window … **dates the field link the seat holds** (`create_field_link` reads
`max(on_site_to, warranty_until)`), and it dates the firm's paperwork door
(`mint_paperwork_link`). **Moving it moves all three**". That is r11 M-1's
sentence, uncorrected, sixty lines above the comment at `:65-73` that explains
why it is false and the constant at `:74-78` that now says so. A comment, so
minor by rule — but it is the first thing the next reader of this file meets.

**m-29 — `buildPaperworkRows` ranks and sorts on an unguarded `STATE_RANK` lookup.** *(fresh)* Confidence: medium.
`paperwork-model.ts:324` takes `doc.state ?? 'current'` from a row that reached
the page through an `as any` RPC client, so TypeScript's `PaperState` union is
not enforced at runtime. A value 00637 does not currently emit makes
`STATE_RANK[state]` `undefined`: the fold at `:328` then takes the replace
branch unconditionally, and the comparator at `:376`
(`STATE_RANK[a.state] - STATE_RANK[b.state]`) returns `NaN`, which leaves the
sort engine-defined rather than worst-paper-first. The page's contract — "rows
are ordered worst paper first, because what is owed is what the page is for" —
is the one thing that would silently stop holding. The four rows whose
`doc_type` is missing are already skipped at `:321`; the state is not.
*Fix:* fall back to a known rank (`STATE_RANK[state] ?? STATE_RANK.current`) or
drop the row the way a missing `doc_type` is dropped.

**Note on m-2 (severity), carried a fourth time.** The literal reading of the
major bar — "a reader disagreeing with the record" — fits m-2: `appliedCopy()`
(`apps/client-portal/src/app/preferences/unsubscribe/page.tsx:172`) says
"from this studio" over a write that stops the address at **every** studio
(`packages/notifications/src/unsubscribe.ts:170-176`, verified again this round:
no organization filter). r9, r10 and r11 all landed it at minor on the reasoning
that the write's breadth is deliberate and mirrors the ruled inbound-STOP
posture, and that the copy **understates** rather than overstates what happened.
I hold that severity rather than re-litigate it a fourth time, and record the
tension here so Fable can overrule it in one line.

---

## 6. Surface checks

### The paperwork door (`/paperwork/[token]`)

| Check | Result | Evidence |
|---|---|---|
| Registered as a guest route | **Pass** | `middleware.ts:144-150` (public set + the bearer `no-store` / `noindex` block at `:177-189`), `app-chrome.tsx:23-26` (`PUBLIC_PREFIXES`), `apps/client-portal/README.md:81-82` (route map). |
| No nav | **Pass** | The page renders `DeadLink()`, the rate-limit sheet, or `<main>` + `PaperworkSheet` and nothing else. `app-chrome.tsx:50-55` stamps `data-portal-shell="public"`, so the authenticated header tree never mounts. No `<nav>`, no footer, no link off the page at all. |
| No homeowner data | **Pass** | `resolve_paperwork_link` hands back `studio_name`, `company_name`, `expires_at` and one row per document type. `PaperworkContext` (`paperwork-model.ts:58-63`) is the whole surface of the read: no ids, no file paths, no uploader names, no project, no client, no address, no other firm. The dead sheet names no firm, no studio and no paper. |
| No caveat / schema words | **Pass** | `rowSentence`, `blocksSentence`, `reasonSentence` speak "Current / Lapses / Lapsed / Not on file / not yet checked / was not accepted". Gate words come from `COMPLIANCE_BLOCK_LABELS` — the same map the company card's Paper region reads, so the two faces cannot drift. No column name, no state token, no "if you do not" sentence. |
| Mobile-first | **Pass** | `max-w-lg`, `px-4 sm:px-6`, a `clamp(1.6rem, 6vw, 2.2rem)` title, one column of disclosure rows, no table, no fixed width; every field and both acts carry `min-h-[44px]`. |
| Keyboard-reachable | **FAIL (M-1)** | The open transition. Everything else holds: the submit uses `aria-disabled={state === 'sending'}` with an `if (state === 'sending') return;` guard rather than HTML `disabled`, so focus is never stolen mid-send; the expiry field is `aria-required` rather than `required`, so the browser's own bubble never pre-empts the page's sentence; the CLOSE transition moves focus to the receipt through `receiptRefs` and announces it. |
| Errors say what to do | **Partial** | The page's own refusals do ("Choose the file first.", "Give the date it expires.", "That did not go through. Try again.", "Wait a minute, then open the link again."). The door's refusals are printed verbatim (m-13). Both minor, both carried. |
| A test per new client-portal file, coverage holds | **Pass** | Five new source files, five suites; coverage 77.33 / 73.13 / 77.05 / 79.71 vs the 70/60/70/70 floor (§3). |
| Rate limit cannot be switched off by a header (R-CA) | **Pass** | `normalizeCallerIp` (`client-ip.ts:36-69`) strips `ip:port` and `[v6]:port`, validates v4 strictly and v6 by shape; `limitError \|\| withinLimit === false` refuses; `paperwork_link_rate_limit_hit` buckets by the link's own row id when the address is unreadable. |
| The limiter is not an existence oracle (spec acceptance 4) | **Pass** | 00637's ladder now carries the resolvers' own liveness predicate on the `link:` leg and a per-token `tok:<sha256>` bucket for every well-formed token with no live link — r11 MAJOR-2, fixed. |

### Designer surfaces

| Check | Result | Evidence |
|---|---|---|
| Two-step confirms | **Pass** | `inbound-queue-band.tsx` — Confirm and Reject each open an explicit second panel (`step === 'confirming' \| 'rejecting'`) carrying the consequence sentence before the act. `paperwork-link-act.tsx:194-291` — the mint band opens before "Open the door". `seat-window-band.tsx:163-260` — the panel opens before "Write the window". No modal anywhere; all three sit inside the existing card / sheet frames (DocSheet rule held). |
| PR-n gating and the ruled sentences | **Pass** | R-AD: `paperworkWindowSentence` names the day before the press, with `NO_ENGAGEMENT_SENTENCE` where there is none; three named options, no silent clock; the act is held with a visible reason while the typed day is blank. R-AF: `paperworkReplaceSentence` is printed before the press whenever a live door exists. R-AZ's four confirm refusals and both reject refusals are all named in `INBOUND_REFUSAL_SENTENCES`. |
| Invalidations | **Pass** | `useMintPaperworkLink` → `paperworkLinkKeys.forCompany` + `accessGrantKeys.all`. `useRevokeAccessGrant` → the grant keys + `partySmsKeys.all` + the literal `['paperwork-links']` (the cycle-free form). `invalidateInbound` → `inboundDocumentKeys.all` + `invalidateComplianceFanout(holderId)` (which reaches `complianceKeys.all`, `studioContactKeys.detail`, `peopleKeys.all`, `peopleSeatKeys.all`) + `complianceKeys.all`. `useRecordNotice` → `touchKeys.all`. `useUpdateProjectParty` (the window write) → `project-parties`, `project-roster`, `peopleKeys.all`, `peopleSeatKeys.all`, households. Checked for the one plausible gap: 00637 writes **no** `studio_touches` row, so the inbound acts owe no touch invalidation. |
| `aria-disabled` not `disabled` | **Pass, with the house-wide caveat** | Every gated act in the three new bands uses `held={cond} disabled={cond}`, which `DocumentAction` renders as `disabled={unavailable && !held}` → `false` plus `aria-disabled` via `heldMark` (`document-action.tsx:281,309-310`), each beside a visible held sentence. The `loading` path still natively disables (m-22) — pre-existing, in an unchanged file. |
| Document grammar | **Pass** | Consequence sentences on every act; `DocumentActionRow` / `DocumentAction` for every region; the ≤1-leader guard satisfied in each new band (`primary`+`tertiary`, or `danger`+`tertiary`); state words kept off facts — the authority check and the inbound decision print as plain uncoloured text (direction §3.8). |
| Consequence sentences are true | **Pass** | r11 M-1's sentence is corrected and now matches `create_field_link`'s mint-time derivation; the stale claim survives only in the docstring (m-28). |
| Hooks above early returns / hydration gate | **Pass** | `InboundQueueBand` calls `useInboundDocuments` before `if (rows.length === 0) return null`. `RosterRow` calls `useTouches({subjectIds: expanded && isSeat ? [seatId] : []})` unconditionally and narrows through the filter. `PaperworkLinkAct`, `SeatWindowBand`, `LastTouchLine` all declare their hooks before any conditional return. No pre-hydration branch in any new client component. |
| `@patina/supabase` only, canonical keys | **Pass** | Four hook modules, each exporting its own `*Keys` factory; every face reads through them; no ad-hoc `fetch` and no direct Supabase client in a designer component. |
| `@patina/types`, `ui/controls` + design-system | **Pass** | No redefined domain type; `partyKindOwesPaper` / `getFieldTradeLabel` come from `@patina/types`; acts come from `DocumentAction`. |
| Analytics via `people-events.ts` | **Pass** | `peopleEvents.grantMinted({tier:'paperwork_link', expiry_source})` and `peopleEvents.siteAccessChanged`; no direct `posthog.capture` in a new band. Confirm / reject emit nothing (S-9, declared). |
| Both portals' bearer redaction | **Pass** | `/paperwork` joined `HEX_BEARER_IN_URL` in both `apps/client-portal/src/lib/analytics/posthog.ts` and `apps/designer-portal/src/lib/analytics/posthog.ts` (the designer regex also gained `/trade`). |
| dist rebuilds | **Pass** | `packages/supabase` and `packages/help-system` both type-check clean and the admin-portal build — which consumes both dists — is EXIT=0. |

---

## 7. What I did not run, and why

- **Playwright**: not run. No `e2e/` or `tests/` spec changed since the r11 fix
  round beyond `paperwork-link.spec.ts`'s cleanup, which r11's fix log proved
  against the real schema server-free; this round's finding is a DOM-structure
  claim provable from the source, which it was. Nothing was started on 3000 or
  3002, so the port rule never engaged.
- **`supabase db reset` / SQL tests**: no migration was minted or edited this
  round (`git status` clean under `supabase/migrations`), so there is nothing
  for a replay to prove that r11's did not.
- **`supabase db push` / `functions deploy` / secrets**: forbidden by the brief
  and not attempted.

---

## 8. Verdict

**0 blocking. 1 major (M-1, fresh). 29 minor (25 carried, 4 fresh). Not clean.**

The machinery is sound and got better this round: the limiter no longer answers
"was this token ever minted?", the e2e spec returns the seeded studio exactly as
it found it, and the seat-window sentence now says what the database does. No
token is accepted unverified, no verified document can be overwritten, every new
table is tenant-scoped behind a member predicate, both portals redact the new
bearer prefix, the help registries are in parity with zero cap violations,
deterministic ids and no em-dashes, every new client-portal file ships with its
test and the coverage floor holds with margin.

What stops it being clean is the one surface with no account behind it. On the
firm's own page, the act that opens the form for a lapsed certificate deletes
itself when pressed, tells assistive technology nothing about what it is, and
drops the reader to the top of the document in silence — the same defect the
room named in its own source and fixed twice this wave, on the two surfaces a
studio member uses.
