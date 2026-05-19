/**
 * FieldHelper — unit tests
 *
 * Ambient-layer component (spec §4.4) that renders microcopy anticipating
 * user questions on form fields. CMS-backed via useHelpContent; portal-agnostic
 * analytics via window.posthog.
 *
 * All Sanity client + posthog calls are mocked. No live network I/O.
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { FieldHelper } from './FieldHelper'
import type { FieldHelperContent, TooltipContent } from '../../contentTypes'

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
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 0))
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const helperFixture: FieldHelperContent = {
  surfaceKey: 'designer-portal/today/dashboard',
  persona: 'all',
  contentType: 'fieldHelper',
  body: 'Visible to client. Use clear, descriptive language.',
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('<FieldHelper />', () => {
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

  // ── 1. Renders body when content present ────────────────────────────────────

  it('renders the body copy when Sanity returns fieldHelper content', async () => {
    mockFetch.mockResolvedValueOnce(helperFixture)

    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <FieldHelper surfaceKey="designer-portal/today/dashboard" />
      </Wrapper>,
    )

    await flushQueries()

    expect(
      screen.getByText('Visible to client. Use clear, descriptive language.'),
    ).toBeInTheDocument()
  })

  // ── 2. Renders fallback when null + fallback given ──────────────────────────

  it('renders the fallback string when Sanity returns null and fallback is provided', async () => {
    mockFetch.mockResolvedValue(null) // every fallback step misses

    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <FieldHelper
          surfaceKey="designer-portal/today/dashboard"
          fallback="Inline fallback copy."
        />
      </Wrapper>,
    )

    await flushQueries()

    expect(screen.getByText('Inline fallback copy.')).toBeInTheDocument()
  })

  // ── 3. Renders nothing when null + no fallback ──────────────────────────────

  it('renders nothing when Sanity returns null and no fallback is provided', async () => {
    mockFetch.mockResolvedValue(null)

    const { Wrapper } = makeWrapper()
    const { container } = render(
      <Wrapper>
        <FieldHelper surfaceKey="designer-portal/today/dashboard" />
      </Wrapper>,
    )

    await flushQueries()

    // No <p>, no text — silent absence per spec §13.4
    expect(container.querySelector('p')).toBeNull()
    expect(container.textContent).toBe('')
  })

  // ── 4. Does not render while loading ────────────────────────────────────────

  it('renders nothing while the query is loading (no fallback flash)', () => {
    mockFetch.mockReturnValue(new Promise(() => undefined)) // never resolves

    const { Wrapper } = makeWrapper()
    const { container } = render(
      <Wrapper>
        <FieldHelper
          surfaceKey="designer-portal/today/dashboard"
          fallback="Should not appear during load."
        />
      </Wrapper>,
    )

    // Synchronous assertion — query is still pending
    expect(container.querySelector('p')).toBeNull()
    expect(screen.queryByText('Should not appear during load.')).not.toBeInTheDocument()
  })

  // ── 5. Fires PostHog event once on mount ────────────────────────────────────

  it('fires help.field_helper.shown via window.posthog once when body renders', async () => {
    mockFetch.mockResolvedValueOnce(helperFixture)

    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <FieldHelper surfaceKey="designer-portal/today/dashboard" />
      </Wrapper>,
    )

    await flushQueries()

    expect(captureSpy).toHaveBeenCalledTimes(1)
    expect(captureSpy).toHaveBeenCalledWith('help.field_helper.shown', {
      surface_key: 'designer-portal/today/dashboard',
    })
  })

  it('does not fire the analytics event when content is null', async () => {
    mockFetch.mockResolvedValue(null)

    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <FieldHelper
          surfaceKey="designer-portal/today/dashboard"
          fallback="Fallback copy."
        />
      </Wrapper>,
    )

    await flushQueries()

    // Fallback rendered, but no Sanity-backed body → no analytics
    expect(captureSpy).not.toHaveBeenCalled()
  })

  it('fires the analytics event only once across re-renders with the same surfaceKey', async () => {
    mockFetch.mockResolvedValue(helperFixture)

    const { Wrapper } = makeWrapper()
    const { rerender } = render(
      <Wrapper>
        <FieldHelper surfaceKey="designer-portal/today/dashboard" />
      </Wrapper>,
    )

    await flushQueries()

    rerender(
      <Wrapper>
        <FieldHelper surfaceKey="designer-portal/today/dashboard" />
      </Wrapper>,
    )

    await flushQueries()

    expect(captureSpy).toHaveBeenCalledTimes(1)
  })

  it('does not crash when window.posthog is undefined', async () => {
    delete (window as unknown as { posthog?: unknown }).posthog
    mockFetch.mockResolvedValueOnce(helperFixture)

    const { Wrapper } = makeWrapper()
    expect(() =>
      render(
        <Wrapper>
          <FieldHelper surfaceKey="designer-portal/today/dashboard" />
        </Wrapper>,
      ),
    ).not.toThrow()

    await flushQueries()

    expect(
      screen.getByText('Visible to client. Use clear, descriptive language.'),
    ).toBeInTheDocument()
  })

  // ── 6. Respects className prop ──────────────────────────────────────────────

  it('merges the className prop onto the rendered paragraph', async () => {
    mockFetch.mockResolvedValueOnce(helperFixture)

    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <FieldHelper
          surfaceKey="designer-portal/today/dashboard"
          className="custom-helper-class"
        />
      </Wrapper>,
    )

    await flushQueries()

    const el = screen.getByText('Visible to client. Use clear, descriptive language.')
    expect(el).toHaveClass('custom-helper-class')
    // Base design-system pattern classes still present
    expect(el).toHaveClass('text-sm')
    expect(el).toHaveClass('text-muted-foreground')
  })

  it('merges the className prop onto the fallback paragraph', async () => {
    mockFetch.mockResolvedValue(null)

    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <FieldHelper
          surfaceKey="designer-portal/today/dashboard"
          fallback="Fallback copy."
          className="custom-fallback-class"
        />
      </Wrapper>,
    )

    await flushQueries()

    const el = screen.getByText('Fallback copy.')
    expect(el).toHaveClass('custom-fallback-class')
    expect(el).toHaveClass('text-sm')
  })

  // ── 7. surfaceKey validation: dev warn, never throw ─────────────────────────

  it('logs a dev warning when surfaceKey does not match SURFACE_KEY_REGEX', async () => {
    mockFetch.mockResolvedValue(null)

    const { Wrapper } = makeWrapper()
    expect(() =>
      render(
        <Wrapper>
          <FieldHelper surfaceKey="BAD_KEY_NO_SLASH" fallback="x" />
        </Wrapper>,
      ),
    ).not.toThrow()

    await flushQueries()

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[help-system]'),
    )
    expect(consoleWarnSpy.mock.calls.some((args) =>
      String(args[0]).includes('BAD_KEY_NO_SLASH'),
    )).toBe(true)
  })

  it('does not warn for a well-formed surfaceKey', async () => {
    mockFetch.mockResolvedValueOnce(helperFixture)

    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <FieldHelper surfaceKey="designer-portal/today/dashboard" />
      </Wrapper>,
    )

    await flushQueries()

    // The "no content found" path inside useHelpContent logs warns; with a hit,
    // there should be no warns at all.
    expect(consoleWarnSpy).not.toHaveBeenCalled()
  })

  // ── 8. Recognized helper variants ───────────────────────────────────────────
  //
  // The spec contract says useHelpContent for fieldHelperContent OR a
  // tooltipContent-like body. When a non-helper recognized type comes back (e.g.
  // emptyState which has heading/description but no top-level `body`), the
  // component falls back to fallback/null rather than throwing.

  it('renders fallback when content arrives but has no `body` field', async () => {
    // A theoretical mis-typed doc with no body (e.g. content steward swapped types)
    const malformed = {
      surfaceKey: 'designer-portal/today/dashboard',
      persona: 'all',
      contentType: 'fieldHelper',
      // body intentionally omitted
    } as unknown as FieldHelperContent
    mockFetch.mockResolvedValueOnce(malformed)

    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <FieldHelper
          surfaceKey="designer-portal/today/dashboard"
          fallback="Fallback when body missing."
        />
      </Wrapper>,
    )

    await flushQueries()

    expect(screen.getByText('Fallback when body missing.')).toBeInTheDocument()
    // No spurious analytics fire — there was no body
    expect(captureSpy).not.toHaveBeenCalled()
  })

  it('also renders a tooltip-shaped body when Sanity returns one (graceful)', async () => {
    // The contract is "fieldHelperContent (or tooltipContent-like body)"; a
    // tooltip doc has the same `body: string` shape. Render it transparently.
    const tooltipShaped: TooltipContent = {
      surfaceKey: 'designer-portal/today/dashboard',
      persona: 'all',
      contentType: 'tooltip',
      body: 'Borrowed from a tooltip doc.',
    }
    mockFetch.mockResolvedValueOnce(tooltipShaped)

    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <FieldHelper surfaceKey="designer-portal/today/dashboard" />
      </Wrapper>,
    )

    await flushQueries()

    expect(screen.getByText('Borrowed from a tooltip doc.')).toBeInTheDocument()
  })
})
