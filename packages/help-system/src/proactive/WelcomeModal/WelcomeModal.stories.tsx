import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query'
import { WelcomeModal } from './WelcomeModal'
import type { Persona, WelcomeModalContent } from '../../contentTypes'

// ─── Mock the Sanity client at the module level for Storybook ─────────────────
//
// Storybook doesn't run inside vitest so we can't use vi.mock here. Instead we
// monkey-patch the underlying Sanity client module before each story renders by
// swapping in a fake client whose fetch returns canned welcomeModalContent.

import * as sanityClientModule from '../../sanityClient'

function installFakeSanityClient(content: WelcomeModalContent | null): void {
  const original = sanityClientModule.getSanityClient
  ;(sanityClientModule as { getSanityClient: typeof original }).getSanityClient = (() => ({
    fetch: async () => content,
  })) as unknown as typeof original
}

// ─── Storybook meta ───────────────────────────────────────────────────────────

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, gcTime: 0 } },
})

function QueryReset() {
  // Invalidate help-content queries between stories so swapped Sanity content
  // shows up immediately.
  const qc = useQueryClient()
  React.useEffect(() => {
    qc.removeQueries({ queryKey: ['help-content'] })
  }, [qc])
  return null
}

const meta = {
  title: 'help-system/Proactive/WelcomeModal',
  component: WelcomeModal,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Layer 3 (Proactive) first-signin welcome dialog. The one moment a modal is allowed ' +
          'in the system — shown only on first sign-in, dismissable via two CTAs, Escape, or backdrop. ' +
          'Content is persona-aware (designer / consumer / maker / admin) via Sanity; consumers wire ' +
          'the first-signin detection (usually a `user.created_at` check) and trigger the open state.',
      },
    },
  },
  decorators: [
    (Story) => (
      <QueryClientProvider client={queryClient}>
        <QueryReset />
        <div
          style={{
            minHeight: 480,
            padding: 24,
            background: 'var(--surface-2, #f8f7f5)',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          <Story />
        </div>
      </QueryClientProvider>
    ),
  ],
} satisfies Meta<typeof WelcomeModal>

export default meta
type Story = StoryObj<typeof meta>

// ─── Fixture builder ──────────────────────────────────────────────────────────

function makeContent(persona: Persona, title: string, body: string): WelcomeModalContent {
  return {
    surfaceKey: `${persona === 'consumer' ? 'consumer-app' : 'designer-portal'}/welcome`,
    persona,
    contentType: 'welcomeModal',
    title,
    body,
    primaryCtaLabel: 'Take the tour',
    secondaryCtaLabel: 'Jump in',
  }
}

// ─── Reusable launcher button for stories ─────────────────────────────────────

function StoryShell(props: {
  surfaceKey: string
  persona: Persona
  content: WelcomeModalContent | null
  fallbackTitle?: string
  fallbackBody?: string
}) {
  React.useMemo(() => installFakeSanityClient(props.content), [props.content])
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          alignSelf: 'flex-start',
          padding: '10px 18px',
          borderRadius: 6,
          border: '1px solid #d4d4d8',
          background: 'white',
          cursor: 'pointer',
          fontWeight: 500,
        }}
      >
        Simulate first sign-in
      </button>
      <p style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#71717a' }}>
        persona = <strong>{props.persona}</strong> · surfaceKey = <code>{props.surfaceKey}</code>
      </p>
      <WelcomeModal
        surfaceKey={props.surfaceKey}
        persona={props.persona}
        open={open}
        onOpenChange={setOpen}
        fallbackTitle={props.fallbackTitle}
        fallbackBody={props.fallbackBody}
        onStartTour={() => {
          // eslint-disable-next-line no-console
          console.log('[story] onStartTour fired')
        }}
        onSkip={() => {
          // eslint-disable-next-line no-console
          console.log('[story] onSkip fired')
        }}
      />
    </>
  )
}

// ─── Stories ──────────────────────────────────────────────────────────────────

export const Default: Story = {
  name: 'Designer (default persona)',
  render: () => (
    <StoryShell
      persona="designer"
      surfaceKey="designer-portal/welcome"
      content={makeContent(
        'designer',
        'Welcome to Patina',
        'Your studio for orchestrating projects, vendors, and clients. ' +
          'Want a quick tour of the pipeline?',
      )}
    />
  ),
}

export const Consumer: Story = {
  name: 'Consumer persona',
  render: () => (
    <StoryShell
      persona="consumer"
      surfaceKey="consumer-app/welcome"
      content={makeContent(
        'consumer',
        'Welcome home',
        'Patina helps you find a designer, scan your space, and bring your home to life. ' +
          'Want a tour before you scan your first room?',
      )}
    />
  ),
}

export const Maker: Story = {
  name: 'Maker / manufacturer persona',
  render: () => (
    <StoryShell
      persona="maker"
      surfaceKey="maker-portal/welcome"
      content={makeContent(
        'maker',
        'Welcome to your workshop',
        'Manage orders, sync your catalog, and ship product directly to clients. ' +
          'Take the tour to see how orders land in your queue.',
      )}
    />
  ),
}

export const Admin: Story = {
  name: 'Admin persona',
  render: () => (
    <StoryShell
      persona="admin"
      surfaceKey="admin-portal/welcome"
      content={makeContent(
        'admin',
        'Welcome to Patina admin',
        'You have the keys: users, products, orders, payouts. ' +
          'Take a quick tour of the operational controls.',
      )}
    />
  ),
}

export const NoContent: Story = {
  name: 'No CMS content (fallback)',
  render: () => (
    <StoryShell
      persona="designer"
      surfaceKey="designer-portal/welcome"
      content={null}
      fallbackTitle="Welcome aboard"
      fallbackBody="Take a brief tour to see how everything fits together, or jump in and explore on your own."
    />
  ),
}

export const ReducedMotion: Story = {
  name: 'Reduced motion (prefers-reduced-motion: reduce)',
  parameters: {
    docs: {
      description: {
        story:
          'When the user has `prefers-reduced-motion: reduce` set, the modal skips its fade + ' +
          'zoom transitions via the motion-reduce: utility classes on both overlay and content.',
      },
    },
  },
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#71717a' }}>
        Toggle the OS-level &ldquo;Reduce motion&rdquo; setting (System Settings →
        Accessibility on macOS) and re-open the modal — the fade/zoom should not run.
      </p>
      <StoryShell
        persona="designer"
        surfaceKey="designer-portal/welcome"
        content={makeContent(
          'designer',
          'Welcome to Patina',
          'Your studio for orchestrating projects, vendors, and clients. ' +
            'Want a quick tour of the pipeline?',
        )}
      />
    </div>
  ),
}
