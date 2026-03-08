'use client';

import * as React from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Lightbox from 'yet-another-react-lightbox';
import Zoom from 'yet-another-react-lightbox/plugins/zoom';
import Fullscreen from 'yet-another-react-lightbox/plugins/fullscreen';
import 'yet-another-react-lightbox/styles.css';
import {
  Star,
  Trash2,
  GripVertical,
  Eye,
  Maximize2,
  Download,
} from 'lucide-react';
import {
  Badge,
  Button,
  Checkbox
} from '@patina/design-system';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@patina/design-system';
import { cn } from '@patina/utils';
import Image from 'next/image';

export interface GalleryImage {
  id: string;
  url: string;
  thumbnailUrl?: string;
  alt?: string;
  isPrimary?: boolean;
  order: number;
  width?: number;
  height?: number;
}

export interface ImageGalleryProps {
  images: GalleryImage[];
  onReorder: (images: GalleryImage[]) => void;
  onSetPrimary: (imageId: string) => void;
  onDelete: (imageId: string) => void;
  onBulkDelete?: (imageIds: string[]) => void;
  className?: string;
  readonly?: boolean;
}

interface SortableImageProps {
  image: GalleryImage;
  isSelected: boolean;
  onSelect: (id: string, checked: boolean) => void;
  onSetPrimary: (id: string) => void;
  onDelete: (id: string) => void;
  onView: (id: string) => void;
  readonly?: boolean;
}

function SortableImage({
  image,
  isSelected,
  onSelect,
  onSetPrimary,
  onDelete,
  onView,
  readonly = false,
}: SortableImageProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: image.id, disabled: readonly });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'relative group rounded-lg overflow-hidden border-2 transition-all',
        image.isPrimary && 'border-primary shadow-md',
        !image.isPrimary && 'border-border hover:border-primary/50',
        isDragging && 'opacity-50 z-50',
        isSelected && 'ring-2 ring-primary'
      )}
    >
      {/* Image */}
      <div className="aspect-square bg-muted relative">
        <Image
          src={image.thumbnailUrl || image.url}
          alt={image.alt || 'Product image'}
          fill
          className="object-cover"
          sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
        />
      </div>

      {/* Overlay Controls */}
      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
        {/* Selection Checkbox */}
        {!readonly && (
          <div className="absolute top-2 left-2 z-10">
            <Checkbox
              checked={isSelected}
              onCheckedChange={(checked) => onSelect(image.id, checked as boolean)}
              className="bg-white border-white data-[state=checked]:bg-primary data-[state=checked]:border-primary"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}

        {/* Drag Handle */}
        {!readonly && (
          <button
            {...attributes}
            {...listeners}
            className="absolute top-2 right-2 z-10 p-1.5 rounded bg-white/90 hover:bg-white transition-colors cursor-grab active:cursor-grabbing"
            aria-label="Drag to reorder"
          >
            <GripVertical className="w-4 h-4 text-gray-700" />
          </button>
        )}

        {/* Action Buttons */}
        <Button
          size="sm"
          variant="secondary"
          onClick={() => onView(image.id)}
          className="h-8 w-8 p-0"
          title="View full size"
        >
          <Maximize2 className="w-4 h-4" />
        </Button>

        {!readonly && (
          <>
            <Button
              size="sm"
              variant={image.isPrimary ? 'default' : 'secondary'}
              onClick={() => onSetPrimary(image.id)}
              className="h-8 w-8 p-0"
              title="Set as primary"
            >
              <Star
                className={cn(
                  'w-4 h-4',
                  image.isPrimary && 'fill-current'
                )}
              />
            </Button>

            <Button
              size="sm"
              variant="destructive"
              onClick={() => onDelete(image.id)}
              className="h-8 w-8 p-0"
              title="Delete image"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </>
        )}
      </div>

      {/* Primary Badge */}
      {image.isPrimary && (
        <div className="absolute top-2 left-2 z-0">
          <Badge variant="default" className="text-xs font-medium">
            Primary
          </Badge>
        </div>
      )}

      {/* Order Badge */}
      <div className="absolute bottom-2 right-2">
        <Badge variant="secondary" className="text-xs">
          {image.order + 1}
        </Badge>
      </div>

      {/* Dimensions */}
      {image.width && image.height && (
        <div className="absolute bottom-2 left-2">
          <Badge variant="outline" className="text-xs bg-black/50 text-white border-white/20">
            {image.width} × {image.height}
          </Badge>
        </div>
      )}
    </div>
  );
}

