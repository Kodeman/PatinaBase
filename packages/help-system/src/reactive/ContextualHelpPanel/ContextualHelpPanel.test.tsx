/**
 * ContextualHelpPanel — unit tests
 *
 * Validates the Layer 2 (Reactive) slide-out help panel per spec § 4.6 and
 * the analytics rules in § 10.1 (snake_case property keys + duration_ms on close).
 *
 * The Sanity client is mocked end-to-end so the underlying useQuery fetch
 * exercises real cache logic without live network I/O.
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ContextualHelpPanel } from './ContextualHelpPanel'
import { SurfaceKeyProvider } from '../../providers/SurfaceKeyProvider'

// ─── Mock the Sanity client module ────────────────────────────────────────────

const mockFetch = vi.fn()

vi.mock('../../sanityClient', () => ({
  getSanityClient: () => ({ fetch: mockFetch }),
  _resetSanityClient: vi.fn(),
}))

// ─── Test wrapper (fresh QueryClient per test for isolation) ──────────────────

function makeWrapper(initialSurfaceKey?: string) {
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
      <SurfaceKeyProvider initialSurfaceKey={initialSurfaceKey ?? null}>
        {children}
      </SurfaceKeyProvider>
    </QueryClientProvider>
  )
  return Wrapper
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SAMPLE_ARTICLES = [
  {
    _id: 'article-1',
    surfaceKey: 'designer-portal/pipeline/project-list',
    title: 'How the Pipeline works',
    excerpt:
      'The Pipeline view tracks every project across the four stages — leads, proposals, active, and completed. Use it as your daily command center.',
  },
  {
    _id: 'article-2',
    surfaceKey: 'designer-portal/pipeline',
    title: 'Pipeline stages explained',
    excerpt:
      'Each stage represents a clear handoff point between you and the client. Understanding when to advance a project is part of the craft.',
  },
  {
    _id: 'article-3',
    surfaceKey: 'designer-portal',
    title: 'Welcome to Patina',
    excerpt: 'A brief overview of the Designer Portal.',
  },
]

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ContextualHelpPanel', () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>
  let posthogCaptureSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    posthogCaptureSpy = vi.fn()
    ;(window as unknown as { posthog: { capture: typeof posthogCaptureSpy } }).posthog = {
      capture: posthogCaptureSpy,
    }
  })

  afterEach(() => {
    consoleWarnSpy.mockRestore()
    delete (window as unknown as { posthog?: unknown }).posthog
  })

  // ── Opens via trigger button ───────────────────────────────────────────────

  it('opens the panel when the trigger button is clicked', async () => {
    mockFetch.mockResolvedValue(SAMPLE_ARTICLES)
    const user = userEvent.setup()

    render(
      <ContextualHelpPanel
        surfaceKey="designer-portal/pipeline/project-list"
        trigger={<button type="button">Open help</button>}
      />,
      { wrapper: makeWrapper() },
    )

    expect(screen.queryByTestId('help-panel-content')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Open help' }))

    expect(screen.getByTestId('help-panel-content')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  // ── Fires `help.panel.opened` with snake_case surface_key on open ──────────

  it('fires help.panel.opened with snake_case surface_key on open', async () => {
    mockFetch.mockResolvedValue([])
    const user = userEvent.setup()

    render(
      <ContextualHelpPanel
        surfaceKey="designer-portal/pipeline/project-list"
        trigger={<button type="button">Open help</button>}
      />,
      { wrapper: makeWrapper() },
    )

    await user.click(screen.getByRole('button', { name: 'Open help' }))

    expect(posthogCaptureSpy).toHaveBeenCalledWith(
      'help.panel.opened',
      expect.objectContaining({ surface_key: 'designer-portal/pipeline/project-list' }),
    )
    const openCall = posthogCaptureSpy.mock.calls.find(([evt]) => evt === 'help.panel.opened')
    expect(openCall).toBeTruthy()
    // No camelCase leaks
    expect(Object.keys(openCall![1] as Record<string, unknown>)).not.toContain('surfaceKey')
  })

  // ── Closes via the close button + fires snake_case panel.closed + duration ─

  it('closes via the close button and fires help.panel.closed with duration_ms', async () => {
    mockFetch.mockResolvedValue([])
    const user = userEvent.setup()

    render(
      <ContextualHelpPanel
        surfaceKey="designer-portal/pipeline/project-list"
        trigger={<button type="button">Open help</button>}
      />,
      { wrapper: makeWrapper() },
    )

    await user.click(screen.getByRole('button', { name: 'Open help' }))
    expect(screen.getByTestId('help-panel-content')).toBeInTheDocument()

    await user.click(screen.getByTestId('help-panel-close'))

    await waitFor(() =>
      expect(screen.queryByTestId('help-panel-content')).not.toBeInTheDocument(),
    )

    const closedCall = posthogCaptureSpy.mock.calls.find(([evt]) => evt === 'help.panel.closed')
    expect(closedCall).toBeTruthy()
    const props = closedCall![1] as Record<string, unknown>
    expect(props.surface_key).toBe('designer-portal/pipeline/project-list')
    expect(typeof props.duration_ms).toBe('number')
    expect(props.duration_ms as number).toBeGreaterThanOrEqual(0)
  })

  // ── Closes via Escape key (Radix default) ──────────────────────────────────

  it('closes when Escape is pressed', async () => {
    mockFetch.mockResolvedValue([])
    const user = userEvent.setup()

    render(
      <ContextualHelpPanel
        surfaceKey="designer-portal/pipeline/project-list"
        trigger={<button type="button">Open help</button>}
      />,
      { wrapper: makeWrapper() },
    )

    await user.click(screen.getByRole('button', { name: 'Open help' }))
    expect(screen.getByTestId('help-panel-content')).toBeInTheDocument()

    await user.keyboard('{Escape}')

    await waitFor(() =>
      expect(screen.queryByTestId('help-panel-content')).not.toBeInTheDocument(),
    )
    expect(
      posthogCaptureSpy.mock.calls.some(([evt]) => evt === 'help.panel.closed'),
    ).toBe(true)
  })

  // ── Closes via backdrop click (Radix Overlay) ──────────────────────────────

  it('closes when the backdrop overlay is clicked', async () => {
    mockFetch.mockResolvedValue([])
    const user = userEvent.setup()

    render(
      <ContextualHelpPanel
        surfaceKey="designer-portal/pipeline/project-list"
        trigger={<button type="button">Open help</button>}
      />,
      { wrapper: makeWrapper() },
    )

    await user.click(screen.getByRole('button', { name: 'Open help' }))
    expect(screen.getByTestId('help-panel-content')).toBeInTheDocument()

    // Radix' Overlay closes on pointerDown / click that bubbles. Use fireEvent
    // because userEvent.click on the overlay can be intercepted by Radix' own
    // pointer-event guards in jsdom; pointerdown on the overlay triggers the
    // dismiss path directly.
    const overlay = screen.getByTestId('help-panel-overlay')
    fireEvent.pointerDown(overlay)

    await waitFor(() =>
      expect(screen.queryByTestId('help-panel-content')).not.toBeInTheDocument(),
    )
  })

  // ── Empty state when no articles match ─────────────────────────────────────

  it('shows the empty state when no articles match the surface key', async () => {
    mockFetch.mockResolvedValue([])
    const user = userEvent.setup()

    render(
      <ContextualHelpPanel
        surfaceKey="designer-portal/pipeline/project-list"
        trigger={<button type="button">Open help</button>}
      />,
      { wrapper: makeWrapper() },
    )

    await user.click(screen.getByRole('button', { name: 'Open help' }))

    await waitFor(() => expect(mockFetch).toHaveBeenCalled())
    expect(await screen.findByTestId('help-panel-empty')).toBeInTheDocument()
    expect(
      screen.getByText(/no articles for this surface yet/i),
    ).toBeInTheDocument()
  })

  // ── Renders article list with title + summary ──────────────────────────────

  it('renders article rows with title + summary excerpt', async () => {
    mockFetch.mockResolvedValue(SAMPLE_ARTICLES)
    const user = userEvent.setup()

    render(
      <ContextualHelpPanel
        surfaceKey="designer-portal/pipeline/project-list"
        trigger={<button type="button">Open help</button>}
      />,
      { wrapper: makeWrapper() },
    )

    await user.click(screen.getByRole('button', { name: 'Open help' }))

    expect(
      await screen.findByText('How the Pipeline works'),
    ).toBeInTheDocument()
    expect(screen.getByText(/four stages/i)).toBeInTheDocument()
    expect(screen.getByText('Pipeline stages explained')).toBeInTheDocument()
    expect(screen.getByText('Welcome to Patina')).toBeInTheDocument()
  })

  // ── Clicking an article fires help.article.opened (snake_case) ─────────────

  it('fires help.article.opened with snake_case keys when an article is clicked', async () => {
    mockFetch.mockResolvedValue(SAMPLE_ARTICLES)
    const user = userEvent.setup()

    render(
      <ContextualHelpPanel
        surfaceKey="designer-portal/pipeline/project-list"
        trigger={<button type="button">Open help</button>}
      />,
      { wrapper: makeWrapper() },
    )

    await user.click(screen.getByRole('button', { name: 'Open help' }))
    const row = await screen.findByTestId('help-panel-article-article-1')
    await user.click(row)

    const articleCall = posthogCaptureSpy.mock.calls.find(
      ([evt]) => evt === 'help.article.opened',
    )
    expect(articleCall).toBeTruthy()
    const props = articleCall![1] as Record<string, unknown>
    expect(props.article_id).toBe('article-1')
    expect(props.surface_key).toBe('designer-portal/pipeline/project-list')
    expect(props.source).toBe('contextual_panel')
  })

  // ── Clicking an article expands its inline excerpt ─────────────────────────

  it('expands the inline excerpt when an article row is clicked', async () => {
    mockFetch.mockResolvedValue(SAMPLE_ARTICLES)
    const user = userEvent.setup()

    render(
      <ContextualHelpPanel
        surfaceKey="designer-portal/pipeline/project-list"
        trigger={<button type="button">Open help</button>}
      />,
      { wrapper: makeWrapper() },
    )

    await user.click(screen.getByRole('button', { name: 'Open help' }))
    const row = await screen.findByTestId('help-panel-article-article-1')
    expect(row).toHaveAttribute('aria-expanded', 'false')

    await user.click(row)

    await waitFor(() =>
      expect(
        screen.getByTestId('help-panel-article-expanded-article-1'),
      ).toBeInTheDocument(),
    )
    expect(row).toHaveAttribute('aria-expanded', 'true')
    expect(
      screen.getByText(/coming soon: full article view/i),
    ).toBeInTheDocument()
  })

  // ── Resolves surfaceKey from context when prop is absent ───────────────────

  it('resolves surface key from useSurfaceKey() context when no prop is passed', async () => {
    mockFetch.mockResolvedValue([])
    const user = userEvent.setup()

    render(
      <ContextualHelpPanel trigger={<button type="button">Open help</button>} />,
      { wrapper: makeWrapper('designer-portal/today/dashboard') },
    )

    await user.click(screen.getByRole('button', { name: 'Open help' }))

    expect(posthogCaptureSpy).toHaveBeenCalledWith(
      'help.panel.opened',
      expect.objectContaining({ surface_key: 'designer-portal/today/dashboard' }),
    )
    // The fetch should have been called with the context-derived surface key
    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ sk: 'designer-portal/today/dashboard' }),
      ),
    )
  })

  // ── Explicit prop wins over context ────────────────────────────────────────

  it('prefers the explicit surfaceKey prop over the context value', async () => {
    mockFetch.mockResolvedValue([])
    const user = userEvent.setup()

    render(
      <ContextualHelpPanel
        surfaceKey="admin-portal/dashboard"
        trigger={<button type="button">Open help</button>}
      />,
      { wrapper: makeWrapper('designer-portal/today/dashboard') },
    )

    await user.click(screen.getByRole('button', { name: 'Open help' }))

    const openCall = posthogCaptureSpy.mock.calls.find(([evt]) => evt === 'help.panel.opened')
    expect((openCall![1] as Record<string, unknown>).surface_key).toBe(
      'admin-portal/dashboard',
    )
  })

  // ── Controlled open prop drives visibility ─────────────────────────────────

  it('behaves as a controlled component when open + onOpenChange are passed', async () => {
    mockFetch.mockResolvedValue([])
    const onOpenChange = vi.fn()

    const { rerender } = render(
      <ContextualHelpPanel
        surfaceKey="designer-portal/pipeline/project-list"
        open={false}
        onOpenChange={onOpenChange}
      />,
      { wrapper: makeWrapper() },
    )

    expect(screen.queryByTestId('help-panel-content')).not.toBeInTheDocument()

    rerender(
      <ContextualHelpPanel
        surfaceKey="designer-portal/pipeline/project-list"
        open={true}
        onOpenChange={onOpenChange}
      />,
    )

    expect(await screen.findByTestId('help-panel-content')).toBeInTheDocument()
    expect(posthogCaptureSpy).toHaveBeenCalledWith(
      'help.panel.opened',
      expect.objectContaining({ surface_key: 'designer-portal/pipeline/project-list' }),
    )
  })

  // ── Focus management — Radix focuses the panel content on open ─────────────

  it('moves focus into the panel when opened (focus management via Radix)', async () => {
    mockFetch.mockResolvedValue([])
    const user = userEvent.setup()

    render(
      <ContextualHelpPanel
        surfaceKey="designer-portal/pipeline/project-list"
        trigger={<button type="button">Open help</button>}
      />,
      { wrapper: makeWrapper() },
    )

    await user.click(screen.getByRole('button', { name: 'Open help' }))

    // Radix moves focus to the dialog content (or first focusable inside it)
    // when opened. The close button is the first interactive element.
    await waitFor(() => {
      const panel = screen.getByTestId('help-panel-content')
      // Either the panel content or something inside it owns focus.
      expect(panel.contains(document.activeElement)).toBe(true)
    })
  })

  // ── Sanity downtime — fetch throws, panel renders empty state, no crash ───

  it('renders the empty state gracefully when the Sanity fetch throws', async () => {
    mockFetch.mockRejectedValue(new Error('Sanity unreachable'))
    const user = userEvent.setup()

    render(
      <ContextualHelpPanel
        surfaceKey="designer-portal/pipeline/project-list"
        trigger={<button type="button">Open help</button>}
      />,
      { wrapper: makeWrapper() },
    )

    await user.click(screen.getByRole('button', { name: 'Open help' }))

    await waitFor(() => expect(mockFetch).toHaveBeenCalled())
    expect(await screen.findByTestId('help-panel-empty')).toBeInTheDocument()
  })

  // ── Article click toggles expanded state (collapses on second click) ───────

  it('collapses the article row when clicked a second time', async () => {
    mockFetch.mockResolvedValue(SAMPLE_ARTICLES)
    const user = userEvent.setup()

    render(
      <ContextualHelpPanel
        surfaceKey="designer-portal/pipeline/project-list"
        trigger={<button type="button">Open help</button>}
      />,
      { wrapper: makeWrapper() },
    )

    await user.click(screen.getByRole('button', { name: 'Open help' }))
    const row = await screen.findByTestId('help-panel-article-article-1')

    await user.click(row)
    expect(
      screen.getByTestId('help-panel-article-expanded-article-1'),
    ).toBeInTheDocument()

    await user.click(row)
    expect(
      screen.queryByTestId('help-panel-article-expanded-article-1'),
    ).not.toBeInTheDocument()
  })

  // ── Reduced-motion class is present on the content panel ──────────────────

  it('includes motion-reduce utility classes on the panel content', async () => {
    mockFetch.mockResolvedValue([])
    const user = userEvent.setup()

    render(
      <ContextualHelpPanel
        surfaceKey="designer-portal/pipeline/project-list"
        trigger={<button type="button">Open help</button>}
      />,
      { wrapper: makeWrapper() },
    )

    await user.click(screen.getByRole('button', { name: 'Open help' }))
    const panel = await screen.findByTestId('help-panel-content')
    expect(panel.className).toMatch(/motion-reduce:/)
  })

  // ── Analytics survive a missing window.posthog (no crash) ──────────────────

  it('does not crash when window.posthog is missing', async () => {
    mockFetch.mockResolvedValue([])
    delete (window as unknown as { posthog?: unknown }).posthog
    const user = userEvent.setup()

    expect(() =>
      render(
        <ContextualHelpPanel
          surfaceKey="designer-portal/pipeline/project-list"
          trigger={<button type="button">Open help</button>}
        />,
        { wrapper: makeWrapper() },
      ),
    ).not.toThrow()

    await user.click(screen.getByRole('button', { name: 'Open help' }))
    expect(screen.getByTestId('help-panel-content')).toBeInTheDocument()
  })

  // ── Intro slot renders above the article list (survives empty state) ───────

  it('renders the intro slot above the article list', async () => {
    mockFetch.mockResolvedValue([])
    const user = userEvent.setup()

    render(
      <ContextualHelpPanel
        surfaceKey="designer-portal/document/orders"
        intro={<span>A lens over every document.</span>}
        trigger={<button type="button">Open help</button>}
      />,
      { wrapper: makeWrapper() },
    )

    await user.click(screen.getByRole('button', { name: 'Open help' }))

    const intro = await screen.findByTestId('help-panel-intro')
    expect(intro).toBeInTheDocument()
    expect(intro).toHaveTextContent('A lens over every document.')

    // Intro survives the empty article state (it is a sibling of the list).
    expect(await screen.findByTestId('help-panel-empty')).toBeInTheDocument()
  })

  // ── No intro slot rendered when the prop is omitted ────────────────────────

  it('does not render the intro slot when no intro prop is passed', async () => {
    mockFetch.mockResolvedValue([])
    const user = userEvent.setup()

    render(
      <ContextualHelpPanel
        surfaceKey="designer-portal/document/orders"
        trigger={<button type="button">Open help</button>}
      />,
      { wrapper: makeWrapper() },
    )

    await user.click(screen.getByRole('button', { name: 'Open help' }))
    expect(screen.getByTestId('help-panel-content')).toBeInTheDocument()
    expect(screen.queryByTestId('help-panel-intro')).not.toBeInTheDocument()
  })
})
