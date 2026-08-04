# MoodBoard implementation addendum

Status: approved implementation contract for the GA delivery branch.

This addendum reconciles the MoodBoard PRDs with the repository as it exists at implementation time. The phase PRDs remain the source of truth for user-visible behavior and numbered acceptance criteria; this file controls where their historical schema or rollout assumptions no longer match the codebase.

## Release contract

- Phases 1–3 are implementation and verification gates on `moodboard/ga-integration`.
- They merge to `main` and deploy as one GA release after all 85 numbered acceptance criteria have evidence.
- No `mood-board-editor` runtime feature flag is added. Flag-only acceptance language is superseded by the approved always-on GA decision.
- The legacy inline editor and duplicate renderers remain only while the replacement is being built. They are removed before the GA merge after an import audit reaches zero.
- Migrations stay backward compatible with the currently deployed portals so the production chain can run migrations before applications.

## Current repository facts

- Migration numbers are assigned from the actual integration tip immediately before merge; the reviewed baseline head was `00405`.
- `proposal_boards.cover_image_url` already exists and is the sole board-cover column.
- `document_shares` already supports proposal and spec-book targets. Board sharing adds a third nullable target and preserves exactly-one-target behavior; it does not introduce a two-value `scope` constraint.
- `continue_board_in_project` currently inserts duplicates. GA requires persisted snapshot lineage and atomic return-existing-or-create behavior.
- `BoardComposition` already renders designer mirror, client, and guest board content. It is extended in place and remains the single presentation renderer.
- Design-system and other workspace packages are verified according to their current `package.json` entry points, not stale documentation; compiled `dist` outputs are rebuilt whenever required.
- The HTTP media service deploys from `infra/media-svc-worker`. `infra/media-worker` is the separate queue/Sharp unit.

## State and rendering contracts

- Owners are identified by `{ kind: 'proposal' | 'project', id }`; autosave registry keys include both fields.
- Structural mutations are immediate and non-retried. Layout mutations coalesce for 600 ms and canvas-size mutations for 1000 ms. Done, Escape, Present, Share, and Export use one flush barrier.
- Failed structural commands are reversed locally and removed from history. Failed buffered writes remain dirty and block guarded transitions until retry or discard.
- `BoardRoomCanvas` is controlled and emits semantic gesture commits. Persistence, queries, undo/redo, and analytics stay in the portal controller.
- Composition geometry is serialized as versioned `BoardGeometrySnapshot` data. Browser DOM, PNG, and covers use the canonical geometry function; composition PDF validates and consumes the normalized snapshot.
- Nullable item height resolves through `height`, then persisted `data.resolved_height`, then the documented deterministic type fallback.
- Composition images use contain fit. Frozen snapshot items may omit IDs; ID-dependent affordances stay disabled for them.
- Clipboard interoperability uses a versioned Patina MIME payload plus a validated `text/plain` envelope, capped at 1 MB.

## Data and security contracts

- Board-share tokens are returned once, hashed at rest, revocable and expirable. Guest board resolution returns only allowlisted board composition data, never its proposal or siblings, and never enables feedback.
- Project snapshots persist sections. Continuing a frozen board creates at most one live project-owned board and returns it on repeat calls.
- Patina and studio templates are materialized through server RPCs with fresh IDs and no live template link. Patina starter rows are migration-seeded and immutable.
- Storage cleanup uses durable first-seen candidate state and a continuous 14-day grace. Production starts in dry-run; destructive mode is enabled only after two clean reports and reviewed eligible candidates.
- URL unfurl is limited server-side to 10 requests per user per 10 minutes and 100 per user per day.
- Background removal uses the existing media service and a vendor-neutral adapter backed initially by remove.bg. The client supplies board/item identity and an idempotency key, never a source URL. The service validates membership, prevents SSRF, writes canonical board assets, and enforces durable defaults of 25 removals per studio/month and 100 globally/day.
- Service-role credentials remain server-side. Existing proposal and spec-book share behavior must pass regression tests before board sharing is accepted.

## Analytics corrections

- Generic new events are namespaced to the MoodBoard domain.
- `board_presented` fires once when Present ends and includes duration.
- `verdict_given` is emitted only from client feedback surfaces; designer verdict chips are read-only.
- Successful guest board resolution emits `board_share_viewed` server-side without logging the raw token.
- Legacy M2/M3 baselines are captured before production deployment; all M1–M8 inputs must be queryable at the release gate.

## Production order

1. Supabase migrations.
2. Changed edge functions and every importer of changed `_shared` modules.
3. Media service schema and `infra/media-svc-worker`.
4. Client portal, so the guest route understands board links before they can be created.
5. Designer portal.
6. Object, behavior, security, analytics, and deployment-list probes.

Rollback is last-good application redeploy plus database fix-forward. No Coolify or retired-host path is valid.
