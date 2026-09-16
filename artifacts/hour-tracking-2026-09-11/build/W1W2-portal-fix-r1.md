# W1W2-portal — round-1 fixes

Worktree `.codex/worktrees/agent-portal`, branch `hour-tracking/portal`.
Base commits under repair: `29b72c644` (W1 portal) and `2c83cb4d3` (W2 UI).

---

## Findings

### M1 — the pricing studio was read off the viewer's own week · **FIXED**

`apps/designer-portal/src/components/document/hours-ledger.tsx:418-441`.

`lensPricingStudioId` was `(entries ?? []).find(e => e.project_id === lensProjectId)?.project?.studio_id`, and
`entries` is `.eq('user_id', me)` (`:165`). It now comes from the **document**:

```
useQuery({ queryKey: ['document-hours-project-studio', lensProjectId], enabled: lensProjectId != null,
           queryFn: … from('projects').select('studio_id').eq('id', lensProjectId).maybeSingle() })
```

The value is **tri-state** on purpose — `undefined` means *not known yet*, which is not the same fact as
`null` (*this document names no studio*) and must print neither the sentence nor the repair. `PricingStudioLine`
is therefore gated on `lensPricingStudioId !== undefined` (`:630-646`), so the false
"no studio yet — hours here read 'rate pending'" and the stamp door the server would refuse
(`00606:733` → `'this project already names a studio'`) are both gone.

Pinned by `hours-ledger-scope.test.tsx` → *"reads the pricing studio off the document, not off the holder's own week"*.

### M2 — "all documents ×" left `scope==='project'` with no project · **FIXED**

`hours-ledger.tsx:493-504`. The handler now drops the scope that was *about* the document:

```
setLensProjectId(null);
setScope((current) => (current === 'project' ? 'mine' : current));
setShowEntries(false);
```

So no scope is left without a lens word carrying `aria-current`, and `studio_hours_rollup` is never asked for the
whole studio under the caption `SCOPE_CAPTION.project` ("this document").

Pinned by *"drops the project scope when the document is dropped"* — asserts the `this document` word is gone,
`mine` is `aria-current`, and no rollup call was ever made with `{ projectId: null, studioId: 'studio-1' }`.

### M3 — the person-profile Hours door carried no owner/admin gate · **FIXED**

`apps/designer-portal/src/components/document/people/views/person-profile.tsx:806-820, :838`.
`TeamProfile` now reads the viewer's seat from `useOrganizations()` exactly as the ledger does, and the
`ActionButton` is `{profileId && viewerIsOwnerOrAdmin && …}`.

Belt, as the finding asked: a viewer with no lens can no longer be left in *any* scope she cannot leave —
`hours-ledger.tsx:456-470` forces `scope = 'mine'` once `useOrganizations` resolves for a non-owner/admin. (The
finding's other suggested belt — "always include a 'mine' word in `lensWords`" — was already true at `:443-452`;
`lensWords` always starts with `['mine','mine']`. The dead end was that the lens itself is **unrendered** for a
plain member, so a word would not have helped. Hence the forced scope instead.)

Pinned by two new cases in `person-profile.test.tsx` (owner → the door; plain member → no door) and by the
member case in `hours-ledger-scope.test.tsx`.

### M4 — the project rollup was keyed on the viewer's studio · **FIXED**

`hours-ledger.tsx:653-694`. `studio_hours_rollup` hard-filters `ledger.studio_id = p_studio_id`
(`00607:93`) and `time_entry_ledger.studio_id` **is** the project's pricing studio, so the project scope now
passes `lensPricingStudioId`; the member and studio scopes keep `viewerStudio.id`. Where the document names no
studio the rollup is **suppressed** and a sentence stands where the zero did:

> No studio prices this document yet, so its hours do not add up to a studio's week. Name one above and they gain a rate.

Pinned by *"keys the project rollup on the studio that prices the document"* (`projectStudioId = 'studio-2'` →
`rollupCalls.at(-1).studioId === 'studio-2'`) and *"says why a document with no pricing studio has no studio
total"* (`rollupCalls` stays empty, and the "Nothing logged in this window." zero never renders).

One existing case had to become `async`: *"puts the total above the rows that produced it (HT-30)"* now awaits the
document's pricing studio before asserting, because the rollup deliberately no longer renders on a studio that may
not price this house.

