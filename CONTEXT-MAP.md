# Context Map

## Contexts

- [Residential Project Workflow](./docs/design/workflow-completion/CONTEXT.md) — guides a studio, household, project team, and commercial partners from inquiry through post-occupancy care.

## Relationships

- **Workflow → Commercial systems**: workflow gates decide when an authorized act may be requested; the selected procurement or billing rail remains the money and transaction authority.
- **Workflow → Documents**: workflow references immutable Plan Room, Spec Book, proposal, review, and authorization editions; it does not duplicate their contents.
- **Workflow → Communications**: workflow supplies context, recipients, due dates, and escalation; communication delivery remains in the existing comms and notification systems.
- **Workflow → Agent OS**: assistants may prepare reviewable work through `agent_tasks`; they never change project authority or business records directly.
