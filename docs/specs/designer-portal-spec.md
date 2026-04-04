# Designer Portal — Typography-First Interface Spec

## Implementation Reference for Claude Code

**Version**: 1.0  
**Date**: March 2026  
**Status**: Ready for Implementation  
**Repo**: `strata` monorepo  
**Package**: `@strata/designer-portal`  
**Stack**: Next.js 15, React 18+, TypeScript, Tailwind CSS, Supabase

---

## 1. Design Philosophy Summary

This spec replaces the conventional "cards-in-panels-in-tabs" interface pattern with a **typography-driven, document-style layout** where information hierarchy is communicated through type weight, size, and color — not containers and borders.

### Five Core Principles

1. **Type Weight Replaces Containers** — No card wrappers. Typographic scale defines hierarchy.
2. **Horizontal Rules Replace Tabs** — Strata Mark dividers separate content zones. One continuous page per view.
3. **The Document Metaphor** — Every screen reads like a design brief, not a CRM record.
4. **Whitespace as Architecture** — Generous spacing creates visual "rooms" for related content.
5. **Progressive Weight, Not Progressive Disclosure** — Show everything; vary typographic emphasis.

### Anti-Patterns to Avoid

- No `box-shadow` on content cards (only on the outermost page frame when needed)
- No colored badge pills for status (use type weight and color instead)
- No tabbed navigation within pages
- No Kanban board layouts
- No floating action buttons
- No step-by-step wizard modals
- No side panels or slide-out drawers
- No widget grids with drag-and-drop customization

---

## 2. Design Tokens

### 2.1 Color System

All colors defined as CSS custom properties and Tailwind config extensions.

```css
:root {
  /* — Primary Palette — */
  --color-off-white: #FAF7F2;
  --color-pearl: #E5E2DD;
  --color-clay: #C4A57B;
  --color-aged-oak: #8B7355;
  --color-mocha: #5C4A3C;
  --color-charcoal: #2C2926;

  /* — Extended Palette — */
  --color-sage: #A8B5A0;
  --color-dusty-blue: #8B9CAD;
  --color-terracotta: #D4A090;
  --color-golden-hour: #E8C547;

  /* — Semantic Assignments — */
  --bg-primary: var(--color-off-white);
  --bg-surface: #FFFFFF;
  --bg-hover: rgba(196, 165, 123, 0.06);

  --text-primary: var(--color-charcoal);
  --text-body: var(--color-mocha);
  --text-muted: var(--color-aged-oak);
  --text-subtle: var(--color-pearl);

  --accent-primary: var(--color-clay);
  --accent-hover: var(--color-aged-oak);
  --accent-active: var(--color-charcoal);

  --border-default: var(--color-pearl);
  --border-subtle: rgba(229, 226, 221, 0.6);

  /* — Functional Colors — */
  --color-success: #7A9B76;
  --color-warning: #D4A574;
  --color-error: #C77B6E;
  --color-info: #8B9CAD;
}
```

#### Tailwind Config Extension

```typescript
// tailwind.config.ts — extend theme.colors
const colors = {
  patina: {
    'off-white': '#FAF7F2',
    pearl: '#E5E2DD',
    clay: '#C4A57B',
    'aged-oak': '#8B7355',
    mocha: '#5C4A3C',
    charcoal: '#2C2926',
    sage: '#A8B5A0',
    'dusty-blue': '#8B9CAD',
    terracotta: '#D4A090',
    'golden-hour': '#E8C547',
  }
}
```

### 2.2 Typography System

Three type voices. Every UI element maps to exactly one.

#### Font Stack

```css
:root {
  --font-display: 'Playfair Display', Georgia, 'Times New Roman', serif;
  --font-body: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-mono: 'DM Mono', 'SF Mono', 'Fira Code', monospace;
}
```

#### Font Loading

Load via `next/font` for optimal performance:

```typescript
// app/fonts.ts
import { Playfair_Display, Inter, DM_Mono } from 'next/font/google';

export const playfair = Playfair_Display({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  style: ['normal', 'italic'],
  variable: '--font-display',
  display: 'swap',
});

export const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-body',
  display: 'swap',
});

export const dmMono = DM_Mono({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  variable: '--font-mono',
  display: 'swap',
});
```

#### Complete Type Scale

