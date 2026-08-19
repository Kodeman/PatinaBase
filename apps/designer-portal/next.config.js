/** @type {import('next').NextConfig} */
const path = require('path');

const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@patina/design-system', '@patina/types', '@patina/utils', '@patina/api-client', '@patina/catalog-ui', '@patina/help-system', '@patina/email'],
  outputFileTracingRoot: path.join(__dirname, '../../'),

  // Security and CORS headers
  async headers() {
    const isDevelopment = process.env.NODE_ENV === 'development';

    // The signed-URL viewers — plan prints, Folio files, PO previews — render a
    // PDF by framing a Supabase storage URL. Without a frame-src the policy
    // falls back to `default-src 'self'` and the iframe comes up blank. The
    // origin is read from the same env var the client is built against, so dev
    // names http://127.0.0.1:54321 and prod names the Strata host; an unset or
    // unparseable value degrades to 'self' rather than widening the policy.
    let supabaseFrameOrigin = null;
    let supabaseRealtimeOrigin = null;
    try {
      const configuredSupabaseUrl = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
      supabaseFrameOrigin = configuredSupabaseUrl.origin;
      configuredSupabaseUrl.protocol = configuredSupabaseUrl.protocol === 'https:' ? 'wss:' : 'ws:';
      supabaseRealtimeOrigin = configuredSupabaseUrl.origin;
    } catch {
      supabaseFrameOrigin = null;
      supabaseRealtimeOrigin = null;
    }

    // The Rendered Room v2 scan read path (use-splat-url.ts / scan-artifact-url.ts)
    // calls the edge API Worker directly from the browser via
    // `NEXT_PUBLIC_EDGE_API_URL`. That origin is a `*.workers.dev` host — not
    // covered by the `*.patina.cloud` allowance below — so without this the fetch
    // is silently CSP-blocked in every browser regardless of the env var being
    // wired. Unset (every environment until a scope opts in) degrades to nothing,
    // same pattern as supabaseFrameOrigin.
    let edgeApiOrigin = null;
    try {
      edgeApiOrigin = process.env.NEXT_PUBLIC_EDGE_API_URL
        ? new URL(process.env.NEXT_PUBLIC_EDGE_API_URL).origin
        : null;
    } catch {
      edgeApiOrigin = null;
    }

    const supabaseConnectOrigins = [supabaseFrameOrigin, supabaseRealtimeOrigin, edgeApiOrigin].filter(Boolean).join(' ');

    // CSP directives - adapted for development vs production
    const cspDirectives = [
      "default-src 'self'",
      // `wasm-unsafe-eval` (prod leg) is the narrow CSP source for WebAssembly
      // compilation specifically — NOT a general eval allowance. Without it,
      // @sparkjsdev/spark's `WebAssembly.instantiateStreaming()` for the SPLAT
      // projection's Rust splat-decode module throws a CompileError citing
      // `'unsafe-eval'` and the stage hangs forever on its loading line
      // ("Bringing the walkthrough up…") — confirmed live on staging. Dev's
      // `'unsafe-eval'` already covers WASM instantiation too (which is why
      // this never surfaced locally), so the dev leg is unchanged.
      isDevelopment
        ? "script-src 'self' 'unsafe-eval' 'unsafe-inline'"
        : "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://us-assets.i.posthog.com",
      "style-src 'self' 'unsafe-inline'",
      // Images: prod screenshots/assets come from https://api.patina.cloud
      // (covered by https:). In dev, private-bucket signed URLs are served over
      // http from local Supabase storage — allow those local origins so inline
      // <img> previews (e.g. feedback screenshots) aren't CSP-blocked.
      isDevelopment
        ? "img-src 'self' data: https: blob: http://localhost:* http://127.0.0.1:*"
        : "img-src 'self' data: https: blob:",
      "font-src 'self' data:",
      // Allow connections based on environment
      // Development: localhost, local network IPs, and approved patina.cloud preview domains
      // Production: patina.cloud API gateway and WebSocket connections
      //
      // `data:` is for the SPLAT projection. @sparkjsdev/spark inlines its Rust
      // splat-decode WASM as a `data:application/wasm;base64,…` URI rather than
      // shipping a .wasm file — which sounds like it needs no CSP allowance and
      // does: wasm-bindgen's init `fetch()`es that URI, and a fetch of a data:
      // URL is still governed by connect-src. Without this the whole Spark module
      // fails at `SplatMesh.staticInitialize()` with a bare "Failed to fetch" and
      // the stage hangs on its loading line. The grant is narrow — a data: URL
      // carries bytes the document already holds, so it is not an exfiltration
      // path and reaches no network origin.
      isDevelopment
        ? "connect-src 'self' data: http://localhost:* ws://localhost:* http://192.168.1.18:* ws://192.168.1.18:* http://192.168.1.36:* ws://192.168.1.36:* http://192.168.1.16:* ws://192.168.1.16:* http://127.0.0.1:* ws://127.0.0.1:* http://*.nordicheat.org ws://*.nordicheat.org https://api.patina.cloud wss://api.patina.cloud https://*.patina.cloud wss://*.patina.cloud https://*.sanity.io wss://*.sanity.io https://us.i.posthog.com https://us-assets.i.posthog.com https://*.posthog.com" + (supabaseConnectOrigins ? ` ${supabaseConnectOrigins}` : '')
        : "connect-src 'self' data: https://bkvcixdmuyejfzcijpdg.supabase.co wss://bkvcixdmuyejfzcijpdg.supabase.co https://api.patina.cloud wss://api.patina.cloud https://*.patina.cloud wss://*.patina.cloud https://*.sanity.io wss://*.sanity.io https://us.i.posthog.com https://us-assets.i.posthog.com https://*.posthog.com" + (supabaseConnectOrigins ? ` ${supabaseConnectOrigins}` : ''),
      "media-src 'self' blob:",
      // The MESH projection's GLTFLoader spins up DRACO/KTX2 transcoder workers
      // from blob: URLs (see public/three/). Without this they fall back to
      // script-src, which has no blob:, and every Draco-compressed scan fails
      // to decode — as a worker construction error in the console, not as
      // anything the page can show.
      "worker-src 'self' blob:",
      ["frame-src 'self'", supabaseFrameOrigin].filter(Boolean).join(' '),
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ];

    // Only upgrade insecure requests in production
    if (!isDevelopment) {
      cspDirectives.push('upgrade-insecure-requests');
    }

    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: cspDirectives.join('; ')
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
        ],
      },
    ];
  },

  // Allow specific origins for development
  // Note: When using a reverse proxy, include all possible host headers
  allowedDevOrigins: [
    // Local network IPs
    'http://192.168.1.18:3000',
    'http://192.168.1.16:3000',
    'http://192.168.1.36:3000',

    // Localhost variations
    'http://localhost:3000',
    'http://localhost:8080',
    'http://127.0.0.1:3000',

    // Docker internal host (for nginx proxy)
    'http://host.docker.internal:3000',
    'http://host.docker.internal',

    // Without protocol (for cases where origin header lacks protocol)
    'patina.cloud',
    'www.patina.cloud',
    'designer.patina.cloud',
    'admin.patina.cloud',
    'client.patina.cloud',
    'api.patina.cloud',
    'patina.design',
    'www.patina.design',
    'designer.patina.design',
    'admin.patina.design',
    'client.patina.design',
    'api.patina.design',

    // Main domain (designer portal) - with and without ports
    'http://patina.cloud',
    'https://patina.cloud',
    'http://patina.cloud:3000',
    'https://patina.cloud:3000',
    'http://patina.cloud:80',
    'https://patina.cloud:443',
    'http://www.patina.cloud',
    'https://www.patina.cloud',
    'http://www.patina.cloud:3000',
    'https://www.patina.cloud:3000',

    // Potential designer subdomain
    'http://designer.patina.cloud',
    'https://designer.patina.cloud',
    'http://designer.patina.cloud:3000',
    'https://designer.patina.cloud:3000',

    // API subdomain
    'http://api.patina.cloud',
    'https://api.patina.cloud',

    // Admin subdomain
    'http://admin.patina.cloud',
    'https://admin.patina.cloud',

    // Client subdomain
    'http://client.patina.cloud',
    'https://client.patina.cloud',

    // Alternative domain - with and without ports
    'http://patina.design',
    'https://patina.design',
    'http://patina.design:3000',
    'https://patina.design:3000',
    'http://www.patina.design',
    'https://www.patina.design',
    'http://www.patina.design:3000',
    'https://www.patina.design:3000',
    'http://designer.patina.design',
    'https://designer.patina.design',
    'http://designer.patina.design:3000',
    'https://designer.patina.design:3000',

    // nordicheat.org domain
    'nordicheat.org',
    'http://nordicheat.org',
    'http://designer.nordicheat.org',
    'http://admin.nordicheat.org',
    'http://client.nordicheat.org',
    'http://api.nordicheat.org'
  ],

  experimental: {
    // Optimize package imports for better tree-shaking
    optimizePackageImports: [
      '@patina/design-system',
      'lucide-react',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-popover',
      '@radix-ui/react-tabs',
      '@tanstack/react-query'
    ],
  },

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'objectstorage.*.oraclecloud.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'api.patina.cloud',
        pathname: '/storage/**',
      },
      {
        protocol: 'https',
        hostname: 'media.patina.cloud',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'cdn.patina.cloud',
        pathname: '/**',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '',
        pathname: '/**',
      },
    ],
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 60,
  },

  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn'],
    } : false,
  },

  // Enable compression
  compress: true,

  // Production source maps (smaller)
  productionBrowserSourceMaps: false,

  // Skip type checking during build (pre-existing type issues to fix in Phase 4)
  typescript: {
    ignoreBuildErrors: true,
  },


  /**
   * The R21 dissolve — the permanent redirect table (I109).
   *
   * The `(portal)` zone tree is gone. Every URL it ever answered to is answered
   * here instead, permanently (308), so a bookmark, an email footer, a Stripe
   * return URL and a two-year-old link all still land somewhere true.
   *
   * Three shapes of destination:
   *   · A ROOM with a real route — /doc/:id, /people, /library, /rooms,
   *     /drafting/:id, /room/:scanId/file, /preferences, /help. 1:1 where the
   *     key space matches.
   *   · A DESK DOORWAY — the money/time/post/account zones became sheets, and a
   *     sheet has no address. `?book=` / `?account=` on /desk is their address;
   *     components/document/desk-doorway.tsx consumes it once and erases it.
   *   · Plain /desk — for the zones that dissolved into the Desk's own folders
   *     and chips (the pipeline, the lists, insights) or into a ⌘K verb.
   *
   * Rules of the table:
   *   · FIRST MATCH WINS. Specific before general; `/portal` exact sits first
   *     (`/portal/:path*` would otherwise swallow it), the catchall sits last.
   *   · A STATIC segment is never left to an `:id` rule. `new`, `saved`,
   *     `import`, `categories`, `collections`, `calendar` are all named ahead of
   *     the id pattern in the same family, on BOTH trees — otherwise
   *     /projects/new resolves to /doc/new, which the resolver can only answer
   *     with "missing".
   *   · Query strings ride along untouched — which is how
   *     /portal/preferences?token=… keeps its unsubscribe token.
   *   · A destination may carry a SECTION ANCHOR. A project sub-route collapses
   *     onto the one document, but `#doc-section-<key>` (the ids from
   *     lib/document/section-anchor.ts) lands it on the section that held the
   *     old page's work instead of at the top of the paper.
   *   · ROOM id ≠ SCAN id. /portal/rooms/:id speaks `rooms`; /room/:id speaks
   *     `room_scans`. Never map one to the other — land on the /rooms roster.
   *   · A decision id, a lead id and a proposal id all resolve through
   *     /doc/[id]'s resolver (use-document-state.ts legs R6 / F1 / decisions).
   */
  async redirects() {
    return [
      // ─── The bare landing ──────────────────────────────────────────────────
      { source: '/portal', destination: '/desk', permanent: true },

      // ─── Projects · proposals · leads · decisions → the document ───────────
      { source: '/portal/projects/new', destination: '/desk', permanent: true },
      // The Room File was never project-keyed (room_files is UNIQUE(scan_id, version)).
      { source: '/portal/projects/:id/room-file/:scanId', destination: '/room/:scanId/file', permanent: true },
      // The ruled section anchors: a project sub-route collapses onto the ONE
      // document, but it lands on the section that held the old page's work
      // rather than at the top of the paper. The ids come from
      // lib/document/section-anchor.ts (`doc-section-${SectionKey}`).
      { source: '/portal/projects/:id/complete', destination: '/doc/:id#doc-section-care', permanent: true },
      { source: '/portal/projects/:id/ffe', destination: '/doc/:id#doc-section-project', permanent: true },
      { source: '/portal/projects/:id/financials', destination: '/doc/:id#doc-section-project', permanent: true },
      { source: '/portal/projects/:id/phase/:path*', destination: '/doc/:id#doc-section-project', permanent: true },
      // Specific before general, per this table's own ordering law. The bare
      // project would also be caught by the catchall below (`:path*` matches zero
      // segments) and land on the same /doc/:id, so this is form, not a fix.
      { source: '/portal/projects/:id', destination: '/doc/:id', permanent: true },
      // /time /decisions /edit /scope-change* — the rest of the sub-tree.
      { source: '/portal/projects/:id/:path*', destination: '/doc/:id', permanent: true },
      { source: '/portal/projects', destination: '/desk', permanent: true },

      { source: '/portal/proposals/new', destination: '/desk', permanent: true },
      // The Drafting Room is the scope surface; same key space, 1:1.
      { source: '/portal/proposals/:id/scope', destination: '/drafting/:id', permanent: true },
      { source: '/portal/proposals/:id/edit', destination: '/drafting/:id', permanent: true },
      // preview / revise / send / signed / tracking are all overlays on the document.
      { source: '/portal/proposals/:id/:path*', destination: '/doc/:id', permanent: true },
      { source: '/portal/proposals/:id', destination: '/doc/:id', permanent: true },
      { source: '/portal/proposals', destination: '/desk', permanent: true },

      { source: '/portal/leads/:id', destination: '/doc/:id', permanent: true },
      { source: '/portal/leads', destination: '/desk', permanent: true },
      { source: '/portal/pipeline', destination: '/desk', permanent: true },
      { source: '/portal/pipeline/:path*', destination: '/desk', permanent: true },

      // DEC-22 decision analytics has no document home — an accepted loss.
      { source: '/portal/decisions/analytics', destination: '/desk', permanent: true },
      // A decision id resolves to its project via the resolver's third leg.
      { source: '/portal/decisions/:id/edit', destination: '/doc/:id', permanent: true },
      { source: '/portal/decisions/:id', destination: '/doc/:id', permanent: true },
      { source: '/portal/decisions', destination: '/desk', permanent: true },

      // ─── People (clients · makers · threads · outreach) ────────────────────
      // The nav's old "+ Add Client" quick action was /portal/clients?add=1.
      { source: '/portal/clients', has: [{ type: 'query', key: 'add' }], destination: '/people?role=client&add=client', permanent: true },
      { source: '/portal/clients/:id', destination: '/people?person=:id&role=client', permanent: true },
      { source: '/portal/clients/:id/:path*', destination: '/people?person=:id&role=client', permanent: true },
      { source: '/portal/clients', destination: '/people?role=client', permanent: true },

      { source: '/portal/vendors/new', destination: '/people?add=maker', permanent: true },
      { source: '/portal/vendors/saved', destination: '/people?role=maker', permanent: true },
      { source: '/portal/vendors/:id', destination: '/people?person=:id&role=maker', permanent: true },
      { source: '/portal/vendors', destination: '/people?role=maker', permanent: true },

      { source: '/portal/messages/:id', destination: '/people?thread=:id', permanent: true },
      { source: '/portal/messages', destination: '/people?view=threads', permanent: true },
      { source: '/portal/nurture', destination: '/people?view=nurture', permanent: true },
      { source: '/portal/reviews', destination: '/people?view=reviews', permanent: true },
      { source: '/portal/portfolio', destination: '/people?view=portfolio', permanent: true },
      { source: '/portal/communications', destination: '/people?view=outreach', permanent: true },
      { source: '/portal/communications/:path*', destination: '/people?view=outreach', permanent: true },

      // ─── The Library (catalog · teaching · the companion) ──────────────────
      { source: '/portal/library', destination: '/library', permanent: true },
      { source: '/portal/library/:path*', destination: '/library', permanent: true },

      // Static catalog segments first — otherwise `new` reads as a product id.
      // R40: the Composing Page IS the "new piece" surface, and it has a route.
      { source: '/portal/catalog/new', destination: '/compose', permanent: true },
      { source: '/portal/catalog/import', destination: '/library', permanent: true },
      { source: '/portal/catalog/categories', destination: '/library', permanent: true },
      { source: '/portal/catalog/collections', destination: '/library', permanent: true },
      { source: '/portal/catalog/collections/:path*', destination: '/library', permanent: true },
      // Product detail / edit — same key space as the Piece Room.
      { source: '/portal/catalog/:id/edit', destination: '/library/:id', permanent: true },
      { source: '/portal/catalog/:id', destination: '/library/:id', permanent: true },
      { source: '/portal/catalog', destination: '/library', permanent: true },

      { source: '/portal/teaching/judgments', destination: '/library/judgments', permanent: true },
      { source: '/portal/teaching/your-eye', destination: '/people?view=your-eye', permanent: true },
      { source: '/portal/teaching/product/:id', destination: '/library/:id', permanent: true },
      { source: '/portal/teaching', destination: '/library', permanent: true },
      { source: '/portal/teaching/:path*', destination: '/library', permanent: true },
      // The companion's successor is the Library's own asking surface
      // (LibrarianBar + EngineResults) — not the Desk.
      { source: '/portal/companion', destination: '/library', permanent: true },

      // ─── The Orders book (doorway) ─────────────────────────────────────────
      { source: '/portal/procurement/receiving', destination: '/desk?book=orders&page=receiving', permanent: true },
      { source: '/portal/procurement/by-vendor', destination: '/desk?book=orders&page=vendors', permanent: true },
      { source: '/portal/procurement/expediting', destination: '/desk?book=orders&page=week', permanent: true },
      // The delivery calendar became the Orders book's week page (same truth:
      // what lands when) — never the plain ledger.
      { source: '/portal/procurement/calendar', destination: '/desk?book=orders&page=week', permanent: true },
      { source: '/portal/procurement', destination: '/desk?book=orders', permanent: true },
      { source: '/portal/procurement/:path*', destination: '/desk?book=orders', permanent: true },

      // ─── The Accounts book (doorway) ───────────────────────────────────────
      { source: '/portal/billing/ar', destination: '/desk?book=accounts&page=receivables', permanent: true },
      // The composer is raised from the book; it has no id to carry.
      { source: '/portal/billing/invoices/new', destination: '/desk?book=accounts', permanent: true },
      { source: '/portal/billing/invoices/:id/print', destination: '/desk?book=accounts&page=ledger&invoiceId=:id', permanent: true },
      { source: '/portal/billing/invoices/:id', destination: '/desk?book=accounts&page=ledger&invoiceId=:id', permanent: true },
      { source: '/portal/billing', destination: '/desk?book=accounts', permanent: true },
      { source: '/portal/billing/:path*', destination: '/desk?book=accounts', permanent: true },
      { source: '/portal/earnings', destination: '/desk?book=accounts&page=earnings', permanent: true },

      // ─── Hours · the Post · insights ───────────────────────────────────────
      { source: '/portal/time', destination: '/desk?book=hours', permanent: true },
      { source: '/portal/inbox', destination: '/desk?book=post', permanent: true },
      // R5 + I23: insights distributed into each ledger's front matter.
      { source: '/portal/insights', destination: '/desk', permanent: true },

      // ─── The Account sheet (doorway) + the permanent preferences page ──────
      { source: '/portal/settings/notifications', destination: '/desk?account=notifications', permanent: true },
      { source: '/portal/settings/security', destination: '/desk?account=security', permanent: true },
      { source: '/portal/settings/devices', destination: '/desk?account=devices', permanent: true },
      { source: '/portal/settings', destination: '/desk?account=profile', permanent: true },
      { source: '/portal/settings/:path*', destination: '/desk?account=profile', permanent: true },
      { source: '/portal/profile', destination: '/desk?account=profile', permanent: true },
      // R91: /preferences is a REAL page (the unsubscribe token flow lands there
      // unauthenticated) — never a doorway, and the ?token= rides along.
      { source: '/portal/preferences', destination: '/preferences', permanent: true },

      // ─── Help (R89 re-homed the whole tree 1:1) ────────────────────────────
      { source: '/portal/help', destination: '/help', permanent: true },
      { source: '/portal/help/:path*', destination: '/help/:path*', permanent: true },
      { source: '/portal/resources', destination: '/help', permanent: true },

      // ─── Rooms — the roster, never a scan ──────────────────────────────────
      { source: '/portal/rooms/:id', destination: '/rooms', permanent: true },
      { source: '/portal/rooms', destination: '/rooms', permanent: true },

      // ─── Everything else that ever wore the /portal prefix ─────────────────
      { source: '/portal/:path*', destination: '/desk', permanent: true },

      // ─── The pre-dissolve bare paths ───────────────────────────────────────
      // These predate the zone tree and used to hop through /portal/*. They now
      // name their final destination directly — no redirect chains. The `:path*`
      // catchalls at the foot of each family mirror the /portal tree's coverage:
      // main funnelled a deep bare path (/catalog/foo/bar) through /portal and
      // let the /portal catchall answer, so without them those URLs would 404.
      // `new` is a STATIC segment, not a project id — it must be named before
      // any /projects/:id rule can eat it (it would otherwise resolve to
      // /doc/new, which the resolver can only answer with "missing").
      { source: '/projects/new', destination: '/desk', permanent: true },
      { source: '/projects/:id/:path*', destination: '/doc/:id', permanent: true },
      { source: '/projects/:id', destination: '/doc/:id', permanent: true },
      { source: '/projects', destination: '/desk', permanent: true },
      { source: '/proposals/new', destination: '/desk', permanent: true },
      { source: '/proposals/:id/scope', destination: '/drafting/:id', permanent: true },
      { source: '/proposals/:id/edit', destination: '/drafting/:id', permanent: true },
      { source: '/proposals/:id/:path*', destination: '/doc/:id', permanent: true },
      { source: '/proposals/:id', destination: '/doc/:id', permanent: true },
      { source: '/proposals', destination: '/desk', permanent: true },
      { source: '/leads/:id', destination: '/doc/:id', permanent: true },
      { source: '/leads', destination: '/desk', permanent: true },
      { source: '/leads/:path*', destination: '/desk', permanent: true },
      // The nav's old "+ Add Client" quick action, bare twin.
      { source: '/clients', has: [{ type: 'query', key: 'add' }], destination: '/people?role=client&add=client', permanent: true },
      { source: '/clients/:id', destination: '/people?person=:id&role=client', permanent: true },
      { source: '/clients/:id/:path*', destination: '/people?person=:id&role=client', permanent: true },
      { source: '/clients', destination: '/people?role=client', permanent: true },
      // No `/clients/:path*` catchall: `/clients/:id/:path*` above already
      // answers the whole family (`:path*` matches zero segments, so it takes
      // `/clients/:id` too), which made the catchall unreachable. The /leads and
      // /vendors catchalls below are NOT the same case — neither has an
      // `/:id/:path*` rule, so their catchall is the only thing answering a
      // two-segment path.
      { source: '/vendors/new', destination: '/people?add=maker', permanent: true },
      { source: '/vendors/saved', destination: '/people?role=maker', permanent: true },
      { source: '/vendors/:id', destination: '/people?person=:id&role=maker', permanent: true },
      { source: '/vendors', destination: '/people?role=maker', permanent: true },
      { source: '/vendors/:path*', destination: '/people?role=maker', permanent: true },
      { source: '/messages/:id', destination: '/people?thread=:id', permanent: true },
      { source: '/messages', destination: '/people?view=threads', permanent: true },
      { source: '/communications', destination: '/people?view=outreach', permanent: true },
      { source: '/communications/:path*', destination: '/people?view=outreach', permanent: true },
      { source: '/catalog/new', destination: '/compose', permanent: true },
      { source: '/catalog/import', destination: '/library', permanent: true },
      { source: '/catalog/categories', destination: '/library', permanent: true },
      { source: '/catalog/collections', destination: '/library', permanent: true },
      { source: '/catalog/collections/:path*', destination: '/library', permanent: true },
      { source: '/catalog/:id/edit', destination: '/library/:id', permanent: true },
      { source: '/catalog/:id', destination: '/library/:id', permanent: true },
      { source: '/catalog', destination: '/library', permanent: true },
      { source: '/catalog/:path*', destination: '/library', permanent: true },
      { source: '/teaching/judgments', destination: '/library/judgments', permanent: true },
      { source: '/teaching/your-eye', destination: '/people?view=your-eye', permanent: true },
      { source: '/teaching/product/:id', destination: '/library/:id', permanent: true },
      { source: '/teaching', destination: '/library', permanent: true },
      { source: '/teaching/:path*', destination: '/library', permanent: true },
      { source: '/earnings', destination: '/desk?book=accounts&page=earnings', permanent: true },
      { source: '/settings/notifications', destination: '/desk?account=notifications', permanent: true },
      { source: '/settings/security', destination: '/desk?account=security', permanent: true },
      { source: '/settings/devices', destination: '/desk?account=devices', permanent: true },
      { source: '/settings', destination: '/desk?account=profile', permanent: true },
      { source: '/settings/:path*', destination: '/desk?account=profile', permanent: true },
      { source: '/profile', destination: '/desk?account=profile', permanent: true },
      { source: '/companion', destination: '/library', permanent: true },
      { source: '/insights', destination: '/desk', permanent: true },
    ];
  },

  webpack: (config, { dev, isServer }) => {
    // Ensure resolve.alias exists
    if (!config.resolve.alias) {
      config.resolve.alias = {};
    }

    // Explicitly set the @/ alias for local imports
    config.resolve.alias['@'] = path.resolve(__dirname, 'src');


    // Fallback configuration
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
    };

    // Optimize file watching in development to reduce inotify usage
    if (dev) {
      config.watchOptions = {
        poll: 1000, // Check for changes every 1 second
        aggregateTimeout: 300, // Delay before rebuilding after change detected
        ignored: [
          '**/node_modules/**',
          '**/.next/**',
          '**/coverage/**',
          '**/playwright-report/**',
          '**/test-results/**',
          '**/.turbo/**',
          '**/*.spec.ts',
          '**/*.spec.tsx',
          '**/*.test.ts',
          '**/*.test.tsx',
        ],
      };
    }

    // Bundle analyzer - only in production build when ANALYZE=true
    if (!dev && !isServer && process.env.ANALYZE === 'true') {
      const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');
      config.plugins.push(
        new BundleAnalyzerPlugin({
          analyzerMode: 'static',
          reportFilename: './analyze.html',
          openAnalyzer: true,
        })
      );
    }

    return config;
  },

  // Output configuration
  output: 'standalone',

  // Static page generation timeout
  staticPageGenerationTimeout: 120,
};

module.exports = nextConfig;
