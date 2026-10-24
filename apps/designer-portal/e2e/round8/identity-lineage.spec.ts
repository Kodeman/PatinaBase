import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures/auth';
import { psqlRun, psqlScalar } from '../helpers/psql';

const id = (suffix: string) => `f2740000-0000-4000-8000-0000000000${suffix}`;
const owner = 'f0180000-0000-4000-8000-000000000002';

async function openDocument(page: Page, documentId: string) {
  await page.goto(`/doc/${documentId}`, { waitUntil: 'domcontentloaded' });
  const shell = page.locator('[data-document-shell]');
  await expect(shell).toHaveAttribute('data-arrival-ready', '', { timeout: 60_000 });
  await expect(page.locator('html')).not.toHaveClass(/\barr-(?:pre|on|press)\b/, { timeout: 30_000 });
  return shell;
}

test.describe('F02/F03 existing mounted identity and lineage', () => {
  test.setTimeout(240_000);
  test.beforeAll(() => {
    for (const url of [process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres']) {
      if (new URL(url).hostname !== '127.0.0.1') throw new Error('Lineage fixtures require 127.0.0.1');
    }
    psqlRun(readFileSync(path.join(__dirname, 'identity-lineage-fixture.sql'), 'utf8'));
  });

  test.afterAll(() => {
    // Exact fictional IDs only; refuse cleanup if any owner is not our fixture actor.
    psqlRun(`BEGIN;
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM public.projects WHERE id IN ('${id('15')}', '${id('16')}') AND designer_id IS DISTINCT FROM '${owner}'::uuid)
        OR EXISTS (SELECT 1 FROM public.proposals WHERE id IN ('${id('13')}', '${id('23')}', '${id('24')}') AND designer_id IS DISTINCT FROM '${owner}'::uuid)
        OR EXISTS (SELECT 1 FROM public.designer_clients WHERE id IN ('${id('12')}', '${id('22')}') AND designer_id IS DISTINCT FROM '${owner}'::uuid)
        OR EXISTS (SELECT 1 FROM public.leads WHERE id IN ('${id('10')}', '${id('11')}') AND designer_id IS DISTINCT FROM '${owner}'::uuid)
        THEN RAISE EXCEPTION 'Nonfixture owner: refusing cleanup'; END IF;
      END $$;
      DELETE FROM public.projects WHERE id IN ('${id('15')}', '${id('16')}');
      DELETE FROM public.proposals WHERE id = '${id('24')}';
      DELETE FROM public.proposals WHERE id IN ('${id('13')}', '${id('23')}');
      DELETE FROM public.designer_clients WHERE id IN ('${id('12')}', '${id('22')}');
      DELETE FROM public.leads WHERE id IN ('${id('10')}', '${id('11')}');
      COMMIT;`);
    expect(psqlScalar("SELECT count(*) FROM public.leads WHERE id::text LIKE 'f2740000-%'" )).toBe('0');
  });

  test('keeps original inquiry notes and old lead/proposal links on their canonical document', async ({ authenticatedPage: page }) => {
    await openDocument(page, id('10'));
    await expect(page.getByText('“F02 original inquiry: keep the piano.”')).toBeVisible();
    // Imported accepted legacy state, not a forged signature or a signing test.
    for (const alias of ['11', '12', '13', '15']) {
      await openDocument(page, id(alias));
      await expect(page).toHaveURL(new RegExp(`/doc/${id('15')}(?:\\?|$)`));
      await expect(page.getByRole('heading', { level: 1 })).toContainText('F02 Fictional Commission');
    }
    expect(psqlScalar(`SELECT project_description FROM public.leads WHERE id = '${id('11')}'`)).toBe('F02 original accepted inquiry: keep the piano.');
    expect(psqlScalar(`SELECT lead_id FROM public.designer_clients WHERE id = '${id('12')}'`)).toBe(id('11'));
    await page.screenshot({ path: test.info().outputPath('f02-commission.png'), fullPage: true });
  });

  test('keeps root and revised proposal ids as aliases of the same live version', async ({ authenticatedPage: page }) => {
    for (const alias of ['23', '24']) {
      await openDocument(page, id(alias));
      await expect(page.getByRole('heading', { level: 1 })).toContainText('F02 Fictional Revision');
    }
    const versions = psqlScalar(`BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claims = '{"sub":"${owner}","role":"authenticated"}'; SELECT (public.document_open('${id('23')}')->'ids'->>'proposal_id') = (public.document_open('${id('24')}')->'ids'->>'proposal_id'); ROLLBACK;`);
    expect(versions).toBe('t');
  });

  test('opens a direct project without forging an agreement or source inquiry', async ({ authenticatedPage: page }) => {
    await openDocument(page, id('16'));
    await expect(page.getByRole('heading', { level: 1 })).toContainText('F03 Fictional Direct Project');
    await expect(page.locator('[data-document-paper]')).not.toContainText('F02 original');
    expect(psqlScalar(`SELECT proposal_id IS NULL FROM public.projects WHERE id = '${id('16')}'`)).toBe('t');
    await page.screenshot({ path: test.info().outputPath('f03-direct.png'), fullPage: true });
  });
});
