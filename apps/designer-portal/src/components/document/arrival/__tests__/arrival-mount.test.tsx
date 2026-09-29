/**
 * US-14 arrival — the persistent mount: forwarding to the active run, the visit refresh on her
 * hand, popstate tracking, the click token (CONTRACT §4a selectors), and the put-down's row scroll
 * on the Desk after its ready mark.
 */
import { fireEvent, render, waitFor } from '@testing-library/react';
import { DeskClaimCard } from '@/components/document/desk-claim-card';
import { gate } from '@/lib/arrival/gate';
import type { Run } from '@/lib/arrival/run-contract';
import { enterRoute } from '@/lib/arrival/nav';
import { readArriveToken, writeFromDoc } from '@/lib/arrival/session';
import { EVENT_ENDED, KEYS } from '@/lib/arrival/types';
import type { ArrivalEnded } from '@/lib/arrival/types';
import type { ClaimCard, RosterLine } from '@/lib/document/desk-roster-derivation';
import { afterArrival, ArrivalMount, setActiveRun, setArrivalWaiting } from '../arrival-mount';

let mockPathname = '/desk';
jest.mock('next/navigation', () => ({ usePathname: () => mockPathname }));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...props }: React.ComponentProps<'a'>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));
jest.mock('@/components/document/command-bar', () => ({ openLedger: jest.fn() }));

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

/** jsdom has no PointerEvent: a MouseEvent carrying the pointer's type. */
function pointer(type: 'pointerdown' | 'pointerup', el: Element, pointerType: string): Event {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 });
  Object.defineProperty(e, 'pointerType', { value: pointerType });
  el.dispatchEvent(e);
  return e;
}

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
      expect(cancel).toHaveBeenCalledWith(false);
    }
  });

  it('during the wait, Escape is swallowed and halts it as escape; any other key ends it unswallowed', () => {
    render(<ArrivalMount />);
    const chrome = jest.fn();
    document.body.addEventListener('keydown', chrome);
    const halt = jest.fn();
    setArrivalWaiting(halt);
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.body.dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(true);
    expect(chrome).not.toHaveBeenCalled();
    expect(halt).toHaveBeenCalledTimes(1);
    expect(halt).toHaveBeenCalledWith(true);

    const cancel = jest.fn();
    setArrivalWaiting(cancel);
    const key = new KeyboardEvent('keydown', { key: 'j', bubbles: true, cancelable: true });
    document.body.dispatchEvent(key);
    expect(key.defaultPrevented).toBe(false);
    expect(chrome).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledWith(false);
    document.body.removeEventListener('keydown', chrome);
  });
});

