'use client';

import { useRef, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { PointerLockControls } from '@react-three/drei';
import * as THREE from 'three';

interface WalkthroughControlsProps {
  /** Movement speed in units per second */
  moveSpeed?: number;
  /** Whether controls are enabled */
  enabled?: boolean;
}

/**
 * First-person walkthrough controls using WASD keys
 * Click to lock pointer, ESC to unlock
 */
export function WalkthroughControls({
  moveSpeed = 3,
  enabled = true,
}: WalkthroughControlsProps) {
  const controlsRef = useRef<typeof PointerLockControls.prototype>(null);
  const { camera, gl } = useThree();

  // Movement state
  const moveState = useRef({
    forward: false,
    backward: false,
    left: false,
    right: false,
    up: false,
    down: false,
  });

  const velocity = useRef(new THREE.Vector3());
  const direction = useRef(new THREE.Vector3());

  // Set up initial camera position at eye level
  useEffect(() => {
    if (enabled) {
      camera.position.set(0, 1.6, 0); // Eye level height
    }
  }, [camera, enabled]);

  // Keyboard controls
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      switch (event.code) {
        case 'KeyW':
        case 'ArrowUp':
          moveState.current.forward = true;
          break;
        case 'KeyS':
        case 'ArrowDown':
          moveState.current.backward = true;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          moveState.current.left = true;
          break;
        case 'KeyD':
        case 'ArrowRight':
          moveState.current.right = true;
          break;
        case 'KeyQ':
        case 'Space':
          moveState.current.up = true;
          break;
        case 'KeyE':
        case 'ShiftLeft':
          moveState.current.down = true;
          break;
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      switch (event.code) {
        case 'KeyW':
        case 'ArrowUp':
          moveState.current.forward = false;
          break;
        case 'KeyS':
        case 'ArrowDown':
          moveState.current.backward = false;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          moveState.current.left = false;
          break;
        case 'KeyD':
        case 'ArrowRight':
          moveState.current.right = false;
          break;
        case 'KeyQ':
        case 'Space':
          moveState.current.up = false;
          break;
        case 'KeyE':
        case 'ShiftLeft':
          moveState.current.down = false;
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
    };
  }, [enabled]);

  // Animation frame for smooth movement
  useFrame((_, delta) => {
    if (!enabled || !controlsRef.current) return;

    const controls = controlsRef.current as unknown as { isLocked: boolean };
    if (!controls.isLocked) return;

    // Calculate movement direction
    direction.current.z = Number(moveState.current.forward) - Number(moveState.current.backward);
    direction.current.x = Number(moveState.current.right) - Number(moveState.current.left);
    direction.current.y = Number(moveState.current.up) - Number(moveState.current.down);
    direction.current.normalize();

    // Apply movement relative to camera orientation
    const speed = moveSpeed * delta;

    if (moveState.current.forward || moveState.current.backward) {
      const forward = new THREE.Vector3();
      camera.getWorldDirection(forward);
      forward.y = 0; // Keep movement horizontal
      forward.normalize();
      camera.position.addScaledVector(forward, direction.current.z * speed);
    }

    if (moveState.current.left || moveState.current.right) {
      const right = new THREE.Vector3();
      camera.getWorldDirection(right);
      right.crossVectors(camera.up, right);
      right.normalize();
      camera.position.addScaledVector(right, direction.current.x * speed);
    }

    if (moveState.current.up || moveState.current.down) {
      camera.position.y += direction.current.y * speed;
      // Clamp to reasonable heights
      camera.position.y = Math.max(0.5, Math.min(5, camera.position.y));
    }
  });

  if (!enabled) return null;

  return (
    <PointerLockControls
      ref={controlsRef}
      args={[camera, gl.domElement]}
    />
  );
}
