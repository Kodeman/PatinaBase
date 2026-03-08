'use client';

import { Suspense, useEffect, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Environment, Grid, PerspectiveCamera } from '@react-three/drei';
import { useViewerStore } from '@/stores/viewer-store';
import { SceneSetup } from './scene/SceneSetup';
import { RoomModel } from './scene/RoomModel';
import { MeasurementTool } from './tools/MeasurementTool';
import { AnnotationTool } from './tools/AnnotationTool';
import { WalkthroughControls } from './controls/WalkthroughControls';
import { FloorPlanCamera } from './controls/FloorPlanCamera';
import { ElevationCamera, type WallDirection } from './controls/ElevationCamera';
import type { RoomScan } from '@patina/supabase';

interface ViewerCanvasProps {
  scan: RoomScan;
}

/**
 * Helper component to reset camera when navigation mode changes
 */
function CameraManager() {
  const { camera } = useThree();
  const navigationMode = useViewerStore((s) => s.navigationMode);

  useEffect(() => {
    // Reset perspective camera position when switching to orbit mode
    if (navigationMode === 'orbit') {
      camera.position.set(5, 5, 5);
      camera.lookAt(0, 0, 0);
    }
  }, [navigationMode, camera]);

  return null;
}

/**
 * Walkthrough mode instructions overlay
 */
function WalkthroughInstructions() {
  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/70 text-white text-sm px-4 py-2 rounded-lg pointer-events-none z-10">
      <div className="flex items-center gap-4">
        <span>Click to start</span>
        <span className="text-white/60">|</span>
        <span><kbd className="bg-white/20 px-1.5 py-0.5 rounded text-xs">WASD</kbd> Move</span>
        <span><kbd className="bg-white/20 px-1.5 py-0.5 rounded text-xs">Mouse</kbd> Look</span>
        <span><kbd className="bg-white/20 px-1.5 py-0.5 rounded text-xs">ESC</kbd> Exit</span>
      </div>
    </div>
  );
}

export function ViewerCanvas({ scan }: ViewerCanvasProps) {
  const {
    navigationMode,
    activeTool,
    showGrid,
    selectedWallIndex,
  } = useViewerStore();

  // Get model URL (prefer glTF, fallback to USDZ with warning)
  const modelUrl = (scan as { model_url_gltf?: string }).model_url_gltf || scan.model_url;

  // Map wall index to direction
  const wallDirections: WallDirection[] = ['north', 'east', 'south', 'west'];
  const selectedWallDirection = selectedWallIndex !== null
    ? wallDirections[selectedWallIndex % 4]
    : 'north';

  return (
    <div className="relative w-full h-full">
      {/* Walkthrough instructions */}
      {navigationMode === 'walkthrough' && <WalkthroughInstructions />}

      <Canvas
        shadows
        className="w-full h-full"
        camera={
          navigationMode !== 'floorplan' && navigationMode !== 'elevation'
            ? {
                position: [5, 5, 5],
                fov: 50,
                near: 0.1,
                far: 1000,
              }
            : undefined
        }
      >
        {/* Camera manager for mode transitions */}
        <CameraManager />

        {/* Lighting and environment */}
        <SceneSetup />

        {/* Environment map for reflections */}
        <Environment preset="apartment" background={false} />

        {/* Grid helper - hide in walkthrough and elevation modes */}
        {showGrid && navigationMode !== 'walkthrough' && navigationMode !== 'elevation' && (
          <Grid
            infiniteGrid
            fadeDistance={30}
            fadeStrength={5}
            cellSize={0.5}
            cellThickness={0.5}
            cellColor="#555555"
            sectionSize={1}
            sectionThickness={1}
            sectionColor="#888888"
          />
        )}

        {/* Room model */}
        <Suspense fallback={null}>
          {modelUrl && <RoomModel url={modelUrl} />}
        </Suspense>

        {/* Measurement tool overlay */}
        {activeTool === 'measure' && <MeasurementTool />}

        {/* Annotation tool overlay */}
        {activeTool === 'annotate' && <AnnotationTool />}

        {/* Camera controls based on navigation mode */}
        {navigationMode === 'orbit' && (
          <OrbitControls
            enableDamping
            dampingFactor={0.05}
            minDistance={1}
            maxDistance={50}
            maxPolarAngle={Math.PI * 0.9}
          />
        )}

        {navigationMode === 'walkthrough' && (
          <WalkthroughControls
            enabled
            moveSpeed={3}
          />
        )}

        {navigationMode === 'floorplan' && (
          <>
            <FloorPlanCamera
              enabled
              zoom={8}
              target={[0, 0, 0]}
            />
            <OrbitControls
              enableRotate={false}
              enableDamping
              dampingFactor={0.05}
              minZoom={2}
              maxZoom={20}
              screenSpacePanning
            />
          </>
        )}

        {navigationMode === 'elevation' && (
          <>
            <ElevationCamera
              enabled
              wallDirection={selectedWallDirection}
              zoom={4}
              roomCenter={[0, 1.5, 0]}
              distance={8}
            />
            <OrbitControls
              enableRotate={false}
              enableDamping
              dampingFactor={0.05}
              minZoom={2}
              maxZoom={20}
              screenSpacePanning
            />
          </>
        )}
      </Canvas>
    </div>
  );
}
