/**
 * <TourController /> — unit tests (Sprint 3 / Task D2).
 *
 * Covers the contract from spec §4.7:
 *   • start() fires help.tour.started and flips isActive
 *   • next() advances + fires help.tour.step_advanced
 *   • prev() retreats with NO analytics event
 *   • skip() fires help.tour.abandoned, persists, calls onAbandon
 *   • complete() fires help.tour.completed, persists, calls onComplete
 *   • Idempotent: a tour that was completed or abandoned doesn't auto-start
 *   • beforeShow is awaited before the popover opens
 *   • Anchor resolution via ref + selector both work
 *   • Reduced-motion path doesn't crash
 *   • Keyboard: Escape skips, Enter advances / completes
 *
 * Sanity (useHelpContent) is mocked at the module level so we never touch
 * the network. Persistence is exercised via the in-test adapter so each
 * case is hermetic.
 */
import React, { useRef, type RefObject } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import {
  TourController,
  __setTourStateAdapterForTests,
  __resetTourStateAdapterForTests,
  type CoachmarkStep,
  type TourControllerAPI,
} from './TourController'
import type { TourState } from './tourState'
import type { CoachmarkContent } from '../../contentTypes'

// ─── Mock the Sanity client (used by useHelpContent) ──────────────────────────

const mockFetch = vi.fn()
vi.mock('../../sanityClient', () => ({
  getSanityClient: () => ({ fetch: mockFetch }),
  _resetSanityClient: vi.fn(),
}))

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  })
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return { Wrapper, queryClient }
}

async function flushQueries() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0))
    await new Promise((r) => setTimeout(r, 0))
  })
}

interface InMemoryAdapter {
  store: Map<string, TourState>
  getTourState: (k: string) => TourState
  setTourState: (k: string, p: TourState) => void
  clearTourState: (k: string) => void
}

function makeInMemoryAdapter(seed: Record<string, TourState> = {}): InMemoryAdapter {
  const store = new Map<string, TourState>(Object.entries(seed))
  return {
    store,
    getTourState: (k) => store.get(k) ?? {},
    setTourState: (k, p) => {
      const prev = store.get(k) ?? {}
      store.set(k, { ...prev, ...p })
    },
    // Network-style backend clear — mirrors the Supabase adapter's
    // `clearTourState`, so a test can assert `restart()` drops the record from
    // the authoritative store, not just the localStorage fallback.
    clearTourState: (k) => {
      store.delete(k)
    },
  }
}

const COACHMARK_FIXTURE: CoachmarkContent = {
  surfaceKey: 'first-project-walkthrough/step-1',
  persona: 'all',
  contentType: 'coachmark',
  heading: 'Create your first project',
  body: 'Tap here to start a new project room.',
  ctaLabel: 'Got it',
}

const STEPS: CoachmarkStep[] = [
  { surfaceKey: 'first-project-walkthrough/step-1' },
  { surfaceKey: 'first-project-walkthrough/step-2' },
  { surfaceKey: 'first-project-walkthrough/step-3' },
]

// ─── Test setup ───────────────────────────────────────────────────────────────

