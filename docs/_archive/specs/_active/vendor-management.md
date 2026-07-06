# Vendor Management Development Specification

> **Module:** Designer Portal
> **Version:** 1.0
> **Status:** Active
> **Started:** 2026-01
> **Completed:** —

---

## Overview

This specification defines the Vendor Management module for the Designer Portal, translating the VRM PRD into implementable screens, components, and user flows.

**Key Deliverables:**
- 5 Primary Screens with desktop and mobile variants
- 12 Reusable Components for the design system
- 3 Core User Flows with interaction specifications
- API Integration Points with data contracts

**Primary User Story:**  
"As a designer, I want to see my actual cost, lead times, and vendor reputation at a glance so I can make confident product recommendations without re-researching every time."

| Metric | Target |
|--------|--------|
| Time to find vendor info | <5 seconds |
| Trade tier visibility | 100% on product cards |
| Pricing accuracy | 95%+ |
| Mobile parity | All core features |

---

## Part 1: Architecture

### 1.1 Navigation Integration

**Desktop Primary Navigation:**
```
├── Dashboard
├── Lead Inbox
├── Projects
├── Room Viewer
├── Vendors              ← NEW
│   ├── Directory
│   ├── My Trade Accounts
│   ├── Saved Vendors
│   └── Vendor Reviews
├── Products              (Enhanced with vendor data)
├── Proposals
├── Clients
├── Earnings
└── Resources
```

**Mobile Bottom Tab Bar:**
```
├── Inbox
├── Projects
├── Viewer
├── Vendors    ← Replaces Clients
└── Profile
```

> **Mobile Nav Decision:** Vendors replaces "Clients" in bottom nav. Client management moves to Profile menu. Rationale: Vendor lookup is more frequent during client consultations.

**Contextual Entry Points:**
- **From Product Cards:** Tap vendor name/logo → slide-over panel
- **From Proposals:** Vendor lead times and pricing auto-populate
- **From Global Search:** Type vendor name → direct to profile

### 1.2 Information Architecture

```
Vendors Module
│
├── Directory (/vendors)
│   ├── Search + Filters
│   │   ├── By Category (Upholstery, Case Goods, Lighting...)
│   │   ├── By Market Position (Entry → Ultra-Luxury)
│   │   ├── By Production Model (Stock, MTO, Custom)
│   │   ├── By Certification (FSC, GREENGUARD, B Corp...)
│   │   ├── By Designer Rating (4+ stars, 3+ stars...)
│   │   └── By Trade Tier Status (My accounts, Available)
│   ├── List View (default)
│   └── Card View (toggle)
│
├── Vendor Profile (/vendors/:id)
│   ├── Overview Tab
│   │   ├── Hero Section (Logo, Name, Rating, Location)
│   │   ├── My Trade Terms Card
│   │   ├── Designer Reputation Section
│   │   ├── Specializations
│   │   └── Lead Times Summary
│   ├── Products Tab
│   │   └── Paginated product grid with filters
│   ├── Story Tab
│   │   ├── Brand Narrative
│   │   ├── Timeline
│   │   ├── Maker Spotlights
│   │   └── Process Gallery
│   └── Reviews Tab
│       ├── Aggregate Scores
│       └── Individual Designer Reviews
│
├── My Trade Accounts (/vendors/accounts)
│   ├── Active Accounts
│   ├── Pending Applications
│   └── Available Programs
│
├── Saved Vendors (/vendors/saved)
│
└── Vendor Reviews (/vendors/reviews)
    ├── My Submitted Reviews
    ├── Review Requests
    └── Review Drafts
```

### 1.3 Data Requirements

**VendorSummary (for directory cards):**
```typescript
interface VendorSummary {
  id: string;
  tradeName: string;
  logoUrl: string;
  primaryCategory: ProductCategory;
  marketPosition: 'entry' | 'mid' | 'premium' | 'luxury' | 'ultra-luxury';
  headquarters: { city: string; state: string };
  
  designerRelationship: {
    accountStatus: 'none' | 'pending' | 'active';
    currentTier: PricingTier | null;
    isSaved: boolean;
  };
  
  reputation: {
    overallScore: number;      // 1-5
    reviewCount: number;
    topSpecializations: string[];  // Max 3
  };
  
  leadTimes: {
    quickShip: string | null;  // "2-3 weeks"
    madeToOrder: string;       // "8-10 weeks"
  };
}
```

**VendorProfile (extends VendorSummary):**
```typescript
interface VendorProfile extends VendorSummary {
  legalName: string;
  brands: Brand[];
  parentCompany: { id: string; name: string } | null;
  secondaryCategories: ProductCategory[];
  productionModel: 'stock' | 'mto' | 'custom' | 'mixed';
  foundedYear: number;
  ownershipType: 'family' | 'private' | 'pe-backed' | 'public';
  
  tradeProgram: {
    pricingTiers: PricingTier[];
    applicationUrl: string;
    contactEmail: string;
    salesReps: SalesRep[];
    minimumRequirements: string[];
  };
  
  designerPricing: {
    currentTier: PricingTier;
    tierSince: DateTime;
    annualVolume: number;
    volumeToNextTier: number;
    nextTierBenefits: string[];
  } | null;
  
  reputation: VendorReputation;
  certifications: Certification[];
  
  story: {
    heroImageUrl: string;
    narrative: string;
    timeline: TimelineEvent[];
    makerSpotlights: MakerProfile[];
    processGallery: MediaItem[];
  };
  
  leadTimes: LeadTimeMatrix;
  productCount: number;
  featuredProducts: ProductSummary[];
}
```

