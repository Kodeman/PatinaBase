# W2 adversarial code review — round 11

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`, branch
`build/people-room-crm-2026-09-11`, HEAD **`104a00c9f`** ("fix(people-room): W2 round-10
findings"). No server started, no port taken, no database written, nothing touched on Strata.

Read first, in full: `rulings.md` §1–§6 through R-BM, `synthesis/direction.md` §1–§6 + §3.9,
`specimens/SPEC.md` §3/§5/§6/§7/§8, `build/w2a-report.md`, `w2b-report.md`, `w2c-report.md`,
`w2-review-r5-code.md`, `w2-review-r5-qa.md`, `w2-fix-log-r5.md`, `w2-review-r10-code.md`,
`w2-fix-log-r10.md`, `w1a-report.md`, `w1b-report.md`. Then
`git diff origin/main --stat` and every changed file under `apps/designer-portal/src`,
`packages/supabase/src/hooks`, `packages/types/src` (106 files, +23,446 / −5,127).

---

## 0. Gates, run here at HEAD `104a00c9f`

```
$ pnpm --dir <wt>/apps/designer-portal run type-check
> @patina/designer-portal@0.1.0 type-check
> tsc --noEmit
DESIGNER_TC=0

$ pnpm --dir <wt>/packages/supabase run type-check
> @patina/supabase@0.0.1 type-check
> tsc --noEmit
SUPABASE_TC=0

$ pnpm --dir <wt>/apps/admin-portal run build
…
○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
ADMIN_BUILD=0

$ cd apps/designer-portal && npx jest --silent -w 2 \
    src/components/document/people src/components/document/roster src/lib/document \
    src/lib/analytics 'src/app/(document)/doc' src/components/document/__tests__
