# The D3 lexicon — old → new, with the kind that decides how each row is executed

Companion to `lexicon.json`. W1 executes from the JSON; this file explains why each row
is the kind it is, and records what the survey found that the delivery plan did not.

**This ticket changed no Swift code.** The rename is W1's, in its own exclusive Field lane.

---

## 1. The ruling

- `Specimen` → **`Piece`**; the captured-in-the-field variant → **`CapturedPiece`**.
- **`Studio`** means the firm (the designer's business), never a room and never a physical space.
- **`Projects`** is the homeowner-facing tab name in the Patina client app.

## 2. The five kinds, and why the field exists

| kind | execution rule |
|---|---|
| `type` | Free. Rename the declaration and let the compiler find the references. |
| `symbol` | Free. Same, but at 1,856 occurrences it needs a compiler-aware rename, not `sed`. |
| `user-visible-string` | A human reads it before it ships. The compiler has no opinion about copy. |
| `analytics-event` | **Keep the string, rename the symbol.** The name is a dashboard's primary key. |
| `persisted-key` | **Keep the string, rename the symbol** — or pay for a migration. A rename silently discards history that is already on phones and in Strata. |

40 rows: 14 `type`, 9 `symbol`, 10 `user-visible-string`, 2 `analytics-event`, 5 `persisted-key`.
36 are W1's; 4 are recorded for other owners. 9 carry `needsRuling: true`.

## 3. The count — 1,856 is right, and it is Swift only

The plan's figure reproduces exactly.

| measure | count |
|---|---|
| `specimen`, case-insensitive, **Swift sources under `apps/mobile/Capture`** | **1,856** across **97** files |
| — app targets (`Capture/`, `CaptureKit/`) | 1,304 across 68 files |
| — tests + mocks (`CaptureTests/`, `CaptureKitMocks/`) | 552 across 29 files |
| non-Swift under `apps/mobile/Capture` | 52 across 5 files |
| **all tracked files under `apps/mobile/Capture`** | **1,908** across **102** files |
| of which exactly `Specimen` (capitalised) | 548 |
| of which exactly `specimen` (lowercase) | 1,360 |

**Where this disagrees with the plan:** it does not, on the headline number — but the plan's
1,856 excludes 52 occurrences in five non-Swift files that W1 must still touch:
`Capture.xcodeproj/project.pbxproj` (24 — regenerate via `scripts/generate_project.rb`, never
hand-edit), `README.md` (3), and `scripts/capture-gate.sh`, `capture-run.sh`, `capture-shots.sh`
(1, 2, 1). The script occurrences are **frozen screen ids** — see §5. Plan the wave against
**1,908 / 102 files**, not 1,856 / 97.

A second, smaller disagreement: `research/11-collision-risk.md:133` says "1,559 references across
97 files" while `research/10-dependency-map.md:363` says 1,856 across 97. 1,559 is the number of
matching *lines*; 1,856 is the number of *occurrences*. Same survey, two units.

## 4. Analytics event names — there are none, and that is the finding

**Zero analytics event names in Field contain the noun.** Every `analytics.event(…)` name in
`apps/mobile/Capture` was enumerated (84 distinct literals): `capture.*`, `sync.*`, `voice.*`,
`field.*`, `visit.*`, `suggestion.*`, `spec_book.*`, `siteScan.*`, `C3.*`, `N1..N5.*`, `Q1/Q2.*`,
`store.*`, `account.*`, `library.*`, `leads.*`, `messages.*`, `projects.*`, `decisions.*`,
`receiving.*`, `settings.*`, `work.*`, `time_entry_logged`. None contains `specimen`.
`FieldVisitTelemetry.swift` — whose header says "The names and property keys ARE the contract —
a dashboard reads them" — is clean: it *takes* a `Specimen` parameter, it never *names* one.

The two `analytics-event` rows in the table are the `CaptureScreenID` raw values, because
`CaptureScreenID.rawValue` **is** the PostHog screen-name namespace: `analytics.screen(
CaptureScreenID.x.rawValue)` fires at 39 call sites. `c3Specimen` and `c5SpecimenSheet`
happen to have no `screen()` call today, so nothing is in a dashboard yet — but they sit inside
a shipped taxonomy, and renaming the raw values would make a later instrumentation of C5 report
under a name that disagrees with every sibling. The client app already has a test pinning exactly
this rule: `NounConsistencyTests` asserts `AppRoute.crossRoom.analyticsScreenName == "All Items"`
while its display name moved to "All pieces".

## 5. Persisted keys and frozen strings — the rows where the answer is "rename the symbol, keep the string"

Five things carry history a rename would discard.

**(a) `@Model public final class Specimen` — `Specimen.swift:48`.** The class name is the SwiftData
*entity* name in the store on every shipped phone. The file header says FROZEN SCHEMA and there is
no `VersionedSchema` / `SchemaMigrationPlan` anywhere in the app. `CaptureStore.walk` responds to a
container that will not open by setting the store aside and coming back empty — and what it would
set aside is queued unsynced captures, unsent margin / punch / degrade notes, and unsynced billable
`FieldVisitCloseRecord` hours. **This is the single highest-consequence row in the table.** The two
`@Relationship` inverse properties (`CapturePhoto.specimen:271`, `CaptureMeasurement.specimen:307`)
are persisted attribute names with the same exposure.

**(b) `@AppStorage("capture.routingSpecimenId")`** — `S1AssignVenueScreen.swift:55`,
`S2CreateProjectScreen.swift:24`. Capture has exactly two `@AppStorage` keys and this is one of
them. A phone mid-route at upgrade has it written; renaming it loses the in-flight routing target.
Rename the Swift property, keep the literal, and keep both declarations identical.

**(c) and (d) `"screen.C3.specimen-forms"` and `"screen.C5.specimen-sheet"`** —
`CaptureScreenID.swift:26,28`. Four consumers, all external to the Swift code:

1. PostHog screen taxonomy (§4);
2. `.accessibilityIdentifier(...)` — the handle XCUITest and MobAI drive
   (`SpecimenSheetScreen.swift:50,370`);
3. the `field://screen/<id>` deep link (`CaptureDeepLink.swift:42-45`, which matches on the raw
   value and on its suffix);
4. screenshot filenames — `scripts/capture-shots.sh:27` emits them, `scripts/capture-run.sh:11,16`
   takes them as arguments, and they are already committed as
   `docs/design/ios-alignment-program/screenshots/field/C5.specimen-sheet.png` (referenced three
   times from that deck's `index.html`) and documented in
   `.agents/skills/patina-ios-verification/SKILL.md:63`.

Rename the enum cases to `c3Piece` / `c5PieceSheet`; leave the raw values alone.

**(e) `field_captures.capture_kind = 'specimen'`** — `supabase/migrations/00530:40,42,309,310,313`.
A live Strata column value, with a `CHECK` constraint, a `DEFAULT`, three RPC branches, a SQL test
(`supabase/tests/field/field_capture_note_routing_test.sql:291,361`) and two portal/package test
fixtures. Field's `Specimen.captureKindRaw` is deliberately `nil` for this case so the server
default supplies it. **Out of W1's scope entirely.** Changing it is a production migration plus a
backfill plus edge-function, portal and fixture changes.

**Two strings that look like keys and are not.** `RouteRegistry.registryKey` returns `"specimen"`
(`:44`) and `"specimenSheet"` (`:72`), and `CaptureNavigation.swift:87` returns `"specimen-\(uuid)"`.
None is persisted. `registryKey` is produced and consumed by the same expression
(`r.registerRoute(CaptureRoute.specimen.registryKey)`), so a rename is self-consistent; the only
surface that shows the raw token is the developer `MissingScreen(token:)` fallback. Rename the enum
case and the literal in the same edit, or the registry silently falls through to `MissingScreen`.
The nav id is transient SwiftUI identity. `capture-gate.sh:57` already treats this class of string
as identifier-only: its `sweep_filter` excludes lines matching
`CaptureScreenID|registryKey|accessibilityIdentifier|analytics.event|analytics.screen`.

## 6. `CaptureStoreMigrationTests` is not a rename safety net — confirmed

`CaptureTests/CaptureStoreMigrationTests.swift:32-37`:

```swift
private static let previousSchema = Schema([
    Specimen.self, CapturePhoto.self, CaptureMeasurement.self, CaptureProjectRef.self,
    ScanUploadRecord.self,
    SiteRequestOutboxRecord.self,
    FieldVisitCloseRecord.self
])
```

The "previous" schema is built from the **current** Swift types. The test writes a store with those
types and reopens it with those same types. That catches what it was built for — W6 adding a model
and a mandatory column — because *added* members differ between the two `Schema` values while the
shared members keep their names. It cannot catch a rename: after W1, line 33 reads `Piece.self`, the
"previous" store is written under the **new** entity name, and the test goes green while every
shipped phone's store still says `Specimen`. The file's own header is candid about the general shape
of the trap ("the app builds and every unit test passes against a store the test itself just
created under the new schema") without noticing that the fixture has the same defect.

W1 needs a migration test whose previous schema is **pinned bytes or a pinned entity name**, not a
type reference: a store file committed as a fixture, or a `VersionedSchema` whose V1 declares the
old names literally. Until one exists, the entity rename is unverifiable.

## 7. `CapturedPiece` — the one thing this table cannot resolve

D3 clause 1 has two halves and the second has no unambiguous target. Everything in
`apps/mobile/Capture` **is** captured in the field, so a literal reading of "the
captured-in-the-field variant → `CapturedPiece`" would make the `@Model` itself `CapturedPiece`,
which contradicts the first half.

This table takes the **literal reading of the first clause**: `Specimen` → `Piece` throughout
Field, and `CapturedPiece` reserved as the disambiguating term for the two places a captured piece
must be told apart from a catalog piece —

- the sibling client app already owns `Piece` as the marketplace/house noun: `PatinaTab.pieces`
  ("Pieces" on the bar, "Browse pieces" as the canonical name), `PieceAct`, `PieceActChannel`,
  `PiecesTabRoot`, `AppRoute.pieceDetail`, "All pieces". These are separate Xcode targets, so
  there is **no Swift compile collision** — `Piece` is effectively unused inside Capture (12
  lowercase prose occurrences, no type). The collision is semantic, and it is the collision
  `CapturedPiece` appears to exist to solve.
- the server's `capture_kind = 'specimen'` (§5e), which stays as-is regardless.

**If the intent was `Specimen` → `CapturedPiece`, every `Piece*` row in `lexicon.json` shifts.**
That is 1,856 identifiers' worth of difference, so it wants Kody's confirmation before W1 starts
rather than after.

**RULED 2026-09-24 (D3a): the literal reading stands.** `Specimen` → `Piece` throughout Field;
`CapturedPiece` is reserved for the places a field capture must be told apart from a catalog piece.
`lexicon.json` is correct as written.

## 8. `Studio` and `Projects` — surveyed, listed, not changed

**Field is clean.** Every `studio` site in `apps/mobile/Capture` already means the firm:
`ConnectWorkspaceScreen.swift:190,191,335`, `ViewfinderModel.swift:697`,
`S5InboxTerminalScreen.swift:52`, `SiteScanSetupScreen.swift:218`, `WorkDashboardScreen.swift:182`
("Your studio" as the workspace name), `FieldRosterRules.swift:219` ("Studio only. This card never
reaches a client page."), `FieldCopyAudit.swift:31`, and the `studio_contacts` /
`studio_person_affiliations` / `studio_id` wire sites. No `Studio` meaning a room or a physical
space was found anywhere in either iOS app. Nothing for W1 to do.

**The client app contradicts both clause 2 and clause 3, in one place.**
`Patina/Features/Navigation/PatinaTab.swift` declares the shipped house-first bar as four tabs —
`today`, `spaces`, `pieces`, `studio` → "Today", "Spaces", "Pieces", "Studio". **There is no
`Projects` tab.** "Projects" exists only as a screen title one level down
(`Coordinator.swift:153`, `AppRoute.projectList.displayName`), reached from the Studio hub.

And the Studio tab uses "Studio" for the **homeowner's own** hub, not the designer's firm:
`canonicalName` is "Your Studio" (`PatinaTab.swift:42`, `Coordinator.swift:149`), and
`StudioHubView.swift:153` reads "Your Studio begins with a project." Under clause 2 that is the
wrong noun; under clause 3 the most likely intent is that this tab becomes **Projects**.

Recorded, not changed. Resolving it is a separate ticket, and it needs its own ruling on *which*
tab becomes `Projects`. It carries the same `analytics-event` hazard as everything else here:
`AppRoute.studio` has its own PostHog screen name, deliberately split from `.profile` so Studio
visits stopped reporting as "Profile" — and `NounConsistencyTests` already pins the rule that an
analytics name must not move when a display name does.

## 9. The eight user-visible strings — the plan named seven

The plan's seven (`research/10-dependency-map.md:369-378`) all reproduce, and the survey found an
eighth the plan classified away.

| # | site | string |
|---|---|---|
| 1 | `ViewfinderControls.swift:251` | "Tap to capture, hold for a multi-shot specimen" (accessibilityHint) |
| 2 | `TagOCRSheet.swift:101` | "Add to specimen" |
| 3 | `TagOCRSheet.swift:154` | "Add to specimen" |
| 4 | `ResilienceScreens.swift:86` | "Pull existing shots into a specimen" |
| 5 | `RootView.swift:221` | "Review this specimen" (Companion hint) |
| 6 | `SpecimenSheetScreen.swift:38` | "Specimen" (navigationTitle) |
| 7 | `SpecimenSheetScreen.swift:364` | "That specimen is no longer here." |
| **8** | **`LocalCaptureSyncService.swift:32`** | **"Specimen \(id) not found in the local store."** |

**Why #8 is user-visible.** The plan excludes it as "a log line". It is not. `LocalSyncError`
conforms to `LocalizedError`; the sentence is its `errorDescription`; `error.localizedDescription`
is written into `Specimen.lastSyncError` at six sites in that same file (`:266, :273, :684, :795,
:842, :876`) and rendered from there through `Specimen+Accessors.swift:61,79`. Its sibling cases
are unmistakably designer-facing copy — "Not signed in — captures stay queued until you connect.",
"Choose where this belongs before sending it." It has a second hazard the other seven do not: the
sentence is **persisted** into `lastSyncError`, so a row written before the rename still shows the
old noun after the upgrade. (Separately, "not found in the local store" is engineer-speak whatever
the noun is.)

One more occurrence, listed in the table but not counted above: `SpecimenSheetScreen.swift:374`
`#Preview("Specimen sheet")` — Xcode canvas only, never on a device, no human read needed. The
plan excludes previews and is right to.

**A copy note for whoever reads these.** Nine of the ten `user-visible-string` rows carry
`needsRuling: true`, because a literal substitution produces sentences no one has approved —
"Add to piece", "a multi-shot piece". Row 7's neighbour is the sharpest illustration:
`RouteSessionUI.swift:260` already says "This capture is no longer here" while
`SpecimenSheetScreen.swift:364` says "That specimen is no longer here." Two near-identical
sentences, two different nouns, in the same app. Picking the noun does not settle the copy.

## 10. What W1 needs that does not exist yet

1. **A ruling on §7** before touching 1,856 identifiers.
2. **A migration proof that survives a rename** (§6) — a committed pre-rename store fixture or a
   `VersionedSchema` with literal old entity names. Without it the highest-consequence row in the
   table is unverifiable, and the failure mode is silent data loss on shipped phones.
3. **A Field lexicon test.** Field has no equivalent of `NounConsistencyTests` — its lexicon
   enforcement is a shell grep, `capture-gate.sh:104-118 fcr3_sweep`, which sweeps `inbox` and
   `ai` against an allow-list of wire-contract sites. The natural W1 verify lane is a third
   `sweep_word specimen …` whose allow-list is exactly the frozen rows in §5, plus a Swift test
   per `user-visible-string` row asserting both the old noun's absence and the new noun's presence.
   Note the existing allow-list entries are `file.swift:LINE: content` EREs matched by content,
   so a file rename inside the sweep roots needs the corresponding pattern updated in the same
   commit.
4. **Regenerate `Capture.xcodeproj/project.pbxproj`** with `scripts/generate_project.rb` after the
   file and directory renames (`Capture/Features/Specimen/` → `Capture/Features/Piece/`,
   `Domain/Specimen.swift`, `Domain/Specimen+Accessors.swift`, `Domain/SpecimenCapturePolicy.swift`,
   `Design/SpecimenFieldRow.swift`, `Session/V3SpecimenDetailScreen.swift`,
   `Specimen/SpecimenSheetScreen.swift`). Do not hand-edit the 24 pbxproj lines.
