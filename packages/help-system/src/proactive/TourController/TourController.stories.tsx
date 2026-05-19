import { useEffect, useRef, useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TourController, type CoachmarkStep } from './TourController'
import {
  clearTourState,
  setTourState,
} from './tourState'
import type { CoachmarkContent } from '../../contentTypes'

// ─── Mocking strategy ─────────────────────────────────────────────────────────
//
// Like the Reactive stories, each story pre-seeds the TanStack Query cache
// under the queryKey `useHelpContent` reads, so no Sanity round-trip
// happens. We additionally seed (or clear) localStorage via the public
// `tourState` helpers so completed/abandoned cases reproduce the on-mount
// idempotency behavior.
// ──────────────────────────────────────────────────────────────────────────────

const TOUR_ID = 'first-project-walkthrough'

const STEPS: CoachmarkStep[] = [
  {
    surfaceKey: `${TOUR_ID}/step-1`,
    anchorSelector: '#story-anchor-1',
    side: 'bottom',
  },
  {
    surfaceKey: `${TOUR_ID}/step-2`,
    anchorSelector: '#story-anchor-2',
    side: 'bottom',
  },
  {
    surfaceKey: `${TOUR_ID}/step-3`,
    anchorSelector: '#story-anchor-3',
    side: 'top',
  },
]

const COACHMARK_FIXTURES: CoachmarkContent[] = [
  {
    surfaceKey: STEPS[0].surfaceKey,
    persona: 'all',
    contentType: 'coachmark',
    heading: 'Create your first project',
    body: 'Click here to start a new project room — every furnishing flow begins with a project.',
    ctaLabel: 'Next',
  },
  {
    surfaceKey: STEPS[1].surfaceKey,
    persona: 'all',
    contentType: 'coachmark',
    heading: 'Add rooms inside the project',
    body: 'A project can have several rooms. Add them one at a time as your scope solidifies.',
    ctaLabel: 'Got it',
  },
  {
    surfaceKey: STEPS[2].surfaceKey,
    persona: 'all',
    contentType: 'coachmark',
    heading: 'Invite collaborators',
    body: 'When you are ready, invite makers and clients — they will see only what you share.',
    ctaLabel: 'Done',
  },
]

function makeClient(): QueryClient {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
    },
  })
  for (const fixture of COACHMARK_FIXTURES) {
    client.setQueryData(
      ['help-content', fixture.surfaceKey, 'coachmark', 'all'],
      fixture,
    )
  }
  return client
}

// Demo "page" markup with three anchor targets the tour will spotlight.
function DemoPage({ onActivity }: { onActivity?: (msg: string) => void }) {
  return (
    <div
      style={{
        fontFamily: 'var(--font-inter, Inter, sans-serif)',
        background: 'var(--off-white, #f5f1e8)',
        color: 'var(--charcoal, #1f1d1a)',
        padding: 24,
        borderRadius: 8,
        minHeight: 320,
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
        maxWidth: 640,
      }}
    >
      <header style={{ display: 'flex', justifyContent: 'space-between' }}>
        <div style={{ fontSize: '0.65rem', letterSpacing: '0.1em', opacity: 0.6 }}>
          DEMO · TOUR CONTROLLER
        </div>
        <button
          id="story-anchor-3"
          type="button"
          onClick={() => onActivity?.('Invited collaborators')}
          style={{
            border: '1px solid var(--charcoal, #1f1d1a)',
            background: 'transparent',
            padding: '4px 8px',
            borderRadius: 4,
            fontSize: '0.75rem',
            cursor: 'pointer',
          }}
        >
          Invite
        </button>
      </header>
      <main style={{ display: 'flex', gap: 16 }}>
        <button
          id="story-anchor-1"
          type="button"
          onClick={() => onActivity?.('Created a project')}
          style={{
            background: 'var(--charcoal, #1f1d1a)',
            color: 'var(--off-white, #f5f1e8)',
            border: 'none',
            padding: '12px 16px',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: '0.85rem',
          }}
        >
          + New project
        </button>
        <button
          id="story-anchor-2"
          type="button"
          onClick={() => onActivity?.('Added a room')}
          style={{
            border: '1px solid var(--charcoal, #1f1d1a)',
            background: 'transparent',
            color: 'var(--charcoal, #1f1d1a)',
            padding: '12px 16px',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: '0.85rem',
          }}
        >
          + Add room
        </button>
      </main>
      <footer style={{ fontSize: '0.7rem', opacity: 0.55, lineHeight: 1.5 }}>
        The three anchored buttons above are the spotlight targets for the tour.
        The host page stays interactive — coachmarks are informational, not modal
        (spec §4.7 rule 6).
      </footer>
    </div>
  )
}