| Token Name | Font | Weight | Size | Line Height | Letter Spacing | Color | Use |
|---|---|---|---|---|---|---|---|
| `page-title` | Playfair Display | 400 | `clamp(2rem, 4vw, 3.5rem)` | 1.15 | -0.02em | `--text-primary` | Page greetings, main headings |
| `section-head` | Playfair Display | 400 | `clamp(1.5rem, 3vw, 2rem)` | 1.3 | -0.02em | `--text-primary` | Section headings within pages |
| `item-name` | Playfair Display | 500 | `1.3rem` | 1.4 | -0.02em | `--text-primary` | Client names, project names in detail views |
| `data-large` | Playfair Display | 700 | `2.4rem` | 1.0 | -0.02em | `--text-primary` | Metric numbers, lead scores |
| `data-unit` | Inter | 400 | `0.85rem` | 1.0 | 0 | `--text-muted` | Unit labels next to data-large ("match", "$", "h") |
| `body` | Inter | 400 | `1rem` | 1.7 | 0 | `--text-body` | Descriptions, narratives, detail text |
| `body-small` | Inter | 400 | `0.9rem` | 1.6 | 0 | `--text-body` | Secondary descriptions, detail values |
| `label` | Inter | 500 | `0.95rem` | 1.5 | 0 | `--text-primary` | List item names (client names in lead list) |
| `label-secondary` | Inter | 400 | `0.82rem` | 1.5 | 0 | `--text-muted` | Supporting info below list item names |
| `meta` | DM Mono | 400 | `0.72rem` | 1.5 | 0.06em | `--text-muted` | Timestamps, breadcrumbs, section labels, uppercase |
| `meta-small` | DM Mono | 400 | `0.62rem` | 1.5 | 0.08em | `--text-muted` | Score labels, fine-print metadata, uppercase |
| `btn-text` | Inter | 500 | `0.85rem` | 1.0 | 0.01em | varies | Button labels |

#### CSS Implementation

```css
/* Typography utility classes — apply via className or @apply */
.type-page-title {
  font-family: var(--font-display);
  font-weight: 400;
  font-size: clamp(2rem, 4vw, 3.5rem);
  line-height: 1.15;
  letter-spacing: -0.02em;
  color: var(--text-primary);
}

.type-section-head {
  font-family: var(--font-display);
  font-weight: 400;
  font-size: clamp(1.5rem, 3vw, 2rem);
  line-height: 1.3;
  letter-spacing: -0.02em;
  color: var(--text-primary);
}

.type-item-name {
  font-family: var(--font-display);
  font-weight: 500;
  font-size: 1.3rem;
  line-height: 1.4;
  letter-spacing: -0.02em;
  color: var(--text-primary);
}

.type-data-large {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 2.4rem;
  line-height: 1.0;
  letter-spacing: -0.02em;
  color: var(--text-primary);
}

.type-body {
  font-family: var(--font-body);
  font-weight: 400;
  font-size: 1rem;
  line-height: 1.7;
  color: var(--text-body);
}

.type-label {
  font-family: var(--font-body);
  font-weight: 500;
  font-size: 0.95rem;
  line-height: 1.5;
  color: var(--text-primary);
}

.type-meta {
  font-family: var(--font-mono);
  font-weight: 400;
  font-size: 0.72rem;
  line-height: 1.5;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-muted);
}
```

### 2.3 Spacing Scale

```css
:root {
  --space-1: 0.25rem;   /* 4px */
  --space-2: 0.5rem;    /* 8px */
  --space-3: 0.75rem;   /* 12px */
  --space-4: 1rem;      /* 16px */
  --space-6: 1.5rem;    /* 24px */
  --space-8: 2rem;      /* 32px */
  --space-10: 2.5rem;   /* 40px */
  --space-12: 3rem;     /* 48px */
  --space-16: 4rem;     /* 64px */
  --space-20: 5rem;     /* 80px */
  --space-24: 6rem;     /* 96px */
}
```

### 2.4 Animation Tokens

```css
:root {
  --ease-default: cubic-bezier(0.4, 0, 0.2, 1);
  --ease-spring: cubic-bezier(0.175, 0.885, 0.32, 1.275);
  --duration-fast: 150ms;
  --duration-normal: 300ms;
  --duration-slow: 500ms;
}
```

### 2.5 Border System

The interface uses **only hairline dividers** — never box borders around content.

```css
/* The only border patterns allowed */
.divider       { border-bottom: 1px solid var(--border-default); }
.divider-subtle { border-bottom: 1px solid var(--border-subtle); }

/* Vertical divider (for side-by-side columns) */
.divider-vertical { border-left: 1px solid var(--border-default); }
```

---

## 3. Component Specifications

### 3.1 Strata Mark

The brand signature divider. Used between major sections.

```typescript
// components/ui/strata-mark.tsx
interface StrataMarkProps {
  variant: 'full' | 'mini' | 'micro';
}
```

**Full** — Between major page sections:
```html
<div class="flex flex-col gap-1.5 py-12">
  <div class="h-[2px] w-full bg-patina-mocha rounded-full" />
  <div class="h-[2px] w-[80%] bg-patina-clay rounded-full opacity-70" />
  <div class="h-[2px] w-[60%] bg-patina-clay rounded-full opacity-35" />
</div>
```

**Mini** — Between subsections:
```html
<div class="flex flex-col gap-1 py-8">
  <div class="h-[1.5px] w-[60px] bg-patina-mocha rounded-full" />
  <div class="h-[1.5px] w-[48px] bg-patina-clay rounded-full opacity-70" />
  <div class="h-[1.5px] w-[36px] bg-patina-clay rounded-full opacity-35" />
</div>
```

**Micro** — Single line for inline separation (just a hairline):
```html
<div class="h-px bg-patina-pearl" />
```