**Key Data Relationships:**

| Entity | Relationship | Cardinality | UI Impact |
|--------|--------------|-------------|-----------|
| Designer → Vendor | Trade Account | Many-to-Many | Personalized pricing display |
| Designer → Vendor | Saved/Favorited | Many-to-Many | Quick access list, save buttons |
| Designer → Vendor | Review | One-to-One per period | Review submission, edit states |
| Vendor → Product | Manufacturer | One-to-Many | Product count, filtered views |
| Vendor → Certification | Holder | One-to-Many | Badge display, verification links |

---

## Part 2: Screen Specifications

### Screen 1: Vendor Directory

**Route:** `/vendors`

**Desktop Wireframe:**
```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│  ☰  Patina                          🔍 Search vendors...                  🔔  👤   │
├──────────┬──────────────────────────────────────────────────────────────────────────┤
│          │                                                                          │
│ Dashboard│  Vendors                                                                 │
│          │  ═══════════════════════════════════════════════════════════════════════│
│ Lead     │                                                                          │
│ Inbox    │  ┌─────────────────────────────────────────┐  View: [List ▾] [□ Cards]  │
│          │  │ 🔍 Search by name, brand, category...   │                            │
│ Projects │  └─────────────────────────────────────────┘                            │
│          │                                                                          │
│ Room     │  FILTERS                                              847 vendors found │
│ Viewer   │  ┌──────────────────────────────────────────────────────────────────┐  │
│          │  │ Category ▾    Market Position ▾    My Status ▾    Rating ▾       │  │
│ ▶ VENDORS│  │ [Upholstery×] [Premium×]          [All Accounts]  [4+ stars]     │  │
│          │  │                                                                  │  │
│ Products │  │ Production ▾   Certifications ▾   Lead Time ▾    [Clear All]    │  │
│          │  └──────────────────────────────────────────────────────────────────┘  │
│ Proposals│                                                                          │
│          │  ┌──────────────────────────────────────────────────────────────────────┐
│ Clients  │  │ VENDOR                      │ CATEGORY    │ MY STATUS │ RATING │ ⋮  │
│          │  ├──────────────────────────────────────────────────────────────────────┤
│ Earnings │  │ ┌────┐                      │             │           │        │    │
│          │  │ │logo│ Room & Board         │ Upholstery  │ ● Active  │ ⭐ 4.7 │ ▸  │
│ Resources│  │ └────┘ Minneapolis, MN      │ Premium     │ Net Tier  │ (47)   │    │
│          │  │        🏆 Sofas  Sectionals │             │           │        │    │
│          │  ├──────────────────────────────────────────────────────────────────────┤
│          │  │ ┌────┐                      │             │           │        │    │
│          │  │ │logo│ Four Hands           │ Case Goods  │ ● Active  │ ⭐ 4.5 │ ▸  │
│          │  │ └────┘ Austin, TX           │ Mid-Premium │ Wholesale │ (112)  │    │
│          │  │        🏆 Dining  Bedroom   │             │           │        │    │
│          │  ├──────────────────────────────────────────────────────────────────────┤
│          │  │ ┌────┐                      │             │           │        │    │
│          │  │ │logo│ Restoration Hardware │ Case Goods  │ ○ None    │ ⭐ 4.2 │ ▸  │
│          │  │ └────┘ Corte Madera, CA     │ Luxury      │ [Apply →] │ (89)   │    │
│          │  │        🏆 Lighting  Outdoor │             │           │        │    │
│          │  └──────────────────────────────────────────────────────────────────────┘
│          │                                                                          │
│          │  ◀ 1  2  3  4  5 ... 42 ▶                      Showing 1-20 of 847      │
└──────────┴──────────────────────────────────────────────────────────────────────────┘
```

**Screen Specs:**

| Property | Value |
|----------|-------|
| Route | /vendors |
| Layout | List view (default), Card view toggle |
| Default Sort | Active accounts first, then by rating |
| Pagination | 20 items per page, infinite scroll optional |
| Search | Debounced, 300ms, searches name + brands |

**Filter Behaviors:**

| Filter | Behavior |
|--------|----------|
| Category | Multi-select, shows count in badge |
| Market Position | Multi-select |
| My Status | All, Active Accounts, Saved, Available |
| Rating | 4+, 3+, All |
| Lead Time | Quick-ship available, Under 8 weeks |

**VendorDirectoryRow Component:**
```typescript
interface VendorDirectoryRowProps {
  vendor: VendorSummary;
  onRowClick: (vendorId: string) => void;
  onSaveToggle: (vendorId: string, saved: boolean) => void;
  onQuickAction: (action: 'apply' | 'view-products' | 'contact') => void;
}

// Visual States
// - Default: White background
// - Hover: Subtle highlight (--patina-soft-cream)
// - Saved: Small bookmark icon in corner
// - Active account: Green dot indicator
// - Pending application: Yellow dot indicator
```

**Mobile Wireframe:**
```
┌────────────────────────────────┐
│  ←  Vendors           🔍  ⋮    │
├────────────────────────────────┤
│                                │
│  ┌────────────────────────────┐│
│  │ 🔍 Search vendors...      ││
│  └────────────────────────────┘│
│                                │
│  Filters ▾        847 results  │
│  [Upholstery×] [Premium×]      │
│                                │
│  ┌────────────────────────────┐│
│  │ ┌────┐ Room & Board        ││
│  │ │logo│ Minneapolis • ⭐ 4.7 ││
│  │ └────┘ ● Active • Net Tier ││
│  │        🏆 Sofas, Sectionals ││
│  └────────────────────────────┘│
│                                │
│  ┌────────────────────────────┐│
│  │ ┌────┐ Four Hands          ││
│  │ │logo│ Austin • ⭐ 4.5      ││
│  │ └────┘ ● Active • Wholesale││
│  │        🏆 Dining, Bedroom   ││
│  └────────────────────────────┘│
│                                │
├────────────────────────────────┤
│  📥    📁    👁    🏪    👤    │
│ Inbox  Proj  View  Vend  Prof  │
└────────────────────────────────┘
```

