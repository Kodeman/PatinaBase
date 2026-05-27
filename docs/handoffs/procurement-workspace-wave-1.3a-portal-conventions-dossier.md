I now have enough information to produce the complete dossier. Let me compile it:

---

# Procurement Workspace — Wave 1.3a Portal Conventions Dossier

**Sprint 1 · Wave 1.3a · Code Explorer deliverable**
**Date:** 2026-05-27
**Source:** Live codebase read at `/Users/kody/Code/patina-merged`
**Upstream waves complete:** 1.1 (Data Architect), 1.2 (Migration Engineer ×2), 1.2.5 (Sweep + Seed Fix)
**Consumers:** Wave 1.3b Component Builder ×3 (nav scaffold, By Vendor shell, By Status shell)

---

## §A · Shared Conventions

All three Builders read this section. Deviate from any of these conventions and the Code Reviewer will flag it.

### A.1 Portal Layout Wrapper

The portal layout is at `/Users/kody/Code/patina-merged/apps/designer-portal/src/app/(portal)/portal/layout.tsx`. It is a single `'use client'` component that wraps all child pages with:

- `CommandPaletteProvider` → `MessagesPanelProvider` → `ToastProvider` as the context stack
- `<TopBar />` and `<SubNav />` inside a `<Suspense fallback={null}>` (no spinner on nav)
- `<main className="flex-1 pb-24 pt-8 md:pb-8">` — page content lives here
- `<PageContainer>` wrapping children — centers to `max-w-portal` (1800px) at `w-[90vw]`
- Inner `<Suspense fallback={<LoadingStrata />}>` around `{children}` with `<div className="animate-page-enter">`
- `<MobileTabBar />`, `<MessagesPanel />`, `<CommandPalette />`, `<FirstSigninTour />` appended after `<main>`

**No zone-level layout files exist.** There is no `pipeline/layout.tsx`, no `catalog/layout.tsx`. All child zones render as direct children of the portal layout. The Procurement zone does not need its own `layout.tsx` unless it adds zone-local state (it does not in Sprint 1).

### A.2 Page Wrapper Pattern

Every zone page top-level container is `<div className="pt-8">` (Pipeline) or `<div className="pt-6">` (Catalog). `pt-8` is the right choice for a full-zone view like By Vendor or By Status.

**Standard page structure:**
```
<div className="pt-8">
  {/* 1. Breadcrumb — only on deep pages (e.g., project detail); zone top-level views don't use it */}

  {/* 2. Header band — title row + optional count/meta */}
  <div className="mb-6 flex flex-wrap items-baseline justify-between gap-4">
    <div>
      <h1 className="type-section-head"> ... </h1>  {/* or font-style overridden */}
      <SectionIntro surfaceKey={...} fallback="..." className="..." />
    </div>
    <div className="type-meta-small text-[var(--text-muted)]"> {count} items </div>
  </div>

  {/* 3. Filter row */}
  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
    <SearchInput ... />
    <FacetedFilterPopover ... />
  </div>

  {/* 4. Content area (list, kanban, grid) */}
  ...

  {/* 5. Empty state — only when no items */}
  ...
</div>
```

### A.3 Loading State

The global `queryClient` in `/Users/kody/Code/patina-merged/apps/designer-portal/src/lib/react-query.ts` has `suspense: false` explicitly. All pages handle loading via an `isLoading` flag check, not React Suspense.

**Pattern for a page with a single primary hook:**
```tsx
const { data: orders, isLoading } = usePurchaseOrders(filters);
if (isLoading) return <LoadingStrata />;
```

**Pattern for a page with multiple parallel hooks** (e.g., Pipeline):
```tsx
const isLoading = leadsLoading || proposalsLoading || projectsLoading;
if (isLoading) return <LoadingStrata />;
```

The `<LoadingStrata />` component re-exports from `@patina/catalog-ui` — it is a skeleton placeholder, not a spinner. Import it as:
```tsx
import { LoadingStrata } from '@/components/portal/loading-strata';
```

The `@/components/portal/loading-strata` barrel re-exports the component, so this import always works.

### A.4 Empty State

Two-layer pattern used by Pipeline and Catalog pages, now standard in this portal:

1. **CMS-backed probe:** `useHelpContent(surfaceKey, 'emptyState')` from `@patina/help-system` — cheap query deduped with the fetch inside `<EmptyState>`.
2. **CMS hit:** render `<EmptyState surfaceKey={...} />` inside a border wrapper.
3. **CMS miss (Sprint 1 default):** render a local fallback div with `.rounded-lg .border .border-[var(--border-default)] .px-6 .py-12 .text-center`.

For Sprint 1, the procurement views may omit the CMS probe layer entirely and just render the local fallback. The CMS-probe wrapper is optional until Sanity content is authored. The By Vendor and By Status Builders should render a simple fallback only — annotate with a `// TODO(help-system): wire CMS empty-state when surface keys are assigned` comment. This is acceptable per the `PipelineEmptyState` pattern in pipeline/page.tsx lines 119–159.

**Minimal empty state for Sprint 1:**
```tsx
<div className="rounded-lg border border-[var(--border-default)] px-6 py-12 text-center">
  <p className="text-sm font-medium text-[var(--text-primary)]">No purchase orders yet</p>
  <p className="mt-1 text-[0.8rem] text-[var(--text-muted)]">
    Create a purchase order from the FF&E board to see it here.
  </p>
</div>
```

### A.5 Design System Components

All 122 components from `@patina/design-system` are available. Components confirmed to exist and relevant to procurement views:

- `Badge` — `/packages/patina-design-system/src/components/Badge/Badge.tsx` — `cva`-based with `variant: solid | subtle | outline | dot`, `color: primary | success | warning | error | info | neutral`, `size: sm | md | lg`. **This is the base for the PaymentPill** (see §D).
- `Drawer` — `/packages/patina-design-system/src/components/Drawer/Drawer.tsx` — for the item-detail side panel (Wave 1.4 only; not needed in Sprint 1 Builder scope).
- `Card` — `/packages/patina-design-system/src/components/Card/Card.tsx` — for the vendor card wrapper.

**Portal-local components** (import from `@/components/portal` barrel or direct path):

| Component | Import path | Notes |
|---|---|---|
| `LoadingStrata` | `@/components/portal/loading-strata` | Skeleton placeholder |
| `Breadcrumb` | `@/components/portal/breadcrumb` | Items array `{label, href?}` |
| `SearchInput` | `@/components/portal/search-input` | `value` + `onChange` + `placeholder` |
| `FacetedFilterPopover` | `@/components/portal/faceted-filter-popover` | `facets`, `value`, `onChange` |
| `BulkActionBar` | `@/components/portal/bulk-action-bar` | Sprint 1 optional |
| `PageContainer` | `@/components/portal/page-container` | Already wraps all pages via layout |

`PageContainer` is already applied by the layout — do NOT add it again inside page files.

### A.6 CSS Design Tokens

All colors are CSS custom properties. Use `var(...)` inline styles or Tailwind classes with the `patina-*` prefix for the brand palette. The complete token set from `globals.css`:

**Brand palette (use these for procurement views):**
```
--color-off-white:  #FAF7F2   → --bg-primary
--color-pearl:      #E5E2DD   → --border-default
--color-clay:       #C4A57B   → --accent-primary
--color-aged-oak:   #8B7355   → --text-muted, --accent-hover
--color-mocha:      #5C4A3C   → --text-body
--color-charcoal:   #2C2926   → --text-primary

--color-sage:       #A8B5A0   (Delivered/Installed stage color)
--color-dusty-blue: #8B9CAD   (Quoted/Ordered stage color + info)
--color-terracotta: #D4A090   (Warning/blocked items)
--color-golden-hour:#E8C547   (Production/Shipped stage color)
```

**Semantic tokens:**
```
--bg-primary       (off-white page background)
--bg-surface       (#FFFFFF card backgrounds)
--bg-hover         (rgba(196, 165, 123, 0.06) — hover state)
--text-primary     (charcoal — headings, values)
--text-body        (mocha — body text)
--text-muted       (aged oak — labels, secondary)
--accent-primary   (clay — links, active indicators)
--border-default   (pearl — all card/row borders)
--border-subtle    (rgba(229,226,221,0.6) — lighter dividers)
--color-success:   #7A9B76  (paid state)
--color-warning:   #D4A574  (due state)
--color-error:     #C77B6E  (overdue)
```

**Tailwind class equivalents** (from `tailwind.config.ts`):
- `text-patina-clay`, `bg-patina-clay`, `border-patina-clay`
- `text-patina-sage`, `bg-patina-sage`
- `text-patina-terracotta`, `bg-patina-terracotta`
- `text-patina-golden-hour`, `bg-patina-golden-hour`
- `text-patina-dusty-blue`, `bg-patina-dusty-blue`

### A.7 Typography Classes

These come from `packages/patina-design-system/src/styles/typography.css` (imported in globals.css):

- `type-page-title` — large page hero heading (Today page)
- `type-section-head` — zone page headings (Pipeline "Pipeline", Catalog "Products")
- `type-body` — body text
- `type-body-small` — smaller body text
- `type-meta` — caption-level
- `type-meta-small` — smallest, used for labels/counts in nav and cards
- Font variables: `var(--font-display)` (Playfair Display), `var(--font-body)` (Inter), `var(--font-meta)` (DM Mono)

### A.8 TanStack Query Provider

The `QueryClientProvider` is mounted at the root in `/Users/kody/Code/patina-merged/apps/designer-portal/src/providers/providers.tsx`, wrapping the entire app via `app/layout.tsx`. **No additional provider wiring is needed** in any procurement page or layout. The `queryClient` singleton is exported from `@/lib/react-query` and shared.

The `queryClient` has `suspense: false` and `staleTime: 5 minutes`. All procurement hooks must use `isLoading` flag pattern, not Suspense.

### A.9 Import Path for Procurement Hooks

Wave 1.2 added `use-procurement.ts` to `packages/supabase/src/hooks/` and exported it from the index. The export lines in `packages/supabase/src/hooks/index.ts` are at lines 855–872. Import in portal files as:

```tsx
import { usePurchaseOrders, type PurchaseOrder, type POPayment } from '@patina/supabase';
```

All 7 hooks are available: `usePurchaseOrders`, `usePOPayments`, `useVendorPaymentTerms`, `useUpdateVendorPaymentTerms`, `useCreatePurchaseOrder`, `useLogPaymentPaid`, `useAdvancePaymentToDue`.

### A.10 'use client' Requirement

The portal layout is `'use client'`. All zone pages that use hooks must also declare `'use client'` as the first line. This matches every existing zone page (pipeline, catalog, messages, etc.). There are no server components in the `(portal)` route group except for layout.tsx itself... and in fact the layout is `'use client'` as well. Every new procurement page file **must** start with `'use client'`.

---

## §B · For Builder 1 (Procurement Zone Nav + Route Scaffold)

### B.1 Current Navigation State

File: `/Users/kody/Code/patina-merged/apps/designer-portal/src/config/navigation.ts`

Current `ZoneKey` union: `'today' | 'pipeline' | 'products' | 'clients' | 'messages'`

Current `ZONES` array order (index 0→4): `today → pipeline → products → clients → messages`

The orchestration plan says to insert `'procurement'` between `'pipeline'` and `'catalog'` (catalog = the `products` zone, key `'products'`, href `/portal/catalog`). The PRD top nav text examples are "Today / Pipeline / Procurement / Products / Clients" — this matches inserting after `pipeline` (index 1) and before `products` (index 2).

**Confirmed insertion point: between `pipeline` and `products`.**

The live nav has 5 zones: Today, Pipeline, Products, Clients, Messages. PRD omits Messages from its nav diagram but Messages is a real zone. Insert Procurement at index 2 (after Pipeline, before Products) — this gives the sequence: Today → Pipeline → Procurement → Products → Clients → Messages.

### B.2 Icon Selection

All icons come from `lucide-react`. The current zone icons:
- `CalendarDays` (Today), `TrendingUp` (Pipeline), `Package` (Products), `Users` (Clients), `MessageSquare` (Messages)

For Procurement, the appropriate Lucide icon is `ShoppingBag`. It is not currently used in `navigation.ts` and semantically fits "purchase orders / procurement". Import it alongside the existing imports.

Alternative: `ClipboardList` (also unused, more clinical feel). **Recommend `ShoppingBag`** — it aligns with "order day" framing in the PRD and matches the Lucide icon set style.

### B.3 Exact Diff for `navigation.ts`

Apply the following precise changes. The file is at `/Users/kody/Code/patina-merged/apps/designer-portal/src/config/navigation.ts`.

**Change 1 — Import `ShoppingBag`** (line 1, merge into existing import block):

Replace:
```typescript
import {
  CalendarDays,
  TrendingUp,
  Package,
  Users,
  MessageSquare,
  DollarSign,
  Image,
  Clock,
  Settings,
  HelpCircle,
  type LucideIcon,
} from 'lucide-react';
```

With:
```typescript
import {
  CalendarDays,
  TrendingUp,
  ShoppingBag,
  Package,
  Users,
  MessageSquare,
  DollarSign,
  Image,
  Clock,
  Settings,
  HelpCircle,
  type LucideIcon,
} from 'lucide-react';
```

**Change 2 — Extend `ZoneKey` union** (line 17):

Replace:
```typescript
export type ZoneKey = 'today' | 'pipeline' | 'products' | 'clients' | 'messages';
```

With:
```typescript
export type ZoneKey = 'today' | 'pipeline' | 'procurement' | 'products' | 'clients' | 'messages';
```

**Change 3 — Add procurement zone to `ZONES` array** (after the `pipeline` entry, before `products`). The pipeline entry ends at the closing `},` before line 50. Insert a new zone object between the pipeline and products entries:

After the closing `},` of the pipeline zone (after line ~48), and before `{` of the products zone (before line ~49), insert:
```typescript
  {
    key: 'procurement',
    label: 'Procurement',
    href: '/portal/procurement',
    paths: ['/portal/procurement'],
    icon: ShoppingBag,
  },
```

The `paths` array contains only `/portal/procurement`. This means `useActiveZone` will activate the Procurement zone for any path that starts with `/portal/procurement/`. Purchase orders do not live at other paths (unlike Pipeline which maps `/portal/projects`, `/portal/leads`, etc.), so a single-entry `paths` array is correct.

**Change 4 — Add procurement sub-nav items to `ZONE_SUB_ITEMS`** (the `Record<ZoneKey, SubNavItem[]>` at line 91). Because `ZoneKey` now includes `'procurement'`, the record must include a `procurement` key or TypeScript will error. Add after `pipeline:`:

