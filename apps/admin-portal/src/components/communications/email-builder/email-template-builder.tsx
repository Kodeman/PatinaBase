'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import type { EmailTemplate, ContentBlockType, ContentBlock } from '@patina/shared/types';
import { useUpdateTemplate } from '@patina/supabase/hooks';
import { renderTemplate } from '@patina/email/renderer';
import { buildSampleData } from '@patina/shared';
import { useTemplateBuilderStore } from '@/stores/template-builder-store';
import { BuilderHeader } from './builder-header';
import { BlockPalette } from './block-palette';
import { BuilderCanvas } from './builder-canvas';
import { PropsPanel } from './props-panel';
import { HtmlEditor } from './html-editor';
import { VariablesPanel } from './variables-panel';
import { PALETTE_BLOCKS } from './constants';

interface EmailTemplateBuilderProps {
  template: EmailTemplate;
}

export function EmailTemplateBuilder({ template }: EmailTemplateBuilderProps) {
  const store = useTemplateBuilderStore();
  const updateTemplate = useUpdateTemplate();
  const [isSaving, setIsSaving] = useState(false);
  const [activeDragType, setActiveDragType] = useState<ContentBlockType | null>(null);

  // Load template into store on mount
  useEffect(() => {
    store.loadFromTemplate(template);
    return () => store.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template.id]);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

  // Save handler
  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      const variablesPayload = store.variables
        .filter((v) => v.name.trim().length > 0)
        .map((v) => ({
          name: v.name.trim(),
          label: v.label?.trim() || v.name.trim(),
          sample: v.sample ?? '',
          required: !!v.required,
        }));

      if (store.editorMode === 'builder' || store.editorMode === 'variables') {
        const allBlocks = store.getAllBlocks();
        const blocksForSave = allBlocks as unknown as ContentBlock[];
        const html = renderTemplate(blocksForSave, {
          previewMode: false,
          variables: buildSampleData(store.variables),
        });
        await updateTemplate.mutateAsync({
          id: template.id,
          content_blocks: blocksForSave,
          html_content: html,
          variables: variablesPayload,
        });
      } else {
        // HTML mode
        await updateTemplate.mutateAsync({
          id: template.id,
          html_content: store.rawHtml,
          content_blocks: [],
          variables: variablesPayload,
        });
      }
      useTemplateBuilderStore.setState({ isDirty: false });
    } finally {
      setIsSaving(false);
    }
  }, [store, template.id, updateTemplate]);

  // DnD handlers
  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const data = active.data.current;
    if (data?.source === 'palette') {
      setActiveDragType(data.type as ContentBlockType);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragType(null);
    const { active, over } = event;
    if (!over) return;

    const activeData = active.data.current;

    // Palette -> Canvas (new block)
    if (activeData?.source === 'palette') {
      const type = activeData.type as ContentBlockType;
      // Find insertion index
      const overIdx = store.contentBlocks.findIndex((b) => b.id === over.id);
      store.addBlock(type, overIdx >= 0 ? overIdx : undefined);
      return;
    }

    // Reorder within canvas
    const oldIndex = store.contentBlocks.findIndex((b) => b.id === active.id);
    const newIndex = store.contentBlocks.findIndex((b) => b.id === over.id);
    if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
      store.moveBlock(oldIndex, newIndex);
    }
  };

  // Drag overlay
  const activeLabel = activeDragType
    ? PALETTE_BLOCKS.find((b) => b.type === activeDragType)?.label
    : null;

  return (
    <div className="min-h-screen bg-patina-off-white flex flex-col">
      <BuilderHeader
        templateName={template.name}
        templateId={template.id}
        isSaving={isSaving}
        onSave={handleSave}
      />

      {store.editorMode === 'html' ? (
        <HtmlEditor />
      ) : store.editorMode === 'variables' ? (
        <div className="flex flex-1 h-[calc(100vh-57px)]">
          <VariablesPanel />
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex flex-1 h-[calc(100vh-57px)]">
            <BlockPalette />
            <BuilderCanvas />
            <PropsPanel />
          </div>

          <DragOverlay>
            {activeDragType && (
              <div className="px-4 py-2 bg-white rounded-lg shadow-lg border border-patina-clay-beige/30 text-sm font-medium text-patina-charcoal">
                {activeLabel}
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}
