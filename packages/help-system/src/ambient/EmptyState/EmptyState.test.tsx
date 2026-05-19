/**
 * EmptyState (ambient wrapper) — unit tests
 *
 * Validates the CMS-backed wrapper around @patina/design-system's EmptyState
 * primitive per spec § 4.3 + § 10.1.
 *
 * The Sanity client is mocked end-to-end so the underlying useHelpContent hook
 * exercises real fetch/cache logic without live network I/O.
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { EmptyState } from './EmptyState'
import type { EmptyStateContent } from '../../contentTypes'

// ─── Mock the Sanity client module ────────────────────────────────────────────

const mockFetch = vi.fn()

vi.mock('../../sanityClient', () => ({
  getSanityClient: () => ({ fetch: mockFetch }),
  _resetSanityClient: vi.fn(),
}))

// ─── Partial mock of useHelpContent so a single test can spy on it ────────────
//
// We re-export the real hook as default behavior but expose the binding as a
// mockable export so the "Sanity error" test below can override its return
// value (the real hook silently catches errors and returns null + isError:false
// per spec §13.4, which makes the fallback-heading code path unreachable via
// fetch mocks).

import * as useHelpContentModule from '../../hooks/useHelpContent'

vi.mock('../../hooks/useHelpContent', async () => {
  const actual =
    await vi.importActual<typeof import('../../hooks/useHelpContent')>(
      '../../hooks/useHelpContent',
    )
  return {
    ...actual,
    useHelpContent: vi.fn(actual.useHelpContent),
  }
})

// ─── Test wrapper (fresh QueryClient per test for isolation) ──────────────────

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
  return Wrapper
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const fullEmptyState: EmptyStateContent = {
  surfaceKey: 'designer-portal/pipeline/project-list',
  persona: 'all',
  contentType: 'emptyState',
  icon: 'inbox',
  heading: 'Your projects live here',
  description:
    'Leads come in from the consumer app. You review, accept, and convert.',
  primaryActionLabel: '+ Create a test project',
}

const headingOnlyEmptyState: EmptyStateContent = {
  surfaceKey: 'designer-portal/today/dashboard',
  persona: 'all',
  contentType: 'emptyState',
  heading: 'Nothing scheduled today',
  description: 'Your active items will appear here.',
}

const typographicIconEmptyState: EmptyStateContent = {
  ...headingOnlyEmptyState,
  icon: '◇',
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('EmptyState (ambient wrapper)', () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>
  let posthogCaptureSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    // Stub window.posthog for analytics
    posthogCaptureSpy = vi.fn()
    ;(window as any).posthog = { capture: posthogCaptureSpy }
  })

  afterEach(() => {
    consoleWarnSpy.mockRestore()
    delete (window as any).posthog
  })

  // ── Renders content when CMS returns a document ────────────────────────────

  it('renders heading + description from CMS content', async () => {
    mockFetch.mockResolvedValueOnce(fullEmptyState)

    render(
      <EmptyState surfaceKey="designer-portal/pipeline/project-list" />,
      { wrapper: makeWrapper() },
    )

    await waitFor(() =>
      expect(screen.getByText('Your projects live here')).toBeInTheDocument(),
    )
    expect(
      screen.getByText(
        'Leads come in from the consumer app. You review, accept, and convert.',
      ),
    ).toBeInTheDocument()
  })

  // ── Renders primary action button when label is provided ───────────────────

  it('renders the primary action button when CMS provides a label and onAction is wired', async () => {
    mockFetch.mockResolvedValueOnce(fullEmptyState)
    const onAction = vi.fn()

    render(
      <EmptyState
        surfaceKey="designer-portal/pipeline/project-list"
        onAction={onAction}
      />,
      { wrapper: makeWrapper() },
    )

    const button = await screen.findByRole('button', {
      name: '+ Create a test project',
    })
    expect(button).toBeInTheDocument()
  })

  // ── Renders nothing while loading (and no fallback provided) ───────────────

  it('renders nothing during initial load when no loadingFallback is provided', () => {
    // Don't resolve the fetch so the query stays in `isLoading`
    mockFetch.mockReturnValue(new Promise(() => undefined))

    const { container } = render(
      <EmptyState surfaceKey="designer-portal/pipeline/project-list" />,
      { wrapper: makeWrapper() },
    )

    expect(container.firstChild).toBeNull()
  })

  // ── Renders loadingFallback if provided ─────────────────────────────────────

  it('renders loadingFallback while the CMS fetch is in flight', () => {
    mockFetch.mockReturnValue(new Promise(() => undefined))

    render(
      <EmptyState
        surfaceKey="designer-portal/pipeline/project-list"
        loadingFallback={<div data-testid="loading">Loading help…</div>}
      />,
      { wrapper: makeWrapper() },
    )

    expect(screen.getByTestId('loading')).toBeInTheDocument()
  })

  // ── Renders fallback heading on Sanity error ───────────────────────────────

  it('renders fallback "Nothing here yet" heading when useHelpContent reports an error', () => {
    // The default useHelpContent hook silently catches Sanity errors and returns
    // null + isError=false (spec §13.4 — never crash the UI). To exercise the
    // ambient component's *error fallback* code path (spec §4.3 fallback note),
    // we override the hook for this single test.
    const mocked = vi.mocked(useHelpContentModule.useHelpContent)
    mocked.mockReturnValueOnce({
      data: null,
      isLoading: false,
      isError: true,
      isSuccess: false,
      error: new Error('Sanity unreachable'),
    } as ReturnType<typeof useHelpContentModule.useHelpContent>)

    render(
      <EmptyState surfaceKey="designer-portal/pipeline/project-list" />,
      { wrapper: makeWrapper() },
    )

    expect(screen.getByText('Nothing here yet')).toBeInTheDocument()
  })

  // ── Renders nothing on null content + no error ──────────────────────────────

  it('renders nothing when CMS returns null content and there is no error', async () => {
    // All fallback steps return null, no thrown error
    mockFetch.mockResolvedValue(null)

    const { container } = render(
      <EmptyState surfaceKey="designer-portal/pipeline/project-list" />,
      { wrapper: makeWrapper() },
    )

    // Wait for the query to settle
    await waitFor(() => expect(mockFetch).toHaveBeenCalled())
    // After settle, container should still be empty (no error → nothing renders)
    await waitFor(() => expect(container.firstChild).toBeNull())
  })

  // ── Fires shown event exactly once on first render with content ────────────

  it('fires help.empty_state.shown analytics event once on first display', async () => {
    mockFetch.mockResolvedValueOnce(fullEmptyState)

    const { rerender } = render(
      <EmptyState surfaceKey="designer-portal/pipeline/project-list" />,
      { wrapper: makeWrapper() },
    )

    await waitFor(() =>
      expect(screen.getByText('Your projects live here')).toBeInTheDocument(),
    )

    expect(posthogCaptureSpy).toHaveBeenCalledWith(
      'help.empty_state.shown',
      expect.objectContaining({
        surface_key: 'designer-portal/pipeline/project-list',
      }),
    )

    // Re-render with the same props — should not fire shown a second time
    rerender(
      <EmptyState surfaceKey="designer-portal/pipeline/project-list" />,
    )
    const shownCalls = posthogCaptureSpy.mock.calls.filter(
      ([eventName]) => eventName === 'help.empty_state.shown',
    )
    expect(shownCalls).toHaveLength(1)
  })

  // ── Fires cta_clicked event when CTA is clicked ────────────────────────────

  it('fires help.empty_state.cta_clicked when the primary action is clicked', async () => {
    mockFetch.mockResolvedValueOnce(fullEmptyState)
    const onAction = vi.fn()

    render(
      <EmptyState
        surfaceKey="designer-portal/pipeline/project-list"
        onAction={onAction}
      />,
      { wrapper: makeWrapper() },
    )

    const button = await screen.findByRole('button', {
      name: '+ Create a test project',
    })

    fireEvent.click(button)

    expect(onAction).toHaveBeenCalledTimes(1)
    expect(posthogCaptureSpy).toHaveBeenCalledWith(
      'help.empty_state.cta_clicked',
      expect.objectContaining({
        surface_key: 'designer-portal/pipeline/project-list',
      }),
    )
  })

  // ── Does not fire shown event when there is no content ─────────────────────

  it('does not fire help.empty_state.shown when there is no content and no error', async () => {
    mockFetch.mockResolvedValue(null)

    render(
      <EmptyState surfaceKey="designer-portal/pipeline/project-list" />,
      { wrapper: makeWrapper() },
    )

    await waitFor(() => expect(mockFetch).toHaveBeenCalled())

    // Allow a microtask cycle so any deferred capture would fire
    await new Promise((r) => setTimeout(r, 10))

    const shownCalls = posthogCaptureSpy.mock.calls.filter(
      ([eventName]) => eventName === 'help.empty_state.shown',
    )
    expect(shownCalls).toHaveLength(0)
  })

  // ── Icon resolution: known iconName resolves to an icon element ────────────

  it('renders an icon when CMS iconName matches the known map', async () => {
    mockFetch.mockResolvedValueOnce(fullEmptyState) // icon: 'inbox'

    const { container } = render(
      <EmptyState surfaceKey="designer-portal/pipeline/project-list" />,
      { wrapper: makeWrapper() },
    )

    await waitFor(() =>
      expect(screen.getByText('Your projects live here')).toBeInTheDocument(),
    )

    // Lucide renders an inline svg; check for any svg in the empty state
    expect(container.querySelector('svg')).not.toBeNull()
  })

  // ── Icon resolution: typographic glyph from spec renders as text ───────────

  it('renders a typographic glyph icon as text when CMS provides one (spec § 4.3 visual)', async () => {
    mockFetch.mockResolvedValueOnce(typographicIconEmptyState) // icon: '◇'

    render(<EmptyState surfaceKey="designer-portal/today/dashboard" />, {
      wrapper: makeWrapper(),
    })

    await waitFor(() =>
      expect(screen.getByText('Nothing scheduled today')).toBeInTheDocument(),
    )
    expect(screen.getByText('◇')).toBeInTheDocument()
  })

  // ── Icon resolution: unknown name → no icon, no crash ──────────────────────

  it('omits the icon (no crash) when iconName is unknown', async () => {
    mockFetch.mockResolvedValueOnce({
      ...headingOnlyEmptyState,
      icon: 'this-is-not-a-known-icon-name',
    })

    render(<EmptyState surfaceKey="designer-portal/today/dashboard" />, {
      wrapper: makeWrapper(),
    })

    await waitFor(() =>
      expect(screen.getByText('Nothing scheduled today')).toBeInTheDocument(),
    )
    // Render still succeeded — primary assertion is no exception thrown.
  })

  // ── Icon override prop wins over CMS iconName ──────────────────────────────

  it('uses the icon prop override instead of the CMS iconName', async () => {
    mockFetch.mockResolvedValueOnce(fullEmptyState) // CMS says icon: 'inbox'

    render(
      <EmptyState
        surfaceKey="designer-portal/pipeline/project-list"
        icon={<span data-testid="custom-icon">★</span>}
      />,
      { wrapper: makeWrapper() },
    )

    await waitFor(() =>
      expect(screen.getByText('Your projects live here')).toBeInTheDocument(),
    )
    expect(screen.getByTestId('custom-icon')).toBeInTheDocument()
  })

  // ── className passthrough ──────────────────────────────────────────────────

  it('forwards className to the underlying design-system EmptyState container', async () => {
    mockFetch.mockResolvedValueOnce(headingOnlyEmptyState)

    const { container } = render(
      <EmptyState
        surfaceKey="designer-portal/today/dashboard"
        className="my-custom-class"
      />,
      { wrapper: makeWrapper() },
    )

    await waitFor(() =>
      expect(screen.getByText('Nothing scheduled today')).toBeInTheDocument(),
    )
    expect(container.querySelector('.my-custom-class')).not.toBeNull()
  })
})
