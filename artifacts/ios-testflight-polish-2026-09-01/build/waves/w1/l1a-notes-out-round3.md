# W1 · L1-A — notes out, fix round 2 (2026-09-02)

Written from `first-flight/w1-l1a` after the fourteen review findings `RL2A-01` … `RL2A-14`.
Every block below is also appended to its target's inbox, verbatim.

---

## To L1-E (Copy) — Note A→E-1 · five new auth failure sentences, for ratification (`RL2A-07`)

**Why this exists.** PROGRAM.md §3 · L1-A's exit criteria says "no raw server string **anywhere**",
and the two paths every round-one tester walks broke it. Observed on this lane's clone:
the password sheet rendered GoTrue's own `Invalid login credentials` and the code sheet its
`Token has expired or is invalid`, both inside `auth.form.errorBanner`
(`shots/w1-review-l1a/r2-02` and the OTP capture in that ledger). `findings.json` schedules `C4-22`
in **W2**, but `C4-22` is the *deep-link* path (`patina://auth/callback#error=…`); the two sheet
paths above have no finding of their own, so the exit criterion and the schedule contradicted
each other with nobody owning the difference.

**What landed here.** `AuthService.authErrorSentence(_:)` — the `MoneyFailureCopy` /
`OrderFailureCopy` shape exactly: a typed error becomes a fixed, app-authored sentence; the thrown
error is logged, never interpolated. All eleven `setError(error.localizedDescription, …)` sites now
route through it, and `AuthFailureCopyTests.noRawServerStringOnAnyPath` is a bar at zero.

**The words are yours.** You merge last (D14) and own the lexicon; these are a draft, not a claim.
Each is one edit to replace. Checked against the deck's rules: sentence case, U+2019, one voice on
failure, no banned lexicon, no interpolation.

| GoTrue code | when a tester sees it | proposed final |
|---|---|---|
| `invalid_credentials` | the password sheet, wrong password | `That email and password don’t match. Try again, or ask for a sign-in code instead.` |
| `otp_expired` | the code sheet, a stale six-digit code | `That sign-in code has expired. Send yourself a new one.` |
| `over_email_send_rate_limit` / `over_request_rate_limit` | tapping "Email me a code" repeatedly | `That’s a few tries in a row. Give it a minute, then try again.` |
| `email_not_confirmed` | a password sign-in before confirmation | `This email hasn’t been confirmed yet. Check your inbox for the code we sent.` |
| `validation_failed` | a malformed address reaching the server | `Check the email address and try again.` |
| anything else | any unmapped failure | `Something went wrong on our side. Try again, or write to hello@patina.cloud.` |

Two notes on the wording, so an objection is easy to aim:

- `otp_expired`'s sentence deliberately avoids the word **token**. That word is the server's, not
  the reader's, and `SignInCodeNamingTests` already rules that the mechanism has one name:
  **sign-in code**.
- the fallback ends on `hello@patina.cloud`, matching `AccountDeletionService.failureCopy`, so the
  two "we could not do the thing" sentences in this lane's files end the same way.

**Please also record whether you want `C4-22` (the deep-link error redirect) to inherit these same
sentences at W2**, or its own. Nothing here touches that path.

---

## To L1-E (Copy) — Note A→E-2 · `A-101`, L1-A's ratification (`RL2A-08`)

`Note A-L1E-12` asked L1-A to record its agreement or objection, so that "and for how long, agreed
with L1-A" in PROGRAM.md §3 · L1-E's exit criteria has a referent. **L1-A agrees**, and this is the
record.

The delete-account sentence names **no retention period**, and that is correct rather than an
omission:

- `supabase/migrations/00538_client_account_anonymize.sql` — `purge_client_account` deletes rooms,
  room scans, saved items, the threads the client started, and the notification / push-token /
  style-profile / companion rows. It **never writes** to `proposals`, `projects`, `invoices`,
  `client_decisions` or `designer_clients`.
- `supabase/functions/delete-account/index.ts` schedules nothing — no follow-up job, no TTL, no
  purge cron.

So there is no window in the code. Any number on that screen would be a claim the product cannot
keep, on the one screen App Review reads under 5.1.1(v). `DeleteAccountCopyTests.noFabricatedWindow`
already refuses "30 days", "90 days", "seven years", "7 years", "12 months" — the exception is
pinned, not merely agreed.

**Ask to Fable:** amend that exit criterion to "names what is deleted, what is retained, and why —
with no retention period, because the code keeps none", so the charter and the shipped sentence
agree.

---

## To L1-E (Copy) — Note A→E-3 · what landed here, and two rows this lane cannot reach

**Applied in this lane, exactly as written:** `A-L1E-8` (`C5-10`), `A-L1E-9` (`C5-20`),
`A-L1E-10` (`A-06`), `A-L1E-11` (`C5-10`). `Note A-L1E-13` needed no action, as it says.

