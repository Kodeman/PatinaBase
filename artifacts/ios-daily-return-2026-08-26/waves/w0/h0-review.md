# H0 review — SP-01 piece-detail hotfix

**Reviewer:** H0 reviewer (adversarial, separate context from implementer)
**Target:** branch `daily-return/w0-hotfix-piece-detail`, worktree
`.codex/worktrees/agent-dr-w0-hotfix`, commit `0b7f2291d`
**Method:** `git diff main...HEAD`, `git show --stat HEAD`, file reads — read-only, no build run
(per brief).

## Verdict

**APPROVE.** No blocking findings. One evidence gap noted (no implementer report on disk to
cross-check). All checklist items in the brief hold.

## Diff summary

Single commit, three files, 60 insertions / 3 deletions:

```
apps/mobile/Patina/Patina/Core/Network/ProductAPIClient.swift          | 11 +++++++-
apps/mobile/Patina/Patina/Features/ProductDetail/Views/ProductDetailView.swift | 21 +++++++++++++--
apps/mobile/Patina/PatinaTests/ProductVendorEmbedTests.swift           | 31 ++++++++++++++++++++++
```

Commit message: `fix(ios): qualify the products→vendors embed and give the piece-detail error
state a way back` — valid Conventional Commit, pathspec-scoped (only the three files SP-01 names
are touched; no unrelated changes, no `git add -A` fingerprint).

## Checklist against SP-01 / global constraints

**1. Every unqualified `vendors(` embed is gone.**
Confirmed. `grep -rn "vendors(" apps/mobile/Patina/Patina --include="*.swift" | grep -v "vendors!"`
returns only the doc-comment line describing the bug (`... a bare \`vendors(...)\` embed is ...`),
not code. The only live occurrence, `ProductAPIClient.swift:99` (`select=*,vendors(name,made_in,
brand_story)` on main), is now `select=\(Self.productSelect)` where `productSelect =
"*,vendors!products_vendor_id_fkey(name,made_in,brand_story)"`. Verified against main (pre-fix) that
this was in fact the only unqualified embed in the client target.

*Out-of-scope note, not a finding against this diff:* `supabase/functions/catalog-normalizer/
index.ts` also does an unqualified `vendors(name` embed server-side. SP-01's "Where" section cites
only the two client files, so this is correctly out of scope for H0 — flagging only so it doesn't
get lost as a future plank/finding.

**2. Constraint name is right.**
Confirmed against `supabase/migrations/00001_initial_schema.sql:39` —
`vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL` is an inline `REFERENCES` with no
explicit `CONSTRAINT` name, so Postgres assigns the default `<table>_<column>_fkey` →
`products_vendor_id_fkey`. Matches the diff exactly. `00011_add_retailer_id.sql:6` confirmed as the
second FK (`retailer_id UUID REFERENCES vendors(id)`) that makes the bare embed ambiguous in the
first place.

**3. Back control pops correctly in the error branch given `.toolbar(.hidden, for:
.navigationBar)` on the `Group`.**
The error-branch back button (`ProductDetailView.swift:426-433`) uses the identical mechanism as
the already-shipping loaded-branch back button (`:91-93`): `@Environment(\.dismiss) private var
dismiss` (declared once, `:12`), `Button { dismiss() }`, same `floatingCircleButton(icon:
"chevron.left")`, and the *same* `.padding(.top, 56)` value the loaded view's top bar already uses
(`:136` loaded vs `:436` error — both `56`). This is a straight copy of a working pattern, not a
new mechanism, so risk of it not popping is low. Caveat: I did not build or run `ios-gate.sh` /
simulator per my read-only brief, so this is pattern-verified, not execution-verified — flag for
the walker to confirm with an actual tap on the error state (device/sim claim, not a code defect).

