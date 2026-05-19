/**
 * LearnMore — unit tests
 *
 * Reactive-layer component (spec §4.5) — inline "↓ Learn more" disclosure.
 * Uses Radix Collapsible primitives; CMS-backed via useHelpContent; portal-agnostic
 * analytics via window.posthog.
 *
 * All Sanity client + posthog calls are mocked. No live network I/O.
 *
 * Behaviour matrix:
 *  - collapsed by default
 *  - expand on click fires `help.learnmore.expanded` with snake_case `surface_key`
 *  - collapse fires `help.learnmore.collapsed` with `surface_key` + `duration_ms`
 *  - respects defaultOpen
 *  - renders fallback in collapsed/expanded panel when CMS returns null + fallback prop
 *  - renders nothing when CMS returns null and no fallback
 *  - a11y: aria-expanded toggles on the trigger button
 *  - keyboard: Space/Enter toggles the disclosure
 *  - custom label honored
 *  - className passthrough
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LearnMore } from './LearnMore'
import type { LearnMoreContent } from '../../contentTypes'

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
  // Two ticks: useQuery resolves promise + commits state.
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 0))
}

// ─── Fixture ──────────────────────────────────────────────────────────────────

const SURFACE_KEY = 'designer-portal/pipeline/project-list'

const learnMoreFixture: LearnMoreContent = {
  surfaceKey: SURFACE_KEY,
  persona: 'all',
  contentType: 'learnMore',
  body: 'The pipeline shows every project from first lead through final install.',
}

// ─── PostHog stub helpers ─────────────────────────────────────────────────────

interface PosthogStub {
  capture: ReturnType<typeof vi.fn>
}

function installPosthogStub(): PosthogStub {
  const stub: PosthogStub = { capture: vi.fn() }
  ;(window as unknown as { posthog?: PosthogStub }).posthog = stub
  return stub
}

function uninstallPosthogStub(): void {
  delete (window as unknown as { posthog?: PosthogStub }).posthog
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('<LearnMore />', () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>
  let posthog: PosthogStub

  beforeEach(() => {
    vi.clearAllMocks()
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    posthog = installPosthogStub()
  })

  afterEach(() => {
    consoleWarnSpy.mockRestore()
    uninstallPosthogStub()
    vi.useRealTimers()
  })

  // ── 1. Collapsed by default ────────────────────────────────────────────────

  it('renders collapsed by default — body is not visible', async () => {
    mockFetch.mockResolvedValueOnce(learnMoreFixture)

    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <LearnMore surfaceKey={SURFACE_KEY} />
      </Wrapper>,
    )

    await flushQueries()

    const trigger = screen.getByRole('button', { name: /learn more/i })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    // Radix Collapsible: when closed, content is unmounted (default behavior).
    expect(screen.queryByText(learnMoreFixture.body)).not.toBeInTheDocument()
  })

  it('uses default label "Learn more"', async () => {
    mockFetch.mockResolvedValueOnce(learnMoreFixture)

    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <LearnMore surfaceKey={SURFACE_KEY} />
      </Wrapper>,
    )

    await flushQueries()

    expect(screen.getByRole('button', { name: /^learn more$/i })).toBeInTheDocument()
  })

  it('honors the custom label prop', async () => {
    mockFetch.mockResolvedValueOnce(learnMoreFixture)

    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <LearnMore surfaceKey={SURFACE_KEY} label="Why does this matter?" />
      </Wrapper>,
    )

    await flushQueries()

    expect(
      screen.getByRole('button', { name: /why does this matter\?/i }),
    ).toBeInTheDocument()
  })

  // ── 2. defaultOpen ─────────────────────────────────────────────────────────

  it('respects defaultOpen=true — body is visible immediately', async () => {
    mockFetch.mockResolvedValueOnce(learnMoreFixture)

    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <LearnMore surfaceKey={SURFACE_KEY} defaultOpen />
      </Wrapper>,
    )

    await flushQueries()

    const trigger = screen.getByRole('button', { name: /learn more/i })
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText(learnMoreFixture.body)).toBeInTheDocument()
  })

  // ── 3. Expand fires analytics ──────────────────────────────────────────────

  it('expand fires help.learnmore.expanded with snake_case surface_key', async () => {
    mockFetch.mockResolvedValueOnce(learnMoreFixture)

    const user = userEvent.setup()
    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <LearnMore surfaceKey={SURFACE_KEY} />
      </Wrapper>,
    )

    await flushQueries()

    const trigger = screen.getByRole('button', { name: /learn more/i })
    await user.click(trigger)

    expect(posthog.capture).toHaveBeenCalledWith('help.learnmore.expanded', {
      surface_key: SURFACE_KEY,
    })
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText(learnMoreFixture.body)).toBeInTheDocument()
  })

  // ── 4. Collapse fires analytics with duration_ms ───────────────────────────

  it('collapse fires help.learnmore.collapsed with surface_key + duration_ms', async () => {
    mockFetch.mockResolvedValueOnce(learnMoreFixture)

    // Fake timers so we can advance the elapsed duration deterministically.
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <LearnMore surfaceKey={SURFACE_KEY} />
      </Wrapper>,
    )

    // Need to flush even with fake timers — react-query async resolution.
    await vi.advanceTimersByTimeAsync(50)

    const trigger = screen.getByRole('button', { name: /learn more/i })
    await user.click(trigger) // expand
    expect(posthog.capture).toHaveBeenCalledWith('help.learnmore.expanded', {
      surface_key: SURFACE_KEY,
    })

    // Advance time before collapse so duration_ms is measurable.
    await act(async () => {
      vi.advanceTimersByTime(750)
    })

    await user.click(trigger) // collapse

    const collapseCalls = posthog.capture.mock.calls.filter(
      (call) => call[0] === 'help.learnmore.collapsed',
    )
    expect(collapseCalls).toHaveLength(1)
    const [, props] = collapseCalls[0]
    expect(props).toMatchObject({ surface_key: SURFACE_KEY })
    expect(props.duration_ms).toBeTypeOf('number')
    expect(props.duration_ms).toBeGreaterThanOrEqual(750)
  })

  it('emits collapsed when defaultOpen=true is closed by the user, with duration from mount', async () => {
    mockFetch.mockResolvedValueOnce(learnMoreFixture)

    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <LearnMore surfaceKey={SURFACE_KEY} defaultOpen />
      </Wrapper>,
    )

    await vi.advanceTimersByTimeAsync(50)

    await act(async () => {
      vi.advanceTimersByTime(500)
    })

    const trigger = screen.getByRole('button', { name: /learn more/i })
    await user.click(trigger) // collapse

    const collapseCalls = posthog.capture.mock.calls.filter(
      (call) => call[0] === 'help.learnmore.collapsed',
    )
    expect(collapseCalls).toHaveLength(1)
    const [, props] = collapseCalls[0]
    expect(props.surface_key).toBe(SURFACE_KEY)
    expect(props.duration_ms).toBeGreaterThanOrEqual(500)
  })

  // ── 5. Fallback rendering ──────────────────────────────────────────────────

  it('renders the fallback inside the panel when CMS returns null + fallback', async () => {
    mockFetch.mockResolvedValue(null)

    const user = userEvent.setup()
    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <LearnMore
          surfaceKey={SURFACE_KEY}
          fallback="Pipeline = lead → install."
        />
      </Wrapper>,
    )

    await flushQueries()

    const trigger = screen.getByRole('button', { name: /learn more/i })
    await user.click(trigger)

    expect(screen.getByText('Pipeline = lead → install.')).toBeInTheDocument()
  })

  // ── 6. Silent absence when null + no fallback ──────────────────────────────

  it('renders nothing when CMS returns null and no fallback is provided', async () => {
    mockFetch.mockResolvedValue(null)

    const { Wrapper } = makeWrapper()
    const { container } = render(
      <Wrapper>
        <LearnMore surfaceKey={SURFACE_KEY} />
      </Wrapper>,
    )

    await flushQueries()

    expect(container.firstChild).toBeNull()
    expect(screen.queryByRole('button', { name: /learn more/i })).not.toBeInTheDocument()
  })

  // ── 7. a11y: aria-expanded ─────────────────────────────────────────────────

  it('toggles aria-expanded on the trigger button', async () => {
    mockFetch.mockResolvedValueOnce(learnMoreFixture)

    const user = userEvent.setup()
    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <LearnMore surfaceKey={SURFACE_KEY} />
      </Wrapper>,
    )

    await flushQueries()

    const trigger = screen.getByRole('button', { name: /learn more/i })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')

    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  // ── 8. Keyboard: Space + Enter toggle ──────────────────────────────────────

  it('toggles via Enter key on the focused trigger', async () => {
    mockFetch.mockResolvedValueOnce(learnMoreFixture)

    const user = userEvent.setup()
    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <LearnMore surfaceKey={SURFACE_KEY} />
      </Wrapper>,
    )

    await flushQueries()

    const trigger = screen.getByRole('button', { name: /learn more/i })
    trigger.focus()
    await user.keyboard('{Enter}')

    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(posthog.capture).toHaveBeenCalledWith(
      'help.learnmore.expanded',
      expect.objectContaining({ surface_key: SURFACE_KEY }),
    )
  })

  it('toggles via Space key on the focused trigger', async () => {
    mockFetch.mockResolvedValueOnce(learnMoreFixture)

    const user = userEvent.setup()
    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <LearnMore surfaceKey={SURFACE_KEY} />
      </Wrapper>,
    )

    await flushQueries()

    const trigger = screen.getByRole('button', { name: /learn more/i })
    trigger.focus()
    await user.keyboard(' ')

    expect(trigger).toHaveAttribute('aria-expanded', 'true')
  })

  // ── 9. className passthrough ───────────────────────────────────────────────

  it('applies the className prop to the outer container', async () => {
    mockFetch.mockResolvedValueOnce(learnMoreFixture)

    const { Wrapper } = makeWrapper()
    const { container } = render(
      <Wrapper>
        <LearnMore surfaceKey={SURFACE_KEY} className="my-learn-more" />
      </Wrapper>,
    )

    await flushQueries()

    expect(container.querySelector('.my-learn-more')).not.toBeNull()
  })

  // ── 10. PostHog absence is non-fatal ───────────────────────────────────────

  it('does not throw when window.posthog is undefined and the user clicks', async () => {
    uninstallPosthogStub()
    mockFetch.mockResolvedValueOnce(learnMoreFixture)

    const user = userEvent.setup()
    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <LearnMore surfaceKey={SURFACE_KEY} />
      </Wrapper>,
    )

    await flushQueries()

    const trigger = screen.getByRole('button', { name: /learn more/i })
    await expect(user.click(trigger)).resolves.not.toThrow()
    expect(trigger).toHaveAttribute('aria-expanded', 'true')

    await expect(user.click(trigger)).resolves.not.toThrow()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })
})
