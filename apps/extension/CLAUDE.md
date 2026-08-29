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

- **Portal session cookie**: the extension reads the portal's `sb-<project-ref>-auth-token` cookie (`base64-`-prefixed, chunked `.0/.1`). Use the existing decoder — never `JSON.parse` it — and keep the env below pointed at the SAME Supabase project as the portals (Strata in prod), or decode fails.
- **Offline queue, OCR, and trade pricing were removed in 0.3.0 (capture-launch W1) — do not reintroduce without a producer/assets/linking path.** Also removed in 0.3.0: `@patina/catalog-ui`, `tesseract.js`, `@plasmohq/storage` deps and vendor certifications (CL-R16).

## Environment

```
PLASMO_PUBLIC_SUPABASE_URL
PLASMO_PUBLIC_SUPABASE_ANON_KEY
```

## Related Specs

- See `docs/specs/_active/product-capture.md` for capture flow
