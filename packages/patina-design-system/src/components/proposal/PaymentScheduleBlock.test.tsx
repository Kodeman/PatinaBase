import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PaymentScheduleBlock } from './PaymentScheduleBlock';

describe('PaymentScheduleBlock', () => {
  it('renders the canonical amount from percentage and the current proposal total', () => {
    render(
      <PaymentScheduleBlock
        milestones={[
          {
            label: 'Project deposit',
            percentage: 100,
            // Deliberately stale: the schedule was authored before phase fees
            // raised the proposal total from $3,200 to $13,200.
            amount_cents: 320_000,
            trigger_condition: null,
          },
        ]}
        totalCents={1_320_000}
      />,
    );

    expect(screen.getByText('$13,200', { exact: false })).toBeInTheDocument();
    expect(
      screen.queryByText('$3,200', { exact: false }),
    ).not.toBeInTheDocument();
  });
});