After line 99 (closing `],` of `pipeline`), insert:
```typescript
  procurement: [
    { label: 'By Vendor',  href: '/portal/procurement',            exact: true },
    { label: 'By Status',  href: '/portal/procurement/by-status'   },
    { label: 'Calendar',   href: '/portal/procurement/calendar'    },
    { label: 'Receiving',  href: '/portal/procurement/receiving'   },
  ],
```

Note: "By Vendor" uses `exact: true` because `/portal/procurement` is both the zone root and the By Vendor view. Without `exact: true`, the `useActiveZone` active-sub-nav logic (which does `pathname.startsWith(itemPath + '/')` for non-exact items) would match all sub-routes to "By Vendor".

**Change 5 — Add procurement to `ZONE_ACTIONS`** (optional for Sprint 1; the action drives the right-side CTA in SubNav). The PRD does not specify a "Add PO" top-level CTA in Sprint 1 — the Order Assistant is a side panel flow added in Wave 1.4. For now, omit from `ZONE_ACTIONS` (the key need not appear; `ZONE_ACTIONS` is `Partial<Record<ZoneKey, SubNavAction>>`).

**Complete resulting `ZONES` array after the diff:**
```typescript
export const ZONES: ZoneConfig[] = [
  {
    key: 'today',
    label: 'Today',
    href: '/portal',
    paths: ['/portal'],
    icon: CalendarDays,
  },
  {
    key: 'pipeline',
    label: 'Pipeline',
    href: '/portal/pipeline',
    paths: [
      '/portal/pipeline',
      '/portal/leads',
      '/portal/proposals',
      '/portal/projects',
    ],
    icon: TrendingUp,
  },
  {
    key: 'procurement',
    label: 'Procurement',
    href: '/portal/procurement',
    paths: ['/portal/procurement'],
    icon: ShoppingBag,
  },
  {
    key: 'products',
    label: 'Products',
    href: '/portal/catalog',
    paths: [
      '/portal/catalog',
      '/portal/teaching',
      '/portal/companion',
    ],
    icon: Package,
  },
  {
    key: 'clients',
    label: 'Clients',
    href: '/portal/clients',
    paths: [
      '/portal/clients',
      '/portal/reviews',
      '/portal/nurture',
      '/portal/decisions',
    ],
    icon: Users,
  },
  {
    key: 'messages',
    label: 'Messages',
    href: '/portal/messages',
    paths: ['/portal/messages'],
    icon: MessageSquare,
  },
];
```

### B.4 `use-active-zone.ts` — Required Update

File: `/Users/kody/Code/patina-merged/apps/designer-portal/src/hooks/use-active-zone.ts`

The `detectDeepPage` function at line 119 has a `deepPatterns: Record<ZoneKey, RegExp[]>` object. Because `ZoneKey` now includes `'procurement'`, this Record must include a `procurement` key or TypeScript will error when `--strict` is enabled.

Add to `detectDeepPage`:
```typescript
const deepPatterns: Record<ZoneKey, RegExp[]> = {
  today: [],
  pipeline: [ ... ],
  procurement: [],          // ← ADD THIS — no deep sub-routes in Sprint 1
  products: [ ... ],
  clients: [ ... ],
  messages: [],             // ← already missing from deepPatterns; add if needed
};
```

Check lines 119–149: if `messages` is already absent (it is — the `??` fallback handles it), then `procurement: []` is the only mandatory addition for TypeScript correctness. Add it.

### B.5 `use-nav-counts.ts` — Required Update

File: `/Users/kody/Code/patina-merged/apps/designer-portal/src/hooks/use-nav-counts.ts`

The return type `Record<string, number | undefined>` is untyped so it will not error. However, the function body does not have a branch for `zone === 'procurement'`. In Sprint 1 the sub-nav does not show live counts (unlike Pipeline which shows lead/proposal counts). Add an empty branch to keep the code readable and extension-ready:

```typescript
if (zone === 'procurement') {
  // Sprint 1: counts not shown on procurement sub-nav.
  // Wave 1.4 can add: counts['By Vendor'] = purchaseOrders?.length;
}
```

This addition is optional for typecheck to pass but is a good practice signal for reviewers.

### B.6 `mobile-tab-bar.tsx` — Required Update

File: `/Users/kody/Code/patina-merged/apps/designer-portal/src/components/portal/mobile-tab-bar.tsx`

The `MobileTabBar` has its own hardcoded `tabs` array (it does NOT read from `ZONES`). It currently has 5 tabs matching ZONES. The Procurement zone must be added here manually. Insert after the Pipeline tab and before Products:

```typescript
{
  label: 'Procurement',
  href: '/portal/procurement',
  paths: ['/portal/procurement'],
  icon: ShoppingBag,
},
```

Add `ShoppingBag` to the import from `lucide-react` at the top of that file. Current import is:
```typescript
import { CalendarDays, TrendingUp, Package, Users, MessageSquare } from 'lucide-react';
```

Replace with:
```typescript
import { CalendarDays, TrendingUp, ShoppingBag, Package, Users, MessageSquare } from 'lucide-react';
```

**Note:** The mobile tab bar now has 6 tabs. On small screens this may be tight — 6 items at `justify-around` in a 52px bar. This is acceptable for Sprint 1 and can be addressed in Sprint 3 (where PostHog flags may gate the Procurement tab for non-pilot users, effectively keeping it at 5 for most). Flag in the PR description.

### B.7 Route Folder Structure

The existing zone routes live at `apps/designer-portal/src/app/(portal)/portal/<zone>/page.tsx`. There is no `layout.tsx` at the zone level for any existing zone (confirmed by reading the Glob results). Procurement follows the same flat pattern.

**Create exactly these files:**

```
apps/designer-portal/src/app/(portal)/portal/procurement/
  page.tsx                     # Zone root = By Vendor view (see §C)
  by-status/
    page.tsx                   # By Status view (see §D)
  calendar/
    page.tsx                   # Placeholder page for Sprint 2
  receiving/
    page.tsx                   # Placeholder page for Sprint 2
```

No `layout.tsx` is needed. The `(portal)/portal/layout.tsx` handles all wrapping.

