import { StrictMode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AccountsBook } from '../accounts-book';
import { readPaperOrigin } from '@/lib/document/paper/paper-origin';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@patina/supabase', () => ({
  useInvoices: () => ({ data: [], isLoading: false }),
  useEarningsStats: () => ({ data: undefined }),
  computeArAging: () => ({ totalBalanceCents: 0, buckets: [] }),
}));
jest.mock('@/hooks/use-studio-accounts', () => ({ useStudioMargin: () => ({ data: undefined }) }));
jest.mock('@/hooks/use-studio-money', () => ({ useStudioMoney: () => ({
  bookStudioIds: [], canSeeRecord: () => true, canSeeStudio: () => false,
}) }));
jest.mock('../../overlays/doc-sheet', () => ({ DocSheetHead: () => <h1>Studio accounts</h1> }));
jest.mock('../../teaching/teaching-anchor-note', () => ({ TEACHING_MARGIN_COLUMN: '', TeachingAnchorNote: () => null }));
jest.mock('../accounts-ledger-page', () => ({ AccountsLedgerPage: ({ onOpenDocument, onOpenFolio }: { onOpenDocument: (id: string) => void; onOpenFolio: (id: string) => void }) => (
  <ul><li><button data-invoice-folio-opener="inv-1" onClick={() => onOpenFolio('inv-1')}>Invoice one</button><button onClick={() => onOpenDocument('job-1')}>Open job</button></li></ul>
) }));
jest.mock('../accounts-receivables-page', () => ({ AccountsReceivablesPage: () => <p>Receivables</p> }));
jest.mock('../accounts-earnings-page', () => ({ AccountsEarningsPage: () => null }));
jest.mock('../invoice-folio', () => ({ InvoiceFolio: ({ onOpenDocument }: { onOpenDocument: (id: string) => void }) => (
  <button data-action-key="open-invoice-document" onClick={() => onOpenDocument('job-1')}>Folio job</button>
) }));

beforeEach(() => { window.sessionStorage.clear(); mockPush.mockReset(); });

it('captures the book page, pressed invoice row and sheet scroll before departure', () => {
  const close = jest.fn();
  render(<div data-doc-sheet-scroll-region><AccountsBook onClose={close} /></div>);
  screen.getByRole('button', { name: 'Open job' }).closest('[data-doc-sheet-scroll-region]')!.scrollTop = 67;
  fireEvent.click(screen.getByRole('button', { name: 'Open job' }));
  expect(close).toHaveBeenCalledTimes(1);
  expect(mockPush).toHaveBeenCalledWith('/doc/job-1');
  expect(readPaperOrigin('job-1')).toMatchObject({ kind: 'studio-overlay', overlay: 'books', filter: 'ledger', focusKey: 'inv-1:1', scrollTop: 67 });
});

it('restores the exact pressed invoice row under StrictMode without navigation', async () => {
  render(<StrictMode><div data-doc-sheet-scroll-region><AccountsBook onClose={jest.fn()} initialContext={{ page: 'ledger', studioReturn: { overlay: 'books', filter: 'ledger', focusKey: 'inv-1:1', scrollTop: 0 } }} /></div></StrictMode>);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Open job' })).toHaveFocus());
  expect(mockPush).not.toHaveBeenCalled();
});

it('reopens the same folio and returns focus to its document act without replaying it', async () => {
  const view = render(<AccountsBook onClose={jest.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Invoice one' }));
  fireEvent.click(screen.getByRole('button', { name: 'Folio job' }));
  const held = readPaperOrigin('job-1');
  expect(held).toMatchObject({ subject: 'inv-1', focusKey: 'folio', filter: 'ledger' });
  view.unmount();
  mockPush.mockClear();
  render(<AccountsBook onClose={jest.fn()} initialContext={{ page: held.filter, studioReturn: { overlay: 'books', subject: held.subject, focusKey: held.focusKey, scrollTop: 0 } }} />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Folio job' })).toHaveFocus());
  expect(mockPush).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '← Accounts' }));
  expect(screen.getByRole('button', { name: 'Invoice one' })).toBeInTheDocument();
});
