---
name: patina-ios-verification
description: Use when building, changing, or verifying either iOS app under apps/mobile — Patina (client) or Patina Field (Capture, designer/trades) — before claiming a camera, scan, RoomPlan/ARKit/LiDAR, sync, or upload feature works, when choosing Simulator vs a physical-device pass, or when field:// auth or device uploads misbehave. Symptoms: a claim resting on a green Simulator run alone, a scan/upload that never shows up server-side, or a device-automation call returning an empty UI tree.
---
# iOS Verification: Patina & Patina Field (apps/mobile)

Last verified: 2026-07-08 (main @ 593876c1, migrations head 00284). Re-verify load-bearing claims if the repo has moved.

## Use when / Don't use when

Use when:
- Building or changing Swift under `apps/mobile/Patina` (Patina, client app) or `apps/mobile/Capture` (Patina Field, designer/trades app)
- About to report that a camera, scan, RoomPlan/ARKit/LiDAR, photo-capture, or device-upload feature "works"
- Deciding whether a Simulator run is sufficient or a physical-device pass is required
- `field://auth/callback`, magic-link, Google OAuth sign-in, or a fresh signup misbehaves
- A scan/photo/upload looks done in the UI but needs its server-side arrival confirmed
- Running either app's local verification gate before a PR or a merge

Don't use when:
- App Store Connect submission, TestFlight, release, metadata, screenshots, IAP/subscriptions, or signing/provisioning — use the existing `asc-*` skills under `apps/mobile/Patina/.claude/skills/` (25 of them: `asc-release-flow`, `asc-testflight-orchestration`, `asc-xcode-build`, `asc-metadata-sync`, `asc-crash-triage`, `asc-signing-setup`, and more — scoped to that directory). This skill covers only build-and-verify discipline for code changes, not ASC mechanics. Note: `apps/mobile/Capture` (Patina Field) has no equivalent `.claude/skills/` directory at all — no scoped ASC skill library exists for it yet.
- Raw `xcodebuild`/archive/export/signing mechanics unrelated to verifying a feature — the `building-with-xcode` skill covers that; this skill assumes you can already invoke a build and focuses on what the result proves.
- Supabase schema/migration design backing an iOS feature — patina-db-migrations
- Verifying a web-portal-side effect of a mobile action — patina-verification
- Coordinating multiple agents/worktrees doing iOS work — patina-parallel-work

## Procedure

