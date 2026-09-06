# Wave 3 — carry-fix lane

Two items the lanes left open at their round-3 verdicts, closed on the integration branch
(`approvals/w3-integration`, from `bac0377f5`). Nothing else was touched: the standing minors and
nits in `backend-review-r3.md` and `iose-review-r3.md` are still standing, and are still recorded
there.

---

## `M-R3-01` — the already-mailed filter counts a day, not the digest's period

**Files.** `supabase/functions/notification-digest/logic.ts`,
`supabase/functions/notification-digest/index.ts`,
`supabase/functions/notification-digest/logic.test.ts`.

`collectItems` handed `decisionsMailedDirect` the same instant it handed `collectItems` — the
digest window — and the rule that filter implements (ux/03 §282) is a **day**, not a period. The
two coincide on `daily` and nowhere else, which is why nothing caught it.

The consequence on `weekly_sunday`: every approval mails its first notice direct (`decisionMailHold`
breaks the digest for `notice === "first"` on all three cadences), so every approval announced
during the week had a `decision_required` email row inside the seven-day Sunday window and was
dropped from the Sunday summary. Its reminder never mailed either — it was held as `cadence_digest`
and `reminderStampDisposition` stamped `reminder_sent_at`, so `decision-reminders` does not return
to it. A "once a week, on Sunday" reader heard the announcement and then nothing about that
approval until its date passed. On `daily`, the Sunday skip stretches the window to ~48 h and
swallowed a Saturday announcement out of Monday's summary the same way.

**Fix.** A new pure helper, `directMailWindowStart(windowStart, now)` = the LATER of the summary's
own window start and `now − 24 h`. `collectItems` passes that to `decisionsMailedDirect` and keeps
`digestWindowStart` for its own collection. The floor never widens the check past a day, and never
narrows a window that is already shorter than one — a letter mailed two hours ago still silences
this morning's summary.

**Tests** (`logic.test.ts`, +2):

- `the already-mailed filter looks back a day, whatever the period` — the weekly window
  (`2026-10-04T13:00:00Z`) floors to `2026-10-10T13:00:00.000Z`; the daily window and the floor
  are the same instant (which is why the daily tests never caught this); a window stretched over
  the skipped Sunday run still floors at a day; a sub-day window is left alone; an unreadable
  watermark falls back to the day, never the epoch.
