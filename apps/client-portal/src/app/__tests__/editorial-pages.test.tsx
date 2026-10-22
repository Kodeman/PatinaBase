import { render, screen } from '@testing-library/react';
import { createServerClient } from '@patina/supabase/server';

import HomePage from '../page';
import ProjectPage from '../projects/[projectId]/page';
import { fetchClientProjects, fetchClientProjectView } from '@/lib/data/projects';
import { resolveActiveHouse, resolveHouseForInstrument } from '@/lib/data/active-project';

jest.mock('@patina/supabase/server', () => ({ createServerClient: jest.fn() }));
jest.mock('@/lib/data/projects', () => ({ fetchClientProjects: jest.fn(), fetchClientProjectView: jest.fn() }));
jest.mock('@/lib/data/active-project', () => ({ resolveActiveHouse: jest.fn(), resolveHouseForInstrument: jest.fn() }));
jest.mock('@/components/threshold/threshold', () => ({
  Threshold: ({ editorial }: { editorial: unknown }) => (
    <div data-testid="surface" data-editorial={editorial ? 'present' : 'null'} />
  ),
}));
jest.mock('@/components/threshold/letterbox-door', () => ({ LetterboxDoor: () => null }));
jest.mock('@/components/projects/ProjectsEmptyState', () => ({ ProjectsEmptyState: () => null }));

const rpc = jest.fn();
const editorial = {
  project: { id: 'p1', name: 'The house', phase: 'procurement', targetDate: null, showMakers: false, studio: { name: 'Studio', town: null } },
  rooms: [], boards: [], sheets: [], palette: [],
  assets: [{
    id: 'plate-1', sha256: 'a'.repeat(64), sourceKind: 'upload', width: 2400, height: 1600,
    ground: 'scene', dominantHex: '#6B4F3A', lqip: null, focal: null, subjectBox: null,
    crops: {
      wide: { rect: [0, 0, 2400, 1500], widths: [1280, 1600, 2048] },
      cover_phone: { rect: [300, 0, 1720, 1500], widths: [640, 828, 1080] },
    },
    caption: { what: 'The library', whose: 'Studio', when: '14 October 2026' }, alt: 'The library',
  }],
};

beforeEach(() => {
  (fetchClientProjects as jest.Mock).mockResolvedValue([{ id: 'p1', name: 'The house' }]);
  (fetchClientProjectView as jest.Mock).mockResolvedValue({ project: { id: 'p1', name: 'The house' }, milestones: [] });
  (resolveActiveHouse as jest.Mock).mockResolvedValue('p1');
  (resolveHouseForInstrument as jest.Mock).mockResolvedValue(null);
  (createServerClient as jest.Mock).mockResolvedValue({ rpc });
  // No approved edition: the edition reader answers null and the page reads Phase 1.
  rpc.mockImplementation(async (fn: string) => ({
    data: fn === 'get_client_project_editorial' ? editorial : null,
    error: null,
  }));
});

/** The edition read first, then the Phase 1 envelope. */
function expectBothReads() {
  expect(rpc.mock.calls).toEqual([
    ['get_client_project_edition', { p_project_id: 'p1' }],
    ['get_client_project_editorial', { p_project_id: 'p1' }],
  ]);
}

const pages = [
  ['front door', () => HomePage({})],
  ['named project', () => ProjectPage({ params: Promise.resolve({ projectId: 'p1' }) })],
] as const;

it.each(pages)('%s always reads editorial and preloads its hero without analytics', async (_name, page) => {
  const analytics = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('analytics blocked'));
  render(await page());
  expectBothReads();
  expect(analytics).not.toHaveBeenCalled();
  const preloads = document.querySelectorAll('link[rel="preload"][as="image"]');
  expect(preloads.length).toBeGreaterThan(0);
  for (const link of preloads) expect(link.getAttribute('imagesrcset')).toContain('/plates/p1/');
  expect(screen.getByTestId('surface')).toHaveAttribute('data-editorial', 'present');
});

it.each(pages)('%s reads the approved edition alone and preloads its hero under the edition scope', async (_name, page) => {
  rpc.mockImplementation(async (fn: string) => ({
    data: fn === 'get_client_project_edition'
      ? {
          ...editorial,
          composition: { hero: { assetId: 'plate-1' }, chapters: [], notice: 'The page now opens on the library.' },
          edition: { id: 'ed-1', seq: 2, approvedAt: '2026-10-21T10:00:00Z', approvedBy: 'studio', notice: 'The page now opens on the library.' },
        }
      : editorial,
    error: null,
  }));
  render(await page());
  expect(rpc.mock.calls).toEqual([['get_client_project_edition', { p_project_id: 'p1' }]]);
  const preloads = document.querySelectorAll('link[rel="preload"][as="image"]');
  expect(preloads.length).toBeGreaterThan(0);
  for (const link of preloads) {
    expect(link.getAttribute('imagesrcset')).toContain('/plates/ed-1/');
    expect(link.getAttribute('imagesrcset')).not.toContain('/plates/p1/');
  }
});

it.each(pages)('%s falls back to the Phase 1 read when the edition reader errors', async (_name, page) => {
  rpc.mockImplementation(async (fn: string) =>
    fn === 'get_client_project_edition'
      ? { data: null, error: { code: 'PGRST202', message: 'function not found' } }
      : { data: editorial, error: null },
  );
  render(await page());
  expectBothReads();
  expect(screen.getByTestId('surface')).toHaveAttribute('data-editorial', 'present');
});

it.each(pages)('%s keeps the house without editorial or preloads when the reader fails', async (_name, page) => {
  rpc.mockResolvedValue({ data: null, error: { message: 'unavailable' } });
  render(await page());
  expectBothReads();
  expect(screen.getByTestId('surface')).toHaveAttribute('data-editorial', 'null');
  expect(document.querySelectorAll('link[rel="preload"][as="image"]')).toHaveLength(0);
});
