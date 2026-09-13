# W2 — adversarial code review, round 13

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`, branch
`build/people-room-crm-2026-09-11`, HEAD **`4788522b4`** ("fix(people-room): W2 round-12 findings").

Read: `rulings.md` (all, §3 through R-BM), `synthesis/direction.md` §1–§6 + §3.9,
`specimens/SPEC.md` §3, §5, §6, §7, §8, `w2a/w2b/w2c-report.md`, `w1a/w1b-report.md`,
`w2-review-r12-code.md`, `w2-fix-log-r12.md`, `w2-review-r5-code.md` / `w2-fix-log-r5.md`.

Diff read against `origin/main` for every changed file under `apps/designer-portal/src`,
`packages/supabase/src/hooks`, `packages/types/src` — 109 files, 25 369 insertions.

---

## 0. Gates, run here at this HEAD

```
$ cd apps/designer-portal && npx tsc --noEmit
DESIGNER_TC_EXIT=0

$ cd packages/supabase && npx tsc --noEmit
SUPABASE_TC_EXIT=0

$ cd apps/designer-portal && npx jest
Test Suites: 585 passed, 585 total
Tests:       7514 passed, 7514 total
Snapshots:   1 passed, 1 total
Time:        31.567 s
Ran all test suites.

$ cd packages/supabase && npx vitest run
 Test Files  103 passed (103)
      Tests  1297 passed | 12 skipped (1309)
   Duration  8.62s

