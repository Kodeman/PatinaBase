# GAP3 — gap-fill finder: the design-services conversion path (lane C, `-DeploymentTarget local`)

Device: clone **C** `670DE752-BA1B-40C1-899E-57B50D5743B5` (iPhone 17 Pro, iOS 26.5), signed in as
`client@patina.dev`, local Supabase. Launch: `xcrun simctl launch 670DE752-BA1B-40C1-899E-57B50D5743B5 cloud.patina.app -DeploymentTarget local`.

Scope: DesignerConsultationView (A1-14 placeholder card), DesignRequestFlowView (all steps incl.
ScanPickerView + the upload-step AuthSheet), DesignRequestStatusView, MatchIntroductionView
(+ Safari cover, AddToCalendarButton EventKit sheet), and the send-screen failure copy (C4-09).

Shots: `shots/GAP3/` · ledger `shots/GAP3/ledger.md`.

---

## Code read (before the walk) — grounding for what follows

- `Features/DesignServices/DesignerConsultationView.swift:55-77` — the designer card is **entirely
  hard-coded**: a `Circle().fill(PatinaGradients.earth)` avatar, `Text("Matched Designer")`,
  `MonoLabel("Based on your style profile")`, `Text("We'll pair you with a designer who understands
  your aesthetic")`. No data source of any kind. (A1-14, to be confirmed on screen.)
- `DesignRequestStatusView.swift:65` — when the client has **no** requests this same view is
  rendered as the no-request state, so the placeholder card is on the "Track your request"/Studio
  empty-state path too.
- Eight Studio surfaces route to `.designerConsultation`: ProjectListView:225, InvoiceListView:122,
  DecisionListView:149, NotificationFeedView:160, DocumentListView:99, ProposalListView:117,
  ThreadListView:248, BudgetView:94. ProfileView:157 ("Get design help") instead calls
  `presentDesignServices`.
- `AppCoordinator.swift:290-305` + `Core/State/DesignHelpDestination.swift` — both doors are
  guarded (SP-07); on a cold launch `EngagementTier.currentState == .unknown` resolves to
  `.requestList`, so the FIRST tap of "Get design help" after launch goes to
  `DesignRequestStatusView`, not the compose sheet.
- `DesignRequestFlowView.swift:92-97` — the upload-step wall is `AuthSheet(title:
  DesignRequestAuthCopy.wallTitle)` = "Sign in to send your request".
- `DesignServicesService.swift:165-240` — `DesignServicesError`. `.networkError(m)` renders
  **"Network error: \(m)"** with `m = error.localizedDescription` (raw). Per-scan failures store
  `error.localizedDescription` verbatim (`DesignRequestCoordinator.swift:340`) and
  `ScanUploadProgressView.swift:57-63` prints `package.lastError` verbatim. This is the C4-09
  surface.

---

## ⚠ Device substitution (environment fact, NOT an app finding)

My brief assigned me `670DE752-BA1B-40C1-899E-57B50D5743B5` = **`tfp-C`**. On arrival that device was
being **actively driven by another agent**: after my own launch + screenshot, `describe_screen`
returned a Notifications tree while my screenshot showed the home, and three screenshots taken
4 s apart **with zero input from me** were all different (`.probe-1/2/3.png`, one of which shows the
Studio hub scrolled to "Money & documents"). Continuing there would have corrupted both walks.

I therefore made my own clone with the steward's own recipe and left `tfp-C` alone:

```
xcrun simctl clone 973D1724-90BF-4A0A-B02D-481D561547B3 tfp-GAP3   # review sim was Shutdown; not erased
→ tfp-GAP3  B507B498-7E78-46D2-B885-E24E569DEEC4   (Booted, real Simulator window)
xcrun simctl install  <U> .build/DerivedData/.../Patina.app         # the steward's ONE signed build
xcrun simctl status_bar <U> override --time 9:41 --batteryState charged --batteryLevel 100 --wifiBars 3 --cellularBars 4
xcrun simctl ui <U> appearance light
xcrun simctl launch  <U> cloud.patina.app -DeploymentTarget local
```

Like `tfp-C` on the steward's arrival, the cloned session was stale → the app opened on Welcome.
**HID preflight PASS**: tapped `auth.welcome.passwordButton` (201, 618) → Sign In sheet appeared
(`03-gap3-launch.png` → `04-preflight-signin-sheet.png`). Shots 01/02/.probe-* are from tfp-C before
I moved and are kept only as evidence of the collision.

