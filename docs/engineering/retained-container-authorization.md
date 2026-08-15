# Retained Container authorization contract

Status: Phase 1 blocker 2 implementation contract
Applies to: orders, projects, and media Containers

## Request contract

Supabase access-token verification establishes identity only. A valid request
must satisfy the configured issuer and audience, use an allowed signing
algorithm, be unexpired, contain a nonempty `sub`, and have
`role = 'authenticated'`. The request identity is immutable and always has
`id = userId = sub`.

JWT role, permission, organization, actor, and arbitrary application metadata
never authorize an action. Each retained Container resolves current
`user_roles`, `roles`, `role_permissions`, `permissions`, active
`organization_members`, and active `organizations` through its own
Prisma/Supavisor connection on every protected request. There is no
cross-request authorization cache and no connection-local caller state.

A protected Nest route must declare a canonical permission. An undecorated
protected route is denied. Missing or invalid identity returns 401; a valid
identity without the global action permission returns 403; an object outside
the permitted relational scope returns the same 404 as a missing object.

Where a request reads or mutates Strata, authorization resolution and the
scoped object operation use the same Prisma transaction. SQL interpolation is
through Prisma's parameterized tagged templates; unsafe raw SQL is prohibited.

## Canonical scopes

| Container | Permission alternatives                                                                                      | Authoritative object relationship                                                                                                                                                                                                                                                                                            |
| --------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| orders    | `order.read.own`, `order.read.org`, `order.manage.own`, `order.manage.org`, `order.admin.all`                | Own scope is `svc_orders.orders.user_id = sub`. Organization scope is the order's `organization_id` FK plus current active membership in an active organization. Cart scope is `carts.user_id = sub`; payments, refunds, and shipments inherit scope only through their order.                                               |
| projects  | `project.read.assigned`, `project.manage.own`, `project.read.org`, `project.manage.org`, `project.admin.all` | Direct service client/designer assignments remain authoritative. `svc_projects.projects.public_project_id` links to the canonical public project for current client, designer, active team, and active studio membership. Nested records inherit only through their `project_id`.                                            |
| media     | `media.read.own`, `media.manage.own`, `media.read.org`, `media.manage.org`, `media.admin.all`                | Personal assets use `uploaded_by = sub` when they are not product-owned. Product assets use the product's `owner_user_id` or `studio_id` plus current active membership. Board operations use the board's relational proposal/project, designer, and studio graph; JSON metadata and asset `permissions` never grant access. |

The `*.admin.all` permissions are the only unscoped alternatives. Media job
administration, CDN purge, broad search/reporting, and equivalent global
operations require `media.admin.all`; order reconciliation and protected
provider administration require `order.admin.all`; global project
administration requires `project.admin.all`.

## Covered route families

| Container | Protected domains                                                                                                                                                                                                                                                                                                                                      |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| orders    | carts and cart items; checkout and payment-intent creation; order list/count, ID, number, batch, status, update, and cancellation; payments and capture/cancel; refunds; fulfillment rates, shipments, labels, tracking, status, update, validation, and refund; reconciliation; version; authenticated carrier webhook fallback                       |
| projects  | project create, list/count, ID, batch, client view, statistics, progress, activity, and upcoming data; tasks and comments; documents; approvals; change orders; RFIs; issues; milestones; daily logs; project updates; timeline and progress analytics; engagement analytics; audit; notifications; metrics; version                                   |
| media     | asset list/count, get, renditions, batch, upload/confirm, update, delete, move, copy, reorder, process/reprocess, download, statistics, and 3D preview; product/metadata search; AI, intelligence, analytics, and reporting; background-removal board operations; CDN purge; job list/get/retry/cancel/complete, QC, and queue administration; version |

Batch responses contain accessible rows only and do not return positional nulls
or inaccessible identifiers. List and count queries share the same scope
predicate. Body/query `userId`, organization, role, permission, or actor values
cannot replace verified/current state.

## Public exceptions

The reviewed public surface is deliberately small:

- orders health routes;
- orders Stripe webhook, only after Stripe verifies the signature against the
  exact raw request body;
- projects `/v1/health`, `/v1/healthz`, and `/v1/ready`;
- media `/health`, registered directly as a minimal adapter health response.

Orders carrier webhooks remain authenticated because their signature verifier
is not implemented. Media job completion remains authenticated and requires
`media.admin.all`; its former shared-secret callback is not a signed provider
webhook. Version, metrics, Swagger, and all business routes are not public.

## Migration ownership

Migration `00482_retained_service_authorization_contract.sql` owns the new
permission rows, least-privilege role mappings, the nullable orders
organization FK, and the nullable unique service-to-public project FK. Existing
rows remain unlinked when no authoritative relationship exists; no JSON
backfill is allowed. The migration adds no `PUBLIC`, `anon`, or generic
`authenticated` grants and does not change the separate database ACL blocker.
