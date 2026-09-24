# W0 dispatch — the iOS 27 program's first wave

Assembled 2026-09-23 by Fable from three agents: Astra's re-plan against the eight rulings, a W0
execution engineer, and a release engineer who traced the actual TestFlight path. Every claim
marked VERIFIED was checked first-hand against `main`.

**W0's purpose**: prove the gates are not decorative, publish the contracts, and clear the path
to a TestFlight archive. Nothing product-facing ships in W0.

---

## A. What the rulings changed

| Ruling | What it actually costs |
|---|---|
| **D1 → Field iOS 26** | Two edits (`generate_project.rb:17`, `Package.swift:27`) but a **silent tester eviction**: Field build 5 shipped `minOsVersion: 18.0`, so every existing tester on pre-26 hardware loses the app from TestFlight without being told. Astra also warns the compatibility saving is smaller than assumed — Field's source carries only four iOS 16.1 guards, already redundant. The real saving is avoiding a future dual speech implementation. |
| **D5 → enable all three** | **The flag inventory was incomplete, including mine.** Beyond `FeatureFlags.swift:69–71`, two more live PostHog reads exist: `OnboardingFlowHost.swift:63` (`onboarding_walk_first`) and `AppCoordinator.swift:696` (`ios_screen_name_v2`). And Field's `CaptureFeatureFlags` is **not** the pure consent seam an earlier reviewer called it — its own header says "the one named place a feature reads a remote flag from." Deleting it must mean *explicit consent semantics*, never "always record." |
| **D7 → allow pricing** | `ExtractionRow`, its strict-key validator and the prompt all change; per-row confirmation becomes load-bearing rather than a backstop. Needs a money-field gold set. |
| **D6 → Companion conversation** | A new reachable conversational surface. Astra's constraint: reuse the existing `CompanionViewModel`/`CompanionService`/history storage — do not commission a second chat backend. Lives in W4b. |

---

## B. BLOCKED ON KODY — nothing in W0 finishes without these

Ordered by what unblocks the most.

1. **The `asc` CLI is dead on this machine.** VERIFIED: `~/.blitz/bin/ascd` is `Mach-O 64-bit
   executable x86_64`, `uname -m` is `arm64`, and `/Library/Apple/usr/share/rosetta` does not
   exist. Every ASC step in every runbook goes through it.
   → `softwareupdate --install-rosetta` (needs your admin password), or an arm64 Blitz.
   Fallback that needs no Blitz: `destination: upload` in ExportOptions.plist lets
   `xcodebuild -exportArchive` upload directly — but it cannot read build lists or assign groups.

2. **The two `gh` commands nobody has ever run.** The sandbox proxy refuses `api.github.com`.
   ```
   gh run list --workflow=policy-quality.yml --limit 50 --json conclusion,headBranch,createdAt
   gh api repos/:owner/:repo/branches/main/protection
   ```
   These settle whether the iOS gates have *ever* executed. Everything in §C-2 is built on the answer.

3. **Confirm the signing identity resolves.** In your own terminal:
   `security find-identity -v -p codesigning`. Inside the sandbox it returns **0 valid
   identities** while the distribution certificate is visibly present — almost certainly Seatbelt
   denying private-key access, but the release path should not rest on "almost certainly."

4. **Push Notifications capability on the `cloud.patina.field` App ID.** The release engineer
   decoded both Field profiles and found **no `aps-environment`** on either; `cloud.patina.app`
   carries it. D2's whole rail depends on this. (I could not independently re-decode the
   profiles from the sandbox — worth confirming when you're in the portal.) Needs the portal, or
   an **Admin-role** ASC key with `-allowProvisioningUpdates` — and whether `BlitzKey` (94TGH56RTB)
   holds Admin is itself unknown.

5. **Build numbers.** VERIFIED: `generate_project.rb:87` sets `CURRENT_PROJECT_VERSION = '6'` and
   ASC already holds Field 0.1(6) — an archive today is a **duplicate and gets refused**. Patina's
   `Version.xcconfig` says 4; whether 4 reached ASC is not determinable from the repo.

6. **Export compliance for Field.** VERIFIED: Field's `Info.plist` has **no**
   `ITSAppUsesNonExemptEncryption`; Patina's has it at `:5`. That is why Field re-prompts on every
   upload. Bake the key in — but the value is your legal declaration, not an engineering fact.

7. **Simulator runtimes after the Xcode 27 upgrade.** `simctl` is refused in the sandbox.
   `capture-gate.sh:7` hardcodes `iPhone 17` **by name**. If Xcode 27's device set moved on, both
   gates fail at destination resolution before compiling anything.

