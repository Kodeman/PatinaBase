/**
 * HelpArticle — unit tests
 *
 * Spec refs: §4.9 (component contract), §10.1 (analytics).
 * Covered behaviours:
 *   - renders title + portable-text body when content is provided
 *   - fires `help.article.opened` once on mount with snake_case keys
 *   - fires `help.article.scrolled_to_end` when the sentinel intersects
 *     (and only fires once per article)
 *   - feedback buttons fire `help.article.feedback_given` with helpful:boolean
 *   - clicking the same feedback button twice toggles off and does NOT re-fire
 *   - null content + fallbackTitle renders the fallback
 *   - null content + no fallback renders nothing
 *   - renderRelated slot is invoked with the relatedArticles ids
 *   - source prop flows into the opened analytics payload
 *   - useHelpContent path: content fetched when only surfaceKey is provided
 *   - intersection observer is torn down on unmount
 *   - feedback widget is keyboard accessible (Enter activates button)
 */

import React from 'react'
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HelpArticle } from './HelpArticle'
import type { HelpArticleContent } from '../../contentTypes'

// ─── Sanity client mock (for the useHelpContent fetch path) ──────────────────

const mockFetch = vi.fn()

vi.mock('../../sanityClient', () => ({
  getSanityClient: () => ({ fetch: mockFetch }),
  _resetSanityClient: vi.fn(),
}))

// ─── Controllable IntersectionObserver mock ──────────────────────────────────
//
// vitest.setup.ts installs a no-op IO. We need one we can drive from tests so
// the sentinel can fire `isIntersecting: true` on demand. Each instance is
// registered on this map keyed by callback so a test can grab it and call
// `triggerIntersection()` directly.

interface IOInstance {
  callback: IntersectionObserverCallback
  disconnected: boolean
  observed: Element[]
}

const ioInstances: IOInstance[] = []

class ControllableIntersectionObserver implements IntersectionObserver {
  readonly root = null
  readonly rootMargin = '0px'
  readonly thresholds: ReadonlyArray<number> = [0]
  private instance: IOInstance

  constructor(callback: IntersectionObserverCallback) {
    this.instance = { callback, disconnected: false, observed: [] }
    ioInstances.push(this.instance)
  }
  observe(target: Element) {
    this.instance.observed.push(target)
  }
  unobserve(target: Element) {
    this.instance.observed = this.instance.observed.filter((el) => el !== target)
  }
  disconnect() {
    this.instance.disconnected = true
  }
  takeRecords(): IntersectionObserverEntry[] {
    return []
  }
}

function triggerLatestIntersection(isIntersecting: boolean): void {
  const latest = ioInstances[ioInstances.length - 1]
  if (!latest || latest.disconnected) return
  const target = latest.observed[0]
  if (!target) return
  const entry = {
    isIntersecting,
    target,
    intersectionRatio: isIntersecting ? 1 : 0,
    intersectionRect: target.getBoundingClientRect(),
    boundingClientRect: target.getBoundingClientRect(),
    rootBounds: null,
    time: performance.now(),
  } as IntersectionObserverEntry
  latest.callback([entry], latest as unknown as IntersectionObserver)
}

// Install before every test, restore after.
const originalIO = global.IntersectionObserver

beforeEach(() => {
  ioInstances.length = 0
  global.IntersectionObserver =
    ControllableIntersectionObserver as unknown as typeof IntersectionObserver
})

afterEach(() => {
  global.IntersectionObserver = originalIO
})

// ─── PostHog stub ────────────────────────────────────────────────────────────

interface PosthogStub {
  capture: Mock
}

function installPosthogStub(): PosthogStub {
  const stub: PosthogStub = { capture: vi.fn() }
  ;(window as unknown as { posthog?: PosthogStub }).posthog = stub
  return stub
}

function uninstallPosthogStub(): void {
  delete (window as unknown as { posthog?: PosthogStub }).posthog
}

// ─── React Query wrapper ─────────────────────────────────────────────────────

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  })
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return { Wrapper, queryClient }
}

