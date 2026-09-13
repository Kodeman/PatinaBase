# W2 fix log — round 5

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`, from HEAD `2f4964494`.

Six findings were assigned and six were fixed: QA-1, QA-2, QA-3, QA-4 (runtime
QA, `w2-review-r5-qa.md`) and CR5-1, CR5-2 (adversarial code review,
`w2-review-r5-code.md`). Nothing else on either list was touched.

No dev server was started; ports 3000/3002 were never bound by this session. No
production anything. One local DDL: the `people_directory` view was replaced in
the local database from the edited migration, so the next QA round reads the
fixed view (see QA-1).

## Gates

```
$ pnpm --dir <worktree> --filter @patina/designer-portal type-check   → tsc --noEmit, EXIT 0
$ pnpm --dir <worktree> --filter @patina/supabase        type-check   → tsc --noEmit, EXIT 0
$ cd apps/designer-portal && npx jest \
    src/components/document/people src/components/document/roster src/lib/document \
    'src/app/(document)/desk' src/components/document/mobile \
    src/components/document/coordination src/components/document/__tests__
  Test Suites: 196 passed, 196 total
  Tests:       3268 passed, 3268 total
  (One earlier run of the same set reported a Jest WORKER crash with zero test
  failures — 195/196 suites, 3268 tests passed; the immediate re-run was
  196/196. Named because it looked like a failure and was not one.)
$ psql … -f supabase/tests/people/w1b_compliance_authority_directory_test.sql
  … block 13 raises — see "Pre-existing, NOT caused here" below.
  Block 26 (new, QA-1) run standalone on the same fixture: passed, and fails
  26b on the pre-fix view (negative control).
```

`@patina/admin-portal build` was not run: no file under `packages/` changed, so
no dist and no shared package moved.

---

## QA-1 — BLOCKING — the identity line never printed the firm's name

**What changed.** `supabase/migrations/00626_people_directory_v4_seats.sql`, the
CONTACTS branch of `public.people_directory` (the `jsonb_build_object` at the
branch's `meta`, and the branch's `FROM`):

```sql
'company_name',    COALESCE(
                     NULLIF(btrim(sc.company_name), ''),
                     NULLIF(btrim(firm.company_name), ''),
                     NULLIF(btrim(firm.full_name), '')
                   ),
…
LEFT JOIN public.studio_contacts firm ON firm.id = sc.company_id
```

The DB half was chosen over the client-side lookup map the finding offers as an
alternative, because `meta.company_name` has four readers — `directoryFirmOf`
(the Directory row's second line), `personIdentityLine`, the person card's
header (`person-profile.tsx:264-266`) and the Directory's own search haystack
(`people-derivation.ts:1024`) — and one join answers all four. No portal file
changed for this finding.

`sc.company_id` is the pointer `sync_studio_contact_company_pointer_trg` keeps
equal to the open `studio_person_affiliations` row, so joining on it IS joining
through the affiliation; the trigger is the table's own synchroniser (verified
on `\d studio_person_affiliations`). A firm's own row has `company_id IS NULL`,
so the join misses there and the firm still names itself.

**Applied locally**, since the QA round reads the live view and not the file:
lines 1388–1910 of the edited migration (`CREATE OR REPLACE VIEW … WITH
(security_invoker = true)` through its final `;`) were executed against
`postgresql://postgres:postgres@127.0.0.1:54322/postgres`. `reloptions` after
the replace: `{security_invoker=true}` on both `people_directory` and
`people_directory_seats` — unchanged.

**Evidence**, read as `designer@patina.dev` (RLS-honouring, inside a rolled-back
transaction):

```
 display_name       | company_id                           | company_name
 Dana Kowalski      | d0e20000-0000-0000-0000-000000000003 | Northgate Electric
 Frank Bauer        | d0e20000-0000-0000-0000-000000000006 | Twin Cities Drywall & Plaster
 Joe Wozniak        | d0e20000-0000-0000-0000-000000000009 | Cedar & Iron Framing
 Northgate Electric | (null)                               | Northgate Electric
 Pete Rusk          | d0e20000-0000-0000-0000-000000000004 | Rusk Mechanical

 firm_id_without_name | with_firm_id
                    0 |           23
```

