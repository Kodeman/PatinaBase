'use client';

/**
 * US-37 #1 + #2: the line's own pictures, in the unfold (00807).
 *
 * The pictures are the item's, not the library piece's: a snapshot taken when
 * the piece landed on the job, plus uploads, plus any the designer picks from
 * the library piece afterwards. One is primary — the one the item list, the
 * plate, the spec book and the client presentation show. Unlinking takes the
 * picture off the line; the stored file stays.
 *
 * Every act is a DocumentAction and every move is a keyboard act (Earlier /
 * Later), so nothing here needs a drag. Hairlines and type only — no shadow,
 * no badge (D4).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FFE_ITEM_IMAGE_TYPES,
  useAddFfeItemImage,
  useFfeItemImages,
  useReorderFfeItemImages,
  useSetFfeItemPrimaryImage,
  useUnlinkFfeItemImage,
  useUploadFfeItemImage,
  type FfeItemImage,
} from '@patina/supabase';
import { DocumentAction } from '../document-action';

export const UNLINK_COPY = 'Unlink — the file stays';
const REGION = 'ffe-line-pictures';
const SAVE_FAILED = "That didn't save. Try again.";

type PicturesItem = {
  id: string;
  name?: string | null;
  product_id?: string | null;
  product?: { images?: unknown } | null;
};

/** The RPCs refuse in plain sentences (00807); anything else gets ours. */
function refusalSentence(error: unknown): string {
  const record = error as { code?: unknown; message?: unknown } | null;
  const message = typeof record?.message === 'string' ? record.message : '';
  return typeof record?.code === 'string' && /^[A-Z].*\.$/.test(message)
    ? message
    : SAVE_FAILED;
}

function libraryImages(item: PicturesItem): string[] {
  const images = item.product?.images;
  return Array.isArray(images)
    ? images.filter((url): url is string => typeof url === 'string' && url.length > 0)
    : [];
}