- `an approval announced mid-week is in the Sunday summary (M-R3-01)` — the end-to-end shape, over
  the pure helpers: two approvals, both with a `decision_required` email row inside the seven-day
  window (Wednesday's announcement and one two hours ago). The rows are filtered by the floor the
  way `index.ts`'s `.gt("created_at", …)` filters them, then `directlyMailedDecisionIds` +
  `dropDirectlyMailedDecisions` run. Wednesday's approval survives into the Sunday summary; this
  morning's is still not said twice inside a day. Without the floor the same test keeps neither.

**Not fixed, still standing** from `backend-review-r3.md`: `m-R3-02` (no gate for a recipient with
no auth profile), `m-R3-03` (row re-armed hourly when email is off), `m-R3-04` (the overdue row
itself is re-armed), `n-R3-05` (the 200-row page is unordered — note it still applies, over a
24-hour page now rather than a seven-day one, so it is strictly less likely to bite), `n-R3-06`
(a bounce counts as spoken-for).

---

## `R3-M1` — "Don't remind me" promised an end condition nothing detects

**Files.** `apps/mobile/Patina/Patina/Features/Decisions/DecisionPace.swift`,
`Patina/Core/Network/DecisionsAPIClient+Pace.swift`,
`Patina/Features/Decisions/ViewModels/DecisionsViewModel.swift`,
`Patina/Features/Decisions/ViewModels/DecisionDetailViewModel+Pace.swift`,
`Patina/Features/Decisions/Views/ProjectApprovalScreen.swift`,
`PatinaTests/DecisionPaceTests.swift`.

### The sentence

`DecisionSnooze.never.holdsUntil` was *"I'll hold the reminders until you come back."* 00572 stores
`never` as `snoozed_until = 'infinity'`; nothing in the rail lifts it and nothing watches for a
return. It now reads:

> **I'll hold the reminders. Choose again here whenever you want them back.**

— the act that ends the hold, which is a thing Patina can actually detect, instead of a condition
it cannot. `confirmation` still appends `theTwoThatStillReachHer`, so the whole sentence a
homeowner reads is:

> I'll hold the reminders. Choose again here whenever you want them back. If the date passes or a
> new edition arrives, I'll still say so.

The typographic apostrophe (`’`) is used, matching every other string in the file.

Pinned in `theStandingSnoozeIsStillInterrupted` as a full-string equality plus a loop over the
end-conditions the sentence may not name ("until you come back", "when you come back", "when
you're ready"), and in `everyConfirmationIsHonestAboutTheHold`'s per-case pins. The existing
all-cases loop already required `hold the reminders` and forbade `I'll ask you`; the new string
satisfies both unchanged.

### "here" had to be true

The sentence says *choose again HERE*, and the menu it points at was drawn only while
`chosenSnooze == nil` — so the control disappeared the moment she chose. In-session that was
`R3-m2`; with the read-back below it would have become permanent. `ProjectApprovalScreen.pace` now
draws the confirmation **and** the menu, in that order; the accessibility identifiers
(`approval.snooze.confirmation`, `approval.snooze`) are unchanged. That closes `R3-m2` as a side
effect — the same control, made honest rather than made new. Pinned structurally: the source
between the two identifiers carries no `else`.

### The hold now survives the screen

`chosenSnooze` was written by the act and by nothing else, so re-entering the approval forgot a
choice the server had recorded and offered the menu as though nothing had been asked.

- `DecisionsAPIClient.decisionSnooze(decisionId:)` — a plain table read of `decision_snoozes`
  (`kind, snoozed_until`), through the Supabase SDK the way `ApprovalDiscussion.read` reads
  `decision_comments`. RLS (`decision_snoozes_owner_select`, 00572) hands back her own row and
  nobody else's, so there is nothing left for an RPC to filter. A list + `.first` rather than
  `.single()`: the ordinary case — she has never snoozed this one — is zero rows, and `.single()`
  answers that with a thrown PGRST116, which would draw a failure sentence over an approval
  nothing is wrong with. `UNIQUE (user_id, decision_id)` makes more than one row impossible.
- `DecisionSnooze.standing(kind:snoozedUntil:now:)` — the honest read. `infinity` (`never`, and a
  dateless `when_due`) stands; a dated hold stands only while `snoozed_until > now`; an unknown
  kind, an empty row or an unparseable date is nil. A hold that has already lifted is not a hold,
  and "I'll hold the reminders until Sunday" drawn on the Monday after is the same lie in the
  other direction.
- `DecisionDetailViewModel.loadSnooze(decisionId:now:)`, called from `load(decisionId:)` after
  `loadApprovalReview` and only when `approvalReview != nil` — the pace block is the approval's,
  and a legacy decision has no snooze to show. A failed read leaves the sentence unsaid and does
  **not** set `snoozeFailed`: that word belongs to a write that did not land.
- `fetchDecisionSnooze` is a seam on the view model, the read half of `setDecisionSnooze`'s.

**Tests** (`DecisionPaceTests.swift`, +4, 2 rewritten): `aStandingRowIsReadBack` (seven cases over
`standing(…)`), `theSnoozeSurvivesReEntry`, `aFailedReadSaysNothing`,
`theSnoozeIsReadBackFromTheTable` (source pins: the call site in `load`, and the table + columns in
the client), plus the two copy pins above.

**Not fixed, still standing** from `iose-review-r3.md`: `R3-m1` (the `quietHours` overdue-notice
leg), `R3-m3` (`pagedPlates` inset), `R3-n1`, `R3-n2`, `R3-n3`, `R3-n4`, and the carried `R2-m2`,
`R2-m3`, `R2-n1`.

---

## Gates

See the "Carry fixes" section of `wave-report.md` for the run and its output.

## Advisories

1. **`n-R3-05` shrinks but does not close.** `decisionsMailedDirect`'s `.limit(200)` still has no
   `order`. The page it applies to is now a day rather than a period, so a reader would need 200+
   `decision_required` email rows inside 24 hours to hit it — but the fix narrows the window, it
   does not order the page.
2. **`R3-n3` now reaches one more reader.** `theTwoThatStillReachHer` is appended to every
   confirmation including on an undated approval, and the read-back means that sentence is drawn
   on re-entry too, not only in the session that chose it. The string is unchanged; the exposure is
   wider.
3. **No migration, no new RPC.** The iOS read goes through the table's own SELECT policy, so
   nothing here is owed on the deploy list beyond the edge function
   (`notification-digest`) and the iOS build.
4. **Prettier drift is inherited.** The pre-commit hook warns on the three
   `notification-digest` files; `prettier --check` fails on the base versions of the same files at
   `42d9057e4`. Nothing was reformatted, and `deno fmt --check` is clean for every line this lane
   added.