Before the change, Dana's `company_name` was NULL with the same `company_id` —
the finding's own reading, re-confirmed here by the negative control below.

**Test.** `supabase/tests/people/w1b_compliance_authority_directory_test.sql`
gains block 26: Dana's row must carry both the pointer and the name, the firm's
own row must still name itself, and no CARDED identity may carry a firm id with
no name (`role = 'contact'`; the party branch's `company_name` is the seat's own
free text and is not this finding). Negative control: with the pre-fix view
restored, block 26 raises `26b her identity line must be able to say the firm's
name, got <null>`; with the fix, `26. … passed`.

**What was NOT changed.** `people_directory_seats.company_name` still reads
`project_parties.company_name` (the seat's own snapshot, 00626:2071) — a seat
fact, outside this finding.

---

## QA-2 — MAJOR — "New person" opened the rolodex picker, not the Add sheet

**What changed.** `apps/designer-portal/src/components/document/roster/call-sheet.tsx`:

* the head's `New person` act now opens a new `addOpen` state instead of
  `openPicker(true)`;
* `<AddPersonSheet>` is mounted beside `<RolodexPicker>` and `<SiteAccessCard>`,
  with `organizationId={bookOrgId}` and `initialProjectId={projectId}`;
* `bookOrgId` is the same fold the Room and the picker use
  (`directoryRolodexOrgId(directory) ?? sorted-membership`), never
  `orgs.find(o => o.type === 'design_studio')` over an unordered read.

`apps/designer-portal/src/components/document/people/directory/add-person-sheet.tsx`
gains one optional prop, `initialProjectId`, seeded into `projectId` on open
(the Call Sheet already stands on a job, so the seat's project is answered
rather than asked). The Directory passes nothing and is unchanged.

`RolodexPicker`'s `startInAdd` is untouched: the `openMode="add"` doorways
(kickoff band, ⌘K, the page listener) still reach the picker's inline form —
they were not named in the finding.

Stacking: `RoomSheet` (the Add sheet's shell) renders through a portal at
`z-[55]` and registers with the managed modal stack, above `DocSheet`'s `z-50`
— the Call Sheet Wave 3 work that made exactly this pairing legal.

**Test.** `roster/__tests__/call-sheet.test.tsx` — "opens it already adding on
New person" is replaced by "opens the Add sheet on New person, on this job, not
the picker", asserting `AddPersonSheet` was last called with `{open: true,
initialProjectId: 'okonkwo'}` AND `RolodexPicker` with `{open: false}`. The
sibling test "opens the picker on From the rolodex" is untouched and still
passes, so the other head act still reaches the picker.

---

## QA-3 — MAJOR — a nameless "Client" row above the two real household seats

**What changed.** `apps/designer-portal/src/lib/document/roster-derivation.ts`,
`callSheetProjection`'s tail:

```ts
const synthetic = syntheticClientRow(client);
if (synthetic && bands.clientSide.length === 0) {
  bands.clientSide.unshift(callSheetRowFromClient(synthetic));
}
```

The name/`profile_id` claim test is gone. It compared the document's
`client_name` — a household LABEL, which for Okonkwo reads "Client" — against
each real seat's name, matched neither Adaeze nor Chidi, and so printed a third
row and counted three where two stand. Direction §4's inventory says the row is
"replaced by real household seats", so any real client-side seat now answers the
client side; the row survives only where the job lists nobody at all (a legacy
project with no `client`/`client_rep` seat), where it is still the only way the
person the job is for gets named.

`syntheticClientRow` itself is kept: it is the function that builds that
remaining row, and `groupRoster`'s older call site (line 278) is dead in product
code — `grep -rn "groupRoster(" apps/designer-portal/src` returns only its own
module and the test file — so it was left alone.

**Evidence.** On the live local DB the Okonkwo project has exactly two
client-side seats and no third row:

```
$ psql … "select display_name, party_kind from project_parties
          where project_id = (select id from projects where name ilike '%Okonkwo%')
            and party_kind in ('client','client_rep');"
  Adaeze Okonkwo | client
  Chidi Okonkwo  | client_rep
```

(`projects` carries no `client_name` column at all — the document row derives
it, which is why the label rather than a person's name reached the claim test.)

**Test.** `lib/document/__tests__/call-sheet-derivation.test.ts`: the old
"prepends the document own client when no seat claims them" becomes "prepends
the document own client when the job lists nobody" (seats filtered to exclude
`client`/`client_rep`), and a new case, "drops the document client row where
real household seats stand", feeds `client_name: 'Client'` against the full
fixture and asserts the client side reads exactly `['Adaeze Okonkwo', 'Chidi
Okonkwo']` — the finding's own scenario. "Never prints the same client twice"
is unchanged and still passes.

---

## QA-4 — MAJOR — raw E.164 numbers on two first-class surfaces

**What changed.** Display formatting at render time (the finding's second
option) rather than a seed rewrite: a channel value and an emergency line are
studio-written columns, and normalizing only the local seed would leave every
real row raw.

`components/document/people/tel-link.tsx` gains `telDisplay(phone)`: an
unambiguous North-American ten-digit number (with or without its country code)
is shaped `(612) 555-0111`; anything else — an extension, a sentence, an
international number — comes back exactly as written. `TelLink`'s own contract
is untouched (it still prints its `label`, defaulting to the stored value), so
the Directory row, the roster row and the contact-rule line are unchanged.

Call sites, both named by the finding:

* `people/reach-access.tsx:354` — `<TelLink phone={channel.value}
  label={telDisplay(channel.value)} />` (the Channels rows on the person card
  AND the company card);
* `roster/site-access-card.tsx` — the "Who to call first" line's composed text
  and the key holder's number.

The `href` is still built from the stored digits, so dialling is unchanged.

**Tests.** `people/__tests__/people-primitives.test.tsx` — a new `telDisplay`
describe: `+16125550111`, `6125550111` and `612.555.0111` all print
`(612) 555-0111`; `+442079460958`, `+16125550111 x12`, `ask the office` and
`null` come back untouched. `people/__tests__/reach-access.test.tsx` — a channel
stored as `+16125550111` renders the link named `(612) 555-0111` with
`href="tel:+16125550111"`. `roster/__tests__/site-access-card.test.tsx` — an
emergency line stored as `+16125550109` reads `Luis Ochoa, Superintendent, (612)
555-0109` and still dials `tel:+16125550109`.

---

## CR5-1 — MAJOR — two rolodex writes still guessed the studio, and each failure left an orphan card

**What changed.** Both write sites now resolve the studio from the SEAT'S
PROJECT with `useProjectRecordedStudio(projectId)` — the resolver
`assert_project_party_cards()` (00624) checks `studio_contact_id` against — and
mint nothing where it resolves NULL.

`people/directory/add-person-sheet.tsx`:

```ts
const { data: recordedStudioId } = useProjectRecordedStudio(
  open && projectId ? projectId : null,
);
…
if (!chain.cardId && wantsCard && recordedStudioId) {
  const card = await promoteToCard.mutateAsync({
    organizationId: recordedStudioId, party,
  });
```

and, where the job records no studio and a card was wanted, the confirmation
says what was not kept rather than dropping it in silence: "… This job isn't
attached to a studio yet, so the number and the note ride on the seat, not on a
card in the book." The seat, the authority grant and the invalidations are
unchanged — the seat write was never the part the guard refused.

The sheet's `organizationId` prop is untouched and still answers the OTHER
question it was introduced for (which book the firm list and the membership-role
read come from).

`roster/rolodex-picker.tsx`:

* `useProjectRecordedStudio(open ? projectId : null)` → `canStamp`;
* the stamp mints into `recordedStudioId`, never `organizationId` (which stays
  the search scope for `useStudioContacts`);
* where `canStamp` is false the stamp is not rendered at all and the sheet says
  "This job isn't attached to a studio yet, so nobody can be saved to the book
  from here. They still go on the call sheet." — the act is not offered rather
  than offered and refused;
* both `catch`es now run through `writeErrorMessage` instead of `e instanceof
  Error`, so a PostgREST rejection (a plain object) and 00624's bare refusal
  tokens reach the face as sentences.

`writeErrorMessage` moved out of `add-person-sheet.tsx` into
`lib/document/write-error.ts` (byte-identical body, docblock carried) so the two
sheets share one translator; nothing else imported it
(`grep -rn writeErrorMessage apps/designer-portal/src` before the move returned
only that file).

**Evidence.** The finding's own probe stands: on the live local DB five of eight
projects record no studio, and a card stamp there raises
`party_card_project_has_no_studio`. What changed is that neither surface now
reaches that raise: no card is minted where the resolver answers NULL.

**Tests.** `roster/__tests__/rolodex-picker.test.tsx` — a new case with the
resolver answering NULL asserts the stamp checkbox is absent, the sentence is
printed, `useAddStudioContact` is never called, and the party is still added
with `studioContactId: null`. The two standing stamp cases (ON writes the card
first, OFF writes none) are unchanged and still pass.
`people/directory/__tests__/add-person-sheet-kinds.test.tsx` — a new case with
the resolver answering NULL asserts `promote` and `addChannel` are never called
and the confirmation carries the clause; the existing mint case still asserts
`promote` called with `organizationId: 'org-1'`.

---

## CR5-2 — MAJOR — a whole-edition revoke that said nothing, under an "Optional" prompt its RPC refuses

**What changed.** `people/access-grant-list.tsx` reads
`accessGrantRevokeRoute(grant.tier)` and honours the two flags the table has
been declaring:

* `revokesWholeScope` → a consequence sentence ABOVE the confirm, printed
  before the act: "This closes the review for everyone on this edition, not only
  Dana Kowalski." (`grantRevokeConsequence(tier, subjectName)`, exported; falls
  back to "not only this person" where no name is in hand).
* `reasonRequired` → the prompt becomes "Say why the door closes. Required, at
  least five characters, kept with the record." (`REVOKE_REASON_REQUIRED_PROMPT`),
  the input carries `required` + `minLength`, and `close()` refuses a reason
  under five characters with "Write at least five characters saying why it
  closes." rather than letting `revoke_project_review_access`'s own RAISE answer.

`REVOKE_REASON_PROMPT` (the "Optional" wording) is unchanged and still serves
every route whose RPC does not require one. `AccessGrantList` takes an optional
`subjectName`; `reach-access.tsx` passes the `personName` it already holds.

**Tests.** `people/__tests__/reach-access.test.tsx` — a new describe over a
`project_review` grant: pressing Revoke prints the consequence sentence naming
Dana Kowalski, the prompt reads Required, and a two-character reason is refused
in words. The `field_link` grant row's own test is unchanged and still passes,
so a per-subject revoke gained no sentence it should not carry.

---

## Pre-existing, NOT caused here

`supabase/tests/people/w1b_compliance_authority_directory_test.sql` raises at
block 13 on this local database:

```
ERROR: 13h a co-member of another tenant read 2 party-branch Directory row(s)
       whose consent word they cannot source
```

Verified pre-existing: the same file raises the same error at the same block
with the **pre-fix** `people_directory` view restored (HEAD's definition, applied
and then reverted). The failing leg is the PARTY branch, which this round did
not touch, and the shape reads as local data drift on a shared dev database
rather than a migration defect. Flagged, not chased — it is outside the six
assigned findings.

## What was NOT touched

* No new migration was written; 00626 was edited in place (unapplied on prod,
  this branch's own file, the pattern every earlier W1 round used) and replayed
  into the local database.
* `groupRoster`'s own synthetic-client prepend (`roster-derivation.ts:278`),
  dead in product code.
* The party branch's `meta.company_name`, and `people_directory_seats`.
* `RolodexPicker`'s `startInAdd` path and the `openMode="add"` doorways.
* Every other finding in `w2-review-r5-qa.md` (QA-5 … QA-12) and
  `w2-review-r5-code.md` (CR5-3 … CR5-22), which were not on this round's list.
