/**
 * THE PAPER TABLE (W2b) — seven headings, one paper word per row, and a clause
 * that says what a lapse actually holds up. A document that is current holds
 * nothing up, so it prints no clause at all.
 */
import { render, screen } from '@testing-library/react';
import type { StudioComplianceDocument } from '@patina/supabase';
import {
  ComplianceTable,
  documentBlockWords,
  documentPaperState,
  documentTypeLabel,
  paperHeldClause,
} from '../compliance-table';
import { RecordDocumentSheet, EXPIRY_REQUIRED_SENTENCE } from '../record-document-sheet';
import { fireEvent } from '@testing-library/react';

jest.mock('@patina/supabase', () => ({
  COMPLIANCE_BLOCK_LABELS: {
    site_access: 'site access',
    payment: 'payment',
    draw: 'the draw',
  },
  COMPLIANCE_DOC_TYPE_LABELS: {
    coi_gl: 'COI, general liability',
    coi_wc: 'COI, workers compensation',
    w9: 'W-9',
    other_named: 'Other',
  },
  ALL_COMPLIANCE_BLOCKS: ['site_access', 'payment', 'draw'],
  ALL_COMPLIANCE_DOC_TYPES: ['coi_gl', 'w9', 'other_named'],
  complianceDocRequiresExpiry: (t: string) => t === 'coi_gl',
  useRecordComplianceDocument: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

const TODAY = new Date('2026-10-20T00:00:00Z');

function doc(over: Partial<StudioComplianceDocument> = {}): StudioComplianceDocument {
  return {
    id: 'doc-1',
    organization_id: 'org-1',
    holder_type: 'company',
    holder_id: 'firm-northgate',
    doc_type: 'coi_gl',
    doc_label: null,
    number: 'GL-9021-18',
    issuer: 'Lakes Casualty',
    issued_on: '2025-04-01',
    expires_on: '2026-03-31',
    file_path: null,
    verified_by: null,
    verified_at: null,
    held_by: 'studio',
    blocks: ['site_access', 'payment', 'draw'],
    superseded_by: null,
    source: 'studio',
    inbound: false,
    created_by: null,
    created_at: '',
    updated_at: '',
    ...over,
  } as StudioComplianceDocument;
}

describe('the table', () => {
  it('carries the seven headings', () => {
    render(<ComplianceTable documents={[doc()]} today={TODAY} />);
    for (const head of ['Type', 'Number', 'Issuer', 'Expires', 'State', 'Held by', 'Blocks']) {
      expect(screen.getByRole('columnheader', { name: head })).toBeInTheDocument();
    }
  });

  it('prints the paper, its word, and what it holds up in the studio’s words', () => {
    render(<ComplianceTable documents={[doc()]} today={TODAY} />);
    const row = document.querySelector('[data-compliance-row="doc-1"]') as HTMLElement;
    expect(row).toHaveTextContent('COI, general liability');
    expect(row).toHaveTextContent('GL-9021-18');
    expect(row).toHaveTextContent('31 Mar 2026');
    expect(row).toHaveTextContent('Lapsed');
    expect(row).toHaveTextContent('site access, payment and the draw');
  });

  it('stacks the same facts at 390 — a table never scrolls sideways', () => {
    render(<ComplianceTable documents={[doc()]} today={TODAY} />);
    const stack = document.querySelector('[data-compliance-row-390="doc-1"]') as HTMLElement;
    expect(stack).toHaveTextContent('COI, general liability');
    expect(stack).toHaveTextContent('Blocks site access, payment and the draw.');
  });

  it('an undated paper is on file and cannot lapse', () => {
    render(
      <ComplianceTable
        documents={[doc({ id: 'doc-2', doc_type: 'w9', expires_on: null })]}
        today={TODAY}
      />,
    );
    const row = document.querySelector('[data-compliance-row="doc-2"]') as HTMLElement;
    expect(row).toHaveTextContent('on file 1 Apr 2025');
    expect(row).toHaveTextContent('Current');
  });
});

describe('the paper word on one document', () => {
  it('lapses on its own date, warns inside thirty days, and is current otherwise', () => {
    expect(documentPaperState(doc({ expires_on: '2026-03-31' }), TODAY)).toBe('lapsed');
    expect(documentPaperState(doc({ expires_on: '2026-11-01' }), TODAY)).toBe('lapses_soon');
    expect(documentPaperState(doc({ expires_on: '2027-12-31' }), TODAY)).toBe('current');
    expect(documentPaperState(doc({ expires_on: null }), TODAY)).toBe('current');
  });

  it('a named other reads by its written label', () => {
    expect(
      documentTypeLabel(doc({ doc_type: 'other_named', doc_label: 'Radon clearance' })),
    ).toBe('Radon clearance');
  });

  it('block words come from the closed vocabulary, never a raw token', () => {
    expect(documentBlockWords(doc())).toEqual(['site access', 'payment', 'the draw']);
  });
});

describe('the held clause', () => {
  it('names only what a LAPSE holds up, in one sentence', () => {
    expect(paperHeldClause([doc()], TODAY)).toBe(
      'Site access, payment and the draw are held until a current certificate is on file.',
    );
  });

  it('prints nothing when the paper is current', () => {
    expect(paperHeldClause([doc({ expires_on: '2027-12-31' })], TODAY)).toBeNull();
  });

  it('agrees with itself in the singular', () => {
    expect(paperHeldClause([doc({ blocks: ['payment'] })], TODAY)).toBe(
      'Payment is held until a current certificate is on file.',
    );
  });
});

describe('recording a document', () => {
  it('every field carries a visible label, and nothing carries a placeholder', () => {
    const { container } = render(
      <RecordDocumentSheet
        open
        onClose={jest.fn()}
        organizationId="org-1"
        holderId="firm-northgate"
        holderName="Northgate Electric"
      />,
    );
    expect(screen.getByLabelText('Document')).toBeInTheDocument();
    expect(screen.getByLabelText('Number')).toBeInTheDocument();
    expect(screen.getByLabelText('Issuer')).toBeInTheDocument();
    expect(screen.getByLabelText('Expires')).toBeInTheDocument();
    expect(screen.getByLabelText('Held by')).toBeInTheDocument();
    expect(container.querySelectorAll('[placeholder]')).toHaveLength(0);
  });

  it('refuses a dated certificate with no date, in words', async () => {
    render(
      <RecordDocumentSheet
        open
        onClose={jest.fn()}
        organizationId="org-1"
        holderId="firm-northgate"
        holderName="Northgate Electric"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'File this document' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(EXPIRY_REQUIRED_SENTENCE);
  });
});
