# Product & Vendor Capture Specification

> **Module:** Chrome Extension Capture System
> **Version:** 2.0
> **Status:** Active
> **Started:** 2026-01
> **Completed:** —

---

## 1. Executive Summary

This spec extends the Patina Chrome extension to capture **both products and vendors** during designer browsing sessions. The current extension captures products but ignores vendor relationships—this upgrade creates a seamless flow where:

1. Products are automatically linked to vendors (existing or new)
2. Vendors can be created inline during product capture
3. A dedicated vendor-only capture mode exists for About/Contact pages
4. Trade pricing is surfaced when the designer has an account

### Design Principles

| Principle | Implementation |
|-----------|----------------|
| **Speed first** | Capture should take <10 seconds for known vendors |
| **Smart defaults** | Auto-detect vendor from URL, pre-fill everything possible |
| **Progressive disclosure** | Show minimal fields, expand for power users |
| **Never block** | If vendor detection fails, allow capture anyway |

---

## 2. Capture Modes

### 2.1 Product Capture (Default)

Triggered from product pages. Captures product + links to vendor.

```
┌─────────────────────────────────────────┐
│ [Patina Logo]              [×] Close    │
├─────────────────────────────────────────┤
│ ┌─────────────────────────────────────┐ │
│ │         [Product Image]             │ │
│ │         ○ ○ ● ○ ○ (thumbnails)      │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ Product Name ________________________   │
│                                         │
│ ┌─ Manufacturer ──────────────────────┐ │
│ │ [Logo] Herman Miller     ✓ Matched  │ │
│ │ Premium · MTO · ⭐ 4.8 (312)         │ │
│ │                        [Change ▾]   │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ ┌─ Retailer ──────────────────────────┐ │
│ │ [Logo] Design Within Reach          │ │
│ │ [Your Trade: Designer 20%]          │ │
│ │                        [Change ▾]   │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ $1,299.00 retail                        │
│ $1,039.20 your price (DWR 20%)  [●●●○○]│
│                                         │
│ Project: [Select project ▾]             │
│ ☑ Also save to personal catalog         │
│                                         │
│ Note: _________________________________ │
│                                         │
│ Styles: [Modern] [Minimalist] [+ Add]   │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │      [Save to Catalog]              │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

**Compact Mode (when manufacturer = retailer, e.g., direct brand site):**

```
┌─ Vendor ──────────────────────────────┐
│ [Logo] West Elm (Direct)   ✓ Matched  │
│ Premium · Stock+MTO · ⭐ 4.2 (127)     │
│ [Your Trade: Designer 20%]            │
└───────────────────────────────────────┘
```

### 2.2 Vendor-Only Capture

Triggered from vendor About/Contact pages. Creates or enriches vendor record.

```
┌─────────────────────────────────────────┐
│ [Patina Logo]   VENDOR MODE   [×] Close │
├─────────────────────────────────────────┤
│ ┌─────────────────────────────────────┐ │
│ │ [Vendor Logo - extracted or upload] │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ Vendor Name: ________________________   │
│ Website: ____________________________   │
│                                         │
│ ┌─ Classification ────────────────────┐ │
│ │ Position: [Entry|Mid|Premium|Luxury]│ │
│ │ Model:    [Stock|MTO|Custom|Mixed]  │ │
│ │ Category: [Seating ▾]               │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ ┌─ Contact (optional) ────────────────┐ │
│ │ Trade Email: ______________________ │ │
│ │ Trade Phone: ______________________ │ │
│ │ Rep Name:    ______________________ │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ ┌─ Details (optional) ────────────────┐ │
│ │ Founded: [    ] HQ: [City, State]   │ │
│ │ Ownership: [Family|Private|PE|Pub]  │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ Notes: ________________________________ │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ ☆ [Save Vendor]  or  ★ [Save+Fav]   │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

### 2.3 New Vendor Inline (During Product Capture)

When auto-detection fails or finds no match, expand inline vendor form:

```
┌─ New Vendor ──────────────────────────┐
│ ⚠ Vendor not recognized               │
│                                        │
│ Name: [Auto-filled from page] ______  │
│ Website: [Current domain] ___________  │
│                                        │
│ Position: (●) Entry  ( ) Mid           │
│           ( ) Premium ( ) Luxury       │
│                                        │
│ Category: [Furniture ▾]                │
│                                        │
│ [Create & Link]  or  [Skip Vendor]     │
└────────────────────────────────────────┘
```

---

## 3. Vendor Detection Flow

### 3.1 Detection Pipeline

