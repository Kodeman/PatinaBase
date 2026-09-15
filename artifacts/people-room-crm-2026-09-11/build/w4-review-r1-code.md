# W4 — adversarial code review of the surfaces + help, round 1

Reviewer context: fresh, not the implementer. Branch `build/people-room-crm-2026-09-11`,
worktree `.codex/worktrees/agent-people-build`. Read in full: `w4-paperwork-report.md`,
`w4-studio-report.md`, `w4-help-report.md`, and every changed/new file under
`apps/client-portal/src`, `apps/designer-portal/src`, `packages/supabase/src/hooks`,
`packages/help-system/src`, `studios/help-system/scripts`. `rulings.md` §3 treated as
settled and not re-litigated.

**Verdict: NOT clean — 0 blocking, 6 major, 16 minor.**

---

## 1. Gates I ran myself

| Gate | Command | Result |
|---|---|---|
| Supabase type-check | `pnpm --dir packages/supabase type-check` | **clean** (`tsc --noEmit`, exit 0) |
| help-system type-check | `pnpm --dir packages/help-system type-check` | **clean** (exit 0) |
| Designer type-check | `pnpm --dir apps/designer-portal type-check` | **clean** (exit 0) |
| Client type-check | `pnpm --dir apps/client-portal type-check` | **clean** (exit 0) |
| admin-portal build (shared `@patina/supabase` edit) | `pnpm build` in `apps/admin-portal`, local env inline | **green**, exit 0 |
| Client jest + coverage | `npx jest --coverage` in `apps/client-portal` | **154 suites / 2523 tests pass**, exit 0 |
| Designer jest, every touched suite (13 files) | `npx jest <13 paths>` | **13 suites / 195 tests pass** |
| Supabase vitest, both CRM hook suites | `npx vitest run people-crm-w4 people-crm-foundation` | **2 files / 70 tests pass** |
| Help dry run | `node studios/help-system/scripts/run-people-help-seed.mjs` | **18 written (dry), 0 errored** — reproduces the report verbatim |
| Help content validator (mine) | node: dup `_id`, dup `(surfaceKey, contentType, persona)`, char caps | **0 dup ids, 0 dup triples, 0 cap violations** |

Client-portal coverage, pasted from my run:

```
All files                                    |   76.84 |    72.71 |   76.56 |   79.18 |
 src/app/paperwork/[token]                   |   95.23 |      100 |     100 |     100 |
 src/components/paperwork                    |   99.37 |     92.5 |   96.55 |     100 |
  paperwork-model.ts                         |     100 |    91.66 |     100 |     100 | 193-208,212,223
  paperwork-sheet.tsx                        |     100 |      100 |     100 |     100 |
  paperwork-upload-form.tsx                  |   98.48 |    91.66 |   88.88 |     100 | 102,146
 src/lib/utils/client-ip.ts                  |     100 |      100 |     100 |     100 |

Test Suites: 154 passed, 154 total
Tests:       2523 passed, 2523 total
```

Floor 70/60/70/70 holds at 76.84 / 72.71 / 76.56 / 79.18. Every one of the four new
client-portal files ships with its own `__tests__` file, and each of the four new
designer components does too. **No coverage finding.**

No migration was minted by these three waves (`git status` shows nothing under
`supabase/migrations`), so no reset was owed and none was run. No prod anything:
no `db push`, no `functions deploy`, no secrets. Playwright was not re-run (the
report's three client specs and the one designer spec were read line by line:
chromium-pinned — the client config declares chromium as its only project, the
designer spec `test.skip`s every other browser — no `waitForTimeout`, `expect.poll`
used for the DB read).

---

## 2. Findings

### MAJOR-1 — the firm is told its studio's own paperwork "was received and will be confirmed" (confidence: HIGH, proven against the seeded DB)

`resolve_paperwork_link` computes `awaiting_check` as `verified_at IS NULL AND
rejected_at IS NULL` (00637:517) — with no `inbound` leg. The studio's own
"Record a document" act (`useRecordComplianceDocument`,
`packages/supabase/src/hooks/use-studio-contacts.ts:1760-1779`) inserts
`source: 'studio'`, `inbound: false` and **never sets `verified_at`** — only
`useConfirmComplianceDocument` does. So every paper the studio typed itself and
never separately stamped is `awaiting_check = true`, and
`apps/client-portal/src/components/paperwork/paperwork-sheet.tsx:37` prints

> Received. Local Dev Studio will confirm it.

beside it, on the firm's own face, about paper the firm never sent.

