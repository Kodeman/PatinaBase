'use client';

import { useState } from 'react';
import { useProductEdit } from '@patina/catalog-ui';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { AdminUnpublishDialog } from './admin-unpublish-dialog';
import { AdminDeleteDialog } from './admin-delete-dialog';

const STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  published: 'default',
  draft: 'secondary',
  in_review: 'outline',
  deprecated: 'destructive',
};

function formatRelative(date: Date | null): string {
  if (!date) return '';
  const diffMs = Date.now() - date.getTime();
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return date.toLocaleString();
}

export function AdminEditBar() {
  const {
    mode,
    setMode,
    isDirty,
    autoSaveStatus,
    lastSavedAt,
    publishChanges,
    unpublish,
    deleteProduct,
    saveNow,
    revert,
    draft,
    capabilities,
  } = useProductEdit();

  const [showUnpublish, setShowUnpublish] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  const statusDot =
    autoSaveStatus === 'saving'
      ? 'bg-[var(--color-golden-hour)]'
      : autoSaveStatus === 'error'
        ? 'bg-[var(--color-terracotta)]'
        : autoSaveStatus === 'saved'
          ? 'bg-[var(--color-sage)]'
          : isDirty
            ? 'bg-[var(--color-golden-hour)]'
            : 'bg-[var(--color-sage)]';

  const statusText =
    autoSaveStatus === 'saving'
      ? 'Saving…'
      : autoSaveStatus === 'error'
        ? 'Save failed'
        : isDirty
          ? 'Unsaved changes'
          : lastSavedAt
            ? `Saved ${formatRelative(lastSavedAt)}`
            : 'All changes saved';

  const productStatus = (draft.status as string) || 'draft';
  const isPublished = productStatus === 'published';

  return (
    <>
      <div className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(196,165,123,0.15)] bg-[rgba(196,165,123,0.06)] px-6 py-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 font-mono text-[0.62rem] uppercase tracking-[0.08em] text-[var(--accent-primary)]">
            <div className={`h-2 w-2 rounded-full ${statusDot} animate-pulse`} />
            {mode === 'edit' ? 'Edit Mode' : 'Preview'}
          </div>
          <Badge variant={STATUS_VARIANTS[productStatus] || 'secondary'} className="text-[10px]">
            {productStatus}
          </Badge>
          <span className="font-mono text-[0.58rem] uppercase tracking-[0.04em] text-[var(--text-muted)]">
            {statusText}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {isDirty && mode === 'edit' && (
            <button
              onClick={revert}
              className="cursor-pointer border-none bg-transparent font-body text-[0.72rem] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              Discard
            </button>
          )}

          {mode === 'edit' ? (
            <Button variant="outline" size="sm" onClick={() => setMode('present')}>
              Preview
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setMode('edit')}>
              Edit
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => void saveNow()}
            disabled={!isDirty || autoSaveStatus === 'saving'}
          >
            {autoSaveStatus === 'saving' && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
            Save
          </Button>

          {capabilities.canPublish && !isPublished && (
            <Button size="sm" onClick={() => void publishChanges()}>
              Publish
            </Button>
          )}

          {capabilities.canUnpublish && isPublished && (
            <Button variant="outline" size="sm" onClick={() => setShowUnpublish(true)}>
              Unpublish
            </Button>
          )}

          {capabilities.canDelete && (
            <Button variant="destructive" size="sm" onClick={() => setShowDelete(true)}>
              Delete
            </Button>
          )}
        </div>
      </div>

      {capabilities.canUnpublish && unpublish && (
        <AdminUnpublishDialog
          open={showUnpublish}
          onOpenChange={setShowUnpublish}
          onConfirm={async (reason) => {
            await unpublish(reason);
            setShowUnpublish(false);
          }}
          productName={draft.name}
        />
      )}

      {capabilities.canDelete && deleteProduct && (
        <AdminDeleteDialog
          open={showDelete}
          onOpenChange={setShowDelete}
          onConfirm={async () => {
            await deleteProduct();
            setShowDelete(false);
          }}
          productName={draft.name}
        />
      )}
    </>
  );
}
