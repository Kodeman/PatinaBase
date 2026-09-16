# W6 — integration gate fixes

Worktree: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`
Branch ref: `build/people-room-crm-2026-09-11` → `e8078e931` (pre-rebase tip, **unmoved**)
Working tree: **detached, mid-rebase**, commit 70/160 onto `origin/main` (`c879118ec`)
Date: 2026-09-16

## Headline

Seven gates were reported red. **Two were real and are fixed. Two are not this
program's defects (one proven pre-existing on `origin/main`, one a load flake).
The remaining three are artifacts of the paused W6 rebase and cannot be fixed in
source — they are the rebase's own unfinished state showing through.**

**Nothing was committed or pushed.** `git commit` is refused outright in this
worktree — see §6. That is not a choice I made; it is a hard precondition that
the escalated `person-profile.tsx` ruling has to clear first.

## 0. The state the gates were measured in

    $ cat .git/worktrees/agent-people-build/rebase-merge/{msgnum,end}
    69
    160
    $ git rev-parse REBASE_HEAD
    5c316b1bf44af410c89cc076963abf7d2115af00
    $ git rev-parse build/people-room-crm-2026-09-11
    e8078e931c9f04b88a70dccc0c0950b7142756ff      # still the PRE-rebase tip

69 commits applied, paused on #70, **91 still queued**. The gates were therefore
run against a tree that is neither `origin/main`, nor the branch, nor any commit
that has ever existed — a half-replayed intermediate. Several reds are that fact
showing through, and this is what makes them un-fixable in source: the fix for
three of them already exists in commits still sitting in the todo list.

## 1. FIXED — stale `@patina/types` dist (3 gates)

Symptom on `supabase-typecheck`, `client-typecheck`, `admin-build`:

    Module '"@patina/types"' has no exported member 'RateCardRow'.

Not a source defect. `RateCardRow` is present in source *and* on `origin/main`:

    $ grep -n RateCardRow packages/types/src/agreement.ts
    128:export interface RateCardRow {

…but absent from the built `dist/` that `@patina/types` actually resolves to
(`"types": "./dist/index.d.ts"`), which was built at 02:54, before the rebase
carried `origin/main`'s hour-tracking `RateCardRow` in:

    $ grep -c RateCardRow packages/types/dist/agreement.d.ts
    0

**Fix:** `pnpm --filter @patina/types build` → exit 0; `grep -c` now `2`.
This is the footgun CLAUDE.md names for portal deploys ("skipping that bundles a
stale dist"), hitting type-check instead.

**Nothing to commit:** `dist/` is gitignored (`.gitignore:6:dist/`).

## 2. FIXED — stale `apps/client-portal/.next` (1 gate)

Seven of `client-typecheck`'s eleven errors were stale Next.js generated route
types, e.g.:

    .next/types/app/paperwork/[token]/page.ts(2,24): error TS2307:
      Cannot find module '../../../../../src/app/paperwork/[token]/page.js'

`tsconfig.json` includes `.next/types/**/*.ts`. That `.next` was built at
**03:34 from the branch tip**, which has those routes; the mid-rebase tree does
not have them yet:

    $ ls -d apps/client-portal/src/app/paperwork    → No such file or directory
    $ git ls-tree -d e8078e931 apps/client-portal/src/app/paperwork
      apps/client-portal/src/app/paperwork          → exists at branch tip

**Fix:** removed the stale `apps/client-portal/.next`. All seven errors cleared.

**Nothing to commit:** `.next/` is gitignored (`apps/client-portal/.gitignore:10`).

### Result of §1 + §2 — `client-typecheck` went 11 errors → 4

    ../../packages/supabase/src/hooks/use-time-autostart.ts(52,21): error TS2339: ...
    ../../packages/supabase/src/hooks/use-time-autostart.ts(53,24): error TS2339: ...
    ../../packages/supabase/src/hooks/use-time-autostart.ts(101,19): error TS2353: ...
    ../../packages/supabase/src/hooks/use-time-autostart.ts(136,19): error TS2353: ...

`admin-build` likewise: `RateCardRow` gone, `✓ Compiled successfully in 27.7s`,
now failing only on that same single remaining cause (§5).

## 3. PRE-EXISTING on origin/main — `schedule-region-head.test.tsx`

A **time-bomb test**, unrelated to this program. The fixture pins an install date
of `2026-09-15` and the suite never freezes the clock; today is `2026-09-16`, so
the component correctly renders the past tense:

    src/lib/document/lens-ladder-derivation.ts:332
      `${days < 0 ? 'Installed' : 'Install'} ${long}${words}`

The test asserts the future tense (`/Install 15 September/`, line 463). It began
failing the day after the fixture's install date.

**Proven pre-existing** on a throwaway worktree at `origin/main` (`c879118ec`),
`.codex/worktrees/agent-people-baseline`:

    Test Suites: 1 failed, 1 total
    Tests:       1 failed, 13 passed, 14 total
    ● ScheduleSpine quiet body (W4) › prints head, count line, leader …
      Expected element to have text content:
        /Install 15 September/

Identical failure, identical assertion. The test file and the whole
`document/schedule/` directory are byte-identical to `origin/main`
(`git diff --quiet origin/main HEAD -- …` → clean). **Recorded, not fixed** — it
is `origin/main`'s to fix, and the fix is to freeze the clock rather than to
chase the date forward.

## 4. NOT A DEFECT — `send-sheet.test.tsx` is a load flake

"caps the personal message at 280 …" exceeded the 5000 ms default. It **passes
27/27 in isolation in both trees**:

    build worktree : Test Suites: 1 passed | Tests: 27 passed, 27 total
    baseline (main): Test Suites: 1 passed | Tests: 27 passed, 27 total

The test does `await userEvent.type(textarea, 'x'.repeat(300))` — 300 keystroke
round-trips — and `apps/designer-portal/jest.config.js` sets **no `testTimeout`
and no `maxWorkers`**, so under the full 591-suite parallel run it loses the race.
The file and the whole `document/overlays/` directory are byte-identical to
`origin/main`; `LETTER_NOTE_MAX` (280) resolves to `people/directory/
letter-line-field.tsx`, also byte-identical to `origin/main`.

It **passed in the re-run full suite** (§7). Durable fix, if wanted, is a
`testTimeout` on that case — not a source change.

## 5. REBASE ARTIFACT — `database.types.ts` placeholder (3 gates)

The only remaining cause behind `supabase-typecheck`, `client-typecheck` and
`admin-build`. W6's rebase resolved this generated file by taking *ours*, and
said so: *"took the incoming (ours) snapshot as a placeholder … regenerated
wholesale via `pnpm db:generate` once the rebase completes. **Not yet
regenerated — rebase isn't finished.**"*

    $ grep -c time_autostart packages/supabase/src/database.types.ts        → 0
    $ git grep -c time_autostart origin/main -- …/database.types.ts         → 6

So `origin/main`'s hour-tracking hook `use-time-autostart.ts` rode in with the
rebase while the types file it type-checks against did not.

**Deliberately not fixed here.** The correct repair is `supabase db reset` +
`pnpm db:generate`, and doing it now is wrong on three counts:

1. It cannot be committed (§6), and the 91 queued commits touch this file — any
   regeneration now is clobbered when the rebase resumes.
2. The local DB currently carries **00628–00638** (W3's migrations, in final
   review per project memory). Those are *not* in the mid-rebase tree, which
   stops at 00627 — a reset from this tree would silently delete them out from
   under W3.
3. It is W6's own documented step 5, correctly sequenced *after* the rebase.

Hand-patching a generated file to go green would be a lie in the one file that
is supposed to be mechanically true.

## 6. THE BLOCKER — nothing can be committed

    $ git commit --dry-run
    interactive rebase in progress; onto c879118ec
    Last commands done (69 commands done):
    $ git diff --name-only --diff-filter=U
    apps/designer-portal/src/components/document/people/__tests__/person-profile.test.tsx
    apps/designer-portal/src/components/document/people/views/person-profile.tsx

Git refuses any commit while paths are unmerged. Those two files are the conflict
W6 **escalated rather than resolved**, and the escalation is sound: `origin/main`'s
hour-tracking program (shipped to production 2026-09-15, ruling **HT-8**) put its
only UI door into the admin-gated Hours sheet *inside* the ~800-line teammate
renderer that this branch's unified-card rewrite deletes. Resolving it means
deciding where — or whether — that shipped production affordance survives.

That is a product ruling owed to Kody, not a gate fix, so I did not make it. It
is also why `designer-typecheck` (10 × `TS1185: Merge conflict marker
encountered`) and the `person-profile.test.tsx` suite failure are un-fixable
here: they *are* the unresolved conflict, sitting in the working tree as literal
`<<<<<<<` markers.

## 7. Current designer-jest state (after §1–§2)

    Test Suites: 2 failed, 589 passed, 591 total
    Tests:       1 failed, 7552 passed, 7553 total
    Snapshots:   1 passed, 1 total
    Time:        25.471 s

Was 3 failed suites / 2 failed tests. The two remaining are §3 (pre-existing on
`origin/main`) and §6 (the unresolved conflict). **`send-sheet` is green.**

## 8. The other two, briefly

- **`sql-tests` 9c** — *rebase artifact, and the fix already exists in a queued
  commit.* The DB was seeded from the **branch tip**, whose seed re-anchors the
  Okonkwo windows on `CURRENT_DATE`:

      SET on_site_to = on_site_to + (CURRENT_DATE - DATE '2026-10-20')

  `2026-09-16 − 2026-10-20 = −34 days`, and `2027-08-13 − 34 = 2027-07-10` —
  exactly the observed `expires_at` of `2027-07-11` (window end + 1 day, per
  `create_field_link`). The **test file in the tree** is the pre-re-anchor
  version still asserting the frozen literal `2027-08-14`. At the branch tip the
  test already computes it dynamically:

      RAISE EXCEPTION '9c expected the window end %, got %', v_window_end, r.expires_at;

  That correction rides in on commits still in the todo list (`23e922802`,
  `2f4964494`). Tree and DB simply disagree by 34 days because they are from
  different points in the rebase.

- **`deno-tests`** — *rebase artifact.* The run was pointed at
  `supabase/functions/paperwork-upload`, which exists at the branch tip but is
  added by **pending** commit `0f671b149` ("P3 data + edge … paperwork upload
  door"), still in the todo list. No tests executed; the path just is not in this
  tree yet.

## 9. What actually unblocks the rest

In order, and all of it downstream of one decision:

1. **Rule on the Hours door** (HT-8 vs the unified person card) — Kody's call.
2. Resolve `person-profile.tsx` + its test to that ruling; `git rebase --continue`
   through the remaining 91 commits. Clears `designer-typecheck`, the
   `person-profile` suite, `deno-tests`, and `sql-tests`.
3. Then `supabase db reset` + `pnpm db:generate` (W6 step 5) — with the tree
   finally whole, so 00628–00638 come back rather than being dropped. Clears
   `supabase-typecheck`, `client-typecheck`, `admin-build`.
4. Re-run `ruby apps/mobile/Capture/scripts/generate_project.rb` — W6 flagged the
   three pbxproj/xcscheme files as "took the incoming snapshot to unblock; must
   be regenerated", and that is still outstanding.
5. Raise `schedule-region-head` with whoever owns `origin/main`'s schedule suite
   (§3) — freeze the clock. Optionally add a `testTimeout` for §4.

## 10. Housekeeping

- Baseline worktree `.codex/worktrees/agent-people-baseline` (detached at
  `c879118ec`) was created for the §3/§4 proof and is **left in place** so the
  evidence is re-checkable; retire it with
  `git worktree remove .codex/worktrees/agent-people-baseline --force`.
- Its `pnpm install` needed one unsandboxed run: the sandbox denies writing any
  `.name` file, and `requestidlecallback@0.3.0` ships a stray `.idea/.name`.
  Verified as a sandbox rule, not a repo problem, by direct probe.
- No production anything was touched. No DB reset was run. The shared checkout
  was never reset.

---

# Fresh run — 2026-09-16, post-rebase

Worktree: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`
Branch: `build/people-room-crm-2026-09-11` @ `0e8097a17` (rebase **finished**, onto `origin/main` `c879118ec`)
Baseline for pre-existing proofs: `.codex/worktrees/agent-people-baseline`, detached at `c879118ec`