---

## Walk

### Step 1 · ScanPickerView, empty state (`08-design-help-destination.png`)

Reached by Profile → **"Get design help"**. Because `client@patina.dev` has **zero rows in
`public.leads`** (verified read-only against the local DB), SP-07 resolved to `.newRequest` and the
compose sheet opened directly.

**GAP3-01 · "No scans on this phone yet" contradicts the app's own "YOUR ROOMS" list — major.**
One screen earlier (`07-profile-actions.png`) Profile shows *YOUR ROOMS · Audit Room B — SCANNED SEP 1
· Guest Bedroom — SCANNED AUG 28*. One tap later this step says **"No scans on this phone yet"**. The
distinction (server-side `rooms` vs. a local `RoomScanPackage` bundle) is invisible to a tester, who
concludes the app has lost their scans.

**GAP3-02 · The empty state instructs an action the screen does not offer — major.**
Verbatim: *"You can scan a room to attach — or request design help without one below."* There is **no**
scan affordance anywhere on this screen; the only control is "Request without a scan"
(`ScanPickerView.swift:124`).

**GAP3-03 · `internaldrive` (a hard-disk icon) is the empty-state symbol — minor.**
`ScanPickerView.swift:118`. A homeowner reads "hard drive" where the app means "no rooms scanned yet".

**GAP3-04 · No step affordance anywhere in a four-step flow — major.**
pickScans → details → review → sending → success all render under the identical inline title
"Your design request" (`DesignRequestFlowView.swift:186`) with no counter, no progress bar, no
back chevron. A tester cannot tell how long the form is or that they advanced.

### Step 2 · details (`09` – `12`)

**GAP3-05 · Title Case chips beside sentence-case chips — minor.**
"Design Consultation / Full Room Redesign / Furniture Placement / Styling & Staging" vs. "As soon as
possible / 1-3 months / Flexible" and the sentence-case section headers, in one screenful.

**GAP3-06 · Hyphen-minus used as the range dash in every range — polish.**
On screen: "$5,000 - $15,000", "$15,000 - $50,000", "$50,000 - $100,000", "1-3 months", "3-6 months".

**GAP3-07 · Two visually identical chip groups behave differently — minor.**
Re-tapping a selected Budget chip clears it (`optionalPickerSection`), re-tapping the selected
"Design Consultation" chip does nothing (`pickerSection`) — verified on device (`12`).

**GAP3-08 · The "Your vision" field does not read as editable — polish.**
Its 1.5 pt `PatinaColors.pearl` stroke is all but invisible against the cream ground at that size, so
the field reads as a flat panel rather than a text box (compare the same stroke on the chips, which
reads clearly because the shape is small and tight).

### Step 3 · review (`13`, `14`)

**GAP3-09 · No way back from Review — blocker-adjacent, major.**
The Review step has only "Close" (`.cancellationAction`, `DesignRequestFlowView.swift:74-79`), which
discards the whole composition. A left-edge back swipe does nothing (`14` is pixel-identical to `13`)
because the steps are a `@State` enum inside one `NavigationStack` view, not pushes. To change a
budget or the kind of help, a tester must abandon and retype everything.

**GAP3-10 · The Review step has no heading and ~1000 px of dead space — minor.**
Four label/value rows at the top, then nothing until the CTA. Nothing says "this is the last step".

### Steps 4–5 · sending + success (`15` – `17`)

The **sending step never rendered**: against the local backend the roomless submit returned inside
~300 ms, so the first screenshot after the tap already showed "Request sent". The lead landed —
`public.leads` now holds `a37212c6-6fdd-483d-a395-348c193784d1`, `project_type=consultation`,
`status=new`, `designer_id=NULL` (pooled), `source='Patina app'`.

**GAP3-11 · The success body is three unrelated sentences concatenated at runtime — minor.**
Verbatim on screen: *"We're matching you with a designer. You'll hear back soon. You can follow its
progress from your home screen. We'll tell you the instant a designer takes this in hand."* Built by
`lead + followUp + pushNote` (`DesignRequestFlowView+Steps.swift:259-272`). It reads as three notices
pushed together, and *"follow **its** progress"* has no antecedent (the nearest noun is "a designer").

