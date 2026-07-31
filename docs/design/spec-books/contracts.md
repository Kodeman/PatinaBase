# Spec Books contract

Status: frozen for the pilot implementation.

## Invariants

- `project_ffe_items` is the live project schedule.
- `products` is reusable master data. Project selection edits never update it.
- `project_ffe_specs` is one-to-one with an FF&E line and holds only project-specific
  selection data, declarations, provenance, and readiness.
- A revision and its revision items are append-only. Publication reads only frozen
  revision data, never the working book, live FF&E rows, products, or vendor records.
- An artifact belongs to exactly one revision, audience, and format. A failed
  artifact is retried in place; retrying does not create another revision.
- Guest and client access resolves a hashed share token to a ready immutable artifact.
  It never returns a working book, revision row, or raw storage path.

## Audiences

| Audience | Includes | Must exclude |
| --- | --- | --- |
| `client` | client price when deliberately snapshotted, selection, dimensions, public notes, care and warranty | trade price, markup, private notes, vendor contacts, procurement and install commentary |
| `vendor` | order-facing selection, dimensions, finish/material, quantity, approved vendor notes | client/trade price unless explicitly part of the template, markup, private notes, internal contacts |
| `installer` | location, quantity, dimensions, install notes, selected media | prices, markup, private notes, vendor contacts, procurement commentary |
| `internal` | the complete frozen snapshot | nothing required by the profile |
| `care` | care, warranty, public product identity and selected media | all prices, markup, private notes, contacts, procurement and install commentary |

Audience filtering is an allow-list. Unknown fields are excluded.

## Resolved item contract

Values resolve in this order:

1. explicit project-selection override;
2. current FF&E line value;
3. product master value;
4. studio custom field.

Each resolved value is represented as:

```json
{
  "value": "Walnut",
  "source": "project_override",
  "sourceUpdatedAt": "2026-07-30T15:00:00Z",
  "verifiedAt": "2026-07-30T15:05:00Z",
  "na": false,
  "naReason": null
}
```

`source` is one of `project_override`, `ffe_line`, `product_master`,
`studio_custom`, or `declaration`.

## Snapshot contract

`prepare_spec_book_issue` freezes a versioned JSON render snapshot on the revision.
The top-level shape is:

```json
{
  "contractVersion": 1,
  "book": {},
  "project": {},
  "template": {},
  "chapters": [],
  "items": [],
  "allowances": [],
  "tbd": [],
  "audiences": ["client"],
  "issue": {
    "type": "full",
    "reason": null,
    "baseRevisionId": null
  }
}
```

Items are ordered by chapter position, item position, then stable UUID. Every item
contains its document code, project/room/slot identity, quantity, selected media,
resolved selection fields with provenance, audience-safe notes, and a content hash.
The snapshot may contain internal-only fields because it remains designer-only; each
render model must apply its audience allow-list before serialization or layout.

The canonical content hash is SHA-256 over canonical JSON with recursively sorted
object keys and stable array ordering. Artifact checksum is SHA-256 over the final
PDF bytes.

## RPC contracts

- `ensure_project_spec_book(p_project_id uuid) -> spec_books`
- `place_product_in_project(p_project_id uuid, p_product_id uuid,
  p_room_id uuid default null, p_slot_id uuid default null,
  p_category text default null, p_source jsonb default '{}') -> jsonb`
- `prepare_spec_book_issue(p_spec_book_id uuid, p_audiences text[],
  p_issue_type text, p_reason text, p_base_revision_id uuid,
  p_idempotency_key text, p_warning_acknowledgements jsonb default '[]') -> jsonb`
- `finalize_spec_book_issue(p_revision_id uuid) -> spec_book_revisions`
- `create_spec_book_share(p_artifact_id uuid, p_label text,
  p_expires_at timestamptz default null) -> jsonb`
- `revoke_document_share(p_share_id uuid) -> boolean`
- `resolve_spec_book_share(p_token text) -> jsonb`

`create_spec_book_share` returns the raw token once. Only its SHA-256 hash is stored.
`resolve_spec_book_share` returns fail-closed artifact metadata for a ready artifact,
including an opaque artifact id but never a storage path. The client portal's
server-only share route uses that resolved artifact id with its service-role Storage
client to mint the short-lived signed download URL. Expired, revoked, malformed,
wrong-audience, or non-ready shares return no artifact.

## Preflight

Blocking:

- duplicate document code;
- invalid project/room/slot ownership;
- fixed included item missing name, code, room, positive quantity, image, or usable
  selection;
- audience visibility violation;
- missing audience-required vendor or install fact;
- optimistic row-version conflict.

Warnings:

- stale source verification;
- optional note absent;
- low image quality;
- aged price or lead time.

An N/A declaration and warning acknowledgement both require a non-empty reason and
are frozen into the snapshot.

## Production route map

- Designer workspace: `/doc/[projectId]/spec-book`
- Designer launch: the project room-grouped FF&E section
- Guest/client artifact: `/field/spec-book/[token]` in the client portal

All authenticated designer entry points are available in production. Guest access
continues to fail closed through the hashed capability lifecycle, expiry,
revocation, immutable-artifact checks, and short-lived signed storage URLs.
