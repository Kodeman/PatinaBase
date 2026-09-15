# W6 — fix round 2 (lane C, Patina Field)

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-ios`, branch `hour-tracking/ios`, base `55abcb2d0`.
Both round-2 findings applied. Neither was refuted.

---

## W6-R2-01 — `TimeEntrySource` never got `field_manual` (major/high) — FIXED

**Confirmed at `55abcb2d0`.** `packages/supabase/src/hooks/use-time-tracking.ts:396-401` carried
`'timer_auto' | 'timer_manual' | 'manual_entry' | 'command_bar'` while the doc comment three lines
above promised "W6 adds `field_manual`". `grep -rn field_manual packages/ apps/designer-portal/src`
found the value in exactly two comments (`use-time-tracking.ts:395`,
`apps/designer-portal/src/lib/analytics/document-events.ts:34`) and in no TS union anywhere —
plan-v2 §7's named wave item ("TS vocabulary (W0-9) — this wave widens `CreateTimeEntryInput.source`
with `'field_manual'`") was simply not done, and `W6-impl.md` neither lists the file nor owes it in §6.

**Fix.** `| 'field_manual'` added to the union. The doc comment is re-worded to describe what the
union now *is* rather than what a later wave will add: `command_bar` is W3's ⌘K verb, `field_manual`
is W6's Patina Field sheet, and `internal` is still owed to W4. `'internal'` was **not** added —
it is W4's line item, not this wave's, and this round's scope is the two findings.

**Gates named by the finding (§0.24):**

| Command | Result |
|---|---|
| `pnpm --filter @patina/supabase type-check` | **pass** (`tsc --noEmit`, no output) |
| `pnpm --filter @patina/admin-portal build` | **pass** (`next build --webpack`, full route table printed, exit 0) |

> Worth recording for the next lane that runs these in a fresh worktree: both gates fail for
> environment reasons before they fail for code reasons. `type-check` first reported ~40
> `TS2307: Cannot find module '@patina/types' / '@patina/utils'` — the dist-resolved packages had
> never been built here (`pnpm --filter @patina/types build`, `… @patina/utils build` fixes it).
> The admin build then failed on `Module not found: '@patina/design-system'`, then on
> `'@patina/api-routes'`; `pnpm --filter "@patina/admin-portal^..." build` builds the whole
> dependency set at once and the build goes green after it. Worse: a **partially** completed
> `next build` exited **0** twice with its output ending at "Creating an optimized production
> build …" and no `.next/BUILD_ID` on disk (`.next/diagnostics` stuck at `"buildStage":"compile"`).
> The pass above is the run that printed the route table and finished in 71.8s — a bare exit code
> from this build is not by itself proof.

---

## W6-R2-02 — six activity chips, two of them not on a 390pt screen (major/medium) — FIXED

**Confirmed.** At rest the chip row showed Drive / Site visit / Sourcing / Client, clipped Design
at the right edge and put Admin past it entirely; the row was
`ScrollView(.horizontal, showsIndicators: false)`, so the only affordance that it scrolled was the
half-cut Design capsule. Admin — "a sourcing run or **admin time**" is §7's own goal sentence — was
a first-class value reachable only by a gesture nobody was told to make.

**Fix (the finding's second option, not the first).** `showsIndicators: true` was rejected: a
SwiftUI horizontal scroll indicator is transient — it appears *while* scrolling — so at rest the
affordance would still be the clipped capsule and Admin would still be invisible on arrival. The
chips now **wrap** instead of scrolling sideways. `LogTimeChips` renders into a new
`LogTimeChipFlow: Layout` (file-local, ~60 lines, iOS 18 deployment target so `Layout` is available):
chips are placed left to right and pushed to the next line when the next one would cross the
proposed width; a row that cannot hold even one chip still keeps it, so a very long label overflows
rather than vanishing. The capsule itself — font, padding, `minHeight: 44`, fill, stroke,
`contentShape`, `.isSelected` trait — is untouched. `roleStep`'s chip row (HT-41) gets the same
behaviour for free, since it uses the same component.

**Verified on the live AX tree, sim-verified (P-6):**

*390pt — iPhone 17e, `2AB2290B-9505-4E33-8843-18B7DD1DF92B`, `AXFrame {{0,0},{390,844}}`,
launched at `H1.log-time`:* all six chips on screen at rest, in two rows, every one 44pt tall —

| Chip | x | width | right edge |
|---|---|---|---|
| Drive | 20.0 | 60.3 | 80.3 |
| Site visit | 88.3 | 79.7 | 168.0 |
| Sourcing | 176.0 | 83.0 | 259.0 |
| Client | 267.0 | 63.3 | 330.3 |
| Design | 20.0 | 70.7 | 90.7 |
| Admin | 98.7 | 67.3 | 166.0 |

Nothing crosses the 370pt content edge (20pt gutters), and nothing is clipped. Before the fix,
Design sat at x 338.3 with its right edge at 409 and Admin was absent from the tree.

*Hit testing through the custom layout:* tapped (132, 702) — Admin — and the screenshot shows Admin
filled verdigris and Drive back to outline, i.e. selection still routes through the `Layout`
container.

*440pt — iPhone 17 Pro Max, `EDF8B28E-32F2-4DD1-944E-25E3C8538770`:* the row re-flows by width —
five chips on line one (Drive 20 → Design right edge 409, inside the 420pt content edge) and Admin
alone on line two. All six visible, none clipped.

> 1440 is a portal width and does not exist on this surface; the wide-end check is the 440pt phone
> above. No portal file's layout was touched this round (the only portal-package edit is a type
> union).

**Gate:**

| Command | Result |
|---|---|
| `ruby apps/mobile/Capture/scripts/generate_project.rb` | ran — 111 / 3 / 149 files, **no file added or removed**, `project.pbxproj` unchanged in `git status` |
| `apps/mobile/Capture/scripts/capture-gate.sh all` | **pass** — `✔ build` · `✔ tests` · `✔ lint` · `✔ fc-r3 sweep (inbox)` · `✔ fc-r3 sweep (ai)` · `✔ principle-4 sweep` (exit 0) |

`capture-gate.sh` must be run with the Bash sandbox disabled — inside it, `xcodebuild` cannot reach
`CoreSimulatorService` and dies with `permissionDenied` on package resolution (exit 74), which reads
like a project failure and is not one.

---

## Claim level

**Sim-verified**, per P-6. No device pass this session; the airplane-mode drain walk remains Kody's
post-ship step and is still unverified.

## Not done, deliberately

- `'internal'` in `TimeEntrySource` — W4's line item, out of this round's scope.
- No shared flow layout in `@patina/design-system` / PatinaDesignKit. One surface needs it; promoting
  it is a design-system decision, not a fix round's.
- No SQL, no migration, no seed, no generated types touched this round, so none of W6's DB gates
  were re-run.

## Files

- `packages/supabase/src/hooks/use-time-tracking.ts` — `field_manual` added to `TimeEntrySource`; doc comment corrected.
- `apps/mobile/Capture/Capture/Features/Time/LogTimeSheet.swift` — `LogTimeChips` wraps; new file-local `LogTimeChipFlow: Layout`.

Commit: `fix(time): the field chip row wraps, and the source union admits field_manual`