```
Page Load
    │
    ▼
┌─────────────────────────────────────┐
│ 1. Extract domain from URL          │
│    wayfair.com → "wayfair"          │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│ 2. Check known retailer mapping     │
│    (60+ vendors in metadata.ts)     │
│    Match? → Return vendor name      │
└─────────────────────────────────────┘
    │ No match
    ▼
┌─────────────────────────────────────┐
│ 3. Extract from page metadata       │
│    - JSON-LD brand/manufacturer     │
│    - OG site_name                   │
│    - Copyright footer               │
│    - About page links               │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│ 4. Query Supabase vendors table     │
│    - Exact name match               │
│    - Fuzzy match (similarity > 0.8) │
│    - Domain match (website field)   │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│ 5. Return result                    │
│    - MATCHED: existing vendor       │
│    - SUGGESTED: possible matches    │
│    - NEW: no match, show form       │
└─────────────────────────────────────┘
```

### 3.2 Detection Confidence Levels

| Level | Criteria | UI Treatment |
|-------|----------|--------------|
| **Exact** | Domain in known retailers OR exact DB match | Auto-select, show ✓ badge |
| **High** | Fuzzy name match > 0.9 OR website domain match | Auto-select, show "Confirm?" |
| **Medium** | Fuzzy name match 0.7-0.9 | Show suggestions dropdown |
| **Low** | No match found | Show "New Vendor" inline form |

---

## 4. Manufacturer vs Retailer Model

A critical distinction for the furniture industry:

| Role | Definition | Example | Database Field |
|------|------------|---------|----------------|
| **Manufacturer** | Who makes the product | Herman Miller, Knoll | `products.vendor_id` → vendors table |
| **Retailer** | Where designer buys it | Design Within Reach, Wayfair | `products.retailer_id` → vendors table (NEW) |

### 4.1 Why Both Matter

- **Trade accounts** are with retailers (DWR gives you 20% off)
- **Manufacturer** determines quality, warranty, style consistency
- **Price** varies by retailer for same manufacturer's product
- **Lead times** differ by retailer fulfillment model

### 4.2 Detection Priority

```
1. Retailer = Current domain (where designer is browsing)
   wayfair.com → Wayfair is the retailer

2. Manufacturer = Extracted from product data
   JSON-LD brand, "by Herman Miller", product title parsing
```

### 4.3 Database Change Required

```sql
ALTER TABLE products
ADD COLUMN retailer_id UUID REFERENCES vendors(id);

-- vendor_id = manufacturer
-- retailer_id = where purchased
```

---

## 5. Vendor Extraction Module

New extraction module: `src/lib/extraction/vendor.ts`

### 5.1 Extracted Fields

```typescript
interface ExtractedVendorData {
  name: string | null
  website: string              // Always available (current domain)
  logoUrl: string | null       // From favicon, OG image, or page
  contactEmail: string | null  // From mailto: links, contact page
  contactPhone: string | null  // From tel: links, footer
  socialLinks: {
    instagram?: string
    pinterest?: string
    facebook?: string
  }
  foundedYear: number | null   // From "Est. 1985" patterns
  headquarters: string | null  // From "Based in NYC" patterns
  aboutSnippet: string | null  // First 200 chars of About text
  confidence: 'high' | 'medium' | 'low'
}

interface ExtractedProductVendors {
  retailer: {
    name: string
    website: string
    matched?: VendorSummary    // If found in DB
  }
  manufacturer: {
    name: string | null
    matched?: VendorSummary    // If found in DB
  } | null
}
```

### 5.2 Extraction Strategies

| Field | Strategy |
|-------|----------|
| **retailer** | Current domain, known retailer mapping |
| **manufacturer** | JSON-LD brand, "by [Brand]" pattern, product title parsing |
| **name** | JSON-LD Organization, OG site_name, copyright text, domain titlecase |
| **logoUrl** | apple-touch-icon, OG image, favicon (prioritized by size) |
| **contactEmail** | mailto: links, "contact@", "trade@", "sales@" patterns |
| **contactPhone** | tel: links, phone regex in footer/contact sections |
| **socialLinks** | href patterns for instagram.com, pinterest.com, facebook.com |
| **foundedYear** | "Est. YYYY", "Since YYYY", "Founded YYYY" regex |
| **headquarters** | "Based in", "Headquartered in", address patterns |

---

## 6. Trade Pricing Integration

### 5.1 Flow

```
Product Captured
    │
    ▼
Vendor Matched/Created
    │
    ▼
┌─────────────────────────────────────┐
│ Query designer_vendor_accounts      │
│ WHERE designer_id = current_user    │
│   AND vendor_id = matched_vendor    │
└─────────────────────────────────────┘
    │
    ├─── No account → Show retail only
    │
    └─── Has account
            │
            ▼
        ┌─────────────────────────────┐
        │ Fetch current tier discount │
        │ Calculate trade price       │
        │ Display both prices         │
        └─────────────────────────────┘
```

### 5.2 Price Display States

**No Trade Account:**
```
$1,299.00
[No trade account with West Elm — Apply for trade access →]
```

