import type { Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { VideoPlayer } from './VideoPlayer'
import type { VideoContent } from '../../contentTypes'

// ─── Mocking strategy ─────────────────────────────────────────────────────────
//
// Direct-src stories don't need any Sanity round-trip — the component reads
// the prop directly. CMS-backed stories pre-seed the TanStack Query cache
// under the exact queryKey the hook reads:
//
//   ['help-content', surfaceKey, 'video', 'all']
//
// Same decorator pattern as the other help-system stories. No live network.
// ──────────────────────────────────────────────────────────────────────────────

const STORY_SURFACE_KEY = 'designer-portal/onboarding/first-project-walkthrough'

// "Big Buck Bunny" — Blender Foundation's public-domain test reel. Stable
// HTTPS URL hosted by Google sample-vods. Good enough for visual QA; in
// production the Sanity CDN URL replaces this.
const SAMPLE_SRC =
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4'

const SAMPLE_POSTER =
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/BigBuckBunny.jpg'

const SAMPLE_TRANSCRIPT = `Big Buck Bunny is a short computer-animated comedy film made by the Blender Institute, part of the Blender Foundation. Like the foundation's previous film Elephants Dream, the film was made using Blender, a free software application for animation made by the same foundation. It was released as an open-source film under Creative Commons License Attribution 3.0. In this Patina context, the transcript stands in for the spoken-and-on-screen content of a help walkthrough — designers who can't or don't want to play audio can read along instead.`

interface SeededClientArgs {
  seed?: VideoContent | null
}

function makeClient({ seed }: SeededClientArgs): QueryClient {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Infinity,
      },
    },
  })
  client.setQueryData(
    ['help-content', STORY_SURFACE_KEY, 'video', 'all'],
    seed ?? null,
  )
  return client
}

const meta: Meta<typeof VideoPlayer> = {
  title: 'help-system/reference/VideoPlayer',
  component: VideoPlayer,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Reference-layer video walkthrough player (spec §4 Layer 4). ' +
          'Wraps an HTML5 <video> with native controls, optional captions track, ' +
          'optional transcript reveal, and an aspect-ratio-locked frame. ' +
          'Source can be passed directly via `src` or resolved from Sanity via `surfaceKey`. ' +
          'Autoplay is intentionally NOT exposed — reduced-motion safety per task contract. ' +
          'Spec §16 open question (Sanity CDN vs Mux vs YouTube) remains deferred — the ' +
          'component treats `src` as an opaque URL.',
      },
    },
  },
  argTypes: {
    src: { control: 'text' },
    surfaceKey: { control: 'text' },
    poster: { control: 'text' },
    captionsUrl: { control: 'text' },
    aspectRatio: {
      control: 'inline-radio',
      options: ['16:9', '4:3', '1:1'],
    },
    ariaLabel: { control: 'text' },
    className: { control: 'text' },
  },
}

export default meta
type Story = StoryObj<typeof VideoPlayer>

// ─── Stories ──────────────────────────────────────────────────────────────────

/**
 * Default — direct `src` prop, no captions, no transcript. The bare minimum
 * playback surface. Use when the only thing the user needs is the video.
 */
export const Default: Story = {
  args: {
    src: SAMPLE_SRC,
    poster: SAMPLE_POSTER,
    aspectRatio: '16:9',
  },
  decorators: [
    (StoryFn) => (
      <QueryClientProvider client={makeClient({ seed: null })}>
        <div style={{ maxWidth: 640 }}>
          <StoryFn />
        </div>
      </QueryClientProvider>
    ),
  ],
}

/**
 * WithCaptions — a `.vtt` track is attached. Browsers expose a CC toggle in
 * their native controls; the track is set to `default` so captions display
 * the moment playback begins (a11y best practice).
 *
 * Note: this story uses a placeholder captions URL — the file does not exist
 * in this repo. Visual QA confirms the <track> element renders; activating
 * the CC button will be a no-op until a real VTT is provided.
 */
export const WithCaptions: Story = {
  args: {
    src: SAMPLE_SRC,
    poster: SAMPLE_POSTER,
    captionsUrl: 'https://example.com/captions/big-buck-bunny-en.vtt',
    aspectRatio: '16:9',
  },
  decorators: [
    (StoryFn) => (
      <QueryClientProvider client={makeClient({ seed: null })}>
        <div style={{ maxWidth: 640 }}>
          <StoryFn />
        </div>
      </QueryClientProvider>
    ),
  ],
}

