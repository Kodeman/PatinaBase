# Patina Three-Layer Product Catalog — Engineering Handoff

**Document Type:** Implementation Source of Truth
**Status:** Approved for Build · v1.0
**Last Updated:** April 2026
**Owner:** Kody (Technical Lead) · Leah (Design Authority)
**Audience:** Claude Code · Engineering Team · Future Contributors
**Companion Documents:** Three-Layer Product Catalog Presentation (`patina-three-layer-product-catalog.html`), Promotion Modals Deep Design (`patina-promotion-modals-deep-design.html`), Procurement Workspace v1, Help & Guidance System Handoff
**Implementation Target:** Strata monorepo · `apps/designer-portal`, `apps/manufacturer-portal`, `packages/products`

---

## 0. How to Use This Document

This document is the single source of truth for the Patina Three-Layer Product Catalog. It defines **what to build**, **how to build it**, **where it lives**, and **how the layers interact with the rest of the system**. Treat it as a contract between design intent and implementation.

When Claude Code is asked to implement any catalog or promotion feature in Patina, this document governs. When in conflict with older docs, this document wins. When this document is silent, escalate to Kody before improvising.

The document is organized by progressive depth: foundational concepts first, then architecture, then components, then operational concerns. Read top-to-bottom for context; jump to a specific section for reference.

### Document conventions

- **MUST / SHOULD / MAY** language follows RFC 2119 — MUST is non-negotiable, SHOULD has documented exceptions, MAY is discretionary.
- **Code blocks** are illustrative TypeScript/SQL in the Strata monorepo's existing patterns. Final implementations may differ for performance or library reasons; semantics must not.
- **`@strata/*`** package references use the existing monorepo namespacing.
- **Layer references** use the canonical names: Personal Library, Studio Library, Patina Catalog.

---

## 1. System Mission & Non-Negotiables

### 1.1 Mission

Restructure the existing single-catalog Products zone into a three-layer architecture (Personal Library → Studio Library → Patina Catalog) that respects how designers actually source, keeps capture trivially fast, and lets the marketplace grow out of proven relationships.

### 1.2 Non-negotiables

These are hard constraints. No implementation may violate them.

1. **Capture stays a 5-second target.** Any change that adds friction to the capture moment (Chrome extension, mobile photo, URL paste) is a regression and must be rejected.
2. **The system never auto-promotes items between layers.** Promotion is always an explicit human choice. The system may surface candidates; it never executes the action.
3. **Layer visibility is enforced by the database, not the application.** Row-Level Security (RLS) policies on the products table are the authoritative source of who can see what. Application code MUST NOT replicate layer-filtering logic.
4. **One products table, one layer column.** No layer-specific tables. No data duplication on promotion. Layer transitions are UPDATE operations, not INSERT operations.
5. **Item IDs are stable across layer transitions.** A promoted item retains its ID so that all downstream references (project FF&E, procurement POs, Aesthete training data, capture history) continue to work without migration.
6. **Promotion is reversible within 7 days, with friction after.** Casual undo for recent promotions; explicit confirmation with consequence warning for older ones; blocked entirely while item is in active project use.
7. **The Strata Mark is the layer indicator.** Every visual layer signifier in the UI uses a miniature Strata Mark variant (1 line for Personal, 2 for Studio, 3 for Catalog). No alternative iconography for layer identity.
8. **Personal Library items never train the public Aesthete Engine.** Privacy boundary. Personal captures train only that designer's personal style vector; nothing exposes to other designers or the consumer engine.
9. **Accessibility is a feature, not a checklist.** Every catalog surface and modal MUST meet WCAG AA, support keyboard navigation, work with screen readers, and respect `prefers-reduced-motion`.

---

## 2. The Three Layers (Implementation Definition)

Each layer has a strict definition for code purposes. This is the contract Claude Code implements against.

### Layer 1 · Personal Library (`layer = 'personal'`)

- **Visibility:** Only the owning user. Enforced by RLS: `owner_user_id = auth.uid()`.
- **Required fields at creation:** name, image_url OR source_url (at least one), owner_user_id.
- **Optional fields:** everything else. No taxonomy enforcement. No quality bar.
- **Procurement path:** External vendor. Order Assistant flow.
- **Aesthete contribution:** Personal style vector only. Never exposed beyond the user.
- **Default destination on capture.** All captures land here unless explicitly slotted into a project room.

### Layer 2 · Studio Library (`layer = 'studio'`)

- **Visibility:** All members of the owning studio. Enforced by RLS: `studio_id = current_studio_id()`.
- **Required fields at promotion:** vendor_contact, verified_lead_time, payment_terms_id, category, usage_notes (all of which were optional in Personal).
- **Procurement path:** External vendor, with stored vendor context flowing into Order Assistant pre-fills.
- **Aesthete contribution:** Studio collective style profile. Used for studio-wide recommendations.
- **Created via:** Promotion from Personal Library only. Cannot be created directly.

### Layer 3 · Patina Catalog (`layer = 'catalog'`)

- **Visibility:** All authenticated Patina users.
- **Required fields:** Full Patina catalog schema (style_tags, material_tags, aesthete_vector, commission_rate, all dimensions). Patina-side admin enforces.
- **Procurement path:** Patina is the merchant. One-click ordering. Commission tracked.
- **Aesthete contribution:** Primary engine training source. Powers consumer recommendations.
- **Created via:** Manufacturer onboarding (via Manufacturer Portal) OR nomination from Studio Library that completes the manufacturer onboarding workflow.

---

## 3. The Five Principles (Implementation Test)

Every PR that touches the catalog system MUST satisfy all five. Reviewers should literally check each one in the PR description.

| # | Principle | The Test |
|---|-----------|----------|
| 1 | **Capture stays free** | Does this change add any required field, validation, or step to the capture flow? If yes, reject. |
| 2 | **Pre-populate aggressively** | When asking for input, are we showing what we know first and asking for confirmation? Or asking from scratch? |
| 3 | **Layer transitions are deliberate** | Does this code auto-move items between layers? If yes, reject — promotion is always human-initiated. |
| 4 | **Privacy is layered** | Does this expose Personal Library data outside the owner, or Studio data outside the studio? If yes, reject. |
| 5 | **The system is undoable** | If a user takes an action and regrets it within 7 days, can they reverse it without contacting support? |

A new feature that fails any of these five SHOULD be rejected at design review, before code is written.

---

## 4. Data Model (Authoritative)

The implementation is simpler than the conceptual model suggests. One products table, one new column. Everything else is convention.

### 4.1 Products table (extended)