async function flush(): Promise<void> {
  // Two microtask ticks — useQuery resolution + render commit.
  await new Promise((r) => setTimeout(r, 0))
  await new Promise((r) => setTimeout(r, 0))
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const SURFACE_KEY = 'designer-portal/pipeline/project-list'
const ARTICLE_ID = 'article-pipeline-overview'

function makeArticle(overrides: Partial<HelpArticleContent> = {}): HelpArticleContent & {
  _id?: string
  relatedArticles?: Array<{ _ref: string } | string>
} {
  return {
    surfaceKey: SURFACE_KEY,
    persona: 'all',
    contentType: 'helpArticle',
    eyebrow: 'Help · Pipeline',
    title: 'What is the project pipeline?',
    oneSentenceAnswer:
      'The pipeline tracks every project from first lead through final install.',
    body: [
      {
        _type: 'block',
        _key: 'b1',
        style: 'normal',
        children: [
          { _type: 'span', _key: 's1', text: 'Drag a card to move it between stages.', marks: [] },
        ],
        markDefs: [],
      },
      {
        _type: 'block',
        _key: 'b2',
        style: 'h2',
        children: [{ _type: 'span', _key: 's2', text: 'How stages work', marks: [] }],
        markDefs: [],
      },
      {
        _type: 'block',
        _key: 'b3',
        style: 'normal',
        children: [
          {
            _type: 'span',
            _key: 's3',
            text: 'Stages advance automatically when their criteria are met.',
            marks: [],
          },
        ],
        markDefs: [],
      },
    ],
    wordCount: 22,
    readingTimeMinutes: 1,
    lastUpdated: '2026-04-12',
    _id: ARTICLE_ID,
    ...overrides,
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('<HelpArticle />', () => {
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
  })

  // ── 1. Rendering ───────────────────────────────────────────────────────

  it('renders title, eyebrow, one-sentence answer, and portable-text body', () => {
    const article = makeArticle()
    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <HelpArticle content={article} surfaceKey={SURFACE_KEY} />
      </Wrapper>,
    )

    expect(
      screen.getByRole('heading', { level: 1, name: /what is the project pipeline\?/i }),
    ).toBeInTheDocument()
    expect(screen.getByTestId('help-article-eyebrow')).toHaveTextContent('Help · Pipeline')
    expect(screen.getByTestId('help-article-one-sentence-answer')).toHaveTextContent(
      /the pipeline tracks every project/i,
    )

    // Body — portable text renders the spans
    expect(screen.getByTestId('help-article-body')).toHaveTextContent(
      /drag a card to move it between stages/i,
    )
    expect(
      screen.getByRole('heading', { level: 2, name: /how stages work/i }),
    ).toBeInTheDocument()
    expect(screen.getByTestId('help-article-body')).toHaveTextContent(
      /stages advance automatically/i,
    )
  })

  it('renders reading time + last updated metadata when present', () => {
    const article = makeArticle()
    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <HelpArticle content={article} surfaceKey={SURFACE_KEY} />
      </Wrapper>,
    )

    const meta = screen.getByTestId('help-article-meta')
    expect(meta).toHaveTextContent(/updated/i)
    expect(meta).toHaveTextContent(/1 min read/i)
  })

  // ── 2. help.article.opened on mount ────────────────────────────────────

  it('fires help.article.opened once on mount with snake_case keys', () => {
    const article = makeArticle()
    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <HelpArticle content={article} surfaceKey={SURFACE_KEY} source="help_center" />
      </Wrapper>,
    )

    const openedCalls = posthog.capture.mock.calls.filter(
      ([event]) => event === 'help.article.opened',
    )
    expect(openedCalls).toHaveLength(1)
    expect(openedCalls[0][1]).toEqual({
      article_id: ARTICLE_ID,
      surface_key: SURFACE_KEY,
      source: 'help_center',
    })
  })

  it('does not fire help.article.opened when content is null', () => {
    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <HelpArticle content={null} surfaceKey={SURFACE_KEY} fallbackTitle="Coming soon" />
      </Wrapper>,
    )

    const openedCalls = posthog.capture.mock.calls.filter(
      ([event]) => event === 'help.article.opened',
    )
    expect(openedCalls).toHaveLength(0)
  })

  // ── 3. source prop flows into analytics ────────────────────────────────

  it.each([
    ['help_center'],
    ['contextual_panel'],
    ['search'],
  ])('threads source=%s through to help.article.opened', (src) => {
    const article = makeArticle()
    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <HelpArticle content={article} surfaceKey={SURFACE_KEY} source={src} />
      </Wrapper>,
    )

    expect(posthog.capture).toHaveBeenCalledWith(
      'help.article.opened',
      expect.objectContaining({ source: src }),
    )
  })

  // ── 4. scrolled_to_end on intersection ────────────────────────────────

  it('fires help.article.scrolled_to_end when sentinel intersects, only once', () => {
    const article = makeArticle()
    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <HelpArticle content={article} surfaceKey={SURFACE_KEY} />
      </Wrapper>,
    )

    // No scroll event yet
    expect(
      posthog.capture.mock.calls.filter(([e]) => e === 'help.article.scrolled_to_end'),
    ).toHaveLength(0)

    act(() => {
      triggerLatestIntersection(true)
    })

    const scrolledCalls = posthog.capture.mock.calls.filter(
      ([e]) => e === 'help.article.scrolled_to_end',
    )
    expect(scrolledCalls).toHaveLength(1)
    expect(scrolledCalls[0][1]).toEqual({
      article_id: ARTICLE_ID,
      surface_key: SURFACE_KEY,
    })

    // Fire again — observer should be disconnected, no second event.
    act(() => {
      triggerLatestIntersection(true)
    })
    expect(
      posthog.capture.mock.calls.filter(([e]) => e === 'help.article.scrolled_to_end'),
    ).toHaveLength(1)
  })

  it('does not fire scrolled_to_end if sentinel never intersects', () => {
    const article = makeArticle()
    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <HelpArticle content={article} surfaceKey={SURFACE_KEY} />
      </Wrapper>,
    )

    act(() => {
      triggerLatestIntersection(false)
    })
    expect(
      posthog.capture.mock.calls.filter(([e]) => e === 'help.article.scrolled_to_end'),
    ).toHaveLength(0)
  })

  it('tears down the IntersectionObserver on unmount', () => {
    const article = makeArticle()
    const { Wrapper } = makeWrapper()
    const { unmount } = render(
      <Wrapper>
        <HelpArticle content={article} surfaceKey={SURFACE_KEY} />
      </Wrapper>,
    )

    const latest = ioInstances[ioInstances.length - 1]
    expect(latest).toBeDefined()
    expect(latest!.disconnected).toBe(false)

    unmount()
    expect(latest!.disconnected).toBe(true)
  })

  // ── 5. Feedback widget ────────────────────────────────────────────────

  it('fires help.article.feedback_given with helpful=true on thumbs-up', async () => {
    const article = makeArticle()
    const user = userEvent.setup()
    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <HelpArticle content={article} surfaceKey={SURFACE_KEY} />
      </Wrapper>,
    )

    const yesBtn = screen.getByTestId('help-article-feedback-up')
    await user.click(yesBtn)

    const feedbackCalls = posthog.capture.mock.calls.filter(
      ([e]) => e === 'help.article.feedback_given',
    )
    expect(feedbackCalls).toHaveLength(1)
    expect(feedbackCalls[0][1]).toEqual({
      article_id: ARTICLE_ID,
      surface_key: SURFACE_KEY,
      helpful: true,
      has_comment: false,
    })
    expect(yesBtn).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('help-article-feedback-thanks')).toBeInTheDocument()
  })

  it('fires help.article.feedback_given with helpful=false on thumbs-down', async () => {
    const article = makeArticle()
    const user = userEvent.setup()
    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <HelpArticle content={article} surfaceKey={SURFACE_KEY} />
      </Wrapper>,
    )

    await user.click(screen.getByTestId('help-article-feedback-down'))

    const feedbackCalls = posthog.capture.mock.calls.filter(
      ([e]) => e === 'help.article.feedback_given',
    )
    expect(feedbackCalls).toHaveLength(1)
    expect(feedbackCalls[0][1]).toMatchObject({
      article_id: ARTICLE_ID,
      surface_key: SURFACE_KEY,
      helpful: false,
      has_comment: false,
    })
  })

  it('toggling the same feedback button off does not fire a second event', async () => {
    const article = makeArticle()
    const user = userEvent.setup()
    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <HelpArticle content={article} surfaceKey={SURFACE_KEY} />
      </Wrapper>,
    )

    const yesBtn = screen.getByTestId('help-article-feedback-up')
    await user.click(yesBtn) // engage
    await user.click(yesBtn) // toggle off

    const feedbackCalls = posthog.capture.mock.calls.filter(
      ([e]) => e === 'help.article.feedback_given',
    )
    expect(feedbackCalls).toHaveLength(1)
    expect(yesBtn).toHaveAttribute('aria-pressed', 'false')
  })

  it('feedback buttons are activatable via the keyboard (Enter)', async () => {
    const article = makeArticle()
    const user = userEvent.setup()
    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <HelpArticle content={article} surfaceKey={SURFACE_KEY} />
      </Wrapper>,
    )

    const yesBtn = screen.getByTestId('help-article-feedback-up')
    yesBtn.focus()
    await user.keyboard('{Enter}')

    expect(yesBtn).toHaveAttribute('aria-pressed', 'true')
    expect(
      posthog.capture.mock.calls.filter(([e]) => e === 'help.article.feedback_given'),
    ).toHaveLength(1)
  })

  // ── 6. Fallback / empty paths ─────────────────────────────────────────

  it('renders the fallback title when content is null and fallbackTitle is supplied', () => {
    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <HelpArticle content={null} fallbackTitle="Article coming soon" />
      </Wrapper>,
    )

    expect(
      screen.getByRole('heading', { level: 1, name: /article coming soon/i }),
    ).toBeInTheDocument()
    expect(screen.getByTestId('help-article-fallback')).toBeInTheDocument()
  })

  it('renders nothing when content is null and no fallbackTitle', () => {
    const { Wrapper } = makeWrapper()
    const { container } = render(
      <Wrapper>
        <HelpArticle content={null} />
      </Wrapper>,
    )

    expect(container.firstChild).toBeNull()
  })

  // ── 7. renderRelated slot ─────────────────────────────────────────────

  it('invokes renderRelated with the related article ids extracted from the doc', () => {
    const article = makeArticle({
      // @ts-expect-error -- relatedArticles isn't in the typed shape (yet)
      relatedArticles: [{ _ref: 'related-1' }, { _ref: 'related-2' }, 'related-3'],
    })
    const renderRelated = vi.fn((ids: string[]) => (
      <ul data-testid="related-mock">
        {ids.map((id) => (
          <li key={id}>{id}</li>
        ))}
      </ul>
    ))

    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <HelpArticle
          content={article}
          surfaceKey={SURFACE_KEY}
          renderRelated={renderRelated}
        />
      </Wrapper>,
    )

    expect(renderRelated).toHaveBeenCalledWith(['related-1', 'related-2', 'related-3'])
    expect(screen.getByTestId('related-mock')).toBeInTheDocument()
    expect(screen.getByText('related-1')).toBeInTheDocument()
  })

  it('omits the related slot when no related articles are present', () => {
    const article = makeArticle()
    const renderRelated = vi.fn()
    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <HelpArticle
          content={article}
          surfaceKey={SURFACE_KEY}
          renderRelated={renderRelated}
        />
      </Wrapper>,
    )

    expect(renderRelated).not.toHaveBeenCalled()
    expect(screen.queryByTestId('help-article-related')).not.toBeInTheDocument()
  })

  // ── 8. useHelpContent fetch path (surfaceKey only) ────────────────────

  it('fetches via useHelpContent when only surfaceKey is supplied', async () => {
    const article = makeArticle()
    mockFetch.mockResolvedValueOnce(article)

    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <HelpArticle surfaceKey={SURFACE_KEY} source="search" />
      </Wrapper>,
    )

    // Pre-fetch: no title yet.
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()

    await act(async () => {
      await flush()
    })

    expect(
      screen.getByRole('heading', { level: 1, name: /what is the project pipeline\?/i }),
    ).toBeInTheDocument()

    const openedCalls = posthog.capture.mock.calls.filter(
      ([e]) => e === 'help.article.opened',
    )
    expect(openedCalls).toHaveLength(1)
    expect(openedCalls[0][1]).toMatchObject({
      source: 'search',
      surface_key: SURFACE_KEY,
    })
  })

  // ── 9. PostHog absence is non-fatal ───────────────────────────────────

  it('does not throw when window.posthog is undefined', async () => {
    uninstallPosthogStub()
    const article = makeArticle()
    const user = userEvent.setup()
    const { Wrapper } = makeWrapper()

    expect(() =>
      render(
        <Wrapper>
          <HelpArticle content={article} surfaceKey={SURFACE_KEY} />
        </Wrapper>,
      ),
    ).not.toThrow()

    const yesBtn = screen.getByTestId('help-article-feedback-up')
    await expect(user.click(yesBtn)).resolves.not.toThrow()

    act(() => {
      triggerLatestIntersection(true)
    })
    // No crashes — assertion is the absence of a thrown error.
  })

  // ── 10. className passthrough ─────────────────────────────────────────

  it('applies className to the article root', () => {
    const article = makeArticle()
    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <HelpArticle
          content={article}
          surfaceKey={SURFACE_KEY}
          className="my-article-shell"
        />
      </Wrapper>,
    )

    const root = screen.getByTestId('help-article')
    expect(root.className).toContain('my-article-shell')
  })
})
