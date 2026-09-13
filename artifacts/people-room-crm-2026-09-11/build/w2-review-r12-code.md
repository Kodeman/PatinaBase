# W2 — adversarial code review, round 12

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`, branch
`build/people-room-crm-2026-09-11`, HEAD `c626ef3fe` ("fix(people-room): W2 round-11 findings").
Read: `rulings.md` (all, §3 through R-BM), `synthesis/direction.md` §1–§6 + §3.9,
`specimens/SPEC.md` §3, §5, §6, §7, §8, `w2a/w2b/w2c-report.md`, `w1a/w1b-report.md`,
`w2-review-r5-code.md` / `w2-review-r5-qa.md` / `w2-fix-log-r5.md`, `w2-fix-log-r11.md`.

Diff read in full for every changed file under `apps/designer-portal/src`,
`packages/supabase/src/hooks`, `packages/types/src` (108 files, 23 954 insertions).

---

## 0. Gates, run here at this HEAD

```
$ pnpm --dir apps/designer-portal type-check
> tsc --noEmit
EXIT=0

$ pnpm --dir packages/supabase type-check
> tsc --noEmit
EXIT=0

$ cd apps/designer-portal && npx jest
Test Suites: 585 passed, 585 total
Tests:       7509 passed, 7509 total
Snapshots:   1 passed, 1 total
Time:        24.17 s

$ cd packages/supabase && npx vitest run
 Test Files  103 passed (103)
      Tests  1297 passed | 12 skipped (1309)
   Duration  3.48s
```

```
$ cd apps/admin-portal && npx next build --webpack        # the strictest gate, owed because
▲ Next.js 16.2.10 (webpack)                               # @patina/supabase and @patina/types
✓ Compiled successfully in 27.3s                          # are shared edits
  Running TypeScript ...
  Collecting page data using 13 workers ...
✓ Generating static pages using 13 workers (137/137) in 399ms
  Finalizing page optimization ...