```sql
CREATE TABLE products (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  image_url         text,
  source_url        text,
  price_cents       integer,
  vendor_id         uuid REFERENCES vendors(id),
  dimensions        jsonb,
  lead_time_weeks   integer,

  -- The three-layer system
  layer             text NOT NULL DEFAULT 'personal'
                    CHECK (layer IN ('personal', 'studio', 'catalog')),
  owner_user_id     uuid REFERENCES users(id),    -- required when layer = 'personal'
  studio_id         uuid REFERENCES studios(id),  -- required when layer IN ('studio', 'catalog')

  -- Promotion tracking
  promoted_from_id  uuid REFERENCES products(id), -- nullable, references prior version if applicable
  promoted_at       timestamptz,
  promoted_by       uuid REFERENCES users(id),

  -- Layer 2+ fields (validated on promotion to studio)
  vendor_contact    jsonb,                          -- { name, email, phone }
  payment_terms_id  uuid REFERENCES vendor_payment_terms(id),
  category          text,
  subcategory       text,
  usage_notes       text,

  -- Layer 3 fields (Patina-managed)
  style_tags        text[],
  material_tags     text[],
  aesthete_vector   vector(1536),
  commission_rate   numeric(4,2),
  patina_managed    boolean DEFAULT false,

  -- Audit
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now(),

  -- Constraint: layer-specific required fields
  CONSTRAINT personal_requires_owner
    CHECK (layer != 'personal' OR owner_user_id IS NOT NULL),
  CONSTRAINT studio_requires_metadata
    CHECK (layer != 'studio' OR (
      studio_id IS NOT NULL AND
      vendor_contact IS NOT NULL AND
      lead_time_weeks IS NOT NULL AND
      payment_terms_id IS NOT NULL AND
      category IS NOT NULL AND
      usage_notes IS NOT NULL
    )),
  CONSTRAINT catalog_requires_management
    CHECK (layer != 'catalog' OR patina_managed = true)
);

CREATE INDEX idx_products_layer ON products(layer);
CREATE INDEX idx_products_owner ON products(owner_user_id) WHERE layer = 'personal';
CREATE INDEX idx_products_studio ON products(studio_id) WHERE layer IN ('studio', 'catalog');
CREATE INDEX idx_products_vendor ON products(vendor_id);
CREATE INDEX idx_products_aesthete ON products USING ivfflat (aesthete_vector vector_cosine_ops);
```

### 4.2 Row-Level Security (RLS) policies

RLS is non-negotiable. Application code MUST NOT filter by layer manually. The database is the authority.

```sql
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Personal: only owner can see/modify
CREATE POLICY products_personal_select ON products
  FOR SELECT USING (
    layer = 'personal' AND owner_user_id = auth.uid()
  );

CREATE POLICY products_personal_modify ON products
  FOR ALL USING (
    layer = 'personal' AND owner_user_id = auth.uid()
  );

-- Studio: all members of the studio can see; edit per studio member permissions
CREATE POLICY products_studio_select ON products
  FOR SELECT USING (
    layer = 'studio' AND studio_id IN (
      SELECT studio_id FROM studio_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY products_studio_modify ON products
  FOR UPDATE USING (
    layer = 'studio' AND studio_id IN (
      SELECT studio_id FROM studio_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'designer', 'editor')
    )
  );

-- Catalog: all authenticated users can see; only Patina admins can modify
CREATE POLICY products_catalog_select ON products
  FOR SELECT USING (
    layer = 'catalog' AND auth.role() = 'authenticated'
  );

CREATE POLICY products_catalog_modify ON products
  FOR ALL USING (
    layer = 'catalog' AND auth.jwt() ->> 'role' = 'patina_admin'
  );
```

### 4.3 Supporting tables

#### `studios`

Already exists. No changes needed.

#### `studio_members`

Already exists or being added with the layered model. Schema:

```sql
CREATE TABLE studio_members (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id   uuid NOT NULL REFERENCES studios(id),
  user_id     uuid NOT NULL REFERENCES users(id),
  role        text NOT NULL CHECK (role IN ('owner', 'designer', 'editor', 'viewer')),
  created_at  timestamptz DEFAULT now(),
  UNIQUE (studio_id, user_id)
);
```

#### `vendors` (extended)

Add fields needed for Studio Library promotion:

```sql
ALTER TABLE vendors ADD COLUMN preferred_contact jsonb; -- { name, email, phone }
ALTER TABLE vendors ADD COLUMN trade_account_established_at date;
ALTER TABLE vendors ADD COLUMN default_payment_terms_id uuid REFERENCES vendor_payment_terms(id);
ALTER TABLE vendors ADD COLUMN nomination_status text
  CHECK (nomination_status IN ('none', 'submitted', 'under_review', 'contacted', 'onboarding', 'live', 'declined'));
ALTER TABLE vendors ADD COLUMN nominated_by uuid REFERENCES users(id);
ALTER TABLE vendors ADD COLUMN nominated_at timestamptz;
```

#### `promotion_audit_log`

New table. Records every layer transition for auditability and undo.

```sql
CREATE TABLE promotion_audit_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      uuid NOT NULL REFERENCES products(id),
  from_layer      text NOT NULL,
  to_layer        text NOT NULL,
  actor_user_id   uuid REFERENCES users(id),
  action_type     text NOT NULL CHECK (action_type IN ('promote', 'demote', 'merge', 'undo')),
  merged_into_id  uuid REFERENCES products(id), -- nullable, set when merging into existing item
  field_snapshot  jsonb, -- snapshot of fields at time of transition (for undo)
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_promotion_audit_product ON promotion_audit_log(product_id);
CREATE INDEX idx_promotion_audit_recent ON promotion_audit_log(created_at DESC);
```

#### `vendor_nominations`

New table. Tracks the Studio → Catalog nomination workflow.

```sql
CREATE TABLE vendor_nominations (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id               uuid NOT NULL REFERENCES vendors(id),
  studio_id               uuid NOT NULL REFERENCES studios(id),
  nominated_by_user_id    uuid NOT NULL REFERENCES users(id),

  -- The nomination content
  manufacturer_contact    jsonb NOT NULL, -- { name, email }
  recommendation_note     text NOT NULL,
  fit_signals             text[], -- ['multi_designer_use', 'designer_demand', 'aesthetic_fit', 'vendor_interest']

  -- State machine
  status                  text NOT NULL DEFAULT 'submitted'
                          CHECK (status IN ('submitted', 'under_review', 'contacted', 'onboarding', 'live', 'declined')),
  status_updated_at       timestamptz DEFAULT now(),
  status_updated_by       uuid REFERENCES users(id),

  -- State-specific data
  patina_outreach_sent_at timestamptz,
  patina_outreach_summary text,
  manufacturer_responded_at timestamptz,
  decline_reason          text,
  catalog_live_at         timestamptz,

  -- Renomination tracking
  previous_nomination_id  uuid REFERENCES vendor_nominations(id),

  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now()
);

CREATE INDEX idx_nominations_vendor ON vendor_nominations(vendor_id);
CREATE INDEX idx_nominations_status ON vendor_nominations(status);
CREATE INDEX idx_nominations_studio ON vendor_nominations(studio_id);
```

### 4.4 Why a single table with a layer column

