import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ClientPlanSheet, ProjectDocument } from '@patina/supabase';

import type { ClientDocument } from '@/hooks/use-documents-client';

// ── Boundaries ──────────────────────────────────────────────────────────────
// Three reads (the shared plan set, the studio's filed papers, the executed
// instruments) and one signed-URL call. Mock the modules the sheet imports;
// everything else is its own.

jest.mock('@patina/supabase', () => ({
  __esModule: true,
  useClientPlanSet: jest.fn(),
  useProjectDocuments: jest.fn(),
}));

jest.mock('@/hooks/use-documents-client', () => ({
  __esModule: true,
  useClientDocuments: jest.fn(),
  documentSignedUrl: jest.fn(),
}));

jest.mock('@/lib/analytics/events', () => ({
  __esModule: true,
  clientEvents: { documentView: jest.fn() },
  makingEvents: {
    gateFollowed: jest.fn(),
    actionShown: jest.fn(),
    actionSelected: jest.fn(),
  },
}));

import { useClientPlanSet, useProjectDocuments } from '@patina/supabase';
import { documentSignedUrl, useClientDocuments } from '@/hooks/use-documents-client';
import { clientEvents } from '@/lib/analytics/events';

import { PapersSheet } from '../papers-sheet';

const planSetMock = useClientPlanSet as jest.Mock;
const filedMock = useClientDocuments as jest.Mock;
const instrumentsMock = useProjectDocuments as jest.Mock;
const signedUrlMock = documentSignedUrl as jest.Mock;
const documentViewMock = clientEvents.documentView as jest.Mock;

function sheet(overrides: Partial<ClientPlanSheet> = {}): ClientPlanSheet {
  return {
    sheetId: 'sheet-1',
    projectId: 'project-1',
    number: 'A-101',
    title: 'Site and ground plan',
    discipline: 'architectural',
    revLetter: 'B',
    revDate: '2026-06-19',
    projectDocumentId: 'doc-1',
    storagePath: 'plans/a-101.pdf',
    sizeBytes: 2048,
    ...overrides,
  };
}

function filed(overrides: Partial<ClientDocument> = {}): ClientDocument {
  return {
    id: 'file-1',
    project_id: 'project-1',
    proposal_id: null,
    title: 'Signed design agreement',
    doc_type: 'pdf',
    category: 'contract',
    section_key: null,
    storage_path: 'folio/agreement.pdf',
    size_bytes: 4096,
    client_visible: true,
    created_at: '2026-06-19T10:00:00Z',
    ...overrides,
  };
}

function instrument(overrides: Partial<ProjectDocument> = {}): ProjectDocument {
  return {
    id: 'paper-1',
    kind: 'proposal',
    title: 'Furnishings authorization No. 7',
    signed_at: '2026-06-19',
    status: 'accepted',
    total_amount_cents: 912500,
    url: '/proposals/paper-1',
    ...overrides,
  };
}

function setSources({
  sheets = [] as ClientPlanSheet[],
  documents = [] as ClientDocument[],
  proposalProjectIds = {} as Record<string, string | null>,
  instruments = [] as ProjectDocument[],
  loading = false,
  planSetError = false,
  filedError = false,
} = {}) {
  planSetMock.mockReturnValue({
    data: loading || planSetError ? undefined : sheets,
    isLoading: loading,
    isError: planSetError,
  });
  filedMock.mockReturnValue({
    data: loading || filedError ? undefined : { documents, proposalProjectIds },
    isLoading: loading,
    isError: filedError,
  });
  instrumentsMock.mockReturnValue({
    data: loading ? undefined : instruments,
    isLoading: loading,
    isError: false,
  });
}

