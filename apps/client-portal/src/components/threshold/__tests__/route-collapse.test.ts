import { ROUTE_COLLAPSE, collapsedHref } from '../route-collapse';

describe('ROUTE_COLLAPSE', () => {
  it('maps all eight old destinations plus the sign-in landing to their Threshold anchor', () => {
    expect(ROUTE_COLLAPSE).toEqual({
      '/today': 'doorstep',
      '/decisions': 'doorstep',
      '/proposals': 'door',
      '/invoices': 'letterbox',
      '/budget': 'ledger',
      '/documents': 'mat-papers',
      '/orders': 'road',
      '/messages': 'note',
      '/projects': 'doorstep',
    });
  });
});

describe('collapsedHref — a client with one house', () => {
  it.each(Object.entries(ROUTE_COLLAPSE))(
    'collapses exact match %s to its anchor on that house',
    (pathname, anchor) => {
      expect(collapsedHref(pathname, ['proj-1'])).toBe(`/projects/proj-1#${anchor}`);
    },
  );

  it('strips a single trailing slash before matching', () => {
    expect(collapsedHref('/today/', ['proj-1'])).toBe('/projects/proj-1#doorstep');
  });

  it('does not collapse a nested route under a mapped prefix', () => {
    expect(collapsedHref('/proposals/abc/sign', ['proj-1'])).toBeNull();
  });

  it('does not collapse a route with a nested id', () => {
    expect(collapsedHref('/decisions/req-1', ['proj-1'])).toBeNull();
  });

  it('collapses the bare sign-in landing route to the doorstep', () => {
    expect(collapsedHref('/projects', ['proj-1'])).toBe('/projects/proj-1#doorstep');
  });

  it('does not collapse the collapse destination itself', () => {
    expect(collapsedHref('/projects/proj-1', ['proj-1'])).toBeNull();
    expect(collapsedHref('/projects/proj-2', ['proj-1'])).toBeNull();
  });

  it('does not collapse a nested route under the project page', () => {
    expect(collapsedHref('/projects/proj-1/rooms', ['proj-1'])).toBeNull();
  });

  it('returns null for an unmapped path', () => {
    expect(collapsedHref('/account', ['proj-1'])).toBeNull();
  });
});

describe('collapsedHref — a client with several houses', () => {
  it.each(Object.entries(ROUTE_COLLAPSE))(
    'collapses exact match %s to its anchor on the front door',
    (pathname, anchor) => {
      expect(collapsedHref(pathname, ['proj-1', 'proj-2'])).toBe(`/#${anchor}`);
    },
  );

  it('leaves the front door itself alone, so the hop cannot repeat', () => {
    expect(collapsedHref('/', ['proj-1', 'proj-2'])).toBeNull();
  });

  it('still keeps a nested route on its own page', () => {
    expect(collapsedHref('/proposals/abc/sign', ['proj-1', 'proj-2'])).toBeNull();
  });
});

describe('collapsedHref — a client with no house', () => {
  it('leaves every mapped route alone: there is nowhere to land', () => {
    for (const pathname of Object.keys(ROUTE_COLLAPSE)) {
      expect(collapsedHref(pathname, [])).toBeNull();
    }
  });
});