**`A-06`'s scope, taken literally.** Your ruling is "every user-facing string in a file the deck
names". Applied to the seven decked files this lane owns, that is nine strings, not five — the four
you enumerated plus these, all in files you name:

| where | today → final |
|---|---|
| `QuizModels.swift:102` | `"Let's talk about investment"` → `"Let’s talk about investment"` |
| `QuizModels.swift:107` | `"Let's Discuss"` → `"Let’s Discuss"`, `"I'd like designer guidance"` → `"I’d like designer guidance"` |
| `QuizModels.swift:112` | `"What's driving your design journey?"` → `"What’s driving your design journey?"` |
| `AuthViewModel.swift:398` | `"Apple Sign In couldn't be completed. Please try again."` → `"…couldn’t…"` |

All four are applied. `AuthAndQuizCopyTests.noStraightApostropheInTheDeckedFiles` walks the string
literals (not the comments) in all seven files and is a bar at zero, so the ruling is now enforced
rather than remembered.

**Two rows this lane cannot reach, both yours or L1-B's to decide:**

1. **`QuizModels.swift:112` still contains "journey"** — `"What's driving your design journey?"`,
   question 5 of 5 on the mandatory first-run quiz. "Journey" is on the deck's banned lexicon, and
   `C5-20` named only the two strings you listed, so this one has no row. It is a harder placement
   than either. Suggested final: **`"What’s bringing you here?"`** — same question, no lexicon
   violation, and it does not presume a project. Your call; I have not changed it.
2. **`Features/RoomScan/Shared/Models/StyleResponseModel.swift:97`** renders
   `case .budgetMid: return "Curated Comfort"` — the same banned word `A-L1E-9` removes from
   `QuizModels`, on the *Style Conversation* surface (the parallel quiz). That file is outside
   L1-A's globs and outside the deck. After `A-L1E-9`, the two surfaces disagree: the quiz says
   "Considered Comfort", the conversation says "Curated Comfort". Suggested final, matching:
   **`"Considered Comfort"`**. `:99` also carries `"Let's Discuss"` with a straight apostrophe.

**One naming heads-up.** Your notes name `SentenceCaseTests`, `BrandVoiceLintTests` and
`ApostropheSweepTests` as the pins for these rows. This lane did **not** create files with those
names — two branches creating the same new path is a merge conflict for no benefit. The four pins
live in **`PatinaTests/AuthAndQuizCopyTests.swift`** instead:
`stylePortraitCTAIsSentenceCase`, `styleQuizIsClean`, `noStraightApostropheInTheDeckedFiles`,
`theSignOutAlertAgreesWithItsButton`. Create your three suites for your own rows as planned; these
four are covered.

---

## To L1-C (Layout, Companion, Dynamic Type) — Note A→C-1 · `P-34` item 2 is now yours as written (`RL2A-13`)

Round one of this lane shipped `.lineLimit(1)` + `.minimumScaleFactor(0.75)` on `guestButton`'s
label and on `AuthProviderRow`'s title, rather than the four modifiers `A-L1C-2` item 2 gives. The
outcome was acceptable — nothing truncated at accessibility-XXXL — but it is the **opposite trade**
from the one you wrote down (shrink to 75 % rather than wrap to two lines), and it was recorded
nowhere. The substitution is **withdrawn**. Both labels now carry your text verbatim:

```swift
    .lineLimit(2)
    .multilineTextAlignment(.center)
    .minimumScaleFactor(0.8)
    .fixedSize(horizontal: false, vertical: true)
```

Both rows are `minHeight: 50`, so a second line grows the row rather than clipping. Re-shot at
accessibility-XXXL on this lane's clone; nothing truncates and nothing overlaps.

One deliberate exception, so you do not read it as a missed site: `AuthStatusSlot` keeps
`.lineLimit(2)` + `.minimumScaleFactor(0.75)`. That slot is framed to a constant 52 pt because the
whole of `P-29` is that nothing on this screen moves;
`AuthErrorRoutingTests.reservedHeightIsIndependentOfContent` measures it.

---

## To the steward — Note A→S-1 · `RL2A-01`, `Note D-L1A-4` is misaddressed and half-stale

`l1-a-notes.md` `D→A-7` and the round-two `Note D-L1A-4` route eight `pearl` rows **to L1-D**, which
merges **second** while L1-A merges **fifth** (D14). The target lane cannot apply them. Worse, the
table sends a resolver hunting for rows that no longer exist:

- **Five of the eight arrive already fixed.** `OnboardingFlowView`, `StyleQuizView.exitButton`,
  `StyleResultView`, `StylePillButton`, `PriorityView`, `InvestmentPerspectiveView` are already zero
  on `first-flight/w1-l1d`.
- **Two need hand-work, and they are L1-A's own.** `AuthScreenView.swift` `guestButton` (~:252) and
  `AuthProviderRow` (~:417), both `.stroke(PatinaColors.pearl, lineWidth: 1.5)`, both **added by
  this branch** — they did not exist on the base sha.

