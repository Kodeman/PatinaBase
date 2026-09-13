# W2 — adversarial code review, round 2

Reviewer context: fresh, separate from every W2 implementer. Worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`, branch
`build/people-room-crm-2026-09-11`, HEAD `9b5038e1d` **plus the uncommitted
working tree** (two files: `lib/document/contact-rule.ts` and its test — see
CR-1). No production anything; local DB only; no dev server started; no
`next build` beyond the admin-portal gate.

Read first, in this order: `rulings.md` (§1, §2, §3 R-A…R-BM, §6),
`synthesis/direction.md` §1–§6 incl. §3.9 C1–C38, `specimens/SPEC.md` §3, §5,
§6, §7, §8, both specimen HTML files, `build/w1a-report.md`,
`build/w1b-report.md`, `briefing/current-state.md` §A,
`briefing/shots/strings-today.md`, then `build/w2a-report.md`,
`build/w2b-report.md`, `build/w2c-report.md`, then
`build/w2-fix-log-r1.md` (the prior fix log + its 2026-09-13 re-verification),
then every changed file under `apps/designer-portal/src`,
`packages/supabase/src/hooks`, `packages/types/src`
(101 files, 19 854 insertions / 5 122 deletions).

**Verdict: NOT CLEAN — 1 blocking, 9 major, 14 minor.**

---

## 1. Gates, run here

```
pnpm --filter @patina/designer-portal type-check        EXIT=0
   > tsc --noEmit                                       (no output)

pnpm --filter @patina/supabase type-check               EXIT=0
   > tsc --noEmit                                       (no output)

pnpm --filter @patina/admin-portal build                EXIT=0
   ○  (Static)   prerendered as static content
   ƒ  (Dynamic)  server-rendered on demand

npx vitest run src/hooks/__tests__   (packages/supabase)
   Test Files  89 passed (89)
        Tests  1169 passed | 12 skipped (1181)

npx eslint src/components/document/people src/components/document/roster
           src/lib/document/{contact-rule,people-derivation,roster-derivation}.ts
           src/lib/analytics src/app/api/people
   ✖ 5 problems (0 errors, 5 warnings)   — all five pre-existing kinds
                                            (unused eslint-disable ×3,
                                             exhaustive-deps ×2, none in W2 files)

npx jest src/components/document/people src/components/document/roster
         src/components/document/rooms src/lib/document src/lib/analytics
         src/app/api/people
   Summary of all failing tests
   FAIL src/components/document/people/__tests__/person-row-hardening.test.tsx
     ● the rule clause › a rule that forbids text takes the leading rule and
       KEEPS the phone (CR-16)
       expect(received).toBeInTheDocument()
       received value must be an HTMLElement or an SVGElement.
       Received has value: null
         189 |     expect(
         190 |       container.querySelector('[data-contact-rule-blocked="true"]'),
       > 191 |     ).toBeInTheDocument();
   Test Suites: 1 failed, 212 passed, 213 total
   Tests:       1 failed, 3511 passed, 3512 total
