/**
 * US-28 S10c: on the piece page "Used on" is a run of ledger rows, each with
 * its job's tick and the stage word in ink; a piece on no job says so once.
 */
import { render, screen } from '@testing-library/react';
import { PieceUsedOn } from '../piece-used-on';

let usage: { data?: Record<string, unknown[]>; isLoading: boolean; isError: boolean } = {
  data: {},
  isLoading: false,
  isError: false,
};

jest.mock('@patina/supabase', () => ({ createBrowserClient: jest.fn() }));

jest.mock('../use-piece-usage', () => ({
  ...jest.requireActual('../use-piece-usage'),
  usePieceUsage: () => usage,
}));

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

describe('PieceUsedOn — the library piece page', () => {
  it('prints one ticked ledger row per job, the stage in ink', () => {
    usage = {
      isLoading: false,
      isError: false,
      data: {
        'p-arden': [
          { projectId: 'proj-h', title: 'Holloway Den', clientName: 'Nora and Sam Holloway', stage: 'project' },
          { projectId: 'proj-p', title: 'Pell Court Dining', clientName: null, stage: 'install' },
        ],
      },
    };
    const { container } = render(<PieceUsedOn productId="p-arden" />);

    expect(screen.getByRole('heading', { name: 'Used on' })).toHaveClass('eb');
    const rows = container.querySelectorAll('.lrow');
    expect(rows).toHaveLength(2);

    const holloway = screen.getByRole('link', { name: 'Holloway Den' });
    expect(holloway).toHaveAttribute('href', '/doc/proj-h');
    expect(holloway.closest('.tick')).toHaveClass('st-project');
    expect(rows[0].querySelector('.lphase')).toHaveTextContent('Project');
    expect(rows[0].querySelector('.lphase')).toHaveClass('word');
    expect(rows[0]).toHaveTextContent('Nora and Sam Holloway');

    expect(screen.getByRole('link', { name: 'Pell Court Dining' }).closest('.tick')).toHaveClass(
      'st-install',
    );
  });

  it('says a piece on no job in one sentence', () => {
    usage = { isLoading: false, isError: false, data: {} };
    render(<PieceUsedOn productId="p-arden" />);
    expect(screen.getByText('Not on a job yet.')).toHaveClass('empty-t');
  });

  it('prints nothing while the read is loading', () => {
    usage = { isLoading: true, isError: false };
    const { container } = render(<PieceUsedOn productId="p-arden" />);
    expect(container).toBeEmptyDOMElement();
  });
});
