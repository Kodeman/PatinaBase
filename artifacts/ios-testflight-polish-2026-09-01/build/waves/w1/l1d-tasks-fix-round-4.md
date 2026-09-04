# W1 · L1-D — fix round 4 task list

Lane: **L1-D — Tokens, dark mode, contrast, iconography**.
Branch: `first-flight/w1-l1d`. Worktree: `.codex/worktrees/agent-ff-w1-l1d`
(`git rev-parse --show-toplevel` verified before the first write).

**The brief this round carries is one round stale.** It hands back the
`RL1D-01`…`RL1D-22` review — the review of *round one* — together with round
one's nine-commit report. Rounds two and three already ran against that review
(`l1d-tasks.md`, `l1d-tasks-fix-round-3.md`) and are on the branch as
`581ac0a2e`…`2debcfc11`. So T1 of this round is not "fix them" but **"measure
whether they are fixed"**, one grep per finding, and only then work what
survives.

What survived is one thing, and it is not in the review at all: `E4-L1D-1`, a
note L1-E appended to `l1-d-notes.md` at 01:01 on 2026-09-03 — after this lane's
last commit — about a merge conflict this branch creates.

---

## The four standing lines

### 1. Simulator

```bash
export IOS_GATE_UDID=FF762E1A-F261-4C23-AFB9-CDDEE9B82B8D
```

One clone, never shared, never `booted`. Launch arguments on every relaunch:
`-DeploymentTarget local`. No `-PatinaFlags` — `house-first` is default-on since
W0. HID preflight before any input is trusted.

### 2. VISION check

Nothing this round adds tab, zone or dashboard UI beyond D1's ruling; no
shadow, no red/green status colour, no badge, no engagement optimisation, and
the word AI appears nowhere. The round's only change **deletes** eight markdown
files from a git tree. It touches no Swift, no pixel and no string.

### 3. The notes this round must apply

Every note addressed to L1-D in `build/waves/w1/l1-d-notes.md`, checked against
the branch:

| note | status entering this round |
|---|---|
| `D-L1E-1` — `PatinaEmptyState`'s `#Preview` default | applied (round 1) |
| `D-L1C-1` — `GAP4-16`, the two `RevealView` lines | applied (round 1) |
| `D-L1C-2` — `GAP1B-07`, the global `.ghost` floor | applied (round 1) |
| `D-L1A-1` — `C3-03`, Apple button in dark mode | applied (round 1) |
| `D-L1A-2` / `D-L1A-3` — Google mark, `AuthButton` call sites | informational |
| `L1F→D-1` — `A-63`, `PatinaButton` horizontal padding | applied (round 1) |
| `L1F→D-2` — reply on `D→F-1`, four `pearl` sites are a rebase-time apply | acknowledged |
| `D-L1E-2` — `stillChoosingPieces` ratified as written | no change asked |
| `D-L1A-4` / `-5` / `-6` | applied / acknowledged (round 3) |
| L1-C fix round — `RoomTypePillRow.swift` is still a `C3-05` + `C3-01` site | **cannot apply — L1-C's file, L1-C merges first; steward item at merge 2** |
| **`E4-L1D-1`** — this branch freezes five other lanes' paperwork | **OPEN → T2** |

### 4. The notes this round sends

Written to `l1d-notes-out-round5.md` and appended to each target inbox in the
main checkout with the same text:

- **`D5→E-1`** to L1-E — `E4-L1D-1` applied, and two files beyond the six it
  named went with them, with the measurement that justified each.
- **`D5→Steward-1`** — the six-file conflict set at merge 2, measured today, with
  the resolution rule per file.

---

## Coverage — every review finding, and how it stands on the branch today

`RL1D-*` is the round-one review the brief re-sent. Each row is a command run on
`first-flight/w1-l1d` at `2debcfc11`, not a recollection.

