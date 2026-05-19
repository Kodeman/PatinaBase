/**
 * SectionIntro — unit tests
 *
 * Behaviour matrix:
 *  - renders body when CMS returns content with a body string
 *  - renders fallback when CMS returns null and fallback is provided
 *  - renders nothing when CMS returns null and no fallback
 *  - fires window.posthog.capture('help.section_intro.shown', { surface_key })
 *    exactly once on first render with non-null content
 *  - malformed surfaceKey logs a dev-only warning (not production)
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SectionIntro } from './SectionIntro'
import type { FieldHelperContent } from '../../contentTypes'

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

// ─── Fixture ──────────────────────────────────────────────────────────────────

const helperFixture: FieldHelperContent = {
  surfaceKey: 'designer-portal/pipeline/project-list',
  persona: 'all',
  contentType: 'fieldHelper',
  body: 'Projects appear here ordered by last activity.',
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

describe('<SectionIntro />', () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>
  let posthogStub: PosthogStub

  beforeEach(() => {
    vi.clearAllMocks()
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    posthogStub = installPosthogStub()
  })

  afterEach(() => {
    consoleWarnSpy.mockRestore()
    uninstallPosthogStub()
  })

  // ── 1. Renders body from CMS ───────────────────────────────────────────────

  it('renders the body returned by useHelpContent as a paragraph', async () => {
    mockFetch.mockResolvedValueOnce(helperFixture)

    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <SectionIntro surfaceKey="designer-portal/pipeline/project-list" />
      </Wrapper>,
    )

    await waitFor(() =>
      expect(
        screen.getByText('Projects appear here ordered by last activity.'),
      ).toBeInTheDocument(),
    )

    const p = screen.getByText('Projects appear here ordered by last activity.')
    expect(p.tagName).toBe('P')
  })

  // ── 2. Renders fallback when CMS returns null and fallback provided ────────

  it('renders the fallback text when CMS returns null and a fallback is provided', async () => {
    mockFetch.mockResolvedValue(null)

    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <SectionIntro
          surfaceKey="designer-portal/pipeline/project-list"
          fallback="A placeholder description."
        />
      </Wrapper>,
    )

    await waitFor(() =>
      expect(screen.getByText('A placeholder description.')).toBeInTheDocument(),
    )

    const p = screen.getByText('A placeholder description.')
    expect(p.tagName).toBe('P')
  })

  // ── 3. Renders nothing when CMS returns null and no fallback ───────────────

  it('renders nothing when CMS returns null and no fallback is provided', async () => {
    mockFetch.mockResolvedValue(null)

    const { Wrapper } = makeWrapper()
    const { container } = render(
      <Wrapper>
        <SectionIntro surfaceKey="designer-portal/pipeline/project-list" />
      </Wrapper>,
    )

    // Wait one tick so the query resolves
    await waitFor(() => {
      // After resolution, the component should still render nothing.
      // The QueryClientProvider wrapper renders the SectionIntro as the only
      // descendant; if SectionIntro returns null, container.firstChild === null.
      expect(container.firstChild).toBeNull()
    })
  })

  // ── 4. PostHog fires once on first render with non-null content ────────────

  it('fires help.section_intro.shown exactly once on first render with non-null content', async () => {
    mockFetch.mockResolvedValueOnce(helperFixture)

    const { Wrapper } = makeWrapper()
    const { rerender } = render(
      <Wrapper>
        <SectionIntro surfaceKey="designer-portal/pipeline/project-list" />
      </Wrapper>,
    )

    await waitFor(() => expect(posthogStub.capture).toHaveBeenCalledTimes(1))

    expect(posthogStub.capture).toHaveBeenCalledWith('help.section_intro.shown', {
      surface_key: 'designer-portal/pipeline/project-list',
    })

    // A re-render with the same content must not fire the event again.
    rerender(
      <Wrapper>
        <SectionIntro surfaceKey="designer-portal/pipeline/project-list" />
      </Wrapper>,
    )

    expect(posthogStub.capture).toHaveBeenCalledTimes(1)
  })

  // ── 4b. PostHog does NOT fire when content is null + fallback used ─────────

  it('does not fire help.section_intro.shown when CMS returns null (even if fallback renders)', async () => {
    mockFetch.mockResolvedValue(null)

    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <SectionIntro
          surfaceKey="designer-portal/pipeline/project-list"
          fallback="Local fallback copy"
        />
      </Wrapper>,
    )

    await waitFor(() =>
      expect(screen.getByText('Local fallback copy')).toBeInTheDocument(),
    )

    expect(posthogStub.capture).not.toHaveBeenCalled()
  })

  // ── 4c. PostHog absence is non-fatal ───────────────────────────────────────

  it('does not throw when window.posthog is undefined', async () => {
    uninstallPosthogStub()
    mockFetch.mockResolvedValueOnce(helperFixture)

    const { Wrapper } = makeWrapper()
    expect(() => {
      render(
        <Wrapper>
          <SectionIntro surfaceKey="designer-portal/pipeline/project-list" />
        </Wrapper>,
      )
    }).not.toThrow()

    await waitFor(() =>
      expect(
        screen.getByText('Projects appear here ordered by last activity.'),
      ).toBeInTheDocument(),
    )
  })

  // ── 5. Malformed surfaceKey logs dev warning ───────────────────────────────

  it('emits a console.warn in non-production env when surfaceKey is malformed', async () => {
    // Vitest sets NODE_ENV='test' which is !== 'production' — the dev warning
    // branch runs without any env manipulation. mockResolvedValue ensures the
    // query resolves so the waitFor doesn't time out.
    mockFetch.mockResolvedValue(null)

    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <SectionIntro surfaceKey="BAD_KEY_NO_SLASH" />
      </Wrapper>,
    )

    await waitFor(() => {
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[help-system]'),
      )
    })
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('BAD_KEY_NO_SLASH'),
    )
  })

  it('does NOT emit a malformed-key warning in production', async () => {
    const originalEnv = process.env.NODE_ENV
    // @ts-expect-error — overriding read-only at runtime for the test
    process.env.NODE_ENV = 'production'

    try {
      mockFetch.mockResolvedValue(null)

      const { Wrapper } = makeWrapper()
      render(
        <Wrapper>
          <SectionIntro surfaceKey="BAD_KEY_NO_SLASH" />
        </Wrapper>,
      )

      // Wait a tick so the effect runs.
      await waitFor(() => expect(mockFetch).toHaveBeenCalled())

      // The dev-only warning from THIS component (the malformed-key message)
      // must not fire in production. We match the unique "does not match the
      // surface-key regex" phrase, which only this component emits.
      const malformedWarnings = consoleWarnSpy.mock.calls.filter((call) =>
        typeof call[0] === 'string' &&
        call[0].includes('does not match the surface-key regex'),
      )
      expect(malformedWarnings).toHaveLength(0)
    } finally {
      // @ts-expect-error — restoring read-only at runtime
      process.env.NODE_ENV = originalEnv
    }
  })

  it('does NOT warn when surfaceKey is well-formed', async () => {
    mockFetch.mockResolvedValueOnce(helperFixture)

    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <SectionIntro surfaceKey="designer-portal/pipeline/project-list" />
      </Wrapper>,
    )

    await waitFor(() => expect(mockFetch).toHaveBeenCalled())

    const malformedWarnings = consoleWarnSpy.mock.calls.filter((call) =>
      typeof call[0] === 'string' && call[0].includes('does not match'),
    )
    expect(malformedWarnings).toHaveLength(0)
  })

  // ── className passthrough ──────────────────────────────────────────────────

  it('applies the className prop to the rendered paragraph', async () => {
    mockFetch.mockResolvedValueOnce(helperFixture)

    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <SectionIntro
          surfaceKey="designer-portal/pipeline/project-list"
          className="mb-4"
        />
      </Wrapper>,
    )

    await waitFor(() => {
      const p = screen.getByText('Projects appear here ordered by last activity.')
      expect(p).toHaveClass('mb-4')
    })
  })
})
