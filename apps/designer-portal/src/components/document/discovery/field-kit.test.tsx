import { fireEvent, render, screen } from '@testing-library/react';
import { DateInput, Field, RowListEditor } from './field-kit';

describe('Discovery field semantics', () => {
  it('labels every row control with its column and row', () => {
    render(
      <RowListEditor
        rows={[
          {
            room_type: 'office',
            floor_area_sqft: 450,
            room: 'Household',
            keep_as_is: true,
          },
        ]}
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
          { key: 'keep_as_is', label: 'Keep', type: 'checkbox' },
        ]}
        onChange={jest.fn()}
        addLabel="Add a room"
      />,
    );

    expect(screen.getByRole('combobox', { name: 'Room type, row 1' })).toBeVisible();
    expect(screen.getByRole('spinbutton', { name: 'Square footage, row 1' })).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'Household or room, row 1' })).toBeVisible();
    expect(screen.getByRole('checkbox', { name: 'Keep, row 1' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Remove row 1' })).toBeVisible();
  });

  it('offers picker or keyboard date entry and commits an ISO date-only value', () => {
    const onChange = jest.fn();

    render(
      <Field label="Hard date">
        <DateInput value={null} onChange={onChange} />
      </Field>,
    );

    const input = screen.getByLabelText('Hard date');
    expect(input).toHaveAttribute('type', 'date');
    expect(input).toHaveAccessibleDescription(/picker or keyboard/i);

    fireEvent.change(input, { target: { value: '2026-11-15' } });

    expect(onChange).toHaveBeenLastCalledWith('2026-11-15');
  });
});