`BorderTokenAdoptionTests.pearlHasNoCallSitesOutsideTheTokenFile` is a **bar at zero**, not a
ratchet, so merge 5 reds on those two lines unless somebody applies them.

**Owned, with a name on it.** They are now `l1a-tasks.md` **X29**, a numbered L1-A exit task run in
this worktree after the tip carries merges 1–4 and before merge 5 is pushed, and
`AuthErrorRoutingTests.theRebaseTokenSitesAreEnumerated` reads that checklist out of the plan so it
cannot silently shrink. Please re-address `Note D-L1A-4` to X29 rather than to L1-D.

## To the steward — Note A→S-2 · `RL2A-05`, `B-L1A-2` has an owner now

§S3 lists `l1-b-notes.md` **B-L1A-2** (`.keyboardDoneToolbar()` on five `.numberPad`/`.decimalPad`
fields in L1-B's files) as applicable "after merge 5 (L1-A)" and then says "one of them has to be
chosen and written down". It is chosen: **option 1**, and the owner is **L1-A**, in X29. The five
sites are `RoomBudgetSheet.swift:61`, `ManualRoomEntryView.swift:65,133`,
`RoomSettingsView.swift:193`, `ScanFallbackEntryView.swift:173`.

Until it runs, **`C9-08` reads OPEN in L1-A's coverage table**, not closed — §S3 asked for exactly
that and this round has made the correction. `.keyboardDoneToolbar()` is applied at one site today
(`AuthenticationView+Panels.swift:152`, the T0 half), plus `.dismissKeyboardOnScroll()` at
`AuthenticationView.swift:54`.

X29 also extends `KeyboardDismissalTests` to a **bar** — every `.numberPad`/`.decimalPad` in the
tree carries the modifier — so the five cannot be lost again.

## To the steward — Note A→S-3 · `RL2A-06`, the `pendingLinkNotice` call site

`AuthScreenView` accepts `pendingLinkNotice` and `AuthStatusSlot` renders it at second precedence
(`AuthErrorRoutingTests.theNoticeYieldsToAnError`), but nothing passes it: `ContentView.swift:57-62`
and `AuthSheet.swift:68-74` supply only `errorMessage:` and `isLoading:`. `AppCoordinator.pendingLinkNotice`
lives on `first-flight/w1-l1f`, which merges **fourth** — so L1-A, merging fifth, is the only lane
that can wire it. It is in **X29** with the exact line, plus a call-site pin, and
`C2-21`/`GAP7B-09`'s acknowledgement half **reads OPEN against L1-A** until it lands.

## To the steward — Note A→S-4 · `RL2A-11`, a ruling is wanted, not a revert

Two changed files sit outside L1-A's globs. Nothing to revert — both edits are defensible and both
are already recorded — but the same argument should not have to be had twice:

| file | why | recorded at |
|---|---|---|
| `Features/Collections/Views/LocalStoreClaimSheet.swift` | `l1-e-copy-deck.md` files `A-79` under **"L1-A applies"** and names the file; the residue table says `Features/Collections/Views/**` has "No lane, no W1 work" | `steward.md` §S-L1A-2, `l1-a-notes.md` Note A-L1E-13 |
| `Patina/Utilities/ViewModifiers/KeyboardDismissal.swift` (new) | `Utilities/**` is in no lane's glob; a shared modifier `C9-08` needs has to live somewhere | this lane called it unowned residue; **L1-B then cited it as precedent** for its own `PatinaApp.swift` line |

**Two asks:** (1) rule once, in `steward.md`, on where a shared modifier a W1 lane needs may live —
L1-B has already had to re-argue it; (2) give `Features/Collections/Views/**` an owner in the
residue table rather than leaving it "no lane" while two lanes edit it.

The carve-outs held: `SignInWithAppleButton.swift` and `RevealView.swift` are absent from
`git diff main...HEAD --name-only`.

---

## To Fable — Note A→F-1 · `RL2A-14`, the 2 s on the launch path

`establishSession` awaits `OnboardingCompletion.resolve(userId:)` **before** publishing the session,
and the listener calls it before `markAuthStateReady()`. The serial ordering is deliberate and
recorded: resolving from the auth-state listener instead put it ~130 ms late, and `ContentView`
animates phase changes over 0.5 s, so it was a **visible cross-fade through the intro carousel**,
not a dropped frame.

The worst case is `OnboardingCompletion.serverReadBudget` = 2 s, paid only when the device flag is
false and the account is not in the device record — a fresh install whose session is restored, and
every first sign-in on a new phone. That is inside L1-B's 8 s `LaunchWatchdog.stallDeadline`.

**No change made.** Two new cases pin it instead: `theServerReadBudgetIsTwoSeconds` (the constant
cannot move by accident) and `aHangingReadIsAbandoned` (the budget is a ceiling, measured — a read
that never returns does not stall the launch and nothing is flipped on its word). If Fable would
rather publish the session first and resolve on a detached task, the 130 ms cross-fade comes back;
that trade is Fable's, and it is now a one-line change with a test either side of it.
