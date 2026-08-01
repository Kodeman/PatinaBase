import { fireEvent, render, screen } from '@testing-library/react';
import { DateInput, Field, RowListEditor } from './field-kit';

describe('Discovery field semantics', () => {
  it('labels every row control with its column and row', () => {
    render(
      <RowListEditor
        rows={[{ room_type: 'office', floor_area_sqft: 450, room: 'Household' }]}
        columns={[
          {
            key: 'room_type',
            label: 'Room type',
            type: 'select',
            options: [{ value: 'office', label: 'Office' }],
          },
          { key: 'floor_area_sqft', label: 'Square footage', type: 'number' },
          {
            key: 'room',
            label: 'Household or room',
            type: 'select',
            options: [{ value: 'Household', label: 'Household' }],
          },
        ]}
        onChange={jest.fn()}
        addLabel="Add a room"
      />,
    );

    expect(screen.getByRole('combobox', { name: 'Room type, row 1' })).toBeVisible();
    expect(screen.getByRole('spinbutton', { name: 'Square footage, row 1' })).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'Household or room, row 1' })).toBeVisible();
  });

  it('offers direct MM/DD/YYYY entry and commits an ISO date-only value', () => {
    const onChange = jest.fn();

    render(
      <Field label="Hard date">
        <DateInput value={null} onChange={onChange} />
      </Field>,
    );

    const input = screen.getByRole('textbox', { name: 'Hard date' });
    expect(input).toHaveAccessibleDescription(/MM\/DD\/YYYY/i);
    fireEvent.change(input, { target: { value: '11/15/2026' } });
    fireEvent.blur(input);

    expect(onChange).toHaveBeenLastCalledWith('2026-11-15');
  });
});
