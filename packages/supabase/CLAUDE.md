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

## Hooks

~88 hook modules / ~148 exports organized by domain — the authoritative
list is `src/hooks/index.ts` (an enumerated list here drifted badly once;
don't re-add one). New hooks go in `src/hooks/` and export from the barrel.

Query keys: lists = plural domain + params (`['purchase-orders', filters]`);
entities = singular + id (`['purchase-order', id]`); exactly ONE canonical
key per entity; mutations invalidate their list key plus every cross-domain
key the write touches.

## Patterns

- All hooks use React Query for caching
- Optimistic updates for mutations
- RLS policies handle auth automatically
- Client types flow from `database.types.ts`