export function ItemPictures({
  item,
  projectId,
  canEdit,
}: {
  item: PicturesItem;
  projectId: string;
  canEdit: boolean;
}) {
  const itemId = String(item.id);
  const { data: images, isLoading } = useFfeItemImages(itemId);
  const add = useAddFfeItemImage();
  const upload = useUploadFfeItemImage();
  const setPrimary = useSetFfeItemPrimaryImage();
  const reorder = useReorderFfeItemImages();
  const unlink = useUnlinkFfeItemImage();

  const [notice, setNotice] = useState<string | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  // A move shows at once; the refetch takes over when it lands.
  const [pendingOrder, setPendingOrder] = useState<string[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    setPendingOrder(null);
  }, [images]);

  const ordered = useMemo(() => {
    const rows = images ?? [];
    if (!pendingOrder) return rows;
    const byId = new Map(rows.map((row) => [row.id, row]));
    return pendingOrder.flatMap((id) => byId.get(id) ?? []);
  }, [images, pendingOrder]);

  const busy =
    uploading ||
    add.isPending ||
    setPrimary.isPending ||
    reorder.isPending ||
    unlink.isPending;
  const name = item.name ?? 'this piece';
  const hasProduct = Boolean(item.product_id);
  const linked = new Set(ordered.map((image) => image.url));
  const fromLibrary = libraryImages(item).filter((url) => !linked.has(url));

  const run = async (act: () => Promise<unknown>) => {
    setNotice(null);
    try {
      await act();
    } catch (error) {
      setNotice(refusalSentence(error));
    }
  };

  const move = (image: FfeItemImage, index: number, step: -1 | 1) => {
    const ids = ordered.map((row) => row.id);
    const target = index + step;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    setPendingOrder(ids);
    // The moved picture keeps the keyboard: React may re-insert its node,
    // which drops focus, so put it back on the same act.
    const act = step < 0 ? 'earlier' : 'later';
    window.requestAnimationFrame(() => {
      listRef.current
        ?.querySelector<HTMLElement>(`[data-picture-act="${act}-${image.id}"]`)
        ?.focus();
    });
    void run(async () => {
      try {
        await reorder.mutateAsync({ projectId, itemId, imageIds: ids });
      } catch (error) {
        setPendingOrder(null);
        throw error;
      }
    });
  };

  const onFiles = async (files: FileList | null) => {
    const picked = Array.from(files ?? []);
    if (fileRef.current) fileRef.current.value = '';
    if (picked.length === 0) return;
    setNotice(null);
    setUploading(true);
    const refused: string[] = [];
    let failure: string | null = null;
    // One at a time, so each lands after the last in the order chosen.
    for (const file of picked) {
      if (!FFE_ITEM_IMAGE_TYPES[file.type]) {
        refused.push(file.name);
        continue;
      }
      try {
        await upload.mutateAsync({ projectId, itemId, file });
      } catch (error) {
        failure = refusalSentence(error);
        break;
      }
    }
    setUploading(false);
    const sentences = [
      refused.length > 0
        ? `${refused.join(', ')} ${refused.length === 1 ? 'is' : 'are'} not a JPEG, PNG, WebP or AVIF picture, so ${refused.length === 1 ? 'it was' : 'they were'} not added.`
        : null,
      failure,
    ].filter(Boolean);
    if (sentences.length > 0) setNotice(sentences.join(' '));
  };

  if (isLoading && !images) return null;
  if (!canEdit && ordered.length === 0) return null;

  const total = ordered.length;

  return (
    <section
      aria-labelledby={`pictures-head-${itemId}`}
      data-testid="line-pictures"
      className="mb-3 border border-[var(--color-pearl)] bg-[var(--doc-paper)] p-3"
    >
      <h4
        id={`pictures-head-${itemId}`}
        className="t-head text-[var(--color-clay-ink)]"
      >
        Pictures
      </h4>
      <p className="t-body-sm text-[var(--text-muted)]">
        {total === 0
          ? 'No pictures on this piece yet.'
          : 'The primary is the one the item list and the client presentation show.'}
      </p>

      {total > 0 && (
        <ol
          ref={listRef}
          aria-label={`Pictures of ${name}`}
          className="mt-2 grid list-none grid-cols-1 gap-px border border-[var(--color-pearl)] bg-[var(--color-pearl)] sm:grid-cols-2 lg:grid-cols-3"
        >
          {ordered.map((image, index) => {
            const position = `Picture ${index + 1} of ${total}`;
            return (
              <li
                key={image.id}
                data-testid="line-picture"
                data-primary={image.is_primary ? 'true' : undefined}
                className="flex min-w-0 gap-3 bg-[var(--doc-paper)] p-2"
              >
                <img
                  src={image.url}
                  alt={`${position} of ${name}${image.is_primary ? ', primary' : ''}`}
                  loading="lazy"
                  decoding="async"
                  className={`h-[72px] w-[72px] shrink-0 border object-cover ${
                    image.is_primary
                      ? 'border-[var(--color-charcoal)]'
                      : 'border-[var(--color-pearl)]'
                  }`}
                />
                <div
                  role="group"
                  aria-label={`${position}${image.is_primary ? ', primary' : ''}`}
                  className="flex min-w-0 flex-wrap content-start items-center gap-x-1"
                >
                  {image.is_primary ? (
                    <span className="t-meta inline-flex min-h-[44px] items-center px-[6px] uppercase text-[var(--color-charcoal)]">
                      Primary
                    </span>
                  ) : (
                    canEdit && (
                      <DocumentAction
                        actionKey="make-ffe-picture-primary"
                        regionKey={REGION}
                        variant="secondary"
                        disabled={busy}
                        onClick={() =>
                          run(() =>
                            setPrimary.mutateAsync({ projectId, itemId, imageId: image.id }),
                          )
                        }
                      >
                        Make primary
                      </DocumentAction>
                    )
                  )}
                  {canEdit && total > 1 && (
                    <>
                      <DocumentAction
                        actionKey="move-ffe-picture-earlier"
                        regionKey={REGION}
                        variant="tertiary"
                        data-picture-act={`earlier-${image.id}`}
                        disabled={busy || index === 0}
                        held
                        onClick={() => move(image, index, -1)}
                      >
                        Earlier
                      </DocumentAction>
                      <DocumentAction
                        actionKey="move-ffe-picture-later"
                        regionKey={REGION}
                        variant="tertiary"
                        data-picture-act={`later-${image.id}`}
                        disabled={busy || index === total - 1}
                        held
                        onClick={() => move(image, index, 1)}
                      >
                        Later
                      </DocumentAction>
                    </>
                  )}
                  {canEdit && (
                    <DocumentAction
                      actionKey="unlink-ffe-picture"
                      regionKey={REGION}
                      variant="tertiary"
                      disabled={busy}
                      onClick={() =>
                        run(() => unlink.mutateAsync({ projectId, itemId, imageId: image.id }))
                      }
                    >
                      {UNLINK_COPY}
                    </DocumentAction>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {canEdit && (
        <div className="mt-2 flex flex-wrap items-center gap-x-1">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            tabIndex={-1}
            data-testid="line-pictures-file"
            onChange={(event) => void onFiles(event.target.files)}
          />
          <DocumentAction
            actionKey="upload-ffe-pictures"
            regionKey={REGION}
            variant="secondary"
            loading={uploading}
            loadingLabel="Uploading"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            Upload pictures
          </DocumentAction>
          {hasProduct && (
            <DocumentAction
              actionKey="open-ffe-library-pictures"
              regionKey={REGION}
              variant="tertiary"
              aria-expanded={libraryOpen}
              aria-controls={`library-pictures-${itemId}`}
              onClick={() => setLibraryOpen((open) => !open)}
            >
              From the library item
            </DocumentAction>
          )}
        </div>
      )}

      {canEdit && hasProduct && libraryOpen && (
        <div id={`library-pictures-${itemId}`} className="mt-2 border-t border-[var(--color-pearl)] pt-2">
          {fromLibrary.length === 0 ? (
            <p className="t-body-sm text-[var(--text-muted)]">
              Every picture on the library item is already on this piece.
            </p>
          ) : (
            <ul
              aria-label="Library item pictures not on this piece"
              className="flex list-none flex-wrap gap-3"
            >
              {fromLibrary.map((url, index) => (
                <li key={url} className="flex items-center gap-1">
                  <img
                    src={url}
                    alt={`Library picture ${index + 1} of ${name}`}
                    loading="lazy"
                    decoding="async"
                    className="h-14 w-14 border border-[var(--color-pearl)] object-cover"
                  />
                  <DocumentAction
                    actionKey="add-ffe-library-picture"
                    regionKey={REGION}
                    variant="secondary"
                    aria-label={`Add library picture ${index + 1}`}
                    disabled={busy}
                    onClick={() =>
                      run(() =>
                        add.mutateAsync({
                          projectId,
                          itemId,
                          url,
                          source: 'library',
                          sourceProductId: item.product_id ?? null,
                        }),
                      )
                    }
                  >
                    Add
                  </DocumentAction>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {notice && (
        <p role="status" className="t-body-sm mt-2 text-[var(--color-terracotta-ink)]">
          {notice}
        </p>
      )}
    </section>
  );
}