const meta: Meta<typeof TourController> = {
  title: 'help-system/proactive/TourController',
  component: TourController,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Proactive-layer multi-step coachmark orchestrator (spec §4.7). ' +
          'Renders an inline Radix Popover for each step in v1; will adopt ' +
          'the canonical <Coachmark /> wrapper after D1 ships (TODO marker ' +
          'in TourController.tsx). Persistence is localStorage in Sprint 3 ' +
          'and will move to Supabase user_profiles.help_state in Sprint 4 ' +
          'per spec §4.7 rule 1.',
      },
    },
  },
}

export default meta
type Story = StoryObj<typeof TourController>

// ─── Stories ──────────────────────────────────────────────────────────────────

/**
 * 3-step demo — start the tour with the "Start tour" button. Each step opens
 * a popover anchored to one of the demo anchors.
 */
export const WithFakeSteps: Story = {
  decorators: [
    (StoryFn) => {
      // Clear any persistence carry-over from a previous run of this story.
      useEffect(() => {
        clearTourState(`${TOUR_ID}-with-fake-steps`)
        return () => clearTourState(`${TOUR_ID}-with-fake-steps`)
      }, [])
      return (
        <QueryClientProvider client={makeClient()}>
          <div style={{ padding: 40 }}>
            <StoryFn />
          </div>
        </QueryClientProvider>
      )
    },
  ],
  render: () => <WithFakeStepsRender />,
}

