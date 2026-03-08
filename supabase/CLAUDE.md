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

## Structure

- `migrations/`: Schema changes (00001_, 00002_, etc.)
- `functions/`: Edge functions (Deno runtime)
- `seed/`: Development seed data
- `config.toml`: Supabase project settings
