# R30 hotfix — adversarial review, round 1

Reviewer: separate context, did not write the code. Branch `agreement/r30-origin-door`
in `/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-r30`, six commits ahead of
`origin/main`. Date 2026-09-07.

**Verdict: FIX.** No blocker — the origin agreement is reachable, signable end to end, and
RLS holds. Two majors, both about what the household door does *after* the signature and
*whose studio* it names.

---

## What was proved, not assumed

Everything below was run by the reviewer against the LOCAL stack (head `00575`, never
Strata) with the client portal booted from this worktree on :3002 (no `.env.local` exists
in the worktree; env came from `playwright.config.ts`'s `webServer` block pinned at
`http://127.0.0.1:54321`).

| claim | how it was proved | result |
|---|---|---|
| `list_client_proposals` is client-scoped, not project-scoped | `pg_get_functiondef` on the live local DB | `WHERE proposal.client_id = auth.uid()`; `project_id` is `COALESCE(proposal.project_id, commercial_binding.project_id)` and stripped when null. **No migration needed.** |
| `get_client_commercial_document_bundle` does not refuse a project-less read | `pg_get_functiondef` | gates on `client_id` / `is_studio_comember` only. **No migration needed.** |
| the sign route needs no branch | read `app/api/proposals/[id]/sign/route.ts` end to end | project is never consulted; `sign_design_services_agreement_with_trusted_ip` is called with proposal + client + ip. |
| the door renders the origin agreement | browser, real household with **zero** projects, agreement minted through `upsert_design_services_draft` → `send_commercial_document` | `#door` visible, heading = the agreement's title, "One agreement is waiting for you.", plate = the designer's studio, `Read it in full` / `Request a change` / `Decline` present, **no nav** |
| the consent line and signature act appear | same run | `Type your full name` textbox, checkbox "I agree to these design-services terms and understand my signature alone does not authorize work until the studio countersigns.", `Sign and accept` |
| signing works end to end | browser hold-to-sign (keyboard hold, `HOLD_MS` 900) | `POST /api/proposals/<id>/sign → 200 {"ok":true,"commercialState":"client_signed","newlyClientSigned":true}`; receipt inked: "… · signed 7 September · Leah Hartwell has your signature. You'll have a copy." |
| the signature is in the database | `SELECT` on `public.commercial_document_signatures` | `party_role='client'`, `signed_name='Rev Owner'`, `signed_at` stamped, `evidence_fingerprint` 64 chars; `proposals.commercial_state='client_signed'`, `project_id` still NULL |
| a stranger household cannot read it | second real homeowner, anon JWT | `get_client_commercial_document_bundle` → `commercial document <id> not found or access denied`; `list_client_proposals` → `[]`; owner's own list → the agreement with `project_id: null`. **No RLS leak.** |
| the stranger's front door is unchanged | browser, `/?proposal=<owner's id>#door` as the stranger | "No active projects yet" + the two mat acts; `#door` count 0; the title never appears |
| the `?proposal=` deep link and the retired `/proposals/<id>` 308 both land on the door | `origin-door.spec.ts`, both tests | URL becomes `/?proposal=<id>#door`, door visible with the agreement's heading |
| the project-scoped paper filter did **not** widen | `threshold.tsx` is untouched by the diff; filter still `commercial.projectId !== projectId` (`threshold.tsx:437-440`) | unchanged |
| homeowner copy | grep of every added line for `gate\|task\|dashboard\|overdue\|AI` | only identifiers/comments (`door-gate.tsx`, "Null when the gate is…"); no badge, no chip, no colour, counts spelled in words |
| commits are pathspec-clean | per-commit `--stat` | 5 source/test files + the notes doc; no `.env`, no `.claude/`, no stray files; Conventional Commits, no trailers |