**Mobile Interactions:**
- Cards swipeable left to save/unsave
- Pull-to-refresh reloads list
- Filter panel slides up as bottom sheet
- Long-press shows quick actions (Apply, Contact Rep, View Products)

---

### Screen 2: Vendor Profile

**Route:** `/vendors/:id`

**Desktop Wireframe (Overview Tab):**
```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│  ☰  Patina                          🔍 Search...                         🔔  👤   │
├──────────┬──────────────────────────────────────────────────────────────────────────┤
│          │                                                                          │
│ Dashboard│  ← Back to Vendors                                                       │
│          │                                                                          │
│ Lead     │  ┌───────────────────────────────────────────────────────────────────────┐
│ Inbox    │  │  ┌──────────┐                                                         │
│          │  │  │   LOGO   │   Room & Board                            ⭐ 4.7 (47)  │
│ Projects │  │  └──────────┘   Premium Modern Furniture                              │
│          │  │                 Minneapolis, MN • Founded 1980 • Private              │
│ Room     │  │                                                                       │
│ Viewer   │  │  [ Overview ]  [ Products (847) ]  [ Story ]  [ Certifications ]     │
│          │  └───────────────────────────────────────────────────────────────────────┘
│ ▶ VENDORS│                                                                          │
│          │  ┌───────────────────────────────────┐ ┌─────────────────────────────────┐
│ Products │  │ YOUR TRADE TERMS                  │ │ DESIGNER REPUTATION             │
│          │  │ ───────────────────────────────── │ │ ─────────────────────────────── │
│ Proposals│  │ Current Tier: Designer Net        │ │ Quality    █████████░░  4.6    │
│          │  │ Your Discount: 40% off MSRP       │ │ Delivery   ███████░░░░  3.8    │
│ Clients  │  │                                   │ │ Service    ████████░░░  4.2    │
│          │  │ ┌─────────────────────────────┐   │ │ Value      ██████████░  4.8    │
│ Earnings │  │ │ 📈 Progress to Wholesale    │   │ │                                 │
│          │  │ │ ████████████░░░░  $8,240    │   │ │ "Excellent quality. Delivery   │
│ Resources│  │ │ remaining to qualify         │   │ │  can run a bit slow."          │
│          │  │ └─────────────────────────────┘   │ │          — Network consensus    │
│          │  │ [View Full Account →]             │ │ [Read 47 Reviews →]             │
│          │  └───────────────────────────────────┘ └─────────────────────────────────┘
│          │                                                                          │
│          │  ┌───────────────────────────────────────────────────────────────────────┐
│          │  │ SPECIALIZATIONS (Designer-Validated)                                  │
│          │  │  ┌────────────┐  ┌────────────┐  ┌───────────────────┐               │
│          │  │  │   Sofas    │  │ Sectionals │  │ Performance Fabric│               │
│          │  │  │  ⭐⭐⭐⭐⭐   │  │  ⭐⭐⭐⭐⭐   │  │      ⭐⭐⭐⭐⭐        │               │
│          │  │  │  32 votes  │  │  28 votes  │  │     41 votes      │               │
│          │  │  └────────────┘  └────────────┘  └───────────────────┘               │
│          │  └───────────────────────────────────────────────────────────────────────┘
│          │                                                                          │
│          │  ┌───────────────────────────────────────────────────────────────────────┐
│          │  │ LEAD TIMES (Current Estimates)                                        │
│          │  │  Quick-Ship      Made-to-Order      Custom           Verified        │
│          │  │  ┌─────────┐     ┌─────────────┐    ┌────────────┐   ┌────────────┐  │
│          │  │  │ 2-3 wks │     │  8-10 wks   │    │ 12-16 wks  │   │ 3 days ago │  │
│          │  │  │ ● 94%   │     │  ● 87%      │    │ ● 82%      │   │            │  │
│          │  │  │ on-time │     │  on-time    │    │ on-time    │   │            │  │
│          │  │  └─────────┘     └─────────────┘    └────────────┘   └────────────┘  │
│          │  │  ⚠️ Lead times may vary. Last report: "MTO ran 2 wks over"           │
│          │  └───────────────────────────────────────────────────────────────────────┘
│          │                                                                          │
│          │  ┌───────────────────────────────────────────────────────────────────────┐
│          │  │ CERTIFICATIONS                                                        │
│          │  │  ✓ FSC Certified (Mix)    ✓ GREENGUARD Gold    ○ B Corp (not cert)   │
│          │  └───────────────────────────────────────────────────────────────────────┘
│          │                                                                          │
│          │  [ View All 847 Products ]  [ Read Brand Story ]  [ Contact Sales Rep ] │
└──────────┴──────────────────────────────────────────────────────────────────────────┘
```

**Trade Terms Card States:**

| State | Display |
|-------|---------|
| Active Account | Current tier, discount %, progress bar to next tier |
| Pending Application | Application status, expected timeline, contact link |
| No Account | "Apply for Trade" CTA, program overview, requirements |

**Reputation Section:**

