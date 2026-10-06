/**
 * "Add to the job" (US-16 C-16): the reads and writes behind the line card
 * and the document-import review. Every write goes through an existing
 * boundary — the project-ffe-working bucket, fn project-ffe-document-extract,
 * commit_project_ffe_import, and the project_ffe_specs column grant (00435).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';
import { invalidateFfeCaches } from './use-procurement';

const getSupabase = () => createBrowserClient();

// ─── Line card prefill ───────────────────────────────────────────────────────

/** What a Library or captured product says about itself, for the line card. */
export interface LineCardProductPrefill {
  productId: string;
  name: string;
  imageUrl: string | null;
  sourceUrl: string | null;
  vendorId: string | null;
  sku: string | null;
  finish: string | null;
  dimensions: Record<string, unknown> | null;
  /** products.price_retail — the only source of a client price (R5/R8). */
  retailCents: number | null;
  /** products.price_trade — never filled from retail (R-DI4). */
  tradeCents: number | null;
  leadTimeWeeks: number | null;
}

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;
const cents = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null;

export function toLineCardProductPrefill(row: Record<string, unknown>): LineCardProductPrefill {
  const images = Array.isArray(row.images) ? row.images : [];
  const dims = row.dimensions;
  return {
    productId: String(row.id),
    name: text(row.name) ?? 'Untitled piece',
    imageUrl: text(images[0]),
    sourceUrl: text(row.source_url),
    vendorId: text(row.vendor_id),
    sku: text(row.sku) ?? text(row.vendor_sku),
    finish: text(row.finish),
    dimensions:
      dims && typeof dims === 'object' && !Array.isArray(dims) && Object.keys(dims).length > 0
        ? (dims as Record<string, unknown>)
        : null,
    retailCents: cents(row.price_retail),
    tradeCents: cents(row.price_trade),
    leadTimeWeeks: cents(row.lead_time_weeks),
  };
}

/** One product's line-card prefill: maker, SKU, finish, dims, prices. */
export function useLineCardProductPrefill(productId: string | null | undefined) {
  return useQuery({
    queryKey: ['line-card-product', productId ?? null],
    enabled: !!productId,
    queryFn: async (): Promise<LineCardProductPrefill | null> => {
      const { data, error } = await getSupabase()
        .from('products')
        .select(
          'id,name,images,source_url,vendor_id,sku,vendor_sku,finish,dimensions,price_retail,price_trade,lead_time_weeks',
        )
        .eq('id', productId as string)
        .maybeSingle();
      if (error) throw error;
      return data ? toLineCardProductPrefill(data as Record<string, unknown>) : null;
    },
  });
}

export interface SetFfeLineSpecFieldsInput {
  projectId: string;
  itemId: string;
  sku?: string | null;
  finish?: string | null;
  dimensions?: Record<string, unknown> | null;
}

/**
 * SKU, finish and dimensions on a just-placed line's spec row, through the
 * authenticated column grant on project_ffe_specs (00435). Only the keys
 * passed are written.
 */
export function useSetFfeLineSpecFields() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ itemId, sku, finish, dimensions }: SetFfeLineSpecFieldsInput) => {
      const changes: Record<string, unknown> = {};
      if (sku !== undefined) changes.sku = sku;
      if (finish !== undefined) changes.finish = finish;
      if (dimensions !== undefined) changes.selected_dimensions = dimensions;
      if (Object.keys(changes).length === 0) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (getSupabase() as any)
        .from('project_ffe_specs')
        .update(changes)
        .eq('ffe_item_id', itemId);
      if (error) throw error;
    },
    onSuccess: (_result, { projectId }) => invalidateFfeCaches(queryClient, projectId),
  });
}

// ─── Document import (vendor quote · schedule) ───────────────────────────────

export const PROJECT_FFE_WORKING_BUCKET = 'project-ffe-working';

/** The source types fn project-ffe-document-extract accepts (lib.ts). */
export const DOCUMENT_IMPORT_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export interface StagedDocumentBatch {
  batchId: string;
  status: 'staged' | 'committed' | 'failed' | 'abandoned';
  reused: boolean;
  rowCount: number;
  unconfirmedCommercialRows: number;
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function functionErrorCode(error: { message?: string }): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = await (error as any).context?.json?.();
    if (typeof body?.error === 'string') return body.error;
  } catch {
    /* keep the message */
  }
  return error.message || 'extraction_failed';
}