| id | sev | measurement | verdict |
|---|---|---|---|
| `RL1D-01` | blocker | `grep -rn 'PatinaColors\.pearl' … \| grep -v Tokens/PatinaColors.swift \| wc -l` → **1**, and that one is `PatinaGradients.swift:30`, a gradient *stop*, not a border. `.font(.custom(` in `Features/` + `Design/` → **1**, inside a comment in `RoomSettingsView.swift:44` that names the pattern. `compactFormatterCeiling` → **0**. | closed (round 2) |
| `RL1D-02` | blocker | `stillChoosingPieces` now has a product call site: `RecommendationsView.swift:271`. | closed (round 2) |
| `RL1D-03` | major | `patinaChromeScrim` at `ProductCard.swift:165` **and** `RecommendationsView.swift:407`; `PatinaAsyncImage(` at `ProductDetailView.swift:311` and 13 more. | closed (rounds 2–3) |
| `RL1D-04` | major | `PatinaTabBar.swift:68` is `Rectangle().fill(PatinaColors.Border.hairline)`. | closed (round 2) |
| `RL1D-05` | major | `CompanionHearthView.swift` subtitle is `PatinaColors.OnDark.secondary`. | closed (round 2) |
| `RL1D-06` | major | `DailyStoryDetailView.swift` takes `PatinaColors.charcoal` under a comment that now explains *why* it is the literal and not `Background.dark`. | closed (round 2) |
| `RL1D-07` | major | `companionGlassCircle()` tints with `PatinaColors.Background.dark.opacity(0.7)` on both the iOS 26 and the fallback branch. | closed (round 2) |
| `RL1D-08` / `-19` | major | `RevealView`'s hero is `PatinaTypography.display2Regular` — Regular, the weight the finding offered — with the per-glyph overflow guard. | closed (round 2) |
| `RL1D-09` | major | `PatinaColors.Text.error` exists (`errorDeep` light / `DarkPalette.textError` dark) and the ink sites take it. | closed (rounds 2–3) |
| `RL1D-10` | major | residue edits ratified in `l1d-notes-out-round4.md` §"the residue ratification package", group by group, with the diff shape of each. | closed (round 3) |
| `RL1D-11` | minor | `grep -c 'D→…'`: `l1-a-notes.md` 17, `l1-b-notes.md` 5, `l1-c-notes.md` 19, `l1-e-notes.md` 2, **`l1-f-notes.md` 6**. | closed (round 3) |
| `RL1D-12` | minor | `compactFormatterCeiling = 0`. | closed (round 3) |
| `RL1D-13` | minor | flake recorded in `7f5b555a9` with three runs of evidence. | closed (round 2) |
| `RL1D-14` | minor | `PatinaTextField`'s resting outline is `Border.strong`, with the comment that says what it was. | closed (round 2) |
| `RL1D-15` | minor | `claim(rowValue:body:)` returns `Int?` and is `nil` for a bodyless row. | closed (round 2) |
| `RL1D-16` | minor | the loading tile's dead `.accessibilityLabel` is gone. | closed (round 2) |
| `RL1D-17` | minor | declined in round 2 with the reason written into `l1d-tasks.md` T17. | declined, in writing |
| `RL1D-18` | minor | `ProductCard`'s price is `PatinaTypography.captionSerif` — a serif caption token, which is what the finding asked for. | closed (round 2) |
| `RL1D-20` | minor | `filledCases` excludes `.secondary`, and `secondaryButtonLabelHoldsOnEveryGround()` measures it against **both** grounds. | closed (round 2) |
| `RL1D-21` / `-22` | minor | `A-73` and `C3-05` reported PARTIAL, `A-11` and `P-25` reported OPEN, in `l1d-tasks.md` T20. | closed (round 2) |

**Nothing in the re-sent review is open.** The round's work is T2 and T3.

---

## T2 — `E4-L1D-1`: this branch turns a code merge into a paperwork merge

**Measure first.** The claim is a merge fact, so the test is a merge:

