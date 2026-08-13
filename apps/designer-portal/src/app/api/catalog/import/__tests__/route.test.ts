/** @jest-environment node */
import { NextRequest } from 'next/server';
import { createServerClient } from '@patina/supabase/server';
import { POST } from '../route';

jest.mock('@patina/supabase/server', () => ({ createServerClient: jest.fn() }));

const mockCreateServerClient = createServerClient as jest.Mock;

describe('POST /api/catalog/import', () => {
  it('rejects unsafe rows server-side and inserts only strictly validated currency', async () => {
    const select = jest.fn().mockResolvedValue({ data: [{ id: 'product-1' }], error: null });
    const insert = jest.fn().mockReturnValue({ select });
    mockCreateServerClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }) },
      from: jest.fn().mockReturnValue({ insert }),
    });
    const request = new NextRequest('https://designer.patina.cloud/api/catalog/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rows: [
        { name: '=HYPERLINK("x")', price: '12.00' },
        { name: 'Chair', description: 'bad\u0000value', price: '12.00' },
        { name: 'Chair', category: '   ', price: '12.00' },
        { name: 'Chair', price: '1,2.00' },
        { name: 'Walnut chair', price: '$1,234.56' },
      ] }),
    });

    const response = await POST(request);
    expect(await response.json()).toMatchObject({ importedCount: 1, failedCount: 4 });
    expect(insert).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'Walnut chair', price_retail: 123456 }),
    ]);
  });

  it('never places a mapped vendor name in the vendor foreign key', async () => {
    const select = jest.fn().mockResolvedValue({ data: [{ id: 'product-1' }, { id: 'product-2' }], error: null });
    const insert = jest.fn().mockReturnValue({ select });
    mockCreateServerClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }) },
      from: jest.fn().mockReturnValue({ insert }),
    });
    const request = new NextRequest('https://designer.patina.cloud/api/catalog/import', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rows: [
        { name: 'Chair', vendor: 'Acme Furniture' },
        { name: 'Table', vendorId: '123e4567-e89b-42d3-a456-426614174000' },
        { name: 'Lamp', vendorId: 'Acme Furniture' },
      ] }),
    });

    const response = await POST(request);
    expect(await response.json()).toMatchObject({ importedCount: 2, failedCount: 1 });
    expect(insert).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'Chair', vendor_id: null }),
      expect.objectContaining({ name: 'Table', vendor_id: '123e4567-e89b-42d3-a456-426614174000' }),
    ]);
  });
});
