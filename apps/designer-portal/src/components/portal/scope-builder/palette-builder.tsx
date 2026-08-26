'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ColorPicker,
  ImagePaletteExtractor,
  PaintColorPicker,
  type ExtractedSwatch,
  type PaintColorBrand,
  type PaintColorOption,
} from '@patina/design-system';
import { Button, IconButton, Select } from '@/components/ui/controls';
import {
  createBrowserClient,
  usePalette,
  usePalettes,
  useSearchPaintColors,
  useUpsertPalette,
  useUpsertSwatch,
  useDeletePalette,
  useReorderSwatches,
  type ProposalPalette,
  type PaletteSwatchRole,
} from '@patina/supabase';
import { PaletteSwatchEditor } from './palette-swatch-editor';

type Tab = 'image' | 'brand' | 'manual';

const ROLE_OPTIONS: Array<{ value: PaletteSwatchRole | ''; label: string }> = [
  { value: '', label: 'Unassigned' },
  { value: 'foundation', label: 'Foundation' },
  { value: 'wall', label: 'Wall' },
  { value: 'accent', label: 'Accent' },
  { value: 'trim', label: 'Trim' },
  { value: 'ceiling', label: 'Ceiling' },
  { value: 'floor', label: 'Floor' },
  { value: 'metal', label: 'Metal' },
  { value: 'textile', label: 'Textile' },
  { value: 'other', label: 'Other' },
];

interface PaletteBuilderProps {
  proposalId: string;
}

export function PaletteBuilder({ proposalId }: PaletteBuilderProps) {
  return <PaletteBuilderState key={proposalId} proposalId={proposalId} />;
}

function PaletteBuilderState({ proposalId }: PaletteBuilderProps) {
  const {
    data: palettes = [],
    isLoading: palettesLoading,
    error: palettesError,
    refetch: refetchPalettes,
  } = usePalettes(proposalId);
  const upsertPalette = useUpsertPalette();
  const updatePalette = useUpsertPalette();
  const deletePalette = useDeletePalette();

  const [activePaletteId, setActivePaletteId] = useState<string | null>(null);
  const activeId =
    activePaletteId && palettes.some((palette) => palette.id === activePaletteId)
      ? activePaletteId
      : palettes[0]?.id ?? null;
  const {
    data: active,
    error: activeError,
    refetch: refetchActive,
  } = usePalette(activeId);

  const [tab, setTab] = useState<Tab>('image');

  const handleNewPalette = useCallback(async () => {
    const result = await upsertPalette.mutateAsync({
      proposalId,
      name: `Palette ${palettes.length + 1}`,
      isPrimary: palettes.length === 0,
    });
    if (result?.id) setActivePaletteId(result.id);
  }, [upsertPalette, proposalId, palettes.length]);

  const handleSetPrimary = useCallback(
    (palette: ProposalPalette) => {
      if (palette.is_primary) return;
      updatePalette.mutate({
        proposalId,
        paletteId: palette.id,
        name: palette.name,
        isPrimary: true,
      });
    },
    [updatePalette, proposalId],
  );

  const handleDeletePalette = useCallback(
    (paletteId: string) => {
      if (!confirm('Delete this palette? Swatches will also be removed.')) return;
      deletePalette.mutate(
        { paletteId, proposalId },
        {
          onSuccess: () => {
            if (activePaletteId === paletteId) setActivePaletteId(null);
          },
        },
      );
    },
    [deletePalette, proposalId, activePaletteId],
  );

  if (palettesError || activeError) {
    return (
      <div
        role="alert"
        className="rounded-[3px] border border-[var(--color-terracotta)] px-3 py-3 text-sm text-[var(--color-terracotta-ink)]"
      >
        <p>The palette could not be loaded. Editing is paused to protect this proposal.</p>
        <button
          type="button"
          onClick={() => {
            void refetchPalettes();
            if (activeId) void refetchActive();
          }}
          className="mt-2 underline underline-offset-4"
        >
          Retry palette
        </button>
      </div>
    );
  }

  if (palettesLoading) {
    return <p className="py-4 text-sm text-[var(--text-muted)]">Loading palette…</p>;
  }

  return (
    <div className="space-y-6">
      <DisclaimerBanner />

      <PaletteList
        palettes={palettes}
        activeId={activeId}
        onSelect={setActivePaletteId}
        onNew={handleNewPalette}
        onSetPrimary={handleSetPrimary}
        onDelete={handleDeletePalette}
        creating={upsertPalette.isPending}
      />

      {active ? (
        <div className="rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display text-lg">{active.name}</h3>
            <TabStrip active={tab} onChange={setTab} />
          </div>

          {tab === 'image' && <ImageTab proposalId={proposalId} paletteId={active.id} sourceImageUrl={active.source_image_url} />}
          {tab === 'brand' && <BrandTab proposalId={proposalId} paletteId={active.id} />}
          {tab === 'manual' && <ManualTab proposalId={proposalId} paletteId={active.id} />}

          <SwatchList
            proposalId={proposalId}
            paletteId={active.id}
            swatches={active.swatches ?? []}
          />
        </div>
      ) : (
        <p className="text-sm text-[var(--text-muted)]">
          Create a palette to capture color decisions for this proposal.
        </p>
      )}
    </div>
  );
}

