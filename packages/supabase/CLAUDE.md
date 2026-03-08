# Supabase Package

Database client, generated types, and React Query hooks.

## Commands

```bash
pnpm db:generate   # Regenerate types from schema
pnpm db:studio     # Open Supabase Studio
```

## Structure

- `src/client.ts`: Supabase client initialization
- `src/database.types.ts`: Auto-generated (DO NOT EDIT)
- `src/hooks/`: React Query hooks by domain

## Hook Domains

use-auth, use-products, use-projects, use-vendors, use-clients,
use-earnings, use-leads, use-proposals, use-room-scans, use-settings,
use-styles, use-teaching, use-similarity, use-embeddings

## Patterns

- All hooks use React Query for caching
- Optimistic updates for mutations
- RLS policies handle auth automatically
- Client types flow from `database.types.ts`
