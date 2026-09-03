# W1 · L1-A — integration note: the A3-07 self-downgrade

Written by W0 fix round 3 (2026-09-02) as the handoff for **ruling B2 v3(c)**. L1-A owns the change;
this file is the contract it has to satisfy, and the reason the contract is shaped this way.

---

## The finding

**A3-07.** A tester who signed in with Apple landed `profiles.role = 'designer'`.

`public.handle_new_user()` — the `auth.users` INSERT trigger — honours exactly one client-supplied role
string, the literal `'homeowner'` in `raw_user_meta_data.role` (00313). Everything else falls to the
default, which has been `'designer'` since 00013. The app's email and OTP paths send the hint
(`AuthService.swift:437` and `:563`). The Apple and Google paths cannot: `supabase-swift`'s
`signInWithIdToken` and `signInWithOAuth` take **no `data:` parameter**, so there is no way to attach
creation metadata to an OAuth sign-up. The row is created labelled `designer`, and nothing corrects it.

## What W0 decided, and what it did NOT do

Two earlier cuts of migration 00555 tried to fix this in the trigger — first by flipping the default to
`'homeowner'`, then by branching on `raw_app_meta_data->>'provider'`. **Ruling B2 v3 reverted both.**
`handle_new_user` is now 00313 verbatim: every sign-up with no explicit hint still lands `'designer'`,
whatever provider it came in on. The portals are unchanged.

The reasoning, in one line: which **button** somebody tapped is not which **kind of account** they are.
A designer can sign in with Apple. A client can sign up with an email and a password — the client
portal's own invite-accept form does exactly that. A trigger guessing from the provider writes a wrong
label for both, silently, at the one moment nobody is watching.

So the label is corrected by the two callers that actually know the answer. **One of them is this app**,
and that is L1-A's row.

**What W0 shipped for you:** the own-row `UPDATE` policy on `public.profiles` is no longer a freeze. It
is a one-way ratchet (00555 §a2(i-a)):

| column | permitted new value |
|---|---|
| `role` | unchanged, **or** `'homeowner'` |
| `is_designer` | unchanged, **or** `false` |

Never upward, in either column. `profiles.role` grants nothing anywhere in the schema — the
design-request rail (00286/00330/00285) reads `is_designer`, `profiles_select_admin` reads `user_roles`,
and the `designer_clients` restrictive policies read both — so a self-downgrade of the label costs the
caller a word and gains them nothing. That is why it is safe to allow, and it is allowed **only** so
this app can make it.

Regression cover for the policy itself is `supabase/tests/rls/00555_ios_round_one_security.test.sql`
case **7i** (the downgrade lands), **7i2** (it is idempotent), **7i3/7i5** (the ratchet does not turn
back).

---

## The contract L1-A implements

**After a successful `signInWithIdToken` (Apple) or `signInWithOAuth` (Google) — and only those two
paths — the app PATCHes its own `profiles` row to `role = 'homeowner'`.**

```
PATCH {SUPABASE_URL}/rest/v1/profiles?id=eq.{session.user.id}
Authorization: Bearer {session.accessToken}
Content-Type: application/json

{"role": "homeowner"}
```

or, through `supabase-swift`:

```swift
try await client
  .from("profiles")
  .update(["role": "homeowner"])
  .eq("id", value: session.user.id)
  .execute()
```

Five rules, each of which the reviewer will check:

1. **Scoped to `id = self`.** The filter is the signed-in user's own uid, taken from the session the
   sign-in just returned — never a value passed in from anywhere else. The policy would refuse another
   id anyway; the filter says so out loud.
2. **`role` only.** Do not send `is_designer`, and do not send it as `false` "to be safe" — the column
   is already `false` for a fresh sign-up, and writing it makes this call look like an authority write
   when it is a label write. One key in the body.
3. **Idempotent.** It runs after *every* Apple/Google sign-in, not only the first, because the app
   cannot reliably tell a first sign-in from a returning one and a returning user whose downgrade
   failed last time must still get it. Writing `'homeowner'` over `'homeowner'` is a permitted no-op
   (case 7i2).
4. **Once per sign-in, and not in a loop.** It belongs immediately after the session is established, in
   the same place the app already resolves the profile — not in a view's `onAppear`, not in a retry
   timer.
5. **Never fatal.** A failure is logged and swallowed. The user is signed in; a wrong label is
   cosmetic (it changes the word `comms_resolve_role` renders beside their name, 00103:37-42) and the
   next sign-in retries it. A sign-in that fails because a cosmetic PATCH 4xx'd is a worse bug than the
   one being fixed.

**Do not add this to the email or OTP paths.** They already send `role: "homeowner"` in
`raw_user_meta_data` and the trigger honours it; a second write there is redundant, and it would make
the app look like it writes its own role unconditionally, which is precisely the shape 00555 spent a
section closing.

### What it will do on a real device

| sign-in | row after trigger | row after the PATCH |
|---|---|---|
| Apple, first time | `role = 'designer'` | `role = 'homeowner'` |
| Apple, returning | `role = 'homeowner'` | `role = 'homeowner'` (no-op, 204) |
| Google, first time | `role = 'designer'` | `role = 'homeowner'` |
| email/password with the hint | `role = 'homeowner'` | n/a — path not touched |
| a real designer signing in with Apple on the app | `role = 'designer'` | `role = 'homeowner'` — see below |

That last row is a real consequence and it is accepted: the Patina **client** app relabels anyone who
signs into it with Apple. Their authority is untouched (`is_designer` and their `user_roles` grants are
not written by this call, and the policy forbids raising either), so the cost is the word beside their
name until an admin resets it. Ruling **D3** takes the Google button off the Welcome screen for round
one anyway, and round one's cohort is Leah's clients.

### Verifying it, without a device

Against a local stack, with a password-grant JWT for a fresh account:

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  -X PATCH "http://127.0.0.1:54321/rest/v1/profiles?id=eq.$UID" \
  -H "apikey: $ANON" -H "Authorization: Bearer $JWT" \
  -H 'Content-Type: application/json' \
  -d '{"role":"homeowner"}'
# want 204 — twice in a row

curl -s -o /dev/null -w '%{http_code}\n' \
  -X PATCH "http://127.0.0.1:54321/rest/v1/profiles?id=eq.$UID" \
  -H "apikey: $ANON" -H "Authorization: Bearer $JWT" \
  -H 'Content-Type: application/json' \
  -d '{"role":"designer"}'
