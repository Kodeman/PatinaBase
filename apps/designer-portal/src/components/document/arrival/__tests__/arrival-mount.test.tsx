/**
 * US-14 arrival — the persistent mount: forwarding to the active run, the visit refresh on her
 * hand, popstate tracking, the click token (CONTRACT §4a selectors), and the put-down's row scroll
 * on the Desk after its ready mark.
 */
import { fireEvent, render, waitFor } from '@testing-library/react';
import type { Run } from '@/lib/arrival/run-contract';
import { enterRoute } from '@/lib/arrival/nav';
import { KEYS } from '@/lib/arrival/types';
import { ArrivalMount, setActiveRun, setArrivalWaiting } from '../arrival-mount';

let mockPathname = '/desk';
jest.mock('next/navigation', () => ({ usePathname: () => mockPathname }));

function fakeRun(): Run {
  return {
    phase: 'hold',
    ended: new Promise(() => {}),
    start: jest.fn(),
    finish: jest.fn(),
    onKeyDown: jest.fn(),
    onPointerDown: jest.fn(),
    onPointerUp: jest.fn(),
    onWheel: jest.fn(),
    onTouchMove: jest.fn(),
    onScroll: jest.fn(),
    onVisibilityChange: jest.fn(),
    onFocusIn: jest.fn(),
  };
}

function token() {
  const raw = window.sessionStorage.getItem(KEYS.ARRIVE);
  return raw ? JSON.parse(raw) : null;
}

const stopNavigation = (e: Event) => e.preventDefault();

beforeEach(() => {
  window.sessionStorage.clear();
  document.body.innerHTML = '';
  document.addEventListener('click', stopNavigation);
});

afterEach(() => {
  document.removeEventListener('click', stopNavigation);
  setActiveRun(null);
  setArrivalWaiting(null);
});

describe('forwarding', () => {
  it('hands every raw event to the active run', () => {
    render(<ArrivalMount />);
    const run = fakeRun();
    setActiveRun(run);

    fireEvent.keyDown(document.body, { key: 'a' });
    fireEvent.pointerDown(document.body);
    fireEvent.pointerUp(document.body);
    fireEvent.wheel(document.body);
    fireEvent.touchMove(document.body);
    fireEvent.focusIn(document.body);
    fireEvent.scroll(document);
    document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));

    for (const fn of [
      run.onKeyDown,
      run.onPointerDown,
      run.onPointerUp,
      run.onWheel,
      run.onTouchMove,
      run.onFocusIn,
      run.onScroll,
      run.onVisibilityChange,
    ]) {
      expect(fn).toHaveBeenCalledTimes(1);
    }
  });

  it('does not forward an inner scroller’s scroll', () => {
    document.body.innerHTML = '<div id="scroller"></div>';
    render(<ArrivalMount />);
    const run = fakeRun();
    setActiveRun(run);
    fireEvent.scroll(document.getElementById('scroller')!);
    expect(run.onScroll).not.toHaveBeenCalled();
  });

  it('forwards nothing and swallows nothing when idle', () => {
    render(<ArrivalMount />);
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.body.dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(false);
  });

  it('during the wait, a press, wheel or swipe ends it once and is never swallowed', () => {
    render(<ArrivalMount />);
    for (const fire of [
      () => fireEvent.pointerDown(document.body),
      () => fireEvent.wheel(document.body),
      () => fireEvent.touchMove(document.body),
    ]) {
      const cancel = jest.fn();
      setArrivalWaiting(cancel);
      expect(fire()).toBe(true);
      fire();
      expect(cancel).toHaveBeenCalledTimes(1);
    }
  });
});

describe('mark()', () => {
  it('refreshes the visit on her hand, at most every 10 s', () => {
    // Earlier cases in this file already touched the visit; step past the throttle.
    const t0 = Date.now() + 60_000;
    const now = jest.spyOn(Date, 'now').mockReturnValue(t0);
    render(<ArrivalMount />);
    expect(window.sessionStorage.getItem(KEYS.VISIT)).toBeNull();
    fireEvent.pointerDown(document.body);
    expect(Number(window.sessionStorage.getItem(KEYS.VISIT))).toBe(t0);
    now.mockReturnValue(t0 + 5_000);
    fireEvent.keyDown(document.body, { key: 'j' });
    expect(Number(window.sessionStorage.getItem(KEYS.VISIT))).toBe(t0);
    now.mockReturnValue(t0 + 10_001);
    fireEvent.wheel(document.body);
    expect(Number(window.sessionStorage.getItem(KEYS.VISIT))).toBe(t0 + 10_001);
    now.mockRestore();
  });
});

