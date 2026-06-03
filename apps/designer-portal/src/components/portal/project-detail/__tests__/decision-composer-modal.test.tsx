import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// field-primitives transitively imports @patina/help-system → @portabletext/react
// (ESM-only, untransformed by jest). Stub it with native-input equivalents — the
// modal only relies on their value/onChange/placeholder/options behavior, which
// these reproduce faithfully, keeping the test decoupled from the CMS layer.
jest.mock('../../activation-wizard/field-primitives', () => {
  const React = require('react');
  return {
    FieldRow: ({ children }: { children: React.ReactNode }) =>
      React.createElement('div', null, children),
    TextInput: ({ value, onChange, placeholder, type }: any) =>
      React.createElement('input', {
        placeholder,
        type: type || 'text',
        value,
        onChange: (e: any) => onChange(e.target.value),
      }),
    TextArea: ({ value, onChange, rows }: any) =>
      React.createElement('textarea', {
        rows,
        value,
        onChange: (e: any) => onChange(e.target.value),
      }),
    Select: ({ value, onChange, options }: any) =>
      React.createElement(
        'select',
        { value, onChange: (e: any) => onChange(e.target.value) },
        (options ?? []).map((o: any) =>
          React.createElement('option', { key: o.value, value: o.value }, o.label),
        ),
      ),
  };
});

const mutateAsync = jest.fn().mockResolvedValue({});
const createDraftAsync = jest.fn().mockResolvedValue({ id: 'draft-1' });

jest.mock('@patina/supabase', () => ({
  useCreateDecision: () => ({ mutateAsync, isPending: false }),
  useProjectFFEItems: () => ({ data: [] }),
  // Pulled in transitively via useMaterializeDraftOptions + the option builder's
  // ProductPickerModal. Only useCreateDraftProduct is actually invoked here.
  useCreateDraftProduct: () => ({ mutateAsync: createDraftAsync, isPending: false }),
  useProducts: () => ({ data: { data: [] }, isLoading: false, isError: false }),
  useLayerProducts: () => ({ data: [], isLoading: false, isError: false }),
  useLayerCounts: () => ({ data: { personal: 0, studio: 0, catalog: 0 } }),
  useCrossLayerSearch: () => ({
    data: {
      byLayer: { personal: [], studio: [], catalog: [] },
      counts: { personal: 0, studio: 0, catalog: 0 },
      total: 0,
    },
    isLoading: false,
    isError: false,
  }),
  useProposalCaptures: () => ({ data: [], isLoading: false, isError: false }),
}));

import { DecisionComposerModal } from '../decision-composer-modal';

beforeEach(() => {
  mutateAsync.mockClear();
  mutateAsync.mockResolvedValue({});
  createDraftAsync.mockClear();
  createDraftAsync.mockResolvedValue({ id: 'draft-1' });
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
  it('renders 2 default options (Option 1 & 2) with a disabled "Send to client" button', () => {
    setup();
    expect(screen.getByText('Option 1')).toBeInTheDocument();
    expect(screen.getByText('Option 2')).toBeInTheDocument();
    expect(screen.queryByText('Option 3')).not.toBeInTheDocument();

    const sendBtn = screen.getByRole('button', { name: /send to client/i });
    expect(sendBtn).toBeDisabled();
  });

  it('defaults each option to the library-first CTA (no name field until the designer picks or goes manual)', () => {
    setup();
    expect(screen.getByTestId('option-0-choose-product')).toBeInTheDocument();
    expect(screen.queryByTestId('option-0-name')).not.toBeInTheDocument();
  });

  it('keeps "Send to client" disabled when only the title is filled (option names are also required)', () => {
    setup();
    const titleInput = screen.getByPlaceholderText(/Choose primary upholstery fabric/i);
    fireEvent.change(titleInput, { target: { value: 'Pick a fabric' } });
    expect(screen.getByRole('button', { name: /send to client/i })).toBeDisabled();
  });

  it('"+ Add option" grows option count from 2 to 3', () => {
    setup();
    expect(screen.queryByText('Option 3')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /\+ add option/i }));
    expect(screen.getByText('Option 3')).toBeInTheDocument();
  });

  it('shows the FF&E picker (with "Blocked items" label) when blocking is set to "Blocks procurement"', () => {
    setup();
    const select = screen.getByDisplayValue('Not blocking');
    fireEvent.change(select, { target: { value: 'blocks_procurement' } });
    expect(screen.getByText(/Blocked items/i)).toBeInTheDocument();
  });

  it('calls useCreateDecision().mutateAsync with the expected payload when sending, then onClose', async () => {
    const onClose = jest.fn();
    setup({ onClose });

    fireEvent.change(screen.getByPlaceholderText(/Choose primary upholstery fabric/i), {
      target: { value: 'Pick a fabric' },
    });

    // Each option starts library-first; go manual to type a name.
    fireEvent.click(screen.getByTestId('option-0-enter-manually'));
    fireEvent.click(screen.getByTestId('option-1-enter-manually'));
    fireEvent.change(screen.getByTestId('option-0-name'), { target: { value: 'Linen — Stone' } });
    fireEvent.change(screen.getByTestId('option-1-name'), { target: { value: 'Velvet — Sage' } });

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
    const callArg = mutateAsync.mock.calls[0][0];
    expect(callArg.options).toHaveLength(2);

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});
