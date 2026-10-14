'use client';

/**
 * The folio — the Piece Room's image manager. Extends the Composing Page's
 * URL-paste idiom with set-primary, reorder, remove, and a real bucket upload
 * to `product-images/{uid}/…`. The first image is the primary (the letterhead +
 * the shelf thumbnail read images[0]). Reorder is arrow buttons, not drag —
 * keyboard-reachable and automatable (HTML5 DnD isn't). Saves the whole `images`
 * array on every change via the self-save hook. Zero shadows (D4).
 *
 * US-34 N15 (`optimistic-ink` on): a remove answers at once with an in-flow
 * Undo row ("Removing…", then "Removed" on the receipt). Undo puts only that
 * image back into the CURRENT list, so a change made in between survives it.
 */

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '@patina/supabase';
import { useFeatureFlag } from '@/hooks/use-feature-flag';
import { usePieceField } from '@/hooks/use-piece-field';
import { DocumentAction, DocumentActionRow } from '../../document-action';

export function PieceFolio({
  productId,
  images,
  readOnly,
}: {
  productId: string;
  images: string[] | null;
  readOnly?: boolean;
}) {
  const list = images ?? [];
  const [hero, setHero] = useState(0);
  const [draft, setDraft] = useState('');
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const save = usePieceField(productId);
  // F15c: a remove is pending-only. The image stays, reading "Removing…",
  // until the server confirms. N15's Undo restore goes the same way.
  const removeSave = usePieceField(productId, { optimistic: false });
  const [removingIdx, setRemovingIdx] = useState<number | null>(null);
  const removing = removingIdx !== null;
  const ink = useFeatureFlag('optimistic-ink').value === true;
  const qc = useQueryClient();
  // N15: the last remove, open for Undo until Undo lands, the remove is
  // refused, or a later remove replaces it.
  const [undo, setUndo] = useState<{
    src: string;
    index: number;
    deleting: Promise<unknown>;
    removed: boolean;
  } | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [focusSrc, setFocusSrc] = useState<string | null>(null);
  const undoRef = useRef<HTMLButtonElement>(null);
  const thumbsRef = useRef<HTMLDivElement>(null);
  const busy = removing || restoring;
  const undoKey = undo?.deleting;

  useEffect(() => {
    if (undoKey) undoRef.current?.focus();
  }, [undoKey]);

  // After an Undo, focus the restored image once its thumbnail renders.
  useEffect(() => {
    if (focusSrc === null) return;
    const restored = Array.from(
      thumbsRef.current?.querySelectorAll<HTMLButtonElement>('button[data-folio-preview]') ?? [],
    ).find((b) => b.dataset.folioPreview === focusSrc);
    if (!restored) return;
    restored.focus();
    setFocusSrc(null);
  }, [focusSrc, images]);

  const heroIdx = Math.min(hero, Math.max(0, list.length - 1));

  const persist = (next: string[]) => {
    // Every folio write sends the whole array; one built while a remove is
    // pending would put the removed image back.
    if (busy) return;
    setErr(null);
    save
      .mutateAsync({ images: next })
      .catch((e) =>
        setErr(e instanceof Error ? e.message : 'Could not save the folio.'),
      );
  };

  // ── Read-only gallery ─────────────────────────────────────────────────────
  if (readOnly) {
    if (list.length === 0) {
      return (
        <div className="flex h-[260px] items-center justify-center rounded-[10px] border border-[var(--doc-ink-border)] bg-[var(--doc-sheet-2)]">
          <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--color-aged-oak)] opacity-60">
            no image
          </span>
        </div>
      );
    }
    return (
      <div>
        <div className="overflow-hidden rounded-[10px] border border-[var(--doc-ink-border)] bg-[var(--doc-sheet-2)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={list[heroIdx]}
            alt=""
            className="h-[360px] w-full object-cover"
           decoding="async" fetchPriority="high"/>
        </div>
        {list.length > 1 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {list.map((src, i) => (
              <button
                key={`${src}-${i}`}
                type="button"
                onClick={() => setHero(i)}
                className={`h-[60px] w-[60px] overflow-hidden rounded-[6px] border ${
                  i === heroIdx
                    ? 'border-[var(--color-clay)]'
                    : 'border-[var(--doc-ink-border)]'
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="h-full w-full object-cover"  decoding="async" loading="lazy"/>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Editable folio ────────────────────────────────────────────────────────
  const addUrl = () => {
    const url = draft.trim();
    if (!url || busy) return;
    setDraft('');
    persist([...list, url]);
  };
  const remove = (i: number) => {
    if (busy) return;
    setErr(null);
    setRemovingIdx(i);
    const deleting = removeSave.mutateAsync({ images: list.filter((_, j) => j !== i) });
    if (ink) setUndo({ src: list[i], index: i, deleting, removed: false });
    deleting
      .then(() =>
        setUndo((u) => (u?.deleting === deleting ? { ...u, removed: true } : u)),
      )
      .catch((e) => {
        setUndo((u) => (u?.deleting === deleting ? null : u));
        setErr(e instanceof Error ? e.message : 'Could not remove the image.');
      })
      .finally(() => setRemovingIdx(null));
  };
  // N15 Undo puts back only the removed image, into the list the server holds
  // at the write (00793 restore_product_image), at its old index or else at
  // the end. Sending a whole list from this browser would erase an image a
  // collaborator added since that it has not seen.
  const undoRemove = async () => {
    if (!undo || restoring) return;
    setRestoring(true);
    setErr(null);
    try {
      await undo.deleting;
    } catch {
      setRestoring(false);
      return;
    }
    try {
      const { data: images, error } = await createBrowserClient().rpc('restore_product_image', {
        p_product_id: productId,
        p_src: undo.src,
        p_index: undo.index,
      });
      if (error) throw new Error(error.message || 'Could not restore the image.');
      // No row written: RLS refused it or the piece is gone (R6).
      if (!images) throw new Error('Could not restore the image.');
      qc.setQueryData(['product', productId], (old: unknown) =>
        old && typeof old === 'object' ? { ...(old as object), images } : old,
      );
      for (const queryKey of [['product', productId], ['products'], ['layer-products'], ['layer-counts']]) {
        void qc.invalidateQueries({ queryKey });
      }
      setUndo(null);
      setFocusSrc(undo.src);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not restore the image.');
    } finally {
      setRestoring(false);
    }
  };
  const makePrimary = (i: number) => {
    if (i === 0) return;
    const next = [list[i], ...list.filter((_, j) => j !== i)];
    persist(next);
    setHero(0);
  };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    persist(next);
  };

  const onUpload = async (file: File) => {
    setUploading(true);
    setErr(null);
    try {
      const supabase = createBrowserClient() as unknown as {
        auth: {
          getUser: () => Promise<{ data: { user: { id: string } | null } }>;
        };
        storage: {
          from: (b: string) => {
            upload: (
              p: string,
              f: File,
              o?: { upsert?: boolean },
            ) => Promise<{ error: { message: string } | null }>;
            getPublicUrl: (p: string) => { data: { publicUrl: string } };
          };
        };
      };
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not signed in.');
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage
        .from('product-images')
        .upload(path, file, { upsert: false });
      if (error) throw new Error(error.message);
      const { data } = supabase.storage
        .from('product-images')
        .getPublicUrl(path);
      persist([...list, data.publicUrl]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      {/* Hero */}
      {list.length > 0 ? (
        <div className="overflow-hidden rounded-[10px] border border-[var(--doc-ink-border)] bg-[var(--doc-sheet-2)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={list[heroIdx]}
            alt=""
            className="h-[320px] w-full object-cover"
           decoding="async" fetchPriority="high"/>
        </div>
      ) : (
        <div className="flex h-[220px] items-center justify-center rounded-[10px] border border-dashed border-[var(--doc-ink-border)] bg-[var(--doc-sheet-2)]">
          <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--color-aged-oak)] opacity-60">
            no image yet — paste a URL or upload below
          </span>
        </div>
      )}

      {/* Thumbnails with controls */}
      {list.length > 0 && (
        <div ref={thumbsRef} className="mt-2 flex flex-wrap gap-2">
          {list.map((src, i) => (
            <div
              key={`${src}-${i}`}
              aria-busy={i === removingIdx || undefined}
              className={`relative h-[72px] w-[72px] overflow-hidden rounded-[6px] border ${
                i === 0
                  ? 'border-[var(--color-clay)]'
                  : 'border-[var(--doc-ink-border)]'
              }`}
            >
              <button
                type="button"
                onClick={() => setHero(i)}
                className="block h-full w-full"
                data-folio-preview={src}
                aria-label={`Preview image ${i + 1} of ${list.length}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="h-full w-full object-cover"  decoding="async" loading="lazy"/>
              </button>
              {i === 0 && (
                <span className="absolute left-0 top-0 bg-[var(--color-clay)] px-1 font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-white">
                  primary
                </span>
              )}
              {i === removingIdx ? (
                <span
                  // With the flag on, the Undo row is the one live region.
                  role={ink ? undefined : 'status'}
                  className="absolute inset-x-0 top-0 bg-[rgba(44,41,38,0.65)] px-1 text-center font-mono text-[11px] text-white"
                >
                  Removing…
                </span>
              ) : (
                <button
                  type="button"
                  aria-label={`Remove image ${i + 1}`}
                  onClick={() => remove(i)}
                  disabled={busy}
                  className="absolute right-0 top-0 bg-[rgba(44,41,38,0.65)] px-1 font-mono text-[11px] text-white hover:bg-[var(--color-terracotta)] disabled:opacity-30"
                >
                  ✕
                </button>
              )}
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-[rgba(44,41,38,0.55)] py-0.5">
                <button
                  type="button"
                  aria-label={`Move image ${i + 1} left`}
                  onClick={() => move(i, -1)}
                  disabled={i === 0 || busy}
                  className="font-mono text-[11px] text-white disabled:opacity-30"
                >
                  ←
                </button>
                {i !== 0 && (
                  <button
                    type="button"
                    aria-label={`Set image ${i + 1} as primary`}
                    onClick={() => makePrimary(i)}
                    disabled={busy}
                    className="font-mono text-[11px] text-white hover:text-[var(--color-golden-hour)]"
                  >
                    ★
                  </button>
                )}
                <button
                  type="button"
                  aria-label={`Move image ${i + 1} right`}
                  onClick={() => move(i, 1)}
                  disabled={i === list.length - 1 || busy}
                  className="font-mono text-[11px] text-white disabled:opacity-30"
                >
                  →
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* N15 Undo row: in flow, no shadow; it takes focus when it opens */}
      {undo && (
        <div className="mt-2 flex min-h-[44px] items-center gap-3 rounded-[6px] border border-[var(--doc-ink-border)] bg-[var(--doc-sheet-2)] pl-3">
          <span role="status" className="flex-1 text-[0.8rem] text-[var(--color-charcoal)]">
            Image {undo.index + 1}: {undo.removed ? 'Removed' : 'Removing…'}
          </span>
          <button
            ref={undoRef}
            type="button"
            onClick={() => void undoRemove()}
            aria-disabled={restoring || undefined}
            aria-busy={restoring || undefined}
            className="min-h-[44px] min-w-[44px] px-3 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-clay-ink)] hover:underline"
          >
            {restoring ? 'Restoring…' : 'Undo'}
          </button>
        </div>
      )}

      {/* Add row */}
      <DocumentActionRow
        surfaceKey="piece"
        regionKey="piece-folio-add"
        className="mt-3"
        aria-label="Piece folio actions"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addUrl())}
          placeholder="paste an image URL (or a cut sheet)"
          className="flex-1 rounded-[6px] border border-[var(--color-pearl)] bg-[var(--doc-paper)] px-3 py-2 text-[0.8rem] text-[var(--color-charcoal)] focus:border-[var(--color-clay)] focus:bg-white focus:outline-none"
        />
        <DocumentAction
          actionKey="add-image-url"
          variant="secondary"
          onClick={addUrl}
          disabled={!draft.trim() || busy}
        >
          + add
        </DocumentAction>
        <DocumentAction
          actionKey="upload-piece-image"
          variant="primary"
          onClick={() => fileRef.current?.click()}
          loading={uploading}
          disabled={busy}
          loadingLabel="Uploading…"
        >
          Upload
        </DocumentAction>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onUpload(f);
            e.target.value = '';
          }}
        />
      </DocumentActionRow>
      {err && (
        <p role="alert" className="mt-2 text-[0.7rem] text-[var(--color-terracotta-ink)]">
          {err}
        </p>
      )}
    </div>
  );
}
