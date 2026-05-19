/**
 * InfoIcon — unit tests
 *
 * Reactive-layer component (spec §4.2). Renders a 14px "?" glyph trigger
 * that opens a Sanity-backed tooltip on hover or focus.
 *
 * All Sanity client + posthog calls are mocked. No live network I/O.
 *
 * NOTE: Radix Tooltip's hover detection in JSDOM is unreliable (pointer-events
 * + popper measurements that don't run without a real layout engine). We use
 * focus/blur to exercise the tooltip lifecycle and a controlled-open render
 * path for content assertions — same code paths, deterministic in JSDOM.
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as RadixTooltip from '@radix-ui/react-tooltip'
import { InfoIcon } from './InfoIcon'
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
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <RadixTooltip.Provider delayDuration={0} skipDelayDuration={0}>
        {children}
      </RadixTooltip.Provider>
    </QueryClientProvider>
  )
  return { Wrapper, queryClient }
}

async function flushQueries() {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 0))
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SURFACE_KEY = 'designer-portal/aesthete/score-meaning'

const tooltipFixture: TooltipContent = {
  surfaceKey: SURFACE_KEY,
  persona: 'all',
  contentType: 'tooltip',
  body: 'Composite of room scores for designers you follow most.',
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('<InfoIcon />', () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>
  let captureSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    captureSpy = vi.fn()
    ;(window as unknown as { posthog?: { capture: typeof captureSpy } }).posthog = {
      capture: captureSpy,
    }
  })

  afterEach(() => {
    consoleWarnSpy.mockRestore()
    delete (window as unknown as { posthog?: unknown }).posthog
    vi.useRealTimers()
  })

  // ── 1. Renders the glyph ────────────────────────────────────────────────────

  it('renders a "?" glyph trigger button', async () => {
    mockFetch.mockResolvedValue(null)

    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <InfoIcon surfaceKey={SURFACE_KEY} />
      </Wrapper>,
    )

    await flushQueries()

    const btn = screen.getByRole('button', { name: 'More information' })
    expect(btn).toBeInTheDocument()
    expect(btn.textContent).toBe('?')
  })

  it('uses the default 14px size', async () => {
    mockFetch.mockResolvedValue(null)

    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <InfoIcon surfaceKey={SURFACE_KEY} />
      </Wrapper>,
    )

    await flushQueries()

    const btn = screen.getByRole('button', { name: 'More information' })
    expect(btn.style.width).toBe('14px')
    expect(btn.style.height).toBe('14px')
  })

  it('respects a custom size prop', async () => {
    mockFetch.mockResolvedValue(null)

    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <InfoIcon surfaceKey={SURFACE_KEY} size={16} />
      </Wrapper>,
    )

    await flushQueries()

    const btn = screen.getByRole('button', { name: 'More information' })
    expect(btn.style.width).toBe('16px')
    expect(btn.style.height).toBe('16px')
  })

  it('uses a custom ariaLabel when provided', async () => {
    mockFetch.mockResolvedValue(null)

    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <InfoIcon surfaceKey={SURFACE_KEY} ariaLabel="What is an Aesthete Score?" />
      </Wrapper>,
    )

    await flushQueries()

    expect(
      screen.getByRole('button', { name: 'What is an Aesthete Score?' }),
    ).toBeInTheDocument()
  })

  it('merges className onto the trigger button', async () => {
    mockFetch.mockResolvedValue(null)

    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <InfoIcon surfaceKey={SURFACE_KEY} className="ml-2" />
      </Wrapper>,
    )

    await flushQueries()

    const btn = screen.getByRole('button', { name: 'More information' })
    expect(btn).toHaveClass('ml-2')
  })

  // ── 2. Tooltip shows on focus (keyboard a11y) ───────────────────────────────

  it('shows the tooltip on focus and renders the CMS body with role="tooltip"', async () => {
    mockFetch.mockResolvedValueOnce(tooltipFixture)

    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <InfoIcon surfaceKey={SURFACE_KEY} />
      </Wrapper>,
    )

    await flushQueries()

    const btn = screen.getByRole('button', { name: 'More information' })

    await act(async () => {
      btn.focus()
      await flushQueries()
    })

    const tip = await screen.findByRole('tooltip')
    expect(tip).toHaveTextContent('Composite of room scores for designers you follow most.')
  })

  // ── 3. Analytics: shown + dismissed with snake_case keys ────────────────────

  it('fires help.tooltip.shown with snake_case keys when shown via focus', async () => {
    mockFetch.mockResolvedValueOnce(tooltipFixture)

    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <InfoIcon surfaceKey={SURFACE_KEY} />
      </Wrapper>,
    )

    await flushQueries()

    const btn = screen.getByRole('button', { name: 'More information' })
    await act(async () => {
      btn.focus()
      await flushQueries()
    })

    // findByRole confirms the tooltip mounted (= onOpenChange fired)
    await screen.findByRole('tooltip')

    expect(captureSpy).toHaveBeenCalledWith('help.tooltip.shown', {
      surface_key: SURFACE_KEY,
      trigger: 'info_icon',
    })
  })

  it('fires help.tooltip.dismissed with duration_ms (snake_case) on close', async () => {
    mockFetch.mockResolvedValueOnce(tooltipFixture)

    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <InfoIcon surfaceKey={SURFACE_KEY} />
      </Wrapper>,
    )

    await flushQueries()

    const btn = screen.getByRole('button', { name: 'More information' })
    await act(async () => {
      btn.focus()
      await flushQueries()
    })

    await screen.findByRole('tooltip')

    await act(async () => {
      btn.blur()
      await flushQueries()
    })

    const dismissedCall = captureSpy.mock.calls.find(
      ([name]) => name === 'help.tooltip.dismissed',
    )
    expect(dismissedCall).toBeTruthy()
    const [, props] = dismissedCall!
    expect(props).toMatchObject({
      surface_key: SURFACE_KEY,
      trigger: 'info_icon',
    })
    expect(typeof props.duration_ms).toBe('number')
    expect(props.duration_ms).toBeGreaterThanOrEqual(0)
  })

  // ── 4. Loading state: still renders the glyph (icon is the affordance) ──────

  it('renders the glyph immediately even while the CMS query is loading', () => {
    mockFetch.mockReturnValue(new Promise(() => undefined)) // never resolves

    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <InfoIcon surfaceKey={SURFACE_KEY} />
      </Wrapper>,
    )

    // Glyph is the visual affordance — it must be present synchronously so
    // the page doesn't reflow when CMS resolves.
    expect(screen.getByRole('button', { name: 'More information' })).toBeInTheDocument()
  })

  // ── 5. No content + no fallback: glyph renders but tooltip is suppressed ────

  it('renders a static glyph (no tooltip) when CMS returns null and no fallback given', async () => {
    mockFetch.mockResolvedValue(null)

    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <InfoIcon surfaceKey={SURFACE_KEY} />
      </Wrapper>,
    )

    await flushQueries()

    const btn = screen.getByRole('button', { name: 'More information' })
    expect(btn).toBeInTheDocument()

    await act(async () => {
      btn.focus()
      await flushQueries()
    })

    // No tooltip should ever mount because there is no body to render.
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    // And no analytics fire for a tooltip that never showed.
    expect(captureSpy).not.toHaveBeenCalled()
  })

  it('renders the fallback body in the tooltip when CMS returns null but fallback given', async () => {
    mockFetch.mockResolvedValue(null)

    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <InfoIcon surfaceKey={SURFACE_KEY} fallback="Fallback explainer copy." />
      </Wrapper>,
    )

    await flushQueries()

    const btn = screen.getByRole('button', { name: 'More information' })
    await act(async () => {
      btn.focus()
      await flushQueries()
    })

    const tip = await screen.findByRole('tooltip')
    expect(tip).toHaveTextContent('Fallback explainer copy.')
  })

  // ── 6. Reduced motion: no fade animation class applied ──────────────────────

  it('omits the fade-in animation class when prefers-reduced-motion is set', async () => {
    // Re-mock matchMedia to report reduced-motion = true
    const originalMM = window.matchMedia
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('prefers-reduced-motion'),
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })

    mockFetch.mockResolvedValueOnce(tooltipFixture)

    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <InfoIcon surfaceKey={SURFACE_KEY} />
      </Wrapper>,
    )

    await flushQueries()

    const btn = screen.getByRole('button', { name: 'More information' })
    await act(async () => {
      btn.focus()
      await flushQueries()
    })

    const tip = await screen.findByRole('tooltip')
    expect(tip.className).not.toMatch(/animate-in|fade-in/)

    // Restore
    Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: originalMM })
  })

  // ── 7. PostHog absent: never throws ─────────────────────────────────────────

  it('does not crash when window.posthog is undefined', async () => {
    delete (window as unknown as { posthog?: unknown }).posthog
    mockFetch.mockResolvedValueOnce(tooltipFixture)

    const { Wrapper } = makeWrapper()
    expect(() =>
      render(
        <Wrapper>
          <InfoIcon surfaceKey={SURFACE_KEY} />
        </Wrapper>,
      ),
    ).not.toThrow()

    await flushQueries()

    const btn = screen.getByRole('button', { name: 'More information' })
    await act(async () => {
      btn.focus()
      await flushQueries()
    })

    await screen.findByRole('tooltip')
  })

  // ── 8. Escape closes the tooltip (Radix wires this; we verify the path) ────

  it('closes the tooltip on Escape key', async () => {
    mockFetch.mockResolvedValueOnce(tooltipFixture)

    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <InfoIcon surfaceKey={SURFACE_KEY} />
      </Wrapper>,
    )

    await flushQueries()

    const btn = screen.getByRole('button', { name: 'More information' })
    await act(async () => {
      btn.focus()
      await flushQueries()
    })

    await screen.findByRole('tooltip')

    await act(async () => {
      fireEvent.keyDown(document.body, { key: 'Escape' })
      await flushQueries()
    })

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })
})