This pattern was chosen deliberately. Alternative approaches and their tradeoffs were considered:

- **Separate tables per layer**: would require triple JOIN for cross-layer search, complicates promotion (INSERT + DELETE rather than UPDATE), breaks downstream references on promotion, requires triple maintenance of constraints. Rejected.
- **Polymorphic association**: adds complexity without benefit — the layers share 90% of the same fields.
- **Visibility table separate from products**: separates two concerns that should stay coupled, and complicates RLS.

The single-table approach is correct because:

- Cross-layer search is one query with one filter
- Promotion is an UPDATE — IDs stay stable, references hold
- RLS policies handle visibility cleanly
- Constraints enforce layer-specific required fields at the database level
- Index strategy maps cleanly to access patterns

---

## 5. Component Architecture

All components live in `@strata/products` package. Existing primitives from `@strata/ui` and `@strata/help-system` are reused where applicable.

### 5.1 Layer indicator components

#### `<LayerIcon />`

The miniature Strata Mark used to identify layers visually throughout the UI.

```typescript
interface LayerIconProps {
  layer: 'personal' | 'studio' | 'catalog';
  size?: 'sm' | 'md' | 'lg'; // default 'sm'
  color?: string; // defaults: personal=DustyBlue, studio=Sage, catalog=Clay
}
```

**Visual spec:**

- Personal (Layer 1): 1 line, full width, currentColor at 60% opacity
- Studio (Layer 2): 2 lines, first full width, second 75% width, opacities 90% and 60%
- Catalog (Layer 3): 3 lines (the full Strata Mark), opacities 100%, 60%, 30%
- Sizes: sm (14×10px), md (18×13px), lg (24×17px)

**Implementation:** Inline SVG or styled div stack. Must respect color prop and support theming.

#### `<LayerChip />`

Text + LayerIcon combination used in compact contexts (product cards, item headers).

```typescript
interface LayerChipProps {
  layer: 'personal' | 'studio' | 'catalog';
  showLabel?: boolean; // default true
  size?: 'sm' | 'md'; // default sm
}
```

**Visual spec:**

- Background: Personal `rgba(139,156,173,0.12)`, Studio `rgba(168,181,160,0.12)`, Catalog `rgba(196,165,123,0.15)`
- Foreground: Personal `--db` (Dusty Blue), Studio `--sa` (Sage), Catalog `--cl` (Clay)
- Font: DM Mono, 0.48rem, uppercase, letter-spacing 0.04em, font-weight 600
- Padding: 2px 7px, border-radius 2px

### 5.2 Catalog browsing components

#### `<ProductsZone />`

The shell component for the Products section. Renders the layer tab navigation and routes to the active layer view.

```typescript
interface ProductsZoneProps {
  defaultLayer?: 'personal' | 'studio' | 'catalog'; // default 'personal'
}
```

**Behavior:**

- MUST render three tabs in order: Personal, Studio, Catalog
- MUST default to Personal on initial load (most-used layer)
- MUST persist last-selected layer to user preferences (returns to wherever the user was)
- MUST display item count per tab (live count from RLS-filtered queries)
- MUST render the cross-layer search input at top-right

#### `<LayerView />`

The per-layer browse view. Composes filters, sort controls, and product grid.

```typescript
interface LayerViewProps {
  layer: 'personal' | 'studio' | 'catalog';
}
```

Each layer's view has slightly different defaults:

- **Personal:** sort by recent, view = grid, filters = source (web/photo/url), project tag, status
- **Studio:** sort by most-used, view = By Vendor (alternative By Category), filters = category
- **Catalog:** sort by Aesthete match, view = grid, tabs = Browse / For your active projects / From Founding Circle / Teach the Engine

#### `<ProductCard />`

Reusable card for displaying a product in grid views.

```typescript
interface ProductCardProps {
  product: Product;
  showLayer?: boolean; // default true
  showProjectTags?: boolean; // default true for Personal, false for others
  showUsageCount?: boolean; // default true for Studio, false for others
  showAestheteMatch?: boolean; // default true for Catalog, false for others
  onClick?: (product: Product) => void;
}
```

**Visual spec:**

- Aspect ratio 1:1 for image
- LayerChip absolute-positioned top-right with `background: rgba(250,247,242,0.9)` overlay for legibility
- Optional secondary chip bottom-left (project tag, usage count, match score)
- Below image: name (Inter 500, 0.68rem), vendor (Inter 400, 0.58rem, muted), price (Playfair 500, 0.72rem)

### 5.3 Capture components

#### `<CaptureExtension />`

The Chrome extension's main UI. Lives in a separate build target but uses the same `@strata/products` components.

```typescript
interface CaptureExtensionProps {
  pageData: {
    url: string;
    title: string;
    image: string;
    detectedPrice?: string;
    detectedVendor?: string;
    detectedLeadTime?: string;
  };
}
```

**Required behavior:**

- MUST detect product image (JSON-LD → OpenGraph → first large image)
- MUST detect title (JSON-LD → h1 → page title minus site suffix)
- MUST detect price (Schema.org Price → common DOM patterns → trade price if visible)
- MUST resolve vendor by domain → existing vendor record if Leah has worked with this vendor before
- MUST present "Save to" destination dropdown (default: Personal Library)
- MUST present optional "Tag to project" sub-dropdown
- MUST save within 1 second of confirm click
- MUST NOT block on network — queue offline if needed

#### `<MobileCapture />`

Mobile web capture flow for photo + voice notes.

```typescript
interface MobileCaptureProps {
  mode: 'photo' | 'url-paste' | 'manual';
}
```

**Behavior:**

- Photo mode: opens native camera via `<input type="file" capture="environment">`, supports voice-to-text notes
- URL paste mode: text field that triggers same scraping as extension
- Manual mode: empty form for items without web presence

#### `<DestinationPicker />`

The destination dropdown used across all capture surfaces. Single source of truth for "where does this go?"

```typescript
interface DestinationPickerProps {
  value: { type: 'personal' | 'project-room'; projectId?: string; roomId?: string };
  onChange: (value: DestinationPickerProps['value']) => void;
  recentProjects?: Project[]; // top 3 most-recently-active
}
```

### 5.4 Promotion modal components

These are the modals fully specified in the Promotion Modals Deep Design document. Implementation contracts below.

#### `<PromoteToStudioModal />`

Single-item promotion modal for My Library → Studio Library.

```typescript
interface PromoteToStudioModalProps {
  productId: string;
  open: boolean;
  onClose: () => void;
  onSuccess?: (promotedProduct: Product) => void;
  duplicateDetection?: 'on' | 'off'; // default 'on'
}
```

**Required behavior:**

