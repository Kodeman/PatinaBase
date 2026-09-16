# W2 review, round 1 — code

Adversarial code review of W2a + W2b + W2c on `build/people-room-crm-2026-09-11`
(worktree `.codex/worktrees/agent-people-build`), against `rulings.md`,
`synthesis/direction.md`, `specimens/SPEC.md` §3/§5/§6/§7/§8, both specimen files,
`build/w1a-report.md` / `w1b-report.md`, and `briefing/current-state.md` §A.

Diff reviewed: `git diff origin/main` over `apps/designer-portal/src`,
`packages/supabase/src/hooks`, `packages/types/src` — 90 files, 15 749 insertions.

**Verdict: NOT CLEAN.** 3 blocking, 23 major, 18 minor.

---

## 0. Gates — all green, and they prove less than they look

```
$ pnpm --filter @patina/designer-portal type-check
> tsc --noEmit
EXIT=0

$ pnpm --filter @patina/supabase type-check
EXIT=0

$ pnpm --filter @patina/admin-portal build
ƒ Proxy (Middleware)
○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
EXIT=0

$ cd apps/designer-portal && npx jest src/components/document/people \
    src/components/document/roster src/lib/document src/app/\(document\)/desk \
    src/components/document/coordination src/components/document/mobile \
    src/components/document/__tests__
Test Suites: 195 passed, 195 total
Tests:       3206 passed, 3206 total
EXIT=0

$ cd packages/supabase && npx vitest run src/hooks/__tests__
 Test Files  88 passed (88)
      Tests  1163 passed | 12 skipped (1175)
EXIT=0

$ cd apps/designer-portal && npx eslint src/components/document/people \
    src/components/document/roster src/lib/analytics/people-events.ts
✖ 4 problems (0 errors, 4 warnings)
```

Every gate is green and CR-1, CR-2 and CR-3 are all runtime-fatal. Three of the
room's written acts fail on their first press against the local W1 schema. The
suites mock `@patina/supabase` and never reach Postgres, which is exactly the
blind spot `patina-verification` names.

---

## 1. Checklist results

