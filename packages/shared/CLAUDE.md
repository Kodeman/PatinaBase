# Shared Package

TypeScript types and Zod validation schemas. No implementations.

## Structure

- `src/types/`: Domain type definitions (vendor.ts, teaching.ts)
- `src/validation/`: Zod schemas matching types
- `src/utils/`: Pure utility functions

## Patterns

- Types are source of truth; Zod schemas derive from them
- Export everything via barrel files (`index.ts`)
- No React dependencies - this is pure data layer
- Used by all apps via `@strata/shared`
