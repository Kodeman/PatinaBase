/**
 * VideoPlayer — unit tests
 *
 * Reference-layer component (spec §4 Layer 4) that wraps an HTML5 <video> with
 * caption support, optional transcript reveal, and minimal analytics
 * (started + completed). No Radix dep — native controls + transcript toggle.
 *
 * Sanity content lookup is mocked. PostHog is mocked via window.posthog.
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { VideoPlayer } from './VideoPlayer'
import type { VideoContent } from '../../contentTypes'

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
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SAMPLE_SRC = 'https://cdn.sanity.io/files/abc/dataset/video-123.mp4'
const SAMPLE_POSTER = 'https://cdn.sanity.io/images/abc/dataset/poster-123.png'
const SAMPLE_CAPTIONS = 'https://cdn.sanity.io/files/abc/dataset/captions-123.vtt'

const videoFixture: VideoContent = {
  surfaceKey: 'designer-portal/onboarding/first-project-walkthrough',
  persona: 'all',
  contentType: 'video',
  src: SAMPLE_SRC,
  posterUrl: SAMPLE_POSTER,
  captionsUrl: SAMPLE_CAPTIONS,
  transcript: 'In this video, we walk through your first project setup.',
  title: 'First Project Walkthrough',
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('<VideoPlayer />', () => {
  let captureSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    captureSpy = vi.fn()
    ;(window as unknown as { posthog?: { capture: typeof captureSpy } }).posthog = {
      capture: captureSpy,
    }
  })

  afterEach(() => {
    delete (window as unknown as { posthog?: unknown }).posthog
  })

  // ── 1. Renders <video> element with src ─────────────────────────────────────

  it('renders a native <video> element with the provided src', () => {
    const { Wrapper } = makeWrapper()
    const { container } = render(
      <Wrapper>
        <VideoPlayer src={SAMPLE_SRC} />
      </Wrapper>,
    )

    const video = container.querySelector('video')
    expect(video).not.toBeNull()
    expect(video?.getAttribute('src')).toBe(SAMPLE_SRC)
  })

  it('renders native <video> controls by default', () => {
    const { Wrapper } = makeWrapper()
    const { container } = render(
      <Wrapper>
        <VideoPlayer src={SAMPLE_SRC} />
      </Wrapper>,
    )

    const video = container.querySelector('video')
    expect(video).toHaveAttribute('controls')
  })

  it('does NOT autoplay by default (reduced-motion safety)', () => {
    const { Wrapper } = makeWrapper()
    const { container } = render(
      <Wrapper>
        <VideoPlayer src={SAMPLE_SRC} />
      </Wrapper>,
    )

    const video = container.querySelector('video')
    expect(video).not.toHaveAttribute('autoplay')
  })

  // ── 2. Captions track present when captionsUrl provided ─────────────────────

  it('renders a captions <track> element when captionsUrl is provided', () => {
    const { Wrapper } = makeWrapper()
    const { container } = render(
      <Wrapper>
        <VideoPlayer src={SAMPLE_SRC} captionsUrl={SAMPLE_CAPTIONS} />
      </Wrapper>,
    )

    const track = container.querySelector('video track')
    expect(track).not.toBeNull()
    expect(track?.getAttribute('src')).toBe(SAMPLE_CAPTIONS)
    expect(track?.getAttribute('kind')).toBe('captions')
    expect(track?.getAttribute('srclang')).toBe('en')
    // `default` shows captions by default per a11y best practice
    expect(track?.hasAttribute('default')).toBe(true)
  })

  it('does not render a <track> element when captionsUrl is absent', () => {
    const { Wrapper } = makeWrapper()
    const { container } = render(
      <Wrapper>
        <VideoPlayer src={SAMPLE_SRC} />
      </Wrapper>,
    )

    expect(container.querySelector('video track')).toBeNull()
  })

  // ── 3. Transcript toggle ────────────────────────────────────────────────────

  it('renders a transcript toggle button when transcript is provided', () => {
    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <VideoPlayer src={SAMPLE_SRC} transcript="A transcript paragraph." />
      </Wrapper>,
    )

    expect(
      screen.getByRole('button', { name: /show transcript/i }),
    ).toBeInTheDocument()
  })

  it('hides transcript content by default', () => {
    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <VideoPlayer src={SAMPLE_SRC} transcript="A transcript paragraph." />
      </Wrapper>,
    )

    expect(screen.queryByText('A transcript paragraph.')).not.toBeInTheDocument()
  })

  it('reveals transcript content when toggle is clicked, hides on second click', async () => {
    const user = userEvent.setup()
    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <VideoPlayer src={SAMPLE_SRC} transcript="A transcript paragraph." />
      </Wrapper>,
    )

    await user.click(screen.getByRole('button', { name: /show transcript/i }))

    expect(screen.getByText('A transcript paragraph.')).toBeInTheDocument()
    // Toggle label flips
    expect(
      screen.getByRole('button', { name: /hide transcript/i }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /hide transcript/i }))

    expect(screen.queryByText('A transcript paragraph.')).not.toBeInTheDocument()
  })

  it('does not render the transcript toggle when no transcript is provided', () => {
    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <VideoPlayer src={SAMPLE_SRC} />
      </Wrapper>,
    )

    expect(
      screen.queryByRole('button', { name: /show transcript/i }),
    ).not.toBeInTheDocument()
  })

  // ── 4. Analytics: started + completed ───────────────────────────────────────

  it('fires help.video.started on the first play event', () => {
    const { Wrapper } = makeWrapper()
    const { container } = render(
      <Wrapper>
        <VideoPlayer src={SAMPLE_SRC} />
      </Wrapper>,
    )

    const video = container.querySelector('video') as HTMLVideoElement
    fireEvent.play(video)

    expect(captureSpy).toHaveBeenCalledWith(
      'help.video.started',
      expect.objectContaining({
        src: SAMPLE_SRC,
      }),
    )
  })

  it('only fires help.video.started once even on multiple play events', () => {
    const { Wrapper } = makeWrapper()
    const { container } = render(
      <Wrapper>
        <VideoPlayer src={SAMPLE_SRC} />
      </Wrapper>,
    )

    const video = container.querySelector('video') as HTMLVideoElement
    fireEvent.play(video)
    fireEvent.play(video)
    fireEvent.play(video)

    const startedCalls = captureSpy.mock.calls.filter(
      ([event]) => event === 'help.video.started',
    )
    expect(startedCalls).toHaveLength(1)
  })

  it('fires help.video.completed with duration_ms on the ended event', () => {
    const { Wrapper } = makeWrapper()
    const { container } = render(
      <Wrapper>
        <VideoPlayer src={SAMPLE_SRC} />
      </Wrapper>,
    )

    const video = container.querySelector('video') as HTMLVideoElement
    // Stub duration so the event reports something
    Object.defineProperty(video, 'duration', { value: 42.5, configurable: true })

    fireEvent.play(video)
    fireEvent.ended(video)

    const completedCall = captureSpy.mock.calls.find(
      ([event]) => event === 'help.video.completed',
    )
    expect(completedCall).toBeDefined()
    const [, props] = completedCall as [string, Record<string, unknown>]
    expect(props.src).toBe(SAMPLE_SRC)
    expect(typeof props.duration_ms).toBe('number')
    expect(props.duration_ms as number).toBeGreaterThanOrEqual(0)
  })

  it('includes surface_key in events when surfaceKey prop is provided', () => {
    mockFetch.mockResolvedValue(null)
    const { Wrapper } = makeWrapper()
    const { container } = render(
      <Wrapper>
        <VideoPlayer
          src={SAMPLE_SRC}
          surfaceKey="designer-portal/onboarding/first-project-walkthrough"
        />
      </Wrapper>,
    )

    const video = container.querySelector('video') as HTMLVideoElement
    fireEvent.play(video)

    expect(captureSpy).toHaveBeenCalledWith(
      'help.video.started',
      expect.objectContaining({
        surface_key: 'designer-portal/onboarding/first-project-walkthrough',
        src: SAMPLE_SRC,
      }),
    )
  })

  it('does not crash when window.posthog is undefined', () => {
    delete (window as unknown as { posthog?: unknown }).posthog

    const { Wrapper } = makeWrapper()
    expect(() =>
      render(
        <Wrapper>
          <VideoPlayer src={SAMPLE_SRC} />
        </Wrapper>,
      ),
    ).not.toThrow()
  })

  // ── 5. ariaLabel ────────────────────────────────────────────────────────────

  it('applies the default aria-label "Help video"', () => {
    const { Wrapper } = makeWrapper()
    const { container } = render(
      <Wrapper>
        <VideoPlayer src={SAMPLE_SRC} />
      </Wrapper>,
    )

    expect(container.querySelector('video')).toHaveAttribute(
      'aria-label',
      'Help video',
    )
  })

  it('applies a custom ariaLabel when provided', () => {
    const { Wrapper } = makeWrapper()
    const { container } = render(
      <Wrapper>
        <VideoPlayer src={SAMPLE_SRC} ariaLabel="Aesthete walkthrough" />
      </Wrapper>,
    )

    expect(container.querySelector('video')).toHaveAttribute(
      'aria-label',
      'Aesthete walkthrough',
    )
  })

  // ── 6. Aspect ratio class ───────────────────────────────────────────────────

  it('applies the 16:9 aspect ratio class by default', () => {
    const { Wrapper } = makeWrapper()
    const { container } = render(
      <Wrapper>
        <VideoPlayer src={SAMPLE_SRC} />
      </Wrapper>,
    )

    const frame = container.querySelector('[data-help-video-frame]')
    expect(frame).not.toBeNull()
    expect(frame?.className).toContain('aspect-video')
  })

  it('applies the 4:3 aspect ratio class when aspectRatio="4:3"', () => {
    const { Wrapper } = makeWrapper()
    const { container } = render(
      <Wrapper>
        <VideoPlayer src={SAMPLE_SRC} aspectRatio="4:3" />
      </Wrapper>,
    )

    const frame = container.querySelector('[data-help-video-frame]')
    expect(frame?.className).toMatch(/aspect-\[4\/3\]/)
  })

  it('applies the 1:1 aspect ratio class when aspectRatio="1:1"', () => {
    const { Wrapper } = makeWrapper()
    const { container } = render(
      <Wrapper>
        <VideoPlayer src={SAMPLE_SRC} aspectRatio="1:1" />
      </Wrapper>,
    )

    const frame = container.querySelector('[data-help-video-frame]')
    expect(frame?.className).toContain('aspect-square')
  })

  // ── 7. Poster ───────────────────────────────────────────────────────────────

  it('passes through the poster URL to the <video> element', () => {
    const { Wrapper } = makeWrapper()
    const { container } = render(
      <Wrapper>
        <VideoPlayer src={SAMPLE_SRC} poster={SAMPLE_POSTER} />
      </Wrapper>,
    )

    expect(container.querySelector('video')).toHaveAttribute('poster', SAMPLE_POSTER)
  })

  // ── 8. Surface key CMS lookup ───────────────────────────────────────────────

  it('resolves the video src from CMS when only surfaceKey is provided', async () => {
    mockFetch.mockResolvedValueOnce(videoFixture)

    const { Wrapper } = makeWrapper()
    const { container } = render(
      <Wrapper>
        <VideoPlayer surfaceKey="designer-portal/onboarding/first-project-walkthrough" />
      </Wrapper>,
    )

    await flushQueries()

    const video = container.querySelector('video')
    expect(video).not.toBeNull()
    expect(video?.getAttribute('src')).toBe(SAMPLE_SRC)
  })

  it('renders nothing (silent absence) when no src AND CMS returns null', async () => {
    mockFetch.mockResolvedValue(null)

    const { Wrapper } = makeWrapper()
    const { container } = render(
      <Wrapper>
        <VideoPlayer surfaceKey="designer-portal/onboarding/first-project-walkthrough" />
      </Wrapper>,
    )

    await flushQueries()

    expect(container.querySelector('video')).toBeNull()
  })

  it('prefers explicit src over CMS-fetched src when both are provided', async () => {
    mockFetch.mockResolvedValueOnce(videoFixture)

    const explicitSrc = 'https://cdn.example.com/explicit.mp4'
    const { Wrapper } = makeWrapper()
    const { container } = render(
      <Wrapper>
        <VideoPlayer
          src={explicitSrc}
          surfaceKey="designer-portal/onboarding/first-project-walkthrough"
        />
      </Wrapper>,
    )

    await flushQueries()

    expect(container.querySelector('video')?.getAttribute('src')).toBe(explicitSrc)
  })

  // ── 9. className passthrough ────────────────────────────────────────────────

  it('merges a custom className onto the outer container', () => {
    const { Wrapper } = makeWrapper()
    const { container } = render(
      <Wrapper>
        <VideoPlayer src={SAMPLE_SRC} className="custom-test-class" />
      </Wrapper>,
    )

    const root = container.firstChild as HTMLElement
    expect(root.className).toContain('custom-test-class')
  })
})
