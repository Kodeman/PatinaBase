/**
 * C-35 (d2 §M10): a memo or sample request, with a return-by date, against a
 * line or a maker. Here: the sentence ("Memo from Kravet · return by …"),
 * "Request a sample"'s form args, and "Mark returned"'s args. The Desk need
 * (memo_return) is desk-derivation.test.ts's.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

const mockRecord = jest.fn();
const mockMarkReturned = jest.fn();
let mockSamples: unknown[] = [];

jest.mock('@patina/supabase', () => ({
  useSampleRequests: () => ({ data: mockSamples }),
  useRecordSampleRequest: () => ({ mutateAsync: mockRecord, isPending: false }),
  useMarkSampleReturned: () => ({ mutateAsync: mockMarkReturned, isPending: false }),
}));

import { LineSamples, sampleSentence, VendorSamples } from '../sample-request';

const PROJECT = 'proj-1';
const ITEM = 'item-1';
const VENDOR = 'vendor-1';

function sample(partial: Record<string, unknown> = {}) {
  return {
    id: 'sample-1',
    organization_id: 'org-1',
    project_id: PROJECT,
    ffe_item_id: ITEM,
    vendor_id: VENDOR,
    kind: 'memo',
    description: null,
    requested_on: '2026-10-01',
    received_on: null,
    return_by: '2026-10-21',
    returned_on: null,
    return_tracking: null,
    fee_cents: null,
    billable_to_client: false,
    status: 'requested',
    ...partial,
  };
}

beforeEach(() => {
  mockRecord.mockReset();
  mockMarkReturned.mockReset();
  mockRecord.mockResolvedValue(sample());
  mockMarkReturned.mockResolvedValue(sample({ status: 'returned' }));
  mockSamples = [];
});

describe('sampleSentence', () => {
  it('reads "Memo from Kravet · return by 21 October"', () => {
    expect(sampleSentence(sample() as never, 'Kravet')).toBe('Memo from Kravet · return by 21 October');
  });

  it('carries no maker when none is on the sample', () => {
    expect(sampleSentence(sample() as never, null)).toBe('Memo · return by 21 October');
  });

  it('reads "received" once received, with no return-by yet', () => {
    expect(
      sampleSentence(sample({ status: 'received', return_by: null }) as never, 'Kravet'),
    ).toBe('Memo from Kravet · received');
  });

  it('reads "returned …" once returned', () => {
    expect(
      sampleSentence(
        sample({ status: 'returned', returned_on: '2026-10-19', return_by: '2026-10-21' }) as never,
        'Kravet',
      ),
    ).toBe('Memo from Kravet · returned 19 October');
  });

  it('reads "cancelled" over any date', () => {
    expect(sampleSentence(sample({ status: 'cancelled' }) as never, 'Kravet')).toBe(
      'Memo from Kravet · cancelled',
    );
  });

  it('names the kind: a loaner, a finish chip', () => {
    expect(sampleSentence(sample({ kind: 'loaner' }) as never, null)).toBe(
      'Loaner · return by 21 October',
    );
    expect(sampleSentence(sample({ kind: 'finish_chip' }) as never, null)).toBe(
      'Finish chip · return by 21 October',
    );
  });
});

describe('LineSamples — "Request a sample" in the unfold (line scope)', () => {
  it('shows none recorded, and offers to request one', () => {
    render(<LineSamples projectId={PROJECT} itemId={ITEM} canEdit />);
    expect(screen.getByText('None recorded')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Request a sample' })).toBeInTheDocument();
  });

  it('records a sample against the line, with kind, description, dates, fee and billable', async () => {
    render(
      <LineSamples projectId={PROJECT} itemId={ITEM} vendorId={VENDOR} vendorName="Kravet" canEdit />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Request a sample' }));
    fireEvent.change(screen.getByLabelText('Sample kind'), { target: { value: 'loaner' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Jute rug, 8x10' } });
    fireEvent.change(screen.getByLabelText('Requested on'), { target: { value: '2026-10-02' } });
    fireEvent.change(screen.getByLabelText('Return by'), { target: { value: '2026-10-21' } });
    fireEvent.change(screen.getByLabelText('Fee'), { target: { value: '25' } });
    fireEvent.click(screen.getByLabelText('Billable to client'));
    fireEvent.click(screen.getByRole('button', { name: 'Record it' }));

    await waitFor(() =>
      expect(mockRecord).toHaveBeenCalledWith({
        projectId: PROJECT,
        ffeItemId: ITEM,
        vendorId: VENDOR,
        kind: 'loaner',
        description: 'Jute rug, 8x10',
        requestedOn: '2026-10-02',
        returnBy: '2026-10-21',
        feeCents: 2500,
        billableToClient: true,
      }),
    );
  });

  it('defaults kind to memo, omits an unfilled description/return-by/fee', async () => {
    render(<LineSamples projectId={PROJECT} itemId={ITEM} canEdit />);
    fireEvent.click(screen.getByRole('button', { name: 'Request a sample' }));
    fireEvent.change(screen.getByLabelText('Requested on'), { target: { value: '2026-10-02' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record it' }));

    await waitFor(() =>
      expect(mockRecord).toHaveBeenCalledWith({
        projectId: PROJECT,
        ffeItemId: ITEM,
        kind: 'memo',
        requestedOn: '2026-10-02',
        billableToClient: false,
      }),
    );
  });

  it('refuses a malformed fee without recording', () => {
    render(<LineSamples projectId={PROJECT} itemId={ITEM} canEdit />);
    fireEvent.click(screen.getByRole('button', { name: 'Request a sample' }));
    fireEvent.change(screen.getByLabelText('Fee'), { target: { value: 'free!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record it' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Enter the fee in dollars');
    expect(mockRecord).not.toHaveBeenCalled();
  });

  it('shows the line’s open sample, with Mark returned', async () => {
    mockSamples = [sample()];
    render(
      <LineSamples projectId={PROJECT} itemId={ITEM} vendorId={VENDOR} vendorName="Kravet" canEdit />,
    );
    expect(screen.getByText('Memo from Kravet · return by 21 October')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mark returned' }));
    fireEvent.change(screen.getByLabelText('Return tracking'), { target: { value: '1Z-999' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(mockMarkReturned).toHaveBeenCalledWith(
        expect.objectContaining({ sampleId: 'sample-1', returnTracking: '1Z-999' }),
      ),
    );
  });

  it('offers no Mark returned once the sample is already returned', () => {
    mockSamples = [sample({ status: 'returned', returned_on: '2026-10-19' })];
    render(<LineSamples projectId={PROJECT} itemId={ITEM} canEdit />);
    expect(screen.queryByRole('button', { name: 'Mark returned' })).not.toBeInTheDocument();
  });

  it('reads quietly, no act, when the line cannot be edited', () => {
    mockSamples = [sample()];
    render(<LineSamples projectId={PROJECT} itemId={ITEM} canEdit={false} />);
    expect(screen.queryByRole('button', { name: 'Request a sample' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark returned' })).not.toBeInTheDocument();
  });
});

describe('VendorSamples — "Request a sample" on the Vendors maker card', () => {
  it('requests against the maker, organization-scoped, no project', async () => {
    render(
      <VendorSamples organizationId="org-1" vendorId={VENDOR} vendorName="Kravet" canEdit />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Request a sample' }));
    fireEvent.click(screen.getByRole('button', { name: 'Record it' }));

    await waitFor(() =>
      expect(mockRecord).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'org-1', vendorId: VENDOR, kind: 'memo' }),
      ),
    );
    const call = mockRecord.mock.calls[0][0];
    expect(call.projectId).toBeUndefined();
    expect(call.ffeItemId).toBeUndefined();
  });
});
