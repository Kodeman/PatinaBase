# Wave 2 · lane iOS-D — adversarial review, round 1

Reviewer worktree (read-only for source; this file is the only thing written):
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w2-iosd`
(`git -C … rev-parse --show-toplevel` →
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w2-iosd`), branch
`approvals/w2-iosd`, base `107549568`.

```
$ git log --oneline main..HEAD
0508fd40b docs(approvals): the W2 iOS-D gate results
c4d98affd feat(ios): a collapsed reminder still names its own row (P-22)
ba8539707 docs(approvals): the W2 iOS-D lane log
0b6f61dc1 fix(ios): the Studio hub names an approval an approval
69d107ef9 feat(ios): the answered row crosses to MOVED carrying its word (P-21)
7ea3073a7 feat(ios): the lock screen offers two acts and never an outcome (P-22)
6fc52792e feat(ios): the router follows a Threshold link to the native screen (P-06)

$ git diff main...HEAD --stat | tail -1
 18 files changed, 2203 insertions(+), 73 deletions(-)
```

Commits are pathspec-clean (no `git add -A` residue, no stray files), Conventional
Commits subjects, no trailers, no `merge(...)` subject. The lane log is force-added
as ruled. Working tree is clean.

## Verdict — **fix**

No blocker. Four majors, six minors, four nits. Every item in the brief is present;
two sub-items are delivered in a shape the brief did not name and need a ruling
rather than a rewrite.

## Gates I ran myself

Run from this worktree, unsandboxed, `IOS_GATE_UDID=493547C8-D84B-478B-8673-3FF6ACAA05C6`
(`cae-w1-iosb`, the UDID `env.md` assigns this lane).

| tier | result |
|---|---|
| `build` | **PASS** — `** BUILD SUCCEEDED **`, exit 0 |
| `unit` | **RED as run, GREEN on the flake's isolated re-run** — see below |
| `lint-delta main` | **PASS** — `✓ lint-delta: no new warnings in touched files`, `LINT_EXIT=0` |

```
$ IOS_GATE_UDID=…05C6 …/ios-gate.sh unit
✘ Test run with 2524 tests in 276 suites failed after 12.392 seconds
  with 3 issues (including 2 known issues).
** TEST FAILED **
EXIT=65
```

The one non-known issue:

```
✘ Test introGate_freshUser_pollsUntilTourResolves() recorded an issue at
  CompanionCoachingModelTests.swift:384:9: Expectation failed: (result → false) == true
✘ Test introGate_freshUser_pollsUntilTourResolves() failed after 7.794 seconds with 1 issue.
✘ Suite CompanionCoachingModelTests failed after 9.799 seconds with 1 issue.
```

That is the timing flake iOS-A recorded in Wave 1 — a 10 ms poll against a 50 ms
`Task.sleep` handoff (`CompanionCoachingModelTests.swift:375-384`). `git diff
--name-only 107549568..HEAD` contains no Companion file, so this lane cannot have
caused it. Re-run in isolation on a separate
`-derivedDataPath` (signing left ON), it passes:

```
$ xcodebuild test … -only-testing:PatinaTests/CompanionCoachingModelTests …
✔ Test introGate_freshUser_pollsUntilTourResolves() passed after 0.127 seconds.
✔ Test run with 24 tests in 2 suites passed after 0.130 seconds.
** TEST SUCCEEDED **
PROBE_EXIT=0
```

**So the gate is green on this lane's own work.** The `unit` tier's exit 65 is the
known flake, not a red gate this lane owns — but the orchestrator should note that
`ios-gate.sh unit` does exit non-zero on this tree as run.

The other two issues are the pre-existing pair both iOS lanes report (a
`BrandVoiceLint` expectation on "curated_mix" and
`RoomLifecycleTests.theTodayRailFollowsALocalDelete`).

2436 tests in 265 suites at the Wave 1 close; **2524 in 276** here — this lane's five
new suites, which matches its own log exactly.

## Item-by-item

