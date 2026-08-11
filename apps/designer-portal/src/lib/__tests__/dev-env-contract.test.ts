/** @jest-environment node */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getAccountsForPortal } from '@patina/types';

type TurboConfig = {
  tasks?: {
    dev?: {
      passThroughEnv?: string[];
    };
  };
};

describe('designer portal development environment', () => {
  it('passes the browser and server Supabase connection through Turborepo', () => {
    const turboConfig = JSON.parse(
      readFileSync(resolve(__dirname, '../../../../../turbo.json'), 'utf8'),
    ) as TurboConfig;
    const passThroughEnv = turboConfig.tasks?.dev?.passThroughEnv ?? [];

    expect(passThroughEnv).toEqual(
      expect.arrayContaining([
        'NEXT_PUBLIC_SUPABASE_URL',
        'NEXT_PUBLIC_SUPABASE_ANON_KEY',
        'SUPABASE_INTERNAL_URL',
        'SUPABASE_SERVICE_ROLE_KEY',
        'SUPABASE_DB_URL',
      ]),
    );
  });

  it('only offers accounts that are authorized for the designer portal', () => {
    const accountIds = getAccountsForPortal('designer').map(
      (account) => account.id,
    );

    expect(accountIds).toEqual([
      'super_admin',
      'admin',
      'studio_manager',
      'designer',
    ]);
  });
});
