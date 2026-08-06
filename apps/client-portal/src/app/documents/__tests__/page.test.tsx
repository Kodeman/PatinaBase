/**
 * Tests for the client Documents hub.
 *
 * Data-fetch hooks (@patina/supabase, @/hooks/use-documents-client) are
 * mocked so each test controls loading/error/data state directly — mirrors
 * ../../budget/__tests__/page.test.tsx.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import type { ClientPlanSheet } from '@patina/supabase';
import { formatDate } from '@/lib/utils/format';
import type { ClientDocument } from '@/hooks/use-documents-client';

const mockUseProjects = jest.fn();
const mockUseClientPlanSet = jest.fn();
const mockUseClientDocuments = jest.fn();
const mockDocumentSignedUrl = jest.fn();

jest.mock('@patina/supabase', () => ({
  useProjects: () => mockUseProjects(),
  useClientPlanSet: (projectIds: string[]) => mockUseClientPlanSet(projectIds),
}));

jest.mock('@/hooks/use-documents-client', () => ({
  useClientDocuments: (projectIds: string[]) => mockUseClientDocuments(projectIds),
  documentSignedUrl: (path: string) => mockDocumentSignedUrl(path),
}));

import ClientDocumentsPage from '../page';

const project1 = { id: 'proj-1', name: 'Lakeside Retreat' };
const project2 = { id: 'proj-2', name: 'Downtown Loft' };

function makeDocument(overrides: Partial<ClientDocument> = {}): ClientDocument {
  return {
    id: 'doc-1',
    project_id: 'proj-1',
    proposal_id: null,
    title: 'Service Agreement.pdf',
    doc_type: 'pdf',
    category: 'contract',
    section_key: null,
    storage_path: 'proj-1/123-service-agreement.pdf',
    size_bytes: 128000,
    client_visible: true,
    created_at: '2026-01-05T00:00:00Z',
    ...overrides,
  };
}

function makeSheet(overrides: Partial<ClientPlanSheet> = {}): ClientPlanSheet {
  return {
    sheetId: 'sheet-1',
    projectId: 'proj-1',
    number: 'A-101',
    title: 'First Floor Plan',
    discipline: null,
    revLetter: 'B',
    revDate: '2026-07-30T00:00:00Z',
    projectDocumentId: 'doc-plan-1',
    storagePath: 'proj-1/plans/a-101.pdf',
    sizeBytes: 204800,
    ...overrides,
  };
}

function documentsResult(
  documents: ClientDocument[],
  proposalProjectIds: Record<string, string | null> = {},
) {
  return {
    data: { documents, proposalProjectIds },
    isLoading: false,
    isError: false,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseProjects.mockReturnValue({ data: [project1], isLoading: false, isError: false });
  mockUseClientDocuments.mockReturnValue(documentsResult([]));
  mockUseClientPlanSet.mockReturnValue({ data: [], isLoading: false, isError: false });
  mockDocumentSignedUrl.mockResolvedValue('https://storage.example.com/signed-url');
  window.open = jest.fn();
});

describe('ClientDocumentsPage', () => {
  it('shows a loading spinner while projects are still loading', () => {
    mockUseProjects.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    render(<ClientDocumentsPage />);
    expect(screen.getByTestId('documents-loading')).toBeInTheDocument();
  });

  it('shows a loading spinner while documents are still loading', () => {
    mockUseClientDocuments.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    render(<ClientDocumentsPage />);
    expect(screen.getByTestId('documents-loading')).toBeInTheDocument();
  });

  it('shows a loading spinner while the plan set is still loading', () => {
    mockUseClientPlanSet.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    render(<ClientDocumentsPage />);
    expect(screen.getByTestId('documents-loading')).toBeInTheDocument();
  });

  it('shows a page-level error when the project list fails to load', () => {
    mockUseProjects.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    render(<ClientDocumentsPage />);
    expect(screen.getByTestId('documents-error')).toBeInTheDocument();
  });

  it('shows a page-level error when the documents fetch fails', () => {
    mockUseClientDocuments.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    render(<ClientDocumentsPage />);
    expect(screen.getByTestId('documents-error')).toBeInTheDocument();
  });

  it('keeps papers rendering with an inline drawings notice when the plan-set fetch fails', () => {
    mockUseClientPlanSet.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    mockUseClientDocuments.mockReturnValue(
      documentsResult([makeDocument({ title: 'Service Agreement.pdf' })]),
    );
    render(<ClientDocumentsPage />);

    // A drawings-leg failure is NOT a page-level error…
    expect(screen.queryByTestId('documents-error')).not.toBeInTheDocument();
    // …the papers keep rendering…
    expect(screen.getByText('Service Agreement.pdf')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: project1.name })).toBeInTheDocument();
    // …and the drawings register carries its own inline notice.
    expect(screen.getByTestId('plan-set-error')).toBeInTheDocument();
    expect(screen.getByText(/couldn.t load your drawings/i)).toBeInTheDocument();
  });

  it('shows the inline drawings notice instead of the empty state when only the plan set fails', () => {
    mockUseClientPlanSet.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    render(<ClientDocumentsPage />);

    expect(screen.getByTestId('plan-set-error')).toBeInTheDocument();
    expect(screen.queryByTestId('documents-empty')).not.toBeInTheDocument();
    expect(screen.queryByTestId('documents-error')).not.toBeInTheDocument();
  });

  it('shows the empty state when the client has no client-visible documents', () => {
    render(<ClientDocumentsPage />);
    expect(screen.getByTestId('documents-empty')).toBeInTheDocument();
    expect(screen.getByText(/your designer hasn.t shared any documents yet/i)).toBeInTheDocument();
  });

  it('shows the empty state (not an error) when the client has projects but zero documents', () => {
    mockUseProjects.mockReturnValue({ data: [project1, project2], isLoading: false, isError: false });
    render(<ClientDocumentsPage />);
    expect(screen.getByTestId('documents-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('documents-error')).not.toBeInTheDocument();
  });

  it("renders a heading for each project that has client-visible documents", () => {
    mockUseProjects.mockReturnValue({ data: [project1, project2], isLoading: false, isError: false });
    mockUseClientDocuments.mockReturnValue(
      documentsResult([
        makeDocument({ id: 'a', project_id: 'proj-1' }),
        makeDocument({ id: 'b', project_id: 'proj-2', title: 'Floor Plan.dwg', doc_type: 'dwg', category: 'drawing' }),
      ]),
    );
    render(<ClientDocumentsPage />);
    expect(screen.getByRole('heading', { name: project1.name })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: project2.name })).toBeInTheDocument();
  });

  it('omits the heading for a project with no client-visible documents', () => {
    mockUseProjects.mockReturnValue({ data: [project1, project2], isLoading: false, isError: false });
    mockUseClientDocuments.mockReturnValue(
      documentsResult([makeDocument({ id: 'a', project_id: 'proj-1' })]),
    );
    render(<ClientDocumentsPage />);
    expect(screen.getByRole('heading', { name: project1.name })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: project2.name })).not.toBeInTheDocument();
  });

  it('renders the document title, kind label, and uploaded date', () => {
    const createdAt = '2026-01-05T00:00:00Z';
    mockUseClientDocuments.mockReturnValue(
      documentsResult([makeDocument({ category: 'contract', created_at: createdAt })]),
    );
    render(<ClientDocumentsPage />);
    expect(screen.getByText('Service Agreement.pdf')).toBeInTheDocument();
    // Exact composed string (kind label + separator + date) — avoids matching
    // "Contract" against the unrelated "Contracts, drawings…" intro copy.
    expect(screen.getByText(`Contract · ${formatDate(createdAt)}`)).toBeInTheDocument();
  });

  it('falls back to the file format when a document has no category', () => {
    const createdAt = '2026-01-05T00:00:00Z';
    mockUseClientDocuments.mockReturnValue(
      documentsResult([makeDocument({ category: null, doc_type: 'pdf', created_at: createdAt })]),
    );
    render(<ClientDocumentsPage />);
    expect(screen.getByText(`PDF · ${formatDate(createdAt)}`)).toBeInTheDocument();
  });

  it('folds a proposal-anchored document into its activated project group', () => {
    mockUseProjects.mockReturnValue({ data: [project1, project2], isLoading: false, isError: false });
    mockUseClientDocuments.mockReturnValue(
      documentsResult(
        [
          makeDocument({
            id: 'agreement',
            project_id: null,
            proposal_id: 'prop-1',
            title: 'Design Agreement.pdf',
          }),
        ],
        { 'prop-1': 'proj-2' },
      ),
    );
    render(<ClientDocumentsPage />);
    expect(screen.getByRole('heading', { name: project2.name })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: project1.name })).not.toBeInTheDocument();
    expect(screen.getByText('Design Agreement.pdf')).toBeInTheDocument();
  });

  it('opens a signed URL in a new tab when the open action is clicked', async () => {
    mockUseClientDocuments.mockReturnValue(
      documentsResult([makeDocument({ storage_path: 'proj-1/file.pdf' })]),
    );
    render(<ClientDocumentsPage />);

    fireEvent.click(screen.getByRole('button', { name: /open/i }));

    await waitFor(() => {
      expect(mockDocumentSignedUrl).toHaveBeenCalledWith('proj-1/file.pdf');
    });
    await waitFor(() => {
      expect(window.open).toHaveBeenCalledWith(
        'https://storage.example.com/signed-url',
        '_blank',
        'noopener,noreferrer',
      );
    });
  });

  it('shows an inline error and does not open a tab when the signed URL cannot be resolved', async () => {
    mockDocumentSignedUrl.mockResolvedValue(null);
    mockUseClientDocuments.mockReturnValue(documentsResult([makeDocument()]));
    render(<ClientDocumentsPage />);

    fireEvent.click(screen.getByRole('button', { name: /open/i }));

    await waitFor(() => {
      expect(screen.getByText(/couldn.t open this file/i)).toBeInTheDocument();
    });
    expect(window.open).not.toHaveBeenCalled();
  });
});

describe('ClientDocumentsPage — Your drawings (plan set)', () => {
  it('renders the plan set per project with the rev letter on the face', () => {
    mockUseClientPlanSet.mockReturnValue({
      data: [
        makeSheet({ sheetId: 's1', number: 'A-101', revLetter: 'B' }),
        makeSheet({ sheetId: 's2', number: 'A-102', title: 'Second Floor Plan', revLetter: 'A' }),
      ],
      isLoading: false,
      isError: false,
    });
    render(<ClientDocumentsPage />);

    expect(screen.getByTestId('plan-set-section')).toBeInTheDocument();
    expect(screen.getByText('Your drawings')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: project1.name })).toBeInTheDocument();
    expect(screen.getByLabelText('Revision B')).toHaveTextContent('B');
    expect(screen.getByLabelText('Revision A')).toHaveTextContent('A');
    expect(screen.getByText('First Floor Plan')).toBeInTheDocument();
    expect(screen.getByText('Second Floor Plan')).toBeInTheDocument();
    expect(screen.getAllByTestId('plan-sheet-row')).toHaveLength(2);
  });

  it('heads each discipline group, falling back to the number prefix', () => {
    mockUseClientPlanSet.mockReturnValue({
      data: [
        makeSheet({ sheetId: 's1', number: 'A-101', discipline: 'architectural' }),
        makeSheet({ sheetId: 's2', number: 'E-201', title: 'Lighting Plan', discipline: null }),
      ],
      isLoading: false,
      isError: false,
    });
    render(<ClientDocumentsPage />);

    expect(screen.getByRole('heading', { name: 'Architectural' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'E' })).toBeInTheDocument();
  });

  it('keeps plan-room rows out of the papers list — they render once, as drawings', () => {
    mockUseClientPlanSet.mockReturnValue({
      data: [makeSheet({ projectDocumentId: 'doc-plan-1', title: 'First Floor Plan' })],
      isLoading: false,
      isError: false,
    });
    mockUseClientDocuments.mockReturnValue(
      documentsResult([
        makeDocument({
          id: 'doc-plan-1',
          title: 'A-101 First Floor Plan (Rev B)',
          section_key: 'plan-room',
          category: 'drawing',
        }),
        makeDocument({ id: 'paper', title: 'Service Agreement.pdf' }),
      ]),
    );
    render(<ClientDocumentsPage />);

    // The plan-room Folio row never renders as a paper…
    expect(screen.queryByText('A-101 First Floor Plan (Rev B)')).not.toBeInTheDocument();
    // …the sheet renders once, in the drawings register.
    expect(screen.getByText('First Floor Plan')).toBeInTheDocument();
    expect(screen.getByText('Service Agreement.pdf')).toBeInTheDocument();
    // Both registers present → the divider heading appears.
    expect(screen.getByRole('heading', { name: 'Other papers' })).toBeInTheDocument();
  });

  it('shows no empty state when there are drawings but no papers', () => {
    mockUseClientPlanSet.mockReturnValue({
      data: [makeSheet()],
      isLoading: false,
      isError: false,
    });
    render(<ClientDocumentsPage />);

    expect(screen.queryByTestId('documents-empty')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Other papers' })).not.toBeInTheDocument();
  });

  it('opens a sheet through a signed URL in a new tab', async () => {
    mockUseClientPlanSet.mockReturnValue({
      data: [makeSheet({ storagePath: 'proj-1/plans/a-101.pdf' })],
      isLoading: false,
      isError: false,
    });
    render(<ClientDocumentsPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Open First Floor Plan' }));

    await waitFor(() => {
      expect(mockDocumentSignedUrl).toHaveBeenCalledWith('proj-1/plans/a-101.pdf');
    });
    await waitFor(() => {
      expect(window.open).toHaveBeenCalledWith(
        'https://storage.example.com/signed-url',
        '_blank',
        'noopener,noreferrer',
      );
    });
  });

  it('shows an inline error when a sheet has no storage path', async () => {
    mockUseClientPlanSet.mockReturnValue({
      data: [makeSheet({ storagePath: null })],
      isLoading: false,
      isError: false,
    });
    render(<ClientDocumentsPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Open First Floor Plan' }));

    await waitFor(() => {
      expect(screen.getByText(/couldn.t open this file/i)).toBeInTheDocument();
    });
    expect(mockDocumentSignedUrl).not.toHaveBeenCalled();
    expect(window.open).not.toHaveBeenCalled();
  });
});