Proven, not inferred. On the local dev seed five company cards hold exactly such a
row, and the RPC says so (fixture token inserted inside a transaction, rolled back;
no DB change):

```
psql ... -c "select doc_type, source, inbound, (verified_at is null and rejected_at is null) awaiting
             from studio_compliance_documents d join studio_contacts sc on sc.id=d.holder_id ..."
 w9 | studio | f | t | company | Waterline Supply
 w9 | studio | f | t | company | Lumen & Co.
 w9 | studio | f | t | company | Kestrel Staging
 w9 | studio | f | t | company | Jonah Feld Photography
 w9 | studio | f | t | company | Granite North

BEGIN; insert paperwork_link_tokens(...sha256(repeat('a',64))...);
SELECT jsonb_pretty(resolve_paperwork_link(repeat('a',64), false));
 {"documents":[{"state":"current","blocks":["payment"],"doc_type":"w9",
                "doc_label":null,"expires_on":null,"awaiting_check":true}],
  "studio_name":"Local Dev Studio","company_name":"Waterline Supply"}
ROLLBACK;
```

A reader disagreeing with the record, on the one surface in this program that a
party outside the studio reads.

**Fix:** `awaiting_check` is `doc.inbound AND doc.verified_at IS NULL AND
doc.rejected_at IS NULL` (00637), or the page's model takes an `inbound` flag the
RPC starts returning and ANDs it into `awaitingCheck`
(`paperwork-model.ts:buildPaperworkRows`). One line either way; the client test
`paperwork-sheet.test.tsx` case "the receipt sentence from the record" pins the
current behaviour and must move with it.

### MAJOR-2 — an unchecked upload moves the firm's paper word before anyone opens it (confidence: HIGH; raised by the wave itself, confirmed here)

`w4-studio-report.md` §4 raises this and does not fix it. Confirmed in the code:
`compliance_state` (00623) counts every non-superseded row with no reference to
`verified_at`, and `record_inbound_compliance_document` (00637:606-618) inserts
`verified_by NULL, verified_at NULL, superseded_by NULL`. On a firm holding no
paper of that type, the word goes `not_on_file → current` the instant the trade
uploads — while the queue band on the same card says the document is waiting for a
check, and the Paper table prints it as held paper. It reaches the Directory row,
the seat line, every roster row and the company card through
`identity_paper_state` / `retainedComplianceDocuments`.

The firm's own page says it too: the uploaded row comes back with
`state = 'current'` (empty `blocks` short-circuits the CASE) beside "Received…".

**Fix** is the reducer, not the portal: `compliance_state` and
`identity_paper_state` excluding `inbound = true AND verified_at IS NULL`, with
`retainedComplianceDocuments` following. That is a migration and belongs to the
data wave. Owed before ship, as the wave says.

### MAJOR-3 — closing the paperwork door from the Access grants list leaves the mint band claiming it is still open (confidence: HIGH)

`packages/supabase/src/hooks/use-access-grants.ts` `useRevokeAccessGrant.onSuccess`
invalidates `accessGrantKeys.all`, `people-directory`, `people-directory-seats`,
`project-roster` and `partySmsKeys.all` — **not** `paperworkLinkKeys`. The mint
happens the other way round correctly (`useMintPaperworkLink` invalidates
`paperworkLinkKeys.forCompany` *and* `accessGrantKeys.all`), so the gap is
one-sided.

Both readers are on the same mounted card: `company-card.tsx:824` renders
`ReachAccess` with `grantSubjectIds = [card.id]` and the twelfth tier's
`subject_id` **is** `company_id` (00637:1011-1023), and `company-card.tsx:928`
renders `PaperworkLinkAct`, whose `live` check reads `usePaperworkLinks(companyId)`.
Revoke the paperwork link in the grants list, press "Mint a paperwork link" in the
Paper row, and the band still prints

> Twin Cities Drywall already holds a live paperwork link. Opening a new one closes it.

about a door that is shut.

**Fix:** add `void queryClient.invalidateQueries({ queryKey: ['paperwork-links'] })`
to that `onSuccess`. Use the literal, not an import — `use-paperwork-links.ts`
already imports `accessGrantKeys` from `use-access-grants.ts`, so importing back
makes a cycle.

### MAJOR-4 — a ruling id is printed on the studio's face (confidence: HIGH)

`apps/designer-portal/src/components/document/people/paperwork-link-act.tsx:257`:

```
Name the day it closes — R-AD leaves no clock to fall back on.
```

