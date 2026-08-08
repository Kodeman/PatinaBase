import { fireEvent, render, screen } from '@testing-library/react';

import { DateTextInput } from '../date-text-input';

describe('DateTextInput', () => {
  it('uses the browser date picker while keeping the stored value canonical', () => {
    const onChange = jest.fn();

    render(
      <DateTextInput
        value="2026-08-07"
        onChange={onChange}
        ariaLabel="Start date"
      />,
    );

    const input = screen.getByLabelText('Start date');
    expect(input).toHaveAttribute('type', 'date');
    expect(input).toHaveValue('2026-08-07');

    fireEvent.change(input, { target: { value: '2026-08-19' } });

    expect(onChange).toHaveBeenCalledWith('2026-08-19');
  });

  it('clears through the date control and reports the empty value as valid', () => {
    const onChange = jest.fn();
    const onValidityChange = jest.fn();

    render(
      <DateTextInput
        value="2026-08-07"
        onChange={onChange}
        ariaLabel="Start date"
        onValidityChange={onValidityChange}
      />,
    );

    fireEvent.change(screen.getByLabelText('Start date'), {
      target: { value: '' },
    });

    expect(onChange).toHaveBeenCalledWith(null);
    expect(onValidityChange).toHaveBeenLastCalledWith(true);
  });

  it('rejects non-canonical controlled values instead of showing free-form text', () => {
    const onValidityChange = jest.fn();

    render(
      <DateTextInput
        value="08/07/2026"
        onChange={jest.fn()}
        ariaLabel="Start date"
        onValidityChange={onValidityChange}
      />,
    );

    expect(screen.getByLabelText('Start date')).toHaveValue('');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Choose a valid calendar date.',
    );
    expect(onValidityChange).toHaveBeenLastCalledWith(false);
  });
});
