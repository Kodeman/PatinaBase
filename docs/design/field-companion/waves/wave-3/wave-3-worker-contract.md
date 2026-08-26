# Wave 3 worker contract — Field Companion "The visit spine"

You are a worker for the Wave 3 conductor (`wave-3-conductor`). Read this file once, then your brief.

## Workspace — non-negotiable

**Your working directory is the WORKTREE:**

```
/Users/kody/Code/patina-merged/.claude/worktrees/field-companion-w3
```

Branch `feat/field-companion-w3`, forked from `695addb5f`.

- **NEVER run any git command against `/Users/kody/Code/patina-merged` itself** (the main checkout). Another
  session owns its index. Your brief's bash blocks say `cd /Users/kody/Code/patina-merged` in places —
  **that is wrong for every command that writes or reads git state; substitute the worktree path.**
  In particular: **never `git checkout main`, never `git pull`, never `git stash`, never `git add -A`.**
- `git fetch` fails on this sandbox's proxy. Do not try. Use the local ref `695addb5f`.
- `git push` fails too. If your brief tells you to push, skip it and write "push owed" in your report.
- Stage with **explicit pathspecs only**. Commit with Conventional Commit subjects
  (`feat(scope):`, `fix(scope):`, `test(scope):`, `docs(scope):`, `refactor(scope):`, `chore(scope):`).
  **Never a `merge:` subject** — the husky commit-msg hook rejects it.
- Run `git status --short` before every `git add` and confirm nothing unexpected is staged.

## Reference documents — read-only, by absolute path

The plan, its review, the spec, the rulings and the SQL companions are **untracked in the main
checkout**, so the worktree does not contain them. Read them at these paths. **Never write to them.**

- Plan: `/Users/kody/Code/patina-merged/docs/design/field-companion/plans/wave-3-plan.md`
- Spec: `/Users/kody/Code/patina-merged/docs/design/field-companion/field-companion-package.md`
- Rulings: `/Users/kody/Code/patina-merged/docs/design/field-companion/field-companion-rulings.md`
- SQL companions: `/Users/kody/Code/patina-merged/docs/design/field-companion/plans/sql/`

You will normally read only your own brief. Open the spec or rulings only when your brief points you there.

## Sandbox

This sandbox denies writes to `.env*` paths and denies network except a small allowlist. If a command
fails with "Operation not permitted" or a network refusal, retry it once with
`dangerouslyDisableSandbox: true` and say so in your report. Use `$TMPDIR` for scratch, never `/tmp`.

## iOS gates — FOREGROUND ONLY, never `run_in_background`

Secrets are already in place (`Secrets.swift`, `Secrets.xcconfig` — both gitignored; **never commit them**).
Simulator: **iPhone 17 / iOS 26.5**. Team `VP22LXHT7L`.

Run all three steps explicitly, from `apps/mobile/Capture` inside the worktree:

```bash
cd /Users/kody/Code/patina-merged/.claude/worktrees/field-companion-w3/apps/mobile/Capture
D=.build/gate-derived-9ca4fd663a24

ruby scripts/generate_project.rb

xcodebuild build -project Capture.xcodeproj -scheme Capture \
  -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 17' \
  CODE_SIGNING_ALLOWED=NO -derivedDataPath "$D" -quiet

xcodebuild test -project Capture.xcodeproj -scheme CaptureKit \
  -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 17' \
  CODE_SIGNING_ALLOWED=NO -derivedDataPath "$D" -quiet

swiftlint lint --quiet --strict
```

All three must be green before you commit. Paste the **verbatim tail** of each into your report —
never a paraphrase, never "tests passed".

Adding a `.swift` file needs no pbxproj edit by hand (`generate_project.rb` globs `**/*.swift`), but
**when you add or remove files you must commit the regenerated `Capture.xcodeproj`** along with them.

Build timeouts: a cold build can take several minutes. Use a generous `timeout` (600000 ms) and run
it in the foreground.

## Database work — only if your brief says so

- Hold the atomic lock for the whole session: `mkdir /tmp/patina-local-supabase-db.lock.d`
  (if it exists, another agent holds it — sleep and retry; release with `rmdir` when done).
- **NEVER `supabase db push`.** Never touch Strata or any remote project. Local only.
- Before any `pnpm supabase:reset`, confirm `apps/*/.env.local`'s `NEXT_PUBLIC_SUPABASE_URL`
  points at `127.0.0.1` — it has pointed at prod before.

## Standing facts (from the ratified rulings, 2026-08-24)

- **Patina Field is not live anywhere.** No in-app backward compatibility is owed: no legacy-decode
  of `capture.session-context.v1`, no upgrade path, no legacy-decode test. A fresh install may reset
  the local store.
- **FC-R2:** two kinds (`site`, `sourcing`), three kits (`walk_through`, `trade_walk`, `install`).
  A kit is never also a kind. No visit = null kind.
- **FC-R5:** `project_rooms.id` and `public.rooms.id` are separate lanes. Merge by trimmed name only.
  **Never cross-assign.**
- **FC-R11:** a note is `solo` or `conversation`, chosen at start; the kit carries the default; a
  conversation note shows a **tappable** affirmation chip (inert `Text` is not an affirmation).
  **FC-R9: no background audio.**
- **Principle 4:** `suggestion_confidence` orders the tray and is **never rendered**. The basis is
  always shown in words.
- **Copy:** `.agents/skills/patina-brand-voice/SKILL.md` — plain-spoken Midwest, sensory and specific,
  understatement over exclamation. **Never the word "AI"**, never algorithm/engine/model mechanics in
  anything a designer reads. **The word "Inbox" leaves Field's user-facing copy.**
  Naming: *Today* · *a visit* · *Visits* · *unplaced*.
- There is no `CaptureType.caption`. The enum is exactly `display, title, title2, body, bodyEmph,
  callout, footnote, eyebrow, monoSmall, monoBody`.
- `CaptureStatus` has **no `.dismissed` case**.

## Scope

Deliver exactly what your brief asks. No unrequested features, refactors, or abstractions. Code
comments only for constraints the code cannot show. **You never dispatch subagents** — not helpers,
and never a reviewer. Review arrives from the conductor after your report.

## Report contract

Write your **full** report to the report file your dispatch names. Return to the conductor only:

1. Status: `DONE` / `DONE_WITH_CONCERNS` / `NEEDS_CONTEXT` / `BLOCKED`
2. The commit shas you made (`git log --oneline` for your range)
3. One line of test summary
4. Concerns, if any

Evidence, not paraphrase: command output, diff stats, pass/fail counts.
