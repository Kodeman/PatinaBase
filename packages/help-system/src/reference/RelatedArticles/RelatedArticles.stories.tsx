import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RelatedArticles } from './RelatedArticles'

// ─── Mocking strategy ─────────────────────────────────────────────────────────
//
// `RelatedArticles` queries Sanity through TanStack Query. To keep stories
// self-contained, each story pre-seeds the React Query cache under the exact
// query key the component reads, so the `queryFn` is never invoked:
//
//   ['help-related-articles', mode, idsKey, surfaceKeyPrefix, max]
//
// Where:
//   • mode  = 'ids' | 'prefix'
//   • idsKey = sorted CSV of articleIds (or '' in prefix mode)
//   • max    = number — must match the component's prop
//
// This mirrors the pattern used in LearnMore.stories.tsx and SectionIntro.
// ──────────────────────────────────────────────────────────────────────────────

interface SeedRow {
  _id: string
  surfaceKey: string
  title: string
  excerpt: string
}

interface MakeClientArgs {
  mode: 'ids' | 'prefix'
  idsKey: string
  surfaceKeyPrefix: string
  max: number
  rows: SeedRow[] | null
}

function makeClient({ mode, idsKey, surfaceKeyPrefix, max, rows }: MakeClientArgs): QueryClient {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity, gcTime: Infinity },
    },
  })
  client.setQueryData(
    ['help-related-articles', mode, idsKey, surfaceKeyPrefix, max],
    rows ?? [],
  )
  return client
}

/** Visual scaffolding — places the list at the foot of a mock article. */
function StoryShell({ children }: { children: React.ReactNode }) {
  return (
    <article
      style={{
        maxWidth: 640,
        padding: 32,
        fontFamily: 'var(--font-inter, Inter, system-ui, sans-serif)',
        color: 'var(--ic, #2a2622)',
      }}
    >
      <p
        style={{
          fontSize: '0.7rem',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--ao, #6b6760)',
          marginBottom: 4,
        }}
      >
        Help article
      </p>
      <h1
        style={{
          fontSize: '1.5rem',
          fontWeight: 700,
          marginBottom: 8,
          fontFamily: 'var(--font-playfair, ui-serif, Georgia, serif)',
        }}
      >
        How the Pipeline works
      </h1>
      <p
        style={{
          fontSize: '0.95rem',
          color: 'var(--ao, #6b6760)',
          marginBottom: 24,
          lineHeight: 1.6,
        }}
      >
        The Pipeline view tracks every project across the four stages — leads,
        proposals, active, and completed. Use it as your daily command center.
      </p>
      <div style={{ borderTop: '1px solid var(--pe, #e7e1d4)', paddingTop: 24 }}>
        {children}
      </div>
    </article>
  )
}

// ─── Sample rows ──────────────────────────────────────────────────────────────

const SAMPLE_ROWS: SeedRow[] = [
  {
    _id: 'article-1',
    surfaceKey: 'designer-portal/pipeline/project-list',
    title: 'How the Pipeline works',
    excerpt:
      'The Pipeline view tracks every project across the four stages.',
  },
  {
    _id: 'article-2',
    surfaceKey: 'designer-portal/pipeline/stages',
    title: 'Pipeline stages explained',
    excerpt:
      'Each stage represents a clear handoff point between you and the client.',
  },
  {
    _id: 'article-3',
    surfaceKey: 'designer-portal/pipeline/advancing',
    title: 'Advancing a project stage',
    excerpt:
      'Drag a card forward to advance — the system asks for confirmation before any billable handoffs.',
  },
  {
    _id: 'article-4',
    surfaceKey: 'designer-portal/pipeline/notes',
    title: 'Adding notes to a project card',
    excerpt:
      'Project notes appear on the card and are visible to anyone with access to the project.',
  },
  {
    _id: 'article-5',
    surfaceKey: 'designer-portal/pipeline/archive',
    title: 'Archiving a completed project',
    excerpt:
      'When a project wraps, archive it to keep your active board clear without losing history.',
  },
]

const LONG_TITLE_ROWS: SeedRow[] = [
  {
    _id: 'long-1',
    surfaceKey: 'designer-portal/pipeline/very-long-surface-key',
    title:
      'A surprisingly long help article title that tests how the layout behaves when titles wrap onto multiple lines in narrow surfaces',
    excerpt:
      'Long-title excerpts tend to be long themselves — this one keeps going for a couple of sentences. ' +
      'The component should accommodate it without breaking the visual rhythm of the underlying article.',
  },
  {
    _id: 'long-2',
    surfaceKey: 'designer-portal/pipeline/another-long-key',
    title:
      'Another long title used to prove the component degrades gracefully when content authors get carried away with the question phrasing',
    excerpt:
      'Excerpt for the second long-titled article — likewise wordy on purpose.',
  },
]

// ─── Meta ─────────────────────────────────────────────────────────────────────

