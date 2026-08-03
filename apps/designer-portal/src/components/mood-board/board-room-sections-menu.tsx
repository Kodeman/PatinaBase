'use client';

import { useState } from 'react';
import { Button, Input } from '@/components/ui/controls';
import type { BoardRoomControllerApi } from '@/components/portal/scope-builder/board-room-controller';
import { newSectionId } from '@/components/portal/scope-builder/board-arrange';

function SectionRow({
  api,
  section,
  index,
}: {
  api: BoardRoomControllerApi;
  section: { id: string; name: string; color?: string };
  index: number;
}) {
  const [draft, setDraft] = useState(section.name);
  const commit = () => {
    const name = draft.trim();
    if (name && name !== section.name) {
      api.updateSections({ type: 'update', sectionId: section.id, patch: { name } });
    } else {
      setDraft(section.name);
    }
  };
  const move = (offset: -1 | 1) => {
    if (!api.state) return;
    const ids = api.state.sections.map((candidate) => candidate.id);
    const target = index + offset;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    api.updateSections({ type: 'reorder', orderedIds: ids });
  };
  return (
    <li className="flex items-center gap-1">
      <Input
        value={draft}
        aria-label={`Rename ${section.name}`}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape') {
            setDraft(section.name);
            event.currentTarget.blur();
          }
        }}
      />
      <button type="button" aria-label={`Move ${section.name} up`} disabled={index === 0} onClick={() => move(-1)} className="min-h-11 min-w-9 disabled:opacity-30">↑</button>
      <button type="button" aria-label={`Move ${section.name} down`} disabled={index === (api.state?.sections.length ?? 0) - 1} onClick={() => move(1)} className="min-h-11 min-w-9 disabled:opacity-30">↓</button>
      <button type="button" aria-label={`Delete ${section.name}`} onClick={() => api.updateSections({ type: 'delete', sectionId: section.id })} className="min-h-11 min-w-9">×</button>
    </li>
  );
}

export function BoardRoomSectionsMenu({
  api,
  showGrid,
  snapToGrid,
  onToggleGrid,
  onToggleSnap,
  tidyEnabled,
  onTidy,
  onSaveTemplate,
}: {
  api: BoardRoomControllerApi;
  showGrid: boolean;
  snapToGrid: boolean;
  onToggleGrid: () => void;
  onToggleSnap: () => void;
  tidyEnabled: boolean;
  onTidy: () => void;
  onSaveTemplate: () => void;
}) {
  const [newName, setNewName] = useState('');
  if (!api.state || api.mode !== 'edit') return null;
  const add = () => {
    const name = newName.trim();
    if (!name) return;
    api.updateSections({
      type: 'create',
      section: { id: newSectionId(), name },
    });
    setNewName('');
  };
  return (
    <details className="relative">
      <summary className="flex min-h-11 cursor-pointer list-none items-center px-2 font-mono text-[9px] uppercase tracking-[0.04em] text-[var(--text-muted)]">
        More
      </summary>
      <div className="absolute right-0 top-full z-[80] mt-1 w-[320px] max-w-[85vw] rounded-[5px] border border-[var(--border-default)] bg-[var(--bg-surface)] p-3 shadow-xl">
        <div className="mb-3 grid grid-cols-3 gap-1 border-b border-[var(--border-default)] pb-3 xl:hidden">
          <Button size="sm" variant={showGrid ? 'secondary' : 'ghost'} aria-pressed={showGrid} onClick={onToggleGrid}>Grid</Button>
          <Button size="sm" variant={snapToGrid ? 'secondary' : 'ghost'} aria-pressed={snapToGrid} onClick={onToggleSnap}>Snap</Button>
          <Button size="sm" variant="ghost" disabled={!tidyEnabled} onClick={onTidy}>Tidy</Button>
        </div>
        <p className="font-mono text-[9px] uppercase text-[var(--text-muted)]">Sections</p>
        <div className="mt-2 flex gap-1">
          <Input
            value={newName}
            aria-label="New section name"
            placeholder="New section"
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') add();
            }}
          />
          <Button size="sm" variant="secondary" disabled={!newName.trim()} onClick={add}>Add</Button>
        </div>
        {api.state.sections.length > 0 && (
          <ul className="mt-2 space-y-1">
            {api.state.sections.map((section, index) => (
              <SectionRow key={section.id} api={api} section={section} index={index} />
            ))}
          </ul>
        )}
        <div className="mt-3 grid gap-1 border-t border-[var(--border-default)] pt-2">
          <Button size="sm" variant="ghost" onClick={() => api.trimCanvas()}>Trim canvas</Button>
          <Button size="sm" variant="ghost" onClick={onSaveTemplate}>Save as template</Button>
        </div>
      </div>
    </details>
  );
}