- MUST fetch product + vendor + order history on open
- MUST pre-populate all inferrable fields (vendor contact, lead time avg, payment terms, category)
- MUST visually mark pre-filled fields with PrefilledChip + Sage tint
- MUST always require usage_notes field (cannot be inferred)
- MUST validate all Layer 2 required fields before submit (database constraint also enforces)
- MUST display duplicate detection banner if a similar item exists in Studio Library (same vendor + similar name >70% match)
- MUST complete in under 60 seconds for a typical pre-filled case
- MUST trigger `<PromotionToast />` on success
- MUST close modal on Escape

#### `<BulkPromoteToStudioModal />`

Multi-item bulk promotion modal.

```typescript
interface BulkPromoteToStudioModalProps {
  productIds: string[];
  open: boolean;
  onClose: () => void;
  onSuccess?: (promotedProducts: Product[], skippedProducts: Product[]) => void;
}
```

**Required behavior:**

- MUST classify each product as "ready" or "needs-info" based on whether all Layer 2 required fields can be inferred
- MUST render in two visual lanes: Ready (Sage section header) and Needs Info (Golden Hour section header)
- MUST support inline expansion of needs-info rows for required-field input
- MUST allow per-row checkbox toggle (default: all ready items checked, all needs-info items unchecked)
- MUST include a "Skip the N that need info" button as a first-class action
- MUST handle already-promoted items by showing them with "Already in Studio" badge, unselected
- MUST handle duplicate detection for each item independently
- MUST submit promoted items as a single atomic transaction; report partial failures clearly

#### `<NominateToCatalogModal />`

Vendor nomination modal for Studio Library → Patina Catalog.

```typescript
interface NominateToCatalogModalProps {
  vendorId: string;
  open: boolean;
  onClose: () => void;
  onSuccess?: (nomination: VendorNomination) => void;
}
```

**Required behavior:**