describe('<TourController />', () => {
  let captureSpy: ReturnType<typeof vi.fn>
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>
  let adapter: InMemoryAdapter

  beforeEach(() => {
    vi.clearAllMocks()
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    captureSpy = vi.fn()
    ;(window as unknown as { posthog?: { capture: typeof captureSpy } }).posthog = {
      capture: captureSpy,
    }
    adapter = makeInMemoryAdapter()
    __setTourStateAdapterForTests({
      getTourState: adapter.getTourState,
      setTourState: adapter.setTourState,
      clearTourState: adapter.clearTourState,
    })
    // Default CMS: every coachmark resolves to the fixture so the popover is
    // free to open. Individual tests override per-call when they need to.
    mockFetch.mockResolvedValue(COACHMARK_FIXTURE)
  })

  afterEach(() => {
    consoleWarnSpy.mockRestore()
    delete (window as unknown as { posthog?: unknown }).posthog
    __resetTourStateAdapterForTests()
  })

  // ── 1. start() → isActive + analytics ────────────────────────────────────

  it('start() activates the tour and fires help.tour.started', async () => {
    const { Wrapper } = makeWrapper()
    let api: TourControllerAPI | null = null
    render(
      <Wrapper>
        <TourController tourId="walkthrough" steps={STEPS}>
          {(a) => {
            api = a
            return <div data-testid="active">{a.isActive ? 'on' : 'off'}</div>
          }}
        </TourController>
      </Wrapper>,
    )

    expect(screen.getByTestId('active')).toHaveTextContent('off')
    expect(api).not.toBeNull()

    act(() => api!.start())
    await flushQueries()

    expect(screen.getByTestId('active')).toHaveTextContent('on')
    expect(captureSpy).toHaveBeenCalledWith('help.tour.started', {
      tour_key: 'walkthrough',
      total_steps: 3,
    })
  })

  // ── 2. next() advances + analytics ───────────────────────────────────────

  it('next() advances the step pointer and fires help.tour.step_advanced', async () => {
    const { Wrapper } = makeWrapper()
    let api: TourControllerAPI | null = null
    render(
      <Wrapper>
        <TourController tourId="walkthrough" steps={STEPS}>
          {(a) => {
            api = a
            return <div data-testid="cur">{a.currentStep}</div>
          }}
        </TourController>
      </Wrapper>,
    )

    act(() => api!.start())
    await flushQueries()
    captureSpy.mockClear()

    act(() => api!.next())
    await flushQueries()

    expect(screen.getByTestId('cur')).toHaveTextContent('1')
    expect(captureSpy).toHaveBeenCalledWith('help.tour.step_advanced', {
      tour_key: 'walkthrough',
      step_number: 1,
      step_surface_key: STEPS[1]!.surfaceKey,
    })
  })

  it('next() at the final step is a no-op (does not over-advance or emit)', async () => {
    const { Wrapper } = makeWrapper()
    let api: TourControllerAPI | null = null
    render(
      <Wrapper>
        <TourController tourId="walkthrough" steps={STEPS} startAt={2}>
          {(a) => {
            api = a
            return <div data-testid="cur">{a.currentStep}</div>
          }}
        </TourController>
      </Wrapper>,
    )

    act(() => api!.start())
    await flushQueries()
    captureSpy.mockClear()

    act(() => api!.next())
    await flushQueries()

    expect(screen.getByTestId('cur')).toHaveTextContent('2')
    expect(
      captureSpy.mock.calls.some(([e]) => e === 'help.tour.step_advanced'),
    ).toBe(false)
  })

  // ── 3. prev() retreats with NO analytics ─────────────────────────────────

  it('prev() retreats the step pointer and does NOT fire an analytics event', async () => {
    const { Wrapper } = makeWrapper()
    let api: TourControllerAPI | null = null
    render(
      <Wrapper>
        <TourController tourId="walkthrough" steps={STEPS} startAt={1}>
          {(a) => {
            api = a
            return <div data-testid="cur">{a.currentStep}</div>
          }}
        </TourController>
      </Wrapper>,
    )

    act(() => api!.start())
    await flushQueries()
    captureSpy.mockClear()

    act(() => api!.prev())
    await flushQueries()

    expect(screen.getByTestId('cur')).toHaveTextContent('0')
    expect(captureSpy).not.toHaveBeenCalled()
  })

  it('prev() at step 0 is a no-op', async () => {
    const { Wrapper } = makeWrapper()
    let api: TourControllerAPI | null = null
    render(
      <Wrapper>
        <TourController tourId="walkthrough" steps={STEPS}>
          {(a) => {
            api = a
            return <div data-testid="cur">{a.currentStep}</div>
          }}
        </TourController>
      </Wrapper>,
    )

    act(() => api!.start())
    await flushQueries()
    act(() => api!.prev())
    await flushQueries()
    expect(screen.getByTestId('cur')).toHaveTextContent('0')
  })

  // ── 4. skip() — abandon event + persistence + callback ───────────────────

  it('skip() fires help.tour.abandoned, persists abandonment, calls onAbandon', async () => {
    const onAbandon = vi.fn()
    const { Wrapper } = makeWrapper()
    let api: TourControllerAPI | null = null
    render(
      <Wrapper>
        <TourController
          tourId="walkthrough"
          steps={STEPS}
          onAbandon={onAbandon}
          startAt={1}
        >
          {(a) => {
            api = a
            return null
          }}
        </TourController>
      </Wrapper>,
    )

    act(() => api!.start())
    await flushQueries()
    captureSpy.mockClear()

    act(() => api!.skip())
    await flushQueries()

    expect(captureSpy).toHaveBeenCalledWith('help.tour.abandoned', {
      tour_key: 'walkthrough',
      at_step: 1,
      total_steps: 3,
    })
    const persisted = adapter.store.get('walkthrough')
    expect(persisted?.abandoned).toBe(true)
    expect(persisted?.atStep).toBe(1)
    expect(typeof persisted?.abandonedAt).toBe('string')
    expect(onAbandon).toHaveBeenCalledWith(1)
    expect(api!.isActive).toBe(false)
  })

  // ── 5. complete() — completion event + persistence + callback ────────────

  it('complete() fires help.tour.completed, persists completion, calls onComplete', async () => {
    const onComplete = vi.fn()
    const { Wrapper } = makeWrapper()
    let api: TourControllerAPI | null = null
    render(
      <Wrapper>
        <TourController
          tourId="walkthrough"
          steps={STEPS}
          onComplete={onComplete}
        >
          {(a) => {
            api = a
            return null
          }}
        </TourController>
      </Wrapper>,
    )

    act(() => api!.start())
    await flushQueries()
    act(() => api!.next())
    act(() => api!.next())
    await flushQueries()
    captureSpy.mockClear()

    act(() => api!.complete())
    await flushQueries()

    const completedCall = captureSpy.mock.calls.find(
      ([e]) => e === 'help.tour.completed',
    )
    expect(completedCall).toBeDefined()
    const [, props] = completedCall as [string, Record<string, unknown>]
    expect(props.tour_key).toBe('walkthrough')
    expect(typeof props.duration_ms).toBe('number')
    expect(props.duration_ms as number).toBeGreaterThanOrEqual(0)
    expect(props.steps_viewed).toBe(3)

    const persisted = adapter.store.get('walkthrough')
    expect(persisted?.completed).toBe(true)
    expect(typeof persisted?.completedAt).toBe('string')
    expect(onComplete).toHaveBeenCalled()
    expect(api!.isActive).toBe(false)
  })

  // ── 6. Idempotency — already completed / abandoned tours don't auto-start ─

  it('does not auto-start when persisted state has completed: true', async () => {
    adapter.store.set('walkthrough', {
      completed: true,
      completedAt: '2026-05-19T00:00:00Z',
    })

    const { Wrapper } = makeWrapper()
    let api: TourControllerAPI | null = null
    render(
      <Wrapper>
        <TourController tourId="walkthrough" steps={STEPS}>
          {(a) => {
            api = a
            return <div data-testid="active">{a.isActive ? 'on' : 'off'}</div>
          }}
        </TourController>
      </Wrapper>,
    )

    expect(screen.getByTestId('active')).toHaveTextContent('off')

    // Even an explicit start() must be ignored — spec §4.7 rule 1 is strict.
    act(() => api!.start())
    await flushQueries()
    expect(screen.getByTestId('active')).toHaveTextContent('off')
    expect(
      captureSpy.mock.calls.some(([e]) => e === 'help.tour.started'),
    ).toBe(false)
  })

  it('does not auto-start when persisted state has abandoned: true', async () => {
    adapter.store.set('walkthrough', {
      abandoned: true,
      atStep: 1,
      abandonedAt: '2026-05-19T00:00:00Z',
    })

    const { Wrapper } = makeWrapper()
    let api: TourControllerAPI | null = null
    render(
      <Wrapper>
        <TourController tourId="walkthrough" steps={STEPS}>
          {(a) => {
            api = a
            return <div data-testid="active">{a.isActive ? 'on' : 'off'}</div>
          }}
        </TourController>
      </Wrapper>,
    )

    expect(screen.getByTestId('active')).toHaveTextContent('off')
    act(() => api!.start())
    await flushQueries()
    expect(screen.getByTestId('active')).toHaveTextContent('off')
  })

  // ── 7. beforeShow is awaited before popover opens ────────────────────────

  it('awaits beforeShow before showing the step popover', async () => {
    let resolveBefore: (() => void) | null = null
    const beforeShow = vi.fn(
      () =>
        new Promise<void>((res) => {
          resolveBefore = res
        }),
    )
    const stepsWithHook: CoachmarkStep[] = [
      { surfaceKey: 'first-project-walkthrough/step-1', beforeShow },
      { surfaceKey: 'first-project-walkthrough/step-2' },
    ]

    const { Wrapper } = makeWrapper()
    let api: TourControllerAPI | null = null
    render(
      <Wrapper>
        <TourController tourId="walkthrough" steps={stepsWithHook}>
          {(a) => {
            api = a
            return <a.CoachmarkSlot />
          }}
        </TourController>
      </Wrapper>,
    )

    act(() => api!.start())
    await flushQueries()

    // beforeShow has been called but not yet resolved → popover content not present.
    expect(beforeShow).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).toBeNull()

    // Resolve beforeShow, allow queries + state to flush, then the popover appears.
    await act(async () => {
      resolveBefore!()
      await flushQueries()
    })

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('continues if beforeShow rejects (does not crash the tour)', async () => {
    const beforeShow = vi.fn(() => Promise.reject(new Error('whoops')))
    const stepsWithHook: CoachmarkStep[] = [
      { surfaceKey: 'first-project-walkthrough/step-1', beforeShow },
    ]

    const { Wrapper } = makeWrapper()
    let api: TourControllerAPI | null = null
    render(
      <Wrapper>
        <TourController tourId="walkthrough" steps={stepsWithHook}>
          {(a) => {
            api = a
            return <a.CoachmarkSlot />
          }}
        </TourController>
      </Wrapper>,
    )

    act(() => api!.start())
    await flushQueries()

    // The popover still resolves once the rejected promise settles.
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(consoleWarnSpy).toHaveBeenCalled()
  })

  // ── 8. Anchor resolution ─────────────────────────────────────────────────

  it('resolves anchor via anchorSelector when no ref is given', async () => {
    const stepsWithSelector: CoachmarkStep[] = [
      {
        surfaceKey: 'first-project-walkthrough/step-1',
        anchorSelector: '#anchor-target',
      },
    ]

    const { Wrapper } = makeWrapper()
    let api: TourControllerAPI | null = null
    render(
      <Wrapper>
        <div>
          <button id="anchor-target" type="button">
            Anchor
          </button>
          <TourController tourId="walkthrough" steps={stepsWithSelector}>
            {(a) => {
              api = a
              return <a.CoachmarkSlot />
            }}
          </TourController>
        </div>
      </Wrapper>,
    )

    act(() => api!.start())
    await flushQueries()

    // Popover opens against the resolved anchor — we just check it opens.
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('resolves anchor via anchorRef when provided', async () => {
    function Harness() {
      const ref = useRef<HTMLButtonElement>(null)
      const steps: CoachmarkStep[] = [
        {
          surfaceKey: 'first-project-walkthrough/step-1',
          anchorRef: ref as RefObject<HTMLElement>,
        },
      ]
      return (
        <div>
          <button ref={ref} type="button">
            Ref Anchor
          </button>
          <TourController tourId="walkthrough-ref" steps={steps}>
            {(a) => (
              <>
                <button type="button" data-testid="start" onClick={a.start}>
                  start
                </button>
                <a.CoachmarkSlot />
              </>
            )}
          </TourController>
        </div>
      )
    }

    const { Wrapper } = makeWrapper()
    const user = userEvent.setup()
    render(
      <Wrapper>
        <Harness />
      </Wrapper>,
    )

    await flushQueries()
    await user.click(screen.getByTestId('start'))
    await flushQueries()

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  // ── 9. Reduced motion ────────────────────────────────────────────────────

  it('does not crash when prefers-reduced-motion is set', async () => {
    // Override matchMedia just for this test.
    const original = window.matchMedia
    ;(window as unknown as { matchMedia: typeof window.matchMedia }).matchMedia = vi
      .fn()
      .mockImplementation((q: string) => ({
        matches: q.includes('reduce'),
        media: q,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))

    const { Wrapper } = makeWrapper()
    let api: TourControllerAPI | null = null
    render(
      <Wrapper>
        <TourController tourId="walkthrough" steps={STEPS}>
          {(a) => {
            api = a
            return <a.CoachmarkSlot />
          }}
        </TourController>
      </Wrapper>,
    )

    act(() => api!.start())
    await flushQueries()

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    ;(window as unknown as { matchMedia: typeof window.matchMedia }).matchMedia = original
  })

  // ── 10. Keyboard handlers ────────────────────────────────────────────────

  it('Escape key triggers skip + abandon event while active', async () => {
    const user = userEvent.setup()
    const { Wrapper } = makeWrapper()
    let api: TourControllerAPI | null = null
    render(
      <Wrapper>
        <TourController tourId="walkthrough" steps={STEPS}>
          {(a) => {
            api = a
            return <a.CoachmarkSlot />
          }}
        </TourController>
      </Wrapper>,
    )

    act(() => api!.start())
    await flushQueries()
    captureSpy.mockClear()

    await user.keyboard('{Escape}')
    await flushQueries()

    expect(
      captureSpy.mock.calls.some(([e]) => e === 'help.tour.abandoned'),
    ).toBe(true)
    expect(adapter.store.get('walkthrough')?.abandoned).toBe(true)
  })

  it('Enter key advances on non-final step, completes on final step', async () => {
    const user = userEvent.setup()
    const onComplete = vi.fn()
    const { Wrapper } = makeWrapper()
    let api: TourControllerAPI | null = null
    render(
      <Wrapper>
        <TourController tourId="walkthrough" steps={STEPS} onComplete={onComplete}>
          {(a) => {
            api = a
            return <a.CoachmarkSlot />
          }}
        </TourController>
      </Wrapper>,
    )

    act(() => api!.start())
    await flushQueries()
    captureSpy.mockClear()

    await user.keyboard('{Enter}')
    await flushQueries()
    expect(api!.currentStep).toBe(1)
    expect(
      captureSpy.mock.calls.some(([e]) => e === 'help.tour.step_advanced'),
    ).toBe(true)

    await user.keyboard('{Enter}')
    await flushQueries()
    expect(api!.currentStep).toBe(2)

    await user.keyboard('{Enter}')
    await flushQueries()
    expect(onComplete).toHaveBeenCalled()
    expect(adapter.store.get('walkthrough')?.completed).toBe(true)
  })

  // ── 11. Skip button on coachmark surface ─────────────────────────────────

  it('clicking the Skip tour button persists abandonment with the correct at_step', async () => {
    const user = userEvent.setup()
    const onAbandon = vi.fn()
    const { Wrapper } = makeWrapper()
    let api: TourControllerAPI | null = null
    render(
      <Wrapper>
        <TourController
          tourId="walkthrough"
          steps={STEPS}
          onAbandon={onAbandon}
        >
          {(a) => {
            api = a
            return <a.CoachmarkSlot />
          }}
        </TourController>
      </Wrapper>,
    )

    act(() => api!.start())
    await flushQueries()
    act(() => api!.next())
    await flushQueries()

    const skipButton = await screen.findByTestId('tour-skip')
    captureSpy.mockClear()
    await user.click(skipButton)
    await flushQueries()

    expect(captureSpy).toHaveBeenCalledWith(
      'help.tour.abandoned',
      expect.objectContaining({
        tour_key: 'walkthrough',
        at_step: 1,
        total_steps: 3,
      }),
    )
    expect(adapter.store.get('walkthrough')?.abandoned).toBe(true)
    expect(adapter.store.get('walkthrough')?.atStep).toBe(1)
    expect(onAbandon).toHaveBeenCalledWith(1)
  })

  // ── 12. Empty steps array ────────────────────────────────────────────────

  it('renders a no-op API when steps is empty (does not crash)', () => {
    const { Wrapper } = makeWrapper()
    expect(() =>
      render(
        <Wrapper>
          <TourController tourId="empty" steps={[]}>
            {(a) => (
              <div data-testid="empty">
                total={a.totalSteps} active={String(a.isActive)}
              </div>
            )}
          </TourController>
        </Wrapper>,
      ),
    ).not.toThrow()
    expect(screen.getByTestId('empty')).toHaveTextContent('total=0 active=false')
  })

  // ── 13. startAt resumes from a specific step ─────────────────────────────

  it('honors startAt when start() is called', async () => {
    const { Wrapper } = makeWrapper()
    let api: TourControllerAPI | null = null
    render(
      <Wrapper>
        <TourController tourId="walkthrough" steps={STEPS} startAt={2}>
          {(a) => {
            api = a
            return <div data-testid="cur">{a.currentStep}</div>
          }}
        </TourController>
      </Wrapper>,
    )

    act(() => api!.start())
    await flushQueries()
    expect(screen.getByTestId('cur')).toHaveTextContent('2')
  })

  // ── 14. Controlled active prop wins ──────────────────────────────────────

  it('respects the controlled `active` prop even before start() is called', async () => {
    const { Wrapper } = makeWrapper()
    let api: TourControllerAPI | null = null
    render(
      <Wrapper>
        <TourController tourId="walkthrough" steps={STEPS} active>
          {(a) => {
            api = a
            return <div data-testid="active">{a.isActive ? 'on' : 'off'}</div>
          }}
        </TourController>
      </Wrapper>,
    )

    expect(screen.getByTestId('active')).toHaveTextContent('on')
    expect(api!.isActive).toBe(true)
  })

  it('controlled `active` is overridden by persisted completed state', async () => {
    adapter.store.set('walkthrough', { completed: true })

    const { Wrapper } = makeWrapper()
    render(
      <Wrapper>
        <TourController tourId="walkthrough" steps={STEPS} active>
          {(a) => <div data-testid="active">{a.isActive ? 'on' : 'off'}</div>}
        </TourController>
      </Wrapper>,
    )

    expect(screen.getByTestId('active')).toHaveTextContent('off')
  })

  // ── 15. Posthog absent → no crash ────────────────────────────────────────

  it('does not crash when window.posthog is undefined', async () => {
    delete (window as unknown as { posthog?: unknown }).posthog

    const { Wrapper } = makeWrapper()
    let api: TourControllerAPI | null = null
    expect(() =>
      render(
        <Wrapper>
          <TourController tourId="walkthrough" steps={STEPS}>
            {(a) => {
              api = a
              return null
            }}
          </TourController>
        </Wrapper>,
      ),
    ).not.toThrow()

    expect(() => act(() => api!.start())).not.toThrow()
    expect(() => act(() => api!.next())).not.toThrow()
    expect(() => act(() => api!.skip())).not.toThrow()
  })

  // ── 16. restart() bypasses the one-shot guard (replay) ───────────────────

  it('restart() replays a completed tour, bypassing the resolved guard', async () => {
    adapter.store.set('walkthrough', {
      completed: true,
      completedAt: '2026-07-01T00:00:00Z',
    })

    const { Wrapper } = makeWrapper()
    let api: TourControllerAPI | null = null
    render(
      <Wrapper>
        <TourController tourId="walkthrough" steps={STEPS}>
          {(a) => {
            api = a
            return <div data-testid="active">{a.isActive ? 'on' : 'off'}</div>
          }}
        </TourController>
      </Wrapper>,
    )

    // Resolved tour does not auto-start and start() is a no-op.
    expect(screen.getByTestId('active')).toHaveTextContent('off')
    act(() => api!.start())
    await flushQueries()
    expect(screen.getByTestId('active')).toHaveTextContent('off')

    captureSpy.mockClear()
    act(() => api!.restart())
    await flushQueries()

    // Replay activates despite the persisted completion.
    expect(screen.getByTestId('active')).toHaveTextContent('on')
    expect(api!.currentStep).toBe(0)
    expect(captureSpy).toHaveBeenCalledWith('help.tour.replayed', {
      tour_key: 'walkthrough',
    })
    expect(captureSpy).toHaveBeenCalledWith('help.tour.started', {
      tour_key: 'walkthrough',
      total_steps: 3,
      replay: true,
    })

    // restart() must clear the AUTHORITATIVE backend record — not just the
    // localStorage fallback. Without a backend-level clear, the {completed:true}
    // record survives and a mid-replay reload re-resolves the tour, silently
    // discarding the replay (the major review finding on this branch).
    expect(adapter.store.has('walkthrough')).toBe(false)
  })

  // ── 16b. restart() clears the backend so a remount does NOT re-resolve ─────

  it('restart() clears backend state so a remount mid-replay does not re-resolve', async () => {
    adapter.store.set('walkthrough', {
      completed: true,
      completedAt: '2026-07-01T00:00:00Z',
    })

    const { Wrapper } = makeWrapper()
    let api: TourControllerAPI | null = null
    const { unmount } = render(
      <Wrapper>
        <TourController tourId="walkthrough" steps={STEPS}>
          {(a) => {
            api = a
            return <div data-testid="active">{a.isActive ? 'on' : 'off'}</div>
          }}
        </TourController>
      </Wrapper>,
    )

    act(() => api!.restart())
    await flushQueries()
    expect(screen.getByTestId('active')).toHaveTextContent('on')

    // Simulate a reload/remount partway through the replay: the fresh mount
    // reads the backend in its lazy initializer. Because restart() cleared the
    // record, alreadyResolved is false — so start() can drive the tour again
    // rather than the mount being wedged "resolved" forever.
    unmount()

    let api2: TourControllerAPI | null = null
    render(
      <Wrapper>
        <TourController tourId="walkthrough" steps={STEPS}>
          {(a) => {
            api2 = a
            return <div data-testid="active">{a.isActive ? 'on' : 'off'}</div>
          }}
        </TourController>
      </Wrapper>,
    )

    // A completed tour that was NOT cleared would ignore start() (one-shot
    // guard). Since restart() cleared it, start() activates.
    act(() => api2!.start())
    await flushQueries()
    expect(screen.getByTestId('active')).toHaveTextContent('on')
  })

  // ── 17. persona is threaded into the coachmark content query ──────────────

  it('threads the persona prop into the coachmark content query', async () => {
    const { Wrapper } = makeWrapper()
    let api: TourControllerAPI | null = null
    render(
      <Wrapper>
        <TourController tourId="walkthrough" steps={STEPS} persona="designer">
          {(a) => {
            api = a
            return <a.CoachmarkSlot />
          }}
        </TourController>
      </Wrapper>,
    )

    act(() => api!.start())
    await flushQueries()

    // useHelpContent issues the exact-match query with p = the persona first.
    const personaCall = mockFetch.mock.calls.find(
      ([, params]) => (params as Record<string, unknown>)?.p === 'designer',
    )
    expect(personaCall).toBeDefined()
    const [, params] = personaCall as [string, Record<string, unknown>]
    expect(params.ct).toBe('coachmark')
    expect(params.p).toBe('designer')
  })

  // ── 18. paused suspends key handlers + hides the popover (keeps state) ─────

  it('paused suspends Enter/Escape and hides the popover without losing state', async () => {
    const user = userEvent.setup()
    const { Wrapper } = makeWrapper()
    let api: TourControllerAPI | null = null
    render(
      <Wrapper>
        <TourController tourId="walkthrough" steps={STEPS} paused>
          {(a) => {
            api = a
            return <a.CoachmarkSlot />
          }}
        </TourController>
      </Wrapper>,
    )

    act(() => api!.start())
    await flushQueries()
    captureSpy.mockClear()

    // Popover is hidden while paused, but the tour is still active on step 0.
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(api!.isActive).toBe(true)
    expect(api!.currentStep).toBe(0)

    // Enter/Escape are inert while paused.
    await user.keyboard('{Enter}')
    await flushQueries()
    expect(api!.currentStep).toBe(0)
    expect(
      captureSpy.mock.calls.some(([e]) => e === 'help.tour.step_advanced'),
    ).toBe(false)

    await user.keyboard('{Escape}')
    await flushQueries()
    expect(api!.isActive).toBe(true)
    expect(adapter.store.get('walkthrough')?.abandoned).toBeUndefined()
  })

  // ── 19. per-step fallback copy renders when the CMS resolves null ─────────

  it('renders the per-step fallback heading/body when Sanity returns null', async () => {
    // Every fallback query in the chain misses.
    mockFetch.mockResolvedValue(null)

    const stepsWithFallback: CoachmarkStep[] = [
      {
        surfaceKey: 'desk-walkthrough/step-1',
        fallbackHeading: 'This is your Desk',
        fallbackBody: 'Only what needs your hand lands here.',
      },
    ]

    const { Wrapper } = makeWrapper()
    let api: TourControllerAPI | null = null
    render(
      <Wrapper>
        <TourController tourId="fallback-tour" steps={stepsWithFallback}>
          {(a) => {
            api = a
            return <a.CoachmarkSlot />
          }}
        </TourController>
      </Wrapper>,
    )

    act(() => api!.start())
    await flushQueries()

    // The tour is never invisible-but-active: the popover renders the fallbacks.
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('This is your Desk')).toBeInTheDocument()
    expect(
      screen.getByText('Only what needs your hand lands here.'),
    ).toBeInTheDocument()
  })

  // ── 20. step_viewed fires per step, including step 0 ──────────────────────

  it('fires help.tour.step_viewed for step 0 and on forward advance', async () => {
    const { Wrapper } = makeWrapper()
    let api: TourControllerAPI | null = null
    render(
      <Wrapper>
        <TourController tourId="walkthrough" steps={STEPS}>
          {(a) => {
            api = a
            return <div data-testid="cur">{a.currentStep}</div>
          }}
        </TourController>
      </Wrapper>,
    )

    act(() => api!.start())
    await flushQueries()

    // step 0 view is covered (step_advanced would miss it).
    expect(captureSpy).toHaveBeenCalledWith('help.tour.step_viewed', {
      tour_key: 'walkthrough',
      step_number: 0,
      step_surface_key: STEPS[0]!.surfaceKey,
    })

    captureSpy.mockClear()
    act(() => api!.next())
    await flushQueries()

    expect(captureSpy).toHaveBeenCalledWith('help.tour.step_viewed', {
      tour_key: 'walkthrough',
      step_number: 1,
      step_surface_key: STEPS[1]!.surfaceKey,
    })
  })

  // ── 21. coachmarkClassName merges onto the popover (override wins) ─────────

  it('merges coachmarkClassName onto the popover so overrides win', async () => {
    const { Wrapper } = makeWrapper()
    let api: TourControllerAPI | null = null
    render(
      <Wrapper>
        <TourController
          tourId="walkthrough"
          steps={STEPS}
          coachmarkClassName="shadow-none bg-paper"
        >
          {(a) => {
            api = a
            return <a.CoachmarkSlot />
          }}
        </TourController>
      </Wrapper>,
    )

    act(() => api!.start())
    await flushQueries()

    const dialog = await screen.findByRole('dialog')
    // twMerge resolves the conflict in favor of the override.
    expect(dialog.className).toMatch(/shadow-none/)
    expect(dialog.className).toMatch(/bg-paper/)
    expect(dialog.className).not.toMatch(/shadow-lg/)
  })
})

