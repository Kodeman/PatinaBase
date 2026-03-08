'use client';

import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { OrthographicCamera } from '@react-three/drei';
import * as THREE from 'three';

export type WallDirection = 'north' | 'east' | 'south' | 'west';

interface ElevationCameraProps {
  /** Whether this camera mode is active */
  enabled?: boolean;
  /** Which wall to view */
  wallDirection: WallDirection;
  /** Zoom level (higher = more zoomed in) */
  zoom?: number;
  /** Center point of the room */
  roomCenter?: [number, number, number];
  /** Distance from the wall */
  distance?: number;
}

/**
 * Camera positions and rotations for each wall direction
 */
const WALL_CONFIGS: Record<WallDirection, { position: [number, number, number]; rotation: [number, number, number] }> = {
  north: {
    position: [0, 1.5, -10],
    rotation: [0, 0, 0],
  },
  south: {
    position: [0, 1.5, 10],
    rotation: [0, Math.PI, 0],
  },
  east: {
    position: [10, 1.5, 0],
    rotation: [0, -Math.PI / 2, 0],
  },
  west: {
    position: [-10, 1.5, 0],
    rotation: [0, Math.PI / 2, 0],
  },
};

/**
 * Orthographic camera for viewing wall elevations
 */
export function ElevationCamera({
  enabled = true,
  wallDirection,
  zoom = 5,
  roomCenter = [0, 0, 0],
  distance = 10,
}: ElevationCameraProps) {
  const { set, size } = useThree();
  const cameraRef = useRef<THREE.OrthographicCamera>(null);

  const config = WALL_CONFIGS[wallDirection];

  // Calculate camera position based on wall direction and room center
  const position: [number, number, number] = [
    roomCenter[0] + config.position[0] * (distance / 10),
    roomCenter[1] + config.position[1],
    roomCenter[2] + config.position[2] * (distance / 10),
  ];

  // Set this as the active camera when enabled
  useEffect(() => {
    if (enabled && cameraRef.current) {
      // Position camera
      cameraRef.current.position.set(...position);

      // Look at room center
      cameraRef.current.lookAt(new THREE.Vector3(...roomCenter));

      set({ camera: cameraRef.current });
    }
  }, [enabled, set, wallDirection, position, roomCenter]);

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
      position={position}
      zoom={zoom}
      near={0.1}
      far={100}
    />
  );
}
