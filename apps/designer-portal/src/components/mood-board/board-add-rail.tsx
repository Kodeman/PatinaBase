'use client';

import { useRef, useState } from 'react';
import type { BoardPoint, EditableMoodBoardItem } from '@patina/types';
import {
  useProposalCaptures,
  type ProposalCapture,
} from '@patina/supabase';
import { Button } from '@/components/ui/controls';
import {
  ProductPickerModal,
  type ProductPickResult,
} from '@/components/portal/proposals/product-picker-modal';
import { prepareAndUploadBoardImages } from '@/lib/mood-board-assets/upload-board-assets';

export type BoardAddSource = 'rail_click' | 'file_drop';

function newItemId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `board-item-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function payloadString(payload: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

export function captureToBoardItem(
  capture: ProposalCapture,
  point: BoardPoint,
  zIndex: number,
): EditableMoodBoardItem {
  const name = payloadString(capture.raw_payload, 'name', 'productName', 'title') ?? 'Untitled capture';
  const vendor = payloadString(capture.raw_payload, 'vendor_name', 'vendorName', 'brand');
  return {
    id: newItemId(),
    type: 'capture',
    x: point.x,
    y: point.y,
    width: 260,
    height: 300,
    zIndex,
    rotation: 0,
    locked: false,
    productId: capture.product_id,
    captureId: capture.id,
    paletteId: null,
    imageUrl: capture.thumbnail_url,
    content: null,
    data: {
      ...capture.raw_payload,
      name,
      vendor_name: vendor,
      image_url: capture.thumbnail_url,
      source_url: capture.source_url,
    },
  };
}

export function productPickToBoardItem(
  result: ProductPickResult,
  point: BoardPoint,
  zIndex: number,
): EditableMoodBoardItem {
  return {
    id: newItemId(),
    type: result.captureId ? 'capture' : 'product',
    x: point.x,
    y: point.y,
    width: 260,
    height: 300,
    zIndex,
    rotation: 0,
    locked: false,
    productId: result.productId,
    captureId: result.captureId ?? null,
    paletteId: null,
    imageUrl: result.imageUrl,
    content: null,
    data: {
      name: result.name,
      price_cents: result.priceCents,
      vendor_name: result.vendorName,
      image_url: result.imageUrl,
    },
  };
}

export async function uploadFilesAsBoardItems(options: {
  ownerId: string;
  boardId: string;
  files: readonly File[];
  point: BoardPoint;
  startZ: number;
}): Promise<EditableMoodBoardItem[]> {
  const uploaded = await prepareAndUploadBoardImages({
    ownerId: options.ownerId,
    boardId: options.boardId,
    files: options.files,
  });
  return uploaded.map((asset, index) => {
    const width = 280;
    const height = Math.max(120, Math.round(width / asset.aspectRatio));
    return {
      id: asset.assetId,
      type: 'image' as const,
      x: options.point.x + index * 24,
      y: options.point.y + index * 24,
      width,
      height,
      zIndex: options.startZ + index,
      rotation: 0,
      locked: false,
      productId: null,
      captureId: null,
      paletteId: null,
      imageUrl: asset.image_url,
      content: null,
      data: {
        image_url: asset.image_url,
        thumbnail_url: asset.data.thumbnail_url,
        resolved_height: height,
      },
    };
  });
}

export function BoardAddRail({
  ownerId,
  boardId,
  nextPoint,
  nextZ,
  onAddItems,
}: {
  ownerId: string;
  boardId: string;
  nextPoint: () => BoardPoint;
  nextZ: () => number;
  onAddItems: (items: readonly EditableMoodBoardItem[], source: BoardAddSource) => void;
}) {
  const [tab, setTab] = useState<'library' | 'captures' | 'uploads'>('library');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { data: captures = [], isLoading: capturesLoading } = useProposalCaptures({ status: 'inbox' });

  const addProduct = (result: ProductPickResult) => {
    onAddItems([productPickToBoardItem(result, nextPoint(), nextZ())], 'rail_click');
  };

  const upload = async (files: readonly File[]) => {
    if (files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const items = await uploadFilesAsBoardItems({
        ownerId,
        boardId,
        files,
        point: nextPoint(),
        startZ: nextZ(),
      });
      onAddItems(items, 'file_drop');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The image could not be uploaded.');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const addNote = () => {
    const point = nextPoint();
    onAddItems([
      {
        id: newItemId(),
        type: 'note',
        x: point.x,
        y: point.y,
        width: 240,
        height: 160,
        zIndex: nextZ(),
        rotation: 0,
        locked: false,
        productId: null,
        captureId: null,
        paletteId: null,
        imageUrl: null,
        content: 'New note',
        data: {},
      },
    ], 'rail_click');
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div role="tablist" aria-label="Board sources" className="grid grid-cols-3 border-b border-[var(--border-default)]">
        {(['library', 'captures', 'uploads'] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={`min-h-11 px-1 font-mono text-[9px] uppercase tracking-[0.05em] ${tab === value ? 'border-b-2 border-[var(--color-clay)] text-[var(--color-clay)]' : 'text-[var(--text-muted)]'}`}
          >
            {value}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {tab === 'library' && (
          <div className="space-y-3">
            <p className="text-[11px] leading-4 text-[var(--text-muted)]">
              Search personal, studio, and catalog pieces.
            </p>
            <Button variant="secondary" size="sm" onClick={() => setPickerOpen(true)}>
              Browse products
            </Button>
          </div>
        )}

        {tab === 'captures' && (
          <div className="space-y-2">
            {capturesLoading && <p className="text-[11px] text-[var(--text-muted)]">Loading captures…</p>}
            {!capturesLoading && captures.length === 0 && (
              <p className="text-[11px] leading-4 text-[var(--text-muted)]">
                Captures from the Patina extension appear here.
              </p>
            )}
            {captures.map((capture) => {
              const name = payloadString(capture.raw_payload, 'name', 'productName', 'title') ?? 'Untitled capture';
              return (
                <button
                  key={capture.id}
                  type="button"
                  onClick={() => onAddItems([captureToBoardItem(capture, nextPoint(), nextZ())], 'rail_click')}
                  className="flex w-full items-center gap-2 rounded-[4px] border border-[var(--border-default)] p-2 text-left hover:border-[var(--color-clay)]"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[3px] bg-[var(--bg-muted)]">
                    {capture.thumbnail_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={capture.thumbnail_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span aria-hidden className="font-heading text-sm italic text-[var(--text-muted)]">C</span>
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[12px] text-[var(--text-primary)]">{name}</span>
                    <span className="block truncate font-mono text-[9px] text-[var(--text-muted)]">
                      {(() => { try { return new URL(capture.source_url).hostname.replace(/^www\./, ''); } catch { return 'capture'; } })()}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {tab === 'uploads' && (
          <div className="space-y-3">
            <p className="text-[11px] leading-4 text-[var(--text-muted)]">
              Images are resized before upload; originals never leave the browser.
            </p>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              onChange={(event) => void upload(Array.from(event.target.files ?? []))}
            />
            <Button variant="secondary" size="sm" disabled={uploading} onClick={() => inputRef.current?.click()}>
              {uploading ? 'Preparing images…' : 'Choose images'}
            </Button>
          </div>
        )}
      </div>

      <div className="border-t border-[var(--border-default)] p-3">
        <Button variant="ghost" size="sm" onClick={addNote}>+ Note</Button>
        {error && <p role="alert" className="mt-2 text-[11px] text-[var(--color-clay)]">{error}</p>}
      </div>

      <ProductPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={addProduct}
        scope="library"
      />
    </div>
  );
}
