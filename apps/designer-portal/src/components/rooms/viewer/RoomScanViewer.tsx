'use client';

import { useEffect, useRef, useCallback } from 'react';
import { X, Maximize2, Minimize2, Check, Loader2 } from 'lucide-react';
import { useViewerStore } from '@/stores/viewer-store';
import { ViewerCanvas } from './ViewerCanvas';
import { ViewerToolbar } from './ViewerToolbar';
import { MeasurementPanel } from './tools/MeasurementPanel';
import { AnnotationsList } from './tools/AnnotationsList';
import { LoadingOverlay } from './LoadingOverlay';
import { useSaveRoomScanData } from '@patina/supabase';
import type { RoomScan } from '@patina/supabase';

interface RoomScanViewerProps {
  scan: RoomScan;
  onClose?: () => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

export function RoomScanViewer({
  scan,
  onClose,
  isFullscreen = false,
  onToggleFullscreen,
}: RoomScanViewerProps) {
  const {
    setScanId,
    loadingState,
    reset,
    savedMeasurements,
    annotations,
    activeTool,
  } = useViewerStore();

  // Database persistence
  const saveData = useSaveRoomScanData();
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedRef = useRef<{ measurements: string; annotations: string }>({
    measurements: '',
    annotations: '',
  });

  // Debounced save function
  const debouncedSave = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      const measurementsJson = JSON.stringify(savedMeasurements);
      const annotationsJson = JSON.stringify(annotations);

      // Only save if data has changed
      if (
        measurementsJson !== lastSavedRef.current.measurements ||
        annotationsJson !== lastSavedRef.current.annotations
      ) {
        saveData.mutate(
          {
            scanId: scan.id,
            measurements: savedMeasurements as never[],
            annotations: annotations as never[],
          },
          {
            onSuccess: () => {
              lastSavedRef.current = {
                measurements: measurementsJson,
                annotations: annotationsJson,
              };
            },
          }
        );
      }
    }, 1000); // 1 second debounce
  }, [savedMeasurements, annotations, scan.id, saveData]);

  // Auto-save when measurements or annotations change
  useEffect(() => {
    // Don't save on initial load
    if (lastSavedRef.current.measurements === '' && lastSavedRef.current.annotations === '') {
      lastSavedRef.current = {
        measurements: JSON.stringify(savedMeasurements),
        annotations: JSON.stringify(annotations),
      };
      return;
    }

    debouncedSave();

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [savedMeasurements, annotations, debouncedSave]);

  // Initialize viewer with scan data
  useEffect(() => {
    setScanId(scan.id);

    // Load existing measurements and annotations from scan data
    if (scan.measurements) {
      useViewerStore.getState().setMeasurements(scan.measurements as never[]);
    }
    if (scan.annotations) {
      useViewerStore.getState().setAnnotations(scan.annotations as never[]);
    }

    return () => {
      reset();
    };
  }, [scan.id, scan.measurements, scan.annotations, setScanId, reset]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      const store = useViewerStore.getState();

      switch (e.key) {
        case '1':
          store.setNavigationMode('orbit');
          break;
        case '2':
          store.setNavigationMode('walkthrough');
          break;
        case '3':
          store.setNavigationMode('floorplan');
          break;
        case '4':
          store.setNavigationMode('elevation');
          break;
        case 'm':
        case 'M':
          store.setActiveTool(store.activeTool === 'measure' ? 'none' : 'measure');
          break;
        case 'a':
        case 'A':
          store.setActiveTool(store.activeTool === 'annotate' ? 'none' : 'annotate');
          break;
        case 'Escape':
          store.setActiveTool('none');
          store.clearMeasurement();
          store.setPendingAnnotationPosition(null);
          break;
        case 'g':
        case 'G':
          store.toggleGrid();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const hasModel = scan.model_url_gltf || scan.model_url;
  const showRightPanel = savedMeasurements.length > 0 || annotations.length > 0 || activeTool !== 'none';

  return (
    <div className="flex flex-col h-full bg-patina-charcoal text-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-3">
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-md hover:bg-white/10 transition-colors"
              aria-label="Close viewer"
            >
              <X className="w-5 h-5" />
            </button>
          )}
          <div>
            <h2 className="font-medium">{scan.name}</h2>
            <p className="text-sm text-white/60">
              {scan.floor_area ? `${scan.floor_area.toFixed(1)} m2` : 'Room scan'}
              {scan.room_type && ` • ${scan.room_type.replace('_', ' ')}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Save indicator */}
          {saveData.isPending && (
            <div className="flex items-center gap-1.5 text-sm text-white/60">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Saving...</span>
            </div>
          )}
          {saveData.isSuccess && !saveData.isPending && (
            <div className="flex items-center gap-1.5 text-sm text-green-400">
              <Check className="w-4 h-4" />
              <span>Saved</span>
            </div>
          )}

          {onToggleFullscreen && (
            <button
              onClick={onToggleFullscreen}
              className="p-2 rounded-md hover:bg-white/10 transition-colors"
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            >
              {isFullscreen ? (
                <Minimize2 className="w-5 h-5" />
              ) : (
                <Maximize2 className="w-5 h-5" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Viewer area */}
        <div className="flex-1 flex flex-col relative">
          {/* Toolbar */}
          <ViewerToolbar />

          {/* Canvas */}
          <div className="flex-1 relative">
            {hasModel ? (
              <>
                <ViewerCanvas scan={scan} />
                {loadingState !== 'complete' && loadingState !== 'idle' && (
                  <LoadingOverlay />
                )}
              </>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-patina-charcoal">
                <div className="text-center p-8">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-white/10 flex items-center justify-center">
                    <span className="text-2xl">📦</span>
                  </div>
                  <h3 className="text-lg font-medium mb-2">3D Model Not Available</h3>
                  <p className="text-sm text-white/60 max-w-sm">
                    This room scan doesn&apos;t have a 3D model yet. The model may still be processing
                    or needs to be converted from the original scan.
                  </p>
                  {scan.thumbnail_url && (
                    <img
                      src={scan.thumbnail_url}
                      alt={scan.name}
                      className="mt-6 max-w-xs mx-auto rounded-lg opacity-50"
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right panel (measurements, annotations) */}
        {showRightPanel && (
          <div className="w-80 border-l border-white/10 overflow-y-auto">
            {savedMeasurements.length > 0 && <MeasurementPanel />}
            {annotations.length > 0 && <AnnotationsList />}
          </div>
        )}
      </div>
    </div>
  );
}