8. **Commercial review of `direct-orders`** before any *external* tester sees it. Internal
   TestFlight groups skip Beta App Review; `MiddleWest Client` and `MiddleWest Studio` do not, and
   the beta notes on file describe a build with direct-orders OFF.

9. **The 37 worktrees.** Two await your ruling (`agent-people-build` needs `--force`,
   `.codex/worktrees/agent-client-material`). 3.5 GB + 1.1 GB + 2.5 GB behind them.

10. **The crew census** — now a casualty count rather than an input, since D1 is ruled.

---

## C. The W0 ticket set

### C-1. Can start immediately (no Kody dependency)

| ID | Ticket | Owner | Size | Tier |
|---|---|---|---|---|
| W0-04 | `ios-gate.sh`: `sim_destination()` returns a status instead of `exit`-ing inside `$( )`. The bug is **tier-dependent** — `unit` is the last element of its `&&` list so it propagates; `all` is not, so it sails on with an empty `-destination`. | T1 Integrator | S | Opus |
| W0-05 | `capture-gate.sh` `lint()` must **fail** when swiftlint is absent (`:31–33` returns 0 today); pin the version. | T1 Field Foundations | S | Sonnet |
| W0-06 | Select the Capture simulator **by UDID**, refuse to guess; add per-lane `-derivedDataPath`. | T1 Field Foundations | S | Sonnet |
| W0-07 | `bootstrap-worktree.sh` restores the gitignored `Secrets.swift` before any generate or build. | T1 Field Foundations | S | Sonnet |
| W0-08 | `core.mjs:365–370`: widen the iOS trigger so a **PatinaDesignKit-only** PR still runs both gates. | T1 Integrator | S | Sonnet |
| W0-09 | `.gitattributes` with `-merge -diff` on the Capture pbxproj. None exists today. | T1 Integrator | XS | Haiku |
| W0-10 | Close the `ALL_SCREENS` drift (**75 vs 79**; `PR1/PR2/PR3` undocumented) and add the parity test that would have caught it. | Navigation Registrar | S | Sonnet |
| W0-12 | Converge three `supabase-swift` pins to one **exact** version; fix Patina's `minimumVersion` typo. | T1 Field Foundations | M | Opus |
| W0-13 | `Gemfile.lock` pinning the Ruby toolchain `generate_project.rb` depends on. | T1 Field Foundations | M | Sonnet |
| W0-15 | **D1**: raise Field's floor to iOS 26 (`generate_project.rb:17`, `Package.swift:27` + its now-false comment). | T1 Field Foundations | M | Opus |
| W0-19 | Give **Patina** a TestFlight export+upload path. Verified asymmetry: Field has `archive-testflight.sh`; Patina has nothing. | T1 Integrator | M | Opus |
| W0-16 | T6 publishes both upstream contracts — the extractor image branch **corrected for D7** (maker/SKU/price/currency + per-row confirmation), and `source_document` registration, the step the plan missed. | T6 | M | Opus |
| W0-17 | T5 publishes the D3 lexicon as a machine-checkable old→new string table. | T5 | M | Sonnet |

### C-2. Blocked until §B clears

`W0-01` (the gh commands) · `W0-02` (runner image — needs the answer from 01) · `W0-03` (CI
simulator provisioning) · `W0-11` (build the FIELD-UI tier — `all` never runs `CaptureUITests`
today) · `W0-14` (**the red-gate demonstration**, the only proof any of this is real) ·
`W0-18` (device matrix + corpus) · `W0-20` (worktree sweep) · `W0-21` (two concurrent Field lanes).

Plus Astra's contract tickets that need rulings already given but data not yet in hand:
assignment-push audience resolution, the shared-direction projection (X-06), the complete flag
inventory, and the Companion conversation's security prerequisites.

---

## D. The honest route to TestFlight

The path is **not** missing — it worked twice on the old toolchain. Four things went stale.

1. Clear §B-1 (asc) and §B-5 (build numbers). Bump both past the true high-water mark.
2. **Prove the archive on Xcode 27 with no product change.** Neither app has been archived on
   this toolchain. This is the single highest-value early experiment: it either works, or it
   surfaces a Swift 6.4 / iOS 27 SDK problem before 161 lane-days are spent on top of it.
3. Bake Field's export-compliance key (§B-6).
4. Then W0's gate work, then W1's freeze.

An **interim TestFlight build is worth cutting right after step 2** — before any product change —
so the toolchain move is proven independently of the program.
