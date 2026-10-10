import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ZONES, ZONE_SUB_ITEMS } from '@/config/navigation';
import { SubNav } from '@/components/portal/sub-nav';
import {
  adminAuthDestination,
  buildRecoveryCallbackUrl,
  recoveryDestination,
  requestDestination,
} from '../auth-navigation';

jest.mock('@/hooks/use-active-zone', () => ({
  useActiveZone: () => ({
    zone: 'people',
    subNavItems: require('@/config/navigation').ZONE_SUB_ITEMS.people,
    isDeepPage: false,
    breadcrumbs: [],
    activeSubNavHref: '/users',
  }),
}));
jest.mock('@/hooks/useReducedMotion', () => ({ useReducedMotion: () => true }));

describe('admin navigation badge pairing', () => {
  it('keeps each queue count on its destination after the zone label changes', async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const data = url.includes('verification-queue')
        ? { count: 3 }
        : url.includes('applications')
          ? { pagination: { total: 5 } }
          : { pending: 7 };
      return { ok: true, json: async () => data } as Response;
    });

    try {
      expect(ZONES.find((zone) => zone.key === 'people')?.label).toBe('Users and studios');
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      render(
        React.createElement(
          QueryClientProvider,
          { client },
          React.createElement(SubNav),
        ),
      );

      for (const [href, label, count] of [
        ['/verification', 'Verification', 3],
        ['/applications', 'Applications', 5],
        ['/waitlist', 'Waitlist', 7],
      ] as const) {
        expect(ZONE_SUB_ITEMS.people.find((item) => item.href === href)?.label).toBe(label);
        expect(await screen.findByRole('link', { name: `${label} ${count}` })).toHaveAttribute('href', href);
      }
      expect(screen.getByRole('link', { name: 'Users' })).not.toHaveTextContent(/[357]/);
      expect(screen.getByRole('link', { name: 'Studios' })).not.toHaveTextContent(/[357]/);
    } finally {
      global.fetch = originalFetch;
    }
  });
});

describe('admin auth navigation', () => {
  it('keeps an internal pathname with its complete query', () => {
    expect(requestDestination('/orders', '?state=late&sort=age')).toBe(
      '/orders?state=late&sort=age',
    );
    expect(adminAuthDestination('/people?role=admin&page=2')).toBe(
      '/people?role=admin&page=2',
    );
  });

  it.each([
    'https://attacker.example/steal',
    '//attacker.example/steal',
    '/%2f%2fattacker.example/steal',
    '/\\attacker.example/steal',
  ])('rejects an open-redirect target: %s', (target) => {
    expect(adminAuthDestination(target)).toBe('/dashboard');
  });

  it('forces recovery callbacks through the reset-password route', () => {
    expect(recoveryDestination('/orders?state=late')).toBe(
      '/auth/reset-password',
    );
    expect(recoveryDestination('//attacker.example')).toBe(
      '/auth/reset-password',
    );
    expect(
      recoveryDestination(
        '/auth/reset-password?callbackUrl=%2Forders%3Fstate%3Dlate',
      ),
    ).toBe('/auth/reset-password?callbackUrl=%2Forders%3Fstate%3Dlate');
  });

  it('builds a recovery callback that retains the final full destination', () => {
    const callback = new URL(
      buildRecoveryCallbackUrl(
        'https://admin.patina.cloud',
        '/orders?state=late&sort=age',
      ),
    );
    expect(callback.origin).toBe('https://admin.patina.cloud');
    expect(callback.pathname).toBe('/auth/callback');
    expect(callback.searchParams.get('type')).toBe('recovery');
    expect(callback.searchParams.get('callbackUrl')).toBe(
      '/auth/reset-password?callbackUrl=%2Forders%3Fstate%3Dlate%26sort%3Dage',
    );
  });
});
