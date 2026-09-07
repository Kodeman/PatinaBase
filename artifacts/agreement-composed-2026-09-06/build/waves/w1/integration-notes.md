# Wave 1 · lane `integration` — notes

Program: **The Agreement, Composed** · Wave 1 · 2026-09-06
Worktree: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w1-integration`
(`git -C … rev-parse --show-toplevel` →
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w1-integration`)
Branch: `agreement/w1-integration` · **code head
`b2a9e68f94cc590ec77c218dc3ca992d4c498303`** — the docs commit carrying this
file sits directly on top of it and touches nothing outside
`artifacts/agreement-composed-2026-09-06/build/waves/w1/`.

This file is the running log. `wave-report.md` in this directory is the report;
everything below is the sequence and the judgment calls, in order.

---

## Round 1 (earlier steward session) — kept for the record

The first integration merged each lane's **round-3** head over `origin/main`
`4c0b7b17b`: `488391a8c` backend → `e98964d20` designer → `679f08773` client,
docs commit `3fbe506a6` on top. One textual conflict, in
`packages/types/src/commercial.ts` (`ProjectBillingAuthoritySummary.authorizedCents`,
backend's `number | null` vs client's `number`), resolved to `number | null` —
backend round-1 finding **B4**, and the reason `billing_ceiling_cents` drops
`NOT NULL` in 00575 (architect F-2). That resolution stands unchanged in round 2;
nothing re-opened it.

That round reported two reds it could not clear —
`commercial/direct_order_attribution_test.sql` and `threshold.spec.ts:158`. Both
are green in round 2 (§4 below). Its reading that they were `main`'s was right
about `:158` and wrong about the SQL test; see §4.1.

---

## Round 2 — this session

### 1 · The tip, and why a second integration

`git fetch origin main` (unsandboxed — the sandbox breaks the ssh transport with
`ssh_dispatch_run_fatal: … Broken pipe`) → `origin/main` =
**`3a9472f92d6fd3348e7257c95a8042c1c007447c`**, one docs commit past Wave 1's
declared base `4c0b7b17b`, which is confirmed an ancestor. Descendant, not a
divergence.

All three lanes had advanced past the heads round 1 merged:

| Lane | Named sha (lane state) | Branch head merged | Ancestor? |
|---|---|---|---|
| backend | `5fb10ed93` | `74b5f2dec` (`backend-review-r4.md`) | yes |
| designer | *(none given)* | `0bcf667bb` | — |
| client | `fd78e571b` | `5071a3cd7` (`client-review-r5.md`) | yes |

`git merge-base --is-ancestor` confirms both named shas sit under the heads
merged, so the merged code is the reviewed code.

**Blocker check before merging.** The lane state marks the client lane
`shipped: false` and both lanes `reviewVerdict: fix`. The rule is that majors
ride as advisories and only an open **blocker** needs a documented acceptance.
Each lane's latest review states its verdict in its own words:

- `backend-review-r4.md:17` — "**fix** — no blocker; one new major, two majors
  carried forward, nine minors, sixteen nits."
- `client-review-r5.md:347` — "**fix** — no blocker."
- `designer-review-r3.md:327` — "No blocker: the flag-off byte-identity holds…"