Local rows the review created (and the four the implementer's dev runs had left) were
swept afterwards: 15 throwaway `r30-*@patina.dev` households, 10 proposals and their
signatures deleted inside one transaction. `auth.users WHERE email LIKE 'r30-%'` → 0.

## Gates

| command | result |
|---|---|
| `pnpm --filter @patina/client-portal type-check` | clean (`tsc --noEmit`, no output) |
| `pnpm --filter @patina/client-portal test:coverage` | **129 suites / 2008 tests passed**; coverage 74.12 lines / 69.46 branches / 74.17 functions / 76.43 statements (floor 70/60/70/70 — met) |
| `npx playwright test --workers=1 tests/origin-door.spec.ts` | **2 passed** |
| `npx playwright test --workers=1 tests/threshold.spec.ts` | **13 passed, 1 failed** — `threshold.spec.ts:250`, not this change (below) |
| reviewer browser spec (RLS · stranger empty state · sign end to end) | 3 passed; temp spec deleted, tree clean |

The one red is `threshold.spec.ts:250` — `MULTI_OTHER_HOUSE_COUNT` expects 2 other houses
for `client@patina.dev`, found 4. Independently corroborated as external seed drift, not
R30: `SELECT` shows five projects for that client — the seed's three at `11:56:31Z` plus
two `Client User — design services agreement` houses at `12:18:25Z` and `12:27:14Z`,
created by another lane's countersign hours before this lane touched the stack. The
assertion sits on the multi-house `<Threshold>` path; the only render branch this change
edits is `page.tsx`'s zero-project arm. (The brief named `threshold:158` and
`threshold:221` as the pre-existing reds; `:158` passed on this run.)

---

## Findings

### R30-1 · major · the signed agreement vanishes until the studio countersigns
`letterbox-door.tsx:135` draws doors from `partitionProposals(...).pending` only
(`commercial_state === 'sent'`), and `sealed` is component state that dies with the page.
So the moment she signs, closes the tab and comes back — a window that lasts until the
studio countersigns, i.e. days — the household door has nothing to show and
`letterbox-door.tsx:230` returns `ProjectsEmptyState`.

Proved in the browser against the household that had just signed:

```
FRESH VISIT >>> No active projects yet
Your designer kicks off a project when you're ready to begin. …
DOOR COUNT: 0
URL AFTER FOLD: /?proposal=e895dadd-…#door
DEEP LINK >>> No active projects yet …
```

The deep link from the studio's own confirmation mail lands on "No active projects yet"
— the exact sentence R30 exists to delete, now reachable by *every* homeowner who signs.
A project-bound house does not do this: `threshold.tsx:463-477` turns each `accepted`
document into a lasting `ThresholdReceipt` ("Design services agreement · <title>"). The
ruling's word is "pending", so this is arguably outside its letter; it is squarely inside
its purpose, and it breaks the brief's own "the door renders the origin agreement exactly
as a project-bound one does".

Fix: carry `partitionProposals(...).accepted` project-less `design_services` documents on
the household door as a standing receipt line (the house's own idiom), or keep the door
standing in its signed state rather than dropping to the empty state.

### R30-2 · major · the receipt can name the wrong studio
`studioName` is one page-level value (`letterbox-door.tsx:197-202`) resolved from the
letter in the slot when there is one, else `origins[0].designerId`
(`letterbox-door.tsx:162`) — and it is handed to **every** door
(`letterbox-door.tsx:302`). `DoorGate` prints it as the holder of the signature
(`door-gate.tsx:341-343`): `"${holder} has your signature. You'll have a copy."`

Two reachable shapes name the wrong studio on a legally consequential act:
- a studio invoice from studio A **plus** an origin agreement from studio B — the plate
  prefers the invoice (`inSlot ? … : originDesignerId`), so B's agreement is signed under
  A's name;
- two origin agreements from two studios — the code supports this explicitly (the copy
  pluralises, "Two agreements are waiting for you.") and both doors take `origins[0]`'s
  studio.

The house cannot hit this: its `studioName` is project-scoped, and a house's papers are
one studio's. The database is unaffected — `commercial_document_signatures` is correct —
but the sentence the homeowner reads is not.

Fix: resolve identity per door from that door's own `designerId` (the `SealedDoor` record
already carries it) rather than from the page's plate.