# want 403 (42501) — the ratchet does not turn back
```

W0 ran exactly this matrix on 2026-09-02; the codes are in the fix-round-3 section of
`build/waves/w0/wave-report.md`.

---

## The other caller, for context

`supabase/functions/client-invite/index.ts` `handleAccept` does the same relabel as `service_role`, for
a client who arrives through a designer's invitation and signs up over email/password with no hint
(ruling B2 v3(d)). It is deployed by Kody in **KODY-RUNBOOK Block A step A10**, and clients who already
accepted are swept up by the one-time backfill in **Block B7**. L1-A does not need to do anything about
that path — it is named here so the two halves of the ruling are visible from one place.

## Dependency

This contract needs **00555 applied** (KODY-RUNBOOK Block B). Before it, the own-row `UPDATE` policy is
00013's `USING`-only version, which permits the PATCH too — so the app code works either way and L1-A is
not blocked on the migration. After it, the PATCH is permitted *because of the ratchet*, and any
attempt to write `role = 'designer'` or `is_designer = true` from the app will start returning 403.

---

## From L1-E (Copy) — 2026-09-02

Six rows, exact final text. Full reasoning for each in `build/waves/w1/l1-e-copy-deck.md`.

### Task A-L1E-1 — `A-52`, the Companion's guest copy

`Features/Companion/Services/CompanionActionRows.swift`, three spots — needs `isAuthenticated` (or
`LocalStoreClaim.hasGuestWork` for the home row) threaded into the row builders, since the same
functions draw for both a guest and a signed-in person today:

- `:32-34` (`homeRow`) — guest hint: `"See what's on Patina"`. Signed-in / guest with local rooms:
  unchanged, `"Back to your space"`.
- `:220-223` (`pieceActRow`, `.askAboutPiece`) — guest hint: `"Sign in and a designer will get back to
  you"`. Signed-in, no designer yet: `"A designer will get back to you"` (was "will come back to
  you" — the small tense cleanup applies to both states so they read as one voice).
- `Features/Notifications/Views/NotificationFeedView.swift:193` (`guestInviteView` — already correctly
  branched on auth state; only the sentence inside it still presumes a designer) — message:
  `"Sign in to see updates on your projects and messages here."` Title `"Nothing yet"` (`:192`) is
  unchanged.

### Task A-L1E-2 — `A-79`, the local-store claim sheet

`Features/Collections/Views/LocalStoreClaimSheet.swift:17`. Add `roomCount`/`pieceCount` to
`LocalStoreClaim` (computed alongside `hasGuestWork`) and compose the title from them:

- rooms only: `"Keep the {n} room{s} you saved on this phone?"`
- pieces only: `"Keep the {n} piece{s} you saved on this phone?"`
- both: `"Keep the {r} room{s} and {p} piece{s} you saved on this phone?"`
- concrete example (0 rooms, 1 piece): `"Keep the 1 piece you saved on this phone?"`

`s` = `""` at count 1, else `"s"`. `:23`'s body sentence is unchanged — it never claims a count, so it
stays true at any count > 0. The sheet is already never shown at zero (`LocalStoreClaim.shouldAsk`
requires `hasGuestWork`) — no change needed for that half of the finding.

### Task A-L1E-3 — `A-101`, the delete-account copy

