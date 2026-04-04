'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  horizontalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { useProductEdit, type ProductImage } from './product-edit-context';
import { GalleryThumbnail } from './gallery-thumbnail';
import { UploadZone } from '@/components/portal';
import { useToast } from '@/components/portal/toast-provider';
import { ModelViewer } from './model-viewer';

export function HeroGallery() {
  const { mode, draft, updateImages } = useProductEdit();
  const { toast } = useToast();
  const [activeIndex, setActiveIndex] = useState(0);
  const [show3D, setShow3D] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const images = draft.images;
  const activeImage = images[activeIndex];
  const has3D = draft.has3D && draft.arModelUrl;

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (lightboxOpen && e.key === 'Escape') {
        setLightboxOpen(false);
        return;
      }
      if (e.key === 'ArrowLeft') {
        setActiveIndex((i) => Math.max(0, i - 1));
      } else if (e.key === 'ArrowRight') {
        setActiveIndex((i) => Math.min(images.length - 1, i + 1));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [images.length, lightboxOpen]);

  // dnd-kit sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = Number(String(active.id).replace('thumb-', ''));
      const newIndex = Number(String(over.id).replace('thumb-', ''));
      const reordered = arrayMove([...images], oldIndex, newIndex).map((img, i) => ({
        ...img,
        order: i,
        type: i === 0 ? ('hero' as const) : img.type === 'hero' ? ('lifestyle' as const) : img.type,
      }));
      updateImages(reordered);
      setActiveIndex(newIndex);
    },
    [images, updateImages]
  );

  const handleSetHero = useCallback(
    (index: number) => {
      const reordered = [...images];
      const [item] = reordered.splice(index, 1);
      reordered.unshift({ ...item, type: 'hero' });
      const updated = reordered.map((img, i) => ({
        ...img,
        order: i,
        type: i === 0 ? ('hero' as const) : img.type === 'hero' ? ('lifestyle' as const) : img.type,
      }));
      updateImages(updated);
      setActiveIndex(0);
    },
    [images, updateImages]
  );

  const handleRetag = useCallback(
    (index: number, type: string) => {
      const updated = images.map((img, i) =>
        i === index ? { ...img, type: type as ProductImage['type'] } : img
      );
      updateImages(updated);
    },
    [images, updateImages]
  );

  const handleRemove = useCallback(
    (index: number) => {
      const removed = images[index];
      const updated = images.filter((_, i) => i !== index);
      updateImages(updated);
      if (activeIndex >= updated.length) setActiveIndex(Math.max(0, updated.length - 1));
      toast('Image removed. Undo?', 'warning');
      // In a full implementation, the toast would include an undo action
      void removed; // suppress unused
    },
    [images, updateImages, activeIndex, toast]
  );

  const handleUpload = useCallback(
    (files: File[]) => {
      // TODO: upload to media service, for now create placeholder entries
      const newImages: ProductImage[] = files.map((file, i) => ({
        url: URL.createObjectURL(file),
        alt: file.name,
        type: 'lifestyle' as const,
        order: images.length + i,
      }));
      updateImages([...images, ...newImages]);
      toast(`${files.length} image(s) added`, 'success');
    },
    [images, updateImages, toast]
  );

  return (
    <div className="mb-6">
      {/* Hero Image / 3D Viewer */}
      <div
        className="relative flex aspect-[4/3] cursor-pointer items-center justify-center overflow-hidden rounded-lg bg-[var(--color-pearl)]"
        onClick={() => !show3D && setLightboxOpen(true)}
      >
        {show3D && has3D ? (
          <ModelViewer
            glbUrl={draft.arModelUrl!}
            usdzUrl={draft.arModelUrl?.replace('.glb', '.usdz')}
          />
        ) : activeImage?.url ? (
          <img
            src={activeImage.url}
            alt={activeImage.alt || 'Product image'}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="type-meta text-center">
            Hero Product Image
            <br />
            <span className="text-[0.6rem] opacity-70">{draft.name}</span>
          </span>
        )}

        {/* Image counter */}
        {!show3D && images.length > 1 && (
          <div className="absolute right-5 top-5 rounded-full bg-[rgba(44,41,38,0.5)] px-2.5 py-0.5 font-mono text-[0.6rem] tracking-[0.04em] text-white">
            {activeIndex + 1} / {images.length}
          </div>
        )}

        {/* 3D toggle button */}
        {has3D && (
          <button
            className="absolute bottom-5 left-5 flex cursor-pointer items-center gap-1.5 rounded border-none bg-[rgba(44,41,38,0.6)] px-3 py-2 font-body text-[0.72rem] font-medium text-white backdrop-blur-sm"
            onClick={(e) => {
              e.stopPropagation();
              setShow3D(!show3D);
            }}
          >
            ◇ {show3D ? 'View Photos' : 'View in 3D'}
          </button>
        )}

        {/* Dot navigation */}
        {!show3D && images.length > 1 && (
          <div className="absolute bottom-5 right-5 flex gap-1">
            {images.map((_, i) => (
              <button
                key={i}
                className={`h-2 w-2 cursor-pointer rounded-full border-none ${
                  i === activeIndex ? 'bg-white' : 'bg-[rgba(255,255,255,0.4)]'
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveIndex(i);
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Thumbnail strip */}
      {images.length > 0 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {mode === 'edit' ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={images.map((_, i) => `thumb-${i}`)}
                strategy={horizontalListSortingStrategy}
              >
                {images.map((img, i) => (
                  <GalleryThumbnail
                    key={`thumb-${i}`}
                    image={img}
                    index={i}
                    isActive={i === activeIndex}
                    isEditMode
                    isHero={i === 0}
                    onClick={() => setActiveIndex(i)}
                    onSetHero={() => handleSetHero(i)}
                    onRetag={(type) => handleRetag(i, type)}
                    onRemove={() => handleRemove(i)}
                  />
                ))}
              </SortableContext>
            </DndContext>
          ) : (
            images.map((img, i) => (
              <GalleryThumbnail
                key={i}
                image={img}
                index={i}
                isActive={i === activeIndex}
                isEditMode={false}
                isHero={i === 0}
                onClick={() => setActiveIndex(i)}
              />
            ))
          )}

          {/* Upload zone in edit mode */}
          {mode === 'edit' && (
            <div className="shrink-0">
              <UploadZone
                onFiles={handleUpload}
                accept="image/*"
                className="!flex !h-[54px] !w-[72px] !items-center !justify-center !rounded !border-dashed !border-[var(--color-pearl)] !p-1"
              />
            </div>
          )}
        </div>
      )}

      {/* Edit mode: image type reference */}
      {mode === 'edit' && (
        <div className="mt-3 flex flex-wrap gap-3 rounded-md border border-[rgba(139,156,173,0.12)] bg-[rgba(139,156,173,0.04)] px-4 py-2.5">
          <span className="font-mono text-[0.52rem] uppercase tracking-[0.06em] text-[var(--color-dusty-blue)]">
            Image types:
          </span>
          {[
            { type: 'hero', label: 'Hero', desc: 'Main product shot' },
            { type: 'lifestyle', label: 'Lifestyle', desc: 'In context / angles' },
            { type: 'detail', label: 'Detail', desc: 'Close-ups / joints' },
            { type: 'material', label: 'Material', desc: 'Texture swatches' },
            { type: 'model', label: '3D', desc: 'AR models' },
          ].map(({ type, label, desc }) => (
            <span key={type} className="flex items-center gap-1">
              <span
                className={`rounded-sm px-1.5 py-0.5 font-mono text-[0.42rem] uppercase tracking-[0.04em] ${
                  type === 'hero'
                    ? 'bg-[var(--accent-primary)] text-white'
                    : type === 'lifestyle'
                      ? 'bg-[var(--color-sage)] text-white'
                      : type === 'detail'
                        ? 'bg-[var(--color-dusty-blue)] text-white'
                        : type === 'material'
                          ? 'bg-[var(--color-aged-oak)] text-white'
                          : 'bg-[var(--text-primary)] text-[var(--bg-primary)]'
                }`}
              >
                {label}
              </span>
              <span className="font-mono text-[0.48rem] uppercase tracking-[0.06em] text-[var(--text-muted)]">
                {desc}
              </span>
            </span>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightboxOpen && activeImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(44,41,38,0.9)]"
          onClick={() => setLightboxOpen(false)}
        >
          <button
            className="absolute right-6 top-6 cursor-pointer border-none bg-transparent text-2xl text-white"
            onClick={() => setLightboxOpen(false)}
          >
            ✕
          </button>
          {activeImage.url ? (
            <img
              src={activeImage.url}
              alt={activeImage.alt || ''}
              className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="type-meta text-white">No image available</span>
          )}
        </div>
      )}
    </div>
  );
}
