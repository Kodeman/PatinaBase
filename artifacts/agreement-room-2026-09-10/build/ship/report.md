# Ship report — the Agreement Room, Direction D · the galley

T6, 10 September 2026. Lane: ship. Program branch `agreement-room/galley`,
worktree `.codex/worktrees/agent-agreement-galley` (now retired).

---

## 1 · What landed

| | |
|---|---|
| `origin/main` before | `fa17f9c48a06c6be122d78f7cba250496aac3d4d` |
| **Merge commit** (`origin/main` → galley) | **`086fecf69`** — `merge(agreement): origin/main into galley` |
| Build-docs commit | `166ca3e02` — `docs(agreement): galley build sheet, reviews, walk, integration log` |
| WR-201 fix commit | `4bb2533e3` — `fix(agreement): galley — applyTemplate waits for the in-flight save (WR-201)` |
| **`origin/main` after** | **`4bb2533e3f2418b03e305e4e7451a72a0bcf28f5`** (fast-forward; `git ls-remote origin main` confirms) |
| Ancestry | `git merge-base --is-ancestor b70bdda78 origin/main` → **MERGED** |

`agreement-room/galley` is pushed and kept on origin.

### Deploy

| | |
|---|---|
| Command | `./infra/deploy-portal.sh designer` from the program worktree, with all **11** `NEXT_PUBLIC_*` vars from `apps/designer-portal/wrangler.jsonc` exported inline (the worktree has no `.env.local`; values not reproduced here) |
| Start | **2026-09-10T19:57:31Z** |
| End | 2026-09-10T19:59:19Z — script printed `==> Done: designer portal deployed to production.` |
| **New Worker version** | **`05900cfa-11a5-4648-975a-5b04f8f4890c`**, created **2026-09-10T19:59:13.907Z** (deployment record 19:59:17.359Z) |
| **Rollback target** | **`63d0df2b-36df-43f0-bc2e-bff7482013d5`**, created 2026-09-10T15:58:54.349Z |

Rollback recipe is unchanged (`build/review/rollback.md`): check out the
last-good commit of `origin/main` in a worktree and re-run
`./infra/deploy-portal.sh designer` from it with the portal's `wrangler.jsonc`
vars exported inline — never `wrangler rollback`. No migration, no edge
function, no flag: this wave shipped none, and `discard_agreement_parts` /
`_agreement_floor_unmet` stay in the database untouched.

---

## 2 · Conflicts resolved

**None.** The file sets of the two programs in flight were **disjoint** —
`comm -12` over `merge-base...origin/main` and `merge-base..b70bdda78`
returned **zero** overlapping paths — and git reported no conflict.

The two overlaps the brief anticipated did not materialize:

- **`room-shell.tsx` / `document-action.tsx`.** The incoming "Standing Head"
  program (14 commits, `84728527e…fa17f9c48`) touched `doc-letterhead.tsx`,
  `letterhead-subject.tsx`, `lens-band.tsx`, `standing-sheet.tsx`,
  `region-head.tsx`, `section-stage-line.tsx` and the lens/guide derivations —
  not `room-shell.tsx`. Build sheet §T1 had already **decided to leave
  `room-shell.tsx:155` alone**, so this wave touched neither file the two
  programs could have met on.
- **`docs/design/the-document/DECISIONS.md`.** No renumbering was needed: the
  Standing Head program had already self-renumbered to **R150**
  (`ff9b815ee docs(design): the standing head ruling is R150 — R149 is the
  Agreement Room`). Both entries stand — `R149 · The Agreement Room` (AR-a…AR-h)
  at line 11000 and `R150 · The Standing Head` at 11020, `last id = R150`.

One non-conflict worth recording: Playwright's `next dev` rewrote
`apps/designer-portal/next-env.d.ts` (`./.next/types/routes.d.ts` →
`./.next/dev/types/routes.d.ts`) during the e2e runs. That is a dev-mode
artifact, not part of the wave; it was reverted before each commit and did not
ship.

---

## 3 · WR-201, applied before the ship

Round 3 of the adversarial review returned **PASS, no P1**, with one owed P2 —
**`WR-201`** — which was fixed in this lane rather than carried.

**What it was.** The `revision` guard is a *client* reconciliation; it cannot
recall a request already on the wire. `upsert_agreement_parts` is
DELETE-then-INSERT, so a save that reached Postgres *after*
`materialize_agreement_template` replaced the template's parts with the
pre-template ones. The landing correctly took the stale branch, so **the page
kept the template, the table did not, and the record read a clean `Saved`** —
the divergence surfaced only on the next load.

**The fix.** One line in `agreement-composer.tsx:757`, inside `applyTemplate`:

```ts
await inFlight.current;
await materializeTemplate.mutateAsync(template.templateKey);
```

`inFlight.current` is the serializer's chain, and that chain already drains its
own queued re-run (`while (pendingSave.current) { … await flight(); }`), so
awaiting it covers both the current flight and anything queued behind it. No
save can be in the air across a materialize.