### R30-3 · minor · the money surface is now held behind the proposals read
`letterbox-door.tsx:221-224` adds `proposalsQuery.isPending` to the blank hold. The
portal's query defaults are `retry: 2` (`app/providers.tsx:26`), so a slow or failing
`list_client_proposals` now blanks the studio-invoice front door for the length of two
retries where invoices alone used to gate it. It recovers (origins fall to `[]`), so this
is a delay, not a dead end — but it couples a money surface to an unrelated read.

Fix: hold on the proposals read only while nothing else is already drawable.

### R30-4 · minor · the same paper is still unreachable for a household that has a house
`page.tsx:80` reaches `LetterboxDoor` only at `projects.length === 0`, and
`threshold.tsx:437-440` filters papers on the summary's `projectId`. A homeowner who
already has one project and is sent a second, project-less origin agreement (second
residence, or a second studio) still cannot see or sign it, and `?proposal=` still dies:
`resolveHouseForInstrument` correctly refuses to name a house, then the active house's
Threshold filters the paper out. The implementer names this in the notes §7 and it is
outside the ruling's literal scope ("with zero projects") — recording it so the ruling can
be widened deliberately rather than rediscovered.

### R30-5 · minor · an unrequested behaviour fix rides along
`plateAsked` (`letterbox-door.tsx:206`) is new and does more than R30 asked. A disabled
TanStack v5 query reports `isPending` forever (`useStudioIdentity` sets
`enabled: !!(studioId || projectId || designerId)`), so before this change a household
whose only studio invoice carried neither `studio_id` nor `designer_id` was held on a
blank `letterbox-door-hold` permanently. The new guard fixes that. It is a strict
improvement and correctly reasoned, but it is a second defect fixed inside an R30 commit
with no test of its own — name it in the ship note so it is not attributed to the
agreement path.

### R30-6 · nit · the e2e leaves permanent rows on whatever stack it runs against
`tests/origin-door.spec.ts` mints a real `auth.users` row and a `designer_clients` row per
run and deliberately never cleans up. Each run permanently adds a client to
`designer@patina.dev`. `threshold.spec.ts:250` is red **today** from precisely this class
of drift. The proposal itself is guard-protected, but the household and the relationship
are not: an `afterAll` that deletes the `designer_clients` row and the `auth.users` row it
created would bound the damage. (The reviewer removed all 15 such households from the
local stack; the notes' §6 caveat about four leftovers is now stale.)

### R30-7 · nit · the e2e never signs, so hold-to-sign is only covered in jsdom
`origin-door.spec.ts` is read-only by design and stops at "the acts are present". The
reviewer drove the real gesture and it works (see the table above), so this is not a
defect — but the deliverable's "signing works end to end" is, in the committed suite,
carried by `threshold.test.tsx` alone. One `await` on the hold in the spec would close it.

### R30-8 · nit · deliverable (2) was met a different way, and says so
The brief asked `resolveHouseForInstrument` to keep `?proposal=` and route to the door.
It returns a house id, and an origin agreement has none; the implementer left the resolver
returning null (with a comment and three pinning tests) and passed `namedProposalId`
straight from `page.tsx` to the door instead. The observable outcome is correct — both the
`?proposal=` deep link and the `/proposals/<id>` 308 land on the right door, proved in the
browser — and the deviation is declared in the notes §3. Flagging only so it is ratified
rather than assumed.

---

## Not verified

- Nothing was deployed and no production mutation of any kind was run; Strata was not
  touched.
- `plans-link.spec.ts` and `share-link.spec.ts` were not run (named in the brief as
  pre-existing reds).
- `pnpm lint` was not run — `client-portal` has only a legacy `.eslintrc.json` and
  ESLint 9 resolves flat config only, so its lint result would be meaningless
  (patina-verification).
- Firefox/WebKit: `playwright.config.ts` is chromium-only.
- The multi-studio shapes behind R30-2 were reasoned from the code, not staged in a
  browser.
