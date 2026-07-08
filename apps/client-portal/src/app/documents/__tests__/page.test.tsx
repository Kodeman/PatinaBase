/**
 * Tests for the client Documents hub.
 *
 * Data-fetch hooks (@patina/supabase, @/hooks/use-documents-client) are
 * mocked so each test controls loading/error/data state directly — mirrors
 * ../../budget/__tests__/page.test.tsx.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { formatDate } from '@/lib/utils/format';
import type { ClientDocument } from '@/hooks/use-documents-client';

const mockUseProjects = jest.fn();
const mockUseClientDocuments = jest.fn();
const mockDocumentSignedUrl = jest.fn();

jest.mock('@patina/supabase', () => ({
  useProjects: () => mockUseProjects(),
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
    title: 'Service Agreement.pdf',
    doc_type: 'pdf',
    category: 'contract',
    storage_path: 'proj-1/123-service-agreement.pdf',
    size_bytes: 128000,
    client_visible: true,
    created_at: '2026-01-05T00:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseProjects.mockReturnValue({ data: [project1], isLoading: false, isError: false });
  mockUseClientDocuments.mockReturnValue({ data: [], isLoading: false, isError: false });
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
    mockUseClientDocuments.mockReturnValue({
      data: [
        makeDocument({ id: 'a', project_id: 'proj-1' }),
        makeDocument({ id: 'b', project_id: 'proj-2', title: 'Floor Plan.dwg', doc_type: 'dwg', category: 'drawing' }),
      ],
      isLoading: false,
      isError: false,
    });
    render(<ClientDocumentsPage />);
    expect(screen.getByRole('heading', { name: project1.name })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: project2.name })).toBeInTheDocument();
  });

  it('omits the heading for a project with no client-visible documents', () => {
    mockUseProjects.mockReturnValue({ data: [project1, project2], isLoading: false, isError: false });
    mockUseClientDocuments.mockReturnValue({
      data: [makeDocument({ id: 'a', project_id: 'proj-1' })],
      isLoading: false,
      isError: false,
    });
    render(<ClientDocumentsPage />);
    expect(screen.getByRole('heading', { name: project1.name })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: project2.name })).not.toBeInTheDocument();
  });

  it('renders the document title, kind label, and uploaded date', () => {
    const createdAt = '2026-01-05T00:00:00Z';
    mockUseClientDocuments.mockReturnValue({
      data: [makeDocument({ category: 'contract', created_at: createdAt })],
      isLoading: false,
      isError: false,
    });
    render(<ClientDocumentsPage />);
    expect(screen.getByText('Service Agreement.pdf')).toBeInTheDocument();
    // Exact composed string (kind label + separator + date) — avoids matching
    // "Contract" against the unrelated "Contracts, drawings…" intro copy.
    expect(screen.getByText(`Contract · ${formatDate(createdAt)}`)).toBeInTheDocument();
  });

  it('falls back to the file format when a document has no category', () => {
    const createdAt = '2026-01-05T00:00:00Z';
    mockUseClientDocuments.mockReturnValue({
      data: [makeDocument({ category: null, doc_type: 'pdf', created_at: createdAt })],
      isLoading: false,
      isError: false,
    });
    render(<ClientDocumentsPage />);
    expect(screen.getByText(`PDF · ${formatDate(createdAt)}`)).toBeInTheDocument();
  });

  it('opens a signed URL in a new tab when the open action is clicked', async () => {
    mockUseClientDocuments.mockReturnValue({
      data: [makeDocument({ storage_path: 'proj-1/file.pdf' })],
      isLoading: false,
      isError: false,
    });
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
    mockUseClientDocuments.mockReturnValue({
      data: [makeDocument()],
      isLoading: false,
      isError: false,
    });
    render(<ClientDocumentsPage />);

    fireEvent.click(screen.getByRole('button', { name: /open/i }));

    await waitFor(() => {
      expect(screen.getByText(/couldn.t open this file/i)).toBeInTheDocument();
    });
    expect(window.open).not.toHaveBeenCalled();
  });
});
