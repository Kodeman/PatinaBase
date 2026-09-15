# W4 (P3) — studio: the paperwork door on the card, touches on the histories, notices on the window

Branch `build/people-room-crm-2026-09-11`, worktree `.codex/worktrees/agent-people-build`.
Local only: no `db push`, no `functions deploy`, no secrets, **no migration** (W4's data and
edge wave already minted 00635–00637; nothing here needed a new one).

The designer-portal half of direction §8 P3, on top of `w4-data-edge-report.md`'s four objects.

| # | Ask | Where it lives |
|---|---|---|
| a | The company card's Paper region gains the inbound queue band, confirm/reject, and "Mint a paperwork link" with R-AD's end-date sentence | `people/inbound-queue-band.tsx`, `people/paperwork-link-act.tsx`, `people/company-card.tsx` |
| b | Person and company History read `studio_touches` — last touch, channel, decision class, authority check, as plain text | `people/touch-line.tsx`, `people/views/person-profile.tsx`, `people/company-card.tsx` |
| c | "Log who was told" and the seat window edit call `record_notice` (CRM-23) | `roster/notice-log.tsx`, `roster/site-access-card.tsx`, `roster/seat-window-band.tsx` |
| d | The roster row unfold shows the last inbound decision's authority check (CRM-22) | `roster/roster-row.tsx` |

---

## 1. Files

**New hooks** (`packages/supabase/src/hooks/`):

| File | What |
|---|---|
| `use-touches.ts` | `StudioTouch`, `useTouches`, `useLastTouch`, `useRecordNotice`, `asNoticeError`, `touchKeys`; the vocabulary (`TOUCH_CHANNEL_PHRASES`, `TOUCH_DECISION_CLASS_LABELS`, `TOUCH_AUTHORITY_SENTENCES`) and the three pure reducers `touchSentence` / `lastInboundDecision` / `inboundDecisionSentence` |
| `use-paperwork-links.ts` | `usePaperworkLinks`, `useMintPaperworkLink`, `useRevokePaperworkLink`, `asPaperworkLinkError`, `paperworkLinkUrl`, `thirtyDaysOut`, `firmEngagementWindowEnd` |
| `use-inbound-documents.ts` | `useInboundDocuments`, `useConfirmInboundDocument`, `useRejectInboundDocument`, `asInboundDocumentError`, `inboundQueueHeading`, `inboundDocumentLine` |

**Changed hooks**: `use-access-grants.ts` (the twelfth tier `paperwork_link`, its word, what it
opens, and the revoke route onto `revoke_paperwork_link`); `use-studio-contacts.ts`
(`StudioComplianceDocument` gains `rejected_by` / `rejected_at` / `rejection_reason`;
`invalidateComplianceFanout` exported so the confirm reaches every reader of the paper word);
`use-coordination.ts` (`UpdateProjectPartyPatch` gains `onSiteFrom` / `onSiteTo`); `index.ts`.

**New components**: `people/inbound-queue-band.tsx`, `people/paperwork-link-act.tsx`,
`people/touch-line.tsx`, `roster/seat-window-band.tsx`.

**Changed components**: `people/company-card.tsx`, `people/views/person-profile.tsx`,
`roster/roster-row.tsx`, `roster/notice-log.tsx`, `roster/site-access-card.tsx`.

**Tests**: one new vitest file (`__tests__/people-crm-w4.test.ts`, 35), four new jest files
(inbound queue band 6, paperwork mint act 8, touch line 3, seat window band 7), new cases in
five existing jest files, one new Playwright spec (`e2e/people/paperwork-inbound.spec.ts`).
Seven existing jest files gained W4 entries in their `@patina/supabase` mocks — those mocks
enumerate every export the component imports, so a new hook is a hard break in each.

---

## 2. What the faces do now

**The Paper region (a).** Above everything in the region — including the `owesPaper` branch —
stands the inbound queue band, printed only while paper is actually waiting. Spec §6's header
("N documents waiting for your check") and its per-row line ("COI, general liability, uploaded
12 Sep 2026 by Northgate Electric."), then Confirm and Reject.

Both acts are two-step inline confirms, never a modal. Confirm states what it costs before it
is taken — the certificate it replaces is retired, kept and readable — and R-AZ's two refusals
(an undated or lapsed successor; a successor that drops a gate) reach the face as sentences
rather than the bare tokens 00637 raises. Reject's reason is REQUIRED and the act is held with
`aria-disabled` and a visible sentence, never `disabled`.

The band sits **outside** the `owesPaper` branch on purpose. R-A / C13 keeps the paper WORD off
a lender or an authority; a document that actually arrived through a door the studio itself
opened is a different fact, and hiding it would be the one way to lose paper in this room.

**Mint a paperwork link (a, R-AD).** In the Paper act row beside Record a document and Chase the
renewal, so it never appears on a card that owes no paper. The band it opens says the date out
loud before the press: where the firm is working, "The door can end with this firm's work here,
21 November 2026."; where it is not, "This firm has no open engagement here, so the day the door
closes is yours to choose." Three named options — the firm's window (offered only when there is
one), thirty days as a **day**, or a day the studio types — and the act is held, with its reason,
while the typed day is blank. R-AF's replacement is said before the press too ("Twin Cities
Drywall already holds a live paperwork link. Opening a new one closes it.").

