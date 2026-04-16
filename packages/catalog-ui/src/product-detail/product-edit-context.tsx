'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';

// ── Types ──────────────────────────────────────────────────────────────

export type EditMode = 'present' | 'edit';
export type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error';
export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export interface ProductImage {
  url: string;
  alt?: string;
  type?: 'hero' | 'lifestyle' | 'detail' | 'material' | 'model' | 'maker';
  order?: number;
}

export interface BaseProductDraft {
  id: string;
  name: string;
  brand: string;
  makerLocation?: string;
  price: number;
  tradePrice?: number;
  mapPrice?: number;
  leadTime?: string;
  tier?: string;
  status?: string;
  description?: string;
  provenance?: string;
  styleTags: string[];
  images: ProductImage[];
  materials: string[];
  finish?: string;
  assembly?: string;
  careInstructions?: string;
  dimensions?: { width?: number; depth?: number; height?: number; unit?: string };
  weight?: { value?: number; unit?: string };
  arModelUrl?: string;
  has3D?: boolean;
  aiScore?: number;
  commissionRate?: number;
}

export type ProductDraft<TExtra = Record<string, unknown>> = BaseProductDraft & TExtra;

export interface ValidationResult {
  valid: boolean;
  issues?: Array<{ field?: string; message: string; severity?: 'error' | 'warning' }>;
}

interface ProductEditContextValue<TExtra = Record<string, unknown>> {
  mode: EditMode;
  setMode: (m: EditMode) => void;
  toggleMode: () => void;
  draft: ProductDraft<TExtra>;
  original: ProductDraft<TExtra>;
  isDirty: boolean;
  autoSaveStatus: AutoSaveStatus;
  lastSavedAt: Date | null;
  validation: ValidationResult | null;
  updateField: <K extends keyof ProductDraft<TExtra>>(
    key: K,
    value: ProductDraft<TExtra>[K]
  ) => void;
  updateImages: (images: ProductImage[]) => void;
  publishChanges: () => Promise<void>;
  unpublish: ((reason?: string) => Promise<void>) | null;
  deleteProduct: (() => Promise<void>) | null;
  saveNow: () => Promise<void>;
  revert: () => void;
  toast: (message: string, variant?: ToastVariant) => void;
  /** Whether workflow callbacks were supplied (admin features). */
  capabilities: {
    canPublish: boolean;
    canUnpublish: boolean;
    canDelete: boolean;
    canValidate: boolean;
  };
}

// Context stored untyped; `useProductEdit<TExtra>()` re-casts on read.
const ProductEditContext = createContext<ProductEditContextValue<
  Record<string, unknown>
> | null>(null);

export function useProductEdit<TExtra = Record<string, unknown>>(): ProductEditContextValue<TExtra> {
  const ctx = useContext(ProductEditContext);
  if (!ctx) throw new Error('useProductEdit must be used within ProductEditProvider');
  return ctx as unknown as ProductEditContextValue<TExtra>;
}

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Default normalizer that handles both snake_case (Supabase) and camelCase payloads.
 * Portals can override by passing a `normalize` prop.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function defaultNormalize(raw: any): BaseProductDraft {
  const p = raw?.product || raw || {};
  return {
    id: p.id || '',
    name: p.name || '',
    brand: p.brand || p.vendor_name || '',
    makerLocation: p.maker_location || p.makerLocation || '',
    price: p.price ? Number(p.price) : p.base_price ? Number(p.base_price) : 0,
    tradePrice:
      p.tradePrice || p.trade_price ? Number(p.tradePrice || p.trade_price) : undefined,
    mapPrice: p.mapPrice || p.map_price ? Number(p.mapPrice || p.map_price) : undefined,
    leadTime: p.leadTimeDays ? `${p.leadTimeDays} weeks` : p.lead_time || undefined,
    tier: p.tier || undefined,
    status: p.status || 'draft',
    description: p.longDescription || p.shortDescription || p.description || '',
    provenance: p.provenance || '',
    styleTags: p.styleTags || p.style_tags || [],
    images: (p.images || []).map((img: string | ProductImage, i: number) =>
      typeof img === 'string'
        ? { url: img, alt: p.name, order: i }
        : { url: img.url, alt: img.alt || p.name, type: img.type, order: img.order ?? i }
    ),
    materials: p.materials || [],
    finish: p.finish || undefined,
    assembly: p.assembly || undefined,
    careInstructions: p.careInstructions || p.care_instructions || '',
    dimensions: p.dimensions || undefined,
    weight: p.weight || undefined,
    arModelUrl: p.arModelUrl || p.ar_model_url || undefined,
    has3D: p.has3D ?? !!p.ar_model_url,
    aiScore: p.aiScore ?? p.ai_score ?? undefined,
    commissionRate: p.commissionRate || p.commission_rate || undefined,
  };
}

