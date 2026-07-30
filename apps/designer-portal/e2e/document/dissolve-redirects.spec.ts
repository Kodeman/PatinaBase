import { test, expect, type APIRequestContext } from '@playwright/test';

/**
 * The R21 dissolve — the permanent redirect table (I109).
 *
 * The `(portal)` zone tree is gone. This spec is the contract test for the
 * table that answers for it: `redirects()` in next.config.js.
 *
 * Why request-level and not page-level:
 *  · next.config redirects fire BEFORE middleware, so no session is needed —
 *    this whole file runs unauthenticated, which is also the honest simulation
 *    of a cold click from an old email.
 *  · `maxRedirects: 0` pins the ACTUAL status and Location header. A page.goto
 *    would only prove where the browser ended up, which is a weaker claim: it
 *    would still pass if the table 302'd, or chained /portal/x → /portal → /desk.
 *
 * What each assertion holds:
 *  · status 308 — `permanent: true`, so a crawler and a browser cache treat the
 *    old URL as gone for good.
 *  · one hop — Location names the FINAL destination, never another /portal path.
 *  · the doorway grammar — the sheets that have no route of their own
 *    (Orders / Accounts / Hours / the Post / the Account sheet) are addressed by
 *    `?book=` / `?account=` on /desk, which desk-doorway.tsx consumes.
 */

/** Fetch without following, and return status + Location. */
async function hop(
  request: APIRequestContext,
  from: string,
): Promise<{ status: number; location: string }> {
  const res = await request.get(from, { maxRedirects: 0 });
  return { status: res.status(), location: res.headers()['location'] ?? '' };
}

/** Location as a path + a param bag, so an appended param can't fail a case
 *  that is otherwise correct (Next appends unconsumed path params as query). */
function parse(location: string): { pathname: string; params: URLSearchParams } {
  const url = new URL(location, 'http://localhost:3000');
  return { pathname: url.pathname, params: url.searchParams };
}

const PROJECT_ID = '11111111-2222-3333-4444-555555555555';
const SCAN_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