function WithFakeStepsRender() {
  const [log, setLog] = useState<string[]>([])
  return (
    <TourController
      tourId={`${TOUR_ID}-with-fake-steps`}
      steps={STEPS}
      onComplete={() => setLog((l) => [...l, 'completed'])}
      onAbandon={(at) => setLog((l) => [...l, `abandoned at ${at}`])}
    >
      {(api) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <DemoPage onActivity={(msg) => setLog((l) => [...l, msg])} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={api.start}
              disabled={api.isActive}
              style={{
                background: 'var(--charcoal, #1f1d1a)',
                color: 'var(--off-white, #f5f1e8)',
                padding: '6px 12px',
                borderRadius: 4,
                border: 'none',
                opacity: api.isActive ? 0.5 : 1,
                cursor: api.isActive ? 'not-allowed' : 'pointer',
                fontSize: '0.75rem',
              }}
            >
              Start tour
            </button>
            <div style={{ alignSelf: 'center', fontSize: '0.7rem', opacity: 0.6 }}>
              Step {api.currentStep + 1} of {api.totalSteps} ·{' '}
              {api.isActive ? 'active' : 'idle'}
            </div>
          </div>
          <api.CoachmarkSlot />
          {log.length > 0 ? (
            <ul
              style={{
                fontSize: '0.7rem',
                opacity: 0.7,
                listStyle: 'square',
                paddingLeft: 18,
              }}
            >
              {log.map((entry, i) => (
                <li key={i}>{entry}</li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </TourController>
  )
}

/**
 * Resumed — `startAt={1}` skips the first step. Useful for "resume where
 * you left off" wiring in Sprint 4.
 */
export const Resumed: Story = {
  decorators: [
    (StoryFn) => {
      useEffect(() => {
        clearTourState(`${TOUR_ID}-resumed`)
        return () => clearTourState(`${TOUR_ID}-resumed`)
      }, [])
      return (
        <QueryClientProvider client={makeClient()}>
          <div style={{ padding: 40 }}>
            <StoryFn />
          </div>
        </QueryClientProvider>
      )
    },
  ],
  render: () => <ResumedRender />,
}

function ResumedRender() {
  return (
    <TourController
      tourId={`${TOUR_ID}-resumed`}
      steps={STEPS}
      startAt={1}
    >
      {(api) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <DemoPage />
          <button
            type="button"
            onClick={api.start}
            disabled={api.isActive}
            style={{
              alignSelf: 'flex-start',
              background: 'var(--charcoal, #1f1d1a)',
              color: 'var(--off-white, #f5f1e8)',
              padding: '6px 12px',
              borderRadius: 4,
              border: 'none',
              fontSize: '0.75rem',
              cursor: api.isActive ? 'not-allowed' : 'pointer',
              opacity: api.isActive ? 0.5 : 1,
            }}
          >
            Start at step 2
          </button>
          <api.CoachmarkSlot />
        </div>
      )}
    </TourController>
  )
}

/**
 * Completed — persistence pre-seeded with `completed: true`. The tour MUST
 * remain idle and ignore start() calls (spec §4.7 rule 1).
 */
export const Completed: Story = {
  decorators: [
    (StoryFn) => {
      useEffect(() => {
        setTourState(`${TOUR_ID}-completed-state`, {
          completed: true,
          completedAt: '2026-05-19T00:00:00.000Z',
        })
        return () => clearTourState(`${TOUR_ID}-completed-state`)
      }, [])
      return (
        <QueryClientProvider client={makeClient()}>
          <div style={{ padding: 40 }}>
            <StoryFn />
          </div>
        </QueryClientProvider>
      )
    },
  ],
  render: () => <CompletedRender />,
}

function CompletedRender() {
  const startAttempts = useRef(0)
  return (
    <TourController tourId={`${TOUR_ID}-completed-state`} steps={STEPS}>
      {(api) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <DemoPage />
          <div
            style={{
              fontSize: '0.75rem',
              padding: 12,
              border: '1px dashed var(--pe, #e7e1d4)',
              borderRadius: 4,
              maxWidth: 480,
              lineHeight: 1.5,
            }}
          >
            Persisted state: <code>completed: true</code>. Calling{' '}
            <code>start()</code> is a no-op (it has been attempted{' '}
            <strong>{startAttempts.current}</strong> times during this render).
            isActive ={' '}
            <strong>{api.isActive ? 'on' : 'off (correct)'}</strong>
          </div>
          <button
            type="button"
            onClick={() => {
              startAttempts.current += 1
              api.start()
            }}
            style={{
              alignSelf: 'flex-start',
              background: 'var(--charcoal, #1f1d1a)',
              color: 'var(--off-white, #f5f1e8)',
              padding: '6px 12px',
              borderRadius: 4,
              border: 'none',
              fontSize: '0.75rem',
              cursor: 'pointer',
            }}
          >
            Attempt start (should be ignored)
          </button>
          <api.CoachmarkSlot />
        </div>
      )}
    </TourController>
  )
}

/**
 * Abandoned — persistence pre-seeded with `abandoned: true` (atStep: 1). Same
 * idempotency rule: the tour will not auto-start or honor manual start().
 */
export const Abandoned: Story = {
  decorators: [
    (StoryFn) => {
      useEffect(() => {
        setTourState(`${TOUR_ID}-abandoned-state`, {
          abandoned: true,
          atStep: 1,
          abandonedAt: '2026-05-19T00:00:00.000Z',
        })
        return () => clearTourState(`${TOUR_ID}-abandoned-state`)
      }, [])
      return (
        <QueryClientProvider client={makeClient()}>
          <div style={{ padding: 40 }}>
            <StoryFn />
          </div>
        </QueryClientProvider>
      )
    },
  ],
  render: () => <AbandonedRender />,
}

function AbandonedRender() {
  return (
    <TourController tourId={`${TOUR_ID}-abandoned-state`} steps={STEPS}>
      {(api) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <DemoPage />
          <div
            style={{
              fontSize: '0.75rem',
              padding: 12,
              border: '1px dashed var(--pe, #e7e1d4)',
              borderRadius: 4,
              maxWidth: 480,
              lineHeight: 1.5,
            }}
          >
            Persisted state: <code>abandoned: true, atStep: 1</code>. The tour
            stays idle. Re-triggering happens via the future{' '}
            <em>"Show me around again"</em> Profile affordance, which calls{' '}
            <code>clearTourState(tourKey)</code> before re-mounting this
            controller.
            <br />
            isActive ={' '}
            <strong>{api.isActive ? 'on' : 'off (correct)'}</strong>
          </div>
          <api.CoachmarkSlot />
        </div>
      )}
    </TourController>
  )
}
