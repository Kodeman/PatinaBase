import { NextRequest, NextResponse } from 'next/server';
import {
  badRequest,
  createAuditLog,
  getAuthenticatedAdmin,
  getClientIp,
  serverError,
} from '@/lib/supabase-admin';

export interface BulkImportRow {
  index: number;
  payload: Record<string, unknown>;
}

export interface BulkImportRequest {
  rows: BulkImportRow[];
}

export interface BulkImportError {
  index: number;
  reason: string;
}

export interface BulkImportResponse {
  total: number;
  successful: number;
  failed: number;
  errors: BulkImportError[];
}

const CHUNK_SIZE = 50;

const STATUS_VALUES = new Set(['draft', 'in_review', 'published', 'deprecated']);

interface ProductInsert {
  name: string;
  description: string | null;
  short_description: string | null;
  brand: string | null;
  category: string;
  status: string;
  price_retail: number | null;
  price_trade: number | null;
  slug: string | null;
  sku: string | null;
  materials: string[];
  images: string[];
  tags: string[];
  style_tags: string[];
  source_url: string;
  captured_by: string;
  captured_at: string;
}

function toInsert(payload: Record<string, unknown>, capturedBy: string): ProductInsert | string {
  const name = typeof payload.name === 'string' ? payload.name.trim() : '';
  if (!name) return 'Missing required field: name';

  const brand = typeof payload.brand === 'string' && payload.brand.trim() ? payload.brand.trim() : null;
  if (!brand) return 'Missing required field: brand';

  const priceVal = payload.price;
  if (typeof priceVal !== 'number' || !Number.isFinite(priceVal) || priceVal <= 0) {
    return 'Invalid required field: price';
  }

  const status = typeof payload.status === 'string' ? payload.status : 'draft';
  if (!STATUS_VALUES.has(status)) return `Invalid status: ${status}`;

  return {
    name,
    description: (payload.description as string | undefined) ?? null,
    short_description: (payload.shortDescription as string | undefined) ?? null,
    brand,
    category: (payload.category as string | undefined) ?? 'decor',
    status,
    price_retail: Math.round(priceVal * 100),
    price_trade:
      typeof payload.priceTrade === 'number' ? Math.round(payload.priceTrade * 100) : null,
    slug: (payload.slug as string | undefined) ?? null,
    sku: (payload.sku as string | undefined) ?? null,
    materials: Array.isArray(payload.materials) ? (payload.materials as string[]) : [],
    images: [],
    tags: Array.isArray(payload.tags) ? (payload.tags as string[]) : [],
    style_tags: Array.isArray(payload.styleTags) ? (payload.styleTags as string[]) : [],
    source_url: typeof payload.sourceUrl === 'string' ? payload.sourceUrl : '',
    captured_by: capturedBy,
    captured_at: new Date().toISOString(),
  };
}

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { adminClient, user } = auth;

  let body: BulkImportRequest;
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid JSON body');
  }

  if (!Array.isArray(body.rows) || body.rows.length === 0) {
    return badRequest('rows[] is required and must be non-empty');
  }

  if (body.rows.length > 1000) {
    return badRequest('Cannot import more than 1000 rows in a single batch');
  }

  const errors: BulkImportError[] = [];
  let successful = 0;

  // Validate + build insert payloads up front; track per-row errors.
  const inserts: Array<{ index: number; row: ProductInsert }> = [];
  for (const r of body.rows) {
    const insert = toInsert(r.payload, user.id);
    if (typeof insert === 'string') {
      errors.push({ index: r.index, reason: insert });
    } else {
      inserts.push({ index: r.index, row: insert });
    }
  }

  // Insert in chunks to balance speed vs partial-failure isolation.
  for (let i = 0; i < inserts.length; i += CHUNK_SIZE) {
    const chunk = inserts.slice(i, i + CHUNK_SIZE);
    const { data, error } = await adminClient
      .from('products')
      .insert(chunk.map((c) => c.row))
      .select('id');

    if (error) {
      // The chunk failed atomically — fall back to per-row insert to isolate
      // which rows are responsible.
      for (const { index, row } of chunk) {
        const single = await adminClient.from('products').insert(row).select('id').single();
        if (single.error) {
          errors.push({ index, reason: single.error.message });
        } else {
          successful += 1;
        }
      }
    } else {
      successful += data?.length ?? chunk.length;
    }
  }

  try {
    await createAuditLog(adminClient, {
      userId: user.id,
      action: 'catalog.bulk_import',
      resourceType: 'product',
      newValues: {
        total: body.rows.length,
        successful,
        failed: errors.length,
      },
      ipAddress: getClientIp(request),
      userAgent: request.headers.get('user-agent') ?? undefined,
    });
  } catch {
    // audit log failure should not break import success accounting
  }

  const response: BulkImportResponse = {
    total: body.rows.length,
    successful,
    failed: errors.length,
    errors,
  };
  return NextResponse.json({ data: response });
}
