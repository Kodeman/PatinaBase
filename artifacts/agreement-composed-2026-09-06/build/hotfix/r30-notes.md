# R30 hotfix — the origin agreement reaches the homeowner

Branch `agreement/r30-origin-door`, cut from `origin/main` at `a6584dbc5` (main had
moved past the `61a68919d` named in the brief; `a6584dbc5` is the W1 deploy-report
commit). Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-r30`.

Scope: `apps/client-portal` only. **No migration.** No change to `@patina/types`, to
`@patina/supabase`, to any edge function, or to the sign route.

---

## 1. What the database already does (proved, not assumed)

Every read and every write on the signature path is scoped by `proposals.client_id`,
never by project. Proved against the LOCAL stack (head `00575`) inside a single
transaction that was **rolled back** — nothing persisted, no business row was written:

```sql
BEGIN;
INSERT INTO public.proposals (id, designer_id, client_id, title, status,
                              document_kind, commercial_state, sent_at, total_amount, project_id)
SELECT '00000000-0000-4000-8000-000000000301', p.designer_id, p.client_id,
       'Origin agreement (rolled back)', 'draft', 'design_services', 'draft', NULL, 0, NULL
FROM public.proposals p WHERE p.id = 'e2000000-0000-0000-0000-0000000000a2';
INSERT INTO public.proposal_service_terms (...) VALUES (...);
INSERT INTO public.proposal_service_rates (...) VALUES (...);
SET LOCAL app.proposal_send_id = '…301';   -- 00412's own send GUC
UPDATE public.proposals SET status='sent', commercial_state='sent', sent_at=now() WHERE id='…301';
…
ROLLBACK;
```

| probe | as | result |
|---|---|---|
| `get_client_commercial_document_bundle('…301')` | the addressed homeowner (`authenticated`, jwt sub = `client_id`) | `documentKind design_services`, `commercialState sent`, `projectId null` — **served** |
| `get_client_proposal_bundle('…301')` (the sign route's preflight) | same | returns the proposal — **served** |
| `list_client_proposals()` | same | row present; the `project_id` **key is absent** (`jsonb_strip_nulls`) |
| `sign_design_services_agreement_with_trusted_ip('…301', 'Ada Vale', <client>, '203.0.113.9')` | `service_role`, exactly as the route calls it | `{"commercialState":"client_signed","newlyClientSigned":true,"projectId":null,…}` — **signed** |

So `get_client_commercial_document_bundle` does **not** refuse a project-less read for
its addressed homeowner, and neither does the sign RPC. **No migration was minted and
the sign route needed no branch.** The defect was entirely in the client portal's own
composition.

Two guards were met on the way in and are worth recording, because they are what make
the honest mint the only mint: `guard_proposal_copy_immutability` refuses to *unset*
`project_id` ("proposal project linkage may only be set once through
`activate_proposal_as_project`"), and `guard_commercial_proposal_authority` refuses a
plain `UPDATE` of `commercial_state` ("commercial lifecycle may only change through its
canonical RPC"). An origin agreement therefore has to be **created** project-less; it
cannot be made project-less after the fact.

## 2. What changed

| file | change |
|---|---|
| `apps/client-portal/src/components/threshold/letterbox-door.tsx` | reads pending **origin agreements** (`useClientProposals` → `partitionProposals().pending`, filtered to `commercialSummaryFromProposal(p).projectId ?? null === null` **and** `kind === 'design_services'`) and hangs the same `DoorGate` the house hangs, at `#door`. Plate, waiting sentence, hold gate and the letterbox all widened to cover both instruments. Sealed-door state mirrors `Threshold`'s W3-01 rule so the receipt survives the refetch that signing triggers. |
| `apps/client-portal/src/components/threshold/door-gate.tsx` | `projectId: string` → `string \| null`. `DoorActs` (`projectId: string \| null`) and `invalidateSignedCommercialDocument` already took null; nothing else needed changing. |
| `apps/client-portal/src/lib/analytics/events.ts` | `makingEvents.gateFollowed`'s `projectId` widened to `string \| null` for the same reason. |
| `apps/client-portal/src/app/page.tsx` | the zero-project branch now passes `namedProposalId` (`?proposal=`) to the household door. |
| `apps/client-portal/src/lib/data/active-project.ts` | comment only — see §3. |