$ cd apps/admin-portal && npx next build --webpack     # owed: @patina/types + @patina/supabase changed
… 137 routes, ƒ Proxy (Middleware)
[exited with code 0]
```

All four green. (Unlike round 12, the admin build completed inside this session's Bash sandbox.)

**Dist packages**: `@patina/types`, `utils`, `api-routes`, `help-system` all built 13 Sep 07:34;
`api-client` 13 Sep 13:47. `find packages/<p>/src -newer packages/<p>/dist/index.js` returns nothing
for every one. `packages/types/dist/studio-config.js` carries `resolveStateWord`;
`packages/types/dist/field-config.js` carries `partyKindOwesPaper`. No dist is stale.

---

## 1. The mechanical checks the brief names

| Check | Result at `4788522b4` |
|---|---|
| `useFeatureFlag('call-sheet')` anywhere in `apps` / `packages` | **none**. Surviving `'call-sheet'` strings are the registry's SURFACE key (`registry.tsx:236`, `ticket-derivation.ts:80,740`, `call-sheet-doorways.test.tsx:190,207`) — a different vocabulary. Two dead test mocks survive (CR13-18) |
| Dead flag-off branches | none. `desk/page.tsx`, `doc/[id]/page.tsx`, `command-bar.tsx`, `letterhead-instruments.tsx`, `mobile-bar.tsx` all read the flag nowhere; `callSheetEnabled` is a literal `true` |
| A portal write to `project_parties.sms_consent_*` | **none**. Every hit under `apps/*/src` + `packages/*/src` is a READ (`roster-derivation.ts:399`, off `v_project_roster`, whose `sms_consent_status` is `channel_consent_status(project_consent_org(...))` — verified live with `pg_get_viewdef`), a FROZEN type declaration (`use-coordination.ts:77-79`, documented), a comment, or a test fixture. No INSERT/UPDATE payload names one |
| Consent writes | only `record_channel_consent` / `record_channel_invite` / `record_channel_reconsent` (`use-consent.ts:297,327,356`, `use-coordination.ts:499`). No other door |
| Hard delete outside the mistaken-add predicate | `useRemoveProjectParty` has one caller, `roster-row.tsx:537-556`, held behind `seatDeleteRefusal` on both the face (`:280-284`) and in the hook (`:934`). `useClearContactRule` still hard-deletes but has no caller (CR13-25) |
| Site access card reaching a client surface | `grep -rn "site_access\|SiteAccess\|siteAccess" apps/client-portal/src` → no hits |
| A site access CODE field | **none**. `00625` has no `gate_code` column; the one free-text field in that region is labelled "Lockbox version" (`site-access-card.tsx:517`) and the sentence beside it reads "The code is held off Patina; ask <gate controller>." No input, no state, no payload key |
| `box-shadow` in changed files | **0** new. Two hits, both pre-existing in `globals.css` (`:360` `--elevation-sheet`, `:1942` print reset), plus one word in a `state-word.tsx` comment |
| Every CSS custom property used is defined | scripted over all changed files: every `var(--…)` resolves in `globals.css` except `--color-linen` (CR13-19, defined nowhere in the repo) and names carrying a literal fallback (`--doc-mobile-bar-height, 72px`, `--ink-x`, `--stagger-index`, `--strata-cycle`) |
| Hooks above early returns | clean in every new surface. `person-profile.tsx` puts both returns (`:281`, `:291`) after all hooks — scripted scan finds exactly one `use*(` below `:282`, `useComplianceDocuments` at `:284`, which is *above* the returns. `company-card.tsx` puts `if (!card)` at `:478` after all of its. One shape violates the rule harmlessly: `useSiteAccessSummary` (CR13-32) |
| Hydration gate | no width-branching JS in any new surface; `roster-row.tsx:233-237` states the rule and renders both phrases with CSS choosing. Three render-time clock reads survive (CR13-33) |
| `disabled` attribute vs `aria-disabled` | every `DocumentAction` that passes `disabled` also passes `held`, except in flight (CR13-15). Two raw exceptions: `party-mini-row.tsx:196-203` and `add-person-sheet.tsx:1569` (`<option disabled>`) |
| `aria-expanded` pairs with a real id | scripted over all 17 hits in `people/` + `roster/`: every one carries `aria-controls` within three lines and every target id is rendered. The Add sheet's two authority triggers name the same panel and are mutually exclusive branches |
| `<a>` inside `<button>` | none. `TelLink` is an `<a>` and is always a sibling (`person-row.tsx:229`, `roster-row.tsx:398`, `site-access-card.tsx:365`) |
| One live region | People room one (`people-room.tsx:694`); Call Sheet one (`call-sheet.tsx:223`); `project-team-roster.tsx` one. Every other new region is a `role="alert"` refusal, the shape r11 kept deliberately |
| Analytics only via `people-events.ts` | yes — `posthog.capture` appears exactly once, `people-events.ts:25` |
| No ad-hoc fetch to a service | one `fetch`, to the portal's own `/api/people/chase-renewal` (`compliance-chase.ts:47`), which exists because `enqueue_agent_task` is not granted to `authenticated`. The route proves membership through the caller's own RLS before using the service role |
| Types imported, not redefined | `PartyKind`, `FieldTrade`, `AuthorityScope`, `ReachState`, `StateWordFamily`, `ContactScope` all from `@patina/types`; `coordination/party.ts` imports `PartyKind` rather than keeping a copy |
| Schema words / forbidden words on a face | scripted scan of JSX text nodes in `people/` + `roster/` for `client_rep`, `party_kind`, `sms_consent_status`, `studio_contact_id`, `project_parties`, `not_asked`, `opted_out`, `off_job`, `lapses_soon`, `not_on_file`, and for CRM / dashboard / wizard / badge / pill / modal / toast / spinner: **no hits**. (The Title-Case *labels* `Subcontractor` / `Client Rep` do reach a face — CR13-3 — but the underscored strings do not) |
| Canonical keys and fan-out | §2 |

---

## 2. Keys and invalidations

Roots: `peopleKeys` `['people-directory']`, `peopleSeatKeys` `['people-directory-seats']`,
`consentKeys` `['channel-consent']`, `accessGrantKeys`, `siteAccessKeys`, `partyAuthorityKeys`,
`complianceKeys`, `studioChannelKeys`, `contactRuleKeys`, `affiliationKeys`, `studioContactKeys`.
Every detail key nests under its own list root; `projectAuthorityKeys.project` nests under
`partyAuthorityKeys.all` deliberately (`use-project-authority.ts:24-27`), and
`useChannelConsentRecords`' list key nests under `consentKeys.all` (`use-consent.ts:247`).

Re-verified this round: the eleven fan-outs r12 tabulated all still hold, including r11's three fixes
(`peopleSeatKeys.all` at all five card mutations, `partySmsKeys.all` on `useRevokeAccessGrant`,
`projectId` on the party sheet's mint). Two style residues (CR13-43) and two roots outside any keys
object (CR13-29) survive. One real gap survives: `useStudioContactHistory` (CR13-30).

---

## 3. Round 12, re-checked at this HEAD

Round 12 assigned two findings. `QA-R12-1` was an environment precondition, not code.

| id | Verdict |
|---|---|
| CR12-1 | **FIXED** — `channelConsentAxis` exists (`reach-access.tsx:128-137`), `consentable` gates all six affordances (`:219`, `:414`, `:462`, `:472`, `:482`, `:490`), `save()` returns on a null axis (`:325`), both RPCs and `peopleEvents.consentRecorded` take `consentAxis`. Verified in the DB that Ray Thao's office row and his `portal_311` row now carry no axis. **But the fix introduced CR13-1 and CR13-2 below.** |

CR12-2 … CR12-55 were **not assigned** in round 12. Every one is re-verified **OPEN** at this HEAD
and carried below with its line number re-checked here.

---

## 4. Findings

### CR13-1 · BLOCKING · high confidence (NEW — regression from round 12's CR12-1 fix)
#### PR-m's manual consent act is unreachable for nine of the twenty seeded person mobiles, and nothing in the build can reopen it

`reach-access.tsx:128-137` decides the consent axis from `sms_capable`:

```ts
export function channelConsentAxis(channel) {
  const kind = String(channel.channel_kind);
  if (isPhoneChannel(kind)) return channel.sms_capable ? "sms" : null;
  return EMAIL_CONSENT_KINDS.has(kind) ? "email" : null;
}
```

`consentable = showConsent && consentAxis !== null` (`:219`) now gates **the whole recording band**,
including the "They told the studio to stop" checkbox (`:553-560`) — the PR-m door.

The rule is right for a landline and a 311 handle. It is wrong for a `mobile` whose `sms_capable`
is `false`, which on this database is nine of twenty person mobiles — 00593's backfill leaves the
column at its `false` default wherever there is no SMS-rail evidence:

```
$ psql … -c "select sc.full_name, c.value from studio_contact_channels c
             join studio_contacts sc on sc.id=c.owner_id
             where c.owner_type='person' and c.channel_kind='mobile' and c.sms_capable = false"
 Adaeze Okonkwo | +16125550104     ← Leah task 2's own subject
 Carol Nyström  | +16125550126
 Chidi Okonkwo  | +16125550105
 Kelly Marsh    | +16125550119
 Leah Hartwell  | +16125550101
 Owen Ashby     | +16125550123
 Priya Natarajan| +16125550102
 Sam Rowe       | +16125550110
 Tom Marrow     | +16125550107
(9 rows)
```

For each of those cards the room now offers **no** "Record consent", **no** "Record a fresh consent",
and **no** manual opt-out. PR-m is a STAND ruling — *"Is 'mark opted out' ever a manual studio act?
Yes, with a source and evidence, for a verbal STOP the studio heard"* — and R-AY makes
`studio_channel_consent` the only place that fact can live. A studio that hears Tom Marrow say
"stop texting me" has nowhere in Patina to write it down.

**And there is no way back.** `sms_capable` has exactly one writer in the whole build —
`reach-access.tsx:847` (`smsCapable: channelKind === "mobile"`) and `add-person-sheet.tsx:833`, both
at INSERT. `useUpdateStudioContactChannel` accepts `smsCapable` (`use-studio-contacts.ts:838`) and
**has no caller anywhere in `apps/*/src` or `packages/*/src`** (grep: two hits, its own definition
and the barrel re-export). Re-adding the same number cannot help either: the unique index raises
23505 and `useAddStudioContactChannel` deliberately *re-reads* the existing row rather than updating
it (`use-studio-contacts.ts:800-820`), so the `false` stands.

The round-12 fix log reported this as "a consequence worth a ruling" and left it. It is not only a
ruling: it is a standing Kody ruling (PR-m) that the shipped room can no longer satisfy for nearly
half the seeded people, including both homeowners and the studio's own principal.

**Fix.** Two halves, either of which closes it; both are better:
1. Keep the axis, but do not let it hide a record the studio already holds — `consentable` should
   also be true when `useChannelConsent` resolves a non-null verdict for that value (see CR13-2).
2. Give the studio the control 00593 anticipated: a "line type unconfirmed" line on the channel row
   with an act that calls the already-written `useUpdateStudioContactChannel({ smsCapable: true })`.

---

### CR13-2 · MAJOR · high confidence (NEW — same root cause as CR13-1)
#### The consent word the Directory, the seat line and the Call Sheet print is invisible on the card that owns the channel, and the card's own "Send a text" still reads it

`identity_consent_status` (00626) reduces `channel_consent_status(org,'sms',n)` over
`identity_phone_numbers()` — the card's `phone_e164` plus every seat's — and **never consults
`sms_capable`** (verified with `pg_get_functiondef`; the function body has no such predicate). So a
record on a number whose channel row is `sms_capable = false` still moves:

* `people_directory.consent_status` → the Directory row's word (`person-row.tsx:190,215`) and the
  clause under it (`directory-view.tsx:521-560` — keyed on `c.phone_e164`, not on the channel);
* `people_directory_seats.consent_status` → the seat line and the party sheet (R-BE);
* `v_project_roster.sms_consent_status` → the Call Sheet row's word and the vitals' "reachable by
  text" count (`roster-derivation.ts:399`);
* `person.consent_status === 'granted'` → the person card's own `canText` (`person-profile.tsx:337`),
  which un-holds **"Send a text"** under the sentence "This sends one text to the number on file."

— while the person card's Channels row for that very number now prints no consent word, no R-Q
sentence, and no door to change it.

It is reachable today, not hypothetically. `useRecordPartySmsConsent` → `record_channel_invite`
(`use-coordination.ts:499`) writes against the seat's `phone_e164` with no channel lookup at all, and
so does `useAddProjectParty`'s "text updates" tick. Add Tom Marrow (`gc`, a field roster kind) to a
second job with the box ticked, or press **Invite to texts** on his seat's party sheet
(`party-profile-sheet.tsx:989`): his Directory row, seat line and Call Sheet row read `Invited`; his
person card's mobile row reads nothing at all. An inbound START then grants, and the card still says
nothing. That is a shipped reader disagreeing with the record, on the surface direction §1 line 4
makes the record's home.

The fix in CR13-1 limb 1 closes this: render the word and the R-Q sentence whenever a record exists,
whatever the axis; gate only the *write* on the axis.

---

### CR13-3 · MAJOR · high confidence (carried CR12-10 / CR12-21, re-verified OPEN)
#### The seat line speaks the column vocabulary, and calls a household member a "Client Rep"

`seat-line.ts:65-73` composes the line from `getPartyKindLabel` / `getFieldTradeLabel`, which are the
Title-Case column heads (`field-config.ts:203-219`: `sub → "Subcontractor"`,
`client_rep → "Client Rep"`, `gc → "General Contractor"`). So the canonical specimen row reads

> Okonkwo residence · Subcontractor · Electrical · ON THE JOB · 12 Oct 2026 to 13 Aug 2027

where SPEC §5.1 #8 fixes "… · sub · electrical · On the job · …". `personIdentityLine` lowercases the
same trade two lines above, so one row prints the trade twice in two cases.

The second half is worse than a style drift. C5 rules **one door, the studio's words**: the Add
sheet's kind switch says "a household member" (`add-person-sheet.tsx:155`), and every seat that door
writes prints "Client Rep" on the Directory seat line, the person card's Seats region and Past seats
(`person-profile.tsx:504`). The face contradicts the door two clicks away.

**Fix.** A seat-line vocabulary in the studio's voice (`sub`, `GC`, `installer`, `receiver`,
`household member`, `client`, `inspector`, …), lower-cased trade, used by `seatLineParts` and by
Past seats. Leave `PARTY_KIND_LABELS` for the column heads it is.

---

### CR13-4 · MAJOR · medium confidence (carried CR12-25 + CR12-2, re-verified OPEN)
#### Two reducers decide one paper fact and disagree twice — on supersession and on `blocks`

`compliance-table.tsx:51-62` decides each row's word in the browser:

```ts
if (!doc.expires_on) return "current";
… if (expires < now) return "lapsed";
```

The firm row, the seat line and the person card's identity fold read `compliance_state()` /
`identity_paper_state()`, which differ on two axes:

1. **Supersession.** R-BF makes `compliance_state` walk `superseded_by` transitively with a depth
   cap. `useComplianceDocuments` filters flat — `query.is('superseded_by', null)`
   (`use-studio-contacts.ts:1436`) — so a paper superseded two links down is still in the browser's
   set, and `paperHeldClause` reads that same filtered list.
2. **`blocks`.** `compliance_state()` (00623:658-668) moves a document off `current` only when
   `cardinality(d.blocks) > 0` — its own comment: *"a date with no gate changes nothing"*. The
   browser ignores `blocks` entirely. Six seeded documents carry `blocks = {}`; the day one of them
   expires, its row prints terracotta `Lapsed` on the company card while the Directory firm row that
   opened that card prints `Current`.

**Fix.** One reducer. Either give `documentPaperState` the same two rules the SQL uses, or read each
row's state back from the database.

---

### CR13-5 · MAJOR · medium confidence (carried CR12-29, re-verified OPEN)
#### The hard-delete guard asks a different question than the face's refusal, and an RLS refusal reads as "no paper held"

`use-coordination.ts:936-946`:

```ts
const { data: docs, error: docsError } = await supabase
  .from('studio_compliance_documents').select('id').eq('holder_id', cardId).limit(1);
hasComplianceDocument = (docs ?? []).length > 0;
```

The face refuses on `row.paper`, which is `identity_paper_state(card, COALESCE(seat.company_id,
card.company_id))` (R-BA / R-BJ) — the person's own paper **and their firm's**. The guard asks only
for the card's own. And a PostgREST read refused by RLS returns `[]`, not an error, so the guard
concludes "no paper" exactly where it can see least. The face holds the act first
(`roster-row.tsx:280-284`), which is the only reason this is not worse.

**Fix.** Ask the database the same question the face asks — `identity_paper_state(...) <>
'not_on_file'` — and treat a read that returns nothing as a refusal, not as an absence.

---

### CR13-6 · MAJOR · high confidence (carried CR12-33 + CR12-53, re-verified OPEN)
#### The Payee region asserts a payee the studio never wrote

`company-card.tsx:880-882`:

```tsx
<p className="t-body-sm text-[var(--ink)]">Remit to {card.remit_to ?? name}</p>
```

On the local seed `remit_to` is NULL for Northgate Electric, so the card asserts "Remit to Northgate
Electric" from nothing — on the one region direction §1 line 5 makes this card the sole writer of,
and the one a bookkeeper reads before cutting a cheque. Every other absent record in this build
prints its own sentence (R-V / C32); this one invents the fact.

**Fix.** `card.remit_to ? "Remit to <x>" : "No remit-to on file."`, with the existing "Edit payee"
act beside it.

---

### CR13-7 · MAJOR · high confidence (carried CR12-4, re-verified OPEN)
#### The Add sheet's door and the Add sheet's own prose name the same thing differently

`add-person-sheet.tsx:155` offers **"a household member"**. `:1067` prints *"Add a **client rep** to a
project…"* and `:701` refuses with *"A **client rep** needs a name."* — both through
`KIND_NOUN[SEAT_PARTY_KIND['household']] = KIND_NOUN.client_rep = "client rep"` (`:136`, `:203`).
C5's letter is kept (the underscored string never reaches a face) and its spirit is not: "one door,
the studio's words."

**Fix.** A `DOOR_NOUN` keyed on the sheet's own `AddedPersonKind`, not on the `PartyKind` it writes.

---

### CR13-8 · MAJOR · medium confidence (NEW)
#### The person card pairs one firm's name with another firm's role and start year

`person-profile.tsx:313-327`:

```ts
const affiliation = affiliations?.[0] ?? null;
const firmName = person.meta?.["company_name"] …
const identityBits = [firmName, `${affiliation.role_at_firm}, since ${sinceYear}`]
```

`useAffiliations` (`use-studio-contacts.ts:1170-1187`) selects with **no `ORDER BY`** — it only
filters `to_date IS NULL`. R-AO makes affiliations N persons × N firms and says the pointer trigger
"opens or closes only the affiliation it names and leaves siblings standing", so two open
affiliations are a supported state (the Add sheet creates the second one when an existing person is
seated under a different firm). The name then comes from `people_directory`'s company pointer while
the role and the year come from whichever row PostgREST happened to return first — SPEC §5.2 #1's
"Northgate Electric · owner-operator, since 2025" becomes "Northgate Electric · office manager, since
2019" with no warning, and it can flip between renders.

Not reachable on today's seed (`select … having count(*) > 1` over open affiliations returns 0 rows),
which is why the confidence is medium rather than high; it is reachable through the room's own Add
sheet. The company card's crew list has the same unordered read.

**Fix.** Order the query (`from_date desc nulls last, id`) and pick the affiliation whose
`company_id` matches the firm the card is naming, rather than `[0]`.

---

### CR13-9 … CR13-48 — the carried findings, every one re-verified OPEN at `4788522b4`

Line numbers re-checked here. Severities are this brief's rubric.

| id | r12 id | Sev. | Conf. | Finding, at this HEAD |
|---|---|---|---|---|
| CR13-9 | CR12-9 | minor | high | `person-row.tsx:186-193` — the 390 line-2 middle dot between reach and consent is unconditional while the paper dot beside it IS gated (`:194`). `StateWord` returns `null` for an unresolvable value (`state-word.tsx:40`), and `people_directory`'s client, lead and vendor legs all select `NULL::text AS consent_status` (verified in `pg_get_viewdef`, lines 25/49/75), so every one of those rows prints a dangling "·" at 390 |
| CR13-10 | CR12-28 | minor | high | `person-row.tsx:62-68` exports `openPersonLabel`; nothing imports it. The rendered control (`:156-163`) carries the bare `display_name`, where SPEC §7 #6 asks for "the person's name and role summary only" |
| CR13-11 | CR12-5 + CR12-31 | minor | high | `add-person-sheet.tsx:1713-1719` ships "Adding Joe Wozniak puts **them** … opens a field link for **their window**." SPEC §5.5 #13 fixes "…puts **him** … for **the framing window**." The trade is two fields above on the same form. The line also carries a dead ternary, `partyName.trim() ? "them" : "them"` |
| CR13-12 | CR12-14 | minor | high | `person-profile.tsx:578-582` — History prints `formatSeatDate` (short): "Last touch 17 Oct 2026." SPEC §5.2 #10 fixes "Last touch 17 October 2026, text, logistics." `formatLongDate` is imported in the same tree; the channel and topic have no source in this build |
| CR13-13 | CR12-8 | minor | high | `truncate` (`text-overflow: ellipsis`, SPEC §8 #5) at `party-mini-row.tsx:149,153`, `rolodex-seed-sheet.tsx:80`, `view-shell.tsx:298`. Direction §1 line 9 fixes "rows wrap instead of truncating" |
| CR13-14 | CR12-45 | minor | high | `rolodex-picker.tsx:577` renders `{stamp ? '✓' : ''}` — the glyph SPEC §8 #5 names forbidden and §5.7 #4 repeats. `coordination/item-composer.tsx:900` carries a second. Both pre-existing |
| CR13-15 | CR12-20 | minor | low | `DocumentAction` computes `disabled={unavailable && !held}` (`document-action.tsx:309`), so an act whose `held` has gone false while `loading` is true emits a real `disabled`: `roster-row.tsx:678-681` (Send, once a body is typed), `notice-log.tsx:137-139`, `rolodex-picker.tsx:600-601`, `party-profile-sheet.tsx:801,866,989`. `party-mini-row.tsx:196-203` is worse — a raw `<button disabled={disabled} className="… disabled:opacity-50 …">`, the attribute AND opacity-as-state |
| CR13-16 | CR12-26 | minor | low | `add-person-sheet.tsx:1569` — `disabled` on an `<option>`, which has no `aria-disabled` equivalent. The scope is also refused in `submitParty` (`:890`), so the gate is real; the attribute is the issue |
| CR13-17 | CR12-19 | minor | high | **Five** dead `useFeatureFlag` imports, each the file's only occurrence of the symbol: `mobile/mobile-bar.tsx:20`, `mobile/mobile-sheets.tsx:54`, `letterhead-instruments.tsx:31`, `coordination/item-composer.tsx:48`, `people/party-profile-sheet.tsx:53`. (r12 counted four and missed the party sheet) |
| CR13-18 | CR12-15 | minor | high | `command-bar.test.tsx:65` still mocks a `call-sheet` FLAG (`mockCallSheetFlag`) and `__tests__/call-sheet-doorways.test.tsx:92` carries the same branch; neither component reads a flag any more |
| CR13-19 | CR12-23 | minor | medium | `--color-linen` is defined **nowhere** in `apps` or `packages` (repo-wide grep: three uses, no definition) and is spent at `party-profile-sheet.tsx:914`, `add-person-sheet.tsx:1648`, `directory/letter-line-field.tsx:191`, always `bg-[var(--color-linen)]/45` with no fallback, so those three bands compute to no ground. Pre-existing on `origin/main` |
| CR13-20 | CR12-16 | minor | medium | `placeholder=` survives at `rolodex-picker.tsx:359,544` and `party-profile-sheet.tsx:947`; direction §5.4's Editing state is "label always visible, no `placeholder`". The Add sheet itself is clean |
| CR13-21 | CR12-17 | minor | medium | `party-profile-sheet.tsx:558` — `projectId: linkedParty?.project_id ?? seatProjectId ?? ''`. The empty string reaches `project_consent_org(p_project_id := '')` and surfaces a raw `22P02 invalid input syntax for type uuid` where the hook's own written sentence exists for exactly that case |
| CR13-22 | CR12-18 | minor | medium | `people-room.tsx:128` reads `usePeopleDirectory({ role:'all' })` UNSCOPED for the head count and the rail count, while `directory-view.tsx:143-146` reads `{ scope: scope === 'mine' ? 'mine' : undefined }` for the list — so MINE narrows the list and not the head. Direction §3.1 makes the head a count of cards, so this may be intended. **A ruling, not necessarily a fix** |
| CR13-23 | CR12-6 | minor | medium | `people-room.tsx:236,477` land the chip with `directoryChipFromParam`, which knows the six chips and the legacy eleven only (`directory-roles.ts:104-112`); `architect`, `engineer`, `inspector`, `vendor` and plain `contact` fall to `everyone` where `directoryBandOf` would have said Crew or Makers. The comment's promise does not hold for the kinds PR-f widened |
| CR13-24 | CR12-7 | minor | low | `directory-view.tsx:534-538` suppresses a firm's payee marker on `entryPaperWord(row) === null`, true both for a firm that owes no paper (right) and for one whose `paper_state` simply did not resolve. Two facts, one gate |
| CR13-25 | CR12-13 | minor | low | `use-studio-contacts.ts:1099-1120` — `useClearContactRule` HARD-DELETES the `studio_contact_rules` row, destroying `set_by` / `set_at` / `reason`, where every other retirement this wave added is dated. No caller today |
| CR13-26 | CR12-12 | minor | medium | `directory-view.tsx:473-503` — the duplicate band prints the sentence then two name buttons separated by a bare `{" "}`: "These two cards share a phone. Adaeze Okonkwo Chidi Okonkwo". Structurally right per R-Y; as prose it reads as one four-word name |
| CR13-27 | CR12-11 | minor | medium | `site-access-card.tsx:365-370` passes `fullWidth` with no width branch, so the whole who-to-call line is the `tel:` target at 1440 too, where R-X / SPEC §6.2 fix "the whole line at 390, only the digits at 1440". `TelLink` also composes `Call ${personName}, ${text}` over a `text` that already opens with the name (`tel-link.tsx:92`) |
| CR13-28 | CR12-44 | minor | high | Three docblocks describe behaviour the code no longer has: `contact-rule-line.tsx:10-12` ("A HARD BLOCK — a rule that forbids a channel outright") gives the pre-R-BL reading that `contactRuleIsHardBlock` (`contact-rule.ts:111-115`) contradicts; `contact-rule.ts:95-103` still says "Two rows (F-10 Sam Rowe, F-13 Ingrid Halvorsen) therefore wear a rule the fixture marks `false`", which the shipped predicate makes false for both (verified against the seed: Sam Rowe `forbidden={sms}`, Ingrid `forbidden={sms,mobile}`, neither routed, both leaving a direct channel open); `people-events.ts:4` says "Eight events" where `PEOPLE_EVENT_NAMES` (`:30-40`) defines nine |
| CR13-29 | CR12-22 | minor | low | Two query roots outside any keys object, invalidated by nothing: `use-coordination.ts:2148` `['project-recorded-studio', projectId]`, `use-consent.ts:381` `['project-consent-org', projectId]` |
| CR13-30 | CR12-43 | minor | medium | `use-studio-contacts.ts:461` keys `useStudioContactHistory` at `['studio-contact-history', ids]`, outside `studioContactKeys`, and nothing invalidates it — while `useAddProjectParty`, `useCloseProjectPartySeat`, `useRemoveProjectParty` and `usePromoteToStudioContact` all move the `project_parties` rows it counts for the picker's history line (`rolodex-picker.tsx:228`) |
| CR13-31 | CR12-30 | minor | medium | R-BD retires `project_consent_org()` from guards and reducers; five portal call sites survive — `use-coordination.ts:492,673,770,913` (the last inside the hard-delete guard, where a NULL org silently sets `hasConsentRecord = false`) and `useProjectConsentOrg` (`use-consent.ts:387`), consumed by `call-sheet.tsx:106` and `project-team-roster.tsx:52`. `00624:84` says the LEDGER side still resolves that way, so this may be correct by construction. **A ruling is owed on the guard** |
| CR13-32 | CR12-3 | minor | low | `site-access-card.tsx:79-88` — `useSiteAccessSummary` calls `useSiteAccessCard` and then returns early on the caller's behalf. Harmless today (the return is after the only hook); it is the one shape in this wave that breaks the moment a second hook is added below it |
| CR13-33 | CR12-32 + NEW | minor | low | Render-time clock reads, against the room's own `useMemo(() => new Date(), [])` convention: `roster-row.tsx:210` (`doc.expires_on < new Date().toISOString().slice(0,10)`), `:299` (`grantWindowEnd(..., new Date())`), and **new this round** `company-card.tsx:249`'s default prop `today = new Date()`, which people-room never overrides, so the whole Paper region re-derives against a fresh object on every render |
| CR13-34 | CR12-36 | minor | low | Two `authorityPhrase` implementations. `roster-derivation.ts` joins with `". "`, appends a final stop and rounds the figure (`Math.round(cents/100)`); `person-profile.tsx:120-131` returns each phrase bare and the caller joins with `" · "` (`:149`), with the figure from `formatMoneyFromCents`. One grant reads "Selections." on the Call Sheet and "Selections" on the person card; a $2,500.50 threshold reads "$2,501" on one and "$2,500.50" on the other |
| CR13-35 | CR12-35 | minor | low | `compliance-table.tsx:56-57` compares `Date.parse(\`${doc.expires_on}T00:00:00Z\`)` against `today.toISOString().slice(0,10)`. West of UTC `toISOString()` rolls to tomorrow after 18:00 local, so a certificate expiring today reads `lapsed` from six in the evening. `people-format.ts` and `seat-line.ts` both parse by parts and say why |
| CR13-36 | CR12-37 | minor | low | `company-card.tsx:166` spells the warranty long — `formatLongDate` → "warranty through 21 November 2026" — where SPEC §5.3 #1 fixes "warranty through 21 Nov 2026", and R-U's fold and every seat line use the short form |
| CR13-37 | CR12-38 | minor | low | `use-people.ts:266-275`'s in-memory search matches name, email and phone digits only, while direction §3.1 also names firm and trade. The Directory uses `directoryEntryMatches`, which matches both, so the command bar finds fewer people than the room does for the same string |
| CR13-38 | CR12-39 + NEW | minor | low | `person-profile.tsx:402-405` renders `<h3>Reach &amp; access</h3>`, then `ReachAccess` renders `<h3>Channels</h3>`, `<h3>Contact rule</h3>`, `<h3>Access grants</h3>` (`reach-access.tsx:905,1022,1111`) — four peers where SPEC §5.2 #2 calls three of them "sub-heads". Same on the company card (`:766`). **New this round**: `site-access-card.tsx` opens its six regions at `<h3>` (`:349,506,537,632,646,662`) with no `<h2>` anywhere in the sheet — its own title is a `<p class="font-heading">` (`:285`) — so the heading run skips a level, against SPEC §7 #11 |
| CR13-39 | CR12-40 | minor | low | `seat-line.tsx:92` — `py-[6px]` around an 11px span, roughly 28px tall, where every other control in the room carries `min-h-11`. R-AA makes the seat line a door, and the Directory row, the person card and the company card all mount it |
| CR13-40 | CR12-41 | minor | low | `notice-log.tsx:76-101` renders a `<ul>` of `role="checkbox"` buttons with no `role="group"` and no group label, unlike every chip row in the room (SPEC §7 #7) |
| CR13-41 | CR12-42 | minor | medium | `site-access-card.tsx:161-176` — `EditableLine`'s collapsed act is a tertiary whose only text is **`Edit`**, mounted three times ("The way in", "Hours", "Receiving"). Three controls, one accessible name. The SAVE row already composes `Save ${label.toLowerCase()}` at `:127` |
| CR13-42 | CR12-34 | minor | low | `reach-access.tsx:1143` renders `<p id={mintBandId}>` and no `aria-describedby` names it (the mint act points at `mintReasonId`, `:1155`) — a `useId()` spent on nothing. `site-access-card.tsx:413`, `:578` and `panelId="site-access-notice-log"` (`:674`) hardcode ids where every other disclosure in this wave uses `useId()` |
| CR13-43 | CR12-24 | minor | low | `use-access-grants.ts:305-307` and `use-party-sms.ts:171-175` still invalidate with raw `['people-directory']` / `['people-directory-seats']` / `['project-roster']` literals where `peopleKeys.all` / `peopleSeatKeys.all` exist and are imported elsewhere in the same package. Functionally identical; r11 canonicalised the same literals in `use-studio-contacts.ts` and left these |
| CR13-44 | CR12-27 | minor | low | `person-profile.tsx` renders no "Edit identity" and no "Archive", which direction §3.2 R1 names as the card's two tertiary controls. SPEC §5.2's acceptance list does not require them |
| CR13-45 | CR12-47 | minor | medium | `PARTY_KINDS_OWING_NO_PAPER` exempts exactly `inspector`, `lender`, `authority` (`field-config.ts:296-302`), so the studio's OWN principal, lead designer and bookkeeper, and both homeowners, print `Not on file` in the paper column of the studio's own ledger (`entryPaperWord`, `people-derivation.ts:1337-1339`). C13/C24/R-A's reasoning applies verbatim. **Needs a ruling**, not a code change |
| CR13-46 | — | minor | medium (NEW) | Avatar measures diverge from the spec at three call sites. `Avatar`'s default `size` is 42 (`person-bits.tsx:133`), and `person-row.tsx:154` and `person-profile.tsx:385` both call it with no `size` — so the Directory person row renders a 42px circle where SPEC §6.1's row measure fixes "34px avatar" and direction §4 says "Person circle fixed at 34px in every row context", and the person card header renders 42px where SPEC §5.2 #1 fixes "48px circle". `party-mini-row.tsx:142-147` passes `size={30}` where SPEC §5.7 #4 says "the 34px circle". `roster-row.tsx:335` and `company-row.tsx` are correct (34px circle / 42px square) |
| CR13-47 | CR12-48 | minor | medium | `use-call-sheet-roster.ts` / `use-project-authority.ts` still live under `components/document/roster` rather than beside `usePartyAuthority` in `@patina/supabase`, and `people/compliance-chase.ts` likewise. Each says so in its own docblock and names the orchestrator. The key nesting is correct |
| CR13-48 | CR12-46 | minor | high | `w2b-report.md` §2's strings table quotes an Add-sheet line the code does not ship. The shipped line is `{partyName.trim() \|\| "They"} is invited, not consenting. Patina has not sent them anything yet.` (`add-person-sheet.tsx:1705-1708`) — the CORRECT wording since R-AS retired the seat-side dispatch. One line in the report |

### CR13-49 · MINOR · high confidence — seed / fixture divergence (W1 scope, re-verified)

The SHIPPED face is what differs, and the record is what is short. Carried from CR12-50…CR12-55, all
re-verified against `postgresql://postgres:postgres@127.0.0.1:54322/postgres` this round:

| Fact | Evidence |
|---|---|
| Dana Kowalski's email is `dead`, not `bounced`, so the card prints "This line is dead." where SPEC §5.2 #3 fixes "This address bounced back, 12 March 2026. Texts and calls still reach them." | one `status` value in the seed |
| Adaeze Okonkwo reads `reach_state = on_paper`, `consent_status = not_asked` where F-04 and SPEC §5.4 #5 give her `Account` / `Texting` | Leah task 2's own subject |
| The seed spells "Carol Nyström"; SPEC §3 spells "Carol Nystrom" | `select full_name …` |
| Northgate Electric carries `warranty_until`, `tax_id_last4` and `remit_to` all NULL, so SPEC §5.3 #1's "· warranty through 21 Nov 2026" and §5.3 #6's "Tax id ending 4417" never print — and CR13-6's assertion fires | three NULLs |
| Northgate Electric holds three compliance documents; SPEC §5.3 #3's acceptance table names four (the fourth "COI workers compensation, Not on file, blocks site access, draw") | the card renders what the record holds |
| SPEC §5.1 #17's duplicate band cannot fire: no two person cards share a `phone_e164` (Adaeze `…0104`, Chidi `…0105`) | `directoryDuplicatePairs` is real and tested; nothing collides |

---

## 5. Settled — checked and deliberately NOT reported

- Every ruling in `rulings.md` §3 (R-A … R-BM). In particular R-AB (inert specimen acts), R-BL (Ray
  Thao is not a hard block — verified against the shipped predicate and the seeded rule rows), R-BM
  (the bring-forward travel-list picker is W3), R-B / CR9-3 (the company card's money-book line is a
  sentence, not a door), R-X (the 390 site-access tap target — CR13-27 is the *1440* half of it),
  R-F / C16 (the vitals population unions studio side + client side + this week, which is where the
  literal "12" comes from).
- Everything the wave reports scope to W3/W4: the record-side opt-in dispatch (w2a §6 #1 — "ticking
  text updates records the invite and sends nothing"), the `party_kind` CHECK widening (w2a §6 #2),
  `inspector_subtype`'s column (w2a §6 #3), `usePerson` not being renamed (w2a §6 #4), the party
  sheet's body still reading `usePerson` (w2a §6 #5 / w2b §6 #1), the household object (w2b §6 #3),
  the bid note R-R's columns (w2c §4 #2), the "who was told" change-log table (w2c §4 #3), the picker
  history line's "closed 2025" (w2c §4 #5), the travel-list pane (w2c §4 #6), Leah task 5's e2e
  (w2c §4 #7), `deriveStatusDot` surviving for `deriveNurtureQueue` (w2b §4).
- The `call-sheet` flag's PostHog definition (w2c §4 #10) — the code is clean.

---

## 6. What this review did not cover

The visual and behavioural walk at 1440 and 390 (`document.documentElement.scrollWidth` was not
measured — the QA reviewer owns 3000/3002), the Playwright specs under `e2e/people` (not run; no port
taken, no dev server started), the iOS surfaces under `apps/mobile/Capture`, the W1 migrations except
where a reader's contract had to be checked against them (00593, 00594, 00621, 00622, 00623, 00625,
00626, 00627), and the Sanity help articles. Database evidence above is read-only `psql` against the
local instance; `people_directory` returns 0 rows to `postgres` because it is `security_invoker` with
no `auth.uid()`, so its per-row facts are cited from `pg_get_viewdef` / `pg_get_functiondef` and from
prior rounds' authenticated evidence.

**Nothing was written to any database. Nothing was pushed to Strata. No prod surface was touched. No
server was started.**
