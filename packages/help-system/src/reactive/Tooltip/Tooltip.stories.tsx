import type { Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Tooltip } from './Tooltip'
import type { TooltipContent } from '../../contentTypes'

// ─── Mocking strategy ─────────────────────────────────────────────────────────
//
// Like the Ambient stories, each story pre-seeds the TanStack Query cache
// under the exact queryKey `useHelpContent` reads:
//
//   ['help-content', surfaceKey, 'tooltip', persona]
//
// No live Sanity round-trip in Storybook. Identical pattern portals use in
// their app shells.
// ──────────────────────────────────────────────────────────────────────────────

const STORY_SURFACE_KEY = 'designer-portal/aesthete/score-meaning'

interface SeededClientArgs {
  /** If undefined → seed null so the hook resolves to no content. */
  seed?: TooltipContent | null
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
    ['help-content', STORY_SURFACE_KEY, 'tooltip', 'all'],
    seed ?? null,
  )
  return client
}

// Demo trigger — a small "?" button that resembles <InfoIcon /> visually.
function DemoTrigger() {
  return (
    <button
      type="button"
      aria-label="More information"
      style={{
        width: 18,
        height: 18,
        borderRadius: '50%',
        border: '1px solid var(--pe, #e7e1d4)',
        background: 'transparent',
        color: 'var(--ao, #6b6760)',
        cursor: 'pointer',
        fontFamily: 'var(--font-inter, Inter, sans-serif)',
        fontSize: '0.7rem',
        lineHeight: 1,
        padding: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      ?
    </button>
  )
}

const meta: Meta<typeof Tooltip> = {
  title: 'help-system/reactive/Tooltip',
  component: Tooltip,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Reactive-layer hover/focus tooltip (spec §4.1). Wraps a trigger child ' +
          'with a Radix Tooltip primitive; pulls body copy from Sanity by surfaceKey. ' +
          'Portal-renders to escape overflow:hidden parents; honors prefers-reduced-motion ' +
          'via the design-system motion-safe utilities.',
      },
    },
  },
  argTypes: {
    surfaceKey: { control: 'text' },
    side: {
      control: 'inline-radio',
      options: ['top', 'right', 'bottom', 'left'],
    },
    align: {
      control: 'inline-radio',
      options: ['start', 'center', 'end'],
    },
    delayMs: { control: { type: 'number', min: 0, max: 2000, step: 50 } },
    fallback: { control: 'text' },
  },
}

export default meta
type Story = StoryObj<typeof Tooltip>

// ─── Stories ──────────────────────────────────────────────────────────────────

/**
 * CMS hit — Sanity returns body content; tooltip opens on hover or focus.
 */
export const Default: Story = {
  args: {
    surfaceKey: STORY_SURFACE_KEY,
    side: 'top',
    align: 'center',
    delayMs: 200,
    children: <DemoTrigger />,
  },
  decorators: [
    (StoryFn) => (
      <QueryClientProvider
        client={makeClient({
          seed: {
            surfaceKey: STORY_SURFACE_KEY,
            persona: 'all',
            contentType: 'tooltip',
            body: 'A snapshot of how cohesive the room reads from a single viewpoint.',
          },
        })}
      >
        <div style={{ padding: 80 }}>
          <StoryFn />
        </div>
      </QueryClientProvider>
    ),
  ],
}

/**
 * Sanity returns null + fallback string → tooltip opens with the fallback body.
 * Recommended pattern during the migration phase.
 */
export const WithFallback: Story = {
  args: {
    surfaceKey: STORY_SURFACE_KEY,
    side: 'top',
    align: 'center',
    delayMs: 200,
    fallback: 'Score blends material harmony, color balance, and proportion.',
    children: <DemoTrigger />,
  },
  decorators: [
    (StoryFn) => (
      <QueryClientProvider client={makeClient({ seed: null })}>
        <div style={{ padding: 80 }}>
          <StoryFn />
        </div>
      </QueryClientProvider>
    ),
  ],
}

/**
 * Sanity returns null and no fallback → trigger renders WITHOUT tooltip wrapper.
 * Silent degradation per spec §13.4 — hover does nothing.
 */
export const NoContent: Story = {
  args: {
    surfaceKey: STORY_SURFACE_KEY,
    children: <DemoTrigger />,
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
            fontFamily: 'var(--font-inter, Inter, sans-serif)',
            fontSize: '0.75rem',
            maxWidth: 360,
          }}
        >
          <p style={{ margin: '0 0 12px 0', fontStyle: 'italic', opacity: 0.7 }}>
            Sentinel: the trigger below renders raw (no tooltip on hover).
          </p>
          <StoryFn />
        </div>
      </QueryClientProvider>
    ),
  ],
}

/**
 * Long body — exceeds 160-char cap. Devs will see a console.warn; visible
 * content is unaltered (cap is advisory).
 */
export const LongBody: Story = {
  args: {
    surfaceKey: STORY_SURFACE_KEY,
    side: 'top',
    align: 'center',
    delayMs: 200,
    children: <DemoTrigger />,
  },
  decorators: [
    (StoryFn) => (
      <QueryClientProvider
        client={makeClient({
          seed: {
            surfaceKey: STORY_SURFACE_KEY,
            persona: 'all',
            contentType: 'tooltip',
            body:
              'This tooltip body intentionally exceeds the 160-char authoring cap so ' +
              'storybook reviewers can see the dev warning surface in the console and ' +
              'verify that the visible layout still renders without truncation.',
          },
        })}
      >
        <div style={{ padding: 80 }}>
          <StoryFn />
        </div>
      </QueryClientProvider>
    ),
  ],
}

/**
 * Reduced motion — when `prefers-reduced-motion: reduce` is set in the OS,
 * the `motion-safe:` Tailwind utilities skip the fade/zoom animations. Toggle
 * the OS preference (or DevTools rendering > emulate reduced motion) to view.
 */
export const ReducedMotion: Story = {
  args: {
    surfaceKey: STORY_SURFACE_KEY,
    side: 'top',
    align: 'center',
    delayMs: 200,
    children: <DemoTrigger />,
  },
  decorators: [
    (StoryFn) => (
      <QueryClientProvider
        client={makeClient({
          seed: {
            surfaceKey: STORY_SURFACE_KEY,
            persona: 'all',
            contentType: 'tooltip',
            eyebrow: 'What this means',
            body: 'No fade animation when reduced motion is enabled — the tooltip simply appears.',
          },
        })}
      >
        <div style={{ padding: 80 }}>
          <p
            style={{
              fontFamily: 'var(--font-inter, Inter, sans-serif)',
              fontSize: '0.75rem',
              color: 'var(--ao, #6b6760)',
              marginBottom: 16,
              maxWidth: 320,
            }}
          >
            Enable <strong>prefers-reduced-motion: reduce</strong> in DevTools
            (Rendering tab) to verify the fade animation is suppressed.
          </p>
          <StoryFn />
        </div>
      </QueryClientProvider>
    ),
  ],
}
