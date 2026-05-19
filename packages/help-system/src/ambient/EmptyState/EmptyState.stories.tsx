import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { EmptyState } from './EmptyState'

// ─── Hooks-mock: bypass the real Sanity client in Storybook ───────────────────
//
// Storybook doesn't run inside vitest, so we can't use vi.mock here. Instead we
// monkey-patch the underlying Sanity client module before each story renders by
// stubbing fetch via a fake client at runtime.
//
// We accomplish this with a thin <MockProvider /> wrapper that overrides the
// query cache for a single surface key.

import * as useHelpContentModule from '../../hooks/useHelpContent'
import type { EmptyStateContent } from '../../contentTypes'
import type { UseQueryResult } from '@tanstack/react-query'

type HookReturn = UseQueryResult<EmptyStateContent | null>

function makeQueryResult(over: Partial<HookReturn>): HookReturn {
  return {
    data: null,
    error: null,
    isLoading: false,
    isError: false,
    isPending: false,
    isSuccess: true,
    isFetching: false,
    isFetched: true,
    isFetchedAfterMount: true,
    isLoadingError: false,
    isPlaceholderData: false,
    isPaused: false,
    isRefetchError: false,
    isStale: false,
    isInitialLoading: false,
    isRefetching: false,
    status: 'success',
    fetchStatus: 'idle',
    dataUpdatedAt: Date.now(),
    errorUpdatedAt: 0,
    failureCount: 0,
    failureReason: null,
    errorUpdateCount: 0,
    refetch: (async () => makeQueryResult(over)) as unknown as HookReturn['refetch'],
    promise: Promise.resolve(over.data ?? null) as unknown as HookReturn['promise'],
    ...over,
  } as HookReturn
}

function withMockedHelpContent(
  result: HookReturn,
  children: React.ReactNode,
): React.ReactElement {
  // Patch the named export at module level for the duration of the story.
  // (Storybook re-renders preserve module identity, so this remains in effect.)
  const original = useHelpContentModule.useHelpContent
  ;(useHelpContentModule as { useHelpContent: typeof original }).useHelpContent = (() =>
    result) as typeof original
  // Restore after the story tree unmounts.
  React.useEffect(
    () => () => {
      ;(useHelpContentModule as { useHelpContent: typeof original }).useHelpContent = original
    },
    [],
  )
  return <>{children}</>
}

// ─── Storybook meta ───────────────────────────────────────────────────────────

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, gcTime: 0 } },
})

const meta = {
  title: 'help-system/Ambient/EmptyState',
  component: EmptyState,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Layer 1 (Ambient) wrapper around the design-system EmptyState primitive. ' +
          'Fetches content from Sanity by surfaceKey and renders the underlying primitive. ' +
          'Falls back to a generic heading when Sanity is offline (spec §4.3 + §13.4).',
      },
    },
  },
  decorators: [
    (Story) => (
      <QueryClientProvider client={queryClient}>
        <div style={{ width: 560, padding: 24 }}>
          <Story />
        </div>
      </QueryClientProvider>
    ),
  ],
} satisfies Meta<typeof EmptyState>

export default meta
type Story = StoryObj<typeof meta>

// ─── Stories ──────────────────────────────────────────────────────────────────

const SAMPLE_CONTENT: EmptyStateContent = {
  surfaceKey: 'designer-portal/pipeline/project-list',
  persona: 'all',
  contentType: 'emptyState',
  icon: 'inbox',
  heading: 'Your projects live here',
  description:
    'Leads come in from the consumer app. You review, accept, write a proposal, and convert it to an active project — all from this view.',
  primaryActionLabel: '+ Create a test project',
}

const TYPOGRAPHIC_CONTENT: EmptyStateContent = {
  surfaceKey: 'designer-portal/today/dashboard',
  persona: 'all',
  contentType: 'emptyState',
  icon: '◇',
  heading: 'A quiet kind of day',
  description:
    'You have no items scheduled. Use this space to plan deeply, or browse the Aesthete Engine for inspiration.',
  primaryActionLabel: 'Browse inspiration',
}

export const WithContent: Story = {
  name: 'With content (icon name + CTA)',
  render: () =>
    withMockedHelpContent(
      makeQueryResult({ data: SAMPLE_CONTENT }),
      <EmptyState
        surfaceKey="designer-portal/pipeline/project-list"
        onAction={() => console.log('CTA clicked')}
      />,
    ),
}

export const WithTypographicIcon: Story = {
  name: 'With typographic glyph icon (spec §4.3 visual)',
  render: () =>
    withMockedHelpContent(
      makeQueryResult({ data: TYPOGRAPHIC_CONTENT }),
      <EmptyState
        surfaceKey="designer-portal/today/dashboard"
        onAction={() => console.log('Browse inspiration clicked')}
      />,
    ),
}

export const NoContentSanityDown: Story = {
  name: 'Sanity down — falls back to generic heading',
  render: () =>
    withMockedHelpContent(
      makeQueryResult({
        data: null,
        isError: true,
        isSuccess: false,
        status: 'error',
        error: new Error('Sanity unreachable'),
      }),
      <EmptyState surfaceKey="designer-portal/pipeline/project-list" />,
    ),
}

export const NoContentEmpty: Story = {
  name: 'No document, no error — renders nothing',
  render: () =>
    withMockedHelpContent(
      makeQueryResult({ data: null }),
      <div>
        <p
          style={{
            fontFamily: 'monospace',
            fontSize: '0.75rem',
            color: '#71717a',
          }}
        >
          ⓘ Component renders nothing below this line.
        </p>
        <hr style={{ margin: '12px 0' }} />
        <EmptyState surfaceKey="designer-portal/pipeline/project-list" />
        <hr style={{ margin: '12px 0' }} />
      </div>,
    ),
}

export const CTAClicked: Story = {
  name: 'Click the CTA to fire help.empty_state.cta_clicked',
  render: () => {
    const [clicks, setClicks] = React.useState(0)
    return withMockedHelpContent(
      makeQueryResult({ data: SAMPLE_CONTENT }),
      <div>
        <EmptyState
          surfaceKey="designer-portal/pipeline/project-list"
          onAction={() => setClicks((n) => n + 1)}
        />
        <p
          style={{
            marginTop: 16,
            fontFamily: 'monospace',
            fontSize: '0.75rem',
            color: '#71717a',
          }}
        >
          onAction calls: {clicks}
        </p>
      </div>,
    )
  },
}
