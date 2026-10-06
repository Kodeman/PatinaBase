/**
 * C-19: the damage-claim photo strip reads each inspection photo back through
 * the media proxy's signed-URL route, and the unfold's claim acts carry it.
 */
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  InspectionPhotoStrip,
  inspectionPhotoIds,
} from '../line-unfold/inspection-photo-strip';
import { ClaimActs } from '../line-unfold/claim-acts';

jest.mock('@patina/supabase', () => ({
  useUpdateDamageClaim: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

const realFetch = global.fetch;
const fetchMock = jest.fn();

function withQuery(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  fetchMock.mockReset().mockImplementation(async (url: string) => {
    const id = String(url).split('/')[4];
    if (id === 'gone') return { ok: false, json: async () => ({ success: false }) };
    return {
      ok: true,
      json: async () => ({ success: true, data: { downloadUrl: `https://r2.test/s/${id}?sig=1` } }),
    };
  });
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  global.fetch = realFetch;
});

describe('InspectionPhotoStrip', () => {
  it('renders each photo from its signed URL, linked to the full image', async () => {
    withQuery(<InspectionPhotoStrip photoAssetIds={['a1', 'a2']} />);

    const first = await screen.findByAltText('Inspection photo 1 of 2');
    expect(first).toHaveAttribute('src', 'https://r2.test/s/a1?sig=1');
    expect(first.closest('a')).toHaveAttribute('href', 'https://r2.test/s/a1?sig=1');
    expect(await screen.findByAltText('Inspection photo 2 of 2')).toHaveAttribute(
      'src',
      'https://r2.test/s/a2?sig=1',
    );
    expect(fetchMock).toHaveBeenCalledWith('/api/media/assets/a1/download');
    expect(fetchMock).toHaveBeenCalledWith('/api/media/assets/a2/download');
  });

  it('marks a photo that cannot be opened instead of breaking the strip', async () => {
    withQuery(<InspectionPhotoStrip photoAssetIds={['gone', 'a2']} />);
    expect(
      await screen.findByRole('img', { name: 'Inspection photo 1 of 2 could not be opened' }),
    ).toBeInTheDocument();
    expect(await screen.findByAltText('Inspection photo 2 of 2')).toBeInTheDocument();
  });

  it('renders nothing and fetches nothing without photos', () => {
    withQuery(<InspectionPhotoStrip photoAssetIds={null} />);
    expect(screen.queryByTestId('inspection-photo-strip')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps only non-blank string ids', () => {
    expect(inspectionPhotoIds(['a', '', '  ', null, 3, 'b'])).toEqual(['a', 'b']);
    expect(inspectionPhotoIds('a')).toEqual([]);
  });
});

describe('ClaimActs — the unfold claim shows its inspection photos', () => {
  it('renders the strip under a claim whose inspection carries photos', async () => {
    withQuery(
      <ClaimActs
        claims={[{ id: 'c1', state: 'drafted', inspection: { photo_asset_ids: ['p1'] } }]}
      />,
    );
    expect(await screen.findByAltText('Inspection photo 1 of 1')).toHaveAttribute(
      'src',
      'https://r2.test/s/p1?sig=1',
    );
  });

  it('shows no strip for a claim without an inspection embed', () => {
    withQuery(<ClaimActs claims={[{ id: 'c1', state: 'drafted' }]} />);
    expect(screen.queryByTestId('inspection-photo-strip')).toBeNull();
  });
});
