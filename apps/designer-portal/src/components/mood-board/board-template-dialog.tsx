'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@patina/design-system';
import {
  useBoardTemplates,
  useDeleteBoardTemplate,
  useOrganizations,
  useRenameBoardTemplate,
  useSaveBoardAsTemplate,
} from '@patina/supabase';
import type { EditableMoodBoardItem } from '@patina/types';
import { Button, Input } from '@/components/ui/controls';
import { moodBoardEvents } from '@/lib/analytics/mood-board-events';
import {
  findMissingTemplateAssets,
  probeTemplateAssetImages,
  type TemplateAssetIssue,
} from '@/lib/mood-board/template-asset-validation';

export function BoardTemplateDialog({
  boardId,
  boardName,
  itemCount,
  sectionCount,
  items,
  open,
  onOpenChange,
  onSaved,
  flush,
}: {
  boardId: string;
  boardName: string;
  itemCount: number;
  sectionCount: number;
  /** DV13 — items on the live board, checked for missing/broken image
   * references on open. Optional so an existing caller that hasn't threaded
   * the item list through yet degrades to no warning, not a crash. */
  items?: readonly EditableMoodBoardItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (templateId: string) => void;
  flush?: () => Promise<void>;
}) {
  const { data: organizations } = useOrganizations();
  const studioId = useMemo(() => {
    if (!organizations) return undefined;
    return (
      organizations.find((organization) => organization.type === 'design_studio')?.id ??
      organizations[0]?.id ??
      null
    );
  }, [organizations]);
  const templatesQuery = useBoardTemplates(studioId);
  const saveTemplate = useSaveBoardAsTemplate();
  const renameTemplate = useRenameBoardTemplate();
  const deleteTemplate = useDeleteBoardTemplate();
  const [name, setName] = useState(`${boardName} template`);
  const [description, setDescription] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const studioTemplates = (templatesQuery.data ?? []).filter(
    (template) => template.kind === 'studio',
  );

  // DV13 — non-blocking asset-hygiene check. Missing references resolve
  // instantly; broken ones need a real image load, so they can arrive after
  // the dialog is already open (and after a save, if the designer is quick)
  // — never gating the Save button either way.
  const [assetIssues, setAssetIssues] = useState<TemplateAssetIssue[]>([]);
  const probeGenerationRef = useRef(0);
  useEffect(() => {
    if (!open || !items || items.length === 0) {
      setAssetIssues([]);
      return;
    }
    const generation = ++probeGenerationRef.current;
    setAssetIssues(findMissingTemplateAssets(items));
    void probeTemplateAssetImages(items).then((broken) => {
      if (probeGenerationRef.current !== generation || broken.length === 0) return;
      setAssetIssues((current) => {
        const seen = new Set(current.map((issue) => issue.itemId));
        const additions = broken.filter((issue) => !seen.has(issue.itemId));
        return additions.length > 0 ? [...current, ...additions] : current;
      });
    });
  }, [open, items]);

  const handleSave = async () => {
    if (!studioId) {
      setError('Join or create a studio before saving shared templates.');
      return;
    }
    setError(null);
    try {
      await flush?.();
      const template = await saveTemplate.mutateAsync({
        boardId,
        studioId,
        name,
        description: description.trim() || null,
      });
      setName(`${boardName} template`);
      setDescription('');
      moodBoardEvents.templateSaved({
        template_id: template.id,
        item_count: itemCount,
        section_count: sectionCount,
      });
      onSaved?.(template.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The template could not be saved.');
    }
  };

  const handleRename = async (templateId: string) => {
    if (!studioId) return;
    setError(null);
    try {
      await renameTemplate.mutateAsync({
        templateId,
        studioId,
        name: editingName,
      });
      setEditingId(null);
      setEditingName('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The template could not be renamed.');
    }
  };

  const handleDelete = async (templateId: string) => {
    if (!studioId) return;
    setError(null);
    try {
      await deleteTemplate.mutateAsync({ templateId, studioId });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The template could not be deleted.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Board templates</DialogTitle>
          <DialogDescription>
            Save this composition as a studio starter. Templates copy the layout and imagery without owner-linked product or capture records.
          </DialogDescription>
        </DialogHeader>

        <section aria-labelledby="save-board-template">
          <h3 id="save-board-template" className="font-mono text-[10px] uppercase tracking-[0.07em] text-[var(--text-muted)]">
            Save this board
          </h3>
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">
            {itemCount} {itemCount === 1 ? 'piece' : 'pieces'} · {sectionCount} {sectionCount === 1 ? 'section' : 'sections'}
          </p>
          {assetIssues.length > 0 && (
            <p
              role="status"
              className="mt-2 rounded-[4px] border border-[var(--color-clay)] bg-[var(--bg-surface)] px-2.5 py-2 text-[11px] leading-4 text-[var(--color-clay-ink)]"
            >
              {assetIssues.length} {assetIssues.length === 1 ? 'item has a' : 'items have a'} missing or
              broken image and will carry over as-is: {assetIssues.map((issue) => issue.label).join(', ')}.
            </p>
          )}
          <div className="mt-3 space-y-3">
            <label className="block text-[11px] text-[var(--text-muted)]">
              Template name
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                onFocus={(event) => event.currentTarget.select()}
                className="mt-1"
              />
            </label>
            <label className="block text-[11px] text-[var(--text-muted)]">
              Description <span className="italic">(optional)</span>
              <Input value={description} onChange={(event) => setDescription(event.target.value)} className="mt-1" />
            </label>
            <Button
              variant="primary"
              disabled={saveTemplate.isPending || !name.trim()}
              onClick={() => void handleSave()}
            >
              {saveTemplate.isPending ? 'Saving…' : 'Save as template'}
            </Button>
          </div>
        </section>

        <section className="border-t border-[var(--border-default)] pt-4" aria-labelledby="studio-board-templates-manage">
          <h3 id="studio-board-templates-manage" className="font-mono text-[10px] uppercase tracking-[0.07em] text-[var(--text-muted)]">
            Your studio
          </h3>
          {templatesQuery.isLoading ? (
            <p className="mt-2 text-[12px] text-[var(--text-muted)]">Loading templates…</p>
          ) : studioTemplates.length === 0 ? (
            <p className="mt-2 text-[12px] italic text-[var(--text-muted)]">No studio templates yet.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {studioTemplates.map((template) => (
                <li key={template.id} className="flex min-h-12 items-center justify-between gap-3 rounded-[4px] border border-[var(--border-default)] px-3 py-2">
                  {editingId === template.id ? (
                    <Input
                      autoFocus
                      value={editingName}
                      aria-label={`Rename ${template.name}`}
                      onChange={(event) => setEditingName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') void handleRename(template.id);
                        if (event.key === 'Escape') setEditingId(null);
                      }}
                      className="min-w-0 flex-1"
                    />
                  ) : (
                    <div className="min-w-0">
                      <p className="truncate text-[13px] text-[var(--text-primary)]">{template.name}</p>
                      <p className="font-mono text-[9px] uppercase tracking-[0.04em] text-[var(--text-muted)]">
                        {template.items.length} {template.items.length === 1 ? 'piece' : 'pieces'}
                      </p>
                    </div>
                  )}
                  <div className="flex shrink-0 gap-1">
                    {editingId === template.id ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={renameTemplate.isPending || !editingName.trim()}
                        onClick={() => void handleRename(template.id)}
                      >
                        Save
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingId(template.id);
                          setEditingName(template.name);
                        }}
                      >
                        Rename
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={deleteTemplate.isPending}
                      onClick={() => void handleDelete(template.id)}
                    >
                      Delete
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {error && <p role="alert" className="text-[12px] text-[var(--color-clay-ink)]">{error}</p>}
      </DialogContent>
    </Dialog>
  );
}
