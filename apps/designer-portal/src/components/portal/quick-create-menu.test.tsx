import { render, screen, fireEvent } from '@testing-library/react';

import { QuickCreateMenu } from './quick-create-menu';

// LogTimeGlobal pulls in projects + toast context; the menu test only cares
// that it gets opened, so stub it with a visibility marker.
jest.mock('./time/log-time-global', () => ({
  LogTimeGlobal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="log-time-global" /> : null,
}));

const openMenu = () => {
  fireEvent.click(screen.getByRole('button', { name: /new/i }));
};

describe('QuickCreateMenu', () => {
  it('renders every quick-create route with the right href', () => {
    render(<QuickCreateMenu />);
    openMenu();

    const expected: Array<[string, string]> = [
      ['New Project', '/portal/projects/new'],
      ['New Proposal', '/portal/proposals/new'],
      ['Add Product', '/portal/catalog/new'],
      ['Add Client', '/portal/clients?add=1'],
      ['New Invoice', '/portal/billing/invoices/new'],
      ['New Decision', '/portal/decisions?new=1'],
    ];
    for (const [label, href] of expected) {
      expect(screen.getByRole('menuitem', { name: label })).toHaveAttribute('href', href);
    }
  });

  it('opens the global log-time dialog from the Log Time item', () => {
    render(<QuickCreateMenu />);
    openMenu();

    expect(screen.queryByTestId('log-time-global')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Log Time' }));
    expect(screen.getByTestId('log-time-global')).toBeInTheDocument();
  });
});
