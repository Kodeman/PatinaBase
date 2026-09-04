import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ClientPlanSheet, ProjectDocument } from '@patina/supabase';

// ── Boundaries ──────────────────────────────────────────────────────────────
// Two reads (the shared plan set, the project's papers) and one signed-URL
// call. Mock the modules the sheet imports; everything else is its own.

jest.mock('@patina/supabase', () => ({
  __esModule: true,
  useClientPlanSet: jest.fn(),
  useProjectDocuments: jest.fn(),
}));

jest.mock('@/hooks/use-documents-client', () => ({
  __esModule: true,
  documentSignedUrl: jest.fn(),
}));

import { useClientPlanSet, useProjectDocuments } from '@patina/supabase';
import { documentSignedUrl } from '@/hooks/use-documents-client';

import { PapersSheet } from '../papers-sheet';

const planSetMock = useClientPlanSet as jest.Mock;
const documentsMock = useProjectDocuments as jest.Mock;
const signedUrlMock = documentSignedUrl as jest.Mock;

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

function paper(overrides: Partial<ProjectDocument> = {}): ProjectDocument {
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
  papers = [] as ProjectDocument[],
  loading = false,
} = {}) {
  planSetMock.mockReturnValue({ data: loading ? undefined : sheets, isLoading: loading });
  documentsMock.mockReturnValue({ data: loading ? undefined : papers, isLoading: loading });
}

describe('PapersSheet — the papers, laid over the house', () => {
  beforeEach(() => {
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

  it('holds its measure and says nothing while the registers are still coming', () => {
    setSources({ loading: true });
    render(<PapersSheet projectId="project-1" open onDismiss={jest.fn()} />);

    expect(screen.getByTestId('papers-sheet-hold')).toBeInTheDocument();
    expect(screen.queryByTestId('papers-sheet-empty')).not.toBeInTheDocument();
    expect(screen.queryByTestId('papers-sheet-drawings')).not.toBeInTheDocument();
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
    expect(screen.queryByTestId('papers-sheet-drawings')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /back to the papers/i }));
    expect(screen.getByTestId('papers-sheet-drawings')).toBeInTheDocument();
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

  it('names the other papers, and offers a full reading only of what is executed', () => {
    setSources({
      papers: [
        paper(),
        paper({ id: 'paper-2', kind: 'scope_change', title: 'Stair-hall change', signed_at: null }),
      ],
    });
    render(<PapersSheet projectId="project-1" open onDismiss={jest.fn()} />);

    const other = screen.getByTestId('papers-sheet-other');
    expect(within(other).getByText('Instrument · Signed 19 June')).toBeInTheDocument();
    expect(within(other).getByText('Change request')).toBeInTheDocument();
    expect(
      within(other).getAllByRole('link', { name: /read .* in full/i }),
    ).toHaveLength(1);
  });

  it('hands an executed instrument to the door when the page has a read view', async () => {
    const onOpenInstrument = jest.fn();
    setSources({ papers: [paper()] });
    render(
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

  it('says nothing has been filed only once both registers have answered', () => {
    render(<PapersSheet projectId="project-1" open onDismiss={jest.fn()} />);

    expect(screen.getByTestId('papers-sheet-empty')).toHaveTextContent(
      'Nothing has been filed here yet.',
    );
  });

  it('is dismissed by the same tab that laid it down', async () => {
    const onDismiss = jest.fn();
    render(<PapersSheet projectId="project-1" open onDismiss={onDismiss} />);

    const tab = screen.getByRole('button', { name: /the papers, in full/i });
    expect(tab).toHaveAttribute('aria-expanded', 'true');

    await userEvent.click(tab);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('is dismissed by Escape', async () => {
    const onDismiss = jest.fn();
    render(<PapersSheet projectId="project-1" open onDismiss={onDismiss} />);

    await userEvent.keyboard('{Escape}');
    expect(onDismiss).toHaveBeenCalledTimes(1);
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
});
