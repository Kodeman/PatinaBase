# iOS 27 program — delivery plan
### Seven teams, six waves, phases 0–5, no feature flags

Prepared 2026-09-23 by Fable, reconciling four independent drafts: Astra's team
decomposition, an Opus dependency map (`research/10-dependency-map.md`), an Opus collision-risk
analysis (`research/11-collision-risk.md`) and an Opus work inventory of 72 items
(`research/12-work-inventory.md`). Source of the work itself:
`artifacts/ios27-opportunities-2026-09-23/deck/index.html`.

Every claim below is either verified first-hand against `main` = `2a51ab9f7`, or labelled
**[inference]**. Nothing here is a claim that a build, a deployment or a device gate has passed.

---

## 0. The standing decisions this plan is built on

Kody, 2026-09-23, verbatim: *"do not gate flag anything these apps are not released yet, lets
make the big changes and get it right before we go to releasing the applications beyond
TestFlight"*, and *"I will update to xcode 27 before we begin the development."*

1. **No feature flags. None. Anywhere.** Not for new work, and not left standing on old work.
   Existing rollout flags and their alternate navigation roots are **deleted**, not flipped to
   true. What stays: permission checks, consent, authorization, `@available` capability checks
   and test dependency injection. Those are not rollout flags.
2. **Take the breaking change now.** Renames, schema rewrites, target-structure changes and
   toolchain moves are cheaper today than they will ever be again. Where the incremental path
   and the correct end state diverge, this plan specifies the correct end state.
3. **Pre-release is not permission to destroy tester data.** Both apps have TestFlight
   installs carrying unsynced captures, photos and hours. Every schema change ships a real
   versioned migration. "Delete the store" is not a migration.
4. **Scope is the iOS applications** — plus the minimum upstream work they cannot proceed
   without, isolated into one team (T6) and estimated separately.

Removing the flags is itself a product decision in four places. See §7, D5.

---

## 1. What changed since the deck

Three findings landed after the deck was committed. Two of them invalidate statements in it.

### 1.1 The FF&E extractor is PDF-only and refuses pricing **by design** — verified

`supabase/functions/project-ffe-document-extract/lib.ts` asserts `application/pdf` three times,
including a runtime rejection gate at `:54`. `ExtractionRow` (`:19–26`) is exactly
`pageNumber, provenance{page,confidence}, name, quantity, roomName, category`. There is no
maker, SKU, price or currency field, and the prompt at `:73` reads *"Never infer approval,
authority, pricing, trade cost, markup, or a client verdict."*

Consequences, now folded into the plan and corrected in the deck in place:
- The deck's success criterion "≥95% on SKU and price, ≥90% on maker" was **unmeasurable**.
  The measurable criterion is row recall plus room and category accuracy.
- "Field's camera posting a tag photo to the same extractor" **cannot work**. An image branch
  is a server ticket (X-block), not a client one.
- Extracting price at all needs a **ruling from Kody**, because refusing it was deliberate.

### 1.2 APNs addresses exactly one bundle, and it is not Field — verified

`apns-send/index.ts:229` reads one global `APNS_TOPIC`; per-token selection covers environment
only (`:252`, `:261`). `public.device_push_tokens` (migration `00335`) has
`user_id, token, platform, environment` — **no bundle column**. Patina is `cloud.patina.app`
(`Patina.xcodeproj/project.pbxproj:695`); Field is `cloud.patina.field`
(`Capture.xcodeproj/project.pbxproj:1964`).

The Field rail is therefore three ordered changes, only the last of which is iOS:
migration → `apns-send` topic-per-token → Field entitlement and registration. **The order is
strict**: a Field build that registers before the server can route writes tokens the rail
silently drops. The existing APNs auth key covers both bundles — Apple keys are team-scoped.

