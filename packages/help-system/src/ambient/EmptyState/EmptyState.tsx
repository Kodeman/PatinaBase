'use client'

/**
 * EmptyState — Layer 1 (Ambient) CMS-backed wrapper around the design-system
 * EmptyState primitive.
 *
 * Spec references:
 *   - §4.3   — Component contract (props, behavior, fallbacks)
 *   - §7.2.3 — Sanity emptyStateContent schema
 *   - §10.1  — Analytics events (help.empty_state.shown, .cta_clicked)
 *   - §13.4  — Graceful Sanity downtime
 *
 * Behavior summary:
 *   - Fetches content via useHelpContent(surfaceKey, 'emptyState', persona)
 *   - On load:  renders loadingFallback if provided, otherwise nothing
 *   - On hit:   renders the design-system EmptyState populated from CMS
 *   - On miss + error: renders generic "Nothing here yet" fallback
 *   - On miss + no error: renders nothing
 *   - Fires analytics on first show and on CTA click
 *
 * Icon resolution policy:
 *   1. Explicit `icon` prop wins (already a React node)
 *   2. CMS `icon` matching the KNOWN_ICONS map → corresponding Lucide icon
 *   3. CMS `icon` looking like a typographic glyph (1–2 non-alphanumeric chars) →
 *      rendered as text per spec §4.3 visual ("typographic, never an emoji or
 *      stock illustration")
 *   4. Otherwise → no icon
 */
import * as React from 'react'
import { EmptyState as DSEmptyStateRaw } from '@patina/design-system'
import {
  FileText,
  Folder,
  FolderOpen,
  Inbox,
  Plus,
  Search,
  ShoppingBag,
  Sparkles,
  Star,
  Users,
} from 'lucide-react'
import { useHelpContent } from '../../hooks/useHelpContent'
import type { Persona } from '../../contentTypes'

/**
 * Local structural type mirroring the relevant subset of @patina/design-system's
 * EmptyStateProps. We don't import the type directly because the design-system
 * package currently ships without .d.ts files (its dts build chokes on an
 * unrelated @patina/types/media import — tracked elsewhere). Once that's fixed,
 * switch to `import type { EmptyStateProps } from '@patina/design-system'`.
 */
interface DSEmptyStateProps {
  size?: 'sm' | 'md' | 'lg'
  icon?: React.ReactNode
  title?: string
  description?: React.ReactNode
  action?: React.ReactNode
  secondaryAction?: React.ReactNode
  className?: string
  children?: React.ReactNode
}

const DSEmptyState = DSEmptyStateRaw as unknown as React.ComponentType<DSEmptyStateProps>

// ─── Public types ─────────────────────────────────────────────────────────────

export interface EmptyStateProps {
  /** Surface key identifying the CMS document in Sanity. */
  surfaceKey: string
  /**
   * Persona to use when fetching content. The underlying hook handles the
   * 4-step fallback chain (exact → all → parent+persona → parent+all).
   * @default 'all'
   */
  persona?: Persona
  /**
   * Optional icon node — overrides any iconName from CMS. Useful for callers
   * that want to pass a fully-styled custom illustration.
   */
  icon?: React.ReactNode
  /**
   * Optional CTA click handler. When provided AND CMS supplies a
   * primaryActionLabel, a button is rendered. Click fires onAction and the
   * `help.empty_state.cta_clicked` analytics event.
   */
  onAction?: () => void
  /** Class forwarded to the design-system EmptyState root. */
  className?: string
  /** Element to render while content is loading. Defaults to nothing. */
  loadingFallback?: React.ReactNode
  /** Re-export underlying size variant for callers. */
  size?: DSEmptyStateProps['size']
}

// Re-export the underlying primitive's variant type for downstream typing.
export type EmptyStateSize = DSEmptyStateProps['size']

// ─── Icon name → Lucide component map ─────────────────────────────────────────
//
// Keep the map small (≤ 10) so the bundle stays tight and naming stays clear.
// Add to it only when a new CMS document references a name not yet here.
//
//   inbox       → Inbox
//   search      → Search
//   file        → FileText
//   folder      → Folder
//   folder-open → FolderOpen
//   plus        → Plus
//   shopping    → ShoppingBag
//   sparkles    → Sparkles
//   star        → Star
//   users       → Users
//
// Unknown names fall through to the typographic-glyph branch (or omit).

