# R30 hotfix — adversarial review, round 4 (2026-09-07)

Branch `agreement/r30-origin-door` @ `25c27e71d`, worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-r30`.
Reviewer did not write this code. Verdict: **ship** — no blocker, no major.

## What was proved, not reasoned

Everything below was driven against the LOCAL stack (migration head 00577) from
a dev server this review started itself on **:3202** from this worktree. That
port matters: another lane (`agent-agr-w2-integration`) was holding **:3002**
with its own `next dev` while this review ran, and the client Playwright config
sets `reuseExistingServer: true` — a gate run from here on the default port
would have exercised a different branch's code. See finding N5.

| probe | result |
|---|---|
| the hold-to-sign gesture on the household door | 1.8 s mouse hold on the focused act → `POST /api/proposals/<id>/sign` **200** `{"ok":true,"commercialState":"client_signed","newlyClientSigned":true}`; receipt read `Reviewer probe agreement · signed 7 September · Leah Hartwell has your signature. You'll have a copy.` |
| the signature row | `commercial_document_signatures` → `party_role=client`, `signed_name=Rev Owner`, `signed_at=2026-09-07T16:43:17.847142+00`, 64-char `evidence_fingerprint` |
| the paper after signing | `proposals` → `project_id NULL`, `commercial_state client_signed` — no project invented |
| RLS through the bundle | a second (stranger) homeowner calling `get_client_commercial_document_bundle` on the first household's agreement: `commercial document 8ffcf30a… not found or access denied`; her own front door contains no trace of the other household's paper |
| the letter beside the agreement (R30-3) | minted a real project-less studio invoice (`create_draft_studio_invoice` → `issue_invoice`, `project_id NULL`, `status sent`, `studio_id 8f6dc5b0…`) alongside a sent origin agreement. One page: `One agreement is waiting for you. One letter is waiting for you.` + the door + `THE LETTERBOX / From the studio · not for a house / INV-0002 · $500 total`. No `letterbox-door-hold`. |
| `?proposal=` deep link + retired `/proposals/<id>` 308 | `origin-door.spec.ts` 3/3 green on :3202 |
| the no-agreement household | `threshold.test.tsx` `meets a household with no letter with the empty state` — green |
| the paper filter in `threshold.tsx` | **file untouched on this branch** (`git diff origin/main...HEAD --stat` lists only `__tests__/threshold.test.tsx`) — no widening for project-bound households |
| homeowner copy | new sentences are `One/Two agreement(s) is/are waiting for you.` joined with the existing letter sentence. No "gate", "task", "dashboard", "overdue", "AI"; no badge, chip, count pill or colour. |

Probe rows were cleaned up: 7 `r30rev-*` households and their agreements,
signatures, invoices, terms/rates, `designer_clients` and profiles deleted
(guards required `session_replication_role = replica`); re-checked for orphans
— 0 proposals and 0 invoices with a dangling `client_id`.

## Gates run by this review

```
pnpm --filter @patina/client-portal type-check          → clean (tsc --noEmit, no output)
pnpm --filter @patina/client-portal test:coverage       → 129 suites / 2012 tests passed, floors met
                                                          letterbox-door.tsx 97.89/86.11/93.33/98.83
npx playwright --workers=1 tests/origin-door.spec.ts    → 3 passed (42.5s)   [server :3202, this worktree]
npx playwright --workers=1 tests/threshold.spec.ts      → 13 passed, 1 failed [server :3202]
```

The single `threshold.spec.ts` red is `names the other houses on the mat for a
client who keeps several` — expected 2 other houses, found 7. Proved
environmental, not this branch's: `SELECT` on the shared stack shows
`client@patina.dev` owning the seed's three houses plus five `Pay E2E …`
projects minted 16:34Z by another lane's `pay-link.spec.ts`. This is the
`MULTI_OTHER_HOUSE_COUNT` seed-accumulation drift the R17-block ruling already
recorded as a main-backlog red.

Test-gating checked, not taken on trust: reverting the R30-3 guard to the
unconditional `proposalsQuery.isPending` makes exactly one case fail —
`draws the letter while the papers are still coming, never blank behind them`
(1 failed, 95 passed). The file was restored; `git status` is clean.

## Carried findings