### M5 — the in-document door cost a plain member R77's edit and delete · **FIXED**

`hours-ledger.tsx:456-470` (the forced scope) plus `:648-651` (the total's new home).

`scope` still initialises to `'project'` when `initialContext.projectId` is present — that is the **admin**
landing, which HT-9 wants. For a viewer with no lens the effect drops it to `'mine'` with `lensProjectId`
**kept**, which is the pre-change behaviour: the utilization front matter, her per-day `EntryRow` list, the inline
activity/duration edit and R77's delete-with-confirm all return, scoped to the document she arrived with.

HT-10-a is preserved rather than traded away: `MemberProjectTotal` moved out of the project-scope branch and now
renders for any viewer with `lensProjectId` and no lens, **above** the rows (HT-30). The existing HT-10-a case
(`projectTotalCalls` contains `project-1`, `rollupCalls` empty) still passes unchanged.

Pinned by *"leaves a viewer with no lens on her own hours, edit and delete (R77)"*.

### M6 — the rate card invited an admin's own inert write · **FIXED**

`apps/designer-portal/src/components/document/account/studio-rate-rows.tsx` (new `selfAuthoredInert` prop) and
`account-studio-page.tsx:1625-1641` (`selfAuthoredInert={m.user_id === user?.id && myRole !== 'owner'}`).

On that one row the field is replaced by a line that says why, and the dated history still reads. The copy is
split on the row's actual authorship, because 00615 tests the **row**, not the person:

* open row `created_by === userId` → `"$150.00/hr, written by you — which is why your hours still read "rate pending"."`
* open row written by anyone else (including `created_by IS NULL`, which 00615 treats as a deleted author and still
  prices) → `"$150.00/hr, written for you by the studio."`
* then, either way: *"A rate you write for yourself does not price your own hours; the studio's owner, or another
  admin, has to write it."*

New spec `apps/designer-portal/src/components/document/account/__tests__/studio-rate-rows.test.tsx` (3 cases).

### M7 — the role chip printed on every row · **FIXED (not re-graded)**

`hours-ledger.tsx` — the `roleLabel` segment is removed from both readouts (`EntryRow` and `ScopeEntryRow`), and
the now-unused `timeRateRoleLabel` import with it.

I checked the re-grade the finding invited and the blocker **stands**: HT-41's ruled text says "a role chip shown
only when they hold more than one role", and plan §4's portal table binds it to the readout by name — *"a **role
chip** on the log strip, **the ledger entry rows** and the ⌘K verb, shown only when the member holds more than one
live roster role on that project"*. The multi-role count is W3's to fetch (`project_team_members` on that project),
so the segment is absent now rather than stamped on every row; W3 adds it back with its gate.

`timeRateRoleLabel` itself is untouched in `lib/document/authority-hours.ts` — W3 needs it.

Pinned by *"prints no roster-role chip on a single-role member's rows (HT-41)"* (both row renderers).

### M8 — plan §3 items absent from both commits · **PARTLY FIXED, PARTLY DESCOPED — one item blocked**

| § | Item | Outcome |
|---|---|---|
| (c) | `desk-doorway.tsx` `sheet` alias | **FIXED** |
| (c) | copy deck | **FIXED, differently — read the reason** |
| (d) | gap matrix BIL-04 / BIL-08 | **FIXED** |
| (d) | onboarding article `15-hours.md` + Sanity push | **BLOCKED** (file is not in the repo) |
| (a) | HT-35 disclosure band + per-member opt-out | **DESCOPED — needs a ruling** |
| (b) | `time_autostart_disclosed` / `_opted_out` emitters | **DESCOPED with (a)** |
| (e) | `e2e/document/hours.spec.ts` | **WRITTEN, NEVER RUN** (see Gates) |

**(c) the alias.** `desk-doorway.tsx:84-90` adds `'sheet'` to `DOORWAY_KEYS` and `:136-137` reads
`(params.get('book') ?? params.get('sheet'))`. Done-when *"/desk?sheet=hours opens the Hours book"* is now true in
code.

**(c) the copy deck — a deviation, stated outright.** The plan says rewrite `?sheet=hours` → `?book=hours` at
`copy-deck.md:357,379,627`. I did **not**, because the premise is narrower than the repo: `?sheet=` is baked into
the shipped email template (`packages/email/src/templates/onboarding-hours.tsx:37`), into three seeded template
migrations (`00293:167`, `00310:299`, `00404:333`), into the drip config (`00294:87`) and an SQL test fixture
(`supabase/tests/notifications/onboarding_drip_retiming_test.sql:170`) — and `copy-deck.md:628` uses
`?sheet=accounts` for E8 as well. Mail already sent carries `?sheet=`. Rewriting only the deck would swap one
disagreement for its mirror image. So the deck now **documents the alias** (a new Conventions bullet at `:18-25`,
naming the code, both spellings, and the reseed the rewrite would require first). The Done-when — "the copy deck no
longer disagrees with the code" — is satisfied, by the deck agreeing with what the code now accepts.

**(d) the onboarding article is BLOCKED, not skipped.**
`artifacts/designer-onboarding-learning-2026-09-03/content/wave-1/15-hours.md` **is not a tracked file**:
`git ls-files --error-unmatch` → `did not match any file(s) known to git`. It exists only in the main checkout's
working tree, so it is absent from this worktree and cannot land as a commit on this branch. Copying it in would
import another program's untracked artifact tree — the landmine the git-hygiene rule names. **Owed to the
orchestrator:** track that file (or tell me its real home), then the two studio-scope sentences and the Sanity push
are a five-minute stage. The Sanity push is in any case an external mutation I have no session authorization for.

**(a)/(b) HT-35 is DESCOPED because it has no storage home and no number.** The blocker is not effort:

* The opt-out is a **per-member, default-on, cross-device preference**. There is no column for it.
  `user_settings` (21 columns) has none; `profiles` has none. Its only no-migration candidate is
  `profiles.help_state` (`Json`), which is the help-system's cache, hydrated and swept by
  `components/document/help/help-state-provider.tsx` — homing a *timer preference* there is a design decision, not
  an implementation detail.
* Plan §3 gives HT-35 **no migration**, and this program's reserved numbers are spent (`00604–00607` applied,
  `00615`/`00620` spent). `00609`/`00617` are W3's and W6's slack, not mine — taking one is exactly the
  cross-lane collision §0.2a warns about.
