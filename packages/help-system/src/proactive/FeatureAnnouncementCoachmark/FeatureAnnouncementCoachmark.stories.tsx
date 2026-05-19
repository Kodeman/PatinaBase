import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { FeatureAnnouncementCoachmark } from './FeatureAnnouncementCoachmark'
import {
  _clearAllFeatureAnnouncementState,
  setFeatureAnnouncementState,
} from './featureAnnouncementState'
import type { CoachmarkContent } from '../../contentTypes'

// ─── Mocking strategy ─────────────────────────────────────────────────────────
//
// `useHelpContent` is a thin TanStack-Query wrapper around a Sanity fetch. To
// keep stories self-contained without a live Sanity round-trip, each story
// pre-seeds the TanStack Query cache under the exact queryKey the hook reads:
//
//   ['help-content', surfaceKey, contentType, persona]
//
// The hook's `queryFn` is never called because the cache hit is fresh.
// Same pattern as LearnMore.stories / SectionIntro.stories.
// ──────────────────────────────────────────────────────────────────────────────

const STORY_SURFACE_KEY = 'designer-portal/pipeline/project-list'
const STORY_FEATURE_KEY = 'v2-batch-tagging'

const COACHMARK_FIXTURE: CoachmarkContent = {
  surfaceKey: STORY_SURFACE_KEY,
  persona: 'all',
  contentType: 'coachmark',
  heading: 'Batch tagging is here',
  body:
    'Select multiple products from the list and apply a tag in one move. ' +
    'Saves about thirty clicks a day on big projects.',
}

interface SeededClientArgs {
  /** Undefined → leave cache empty so the hook resolves null (CMS-miss). */
  seed?: CoachmarkContent | null
}

function makeClient({ seed }: SeededClientArgs): QueryClient {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity, gcTime: Infinity },
    },
  })
  client.setQueryData(
    ['help-content', STORY_SURFACE_KEY, 'coachmark', 'all'],
    seed ?? null,
  )
  return client
}

// ─── Visual shell ─────────────────────────────────────────────────────────────

function StoryShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        maxWidth: 640,
        padding: 32,
        minHeight: 240,
        fontFamily: 'var(--font-inter, Inter, system-ui, sans-serif)',
      }}
    >
      <h2
        style={{
          fontSize: '1.1rem',
          fontWeight: 600,
          marginBottom: 12,
          fontFamily: 'var(--font-playfair, ui-serif, Georgia, serif)',
        }}
      >
        Project pipeline
      </h2>
      <p
        style={{
          fontSize: '0.85rem',
          color: 'var(--ao, #6b6760)',
          marginBottom: 24,
          lineHeight: 1.5,
        }}
      >
        Drag cards between stages. New: select multiple cards to batch-tag.
      </p>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        {children}
      </div>
    </div>
  )
}

/**
 * Most stories share the same anchor button — a "Tag selected" CTA that the
 * coachmark spotlights. Wrapping it in a small helper keeps each story
 * focused on the scenario being demonstrated.
 */
function AnchorButton() {
  return (
    <button
      type="button"
      style={{
        padding: '0.5rem 0.875rem',
        borderRadius: 6,
        fontSize: '0.8rem',
        fontWeight: 500,
        background: 'var(--cl, #c4a57b)',
        color: 'var(--ow, #faf7f0)',
        border: 'none',
        cursor: 'pointer',
      }}
    >
      Tag selected
    </button>
  )
}

// ─── Meta ─────────────────────────────────────────────────────────────────────

