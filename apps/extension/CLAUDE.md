# Chrome Extension

Plasmo-based extension for product capture from e-commerce sites.

## Commands

```bash
pnpm --filter @strata/extension dev   # Dev mode with HMR
pnpm --filter @strata/extension build # Production build
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

## Environment

```
PLASMO_PUBLIC_SUPABASE_URL
PLASMO_PUBLIC_SUPABASE_ANON_KEY
```

## Related Specs

- See `docs/specs/product-capture.md` for capture flow
