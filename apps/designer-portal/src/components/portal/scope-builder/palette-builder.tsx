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
  const { data: palettes = [] } = usePalettes(proposalId);
  const upsertPalette = useUpsertPalette();
  const deletePalette = useDeletePalette();

  const [activePaletteId, setActivePaletteId] = useState<string | null>(null);
  const activeId = activePaletteId ?? palettes[0]?.id ?? null;
  const { data: active } = usePalette(activeId);

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
      upsertPalette.mutate({
        proposalId,
        paletteId: palette.id,
        name: palette.name,
        isPrimary: true,
      });
    },
    [upsertPalette, proposalId],
  );

  const handleDeletePalette = useCallback(
    (paletteId: string) => {
      if (!confirm('Delete this palette? Swatches will also be removed.')) return;
      deletePalette.mutate({ paletteId, proposalId });
      if (activePaletteId === paletteId) setActivePaletteId(null);
    },
    [deletePalette, proposalId, activePaletteId],
  );

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
      />

      {active ? (
        <div className="rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display text-lg">{active.name}</h3>
            <TabStrip active={tab} onChange={setTab} />
          </div>

          {tab === 'image' && <ImageTab proposalId={proposalId} paletteId={active.id} sourceImageUrl={active.source_image_url} />}
          {tab === 'brand' && <BrandTab paletteId={active.id} />}
          {tab === 'manual' && <ManualTab paletteId={active.id} />}

          <SwatchList paletteId={active.id} swatches={active.swatches ?? []} />
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
}

function PaletteList({ palettes, activeId, onSelect, onNew, onSetPrimary, onDelete }: PaletteListProps) {
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
            <button
              onClick={() => onSetPrimary(p)}
              className="text-xs text-[var(--text-muted)] hover:text-[var(--text-default)]"
            >
              Make primary
            </button>
          )}
          <button
            onClick={() => onDelete(p.id)}
            className="text-xs text-[var(--text-muted)] hover:text-red-500"
            aria-label="Delete palette"
          >
            ×
          </button>
        </div>
      ))}
      <button
        onClick={onNew}
        className="rounded-md border border-dashed border-[var(--border-default)] px-3 py-2 text-sm hover:border-[var(--accent-primary)]"
      >
        + New Palette
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
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={`rounded px-3 py-1 text-xs ${
            active === t.value
              ? 'bg-[var(--accent-primary)] text-white'
              : 'text-[var(--text-muted)] hover:text-[var(--text-default)]'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function ImageTab({ proposalId, paletteId, sourceImageUrl }: { proposalId: string; paletteId: string; sourceImageUrl: string | null }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const upsertPalette = useUpsertPalette();
  const upsertSwatch = useUpsertSwatch();

  const handleUpload = useCallback(
    async (file: File) => {
      setUploading(true);
      try {
        const supabase = createBrowserClient();
        const path = `${paletteId}/${crypto.randomUUID()}.${file.name.split('.').pop() ?? 'jpg'}`;
        const { error } = await supabase.storage.from('proposal-mood-boards').upload(path, file, {
          upsert: true,
          contentType: file.type,
        });
        if (error) throw error;
        const { data } = supabase.storage.from('proposal-mood-boards').getPublicUrl(path);
        upsertPalette.mutate({ proposalId, paletteId, sourceImageUrl: data.publicUrl });
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
          paletteId,
          hex: s.hex,
          sourcePixel: s.sourcePixel,
        });
      });
    },
    [paletteId, upsertSwatch],
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

function BrandTab({ paletteId }: { paletteId: string }) {
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
        paletteId,
        hex: color.hex,
        name: color.name,
        paintColorId: color.id,
        brand: color.brand,
        brandCode: color.code,
      });
    },
    [paletteId, upsertSwatch],
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

function ManualTab({ paletteId }: { paletteId: string }) {
  const [hex, setHex] = useState('#A8B5A6');
  const [role, setRole] = useState<PaletteSwatchRole | ''>('');
  const upsertSwatch = useUpsertSwatch();

  const handleAdd = () => {
    upsertSwatch.mutate({
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
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as PaletteSwatchRole | '')}
          className="rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] px-2 py-1 text-sm"
        >
          {ROLE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      <button
        onClick={handleAdd}
        className="rounded-md bg-[var(--accent-primary)] px-4 py-2 text-sm text-white hover:opacity-90"
      >
        Add swatch
      </button>
    </div>
  );
}

function SwatchList({
  paletteId,
  swatches,
}: {
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
        <PaletteSwatchEditor key={swatch.id} swatch={swatch} />
      ))}
      <ReorderHint paletteId={paletteId} swatches={swatches} reorder={reorder} />
    </div>
  );
}

function ReorderHint({
  paletteId,
  swatches,
  reorder,
}: {
  paletteId: string;
  swatches: NonNullable<ReturnType<typeof usePalette>['data']>['swatches'];
  reorder: ReturnType<typeof useReorderSwatches>;
}) {
  if (swatches.length < 2) return null;
  return (
    <button
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
        reorder.mutate({ paletteId, orderedIds: ordered });
      }}
      className="text-xs text-[var(--text-muted)] hover:text-[var(--text-default)]"
    >
      Sort by luminance
    </button>
  );
}