### 3.2 Page Layout Shell

Every page in the portal shares one layout structure. No sidebar navigation chrome.

```typescript
// app/(portal)/layout.tsx
interface PortalLayoutProps {
  children: React.ReactNode;
}
```

**Structure:**
```
┌────────────────────────────────────────────────────┐
│  Top Bar: Logo (left) · Nav Zone (center) · User   │
│           Work | Clients | Studio                   │
├────────────────────────────────────────────────────┤
│                                                      │
│   max-width: 1100px, centered                        │
│   padding: 0 clamp(1.5rem, 5vw, 4rem)               │
│                                                      │
│   [Page Content — single scrolling column]           │
│                                                      │
└────────────────────────────────────────────────────┘
```

**Top Bar Spec:**
- Height: `64px`
- Background: `var(--bg-surface)` (white)
- Bottom border: `1px solid var(--border-default)`
- Logo: "PATINA" in Playfair Display Medium, `letter-spacing: 0.2em`, uppercase, `font-size: 0.9rem`
- Nav items: Inter 400, `0.85rem`, `--text-muted` default, `--text-primary` active
- Active indicator: underline `2px solid var(--accent-primary)`, not a background fill
- User area: Initials circle (`32px`, `bg-patina-pearl`, `text-patina-mocha`) + name in `type-meta`

**Content Container:**
- `max-width: 1100px`
- `margin: 0 auto`
- `padding: 0 clamp(1.5rem, 5vw, 4rem)`
- Background: `var(--bg-primary)` (off-white)

### 3.3 Navigation — Three Zones

Replace the eight-tab navigation with three zones.

```typescript
// Navigation structure
const navigation = {
  work: {
    label: 'Work',
    items: [
      { label: 'Leads', href: '/portal/leads', icon: null },
      { label: 'Active Projects', href: '/portal/projects' },
      { label: 'Room Viewer', href: '/portal/rooms' },
      { label: 'Proposals', href: '/portal/proposals' },
    ]
  },
  clients: {
    label: 'Clients',
    items: [
      { label: 'Messages', href: '/portal/messages' },
      { label: 'Client Directory', href: '/portal/clients' },
      { label: 'Reviews & Feedback', href: '/portal/reviews' },
    ]
  },
  studio: {
    label: 'Studio',
    items: [
      { label: 'Earnings', href: '/portal/earnings' },
      { label: 'Portfolio', href: '/portal/portfolio' },
      { label: 'Resources', href: '/portal/resources' },
      { label: 'Settings', href: '/portal/settings' },
    ]
  }
};
```

**Desktop:** Three text links in center of top bar. Clicking a zone navigates to its first item. Sub-items appear as a horizontal list below the top bar ONLY when that zone is active.

**Mobile bottom tab bar:** Four tabs — Work, Clients, Studio, Rooms (quick access). Tab labels in `type-meta` style (DM Mono, uppercase, 10px). Active state: `--accent-primary` color. Inactive: `--text-muted`.

### 3.4 Dashboard Page

Route: `/portal` (default redirect from `/portal/dashboard`)

**Layout (top to bottom, single column):**

```
1. Greeting Block
   ├── Left: "Good morning, {firstName}" — type-page-title
   │         The "firstName" in Playfair italic, color: --color-aged-oak
   └── Right: Date — type-meta ("Tuesday, March 25, 2026")

2. Metrics Row
   ├── 4 columns on desktop, 2x2 on mobile
   ├── Separated by vertical hairline dividers (not card borders)
   ├── Each metric:
   │   ├── Label — type-meta
   │   ├── Value — type-data-large
   │   └── Change — body-small, color-sage (up) or color-terracotta (down)
   └── Bottom border: hairline divider

3. Two-Column Content Area (desktop), stacked (mobile)
   ├── Left Column (wider, ~58%): "Leads waiting for you"
   │   ├── Section heading — type-section-head, Playfair 400
   │   ├── Bottom border on heading
   │   └── Lead list items (see Lead List Item spec below)
   │
   └── Right Column (~42%): "Active work"
       ├── Section heading — type-section-head
       └── Project list items (see Project List Item spec below)
```

### 3.5 Lead List Item

A single row in the lead inbox or dashboard lead list. **No card wrapper. No shadow. No border-radius container.**