**Has Trade Account:**
```
$1,299.00 retail
$1,039.20 your price (Designer 20%)
```

**Trade Account Pending:**
```
$1,299.00 retail
[Trade application pending — typically 3-5 days]
```

---

## 7. Data Persistence

### 7.1 Product Save Flow

```typescript
async function saveProductWithVendors(
  product: ExtractedProductData,
  manufacturers: VendorSelection,
  retailer: VendorSelection,
  options: SaveOptions
) {
  // 1. Resolve manufacturer (who makes it)
  let vendorId: string | null = null
  if (manufacturer.type === 'existing') {
    vendorId = manufacturer.id
  } else if (manufacturer.type === 'new') {
    const { data } = await supabase
      .from('vendors')
      .insert(manufacturer.data)
      .select('id')
      .single()
    vendorId = data.id
  }

  // 2. Resolve retailer (where to buy)
  let retailerId: string | null = null
  if (retailer.type === 'existing') {
    retailerId = retailer.id
  } else if (retailer.type === 'new') {
    const { data } = await supabase
      .from('vendors')
      .insert(retailer.data)
      .select('id')
      .single()
    retailerId = data.id
  }

  // 3. Save product with both links
  const { data: productData } = await supabase
    .from('products')
    .insert({
      name: product.productName,
      source_url: product.url,
      images: product.images.slice(0, 10).map(i => i.url),
      price_retail: product.price?.value,
      materials: product.materials,
      dimensions: product.dimensions,
      vendor_id: vendorId,      // ← Manufacturer
      retailer_id: retailerId,  // ← Where purchased (NEW)
      captured_by: user.id,
      captured_at: new Date().toISOString()
    })
    .select('id')
    .single()

  // 3. Add to project if selected
  if (options.projectId) {
    await supabase
      .from('project_products')
      .insert({
        project_id: options.projectId,
        product_id: productData.id,
        notes: options.note
      })
  }

  // 4. Add style assignments
  if (options.styleIds?.length) {
    await supabase
      .from('product_styles')
      .insert(options.styleIds.map(styleId => ({
        product_id: productData.id,
        style_id: styleId,
        confidence: 1.0,
        source: 'manual'
      })))
  }
}
```

### 6.2 Vendor Save Flow (Vendor-Only Mode)

```typescript
async function saveVendor(vendor: ExtractedVendorData, options: VendorSaveOptions) {
  const { data } = await supabase
    .from('vendors')
    .insert({
      name: vendor.name,
      website: vendor.website,
      logo_url: vendor.logoUrl,
      market_position: options.marketPosition,
      production_model: options.productionModel,
      primary_category: options.primaryCategory,
      contact_info: {
        email: vendor.contactEmail,
        phone: vendor.contactPhone
      },
      founded_year: vendor.foundedYear,
      headquarters_city: options.headquartersCity,
      headquarters_state: options.headquartersState,
      notes: options.notes
    })
    .select()
    .single()

  // Optionally save to favorites
  if (options.saveToFavorites) {
    await supabase
      .from('saved_vendors')
      .insert({
        designer_id: user.id,
        vendor_id: data.id
      })
  }

  return data
}
```

---

## 8. UI Components

### 7.1 New Components Needed

| Component | Purpose | Location |
|-----------|---------|----------|
| `VendorCard.tsx` | Display matched/selected vendor with metadata | `src/components/` |
| `VendorSelector.tsx` | Dropdown for changing vendor selection | `src/components/` |
| `VendorInlineForm.tsx` | Compact form for creating new vendor | `src/components/` |
| `TradePricing.tsx` | Display retail + trade price with tier info | `src/components/` |
| `ModeToggle.tsx` | Switch between Product/Vendor capture modes | `src/components/` |

### 7.2 Component Props

```typescript
// VendorCard
interface VendorCardProps {
  vendor: VendorSummary
  matchConfidence: 'exact' | 'high' | 'medium'
  tradeAccount?: TradeAccount | null
  onChangeClick: () => void
}

// VendorSelector
interface VendorSelectorProps {
  selectedVendor: VendorSummary | null
  suggestions: VendorSummary[]
  onSelect: (vendor: VendorSummary) => void
  onCreateNew: () => void
}

// VendorInlineForm
interface VendorInlineFormProps {
  initialData: Partial<ExtractedVendorData>
  onSubmit: (vendor: VendorCreateInput) => void
  onSkip: () => void
}

// TradePricing
interface TradePricingProps {
  retailPrice: number       // in cents
  tradeAccount?: TradeAccount | null
  vendor: VendorSummary
}
```

---

## 9. Mode Detection Heuristics

### 8.1 Auto-Detect Capture Mode

The extension should auto-detect whether the current page is:
- **Product page** → Default to Product Capture
- **Vendor page** → Default to Vendor Capture
- **Ambiguous** → Show mode toggle

