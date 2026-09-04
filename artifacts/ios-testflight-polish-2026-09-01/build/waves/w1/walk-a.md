# W1 · walk A — acceptance walk on the integration build

**Walker A**, 2026-09-03, on `ff-w1-walk-a` `4D075B9D-6CD6-4878-8E93-3B2AF8932067`.
Build: the steward's signed Debug product at
`.codex/worktrees/agent-ff-w1-integration/apps/mobile/Patina/.build/DerivedData/Build/Products/Debug-iphonesimulator/Patina.app`,
integration tip **`d65c9b47ba2c9a1ece9b86050821ea88b36b86fd`**.
Every launch `xcrun simctl launch <udid> cloud.patina.app -DeploymentTarget local` — **no `-PatinaFlags`**.
Shots and ledger: `shots/w1-walk-a/`.

Scope: the "closed" rows of `l1a-tasks.md`'s coverage tables (the 27 L1-A findings), plus the
review rows the fix rounds closed, walked as the fresh-install script the brief names.

---

## 0. Two environment facts that come before any verdict

### 0.1 The local API gateway was dead when this walk started — I repaired it

`supabase_kong_supabase` was **`Exited (127)`**. `curl http://127.0.0.1:54321/auth/v1/settings`
returned nothing (`%{http_code}` = `000`) while `:54322` (Postgres) was up and every other
container was healthy. `docker start` failed:

```
error mounting "/host_mnt/Users/kody/Code/patina-merged/.codex/worktrees/agent-tester-notes/supabase/templates/confirmation.html"
to rootfs at "/home/kong/templates/email/confirmation.html": not a directory
```

Kong had been created by a **retired peer worktree** (`agent-tester-notes`), and when that
worktree's files were deleted Docker recreated the six mount points as empty **directories**.
I replaced the six with the real files from the integration worktree's `supabase/templates/`
and started the container; `/auth/v1/settings` then answered `200`.

**Why this matters to the wave.** `-DeploymentTarget local` points the app at `:54321`. With
kong down, the Welcome screen still renders perfectly — the provider catalog falls back and
`RL1A-06`'s `target == .local` clause puts Apple in regardless. **A walker could complete a
"successful" Welcome pass against a dead backend and never know.** If walkers B and C started
before 15:15 CDT today, their network-dependent rows need re-running.

`GET /auth/v1/settings` on the repaired stack: `"apple": false`, `"google": false`, `"email": true`.
So the Apple row on Welcome is `RL1A-06`'s local clause, not a GoTrue answer — worth knowing
before anyone reads the Welcome shot as proof that the catalog reflects the server.

### 0.2 The three walkers share one database and one account — I watched it contaminate my screen

Mid-walk, signed in as `client@patina.dev`, my Today rail showed **"Walk B Test Room. 120 sq ft"**
where shot 16 had shown Guest Bedroom / Dining Room / Living Room.

```
select r.name, r.created_at from public.rooms r
  join auth.users u on u.id = r.user_id where u.email='client@patina.dev';

Walk B Test Room|2026-09-03 20:23:59.615512+00
Guest Bedroom   |2026-09-03 20:00:43.215171+00
```

Filed as **`W1-A-02`**. Every room-count, roster, badge-count and "your house" observation any
W1 walker makes this wave is unreliable, for the same reason Hard Rule 1 bans a shared clone.

---

## 1. Walk-verified PASS

Each row was seen on glass on this build, with the shot named.

