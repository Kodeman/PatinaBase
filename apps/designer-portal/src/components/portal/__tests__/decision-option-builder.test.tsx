import { render, screen, fireEvent } from '@testing-library/react';

// The builder renders a ProductPickerModal (and exports a draft-materialize
// hook), so the whole @patina/supabase surface it pulls in must be stubbed.
jest.mock('@patina/supabase', () => ({
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
  useCreateDraftProduct: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

import { DecisionOptionBuilder, type DecisionOptionValue } from '../decision-option-builder';

// Default to the manual-fields view so the field assertions have something to
// read; the library-first State A is exercised explicitly where needed.
function baseValue(overrides: Partial<DecisionOptionValue> = {}): DecisionOptionValue {
  return {
    name: '',
    imageUrl: '',
    designerNote: '',
    isRecommended: false,
    price: '',
    quantity: '',
    costDelta: '',
    leadTimeDelta: '',
    manualMode: true,
    saveAsDraft: true,
    ...overrides,
  };
}

describe('DecisionOptionBuilder', () => {
  it('State A: a pristine option shows the library-first CTA, not the fields', () => {
    render(
      <DecisionOptionBuilder index={0} value={baseValue({ manualMode: false })} onChange={jest.fn()} />
    );
    expect(screen.getByTestId('option-0-choose-product')).toBeInTheDocument();
    expect(screen.queryByTestId('option-0-price')).not.toBeInTheDocument();
  });

  it('opens the product picker when the library CTA is clicked', () => {
    render(
      <DecisionOptionBuilder index={0} value={baseValue({ manualMode: false })} onChange={jest.fn()} />
    );
    fireEvent.click(screen.getByTestId('option-0-choose-product'));
    expect(screen.getByTestId('product-picker-modal')).toBeInTheDocument();
  });

  it('"enter manually" flips the option into manual mode', () => {
    const onChange = jest.fn();
    render(
      <DecisionOptionBuilder index={0} value={baseValue({ manualMode: false })} onChange={onChange} />
    );
    fireEvent.click(screen.getByTestId('option-0-enter-manually'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ manualMode: true }));
  });

  it('renders all 4 numeric/text inputs plus name, designer note, and recommendation checkbox (manual mode)', () => {
    render(<DecisionOptionBuilder index={0} value={baseValue()} onChange={jest.fn()} />);

    expect(screen.getByTestId('option-0-price')).toBeInTheDocument();
    expect(screen.getByTestId('option-0-quantity')).toBeInTheDocument();
    expect(screen.getByTestId('option-0-cost-delta')).toBeInTheDocument();
    expect(screen.getByTestId('option-0-lead-time-delta')).toBeInTheDocument();
    expect(screen.getByTestId('option-0-name')).toBeInTheDocument();
    expect(screen.getByText(/Designer Note/i)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /my recommendation/i })).toBeInTheDocument();
  });

  it('calls onChange with the new price string when typing into the price input', () => {
    const onChange = jest.fn();
    render(<DecisionOptionBuilder index={0} value={baseValue()} onChange={onChange} />);

    fireEvent.change(screen.getByTestId('option-0-price'), {
      target: { value: '$1,200.00' },
    });

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ price: '$1,200.00' }));
  });

  it('calls onChange with the new quantity string when typing into the quantity input', () => {
    const onChange = jest.fn();
    render(<DecisionOptionBuilder index={1} value={baseValue()} onChange={onChange} />);

    fireEvent.change(screen.getByTestId('option-1-quantity'), {
      target: { value: '4' },
    });

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ quantity: '4' }));
  });

  it('toggles isRecommended via the recommendation checkbox', () => {
    const onChange = jest.fn();
    render(
      <DecisionOptionBuilder index={0} value={baseValue({ isRecommended: false })} onChange={onChange} />
    );

    fireEvent.click(screen.getByRole('checkbox', { name: /my recommendation/i }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ isRecommended: true }));
  });

  it('does not render Remove button when onRemove is not provided', () => {
    render(<DecisionOptionBuilder index={0} value={baseValue()} onChange={jest.fn()} />);
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
  });

  it('renders Remove button and calls onRemove when clicked', () => {
    const onRemove = jest.fn();
    render(
      <DecisionOptionBuilder index={0} value={baseValue()} onChange={jest.fn()} onRemove={onRemove} />
    );
    const btn = screen.getByRole('button', { name: /remove/i });
    fireEvent.click(btn);
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('State B: a linked option shows Change / Clear-link and hides the save-as-draft toggle', () => {
    render(
      <DecisionOptionBuilder
        index={0}
        value={baseValue({ productId: 'prod-1', name: 'Linen', manualMode: false })}
        onChange={jest.fn()}
      />
    );
    expect(screen.getByTestId('option-0-change-product')).toBeInTheDocument();
    expect(screen.getByTestId('option-0-clear-link')).toBeInTheDocument();
    expect(screen.queryByTestId('option-0-save-as-draft')).not.toBeInTheDocument();
  });
});
