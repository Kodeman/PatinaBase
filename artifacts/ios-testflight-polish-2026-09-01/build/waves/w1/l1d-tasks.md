# W1 · L1-D — Tokens, dark mode, contrast, iconography · task list

Lane: **L1-D**. Branch `first-flight/w1-l1d`, worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-ff-w1-l1d`.
Base: `ba83aa67f` (main after W0). Merge position: **second** (D14: L1-C → **L1-D** → L1-B → L1-F → L1-A → L1-E).

This file was rewritten for the **fix round** (2026-09-02, round 2). Round one's list is in the
git history of this path at `f35055a1a`. Round two exists because an adversarial review returned 22
findings (`RL1D-01` … `RL1D-22`), two of them blockers, and because the round-one strategy — routing
every call-site swap to the owning lane as an integration note — **did not work**: measured on
`first-flight/w1-l1c` at the time of the review,

```
$ git grep -n 'OnDark\.\|Border.hairline\|Border.strong\|patinaChromeScrim\|stillChoosingPieces' \
    first-flight/w1-l1c -- 'apps/mobile/Patina/Patina/Features'
(no output)
```

L1-C, which merges **first**, applied none of `D→C-1` … `D→C-10`. Nine of this lane's eighteen
findings were parked behind those notes. A note no owner scheduled is not a plan.

---

## Standing lines

### 1. Simulator

```bash
export IOS_GATE_UDID=FF762E1A-F261-4C23-AFB9-CDDEE9B82B8D
```

One clone, never shared, never `booted`. Launch arguments repeated on every relaunch:
`-DeploymentTarget local`. **No `-PatinaFlags`** — `house-first` is default-on since W0 (D1a), and
the four-tab root is the shipped product. HID preflight before trusting any input.

### 2. VISION check

Nothing in this round adds tab, zone or dashboard UI beyond D1's ruling; no shadows are added
(`patinaShadow` call sites are untouched); no red/green status semantics are introduced; no badges;
no engagement optimisation; the word "AI" appears nowhere in shipped copy.

Two items need the exception stated out loud, because both are colour changes that could be
mistaken for status colour:

- **`Text.error` (T1).** This is not a new red/green status axis. `PatinaColors.error` already
  exists and is already used as ink at fifteen sites; the finding is that it computes **3.03:1** on
  the light canvas, which is below AA for text a tester has to read ("Overdue", a sheet's validation
  line). T1 does not add a colour meaning, it makes an existing one legible. There is no matching
  `Text.success` and none is added — nothing in the app pairs the two.
- **The `Scrim.chrome` call sites (T11).** An opaque ground under chrome that floats over a
  photograph is the fix `C-27` asks for by name. It is not a shadow and not an elevation system; it
  is one flat token so a control's contrast stops being a function of the photo behind it.

**One deliberate suppression, recorded rather than silently done:** T9 makes a story's read-time
badge *disappear* when the body cannot carry the claim. Removing a number the app was inventing is
the honest direction, and it is what `A3-17`'s fix line asks for ("hide the badge below a
threshold"). It is not an engagement lever in either direction.

### 3. Notes addressed to this lane, as numbered tasks

Every block in `build/waves/w1/l1-d-notes.md` addressed to L1-D. Rounds one and two are both listed;
round one's four are marked **[r1]** and were applied at `e7aea2898`.

| # | note | task |
|---|---|---|
| N1 **[r1]** | `D-L1E-1` — L1-E, `PatinaEmptyState.swift`'s `#Preview` default copy | applied r1 · re-verified in T12 |
| N2 **[r1]** | `D-L1C-1` — `GAP4-16`, the two lines L1-C changed inside `RevealView.swift` | applied r1 · **re-opened by T5** (the hero's Dynamic Type) |
| N3 **[r1]** | `D-L1C-2` — `GAP1B-07`, the global `.ghost` 44 pt floor | applied r1 · pinned by `PrimaryButtonStyleTests` |
| N4 **[r1]** | `D-L1A-1` — `C3-03`, Sign in with Apple vanishes in dark mode | applied r1 · **re-examined by T20** (`RL1D-17`) |
| N5 **[r1]** | `L1F→D-1` — `A-63`, `PatinaButton` has zero horizontal padding | applied r1 |
| N6 | `D-L1A-2` — the Google brand mark is not needed for round one | no action: L1-D ships no Google asset; D3 drops the provider |
| N7 | `D-L1A-3` — `AuthButton` lost its two call sites | no action: `AuthButton` is L1-A's file and L1-A removed the call sites |
| **N8** | **`L1F→D-2`** — reply on `D→F-1`: the five `pearl` sites in Messaging/Notifications are a rebase-time apply, and there are **five, not four** | **T6 applies four of the five here** (`ThreadDetailView.swift:291`, `ThreadListView.swift:129,175`, `NotificationFeedView.swift:289`). The fifth — the thread header's bottom rule L1-F **adds** for `C-13` — does not exist on this branch; it stays L1-F's rebase-time apply and is restated in `l1d-notes-out-round3.md` as `D→F-3`. |

### 4. Notes this lane sends

Written to `build/waves/w1/l1d-notes-out-round3.md` **and** appended to each target's
`build/waves/w1/<target>-notes.md`. Round three is short by design: this round *applies* what round
two could only ask for, so the only notes left are the ones this lane genuinely cannot land.

| id | to | subject | why it cannot land here |
|---|---|---|---|
| `D→A-4` | L1-A | `P-25`: the OTP field's `000000` placeholder and its AXValue | L1-A **restructured the file**. The field moved from `AuthenticationView.swift` to `AuthenticationView+Panels.swift:122` and still reads `TextField("000000", text: $viewModel.otpToken)`. Round two's note named the old path; this one names the new one. Editing it here would conflict with a file split. |
| `D→A-5` | L1-A | `A-11`: 13 emoji → SF Symbols in the style quiz | Same restructure — the question bodies moved to `StyleQuizView+Questions.swift`. |
| `D→A-6` | L1-A | `C3-06` / `A-73` auth half: the inverted enabled/disabled affordance on the submit button | Same restructure — `AuthenticationView.swift:519` no longer exists at that line. |
| `D→F-3` | L1-F | the fifth `pearl` divider, the one `C-13` adds | The line does not exist on this branch. |
| `D→C-11` | L1-C | four `pearl` sites in files L1-C rewrites, which T6 deliberately did **not** touch | Conflict avoidance — see T6's "held back" table. |

**`D→F-1` and `D→F-2` were never appended to `l1-f-notes.md`** in round two (`RL1D-11`); L1-F found
them in `l1d-notes-out.md` anyway and replied. T19 appends them retroactively so the inbox file
matches the model, then appends round three.

---

## Coverage — the lane's 18 W1 findings

Authoritative source: `build/findings-by-lane.md` § "W1 · L1-D — 18 findings" (PROGRAM.md §3's copy
is stale per §11.6).

| id | closed by | pinned by |
|---|---|---|
| `A3-01` | T12 (the call site, not just the component) | `EmptyStateCallSiteTests.browseRendersTheHonestEmptyState` |
| `A-11` | — **OPEN**, note `D→A-5` | — |
| `A-36` | T11 | `ImagePlaceholderTests.everyProductSurfaceRoutesThroughTheComponent` |
| `A-73` | T1 (`Text.error`) + r1 (`clayInk`, filled buttons) · **auth half OPEN**, note `D→A-6` | `ContrastTests` |
| `A-90` | r1 | `PrimaryButtonStyleTests` |
| `A3-17` | T9 (the badge now disappears rather than lying) | `EditorialReadTimeTests.aBodyThatCannotCarryAClaimMakesNone` |
| `B-18` | T11 | `ImagePlaceholderTests` |
| `C-01` | T4 (the last hard-coded charcoal disc) | `CompanionOrbAppearanceTests.everyCompanionDiscIsAdaptive` |
| `C-02` | T13 (the call site) | `CompanionOrbAppearanceTests.thePanelSubtitleUsesOnDarkInk` |
| `C-20` | r1 + T6 (the meta rows' own file) | `ContrastTests.darkModeDeEmphasisedInk` |
| `C-27` | T11 | `ImagePlaceholderTests` |
| `C-41` | r1 | `PrimaryButtonStyleTests` |
| `C3-01` | **T6 — the whole-app sweep, 80 → 0** | `BorderTokenAdoptionTests.pearlHasNoCallSitesOutsideTheTokenFile` |
| `C3-05` | T15 | `ContrastTests` + `SelectedStateTests` |
| `C3-15` | **T7 — 44 → 0** | `TypographyAdoptionTests.zeroInlineFontCustom` |
| `C5-14` | **T8 — the ratchet reaches 0** | `CurrencyFormattingTests.compactFormatterCeiling` |
| `P-25` | — **OPEN**, note `D→A-4` | — |
| `P-35` | r1 | `ContrastTests` + sim shot |

---

## Tasks

Each task is: **failing test → run (red) → implement → run (green) → pathspec commit.**

### T1 — `error` is ink at fifteen sites and computes 3.03:1 (`RL1D-09`, `RL1D-20`, `A-73`)

1. **Failing test.** `PatinaTests/ContrastTests.swift`: add `PatinaColors.error` to the body-ink
   list, and split `everyFilledButtonLabelClearsAA` so `.secondary` — whose "fill" is the page
   colour — is measured against **both** grounds instead of re-measuring body-on-page.
2. Run: `ios-gate.sh unit -only-testing:PatinaTests/ContrastTests` → red on `error`.
3. **Implement.** `PatinaColors.Text.error` = `patinaDynamic(light: errorDeep, dark: DarkPalette.textError)`,
   with `textError = #DE8A7B` (5.53:1 on the dark card; `errorDeep` is 2.78:1 there, so the light
   value cannot simply be reused). Point the fifteen `.foregroundStyle(PatinaColors.error)` ink
   sites at it. `error` itself stays for the two **non-text** uses — `PatinaTextField`'s 1.5 pt
   error border and the two `.opacity(0.1)` wash backgrounds — which take the 3:1 bar, not 4.5:1.
4. Run → green.
5. `git commit apps/mobile/PatinaDesignKit/.../PatinaColors.swift apps/mobile/Patina/PatinaTests/ContrastTests.swift <the 15 call sites>`

### T2 — `PatinaTextField` was never swept, and T7 of round one said it was (`RL1D-14`)

Round one's list claimed `PatinaCard.swift, PatinaButton.swift, PatinaTextField.swift → Border.hairline`;
only the first two were touched, and `BorderTokenAdoptionTests` passed **vacuously** on the third
because it never contained `pearl`. The field's real border is `clay.opacity(0.2)` and its header
comment still advertises a "pearl/clay border".

1. **Failing test.** `BorderTokenAdoptionTests`: assert the field's unfocused border resolves to
   `Border.strong` and that the file names no `pearl`.
2. Run → red.
3. **Implement.** Unfocused border → `PatinaColors.Border.strong`; header comment corrected.
4. Run → green. Commit.

### T3 — `Background.dark` went adaptive under a comment that says it does not (`RL1D-06`)

`DailyStoryDetailView.swift:37-39` reads `// Deliberately dark immersive reader — stays charcoal in
both modes.` and now resolves to `#524B44` in dark mode: a mid warm-grey **full-screen** ground.
The token's lift is right for an object that has to separate from the page (the orb, the toast, the
budget bars) and wrong for a ground that *is* the page.

1. **Failing test.** `DynamicTokenTests`: the immersive reader's ground is static across
   appearances; `Background.dark` stays adaptive.
2. Run → red.
3. **Implement.** Pin the reader to `PatinaColors.charcoal`; leave the other six `Background.dark`
   consumers adaptive; state the split in the token's doc comment.
4. Run → green. Commit.

### T4 — `companionGlassCircle()` still tints with hard-coded charcoal (`RL1D-07`, `C-01`)

`CompanionOverlay.swift:1142,1144` is the exact shape `C-01` describes, on the State-5 minimal pill.

1. **Failing test.** `CompanionOrbAppearanceTests.everyCompanionDiscIsAdaptive` — no Companion disc
   resolves to the same value in both appearances.
2. Run → red. 3. Route the glass tint and its fallback through `Background.dark`. 4. Green. Commit.

**Reachability, recorded not hidden:** on the four-tab root — which D1 makes the shipped product —
the floating Companion retires. `C-01` and `C-02` are therefore *fixed but not reachable by a
round-one tester on the default root*. Said plainly in the report so nobody claims a tester-visible
win; the fix still matters on the kill-switch fallback root.

### T5 — the Reveal's hero cannot survive Dynamic Type (`RL1D-08`, `RL1D-19`, `C3-15`)

`RevealView.swift:93-111` renders one `Text` per character in an `HStack(spacing: 0)`. The old call
was a **fixed** 42 pt; `PatinaTypography.display2` is `relativeTo: .largeTitle`, so at AX3–AX5 an
11-character name runs off-canvas with no `minimumScaleFactor`, no `lineLimit` and no `ViewThatFits`.
`.fixedSize(horizontal: false, vertical: true)` does not catch a horizontal overflow.

1. **Failing test.** `TypographyAdoptionTests`: the per-character hero declares a minimum scale
   factor, and the display token it uses is not heavier than the face the finding named.
2. Run → red.
3. **Implement.** `.minimumScaleFactor(0.5)` + `.lineLimit(1)` on each glyph; the hero moves to a
   **Regular**-weight display token (`display2Regular`), because `C3-15`'s fix line says
   "Ship PlayfairDisplay-Light **or** change that call to -Regular" and round one landed on
   `-Medium`, heavier than either option offered.
4. Green. Commit.

### T6 — the `pearl` sweep, 80 → 0 (`RL1D-01`, `RL1D-04`, `C3-01`)

The lane's exit criterion is "`pearl` has zero direct call sites outside the token file". Round one
left **80** and routed the rest as notes; L1-C applied none. PROGRAM.md's own merge-order rationale
says L1-D merges second "because its token changes are **the other whole-app sweep**" — the merge
order was built for this. So the sweep happens here.

Each site is classified, not blanket-replaced (the token file's comment is right that a blind flip
would blank the light-ink-on-dark sites):

| shape | token |
|---|---|
| `.stroke` / `.strokeBorder` / `.overlay(Capsule().stroke(…))` / a 1 pt `Rectangle().fill(…)` rule | `Border.hairline`, or `Border.strong` where the rule is one a tester is meant to see (field outlines, unselected pills) |
| `.foregroundStyle(pearl)` on a permanently dark surface | `OnDark.primary` / `OnDark.secondary` / `OnDark.muted` by role |
| `.fill(pearl)` as a track, a slab or a placeholder ground | `Background.secondary`, or `Border.hairline` where it is a divider drawn as a filled rectangle |

**The loudest single site** — `Features/Navigation/PatinaTabBar.swift:68`, the four-tab bar's top
rule, near-white at 12.84:1 on *every* screen in dark mode — is in this sweep.

**Held back on purpose** (conflict avoidance, routed as `D→C-11`): sites inside files L1-C
*rewrites* where a token swap would land in a hunk L1-C moved. Measured per file with
`git merge-tree`, not guessed; the table of what was held back and why goes in the commit body.

1. **Failing test.** `BorderTokenAdoptionTests.pearlHasNoCallSitesOutsideTheTokenFile` — a source
   pin over `Patina/**` and `PatinaDesignKit/Sources/**`, ceiling **0**.
2. Run → red at 80. 3. Sweep. 4. Green at 0 (or at the held-back count, named in the test). Commit.

### T7 — the `.font(.custom(` sweep, 44 → 0 (`RL1D-01`, `RL1D-18`, `C3-15`)

Exit criterion: zero in `Features/**`. Round one left 44.

Includes `RL1D-18`: `ProductCard.swift:157`'s price silently went **serif → sans**
(`PlayfairDisplay-Medium 11` → `PatinaTypography.captionMedium`, Inter-SemiBold 12) while the same
commit added a serif token for a comparable case. The price is the thing a tester reads on a tile.
A serif caption token (`captionSerif`) is added and used, so the promotion stops being a restyle.

1. **Failing test.** `TypographyAdoptionTests.zeroInlineFontCustom`, ceiling 0; plus an assertion
   that every face a token names is in the bundle.
2. Red at 44. 3. Promote each site to a named token. 4. Green at 0. Commit.

### T8 — the money ratchet reaches zero (`RL1D-12`, `C5-14`)

Round one's only change to the canonical formatter was an eight-line **comment**, and its own test
ratcheted six surviving hand-rolled compact formatters at
`compactFormatterCeiling = 6`. `$2.4K` still renders live from
`Features/Rooms/Components/RoomBudgetBar.swift`.

Seven sites, measured: `Core/Models/SavedItem.swift:81`, `Core/Models/ProductModel.swift:184`,
`Features/Rooms/Components/RoomGalleryCard.swift:151`,
`Features/Rooms/Components/WholeHomeCrossRoomBar.swift:51`,
`Features/Rooms/Components/RoomBudgetBar.swift:70`, `Features/Rooms/Views/CrossRoomView.swift:240`,
and `RoomBudgetBar.swift:9`'s doc line.

1. **Failing test.** `compactFormatterCeiling = 0`.
2. Red at 6. 3. Route each through `PatinaCurrency.formatWholeDollars`. 4. Green at 0. Commit.

### T9 — a story with no body still claims "1 min read" (`RL1D-15`, `A3-17`)

`EditorialReadTime.claim(rowValue:body:)` returns `max(1, …)`, so an empty or NULL `body_md` yields
**1** and the card prints "1 MIN READ". Round one's test — named *"a row with no body cannot claim a
read time at all"* — asserts `== 1`, i.e. it asserts the card **does** claim one. `A3-17`'s fix line
asks to hide the badge.

1. **Failing test.** Rename to what it must pin: `claim` returns **nil** for a body with no words.
2. Red. 3. `claim` → `Int?`; `DailyStory.readMinutes` → `Int?`; `readTimeLabel` → `String?`
   (the file already has this exact pattern for `publishedAt`); the card draws the badge only when
   there is one. 4. Green. Commit.

### T10 — a dead accessibility label on the loading tile (`RL1D-16`)

`PatinaAsyncImage.swift:99-100` sets `.accessibilityLabel(…)` then `.accessibilityHidden(true)` on
the next line, so the label never reaches VoiceOver and the suite stays green either way. Drop the
label — the tile is decorative while it loads and the card's combined label already names the piece.

### T11 — the placeholder and the scrim reach the screens the findings name (`RL1D-03`, `A-36`, `C-27`, `B-18`)

`PatinaAsyncImage(caption:)` and `patinaChromeScrim()` have exactly **one** production call site
between them (`ProductCard.swift`, used only by `CollectionsView.swift` — not the Pieces tab, not
the browse grid, not piece detail). The three screens the findings name still fall through to
`product.placeholderGradient`, a bare fill, and still stack a heart, a ⋯ and a match pill over it on
`.ultraThinMaterial`.

Call sites: `Features/Recommendations/Views/RecommendationsView.swift` (browse grid image + match
pill), `Features/ProductDetail/Views/ProductDetailView.swift` (hero), and
`Features/Home/Views/DailyStoryDetailView.swift` (the story's product card).

1. **Failing test.** `ImagePlaceholderTests.everyProductSurfaceRoutesThroughTheComponent` — a source
   pin: no product surface names `placeholderGradient` as an image fallback, and no chrome over a
   photograph uses `.ultraThinMaterial`.
2. Red. 3. Route all three. 4. Green. Commit.

### T12 — `A3-01`'s honest empty state has zero call sites (`RL1D-02` — the table's only blocker)

`grep -rn 'stillChoosingPieces' apps/` returns exactly two hits: the definition and a test. No
product surface renders it, so when `get_recommendations` returns zero rows every tester still sees
whatever shipped before. Round one's table claimed it closed "by T12 + note `D→C-4`"; `D→C-4` went
to L1-C, which merges first and applied nothing.

1. **Failing test.** `EmptyStateCallSiteTests.browseRendersTheHonestEmptyState`.
2. Red. 3. Render `PatinaEmptyStateContent.stillChoosingPieces` on the browse surface when the fetch
   succeeds with zero rows (distinct from loading and from error). 4. Green. Commit.

The **data** half of `A3-01` stays Kody/Leah's (D2: ≥30 pieces, or build 1 ships this state).

### T13 — `C-02`'s call site (`RL1D-05`)

`CompanionHearthView.swift:402` is still `.foregroundStyle(PatinaColors.Text.inverse.opacity(0.72))`
— the exact 1.11:1 composite the finding measured. Round one added the right token and a
counterfactual test asserting the **old** token is still wrong; a test that pins the premise is not
a test that pins the fix. Swap the call site to `OnDark.secondary` and assert the call site.

### T14 — `C3-05`'s remaining selected-state controls (`RL1D-21`)

`C3-05` names ~15 controls; round one fixed two (`PatinaButton .clay`, `TierPill`). Sweep the rest
that are not inside a file a sibling rewrites; the ones that are go in `D→C-11`.

### T15 — `PurchaseActionBar`'s saved pill is now identical to the Buy capsule (`RL1D-10`)

Round one's residue edit was not a pure token swap: `isSaved ? PatinaColors.clay : .clear` became
`Interactive.active`, so the saved "Add to room" pill is pixel-identical to the adjacent primary Buy
capsule — both `Interactive.active` + `Text.inverse`. Give the saved state its own treatment.

### T16 — record the residue edits rather than let them merge unowned (`RL1D-10`)

PROGRAM.md §3's residue table marks `Features/Purchase/**`, `Features/Orders/**`, `Features/Budget/**`
"No lane, no W1 work". Five files were edited there in round one at `af27eab83`. They are colour
literals and they are this lane's concern under §5's rule ("the concern decides the lane, the folder
is the tiebreaker"), but the residue row is explicit and Fable should ratify rather than discover.
The full list, with the diff of each, goes in the report under `kodyRun`/`notesToOtherLanes`.

### T17 — `RL1D-17`: `.id(colorScheme)` and the Apple nonce — **declined, with the reason**

The review's claim is that `.id(colorScheme)` discards `@State rawNonce`. It does not.
`@State` storage belongs to `PatinaSignInWithAppleButton`; `.id(…)` is applied to the **child**
`SignInWithAppleButton` inside `body`, so it changes the child's identity, not the parent's. An
appearance flip mid-authorisation rebuilds `ASAuthorizationAppleIDButton` and leaves `rawNonce`
untouched. Hoisting the state or re-keying the id would be an unrequested change against a
non-bug. Recorded here so the next reader does not re-raise it.

### T18 — the flake the steward will otherwise meet cold (`RL1D-13`)

`PatinaTests/OrderHandoffTests` and `CompanionCoachingModelTests.introGate_freshUser_pollsUntilTourResolves`
fail under parallel load and pass in isolation. Not this lane's doing — its edits to those features
are colour literals only — but round one recorded no unit tail. Reproduce, isolate, and record the
evidence in the report and in `l1d-notes-out-round3.md` so merge 2 is not a surprise.

### T19 — the notes that were never delivered (`RL1D-11`)

`grep -c 'D→A-\|D→B-\|D→C-\|D→F-'` gives `l1-a-notes.md` 7, `l1-b-notes.md` 3, `l1-c-notes.md` 14,
**`l1-f-notes.md` 0** — despite round one's T16 and its notes-out both claiming delivery. Append
`D→F-1` and `D→F-2` retroactively, then append round three's notes to every target inbox.

### T20 — gates, self-check, and an honest close-out (`RL1D-21`, `RL1D-22`)

```bash
apps/mobile/Patina/scripts/ios-gate.sh build
apps/mobile/Patina/scripts/ios-gate.sh release
apps/mobile/Patina/scripts/ios-gate.sh unit
apps/mobile/Patina/scripts/ios-gate.sh lint-delta main
```

Self-check on the clone (not a walk): launch against the local stack, sign in as
`client@patina.dev` / `password123` where needed, screenshot each changed screen before and after
into `shots/w1-l1d/`, one ledger line per shot.

Close-out honesty, per `RL1D-21`/`RL1D-22`: `A-73` and `C3-05` are reported **PARTIAL** while their
auth halves sit in L1-A's restructured files; `A-11` and `P-25` are reported **OPEN** against this
lane until L1-A's branch shows the SF Symbol swap and the AXValue change.