Test Suites: 197 passed, 197 total
Tests:       3286 passed, 3286 total
JEST=0
```

All four named gates green.

## 1. The mechanical checks the brief names

| Check | Result at this HEAD |
|---|---|
| `useFeatureFlag('call-sheet')` anywhere | **none**. The flag is fully removed and no dead branch survives: `command-bar.tsx:747` now takes `DOCUMENT_SCOPED_SURFACES` whole, `mobile-bar.tsx:164`, `mobile-sheets.tsx:691`, `letterhead-instruments.tsx:371` and `desk/page.tsx:88,113` are unconditional. Surviving `'call-sheet'` strings are the registry ledger key, the `ticket-derivation` overlay token, `surfaceKey="call-sheet"`, and two test mocks (CR11-27) |
| A writer of `project_parties.sms_consent_*` in `apps/` or `packages/` | **none**. Grep over `sms_consent_status` / `sms_opt_out_at` / `sms_consented_at` / `sms_consent_source` / `sms_consent_evidence` outside tests and `database.types.ts` returns 13 hits: docblocks, a READ of `v_project_roster.sms_consent_status` (00594's repointed column), the `ProjectRosterRow`/`ProjectParty` type declarations, and one locally-constructed synthetic roster object (`roster-derivation.ts:149`). No mutation payload names one |
| Consent writes | only `record_channel_consent` / `record_channel_invite` / `record_channel_reconsent` (`use-consent.ts:297,327,356`; `use-coordination.ts:499,780`). The two `.from('studio_channel_consent')` sites (`use-consent.ts:212,254`) are `select()` reads |
| Hard delete outside the mistaken-add predicate | two `.delete()` in the whole hook layer. `project_parties` behind `seatDeleteRefusal` (`use-coordination.ts:951`) — correct; `studio_contact_rules` in `useClearContactRule` (`use-studio-contacts.ts:1092`) — CR11-11, no caller |
| Site access card, client-facing / code field | clean. `site-access-card.tsx` is imported by `call-sheet.tsx` and four of its own specs and nothing else; no `apps/client-portal` import; no code input; `"Studio only. This card never reaches a client page."` prints at `:291` |
| `box-shadow` in changed files | 0 in components. Three hits in `globals.css` (`:360` sheet elevation, `:1942` print reset — both pre-existing) and one inside a `state-word.tsx` comment |
| CSS custom properties used but undefined | one: `--color-linen` (CR11-33). Every `var(--…)` extracted from the 70 changed non-test source files was checked against `globals.css`'s definitions; the rest of the apparent misses are runtime-published tokens or carry fallbacks. PR-v's alias block (`globals.css:2004-2032`) resolves all four `STATE_WORD_PIGMENTS` pairs plus `--color-dusty-blue-ink` |
| `disabled` attribute on an act | `DocumentAction` emits `aria-disabled` whenever `held` is also passed; every gated People/roster act does. Four exceptions survive (CR11-26, CR11-31, CR11-32) |
| `aria-expanded` pairs with a real id | every site pairs `aria-controls` with a panel rendered unconditionally under `hidden={…}`. No dangling expand target found |
| `aria-describedby` points at a rendered id | **no** — two dangle (CR11-6), one orphan id is described by nothing (CR11-40) |
| `<a>` inside `<button>` | none. `TelLink` is a sibling everywhere it is mounted (`person-row.tsx:228`, `roster-row.tsx:394`, `contact-rule-line.tsx:122`, `site-access-card.tsx:366`, `reach-access.tsx:358`); `party-mini-row.tsx` deliberately renders its rule as a `<span>` because the row is a `<button>` |
| One live region | **no**: eight (CR11-10) |
| One `h1` per file | **no** — and this wave introduced the breakage (CR11-1) |
| Analytics | no inline `posthog.capture` in any People/roster surface; every event goes through `lib/analytics/people-events.ts` |
| Ad-hoc fetch to a service | none. The one `fetch` is `compliance-chase.ts` → the portal's own `/api/people/chase-renewal`, which proves studio membership through the caller's own RLS (`createServerClient()` read of `studio_contacts`) before enqueuing with the service role |
| Types imported, not redefined | clean. `coordination/party.ts` now imports `PartyKind` from `@patina/types` instead of re-listing eleven kinds |
| dist packages rebuilt | `packages/types/dist/*` written **13 Sep 07:34**; `src/field-config.ts` **12 Sep 22:48**, `src/studio-config.ts` **12 Sep 20:57**. `partyKindOwesPaper`, `PARTY_KINDS_ACCEPTED_BY_DB`, `STATE_WORD_PIGMENTS`, `resolveStateWord` all present in dist. utils / api-routes / api-client / help-system untouched by this diff, so nothing else is owed |
| SPEC face vocabulary | `REACH_STATE_LABELS`, `CONSENT_WORD_LABELS`, `SEAT_STAGE_WORD_LABELS`, `PAPER_STATE_LABELS` and `DIRECTORY_CHIP_LABELS` all match direction §3.8 / SPEC §5.1 #2 byte for byte |
| PR-n authority gating | present. `ADMIN_ONLY_AUTHORITY_SCOPES = ['money','draw_certify']` (`use-coordination.ts:1774`), checked on the face (`add-person-sheet.tsx:484,881,1560`) and at the write (`:1872`). Which studio decides "admin" is CR11-9 |
| R-BE (party sheet reads the seat + identity) | implemented. `party-profile-sheet.tsx:305` takes `seatResolution?.identity?.consent_status ?? null`, never `status_raw`, and `:592` renders no chip when `seatIdentity` is null |
| R-BM (bring-forward picker is W3) | honoured. `rolodex-picker.tsx` is single-add; `PartyMiniRow`'s `selectable`/`role="radio"` branch is not used there. Not a finding |

## 2. Round 10, re-checked at this HEAD

The four findings the r10 fix log names are **all FIXED**, verified in the code rather than from the log:

| r10 id | Verified at HEAD |
|---|---|
| CR10-1 | `people-room.tsx:420-438` — `openSeat` opens the party sheet only for a field kind, otherwise `router.push('/doc/<project>?sheet=call')`, and falls back to the card only for a seat carrying no `project_id`. `doc/[id]/page.tsx:1233-1237` reads `?sheet=call` on arrival beside `callSheetPending`, so the address now opens the sheet. `person-profile.tsx:307-310,395-415` resolves `textableSeat = liveSeats.find(isFieldRosterRole)` and holds "Send a text" with `NO_TEXT_SEAT_SENTENCE`, `held` + `disabled` together so the rendered attribute is `aria-disabled` |
| CR10-2 | `person-row.tsx:113-116,257-261` — `const { data: seats, isFetching } = usePeopleSeats(…)`, `seatsLoaded = seats !== undefined && !seatsFetching`, and the Directory's own `DIRECTORY_NO_SEAT_SENTENCE = "No open seat on any job."` R-V's project-scoped sentence stays on the card (`reach-access.tsx:81`) |
| CR10-3 | `reach-access.tsx:105-118` — the `bounced` branch asks `isPhoneChannel(channel.channel_kind)`; the email wording is byte-identical to SPEC §5.2 #3 |

**CR10-4 … CR10-58 were not assigned and are every one still OPEN.** Each was re-read at this
HEAD against the code. They are carried below as CR11-11 … CR11-65 with their r10 id in brackets.

Nothing in the three fixes introduced a regression that I can find: `openSeat`'s new push does not
collide with the Room's `?role/?view/?scope/?trade/?person/?firm` address sync (`people-room.tsx:288-304`
never writes `sheet`, and `/doc/[id]`'s two `router.replace` sites at `:1270` and `:1278` only fire on a
proposal-id resolution), and the 197 suites over `people`, `roster`, `lib/document`, `lib/analytics`,
`(document)/doc` and `document/__tests__` are green.

---

## 3. Findings

### CR11-1 · MAJOR · high confidence (NEW this round) — this wave puts a SECOND `<h1>` on `/library` and on `/library/judgments`

`room-shell.tsx:152-166` changes the Room's title from a `<span>` to an `<h1>`:

```diff
-          <span className="font-mono text-[12px] font-semibold uppercase tracking-[0.2em] …">
+          <h1 className="m-0 font-mono text-[12px] font-semibold uppercase tracking-[0.2em] …">
             {title}
-          </span>
+          </h1>
```

with the docblock "The Room's name is the page's ONE heading (QA-8)". It is one heading in the
People Room — `person-profile.tsx:344` and `company-card.tsx` use `<h2>`, `view-shell.tsx:109`
uses `<h2>`. It is **two** in two of RoomShell's other nine tenants, and both were exactly one
on `origin/main`:

- **`/library`** — `library-room.tsx:154` mounts `<RoomShell title="The Library">` and
  `:175` mounts `<LibrarianBar>`, whose `librarian-bar.tsx:32` is
  `<h1 …>Find a piece—or <em>ask about one.</em></h1>`. Verified on `origin/main`:
  `room-shell.tsx` had no `<h1>`; `librarian-bar.tsx` had one.
- **`/library/judgments`** — `app/(document)/library/judgments/page.tsx:110` mounts
  `<RoomShell>` and `:122` renders `<h1 className="sr-only">Side by side</h1>`, directly under
  a comment reading *"The Room's band already names the surface (RoomShell title), so…"* — the
  sr-only heading exists **because** RoomShell had none. It now duplicates it.

SPEC §7 #11 fixes one `h1` per file, and the brief's own aria list treats heading structure as a
contract. Neither surface is People-room work, which is exactly why neither has a test that would
have caught it.

**Fix.** Either give `RoomShell` an opt-in (`titleIsHeading`, the shape `countAtEveryWidth`
already uses two lines above) and set it only where the Room body has no heading of its own, or
demote the two bodies: `librarian-bar.tsx:32` → `<h2>`, and delete the now-redundant sr-only
`<h1>` at `judgments/page.tsx:122`.

---

### CR11-2 · MAJOR · high confidence [CR10-17, CR9-13, CR8-7, CR7-5] — two counts of one book, one screen apart

`people-room.tsx:506,523` still hand `directoryCount={all?.length}` — the RAW `people_directory`
row count — to `PeopleCompactSelector` and `PeopleDesktopRail`, which print it as a bare number
beside "Directory" (`view-shell.tsx:133-138`). Seventeen lines above, the head prints
`directoryHeadLine(directoryEntryCounts(directoryIdentityRows(all)))` (`:510`) — the count
`directoryIdentityRows` exists to make honest, with company-only seats (Rivera Finishes) and
carded-elsewhere legacy client rows (the Okonkwo household) removed. The rail number is strictly
the larger whenever either population exists, which on the Okonkwo seed it does.

**Fix.** Feed the rail and the selector `directoryIdentityRows(all).length`, or drop the number.

---

### CR11-3 · MAJOR · high confidence [CR10-37, CR9-38] — a SEAT count printed as a PROJECT count

`person-profile.tsx:537-540`:

```tsx
{`Worked ${person.seat_count ?? 0} of the studio's ${
  (person.seat_count ?? 0) === 1 ? "projects" : "projects"
}.`}
```

`seat_count` is `identity_seat_count()` — the number of seats `people_directory_seats` nests
(R-BG), not the number of projects. A human holding two seats on one job reads "Worked 2 of the
studio's projects." SPEC §5.2 #10 fixes the sentence as a project count. (The ternary is also
dead — see CR11-38.)

**Fix.** Count distinct `project_id` over the seats already in hand (`seats` is read at `:161`),
or add a project count to the view.

---

### CR11-4 · MAJOR · medium confidence [CR10-27, CR9-24] — the company card prints the raw `company_kind` token, and the Directory row that opened it prints another word

`company-card.tsx:142`:

```ts
if (trade && kind) parts.push(`${getFieldTradeLabel(trade)} ${kind}`);
else if (kind) parts.push(companyKindShortLabel(kind));
```

`kind` is `card.company_kind ?? card.contact_kind` — a raw token. The `else` branch was fixed in
r6; the `if` branch was not, so a firm carrying BOTH a trade and a kind prints
`"Electrical sub"` (right, and what SPEC §5.3 #1 fixes) but also `"Carpentry gc"`,
`"Tile & stone vendor"` and so on — and the Directory firm row two clicks away already printed
`companyKindShortLabel(kind)` = "GC" for the same card. One firm, two words. The r6 fix log asked
for a ruling and **it is still owed**: `companyKindShortLabel('sub')` is "Subcontractor", which
would break SPEC §5.3 #1's literal.

**Fix (needs the ruling).** A short running-prose map keyed separately from the column-head map —
`{gc: 'GC', sub: 'sub', vendor: 'vendor', …}` — so both the literal and the Directory row agree.

---

### CR11-5 · MAJOR · high confidence [CR10-41, CR9-42] — every chase draft says "a current certificate" and never names the paper that lapsed

`company-card.tsx:816-817`:

```ts
documentId: docs[0]?.id ?? null,
documentLabel: docs[0] ? null : "a current certificate",
```

The label is `null` **exactly when** a document exists, and `api/people/chase-renewal/route.ts:83`
falls back to the same literal, so every `agent_tasks` summary reads
`Chase <firm> for a current certificate` — including the case where the studio pressed the act
beside a table row reading "MN electrical contractor licence · Lapsed". `docs[0]` is also
soonest-expiry-first, which is not necessarily the lapsed paper, so the `document_id` on the
payload may name a different document than the one the studio was looking at.

**Fix.** Pick the blocking/lapsed document (`paperHeldClause` already finds it) and pass its own
label; keep "a current certificate" only for the no-documents branch.

---

### CR11-6 · MAJOR · high confidence [CR10-46, CR9-11] — two `aria-describedby` dangle the moment the act becomes available

- `roster-row.tsx:668` — `aria-describedby={`${panelId}-send-held`}` is **unconditional**, while
  `<p id={`${panelId}-send-held`}>` renders only `{!body.trim() && …}` (`:680-687`). As soon as the
  designer types a word, Send points at an id that is not in the document.
- `notice-log.tsx:139` — `aria-describedby={heldId}` unconditional; `<p id={heldId}>` renders only
  `{picked.length === 0 && …}` (`:155-157`).

Both files already do it right elsewhere: `roster-row.tsx:526` (`refusal ? refusalId : undefined`)
and `:570` (`!canText ? … : undefined`).

**Fix.** Gate both the way the two siblings are gated.

---

### CR11-7 · MAJOR · high confidence [CR10-40, CR9-41] — five card mutations leave the seat lines stale

`use-studio-contacts.ts:277-278, 352-353, 379-380, 405-406, 534-538` invalidate
`studioContactKeys.all` + `['people-directory']` and never `['people-directory-seats']`.
`people_directory_seats` carries `display_name`, `company_name`, `phone_e164`, `consent_status`,
`reach_state`, `paper_state`, `contact_rule_summary` and `warranty_until` — so after renaming a
card or changing its phone, the Directory row updates and the seat lines beneath it, the person
card's "Seats on projects" and the company card's Jobs region keep the old fact. The channel, rule,
affiliation and compliance fan-outs in the same file DO invalidate both (`:726-727`, `:1002-1003`,
`:1180-1181`, `:1468-1469`), so the omission is inconsistent inside one module.

**Fix.** Add `peopleSeatKeys.all` to all five.

---

### CR11-8 · MAJOR · high confidence [CR10-19, CR9-15] — a revoked door stays on the party sheet

`use-access-grants.ts:296-307` invalidates `accessGrantKeys.all`, `['people-directory']`,
`['people-directory-seats']` and `['project-roster']` — never `partySmsKeys.links(partyId)`, which
`useRevokeFieldLink` does invalidate (`use-party-sms.ts:203`). The person card's Revoke and the
party sheet's Revoke close the same token; only one of them tells the party sheet.

**Fix.** Invalidate `partySmsKeys.all` (or the subject's `links`) from the grant revoke too.

---

### CR11-9 · MAJOR · high confidence [CR10-20, CR9-16] — minting from the party sheet leaves the Call Sheet's reach word on "On paper"

`party-profile-sheet.tsx:491` — `createLink.mutateAsync({ partyId })` with `projectId` omitted, so
`useCreateFieldLink`'s `['project-roster', projectId]` invalidation leg is skipped and
`reachState(row)` keeps returning `on_paper` for a seat that now holds a live field link.
`seatProjectId` is in scope and IS passed to the revoke twelve lines down (`:515`).

**Fix.** Pass `projectId: seatProjectId ?? undefined`.

---

### CR11-10 · MAJOR · medium confidence [CR10-16, CR9-12] — eight live regions where the brief's check asks for one

`people-room.tsx:599` is the Room's announcer (the only explicit `aria-live="polite"`); seven other
`role="status"` — which carries an implicit polite live region — survive and more than one can be
live on one screen: `directory-view.tsx:377`, `call-sheet.tsx:206`, `roster-row.tsx:693`,
`project-team-roster.tsx:95`, `rolodex-picker.tsx:453`, `rolodex-seed-sheet.tsx:208`,
`room-shell.tsx:193`. Direction §5.5 names ONE destination — "the room's existing `role='status'`
line". On the Directory screen alone, the Room's toast and the Directory's inline notice can both
be live after an add.

**Fix.** Route the inline notices through the Room's announcer, or demote the seven to plain
paragraphs (the two error slots should be `role="alert"`, see CR11-64).

---

### CR11-11 · MAJOR · medium confidence [CR10-18, CR9-14] — the Add sheet asks the wrong studio whether the designer may write a money grant

`add-person-sheet.tsx:465-469` derives `isOrgAdmin` from `organizationId` — the studio that holds
the BOOK — while the four `project_party_authority_studio_*` policies gate on
`project_party_recorded_studio()`. `useProjectRecordedStudio` is imported and used in the same file
at `:502-504` for the card link. A designer who is an admin of the book's studio but not of the
studio the job records gets a live "Signs money to $2,500" scope on the face and a refusal at the
write — Leah task 2's own act. Fail-closed at the DB, so nothing wrong is written; the cost is a
refusal the face did not predict.

**Fix.** Read `isOrgAdmin` against `recordedStudioId`.

---

### CR11-12 · MAJOR · medium confidence [CR10-38, CR9-39] — the company card's Jobs region states nothing

`company-card.tsx:955-970` gates `NO_JOBS_SENTENCE` on `crew.length`, while `CrewJobs` returns
`null` for an empty seat array (`:191`). A firm with affiliations and no live seats renders the
"Jobs" heading, an empty `<ul>`, and the money-book line — a region that says neither "here are the
jobs" nor "no jobs". C32 / R-V: a region that states nothing reads as an oversight.

**Fix.** Gate the sentence on whether any crew member has a seat, not on `crew.length`.

---

### CR11-13 … CR11-16 — new minors found this round

| id | Conf. | Finding |
|---|---|---|
| CR11-13 | high | `add-person-sheet.tsx:197-216,1058` — pick the door labelled **"a household member"** (`KIND_CHOICES`, `:154`) and the sheet's own intro reads *"Add a **client rep** to a project. …"*, because `KIND_NOUN[SEAT_PARTY_KIND['household']]` = `KIND_NOUN.client_rep` = `"client rep"`. The name error at `:692` reads *"A client rep needs a name."* C5's letter is kept (the string `client_rep` never reaches a face) but the door's word and the sheet's word for the same thing differ by one underscore. Same class as CR11-30's "Client Rep" seat-line label, at a site r10 did not name |
| CR11-14 | high | `add-person-sheet.tsx:1703-1710` — the terminal consequence sentence ships as *"Adding Joe Wozniak puts them on the Okonkwo residence Call Sheet and opens a field link for **their window**. It never opens billing or the agreement."* SPEC §5.5 #13 fixes *"…puts **him** on the Okonkwo residence Call Sheet and opens a field link for **the framing window**."* The pronoun is a generalisation a shipped face must make; the trade is on the form two fields above and could be named |
| CR11-15 | medium | `people-room.tsx:236` — backing out of a deep-linked card lands the chip with `directoryChipFromParam(resolved)`, which only understands the six chips and the eleven legacy roles. An `architect`, `engineer`, `inspector`, `vendor` or plain `contact` role falls to `everyone`, while `directoryBandOf` would have put the row under Crew or Makers — so the comment's promise ("Land the chip a click from that row would have left pressed") does not hold for the kinds PR-f widened |
| CR11-16 | low | `directory-view.tsx:529-533` — a firm row's payee marker is suppressed by `entryPaperWord(row) === null`, which is true both when the firm owes no paper (right, SPEC §5.1 #18) and when `paper_state` is simply NULL. A firm that owes paper but whose `paper_state` did not resolve silently loses its "Signs: …" marker too. Two different facts, one gate |

---

### CR11-17 … CR11-65 — the carried r10 findings, every one re-verified OPEN at HEAD `104a00c9f`

Line numbers re-checked here. Grades kept at r10's unless the brief's rubric puts one higher
(those are promoted above, CR11-2 … CR11-12).

| id | r10 id | Conf. | Finding, at this HEAD |
|---|---|---|---|
| CR11-17 | CR10-4 | high | `party-mini-row.tsx:149,153` — `truncate` (`text-overflow: ellipsis`) on the picker mini row's name and its firm/trade line. SPEC §8 #5 forbids `text-overflow`; direction §1 line 9 fixes "rows wrap instead of truncating". `rolodex-seed-sheet.tsx:80` and `view-shell.tsx:298` carry two more. Pre-existing inside files W2c rewrote |
| CR11-18 | CR10-5 | high | `person-row.tsx:185-189` — the 390 line 2's FIRST middle dot is unconditional between reach and consent, while the paper dot beside it IS gated (`{paper ? <>…</> : null}`). `StateWord` renders `null` for a value naming no word (R-BB), and `consent_status` is NULL for everyone the studio holds no record on, so those rows print "ACCOUNT · · NOT ON FILE" — or a leading dot when `reach_state` is null too |
| CR11-19 | CR10-6 | medium | `seat-line.tsx:69-71` prints `getPartyKindLabel` / `getFieldTradeLabel` — the Title-Case column vocabulary — so the line reads "Okonkwo residence · Subcontractor · Electrical · ON THE JOB · …" where SPEC §5.1 #8 fixes "Okonkwo residence · sub · electrical · On the job · …". `personIdentityLine` two pixels above lowercases the same trade on purpose. `person-profile.tsx:461-462` (Past seats) carries the same pair |
| CR11-20 | CR10-7 | medium | `site-access-card.tsx:369` — `fullWidth` with no width branch, so the whole who-to-call line is the `tel:` target at 1440 as well, where SPEC §6.2 / R-X fix "the whole line at 390, only the digits at 1440". Its accessible name also doubles the name: `TelLink` composes `Call ${personName}, ${text}` over a `text` that already opens with the name |
| CR11-21 | CR10-8 | medium | `directory-view.tsx:477-500` — the duplicate band prints the sentence then two name buttons separated by a bare space: "These two cards share a phone. Adaeze Okonkwo Chidi Okonkwo". Structurally correct per R-Y; as prose it reads as one four-word name |
| CR11-22 | CR10-9 | low | `use-studio-contacts.ts:1080-1100` — `useClearContactRule` HARD-DELETES the `studio_contact_rules` row, destroying `set_by` / `set_at` / `reason`, where every other retirement this wave added is dated (`useCloseAffiliation`, `useCloseProjectPartySeat`, `useSetStudioContactChannelStatus`). No caller today, which is why it stays low |
| CR11-23 | CR10-10 | high | `person-profile.tsx:539` — History prints `formatSeatDate` (short): "Last touch 17 Oct 2026." SPEC §5.2 #10 fixes "Last touch 17 October 2026." `formatLongDate` is imported in the same tree |
| CR11-24 | CR10-11 | medium | `rolodex-picker.tsx:359` (`placeholder="a name, a company, a trade…"`) and `:542` (`placeholder="optional"`); `party-profile-sheet.tsx:941`. Direction §5.4's Editing state is "label always visible, no `placeholder`". The Add sheet itself is clean |
| CR11-25 | CR10-12 | medium | `party-profile-sheet.tsx:554` — `projectId: linkedParty?.project_id ?? seatProjectId ?? ''`. The empty string reaches `project_consent_org(p_project_id := '')` → raw `22P02 invalid input syntax for type uuid` in the error slot, where the hook's own written sentence exists for exactly that case |
| CR11-26 | CR10-13 | medium | `people-room.tsx:128` reads `usePeopleDirectory({ role: 'all' })` UNSCOPED for the head count while `directory-view.tsx:145-148` reads `{ scope: scope === 'mine' ? 'mine' : undefined }` for the list. MINE narrows the list and not the head. May be intended (direction §3.1 makes the head a count of cards) — a ruling, not necessarily a fix |
| CR11-27 | CR10-25 | high | `command-bar.test.tsx:65` still mocks a `call-sheet` flag with eleven `mockCallSheetFlag` assignments and `__tests__/call-sheet-doorways.test.tsx:92` carries it too; `command-bar.tsx` reads no such flag. Dead scaffolding around a retired flag |
| CR11-28 | CR10-26 | high | Four dead `useFeatureFlag` imports, referenced nowhere in their own file after the flag came out: `mobile/mobile-bar.tsx`, `mobile/mobile-sheets.tsx`, `letterhead-instruments.tsx`, `coordination/item-composer.tsx` |
| CR11-29 | CR10-14 | low | Two query roots outside any keys object, invalidated by nothing: `use-coordination.ts:2148` `['project-recorded-studio', projectId]`, `use-consent.ts:381` `['project-consent-org', projectId]` |
| CR11-30 | CR10-28 | low | The Add sheet's door reads "a household member", writes `party_kind: 'client_rep'`, and every seat line prints `PARTY_KIND_LABELS.client_rep` = **"Client Rep"**. See CR11-13 for the same fact on the sheet's own intro |
| CR11-31 | CR10-29 | low | Three acts emit a real `disabled` while their mutation is in flight, because `DocumentAction` computes `unavailable = disabled \|\| loading` and emits `disabled={unavailable && !held}`: `roster-row.tsx:667-668` (Send, once a body is typed), `notice-log.tsx:138-139`, `rolodex-picker.tsx:598`. `party-mini-row.tsx:196` is a raw `<button disabled={disabled} className="… disabled:opacity-50 …">` — both the attribute and opacity-as-state are named forbidden (SPEC §7 #4, §8 #5); transient at its one call site (`rolodex-picker.tsx:420`) |
| CR11-32 | CR10-30 | low | `add-person-sheet.tsx:1560` — `disabled` on an `<option>`, which has no `aria-disabled` equivalent |
| CR11-33 | CR10-31 | medium | `--color-linen` is defined nowhere in `apps` or `packages` and is spent at `party-profile-sheet.tsx:908`, `add-person-sheet.tsx:1639`, `directory/letter-line-field.tsx:191`, always `bg-[var(--color-linen)]/45` with no fallback. Pre-existing on `origin/main`. The only undefined-and-unfallbacked custom property in the changed set |
| CR11-34 | CR10-15 | low | `person-profile.tsx` renders no "Edit identity" and no "Archive", which direction §3.2 R1 names as the card's two tertiary controls. SPEC §5.2's acceptance list does not require them |
| CR11-35 | CR10-21 | high | `person-row.tsx:62-68` exports `openPersonLabel`; nothing imports it (grep: one hit, its own definition). The rendered control (`:157-164`) carries the bare `display_name`, where SPEC §7 #6 asks for "the person's name and role summary only" |
| CR11-36 | CR10-22 | medium | `use-coordination.ts:936-946` — the hard-delete guard asks `studio_compliance_documents WHERE holder_id = <the card>` while the face refuses on `identity_paper_state(card, COALESCE(seat.company_id, card.company_id))` (R-BA/R-BJ). An RLS-refused read returns `[]` rather than raising, so the guard reads "no paper held". The face holds the act first, which is why this is not higher |
| CR11-37 | CR10-23 | medium | R-BD retires `project_consent_org()` from guards and reducers; five portal call sites survive — `use-coordination.ts:492,673,770,913` (the last **inside the hard-delete guard**, where a NULL org silently sets `hasConsentRecord = false`) and `useProjectConsentOrg` (`use-consent.ts:387`), consumed by `call-sheet.tsx:99` and `project-team-roster.tsx:52`. 00624:84 says the LEDGER side still resolves that way, so this may be correct by construction — a ruling is owed on the guard |
| CR11-38 | CR10-36 | low | Two dead ternaries with the same string on both branches: `person-profile.tsx:538-539` (`=== 1 ? "projects" : "projects"`) and `add-person-sheet.tsx:1707-1709` (`partyName.trim() ? "them" : "them"`) |
| CR11-39 | CR10-39 | medium | `company-card.tsx:854` — `Remit to {card.remit_to ?? name}` asserts a payee the studio may never have written, on the one region direction §1 line 5 makes this card the sole writer of. Every other absent record in this build prints its own sentence |
| CR11-40 | CR10-48 | high | `reach-access.tsx:1074` renders `<p id={mintBandId}>` and no `aria-describedby` names it (the mint act points at `mintReasonId`, `:1086`). `site-access-card.tsx:413`, `:578`, `:674` hardcode `id="site-access-emergency-lines"` / `"site-access-key-holder"` / `panelId="site-access-notice-log"` where every other disclosure in this wave uses `useId()` |
| CR11-41 | CR10-32 | low | `compliance-table.tsx:56-57` compares `Date.parse(\`${doc.expires_on}T00:00:00Z\`)` against `today.toISOString().slice(0,10)`. West of UTC `toISOString()` rolls to tomorrow after 18:00 local, so a certificate expiring today reads `lapsed` from six in the evening. `people-format.ts` and `seat-line.ts` both parse by parts and say why |
| CR11-42 | CR10-33 | low | Two `authorityPhrase` implementations. `roster-derivation.ts` joins with `". "`, appends a final stop, and rounds the figure (`Math.round(cents/100)`); `person-profile.tsx:114-124` returns each phrase bare, the caller joins with `" · "` (`:141`), and the figure comes from `formatMoneyFromCents`, which keeps cents where there are cents. One grant reads "Selections." on the Call Sheet and "Selections" on the person card; a $2,500.50 threshold reads "$2,501" on one and "$2,500.50" on the other |
| CR11-43 | CR10-34 | low | `company-card.tsx:155` spells the warranty long — "warranty through 21 November 2026" — where SPEC §5.3 #1 fixes "warranty through 21 Nov 2026", and R-U's fold and every seat line use the short form |
| CR11-44 | CR10-35 | low | `use-people.ts:262-275`'s in-memory search matches name, email and phone digits only, while direction §3.1 also names firm and trade. The Directory uses `directoryEntryMatches`, which matches both, so the command bar finds fewer people than the room does for the same string |
| CR11-45 | CR10-42 | medium | Two reducers decide one paper fact and disagree on supersession. The firm row and the seat line print `compliance_state()` / `identity_paper_state()`, which reckon supersession transitively (R-BF); the company card's table decides each row in the browser with `documentPaperState` (`compliance-table.tsx:51-62`) over a set `useComplianceDocuments` filtered with a flat `.is('superseded_by', null)` (`use-studio-contacts.ts:1418`). `paperHeldClause` reads that same filtered list |
| CR11-46 | CR10-43 | low | `person-profile.tsx:361-363` renders `<h3>Reach &amp; access</h3>`, then `ReachAccess` renders `<h3>Channels</h3>`, `<h3>Contact rule</h3>` and `<h3>Access grants</h3>`. SPEC §5.2 #2 calls these three "sub-heads"; by ear they read as four peers. No heading level is skipped |
| CR11-47 | CR10-44 | low | `seat-line.tsx:92` — `py-[6px]` around an 11px span, roughly 28px tall, where every other control in the room carries `min-h-11`. R-AA makes the seat line a door, and the person card, the company card and the Directory row all mount it |
| CR11-48 | CR10-45 | low | `notice-log.tsx:76-101` renders a list of `role="checkbox"` buttons with no `role="group"` and no group label, unlike every chip row in the room (SPEC §7 #7) |
| CR11-49 | CR10-47 | medium | `site-access-card.tsx:164-175` — `EditableLine`'s collapsed act is a tertiary whose only text is `Edit`, mounted three times ("The way in", "Hours", "Receiving"). Three controls, one accessible name. The SAVE row already composes `Save ${label.toLowerCase()}` at `:131` |
| CR11-50 | CR10-49 | medium | `use-studio-contacts.ts:445` keys `useStudioContactHistory` at `['studio-contact-history', ids]`, outside `studioContactKeys`, and nothing invalidates it — while `useAddProjectParty`, `useCloseProjectPartySeat`, `useRemoveProjectParty` and `usePromoteToStudioContact` all move the `project_parties` rows it counts for the picker's history line |
| CR11-51 | CR10-50 | high | Three docblocks describe behaviour the code no longer has: `contact-rule-line.tsx:8-10` ("A HARD BLOCK — a rule that forbids a channel outright") gives the pre-R-BL reading, which `contactRuleIsHardBlock` (`contact-rule.ts:110-114`) contradicts; `contact-rule.ts:99-103` still says "Two rows (F-10 Sam Rowe, F-13 Ingrid Halvorsen) therefore wear a rule the fixture marks `false`", which the shipped predicate makes false for both; `people-events.ts:4` says "Eight events" where `PEOPLE_EVENT_NAMES` (`:30-40`) defines nine |
| CR11-52 | CR10-51 | low | `rolodex-picker.tsx:575` renders `{stamp ? '✓' : ''}` — a ✓ glyph, which SPEC §8 #5 names forbidden and SPEC §5.7 #4 repeats. `coordination/item-composer.tsx:900` carries a second. Pre-existing |
| CR11-53 | CR10-52 | high | `w2b-report.md` §2's strings table quotes an Add-sheet line the code does not ship. The shipped line is `{partyName.trim() \|\| "They"} is invited, not consenting. Patina has not sent them anything yet.` (`add-person-sheet.tsx:1697-1699`) — the CORRECT wording since R-AS retired the seat-side dispatch. One line in the report |
| CR11-54 | CR10-53 | high | `PARTY_KINDS_OWING_NO_PAPER` exempts exactly `inspector`, `lender`, `authority` (`field-config.ts:296-302`), so the studio's OWN principal, lead designer and bookkeeper, and both homeowners, print `Not on file` in the paper column of the studio's own ledger. C13/C24/R-A's reasoning applies verbatim. **Needs a ruling**, not a code change |
| CR11-55 | CR10-54 | medium | `use-call-sheet-roster.ts` / `use-project-authority.ts` still live under `components/document/roster` rather than beside `usePartyAuthority` in `@patina/supabase`, and `people/compliance-chase.ts` likewise. Each says so in its own docblock and names the orchestrator. The key nesting is correct |
| CR11-56 | CR10-55 | low | `roster-row.tsx:197` (`doc.expires_on < new Date().toISOString().slice(0,10)`) and `:287` (`grantWindowEnd(row.onSiteTo, row.warrantyUntil, new Date())`) read the clock during render, against the room's own convention (`people-room.tsx:137`, `company-card.tsx`, `person-profile.tsx:163`, all `useMemo(() => new Date(), [])`) |
| CR11-57 | CR10-56 | high | `studio_contact_channels` marks Dana Kowalski's email **`dead`**, not `bounced`, so the person card prints `heldChannelReason`'s "This line is dead." where SPEC §5.2 #3 fixes "This address bounced back, 12 March 2026. Texts and calls still reach them." One `status` value in the seed. (W1 scope — recorded because the SHIPPED face is what differs) |
| CR11-58 | CR10-57 | high | Adaeze Okonkwo reads `reach_state = on_paper`, `consent_status = not_asked` in the local `people_directory`, where fixture F-04 and SPEC §5.4 #5 give her reach `Account` and consent `Texting`. Leah task 2's own subject. (W1 seed scope) |
| CR11-59 | CR10-58 | low | The seed spells "Carol Nyström"; SPEC §3's fixture spells "Carol Nystrom" |

### Two more re-verified this round, recorded separately

| id | Conf. | Finding |
|---|---|---|
| CR11-60 | medium | `reach-access.tsx:186-188` — `consentKind = isPhoneChannel(kind) ? "sms" : "email"`. `PERSON_CHANNEL_KINDS` is only `mobile`/`email` today, but `COMPANY_CHANNEL_KINDS` and the stored vocabulary include `ap_email` and `portal_311`, and the company variant mounts the same `ChannelRow`. A consent recorded against a `portal_311` value would be written into `studio_channel_consent` as a **`sms`/`email`** record keyed on a portal identifier. Latent (the company variant passes `showConsent: false`), but the branch is a two-value guess over a seven-value enum |
| CR11-61 | low | `rolodex-picker.tsx:453` renders the picker's ERROR string in `role="status"` with terracotta ink, where `add-person-sheet.tsx:1719` in the same flow uses `role="alert"`. Pre-existing on `origin/main:368`; it is also one of CR11-10's eight live regions |

---

## 4. What this review did not cover

The visual and behavioural walk at 1440 and 390 (`document.documentElement.scrollWidth` was not
measured — the QA reviewer owns 3000/3002), the Playwright specs under `e2e/people` (not run — no
port taken), the iOS surfaces under `apps/mobile/Capture`, the W1 migrations, and the Sanity help
articles. No local database query was run this round; every claim above is read off the code at
HEAD or off a prior round's recorded database evidence, and is marked as such where it is the
latter (CR11-57, CR11-58, CR11-59).
