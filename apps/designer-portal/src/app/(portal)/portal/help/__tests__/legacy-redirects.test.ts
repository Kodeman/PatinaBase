/**
 * Legacy `/portal/help/**` retirement (help-desk Wave 1) — the three routes
 * are server redirect stubs now. `next/navigation`'s redirect() throws
 * NEXT_REDIRECT carrying the destination in its digest, so invoking the page
 * components directly pins where each old link lands (middleware auth-gates
 * the routes identically to the new ones, so the chain is signin → stub →
 * /help/…).
 */
// jest.setup.js mocks next/navigation WITHOUT `redirect` — restore the real
// module so these tests exercise Next's actual NEXT_REDIRECT throw.
jest.mock('next/navigation', () => jest.requireActual('next/navigation'));

import LegacyHelpCenterRedirect from '../page';
import LegacyHelpArticleRedirect from '../[surfaceKey]/page';
import LegacyHelpTopicRedirect from '../topic/[prefix]/page';

function redirectDigestOf(fn: () => unknown): string {
  try {
    fn();
  } catch (err) {
    return String((err as { digest?: string }).digest ?? '');
  }
  throw new Error('expected redirect() to throw');
}

async function asyncRedirectDigestOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (err) {
    return String((err as { digest?: string }).digest ?? '');
  }
  throw new Error('expected redirect() to throw');
}

describe('legacy /portal/help redirects', () => {
  it('index → /help', () => {
    const digest = redirectDigestOf(() => LegacyHelpCenterRedirect());
    expect(digest).toContain('NEXT_REDIRECT');
    expect(digest).toContain(';/help;');
  });

  it('article → /help/[surfaceKey], param preserved (encoded input)', async () => {
    const digest = await asyncRedirectDigestOf(
      LegacyHelpArticleRedirect({
        params: Promise.resolve({ surfaceKey: 'designer-portal%2Faesthete%2Foverview' }),
      }),
    );
    expect(digest).toContain(';/help/designer-portal%2Faesthete%2Foverview;');
  });

  it('article → /help/[surfaceKey], param preserved (decoded input)', async () => {
    const digest = await asyncRedirectDigestOf(
      LegacyHelpArticleRedirect({
        params: Promise.resolve({ surfaceKey: 'designer-portal/aesthete/overview' }),
      }),
    );
    expect(digest).toContain(';/help/designer-portal%2Faesthete%2Foverview;');
  });

  it('topic → /help/topic/[prefix], param preserved', async () => {
    const digest = await asyncRedirectDigestOf(
      LegacyHelpTopicRedirect({
        params: Promise.resolve({ prefix: 'designer-portal%2Fdocument%2Fdesk' }),
      }),
    );
    expect(digest).toContain(';/help/topic/designer-portal%2Fdocument%2Fdesk;');
  });
});
