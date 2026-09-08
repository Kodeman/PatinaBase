# Client material presence

Status: implementation and review branch; not deployed.
Authorization: Kody, September 7, 2026; VISION-DECISIONS V9.
Integration branch: `feat/client-material-presence`.

## Intended outcome

The client should recognize the home and its materials, understand what changed,
and find the next real action. Warm paper and editorial typography remain the
ground. Project imagery, stronger control boundaries and selective depth give
creative moments greater prominence.

The preceding 15-section proposal reviewed the current Threshold and designer
Desk, documented restrictive design rules, and proposed room-led client and
board-led designer experiences. This implementation covers the **client only**.
It does not ship the proposal's fictional project, dollar amounts, generated
room, sample notes, or demonstration approval semantics.

## Component contract

- Preserve the existing Threshold at `/` and `/projects/[projectId]`, including
  every anchor targeted by legacy links. Keep multi-house switching in the mat.
- Use the client's existing project, room, or product images with captions that
  identify their actual role. Product photography is not a photograph of the
  installed room. Do not infer completed work from the existence of an image.
- Where an image is absent or fails, show useful room/project information or
  the existing plan. Never fabricate an installation, a designer quote, or an update.
- Make primary actions visibly bounded with readable labels and at least
  44px targets. Preserve secondary and tertiary hierarchy, disabled reasons,
  keyboard focus and pending states.
- Keep approval totals, fees, retained amounts, signatures, purchasing
  consequences and payment handoffs exactly as established by the existing
  instruments. A visual redesign cannot weaken an authorization contract.
- Keep records compact. Use light surface elevation only for meaningful
  material/action groups and temporary sheets, not every line of data.
- Keep ledger/payment access and pending asks ahead of the room gallery.
  Missing imagery uses a compact record, not an empty hero. Active approvals
  receive stronger emphasis than historical receipts.
- Keep errors visible, local and recoverable. Keep success attached to the
  action and actual recorded state. Respect reduced motion.
- No global header, navigation zones, colored page bands, auto-playing effects,
  manufactured urgency, new task queue, or production configuration changes.

## Relationship to previous rulings

V9 is a client-only exception to inherited visual bans and text-only actions /
zero-shadow treatment. R135's continuous house page, named-decision anchors and
mat remain. R137's invoice handoff remains. The designer app's CLAUDE and
shadow gate are not changed by this work.

The audited main working copy contained `docs/vision/VISION.md`, but that file
is absent from this branch's committed base. This branch records authorization
in the existing tracked vision decisions log rather than recreating or
overwriting an untracked governing document.

## Delivery team

- Client UI implementation: Threshold composition, rooms, imagery, actions,
  surface styling and focused regression tests, in an isolated worktree.
- Integration: documented scope, dependency build, local environment, preview,
  verification and integration branch.
- Independent QA: existing fixture and test coverage audit, workflow invariants.
- Independent Patina review: design/brand fit, accessibility and functional
  regressions after an integrated preview exists. Review findings must state
  confidence and severity and distinguish observed behavior from inference.

## Required review scenarios

1. A house with rooms, product imagery, a standing approval and an invoice.
2. No room/project image, a failed image URL, and a room without items.
3. A house without pending work and a client with only studio invoices.
4. Multiple pending asks and direct named-decision anchors.
5. Existing approval/signature safeguards, refusal recovery and payment links.
6. 390px and desktop layouts; keyboard focus and reduced motion.
7. Long names, multiple houses and all existing instruments still reachable.

Verification uses the client `type-check` gate, focused Threshold tests and
an integrated preview. A successful build alone is not a type check. Fixture
previews must be labeled; their rendered data is not proof of production reads
or writes. Live production mutations and deployment are out of scope.

Human feedback has not been collected unless explicitly recorded in the final
review report. Agent review is not a substitute for Kody or Leah's response.

## Independent review, September 7, 2026

The implementation was reviewed in separate agent contexts for Patina product
design and functional/accessibility correctness. This is **agent feedback**;
no statement below represents a response from Kody, Leah, or a client.

| Finding | Severity / confidence | Requested correction |
| --- | --- | --- |
| Gallery precedes payment and pending asks, especially costly on phones | High / high | Put imagery after actionable asks and before detailed room records |
| Missing photography becomes repeated large empty tiles | Medium / high | Compact image-free records; enlarge only actual photography |
| Active asks and recorded receipts receive equal emphasis | Medium / medium | Quieter, flatter receipt treatment |
| Trade selections use goods progress and piece wording | Medium / high | Use the existing trade journey and scope terminology |
| Visible detail action differs from its accessible name | Medium / high | Include the visible action words in the accessible name |
| Featured fifth selection cannot be reached again in a four-item picker | Low / high | Expose every selection and preserve its selected state |

The reviewers supported the direction: genuine selection imagery with an
honest caption, editorial house identity, warm surfaces, clearer controls,
and preserved room records. They found no new mutation of existing action
handlers, signature/hold semantics, payment handoffs, or fragment IDs in the
scoped implementation. This is source-review evidence, not an exhaustive
production or accessibility certification.

All six corrections were implemented in `9bbba87f3` and confirmed by the
independent reviewers in a second source review. The design reviewer approves
the corrected direction **for review**, not for deployment.

One nonblocking medium-severity review risk remains: room-scoped signature and
trade-acceptance gates retain their existing place within each room, below the
gallery and plan key. The ordering is confirmed; the practical mobile impact
is not measured. Human review should specifically test finding and reaching
these actions on a phone. No financial gate was relocated or weakened.

