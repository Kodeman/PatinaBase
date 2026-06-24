'use client';

/**
 * The folio — the Piece Room's image manager. Extends the Composing Page's
 * URL-paste idiom with set-primary, reorder, remove, and a real bucket upload
 * to `product-images/{uid}/…`. The first image is the primary (the letterhead +
 * the shelf thumbnail read images[0]). Reorder is arrow buttons, not drag —
 * keyboard-reachable and automatable (HTML5 DnD isn't). Saves the whole `images`
 * array on every change via the self-save hook. Zero shadows (D4).
 */

import { useRef, useState } from 'react';
import { createBrowserClient } from '@patina/supabase';
import { usePieceField } from '@/hooks/use-piece-field';

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

  const heroIdx = Math.min(hero, Math.max(0, list.length - 1));

  const persist = (next: string[]) => {
    setErr(null);
    save.mutateAsync({ images: next }).catch((e) => setErr(e instanceof Error ? e.message : 'Could not save the folio.'));
  };

  // ── Read-only gallery ─────────────────────────────────────────────────────
  if (readOnly) {
    if (list.length === 0) {
      return (
        <div className="flex h-[260px] items-center justify-center rounded-[10px] border border-[var(--doc-ink-border)] bg-[var(--doc-sheet-2)]">
          <span className="font-mono text-[0.6rem] uppercase tracking-[0.1em] text-[var(--color-aged-oak)] opacity-60">
            no image
          </span>
        </div>
      );
    }
    return (
      <div>
        <div className="overflow-hidden rounded-[10px] border border-[var(--doc-ink-border)] bg-[var(--doc-sheet-2)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={list[heroIdx]} alt="" className="h-[360px] w-full object-cover" />
        </div>
        {list.length > 1 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {list.map((src, i) => (
              <button
                key={`${src}-${i}`}
                type="button"
                onClick={() => setHero(i)}
                className={`h-[60px] w-[60px] overflow-hidden rounded-[6px] border ${
                  i === heroIdx ? 'border-[var(--color-clay)]' : 'border-[var(--doc-ink-border)]'
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="h-full w-full object-cover" />
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
    if (!url) return;
    setDraft('');
    persist([...list, url]);
  };
  const remove = (i: number) => persist(list.filter((_, j) => j !== i));
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
        auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> };
        storage: {
          from: (b: string) => {
            upload: (p: string, f: File, o?: { upsert?: boolean }) => Promise<{ error: { message: string } | null }>;
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
      const { error } = await supabase.storage.from('product-images').upload(path, file, { upsert: false });
      if (error) throw new Error(error.message);
      const { data } = supabase.storage.from('product-images').getPublicUrl(path);
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
          <img src={list[heroIdx]} alt="" className="h-[320px] w-full object-cover" />
        </div>
      ) : (
        <div className="flex h-[220px] items-center justify-center rounded-[10px] border border-dashed border-[var(--doc-ink-border)] bg-[var(--doc-sheet-2)]">
          <span className="font-mono text-[0.6rem] uppercase tracking-[0.1em] text-[var(--color-aged-oak)] opacity-60">
            no image yet — paste a URL or upload below
          </span>
        </div>
      )}

      {/* Thumbnails with controls */}
      {list.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {list.map((src, i) => (
            <div
              key={`${src}-${i}`}
              className={`relative h-[72px] w-[72px] overflow-hidden rounded-[6px] border ${
                i === 0 ? 'border-[var(--color-clay)]' : 'border-[var(--doc-ink-border)]'
              }`}
            >
              <button
                type="button"
                onClick={() => setHero(i)}
                className="block h-full w-full"
                aria-label={`Preview image ${i + 1} of ${list.length}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="h-full w-full object-cover" />
              </button>
              {i === 0 && (
                <span className="absolute left-0 top-0 bg-[var(--color-clay)] px-1 font-mono text-[7px] font-semibold uppercase tracking-[0.06em] text-white">
                  primary
                </span>
              )}
              <button
                type="button"
                aria-label={`Remove image ${i + 1}`}
                onClick={() => remove(i)}
                className="absolute right-0 top-0 bg-[rgba(44,41,38,0.65)] px-1 font-mono text-[9px] text-white hover:bg-[var(--color-terracotta)]"
              >
                ✕
              </button>
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-[rgba(44,41,38,0.55)] py-0.5">
                <button
                  type="button"
                  aria-label={`Move image ${i + 1} left`}
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  className="font-mono text-[9px] text-white disabled:opacity-30"
                >
                  ←
                </button>
                {i !== 0 && (
                  <button
                    type="button"
                    aria-label={`Set image ${i + 1} as primary`}
                    onClick={() => makePrimary(i)}
                    className="font-mono text-[9px] text-white hover:text-[var(--color-golden-hour)]"
                  >
                    ★
                  </button>
                )}
                <button
                  type="button"
                  aria-label={`Move image ${i + 1} right`}
                  onClick={() => move(i, 1)}
                  disabled={i === list.length - 1}
                  className="font-mono text-[9px] text-white disabled:opacity-30"
                >
                  →
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add row */}
      <div className="mt-3 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addUrl())}
          placeholder="paste an image URL (or a cut sheet)"
          className="flex-1 rounded-[6px] border border-[var(--color-pearl)] bg-[var(--doc-paper)] px-3 py-2 text-[0.8rem] text-[var(--color-charcoal)] focus:border-[var(--color-clay)] focus:bg-white focus:outline-none"
        />
        <button
          type="button"
          onClick={addUrl}
          className="rounded-[6px] border border-[var(--color-clay)] px-3 py-2 font-mono text-[9px] font-semibold uppercase tracking-[0.06em] text-[var(--color-clay)] hover:bg-[var(--color-clay)] hover:text-white"
        >
          + add
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="rounded-[6px] border border-[var(--color-pearl)] px-3 py-2 font-mono text-[9px] font-semibold uppercase tracking-[0.06em] text-[var(--color-aged-oak)] hover:border-[var(--color-aged-oak)] hover:text-[var(--color-mocha)] disabled:opacity-50"
        >
          {uploading ? 'uploading…' : 'upload'}
        </button>
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
      </div>
      {err && <p className="mt-2 text-[0.7rem] text-[var(--color-terracotta)]">{err}</p>}
    </div>
  );
}
