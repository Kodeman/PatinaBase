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

  it('a plain click is not the act', () => {
    draw();
    fireEvent.click(actWord());
    expect(onHold).not.toHaveBeenCalled();
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