## Review access

The integration worktree serves a local-only preview at
`http://127.0.0.1:3202`. Use the existing local fixture account
`client@patina.dev` / `password123` for the multi-house scenario or
`client-solo@patina.dev` / `password123` for Cedar Lane. These are public local
seed credentials, not production accounts. No database reset or reseed is
part of this review.

Manual Chrome inspection is currently blocked by an unrelated extension
interface; the user was asked to dismiss it. Rendered desktop/mobile sign-off
and human Patina feedback remain pending. The local preview is not a public
deployment, and this branch must not be promoted on the strength of unit
checks alone.

## Verification evidence

- Final integrated `pnpm --filter @patina/client-portal type-check`: passed.
- Final integrated `pnpm --filter @patina/client-portal test -- --runInBand
  src/components/threshold src/lib/threshold`: **53 suites, 1,184 tests passed**.
  This includes trade labels, fifth-selection return, visible/accessibility
  action names and gallery placement after project-level asks.
- The initial non-writing Threshold browser run passed 11 of 13 tests. The
  date assertion expects September 14 (`today + 7`); a read-only local DB
  query confirmed the invoice actually stores September 15. No fixture or
  financial value was changed to make the test green.
- The multi-house sign-in test passed alone, but timed out in both batch runs.
  The final failure snapshot shows the sign-in service temporarily unavailable.
  Authentication code is outside this change; this remains an unresolved
  local test-environment issue, not a demonstrated visual-regression cause.
- Final browser rerun: **10 of 12 passed** after excluding the writing test and
  known date mismatch. Both failures occurred during sign-in before the
  multi-house and acceptance assertions; the acceptance scenario passed in
  the initial run. These are not waived: final end-to-end sign-off is pending.
- The auto-started test server explicitly reports its role check skipped
  because Playwright's process environment has no service key. These browser
  results therefore do **not** verify role-gate enforcement. The manual preview
  uses a separately generated, local-only environment profile.
- Whitespace diff checks pass. Existing local Prettier warnings are advisory;
  no repository-wide reformat or production build/deploy was performed.

The implementation agent's clean worktree and merged local branch were
removed after integration. The integration worktree is deliberately retained
to serve the requested local review; remove it after that review, not while
the preview is in use. The shared main checkout was not modified.

## Second pass: imagery, September 8

Kody requested another pass with imagery. The local fixture has no usable
selection photography: Aspen and Cedar's furnishings point to the same
fixture pendant despite being named a table/chair; its storage URL returns
400, and local product-images/room-scans object counts are zero. Do not repair
that mismatch by representing concept imagery as actual product evidence.

### Design direction

Retain paper `#FAF7F2`, sheet `#FFFDF8`, olive `#354B36`, walnut `#77513A` and
ink `#2C2926`. Playfair carries room-scale titles; Inter carries controls and
explanations. A large, left-aligned room image sits beside a short material
story, followed by three photographic view controls. On phones the image,
story and views stack. The existing house identity and financial hierarchy
stay intact: this pass spends its visual emphasis on real texture, not more
decorative cards, colors or motion.

### Explicit review-only mode

`HousePreview` offers **Imagery study / Your project images** only when both
`NODE_ENV=development` and `NEXT_PUBLIC_PATINA_IMAGE_REVIEW=1`. The current
port-3202 launchd preview has that opt-in in its process environment; no
committed environment, production configuration, auth rule or business row
was changed. Production/test mode does not render the study even with the
flag set. Without opt-in, the normal real-image view is unchanged except for
selection-picker thumbnails.

The study has Living, Dining and Materials views, prominently disclosed as
generated imagery, with no real project amounts or product identities
attached. Switching views changes only local presentation state. The actual
room records remain below; direct project-room links above the study reach
their existing gates. `#house-imagery` opens the review section directly.

Asset provenance and the exact generation prompts are recorded in
`apps/client-portal/public/design-review/imagery/README.md`. The living image
is reused from the original generated proposal; dining and material images
are newly generated. All three are local JPEG assets, not remote requests.

### Review and evidence

- Independent source review confirmed disclosure, production guard, lack of
  financial mutation, native keyboard buttons and retained room anchors.
- Reviewer-requested image-error announcement/retry and intermediate-width
  thumbnail stacking were implemented. Visual review also darkened project
  room links for readability.
- Browser inspected the authenticated Aspen local house at 1440px, 900px
  and 390px. Living/Dining/Materials images loaded, titles and pressed states
  changed together, and switching back restored the real room picker.
- Phone document width measured 390px at a 390px viewport (no page overflow).
  The Living Room shortcut placed the existing acceptance gate at 287px from
  the viewport top; acceptance remained disabled with no typed signature.
- Enter activated the imagery-mode control. Generated imagery is not proof of
  actual project photographs, signed-edition images, or production data reads.
- This checks the imagery pass, not the unresolved batch sign-in failures or
  every payment/approval path from the first review. No deployment occurred.
- Final client type-check passed; Threshold component/derivation tests passed
  **54 suites / 1,190 tests**. Independent source re-review confirmed both
  follow-up fixes with no additional findings in the corrections.

Real room photography is a separate data-integration task: use project/room
scan associations and signed cover URLs, not `heroImageUrl` (currently mapped
from a brief-document URL that may be a PDF). No silent sample-image fallback
is authorized for the production house.
