import type { Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as Tooltip from '@radix-ui/react-tooltip'
import { StrataInfoIcon } from './StrataInfoIcon'
import type { TooltipContent } from '../../contentTypes'

// ─── Mocking strategy ─────────────────────────────────────────────────────────
//
// `useHelpContent` is a thin TanStack-Query wrapper around a Sanity fetch. To
// avoid a live Sanity round-trip in Storybook, each story pre-seeds the
// TanStack Query cache with a fixture under the exact queryKey the hook reads:
//
//   ['help-content', surfaceKey, 'tooltip', persona]
//
// The hook's `queryFn` is never called because the cache hit is fresh.
// This mirrors how portals will mount the QueryClientProvider in their shell.
// ──────────────────────────────────────────────────────────────────────────────

const AESTHETE_KEY = 'designer-portal/aesthete/engine-overview'
const FFE_KEY = 'designer-portal/specifications/ffe-stages'
const FOUNDING_CIRCLE_KEY = 'designer-portal/account/founding-circle'

interface SeededClientArgs {
  surfaceKey: string
  seed?: TooltipContent | null
}

function makeClient({ surfaceKey, seed }: SeededClientArgs): QueryClient {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Infinity,
      },
    },
  })
  // Pre-seed the cache under the queryKey shape used by useHelpContent.
  // persona defaults to 'all' inside the hook.
  client.setQueryData(
    ['help-content', surfaceKey, 'tooltip', 'all'],
    seed ?? null,
  )
  return client
}

const meta = {
  title: 'help-system/reactive/StrataInfoIcon',
  component: StrataInfoIcon,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Reactive-layer Patina concept indicator (spec §4.2). Renders the StrataMark ' +
          'glyph (three descending horizontal lines) in Clay/terracotta tone and reveals ' +
          'a tooltip on hover or focus. **Use ONLY for Patina-specific concepts** — ' +
          'Aesthete Engine, FF&E stages, Strata Mark, Founding Circle, Patina vocabulary. ' +
          'General "what does this number mean?" questions should use `<InfoIcon />` (C2) ' +
          'instead. The two are NOT interchangeable — mixing them dilutes the meaning of both.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    surfaceKey: { control: 'text' },
    size: { control: { type: 'number', min: 10, max: 32, step: 1 } },
    fallback: { control: 'text' },
    ariaLabel: { control: 'text' },
    className: { control: 'text' },
  },
} satisfies Meta<typeof StrataInfoIcon>

export default meta
type Story = StoryObj<typeof meta>

// ─── Stories ──────────────────────────────────────────────────────────────────

/**
 * Default — CMS returns tooltip content for the Aesthete Engine concept.
 * Focus or hover the glyph to see the tooltip.
 */
export const Default: Story = {
  args: {
    surfaceKey: AESTHETE_KEY,
  },
  decorators: [
    (StoryFn) => (
      <QueryClientProvider
        client={makeClient({
          surfaceKey: AESTHETE_KEY,
          seed: {
            surfaceKey: AESTHETE_KEY,
            persona: 'all',
            contentType: 'tooltip',
            eyebrow: 'PATINA CONCEPT',
            body:
              'The Aesthete Engine learns each designer’s style and proposes shapes accordingly.',
          },
        })}
      >
        <Tooltip.Provider delayDuration={200} skipDelayDuration={100}>
          <StoryFn />
        </Tooltip.Provider>
      </QueryClientProvider>
    ),
  ],
}

/**
 * Hovered — the same Aesthete Engine concept but with the tooltip preset open
 * by `defaultOpen` on the Radix root. This makes the visual obvious in
 * Chromatic snapshots without requiring interaction simulation.
 */
