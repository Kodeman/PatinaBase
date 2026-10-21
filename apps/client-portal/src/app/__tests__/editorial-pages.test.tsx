import { render, screen } from '@testing-library/react';
import { createServerClient } from '@patina/supabase/server';

import HomePage from '../page';
import ProjectPage from '../projects/[projectId]/page';
import { fetchClientProjects, fetchClientProjectView } from '@/lib/data/projects';
import { resolveActiveHouse, resolveHouseForInstrument } from '@/lib/data/active-project';
import { clientEditionEnabled } from '@/lib/server-feature-flag';

jest.mock('@patina/supabase/server', () => ({ createServerClient: jest.fn() }));
jest.mock('@/lib/server-feature-flag', () => ({ clientEditionEnabled: jest.fn() }));
jest.mock('@/lib/data/projects', () => ({ fetchClientProjects: jest.fn(), fetchClientProjectView: jest.fn() }));
jest.mock('@/lib/data/active-project', () => ({ resolveActiveHouse: jest.fn(), resolveHouseForInstrument: jest.fn() }));
jest.mock('@/components/threshold/threshold', () => ({
  Threshold: ({ editorial, editionEnabled }: { editorial: unknown; editionEnabled: boolean }) => (
    <div data-testid="surface" data-editorial={editorial ? 'present' : 'null'} data-enabled={String(editionEnabled)} />
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
  rpc.mockResolvedValue({ data: editorial, error: null });
});

it.each([
  ['front door', () => HomePage({})],
  ['named project', () => ProjectPage({ params: Promise.resolve({ projectId: 'p1' }) })],
] as const)('%s gates editorial acquisition and head preloads with one server decision', async (_name, page) => {
  (clientEditionEnabled as jest.Mock).mockResolvedValue(false);
  const off = render(await page());
  expect(clientEditionEnabled).toHaveBeenCalledTimes(1);
  expect(rpc).not.toHaveBeenCalled();
  expect(document.head.querySelectorAll('link[rel="preload"][as="image"]')).toHaveLength(0);
  expect(off.container.querySelectorAll('link[rel="preload"]')).toHaveLength(0);
  expect(screen.getByTestId('surface')).toHaveAttribute('data-editorial', 'null');
  expect(screen.getByTestId('surface')).toHaveAttribute('data-enabled', 'false');
  off.unmount();

  (clientEditionEnabled as jest.Mock).mockClear().mockResolvedValue(true);
  render(await page());
  expect(clientEditionEnabled).toHaveBeenCalledTimes(1);
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(rpc).toHaveBeenCalledWith('get_client_project_editorial', { p_project_id: 'p1' });
  const preloads = document.querySelectorAll('link[rel="preload"][as="image"]');
  expect(preloads.length).toBeGreaterThan(0);
  for (const link of preloads) expect(link.getAttribute('imagesrcset')).toContain('/plates/p1/');
  expect(screen.getByTestId('surface')).toHaveAttribute('data-editorial', 'present');
  expect(screen.getByTestId('surface')).toHaveAttribute('data-enabled', 'true');
});