const meta = {
  title: 'help-system/reference/RelatedArticles',
  component: RelatedArticles,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Layer 4 (Reference) list of related help articles. Two query modes: ' +
          '`articleIds` (direct lookup) or `surfaceKeyPrefix` (siblings under the ' +
          'same parent surface). Empty state renders NOTHING — this is a ' +
          'supplementary surface and never blocking. Fires ' +
          '`help.related_article.clicked` to `window.posthog` (snake_case keys).',
      },
    },
  },
  argTypes: {
    articleIds: { control: 'object' },
    surfaceKeyPrefix: { control: 'text' },
    max: { control: { type: 'number', min: 1, max: 10 } },
    heading: { control: 'text' },
    className: { control: 'text' },
  },
} satisfies Meta<typeof RelatedArticles>

export default meta
type Story = StoryObj<typeof meta>

// ─── Stories ──────────────────────────────────────────────────────────────────

/**
 * ByIds — Articles fetched by explicit ID list. Typically used when the parent
 * `helpArticleContent.relatedArticles` reference array is passed straight in.
 */
export const ByIds: Story = {
  args: {
    articleIds: ['article-2', 'article-3', 'article-4'],
    max: 5,
  },
  render: (args) => {
    const idsKey = [...(args.articleIds ?? [])].sort().join(',')
    const client = makeClient({
      mode: 'ids',
      idsKey,
      surfaceKeyPrefix: '',
      max: args.max ?? 5,
      rows: SAMPLE_ROWS.filter((r) => (args.articleIds ?? []).includes(r._id)),
    })
    return (
      <QueryClientProvider client={client}>
        <StoryShell>
          <RelatedArticles {...args} />
        </StoryShell>
      </QueryClientProvider>
    )
  },
}

/**
 * ByPrefix — Articles fetched by surface-key prefix. Surfaces siblings under
 * the same parent, ordered by surfaceKey. Typical use: at the foot of an
 * article, list other articles for the same feature.
 */
export const ByPrefix: Story = {
  args: {
    surfaceKeyPrefix: 'designer-portal/pipeline',
    max: 5,
  },
  render: (args) => {
    const client = makeClient({
      mode: 'prefix',
      idsKey: '',
      surfaceKeyPrefix: args.surfaceKeyPrefix ?? '',
      max: args.max ?? 5,
      rows: SAMPLE_ROWS,
    })
    return (
      <QueryClientProvider client={client}>
        <StoryShell>
          <RelatedArticles {...args} />
        </StoryShell>
      </QueryClientProvider>
    )
  },
}

/**
 * FewResults — Only one article matches. Component still renders the heading
 * and the single item; the list shouldn't look broken with a single row.
 */
export const FewResults: Story = {
  args: {
    surfaceKeyPrefix: 'designer-portal/pipeline',
    max: 5,
  },
  render: (args) => {
    const client = makeClient({
      mode: 'prefix',
      idsKey: '',
      surfaceKeyPrefix: args.surfaceKeyPrefix ?? '',
      max: args.max ?? 5,
      rows: SAMPLE_ROWS.slice(0, 1),
    })
    return (
      <QueryClientProvider client={client}>
        <StoryShell>
          <RelatedArticles {...args} />
        </StoryShell>
      </QueryClientProvider>
    )
  },
}

/**
 * NoResults — Zero matching articles. Per spec, the component renders NOTHING
 * (silent absence). The sentinel wrapper confirms the empty render is invisible.
 */
export const NoResults: Story = {
  args: {
    surfaceKeyPrefix: 'designer-portal/nonexistent',
    max: 5,
  },
  render: (args) => {
    const client = makeClient({
      mode: 'prefix',
      idsKey: '',
      surfaceKeyPrefix: args.surfaceKeyPrefix ?? '',
      max: args.max ?? 5,
      rows: [],
    })
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
              Sentinel: the rendered RelatedArticles below should be invisible
              (null) because zero rows match the prefix.
            </p>
            <div style={{ marginTop: 8 }}>
              <RelatedArticles {...args} />
            </div>
          </div>
        </StoryShell>
      </QueryClientProvider>
    )
  },
}

/**
 * LongTitles — Articles with long titles + excerpts. Confirms the component
 * wraps gracefully and the visual rhythm survives content-author exuberance.
 */
export const LongTitles: Story = {
  args: {
    articleIds: ['long-1', 'long-2'],
    max: 5,
  },
  render: (args) => {
    const idsKey = [...(args.articleIds ?? [])].sort().join(',')
    const client = makeClient({
      mode: 'ids',
      idsKey,
      surfaceKeyPrefix: '',
      max: args.max ?? 5,
      rows: LONG_TITLE_ROWS,
    })
    return (
      <QueryClientProvider client={client}>
        <StoryShell>
          <RelatedArticles {...args} />
        </StoryShell>
      </QueryClientProvider>
    )
  },
}