**Topic-per-token is necessary but not sufficient** — found by Astra, verified. `apns-send`
selects *every* token for a user (`:259–263`), then builds **one** payload with **one**
client-oriented badge (`:280–287`) and loops it over all of them. For a user signed into both
apps, routing by token topic alone delivers client events to Field and Field notices to Patina.
The event itself needs an intended audience, and the payload needs a per-app policy. X-04 is a
contract change, not a column.

### 1.3 The iOS CI gates are probably providing no coverage — **[inference, and my first mechanism was wrong]**

I originally argued this from the runner image and an `exit 2` guard. An independent reviewer
demolished every mechanism in that argument, and I verified the rebuttal myself. The conclusion
appears to survive; the reasoning is replaced.

**What I got wrong, verified by reproduction:**
- `ios-gate.sh:57–64`'s `exit 2` **does not stop the script**. `sim_destination()` is invoked
  only as a command substitution (`:75  dest="$(sim_destination)"`), so `exit` kills the
  subshell. And `:199  all) cmd_build && cmd_test PatinaTests && cmd_lint_delta` puts it in a
  `&&` list. I reproduced the exact structure in bash: `build / ERR unset / test dest=[] /
  lint / EXIT=0`. A missing UDID produces `xcodebuild -destination ""`, whose behaviour
  **nobody in this program has observed**.
- `cmd_build` runs *first*, so nothing "exits before trying".
- **"(advisory)" is only a job name.** There is no `continue-on-error` anywhere in
  `policy-quality.yml:91–107`; a failing gate is visibly red. My sentence "nothing goes red and
  no one would have noticed" was false.

**The likelier mechanisms, each verified:**
1. The jobs are usually **skipped**, not green: `if: needs.plan.outputs.ios_* == 'true'`, and
   `scripts/hooks/core.mjs:365–370` sets that only for paths under the two app directories —
   so a PatinaDesignKit-only PR, which changes both apps' rendering, triggers no iOS gate.
2. **Capture cannot compile on CI at all.** `Capture/App/Configuration/Secrets.swift` is
   gitignored (`.gitignore:2`) and `AppConfiguration.swift:21` references `Secrets.supabaseAnonKey`
   as a compile-time symbol. `generate_project.rb` globs `**/*.swift` from disk, so a fresh
   checkout regenerates a project without it. `policy-quality.yml:106` is a bare checkout with
   no bootstrap. It builds locally only because the file exists locally.
3. **The Capture lint tier is a false green**: `capture-gate.sh:27–34` prints
   "… swiftlint not installed; skipping" and returns 0. Neither CI job installs swiftlint.
4. `cmd_lint_delta` runs `git merge-base HEAD main`, but the iOS jobs use bare
   `actions/checkout@v4` (depth 1) while `policy` and `plan` pass `fetch-depth: 0`. With no
   `main` ref, `all`'s third tier silently degrades to a non-strict full lint.

**Two commands settle this outright and are W0's first action, before any script edit:**
`gh run list --workflow=policy-quality.yml --limit 50 --json conclusion,headBranch` and
`gh api repos/:owner/:repo/branches/main/protection`. The sandbox's TLS-intercepting proxy
refuses `api.github.com`, so neither I nor the reviewers could run them. **Nobody has.**

This stays in W0 and the reasoning is unchanged: the plan's safety story is "a green gate is the
acceptance evidence", and that sentence is worthless until someone has watched a gate go red.

---

## 2. The structural fact that shapes the team boundaries

**The two apps have opposite project-file physics.**

| | Patina (client) | Patina Field (Capture) |
|---|---|---|
| `project.pbxproj` | 974 lines, 7 × `PBXFileSystemSynchronizedRootGroup` | 2,372 lines, every file enumerated |
| Adding a `.swift` file | touches **nothing** | rewrites the pbxproj |
| Authored by | Xcode, by hand, rarely | `generate_project.rb`, on **every gate run** |
| Concurrency | **wide** | **narrow** |