| id | verdict | evidence |
|---|---|---|
| `A3-06` blocker | **PASS** | Welcome renders **Apple + email only**. No Google button, no Google row in the tree — `auth.welcome.appleButton`, `auth.welcome.emailButton`, `auth.welcome.guestButton`, `auth.welcome.passwordButton` and the two legal links are the whole stack. Shot 01 |
| `P-29` blocker | **PASS, both halves** | (a) A sheet error does **not** reach the root: after a failed code I cancelled and the root carried no banner — and every control sat at its cold-launch y to the third decimal (`appleButton` 352.333, `emailButton` 413.583, `guestButton` 518.25, `passwordButton` 585, links 756). Shot 08. (b) A **root-scoped** error (Apple) renders in a *reserved* slot at y=309.17 between subtitle and Apple button, and those same five y values are unchanged — the 33 pt shift is gone. Shot 11 |
| `A-03` | **PASS** | Two buttons, two native idioms: the system Apple mark, an SF Symbol envelope. No emoji, no bitmap G |
| `P-02` | **PASS** | The envelope is an SF Symbol, and the accessibility labels carry no glyph — `AXLabel` is exactly `"Continue with email"` / `"Sign in with Apple"`. Shot 01 |
| `C1-30` | **PASS** | Terms and Privacy are separate links resolving to different pages |
| `C5-04` | **PASS** | Privacy Policy loads a real page: "LEGAL · **Privacy Policy** · Last updated: August 11, 2026". Shot 09 |
| `C3-06` | **PASS** | Disabled = desaturated grey fill; enabled = charcoal fill with off-white label. The inverted affordance (accent-when-disabled) is gone. Shots 02 → 04 |
| `P-20` | **PASS** | `not-an-email` raised `auth.form.emailValidation` — "That doesn’t look like an email address yet." — **and** `auth.form.primaryButton` stayed `enabled: false`. Both halves of the fix. Shot 03 |
| `P-22` | **PASS** | One status region: `auth.form.statusBanner` ("We emailed you a 6-digit sign-in code") was **replaced by** `auth.form.errorBanner` — never both in the tree at once. `auth.otp.verifyButton` stayed at y=747.7, inside the 874 pt viewport. Shots 05 → 06 |
| `C1-37` | **PASS** | Verification fired on the **sixth digit** — I never tapped Verify — and the success banner was gone the moment the error landed. Shot 06 |
| `P-30` | **PASS** | One name end to end: "Continue with email" → "Email me a code" → "Enter your sign-in code" → field label "Sign-in code". **"Magic link" appears nowhere**, including the password sheet's switcher, which reads "Forgot password? · Email me a code". Shots 02, 05, 12 |
| `C9-08` (code-field half) | **PASS** | The numeric pad carries a Done toolbar (`Toolbar` group at y=792) and tapping Done removes it from the tree. Shots 06 → 07 |
| `A-05` | **PASS** | Skip **skips**: from onboarding page 1 it landed on the push primer, not the 5-question quiz. Its hint says so too — `help: "Skips the introduction and the style questions."` Shots 14 → 15 |
| `P-18` (onboarding half) | **PASS** | `Onboarding.SignInButton` — "I already have an account — Sign in" — is on the onboarding page. Shot 14 |
| `RL1A-11` | **PASS** | Sheet headers are sentence case: "Continue with email", "Sign in", "Enter your sign-in code" |
| `P-25` | **PASS** | The code field announces `AXLabel: "Sign-in code"` / `AXValue: "Empty"` — no phantom code |
| `RL1A-18` | **PASS** | The root Apple error did not appear inside the password sheet opened straight afterwards — the scopes are separate |
| `C5-10`, `C5-09` (L1-E deck) | **PASS** | "Sign up" (not "Sign Up"), "Retake your style quiz", `"Saved pieces: 0"` |
| **D1a** | **PASS** | Launched with **no `-PatinaFlags`** and the four-tab bar is there: Today · Your Spaces · Browse pieces · Your Studio (+ Companion). Shot 16 |
| `B-21` | **PARTIAL PASS** | Terminate + relaunch as a signed-in account lands straight on Today — no intro, no quiz. Shot 18. The *fresh-install* half is unproven; see §3 |

## 2. Walk-verified FAIL

**None.** No row in scope was observed still behaving as its finding described.

## 3. In scope but NOT walk-verified — with the reason

| id | why | best evidence I do have |
|---|---|---|
| `C1-05`, `RL1A-02`, `RL1A-21` | In-flight state was unobservable. The repaired local stack answers OTP requests in **under 120 ms**, so the spinner never survived a `describe_after` delay; and the Apple row — the one `AuthProviderRow.isBusy` actually drives — is intercepted by the simulator's own **"Sign in to your Apple Account"** system alert before any app work starts. Shot 10 | none on glass |
| `A-101` | Settings is unreachable (§4) | **Code-verified, and mostly closed.** `AccountDeletionService.swift:55-58` now reads: "This deletes your Patina account, including your saved rooms, pieces, and messages. Any project you completed with a designer stays in our records — with your name and contact details removed — as required for our legal and accounting obligations. This can’t be undone." That fixes the device-only scoping. It does **not** say *for how long*, which the finding's fix line asked for — filed as `W1-A-07` |
| `B-12`, `C1-14` | Settings unreachable | Code-verified: `AccountView.swift:132-135` `PatinaButton("Sign in or create your account")` → `coordinator.presentedSheet = .auth`, id `AccountView.SignInButton`; `SettingsView.swift:95-99` the same, id `SettingsView.SignInButton` |
| `B-13` | L1-C's file; note-only for L1-A, and the guest Studio was not reached | — |
| `A3-16` | No allow-listed local account exists | I probed the server leg directly: `POST http://127.0.0.1:54321/functions/v1/test-account-login` with `{"email":"client@patina.dev","code":"000000"}` → **403 `{"error":"invalid_credentials"}`**. The function is served locally and **fails closed**, which is the contract T8 names. A *successful* redemption is unproven |
| `A3-07` | Sign in with Apple cannot complete on a simulator with no Apple Account | — |
| `A-21`, `A-13`, `C1-04`, `C1-28` | The quiz was never entered: Skip correctly skipped it (which is `A-05` passing), and the "Retake your style quiz" door sits below the unreachable scroll | — |
| `C9-08` (the other five fields) | The four L1-B screens were not reached | Code-verified: `.keyboardDoneToolbar()` is present at `ScanFallbackEntryView:189`, `ManualRoomEntryView:71,152`, `RoomSettingsView:202`, `RoomBudgetSheet:62` — the five sites integration §3 says `B-L1A-2` closed |
| Dynamic Type — **code sheet** | Reaching it needs taps, and HID died (`W1-A-03`) | — |
| Dynamic Type — **Welcome** | **Done.** See below |

### Dynamic Type on Welcome — done, with one finding

