# Supabase Database

PostgreSQL with pgvector. Migrations and edge functions.

## Commands

```bash
pnpm db:push      # Push migrations to Supabase
pnpm db:generate  # Generate TypeScript types
```

## Migrations

Sequential numbered files in `migrations/`. Never modify existing migrations - always create new ones.

## Conventions

- Prices in cents (integers)
- RLS enabled on all tables
- pgvector for embeddings — 768-dim canonical aesthetic space (see `docs/prds/AE/aesthete-engine-system-design.md`); the Aesthete Engine delivery program is tracked in `docs/prds/AE/aesthete-engine-delivery-plan.md`
- Use `created_at` and `updated_at` timestamps
- ⚠ **Grants on fresh local stacks**: Supabase flipped platform defaults 2026-05-30 — new local stacks no longer auto-grant table/function privileges to anon/authenticated at creation, so a fresh `supabase start` breaks every pre-00285 object (42501). `seed/00-legacy-grants.sql` (first in `[db.seed] sql_paths`) restores the legacy posture for never-explicitly-managed objects on every local `db reset`; it never runs on prod. Migrations written after the flip must include explicit `GRANT`s for anything portals reach (00282/00283 style) — never rely on creation-time defaults.

## Project money columns (post-00139)

- `projects.total_amount_cents` — contract / invoice total (design fee + FF&E retail + tax). What the client owes.
- `projects.budget_cents` — FF&E spend cap (sum of `project_ffe_items.line_total_cents`). What the project plans to spend on furnishings.
- `projects.design_fee_cents` — sum of `project_phases.fee_cents`. Designer service fees.
- `projects.committed_cents` / `actual_cents` — FF&E execution rollups (ordered → installed lifecycle).

Pre-00139 rows have `total_amount_cents` backfilled from `budget_cents` and may use `budget_cents` to mean "invoice total" until manually re-aligned. New consumers reading "invoice total" should fall back: `total_amount_cents ?? budget_cents`.

## Proposal → project activation

`activate_proposal_as_project(p_proposal_id, p_start_date)` (latest body in `00262_spec_doc_codes.sql`; lineage: 00140 richer carry → 00167 created_by fix → 00180 boards carry → 00185 dual pricing → 00199 vendor_id carry → 00262 doc_code carry) is the bridge. Preconditions: `proposals.status = 'accepted'` and `proposals.project_id IS NULL`.

Status transitions and side effects:

| Before | After (atomic) |
|---|---|
| `proposals.status = 'accepted'` | unchanged — proposal stays signed |
| `proposals.project_id = NULL` | `proposals.project_id = <new project uuid>` (back-link) |
| `designer_clients.status ∈ ('lead', 'proposal')` | `designer_clients.status = 'active'` |
| (no project row) | new `projects` row with `status = 'active'`, `start_date = p_start_date` |
| (no project rows) | first `project_phases.status = 'in_progress'`, others `'pending'`; `current_phase` = first phase's `phase_key` |
| (no milestones) | first `project_payment_milestones.status = 'outstanding'` with `due_date = p_start_date`; others `'pending'` with `due_date = NULL` |
| (no FF&E rows) | `project_ffe_items.status = 'specified'`; `eta` seeded from `proposal_items.lead_time_weeks` when set |

Data copied 1:1 (with back-references where useful):

| Source | Target | Notes |
|---|---|---|
| `proposals.title` | `projects.name` | |
| `proposals.description` | `projects.notes` | |
| `proposals.personal_message` | `projects.kickoff_message` | rendered in Project Brief |
| `proposals.project_address` | `projects.site_address` | |
| `proposals.total_amount` | `projects.total_amount_cents` | invoice total |
| `Σ proposal_items.line_total` | `projects.budget_cents` | FF&E subtotal |
| `Σ proposal_phases.fee_cents` | `projects.design_fee_cents` | |
| `proposal_exclusions[]` | `projects.scope_boundaries` (JSONB) | |
| `proposal_change_order_terms` | `projects.change_order_terms` (JSONB) | |
| `proposal_scope_rooms` | `project_rooms` | back-ref `source_scope_room_id` |
| `proposal_items` | `project_ffe_items` | back-ref `source_proposal_item_id`; `internal_notes` appended to `notes` with `"Internal: "` prefix |
| `proposal_phases` | `project_phases` | back-ref `source_proposal_phase_id`; phase dates computed from `p_start_date` |
| `proposal_payment_milestones` | `project_payment_milestones` | phase mapping preserved |
| `proposal_team_members` | `project_team_members` | `assigned_by = proposal.designer_id`, `ON CONFLICT DO NOTHING` |
| `proposal_sections` | `project_narrative_sections` | back-ref `source_section_id` |
| `proposal_palettes` (+ `palette_swatches`) | `project_palettes.swatches` (JSONB) | swatches embedded; scope_room re-mapped |
| `proposal_boards` (+ `proposal_board_items`) | `project_boards.items` (JSONB) | back-ref `source_board_id` (soft, no FK); items embedded ordered by `z_index, created_at` (no `id`/`locked` fields); scope_room re-mapped to `project_room_id` |

Lead designer (`proposals.designer_id`) and primary client (`proposals.client_id`) carry over to the project columns of the same name — they are **not** also inserted into `proposal_team_members` / `project_team_members`.

## Structure

- `migrations/`: Schema changes (00001_, 00002_, etc.)
- `functions/`: Edge functions (Deno runtime)
- `seed/`: Development seed data
- `config.toml`: Supabase project settings
