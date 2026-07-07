'use client';

/**
 * Fields manager (Track S² · S6) — add / rename / reorder / delete the schedule's
 * designer-defined columns. Lives on the schedule head in BOTH hosts (legacy
 * /portal scope builder + the Drafting Room), so it is shadow-free and toast-free
 * (inline errors, R83) to stay safe on Document surfaces.
 *
 * field_key is immutable: renaming edits the display name only. Deleting a def
 * leaves its values orphaned in item custom_fields (harmless — hidden once the
 * def is gone).
 */

import { useState } from 'react';
import { Button, IconButton, Input, Select } from '@/components/ui/controls';
import {
  reorderedFieldDefs,
  SPEC_FIELD_KINDS,
  type SpecFieldKind,
} from '@/lib/scope/spec-fields';
import {
  useSpecFieldDefs,
  useCreateSpecFieldDef,
  useRenameSpecFieldDef,
  useDeleteSpecFieldDef,
  useReorderSpecFieldDefs,
  type SpecFieldOwner,
} from '@/hooks/use-spec-fields';

const KIND_LABEL: Record<SpecFieldKind, string> = {
  text: 'Text',
  number: 'Number',
  url: 'URL',
};

export function SpecFieldsManager({ owner }: { owner: SpecFieldOwner }) {
  const { data: defs = [] } = useSpecFieldDefs(owner);
  const createDef = useCreateSpecFieldDef(owner);
  const renameDef = useRenameSpecFieldDef(owner);
  const deleteDef = useDeleteSpecFieldDef(owner);
  const reorderDefs = useReorderSpecFieldDefs(owner);

  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newKind, setNewKind] = useState<SpecFieldKind>('text');
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const add = () => {
    const name = newName.trim();
    if (!name) return;
    setError(null);
    createDef.mutate(
      { name, kind: newKind },
      {
        onSuccess: () => {
          setNewName('');
          setNewKind('text');
        },
        onError: (e: unknown) =>
          setError(e instanceof Error ? e.message : 'Could not add the field.'),
      },
    );
  };

  const move = (id: string, dir: -1 | 1) => {
    setError(null);
    reorderDefs.mutate(reorderedFieldDefs(defs, id, dir));
  };

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        Fields{defs.length > 0 ? ` · ${defs.length}` : ''}
      </Button>

      {open && (
        <div
          className="absolute right-0 z-40 mt-1 w-[320px] rounded-md border-2 bg-[var(--bg-surface)] p-3"
          style={{ borderColor: 'var(--border-default)' }}
        >
          <div className="mb-2 flex items-baseline justify-between">
            <span className="type-meta">Custom schedule fields</span>
            <IconButton label="Close" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              ×
            </IconButton>
          </div>

          {defs.length === 0 && (
            <p
              className="mb-2"
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.72rem',
                color: 'var(--text-muted)',
              }}
            >
              Add columns your studio schedules against — COM, Finish, a spec-sheet
              link. They apply to every line and carry through to the project.
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            {defs.map((def, idx) => (
              <div key={def.id} className="flex items-center gap-1.5">
                <Input
                  type="text"
                  defaultValue={def.name}
                  aria-label={`Rename ${def.name}`}
                  onBlur={(e) => {
                    const next = e.target.value.trim();
                    if (next && next !== def.name) {
                      setError(null);
                      renameDef.mutate({ id: def.id, name: next });
                    }
                  }}
                  className="flex-1"
                />
                <span
                  className="shrink-0 font-mono uppercase"
                  style={{ fontSize: '0.55rem', letterSpacing: '0.04em', color: 'var(--text-muted)' }}
                  title={`${KIND_LABEL[def.kind]} — field key: ${def.field_key} (immutable)`}
                >
                  {KIND_LABEL[def.kind]}
                </span>
                <IconButton
                  label="Move up"
                  variant="ghost"
                  size="sm"
                  disabled={idx === 0}
                  onClick={() => move(def.id, -1)}
                >
                  ↑
                </IconButton>
                <IconButton
                  label="Move down"
                  variant="ghost"
                  size="sm"
                  disabled={idx === defs.length - 1}
                  onClick={() => move(def.id, 1)}
                >
                  ↓
                </IconButton>
                <IconButton
                  label={`Delete ${def.name}`}
                  variant="ghost"
                  size="sm"
                  onClick={() => setPendingDelete(def.id)}
                >
                  ×
                </IconButton>
              </div>
            ))}
          </div>

          {pendingDelete && (
            <div
              className="mt-2 rounded-sm border px-2 py-1.5"
              style={{ borderColor: 'rgba(196,131,111,0.4)' }}
            >
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', color: 'var(--text-primary)' }}>
                Delete “{defs.find((d) => d.id === pendingDelete)?.name}”? Existing values stay on
                their lines but hide.
              </p>
              <div className="mt-1.5 flex gap-2">
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => {
                    const id = pendingDelete;
                    setPendingDelete(null);
                    setError(null);
                    if (id) deleteDef.mutate({ id });
                  }}
                >
                  Delete
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setPendingDelete(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Add a field */}
          <div className="mt-3 border-t pt-2" style={{ borderColor: 'var(--border-default)' }}>
            <div className="flex items-end gap-1.5">
              <label className="block flex-1">
                <span className="type-meta mb-1 block">New field</span>
                <Input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') add();
                  }}
                  placeholder="e.g. Finish"
                />
              </label>
              <label className="block">
                <span className="type-meta mb-1 block">Type</span>
                <Select
                  value={newKind}
                  onChange={(e) => setNewKind(e.target.value as SpecFieldKind)}
                  className="!w-auto"
                >
                  {SPEC_FIELD_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {KIND_LABEL[k]}
                    </option>
                  ))}
                </Select>
              </label>
              <Button
                variant="primary"
                size="sm"
                onClick={add}
                disabled={!newName.trim() || createDef.isPending}
              >
                Add
              </Button>
            </div>
          </div>

          {error && (
            <p role="alert" className="mt-2" style={{ fontSize: '0.72rem', color: '#C4836F' }}>
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