The address prints once with "This address is shown once. {firm} can send their paper here until
{date}." and a Copy act. `mint_paperwork_link`'s `paperwork_link_window_required` reads as a
sentence naming both choices.

The door's **revoke** needed no new surface: `v_access_grants`' twelfth branch keys the row on
`company_id`, which is the company card's own id, so the firm's Access grants list already
carries it — it needed the tier's word and its revoke route, which is what `use-access-grants.ts`
gained. The reason stays optional there, as 00637's RPC allows.

**The histories (b).** `LastTouchLine` reads `studio_touches` and prints one plain sentence:
"Last touch 12 Sep 2026, by text. A money decision. Received, not authority." Every clause the
record does not hold is dropped rather than guessed — no channel where the rail named none, no
verdict where no decision was filed. Never a state word and never a colour: an authority check
is a fact about a message, which direction §3.8 keeps as plain uncoloured text.

On the **company** card it reads the firm's own subject (`subject_type = 'company'` — the firm's
office, dispatch and AP lines; its crew are touched on their own cards) and falls back to
"No contact on the record yet." (R-V). On the **person** card it reads the card id and every seat
id, and **outranks** `people_directory.last_touch_at`, which is the rolodex's coarse
`COALESCE(last_contacted_at, last_project_at, updated_at)` (00626:1478). Two "Last touch" dates
on one line would be the two-words-two-clicks-apart defect this room keeps closing; the coarse
date still prints for the population E13 has no row for yet.

**The notices (c).** "Log who was told" now writes both records: the card's own `told_refs`
(which Patina Field reads back, and which the next change to the way in clears) and the durable
`record_notice` touch (which nothing clears). The card is written FIRST, because the list is what
the phone on the site reads; if the notice then fails, the band says exactly that — "One more
name is on the notice. The record of the change did not save — …" — rather than pretending the
names never landed. A refused card write writes no notice at all.

The fact recorded is the card's own sentence: `wayInFact(changed_at, lockbox_version)` →
"The way in changed 16 Oct 2026. Lockbox, version 3." No code, ever (PR-r).

**The engagement window (c).** Direction §7 P3 asks for a notice on the engagement window, and
**no surface in this build edited one** — `project_parties.on_site_from/on_site_to` had no writer
anywhere in the designer portal. `roster/seat-window-band.tsx` is that act, in the roster row's
unfold beside the Bidding band: two date fields seeded from the record (never empty — r20
major-1's rule), a single "{name} has been told" box, and one press that writes the window and
then the notice. Who was told is ASKED, never assumed: stamping the seat holder in unasked would
put a claim in the record nobody made, and a notice with nobody on it is still a true record of
the change. A window that ends before it begins is refused before either write.

**The row's verdict (d).** The unfold prints "A money decision came in 12 Sep 2026, by text.
Received, not authority." — CRM-22's own words — from the last INBOUND touch that filed a class.
Only an open row asks for it (the same rule `wantsRecord` already applies to consent), so a
thirty-row sheet costs nothing.

---

## 3. Decisions taken here (each overrulable in one line)

| # | Decision | Why |
|---|---|---|
| S-1 | The inbound queue band prints **outside** the `owesPaper` branch | A lender owes no paper WORD (R-A / C13). A document that arrived through a door the studio opened is not a word, it is a thing in the building, and the one way to lose it is to hide it behind a display rule |
| S-2 | The mint act prints only **inside** `owesPaper` | The converse: no door is offered onto paper the studio never asked for |
| S-3 | `useInboundDocuments` does NOT reuse `useComplianceDocuments({unverifiedOnly})` | That hook runs its rows through `retainedComplianceDocuments`, which is the reckoning of what the studio HOLDS. The band asks a different question — what arrived and was never looked at |
| S-4 | E13 outranks `people_directory.last_touch_at` on the person card, and the coarse date is the FALLBACK | One region, one fact, best source. Printing both would put two different "last touch" dates on one line |
| S-5 | The company card's touch line reads `subject_type = 'company'` only | A letter to a crew member is a touch on the PERSON. Widening it to the firm's people would make the firm's history a digest of its crew's |
| S-6 | The window band's "who was told" is a checkbox that starts unticked | `notified_refs` is a record of people the studio SAYS it told |
| S-7 | Card first, notice second, on both notice paths, and the face names which landed | The notice is a record OF the fact; writing it ahead of a failed fact records something that never happened |
| S-8 | The paperwork link's revoke route carries `reasonArg` but **not** `reasonRequired` | 00637 accepts a NULL reason. Marking it required would have the surface refuse what the database allows (the CR5-2 defect, inverted) |
| S-9 | No new `peopleEvents` event for confirm / reject | The mint reuses `grantMinted({tier:'paperwork_link'})` and the revoke `grantRevoked`, both exact fits. Confirm and reject are paper acts; the room's taxonomy is deliberately eight acts, and `people-events.ts` is outside this wave's paths. **Owed if Fable wants the rate of refusals measured.** |
| S-10 | Every new refusal is translated in the HOOK (`asNoticeError`, `asPaperworkLinkError`, `asInboundDocumentError`), not in `lib/document/write-error.ts` | 00635/00637 raise bare tokens with no SQLSTATE, which `writeErrorMessage` returns verbatim. The hook modules are this wave's paths and are the shape `asWrittenConsentError` / `asMergeError` / `asSeatCloseError` already ship |

---

## 4. ⚠ FINDING — an unverified upload already moves the firm's paper word

Found by the Playwright journey, and it is not a test problem.

`compliance_state(holder)` (00623, and the `identity_paper_state` fold behind every Directory
row, seat line and roster row) counts **every non-retired row whatever its `verified_at`**. So
the moment a trade uploads a certificate through the paperwork door:

- the firm's paper word flips (measured: `not_on_file` → `current` on the upload, before any
  studio member opened it);
