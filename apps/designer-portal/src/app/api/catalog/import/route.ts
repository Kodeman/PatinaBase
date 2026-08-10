import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@patina/supabase/server';
import { parseUsdCents, strictImportText } from './validation';

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
      const fields = {
        name: strictImportText(row.name, 'name', true),
        brand: strictImportText(row.brand, 'brand'),
        description: strictImportText(row.description, 'description'),
        category: strictImportText(row.category, 'category'),
        sku: strictImportText(row.sku, 'sku'),
        material: strictImportText(row.material, 'material'),
        dimensions: strictImportText(row.dimensions, 'dimensions'),
        vendor: strictImportText(row.vendor, 'vendor'),
        vendorId: strictImportText(row.vendorId, 'vendorId'),
      };
      const invalidText = Object.values(fields).find((field) => field.error);
      if (invalidText?.error || !fields.name.value) {
        errors.push({ row: i, reason: invalidText?.error ?? 'Missing required field: name' });
        return;
      }

      const price = parseUsdCents(row.price);
      if (price.error) {
        errors.push({ row: i, reason: price.error });
        return;
      }
      const name = fields.name.value;

      insertData.push({
        name,
        slug: slugify(name),
        brand: fields.brand.value,
        description: fields.description.value,
        category: fields.category.value || 'decor',
        status: 'draft',
        sku: fields.sku.value,
        price_retail: price.value,
        images: [],
        materials: fields.material.value ? [fields.material.value] : [],
        dimensions: fields.dimensions.value,
        tags: [],
        style_tags: [],
        captured_by: user.id,
        captured_at: now,
        vendor_id: fields.vendorId.value || fields.vendor.value || null,
        // Imported rows land in the designer's private My Library (layer=personal),
        // matching the single-create route. Without this the 00152 trigger defaults
        // a layer-less insert to 'catalog' (the shared Patina Catalog).
        layer: 'personal',
        owner_user_id: user.id,
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
