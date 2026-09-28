/**
 * US-14 arrival — listener ORDER (CONTRACT §3 "Listener registration"). Its own file so the first
 * render in this module registry is the one under test: the real LogStrip and a CommandBar-like
 * window-capture stub are rendered BEFORE ArrivalMount in the tree, yet Escape during a run or the
 * ready wait never reaches LogStrip's discardOffer or the stub.
 */
import { useEffect } from 'react';
import { fireEvent, render } from '@testing-library/react';
import type { Run } from '@/lib/arrival/run-contract';
import { LogStrip } from '@/components/document/log-strip';
import { ArrivalMount, setActiveRun, setArrivalWaiting } from '../arrival-mount';

const mockDiscardOffer = jest.fn().mockResolvedValue(undefined);
let mockOffer: Record<string, unknown> | null = null;

jest.mock('@patina/supabase', () => ({ useMyRateRoles: () => ({ data: ['lead_designer'] }) }));
jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: new Proxy({}, { get: () => () => undefined }),
}));
jest.mock('@/hooks/document-time-provider', () => ({
  useDocumentTime: () => ({
    offer: mockOffer,
    offerOwnsEdge: mockOffer !== null,
    logOffer: jest.fn(),
    discardOffer: mockDiscardOffer,
  }),
}));

const offer = (minutes: number) => ({
  entryId: 'entry-1',
  projectId: 'whitfield-project',
  projectName: 'Whitfield House',
  suggestedMinutes: minutes,
  rawSeconds: minutes * 60,
  idleSeconds: 0,
  billable: false,
  hourlyRateCents: null,
  rateSource: 'none',
  rateRole: null,
  ratedAmountCents: null,
});

const chromeSpy = jest.fn();

/** CommandBar / MarginNote / LogTimeSheet shape: a window-capture keydown added in an effect. */
function ChromeCaptureStub() {
  useEffect(() => {
    window.addEventListener('keydown', chromeSpy, { capture: true });
    return () => window.removeEventListener('keydown', chromeSpy, { capture: true });
  }, []);
  return null;
}

function fakeRun(): Run {
  return {
    phase: 'hold',
    ended: new Promise(() => {}),
    start: jest.fn(),
    finish: jest.fn(),
    // The engine's §3 rule: Escape is swallowed in every act.
    onKeyDown: jest.fn((e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    }),
    onPointerDown: jest.fn(),
    onPointerUp: jest.fn(),
    onWheel: jest.fn(),
    onTouchMove: jest.fn(),
    onScroll: jest.fn(),
    onVisibilityChange: jest.fn(),
    onFocusIn: jest.fn(),
  };
}

function Layout() {
  return (
    <>
      <LogStrip />
      <ChromeCaptureStub />
      <ArrivalMount />
    </>
  );
}

afterEach(() => {
  setActiveRun(null);
  setArrivalWaiting(null);
});

describe('ArrivalMount listener order', () => {
  it('Escape during a run reaches the run, never LogStrip or a chrome capture listener', () => {
    mockOffer = offer(26);
    const view = render(<Layout />);
    const run = fakeRun();
    setActiveRun(run);

    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.body.dispatchEvent(escape);

    expect(run.onKeyDown).toHaveBeenCalledWith(escape);
    expect(escape.defaultPrevented).toBe(true);
    expect(mockDiscardOffer).not.toHaveBeenCalled();
    expect(chromeSpy).not.toHaveBeenCalled();

    // Control: with no run and no wait, the same Escape reaches LogStrip — it IS listening.
    setActiveRun(null);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(mockDiscardOffer).toHaveBeenCalledTimes(1);
    expect(chromeSpy).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it('stays ahead after the chrome re-registers (a new offer re-runs LogStrip’s effect)', () => {
    mockOffer = offer(26);
    const view = render(<Layout />);
    mockOffer = offer(40);
    view.rerender(<Layout />);
    view.unmount();
    render(<Layout />);

    const run = fakeRun();
    setActiveRun(run);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(run.onKeyDown).toHaveBeenCalledTimes(1);
    expect(mockDiscardOffer).not.toHaveBeenCalled();
    expect(chromeSpy).not.toHaveBeenCalled();
  });

  it('swallows Escape during the ready wait; other keys pass; either one ends the wait', () => {
    mockOffer = offer(26);
    render(<Layout />);
    const cancelOnEscape = jest.fn();
    setArrivalWaiting(cancelOnEscape);

    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.body.dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(true);
    expect(mockDiscardOffer).not.toHaveBeenCalled();
    expect(chromeSpy).not.toHaveBeenCalled();
    expect(cancelOnEscape).toHaveBeenCalledTimes(1);

    const cancelOnKey = jest.fn();
    setArrivalWaiting(cancelOnKey);
    fireEvent.keyDown(document.body, { key: 'k', metaKey: true });
    expect(chromeSpy).toHaveBeenCalledTimes(1);
    expect(cancelOnKey).toHaveBeenCalledTimes(1);

    // The wait is over: the next Escape is hers again.
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(mockDiscardOffer).toHaveBeenCalledTimes(1);
    expect(cancelOnEscape).toHaveBeenCalledTimes(1);
  });
});