```
┌─────────────────────────────────────────── hairline bottom border ───┐
│                                                                       │
│  Sarah & James Whitfield                                    87       │
│  Living room redesign · Wauwatosa · $15k–$25k · 18h       Match     │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

**Component:**
```typescript
// components/leads/lead-list-item.tsx
interface LeadListItemProps {
  id: string;
  clientName: string;          // type-label (Inter 500, 0.95rem, charcoal)
  projectType: string;
  location: string;
  budgetRange: string;
  responseDeadline: string;    // formatted relative time
  matchScore: number;          // type-data-large (Playfair 700, 2.4rem)
  onClick: () => void;
}
```

**Layout:**
- `display: grid; grid-template-columns: 1fr auto; gap: 1rem;`
- Padding: `1.25rem 0`
- Border: `border-bottom: 1px solid var(--border-subtle)`
- Hover state: `background: var(--bg-hover)` with `transition: var(--duration-fast)`

**Left side:**
- Client name: `type-label`
- Detail line: `type-label-secondary` — project type · location · budget · deadline, separated by ` · `

**Right side:**
- Score number: `type-data-large`, color `--accent-primary`
- Score label: `type-meta-small` ("MATCH"), aligned right

**Hover actions (desktop):** On hover, reveal "Accept" and "Pass" text buttons at the right edge, pushing the score left. Use `opacity: 0 → 1` transition, `duration-fast`.

**Mobile swipe:** Right swipe reveals accept action (green-sage background). Left swipe reveals pass action (terracotta background).

### 3.6 Project List Item

```typescript
// components/projects/project-list-item.tsx
interface ProjectListItemProps {
  id: string;
  name: string;               // type-label
  phase: string;              // type-meta (uppercase)
  progress: number;           // 0-100, renders as thin bar
  onClick: () => void;
}
```

**Layout:**
- Padding: `1.1rem 0`
- Border: `border-bottom: 1px solid var(--border-subtle)`
- Top row: `display: flex; justify-content: space-between; align-items: baseline;`
- Name: `type-label` (left)
- Phase: `type-meta` (right, uppercase)
- Progress bar: Full-width, `height: 3px`, bg `--border-default`, fill `--accent-primary`, `border-radius: 2px`, `margin-top: 0.6rem`

### 3.7 Lead Brief Page (Lead Detail)

Route: `/portal/leads/[id]`

This is the most important page to get right. It should read like a design brief, not a database record.

**Layout (top to bottom):**

```
1. Breadcrumb
   "Leads → Sarah & James Whitfield" — type-meta
   "Leads" is a link in --accent-primary

2. Hero Block
   ├── Left:
   │   ├── Client name — type-page-title (Playfair 400, 2rem)
   │   └── Meta line — type-label-secondary
   │       "Living room redesign · Wauwatosa, WI"
   │       "Budget: $15,000 – $25,000 · Timeline: 3 months"
   └── Right: Match Score Circle
       ├── Circle: 90px, border 3px solid --accent-primary, border-radius 50%
       ├── Number inside: type-data-large
       └── Label below number: type-meta-small ("MATCH")

   Bottom border: hairline divider

3. Two-Column Detail (desktop), stacked (mobile)
   ├── Left Column:
   │   ├── Field Group: "Style Profile" (type-meta label)
   │   │   └── Tag pills: Inter 500, 0.78rem, --text-body
   │   │       bg: --bg-primary, border: 1px solid --border-default
   │   │       border-radius: 2px, padding: 0.3rem 0.85rem
   │   │
   │   ├── Field Group: "What they're looking for" (type-meta label)
   │   │   └── Narrative paragraph — type-body, max-width: 640px
   │   │
   │   ├── Field Group: "Must-haves" (type-meta label)
   │   │   └── Inline list — type-body-small, items separated by " · "
   │   │
   │   └── Field Group: "Inspiration" (type-meta label)
   │       └── Client quote — type-body, italic, color --aged-oak
   │
   └── Right Column:
       ├── Field Group: "Room Scan" (type-meta label)
       │   └── Preview container: bg --pearl, border-radius 8px
       │       height: 200px, centered text "3D Room Preview"
       │       Hatched overlay pattern (45deg, subtle clay tint)
       │       Clickable: navigates to /portal/rooms/[scanId]
       │
       └── Field Group: "Room Details" (type-meta label)
           └── Detail rows:
               Key (type-meta, 110px wide) | Value (type-body-small)
               "DIMENSIONS"               | "18' × 14' — 252 sq ft"
               "WINDOWS"                  | "Bay (south), double-hung (west)"
               "FLOORING"                 | "Original red oak hardwood"
               "LIGHT"                    | "Strong south, warm afternoon"
               "CEILING"                  | "8 ft, smooth finish"

4. Action Bar
   ├── Top border: hairline divider
   ├── Padding: 2rem 0 (top)
   └── Buttons (left-aligned, flex row, gap 1rem):
       ├── Primary: "Accept & Introduce Yourself"
       │   bg: --text-primary, color: --bg-primary
       │   font: btn-text, padding: 0.7rem 1.6rem, border-radius: 3px
       ├── Secondary: "Request More Context"
       │   bg: transparent, border: 1px solid --border-default
       │   color: --text-primary, same padding/radius
       └── Ghost: "Pass on This Lead"
           bg: transparent, no border, color: --text-muted
           padding: 0.7rem 1rem