`xcrun simctl ui <udid> content_size accessibility-extra-large`, relaunched, shot 21. Restored to
`large` afterwards and read back (`xcrun simctl ui <udid> content_size` → `large`), shot 22.

Good: nothing clips or truncates mid-word; "Continue with email" wraps to two lines *inside* its
button; "Have a password? Sign in" wraps rather than shrinking. The screen is a ScrollView
(`P-34` item 1), so the legal footer that falls below the fold should be reachable — I could not
scroll to confirm it.

**The Apple button's label does not scale** while every neighbour does, so at AX-XL it is visibly
the smallest text on the screen. That is the fixed-height Apple button the L1-A notes routed to
L1-D as `D-L1A-1`, now observable. Filed as `W1-A-05`.

## 4. Two harness failures that cost coverage

**The Studio hub will not scroll under synthetic input.** Settings sits at y≈2200 in a 874 pt
viewport. Six gesture variants — flick, slow drag, `delta` 640 / 10, duration 40/150/300/800, and
eight Page Down key presses — moved the content **10–50 pt each**. Total travel across all
attempts: ~70 pt. Stopped per Hard Rule 10. This is why `A-101`, `B-12`, `C1-14` and the
sign-out-and-back-in half of `B-21` are code-verified rather than walked. I did **not** file it as
a product defect: a finger scrolls this fine, and I have no evidence it affects a human.

**Synthetic HID died on this clone and did not come back** (`W1-A-03`). It worked for the whole
first half of the walk (shots 01–18). It stopped immediately after the fresh-install sequence
`terminate → uninstall → keychain reset → install`. After that, taps, the HOME button and
`describe_screen` were all dead while `simctl io screenshot` kept returning correct frames.
Recovery attempts, in order, all failed: relaunch; terminate + relaunch; `shutdown` + `boot` +
relaunch (a real Simulator.app window was confirmed present via System Events); and a full
`erase` + `boot` + keychain reset + install + relaunch. `mcp__blitz-iphone__setup_device` is
physical-device only. Stopped there.

---

## 5. New defects

| id | sev | where | what | fix | lane | relatedTo |
|---|---|---|---|---|---|---|
| **W1-A-01** | minor | `Patina/Features/Notifications/Views/PushPrimerView.swift:25` | The push primer ships a **straight apostrophe** (U+0027) — `We'll tell you…`, bytes `57 65 27 6c 6c` — where the app and the deck's `A-06` rule use U+2019. It is not an oversight: `PatinaTests/PushTokenServiceTests.swift:190-196` **pins it verbatim**, its comment citing ruling Q7 in `source/rulings-2026-08-27.md` as naming "a STRAIGHT apostrophe (U+0027)… the ruling's, not the app's usual typographic apostrophe". Two rules in direct conflict, one of them enforced by a green test. Shot 15 | Decide which rule wins. If `A-06` does, change the literal to `We’ll` and update `primerCopyIsVerbatim` in the same commit, noting that Q7's glyph is superseded | L1-E | `A-06` |
| **W1-A-02** | major | the shared local stack | All three W1 walkers drive one Supabase at `127.0.0.1:54321` **and one `client@patina.dev` account**. Another walker's "Walk B Test Room" (created 20:23:59Z) appeared in my signed-in house mid-walk, displacing the fixture rooms I had screenshotted 23 minutes earlier | Give each walker its own account for the wave, or serialise the signed-in legs. Until then, treat every W1 room/count/roster observation as unreliable | steward | Hard Rule 1 |
| **W1-A-03** | major | walker clone `4D075B9D…` | Synthetic HID dies after `uninstall` + `keychain reset` + `install` and survives no documented recovery — not relaunch, not `shutdown`+`boot`, not `erase`+`boot`+reinstall. Screenshots stay healthy throughout, so the failure is silent: the screen looks right while nothing lands. `describe_screen` degraded too (full tree at shot 19, then a single empty node) | Before trusting any walk leg, re-run the HID preflight *after* every fresh-install sequence, not only at session start. A walker that reinstalls mid-walk must re-preflight or its remaining rows are unproven | steward | `RL3A-15`, Hard Rule 8 |
| **W1-A-04** | minor | `AuthScreenView.termsLink` / `.privacyLink` | Both legal links open the **system Safari app**, ejecting the person from Patina mid-sign-up (the status bar shows a "◀ Patina" breadcrumb back). A tester reading the terms before creating an account leaves the app to do it | Present them in an `SFSafariViewController` sheet so the reader stays inside the sign-up | L1-A | `C1-30`, `C5-04` |
| **W1-A-05** | minor | Welcome, `accessibility-extra-large` | Every control's label scales except **Sign in with Apple**, whose system button holds a fixed height and type size. At AX-XL it is the smallest text on the screen, directly above a two-line "Continue with email" | This is `D-L1A-1`, already routed to L1-D with `C3-03` and not yet applied on this tip. Give the Apple button a Dynamic-Type-aware height | L1-D | `C3-03`, `D-L1A-1` |
| **W1-A-06** | minor | the OTP error path | A plainly **wrong** code (`999999`, entered seconds after the real one was issued) reports "**That sign-in code has expired.** Send yourself a new one." GoTrue conflates wrong and expired in one error, and the app takes the expiry branch, so the sentence tells the person something false and sends them to Resend instead of to re-reading their code. Shot 06 | Use a wording that covers both without asserting expiry — e.g. "That code didn’t work. Check it, or send yourself a new one." | L1-A | `C1-37`, `P-22` |
| **W1-A-07** | minor | `AccountDeletionService.swift:55-58` | `A-101`'s copy now names the account, names what is retained and why, and says it can't be undone — but it does not say **for how long**, which the finding's own fix line asked for ("name what is retained… and for how long") | Add the retention period to the retained-records clause | L1-E | `A-101` |
| **W1-A-08** | major | local dev, all walkers | The local kong gateway was down for the whole start of this session, mounting six email templates from a **deleted worktree** that Docker had replaced with empty directories (`Exited (127)`). Every `-DeploymentTarget local` app call was failing, and the Welcome screen renders identically either way — so the failure is invisible to a walker. Repaired in §0.1 | Have the wave's first walker probe `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:54321/auth/v1/settings` and refuse to start on anything but `200`. Recreate kong from the *current* worktree after any worktree retirement | steward | §0.1 |

