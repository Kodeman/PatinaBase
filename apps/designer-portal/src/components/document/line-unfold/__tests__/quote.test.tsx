/**
 * C-29 (d2 §M2): quotes on the line. The request's form args, the record
 * sheet's form args, the Quote cell's sentence, the apply args (trade only,
 * one line) and where a refused apply is routed (R8) — never retried.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

const mockApply = jest.fn();
const mockRecord = jest.fn();
let mockQuotes: unknown[] = [];

jest.mock('@patina/supabase', () => ({
  isChangeOrderRequired: jest.requireActual('@patina/supabase').isChangeOrderRequired,
  useVendorQuotes: () => ({ data: mockQuotes }),
  useApplyVendorQuoteToLines: () => ({ mutateAsync: mockApply, isPending: false }),
  useRecordVendorQuote: () => ({ mutateAsync: mockRecord, isPending: false }),
  useProjectFFEItems: () => ({ data: [] }),
  useProcurementItems: () => ({ data: [] }),
}));
jest.mock('@/hooks/use-folio', () => ({
  useUploadFolioFile: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));
jest.mock('../../overlays/doc-sheet', () => ({
  DocSheet: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div>{children}</div> : null,
}));
jest.mock('../../date-text-input', () => ({
  DateTextInput: ({
    value,
    onChange,
    ariaLabel,
  }: {
    value: string | null;
    onChange: (v: string | null) => void;
    ariaLabel?: string;
  }) => (
    <input aria-label={ariaLabel} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} />
  ),
}));

import { fmtDay as dayMonth } from '@/lib/document/format';
import { QuoteCell } from '../quote-cell';
import { RecordQuoteSheet } from '../record-quote';
import {
  applyQuoteArgs,
  applyRefusal,
  buildRecordQuoteRequest,
  latestQuoteForLine,
  quoteSentence,
  type RecordQuoteForm,
} from '../quote-model';
import { parseQuoteRequestBody, quoteRequestBody } from '../quote-request';

const LINE = '11111111-1111-4111-8111-111111111111';
const LINE_2 = '22222222-2222-4222-8222-222222222222';
const PROJECT = '33333333-3333-4333-8333-333333333333';

function quote(partial: Record<string, unknown> = {}) {
  return {
    id: 'q1',
    vendor_id: 'v1',
    project_id: 'p1',
    quote_ref: 'Q-2291',
    valid_until: '2026-10-30',
    superseded_by: null,
    vendor_quote_lines: [
      { ffe_item_id: 'line-1', unit_trade_cents: 184_000, lead_time_weeks: 12, applied_at: null },
    ],
    ...partial,
  };
}

beforeEach(() => {
  mockApply.mockReset();
  mockRecord.mockReset();
  mockQuotes = [];
});

describe('the quote request — form args', () => {
  it('names the job, its lines and the due date; blanks drop out', () => {
    expect(
      quoteRequestBody({
        scope: '  ',
        timeline: 'by spring ',
        message: ' Price the pair, please. ',
        projectId: PROJECT,
        ffeItemIds: [LINE, LINE_2],
        dueOn: '2026-10-20',
      }),
    ).toEqual({
      message: 'Price the pair, please.',
      timeline: 'by spring',
      projectId: PROJECT,
      ffeItemIds: [LINE, LINE_2],
      dueOn: '2026-10-20',
    });
  });

  it('lines never ride without their job', () => {
    expect(
      quoteRequestBody({
        scope: '',
        timeline: '',
        message: 'Price it',
        projectId: null,
        ffeItemIds: [LINE],
        dueOn: '',
      }),
    ).toEqual({ message: 'Price it' });
  });

  it('the route reads the same body, and refuses lines with no job or a bad date', () => {
    expect(
      parseQuoteRequestBody({ message: 'Price it', projectId: PROJECT, ffeItemIds: [LINE, LINE], dueOn: '2026-10-20' }),
    ).toEqual({
      ok: true,
      value: {
        message: 'Price it',
        scope: null,
        timeline: null,
        projectId: PROJECT,
        ffeItemIds: [LINE],
        dueOn: '2026-10-20',
      },
    });
    expect(parseQuoteRequestBody({ message: 'Price it', ffeItemIds: [LINE] })).toEqual({
      ok: false,
      error: 'Choose the job before naming its lines',
    });
    expect(parseQuoteRequestBody({ message: 'Price it', dueOn: '20 Oct' }).ok).toBe(false);
    expect(parseQuoteRequestBody({ message: 'Price it', ffeItemIds: ['nope'], projectId: PROJECT }).ok).toBe(false);
    expect(parseQuoteRequestBody({ message: ' ' })).toEqual({ ok: false, error: 'message is required' });
  });
});

describe('recording a quote — form args', () => {
  const form = (partial: Partial<RecordQuoteForm> = {}): RecordQuoteForm => ({
    vendorId: 'v1',
    projectId: 'p1',
    quoteRef: ' Q-2291 ',
    validUntil: '2026-10-30',
    crating: '$120',
    freightEstimate: '1,450.50',
    paymentPattern: 'fifty_fifty',
    documentPath: null,
    supersedesQuoteId: null,
    lines: [
      { ffeItemId: 'line-1', include: true, unitTrade: '$1,840', leadTimeWeeks: '12', qty: 2 },
      { ffeItemId: 'line-2', include: false, unitTrade: '', leadTimeWeeks: '', qty: 1 },
    ],
    ...partial,
  });

  it('builds record_vendor_quote’s request: chosen lines in cents, the rest in place', () => {
    expect(buildRecordQuoteRequest(form({ supersedesQuoteId: 'q0' }))).toEqual({
      ok: true,
      request: {
        vendorId: 'v1',
        projectId: 'p1',
        quoteRef: 'Q-2291',
        validUntil: '2026-10-30',
        cratingCents: 12_000,
        freightEstimateCents: 145_050,
        paymentPattern: 'fifty_fifty',
        supersedesQuoteId: 'q0',
        lines: [{ ffeItemId: 'line-1', unitTradeCents: 184_000, qty: 2, leadTimeWeeks: 12 }],
      },
    });
  });

  it('leaves optional fields out rather than sending blanks', () => {
    const built = buildRecordQuoteRequest(
      form({
        quoteRef: '',
        validUntil: '',
        crating: '',
        freightEstimate: '',
        paymentPattern: '',
        lines: [{ ffeItemId: 'line-1', include: true, unitTrade: '900', leadTimeWeeks: '', qty: null }],
      }),
    );
    expect(built).toEqual({
      ok: true,
      request: { vendorId: 'v1', projectId: 'p1', lines: [{ ffeItemId: 'line-1', unitTradeCents: 90_000 }] },
    });
  });

  it('says the one thing still missing', () => {
    expect(buildRecordQuoteRequest(form({ lines: [] }))).toEqual({
      ok: false,
      reason: 'Choose a line and give its price.',
    });
    expect(
      buildRecordQuoteRequest(
        form({ lines: [{ ffeItemId: 'line-1', include: true, unitTrade: '', leadTimeWeeks: '', qty: 1 }] }),
      ),
    ).toEqual({ ok: false, reason: 'Each chosen line needs its unit trade price.' });
    expect(
      buildRecordQuoteRequest(
        form({ lines: [{ ffeItemId: 'line-1', include: true, unitTrade: '10', leadTimeWeeks: '3.5', qty: 1 }] }),
      ),
    ).toEqual({ ok: false, reason: 'Lead time is whole weeks, up to 260.' });
    expect(buildRecordQuoteRequest(form({ crating: 'about 100' }))).toEqual({
      ok: false,
      reason: 'Crating and freight are dollar amounts.',
    });
  });

  it('the sheet records exactly those args', async () => {
    mockRecord.mockResolvedValue({ id: 'q9', project_id: 'p1' });
    render(
      <RecordQuoteSheet
        open
        onClose={jest.fn()}
        vendor={{ id: 'v1', name: 'Hewn' }}
        candidates={[
          { id: 'line-1', name: 'Halden Sofa', projectId: 'p1', projectName: 'Lake House', quantity: 1 },
          { id: 'line-2', name: 'Ottoman', projectId: 'p1', projectName: 'Lake House', quantity: 2 },
        ]}
        initialItemIds={['line-1']}
      />,
    );
    fireEvent.change(screen.getByLabelText('Unit trade · Halden Sofa'), { target: { value: '1840' } });
    fireEvent.change(screen.getByLabelText('Lead time in weeks · Halden Sofa'), { target: { value: '12' } });
    fireEvent.change(screen.getByPlaceholderText('Q-2291'), { target: { value: 'Q-2291' } });
    fireEvent.change(screen.getByLabelText('Good through'), { target: { value: '2026-10-30' } });
    fireEvent.click(screen.getByRole('button', { name: /Record the quote/ }));
    await waitFor(() => expect(mockRecord).toHaveBeenCalledTimes(1));
    expect(mockRecord).toHaveBeenCalledWith({
      vendorId: 'v1',
      projectId: 'p1',
      quoteRef: 'Q-2291',
      validUntil: '2026-10-30',
      lines: [{ ffeItemId: 'line-1', unitTradeCents: 184_000, qty: 1, leadTimeWeeks: 12 }],
    });
    expect(await screen.findByRole('status')).toHaveTextContent('Quote recorded.');
  });
});

describe('the Quote cell sentence (R6: dates only)', () => {
  const live = latestQuoteForLine([quote()] as never, 'line-1')!;

  it('reads “quoted $1,840 · good through 30 October · Hewn ref Q-2291”', () => {
    expect(quoteSentence(live, 'Hewn')).toBe(
      `quoted $1,840 · good through ${dayMonth('2026-10-30')} · Hewn ref Q-2291`,
    );
    expect(dayMonth('2026-10-30')).toBe('30 October');
  });

  it('drops what the quote does not carry', () => {
    expect(quoteSentence({ ...live, validUntil: null, quoteRef: null }, 'Hewn')).toBe('quoted $1,840');
    expect(quoteSentence(live, null)).toBe(`quoted $1,840 · good through ${dayMonth('2026-10-30')} · ref Q-2291`);
  });

  it('reads the newest live quote for the line, from the named maker', () => {
    const quotes = [
      quote({ id: 'q3', superseded_by: null, vendor_id: 'v2' }),
      quote({ id: 'q2', vendor_quote_lines: [{ ffe_item_id: 'line-9', unit_trade_cents: 1, lead_time_weeks: null, applied_at: null }] }),
      quote({ id: 'q1b', superseded_by: 'q3' }),
      quote({ id: 'q1' }),
    ] as never;
    expect(latestQuoteForLine(quotes, 'line-1')!.quoteId).toBe('q3');
    expect(latestQuoteForLine(quotes, 'line-1', 'v1')!.quoteId).toBe('q1');
    expect(latestQuoteForLine(quotes, 'line-2')).toBeNull();
  });
});

describe('Use this price — apply args and refusal routing', () => {
  const changeOrder = (state: string) =>
    Object.assign(new Error(`change_order_required: line ${LINE} sits on a ${state} authorization; …`), {
      code: '23514',
    });

  it('applies one line, trade only', () => {
    expect(applyQuoteArgs({ quoteId: 'q1' }, 'line-1', 'p1')).toEqual({
      quoteId: 'q1',
      ffeItemIds: ['line-1'],
      projectId: 'p1',
    });
  });

  it('routes a signed or executed line to the change order, a sent one to void & supersede', () => {
    expect(applyRefusal(changeOrder('signed')).route).toBe('change_order');
    expect(applyRefusal(changeOrder('executed')).route).toBe('change_order');
    expect(applyRefusal(changeOrder('sent')).route).toBe('void_authorization');
    expect(
      applyRefusal(new Error(`apply_vendor_quote_to_lines: line ${LINE} is on a purchase order; change it…`)),
    ).toEqual({ route: 'error', sentence: 'This line is on a purchase order — change the price there.' });
  });

  const renderCell = (item: Record<string, unknown> = {}) =>
    render(
      <QuoteCell
        item={{ id: 'line-1', name: 'Halden Sofa', trade_price_cents: 190_000, ...item }}
        projectId="p1"
        projectName="Lake House"
        vendor={{ id: 'v1', name: 'Hewn' }}
        canEdit
      />,
    );

  it('prints the sentence in the cell and applies the quote to this line', async () => {
    mockQuotes = [quote()];
    mockApply.mockResolvedValue([]);
    renderCell();
    const cell = within(screen.getByRole('group', { name: 'Quote' }));
    expect(cell.getByText(`quoted $1,840 · good through ${dayMonth('2026-10-30')} · Hewn ref Q-2291`)).toBeInTheDocument();
    expect(cell.getByText('12 weeks lead')).toBeInTheDocument();
    fireEvent.click(cell.getByRole('button', { name: 'Use this price' }));
    await waitFor(() => expect(mockApply).toHaveBeenCalledTimes(1));
    expect(mockApply).toHaveBeenCalledWith({ quoteId: 'q1', ffeItemIds: ['line-1'], projectId: 'p1' });
  });

  it('on change_order_required, opens the change order — and never retries', async () => {
    mockQuotes = [quote()];
    mockApply.mockRejectedValue(changeOrder('signed'));
    const opened = jest.fn();
    window.addEventListener('document:compose-amendment', opened);
    renderCell();
    fireEvent.click(screen.getByRole('button', { name: 'Use this price' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The client signed for this line, so a new price is a change order they approve first.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open a change order' }));
    expect(opened).toHaveBeenCalledTimes(1);
    expect(mockApply).toHaveBeenCalledTimes(1);
    window.removeEventListener('document:compose-amendment', opened);
  });

  it('a sent authorization says void & supersede, with no change-order act', async () => {
    mockQuotes = [quote()];
    mockApply.mockRejectedValue(changeOrder('sent'));
    renderCell();
    fireEvent.click(screen.getByRole('button', { name: 'Use this price' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Void & supersede it to use this price.');
    expect(screen.queryByRole('button', { name: 'Open a change order' })).toBeNull();
  });

  it('offers neither act once the line is on a purchase order, nor once the price is in', () => {
    mockQuotes = [quote()];
    renderCell({ purchase_order_id: 'po-1' });
    expect(screen.queryByRole('button', { name: 'Use this price' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Record a/ })).toBeNull();
  });

  it('reads as applied when the trade cost is the quoted price', () => {
    mockQuotes = [
      quote({
        vendor_quote_lines: [
          { ffe_item_id: 'line-1', unit_trade_cents: 184_000, lead_time_weeks: null, applied_at: '2026-10-06T10:00:00Z' },
        ],
      }),
    ];
    renderCell({ trade_price_cents: 184_000 });
    expect(screen.getByText('trade cost is the quoted $1,840')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Use this price' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Record a new quote…' })).toBeInTheDocument();
  });

  it('with no quote, stays quiet and offers to record one', () => {
    renderCell();
    expect(screen.getByRole('group', { name: 'Quote' })).toHaveTextContent('No quote recorded');
    expect(screen.getByRole('button', { name: 'Record a quote…' })).toBeInTheDocument();
  });
});
