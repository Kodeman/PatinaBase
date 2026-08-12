import { render, screen } from '@testing-library/react';
import type { FulfillmentQueueRow } from '@patina/fulfillment';
import { QueueRow } from '@/components/fulfillment/queue/queue-row';

// WP4 Track 3: the queue row's ADDITIVE lifecycle glance. This suite proves
// the glance sits BESIDE the row's existing operational vocabulary (the
// next-action verb, the vendor/exception meta) rather than replacing it, and
// that an unrecognized derived_status renders no glance rather than
// fabricating a position — the same honesty rule the trail itself follows.

const BASE_ROW: FulfillmentQueueRow = {
  order_id: 'order-1',
  order_no: 1042,
  client_name: 'Priya Anand',
  intake_at: '2026-07-01T00:00:00Z',
  designer_attribution: null,
  min_stage_idx: 5,
  has_unmapped: false,
  unmapped_count: 0,
  vendor_count: 2,
  open_exceptions: 0,
  derived_status: 'in_production',
  stage_entered_at: '2026-08-01',
  po_count: 2,
  po_stages: [],
  breached: false,
  stage_age_business_hours: 6,
  next_action_kind: 'in_production',
  next_action_params: null,
  band: 'watching',
};

describe('QueueRow — R7 lifecycle glance (additive, WP4 Track 3)', () => {
  it('renders the current-position stamp and next gate beside the operational verb', () => {
    render(<QueueRow row={BASE_ROW} selected={false} onOpen={jest.fn()} />);

    // The existing operational vocabulary is untouched.
    expect(screen.getByTestId('queue-row-verb')).toHaveTextContent(/in production/i);

    // The additive glance renders next to it — current position (06 In
    // production) and the next gate ahead of the live step.
    const stamp = screen.getByTestId('lifecycle-glance-stamp');
    expect(stamp).toHaveTextContent('06');
    expect(stamp).toHaveTextContent('In production');

    expect(screen.getByTestId('lifecycle-glance-next-gate')).toHaveTextContent(
      'Received and dispositioned',
    );
  });

  it('renders no glance for a derived_status the lifecycle chain does not recognize', () => {
    render(
      <QueueRow
        row={{ ...BASE_ROW, derived_status: 'unknown_status' }}
        selected={false}
        onOpen={jest.fn()}
      />,
    );

    expect(screen.queryByTestId('lifecycle-glance')).not.toBeInTheDocument();
    // The row's own vocabulary still renders regardless.
    expect(screen.getByTestId('queue-row-verb')).toBeInTheDocument();
  });
});