| item | delivered? | where |
|---|---|---|
| **P-21** two `Kind` cases | yes | `HouseRecord.swift:41`/`:43`, rows built at `:629-630`, `:851-933` |
| P-21 second person, honest date | yes | `ProjectApprovalCopy.recorded(_:)`; date is `respondedAt` / `signed_at` only |
| P-21 ages out on the existing 7-day window, no special-casing | yes | falls into the `default:` arm of the window filter, `HouseRecord.swift:396-409` |
| P-21 resolved-at flows through the read | yes (already did) | `RemoteProjectApprovalReview.respondedAt`; `BadgeCountService.projectApprovals` retains answered rows |
| P-21 Codable back-compat, unknown kinds decode safely | yes | `HouseRecordRow.init(from:)` raw-string decode + `HouseRecord.rows(in:forKey:)` row-by-row skip |
| P-21 honour `viewer_role` | **partly — see M1** | `ProjectApprovalViewerRole`, `viewerAnswers`, `awaitsClientInFeed` |
| **P-22** three categories, two acts, never Approve/Sign | yes | `NotificationCategories.swift` |
| P-22 registered at launch | yes | `AppDelegate.swift:51` |
| P-22 thread identifiers honoured | yes | `threadIdentifier(entityId:)`, `entity(fromThreadIdentifier:)`, `response…threadIdentifier` |
| P-22 "Ask a question" routes to the thread/composer for that entity | **no — see M2** | `NotificationCategories.conversationRoute` → `.threadList` in every live case |
| P-22 `DecisionPushHandler` wired, P-08 queue preserved | yes | `AppDelegate.swift:136-141`, navigates through `DeepLinkHandler.navigate` |
| P-22 no attachments | yes | nothing mutable-content anywhere |
| **P-06** proposal/invoice arms confirmed live | yes | annotations replaced with the Wave 1 call sites; pinned by `NotificationDeepLinkRoutingTests` |
| P-06 `#anchor` and `?proposal=` tolerated | yes | `route(forDeepLink:)` → anchor → query → path |
| **Vocabulary sweep** on the touched rails | yes | Studio hub row title Approval/Approvals with no figure and no checkmark; bell already ruled; `ApprovalVocabularySweepTests` |

## Findings

### M1 — `viewer_role`'s third value, `household`, maps to "she answers" (major, confidence 0.9)

`supabase/migrations/00569_approval_why_viewer_role_and_receipt.sql:884-888` (branch
`approvals/w2-backend`) emits exactly three values:

```sql
'viewerRole', CASE
  WHEN snapshot.decision_lead_id = v_actor THEN 'lead'
  WHEN v_is_studio THEN 'studio'
  ELSE 'household'
END,
```

and the function's own `COMMENT` advertises them: `viewerRole — lead | studio | household`.

`ProjectApprovalViewerRole` (`DecisionsAPIClient+ProjectApprovals.swift:54-83`) knows
`lead` (in `answering`) and `studio` (in `observing`). `household` is in neither, so it
normalises to `.unspecified`, and `viewerAnswers` is `!= .observes` — i.e. **true**. A
household reader who is not the frozen lead therefore keeps the row under NEEDS YOU
(`awaitsClientInFeed`) and, once the real lead answers, reads
`"You approved this edition."` over an act she did not take.

