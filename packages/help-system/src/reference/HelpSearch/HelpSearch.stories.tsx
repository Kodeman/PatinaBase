import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query'
import { HelpSearch } from './HelpSearch'

// ─── Mock the Sanity client for Storybook ─────────────────────────────────────
//
// Storybook doesn't run inside vitest, so vi.mock is unavailable. We
// monkey-patch the underlying Sanity client module before each story renders
// by swapping in a fake client whose fetch returns canned search results.

import * as sanityClientModule from '../../sanityClient'

type FakeResult = {
  _id: string
  surfaceKey: string
  contentType: string
  title: string
  excerpt: string
}

function installFakeSanityClient(results: FakeResult[]): void {
  const original = sanityClientModule.getSanityClient
  ;(sanityClientModule as { getSanityClient: typeof original }).getSanityClient = (() => ({
    fetch: async () => results,
  })) as unknown as typeof original
  return undefined
}

// ─── Storybook meta ───────────────────────────────────────────────────────────

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, gcTime: 0 } },
})

function QueryReset() {
  // Invalidate help-search queries between stories so canned data swaps cleanly.
  const qc = useQueryClient()
  React.useEffect(() => {
    qc.removeQueries({ queryKey: ['help-search'] })
  }, [qc])
  return null
}

const meta = {
  title: 'help-system/Reference/HelpSearch',
  component: HelpSearch,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Layer 4 (Reference) full-text search across help articles and tooltips. ' +
          'Debounces input (250 ms), parameterized GROQ search, snake_case analytics ' +
          'events. Default click navigates to /help/{surfaceKey}; pass onResultClick ' +
          'to embed inside the contextual help panel.',
      },
    },
  },
  decorators: [
    (Story) => (
      <QueryClientProvider client={queryClient}>
        <QueryReset />
        <div
          style={{
            width: 480,
            padding: 16,
            background: 'var(--surface-2, #f8f7f5)',
            borderRadius: 8,
          }}
        >
          <Story />
        </div>
      </QueryClientProvider>
    ),
  ],
} satisfies Meta<typeof HelpSearch>

export default meta
type Story = StoryObj<typeof meta>

// ─── Sample result fixtures ───────────────────────────────────────────────────

const PIPELINE_RESULTS: FakeResult[] = [
  {
    _id: 'art-pipeline-overview',
    surfaceKey: 'designer-portal/pipeline/project-list',
    contentType: 'helpArticle',
    title: 'How the Pipeline works',
    excerpt:
      'The Pipeline view tracks every project across the four stages — leads, ' +
      'proposals, active, and completed. Use it as your daily command center.',
  },
  {
    _id: 'art-pipeline-stages',
    surfaceKey: 'designer-portal/pipeline',
    contentType: 'helpArticle',
    title: 'The four pipeline stages explained',
    excerpt:
      'Each stage represents a clear handoff point between you and the client.',
  },
  {
    _id: 'tip-stage-filter',
    surfaceKey: 'designer-portal/pipeline/stage-filter',
    contentType: 'tooltip',
    title: 'designer-portal/pipeline/stage-filter',
    excerpt: 'Filter projects by their current pipeline stage.',
  },
  {
    _id: 'art-pipeline-leads',
    surfaceKey: 'designer-portal/pipeline/project-list/empty-leads',
    contentType: 'helpArticle',
    title: 'Where do leads come from?',
    excerpt:
      'Leads arrive from three sources: the consumer app on iOS, manual entry ' +
      'from your contacts, and import from your existing tools.',
  },
]

function generateManyResults(count: number): FakeResult[] {
  return Array.from({ length: count }, (_, i) => ({
    _id: `r-${i}`,
    surfaceKey: `designer-portal/pipeline/result-${i + 1}`,
    contentType: i % 3 === 0 ? 'tooltip' : 'helpArticle',
    title: `Pipeline result ${i + 1}`,
    excerpt: `This is a sample excerpt for pipeline result ${i + 1}, showing how ` +
      `the list renders long body text and truncates per line-clamp.`,
  }))
}

// ─── Stories ──────────────────────────────────────────────────────────────────

export const Default: Story = {
  name: 'Default — empty state',
  render: () => {
    React.useMemo(() => installFakeSanityClient(PIPELINE_RESULTS), [])
    return <HelpSearch />
  },
}

export const WithInitialQuery: Story = {
  name: 'With initial query — results pre-loaded',
  render: () => {
    React.useMemo(() => installFakeSanityClient(PIPELINE_RESULTS), [])
    return <HelpSearch initialQuery="pipeline" />
  },
}

export const NoResults: Story = {
  name: 'No results — empty array from Sanity',
  render: () => {
    React.useMemo(() => installFakeSanityClient([]), [])
    return <HelpSearch initialQuery="frobnicate" />
  },
}

export const ManyResults: Story = {
  name: 'Many results — 20 rows',
  render: () => {
    const many = React.useMemo(() => generateManyResults(20), [])
    React.useMemo(() => installFakeSanityClient(many), [many])
    return <HelpSearch initialQuery="pipeline" />
  },
}

export const ConsumerPanel: Story = {
  name: 'With onResultClick — embedded usage (e.g. C5 panel)',
  render: () => {
    React.useMemo(() => installFakeSanityClient(PIPELINE_RESULTS), [])
    const [last, setLast] = React.useState<string | null>(null)
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <HelpSearch
          initialQuery="pipeline"
          onResultClick={(result) => setLast(result.surfaceKey)}
        />
        <p style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#71717a' }}>
          Last clicked: {last ?? '—'}
        </p>
      </div>
    )
  },
}

export const DesignerPersona: Story = {
  name: 'Persona filter — designer',
  render: () => {
    React.useMemo(() => installFakeSanityClient(PIPELINE_RESULTS), [])
    return <HelpSearch initialQuery="pipeline" persona="designer" />
  },
}
