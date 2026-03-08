'use client';

import { useEffect, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { OrthographicCamera } from '@react-three/drei';
import * as THREE from 'three';

interface FloorPlanCameraProps {
  /** Whether this camera mode is active */
  enabled?: boolean;
  /** Zoom level (higher = more zoomed in) */
  zoom?: number;
  /** Target position to look at */
  target?: [number, number, number];
}

/**
 * Orthographic top-down camera for floor plan view
 */
export function FloorPlanCamera({
  enabled = true,
  zoom = 10,
  target = [0, 0, 0],
}: FloorPlanCameraProps) {
  const { set, size } = useThree();
  const cameraRef = useRef<THREE.OrthographicCamera>(null);

  // Set this as the active camera when enabled
  useEffect(() => {
    if (enabled && cameraRef.current) {
      set({ camera: cameraRef.current });
    }
  }, [enabled, set]);

  // Update camera aspect on resize
  useEffect(() => {
    if (!enabled || !cameraRef.current) return;

    const aspect = size.width / size.height;
    const frustumSize = zoom;

    cameraRef.current.left = (-frustumSize * aspect) / 2;
    cameraRef.current.right = (frustumSize * aspect) / 2;
    cameraRef.current.top = frustumSize / 2;
    cameraRef.current.bottom = -frustumSize / 2;
    cameraRef.current.updateProjectionMatrix();
  }, [size, zoom, enabled]);

  if (!enabled) return null;

  return (
    <OrthographicCamera
      ref={cameraRef}
      makeDefault={enabled}
      position={[target[0], 20, target[2]]}
      rotation={[-Math.PI / 2, 0, 0]}
      zoom={zoom}
      near={0.1}
      far={100}
    />
  );
}