function DisclaimerBanner() {
  return (
    <div className="rounded-md border border-[var(--border-default)] bg-[var(--bg-muted)] px-4 py-3">
      <p className="text-xs text-[var(--text-muted)]">
        Hex is approximate. Confirm with physical samples before specifying paint or finishes.
      </p>
    </div>
  );
}

interface PaletteListProps {
  palettes: ProposalPalette[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onSetPrimary: (palette: ProposalPalette) => void;
  onDelete: (paletteId: string) => void;
  creating: boolean;
}

function PaletteList({
  palettes,
  activeId,
  onSelect,
  onNew,
  onSetPrimary,
  onDelete,
  creating,
}: PaletteListProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {palettes.map((p) => (
        <div
          key={p.id}
          className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
            p.id === activeId
              ? 'border-[var(--accent-primary)] bg-[var(--bg-surface)]'
              : 'border-[var(--border-default)] bg-[var(--bg-muted)]'
          }`}
        >
          <button onClick={() => onSelect(p.id)} className="font-medium">
            {p.name}
          </button>
          {p.is_primary ? (
            <span className="rounded bg-[var(--accent-primary)]/10 px-1.5 py-0.5 text-[0.65rem] uppercase tracking-wider text-[var(--accent-primary)]">
              Primary
            </span>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onSetPrimary(p)}
            >
              Make primary
            </Button>
          )}
          <IconButton
            label="Delete palette"
            variant="ghost"
            size="sm"
            onClick={() => onDelete(p.id)}
          >
            ×
          </IconButton>
        </div>
      ))}
      <button
        onClick={onNew}
        disabled={creating}
        className="rounded-md border border-dashed border-[var(--border-default)] px-3 py-2 text-sm hover:border-[var(--accent-primary)]"
      >
        {creating ? 'Creating palette…' : '+ New Palette'}
      </button>
    </div>
  );
}

interface TabStripProps {
  active: Tab;
  onChange: (tab: Tab) => void;
}

function TabStrip({ active, onChange }: TabStripProps) {
  const tabs: Array<{ value: Tab; label: string }> = [
    { value: 'image', label: 'Image' },
    { value: 'brand', label: 'Brand' },
    { value: 'manual', label: 'Manual' },
  ];
  return (
    <div className="flex gap-1 rounded-md border border-[var(--border-default)] p-0.5">
      {tabs.map((t) => (
        <Button
          key={t.value}
          variant={active === t.value ? 'primary' : 'ghost'}
          size="sm"
          onClick={() => onChange(t.value)}
          className="!rounded"
        >
          {t.label}
        </Button>
      ))}
    </div>
  );
}

function ImageTab({
  proposalId,
  paletteId,
  sourceImageUrl,
}: {
  proposalId: string;
  paletteId: string;
  sourceImageUrl: string | null;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const upsertPalette = useUpsertPalette();
  const upsertSwatch = useUpsertSwatch();

  const handleUpload = useCallback(
    async (file: File) => {
      setUploading(true);
      try {
        const supabase = createBrowserClient();
        const path = `${proposalId}/palettes/${paletteId}/${crypto.randomUUID()}.${file.name.split('.').pop() ?? 'jpg'}`;
        const { error } = await supabase.storage.from('proposal-mood-boards').upload(path, file, {
          upsert: false,
          contentType: file.type,
        });
        if (error) throw error;
        const { data, error: signError } = await supabase.storage
          .from('proposal-mood-boards')
          .createSignedUrl(path, 3600);
        if (signError) throw signError;
        upsertPalette.mutate({ proposalId, paletteId, sourceImageUrl: data.signedUrl });
      } finally {
        setUploading(false);
      }
    },
    [proposalId, paletteId, upsertPalette],
  );

  const handleExtracted = useCallback(
    (swatches: ExtractedSwatch[]) => {
      swatches.forEach((s) => {
        upsertSwatch.mutate({
          proposalId,
          paletteId,
          hex: s.hex,
          sourcePixel: s.sourcePixel,
        });
      });
    },
    [paletteId, proposalId, upsertSwatch],
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleUpload(file);
          }}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="rounded-md border border-[var(--border-default)] px-3 py-2 text-sm hover:border-[var(--accent-primary)] disabled:opacity-50"
        >
          {uploading ? 'Uploading…' : sourceImageUrl ? 'Replace image' : 'Upload mood image'}
        </button>
        {sourceImageUrl && (
          <span className="text-xs text-[var(--text-muted)]">Image uploaded — extract colors below.</span>
        )}
      </div>
      {sourceImageUrl && (
        <ImagePaletteExtractor imageUrl={sourceImageUrl} k={5} onExtracted={handleExtracted} />
      )}
    </div>
  );
}

function BrandTab({
  proposalId,
  paletteId,
}: {
  proposalId: string;
  paletteId: string;
}) {
  const [query, setQuery] = useState('');
  const [brand, setBrand] = useState<PaintColorBrand | undefined>(undefined);
  const upsertSwatch = useUpsertSwatch();

  const handleSearch = useCallback(
    async (q: string, b?: PaintColorBrand): Promise<PaintColorOption[]> => {
      setQuery(q);
      setBrand(b);
      return [];
    },
    [],
  );

  const { data: results = [] } = useSearchPaintColors(query, brand);
  const optionsForPicker = useMemo<PaintColorOption[]>(
    () =>
      results.map((r) => ({
        id: r.id,
        brand: r.brand,
        code: r.code,
        name: r.name,
        hex: r.hex,
      })),
    [results],
  );

  const handleChange = useCallback(
    (color: PaintColorOption | null) => {
      if (!color) return;
      upsertSwatch.mutate({
        proposalId,
        paletteId,
        hex: color.hex,
        name: color.name,
        paintColorId: color.id,
        brand: color.brand,
        brandCode: color.code,
      });
    },
    [paletteId, proposalId, upsertSwatch],
  );

  return (
    <div className="space-y-2">
      <PaintColorPicker
        value={null}
        onChange={handleChange}
        onSearch={async (q, b) => {
          await handleSearch(q, b);
          return optionsForPicker;
        }}
        placeholder="Search Sherwin-Williams, Benjamin Moore, Farrow & Ball, Pantone TPG…"
      />
      <p className="text-xs text-[var(--text-muted)]">
        Selected colors are added to this palette as a swatch.
      </p>
    </div>
  );
}

function ManualTab({
  proposalId,
  paletteId,
}: {
  proposalId: string;
  paletteId: string;
}) {
  const [hex, setHex] = useState('#A8B5A6');
  const [role, setRole] = useState<PaletteSwatchRole | ''>('');
  const upsertSwatch = useUpsertSwatch();

  const handleAdd = () => {
    upsertSwatch.mutate({
      proposalId,
      paletteId,
      hex,
      role: role === '' ? null : role,
    });
  };

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div>
        <label className="block text-xs text-[var(--text-muted)]">Color</label>
        <ColorPicker color={hex} onColorChange={setHex} />
      </div>
      <div>
        <label className="block text-xs text-[var(--text-muted)]">Role</label>
        <Select
          value={role}
          onChange={(e) => setRole(e.target.value as PaletteSwatchRole | '')}
        >
          {ROLE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
      </div>
      <Button
        variant="primary"
        size="sm"
        disabled={upsertSwatch.isPending}
        onClick={handleAdd}
      >
        {upsertSwatch.isPending ? 'Adding swatch…' : 'Add swatch'}
      </Button>
    </div>
  );
}

function SwatchList({
  proposalId,
  paletteId,
  swatches,
}: {
  proposalId: string;
  paletteId: string;
  swatches: NonNullable<ReturnType<typeof usePalette>['data']>['swatches'];
}) {
  const reorder = useReorderSwatches();

  // Simple list (no DnD wiring for first pass — host can extend later via useDragDrop).
  if (swatches.length === 0) {
    return (
      <p className="mt-4 text-sm text-[var(--text-muted)]">
        No swatches yet. Use the tabs above to add colors.
      </p>
    );
  }

  return (
    <div className="mt-4 space-y-2">
      {swatches.map((swatch) => (
        <PaletteSwatchEditor
          key={swatch.id}
          proposalId={proposalId}
          swatch={swatch}
        />
      ))}
      <ReorderHint
        proposalId={proposalId}
        paletteId={paletteId}
        swatches={swatches}
        reorder={reorder}
      />
    </div>
  );
}

function ReorderHint({
  proposalId,
  paletteId,
  swatches,
  reorder,
}: {
  proposalId: string;
  paletteId: string;
  swatches: NonNullable<ReturnType<typeof usePalette>['data']>['swatches'];
  reorder: ReturnType<typeof useReorderSwatches>;
}) {
  if (swatches.length < 2) return null;
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => {
        // Sort swatches by hex luminance as a friendly default reorder.
        const ordered = [...swatches]
          .sort((a, b) => {
            const lum = (h: string) => {
              const r = parseInt(h.slice(1, 3), 16);
              const g = parseInt(h.slice(3, 5), 16);
              const bl = parseInt(h.slice(5, 7), 16);
              return 0.299 * r + 0.587 * g + 0.114 * bl;
            };
            return lum(b.hex) - lum(a.hex);
          })
          .map((s) => s.id);
        reorder.mutate({ proposalId, paletteId, orderedIds: ordered });
      }}
    >
      Sort by luminance
    </Button>
  );
}
