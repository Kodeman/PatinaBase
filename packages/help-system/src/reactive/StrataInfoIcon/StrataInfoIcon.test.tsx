/**
 * StrataInfoIcon — unit tests
 *
 * Reactive-layer component (spec §4.2) — a Patina-specific concept indicator
 * built on the StrataMark glyph (3 descending horizontal lines, Clay/terracotta
 * tone). Used ONLY for Patina-specific concepts (Aesthete Engine, FF&E stages,
 * Strata Mark, Founding Circle, Patina vocabulary). General "what does this
 * number mean?" questions use <InfoIcon /> (C2) instead.
 *
 * Post R13 refactor: StrataInfoIcon delegates to the canonical <Tooltip />
 * wrapper (C1), which owns CMS fetch, fallback resolution, portal rendering,
 * and analytics emission. Tests assert public behavior (rendered DOM +
 * analytics payload shape) rather than Radix internals.
 *
 * All Sanity client + posthog calls are mocked. No live network I/O.
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrataInfoIcon } from './StrataInfoIcon'
import type { TooltipContent } from '../../contentTypes'

// ─── Mock the Sanity client module ────────────────────────────────────────────

const mockFetch = vi.fn()

vi.mock('../../sanityClient', () => ({
  getSanityClient: () => ({ fetch: mockFetch }),
  _resetSanityClient: vi.fn(),
}))

// ─── Test wrapper ─────────────────────────────────────────────────────────────

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  })

  // The canonical <Tooltip /> wires its own Radix Provider internally, so
  // tests only need the React Query provider here.
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  return { Wrapper, queryClient }
}

async function flushQueries() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const STRATA_FIXTURE: TooltipContent = {
  surfaceKey: 'designer-portal/aesthete/engine-overview',
  persona: 'all',
  contentType: 'tooltip',
  eyebrow: 'PATINA CONCEPT',
  body: 'The Aesthete Engine learns each designer’s style and proposes shapes accordingly.',
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('<StrataInfoIcon />', () => {
  let captureSpy: ReturnType<typeof vi.fn>
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    captureSpy = vi.fn()
    ;(window as unknown as { posthog?: { capture: typeof captureSpy } }).posthog = {
      capture: captureSpy,
    }
  })

  afterEach(() => {
    consoleWarnSpy.mockRestore()
    delete (window as unknown as { posthog?: unknown }).posthog
  })

  // ── 1. Renders the StrataMark glyph (3 lines) ───────────────────────────────

  it('renders an SVG with 3 horizontal lines (the StrataMark) at default 14px', async () => {
    mockFetch.mockResolvedValueOnce(STRATA_FIXTURE)

    const { Wrapper } = makeWrapper()
    const { container } = render(
      <Wrapper>
        <StrataInfoIcon surfaceKey="designer-portal/aesthete/engine-overview" />
      </Wrapper>,
    )

    await flushQueries()

    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg?.getAttribute('width')).toBe('14')
    expect(svg?.getAttribute('height')).toBe('14')

    const lines = container.querySelectorAll('svg line')
    expect(lines.length).toBe(3)
  })

  // ── 2. Honors custom size ───────────────────────────────────────────────────

  it('renders at a custom size when size prop is provided', async () => {
    mockFetch.mockResolvedValueOnce(STRATA_FIXTURE)

    const { Wrapper } = makeWrapper()
    const { container } = render(
      <Wrapper>
        <StrataInfoIcon
          surfaceKey="designer-portal/aesthete/engine-overview"
          size={24}
        />
      </Wrapper>,
    )

    await flushQueries()

    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('width')).toBe('24')
    expect(svg?.getAttribute('height')).toBe('24')
  })

  // ── 3. Trigger has accessible name (default "Patina concept") ───────────────

  it('exposes the default ariaLabel "Patina concept" on the trigger', async () => {
    mockFetch.mockResolvedValueOnce(STRATA_FIXTURE)

    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <StrataInfoIcon surfaceKey="designer-portal/aesthete/engine-overview" />
      </Wrapper>,
    )

    await flushQueries()

    const button = screen.getByRole('button', { name: 'Patina concept' })
    expect(button).toBeInTheDocument()
  })

  it('uses a custom ariaLabel when one is provided', async () => {
    mockFetch.mockResolvedValueOnce(STRATA_FIXTURE)

    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <StrataInfoIcon
          surfaceKey="designer-portal/aesthete/engine-overview"
          ariaLabel="About the Aesthete Engine"
        />
      </Wrapper>,
    )

    await flushQueries()

    expect(
      screen.getByRole('button', { name: 'About the Aesthete Engine' }),
    ).toBeInTheDocument()
  })

  // ── 4. Tooltip opens on focus, body visible to assistive tech ───────────────

  it('shows the tooltip body when the trigger is focused', async () => {
    mockFetch.mockResolvedValueOnce(STRATA_FIXTURE)

    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <StrataInfoIcon surfaceKey="designer-portal/aesthete/engine-overview" />
      </Wrapper>,
    )

    await flushQueries()

    const button = screen.getByRole('button', { name: 'Patina concept' })

    await act(async () => {
      button.focus()
      await new Promise((r) => setTimeout(r, 0))
    })

    // Radix renders the body twice — once in the positioned tooltip and once
    // in a visually-hidden screen-reader announcer. Both are valid; we just
    // need to confirm at least one is in the DOM.
    const matches = await screen.findAllByText(
      'The Aesthete Engine learns each designer’s style and proposes shapes accordingly.',
    )
    expect(matches.length).toBeGreaterThanOrEqual(1)
  })

  // ── 5. Analytics on show — snake_case + trigger: 'strata_info_icon' ─────────

  it('fires help.tooltip.shown with snake_case keys and trigger="strata_info_icon" on open', async () => {
    mockFetch.mockResolvedValueOnce(STRATA_FIXTURE)

    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <StrataInfoIcon surfaceKey="designer-portal/aesthete/engine-overview" />
      </Wrapper>,
    )

    await flushQueries()

    const button = screen.getByRole('button', { name: 'Patina concept' })

    await act(async () => {
      button.focus()
      await new Promise((r) => setTimeout(r, 0))
    })

    expect(captureSpy).toHaveBeenCalledWith(
      'help.tooltip.shown',
      expect.objectContaining({
        surface_key: 'designer-portal/aesthete/engine-overview',
        trigger: 'strata_info_icon',
      }),
    )
  })

  // ── 6. Analytics on dismiss — duration_ms + trigger ─────────────────────────

  it('fires help.tooltip.dismissed with duration_ms and trigger="strata_info_icon" on close', async () => {
    mockFetch.mockResolvedValueOnce(STRATA_FIXTURE)

    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <StrataInfoIcon surfaceKey="designer-portal/aesthete/engine-overview" />
      </Wrapper>,
    )

    await flushQueries()

    const button = screen.getByRole('button', { name: 'Patina concept' })

    await act(async () => {
      button.focus()
      await new Promise((r) => setTimeout(r, 0))
    })

    captureSpy.mockClear()

    await act(async () => {
      button.blur()
      await new Promise((r) => setTimeout(r, 10))
    })

    expect(captureSpy).toHaveBeenCalledWith(
      'help.tooltip.dismissed',
      expect.objectContaining({
        surface_key: 'designer-portal/aesthete/engine-overview',
        trigger: 'strata_info_icon',
        duration_ms: expect.any(Number),
      }),
    )
  })

  // ── 7. No content + no fallback → renders icon without tooltip wrapper ──────

  it('renders the icon without a tooltip wrapper when content is null and no fallback', async () => {
    mockFetch.mockResolvedValue(null)

    const { Wrapper } = makeWrapper()
    const { container } = render(
      <Wrapper>
        <StrataInfoIcon surfaceKey="designer-portal/aesthete/engine-overview" />
      </Wrapper>,
    )

    await flushQueries()

    // Icon is rendered — the trigger button still exists as a stable visual
    // affordance (spec §13.4: silent absence keeps layouts from reflowing),
    // but it has no aria-describedby pointing at a tooltip and the canonical
    // Tooltip wrapper does NOT inject a Radix Trigger around it.
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()

    const button = screen.getByRole('button', { name: 'Patina concept' })
    expect(button).toBeInTheDocument()
    expect(button).not.toHaveAttribute('aria-describedby')

    // And no tooltip should be mounted — focusing the trigger must not open
    // a popover, because there is no body to render.
    await act(async () => {
      button.focus()
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  // ── 8. No CMS content + fallback string → renders fallback in tooltip ──────

  it('renders the fallback string as tooltip body when CMS returns null', async () => {
    mockFetch.mockResolvedValue(null)

    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <StrataInfoIcon
          surfaceKey="designer-portal/aesthete/engine-overview"
          fallback="A Patina concept — learn more soon."
        />
      </Wrapper>,
    )

    await flushQueries()

    const button = screen.getByRole('button', { name: 'Patina concept' })
    await act(async () => {
      button.focus()
      await new Promise((r) => setTimeout(r, 0))
    })

    const matches = await screen.findAllByText(
      'A Patina concept — learn more soon.',
    )
    expect(matches.length).toBeGreaterThanOrEqual(1)
  })

  // ── 9. Reduced motion — animation classes are motion-safe-gated ────────────

  it('guards tooltip animations behind motion-safe: variant (CSS-level reduced-motion respect)', async () => {
    mockFetch.mockResolvedValueOnce(STRATA_FIXTURE)

    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <StrataInfoIcon surfaceKey="designer-portal/aesthete/engine-overview" />
      </Wrapper>,
    )

    await flushQueries()

    const button = screen.getByRole('button', { name: 'Patina concept' })
    await act(async () => {
      button.focus()
      await new Promise((r) => setTimeout(r, 0))
    })

    // Canonical <Tooltip /> delegates reduced-motion to Tailwind's
    // `motion-safe:` variant — the animate-in / fade-in / zoom-in classes are
    // always present in the className but their CSS only applies when
    // (prefers-reduced-motion: no-preference) matches. Verify any animation
    // class is paired with the motion-safe: gate so the OS preference is
    // honored at the CSS layer.
    const styledContent = document.querySelector(
      '[data-radix-popper-content-wrapper] [data-state]',
    )
    expect(styledContent).not.toBeNull()
    const classes = styledContent?.className ?? ''
    const animationTokens = classes
      .split(/\s+/)
      .filter((c) => /animate-in|fade-in|zoom-in|animate-out|fade-out|zoom-out/.test(c))
    expect(animationTokens.length).toBeGreaterThan(0)
    for (const token of animationTokens) {
      expect(token.startsWith('motion-safe:')).toBe(true)
    }
  })

  // ── 10. Tooltip closes on Escape ────────────────────────────────────────────

  it('closes the tooltip on Escape key', async () => {
    mockFetch.mockResolvedValueOnce(STRATA_FIXTURE)

    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <StrataInfoIcon surfaceKey="designer-portal/aesthete/engine-overview" />
      </Wrapper>,
    )

    await flushQueries()

    const button = screen.getByRole('button', { name: 'Patina concept' })
    await act(async () => {
      button.focus()
      await new Promise((r) => setTimeout(r, 0))
    })

    // Tooltip is open — body text is in the DOM at least once.
    const beforeMatches = screen.queryAllByText(
      'The Aesthete Engine learns each designer’s style and proposes shapes accordingly.',
    )
    expect(beforeMatches.length).toBeGreaterThanOrEqual(1)

    await act(async () => {
      button.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      )
      await new Promise((r) => setTimeout(r, 10))
    })

    // After Escape, the body should no longer be rendered.
    const afterMatches = screen.queryAllByText(
      'The Aesthete Engine learns each designer’s style and proposes shapes accordingly.',
    )
    expect(afterMatches.length).toBe(0)
  })

  // ── 11. className passthrough on the trigger button ────────────────────────

  it('merges the className prop onto the trigger button', async () => {
    mockFetch.mockResolvedValueOnce(STRATA_FIXTURE)

    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <StrataInfoIcon
          surfaceKey="designer-portal/aesthete/engine-overview"
          className="custom-strata-class"
        />
      </Wrapper>,
    )

    await flushQueries()

    const button = screen.getByRole('button', { name: 'Patina concept' })
    expect(button.className).toContain('custom-strata-class')
  })

  // ── 12. PostHog absence does not crash ─────────────────────────────────────

  it('does not crash when window.posthog is undefined', async () => {
    delete (window as unknown as { posthog?: unknown }).posthog
    mockFetch.mockResolvedValueOnce(STRATA_FIXTURE)

    const { Wrapper } = makeWrapper()
    expect(() =>
      render(
        <Wrapper>
          <StrataInfoIcon surfaceKey="designer-portal/aesthete/engine-overview" />
        </Wrapper>,
      ),
    ).not.toThrow()

    await flushQueries()

    const button = screen.getByRole('button', { name: 'Patina concept' })
    await act(async () => {
      button.focus()
      await new Promise((r) => setTimeout(r, 0))
    })

    // Tooltip still shows even without posthog
    const matches = await screen.findAllByText(
      'The Aesthete Engine learns each designer’s style and proposes shapes accordingly.',
    )
    expect(matches.length).toBeGreaterThanOrEqual(1)
  })

  // ── 13. Eyebrow renders when present in CMS content ─────────────────────────

  it('renders the optional eyebrow label when CMS returns one', async () => {
    mockFetch.mockResolvedValueOnce(STRATA_FIXTURE)

    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <StrataInfoIcon surfaceKey="designer-portal/aesthete/engine-overview" />
      </Wrapper>,
    )

    await flushQueries()

    const button = screen.getByRole('button', { name: 'Patina concept' })
    await act(async () => {
      button.focus()
      await new Promise((r) => setTimeout(r, 0))
    })

    // Eyebrow is presentational (visible-only). Radix's SR announcer omits it.
    const matches = await screen.findAllByText('PATINA CONCEPT')
    expect(matches.length).toBeGreaterThanOrEqual(1)
  })
})