export function ImageGallery({
  images,
  onReorder,
  onSetPrimary,
  onDelete,
  onBulkDelete,
  className,
  readonly = false,
}: ImageGalleryProps) {
  const [items, setItems] = React.useState(images);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = React.useState<number>(-1);
  const [deleteConfirmId, setDeleteConfirmId] = React.useState<string | null>(null);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = React.useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Update items when images prop changes
  React.useEffect(() => {
    setItems(images);
  }, [images]);

  // Handle drag start
  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  // Handle drag end
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = items.findIndex((item) => item.id === active.id);
      const newIndex = items.findIndex((item) => item.id === over.id);

      const reorderedItems = arrayMove(items, oldIndex, newIndex).map(
        (item, index) => ({
          ...item,
          order: index,
        })
      );

      setItems(reorderedItems);
      onReorder(reorderedItems);
    }

    setActiveId(null);
  };

  // Handle view image
  const handleView = (imageId: string) => {
    const index = items.findIndex((item) => item.id === imageId);
    setLightboxIndex(index);
  };

  // Handle delete
  const handleDelete = (imageId: string) => {
    setDeleteConfirmId(imageId);
  };

  const confirmDelete = () => {
    if (deleteConfirmId) {
      onDelete(deleteConfirmId);
      setDeleteConfirmId(null);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(deleteConfirmId);
        return next;
      });
    }
  };

  // Handle selection
  const handleSelect = (imageId: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(imageId);
      } else {
        next.delete(imageId);
      }
      return next;
    });
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(items.map((item) => item.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  // Handle bulk delete
  const handleBulkDelete = () => {
    setShowBulkDeleteConfirm(true);
  };

  const confirmBulkDelete = () => {
    if (onBulkDelete && selectedIds.size > 0) {
      onBulkDelete(Array.from(selectedIds));
      setSelectedIds(new Set());
    } else {
      // Fallback to individual deletes
      selectedIds.forEach((id) => onDelete(id));
      setSelectedIds(new Set());
    }
    setShowBulkDeleteConfirm(false);
  };

  // Prepare lightbox slides
  const lightboxSlides = items.map((image) => ({
    src: image.url,
    alt: image.alt || 'Product image',
    width: image.width,
    height: image.height,
  }));

  const activeItem = activeId ? items.find((item) => item.id === activeId) : null;

  if (items.length === 0) {
    return (
      <div className={cn('text-center py-12', className)}>
        <Eye className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-sm text-muted-foreground">No images yet</p>
      </div>
    );
  }

  return (
    <>
      <div className={cn('space-y-4', className)}>
        {/* Header with bulk actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {!readonly && (
              <Checkbox
                checked={selectedIds.size === items.length && items.length > 0}
                onCheckedChange={handleSelectAll}
                aria-label="Select all images"
              />
            )}
            <p className="text-sm font-medium">
              {items.length} image{items.length !== 1 ? 's' : ''}
              {selectedIds.size > 0 && (
                <span className="ml-2 text-muted-foreground">
                  ({selectedIds.size} selected)
                </span>
              )}
            </p>
          </div>

          {!readonly && selectedIds.size > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleBulkDelete}
            >
              <Trash2 className="w-3 h-3 mr-1" />
              Delete {selectedIds.size} image{selectedIds.size !== 1 ? 's' : ''}
            </Button>
          )}
        </div>

        {/* Gallery Grid */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={items.map((i) => i.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {items.map((image) => (
                <SortableImage
                  key={image.id}
                  image={image}
                  isSelected={selectedIds.has(image.id)}
                  onSelect={handleSelect}
                  onSetPrimary={onSetPrimary}
                  onDelete={handleDelete}
                  onView={handleView}
                  readonly={readonly}
                />
              ))}
            </div>
          </SortableContext>

          {/* Drag Overlay */}
          <DragOverlay>
            {activeId && activeItem ? (
              <div className="relative w-48 h-48 rounded-lg overflow-hidden border-2 border-primary shadow-xl opacity-80">
                <Image
                  src={activeItem.thumbnailUrl || activeItem.url}
                  alt={activeItem.alt || 'Dragging'}
                  fill
                  className="object-cover"
                  sizes="192px"
                />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      {/* Lightbox */}
      <Lightbox
        open={lightboxIndex >= 0}
        index={lightboxIndex}
        close={() => setLightboxIndex(-1)}
        slides={lightboxSlides}
        plugins={[Zoom, Fullscreen]}
        zoom={{
          maxZoomPixelRatio: 3,
          zoomInMultiplier: 2,
        }}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteConfirmId !== null} onOpenChange={() => setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Image?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the image.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog open={showBulkDeleteConfirm} onOpenChange={setShowBulkDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} Images?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete {selectedIds.size} selected image
              {selectedIds.size !== 1 ? 's' : ''}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmBulkDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