Route (app)  … 137 routes, ƒ Proxy (Middleware)
```

⚠ **The admin build will not run inside this session's Bash sandbox.** Three attempts
(`pnpm --dir apps/admin-portal build`, twice, and `npx next build --webpack`) each wedged at
`Creating an optimized production build …` with `.next/diagnostics/build-diagnostics.json` frozen
at `{"buildStage":"compile","buildOptions":{"useBuildWorker":"false"}}` and a 7.2 MB `trace` that
stopped growing — no error, no exit, for 20+ minutes each. The same command with the sandbox
disabled compiled in 27.3s. The sandbox demonstrably blocks process-spawn facilities in this
environment (`nice(5) failed: operation not permitted` on every spawn; `ps` and `pkill` refused;
the Supabase CLI raised `EPERM` writing `~/.supabase/telemetry.json`). The tail above is the
unsandboxed run, and it is green.

**Dist packages**: `@patina/types`, `utils`, `api-routes`, `help-system` all rebuilt 13 Sep 07:34;
`find packages/<p>/src -newer packages/<p>/dist/index.js` returns nothing for every one, and
`packages/types/dist/studio-config.js` carries `resolveStateWord`, `packages/types/dist/field-config.js`
carries `partyKindOwesPaper`. `@patina/api-client` was not touched this wave. No dist is stale.

---

## 1. The mechanical checks the brief names

| Check | Result |
|---|---|
| `useFeatureFlag('call-sheet')` anywhere in `apps` / `packages` | **none**. The surviving `'call-sheet'` strings are the registry's SURFACE key (`registry.tsx:236`, `ticket-derivation.ts`, `DocumentAction surfaceKey=`), a different vocabulary. One dead test mock survives (CR12-15) |
| Dead flag-off branches | none found; `callSheetOn` returns nothing |
| A portal write to `project_parties.sms_consent_*` | **none**. Every hit in `apps/*/src` + `packages/*/src` is a READ (`roster-derivation.ts:399` off `v_project_roster`, repointed to the record by 00594/00621), a type declaration (`use-coordination.ts:77-84`, documented FROZEN), a comment, or a test fixture. No INSERT/UPDATE payload names one |
| Consent writes | only `record_channel_consent` / `record_channel_invite` / `record_channel_reconsent` (`use-consent.ts:297,327,356`). No other door |
| Hard delete outside the mistaken-add predicate | `useRemoveProjectParty` has exactly one caller, `roster-row.tsx:187`, held behind `seatDeleteRefusal` (`roster-row.tsx:278-282`, act at `:533-537`). `useClearContactRule` still hard-deletes (CR12-21) but has no caller |
| Site access card reaching a client surface | `grep -rn "site_access\|SiteAccess\|siteAccess" apps/client-portal/src` → **no hits** |
| A site access CODE field | none. `00625` has no `gate_code` column; no input, no state, no payload key anywhere |
| `box-shadow` in changed files | **0** new. The only hits are `globals.css`'s pre-existing `--elevation-sheet` (:360) and the print reset (:1942), plus one comment in `state-word.tsx` |
| Every CSS custom property used is defined | 95 distinct `var(--…)` in the changed non-test set; all resolve in `globals.css` except `--color-linen` (CR12-23, pre-existing on `origin/main`) and names that carry a literal fallback (`--doc-mobile-bar-height, 72px`, `--ink-x, 50%`, `--strata-cycle, 2.2s`, `--stagger-index, 0`) |
| Hooks above early returns | scripted scan over all changed `.tsx` + read of every new surface: **clean**. `person-profile.tsx` puts the `role === "maker"` and the `!person` returns after all sixteen hooks; `company-card.tsx` puts `if (!card)` after all of its |
| Hydration gate | no width-branching JS anywhere in the new surfaces; `roster-row.tsx:233` states the rule explicitly and renders both phrases with CSS choosing. `new Date()` during render survives at three sites (CR12-32) |
| `disabled` attribute vs `aria-disabled` | every `DocumentAction` that passes `disabled` also passes `held`, so it emits `aria-disabled` and stays focusable — checked at `reach-access.tsx:1116-1117`, `person-profile.tsx:450-451`, `roster-row.tsx:535-536,579-580`. Two raw exceptions survive: `party-mini-row.tsx:200` and `add-person-sheet.tsx:1569` (`<option disabled>`), plus the transient in-flight case (CR12-20) |
| `aria-expanded` pairs with a real id | every disclosure in the People room and the Call Sheet pairs `aria-expanded` with `aria-controls` naming a rendered `id`. The two unpaired hits (`letterhead-instruments.tsx:534`, `piece-room.tsx:1528`) are pre-existing and outside this wave's edits to those files |
| `<a>` inside `<button>` | none. `TelLink` is an `<a>` and is always a sibling (`person-row.tsx:227-229`, `roster-row.tsx:398-400`) |
| One live region | the People room has exactly one `role="status" aria-live="polite"` (`people-room.tsx:636`); the Call Sheet one (`call-sheet.tsx:224`); `project-team-roster.tsx` one. Every other new region is a `role="alert"` refusal, the shape r11 deliberately kept |
| Analytics only via `people-events.ts` | yes — `posthog.capture` appears once, inside `people-events.ts:25`. No inline capture on any surface |
| No ad-hoc fetch to a service | one `fetch`, to the portal's own `/api/people/chase-renewal` route (`compliance-chase.ts:47`), which exists because `enqueue_agent_task` is not granted to `authenticated`. Not a NestJS service call |
| Types imported, not redefined | `PartyKind`, `FieldTrade`, `AuthorityScope`, `ReachState`, `StateWordFamily` all imported from `@patina/types`; `coordination/party.ts` now imports `PartyKind` instead of keeping its own copy |
| Schema words on a face | scripted scan of JSX text nodes and of string literals in `people/` + `roster/` for `client_rep`, `party_kind`, `sms_consent_status`, `studio_contact_id`, `project_parties`, `not_asked`, `opted_out`, `off_job`, `lapses_soon`, `not_on_file`, and for CRM / dashboard / wizard / badge / pill / modal / toast / spinner: **no hits** |
| Canonical keys and fan-out | see §2 |

---

## 2. Keys and invalidations

`peopleKeys` (`['people-directory']`), `peopleSeatKeys` (`['people-directory-seats']`),
`consentKeys` (`['channel-consent']`), `accessGrantKeys` (`['access-grants']`),
`siteAccessKeys`, `partyAuthorityKeys`, `complianceKeys`, `studioChannelKeys`,
`contactRuleKeys`, `affiliationKeys`, `studioContactKeys` — every detail key nests under its
own list root, so a root invalidation reaches it. `projectAuthorityKeys.project` nests under
`partyAuthorityKeys.all` deliberately (`use-project-authority.ts:24-27`).

Every mutation this wave added or changed fans out:

| Mutation | Invalidates |
|---|---|
| `useAddProjectParty` | `project-parties/<p>`, `project-roster/<p>`, `peopleKeys.all`, `peopleSeatKeys.all`, `consentKeys.all` |
| `useUpdateProjectParty` · `useCloseProjectPartySeat` · `useRemoveProjectParty` | `project-parties/<p>`, `project-roster/<p>`, `peopleKeys.all`, `peopleSeatKeys.all` |
| `useRecordPartySmsConsent` | the four above + `['channel-consent']` |
| `useSetPartyAuthority` | `partyAuthorityKeys.all` (which is what reaches `useProjectAuthority`), `project-parties/<p>`, `project-roster/<p>`, `peopleSeatKeys.all` |
| `useUpdateSiteAccessCard` · `useLogSiteAccessTold` | `siteAccessKeys.detail(projectId)` |
| `useRecordChannelConsent` / `Invite` / `Reconsent` | `invalidateConsentFanout`: `consentKeys.all`, `peopleKeys.all`, `peopleSeatKeys.all`, and the job's roster + parties when an origin project is named |
| the five `studio_contacts` card mutations | `studioContactKeys.all`, `peopleKeys.all`, `peopleSeatKeys.all` (r11's CR11-7 fix holds) |
| channel add / update / status | `invalidateChannelFanout` — `studioChannelKeys.list + .all`, `studioContactKeys.detail`, `peopleKeys.all`, `peopleSeatKeys.all` |
| rule set / clear | `invalidateRuleFanout` — `contactRuleKeys.all`, `peopleKeys.all`, `peopleSeatKeys.all`, `studioContactKeys.detail` |
| affiliation set / close | `invalidateAffiliationFanout` — plus both cards' details |
| compliance record / confirm | `invalidateComplianceFanout` — `complianceKeys.all`, `studioContactKeys.detail`, `peopleKeys.all`, `peopleSeatKeys.all` |
| `useRevokeAccessGrant` | `accessGrantKeys.all`, people-directory, people-directory-seats, project-roster, `partySmsKeys.all` (r11's CR11-8 fix holds) |
| `useCreateFieldLink` / `useRevokeFieldLink` | `partySmsKeys.links`, access-grants, both directories, `project-roster/<p>` (r11's CR11-9 fix holds) |

Two style notes, not defects: `use-access-grants.ts:305-307` and `use-party-sms.ts:169-172` still
spell `['people-directory']` / `['people-directory-seats']` / `['project-roster']` as raw literals
where `peopleKeys.all` / `peopleSeatKeys.all` now exist (CR12-24), and two query roots still sit
outside any keys object (CR12-22).

---

## 3. Round 11, re-checked at this HEAD

All thirteen of `w2-fix-log-r11.md`'s assignments verified **FIXED**:

| id | Verified at |
|---|---|
| QA-R11-1 | `reach-access.tsx:546-565,1110-1122` (`mintSeatId` props, `held={!mintSeatId}`, `MINT_CLIENT_SIDE_SENTENCE`), `person-profile.tsx:409-424` (`mintSeat = textableSeat`, `clientSide`) |
| CR11-1 | `librarian-bar.tsx:32` is an `<h2>`; `library/judgments/page.tsx` no longer carries the `sr-only` `<h1>` |
| CR11-2 | `people-room.tsx:145-148` `directoryIdentityCount`, passed to both the compact selector (`:551`) and the rail (`:568`) |
| CR11-3 | `person-profile.tsx:255-264` `projectCount` over distinct `seats[].project_id`; real singular/plural at `:576-578` |
| CR11-4 | `companyKindProseWord` in `people-derivation.ts`; `company-card.tsx:149-150` pushes `${trade} ${prose}` |
| CR11-5 | `chaseTargetDocument` / `chaseDocumentPhrase` (`compliance-table.tsx:98-129`), wired at `company-card.tsx:833-838`; idempotency key now names the document |
| CR11-6 | `roster-row.tsx:681-683` and `notice-log.tsx:139` both gate `aria-describedby` |
| CR11-7 | `peopleSeatKeys.all` at all five card mutations; raw `['people-directory']` replaced by `peopleKeys.all` there |
| CR11-8 | `partySmsKeys.all = ['field-links']`, invalidated by `useRevokeAccessGrant` (`use-access-grants.ts:311`) |
| CR11-9 | `party-profile-sheet.tsx` mint now passes `projectId: seatProjectId` |
| CR11-10 | one standing `role="status"` per surface (`people-room.tsx:636`, `call-sheet.tsx:224`, `project-team-roster.tsx:105`); the bands are paper (`data-directory-notice`, `data-call-sheet-added`, `data-roster-row-note`); `room-shell.tsx` veil demoted; picker refusal is `role="alert"` |
| CR11-11 | `add-person-sheet.tsx:490-495` — `isOrgAdmin` reads the role on `recordedStudioId`, `false` with none |
| CR11-12 | `company-card.tsx:505-508` `crewHoldsASeat` gates `NO_JOBS_SENTENCE` |

CR11-13 … CR11-61 were **not assigned** in round 11 and every one is re-verified **OPEN** below
(CR12-4 … CR12-49), with its line number checked at this HEAD.

---

## 4. Findings

### CR12-1 · MAJOR · high confidence (NEW) — the person card offers "Record consent" on an office landline and on a 311 portal handle, and the write lands on the number the Directory row reduces over

`reach-access.tsx:186-188`:

```ts
const consentKind = isPhoneChannel(String(channel.channel_kind)) ? "sms" : "email";
```

`PHONE_KINDS` (`:96-101`) is `mobile | office | dispatch | after_hours`. Every other stored kind —
`email`, `ap_email`, `portal_311` — falls to `"email"`. `ReachAccess` renders **every** channel on
the card (`useStudioContactChannels` filters on `owner_id` only, `use-studio-contacts.ts:695-698`)
and passes `showConsent={isPerson}` to each one (`reach-access.tsx:888`), so on a person card the
consent word and the "Record consent" disclosure print on every row whatever the line is.

`PERSON_CHANNEL_KINDS` (`use-studio-contacts.ts:604-607`) narrows only the ADD form to
`mobile | email`. The rows already on file are not narrowed, and the local seed has ten of them:

```
$ psql … -c "select c.owner_type, sc.full_name, c.channel_kind, c.value
             from studio_contact_channels c join studio_contacts sc on sc.id=c.owner_id
             where c.owner_type='person' and c.channel_kind not in ('mobile','email')"
 person | Claire Bissett   | office     | +16125550120
 person | Dale Whitcomb    | office     | +16125550103
 person | Frank Bauer      | office     | +16125550115
 person | Ingrid Halvorsen | office     | +16125550113
 person | Jim Lindgren     | office     | +16125550117
 person | Jonah Feld       | office     | +16125550125
 person | Marcus Hale      | office     | +16125550121
 person | Ray Thao         | office     | +16125550127
 person | Ray Thao         | portal_311 | minneapolis-311
 person | Rosa Delgado     | office     | +16125550114