Homeowner copy added: `"One agreement is waiting for you."` / `"Two agreements are
waiting for you."`, joined with the existing letter sentence when both stand. No badge,
no chip, no count pill, no colour, and none of the forbidden words. The door itself is
the shipped instrument, so its header ("Shut since 4 September · it opens on your name"),
its consent line and its `Sign and accept` act are byte-identical to a project-bound
agreement's.

## 3. Deliverable (2), and the one deviation from the brief's wording

The brief asked that `resolveHouseForInstrument` "keep `?proposal=` … and route to that
door instead of returning null". It returns a **house id**, and an origin agreement has
no house — returning one would be inventing a house for a paper bound to none, which is
exactly what `guard_proposal_copy_immutability` exists to prevent at the other end.

The param was never dropped by the resolver. `page.tsx` computes `namedProposalId`
straight off the query string, independently of it; the resolver's null is correct and
the param was simply **discarded at the render site** — the zero-project branch rendered
`<LetterboxDoor />` with no props. That is the line that changed. `resolveHouseForInstrument`
gets a comment recording why its `projectIds.length === 0` guard is right, so the next
reader does not "fix" it, plus three tests pinning that it names no house for a
project-less paper, reads nothing to find that out, and still names the house a
**countersigned** agreement was bound to.

Reported as a deviation rather than absorbed silently.

## 4. Double-render (deliverable 4)

Countersigning creates the project and writes the `project_commercial_documents` row;
`list_client_proposals` coalesces that binding into `project_id` (00422), so the summary
stops reading null, the household door drops the paper, and `/` opens the house instead.
Two tests pin it — one on the component (`drops the agreement the moment countersigning
binds it to a house` → no `[data-threshold-unit="door"]`, empty state) and one on the
page (`opens the house, not the household door, once countersigning made one`).

## 5. Gates

Run from the worktree.

```
pnpm --filter @patina/client-portal type-check          → clean (tsc --noEmit, no output)
pnpm --filter @patina/client-portal test:coverage       → 129 suites / 2008 tests passed
    coverage: 74.12 lines / 69.46 branches / 74.17 functions / 76.43 statements
    (floor 70 / 60 / 70 / 70 — met)
npx playwright test --workers=1 tests/origin-door.spec.ts  → 2 passed (new)
npx playwright test --workers=1 tests/threshold.spec.ts     → 13 passed, 1 failed
```

The single `threshold.spec.ts` red is **pre-existing seed drift on the shared local
stack**, not this change: `threshold.spec.ts:250` asserts `client@patina.dev` keeps
`MULTI_OTHER_HOUSE_COUNT = 2` other houses and found 4. The stack holds five projects for
that client — the seed's three plus two `Client User — design services agreement` houses
created at `12:18:25Z` and `12:27:14Z`, roughly two hours before this lane's first
browser run (`14:20:01Z`), by another lane's countersign. The assertion sits on the
multi-house `<Threshold>` path, which this change does not touch; the only edited render
branch is `page.tsx`'s zero-project arm. `threshold.spec.ts:158` (the TZ one named in the
brief) **passed** on this run. `plans-link.spec.ts` and `share-link.spec.ts` were not run.

The e2e was driven against a dev server started by hand on :3002 with
`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`, the CLI demo anon key, and
`SUPABASE_SERVICE_ROLE_KEY` from `supabase status -o env` — the worktree carries no
`.env.local`, so nothing could point at Strata.

## 6. The e2e touchpoint

`apps/client-portal/tests/origin-door.spec.ts` (new). The harness **can** mint a
project-less proposal, and does, through the honest path only:

1. `auth.admin.createUser` → a real household with **zero** projects (every seeded client
   owns houses, and the defect only exists at zero);
2. `profiles.role = 'homeowner'`;
3. a `designer_clients` row — `send_commercial_document` refuses a document whose
   relationship does not name this household (00423:1598-1608);