**4. Accessibility label + 44pt.**
Confirmed. `.accessibilityLabel("Back")` + `.accessibilityIdentifier
("ProductDetailView.ErrorBackButton")` + explicit `.frame(width: 44, height: 44)` +
`.contentShape(Rectangle())` around the 36×36 `floatingCircleButton` visual. This meets the 44pt
minimum tap target.

Minor observation, not a defect in this diff: the *loaded*-branch back button (`:91-93`) has no
such `.frame(44,44)`/`.contentShape` wrapper — it's a bare 36×36 tap target today. SP-19 (W1 P4)
owns 44pt-target repairs generally; this hotfix isn't required to retrofit the loaded button, but
it does mean the two back buttons now have different tap-target sizes. Worth a one-line note for
whoever picks up SP-19 so it isn't missed as "already done."

**5. Test is real; pins both positive and negative.**
`PatinaTests/ProductVendorEmbedTests.swift` — three `@Test` cases against the static
`ProductAPIClient.productSelect` string:
- positive: contains `"vendors!products_vendor_id_fkey("`
- negative: does not contain the bare `"vendors("`
- regression guard: still requests `"name,made_in,brand_story"`

This is exactly what SP-01 asks for ("a Swift Testing case pins the select string") — it's a static
string assertion, not a mocked-network round trip, but that matches the plank's own scope. The
negative test is not fully tautological: it would catch a future regression like a duplicated
`vendors(...)` embed appended alongside the qualified one, not just a reversion to the bare form.
No issue.

Project-file note (checked, not a defect): the new test file has no explicit entry in
`Patina.xcodeproj/project.pbxproj` — but this project uses Xcode 16 file-system-synchronized groups
(`PBXFileSystemSynchronizedRootGroup` rooted at `PatinaTests`), so a new `.swift` file under that
directory is picked up automatically. Confirmed by inspecting the pbxproj's
`fileSystemSynchronizedGroups` section.

**6. Any unrelated change in the diff?**
None. All three files are exactly the ones SP-01 names (`ProductAPIClient.swift`,
`ProductDetailView.swift`, plus the new test). The `ProductDetailView.swift` change is scoped to
`errorView` only — the `VStack` restructuring (moving `.padding(.horizontal, 32)` from the outer
`VStack` onto `PatinaErrorState` alone, `spacing: 0`) is the minimum needed to insert the back-button
row above the existing `Spacer()/PatinaErrorState/Spacer()` stack without changing its centering.
Verified the resulting layout still centers the error content between two `Spacer()`s.

**7. Conventional Commit + pathspec.**
Confirmed — see Diff summary above. One commit, correctly scoped.

**8. Anything the implementer's report claims that the diff doesn't show.**
Could not check: no implementer report or task list was found on disk under
`artifacts/ios-daily-return-2026-08-26/waves/w0/` at review time (only this review file exists,
which I just created). If the implementer's structured return to the orchestrator makes claims
beyond what's in this diff (e.g. "sim-verified"), that can't be cross-checked from the repo alone —
worth Fable/orchestrator confirming the implementer's own report text lines up with a
`ios-gate.sh all` run and a device/sim tap-through before merge, since I did not execute either.

## Findings

None blocking. Summary table:

| # | Severity | Confidence | Note |
|---|---|---|---|
| 1 | Info | High | Two back buttons (loaded vs error state) now have different tap-target sizes (44pt vs bare 36pt) — not a regression, but flag for SP-19 so it isn't assumed already fixed. |
| 2 | Info | High | `supabase/functions/catalog-normalizer/index.ts` has its own unqualified `vendors(name` embed, out of SP-01's scope but worth a future finding/plank. |
| 3 | Info | N/A | No implementer report artifact found on disk to cross-check narrated claims (e.g. sim-verified) against; recommend orchestrator confirm gate + sim tap-through before merge, since this review was read-only per brief. |

No S0/S1/S2 defects found in the diff itself. The fix is minimal, matches the plank's cited
constraint name and files exactly, reuses a proven pattern for the new back button, and ships a
real (if narrowly-scoped, as specified) regression test.
