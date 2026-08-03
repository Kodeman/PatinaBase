'use client';

import type {
  EditableMoodBoardItem,
  MoodBoardItemData,
  MoodBoardPaletteSwatch,
} from '@patina/types';
import { Button, Input } from '@/components/ui/controls';

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function swatchesFor(item: EditableMoodBoardItem): MoodBoardPaletteSwatch[] {
  return Array.isArray(item.data?.swatches)
    ? item.data.swatches.filter((swatch): swatch is MoodBoardPaletteSwatch =>
        Boolean(swatch) && typeof swatch.hex === 'string' && HEX_COLOR.test(swatch.hex),
      )
    : [];
}

export function replacePaletteSwatch(
  item: EditableMoodBoardItem,
  index: number,
  patch: Partial<MoodBoardPaletteSwatch>,
): MoodBoardItemData {
  const swatches = swatchesFor(item).map((swatch, swatchIndex) =>
    swatchIndex === index ? { ...swatch, ...patch } : { ...swatch },
  );
  return { ...(item.data ?? {}), swatches };
}

export function BoardPaletteInspectorActions({
  item,
  onUpdate,
}: {
  item: EditableMoodBoardItem;
  onUpdate: (data: NonNullable<EditableMoodBoardItem['data']>) => void;
}) {
  if (item.type !== 'palette') return null;
  const swatches = swatchesFor(item);
  if (swatches.length === 0) {
    return <p className="text-[11px] text-[var(--text-muted)]">This palette has no swatches.</p>;
  }

  return (
    <fieldset className="space-y-2">
      <legend className="font-mono text-[8px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
        Palette swatches
      </legend>
      {swatches.map((swatch, index) => (
        <div key={`${index}:${swatch.hex}`} className="grid grid-cols-[44px_1fr] items-center gap-2">
          <input
            type="color"
            aria-label={`Swatch ${index + 1} color`}
            value={swatch.hex}
            className="h-11 w-11 cursor-pointer rounded border border-[var(--border-default)] bg-transparent p-1"
            onChange={(event) => onUpdate(replacePaletteSwatch(item, index, { hex: event.target.value }))}
          />
          <Input
            key={`${index}:${swatch.name ?? ''}`}
            aria-label={`Swatch ${index + 1} name`}
            defaultValue={swatch.name ?? ''}
            placeholder={swatch.hex.toUpperCase()}
            onBlur={(event) => {
              const name = event.currentTarget.value.trim();
              if (name !== (swatch.name ?? '')) {
                onUpdate(replacePaletteSwatch(item, index, { name: name || null }));
              }
            }}
          />
        </div>
      ))}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onUpdate({ ...(item.data ?? {}), swatches: [...swatches].reverse() })}
      >
        Reverse swatches
      </Button>
    </fieldset>
  );
}