---

## 6. Bottom line

Of the 27 L1-A rows, **19 were walked and every one passed**; none failed. The three blockers are
the strongest results: `A3-06` (Google is gone), `P-29` (measured to the third decimal — a root
error now costs zero layout shift, and a sheet error never reaches the root) and, in source,
`A-101`. The remaining eight rows are unproven here, and the reasons are environmental rather than
product: a dead HID path, an unscrollable hub under synthetic input, no Apple Account on the
simulator, and no allow-listed test-login pair locally.

Nothing on this walk touched production. The only database written to was `127.0.0.1:54322`, and
the only writes were the app's own sign-in.

---

# Re-walk 1 — 2026-09-03 18:00–18:20 CDT

Scope: the eight defects this walk filed. Five of them the fixer says it closed
(`W1-A-01`, `-04`, `-05`, `-06`, `-07`); three are steward items it did not touch
(`W1-A-02`, `-03`, `-08`). My first walk recorded **no FAIL rows**, so there is
nothing else to re-run.

The other three fix commits on this tip touch Decisions, the Help tour, Proposals,
the Home header and screen chrome (`git show --stat 2b4270d5c 440a312ea 72744cbd8`) —
none of them is an L1-A/L1-E auth or onboarding surface, so nothing there enters my scope.

## R1.0 Build provenance — this is the fixed tip, and the device is running it

```
git -C .codex/worktrees/agent-ff-w1-integration rev-parse HEAD
  1e9372fb27d23597ad1a6a176aa5d4f9f794b954     ← the fixer's tip
git status --porcelain                          ← empty (clean tree)
branch                                          first-flight/w1-integration
```

Built product and installed bundle are the same bytes, built two minutes before the walk:

```
e8ccf2c2…aef131  <worktree>/…/Debug-iphonesimulator/Patina.app/Patina
e8ccf2c2…aef131  …/Devices/4D075B9D…/…/Patina.app/Patina        (3 Sep 17:56)
```

The app code lives in `Patina.debug.dylib`, so the copy checks below grep that. Note
`strings(1)` breaks a literal at the first non-ASCII byte, which is why a sentence
containing `’` (U+2019, `e2 80 99`) needs `LC_ALL=C grep -a -F` on the raw file.

Gateway probe before starting, per the rule this walk's `W1-A-08` asked for:

```
curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:54321/auth/v1/settings → 200
supabase_kong_supabase   Up 2 hours (healthy)
```

## R1.1 The harness failed again, and it decided what could be walked

`W1-A-03` recurred, and this round it is characterised much more sharply than last time.

**The read path is healthy; every write is a silent no-op.** `describe_screen` returns a
full, correct tree (13 nodes, real identifiers and frames), and `simctl io screenshot`
returns correct frames. Every HID call returns a cheerful success string and changes
nothing:

| attempt | call | result |
|---|---|---|
| tap Privacy Policy `(264, 778)` | `"Tapped at (264, 778)"` | screen unchanged (shot 24) |
| tap Continue with email `(201, 439)` — a control whose effect is unmissable | `"Tapped at (201, 439)"` | screen unchanged (shot 25) |
| same tap after focusing the device window | `"Tapped at (201, 439)"` | screen unchanged (shot 26) |
| same tap with `duration: 0.12`, after `blitz launch_app` | `"Tapped at (201, 439)"` | frame **byte-identical** to baseline (`cmp -s` → identical) |
| **HOME button** | `"Pressed HOME button"` | still on Welcome — so it is not the app swallowing touches |
| `device_actions` (batch transport) | `"Tapped at (201, 439)"` | `cmp -s` → identical |
| after `simctl shutdown` + `boot` + relaunch of my device only | `"Tapped at (201, 439)"` | `cmp -s` → identical |

Recovery attempts that all failed: focusing the device (`open -a Simulator --args
-CurrentDeviceUDID`), restarting Simulator.app, a full device reboot, and re-launching
through blitz rather than `simctl`.

**The likely mechanism, which is new evidence.** `get_execution_context` returns
`target: "ambiguous"` — **nine simulators are booted at once** (the three walkers, five
lane sims, and one spare). Worse, every one of those simulators is *also* enumerated in
blitz's `physical_devices` list, mine included:

