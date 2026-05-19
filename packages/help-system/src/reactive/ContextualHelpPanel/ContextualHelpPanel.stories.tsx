import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query'
import { ContextualHelpPanel } from './ContextualHelpPanel'
import { SurfaceKeyProvider } from '../../providers/SurfaceKeyProvider'

// ─── Mock the Sanity client at the module level for Storybook ─────────────────
//
// Storybook doesn't run inside vitest, so we can't use vi.mock here. Instead we
// monkey-patch the underlying Sanity client module before each story renders by
// swapping in a fake client whose fetch returns canned article data.

import * as sanityClientModule from '../../sanityClient'

type FakeArticle = {
  _id: string
  surfaceKey: string
  title: string
  excerpt: string
}

function installFakeSanityClient(articles: FakeArticle[]): void {
  const original = sanityClientModule.getSanityClient
  ;(sanityClientModule as { getSanityClient: typeof original }).getSanityClient = (() => ({
    fetch: async () => articles,
  })) as unknown as typeof original
  // Note: the original is intentionally not restored between stories — every
  // story installs its own fake before rendering.
  return undefined
}

// ─── Storybook meta ───────────────────────────────────────────────────────────

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, gcTime: 0 } },
})

function QueryReset() {
  // Invalidate panel queries between stories so canned data swaps cleanly.
  const qc = useQueryClient()
  React.useEffect(() => {
    qc.removeQueries({ queryKey: ['help-panel-articles'] })
  }, [qc])
  return null
}

const meta = {
  title: 'help-system/Reactive/ContextualHelpPanel',
  component: ContextualHelpPanel,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Layer 2 (Reactive) slide-out help panel. Triggered by the utility-bar ? icon ' +
          '(C6 — separate task). Fetches articles related to the current surface key via ' +
          'Sanity GROQ and renders title + summary excerpts. Click a row to expand inline ' +
          '(full <HelpArticle /> rendering ships in Sprint 3, Stream E).',
      },
    },
  },
  decorators: [
    (Story) => (
      <QueryClientProvider client={queryClient}>
        <SurfaceKeyProvider initialSurfaceKey="designer-portal/pipeline/project-list">
          <QueryReset />
          <div
            style={{
              minHeight: 480,
              padding: 24,
              background: 'var(--surface-2, #f8f7f5)',
            }}
          >
            <Story />
          </div>
        </SurfaceKeyProvider>
      </QueryClientProvider>
    ),
  ],
} satisfies Meta<typeof ContextualHelpPanel>

export default meta
type Story = StoryObj<typeof meta>

// ─── Sample article fixtures ──────────────────────────────────────────────────

const PIPELINE_ARTICLES: FakeArticle[] = [
  {
    _id: 'art-pipeline-overview',
    surfaceKey: 'designer-portal/pipeline/project-list',
    title: 'How the Pipeline works',
    excerpt:
      'The Pipeline view tracks every project across the four stages — leads, ' +
      'proposals, active, and completed. Use it as your daily command center to ' +
      'see what needs your attention next.',
  },
  {
    _id: 'art-pipeline-stages',
    surfaceKey: 'designer-portal/pipeline',
    title: 'The four pipeline stages explained',
    excerpt:
      'Each stage represents a clear handoff point between you and the client. ' +
      'Leads are warm prospects, proposals are documents under review, active ' +
      'projects are in production, and completed projects are wrapped up.',
  },
  {
    _id: 'art-pipeline-leads',
    surfaceKey: 'designer-portal/pipeline/project-list/empty-leads',
    title: 'Where do leads come from?',
    excerpt:
      'Leads arrive from three sources: the consumer app on iOS, manual entry ' +
      'from your contacts, and import from your existing tools.',
  },
  {
    _id: 'art-pipeline-conversion',
    surfaceKey: 'designer-portal',
    title: 'Converting a lead to a proposal',
    excerpt:
      'Once a lead is qualified, click the “Send proposal” button to generate a ' +
      'document tailored to the client and the scope you have discussed.',
  },
]

// ─── Stories ──────────────────────────────────────────────────────────────────

export const WithArticles: Story = {
  name: 'With articles (uncontrolled, internal trigger)',
  render: () => {
    React.useMemo(() => installFakeSanityClient(PIPELINE_ARTICLES), [])
    return (
      <ContextualHelpPanel
        surfaceKey="designer-portal/pipeline/project-list"
        trigger={
          <button
            type="button"
            style={{
              padding: '8px 14px',
              borderRadius: 6,
              border: '1px solid #d4d4d8',
              background: 'white',
              cursor: 'pointer',
            }}
          >
            ? Help
          </button>
        }
      />
    )
  },
}

export const Empty: Story = {
  name: 'Empty — no articles for this surface',
  render: () => {
    React.useMemo(() => installFakeSanityClient([]), [])
    return (
      <ContextualHelpPanel
        surfaceKey="designer-portal/something-brand-new"
        trigger={
          <button
            type="button"
            style={{
              padding: '8px 14px',
              borderRadius: 6,
              border: '1px solid #d4d4d8',
              background: 'white',
              cursor: 'pointer',
            }}
          >
            ? Help
          </button>
        }
      />
    )
  },
}

export const Controlled: Story = {
  name: 'Controlled — parent manages open state',
  render: () => {
    React.useMemo(() => installFakeSanityClient(PIPELINE_ARTICLES), [])
    const [open, setOpen] = React.useState(false)
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            style={{
              padding: '8px 14px',
              borderRadius: 6,
              border: '1px solid #d4d4d8',
              background: 'white',
              cursor: 'pointer',
            }}
          >
            Toggle help panel (currently {open ? 'open' : 'closed'})
          </button>
        </div>
        <p style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#71717a' }}>
          Parent state owns `open`. The panel exposes Radix Dialog's open-change
          callback so the parent can close on any outside event.
        </p>
        <ContextualHelpPanel
          surfaceKey="designer-portal/pipeline/project-list"
          open={open}
          onOpenChange={setOpen}
        />
      </div>
    )
  },
}

export const DefaultTrigger: Story = {
  name: 'Default trigger only (no surface key prop — reads context)',
  render: () => {
    React.useMemo(() => installFakeSanityClient(PIPELINE_ARTICLES), [])
    return (
      <div>
        <p style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#71717a' }}>
          surfaceKey resolves to `designer-portal/pipeline/project-list` via the
          SurfaceKeyProvider decorator wrapping every story.
        </p>
        <ContextualHelpPanel
          trigger={
            <button
              type="button"
              aria-label="Open contextual help"
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                border: '1px solid #d4d4d8',
                background: 'white',
                cursor: 'pointer',
                fontFamily: 'serif',
                fontSize: 16,
              }}
            >
              ?
            </button>
          }
        />
      </div>
    )
  },
}
