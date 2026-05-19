/**
 * StrataInfoIcon — unit tests
 *
 * Reactive-layer component (spec §4.2) — a Patina-specific concept indicator
 * built on the StrataMark glyph (3 descending horizontal lines, Clay/terracotta
 * tone). Used ONLY for Patina-specific concepts (Aesthete Engine, FF&E stages,
 * Strata Mark, Founding Circle, Patina vocabulary). General "what does this
 * number mean?" questions use <InfoIcon /> (C2) instead.
 *
 * All Sanity client + posthog calls are mocked. No live network I/O.
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as Tooltip from '@radix-ui/react-tooltip'
import { StrataInfoIcon } from './StrataInfoIcon'
import type { TooltipContent } from '../../contentTypes'

// ─── Mock the Sanity client module ────────────────────────────────────────────

const mockFetch = vi.fn()

vi.mock('../../sanityClient', () => ({
  getSanityClient: () => ({ fetch: mockFetch }),
  _resetSanityClient: vi.fn(),
}))

// ─── Test wrapper ─────────────────────────────────────────────────────────────

function makeWrapper(reducedMotion = false) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  })

  // Provide a Tooltip.Provider so multiple StrataInfoIcons share open state
  // semantics; mirrors how portals will wrap their root layout.
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <Tooltip.Provider delayDuration={0} skipDelayDuration={0}>
        {children}
      </Tooltip.Provider>
    </QueryClientProvider>
  )

  // Stub matchMedia for the (prefers-reduced-motion) check.
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: reducedMotion && query.includes('reduce'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })

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

    expect(captureSpy).toHaveBeenCalledWith('help.tooltip.shown', {
      surface_key: 'designer-portal/aesthete/engine-overview',
      trigger: 'strata_info_icon',
    })
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

    // Icon is rendered
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    // No tooltip trigger button — when nothing to show, the icon is a plain
    // decorative element (no aria-describedby, no role=button).
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
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

  // ── 9. Reduced motion (prefers-reduced-motion) — data attr or class ────────

  it('marks the tooltip with data-reduced-motion when prefers-reduced-motion is set', async () => {
    mockFetch.mockResolvedValueOnce(STRATA_FIXTURE)

    const { Wrapper, queryClient: _qc } = makeWrapper(true) // reducedMotion = true
    void _qc
    const { container } = render(
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

    // Radix uses role="tooltip" on the SR announcer (a visually-hidden span);
    // the positioned content element is the one that should carry the
    // data-reduced-motion attribute. Query it via the data attr directly.
    const tooltipWithAttr =
      document.querySelector('[data-reduced-motion="true"]') ??
      container.querySelector('[data-reduced-motion="true"]')
    expect(tooltipWithAttr).not.toBeNull()
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
