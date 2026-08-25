/**
 * FC-R10's acceptance criterion, pinned: mounting this section unflagged on
 * the project spread must be invisible on a project with no field data.
 * The section has two null paths — nothing loaded yet, and nothing to show —
 * and both must produce an empty render, not empty chrome.
 */

import { render } from '@testing-library/react';
import { RoomFilesSection } from '../room-files-section';

type Scan = { id: string; name: string | null; scanned_at: string | null; created_at: string };
type RoomFile = { unverified?: boolean; drawings?: { sheet_count?: number } };

let scans: Scan[] | undefined;
let byScan: Map<string, RoomFile> | undefined;

jest.mock('@patina/supabase', () => ({
  useProjectRoomScans: () => ({ data: scans }),
  useGeneratedRoomFilesByScan: () => ({ data: byScan }),
}));

const PROJECT = '11111111-2222-3333-4444-555555555555';

beforeEach(() => {
  scans = undefined;
  byScan = undefined;
});

describe('RoomFilesSection — the unflagged-mount safety property (FC-R10)', () => {
  it('renders NOTHING for a project whose scans carry no Room File', () => {
    scans = [{ id: 'scan-1', name: 'Living', scanned_at: null, created_at: '2026-08-01T00:00:00Z' }];
    byScan = new Map();
    const { container } = render(<RoomFilesSection projectId={PROJECT} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders NOTHING for a project with no scans at all', () => {
    scans = [];
    byScan = new Map();
    const { container } = render(<RoomFilesSection projectId={PROJECT} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders NOTHING while the queries are still in flight', () => {
    const { container } = render(<RoomFilesSection projectId={PROJECT} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders NOTHING for a non-UUID project id (the pre-project document)', () => {
    scans = [{ id: 'scan-1', name: 'Living', scanned_at: null, created_at: '2026-08-01T00:00:00Z' }];
    byScan = new Map([['scan-1', { drawings: { sheet_count: 4 } }]]);
    const { container } = render(<RoomFilesSection projectId="not-a-uuid" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders one row per Room-File-bearing scan, each a door into /room/<id>/file', () => {
    scans = [
      { id: 'scan-1', name: 'Living', scanned_at: '2026-08-01T00:00:00Z', created_at: '2026-08-01T00:00:00Z' },
      { id: 'scan-2', name: 'Dining', scanned_at: null, created_at: '2026-08-02T00:00:00Z' },
    ];
    byScan = new Map([['scan-1', { drawings: { sheet_count: 4 } }]]);

    const { container, getByText } = render(<RoomFilesSection projectId={PROJECT} />);
    expect(container).not.toBeEmptyDOMElement();
    expect(getByText('Living')).toBeInTheDocument();
    expect(container.querySelectorAll('a[href="/room/scan-1/file"]')).toHaveLength(1);
    // scan-2 has no generated Room File — it is not a row.
    expect(container.querySelectorAll('a[href="/room/scan-2/file"]')).toHaveLength(0);
    expect(getByText('1 room')).toBeInTheDocument();
  });
});
