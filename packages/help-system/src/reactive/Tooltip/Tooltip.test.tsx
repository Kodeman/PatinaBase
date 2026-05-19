/**
 * Tooltip — unit tests
 *
 * Reactive-layer component (spec §4.1) that renders CMS-backed copy in a Radix
 * Tooltip primitive. Wraps a trigger child (typically <InfoIcon /> or
 * <StrataInfoIcon />), portal-renders the tooltip body, fires analytics on
 * show + dismiss, and gracefully degrades to a no-op wrapper when both CMS
 * and fallback are empty.
 *
 * All Sanity client + posthog calls are mocked. No live network I/O.
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Tooltip } from './Tooltip'
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
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return { Wrapper, queryClient }
}

async function flushQueries() {
  // Let useQuery resolve its promise + commit state. Two ticks is enough for the
  // mocked fetch path (fetch is synchronously resolved by Promise.resolve).
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const tooltipFixture: TooltipContent = {
  surfaceKey: 'designer-portal/aesthete/score-meaning',
  persona: 'all',
  contentType: 'tooltip',
  body: 'A snapshot of how cohesive the room reads from a single viewpoint.',
}

const tooltipWithEyebrow: TooltipContent = {
  surfaceKey: 'designer-portal/aesthete/score-meaning',
  persona: 'all',
  contentType: 'tooltip',
  eyebrow: 'What this means',
  body: 'A snapshot of how cohesive the room reads from a single viewpoint.',
}

// 161 chars — exceeds the 160-char authoring cap (spec §8)
const tooltipLongBody: TooltipContent = {
  surfaceKey: 'designer-portal/aesthete/score-meaning',
  persona: 'all',
  contentType: 'tooltip',
  body:
    'A snapshot of how cohesive the room reads from a single viewpoint, ' +
    'taking into account harmony of materials, color, scale, and the relationships ' +
    'between forms and X.',
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('<Tooltip />', () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>
  let captureSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    // Mock window.posthog (portal-agnostic capture path)
    captureSpy = vi.fn()
    ;(window as unknown as { posthog?: { capture: typeof captureSpy } }).posthog = {
      capture: captureSpy,
    }
  })

  afterEach(() => {
    consoleWarnSpy.mockRestore()
    delete (window as unknown as { posthog?: unknown }).posthog
  })

  // ── 1. Renders trigger when CMS returns content ─────────────────────────────

  it('renders the trigger child when Sanity returns tooltip content', async () => {
    mockFetch.mockResolvedValueOnce(tooltipFixture)

    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <Tooltip surfaceKey="designer-portal/aesthete/score-meaning">
          <button type="button">More info</button>
        </Tooltip>
      </Wrapper>,
    )

    await flushQueries()

    expect(screen.getByRole('button', { name: 'More info' })).toBeInTheDocument()
  })

  // ── 2. Renders trigger only (no wrapper) when no content + no fallback ──────

  it('renders the trigger directly (without tooltip wrapper) when CMS returns null and no fallback is provided', async () => {
    mockFetch.mockResolvedValue(null) // every fallback step misses

    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <Tooltip surfaceKey="designer-portal/aesthete/score-meaning">
          <button type="button" data-testid="trigger">
            More info
          </button>
        </Tooltip>
      </Wrapper>,
    )

    await flushQueries()

    // Trigger still rendered
    const trigger = screen.getByTestId('trigger')
    expect(trigger).toBeInTheDocument()

    // No tooltip wiring: trigger has no aria-describedby pointing at a tooltip
    expect(trigger).not.toHaveAttribute('aria-describedby')
  })

  // ── 3. Renders fallback in tooltip when CMS null + fallback given ───────────

  it('renders the fallback in the tooltip when CMS returns null and fallback is provided', async () => {
    mockFetch.mockResolvedValue(null)

    const user = userEvent.setup()
    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <Tooltip
          surfaceKey="designer-portal/aesthete/score-meaning"
          fallback="Inline fallback copy."
          delayMs={0}
        >
          <button type="button">More info</button>
        </Tooltip>
      </Wrapper>,
    )

    await flushQueries()

    await user.hover(screen.getByRole('button', { name: 'More info' }))

    // Radix renders the tooltip after the hover delay
    const tip = await screen.findByRole('tooltip')
    expect(tip).toHaveTextContent('Inline fallback copy.')
  })

  // ── 4. Fires shown event on first open + dismissed on close ─────────────────

  it('fires help.tooltip.shown via window.posthog when the tooltip opens', async () => {
    mockFetch.mockResolvedValueOnce(tooltipFixture)

    const user = userEvent.setup()
    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <Tooltip
          surfaceKey="designer-portal/aesthete/score-meaning"
          delayMs={0}
        >
          <button type="button">More info</button>
        </Tooltip>
      </Wrapper>,
    )

    await flushQueries()

    await user.hover(screen.getByRole('button', { name: 'More info' }))
    await screen.findByRole('tooltip')

    expect(captureSpy).toHaveBeenCalledWith(
      'help.tooltip.shown',
      expect.objectContaining({
        surface_key: 'designer-portal/aesthete/score-meaning',
      }),
    )
  })

  it('fires help.tooltip.dismissed with duration_ms on close', async () => {
    mockFetch.mockResolvedValueOnce(tooltipFixture)

    const user = userEvent.setup()
    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <Tooltip
          surfaceKey="designer-portal/aesthete/score-meaning"
          delayMs={0}
        >
          <button type="button">More info</button>
        </Tooltip>
      </Wrapper>,
    )

    await flushQueries()

    const trigger = screen.getByRole('button', { name: 'More info' })
    trigger.focus()
    await screen.findByRole('tooltip')

    // Escape closes the tooltip — Radix wires this by default per spec §4.1.
    await user.keyboard('{Escape}')

    // Wait for dismissed event
    await vi.waitFor(
      () => {
        expect(
          captureSpy.mock.calls.some(([event]) => event === 'help.tooltip.dismissed'),
        ).toBe(true)
      },
      { timeout: 2000 },
    )

    const dismissedCall = captureSpy.mock.calls.find(
      ([event]) => event === 'help.tooltip.dismissed',
    )
    expect(dismissedCall).toBeDefined()
    const [, props] = dismissedCall as [string, Record<string, unknown>]
    expect(props.surface_key).toBe('designer-portal/aesthete/score-meaning')
    expect(typeof props.duration_ms).toBe('number')
    expect(props.duration_ms as number).toBeGreaterThanOrEqual(0)
  })

  it('does not crash when window.posthog is undefined', async () => {
    delete (window as unknown as { posthog?: unknown }).posthog
    mockFetch.mockResolvedValueOnce(tooltipFixture)

    const user = userEvent.setup()
    const { Wrapper } = makeWrapper()
    expect(() =>
      render(
        <Wrapper>
          <Tooltip
            surfaceKey="designer-portal/aesthete/score-meaning"
            delayMs={0}
          >
            <button type="button">More info</button>
          </Tooltip>
        </Wrapper>,
      ),
    ).not.toThrow()

    await flushQueries()

    await user.hover(screen.getByRole('button', { name: 'More info' }))
    expect(await screen.findByRole('tooltip')).toBeInTheDocument()
  })

  // ── 5. Accessibility wiring ─────────────────────────────────────────────────

  it('wires aria-describedby on trigger and role="tooltip" on content when open', async () => {
    mockFetch.mockResolvedValueOnce(tooltipFixture)

    const user = userEvent.setup()
    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <Tooltip
          surfaceKey="designer-portal/aesthete/score-meaning"
          delayMs={0}
        >
          <button type="button">More info</button>
        </Tooltip>
      </Wrapper>,
    )

    await flushQueries()

    const trigger = screen.getByRole('button', { name: 'More info' })
    await user.hover(trigger)

    const tip = await screen.findByRole('tooltip')
    expect(tip).toBeInTheDocument()

    // Radix sets aria-describedby on the trigger pointing at the content
    const describedBy = trigger.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    expect(tip.getAttribute('id')).toBe(describedBy)
  })

  it('renders the body text inside the tooltip when open', async () => {
    mockFetch.mockResolvedValueOnce(tooltipFixture)

    const user = userEvent.setup()
    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <Tooltip
          surfaceKey="designer-portal/aesthete/score-meaning"
          delayMs={0}
        >
          <button type="button">More info</button>
        </Tooltip>
      </Wrapper>,
    )

    await flushQueries()
    await user.hover(screen.getByRole('button', { name: 'More info' }))

    const tip = await screen.findByRole('tooltip')
    expect(tip).toHaveTextContent(
      'A snapshot of how cohesive the room reads from a single viewpoint.',
    )
  })

  it('renders the optional eyebrow label above the body when present', async () => {
    mockFetch.mockResolvedValueOnce(tooltipWithEyebrow)

    const user = userEvent.setup()
    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <Tooltip
          surfaceKey="designer-portal/aesthete/score-meaning"
          delayMs={0}
        >
          <button type="button">More info</button>
        </Tooltip>
      </Wrapper>,
    )

    await flushQueries()
    await user.hover(screen.getByRole('button', { name: 'More info' }))

    const tip = await screen.findByRole('tooltip')
    expect(tip).toHaveTextContent('What this means')
    expect(tip).toHaveTextContent(
      'A snapshot of how cohesive the room reads from a single viewpoint.',
    )
  })

  // ── 6. Dev warning when body exceeds 160 chars ──────────────────────────────

  it('logs a dev warning when CMS body exceeds 160 chars', async () => {
    mockFetch.mockResolvedValueOnce(tooltipLongBody)

    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <Tooltip
          surfaceKey="designer-portal/aesthete/score-meaning"
          delayMs={0}
        >
          <button type="button">More info</button>
        </Tooltip>
      </Wrapper>,
    )

    await flushQueries()

    expect(
      consoleWarnSpy.mock.calls.some((args) =>
        String(args[0]).includes('160'),
      ),
    ).toBe(true)
  })

  it('does not warn when CMS body is within the 160 char cap', async () => {
    mockFetch.mockResolvedValueOnce(tooltipFixture)

    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <Tooltip
          surfaceKey="designer-portal/aesthete/score-meaning"
          delayMs={0}
        >
          <button type="button">More info</button>
        </Tooltip>
      </Wrapper>,
    )

    await flushQueries()

    // Only the over-length warning is being checked; absence of any '160' warn
    // is the negative assertion here.
    expect(
      consoleWarnSpy.mock.calls.some((args) =>
        String(args[0]).includes('160'),
      ),
    ).toBe(false)
  })

  // ── 7. Respects hover delay (spec §12) ──────────────────────────────────────

  it('respects the delayMs prop (does not open immediately on hover)', async () => {
    mockFetch.mockResolvedValueOnce(tooltipFixture)

    const user = userEvent.setup()
    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <Tooltip
          surfaceKey="designer-portal/aesthete/score-meaning"
          delayMs={500}
        >
          <button type="button">More info</button>
        </Tooltip>
      </Wrapper>,
    )

    await flushQueries()

    await user.hover(screen.getByRole('button', { name: 'More info' }))

    // Immediately after hover, the tooltip should NOT yet be present —
    // Radix waits for delayDuration before opening.
    expect(screen.queryByRole('tooltip')).toBeNull()

    // After the delay elapses, it appears.
    await screen.findByRole('tooltip', undefined, { timeout: 1500 })
  })

  // ── 8. Passes through Radix side / align props ──────────────────────────────

  it('passes through side and align props to the tooltip content', async () => {
    mockFetch.mockResolvedValueOnce(tooltipFixture)

    const user = userEvent.setup()
    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <Tooltip
          surfaceKey="designer-portal/aesthete/score-meaning"
          delayMs={0}
          side="right"
          align="start"
        >
          <button type="button">More info</button>
        </Tooltip>
      </Wrapper>,
    )

    await flushQueries()
    await user.hover(screen.getByRole('button', { name: 'More info' }))

    // The visible styled content sits in the popper wrapper and exposes
    // data-side / data-align; the role="tooltip" element is the inner
    // aria-only span Radix adds for screen readers.
    await screen.findByRole('tooltip')
    const styledContent = document.querySelector('[data-radix-popper-content-wrapper] [data-side]')
    expect(styledContent).not.toBeNull()
    // align is preserved through Floating UI's collision pipeline; side may
    // flip in jsdom (no real layout), so we assert presence + align only.
    expect(styledContent?.getAttribute('data-align')).toBe('start')
    expect(['top', 'right', 'bottom', 'left']).toContain(
      styledContent?.getAttribute('data-side'),
    )
  })
})