This is the held-reason sentence beside "Open the door", so a studio member who
opens the band with "a day I name" selected reads it immediately. A grep of every
`.tsx` under `apps/designer-portal/src` finds this as the **only** rendered string
in the whole portal carrying a ruling id; every other `R-x` hit is a comment. The
Document grammar does not put the programme's own bookkeeping on the face.

**Fix:** "Name the day it closes. There is no clock to fall back on."
`paperwork-link-act.test.tsx` asserts the current string and moves with it.

### MAJOR-5 — twelve of the seventeen help surfaceKeys are in neither registry (confidence: HIGH)

The round's named check is "every surface key exists in `surfaceKeys.ts` AND the
designer mirror". Measured:

```
keys: 17 unregistered: 12
   designer-portal/document/people/word/reach          | registry=false | mirror=false
   designer-portal/document/people/word/consent        | registry=false | mirror=false
   designer-portal/document/people/word/paper          | registry=false | mirror=false
   designer-portal/document/people/contact-rule        | registry=false | mirror=false
   designer-portal/document/people/lens                | registry=false | mirror=false
   designer-portal/document/people/chips               | registry=false | mirror=false
   designer-portal/document/people/person/consent      | registry=false | mirror=false
   designer-portal/document/people/person/access-grant | registry=false | mirror=false
   designer-portal/document/people/person/authority    | registry=false | mirror=false
   designer-portal/document/people/firm/designations   | registry=false | mirror=false
   designer-portal/document/people/firm/paper          | registry=false | mirror=false
   designer-portal/document/call-sheet/site-access/told | registry=false | mirror=false
```

`w4-help-report.md` §3 names this as a deliberate scope boundary, and the
`surface-key-parity.test.ts` gate (6/6) only checks registry-vs-mirror agreement,
never content-vs-registry — so nothing in CI would ever notice. The Sanity schema's
own field description says `surfaceKey` "Must match a key from
@patina/help-system/surfaceKeys" (`studios/help-system/schemas/helpContent.ts:25`),
so these twelve documents are seeded against keys the system says are not keys.

Related and part of the same fact: **no component calls `useHelpContent()` for any
of the 18 surfaces**, so every doc this wave authored is unreachable today. The
wave names that too. It is 18 documents of writing with no door onto them.

**Fix:** promote the twelve to `surfaceKeys.ts` + the mirror (additive; no `_id`
changes, no reseed), and either wire the five room-level keys or record explicitly
that the wiring is a named follow-up with an owner.

### MAJOR-6 — the help copy is written with em-dashes, against the round's check (confidence: HIGH on the fact, MEDIUM that it should hold the gate)

26 em-dashes across the 18 documents — 22 distinct strings, reaching almost every
tooltip body, the emptyState description, the helpArticle's one-sentence answer and
all six of its body blocks. Sample:

```
people--word--reach   .tooltipContent.body:  "Account, Field link, or On paper — the strongest way to reach…"
people--chips         .tooltipContent.body:  "…Crew opens to trade — electrical, plumbing, cabin…"
people--person--editing-details .helpArticleContent.oneSentenceAnswer: "Open their card and choose Edit — people with…"
call-sheet--site-access--told  .tooltipContent.body: "Every time the way in changes — a new lockbox version, a different key holder — this logs…"
```

Precedent, for calibration: `decisions-help-content.json` carries 2 and
`people-editing-details-help-content.json` carries 3. This file carries 26. Nothing
has been committed to Sanity (`--commit` never run), so the sweep is free right now
and expensive after.

**Fix:** a copy pass replacing each with a full stop, a colon, or a comma pair.
Re-run the caps validator afterwards — several of these bodies are close to the 160
cap and a rewrite can cross it.

---

## 3. Minor findings (reported, never hold the gate)

**m1 — `other_named` paper loses its name in the studio's queue band.**
`use-inbound-documents.ts:82` resolves the label as
`COMPLIANCE_DOC_TYPE_LABELS[doc_type] ?? doc_label ?? doc_type`, and the map has
`other_named: 'Other'`, so the `?? doc_label` arm is unreachable. A firm that sends
its asbestos permit shows in the band as "Other, uploaded 12 Sep 2026 by …" while
the firm's own page and the card's Paper table both name it. `documentTitle` in the
client model gets this right; the hook should match it.