The rebase that §0–§9 above were measured mid-flight is now complete, so the
rebase-artifact reds (§5, §6, §8) are gone. Two gates came back red. **One was a
real, fixable flake and is fixed. One is proven pre-existing on `origin/main` and
is recorded, not fixed.**

## A. FIXED — `send-sheet.test.tsx` timeout (designer-jest)

Reported tail:

    ● SendSheet … › caps the personal message at 280 and shows the counter once the flag resolves true
      thrown: "Exceeded timeout of 5000 ms for a test.

**Cause.** Line 1073 drives 300 real keystrokes through the React tree:

    await userEvent.type(textarea, 'x'.repeat(LETTER_NOTE_MAX + 20));

`LETTER_NOTE_MAX` is 280, so 300 characters, each a full `user-event` round trip
(pointer/keyboard event dispatch + `act()` flush). `apps/designer-portal/jest.config.js`
sets **no `testTimeout` and no `maxWorkers`** — verified by reading the whole file —
so the case runs on jest's 5000 ms default and loses the race whenever the
607-suite parallel run happens to schedule it against a busy worker. It is a
genuine race, not a product defect: the suite is **27/27 green in isolation** in
both trees, and `send-sheet.test.tsx` is **byte-identical to `origin/main`**:

    $ git diff --stat origin/main HEAD -- …/overlays/__tests__/send-sheet.test.tsx
    (no output)