```
{ "udid": "4D075B9D-6CD6-4878-8E93-3B2AF8932067", "name": "ff-w1-walk-a",
  "model": "iPhone 17 Pro", "connectionType": "usb", "paired": true,
  "wdaInstalled": false, "wdaRunning": false }
```

A simulator is not a USB device and has no WebDriverAgent. If `device_action` resolves a
udid against that list first, it drives a WDA that was never installed and reports success
regardless — which is exactly the observed signature: reads fine, writes vanish, no error.
`setup_device`, the tool that would install WDA, is documented physical-device-only.

Also note **Simulator.app has zero windows** (`System Events` → `NO WINDOWS`) and will not
quit on request: every device was booted headless.

This is why the three copy rows below are verified in the shipped binary rather than on
glass. I stopped after the seventh recovery attempt per Hard Rule 10.

## R1.2 Verdicts

| id | verdict | evidence |
|---|---|---|
| **`W1-A-05`** Apple button ignores Dynamic Type | **PASS — walked** | `simctl ui … content_size accessibility-extra-large`, relaunch. `auth.welcome.appleButton` frame height is now **84** at AX-XL, and its neighbour `auth.welcome.emailButton` is **81.5**. The pre-fix code pinned the frame at `minHeight: 50, maxHeight: 50` regardless of text size — which is what my first walk saw as a label that would not scale — and on this same tip at `large` the button still measures exactly **50**, so the 84 is Dynamic Type doing the work and not a constant swap. The Apple label is no longer the smallest text on the screen — it matches the button under it to within 2.5 pt. Shot 27. Content size restored and read back: `large`. Binary carries `PatinaSignInWithAppleButton.scaledHeight : CGFloat` |
| **`W1-A-04`** legal links eject to system Safari | **PASS on structure — the tap-proof is blocked** | Both links changed idiom in the tree: `auth.welcome.termsLink` and `auth.welcome.privacyLink` are now `"type": "Button", "role": "AXButton"`, not links (shot 23). The binary carries `AuthScreenView.legalPage : SwiftUI.State<IdentifiableURL?>` — the in-app sheet's state — and `SafariView` symbols. What I **cannot** claim is the on-glass half: no tap lands, so I never saw the sheet open, and the fact that no MobileSafari process appeared proves nothing when no tap landed either |
| **`W1-A-01`** straight apostrophe in the push primer | **PASS in the shipped binary — not on glass** | `We’ll tell you when your designer sends` (U+2019) **PRESENT**; `We'll tell you when your designer sends` (U+0027) **ABSENT**. Reaching the primer needs Skip on onboarding page 1 — a tap |
| **`W1-A-06`** wrong code reported as expired | **PASS in the shipped binary — not on glass** | `That code didn’t work. Check it, or send yourself a new one.` **PRESENT**; `That sign-in code has expired` **ABSENT** — both call sites (`AuthVerificationFailure` and `.otpExpired`) now return the one sentence. Walking it needs typing an email and six digits |
| **`W1-A-07`** deletion copy omits duration | **PASS in the shipped binary — not on glass** | `our records indefinitely` **PRESENT**. Settings was already unreachable under synthetic scroll on the first walk (§4); with HID dead it is doubly so |
| **`W1-A-02`** shared stack + shared account | **STILL OPEN** — not a fixer item | Untouched by this round. My clone is signed out after the erase, so I saw no fresh contamination, which is absence of evidence, not evidence of absence |
| **`W1-A-03`** HID dies on this clone | **STILL OPEN, and worse than filed** | Recurred; survives device reboot, Simulator restart and app reinstall. Now upgraded to **blocker** for walk coverage, with the `ambiguous`/`wdaInstalled: false` mechanism above |
| **`W1-A-08`** local kong gateway down | **CLOSED** | `/auth/v1/settings` → `200`, container `Up 2 hours (healthy)`. The repair I made in §0.1 has held for this session |

## R1.3 A regression check the fix invited

`W1-A-04` rewrote the two controls directly under the five that `P-29` measures, so I
re-measured them at `large` on the fixed tip. Every one is unchanged to the third decimal:

| control | first walk | this tip |
|---|---|---|
| `auth.welcome.appleButton` | 352.333 | **352.333** |
| `auth.welcome.emailButton` | 413.583 | **413.583** |
| `auth.welcome.guestButton` | 518.25 | **518.25** |
| `auth.welcome.passwordButton` | 585 | **585** |
| both legal links | 756 | **756** |

`P-29`'s zero-shift result survives the change.

## R1.4 New this round

| id | sev | where | what | fix | lane | relatedTo |
|---|---|---|---|---|---|---|
| **`W1-A-09`** | polish | Welcome at `accessibility-extra-large` | With the Apple button correctly scaling to 84 pt, the stack below it moves down 34 pt: "Have a password? Sign in" is now cut by the bottom edge, and the consent line — "By continuing, you agree to our **Terms of Service** and **Privacy Policy**" — sits entirely below the fold. The consent sentence is not visible at the moment the reader consents. This is **not** a regression the fix caused: at AX-XL those controls were already at or past the fold before it (the change moves them 34 pt further), and the screen is a `ScrollView`, so both are reachable | Either let the AX-XL layout tighten the space above the buttons, or pin the consent line to the bottom of the viewport so it is visible whatever the text size | L1-A | `W1-A-05`, `C1-30`, `P-34` |