`generate_project.rb:20` does `FileUtils.rm_rf(PROJECT_PATH)` and rebuilds all five targets;
`project.pbxproj` is tracked in git; UUIDs are content-derived via a two-pass
`predictabilize_uuids`. Two Field branches that each add files produce two independently-hashed
renderings — git will sometimes conflict unresolvably and sometimes **merge cleanly into a file
that is internally inconsistent**. With no flags, a bad merge ships.

So: **Patina lanes run wide; Field lanes are rationed.** Do not serialise the client app out of
caution — its synced-group project is genuinely immune to the conflicts that will dominate Field.

**The cap is a number: 2 concurrent compiling Field lanes, 2 Patina.** The collision analysis
calls this the single best guard in its list and my first draft carried only the qualitative
half. Stated plainly because it binds the waves: counting anyone who must run a Field gate,
W1a wants 3 Field lanes, W2 wants 3 and W3 wants 4. Every one of those is over the cap, which
is why W3 is split below and why W1a and W2 queue rather than fan out. Measured pressure behind
it: `Patina/.build` 3.5 GB, `Capture/.build` 1.1 GB, `.git` 2.5 GB, 38 registered worktrees.
`capture-gate.sh` passes no `-derivedDataPath` (contrast `ios-gate.sh:41`), so Field lanes share
a module cache until W0 fixes it.

---

## 3. The teams

Seven teams. Each owns files, not features — ownership is the concurrency mechanism, and the
"one writer" column of `research/11-collision-risk.md` is the authoritative path manifest.

| | Team | Apps | Model | Owns |
|---|---|---|---|---|
| **T1** | Mobile Platform & Integration | Shared | Opus | The build graph. Sole author of `generate_project.rb`, both `.xcodeproj`, gate scripts, entitlements, Info.plists, `PatinaDesignKit/Package.swift`, `policy-quality.yml`, build numbers, archives. |
| **T2** | Field Access & System Entry | Field | Opus | Field's reachable shell, session routing, notifications, widgets/intents, the composition root. **Holds the Navigation Registrar role** (below). |
| **T3** | Capture Evidence & Handoff | Field | Opus | The capture aggregate: domain, persistence, recognition, sync, the extractor caller, the on-device category adapter. Sole author of Field's SwiftData schemas. |
| **T4** | Client Direction & Simplification | Patina | Opus | The homeowner app end to end, minus build metadata and UI suites. Sole author of Patina's SwiftData schemas. |
| **T5** | Language & Accessible Presentation | Shared | Sonnet (Haiku for approved mechanical batches) | The canonical lexicon, PatinaDesignKit sources, Field's design tokens, copy audits and contrast fixes. |
| **T6** | Document & Delivery Contracts | **Non-iOS** | Opus | The X-block: the extractor's image branch and portal review front door, the APNs topic migration, reserved migrations, the extraction hook. **Estimated separately from the iOS program.** |
| **T7** | Independent Acceptance & Release Assurance | Shared | Opus (Sonnet for the device matrix) | UI suites, the evaluation corpus, acceptance and evaluation gate scripts, release evidence. **Never repairs what it judges.** |

### Three named roles inside the teams

Ownership of these is a person, not a team, for the program's duration:

- **Navigation Registrar** (inside T2) — the only writer of `CaptureScreenID.swift` (79 cases),
  `CaptureDeepLink.swift`, `RouteRegistry.swift`, `CaptureNavigation.swift` and
  `capture-shots.sh`'s `ALL_SCREENS`. Two exhaustive switches with no `default` bind these five
  files in lockstep; any team needing a screen reachable files a request here.
- **Field Foundations** (inside T1) — the only writer of `generate_project.rb`,
  `capture-gate.sh`, `FieldCopyAudit.swift` and the three `Package.resolved`.
- **Integrator** (inside T1) — the only one who resolves a pbxproj conflict (always by
  regeneration, never by hand), touches `check-ios-tokens.sh`'s baselines, bumps the CI runner,
  or archives to TestFlight.

---

## 4. The waves

