/**
 * US-14 arrival — the tab's marks (session.ts): token TTL and `to` matching, consume-once, the
 * visit/Desk marks, and the window.name fallback where sessionStorage is refused.
 */
import { BUDGET, KEYS } from '../types';

type Session = typeof import('../session');

const NOW = 1_790_000_000_000;
let s: Session;

beforeEach(() => {
  jest.resetModules();
  window.sessionStorage.clear();
  window.name = '';
  s = require('../session') as Session;
});

afterEach(() => {
  jest.restoreAllMocks();
  window.name = '';
});

describe('the click token', () => {
  it('is honoured for its own pathname inside the TTL', () => {
    s.writeArriveToken({ via: 'ptr', to: '/doc/e1', at: NOW - 100 });
    expect(s.readArriveToken('/doc/e1', NOW)).toEqual({ via: 'ptr', to: '/doc/e1', at: NOW - 100 });
  });

  it('is refused at and past the TTL', () => {
    s.writeArriveToken({ via: 'kbd', to: '/doc/e1', at: NOW - BUDGET.TOKEN_TTL_MS });
    expect(s.readArriveToken('/doc/e1', NOW)).toBeNull();
    expect(s.readArriveToken('/doc/e1', NOW - 1)).not.toBeNull();
  });

  it('is refused for any other pathname (to mismatch)', () => {
    s.writeArriveToken({ via: 'act', to: '/doc/e1', at: NOW });
    expect(s.readArriveToken('/doc/e2', NOW)).toBeNull();
    expect(s.readArriveToken('/desk', NOW)).toBeNull();
  });

  it('is refused when dated in the future', () => {
    s.writeArriveToken({ via: 'ptr', to: '/doc/e1', at: NOW + 50 });
    expect(s.readArriveToken('/doc/e1', NOW)).toBeNull();
  });

  it('is consumed on read: once, and removed even when refused', () => {
    s.writeArriveToken({ via: 'act', to: '/doc/e1', at: NOW });
    expect(s.consumeArriveToken('/doc/e1', NOW)?.via).toBe('act');
    expect(s.consumeArriveToken('/doc/e1', NOW)).toBeNull();

    s.writeArriveToken({ via: 'act', to: '/doc/e1', at: NOW });
    expect(s.consumeArriveToken('/doc/e2', NOW)).toBeNull();
    expect(window.sessionStorage.getItem(KEYS.ARRIVE)).toBeNull();
  });

  it('keeps a well-formed landing and drops a malformed one', () => {
    s.writeArriveToken({ via: 'act', to: '/doc/e1', at: NOW, landing: { kind: 'region', region: 'money' } });
    expect(s.readArriveToken('/doc/e1', NOW)?.landing).toEqual({ kind: 'region', region: 'money' });

    window.sessionStorage.setItem(
      KEYS.ARRIVE,
      JSON.stringify({ via: 'act', to: '/doc/e1', at: NOW, landing: { kind: 'ffe' } }),
    );
    const token = s.readArriveToken('/doc/e1', NOW);
    expect(token).toEqual({ via: 'act', to: '/doc/e1', at: NOW });
  });

  it('refuses garbage', () => {
    window.sessionStorage.setItem(KEYS.ARRIVE, '{nope');
    expect(s.readArriveToken('/doc/e1', NOW)).toBeNull();
    window.sessionStorage.setItem(KEYS.ARRIVE, JSON.stringify({ via: 'mouse', to: '/doc/e1', at: NOW }));
    expect(s.readArriveToken('/doc/e1', NOW)).toBeNull();
  });
});

describe('the visit and the Desk mark', () => {
  it('a stale visit is a new visit: the Desk mark goes before the stamp', () => {
    window.sessionStorage.setItem(KEYS.VISIT, String(NOW - BUDGET.VISIT_MS));
    s.setDeskShown(NOW - BUDGET.VISIT_MS);
    s.markVisit(NOW);
    expect(s.readDeskShown()).toBe(false);
    expect(s.readVisit()).toBe(NOW);
  });

  it('a live visit keeps the Desk mark', () => {
    window.sessionStorage.setItem(KEYS.VISIT, String(NOW - 60_000));
    s.setDeskShown(NOW - 60_000);
    s.markVisit(NOW);
    expect(s.readDeskShown()).toBe(true);
  });

  it('no visit at all clears a stray Desk mark', () => {
    s.setDeskShown(NOW);
    s.markVisit(NOW);
    expect(s.readDeskShown()).toBe(false);
  });

  it('her hand refreshes the visit at most every 10 s', () => {
    const setItem = jest.spyOn(Storage.prototype, 'setItem');
    s.touchVisit(NOW);
    s.touchVisit(NOW + 5_000);
    s.touchVisit(NOW + 10_001);
    const stamps = setItem.mock.calls.filter(([key]) => key === KEYS.VISIT);
    expect(stamps.map(([, v]) => Number(v))).toEqual([NOW, NOW + 10_001]);
  });
});

describe('pl-from-doc and the e2e opt-in', () => {
  it('reads and consumes the put-down row once', () => {
    s.writeFromDoc('e7');
    expect(s.readFromDoc()).toBe('e7');
    expect(s.consumeFromDoc()).toBe('e7');
    expect(s.consumeFromDoc()).toBeNull();
  });

  it('opts in only on the literal "1"', () => {
    expect(s.readE2eOptIn()).toBe(false);
    window.sessionStorage.setItem(KEYS.E2E, '0');
    expect(s.readE2eOptIn()).toBe(false);
    window.sessionStorage.setItem(KEYS.E2E, '1');
    expect(s.readE2eOptIn()).toBe(true);
  });
});

describe('the window.name fallback', () => {
  beforeEach(() => {
    jest.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
  });

  it('keeps every mark after the marker, preserving the name a host already set', () => {
    window.name = 'host-frame';
    s.markVisit(NOW);
    s.setDeskShown(NOW);
    s.writeArriveToken({ via: 'kbd', to: '/doc/e1', at: NOW });

    expect(window.name.startsWith('host-frame⁣pl:')).toBe(true);
    expect(s.readVisit()).toBe(NOW);
    expect(s.readDeskShown()).toBe(true);
    expect(s.consumeArriveToken('/doc/e1', NOW)?.via).toBe('kbd');
    expect(s.readArriveToken('/doc/e1', NOW)).toBeNull();

    const line = JSON.parse(window.name.slice(window.name.indexOf('⁣pl:') + 4));
    expect(line).toEqual({ [KEYS.VISIT]: String(NOW), [KEYS.DESK]: String(NOW) });
  });

  it('reads a corrupt line as empty and never throws', () => {
    window.name = 'x⁣pl:{not json';
    expect(s.readVisit()).toBeNull();
    expect(() => s.markVisit(NOW)).not.toThrow();
    expect(s.readVisit()).toBe(NOW);
  });
});