I am deliberately **not** filing the guest button's behaviour: `auth.welcome.guestButton`
stays 51.5 pt at AX-XL while its two neighbours grow, but its single-line label still fits
and nothing clips (shot 27).

## R1.5 Bottom line

Every one of the fixer's five is good as far as I can see it. One — `W1-A-05`, the only one
of the five that needs no taps — is **walked on glass and measured**: 50 pt → 84 pt.
`W1-A-04` is proven in the tree (the links changed idiom) and in the binary, but its
defining claim, that the reader is no longer thrown into Safari, is **unwalked**. The three
copy fixes are proven in the shipped binary and unwalked.

So the honest summary is: nothing I could reach has regressed, `W1-A-05` is closed on
evidence, and four of the five are closed on build evidence one grade weaker than a walk.
Closing them properly needs a working tap path, which is `W1-A-03` — now the single item
gating this wave's acceptance coverage, not a footnote.

Nothing in this re-walk touched production. No git command ran outside the
`agent-ff-w1-integration` worktree, and that worktree was read-only to me — I committed
nothing. The only device I drove was `4D075B9D-6CD6-4878-8E93-3B2AF8932067`.

---

# Re-walk 2 — 2026-09-03 20:37–20:55 CDT

Scope: the items re-walk 1 left open — `W1-A-01`, `-04`, `-06`, `-07` (closed in the
**binary** only, because no tap landed), `W1-A-09` (filed, unfixed), and the three steward
items `W1-A-02`, `-03`, `-08` — plus the round-2 commits that touch my surfaces:
`08397a7d2` (the apostrophe sweep, which edits `AuthScreenView.swift`), `3dbef7c0b`
(`AuthSheet.swift`, `SettingsView.swift`), `4790ab8eb` (`AuthService.swift`, 75 lines) and
`ea4d9d321` (the keyboard Done bar, which could regress `C9-08`).

**The headline: the tap path is fixed, root-caused, and every one of the four
binary-only rows from re-walk 1 is now closed on glass.**

## R2.0 Build provenance — three independent proofs

```
git -C .codex/worktrees/agent-ff-w1-integration rev-parse HEAD
  08397a7d21441baee0c0ea634f75e68fd410f2d8     ← the fixer's tip
git status --porcelain                          ← empty
branch                                          first-flight/w1-integration
```

1. **Built = installed.** `shasum -a 256` on `Patina.debug.dylib` gives
   `d70c1d00c12e9a0fdadcc708ffb675aef728e1f1f60bab74763ea10ad9b42529` for both the
   worktree product and the bundle inside device `4D075B9D…`.
2. **Built after the tip.** Product timestamp 3 Sep 20:37; tip commit 20:34:40.
3. **The app names its own commit.** Account screen, shot 45: `Patina 1.0 (3) · 08397a7d`.
   This is the evidence re-walk 1 lacked, and it beats a hash comparison — it is the
   running process reporting its own provenance.

Gateway probe first, per the rule `W1-A-08` asked for:
`curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:54321/auth/v1/settings` → **200**,
`supabase_kong_supabase  Up 5 hours (healthy)`.

## R2.1 `W1-A-03` — root-caused and CLOSED, with a one-line recovery

Re-walk 1 could describe the symptom (reads fine, writes vanish, cheerful success strings)
but not the cause; I guessed at WDA resolution. **That guess was wrong.** The real mechanism:

Blitz drives a simulator through a **persistent per-udid `idb shell` process**, separate from
the channel `describe_screen` and screenshots use. Mine had been running since **15:15**:

```
20634  Thu Sep  3 15:15:12 2026  idb_companion --udid 4D075B9D-… --grpc-domain-sock …
24182  Thu Sep  3 15:15:35 2026  idb … shell --no-prompt --udid 4D075B9D-…
```

Re-walk 1 rebooted the device (`shutdown`+`boot`, then `erase`+`boot`) at ~18:04. **That
orphaned the companion's handle on the old `SimDevice` boot session.** The shell stayed
alive, kept accepting taps, and kept returning `"Tapped at (x, y)"` — into a dead session.
Reads reconnected on their own; writes did not. Hence: silent, total, survives every
recovery that does not touch the companion.

The recovery, scoped to my udid only:

```
kill 20634 24182          # the stale companion + shell for MY device
```

The next `device_action` then failed **loudly** — `Error executing tap: Shell process not
available` — which is the first honest error this defect has produced in three sessions.
Blitz respawned both processes (`20:42:30` / `20:42:31`), and taps have landed ever since.

**Proof it is genuinely fixed, not worked around** (shots 54 → 55): from a `cmp`-confirmed
static baseline, `mcp__blitz-iphone__device_action` tapped Settings' Done at `(355, 140)`
and the sheet closed. Blitz's own tool, no `idb` in the loop.

