/**
 * Unit tests for the client-portal role gate (pure decision + destination
 * mapping). These are the testable seams behind `middleware.ts` and the
 * `/wrong-portal` interstitial — no Supabase or Next runtime is exercised here.
 */

import {
  resolvePortalDecision,
  hasClientPortalDomain,
  firstForeignDomain,
  foreignPortalFromDomain,
  describeAccountKindFromDomain,
  resolveForeignPortalHome,
  describeAccountKind,
  type RoleLookup,
} from '../portal-access';

describe('hasClientPortalDomain', () => {
  it('permits a consumer-domain user (homeowner)', () => {
    expect(hasClientPortalDomain(['consumer'])).toBe(true);
  });

  it('permits an admin-domain user (cross-portal ops access)', () => {
    expect(hasClientPortalDomain(['admin'])).toBe(true);
  });

  it('rejects a designer-only user', () => {
    expect(hasClientPortalDomain(['designer'])).toBe(false);
  });

  it('rejects a manufacturer-only user', () => {
    expect(hasClientPortalDomain(['manufacturer'])).toBe(false);
  });

  it('permits a mixed-domain user when one domain is permitted', () => {
    expect(hasClientPortalDomain(['designer', 'consumer'])).toBe(true);
  });

  it('rejects a user with no roles', () => {
    expect(hasClientPortalDomain([])).toBe(false);
  });
});

describe('resolvePortalDecision', () => {
  const ok = (domains: Parameters<typeof hasClientPortalDomain>[0]): RoleLookup => ({
    status: 'ok',
    domains,
  });

  it('allows a consumer through a protected route', () => {
    expect(resolvePortalDecision(ok(['consumer']), '/proposals')).toEqual({ action: 'next' });
  });

  it('allows an admin through a protected route', () => {
    expect(resolvePortalDecision(ok(['admin']), '/projects')).toEqual({ action: 'next' });
  });

  it('redirects a designer to /wrong-portal carrying the original path and authoritative domain', () => {
    expect(resolvePortalDecision(ok(['designer']), '/proposals/abc')).toEqual({
      action: 'redirect',
      to: '/wrong-portal?from=%2Fproposals%2Fabc&as=designer',
    });
  });

  it('redirects a manufacturer with the manufacturer domain hint', () => {
    expect(resolvePortalDecision(ok(['manufacturer']), '/projects')).toEqual({
      action: 'redirect',
      to: '/wrong-portal?from=%2Fprojects&as=manufacturer',
    });
  });

  it('redirects a role-less user to /wrong-portal without a domain hint', () => {
    expect(resolvePortalDecision(ok([]), '/projects')).toEqual({
      action: 'redirect',
      to: '/wrong-portal?from=%2Fprojects',
    });
  });

  it('skips (does not brick) when the role lookup is unavailable — missing service key', () => {
    expect(
      resolvePortalDecision({ status: 'unavailable', reason: 'missing-service-key' }, '/proposals'),
    ).toEqual({ action: 'skip', reason: 'missing-service-key' });
  });

  it('skips when the role lookup errored', () => {
    expect(
      resolvePortalDecision({ status: 'unavailable', reason: 'lookup-error' }, '/proposals'),
    ).toEqual({ action: 'skip', reason: 'lookup-error' });
  });
});

describe('firstForeignDomain', () => {
  it('returns the first non-permitted domain', () => {
    expect(firstForeignDomain(['designer'])).toBe('designer');
    expect(firstForeignDomain(['manufacturer'])).toBe('manufacturer');
  });

  it('ignores permitted domains and returns the foreign one', () => {
    expect(firstForeignDomain(['consumer', 'designer'])).toBe('designer');
  });

  it('returns null when every domain is permitted', () => {
    expect(firstForeignDomain(['consumer', 'admin'])).toBeNull();
  });

  it('returns null for an empty list', () => {
    expect(firstForeignDomain([])).toBeNull();
  });
});

describe('foreignPortalFromDomain (authoritative, from middleware hint)', () => {
  it('maps the designer domain to the designer workspace', () => {
    expect(foreignPortalFromDomain('designer')?.url).toBe('https://app.patina.cloud');
  });

  it('maps the admin domain to the admin portal', () => {
    expect(foreignPortalFromDomain('admin')?.url).toBe('https://admin.patina.cloud');
  });

  it('returns null for manufacturer (no manufacturer portal) and unknown values', () => {
    expect(foreignPortalFromDomain('manufacturer')).toBeNull();
    expect(foreignPortalFromDomain('consumer')).toBeNull();
    expect(foreignPortalFromDomain('nonsense')).toBeNull();
  });
});

describe('describeAccountKindFromDomain (authoritative, from middleware hint)', () => {
  it('describes each known domain', () => {
    expect(describeAccountKindFromDomain('designer')).toBe('a designer');
    expect(describeAccountKindFromDomain('admin')).toBe('an administrator');
    expect(describeAccountKindFromDomain('manufacturer')).toBe('a manufacturer');
    expect(describeAccountKindFromDomain('consumer')).toBe('a homeowner');
  });

  it('falls back gracefully for an unknown domain', () => {
    expect(describeAccountKindFromDomain('nonsense')).toBe('a non-homeowner');
  });
});

describe('resolveForeignPortalHome', () => {
  it('sends designer-domain role names to the designer workspace', () => {
    expect(resolveForeignPortalHome(['independent_designer'])?.url).toBe('https://app.patina.cloud');
    expect(resolveForeignPortalHome(['studio_owner'])?.url).toBe('https://app.patina.cloud');
    expect(resolveForeignPortalHome(['designer'])?.url).toBe('https://app.patina.cloud');
  });

  it('sends admin-domain role names to the admin portal', () => {
    expect(resolveForeignPortalHome(['super_admin'])?.url).toBe('https://admin.patina.cloud');
    expect(resolveForeignPortalHome(['support_agent'])?.url).toBe('https://admin.patina.cloud');
  });

  it('prioritizes admin over designer for multi-role staff', () => {
    expect(resolveForeignPortalHome(['independent_designer', 'super_admin'])?.url).toBe(
      'https://admin.patina.cloud',
    );
  });

  it('returns null for consumer role names (they belong on the client portal)', () => {
    expect(resolveForeignPortalHome(['app_user'])).toBeNull();
    expect(resolveForeignPortalHome(['client'])).toBeNull();
  });

  it('returns null for manufacturer role names (no manufacturer portal cutover)', () => {
    expect(resolveForeignPortalHome(['brand_admin'])).toBeNull();
  });

  it('returns null for an empty role list', () => {
    expect(resolveForeignPortalHome([])).toBeNull();
  });
});

describe('describeAccountKind', () => {
  it('describes a designer account', () => {
    expect(describeAccountKind(['independent_designer'])).toBe('a designer');
  });

  it('describes an administrator account', () => {
    expect(describeAccountKind(['super_admin'])).toBe('an administrator');
  });

  it('describes a manufacturer account', () => {
    expect(describeAccountKind(['brand_admin'])).toBe('a manufacturer');
  });

  it('describes a homeowner account for consumer roles', () => {
    expect(describeAccountKind(['app_user'])).toBe('a homeowner');
  });

  it('falls back gracefully for unknown roles', () => {
    expect(describeAccountKind(['some_future_role'])).toBe('a non-homeowner');
  });
});
