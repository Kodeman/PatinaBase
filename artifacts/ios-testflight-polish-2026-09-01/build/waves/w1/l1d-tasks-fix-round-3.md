# W1 · L1-D — fix round 3 task list

Lane: **L1-D — Tokens, dark mode, contrast, iconography**
Branch: `first-flight/w1-l1d` · worktree `.codex/worktrees/agent-ff-w1-l1d`
Input: the 18 review findings `RL1D-R3-01` … `RL1D-R3-18`.

Format: failing test → run → implement → run → pathspec commit.

---

## The four standing lines

### 1. Simulator

```bash
export IOS_GATE_UDID=FF762E1A-F261-4C23-AFB9-CDDEE9B82B8D
```

Launch argument on every relaunch: `-DeploymentTarget local`. No `-PatinaFlags` —
`house-first` is default-on since W0. HID preflight before trusting any input.

### 2. VISION check

Nothing in this round adds tab, zone or dashboard UI beyond D1's ruling; no shadow;
no red/green status; no badge; no engagement optimisation; the word "AI" appears
nowhere in shipped copy. Three items need naming explicitly:

- **T4 adds a 1 pt hairline to the Companion disc.** VISION §6 refuses *shadows*.
  A hairline is a rule, not a shadow, and `PatinaColors.Border.onDark` exists in the
  token file for exactly this shape ("a hairline on a `Background.dark` object, where
  the page behind is the thing it has to separate from") with zero call sites. It
  survives because C-01's own fix line offers "adaptive fill **or** border/shadow" and
  the fill route cannot reach 3:1 without breaking C-02 (arithmetic in T4).
- **T3 keeps `PatinaColors.error` as a wash and moves only the ink.** No red status
  dot, no green counterpart — the badge already existed and this changes its ink value.
- **T6 adds a second empty-state sentence.** It is a sentence, not a new surface.

### 3. The notes this round must apply

Every `build/waves/w1/l1-d-notes.md` entry addressed to this lane, re-read at the top
of this round. Four are new since round two:

| id | what it asks | task |
|---|---|---|
| `D-L1A-4` | Nothing to apply here. It records the eight `pearl` and two `.font(.custom(` lines that L1-A will apply when it rebases onto the integration tip (L1-A merges 5th), because the tokens do not exist on `ba83aa67f`. | T10 — carried into the wave ledger, not this branch |
| `D-L1A-5` | Nothing to apply. `C3-05`'s quiz half and `A-11` are closed on `first-flight/w1-l1a`. Confirms `RL1D-R3-10`: the two rows this lane's §4 still sends are stale. | T10 |
| `D-L1A-6` | A fact, not a change: `AuthProviderCatalog` now offers `.apple` on the local stack, so `C3-03`'s dark-mode style is observable on this clone's self-check. | T11 (self-check) |
| `D-L1C-*` (fix round) | Nothing to apply. `RoomTypePillRow.swift` is L1-C's and L1-C merges first; the two sites are rebase-time applies with the final text already written. | T10 |

### 4. The notes this round sends

Written to `build/waves/w1/l1d-notes-out-round4.md` **and** appended to each target
lane's `build/waves/w1/l1-<lane>-notes.md`, with the exact final text. See T10.

---

## Coverage — every review finding, the task that closes it, the test that pins it

| review id | sev | task | test that pins it |
|---|---|---|---|
| `RL1D-R3-01` | blocker | T1 | `HouseRecordRowInkTests.aRouteLessRowIsNotDimmed` (rendered, not a token bar) |
| `RL1D-R3-02` | blocker | T10 | n/a — a ratification package + a re-measured conflict table; `git merge-tree` at the tip is the evidence |
| `RL1D-R3-03` | major | T2 | `SelectedStateTests.noLightLabelRidesOnTheRawAccent`, widened by T2a |
| `RL1D-R3-04` | major | T3 | `ContrastTests.theStatusBadgeInkClearsAAOnItsOwnWash` |
| `RL1D-R3-05` | major | T4 | `CompanionOrbAppearanceTests.theCompanionSurfaceReadsAsAnObject` at the charter's 3.0 |
| `RL1D-R3-06` | major | T5 | `ImagePlaceholderTests.chromeOverAPhotographUsesTheScrim`, widened |
| `RL1D-R3-07` | minor | T10 | n/a — recorded, with the command's verbatim failure |
| `RL1D-R3-08` | minor | T10 | n/a — renumber to `D→A-8`, correct §4 |
| `RL1D-R3-09` | minor | T10 | n/a — the five inbox files committed by pathspec |
| `RL1D-R3-10` | minor | T10 | n/a — the two stale rows deleted |
| `RL1D-R3-11` | minor | T6 | `ImagePlaceholderTests.theHonestEmptyStateIsOnlyClaimedForAnEmptyCatalogue` |
| `RL1D-R3-12` | minor | T7 | `CurrencyFormattingTests.theCompactFormatterCountNeverClimbs`, widened to `$…K` literals |
| `RL1D-R3-13` | minor | T2a | the widened `SelectedStateTests` heuristic fails on T2's two sites before T2 lands |
| `RL1D-R3-14` | minor | T8 | `TypographyAdoptionTests`, both helpers matching `Font.custom(` |
| `RL1D-R3-15` | minor | T9 | n/a — a named known-flake entry the steward reads; no test |
| `RL1D-R3-16` | minor | — | no change asked; the exemption is already named in `BorderTokenAdoptionTests` |
| `RL1D-R3-17` | minor | T10 | n/a — `A-11`/`P-25` carried as "closed by L1-A at merge 5" |
| `RL1D-R3-18` | minor | T9 | no test; a comment naming the status bar, and a device-pass line for Kody |

---

## T1 — `RL1D-R3-01` (blocker) · a route-less Record row is dimmed by SwiftUI, not by a token

**The measurement.** `HouseRecordCard.swift:374` is `.disabled(row.route == nil)` on a
`Button(.plain)`. SwiftUI dims a disabled plain button's ink to ~0.5, so the MOVED row's
body renders `Text.primary` #F2EDE6 at 0.5 over the card #2C2926 = **4.27:1** — C-20's own
number — and its meta renders `Text.muted` #C7B99F at 0.5 = **3.01:1**. Light is worse:
2.96:1 body, 1.86:1 meta. Round two's token raise moved the meta from 2.66 to 3.01 and
could not move the body at all, because the dim is a modifier, not a colour.

**Failing test.** `PatinaTests/HouseRecordRowInkTests.swift`. A token bar cannot see a
modifier-level dim, so this renders. `ImageRenderer` rasterises `HouseRecordRowView`
twice — once with `route: nil`, once with a route — over the card ground in dark, and
asserts the two rasters carry the *same* extreme ink. An equality assertion rather than a
threshold: it cannot drift with font rendering, and it fails on exactly the property the
finding names.

**Implement.** Replace `.disabled(row.route == nil)` with a branch: a row with no route
renders its content directly, a row with a route renders it inside the `Button`. The
accessibility element, label and trait rule are unchanged.

**Commit.** `apps/mobile/Patina/Patina/Features/Home/Views/HouseRecordCard.swift`,
`apps/mobile/Patina/PatinaTests/HouseRecordRowInkTests.swift`,
`apps/mobile/Patina/PatinaTests/RenderPin.swift`

---

## T2 — `RL1D-R3-03` (major) · the two `C3-05` sites the round-two sweep edited around

`DesignRequestFlowView+Steps.swift:378/381` and `MoveOrCopyItemSheet.swift:106/111` are
`.foregroundStyle(isSelected ? .white : …)` over `.background(isSelected ? PatinaColors.clay : …)`
— C3-05's 2.18:1 shape verbatim. Both had the *next* line edited in round two
(`pearl` → `Border.strong`) without the pair above being touched. Neither is held back by
`D→C-11` / `D→C-12`.

### T2a (test first) — `SelectedStateTests` cannot see a ternary or a bare `.white`

The heuristic matches only `PatinaColors.clay)` **with the closing paren** and only counts a
window naming `offWhite` / `Text.inverse` / `OnDark.primary`. Both live sites are
`isSelected ? PatinaColors.clay : …` with a SwiftUI `.white` label, so the suite is green over
them. Widen: match `PatinaColors.clay` / `clayDeep` followed by `)`, `,`, ` :` or end of
expression, and add `.white` / `Color.white` to the light-ink list. Run — expect red naming
`DesignRequestFlowView+Steps.swift` and `MoveOrCopyItemSheet.swift`.

### T2b — apply the substitution the lane used everywhere else

Fill `PatinaColors.clayInk`, label `PatinaColors.Text.inverse`, stroke `PatinaColors.clayInk`.
Run — green.

**Commit.** the two feature files + `SelectedStateTests.swift`

---

## T3 — `RL1D-R3-04` (major) · `A-73`'s error-ink sweep missed two live sites

`PatinaStatusBadge.swift:25/56` paints a 12 pt uppercase label in `PatinaColors.error`
(3.03:1 on the light canvas, less on its own 14 % wash) and is rendered by
`PatinaStatusBadge(state: .error, text: …)` at `ProposalDetailView.swift:110`.
`InvoiceDetailView.swift:119/143` paints the banner glyph with the same value.
`PatinaStatusBadge.swift` is inside this lane's own glob.

**Failing test.** `ContrastTests.theStatusBadgeInkClearsAAOnItsOwnWash` — the badge's error
ink against `state.tint.opacity(0.14)` composited over both page grounds, in both
appearances, at the 4.5:1 body bar. The three non-error states are measured and reported
in the lane report rather than asserted; the test comment says so by name and says why
(they are outside `A-73` and outside every W1 finding).

**Implement.** Split the badge's one `tint` into `inkTint` (the label and glyph) and `tint`
(the wash). `.error` → `PatinaColors.Text.error`; the other three keep their value on both
sides, so nothing but error moves. `InvoiceDetailView` gets the same split:
`bannerInk(_:)` for the glyph, `bannerTint(_:)` for the 10 % wash.

**Commit.** `PatinaStatusBadge.swift`, `InvoiceDetailView.swift`, `ContrastTests.swift`

---

## T4 — `RL1D-R3-05` (major) · the orb bar was silently halved, and the disc is 1.93:1

`CompanionOrbAppearanceTests.swift:40` asserts `measured >= 1.8` where PROGRAM.md §3 says
"hold ≥ 3:1 against the page ground in both appearances". The relaxation is written down
nowhere. Sim-verified: the disc is #524B44 on #211E1B = **1.93:1**.

**The arithmetic that decides the route.** Lifting `DarkPalette.surfaceDark` until the fill
clears 3:1 needs L ≥ 0.1399 (page L = 0.01330). At that luminance
`OnDark.secondary` #D8D2C8 on the disc drops to **3.54:1**, below the 4.5:1 bar
`onDarkTokensDoNotFlip` holds for C-02 — so the fill route trades C-01 against C-02.
C-01's own fix line offers "adaptive fill **or** border/shadow". VISION §6 refuses shadows.
That leaves the border, and `PatinaColors.Border.onDark` #756B61 already exists for it with
**zero call sites** — the same failure mode round one had with `clayInk`. #756B61 is
**3.19:1** against the dark page and **4.87:1** against the light page: the disc's *edge*
clears the non-text bar in both appearances, which is what "an object on the page" means.

**Failing test.** Raise the bar to the charter's 3.0 and measure what actually carries it:
the disc's edge token against the page in both appearances, plus a source pin that the disc
and the hearth shell actually draw that edge. Also tighten `everyCompanionDiscIsAdaptive`
from `PatinaColors.charcoal.opacity` to `PatinaColors.charcoal`, which the review noted a
bare charcoal disc would slip past.

**Implement.** `.overlay(Circle().strokeBorder(PatinaColors.Border.onDark, lineWidth: 1))`
on `CompanionMarkView`'s disc; the same on `CompanionHearthView`'s shell rounded rect.
Both keep their fill, so the fill's 1.93:1 improvement over C-01's 1.15:1 stands and the
`OnDark` ink keeps its 5.71:1.

**Commit.** `CompanionMarkView.swift`, `CompanionHearthView.swift`,
`CompanionOrbAppearanceTests.swift`

---

## T5 — `RL1D-R3-06` (major) · C-27's scrim reached the grid, not piece detail

`ProductDetailBlocks.swift:95-104` `floatingCircleButton` is `Circle().fill(.ultraThinMaterial)`
with `Text.primary` ink, rendered four times (Back / Help / Share / Save) over the 340 pt hero
at `ProductDetailView.swift:319-360`. That is the construction the lane replaced on the browse
grid, for the reason it gave for replacing it.

**Failing test.** Widen `ImagePlaceholderTests.chromeOverAPhotographUsesTheScrim` from one
file to the three that float chrome over a photograph, `ProductDetailBlocks.swift` included.

**Implement.** `Circle().fill(PatinaColors.Scrim.chrome)` with `PatinaColors.OnDark.primary`
ink — the pairing `RecommendationsView.swift:515` already uses.

**Commit.** `ProductDetailBlocks.swift`, `ImagePlaceholderTests.swift`

---

## T6 — `RL1D-R3-11` (minor) · the honest empty state fires for an empty category too

`filteredProducts { products }` does no local filtering, but the category chip is sent to the
RPC as `p_category`, so a category with no rows returns zero products and the branch renders
"Nothing here yet / Your designer is still choosing pieces for you." over a catalogue that is
fine. A tester who taps "Lighting" learns something false.

**Failing test.** `ImagePlaceholderTests.theHonestEmptyStateIsOnlyClaimedForAnEmptyCatalogue`
— a source pin that `stillChoosingPieces` is reached only under `activeFilter == "All"`.

**Implement.** Gate the honest-empty copy on the unfiltered case and give the filtered case
its own line. The condition is this lane's; the wording is L1-E's row, so the line goes out
as `D→E-3` with the exact final text and is applied at the deck pass if L1-E rules differently.

**Commit.** `RecommendationsView.swift`, `PatinaEmptyState.swift`, `ImagePlaceholderTests.swift`

---

## T7 — `RL1D-R3-12` (minor) · the compact-money ratchet is blind to string literals

The suite's test is named "no amount ever renders as a compact K string" and the app-wide bar
is at zero, but `"$500–$2K"`, `"$2K–$5K"` and `"$2–5K"` are literals, invisible to both
patterns. Widen the pin to catch a `$…K` literal and name the quiz's budget *bands* as an
exemption — the way `BorderTokenAdoptionTests` names `PatinaGradients` — so the test measures
what its name claims. The bands are `C5-14`-exempt (a band is not a piece's price) and the
three sites are in `Features/StyleQuiz/**`, which is L1-A's.

**Commit.** `CurrencyFormattingTests.swift`

---

## T8 — `RL1D-R3-14` (minor) · a `Font.custom` bound to a property is invisible to both assertions

`RoomSettingsView.swift:41` is
`private static let fieldFont = Font.custom("PlayfairDisplay-Regular", size: 16, relativeTo: .body)`
— an inline face declaration in `Features/**` that survives the sweep and is unseen by
`everyNamedFaceIsRegistered`, the assertion whose whole purpose is to catch an unshipped
PostScript name. Pre-existing (it is on `main` at the same line), but the exit criterion reads
"zero `.font(.custom(` in `Features/**`" and the app still builds one Font from a literal face
name there.

**Failing test.** Match `Font.custom(` rather than `.font(.custom(` in both helpers, and exempt
`Tokens/PatinaTypography.swift`, which is where the faces are *declared*.

**Implement.** The token that already exists is byte-identical:
`PatinaTypography.bodySerif` is `Font.custom(displayFont + "-Regular", size: 16, relativeTo: .body)`.
Point `fieldFont` at it, keeping the named constant so the file's own "one declaration so the
two cannot drift apart" comment still reads.

**Commit.** `RoomSettingsView.swift`, `TypographyAdoptionTests.swift`

---

## T9 — `RL1D-R3-18` + `RL1D-R3-15` (minor) · two things written down rather than changed

- `RevealView.swift`: `.environment(\.colorScheme, .dark)` has no leak (no sheet, no
  `NavigationLink`), but the status bar is **not** covered by the override — on a light system
  appearance it stays dark-on-light over a charcoal ground. A comment names it, and it goes on
  Kody's device-pass list.
- `OrderHandoffTests` + `CompanionCoachingModelTests` are a pre-existing timing flake this lane
  does not touch. D14 runs a gate between every merge, so the steward meets it five more times
  tonight. The known-flake entry with the reproduction goes to the steward as `D→X-3`.

**Commit.** `RevealView.swift`

---

## T10 — `RL1D-R3-02` (blocker) + `-07` `-08` `-09` `-10` `-16` `-17` · the paperwork the merge needs

1. **The residue ratification package.** `git diff --name-only main...HEAD -- apps/mobile`
   returns 110 paths. Enumerate the ~85 outside the named globs, split into (a) the C3-ledger
   colour/font literal sweep the charter authorises by integration note, (b) the four
   "No lane, no W1 work" directories, (c) `project.pbxproj`. Give Fable the exact diff shape of
   each so it ratifies or reverts a measured thing.
2. **The conflict table, re-measured at the tip.** 14 conflicts, not 11. Three
   (`CompanionHearthView`, `CompanionOverlay`, `RoomBudgetTests.swift`) had no resolution row,
   and two of them are where C-01's and C-02's fixes live — a "take theirs" silently reverts
   them. Write a resolution row for all 14.
3. **The inert gate line.** `swift test --package-path apps/mobile/PatinaDesignKit` fails with
   `no such module 'UIKit'` on `HapticManager.swift:8:8`, pre-existing, and the package has no
   Tests target. Record it, and record that `ContrastTests` / `DynamicTokenTests` went to
   `PatinaTests/` instead.
4. **The note-id collision.** `l1-a-notes.md` carries two different notes both called `D→A-7`.
   Renumber the round-three one to `D→A-8` and correct §4 of `l1d-tasks.md` to match what
   `l1d-notes-out-round3.md` actually sent.
5. **The two stale rows.** `D→A-4` (P-25's placeholder) and `D→A-5` (the quiz's emoji) assert
   defects L1-A has already fixed. Delete them.
6. **The untracked inboxes.** `git ls-tree main` lists exactly one path under `waves/w1/`.
   Commit all five inbox files plus the notes-out files by pathspec.
7. **`A-11` / `P-25`** carried as "closed by L1-A at merge 5", not as L1-D debt.
8. **`PatinaGradients.earth`** — the one named `pearl` exemption, recorded so the exit line
   reads as "zero, plus one named gradient stop".

**Commit.** `artifacts/ios-testflight-polish-2026-09-01/build/waves/w1/**` by pathspec

---

## T11 — self-check on the clone

Launch against the local stack with `-DeploymentTarget local`, sign in as
`client@patina.dev / password123` where needed, and screenshot every screen this round
changed, before and after, into `shots/w1-l1d-r4/` with a `ledger.md` line each.
Screens: Today (the MOVED rows, dark + light), the Companion orb (dark), piece detail's
hero chrome (dark), browse with a category filter, an invoice with a banner, a proposal
with a status badge, Move-or-copy, the design-request chips, room settings.

---

## T12 — the gates

```bash
export IOS_GATE_UDID=FF762E1A-F261-4C23-AFB9-CDDEE9B82B8D
apps/mobile/Patina/scripts/ios-gate.sh build
apps/mobile/Patina/scripts/ios-gate.sh release
apps/mobile/Patina/scripts/ios-gate.sh unit
apps/mobile/Patina/scripts/ios-gate.sh lint-delta main
```