| Element | Source |
|---------|--------|
| Dimension bars | Average of designer ratings (1-5 scale) |
| Network consensus | AI-summarized sentiment from reviews |
| Review count | Total verified designer reviews |

**Specialization Badges:**
```typescript
interface SpecializationBadge {
  category: string;        // "Sofas", "Performance Fabric", etc.
  rating: number;          // 1-5 stars
  voteCount: number;       // Number of designer confirmations
  isConfirmedByUser: boolean;
}

// Display rules:
// - Show top 5 specializations max
// - Require 10+ votes to display
// - Sort by rating, then vote count
// - Designer can add vote from profile
```

**Mobile Wireframe:**
```
┌────────────────────────────────┐
│  ←  Room & Board      ☆  ⋮    │
├────────────────────────────────┤
│  ┌────────────────────────────┐│
│  │     [   Brand Logo   ]     ││
│  │     Room & Board           ││
│  │     ⭐ 4.7 (47 reviews)    ││
│  │     Minneapolis, MN        ││
│  │     Premium • Founded 1980 ││
│  └────────────────────────────┘│
│                                │
│  [Overview][Products][Story]▸  │
│  ─────────────────────────────│
│                                │
│  YOUR TRADE TERMS              │
│  ┌────────────────────────────┐│
│  │ Designer Net • 40% off     ││
│  │ Progress to Wholesale:     ││
│  │ ████████████░░░░ $8,240    ││
│  │ [View Account Details →]   ││
│  └────────────────────────────┘│
│                                │
│  REPUTATION                    │
│  ┌────────────────────────────┐│
│  │ Quality   █████████░  4.6  ││
│  │ Delivery  ███████░░░  3.8  ││
│  │ Service   ████████░░  4.2  ││
│  │ Value     ██████████  4.8  ││
│  │ [Read 47 Reviews →]        ││
│  └────────────────────────────┘│
│                                │
│  SPECIALIZATIONS               │
│  ┌──────┐ ┌──────┐ ┌─────────┐│
│  │Sofas │ │Sect. │ │Perform. ││
│  │⭐⭐⭐⭐⭐│ │⭐⭐⭐⭐⭐│ │⭐⭐⭐⭐⭐    ││
│  └──────┘ └──────┘ └─────────┘│
│                                │
│  LEAD TIMES                    │
│  ┌────────────────────────────┐│
│  │ Quick    MTO      Custom   ││
│  │ 2-3 wk   8-10 wk  12-16 wk ││
│  │ 94%✓     87%✓     82%✓     ││
│  └────────────────────────────┘│
│                                │
│  [View 847 Products]           │
├────────────────────────────────┤
│  📥    📁    👁    🏪    👤    │
└────────────────────────────────┘
```

**Mobile Interactions:**
- Horizontal scroll tabs for Overview/Products/Story/Certifications
- Save vendor with star icon in header
- Share via overflow menu
- Quick call/email to sales rep via floating action button

---

### Screen 3: Trade Account Management

**Route:** `/vendors/accounts`

**Desktop Wireframe:**
```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│  ☰  Patina                          🔍 Search...                         🔔  👤   │
├──────────┬──────────────────────────────────────────────────────────────────────────┤
│          │                                                                          │
│ Dashboard│  My Trade Accounts                                                       │
│          │  ═══════════════════════════════════════════════════════════════════════│
│ Lead     │                                                                          │
│ Inbox    │  ACTIVE ACCOUNTS (12)                                                    │
│          │  ┌───────────────────────────────────────────────────────────────────────┐
│ Projects │  │  ┌────┐ Room & Board          Designer Net (40%)                      │
│          │  │  │logo│ Account #RB-2847      ████████████░░░░ $8,240 to Wholesale   │
│ Room     │  │  └────┘ Since Jan 2023        YTD Volume: $11,760                     │
│ Viewer   │  │                               [View Pricing →] [Contact Rep →]        │
│          │  │ ─────────────────────────────────────────────────────────────────────│
│ ▶ VENDORS│  │  ┌────┐ Four Hands            Wholesale (50/10)                       │
│          │  │  │logo│ Account #FH-9921      ██████░░░░░░░░░░ $14,500 to Stocking   │
│ Products │  │  └────┘ Since Mar 2022        YTD Volume: $35,500                     │
│          │  │                               [View Pricing →] [Contact Rep →]        │
│ Proposals│  │ ─────────────────────────────────────────────────────────────────────│
│          │  │  ┌────┐ West Elm Trade        Designer Discount (35%)                 │
│ Clients  │  │  │logo│ Account #WE-4412      ░░░░░░░░░░░░░░░░ No upgrade path       │
│          │  │  └────┘ Since Jun 2024        YTD Volume: $4,200                      │
│ Earnings │  │                               [View Pricing →] [Contact Rep →]        │
│          │  └───────────────────────────────────────────────────────────────────────┘
│ Resources│                                                                          │
│          │  PENDING APPLICATIONS (2)                                                │
│          │  ┌───────────────────────────────────────────────────────────────────────┐
│          │  │  ┌────┐ Mitchell Gold         Application submitted Dec 15, 2025      │
│          │  │  │logo│ Estimated decision:   Jan 25, 2026 (6 days)                   │
│          │  │  └────┘ Status: Under review  [View Application →] [Contact →]        │
│          │  │ ─────────────────────────────────────────────────────────────────────│
│          │  │  ┌────┐ Holly Hunt            Application submitted Jan 2, 2026       │
│          │  │  │logo│ Estimated decision:   Feb 1, 2026 (13 days)                   │
│          │  │  └────┘ Status: Documents     [Complete Application →]                │
│          │  │            requested                                                  │
│          │  └───────────────────────────────────────────────────────────────────────┘
│          │                                                                          │
│          │  SUGGESTED TRADE PROGRAMS                                                │
│          │  ┌───────────────────────────────────────────────────────────────────────┐
│          │  │ Based on your product saves and project history:                      │
│          │  │  ┌────┐ Arteriors             ┌────┐ Visual Comfort                   │
│          │  │  │logo│ Lighting • 45% off    │logo│ Lighting • 50% off              │
│          │  │  └────┘ [Apply →]             └────┘ [Apply →]                        │
│          │  └───────────────────────────────────────────────────────────────────────┘
└──────────┴──────────────────────────────────────────────────────────────────────────┘
```

