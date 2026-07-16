/**
 * FolioStrip — door-navigation intent (I74a / W2-T5). The scan door is
 * dormant in prod today (no producer writes a `doc_type: 'scan'` folio file
 * yet — see folio-strip.tsx's own comment), but the branch is real and cheap
 * to exercise: mock `@/hooks/use-folio`'s data/mutation hooks while keeping
 * its real `buildChains`/`matchesAnchor` (pure functions, via
 * `jest.requireActual`) so the chip-grouping logic under test is genuine, not
 * a stub. `@/*` is tsconfig-paths-aliased AND mirrored in jest.config.js's
 * moduleNameMapper (patina-testing Trap 1's non-broken case), so mocking the
 * package specifier fires correctly here.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { FolioStrip } from '../folio-strip';
import {
  useFolioFiles,
  useUploadFolioFile,
  useSetFolioVisibility,
  type FolioFile,
} from '@/hooks/use-folio';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@/hooks/use-folio', () => ({
  ...jest.requireActual('@/hooks/use-folio'),
  useFolioFiles: jest.fn(),
  useUploadFolioFile: jest.fn(),
  useSetFolioVisibility: jest.fn(),
}));

const mockUseFolioFiles = useFolioFiles as jest.Mock;
const mockUseUploadFolioFile = useUploadFolioFile as jest.Mock;
const mockUseSetFolioVisibility = useSetFolioVisibility as jest.Mock;

function scanFile(overrides: Partial<FolioFile> = {}): FolioFile {
  return {
    id: 'file-scan-1',
    project_id: 'project-1',
    title: 'Living room',
    doc_type: 'scan',
    storage_path: 'scan-xyz',
    size_bytes: null,
    uploaded_by: null,
    anchor_kind: 'letterhead',
    anchor_id: null,
    section_key: null,
    version_of: null,
    client_visible: false,
    created_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

describe('FolioStrip — a scan chip navigates to the Room View', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockUseUploadFolioFile.mockReturnValue({ mutate: jest.fn(), isPending: false });
    mockUseSetFolioVisibility.mockReturnValue({ mutate: jest.fn() });
  });

  it('a doc_type "scan" chip pushes /room/<storage_path>?from=document, not the file viewer', () => {
    mockUseFolioFiles.mockReturnValue({ data: [scanFile()] });
    render(<FolioStrip projectId="project-1" anchor={{ kind: 'letterhead' }} />);

    fireEvent.click(screen.getByText('Living room'));
    expect(mockPush).toHaveBeenCalledWith('/room/scan-xyz?from=document');
    // The paper DocFileViewer must not also be mounted for a scan chip.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('a real (non-scan) file never navigates to the Room View', () => {
    mockUseFolioFiles.mockReturnValue({
      data: [scanFile({ id: 'file-pdf-1', title: 'Floor plan.pdf', doc_type: 'pdf', storage_path: null })],
    });
    render(<FolioStrip projectId="project-1" anchor={{ kind: 'letterhead' }} />);

    fireEvent.click(screen.getByText('Floor plan.pdf'));
    expect(mockPush).not.toHaveBeenCalled();
  });
});
