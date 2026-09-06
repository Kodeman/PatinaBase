# Wave 3 — walk fixes, round 1

Lane: walk-fix. Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w3-integration`,
branch `approvals/w3-integration`, on top of the carry-fix tip `2385cfe8a`.

Five findings from the two round-1 walks: one blocker and two majors on iOS
(`walk-ios-r1.md`), three majors on the web doorstep (`walk-web-r1.md`). All five are closed. No
other finding in either walk was touched, and nothing outside the five was changed.

---

## `W3R1-B1` — blocker · the Record of Decision had no door

`apps/mobile/Patina/Patina/Features/Shared/Views/RecordSheet.swift`

`KeepACopyAct` rendered its `ShareLink` inside a `Group` that held nothing until `sheetImage`
arrived, and the `.task` that makes `sheetImage` was attached to that same `Group`. Until the
image existed the `Group` **was** an `EmptyView`, and an `EmptyView` carries no modifiers — so the
task never ran, the image was never made, and "Keep a copy" was absent from every settled record
in the shipped build. The walker found it missing on three: a Stage-2 approval answered in the
walk, one settled earlier, and a signed proposal.

The render now hangs off `renderAnchor` — a zero-height, accessibility-hidden `Color.clear` drawn
unconditionally — and the act above it stays conditional, which was always the rule (an act that
cannot succeed is not offered) and never the defect.

Tests (`PatinaTests/RecordOfDecisionTests.swift`, +`import UIKit`):

- **the sheet renders to a real image** — calls `RecordKeepsake.image(record)` for the first time
  in the suite's life, requires a non-nil `UIImage`, and asserts non-zero size and
  `scale == RecordSheet.renderScale`. The suite walked `RecordOfDecision.printedLines` and never
  the renderer, which is exactly why the whole act could be missing with the suite green.
- **the render is anchored to a view that always exists** — pins `private var renderAnchor` ahead
  of the file's only `.task`, and pins the `Color.clear` that makes the anchor real.

## `W3R1-M1` — major · the recommended plate could not say its own name

`apps/mobile/Patina/Patina/Features/Decisions/Views/DecisionDetailView.swift`

On the two-plate spread at the default text size, "Shaker Oak" drew as "Shak…". C-06 had given the
`Recommended` capsule `.fixedSize(horizontal: true)`, so in a shared `HStack` the capsule took its
intrinsic width first and the 171pt plate handed the title the remainder. The AX label carried the
full title and the act beneath read "I choose Shaker Oak" — a rendering truncation, on the exact
two-option case P-30 was built for, and it persisted after the answer.

The capsule is now one view (`recommendedCapsule`) drawn from one place, and the naming block moved
to `plateNaming(_:hasDetails:isRecommended:compact:)`: beside the title at full width, on its own
line beneath the title when `compact`. The accessibility path (`.stacked`, `compact: false`) is
unchanged and was already correct.

The extraction is not decoration — the inline version pushed `plate(_:compact:)` to 57 lines and
SwiftLint's `function_body_length` (50) fired, which `ios-gate.sh lint-delta` fails on.

## `W3R1-M2` — major · the paged spread ran 24pt off the screen

Same file. `.padding(.horizontal, 24)` sat on the `LazyHStack` **inside** the `ScrollView`, while
each card took `.containerRelativeFrame(.horizontal, count: 1, spacing: 12)` — which measures the
scroll view and knows nothing about padding applied within it. Every plate was a full 402pt wide
starting at x=24, so 24pt of each hung off the right edge: the `Recommended` capsule sliced in half
on page one, and the filled clay dot that shows which plate is leaning drawn outside the viewport.
On a three-option decision the leaning is the thing you cannot see.

The inset moved onto the scroll view as `.safeAreaPadding(.horizontal, 24)`, which insets the
container that `containerRelativeFrame` actually measures.

Tests (`PatinaTests/DecisionSpreadTests.swift`), both source pins in the file's established idiom:

- **the compact plate gives its title the row, and puts the mark beneath** — pins both branches,
  and pins that `Text("Recommended")` appears exactly once so the two placements cannot drift.
- **the paged spread insets the scroll view, not the row inside it** — slices the file between
  `pagedPlates` and `pageDots` and requires `.safeAreaPadding(.horizontal, 24)` present and
  `.padding(.horizontal, 24)` absent inside that slice, plus the `DecisionSpread.layout` rows that
  say three-or-more is the case this geometry serves.

## `W3W-R1-01` — major · the revision act was illegible

`apps/client-portal/src/components/threshold/approval-ask.tsx`

P-27's forward act inherited `--color-clay` (#C4A57B) on the doorstep's #FAF7F2 — 2.17:1 at 15px
against a 4.5:1 floor, axe's only serious contrast failure left on the doorstep and Wave 3's own
new element. Both render sites (`a[data-testid="approval-receipt-forward"]` on the closed record,
and the `nav > a` on the open ask) now carry `text-[var(--text-body)]` — #5C4A3C, 6.94:1 on the same
ground. Clay keeps the rules and the caps, where contrast is not a legibility question; this is the
same shape as the lane's own W3-03 fix for the spine-gate kind line.

Tests: `draws the revision act in body ink, never in clay`, plus two assertions added to the
existing receipt-forward test — the class is present and no `clay` appears in the className.

## `W3W-R1-02` — major · the standing snooze did not survive re-entry on web

`apps/client-portal/src/components/threshold/approval-ask.tsx` ·
`packages/supabase/src/hooks/use-project-approvals.ts` · `packages/supabase/src/hooks/index.ts`

The web had only the write half. A cold load of an approval carrying a `decision_snoozes` row drew
the four Remind-me acts with no said-line — byte-identical to one never snoozed. iOS closed exactly
this at the carry-fix round (`3066f8c6e`); web was the divergent surface.

The read half, mirroring iOS one for one:

- `useDecisionSnooze(decisionId)` — a plain `.from('decision_snoozes').select('kind,snoozed_until')
  .eq('decision_id', …).limit(1)`. No user filter: `decision_snoozes_owner_select` (00572) already
  hands back her own row and nobody else's, and a client-side copy of the policy would be the
  weaker of the two. A list rather than `maybeSingle()` for iOS's reason — `UNIQUE (user_id,
  decision_id)` makes at most one row possible.
- `standingDecisionSnooze(row, now)` — the honesty rule `DecisionSnooze.standing` applies on the
  phone: an unknown kind draws nothing, an empty or unparseable `snoozed_until` draws nothing,
  `'infinity'` (`never`, and a dateless `when_due`) always stands, and a hold whose hour has passed
  is refused rather than announced.
- `projectApprovalKeys.snooze(decisionId)` rides the existing approval invalidation rail, so the
  ask redraws with the snooze it was just given.

`RemindMe` reads it on mount and draws the same confirmation sentence the act draws. This session's
answer wins over the row — it is the newer of the two and its refetch may not have landed. The menu
still stands under a standing hold; nothing about the four acts, the past-due branch, or R16's two
exceptions changed.

Tests — `packages/supabase/src/hooks/__tests__/use-project-approvals.test.ts` (the shared
`createBrowserClient` mock gains a `from` builder; nothing else in the file used one): the table,
columns, filter and limit the read sends; `enabled: false` with no decision; null where she has
never snoozed; a lifted hold refused and a standing one returned; `infinity`; and six shapes that
draw nothing. `apps/client-portal/.../approval-ask.test.tsx`: the said-line on a fresh load before
any press (with the menu still there), silence when nothing stands, and this session's choice
speaking over the stored one.

## `W3W-R1-03` — major · `landmark-unique` still fired

Same component. W3-04's `Discussion about {title} · Edition {N}` does not separate two approvals
hanging off one artifact edition — the ordinary case, and the walk fixture's own G1/G2 and G6/G7
pairs each do it. The decision id is the only thing on the page unique per thread, so it now closes
**every** landmark name: `Discussion about {title} · Edition {N} · approval {decisionId}`, and the
untitled fallback `Discussion about approval {decisionId}` is unchanged. The visible heading ("The
discussion") is untouched.

Tests: the two existing landmark tests updated to the new shape, plus **tells two approvals on one
artifact edition apart** — two asks on one edition rendered together, two distinct `aria-label`s.
