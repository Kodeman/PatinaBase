/**
 * @jest-environment node
 */

import { retiredRouteTarget } from '../retired-routes';

/* ── Where the old addresses land ───────────────────────────────────────────
   Mail, SMS and Universal Links sent before the cutover still carry the old
   routes, and the iOS app claims three of them. The map's second job is
   naming WHICH house `/` opens: on its own it opens the house that moved
   last, which for a client with more than one is the wrong room.
   ────────────────────────────────────────────────────────────────────────── */

describe('/decisions/<id>', () => {
  it('lands on the ask itself and names the house it stands on', () => {
    expect(retiredRouteTarget('/decisions/dec-9')).toEqual({
      path: '/',
      anchor: 'approval-dec-9',
      params: { decision: 'dec-9' },
    });
  });

  it('refuses an id that is not a plain segment rather than carrying it', () => {
    expect(retiredRouteTarget('/decisions/..%2Fevil')).toEqual({
      path: '/',
      anchor: 'doorstep',
    });
  });

  it('sends the bare list to the doorstep', () => {
    expect(retiredRouteTarget('/decisions')).toEqual({
      path: '/',
      anchor: 'doorstep',
    });
  });

  it('leaves a deeper path alone', () => {
    expect(retiredRouteTarget('/decisions/dec-9/history')).toBeNull();
  });
});

describe('the instruments that already named their house', () => {
  it('carries the proposal onto the door', () => {
    expect(retiredRouteTarget('/proposals/prop-1')).toEqual({
      path: '/',
      anchor: 'door',
      params: { proposal: 'prop-1' },
    });
  });

  it('carries the invoice onto the letterbox', () => {
    expect(retiredRouteTarget('/invoices/inv-1')).toEqual({
      path: '/',
      anchor: 'letterbox',
      params: { invoice: 'inv-1' },
    });
  });

  it('folds the printable invoice like the invoice itself (W3b — the sheet is retired)', () => {
    expect(retiredRouteTarget('/invoices/inv-1/print')).toEqual({
      path: '/',
      anchor: 'letterbox',
      params: { invoice: 'inv-1' },
    });
  });

  /**
   * P-26. The two Record of Decision sheets ride the same carve-out: a page
   * that exists to be printed has no in-page equivalent to fold onto, and
   * folding it would send "Keep a copy" straight back to the ask it was
   * pressed on. Every OTHER address under both heads still folds.
   */
  it('leaves the two record sheets their own pages', () => {
    expect(retiredRouteTarget('/decisions/dec-1/record')).toBeNull();
    expect(retiredRouteTarget('/proposals/prop-7/record')).toBeNull();
  });

  it('still folds the addresses either record sits beside', () => {
    expect(retiredRouteTarget('/decisions/dec-1')).toEqual({
      path: '/',
      anchor: 'approval-dec-1',
      params: { decision: 'dec-1' },
    });
    expect(retiredRouteTarget('/proposals/prop-7/sign')).toEqual({
      path: '/',
      anchor: 'door',
      params: { proposal: 'prop-7' },
    });
  });
});