```

### 3.8 Field Group Pattern

Reusable pattern across all detail views.

```typescript
// components/ui/field-group.tsx
interface FieldGroupProps {
  label: string;        // rendered as type-meta
  children: ReactNode;  // the field value content
}
```

**Layout:**
- `margin-bottom: 2rem`
- Label: `type-meta`, `margin-bottom: 0.5rem`
- Content: determined by children

### 3.9 Detail Row Pattern

Key-value pairs used in room details, project specs, etc.

```typescript
// components/ui/detail-row.tsx
interface DetailRowProps {
  label: string;  // type-meta, fixed width 110px
  value: string;  // type-body-small
}
```

**Layout:**
- `display: grid; grid-template-columns: 110px 1fr; gap: 0.75rem;`
- Padding: `0.35rem 0`

### 3.10 Metric Block

Used on dashboard and earnings page.

```typescript
// components/ui/metric-block.tsx
interface MetricBlockProps {
  label: string;            // type-meta
  value: string | number;   // type-data-large
  change?: string;          // type-body-small
  trend?: 'up' | 'down' | 'neutral';
}
```

**Layout:**
- Vertical stack
- Label: `type-meta`, `margin-bottom: 0.5rem`
- Value: `type-data-large`, `margin-bottom: 0.35rem`
- Change: `body-small`, color `--color-sage` (up), `--color-terracotta` (down), `--text-muted` (neutral)

**In row context:**
- Separated by vertical hairline dividers (`border-left: 1px solid var(--border-default)`)
- First item has no left border
- `padding-right: 2rem` on each, `padding-left: 2rem` on all but first

### 3.11 Button System

Three tiers only. No icon-only buttons in primary flows.

```typescript
// components/ui/button.tsx
interface ButtonProps {
  variant: 'primary' | 'secondary' | 'ghost';
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}
```

| Variant | Background | Border | Text Color | Hover |
|---|---|---|---|---|
| `primary` | `--text-primary` (charcoal) | none | `--bg-primary` (off-white) | `--color-mocha` bg |
| `secondary` | transparent | `1px solid --border-default` | `--text-primary` | `--bg-hover` bg |
| `ghost` | transparent | none | `--text-muted` | `--text-primary` color |

**Shared styles:** `font: btn-text`, `padding: 0.7rem 1.6rem`, `border-radius: 3px`, `cursor: pointer`, `transition: all var(--duration-fast) var(--ease-default)`

### 3.12 Style Tag

Used for style preferences, project tags.

```html
<span class="type-btn-text text-patina-mocha px-3.5 py-1.5 bg-patina-off-white border border-patina-pearl rounded-sm">
  Warm Minimalist
</span>
```

Font: Inter 500, `0.78rem`. No colored backgrounds — only off-white with pearl border.

### 3.13 Progress Bar

Minimal thin-line progress indicator.

```html
<div class="h-[3px] w-full bg-patina-pearl rounded-full overflow-hidden">
  <div class="h-full bg-patina-clay rounded-full transition-all duration-300"
       style="width: {progress}%" />
</div>
```

### 3.14 Score Circle

Used on lead brief hero to display match score.

```html
<div class="w-[90px] h-[90px] rounded-full border-[3px] border-patina-clay flex flex-col items-center justify-center">
  <span class="type-data-large">{score}</span>
  <span class="type-meta-small">Match</span>
</div>
```

---

## 4. Page Specifications

### 4.1 Routes

```
/portal                        → Dashboard (redirect from /)
/portal/leads                  → Lead Inbox
/portal/leads/[id]             → Lead Brief (detail view)
/portal/projects               → Active Projects (timeline view)
/portal/projects/[id]          → Project Detail
/portal/rooms                  → Recent Room Scans
/portal/rooms/[id]             → 3D Room Viewer (full-screen)
/portal/proposals              → Proposals (draft + sent)
/portal/proposals/[id]         → Proposal Document (editor)
/portal/messages               → Message Center
/portal/clients                → Client Directory
/portal/clients/[id]           → Client Profile
/portal/reviews                → Reviews & Feedback
/portal/earnings               → Earnings Dashboard
/portal/portfolio              → Portfolio Showcase
/portal/resources              → Help & Resources
/portal/settings               → Account Settings
```

### 4.2 Lead Inbox Page

Route: `/portal/leads`

```
1. Page Header
   ├── "Leads" — type-section-head
   └── Below: filter row (type-meta links, inline)
       "All (12) · New (3) · Saved (2) · Archived"
       Active filter: --text-primary, underline
       Inactive: --text-muted, no underline

2. Lead List
   └── LeadListItem components, stacked vertically
       Sorted by match score descending (default)
       No pagination initially — load all leads (max ~50)

3. Empty State (if no leads)
   └── Centered, type-section-head italic:
       "No new leads right now. They'll appear here when clients match your style."
```

### 4.3 Active Projects Page

Route: `/portal/projects`

**NOT a Kanban board.** This is a vertical timeline grouped by project.

```
1. Page Header
   "Active Projects" — type-section-head