**Fix** — test-only, one line, asserts exactly what it asserted before; it widens
the window rather than changing the mechanism, because the typing *is* the proof
(`fireEvent.change` bypasses jsdom's `maxLength` clamp, so the clamp assertion
would go vacuous):

    -  });
    +    // 300 real keystrokes: races jest's 5s default under the full parallel run.
    +  }, 20000);

Isolated re-run after the fix:

    Test Suites: 1 passed, 1 total
    Tests:       27 passed, 27 total
    Time:        2.799 s

## B. PRE-EXISTING on origin/main — `schedule-region-head.test.tsx` (designer-jest)

Reported tail: `Expected /Install 15 September/`, received `Installed 15 September`.

**Cause.** A time-bomb test. The fixture pins the install date at `2026-09-15`;
the suite never freezes the clock; today is `2026-09-16`. The component is
*correct* — `src/lib/document/lens-ladder-derivation.ts:332` renders the past
tense once the date is behind:

    `${days < 0 ? 'Installed' : 'Install'} ${long}${words}`

The assertion at line 463 pins the future tense. It began failing the day after
the fixture's own install date and will fail every day from now on.

**Proof it is `origin/main`'s, not this program's.** The whole schedule directory
and the derivation module are byte-identical to `origin/main`:

    $ git diff --stat origin/main HEAD -- \
        apps/designer-portal/src/components/document/schedule/ \
        apps/designer-portal/src/lib/document/lens-ladder-derivation.ts
    (no output)

