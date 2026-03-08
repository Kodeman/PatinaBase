'use client';

import { MessageSquare, Trash2, AlertCircle, HelpCircle, Lightbulb, StickyNote } from 'lucide-react';
import { useViewerStore } from '@/stores/viewer-store';
import type { AnnotationCategory } from '@patina/types';
import { clsx } from 'clsx';

const categoryConfig: Record<AnnotationCategory, { icon: typeof StickyNote; color: string; label: string }> = {
  note: { icon: StickyNote, color: 'text-blue-400', label: 'Note' },
  question: { icon: HelpCircle, color: 'text-yellow-400', label: 'Question' },
  issue: { icon: AlertCircle, color: 'text-red-400', label: 'Issue' },
  opportunity: { icon: Lightbulb, color: 'text-green-400', label: 'Opportunity' },
};

export function AnnotationsList() {
  const {
    annotations,
    selectedAnnotationId,
    selectAnnotation,
    deleteAnnotation,
  } = useViewerStore();

  if (annotations.length === 0) {
    return null;
  }

  return (
    <div className="p-4">
      <h3 className="font-medium flex items-center gap-2 mb-3">
        <MessageSquare className="w-4 h-4" />
        Annotations
        <span className="text-xs text-white/40">({annotations.length})</span>
      </h3>

      <div className="space-y-2">
        {annotations.map((annotation) => {
          const config = categoryConfig[annotation.category];
          const Icon = config.icon;
          const isSelected = selectedAnnotationId === annotation.id;

          return (
            <div
              key={annotation.id}
              className={clsx(
                'p-3 rounded-lg cursor-pointer transition-colors',
                isSelected
                  ? 'bg-white/10 ring-1 ring-white/20'
                  : 'bg-white/5 hover:bg-white/10'
              )}
              onClick={() => selectAnnotation(isSelected ? null : annotation.id)}
            >
              <div className="flex items-start gap-2">
                <Icon className={clsx('w-4 h-4 mt-0.5 flex-shrink-0', config.color)} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white/80 break-words">
                    {annotation.text}
                  </p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className={clsx('text-xs', config.color)}>
                      {config.label}
                    </span>
                    <span className="text-xs text-white/30">
                      {new Date(annotation.createdAt).toLocaleDateString()}
                    </span>
                    {annotation.resolvedAt && (
                      <span className="text-xs text-green-400">Resolved</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteAnnotation(annotation.id);
                  }}
                  className="p-1 text-white/30 hover:text-red-400 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