export const Hovered: Story = {
  args: {
    surfaceKey: AESTHETE_KEY,
  },
  decorators: [
    (StoryFn) => (
      <QueryClientProvider
        client={makeClient({
          surfaceKey: AESTHETE_KEY,
          seed: {
            surfaceKey: AESTHETE_KEY,
            persona: 'all',
            contentType: 'tooltip',
            eyebrow: 'PATINA CONCEPT',
            body:
              'The Aesthete Engine learns each designer’s style and proposes shapes accordingly.',
          },
        })}
      >
        {/* delayDuration=0 makes the tooltip open instantly on first render
            via Radix's "instant-open" heuristic so the snapshot is stable. */}
        <Tooltip.Provider delayDuration={0} skipDelayDuration={0}>
          <div style={{ padding: 40 }}>
            <StoryFn />
          </div>
        </Tooltip.Provider>
      </QueryClientProvider>
    ),
  ],
}

/**
 * Focused — keyboard focus opens the tooltip (the StrataInfoIcon is a
 * `<button>` so it lives in the natural tab order). The story includes a
 * helper note for sighted users so the focused state is interpretable.
 */
export const Focused: Story = {
  args: {
    surfaceKey: FFE_KEY,
  },
  decorators: [
    (StoryFn) => (
      <QueryClientProvider
        client={makeClient({
          surfaceKey: FFE_KEY,
          seed: {
            surfaceKey: FFE_KEY,
            persona: 'all',
            contentType: 'tooltip',
            eyebrow: 'PATINA CONCEPT',
            body:
              'FF&E (Furniture, Fixtures & Equipment) stages track an item from Selected → Specified → Ordered → Installed.',
          },
        })}
      >
        <Tooltip.Provider delayDuration={0} skipDelayDuration={0}>
          <div style={{ padding: 40, display: 'grid', gap: 12 }}>
            <p
              style={{
                fontSize: 12,
                color: 'var(--ao, #6b6760)',
                fontFamily: 'var(--font-inter, Inter, sans-serif)',
                margin: 0,
              }}
            >
              Tab to the glyph below — focus reveals the tooltip.
            </p>
            <StoryFn />
          </div>
        </Tooltip.Provider>
      </QueryClientProvider>
    ),
  ],
}

/**
 * NoContent — CMS returns null and no fallback is provided. The icon renders
 * without a tooltip wrapper (silent absence per spec §13.4). Useful to verify
 * the graceful degradation path: a missing CMS doc must NOT crash the UI.
 */
export const NoContent: Story = {
  args: {
    surfaceKey: AESTHETE_KEY,
  },
  decorators: [
    (StoryFn) => (
      <QueryClientProvider client={makeClient({ surfaceKey: AESTHETE_KEY, seed: null })}>
        <Tooltip.Provider delayDuration={200} skipDelayDuration={100}>
          <div
            style={{
              border: '1px dashed var(--pe, #e7e1d4)',
              borderRadius: 4,
              padding: 16,
              background: 'rgba(196,165,123,0.04)',
              color: 'var(--ao, #6b6760)',
              fontFamily: 'var(--font-inter, Inter, sans-serif)',
              fontSize: 12,
              display: 'grid',
              gap: 8,
            }}
          >
            <p style={{ margin: 0, fontStyle: 'italic', opacity: 0.7 }}>
              Sentinel: CMS returned null + no fallback → the glyph renders alone
              (no tooltip wrapper, no analytics on interaction).
            </p>
            <StoryFn />
          </div>
        </Tooltip.Provider>
      </QueryClientProvider>
    ),
  ],
}

/**
 * CustomSize — verify the glyph scales correctly when a non-default `size`
 * is provided. The hover/focus heavier-weight effect should remain
 * proportional.
 */