Reproduced on the throwaway baseline worktree at `origin/main` (`c879118ec`), both
in isolation and in the full suite:

    # isolated
    Test Suites: 1 failed, 1 total
    Tests:       1 failed, 13 passed, 14 total
    ● ScheduleSpine quiet body (W4) › prints head, count line, leader …
      Expected element to have text content:
        /Install 15 September/
      Received:
        ScheduleInstalled 15 SeptemberAdjust datesFold ↑

    # full baseline suite
    Test Suites: 3 failed, 578 passed, 581 total
    Tests:       1 failed, 7445 passed, 7446 total

(The baseline's two extra suite failures are `Cannot find module '@patina/api-routes'`
— that throwaway worktree's `node_modules` has no built `api-routes` dist. An
install artifact of the baseline tree, not a code fact; the build worktree does
not have them.)

**Recorded, not fixed**, per instruction. The one-line repair belongs to whoever
owns main's schedule suite: freeze the clock (`jest.useFakeTimers().setSystemTime(…)`
before a date earlier than 2026-09-15) rather than chase the fixture date forward.

## C. PRE-EXISTING on origin/main — `deno-tests` TS2345 (whole gate)

Reported tail: `TS2345 … 'Uint8Array<ArrayBufferLike>' is not assignable to
'string | ArrayBuffer'` at `supabase/functions/fulfillment-po/core.ts:314:80`.

**Cause.** A toolchain drift, not a code change. `core.ts:18` pins a 2022-era std:

    import { encode as encodeBase64 } from 'https://deno.land/std@0.168.0/encoding/base64.ts';