**TradeAccountCard Component:**
```typescript
interface TradeAccountCardProps {
  vendor: VendorSummary;
  account: {
    accountNumber: string;
    accountSince: DateTime;
    currentTier: PricingTier;
    discountDisplay: string;      // "40%" or "50/10"
    ytdVolume: number;
    volumeToNextTier: number | null;
    nextTier: PricingTier | null;
    salesRep: SalesRep | null;
  };
  onViewPricing: () => void;
  onContactRep: () => void;
}

// Progress bar logic:
// - If nextTier exists: show progress bar with $ remaining
// - If no nextTier: show "Top tier achieved" or "No upgrade path"
// - Color: --patina-clay-beige for progress, --patina-success for completed
```

**Volume Tracking:**
- **Automatic:** Orders placed through Patina
- **Manual:** Designer can log external purchases
- **Rolling window:** 12-month trailing period
- **Verification:** Linked to vendor reports when available

**Application Status States:**

| Indicator | Status | Description |
|-----------|--------|-------------|
| 🔵 | Submitted | Awaiting vendor review |
| 🟡 | Documents Requested | Action needed by designer |
| 🟢 | Approved | Account creation in progress |
| 🔴 | Declined | With reason and reapply timeline |

---

### Screen 4: Vendor Review Submission

**Type:** Modal

**Wireframe:**
```
┌───────────────────────────────────────────────────────────────────────────────┐
│   ╔═══════════════════════════════════════════════════════════════════════╗   │
│   ║                                                             ✕ Close   ║   │
│   ║   Review Room & Board                                                 ║   │
│   ║   ─────────────────────────────────────────────────────────────────── ║   │
│   ║   Help fellow designers by sharing your experience.                   ║   │
│   ║                                                                       ║   │
│   ║   RATE YOUR EXPERIENCE                                                ║   │
│   ║                                                                       ║   │
│   ║   Build Quality         ☆ ☆ ☆ ☆ ☆                                    ║   │
│   ║   How would you rate the craftsmanship and durability?                ║   │
│   ║                                                                       ║   │
│   ║   Finish Quality        ☆ ☆ ☆ ☆ ☆                                    ║   │
│   ║   Quality of stains, fabrics, and final details?                      ║   │
│   ║                                                                       ║   │
│   ║   Delivery Reliability  ☆ ☆ ☆ ☆ ☆                                    ║   │
│   ║   Did products arrive on time and undamaged?                          ║   │
│   ║                                                                       ║   │
│   ║   Customer Service      ☆ ☆ ☆ ☆ ☆                                    ║   │
│   ║   How responsive and helpful was the vendor?                          ║   │
│   ║                                                                       ║   │
│   ║   Value for Price       ☆ ☆ ☆ ☆ ☆                                    ║   │
│   ║   Does quality justify the price point?                               ║   │
│   ║                                                                       ║   │
│   ║   ─────────────────────────────────────────────────────────────────── ║   │
│   ║                                                                       ║   │
│   ║   CONFIRM SPECIALIZATIONS                                             ║   │
│   ║   What does this vendor do best? (Select all that apply)              ║   │
│   ║                                                                       ║   │
│   ║   [ ✓ Sofas ]  [ ✓ Sectionals ]  [ ○ Beds ]  [ ○ Dining Tables ]     ║   │
│   ║   [ ○ Chairs ]  [ ✓ Performance Fabric ]  [ ○ Leather ]               ║   │
│   ║                                                                       ║   │
│   ║   ─────────────────────────────────────────────────────────────────── ║   │
│   ║                                                                       ║   │
│   ║   SHARE YOUR EXPERIENCE (Optional)                                    ║   │
│   ║   ┌───────────────────────────────────────────────────────────────┐   ║   │
│   ║   │ What should other designers know about working with           │   ║   │
│   ║   │ Room & Board?                                                 │   ║   │
│   ║   └───────────────────────────────────────────────────────────────┘   ║   │
│   ║   0/500 characters                                                    ║   │
│   ║                                                                       ║   │
│   ║   LEAD TIME ACCURACY                                                  ║   │
│   ║   ┌───────────────────────────────────────────────────────────────┐   ║   │
│   ║   │ Last order lead time:                                         │   ║   │
│   ║   │ ○ Faster than quoted   ○ As expected   ○ Slower than quoted   │   ║   │
│   ║   │ If slower, how much?  [    ] weeks over                       │   ║   │
│   ║   └───────────────────────────────────────────────────────────────┘   ║   │
│   ║                                                                       ║   │
│   ║   ☐ I have ordered from this vendor in the past 12 months            ║   │
│   ║                                                                       ║   │
│   ║                      [ Cancel ]    [ Submit Review ]                  ║   │
│   ╚═══════════════════════════════════════════════════════════════════════╝   │
└───────────────────────────────────────────────────────────────────────────────┘
```

**Validation Rules:**