export const CustomSize: Story = {
  args: {
    surfaceKey: AESTHETE_KEY,
    size: 24,
  },
  decorators: [
    (StoryFn) => (
      <QueryClientProvider
        client={makeClient({
          surfaceKey: AESTHETE_KEY,
          seed: {
            surfaceKey: AESTHETE_KEY,
            persona: 'all',
            contentType: 'tooltip',
            eyebrow: 'PATINA CONCEPT',
            body:
              'The Aesthete Engine learns each designer’s style and proposes shapes accordingly.',
          },
        })}
      >
        <Tooltip.Provider delayDuration={200} skipDelayDuration={100}>
          <div style={{ padding: 40, display: 'flex', gap: 24, alignItems: 'center' }}>
            <StrataInfoIcon surfaceKey={AESTHETE_KEY} size={12} />
            <StrataInfoIcon surfaceKey={AESTHETE_KEY} size={14} />
            <StrataInfoIcon surfaceKey={AESTHETE_KEY} size={18} />
            <StoryFn />
            <StrataInfoIcon surfaceKey={AESTHETE_KEY} size={32} />
          </div>
        </Tooltip.Provider>
      </QueryClientProvider>
    ),
  ],
}

/**
 * InContextWithLabel — the canonical usage from spec §4.2 line 216:
 *   <SectionHeading>The Aesthete Engine <StrataInfoIcon surfaceKey="..." /></SectionHeading>
 *
 * The glyph sits inline next to a section heading, signaling "this is a
 * platform concept worth learning."  Hover or focus to reveal the explainer.
 *
 * The second example uses the FoundingCircle surface key — another Patina-
 * specific concept that benefits from the StrataMark treatment.
 */
export const InContextWithLabel: Story = {
  args: {
    surfaceKey: AESTHETE_KEY,
  },
  decorators: [
    (StoryFn) => (
      <QueryClientProvider
        client={(() => {
          const c = new QueryClient({
            defaultOptions: { queries: { retry: false, staleTime: Infinity } },
          })
          c.setQueryData(['help-content', AESTHETE_KEY, 'tooltip', 'all'], {
            surfaceKey: AESTHETE_KEY,
            persona: 'all',
            contentType: 'tooltip',
            eyebrow: 'PATINA CONCEPT',
            body:
              'The Aesthete Engine learns each designer’s style and proposes shapes accordingly.',
          } satisfies TooltipContent)
          c.setQueryData(
            ['help-content', FOUNDING_CIRCLE_KEY, 'tooltip', 'all'],
            {
              surfaceKey: FOUNDING_CIRCLE_KEY,
              persona: 'all',
              contentType: 'tooltip',
              eyebrow: 'PATINA CONCEPT',
              body:
                'Founding Circle designers helped shape Patina’s first release and unlock early access to new tools.',
            } satisfies TooltipContent,
          )
          return c
        })()}
      >
        <Tooltip.Provider delayDuration={200} skipDelayDuration={100}>
          <div
            style={{
              padding: 32,
              maxWidth: 480,
              display: 'grid',
              gap: 24,
              fontFamily: 'var(--font-inter, Inter, sans-serif)',
            }}
          >
            <header style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <h2
                style={{
                  fontFamily: 'var(--font-playfair, "Playfair Display", serif)',
                  fontSize: '1.5rem',
                  fontWeight: 500,
                  margin: 0,
                  color: 'var(--ch, #2c2926)',
                }}
              >
                The Aesthete Engine
              </h2>
              <StoryFn />
            </header>
            <p
              style={{
                fontSize: 14,
                margin: 0,
                color: 'var(--ao, #6b6760)',
                lineHeight: 1.5,
              }}
            >
              Your Aesthete Score sharpens with every project. Hover the
              glyph next to the heading to read the explainer.
            </p>

            <header style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <h3
                style={{
                  fontFamily: 'var(--font-playfair, "Playfair Display", serif)',
                  fontSize: '1.1rem',
                  fontWeight: 500,
                  margin: 0,
                  color: 'var(--ch, #2c2926)',
                }}
              >
                Founding Circle
              </h3>
              <StrataInfoIcon surfaceKey={FOUNDING_CIRCLE_KEY} />
            </header>
            <p
              style={{
                fontSize: 14,
                margin: 0,
                color: 'var(--ao, #6b6760)',
                lineHeight: 1.5,
              }}
            >
              You’re part of the Founding Circle — your account ships with early
              access to new tools. Hover the glyph for context.
            </p>
          </div>
        </Tooltip.Provider>
      </QueryClientProvider>
    ),
  ],
}
