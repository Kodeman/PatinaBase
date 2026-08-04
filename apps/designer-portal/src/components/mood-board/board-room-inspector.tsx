'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { resolveMoodBoardGeometry, unionBoardRects } from '@patina/design-system';
import type { BoardOwnerRef, BoardRect, EditableMoodBoardItem } from '@patina/types';
import { Button, Input, Select, Textarea } from '@/components/ui/controls';
import type { BoardRoomControllerApi } from '@/components/portal/scope-builder/board-room-controller';
import { BoardImageInspectorActions } from './board-image-inspector-actions';
import { BoardPaletteInspectorActions } from './board-palette-inspector-actions';
import { BoardScheduleInspectorAction } from './board-schedule-inspector-action';

const INSPECTOR_WIDTH = 286;
const INSPECTOR_GAP = 18;
const INSPECTOR_MARGIN = 8;

export interface BoardRoomInspectorPosition {
  left: number;
  top: number;
  horizontal: 'left' | 'right';
  vertical: 'above' | 'aligned';
}

export function resolveBoardRoomInspectorPosition({
  selection,
  view,
  workspace,
  panel,
  gap = INSPECTOR_GAP,
  margin = INSPECTOR_MARGIN,
}: {
  selection: BoardRect;
  view: { pan: { x: number; y: number }; zoom: number };
  workspace: { width: number; height: number };
  panel: { width: number; height: number };
  gap?: number;
  margin?: number;
}): BoardRoomInspectorPosition {
  const selectionLeft = view.pan.x + selection.x * view.zoom;
  const selectionTop = view.pan.y + selection.y * view.zoom;
  const selectionRight = selectionLeft + selection.width * view.zoom;
  const maxLeft = Math.max(margin, workspace.width - panel.width - margin);
  const maxTop = Math.max(margin, workspace.height - panel.height - margin);

  let horizontal: BoardRoomInspectorPosition['horizontal'] = 'right';
  let left = selectionRight + gap;
  if (left + panel.width > workspace.width - margin) {
    horizontal = 'left';
    left = selectionLeft - gap - panel.width;
  }

  let vertical: BoardRoomInspectorPosition['vertical'] = 'aligned';
  let top = selectionTop;
  if (top + panel.height > workspace.height - margin) {
    vertical = 'above';
    top = selectionTop - gap - panel.height;
  }

  return {
    left: Math.min(maxLeft, Math.max(margin, left)),
    top: Math.min(maxTop, Math.max(margin, top)),
    horizontal,
    vertical,
  };
}

function itemLabel(item: EditableMoodBoardItem, fallback: string): string {
  const name = item.data?.name;
  return typeof name === 'string' && name.trim() ? name : item.content?.trim() || fallback;
}