`Features/Account/AccountDeletionService.swift`, three constants, one verb throughout ("Delete
account" — not "Close"):

- `:41` `confirmationTitle` → `"Delete account"`
- `:42-43` `confirmationBody` → `"This deletes your Patina account, including your saved rooms,
  pieces, and messages. Any project you completed with a designer stays in our records — with your
  name and contact details removed — as required for our legal and accounting obligations. This can't
  be undone."` Grounded in `supabase/functions/delete-account/index.ts` +
  `supabase/migrations/00538_client_account_anonymize.sql`: the server soft-deletes the auth user and
  purges rooms/scans/saved items/started threads, but **never** touches `proposals`, `projects`,
  `invoices`, `client_decisions`, `designer_clients` — those survive indefinitely, PII-stripped. There
  is no fixed purge window in the code; do not invent one.
- `:39` `failureCopy` → `"We couldn't delete your account just now. Try again, or write to
  hello@patina.cloud."` (same one-verb sweep, nothing else changed)

### Task A-L1E-4 — `A-06`, apostrophe sweep

`Features/Onboarding/Views/OnboardingFlowView.swift:31,57,58` — convert the three straight apostrophes
(U+0027) to typographic (U+2019), matching `:37`'s existing `"the room's shape"`. No text otherwise
changes: `"Let's discover yours."` / `"...then we'll show you..."` / `"Let's begin"`, all with U+2019.

### Task A-L1E-5 — `C5-20`, two brand-voice rewrites

- `OnboardingFlowView.swift:32` — `ctaText: "Let's begin"` (reuses page 3's own CTA verbatim, U+2019
  apostrophe per Task A-L1E-4 — write it once, both pages match byte-for-byte).
- `Features/Authentication/Views/AuthenticationView.swift:134` (`headerSubtitle`, `.signUp` case) —
  `"Save your rooms and pieces, and pick them up on any device."`

### Task A-L1E-6 — `C5-10`'s five L1-A-owned casing rows

- `Features/Account/AccountView.swift:184` — `PatinaButton("Sign out", style: .secondary)`
- `Features/QRAuth/Views/QRScannerView.swift:201` — `PatinaButton("Open settings", ...)`
- `Features/FirstLaunch/Views/CameraPermissionView.swift:223` — `Text("Open settings")`
- `Features/Authentication/Views/AuthenticationView.swift:526,528,530,532` (`submitButtonTitle`) —
  `"Sign in"` / `"Create account"` / `"Email me a code"` (unchanged) / `"Send reset link"`
- `Features/Authentication/Views/AuthenticationView.swift:632` (mode-switcher) — `"Sign up"` / `"Sign
  in"`

### Task A-L1E-7 — `B-23`, no deck row needed

`Features/StyleQuiz/Views/StyleResultView.swift:65` — the finding's own fix line already names the
exact replacement, verbatim: `"Your portrait is yours — reset it any time in Settings."` Verified
against the current string ("Your portrait stays on this device and can be reset in Settings.") —
matches the evidence exactly; nothing for a copy review to add.

> ⚠ **File-overlap flag for the steward.** `CompanionActionRows.swift` is also touched by
> `l1-c-notes.md`'s `A-60`/`C-22` note, at `:36-54` — different, non-overlapping lines from Task
> A-L1E-1's `:32-34`/`:220-223`. L1-C merges first (D14); rebase onto its result before applying this
> task.

### VISION check on this note

None of the six rows adds tab/zone/dashboard framing, a shadow, red/green status, a badge, an
engagement mechanic or the word "AI" — every one is a string rewrite or a count-aware composition.

---

## From L1-C (Layout, Companion, Dynamic Type) — 2026-09-02

Two findings sit in **L1-C's** W1 table with a `⇢L1-A` cross-reference, and both live in
`Features/Authentication/**`, which is L1-A's glob. **L1-C did not edit that tree.** Exact final text
below; also in `build/waves/w1/l1c-notes-out.md` §3 and §4.

### Task A-L1C-1 — `GAP1B-08`: 44 pt on the six auth text links

`GAP1B-08`'s `codeNote`: *"Files are L1-A-owned; the skeleton assigns the tap-target work to L1-C, so
this needs an integration note."*

Measured, via `idb ui describe-all` on the Welcome and Sign In screens:

| control | measured height |
|---|---|
| "Have a password? Sign in" | 14.67 pt |
| "Terms of Service" | 14.67 pt |
| "Privacy Policy" | 14.67 pt |
| "Forgot password?" | 17.0 pt |
| "Use magic link" | 17.0 pt |
| "Sign Up" | 17.0 pt |

All six against Apple's 44 pt floor, and they are the **first controls a TestFlight tester meets**.

**Exact final text** — on each of the six, applied to the `Button` (not to the `Text` inside its
label, which does not extend the button's hit region):

```swift
        .frame(minHeight: 44)
        .contentShape(Rectangle())
```

A `Button` whose label is bare `Text` hit-tests the glyph bounds; `.contentShape(Rectangle())` after
a `minHeight` frame is what makes the whole 44 pt row tappable. Two of the six sit side by side in
the legal line — give each its own frame rather than the row, so the two links stay separately
targetable.

Suggested pin, in L1-A's own suite:

```swift
    @Test("every auth text link reaches the 44 pt floor")
    func authLinksAre44Points() throws {
        for file in ["Patina/Features/Authentication/Views/AuthenticationView.swift",
                     "Patina/Features/Authentication/Views/AuthScreenView.swift"] {
            let code = SourceScan.code(in: try SourcePin.read(file))
            let links = code.components(separatedBy: "Button(").count - 1
            let framed = code.components(separatedBy: "frame(minHeight: 44)").count - 1
            #expect(framed >= links, "\((file as NSString).lastPathComponent): a link is under 44 pt (GAP1B-08)")
        }
    }
```

(L1-A knows the real file names; the two above are the ones the finding's evidence points at.)

### Task A-L1C-2 — `P-34`: the Welcome screen at accessibility text sizes

At `content_size accessibility-extra-extra-extra-large` (`shots/P/40-welcome-ax3xl.png`) every button
label truncates — "Start with a piece…", "Continue with…" (Google), "Continue wit…" (email), "Look
around f…", "Have a password? S…", "By continuing, y…", "Term… and Priva…" — "Have a password? S…"
and "Welcome home" run edge to edge with no left gutter, and the screen does not scroll, so the legal
links cannot be read at all. This is the first screen in the app.

**The four changes, in the order they matter:**

1. **A `ScrollView` fallback above `.accessibility1`.** The screen is a fixed `VStack` today. Wrap
   the body so it can scroll when it no longer fits:

   ```swift
       @Environment(\.dynamicTypeSize) private var dynamicTypeSize

       var body: some View {
           Group {
               if dynamicTypeSize.isAccessibilitySize {
                   ScrollView(showsIndicators: false) { welcomeContent }
               } else {
                   welcomeContent
               }
           }
       }
   ```

2. **Multi-line button labels instead of truncation.** On each CTA's label:

   ```swift
       .lineLimit(2)
       .multilineTextAlignment(.center)
       .minimumScaleFactor(0.8)
       .fixedSize(horizontal: false, vertical: true)
   ```

3. **Stacked legal links.** "Terms of Service" and "Privacy Policy" share a row that truncates both.
   Use the same `ViewThatFits` shape L1-C used on the room-type chips:

   ```swift
       ViewThatFits(in: .horizontal) {
           legalRow          // the HStack it is today
           VStack(alignment: .leading, spacing: 8) { legalLinks }
       }
   ```

4. **Let the Apple button scale.** `SignInWithAppleButton.swift` is carved out to **L1-D** by name in
   PROGRAM.md §3 (`C3-03`, `P-35`), so this fourth item is L1-D's, not L1-A's — recorded here because
   its fixed height is what truncates "Continue with…" first, on the same screen.

`GAP1B-08`'s 44 pt frames (Task A-L1C-1) land on the same screen; do both in one pass.

### VISION check on these two notes

Neither adds tab/zone/dashboard framing, a shadow, red/green status, a badge, an engagement mechanic
or the word "AI". Both enlarge or reflow controls that already exist.

---

## From L1-F (notifications, messaging, widget, deep links) — 2026-09-02

Full text, with the other three notes this lane sent, is at `build/waves/w1/l1f-notes-out.md`.

## L1F→A-1 → **L1-A** · acknowledge a held link on the auth screen (`C2-21`, `GAP7B-09`)

**Findings.** `C2-21` and `GAP7B-09` (both T0/major): *a deep link tapped while signed out is queued
invisibly / never arrives, and nothing says anything had been kept.* Round one opens **signed out**, so
this is the first state every tester is in. `GAP7B-09`'s three shapes were all silent: warm at the auth
wall, cold at Welcome, and after signing in from the cold one the destination never appeared at all.

Both fix lines say the same thing: *"acknowledge it on the auth screen in one line."*

**What L1-F has built.** `PendingLinkQueue` — a bounded, persisted FIFO — keeps the link and the
coordinator replays it on arrival at `.main`. `AppCoordinator` publishes:

```swift
    public private(set) var pendingLinkNotice: String?
    public static let pendingLinkNoticeLine = "We'll open what you tapped once you're in."
```

`pendingLinkNotice` is set the moment an arrival is kept and cleared the moment the queue drains, so it
cannot outlive the thing it is about. `DeepLinkQueueTests.aQueuedLinkIsAcknowledged` and
`.theNoticeIsAHomeownerSentence` pin both halves.

**What L1-A applies — two files, both this lane's.**

**1. `Features/Authentication/Views/AuthScreenView.swift`** — a second optional line beside the error
banner it already has. Add the property beside `errorMessage`:

```swift
    /// A link the person tapped before they could be shown it, being held until
    /// they are in (`C2-21`, `GAP7B-09`). `AppCoordinator.pendingLinkNotice`.
    var pendingLinkNotice: String? = nil
```

and render it immediately AFTER the existing `if let errorMessage { … }` block (so a real failure is
still the first thing read):

```swift
            if let pendingLinkNotice {
                Text(pendingLinkNotice)
                    .font(PatinaTypography.bodySmall)
                    .foregroundStyle(PatinaColors.Text.muted)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 28)
                    .padding(.bottom, 16)
                    .accessibilityIdentifier("auth.welcome.pendingLinkNotice")
            }
```

Muted, not red: nothing has gone wrong. It is a promise the app keeps two taps later.

**2. `ContentView.swift`** (the `.auth` case, which steward §5.2 gives to L1-A) — pass it in, beside
the `errorMessage:` argument already there:

```swift
                    errorMessage: AuthService.shared.errorMessage,
                    pendingLinkNotice: coordinator.pendingLinkNotice
```

**Not asked for:** `AuthSheet.swift`'s `AuthScreenView(…)` call needs no change — the parameter
defaults to nil, and a link held while a modal auth sheet is up is acknowledged by the sheet's own
dismissal into the destination.

**One behaviour change worth knowing about**, because it touches the magic-link path L1-A owns: the
`patina://auth…` arm of `DeepLinkHandler` is now explicitly exempt from the queue **in every phase**,
including `.launching`. Before, a magic-link callback that arrived during the splash was stashed in
`pendingDeepLink` and drained only on arrival at `.main` — which is unreachable until that callback is
handled, so it was never drained. `DeepLinkQueueTests.authCallbacksBypassTheQueue` holds it open.


---

# From L1-D (Tokens, dark mode, contrast, iconography) — 2026-09-02

Appended by L1-D. The full set, with the notes sent to the other lanes, is
`build/waves/w1/l1d-notes-out.md`. Each block below is a numbered task for this lane's own
task list, carrying exact final text.

Written by L1-D on 2026-09-02 from `first-flight/w1-l1d` (base `ba83aa67f`). Every note below is
**also appended verbatim** to its target lane's inbox — `l1-a-notes.md`, `l1-b-notes.md`,
`l1-c-notes.md`, `l1-f-notes.md` — because a note nobody schedules is not a plan.

**What L1-D shipped that these notes depend on.** All of it is on `first-flight/w1-l1d`, in
`PatinaDesignKit` and this lane's four `Patina/**` files, and all of it merges **second**
(D14: L1-C → **L1-D** → L1-B → L1-F → L1-A → L1-X → L1-E). So every token named below exists by the
time any other lane rebases.

| New API | What it is for |
|---|---|
| `PatinaColors.Border.hairline` | The quiet rule: card edges, list separators, the tab bar's top line. Light `#E5E2DD` (unchanged) / dark `#322E29`. Replaces `PatinaColors.pearl` wherever pearl was drawing a **border or divider** |
| `PatinaColors.Border.strong` | The rule a tester is meant to see: field outlines, unselected chip edges, an "inactive step" fill. Light `#C8C3BB` / dark `#524C45` |
| `PatinaColors.Border.onDark` | A hairline on a `Background.dark` object, where the page behind it is what it has to separate from. Static `#756B61`, 3.18:1 on the dark canvas |
| `PatinaColors.OnDark.primary` / `.secondary` / `.muted` | Ink for a surface that is dark in **both** appearances. Static — it does not flip. `#FAF7F2` / `#D8D2C8` / `#B7AE9F` |
| `PatinaColors.Scrim.chrome` | An opaque ground for a control drawn over a photograph. Static `#332F2B`; `OnDark.primary` on it is 12.42:1 whatever the photo |
| `PatinaColors.clayInk` (`#82612F`) | Interactive labels and filled accent surfaces that carry a light label. `Text.interactive`'s light side is now this: `clayDeep` was 3.54:1 |
| `PatinaColors.errorDeep` (`#9C4C3F`) | The destructive fill. `error` under `offWhite` is 3.03:1 |
| `PatinaTypography.voiceLead` · `voiceSmall` · `voiceCaption` · `bodySerif` · `h6` · `monoLarge` | The six ramp gaps the 44 remaining inline `.font(.custom(…))` sites were reaching past |

**Changed behaviour, so nobody is surprised at merge:**

- **`PatinaColors.Background.dark` is now adaptive** — light `charcoal` (unchanged) / dark `#524B44`.
  Seven surfaces read it: the Companion orb and panel, `AddedToRoomToast`, `DesignerConsultationView`'s
  hero, `RoomBudgetBar`, `WholeHomeCrossRoomBar`. In dark mode they were 1.15:1 against the page and
  had no body at all (`C-01`). Their light-mode look is byte-identical.
- **`PatinaButtonStyle.clay` now renders the `.primary` treatment** (`C-41`). The five call sites —
  `InvoiceDetailView:219`, `ProposalDetailView:165`, `ProposalSignSheet:69`, `DecisionDetailView:425`,
  `DecisionDeferSheet:59` — keep compiling and stop being tan. `.destructive` fills with `errorDeep`.
  `PatinaButtonStyle` also publishes `patinaFillColor`, `patinaLabelColor`, `patinaBorderColor` and
  `filledCases`.
- **`DarkPalette.textSecondary` and `textMuted` are raised** (`#DFD2C0`, `#C7B99F`) — `C-20`.
- **`PatinaAsyncImage` takes a `caption:`** and has three states, not two: `loading` (shimmering mark),
  `failed` (mark + "Tap to retry"), `missing` (mark + the caption, no retry). Passing `url: nil` now
  gives the *missing* state rather than the failure state.
- **`PatinaTests` now links `PatinaDesignKit`.** `apps/mobile/Patina/Patina.xcodeproj/project.pbxproj`
  gains one `XCSwiftPackageProductDependency` on the test target. Before this, a test referencing any
  kit symbol compiled and then failed to link (`Undefined symbols … PatinaDesignKit.PatinaColors…`),
  which is why `HomeHeaderTests` says the target "does not link PatinaDesignKit" and pins `TimeOfDay`
  through a source read. It does now. Steward ruling **S-5** assumed the link already existed; it did
  not, and this is the smaller of the two fixes it implies.

---

---

## D→A-1 · L1-A · `P-25` — the OTP field announces a code that is not there

`Features/Authentication/Views/AuthenticationView.swift:326-331`.

`scan_ui` on the **empty** field returns `AXValue: "000000"`, so VoiceOver announces a six-digit code
to a tester who has typed nothing — and the placeholder is itself a plausible code. Visually, empty
and filled differ only in text opacity: same glyphs, same position, same font.

Replace the field with:

```swift
                    TextField("", text: $viewModel.otpToken, prompt: Text("Enter the 6-digit code"))
                        .textContentType(.oneTimeCode)
                        .keyboardType(.numberPad)
                        .font(.system(.title2, design: .monospaced))
                        .tracking(8)
                        .multilineTextAlignment(.center)
                        .accessibilityLabel("Sign-in code")
                        .accessibilityValue(
                            viewModel.otpToken.isEmpty
                                ? "Empty"
                                : "\(viewModel.otpToken.count) of 6 digits entered"
                        )
```

and give the field a filled state that differs by more than opacity — the one-line version is a border
that changes with content, using L1-D's new tokens:

```swift
                        .overlay(
                            RoundedRectangle(cornerRadius: PatinaRadius.md, style: .continuous)
                                .stroke(
                                    viewModel.otpToken.isEmpty
                                        ? PatinaColors.Border.strong
                                        : PatinaColors.Text.interactive,
                                    lineWidth: viewModel.otpToken.isEmpty ? 1 : 1.5
                                )
                        )
```

`P-25` is scored to L1-D and its file is L1-A's; L1-D closes nothing here without this task.

---

---

## D→A-2 · L1-A · `C3-06` and `A-73` — the auth form's affordance is inverted

`AuthenticationView.swift:513-520` (the form primary) and `:366-372` (the OTP **Verify** button) both
read:

```swift
.background(viewModel.isFormValid ? PatinaColors.Interactive.active : PatinaColors.clay)
```

Enabled is neutral charcoal; **disabled is the brand accent** — the warmest, most tappable-looking
colour in the palette — and the label stays `Text.inverse` in both, so the disabled state is also the
2.18:1 case. On the email-code path every round-one tester walks, the button looks *more* live before
the field is valid than after.

Both sites become one filled style dimmed when disabled:

```swift
.background(PatinaColors.Interactive.active)
.opacity(viewModel.isFormValid ? 1.0 : 0.4)
```

and for the OTP button, the same shape with its own predicate:

```swift
.background(PatinaColors.Interactive.active)
.opacity(otpToken.count == 6 && !isVerifying ? 1.0 : 0.4)
```

`PatinaButton` already does exactly this (`.opacity(isEnabled ? 1.0 : 0.5)`), so if either site can be
replaced outright by `PatinaButton(..., style: .primary, isEnabled:)` that is better still.

Also on L1-A's screens, same finding family (`A-73`), each a one-line swap:

| file:line | today | final |
|---|---|---|
| `Features/Authentication/Views/AuthScreenView.swift:124` | `.stroke(PatinaColors.pearl, lineWidth: 1.5)` | `.stroke(PatinaColors.Border.strong, lineWidth: 1.5)` |
| `Features/Onboarding/Views/OnboardingFlowView.swift:230` | `.fill(PatinaColors.pearl.opacity(0.6))` | `.fill(PatinaColors.Border.hairline)` |
| `Features/StyleQuiz/Views/StyleQuizView.swift:139` | `.overlay(Circle().stroke(PatinaColors.pearl, lineWidth: 0.5))` | `.overlay(Circle().stroke(PatinaColors.Border.hairline, lineWidth: 0.5))` |
| `Features/StyleQuiz/Views/StyleResultView.swift:153` | `.fill(PatinaColors.pearl)` | `.fill(PatinaColors.Border.hairline)` |
| `Features/StyleConversation/Shared/Components/StylePillButton.swift:36` | `isSelected ? PatinaColors.Interactive.active : PatinaColors.pearl,` | `isSelected ? PatinaColors.Interactive.active : PatinaColors.Border.strong,` |
| `Features/StyleConversation/Views/PriorityView.swift:71` | `isSelected ? PatinaColors.Interactive.active : PatinaColors.pearl,` | `isSelected ? PatinaColors.Interactive.active : PatinaColors.Border.strong,` |
| `Features/StyleConversation/Views/InvestmentPerspectiveView.swift:60` | `.fill(PatinaColors.pearl)` | `.fill(PatinaColors.Border.hairline)` |

`C3-05`'s quiz half is also L1-A's: `StyleQuizView.swift:239,243,325,329,335` put an `offWhite`/white
label on a `clay` fill at 2.18:1, on the app's minute-two screen. Route the **selected** state through
`FilterChip(title:isActive:)` or, in place, swap the fill to `PatinaColors.Interactive.active` and the
label to `PatinaColors.Text.inverse`. Never `clay` under a light label.

---

---

## D→A-3 · L1-A · `A-11` — full-colour emoji are the quiz's iconography

`Features/StyleQuiz/Models/QuizModels.swift:80-84`, `:104-107`, `:114-117`, rendered at
`Features/StyleQuiz/Views/StyleQuizView.swift:269-280` as `Text(icon).font(.system(size: 20/24))`.

VoiceOver reads the glyph as part of the label — `"🍷, Love having people over…"` — and Q4 mixes 🌱 and
💬 with flat black ✦ and ◆ in one four-item list. This is the template-app tell, on the onboarding
path every tester walks in minute two.

**Exact replacement.** Change the `icon` strings to SF Symbol names, and render them as symbols in one
weight and one colour so the icon never carries state:

| question | option | today | SF Symbol |
|---|---|---|---|
| Q2 | Love having people over | `🍷` | `wineglass` |
| Q2 | My quiet sanctuary | `🧘` | `moon.stars` |
| Q2 | Work from this room | `💻` | `laptopcomputer` |
| Q2 | Family central | `👨‍👩‍👧` | `figure.2.and.child.holdinghands` |
| Q2 | Personal retreat | `📚` | `books.vertical` |
| Q4 | (the 🌱 option) | `🌱` | `leaf` |
| Q4 | (the ✦ option) | `✦` | `sparkle` |
| Q4 | (the ◆ option) | `◆` | `diamond` |
| Q4 | (the 💬 option) | `💬` | `bubble.left.and.bubble.right` |
| Q5 | (the 🏠 option) | `🏠` | `house` |
| Q5 | (the ✨ option) | `✨` | `sparkles` |
| Q5 | (the 🔄 option) | `🔄` | `arrow.triangle.2.circlepath` |
| Q5 | (the 💎 option) | `💎` | `diamond.inset.filled` |

At the call site, `StyleQuizView.swift:269-280`:

```swift
                Image(systemName: option.icon)
                    .font(.system(size: 22, weight: .light))
                    .foregroundStyle(PatinaColors.Text.secondary)
                    .frame(width: 28, height: 28)
                    .accessibilityHidden(true)
```

One weight, one colour, no fill variants, no colour semantics — and `accessibilityHidden` so the
option's label is the sentence alone, not "wineglass, Love having people over".

**VISION note, carried so the lane does not have to re-derive it:** a line symbol that carries no state
is not a badge and not red/green status, so this fix does not collide with §6.

---

---

## D→A-4 · L1-A · `C3-15` — the inline fonts in L1-A's files

Nine sites. Two of them (`ScanFloorPlanPreviewView`) have **no `relativeTo:` at all**, so they ignore
Dynamic Type outright.

| file:line | today | final |
|---|---|---|
| `Features/StyleConversation/Shared/Components/ConversationHeaderView.swift:28` | `.font(.custom("PlayfairDisplay-Italic", size: 26, relativeTo: .title2))` | `.font(PatinaTypography.voiceLead)` |
| `Features/StyleConversation/Views/ContemplativePauseView.swift:29` | `.font(.custom("PlayfairDisplay-Italic", size: 20, relativeTo: .title3))` | `.font(PatinaTypography.patinaVoiceLarge)` |
| `Features/StyleConversation/Views/VisualResonanceView.swift:73` | `.font(.custom("Inter-SemiBold", size: 11, relativeTo: .caption2))` | `.font(PatinaTypography.captionMedium)` |
| `Features/StyleConversation/Shared/Components/StyleSwatchCell.swift:35` | `.font(.custom("Inter-SemiBold", size: 11, relativeTo: .caption2))` | `.font(PatinaTypography.captionMedium)` |
| `Features/StyleConversation/Views/InvestmentPerspectiveView.swift:34-38` | the two-face ternary at 18 pt | `.font(isDiscussRow ? PatinaTypography.patinaVoice : PatinaTypography.h5)` |
| `Features/StyleConversation/Views/InvestmentPerspectiveView.swift:49` | `.font(.custom("DMMono-Regular", size: 11, relativeTo: .caption2))` | `.font(PatinaTypography.mono)` |
| `Features/StyleConversation/Views/PriorityView.swift:54` | `.font(.custom("PlayfairDisplay-Regular", size: 16, relativeTo: .callout))` | `.font(PatinaTypography.bodySerif)` |
| `Features/StyleReveal/Views/ScanFloorPlanPreviewView.swift:108` | `.font(.custom("DMMono-Regular", size: 11))` | `.font(PatinaTypography.mono)` |
| `Features/StyleReveal/Views/ScanFloorPlanPreviewView.swift:113` | `.font(.custom("DMMono-Regular", size: 11))` | `.font(PatinaTypography.mono)` |

`InvestmentPerspectiveView.swift:40` also carries a comment saying `Inter-Light` is not bundled — if a
call below it still names that face, it takes `PatinaTypography.bodySmall`. The suite that catches an
unbundled face is `PatinaTests/TypographyAdoptionTests.everyNamedFaceIsRegistered`.

---

---

## D→A-5 · L1-A · `GAP4-16` needs nothing from `StyleContinueButton`

Recorded so the lane does not fix it twice. `GAP4-16` — the Reveal's only CTA is invisible in light
mode, a charcoal capsule on a charcoal ground — is **closed on `first-flight/w1-l1d`** in
`RevealView.swift`, which L1-D owns: the screen now carries `.environment(\.colorScheme, .dark)`, so
its permanently-charcoal ground resolves `Interactive.active` on the near-white side and the capsule
appears. `Features/StyleReveal/Views/StyleContinueButton.swift` is **unchanged and should stay
unchanged** — its `Interactive.active` fill and `Text.inverse` label are correct once the scheme
matches the ground, and hard-coding an on-charcoal variant there would break it on any light screen
that reuses it.

---


---

# From L1-D — round 2 (2026-09-02, after reading `l1-d-notes.md` and the copy deck)

Written after L1-D read its own inbox (`l1-d-notes.md`, four notes) and `l1-e-copy-deck.md`, both of
which landed while this lane was mid-build. Round 1 is `l1d-notes-out.md`. Each block below is
appended verbatim to its target lane's inbox.

---

---

## D→A-6 · L1-A · the Apple button's in-flight spinner has to invert with the style

**This is the note `D-L1A-1` asked L1-D to send back.** L1-A's own wording:

> L1-A's `AuthScreenView` wraps this button in a `ZStack` for `C1-05`'s in-flight spinner and dims it
> to `opacity(0.35)` while the Apple exchange is in flight; the spinner is tinted
> `PatinaColors.Text.inverse`, which reads on the `.black` style. **If you take the `.white` style in
> dark mode, the spinner tint needs to invert with it.**

L1-D took it. `SignInWithAppleButton.swift` now reads
`.signInWithAppleButtonStyle(colorScheme == .dark ? .white : .black)`, **sim-verified on a cold dark
launch** (`shots/w1-l1d/before-02-welcome-dark.png` vs `after-02-welcome-dark.png`).

So in dark mode the button is a near-white capsule, and `Text.inverse` resolves to `#211E1B` in dark —
which is the *correct* colour for a spinner on it. In **light** mode the button is black and
`Text.inverse` resolves to `#FAF7F2` — also correct. **`Text.inverse` is already the right token in
both appearances**, because it flips in exactly the same direction the Apple button now does.

Nothing to change. This note exists so the contract is closed rather than left open, and so the pairing
is written down before someone "fixes" the spinner to a static colour and breaks one of the two cases.

If L1-A would rather be explicit than rely on the coincidence, the equivalent literal is:

```swift
                        ProgressView()
                            .tint(colorScheme == .dark ? PatinaColors.charcoal : PatinaColors.offWhite)
```

**One more thing L1-A should know:** the button also carries `.id(colorScheme)` now.
`SignInWithAppleButton` wraps `ASAuthorizationAppleIDButton`, whose style is fixed when the UIView is
made — sim-verified: a **cold** launch picked the right style, but flipping the system appearance
while the screen was up left the old one. Changing the view's identity with the scheme is what rebuilds
it. It also means the button is re-created on an appearance change, so any `@State` inside it resets —
in practice only the nonce, which is rotated per attempt anyway.

---

---

## D→A-7 · L1-A · `AuthButton` is kept, deliberately

`D-L1A-3` reports that `AuthButton`'s only two call sites (`AuthScreenView.swift:82,85`) are gone on
L1-A's branch, leaving it with zero call sites, and says deleting it is L1-D's call.

**L1-D is not deleting it this wave.** Two reasons, both about the merge rather than the code:

1. L1-A merges **fifth** and L1-D merges **second** (D14). If L1-D deletes `AuthButton` now and
   anything on the integration tip still references it before L1-A lands — a fix round, a partial
   merge, a rebase that drops L1-A — the tree does not compile, and the lane that finds out is not this
   one.
2. Deleting a public type from the design kit is a change no finding in this lane's table asks for.
   `A-03` / `P-02` are closed by L1-A's replacement, not by the old type's absence.

It is now dead code with a `#Preview` reference, and it is a clean W2 deletion once L1-A is on `main`.
Its `pearl` border was swept to `Border.strong` with the rest of the component, so it carries no
`C3-01` debt while it waits.

---

---

## From L1-F — round 2 (2026-09-02)

Written after L1-F read its own inbox (`l1-f-notes.md`) and `l1-e-copy-deck.md`. Full text,
with what L1-F applied from those notes, is at `build/waves/w1/l1f-notes-out.md`.

## L1F→A-2 → **L1-A** · reply on `F-L1A-2`: the exact sentence and the property to read

You asked for the sentence and the property name, and said the acknowledgement belongs as a **second,
lower-priority case in `AuthScreenView`'s existing fixed-height status slot** rather than a second
element, because `P-29` is that nothing on that screen may move. **Agreed — and that supersedes
`L1F→A-1`'s block**, which asked for a separate `Text` under the error banner. Use this instead.

**The property** (shipped, on `first-flight/w1-l1f`, `App/Coordinators/AppCoordinator.swift`):

```swift
    public private(set) var pendingLinkNotice: String?

    public static let pendingLinkNoticeLine = "We'll open what you tapped once you're in."
```

`AppCoordinator` is `@Observable`, so the slot repaints on its own. It is set the moment an arrival is
kept and cleared the moment the queue drains on arrival at `.main`, so it cannot outlive the thing it
is about. `DeepLinkQueueTests.aQueuedLinkIsAcknowledged` pins both edges;
`.theNoticeIsAHomeownerSentence` pins that the line names no URL, no vendor and no error.

**The sentence:** `"We'll open what you tapped once you're in."` — 40 characters, one line at the
default size. It is deliberately not "your link is waiting": the person does not think of it as a
link, they think of it as the invoice they tapped in Mail.

**The slot's precedence, as L1-F would rank it** (your call — you own `P-29`):

1. `AuthService.shared.errorMessage` — something went wrong and they must act.
2. `coordinator.pendingLinkNotice` — nothing is wrong; a promise is being kept.

So: render the notice only when `errorMessage == nil`. A person who just failed to sign in does not
need to be told their link is safe in the same 52 pt.

**The one call-site change** in `ContentView.swift`'s `.auth` case, beside the `errorMessage:`
argument that is already there:

```swift
                    errorMessage: AuthService.shared.errorMessage,
                    pendingLinkNotice: coordinator.pendingLinkNotice
```

`AuthSheet.swift`'s `AuthScreenView(…)` call needs nothing: the parameter defaults to nil, and a link
held while the modal sheet is up is acknowledged by the sheet dismissing into the destination.

**Not blocking L1-F.** If the slot never renders it, the link still arrives — the queue is not
cosmetic. What is lost is the acknowledgement half of `C2-21` / `GAP7B-09`, which is the half that
stops a tester concluding the link did nothing. L1-F reports it open against L1-A until it lands.

**One behaviour change in the auth path L1-A owns, restated because it is easy to miss:** the
`patina://auth…` arm of `DeepLinkHandler` is now explicitly exempt from the queue **in every phase**,
including `.launching`. Before, a magic-link callback arriving during the splash was stashed in
`pendingDeepLink` and drained only on arrival at `.main` — unreachable until that callback is handled,
so it was never drained. `DeepLinkQueueTests.authCallbacksBypassTheQueue` holds it open.

---

## From L1-B (Data, persistence, resilience) — 2026-09-02 · **heads-up, no task**

Nothing here asks L1-A for a change. Three facts about `first-flight/w1-l1b` that touch files or
behaviour near L1-A's, recorded so the merge holds no surprises. Full context in
`build/waves/w1/l1b-notes-out.md`.

1. **`Patina/PatinaApp.swift` gains one line** — `.localStoreRecoveryNotice()`, on the `ContentView()`
   chain beside `.modelContainer(…)`. `PatinaApp.swift` is in no lane's glob; the modifier and the
   screen it presents live entirely in `Core/Persistence/` (L1-B's). It is `C7-01`'s one-time "we had
   to start this phone's copy over" screen — a `fullScreenCover` that mounts only on the launch after
   a `ModelContainer` failure and is a no-op on every other launch. **`ContentView.swift` is
   untouched by L1-B**, including its `.launching` case: `SplashView`'s new stall state and its
   shorter animation are inside `Features/Splash/**`, and its initialiser is unchanged, so the
   `SplashView { }` call site at `:22-31` compiles as it stands.

2. **The splash now says something when a launch never resolves** (`C1-19`). After
   `LaunchWatchdog.stallDeadline` (8 s) with `AuthService.isAuthStateReady` still false, `SplashView`
   draws *"We couldn't reach Patina — try again."*. The half that actually moves the person —
   `AppCoordinator` falling through to `.auth` at the same deadline — is L1-F's, sent as Task
   F-L1B-1. When it lands, a stalled launch arrives on **L1-A's `.auth` screen** rather than sitting
   on the splash. Nothing on that screen needs to change; it is named here because L1-A owns what the
   person meets there.

3. **`Services/Auth/AuthService.swift` is untouched by L1-B**, as the glob says.
   `LocalStoreOwnership.ownerKey` (new, `Core/Persistence/`) reads the same
   `"local_store_owner_user_id"` key `AuthService` writes at `:229`, and
   `AccountIsolationTests.theOwnerKeyMatchesTheOneAuthServiceWrites` pins the two spellings together —
   so if L1-A renames that key, that test is where it will surface.


---

## From L1-E (Copy) — round 2, 2026-09-02 (after the adversarial review of deck revision 1)

Full text, with the blocks sent to the other lanes, is at `build/waves/w1/l1e-notes-out.md`. Deck: `build/waves/w1/l1-e-copy-deck.md` **revision 2**.

### Task A-L1E-8 — `C5-10` · the taste portrait's primary CTA

`Features/StyleQuiz/Views/StyleResultView.swift:54`

```swift
Text("View Recommendations")   // today
Text("See your pieces")        // final
```

Title Case on the primary button of the screen every first-run tester lands on after the quiz.
"See the piece" is the phrase `OrderPlacedView` already uses and the one `ItemActionMenu` takes
under `C5-09`, so the plural is the same voice. Pinned by
`SentenceCaseTests.stylePortraitCTAIsSentenceCase`.

### Task A-L1E-9 — `C5-20` · the style quiz says "Curated" twice on the first-run path

`Features/StyleQuiz/Models/QuizModels.swift:73` and `:105`. **Change the `label:` only. The `key:`
values are spectrum-mapping and budget-lookup inputs** (`StyleQuizViewModel.swift:221,242,296` match
on them) and must not change.

```swift
// :73  — question 1 of 5, "Which palette feels like home?"
QuizOption(label: "Eclectic Curated",   gradient: PatinaGradients.rattan, key: "eclectic_curated")  // today
QuizOption(label: "Collected Eclectic", gradient: PatinaGradients.rattan, key: "eclectic_curated")  // final

// :105 — question 4 of 5, "Let's talk about investment"
QuizOption(label: "Curated Comfort",    subtitle: "$2,000 – $5,000 per room", icon: "✦", key: "curated_comfort")  // today
QuizOption(label: "Considered Comfort", subtitle: "$2,000 – $5,000 per room", icon: "✦", key: "curated_comfort")  // final
```

"Curated" is on the deck's banned lexicon and `BrandVoiceLintTests` bans it, yet the app ships it
twice on the mandatory first-run quiz — a harder placement than `C5-20`'s own two strings.
"Collected" is the interiors word for a room assembled over time, which is what that palette means.
"Considered" is parallel to its siblings "Thoughtful Starter" and "Heirloom Investment". Pinned by
`BrandVoiceLintTests.styleQuizIsClean`, which also asserts both keys survive.

### Task A-L1E-10 — `A-06` · the ruling on the sweep's scope, and five strings

**This answers your question in `l1-e-notes.md` Note E-L1A-3.** `A-06`'s W1 sweep is **every
user-facing string in a file the deck names**, not only `OnboardingFlowView`; the app-wide sweep is
W2 · L1-E's. Three of the five sentences you flagged carry an apostrophe, and they are in files the
deck names, so they are in scope:

| where | today | final |
|---|---|---|
| `AuthViewModel.emailValidationMessage` | `"That doesn't look like an email address yet."` | `"That doesn’t look like an email address yet."` |
| `AccountView.signedOutSection` | `"You're looking around without an account."` | `"You’re looking around without an account."` |
| `StyleQuizView` defer control | `"I'll do this later"` | `"I’ll do this later"` |

The other two ("Reading your answers…", "I already have an account — Sign in") carry no apostrophe
and are already correct.

Two more in the same sweep, in `Features/Account/AccountDeletionService.swift`:

| line | today | final |
|---|---|---|
| `:38-39` (`failureCopy`) | `"We couldn't delete your account just now. …"` | `"We couldn’t delete your account just now. Try again, or write to hello@patina.cloud."` |
| `:55-58` (`confirmationBody`) | `"… This can't be undone."` | `"… This can’t be undone."` |

⚠ **`confirmationBody`'s edit turns one of your own tests red unless it goes in the same commit.**
`PatinaTests/AccountActionsTests.deletionConfirmationCopyIsHonest` asserts
`confirmationBody.contains("can't be undone")` with a straight apostrophe — change it to
`"can’t be undone"`.

### Task A-L1E-11 — `C5-10` · the sign-out alert contradicts the button that opens it

`Features/Account/AccountView.swift:59,61`

```swift
.alert("Sign Out", isPresented: $showingSignOutAlert)   // today
Button("Sign Out") { … }                                 // today

.alert("Sign out?", isPresented: $showingSignOutAlert)  // final
Button("Sign out") { … }                                 // final
```

`AccountView.swift:217` already reads `"Sign out"` after your `C5-10` row, so one screen now ships
both spellings — which is exactly `C5-10`'s complaint. The `?` on the title is not a casing change:
it matches the file's sibling alerts, and it is the difference between a title and a command.

⚠ **Same-commit pin:** `PatinaTests/AccountActionsTests.accountViewSurfacesBothAccountActions`
asserts `source.contains("\"Sign Out\"")` → change to `"\"Sign out\""`. (The `SettingsView` half of
that test file is L1-C's row — a different `@Test` function, so the two edits merge cleanly.)

### Note A-L1E-12 — `A-101` · your acknowledgement is requested, and `A-13`'s string is ratified

**`A-101`.** PROGRAM.md §3 · L1-E's exit criteria says the delete-account sentence names what is
deleted, what is retained "**and for how long**, agreed with L1-A". The deck's sentence deliberately
states **no retention period**: there is no purge window anywhere in the code — `purge_client_account`
(00538) never writes to `proposals`, `projects`, `invoices`, `client_decisions` or `designer_clients`,
and `delete-account/index.ts` schedules nothing — so any number would be a claim the product cannot
keep, on the one screen App Review reads under 5.1.1(v). It is recorded in the deck as an explicit
exception for Fable to ratify. **Please record your agreement (or your objection) in
`l1-a-notes.md`**, so "agreed with L1-A" has a referent in the wave record.

**`A-13`.** Revision 1 of the deck omitted this row entirely, though PROGRAM.md names it by id. You
have already applied it, at `StyleQuizViewModel.swift:61-66` — the nudge is gone on every step that
has a real Continue button, and the surviving line reads `"See your style"`. **That string is
ratified as the deck row**; no change is asked for. Recorded so the finding is closeable against a
deck entry rather than against a commit nobody filed.

### Note A-L1E-13 — three rows are now correctly addressed elsewhere; no action

Revision 1 filed these under "L1-A applies" against `steward.md` §5. You had already re-routed all
three, correctly:

| row | file | true owner |
|---|---|---|
| `A-52` ×2 | `Features/Companion/Services/CompanionActionRows.swift` | **L1-C** (§5.4) — your task `C-L1A-3` |
| `A-52` ×1 | `Features/Notifications/Views/NotificationFeedView.swift:193` | **L1-F** (§5.7) — applied by L1-F |
| `A-79` ×2 | `Features/Collections/Views/LocalStoreClaimSheet.swift` | **no W1 owner**, so L1-E's under its own carve-out — but you applied it verbatim first. Recorded, not re-applied. |