The backend's own comment says the value is "reachable only after a lead reassignment".
Reading `get_project_decision_reviews`' row filter — `AND (v_is_studio OR
snapshot.decision_lead_id = v_actor)` at `:969` — such a row is currently filtered out
before it can be serialized, so the mismap is **latent, not live**. It is still wrong
against the field's declared vocabulary, it is exactly the confirmation the lane's own
note #4 owed, and the day the backend loosens that filter (which is the only reason to
name the value at all) the default-include fires silently.

Fix: add `"household"` to `ProjectApprovalViewerRole.observing`, and pin the three
literal strings `00569` emits in `AfterglowRowTests.theRoleVocabularyIsNormalised` —
today that test asserts `"studio_comember"`, `"co member"`, `"decision_lead"`,
`"client"`, none of which the migration produces (`"LEAD"` is the only real value
covered, and only by casing).

### M2 — "Ask a question" cannot reach a thread on any envelope that exists (major, confidence 0.95)

`NotificationCategories.conversationRoute` reads `userInfo["thread_id"]`, then
`entity_type == "thread"`, then falls back to `.threadList`.

Nothing puts either in a `PATINA_*` envelope. `buildApnsPayload`
(`supabase/functions/apns-send/core.ts`, on base **and** on `approvals/w2-backend`)
returns exactly:

```ts
return {
  aps,
  entity_type: input.entity_type ?? null,
  entity_id: input.entity_id ?? null,
  notification_log_id: input.notification_log_id ?? null,
};
```

and `apnsCategoryFor` only assigns a `PATINA_*` category for `decision | proposal |
invoice` — never `thread`. So on **every** banner that draws these acts, "Ask a
question" lands on the Messages inbox with the approval's identity thrown away. The
brief's sub-item is "routes to the thread/composer for that entity"; what ships is
"routes to the inbox", always.

Compounding it: `ProjectApprovalCopy.acts[1].label` is also **"Ask a question"** — the
in-app button that records `needs_discussion` (HELD). The same two words now mean
"hold this edition and open the talk" on the screen and "open Messages" on the lock
screen, on the same rail, for the same approval.

The lane flagged this and asked the backend for `thread_id`; the backend lane's round-1
work did not add it. This needs a decision at integration, not a silent ship. The
cheapest honest destination that exists today is the entity itself
(`.decisionDetail` / `.proposalDetail` / `.invoiceDetail`) — where the discussion
surface lives — rather than a context-free inbox; or rename the lock-screen act so it
does not borrow the outcome's words.

### M3 — `resetForSessionChange()` never clears `projectApprovals`, and P-21 makes that array speak in the first person (major, confidence 0.75)

`BadgeCountService.resetForSessionChange()` (`BadgeCountService.swift:435-464`) clears `pendingDecisions`,
`pendingProposals`, the new `signedProposals`, `payableInvoices`, `threadSummaries`,
`projects` and `roster` — but not `projectApprovals`. That array is cleared only in the
guest branch of `performRefresh` (`:318`).

Before this wave the stale array fed `mergedDecisions` and the bell retitle, both of
which a following refresh overwrote. After this wave it also feeds
`HouseRecordBuilder.answeredApprovalRows` (`HouseRecord.swift:629`), so between a
session switch and the next **successful** refresh (an offline launch, a failed
refresh) account B's Today can draw `"You approved this edition."` with account A's
`artifactTitle` on the second line. One line fixes it:
`projectApprovals = []` beside `signedProposals = []`.

### M4 — the afterglow sentence is not the copy the brief names, and three of them are indistinguishable (major, confidence 1.0 that it deviates; needs a ruling)

Brief and deck: *"You approved the dining room budget." / "You returned the kitchen
plan set." / "You signed the design agreement."* — the act **and the thing** in one
sentence.

Shipped: `"You approved this edition."` with `artifactTitle` on the second line, and
`"You signed the proposal."` with the proposal title on the second line
(`HouseRecord.swift:851-933`).

The lane's reason is good and is recorded (`artifact_title` is
`'Budget checkpoint ' || checkpoint_code`, so interpolating it produces the
capital-mid-sentence defect the backend review already ledgered as F6), and it follows
the Wave-1 walk-fix precedent for the OPEN row. But MOVED draws at most three rows
(`maxRowsPerEyebrow = 3`), so a week in which a homeowner answered three approvals now
prints three identical headlines and the whole afterglow is carried by the second line.
Either rule the deviation in, or ask the backend for a lower-case display name the
sentence can take.

### m1 — the dismissal branch cannot fire (minor, confidence 0.9)

`NotificationCategories.categories()` builds each `UNNotificationCategory` with
`options: []`. Without `.customDismissAction`, iOS never delivers
`UNNotificationDismissActionIdentifier` to `userNotificationCenter(_:didReceive:)`, so
the delegate's `guard NotificationCategories.isOpening(…)` and
`aDismissalOpensNothing()` are testing code the OS will not exercise. Either pass
`.customDismissAction` (and the guard becomes the real thing the lane log claims) or
drop the claim from the notes.

### m2 — `queryRoute` omits `?order=`, the only query-param deep link anything actually writes (minor, confidence 0.9)

`grep -rn "clientProjectDeepLink(" supabase/functions` has exactly two production call
sites, both `stripe-webhook/index.ts:1311,1384`:

```ts
deep_link: clientProjectDeepLink(order.project_id, 'road', { order: order.id })
```

`?decision=`, `?proposal=` and `?invoice=` — the three keys `queryRoute` reads — have
**no** producer today (00534 writes `/decisions/<id>` paths, and `clientDecisionLink`
writes the same). So the mapping built covers shapes nothing emits and misses the one
that is emitted: that link falls through to `pathRoute` and opens the project rather
than the order, which `NotificationRouter.orderRoute` could have answered.

### m3 — the APNs half of the deep-link fallback is unreachable (minor, confidence 0.95)

`resolve(apnsUserInfo:)` now reads `userInfo["deep_link"]` and `userInfo["url"]`.
`buildApnsPayload` emits neither (see M2's quote), and `notify_client_attention`'s
`invoke_edge_function('apns-send', …)` body (`00534:200-208`) passes only `user_id`,
`title`, `body`, `entity_type`, `entity_id`, `notification_log_id`. The live half of
P-06's deep-link work is the **feed** path (`AppNotification.deepLink` ←
`notification_log.metadata`), which is real and correct. Harmless as written, but
`NotificationCategoryTests.openFollowsTheDeepLink` reads as if the lock screen
exercises it; it does not.

### m4 — `awaitsClientInFeed` keeps its Wave 1 stand-in now that the real field has landed (minor, confidence 0.85)

The doc comment on `awaitsClientInFeed` says, verbatim, "P-09's review confirmation is
therefore WEB-ONLY for Wave 1; the viewer-role field that would let the phone carry it
is a Wave 2 migration item." The field landed in this wave and the lane read it — but
`&& isPublished` stayed, so the review-confirmation leg is still web-only on iOS and
the comment now describes a restriction whose stated cause is gone. Out of the brief's
scope; worth a ruling rather than a quiet carry.

### m5 — the last numeric hints were relocated, not converted (minor, confidence 0.8)

`BadgeCountService+Attention.swift:55-58` (moved verbatim out of `BadgeCountService`)
still prints `"\(unreadMessageCount) new conversations"` and
`"\(activeProjectCount) projects are moving"`. Wave 1's walk fix put the neighbouring
approval figure into words via `PatinaCount` ("Five things need your eye"), and this is
the last digit left on the same subhead. The lane did not author the strings, but it is
the commit that moved them.

### m6 — the hub row is named "Approval" and still routes to "Decisions" (minor, confidence 0.9)

`StudioQueueBuilder.pendingDecisionRow` now titles the row Approval/Approvals but keeps
`route: .decisionList`, whose `displayName` is `"Decisions"` (`Coordinator.swift:155`).
A homeowner taps "Approvals" and arrives at a screen titled Decisions.

### n1 — the ageing test does not exercise the builder (nit)

`AfterglowRowTests.theAfterglowAgesOutOnTheOrdinaryWindow` builds the old row and then
asserts `!window.contains(oldRow.date)`. That is arithmetic about `DateInterval`, not
evidence that `HouseRecordBuilder.build` drops it. One `build(…)` call with the eight-day
row and an `#expect(record.moved.isEmpty)` would pin the actual behaviour the brief names.

