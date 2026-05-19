/**
 * HelpSearch — unit tests
 *
 * Validates the Layer 4 (Reference) search component per Sprint 3 Stream E
 * Task E2 and the analytics rules in spec §10.1 (snake_case property keys
 * with `query_length`, `result_count`, `surface_key`, `result_index`,
 * `content_type`).
 *
 * The Sanity client is mocked end-to-end so the GROQ query is captured and
 * asserted against without live network I/O.
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HelpSearch } from './HelpSearch'

// ─── Mock the Sanity client module ────────────────────────────────────────────

const mockFetch = vi.fn()

vi.mock('../../sanityClient', () => ({
  getSanityClient: () => ({ fetch: mockFetch }),
  _resetSanityClient: vi.fn(),
}))

// ─── Test wrapper (fresh QueryClient per test) ────────────────────────────────

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  })
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return Wrapper
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const PIPELINE_RESULTS = [
  {
    _id: 'art-1',
    surfaceKey: 'designer-portal/pipeline/project-list',
    contentType: 'helpArticle',
    title: 'How the Pipeline works',
    excerpt:
      'The Pipeline view tracks every project across the four stages.',
  },
  {
    _id: 'art-2',
    surfaceKey: 'designer-portal/pipeline',
    contentType: 'helpArticle',
    title: 'Pipeline stages explained',
    excerpt: 'Each stage represents a clear handoff.',
  },
  {
    _id: 'tip-1',
    surfaceKey: 'designer-portal/pipeline/stage-filter',
    contentType: 'tooltip',
    title: 'designer-portal/pipeline/stage-filter',
    excerpt: 'Filter projects by their current pipeline stage.',
  },
]

const MANY_RESULTS = Array.from({ length: 20 }, (_, i) => ({
  _id: `r-${i}`,
  surfaceKey: `designer-portal/pipeline/result-${i}`,
  contentType: 'helpArticle',
  title: `Pipeline result ${i + 1}`,
  excerpt: `Excerpt for pipeline result ${i + 1}.`,
}))

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('HelpSearch', () => {
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
    vi.useRealTimers()
    delete (window as unknown as { posthog?: unknown }).posthog
  })

  // ── Initial empty state ────────────────────────────────────────────────────

  it('renders the empty state when no query has been entered', () => {
    render(<HelpSearch />, { wrapper: makeWrapper() })

    expect(
      screen.getByText(/start typing to search help articles/i),
    ).toBeInTheDocument()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  // ── Renders a search input with an accessible label ────────────────────────

  it('renders a search input with an aria-label', () => {
    render(<HelpSearch />, { wrapper: makeWrapper() })

    const input = screen.getByRole('searchbox', { name: /search help articles/i })
    expect(input).toBeInTheDocument()
    expect(input).toHaveAttribute('type', 'search')
  })

  // ── Custom placeholder ─────────────────────────────────────────────────────

  it('accepts a custom placeholder', () => {
    render(<HelpSearch placeholder="Find a guide" />, { wrapper: makeWrapper() })

    const input = screen.getByPlaceholderText('Find a guide')
    expect(input).toBeInTheDocument()
  })

  // ── initialQuery prop seeds the input + fires a search ─────────────────────

  it('seeds the input from initialQuery and fires a search', async () => {
    mockFetch.mockResolvedValue(PIPELINE_RESULTS)

    render(<HelpSearch initialQuery="pipeline" />, { wrapper: makeWrapper() })

    const input = screen.getByRole('searchbox')
    expect(input).toHaveValue('pipeline')

    await waitFor(() => expect(mockFetch).toHaveBeenCalled())
    expect(
      await screen.findByText('How the Pipeline works'),
    ).toBeInTheDocument()
  })

  // ── Debounce — rapid typing collapses to a single GROQ fetch ───────────────

  it('debounces input — five rapid keystrokes fire only one GROQ query', async () => {
    mockFetch.mockResolvedValue(PIPELINE_RESULTS)
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(<HelpSearch />, { wrapper: makeWrapper() })
    const input = screen.getByRole('searchbox')

    await user.type(input, 'pipe')
    // No fetch should have fired yet — we're still inside the debounce window.
    expect(mockFetch).not.toHaveBeenCalled()

    // Add a final character; total typing time has been minimal (less than 250ms
    // of fake-clock advance between each character via userEvent).
    await user.type(input, 'l')
    expect(mockFetch).not.toHaveBeenCalled()

    // Advance past the debounce window.
    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    // Now exactly one fetch should have happened.
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))
  })

  // ── GROQ query is parameterized — query text passes as a binding, not in the query string

  it('passes the query as a parameter to client.fetch, not concatenated into the GROQ string', async () => {
    mockFetch.mockResolvedValue([])
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(<HelpSearch />, { wrapper: makeWrapper() })
    const input = screen.getByRole('searchbox')

    await user.type(input, 'safe input')
    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    await waitFor(() => expect(mockFetch).toHaveBeenCalled())
    const [query, params] = mockFetch.mock.calls[0]
    // Query is a string and references $q / $max parameters
    expect(typeof query).toBe('string')
    expect(query).toMatch(/\$q/)
    expect(query).toMatch(/\$max/)
    // The raw query string itself MUST NOT contain the user-supplied text —
    // that would be string concatenation and a regex-injection vector.
    expect(query).not.toContain('safe input')
    // Parameter binding carries the actual query value.
    expect(params).toBeTruthy()
    expect(params).toHaveProperty('q')
    expect(params).toHaveProperty('max')
    expect(typeof params.q).toBe('string')
    expect(params.q.toLowerCase()).toContain('safe input')
  })

  // ── GROQ shape — covers helpArticleContent, tooltipContent, fieldHelperContent

  it('GROQ targets helpContent docs and searches helpArticleContent, tooltipContent, and pt::text(body)', async () => {
    mockFetch.mockResolvedValue([])
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(<HelpSearch />, { wrapper: makeWrapper() })
    const input = screen.getByRole('searchbox')

    await user.type(input, 'x')
    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    await waitFor(() => expect(mockFetch).toHaveBeenCalled())
    const [query] = mockFetch.mock.calls[0]
    expect(query).toContain('_type == "helpContent"')
    expect(query).toMatch(/helpArticleContent\.title/)
    expect(query).toMatch(/pt::text\(helpArticleContent\.body\)/)
    expect(query).toMatch(/tooltipContent\.body/)
  })

  // ── Persona filter is parameterized ────────────────────────────────────────

  it('passes the persona filter as a parameter when provided', async () => {
    mockFetch.mockResolvedValue([])
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(<HelpSearch persona="designer" />, { wrapper: makeWrapper() })
    const input = screen.getByRole('searchbox')

    await user.type(input, 'pipeline')
    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    await waitFor(() => expect(mockFetch).toHaveBeenCalled())
    const [, params] = mockFetch.mock.calls[0]
    expect(params.persona).toBe('designer')
  })

  it('passes persona=null when no persona prop is set', async () => {
    mockFetch.mockResolvedValue([])
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(<HelpSearch />, { wrapper: makeWrapper() })
    const input = screen.getByRole('searchbox')

    await user.type(input, 'pipeline')
    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    await waitFor(() => expect(mockFetch).toHaveBeenCalled())
    const [, params] = mockFetch.mock.calls[0]
    expect(params.persona).toBeNull()
  })

  // ── Loading state ──────────────────────────────────────────────────────────

  it('shows a loading indicator while the query is in flight', async () => {
    // Fetch never resolves until we tell it to — use a deferred promise.
    let resolveFetch!: (rows: unknown[]) => void
    mockFetch.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve as (rows: unknown[]) => void
        }),
    )

    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(<HelpSearch />, { wrapper: makeWrapper() })
    const input = screen.getByRole('searchbox')

    await user.type(input, 'pipeline')
    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    // Now the fetch is in flight — loading state visible.
    expect(await screen.findByTestId('help-search-loading')).toBeInTheDocument()

    // Resolve to clean up
    resolveFetch(PIPELINE_RESULTS)
  })

  // ── Result rendering ──────────────────────────────────────────────────────

  it('renders result rows with title and excerpt', async () => {
    mockFetch.mockResolvedValue(PIPELINE_RESULTS)
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(<HelpSearch />, { wrapper: makeWrapper() })
    const input = screen.getByRole('searchbox')

    await user.type(input, 'pipeline')
    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    expect(
      await screen.findByText('How the Pipeline works'),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/the pipeline view tracks every project/i),
    ).toBeInTheDocument()
    expect(screen.getByText('Pipeline stages explained')).toBeInTheDocument()
    expect(
      screen.getByText('designer-portal/pipeline/stage-filter'),
    ).toBeInTheDocument()
  })

  // ── No results state ───────────────────────────────────────────────────────

  it('shows the no-results state when the query returns []', async () => {
    mockFetch.mockResolvedValue([])
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(<HelpSearch />, { wrapper: makeWrapper() })
    const input = screen.getByRole('searchbox')

    await user.type(input, 'frobnicate')
    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    await waitFor(() =>
      expect(screen.getByTestId('help-search-no-results')).toBeInTheDocument(),
    )
    expect(screen.getByText(/no results for "frobnicate"/i)).toBeInTheDocument()
  })

  // ── help.search.performed fires after debounce with snake_case props ───────

  it('fires help.search.performed with query_length and result_count', async () => {
    mockFetch.mockResolvedValue(PIPELINE_RESULTS)
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(<HelpSearch />, { wrapper: makeWrapper() })
    const input = screen.getByRole('searchbox')

    await user.type(input, 'pipeline')
    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    await waitFor(() =>
      expect(
        posthogCaptureSpy.mock.calls.some(([evt]) => evt === 'help.search.performed'),
      ).toBe(true),
    )

    const performedCall = posthogCaptureSpy.mock.calls.find(
      ([evt]) => evt === 'help.search.performed',
    )
    expect(performedCall).toBeTruthy()
    const props = performedCall![1] as Record<string, unknown>
    expect(props.query_length).toBe('pipeline'.length)
    expect(props.result_count).toBe(PIPELINE_RESULTS.length)
    // No camelCase leaks
    expect(Object.keys(props)).not.toContain('queryLength')
    expect(Object.keys(props)).not.toContain('resultCount')
    // Raw query value is privacy-sensitive — must NOT be sent
    expect(Object.keys(props)).not.toContain('query')
  })

  // ── help.search.performed does NOT fire for empty queries ──────────────────

  it('does NOT fire help.search.performed when the query is empty', async () => {
    mockFetch.mockResolvedValue([])
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(<HelpSearch initialQuery="x" />, { wrapper: makeWrapper() })

    // Wait for the initial search to settle
    await act(async () => {
      vi.advanceTimersByTime(300)
    })
    await waitFor(() => expect(mockFetch).toHaveBeenCalled())
    posthogCaptureSpy.mockClear()

    const input = screen.getByRole('searchbox')
    await user.clear(input)
    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    expect(
      posthogCaptureSpy.mock.calls.some(([evt]) => evt === 'help.search.performed'),
    ).toBe(false)
  })

  // ── Result click — analytics fire with snake_case keys ────────────────────

  it('fires help.search.result_clicked with surface_key, result_index, content_type, query_length', async () => {
    mockFetch.mockResolvedValue(PIPELINE_RESULTS)
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    // Pass a click-handler so the component's default `location.assign`
    // navigation does not run (jsdom would log a "not implemented" warning).
    // Analytics fire regardless of the click handler path — that's what we
    // assert here.
    const onResultClick = vi.fn()

    render(<HelpSearch onResultClick={onResultClick} />, { wrapper: makeWrapper() })
    const input = screen.getByRole('searchbox')

    await user.type(input, 'pipeline')
    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    const row = await screen.findByTestId('help-search-result-art-2')
    await user.click(row)

    const clickedCall = posthogCaptureSpy.mock.calls.find(
      ([evt]) => evt === 'help.search.result_clicked',
    )
    expect(clickedCall).toBeTruthy()
    const props = clickedCall![1] as Record<string, unknown>
    expect(props.surface_key).toBe('designer-portal/pipeline')
    expect(props.result_index).toBe(1)
    expect(props.content_type).toBe('helpArticle')
    expect(props.query_length).toBe('pipeline'.length)
    expect(Object.keys(props)).not.toContain('surfaceKey')
    expect(Object.keys(props)).not.toContain('resultIndex')
  })

  // ── Default click — navigates to /help/{surfaceKey} via location.assign ───

  it('navigates to /help/{surfaceKey} when no onResultClick is provided', async () => {
    mockFetch.mockResolvedValue(PIPELINE_RESULTS)
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    // jsdom's `window.location` cannot be patched at the instance level, so
    // we replace the whole accessor for the duration of this test using a
    // PropertyDescriptor on `window`. This silences the "navigation not
    // implemented" warning and lets us assert on the URL.
    const originalDescriptor = Object.getOwnPropertyDescriptor(window, 'location')
    const assignSpy = vi.fn()
    const fakeLocation = {
      ...window.location,
      href: 'http://localhost/',
      assign: assignSpy,
      replace: vi.fn(),
    }
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: fakeLocation,
    })

    try {
      render(<HelpSearch />, { wrapper: makeWrapper() })
      const input = screen.getByRole('searchbox')

      await user.type(input, 'pipeline')
      await act(async () => {
        vi.advanceTimersByTime(300)
      })

      const row = await screen.findByTestId('help-search-result-art-1')
      await user.click(row)

      expect(assignSpy).toHaveBeenCalledWith(
        '/help/designer-portal/pipeline/project-list',
      )
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(window, 'location', originalDescriptor)
      }
    }
  })

  // ── onResultClick callback is invoked ──────────────────────────────────────

  it('invokes onResultClick with the clicked HelpSearchResult', async () => {
    mockFetch.mockResolvedValue(PIPELINE_RESULTS)
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    const onResultClick = vi.fn()

    render(<HelpSearch onResultClick={onResultClick} />, {
      wrapper: makeWrapper(),
    })
    const input = screen.getByRole('searchbox')

    await user.type(input, 'pipeline')
    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    const row = await screen.findByTestId('help-search-result-art-1')
    await user.click(row)

    expect(onResultClick).toHaveBeenCalledTimes(1)
    const [arg] = onResultClick.mock.calls[0]
    expect(arg).toMatchObject({
      id: 'art-1',
      surfaceKey: 'designer-portal/pipeline/project-list',
      contentType: 'helpArticle',
    })
  })

  // ── a11y — listbox + option roles + selected state ─────────────────────────

  it('exposes role=listbox on the results list and role=option on each row', async () => {
    mockFetch.mockResolvedValue(PIPELINE_RESULTS)
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(<HelpSearch />, { wrapper: makeWrapper() })
    const input = screen.getByRole('searchbox')

    await user.type(input, 'pipeline')
    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    const listbox = await screen.findByRole('listbox')
    expect(listbox).toBeInTheDocument()
    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(PIPELINE_RESULTS.length)
  })

  // ── Keyboard navigation — arrow keys move active row, Enter selects ────────

  it('arrow-down / arrow-up moves the active row; Enter selects it', async () => {
    mockFetch.mockResolvedValue(PIPELINE_RESULTS)
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    const onResultClick = vi.fn()
    render(<HelpSearch onResultClick={onResultClick} />, {
      wrapper: makeWrapper(),
    })
    const input = screen.getByRole('searchbox')

    await user.type(input, 'pipeline')
    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    // Wait until results are rendered
    await screen.findByTestId('help-search-result-art-1')

    // Focus the input and press ArrowDown twice → second item active
    input.focus()
    await user.keyboard('{ArrowDown}')
    await user.keyboard('{ArrowDown}')

    // The active option carries aria-selected=true
    const options = screen.getAllByRole('option')
    expect(options[1]).toHaveAttribute('aria-selected', 'true')

    // ArrowUp → first item active
    await user.keyboard('{ArrowUp}')
    expect(options[0]).toHaveAttribute('aria-selected', 'true')

    // Enter triggers selection on the first result
    await user.keyboard('{Enter}')
    expect(onResultClick).toHaveBeenCalledTimes(1)
    expect(onResultClick.mock.calls[0][0]).toMatchObject({ id: 'art-1' })
  })

  // ── maxResults prop is passed as the $max parameter ────────────────────────

  it('passes maxResults as the $max parameter (defaults to 20)', async () => {
    mockFetch.mockResolvedValue([])
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(<HelpSearch maxResults={50} />, { wrapper: makeWrapper() })
    const input = screen.getByRole('searchbox')

    await user.type(input, 'a')
    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    await waitFor(() => expect(mockFetch).toHaveBeenCalled())
    const [, params] = mockFetch.mock.calls[0]
    expect(params.max).toBe(50)
  })

  it('defaults maxResults to 20', async () => {
    mockFetch.mockResolvedValue([])
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(<HelpSearch />, { wrapper: makeWrapper() })
    const input = screen.getByRole('searchbox')

    await user.type(input, 'a')
    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    await waitFor(() => expect(mockFetch).toHaveBeenCalled())
    const [, params] = mockFetch.mock.calls[0]
    expect(params.max).toBe(20)
  })

  // ── Renders many results without crashing ──────────────────────────────────

  it('renders many results (20) without crashing', async () => {
    mockFetch.mockResolvedValue(MANY_RESULTS)
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(<HelpSearch />, { wrapper: makeWrapper() })
    const input = screen.getByRole('searchbox')

    await user.type(input, 'pipeline')
    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    await waitFor(() => {
      const options = screen.getAllByRole('option')
      expect(options).toHaveLength(MANY_RESULTS.length)
    })
  })

  // ── Sanity downtime — fetch throws, component renders no-results gracefully

  it('falls back to the no-results state when the Sanity fetch throws', async () => {
    mockFetch.mockRejectedValue(new Error('Sanity unreachable'))
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(<HelpSearch />, { wrapper: makeWrapper() })
    const input = screen.getByRole('searchbox')

    await user.type(input, 'pipeline')
    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    await waitFor(() =>
      expect(screen.getByTestId('help-search-no-results')).toBeInTheDocument(),
    )
  })

  // ── Does not crash if window.posthog is missing ────────────────────────────

  it('does not crash when window.posthog is missing', async () => {
    mockFetch.mockResolvedValue(PIPELINE_RESULTS)
    delete (window as unknown as { posthog?: unknown }).posthog
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(<HelpSearch />, { wrapper: makeWrapper() })
    const input = screen.getByRole('searchbox')

    await user.type(input, 'pipeline')
    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    // No throw, results render normally
    expect(
      await screen.findByText('How the Pipeline works'),
    ).toBeInTheDocument()
  })
})
