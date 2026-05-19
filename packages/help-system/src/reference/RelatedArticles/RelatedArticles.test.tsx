/**
 * RelatedArticles — unit tests (Sprint 3 · Stream E · Task E4)
 *
 * Validates the Layer 4 (Reference) related-articles list per spec §4.
 *
 * The Sanity client is mocked end-to-end so the underlying useQuery fetch
 * exercises real cache logic without live network I/O.
 *
 * Key contracts:
 *   - Supports two query modes: by IDs OR by surface-key prefix.
 *   - Click fires `help.related_article.clicked` with snake_case keys.
 *   - Empty state renders NOTHING (supplementary surface — never noisy).
 *   - GROQ is parameterized.
 *   - `max` is respected.
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RelatedArticles } from './RelatedArticles'

// ─── Mock the Sanity client module ────────────────────────────────────────────

const mockFetch = vi.fn()

vi.mock('../../sanityClient', () => ({
  getSanityClient: () => ({ fetch: mockFetch }),
  _resetSanityClient: vi.fn(),
}))

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

const SAMPLE_ARTICLES = [
  {
    _id: 'article-1',
    surfaceKey: 'designer-portal/pipeline/project-list',
    helpArticleContent: {
      title: 'How the Pipeline works',
      oneSentenceAnswer:
        'The Pipeline view tracks every project across the four stages.',
    },
  },
  {
    _id: 'article-2',
    surfaceKey: 'designer-portal/pipeline',
    helpArticleContent: {
      title: 'Pipeline stages explained',
      oneSentenceAnswer:
        'Each stage represents a clear handoff point between you and the client.',
    },
  },
  {
    _id: 'article-3',
    surfaceKey: 'designer-portal',
    helpArticleContent: {
      title: 'Welcome to Patina',
      oneSentenceAnswer: 'A brief overview of the Designer Portal.',
    },
  },
]

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('RelatedArticles', () => {
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

  // ── Renders heading + items when articleIds passed ─────────────────────────

  it('renders heading and items when articleIds are provided', async () => {
    mockFetch.mockResolvedValue(SAMPLE_ARTICLES)

    render(
      <RelatedArticles articleIds={['article-1', 'article-2', 'article-3']} />,
      { wrapper: makeWrapper() },
    )

    expect(
      await screen.findByRole('heading', { name: /related articles/i }),
    ).toBeInTheDocument()
    expect(screen.getByText('How the Pipeline works')).toBeInTheDocument()
    expect(screen.getByText('Pipeline stages explained')).toBeInTheDocument()
    expect(screen.getByText('Welcome to Patina')).toBeInTheDocument()
  })

  // ── articleIds mode queries with the right GROQ shape + params ─────────────

  it('queries Sanity by IDs when articleIds is provided', async () => {
    mockFetch.mockResolvedValue(SAMPLE_ARTICLES.slice(0, 2))

    render(
      <RelatedArticles articleIds={['article-1', 'article-2']} />,
      { wrapper: makeWrapper() },
    )

    await waitFor(() => expect(mockFetch).toHaveBeenCalled())
    const [query, params] = mockFetch.mock.calls[0] as [string, Record<string, unknown>]

    // ID-mode query references $ids and the helpArticle contentType
    expect(query).toMatch(/\$ids/)
    expect(query).toMatch(/_type\s*==\s*"helpContent"/)
    expect(query).toMatch(/contentType\s*==\s*"helpArticle"/)

    expect(params).toMatchObject({
      ids: ['article-1', 'article-2'],
      max: expect.any(Number),
    })
  })

  // ── surfaceKeyPrefix mode queries with prefix + helpArticle ────────────────

  it('queries Sanity by surface-key prefix when surfaceKeyPrefix is provided', async () => {
    mockFetch.mockResolvedValue(SAMPLE_ARTICLES)

    render(
      <RelatedArticles surfaceKeyPrefix="designer-portal/pipeline" />,
      { wrapper: makeWrapper() },
    )

    await waitFor(() => expect(mockFetch).toHaveBeenCalled())
    const [query, params] = mockFetch.mock.calls[0] as [string, Record<string, unknown>]

    // Prefix-mode query references $prefix + helpArticle filter
    expect(query).toMatch(/\$prefix/)
    expect(query).toMatch(/contentType\s*==\s*"helpArticle"/)
    expect(params).toMatchObject({
      prefix: expect.stringContaining('designer-portal/pipeline'),
      max: expect.any(Number),
    })
  })

  // ── articleIds wins over surfaceKeyPrefix when both are passed ─────────────

  it('prefers articleIds over surfaceKeyPrefix when both are provided', async () => {
    mockFetch.mockResolvedValue(SAMPLE_ARTICLES.slice(0, 1))

    render(
      <RelatedArticles
        articleIds={['article-1']}
        surfaceKeyPrefix="designer-portal/pipeline"
      />,
      { wrapper: makeWrapper() },
    )

    await waitFor(() => expect(mockFetch).toHaveBeenCalled())
    const [query] = mockFetch.mock.calls[0] as [string, Record<string, unknown>]
    expect(query).toMatch(/\$ids/)
    expect(query).not.toMatch(/\$prefix/)
  })

  // ── Empty state renders NOTHING when results are empty ─────────────────────

  it('renders nothing when no results are returned', async () => {
    mockFetch.mockResolvedValue([])

    const { container } = render(
      <RelatedArticles surfaceKeyPrefix="designer-portal/unknown" />,
      { wrapper: makeWrapper() },
    )

    await waitFor(() => expect(mockFetch).toHaveBeenCalled())
    // Allow microtasks to settle so the empty-state branch has rendered.
    await waitFor(() => expect(container.firstChild).toBeNull())
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  // ── Renders nothing when neither articleIds nor surfaceKeyPrefix passed ────

  it('renders nothing when neither articleIds nor surfaceKeyPrefix is provided', () => {
    const { container } = render(<RelatedArticles />, { wrapper: makeWrapper() })
    expect(container.firstChild).toBeNull()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  // ── articleIds empty array → no fetch + nothing rendered ───────────────────

  it('renders nothing when articleIds is an empty array', () => {
    const { container } = render(
      <RelatedArticles articleIds={[]} />,
      { wrapper: makeWrapper() },
    )
    expect(container.firstChild).toBeNull()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  // ── Max is respected (passed to query + applied client-side as safety) ─────

  it('respects the max prop and forwards it to the query', async () => {
    mockFetch.mockResolvedValue(SAMPLE_ARTICLES)

    render(
      <RelatedArticles
        articleIds={['article-1', 'article-2', 'article-3']}
        max={2}
      />,
      { wrapper: makeWrapper() },
    )

    await waitFor(() => expect(mockFetch).toHaveBeenCalled())
    const [, params] = mockFetch.mock.calls[0] as [string, Record<string, unknown>]
    expect(params.max).toBe(2)

    // Even if Sanity returns more than max (defensive), only render up to max.
    const list = await screen.findByRole('list')
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
  })

  // ── Default max is 5 ───────────────────────────────────────────────────────

  it('defaults max to 5 when not specified', async () => {
    mockFetch.mockResolvedValue(SAMPLE_ARTICLES)

    render(
      <RelatedArticles articleIds={['article-1']} />,
      { wrapper: makeWrapper() },
    )

    await waitFor(() => expect(mockFetch).toHaveBeenCalled())
    const [, params] = mockFetch.mock.calls[0] as [string, Record<string, unknown>]
    expect(params.max).toBe(5)
  })

  // ── Click fires help.related_article.clicked with snake_case keys ──────────

  it('fires help.related_article.clicked with snake_case keys on item click', async () => {
    mockFetch.mockResolvedValue(SAMPLE_ARTICLES)
    const user = userEvent.setup()

    render(
      <RelatedArticles surfaceKeyPrefix="designer-portal/pipeline" />,
      { wrapper: makeWrapper() },
    )

    const item = await screen.findByRole('link', { name: /how the pipeline works/i })
    await user.click(item)

    const call = posthogCaptureSpy.mock.calls.find(
      ([evt]) => evt === 'help.related_article.clicked',
    )
    expect(call).toBeTruthy()
    const props = call![1] as Record<string, unknown>
    expect(props.from_surface_key).toBe('designer-portal/pipeline')
    expect(props.to_surface_key).toBe('designer-portal/pipeline/project-list')
    expect(props.to_article_id).toBe('article-1')

    // No camelCase leaks
    expect(Object.keys(props)).not.toContain('fromSurfaceKey')
    expect(Object.keys(props)).not.toContain('toSurfaceKey')
    expect(Object.keys(props)).not.toContain('toArticleId')
  })

  // ── In articleIds mode, from_surface_key falls back to "unknown" ───────────

  it('uses "unknown" as from_surface_key when in articleIds mode without prefix', async () => {
    mockFetch.mockResolvedValue(SAMPLE_ARTICLES)
    const user = userEvent.setup()

    render(
      <RelatedArticles articleIds={['article-1']} />,
      { wrapper: makeWrapper() },
    )

    const item = await screen.findByRole('link', { name: /how the pipeline works/i })
    await user.click(item)

    const call = posthogCaptureSpy.mock.calls.find(
      ([evt]) => evt === 'help.related_article.clicked',
    )
    expect(call).toBeTruthy()
    expect((call![1] as Record<string, unknown>).from_surface_key).toBe('unknown')
  })

  // ── onArticleClick callback invoked with (id, surfaceKey) ──────────────────

  it('invokes onArticleClick with (articleId, surfaceKey)', async () => {
    mockFetch.mockResolvedValue(SAMPLE_ARTICLES.slice(0, 1))
    const onArticleClick = vi.fn()
    const user = userEvent.setup()

    render(
      <RelatedArticles
        articleIds={['article-1']}
        onArticleClick={onArticleClick}
      />,
      { wrapper: makeWrapper() },
    )

    const item = await screen.findByRole('link', { name: /how the pipeline works/i })
    await user.click(item)

    expect(onArticleClick).toHaveBeenCalledWith(
      'article-1',
      'designer-portal/pipeline/project-list',
    )
  })

  // ── Custom heading override ────────────────────────────────────────────────

  it('renders a custom heading when the heading prop is provided', async () => {
    mockFetch.mockResolvedValue(SAMPLE_ARTICLES.slice(0, 1))

    render(
      <RelatedArticles
        articleIds={['article-1']}
        heading="You might also like"
      />,
      { wrapper: makeWrapper() },
    )

    expect(
      await screen.findByRole('heading', { name: 'You might also like' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: /related articles/i }),
    ).not.toBeInTheDocument()
  })

  // ── className is forwarded to the outer container ──────────────────────────

  it('forwards className to the outer container', async () => {
    mockFetch.mockResolvedValue(SAMPLE_ARTICLES.slice(0, 1))

    const { container } = render(
      <RelatedArticles
        articleIds={['article-1']}
        className="my-custom-class"
      />,
      { wrapper: makeWrapper() },
    )

    await waitFor(() => expect(mockFetch).toHaveBeenCalled())
    // Find the outer container (the first child of the test root).
    await waitFor(() =>
      expect((container.firstChild as HTMLElement)?.className).toMatch(/my-custom-class/),
    )
  })

  // ── Loading shows a single skeleton row ────────────────────────────────────

  it('renders a skeleton row while loading', () => {
    // Never resolve — keep loading state stable.
    mockFetch.mockImplementation(() => new Promise(() => undefined))

    render(
      <RelatedArticles articleIds={['article-1']} />,
      { wrapper: makeWrapper() },
    )

    expect(screen.getByTestId('related-articles-skeleton')).toBeInTheDocument()
  })

  // ── ul has role="list" for explicit semantics ──────────────────────────────

  it('renders the list as a <ul role="list">', async () => {
    mockFetch.mockResolvedValue(SAMPLE_ARTICLES.slice(0, 2))

    render(
      <RelatedArticles articleIds={['article-1', 'article-2']} />,
      { wrapper: makeWrapper() },
    )

    const list = await screen.findByRole('list')
    expect(list.tagName).toBe('UL')
    expect(list).toHaveAttribute('role', 'list')
  })

  // ── Renders title + excerpt for each article ───────────────────────────────

  it('renders the title and oneSentenceAnswer excerpt for each article', async () => {
    mockFetch.mockResolvedValue(SAMPLE_ARTICLES.slice(0, 2))

    render(
      <RelatedArticles articleIds={['article-1', 'article-2']} />,
      { wrapper: makeWrapper() },
    )

    expect(
      await screen.findByText('How the Pipeline works'),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/tracks every project across the four stages/i),
    ).toBeInTheDocument()
    expect(screen.getByText('Pipeline stages explained')).toBeInTheDocument()
    expect(
      screen.getByText(/clear handoff point/i),
    ).toBeInTheDocument()
  })

  // ── Sanity downtime — fetch throws, component renders nothing ──────────────

  it('renders nothing when the Sanity fetch throws', async () => {
    mockFetch.mockRejectedValue(new Error('Sanity unreachable'))

    const { container } = render(
      <RelatedArticles articleIds={['article-1']} />,
      { wrapper: makeWrapper() },
    )

    await waitFor(() => expect(mockFetch).toHaveBeenCalled())
    await waitFor(() => expect(container.firstChild).toBeNull())
  })

  // ── Does not crash when window.posthog is missing ──────────────────────────

  it('does not crash when window.posthog is missing on click', async () => {
    mockFetch.mockResolvedValue(SAMPLE_ARTICLES.slice(0, 1))
    delete (window as unknown as { posthog?: unknown }).posthog
    const user = userEvent.setup()

    render(
      <RelatedArticles articleIds={['article-1']} />,
      { wrapper: makeWrapper() },
    )

    const item = await screen.findByRole('link', { name: /how the pipeline works/i })
    expect(() => user.click(item)).not.toThrow()
  })
})
