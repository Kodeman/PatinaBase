/**
 * US-14 arrival — entry classification (nav.ts): the hard load's navigation type only on the first
 * commit, popstate → back_forward, suppression spent once, and the put-down's pl-from-doc write.
 */
import { BUDGET, KEYS } from '../types';

type Nav = typeof import('../nav');

const NOW = 1_790_000_000_000;
let nav: Nav;

function stubNavigation(type: string, url: string) {
  Object.defineProperty(window.performance, 'getEntriesByType', {
    configurable: true,
    value: jest.fn(() => [{ type, name: url }]),
  });
}

beforeEach(() => {
  jest.resetModules();
  window.sessionStorage.clear();
  stubNavigation('navigate', 'http://localhost/desk');
  nav = require('../nav') as Nav;
});

afterAll(() => {
  delete (window.performance as unknown as { getEntriesByType?: unknown }).getEntriesByType;
});

describe('the first commit', () => {
  it('is the hard load when the tab loaded this path, typed by navigation timing', () => {
    stubNavigation('reload', 'http://localhost/doc/e1?x=1');
    const entry = nav.enterRoute('/doc/e1', NOW);
    expect(entry).toMatchObject({ entry: 'reload', hard: true, navType: 'reload' });
    expect(entry.entryAt).toBe(window.performance.timeOrigin);
  });

  it('maps navigate → hard and back_forward → back_forward', () => {
    expect(nav.enterRoute('/desk', NOW)).toMatchObject({ entry: 'hard', navType: 'navigate' });
    jest.resetModules();
    stubNavigation('back_forward', 'http://localhost/desk');
    const fresh = require('../nav') as Nav;
    expect(fresh.enterRoute('/desk', NOW)).toMatchObject({ entry: 'back_forward', hard: true });
  });

  it('is soft when the tab loaded another path and walked here', () => {
    stubNavigation('reload', 'http://localhost/projects');
    expect(nav.enterRoute('/desk', NOW)).toMatchObject({
      entry: 'soft',
      hard: false,
      navType: null,
      entryAt: NOW,
    });
  });
});

describe('later commits', () => {
  it('null the navigation type on a soft entry', () => {
    stubNavigation('reload', 'http://localhost/desk');
    nav.enterRoute('/desk', NOW);
    expect(nav.enterRoute('/doc/e1', NOW + 10)).toEqual({
      entry: 'soft',
      entryAt: NOW + 10,
      hard: false,
      navType: null,
      suppressedPath: null,
    });
  });

  it('read a popstate within POP_AGO_MS as back_forward, once', () => {
    nav.enterRoute('/desk', NOW);
    nav.notePopState(NOW + 1_000);
    expect(nav.enterRoute('/doc/e1', NOW + 1_000 + nav.POP_AGO_MS - 1).entry).toBe('back_forward');
    expect(nav.enterRoute('/desk', NOW + 1_000 + nav.POP_AGO_MS).entry).toBe('soft');
  });

  it('read a stale popstate as soft', () => {
    nav.enterRoute('/desk', NOW);
    nav.notePopState(NOW);
    expect(nav.enterRoute('/doc/e1', NOW + nav.POP_AGO_MS).entry).toBe('soft');
  });
});

describe('suppressNextArrival', () => {
  it('turns the named commit into a replace, once', () => {
    nav.enterRoute('/desk', NOW);
    nav.suppressNextArrival('/doc/e1?authorization=a1&from=desk', NOW);
    expect(nav.enterRoute('/doc/e1', NOW + 200)).toMatchObject({
      entry: 'replace',
      suppressedPath: '/doc/e1',
    });
    nav.enterRoute('/desk', NOW + 300);
    expect(nav.enterRoute('/doc/e1', NOW + 400)).toMatchObject({
      entry: 'soft',
      suppressedPath: null,
    });
  });

  it('is consumed once and honoured only within the token TTL', () => {
    nav.suppressNextArrival('/desk', NOW);
    expect(nav.consumeSuppressed('/desk', NOW + 1)).toBe(true);
    expect(nav.consumeSuppressed('/desk', NOW + 2)).toBe(false);
    nav.suppressNextArrival('/desk', NOW);
    expect(nav.consumeSuppressed('/desk', NOW + BUDGET.TOKEN_TTL_MS)).toBe(false);
  });

  it('a same-path suppression that never commits is spent by the next commit', () => {
    nav.enterRoute('/desk', NOW);
    nav.suppressNextArrival('/desk', NOW + 10);
    nav.enterRoute('/doc/e1', NOW + 20);
    expect(nav.enterRoute('/desk', NOW + 30).entry).toBe('soft');
  });
});

describe('the put-down', () => {
  const fromDoc = () => {
    const raw = window.sessionStorage.getItem(KEYS.FROM_DOC);
    return raw === null ? null : JSON.parse(raw);
  };

  it('writes pl-from-doc = {id, at} on /doc/[id] → /desk', () => {
    nav.enterRoute('/doc/e%201', NOW);
    expect(fromDoc()).toBeNull();
    nav.enterRoute('/desk', NOW + 10);
    expect(fromDoc()).toEqual({ id: 'e 1', at: NOW + 10 });
  });

  it('writes the engagement the Document named on its root, where the route carries another id', () => {
    nav.enterRoute('/doc/project-9', NOW);
    nav.noteDocEngagement('/doc/project-9', 'engagement-3');
    nav.enterRoute('/desk', NOW + 10);
    expect(fromDoc()).toEqual({ id: 'engagement-3', at: NOW + 10 });
  });

  it("ignores another Document's note", () => {
    nav.noteDocEngagement('/doc/other', 'engagement-x');
    nav.enterRoute('/doc/project-9', NOW);
    nav.enterRoute('/desk', NOW + 10);
    expect(fromDoc()).toEqual({ id: 'project-9', at: NOW + 10 });
  });

  it('writes nothing for any other walk', () => {
    nav.enterRoute('/desk', NOW);
    nav.enterRoute('/doc/e1', NOW + 10);
    nav.enterRoute('/doc/e2', NOW + 20);
    expect(fromDoc()).toBeNull();
  });

  it('clears an unconsumed row when the Desk is left', () => {
    nav.enterRoute('/doc/e1', NOW);
    nav.enterRoute('/desk', NOW + 10);
    expect(fromDoc()).not.toBeNull();
    nav.enterRoute('/library', NOW + 20);
    expect(fromDoc()).toBeNull();
  });
});

describe('a return from the Document’s own sub-route', () => {
  it('is a replace: the same paper', () => {
    nav.enterRoute('/desk', NOW);
    nav.enterRoute('/doc/e1', NOW + 10);
    nav.enterRoute('/doc/e1/plans', NOW + 20);
    expect(nav.enterRoute('/doc/e1', NOW + 30)).toMatchObject({ entry: 'replace', suppressedPath: null });
    nav.enterRoute('/doc/e1/boards/b2', NOW + 40);
    expect(nav.enterRoute('/doc/e1', NOW + 50).entry).toBe('replace');
  });

  it("is a soft entry from another Document's sub-route", () => {
    nav.enterRoute('/desk', NOW);
    nav.enterRoute('/doc/e2/plans', NOW + 10);
    expect(nav.enterRoute('/doc/e1', NOW + 20).entry).toBe('soft');
  });

  it('stays back_forward when a popstate brought her back', () => {
    nav.enterRoute('/desk', NOW);
    nav.enterRoute('/doc/e1/plans', NOW + 10);
    nav.notePopState(NOW + 15);
    expect(nav.enterRoute('/doc/e1', NOW + 20).entry).toBe('back_forward');
  });
});
