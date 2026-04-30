import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mutateAsync = jest.fn().mockResolvedValue({});

jest.mock('@patina/supabase', () => ({
  useCreateDecision: () => ({ mutateAsync, isPending: false }),
  useProjectFFEItems: () => ({ data: [] }),
}));

import { DecisionComposerModal } from '../decision-composer-modal';

// Polyfill crypto.randomUUID for jsdom (used by addOption() in the modal)
let __uuidCounter = 0;
beforeAll(() => {
  if (!globalThis.crypto) {
    // @ts-expect-error - assigning a partial crypto for tests only
    globalThis.crypto = {};
  }
  if (typeof globalThis.crypto.randomUUID !== 'function') {
    // @ts-expect-error - assigning a partial crypto for tests only
    globalThis.crypto.randomUUID = () => `test-uuid-${++__uuidCounter}`;
  }
});

beforeEach(() => {
  mutateAsync.mockClear();
  mutateAsync.mockResolvedValue({});
});

function setup(overrides: { onClose?: () => void } = {}) {
  const onClose = overrides.onClose ?? jest.fn();
  render(
    <DecisionComposerModal
      projectId="proj-1"
      designerClientId="dc-1"
      onClose={onClose}
    />
  );
  return { onClose };
}

describe('DecisionComposerModal', () => {
  it('renders 2 default options labelled A and B with empty title and a disabled "Send to client" button', () => {
    setup();
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
    expect(screen.queryByText('C')).not.toBeInTheDocument();

    const sendBtn = screen.getByRole('button', { name: /send to client/i });
    expect(sendBtn).toBeDisabled();
  });

  it('still keeps "Send to client" disabled when only the title is filled (option names are also required)', () => {
    setup();
    const titleInput = screen.getByPlaceholderText(/Choose primary upholstery fabric/i);
    fireEvent.change(titleInput, { target: { value: 'Pick a fabric' } });
    // canSubmit also requires every option to have a name; it still stays disabled
    expect(screen.getByRole('button', { name: /send to client/i })).toBeDisabled();
  });

  it('"+ Add option" grows option count from 2 to 3', () => {
    setup();
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
    expect(screen.queryByText('C')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /\+ add option/i }));
    expect(screen.getByText('C')).toBeInTheDocument();
  });

  it('shows the FF&E picker (with "Blocked items" label) when blocking is set to "Blocks procurement"', () => {
    setup();
    // Blocking picker is the second select on the form (Type, Blocking, Deadline trio)
    // The Blocking <Select> has "Not blocking" / "Blocks procurement" / "Blocks phase" options
    const select = screen.getByDisplayValue('Not blocking');
    fireEvent.change(select, { target: { value: 'blocks_procurement' } });

    expect(screen.getByText(/Blocked items/i)).toBeInTheDocument();
  });

  it('calls useCreateDecision().mutateAsync with the expected payload when clicking "Send to client" and then onClose', async () => {
    const onClose = jest.fn();
    setup({ onClose });

    // Fill title
    fireEvent.change(screen.getByPlaceholderText(/Choose primary upholstery fabric/i), {
      target: { value: 'Pick a fabric' },
    });

    // Fill option names so canSubmit is true
    const optionNameInputs = screen.getAllByPlaceholderText(/Option name/i);
    fireEvent.change(optionNameInputs[0], { target: { value: 'Linen — Stone' } });
    fireEvent.change(optionNameInputs[1], { target: { value: 'Velvet — Sage' } });

    const sendBtn = screen.getByRole('button', { name: /send to client/i });
    expect(sendBtn).not.toBeDisabled();
    fireEvent.click(sendBtn);

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));

    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        designerClientId: 'dc-1',
        projectId: 'proj-1',
        title: 'Pick a fabric',
        status: 'pending',
        options: expect.arrayContaining([
          expect.objectContaining({ name: 'Linen — Stone' }),
          expect.objectContaining({ name: 'Velvet — Sage' }),
        ]),
      })
    );
    // exactly two options
    const callArg = mutateAsync.mock.calls[0][0];
    expect(callArg.options).toHaveLength(2);

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});
