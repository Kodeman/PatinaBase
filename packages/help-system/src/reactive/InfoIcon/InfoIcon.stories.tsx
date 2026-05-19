import type { Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as RadixTooltip from '@radix-ui/react-tooltip'
import { InfoIcon } from './InfoIcon'
import type { TooltipContent } from '../../contentTypes'

// ─── Mocking strategy ─────────────────────────────────────────────────────────
//
// `useHelpContent` is a thin TanStack-Query wrapper around a Sanity fetch. To
// avoid a live Sanity round-trip in Storybook, each story pre-seeds the
// TanStack Query cache with a fixture under the exact queryKey the hook reads:
//
//   ['help-content', surfaceKey, 'tooltip', 'all']
//
// The hook's `queryFn` is never called because the cache hit is fresh.
//
// All stories also wrap in a Radix Tooltip.Provider — the canonical C1 Tooltip
// wrapper (built in parallel) will handle this automatically once integrated.
// ──────────────────────────────────────────────────────────────────────────────

const STORY_SURFACE_KEY = 'designer-portal/aesthete/score-meaning'

interface SeededClientArgs {
  /** If undefined → leave cache empty so the hook resolves null (CMS-miss). */
  seed?: TooltipContent | null
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
    ['help-content', STORY_SURFACE_KEY, 'tooltip', 'all'],
    seed ?? null,
  )
  return client
}

const meta: Meta<typeof InfoIcon> = {
  title: 'help-system/reactive/InfoIcon',
  component: InfoIcon,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Reactive-layer affordance (spec §4.2) — a 14px "?" glyph that opens a Sanity-backed tooltip on hover or focus. ' +
          'Use for general questions ("what does this number mean?"). For Patina-specific concepts (Aesthete, FF&E stages), ' +
          'use `<StrataInfoIcon />` instead.',
      },
    },
  },
  argTypes: {
    surfaceKey: { control: 'text' },
    size: { control: { type: 'number', min: 10, max: 24 } },
    className: { control: 'text' },
    fallback: { control: 'text' },
    ariaLabel: { control: 'text' },
  },
}

export default meta
type Story = StoryObj<typeof InfoIcon>

// ─── Helper: surrounding label + provider for visual context ───────────────────

