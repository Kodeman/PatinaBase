import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HelpArticle } from './HelpArticle'
import type { HelpArticleContent } from '../../contentTypes'

// ─── Mocking strategy ─────────────────────────────────────────────────────────
//
// Stories pass `content` directly so no Sanity round-trip is required. The
// QueryClientProvider is still wired up so the surfaceKey fetch path can be
// demonstrated by stories that opt into it.
//
// Pattern: same as LearnMore / FieldHelper stories — pre-seed the TanStack
// cache under the exact queryKey shape consumed by useHelpContent if needed.
// ──────────────────────────────────────────────────────────────────────────────

const STORY_SURFACE_KEY = 'designer-portal/pipeline/project-list'
const STORY_ARTICLE_ID = 'story-article-pipeline'

function makeClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity, gcTime: Infinity },
    },
  })
}

/** Shell mimics where the article renders inside the Help Center grid. */
function StoryShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--patina-surface, #FFFFFF)',
        minHeight: '100vh',
        padding: '32px 16px',
        fontFamily: 'var(--font-inter, Inter, system-ui, sans-serif)',
        color: 'var(--charcoal, #2C2926)',
      }}
    >
      {children}
    </div>
  )
}

// ─── Article fixtures ────────────────────────────────────────────────────────

const SHORT_BODY: HelpArticleContent['body'] = [
  {
    _type: 'block',
    _key: 'b1',
    style: 'normal',
    children: [
      {
        _type: 'span',
        _key: 's1',
        text: 'The pipeline tracks every project in your studio from first lead through final install. Drag a card to move it; the stage colors map to the swatches in Settings.',
        marks: [],
      },
    ],
    markDefs: [],
  },
  {
    _type: 'block',
    _key: 'b2',
    style: 'h2',
    children: [{ _type: 'span', _key: 's2', text: 'How stages work', marks: [] }],
    markDefs: [],
  },
  {
    _type: 'block',
    _key: 'b3',
    style: 'normal',
    children: [
      {
        _type: 'span',
        _key: 's3',
        text: 'Stages advance automatically when their gate criteria are met — for example, Design Review advances to Production once the final BOM is approved.',
        marks: [],
      },
    ],
    markDefs: [],
  },
  {
    _type: 'block',
    _key: 'b4',
    style: 'normal',
    children: [
      { _type: 'span', _key: 's4a', text: 'You can also move cards ', marks: [] },
      { _type: 'span', _key: 's4b', text: 'manually', marks: ['em'] },
      { _type: 'span', _key: 's4c', text: ' — useful when a project has nonstandard flow.', marks: [] },
    ],
    markDefs: [],
  },
]

const LONG_BODY: HelpArticleContent['body'] = [
  ...SHORT_BODY,
  {
    _type: 'block',
    _key: 'b5',
    style: 'h2',
    children: [{ _type: 'span', _key: 's5', text: 'Customizing stages', marks: [] }],
    markDefs: [],
  },
  {
    _type: 'block',
    _key: 'b6',
    style: 'normal',
    children: [
      {
        _type: 'span',
        _key: 's6',
        text: 'Every studio needs slightly different stages. Open Settings → Pipeline to add, remove, or rename stages. Reordering takes effect immediately and never deletes existing projects.',
        marks: [],
      },
    ],
    markDefs: [],
  },
  {
    _type: 'block',
    _key: 'b7',
    style: 'h3',
    children: [{ _type: 'span', _key: 's7', text: 'Gate criteria', marks: [] }],
    markDefs: [],
  },
  {
    _type: 'block',
    _key: 'b8',
    style: 'normal',
    children: [
      {
        _type: 'span',
        _key: 's8',
        text: 'Each stage exposes one or more gate criteria — small boolean predicates that decide when a card is eligible to advance. Common examples:',
        marks: [],
      },
    ],
    markDefs: [],
  },
  {
    _type: 'block',
    _key: 'b9',
    style: 'normal',
    listItem: 'bullet',
    level: 1,
    children: [
      { _type: 'span', _key: 's9', text: 'Final BOM approved', marks: [] },
    ],
    markDefs: [],
  },
  {
    _type: 'block',
    _key: 'b10',
    style: 'normal',
    listItem: 'bullet',
    level: 1,
    children: [
      { _type: 'span', _key: 's10', text: 'Client signoff captured', marks: [] },
    ],
    markDefs: [],
  },
  {
    _type: 'block',
    _key: 'b11',
    style: 'normal',
    listItem: 'bullet',
    level: 1,
    children: [
      { _type: 'span', _key: 's11', text: 'Deposit received', marks: [] },
    ],
    markDefs: [],
  },
  {
    _type: 'block',
    _key: 'b12',
    style: 'normal',
    children: [
      {
        _type: 'span',
        _key: 's12',
        text: 'When all gates are green, the card glows briefly and slides into the next column on its own. You can disable auto-advance per studio in Settings.',
        marks: [],
      },
    ],
    markDefs: [],
  },
]

const SHORT_ARTICLE: HelpArticleContent & { _id: string } = {
  _id: STORY_ARTICLE_ID,
  surfaceKey: STORY_SURFACE_KEY,
  persona: 'all',
  contentType: 'helpArticle',
  eyebrow: 'Help · Pipeline',
  title: 'What is the project pipeline?',
  oneSentenceAnswer:
    'The pipeline tracks every project from first lead through final install.',
  body: SHORT_BODY,
  wordCount: 60,
  readingTimeMinutes: 1,
  lastUpdated: '2026-04-12',
}

