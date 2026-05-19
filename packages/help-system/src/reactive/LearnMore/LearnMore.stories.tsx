import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LearnMore } from './LearnMore'
import type { LearnMoreContent } from '../../contentTypes'

// ─── Mocking strategy ─────────────────────────────────────────────────────────
//
// `useHelpContent` is a thin TanStack-Query wrapper around a Sanity fetch. To
// keep stories self-contained without a live Sanity round-trip, each story
// pre-seeds the TanStack Query cache under the exact queryKey the hook reads:
//
//   ['help-content', surfaceKey, contentType, persona]
//
// The hook's `queryFn` is never called because the cache hit is fresh.
//
// Identical pattern to FieldHelper.stories / SectionIntro.stories.
// ──────────────────────────────────────────────────────────────────────────────

const STORY_SURFACE_KEY = 'designer-portal/pipeline/project-list'
const STORY_BODY =
  'The pipeline shows every project from first lead through final install. ' +
  'Drag a card to move it; the stage colors map to the swatches in Settings.'

interface SeededClientArgs {
  /** Undefined → leave cache empty so the hook resolves null (CMS-miss). */
  seed?: LearnMoreContent | null
}

function makeClient({ seed }: SeededClientArgs): QueryClient {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity, gcTime: Infinity },
    },
  })

  // Pre-seed the cache under the exact queryKey shape used by useHelpContent.
  // persona defaults to 'all' inside the hook; contentType for this component
  // is the dedicated 'learnMore' shape from contentTypes.ts.
  client.setQueryData(
    ['help-content', STORY_SURFACE_KEY, 'learnMore', 'all'],
    seed ?? null,
  )
  return client
}

/** Visual scaffolding — places the disclosure beneath a typical surface. */
function StoryShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        maxWidth: 560,
        padding: 24,
        fontFamily: 'var(--font-inter, Inter, system-ui, sans-serif)',
      }}
    >
      <h2
        style={{
          fontSize: '1rem',
          fontWeight: 600,
          marginBottom: 4,
          fontFamily: 'var(--font-playfair, ui-serif, Georgia, serif)',
        }}
      >
        Project pipeline
      </h2>
      <p
        style={{
          fontSize: '0.85rem',
          color: 'var(--ao, #6b6760)',
          marginBottom: 12,
          lineHeight: 1.5,
        }}
      >
        Drag cards between stages to move projects forward.
      </p>
      {children}
    </div>
  )
}

// ─── Meta ─────────────────────────────────────────────────────────────────────

const meta = {
  title: 'help-system/reactive/LearnMore',
  component: LearnMore,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Inline "Learn more" disclosure (spec §4.5). Built on Radix UI Collapsible. ' +
          'Content is CMS-backed via `useHelpContent(surfaceKey, "learnMore")`. ' +
          'Respects `prefers-reduced-motion`. Fires `help.learnmore.expanded` and ' +
          '`help.learnmore.collapsed` (with `duration_ms`) to `window.posthog`.',
      },
    },
  },
  argTypes: {
    surfaceKey: { control: 'text' },
    label: { control: 'text' },
    fallback: { control: 'text' },
    defaultOpen: { control: 'boolean' },
    className: { control: 'text' },
  },
} satisfies Meta<typeof LearnMore>

export default meta
type Story = StoryObj<typeof meta>

// ─── Stories ──────────────────────────────────────────────────────────────────

/**
 * Default — CMS returns a body string. The trigger renders collapsed and
 * opens on click. Try keyboard navigation (Tab → Enter / Space).
 */
export const Default: Story = {
  args: {
    surfaceKey: STORY_SURFACE_KEY,
  },
  render: (args) => {
    const client = makeClient({
      seed: {
        surfaceKey: STORY_SURFACE_KEY,
        persona: 'all',
        contentType: 'learnMore',
        body: STORY_BODY,
      },
    })
    return (
      <QueryClientProvider client={client}>
        <StoryShell>
          <LearnMore {...args} />
        </StoryShell>
      </QueryClientProvider>
    )
  },
}

/**
 * OpenByDefault — `defaultOpen` starts the disclosure expanded. Useful for
 * surfaces where the underlying concept is dense enough that hiding it would
 * cost more clicks than it saves.
 */
export const OpenByDefault: Story = {
  args: {
    surfaceKey: STORY_SURFACE_KEY,
    defaultOpen: true,
  },
  render: (args) => {
    const client = makeClient({
      seed: {
        surfaceKey: STORY_SURFACE_KEY,
        persona: 'all',
        contentType: 'learnMore',
        body: STORY_BODY,
      },
    })
    return (
      <QueryClientProvider client={client}>
        <StoryShell>
          <LearnMore {...args} />
        </StoryShell>
      </QueryClientProvider>
    )
  },
}

