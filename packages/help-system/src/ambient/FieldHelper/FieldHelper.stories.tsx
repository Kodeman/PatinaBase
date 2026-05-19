import type { Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { FieldHelper } from './FieldHelper'
import type { FieldHelperContent } from '../../contentTypes'

// ─── Mocking strategy ─────────────────────────────────────────────────────────
//
// `useHelpContent` is a thin TanStack-Query wrapper around a Sanity fetch. To
// avoid a live Sanity round-trip in Storybook, each story pre-seeds the
// TanStack Query cache with a fixture under the exact queryKey the hook reads:
//
//   ['help-content', surfaceKey, contentType, persona]
//
// The hook's `queryFn` is never called because the cache hit is fresh.
//
// This is the canonical "decorator" pattern (no MSW needed); identical to how
// portals will mount the provider in their app shells.
// ──────────────────────────────────────────────────────────────────────────────

const STORY_SURFACE_KEY = 'designer-portal/today/dashboard'

interface SeededClientArgs {
  /** If undefined → leave cache empty so the hook resolves null (CMS-miss). */
  seed?: FieldHelperContent | null
  /** Stall the query indefinitely so loading-state stories work. */
  stallForever?: boolean
}

function makeClient({ seed, stallForever }: SeededClientArgs): QueryClient {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        // Long stale time so the seeded data is treated as fresh.
        staleTime: Infinity,
      },
    },
  })

  if (stallForever) {
    // Override the default queryFn so any useQuery call hangs.
    client.setDefaultOptions({
      queries: {
        retry: false,
        staleTime: Infinity,
        queryFn: () => new Promise(() => undefined),
      },
    })
    return client
  }

  // Pre-seed the cache under the exact queryKey shape used by useHelpContent.
  // persona defaults to 'all' inside the hook.
  client.setQueryData(
    ['help-content', STORY_SURFACE_KEY, 'fieldHelper', 'all'],
    seed ?? null,
  )
  return client
}

const meta: Meta<typeof FieldHelper> = {
  title: 'help-system/ambient/FieldHelper',
  component: FieldHelper,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Ambient-layer microcopy (spec §4.4) that anticipates user questions on form fields. ' +
          'Content is CMS-backed; the component renders an inline `fallback` if Sanity returns nothing, ' +
          'and renders nothing if neither is available — silent absence by design.',
      },
    },
  },
  argTypes: {
    surfaceKey: { control: 'text' },
    fallback: { control: 'text' },
    className: { control: 'text' },
  },
}

export default meta
type Story = StoryObj<typeof FieldHelper>

// ─── Stories ──────────────────────────────────────────────────────────────────

/**
 * Sanity returns content → render the CMS body.
 */
export const Default: Story = {
  args: {
    surfaceKey: STORY_SURFACE_KEY,
  },
  decorators: [
    (StoryFn) => (
      <QueryClientProvider
        client={makeClient({
          seed: {
            surfaceKey: STORY_SURFACE_KEY,
            persona: 'all',
            contentType: 'fieldHelper',
            body: 'Visible to client. Use clear, descriptive language.',
          },
        })}
      >
        <div className="max-w-md">
          <label
            htmlFor="story-field"
            style={{
              fontFamily: 'var(--font-dm-mono, ui-monospace, monospace)',
              fontSize: '0.5rem',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--ao, #6b6760)',
              display: 'block',
              marginBottom: 6,
            }}
          >
            Project name
          </label>
          <input
            id="story-field"
            type="text"
            placeholder="Chen Residence — Living & Dining"
            style={{
              width: '100%',
              padding: '8px 10px',
              border: '1px solid var(--pe, #e7e1d4)',
              borderRadius: 4,
              fontFamily: 'var(--font-inter, Inter, sans-serif)',
              fontSize: '0.85rem',
              marginBottom: 6,
            }}
          />
          <StoryFn />
        </div>
      </QueryClientProvider>
    ),
  ],
}

/**
 * Sanity returns null + `fallback` prop given → render the fallback.
 *
 * This is the recommended pattern during the migration phase: ship the
 * component with sensible inline copy as the fallback, then move final copy
 * into Sanity once Leah has reviewed it.
 */
export const WithFallback: Story = {
  args: {
    surfaceKey: STORY_SURFACE_KEY,
    fallback: 'Required to send the kickoff invoice.',
  },
  decorators: [
    (StoryFn) => (
      <QueryClientProvider client={makeClient({ seed: null })}>
        <StoryFn />
      </QueryClientProvider>
    ),
  ],
}

/**
 * Sanity returns null + no fallback → silent absence.
 *
 * Graceful Sanity-downtime fallback (spec §13.4). The component renders
 * `null`; the surrounding form keeps working. The story wraps the (invisible)
 * component in a sentinel so the empty render is obvious.
 */
export const EmptyNoFallback: Story = {
  args: {
    surfaceKey: STORY_SURFACE_KEY,
  },
  decorators: [
    (StoryFn) => (
      <QueryClientProvider client={makeClient({ seed: null })}>
        <div
          style={{
            border: '1px dashed var(--pe, #e7e1d4)',
            borderRadius: 4,
            padding: 16,
            background: 'rgba(196,165,123,0.04)',
            color: 'var(--ao, #6b6760)',
            fontFamily: 'var(--font-inter, Inter, sans-serif)',
            fontSize: '0.75rem',
          }}
        >
          <p style={{ margin: 0, fontStyle: 'italic', opacity: 0.7 }}>
            Sentinel: the rendered FieldHelper below should be invisible (null).
          </p>
          <div style={{ marginTop: 8 }}>
            <StoryFn />
          </div>
        </div>
      </QueryClientProvider>
    ),
  ],
}

/**
 * Loading skeleton — query is pending. The component intentionally renders
 * nothing during load (no fallback flash). Story makes that observable by
 * stalling the query forever.
 */
export const LoadingSkeleton: Story = {
  args: {
    surfaceKey: STORY_SURFACE_KEY,
    fallback: 'This fallback should NOT appear while loading.',
  },
  decorators: [
    (StoryFn) => (
      <QueryClientProvider client={makeClient({ stallForever: true })}>
        <div
          style={{
            border: '1px dashed var(--pe, #e7e1d4)',
            borderRadius: 4,
            padding: 16,
            background: 'rgba(196,165,123,0.04)',
            color: 'var(--ao, #6b6760)',
            fontFamily: 'var(--font-inter, Inter, sans-serif)',
            fontSize: '0.75rem',
          }}
        >
          <p style={{ margin: 0, fontStyle: 'italic', opacity: 0.7 }}>
            Sentinel: query stalled — FieldHelper renders nothing (no fallback
            flash).
          </p>
          <div style={{ marginTop: 8 }}>
            <StoryFn />
          </div>
        </div>
      </QueryClientProvider>
    ),
  ],
}

/**
 * Custom className demo — merges with the design-system text classes.
 */
export const CustomClassName: Story = {
  args: {
    surfaceKey: STORY_SURFACE_KEY,
    className: 'italic text-foreground/80',
  },
  decorators: [
    (StoryFn) => (
      <QueryClientProvider
        client={makeClient({
          seed: {
            surfaceKey: STORY_SURFACE_KEY,
            persona: 'all',
            contentType: 'fieldHelper',
            body: 'Try "Chen Residence — Living & Dining" to keep search clean.',
          },
        })}
      >
        <StoryFn />
      </QueryClientProvider>
    ),
  ],
}