**The test.** `agreement-composer-library-on.test.tsx` — *"holds a Template
until the save already in the air has landed"*: a gated slow save flies, the
template is picked mid-flight, and the spec asserts (a) `materialize` is **not**
called while the save is on the wire, (b) after the gate opens, materialize runs
and state carries the template's parts, (c) the record reads `Saved` only then,
and (d) the **next** persist payload carries `["studio.house-rules"]` — the
template's composition, not the nine parts the in-flight call was carrying.

Verified the test catches the bug: with the `await inFlight.current` line
removed, it fails on exactly the crux —
`expect(mockMaterializeTemplate).not.toHaveBeenCalled()` → *"Received number of
calls: 1"*. The line was restored and every gate re-run.

The sibling WR-102 spec (*"keeps a Template laid in during a save when that save
lands"*) was adapted to the new ordering — the gate now opens before the rail is
asserted, because the act waits on the save instead of racing it. Its name and
its assertion both stay true.

---

## 4 · Gates, on the merged branch

Every gate below was run in the program worktree **after** the merge of
`origin/main` and **after** the WR-201 commit.

| Gate | Result |
|---|---|
| `pnpm install` | Done in 8.8s (lockfile had moved; Prisma clients regenerated) |
| `pnpm turbo build --filter=@patina/designer-portal^... --filter=@patina/api-client --filter=@patina/aesthete-quiz --filter=@patina/types` | **8 successful, 8 total** |
| `packages/types/dist` spot-check | `agreementConsequenceSentence` **present**; `returnToFacets` **absent** — the dist is this wave's, not a stale restore |
| `pnpm --filter @patina/designer-portal type-check` | **exit 0** |
| `pnpm --filter @patina/designer-portal test` (whole suite) | **570 suites / 7206 tests passed**, 1 snapshot, 25.1s |
| `pnpm --filter @patina/designer-portal test -- src/components/document/rooms/drafting/agreement` | **20 suites / 352 tests passed** |
| `pnpm --filter @patina/client-portal type-check` | **exit 0** |
| `pnpm --filter @patina/admin-portal build` | **green** (full route table emitted) |
| Agreement e2e, chromium | **9 passed (59.1s)** |

The e2e run is `playwright.agreement.config.ts --project=chromium`: one case
from `agreement-parts.agreement.pw.ts` and eight from
`galley.agreement.pw.ts` — the printed paper with the unwritten part at rest in
the studio strip, Services unfolding beneath its printed form and surviving a
save, keyboard Move up ×2 with focus held and the position announced, hide and
un-hide Exclusions, the single status region rewriting on the retainer, the
consequence + held send + reason at 1024 and 390, the send sheet composed from
the parts, and the whole-paper overlay at its own measure.

**Two invocation notes for the next lane.** (1) `pnpm --filter … test:e2e --
--config …` does **not** work — pnpm forwards the `--` literally and Playwright
answers *"No tests found"*. Use `pnpm --filter @patina/designer-portal exec
playwright test --config playwright.agreement.config.ts --project=chromium`.
(2) The base config inlines the local Supabase env for the *webServer* only;
`e2e/helpers/supabase-admin.ts` reads `SUPABASE_SERVICE_ROLE_KEY` from the
**test runner's** env, so it must be exported into the runner (piped from
`supabase status`, never written to a file).

---

## 5 · Probes against the live Worker

### 5.1 · `wrangler deployments list --name patina-designer-portal`

Oldest-first; the **bottom** row is live:

```
Created:     2026-09-10T15:58:57.664Z
Author:      kody@thesaunabuild.com
Version(s):  (100%) 63d0df2b-36df-43f0-bc2e-bff7482013d5    <- rollback target
                 Created:  2026-09-10T15:58:54.349Z

Created:     2026-09-10T19:59:17.359Z
Author:      kody@thesaunabuild.com
Version(s):  (100%) 05900cfa-11a5-4648-975a-5b04f8f4890c    <- NEW, live
                 Created:  2026-09-10T19:59:13.907Z
```

The new version's timestamp (19:59:13.907Z) is after the recorded deploy start
(19:57:31Z).

### 5.2 · Liveness

```
LIVENESS /drafting/<zero-uuid> status=307 location=/auth/signin?callbackUrl=%2Fdrafting%2F00000000-0000-0000-0000-000000000000
SIGN-IN status=200 bytes=29895
```

A signed-out `/drafting/<id>` redirecting to sign-in is the acceptable liveness
signal (build sheet §4).

### 5.3 · Served-chunk greps

The drafting route's client chunks are **route-split and not referenced from
the sign-in page** — grepping the 36 chunks the sign-in HTML pulls found none of
the eight strings, and no `_buildManifest.js` is emitted for this App Router
build (`buildId=not-found`). So the chunks were identified by name from the
build output the deploy script produced, then **fetched from the live Worker**
and grepped in their served bytes:

```
SERVED /_next/static/chunks/3495.415833b6621ca8fa.js                                    -> HTTP 200  bytes=105744
SERVED /_next/static/chunks/app/(document)/doc/%5Bid%5D/page-4670c0e02cce8af7.js        -> HTTP 200  bytes=703113
SERVED /_next/static/chunks/app/(document)/drafting/%5BproposalId%5D/page-c4ee732bc1fc2f6e.js -> HTTP 200  bytes=59396
SERVED TOTAL BYTES=868253

--- PRESENT (expected found in served bytes) ---
FOUND      "Read the whole paper"
FOUND      "One thing before this can go"
NOT FOUND  "Hidden from the client"
FOUND      "Hide from the client"

--- ABSENT (expected gone from served bytes) ---
ABSENT         "Return to the seven facets"
ABSENT         "facets written"
STILL PRESENT  "Preview client copy"
ABSENT         "every contractual facet is present"

--- WHOLE LOCAL BUILD (245 chunks) ---
ABSENT         "Return to the seven facets"
ABSENT         "facets written"
STILL PRESENT  "Preview client copy"
ABSENT         "every contractual facet is present"
```

Two results need reading rather than counting:

- **`Hidden from the client` NOT FOUND / `Hide from the client` FOUND.** These
  were probed as a pair; the galley ships the act as **Hide from the client**,
  so the pair is satisfied. Not a defect.
- **`Preview client copy` STILL PRESENT — expected, and known.** It resolves to
  two live source acts, neither in the galley: `drafting-room.tsx:454`, the
  **proposal** drafting room, explicitly exempt under build sheet §3 R10 (its
  suite is kept as a regression canary); and
  `service-agreement-instruments.tsx:261`, which is **`WR-13`** — see §7.
  `grep` over `…/rooms/drafting/agreement/` returns **no** hit for any of the
  four retired strings, which is the acceptance that was actually written.

### 5.4 · `wrangler tail patina-designer-portal --format json`, 60 s

Two `GET /auth/signin` hits inside the window, both HTTP 200:

```
events=2
"outcome": "ok"          (both)
"exceptions": []         (both)
"logs": []               (both)
"scriptVersion": { "id": "05900cfa-11a5-4648-975a-5b04f8f4890c" }
error-level log lines: 0
```

No error spike. The `scriptVersion.id` in the tail independently confirms the
new version is the one serving live traffic.

---

## 6 · What was NOT verified

- **No signed-in production walk.** Every behavioural proof in this report is
  either local (jest, the chromium e2e against a local Supabase stack) or a
  signed-out probe of the live Worker. Leah's thirteen steps at 1440 / 1024 /
  390 against Strata, signed in, have **not** been walked in production. The
  walk in `build/review/walk.md` was run against a local production build.
- **`app.patina.cloud` custom-domain routing.** Every live probe went to
  `patina-designer-portal.kody-be3.workers.dev`. The custom domain was not
  fetched, so the route binding is unproven by this lane.
- **The client-portal fork (AR-g), still owed.** The homeowner's copy is a
  separate renderer (N-1) and was not touched, so the client's paper does not
  carry the no-total sentence. Named as owed in build sheet §T1, unchanged here.
  The SQL keepsake (N-12) is the same gap on a third surface.
- **AM-2's roman heads on the client-visible paper** (`R6`) — accepted, and
  named here so the client fork can follow.

---

## 7 · Owed, with owners needed

| | |
|---|---|
| **`WR-13`** (P2, declined in this wave) | One live `Preview client copy` act survives AR-d at `commercial/service-agreement-instruments.tsx:255-262` — the other design-services agreement surface, which is neither the galley nor the exempt proposal room, and which T3 already reached into to plumb `parts`. Recorded here as **AR-d's known remainder**. Needs an owner: retire the act there (the surface now carries `Review & send`, and the whole-paper overlay is one route away), or rule it in scope. |
| AR-g on the client fork | The homeowner's paper will not carry the no-total sentence until a follow-up wave. |
| `onRecordOffline` on the composer's call | Build sheet §T3 last row — `Record a signature received outside Patina` kept its surviving caller at `service-agreement-instruments.tsx:400`; confirm the composer path if the studio needs it there. |

---

## 8 · Worktrees retired

- `.codex/worktrees/agent-agreement-galley` — removed after `merge-base
  --is-ancestor` confirmed the tip is on `origin/main`.
- `.codex/worktrees/agent-ship-report` — the throwaway this report was committed
  from; removed at the end of the lane.
- The lane worktrees `agent-galley-t2`, `-t3`, `-fix`, `-fix2` were already gone;
  their local branches `agreement-room/galley-t2`, `-t3`, `-fix`, `-fix2` were
  deleted. `agreement-room/galley` is kept on origin.
- Untouched, belonging to other programs: `agent-client-material`,
  `agent-inv-int`, `agent-inv-w1`, `-w2`, `-w3`, `-w3b`.
