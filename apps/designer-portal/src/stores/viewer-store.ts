/**
 * 3D Room Scan Viewer state store
 */

import { create } from 'zustand';
import type {
  NavigationMode,
  ActiveTool,
  Measurement,
  Annotation,
  FurniturePlacement,
  Vector3,
} from '@patina/types';

type LoadingState = 'idle' | 'wireframe' | 'lowpoly' | 'full' | 'complete' | 'error';

interface ViewerState {
  // Scan being viewed
  scanId: string | null;
  setScanId: (id: string | null) => void;

  // Navigation
  navigationMode: NavigationMode;
  setNavigationMode: (mode: NavigationMode) => void;
  selectedWallIndex: number | null;
  setSelectedWallIndex: (index: number | null) => void;

  // Tools
  activeTool: ActiveTool;
  setActiveTool: (tool: ActiveTool) => void;

  // Measurements
  measurementPoints: Vector3[];
  currentMeasurement: number | null; // meters
  savedMeasurements: Measurement[];
  addMeasurementPoint: (point: Vector3) => void;
  clearMeasurement: () => void;
  saveMeasurement: (label?: string) => void;
  deleteMeasurement: (id: string) => void;
  setMeasurements: (measurements: Measurement[]) => void;

  // Annotations
  annotations: Annotation[];
  selectedAnnotationId: string | null;
  pendingAnnotationPosition: Vector3 | null;
  addAnnotation: (annotation: Omit<Annotation, 'id' | 'createdAt'>) => void;
  updateAnnotation: (id: string, updates: Partial<Annotation>) => void;
  deleteAnnotation: (id: string) => void;
  selectAnnotation: (id: string | null) => void;
  setPendingAnnotationPosition: (position: Vector3 | null) => void;
  setAnnotations: (annotations: Annotation[]) => void;

  // Furniture placement
  furniturePlacements: FurniturePlacement[];
  selectedFurnitureId: string | null;
  addFurniturePlacement: (placement: Omit<FurniturePlacement, 'id' | 'createdAt'>) => void;
  updateFurniturePlacement: (id: string, updates: Partial<FurniturePlacement>) => void;
  deleteFurniturePlacement: (id: string) => void;
  selectFurniture: (id: string | null) => void;
  setFurniturePlacements: (placements: FurniturePlacement[]) => void;

  // Loading
  loadingState: LoadingState;
  loadingProgress: number;
  loadingError: string | null;
  setLoadingState: (state: LoadingState) => void;
  setLoadingProgress: (progress: number) => void;
  setLoadingError: (error: string | null) => void;

  // Viewer settings
  showGrid: boolean;
  showDimensions: boolean;
  unitSystem: 'metric' | 'imperial';
  toggleGrid: () => void;
  toggleDimensions: () => void;
  setUnitSystem: (system: 'metric' | 'imperial') => void;

  // Reset
  reset: () => void;
}

// Calculate distance between two points
function calculateDistance(p1: Vector3, p2: Vector3): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const dz = p2.z - p1.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// Format distance
function formatDistance(meters: number, imperial: boolean): { metric: string; imperial: string } {
  const feet = meters * 3.28084;
  const totalInches = feet * 12;
  const wholeFeet = Math.floor(feet);
  const remainingInches = Math.round((feet - wholeFeet) * 12);

  return {
    metric: `${meters.toFixed(2)} m`,
    imperial: remainingInches === 12
      ? `${wholeFeet + 1}' 0"`
      : `${wholeFeet}' ${remainingInches}"`,
  };
}

const initialState = {
  scanId: null,
  navigationMode: 'orbit' as NavigationMode,
  selectedWallIndex: null,
  activeTool: 'none' as ActiveTool,
  measurementPoints: [],
  currentMeasurement: null,
  savedMeasurements: [],
  annotations: [],
  selectedAnnotationId: null,
  pendingAnnotationPosition: null,
  furniturePlacements: [],
  selectedFurnitureId: null,
  loadingState: 'idle' as LoadingState,
  loadingProgress: 0,
  loadingError: null,
  showGrid: true,
  showDimensions: true,
  unitSystem: 'imperial' as const,
};

