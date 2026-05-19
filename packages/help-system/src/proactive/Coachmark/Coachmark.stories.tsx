import * as React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Coachmark } from './Coachmark'
import type { CoachmarkContent } from '../../contentTypes'

// ─── Mocking strategy ─────────────────────────────────────────────────────────
//
// Like the Reactive stories, each story pre-seeds the TanStack Query cache
// under the exact queryKey `useHelpContent` reads:
//
//   ['help-content', surfaceKey, 'coachmark', persona]
//
// No live Sanity round-trip in Storybook.
// ──────────────────────────────────────────────────────────────────────────────

const STORY_SURFACE_KEY = 'designer-portal/pipeline/project-list'

interface SeededClientArgs {
  /** If undefined → seed null so the hook resolves to no content. */
  seed?: CoachmarkContent | null
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
    ['help-content', STORY_SURFACE_KEY, 'coachmark', 'all'],
    seed ?? null,
  )
  return client
}

// Demo anchor — a small filled button so the spotlight has something to point at.
function DemoAnchor({ label = 'Pipeline' }: { label?: string }) {
  return (
    <button
      type="button"
      style={{
        height: 32,
        borderRadius: 6,
        border: '1px solid var(--pe, #e7e1d4)',
        background: 'var(--cl, #f4efe4)',
        color: 'var(--co, #2a2a2a)',
        cursor: 'pointer',
        fontFamily: 'var(--font-inter, Inter, sans-serif)',
        fontSize: '0.8rem',
        padding: '0 12px',
      }}
    >
      {label}
    </button>
  )
}

const meta: Meta<typeof Coachmark> = {
  title: 'help-system/proactive/Coachmark',
  component: Coachmark,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Proactive-layer foundational component (spec §4.7). A non-blocking, ' +
          'anchored spotlight card backed by CMS copy. Built on Radix Popover; ' +
          'declares role="dialog" with aria-modal="false" — does not trap focus, ' +
          'does not block the underlying interface. Composes into <TourController /> ' +
          '(D2) and <FeatureAnnouncementCoachmark /> (D4).',
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
    open: { control: 'boolean' },
    stepNumber: { control: { type: 'number', min: 1, max: 10 } },
    totalSteps: { control: { type: 'number', min: 1, max: 10 } },
  },
}

export default meta
type Story = StoryObj<typeof Coachmark>

// ─── Stories ──────────────────────────────────────────────────────────────────

/**
 * CMS hit — Sanity returns heading + body; coachmark renders immediately.
 * Single-step (no step indicator, no Next button — just dismiss).
 */
