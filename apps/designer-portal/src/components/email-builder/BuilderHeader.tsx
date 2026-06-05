'use client';

import { ChevronLeft, Save, Monitor, Smartphone } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTemplateBuilderStore } from '@/stores/template-builder-store';
import { cn } from '@/lib/utils';
import { Button, IconButton } from '@/components/ui/controls';

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
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/communications/templates')}
          >
            <ChevronLeft className="w-4 h-4" />
            Templates
          </Button>
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
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditorMode('builder')}
              className={cn(
                'rounded-md',
                editorMode === 'builder' && 'bg-white shadow-sm text-patina-charcoal'
              )}
            >
              Builder
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditorMode('html')}
              className={cn(
                'rounded-md',
                editorMode === 'html' && 'bg-white shadow-sm text-patina-charcoal'
              )}
            >
              HTML
            </Button>
          </div>

          {/* Device toggle */}
          <div className="flex gap-0.5 bg-patina-off-white rounded-lg p-0.5">
            <IconButton
              label="Desktop preview"
              size="sm"
              onClick={() => setPreviewDevice('desktop')}
              className={cn('rounded-md', previewDevice === 'desktop' ? 'bg-white shadow-sm' : '')}
            >
              <Monitor className="w-3.5 h-3.5 text-patina-clay-beige" />
            </IconButton>
            <IconButton
              label="Mobile preview"
              size="sm"
              onClick={() => setPreviewDevice('mobile')}
              className={cn('rounded-md', previewDevice === 'mobile' ? 'bg-white shadow-sm' : '')}
            >
              <Smartphone className="w-3.5 h-3.5 text-patina-clay-beige" />
            </IconButton>
          </div>

          <Button
            variant="primary"
            size="sm"
            onClick={onSave}
            disabled={!isDirty || isSaving}
            loading={isSaving}
          >
            <Save className="w-3.5 h-3.5" />
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
