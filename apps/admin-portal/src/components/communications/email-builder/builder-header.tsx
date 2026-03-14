'use client';

import { useState } from 'react';
import { ChevronLeft, Save, Monitor, Smartphone, Trash2 } from 'lucide-react';
import { useDeleteTemplate } from '@patina/supabase/hooks';
import { useRouter } from 'next/navigation';
import { useTemplateBuilderStore } from '@/stores/template-builder-store';
import { cn } from '@/lib/utils';

interface BuilderHeaderProps {
  templateName: string;
  templateId?: string;
  isSaving: boolean;
  onSave: () => void;
}

export function BuilderHeader({ templateName, templateId, isSaving, onSave }: BuilderHeaderProps) {
  const router = useRouter();
  const deleteTemplate = useDeleteTemplate();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const editorMode = useTemplateBuilderStore((s) => s.editorMode);
  const setEditorMode = useTemplateBuilderStore((s) => s.setEditorMode);
  const previewDevice = useTemplateBuilderStore((s) => s.previewDevice);
  const setPreviewDevice = useTemplateBuilderStore((s) => s.setPreviewDevice);
  const isDirty = useTemplateBuilderStore((s) => s.isDirty);

  return (
    <div className="bg-white border-b border-patina-clay-beige/20 px-6 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/communications/templates')}
            className="flex items-center gap-1 text-sm text-patina-clay-beige hover:text-patina-charcoal transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Templates
          </button>
          <div className="h-5 w-px bg-patina-clay-beige/30" />
          <h1 className="text-base font-display font-semibold text-patina-charcoal truncate max-w-[200px]">
            {templateName || 'Untitled'}
          </h1>
          {isDirty && (
            <span className="text-[11px] text-patina-clay-beige/80 italic">Unsaved</span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Mode tabs */}
          <div className="flex bg-patina-off-white rounded-lg p-0.5">
            <button
              onClick={() => setEditorMode('builder')}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-md transition-all',
                editorMode === 'builder'
                  ? 'bg-white shadow-sm text-patina-charcoal'
                  : 'text-patina-clay-beige hover:text-patina-charcoal'
              )}
            >
              Builder
            </button>
            <button
              onClick={() => setEditorMode('html')}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-md transition-all',
                editorMode === 'html'
                  ? 'bg-white shadow-sm text-patina-charcoal'
                  : 'text-patina-clay-beige hover:text-patina-charcoal'
              )}
            >
              HTML
            </button>
          </div>

          {/* Device toggle */}
          <div className="flex gap-0.5 bg-patina-off-white rounded-lg p-0.5">
            <button
              onClick={() => setPreviewDevice('desktop')}
              className={cn('p-1.5 rounded-md transition-all', previewDevice === 'desktop' ? 'bg-white shadow-sm' : '')}
            >
              <Monitor className="w-3.5 h-3.5 text-patina-clay-beige" />
            </button>
            <button
              onClick={() => setPreviewDevice('mobile')}
              className={cn('p-1.5 rounded-md transition-all', previewDevice === 'mobile' ? 'bg-white shadow-sm' : '')}
            >
              <Smartphone className="w-3.5 h-3.5 text-patina-clay-beige" />
            </button>
          </div>

          {templateId && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="p-2 text-patina-clay-beige hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              title="Delete template"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            onClick={onSave}
            disabled={!isDirty || isSaving}
            className="flex items-center gap-1.5 px-4 py-2 bg-patina-mocha-brown text-white rounded-lg text-sm font-medium hover:bg-patina-charcoal transition-colors disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-display font-semibold text-patina-charcoal mb-2">Delete Template</h3>
            <p className="text-sm text-patina-clay-beige mb-6">
              Are you sure you want to delete this template? This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-sm font-medium text-patina-clay-beige hover:text-patina-charcoal transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (templateId) {
                    await deleteTemplate.mutateAsync(templateId);
                    router.push('/communications/templates');
                  }
                }}
                className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