export const Default: Story = {
  args: {
    surfaceKey: STORY_SURFACE_KEY,
    open: true,
    side: 'bottom',
    align: 'center',
  },
  render: (args) => (
    <Coachmark {...args}>
      <DemoAnchor />
    </Coachmark>
  ),
  decorators: [
    (StoryFn) => (
      <QueryClientProvider
        client={makeClient({
          seed: {
            surfaceKey: STORY_SURFACE_KEY,
            persona: 'all',
            contentType: 'coachmark',
            heading: 'Welcome to your pipeline',
            body: 'Drag projects between stages to update their status.',
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
 * With CTA — CMS provides a ctaLabel and the caller wires onNext, so the
 * primary action button appears alongside dismiss.
 */
export const WithCTA: Story = {
  args: {
    surfaceKey: STORY_SURFACE_KEY,
    open: true,
    side: 'bottom',
    align: 'center',
  },
  render: (args) => (
    <Coachmark {...args} onNext={() => {}}>
      <DemoAnchor label="Activate project" />
    </Coachmark>
  ),
  decorators: [
    (StoryFn) => (
      <QueryClientProvider
        client={makeClient({
          seed: {
            surfaceKey: STORY_SURFACE_KEY,
            persona: 'all',
            contentType: 'coachmark',
            heading: 'Activate a project',
            body: 'Once a proposal is signed, run the activation wizard to set milestones.',
            ctaLabel: 'Got it',
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
 * Mid-tour — step indicator "2 of 5" + Next button. This is the shape D2
 * <TourController /> will compose: per-step coachmarks that track position.
 */
export const MidTour: Story = {
  args: {
    surfaceKey: STORY_SURFACE_KEY,
    open: true,
    side: 'right',
    align: 'start',
    stepNumber: 2,
    totalSteps: 5,
  },
  render: (args) => (
    <Coachmark {...args} onNext={() => {}}>
      <DemoAnchor label="Stage column" />
    </Coachmark>
  ),
  decorators: [
    (StoryFn) => (
      <QueryClientProvider
        client={makeClient({
          seed: {
            surfaceKey: STORY_SURFACE_KEY,
            persona: 'all',
            contentType: 'coachmark',
            heading: 'Pipeline stages',
            body: 'Each stage shows where projects are in your workflow.',
            ctaLabel: 'Next',
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
 * Reduced motion — verify the fade/zoom animations are gated by motion-safe:
 * Tailwind utilities. Enable `prefers-reduced-motion: reduce` in DevTools
 * (Rendering tab) to view the animation-free render path.
 */
export const ReducedMotion: Story = {
  args: {
    surfaceKey: STORY_SURFACE_KEY,
    open: true,
    side: 'bottom',
    align: 'center',
  },
  render: (args) => (
    <Coachmark {...args}>
      <DemoAnchor />
    </Coachmark>
  ),
  decorators: [
    (StoryFn) => (
      <QueryClientProvider
        client={makeClient({
          seed: {
            surfaceKey: STORY_SURFACE_KEY,
            persona: 'all',
            contentType: 'coachmark',
            heading: 'Quiet by default',
            body: 'When reduced motion is enabled, the spotlight appears without animation.',
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
            (Rendering tab) to verify entrance animation is suppressed.
          </p>
          <StoryFn />
        </div>
      </QueryClientProvider>
    ),
  ],
}

/**
 * Anchored to an external element via `anchorRef` — useful when the
 * coachmark target is rendered by a different component tree.
 */
export const Anchored: Story = {
  args: {
    surfaceKey: STORY_SURFACE_KEY,
    open: true,
    side: 'bottom',
    align: 'center',
  },
  render: function AnchoredStory(args) {
    const anchorRef = React.useRef<HTMLButtonElement>(null)
    return (
      <div style={{ display: 'flex', gap: 32, alignItems: 'center' }}>
        <DemoAnchor label="Decoy" />
        <button
          type="button"
          ref={anchorRef}
          style={{
            height: 36,
            borderRadius: 6,
            border: '2px solid var(--tt, #c89478)',
            background: 'transparent',
            color: 'var(--co, #2a2a2a)',
            cursor: 'pointer',
            fontFamily: 'var(--font-inter, Inter, sans-serif)',
            fontSize: '0.8rem',
            padding: '0 16px',
            fontWeight: 500,
          }}
        >
          External anchor
        </button>
        <Coachmark {...args} anchorRef={anchorRef} />
      </div>
    )
  },
  decorators: [
    (StoryFn) => (
      <QueryClientProvider
        client={makeClient({
          seed: {
            surfaceKey: STORY_SURFACE_KEY,
            persona: 'all',
            contentType: 'coachmark',
            heading: 'Anchored externally',
            body: 'This coachmark uses anchorRef instead of wrapping its target.',
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
 * No content — Sanity returns null and no fallback is provided. The anchor
 * renders raw; no coachmark appears. Silent absence per spec §13.4.
 */
export const NoContent: Story = {
  args: {
    surfaceKey: STORY_SURFACE_KEY,
    open: true,
  },
  render: (args) => (
    <Coachmark {...args}>
      <DemoAnchor />
    </Coachmark>
  ),
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
            Sentinel: CMS returned null + no fallback → anchor renders raw,
            no coachmark appears.
          </p>
          <StoryFn />
        </div>
      </QueryClientProvider>
    ),
  ],
}
