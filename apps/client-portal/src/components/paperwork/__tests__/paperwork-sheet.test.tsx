import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PaperworkSheet } from '../paperwork-sheet';
import type { PaperworkContext, PaperworkDocument } from '../paperwork-model';

jest.mock('../paperwork-upload-form', () => ({
  PaperworkUploadForm: ({
    title,
    uploadOnly,
    onReceived,
  }: {
    title: string;
    uploadOnly: boolean;
    onReceived: () => void;
  }) => (
    <div data-testid={`form-${title}`} data-upload-only={String(uploadOnly)}>
      <button type="button" onClick={onReceived}>{`Send ${title}`}</button>
    </div>
  ),
}));

function doc(overrides: Partial<PaperworkDocument> = {}): PaperworkDocument {
  return {
    doc_type: 'coi_gl',
    doc_label: null,
    expires_on: '2027-04-03',
    blocks: ['site_access'],
    state: 'current',
    awaiting_check: false,
    ...overrides,
  };
}

function context(documents: PaperworkDocument[]): PaperworkContext {
  return {
    studio_name: 'Local Dev Studio',
    company_name: 'Twin Cities Drywall & Plaster',
    expires_at: '2026-10-15T19:03:15.870504+00:00',
    documents,
  };
}

function renderSheet(documents: PaperworkDocument[]) {
  render(
    <PaperworkSheet
      token={'a'.repeat(64)}
      studioName="Local Dev Studio"
      context={context(documents)}
    />,
  );
}

describe('PaperworkSheet', () => {
  it('opens a form for every expected paper the studio does not hold', () => {
    renderSheet([]);
    expect(screen.getByText('COI, general liability is not on file.')).toBeInTheDocument();
    expect(screen.getByText('W-9 is not on file.')).toBeInTheDocument();
    expect(screen.getByText('Licence is not on file.')).toBeInTheDocument();
    expect(screen.getByTestId('form-COI, general liability')).toBeInTheDocument();
    expect(screen.getByTestId('form-W-9')).toBeInTheDocument();
    expect(screen.getByTestId('form-Licence')).toBeInTheDocument();
  });

  it('says what a lapse holds up and nothing about what happens next', () => {
    renderSheet([
      doc({
        doc_type: 'license',
        state: 'lapsed',
        expires_on: '2026-03-31',
        blocks: ['site_access', 'payment', 'draw'],
      }),
    ]);
    expect(screen.getByText('Licence, lapsed 31 March 2026.')).toBeInTheDocument();
    expect(
      screen.getByText('Blocks site access, payment and the draw.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/will be/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/until you/i)).not.toBeInTheDocument();
  });

  it('keeps a current paper quiet behind an Add act', async () => {
    const user = userEvent.setup();
    renderSheet([doc({ doc_type: 'w9', state: 'current', blocks: [], expires_on: null })]);

    expect(screen.getByText('W-9, current.')).toBeInTheDocument();
    expect(screen.queryByTestId('form-W-9')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add W-9' }));
    expect(screen.getByTestId('form-W-9')).toBeInTheDocument();
  });

  it('says a lapsing paper lapses, and offers the renewal', () => {
    renderSheet([
      doc({ doc_type: 'coi_gl', state: 'lapses_soon', expires_on: '2026-10-01' }),
    ]);
    expect(
      screen.getByText('COI, general liability, lapses 1 October 2026.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Add COI, general liability' }),
    ).toBeInTheDocument();
  });

  it('reports a paper the studio has not opened yet in the studio voice', () => {
    renderSheet([
      doc({ doc_type: 'w9', state: 'current', blocks: [], expires_on: null, awaiting_check: true }),
    ]);
    expect(
      screen.getByText('Received. Local Dev Studio will confirm it.'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('form-W-9')).not.toBeInTheDocument();
  });

  it('swaps a sent form for the receipt sentence', async () => {
    const user = userEvent.setup();
    renderSheet([]);

    expect(screen.getByTestId('form-W-9')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Send W-9' }));

    expect(screen.queryByTestId('form-W-9')).not.toBeInTheDocument();
    expect(
      screen.getByText('Received. Local Dev Studio will confirm it.'),
    ).toBeInTheDocument();
    // The other two owed papers are untouched by one send.
    expect(screen.getByTestId('form-Licence')).toBeInTheDocument();
  });

  it('marks a waiver upload only', async () => {
    const user = userEvent.setup();
    renderSheet([
      doc({
        doc_type: 'lien_waiver_conditional',
        state: 'current',
        blocks: [],
        expires_on: null,
      }),
    ]);
    await user.click(
      screen.getByRole('button', { name: 'Add Lien waiver, conditional' }),
    );
    expect(
      screen.getByTestId('form-Lien waiver, conditional'),
    ).toHaveAttribute('data-upload-only', 'true');
  });

  it('carries no ids, no file paths and no other party on its face', () => {
    renderSheet([doc({ doc_type: 'coi_gl', state: 'lapsed', expires_on: '2026-03-31' })]);
    const body = document.body.textContent ?? '';
    expect(body).not.toContain('a'.repeat(64));
    expect(body).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
  });
});