4. `proposals` insert at `draft` **with no `project_id`** — the origin shape itself;
5. `upsert_design_services_draft` (terms + one role rate);
6. `get_commercial_document_send_snapshot` → `send_commercial_document`. `send_proposal`
   refuses a commercial document outright ("commercial documents send through
   `send_commercial_document`"), which is how that rail was found.

It then asserts the precondition in the database (zero houses, `project_id NULL`,
`commercial_state 'sent'`) before driving the browser, and covers: the door standing at
`#door` with the agreement's heading, the waiting sentence, the typed-signature field,
the consent line and `Sign and accept`; no nav (R135); and the retired
`/proposals/<id>` address landing on that same door via `?proposal=<id>`.

Signing is **not** driven in the browser — the hold-to-sign gesture is covered by the
unit suite (`threshold.test.tsx`, which asserts the POST to
`/api/proposals/<id>/sign` and the surviving receipt) and by the SQL probe in §1. Keeping
the spec read-only lets it run beside every other spec.

It leaves throwaway `r30-origin-*@patina.dev` households behind, in the same spirit as
`pay-link.spec.ts`: this is the local stack and `supabase db reset` is the broom. Four
such households (from this lane's development runs) are on the shared local stack now;
sweeping them was attempted and refused by `guard_commercial_authored_child`
("proposal_service_rates is immutable after its proposal leaves draft"), and reaching
past that guard is not a lane's call. Each owns zero projects and one sent agreement, so
the only assertion they could drift is a count of `designer@patina.dev`'s clients.

## 7. Not covered, deliberately

- **A household that already has a house and is sent a second, project-less origin
  agreement.** Same root shape — `Threshold` filters papers on the summary's `projectId`,
  so a project-less agreement is invisible in every house — but R30 rules on "the
  household door **with zero projects**", and there is no honest answer to *which* house
  should draw a paper bound to none. Flagged here rather than built.
- `service_addendum` — out of scope by the ruling; an addendum amends a standing
  engagement and always has a house.
- Nothing was deployed. No production mutation of any kind was run.

---

## 8. Round 1 review — the two majors, fixed (2026-09-07)

Both findings landed on the same file, and both were the same species of
mistake: the household door had been built for the moment the paper ARRIVES and
for nothing on either side of it.

### R30-1 — the door vanished the moment she signed

`partitionProposals(...).pending` is `commercial_state = 'sent'`, and `sealed`
is component state that dies with the page. Her signature moves the agreement
to `client_signed` — and the studio's countersignature, which is what creates
the project, comes days later. So between the two acts the paper is signed AND
still bound to no project, which is precisely the shape no door drew: she
signed, came back the next morning, and met "No active projects yet" over the
paper she had just put her name to. A project-bound agreement never does this
(`threshold.tsx:463-477` turns each accepted document into a lasting
`ThresholdReceipt`), so the household door was diverging from the ruling's
"exactly as a project-bound one does".

Fixed by borrowing the house's own back matter rather than inventing a second
idiom for it: `letterbox-door.tsx` now reads `partitionProposals(...).accepted`
through the same project-less `design_services` filter as `origins`, mints the
same `instrument:<proposalId>` entry `threshold.tsx` mints
(`Design services agreement · <title>`, dated off the summary's `executedAt`),
and hangs the house's own `Previously` component under the doors. The line
unfolds into `InstrumentReading` — the paper read in full — exactly as it does
in a house. `Previously` renders nothing when it holds nothing, so a household
with only a letter is byte-identical to before.

Three consequences wired with it: the empty-state/hold gate now asks
`anythingHere` (waiting OR kept) so a household whose only paper is signed no
longer falls through to `ProjectsEmptyState`; the plate's designer fallback
gains `kept[0].designerId`, so a visit where nothing is waiting still reads the
right letterhead; and countersigning still drops BOTH the paper and its record
(the summary's projectId stops being null), so the house and this door can never
show the same agreement at once.

### R30-2 — one plate's studio name on every signature receipt

`studioName` was resolved once per page — from the letter in the slot when one
exists, else `origins[0].designerId` — and handed to every `DoorGate`, which
prints it as `<holder> has your signature. You'll have a copy.` Two reachable
shapes mis-attributed a legally consequential act: a studio invoice from studio
A alongside an origin agreement from studio B (the invoice wins the plate, so
B's agreement is signed under A's name), and two origin agreements from two
studios (the code explicitly supports this — the sentence pluralises to "Two
agreements are waiting for you.").

Fixed by resolving identity per door: a small `OriginDoor` wrapper calls
`useStudioIdentity({ studioId: null, designerId: door.designerId })` off the
`SealedDoor` record that already carried the designer, and passes that name to
its own `DoorGate`. The query key is `['studio-identity', {studioId, projectId,
designerId}]`, so two doors from one studio still share a single read, and the
receipt only exists after she signs — long after the read settles — so no door
waits on it. The plate is unchanged: it is the letterhead, and it still names
the studio whose letter is in the slot.

### Tests

Two jest cases in `threshold.test.tsx`, both proven to FAIL against the
pre-fix component (reverted `letterbox-door.tsx` to HEAD, ran the block: 8
passed / 2 failed; restored: 10 passed):

- `keeps the signed agreement on the next visit, before the studio countersigns`
  — a `client_signed`, project-less agreement on a fresh render: no empty state,
  the plate still reads its studio, one `previously-line` reading
  `Design services agreement · … / 6 September / SIGNED`, and no door.
- `names each agreement's own studio on the receipt for its signature` — two
  origin agreements from two designers; the plate reads the first one's studio
  and the Ash agreement, signed end to end through the hold gesture, prints
  `The Ash Studio has your signature.`

`drops the agreement the moment countersigning binds it to a house` gained one
line: the record leaves with the paper.

One e2e case added to `origin-door.spec.ts`, which is the finding's own
reproduction driven in a real browser. The `beforeAll` is refactored into
`mintOriginAgreement(title)` and called twice — one household left at `sent`,
one signed — so no test depends on another having run. The signature goes
through `sign_design_services_agreement_with_trusted_ip` with exactly the four
arguments `app/api/proposals/[id]/sign/route.ts` passes it; that RPC records the
client's act and creates no project, so the precondition (`client_signed`,
`project_id NULL`, zero houses) is asserted in the database before the browser
opens. The spec now leaves TWO throwaway `r30-origin-*@patina.dev` households
per run instead of one; both own zero projects.

### Gates, re-run from the worktree

```
pnpm --dir <wt>/apps/client-portal type-check        → clean (tsc --noEmit, no output)
pnpm --dir <wt>/apps/client-portal test:coverage     → 129 suites / 2010 tests passed
    coverage: 74.15 lines / 69.48 branches / 74.22 functions / 76.46 statements
    (floor 70 / 60 / 70 / 70 — met)
    letterbox-door.tsx 97.7 / 84.69 / 92.59 / 98.75
npx playwright test --workers=1 --project=chromium tests/origin-door.spec.ts → 3 passed (58.3s)
npx playwright test --workers=1 --project=chromium tests/threshold.spec.ts   → 13 passed, 1 failed
```

The single `threshold.spec.ts` red is the SAME pre-existing seed drift §5
recorded, unchanged by this round: `threshold.spec.ts:250` expects
`MULTI_OTHER_HOUSE_COUNT = 2` other houses for `client@patina.dev` and finds 4.
Confirmed at the database this round — the stack holds 8 projects, 5 of them
that client's: the seed's three plus two `Client User — design services
agreement` houses created at `12:18:25Z` and `12:27:14Z` by another lane's
countersign. It sits on the multi-house `<Threshold>` path, which this change
does not touch. The two households this lane's e2e minted own zero projects and
appear nowhere in that list.

### No migration — the bundle does not refuse a project-less signed read

The ruling allowed one minimal widening "if the existing bundle refuses
project-less reads". It does not, and that is proved rather than assumed: the
third e2e unfolds the kept line and asserts the paper reads in full —
`previously-body` carries the agreement's own scope prose, with neither
`instrument-reading-absent` nor `instrument-reading-refused` present. So
`get_client_commercial_document_bundle` serves a `client_signed`,
`project_id NULL` design-services document to the homeowner it is addressed to,
and no migration was minted.

The e2e ran against a dev server Playwright started itself on :3002 with the
config's pinned `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321` and the CLI
demo anon key; `SUPABASE_SERVICE_ROLE_KEY` was read out of the running
`supabase_storage_supabase` container's env rather than any `.env` file. The
worktree carries no `.env.local` (only `.env.example`), so nothing could point
at Strata. Nothing was deployed; no production mutation of any kind was run.

---

## Round 2 — R30-9: the kept record was permanently undated

**The defect, as found.** `letterbox-door.tsx` dated the kept line off
`parseSourceDate(commercial.executedAt)`. `commercialSummaryFromProposal`
resolves `executedAt` from `executedAt / executed_at / signedAt / signed_at`,
and `list_client_proposals` projects only `proposals.signed_at` — confirmed
against the live local definition (`pg_get_functiondef`, head 00575): the
payload carries `sent_at`, `signed_at`, `created_at`, `updated_at`, and no
`executed_at`. `proposals.signed_at` has exactly one writer,
`_countersign_design_services_agreement_impl` (`UPDATE public.proposals SET
status='accepted', commercial_state='executed', signed_at =
v_client_signature.signed_at`), so through the whole window this record exists
for — her signature to the studio's — the column is NULL and the line rendered
`—`. And a countersigned paper has left this door (its binding coalesces into
`project_id`, so `/` opens the house), which is why the house never shows the
undated shape and this door only ever showed it.

**The fix.** `date: parseSourceDate(commercial.executedAt ?? proposal.updated_at)`.
`_sign_design_services_agreement_authorized` stamps `updated_at = now()` in the
same statement that moves the row to `client_signed` (`UPDATE public.proposals
SET commercial_state='client_signed', updated_at = now()`), so `updated_at` is
her own signature's timestamp — the date the record is a record of. It is the
only such date the list row carries: `proposals` has no client-signature
column, and the signature's own `signed_at` lives in
`commercial_document_signatures`, which only the bundle returns and the bundle
is fetched lazily, on unfold. `executedAt` stays first so nothing changes if a
countersigned row is ever read here.

**The fixture that could not fail.** The covering unit test carried
`signed_at: '2026-09-06'` on a `client_signed` row — a shape the RPC never
emits. It now carries `updated_at: '2026-09-06'` and no `signed_at`, which is
the real payload. Proved it gates: with the source line reverted to
`parseSourceDate(commercial.executedAt)` the test fails
(`previously-date` received `—`), and passes with the fix.

**And it is proved against real data.** `origin-door.spec.ts`'s kept-record
test now asserts `previously-date` matches `/^\d{1,2} [A-Za-z]+$/`. Against
the same reverted source, on the local stack, it failed with
`Received string: "—"` (locator resolved 9× to
`<span data-testid="previously-date" …>—</span>`); with the fix, green.

### Gates (round 2, from the worktree)

```
pnpm --dir apps/client-portal type-check                    → clean (tsc --noEmit, no output)
pnpm --dir apps/client-portal test:coverage                 → 129 suites / 2010 tests passed
playwright test --workers=1 tests/origin-door.spec.ts       → 3 passed (29.3s)
playwright test --workers=1 tests/threshold.spec.ts         → 13 passed, 1 failed
```

The single `threshold.spec.ts` red is the **same pre-existing shared-stack seed
drift** round 1 recorded, re-confirmed by SQL rather than assumed:
`threshold.spec.ts:250` expects `client@patina.dev` to keep
`MULTI_OTHER_HOUSE_COUNT = 2` other houses and finds 4. The stack holds five
projects for that client — the seed's three (`11:56:31Z`) plus two
`Client User — design services agreement` houses at `12:18:25Z` and `12:27:14Z`,
another lane's countersign, both predating every browser run in this round. It
sits on the multi-house `<Threshold>` path; nothing in this round touches it.

The e2e ran against a dev server started by hand on :3002 with
`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`, the CLI demo anon key, and
`SUPABASE_SERVICE_ROLE_KEY` read from `supabase status -o json` — the worktree
carries no `.env.local`, so nothing could reach Strata. `plans-link.spec.ts` and
`share-link.spec.ts` were not run. No migration was needed and none was minted;
no production mutation of any kind was run.

---

## Round 3 — the amendment's other half, the date's real source, and the sentence over a sealed door

Review round 3 returned one major, one minor and three nits. All five are
addressed below; nothing from this round shipped unfixed.

### Carried findings and their disposition

| # | Sev | What | Disposition |
|---|-----|------|-------------|
| R30-1 | blocker | The door vanished the moment she signed | **Fixed**, round 1 (§8) |
| R30-2 | blocker | One plate's studio name on every signature receipt | **Fixed**, round 1 (§8) |
| R30-9 | major | The kept record was permanently undated | **Fixed**, round 2 |
| R30-3 | major | The studio-invoice door held blank behind the new proposals read | **Fixed**, round 3 (below) |
| R30-13 | minor | The kept record's date came from `proposals.updated_at`, a third source the ruling did not name | **Fixed**, round 3 (below) — now the client's own signature row |
| R30-11 | nit | "Nothing is waiting for you." printed over a door carrying her fresh signature | **Fixed**, round 3 (below) |
| R30-10 | nit | Immediately after signing the paper stands twice — sealed door and new record | **No change, by design** (below); now asserted so it cannot be mistaken for a regression |
| R30-14 | nit | The ship note did not record what shipped unfixed | **Fixed** — this table |
| R30-4 … R30-8, R30-12 | — | Raised in rounds 1–2 and answered there (§8, §Round 2) | Closed in their own sections |

Two items the ruling itself carried OUT of this hotfix and INTO Wave 2 (client
lane), and which are therefore correctly absent from this branch:

- the "papers without a house" leaf on every house's door, so a project-less
  paper is reachable from a household that already has a house;
- a dedicated test for the `plateAsked` hold-gate.

One item the ruling sent to the main backlog: the e2e harness leaves throwaway
households behind on the local stack (recorded in §7).

### R30-3 — the letter may not be held behind the papers

`letterbox-door.tsx` held the whole page on `proposalsQuery.isPending`
unconditionally, so a household with a standing studio invoice — a money
surface that was already drawable off a settled `useClientInvoices` — got the
blank `letterbox-door-hold` div until `list_client_proposals` answered.
`useClientSafeProposals` (`packages/supabase/src/hooks/use-proposals.ts:402`)
sets no `retry`, so it inherits `retry: 2` from `app/providers.tsx:26`: a slow
or failing papers read blanked the letterbox across three attempts and their
backoff. The R30 round-2 amendment is explicit — the studio-invoice door
"renders beside the origin agreement, never blank behind it."

The hold is now `standing.length === 0 && proposalsQuery.isPending`. It keeps
the case it exists for: with no letter standing, the page's whole answer is the
papers', and printing the empty state before they arrive is the reversal this
surface may not perform. With a letter standing, an agreement can only ADD a
sentence — it can never take the letter away — so there is nothing to reverse.

Covered by `draws the letter while the papers are still coming, never blank
behind them` (settled invoices + pending proposals: no hold, plate, letter
sentence and `letterbox-regarding` all present), standing beside the existing
`holds rather than saying nothing is waiting while the papers are coming` (no
invoices + pending proposals: still holds). Proved it gates: with the guard
reverted to the unconditional read the new test fails and the old one still
passes.

### R30-13 — the record is dated by her signature, not by the row's last touch

The round-2 fix read `proposal.updated_at`, which is a third source the ruling
did not name. It is correct today only by coincidence:
`update_proposals_updated_at` is `BEFORE UPDATE ON public.proposals FOR EACH
ROW` with **no column list**, so any future writer of the row silently re-dates
her signature. (Round 3's reviewer walked every public function whose body
updates `public.proposals` and found none reachable between `client_signed` and
countersign — `_mark_proposal_viewed_impl` requires `status='sent'`,
`nudge_proposal` and `expire_proposals` require `sent|viewed` — so the coupling
was latent, not live. Latent is still the wrong source.)

The ruling names `commercial_document_signatures.signed_at`, party `client`.
That row does not reach the list: `list_client_proposals`, read live off
`pg_get_functiondef` on the local stack, projects `sent_at`, `signed_at`,
`created_at` and `updated_at` and no signature of any kind. It reaches the
portal in exactly one place — `get_client_commercial_document_bundle`.

So the door now reads that bundle for its kept records, through
`clientCommercialDocumentQueryOptions` in a `useQueries` — the same options
`InstrumentReading` uses on unfold and the same pattern `threshold.tsx` uses
for its held trade instruments. One cache entry per paper: the line and the
reading it unfolds into cannot disagree about the date, and unfolding pays
nothing. The read never holds the page (a record is not an ask); the list's own
answer stands as `listedDate` until the signature row arrives, and a bundle
that errors or is refused leaves that answer in place.

No migration: the ruling's condition for one was the bundle refusing
project-less reads, and round 1 proved it does not (§"No migration").

Two proofs, doing different work:

- **Unit** — `dates the kept record from her signature row, not the row's last
  touch` puts `updated_at: '2026-09-11'` on the list row and a client signature
  at `2026-09-06T16:02:04Z` in the bundle, so only the signature row can
  produce `6 September`. The fixture carries exactly one signature, the
  client's, because that is what the RPC returns in this window — the studio's
  does not exist yet, and writing it creates the project that takes the paper
  off this door. Proved it gates: with the date reverted to `record.listedDate`
  the test fails.
- **E2E** — `origin-door.spec.ts` now reads `commercial_document_signatures`
  (`party_role='client'`) back through the service client and asserts
  `previously-date` equals that row's day, instead of a `/^\d{1,2} [A-Za-z]+$/`
  regex any date would satisfy. On a real stack `updated_at` and `signed_at`
  are the same instant, so this pins the VALUE, not the source. What pins the
  source against real data: with `?? record.listedDate` deleted outright, so the
  bundle is the ONLY thing that can date the line, the spec still passed —
  `get_client_commercial_document_bundle` genuinely serves the client's
  signature row for a `project_id NULL`, `client_signed` document.

The existing round-2 test (bundle carrying no signatures → `6 September` off
the list) now stands as the fallback's own coverage.

### R30-11 — the sentence steps aside for a door that carries her name

With only a sealed door on the page — the state right after she signs and the
list refetches — the page printed "Nothing is waiting for you." directly above
a door showing "… signed 7 September · <studio> has your signature." Literally
true (`origins` and `open` are both empty), and no forbidden vocabulary, but it
reads as though the ceremony had not happened.

`doors` is now computed before the standing sentence, and the sentence is
`null` — the paragraph is not rendered at all — when there are no standings and
a door is on the page. Nothing else changes: a page with no door keeps the
sentence (the record alone, on the next visit), and any page with a real
standing keeps the sentence it had. Asserted in both directions, in the
end-to-end signing test and in the next-visit test. Proved it gates: with the
suppression removed the signing test fails.

### R30-10 — the paper standing twice, recorded rather than removed

On the one render right after signing, the same agreement is on the page twice:
the sealed door with its receipt, and the `Previously` line it has just become.
`threshold.tsx` keeps `sealedDoors` alongside the `instrumentReceipts` it
derives from `accepted` in exactly the same way, so this is the house's own
idiom and not a double render introduced here — and the receipt is the reason
the sealed door is sticky at all (R30-1). The next visit settles to the line
alone. No change; the signing test now asserts both are present, so a future
reader meets it as a decision rather than as a regression against
deliverable (4).

### Gates (round 3, from the worktree)

```
pnpm --dir apps/client-portal type-check                          → clean (tsc --noEmit, no output)
pnpm --dir apps/client-portal test:coverage                       → 129 suites / 2012 tests passed
playwright --workers=1 tests/origin-door.spec.ts                  → 3 passed (24.6s)
playwright --workers=1 tests/threshold.spec.ts                    → 14 passed (1.8m)
```

`threshold.spec.ts` is fully green this round — the `MULTI_OTHER_HOUSE_COUNT`
drift rounds 1 and 2 recorded is gone, because the shared local stack has been
reset since (`client@patina.dev` now holds exactly the seed's three houses,
all created 2026-09-07 16:24Z, confirmed by SQL). Its first run in this round
did report two reds — `names the other houses…` and `answers the retired
routes…` — both inside `signIn`'s 60s `waitForURL` against a cold dev server
compiling routes on demand; each passed alone and the whole file passed on the
next run. Recorded as flakes, not as findings.

The e2e ran against a dev server this lane started itself on :3002 with
`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`, the CLI demo anon key, and
`SUPABASE_SERVICE_ROLE_KEY` read out of the running `supabase_storage_supabase`
container's env — the worktree carries no `.env.local`, so nothing could reach
Strata. The local stack was used read-only apart from the rows the e2e mints
for itself; it was never reset. No migration was needed and none was minted; no
production mutation of any kind was run. `plans-link.spec.ts` and
`share-link.spec.ts` were not run.
