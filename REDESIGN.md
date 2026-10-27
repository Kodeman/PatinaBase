# Designer portal redesign — start here

**Approved direction:** Room Proof 08, “The whole studio. One working paper.”

**Integration branch:** `redesign/designer-portal-round8`

**Preparation baseline:** `ee9c450a582bc677a635a7e451425db4e1e51b4a`

**Founder approval and branch preparation:** 23 October 2026

This branch carries the approved interactive reference and an implementation program. It is primed for development teams; the preparation commit does not rewrite the application, alter a database or deploy anything.

1. Read the [program brief](docs/design/designer-portal-round8/README.md).
2. Explore the [approved presentation](artifacts/room-proof-round8-2026-10-23/index.html), [studio](artifacts/room-proof-round8-2026-10-23/studio.html) and [job paper](artifacts/room-proof-round8-2026-10-23/job.html).
3. Follow the [agent kickoff and ownership contract](docs/design/designer-portal-round8/AGENT-HANDOFF.md).
4. Implement the [sequenced work packages](docs/design/designer-portal-round8/DELIVERY-PLAN.md), preserving the [domain contracts](docs/design/designer-portal-round8/DOMAIN-CONTRACTS.md) and meeting the [acceptance catalog](docs/design/designer-portal-round8/ACCEPTANCE.md).

The production starting point is the existing **document-native portal**, not the retired zone portal and not the mockup's vanilla JavaScript/local storage. Keep existing functionality, real data, authorization, history and exports. Bring the approved composition to that foundation.

The work-package documents are specifications, not a second execution queue. For commissioned repository work, follow K1 in [DECISIONS.md](docs/design/designer-portal-round8/DECISIONS.md): Sidequest owns engineering dispatch through integration; `agent_tasks` remains the Agent OS runtime business queue.
