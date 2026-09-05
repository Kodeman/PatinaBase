import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { act, fireEvent, render, screen } from '@testing-library/react';

jest.mock('@/lib/analytics/events', () => ({
  __esModule: true,
  makingEvents: {
    actionShown: jest.fn(),
    actionSelected: jest.fn(),
  },
}));

import { makingEvents } from '@/lib/analytics/events';

import { HOLD_MS, HoldAction } from '../scored-action';

/* ── What a held act owes (P-18) ─────────────────────────────────────────────
   The act is taken at the END of the hold and at no other moment: not on the
   press, not on a click that arrives from somewhere else, not on a release
   that came early. The keyboard is offered the same length, never a shorter
   one. Everything below is that contract.
   ────────────────────────────────────────────────────────────────────────── */

const onHold = jest.fn();

function draw(props: Partial<React.ComponentProps<typeof HoldAction>> = {}) {
  return render(
    <HoldAction actionKey="gate_sign" verb="sign" onHold={onHold} {...props}>
      Sign authorization
    </HoldAction>,
  );
}

const actWord = () => screen.getByRole('button', { name: /sign authorization/i });

/** Hold the act for `ms`, on fake time, then hand real time back. */
function hold(target: HTMLElement, ms = HOLD_MS) {
  jest.useFakeTimers();
  fireEvent.pointerDown(target, { clientX: 4, clientY: 4 });
  act(() => {
    jest.advanceTimersByTime(ms);
  });
  jest.useRealTimers();
}