- the Paper region's table prints the pending document as held paper, beside the queue band that
  says it is waiting for a check — the same paper, twice, in two states;
- everything gated on `blocks` — site access, payment, draw — reads the gate as satisfied.

Spec §5.3 is explicit that an inbound document lands `verified_by = NULL`, `verified_at = NULL`
and that the two coexist "until a studio member acts"; §6 makes Confirm the act that promotes it.
The reducer does not know that. The door therefore lets an unchecked upload open a gate.

**Not fixed here, deliberately.** The fix belongs in the reducer — `compliance_state` and
`identity_paper_state` excluding `inbound = true AND verified_at IS NULL` — which is a migration
and the data wave's object; the portal's `retainedComplianceDocuments` would follow it. Doing
only the portal half would put `Current` beside a table that no longer shows the paper making it
current. **Owed to the orchestrator before ship.**

**FIXED IN ROUND 1** (review QA-B1 / MAJOR-2), both halves in one round: `compliance_state` is
re-headed in `00637` section 1b with two predicates — `rejected_at IS NULL` and
`NOT (inbound AND verified_at IS NULL)` — and `retainedComplianceDocuments` carries the same rule
to the browser. The REFUSED case was worse than this write-up knew and is named in its own leg:
round-1 QA reproduced a licence the studio had explicitly rejected still reading `current` on the
Paper table AND on the firm's own `/paperwork/<token>` page. The firm's page is fixed too: its
`awaiting_check` gained the `inbound` leg (MAJOR-1) and `buildPaperworkRows` now lets only paper
the studio HOLDS speak the word, so a type whose only paper is pending reads "not on file" beside
"Received. {Studio} will confirm it." W4 SQL blocks 9 and 9b assert the pending case and the
refused case by name.

The e2e names this at the point it would otherwise have asserted it, and asserts only the end
state the studio surface owns.

---

## 5. Gates

| Gate | Command | Result |
|---|---|---|
| Supabase type-check | `pnpm --filter @patina/supabase type-check` | clean |
| Designer type-check | `pnpm --filter @patina/designer-portal type-check` | clean |
| Designer jest (whole app) | `pnpm --dir apps/designer-portal exec jest` | **598 suites / 7 754 tests, all pass** (from 594 / 7 707 at branch head) |
| Supabase vitest (whole package) | `pnpm --dir packages/supabase exec vitest run` | **107 files / 1 411 pass, 12 skipped** |
| Playwright — the new journey | `e2e/people/paperwork-inbound.spec.ts`, chromium, workers=1 | **1 passed** |
| Playwright — the notice path | `e2e/people/call-sheet.spec.ts -g "logging who was told"` | **passes**, and `studio_touches` holds the row: `project / out / "The way in changed 16 Oct 2026. Lockbox, version 3." / 1 told` |
| Playwright — the whole `e2e/people` folder | chromium, `--workers=1`, **on a freshly reset DB** | **14 passed, 9 failed** |

