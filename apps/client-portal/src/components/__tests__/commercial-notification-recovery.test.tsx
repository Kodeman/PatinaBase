import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CommercialNotificationRecovery } from '../commercial-notification-recovery';
import type { CommercialDocumentSummary } from '@/lib/commercial-documents';

const document = (
  overrides: Partial<CommercialDocumentSummary> = {},
): CommercialDocumentSummary => ({
  id: 'agreement-1',
  projectId: 'project-1',
  kind: 'design_services',
  state: 'client_signed',
  title: 'Design services agreement',
  version: 1,
  waveName: null,
  sentAt: '2026-08-03T12:00:00Z',
  executedAt: null,
  supersededAt: null,
  replacementProposalId: null,
  documentFingerprint: 'fingerprint-1',
  ...overrides,
});

describe('CommercialNotificationRecovery', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
    window.history.replaceState({}, '', '/');
  });

  it('surfaces the pending result after signing redirects to the document', async () => {
    window.history.replaceState(
      {},
      '',
      '/proposals/agreement-1?delivery=pending_retry',
    );

    render(<CommercialNotificationRecovery document={document()} />);

    expect(
      await screen.findByText(/signature remains recorded.*still pending/i),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Resend confirmation notice' }),
    ).toBeVisible();
  });

  it('keeps client-signature recovery available after refresh without re-signing', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        notificationDelivery: { state: 'pending_retry' },
      }),
    });
    render(<CommercialNotificationRecovery document={document()} />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Resend confirmation notice' }),
    );

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/proposals/agreement-1/notifications/replay',
        { method: 'POST' },
      ),
    );
    expect(
      await screen.findByText(/signature remains recorded.*still pending/i),
    ).toBeVisible();
  });

  it('confirms furnishings-notice replay from the executed document', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        notificationDelivery: { state: 'delivered' },
      }),
    });
    render(
      <CommercialNotificationRecovery
        document={document({
          kind: 'furnishings_authorization',
          state: 'executed',
          executedAt: '2026-08-03T13:00:00Z',
        })}
      />,
    );

    expect(
      screen.getByText(/furnishings authorization is recorded/i),
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole('button', { name: 'Resend confirmation notice' }),
    );
    expect(
      await screen.findByText('Confirmation delivery is confirmed.'),
    ).toBeVisible();
  });

  it('does not offer replay before a client-owned transition is committed', () => {
    const { container } = render(
      <CommercialNotificationRecovery
        document={document({ state: 'sent' })}
      />,
    );

    expect(container).toBeEmptyDOMElement();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