/**
 * WithFallback — CMS returns null (no document yet) but a `fallback` was
 * provided. The component still renders the disclosure with the fallback text
 * inside the panel. Recommended during the content-writing phase so the
 * surface never looks unfinished.
 */
export const WithFallback: Story = {
  args: {
    surfaceKey: STORY_SURFACE_KEY,
    fallback:
      'Pipeline stages flow left to right. Each stage maps to a billing milestone.',
  },
  render: (args) => {
    const client = makeClient({ seed: null })
    return (
      <QueryClientProvider client={client}>
        <StoryShell>
          <LearnMore {...args} />
        </StoryShell>
      </QueryClientProvider>
    )
  },
}

/**
 * NoContent — CMS returns null AND no fallback. Per spec §13.4 the component
 * renders absolutely nothing (silent absence). The wrapper makes the empty
 * render visible for sanity checking.
 */
export const NoContent: Story = {
  args: {
    surfaceKey: STORY_SURFACE_KEY,
  },
  render: (args) => {
    const client = makeClient({ seed: null })
    return (
      <QueryClientProvider client={client}>
        <StoryShell>
          <div
            style={{
              border: '1px dashed var(--pe, #e7e1d4)',
              borderRadius: 4,
              padding: 16,
              background: 'rgba(196,165,123,0.04)',
              color: 'var(--ao, #6b6760)',
              fontSize: '0.75rem',
            }}
          >
            <p style={{ margin: 0, fontStyle: 'italic', opacity: 0.7 }}>
              Sentinel: the rendered LearnMore below should be invisible (null).
            </p>
            <div style={{ marginTop: 8 }}>
              <LearnMore {...args} />
            </div>
          </div>
        </StoryShell>
      </QueryClientProvider>
    )
  },
}

/**
 * CustomLabel — Override the default "Learn more" text. Pair with copy that
 * frames a question the user is plausibly asking ("Why does this matter?",
 * "What changed?", "How are stages calculated?").
 */
export const CustomLabel: Story = {
  args: {
    surfaceKey: STORY_SURFACE_KEY,
    label: 'How are stages calculated?',
  },
  render: (args) => {
    const client = makeClient({
      seed: {
        surfaceKey: STORY_SURFACE_KEY,
        persona: 'all',
        contentType: 'learnMore',
        body:
          'Stages advance automatically when their gate criteria are met — e.g. ' +
          'Design Review → Production once the final BOM is approved.',
      },
    })
    return (
      <QueryClientProvider client={client}>
        <StoryShell>
          <LearnMore {...args} />
        </StoryShell>
      </QueryClientProvider>
    )
  },
}

/**
 * ReducedMotion — Forces `prefers-reduced-motion: reduce`. Open/close should
 * snap rather than animate the height. The chevron rotates instantly too.
 *
 * The mock patches `window.matchMedia` for the lifetime of the story so the
 * `usePrefersReducedMotion` hook sees `matches: true`.
 */
export const ReducedMotion: Story = {
  args: {
    surfaceKey: STORY_SURFACE_KEY,
  },
  decorators: [
    (StoryFn) => {
      // Patch matchMedia BEFORE rendering so the hook captures the reduced
      // preference on its first effect run.
      const original = window.matchMedia
      window.matchMedia = (query: string) =>
        ({
          matches: query.includes('reduce'),
          media: query,
          onchange: null,
          addListener: () => undefined,
          removeListener: () => undefined,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
          dispatchEvent: () => false,
        }) as MediaQueryList

      // Restore on unmount via a tiny wrapper component.
      const Restore: React.FC<{ children: React.ReactNode }> = ({ children }) => {
        React.useEffect(() => () => {
          window.matchMedia = original
        }, [])
        return <>{children}</>
      }

      return <Restore><StoryFn /></Restore>
    },
  ],
  render: (args) => {
    const client = makeClient({
      seed: {
        surfaceKey: STORY_SURFACE_KEY,
        persona: 'all',
        contentType: 'learnMore',
        body:
          'Animations have been disabled for this story to simulate a user with ' +
          '`prefers-reduced-motion: reduce` enabled.',
      },
    })
    return (
      <QueryClientProvider client={client}>
        <StoryShell>
          <LearnMore {...args} />
        </StoryShell>
      </QueryClientProvider>
    )
  },
}
