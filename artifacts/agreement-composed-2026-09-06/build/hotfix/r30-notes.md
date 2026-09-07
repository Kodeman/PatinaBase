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

The e2e ran against a dev server Playwright started itself on :3002 with the
config's pinned `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321` and the CLI
demo anon key; `SUPABASE_SERVICE_ROLE_KEY` was read out of the running
`supabase_storage_supabase` container's env rather than any `.env` file. The
worktree carries no `.env.local` (only `.env.example`), so nothing could point
at Strata. Nothing was deployed; no production mutation of any kind was run.
