import { render, screen, fireEvent } from '@testing-library/react';
import { DecisionOptionBuilder, type DecisionOptionValue } from '../decision-option-builder';

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
    ...overrides,
  };
}

describe('DecisionOptionBuilder', () => {
  it('renders all 4 numeric/text inputs plus the name field, designer note, and recommendation checkbox', () => {
    render(
      <DecisionOptionBuilder
        index={0}
        value={baseValue()}
        onChange={jest.fn()}
      />
    );

    expect(screen.getByTestId('option-0-price')).toBeInTheDocument();
    expect(screen.getByTestId('option-0-quantity')).toBeInTheDocument();
    expect(screen.getByTestId('option-0-cost-delta')).toBeInTheDocument();
    expect(screen.getByTestId('option-0-lead-time-delta')).toBeInTheDocument();

    // Name input + designer note textarea + recommendation checkbox
    expect(screen.getByText(/Option Name/i)).toBeInTheDocument();
    expect(screen.getByText(/Designer Note/i)).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).toBeInTheDocument();
  });

  it('calls onChange with the new price string when typing into the price input', () => {
    const onChange = jest.fn();
    render(
      <DecisionOptionBuilder
        index={0}
        value={baseValue()}
        onChange={onChange}
      />
    );

    fireEvent.change(screen.getByTestId('option-0-price'), {
      target: { value: '$1,200.00' },
    });

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ price: '$1,200.00' }));
  });

  it('calls onChange with the new quantity string when typing into the quantity input', () => {
    const onChange = jest.fn();
    render(
      <DecisionOptionBuilder
        index={1}
        value={baseValue()}
        onChange={onChange}
      />
    );

    fireEvent.change(screen.getByTestId('option-1-quantity'), {
      target: { value: '4' },
    });

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ quantity: '4' }));
  });

  it('toggles isRecommended via the recommendation checkbox', () => {
    const onChange = jest.fn();
    render(
      <DecisionOptionBuilder
        index={0}
        value={baseValue({ isRecommended: false })}
        onChange={onChange}
      />
    );

    fireEvent.click(screen.getByRole('checkbox'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ isRecommended: true }));
  });

  it('does not render Remove button when onRemove is not provided', () => {
    render(
      <DecisionOptionBuilder
        index={0}
        value={baseValue()}
        onChange={jest.fn()}
      />
    );
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
  });

  it('renders Remove button and calls onRemove when clicked', () => {
    const onRemove = jest.fn();
    render(
      <DecisionOptionBuilder
        index={0}
        value={baseValue()}
        onChange={jest.fn()}
        onRemove={onRemove}
      />
    );
    const btn = screen.getByRole('button', { name: /remove/i });
    fireEvent.click(btn);
    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});