function safeSourceUrl(item: EditableMoodBoardItem): string | null {
  const value = item.data?.source_url;
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function NoteDraft({
  item,
  onCommit,
}: {
  item: EditableMoodBoardItem;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(item.content ?? '');
  useEffect(() => setDraft(item.content ?? ''), [item.content, item.id]);
  const commit = () => {
    if (draft !== (item.content ?? '')) onCommit(draft);
  };
  return (
    <label className="block text-[10px] text-[var(--text-muted)]">
      Note
      <Textarea
        value={draft}
        rows={3}
        className="mt-1"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
            commit();
            event.currentTarget.blur();
          }
          if (event.key === 'Escape') {
            setDraft(item.content ?? '');
            event.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}

export function BoardRoomInspector({
  api,
  owner,
  scopeRoomId = null,
  onOpenProduct,
  onReplaceImage,
  onCommand,
}: {
  api: BoardRoomControllerApi;
  owner?: BoardOwnerRef;
  scopeRoomId?: string | null;
  onOpenProduct?: (item: EditableMoodBoardItem) => void;
  onReplaceImage?: (item: EditableMoodBoardItem) => void;
  onCommand?: (kind: 'arrange' | 'content' | 'delete' | 'handle') => void;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const selected = useMemo(
    () => api.state?.items.filter((item) => api.selectedItemIds.includes(item.id)) ?? [],
    [api.selectedItemIds, api.state?.items],
  );
  const selectionBounds = useMemo(() => {
    if (!api.state || selected.length === 0) return null;
    const selectedIds = new Set(selected.map((item) => item.id));
    const geometry = resolveMoodBoardGeometry({
      canvasWidth: api.state.canvasWidth,
      canvasHeight: api.state.canvasHeight,
      backgroundColor: api.state.backgroundColor,
      sections: api.state.sections,
      items: api.state.items,
    });
    return unionBoardRects(
      geometry.items
        .filter((item) => item.id && selectedIds.has(item.id))
        .map((item) => item.aabb),
    );
  }, [api.state, selected]);
  const [position, setPosition] = useState<BoardRoomInspectorPosition | null>(null);

  useEffect(() => {
    const panel = panelRef.current;
    const workspace = panel?.parentElement;
    if (!panel || !workspace || !selectionBounds) return;
    const measure = () => {
      const workspaceRect = workspace.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      const next = resolveBoardRoomInspectorPosition({
        selection: selectionBounds,
        view: api.view,
        workspace: {
          width: workspaceRect.width || workspace.clientWidth || 800,
          height: workspaceRect.height || workspace.clientHeight || 600,
        },
        panel: {
          width: panelRect.width || panel.offsetWidth || INSPECTOR_WIDTH,
          height: panelRect.height || panel.offsetHeight || 320,
        },
      });
      setPosition((current) =>
        current && current.left === next.left && current.top === next.top &&
          current.horizontal === next.horizontal && current.vertical === next.vertical
          ? current
          : next,
      );
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(workspace);
    observer?.observe(panel);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [api.view, selectionBounds]);

  if (!api.state || api.mode !== 'edit' || selected.length === 0 || !selectionBounds) return null;
  const lead = selected[0];
  const multi = selected.length > 1;
  const sourceUrl = safeSourceUrl(lead);
  const sectionIds = selected.map((item) =>
    typeof item.data?.section_id === 'string' ? item.data.section_id : '',
  );
  const sharedSectionId = sectionIds.every((sectionId) => sectionId === sectionIds[0])
    ? sectionIds[0]
    : '__mixed__';
  const shouldLockSelection = selected.some((item) => !item.locked);

  const deleteSelection = () => {
    api.deleteItems();
    onCommand?.('delete');
  };

  return (
    <aside
      ref={panelRef}
      aria-label="Selected board item inspector"
      data-placement-horizontal={position?.horizontal}
      data-placement-vertical={position?.vertical}
      className="absolute z-40 w-[286px] max-w-[calc(100%-16px)] overflow-y-auto rounded-[6px] border border-[var(--border-default)] bg-[var(--bg-surface)] p-3 shadow-lg max-md:!bottom-2 max-md:!left-2 max-md:!right-2 max-md:!top-auto max-md:w-auto"
      style={{
        left: position?.left ?? INSPECTOR_MARGIN,
        top: position?.top ?? INSPECTOR_MARGIN,
        maxHeight: 'min(520px, calc(100% - 16px))',
        visibility: position ? 'visible' : 'hidden',
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-heading text-[14px] text-[var(--text-primary)]">
            {multi ? `${selected.length} pins` : itemLabel(lead, lead.type)}
          </p>
          <p className="font-mono text-[8px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
            {multi ? 'Selection' : lead.type.replace('_', ' ')}
          </p>
        </div>
        <button
          type="button"
          aria-label="Close inspector"
          onClick={() => api.setSelection([])}
          className="min-h-11 min-w-11 text-[var(--text-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-clay)]"
        >
          ×
        </button>
      </div>

      {multi ? (
        <div className="mt-3 space-y-3">
          <div>
            <p className="mb-1 font-mono text-[8px] uppercase text-[var(--text-muted)]">Align</p>
            <div className="grid grid-cols-3 gap-1">
              <Button size="sm" variant="ghost" onClick={() => { api.alignItems('left'); onCommand?.('arrange'); }}>Left</Button>
              <Button size="sm" variant="ghost" onClick={() => { api.alignItems('horizontal-center'); onCommand?.('arrange'); }}>Center</Button>
              <Button size="sm" variant="ghost" onClick={() => { api.alignItems('right'); onCommand?.('arrange'); }}>Right</Button>
              <Button size="sm" variant="ghost" onClick={() => { api.alignItems('top'); onCommand?.('arrange'); }}>Top</Button>
              <Button size="sm" variant="ghost" onClick={() => { api.alignItems('vertical-center'); onCommand?.('arrange'); }}>Middle</Button>
              <Button size="sm" variant="ghost" onClick={() => { api.alignItems('bottom'); onCommand?.('arrange'); }}>Bottom</Button>
            </div>
          </div>
          <div>
            <p className="mb-1 font-mono text-[8px] uppercase text-[var(--text-muted)]">Distribute</p>
            <div className="grid grid-cols-2 gap-1">
              <Button size="sm" variant="ghost" disabled={selected.length < 3} onClick={() => { api.distributeItems('horizontal-centers'); onCommand?.('arrange'); }}>H centers</Button>
              <Button size="sm" variant="ghost" disabled={selected.length < 3} onClick={() => { api.distributeItems('vertical-centers'); onCommand?.('arrange'); }}>V centers</Button>
              <Button size="sm" variant="ghost" disabled={selected.length < 3} onClick={() => { api.distributeItems('horizontal-gaps'); onCommand?.('arrange'); }}>H gaps</Button>
              <Button size="sm" variant="ghost" disabled={selected.length < 3} onClick={() => { api.distributeItems('vertical-gaps'); onCommand?.('arrange'); }}>V gaps</Button>
            </div>
          </div>
          <label className="block text-[9px] uppercase text-[var(--text-muted)]">
            Section
            <Select
              className="mt-1"
              value={sharedSectionId}
              onChange={(event) => api.setItemsSectionMembership(
                selected.map((item) => item.id),
                event.target.value || null,
              )}
            >
              {sharedSectionId === '__mixed__' && <option value="__mixed__" disabled>Mixed sections</option>}
              <option value="">No section</option>
              {api.state.sections.map((section) => (
                <option key={section.id} value={section.id}>{section.name}</option>
              ))}
            </Select>
          </label>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => api.toggleLock(selected.map((item) => item.id))}
          >
            {shouldLockSelection ? `Lock ${selected.length} pins` : `Unlock ${selected.length} pins`}
          </Button>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[9px] uppercase text-[var(--text-muted)]">
              Width
              <Input
                key={`${lead.id}:width:${lead.width}`}
                type="number"
                min={40}
                defaultValue={Math.round(lead.width)}
                className="mt-1"
                onBlur={(event) => {
                  const width = Number(event.currentTarget.value);
                  if (Number.isFinite(width) && width >= 40 && width !== lead.width) {
                    api.updateItem(lead.id, { width });
                    onCommand?.('handle');
                  }
                }}
              />
            </label>
            <label className="text-[9px] uppercase text-[var(--text-muted)]">
              Rotation
              <Input
                key={`${lead.id}:rotation:${lead.rotation ?? 0}`}
                type="number"
                defaultValue={Math.round(lead.rotation ?? 0)}
                className="mt-1"
                onBlur={(event) => {
                  const rotation = Number(event.currentTarget.value);
                  if (Number.isFinite(rotation) && rotation !== (lead.rotation ?? 0)) {
                    api.rotateItem(lead.id, rotation);
                    onCommand?.('handle');
                  }
                }}
              />
            </label>
          </div>

          {lead.height != null && (
            <Button size="sm" variant="ghost" onClick={() => { api.updateItem(lead.id, { height: null }); onCommand?.('handle'); }}>
              Reset height to auto
            </Button>
          )}

          {lead.type === 'note' && (
            <NoteDraft
              item={lead}
              onCommit={(content) => {
                api.updateItem(lead.id, { content });
                onCommand?.('content');
              }}
            />
          )}

          <label className="block text-[9px] uppercase text-[var(--text-muted)]">
            Section
            <Select
              className="mt-1"
              value={typeof lead.data?.section_id === 'string' ? lead.data.section_id : ''}
              onChange={(event) => api.setSectionMembership(lead.id, event.target.value || null)}
            >
              <option value="">No section</option>
              {api.state.sections.map((section) => (
                <option key={section.id} value={section.id}>{section.name}</option>
              ))}
            </Select>
          </label>

          <div className="grid grid-cols-2 gap-1">
            <Button size="sm" variant="ghost" onClick={() => api.changeZOrder('forward')}>Forward</Button>
            <Button size="sm" variant="ghost" onClick={() => api.changeZOrder('backward')}>Backward</Button>
            <Button size="sm" variant="ghost" onClick={() => api.changeZOrder('front')}>To front</Button>
            <Button size="sm" variant="ghost" onClick={() => api.changeZOrder('back')}>To back</Button>
          </div>

          <Button size="sm" variant="ghost" onClick={() => api.toggleLock([lead.id])}>
            {lead.locked ? 'Unlock pin' : 'Lock pin'}
          </Button>

          <BoardImageInspectorActions
            boardId={api.state.boardId}
            item={lead}
            onUpdate={(itemId, patch) => {
              api.updateItem(itemId, patch);
              onCommand?.('content');
            }}
          />

          <BoardPaletteInspectorActions
            item={lead}
            onUpdate={(data) => {
              api.updateItem(lead.id, { data });
              onCommand?.('content');
            }}
          />

          {owner?.kind === 'proposal' && (lead.type === 'product' || lead.type === 'capture') && (
            <BoardScheduleInspectorAction
              proposalId={owner.id}
              scopeRoomId={scopeRoomId}
              item={lead}
            />
          )}

          {onOpenProduct && lead.productId && (lead.type === 'product' || lead.type === 'capture') && (
            <Button size="sm" variant="ghost" onClick={() => onOpenProduct(lead)}>
              Open product
            </Button>
          )}

          {onReplaceImage && (lead.type === 'image' || lead.type === 'room_scan') && (
            <Button size="sm" variant="ghost" onClick={() => onReplaceImage(lead)}>
              Replace image
            </Button>
          )}

          {sourceUrl && (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="block truncate text-[11px] text-[var(--color-clay)] underline underline-offset-2"
            >
              Open source
            </a>
          )}
        </div>
      )}

      <div className="mt-3 border-t border-[var(--border-default)] pt-2">
        <Button size="sm" variant="ghost" onClick={deleteSelection}>Delete</Button>
      </div>
    </aside>
  );
}