**m2 — the mint band's two dates disagree by a day on the "Ends with the job" branch.**
`mint_paperwork_link` (00637:~370) sets `expires_at = window_end + interval '1 day'`.
`paperworkWindowSentence` prints `windowEnd` itself ("Ends with the job —
21 November 2026") and `paperworkMintedSentence` prints
`minted.expires_at.slice(0,10)` ("…can send their paper here until 22 November
2026"). Both describe the same door. The `thirty` and `named` branches send
`T23:59:59Z` and read back the same day, so only this branch slips.

**m3 — a named day closes at 23:59:59 UTC.** `paperwork-link-act.tsx:110` builds
`${chosenDay}T23:59:59Z`. A studio in US Central that names 15 October watches the
door shut at 18:59 local on the 15th, three hours before the day the face promised.

**m4 — `paperwork_link_not_authorized` describes a rule the database does not hold.**
`use-paperwork-links.ts` answers it with "Ask an owner or admin of the studio", but
`mint_paperwork_link`'s gate is `is_active_studio_member(v_org)` — any active member
may mint. The same sentence is reused for the RLS fallback.

**m5 — `useRecordNotice` throws raw.** Its `mutationFn` rethrows the PostgREST error
unwrapped, so every caller must remember `asNoticeError`. Both current callers do
(`notice-log.tsx`, `seat-window-band.tsx`); the sibling hooks in this same wave
(`useMintPaperworkLink`, `useConfirmInboundDocument`, `useRejectInboundDocument`)
all wrap inside the `mutationFn`. A third caller that forgets prints
`notice_what_required` on the face.

**m6 — `touchDay` reads the UTC date out of a timestamptz.** `use-touches.ts:150`
regexes `^(\d{4})-(\d{2})-(\d{2})` off `occurred_at` / `created_at`. A touch made
at 19:30 US Central prints tomorrow's date on the person card, the company card,
the roster row and the inbound queue band. The room's other dates come off
date-only columns, which is why this is new here.

**m7 — the paperwork page's refusal is a status, not an alert.**
`paperwork-upload-form.tsx:236` renders the refusal in `role="status"`. Every
refusal on this program's designer faces, and R-BS's own wording, is `role="alert"`.
It is also not tied to the form control by `aria-describedby`, and focus is not
moved, so on a long form the sentence can land off-screen.

**m8 — `SeatWindowBand`'s disclosure contract is broken in three ways.** The
collapsed trigger carries `aria-controls={bandId}` pointing at an id that does not
exist while collapsed; `aria-expanded` is the literal `false` and never becomes
true because opening **unmounts the trigger** rather than toggling it; and because
the focused element is removed from the DOM, focus falls to `body` on both open and
close. The program's `restoreFocusRef` exists for exactly this.

**m9 — `touchKeys.list` does not dedupe.** The key filters and sorts `subjectIds`
but `useTouches`'s `queryFn` also de-duplicates them, so two callers asking the same
effective question with a repeated id keep two cache entries and two reads.

**m10 — report accuracy, `w4-studio-report.md` §4 overstates its own finding.**
"everything gated on `blocks` — site access, payment, draw — reads the gate as
satisfied" does not follow. `record_inbound_compliance_document` inherits `blocks`
only when a prior non-rejected row of that type exists (00637:596-602), and that
row stays un-superseded until Confirm, so its own gating lapse still reaches
`compliance_state` and the word stays `lapsed`. The verified harm is the
`not_on_file → current` transition the wave measured, which is MAJOR-2 and quite
bad enough on its own.

**m11 — report accuracy, `w4-studio-report.md` §7** lists "`/paperwork/[token]` in
the client portal (spec §3) — the firm's own page … still outstanding". It shipped
in the same wave (`w4-paperwork-report.md` §1). The two reports disagree about the
state of the program.

**m12 — comment accuracy, `studios/help-system/scripts/seed-people-help.ts`** names
the new constants as `SurfaceKeys.DesignerPortal.Document.CallSheet.SiteAccess` /
`CallSheet.BringForward`; they are flat: `CallSheetSiteAccess` /
`CallSheetBringForward`. The same header counts "2× fieldHelper / 6× tooltip /
1× emptyState → designer-portal/document/people"; the file holds 1 fieldHelper,
1 emptyState and 6 tooltips there (measured: fieldHelper 4, emptyState 1,
tooltip 12, helpArticle 1 across all surfaces).

**m13 — comment accuracy, `people-help-content.ts`** header says "The six
word/concept tooltip surfaceKeys" and then enumerates twelve.

**m14 — the mint band renders inside an action row (confidence: MEDIUM, visual).**
`company-card.tsx` puts `<PaperworkLinkAct>` inside the Paper region's
`<DocumentActionRow>`, whose frame is `flex flex-wrap items-center gap-2`
(`document-action.tsx:408`). The whole opened band — legend, three radio rows, a
date field, a nested action row — plus the minted address (`break-all font-mono`)
and the error line therefore lay out as flex items beside "Record a document" and
"Chase the renewal". Worth a QA look at 1440 and 390; the alternative is to render
only the act inside the row and hoist the band beneath it.

**m15 — no analytics on the seat-window act.** The wave names the confirm/reject
gap (S-9) and the paperwork page's gap (P-8), but not this one: `SeatWindowBand`
writes the engagement window and a notice and emits nothing, while the sibling
notice path in `notice-log.tsx` keeps `peopleEvents.siteAccessChanged`.

**m16 — two "editing details" articles will coexist in Sanity after the seed.** The
pre-CRM `helpContent.designer-portal--document--people--editing-details` stays at
surfaceKey `designer-portal/document/people`; the rewritten one lands at
`.../people/person` under a new `_id` (verified: no `_id` collision with either
existing content file). The wave names retiring it as a follow-up; it has no owner
yet.

---

## 4. What I checked and found sound

Recorded so a later round does not re-walk it.

- **The token is never accepted without verification.** `resolve_paperwork_link`
  hashes and re-checks status and expiry server-side and dies into one NULL for
  malformed / unknown / revoked / expired; `record_inbound_compliance_document`
  re-derives the holder from the token row, never from the body; the page's
  64-hex gate precedes any round-trip; `mint_paperwork_link` refuses a
  service-role caller with no `auth.uid()`.
- **No cross-tenant read or write.** `paperwork_link_tokens`,
  `paperwork_link_rate_limits` and `studio_touches` are all
  `is_active_studio_member(organization_id)` SELECT-only with every write behind a
  definer RPC; `assert_paperwork_token_company` pins company kind and org;
  `useTouches` reads under that RLS; `usePaperworkLinks` names its columns so
  `token_hash` cannot be selected.
- **No verified document is overwritten.** The insert path is always an INSERT
  (00637:605), and supersession is the confirm's act with R-AZ's two guards
  (`compliance_confirm_needs_a_live_date`, `compliance_confirm_drops_a_gate`), both
  of which reach the face as sentences through `asInboundDocumentError`.
- **`/paperwork/[token]` is not a homeowner surface.** `/paperwork` joins
  `PUBLIC_PREFIXES` in `app-chrome.tsx` (so the guest page renders
  `data-portal-shell="public"`, no nav), `isPaperworkPage` joins both the
  `no-store`/`noindex` block and the public set in `middleware.ts`, and the README
  route map names it. The middleware test asserts no sign-in redirect and that no
  response header carries the token; the e2e asserts zero `role="navigation"`.
- **No caveat and no schema word on the firm's face.** Every sentence is built in
  `paperwork-model.ts` from the spec §3 copy table; the gates print through
  `COMPLIANCE_BLOCK_LABELS`, the same map the company card reads; the e2e greps for
  `/will be removed|suspended|terminated/` and for a uuid shape and finds none.
- **`aria-disabled`, never `disabled`.** Every held act in the wave passes
  `held` *and* `disabled` together, which is exactly the `DocumentAction` contract
  (`disabled={unavailable && !held}` plus an explicit `aria-disabled`), and the
  client form uses bare `aria-disabled` with an early return in the handler.
- **Two-step confirms everywhere.** Confirm and Reject, the mint, and the window
  write each open a band carrying the consequence sentence before the act; the
  reject's reason is required and held with a visible sentence.
- **PR-n is not in this wave's path.** PR-n governs who may set an authority grant;
  nothing in W4's surfaces opens or moves one.
- **The `state` reducer on the firm's page matches the studio's.**
  `resolve_paperwork_link`'s "a date with no gate is still current" is
  `compliance_state`'s own doctrine (CS2 §4, 00623:32 and the `cardinality(blocks) > 0`
  filters), not a divergence — checked because it looked like one.
- **`firmEngagementWindowEnd` reads the same population the RPC derives from**
  (`usePeopleSeats({all:true})` over `people_directory_seats`, filtered to the
  firm's open seats), so the pre-press sentence is one reckoning with the write —
  apart from the one-day slip in m2.
- **Help content validates.** 18 docs, no duplicate `_id`, no duplicate
  `(surfaceKey, contentType, persona)` triple, every key matches the schema regex,
  every body within its cap, every `_id` deterministic from its surfaceKey, and the
  dry run reproduces the report's output exactly. Nothing was written to Sanity.