| # | Sev | Disposition this round |
|---|-----|---|
| R30-3 | major | **Fixed.** Hold is now `standing.length === 0 && proposalsQuery.isPending` (letterbox-door.tsx:379). Proved live and by test-gating. |
| R30-13 | minor | **Fixed.** `clientSignedAt` (letterbox-door.tsx:128-131) reads `signatures` party `client` off the bundle, through the same `clientCommercialDocumentQueryOptions` the unfold uses; `listedDate` remains only as the pre-arrival fallback. Jest pins the source (list `updated_at` 11 Sep vs signature 6 Sep), e2e pins the value against the real row. |
| R30-11 | nit | **Fixed.** `waiting` is `null` when there are no standings and a door is on the page (letterbox-door.tsx:441-446); asserted in both directions. |
| R30-10 | nit | **No change, correctly.** `threshold.tsx` keeps `sealedDoors` alongside receipts derived from `accepted` in the same way; now asserted so it reads as a decision. |
| R30-14 | nit | **Fixed.** The carried-findings table exists at r30-notes.md §"Round 3". |
| R30-4 | nit | **Deferred by the ruling** to the Wave 2 client lane; declared in r30-notes.md §7 and the table. Confirmed still true in code (`projectIds.length < 2 && !invoiceId` → null; `owns(match.project_id)` refuses a stripped null). |
| R30-6 | nit | **Main backlog by the ruling.** Four `r30-origin-*` households now sit on the stack (the count reset with the stack since round 3, then re-grew with this round's runs). |
| R30-7 | nit | **Still open.** The committed e2e still signs through `sign_design_services_agreement_with_trusted_ip` in `beforeAll`; nothing in `apps/client-portal/tests` drives the hold gesture. This review drove it by hand and it works, so this is a coverage gap, not a defect. |
| R30-5 | nit | **Partly open.** `plateAsked` is now named once in r30-notes.md — only as a Wave-2 *test* carry (line 393). The fix itself (a disabled TanStack v5 query reporting `isPending` forever, which held a blank money surface for an invoice carrying neither `studio_id` nor `designer_id`) is still not described anywhere, and the disposition table asserts R30-5 was "answered" in §8/Round 2, which grep does not bear out. |
| R30-12 | nit | **Still open.** `partitionProposals(proposalsQuery.data)` is still called unmemoized in the component body (letterbox-door.tsx:227-229), so the two `useMemo` blocks below it never memoize. Harmless at these sizes; the disposition table lists it as closed. |

## New this round

- **N1 (minor).** The origin door offers **three** acts where a project-bound
  door offers four: `["READ IT IN FULL","REQUEST A CHANGE","DECLINE"]`, read
  out of `door-acts` in the browser. `DoorActs` withholds "Ask a question" on
  `!projectId` (door-acts.tsx:209-211) — a deliberate, pre-existing house rule
  ("AN ACT THAT CANNOT COMPLETE IS NOT OFFERED", byte-identical on
  `origin/main`), but until this branch `DoorGate.projectId` was `string` and
  the branch was unreachable from the client page. So the homeowner's very
  first paper is the one door that cannot ask her studio a question. Not a
  defect — "Request a change" still posts a note — but it is a difference from
  "the door renders the origin agreement exactly as a project-bound one does",
  and the ship note does not record it.
- **N2 (minor).** No error branch. `useClientSafeProposals` sets no `retry`, so
  it inherits `retry: 2` from `app/providers.tsx:26`; after the third failure
  `isPending` goes false with `data` undefined, `origins`/`kept` are empty, and
  a zero-project household whose only paper is a pending origin agreement lands
  on `ProjectsEmptyState` — "no active projects yet" over the agreement R30
  exists to reach. The hold guard covers the *pending* window, not the *failed*
  one. Same shape as the pre-existing invoice path on `origin/main`, so this is
  a widening of a known gap rather than a new one.
- **N3 (nit).** The kept record's date can visibly change once the bundle
  lands: the line renders `listedDate` (the list's `updated_at` day) and then
  swaps to the signature day. On real data the two are the same instant, so the
  flip is latent — but it is latent for exactly the same reason R30-13 said the
  list was the wrong source.
- **N4 (nit).** The disposition table in r30-notes.md marks R30-5 and R30-12 as
  closed in earlier sections; neither is.
- **N5 (nit, environmental).** `apps/client-portal/playwright.config.ts` pins
  `:3002` with `reuseExistingServer: true`. With a second worktree's dev server
  already on that port — the state of this machine throughout this review — a
  lane's own e2e gate silently exercises another branch's build. Round 3's
  "threshold.spec.ts fully green" cannot be distinguished from that case after
  the fact. Worth a per-lane port or a `reuseExistingServer: false` for gate
  runs; recorded rather than changed, since it is outside R30's scope.

## Scope and hygiene

Thirteen commits, Conventional Commits, no trailers, explicit pathspecs — every
commit touches only `apps/client-portal/**` and the gitignored program docs
under `artifacts/agreement-composed-2026-09-06/build/hotfix/`. No migration was
minted and none is owed: the bundle serves a project-less `client_signed`
document to its addressed homeowner (proved again this round by the stranger
refusal and by the signed record opening in full). No `@patina/types` change.
No `.claude/`, hooks, settings or `.env` touched. Nothing was deployed and no
production mutation of any kind was run.
