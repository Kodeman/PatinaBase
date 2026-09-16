# W6 — sync program branch with origin/main, reconcile numbering

Worktree: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`
Branch: `build/people-room-crm-2026-09-11`

**Status: BLOCKED mid-rebase — stopped per instruction, not resolved unilaterally.**
The rebase is deliberately left PAUSED (not aborted, not continued, not pushed) at
commit 70/160 so no work already resolved is lost and a properly-scoped follow-up
can pick up exactly here.

## 1. Fetch / ancestor check

`git fetch origin` over the repo's SSH remote (`git@github.com:Kodeman/PatinaBase.git`)
was refused by the bash sandbox's HTTP proxy ("This proxy requires authentication") —
not a real auth failure, a sandbox network-policy mismatch for SSH. Re-ran with
`dangerouslyDisableSandbox: true`; fetch then succeeded (exit 0).

- Pre-rebase branch HEAD (`build/people-room-crm-2026-09-11`): `e8078e931c9f04b88a70dccc0c0950b7142756ff`
- `origin/main` tip after fetch: `c879118ec2c3076b7b9d698cf4c85e3a07ad5f34`
- `git merge-base --is-ancestor origin/main HEAD` → **BEHIND**
- `origin/main` top 15 (for context — includes the hour-tracking program's full ship, already in production per project memory):
  ```
  c879118ec docs(time): ship report — hour tracking in production 2026-09-15
  a39769725 docs(design): hour tracking — program record (panel, rulings, charter, build reports)
  904ef62e8 chore(field): merge the build-6 bump after the TestFlight upload
  b1447ba7d chore(field): regenerate Capture.xcodeproj at build 6
  e67ba9672 chore(field): bump Patina Field build number to 6
  1ead6cc53 chore(time): merge hour tracking — eight waves, one ship
  28d404800 docs(time): ship checklist + HT-13-c
  5ffe24667 chore(time): merge ios fixes
  35336ba7a fix(field): an hour nothing priced is not "Billable", and a span grows backwards (R3-m2, W6-R3-07)
  9bb6009b3 style(time): prettier the folio date cases
  e47f1b2cc fix(time): the day a person reads is the day she worked (HT-13-b, R3-m1, MS-10, N-02)
  b030275f8 test(time): the Hours suite can carry a flag, and one case reads the rate card (P2-M3)
  c22ff5399 docs(time): 00596 is no longer standalone-replayable, and says so (MS-14)
  cd39fc76f fix(time): the legacy stamp binds only a designer-domain lead (MS-12)
  64dcdac45 fix(time): an hour nothing priced is neither a balance nor an act (MS-11, n7-02)
  ```

## 2. Rebase — progress and resolved conflicts

`git rebase origin/main` started (160 commits to replay). Progress: **69/160 applied,
paused on commit 70/160** (`5c316b1bf feat(people-room): the Directory as a ledger,
the two cards, the widened add sheet`), 91 remain queued.

### Resolved cleanly (in scope, mechanical)

1. **`docs/design/the-document/DECISIONS.md` + `docs/vision/VISION-DECISIONS.md`**
   (commit `700261663`). origin/main's hour-tracking entry had *already* renumbered
   itself R151→R152 / V10→V11, explicitly because it detected our R151/V10 were
   minted first on this branch ("Renumbered R151 → R152 before merge... this one
   ships last, so this one moved"). **No renumber needed on our side** — R151 and
   V10 stay R151/V10. I only fixed the trailing counters so the ledger's running
   max stays accurate: DECISIONS.md's final entry now reads
   `*Entries add: R151 · last id = R152*` (was `= R151`, which understated the
   file's true max once R152 already exists above it); VISION-DECISIONS.md's final
   entry now reads the cumulative list through `V11` (was stuck at `V10`, written
   before it knew V11 would land above it). Resulting commit: `560df3db5`.

2. **`supabase/seed/00-legacy-grants.sql`** (commit `1970075c2`, W1a). Both sides
   only *appended* new `DO $g$ ... GRANT/REVOKE ...` blocks for disjoint migration
   ranges (ours 00592–00594, theirs 00595–00620) — resolved as a straight union,
   no functional overlap. Resulting commit: `0fd88a4e1`.

3. **`packages/supabase/src/database.types.ts`** (same commit, W1a). Generated file
   — took the incoming (ours) snapshot as a placeholder; per step 5 this is
   regenerated wholesale via `pnpm db:generate` once the rebase completes, so
   hand-merging it is moot. **Not yet regenerated — rebase isn't finished.**

4. **`apps/mobile/Capture/**`** (commit `395cd420a`, W5 — "the People room on the
   designer's phone"), all in the program's explicitly-owned Capture People scope:
   - `Capture/App/DeepLinking/CaptureDeepLink.swift` — two conflicts. First: our
     commit's own refactor (extracting `routeSiteRequestScreen`, inlining the
     onboarding-step switch) against origin/main's pre-refactor shape; took ours
     entirely (verified `routeSiteRequestScreen` was already defined and used
     `SiteRequestFixtures` correctly, nothing lost). Second: a real union — HEAD
     added `.h1LogTime` to the `.work`-realm case list (hour-tracking), ours added
     `.pr1Roster, .pr2Person, .pr3SiteAccess`; combined both into one case list.
   - `CaptureKit/Support/CaptureScreenID.swift` — both sides claimed **"Flow 18"**
     as a doc-comment label (HEAD: `Flow 18 — hours`; ours: `Flow 18 — the People
     room`). Renumbered ours to **Flow 19** (next free number; comment-only,
     doesn't touch the raw `screen.*` string values, non-breaking).
   - `Capture.xcodeproj/project.pbxproj`, `.../xcschemes/Capture.xcscheme`,
     `.../xcschemes/CaptureKit.xcscheme` — per `apps/mobile/Capture/scripts/
     generate_project.rb`'s own header ("re-runnable... rebuilds the project...
     rather than hand-editing pbxproj"), these three files are fully regenerated,
     schemes included, by that script from the Swift source tree. Took the
     incoming snapshot to unblock the rebase; **must be regenerated
     (`ruby scripts/generate_project.rb`) once the rebase completes** rather than
     trusted as merged.
   Resulting commit: `d133399cc`.

### BLOCKING — stopped here, did not resolve

**`apps/designer-portal/src/components/document/people/views/person-profile.tsx`**
and its `__tests__/person-profile.test.tsx`, conflicting against commit `5c316b1bf`
("feat(people-room): the Directory as a ledger, the two cards, the widened add
sheet"). This file is explicitly in the program's owned scope (a People/roster
component), but the conflict is not mechanical — it's a real design collision
between two shipped/in-flight programs on the *same component*:

- Our commit's whole point (per its own doc comment, "THE PERSON CARD — the
  room's unit") is collapsing four role-branched profile renderers (client,
  teammate, contact, maker) into **one unified card** — the maker branch is the
  only one that survives as a separate component. The old `TeammateProfile`-style
  function (~800 lines, conflict region spans working-copy lines 125–924) is
  deleted outright by our rewrite.
- origin/main's hour-tracking program (already **shipped to production**,
  2026-09-15, ruling **HT-8**) added its *only* UI entry point into the Hours
  sheet's admin-gated member scope **inside that exact deleted function**: an
  `ActionButton` (`label="Hours"`, gated on `viewerIsOwnerOrAdmin` via
  `useViewerStudio()`) that calls `openHoursForMember(profileId, name)`. Grepped
  the entire file (both the in-progress merge and our commit's standalone
  368-line replacement, `git show 5c316b1bf:...`) for `Hours`/`hours`/`teammate` —
  there is no equivalent affordance anywhere in the new unified-card design.
- Checked `artifacts/people-room-crm-2026-09-11/rulings.md` and every
  `build/*.md` wave report for any mention of relocating or dropping the Hours
  door — none exists. The people-room-crm panel was cut from a head that
  predates the hour-tracking program, so it never had occasion to address this.

Taking either side loses something real: "ours" silently removes the only entry
point into a shipped, live production feature (HT-8); "theirs" reverts this
program's core, Kody-ruled architectural decision (one card, not four branches).
Deciding *where* "Hours" belongs in the new unified card (a new action row? part
of a `History` region? gated the same way?) is a product/design call, not a
mechanical rebase resolution — outside this task's "resolve conflicts only inside
files this program owns" mandate once it crosses into another program's shipped
feature. Per the task's explicit instruction, **stopping and reporting here**
rather than guessing.

## 3. Migration numbers (partial — rebase incomplete)

As applied through commit 69/160 (`ls supabase/migrations | tail -40`), fully
disjoint, no collisions, no renumbering needed:

- **Ours** (this program): `00592`–`00594` (W1a) and `00621`–`00627` (later
  waves — consent/compliance/authority/site-access/directory-v4/access-grants,
  matching the W1/W3 memory note).
- **Theirs** (hour-tracking, already on `origin/main`): `00595`–`00620`.

**Caveat:** 91 commits remain unapplied in the paused rebase. This audit cannot
confirm no further migrations appear beyond `00627` until the rebase actually
completes past the blocking conflict above.

## 4. Ledgers

- **R151** (`docs/design/the-document/DECISIONS.md`) — kept as **R151**, no
  renumber. The other program (hour-tracking) pre-emptively took **R152** for
  itself specifically to avoid this collision (see §2.1). Only the trailing
  "last id" counter was corrected (R151 → R152) so it reflects the ledger's true
  running maximum.
- **V10** (`docs/vision/VISION-DECISIONS.md`) — kept as **V10**, no renumber. Same
  situation: hour-tracking took **V11** for itself. Trailing cumulative
  `Entries add` line corrected to include V11.
- No `rulings.md`/README references needed updating since the ids themselves
  didn't change.

## 5. `pnpm db:generate`

**Not run.** The rebase is unfinished (paused at commit 70/160, 91 remain), and
`packages/supabase/src/database.types.ts` was resolved with a placeholder
snapshot pending regeneration. Running `db:generate` against a partially-applied
migration set would produce a types file reflecting neither program's actual
final schema and would need to be redone once the rebase completes — so this,
and the required `git diff` emptiness check on `database.types.ts`, are also
blocked on §2's open conflict.

## 6. Strata `--include-all`

**Yes, will be needed.** Hour-tracking's `00595`–`00620` are already shipped and
applied on Strata (per project memory: "Strata 00595–00620"). This program's
`00592`–`00594` are numerically *behind* that already-applied head, so
`supabase db push` for this branch will need `--include-all` to push
out-of-order migrations once this branch is ready to ship. (`00621`–`00627`,
numerically after Strata's current head, need no special flag on their own —
`--include-all` is required by the lower-numbered `00592`–`00594` regardless.)

## Repo state left behind

- `git rebase --continue` / `--abort` neither run past this point — the
  interactive rebase is paused exactly at commit 70/160 (`5c316b1bf`), `onto
  c879118ec` (origin/main tip), with conflict markers live in
  `apps/designer-portal/src/components/document/people/views/person-profile.tsx`
  and its test file. `git status` on the worktree shows this directly.
- **Nothing pushed** — `build/people-room-crm-2026-09-11` on `origin` is
  untouched; no `--force-with-lease` was run since the rebase never finished.
- This report file added with `git add -f` per instruction (artifacts/ paths
  need it), not committed (mid-rebase is not a safe place to add an unrelated
  commit to the sequence).

## To resume

1. A person (or an agent briefed with product authority over the person-profile
   design) decides where the Hours door lives in the new unified card, and edits
   `apps/designer-portal/src/components/document/people/views/person-profile.tsx`
   / `__tests__/person-profile.test.tsx` to keep both the unified-card
   architecture and the HT-8 Hours entry point, then `git add` those two files.
2. `git rebase --continue` to resume through the remaining 90 commits (91 minus
   this one), watching for further conflicts — none diagnosed yet, since the
   rebase never got past commit 70.
3. Re-run `scripts/generate_project.rb` for the Capture Xcode project (its
   pbxproj/xcschemes were placeholder-resolved in §2, not truly merged).
4. `pnpm db:generate`, confirm `git diff` is empty on `database.types.ts` (§5).
5. `git push --force-with-lease` once clean.

---

# Resumed 2026-09-16 (session patina-merged-73)

**Status: REBASE COMPLETE.** All 160 commits replayed onto `origin/main`
(`c879118ec`). Nothing was skipped, nothing was aborted.

- Final HEAD / branch tip: **`12ca2c014169b5d5d30a1cecf41108b22baf9492`**
  (`docs(people-crm): W4 DONE (web) in build-sheet — sha 3f9f1eeff, r14 clean,
  Sanity push blocked on token permissions`)
- `git log --oneline origin/main..HEAD | wc -l` → **160**
- `git merge-base --is-ancestor origin/main HEAD` → origin/main IS an ancestor

## 1. The blocking conflict, ruled and resolved (R-CC)

The person-profile collision §2 stopped on was ruled by Kody by interview as
**R-CC** (recorded verbatim in `rulings.md` §3, after R-CB). The Hours door
lives on the unified card as a card act for a **studio member**, gated on all
three of: the card's role is `'team'`, the person has a linked account
(`profile_id`), and the viewer owns or administers the studio
(`useViewerStudio().isOwnerOrAdmin`). It calls
`openHoursForMember(profile_id, display_name)` exactly as HT-8 shipped, sits
once in the card head (R1 Identity), and carries nothing else across from the
deleted role-branched renderers. HT-8 stands unamended.

What changed against the previous fixer's staged resolution: the act had been
gated on `person.profile_id && viewerIsOwnerOrAdmin` alone, so a **client with
a portal account** would have been handed an Hours door into a studio-wide
member scope. The gate now leads with `person.role === "team"`. A fourth case
was added to the `the Hours door on a teammate (HT-8)` describe block —
*"is absent on a client card with an account — the member scope is the
studio's, not the house's"* — which fails against the old gate and passes
against the new one.

Gate: `pnpm --dir apps/designer-portal exec jest
src/components/document/people/__tests__/person-profile.test.tsx` →
**25 passed, 1 suite passed** (15 at the point of the fix, 25 once W4's
History-region cases replayed on top).

## 2. Conflicts resolved on the resumed run

Three stops, all inside this program's owned scope
(`apps/designer-portal/src/components/document/people/**`). No conflict landed
on a path outside the mandate, so nothing had to be escalated.

1. **Commit 70/160 — `5c316b1bf` "the Directory as a ledger, the two cards, the
   widened add sheet"** (the §2 blocker). Resolved under R-CC as above:
   `views/person-profile.tsx` + `__tests__/person-profile.test.tsx`.
   Before continuing, three files the previous session had left staged but that
   belong to no replayed commit — `build/w6-qa.md`, `build/walk-script.md`,
   `build/w6-rebase.md` — were **unstaged** (`git restore --staged`, contents
   untouched on disk) so they could not be swept into commit 70's tree. Commit
   70's own artifact file, `build/w2b-report.md`, stayed staged.

2. **Commit 71/160 — `33d5b04c6` "style(people-room): W2b — prettier over this
   wave's own files"**, same two files. A pure formatting collision: our HT-8
   resolution carried single-quoted imports and string literals, the prettier
   pass rewrote the file to double quotes. Resolved by taking the **prettier
   side** and re-adding the HT-8 lines in prettier form
   (`import { useViewerStudio } from "@/hooks/use-viewer-studio";`,
   `import { openHoursForMember } from "@/lib/document/open-hours-scope";`, and
   `let viewerStudioRole: "owner" | "admin" | "member" = "owner";`), then
   running `npx prettier --write` over both files so the result is byte-identical
   to what that commit intended. The HT-8 header block and the gate survived the
   auto-merge unconflicted and were re-verified by grep and by the suite.

3. **Commit 146/160 — `322538551` "W4 round-1 review — the pay link's address,
   the studio a touch belongs to, and paper nobody checked"**,
   `__tests__/person-profile.test.tsx`. Both sides appended a new `describe`
   block at the end of the file against a shared two-line trailer. Resolved as a
   **union**: the HT-8 block first, then W4's
   `the History region's last touch` block, each with its own closing trailer.
   Nothing dropped from either side.

4. **Commit 155/160 — `5fad72e30` "W4 r10 — one fact holds the invoice letter,
   the paperwork door fails closed, the studio names the day"**, same file.
   A one-hunk collision inside the `@patina/supabase` jest mock: ours carried the
   prettier-quoted `thirtyDaysOut`, theirs added R-CB's real
   `touchInstantDay: jest.requireActual('@patina/supabase').touchInstantDay`.
   Resolved as a **union in prettier quoting** — R-CB's resolver is kept.

Commits 72–145 and 147–154 and 156–160 replayed with no conflict at all. No
`database.types.ts`, `.pbxproj` or `.xcscheme` conflict arose on the resumed run
(the previous session had already absorbed those at commit 69), so the
pre-ruled mechanical cases were never exercised, and neither
`docs/design/the-document/DECISIONS.md` nor `docs/vision/VISION-DECISIONS.md`
conflicted again — §2.1's resolution (R151/V10 ours, R152/V11 theirs, trailing
counters at the true maximum) rode through untouched.

## 3. Regeneration after the rebase

### Capture Xcode project

`ruby scripts/generate_project.rb` from `apps/mobile/Capture` (the script's own
documented invocation):

```
Generated .../apps/mobile/Capture/Capture.xcodeproj
  CaptureKit:      114 files
  CaptureKitMocks: 4 files
  Capture(app):    158 files
```

It rewrote all three files the previous session had taken as an incoming
snapshot rather than merged — `Capture.xcodeproj/project.pbxproj` (3162 lines
changed), `xcshareddata/xcschemes/Capture.xcscheme`,
`xcshareddata/xcschemes/CaptureKit.xcscheme` — so the project now derives from
the rebased Swift source tree, both programs' files included, rather than from a
hand-picked side.

### `packages/supabase/src/database.types.ts`

`pnpm db:generate` against `postgresql://postgres:postgres@127.0.0.1:54322/postgres`.

**The local database was NOT at the rebased tree's schema.** It carried this
program's `00592`–`00594` and `00621`–`00638`, but **none of hour-tracking's
`00595`–`00620`** — origin/main's shipped range, which the rebase had just
brought in. Generating against it the first time produced a types file with no
hour-tracking objects at all, and `type-check` failed on four errors in
`packages/supabase/src/hooks/use-time-autostart.ts` (`profiles.time_autostart_opt_out`
and `time_autostart_disclosed_at`, added by `00618`, did not exist).

The 25 missing migrations (`00595`–`00608`, `00610`–`00620`; there is no `00609`
on disk) were applied to the **local** database in order, each in a single
transaction with `ON_ERROR_STOP=1`, and recorded in
`supabase_migrations.schema_migrations`. All 25 applied cleanly on top of
`00621`–`00638` — no ordering failure. Nothing was run against Strata.

Regenerating then produced a **419-insertion / 13-deletion** diff, every hunk
explained:

- **+419 lines — hour-tracking's schema, previously absent.** New tables/views/
  RPCs: `studio_member_rates`, `time_entry_ledger`, `studio_hours_rollup`,
  `claim_time_entries`, `log_time`, `start_timer`, `resolve_time_rate_cents`,
  `project_hours_total`, `project_pricing_studio_id`,
  `stamp_project_pricing_studio`, `designer_tier_pricing_studio`,
  `project_author_books_elsewhere`, `project_roster_books_elsewhere`.
- **−3 lines — `time_entries.project_id` widened to nullable** by `00610`
  (`project_id: string` → `string | null` across Row/Insert/Update).
- **−10 lines — cosmetic only.** Five generic helper types (`Tables`,
  `TablesInsert`, `TablesUpdate`, `Enums`, `CompositeTypes`) lose a redundant
  parenthesis pair around a conditional type (`TableName extends (X ? Y : never)
  = never` → `TableName extends X ? Y : never = never`). A Supabase CLI
  formatting change (installed v2.77.0 vs whatever generated the committed
  file), semantically identical, zero schema content.

So: the diff is **not** empty, and it should not have been — the committed file
predated hour-tracking's merge. After regeneration it matches the local database
at the rebased migration head.

Gate: `pnpm --filter @patina/designer-portal type-check` → **exit 0**, clean.

## 4. Migration list after the rebase

`ls supabase/migrations | tail -20`:

```
00621_consent_readers_repointed.sql
00622_consent_record_is_the_only_gate.sql
00623_studio_compliance_documents.sql
00624_project_party_window_and_authority.sql
00625_project_site_access_cards.sql
00626_people_directory_v4_seats.sql
00627_access_grants_and_field_link_window.sql
00628_project_studio_id_backfill.sql
00629_studio_contact_merges.sql
00630_compliance_expiry_sweep.sql
00631_project_party_bids.sql
00632_client_households.sql
00633_decision_court_widened.sql
00634_seat_close_ends_authority.sql
00635_studio_touches_and_channel_refs.sql
00636_invoice_link_hardening.sql
00637_paperwork_upload_door.sql
00638_pay_link_readers_reheaded.sql
20260910152111_create_contact_messages.sql
_pending
```

Both programs' ranges are present and disjoint: ours `00592`–`00594` and
`00621`–`00638`, hour-tracking's `00595`–`00620`. §6's finding stands unchanged —
`supabase db push` for this branch will need **`--include-all`**, because
`00592`–`00594` sit numerically behind Strata's already-applied head.

## 5. What is still owed

- **W6 restarts fresh.** The integration + Chrome QA wave ran against the
  pre-rebase tree; its F1 finding is what produced R-CC. Re-run W6 from the top
  on this HEAD.
- Nothing was deployed. No Strata migration, no edge function, no portal.

---

## Fresh W6 run — sync/reconciliation check, 2026-09-16

**HEAD at this check: `f1f556260317dabd9f091fdd014ebe7865d7cb1d`**
(`fix(scripts): raise git ls-files maxBuffer in pre-push reference checks`),
two commits past this file's own §"Resumed" HEAD
(`12ca2c014169b5d5d30a1cecf41108b22baf9492`) — the intervening commit,
`27f0aeba0` (`chore(people): finish the origin/main rebase — R-CC Hours door,
regen types and Capture project`), closed out the rebase work recorded above;
`f1f556260` is an unrelated pre-push-hook fix. `git log --oneline
origin/main..HEAD | wc -l` → 162 (160 replayed + these 2).

**1. Sync.** `git fetch origin` (first attempt blocked by the sandbox proxy —
"This proxy requires authentication" — retried with the sandbox disabled per
the task's binding instruction, which succeeded). `origin/main` is still
`c879118ec` (`docs(time): ship report — hour tracking in production
2026-09-15`), unchanged since the rebase recorded above. `git merge-base
--is-ancestor origin/main HEAD` → **UP-TO-DATE**. No rebase needed; nothing
pushed.

**2. Migration numbers.** `ls supabase/migrations | tail -50` matches §4
above exactly: this program's `00592`–`00594` and `00621`–`00638`, plus
hour-tracking's `00595`–`00620` (already on Strata), plus the standing
`20260910152111_create_contact_messages.sql` and `_pending`. `ls
supabase/migrations | grep -oE '^[0-9]{5}' | sort | uniq -d` → empty — no
duplicate numbers on the branch. §6/§4's finding still stands: `supabase db
push` for this branch needs **`--include-all`**, since `00592`–`00594` sit
below Strata's already-applied head.

**3. Ledgers.** `docs/design/the-document/DECISIONS.md`: R151 (ours, "People
room as a construction CRM") and R152 (hour-tracking, "The studio's own
clock") both present, each with the other's renumbering note intact, trailing
marker `*Entries add: R152 · last id = R152*` — correct, R152 is the true
max. `docs/vision/VISION-DECISIONS.md`: V10 (ours, "Trade-side compliance
upload door") and V11 (hour-tracking, "A ledger is not a dashboard") both
present with reciprocal renumbering notes, trailing marker `*Entries add: …
V10 · V11 · last id = V11*` — correct, V11 is the true max. No new collision
since the rebase; nothing to renumber.

**Outcome: no action needed.** Branch was already up to date with
`origin/main`, migration numbers were already unique and reconciled, and both
ledgers were already coexisting cleanly with correct trailing counters. This
was a confirmation pass, not a repair.
