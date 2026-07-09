# Chrome Extension

Plasmo-based extension for product capture from e-commerce sites.

## Commands

```bash
pnpm --filter @patina/extension dev   # Dev mode with HMR
pnpm --filter @patina/extension build # Production build
```

## Architecture

**Important**: All entry files must be in `src/` directory (Plasmo requirement when `src/` exists)

- `src/sidepanel.tsx` - Main sidebar UI (opens when clicking extension icon)
- `src/background.ts` - Background service worker
- `src/contents/` - Content scripts for page data extraction
- `src/lib/extraction/` - Extraction modules (price, images, materials, dimensions, metadata, vendor)
- `src/components/` - Shared UI components

## Key Patterns

- Confidence scoring for extracted data
- Multi-image carousel selection
- Project picker for saving products
- Vendor detection (manufacturer vs retailer)
- QR code auth for mobile pairing
- Portal session detection

## Gotchas

- **Duplicate-React crash**: a nested react@19 (via `@patina/catalog-ui`) against the extension's react@18 causes a null `useState` at runtime. The explicit-file `alias` block in `package.json` dedupes them — keep it intact; it was lost once and the crash came back.
- **Portal session cookie**: the extension reads the portal's `sb-<project-ref>-auth-token` cookie (`base64-`-prefixed, chunked `.0/.1`). Use the existing decoder — never `JSON.parse` it — and keep the env below pointed at the SAME Supabase project as the portals (Strata in prod), or decode fails.

## Environment

```
PLASMO_PUBLIC_SUPABASE_URL
PLASMO_PUBLIC_SUPABASE_ANON_KEY
```

## Related Specs

- See `docs/specs/product-capture.md` for capture flow
