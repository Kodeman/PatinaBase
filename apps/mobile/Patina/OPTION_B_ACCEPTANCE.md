# Option B — Companion System Acceptance

Option B turns the existing Companion into Patina's consistent relationship
layer. It extends current production data and interaction patterns; it does not
replace the room-capture pipeline, add a second navigation system, or introduce
mock-only product surfaces.

## Companion contract

- The current three-strata mark remains visible in every Companion state.
- Collapsed is the default: a centered 56–64 point dark circle with one short,
  contextual hint below it.
- At accessibility text sizes, the visual hint may collapse into the circle's
  spoken value so the Companion never obscures the active surface.
- The Hearth is reserved layout space, not a persistent visible bar. App content
  does not render beneath the active Companion shape.
- Progress is a compact morph of the same shell for bounded work such as quiz or
  scan progress.
- Expanded is the same shell with room for rationale or a decision. A full sheet
  is reserved for longer conversation and review.
- Geometry settles before copy enters. Standard motion uses a 420–520 ms spring;
  Reduce Motion uses a short crossfade with no ambient pulse.
- Every state has a VoiceOver label, value, hint, logical reading order, and a
  minimum 44×44 point interactive target.

## Context and Today contract

- Context comes only from real, available signals: style preferences, rooms,
  saved pieces, scan state, active design work, and recency.
- Memory is privacy-conscious, locally inspectable, off by default, and only
  begins after an explicit customer opt-in. It can be disabled or cleared at
  any time.
- The taste portrait explains materials, warmth, formality, and confidence in
  plain language and provides a tuning route.
- Today presents exactly one prioritized next move, one real editorial or taste
  story, and one active room. Missing data produces a truthful fallback rather
  than fabricated rationale.
- Editorial and room modules prefer real available imagery. Missing photography
  uses an honest branded fallback; the app does not invent or mislabel imagery.

## Studio contract

- Studio is grouped by customer attention: Awaiting you, In progress,
  Conversation, Money & documents, and Archive.
- Grouping and urgency are derived from existing project, decision, proposal,
  invoice, document, budget, and message states.
- Empty, loading, error, and signed-out states remain navigable.
- The Companion receives only a concise attention summary; Studio records stay
  in their purpose-built screens.

## Trust and accessibility contract

- Camera copy distinguishes local capture from later explicit sharing.
- Copy acknowledges the actual room, image, mesh, and related artifacts captured
  by the current scan pipeline and explains when upload can occur.
- A meaningful manual room route is available before or after camera denial.
- Touched screens recompose at accessibility text sizes, meet the existing
  contrast target, and keep controls at least 44×44 points.

## Instrumentation

Existing analytics paths record non-PII events for Companion state exposure,
expansion, hint activation, dismissal, Today next-move selection, Studio queue
activation, memory reset/disable, and manual room routing where those event
surfaces already exist.

## Verification levels

- Build and unit gates establish compile-green behavior.
- Simulator UI checks establish non-hardware interaction, layout, VoiceOver
  semantics, Dynamic Type, dark appearance, and Reduce Motion behavior.
- Camera, RoomPlan, ARKit, LiDAR, and device upload behavior remain
  device-verified claims only. Option B does not change those pipelines, and no
  hardware claim may be made from Simulator evidence.