const KNOWN_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  inbox: Inbox,
  search: Search,
  file: FileText,
  folder: Folder,
  'folder-open': FolderOpen,
  plus: Plus,
  shopping: ShoppingBag,
  sparkles: Sparkles,
  star: Star,
  users: Users,
}

/** Detects a typographic glyph per spec §4.3 (◇ ◉ ▣ ◎ ⌕ ⌂ ★ ◈, etc.). */
function isTypographicGlyph(value: string): boolean {
  // 1–2 chars, no plain ASCII letters/digits
  if (value.length === 0 || value.length > 2) return false
  return !/[A-Za-z0-9]/.test(value)
}

function resolveCmsIcon(iconValue: string | undefined): React.ReactNode {
  if (!iconValue) return undefined
  const known = KNOWN_ICONS[iconValue]
  if (known) {
    const IconComponent = known
    return <IconComponent className="h-12 w-12" />
  }
  if (isTypographicGlyph(iconValue)) {
    return (
      <span
        aria-hidden="true"
        className="text-[1.8rem] italic"
        style={{ fontFamily: 'var(--font-playfair, "Playfair Display", serif)' }}
      >
        {iconValue}
      </span>
    )
  }
  return undefined
}

// ─── Component ────────────────────────────────────────────────────────────────

const FALLBACK_HEADING = 'Nothing here yet'

export function EmptyState({
  surfaceKey,
  persona = 'all',
  icon,
  onAction,
  className,
  loadingFallback,
  size,
}: EmptyStateProps) {
  const { data, isLoading, isError } = useHelpContent(surfaceKey, 'emptyState', persona)

  // Fire `shown` exactly once per mount, on first render with renderable content
  const hasFiredShown = React.useRef(false)
  const willRenderContent = data != null || (data == null && isError)

  React.useEffect(() => {
    if (hasFiredShown.current) return
    if (!willRenderContent) return
    hasFiredShown.current = true
    try {
      ;(window as { posthog?: { capture: (event: string, props?: Record<string, unknown>) => void } })
        .posthog?.capture('help.empty_state.shown', {
          surface_key: surfaceKey,
          persona,
        })
    } catch {
      // analytics must never crash the UI
    }
  }, [willRenderContent, surfaceKey, persona])

  const handleCtaClick = React.useCallback(() => {
    try {
      ;(window as { posthog?: { capture: (event: string, props?: Record<string, unknown>) => void } })
        .posthog?.capture('help.empty_state.cta_clicked', {
          surface_key: surfaceKey,
          cta_label: data?.primaryActionLabel,
        })
    } catch {
      // analytics must never crash the UI
    }
    onAction?.()
  }, [surfaceKey, data?.primaryActionLabel, onAction])

  // ── Loading state ──────────────────────────────────────────────────────────
  if (isLoading) {
    return loadingFallback != null ? <>{loadingFallback}</> : null
  }

  // ── Resolve heading + description (with error fallback) ────────────────────
  let heading: string | undefined
  let description: string | undefined
  let resolvedIcon: React.ReactNode | undefined = icon
  let actionNode: React.ReactNode | undefined

  if (data) {
    heading = data.heading
    description = data.description
    if (resolvedIcon === undefined) {
      resolvedIcon = resolveCmsIcon(data.icon)
    }
    if (data.primaryActionLabel) {
      actionNode = (
        <button
          type="button"
          onClick={handleCtaClick}
          className="inline-flex items-center justify-center rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {data.primaryActionLabel}
        </button>
      )
    }
  } else if (isError) {
    // Sanity offline / hard error — render the generic fallback so the UI
    // never goes blank (spec §4.3 + §13.4).
    heading = FALLBACK_HEADING
  } else {
    // No content and no error — render nothing.
    return null
  }

  return (
    <DSEmptyState
      size={size}
      className={className}
      icon={resolvedIcon}
      title={heading}
      description={description}
      action={actionNode}
    />
  )
}

EmptyState.displayName = 'PatinaHelpEmptyState'