// ── Provider ───────────────────────────────────────────────────────────

interface ProductEditProviderProps<TExtra = Record<string, unknown>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  product: any;
  children: ReactNode;
  /** Portal-supplied save — receives the current draft, should persist it. */
  onSave: (draft: ProductDraft<TExtra>) => Promise<unknown>;
  /** Optional: admin-style publish. If omitted, publishChanges() just saves + switches to present mode. */
  onPublish?: (draft: ProductDraft<TExtra>) => Promise<unknown>;
  /** Optional: admin-style unpublish with reason. */
  onUnpublish?: (reason: string | undefined, draft: ProductDraft<TExtra>) => Promise<unknown>;
  /** Optional: admin-style delete. Portal is responsible for post-delete navigation. */
  onDelete?: (draft: ProductDraft<TExtra>) => Promise<unknown>;
  /** Optional: run validation whenever the draft changes. */
  onValidate?: (draft: ProductDraft<TExtra>) => ValidationResult;
  /** Optional: toast hook. Default is console. */
  onToast?: (message: string, variant: ToastVariant) => void;
  /** Build the initial draft from the raw product. Defaults to designer-style normalization. */
  normalize?: (raw: unknown) => ProductDraft<TExtra>;
  /** Debounce in ms for auto-save. Default 2000 (designer behavior). */
  debounceMs?: number;
}

