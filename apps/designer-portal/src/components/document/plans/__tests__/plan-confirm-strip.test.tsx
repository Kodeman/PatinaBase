import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { LightTableProposal } from '@/lib/plans/model';

const mutateAsync = jest.fn();
const upload = jest.fn();

jest.mock('@patina/supabase', () => ({
  useFilePlanPrints: () => ({ mutateAsync }),
  createBrowserClient: () => ({
    storage: { from: () => ({ upload }) },
  }),
}));

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

jest.mock('@/lib/analytics/plan-room-events', () => ({
  planRoomEvents: {
    lightTableConfirmed: jest.fn(),
    lightTableFailed: jest.fn(),
  },
}));

// The pdf boundary is stubbed: this strip's contract is the sequence and the
// gate, not the page cutting.
jest.mock('@/lib/plans/pdf', () => ({
  extractSinglePagePdf: jest.fn(async () => new Uint8Array([1, 2, 3])),
  sha256Hex: jest.fn(async () => 'a'.repeat(64)),
}));

import { PlanConfirmStrip, type PlanStagedSession } from '../plan-confirm-strip';

const session: PlanStagedSession = {
  projectId: 'proj',
  idempotencyKey: 'key-1',
  sourceFilename: 'Whitlock.pdf',
  sources: [{ name: 'Whitlock.pdf', bytes: new Uint8Array([1]) }],
  origins: { 0: { sourceIndex: 0, localPageIndex: 0 }, 1: { sourceIndex: 0, localPageIndex: 1 } },
  startedAt: 0,
};

const confirmOnly: LightTableProposal[] = [
  {
    pageIndex: 0,
    parsedNumber: 'ID-001',
    textSha256: 'x',
    kind: 'confirm_current',
    sheetId: 's001',
    sheetNumber: 'ID-001',
    sheetTitle: 'Cover & Sheet Index',
    discipline: 'ID',
    nearMiss: null,
    fork: 'confirm_current',
    requiresFork: false,
  },
];

const openFork: LightTableProposal[] = [
  {
    pageIndex: 1,
    parsedNumber: 'ID-4O2',
    textSha256: 'x',
    kind: 'revision',
    sheetId: 's402',
    sheetNumber: 'ID-402',
    sheetTitle: 'Millwork Elevations — Banquette',
    discipline: 'ID',
    nearMiss: { parsed: 'ID-4O2', canonical: 'ID-402', readAs: 'O', actual: '0' },
    fork: null,
    requiresFork: true,
  },
];

const noop = () => {};

beforeEach(() => {
  mutateAsync.mockResolvedValue({
    batchId: 'b-1',
    idempotent: false,
    prints: [],
    flippedSheetIds: [],
  });
  upload.mockResolvedValue({ error: null });
});

describe('PlanConfirmStrip', () => {
  it('is null outside a staged session', () => {
    const { container } = render(
      <PlanConfirmStrip
        session={null}
        proposals={confirmOnly}
        onSaveForLater={noop}
        onRevert={noop}
        onCommitted={noop}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('states the one honest sentence and its two verbs', () => {
    render(
      <PlanConfirmStrip
        session={session}
        proposals={confirmOnly}
        onSaveForLater={noop}
        onRevert={noop}
        onCommitted={noop}
      />,
    );
    // Twice: the inked sentence (aria-hidden) and the sr-only live region that
    // announces it verbatim, so AT never hears the split spans.
    expect(
      screen.getAllByText('Confirm 1 sheet current \u00b7 one transaction'),
    ).toHaveLength(2);
    const region = document.querySelector(
      '[data-action-region="light-table-confirmation"]',
    )!;
    expect(region.querySelectorAll('[data-action-variant="primary"]')).toHaveLength(1);
    const strip = document.querySelector('[data-plan-confirm-strip]')!;
    expect(strip.className).not.toMatch(/shadow/);
    // Clears the Studio drawer (fixed, 60px, z-40 from 1180px) — house idiom,
    // same as log-strip and the composition bar.
    expect(strip.className).toContain('min-[1180px]:bottom-[60px]');
    expect(strip.className).toContain('z-[45]');
  });

  it('writes nothing while a fork is open, even force-enabled', async () => {
    render(
      <PlanConfirmStrip
        session={session}
        proposals={openFork}
        onSaveForLater={noop}
        onRevert={noop}
        onCommitted={noop}
      />,
    );
    expect(
      screen.getByText('Answer every card before the table files'),
    ).toBeInTheDocument();

    const primary = document.querySelector(
      '[data-action-key="file-plan-prints"]',
    ) as HTMLButtonElement;
    expect(primary.disabled).toBe(true);

    // Strip the attribute a devtools force-enable would strip. The handler
    // re-guards on its own, so still nothing is written.
    primary.removeAttribute('disabled');
    await act(async () => {
      fireEvent.click(primary);
    });
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it('files every entry in one RPC, holding the session key', async () => {
    const onCommitted = jest.fn();
    render(
      <PlanConfirmStrip
        session={session}
        proposals={confirmOnly}
        onSaveForLater={noop}
        onRevert={noop}
        onCommitted={onCommitted}
      />,
    );
    await act(async () => {
      fireEvent.click(document.querySelector('[data-action-key="file-plan-prints"]')!);
    });
    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(mutateAsync).toHaveBeenCalledWith({
      idempotencyKey: 'key-1',
      sourceFilename: 'Whitlock.pdf',
      entries: [{ kind: 'confirm_current', sheet_id: 's001' }],
    });
    await waitFor(() =>
      expect(onCommitted).toHaveBeenCalledWith(
        expect.objectContaining({ batchId: 'b-1' }),
      ),
    );
  });

  it('names the stage that failed inline and keeps the session open', async () => {
    const onCommitted = jest.fn();
    mutateAsync.mockRejectedValueOnce(new Error('sheet ID-401 is named twice'));
    render(
      <PlanConfirmStrip
        session={session}
        proposals={confirmOnly}
        onSaveForLater={noop}
        onRevert={noop}
        onCommitted={onCommitted}
      />,
    );
    await act(async () => {
      fireEvent.click(document.querySelector('[data-action-key="file-plan-prints"]')!);
    });

    const failure = await screen.findByRole('alert');
    expect(failure).toHaveTextContent(/Moving the pointers — one transaction failed/);
    expect(failure).toHaveTextContent(/sheet ID-401 is named twice/);
    expect(failure.className).toContain('text-[var(--color-terracotta)]');
    // The staged table is still there and the primary is live again.
    expect(onCommitted).not.toHaveBeenCalled();
    expect(document.querySelector('[data-plan-confirm-strip]')).toBeInTheDocument();
    expect(
      (document.querySelector('[data-action-key="file-plan-prints"]') as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it('reverts on Esc, and refuses to while a commit is on the wire', async () => {
    const onRevert = jest.fn();
    let release: (value: unknown) => void = () => {};
    mutateAsync.mockImplementationOnce(
      () => new Promise((resolve) => { release = resolve; }),
    );
    render(
      <PlanConfirmStrip
        session={session}
        proposals={confirmOnly}
        onSaveForLater={noop}
        onRevert={onRevert}
        onCommitted={noop}
      />,
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onRevert).toHaveBeenCalledTimes(1);

    await act(async () => {
      fireEvent.click(document.querySelector('[data-action-key="file-plan-prints"]')!);
    });
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onRevert).toHaveBeenCalledTimes(1);

    await act(async () => {
      release({ batchId: 'b-1', idempotent: false, prints: [], flippedSheetIds: [] });
    });
  });
});
