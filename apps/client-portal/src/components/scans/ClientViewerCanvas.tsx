'use client';

import { Suspense, useEffect, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, OrthographicCamera, Environment, Grid } from '@react-three/drei';
import * as THREE from 'three';

import { SceneSetup } from './scene/SceneSetup';
import { RoomModel } from './scene/RoomModel';
import { ClientViewerLoadingOverlay } from './ClientViewerLoadingOverlay';

export type ClientViewerMode = 'orbit' | 'floorplan';

interface ClientViewerCanvasProps {
  modelUrl: string;
  mode: ClientViewerMode;
}

function FloorPlanCamera() {
  const { set, size } = useThree();
  const cameraRef = useRef<THREE.OrthographicCamera>(null);

  useEffect(() => {
    if (cameraRef.current) {
      set({ camera: cameraRef.current });
    }
  }, [set]);

  useEffect(() => {
    if (!cameraRef.current) return;
    const aspect = size.width / size.height;
    const frustumSize = 8;
    cameraRef.current.left = (-frustumSize * aspect) / 2;
    cameraRef.current.right = (frustumSize * aspect) / 2;
    cameraRef.current.top = frustumSize / 2;
    cameraRef.current.bottom = -frustumSize / 2;
    cameraRef.current.updateProjectionMatrix();
  }, [size]);

  return (
    <OrthographicCamera
      ref={cameraRef}
      makeDefault
      position={[0, 20, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      zoom={8}
      near={0.1}
      far={100}
    />
  );
}

export function ClientViewerCanvas({ modelUrl, mode }: ClientViewerCanvasProps) {
  return (
    <div className="relative h-full w-full">
      <Canvas
        shadows
        className="h-full w-full"
        camera={
          mode === 'orbit'
            ? { position: [5, 5, 5], fov: 50, near: 0.1, far: 1000 }
            : undefined
        }
      >
        <SceneSetup />
        <Environment preset="apartment" background={false} />

        {mode === 'orbit' ? (
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
        ) : null}

        <Suspense fallback={null}>
          <RoomModel url={modelUrl} />
        </Suspense>

        {mode === 'orbit' ? (
          <OrbitControls
            enableDamping
            dampingFactor={0.05}
            minDistance={1}
            maxDistance={50}
            maxPolarAngle={Math.PI * 0.9}
          />
        ) : (
          <>
            <FloorPlanCamera />
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