- MUST display VendorContextBlock with usage stats (item count, project count, lifetime value, damage claims)
- MUST pre-populate manufacturer contact from vendor record
- MUST require recommendation_note (the designer's voice)
- MUST display fit-signals checkboxes (optional, helps Patina prioritize)
- MUST be accessible only to users with `studio_member.role = 'owner'`
- MUST check for prior nominations on the same vendor; if a declined nomination exists from less than 6 months ago, display the prior context
- MUST transition to post-submit timeline state on submit (not a separate modal)
- MUST create `vendor_nominations` record and update `vendors.nomination_status` atomically

#### `<NominationPostSubmitModal />`

The post-submit state of the nomination modal showing the timeline.

```typescript
interface NominationPostSubmitModalProps {
  nominationId: string;
  open: boolean;
  onClose: () => void;
}
```

**Required behavior:**

- MUST display 5-step timeline with current state highlighted
- MUST show nomination ID for reference
- MUST link to vendor record where ongoing status is tracked
- MUST NOT auto-close — Leah closes when ready

### 5.5 Status and feedback components

#### `<PromotionBanner />`

The "ready for Studio Library" suggestion banner.

```typescript
interface PromotionBannerProps {
  candidateCount: number;
  onReview: () => void;
  onDismiss?: () => void;
}
```

**Required behavior:**

- MUST only render when candidate count >= 1
- MUST be dismissible per-session (not per-user-permanent)
- MUST link to candidate review (filtered My Library view + bulk promotion)
- MUST never render as a popup or modal — inline at top of My Library only

#### `<PromotionToast />`

The success toast after promotion.

```typescript
interface PromotionToastProps {
  count: number;
  layer: 'studio' | 'catalog';
  viewUrl: string;
}
```

**Behavior:**

- Bottom-right placement, 280-320px width
- Includes mini Strata Mark in target layer color
- Auto-dismisses after 5 seconds; click-to-dismiss available
- View link navigates to target layer filtered to recently-promoted
- MUST respect prefers-reduced-motion (no slide-in animation when set)

#### `<NominationStatusBanner />`

The persistent status band on vendor records during nomination.

```typescript
interface NominationStatusBannerProps {
  nomination: VendorNomination;
  showTimeline?: boolean; // default false; true expands inline timeline
}
```

**Visual variants by status:**

- `submitted` / `under_review`: Golden Hour border + tint
- `contacted`: Dusty Blue border + tint
- `onboarding`: Golden Hour border + tint
- `live`: Sage border + tint
- `declined`: Terracotta border + tint

#### `<VendorContextBlock />`

The Clay-tinted vendor summary at the top of the nomination modal.

```typescript
interface VendorContextBlockProps {
  vendor: Vendor;
  studioStats: {
    studioItemCount: number;
    projectsUsedCount: number;
    lifetimeOrderValueCents: number;
    damageClaimCount: number;
  };
  signalStrength: 'weak' | 'moderate' | 'strong';
}
```

**Required behavior:**

- MUST compute signal strength: strong = 10+ items AND 5+ projects AND 0 unresolved damage, moderate = 5+ items, weak = otherwise
- MUST display all four stats in a 4-column grid below the header
- MUST format lifetime value as compact dollars ($47K, $1.2M)

### 5.6 Form primitives extended

These extend existing `@strata/help-system` field components with a pre-filled state:

#### `<PrefilledInput />`

Variant of standard text input with visual pre-fill indication.

```typescript
interface PrefilledInputProps extends InputProps {
  prefilled?: boolean;
  prefilledFrom?: string; // e.g., 'vendor record', '3 orders', 'auto-detected'
}
```

**Visual spec when prefilled:**

- Background: `rgba(168,181,160,0.05)` (5% Sage)
- Border: `rgba(168,181,160,0.3)` (30% Sage)
- All other styling matches standard input

#### `<PrefilledChip />`

Small badge attached to field labels indicating pre-fill source.

```typescript
interface PrefilledChipProps {
  source: string; // 'Pre-filled from vendor record', 'From 3 orders', etc.
}
```

---

## 6. Promotion Logic (Authoritative)

### 6.1 Candidate eligibility (Personal → Studio)

A Personal Library item is a "candidate" for Studio promotion when ALL of the following are true:

```typescript
function isPromotionCandidate(product: Product): boolean {
  return (
    product.layer === 'personal' &&
    // Used in at least 2 projects
    countProjectsUsingProduct(product.id) >= 2 &&
    // Ordered at least once without unresolved damage
    hasSuccessfulOrderHistory(product.id) &&
    // Vendor record exists (created at capture or later)
    product.vendor_id !== null
  );
}
```

The PromotionBanner counts candidates and surfaces them when count >= 1. Counting MUST be efficient — index `idx_products_layer` and a materialized view if needed at scale.

### 6.2 Pre-population sources

When the Promote-to-Studio modal opens, fields are populated in priority order:

| Field | Source 1 | Source 2 | Source 3 |
|-------|----------|----------|----------|
| vendor_contact | `vendors.preferred_contact` | Email captured at order time | Empty (user must fill) |
| verified_lead_time | Average of past 3 order actual lead times | Vendor's quoted lead time | `product.lead_time_weeks` |
| payment_terms_id | `vendors.default_payment_terms_id` | Most recent PO's payment terms | Empty (user must select) |
| category | Auto-detected from product name + vendor category history | Vendor's most-common category | Empty (user must select) |
| usage_notes | Empty — always user-filled | — | — |

### 6.3 Promotion mutation

The promotion operation is implemented as a single database transaction:

```typescript
async function promoteToStudio({
  productId,
  studioId,
  promotedBy,
  fields: Layer2Fields,
  mergeIntoId?: string,
}): Promise<Product> {
  return db.transaction(async (tx) => {
    if (mergeIntoId) {
      // Merging into existing Studio Library item
      // Copy usage history, mark original as merged, return existing item
      await tx.update(products)
        .set({ merged_into_id: mergeIntoId, deleted_at: new Date() })
        .where(eq(products.id, productId));

      await tx.insert(promotion_audit_log).values({
        product_id: productId,
        from_layer: 'personal',
        to_layer: 'studio',
        actor_user_id: promotedBy,
        action_type: 'merge',
        merged_into_id: mergeIntoId,
      });

      return await tx.select().from(products).where(eq(products.id, mergeIntoId)).then(rows => rows[0]);
    }

    // Standard promotion
    const original = await tx.select().from(products).where(eq(products.id, productId)).then(rows => rows[0]);

    const updated = await tx.update(products)
      .set({
        layer: 'studio',
        studio_id: studioId,
        owner_user_id: null, // Personal-only field
        ...fields,
        promoted_at: new Date(),
        promoted_by: promotedBy,
      })
      .where(eq(products.id, productId))
      .returning();

    await tx.insert(promotion_audit_log).values({
      product_id: productId,
      from_layer: 'personal',
      to_layer: 'studio',
      actor_user_id: promotedBy,
      action_type: 'promote',
      field_snapshot: original, // for undo
    });

    return updated[0];
  });
}
```

### 6.4 Bulk promotion

Bulk promotion calls `promoteToStudio` per item but wraps the entire batch in a single transaction so partial failures don't leave the system in a mixed state. If any item fails its constraints, the entire batch rolls back with a clear error indicating which item caused failure.

Implementation should also support a `continueOnError` mode for the bulk modal's "skip needs-info items" path — in that case, each successfully-promoted item commits independently and failures are reported back without rollback.

### 6.5 Demotion (Studio → Personal)

Demotion is the reverse operation, with constraints:

```typescript
async function demoteToPersonal(productId: string, demotedBy: string): Promise<Product> {
  const product = await getProduct(productId);

  // Cannot demote items currently in active projects
  const activeProjectUsage = await getActiveProjectUsage(productId);
  if (activeProjectUsage.length > 0) {
    throw new Error('Cannot demote: item is in active use on ' + activeProjectUsage.map(p => p.name).join(', '));
  }

  // Within 7 days: silent undo
  const promotedAt = product.promoted_at;
  const within7Days = promotedAt && Date.now() - promotedAt.getTime() < 7 * 24 * 60 * 60 * 1000;

  if (!within7Days) {
    // Must have explicit confirmation passed; service layer assumes this is checked at the UI
  }

  return db.transaction(async (tx) => {
    const original = await tx.select().from(products).where(eq(products.id, productId)).then(rows => rows[0]);

    const demoted = await tx.update(products)
      .set({
        layer: 'personal',
        owner_user_id: demotedBy, // demoter becomes owner
        studio_id: null,
        // Clear Layer 2 fields
        vendor_contact: null,
        payment_terms_id: null,
        category: null,
        subcategory: null,
        usage_notes: null,
        promoted_at: null,
        promoted_by: null,
      })
      .where(eq(products.id, productId))
      .returning();

    await tx.insert(promotion_audit_log).values({
      product_id: productId,
      from_layer: 'studio',
      to_layer: 'personal',
      actor_user_id: demotedBy,
      action_type: within7Days ? 'undo' : 'demote',
      field_snapshot: original,
    });

    return demoted[0];
  });
}
```

### 6.6 Nomination state machine (Studio → Catalog)

Unlike Studio promotion which is instant, Catalog nomination is a stateful workflow with 6 states:

```
submitted → under_review → contacted → onboarding → live
                                     ↓
                                  declined
```

State transitions are server-driven; the designer-facing UI reflects state but does not control it (except `submitted` which is set on nomination creation). Patina ops team controls transitions through an internal admin tool.

Each transition fires:

1. Database update of `vendor_nominations.status` + `vendors.nomination_status`
2. Notification to nominating studio (in-app + email)
3. UI refresh of NominationStatusBanner on relevant vendor record
4. (Where applicable) email to manufacturer or other party

### 6.7 Renomination

Renomination of a previously-declined vendor:

- MUST surface the previous decline context (date, reason) when modal opens
- MUST link new nomination to prior via `previous_nomination_id`
- MUST require Leah to add a new note explaining what changed
- Allows Patina review team to see both nominations side-by-side

No cooling-off period is enforced in code — Leah's judgment decides. But the modal SHOULD encourage waiting 6+ months for vendors that explicitly declined, by displaying the time elapsed since previous decline.

---

## 7. Integration with Other Systems

### 7.1 Procurement Workspace

The three-layer system's most significant integration. When an item is added to a project and approved, it enters the Procurement Workspace. The layer determines the procurement path.

| Source Layer | Procurement Path | Order Mechanism |
|--------------|------------------|-----------------|
| Personal | External vendor | Order Assistant — manual PO logging, payment terms entered at confirmation |
| Studio | External vendor with context | Order Assistant — pre-filled vendor contact, payment terms, shipping defaults |
| Catalog | Patina-handled | One-click order — Patina invoices, deposit/balance flow through Patina |

**Implementation contract:**

The Procurement Workspace MUST read the `products.layer` field and route accordingly. The Order Assistant component takes a `layer` prop and renders appropriate UI. Catalog items render the one-click order button; Personal and Studio items render the manual confirmation flow with pre-fill density varying by layer.

### 7.2 Aesthete Engine

Items contribute to engine training based on layer:

| Layer | Training Contribution |
|-------|----------------------|
| Personal | Designer's personal style vector only. Never exposed. |
| Studio | Studio collective style profile. Used for studio-wide recommendations. |
| Catalog | Public engine training. Powers consumer recommendations. |

**Implementation contract:**

The aesthete training pipeline reads from products with a layer filter. The pipeline runs separately for each layer:

- `train_personal_vector(user_id)` — runs nightly per user, reads only that user's personal items
- `train_studio_profile(studio_id)` — runs nightly per studio, reads studio items
- `train_public_engine()` — runs nightly globally, reads only catalog items

Personal vectors are stored on the user record and never join any cross-user query. RLS-level enforcement.

### 7.3 Project FF&E

When an item is added to a project's FF&E schedule, the `project_ffe_items` table references `products.id`. This reference is stable across layer transitions — promoting an item from Personal to Studio does not break existing project references.

**Implementation contract:**

`project_ffe_items.product_id` references `products.id` with no layer constraint. Visibility of the item within the project context is governed by the product's layer + the project's access controls — Leah always sees her own items in her own projects, even if those items are Personal.

### 7.4 Capture pipeline

The Chrome extension, mobile capture, and URL paste all funnel into the same `createProduct` mutation with `layer: 'personal'` set:

```typescript
async function captureProduct(input: {
  name: string;
  image_url?: string;
  source_url: string;
  detected_price_cents?: number;
  detected_vendor?: string;
  destination: { type: 'personal' | 'project-room'; projectId?: string; roomId?: string };
  capture_source: 'chrome_extension' | 'mobile_photo' | 'url_paste' | 'manual';
}): Promise<Product> {
  const vendor = await resolveVendor(input.detected_vendor); // creates if new

  const product = await db.insert(products).values({
    name: input.name,
    image_url: input.image_url,
    source_url: input.source_url,
    price_cents: input.detected_price_cents,
    vendor_id: vendor.id,
    layer: 'personal',
    owner_user_id: auth.userId,
  }).returning();

  if (input.destination.type === 'project-room') {
    await addToProjectRoom(product.id, input.destination.projectId, input.destination.roomId);
  }

  await trackEvent('product.captured', {
    productId: product.id,
    source: input.capture_source,
    destination: input.destination.type,
    captureTimeMs: input.captureTimeMs,
  });

  return product;
}
```

### 7.5 Manufacturer Portal handoff

When a nomination reaches the `onboarding` state, the Manufacturer Portal takes over. The handoff:

1. Patina ops team creates a manufacturer account (or invites the manufacturer to claim one)
2. Manufacturer onboarding flow runs in Manufacturer Portal
3. As manufacturer adds products, those products are created with `layer: 'catalog'` and tagged with the originating `nomination_id`
4. Once at least 1 product is published, nomination state transitions to `live`
5. Studio Library items from the same vendor get linked to the new Catalog products via a `catalog_equivalent_id` field

The Manufacturer Portal is a separate `apps/manufacturer-portal` workspace. Cross-app communication happens through shared database and event bus.

---

## 8. UX Specifications (Reference to Companion Docs)

The full visual and interaction design for both promotion modals lives in the **Promotion Modals Deep Design** document (`patina-promotion-modals-deep-design.html`). This handoff defers to that document for:

- Exact modal layouts and visual hierarchy
- Field order and grouping
- Copy and microcopy
- Animation and motion details
- Edge case visual treatments

This handoff covers what those visual specs translate to in code.

---

## 9. Edge Cases and Their Defined Behavior

These match the edge cases enumerated in the Promotion Modals Deep Design. Each MUST be implemented per spec.

| Case | Behavior |
|------|----------|
| Duplicate item in Studio Library | Show duplicate detection banner; offer merge / keep separate / cancel |
| Multi-designer race on vendor creation | Second submit detects race, merges into vendor created by first |
| Bulk includes already-promoted items | Show with "Already in Studio" badge, unselected, not re-promotable from this flow |
| Demotion within 7 days | Silent undo, no confirmation modal |
| Demotion after 7 days | Explicit confirmation modal with consequence warning |
| Demotion of in-use item | Blocked entirely with clear error explaining why |
| New item from vendor not yet in Studio | Modal expands to include "About [Vendor]" mini-form to create vendor record |
| Vendor with open nomination + new Studio promotion | Promotion succeeds normally, items get included when manufacturer onboards |
| Renomination after decline | Allowed, surfaces prior decline context, requires new note |
| Studio owner leaves during nomination | Ownership transfers to new owner; both names preserved in history |

---

## 10. Analytics Taxonomy

All analytics events go to PostHog (self-hosted). Dashboards built for product team review.

### 10.1 Capture events

```typescript
'product.captured'                    // { source, destination, captureTimeMs, vendorIsNew }
'capture.extension.opened'            // { domain }
'capture.extension.cancelled'         // { domain, openMs }
'capture.mobile_photo.taken'          // { hadNotes }
'capture.url_paste.attempted'         // { domain, scrapeSuccess }
'capture.manual.created'              // {}
```

### 10.2 Browse and search events

```typescript
'products.layer.viewed'               // { layer, filter, sort }
'products.search.performed'           // { query, layersSearched, resultCounts }
'products.search.result_clicked'      // { query, productId, layer, position }
'products.item.opened'                // { productId, layer, from }
```

### 10.3 Promotion events

```typescript
'promote.banner.shown'                // { candidateCount }
'promote.banner.reviewed'             // { candidateCount }
'promote.banner.dismissed'            // { candidateCount }
'promote.modal.opened'                // { source: 'banner'|'item'|'bulk', itemCount, layer: 'studio'|'catalog' }
'promote.modal.submitted'             // { itemCount, completionTimeMs, prefillEditedFields }
'promote.modal.cancelled'             // { atStep, openMs }
'promote.duplicate_detected'          // { itemId, similarItemId, resolution: 'merge'|'keep'|'cancel' }
'promote.completed'                   // { productId, fromLayer, toLayer }
'promote.undone'                      // { productId, hoursAfterPromotion }
'promote.demoted'                     // { productId, hoursAfterPromotion, explicitConfirmation }
```

### 10.4 Nomination events

```typescript
'nominate.modal.opened'               // { vendorId, signalStrength }
'nominate.modal.submitted'            // { vendorId, fitSignalsCount, hasNote }
'nominate.modal.cancelled'            // { vendorId, atStep }
'nominate.status_changed'             // { nominationId, fromStatus, toStatus }
'nominate.timeline.viewed'            // { nominationId, currentStatus }
'nominate.renominated'                // { vendorId, monthsSincePriorDecline }
```

### 10.5 Required dashboards

1. **Capture Health** — captures per day per designer, capture time distribution, source breakdown
2. **Layer Distribution** — items per layer over time, growth rate per layer
3. **Promotion Funnel** — banner shown → reviewed → submitted → completed
4. **Promotion Modal Health** — completion rate, time-to-complete, pre-fill edit rate
5. **Nomination Pipeline** — nominations by status, time-in-status, accept/decline rate
6. **Cross-Layer Search Effectiveness** — which layer results get clicked, search-to-result-click rate

---

## 11. Accessibility Requirements

The catalog system MUST meet WCAG 2.1 Level AA. Specific requirements:

### 11.1 Keyboard navigation

- All layer tabs reachable via Tab; arrow keys switch tabs
- Product cards keyboard-focusable; Enter opens detail
- Modals: focus traps with Escape to close
- Bulk modal: arrow keys navigate between rows; Space toggles checkbox

### 11.2 Screen reader support

- Layer tabs use `role="tablist"`, `role="tab"`, `role="tabpanel"` correctly
- LayerIcon includes `aria-label` with layer name
- ProductCard announces layer + name + price in logical order
- Modals use `role="dialog"`, `aria-modal="true"`, accessible names
- Promotion timeline uses `<ol>` with proper step semantics
- Pre-filled fields announce their pre-fill status: "Vendor contact, pre-filled from vendor record, trade@nordicatelier.com"

### 11.3 Reduced motion

- Modal open/close animations disable when `prefers-reduced-motion: reduce`
- Toast slide-in becomes instant fade
- Timeline state transitions become instant

### 11.4 Color contrast

- LayerChip text on background meets 4.5:1 minimum
- Layer indicators MUST also include text label, never color alone
- Required field markers (Terracotta asterisk) always paired with text "required"

---

## 12. QA Acceptance Criteria

### 12.1 Unit tests

- LayerIcon renders correctly for each layer
- ProductCard renders with correct chips per layer
- DestinationPicker defaults to Personal Library
- Promotion mutation enforces required field validation
- Demotion mutation blocks when item is in active project
- RLS policies prevent cross-layer/cross-studio reads

### 12.2 Integration tests

- Promote-to-Studio modal: open → fill → submit → verify item in Studio Library
- Bulk Promote: 10 items, 6 ready 4 needs-info → submit 6 → verify state
- Nominate modal: submit → verify vendor_nominations row + status banner appears
- Capture from extension → product created with layer='personal'
- Add Catalog item to project → procurement workspace shows one-click order
- Add Studio item to project → procurement workspace shows Order Assistant with pre-fill

### 12.3 RLS verification tests

CRITICAL. Each MUST pass:

- User A creates Personal item. User B (different account) cannot SELECT it.
- User A (studio member of Studio X) can SELECT Studio X items. User B (different studio) cannot.
- Any authenticated user can SELECT Catalog items.
- Only `studio_member.role IN ('owner', 'designer', 'editor')` can UPDATE Studio items.
- Only `patina_admin` role can UPDATE Catalog items.

### 12.4 Manual QA checklist (per release)

```
[ ] Capture from Chrome extension completes in under 5 seconds
[ ] Capture from mobile photo completes the full flow without keyboard
[ ] Promotion modal pre-fills all expected fields with correct Sage tinting
[ ] Bulk promotion correctly splits Ready vs Needs Info lanes
[ ] Promotion toast appears bottom-right and dismisses after 5s
[ ] 7-day undo restores item to Personal Library cleanly
[ ] Demotion of in-use item shows blocking error
[ ] Nomination modal accessible only to studio owners
[ ] Nomination status banner updates as states transition
[ ] Renomination flow displays prior decline context
[ ] Cross-layer search returns results from all 3 layers
[ ] Layer chip + LayerIcon both render correctly in all 3 variants
[ ] All modals close on Escape
[ ] Keyboard navigation works through layer tabs
[ ] Screen reader announces layer information correctly
[ ] Reduced motion preference disables modal animations
```

---

## 13. Operational Procedures

### 13.1 Adding a new field to Layer 2 requirements

If a new required field is added for Studio Library items:

1. Update the `products` table CHECK constraint
2. Add the field to `PromoteToStudioModal` and `BulkPromoteToStudioModal` with appropriate pre-population logic
3. Update existing Studio items with default values or run a backfill migration
4. Update the candidate eligibility check if the new field affects readiness
5. Document the new field in this handoff

### 13.2 Tuning candidate eligibility

The `isPromotionCandidate` logic determines which Personal items trigger the promotion banner. Tuning:

- **Too many candidates surfaced**: banner appears constantly, users dismiss reflexively. Tighten thresholds (more projects, longer order history).
- **Too few candidates surfaced**: users never see banner, manual promotion only. Loosen thresholds.
- Default thresholds (2+ projects, 1+ successful order) are calibrated for Leah's volume. Multi-designer studios may need different thresholds.

Thresholds SHOULD be configurable per studio in `studio_settings.promotion_thresholds` jsonb column.

### 13.3 Handling nomination state transitions

Patina ops team updates `vendor_nominations.status` via the internal admin tool. The state transition machinery:

1. Reject invalid transitions (e.g., `live` → `submitted`)
2. Fire notifications based on the new state
3. Update `vendors.nomination_status` denormalized field
4. If transitioning to `live`: trigger Studio→Catalog item linking job
5. If transitioning to `declined`: surface decline_reason to nominator

### 13.4 Migration from existing single-catalog system

Existing Patina catalog data must be migrated to the new layered structure:

1. All existing products get `layer = 'catalog'` and `patina_managed = true`
2. Existing designer "saved" items become `layer = 'personal'` with `owner_user_id` set
3. Pre-existing "studio shared" items (if any concept exists) get `layer = 'studio'` with `studio_id` set
4. Run validation that all rows pass new CHECK constraints
5. Apply RLS policies in maintenance window

Migration script in `migrations/2026-04-three-layer-catalog.sql`.

### 13.5 Handling studio owner departure

When a studio owner leaves:

1. Studio admin assigns new owner before departure (preferred)
2. If no transition: ownership of pending nominations transfers to the studio's most-recent active designer
3. `vendor_nominations.nominated_by_user_id` is preserved (historical record)
4. New owner is set in `vendor_nominations.current_owner_user_id` (new column)
5. Patina ops team notified to update outreach copy if necessary

---

## 14. Implementation Roadmap (Build Order for Claude Code)

This is the canonical build order. Claude Code may parallelize tasks where dependencies allow but MUST NOT skip steps.

### Sprint 1 (Weeks 1–4) · Foundation + My Library

| # | Task | Output |
|---|------|--------|
| 1.1 | Schema migration: add layer column + constraints + indexes | Migration applied, products table extended |
| 1.2 | RLS policies for all three layers | Policies in place, RLS tests passing |
| 1.3 | Migrate existing products to appropriate layers | Backfill complete, all rows pass constraints |
| 1.4 | Build LayerIcon and LayerChip components | Storybook stories + tests |
| 1.5 | Build ProductsZone shell with tab navigation | Three tabs render, item counts live |
| 1.6 | Build LayerView for Personal Library | Filters, sort, grid, infinite scroll |
| 1.7 | Build ProductCard component with layer-aware variants | All 3 layer variants render correctly |
| 1.8 | Build DestinationPicker | Default to Personal, project-room sub-select |
| 1.9 | Chrome extension v2 with DestinationPicker integration | Capture in under 5s, destination dropdown works |
| 1.10 | Mobile photo + URL paste capture flows | Both flows complete with same DestinationPicker |
| 1.11 | Capture analytics events wired | PostHog events firing correctly |
| 1.12 | Cross-layer search infrastructure | Single query, three-layer result grouping |

### Sprint 2 (Weeks 5–8) · Studio Library + Promotions

| # | Task | Output |
|---|------|--------|
| 2.1 | Build LayerView for Studio Library | By Vendor + By Category views, vendor stats table |
| 2.2 | Implement isPromotionCandidate logic + materialized view | Banner triggers correctly |
| 2.3 | Build PromotionBanner component | Renders only when candidates exist, session-dismissible |
| 2.4 | Build PromoteToStudioModal (single item) | Pre-population working, validation, submit |
| 2.5 | Build PrefilledInput + PrefilledChip components | Sage tinting, chip indicators |
| 2.6 | Build BulkPromoteToStudioModal with two-lane split | Inline expansion, skip action, atomic submit |
| 2.7 | Build PromotionToast with Strata Mark | Bottom-right placement, auto-dismiss |
| 2.8 | Implement promotion mutation (transaction-wrapped) | Promotion completes, audit log written |
| 2.9 | Implement 7-day undo | Silent undo within window, explicit after |
| 2.10 | Build duplicate detection (single + bulk) | Merge / keep / cancel options |
| 2.11 | Implement demotion logic with in-use blocking | Demotion respects active project constraint |
| 2.12 | Promotion analytics events wired | All promote.* events firing |
| 2.13 | Multi-designer race condition handling | Tested with concurrent submits |
| 2.14 | Procurement integration: Order Assistant respects layer | Studio items pre-fill vendor context |
| 2.15 | Aesthete integration: studio collective profile training | Nightly job processes studio items |

### Sprint 3 (Weeks 9–12) · Patina Catalog + Nomination

| # | Task | Output |
|---|------|--------|
| 3.1 | Build LayerView for Patina Catalog | Tabs (Browse / For projects / Founding Circle / Teach), Aesthete sorting |
| 3.2 | Surface Aesthete match scores on Catalog ProductCards | Match % displayed on cards |
| 3.3 | Build VendorContextBlock component | 4-stat grid, signal strength computation |
| 3.4 | Build NominateToCatalogModal | Vendor-focused layout, fit signals checklist |
| 3.5 | Build NominationPostSubmitModal with timeline | 5-step timeline, doesn't auto-close |
| 3.6 | Build NominationStatusBanner (5 visual variants) | All states render correctly on vendor record |
| 3.7 | Create vendor_nominations table + state machine | Transitions enforced server-side |
| 3.8 | Build Patina admin tool for state transitions | Internal-only UI, role-restricted |
| 3.9 | Manufacturer outreach email template + send flow | Email goes when state moves to 'contacted' |
| 3.10 | Renomination flow with prior context display | Decline context shown, new note required |
| 3.11 | Studio→Catalog item linking (when nomination goes live) | catalog_equivalent_id populated |
| 3.12 | Nomination analytics events wired | All nominate.* events firing |
| 3.13 | One-click Catalog ordering integration in Procurement | Catalog items route through Patina billing |
| 3.14 | Pilot launch with Leah + 2 designers | Real usage data collected |

---

## 15. Decision Log

Material decisions and their rationale. New entries appended over time.

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04 | Single products table with layer column rather than separate tables per layer | Promotion stays as UPDATE not INSERT, IDs stable, downstream references hold, RLS handles visibility cleanly |
| 2026-04 | Required Layer 2 fields enforced by database CHECK constraint, not just application code | Database is authority. Bug-resistant by construction. |
| 2026-04 | 7-day silent undo window for promotions | Long enough that buyer's remorse can be undone without bureaucracy, short enough that the studio doesn't accumulate items in confusing states |
| 2026-04 | Patina Catalog nomination is vendor-scoped, not item-scoped | Catalog admission is about the maker relationship, not a single item. One nomination per vendor, all their items flow in when accepted. |
| 2026-04 | Personal Library items never train public Aesthete Engine | Privacy boundary. Designers must trust that private captures stay private — even from ML training. |
| 2026-04 | Pre-filled fields use Sage tint, not Clay | Sage signals "trustworthy automation" without competing with Clay's primary-action role. Reviewers should not confuse pre-fill with required action. |
| 2026-04 | Skip is a first-class action in bulk promotion | Forcing complete batches teaches users not to start the bulk flow. Easier-to-abandon = easier-to-start. |
| 2026-04 | Nomination state machine is Patina-controlled, not designer-controlled | Designer initiates and observes; Patina ops drives transitions because most depend on manufacturer responses Patina has direct contact with. |
| 2026-04 | Demotion of in-use items is blocked entirely | Removing an item mid-project would corrupt project history. Forces "wait until project closes" which is the right behavior. |

---

## 16. Open Questions

Intentionally unresolved. Claude Code should NOT silently resolve — escalate to Kody.

1. **Multi-designer Studio Library permissions matrix.** v1 ships with role-based edit permissions (owner/designer/editor/viewer). Are there scenarios where item-level permissions matter (one designer's items not editable by others)? Defer until first multi-designer studio onboards.
2. **Bulk promotion limit.** Should we cap bulk promote at N items per submit? Performance suggests yes (atomic transaction overhead), UX suggests "rare case, don't constrain." Recommend: soft cap of 50 items with warning, hard cap of 200.
3. **Cross-studio item visibility.** Could two studios willingly share their Studio Libraries? (Collaboration scenario.) Out of scope for v1; would require new visibility primitive.
4. **Catalog item designer attribution.** When a Studio nomination becomes a Catalog item, should the designer's name appear publicly as "originally nominated by"? Brand-level decision pending.
5. **Manufacturer view of nominations.** Do manufacturers see which designers nominated them when they accept onboarding? Privacy question with marketing implications.
6. **Items that fail catalog quality bar mid-onboarding.** What happens to the Studio Library items when Patina passes on a vendor mid-onboarding (e.g., quality issues surface during catalog photo review)? Currently no defined path.

---

## 17. Glossary

| Term | Meaning |
|------|---------|
| **Layer** | One of the three product visibility tiers: Personal, Studio, or Catalog. |
| **Personal Library** | `layer = 'personal'`. Private to the owning user. |
| **Studio Library** | `layer = 'studio'`. Shared within the owning studio. |
| **Patina Catalog** | `layer = 'catalog'`. Public to all Patina users. |
| **Promotion** | Layer transition from Personal → Studio. Always explicit. |
| **Demotion** | Layer transition from Studio → Personal. Constrained. |
| **Nomination** | Designer-initiated request to bring a vendor's items into Patina Catalog. Triggers Patina-side workflow. |
| **Pre-filled** | A field whose value is inferred from existing data and presented for confirmation. |
| **Candidate** | A Personal Library item meeting promotion eligibility criteria. |
| **Studio member** | A user with a row in `studio_members` for a given studio, with a role determining permissions. |
| **Vendor record** | The `vendors` table entry representing a maker. One per company. Person-level contacts are nested. |
| **Order Assistant** | The Procurement Workspace component that helps Leah place external vendor orders. |

---

## 18. Sign-Off

| Role | Name | Signed | Date |
|------|------|--------|------|
| Technical Lead | Kody | _____ | _____ |
| Design Authority | Leah | _____ | _____ |

This document supersedes any prior catalog documentation. Changes require updates to this document first, then implementation.

---

*Document version 1.0 — April 2026. Living document — review quarterly. File this in the Patina-docs spine at `/handoffs/three-layer-product-catalog.md`.*
