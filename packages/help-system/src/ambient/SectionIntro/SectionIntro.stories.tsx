import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SectionIntro } from './SectionIntro'
import type { FieldHelperContent } from '../../contentTypes'

// ─── Story helpers ────────────────────────────────────────────────────────────

/**
 * Build a QueryClient that has the help-content query already populated for the
 * given surface key. This sidesteps a live Sanity request so stories render
 * deterministically without network or environment configuration.
 *
 * The query key shape MUST match useHelpContent's internal key:
 *   ['help-content', surfaceKey, contentType, persona]
 */
function makeSeededClient(
  surfaceKey: string,
  body: string | null,
): QueryClient {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity } },
  })

  const payload: FieldHelperContent | null =
    body === null
      ? null
      : {
          surfaceKey,
          persona: 'all',
          contentType: 'fieldHelper',
          body,
        }

  client.setQueryData(['help-content', surfaceKey, 'fieldHelper', 'all'], payload)
  return client
}

/** Visual scaffolding for the demo — a typical "section header + intro" surface. */
function SectionShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ maxWidth: 560, padding: 24 }}>
      <h2
        style={{
          fontSize: '1.125rem',
          fontWeight: 600,
          marginBottom: 4,
        }}
      >
        Project pipeline
      </h2>
      {children}
      <div
        style={{
          marginTop: 16,
          height: 120,
          borderRadius: 6,
          border: '1px dashed #d4d4d8',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#a1a1aa',
          fontSize: '0.75rem',
        }}
      >
        (section content goes here)
      </div>
    </div>
  )
}

// ─── Meta ─────────────────────────────────────────────────────────────────────

const meta = {
  title: 'help-system/ambient/SectionIntro',
  component: SectionIntro,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'The optional 1–2 sentence description rendered below a section header. ' +
          'Content is sourced from Sanity CMS by surface key. Length is enforced editorially ' +
          'in Sanity (writing standards §8 — intros stay 1–2 sentences), not in the component.',
      },
    },
  },
} satisfies Meta<typeof SectionIntro>

export default meta
type Story = StoryObj<typeof meta>

// ─── Stories ──────────────────────────────────────────────────────────────────

/**
 * Default — CMS returns a body string. The component renders a muted-foreground
 * paragraph beneath the section header.
 */
export const Default: Story = {
  args: {
    surfaceKey: 'designer-portal/pipeline/project-list',
  },
  render: (args) => {
    const client = makeSeededClient(
      args.surfaceKey,
      'Projects appear here ordered by last activity. You can change this later.',
    )
    return (
      <QueryClientProvider client={client}>
        <SectionShell>
          <SectionIntro {...args} />
        </SectionShell>
      </QueryClientProvider>
    )
  },
}

/**
 * WithFallback — CMS returns null (no document yet), but a local fallback was
 * provided. The component renders the fallback so the surface never looks
 * unfinished during the content-writing phase.
 */
export const WithFallback: Story = {
  args: {
    surfaceKey: 'designer-portal/pipeline/project-list',
    fallback: 'Track every project here, from first lead to final install.',
  },
  render: (args) => {
    const client = makeSeededClient(args.surfaceKey, null)
    return (
      <QueryClientProvider client={client}>
        <SectionShell>
          <SectionIntro {...args} />
        </SectionShell>
      </QueryClientProvider>
    )
  },
}

/**
 * EmptyState — CMS returns null AND no fallback is provided. The component
 * renders nothing. The section header sits directly above the section content.
 */
export const EmptyState: Story = {
  args: {
    surfaceKey: 'designer-portal/pipeline/project-list',
  },
  render: (args) => {
    const client = makeSeededClient(args.surfaceKey, null)
    return (
      <QueryClientProvider client={client}>
        <SectionShell>
          <SectionIntro {...args} />
        </SectionShell>
      </QueryClientProvider>
    )
  },
}