### n2 — "You signed" asserts an identity the wire cannot confirm (nit)

`hasSignatureRecord` is true when either `signed_at` or `signed_by_name` is non-empty;
`RemoteProposal` carries no signer id. The second person is safe only because R3 keeps
one client login per project. Worth a comment, not a change.

### n3 — the row-skip loop has no progress guard (nit)

`HouseRecord.rows(in:forKey:)` relies on `SkippedRow` always consuming an element to
advance the unkeyed container. It does, on both the classic and swift-foundation
decoders (both increment only after a successful unbox). But if that ever stops being
true the `while !unkeyed.isAtEnd` loop spins forever on a corrupt snapshot. A recorded
`currentIndex` compare, or a `break` when nothing was consumed, is one line.

### n4 — `viewerRole`'s key name was never verified against the wire (nit — now verified)

The lane recorded that it could not confirm the projection's key spelling. It is
`'viewerRole'` (camelCase) in `00569:884`, which is what `RemoteProjectApprovalReview`'s
synthesized `CodingKeys` decode. **Confirmed correct** — recording it so the integration
steward does not re-open it.

## Carried, not this lane's diff — but it ships in this wave

- **`ProjectApprovalCopy.acts` still labels `changes_requested` "Decline"**
  (`apps/mobile/Patina/Patina/Features/Decisions/ProjectApprovalCopy.swift:41`).
  `rulings-2026-09-04.md` is explicit: changes_requested is RETURNED everywhere, never
  "Declined". The lane flagged this as advisory #1 and left it to P-16/iosc to avoid a
  merge conflict. `approvals/w2-iosc` at `fdbcc0111` (P-17 only) has not changed it:
  `git show approvals/w2-iosc:…/ProjectApprovalCopy.swift | grep -n 'label:'` still
  prints `41: label: "Decline",`. **Unless a lane picks this up, a ruling violation
  ships in front of a homeowner.** Orchestrator call.
