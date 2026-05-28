import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@patina/supabase/server';

// POST /api/catalog/import — bulk-import mapped products (auth required).
//
// The client parses + maps the CSV; this route only validates and bulk-inserts.
// Field mapping mirrors the single-create route (POST /api/catalog/products):
// price (dollars) → price_retail (cents), default category 'decor', status
// 'draft' so the teaching-queue trigger fires automatically on insert.
//
// Body shape: { rows: Array<MappedProduct> }
//   MappedProduct: { name, brand?, category?, price?, description?, material?,
//                    dimensions?, sku?, vendorId? }
// Returns: { importedCount, failedCount, errors: [{ row, reason }] }

interface MappedProduct {
  name?: unknown;
  brand?: unknown;
  category?: unknown;
  price?: unknown;
  description?: unknown;
  material?: unknown;
  dimensions?: unknown;
  sku?: unknown;
  vendor?: unknown;
  vendorId?: unknown;
}

const MAX_ROWS = 5000;

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function parsePrice(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  // Strip currency symbols / thousands separators before parsing.
  const cleaned = String(raw).replace(/[^0-9.]/g, '');
  if (cleaned === '') return null;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

function str(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  return s === '' ? null : s;
}

export async function POST(request: NextRequest) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generated types not yet updated for new columns
    const supabase: any = await createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json();
    const rows: MappedProduct[] = Array.isArray(body?.rows) ? body.rows : [];

    if (rows.length === 0) {
      return NextResponse.json({ error: 'No rows to import' }, { status: 400 });
    }
    if (rows.length > MAX_ROWS) {
      return NextResponse.json(
        { error: `Too many rows (${rows.length}). Max ${MAX_ROWS} per import.` },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();
    const errors: { row: number; reason: string }[] = [];
    const insertData: Record<string, unknown>[] = [];

    rows.forEach((row, i) => {
      const name = str(row.name);
      if (!name) {
        errors.push({ row: i, reason: 'Missing required field: name' });
        return;
      }

      // Price is optional, but if provided it must parse to a number.
      let priceRetail: number | null = null;
      if (row.price !== undefined && row.price !== null && row.price !== '') {
        const price = parsePrice(row.price);
        if (price === null) {
          errors.push({ row: i, reason: `Invalid price: ${String(row.price)}` });
          return;
        }
        priceRetail = Math.round(price * 100);
      }

      const material = str(row.material);

      insertData.push({
        name,
        slug: slugify(name),
        brand: str(row.brand),
        description: str(row.description),
        category: str(row.category) || 'decor',
        status: 'draft',
        sku: str(row.sku),
        price_retail: priceRetail,
        images: [],
        materials: material ? [material] : [],
        dimensions: str(row.dimensions),
        tags: [],
        style_tags: [],
        captured_by: user.id,
        captured_at: now,
        vendor_id: str(row.vendorId) || str(row.vendor) || null,
      });
    });

    let importedCount = 0;

    if (insertData.length > 0) {
      const { data, error } = await supabase
        .from('products')
        .insert(insertData)
        .select('id');

      if (error) {
        console.error('[API] Bulk import error:', error);
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      importedCount = Array.isArray(data) ? data.length : insertData.length;
    }

    return NextResponse.json({
      importedCount,
      failedCount: errors.length,
      errors,
    });
  } catch (error) {
    console.error('[API] POST /catalog/import error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
