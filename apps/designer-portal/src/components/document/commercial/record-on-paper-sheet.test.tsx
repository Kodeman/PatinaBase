import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const recordClientSignature = jest.fn();
const executeFurnishings = jest.fn();
const executeTradeScope = jest.fn();
const recordTradeAcceptance = jest.fn();
const uploadPaperScanDocument = jest.fn();

const mutation = (fn: jest.Mock) => ({ mutateAsync: fn, isPending: false });

jest.mock('@/hooks/use-commercial-documents', () => ({
  useRecordPaperClientSignature: () => mutation(recordClientSignature),
  useExecuteFurnishingsAuthorizationOnPaper: () => mutation(executeFurnishings),
  useExecuteTradeScopeOnPaper: () => mutation(executeTradeScope),
  useRecordPaperTradeAcceptance: () => mutation(recordTradeAcceptance),
  uploadPaperScanDocument: (...args: unknown[]) =>
    uploadPaperScanDocument(...args),
}));

import { RecordOnPaperSheet } from './record-on-paper-sheet';

describe('RecordOnPaperSheet', () => {
  beforeEach(() => {
    recordClientSignature.mockReset().mockResolvedValue({});
    executeFurnishings.mockReset().mockResolvedValue({});
    executeTradeScope.mockReset().mockResolvedValue({});
    recordTradeAcceptance.mockReset().mockResolvedValue({});
    uploadPaperScanDocument.mockReset().mockResolvedValue('scan-doc-1');
  });

  it('records a design-services paper signature, prefilled with the client name', async () => {
    const onRecorded = jest.fn();
    render(
      <RecordOnPaperSheet
        kind="design-services"
        proposalId="proposal-1"
        clientName="Harper Vale"
        open
        onClose={jest.fn()}
        onRecorded={onRecorded}
      />,
    );

    expect(screen.getByLabelText('Signed by')).toHaveValue('Harper Vale');
    fireEvent.click(screen.getByRole('button', { name: 'Record signed' }));

    await waitFor(() =>
      expect(recordClientSignature).toHaveBeenCalledWith({
        signedName: 'Harper Vale',
        paperSignedOn: expect.any(String),
        scanDocumentId: null,
      }),
    );
    expect(onRecorded).toHaveBeenCalled();
    expect(executeFurnishings).not.toHaveBeenCalled();
    expect(executeTradeScope).not.toHaveBeenCalled();
    expect(recordTradeAcceptance).not.toHaveBeenCalled();
  });

  it('uploads a selected scan before executing, and passes its id through as scanDocumentId', async () => {
    render(
      <RecordOnPaperSheet
        kind="furnishings"
        proposalId="proposal-1"
        projectId="project-1"
        open
        onClose={jest.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('Signed by'), {
      target: { value: 'Harper Vale' },
    });
    const file = new File(['scan'], 'signed-authorization.pdf', {
      type: 'application/pdf',
    });
    fireEvent.change(screen.getByLabelText(/scan of the signed original/i), {
      target: { files: [file] },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Record & execute' }));

    await waitFor(() => expect(executeFurnishings).toHaveBeenCalled());
    expect(uploadPaperScanDocument).toHaveBeenCalledWith('proposal-1', file);
    expect(executeFurnishings).toHaveBeenCalledWith(
      expect.objectContaining({
        proposalId: 'proposal-1',
        signedName: 'Harper Vale',
        scanDocumentId: 'scan-doc-1',
      }),
    );
    // The upload's own mock resolved before the RPC mock ran — proving the
    // RPC call actually waited on the upload rather than racing it.
    const uploadOrder = uploadPaperScanDocument.mock.invocationCallOrder[0];
    const rpcOrder = executeFurnishings.mock.invocationCallOrder[0];
    expect(uploadOrder).toBeLessThan(rpcOrder);
  });

  it('offers a scan field for a trade acceptance too (00425 gave it its own acceptance_scan_document_id) and passes it through', async () => {
    render(
      <RecordOnPaperSheet
        kind="trade-acceptance"
        proposalId="proposal-1"
        projectId="project-1"
        open
        onClose={jest.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('Accepted by'), {
      target: { value: 'Harper Vale' },
    });
    const file = new File(['scan'], 'signed-acceptance.pdf', {
      type: 'application/pdf',
    });
    fireEvent.change(screen.getByLabelText(/scan of the signed original/i), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Record accepted' }));

    await waitFor(() => expect(recordTradeAcceptance).toHaveBeenCalled());
    expect(uploadPaperScanDocument).toHaveBeenCalledWith('proposal-1', file);
    expect(recordTradeAcceptance).toHaveBeenCalledWith(
      expect.objectContaining({
        proposalId: 'proposal-1',
        signedName: 'Harper Vale',
        scanDocumentId: 'scan-doc-1',
      }),
    );
  });

  it('discloses that an attached scan files to the client\'s own folio', () => {
    render(
      <RecordOnPaperSheet
        kind="furnishings"
        proposalId="proposal-1"
        projectId="project-1"
        open
        onClose={jest.fn()}
      />,
    );
    expect(
      screen.getByText(/signed copy files to the client.s folio/i),
    ).toBeVisible();
  });

  it('titles the acceptance sheet distinctly from the three signature/execution kinds', () => {
    render(
      <RecordOnPaperSheet
        kind="trade-acceptance"
        proposalId="proposal-1"
        projectId="project-1"
        open
        onClose={jest.fn()}
      />,
    );
    expect(
      screen.getByText('Record the acceptance · signed offline'),
    ).toBeVisible();
  });

  it('reuses the already-uploaded scan id on a retry after a failed record, rather than uploading it again', async () => {
    executeFurnishings.mockRejectedValueOnce(new Error('network down'));
    render(
      <RecordOnPaperSheet
        kind="furnishings"
        proposalId="proposal-1"
        projectId="project-1"
        open
        onClose={jest.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('Signed by'), {
      target: { value: 'Harper Vale' },
    });
    const file = new File(['scan'], 'signed-authorization.pdf', {
      type: 'application/pdf',
    });
    fireEvent.change(screen.getByLabelText(/scan of the signed original/i), {
      target: { files: [file] },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Record & execute' }));
    await waitFor(() => expect(executeFurnishings).toHaveBeenCalledTimes(1));
    await screen.findByRole('alert');
    expect(uploadPaperScanDocument).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Record & execute' }));
    await waitFor(() => expect(executeFurnishings).toHaveBeenCalledTimes(2));

    // Still only one upload — the retry reused the id from the first.
    expect(uploadPaperScanDocument).toHaveBeenCalledTimes(1);
    expect(executeFurnishings).toHaveBeenLastCalledWith(
      expect.objectContaining({ scanDocumentId: 'scan-doc-1' }),
    );
  });

  it('disables submission for a too-short name or an invalid date', () => {
    render(
      <RecordOnPaperSheet
        kind="trade-execution"
        proposalId="proposal-1"
        projectId="project-1"
        open
        onClose={jest.fn()}
      />,
    );
    const submit = screen.getByRole('button', { name: 'Record & execute' });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Signed by'), {
      target: { value: 'H' },
    });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Signed by'), {
      target: { value: 'Harper Vale' },
    });
    expect(submit).not.toBeDisabled();

    fireEvent.change(screen.getByLabelText('Date signed'), {
      target: { value: '13/40/2026' },
    });
    expect(submit).toBeDisabled();

    fireEvent.click(submit);
    expect(executeTradeScope).not.toHaveBeenCalled();
  });

  it('cancels without recording anything', () => {
    const onClose = jest.fn();
    render(
      <RecordOnPaperSheet
        kind="trade-acceptance"
        proposalId="proposal-1"
        projectId="project-1"
        open
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
    expect(recordTradeAcceptance).not.toHaveBeenCalled();
  });

  it('renders nothing while closed', () => {
    const { container } = render(
      <RecordOnPaperSheet
        kind="design-services"
        proposalId="proposal-1"
        open={false}
        onClose={jest.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