**GAP3-12 · Three exits on one terminal screen, two of them identical — minor.**
"Track your request", "Done", and the toolbar "Close" are all present; "Done" and "Close" both call
`onClose`. A terminal screen should offer one way on and at most one way out.

### DesignRequestStatusView · stage `finding` (`18`, `19`) — mostly GOOD

Composition is the strongest thing in this path: a status badge, an editorial hero
("Your design request is on its way"), an honest three-dot Progress timeline with only "Request sent"
filled, and a "What you sent" recap. Nothing is faked.

**GAP3-13 · The recap renames the fields the user just filled in — minor.**
Compose called it **"Help" → "Design Consultation"**; the status screen calls the same field
**"Project"**. Compose said **"Scans — No scan attached"**; the status screen says **"Scans — 0 scans"**
(`DesignRequestStatusView.swift:272`, `"\(request.scanCount) scan\(…)"`). "0 scans" is a count where the
flow had a sentence.

**GAP3-14 · A sent request cannot be withdrawn or edited — major.**
There is no cancel, withdraw, or edit anywhere on this screen; the code says so explicitly:
*"There is deliberately no cancel action: the `leads` UPDATE policy is designer-only (documented
follow-up)"* (`DesignRequestStatusView.swift:13-14`). Combined with GAP3-09 (no way back from Review),
a tester who picks the wrong help type or mistypes their vision has no recovery at any point after
the Send tap — the only route is to message a designer they have not been matched with yet.

### Guest pass — the upload-step AuthSheet (`24` – `27`)

Signed out via Settings ▸ Sign Out, then "Look around first".

**GOOD — SP-09 holds.** The Review step shows *"You'll sign in to send this."* before the tap
(`25`); the wall carries the title **"Sign in to send your request"** and a **Cancel** (`26`); and
Cancel returns to Review with every answer intact (`27`, identical to `25`). No ejection.

**GAP3-15 · The sign-in wall's body is the app's first-launch marketing hero — major.**
Under the reassuring title the sheet renders the whole front door: the PATINA wordmark, **"Welcome
home"**, **"Start with a piece you love"**, then Apple/Google/email. A person three screens into
composing a request is shown the new-user welcome as a step *inside* that request. The title repairs
the framing; the body contradicts it. (`AuthSheet` reuses the welcome hero; `showGuest: false` removes
only the guest button.)

**GAP3-16 · The consequential line on the Review step is its faintest text — polish.**
"You'll sign in to send this." is `PatinaTypography.caption` in `Text.muted`, unadorned, floating
under the last summary row — smaller and lower-contrast than every other word on the screen, while
carrying the only warning about what the primary button will actually do.

**GAP3-17 · Signing out lands on a modal Sign In sheet, not the Welcome screen — minor.**
Settings ▸ Sign Out ▸ confirm drops the user straight into the "Sign In / Welcome back to Patina"
sheet with a Cancel (`21`). Someone who signed out on purpose is immediately asked to sign back in
and has to find "Cancel" to leave.

**GAP3-18 · After sign-out the Guest profile still shows the previous account's rooms — major.**
`22`/`23`: header stat "2 ROOMS" and a "YOUR ROOMS" rail listing **Audit Room B — SCANNED SEP 1** and
**Guest Bedroom — SCANNED AUG 28**, the rooms of the `client@patina.dev` session that had just ended,
under the name **Guest**. (May overlap the existing `project_ios_account_isolation_roomless` work —
reconcile before scheduling.)

**GAP3-19 · The guest Studio card's sign-in CTA is labelled "Open settings" — minor.**
Card copy: *"Your Studio begins with a project. / Sign in to see conversations, decisions, proposals,
invoices, and shared files."* The only action under it reads **"Open settings"**. The sentence asks
for a sign-in; the button offers a settings screen.

**GAP3-20 · The Companion bubble is drawn over content on every screen of this path — minor.**
The floating dark circle and its "5 THINGS NEED YOUR EYE" caption sit on top of the designer row on
the home (`01`), the Invoice row on the Studio root (`06`), the room-card rail (`05`, `22`), and the
"NEXT STEPS" label (`23`) — no scrim, no content inset. Likewise the floating back chevron overlaps
the Budget row's icon (`07`) and body text (`23`).

---

## A1-14 — CONFIRMED ON SCREEN (`47-designer-consultation-A1-14.png`)