export const useViewerStore = create<ViewerState>()((set, get) => ({
  ...initialState,

  setScanId: (id) => set({ scanId: id }),

  // Navigation
  setNavigationMode: (mode) => set({ navigationMode: mode, selectedWallIndex: null }),
  setSelectedWallIndex: (index) => set({ selectedWallIndex: index }),

  // Tools
  setActiveTool: (tool) => {
    const currentTool = get().activeTool;
    // Clear tool-specific state when switching tools
    if (currentTool === 'measure' && tool !== 'measure') {
      set({ measurementPoints: [], currentMeasurement: null });
    }
    if (currentTool === 'annotate' && tool !== 'annotate') {
      set({ pendingAnnotationPosition: null });
    }
    set({ activeTool: tool });
  },

  // Measurements
  addMeasurementPoint: (point) => {
    const { measurementPoints } = get();
    if (measurementPoints.length === 0) {
      set({ measurementPoints: [point], currentMeasurement: null });
    } else if (measurementPoints.length === 1) {
      const distance = calculateDistance(measurementPoints[0], point);
      set({
        measurementPoints: [...measurementPoints, point],
        currentMeasurement: distance,
      });
    }
    // If already have 2 points, start new measurement
    else {
      set({ measurementPoints: [point], currentMeasurement: null });
    }
  },

  clearMeasurement: () => set({ measurementPoints: [], currentMeasurement: null }),

  saveMeasurement: (label) => {
    const { measurementPoints, currentMeasurement, savedMeasurements, unitSystem } = get();
    if (measurementPoints.length !== 2 || currentMeasurement === null) return;

    const formatted = formatDistance(currentMeasurement, unitSystem === 'imperial');
    const measurement: Measurement = {
      id: crypto.randomUUID(),
      startPoint: measurementPoints[0],
      endPoint: measurementPoints[1],
      distance: currentMeasurement,
      distanceFormatted: formatted,
      label: label ?? null,
      createdAt: new Date().toISOString(),
      createdBy: '', // Will be set by the component
    };

    set({
      savedMeasurements: [...savedMeasurements, measurement],
      measurementPoints: [],
      currentMeasurement: null,
    });
  },

  deleteMeasurement: (id) =>
    set((s) => ({
      savedMeasurements: s.savedMeasurements.filter((m) => m.id !== id),
    })),

  setMeasurements: (measurements) => set({ savedMeasurements: measurements }),

  // Annotations
  addAnnotation: (annotation) =>
    set((s) => ({
      annotations: [
        ...s.annotations,
        {
          ...annotation,
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
        },
      ],
      pendingAnnotationPosition: null,
    })),

  updateAnnotation: (id, updates) =>
    set((s) => ({
      annotations: s.annotations.map((a) => (a.id === id ? { ...a, ...updates } : a)),
    })),

  deleteAnnotation: (id) =>
    set((s) => ({
      annotations: s.annotations.filter((a) => a.id !== id),
      selectedAnnotationId: s.selectedAnnotationId === id ? null : s.selectedAnnotationId,
    })),

  selectAnnotation: (id) => set({ selectedAnnotationId: id }),

  setPendingAnnotationPosition: (position) => set({ pendingAnnotationPosition: position }),

  setAnnotations: (annotations) => set({ annotations }),

  // Furniture
  addFurniturePlacement: (placement) =>
    set((s) => ({
      furniturePlacements: [
        ...s.furniturePlacements,
        {
          ...placement,
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
        },
      ],
    })),

  updateFurniturePlacement: (id, updates) =>
    set((s) => ({
      furniturePlacements: s.furniturePlacements.map((f) =>
        f.id === id ? { ...f, ...updates } : f
      ),
    })),

  deleteFurniturePlacement: (id) =>
    set((s) => ({
      furniturePlacements: s.furniturePlacements.filter((f) => f.id !== id),
      selectedFurnitureId: s.selectedFurnitureId === id ? null : s.selectedFurnitureId,
    })),

  selectFurniture: (id) => set({ selectedFurnitureId: id }),

  setFurniturePlacements: (placements) => set({ furniturePlacements: placements }),

  // Loading
  setLoadingState: (state) => set({ loadingState: state }),
  setLoadingProgress: (progress) => set({ loadingProgress: progress }),
  setLoadingError: (error) => set({ loadingError: error, loadingState: error ? 'error' : 'idle' }),

  // Settings
  toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
  toggleDimensions: () => set((s) => ({ showDimensions: !s.showDimensions })),
  setUnitSystem: (system) => set({ unitSystem: system }),

  // Reset
  reset: () => set(initialState),
}));

// Selector hooks for convenience
export const useNavigationMode = () => useViewerStore((s) => s.navigationMode);
export const useActiveTool = () => useViewerStore((s) => s.activeTool);
export const useMeasurements = () => useViewerStore((s) => s.savedMeasurements);
export const useAnnotations = () => useViewerStore((s) => s.annotations);
export const useLoadingState = () => useViewerStore((s) => s.loadingState);