2. Project List
   For each project:
   ├── Project Name — type-item-name (Playfair 500, 1.3rem)
   ├── Client + Phase — type-meta, inline ("CHEN RESIDENCE · PROCUREMENT")
   ├── Progress bar (thin, 3px)
   ├── Hairline divider
   │
   └── [Expandable on click] Phase Timeline:
       Vertical list of phases with status:
       ├── Active phase: type-label (Inter 500, --text-primary)
       ├── Completed phases: type-label-secondary (Inter 400, --text-muted)
       ├── Upcoming phases: type-label-secondary (Inter 300, --text-muted, lighter)
       └── Thin vertical progress line running alongside
           (3px wide, --accent-primary for completed portion)
```

**Expansion behavior:** Click project heading → content expands inline (300ms ease). All other projects remain visible. Click again or press Escape → collapses.

### 4.4 Proposal Builder

Route: `/portal/proposals/[id]`

**NOT a step-by-step wizard.** This is a document editor — one continuous scrolling page.

```
Proposal Document Layout:
├── Title — type-page-title, editable contentEditable
├── Client name + date — type-meta
├── Strata Mark (mini)
│
├── Section: "Design Vision" — type-section-head
│   └── Rich text area — type-body, WYSIWYG with minimal toolbar
│
├── Section: "Mood Board" — type-section-head
│   └── Image grid — drag-drop upload area
│
├── Section: "Space Plan" — type-section-head
│   └── Embedded room viewer screenshot / imported image
│
├── Section: "Product Selections" — type-section-head
│   └── For each product:
│       ├── Product name — type-label
│       ├── Maker + provenance — type-label-secondary, italic
│       ├── Price — type-data-large (smaller variant, 1.5rem)
│       └── Hairline divider
│
├── Section: "Investment" — type-section-head
│   └── Line items with totals
│       Key-value rows using detail-row pattern
│       Total line: type-data-large
│
├── Section: "Timeline" — type-section-head
│   └── Phase list with dates (detail-row pattern)
│
└── Section: "Terms" — type-section-head
    └── type-body-small, --text-muted
```

**What the client sees** should be identical in layout to the edit view. The edit mode IS the preview — same typography, same spacing. Editing controls (toolbar, drag handles) appear only on hover/focus.

### 4.5 Earnings Dashboard

Route: `/portal/earnings`

```
1. Header
   ├── "Earnings" — type-section-head
   └── Period selector — type-meta links ("This Month · Quarter · Year · All Time")

2. Top Metrics (same pattern as dashboard)
   ├── Total Earnings — type-data-large
   ├── Commissions — type-data-large
   ├── Service Fees — type-data-large
   └── Pending — type-data-large

3. Strata Mark (mini)

4. Recent Transactions
   └── List items:
       ├── Description — type-label
       ├── Date — type-meta
       ├── Amount — Playfair 600, right-aligned
       └── Hairline divider
```

---

## 5. Interaction Patterns

### 5.1 Hover-to-Reveal Actions

**Desktop only.** List items (leads, projects, transactions) show action buttons on hover.

```css
.list-item .hover-actions {
  opacity: 0;
  transition: opacity var(--duration-fast) var(--ease-default);
}
.list-item:hover .hover-actions {
  opacity: 1;
}
```

Actions appear at the right edge, replacing the score/metadata.

### 5.2 Inline Expansion

For project phases, FAQ sections, and any collapsible content.

```css
.expandable-content {
  max-height: 0;
  overflow: hidden;
  transition: max-height var(--duration-normal) var(--ease-default);
}
.expandable-content.open {
  max-height: 1000px; /* use JS for exact height */
}
```

Use `framer-motion` `AnimatePresence` for smoother content-aware animations when available.

### 5.3 Typographic State Changes

Status is communicated through type weight and color, NOT colored badges.

| State | Font Weight | Color |
|---|---|---|
| Active / Current | Inter 500 | `--text-primary` |
| Default | Inter 400 | `--text-body` |
| Completed / Past | Inter 400 | `--text-muted` |
| Archived / Disabled | Inter 300 | `--color-pearl` |

### 5.4 Page Transitions

Simple opacity fade between routes. No slide animations.

```css
.page-enter { opacity: 0; transform: translateY(8px); }
.page-enter-active {
  opacity: 1;
  transform: translateY(0);
  transition: all var(--duration-normal) var(--ease-default);
}
```

### 5.5 Loading States

- Use the Strata Mark (mini) as a subtle loading indicator — animate the three lines with a gentle pulse (opacity oscillation, staggered by 100ms per line)
- Never show skeleton cards or shimmer boxes (those imply a card-based layout)

---

## 6. Responsive Breakpoints

```css
/* Mobile first */
@media (min-width: 640px)  { /* sm — phone landscape */ }
@media (min-width: 768px)  { /* md — tablet */ }
@media (min-width: 1024px) { /* lg — desktop */ }
@media (min-width: 1280px) { /* xl — wide desktop */ }
```

### Key Layout Changes

| Element | Mobile (<768px) | Desktop (≥768px) |
|---|---|---|
| Top nav | Hidden; bottom tab bar instead | Visible, centered |
| Dashboard metrics | 2×2 grid | 4-column row |
| Dashboard content | Stacked (leads, then projects) | Two-column (58% / 42%) |
| Lead brief columns | Stacked | Two-column (1fr 1fr) |
| Lead brief score circle | Above content, left-aligned | Right side of hero |
| Section headings | `clamp` handles sizing | `clamp` handles sizing |
| Content max-width | Full bleed with padding | 1100px centered |

### Mobile Bottom Tab Bar

```
┌──────────┬──────────┬──────────┬──────────┐
│   Work   │ Clients  │  Rooms   │  Studio  │
│    ○     │    ○     │    ○     │    ○     │
└──────────┴──────────┴──────────┴──────────┘
```

- Height: `64px` + safe area inset
- Background: `var(--bg-surface)`
- Top border: `1px solid var(--border-default)`
- Labels: `type-meta-small`
- Icons: Simple line icons, 20px, stroke-width 1.5px
- Active: `--accent-primary` for both icon and label
- Inactive: `--text-muted`

---

## 7. Data Requirements

### 7.1 Dashboard API

```typescript
// GET /api/portal/dashboard
interface DashboardData {
  greeting: {
    firstName: string;
    currentDate: string; // ISO
  };
  metrics: {
    newLeads: { value: number; change: string; trend: 'up' | 'down' | 'neutral' };
    activeProjects: { value: number; change: string; trend: 'up' | 'down' | 'neutral' };
    monthRevenue: { value: number; change: string; trend: 'up' | 'down' | 'neutral' };
    avgResponseTime: { value: number; change: string; trend: 'up' | 'down' | 'neutral' };
  };
  recentLeads: LeadSummary[];   // max 5
  activeProjects: ProjectSummary[];  // all active
}
```

### 7.2 Lead Data

```typescript
interface LeadSummary {
  id: string;
  clientName: string;
  projectType: string;
  location: string;
  budgetRange: string;
  responseDeadline: string; // ISO datetime
  matchScore: number;       // 0-100
  status: 'new' | 'saved' | 'accepted' | 'declined' | 'expired';
}