whose signature is `encode(data: ArrayBuffer | string)`. The local toolchain is
`deno 2.8.3 / typescript 6.0.3`, where `Uint8Array` is generic
(`Uint8Array<ArrayBufferLike>`) and no longer structurally assignable to
`ArrayBuffer`. `bytes` comes from `buildFulfillmentPoPdf` as a `Uint8Array`, so
the call stopped type-checking the day the toolchain moved.

**Proof it is `origin/main`'s.** `fulfillment-po/core.ts` is byte-identical to
`origin/main` (last touched by `7c95cb096`, well before this branch; **zero**
commits in `origin/main..HEAD` touch `supabase/functions/fulfillment-po/`). The
exact gate command on the baseline worktree at `c879118ec` reproduces it verbatim:

    $ deno test --allow-all --config supabase/functions/deno.json supabase/functions
    TS2345 [ERROR]: Argument of type 'Uint8Array<ArrayBufferLike>' is not assignable
      to parameter of type 'string | ArrayBuffer'.
            attachments: [{ filename: `${ctx.poNumber}.pdf`, content: encodeBase64(bytes) }],
                                                                                   ~~~~~
        at …/agent-people-baseline/supabase/functions/fulfillment-po/core.ts:314:80
    error: Type checking failed.

**Recorded, not fixed.** The repair is one import line for main's owner: move to
`jsr:@std/encoding/base64`, whose `encodeBase64` takes `Uint8Array | ArrayBuffer | string`.

### C.1 — what that one error was hiding (worth knowing)

Type-checking aborts the run, so **no edge-function test executed at all** —
including this program's own new functions. Re-running the same gate with
`--no-check` to get underneath it:

    $ deno test --allow-all --no-check --config supabase/functions/deno.json supabase/functions
    FAILED | 1604 passed | 1 failed | 1 ignored (7s)

1604 green. The single failure is `supabase/functions/_tests/stripe-rail.test.ts`,
which needs env the bare command does not supply. Supplying the local stack's env
(`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_ANON_KEY` from
`supabase status -o env`) gets further and then fails on seeding:

    Error: insert projects failed: studio_id_not_designer_studio
      at seed (…/_tests/stripe-rail.test.ts:165:17)
    FAILED | 1604 passed | 2 failed | 1 ignored

**Also `origin/main`'s.** `stripe-rail.test.ts` is byte-identical to `origin/main`,
and every migration that raises `studio_id_not_designer_studio` is on `origin/main`
already — the file lists are identical between tree and `origin/main`, and the
newest of them (`00602_projects_studio_id_on_insert.sql`, `00620_legacy_project_studio_stamp.sql`)
are main's hour-tracking-era work. **None** of this branch's migrations
(`00592–00594`, `00621–00638`) introduce it. Main tightened the `projects.studio_id`
insert door and did not update this seed harness. It is outside the two reported
gates (the gate never reaches it) — recorded as an observation for main's owner.

## D. Gate state after the fix

`designer-jest` — `pnpm --dir …/apps/designer-portal run test`:

    Summary of all failing tests
    FAIL src/components/document/schedule/__tests__/schedule-region-head.test.tsx
      ● ScheduleSpine quiet body (W4) › prints head, count line, leader and the sr-only state line — and no phases
        Expected element to have text content:
          /Install 15 September/
        Received:
          ScheduleInstalled 15 SeptemberAdjust datesFold ↑

    Test Suites: 1 failed, 606 passed, 607 total
    Tests:       1 failed, 7977 passed, 7978 total
    Snapshots:   1 passed, 1 total
    Time:        26.494 s

`send-sheet` is green; the sole remaining red is §B, pre-existing on `origin/main`.

`deno-tests` — unchanged, single error, §C, pre-existing on `origin/main`. Filtering
the full run's output to every error line shows there is exactly one, so nothing
of this program's is hiding behind it:

    $ deno test --allow-all --config supabase/functions/deno.json supabase/functions 2>&1 | grep -E "ERROR|error:"
    TS2345 [ERROR]: Argument of type 'Uint8Array<ArrayBufferLike>' is not assignable to parameter of type 'string | ArrayBuffer'.

## E. Housekeeping

- Baseline worktree `.codex/worktrees/agent-people-baseline` existed from the prior
  round, was reused at `c879118ec`, and was **removed** at the end of this round.
- No production anything. No `supabase db reset`. The shared checkout was never reset.
  The local DB was read only through the edge-test harness.
