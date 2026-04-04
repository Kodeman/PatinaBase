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
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { catalogApi } from '@/lib/api-client';

// ── Types ──────────────────────────────────────────────────────────────

export type EditMode = 'present' | 'edit';
export type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface ProductImage {
  url: string;
  alt?: string;
  type?: 'hero' | 'lifestyle' | 'detail' | 'material' | 'model' | 'maker';
  order?: number;
}

export interface ProductDraft {
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
  [key: string]: unknown;
}

interface ProductEditContextValue {
  mode: EditMode;
  setMode: (m: EditMode) => void;
  toggleMode: () => void;
  draft: ProductDraft;
  original: ProductDraft;
  isDirty: boolean;
  autoSaveStatus: AutoSaveStatus;
  updateField: <K extends keyof ProductDraft>(key: K, value: ProductDraft[K]) => void;
  updateImages: (images: ProductImage[]) => void;
  publishChanges: () => Promise<void>;
  revert: () => void;
}

const ProductEditContext = createContext<ProductEditContextValue | null>(null);

export function useProductEdit() {
  const ctx = useContext(ProductEditContext);
  if (!ctx) throw new Error('useProductEdit must be used within ProductEditProvider');
  return ctx;
}

// ── Helpers ────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeProduct(raw: any): ProductDraft {
  const p = raw?.product || raw || {};
  return {
    id: p.id || '',
    name: p.name || '',
    brand: p.brand || p.vendor_name || '',
    makerLocation: p.maker_location || p.makerLocation || '',
    price: p.price ? Number(p.price) : p.base_price ? Number(p.base_price) : 0,
    tradePrice: p.tradePrice || p.trade_price ? Number(p.tradePrice || p.trade_price) : undefined,
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

interface ProductEditProviderProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  product: any;
  children: ReactNode;
}

export function ProductEditProvider({ product, children }: ProductEditProviderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  // Mode from URL
  const initialMode: EditMode = searchParams.get('mode') === 'edit' ? 'edit' : 'present';
  const [mode, setModeState] = useState<EditMode>(initialMode);

  const setMode = useCallback(
    (m: EditMode) => {
      setModeState(m);
      const params = new URLSearchParams(searchParams.toString());
      if (m === 'edit') {
        params.set('mode', 'edit');
      } else {
        params.delete('mode');
      }
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const toggleMode = useCallback(() => {
    setMode(mode === 'present' ? 'edit' : 'present');
  }, [mode, setMode]);

  // Data
  const original = useMemo(() => normalizeProduct(product), [product]);
  const [draft, setDraft] = useState<ProductDraft>(original);
  const [isDirty, setIsDirty] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<AutoSaveStatus>('idle');

  // Sync when server data changes
  useEffect(() => {
    if (!isDirty) {
      setDraft(original);
    }
  }, [original, isDirty]);

  // Auto-save mutation
  const saveMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => catalogApi.updateProduct(draft.id, data),
    onSuccess: () => {
      setAutoSaveStatus('saved');
      setIsDirty(false);
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['product', draft.id] });
    },
    onError: () => {
      setAutoSaveStatus('error');
    },
  });

  // Debounced auto-save
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerAutoSave = useCallback(
    (updatedDraft: ProductDraft) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      setAutoSaveStatus('idle');

      saveTimerRef.current = setTimeout(() => {
        setAutoSaveStatus('saving');
        saveMutation.mutate({
          name: updatedDraft.name,
          description: updatedDraft.description,
          price: updatedDraft.price || undefined,
          brand: updatedDraft.brand || undefined,
          status: updatedDraft.status,
          tier: updatedDraft.tier || undefined,
          provenance: updatedDraft.provenance || undefined,
          finish: updatedDraft.finish || undefined,
          assembly: updatedDraft.assembly || undefined,
          tradePrice: updatedDraft.tradePrice || undefined,
          mapPrice: updatedDraft.mapPrice || undefined,
          commissionRate: updatedDraft.commissionRate || undefined,
          careInstructions: updatedDraft.careInstructions || undefined,
          arModelUrl: updatedDraft.arModelUrl || undefined,
          materials: updatedDraft.materials.length ? updatedDraft.materials : undefined,
          images: updatedDraft.images.map((img) => img.url),
        });
      }, 2000);
    },
    [saveMutation]
  );

  // Cleanup timer
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const updateField = useCallback(
    <K extends keyof ProductDraft>(key: K, value: ProductDraft[K]) => {
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

  const publishChanges = useCallback(async () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setAutoSaveStatus('saving');
    try {
      await catalogApi.updateProduct(draft.id, {
        name: draft.name,
        description: draft.description,
        price: draft.price || undefined,
        brand: draft.brand || undefined,
        status: 'published',
        tier: draft.tier || undefined,
        provenance: draft.provenance || undefined,
        finish: draft.finish || undefined,
        assembly: draft.assembly || undefined,
        tradePrice: draft.tradePrice || undefined,
        mapPrice: draft.mapPrice || undefined,
        commissionRate: draft.commissionRate || undefined,
        careInstructions: draft.careInstructions || undefined,
        arModelUrl: draft.arModelUrl || undefined,
        materials: draft.materials.length ? draft.materials : undefined,
        images: draft.images.map((img) => img.url),
      });
      setAutoSaveStatus('saved');
      setIsDirty(false);
      setMode('present');
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['product', draft.id] });
    } catch {
      setAutoSaveStatus('error');
    }
  }, [draft, setMode, queryClient]);

  const revert = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setDraft(original);
    setIsDirty(false);
    setAutoSaveStatus('idle');
  }, [original]);

  const value = useMemo<ProductEditContextValue>(
    () => ({
      mode,
      setMode,
      toggleMode,
      draft,
      original,
      isDirty,
      autoSaveStatus,
      updateField,
      updateImages,
      publishChanges,
      revert,
    }),
    [mode, setMode, toggleMode, draft, original, isDirty, autoSaveStatus, updateField, updateImages, publishChanges, revert]
  );

  return <ProductEditContext.Provider value={value}>{children}</ProductEditContext.Provider>;
}