| Field | Required | Validation |
|-------|----------|------------|
| Star ratings (all 5) | Yes | At least 1 star per dimension |
| Specialization confirmations | Yes | At least 1 selection |
| Written review | No | Max 500 characters, no links |
| Lead time accuracy | No | If "slower", weeks required |
| Order verification | Yes | Must confirm recent order |

> **Review Integrity:** Reviews are weighted by verified purchase history. Designers with confirmed orders through Patina receive higher weight. Reviews are never edited by vendors, but vendors can respond publicly.

---

### Screen 5: Product-Vendor Integration

**Product Card with Vendor Context:**
```
┌────────────────────────────────┐
│  ┌────────────────────────────┐│
│  │     [Product Image]        ││
│  └────────────────────────────┘│
│                                │
│  York Slope Arm Sofa           │
│  Room & Board  ⭐ 4.7          │
│  ─────────────────────────────│
│                                │
│  YOUR COST      MSRP           │
│  $2,560         $3,200         │
│  Designer Net (40%)            │
│                                │
│  ┌────────────────────────────┐│
│  │ Lead Time: 8-10 weeks      ││
│  │ ● In stock colors: 2-3 wks ││
│  └────────────────────────────┘│
│                                │
│  ┌─FSC─┐  ┌─GREENGUARD─┐       │
│  └─────┘  └────────────┘       │
│                                │
│  [Add to Project]  [Save]  ⋮   │
└────────────────────────────────┘
```

**Data Inheritance Rules:**

| From Vendor | Shows On Product |
|-------------|------------------|
| Designer's pricing tier | "Your Cost" calculation |
| Vendor rating | Star rating next to name |
| Lead time matrix | Expected delivery estimate |
| Certifications | Cert badges on card |
| Quick-ship availability | "In stock" callout |

> **Design Decision:** Vendor name is always a link to vendor profile. Tapping opens vendor slide-over panel (not full navigation) to allow quick reference without losing context.

**Vendor Slide-Over Panel:**
```
┌────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                    │
│  [Main content area remains visible but dimmed]    ┌──────────────────────────────┐│
│                                                    │  ✕  Room & Board              ││
│                                                    │  ────────────────────────────││
│                                                    │  ┌──────────┐                ││
│                                                    │  │   LOGO   │  ⭐ 4.7 (47)  ││
│                                                    │  └──────────┘                ││
│                                                    │  Premium Modern Furniture    ││
│                                                    │  Minneapolis, MN             ││
│                                                    │                              ││
│                                                    │  YOUR TERMS                  ││
│                                                    │  Designer Net • 40% off      ││
│                                                    │  $8,240 to Wholesale         ││
│                                                    │                              ││
│                                                    │  SPECIALIZES IN              ││
│                                                    │  Sofas • Sectionals          ││
│                                                    │  Performance Fabric          ││
│                                                    │                              ││
│                                                    │  LEAD TIMES                  ││
│                                                    │  Quick: 2-3 wks              ││
│                                                    │  MTO: 8-10 wks               ││
│                                                    │                              ││
│                                                    │  CERTIFICATIONS              ││
│                                                    │  ✓ FSC  ✓ GREENGUARD        ││
│                                                    │                              ││
│                                                    │  ─────────────────────────── ││
│                                                    │  [View Full Profile →]       ││
│                                                    │  [Browse 847 Products →]     ││
│                                                    │  [Contact Sales Rep →]       ││
│                                                    └──────────────────────────────┘│
└────────────────────────────────────────────────────────────────────────────────────┘
```

**Slide-Over Behavior:**
- Opens from right edge (400px width on desktop, full-screen on mobile)
- Clicking outside dismisses
- ESC key dismisses
- "View Full Profile" navigates to vendor profile page

---

## Part 3: Component Library

### 12 Components for Design System

| # | Component | Priority | Purpose |
|---|-----------|----------|---------|
| 1 | VendorLogo | P0 | Logo display with fallback |
| 2 | VendorRatingBadge | P0 | Rating with review count |
| 3 | TradeTierIndicator | P0 | Account status display |
| 4 | TierProgressBar | P1 | Volume progress to next tier |
| 5 | LeadTimeDisplay | P0 | Lead time estimates |
| 6 | SpecializationBadge | P1 | Designer-validated expertise |
| 7 | CertificationBadge | P1 | Trust signal badges |
| 8 | ReputationBar | P1 | Single dimension rating bar |
| 9 | VendorDirectoryCard | P0 | Directory list/card item |
| 10 | VendorSlideOver | P0 | Quick view panel |
| 11 | StarRatingInput | P1 | Review form input |
| 12 | PricingDisplay | P0 | Price with tier context |

### Component Interfaces

