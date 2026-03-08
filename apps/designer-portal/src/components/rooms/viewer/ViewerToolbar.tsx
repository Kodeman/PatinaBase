'use client';

import {
  Orbit,
  Footprints,
  LayoutGrid,
  Square,
  Ruler,
  MessageSquarePlus,
  Grid3X3,
  Maximize,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useViewerStore } from '@/stores/viewer-store';
import type { NavigationMode, ActiveTool } from '@patina/types';
import { clsx } from 'clsx';

const navigationModes: { mode: NavigationMode; icon: typeof Orbit; label: string; shortcut: string }[] = [
  { mode: 'orbit', icon: Orbit, label: 'Orbit', shortcut: '1' },
  { mode: 'walkthrough', icon: Footprints, label: 'Walkthrough', shortcut: '2' },
  { mode: 'floorplan', icon: LayoutGrid, label: 'Floor Plan', shortcut: '3' },
  { mode: 'elevation', icon: Square, label: 'Wall Elevation', shortcut: '4' },
];

const wallLabels = ['North', 'East', 'South', 'West'];

const tools: { tool: ActiveTool; icon: typeof Ruler; label: string; shortcut: string }[] = [
  { tool: 'measure', icon: Ruler, label: 'Measure', shortcut: 'M' },
  { tool: 'annotate', icon: MessageSquarePlus, label: 'Annotate', shortcut: 'A' },
];

export function ViewerToolbar() {
  const {
    navigationMode,
    setNavigationMode,
    activeTool,
    setActiveTool,
    showGrid,
    toggleGrid,
    showDimensions,
    toggleDimensions,
    selectedWallIndex,
    setSelectedWallIndex,
  } = useViewerStore();

  const handlePrevWall = () => {
    const current = selectedWallIndex ?? 0;
    setSelectedWallIndex((current - 1 + 4) % 4);
  };

  const handleNextWall = () => {
    const current = selectedWallIndex ?? 0;
    setSelectedWallIndex((current + 1) % 4);
  };

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-patina-charcoal/80 backdrop-blur-sm border-b border-white/10">
      {/* Navigation modes */}
      <div className="flex items-center gap-1 bg-white/5 rounded-lg p-1">
        {navigationModes.map(({ mode, icon: Icon, label, shortcut }) => (
          <button
            key={mode}
            onClick={() => setNavigationMode(mode)}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
              navigationMode === mode
                ? 'bg-white/20 text-white'
                : 'text-white/60 hover:text-white hover:bg-white/10'
            )}
            title={`${label} (${shortcut})`}
          >
            <Icon className="w-4 h-4" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* Wall selector (only in elevation mode) */}
      {navigationMode === 'elevation' && (
        <>
          <div className="w-px h-6 bg-white/10" />
          <div className="flex items-center gap-1 bg-white/5 rounded-lg p-1">
            <button
              onClick={handlePrevWall}
              className="p-1.5 rounded-md text-white/60 hover:text-white hover:bg-white/10 transition-colors"
              title="Previous Wall"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2 text-sm font-medium text-white min-w-[60px] text-center">
              {wallLabels[selectedWallIndex ?? 0]}
            </span>
            <button
              onClick={handleNextWall}
              className="p-1.5 rounded-md text-white/60 hover:text-white hover:bg-white/10 transition-colors"
              title="Next Wall"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </>
      )}

      {/* Divider */}
      <div className="w-px h-6 bg-white/10" />

      {/* Tools */}
      <div className="flex items-center gap-1 bg-white/5 rounded-lg p-1">
        {tools.map(({ tool, icon: Icon, label, shortcut }) => (
          <button
            key={tool}
            onClick={() => setActiveTool(activeTool === tool ? 'none' : tool)}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
              activeTool === tool
                ? 'bg-blue-500/20 text-blue-400'
                : 'text-white/60 hover:text-white hover:bg-white/10'
            )}
            title={`${label} (${shortcut})`}
          >
            <Icon className="w-4 h-4" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* View options */}
      <div className="flex items-center gap-1">
        <button
          onClick={toggleGrid}
          className={clsx(
            'p-2 rounded-md transition-colors',
            showGrid
              ? 'bg-white/10 text-white'
              : 'text-white/40 hover:text-white/60'
          )}
          title="Toggle Grid (G)"
        >
          <Grid3X3 className="w-4 h-4" />
        </button>
        <button
          onClick={toggleDimensions}
          className={clsx(
            'p-2 rounded-md transition-colors',
            showDimensions
              ? 'bg-white/10 text-white'
              : 'text-white/40 hover:text-white/60'
          )}
          title="Toggle Dimensions"
        >
          <Maximize className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