- `ProposalDetailView.swift:174` draws `PatinaStatusBadge(state: .error, text:
  "Declined")` for a declined proposal — a badge, in an error state, on a commercial
  document. R13 allows the word in terracotta ink; the badge and the `.error` state are
  P-17's territory.

## What I verified beyond reading the diff

- **The wire, against `approvals/w2-backend` as it stands.** `00569:884-888` emits
  `viewerRole` (camelCase — the key `RemoteProjectApprovalReview` decodes) with
  `lead | studio | household`; `apns-send/core.ts` emits `aps.category` =
  `PATINA_DECISION|PATINA_PROPOSAL|PATINA_INVOICE`, `aps["thread-id"]` =
  `<entity>-<id>` and `interruption-level: "active"`, with no `mutable-content` and no
  `thread_id` custom key. The lane's category reader, thread-identifier splitter and
  "no attachment" position all match. Its viewer-role table does not (M1); its
  "Ask a question" destination cannot (M2).
- **`list_my_project_decision_reviews` delegates to `get_project_decision_reviews`**
  (`00467:135-176`), so the list the phone reads carries `viewerRole` too — the lane's
  one read is enough.
- **Every deep-link producer.** `grep -rn "'deep_link'" supabase/migrations` +
  `grep -rn "clientProjectDeepLink(" supabase/functions`: the client-facing shapes are
  `/decisions/<id>` (00464:2316, 00465:200, 00534:156), `/proposals/<id>`,
  `/invoices/<id>` (00534), and `/projects/<id>?order=<id>#road` (stripe-webhook).
  `pathRoute` handles the first three; the fourth is m2. The designer-side shapes
  (`/doc/<id>`, `/work/<id>/site/<id>`, `/portal/billing/invoices/<id>`,
  `/desk?book=…`) all correctly resolve to nil — no false mapping.
- **Refusal grep over the added lines** (`git diff main...HEAD -- apps/mobile`, `^+`
  only, for `overdue|gate|task|dashboard|AI|declined|sage|green|red|checkmark|badge|
  emoji|shadow|confetti`): every hit is a code identifier or a comment. **No refused
  word reaches a homeowner-visible string this lane authored.** The Studio hub title
  and detail print no digit and keep `hand.raised`.
- **The window rule.** `HouseRecord.swift:396-409` — the two new kinds fall into the
  `default:` arm, `window.contains(row.date) ? row : nil`. No special-casing, no new
  decay rule, exactly as P-21 requires.
- **The skip loop actually advances.** `try? unkeyed.decode(HouseRecordRow.self)`
  leaves `currentIndex` where it was on both the classic `__JSONDecoder` and
  swift-foundation (both advance only after a successful unbox), so the
  `SkippedRow` consume is load-bearing and correct — not decoration.
- **Commit hygiene.** Each commit's `--stat` touches only its item's files; the two
  docs commits touch only `iosd-notes.md`, force-added as ruled.


