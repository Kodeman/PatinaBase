'use client';

import { ChevronLeft, Save, Monitor, Smartphone } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTemplateBuilderStore } from '@/stores/template-builder-store';
import { cn } from '@/lib/utils';

interface BuilderHeaderProps {
  templateName: string;
  isSaving: boolean;
  onSave: () => void;
}

export function BuilderHeader({ templateName, isSaving, onSave }: BuilderHeaderProps) {
  const router = useRouter();
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
    </div>
  );
}