* The disclosure-band half alone *could* ride the help-system's feature-announcement backend, but shipping half of
  a ruled item (a band with no opt-out to read) would make the band lie about the choice it offers.

So: **no HT-35 code, and the two emitters stay undefined** — `document-events.ts:177-179` already says "no emitter
is defined here yet because nothing can fire one honestly", which stays true. An emitter with no caller would make
the module lie in the other direction. **Owed: a ruling on where the opt-out lives, and one migration number.**
Until then HT-35's Done-when is openly unverifiable rather than quietly unverified.

---

## Gates

Run from the repo root with `pnpm --dir .codex/worktrees/agent-portal`.

| Command | Result |
|---|---|
| `pnpm --filter @patina/designer-portal type-check` | **PASS** — `tsc --noEmit`, no output |
| `pnpm --filter @patina/designer-portal test` | **PASS** — 575 suites, **7281 tests**, 0 failed, 1 snapshot |
| `pnpm --filter @patina/designer-portal lint` | **PASS** — `203 problems (0 errors, 203 warnings)`; all pre-existing (the only warnings on files I touched are `account-studio-page.tsx:776` unused-disable and `person-profile.tsx:243-244` exhaustive-deps, both untouched by this change) |
| `pnpm --filter @patina/supabase type-check` | **PASS** |
| `pnpm --filter @patina/admin-portal build` | **PASS** — the repo's strictest gate (`next build`, no `ignoreBuildErrors`) |
| `pnpm --filter @patina/supabase test` | **PASS** — 101 files, 1251 tests, 12 skipped |
| `pnpm --filter @patina/manufacturer-portal type-check` | **PASS** |
| `pnpm --filter @patina/client-portal type-check` | **FAIL — pre-existing, not this branch's** (see below) |
| `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live … test:e2e -- e2e/document/hours.spec.ts` | **NOT RUN — blocked** |

The push's pre-push hook ran the affected plan (12 checks over the whole branch-vs-`origin/main` diff) and printed
`Affected verification has advisory failures.` **I chased it down: it is `@patina/client-portal type-check`**, and
it is nothing to do with hour tracking —