const withLabelAndProvider = (
  StoryFn: () => React.ReactElement,
  client: QueryClient,
  defaultOpen?: boolean,
): React.ReactElement => (
  <QueryClientProvider client={client}>
    <RadixTooltip.Provider delayDuration={0} skipDelayDuration={0}>
      <span
        style={{
          fontFamily: 'var(--font-inter, Inter, sans-serif)',
          fontSize: '0.85rem',
          color: 'var(--ao, #6b6760)',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        Aesthete Score
        {/* When defaultOpen is set, the story is forced visible by parking it
            inside a controlled wrapper. The InfoIcon itself uses Radix's
            internal state — for the "Hovered" story we leverage a separate
            wrapped Tooltip primitive. */}
        {defaultOpen ? (
          <ForcedOpenInfoIcon />
        ) : (
          <StoryFn />
        )}
      </span>
    </RadixTooltip.Provider>
  </QueryClientProvider>
)

/**
 * Variant of InfoIcon that pins the tooltip open for documentation/screenshots.
 * Internally it duplicates the rendered popover with `defaultOpen` so the
 * popover is always visible. This keeps the actual `InfoIcon` API ungimmicked.
 */
function ForcedOpenInfoIcon() {
  return (
    <RadixTooltip.Root defaultOpen>
      <RadixTooltip.Trigger asChild>
        <button
          type="button"
          aria-label="More information"
          style={{
            width: 14,
            height: 14,
            padding: 0,
            background: 'transparent',
            border: '1px solid var(--pe, #e7e1d4)',
            borderRadius: '999px',
            color: 'var(--ao, #6b6760)',
            cursor: 'help',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 10,
            lineHeight: 1,
          }}
        >
          ?
        </button>
      </RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          sideOffset={6}
          style={{
            maxWidth: 240,
            fontSize: 14,
            lineHeight: 1.4,
            background: 'var(--ch, #2C2926)',
            color: 'var(--ow, #F7F4ED)',
            padding: '0.55rem 0.75rem',
            borderRadius: 5,
            boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
          }}
        >
          Composite of room scores for designers you follow most.
          <RadixTooltip.Arrow style={{ fill: 'var(--ch, #2C2926)' }} width={10} height={5} />
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  )
}

// ─── Stories ──────────────────────────────────────────────────────────────────

/**
 * Sanity returns content → glyph + tooltip on hover or focus.
 * The popover is hidden by default; hover or focus the glyph to see it.
 */
export const Default: Story = {
  args: {
    surfaceKey: STORY_SURFACE_KEY,
  },
  decorators: [
    (StoryFn) =>
      withLabelAndProvider(
        StoryFn,
        makeClient({
          seed: {
            surfaceKey: STORY_SURFACE_KEY,
            persona: 'all',
            contentType: 'tooltip',
            body: 'Composite of room scores for designers you follow most.',
          },
        }),
      ),
  ],
}

/**
 * Tooltip forced-open for documentation purposes.
 *
 * In real usage the tooltip opens on hover (after 200ms) or focus. This story
 * pins it open so you can review the popover's visual treatment without
 * needing to drive an interaction.
 */
export const Hovered: Story = {
  args: {
    surfaceKey: STORY_SURFACE_KEY,
  },
  decorators: [
    (StoryFn) =>
      withLabelAndProvider(
        StoryFn,
        makeClient({
          seed: {
            surfaceKey: STORY_SURFACE_KEY,
            persona: 'all',
            contentType: 'tooltip',
            body: 'Composite of room scores for designers you follow most.',
          },
        }),
        true, // defaultOpen
      ),
  ],
}

/**
 * Keyboard a11y: focusing the trigger (Tab → glyph) opens the tooltip.
 * This story auto-focuses the glyph so you can review the keyboard path
 * without driving the keyboard yourself.
 */
export const Focused: Story = {
  args: {
    surfaceKey: STORY_SURFACE_KEY,
  },
  decorators: [
    (StoryFn) => {
      const client = makeClient({
        seed: {
          surfaceKey: STORY_SURFACE_KEY,
          persona: 'all',
          contentType: 'tooltip',
          body: 'Press Tab to focus the icon — the tooltip opens via keyboard too.',
        },
      })
      // Find and focus the trigger button after mount.
      setTimeout(() => {
        const btn = document.querySelector<HTMLButtonElement>(
          'button[aria-label="More information"]',
        )
        btn?.focus()
      }, 50)
      return withLabelAndProvider(StoryFn, client)
    },
  ],
}

/**
 * CMS returns null and no fallback prop → the glyph still renders, but
 * without a tooltip wrapper (silent absence per spec §13.4). The icon
 * remains as a stable visual affordance so layouts don't reflow when
 * content arrives or disappears.
 */
export const NoContent: Story = {
  args: {
    surfaceKey: STORY_SURFACE_KEY,
  },
  decorators: [
    (StoryFn) => withLabelAndProvider(StoryFn, makeClient({ seed: null })),
  ],
}

/**
 * Custom 18px size — still circular, still centered, still keyboard-focusable.
 * Sizes outside the spec-recommended 12/14/16 range are allowed but should be
 * rare. Default and recommended is 14.
 */
export const CustomSize: Story = {
  args: {
    surfaceKey: STORY_SURFACE_KEY,
    size: 18,
  },
  decorators: [
    (StoryFn) =>
      withLabelAndProvider(
        StoryFn,
        makeClient({
          seed: {
            surfaceKey: STORY_SURFACE_KEY,
            persona: 'all',
            contentType: 'tooltip',
            body: 'Larger glyph for higher-density section headings.',
          },
        }),
      ),
  ],
}