| Check | Result |
|---|---|
| Hooks above early returns | **PASS** — `react-hooks/rules-of-hooks` clean over `people/`, `roster/`, `lib/analytics` |
| Hydration gate | **PASS** — `people-room.tsx:166` reads `window.location.search` inside `useEffect`, never at render |
| Consent writes only through the RPCs | **PASS** — `record_channel_consent` / `_invite` / `_reconsent` are the only doors |
| No portal writer of `sms_consent_*` (R-AS) | **PASS** — grep over `apps/` + `packages/` for the eight columns in any INSERT/UPDATE payload returns none; the only hits are type declarations, comments, `roster-derivation.ts:149` (a synthetic read-model row, not a payload), `roster-derivation.ts:399` (reading `v_project_roster`'s repointed column) and an e2e fixture |
| No hard delete outside the mistaken-add predicate | **PASS** — the only `.delete()` on `project_parties` is `useRemoveProjectParty`, gated on `seatDeleteRefusal` (see CR-39 for a narrowing) |
| Site access card never reaches a client surface | **PASS** — no `show_to_client`, no client-portal import, no client RLS leg, and the card prints "Studio only. This card never reaches a client page." (`site-access-card.tsx:228`) |
| No code field anywhere | **PASS** — no `gate_code` / lockbox-code / alarm-code input; the card edits `lockbox_version` only (see CR-45 for the risk) |
| PR-n gating | **PARTIAL** — the DB policy is the gate (`00624:1003-1043`); there is no client-side scope picker at all, so no admin-only scope is reachable from the room. The one client-side leg misdiagnoses every failure (CR-19) |
| `call-sheet` flag removed | **PASS** — `grep -rn "useFeatureFlag('call-sheet')" apps packages` returns nothing; the remaining `call-sheet` strings are `surfaceKey`/`actionKey`/event names. One dead test mock remains (CR-41) |
| Dist rebuilt after edits | **PASS** — `packages/types/dist` 2026-09-12 21:27:48 vs newest src 20:57:22; `@patina/supabase` is a source-entry package (`main: ./src/index.ts`) and needs none |
| Analytics only via `people-events.ts` | **PASS** — no `posthog.` outside `lib/analytics/people-events.ts` in any changed file |
| Document grammar / zero box-shadow | **PASS** — `box-shadow` count in changed lines = 0 (the two `globals.css` hits are pre-existing, lines 360 and 1942; `state-word.tsx:13` is a comment). Tokens only; no hex literals added outside the `globals.css` alias block |
| Every string on a face is SPEC vocabulary | **FAIL** — CR-5 (schema tokens), CR-6 (the typed rule never prints) |
| aria: no `disabled` attribute | **FAIL** — CR-26 |
| aria-expanded pairs with a real id | **PASS** — all eight disclosures render their panel with `hidden={!open}`, so the id always exists |
| No `<a>` inside `<button>` | **PASS** — every `TelLink` is a sibling of the row control |
| One live region | **FAIL** — CR-27 |
| Types imported, not redefined | **PASS** — `coordination/party.ts` now imports `PartyKind` instead of re-listing it |
| No ad-hoc fetch | **PASS** — zero `fetch(` in the changed portal files |

---

## 2. Query keys and invalidations

One canonical root per entity, all distinct:

| Entity | Root | Detail |
|---|---|---|
| Directory identity | `['people-directory']` | `peopleKeys.list(filters)`, `peopleKeys.person(id, role)` |
| Directory seat | `['people-directory-seats']` | `peopleSeatKeys.list(filters)`, `.seat(seatId)` |
| Consent record | `['channel-consent']` | `.record(org, kind, value)` — all three PK parts |
| Access grants | `['access-grants']` | `.list(filters)` |
| Rolodex card | `['studio-contacts']` | `.list(org, filters)`, `.detail(id)` |
| Channels | `['studio-contact-channels']` | `.list(ownerId)` |
| Contact rule | `['studio-contact-rules']` | `.detail(subjectType, subjectId)` |
| Affiliations | `['studio-person-affiliations']` | `.list(filters)` |
| Compliance | `['studio-compliance-documents']` | `.list(filters)`, `.state(holderId)` |
| Authority | `['project-party-authority']` | `.list(engagementId)`; project-wide at `[…all, 'project', projectId]` |
| Site access | `['project-site-access']` | `.detail(projectId)` |
| Roster | `['project-roster', projectId]`, `['project-parties', projectId]` | literals, pre-existing |

Every mutation's invalidations:

| Mutation | Invalidates | Gap |
|---|---|---|
| `useAddProjectParty` | `project-parties`, `peopleKeys.all` | **CR-18** — no `project-roster`, no `peopleSeatKeys.all` |
| `useUpdateProjectParty` | `project-parties`, `project-roster`, `peopleKeys.all`, `peopleSeatKeys.all` | — |
| `useRecordPartySmsConsent` | the four above + `channel-consent` | — |
| `useCloseProjectPartySeat` | the four | — |
| `useRemoveProjectParty` | the four | — |
| `useSetPartyAuthority` | `partyAuthorityKeys.list(engagementId)`, `project-parties`, `project-roster`, `peopleSeatKeys.all` | **CR-8** — never reaches the project-wide authority key |
| `useUpdateSiteAccessCard` | `siteAccessKeys.detail` | — |
| `useLogSiteAccessTold` | `siteAccessKeys.detail` | — |
| `useRecordChannelConsent/Invite/Reconsent` | `consentKeys.record`, `peopleKeys.all`, `peopleSeatKeys.all`, `project-roster`, `project-parties` | — |
| `useRevokeAccessGrant` | `accessGrantKeys.all` | **CR-12** — reach word goes stale |
| `useCreateFieldLink` | `partySmsKeys.links`, `access-grants`, `people-directory`, `people-directory-seats`, `project-roster` | — |
| channel add/update/status | `studioChannelKeys.list`, `studioContactKeys.detail`, `peopleKeys.all`, `peopleSeatKeys.all` | — |
| `useSetContactRule` / `useClearContactRule` | `contactRuleKeys.detail`, `peopleKeys.all`, `peopleSeatKeys.all`, `studioContactKeys.detail` | — |
| `useSetAffiliation` / `useCloseAffiliation` | `affiliationKeys.all`, `studioContactKeys.all`, `peopleKeys.all`, `peopleSeatKeys.all`, two `.detail`s | — |
| `useRecordComplianceDocument` / `useConfirmComplianceDocument` | `complianceKeys.all`, `studioContactKeys.detail`, `peopleKeys.all`, `peopleSeatKeys.all` | — |
| `useUpdateStudioContact` / add / archive / restore / promote | `studioContactKeys.all`, `people-directory` | — |
| `useChaseTheRenewal` | `['agent-tasks']` | — |

RLS-safe writes — every column a WITH CHECK policy joins through is sent:
`project_site_access_cards` joins through `project_id`, which every upsert carries
(`use-coordination.ts:1967`); `project_party_authority` joins through
`engagement_id`, carried (`:1837`); `studio_contact_rules` through
`subject_type`/`subject_id`, carried; `studio_compliance_documents` through
`organization_id`/`holder_id`, carried; `studio_contact_channels` through
`owner_id`, carried. No finding.

---

## 3. BLOCKING

### CR-1 — `useSetPartyAuthority`'s upsert can never succeed (42P10)
`packages/supabase/src/hooks/use-coordination.ts:1831-1847`

```ts
.upsert({ engagement_id, scope, … }, { onConflict: 'engagement_id,scope' })
```

The only unique index on `project_party_authority` is **partial**
(`00624:901-903`):

```sql
CREATE UNIQUE INDEX idx_project_party_authority_open
  ON public.project_party_authority(engagement_id, scope)
  WHERE effective_to IS NULL;
```

Postgres can only infer a partial index as an `ON CONFLICT` arbiter when the
statement repeats the index predicate; PostgREST emits none. Probed against the
local W1 schema:

```
$ psql -c "BEGIN;
  INSERT INTO public.project_party_authority (engagement_id, scope)
  VALUES ('…0001','selections')
  ON CONFLICT (engagement_id, scope) DO UPDATE SET scope = EXCLUDED.scope;
  ROLLBACK;"
BEGIN
ERROR:  there is no unique or exclusion constraint matching the ON CONFLICT specification
```

Consequences: the Add sheet's authority write
(`add-person-sheet.tsx:568-575`) throws on every add that types an authority
phrase — Leah task 2's whole acceptance criterion — and it throws **after** the
seat, the card, the channels and the rule have already been written (CR-20).
`use-leads.ts:481` already carries the house note for this exact trap:
*"Partial unique indexes don't support onConflict, so check-then-write."*

**Fix:** select-then-insert/update, or mint a migration adding a non-partial
unique constraint.

---

### CR-2 — `useSetAffiliation`'s upsert can never succeed (42P10)
`packages/supabase/src/hooks/use-studio-contacts.ts:1033-1047`

Same defect. `studio_person_affiliations`' only unique index is partial
(`00592:316-318`, `WHERE to_date IS NULL`), and the hook passes
`onConflict: 'person_id,company_id'`.

```
$ psql -c "BEGIN;
  INSERT INTO public.studio_person_affiliations (person_id, company_id)
  VALUES ('…0001','…0002')
  ON CONFLICT (person_id, company_id) DO UPDATE SET role_at_firm = EXCLUDED.role_at_firm;
  ROLLBACK;"
BEGIN
ERROR:  there is no unique or exclusion constraint matching the ON CONFLICT specification
```

The hook has zero call sites today, so nothing is broken on screen — but it is
the only door E4 has, and it is dead on arrival for W3.

---

### CR-3 — "Chase the renewal" always fails: `enqueue_agent_task` is not granted to `authenticated`
`apps/designer-portal/src/components/document/people/compliance-chase.ts:46-65`,
called from `company-card.tsx:344-368`

```
$ psql -c "SELECT proacl FROM pg_proc WHERE proname='enqueue_agent_task';"
{postgres=X/postgres,service_role=X/postgres,agent_writer=X/postgres}

$ psql -c "BEGIN; SET LOCAL ROLE authenticated;
  SELECT public.enqueue_agent_task(p_task_type := 'compliance_chase', p_status := 'awaiting_review');
  ROLLBACK;"
BEGIN
SET
ERROR:  permission denied for function enqueue_agent_task
```

The browser client runs as `authenticated`. Every press of "Chase the renewal"
on the company card raises `permission denied for function enqueue_agent_task`
into the card's error slot. Every other RPC the wave calls checks out
(`channel_consent_status`, `record_channel_*`, `project_consent_org`,
`compliance_state`, `create_field_link`, all four revoke RPCs: `auth_can = t`).

This is also off-pattern for AGENTS.md's Agent-OS rule: a browser client is not
an agent, and `agent_writer` is a NOLOGIN privilege role. The chase belongs
behind a server route or a SECURITY DEFINER wrapper gated on studio membership,
not on a direct `rpc()` from the page.

---

## 4. MAJOR

### CR-4 — the Add sheet promises a text that is never sent
`add-person-sheet.tsx:578-581`

```ts
textUpdates && phone.trim()
  ? `${trimmedName} added to ${proj} — a text confirmation is on its way.`
```

W2a §6 #1 states plainly that R-AS took both halves off the INSERT, so
`fc_optin_invite_dispatch` no longer fires and **nothing is sent**. The sheet
tells the designer the double opt-in went out. The consent block's
"…is invited, not consenting, until they reply YES." (`:1218`) compounds it: the
studio is told to wait for a YES to a message Patina never sent. This is a
consent-adjacent false statement on a face; it must not ship in this state.

### CR-5 — schema words print on four faces through `contact_rule_summary`
`people/directory/person-row.tsx:100`, `roster/roster-row.tsx:277-281`,
`reach-access.tsx` (rule region), `company-card.tsx` crew line

`contact_rule_summary()` (00592) renders raw channel tokens:

```
$ psql -c "SELECT sc.full_name, public.contact_rule_summary(r.subject_type, r.subject_id) …"
 Frank Bauer | Never text. Do not use: after_hours, ap_email, dispatch, email, mobile, office. Write Rosa Delgado instead.
 Ray Thao    | Never text. Use: email, office, portal_311. Hours: Weekdays 08:00 to 16:00.
```

`after_hours`, `ap_email`, `portal_311` are schema words on a face — SPEC §8 #3
and the brief's §7. `CONTACT_CHANNEL_KIND_LABELS` already exists in
`use-studio-contacts.ts:575-583` and is never applied to the summary.
`ContactRuleLine` passes the column straight through by design
(`contact-rule-line.tsx:36-39`).

### CR-6 — the studio's own rule sentence never reaches a face
Same call sites

The typed reason lives in `studio_contact_rules.reason` and
`contact_rule_summary()` does not select it. SPEC §5.1 #8 requires Dana
Kowalski's row to read **"Text only. The email on file bounces."** and #10 to read
**"Do not contact directly. Write Rosa Delgado instead."** What renders is the
mechanical clause list above. Leah task 1's acceptance — "a rule on the person
that every add, every send and every future edit honours" — is recorded, but the
sentence the studio wrote is invisible everywhere.

### CR-7 — an AHJ firm prints a paper word, a "Record a document" act and a "Chase the renewal" act
`packages/types/src/field-config.ts` `partyKindOwesPaper`;
`company-card.tsx:209`; `lib/document/people-derivation.ts:909-919`

```ts
export function partyKindOwesPaper(kind) {
  return kind !== 'inspector' && kind !== 'lender';
}
```

The seeded firms:

```
 City of Minneapolis, CPED Inspections | contact_kind = authority | company_kind = authority
 Great Northern Bank                   | contact_kind = lender    | company_kind = lender
```

Great Northern Bank is exempt; **CPED is not**. Its Directory firm row prints a
paper word, and its company card renders the whole Paper region with "Record a
document" and "Chase the renewal". SPEC §5.1 #18/#19, §5.3 #10, C13, C24, R-A and
R-K all say a firm whose only people are inspectors holds no compliance paper for
the studio and prints **no paper word at all, never "Not on file", never blocked**.
C18 exists precisely so this rule is *demonstrated* on CPED's own row.

### CR-8 — a grant write never refreshes the Call Sheet's authority
`roster/use-project-authority.ts:22-25` vs `use-coordination.ts:1860-1868`

```ts
projectAuthorityKeys.project = (id) => [...partyAuthorityKeys.all, 'project', id]
//                                    → ['project-party-authority', 'project', <projectId>]
useSetPartyAuthority onSuccess:
  invalidateQueries({ queryKey: partyAuthorityKeys.list(engagementId) })
//                                    → ['project-party-authority', <engagementId>]
```

React Query matches by prefix. `['project-party-authority', <uuid>]` is not a
prefix of `['project-party-authority', 'project', <uuid>]`. The file's own
comment — *"The key is deliberately nested under the same root so every
`useSetPartyAuthority` invalidation reaches it"* — is false. Record an authority
grant and the Call Sheet's authority phrase and gate-controller name stay stale
until a remount.

### CR-9 — the Call Sheet vitals count the whole roster, not the window
`lib/document/roster-derivation.ts:838-859`, `:816`

`callSheetVitals` counts `textable`/`withAccounts`/`onPaper` over
`projection.rows`, and `rows = CALL_SHEET_BANDS.flatMap(band => bands[band])` —
every band, `later`, `bidding` and `done` included. Only the first number is
scoped to a band.

SPEC §5.4 #3 / R-F fix the literal as **"12 on the job this week · 5 reachable by
text · 4 with accounts · 2 on paper"**, and that arithmetic only closes over the
this-week population (studio 3 + client 2 + this week 7 = 12; accounts = Priya,
Dale, Leah, Adaeze = 4; texting = Ngozi, Erin, Luis, Dana, Adaeze = 5; on paper =
Chidi, Sam Rowe = 2). With the current scope every count but the first reads the
whole book — the fixture's "2 on paper" becomes a dozen or more.

### CR-10 — the way-in line names the key holder where SPEC names the gate controller
`roster/site-access-card.tsx:309`, `lib/document/roster-derivation.ts:924-939`

```ts
{wayInSentence(card.lockbox_version, keyHolder?.name ?? gate)}
```

with the helper's own docstring: *"The second sentence names the key holder."*
SPEC §5.6 #3 and direction §3.7 both fix the line as
**"Lockbox, version 3. The code is held off Patina; ask Luis Ochoa."** — Luis
Ochoa is the superintendent and the gate controller; Ngozi Eze is the key holder.
Against the fixture the room prints "ask Ngozi Eze". PR-r's whole value is naming
the right person to ask; the fallback order is inverted.

### CR-11 — every site-access write failure is swallowed and shown as a success
`roster/site-access-card.tsx:209-216`, `:131-134`

```ts
const save = (patch, region) =>
  void updateCard.mutateAsync(patch)
    .then(() => peopleEvents.siteAccessChanged({ region }))
    .catch(() => undefined);
```

and the editor closes optimistically before the mutation resolves:

```ts
onClick={() => { onSave(draft); setEditing(false); }}
```

An RLS refusal, the `key_holder_engagement_id` BEFORE trigger (`00625:185-207`),
or a network failure all leave the card looking saved with the old value in it
and no message anywhere. The card carries no error slot at all. On the one
surface whose value is "who to call and who was told", a silent write loss is
the worst failure mode available.

### CR-12 — revoking a door leaves the reach word claiming it is open
`packages/supabase/src/hooks/use-access-grants.ts:284-286`

```ts
onSuccess: () => { void queryClient.invalidateQueries({ queryKey: accessGrantKeys.all }); }
```

`people_directory.reach_state` is *"account, else a live unexpired field link on
one of this identity's seats, else on paper"* (w1b §4). Revoking the field link
from the person card therefore changes the reach word on the Directory row, the
seat line and every roster row — none of which is invalidated.
`useCreateFieldLink` (`use-party-sms.ts:165-175`) already invalidates
`people-directory`, `people-directory-seats`, `access-grants` and
`project-roster`; the revoke path does not mirror it.

### CR-13 — no consent sentence on the Directory person row
`people/directory/person-row.tsx` (whole file)

`consentSentence` has exactly two call sites: `roster-row.tsx:171` and
`reach-access.tsx:139`. SPEC §5.1 #9 requires Pete Rusk's Directory row to carry
the word `Opted out` **and** the clause *"Opted out by text, 3 December 2025, on
the Lindqvist kitchen."* The row renders the word and the rule clause only.

### CR-14 — the routed line prints email OR the office phone, never both
`people/contact-rule-line.tsx:84-105`

```tsx
{routeTo.email ? <a href={`mailto:…`}>…</a>
  : routeTo.officePhone ? <TelLink … /> : null}
```

SPEC §5.1 #10: *"printing Rosa Delgado's email (`rosa@twincitiesdrywall.com`)
**and** her office phone as a `tel:` link"*, repeated at §5.4 #12 and in R-L's
first clause. Rosa has both on file, so her office phone never renders on any
face. (R-L's second clause reads as a fallback order; SPEC §5 is the visual
contract and asks for both.) The code comments the deviation in
(`:97 "never shown two channels"`) but does not flag it.

Also: `directory-view.tsx:193` sources `officePhone` from
`studio_contacts.phone`, not from the typed `office` channel R-L names.

### CR-15 — the roster row's routed clause has no route target at all
`roster/roster-row.tsx:274-283`

```tsx
<ContactRuleLine summary={row.ruleSummary} blocked={/never|do not|…/i.test(row.ruleSummary)} />
```

No `routeTo`, no `splitRoutedClause`. SPEC §5.4 #12 requires Frank Bauer's roster
row to print Rosa Delgado's email and her office phone as a `tel:` link. The
row prints "Write Rosa Delgado instead." embedded in the summary and stops —
exactly C22's "a routing instruction with no channel attached sends the reader
nowhere", on the surface where a superintendent is standing on site.

### CR-16 — the Add sheet's authority field has one branch where R-J requires two
`add-person-sheet.tsx:1141-1156`

Only the second branch is built:

```tsx
<p …>Nothing defaulted from the agreement.</p>
```

R-J / C20 / SPEC §5.5 #16 require both, exactly: *"Defaulted from the agreement.
Confirm it, or write a different one."* with the act **"Confirm from the
agreement"**, and *"Nothing defaulted from the agreement."* with the act
**"Record the authority"**. Neither act exists either — the field is a bare input
with no act beside it. Not declared in w2b §6.

### CR-17 — PR-g's firm sorting is computed and then not used
`people/views/directory-view.tsx:144-153`, `:210-214`;
`lib/document/people-derivation.ts:817-826`

`firmBands` maps each firm to the band of the crew it carries, and is passed to
`directoryChipAdmits` — so a firm is *admitted* under Crew or Makers. But the
sort reads `BAND_ORDER[directoryBandOf(a)]`, and `directoryBandOf` returns
`'firms'` for every firm (`:818`), which is `BAND_ORDER` 4. Every firm therefore
sinks to the bottom of Everyone. PR-g's ruling is *"firms appear under Everyone,
**sorted into the band of the crew they carry**"* (direction §1 line 2, §3.1).
Half delivered, not declared.

### CR-18 — a seat added from the rolodex does not appear on the Call Sheet
`use-coordination.ts:531-536`; caller `roster/rolodex-picker.tsx:231`, `:290`

```ts
onSuccess: (data) => {
  invalidateQueries({ queryKey: ['project-parties', data.project_id] });
  invalidateQueries({ queryKey: peopleKeys.all });
},
```

Every other seat mutation in the file also invalidates
`['project-roster', projectId]` and `peopleSeatKeys.all`; the add path does not,
and the Call Sheet reads exactly those two (`use-call-sheet-roster.ts:64-66`).
The missing `project-roster` predates this wave; `peopleSeatKeys.all` became
load-bearing in it. `add-person-sheet.tsx:572-573` compensates with a manual
invalidate — the rolodex picker, which is the Call Sheet's own add door, does
not.

### CR-19 — the PR-n sentence is thrown for every failure on a money scope
`use-coordination.ts:1849-1857`

```ts
if (error) {
  if (isAdminOnlyAuthorityScope(input.scope)) throw new Error(AUTHORITY_ADMIN_ONLY_SENTENCE);
  throw error;
}
```

Any error — CR-1's 42P10, the `authority_copy_to_off_project` trigger, a network
failure — is reported to an owner as *"Money and draw certification are the
principal's to grant. Ask an owner or an admin of the studio to record this one."*
An owner is told to ask an owner. The RLS refusal has a recognisable shape
(42501, or zero rows on `.single()`); narrow the branch to it.

### CR-20 — the Add sheet's five chained writes have no rollback and no idempotency
`add-person-sheet.tsx:507-575`

`addParty` → `promoteToCard` → `addChannel` ×2 → `contactRuleWrite` →
`setAuthority`, each awaited, any of which may throw. On a failure the catch sets
an inline error and leaves the sheet open with every prior write committed.
Pressing "Add to the roster" again writes a **second seat**. With CR-1 in place
this is not hypothetical: every add that types an authority phrase lands here.

### CR-21 — the contact rule's forbidden channel is inferred from an empty field
`add-person-sheet.tsx:556-562`

```ts
channelsForbidden: partyEmail.trim() ? [] : ["email"],
reason: contactRule.trim(),
```

The studio's typed sentence is stored as `reason`; the machine-readable half is
derived from whether the Email box happened to be blank. Type *"Email only. No
cell for work."* and leave the email box empty — because you do not have it yet —
and the room writes a rule that **forbids email**, which is then what
`contact_rule_summary` prints and what every send gate reads. The rule says the
opposite of what the studio wrote.

### CR-22 — two different block heuristics for one fact
`lib/document/people-derivation.ts:926-929` vs `roster/roster-row.tsx:277`

```ts
// Directory row
return /\b(never|do not|don't|no )/i.test(summary);
// roster row, inline
blocked={/never|do not|don’t|don't/i.test(row.ruleSummary)}
```

R-S requires the blocked clause to print identically wherever a rule is shown.
Two regexes that already differ (`no ` is in one and not the other) guarantee
they will drift. Worse, both fire on **any** forbidden channel, while direction
§5.4 defines the hard block — the one that earns the terracotta leading rule — as
*"`channels_forbidden` covers every channel"*. Against the seed, Sam Rowe, Carol
Nyström, Ingrid Halvorsen and Ray Thao all get the terracotta rule; SPEC's
fixture marks F-10 and F-13 `block: false`. `studio_contact_rules.channels_forbidden`
is the ground truth and neither call site reads it.

### CR-23 — an ended authority grant keeps printing
`use-coordination.ts:1803-1818`, `roster/use-project-authority.ts:43-47`

Neither read filters `effective_to`. 00624 comments the column as *"Delegations
end (CS5-24). A delegation during travel is a row, not an edit."* — the shape is
explicitly designed to be closed, not deleted. The Call Sheet's authority phrase
and the person card's R4 will keep printing authority somebody no longer holds.
(The partial unique index `WHERE effective_to IS NULL` is the same signal.)

### CR-24 — the authority threshold figure prints on a phone
`lib/document/roster-derivation.ts:943+` (`authorityPhrase`), rendered at
`roster/roster-row.tsx:244-248`

PR-t (STAND): *"Show the yes or no ('may approve this change order'), and the
figure only on the desk"* — *"a phone in a hallway is read over a shoulder"*.
`authorityPhrase` formats `threshold_cents` into "$2,500" unconditionally and the
Call Sheet renders the same DocSheet at every width. w2c §4 #9 declares only that
the *state words* are not width-branched; PR-t is not mentioned anywhere in the
three reports.

### CR-25 — the studio has no way back from a refusal
`packages/supabase/src/hooks/use-consent.ts:318-340`; `reach-access.tsx:206-217`

`useRecordChannelReconsent` has **zero call sites**. The person card's "Record
consent" writes `record_channel_consent` with `granted`, which the RPC refuses
over a standing opt-out, and the hook renders that refusal as *"This number
already opted out of Patina texts. **Only they can rejoin by replying START.**"*
Direction §5.2 says the way back is *"a fresh recorded consent with source and
evidence, **or** an inbound START"*, and PR-m exists so a studio that heard a
verbal stop can write it down — and, symmetrically, write down the verbal restart.
The surface now tells the studio the door is the recipient's alone.

### CR-26 — bare `disabled` on two gated acts
`roster/notice-log.tsx:136` — `disabled={picked.length === 0 || logTold.isPending}`
`roster/roster-row.tsx:538` — `disabled={!body.trim() || sendSms.isPending}`

Neither passes `held`, and `DocumentAction` only suppresses the native attribute
when it is set (`document-action.tsx:309`, `disabled={unavailable && !held}`).
Direction §5.5: *"Gated act | `aria-disabled="true"` plus `aria-describedby` plus
a visible consequence sentence. **Never `disabled`**."* Every other gated act in
the wave does this correctly, and the party sheet's own identical Send act
(`party-profile-sheet.tsx:793-797`) is held with the reason *"Write the message
first — a text with no words is not a text."* — so the roster's Send is a
regression against the sheet it sits beside. The pending-state halves are fine;
the gate halves are not.

---

## 5. MINOR

- **CR-27** Three live regions coexist on `/people`: `people-room.tsx:531-538`
  (the toast, and it is *conditionally mounted*, so the first message may not
  announce at all), `directory-view.tsx:236` and `person-profile.tsx:209`.
  Direction §5.5 routes consent, grant and document announcements into *"the
  room's existing `role="status"` line"*; SPEC §7 #3 says exactly one per file.
- **CR-28** `openPersonLabel` (`person-row.tsx:44-47`) is exported and never
  called; the open-person button's accessible name is the bare display name, not
  SPEC §7 #6's *"the person's name and role summary"*.
- **CR-29** `carriedForwardSentence` (`consent-sentence.ts:85`) has no call site;
  SPEC §5.2 #4's second sentence ("Carried forward to the Okonkwo residence,
  12 October 2026.") never prints.
- **CR-30** Dead exports shipped with no caller: `useProjectRosterByWindow`,
  `useSetStudioContactChannelStatus`, `useUpdateStudioContactChannel`,
  `useClearContactRule`, `useSetAffiliation`, `useCloseAffiliation`,
  `useConfirmComplianceDocument`, `useRecordChannelInvite`,
  `useRecordChannelReconsent` (CR-25). Two of them are the only doors direction
  §5.1/§5.4 gives a held channel and §3.3 gives a designation — declare them or
  wire them.
- **CR-31** `placeholder=` survives at `party-profile-sheet.tsx:877`,
  `rolodex-picker.tsx:315` and `:491`; direction §5.4's Editing state and SPEC
  §5.5 #12 both forbid it. w2b §1 claims "every `placeholder` removed" — true of
  the add sheet only.
- **CR-32** Company card R6 History prints only the verdict
  (`company-card.tsx:436`); SPEC §5.3 #8 wants *"First job 2025, the Lindqvist
  kitchen. Two projects. No verdict recorded."*
- **CR-33** Person card R6: `(person.seat_count ?? 0) === 1 ? "projects" : "projects"`
  (`person-profile.tsx:386-388`) — identical branches — and `seat_count` counts
  SEATS while the sentence claims PROJECTS. SPEC §5.2 #10's
  "…text, logistics." suffix is absent.
- **CR-34** `site-access-card.tsx:202-203` resolves `changed_by` only against
  roster rows carrying a `profileId`; a studio member off the roster prints no
  "by <name>", against SPEC §5.6 #7.
- **CR-35** `rosterBandFor` (`use-coordination.ts:1678-1681`) contains an `if`
  whose entire body is a comment — a no-op that reads as a rule.
- **CR-36** `people-events.ts:4` says "Eight events"; there are nine.
- **CR-37** `resolveStateWord('reach', …)` (`studio-config.ts:446`) tests
  `value in REACH_STATE_LABELS`, which is true for `constructor`, `toString` etc.
  `paperStateFor`'s `.includes` idiom two cases down is the safe form.
- **CR-38** `useLogSiteAccessTold` (`use-coordination.ts:2011-2032`) is a
  read-modify-write on `told_refs` with no version guard; two concurrent logs
  lose one.
- **CR-39** `useRemoveProjectParty`'s waiver leg checks documents held against
  the person's own card only (`use-coordination.ts:905-915`); R-BA reduces paper
  worst-first over the person's **and their firm's**. A seat whose firm holds the
  COI can still be hard-deleted.
- **CR-40** `PARTY_KIND_LABELS.other_named = 'Other'` collides with
  `other: 'Other'` (`field-config.ts:207`, `:218`) — two kinds, one word, in the
  same picker.
- **CR-41** `command-bar.test.tsx:65` still mocks the retired `call-sheet` flag;
  dead scaffolding behind a retired flag.
- **CR-42** `roster-row.tsx:502` puts the held Text act's reason in an `sr-only`
  paragraph; SPEC §7 #4 and direction §5.5 both require a **visible** reason
  beside a gated act (the sighted designer only sees it after pressing, through
  `onHeldActivate`).
- **CR-43** `person-row.tsx:171` prints "No open seat on this project." inside a
  cross-project Directory row's seats panel — R-V's sentence, in the one place it
  names no project.
- **CR-44** The trade line renders `getFieldTradeLabel('carpentry_framing')` →
  "carpentry & framing"; SPEC §5.1 #3 prints "carpentry / framing".
- **CR-45** The site access card's "The way in" editor is a free-text input over
  `lockbox_version` labelled with the region's own words
  (`site-access-card.tsx:297-306`). PR-r forbids storing the code; a field
  labelled "The way in" is the natural place a studio types one, and nothing on
  the face warns. A label naming the *version* would close it.
- **CR-46** `copyLink`'s analytics claim `expiry_source: 'engagement_window' |
  'fallback_90_day'` (`roster-row.tsx:214-217`) while the RPC actually takes the
  later of `on_site_to` and `warranty_until` — PR-l's `'warranty'` value is
  defined in the taxonomy and never emitted.
- **CR-47** `use-people.ts:262-267`'s in-memory search matches name, email and
  phone digits only, while its own `PeopleFilters.search` doc and direction §3.1
  also name firm and trade. The Directory happens not to use it
  (`directoryEntryMatches` is the real matcher), so the two searchers disagree —
  the command bar reads the narrower one.

---

## 6. Not findings — checked and clear

- R-AS holds end to end. No portal path writes any of the eight frozen columns;
  the phone-edit guard reads the record through `project_consent_org()` +
  `channel_consent_status()` and writes nothing.
- `project_consent_org()` is the right resolver for a consent record and R-BD does
  not retire it there — 00624's own comment on `project_tenant_org` says it *"may
  NEVER resolve a consent record's studio — that stays `project_consent_org()`"*.
- `v_access_grants` grant_id shapes match `ACCESS_GRANT_REVOKE_ROUTES`'
  `keySegment: 1` on all four routed tiers, including
  `project_review:<edition>:<actor>`.
- Every revoke RPC's argument name matches the routing table, and the overloaded
  two-argument `create_field_link(p_party_id, p_expires_at)` resolves
  unambiguously because both names are always sent.
- `compliance_state()` does not filter on `verified_at`, so a studio-recorded
  document (which `useRecordComplianceDocument` leaves unverified) still moves the
  paper word.
- `RecordDocumentSheet` is mounted with `holderType="person"` on the person card
  and defaults to `"company"` on the company card — correct on both.
- `@patina/types` dist is rebuilt after the src edits; `@patina/supabase` is a
  source-entry workspace and needs no dist.

---

## 7. What round 2 must re-probe

1. The three blocking runtime failures, against the local DB, not a mock.
2. The vitals literal and the Directory row's three words, rendered — CR-5,
   CR-6, CR-7, CR-9 and CR-13 are all "what the face actually says" findings that
   a unit suite cannot see. A prod-build walk at 1440 and 390 is owed.
3. Whether the seed's missing Dana Kowalski contact rule (the fixture's F-11 rule
   has no `studio_contact_rules` row) is a W1 seed gap; SPEC §5.1 #8's clause
   cannot be verified against the seed as it stands.
