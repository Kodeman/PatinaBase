# Patina Help & Guidance System — Engineering Handoff

**Document Type:** Implementation Source of Truth
**Status:** Approved for Build · v1.0
**Last Updated:** April 2026
**Owner:** Kody (Technical Lead) · Leah (Design Authority)
**Audience:** Claude Code · Engineering Team · Content Designers · Future Contributors
**Companion Documents:** Patina Help & Guidance System Presentation (`patina-help-guidance-system.html`), Designer Portal MVP Additions Spec, Project Creation Detailed Screens
**Implementation Target:** Strata monorepo · `apps/designer-portal`, `apps/manufacturer-portal`, `apps/consumer-app`, `apps/admin-portal`

---

## 0. How to Use This Document

This document is the single source of truth for the Patina Help & Guidance System. It defines **what to build**, **how to build it**, **where it lives**, and **how to maintain it**. Treat it as a contract between design intent and implementation.

When Claude Code is asked to implement any help/guidance feature in Patina, this document governs. When in conflict with older docs, this document wins. When this document is silent, escalate to Kody before improvising.

The document is organized by progressive depth: foundational concepts first, then architecture, then components, then operational concerns. Read top-to-bottom for context; jump to a specific section for reference.

### Document conventions

- **MUST / SHOULD / MAY** language follows RFC 2119 — MUST is non-negotiable, SHOULD has documented exceptions, MAY is discretionary.
- **Code blocks** are illustrative TypeScript/TSX in the Strata monorepo's existing patterns. Final implementations may differ for performance or library reasons; semantics must not.
- **`@strata/*`** package references use the existing monorepo namespacing.
- **Surface keys** (e.g., `designer-portal/pipeline/project-list`) are the canonical identifiers used throughout — see Section 6.

---

## 1. System Mission & Non-Negotiables

### 1.1 Mission

Build a help and guidance system that makes Patina feel approachable from the first click and reliable on the thousandth — without ever interrupting the work the user came to do.

### 1.2 Non-negotiables

These are hard constraints. No implementation may violate them.

1. **No blocking modals for onboarding.** The First Project Walkthrough is optional and skippable on every step.
2. **Dismissed means dismissed.** Once a user dismisses a coachmark, tour, or feature announcement, it never appears again unless explicitly re-triggered by the user from Profile settings.
3. **No content hardcoded in components.** All help copy — tooltips, helper text, empty states, articles — lives in the Sanity CMS and is fetched by surface key.
4. **No third-party help widgets.** No Intercom bubble, no Crisp chat, no embedded Zendesk widget. The system is native to Patina.
5. **No new top-level navigation items.** Help integrates into the existing utility bar (`?` icon) and never adds a competing nav primitive.
6. **Quiet by default.** No animated badges on the `?` icon. No notification-style red dots. No auto-opening panels. Help waits to be invoked.
7. **Help content respects the design system.** Same typography (Playfair Display / Inter / DM Mono), same palette (Off-White, Pearl, Clay, Aged Oak, Mocha, Charcoal + Sage/Dusty Blue/Terracotta/Golden Hour accents), same Strata Mark motif. No exceptions for "help-specific UI."
8. **Accessibility is a feature, not a checklist.** Every guidance surface MUST meet WCAG AA, support keyboard navigation, work with screen readers, and respect `prefers-reduced-motion`.

---

## 2. The Five Principles (Implementation Test)

Every PR that touches the guidance system MUST satisfy all five. Reviewers should literally check each one in the PR description.

| # | Principle | The Test |
|---|-----------|----------|
| 1 | **Contextual, not central** | Does this help appear where the question forms, or does it require leaving the workflow? |
| 2 | **Progressive disclosure** | Does this show the minimum first and reveal depth on demand? |
| 3 | **Confidence over completeness** | Does the user feel "I know what to do next" or just "I have more information"? |
| 4 | **Quiet by default** | Does this surface unprompted? If yes, has it earned that right with a strong signal? |
| 5 | **Earn the user's trust** | Can we measure whether this is useful, and remove it if not? |

A new help moment that fails any of these five SHOULD be rejected at design review, before code is written.

---

## 3. The Four-Layer Architecture

The system has four layers. Each handles a different intensity of user need. Together they form a complete net. **Implementation MUST treat these as distinct concerns with separate component sets.** Mixing layer logic (e.g., a tooltip that becomes a coachmark) creates inconsistency.

### Layer 1 · Ambient (always present, never intrusive)

The interface itself. Smart defaults, empty states, microcopy, field labels, structural hierarchy. This layer carries 70% of guidance load.

**Components owned by this layer:**
- `<EmptyState />` — for empty lists, empty filters, empty search results, empty inboxes
- `<FieldHelper />` — the small text beneath a form field
- `<FieldLabel />` — the small caps label above a form field
- `<SmartDefault />` — a wrapper that applies sensible defaults to form fields with audit logging
- `<SectionIntro />` — the optional 1–2 sentence description below a section header

### Layer 2 · Reactive (appears when summoned)

User pulls help toward them. Hover to reveal, click to expand. Never pushes.

**Components owned by this layer:**
- `<Tooltip />` — hover-triggered, 1–2 sentence answers, max 240px wide
- `<InfoIcon />` — generic "?" 14px icon that triggers a tooltip on hover
- `<StrataInfoIcon />` — Patina-specific concept icon (uses Strata Mark glyph)
- `<LearnMore />` — collapsible inline expansion (the "↓ Learn more" pattern)
- `<ContextualHelpPanel />` — slide-out panel triggered by utility bar `?`

### Layer 3 · Proactive (system-initiated, rare)

System reaches out only when it has high signal. Always dismissable forever.

**Components owned by this layer:**
- `<Coachmark />` — single-point spotlight with explanation, dismiss + next
- `<TourController />` — orchestrates multi-step tours (First Project Walkthrough)
- `<FeatureAnnouncementCoachmark />` — single coachmark on a newly shipped feature
- `<WelcomeModal />` — the one moment a modal is allowed: first sign-in

### Layer 4 · Reference (deep dives)

The help center. Searchable articles, video walkthroughs, troubleshooting guides.

**Components owned by this layer:**
- `<HelpArticle />` — renders a Sanity help article with consistent structure
- `<HelpSearch />` — full-text search across articles
- `<VideoPlayer />` — accessible video player with auto-pause, captions
- `<RelatedArticles />` — suggested-next at the bottom of every article

---

## 4. Component Specifications

Every component in this section has a **contract** (props, behavior, accessibility, analytics) that MUST be implemented. Visual specs reference design tokens from `@strata/design-system`. All components live in `@strata/help-system`.

### 4.1 `<Tooltip />`

**Purpose:** Hover-triggered 1–2 sentence answer to a question that would form in 2 seconds.

**Package:** `@strata/help-system/Tooltip`

**Props:**

```typescript
interface TooltipProps {
  /** Surface key identifying the content in Sanity CMS */
  surfaceKey: string;
  /** Position relative to the trigger element */
  position?: 'top' | 'bottom' | 'left' | 'right' | 'auto';
  /** Override the default 200ms hover delay */
  hoverDelayMs?: number;
  /** Maximum width in pixels */
  maxWidth?: number; // default 240
  /** Children = the trigger element (typically <InfoIcon /> or <StrataInfoIcon />) */
  children: React.ReactNode;
  /** Optional override content (if not using CMS — discouraged) */
  fallbackContent?: string;
}
```

