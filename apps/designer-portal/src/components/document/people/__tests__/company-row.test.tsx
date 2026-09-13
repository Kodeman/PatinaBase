/**
 * The Directory's FIRM row (W2b). Rewritten: the row it tested — a bordered
 * white card with an optional status dot and a kind pill — is retired by PR-q's
 * ledger row and R-G's two word columns.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { CompanyRow, companyKindLabel } from '../directory/company-row';

function renderRow(over: Partial<Parameters<typeof CompanyRow>[0]> = {}) {
  const onOpen = jest.fn();
  render(
    <ul>
      <CompanyRow
        firmId="firm-northgate"
        name="Northgate Electric"
        kind="sub"
        line="Electrical sub · 1 on the crew · 2 open jobs"
        paperState="lapsed"
        payeeMarker="Signs: Dana Kowalski"
        onOpen={onOpen}
        {...over}
      />
    </ul>,
  );
  return { onOpen };
}

describe('CompanyRow', () => {
  it('prints the firm, its line, its paper word and its payee marker', () => {
    renderRow();
    expect(screen.getByRole('button', { name: 'Northgate Electric' })).toBeInTheDocument();
    expect(
      screen.getByText('Electrical sub · 1 on the crew · 2 open jobs'),
    ).toBeInTheDocument();
    expect(screen.getByText('Lapsed')).toBeInTheDocument();
    expect(screen.getByText('Signs: Dana Kowalski')).toBeInTheDocument();
  });

  it('R-G — carries NO reach word and NO consent word; a firm has neither', () => {
    renderRow();
    expect(screen.queryByText('Field link')).not.toBeInTheDocument();
    expect(screen.queryByText('Texting')).not.toBeInTheDocument();
    expect(screen.queryByText('Not asked')).not.toBeInTheDocument();
  });

  it('R-A — a firm that never owed paper prints no paper word and no marker', () => {
    renderRow({ paperState: null, payeeMarker: null, name: 'Great Northern Bank' });
    expect(screen.queryByText('Not on file')).not.toBeInTheDocument();
    expect(screen.queryByText(/^Signs:/)).not.toBeInTheDocument();
  });

  it('opens the firm by its own card id', () => {
    const { onOpen } = renderRow();
    fireEvent.click(screen.getByRole('button', { name: 'Northgate Electric' }));
    expect(onOpen).toHaveBeenCalled();
  });

  it('the accessible name of the control is the firm name alone', () => {
    renderRow();
    const control = screen.getByRole('button', { name: 'Northgate Electric' });
    expect(control).toHaveAttribute('data-open-firm', 'firm-northgate');
  });

  it('companyKindLabel falls back to "Company", and prettifies an unknown kind', () => {
    expect(companyKindLabel(null)).toBe('Company');
    expect(companyKindLabel('gc')).toBe('GC firm');
    expect(companyKindLabel('tile_setter')).toBe('Tile Setter');
  });
});
