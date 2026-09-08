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

## Review access

The integration worktree serves a local-only preview at
`http://127.0.0.1:3002`. Use the existing local fixture account
`client@patina.dev` / `password123` for the multi-house scenario or
`client-solo@patina.dev` / `password123` for Cedar Lane. These are public local
seed credentials, not production accounts. No database reset or reseed is
part of this review.

Manual Chrome inspection is currently blocked by an unrelated extension
interface; the user was asked to dismiss it. Rendered desktop/mobile sign-off
and human Patina feedback remain pending. The local preview is not a public
deployment, and this branch must not be promoted on the strength of unit
checks alone.