Round 1's report named backend round-3 **R1** an open blocker. Round 4 closed it:
`0a65be682` ("the floor reads the page she signs, and the composing door opens
both ways") plus the R17 walls, and the round-4 reviewer re-scored the residue as
**M1-new, major 0.90** — a major, not a blocker. So there is no blocker to
accept, and all three lanes merged.

### 2 · The merges

| Order | What | Head | Merge commit | Conflicts |
|---|---|---|---|---|
| 0 | `origin/main` tip | `3a9472f92` | `834b273cc` | none |
| 1 | `agreement/w1-backend` | `74b5f2dec` | `1d7e97907` | none |
| 2 | `agreement/w1-designer` | `0bcf667bb` | `64175f977` | none |
| 3 | `agreement/w1-client` | `5071a3cd7` | `0e7465846` | none |

Zero textual conflicts across all four. The T0 handshake files
(`packages/types/src/{agreement,commercial,index}.ts`) that collided in round 1
now carry identical content on every lane, because round 1's resolution is
already in the branch each lane merges into.

The worktree was **not** created by this session — it already existed from round
1, at the path the steward brief names, and was reused in place. `git worktree
list` and a clean `git status --porcelain` confirmed it before the first merge.
No worktree was created or removed.

### 3 · The semantic conflict git did not report

Zero textual conflicts, and a tree that did not build:

```
@patina/types:build: src/index.ts(138,15): error TS2307:
  Cannot find module './agreement-copy' or its corresponding type declarations.
```

The designer lane's `e8ce0e27c` carries a 100 %-similarity rename that has
nothing to do with the rest of that commit:

```
R100  packages/types/src/agreement-copy.ts
   →  apps/designer-portal/src/components/document/commercial/agreement-copy.ts
```

It moved the file and left both ends dangling: the barrel export at
`packages/types/src/index.ts:138`, and the importer at
`components/document/commercial/agreement-parts-body.tsx:23-26`, which reads
`AGREEMENT_PART_COPY` / `agreementCadenceText` / `agreementDepositLine` /
`agreementRetainerActivation` **from `@patina/types`**. `pnpm --filter
@patina/designer-portal type-check` on the merged tree named all four:
`TS2724` + three `TS2305`.

This is broken on the designer branch itself, not a merge artifact, and it
contradicts that lane's own notes — `designer-notes.md` D5 (lines 255, 274, 438)
still places the module in `packages/types` and calls it "the designer lane's one
declared deviation from its `packages/**` boundary".

**Two ways out, and why the file moved back rather than the import moving.**
Re-pointing the importer at a relative path would silently ratify a move the
lane never described, and would strand the client surface from the shared
sentences that module exists to guarantee (D5's whole point: "a sentence typed
twice drifts"). Restoring the file leaves the barrel, every importer, and the
reviewed content exactly as reviewed. The two copies are byte-identical (`diff`
against `679f08773:packages/types/src/agreement-copy.ts` → no output), so this is
a pure `git mv` back.

Commit `b2a9e68f9`, one file, zero content lines changed. An earlier attempt
this session (`a05a1b2d3`) deleted the dangling export instead; that was wrong —
it would have left the designer portal's importer broken — and it was
superseded by a `git reset --soft HEAD~1` (my own commit, unpushed, on my own
branch) before the correct fix was committed. The net change to
`packages/types/src/index.ts` is nil.

**This is the entire product-code footprint of this lane.** Everything else it
wrote is under `artifacts/agreement-composed-2026-09-06/build/waves/w1/`.

### 4 · Migrations, and the stack

`00575_agreement_parts.sql` is the only migration above the tip's `00574`; no
duplicate 5-digit prefixes anywhere in the merged tree; **nothing renumbered**,
and no file on `main` touched. Strata is still at `00574` — 00575 is unapplied
and remains editable in place.

`stack-notice.md` got its round-2 entry before the reset. The shared stack was
found at head `00575` — the body round 1's reset left, which is *stale*: backend
round 4 edited `00575` in place after that. `supabase db reset` from this
worktree replaced it. Probes that prove the round-4 body is what applied:
`discard_agreement_parts` and `guard_agreement_projection_write` both exist, and
neither was in the pre-R17 copy.

#### 4.1 · `direct_order_attribution_test.sql` — round 1 read it wrong

Round 1 filed this as a pre-existing red on `main` and did it the expensive way
(a 00574 baseline reset, the file run there, same error). It is **PASS** here, on
a stack reset from the merged tree. The honest reading is that the failure
tracked the *stale* `00575` body rather than `main`: round 1's "00574 baseline"
was reconstructed by moving `00575` aside on a database that had already been
reset with the pre-R17 body, not by a clean replay. Nothing is owed to
`KNOWN_FAILURES.md` for it. Round 1's other two claims stood up (§4.2, §4.3).

#### 4.2 · `threshold.spec.ts:158` — timezone, confirmed

Green under `TZ=UTC` (13 passed in that file, only `:221` failing). The spec
computes the due date JS-local; the seed dates it `CURRENT_DATE + 7` in a UTC
Postgres. Anything after 19:00 CDT crosses the boundary.

#### 4.3 · `threshold.spec.ts:221` — demonstrated on `main`, not argued

Round 1 argued this from the diff. This round ran it: the same test, from the
**`main` checkout** at `3a9472f92`, against the same stack, fails identically
(`Expected 2, Received 7`). Plus the structural proof — the failing test body is
byte-identical to `main`, `MULTI_OTHER_HOUSE_COUNT = 2` on line 31 of both, the
rendering path under `components/threshold/` has only a *test* file changed, and
the sole `supabase/seed/` change adds 22 REVOKEs, 13 GRANTs and their `DO $g$`
wrappers and not one data row.

### 5 · Gates

Full paste in `wave-report.md` §5. Headline: SQL **162 / 141 green / 21
expected-fail / 0 unexpected**; `database.types.ts` and the ACL seed both
regenerate byte-identical (`git diff --exit-code` rc=0 on each); `@patina/types`
and `@patina/supabase` type-check clean; `@patina/supabase` **1068 passed | 12
skipped** across 87 files; designer-portal type-check clean and **523 suites /
6319 tests** green; designer-portal lint 2 errors, both reproduced on the `main`
checkout by running `npx eslint` there; client-portal type-check clean, **129
suites / 1995 tests**, coverage 73.96 / 69.30 / 74.01 / 76.28 over the
70/60/70/70 floor; admin-portal `build` succeeds unsandboxed. Deno not run —
`git diff --name-only origin/main HEAD -- supabase/functions/` is empty.

Client e2e `--workers=1` with the service-role key exported from `supabase status
-o env` and `NEXT_PUBLIC_FLAG_OVERRIDES=agreement-parts:true`: **33 passed, 4
failed**, and all four are accounted for above and in R21's pre-existing list.

A note on the flag override reaching the server: `apps/client-portal/playwright.config.ts`
does not pin `NEXT_PUBLIC_FLAG_OVERRIDES` in `webServer.env`, and its
`reuseExistingServer: true` would silently reuse a server started without it.
Nothing was listening on `:3002` or `:3000` before the run (`lsof -nP -iTCP:3002
-sTCP:LISTEN` empty), so Playwright booted its own and inherited the exported
variable.

### 6 · Vocabulary spot-check

Over the 23 non-test `apps/**` files this branch changes: no "clause library",
no "contract builder", no "AI", no "overdue", no "dashboard", no "confetti". The
single quoted `"variant"` hit is a TypeScript property key in
`agreement-composer.tsx:176`, not copy. The lanes' reviewers carry the full R7
pass (backend r4 criterion V).

### 7 · What this lane did NOT do

- Did not push any branch.
- Did not run `supabase db push`, `supabase functions deploy`, or `wrangler`.
- Did not touch `.claude/`, `.agents/`, hooks, settings, or any `.env` file.
  (`git status` reports `Operation not permitted` on eight `.env.example` paths —
  that is the sandbox's read deny-list, not a modification.)
- Did not create or remove a worktree.
- Did not use SendMessage.
- Did not write product code beyond the §3 rename.
- Did not run the designer-portal agreement e2e; the gate list names the client
  suite only.
- Did not resolve any lane finding, and did not re-review the lanes' code.