/**
 * Upload a PDF or picture to the project's working bucket at the
 * content-addressed path (Contract B §B.6) and stage its rows through
 * fn project-ffe-document-extract (schema v2). Nothing lands on the schedule.
 */
export function useStageProjectFfeDocument() {
  return useMutation({
    mutationFn: async ({ projectId, file }: { projectId: string; file: File }): Promise<StagedDocumentBatch> => {
      const ext = DOCUMENT_IMPORT_TYPES[file.type];
      if (!ext) throw new Error('unsupported_source_type');
      const supabase = getSupabase();
      const hash = await sha256Hex(await file.arrayBuffer());
      const path = `${projectId}/source-documents/${hash}.${ext}`;
      const upload = await supabase.storage
        .from(PROJECT_FFE_WORKING_BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });
      // Content-addressed: the same bytes already stored is the same source.
      if (upload.error && !/exists|duplicate/i.test(upload.error.message ?? '')) {
        throw upload.error;
      }
      const { data, error } = await supabase.functions.invoke('project-ffe-document-extract', {
        body: { source: { bucket: PROJECT_FFE_WORKING_BUCKET, path }, projectId, schemaVersion: 2 },
      });
      if (error) throw new Error(await functionErrorCode(error));
      return data as StagedDocumentBatch;
    },
  });
}

export interface ProjectFfeImportRow {
  id: string;
  rowOrdinal: number;
  raw: Record<string, unknown>;
  normalized: Record<string, unknown>;
  projectRoomId: string | null;
  assignmentScope: 'room' | 'throughout' | 'unassigned' | null;
  validationErrors: string[];
  committedFfeItemId: string | null;
}

/** The staged rows of one import batch, in source order. */
export function useProjectFfeImportRows(batchId: string | null | undefined) {
  return useQuery({
    queryKey: ['project-ffe-import-rows', batchId ?? null],
    enabled: !!batchId,
    queryFn: async (): Promise<ProjectFfeImportRow[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (getSupabase() as any)
        .from('project_ffe_import_rows')
        .select(
          'id,row_ordinal,raw_row,normalized_row,project_room_id,assignment_scope,validation_errors,committed_ffe_item_id',
        )
        .eq('batch_id', batchId)
        .order('row_ordinal', { ascending: true });
      if (error) throw error;
      return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
        id: String(row.id),
        rowOrdinal: Number(row.row_ordinal),
        raw: (row.raw_row ?? {}) as Record<string, unknown>,
        normalized: (row.normalized_row ?? {}) as Record<string, unknown>,
        projectRoomId: (row.project_room_id as string | null) ?? null,
        assignmentScope: (row.assignment_scope as ProjectFfeImportRow['assignmentScope']) ?? null,
        validationErrors: Array.isArray(row.validation_errors)
          ? (row.validation_errors as unknown[]).map(String)
          : [],
        committedFfeItemId: (row.committed_ffe_item_id as string | null) ?? null,
      }));
    },
  });
}

/** A designer's confirmed commercial values for one row (00661/00666). */
export interface ImportCommercialDecision {
  maker: string | null;
  sku: string | null;
  unitPriceMinor: number | null;
  currency: string | null;
  priceBasis: 'client' | 'trade' | null;
}

export interface ImportRowDecision {
  rowOrdinal: number;
  assignmentScope: 'room' | 'throughout' | 'unassigned';
  roomId?: string | null;
  /** 'hold' places nothing — the review's Skip. */
  duplicateMode: 'reuse' | 'create' | 'hold';
  commercial?: ImportCommercialDecision;
}

export interface CommitProjectFfeImportResult {
  batchId: string;
  status: string;
  committedCount: number;
  results: Array<{ rowOrdinal: number; outcome: string; selectionId?: string | null }>;
}

/** Commit a staged batch: every row carries a decision (00439). */
export function useCommitProjectFfeImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      batchId,
      decisions,
    }: {
      projectId: string;
      batchId: string;
      decisions: ImportRowDecision[];
    }): Promise<CommitProjectFfeImportResult> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (getSupabase() as any).rpc('commit_project_ffe_import', {
        p_batch_id: batchId,
        p_decisions: decisions,
      });
      if (error) throw error;
      return data as CommitProjectFfeImportResult;
    },
    onSuccess: (_result, { projectId, batchId }) => {
      invalidateFfeCaches(queryClient, projectId);
      queryClient.invalidateQueries({ queryKey: ['project-ffe-import-rows', batchId] });
    },
  });
}