```

`packages/types/dist` is rebuilt and ahead of `src`
(`dist/field-config.js` 2026-09-12 23:00:19 vs `src/field-config.ts`
2026-09-12 22:48:54); `node -e` on the dist confirms
`partyKindOwesPaper('authority') === false`, `('sub') === true`, and
`STATE_WORD_PIGMENTS` carrying all four pigments.
`packages/supabase` has no dist by design (`main: ./src/index.ts`).

## 2. Prior findings (`w2-fix-log-r1.md`), re-checked here

All 26 re-verified independently against the tree in front of me. QA-1…QA-8 and
CR-1…CR-26 all hold **closed**, with three carry-overs recorded below rather
than reopened:

| Prior | Still closed? | What I read |
|---|---|---|
| QA-1 / CR-3 | ✔ | `app/api/people/chase-renewal/route.ts` exists; `compliance-chase.ts:47` POSTs to it; no `rpc('enqueue_agent_task')` anywhere in a browser path. (New minor: CR-19 below.) |
| QA-2 / CR-7 | ✔ | `PARTY_KINDS_OWING_NO_PAPER` in the dist; `entryPaperWord` returns null for lender/inspector/authority. |
| QA-3 | ✔ | `person-row.tsx:190` suppresses the row's own `TelLink` under `contactRuleIsDoNotContact`; seed confirms Frank Bauer forbids all four direct channels. |
| QA-4 / CR-14 / CR-15 | ✔ | `contact-rule-line.tsx` renders email AND a `TelLink`; `directory-view.tsx:250-258` and `roster-groups.tsx` both pass a real `routeTo` from `contactRouteTarget()`. |
| QA-5 / CR-5 | ✔ | `contact-rule.ts:48-60` maps `after_hours`/`ap_email`/`portal_311` to house words. |
| QA-6 | ✔ | Structural bands print a stated absence; the seed writes `project_team_members`. |
| QA-8 | ✔ | `room-shell.tsx:167` is an `<h1>`; the five inner headings are `h2`. |
| CR-1 | ✔ | `useSetPartyAuthority` is check-then-write; WITH CHECK joins through `engagement_id` + `scope`, both sent (00624:1003-1015). |
| CR-2 | ✔ | `useSetAffiliation` is check-then-write. (But it has no call site — CR-4 below.) |
| CR-4, CR-6, CR-9, CR-10, CR-11, CR-13, CR-16, CR-17, CR-18, CR-20, CR-21, CR-23, CR-24, CR-25 | ✔ | Each re-read at the line the log names; all present. |
| CR-8 | ✔ | `partyAuthorityKeys.all` is the invalidated root; `projectAuthorityKeys.project` nests under it. |
| CR-12 | ✔ for `useRevokeAccessGrant` — **but the same defect stands in a second door**, `useRevokeFieldLink`. See CR-5 below. |
| CR-19 | ✔ | `authorityWriteError` narrows to `42501` / `PGRST116`. |
| CR-22 | ✔ predicate is unified — **but the predicate itself is the blocking finding**. See CR-1. |
| CR-26 | ✔ for the two acts named — **a third gated act still has no visible reason**. See CR-7. |

The log's own "Collision" note (the red `person-row-hardening.test.tsx`) is
carried forward as CR-1 below: a red gate on the branch is this round's
finding whoever authored it.

---

## 3. Findings

### CR-1 — BLOCKING — the branch is red, and the R-BL predicate is uncommitted
*Confidence: certain (gate output above).*

`apps/designer-portal/src/lib/document/contact-rule.ts` and
`apps/designer-portal/src/lib/document/__tests__/contact-rule.test.ts` are
**uncommitted working-tree edits** (`git status`: ` M` on both). They implement
R-BL (2026-09-13):

```ts
// contact-rule.ts:105-109  (working tree)
export function contactRuleIsHardBlock(rule) {
  return contactRuleIsDoNotContact(rule) || Boolean(rule?.route_to_person_id);
}
// committed at HEAD:
//   return contactRuleForbidsSms(rule) || contactRuleIsDoNotContact(rule);
```

Two problems, and the branch is in exactly one of them at any moment:

1. **As it stands in the working tree**, the sibling pin
   `people/__tests__/person-row-hardening.test.tsx:191` still asserts the
   superseded semantics and FAILS. `pnpm jest` over the changed areas is red:
   `Test Suites: 1 failed, 212 passed`. A red suite on the branch is a blocking
   state whatever its provenance; W2's own reports all claim green.
2. **As committed at HEAD (`9b5038e1d`)**, `contactRuleIsHardBlock` is the
   pre-R-BL predicate, so F-27 Ray Thao (`channels_forbidden={sms}`,
   `channels_allowed={office,email,portal_311}`) wears the terracotta leading
   rule R-BL explicitly rules he must not, and R-BL is unimplemented.

**Fix:** commit the R-BL predicate AND rewrite `person-row-hardening.test.tsx`'s
"a rule that forbids text takes the leading rule" case to R-BL's wording (a
`forbidden={sms}` / `allowed={email,mobile}` row must NOT paint
`[data-contact-rule-blocked]`, and must keep its phone). Verified against the
seed: Dana Kowalski `{email}`, Ray Thao `{sms}`, Ingrid Halvorsen `{sms,mobile}`
→ no leading rule; Frank Bauer `{mobile,office,dispatch,after_hours,email,ap_email,sms}`
+ `route_to_person_id` → leading rule and no phone. Gate:
`npx jest src/components/document/people src/lib/document` EXIT=0.

---

### CR-2 — MAJOR — the consent WORD and the consent CLAUSE can contradict each other on the same row
*Confidence: high (code + 00594's own comment).*

`channel_consent_status()` is the verdict, and it folds `refusal_unanswered`
into `opted_out` **whatever `status` says** (`00594:1062-1063`). 00594's own
COMMENT records that this state is minted on purpose: *"the fold mints `granted`
records carrying it on purpose (:655-666, r8 W4-M1)"*.

Every WORD on every face reads the verdict:
`people_directory.consent_status`, `v_project_roster.sms_consent_status`,
`reach-access.tsx:312` (`value={consent?.verdict}`).

But the SENTENCE beside the word reads the RAW COLUMN:

```ts
// people/consent-sentence.ts:55
const refused = facts.status === "opted_out";
// people/consent-sentence.ts:70-77
export function consentSentenceForRecord(record, projectName) {
  return consentSentence({ status: record.status, ... });
}
```

Two of the three call sites pass the raw record:
- `people/views/directory-view.tsx:301` → the Directory row's `[data-consent-clause]`
- `people/reach-access.tsx:191` → the person card's channel line, **directly
  under `StateWord value={consent?.verdict}` at :312**

Only `roster/roster-row.tsx:207-213` does it right
(`status: consentRecord?.verdict ?? row.consent`).

**Failure:** a record with `status='granted'` and `refusal_unanswered=true`
prints, on one line of the Directory and on one line of the person card,
the word `Opted out` (terracotta) beside the sentence
"Written consent, 2 May 2025, on the Lindqvist kitchen." R-Q/C27's entire
point is that one fact reads the same wherever it surfaces; here one fact
reads as its own opposite, on the compliance axis this program exists to
get right. `use-consent.ts:236-240`'s own docblock warns "use it for the
DATES BEHIND a word the view already printed, never to derive the word
itself" — and `consentSentenceForRecord` derives the refusal branch itself.

**Fix:** give `consentSentenceForRecord` a required verdict argument (or make
it take `ChannelConsentResolution`, not `ChannelConsentRecord`) and thread
`people_directory.consent_status` into the Directory call site. Gate:
`npx jest src/components/document/people src/lib/document` EXIT=0.

---

### CR-3 — MAJOR — no surface in the room can attach a person or a seat to a FIRM card
*Confidence: high (four independent reads).*

Direction §1 line 1 and §3.5 make the firm a card that owns paper and payment,
and the Add sheet's Firm field "create or match → E2, E4". None of that is
written:

- `people/directory/add-person-sheet.tsx:1226-1240` — the firm `<select>`
  writes `firmId` into state, and `:645-646` uses it ONLY to fill the free-text
  `company` box: `const firmName = matchedFirm?.company_name ?? company;`
  The picked card's **id is discarded**.
- `AddProjectPartyInput` (`use-coordination.ts:397-426`) carries no `companyId`,
  and `UpdateProjectPartyPatch` (`:545-553`) carries none either — so
  `project_parties.company_id` (00624:404, the column R-BJ's seat paper word
  keys on) is **unwritable from the portal**.
- `usePromoteToStudioContact` (`use-studio-contacts.ts:509-522`) inserts
  `company_name` text and no `company_id`.
- `useSetAffiliation` / `useCloseAffiliation` have **zero call sites** across
  `apps/` (`grep -rn "useSetAffiliation\|useCloseAffiliation" apps/` → nothing;
  only `useAffiliations`, the READ, is wired at
  `company-card.tsx:196` and `person-profile.tsx:141`).

**Failure:** Leah picks "Northgate Electric" in the Add sheet and adds Dana.
Dana's card gets the string "Northgate Electric" and no link. The Directory's
`directoryFirmOf` reads `meta.company_id` (`people-derivation.ts:882`), which is
NULL, so: the firm row's "N on the crew" does not count her
(`directory-view.tsx:196-201`), PR-g's firm banding does not see her
(`firmBands`, `:172-181`), the company card's Crew & designations region does
not list her, and R-BJ's `people_directory_seats.paper_state` falls back to the
card's (absent) firm. Every one of those reads is fed by data no W2 surface can
produce; only the seed can.

**Fix:** add `companyId` to `AddProjectPartyInput` / `UpdateProjectPartyPatch`
and send `company_id` from the Add sheet's `firmId`; write the affiliation with
the already-built `useSetAffiliation` in the same chain step (record it on
`chainRef` like the other four). Note 00624's
`assert_project_party_cards()` refuses `company_id` on a studio-less project
(`party_card_project_has_no_studio`) — surface that refusal as a sentence.
Gate: `npx jest src/components/document/people` EXIT=0 and
`pnpm --filter @patina/supabase type-check` EXIT=0.

---

### CR-4 — MAJOR — every site-access edit restamps "the way in changed" and erases who was told
*Confidence: high.*

`useUpdateSiteAccessCard` (`use-coordination.ts:2009-2020`) puts
`changed_at`, `changed_by` and `told_refs: []` into the row on **every** write,
before it looks at which field the caller actually passed:

```ts
const row: Record<string, unknown> = {
  project_id: input.projectId,
  changed_at: new Date().toISOString(),
  changed_by: userData?.user?.id ?? null,
  told_refs: [],
};
```

`site-access-card.tsx` routes SEVEN different acts through that one mutation:
`Start the card` (:325), `Add someone to call` / `Take <name> off the list`
(:355-370, the `emergencyLines` patches), the key-holder picker (:553-560), and
the three `EditableLine`s (way in, hours, receiving).

**Failure:** the studio logs who was told about the lockbox change
(`useLogSiteAccessTold`), then adds the gas company's phone number to "Who to
call first". The card immediately reads, at `:646-651`:
"The way in changed 13 Sep 2026, by Kody. **Nobody has been told yet.**" —
a false statement about the lockbox on the one surface whose whole job is to be
true about it, and the deliberately recorded notice is destroyed with no undo.
R-U's Call Sheet fold (`useSiteAccessSummary` → `siteAccessSummaryLine`,
`site-access-card.tsx:80-90`) prints the same wrong "Changed <date>".

Direction's own justification only covers the way in: *"telling people about the
OLD lockbox is not telling them about this one."* An emergency phone number is
not the way in.

**Fix:** clear `told_refs` and restamp `changed_at`/`changed_by` only when the
patch touches `lockboxVersion`, `alarmRef` or `keyHolderEngagementId`. Gate:
`npx jest src/components/document/roster/__tests__/site-access-card.test.tsx` EXIT=0.

---

### CR-5 — MAJOR — `useRevokeFieldLink` leaves the reach word claiming a door that is shut (CR-12, second door)
*Confidence: high.*

CR-12 fixed `useRevokeAccessGrant` (`use-access-grants.ts:296-307`) to invalidate
`people-directory`, `people-directory-seats` and `project-roster` beside its own
root. The **other** revoke path was not touched:

```ts
// packages/supabase/src/hooks/use-party-sms.ts:180-194
export function useRevokeFieldLink() { ...
  onSuccess: (_data, { partyId }) => {
    void queryClient.invalidateQueries({ queryKey: partySmsKeys.links(partyId) });
  },
```

It is wired on a W2 surface: `people/party-profile-sheet.tsx:32, :221`.
`useCreateFieldLink` three functions above it (`:165-174`) invalidates
`access-grants`, `people-directory`, `people-directory-seats` and
`['project-roster', projectId]` — so open and close are asymmetric.

**Failure:** revoke a field link from the seat sheet; the Directory row, the
seat line and every roster row go on printing reach `Field link` (golden) until
something else happens to refetch. That is the exact sentence CR-12's own
comment gives as the reason for the fix.

**Fix:** mirror `useCreateFieldLink`'s fan-out in `useRevokeFieldLink` (add
`projectId` to its input the way `useCreateFieldLink` already takes one). Gate:
`npx vitest run src/hooks/__tests__` (packages/supabase) EXIT=0.

---

### CR-6 — MAJOR — the Add sheet records consent and never invalidates the consent ledger
*Confidence: high.*

`useAddProjectParty` calls `record_channel_invite` (`use-coordination.ts:488`)
and then invalidates four keys (`:532-542`): `['project-parties', id]`,
`peopleKeys.all`, `['project-roster', id]`, `peopleSeatKeys.all`. It does **not**
invalidate `consentKeys.all` (`['channel-consent']`).

Its sibling door through the same RPC, `useRecordPartySmsConsent`, does
(`:769`), and so does every hook in `use-consent.ts` via
`invalidateConsentFanout` (`:263-278`).

**Failure:** the Directory is mounted when the Add sheet is used. Its consent
CLAUSE comes from `useChannelConsentRecords(...)` keyed
`['channel-consent','list',org,'sms']` (`directory-view.tsx:277-281`), which is
untouched — so the row's word flips to `Invited` (from the invalidated
`people_directory`) while the clause under it stays empty or stale. The person
card's per-channel verdict (`useChannelConsent`, keyed
`consentKeys.record(...)`) is stale the same way.

**Fix:** invalidate `consentKeys.all` in `useAddProjectParty.onSuccess` when
`wantsText` (or unconditionally — it is one key). Gate:
`npx vitest run src/hooks/__tests__` EXIT=0.

---

### CR-7 — MAJOR — the Text act's held reason is `sr-only`, so there is no VISIBLE consequence sentence
*Confidence: high.*

Direction §5.5 and SPEC §7 #4: *"Gated act: `aria-disabled="true"` plus
`aria-describedby` plus **a visible consequence sentence**. Never `disabled`."*
CR-26 fixed exactly two acts to that standard. The Text act on the same row was
not one of them:

```tsx
// roster/roster-row.tsx:555-559
{!canText && showFieldActs && (
  <p id={`${panelId}-text-held`} className="sr-only">
    {textHeldSentence}
  </p>
)}
```

`sr-only` is `position:absolute; clip-path:inset(50%)` — the reason is announced
and never seen. SPEC §5.4's own string list names this sentence as a face
string: *"Texting opens once they have said yes on the record and a number is on
file."* A sighted designer sees a dead Text button with nothing beside it.

**Fix:** render it as a visible line, the way `:605-611` renders the Send act's
reason and `party-profile-sheet.tsx:930-939` renders its own.
Gate: `npx jest src/components/document/roster/__tests__/roster-row.test.tsx` EXIT=0.

---

### CR-8 — MAJOR — SPEC §5.2 #5's rule provenance ("Set by <name>, <date>") is on no face, and cannot be trusted once written
*Confidence: high.*

SPEC §5.2 #5 and direction §3.2 R3 both require the person card's Contact rule
to read: *"Text only. The email on file bounces. **Set by Priya Natarajan, 12
October 2026.**"* Two halves are missing:

1. **Nothing renders it.** `reach-access.tsx:866-877` prints only
   `ContactRuleLine` + the route. `grep -rn "set_by\|Set by" apps/designer-portal/src`
   returns no face. The columns exist: `studio_contact_rules.set_by` /
   `.set_at` (00592).
2. **It would be wrong if it did.** `useSetContactRule`
   (`use-studio-contacts.ts:1021-1035`) upserts `set_at: new Date()...` and
   never sends `set_by`. `set_by`'s `DEFAULT auth.uid()` fires on the INSERT leg
   only; on `ON CONFLICT DO UPDATE` PostgREST writes exactly the supplied
   columns, so an edit by a second designer restamps `set_at` to today and
   leaves `set_by` naming the ORIGINAL setter. The card would then say
   "Set by Priya Natarajan, 13 September 2026" for a rule Kody changed.

**Fix:** send `set_by` on the write (from `supabase.auth.getUser()`, the shape
`useUpdateSiteAccessCard` already uses), and render the sentence on
the person card's Contact rule region. Gate:
`npx jest src/components/document/people/__tests__/reach-access.test.tsx` EXIT=0.

---

### CR-9 — MAJOR — SPEC §5.2 #4's carried-forward sentence is written and never called
*Confidence: high.*

`people/consent-sentence.ts:83-93` exports `carriedForwardSentence()` with a
docblock citing SPEC §5.2 #4. `grep -rn "carriedForwardSentence" apps/` finds no
call site outside its own module and its test. SPEC §5.2 #4's required line —
*"Written consent, 2 May 2025, on the Lindqvist kitchen. Carried forward to the
Okonkwo residence, 12 October 2026."* — renders only its first half on the
person card (`reach-access.tsx:370-376`).

**Fix:** call it from the channel row when the identity holds a seat on a
project other than the record's `origin_project_id`, or delete the export and
amend §5.2 #4. Gate:
`npx jest src/components/document/people/__tests__/reach-access.test.tsx` EXIT=0.

---

### CR-10 — MAJOR — the company card's History region drops SPEC §5.3 #8's facts
*Confidence: high.*

SPEC §5.3 #8 requires: *"First job 2025, the Lindqvist kitchen. Two projects. No
verdict recorded."* `company-card.tsx:860-866` prints only
`{card.studio_verdict ?? NO_VERDICT_SENTENCE}`. The first job, its year, its
name and the project count are absent. Direction §3.3 R6 names the same three
facts (E14 + `studio_verdict`), and the Jobs region above it
(`:837`) already reads the seats that would answer them.

**Fix:** derive "First job <year>, the <project>. <N> projects." from the seats
the Jobs region already holds and print it before the verdict line. Gate:
`npx jest src/components/document/people/__tests__/company-card.test.tsx` EXIT=0.

---

### CR-11 — MINOR — a dangling `aria-describedby` on the roster row's Send act
*Confidence: certain.*

`roster/roster-row.tsx:593` sets `aria-describedby={`${panelId}-send-held`}`
unconditionally; the element carrying that id renders only under
`{!body.trim() && (` at `:605`. Once the designer types a word, the act points
at an id that does not exist.

**Fix:** make the attribute conditional, as `:505` already does for the Text act.

### CR-12 — MINOR — the 390 words line prints dangling middle dots
*Confidence: high.*

`people/directory/person-row.tsx:145-165` renders
`StateWord reach` · `StateWord consent` and only gates the separator before
`paper`. `StateWord` returns `null` for a value naming no word — which is
exactly what R-BB requires for a null `consent_status`. A carded human with no
consent record therefore prints "`Account ·`" with nothing after the dot, and a
null `reach_state` prints a leading dot.

**Fix:** build the line from the non-null words and join with the dot.

### CR-13 — MINOR — a schema noun reaches a face in the household branch
*Confidence: high.*

`add-person-sheet.tsx:228` `client_rep: "client rep"` in `KIND_NOUN`, read at
`:627` as `` `A ${KIND_NOUN[partyKind]} needs a name.` ``. The household kind
maps to `party_kind='client_rep'` (`:125`), so saving a nameless household
member reads **"A client rep needs a name."** SPEC §8 #3 forbids `client_rep` on
a face; C5 says *"the string `client_rep` never appears on a face"*. The e2e pin
(`e2e/people/add-sheet.spec.ts:113`) asserts the UNDERSCORED form has count 0,
so it passes over this.

**Fix:** `client_rep: "household member"` and widen the e2e pin to
`/client[ _]rep/i`.

### CR-14 — MINOR — more than one live region on the People room and on the Call Sheet
*Confidence: high.*

SPEC §7 #3 and direction §5.5 name ONE destination. Standing
`role="status"` nodes that can be live at the same moment:
`people/people-room.tsx:556` (the toast), `people/views/directory-view.tsx:356`
(the notice — set independently of the toast, `people-room.tsx:100` vs `:87`),
`roster/call-sheet.tsx:179`, `roster/roster-row.tsx:618` (one **per row**),
`people/directory/rolodex-seed-sheet.tsx:208`. The two cards were correctly
routed to the Room's line (`person-profile.tsx:294`, `company-card.tsx:388`);
these five were not.

**Fix:** route the notice, the Call Sheet's `added` line and the roster row's
`note` through the Room's `notify` the way the cards do.

### CR-15 — MINOR — `useSetPartyAuthority` never records who granted
*Confidence: certain (verified on the local DB).*

`project_party_authority.granted_by` has no default and no trigger
(`information_schema`: `column_default` empty, `is_nullable` YES). The seed
fills all 11 rows; `useSetPartyAuthority`'s `row` object
(`use-coordination.ts:1873-1882`) omits it. Every grant a designer records from
the Add sheet lands with `granted_by = NULL` — on the one table whose whole
ruling (PR-n) is about who may grant.

**Fix:** send `granted_by` from `supabase.auth.getUser()`, or add
`DEFAULT auth.uid()` in a W3 migration.

### CR-16 — MINOR — the one native `disabled` left on a gated control
*Confidence: certain.*

`add-person-sheet.tsx:1377` — `<option disabled={!isOrgAdmin && isAdminOnlyAuthorityScope(scope)}>`.
Every DocumentAction in the wave correctly pairs `held` with `disabled` (the
component only sets the native attribute when `!held`, `document-action.tsx:307`),
so this `<option>` is the sole survivor. A visible sentence stands beside it
(`:1382-1387`), so the harm is small, but SPEC §8 #5 and direction §5.5 both
name the attribute.

**Fix:** filter the admin-only scopes out of the list for a non-admin instead of
disabling them.

### CR-17 — MINOR — `/api/people/chase-renewal` does not check that the card is a firm
*Confidence: high.*

`route.ts:59-69` reads the card back through the caller's session (the
membership proof, correct) but selects no `entity_kind`. A person-card id posts
a `compliance_chase` task with `p_entity_type: 'studio_contact'` and a summary
naming a person as a firm. The idempotency key would also collide across kinds.

**Fix:** select `entity_kind` and 400 when it is not `'company'`.

### CR-18 — MINOR — hex literals in files this wave rewrote
*Confidence: medium (two are context lines, one is in a rewritten file).*

`roster/call-sheet.tsx:180` `text-[#6f8268]`; `people/person-bits.tsx:78, :95`
`border: '#cbb48f'`. The Document grammar is tokens only, and PR-v's whole
errand this wave was to finish the alias block. `box-shadow`, `text-overflow`
and `truncate` are all at **zero** across the 67 changed non-test files — this is
the one residue.

**Fix:** alias both to `--color-*` names in `globals.css`'s house-sheet block.

### CR-19 — MINOR — no hydration gate on the People room, and `new Date()` at render
*Confidence: medium.*

`desk/page.tsx:69` and `doc/[id]/page.tsx:921` both take `useHydrated()` before
their early returns (and `document-page-hydration-contract.test.ts` pins it).
`/people` and the Call Sheet do not, and both derive from a render-time clock:
`people-room.tsx:137` and `person-profile.tsx:146`
(`useMemo(() => new Date(), [])`), `use-call-sheet-roster.ts:68` and
`use-coordination.ts:1714` (`rosterDateKey(new Date())` as a default parameter),
`roster-row.tsx:176`, `use-project-authority.ts:48`. SSR and the client can land
on different sides of a day boundary, which moves a paper word, a band and an
`effective_to` filter between the server HTML and the first client paint.

**Fix:** either gate the room on `useHydrated()` or hoist `today` to one value
the tree is handed.

### CR-20 — MINOR — the Directory reads every seat in the studio to count firm jobs
*Confidence: high.*

`directory-view.tsx:191` — `usePeopleSeats({ all: true })`, an unfiltered
`select('*')` over `people_directory_seats`, mounted for the whole room, to
derive `firmCounts.jobs`. W2b §6 #9 names the honest alternative (a count column
on the view, a W1 object).

**Fix:** note it for W3, or narrow the select to
`company_id, project_id, stage`.

### CR-21 — MINOR — `?person=` self-erases for a field-roster role
*Confidence: high.*

`people-room.tsx:216-243` resolves `?person=` and, for a field role, opens
`openParty` rather than `openPerson`. The address effect at `:289-303` writes
`setOrDelete("person", openPerson?.id ?? null)` and does not read `openParty`,
so on the very next run the param it just consumed is deleted. PR-j's own
sentence — *"`?person` and `?firm` name the card that is open"* — fails for that
branch, and the link cannot be refreshed or shared.

**Fix:** `setOrDelete("person", openPerson?.id ?? openParty?.id ?? null)`.

### CR-22 — MINOR — SPEC §5.1 #11 still contradicts R-BL
*Confidence: certain.*

SPEC §5.1 #11 reads: *"Ray Thao's row: clause … **with the leading rule**"*.
R-BL (rulings §3, 2026-09-13) rules Ray Thao is NOT a hard block. §5.1 #11 was
already amended once by R-N; it was not amended for R-BL, so the acceptance list
and the ruling now disagree and a QA reviewer walking §5 will file it as a
regression.

**Fix:** amend SPEC §5.1 #11 (and §5.8's blocked-clause row if it needs it) the
way R-N amended it, naming R-BL.

### CR-23 — MINOR — an orchestrator ruling is still owed, recorded only in a code comment
*Confidence: certain.*

`lib/document/contact-rule.ts:93-103` carries: *"F-26 Carol Nyström (`block:
true`) and F-10 Sam Rowe (`block: false`) carry BYTE-FOR-BYTE identical rule
rows in the seed … THE ORCHESTRATOR STILL OWES A RULING."* Confirmed on the
local DB — both rows are `allowed={email,mobile}`, `forbidden={sms}`,
`routes=f`. Two fixture rows therefore render against their own `block` flag and
no formula can separate them.

**Fix:** carry it to `rulings.md` rather than leaving it in a comment: either a
column on the rule row (a W3 migration) or a SPEC §3 fixture amendment.

### CR-24 — MINOR — `useClearContactRule` is a hard DELETE of a rule row
*Confidence: high, impact low (unreachable today).*

`use-studio-contacts.ts:1052-1063` deletes the row outright, taking `set_by` and
`set_at` with it. The wave's own grammar is "close with a date, never delete"
(affiliations `to_date`, channels `status`, seats `off_job_at`). It has zero
call sites today, so nothing reaches it — which is why this is minor rather than
major.

**Fix:** either delete the export or give the rule a lifted/cleared state before
a surface wires it.

### CR-25 — MINOR — `usePromoteToStudioContact` re-stamps a seat and does not invalidate the seats view
*Confidence: high.*

`use-studio-contacts.ts:525-538` updates `project_parties.studio_contact_id`
then invalidates `studioContactKeys.all`, `['project-parties', projectId]` and
`['people-directory']` — but not `peopleSeatKeys.all` (`['people-directory-seats']`).
`people_directory_seats` joins the identity on exactly that column, so the seat
line and the Call Sheet keep reading the pre-promotion identity. It is called
from the Add sheet's chain (`add-person-sheet.tsx:682`).

**Fix:** add `peopleSeatKeys.all` to its fan-out.

---

## 4. Checklist, item by item

| Check | Result |
|---|---|
| Hooks above early returns | **PASS.** `eslint` (`react-hooks/rules-of-hooks`) is clean over every changed portal file. The three new package hook files were read by hand: `use-consent.ts`, `use-access-grants.ts`, `use-studio-contacts.ts` — every `useQuery`/`useMutation` is unconditional. `useSiteAccessSummary` (`site-access-card.tsx:80`) and `useProjectRosterByWindow` (`use-coordination.ts:1711`) both call their one hook before returning. |
| Hydration gate | **FAIL (minor).** CR-19. |
| One canonical query key per entity | **PASS.** `peopleKeys` `['people-directory']` · `peopleSeatKeys` `['people-directory-seats']` · `consentKeys` `['channel-consent']` (the list key `[...all,'list',org,kind]` nests under the root) · `accessGrantKeys` `['access-grants']` · `partyAuthorityKeys` `['project-party-authority']` with `projectAuthorityKeys.project` nested under it · `siteAccessKeys` `['project-site-access']` · `studioChannelKeys`, `contactRuleKeys`, `affiliationKeys`, `complianceKeys` · plus the two shipped literals `['project-parties', id]` and `['project-roster', id]`. No entity carries two roots. |
| Every mutation's invalidations, listed | `useAddProjectParty` → project-parties · people-directory · project-roster · people-directory-seats **(missing channel-consent — CR-6)** · `useUpdateProjectParty` → the same four · `useRecordPartySmsConsent` → those four + channel-consent · `useCloseProjectPartySeat` → those four · `useRemoveProjectParty` → those four · `useSetPartyAuthority` → project-party-authority (root) · project-parties · project-roster · people-directory-seats · `useSiteAccessCard` writes → project-site-access(detail) · `useLogSiteAccessTold` → project-site-access(detail) · `useRecordChannelConsent`/`Invite`/`Reconsent` → channel-consent(root) · people-directory · people-directory-seats · project-roster/project-parties when an origin project is named · `useCreateFieldLink` → party-sms links · access-grants · people-directory · people-directory-seats · project-roster · `useRevokeAccessGrant` → access-grants · people-directory · people-directory-seats · project-roster · **`useRevokeFieldLink` → party-sms links ONLY (CR-5)** · `useSetContactRule`/`useClearContactRule` → the rule fan-out · `useRecordComplianceDocument`/`Confirm` → the compliance fan-out · `usePromoteToStudioContact` → studio-contacts · project-parties · people-directory **(missing people-directory-seats — CR-25)**. |
| RLS-safe writes send every WITH CHECK column | **PASS.** `project_party_authority` WITH CHECK joins `engagement_id` + `scope` (00624:1003-1015) — both in the row. `project_site_access_cards` joins `project_id` (00625:246-252) — sent, and `project_id` is UNIQUE so the `onConflict` arbiter is valid. `studio_contact_rules` upsert sends `subject_type,subject_id`, a NON-partial unique index. `studio_compliance_documents` sends `organization_id` + `holder_type/holder_id`. Both partial-index traps (CR-1, CR-2 of round 1) are check-then-write. |
| Consent writes only through the RPCs | **PASS with one noted deviation.** `grep "from('studio_channel_consent')"` returns two hits, both SELECT (`use-consent.ts:212, :254`). Every write is `record_channel_consent` / `record_channel_invite` / `record_channel_reconsent`. The Add sheet and the party sheet use `record_channel_invite` rather than `record_channel_consent` — W2b §3 flags this deliberately, and W2a §3 gives the reason (a repeat sub's standing grant must not be demoted to `pending`). Same table, same gates; not a finding. |
| No portal writer of `project_parties.sms_consent_*` (R-AS) | **PASS.** `grep -rn "sms_consent_status\|sms_opt_out_at\|sms_consented_at\|sms_consent_source\|sms_consent_evidence" apps packages` over `.ts`/`.tsx` returns 45 hits: type declarations, comments, test fixtures and `ProjectRosterRow`'s read column. **Zero appear in an `insert`/`update`/`upsert` payload.** |
| No hard delete outside the mistaken-add predicate | **PASS for seats.** `project_parties.delete()` is the one seat delete (`use-coordination.ts:927`), gated server-side by `seatDeleteRefusal` over a live consent verdict, the bid stages and `studio_compliance_documents`, and gated again client-side at `roster-row.tsx:234-238`. The only other `.delete()` in the wave is `useClearContactRule` — CR-24. |
| Site access card never reaches a client surface | **PASS.** `grep -rn "SiteAccessCard\|useSiteAccessCard\|project_site_access"` across `apps/` finds it only in `apps/designer-portal` (`roster/call-sheet.tsx`, `roster/site-access-card.tsx`) and its own e2e. No `client-portal` reference, no `show_to_client` on the card, no client RLS leg (00625's four policies are studio-only), and the card prints "Studio only. This card never reaches a client page." at `:288-290`. |
| No code field anywhere | **PASS.** `grep -in "gate_code\|gateCode\|alarm_code\|lockbox_code"` across all 67 changed non-test files returns nothing. `ProjectSiteAccessCard` carries `lockbox_version` and `alarm_ref` only; 00625 has no `gate_code` column. |
| PR-n gated client-side AND on the DB policy | **PASS.** Client: `add-person-sheet.tsx:1377` (the option), `:416-419` (the scope resets when a non-admin holds an admin-only one) and `:727-732` (an explicit throw before the write). DB: 00624's insert/update/delete policies all carry `scope NOT IN ('money','draw_certify') OR is_org_admin_or_owner(...)`. The refusal surfaces as PR-n's sentence only on `42501`/`PGRST116` (`authorityWriteError`). CR-16 is the shape of the client half, not its existence. |
| `call-sheet` flag fully removed | **PASS.** `grep -rn "useFeatureFlag('call-sheet')"` → nothing. The remaining 20 `call-sheet` hits are a CSS class (`call-sheet-no-print`), a component path, a DOM event name (`document:open-call-sheet`), test mocks and two comments recording the retirement. No dead branches. |
| dist rebuilt after edits | **PASS.** `packages/types/dist/field-config.js` 2026-09-12 23:00:19 > `src/field-config.ts` 22:48:54; `dist/studio-config.js` 21:27:48 > `src/studio-config.ts` 20:57:22. Runtime check confirms both new exports. `packages/supabase` ships from `src` by design. |
| Analytics only via `people-events.ts` | **PASS.** `posthog.` appears exactly once in the wave, at `lib/analytics/people-events.ts:25`. Every call site goes through `peopleEvents.*`. |
| Document grammar — `box-shadow` = 0, tokens only | **PASS on `box-shadow`** (0 across all 67 files), and on `text-overflow`/`truncate` (0). Three hex literals survive — CR-18. |
| Every string on a face is SPEC vocabulary | **MOSTLY.** The strings W2b §2 and W2c §2 list all resolve. Misses: CR-8 (§5.2 #5), CR-9 (§5.2 #4), CR-10 (§5.3 #8), CR-13 (a schema noun), CR-7 (a required string rendered invisibly). SPEC §5.2 #10's "text, logistics" and SPEC §5.6 #7's second notice entry are named as sourceless in W2b/W2c §"not built" and are not counted against this wave. `Remove` appears on no face (SPEC §5.4 #14 ✔). |
| aria — no `disabled` on a gated act | **PASS for every act.** `DocumentAction` sets `disabled={unavailable && !held}` (`document-action.tsx:307`), so the four party-sheet acts, the roster row's Text/Send/Added-by-mistake, the person card's Send a text and `Mint access` are all `aria-disabled` + focusable. The one native survivor is an `<option>` — CR-16. |
| aria — `aria-expanded` pairs with a real id | **PASS.** All 17 `aria-controls` in the wave resolve to a rendered element: `person-row.tsx:201`→`:213`, `roster-row.tsx:270`→`:364`, `reach-access.tsx:327/385/802/884`→`:335/399/807/889`, `company-card.tsx:558/763/872`→`:563/768/877`, `add-person-sheet.tsx:1332/1352`→`:1364`, `access-grant-list.tsx:180`→`:185`, `site-access-card.tsx:395/553`→`:408/560`, `notice-log.tsx:63`, `view-shell.tsx:289`. One `aria-describedby` dangles — CR-11. |
| aria — no `<a>` inside a `<button>` | **PASS.** `TelLink` is an `<a>` and is always placed as a sibling: `person-row.tsx:186` (outside the open-person button), `roster-row.tsx:345` (outside the unfold button), `site-access-card.tsx:355` (inside an `<li>`, beside a DocumentAction), `contact-rule-line.tsx` (inside a `<p>`). `SeatLine` is a `<button>` and contains only spans and a `StateWord`. |
| aria — one live region | **FAIL (minor).** CR-14. |
| Types imported, not redefined | **PASS.** `use-coordination.ts:51` re-exports `PartyKind` from `@patina/types` rather than keeping a copy; W2a §7 records `coordination/party.ts`'s hand-written eleven being deleted for the same reason. `StateWordFamily`, `resolveStateWord`, `ALL_FIELD_TRADES`, `ALL_AUTHORITY_SCOPES`, `PartyRole` etc. all come from the packages. The only local vocabularies are genuinely portal-local (`DirectoryChip`, `AddedPersonKind`, `MakerLens`). |
| No ad-hoc fetch | **PASS.** One `fetch(` in the wave: `people/compliance-chase.ts:47` → `/api/people/chase-renewal`, the portal's own route. No direct call to a NestJS service. |

## 5. What I did NOT check

- The visual walk (the QA reviewer owns 3000/3002 and `next start`; no dev
  server or Playwright run was started here).
- Migrations 00592–00627 beyond reading the policies, triggers and comments
  the portal writes against — W1's own review rounds own those.
- iOS (`apps/mobile/Capture`) and the edge functions.
