'use client';

import { useCallback, useState } from 'react';
import { Html } from '@react-three/drei';
import { useViewerStore } from '@/stores/viewer-store';
import type { ThreeEvent } from '@react-three/fiber';
import type { Annotation, AnnotationCategory, Vector3 } from '@patina/types';

const ANNOTATION_COLORS: Record<AnnotationCategory, { bg: string; text: string; border: string }> = {
  note: { bg: 'bg-blue-500', text: 'text-blue-500', border: 'border-blue-500' },
  question: { bg: 'bg-purple-500', text: 'text-purple-500', border: 'border-purple-500' },
  opportunity: { bg: 'bg-green-500', text: 'text-green-500', border: 'border-green-500' },
  issue: { bg: 'bg-red-500', text: 'text-red-500', border: 'border-red-500' },
};

const ANNOTATION_ICONS: Record<AnnotationCategory, string> = {
  note: '📝',
  question: '❓',
  opportunity: '💡',
  issue: '⚠️',
};

const CATEGORY_LABELS: Record<AnnotationCategory, string> = {
  note: 'Note',
  question: 'Question',
  opportunity: 'Opportunity',
  issue: 'Issue',
};

/**
 * Annotation tool for placing and viewing annotations in 3D space
 */
export function AnnotationTool() {
  const {
    annotations,
    pendingAnnotationPosition,
    selectedAnnotationId,
    addAnnotation,
    selectAnnotation,
    setPendingAnnotationPosition,
  } = useViewerStore();

  const [formData, setFormData] = useState({
    text: '',
    category: 'note' as AnnotationCategory,
  });

  // Handle click to place annotation
  const handleClick = useCallback((event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();

    if (event.intersections.length > 0) {
      const intersection = event.intersections[0];
      const point = intersection.point;
      setPendingAnnotationPosition({ x: point.x, y: point.y, z: point.z });
      selectAnnotation(null);
    }
  }, [setPendingAnnotationPosition, selectAnnotation]);

  // Handle form submission
  const handleSubmit = () => {
    if (!pendingAnnotationPosition || !formData.text.trim()) return;

    addAnnotation({
      position: pendingAnnotationPosition,
      normal: { x: 0, y: 1, z: 0 }, // Default upward normal
      text: formData.text.trim(),
      category: formData.category,
      createdBy: '', // Will be set by auth
      resolvedAt: null,
    });

    // Reset form
    setFormData({ text: '', category: 'note' });
  };

  // Handle cancel
  const handleCancel = () => {
    setPendingAnnotationPosition(null);
    setFormData({ text: '', category: 'note' });
  };

  return (
    <group onClick={handleClick}>
      {/* Existing annotations */}
      {annotations.map((annotation) => (
        <AnnotationPin
          key={annotation.id}
          annotation={annotation}
          isSelected={selectedAnnotationId === annotation.id}
          onSelect={() => selectAnnotation(annotation.id)}
        />
      ))}

      {/* Pending annotation placement */}
      {pendingAnnotationPosition && (
        <group position={[pendingAnnotationPosition.x, pendingAnnotationPosition.y, pendingAnnotationPosition.z]}>
          {/* Pin marker */}
          <mesh>
            <sphereGeometry args={[0.08, 16, 16]} />
            <meshStandardMaterial color="#3b82f6" emissive="#3b82f6" emissiveIntensity={0.5} />
          </mesh>

          {/* Form popup */}
          <Html center distanceFactor={10}>
            <div className="bg-white rounded-lg shadow-xl p-4 w-64 -translate-y-full mb-2">
              <h4 className="font-medium text-gray-900 mb-3">Add Annotation</h4>

              {/* Category selector */}
              <div className="flex gap-1 mb-3">
                {(Object.keys(ANNOTATION_COLORS) as AnnotationCategory[]).map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setFormData((d) => ({ ...d, category: cat }))}
                    className={`flex-1 py-1.5 px-2 text-xs rounded-md border transition-colors ${
                      formData.category === cat
                        ? `${ANNOTATION_COLORS[cat].bg} text-white border-transparent`
                        : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    {ANNOTATION_ICONS[cat]}
                  </button>
                ))}
              </div>

              {/* Text input */}
              <textarea
                value={formData.text}
                onChange={(e) => setFormData((d) => ({ ...d, text: e.target.value }))}
                placeholder={`Add ${CATEGORY_LABELS[formData.category].toLowerCase()}...`}
                rows={3}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                autoFocus
              />

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={handleCancel}
                  className="flex-1 py-2 text-sm text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!formData.text.trim()}
                  className="flex-1 py-2 text-sm text-white bg-blue-500 rounded-md hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Add
                </button>
              </div>
            </div>
          </Html>
        </group>
      )}
    </group>
  );
}

/**
 * Individual annotation pin component
 */
function AnnotationPin({
  annotation,
  isSelected,
  onSelect,
}: {
  annotation: Annotation;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const colors = ANNOTATION_COLORS[annotation.category];
  const icon = ANNOTATION_ICONS[annotation.category];
  const { deleteAnnotation } = useViewerStore();

  const colorHex =
    annotation.category === 'note' ? '#3b82f6' :
    annotation.category === 'question' ? '#8b5cf6' :
    annotation.category === 'opportunity' ? '#22c55e' : '#ef4444';

  return (
    <group position={[annotation.position.x, annotation.position.y, annotation.position.z]}>
      {/* Pin marker */}
      <mesh onClick={(e) => { e.stopPropagation(); onSelect(); }}>
        <sphereGeometry args={[isSelected ? 0.1 : 0.06, 16, 16]} />
        <meshStandardMaterial
          color={colorHex}
          emissive={colorHex}
          emissiveIntensity={isSelected ? 0.8 : 0.4}
        />
      </mesh>

      {/* Label (always visible) */}
      <Html center distanceFactor={15}>
        <div
          onClick={(e) => { e.stopPropagation(); onSelect(); }}
          className={`
            px-2 py-1 rounded-full text-xs font-medium text-white cursor-pointer
            transition-all transform hover:scale-110
            ${colors.bg} shadow-lg
          `}
        >
          {icon}
        </div>
      </Html>

      {/* Expanded card when selected */}
      {isSelected && (
        <Html center distanceFactor={10}>
          <div
            className="bg-white rounded-lg shadow-xl p-3 w-56 -translate-y-full mb-4 border-l-4"
            style={{ borderLeftColor: colorHex }}
          >
            <div className="flex items-start justify-between gap-2 mb-1">
              <span className="text-lg">{icon}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteAnnotation(annotation.id);
                }}
                className="text-gray-400 hover:text-red-500 text-xs"
              >
                Delete
              </button>
            </div>
            <p className="text-gray-900 text-sm mb-2">
              {annotation.text}
            </p>
            <div className="flex items-center justify-between text-[10px] text-gray-400">
              <span>{CATEGORY_LABELS[annotation.category]}</span>
              <span>{new Date(annotation.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}
