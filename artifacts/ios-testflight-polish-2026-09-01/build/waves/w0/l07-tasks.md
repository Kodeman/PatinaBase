# First Flight · W0 · L0.7 — The daily-surfaces coverage walk · task list

Lane: **L0.7** · Branch: `first-flight/w0-l07` ·
Worktree: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-ff-w0-l07`

This lane **files findings and fixes nothing in app code**. Its only code change is the **seed**.
Read order taken: `rulings-2026-09-02.md` → `PROGRAM.md` §3 W0 L0.7 + §7 + §2 → `waves/w0/steward.md`.

---

## Standing lines (PROGRAM.md §7 requires all four before task 1)

### 1. `IOS_GATE_UDID`

```bash
export IOS_GATE_UDID=BD0AC7E5-EF5E-4C64-85A7-825D0CEA7BE8   # clone ff-w0-l07, L0.7's own
```

Exported for the whole session. **`ios-gate.sh unit` / `ui` / `all` are NOT run in this lane** —
until L0.1 lands the `IOS_GATE_UDID` requirement, `sim_destination()` scrapes `head -1` and can seize
another lane's clone (steward.md §3 rule 2, PROGRAM.md §7 hard rule 8). This lane compiles with the
explicit `xcodebuild` line in task 4 and installs a **signed** Debug product.

### 2. The VISION check

> *Name any finding in my table whose fix would add or entrench something VISION §6 refuses
> (tab / zone / dashboard UI, shadows, red/green status, badges, engagement optimisation, the "AI"
> label) and say why it survives.*

**Answered at the end of the walk, over the actual `L07-NN` table** — this lane's table does not exist
until the walk has run. Two structural answers are already owed and are written into
`l0.7-coverage-walk.md` §VISION:

- **The walk itself runs on the four-tab root** (`house-first`, ruling **D1**), which is
  literally "tab UI". It survives because **V7** logs the D1 exception: the iOS app (surface #2) may
  use a tab bar; The Document (surface #1) still may not. Every finding this lane files against the
  tab bar is a finding about a root VISION has already excepted, not a proposal to add one.
- **No finding in this lane may propose a badge, a red/green status pip, or a shadow as its fix.**
  Where a surface needs to say "this failed", the fix sketch names words, not a colour. Checked
  per row before the table is closed.

### 3. The notes I must apply

**None.** `build/waves/w0/` carries no integration note addressed to L0.7 at the time this list was
written (`ls artifacts/ios-testflight-polish-2026-09-01/build/waves/w0/*-notes.md` → checked in task 0).
L0.7 owns no app file, so no other lane can address a code note to it. If one appears mid-lane it is
added here as a numbered task before the walk closes.

### 4. The notes I will send

Written in full, with exact final text, to
`artifacts/ios-testflight-polish-2026-09-01/build/waves/w0/l07-notes.md`:

- **To L0.3 (and to the steward) — `supabase/config.toml` is shared.** This lane appends one entry to
  **both** `sql_paths` arrays. L0.3 will append `./seed/catalog/first-flight-catalog.sql` to the same
  two arrays. Exact conflict-resolution text in the notes file.
- **To Fable — the flag-state question steward.md §5 raised is answered** by the brief under ruling
  **D1**: walk the four-tab root via `-PatinaFlags house-first`. Recorded at the top of the walk file.
- **To L1-B / L1-C / L1-E / L1-F — the routed findings**, each with its exact `where` at file:line and
  a fix sketch, listed by id.

---

## Task 0 — Confirm the workspace and the lock

- [ ] `git rev-parse --show-toplevel` prints the L0.7 worktree, never `/Users/kody/Code/patina-merged`
- [ ] `.writer.lock.d` created at start (rmdir at report)
- [ ] `ls build/waves/w0/*-notes.md` — record which notes exist and whether any is addressed to L0.7

**Commit:** none.

---

## Task 1 — Prove the seed gap before fixing it (the "failing test")

The seven fixture items the charter names, probed against the **current** local DB, so the fix is
measured and not assumed.

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -qAt -f \
  artifacts/ios-testflight-polish-2026-09-01/build/waves/w0/l07-fixture-probe.sql
```

Expected **before**: `documents_client_visible = 0` and `comms_threads_project = 0` — the two failures.
The other five (sent proposal, pending decision, open invoice, project, order) already pass and must
not regress.

**Commit:** the probe file, with the lane's other evidence.

---

## Task 2 — Write the seed fixture

`supabase/seed/first-flight-client-fixture.sql` (new), wired into **both** `sql_paths` arrays in
`supabase/config.toml` immediately after `./seed/project_documents_tasks.sql`.

It must:

- be **idempotent**, keyed by **fixed uuids**, in the style of the neighbouring seed files
  (`DO $$ … BEGIN … RAISE NOTICE … END $$;`, guard clauses that skip cleanly, `ON CONFLICT`);
- change **only** `client@patina.dev`'s house — no other account's rows;
- make the three Aspen Loft documents **`client_visible`** and give them `storage_path` values under
  `b0000000-0000-0000-0000-0000000000d1/…` (the storage policy
  *"Project members can read documents"* matches `storage_path` to `objects.name` and requires
  `client_visible = true`), leaving **one openable**, **one pointing at an absent object** (the
  fail-to-open case step 4 needs), and **one with a NULL path** (`DocumentError.missingPath`);
- create **one live project thread**: `comms_threads(kind='project')` on Aspen Loft,
  `comms_thread_participants` for the client (`role='client'`) and Leah (`role='designer'`), and a
  short `comms_messages` back-and-forth ending on the designer, so the thread is unread for the client.

**Commit:** `feat(seed): First Flight client fixture — client-visible documents and a live project thread`
with pathspecs `supabase/seed/first-flight-client-fixture.sql supabase/config.toml`.

---

## Task 3 — Reset (this lane resets **third**) and re-run the probe

```bash
pnpm supabase:reset          # unsandboxed, from the L0.7 worktree
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -qAt -f \
  artifacts/ios-testflight-polish-2026-09-01/build/waves/w0/l07-fixture-probe.sql
```

Expected **after**: all seven rows non-zero. Announce reset start and finish in the report
(steward.md §4 — L0.2 first, L0.3 second, L0.7 third).

Then put real bytes behind the openable document (a **local** storage write, not a code change):
one small PDF uploaded to `project-documents` at the seeded path with the local service_role key.

**Commit:** none (evidence goes in the walk file).

---

## Task 4 — Build **signed** Debug from this worktree, into this worktree's DerivedData

```bash
xcodebuild build \
  -project /Users/kody/Code/patina-merged/.codex/worktrees/agent-ff-w0-l07/apps/mobile/Patina/Patina.xcodeproj \
  -scheme Patina -configuration Debug \
  -destination 'platform=iOS Simulator,id=BD0AC7E5-EF5E-4C64-85A7-825D0CEA7BE8' \
  -derivedDataPath /Users/kody/Code/patina-merged/.codex/worktrees/agent-ff-w0-l07/apps/mobile/Patina/.build/DerivedData
```

**No `CODE_SIGNING_ALLOWED=NO`** — a walker drives this build; the flag strips entitlements and every
keychain call fails silently (§7 hard rule 6). The **first** run fails on the gitignored
`Generated/GitCommit.swift`; run it **twice** (`A2-08`, steward.md §6).

**Commit:** none.

---

## Task 5 — Install, HID preflight, sign in

- `xcrun simctl install BD0AC7E5-… <the signed .app>`
- **HID preflight** before trusting one tap: `describe_screen` → tap a known control →
  `xcrun simctl io … screenshot` → confirm the screen changed. A headless-booted simulator swallows
  synthetic input while screenshots look healthy (§7 hard rule 8).
- Launch, **on every launch**, with both arguments — an argument-less launch is a **production**
  launch (§7 hard rule 4):
  `-DeploymentTarget local -PatinaFlags house-first`
- Sign in `client@patina.dev` / `password123`.

**Commit:** none.

---

## Task 6 — The seven-step walk, on the four-tab root (ruling **D1**)

Each step: screenshot to
`artifacts/ios-testflight-polish-2026-09-01/shots/w0-l0.7/<step>-<slug>.png`, a line in
`shots/w0-l0.7/ledger.md`, and a written verdict in `build/waves/w0/l0.7-coverage-walk.md`.
Findings are written **as they are found**, not at the end, with id `L07-NN`, `where` at file:line,
evidence, fix sketch, effort and proposed tier (**T0** if a blocker/major on a G5 surface).

1. Proposal detail → signing, at `large` **and** `accessibility-extra-large`; does the state change
   land without a manual refresh?
2. Decision detail → approve **and** defer, both sheets, both text sizes.
3. Message send; then send with the stack **stopped** (`docker pause supabase_kong_supabase`) and read
   what the app says (`C4-04` predicts: nothing).
4. Documents — list, open, and one that fails to open.
5. Project detail and one order (`C4-05`: six of seven reads are `try?`).
6. Invoice detail, the Pay path to its failure state, and a refresh that fails with rows on screen
   (`C4-13`).
7. Each of 1–6 again with the stack stopped, then restarted.

Discipline: `describe_screen` over `scan_ui`; ≥ 250 ms settle after any layout change, 1 s after
navigation; never batch taps across a layout change; three attempts then file a coverage gap and move
on — never loop.

**Commit:** the walk file, the ledger and the shots, by pathspec.

---

## Task 7 — Close

- Answer the VISION check over the finished `L07-NN` table.
- Write `l07-notes.md` with the exact final text of every note.
- `docker unpause supabase_kong_supabase`; `docker ps` must show it **Up**.
- `rmdir .writer.lock.d`.

**Commit:** `docs(first-flight): L0.7 coverage walk — findings, ledger and integration notes`.