test.describe('R21 dissolve — the permanent redirect table', () => {
  test('every legacy path answers with a permanent 308, never a temporary hop', async ({
    request,
  }) => {
    for (const from of [
      '/portal',
      '/portal/projects',
      '/portal/clients',
      '/portal/billing/ar',
      '/portal/settings',
      '/portal/help',
      '/projects',
    ]) {
      const { status } = await hop(request, from);
      expect(status, `${from} must be a permanent redirect`).toBe(308);
    }
  });

  test('no destination is another /portal path — the table never chains', async ({
    request,
  }) => {
    for (const from of [
      '/portal',
      '/portal/insights',
      '/portal/companion',
      '/portal/resources',
      '/portal/procurement/by-status',
      '/portal/library/search',
      '/portal/teaching/deep',
      '/portal/decisions/analytics',
      '/portal/some/route/that/never/existed',
      // The pre-dissolve bare paths used to hop THROUGH /portal.
      '/projects',
      '/settings',
      '/catalog',
      '/teaching',
      '/communications',
    ]) {
      const { location } = await hop(request, from);
      expect(location, `${from} must not redirect into /portal`).not.toContain('/portal');
      expect(location, `${from} must name a destination`).not.toBe('');
    }
  });

  test('the bare landing lands on the Desk', async ({ request }) => {
    const { status, location } = await hop(request, '/portal');
    expect(status).toBe(308);
    expect(parse(location).pathname).toBe('/desk');
  });

  test('a project id keeps its document', async ({ request }) => {
    const { location } = await hop(request, `/portal/projects/${PROJECT_ID}`);
    expect(parse(location).pathname).toBe(`/doc/${PROJECT_ID}`);
  });

  test('a project sub-route collapses onto the one document', async ({ request }) => {
    for (const leaf of ['time', 'complete', 'ffe', 'financials', 'decisions', 'edit']) {
      const { location } = await hop(request, `/portal/projects/${PROJECT_ID}/${leaf}`);
      expect(parse(location).pathname, leaf).toBe(`/doc/${PROJECT_ID}`);
    }
  });

  test('the Room File is scan-keyed, not project-keyed', async ({ request }) => {
    const { location } = await hop(
      request,
      `/portal/projects/${PROJECT_ID}/room-file/${SCAN_ID}`,
    );
    expect(parse(location).pathname).toBe(`/room/${SCAN_ID}/file`);
  });

  test('a proposal scope goes to the Drafting Room; everything else to the document', async ({
    request,
  }) => {
    const scope = await hop(request, `/portal/proposals/${PROJECT_ID}/scope`);
    expect(parse(scope.location).pathname).toBe(`/drafting/${PROJECT_ID}`);

    const signed = await hop(request, `/portal/proposals/${PROJECT_ID}/signed`);
    expect(parse(signed.location).pathname).toBe(`/doc/${PROJECT_ID}`);
  });

  test('a lead id and a decision id both resolve through /doc', async ({ request }) => {
    const lead = await hop(request, `/portal/leads/${PROJECT_ID}`);
    expect(parse(lead.location).pathname).toBe(`/doc/${PROJECT_ID}`);

    const decision = await hop(request, `/portal/decisions/${PROJECT_ID}`);
    expect(parse(decision.location).pathname).toBe(`/doc/${PROJECT_ID}`);
  });

  test('clients and makers become People, with the person deep link intact', async ({
    request,
  }) => {
    const client = await hop(request, `/portal/clients/${PROJECT_ID}`);
    const c = parse(client.location);
    expect(c.pathname).toBe('/people');
    expect(c.params.get('person')).toBe(PROJECT_ID);
    expect(c.params.get('role')).toBe('client');

    const clients = parse((await hop(request, '/portal/clients')).location);
    expect(clients.pathname).toBe('/people');
    expect(clients.params.get('role')).toBe('client');

    const maker = parse((await hop(request, `/portal/vendors/${PROJECT_ID}`)).location);
    expect(maker.pathname).toBe('/people');
    expect(maker.params.get('person')).toBe(PROJECT_ID);
    expect(maker.params.get('role')).toBe('maker');

    // `new` must not read as a maker id.
    const addMaker = parse((await hop(request, '/portal/vendors/new')).location);
    expect(addMaker.pathname).toBe('/people');
    expect(addMaker.params.get('add')).toBe('maker');
  });

  test('the People lens params carry the retired list zones', async ({ request }) => {
    const cases: Array<[string, string, string]> = [
      ['/portal/messages', 'view', 'threads'],
      ['/portal/nurture', 'view', 'nurture'],
      ['/portal/reviews', 'view', 'reviews'],
      ['/portal/portfolio', 'view', 'portfolio'],
      ['/portal/communications', 'view', 'outreach'],
      ['/portal/communications/campaigns', 'view', 'outreach'],
      ['/portal/teaching/your-eye', 'view', 'your-eye'],
    ];
    for (const [from, key, value] of cases) {
      const { pathname, params } = parse((await hop(request, from)).location);
      expect(pathname, from).toBe('/people');
      expect(params.get(key), from).toBe(value);
    }
    const thread = parse((await hop(request, `/portal/messages/${PROJECT_ID}`)).location);
    expect(thread.pathname).toBe('/people');
    expect(thread.params.get('thread')).toBe(PROJECT_ID);
  });

  test('a product id keeps its Piece Room', async ({ request }) => {
    for (const from of [
      `/portal/catalog/${PROJECT_ID}`,
      `/portal/catalog/${PROJECT_ID}/edit`,
      `/portal/teaching/product/${PROJECT_ID}`,
      `/catalog/${PROJECT_ID}`,
    ]) {
      expect(parse((await hop(request, from)).location).pathname, from).toBe(
        `/library/${PROJECT_ID}`,
      );
    }
  });

  test('the static catalog segments are not mistaken for product ids', async ({
    request,
  }) => {
    for (const from of [
      '/portal/catalog/new',
      '/portal/catalog/import',
      '/portal/catalog/categories',
      '/portal/catalog/collections',
      '/portal/library/studio',
      '/portal/teaching/validate',
    ]) {
      expect(parse((await hop(request, from)).location).pathname, from).toBe('/library');
    }
  });

  test('the rehoused judgments Room keeps its own address', async ({ request }) => {
    const { location } = await hop(request, '/portal/teaching/judgments');
    expect(parse(location).pathname).toBe('/library/judgments');
  });

  test('the Orders book opens through the doorway params', async ({ request }) => {
    const cases: Array<[string, string | null]> = [
      ['/portal/procurement/receiving', 'receiving'],
      ['/portal/procurement/by-vendor', 'vendors'],
      ['/portal/procurement/expediting', 'week'],
      ['/portal/procurement', null],
      ['/portal/procurement/calendar', null],
    ];
    for (const [from, page] of cases) {
      const { pathname, params } = parse((await hop(request, from)).location);
      expect(pathname, from).toBe('/desk');
      expect(params.get('book'), from).toBe('orders');
      expect(params.get('page'), from).toBe(page);
    }
  });

  test('the Accounts book opens through the doorway params, invoice id intact', async ({
    request,
  }) => {
    const ar = parse((await hop(request, '/portal/billing/ar')).location);
    expect(ar.pathname).toBe('/desk');
    expect(ar.params.get('book')).toBe('accounts');
    expect(ar.params.get('page')).toBe('receivables');

    const folio = parse(
      (await hop(request, `/portal/billing/invoices/${PROJECT_ID}`)).location,
    );
    expect(folio.params.get('book')).toBe('accounts');
    expect(folio.params.get('page')).toBe('ledger');
    expect(folio.params.get('invoiceId')).toBe(PROJECT_ID);

    const earnings = parse((await hop(request, '/portal/earnings')).location);
    expect(earnings.params.get('book')).toBe('accounts');
    expect(earnings.params.get('page')).toBe('earnings');
  });

  test('Hours and the Post are books too', async ({ request }) => {
    const hours = parse((await hop(request, '/portal/time')).location);
    expect(hours.pathname).toBe('/desk');
    expect(hours.params.get('book')).toBe('hours');

    const post = parse((await hop(request, '/portal/inbox')).location);
    expect(post.pathname).toBe('/desk');
    expect(post.params.get('book')).toBe('post');
  });

  test('the settings pages become Account-sheet doorways', async ({ request }) => {
    const cases: Array<[string, string]> = [
      ['/portal/settings', 'profile'],
      ['/portal/settings/notifications', 'notifications'],
      ['/portal/settings/security', 'security'],
      ['/portal/settings/devices', 'devices'],
      ['/portal/profile', 'profile'],
      ['/settings', 'profile'],
    ];
    for (const [from, account] of cases) {
      const { pathname, params } = parse((await hop(request, from)).location);
      expect(pathname, from).toBe('/desk');
      expect(params.get('account'), from).toBe(account);
    }
  });

  test('the unsubscribe token survives the hop to /preferences', async ({ request }) => {
    const { status, location } = await hop(
      request,
      '/portal/preferences?token=abc123&tab=digest',
    );
    expect(status).toBe(308);
    const { pathname, params } = parse(location);
    // R91: /preferences is a real page, never a doorway — an emailed
    // unsubscribe link must arrive with its token or the flow is broken.
    expect(pathname).toBe('/preferences');
    expect(params.get('token')).toBe('abc123');
    expect(params.get('tab')).toBe('digest');
  });

  test('the help tree re-homes segment for segment', async ({ request }) => {
    expect(parse((await hop(request, '/portal/help')).location).pathname).toBe('/help');
    expect(
      parse((await hop(request, '/portal/help/designer-portal%2Fdocument%2Fdesk')).location)
        .pathname,
    ).toBe('/help/designer-portal%2Fdocument%2Fdesk');
    expect(
      parse((await hop(request, '/portal/help/topic/getting-started')).location).pathname,
    ).toBe('/help/topic/getting-started');
    expect(parse((await hop(request, '/portal/resources')).location).pathname).toBe('/help');
  });

  test('a rooms.id lands on the roster — never on /room/:id, a different key space', async ({
    request,
  }) => {
    for (const from of ['/portal/rooms', `/portal/rooms/${PROJECT_ID}`]) {
      const { pathname } = parse((await hop(request, from)).location);
      expect(pathname, from).toBe('/rooms');
    }
  });

  test('the catchall answers for anything the table forgot', async ({ request }) => {
    const { status, location } = await hop(request, '/portal/a/route/that/never/existed');
    expect(status).toBe(308);
    expect(parse(location).pathname).toBe('/desk');
  });

  test('the pre-dissolve bare paths name their final destination directly', async ({
    request,
  }) => {
    expect(parse((await hop(request, `/projects/${PROJECT_ID}`)).location).pathname).toBe(
      `/doc/${PROJECT_ID}`,
    );
    expect(parse((await hop(request, `/leads/${PROJECT_ID}`)).location).pathname).toBe(
      `/doc/${PROJECT_ID}`,
    );
    expect(parse((await hop(request, `/proposals/${PROJECT_ID}/scope`)).location).pathname).toBe(
      `/drafting/${PROJECT_ID}`,
    );
    const earnings = parse((await hop(request, '/earnings')).location);
    expect(earnings.pathname).toBe('/desk');
    expect(earnings.params.get('book')).toBe('accounts');
  });

  test('a live document route is NOT permanently redirected', async ({ request }) => {
    // Guards against a source pattern that accidentally shadows a real room.
    // The exact status varies with the session (200 signed in, 307 to
    // /auth/signin otherwise) — the invariant is only that it is never a
    // PERMANENT redirect, which would mean the table swallowed a real page.
    for (const from of [
      '/desk',
      '/library',
      '/library/judgments',
      '/people',
      '/rooms',
      '/preferences',
      '/help',
    ]) {
      const { status, location } = await hop(request, from);
      expect(status, `${from} must not be a permanent redirect`).not.toBe(308);
      expect(status, `${from} must not be a permanent redirect`).not.toBe(301);
      if (location) {
        expect(location, `${from} must never be sent into /portal`).not.toContain('/portal');
      }
    }
  });
});