describe('a press on the hidden route root during the wait', () => {
  const push = jest.fn();

  /** Next Link's shape: navigation happens in a click handler below the window capture. */
  function mountPage() {
    document.body.innerHTML = `
      <nav><a id="chrome" href="/board/b1">Boards</a></nav>
      <main data-arrival="desk"><a id="card" data-roster-name href="/doc/e1">Whitfield House</a></main>`;
    for (const link of document.querySelectorAll('a')) {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        push(link.getAttribute('href'));
      });
    }
    render(<ArrivalMount />);
    return {
      card: document.getElementById('card')!,
      chrome: document.getElementById('chrome')!,
    };
  }

  function click(el: Element): MouseEvent {
    const e = new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1, button: 0 });
    el.dispatchEvent(e);
    return e;
  }

  beforeEach(() => push.mockReset());

  it('ends the wait and swallows the click that follows: nothing navigates, no token', () => {
    const { card } = mountPage();
    const cancel = jest.fn();
    setArrivalWaiting(cancel);

    fireEvent.pointerDown(card);
    expect(cancel).toHaveBeenCalledTimes(1);
    fireEvent.pointerUp(card);
    const swallowed = click(card);
    expect(swallowed.defaultPrevented).toBe(true);
    expect(push).not.toHaveBeenCalled();
    expect(token()).toBeNull();

    // Once only: her next activation is hers.
    click(card);
    expect(push).toHaveBeenCalledWith('/doc/e1');
    expect(token()).toMatchObject({ via: 'ptr', to: '/doc/e1' });
  });

  it('a press on the chrome ends the wait and acts', () => {
    const { chrome } = mountPage();
    const cancel = jest.fn();
    setArrivalWaiting(cancel);
    fireEvent.pointerDown(chrome);
    fireEvent.pointerUp(chrome);
    click(chrome);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith('/board/b1');
  });

  it('a press that makes no click leaves nothing armed: after a mouse pointerup, or a pointercancel', async () => {
    const { card } = mountPage();
    setArrivalWaiting(jest.fn());
    fireEvent.pointerDown(card);
    pointer('pointerup', document.body, 'mouse');
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    click(card);
    expect(push).toHaveBeenCalledTimes(1);

    setArrivalWaiting(jest.fn());
    fireEvent.pointerDown(card);
    fireEvent.pointerCancel(card);
    click(card);
    expect(push).toHaveBeenCalledTimes(2);
  });

  it('a tap’s click is a later task: the swallow outlives a 0 ms tick, and clears after 400 ms', () => {
    jest.useFakeTimers();
    try {
      const { card } = mountPage();
      setArrivalWaiting(jest.fn());
      pointer('pointerdown', card, 'touch');
      pointer('pointerup', card, 'touch');
      jest.advanceTimersByTime(0);
      expect(click(card).defaultPrevented).toBe(true);
      expect(push).not.toHaveBeenCalled();

      setArrivalWaiting(jest.fn());
      pointer('pointerdown', card, 'pen');
      pointer('pointerup', card, 'pen');
      jest.advanceTimersByTime(399);
      jest.advanceTimersByTime(1);
      click(card);
      expect(push).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('nothing is swallowed when no wait is running', () => {
    const { card } = mountPage();
    fireEvent.pointerDown(card);
    fireEvent.pointerUp(card);
    click(card);
    expect(push).toHaveBeenCalledWith('/doc/e1');
  });
});

describe('a press the run swallowed', () => {
  const acted = jest.fn();

  function mountRun(opts: { swallow: boolean; endsOnUp?: boolean }) {
    document.body.innerHTML = '<main data-arrival="document"><button id="ctl">Rename</button></main>';
    document.getElementById('ctl')!.addEventListener('click', acted);
    render(<ArrivalMount />);
    const run = fakeRun() as Run & { phase: string };
    run.onPointerDown = jest.fn((e: PointerEvent) => {
      if (opts.swallow) e.preventDefault();
    });
    run.onPointerUp = jest.fn(() => {
      if (opts.endsOnUp) run.phase = 'done';
    });
    setActiveRun(run);
    return document.getElementById('ctl')!;
  }

  function click(el: Element): MouseEvent {
    const e = new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1, button: 0 });
    el.dispatchEvent(e);
    return e;
  }

  beforeEach(() => {
    acted.mockReset();
    document.documentElement.classList.remove('arr-press');
  });

  it('a tap in Acts 1–2 never clicks the control under it, however late its click lands', () => {
    jest.useFakeTimers();
    try {
      const ctl = mountRun({ swallow: true });
      pointer('pointerdown', ctl, 'touch');
      document.documentElement.classList.add('arr-press');
      pointer('pointerup', ctl, 'touch');
      jest.advanceTimersByTime(0);
      click(ctl);
      expect(acted).not.toHaveBeenCalled();
      expect(document.documentElement.classList.contains('arr-press')).toBe(false);
      click(ctl);
      expect(acted).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('a mouse press in Acts 1–2 swallows the click in its own task, and nothing after it', async () => {
    const ctl = mountRun({ swallow: true });
    pointer('pointerdown', ctl, 'mouse');
    pointer('pointerup', ctl, 'mouse');
    click(ctl);
    expect(acted).not.toHaveBeenCalled();
    pointer('pointerdown', ctl, 'mouse');
    pointer('pointerup', ctl, 'mouse');
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    click(ctl);
    expect(acted).toHaveBeenCalledTimes(1);
  });

  it('a mouse released on the act: its own click is the activation', () => {
    const ctl = mountRun({ swallow: true, endsOnUp: true });
    pointer('pointerdown', ctl, 'mouse');
    pointer('pointerup', ctl, 'mouse');
    click(ctl);
    expect(acted).toHaveBeenCalledTimes(1);
  });

  it('a tap released on the act: the run forwarded the activation, so the late click is swallowed', () => {
    const ctl = mountRun({ swallow: true, endsOnUp: true });
    pointer('pointerdown', ctl, 'touch');
    pointer('pointerup', ctl, 'touch');
    click(ctl);
    expect(acted).not.toHaveBeenCalled();
  });

  it('a press the run let through (Skip, an Act 3 control) clicks', () => {
    const ctl = mountRun({ swallow: false });
    pointer('pointerdown', ctl, 'touch');
    pointer('pointerup', ctl, 'touch');
    click(ctl);
    expect(acted).toHaveBeenCalledTimes(1);
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

describe('the bare /board route', () => {
  it('advances the nav state at its commit, which ArrivalRoute never renders on', () => {
    enterRoute('/doc/e3');
    mockPathname = '/board/b1';
    render(<ArrivalMount />);
    // The previous path is now /board/b1: walking on to the Desk is no put-down from /doc/e3.
    enterRoute('/desk');
    expect(window.sessionStorage.getItem(KEYS.FROM_DOC)).toBeNull();
    mockPathname = '/desk';
  });
});

describe('afterArrival', () => {
  const html = document.documentElement;
  const end = (detail: ArrivalEnded) =>
    window.dispatchEvent(new CustomEvent<ArrivalEnded>(EVENT_ENDED, { detail }));
  afterEach(() => {
    html.className = '';
  });

  it('runs at once, as declined, when no arrival holds the page', () => {
    const onEnd = jest.fn();
    afterArrival(onEnd);
    expect(onEnd).toHaveBeenCalledWith(true);
  });

  it.each(['arr-pre', 'arr-on'])('waits on the entry’s end while %s holds the page', (cls) => {
    html.classList.add(cls);
    const onEnd = jest.fn();
    afterArrival(onEnd);
    expect(onEnd).not.toHaveBeenCalled();
    // An earlier route's end arriving while this entry still holds the page is not this end.
    end({ surface: 'document', how: 'mutation' });
    expect(onEnd).not.toHaveBeenCalled();
    html.classList.remove(cls);
    end({ surface: 'desk', how: 'declined', cause: 'late' });
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(onEnd).toHaveBeenCalledWith(true);
    end({ surface: 'desk', how: 'declined', cause: 'late' });
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('reports a played end as not declined, and the unsubscribe stops listening', () => {
    html.classList.add('arr-on');
    const played = jest.fn();
    afterArrival(played);
    html.classList.remove('arr-on');
    end({ surface: 'desk', how: 'settled' });
    expect(played).toHaveBeenCalledWith(false);

    html.classList.add('arr-pre');
    const gone = jest.fn();
    afterArrival(gone)();
    html.classList.remove('arr-pre');
    end({ surface: 'desk', how: 'declined', cause: 'busy' });
    expect(gone).not.toHaveBeenCalled();
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

describe('R-DM21 A — the Desk act on the real claim card', () => {
  function claim(over: Partial<RosterLine> = {}): ClaimCard {
    return {
      stage: 'project',
      stageLabel: 'Project',
      custody: 'Your pen',
      band: 0,
      line: {
        engagementId: 'e1',
        name: 'Whitfield House',
        stage: 'project',
        designerId: null,
        state: 'Leah Whitfield · Procurement And Orders',
        personLine: 'Leah Whitfield · Procurement And Orders',
        overdueText: null,
        mark: 'quiet',
        needKind: 'overdue_decision',
        overdue: { isOverdue: false, days: 0 },
        jobHref: '/doc/e1',
        act: { label: 'Review decisions', href: '/doc/e1' },
        client: 'Leah Whitfield',
        custody: 'Your pen',
        needOwner: 'designer',
        dueOn: null,
        valueText: null,
        needText: 'Two selections are waiting on Leah',
        motionText: null,
        projectId: 'p1',
        ...over,
      } as RosterLine,
    };
  }

  function clickAct(card: ClaimCard) {
    const { container } = render(
      <ul>
        <DeskClaimCard card={card} tone="project" index={0} settle={false} />
      </ul>,
    );
    render(<ArrivalMount />);
    fireEvent.click(container.querySelector('[data-part~="act"]')!, { detail: 1 });
  }

  function gateFor(pathname: string) {
    const now = Date.now();
    return gate({
      surface: 'document', pathname, search: '', hash: '', entry: 'soft', entryAt: now, now,
      webdriver: false, e2eOptIn: false, visitAt: null, deskShown: false,
      token: readArriveToken(pathname, now), suppressedPath: null, reducedMotion: false,
    });
  }

  it('writes a token with the landing, and the gate declines token: straight to the record', () => {
    clickAct(claim());
    expect(token()).toEqual({
      via: 'act',
      to: '/doc/e1',
      at: expect.any(Number),
      landing: { kind: 'section', sectionKey: 'project' },
    });
    expect(gateFor('/doc/e1')).toEqual({ play: false, cause: 'token' });
  });

  it('a purchase order lands on the FF&E region', () => {
    clickAct(claim({ needKind: 'po_unsent', act: { label: 'Review the purchase order', href: '/doc/e1' } }));
    expect(token()).toMatchObject({ via: 'act', landing: { kind: 'region', region: 'ffe' } });
    expect(gateFor('/doc/e1')).toEqual({ play: false, cause: 'token' });
  });

  it('the name link on the same card writes no landing, and the Document plays', () => {
    render(
      <ul>
        <DeskClaimCard card={claim()} tone="project" index={0} settle={false} />
      </ul>,
    );
    render(<ArrivalMount />);
    fireEvent.click(document.querySelector('[data-roster-name]')!, { detail: 1 });
    expect(token()).toEqual({ via: 'ptr', to: '/doc/e1', at: expect.any(Number) });
    expect(gateFor('/doc/e1')).toEqual({ play: true, via: 'ptr', reduced: false });
  });
});

describe('the put-down row', () => {
  beforeEach(() => {
    mockPathname = '/desk';
    Element.prototype.scrollIntoView = jest.fn();
  });

  const html = document.documentElement;
  const frame = () => new Promise((resolve) => window.requestAnimationFrame(() => resolve(null)));
  const deskDom = (ready: boolean) => {
    document.body.innerHTML = `<main data-arrival="desk"${ready ? ' data-arrival-ready' : ''}><ul><li id="roster-line-e1"></li><li id="roster-line-e2"></li></ul></main>`;
  };
  afterEach(() => {
    html.className = '';
  });

  it('/doc/x → /desk writes pl-from-doc, spent at the Desk commit; the row lands only after ready', async () => {
    enterRoute('/doc/e2');
    enterRoute('/desk');
    expect(JSON.parse(window.sessionStorage.getItem(KEYS.FROM_DOC)!)).toMatchObject({ id: 'e2' });

    deskDom(false);
    render(<ArrivalMount />);
    expect(window.sessionStorage.getItem(KEYS.FROM_DOC)).toBeNull();
    await frame();
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();

    document.querySelector('main')!.setAttribute('data-arrival-ready', '');
    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1));
    const [call] = (Element.prototype.scrollIntoView as jest.Mock).mock.instances;
    expect(call).toBe(document.getElementById('roster-line-e2'));
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ block: 'center' });
  });

  it('is spent at the Desk commit even when the Desk never becomes ready', async () => {
    writeFromDoc('e2');
    deskDom(false);
    const view = render(<ArrivalMount />);
    expect(window.sessionStorage.getItem(KEYS.FROM_DOC)).toBeNull();
    view.unmount();
    deskDom(true);
    render(<ArrivalMount />);
    await frame();
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  it('a stale row (older than FROM_DOC_TTL_MS) lands nothing', async () => {
    writeFromDoc('e2', Date.now() - 15_000);
    deskDom(true);
    render(<ArrivalMount />);
    await frame();
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(KEYS.FROM_DOC)).toBeNull();
  });

  it('while the Desk’s arrival holds the page, waits for its end and lands on a declined one', async () => {
    writeFromDoc('e2');
    html.classList.add('arr-pre');
    deskDom(true);
    render(<ArrivalMount />);
    expect(window.sessionStorage.getItem(KEYS.FROM_DOC)).toBeNull();
    await frame();
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();

    html.classList.remove('arr-pre');
    window.dispatchEvent(
      new CustomEvent<ArrivalEnded>(EVENT_ENDED, { detail: { surface: 'desk', how: 'declined', cause: 'late' } }),
    );
    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1));
    expect((Element.prototype.scrollIntoView as jest.Mock).mock.instances[0]).toBe(
      document.getElementById('roster-line-e2'),
    );
  });

  it('a played Desk owns the viewport: the row never lands', async () => {
    writeFromDoc('e2');
    html.classList.add('arr-on');
    deskDom(true);
    render(<ArrivalMount />);
    html.classList.remove('arr-on');
    window.dispatchEvent(
      new CustomEvent<ArrivalEnded>(EVENT_ENDED, { detail: { surface: 'desk', how: 'settled' } }),
    );
    await frame();
    await frame();
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(KEYS.FROM_DOC)).toBeNull();
  });

  it('does nothing off the Desk', async () => {
    writeFromDoc('e2');
    mockPathname = '/doc/e1';
    deskDom(true);
    render(<ArrivalMount />);
    await frame();
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
    expect(JSON.parse(window.sessionStorage.getItem(KEYS.FROM_DOC)!)).toMatchObject({ id: 'e2' });
  });
});