```bash
for b in first-flight/w1-l1{a,b,c,e,f}; do
  git merge-tree --write-tree HEAD $b >/dev/null 2>&1 || echo "$b conflicts"
done
```

Before: `first-flight/w1-l1e` reports

```
CONFLICT (add/add): Merge conflict in
  artifacts/ios-testflight-polish-2026-09-01/build/waves/w1/l1-e-copy-deck.md
```

because `771016eaf` committed a 153-line **revision 1** of that deck while L1-E's
branch carries revision 4 (516 lines as of today).

**Implement.** Untrack the eight paperwork files this lane does not author. Six
are the ones `E4-L1D-1` names; two are not, and each has its own measurement:

| file | why it goes |
|---|---|
| `l1-a-notes.md`, `l1-b-notes.md`, `l1-c-notes.md`, `l1-e-notes.md`, `l1-f-notes.md` | the five sibling inboxes `E4-L1D-1` names |
| `l1-e-copy-deck.md` | the add/add conflict itself |
| `steward.md` | **not named by the note.** Frozen at 1321 lines; the live copy is 1635. Merging this branch into the main checkout would either refuse (untracked file differs) or replace the steward's own record with a snapshot 314 lines behind it. |
| `l1-d-notes.md` | **not named by the note.** This lane's inbox, but authored by every other lane. The frozen copy predates `E4-L1D-1` itself — it is missing the note this task answers. |

What stays: `l1d-tasks*.md`, `l1d-notes-out*.md`, `shots/w1-l1d/`,
`shots/w1-l1d-r4/`. All six paperwork files this lane wrote were checksummed
against the live main-checkout copies and are byte-identical, so they add no
hazard of their own.

**Re-run.** All five pairwise merges again; the `l1-e-copy-deck.md` add/add must
be gone.

**Commit.** `git rm --cached` then `rm` in the worktree, then a pathspec commit
naming all eight paths. The content is not lost: it lives in the main checkout
and on each owning lane's branch.

---

## T3 — the merge-2 conflict set, measured rather than assumed

`l1d-notes-out-round4.md` recorded, on 2026-09-02, that the app-code half of this
branch merged clean against every sibling. **That is no longer true**, because the
sibling branches have had fix rounds since. Re-measure and hand the steward the
current set rather than let merge 2 discover it.

Under **D14** the order is L1-C → **L1-D** → L1-B → L1-F → L1-A → L1-E, so only
the L1-C set is this lane's to resolve; the rest belong to lanes that merge after
it. No code change — the deliverable is the table in `D5→Steward-1`.

---

## T4 — the gates

```bash
export IOS_GATE_UDID=FF762E1A-F261-4C23-AFB9-CDDEE9B82B8D
apps/mobile/Patina/scripts/ios-gate.sh build
apps/mobile/Patina/scripts/ios-gate.sh release
apps/mobile/Patina/scripts/ios-gate.sh unit
apps/mobile/Patina/scripts/ios-gate.sh lint-delta main
```

The round changes no Swift, so a green tier is a *regression* check, not a proof
of new behaviour, and the report says so.

---

## T5 — self-check, and the honest limit on it

The round's diff is `git rm` of eight markdown files. There is no screen to shoot
before and after: no view, no token, no string changed. The self-check is
therefore a **launch and a no-regression pass** on the screens rounds two and
three did change, against the same clone, into `shots/w1-l1d/` with a ledger line
each — not a fresh before/after pair, and the ledger says which it is.

---

## T6 — the copy deck

`build/waves/w1/l1-e-copy-deck.md` exists, and its newest revision is **4**, on
`first-flight/w1-l1e` (the main-checkout copy is still revision 1). Its
`### L1-D applies` block carries three rows; each is checked against the branch
in `l1d-notes-out-round5.md` §"the deck rows". `C5-06`'s `TimeOfDay.swift` row
sits under L1-E's own block and is **already applied on L1-E's branch** — this
lane must not duplicate it, or merge 6 gets a conflict it did not need.
