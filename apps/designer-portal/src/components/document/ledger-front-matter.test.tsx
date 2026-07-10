/**
 * LedgerFrontMatter (help-desk Wave 1) — the optional `?` doorway after the
 * stat caption: renders only when `helpKey` is passed, and clicking it
 * dispatches the openHelp event with source 'front-matter' + the key.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { LedgerFrontMatter } from './ledger-front-matter';
import { DOCUMENT_HELP_EVENT, type OpenHelpEventDetail } from '@/lib/help-system/open-help';
import { DOCUMENT_SURFACE_KEYS } from '@/lib/help-system/document-surface-keys';

const STATS = [{ label: 'logged', value: '3h 20m' }];

describe('LedgerFrontMatter helpKey doorway', () => {
  it('renders no ? without a helpKey', () => {
    render(<LedgerFrontMatter caption="utilization" stats={STATS} />);
    expect(screen.queryByRole('button', { name: 'About this ledger' })).not.toBeInTheDocument();
  });

  it('renders the quiet ? and opens help scoped to the key with source front-matter', () => {
    const onOpenHelp = jest.fn();
    const listener = (e: Event) => onOpenHelp((e as CustomEvent<OpenHelpEventDetail>).detail);
    window.addEventListener(DOCUMENT_HELP_EVENT, listener);

    render(
      <LedgerFrontMatter
        caption="utilization"
        stats={STATS}
        helpKey={DOCUMENT_SURFACE_KEYS.hours}
      />,
    );

    const glyph = screen.getByRole('button', { name: 'About this ledger' });
    expect(glyph).toHaveTextContent('?');
    fireEvent.click(glyph);

    expect(onOpenHelp).toHaveBeenCalledWith({
      source: 'front-matter',
      surfaceKey: DOCUMENT_SURFACE_KEYS.hours,
    });
    window.removeEventListener(DOCUMENT_HELP_EVENT, listener);
  });

  it('still renders nothing at all with zero stats (the band yields, ? included)', () => {
    const { container } = render(
      <LedgerFrontMatter caption="throughput" stats={[]} helpKey={DOCUMENT_SURFACE_KEYS.orders} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