Reaching it took a third pass. `DesignerConsultationView` renders in exactly two situations:

1. as the body of `DesignRequestStatusView` when the client has **no** requests, or
2. from one of the eight Studio **empty-state** CTAs, and only when `DesignHelpDestination.current`
   resolves to `.newRequest` (`AppCoordinator.swift:293-305`).

`client@patina.dev` has data in every Studio list, so no empty state renders for it, and once a
request exists both doors redirect. I therefore signed up a genuinely discovering account
(`gap3.discovering@patina.dev`, local OTP via Mailpit) — the exact persona the brief names — whose
Studio is empty everywhere, and reached the screen through
**Studio ▸ Conversation ▸ "No conversations yet" ▸ "Get design help"**.

**GAP3-21 · The placeholder card is real, and it announces a designer the tester does not have — major.**
Verbatim, on screen, to a person with no designer and no request:

> **Matched Designer**
> BASED ON YOUR STYLE PROFILE
> We'll pair you with a designer who understands your aesthetic

beside a **blank tan-gradient circle** with no image, no initials and no icon. `Matched Designer` is a
heading in the same `h5` face the app uses for real designer names elsewhere
(`DesignRequestStatusView.designerCard` renders `request.designerName` in exactly that slot), so the
card reads as a **profile that failed to load**, and "Matched" asserts a match that has not happened.
Source: `DesignerConsultationView.swift:55-77` — the whole card is literal, with no data source.
**On the fresh-account path this is the first designer-shaped thing a tester ever sees.**
Fix sketch: either delete the card (the hero + "Start a request" stand alone), or replace it with an
honest promise card — no avatar shape, a title like "You'll be matched by hand", body kept.

**GAP3-22 · The dark hero band does not reach the top of the screen — minor.**
`47`: the band starts at the safe-area bottom edge, leaving a cream strip carrying the status bar
above an otherwise full-bleed dark editorial hero. `DesignerConsultationView.swift:30-33` paints the
background on the hero `VStack` only; the `ScrollView` does not `.ignoresSafeArea(edges: .top)`.
In dark mode (`48`) the band is nearly the same value as the page below and stops reading as a band
at all.

**GAP3-23 · At accessibility-extra-large the Companion bubble sits on top of the card's text — minor.**
`49`: "STYLE PROFILE" runs under the floating bubble, and the avatar circle — vertically centred in an
HStack against a now three-times-taller text column — ends up beside the body copy instead of the
name. Text itself scales cleanly with no truncation (that part is good).

## Other observations picked up on this path (cross-lane — reconcile before scheduling)

**GAP3-24 · The first-run tour uses iOS system blue — major (visual system).**
`29`, `43`: a TipKit-style popover, *"Step 1 of 2 / Welcome to Patina / This is your Daily Room —
picks and stories chosen for your space."*, with a **blue "Next" capsule and blue "Skip"**. Blue
appears nowhere else in Patina; every other control is clay or near-black. Seen on a genuinely fresh
install with a brand-new account, so it is the first modal a first-round tester meets.

**GAP3-25 · A guest cannot reach email/password sign-in from inside the app — major.**
The guest Studio card says *"Sign in to see conversations, decisions, proposals, invoices, and shared
files"* and offers **"Open settings"** (`22`); Settings' ACCOUNT section offers **Account** and
**"Sign in on the web"**; Settings ▸ Account (`28`) shows *"Not signed in"*, Email "—",
Member since "—", and the single action **"Sign in on the web"** (the QR/desktop pairing flow). The
home's *"Sign in to keep this on every device."* is `AXStaticText`, not a button, and tapping it does
nothing (`31`). The only email/password door is the Welcome screen, which a guest cannot get back to.

**GAP3-26 · Progress is stated three ways at once in the style quiz — polish.**
`38`/`39`: one card carries "Question 2 of 5", "STEP 2 OF 5" and "40%".

**GAP3-27 · Emoji stand in for iconography in the quiz — minor (visual system).**
`38` and the Q4/Q5 trees: 🍷 🧘 💻 👨‍👩‍👧 📚 🌱 💬 🏠 ✨ 🔄 💎 as option marks, in an app that otherwise
draws custom marks and SF Symbols only.

**GAP3-28 · A new account's display name is its raw email local-part — minor.**
`44`: the profile header reads **"gap3.discovering"**. Nothing ever asked the tester for a name.

