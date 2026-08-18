import {
  configuredEdgeApiUrl,
  hydrateCatalogProducts,
} from '../product-hydration';

const ID = '00000000-0000-4000-8000-000000000001';

describe('Aesthete product hydration adapter', () => {
  const fetchMock = jest.fn();
  const fallback = jest.fn();

  beforeEach(() => {
    global.fetch = fetchMock;
    fallback.mockResolvedValue(new Map([[ID, { source: 'legacy' }]]));
  });

  it('uses the configured production edge endpoint and safely falls back when absent', () => {
    const original = process.env.NEXT_PUBLIC_EDGE_API_URL;
    process.env.NEXT_PUBLIC_EDGE_API_URL = 'https://api.patina.cloud';
    expect(configuredEdgeApiUrl('https://project.supabase.co')).toBe(
      'https://api.patina.cloud',
    );
    delete process.env.NEXT_PUBLIC_EDGE_API_URL;
    expect(configuredEdgeApiUrl('https://project.supabase.co')).toBe(
      'https://project.supabase.co',
    );
    if (original !== undefined) process.env.NEXT_PUBLIC_EDGE_API_URL = original;
  });

  it('hydrates from the typed edge catalog endpoint and maps the shared type', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          id: ID,
          name: 'Catalog Chair',
          brand: 'Patina',
          category: 'chair',
          retailCents: 1200,
          imageUrls: ['https://assets.example/chair.jpg'],
          shortDescription: 'A chair',
          patinaManaged: true,
          status: 'published',
        },
      ],
    } as Response);

    const products = await hydrateCatalogProducts(
      'https://api-staging.patina.cloud',
      [ID, ID],
      (product) => ({ source: 'edge', name: product.name }),
      fallback,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0].toString()).toBe(
      `https://api-staging.patina.cloud/v1/catalog/products?ids=${ID}`,
    );
    expect(products.get(ID)).toEqual({ source: 'edge', name: 'Catalog Chair' });
    expect(fallback).not.toHaveBeenCalled();
  });

  it.each([
    { ok: false, json: async () => null } as Response,
    {
      ok: true,
      json: async () => [{ id: ID, status: 'published' }],
    } as Response,
  ])(
    'uses the legacy callback after an unavailable or malformed edge response',
    async (edgeResponse) => {
      fetchMock.mockResolvedValueOnce(edgeResponse);
      const products = await hydrateCatalogProducts(
        'https://api-staging.patina.cloud',
        [ID, ID.toUpperCase(), "x') OR true--"],
        (product) => ({ source: 'edge', name: product.name }),
        fallback,
      );
      expect(fallback).toHaveBeenCalledWith([ID]);
      expect(products.get(ID)).toEqual({ source: 'legacy' });
    },
  );

  it('drops invalid product ids before either request', async () => {
    await expect(
      hydrateCatalogProducts(
        'https://api-staging.patina.cloud',
        ["x') OR true--"],
        (product) => product,
        fallback,
      ),
    ).resolves.toEqual(new Map());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(fallback).not.toHaveBeenCalled();
  });
});