## The throwaway probe (written, run, deleted)

A single `ZZReviewProbeTests.swift` was added to `PatinaTests`, run on a separate
`-derivedDataPath`, and removed (`git status` is clean; no gate artefact remains). It
printed, from the real code paths:

```
PROBE viewerRole "lead"      → answers
PROBE viewerRole "studio"    → observes
PROBE viewerRole "household" → unspecified
PROBE household viewerAnswers = true
PROBE household afterglow rows = 1 title=You approved this edition.
PROBE household awaitsClientInFeed = true
PROBE studio awaitsClientInFeed = false
PROBE lead   awaitsClientInFeed = true

PROBE ask route  = Optional(Patina.AppRoute.threadList)
PROBE open route = Optional(Patina.AppRoute.decisionDetail(decisionId: "d-1"))

PROBE order deep link    → Optional(Patina.AppRoute.projectDetail(projectId: "proj-1"))
PROBE roadless order link → nil
```

The `ask` / `open` pair was resolved against a byte-for-byte reconstruction of what
`buildApnsPayload` on `approvals/w2-backend` sends — `aps.category = PATINA_DECISION`,
`aps["thread-id"] = decision-d-1`, `interruption-level: active`, `entity_type`,
`entity_id`, `notification_log_id`, and nothing else. **Open** lands on the approval.
**Ask a question** lands on the inbox. That is M2, measured rather than argued.

`household` producing an afterglow row and a NEEDS YOU row is M1, measured. `studio`
correctly produces neither — iosb3-M2 is genuinely closed for the value that is live
today.

## What the lane got right, and should not be "fixed" in a later round

- **The silence rules.** Four independent conditions gate the afterglow row
  (`viewerAnswers`, `!isClosedByDisposition`, a known outcome word, a real
  `respondedAt`) and two gate the proposal (`isSigned && hasSignatureRecord`, plus
  `signed_at`). A designer-side `status = 'accepted'` correctly draws nothing. That is
  P-21's "never invented" discipline, kept.
- **One sentence, not three.** Reusing `ProjectApprovalCopy.recorded(_:)` for the
  Record, the screen and the bell makes it structurally impossible for one outcome to
  be named three ways, and it is why RETURNED holds for `changes_requested` on all
  three without a third string to police.
- **`isOwnAct` / `markingNew`.** An afterglow row is never ticked NEW. The Record does
  not report the reader to herself as news; this is the right reading of B §2 and it is
  tested.
- **The snapshot decode is a real improvement over the base.**
  `RecordSnapshotStore.load` returned `nil` on ANY decode error
  (`RecordSnapshotStore.swift:324-336`), so one unknown kind blanked Today on the first
  cold launch after a downgrade. Row-by-row decoding costs one row instead. The
  encoded shape is unchanged, so a snapshot written by this build still reads on an
  older one (minus the two new rows).
- **The refusal is pinned, not just observed.** `refusedActionWords` +
  `PatinaNotificationAction.allCases.count == 2` is the thing that stops a later hand
  adding an Approve act to the lock screen. Keep it.
- **Two moved Wave 1 pins are honest.** `WalkCASAndFeedTests.bothFeedsReadOnePredicate`
  now carries all three clauses of `awaitsClientInFeed` (so dropping any one still goes
  red), and `anUnissuedEditionIsNotCountedAsAnApproval`'s subject — the DETAIL line — is
  untouched; only the title changed, which is the sweep's point.

## Recommended order for round 2

1. **M1** — add `"household"` to `observing`, and pin `"lead" | "studio" | "household"`
   verbatim (one line + one test).
2. **M3** — `projectApprovals = []` in `resetForSessionChange()` (one line + one test).
3. **M2** — orchestrator ruling: either land "Ask a question" on the entity's own screen
   (which exists today) or rename the act; and decide whether the backend adds
   `thread_id` to the `PATINA_*` envelope in this wave.
4. **M4** — orchestrator ruling on the afterglow sentence.
5. **The carried "Decline" label** — assign it to a lane before integration, or it ships.
6. m1, m2, m6, then the nits.