**GAP3-29 · Studio group header counts disagree with their own empty copy — minor.**
`45`: "Conversation **1**" over the row "Conversation — No messages yet".

---

## What is GOOD

- **`DesignRequestStatusView` at stage `finding`** (`19`) is the strongest screen on this path: badge,
  editorial hero, an honest three-dot timeline with only "Request sent" filled, and a verbatim recap.
  Nothing is invented, nothing is faked.
- **SP-09 is real and works.** The Review step warns before the tap, the wall names what it gates and
  offers Cancel, and cancelling returns to Review with every answer intact (`25` → `26` → `27`).
- **The roomless path is a genuine product decision, not a fallback.** "Request without a scan" is the
  primary button when no scan exists, and the request submits and tracks correctly without one.
- **Error copy in `DesignServicesError` is mostly human** — "A scan is still finishing its upload. Give
  it a moment and try again.", "Choose what kind of help you'd like." Only two branches leak raw
  strings (see below).
- **Dynamic Type scales without truncation** on the consultation screen at accessibility-extra-large.
- **The compose flow is fast** — the roomless submit round-tripped in ~300 ms locally.

## Not verified, and why

1. **`MatchIntroductionView`, its `SafariView` portfolio cover (`MatchIntroductionView.swift:83`), the
   slot picker, and the `AddToCalendarButton` EventKit sheet.** All of these render only when the
   focused request's stage is `.introduced` or `.booked`. That requires a `public.match_ceremonies`
   row in state `offered` bound to a designer, which only a designer-side action creates. The local
   stack has the table but **zero** ceremonies, and manufacturing one means multi-row writes to a
   shared local database — outside this audit's read-only posture. The `#Preview`s
   (`MatchIntroductionView.swift:319-329`, `MatchCeremonyPreviewFixtures.swift`) are DEBUG-only and
   need Xcode. **Recommend a dedicated pass with a seeded ceremony.**
2. **`ScanPickerView` with rows** — selection, "Make primary", the "Uploaded"/"On this phone" tags and
   swipe-to-delete. Needs a real `RoomScanPackage` bundle on disk; RoomPlan cannot scan in the
   Simulator. Only the empty state was reachable.
3. **The `sending` step's live UI** — per-scan `ScanUploadProgressView` rows, the "Some scans didn't
   upload" headline, "Let's try that again", the cellular-consent card, the offline card. The roomless
   submit skipped straight to success in ~300 ms and there is no way to slow or fail the local
   backend without disturbing other lanes.
4. **C4-09's raw-string prediction — code-confirmed, not screen-confirmed.** The two leaking branches
   are exact: `DesignServicesError.networkError(m)` renders **"Network error: \(m)"** where `m` is a raw
   `error.localizedDescription` (`DesignServicesService.swift:206-207`, mapped at :218), and per-scan
   failures store `error.localizedDescription` verbatim
   (`DesignRequestCoordinator.swift:337, 340`) which `ScanUploadProgressView.swift:57-63` prints
   straight to the user. A Postgres error whose message matches none of the eight slugs falls through
   to `.submissionFailed` ("Failed to submit your request. Please try again.") — that path is safe.
   No failure could be induced on screen.
5. **Production behaviour.** Everything here is `-DeploymentTarget local`. Nothing is device-verified.
6. **The push-authorization prompt** the success copy implies ("We'll tell you the instant a designer
   takes this in hand") did not appear, but the cloned container carried
   `patina.push.hasPromptedAfterFirstSubmission = true` from 28 Aug, so this is not evidence of a
   defect. Re-check on lane A/P.

## Local-state changes I made (and reverted)

- Submitted one real design request as `client@patina.dev` (the assigned probe) → lead
  `a37212c6-6fdd-483d-a395-348c193784d1`. **Deleted afterwards**; `select count(*) from leads where
  homeowner_id = a0000000-…-005` is back to **0**.
- Created a local account `gap3.discovering@patina.dev` (local Supabase only, never production) to
  reach the discovering-tier path. Left in place — deleting an auth user is a heavier write than
  leaving it.
- Created simulator clone **tfp-GAP3** `B507B498-7E78-46D2-B885-E24E569DEEC4`; left booted with the
  app terminated. `tfp-C` was not touched after the collision was detected.
