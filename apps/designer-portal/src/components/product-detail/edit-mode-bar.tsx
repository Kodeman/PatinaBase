'use client';

import { useProductEdit } from './product-edit-context';
import { PortalButton } from '@/components/portal';

export function EditModeBar() {
  const { mode, setMode, isDirty, autoSaveStatus, publishChanges, revert } = useProductEdit();

  if (mode !== 'edit') return null;

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
      ? 'Saving...'
      : autoSaveStatus === 'error'
        ? 'Save failed'
        : autoSaveStatus === 'saved'
          ? 'Auto-saved'
          : isDirty
            ? 'Unsaved changes'
            : 'All changes saved';

  return (
    <div className="sticky top-0 z-30 flex items-center justify-between border-b border-[rgba(196,165,123,0.15)] bg-[rgba(196,165,123,0.06)] px-6 py-2">
      {/* Left: mode label */}
      <div className="flex items-center gap-2 font-mono text-[0.62rem] uppercase tracking-[0.08em] text-[var(--accent-primary)]">
        <div className={`h-2 w-2 rounded-full ${statusDot} animate-pulse`} />
        Edit Mode
      </div>

      {/* Right: status + actions */}
      <div className="flex items-center gap-3">
        <span className="font-mono text-[0.58rem] uppercase tracking-[0.04em] text-[var(--text-muted)]">
          {statusText}
        </span>

        {isDirty && (
          <button
            onClick={revert}
            className="cursor-pointer border-none bg-transparent font-body text-[0.72rem] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            Discard
          </button>
        )}

        <PortalButton
          variant="secondary"
          className="!px-3 !py-1.5 !text-[0.72rem]"
          onClick={() => setMode('present')}
        >
          Preview as Client
        </PortalButton>

        <PortalButton
          variant="primary"
          className="!bg-[var(--accent-primary)] !px-3 !py-1.5 !text-[0.72rem] !text-white"
          onClick={publishChanges}
        >
          Publish Changes
        </PortalButton>
      </div>
    </div>
  );
}
