import type { ComponentProps } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { InvoiceOverlays, openInvoiceComposer, openInvoiceFolio } from '../invoice-overlays';

type ComposerProps = ComponentProps<typeof import('../invoice-composer').InvoiceComposer>;
const mockComposer = jest.fn();
const mockPush = jest.fn();
let mockReleaseComposer: () => void;

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('react', () => {
  const actual = jest.requireActual('react');
  return {
    ...actual,
    // A cold chunk stays unresolved until the test explicitly delivers it.
    lazy: (load: () => Promise<unknown>) => actual.lazy(() => new Promise((resolve) => {
      mockReleaseComposer = () => { void load().then(resolve); };
    })),
  };
});
jest.mock('../../overlays/active-dialog', () => ({
  isElementRendered: () => true,
  topActiveModalDialog: () => document.querySelector('[role="dialog"]'),
}));
jest.mock('../invoice-composer', () => ({
  InvoiceComposer: (props: ComposerProps) => {
    mockComposer(props);
    return <button onClick={() => props.onDrafted('draft-1', 'project-2')}>Save draft</button>;
  },
}));
jest.mock('../invoice-folio', () => ({
  InvoiceFolio: ({ invoiceId, landOn, onOpenDocument }: {
    invoiceId: string; landOn?: string; onOpenDocument: (id: string | null) => void;
  }) => (
    <div data-testid="folio" data-invoice={invoiceId} data-land={landOn}>
      <button onClick={() => onOpenDocument('project-2')}>Open job</button>
    </div>
  ),
}));

it('keeps cold composer context in the eager dismissible sheet, discards cancelled opens, and hands the draft to the folio', async () => {
  jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => { callback(0); return 0; });
  const { unmount } = render(<><button>Draw invoice</button><InvoiceOverlays /></>);
  const opener = screen.getByRole('button', { name: 'Draw invoice' });
  opener.focus();
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(mockComposer).not.toHaveBeenCalled();

  act(() => openInvoiceComposer({ projectId: 'cancelled-project', initialTimeEntryIds: ['old-time'] }));
  const pendingSheet = screen.getByRole('dialog', { name: 'Draw an invoice' });
  expect(pendingSheet).toHaveFocus();
  expect(screen.getByRole('status')).toHaveTextContent('Loading invoice composer');
  expect(mockComposer).not.toHaveBeenCalled();

  // The owner hears a newer doorway even while the body is suspended.
  act(() => openInvoiceComposer({ mode: 'studio' }));
  expect(screen.getByRole('dialog')).toBe(pendingSheet);
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(opener).toHaveFocus();

  await act(async () => { mockReleaseComposer(); });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(mockComposer).not.toHaveBeenCalled();

  const context = {
    projectId: 'project-2', initialFfeItemIds: ['ffe-2'], initialTimeEntryIds: ['time-2'],
    initialPurchaseIds: ['purchase-2'], initialCostLineIds: ['rider-2'],
  };
  await act(async () => openInvoiceComposer(context));
  expect(mockComposer.mock.calls.at(-1)?.[0].context).toBe(context);
  expect(screen.queryByRole('status')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
  expect(screen.getByRole('dialog', { name: 'Invoice folio' })).toBeInTheDocument();
  expect(screen.getByTestId('folio')).toHaveAttribute('data-invoice', 'draft-1');
  fireEvent.click(screen.getByRole('button', { name: 'Close sheet' }));

  const editContext = { mode: 'edit' as const, invoiceId: 'draft-2' };
  await act(async () => openInvoiceComposer(editContext));
  expect(screen.getByRole('dialog', { name: 'Edit the draft' })).toBeInTheDocument();
  expect(mockComposer.mock.calls.at(-1)?.[0].context).toBe(editContext);
  fireEvent.click(screen.getByRole('button', { name: 'Close sheet' }));

  act(() => openInvoiceFolio('invoice-3', { landOn: 'record' }));
  expect(screen.getByTestId('folio')).toHaveAttribute('data-land', 'record');
  fireEvent.click(screen.getByRole('button', { name: 'Open job' }));
  expect(mockPush).toHaveBeenCalledWith('/doc/project-2');
  expect(screen.queryByRole('dialog')).toBeNull();
  unmount();
  jest.restoreAllMocks();
});