Six waves. **W1 is where this plan departs from both drafts** — see §4.2.

### W0 — Prove the gates, publish the contracts *(T1, T5, T6, T7)*

Nothing else opens until the verification story is real.

- **T1**: install Xcode 27 (Kody), re-validate both gate scripts on Swift 6.4, fix the CI
  runner image and add an explicit Xcode selection step, export `IOS_GATE_UDID` in CI, and
  **demonstrate a deliberately-failing test going red on CI** — the only proof the gate works.
- **T1**: create `.gitattributes` (none exists today) with
  `apps/mobile/Capture/Capture.xcodeproj/project.pbxproj -merge -diff`, so a pbxproj clash
  always conflicts loudly instead of merging into a corrupt union.
- **T1**: per-lane simulator UDIDs and per-lane `-derivedDataPath` for Capture; a worktree
  bootstrap that restores the gitignored `Secrets.swift`; a `Gemfile.lock` for the Ruby
  toolchain; converge the three divergent `supabase-swift` pins onto one exact version and
  **track Field's `Package.resolved`**, which is gitignored today.
- **T6**: publish the exact mobile-facing contracts for the extractor image branch and the
  app-aware push rail, and **restore the step §1.1 missed** — registering the upload as a
  `source_document` asset. `project-ffe-document-extract` requires it, `00455` grants that
  registration to `service_role` only, and the sole edge caller registers `board_reference`
  instead. An image-capable extractor alone does not give the camera a path.
  Reserve migrations by **coordinating with the `build/studio-hook-2026-09-22` branch**, which
  shipped 00658 and 00659 concurrently. (My earlier line said to reserve "not against an assumed
  00659" — wrong, the tip *is* 00659; the real hazard is the concurrent branch.)
- **T5**: publish the canonical lexicon for ruling (§7, D3).
- **T7**: the acceptance and evaluation gate wrappers, the device matrix, and the labelled
  category corpus plan.

- **T1**: fix `sim_destination()` to return a status the caller checks rather than `exit`-ing
  inside `$( )`; make `capture-gate.sh`'s `lint()` **fail** when swiftlint is absent, and pin
  the version; add `fetch-depth: 0` to both iOS jobs; add a CI bootstrap that provides
  `Secrets.swift`; widen `core.mjs:365–370` so a PatinaDesignKit-only change triggers both gates.
- **T1 / Navigation Registrar**: add a `CaptureTests` assertion that `ALL_SCREENS` ∪ documented
  exclusions == `CaptureScreenID.allCases`, and close the three People-room entries. **Verified
  drift, already live**: the array holds 75 entries against 79 cases; `V4` is documented, but
  `PR1`, `PR2` and `PR3` are undocumented and nobody noticed. That is the registrar's own
  failure mode, already realised.
- **T1 / Field Foundations**: build a `FIELD-UI` tier. `capture-gate.sh:156`'s `all` never
  invokes `CaptureUITests` — `test_()` runs the `CaptureKit` scheme only — so the tier three
  W1a items depend on **does not exist today**.
- **T1**: fix the SPM requirement, not the lockfile. Patina's is `minimumVersion = 2.5.1` — a
  typo for 2.5.1 vs 2.51.0 — which is *why* it resolved to 2.40.0 while Field sat at 2.55.1.
  Change both to `exactVersion` in one commit. Note that un-ignoring Field's `Package.resolved`
  is not executable as I first wrote it: `.gitignore:18` ignores the whole `project.xcworkspace/`
  and the generator `rm -rf`s the `.xcodeproj` on every run.

**Exit — one row per mechanism, each with a run URL, not a narrative:**

| # | Mechanism | Proof |
|---|---|---|
| 1 | The gates are reached at all | `gh run list` output and branch-protection JSON, read |
| 2 | Xcode 27 selected explicitly | an `xcode-select` step, in the run log |
| 3 | A simulator exists | `simctl create`/`boot` step, UDID exported |
| 4 | Capture compiles on CI | `Secrets.swift` bootstrapped; green build |
| 5 | Lint is real | a deliberate violation goes red in **both** apps |
| 6 | Tests are real | a deliberately-failing `@Test` goes red in `PatinaTests` **and** `CaptureTests` |
| 7 | Green means green | the deliberate failures reverted, same jobs pass |
| 8 | Concurrency | two Field lanes run gates simultaneously without colliding |
| 9 | Contracts | lexicon and both upstream contracts signed off |

Cost note: macOS runner minutes bill at 10×, and neither job caches SPM or DerivedData.

### W1 — The Field freeze *(ONE Field lane. T3 drives.)*

**This is where the plan departed from both drafts, and where both reviewers attacked it. The
argument survives; the staffing and the scope did not.**

The argument, unchanged: the Field rename is not a codemod. `Specimen` is a SwiftData `@Model`
with a frozen schema and no `VersionedSchema`, so renaming it **is** the schema change. The
provenance repair is the same edit to the same models. Those three cannot be done separately,
and doing them separately means two store breaks instead of one.

**Three corrections I accepted:**

1. **It is one lane, not two teams.** I wrote "*T3 + T5 exclusive on Field*", which violates the
   very exclusivity it was meant to honour. W1 is **one branch**: T3 drives; T5 supplies the
   ruled strings as patch requests; T2 (navigation files) and T1 (generated project) participate
   at the integration barrier, because the rename reaches files they own exclusively and a wave
   cannot have an exit condition that depends on edits its staffing forbids.
2. **Flag deletion is not in this wave.** I put "every rollout flag and alternate root is
   deleted" in a Field-exclusive wave; it is almost entirely **Patina** work, it belongs to T4,
   and it is not in the 72-item inventory at all. It becomes its own sized item on T4's track.
   Read literally it would also have deleted Field's `CaptureFeatureFlags`, whose header states
   its purpose is recording **consent** — which §0 preserves. See D5.
3. **The rename is unsized, and both source analyses recommended against taking it.** The
   inventory's only rename item (P1-02, `M`) scopes the *opposite* way — "only copy, the
   1,000-odd internal identifiers stay" — and the dependency map says "take the 7 now and
   schedule the 1,849 deliberately, **or not at all**." I converted that "maybe" into the
   program's second wave and inherited no estimate for it.

   **I still recommend taking it**, on Kody's instruction to make the big changes now: a
   persisted-store rename only gets more expensive, and every TestFlight build between now and
   deferring it adds another store shape to migrate. But it is recorded here as a **deliberate
   overrule of both analyses**, sized honestly — a 97-file, 1,856-occurrence Swift rename with a
   SwiftData entity migration and a fixture sweep is an **L at minimum, on one lane, on pure
   critical path**. It is D8, because it is the largest unsized thing in the program.

**Before the codemod runs**: T7 captures immutable pre-rename store fixtures from real installed
builds. The existing `CaptureStoreMigrationTests.swift:32–37` is **not** the safety net it
appears to be — it builds `previousSchema` from the *current* `Specimen` and child types, so
renaming updates both sides of the test and it proves nothing about a historical entity.

Meanwhile **T4 runs the whole Patina side**, including the flag deletion — its project file
makes file-level conflicts impossible and there is no reason to idle it.

**Exit**: a representative *shipped* store migrates with captures, photo relationships, local
media, owner stamps, idempotency keys and every unsynced outbox item intact, with no reset path;
accepting an unchanged guess no longer records it as designer-typed, and the full provenance
contract round-trips to the wire; both apps use the ruled names.

### W1a — Field repair *(T2 + T3 compiling; T5 patches in — 2 Field lanes)*

The remaining Phase 0 items, now safe to parallelise: wire `onSetHardwareEntry` and derive
`hardwareEntry` from the device, reach Settings/Account/QR-approve/photo-import in a **Release**
build (through the Navigation Registrar — and without loosening `verificationHarnessAllowed`,
which would ship the 79-screen debug harness to TestFlight), supply the OCR and scanned-code
observations `SmartGuessSheet` currently discards, and the two measured dark-mode contrast
failures.

### W2 — The three value paths, in parallel *(T2 + T3 compiling on Field; T4 wide on Patina; T6 non-iOS; T7 queues behind the cap)*

Phase 2 upstream review + Phase 3 reachability + Phase 4 client offline direction.
T6's push contract must be deployed and compatible **before** any Field build that registers a
token is distributed. **X-04 is a production mutation against a live rail** — `apns-send` serves
the client app's push today, and it is written to "skip cleanly (never error the SQL caller)"
when config is missing, so a misconfiguration is *silent by design*. It gets its own gate: a
revert migration written before the forward one, a named authorization step (CLAUDE.md requires
an explicit request in-session for prod mutations), and a prod read-back proving existing client
tokens still resolve to `cloud.patina.app` after the backfill. There is no flag to hide behind
— that is the point, and it is why this one needs a revert instead. `Info.plist` and `Capture.entitlements` are written by the Phase 3 owner
and then handed to Phase 5 — serialised, because a bad merge there is a silent runtime no-op.

### W3 — Camera-to-Document *(T2, T3, T6, T7 — 2 Field lanes)*

Field's camera handoff, which **cannot start** until T6's image branch and the
`source_document` registration path land (see below). `SpeechTranscriber` replacing
`SFSpeechRecognizer` is the second lane — an `L`, 780+ lines, deleting the rotate-the-recognizer
machinery.

**Split out of this wave**, because it needed 4 Field lanes against a cap of 2, and because its
own chain is strictly serial:

### W3b — The Live Activity chain *(one Field lane, T1 + T2)*

`NSSupportsLiveActivities` and a proven request/payload **first** — Field requests no Live
Activity today, so there is nothing to render until this exists — then the extension target,
then the renderer, then the control and intent entry. T1 copies the shape `PatinaWidget`
already proves: link PatinaDesignKit with **no** embed phase, host carries both embed phases.
P5-02 rewrites `generate_project.rb`'s target graph, so **nothing else Field-side may
regenerate while it runs**. Roughly 20 lane-days on one lane.

### W4 — The category experiment, measured *(T3, T7)*

The narrow on-device tag reader, evaluated by T7 against a frozen held-out corpus and the
*repaired* Vision/OCR baseline. **It ships or it is deleted** — there is no flag to hide it
behind, which is the point. It must not hold W2's completed work hostage.

### W5 — Qualify the builds *(T1, T7)*

Both Release archives through full simulator and physical-device acceptance; migrations proven
against real installed builds; every prior finding with a recorded disposition. Distribution
needs separate authorization; broader App Store release stays a separate decision.

---

## 5. The critical path

The longest chain is the reviewed extraction handoff, and **most of it is not iOS**:

> T6 extractor image branch + staging contract → portal review front door → paired accuracy/time
> validation → T3's versioned evidence and outbox model → camera upload and idempotent staging →
> physical-device arrival proof → integrated TestFlight candidate.

A second chain blocks independently: Xcode 27 and a working CI → W1's Field freeze → category
evaluation on eligible physical hardware → adapter integration.

Client offline direction (T4) and Field reachability (T2) sit on **neither** chain. They should
finish early and must not be made to wait on the category experiment.

**But T4 has a prerequisite of its own**, found by Astra and verified: there is no ruled
"shared direction" projection to cache. `DecisionsAPIClient+ProjectApprovals.swift` exposes
frozen document-approval editions with authority and artifact checks — not a general direction
record. Naming the record, its revision, its attachments, reader authority, freshness and
revocation semantics is a **contract that must exist before T4 writes a schema**, and it pairs
with D4. T4's independently-ruled work (naming, flag deletion) proceeds meanwhile.

---

## 6. What this plan refuses

Carried from the red team and Astra's challenge, recorded so no one re-proposes them:

- Feature flags, kill switches, percentage rollouts, dormant production experiments and
  duplicate legacy/new roots — replaced by merge gates and successive whole-build candidates.
- A blind repository-wide `Specimen` replacement across DB schemas, analytics and already-
  distributed links. Rename the app domain; preserve or explicitly migrate external contracts.
- A native Document editor, offline copies of all six studio rails, or queued offline
  approvals, signatures or payments. Scope is the shared direction and the next decision.
- A full-field generated furnishing draft or automatic acceptance of commercial values.
  `@Generable` constrains structure, not correctness — measured value accuracy is 0.69–0.83.
- Treating a failed PDF benchmark as proof that on-device category classification must fail.
  Different inputs, different task; evaluate it independently.
- `LockedCameraCapture`, a share extension, PCC provider switching, cross-app Spotlight
  retrieval and library RAG. Empty extension directories are not a requirement to fill them.
- Moving `ProvenanceBadge` into PatinaDesignKit — VISION refuses badges by name.

---

## 7. Open decisions — Kody's, and what each one blocks

| | Decision | Blocks | Recommendation |
|---|---|---|---|
| **D1** | **The house census** — which phones Leah's crew and trades actually carry, with OS versions and Action Button presence. | Any floor change, the final device acceptance matrix, and every Apple-Intelligence item. Does **not** block ordinary implementation. | Keep Field at iOS 18 and Patina at iOS 26; use tested `@available` fallbacks rather than an exclusionary cut. Neither an iOS 26 nor an iOS 27 Field floor removes the need for a fallback. |
| **D2** | **One real missed instruction** — Kody and Leah name an actual case, its recipient and its wording. | The notification producer and any real send. Registration, settings and routing can be built first. | One human-approved assigned-request notice, with no sensitive content on the lock screen. |
| **D3** | **The lexicon** — `Piece` vs `CapturedPiece`, `Studio` reserved for the firm, `Projects` for the homeowner's tab. | W1, the whole freeze. Nothing Field-side proceeds without it. | Take Astra's recommendation as written; it is the one that keeps `Studio` meaning one thing. |
| **D4** | **Offline visibility policy** for a shared direction. | **T4's cache schema itself**, not just final acceptance — it determines cache identity, retention, revocation and supersession. Corrected after challenge. | Visible last-fetched time, read-only access to the last authorized revision, purge on revocation or account change, and a mandatory online revision check before any consequential action. **No offline approvals** — not negotiable. |
| **D5** | **Disposition of the three Patina rollout flags** — `house-first`, `direct-orders`, `house-widget`. | T4's flag-deletion item. | Keep the house-first root; enable the widget only after its acceptance gate; keep Save/Ask rather than silently enabling direct purchasing. Deleting a flag must not become tacit approval of a new commercial policy. **Corrected**: `FeatureFlags.swift:69–71` holds exactly three. I previously named a fourth, "onboarding walk" — that is `FirstLaunchTour`, a tour with pending state, not a flag. Field's `CaptureFeatureFlags` is a fail-closed **consent** seam and is explicitly *not* in scope. |
| **D8** | **Take the full 1,856-occurrence `Specimen` rename, or only the 7 user-visible strings?** | W1's size, and therefore the whole schedule. | Take it — your instruction to make the big changes now, and a persisted-store rename only gets dearer. But both source analyses recommended against, and it is an `L` on pure critical path. This is the one place the plan overrules its own research, so it should be your call and not mine. |
| **D6** | **Client voice** — narrow dictation into the existing composer, or a new Companion conversation. | Client voice UI and the permission copy. | Dictation only. Do not open a chatbot to justify an unused permission string. |
| **D7** | **Pricing** — may the extractor read trade cost and price at all? | Any commercial-field ambition in Phase 2. | Genuinely open. Someone wrote that prohibition deliberately; it should be overturned explicitly or not at all. |

Two more owed, unchanged from the deck: ask Leah what the studio would actually send to
someone on a roof, and `git push` commit `ec3f2f65a`.

---

## 8. Five pre-existing defects worth tickets regardless of this program

1. `OnboardingFlowView.swift:102` passes neither `onSetHardwareEntry` nor `hardwareEntry`, so
   Set-up is dead and **every** device is told to map an Action Button it may not have.
2. `SmartGuessSheet.swift:209` calls the guess service with empty OCR and scanned-code arrays.
3. Six Field screens are fully built and registered but have no navigation edge in Release;
   `RootView.swift:224` already writes a companion hint for a state the app cannot enter.
4. `companion-message` is pinned to `claude-sonnet-4-20250514`.
5. The catalogue has 1 visible product and 0 images, which ceilings every recommendation surface.

Plus the CI finding in §1.3, and 37 registered stale worktrees needing `scripts/repo-gc.sh`
before any lane opens.


---

## 9. What this plan is not: a schedule

Seven teams and six waves will read as seven-way throughput to anyone executing it. They
should not. From the inventory's own size key, where `L` explicitly means *one lane*:

- iOS work totals roughly **161 lane-days**, of which **~131 are Field-side**.
- The cap is **2 concurrent Field lanes**.
- That is **13–26 working weeks** before adding the W1 rename (D8, an `L` on pure critical
  path), the flag-deletion item, W0, W5, review rounds, or a single physical device pass.

The document contains no dates, and it should not acquire any until D3, D5 and D8 are ruled and
the W0 gate checklist has actually been run once. Six waves is a plausible *shape*. It is not
yet a supported schedule, and nobody should staff against it as though it were.

---

## 10. Record of what the challenge changed

Both reviewers were told to report every finding with confidence and severity, not to filter to
high severity. Both attacked the plan's own reasoning, and I verified every correction below
first-hand before accepting it.

**Things I had wrong, now fixed:**
1. **Every mechanism under §1.3.** `exit 2` inside `$( )` does not stop the script — I
   reproduced it. `cmd_build` runs first. "(advisory)" is only a job name; there is no
   `continue-on-error`. The conclusion survives on entirely different evidence.
2. **W1's staffing contradicted its own purpose** — two Field teams inside a wave defined by
   exclusivity. Now one lane.
3. **W1's flag-deletion exit was Patina work inside a Field-exclusive wave**, absent from the
   inventory, and read literally would have deleted a consent seam §0 preserves.
4. **Four Patina flags → three.** `FeatureFlags.swift:69–71`. "Onboarding walk" is not a flag.
5. **The migration-tip correction was itself wrong.** The tip *is* 00659.
6. **The lane cap existed in the research and not in my plan.** Now a number, and it forced
   the W3 split.
7. **Topic-per-token does not fix push routing on its own** — `apns-send` fans one payload
   with one badge across all of a user's tokens.
8. **`source_document` registration was missing from T6's remit**, without which the camera
   path has no route regardless of an image branch.
9. **The `CaptureStoreMigrationTests` safety net does not test what it appears to** — it builds
   `previousSchema` from current types.
10. **`ALL_SCREENS` has already silently drifted** — 75 entries against 79 cases, with `PR1`,
    `PR2` and `PR3` undocumented. The registrar's failure mode, already realised, unnoticed.
11. **The `FIELD-UI` tier does not exist.** `capture-gate.sh`'s `all` never invokes
    `CaptureUITests`.

**Things the reviewers agreed were right:** the two upstream contract gaps (§1.1, §1.2), which
the realism reviewer called "the most valuable work in the package"; §2's project-file physics;
and the call not to serialise the client app, "a call a more timid plan would have got wrong."

**Still unverified, by anyone:** whether the iOS CI jobs have ever actually run. Two `gh`
commands settle it; the sandbox proxy refuses `api.github.com`. It is W0's first action.