```typescript
// 1. VendorLogo
interface VendorLogoProps {
  logoUrl: string;
  vendorName: string;
  size: 'sm' | 'md' | 'lg' | 'xl';  // 32px, 48px, 64px, 96px
  showFallback?: boolean;           // First letter fallback
}

// 2. VendorRatingBadge
interface VendorRatingBadgeProps {
  rating: number;        // 1-5
  reviewCount: number;
  size: 'sm' | 'md';
  showCount?: boolean;   // default true
}

// 3. TradeTierIndicator
interface TradeTierIndicatorProps {
  status: 'none' | 'pending' | 'active';
  tierName?: string;     // "Designer Net"
  discount?: string;     // "40%"
  variant: 'badge' | 'inline' | 'detailed';
}

// 4. TierProgressBar
interface TierProgressBarProps {
  currentVolume: number;
  targetVolume: number;
  currentTier: string;
  nextTier: string | null;
  showAmount?: boolean;
}

// 5. LeadTimeDisplay
interface LeadTimeDisplayProps {
  leadTimes: {
    quickShip?: string;
    madeToOrder: string;
    custom?: string;
  };
  onTimePercentages?: {
    quickShip?: number;
    madeToOrder?: number;
    custom?: number;
  };
  variant: 'compact' | 'detailed';
}

// 6. SpecializationBadge
interface SpecializationBadgeProps {
  name: string;
  rating: number;
  voteCount: number;
  isConfirmedByUser: boolean;
  onVote?: () => void;
}

// 7. CertificationBadge
interface CertificationBadgeProps {
  certification: 'fsc' | 'greenguard' | 'bcorp' | 'fairtrade' | 'custom';
  level?: string;        // "Gold", "Mix"
  isVerified: boolean;
  expirationDate?: DateTime;
  size: 'sm' | 'md';
}

// 8. ReputationBar
interface ReputationBarProps {
  dimension: string;     // "Quality", "Delivery"
  rating: number;        // 1-5
  showLabel?: boolean;
  showValue?: boolean;
}

// 9. VendorDirectoryCard
interface VendorDirectoryCardProps {
  vendor: VendorSummary;
  variant: 'list' | 'card';
  onSaveToggle: () => void;
  onClick: () => void;
}

// 10. VendorSlideOver
interface VendorSlideOverProps {
  vendorId: string;
  isOpen: boolean;
  onClose: () => void;
  onNavigateToProfile: () => void;
}

// 11. StarRatingInput
interface StarRatingInputProps {
  value: number;
  onChange: (rating: number) => void;
  label: string;
  description?: string;
  size: 'sm' | 'md' | 'lg';
}

// 12. PricingDisplay
interface PricingDisplayProps {
  msrp: number;
  designerCost: number;
  tierName: string;
  discountPercent: string;
  showMsrp?: boolean;
  showSavings?: boolean;
}
```

---

## Part 4: Technical Specifications

### User Flows

#### Flow 1: Discover & Research Vendor

```
1. ENTRY POINT
   └─→ Designer searches for "lighting vendors" in directory
       └─→ System shows filtered results with lighting category

2. BROWSE DIRECTORY
   ├─→ Designer scans list, notices Visual Comfort (no account)
   ├─→ Sees: ⭐ 4.6 rating, "Premium", specializes in chandeliers
   └─→ Taps row to view profile

3. VIEW VENDOR PROFILE
   ├─→ Profile loads with Overview tab
   │   ├─→ Sees "Apply for Trade Account" CTA (no active account)
   │   ├─→ Reviews reputation scores (Quality: 4.8, Delivery: 4.2)
   │   └─→ Notes lead times: Quick-ship 1-2 weeks, MTO 6-8 weeks
   ├─→ Switches to Products tab → Browses 1,247 lighting products
   ├─→ Switches to Story tab → Reads heritage narrative
   └─→ Switches to Reviews tab → Reads 3 detailed designer reviews

4. SAVE FOR LATER
   └─→ Designer taps ☆ to save vendor
       └─→ System confirms: "Visual Comfort saved to your vendors"

5. APPLY FOR TRADE (Optional)
   └─→ Designer clicks "Apply for Trade Account"
       ├─→ System opens external application in new tab
       └─→ Returns to Patina, account shows as "Pending"
```

#### Flow 2: Quick Vendor Reference from Product

```
1. ENTRY POINT
   └─→ Designer viewing product detail page for a dining table
       └─→ Notices vendor "Four Hands" in product header

2. TRIGGER VENDOR SLIDE-OVER
   └─→ Taps vendor name "Four Hands"
       └─→ Slide-over panel animates in from right (300ms ease-out)

3. QUICK REFERENCE
   ├─→ Sees trade terms: "Wholesale (50/10) • $14,500 to Stocking"
   ├─→ Sees specializations: Dining, Bedroom, Case Goods
   ├─→ Sees lead times: MTO 6-8 weeks
   └─→ Sees certifications: FSC, GREENGUARD

4. DECISION POINT
   ├─→ Option A: Close slide-over, return to product (most common)
   ├─→ Option B: View full vendor profile → navigates to /vendors/four-hands
   └─→ Option C: Browse vendor's other products
```

#### Flow 3: Submit Vendor Review

```
1. ENTRY POINT (Triggered)
   └─→ System detects order delivered 7 days ago
       └─→ Shows prompt in dashboard: "How was your Room & Board order?"

2. OPEN REVIEW MODAL
   └─→ Designer clicks "Leave Review"
       └─→ Review modal opens with vendor pre-populated

3. RATE DIMENSIONS
   ├─→ Rates Build Quality: ⭐⭐⭐⭐⭐ (5 stars)
   ├─→ Rates Finish Quality: ⭐⭐⭐⭐⭐ (5 stars)
   ├─→ Rates Delivery Reliability: ⭐⭐⭐☆☆ (3 stars)
   ├─→ Rates Customer Service: ⭐⭐⭐⭐☆ (4 stars)
   └─→ Rates Value for Price: ⭐⭐⭐⭐⭐ (5 stars)

4. CONFIRM SPECIALIZATIONS
   └─→ Checks: ☑ Sofas, ☑ Sectionals, ☑ Performance Fabric

5. OPTIONAL: WRITTEN REVIEW
   └─→ Types: "Excellent sofa quality, but delivery ran 2 weeks late."

6. OPTIONAL: LEAD TIME FEEDBACK
   ├─→ Selects: "Slower than quoted"
   └─→ Enters: "2" weeks over

7. CONFIRM ELIGIBILITY
   └─→ Checks: ☑ "I have ordered from this vendor in past 12 months"

8. SUBMIT
   └─→ Clicks "Submit Review"
       └─→ Shows confirmation: "Thank you! Your review helps the network."
```