/**
 * WithTranscript — the player exposes a "Show transcript" toggle below the
 * frame. Transcripts complement captions: captions stay in sync with the
 * playhead, transcripts let users scan or jump.
 */
export const WithTranscript: Story = {
  args: {
    src: SAMPLE_SRC,
    poster: SAMPLE_POSTER,
    transcript: SAMPLE_TRANSCRIPT,
    aspectRatio: '16:9',
  },
  decorators: [
    (StoryFn) => (
      <QueryClientProvider client={makeClient({ seed: null })}>
        <div style={{ maxWidth: 640 }}>
          <StoryFn />
        </div>
      </QueryClientProvider>
    ),
  ],
}

/**
 * FromCMS — all values resolved by surfaceKey via the seeded TanStack Query
 * cache. Mirrors the real production wiring where Sanity owns the URLs.
 */
export const FromCMS: Story = {
  args: {
    surfaceKey: STORY_SURFACE_KEY,
    aspectRatio: '16:9',
  },
  decorators: [
    (StoryFn) => (
      <QueryClientProvider
        client={makeClient({
          seed: {
            surfaceKey: STORY_SURFACE_KEY,
            persona: 'all',
            contentType: 'video',
            src: SAMPLE_SRC,
            posterUrl: SAMPLE_POSTER,
            transcript: SAMPLE_TRANSCRIPT,
            title: 'First Project Walkthrough',
          },
        })}
      >
        <div style={{ maxWidth: 640 }}>
          <StoryFn />
        </div>
      </QueryClientProvider>
    ),
  ],
}

/**
 * DifferentAspectRatios — visually compare the three supported framings.
 * 16:9 is the default for walkthroughs; 4:3 is reserved for older recordings;
 * 1:1 for short social-style clips embedded inside HelpArticle bodies.
 */
export const DifferentAspectRatios: Story = {
  render: () => (
    <QueryClientProvider client={makeClient({ seed: null })}>
      <div style={{ display: 'grid', gap: 32, maxWidth: 720 }}>
        <div>
          <h3 style={{ marginBottom: 8, fontFamily: 'system-ui', fontSize: '0.85rem' }}>
            16:9 (default — walkthroughs)
          </h3>
          <VideoPlayer src={SAMPLE_SRC} poster={SAMPLE_POSTER} aspectRatio="16:9" />
        </div>
        <div>
          <h3 style={{ marginBottom: 8, fontFamily: 'system-ui', fontSize: '0.85rem' }}>
            4:3 (legacy recordings)
          </h3>
          <VideoPlayer src={SAMPLE_SRC} poster={SAMPLE_POSTER} aspectRatio="4:3" />
        </div>
        <div>
          <h3 style={{ marginBottom: 8, fontFamily: 'system-ui', fontSize: '0.85rem' }}>
            1:1 (inline article clip)
          </h3>
          <div style={{ maxWidth: 360 }}>
            <VideoPlayer src={SAMPLE_SRC} poster={SAMPLE_POSTER} aspectRatio="1:1" />
          </div>
        </div>
      </div>
    </QueryClientProvider>
  ),
}

/**
 * NoSource — silent absence. Spec §13.4: when neither a direct src nor a CMS
 * resolution succeeds, the component renders nothing. The surrounding shell
 * (an article, a panel, a card) must tolerate that.
 */
export const NoSource: Story = {
  args: {
    surfaceKey: STORY_SURFACE_KEY,
  },
  decorators: [
    (StoryFn) => (
      <QueryClientProvider client={makeClient({ seed: null })}>
        <div
          style={{
            padding: 16,
            border: '1px dashed var(--pe, #e7e1d4)',
            borderRadius: 4,
            background: 'rgba(196,165,123,0.04)',
            color: 'var(--ao, #6b6760)',
            fontFamily: 'system-ui, sans-serif',
            fontSize: '0.75rem',
            maxWidth: 480,
          }}
        >
          <p style={{ margin: '0 0 12px 0', fontStyle: 'italic', opacity: 0.7 }}>
            Sentinel: VideoPlayer renders nothing below (silent absence per §13.4).
          </p>
          <StoryFn />
        </div>
      </QueryClientProvider>
    ),
  ],
}
