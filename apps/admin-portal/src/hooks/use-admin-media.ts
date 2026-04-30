import { useQuery, keepPreviousData } from '@tanstack/react-query';

export type MediaAssetKind = 'IMAGE' | 'MODEL3D' | 'VIDEO';

export interface AdminMediaAsset {
  id: string;
  kind: MediaAssetKind;
  status: string;
  productId: string | null;
  variantId: string | null;
  role: string | null;
  rawKey: string;
  width: number | null;
  height: number | null;
  format: string | null;
  sizeBytes: number | null;
  mimeType: string | null;
  qcScore: number | null;
  isPublic: boolean;
  tags: string[];
  uploadedBy: string | null;
  createdAt: string;
  renditions: Array<{
    id: string;
    key: string;
    width: number | null;
    height: number | null;
    purpose: string;
    format: string;
  }>;
}

export interface AdminMediaListResponse {
  assets: AdminMediaAsset[];
  hasMore: boolean;
  nextCursor: string | null;
  count: number;
}

export interface AdminMediaFilters {
  kind?: MediaAssetKind | 'all';
  status?: string;
  productId?: string;
  limit?: number;
  cursor?: string;
}

async function fetchMediaAssets(filters: AdminMediaFilters): Promise<AdminMediaListResponse> {
  const params = new URLSearchParams();
  if (filters.kind && filters.kind !== 'all') params.set('kind', filters.kind);
  if (filters.status) params.set('status', filters.status);
  if (filters.productId) params.set('productId', filters.productId);
  params.set('limit', String(filters.limit ?? 60));
  if (filters.cursor) params.set('cursor', filters.cursor);

  const res = await fetch(`/api/admin/media-assets?${params.toString()}`, {
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? body.message ?? `Failed to load media assets (${res.status})`);
  }

  // The media service returns:
  // { data: <asset[]>, meta: { count, nextCursor, hasMore } }
  // The proxy passes it through, possibly wrapped as { data: ... }.
  // Normalize either shape.
  const json = await res.json();
  const inner = json?.data ?? json;
  const rawAssets = inner?.data ?? inner?.assets ?? [];
  const meta = inner?.meta ?? {};

  const assets: AdminMediaAsset[] = (rawAssets as Array<Record<string, unknown>>).map((a) => ({
    id: String(a.id ?? ''),
    kind: (a.kind as MediaAssetKind) ?? 'IMAGE',
    status: String(a.status ?? 'unknown'),
    productId: (a.productId ?? a.product_id) as string | null,
    variantId: (a.variantId ?? a.variant_id) as string | null,
    role: (a.role as string | null) ?? null,
    rawKey: String(a.rawKey ?? a.raw_key ?? ''),
    width: (a.width as number | null) ?? null,
    height: (a.height as number | null) ?? null,
    format: (a.format as string | null) ?? null,
    sizeBytes: (a.sizeBytes ?? a.size_bytes) as number | null,
    mimeType: (a.mimeType ?? a.mime_type) as string | null,
    qcScore: (a.qcScore ?? a.qc_score) as number | null,
    isPublic: Boolean(a.isPublic ?? a.is_public),
    tags: (a.tags as string[] | null) ?? [],
    uploadedBy: (a.uploadedBy ?? a.uploaded_by) as string | null,
    createdAt: String(a.createdAt ?? a.created_at ?? ''),
    renditions: ((a.renditions as Array<Record<string, unknown>> | null) ?? []).map((r) => ({
      id: String(r.id ?? ''),
      key: String(r.key ?? ''),
      width: (r.width as number | null) ?? null,
      height: (r.height as number | null) ?? null,
      purpose: String(r.purpose ?? ''),
      format: String(r.format ?? ''),
    })),
  }));

  return {
    assets,
    hasMore: Boolean(meta.hasMore),
    nextCursor: (meta.nextCursor as string | null) ?? null,
    count: Number(meta.count ?? assets.length),
  };
}

export function useAdminMediaAssets(filters: AdminMediaFilters) {
  return useQuery({
    queryKey: ['admin-media-assets', filters],
    queryFn: () => fetchMediaAssets(filters),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}