describe('PapersSheet — the papers, laid over the house', () => {
  beforeEach(() => {
    documentViewMock.mockClear();
    setSources();
    signedUrlMock.mockResolvedValue('https://signed.example/a-101.pdf');
  });

  it('lays nothing over the page until it is opened', () => {
    render(<PapersSheet projectId="project-1" open={false} onDismiss={jest.fn()} />);

    expect(screen.queryByTestId('papers-sheet')).not.toBeInTheDocument();
    expect(planSetMock).not.toHaveBeenCalled();
  });

  it('is a dialog, named, that takes the reading', () => {
    render(<PapersSheet projectId="project-1" open onDismiss={jest.fn()} />);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName('The papers');
    expect(dialog).toHaveFocus();
  });

  it('holds the house still underneath, and lets it go again', () => {
    const { unmount } = render(
      <PapersSheet projectId="project-1" open onDismiss={jest.fn()} />,
    );
    expect(document.body.style.overflow).toBe('hidden');

    unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('holds its measure and says nothing while the registers are still coming', () => {
    setSources({ loading: true });
    render(<PapersSheet projectId="project-1" open onDismiss={jest.fn()} />);

    expect(screen.getByTestId('papers-sheet-hold')).toBeInTheDocument();
    expect(screen.queryByTestId('papers-sheet-empty')).not.toBeInTheDocument();
    expect(screen.queryByTestId('papers-sheet-drawings')).not.toBeInTheDocument();
  });

  it('never says nothing has been filed over a register that failed', () => {
    setSources({ filedError: true, sheets: [sheet()] });
    render(<PapersSheet projectId="project-1" open onDismiss={jest.fn()} />);

    expect(screen.queryByTestId('papers-sheet-empty')).not.toBeInTheDocument();
    // The drawings came back and stand; the failed register says so in the
    // retired page's own words rather than blanking the sheet.
    expect(screen.getByTestId('papers-sheet-drawings')).toBeInTheDocument();
    expect(screen.getByTestId('papers-sheet-error')).toHaveTextContent(
      'The documents could not be read just now. Please refresh.',
    );
  });

  it('keeps the papers that answered when the drawings leg fails', () => {
    setSources({ planSetError: true, documents: [filed()] });
    render(<PapersSheet projectId="project-1" open onDismiss={jest.fn()} />);

    // app/documents/page.tsx:53-58 — a drawings-leg failure must not blank the
    // page; the register carries its own notice instead.
    expect(screen.getByTestId('papers-sheet-other')).toBeInTheDocument();
    expect(screen.getByTestId('plan-set-error')).toHaveTextContent(
      'The drawings could not be read just now. Please refresh.',
    );
    expect(screen.queryByTestId('papers-sheet-empty')).not.toBeInTheDocument();
  });

  it('groups the drawing set by discipline and dates each sheet', () => {
    setSources({
      sheets: [
        sheet(),
        sheet({ sheetId: 'sheet-2', number: 'ID-201', title: 'Library elevation', discipline: 'interiors' }),
      ],
    });
    render(<PapersSheet projectId="project-1" open onDismiss={jest.fn()} />);

    const drawings = screen.getByTestId('papers-sheet-drawings');
    expect(within(drawings).getByText('Architectural')).toBeInTheDocument();
    expect(within(drawings).getByText('Interiors')).toBeInTheDocument();
    expect(within(drawings).getByText('A-101 · Rev B · 19 June')).toBeInTheDocument();
    expect(within(drawings).getAllByTestId('papers-sheet-row')).toHaveLength(2);
  });

  it('leaves the rev clause out of a sheet with no rev letter', () => {
    setSources({ sheets: [sheet({ revLetter: '' })] });
    render(<PapersSheet projectId="project-1" open onDismiss={jest.fn()} />);

    expect(screen.getByText('A-101 · 19 June')).toBeInTheDocument();
    expect(screen.queryByText(/Rev\b/)).not.toBeInTheDocument();
  });

  it('opens a sheet into its own frame inside the overlay, and comes back', async () => {
    setSources({ sheets: [sheet()] });
    render(<PapersSheet projectId="project-1" open onDismiss={jest.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Open Site and ground plan' }));

    await waitFor(() =>
      expect(screen.getByTestId('papers-sheet-viewer')).toBeInTheDocument(),
    );
    expect(signedUrlMock).toHaveBeenCalledWith('plans/a-101.pdf');
    expect(screen.getByTitle('Site and ground plan')).toHaveAttribute(
      'src',
      'https://signed.example/a-101.pdf',
    );
    expect(screen.getByRole('link', { name: 'Save Site and ground plan' })).toHaveAttribute(
      'href',
      'https://signed.example/a-101.pdf',
    );
    expect(documentViewMock).toHaveBeenCalledWith({
      documentId: 'doc-1',
      kind: 'plan_sheet',
    });
    expect(screen.queryByTestId('papers-sheet-drawings')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /back to the papers/i }));
    expect(screen.getByTestId('papers-sheet-drawings')).toBeInTheDocument();
  });

  it('offers a format a frame cannot draw as a file to save, and no frame', async () => {
    signedUrlMock.mockResolvedValue('https://signed.example/plan.dwg');
    setSources({ sheets: [sheet({ storagePath: 'plans/a-101.dwg' })] });
    render(<PapersSheet projectId="project-1" open onDismiss={jest.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Open Site and ground plan' }));

    await waitFor(() =>
      expect(screen.getByTestId('papers-sheet-viewer')).toBeInTheDocument(),
    );
    expect(screen.queryByTitle('Site and ground plan')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Save Site and ground plan' })).toBeInTheDocument();
  });

  it('says the file would not open, and stays on the list', async () => {
    signedUrlMock.mockResolvedValue(null);
    setSources({ sheets: [sheet()] });
    render(<PapersSheet projectId="project-1" open onDismiss={jest.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Open Site and ground plan' }));

    await waitFor(() =>
      expect(screen.getByText(/couldn’t open this file/i)).toBeInTheDocument(),
    );
    expect(screen.queryByTestId('papers-sheet-viewer')).not.toBeInTheDocument();
  });

  it('names the studio’s filed papers and opens one the way the hub opened it', async () => {
    const open = jest.fn();
    Object.defineProperty(window, 'open', { value: open, writable: true });
    signedUrlMock.mockResolvedValue('https://signed.example/agreement.pdf');
    setSources({
      documents: [
        filed(),
        filed({ id: 'file-2', section_key: 'plan-room', title: 'A-101 print' }),
      ],
    });
    render(<PapersSheet projectId="project-1" open onDismiss={jest.fn()} />);

    const other = screen.getByTestId('papers-sheet-other');
    expect(within(other).getByText('Contract · 19 June')).toBeInTheDocument();
    expect(within(other).getAllByTestId('papers-sheet-paper')).toHaveLength(1);

    await userEvent.click(
      screen.getByRole('button', { name: 'Open Signed design agreement' }),
    );

    await waitFor(() => expect(signedUrlMock).toHaveBeenCalledWith('folio/agreement.pdf'));
    expect(open).toHaveBeenCalledWith(
      'https://signed.example/agreement.pdf',
      '_blank',
      'noopener,noreferrer',
    );
    expect(documentViewMock).toHaveBeenCalledWith({ documentId: 'file-1', kind: 'pdf' });
  });

  it('keeps a paper no house can claim rather than losing it', () => {
    setSources({
      documents: [
        filed({ id: 'early', project_id: null, proposal_id: 'prop-9', title: 'Early agreement' }),
      ],
      proposalProjectIds: { 'prop-9': null },
    });
    render(<PapersSheet projectId="project-1" open onDismiss={jest.fn()} />);

    expect(
      within(screen.getByTestId('papers-sheet-earlier')).getByText('Early agreement'),
    ).toBeInTheDocument();
  });

  it('offers a full reading of an executed instrument only when the page has one', async () => {
    setSources({
      instruments: [instrument(), instrument({ id: 'paper-2', signed_at: null })],
    });
    const { rerender } = render(
      <PapersSheet projectId="project-1" open onDismiss={jest.fn()} />,
    );

    const instruments = screen.getByTestId('papers-sheet-instruments');
    expect(within(instruments).getByText('Instrument · Signed 19 June')).toBeInTheDocument();
    expect(within(instruments).getAllByTestId('papers-sheet-instrument')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /read .* in full/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /read .* in full/i })).not.toBeInTheDocument();

    const onOpenInstrument = jest.fn();
    rerender(
      <PapersSheet
        projectId="project-1"
        open
        onDismiss={jest.fn()}
        onOpenInstrument={onOpenInstrument}
      />,
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Read Furnishings authorization No. 7 in full' }),
    );
    expect(onOpenInstrument).toHaveBeenCalledWith('paper-1');
  });

  it('says nothing has been filed only once every register has answered', () => {
    render(<PapersSheet projectId="project-1" open onDismiss={jest.fn()} />);

    expect(screen.getByTestId('papers-sheet-empty')).toHaveTextContent(
      'Nothing has been filed here yet.',
    );
  });

  it('is dismissed by the same tab that laid it down', async () => {
    const onDismiss = jest.fn();
    render(<PapersSheet projectId="project-1" open onDismiss={onDismiss} />);

    await userEvent.click(screen.getByRole('button', { name: /the papers, in full/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('is dismissed by Escape, once, wherever the reading is', async () => {
    const onDismiss = jest.fn();
    setSources({ sheets: [sheet()] });
    render(<PapersSheet projectId="project-1" open onDismiss={onDismiss} />);

    await userEvent.keyboard('{Escape}');
    expect(onDismiss).toHaveBeenCalledTimes(1);

    // Once the reading is inside a cross-origin frame no keydown reaches a
    // React handler; the listener that answers is the document's.
    document.body.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onDismiss).toHaveBeenCalledTimes(2);
  });

  it('keeps the reading inside the sheet', async () => {
    setSources({ sheets: [sheet()] });
    render(<PapersSheet projectId="project-1" open onDismiss={jest.fn()} />);

    const tab = screen.getByRole('button', { name: /the papers, in full/i });
    const open = screen.getByRole('button', { name: 'Open Site and ground plan' });

    open.focus();
    await userEvent.tab();
    expect(tab).toHaveFocus();

    await userEvent.tab({ shift: true });
    expect(open).toHaveFocus();
  });

  it('gives the reading back to whatever laid the sheet down', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();

    const { unmount } = render(
      <PapersSheet projectId="project-1" open onDismiss={jest.fn()} />,
    );
    expect(screen.getByRole('dialog')).toHaveFocus();

    unmount();
    expect(opener).toHaveFocus();
    opener.remove();
  });
});