beforeEach(() => {
  onHold.mockReset();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('HoldAction — the act, held', () => {
  it('takes the act only once the hold reaches its length', () => {
    draw();
    const target = actWord();

    jest.useFakeTimers();
    fireEvent.pointerDown(target, { clientX: 4, clientY: 4 });
    act(() => {
      jest.advanceTimersByTime(HOLD_MS - 1);
    });
    expect(onHold).not.toHaveBeenCalled();
    expect(target).toHaveAttribute('data-hold-state', 'holding');
    act(() => {
      jest.advanceTimersByTime(1);
    });
    jest.useRealTimers();

    expect(onHold).toHaveBeenCalledTimes(1);
    expect(target).toHaveAttribute('data-hold-state', 'idle');
  });

  it('cancels on an early release, and says nothing about it', () => {
    draw();
    const target = actWord();

    jest.useFakeTimers();
    fireEvent.pointerDown(target, { clientX: 4, clientY: 4 });
    act(() => {
      jest.advanceTimersByTime(400);
    });
    fireEvent.pointerUp(target);
    act(() => {
      jest.advanceTimersByTime(HOLD_MS * 2);
    });
    jest.useRealTimers();

    expect(onHold).not.toHaveBeenCalled();
    expect(target).toHaveAttribute('data-hold-state', 'idle');
    // No failure register anywhere: a released hold is a hold that was not made.
    expect(document.body.textContent).not.toMatch(/cancel|failed|try again/i);
  });

  it('cancels when the page scrolls under the thumb', () => {
    draw();
    const target = actWord();

    jest.useFakeTimers();
    fireEvent.pointerDown(target, { clientX: 4, clientY: 4 });
    act(() => {
      jest.advanceTimersByTime(200);
    });
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });
    act(() => {
      jest.advanceTimersByTime(HOLD_MS * 2);
    });
    jest.useRealTimers();

    expect(onHold).not.toHaveBeenCalled();
  });

  it('cancels when the pointer leaves the word', () => {
    draw();
    const target = actWord();

    jest.useFakeTimers();
    fireEvent.pointerDown(target, { clientX: 4, clientY: 4 });
    fireEvent.pointerLeave(target);
    act(() => {
      jest.advanceTimersByTime(HOLD_MS * 2);
    });
    jest.useRealTimers();

    expect(onHold).not.toHaveBeenCalled();
  });

  it('the click that trails a tap is not the act', () => {
    draw();
    const target = actWord();
    // A finger that presses and lets go leaves a click behind it. The gesture
    // was already answered — and answered by refusing it — so its tail must
    // not take what the hold would not give.
    fireEvent.pointerDown(target, { clientX: 4, clientY: 4 });
    fireEvent.pointerUp(target);
    fireEvent.click(target);
    expect(onHold).not.toHaveBeenCalled();
  });

  it('takes the act on an assistive click, which has no hold to give', () => {
    draw();
    // VoiceOver, Voice Control and switch access activate a control by
    // dispatching a click: there is no pointer to hold down and no key to
    // keep pressed. Reaching that click already took several deliberate
    // steps, so it is the act — the same fallback the iOS holdable carries.
    act(() => {
      actWord().click();
    });
    expect(onHold).toHaveBeenCalledTimes(1);
    expect(makingEvents.actionSelected).toHaveBeenCalledWith(
      expect.objectContaining({ action_key: 'gate_sign' }),
    );
  });

  /* The guard on that click is the POINTER TAIL and nothing else. `isTrusted`
     is deliberately not consulted: a screen reader activates through the
     platform accessibility API and the browser dispatches the resulting click
     itself, TRUSTED — which is why AT activation counts as user activation at
     all — so a trust test would refuse every real assistive activation and
     admit only a scripted one. jsdom marks every dispatched event untrusted,
     so this test cannot assert the trust flag; what it pins is that the only
     thing standing between a click and the act is recent pointer history. */
  it('takes an activation that arrives long after a pointer gesture', () => {
    draw();
    const target = actWord();

    jest.useFakeTimers();
    // A gesture released early, and refused for it.
    fireEvent.pointerDown(target, { clientX: 4, clientY: 4 });
    fireEvent.pointerUp(target);
    expect(onHold).not.toHaveBeenCalled();

    // Long enough after that the click cannot be that gesture's own tail.
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    act(() => {
      target.click();
    });
    jest.useRealTimers();

    expect(onHold).toHaveBeenCalledTimes(1);
  });

  /* W2B-R2-02, the carry. The guard on an activation click is the POINTER TAIL
     and nothing else, in both directions:

       • an activation with no pointer behind it is taken — a screen reader,
         Voice Control or switch access has no hold to give, and the browser
         dispatches that click ITSELF, trusted, off the platform accessibility
         API (AXPress / kDoDefault / doAction);
       • an activation moments after a pointer gesture on this control is
         refused — it is that gesture's own tail, and the gesture was already
         answered by refusing it. A sighted hand's click is trusted too.

     Trust therefore separates nothing, and a guard that tested `isTrusted`
     would refuse every real assistive activation while admitting only a
     scripted one — the inversion this finding named. jsdom cannot forge the
     flag (it is an unforgeable own property on the event, non-configurable —
     `Object.defineProperty` throws), so the two halves below pin the pointer
     history, and the third pins that the handler never reads trust at all. */
  function activationClick(target: HTMLElement) {
    act(() => {
      target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
  }

  it('takes an activation that no pointer preceded — the assistive path', () => {
    draw();
    activationClick(actWord());
    expect(onHold).toHaveBeenCalledTimes(1);
  });

  it('refuses an instant click in a pointer gesture’s tail — the sighted hand', () => {
    draw();
    const target = actWord();

    fireEvent.pointerDown(target, { clientX: 4, clientY: 4 });
    fireEvent.pointerUp(target);
    activationClick(target);

    expect(onHold).not.toHaveBeenCalled();
  });

  it('never consults the trust flag, in either direction', () => {
    const source = readFileSync(
      resolve(__dirname, '../scored-action.tsx'),
      'utf8',
    );
    const handler = source.slice(source.indexOf('onClick={(event) => {'));
    const body = handler.slice(0, handler.indexOf('}}'));
    expect(body).toContain('POINTER_TAIL_MS');
    expect(body).not.toContain('isTrusted');
  });

  it('an unavailable act is not taken by an assistive click either', () => {
    draw({ disabled: true });
    act(() => {
      actWord().click();
    });
    expect(onHold).not.toHaveBeenCalled();
  });

  it('an assistive click during a hold does not take the act twice', () => {
    draw();
    const target = actWord();

    jest.useFakeTimers();
    fireEvent.pointerDown(target, { clientX: 4, clientY: 4 });
    act(() => {
      jest.advanceTimersByTime(400);
    });
    act(() => {
      target.click();
    });
    expect(onHold).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(HOLD_MS);
    });
    jest.useRealTimers();
    expect(onHold).toHaveBeenCalledTimes(1);
  });

  it('holds on Enter and on Space for the same length, and not less', () => {
    draw();
    const target = actWord();

    jest.useFakeTimers();
    fireEvent.keyDown(target, { key: 'Enter' });
    act(() => {
      jest.advanceTimersByTime(HOLD_MS - 1);
    });
    expect(onHold).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(1);
    });
    jest.useRealTimers();
    expect(onHold).toHaveBeenCalledTimes(1);

    onHold.mockReset();
    jest.useFakeTimers();
    fireEvent.keyDown(target, { key: ' ' });
    act(() => {
      jest.advanceTimersByTime(HOLD_MS);
    });
    jest.useRealTimers();
    expect(onHold).toHaveBeenCalledTimes(1);
  });

  it('a key released early cancels, and a repeat does not restart the clock', () => {
    draw();
    const target = actWord();

    jest.useFakeTimers();
    fireEvent.keyDown(target, { key: 'Enter' });
    act(() => {
      jest.advanceTimersByTime(300);
    });
    fireEvent.keyUp(target, { key: 'Enter' });
    act(() => {
      jest.advanceTimersByTime(HOLD_MS * 2);
    });
    jest.useRealTimers();
    expect(onHold).not.toHaveBeenCalled();

    jest.useFakeTimers();
    fireEvent.keyDown(target, { key: 'Enter' });
    act(() => {
      jest.advanceTimersByTime(HOLD_MS - 100);
    });
    fireEvent.keyDown(target, { key: 'Enter', repeat: true });
    act(() => {
      jest.advanceTimersByTime(100);
    });
    jest.useRealTimers();
    expect(onHold).toHaveBeenCalledTimes(1);
  });

  it('names the gesture to a screen reader, in the act’s own verb', () => {
    draw({ verb: 'approve this edition' });
    const target = actWord();
    const said = target.getAttribute('aria-describedby');
    expect(said).toBeTruthy();
    expect(document.getElementById(said as string)).toHaveTextContent(
      'Press and hold to approve this edition.',
    );
  });

  it('shows the keyboard hint only when the focus arrived by key', () => {
    draw();
    const target = actWord();

    fireEvent.pointerDown(document);
    fireEvent.focus(target);
    expect(screen.queryByText('or press and hold Enter')).toBeNull();

    fireEvent.blur(target);
    fireEvent.keyDown(document, { key: 'Tab' });
    fireEvent.focus(target);
    expect(screen.getByText('or press and hold Enter')).toBeInTheDocument();

    fireEvent.blur(target);
    expect(screen.queryByText('or press and hold Enter')).toBeNull();
  });

  it('inks at once when motion is stilled, and still takes the full length', () => {
    (window.matchMedia as jest.Mock).mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }));
    draw();
    const target = actWord();
    expect(target).toHaveClass('da-hold-still');

    jest.useFakeTimers();
    fireEvent.pointerDown(target, { clientX: 4, clientY: 4 });
    act(() => {
      jest.advanceTimersByTime(HOLD_MS - 1);
    });
    expect(onHold).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(1);
    });
    jest.useRealTimers();
    expect(onHold).toHaveBeenCalledTimes(1);
  });

  it('fills the rule with the scored ink and no other instrument', () => {
    const { container } = draw();
    const target = actWord();
    expect(target).toHaveClass('da-hold');
    expect(container.querySelector('.da-pool')).toBeInTheDocument();
    // No borrowed chrome: the ink is the whole report.
    expect(container.querySelector('progress')).toBeNull();
    expect(container.querySelector('[role="progressbar"]')).toBeNull();

    jest.useFakeTimers();
    fireEvent.pointerDown(target, { clientX: 4, clientY: 4 });
    expect(target.style.getPropertyValue('--hold-fill')).toBe('1');
    expect(target.style.getPropertyValue('--hold-ms')).toBe(`${HOLD_MS}ms`);
    fireEvent.pointerUp(target);
    expect(target.style.getPropertyValue('--hold-fill')).toBe('0');
    jest.useRealTimers();
  });

  it('an unavailable act cannot be held', () => {
    draw({ disabled: true });
    const target = actWord();
    expect(target).toBeDisabled();
    hold(target);
    expect(onHold).not.toHaveBeenCalled();
  });

  it('reports the act on completion and never on the press', () => {
    draw();
    const target = actWord();
    expect(makingEvents.actionShown).toHaveBeenCalledWith(
      expect.objectContaining({ action_key: 'gate_sign' }),
    );

    jest.useFakeTimers();
    fireEvent.pointerDown(target, { clientX: 4, clientY: 4 });
    expect(makingEvents.actionSelected).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(HOLD_MS);
    });
    jest.useRealTimers();
    expect(makingEvents.actionSelected).toHaveBeenCalledWith(
      expect.objectContaining({ action_key: 'gate_sign', variant: 'primary' }),
    );
  });

  it('docks on a narrow viewport when asked to', () => {
    const { container } = draw({ presentation: 'mobile_dock' });
    const dock = container.querySelector('[data-hold-dock]');
    expect(dock).toBeInTheDocument();
    expect(dock).toHaveClass('max-[600px]:sticky');
    expect(dock).toHaveClass('max-[600px]:bottom-0');
  });
});