const meta = {
  title: 'help-system/proactive/FeatureAnnouncementCoachmark',
  component: FeatureAnnouncementCoachmark,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Single one-shot coachmark on a newly shipped feature (spec §4.7). ' +
          'Uses Radix Popover under the hood; persistence is keyed by ' +
          '`featureKey` via localStorage. Once dismissed, the announcement ' +
          'never re-appears. Pulse animation respects `prefers-reduced-motion`. ' +
          'Fires `help.feature_announcement.shown` and `.dismissed` to ' +
          '`window.posthog` with snake_case property keys.',
      },
    },
  },
  argTypes: {
    featureKey: { control: 'text' },
    surfaceKey: { control: 'text' },
    shippedAt: { control: 'text' },
    pulse: { control: 'boolean' },
    fallbackTitle: { control: 'text' },
    fallbackBody: { control: 'text' },
    side: {
      control: { type: 'select' },
      options: ['top', 'right', 'bottom', 'left'],
    },
  },
} satisfies Meta<typeof FeatureAnnouncementCoachmark>

export default meta
type Story = StoryObj<typeof meta>

// ─── Stories ──────────────────────────────────────────────────────────────────

/**
 * Fresh — undismissed state. The coachmark renders on mount, the anchor
 * pulses, and clicking the X dismisses + persists.
 *
 * Note: clicking dismiss writes to localStorage. The next mount in this
 * Storybook session will show the AlreadyDismissed state. Use the "Reset"
 * story below to clear the persisted entry.
 */
export const Fresh: Story = {
  args: {
    featureKey: `${STORY_FEATURE_KEY}-fresh`,
    surfaceKey: STORY_SURFACE_KEY,
  },
  render: (args) => {
    // Always clear before the story renders so refreshes feel clean.
    _clearAllFeatureAnnouncementState()
    const client = makeClient({ seed: COACHMARK_FIXTURE })
    return (
      <QueryClientProvider client={client}>
        <StoryShell>
          <FeatureAnnouncementCoachmark {...args}>
            <AnchorButton />
          </FeatureAnnouncementCoachmark>
        </StoryShell>
      </QueryClientProvider>
    )
  },
}

/**
 * AlreadyDismissed — persisted state contains `dismissedAt`. The component
 * renders the anchor children unchanged but suppresses the popover + pulse.
 * No `shown` event is emitted. The sentinel wrapper makes the suppression
 * obvious at a glance.
 */
export const AlreadyDismissed: Story = {
  args: {
    featureKey: `${STORY_FEATURE_KEY}-dismissed`,
    surfaceKey: STORY_SURFACE_KEY,
  },
  render: (args) => {
    // Pre-seed persistence so the component mounts into the dismissed state.
    _clearAllFeatureAnnouncementState()
    setFeatureAnnouncementState(args.featureKey, {
      dismissedAt: '2026-04-01T12:00:00.000Z',
    })
    const client = makeClient({ seed: COACHMARK_FIXTURE })
    return (
      <QueryClientProvider client={client}>
        <StoryShell>
          <div
            style={{
              padding: 12,
              borderRadius: 6,
              border: '1px dashed var(--pe, #e7e1d4)',
              background: 'rgba(196,165,123,0.04)',
            }}
          >
            <div
              style={{
                fontSize: '0.7rem',
                color: 'var(--ao, #6b6760)',
                marginBottom: 8,
                fontStyle: 'italic',
              }}
            >
              Sentinel: localStorage has dismissedAt — the button below should
              render with no pulse and no popover.
            </div>
            <FeatureAnnouncementCoachmark {...args}>
              <AnchorButton />
            </FeatureAnnouncementCoachmark>
          </div>
        </StoryShell>
      </QueryClientProvider>
    )
  },
}

/**
 * WithShippedAt — feature shipped 14 days ago. The dismiss analytics will
 * carry `age_days: 14` so dashboards can correlate dismissal speed against
 * how old an announcement was when each user saw it.
 *
 * Inspect the browser console — the story wires `window.posthog.capture` to
 * `console.log` so the analytics payload is visible without a real PostHog
 * setup.
 */