export function ProductEditProvider<TExtra extends Record<string, unknown> = Record<string, unknown>>({
  product,
  children,
  onSave,
  onPublish,
  onUnpublish,
  onDelete,
  onValidate,
  onToast,
  normalize,
  debounceMs = 2000,
}: ProductEditProviderProps<TExtra>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Mode from URL
  const initialMode: EditMode = searchParams.get('mode') === 'edit' ? 'edit' : 'present';
  const [mode, setModeState] = useState<EditMode>(initialMode);

  const setMode = useCallback(
    (m: EditMode) => {
      setModeState(m);
      const params = new URLSearchParams(searchParams.toString());
      if (m === 'edit') params.set('mode', 'edit');
      else params.delete('mode');
      const qs = params.toString();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (router.replace as any)(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const toggleMode = useCallback(() => {
    setMode(mode === 'present' ? 'edit' : 'present');
  }, [mode, setMode]);

  const normalizeFn = normalize ?? (defaultNormalize as (raw: unknown) => ProductDraft<TExtra>);

  // Data
  const original = useMemo(() => normalizeFn(product), [product, normalizeFn]);
  const [draft, setDraft] = useState<ProductDraft<TExtra>>(original);
  const [isDirty, setIsDirty] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<AutoSaveStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);

  // Sync when server data changes (only if not dirty)
  useEffect(() => {
    if (!isDirty) setDraft(original);
  }, [original, isDirty]);

  // Validation runs on draft change
  useEffect(() => {
    if (!onValidate) {
      setValidation(null);
      return;
    }
    try {
      setValidation(onValidate(draft));
    } catch (e) {
      setValidation({
        valid: false,
        issues: [{ message: (e as Error).message || 'Validation failed', severity: 'error' }],
      });
    }
  }, [draft, onValidate]);

  const toast = useCallback(
    (message: string, variant: ToastVariant = 'info') => {
      if (onToast) onToast(message, variant);
      else if (variant === 'error') console.error(message);
      else console.log(`[${variant}] ${message}`);
    },
    [onToast]
  );

  // Debounced auto-save
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDraftRef = useRef<ProductDraft<TExtra> | null>(null);

  const runSave = useCallback(
    async (updated: ProductDraft<TExtra>) => {
      setAutoSaveStatus('saving');
      try {
        await onSave(updated);
        setAutoSaveStatus('saved');
        setIsDirty(false);
        setLastSavedAt(new Date());
      } catch (e) {
        setAutoSaveStatus('error');
        toast((e as Error).message || 'Failed to save changes', 'error');
      }
    },
    [onSave, toast]
  );

  const triggerAutoSave = useCallback(
    (updatedDraft: ProductDraft<TExtra>) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      setAutoSaveStatus('idle');
      pendingDraftRef.current = updatedDraft;

      saveTimerRef.current = setTimeout(() => {
        const pending = pendingDraftRef.current;
        pendingDraftRef.current = null;
        if (pending) void runSave(pending);
      }, debounceMs);
    },
    [debounceMs, runSave]
  );

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const updateField = useCallback(
    <K extends keyof ProductDraft<TExtra>>(key: K, value: ProductDraft<TExtra>[K]) => {
      setDraft((prev) => {
        const next = { ...prev, [key]: value };
        setIsDirty(true);
        triggerAutoSave(next);
        return next;
      });
    },
    [triggerAutoSave]
  );

  const updateImages = useCallback(
    (images: ProductImage[]) => {
      setDraft((prev) => {
        const next = { ...prev, images };
        setIsDirty(true);
        triggerAutoSave(next);
        return next;
      });
    },
    [triggerAutoSave]
  );

  /** Force-save any pending draft immediately (bypasses debounce). */
  const saveNow = useCallback(async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const pending = pendingDraftRef.current ?? draft;
    pendingDraftRef.current = null;
    await runSave(pending);
  }, [draft, runSave]);

  const publishChanges = useCallback(async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    setAutoSaveStatus('saving');
    try {
      if (onPublish) {
        // Save current edits first, then publish.
        await onSave(draft);
        await onPublish(draft);
      } else {
        // Designer-style: save + go back to present mode.
        await onSave(draft);
      }
      setAutoSaveStatus('saved');
      setIsDirty(false);
      setLastSavedAt(new Date());
      setMode('present');
      toast('Changes published', 'success');
    } catch (e) {
      setAutoSaveStatus('error');
      toast((e as Error).message || 'Failed to publish', 'error');
    }
  }, [draft, onPublish, onSave, setMode, toast]);

  const unpublish = useMemo(() => {
    if (!onUnpublish) return null;
    return async (reason?: string) => {
      try {
        await onUnpublish(reason, draft);
        toast('Product unpublished', 'warning');
      } catch (e) {
        toast((e as Error).message || 'Failed to unpublish', 'error');
      }
    };
  }, [draft, onUnpublish, toast]);

  const deleteProduct = useMemo(() => {
    if (!onDelete) return null;
    return async () => {
      try {
        await onDelete(draft);
        toast('Product deleted', 'warning');
      } catch (e) {
        toast((e as Error).message || 'Failed to delete', 'error');
        throw e;
      }
    };
  }, [draft, onDelete, toast]);

  const revert = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    pendingDraftRef.current = null;
    setDraft(original);
    setIsDirty(false);
    setAutoSaveStatus('idle');
  }, [original]);

  const capabilities = useMemo(
    () => ({
      canPublish: !!onPublish,
      canUnpublish: !!onUnpublish,
      canDelete: !!onDelete,
      canValidate: !!onValidate,
    }),
    [onPublish, onUnpublish, onDelete, onValidate]
  );

  const value = useMemo<ProductEditContextValue<TExtra>>(
    () => ({
      mode,
      setMode,
      toggleMode,
      draft,
      original,
      isDirty,
      autoSaveStatus,
      lastSavedAt,
      validation,
      updateField,
      updateImages,
      publishChanges,
      unpublish,
      deleteProduct,
      saveNow,
      revert,
      toast,
      capabilities,
    }),
    [
      mode,
      setMode,
      toggleMode,
      draft,
      original,
      isDirty,
      autoSaveStatus,
      lastSavedAt,
      validation,
      updateField,
      updateImages,
      publishChanges,
      unpublish,
      deleteProduct,
      saveNow,
      revert,
      toast,
      capabilities,
    ]
  );

  return (
    <ProductEditContext.Provider
      value={value as unknown as ProductEditContextValue<Record<string, unknown>>}
    >
      {children}
    </ProductEditContext.Provider>
  );
}
