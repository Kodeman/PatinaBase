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
- pgvector for embeddings (1536 dimensions)
- Use `created_at` and `updated_at` timestamps

## Project money columns (post-00139)

- `projects.total_amount_cents` — contract / invoice total (design fee + FF&E retail + tax). What the client owes.
- `projects.budget_cents` — FF&E spend cap (sum of `project_ffe_items.line_total_cents`). What the project plans to spend on furnishings.
- `projects.design_fee_cents` — sum of `project_phases.fee_cents`. Designer service fees.
- `projects.committed_cents` / `actual_cents` — FF&E execution rollups (ordered → installed lifecycle).

Pre-00139 rows have `total_amount_cents` backfilled from `budget_cents` and may use `budget_cents` to mean "invoice total" until manually re-aligned. New consumers reading "invoice total" should fall back: `total_amount_cents ?? budget_cents`.

## Structure

- `migrations/`: Schema changes (00001_, 00002_, etc.)
- `functions/`: Edge functions (Deno runtime)
- `seed/`: Development seed data
- `config.toml`: Supabase project settings
