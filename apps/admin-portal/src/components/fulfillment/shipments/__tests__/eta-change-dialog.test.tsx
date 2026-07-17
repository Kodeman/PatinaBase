import { render, screen, fireEvent } from '@testing-library/react';
import { EtaChangeDialog } from '@/components/fulfillment/shipments/eta-change-dialog';

// R4.5 (BOH-DECISIONS) — this dialog is the only operator-facing caller of
// fulfillment_update_shipment_eta (00363). Mirrors shipment-row.test.tsx's
// pattern: mock the mutation hook, keep everything else real.

const mockMutate = jest.fn();
let isError = false;
let isPending = false;

jest.mock('@/hooks/use-fulfillment-shipments', () => ({
  useRecordEtaChange: jest.fn(() => ({
    mutate: mockMutate,
    get isError() {
      return isError;
    },
    get isPending() {
      return isPending;
    },
    error: new Error('carrier feed unavailable'),
  })),
}));

describe('EtaChangeDialog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    isError = false;
    isPending = false;
  });

  it('renders nothing when closed', () => {
    render(
      <EtaChangeDialog
        shipmentId="ship-1"
        currentEta={null}
        committedShip={null}
        open={false}
        onClose={jest.fn()}
      />,
    );
    expect(screen.queryByTestId('eta-change-dialog')).not.toBeInTheDocument();
  });

  it('pre-fills the date from currentEta when one exists', () => {
    render(
      <EtaChangeDialog
        shipmentId="ship-1"
        currentEta="2026-09-10"
        committedShip="2026-09-03"
        open
        onClose={jest.fn()}
      />,
    );
    expect(screen.getByTestId('eta-change-date')).toHaveValue('2026-09-10');
  });

  it('falls back to committedShip when there is no currentEta yet', () => {
    render(
      <EtaChangeDialog
        shipmentId="ship-1"
        currentEta={null}
        committedShip="2026-09-03"
        open
        onClose={jest.fn()}
      />,
    );
    expect(screen.getByTestId('eta-change-date')).toHaveValue('2026-09-03');
  });

  it('keeps submit disabled until a reason is typed', () => {
    render(
      <EtaChangeDialog
        shipmentId="ship-1"
        currentEta="2026-09-10"
        committedShip={null}
        open
        onClose={jest.fn()}
      />,
    );
    expect(screen.getByTestId('eta-change-submit')).toBeDisabled();

    fireEvent.change(screen.getByTestId('eta-change-reason'), {
      target: { value: 'carrier delay' },
    });

    expect(screen.getByTestId('eta-change-submit')).toBeEnabled();
  });

  it('submits { currentEta, reason } (trimmed) to the mutation', () => {
    render(
      <EtaChangeDialog
        shipmentId="ship-1"
        currentEta="2026-09-10"
        committedShip={null}
        open
        onClose={jest.fn()}
      />,
    );

    fireEvent.change(screen.getByTestId('eta-change-date'), { target: { value: '2026-09-17' } });
    fireEvent.change(screen.getByTestId('eta-change-reason'), {
      target: { value: '  carrier delay  ' },
    });
    screen.getByTestId('eta-change-submit').click();

    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(mockMutate).toHaveBeenCalledWith(
      { currentEta: '2026-09-17', reason: 'carrier delay' },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it('closes on Cancel without calling the mutation', () => {
    const onClose = jest.fn();
    render(
      <EtaChangeDialog
        shipmentId="ship-1"
        currentEta="2026-09-10"
        committedShip={null}
        open
        onClose={onClose}
      />,
    );

    screen.getByTestId('eta-change-cancel').click();

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('surfaces a mutation error inline', () => {
    isError = true;
    render(
      <EtaChangeDialog
        shipmentId="ship-1"
        currentEta="2026-09-10"
        committedShip={null}
        open
        onClose={jest.fn()}
      />,
    );
    expect(screen.getByTestId('eta-change-error')).toHaveTextContent('carrier feed unavailable');
  });
});
