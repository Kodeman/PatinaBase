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
      <button type="button" aria-label={`Move ${section.name} up`} disabled={index === 0} onClick={() => move(-1)} className="min-h-11 min-w-11 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-clay)] disabled:opacity-30">↑</button>
      <button type="button" aria-label={`Move ${section.name} down`} disabled={index === (api.state?.sections.length ?? 0) - 1} onClick={() => move(1)} className="min-h-11 min-w-11 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-clay)] disabled:opacity-30">↓</button>
      <button type="button" aria-label={`Delete ${section.name}`} onClick={() => api.updateSections({ type: 'delete', sectionId: section.id })} className="min-h-11 min-w-11 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-clay)]">×</button>
    </li>
  );
}

/**
 * The Tools Section's Arrange and Board groups (US-28 S12; SPEC §S12.4: the
 * "Composition tools" popover becomes the Arrange group, and Export leaves
 * the header for Tools › Board). Same controls and commands as before; only
 * their place and dress change.
 */
export function BoardRoomSectionsMenu({
  api,
  tidyEnabled,
  onTidy,
  onExport,
  onSaveTemplate,
}: {
  api: BoardRoomControllerApi;
  tidyEnabled: boolean;
  onTidy: () => void;
  onExport: () => void;
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
    <>
      <div className="br-tools-group" role="group" aria-labelledby="br-tools-arrange">
        <p className="eb" id="br-tools-arrange">Arrange</p>
        <div className="br-tool-acts">
          <button type="button" className="br-tool" disabled={!tidyEnabled} onClick={onTidy}>Arrange composition</button>
          <button type="button" className="br-tool" onClick={() => api.trimCanvas()}>Trim composition canvas</button>
        </div>
        <p className="br-tools-sub">Composition sections</p>
        <div className="mt-2 flex gap-1">
          <Input
            className="h-11"
            value={newName}
            aria-label="New section name"
            placeholder="Section name"
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') add();
            }}
          />
          <Button size="sm" className="min-h-11 min-w-11" variant="secondary" disabled={!newName.trim()} onClick={add}>Add section</Button>
        </div>
        {api.state.sections.length > 0 && (
          <ul className="mt-2 space-y-1">
            {api.state.sections.map((section, index) => (
              <SectionRow key={section.id} api={api} section={section} index={index} />
            ))}
          </ul>
        )}
      </div>
      <div className="br-tools-group" role="group" aria-labelledby="br-tools-board">
        <p className="eb" id="br-tools-board">Board</p>
        <div className="br-tool-acts">
          <button type="button" className="br-tool" onClick={onExport} aria-label="Export design board">Export</button>
          <button type="button" className="br-tool" onClick={onSaveTemplate}>Save studio template</button>
        </div>
      </div>
    </>
  );
}