```typescript
function detectPageMode(): 'product' | 'vendor' | 'ambiguous' {
  const signals = {
    hasProductSchema: !!document.querySelector('[itemtype*="Product"]'),
    hasAddToCart: !!document.querySelector('[class*="add-to-cart"], [id*="add-to-cart"]'),
    hasPrice: !!document.querySelector('[class*="price"], [itemprop="price"]'),
    isAboutPage: /\/(about|company|our-story|contact)/i.test(location.pathname),
    hasOrganizationSchema: !!document.querySelector('[itemtype*="Organization"]'),
  }

  const productScore =
    (signals.hasProductSchema ? 3 : 0) +
    (signals.hasAddToCart ? 2 : 0) +
    (signals.hasPrice ? 2 : 0)

  const vendorScore =
    (signals.isAboutPage ? 3 : 0) +
    (signals.hasOrganizationSchema ? 2 : 0)

  if (productScore >= 4) return 'product'
  if (vendorScore >= 3) return 'vendor'
  return 'ambiguous'
}
```

---

## 10. Offline & Queue Behavior

### 9.1 Queue Structure Update

```typescript
interface QueuedCapture {
  id: string
  type: 'product' | 'vendor'
  data: ExtractedProductData | ExtractedVendorData
  vendor?: {
    type: 'existing' | 'new' | 'skip'
    id?: string           // For existing
    data?: VendorCreateInput  // For new
  }
  options: SaveOptions
  attempts: number
  lastAttempt: string
  createdAt: string
}
```

### 9.2 Sync Priority

1. **Vendors first** - New vendors must be created before products that reference them
2. **Products second** - Link to vendor IDs after vendor sync completes
3. **Relationships last** - Project assignments, style tags, favorites

---

## 11. Error States

| Scenario | Handling |
|----------|----------|
| Vendor detection fails | Show inline form, allow skip |
| Duplicate vendor name | Prompt: "Similar vendor exists. Link to existing or create new?" |
| Trade account fetch fails | Show retail only, log error |
| Vendor create fails | Save product without vendor link, queue vendor for retry |
| No images found | Allow save anyway with placeholder |

---

## 12. Success Metrics

| Metric | Target |
|--------|--------|
| Products with vendor link | > 80% of captures |
| Vendor detection accuracy | > 90% for known retailers |
| Capture completion time | < 10s for matched vendors |
| Trade pricing display rate | 100% when account exists |
| New vendor creation rate | < 20% of captures |

---

## 13. Implementation Phases

### Phase 1: Vendor Detection & Linking (MVP)
- [ ] Create `vendor.ts` extraction module
- [ ] Add vendor detection to extraction pipeline
- [ ] Update popup to show matched vendor
- [ ] Link products to vendors on save

### Phase 2: Inline Vendor Creation
- [ ] Build `VendorInlineForm` component
- [ ] Add "New Vendor" flow to popup
- [ ] Handle vendor creation before product save

### Phase 3: Vendor-Only Capture
- [ ] Add mode detection heuristics
- [ ] Build vendor capture popup layout
- [ ] Add vendor-only save flow

### Phase 4: Trade Pricing
- [ ] Fetch designer's trade accounts
- [ ] Calculate and display trade pricing
- [ ] Add "Apply for trade" CTA

### Phase 5: Polish & Edge Cases
- [ ] Offline queue updates
- [ ] Duplicate vendor handling
- [ ] Error state refinements
- [ ] Analytics events

---

## 14. Files to Create/Modify

### Database (supabase/migrations/)

| File | Purpose |
|------|---------|
| `00011_add_retailer_id.sql` | Add `retailer_id` column to products table |

### Extension (apps/extension/)

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/extraction/vendor.ts` | Create | Vendor + retailer extraction |
| `src/lib/extraction/manufacturer.ts` | Create | Manufacturer extraction from product data |
| `src/lib/extraction/index.ts` | Modify | Add vendor pipeline |
| `src/components/VendorCard.tsx` | Create | Display matched vendor |
| `src/components/ManufacturerCard.tsx` | Create | Display matched manufacturer |
| `src/components/VendorSelector.tsx` | Create | Vendor picker dropdown |
| `src/components/VendorInlineForm.tsx` | Create | New vendor form |
| `src/components/TradePricing.tsx` | Create | Price display with trade |
| `src/components/ModeToggle.tsx` | Create | Product/Vendor mode switch |
| `popup.tsx` | Modify | Integrate vendor flow |
| `background.ts` | Modify | Update queue structure |

### Shared Packages

| File | Action | Purpose |
|------|--------|---------|
| `@strata/shared/types/index.ts` | Modify | Add ExtractedVendorData, ExtractedProductVendors |
| `@strata/supabase/hooks/use-products.ts` | Modify | Include retailer in queries |