For the interval between the kill and the respawn I drove `idb` directly — the same binary
blitz wraps, at `/Users/kody/.blitz/python/bin/idb`, with an explicit `--udid`. Shots 30–53
came through that path; shots 54–55 came through blitz.

**What the steward should do with this.** Walkers B and C were booted from the same
15:15-era companion generation, and anyone who rebooted or erased a device is in the same
state — taps silently discarded while the screen still looks right. The preflight
`W1-A-03` asked for should become: after any `shutdown`/`boot`/`erase`/reinstall, kill that
udid's `idb_companion` + `idb … shell` and re-verify one tap against a `cmp` baseline.

## R2.2 Verdicts — the four binary-only rows, now walked

| id | verdict | evidence |
|---|---|---|
| **`W1-A-06`** wrong code reported as expired | **PASS — walked** | `999999` typed ~30 s after a real code was issued (the resend timer still read 28 s, so expiry is impossible). `auth.form.errorBanner` = **"That code didn’t work. Check it, or send yourself a new one."** No expiry claim, no push to Resend. Shot 34 |
| **`W1-A-04`** legal links eject to Safari | **PASS — walked, both halves** | Tapping Terms opens an **in-app `SFSafariViewController` sheet** (Done checkmark, page toolbar, "patina.cloud" title) and the page renders "LEGAL · Terms of Service · Last updated: August 11, 2026" — with **no "◀ Patina" breadcrumb** in the status bar. The half re-walk 1 explicitly could not claim: the device's process list during the sheet is `Patina.app/Patina` **only** — MobileSafari never launches. Shots 36 → 37 |
| **`W1-A-01`** straight apostrophe in the push primer | **PASS — walked** | The primer fires after sign-in (its once-per-install gate needs notification rows, which is why the guest path never reached it). Tree `AXLabel`: **"We’ll tell you when your designer sends something that needs you — a decision, a proposal, or an invoice. Nothing else."** — U+2019. Shot 41 |
| **`W1-A-07`** deletion copy omits duration | **PASS — walked** | Signed-in Settings → Delete account → the alert body: "…Any project you completed with a designer stays in our records **indefinitely** — with your name and contact details removed — as required for our legal and accounting obligations. This can’t be undone." Shot 51. I read `AccountDeletionService.swift:45-64` afterwards and the reasoning is sound rather than convenient: the code implements **no purge window**, so "indefinitely" is the honest duration and does not invent the 30/90-day window `DeleteAccountCopyTests.noFabricatedWindow` bans |
| **`W1-A-05`** Apple button ignores Dynamic Type | **PASS — re-confirmed** | Walked in re-walk 1; re-checked at AX-XL on this tip, the Apple label scales with its neighbours. Shot 38 |
| **`W1-A-08`** local kong gateway down | **CLOSED** | `200`, `Up 5 hours (healthy)` |
| **`W1-A-03`** HID dies on this clone | **CLOSED** — see §R2.1 | Root-caused, recovered, and blitz's own write path re-verified |
| **`W1-A-02`** shared stack + shared account | **STILL OPEN** — not a fixer item | Untouched. It cost me something concrete this round: to reach `W1-A-07` I had to sign in as the shared `client@patina.dev` and request two OTPs, which invalidates any code another walker was holding |
| **`W1-A-09`** consent line below the fold at AX-XL | **STILL OPEN** (polish, as filed) — but the mitigation is now **proven** | Re-walk 1 argued the ScrollView made both controls reachable; I could not scroll to check. This round I scrolled: the consent line and both links **are** reachable at AX-XL. Shot 39. That is what keeps it polish rather than major — and it turned up `W1-A-11` |

## R2.3 Rows re-walk 1 could only code-verify, now walked

The repaired tap path let me clear four of the "not walk-verified" rows from §3 of the
original walk:

| id | verdict | evidence |
|---|---|---|
| `B-12`, `C1-14` | **PASS — walked** | `SettingsView.SignInButton` "Sign in or create your account" in Settings' ACCOUNT group (shot 44); `AccountView.SignInButton` on the Account screen (shot 45). Signed in, the group becomes Account / Sign in on the web / Sign out / Delete account (shot 50) |
| `A-101` | **PASS — walked** | Shot 51; see `W1-A-07` above |
| `B-13` | **reached** | The guest Studio hub renders "Your Studio begins with a project." with a Sign in door. Shot 42 |
| the "unscrollable hub" (§4) | **withdrawn — it was the harness** | Three swipes take the hub from the profile block to Settings. My original judgement not to file it as a product defect was right, and now it is evidenced rather than assumed. Shot 43 |

## R2.4 Regression sweep over the round-2 commits that touch my surfaces

Four of the seven commits reach L1-A/L1-E surfaces. Nothing regressed.