---

### API Contracts

```typescript
// List vendors with filters
GET /api/v1/vendors
Query params:
  - search: string
  - categories: string[]
  - marketPosition: string[]
  - minRating: number
  - certifications: string[]
  - accountStatus: 'all' | 'active' | 'saved' | 'available'
  - page: number
  - limit: number (default 20, max 100)
Response: { vendors: VendorSummary[], total: number, page: number }

// Get vendor profile
GET /api/v1/vendors/:vendorId
Response: VendorProfile

// Get vendor products
GET /api/v1/vendors/:vendorId/products
Query params: (standard product filters)
Response: { products: ProductSummary[], total: number }

// Toggle vendor save status
POST /api/v1/vendors/:vendorId/save
Body: { saved: boolean }
Response: { saved: boolean }

// Get designer's trade accounts
GET /api/v1/designers/me/trade-accounts
Response: { accounts: TradeAccount[], pending: PendingApplication[] }

// Submit vendor review
POST /api/v1/vendors/:vendorId/reviews
Body: {
  ratings: { 
    quality: number, 
    finish: number, 
    delivery: number, 
    service: number, 
    value: number 
  },
  specializations: string[],
  writtenReview?: string,
  leadTimeAccuracy?: { status: string, weeksOver?: number },
  hasOrderedRecently: boolean
}
Response: { reviewId: string, success: boolean }
```

**WebSocket Events:**
```typescript
// Subscribe to vendor updates
ws://api/v1/ws/vendors/:vendorId

Events:
- vendor:pricing_updated   // When trade pricing changes
- vendor:leadtime_updated  // When lead times change
- vendor:review_added      // When new review is posted
- vendor:certification_updated  // When certs change
```

---

### State Management

```typescript
interface VendorsState {
  // Directory state
  directory: {
    vendors: VendorSummary[];
    total: number;
    page: number;
    filters: VendorFilters;
    isLoading: boolean;
    error: string | null;
  };
  
  // Current profile state
  currentProfile: {
    vendor: VendorProfile | null;
    isLoading: boolean;
    error: string | null;
  };
  
  // Trade accounts state
  tradeAccounts: {
    accounts: TradeAccount[];
    pending: PendingApplication[];
    isLoading: boolean;
    lastFetched: DateTime | null;
  };
  
  // Saved vendors (for quick filtering)
  savedVendorIds: Set<string>;
  
  // Slide-over state
  slideOver: {
    isOpen: boolean;
    vendorId: string | null;
  };
}

// Actions
- fetchVendors(filters)
- fetchVendorProfile(vendorId)
- toggleVendorSave(vendorId, saved)
- fetchTradeAccounts()
- submitReview(vendorId, reviewData)
- openVendorSlideOver(vendorId)
- closeVendorSlideOver()
```

**RTK Query Caching:**
```typescript
vendorApi.endpoints = {
  getVendors: builder.query({
    query: (filters) => ({ url: '/vendors', params: filters }),
    providesTags: ['VendorList'],
    keepUnusedDataFor: 300  // 5 minutes
  }),
  getVendorProfile: builder.query({
    query: (vendorId) => `/vendors/${vendorId}`,
    providesTags: (result, error, id) => [{ type: 'Vendor', id }],
    keepUnusedDataFor: 600  // 10 minutes
  })
}
```

**Caching Strategy:**
- Vendor directory: 5 minutes
- Vendor profiles: 10 minutes
- Trade accounts: 30 minutes (invalidated on order events)
- Reviews: Never cached (always fresh)

---

### Implementation Phases

| Phase | Weeks | Focus | Deliverables |
|-------|-------|-------|--------------|
| 1 | 1-2 | Foundation | Core components, GET /vendors API, basic state, seed 100 vendors |
| 2 | 3-4 | Directory | Directory screens, filters, search, mobile responsive |
| 3 | 5-6 | Profile & Accounts | Profile tabs, trade account dashboard, full API |
| 4 | 7-8 | Integration | Reviews, slide-over, product card integration, polish |

**Phase 1: Foundation**
- Components: VendorLogo, VendorRatingBadge, TradeTierIndicator, PricingDisplay
- API: GET /vendors endpoint with basic filters
- State: Basic vendors slice setup
- Data: Seed 100 top vendors with complete profiles

**Phase 2: Directory**
- Screens: Vendor Directory (list + card views)
- Components: VendorDirectoryCard, filter components
- Features: Search, filtering, pagination, save toggle
- Mobile: Responsive directory with swipe actions

**Phase 3: Profile & Accounts**
- Screens: Vendor Profile (all tabs), My Trade Accounts
- Components: ReputationBar, SpecializationBadge, LeadTimeDisplay, TierProgressBar
- Features: Profile navigation, trade account dashboard
- API: Profile endpoint, trade accounts endpoint

**Phase 4: Integration & Reviews**
- Screens: Review submission modal, Vendor slide-over
- Integration: Vendor data on product cards, global search
- Features: Review submission, slide-over navigation
- Polish: Animations, error states, empty states

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Efficiency | 60% reduction in vendor research time | Time from product save to pricing quote |
| Adoption | 80% of designers use vendor module weekly | DAU on /vendors routes |
| Contribution | 25% of designers submit reviews | Review submissions / active designers |

---

*Development Specification v1.0 | 8-Week Implementation | January 2026*
