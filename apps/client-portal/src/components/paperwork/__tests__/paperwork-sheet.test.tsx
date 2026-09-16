import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PaperworkSheet } from '../paperwork-sheet';
import type { PaperworkContext, PaperworkDocument } from '../paperwork-model';

jest.mock('../paperwork-upload-form', () => ({
  PaperworkUploadForm: ({
    title,
    uploadOnly,
    fieldPrefix,
    onReceived,
  }: {
    title: string;
    uploadOnly: boolean;
    fieldPrefix: string;
    onReceived: () => void;
  }) => (
    <div
      data-testid={`form-${title}`}
      data-upload-only={String(uploadOnly)}
      data-field-prefix={fieldPrefix}
    >
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
  return render(
    <PaperworkSheet
      token={'a'.repeat(64)}
      studioName="Local Dev Studio"
      context={context(documents)}
    />,
  );
}

describe('PaperworkSheet', () => {
  // R-BU / W4 r7 MAJOR-2: two sentences about one document, one line apart,
  // used to disagree. They now say the same thing.
  it('reads an unchecked upload as not yet checked, beside its receipt', () => {
    renderSheet([
      doc({
        doc_type: 'coi_gl',
        state: 'awaiting_check',
        awaiting_check: true,
      }),
    ]);

    expect(screen.getByText('COI, general liability, not yet checked.')).toBeInTheDocument();
    expect(screen.getByText('Received. Local Dev Studio will confirm it.')).toBeInTheDocument();
    expect(
      screen.queryByText('COI, general liability is not on file.'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('COI, general liability, current.')).not.toBeInTheDocument();
  });

  // W4 r7 M-4: the studio pressed Reject and typed a reason it was told the
  // firm would read. This page is the only place it can be read.
  it('prints a refusal and its reason, and asks for the paper again', () => {
    renderSheet([
      doc({
        doc_type: 'coi_gl',
        state: 'refused',
        expires_on: null,
        awaiting_check: false,
        refusal_reason: 'The certificate names the wrong job address',
      }),
    ]);

    expect(screen.getByText('COI, general liability was not accepted.')).toBeInTheDocument();
    expect(
      screen.getByText('The certificate names the wrong job address.'),
    ).toBeInTheDocument();
    // No receipt sentence: nothing is waiting for the studio any more.
    expect(
      screen.queryByText('Received. Local Dev Studio will confirm it.'),
    ).not.toBeInTheDocument();
    // The form stands open, because paper is owed again.
    expect(screen.getByTestId('form-COI, general liability')).toBeInTheDocument();
  });

  // W4 r9 M-1: the firm did what the refusal asked and sent the paper again.
  // The page kept printing the refusal and its reason, with no receipt and the
  // form still open, while the record already read awaiting_check with no
  // reason — so the firm's most likely reading was that its upload failed.
  it('gives a re-sent refused paper the same receipt every other paper gets', async () => {
    const user = userEvent.setup();
    const { container } = renderSheet([
      doc({
        doc_type: 'coi_gl',
        state: 'refused',
        expires_on: null,
        blocks: [],
        awaiting_check: false,
        refusal_reason: 'The certificate names the wrong job address',
      }),
    ]);

    await user.click(
      screen.getByRole('button', { name: 'Send COI, general liability' }),
    );

    expect(
      container.querySelector('[data-paperwork-receipt="coi_gl"]'),
    ).toHaveTextContent('Received. Local Dev Studio will confirm it.');
    expect(
      screen.getByText('COI, general liability, not yet checked.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('COI, general liability was not accepted.'),
    ).not.toBeInTheDocument();
    expect(
      container.querySelector('[data-paperwork-refusal="coi_gl"]'),
    ).toBeNull();
    // The form closes and the reader is moved to the receipt, as on every
    // other row that has just been sent.
    expect(screen.queryByTestId('form-COI, general liability')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(
      container.querySelector('[data-paperwork-receipt="coi_gl"]'),
    );
  });

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
    // Paper that ARRIVED before this visit is not announced: nothing happened.
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('swaps a sent form for the receipt sentence, and the row stops saying not on file', async () => {
    const user = userEvent.setup();
    const { container } = renderSheet([]);

    expect(screen.getByTestId('form-W-9')).toBeInTheDocument();
    expect(screen.getByText('W-9 is not on file.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Send W-9' }));

    expect(screen.queryByTestId('form-W-9')).not.toBeInTheDocument();
    expect(
      container.querySelector('[data-paperwork-receipt="w9"]'),
    ).toHaveTextContent('Received. Local Dev Studio will confirm it.');
    // W4 r8 MAJOR-1 / QA F1: the row's OWN sentence moved with the send. It
    // used to read "W-9 is not on file." one line above that receipt.
    expect(screen.getByText('W-9, not yet checked.')).toBeInTheDocument();
    expect(screen.queryByText('W-9 is not on file.')).not.toBeInTheDocument();
    // The other two owed papers are untouched by one send — sentence included.
    expect(screen.getByTestId('form-Licence')).toBeInTheDocument();
    expect(screen.getByText('Licence is not on file.')).toBeInTheDocument();
  });

  // R-BU: the verified row is the row, and `awaiting_check` is its flag. A
  // renewal sent against paper the studio already holds does not erase what
  // that paper says or what its lapse holds up — both are still true until a
  // member opens the new one.
  it('keeps a lapsed row lapsed, and keeps its block, when a renewal is sent', async () => {
    const user = userEvent.setup();
    const { container } = renderSheet([
      doc({ doc_type: 'license', state: 'lapsed', expires_on: '2026-05-01' }),
    ]);

    await user.click(screen.getByRole('button', { name: 'Add Licence' }));
    await user.click(screen.getByRole('button', { name: 'Send Licence' }));

    expect(
      container.querySelector('[data-paperwork-receipt="license"]'),
    ).toHaveTextContent('Received. Local Dev Studio will confirm it.');
    expect(screen.getByText('Licence, lapsed 1 May 2026.')).toBeInTheDocument();
    expect(screen.getByText('Blocks site access.')).toBeInTheDocument();
  });

  // W4 r2 MAJOR-5. The send unmounts the form and the focused submit button
  // with it. Without a live region the page's ONE act had no outcome a screen
  // reader could hear, and focus fell to document.body.
  it('says the receipt into a polite live region and keeps the reader in place', async () => {
    const user = userEvent.setup();
    const { container } = renderSheet([]);

    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-live', 'polite');
    // Nothing is announced before the act.
    expect(region).toHaveTextContent('');

    await user.click(screen.getByRole('button', { name: 'Send W-9' }));

    expect(region).toHaveTextContent('Received. Local Dev Studio will confirm it.');
    const receipt = container.querySelector('[data-paperwork-receipt="w9"]');
    expect(receipt).toHaveAttribute('tabindex', '-1');
    expect(document.activeElement).toBe(receipt);
    expect(document.activeElement).not.toBe(document.body);
  });

  it('announces only the row that was sent, and moves focus to that row', async () => {
    const user = userEvent.setup();
    const { container } = renderSheet([]);

    await user.click(screen.getByRole('button', { name: 'Send Licence' }));

    expect(document.activeElement).toBe(
      container.querySelector('[data-paperwork-receipt="license"]'),
    );
    expect(container.querySelector('[data-paperwork-receipt="w9"]')).toBeNull();
  });

  /**
   * W4 r12 M-1. "Add {paper}" was the collapsed half of a ternary: the press
   * unmounted the focused button, focus fell to document.body, and nothing said
   * a form had opened. The rows that carry the act are exactly the rows that
   * matter — a lapsed COI always presents it.
   */
  it('keeps the Add act in place as a disclosure, and moves the reader into the form it opened', async () => {
    const user = userEvent.setup();
    renderSheet([
      doc({ doc_type: 'coi_gl', state: 'lapsed', expires_on: '2026-03-31', blocks: [] }),
      doc({ doc_type: 'w9', state: 'current', blocks: [], expires_on: null }),
      doc({ doc_type: 'license', state: 'current', blocks: [], expires_on: '2028-01-01' }),
    ]);

    const add = screen.getByRole('button', { name: 'Add COI, general liability' });
    expect(add).toHaveAttribute('aria-expanded', 'false');
    const panelId = add.getAttribute('aria-controls');
    expect(panelId).toBeTruthy();
    // The panel the trigger names is in the document before it is opened: no
    // dangling IDREF.
    const panel = document.getElementById(panelId as string);
    expect(panel).not.toBeNull();
    expect(panel).toHaveAttribute('hidden');

    await user.click(add);

    // The trigger SURVIVED its own press.
    expect(
      screen.getByRole('button', { name: 'Add COI, general liability' }),
    ).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById(panelId as string)).not.toHaveAttribute('hidden');
    expect(document.activeElement).not.toBe(document.body);
    expect(
      document.getElementById(panelId as string)?.contains(document.activeElement),
    ).toBe(true);
    expect(screen.getByRole('status')).toHaveTextContent(
      'The COI, general liability form is open.',
    );

    // And it is a real disclosure: pressing it again closes the form it opened.
    await user.click(screen.getByRole('button', { name: 'Add COI, general liability' }));
    expect(
      screen.getByRole('button', { name: 'Add COI, general liability' }),
    ).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('form-COI, general liability')).not.toBeInTheDocument();
  });

  it('gives a row that opens itself the same disclosure state, and lets the firm close it', async () => {
    const user = userEvent.setup();
    renderSheet([]);

    const add = screen.getByRole('button', { name: 'Add W-9' });
    expect(add).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('form-W-9')).toBeInTheDocument();
    // Nothing happened yet, so nothing is announced.
    expect(screen.getByRole('status')).toHaveTextContent('');

    await user.click(add);
    expect(screen.getByRole('button', { name: 'Add W-9' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.queryByTestId('form-W-9')).not.toBeInTheDocument();
    // The other owed papers are untouched by one row's close.
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

  /**
   * W4 r4 — P-3 keeps two differently-named `other_named` papers as two rows,
   * and the form's field ids were keyed on the doc type both rows share. The
   * sheet owns the unique key, so it is the sheet that must hand it down.
   */
  it('gives two other_named rows their own field prefix', async () => {
    const user = userEvent.setup();
    renderSheet([
      doc({
        doc_type: 'other_named',
        doc_label: 'MN asbestos permit',
        state: 'lapsed',
        expires_on: '2026-03-31',
        blocks: [],
      }),
      doc({
        doc_type: 'other_named',
        doc_label: 'Roof warranty',
        state: 'current',
        expires_on: '2028-01-01',
        blocks: [],
      }),
    ]);

    await user.click(screen.getByRole('button', { name: 'Add MN asbestos permit' }));
    await user.click(screen.getByRole('button', { name: 'Add Roof warranty' }));

    const prefixes = Array.from(
      document.querySelectorAll('[data-field-prefix]'),
    ).map((el) => el.getAttribute('data-field-prefix'));
    // Five rows are on the sheet (the three expected papers open by default);
    // what matters is that no two forms share a prefix, and that the two
    // `other_named` rows are not both keyed on the type they share.
    expect(prefixes).toHaveLength(5);
    expect(new Set(prefixes).size).toBe(5);
    expect(prefixes.filter((p) => p?.startsWith('other_named'))).toHaveLength(2);
    expect(prefixes).not.toContain('other_named');
  });

  it('carries no ids, no file paths and no other party on its face', () => {
    renderSheet([doc({ doc_type: 'coi_gl', state: 'lapsed', expires_on: '2026-03-31' })]);
    const body = document.body.textContent ?? '';
    expect(body).not.toContain('a'.repeat(64));
    expect(body).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
  });
});
