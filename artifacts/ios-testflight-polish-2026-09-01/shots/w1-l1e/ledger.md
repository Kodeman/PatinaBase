# W1 · L1-E — self-check shot ledger

Clone `ff-w1-l1e` (`2AF6D0CA-91AB-446E-AFA3-4C126AD5827B`), signed Debug build (not the
`CODE_SIGNING_ALLOWED=NO` gate product — a separate `xcodebuild build` to
`.build/DerivedDataWalk`), launched `-DeploymentTarget local`, no `-PatinaFlags` (D1a default).
Signed in `client@patina.dev` / `password123`. HID preflight: `describe_screen` returned the full
14-element Welcome tree before any tap was trusted.

| # | file | screen | what it shows |
|---|---|---|---|
| 01 | `01-today-cold-launch.png` | Welcome (cold launch, fresh install) | Baseline — confirms a clean launch before any of this lane's fixes are exercised. |
| 02 | `02-signed-in-today.png` | Post sign-in, mid-onboarding, system "Save Password?" sheet | Confirms `client@patina.dev`/`password123` signs in; onboarding page 1 visible behind the sheet with the pre-fix `"Start Your Journey"` CTA (`C5-20` — L1-A's row, not yet applied in this worktree, as expected). |
| 03 | `03-onboarding-page1-before.png` | Onboarding page 1 | `A-06`/`C5-20` evidence, live: "Let's discover yours..." (straight apostrophe) and "Start Your Journey" — matches the deck's "today" column exactly. Not this lane's file to edit; sent to L1-A. |
| 04 | `04-style-result-before-b23.png` | Style quiz result (`StyleResultView`) | `B-23` evidence, live: "Your portrait stays on this device and can be reset in Settings." — matches the finding's evidence verbatim. Not this lane's file; sent to L1-A as a one-line note (Task A-L1E-7) with the fix's own exact replacement text. |
| 05 | `05-today-after-c5-06.png` | Today (four-tab `house-first` root, no `-PatinaFlags`) | **`C5-06`, this lane's own fix, confirmed live.** Headline reads **"Good evening"** — no terminal period, correct window for the real device clock (~18:47 local, inside the 18:00–20:59 evening band) — exactly `TimeOfDay.swift`'s new `.evening` case. The four-tab bar (Today · Spaces · Pieces · Studio) is present with no `-PatinaFlags` argument, confirming D1a's fresh-install default independently of this lane's own work. No crash, no layout regression from the `TimeOfDay.swift` change. |

## Fix round — 2026-09-02, after the adversarial review (`RL1E-01`…`RL1E-22`)

Same clone, same launch line (`-DeploymentTarget local`, **no** `-PatinaFlags`), guest path
("Look around first" → tour skipped). HID preflight: `describe_screen` returned the full element tree
at every step before a tap was trusted; two taps were re-issued after the first landed on the tour
overlay.

| # | file | screen | what it shows |
|---|---|---|---|
| 06 | `06-fixround-today-launch.png` | Welcome (cold launch, this branch) | Baseline for the fix round. The Google row is still present — `D3`/`A3-06` removes it, and that is L1-A's branch, not merged here. Confirms the fix-round build launches clean. |
| 07 | `07-fixround-saved-pieces-empty-after-c5-09.png` | Pieces → **Saved** → All items (empty) | **`C5-09`, this lane's own fix-round row, confirmed live.** The empty state reads **"No saved pieces yet"** — `CollectionsView.swift:151`, the site the deck's revision 1 missed. The tab above it already reads "All items" (sentence case), so `CollectionsView`'s own tab needed nothing; `CrossRoomView`'s two `"All Items"` are a different screen and are L1-B's row. |

Also visible in shot 06's follow-on tour capture: the Today headline reads **"Good evening"** at 22:06
local — inside the new `.night → "Good evening"` band, which is `RL1E-21`'s recorded consequence
observed rather than reasoned about. The four-tab bar (Today · Spaces · Pieces · Studio) is present
with no `-PatinaFlags`, confirming D1a again.

**`RL1E-15` is cited, not re-observed.** The flags-off greeting wrap ("Good / evening" over two lines
on the kill-switch root) was measured by the reviewer, whose shot is
`shots/w1-review-l1e/12-flags-off-root.png`. Re-observing it needs `-PatinaFlags ""`, which W1's hard
rule 11 forbids, so the note to L1-C cites the reviewer's evidence rather than a launch this lane was
told not to make.

**Not captured, and why.** `C4-08` (AR save-toast), `C4-09`/`C5-11` (design-request send-screen error
line) need a forced failure (no scans, a network cut, or a request that violates the RPC's guards) to
reach the code paths this lane changed; time budget did not extend to staging that failure live. Closed
instead by `PatinaTests/ARPlacementFailureCopyTests.swift` and `PatinaTests/ErrorVoiceTests.swift`
(construct the typed errors directly and assert the rendered sentence — see the gate run) and by
reading the call sites: `ARPlacementView.swift`'s toast and `DesignRequestFlowView+Steps.swift`'s error
line both render exactly the string the view model/service now produces, with no other transform in
between. `PLAUSIBLE`, not `CONFIRMED` on a device, for these two rows specifically.
