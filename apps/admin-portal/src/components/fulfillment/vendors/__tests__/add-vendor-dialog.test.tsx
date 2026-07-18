import { render, screen, fireEvent } from '@testing-library/react';
import { AddVendorDialog } from '@/components/fulfillment/vendors/add-vendor-dialog';

// I15 (BOH-DECISIONS) — this dialog is the only operator-facing caller of
// fulfillment_create_vendor (00371). Mirrors shipments/eta-change-dialog's
// test pattern: mock the mutation hook, keep everything else real.

const mockMutate = jest.fn();
const mockReset = jest.fn();
let isError = false;
let isPending = false;

jest.mock('@/hooks/use-fulfillment-vendors', () => ({
  useCreateVendor: jest.fn(() => ({
    mutate: mockMutate,
    reset: mockReset,
    get isError() {
      return isError;
    },
    get isPending() {
      return isPending;
    },
    error: new Error('a vendor named "Acme Textiles" already exists'),
  })),
}));

describe('AddVendorDialog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    isError = false;
    isPending = false;
  });

  it('renders nothing when closed', () => {
    render(<AddVendorDialog open={false} onClose={jest.fn()} onCreated={jest.fn()} />);
    expect(screen.queryByTestId('add-vendor-dialog')).not.toBeInTheDocument();
  });

  it('keeps submit disabled until a name is typed', () => {
    render(<AddVendorDialog open onClose={jest.fn()} onCreated={jest.fn()} />);
    expect(screen.getByTestId('add-vendor-submit')).toBeDisabled();

    fireEvent.change(screen.getByTestId('add-vendor-name'), {
      target: { value: 'Acme Textiles' },
    });

    expect(screen.getByTestId('add-vendor-submit')).toBeEnabled();
  });

  it('keeps submit disabled when the name is only whitespace', () => {
    render(<AddVendorDialog open onClose={jest.fn()} onCreated={jest.fn()} />);

    fireEvent.change(screen.getByTestId('add-vendor-name'), {
      target: { value: '   ' },
    });

    expect(screen.getByTestId('add-vendor-submit')).toBeDisabled();
  });

  it('submits the trimmed name with website/notes undefined when left blank', () => {
    render(<AddVendorDialog open onClose={jest.fn()} onCreated={jest.fn()} />);

    fireEvent.change(screen.getByTestId('add-vendor-name'), {
      target: { value: '  Acme Textiles  ' },
    });
    screen.getByTestId('add-vendor-submit').click();

    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(mockMutate).toHaveBeenCalledWith(
      { name: 'Acme Textiles', website: undefined, notes: undefined },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it('submits trimmed website and notes when provided', () => {
    render(<AddVendorDialog open onClose={jest.fn()} onCreated={jest.fn()} />);

    fireEvent.change(screen.getByTestId('add-vendor-name'), { target: { value: 'Acme Textiles' } });
    fireEvent.change(screen.getByTestId('add-vendor-website'), {
      target: { value: '  https://acme.example  ' },
    });
    fireEvent.change(screen.getByTestId('add-vendor-notes'), {
      target: { value: '  net-30, ships blind  ' },
    });
    screen.getByTestId('add-vendor-submit').click();

    expect(mockMutate).toHaveBeenCalledWith(
      { name: 'Acme Textiles', website: 'https://acme.example', notes: 'net-30, ships blind' },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it('calls onCreated with the new vendorId when the mutation succeeds', () => {
    const onCreated = jest.fn();
    render(<AddVendorDialog open onClose={jest.fn()} onCreated={onCreated} />);

    fireEvent.change(screen.getByTestId('add-vendor-name'), { target: { value: 'Acme Textiles' } });
    screen.getByTestId('add-vendor-submit').click();

    const opts = mockMutate.mock.calls[0][1] as { onSuccess: (result: { vendorId: string }) => void };
    opts.onSuccess({ vendorId: 'vendor-1' });

    expect(onCreated).toHaveBeenCalledWith('vendor-1');
  });

  it('closes on Cancel without calling the mutation', () => {
    const onClose = jest.fn();
    render(<AddVendorDialog open onClose={onClose} onCreated={jest.fn()} />);

    screen.getByTestId('add-vendor-cancel').click();

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('surfaces a mutation error inline', () => {
    isError = true;
    render(<AddVendorDialog open onClose={jest.fn()} onCreated={jest.fn()} />);
    expect(screen.getByTestId('add-vendor-error')).toHaveTextContent('already exists');
  });
});