```
src/hooks/use-aesthete-matches.ts(54,55): error TS2339: Property 'kind' does not exist on type 'Error'.
src/hooks/use-aesthete-matches.ts(103,51): error TS18046: 'error' is of type 'unknown'.
src/lib/aesthete/matches.ts(21,8): error TS2307: Cannot find module '@patina/aesthete-quiz' …
```

`packages/aesthete-quiz/package.json` is `"main": "./dist/core/index.js"` and **has no `dist/` in this worktree** —
the dist-resolved-package hazard, in a worktree nobody has built that package in. No client-portal file appears in
this branch's changed paths (the hook's own `changedPaths` list confirms it). Fix is `pnpm turbo build --filter
=@patina/aesthete-quiz` in whichever worktree runs that gate; it is not a code defect and not this stage's.
The push landed: `2c83cb4d3..ff2065ed6  hour-tracking/portal`.

Targeted runs, for the record:

* `jest src/components/document/__tests__/hours-ledger-scope.test.tsx` → **12 passed** (6 pre-existing + 6 new).
* `jest src/components/document/account/__tests__/studio-rate-rows.test.tsx` → **3 passed** (new file).
* `jest src/components/document/people/__tests__/person-profile.test.tsx` → **13 passed** (11 + 2 new).

`supabase db reset` was **not** run (not this stage's to own), and no `supabase/` or `packages/supabase` source
changed, so no migration, grants-seed or `database.types.ts` regeneration is owed by this stage.

### Why the e2e gate did not run — and why I did not fake it

Two independent blockers, both measured:

1. **Port 3000 belongs to another program.** `lsof -nP -iTCP:3000 -sTCP:LISTEN` → `node 95936`, whose `cwd` is
   `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build/apps/designer-portal` — the **peer
   people-room CRM program's** dev server, pointed at the 54321 stack. My own `next dev -p 3000` died on
   `EADDRINUSE`. `playwright.config.ts` hardcodes `baseURL: 'http://localhost:3000'` with
   `reuseExistingServer: !CI`, so running Playwright now would have signed in to the peer program's portal against
   the peer program's database and reported a green that meant nothing. I did not kill their server and did not
   run the suite.
2. **The shared local stack moved under this stage.** Mid-session, `127.0.0.1:54422`'s `public` schema read **0
   tables** and `relation "projects" does not exist`; minutes later the same probes read **365 tables / 564
   migrations** with `00600–00607, 00610–00613, 00615, 00620` applied and `time_entry_ledger`,
   `studio_hours_rollup`, `project_hours_total`, `stamp_project_pricing_studio`, `resolve_time_rate_cents` all
   present (`pg_postmaster_start_time() = 2026-09-13 08:00:13Z`). Another lane was replaying migrations during the
   window — the §11 hazard, observed again. Any browser result taken across that window would have been a lie in
   either direction.

`apps/designer-portal/.env.local` was written (gitignored; `git check-ignore` confirms) pointing at **this
program's isolated stack** — `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54421`, `SUPABASE_DB_URL=…:54422`,
`NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live`. It is correct and safe to reuse; it points at **no prod**. No dev
server of mine is left running (mine exited on EADDRINUSE; `lsof` shows only the peer's).

**What the new e2e spec asserts** (`apps/designer-portal/e2e/document/hours.spec.ts`, chromium-only, serial, seeds
nothing, starts and closes **no timer** — the `00177:37-41` one-running-timer index is per user globally):
`/desk?sheet=hours` opens the `Hours` dialog and the doorway then strips its own query; the lens renders with
`mine` current and `the studio` present at **1440 / 1024 / 390**, every word ≥ 44px, with no horizontal page
overflow; the studio scope shows the group-by row with `by person` current and keeps the entries one act away.
**It has never been executed.** Treat its first run as part of the next stage, not as a regression of this one.

### What this stage did NOT verify

* No live-mode render check and no e2e pass — per above. The sheet's behaviour at 1440/1024/390 is **unobserved**;
  every claim above rests on `tsc`, jest and the admin build.
* No SQL: nothing in `supabase/` changed, and no RLS claim is made here.
* `client-portal`'s type gate is RED for a reason outside this branch (above); `manufacturer-portal` type-checks
  clean. Neither imports anything this stage touched.
* Lint outside designer-portal is not trusted (no resolvable config anywhere else) and was not run.