interface LeadDetail extends LeadSummary {
  styleProfile: string[];     // tag names
  description: string;        // narrative
  mustHaves: string[];
  inspirationQuote?: string;
  roomScan?: {
    id: string;
    previewUrl: string;
    dimensions: string;
    windows: string;
    flooring: string;
    lighting: string;
    ceilingHeight: string;
  };
  timeline: string;
  createdAt: string;
}
```

### 7.3 Project Data

```typescript
interface ProjectSummary {
  id: string;
  name: string;
  clientName: string;
  currentPhase: ProjectPhase;
  progress: number;  // 0-100
}

type ProjectPhase =
  | 'consultation'
  | 'concept_development'
  | 'design_refinement'
  | 'procurement'
  | 'installation'
  | 'final_walkthrough';
```

---

## 8. File Structure

```
apps/designer-portal/
├── app/
│   ├── (portal)/
│   │   ├── layout.tsx              # Portal shell with nav
│   │   ├── page.tsx                # Dashboard (default route)
│   │   ├── leads/
│   │   │   ├── page.tsx            # Lead inbox list
│   │   │   └── [id]/
│   │   │       └── page.tsx        # Lead brief detail
│   │   ├── projects/
│   │   │   ├── page.tsx            # Project timeline list
│   │   │   └── [id]/
│   │   │       └── page.tsx        # Project detail
│   │   ├── rooms/
│   │   │   ├── page.tsx            # Room scan list
│   │   │   └── [id]/
│   │   │       └── page.tsx        # 3D viewer (full screen)
│   │   ├── proposals/
│   │   │   ├── page.tsx            # Proposals list
│   │   │   └── [id]/
│   │   │       └── page.tsx        # Proposal document editor
│   │   ├── messages/
│   │   │   └── page.tsx
│   │   ├── clients/
│   │   │   ├── page.tsx
│   │   │   └── [id]/
│   │   │       └── page.tsx
│   │   ├── earnings/
│   │   │   └── page.tsx
│   │   ├── portfolio/
│   │   │   └── page.tsx
│   │   ├── resources/
│   │   │   └── page.tsx
│   │   └── settings/
│   │       └── page.tsx
│   ├── fonts.ts                    # next/font config
│   ├── globals.css                 # CSS tokens + base styles
│   └── layout.tsx                  # Root layout
│
├── components/
│   ├── ui/
│   │   ├── strata-mark.tsx         # Brand divider
│   │   ├── button.tsx              # Primary/secondary/ghost
│   │   ├── field-group.tsx         # Label + content pattern
│   │   ├── detail-row.tsx          # Key-value row
│   │   ├── metric-block.tsx        # Dashboard metric
│   │   ├── score-circle.tsx        # Match score display
│   │   ├── progress-bar.tsx        # Thin line progress
│   │   ├── style-tag.tsx           # Style preference pill
│   │   └── loading-strata.tsx      # Animated strata loading indicator
│   │
│   ├── layout/
│   │   ├── top-bar.tsx             # Nav bar with zone navigation
│   │   ├── mobile-tab-bar.tsx      # Bottom tabs for mobile
│   │   └── page-container.tsx      # Max-width + padding wrapper
│   │
│   ├── leads/
│   │   ├── lead-list-item.tsx
│   │   ├── lead-brief-hero.tsx
│   │   ├── lead-brief-columns.tsx
│   │   └── lead-action-bar.tsx
│   │
│   ├── projects/
│   │   ├── project-list-item.tsx
│   │   ├── project-phase-timeline.tsx
│   │   └── expandable-phase.tsx
│   │
│   └── proposals/
│       ├── proposal-section.tsx
│       ├── product-line-item.tsx
│       └── investment-summary.tsx
│
├── lib/
│   ├── api.ts                      # API client functions
│   ├── types.ts                    # Shared TypeScript interfaces
│   └── utils.ts                    # Formatters (currency, dates, relative time)
│
├── styles/
│   └── tokens.css                  # Design token CSS custom properties
│
├── tailwind.config.ts
├── tsconfig.json
├── package.json
└── next.config.ts
```

---

## 9. Implementation Phases

### Phase 1: Foundation (Sprint 1)

**Goal:** Design system tokens + layout shell + dashboard page

- [ ] Set up `apps/designer-portal/` in strata monorepo
- [ ] Configure `next/font` with Playfair Display, Inter, DM Mono
- [ ] Create `tokens.css` with all CSS custom properties
- [ ] Extend Tailwind config with Patina color palette
- [ ] Build `StrataMark` component (full, mini, micro variants)
- [ ] Build `TopBar` component with three-zone navigation
- [ ] Build `MobileTabBar` component
- [ ] Build `PageContainer` wrapper
- [ ] Build `MetricBlock` component
- [ ] Build `LeadListItem` component
- [ ] Build `ProjectListItem` component with `ProgressBar`
- [ ] Assemble Dashboard page with mock data
- [ ] Verify responsive behavior at all breakpoints

### Phase 2: Lead Flow (Sprint 2)

**Goal:** Lead inbox + lead brief detail page

- [ ] Build Lead Inbox page with filter row
- [ ] Build `ScoreCircle` component
- [ ] Build `FieldGroup` + `DetailRow` components
- [ ] Build `StyleTag` component
- [ ] Build `Button` component (all three variants)
- [ ] Build Lead Brief page with all sections
- [ ] Build Room Scan preview block with hatched pattern
- [ ] Build `LeadActionBar` with accept/request/pass
- [ ] Wire to Supabase for real lead data
- [ ] Implement hover-to-reveal actions on desktop
- [ ] Implement swipe actions on mobile lead items

### Phase 3: Project Management (Sprint 3)

**Goal:** Project timeline + project detail

- [ ] Build Active Projects page (vertical timeline)
- [ ] Build `ExpandablePhase` with inline expansion animation
- [ ] Build `ProjectPhaseTimeline` component
- [ ] Build Project Detail page
- [ ] Wire to Supabase for real project data

### Phase 4: Proposals & Earnings (Sprint 4)

**Goal:** Proposal editor + earnings dashboard

- [ ] Build Proposal document editor (contentEditable sections)
- [ ] Build `ProposalSection` reusable component
- [ ] Build `ProductLineItem` for product selections
- [ ] Build `InvestmentSummary` for pricing
- [ ] Build Earnings page with metrics + transaction list
- [ ] Build period selector (type-meta style links)

### Phase 5: Studio & Polish (Sprint 5)

**Goal:** Remaining pages + animations + final QA

- [ ] Build Messages page (simple threaded view)
- [ ] Build Client Directory + Client Profile pages
- [ ] Build Portfolio page
- [ ] Build Settings page
- [ ] Add `LoadingStrata` animated loading indicator
- [ ] Add page transition animations
- [ ] Full responsive QA pass
- [ ] Accessibility audit (WCAG 2.1 AA)
- [ ] Performance audit (Lighthouse > 90)

---

## 10. Quality Checklist

Before marking any page as complete, verify:

- [ ] **No card containers** — information hierarchy achieved through type alone
- [ ] **No box-shadows** on content elements (only on outermost page frame if needed)
- [ ] **No colored badges** — status communicated through font-weight and color
- [ ] **No tabs** within pages — content flows in one continuous scroll
- [ ] **Strata Mark** used as section dividers instead of generic `<hr>`
- [ ] **Three type voices** used consistently (Playfair / Inter / DM Mono)
- [ ] **Max-width 640px** on body text paragraphs
- [ ] **Hairline dividers** only (1px, pearl color)
- [ ] **Actions appear on hover** (desktop) or swipe (mobile) — not persistent
- [ ] **Inline expansion** for detail views — no modals or side panels
- [ ] **Off-white background** (`#FAF7F2`) on page body, white on surface elements
- [ ] **Mobile tab bar** present on screens < 768px
- [ ] **Greeting uses Playfair italic** for the designer's first name

---

*Patina — Where Time Adds Value*

*This spec is the single source of truth for the Designer Portal interface. When in doubt, refer to the design token tables and component specifications above. Every decision should pass one test: would this look at home in the HTML presentation document?*
