import { render, screen, fireEvent } from '@testing-library/react';
import { ConfigKeyEditor } from '@/components/fulfillment/config/config-key-editor';
import type { FulfillmentConfigRow } from '@patina/fulfillment';

// Config editor form state (S4, spec §10) — the typed-field parse/serialize
// itself is exhaustively unit-tested in
// packages/fulfillment/src/__tests__/config-form.test.ts; this suite proves
// the COMPONENT wires that logic to inputs and Save correctly, for both the
// typed-scalar path and the structured business_hours path.

const MARGIN_FLOOR_ROW: FulfillmentConfigRow = {
  key: 'margin_floor_warning',
  value: { pct: 0.25 },
  description: 'Workbench margin floor (R1.12)',
  updatedBy: null,
  updatedAt: '2026-07-01T00:00:00Z',
};

const SLA_HOURS_ROW: FulfillmentConfigRow = {
  key: 'sla_hours',
  value: {
    intake_visible_minutes: 1,
    split_confirm_business_hours: 4,
    ack_chase_business_days: 2,
    tracking_after_ship_hours: 24,
  },
  description: null,
  updatedBy: 'kody@kochaver.com',
  updatedAt: '2026-07-01T00:00:00Z',
};

const BUSINESS_HOURS_ROW: FulfillmentConfigRow = {
  key: 'business_hours',
  value: {
    timezone: 'America/Chicago',
    week: {
      mon: ['09:00', '17:00'],
      tue: ['09:00', '17:00'],
      wed: ['09:00', '17:00'],
      thu: ['09:00', '17:00'],
      fri: ['09:00', '17:00'],
    },
    holidays: [],
  },
  description: null,
  updatedBy: null,
  updatedAt: '2026-07-01T00:00:00Z',
};

describe('ConfigKeyEditor — typed scalar fields', () => {
  it('renders the whole-percent form value from the stored fraction', () => {
    render(<ConfigKeyEditor row={MARGIN_FLOOR_ROW} onSave={jest.fn()} saving={false} />);
    expect(screen.getByTestId('config-field-margin_floor_warning-pct')).toHaveValue(25);
  });

  it('editing the field and saving produces the fraction, not the raw percent, in onSave', () => {
    const onSave = jest.fn();
    render(<ConfigKeyEditor row={MARGIN_FLOOR_ROW} onSave={onSave} saving={false} />);

    fireEvent.change(screen.getByTestId('config-field-margin_floor_warning-pct'), { target: { value: '30' } });
    fireEvent.click(screen.getByTestId('config-save-margin_floor_warning'));

    expect(onSave).toHaveBeenCalledWith({ pct: 0.3 });
  });

  it('a multi-field key (sla_hours) preserves untouched sibling fields on save', () => {
    const onSave = jest.fn();
    render(<ConfigKeyEditor row={SLA_HOURS_ROW} onSave={onSave} saving={false} />);

    fireEvent.change(screen.getByTestId('config-field-sla_hours-ack_chase_business_days'), {
      target: { value: '3' },
    });
    fireEvent.click(screen.getByTestId('config-save-sla_hours'));

    expect(onSave).toHaveBeenCalledWith({
      intake_visible_minutes: 1,
      split_confirm_business_hours: 4,
      ack_chase_business_days: 3,
      tracking_after_ship_hours: 24,
    });
  });

  it('shows the updated_by/updated_at audit line', () => {
    render(<ConfigKeyEditor row={SLA_HOURS_ROW} onSave={jest.fn()} saving={false} />);
    expect(screen.getByTestId('config-updated-sla_hours')).toHaveTextContent('kody@kochaver.com');
  });

  it('disables Save while saving', () => {
    render(<ConfigKeyEditor row={MARGIN_FLOOR_ROW} onSave={jest.fn()} saving />);
    expect(screen.getByTestId('config-save-margin_floor_warning')).toBeDisabled();
  });
});

describe('ConfigKeyEditor — business_hours structured editor', () => {
  it('toggling a day off then saving drops it from the week', () => {
    const onSave = jest.fn();
    render(<ConfigKeyEditor row={BUSINESS_HOURS_ROW} onSave={onSave} saving={false} />);

    fireEvent.click(screen.getByTestId('config-business-hours-fri-enabled'));
    fireEvent.click(screen.getByTestId('config-save-business_hours'));

    const saved = onSave.mock.calls[0][0];
    expect(saved.week.fri).toBeUndefined();
    expect(saved.week.mon).toEqual(['09:00', '17:00']);
  });

  it('editing a day window and holidays round-trips into the saved value', () => {
    const onSave = jest.fn();
    render(<ConfigKeyEditor row={BUSINESS_HOURS_ROW} onSave={onSave} saving={false} />);

    fireEvent.change(screen.getByTestId('config-business-hours-mon-start'), { target: { value: '08:00' } });
    fireEvent.change(screen.getByTestId('config-business-hours-holidays'), {
      target: { value: '2026-12-25, 2027-01-01' },
    });
    fireEvent.click(screen.getByTestId('config-save-business_hours'));

    const saved = onSave.mock.calls[0][0];
    expect(saved.week.mon).toEqual(['08:00', '17:00']);
    expect(saved.holidays).toEqual(['2026-12-25', '2027-01-01']);
  });
});