**The nine.** `w3-room-report.md` (the gate table, `e2e/people` row) already carried **eight**
pre-existing failures in this folder ("14 passed / 8 failed, the eight pre-existing and carried to the orchestrator"). The run
here is 14 passed / 9 failed out of 23 — the extra test is this wave's, and it passes. The nine
are the add-sheet family of fixture specs (`add-client-letter` ×2, `add-sheet` ×3,
`person-card` ×2, `bring-forward:264`) plus `call-sheet:91`. They fail identically on a database
reset seconds earlier, so they are not fixture drift.

`call-sheet:91` is the only one of the nine that touches a file this wave changed
(`site-access-card.tsx`), so it was **measured against HEAD**: both roster files were checked out
to HEAD, the test re-run, and it failed identically (`a[data-tel-link].first()` resolves to a
Call Sheet roster row's number, not the sheet's first emergency line), then the files were
restored. Pre-existing, unrelated, untouched.

`--workers=1` matters: run in parallel this folder reads 14 passed / 9 failed differently every
time — the specs share one seeded designer and one book.

---

## 6. The Playwright journey, and the one honest compromise in it

`e2e/people/paperwork-inbound.spec.ts` walks the whole loop against real data: pick a
paper-owing firm holding no paper, mint the link through the UI with the thirty-day choice, read
the address once, send a PNG certificate through the door, watch the band appear with the right
count and copy, Confirm in two steps, and see the word reach `current`, the band empty, the
number print in the Paper table, and the row keep `source = 'field_link'`, its stamp, and its
place (nothing deleted).

**The upload step.** The door's entry point is the `paperwork-upload` edge function, and the
helper posts to it whenever it answers. **This machine's local Supabase stack runs no edge
runtime** — there is no `supabase_edge_runtime_*` container, and
`POST /functions/v1/<anything>` answers 503/502 — so the run fell through to the helper's second
path, which repeats `uploadPaperwork`'s exact server-side sequence from
`supabase/functions/paperwork-upload/core.ts`: resolve the studio and firm FROM THE TOKEN
(`paperwork_link_storage_context`), upload to `compliance-documents` under a key whose every
segment before the filename is a uuid, then `record_inbound_compliance_document`. Which path ran
is written onto the test as an annotation, never swallowed, and a 4xx from the function is
re-raised as a real refusal rather than treated as a missing runtime.

So the journey proves the two writes and every surface around them; it does **not** prove the
function's HTTP shell, its CORS, its rate bucket or its mime/size refusals — those are the twelve
Deno tests the data wave already ships (`_tests/paperwork-upload.test.ts`). **A W6 run with
`supabase functions serve` up would close the gap** and needs no change to the spec.

---

## 7. Owed, and not done

- **§4's finding** — CLOSED in round 1 (QA-B1 / MAJOR-2 / MAJOR-1), reducer and both faces.
- **`/paperwork/[token]` in the client portal** (spec §3) — the firm's own page. Named as W6 in
  `w4-data-edge-report.md` §9 and still outstanding; this wave's scope was the studio surfaces
  and the token that page will read.
- **The folio invoice-link hook change** (`w4-data-edge-report.md` §4, last paragraph) — CLOSED
  in round 1 (M-5). The client letterbox's own `/pay/<token>` href is still fed by
  `get_invoice_link` and still draws its "no link" state; no round-1 finding named it.
- **No confirm/reject analytics** (S-9).
- **`flushDeferredMessages` still writes no out touch** — carried forward unchanged.
- **Patina Field's site-access change log still reads `told_refs`, not `studio_touches`** —
  carried forward; this wave adds the second record without repointing the phone's reader.
- **The e2e leaves its confirmed certificate on the firm it picked**, and clears its own rows by
  the `GL-E2E-` prefix at the start of each run, so repeat runs are deterministic.
- **No prod anything**: no `db push`, no `functions deploy`, no secrets. No migration minted.

## 8. Two notes for the Commit phase

- **`apps/designer-portal/next-env.d.ts` was rewritten by the dev server** this wave started
  (Next 16 writes `./.next/dev/types/routes.d.ts` under `next dev`, `./.next/types/…` under
  `next build`). It was **reverted**; if it reappears modified, it is generated noise, not an
  edit — do not stage it.
- **`apps/designer-portal/src/lib/help-system/document-surface-keys.ts` is modified by another
  builder** in this worktree (its new entries name `peopleFirm`, `callSheetSiteAccess` and
  `callSheetBringForward` for the same W4 program). Not this wave's, and left untouched.
- The local database was **`supabase db reset`** once, mid-wave, to take an honest e2e baseline
  (the brief gives this wave the local stack). Head replays to `00637`.
- `artifacts/people-room-crm-2026-09-11/build/w4-studio-report.md` needs `git add -f`.
