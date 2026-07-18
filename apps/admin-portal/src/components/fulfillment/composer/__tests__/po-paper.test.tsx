import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { PoPaper } from '../po-paper';

// Regression coverage for the PO Composer PDF-preview blocked-preview bug
// (Kody's live prod walk). Root cause was `object-src 'none'` in the admin
// CSP (see apps/admin-portal/next.config.js), fixed alongside this test. This
// file guards the *second* suspected bug that was ruled out during that fix:
// premature `URL.revokeObjectURL` on a same-poId re-render. The effect's
// `[poId]` dependency array already scopes revocation to unmount/poId-change
// — these tests lock that in — plus the `key={url}` belt-and-suspenders fix
// that forces the <object> to remount (not just re-attribute) across a
// poId change, since some browsers won't reload an already-loaded <object>'s
// embedded resource on a `data`-attribute-only update.

jest.mock('@/services/fulfillment', () => ({
  fulfillmentService: {
    previewBlob: jest.fn(),
  },
}));

import { fulfillmentService } from '@/services/fulfillment';

const mockPreviewBlob = fulfillmentService.previewBlob as jest.Mock;

let urlCounter = 0;
const mockCreateObjectURL = jest.fn(() => `blob:mock-url-${++urlCounter}`);
const mockRevokeObjectURL = jest.fn();

function pdfBlob(): Blob {
  return new Blob(['%PDF-1.3'], { type: 'application/pdf' });
}

describe('PoPaper', () => {
  beforeEach(() => {
    urlCounter = 0;
    mockCreateObjectURL.mockClear();
    mockRevokeObjectURL.mockClear();
    mockPreviewBlob.mockReset();
    global.URL.createObjectURL = mockCreateObjectURL;
    global.URL.revokeObjectURL = mockRevokeObjectURL;
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the loading skeleton, then the PDF object once the blob resolves', async () => {
    mockPreviewBlob.mockResolvedValue(pdfBlob());

    render(<PoPaper poId="po-1" />);

    expect(screen.getByTestId('po-paper-loading')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId('po-paper-object')).toBeInTheDocument();
    });

    const objectEl = screen.getByTestId('po-paper-object');
    expect(objectEl).toHaveAttribute('data', 'blob:mock-url-1');
    expect(objectEl).toHaveAttribute('type', 'application/pdf');
    expect(screen.getByTestId('po-paper-open')).toHaveAttribute('href', 'blob:mock-url-1');
  });

  it('does not revoke the blob URL on a re-render with the same poId', async () => {
    mockPreviewBlob.mockResolvedValue(pdfBlob());

    const { rerender } = render(<PoPaper poId="po-1" />);

    await waitFor(() => {
      expect(screen.getByTestId('po-paper-object')).toBeInTheDocument();
    });
    expect(mockRevokeObjectURL).not.toHaveBeenCalled();

    // Same poId — must NOT tear down the effect / revoke the URL while the
    // <object> is still using it. This is the failure mode the live bug
    // report ("Failed to fetch" on the blob URL) looked like.
    rerender(<PoPaper poId="po-1" />);

    expect(mockRevokeObjectURL).not.toHaveBeenCalled();
    expect(screen.getByTestId('po-paper-object')).toHaveAttribute('data', 'blob:mock-url-1');
  });

  it('revokes the old URL and remounts the <object> (new key) when poId changes', async () => {
    mockPreviewBlob.mockResolvedValue(pdfBlob());

    const { rerender } = render(<PoPaper poId="po-1" />);
    await waitFor(() => {
      expect(screen.getByTestId('po-paper-object')).toBeInTheDocument();
    });
    const firstObjectNode = screen.getByTestId('po-paper-object');
    expect(firstObjectNode).toHaveAttribute('data', 'blob:mock-url-1');

    rerender(<PoPaper poId="po-2" />);

    await waitFor(() => {
      expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:mock-url-1');
    });
    await waitFor(() => {
      expect(screen.getByTestId('po-paper-object')).toHaveAttribute('data', 'blob:mock-url-2');
    });

    const secondObjectNode = screen.getByTestId('po-paper-object');
    expect(secondObjectNode).not.toBe(firstObjectNode);
  });

  it('revokes the blob URL exactly once on unmount', async () => {
    mockPreviewBlob.mockResolvedValue(pdfBlob());

    const { unmount } = render(<PoPaper poId="po-1" />);
    await waitFor(() => {
      expect(screen.getByTestId('po-paper-object')).toBeInTheDocument();
    });

    unmount();

    expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:mock-url-1');
    expect(mockRevokeObjectURL).toHaveBeenCalledTimes(1);
  });

  it('shows an error and never creates an object URL when the preview fetch fails', async () => {
    mockPreviewBlob.mockRejectedValue(new Error('Preview failed: 500'));

    render(<PoPaper poId="po-1" />);

    await waitFor(() => {
      expect(screen.getByTestId('po-paper-error')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('po-paper-object')).not.toBeInTheDocument();
    expect(mockCreateObjectURL).not.toHaveBeenCalled();
  });
});