**Behavior:**

- MUST appear on `mouseenter` after `hoverDelayMs` (default 200ms)
- MUST disappear on `mouseleave` after 100ms grace period
- MUST close on `Escape` key when focused
- MUST close on click-outside
- MUST be keyboard-accessible — `Tab` to trigger, `Enter` or `Space` to open, `Escape` to close
- MUST respect `prefers-reduced-motion` (no fade animation when set)
- MUST flip position automatically if would overflow viewport
- MUST render in a Portal to escape parent `overflow:hidden`
- MUST NOT block clicks on underlying interface (pointer-events: none on tooltip body)
- MUST fire analytics event `help.tooltip.shown` on display

**Visual spec:**

- Background: `--ch` (Charcoal, #2C2926)
- Text: `--ow` (Off-White)
- Padding: `0.55rem 0.75rem`
- Border-radius: `5px`
- Font: Inter 400, 0.7rem, line-height 1.5
- Box-shadow: `0 8px 24px rgba(0,0,0,0.15)`
- Optional eyebrow label: DM Mono, 0.45rem, --cl (Clay), uppercase, letter-spacing 0.06em
- Arrow: 5px solid triangle pointing to trigger

**Accessibility:**

- `role="tooltip"` on the tooltip element
- `aria-describedby` on the trigger pointing to tooltip ID
- Tooltip content readable by screen reader on focus
- Color contrast Charcoal-on-White meets WCAG AAA

**Analytics:**

```typescript
trackEvent('help.tooltip.shown', { surfaceKey, position, triggerType: 'hover' | 'focus' });
trackEvent('help.tooltip.dismissed', { surfaceKey, durationMs });
```

---

### 4.2 `<InfoIcon />` and `<StrataInfoIcon />`

**Purpose:** Visual affordance that help is available. Click or hover triggers a tooltip.

**Package:** `@strata/help-system/icons`

**Props:**

```typescript
interface InfoIconProps {
  surfaceKey: string;
  size?: 12 | 14 | 16; // default 14
  variant?: 'subtle' | 'standard'; // default subtle
}
```

**The two variants:**

| Component | When to use | Visual |
|-----------|-------------|--------|
| `<InfoIcon />` | General questions — "what does this number mean?" "what's a default value here?" | Small "?" in a 14px circle, Pearl border, Aged Oak text. Becomes Clay on hover. |
| `<StrataInfoIcon />` | **Patina-specific concepts only** — Aesthete Engine, FF&E stages, Strata Mark, Founding Circle, Patina vocabulary | The Strata Mark glyph (three descending horizontal lines) in Clay |

**Critical rule:** The two are NOT interchangeable. The distinction trains users that the Strata icon signals "this is a platform concept worth learning." Mixing them dilutes the meaning of both. Reviewers MUST verify correct usage at PR review.

**Implementation:**

```tsx
// Generic info
<FieldLabel>Aesthete Score <InfoIcon surfaceKey="designer-portal/aesthete/score-meaning" /></FieldLabel>

// Patina concept
<SectionHeading>The Aesthete Engine <StrataInfoIcon surfaceKey="designer-portal/aesthete/engine-overview" /></SectionHeading>
```

---

### 4.3 `<EmptyState />`

**Purpose:** Turn empty screens into onboarding moments. The empty state is the user's first introduction to a feature.

**Package:** `@strata/help-system/EmptyState`

**Props:**

```typescript
interface EmptyStateProps {
  surfaceKey: string;
  /** Optional CTA action — opens form, navigates, or runs a callback */
  primaryAction?: {
    label: string;
    onClick: () => void;
    href?: string;
  };
  /** Optional secondary action — usually "Learn more" linking to help article */
  secondaryAction?: {
    label: string;
    helpArticleKey?: string;
  };
  /** Visual variant — 'enclosed' uses dashed border (default), 'minimal' uses no border */
  variant?: 'enclosed' | 'minimal';
}
```

**Behavior:**

- MUST fetch content from Sanity by `surfaceKey`
- MUST render even if CMS content is missing — falls back to a generic "This is empty" message and logs an error
- MUST be screen-reader friendly with appropriate heading structure
- MUST fire analytics event when displayed and when CTA is clicked

**Visual spec:**

- Container: `padding: 2rem`, `border: 1.5px dashed --pe`, `border-radius: 6px`, `background: rgba(196,165,123,0.02)`
- Icon: Playfair Display 1.8rem, --cl, italic — the icon is typographic (◇ ◉ ▣ ◎), never an emoji or stock illustration
- Heading: Playfair Display 500, 1.05rem
- Description: Inter 400, 0.78rem, --ao, max 380px
- Primary CTA: small button, --ch background, white text
- Secondary action: text link, --cl color

**Content requirements in Sanity:**

```json
{
  "surfaceKey": "designer-portal/pipeline/empty-active",
  "icon": "◇",
  "heading": "Your projects live here",
  "description": "Leads come in from the consumer app. You review, accept, write a proposal, and convert it to an active project — all from this view.",
  "primaryActionLabel": "+ Create a test project",
  "secondaryActionLabel": "Learn how the Pipeline works",
  "secondaryActionArticleKey": "pipeline-overview"
}
```

---

### 4.4 `<FieldHelper />` and `<FieldLabel />`

**Purpose:** The microcopy that anticipates user questions on form fields.

**Package:** `@strata/help-system/fields`

**Props:**

```typescript
interface FieldLabelProps {
  /** Display text */
  children: React.ReactNode;
  /** If true, append required marker (Terracotta asterisk) */
  required?: boolean;
  /** If true, append optional marker (italic "optional") */
  optional?: boolean;
  /** htmlFor passthrough */
  htmlFor?: string;
}

interface FieldHelperProps {
  surfaceKey?: string;     // Preferred — fetches from CMS
  children?: React.ReactNode; // Fallback — inline content
  variant?: 'default' | 'error' | 'success';
}
```

**Rules:**

- Field labels MUST use DM Mono, 0.5rem, uppercase, letter-spacing 0.06em, --ao color
- Required marker MUST be `--te` (Terracotta) asterisk
- Optional marker MUST be italic Inter, 0.7rem, --ao, with no special character
- Helper text MUST be Inter 400, 0.65rem, --ao, line-height 1.5
- Helper text MUST be under 18 words per the Writing Standards
- Helper text MUST NOT repeat the label — it adds new information

**Content patterns (memorize these):**

| Pattern | Example |
|---------|---------|
| Visibility consequence | "Visible to client. Use clear, descriptive language." |
| Example | "Try 'Chen Residence — Living & Dining'" |
| Default + override | "Industry standard 3%. Adjustable." |
| Linked behavior | "Affects FF&E recommendations and color palette." |
| Required reasoning | "Required to send the kickoff invoice." |

---

### 4.5 `<LearnMore />`

**Purpose:** Inline expandable content for concepts that need a paragraph or two. Avoids navigating away.

**Package:** `@strata/help-system/LearnMore`

**Props:**

```typescript
interface LearnMoreProps {
  surfaceKey: string;
  /** Label of the toggle — defaults to "↓ Learn more" */
  label?: string;
  /** Collapsed by default. Set true to start expanded */
  defaultExpanded?: boolean;
}
```

**Behavior:**

- MUST animate height on expand/collapse (respects `prefers-reduced-motion`)
- MUST persist expand state per user per surface key in localStorage (so users who want it expanded keep it expanded)
- MUST close on `Escape` if focus is inside
- MUST fire analytics on expand and on collapse with duration

---

### 4.6 `<ContextualHelpPanel />`

**Purpose:** The slide-out help panel triggered by the utility bar `?` icon. **Context-aware** — knows what page the user is on.

**Package:** `@strata/help-system/HelpPanel`

**Props:**

```typescript
interface ContextualHelpPanelProps {
  /** The current surface key, derived from route + page state */
  currentSurfaceKey: string;
  /** Open state controlled by parent */
  open: boolean;
  onOpenChange: (open: boolean) => void;
}
```

**Behavior:**

- MUST open in 280ms with a slide-from-right animation
- MUST close on click-outside, `Escape`, or close button
- MUST show "Likely answers for this screen" pre-fetched based on `currentSurfaceKey`
- MUST show search input at the bottom for fallback
- MUST NOT take focus away from the underlying page when opened — keyboard focus moves to the panel only on explicit `Tab` from the trigger
- MUST be available from every page in every portal (mounted at app shell level)
- MUST track which articles users open from which contexts (for content optimization)

**Visual spec:**

- Width: 420px on desktop, 100vw on mobile
- Background: White
- Border: 1px solid --pe on left edge
- Box-shadow: --12px 0 40px rgba(0,0,0,0.12) toward the page
- Header: Project name (Playfair 500, 0.92rem) + close button
- Article items: hover state, Clay accent on hover

**Content fetching:**

```typescript
async function getContextualHelp(surfaceKey: string): Promise<HelpArticle[]> {
  // 1. Fetch articles tagged with exact surfaceKey
  // 2. Fetch articles tagged with parent surfaceKey (e.g., 'designer-portal/pipeline')
  // 3. Fetch articles tagged with portal-level surfaceKey (e.g., 'designer-portal')
  // 4. Sort by relevance score and recency
  // 5. Return top 5 articles
}
```

---

### 4.7 `<Coachmark />` and `<TourController />`

**Purpose:** Proactive, one-time guidance for first-time users and new feature announcements.

**Package:** `@strata/help-system/coachmarks`

**Coachmark Props:**

```typescript
interface CoachmarkProps {
  surfaceKey: string;
  /** CSS selector or ref for the element to spotlight */
  target: string | React.RefObject<HTMLElement>;
  /** Position relative to target */
  position?: 'top' | 'bottom' | 'left' | 'right';
  /** Tour step info (omit for single feature announcements) */
  step?: { current: number; total: number };
  /** Callbacks */
  onNext?: () => void;
  onSkip?: () => void;
  onDismiss?: () => void;
}
```

**TourController Props:**

```typescript
interface TourControllerProps {
  tourKey: string; // e.g., 'first-project-walkthrough'
  steps: CoachmarkStep[];
  /** Trigger conditions */
  triggerWhen: 'first-signin' | 'manual' | 'after-event';
  triggerEvent?: string;
  /** Callbacks */
  onComplete?: () => void;
  onAbandon?: (atStep: number) => void;
}

interface CoachmarkStep {
  surfaceKey: string;
  target: string | (() => HTMLElement | null);
  position?: 'top' | 'bottom' | 'left' | 'right';
  /** If true, advance only when user performs the implied action */
  advanceOnAction?: { eventName: string };
  /** If true, wait for navigation to occur before continuing */
  waitForRoute?: string;
}
```

**Critical rules:**

1. **One-shot per user per surface.** Once dismissed or completed, MUST NOT re-show. State persisted in user profile, not localStorage (so it survives device changes).
2. **Maximum 5 coachmarks per tour.** Hard cap. If you need more, the underlying flow is broken — fix the flow.
3. **Maximum 1 coachmark per feature announcement.** No chained feature tours after the initial onboarding.
4. **"Skip tour" always visible.** Never hidden behind a menu.
5. **Dismiss is permanent.** Users who skipped can re-trigger from Profile → "Show me around again" — but the system never re-suggests it.
6. **Never blocks the underlying interface.** Click-through on the spotlighted element MUST work. The coachmark is informational, not modal.

**Tracking dismiss vs. complete:**

```typescript
// Completed = user clicked through to the last step
trackEvent('help.tour.completed', { tourKey, durationMs, stepsViewed });

// Abandoned = user clicked "Skip tour" or closed the browser
trackEvent('help.tour.abandoned', { tourKey, atStep, totalSteps });

// Dismissed individual coachmark (no tour)
trackEvent('help.coachmark.dismissed', { surfaceKey, viewedMs });
```

---

### 4.8 `<WelcomeModal />`

**Purpose:** The single allowed modal in the system — shown on first sign-in only. Offers the tour or "jump in."

**Package:** `@strata/help-system/WelcomeModal`

**Critical rules:**

- MUST show only on first sign-in (track `first_signin_at` on user record)
- MUST have exactly two CTAs: "Take the tour" and "Jump in"
- MUST close on Escape or backdrop click (treated as "Jump in")
- MUST NOT show feature announcements, marketing copy, or upsells — this is for orientation only
- MUST be re-triggerable from Profile → "Show me around"

---

### 4.9 `<HelpArticle />`

**Purpose:** Render a Sanity help article with consistent structure.

**Package:** `@strata/help-system/HelpArticle`

**Article structure (enforced by Sanity schema):**

1. **Eyebrow** — DM Mono, the portal/section the article belongs to (e.g., "Help · FF&E Procurement")
2. **Title** — The question stated plainly (Playfair 500, 1.4rem)
3. **One-sentence answer** — Italic, --ao, immediately after the title
4. **Body** — Up to 600 words, supports headings, lists, inline images, code-style boxes
5. **Visual examples** — Screenshots or diagrams where applicable
6. **Related articles** — 3–5 auto-suggested from same surface area
7. **Metadata** — Reading time, last updated date, thumbs-up/down feedback

**Rules:**

- MUST stay under 600 words (enforced in Sanity preview)
- MUST be reviewed by Leah for tone before publish
- MUST include "Updated [date]" for content currency trust
- MUST support inline screenshots via Sanity asset pipeline
- MUST be versioned — old versions retained for audit, even if not user-facing

---

## 5. Design Tokens (Authoritative)

All help-system components MUST consume tokens from `@strata/design-system/tokens`. No hardcoded colors, fonts, or spacing.

### 5.1 Color tokens

```typescript
// Core palette
export const colors = {
  offWhite: '#FAF7F2',
  pearl:    '#E5E2DD',
  clay:     '#C4A57B',
  agedOak:  '#8B7355',
  mocha:    '#5C4A3C',
  charcoal: '#2C2926',
  // Accents
  sage:        '#A8B5A0',
  dustyBlue:   '#8B9CAD',
  terracotta:  '#D4A090',
  goldenHour:  '#E8C547',
  // Pure
  surface: '#FFFFFF',
} as const;
```

### 5.2 Typography tokens

```typescript
export const fonts = {
  display: "'Playfair Display', Georgia, serif",
  body:    "'Inter', -apple-system, sans-serif",
  mono:    "'DM Mono', 'SF Mono', monospace",
} as const;

// Help-system specific sizes
export const helpSizes = {
  tooltipLabel:   '0.45rem', // DM Mono uppercase eyebrow
  tooltipBody:    '0.70rem', // Inter 400
  fieldLabel:     '0.50rem', // DM Mono uppercase
  fieldHelper:    '0.65rem', // Inter 400
  helperText:     '0.72rem', // Inter 400 in helper callouts
  emptyHeading:   '1.05rem', // Playfair 500
  emptyDesc:      '0.78rem', // Inter 400
  articleTitle:   '1.40rem', // Playfair 500
  articleBody:    '0.85rem', // Inter 400, line-height 1.7
} as const;
```

### 5.3 Component-specific tokens

```typescript
export const helpTokens = {
  tooltip: {
    bg: colors.charcoal,
    fg: colors.offWhite,
    eyebrow: colors.clay,
    maxWidth: 240,
    padding: '0.55rem 0.75rem',
    radius: '5px',
    shadow: '0 8px 24px rgba(0,0,0,0.15)',
    hoverDelayMs: 200,
    hideDelayMs: 100,
  },
  coachmark: {
    bg: colors.surface,
    border: `1.5px solid ${colors.clay}`,
    radius: '6px',
    shadow: '0 12px 36px rgba(0,0,0,0.18)',
    maxWidth: 280,
    padding: '1rem',
  },
  emptyState: {
    border: `1.5px dashed ${colors.pearl}`,
    bg: 'rgba(196,165,123,0.02)',
    padding: '2rem',
    radius: '6px',
  },
  helpPanel: {
    width: 420,
    bg: colors.surface,
    shadow: '-12px 0 40px rgba(0,0,0,0.12)',
    slideDurationMs: 280,
  },
  spotlight: {
    border: `2px dashed ${colors.clay}`,
    radius: '6px',
    pulseDurationMs: 2000,
  },
} as const;
```

---

## 6. The Surface Key System

The surface key is the canonical identifier that connects a UI location to its help content. **Every help moment in the system uses a surface key.** No exceptions.

### 6.1 Naming convention

```
{portal}/{section}/{component}[/{state}]
```

**Portals:**

- `designer-portal`
- `manufacturer-portal`
- `consumer-app`
- `admin-portal`

**Examples:**

```
designer-portal/today/dashboard
designer-portal/pipeline/project-list
designer-portal/pipeline/proposal-builder
designer-portal/pipeline/project-detail/financials
designer-portal/products/capture-queue
designer-portal/aesthete/score-meaning
designer-portal/aesthete/engine-overview
designer-portal/wizard/project-activation/step-2

manufacturer-portal/orders/po-detail
manufacturer-portal/orders/po-detail/stage-shipped

consumer-app/quiz/style-questions
consumer-app/room-scan/instructions

admin-portal/users/role-permissions
```

### 6.2 Surface key rules

- MUST be lowercase, kebab-case
- MUST NOT contain spaces or special characters
- MUST follow the `portal/section/component[/state]` hierarchy
- MUST be defined in code as a constant import from `@strata/help-system/surfaceKeys` (single source)
- MUST be added to the Sanity CMS schema enum when a new key is created
- MUST be unique across the entire system

### 6.3 Surface key constants

A single TypeScript file `@strata/help-system/src/surfaceKeys.ts` exports all valid keys:

```typescript
export const SurfaceKeys = {
  // Designer Portal
  DesignerPortal: {
    Today: {
      Dashboard: 'designer-portal/today/dashboard',
    },
    Pipeline: {
      ProjectList: 'designer-portal/pipeline/project-list',
      ProposalBuilder: 'designer-portal/pipeline/proposal-builder',
      ProjectDetail: {
        Root: 'designer-portal/pipeline/project-detail',
        Financials: 'designer-portal/pipeline/project-detail/financials',
        FFE: 'designer-portal/pipeline/project-detail/ffe',
        Decisions: 'designer-portal/pipeline/project-detail/decisions',
        // ... all zones
      },
      Wizard: {
        EntryPoint: 'designer-portal/wizard/entry-point',
        ProposalSelector: 'designer-portal/wizard/proposal-selector',
        Step1Basics: 'designer-portal/wizard/step-1-basics',
        Step2Scope: 'designer-portal/wizard/step-2-scope',
        // ... all steps
      },
    },
    Aesthete: {
      Overview: 'designer-portal/aesthete/overview',
      Score: 'designer-portal/aesthete/score-meaning',
      TeachingSession: 'designer-portal/aesthete/teaching-session',
    },
    Products: {
      Catalog: 'designer-portal/products/catalog',
      CaptureQueue: 'designer-portal/products/capture-queue',
    },
    Clients: {
      Directory: 'designer-portal/clients/directory',
      Profile: 'designer-portal/clients/profile',
    },
  },
  // Manufacturer Portal
  ManufacturerPortal: { /* ... */ },
  // Consumer App
  ConsumerApp: { /* ... */ },
  // Admin Portal
  AdminPortal: { /* ... */ },
} as const;
```

This file is the source of truth for what surfaces exist in the system. New surfaces are added here first, then in Sanity, then in components.

---

## 7. Content Architecture (Sanity CMS)

### 7.1 Sanity setup

Use the existing Patina Sanity project (`kv3qrinl`, dataset `production`). Create a dedicated content workspace called `help-system` to isolate help content from the marketing site content.

### 7.2 Sanity schemas

Create the following schemas in `studios/help-system/schemas/`:

#### 7.2.1 `helpContent` (the base type)

```typescript
export default {
  name: 'helpContent',
  title: 'Help Content',
  type: 'document',
  fields: [
    {
      name: 'surfaceKey',
      title: 'Surface Key',
      type: 'string',
      description: 'Must match a key from @strata/help-system/surfaceKeys',
      validation: Rule => Rule.required().regex(/^[a-z0-9-]+(\/[a-z0-9-]+)+$/, {
        name: 'surface-key-format',
        invert: false,
      }),
    },
    {
      name: 'persona',
      title: 'Persona',
      type: 'string',
      options: {
        list: [
          { title: 'Designer', value: 'designer' },
          { title: 'Maker / Manufacturer', value: 'maker' },
          { title: 'Consumer', value: 'consumer' },
          { title: 'Admin', value: 'admin' },
          { title: 'All', value: 'all' },
        ],
      },
      initialValue: 'all',
    },
    {
      name: 'contentType',
      title: 'Content Type',
      type: 'string',
      options: {
        list: [
          { title: 'Tooltip', value: 'tooltip' },
          { title: 'Field Helper', value: 'fieldHelper' },
          { title: 'Empty State', value: 'emptyState' },
          { title: 'Learn More', value: 'learnMore' },
          { title: 'Coachmark', value: 'coachmark' },
          { title: 'Help Article', value: 'helpArticle' },
        ],
      },
      validation: Rule => Rule.required(),
    },
    // Type-specific fields (conditionally shown)
    // ...
  ],
};
```

#### 7.2.2 `tooltipContent`

```typescript
{
  name: 'tooltipContent',
  fields: [
    { name: 'eyebrow', title: 'Eyebrow Label', type: 'string', description: 'Optional uppercase label, e.g., "What this means"' },
    { name: 'body', title: 'Body Text', type: 'text', rows: 3, validation: Rule => Rule.required().max(160) },
  ],
}
```

Max 160 characters for tooltips. Enforced.

#### 7.2.3 `emptyStateContent`

```typescript
{
  name: 'emptyStateContent',
  fields: [
    { name: 'icon', title: 'Typographic Icon', type: 'string', description: '◇ ◉ ▣ ◎ ⌕ ⌂ ★ ◈ — use these only' },
    { name: 'heading', title: 'Heading', type: 'string', validation: Rule => Rule.required().max(50) },
    { name: 'description', title: 'Description', type: 'text', rows: 3, validation: Rule => Rule.required().max(300) },
    { name: 'primaryActionLabel', title: 'Primary CTA Label', type: 'string' },
    { name: 'secondaryActionLabel', title: 'Secondary Action Label', type: 'string' },
    { name: 'secondaryActionArticleKey', title: 'Linked Article Key', type: 'string' },
  ],
}
```

#### 7.2.4 `helpArticleContent`

```typescript
{
  name: 'helpArticleContent',
  fields: [
    { name: 'eyebrow', title: 'Eyebrow', type: 'string' },
    { name: 'title', title: 'Title (the question)', type: 'string', validation: Rule => Rule.required() },
    { name: 'oneSentenceAnswer', title: 'One-Sentence Answer', type: 'text', rows: 2, validation: Rule => Rule.required() },
    { name: 'body', title: 'Body', type: 'array', of: [{ type: 'block' }, { type: 'image' }], validation: Rule => Rule.required() },
    { name: 'wordCount', title: 'Word Count', type: 'number', readOnly: true, description: 'Auto-calculated. Should be under 600.' },
    { name: 'readingTimeMinutes', title: 'Reading Time (min)', type: 'number', readOnly: true },
    { name: 'lastUpdated', title: 'Last Updated', type: 'date', readOnly: true },
    { name: 'relatedArticles', title: 'Related Articles', type: 'array', of: [{ type: 'reference', to: { type: 'helpContent' }}] },
    { name: 'videoUrl', title: 'Optional Video URL', type: 'url' },
  ],
}
```

### 7.3 Content fetching pattern

Components fetch content using a typed hook:

```typescript
// @strata/help-system/src/hooks/useHelpContent.ts
export function useHelpContent<T extends ContentType>(
  surfaceKey: string,
  contentType: T,
  persona?: Persona
): { data: ContentMap[T] | null; isLoading: boolean; error: Error | null } {
  // Fetches from Sanity with persona fallback chain
  // 1. Try exact match: surfaceKey + contentType + persona
  // 2. Fall back to surfaceKey + contentType + persona='all'
  // 3. Fall back to parent surfaceKey + contentType + persona
  // 4. Return null and log warning if not found
}
```

Caching: SWR with a 5-minute revalidation window. Content updates propagate within 5 minutes without app deploys.

---

## 8. Writing Standards

This section is the editorial style guide. Every piece of help content MUST follow these rules. Leah holds final approval on tone for the Designer Portal; the equivalent persona owner approves for Manufacturer and Consumer.

### 8.1 Voice

**Warm but precise.** The system is a knowledgeable colleague, not a corporate manual. We assume professional intelligence without assuming Patina-specific knowledge.

- Use "you" — direct address. Not "the user" or "designers."
- Use contractions naturally — "you're," "it's," "don't."
- Active voice almost always. Passive voice only when the actor is genuinely unknown or unimportant.
- Match the user's professional vocabulary. Designers say "FF&E," "RFI," "punch list" — so do we.

### 8.2 Length

| Surface | Max length | Why |
|---------|-----------|-----|
| Tooltip | 160 characters | If it can't fit, the interface needs to be clearer |
| Field helper | 18 words | The user is scanning a form, not reading |
| Empty state description | 300 characters | The user is oriented, not confused |
| Help article | 600 words | If longer is needed, split into multiple articles |
| Coachmark | 120 characters | The user is mid-action |
| Welcome modal | 80 characters in description | Orientation, not introduction |

### 8.3 Vocabulary rules

**Capitalization:**

- Capitalize Patina-specific concepts: **Aesthete Engine, Strata Mark, Founding Circle, Designer Portal, FF&E, the Companion** (consumer app navigator)
- Lowercase generic concepts: "the pipeline," "the wizard," "the dashboard," "a project," "a proposal"
- Always lowercase "designer," "client," "vendor," "maker" — even when referring to Leah or a specific person
- Job titles in formal contexts: "Lead Designer" (when referring to the role), but "the lead designer" (when describing a function)

**Banned phrases:**

- "Click here" — describe the destination instead
- "Submit" — use "Send," "Save," "Apply," or the specific verb
- "Easy" — show it through interface, don't claim it
- "Simply" — same
- "Powerful" — show through demonstration
- "Welcome to Patina!" — the welcome modal says this once. Nowhere else.
- "User" — always replace with "you" or the persona name
- "Item" used vaguely — name the specific entity ("FF&E item," "project," "decision")

**Preferred phrases:**

- "Visible to client" / "Internal only" — for visibility consequences
- "We've imported..." — when explaining auto-fill behavior
- "You can change this later" — when reassuring about reversibility
- "Required to..." — when explaining why a field is required
- "Try '[example]'" — for input pattern guidance

### 8.4 Examples over definitions

When explaining a concept, lead with an example whenever possible:

❌ "Project Name is the display name visible to the client across communications and documents."

✅ "Try 'Chen Residence — Living & Dining'. Visible to client."

### 8.5 Patina-specific concept glossary

These terms MUST be used consistently across all help content. The first time a concept appears on a page, use a `<StrataInfoIcon />`.

| Term | Definition (canonical) |
|------|-----------------------|
| **Aesthete Engine** | The designer-taught ML system that captures style expertise and translates it into personalized recommendations. |
| **Aesthete Score** | A 0–100 measurement of style-vocabulary alignment between a designer and a client. |
| **Strata Mark** | The three-line horizontal motif representing momentum and structure. Visual signature of Patina. |
| **FF&E** | Furniture, Fixtures, and Equipment. The catalog of items procured for a project. |
| **FF&E Pipeline** | The 8-stage procurement workflow: Specified → Quoted → Approved → Ordered → Production → Shipped → Delivered → Installed. |
| **Founding Circle** | The first cohort of designers, makers, and clients on Patina. |
| **Studio** | The organizational unit. A designer's business entity. May have one or many designers. |
| **The Companion** | The navigation system in the consumer iOS app. |
| **Scope Change Authorization (SCA)** | The formal Change Order document signed by client and designer. |
| **Project Activation** | The 7-step wizard that converts a signed proposal into an active project. |

---

## 9. Integration Plan for Existing Surfaces

This section is the operational guide for retrofitting help into the existing portal. **Each existing surface gets an audit, a set of changes, and an owner.**

### 9.1 Audit checklist (run on every existing surface)

For each existing screen, walk through this checklist:

1. **Empty state.** Does the screen have an empty state? Is it informative? Replace with `<EmptyState />` using a CMS-backed `surfaceKey`.
2. **Field labels.** Are all labels using `<FieldLabel />`? Are required/optional markers consistent?
3. **Field helpers.** Does every non-obvious field have a `<FieldHelper />`? If a field has no helper, can you defend that with a 1-sentence answer to "would a new user know what this does"?
4. **Strata vs Info icons.** Are Patina-specific concepts (Aesthete, FF&E stages, etc.) marked with `<StrataInfoIcon />`? Are general questions marked with `<InfoIcon />`? Are they consistent across the screen?
5. **Smart defaults.** What fields have sensible defaults? Are they applied? Are they documented in CMS so the helper text can mention them?
6. **Microcopy review.** Read every label, button, and helper aloud. Does it match the Writing Standards (Section 8)?
7. **Strata Mark presence.** Does the screen have a Strata Mark in the appropriate place (page header, section dividers, progress indicators)?

### 9.2 Integration phases by surface

#### Phase 1 priorities (Weeks 1–4)

**Designer Portal · Today Dashboard**

- Empty state: "Your day starts here" with explanation of card types
- Field helpers: none (read-only screen)
- Strata icons on: Aesthete Score (in lead cards)
- Smart defaults: time-of-day greeting

**Designer Portal · Pipeline (Project List)**

- Empty state per stage (Leads, Proposals, Active, Completed) — each with a different surface key
- Strata icons on: stage names with detailed definitions
- Filters with smart defaults (default to "Active" tab)

**Designer Portal · Project Activation Wizard (the priority surface)**

- Every step gets a Step-level surface key
- Every field gets a `<FieldHelper />`
- Strata icons on: "Project Code", "Style Direction", "Allowance vs Fixed vs TBD"
- Step indicator with visible progress
- Auto-save messaging visible at all times
- Confirmation screen (Screen 10) becomes the template for all "you did the thing" moments

#### Phase 2 priorities (Weeks 5–8)

**Designer Portal · Aesthete Engine**

- Empty teaching session state
- Strata icons on every Aesthete concept (Score, Vocabulary, Profile, Match)
- Helper text on every teaching action explaining how it changes the model
- "Learn more" expandable for the privacy and data-use story (consumer trust)

**Designer Portal · Products (Catalog + Capture)**

- Empty capture queue state explaining the Chrome extension
- Helper text on capture quality indicators
- "Learn more" on Manufacturer tier badges

**Designer Portal · Clients**

- Client profile empty state
- Helper text on every field in client profile
- Strata icon on "Aesthete Profile" with explanation

#### Phase 3 priorities (Weeks 9–12)

- **All remaining Designer Portal screens** (FF&E procurement detail, Decisions workflow, Change Orders, Team management, Financials)
- **Manufacturer Portal** complete pass
- **Consumer App** complete pass with adjusted voice
- **First Project Walkthrough** built and connected to first-signin trigger

### 9.3 Migration patterns (with code examples)

#### Pattern 1: Replacing a hardcoded label

**Before:**

```tsx
<label className="text-xs uppercase text-stone-600 mb-1">
  Project Name *
</label>
<input type="text" className="..." />
<p className="text-xs text-stone-400 mt-1">
  This is the name visible to your client.
</p>
```

**After:**

```tsx
import { FieldLabel, FieldHelper } from '@strata/help-system/fields';
import { SurfaceKeys } from '@strata/help-system/surfaceKeys';

<FieldLabel htmlFor="project-name" required>
  Project Name
</FieldLabel>
<input id="project-name" type="text" className="..." />
<FieldHelper surfaceKey={SurfaceKeys.DesignerPortal.Pipeline.Wizard.Step1Basics + '/project-name'} />
```

#### Pattern 2: Adding a Patina concept tooltip

**Before:**

```tsx
<h3 className="text-lg font-semibold">Aesthete Score</h3>
<div className="text-3xl">{score}</div>
```

**After:**

```tsx
import { SectionHeading, StrataInfoIcon } from '@strata/help-system';
import { SurfaceKeys } from '@strata/help-system/surfaceKeys';

<SectionHeading>
  Aesthete Score
  <StrataInfoIcon surfaceKey={SurfaceKeys.DesignerPortal.Aesthete.Score} />
</SectionHeading>
<div className="text-3xl">{score}</div>
```

#### Pattern 3: Replacing an empty state

**Before:**

```tsx
{projects.length === 0 && (
  <div className="text-center py-12 text-stone-400">
    No projects yet.
  </div>
)}
```

**After:**

```tsx
import { EmptyState } from '@strata/help-system/EmptyState';
import { SurfaceKeys } from '@strata/help-system/surfaceKeys';

{projects.length === 0 && (
  <EmptyState
    surfaceKey={SurfaceKeys.DesignerPortal.Pipeline.ProjectList + '/empty-active'}
    primaryAction={{
      label: '+ Create a project',
      onClick: () => router.push('/pipeline/new'),
    }}
  />
)}
```

### 9.4 Order of operations for a single screen migration

When migrating an existing screen, follow this order:

1. **Define surface keys** in `@strata/help-system/surfaceKeys.ts` for all help moments on the screen.
2. **Create Sanity content** for all defined surface keys. Use placeholder content if final copy isn't ready — never block migration on copy.
3. **Replace components** following the Migration Patterns above.
4. **Add analytics tracking** — verify events fire correctly with surface keys.
5. **Manual QA** against the checklist in Section 9.1.
6. **Accessibility audit** — keyboard nav, screen reader, reduced motion, color contrast.
7. **PR review** with the Five Principles test from Section 2.
8. **Ship.** Then watch analytics for one week. Iterate.

---

## 10. Analytics Taxonomy

Every guidance interaction is tracked. Data lives in PostHog (self-hosted). Dashboards are built for the content team and reviewed quarterly.

### 10.1 Events

```typescript
// Layer 1 · Ambient (most events here are passive — counted on render)
'help.empty_state.shown'         // { surfaceKey, persona }
'help.empty_state.cta_clicked'   // { surfaceKey, ctaLabel }
'help.field_helper.rendered'     // batch-counted, low priority

// Layer 2 · Reactive
'help.tooltip.shown'             // { surfaceKey, position, triggerType: 'hover' | 'focus' | 'click' }
'help.tooltip.dismissed'         // { surfaceKey, durationMs }
'help.learnmore.expanded'        // { surfaceKey }
'help.learnmore.collapsed'       // { surfaceKey, viewedMs }
'help.panel.opened'              // { fromSurfaceKey, triggerType: 'utility_bar' | 'keyboard_shortcut' }
'help.panel.closed'              // { fromSurfaceKey, durationMs, articleOpened: boolean }

// Layer 3 · Proactive
'help.tour.started'              // { tourKey, triggerSource }
'help.tour.step_advanced'        // { tourKey, stepNumber, stepSurfaceKey }
'help.tour.completed'            // { tourKey, durationMs, stepsViewed }
'help.tour.abandoned'            // { tourKey, atStep, totalSteps }
'help.coachmark.shown'           // { surfaceKey }
'help.coachmark.dismissed'       // { surfaceKey, viewedMs }
'help.welcome_modal.shown'       // { firstSignin: true }
'help.welcome_modal.action'      // { action: 'take_tour' | 'jump_in' }

// Layer 4 · Reference
'help.article.opened'            // { articleKey, fromSurfaceKey, fromSearch: boolean }
'help.article.scrolled_to_end'   // { articleKey, durationMs }
'help.article.feedback_given'    // { articleKey, sentiment: 'positive' | 'negative', hasComment: boolean }
'help.search.performed'          // { query, resultCount, fromSurfaceKey }
'help.search.result_clicked'     // { query, articleKey, position }
```

### 10.2 Required dashboards

Build these dashboards in PostHog and grant access to Leah, the content designer (when hired), and engineering:

1. **Tooltip Health.** Per tooltip surface key: shown count, average view duration, hover-to-dismiss ratio. Tooltips with high frequency but low duration suggest the interface needs to clarify the underlying element.
2. **Empty State Conversion.** Per empty state: shown count, primary CTA click rate, secondary action click rate. Low CTA rates suggest the empty state isn't motivating action.
3. **Tour Completion Funnel.** First Project Walkthrough: per-step completion, abandonment points, time-to-complete distribution.
4. **Help Article Effectiveness.** Per article: views, average scroll depth, thumbs-up rate, thumbs-down rate, comments. Low thumbs-up rates surface content that needs rewriting.
5. **Surface-Level Help Density.** Per surface key: total help interactions. Identifies confusing screens by where users seek the most help.

### 10.3 Quarterly content audit

Every quarter, the content owner (initially Kody, eventually a content designer) runs the following audit:

1. Pull tooltip health report. Retire tooltips with under 5 hovers per month per active user. Rewrite tooltips with high hover-and-dismiss rates.
2. Pull empty state conversion report. Rewrite empty states with under 20% CTA click rate.
3. Pull help article effectiveness. Articles with under 60% positive feedback get reviewed and rewritten.
4. Pull surface-level help density. Top three "high-help" surfaces get an interface review — is the underlying design unclear?
5. Update the Patina-specific concept glossary (Section 8.5) if new concepts have emerged.

---

## 11. Accessibility Requirements

The help system MUST meet WCAG 2.1 Level AA across all components. The following are non-negotiable.

### 11.1 Keyboard navigation

- All help triggers (info icons, learn-more toggles, help panel button) MUST be reachable via `Tab` in logical order
- All help surfaces MUST be operable with keyboard alone
- `Escape` MUST close tooltips, popovers, and the help panel
- Tab focus MUST be visible (use the design system's `:focus-visible` ring)
- Tours MUST be navigable with `Tab`, `Enter`, and `Escape`

### 11.2 Screen reader support

- Tooltips: `role="tooltip"`, linked via `aria-describedby`
- Coachmarks: `role="dialog"` with `aria-modal="false"` (non-blocking) and accessible name
- Help articles: proper heading hierarchy (h1 → h2 → h3), no heading skips
- Empty states: heading + descriptive text in correct order; CTA buttons properly labeled
- Status messages (e.g., "Auto-saved 2 seconds ago"): `role="status"` with `aria-live="polite"`

### 11.3 Reduced motion

- ALL animations MUST check `prefers-reduced-motion` media query
- When set, animations either disable entirely or shorten to under 50ms
- The spotlight pulse animation in coachmarks MUST disable when reduced motion is set (use solid border instead)

### 11.4 Color & contrast

- All text MUST meet 4.5:1 contrast ratio (or 3:1 for large text 18pt+)
- Tooltip text (Off-White on Charcoal) measures 14.8:1 — well within AAA
- Required field markers (Terracotta) MUST always be paired with the asterisk character, never color alone
- Focus indicators MUST have 3:1 contrast against their backgrounds

### 11.5 Localization readiness

- All copy MUST come from CMS, never hardcoded
- All copy MUST allow for ~30% expansion for languages with longer words (German, Spanish)
- Component layouts MUST handle text wrapping gracefully
- Date and number formatting MUST use Intl.DateTimeFormat / Intl.NumberFormat

---

## 12. QA Acceptance Criteria

Every component in `@strata/help-system` MUST pass these gates before merge.

### 12.1 Unit tests

- Component renders without errors with minimal props
- Component renders without errors when Sanity returns null
- Component fires correct analytics events on interaction
- Component respects `prefers-reduced-motion`
- Component is keyboard-navigable

### 12.2 Integration tests

- Tooltip appears on hover after 200ms delay
- Tooltip disappears on mouseleave after 100ms grace period
- Coachmark "Skip tour" abandons the tour and persists abandonment to user profile
- Empty state CTA navigation works as configured
- Help panel opens with correct contextual articles based on current route

### 12.3 Visual regression

Use Chromatic or equivalent to snapshot every help-system component in:

- Default state
- Hover state
- Focus state
- Loading state
- Error state (Sanity unavailable)
- Reduced-motion mode

### 12.4 Manual QA checklist (per surface migration)

```
[ ] Surface keys match @strata/help-system/surfaceKeys.ts exactly
[ ] Sanity content exists for every surface key referenced
[ ] All FieldLabel components have correct required/optional markers
[ ] All FieldHelper components have copy under 18 words
[ ] All tooltips have copy under 160 characters
[ ] Patina concepts use StrataInfoIcon, general questions use InfoIcon
[ ] Smart defaults applied where documented
[ ] Empty states use EmptyState component (not raw HTML)
[ ] Analytics events fire correctly (verified in PostHog dev)
[ ] Keyboard navigation works for all help triggers
[ ] Screen reader reads help content in logical order
[ ] Reduced-motion preference disables animations
[ ] Color contrast meets WCAG AA
[ ] No hardcoded copy strings — all from CMS
[ ] No third-party help widgets present
```

---

## 13. Operational Procedures

### 13.1 Adding a new help moment

1. **Identify the surface.** Where in the product is the question forming? What screen, what component, what state?
2. **Add the surface key.** Update `@strata/help-system/src/surfaceKeys.ts`. Use the naming convention from Section 6.1.
3. **Create the Sanity content.** Open the help-system Sanity workspace. Create a new `helpContent` document with the surface key. Fill in type-specific fields. Leah (or persona content owner) approves tone before publish.
4. **Implement in code.** Use the appropriate component from `@strata/help-system`. Reference the surface key constant from the constants file, never a string literal.
5. **Verify analytics.** Check PostHog dev for the appropriate events firing.
6. **Ship.** PR review against the Five Principles + the QA checklist.

### 13.2 Editing existing help content

1. **Open the help-system Sanity workspace.**
2. **Find the document by surface key.** Use search if needed.
3. **Edit content.** Keep within length limits.
4. **Preview.** Sanity preview environment shows the content rendered in context.
5. **Publish.** Changes propagate to production within 5 minutes (SWR revalidation).
6. **Track impact.** Watch analytics for 7 days — does the new content perform better?

### 13.3 Retiring a help moment

A help moment should be retired when:

- Tooltip hover rate drops below 5/month per active user (suggests unnecessary)
- Tooltip hover-and-dismiss ratio exceeds 80% (suggests confusing)
- Empty state CTA click rate is under 10% (suggests CTA is wrong or unclear)
- Help article positive feedback rate is under 50%

To retire:

1. **Remove from Sanity.** Don't delete — set `status: 'archived'`. Component will render a fallback or hide entirely.
2. **Remove the component usage in code.** Submit a PR.
3. **Remove the surface key from the constants file.**
4. **Document the retirement** in the quarterly content audit report.

### 13.4 Handling Sanity downtime

If the Sanity API is unavailable:

- All help-system components MUST render gracefully without content
- Tooltips fail silently (no tooltip shown, but no error visible)
- Empty states show a generic "Loading..." then a generic "This is empty" message after timeout
- Field helpers fail silently
- Error reports to Sentry, not to the user

The user MUST NOT see broken UI because of help-system downtime.

---

## 14. Implementation Roadmap (Build Order for Claude Code)

This is the canonical order of implementation. Claude Code may parallelize tasks where dependencies allow but MUST NOT skip steps.

### Sprint 1 (Weeks 1–4) · Foundation

| # | Task | Output |
|---|------|--------|
| 1.1 | Set up `@strata/help-system` package in monorepo | Empty package with build config |
| 1.2 | Implement design tokens for help system | `tokens.ts` exporting all values from Section 5 |
| 1.3 | Set up Sanity `help-system` workspace and schemas | Schemas from Section 7.2 deployed to Sanity |
| 1.4 | Create `surfaceKeys.ts` source-of-truth file | Initial keys for Designer Portal Today + Pipeline |
| 1.5 | Implement `<FieldLabel />` and `<FieldHelper />` | Components + Storybook stories + tests |
| 1.6 | Implement `useHelpContent` hook with SWR | Hook + tests + Sanity client config |
| 1.7 | Implement `<EmptyState />` component | Component + Storybook + tests |
| 1.8 | Set up PostHog event tracking | Helper function + first events wired up |
| 1.9 | Migrate Designer Portal Today Dashboard | All fields use new components, empty states migrated |
| 1.10 | Migrate Designer Portal Pipeline (Project List) | Same |

### Sprint 2 (Weeks 5–8) · Reactive Layer

| # | Task | Output |
|---|------|--------|
| 2.1 | Implement `<Tooltip />` with portal rendering | Component + accessibility + tests |
| 2.2 | Implement `<InfoIcon />` and `<StrataInfoIcon />` | Both icons + Storybook docs of when to use each |
| 2.3 | Implement `<LearnMore />` with localStorage persistence | Component + tests |
| 2.4 | Implement `<ContextualHelpPanel />` | Slide-out panel + route-aware content fetching |
| 2.5 | Write first 40 help articles in Sanity | Articles covering Pipeline, Activation Wizard, Aesthete |
| 2.6 | Wire `?` icon in utility bar to open panel | Integration in app shell |
| 2.7 | Migrate Designer Portal Activation Wizard | All steps, all fields, all icons |
| 2.8 | Migrate Designer Portal Aesthete Engine | All concepts with StrataInfoIcons |
| 2.9 | Migrate Designer Portal Products + Clients | Same pattern |
| 2.10 | Build content analytics dashboard in PostHog | All required dashboards from Section 10.2 |

### Sprint 3 (Weeks 9–12) · Proactive & Reference

| # | Task | Output |
|---|------|--------|
| 3.1 | Implement `<Coachmark />` with spotlight | Component + accessibility + reduced-motion handling |
| 3.2 | Implement `<TourController />` | Multi-step orchestration + persistence |
| 3.3 | Implement `<WelcomeModal />` | One-time modal triggered on first signin |
| 3.4 | Build First Project Walkthrough tour | 5-step tour with all coachmarks in Sanity |
| 3.5 | Implement `<HelpArticle />` with rich text | Component + rendering of all Sanity block types |
| 3.6 | Implement `<HelpSearch />` and full Help Center | Search + browse + categorization |
| 3.7 | Record first 10 video walkthroughs | Videos + Sanity references + accessible player |
| 3.8 | Migrate Manufacturer Portal — full pass | Same checklist applied to all manufacturer surfaces |
| 3.9 | Migrate Consumer App — full pass with adjusted voice | Same |
| 3.10 | Launch pilot with Leah + 2 designers | Measurement, feedback, iteration |

### Post-launch · Continuous

- Quarterly content audits per Section 10.3
- 7-day and 30-day surveys to new designers
- Per-feature help content added during feature development (not retrofitted)
- Annual review of this document — update where reality has diverged from intent

---

## 15. Decision Log

Material decisions and their rationale. New entries appended over time.

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04 | Use Sanity (existing CMS) rather than a separate help-system database | Avoids new infrastructure. Sanity's structured content + preview pipeline is well-suited. Reuses existing auth and editorial workflow. |
| 2026-04 | One-shot coachmarks tracked in user profile, not localStorage | Survives device changes. Designers using both desktop and mobile portals see consistent state. |
| 2026-04 | Two distinct info icons (generic + Strata) | Trains users that "Strata" means "platform concept." Mixing dilutes both signals. Worth the slight implementation cost. |
| 2026-04 | No third-party help widgets | Maintains design system integrity. Avoids cookie/privacy complications. Avoids vendor lock-in for content. |
| 2026-04 | Help articles capped at 600 words | If a concept needs more, the product likely needs simplification. Hard cap forces the harder conversation. |
| 2026-04 | First Project Walkthrough is 5 steps max | Beyond 5, completion rates fall off a cliff in onboarding research. Forces ruthless prioritization. |

---

## 16. Open Questions

These are questions the system intentionally leaves open for future resolution. Claude Code should NOT silently resolve these — escalate when encountered.

1. **Localization timing.** English at launch. When do we add Spanish for Spanish-speaking field workers? Trigger condition needed.
2. **Help video hosting.** Sanity asset CDN? Mux? YouTube unlisted? Cost vs. control tradeoff to evaluate before Sprint 3.
3. **Content versioning UX.** When a help article is updated, do users who previously saw the old version get a "this was updated" indicator? Decision deferred to post-launch based on data.
4. **AI-generated help search.** Could a semantic search over help articles be more useful than full-text? Evaluate after first 100 articles exist.
5. **Mobile Designer Portal help patterns.** This document assumes desktop. Mobile Designer Portal will need adapted patterns. Cover in mobile portal handoff document.

---

## 17. Glossary of Implementation Terms

| Term | Meaning |
|------|---------|
| **Surface** | A specific UI location identified by a surface key. |
| **Surface key** | The canonical string identifier for a help moment. Format: `portal/section/component[/state]`. |
| **Layer** | One of the four guidance layers: Ambient, Reactive, Proactive, Reference. |
| **Help moment** | A specific instance of guidance — a tooltip, an empty state, a coachmark. |
| **CMS content** | A Sanity document keyed to a surface key. Fetched by components at runtime. |
| **Persona** | One of: designer, maker, consumer, admin. Determines voice and content variant. |
| **Tour** | A multi-step coachmark sequence. Currently only one exists: First Project Walkthrough. |
| **One-shot** | A help moment that shows only once per user, then never again unless re-triggered. |

---

## 18. Sign-Off

| Role | Name | Signed | Date |
|------|------|--------|------|
| Technical Lead | Kody | _____ | _____ |
| Design Authority | Leah | _____ | _____ |

This document supersedes any prior help-system documentation. Changes require updates to this document first, then implementation.

---

*Document version 1.0 — April 2026. Living document — review quarterly. File this in the Patina-docs spine at `/handoffs/help-guidance-system.md`.*