**`page.tsx`** is the By Vendor view (Builder 2's deliverable). Builder 1 creates the file and its basic shell; Builder 2 fills it with real content. Builder 1 can hand off an empty shell:

```tsx
// apps/designer-portal/src/app/(portal)/portal/procurement/page.tsx
'use client';

import { Suspense } from 'react';
import { LoadingStrata } from '@/components/portal/loading-strata';

function ByVendorContent() {
  return (
    <div className="pt-8">
      <h1 className="type-section-head mb-2">Procurement — By Vendor</h1>
      <p className="text-sm text-[var(--text-muted)]">Loading…</p>
    </div>
  );
}

export default function ProcurementByVendorPage() {
  return (
    <Suspense fallback={<LoadingStrata />}>
      <ByVendorContent />
    </Suspense>
  );
}
```

**`calendar/page.tsx`** — placeholder:
```tsx
'use client';

export default function ProcurementCalendarPage() {
  return (
    <div className="pt-8">
      <h1 className="type-section-head mb-2">Calendar</h1>
      <p className="text-sm text-[var(--text-muted)]">
        Delivery calendar — coming in Sprint 2.
      </p>
    </div>
  );
}
```

**`receiving/page.tsx`** — identical placeholder pattern:
```tsx
'use client';

export default function ProcurementReceivingPage() {
  return (
    <div className="pt-8">
      <h1 className="type-section-head mb-2">Receiving</h1>
      <p className="text-sm text-[var(--text-muted)]">
        Receiving dashboard — coming in Sprint 2.
      </p>
    </div>
  );
}
```

`by-status/page.tsx` is Builder 3's deliverable — Builder 1 creates the file scaffold only (same shell pattern as the calendar page), then Builder 3 replaces it.

### B.8 Files Builder 1 Touches

1. `apps/designer-portal/src/config/navigation.ts` — add zone + sub-items (§B.3)
2. `apps/designer-portal/src/hooks/use-active-zone.ts` — add `procurement: []` to deepPatterns (§B.4)
3. `apps/designer-portal/src/hooks/use-nav-counts.ts` — add empty procurement branch (§B.5)
4. `apps/designer-portal/src/components/portal/mobile-tab-bar.tsx` — add Procurement tab (§B.6)
5. `apps/designer-portal/src/app/(portal)/portal/procurement/page.tsx` — create shell (§B.7)
6. `apps/designer-portal/src/app/(portal)/portal/procurement/by-status/page.tsx` — create shell
7. `apps/designer-portal/src/app/(portal)/portal/procurement/calendar/page.tsx` — create placeholder
8. `apps/designer-portal/src/app/(portal)/portal/procurement/receiving/page.tsx` — create placeholder

---

## §C · For Builder 2 (By Vendor View Shell + Vendor Card)

### C.1 Page Location and Context

File to implement: `apps/designer-portal/src/app/(portal)/portal/procurement/page.tsx`

This is the zone root — `/portal/procurement` navigates here. The SubNav "By Vendor" link has `exact: true` and `href: '/portal/procurement'`, so this page is also the active state for "By Vendor" in the sub-nav.

### C.2 Page Skeleton

```tsx
'use client';

import { useMemo, useState } from 'react';
import { usePurchaseOrders, type PurchaseOrder } from '@patina/supabase';
import { LoadingStrata } from '@/components/portal/loading-strata';
import { SearchInput } from '@/components/portal/search-input';

// ─── Grouping helper ────────────────────────────────────────────────────────

interface VendorGroup {
  vendorId: string;
  vendorName: string;
  orders: PurchaseOrder[];
  totalCents: number;
  hasDuePayment: boolean;
}

function groupByVendor(orders: PurchaseOrder[]): VendorGroup[] {
  const map = new Map<string, VendorGroup>();

  for (const po of orders) {
    const key = po.vendor_id;
    if (!map.has(key)) {
      map.set(key, {
        vendorId: po.vendor_id,
        vendorName: po.vendor?.name ?? 'Unknown Vendor',
        orders: [],
        totalCents: 0,
        hasDuePayment: false,
      });
    }
    const group = map.get(key)!;
    group.orders.push(po);
    group.totalCents += po.total_cents;
    if ((po.payments ?? []).some((p) => p.state === 'due')) {
      group.hasDuePayment = true;
    }
  }

  // Sort: vendors with due payments first, then alphabetically
  return Array.from(map.values()).sort((a, b) => {
    if (a.hasDuePayment !== b.hasDuePayment) return a.hasDuePayment ? -1 : 1;
    return a.vendorName.localeCompare(b.vendorName);
  });
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function ByVendorContent() {
  const [search, setSearch] = useState('');
  const { data: orders, isLoading } = usePurchaseOrders();

  const allOrders = (orders ?? []) as PurchaseOrder[];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allOrders;
    return allOrders.filter((po) => {
      const hay = [
        po.vendor?.name,
        po.project?.name,
        po.vendor_po_number,
      ].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [allOrders, search]);

  const groups = useMemo(() => groupByVendor(filtered), [filtered]);

  if (isLoading) return <LoadingStrata />;

  return (
    <div className="pt-8">
      {/* Header band */}
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="type-section-head">Procurement</h1>
          <p className="mt-1 text-[0.8rem] text-[var(--text-muted)]">
            Purchase orders grouped by vendor across all projects.
          </p>
        </div>
        <span className="type-meta-small text-[var(--text-muted)]">
          {allOrders.length} order{allOrders.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Filter row */}
      <div className="mb-6">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search vendor, project, or PO number…"
        />
      </div>

      {/* Empty state */}
      {groups.length === 0 && (
        <div className="rounded-lg border border-[var(--border-default)] px-6 py-12 text-center">
          <p className="text-sm font-medium text-[var(--text-primary)]">No purchase orders yet</p>
          <p className="mt-1 text-[0.8rem] text-[var(--text-muted)]">
            Create a purchase order from the FF&amp;E board to see it here.
          </p>
          {/* TODO(help-system): wire CMS empty-state when surface keys are assigned */}
        </div>
      )}

      {/* Vendor group list */}
      {groups.length > 0 && (
        <div className="flex flex-col gap-4">
          {groups.map((group) => (
            <VendorCard key={group.vendorId} group={group} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function ProcurementByVendorPage() {
  return <ByVendorContent />;
}
```

Note: The Suspense wrapper used by Pipeline is optional here since `suspense: false` on the QueryClient means Suspense would never fire. Omit it unless the Reviewer requests it.

### C.3 Vendor Card Component

Create at `apps/designer-portal/src/components/portal/vendor-po-card.tsx`.

The card wraps one `VendorGroup` and renders:
- Vendor name (heading) + due-payment warning dot
- Row count and total value
- Collapsed list of PO rows with status pills and payment pills

```tsx
'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { PurchaseOrder, POPayment } from '@patina/supabase';

interface VendorGroup {
  vendorId: string;
  vendorName: string;
  orders: PurchaseOrder[];
  totalCents: number;
  hasDuePayment: boolean;
}

function formatDollars(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function formatDate(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Payment-state pill — see §D.4 for full color spec */
function PaymentPill({ payment }: { payment: POPayment }) {
  const stateColors: Record<string, { bg: string; text: string; label: string }> = {
    pending: {
      bg: 'var(--color-pearl)',
      text: 'var(--text-muted)',
      label: 'Pending',
    },
    due: {
      bg: 'rgba(212, 165, 116, 0.18)',
      text: 'var(--color-warning)',
      label: 'Due',
    },
    paid: {
      bg: 'rgba(122, 155, 118, 0.15)',
      text: 'var(--color-success)',
      label: 'Paid',
    },
  };
  const cfg = stateColors[payment.state] ?? stateColors.pending;
  const kindLabel = payment.kind === 'deposit'
    ? 'Deposit'
    : payment.kind === 'balance'
    ? 'Balance'
    : payment.label ?? 'Milestone';

  return (
    <span
      className="inline-flex items-center gap-1 rounded-[3px] px-2 py-0.5 font-mono text-[0.58rem] uppercase tracking-[0.05em]"
      style={{ backgroundColor: cfg.bg, color: cfg.text }}
    >
      {kindLabel} · {cfg.label}
      {payment.due_date && payment.state !== 'paid' && (
        <span className="ml-1 opacity-70">{formatDate(payment.due_date)}</span>
      )}
    </span>
  );
}

/** PO status label — maps POStatus to a short display string */
function PoStatusLabel({ status }: { status: string }) {
  const labels: Record<string, string> = {
    draft: 'Draft',
    confirmed: 'Confirmed',
    in_production: 'In Production',
    shipped: 'Shipped',
    delivered: 'Delivered',
    cancelled: 'Cancelled',
  };
  return (
    <span className="font-mono text-[0.55rem] uppercase tracking-wider text-[var(--text-muted)]">
      {labels[status] ?? status}
    </span>
  );
}

export function VendorPOCard({ group }: { group: VendorGroup }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div
      className="rounded-md border"
      style={{
        borderColor: group.hasDuePayment
          ? 'var(--color-warning)'
          : 'var(--border-default)',
        background: 'var(--bg-surface)',
      }}
    >
      {/* Card header */}
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3 text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-2">
          {group.hasDuePayment && (
            <span
              className="h-2 w-2 flex-shrink-0 rounded-full"
              style={{ backgroundColor: 'var(--color-warning)' }}
              aria-label="Payment due"
            />
          )}
          <span
            className="font-heading text-[0.95rem] font-medium text-[var(--text-primary)]"
          >
            {group.vendorName}
          </span>
          <span className="type-meta-small text-[var(--text-muted)]">
            {group.orders.length} PO{group.orders.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-heading text-[0.9rem] font-semibold text-[var(--text-primary)]">
            {formatDollars(group.totalCents)}
          </span>
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-[var(--text-muted)]" />
          ) : (
            <ChevronRight className="h-4 w-4 text-[var(--text-muted)]" />
          )}
        </div>
      </button>

      {/* PO rows */}
      {expanded && (
        <div
          className="border-t"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          {group.orders.map((po) => (
            <div
              key={po.id}
              className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3 last:border-b-0"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              {/* Left: project + PO number + ETA */}
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-[0.82rem] font-medium text-[var(--text-primary)]">
                    {po.project?.name ?? 'Unknown Project'}
                  </span>
                  {po.vendor_po_number && (
                    <span className="font-mono text-[0.6rem] text-[var(--text-muted)]">
                      {po.vendor_po_number}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex items-center gap-2">
                  <PoStatusLabel status={po.status} />
                  {po.confirmed_eta && (
                    <span className="font-mono text-[0.58rem] text-[var(--text-muted)]">
                      ETA {formatDate(po.confirmed_eta)}
                    </span>
                  )}
                </div>
              </div>

              {/* Right: payment pills + total */}
              <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
                <span className="font-heading text-[0.85rem] font-semibold text-[var(--text-primary)]">
                  {formatDollars(po.total_cents)}
                </span>
                <div className="flex flex-wrap justify-end gap-1">
                  {po.is_patina_catalog ? (
                    <PatinaHandledPill />
                  ) : (
                    (po.payments ?? [])
                      .sort((a, b) => a.sort_order - b.sort_order)
                      .map((payment) => (
                        <PaymentPill key={payment.id} payment={payment} />
                      ))
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Special pill shown when is_patina_catalog = true */
function PatinaHandledPill() {
  return (
    <span
      className="inline-flex items-center rounded-[3px] px-2 py-0.5 font-mono text-[0.58rem] uppercase tracking-[0.05em]"
      style={{
        backgroundColor: 'rgba(196, 165, 123, 0.15)',
        color: 'var(--color-clay)',
      }}
    >
      Patina handled
    </span>
  );
}
```

### C.4 How to Call `usePurchaseOrders` and Group In-Memory

`usePurchaseOrders()` called without filters returns all POs for the authenticated designer, with nested `vendor`, `project`, and `payments` fields (the Supabase query joins them). The hook is stable from Wave 1.2.

**No cross-project filter is needed for By Vendor** — the PRD §5 "By Vendor" view aggregates across all projects by default. A project filter can be exposed via a future query param but is out of scope for Sprint 1.

**In-memory grouping** (see `groupByVendor` in §C.2 above):
- Iterate `orders`, key by `vendor_id`
- Accumulate `totalCents` (sum of `po.total_cents`) and check for any `payment.state === 'due'` to set `hasDuePayment`
- Sort: due-payment vendors first, then alphabetical by vendor name

**Count badge in sub-nav:** The sub-nav counts come from `useNavCounts` in `use-nav-counts.ts`. For Sprint 1, Builder 1's empty procurement branch means no count badge appears. If the Builder wants a badge ("By Vendor · 3"), they would add `counts['By Vendor'] = purchaseOrders?.length` in the `procurement` branch — but this requires calling `usePurchaseOrders` from `use-nav-counts.ts`, which would add an always-on background fetch. Recommend deferring this to Wave 1.4 and leaving it as a comment in `use-nav-counts.ts`.

### C.5 Files Builder 2 Touches

1. `apps/designer-portal/src/app/(portal)/portal/procurement/page.tsx` — implement (replaces Builder 1's shell)
2. `apps/designer-portal/src/components/portal/vendor-po-card.tsx` — create new component

Builder 2 does NOT touch `navigation.ts` (that's Builder 1's responsibility). If Builder 1 has not merged, Builder 2 works on the procurement branch with the navigation changes already applied.

---

## §D · For Builder 3 (By Status View Shell + Payment Pill)

### D.1 Page Location

File: `apps/designer-portal/src/app/(portal)/portal/procurement/by-status/page.tsx`

This replaces the scaffold Builder 1 creates. The sub-nav "By Status" link points to `/portal/procurement/by-status` (no `exact: true`).

### D.2 The 8-Stage `STAGES` Const — Exact Values and Lift Decision

The const is currently defined at `/Users/kody/Code/patina-merged/apps/designer-portal/src/app/(portal)/portal/projects/[id]/ffe/page.tsx`, lines 37–46:

```typescript
const STAGES = [
  { key: 'specified',  label: 'Specified',   color: 'var(--text-muted)',                       surfaceKey: SurfaceKeys.DesignerPortal.Ffe.Stage.Specified },
  { key: 'quoted',     label: 'Quoted',      color: 'var(--color-dusty-blue, #8B9CAD)',        surfaceKey: SurfaceKeys.DesignerPortal.Ffe.Stage.Quoted },
  { key: 'approved',   label: 'Approved',    color: 'var(--color-clay, #C4A57B)',              surfaceKey: SurfaceKeys.DesignerPortal.Ffe.Stage.Approved },
  { key: 'ordered',    label: 'Ordered',     color: 'var(--color-dusty-blue, #8B9CAD)',        surfaceKey: SurfaceKeys.DesignerPortal.Ffe.Stage.Ordered },
  { key: 'production', label: 'Production',  color: 'var(--color-golden-hour, #E8C547)',       surfaceKey: SurfaceKeys.DesignerPortal.Ffe.Stage.Production },
  { key: 'shipped',    label: 'Shipped',     color: 'var(--color-golden-hour, #E8C547)',       surfaceKey: SurfaceKeys.DesignerPortal.Ffe.Stage.Shipped },
  { key: 'delivered',  label: 'Delivered',   color: 'var(--color-sage, #A8B5A0)',              surfaceKey: SurfaceKeys.DesignerPortal.Ffe.Stage.Delivered },
  { key: 'installed',  label: 'Installed',   color: 'var(--color-sage, #A8B5A0)',              surfaceKey: SurfaceKeys.DesignerPortal.Ffe.Stage.Installed },
];
```

**Decision on lifting:** The `STAGES` const includes `surfaceKey` references to `SurfaceKeys.DesignerPortal.Ffe.Stage.*` from `@patina/help-system`. Lifting the entire const into `@patina/types` would create a dependency on `@patina/help-system` from `@patina/types`, which is an unwanted circular direction (`types` is a lower-level package than `help-system`).

**Recommended approach for Builder 3:** Do NOT lift the full const. Instead, define a shared **stage key list** in `@patina/types` and reference it from both files.

Create `packages/types/src/ffe.ts`:
```typescript
/**
 * The 8 ordered stages in the FF&E procurement lifecycle.
 * These keys match the `status` CHECK constraint on `project_ffe_items`.
 */
export type FFEStageKey =
  | 'specified'
  | 'quoted'
  | 'approved'
  | 'ordered'
  | 'production'
  | 'shipped'
  | 'delivered'
  | 'installed';

export const FFE_STAGE_KEYS: readonly FFEStageKey[] = [
  'specified',
  'quoted',
  'approved',
  'ordered',
  'production',
  'shipped',
  'delivered',
  'installed',
] as const;
```

Then add to `packages/types/src/index.ts`:
```typescript
export * from './ffe';
```

In `ffe/page.tsx`, add `import { FFE_STAGE_KEYS } from '@patina/types';` and update the `STAGES` const to derive from it (optional, low-risk change). In `by-status/page.tsx`, the Builder imports `FFE_STAGE_KEYS` and `FFEStageKey` from `@patina/types` and defines their own display const with colors (no surfaceKeys needed for Sprint 1 — they can add them in a later wave when the help-system author has CMS entries for the Procurement zone):

```typescript
import { FFE_STAGE_KEYS, type FFEStageKey } from '@patina/types';

const STAGE_DISPLAY: Record<FFEStageKey, { label: string; color: string }> = {
  specified:  { label: 'Specified',  color: 'var(--text-muted)' },
  quoted:     { label: 'Quoted',     color: 'var(--color-dusty-blue, #8B9CAD)' },
  approved:   { label: 'Approved',   color: 'var(--color-clay, #C4A57B)' },
  ordered:    { label: 'Ordered',    color: 'var(--color-dusty-blue, #8B9CAD)' },
  production: { label: 'Production', color: 'var(--color-golden-hour, #E8C547)' },
  shipped:    { label: 'Shipped',    color: 'var(--color-golden-hour, #E8C547)' },
  delivered:  { label: 'Delivered',  color: 'var(--color-sage, #A8B5A0)' },
  installed:  { label: 'Installed',  color: 'var(--color-sage, #A8B5A0)' },
};
```

This approach: (a) creates a stable shared source of truth for the 8 stage keys, (b) keeps color/help-system concerns per-view, (c) requires only a small addition to `@patina/types` which is already a dependency of everything.

### D.3 By Status Page Skeleton

The By Status view groups `purchase_orders` by their `status` field (draft/confirmed/in_production/shipped/delivered/cancelled) — not by the `project_ffe_items.status` (the FFE stage). The `POStatus` type from `use-procurement.ts` maps to these 6 values.

**Clarification on "By Status" naming:** The PRD §7 "By Status" view is about purchase order status (draft → confirmed → in_production → shipped → delivered → cancelled), not the 8-stage FFE item status. The 8-stage const (`STAGES`) is used to show which FFE stage each PO's items are at — referenced as context within a PO card, not as the primary grouping axis. The primary grouping axis is `po.status`.

The column structure for By Status therefore has 6 columns (one per `POStatus`), not 8. This aligns with the state machine in the Wave 1.1 dossier §2.

```tsx
'use client';

import { useMemo } from 'react';
import { usePurchaseOrders, type PurchaseOrder, type POStatus } from '@patina/supabase';
import { FFE_STAGE_KEYS } from '@patina/types';
import { LoadingStrata } from '@/components/portal/loading-strata';

// PO status columns in lifecycle order
const PO_STATUS_COLUMNS: Array<{ key: POStatus; label: string; color: string }> = [
  { key: 'draft',        label: 'Draft',         color: 'var(--text-muted)' },
  { key: 'confirmed',    label: 'Confirmed',      color: 'var(--color-dusty-blue, #8B9CAD)' },
  { key: 'in_production',label: 'In Production',  color: 'var(--color-golden-hour, #E8C547)' },
  { key: 'shipped',      label: 'Shipped',        color: 'var(--color-golden-hour, #E8C547)' },
  { key: 'delivered',    label: 'Delivered',      color: 'var(--color-sage, #A8B5A0)' },
  { key: 'cancelled',    label: 'Cancelled',      color: 'var(--color-terracotta, #D4A090)' },
];

function formatDollars(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function formatDate(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function ByStatusContent() {
  const { data: orders, isLoading } = usePurchaseOrders();
  const allOrders = (orders ?? []) as PurchaseOrder[];

  const grouped = useMemo(() => {
    const map: Record<POStatus, PurchaseOrder[]> = {
      draft: [], confirmed: [], in_production: [], shipped: [], delivered: [], cancelled: [],
    };
    for (const po of allOrders) {
      const key = po.status as POStatus;
      if (map[key]) map[key].push(po);
    }
    return map;
  }, [allOrders]);

  if (isLoading) return <LoadingStrata />;

  const isEmpty = allOrders.length === 0;

  return (
    <div className="pt-8">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="type-section-head">By Status</h1>
          <p className="mt-1 text-[0.8rem] text-[var(--text-muted)]">
            Purchase orders grouped by procurement stage.
          </p>
        </div>
        <span className="type-meta-small text-[var(--text-muted)]">
          {allOrders.length} order{allOrders.length !== 1 ? 's' : ''}
        </span>
      </div>

      {isEmpty && (
        <div className="rounded-lg border border-[var(--border-default)] px-6 py-12 text-center">
          <p className="text-sm font-medium text-[var(--text-primary)]">No purchase orders yet</p>
          <p className="mt-1 text-[0.8rem] text-[var(--text-muted)]">
            Create a purchase order from the FF&amp;E board to see it here.
          </p>
          {/* TODO(help-system): wire CMS empty-state when Procurement surface keys are assigned */}
        </div>
      )}

      {/* Kanban-style horizontal scroll */}
      {!isEmpty && (
        <div className="overflow-x-auto pb-4">
          <div className="flex min-w-max gap-3">
            {PO_STATUS_COLUMNS.map((col) => {
              const colOrders = grouped[col.key];
              return (
                <div
                  key={col.key}
                  className="flex w-[280px] shrink-0 flex-col rounded-md border"
                  style={{ borderColor: 'var(--border-default)', background: 'var(--bg-surface)' }}
                >
                  {/* Column header */}
                  <div
                    className="flex items-center justify-between border-b px-3 py-2"
                    style={{ borderColor: 'var(--border-default)' }}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: col.color }}
                      />
                      <span
                        style={{
                          fontFamily: 'var(--font-meta)',
                          fontSize: '0.62rem',
                          textTransform: 'uppercase',
                          letterSpacing: '0.06em',
                        }}
                      >
                        {col.label}
                      </span>
                    </span>
                    <span className="type-meta-small text-[var(--text-muted)]">
                      {colOrders.length}
                    </span>
                  </div>

                  {/* PO cards */}
                  <div className="flex flex-col gap-2 p-2 min-h-[100px]">
                    {colOrders.map((po) => (
                      <POStatusCard key={po.id} po={po} />
                    ))}
                    {colOrders.length === 0 && (
                      <div className="py-6 text-center type-meta-small text-[var(--text-muted)]">
                        —
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProcurementByStatusPage() {
  return <ByStatusContent />;
}
```

### D.4 POStatusCard with Payment Pills

```tsx
function POStatusCard({ po }: { po: PurchaseOrder }) {
  const payments = (po.payments ?? []).sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div
      className="rounded-md border bg-white p-2.5"
      style={{ borderColor: 'var(--border-default)' }}
    >
      {/* Vendor + project */}
      <div className="mb-1.5">
        <div className="text-[0.8rem] font-medium text-[var(--text-primary)] line-clamp-1">
          {po.vendor?.name ?? 'Unknown Vendor'}
        </div>
        <div className="type-meta-small text-[var(--text-muted)]">
          {po.project?.name ?? 'Unknown Project'}
        </div>
      </div>

      {/* PO number + ETA row */}
      <div className="mb-1.5 flex items-center gap-2">
        {po.vendor_po_number && (
          <span className="font-mono text-[0.58rem] text-[var(--text-muted)]">
            {po.vendor_po_number}
          </span>
        )}
        {po.confirmed_eta && (
          <span className="font-mono text-[0.58rem] text-[var(--text-muted)]">
            ETA {formatDate(po.confirmed_eta)}
          </span>
        )}
      </div>

      {/* Total + payment pills */}
      <div className="flex items-start justify-between gap-2">
        <span className="font-heading text-[0.85rem] font-semibold text-[var(--text-primary)]">
          {formatDollars(po.total_cents)}
        </span>
        <div className="flex flex-col items-end gap-1">
          {po.is_patina_catalog ? (
            <PatinaHandledPill />
          ) : (
            payments.map((p) => <PaymentPill key={p.id} payment={p} />)
          )}
        </div>
      </div>
    </div>
  );
}
```

### D.5 Payment Pill Component Spec

The `PaymentPill` component (also used in Builder 2's vendor card — coordinate or extract to a shared file) is a portal-local component, not from `@patina/design-system`. It should live at:

`apps/designer-portal/src/components/portal/payment-pill.tsx`

This allows both By Vendor and By Status pages to import from the same source.

**Full payment pill spec:**

```tsx
'use client';

import type { POPayment } from '@patina/supabase';

interface PaymentPillProps {
  payment: POPayment;
}

function formatDate(d: string | null | undefined): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const STATE_STYLES: Record<
  string,
  { bg: string; text: string; stateLabel: string }
> = {
  pending: {
    bg: 'rgba(229, 226, 221, 0.5)',          // pearl at 50%
    text: 'var(--color-aged-oak)',
    stateLabel: 'Pending',
  },
  due: {
    bg: 'rgba(212, 165, 116, 0.18)',          // warning tint
    text: 'var(--color-warning)',             // #D4A574
    stateLabel: 'Due',
  },
  paid: {
    bg: 'rgba(122, 155, 118, 0.15)',          // success tint
    text: 'var(--color-success)',             // #7A9B76
    stateLabel: 'Paid',
  },
};

/**
 * Renders a compact pill showing payment kind + state for a po_payments row.
 *
 * - pending → pearl tint, aged-oak text, label "Deposit · Pending"
 * - due     → warm amber tint, warning text, label "Deposit · Due [May 12]"
 * - paid    → green tint, success text, label "Deposit · Paid"
 *
 * For is_patina_catalog POs, render <PatinaHandledPill> instead — see §D.6.
 */
export function PaymentPill({ payment }: PaymentPillProps) {
  const styles = STATE_STYLES[payment.state] ?? STATE_STYLES.pending;

  const kindLabel =
    payment.kind === 'deposit'
      ? 'Deposit'
      : payment.kind === 'balance'
      ? 'Balance'
      : payment.label ?? 'Milestone';

  const dateLabel =
    payment.state === 'due' && payment.due_date
      ? ` ${formatDate(payment.due_date)}`
      : '';

  return (
    <span
      className="inline-flex items-center rounded-[3px] px-2 py-0.5"
      style={{
        backgroundColor: styles.bg,
        color: styles.text,
        fontFamily: 'var(--font-meta)',
        fontSize: '0.58rem',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}
    >
      {kindLabel} · {styles.stateLabel}{dateLabel}
    </span>
  );
}
```

### D.6 Patina Handled Pill

For `is_patina_catalog === true` purchase orders, render this instead of individual payment pills:

```tsx
// apps/designer-portal/src/components/portal/patina-handled-pill.tsx

export function PatinaHandledPill() {
  return (
    <span
      className="inline-flex items-center rounded-[3px] px-2 py-0.5"
      style={{
        backgroundColor: 'rgba(196, 165, 123, 0.15)',  // clay tint
        color: 'var(--color-clay)',
        fontFamily: 'var(--font-meta)',
        fontSize: '0.58rem',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}
    >
      Patina handled
    </span>
  );
}
```

This pill can live in the same file as `PaymentPill` or in a separate `patina-handled-pill.tsx`. Keeping them together in `payment-pill.tsx` is recommended for colocation.

### D.7 Color Mapping Summary for Reviewers

| State | Background | Text color | Token used |
|---|---|---|---|
| `pending` | `rgba(229,226,221,0.5)` | `var(--color-aged-oak)` | pearl tint |
| `due` | `rgba(212,165,116,0.18)` | `var(--color-warning)` | #D4A574 warm amber |
| `paid` | `rgba(122,155,118,0.15)` | `var(--color-success)` | #7A9B76 muted green |
| `is_patina_catalog` | `rgba(196,165,123,0.15)` | `var(--color-clay)` | clay tint |

These do not use Tailwind utility classes because they are brand-specific RGBA values with no Tailwind token equivalent. Inline styles are the established pattern in this codebase (see FFE Kanban cards and Pipeline items).

### D.8 Files Builder 3 Touches

1. `packages/types/src/ffe.ts` — create with `FFEStageKey` type + `FFE_STAGE_KEYS` const
2. `packages/types/src/index.ts` — add `export * from './ffe';`
3. `apps/designer-portal/src/app/(portal)/portal/procurement/by-status/page.tsx` — implement (replaces Builder 1's scaffold)
4. `apps/designer-portal/src/components/portal/payment-pill.tsx` — create `PaymentPill` + `PatinaHandledPill`

Builder 3 should **coordinate with Builder 2** on `PaymentPill` — if both are building in parallel, Builder 2 should either (a) inline the pill logic temporarily and swap to the shared import when Builder 3 merges, or (b) Builder 3 creates `payment-pill.tsx` first and Builder 2 imports from it. The preferred approach is (b): Builder 3 ships `payment-pill.tsx` as part of their PR, Builder 2 imports it. If they are truly parallel, Builder 2 duplicates the pill inline and Builder 3 removes the duplication at merge. Note this in PR descriptions.

---

## §E · Open Questions

No open questions requiring action before Builders start. All ambiguities are resolved:

1. **Nav insertion point** — confirmed between Pipeline and Products (matching PRD "Today / Pipeline / Procurement / Products / Clients").
2. **Zone root = By Vendor** — `/portal/procurement` renders By Vendor view (no redirect or index page needed). This matches how Pipeline zone root at `/portal/pipeline` is the Pipeline list view.
3. **No zone-level layout.tsx needed** — confirmed by inspecting all existing zones. The portal layout already handles all wrapping.
4. **`STAGES` lift strategy** — confirmed: lift only the key list into `@patina/types` as `FFEStageKey` + `FFE_STAGE_KEYS`; keep color/surfaceKey mappings per-view.
5. **"By Status" primary axis** — confirmed: groups by `purchase_order.status` (6 columns: draft/confirmed/in_production/shipped/delivered/cancelled), not by FFE item status.
6. **Mobile tab bar** — must be updated manually (hardcoded; does not read from `ZONES`). Covered in §B.6.
7. **`messages` key in `deepPatterns`** — inspection shows `detectDeepPage` uses `deepPatterns[zoneKey]?.some(...)` with the `?.` optional chaining. The `messages` key is absent from `deepPatterns` without error because of the `?? false` fallback. Adding `procurement: []` is still correct for type safety.

---

## §F · Verification Commands

### Builder 1 (Nav + Route Scaffold)

```bash
# After applying all changes in §B:

# 1. TypeScript — confirms ZoneKey union + Record exhaustiveness
pnpm --filter @patina/designer-portal type-check

# 2. Lint
pnpm --filter @patina/designer-portal lint

# 3. Dev smoke — launch designer portal and verify:
#    a. "Procurement" appears in the top nav between Pipeline and Products
#    b. Clicking it shows the zone active state (clay underline on TopBar)
#    c. Sub-nav shows: By Vendor · By Status · Calendar · Receiving
#    d. "By Vendor" is underlined when at /portal/procurement
#    e. Calendar and Receiving pages render placeholders without error
#    f. Mobile: 6-tab bar includes Procurement tab
pnpm dev:designer

# 4. Tests (no new test files required; existing tests must still pass)
pnpm --filter @patina/designer-portal test
```

### Builder 2 (By Vendor View + Vendor Card)

```bash
# After implementing procurement/page.tsx and vendor-po-card.tsx:

# 1. TypeScript
pnpm --filter @patina/designer-portal type-check

# 2. Lint
pnpm --filter @patina/designer-portal lint

# 3. Dev smoke — launch designer portal with Supabase running:
#    a. Navigate to /portal/procurement
#    b. Confirm vendor cards render with seeded data (Nordic Atelier, Woodward & Sons, etc.)
#    c. Confirm orange border on cards with due payments
#    d. Confirm payment pills render: "Deposit · Paid" (green), "Balance · Due [date]" (amber)
#    e. Confirm "Patina handled" pill for is_patina_catalog POs (PO 5 in seed)
#    f. Confirm search filters cards by vendor name
#    g. Confirm empty state renders when no data
pnpm dev:designer

# 4. Unit test (create __tests__/vendor-po-card.test.tsx):
#    - snapshot or RTL render test with mock PurchaseOrder data
#    - test hasDuePayment flag drives border color
#    - test payment pill renders correct state labels
pnpm --filter @patina/designer-portal test
```

### Builder 3 (By Status View + Payment Pill)

```bash
# After implementing packages/types/src/ffe.ts, by-status/page.tsx, and payment-pill.tsx:

# 1. TypeScript — confirms FFEStageKey export and payment-pill prop types
pnpm --filter @patina/types type-check
pnpm --filter @patina/designer-portal type-check

# 2. Lint
pnpm --filter @patina/types lint
pnpm --filter @patina/designer-portal lint

# 3. Tests for @patina/types (add packages/types/src/__tests__/ffe.test.ts):
#    - FFE_STAGE_KEYS has 8 elements in correct order
#    - Each key is a valid FFEStageKey
pnpm --filter @patina/types test

# 4. Tests for payment-pill (create __tests__/payment-pill.test.tsx):
#    - pending state renders pearl tint + "Pending" label
#    - due state renders amber tint + "Due" label + date
#    - paid state renders green tint + "Paid" label
#    - PatinaHandledPill renders clay tint
pnpm --filter @patina/designer-portal test

# 5. Dev smoke:
#    a. Navigate to /portal/procurement/by-status
#    b. Confirm 6 columns: Draft · Confirmed · In Production · Shipped · Delivered · Cancelled
#    c. Confirm seeded POs appear in correct columns:
#       - PO1 Nordic / in_production → "In Production" column
#       - PO4 Apparatus / net_30 shipped → "Shipped" column
#       - PO7 Woodward / delivered → "Delivered" column
#    d. Confirm payment pills render state correctly per seed data
#    e. Confirm "By Status" sub-nav link is underlined at this route
pnpm dev:designer

# 6. Full suite after all 3 builders merge:
pnpm type-check
pnpm lint
pnpm test
```

---

## Key Files Reference

All file paths are absolute from the repo root `/Users/kody/Code/patina-merged`:

**Read-reference (do not modify):**
- `/Users/kody/Code/patina-merged/apps/designer-portal/src/config/navigation.ts` — zone + sub-nav definitions
- `/Users/kody/Code/patina-merged/apps/designer-portal/src/hooks/use-active-zone.ts` — zone detection logic
- `/Users/kody/Code/patina-merged/apps/designer-portal/src/hooks/use-nav-counts.ts` — sub-nav count badges
- `/Users/kody/Code/patina-merged/apps/designer-portal/src/components/portal/top-bar.tsx` — TopBar renders ZONES
- `/Users/kody/Code/patina-merged/apps/designer-portal/src/components/portal/sub-nav.tsx` — SubNav renders sub-items + counts
- `/Users/kody/Code/patina-merged/apps/designer-portal/src/components/portal/mobile-tab-bar.tsx` — mobile nav (hardcoded)
- `/Users/kody/Code/patina-merged/apps/designer-portal/src/app/(portal)/portal/layout.tsx` — portal layout wrapper
- `/Users/kody/Code/patina-merged/apps/designer-portal/src/app/(portal)/portal/pipeline/page.tsx` — single-hook page pattern
- `/Users/kody/Code/patina-merged/apps/designer-portal/src/app/(portal)/portal/projects/[id]/ffe/page.tsx` — STAGES const + Kanban pattern
- `/Users/kody/Code/patina-merged/packages/supabase/src/hooks/use-procurement.ts` — all 7 procurement hooks
- `/Users/kody/Code/patina-merged/apps/designer-portal/src/lib/react-query.ts` — QueryClient config (suspense: false)
- `/Users/kody/Code/patina-merged/apps/designer-portal/src/app/globals.css` — CSS token definitions
- `/Users/kody/Code/patina-merged/apps/designer-portal/tailwind.config.ts` — Tailwind config with patina-* colors
- `/Users/kody/Code/patina-merged/packages/patina-design-system/src/components/Badge/Badge.tsx` — Badge component spec

**Create (new files):**
- `apps/designer-portal/src/app/(portal)/portal/procurement/page.tsx`
- `apps/designer-portal/src/app/(portal)/portal/procurement/by-status/page.tsx`
- `apps/designer-portal/src/app/(portal)/portal/procurement/calendar/page.tsx`
- `apps/designer-portal/src/app/(portal)/portal/procurement/receiving/page.tsx`
- `apps/designer-portal/src/components/portal/vendor-po-card.tsx`
- `apps/designer-portal/src/components/portal/payment-pill.tsx`
- `packages/types/src/ffe.ts`

**Modify (existing files):**
- `apps/designer-portal/src/config/navigation.ts`
- `apps/designer-portal/src/hooks/use-active-zone.ts`
- `apps/designer-portal/src/hooks/use-nav-counts.ts`
- `apps/designer-portal/src/components/portal/mobile-tab-bar.tsx`
- `packages/types/src/index.ts`