describe('popstate', () => {
  it('marks the next route commit as back_forward', () => {
    render(<ArrivalMount />);
    enterRoute('/desk');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(enterRoute('/doc/e1').entry).toBe('back_forward');
    expect(enterRoute('/desk').entry).toBe('soft');
  });
});

describe('the click token', () => {
  const card = `
    <ul>
      <li data-claim-card="e1" id="roster-line-e1">
        <a data-roster-name data-register="name" data-part="job" href="/doc/e1">Whitfield House</a>
        <p data-register="sentence">Approve the sofa.</p>
        <div data-register="act"><a id="act" href="/doc/e1" data-landing='{"kind":"region","region":"money"}'>Review the draw</a></div>
        <a id="inner" href="/doc/e1?tab=x">More</a>
      </li>
      <li><a id="ledger" data-roster-name href="/doc/e2">Okafor Bright</a></li>
    </ul>
    <a id="other" href="/doc/e3">Elsewhere</a>
    <div data-register="act"><a id="offsite" href="https://example.com/doc/e4">Offsite</a></div>`;

  beforeEach(() => {
    document.body.innerHTML = card;
    render(<ArrivalMount />);
  });

  it('the act writes via act with its landing', () => {
    fireEvent.click(document.getElementById('act')!, { detail: 1 });
    expect(token()).toEqual({
      via: 'act',
      to: '/doc/e1',
      at: expect.any(Number),
      landing: { kind: 'region', region: 'money' },
    });
  });

  it('a name link writes ptr for a pointer click and kbd for a keyboard activation', () => {
    const name = document.querySelector<HTMLElement>('[data-roster-name]')!;
    fireEvent.click(name, { detail: 1 });
    expect(token()).toMatchObject({ via: 'ptr', to: '/doc/e1' });
    fireEvent.click(document.getElementById('ledger')!, { detail: 0 });
    expect(token()).toMatchObject({ via: 'kbd', to: '/doc/e2' });
  });

  it('any /doc link inside a claim card writes, by pathname', () => {
    fireEvent.click(document.getElementById('inner')!, { detail: 1 });
    expect(token()).toMatchObject({ via: 'ptr', to: '/doc/e1' });
  });

  it('writes nothing for a modified click, another button, an unmarked link, or another origin', () => {
    fireEvent.click(document.getElementById('act')!, { detail: 1, metaKey: true });
    fireEvent.click(document.getElementById('act')!, { detail: 1, button: 1 });
    fireEvent.click(document.getElementById('other')!, { detail: 1 });
    fireEvent.click(document.getElementById('offsite')!, { detail: 1 });
    expect(token()).toBeNull();
  });
});

describe('the put-down row', () => {
  beforeEach(() => {
    mockPathname = '/desk';
    Element.prototype.scrollIntoView = jest.fn();
  });

  it('/doc/x → /desk writes pl-from-doc; the Desk scrolls to its row only after ready, then spends it', async () => {
    enterRoute('/doc/e2');
    enterRoute('/desk');
    expect(window.sessionStorage.getItem(KEYS.FROM_DOC)).toBe('e2');

    document.body.innerHTML =
      '<main data-arrival="desk"><ul><li id="roster-line-e1"></li><li id="roster-line-e2"></li></ul></main>';
    render(<ArrivalMount />);
    await new Promise((resolve) => window.requestAnimationFrame(() => resolve(null)));
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();

    document.querySelector('main')!.setAttribute('data-arrival-ready', '');
    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1));
    const [call] = (Element.prototype.scrollIntoView as jest.Mock).mock.instances;
    expect(call).toBe(document.getElementById('roster-line-e2'));
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ block: 'center' });
    expect(window.sessionStorage.getItem(KEYS.FROM_DOC)).toBeNull();
  });

  it('does nothing off the Desk', async () => {
    window.sessionStorage.setItem(KEYS.FROM_DOC, 'e2');
    mockPathname = '/doc/e1';
    document.body.innerHTML = '<main data-arrival="desk" data-arrival-ready><li id="roster-line-e2"></li></main>';
    render(<ArrivalMount />);
    await new Promise((resolve) => window.requestAnimationFrame(() => resolve(null)));
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(KEYS.FROM_DOC)).toBe('e2');
  });
});