| what changed | my rows at risk | result |
|---|---|---|
| `08397a7d2` apostrophe sweep, 177 app replacements — in my area it edits only `AuthScreenView.swift`'s **`#Preview`** literal, so no runtime effect | `A-06`, all auth copy | **No regression.** Every sentence I read on glass carries U+2019: "We’ll email you a sign-in code", "That code didn’t work", "Let’s discover yours", "Let’s begin", "You’re looking around without an account", "This can’t be undone", "What’s been billed" |
| `3dbef7c0b` `AuthSheet.swift` — grabber on both presentations, Done on the bare one | `P-29`, `RL1A-11` | **No regression, and `W1-B-12` verified on glass.** The bare `AuthSheet` (raised from Account, `ContentView:118`) shows both the grabber and a "Done" control. Shot 46. Note the signed-out **root** is `AuthScreenView` presented directly, not via `AuthSheet`, so B-12 is not observable from a cold launch — it needs the guest → Account door |
| `3dbef7c0b` `SettingsView.swift` — `W1-C-08`'s notifications row | — | Reached, but **not decidable on my device**: the row still renders as a switch reading ON, which is correct for `notDetermined`. The fix only re-shapes the row when authorization is `denied`, and I declined the primer with "Not now" rather than denying at the system prompt. L1-C's row to settle |
| `4790ab8eb` `AuthService.swift`, 75 lines (`R-02`, `W1-B-04`, `W1-C-09`) | `P-22`, `P-25`, `C1-37`, `C3-06`, `P-29` | **No regression.** A full sign-in ran end to end on this tip: disabled→enabled primary button (`C3-06`), one status region replaced not stacked (`P-22`), auto-submit on the sixth digit (`C1-37`), `auth.otp.tokenField` `AXValue: "Empty"` (`P-25`), and a sheet error that never reaches the root (`P-29`a, shot 35) |
| `ea4d9d321` "one keyboard Done bar per screen, never one per field" (`W1-B-01`) | `C9-08` code-field half | **No regression.** The `Toolbar` group is still at y=792 over the numeric pad on the code screen. Shot 34 |

Two round-2 rows from other lanes were visible in passing and corroborate their walkers:
**B-10** step 1 un-dims the header block while dimming above and below (shot 41 of walk B's
subject, seen here at shot 41's predecessor), and **W1-B-06**'s `provenanceLine` — the
Studio room card now reads "TYPED, NOT SCANNED", agreeing with Your Spaces (shot 48).

## R2.5 New this round

| id | sev | where | what | fix | lane | relatedTo |
|---|---|---|---|---|---|---|
| **`W1-A-11`** | minor | `AuthScreenView.swift:305-315` | At accessibility sizes the consent sentence **loses its conjunction**. `ViewThatFits(in: .horizontal)` has `HStack { termsLink; Text("and"); privacyLink }` as its first branch and `VStack { termsLink; privacyLink }` as its fallback — the fallback simply omits the "and". At AX-XL the tree contains no `"and"` node at all (it is present at `large`, y 770.67), so the line reads "By continuing, you agree to our / Terms of Service / Privacy Policy". The reader who most needs the sentence gets a fragment | Put the conjunction in the stacked branch too: `VStack { termsLink; Text("and")…; privacyLink }`. The comment above it ("stacked at accessibility sizes so neither link truncates") shows the stacking is deliberate; dropping the word was not | L1-A | `P-34`, `C1-30`, `W1-A-09` |
| **`W1-A-10`** | polish | the in-app legal sheet | A consequence of `W1-A-04`'s fix, which is still the right fix: the marketing site's **cookie-consent banner** renders inside the sheet, covering the terms text and asking "Decline / Accept" — a web consent question interrupting a native sign-up, on top of the app's own consent line. Shot 37 | Suppress the banner for the in-app reader — e.g. a `?embed=1`/app query param on `termsURL`/`privacyURL` that the legal pages honour | L1-A | `W1-A-04`, `C1-30`, `C5-04` |

I am deliberately **not** filing two things I saw. Content scrolling under the status bar at
AX-XL with no material behind it (shot 39) is standard iOS ScrollView behaviour. And the
guest button holding 51.5 pt while its neighbours grow is unchanged from re-walk 1 — its
label still fits and nothing clips.

## R2.6 Bottom line

Re-walk 1 ended with four fixes closed one grade below a walk and the tap path named as
"the single item gating this wave's acceptance coverage". **That gate is now open.** The
cause was a stale `idb` shell orphaned by re-walk 1's own device reboots; the recovery is
two `kill`s against the walker's own udid, and blitz repairs itself from there.

With it open, all four of the binary-only rows are closed on glass — `W1-A-06` and
`W1-A-04` with evidence that could not have been obtained any other way (a wrong code typed
28 seconds into a 60-second window; a process list with no MobileSafari in it) — and four
rows the original walk could only code-verify are walked too. Nothing regressed under the
seven round-2 commits, including the 177-replacement apostrophe sweep.

Two new items, both small and both on the same eight lines of consent copy: `W1-A-11`
(minor, the dropped "and") and `W1-A-10` (polish, the cookie banner). One item stays open
and is not the fixer's: `W1-A-02`, the shared account, which this round made me collide
with directly.

Nothing in this re-walk touched production. Every write went to `127.0.0.1:54322` and was
the app's own sign-in; I opened the delete-account alert and **cancelled**, then confirmed
`auth.users` still carries `client@patina.dev` with `deleted_at is null`. No git command ran
outside the `agent-ff-w1-integration` worktree, and I committed nothing there. The only
device I drove was `4D075B9D-6CD6-4878-8E93-3B2AF8932067`, and the only processes I killed
were the two bound to that udid.