export const WithShippedAt: Story = {
  args: {
    featureKey: `${STORY_FEATURE_KEY}-aged`,
    surfaceKey: STORY_SURFACE_KEY,
    shippedAt: new Date(Date.now() - 14 * 86_400_000).toISOString(),
  },
  decorators: [
    (StoryFn) => {
      _clearAllFeatureAnnouncementState()
      // Install a console-logging posthog stub for the lifetime of this story.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const win = window as any
      const original = win.posthog
      win.posthog = {
        capture: (event: string, props?: Record<string, unknown>) => {
          // eslint-disable-next-line no-console
          console.log('[posthog]', event, props)
        },
      }
      const Restore: React.FC<{ children: React.ReactNode }> = ({ children }) => {
        React.useEffect(() => () => {
          win.posthog = original
        }, [])
        return <>{children}</>
      }
      return (
        <Restore>
          <StoryFn />
        </Restore>
      )
    },
  ],
  render: (args) => {
    const client = makeClient({ seed: COACHMARK_FIXTURE })
    return (
      <QueryClientProvider client={client}>
        <StoryShell>
          <FeatureAnnouncementCoachmark {...args}>
            <AnchorButton />
          </FeatureAnnouncementCoachmark>
        </StoryShell>
      </QueryClientProvider>
    )
  },
}

/**
 * ReducedMotion — forces `prefers-reduced-motion: reduce`. The pulse ring is
 * disabled in JS (the `data-pulse` attribute reads "false") and the CSS
 * keyframes are gated by a `@media (prefers-reduced-motion: reduce)` rule as
 * a defence-in-depth second line.
 *
 * The mock patches `window.matchMedia` for the lifetime of the story so the
 * `usePrefersReducedMotion` hook sees `matches: true` for the reduce query.
 */
export const ReducedMotion: Story = {
  args: {
    featureKey: `${STORY_FEATURE_KEY}-reduced`,
    surfaceKey: STORY_SURFACE_KEY,
  },
  decorators: [
    (StoryFn) => {
      _clearAllFeatureAnnouncementState()
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
      const Restore: React.FC<{ children: React.ReactNode }> = ({ children }) => {
        React.useEffect(() => () => {
          window.matchMedia = original
        }, [])
        return <>{children}</>
      }
      return (
        <Restore>
          <StoryFn />
        </Restore>
      )
    },
  ],
  render: (args) => {
    const client = makeClient({ seed: COACHMARK_FIXTURE })
    return (
      <QueryClientProvider client={client}>
        <StoryShell>
          <FeatureAnnouncementCoachmark {...args}>
            <AnchorButton />
          </FeatureAnnouncementCoachmark>
        </StoryShell>
      </QueryClientProvider>
    )
  },
}

/**
 * NoContent — CMS returns null AND no fallback. The component renders the
 * children unchanged (no popover, no pulse, no shown event). This is the
 * "silent absence" behaviour from spec §13.4 — Sanity downtime or unwritten
 * content must never crash the UI.
 *
 * The sentinel wrapper makes the suppression visible for QA.
 */
export const NoContent: Story = {
  args: {
    featureKey: `${STORY_FEATURE_KEY}-empty`,
    surfaceKey: STORY_SURFACE_KEY,
  },
  render: (args) => {
    _clearAllFeatureAnnouncementState()
    const client = makeClient({ seed: null })
    return (
      <QueryClientProvider client={client}>
        <StoryShell>
          <div
            style={{
              padding: 12,
              borderRadius: 6,
              border: '1px dashed var(--pe, #e7e1d4)',
              background: 'rgba(196,165,123,0.04)',
            }}
          >
            <div
              style={{
                fontSize: '0.7rem',
                color: 'var(--ao, #6b6760)',
                marginBottom: 8,
                fontStyle: 'italic',
              }}
            >
              Sentinel: CMS returned null and no fallback was provided — the
              button below should appear with no pulse and no popover.
            </div>
            <FeatureAnnouncementCoachmark {...args}>
              <AnchorButton />
            </FeatureAnnouncementCoachmark>
          </div>
        </StoryShell>
      </QueryClientProvider>
    )
  },
}