const LONG_ARTICLE: HelpArticleContent & { _id: string } = {
  ...SHORT_ARTICLE,
  _id: 'story-article-pipeline-long',
  body: LONG_BODY,
  wordCount: 220,
  readingTimeMinutes: 3,
}

const ARTICLE_WITH_RELATED: HelpArticleContent & {
  _id: string
  relatedArticles?: Array<{ _ref: string }>
} = {
  ...SHORT_ARTICLE,
  _id: 'story-article-pipeline-related',
  relatedArticles: [{ _ref: 'related-1' }, { _ref: 'related-2' }, { _ref: 'related-3' }],
}

// ─── Meta ─────────────────────────────────────────────────────────────────────

const meta = {
  title: 'help-system/reference/HelpArticle',
  component: HelpArticle,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Portable-text article renderer with feedback widget (spec §4.9). ' +
          'Accepts either a `content` prop or a `surfaceKey` for CMS lookup. ' +
          'Fires `help.article.opened` on mount, `help.article.scrolled_to_end` on ' +
          'sentinel intersect, and `help.article.feedback_given` on thumbs-up/down ' +
          'clicks. All analytics property keys are snake_case per R11.',
      },
    },
  },
  argTypes: {
    surfaceKey: { control: 'text' },
    source: { control: 'text' },
    fallbackTitle: { control: 'text' },
    className: { control: 'text' },
  },
} satisfies Meta<typeof HelpArticle>

export default meta
type Story = StoryObj<typeof meta>

// ─── Stories ──────────────────────────────────────────────────────────────────

/**
 * Default — standard help article rendered from a pre-fetched content object.
 * Click the thumbs-up / thumbs-down buttons to see the feedback widget engage.
 */
export const Default: Story = {
  args: {
    surfaceKey: STORY_SURFACE_KEY,
    source: 'help_center',
  },
  render: (args) => {
    const client = makeClient()
    return (
      <QueryClientProvider client={client}>
        <StoryShell>
          <HelpArticle {...args} content={SHORT_ARTICLE} />
        </StoryShell>
      </QueryClientProvider>
    )
  },
}

/**
 * WithRelated — demonstrates the `renderRelated` slot. E4's RelatedArticles
 * component will live here; for storybook we render a simple list of refs.
 */
export const WithRelated: Story = {
  args: {
    surfaceKey: STORY_SURFACE_KEY,
    source: 'help_center',
  },
  render: (args) => {
    const client = makeClient()
    return (
      <QueryClientProvider client={client}>
        <StoryShell>
          <HelpArticle
            {...args}
            content={ARTICLE_WITH_RELATED}
            renderRelated={(ids) => (
              <section aria-labelledby="related-heading">
                <h3
                  id="related-heading"
                  style={{
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    marginBottom: 8,
                    color: 'var(--ao, #6b6760)',
                  }}
                >
                  Related articles
                </h3>
                <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                  {ids.map((id) => (
                    <li key={id} style={{ padding: '4px 0', fontSize: '0.85rem' }}>
                      <a href={`#${id}`} style={{ color: 'inherit', textDecoration: 'underline' }}>
                        {id}
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          />
        </StoryShell>
      </QueryClientProvider>
    )
  },
}

/**
 * LongBody — exercises h2/h3 headings, lists, and emphasis marks so the
 * portable-text components can be reviewed at a glance.
 */
export const LongBody: Story = {
  args: {
    surfaceKey: STORY_SURFACE_KEY,
    source: 'help_center',
  },
  render: (args) => {
    const client = makeClient()
    return (
      <QueryClientProvider client={client}>
        <StoryShell>
          <HelpArticle {...args} content={LONG_ARTICLE} />
        </StoryShell>
      </QueryClientProvider>
    )
  },
}

/**
 * NoContent — content is null, fallback title is provided. Used when an
 * article hasn't been written yet but a placeholder slot still needs to render
 * (helpful for staging links from empty states).
 */
export const NoContent: Story = {
  args: {
    surfaceKey: STORY_SURFACE_KEY,
    fallbackTitle: 'How are stages calculated?',
  },
  render: (args) => {
    const client = makeClient()
    return (
      <QueryClientProvider client={client}>
        <StoryShell>
          <HelpArticle {...args} content={null} />
        </StoryShell>
      </QueryClientProvider>
    )
  },
}

/**
 * FromContextualPanel — same article, but `source = 'contextual_panel'` so
 * the opened analytics event carries the right attribution. Visually
 * identical to Default — the difference is what PostHog records.
 */
export const FromContextualPanel: Story = {
  args: {
    surfaceKey: STORY_SURFACE_KEY,
    source: 'contextual_panel',
  },
  render: (args) => {
    const client = makeClient()
    return (
      <QueryClientProvider client={client}>
        <StoryShell>
          <div
            style={{
              border: '1px solid var(--pe, #e7e1d4)',
              borderRadius: 4,
              padding: 16,
              maxWidth: 480,
              margin: '0 auto',
            }}
          >
            <p
              style={{
                fontSize: '0.7rem',
                color: 'var(--ao, #6b6760)',
                fontStyle: 'italic',
                margin: '0 0 12px',
              }}
            >
              Sentinel: rendered inside a fake ContextualHelpPanel shell. The opened
              event below will have <code>source: contextual_panel</code>.
            </p>
            <HelpArticle {...args} content={SHORT_ARTICLE} />
          </div>
        </StoryShell>
      </QueryClientProvider>
    )
  },
}