1. **Identify the app.** `Patina/` = **Patina**, client-only (`cloud.patina.app`): room capture, companion, style quiz, furniture discovery. `Capture/` = **Patina Field** (`cloud.patina.field`, scheme `field://`), designer/trades: specimen capture plus a Work surface (projects, leads, decisions, messages, receiving, pro site-scan). The on-disk directory is named `Capture`, not `Field` or `PatinaField` — don't search for a directory that doesn't exist.
2. **Read the app's own doc before writing Swift**: `apps/mobile/CLAUDE.md` (split overview), then `apps/mobile/Patina/CLAUDE.md` or `apps/mobile/Capture/README.md` for the app you're in.
3. **Regenerate Capture's project after adding/removing/renaming files.** Its `.xcodeproj` is generated, not hand-edited: `ruby scripts/generate_project.rb` (from `apps/mobile/Capture/`). `capture-run.sh` and `capture-gate.sh` do this automatically; a raw `xcodebuild` invocation does not. Patina needs no such step — its project uses `PBXFileSystemSynchronizedRootGroup`, so new files under `Patina/` are auto-added to the target.
4. **In a fresh worktree, copy the untracked secrets file in before building** — it does not follow `git worktree add`. Each app has its own gitignored `Secrets.swift` (never committed in this repo's history), templated from a committed `Secrets.example.swift` in the same directory (`.../App/Configuration/`).
5. **Run the app's local gate — there is no iOS CI, this script is the substitute:**
   - Patina: `apps/mobile/Patina/scripts/ios-gate.sh {build|unit|ui|lint|lint-delta [BASE]|all}`
   - Capture: `apps/mobile/Capture/scripts/capture-gate.sh {build|test|lint|all}`
   Both run against Simulator destinations only. Passing either proves compile-green, and for the test tiers, sim-verified. Neither proves device-verified.
6. **Treat Simulator as compile/UI-only for hardware surfaces.** Patina's own `CLAUDE.md` states it directly: "Run on-device for RoomPlan / ARKit / LiDAR. Simulator is useful for compile checks and non-AR UI only." Capture mirrors this at the app-config level: Simulator runs on mocks by default (`CaptureKitMocks`), a physical device runs real services by default (`AppConfiguration.runsRealServices`); `-CaptureForceReal` forces real services in the Simulator, `-CaptureUseMocks` forces mocks anywhere. None of these flags substitute for an on-device pass once the claim is about a physical sensor (camera/LiDAR/mic) — target is iOS 18+, optimized for iOS 26.5 on a LiDAR (Pro-line) iPhone.
7. **Drive the app via the blitz-iphone MCP tools with an explicit UDID, always.** Get the device/simulator UDID first (`list_devices` / `get_execution_context`), then pass it to every `scan_ui`/`describe_screen`/`device_action` call. Capture's own README documents the failure mode: with a physical iPhone connected alongside a booted Simulator, the default `udid: "booted"` is ambiguous and can return an empty UI tree.
8. **For auth/sign-in testing**: a fresh signup cannot sign in until the confirmation email is clicked — GoTrue returns `email_not_confirmed`, and Patina's `AuthService.swift` catches this specifically and routes to a "check your inbox" recovery panel rather than a generic error. Use a preconfirmed/admin-created account when your goal is to test something past sign-in, or you'll only ever exercise the recovery panel. Capture's Google OAuth redirect (`field://auth/callback`) must be on the redirect allow-list: locally it's in `supabase/config.toml` (`additional_redirect_urls`, ~line 102); in prod the allow-list lives in the Strata GoTrue dashboard — if OAuth sign-in dead-ends after the browser hop in a prod-pointed build, check that first rather than assuming a client bug.
9. **For scan/photo/upload claims, confirm server-side arrival — don't trust a UI "synced"/"done" state alone.** Patina's scan flow uploads to Supabase Storage then writes `room_scans`/`room_scan_images` rows via `RoomScanSyncService`; Capture's site-scan flow has an explicit confirm step through the `confirm-scan-bundle` edge function (`supabase/functions/confirm-scan-bundle`) — an object can land in Storage without ever being confirmed if that call doesn't fire, so check for the DB row, not just the Storage object. Some non-critical artifact uploads (e.g. thumbnail/hero-frame images in `RoomScanSyncService`) are also caught, logged, and NOT rethrown or surfaced to the UI — a scan can read as fully synced while a secondary artifact silently failed.
10. **If realtime/sync updates don't arrive, check the mechanism before assuming a client bug.** Two different mechanisms exist in this repo: table-publication `postgres_changes` (`SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';` — only `profiles`, added in migration 00183, is confirmed on it) and private broadcast channels authorized via RLS on `realtime.messages` (migration 00257, used by the projects service). Confirm which one the feature you're testing actually uses before diagnosing further.
11. **Don't trust dark-mode/Dynamic-Type visual claims from prior work without a fresh on-device walk.** A large dark-mode + Dynamic Type pass landed across ~620 colors (`949d48da`…`1d854e69`), but the on-device re-walk has been owed after more than one subsequent program (operator-verified 2026-07, not independently re-auditable from the repo alone) — treat "dark mode looks right" as unverified for any area you haven't personally walked on-device this session.
12. **Report every claim at its actual level**: compile-green < sim-verified < device-verified. A hardware-dependent feature (camera/scan/LiDAR/upload-from-device) only counts as done at device-verified.

## Commands

```bash
# Patina gate (no iOS CI — this is the substitute)
apps/mobile/Patina/scripts/ios-gate.sh build
apps/mobile/Patina/scripts/ios-gate.sh unit          # PatinaTests (Swift Testing)
apps/mobile/Patina/scripts/ios-gate.sh ui            # PatinaUITests (XCTest UI)
apps/mobile/Patina/scripts/ios-gate.sh lint-delta    # fails only on NEW warnings vs main
apps/mobile/Patina/scripts/ios-gate.sh all           # build + unit + lint-delta

# Capture (Patina Field) gate
apps/mobile/Capture/scripts/capture-gate.sh all      # build + test + lint
apps/mobile/Capture/scripts/capture-gate.sh build

# Regenerate Capture's project after adding/removing/renaming a .swift file
ruby apps/mobile/Capture/scripts/generate_project.rb

# Run Capture on a simulator, jump straight to one of the 51 screens
apps/mobile/Capture/scripts/capture-run.sh
apps/mobile/Capture/scripts/capture-run.sh C5.specimen-sheet
CAPTURE_SIM="iPhone 17 Pro" apps/mobile/Capture/scripts/capture-run.sh N3.measure

# Screenshot every Capture screen without MCP (pure simctl) -> .build/shots/
apps/mobile/Capture/scripts/capture-shots.sh

# Copy secrets into a fresh worktree (fill in values yourself; never commit them)
cp apps/mobile/Patina/Patina/App/Configuration/Secrets.example.swift \
   apps/mobile/Patina/Patina/App/Configuration/Secrets.swift
cp apps/mobile/Capture/Capture/App/Configuration/Secrets.example.swift \
   apps/mobile/Capture/Capture/App/Configuration/Secrets.swift

# Check realtime publication membership when sync doesn't arrive
# (run against the local/target Postgres, e.g. via `supabase db` or psql)
SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
```

## Quality bar

- Every hardware-dependent claim (camera/scan/RoomPlan/ARKit/LiDAR/device upload) is backed by a device-verified pass, not compile-green or sim-verified alone.
- Reports state the claim level explicitly per feature — never one blanket "it works" covering both UI polish and sensor behavior.
- Anything the UI reports as "synced" is cross-checked server-side (Storage object + DB row) before being called done.
- Device-automation calls always carry an explicit UDID; never rely on the default `"booted"` target.
- Capture's project is regenerated before any build claim that follows a file add/remove/rename.

## Verification checklist

- [ ] Identified the app (Patina vs Capture/Patina Field) and read its CLAUDE.md/README first
- [ ] If Capture + files added/removed/renamed: `generate_project.rb` run (or `capture-run.sh`/`capture-gate.sh` used, which do it automatically)
- [ ] `Secrets.swift` present in this worktree/checkout (copied from `Secrets.example.swift` if fresh)
- [ ] Ran the app's gate script and it passed; tier(s) run stated explicitly
- [ ] Hardware-dependent claims tested on a physical device, not just Simulator
- [ ] Device-automation calls used an explicit UDID, not default `"booted"`
- [ ] Scan/upload/sync claims checked server-side (Storage object, DB row, or publication query), not UI-only
- [ ] Auth testing used a preconfirmed account, or the confirmation-pending path was tested on purpose
- [ ] Final report states compile-green / sim-verified / device-verified per feature claimed

## Common mistakes

| Situation | Wrong move | Right move |
|---|---|---|
| Reporting a camera/scan/LiDAR feature "works" | Base it on a green Simulator run | Run it on a physical LiDAR iPhone before calling it done |
| Adding a new Swift file to Capture | Build directly with `xcodebuild` | `ruby scripts/generate_project.rb` first, or use `capture-run.sh`/`capture-gate.sh` |
| First iOS build in a fresh worktree | Build immediately | Copy `Secrets.swift` from `Secrets.example.swift` into the worktree first |
| Calling blitz-iphone tools with a physical device connected | Use default `udid: "booted"` | Call `get_execution_context`/list devices, pass the explicit UDID |
| Testing sign-in with a brand-new signup | Treat the "check your inbox" panel as a bug | Use a preconfirmed/admin-created account, or confirm the email first |
| A scan reads "synced" in the UI | Trust it and move on | Check the DB row and the Storage object; some artifact uploads fail silently |
| Sync/realtime not arriving | Assume the client subscription is broken | Check `pg_publication_tables`, and whether the feature uses broadcast channels (00257) instead |
| Citing a migration number from a README/comment | Trust the number in prose | List `supabase/migrations/` — numbers get renumbered and old docs go stale (Capture's own README still cites 00258 for the room_scans linkage; the actual file is 00265) |
| Need an ASC/TestFlight/signing task done for iOS | Improvise submission steps here | Use the scoped `asc-*` skills under `apps/mobile/Patina/.claude/skills/` (none exist yet for Capture) |

## Report back

For every feature claimed, state: (1) which app and files touched; (2) whether Capture's project was regenerated, if applicable; (3) the gate script and tier(s) run, pass/fail; (4) the claim level — compile-green / sim-verified / device-verified — per feature, and for device-verified, the device model/UDID used; (5) for scan/upload/sync claims, the server-side evidence checked (Storage path, DB row, or publication query), not a screenshot alone; (6) what was explicitly NOT verified and why (e.g. "no physical LiDAR device this session — sim-verified only, camera claim unverified").