(10 rows)
```

Two consequences, both reachable in two clicks from a Directory row:

1. **An SMS grant lands on a landline, and it is the number the row's word is made of.** Each
   office channel's `value` is byte-identical to the card's `phone_e164`
   (`Ray Thao | (612) 555-0127 | +16125550127`). `identity_consent_status`
   (`00626:1235-1248`) reduces `channel_consent_status(org,'sms',n)` over
   `identity_phone_numbers()` — the card's `phone_e164` plus every seat's. So pressing
   **"Put it on the books"** on Ray Thao's **office** row writes
   `record_channel_consent(org,'sms','+16125550127','granted',…)` and his Directory row, his seat
   line and his Call Sheet row then print consent `Texting` (`--sage`) — for a municipal desk
   phone, on a person whose own rule clause three lines above reads
   *"Never text. Office phone or the 311 portal only."* That is a wrong fact on a face, and it is
   the exact face/ledger contradiction R-Q and R-BB exist to prevent.
2. **A portal handle is written into the consent ledger as an EMAIL record.**
   `normalize_channel_value` keeps a `portal_311` value verbatim (`00593:174-175`) and
   `record_channel_consent` normalises with the kind it is HANDED, not the channel's own
   (`00594:1702`), so the row lands as
   `studio_channel_consent(channel_kind='email', channel_value='minneapolis-311')` — a consent
   record on a scheduling portal, in the one table R-AY makes the single source of truth.

The write itself goes through `record_channel_consent`, so this is not a consent write outside the
canonical door; what is wrong is the axis the surface chooses and the act it offers.

This is **CR11-60 re-graded and re-scoped**. r10/r11 filed it `medium`, "latent (the company
variant passes `showConsent: false`)". The company variant is not where it bites: it is live on
the PERSON card, on ten seeded rows, and it moves a state word.

**Fix.** `studio_contact_channels.sms_capable` is the column that says whether a line takes a text
(`00593`'s own backfill note says so). Decide the consent axis from it, not from `channel_kind`:
`sms` only for a phone kind with `sms_capable = true`; `email` only for `email` / `ap_email`;
otherwise render no consent word, no consent sentence and no "Record consent" act at all — a
portal handle and a landline are channels the studio reaches somebody on, not channels anybody
can consent to.

---

### CR12-2 · MINOR · medium confidence (NEW, a second axis on CR12-25) — the company card's per-row paper word ignores `blocks[]`; `compliance_state()` does not

`compliance-table.tsx:51-62` calls a document `lapsed` on `expires_on < today` alone.
`compliance_state()` (`00623:658-668`) moves the word off `current` **only** for a document with
`cardinality(d.blocks) > 0` — its own comment states the rule: *"a date with no gate changes
nothing"*. Six seeded documents carry `blocks = {}` (three `license`, one `bond`, two
`coi_gl` on Beck + Rowe). The day one of those expires, its row prints terracotta `Lapsed` on the
company card while the Directory firm row that opened the card prints `Current` — one firm, two
words, one click apart. Not reachable on today's seed (no undated-gate paper has expired yet),
which is why it is minor. Same file, same function as CR12-25's supersession divergence; one fix
serves both — decide the row's word with the same two rules the SQL uses, or read the row state
back from the database.

---

### CR12-3 · MINOR · high confidence (NEW) — `useSiteAccessSummary` calls a hook and then returns early on the caller's behalf

`site-access-card.tsx:79-88`:

```ts
export function useSiteAccessSummary(projectId, rows, authorityBySeat): string {
  const { data: card } = useSiteAccessCard(projectId);
  if (!card) return '';
  return siteAccessSummaryLine({ … });
}
```

The early return is after the only hook, so nothing breaks today. It is still the one shape in
this wave that would break the moment a second hook is added below it, and it is the pattern the
brief's "hooks above early returns" check exists to stop. `call-sheet.tsx:123` is its only caller.
Hoist the `if` into the returned value (`card ? siteAccessSummaryLine(…) : ''`).

---

### CR12-4 … CR12-49 — the carried r11 findings, every one re-verified OPEN at HEAD `c626ef3fe`

Line numbers re-checked here. Grades are r11's; none rose under this brief's rubric.

| id | r11 id | Conf. | Finding, at this HEAD |
|---|---|---|---|
| CR12-4 | CR11-13 | high | `add-person-sheet.tsx:155` offers the door **"a household member"**; `:1067` prints *"Add a **client rep** to a project…"* and `:701` *"A client rep needs a name."*, because `KIND_NOUN[SEAT_PARTY_KIND['household']] = KIND_NOUN.client_rep = "client rep"` (`:136`, `:203`). C5's letter is kept (the underscored string never reaches a face); the door's word and the sheet's word for one thing still differ |
| CR12-5 | CR11-14 | high | `add-person-sheet.tsx:1713-1719` ships *"Adding Joe Wozniak puts **them** on the Okonkwo residence Call Sheet and opens a field link for **their window**."* SPEC §5.5 #13 fixes *"…puts **him** … for **the framing window**."* The trade is two fields above on the same form |
| CR12-6 | CR11-15 | medium | `people-room.tsx:236` lands the chip with `directoryChipFromParam(resolved)`, which knows the six chips and the legacy eleven only; `architect`, `engineer`, `inspector`, `vendor` and plain `contact` fall to `everyone` where `directoryBandOf` would have said Crew or Makers. The comment's promise does not hold for the kinds PR-f widened |
| CR12-7 | CR11-16 | low | `directory-view.tsx:532-536` suppresses a firm's payee marker on `entryPaperWord(row) === null`, which is true both for a firm that owes no paper (right) and for one whose `paper_state` simply did not resolve. Two facts, one gate |
| CR12-8 | CR11-17 | high | `truncate` (`text-overflow: ellipsis`, SPEC §8 #5) at `party-mini-row.tsx:149,153`; also `rolodex-seed-sheet.tsx:80`, `view-shell.tsx:298`. Direction §1 line 9 fixes "rows wrap instead of truncating" |
| CR12-9 | CR11-18 | high | `person-row.tsx:186-188` — the 390 line-2 middle dot between reach and consent is unconditional while the paper dot beside it IS gated (`:190`). `StateWord` renders `null` for a value naming no word, and `consent_status` is NULL wherever the studio holds no record, so those rows print "ACCOUNT · · NOT ON FILE" — or open with a bare dot when `reach_state` is null too |
| CR12-10 | CR11-19 | medium | `seat-line.tsx:69-71` prints `getPartyKindLabel` / `getFieldTradeLabel` — the Title-Case column vocabulary — so the line reads "Okonkwo residence · Subcontractor · Electrical · ON THE JOB · …" where SPEC §5.1 #8 fixes "… · sub · electrical · On the job · …". `person-profile.tsx:502-507` (Past seats) carries the same pair; `personIdentityLine` lowercases the same trade on purpose |
| CR12-11 | CR11-20 | medium | `site-access-card.tsx:365-370` passes `fullWidth` with no width branch, so the whole who-to-call line is the `tel:` target at 1440 too, where SPEC §6.2 / R-X fix "the whole line at 390, only the digits at 1440". The accessible name also doubles the name — `TelLink` composes `Call ${personName}, ${text}` over a `text` that already opens with it (`:355-358`) |
| CR12-12 | CR11-21 | medium | `directory-view.tsx:476-503` — the duplicate band prints the sentence then two name buttons separated by a bare space: "These two cards share a phone. Adaeze Okonkwo Chidi Okonkwo". Structurally right per R-Y; as prose it reads as one four-word name |
| CR12-13 | CR11-22 | low | `use-studio-contacts.ts:1101-1120` — `useClearContactRule` HARD-DELETES the `studio_contact_rules` row, destroying `set_by` / `set_at` / `reason`, where every other retirement this wave added is dated. No caller today |
| CR12-14 | CR11-23 | high | `person-profile.tsx:580-583` — History prints `formatSeatDate` (short): "Last touch 17 Oct 2026." SPEC §5.2 #10 fixes "Last touch 17 October 2026." `formatLongDate` is imported in the same tree |
| CR12-15 | CR11-27 | high | `command-bar.test.tsx:65` still mocks a `call-sheet` FLAG (`mockCallSheetFlag`), and `__tests__/call-sheet-doorways.test.tsx:92` carries it too; `command-bar.tsx` reads no such flag. Dead scaffolding around a retired flag |
| CR12-16 | CR11-24 | medium | `placeholder=` survives at `rolodex-picker.tsx:359,542` and `party-profile-sheet.tsx:947`; direction §5.4's Editing state is "label always visible, no `placeholder`". The Add sheet itself is clean |
| CR12-17 | CR11-25 | medium | `party-profile-sheet.tsx:558` — `projectId: linkedParty?.project_id ?? seatProjectId ?? ''`. The empty string reaches `project_consent_org(p_project_id := '')` → raw `22P02 invalid input syntax for type uuid` in the error slot, where the hook's own written sentence exists for exactly that case |
| CR12-18 | CR11-26 | medium | `people-room.tsx:128` reads `usePeopleDirectory({ role:'all' })` UNSCOPED for the head count while `directory-view.tsx:143-146` reads `{ scope: scope === 'mine' ? 'mine' : undefined }` for the list, so MINE narrows the list and not the head. May be intended (direction §3.1 makes the head a count of cards) — a ruling, not necessarily a fix |
| CR12-19 | CR11-28 | high | Four dead `useFeatureFlag` imports, referenced nowhere in their own file after the flag came out: `mobile/mobile-bar.tsx:20`, `mobile/mobile-sheets.tsx:54`, `letterhead-instruments.tsx:31`, `coordination/item-composer.tsx:48` |
| CR12-20 | CR11-31 | low | Three acts emit a real `disabled` while their mutation is in flight (`DocumentAction` computes `unavailable = disabled \|\| loading` and emits `disabled={unavailable && !held}`): `roster-row.tsx:679-681` (Send, once a body is typed), `notice-log.tsx:138-139`, `rolodex-picker.tsx:600`. `party-mini-row.tsx:196-203` is a raw `<button disabled={disabled} className="… disabled:opacity-50 …">` — the attribute AND opacity-as-state, both named forbidden (SPEC §7 #4, §8 #5) |
| CR12-21 | CR11-30 | low | The Add sheet's door reads "a household member", writes `party_kind: 'client_rep'`, and every seat line prints `PARTY_KIND_LABELS.client_rep` = **"Client Rep"**. Same fact as CR12-4, at the seat line |
| CR12-22 | CR11-29 | low | Two query roots outside any keys object, invalidated by nothing: `use-coordination.ts:2148` `['project-recorded-studio', projectId]`, `use-consent.ts:381` `['project-consent-org', projectId]` |
| CR12-23 | CR11-33 | medium | `--color-linen` is defined nowhere in `apps` or `packages` and is spent at `party-profile-sheet.tsx:914`, `add-person-sheet.tsx:1648`, `directory/letter-line-field.tsx:191`, always `bg-[var(--color-linen)]/45` with no fallback. Pre-existing on `origin/main`. The only undefined-and-unfallbacked custom property in the changed set |
| CR12-24 | — | low (NEW, style) | `use-access-grants.ts:305-307` and `use-party-sms.ts:169-172` still invalidate with raw `['people-directory']` / `['people-directory-seats']` / `['project-roster']` literals where `peopleKeys.all` / `peopleSeatKeys.all` exist and are imported elsewhere in the same package. Functionally identical; r11 canonicalised the same literals in `use-studio-contacts.ts` and left these |
| CR12-25 | CR11-45 | medium | Two reducers decide one paper fact and disagree on supersession. The firm row and the seat line print `compliance_state()` / `identity_paper_state()`, which reckon supersession transitively (R-BF); the company card's table decides each row in the browser with `documentPaperState` (`compliance-table.tsx:51-62`) over a set `useComplianceDocuments` filtered with a flat `.is('superseded_by', null)` (`use-studio-contacts.ts:1418`). `paperHeldClause` reads that same filtered list |
| CR12-26 | CR11-32 | low | `add-person-sheet.tsx:1569` — `disabled` on an `<option>`, which has no `aria-disabled` equivalent |
| CR12-27 | CR11-34 | low | `person-profile.tsx` renders no "Edit identity" and no "Archive", which direction §3.2 R1 names as the card's two tertiary controls. SPEC §5.2's acceptance list does not require them |
| CR12-28 | CR11-35 | high | `person-row.tsx:62-68` exports `openPersonLabel`; nothing imports it (grep: one hit, its own definition). The rendered control (`:157-164`) carries the bare `display_name`, where SPEC §7 #6 asks for "the person's name and role summary only" |
| CR12-29 | CR11-36 | medium | `use-coordination.ts:936-946` — the hard-delete guard asks `studio_compliance_documents WHERE holder_id = <the card>` while the face refuses on `identity_paper_state(card, COALESCE(seat.company_id, card.company_id))` (R-BA/R-BJ). An RLS-refused read returns `[]` rather than raising, so the guard reads "no paper held". The face holds the act first, which is why this is not higher |
| CR12-30 | CR11-37 | medium | R-BD retires `project_consent_org()` from guards and reducers; five portal call sites survive — `use-coordination.ts:492,673,770,913` (the last inside the hard-delete guard, where a NULL org silently sets `hasConsentRecord = false`) and `useProjectConsentOrg` (`use-consent.ts:387`), consumed by `call-sheet.tsx:109` and `project-team-roster.tsx:52`. `00624:84` says the LEDGER side still resolves that way, so this may be correct by construction — a ruling is owed on the guard |
| CR12-31 | CR11-38 | low | Two dead ternaries with the same string on both branches: `add-person-sheet.tsx:1714-1716` (`partyName.trim() ? "them" : "them"`) survives; `person-profile.tsx`'s was fixed by CR11-3 |
| CR12-32 | CR11-56 | low | `roster-row.tsx:210` (`doc.expires_on < new Date().toISOString().slice(0,10)`) and `:299` (`grantWindowEnd(row.onSiteTo, row.warrantyUntil, new Date())`) read the clock during render, against the room's own convention (`people-room.tsx:148`, `company-card.tsx`, `person-profile.tsx:169`, all `useMemo(() => new Date(), [])`) |
| CR12-33 | CR11-39 | medium | `company-card.tsx:880-884` — `Remit to {card.remit_to ?? name}` asserts a payee the studio may never have written, on the one region direction §1 line 5 makes this card the sole writer of. On the local seed `remit_to` is NULL for Northgate Electric, so the card asserts "Remit to Northgate Electric" from nothing. Every other absent record in this build prints its own sentence |
| CR12-34 | CR11-40 | high | `reach-access.tsx:1105-1109` renders `<p id={mintBandId}>` and no `aria-describedby` names it (the mint act points at `mintReasonId`, `:1118`). `site-access-card.tsx:413`, `:578`, and `panelId="site-access-notice-log"` (`:674`) hardcode ids where every other disclosure in this wave uses `useId()` |
| CR12-35 | CR11-41 | low | `compliance-table.tsx:56-57` compares `Date.parse(\`${doc.expires_on}T00:00:00Z\`)` against `today.toISOString().slice(0,10)`. West of UTC `toISOString()` rolls to tomorrow after 18:00 local, so a certificate expiring today reads `lapsed` from six in the evening. `people-format.ts` and `seat-line.ts` both parse by parts and say why |
| CR12-36 | CR11-42 | low | Two `authorityPhrase` implementations. `roster-derivation.ts` joins with `". "`, appends a final stop and rounds the figure (`Math.round(cents/100)`); `person-profile.tsx:120-131` returns each phrase bare, the caller joins with `" · "` (`:149`), and the figure comes from `formatMoneyFromCents`. One grant reads "Selections." on the Call Sheet and "Selections" on the person card; a $2,500.50 threshold reads "$2,501" on one and "$2,500.50" on the other |
| CR12-37 | CR11-43 | low | `company-card.tsx:166` spells the warranty long — `formatLongDate` → "warranty through 21 November 2026" — where SPEC §5.3 #1 fixes "warranty through 21 Nov 2026", and R-U's fold and every seat line use the short form |
| CR12-38 | CR11-44 | low | `use-people.ts:266-275`'s in-memory search matches name, email and phone digits only, while direction §3.1 also names firm and trade. The Directory uses `directoryEntryMatches`, which matches both, so the command bar finds fewer people than the room does for the same string |
| CR12-39 | CR11-46 | low | `person-profile.tsx:402-405` renders `<h3>Reach &amp; access</h3>`, then `ReachAccess` renders `<h3>Channels</h3>`, `<h3>Contact rule</h3>` and `<h3>Access grants</h3>` (`reach-access.tsx:868,985,1074`). SPEC §5.2 #2 calls these three "sub-heads"; by ear they read as four peers. No heading level is skipped |
| CR12-40 | CR11-47 | low | `seat-line.tsx:92` — `py-[6px]` around an 11px span, roughly 28px tall, where every other control in the room carries `min-h-11`. R-AA makes the seat line a door, and the Directory row, the person card and the company card all mount it |
| CR12-41 | CR11-48 | low | `notice-log.tsx:76-101` renders a list of `role="checkbox"` buttons with no `role="group"` and no group label, unlike every chip row in the room (SPEC §7 #7) |
| CR12-42 | CR11-49 | medium | `site-access-card.tsx:161-176` — `EditableLine`'s collapsed act is a tertiary whose only text is **`Edit`**, mounted three times ("The way in", "Hours", "Receiving"). Three controls, one accessible name. The SAVE row already composes `Save ${label.toLowerCase()}` at `:127` |
| CR12-43 | CR11-50 | medium | `use-studio-contacts.ts:461` keys `useStudioContactHistory` at `['studio-contact-history', ids]`, outside `studioContactKeys`, and nothing invalidates it — while `useAddProjectParty`, `useCloseProjectPartySeat`, `useRemoveProjectParty` and `usePromoteToStudioContact` all move the `project_parties` rows it counts for the picker's history line |
| CR12-44 | CR11-51 | high | Three docblocks describe behaviour the code no longer has: `contact-rule-line.tsx:10-12` ("A HARD BLOCK — a rule that forbids a channel outright") gives the pre-R-BL reading, which `contactRuleIsHardBlock` (`contact-rule.ts:111-115`) contradicts; `contact-rule.ts:99-103` still says "Two rows (F-10 Sam Rowe, F-13 Ingrid Halvorsen) therefore wear a rule the fixture marks `false`", which the shipped predicate makes false for both; `people-events.ts:4` says "Eight events" where `PEOPLE_EVENT_NAMES` defines nine |
| CR12-45 | CR11-52 | low | `rolodex-picker.tsx:577` renders `{stamp ? '✓' : ''}` — a ✓ glyph, which SPEC §8 #5 names forbidden and §5.7 #4 repeats. `coordination/item-composer.tsx:900` carries a second. Pre-existing |
| CR12-46 | CR11-53 | high | `w2b-report.md` §2's strings table quotes an Add-sheet line the code does not ship. The shipped line is `{partyName.trim() \|\| "They"} is invited, not consenting. Patina has not sent them anything yet.` (`add-person-sheet.tsx:1705-1708`) — the CORRECT wording since R-AS retired the seat-side dispatch. One line in the report |
| CR12-47 | CR11-54 | high | `PARTY_KINDS_OWING_NO_PAPER` exempts exactly `inspector`, `lender`, `authority` (`field-config.ts:296-302`), so the studio's OWN principal, lead designer and bookkeeper, and both homeowners, print `Not on file` in the paper column of the studio's own ledger (`entryPaperWord`, `people-derivation.ts:1337-1339`). C13/C24/R-A's reasoning applies verbatim. **Needs a ruling**, not a code change |
| CR12-48 | CR11-55 | medium | `use-call-sheet-roster.ts` / `use-project-authority.ts` still live under `components/document/roster` rather than beside `usePartyAuthority` in `@patina/supabase`, and `people/compliance-chase.ts` likewise. Each says so in its own docblock and names the orchestrator. The key nesting is correct |
| CR12-49 | CR11-61 | low | `rolodex-picker.tsx:453` renders the picker's ERROR string in `role="status"`… **FIXED in r11** (`role="alert"` at `:453`). Recorded here only so the r11 list closes cleanly |

### Seed / fixture divergence — the SHIPPED face is what differs (W1 scope, re-verified this round)

| id | r11 id | Conf. | Fact |
|---|---|---|---|
| CR12-50 | CR11-57 | high | `studio_contact_channels` marks Dana Kowalski's email **`dead`**, not `bounced`, so the person card prints `heldChannelReason`'s "This line is dead." where SPEC §5.2 #3 fixes "This address bounced back, 12 March 2026. Texts and calls still reach them." One `status` value in the seed |
| CR12-51 | CR11-58 | high | Adaeze Okonkwo reads `reach_state = on_paper`, `consent_status = not_asked` in the local `people_directory`, where fixture F-04 and SPEC §5.4 #5 give her reach `Account` and consent `Texting`. Leah task 2's own subject |
| CR12-52 | CR11-59 | low | The seed spells "Carol Nyström"; SPEC §3's fixture spells "Carol Nystrom" |
| CR12-53 | QA-R11-2 / QA-5 | high | `studio_contacts` for Northgate Electric carries `warranty_until = NULL`, `tax_id_last4 = NULL` and `remit_to = NULL`, so the company card prints neither "· warranty through 21 Nov 2026" (SPEC §5.3 #1) nor "Tax id ending 4417" (§5.3 #6), and its "Remit to …" line is CR12-33's assertion from nothing. Verified: `select company_name, warranty_until, tax_id_last4, remit_to from studio_contacts where company_name='Northgate Electric'` → three NULLs |
| CR12-54 | — | medium (NEW) | The seed gives Northgate Electric three compliance documents (`coi_gl`, `license`, `w9`); SPEC §5.3 #3's acceptance table names **four**, the fourth being "COI workers compensation (`Not on file`, blocks site access, draw)". The card renders what the record holds, correctly; the record is a row short of the fixture |
| CR12-55 | QA-R11-5 | medium (NEW evidence) | SPEC §5.1 #17's duplicate band cannot fire on the seed: `select full_name, phone_e164 from studio_contacts where entity_kind='person' and phone_e164 in (…having count(*)>1)` returns **0 rows**. `directoryDuplicatePairs` (`people-derivation.ts:1352`) is real and tested; Adaeze and Chidi Okonkwo carry `+16125550104` and `+16125550105`, so nothing collides and the band never renders in the shipped room. r11 left this "unverified live"; it is now verified absent |

---

## 5. Settled — checked and deliberately NOT reported as findings

- Every ruling in `rulings.md` §3 (R-A … R-BM). In particular: R-AB (inert specimen acts), R-BL
  (Ray Thao is not a hard block, so SPEC §5.1 #11's "with the leading rule" does not apply to the
  shipped row), R-BM (the bring-forward travel-list picker is W3), R-B / CR9-3 (the company card's
  money-book line is a sentence, not a door), R-X (the 390 site-access tap target).
- Everything the wave reports scope to W3/W4: the record-side opt-in dispatch (w2a §6 #1), the
  `party_kind` CHECK widening (w2a §6 #2), `inspector_subtype`'s column (w2a §6 #3), the household
  object (w2b §6 #3), the bid note's columns (w2c §4 #2), the "who was told" change-log table
  (w2c §4 #3), the travel-list pane (w2c §4 #6), Leah task 5's e2e (w2c §4 #7).
- `usePerson` not being renamed (w2a §6 #4): R-BE's three substantive rules are delivered through
  `usePersonSeat`, and the party sheet reads it (`party-profile-sheet.tsx:202,309`).
- The party sheet's body still reading `usePerson` (w2a §6 #5 / w2b §6 #1) — declared, W2c-adjacent.
- `deriveStatusDot` surviving in `people-derivation.ts` for `deriveNurtureQueue` (w2b §4): the
  COMPONENT is deleted and no surface renders a dot.

---

## 6. What this review did not cover

The visual and behavioural walk at 1440 and 390 (`document.documentElement.scrollWidth` was not
measured — the QA reviewer owns 3000/3002), the Playwright specs under `e2e/people` (not run, no
port taken, no dev server started), the iOS surfaces under `apps/mobile/Capture`, the W1
migrations except where a reader's contract had to be checked against them (00593, 00594, 00623,
00625, 00626), and the Sanity help articles. Database evidence above is read-only `psql` against
`postgresql://postgres:postgres@127.0.0.1:54322/postgres`; `people_directory` itself returns 0 rows
to `postgres` because it is `security_invoker` with no `auth.uid()`, so its per-row facts are cited
from prior rounds' authenticated evidence and marked as such.

Nothing was written to any database. Nothing was pushed to Strata. No prod surface was touched.
