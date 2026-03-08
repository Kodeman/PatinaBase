'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { useViewerStore } from '@/stores/viewer-store';
import * as THREE from 'three';

interface RoomModelProps {
  url: string;
}

/**
 * Progressive loading states:
 * 1. wireframe - Shows model edges only (fast)
 * 2. lowpoly - Basic geometry with simple materials
 * 3. full - Full textures and materials
 * 4. complete - Fully loaded and ready
 */
export function RoomModel({ url }: RoomModelProps) {
  const { setLoadingState, setLoadingProgress, setLoadingError, loadingState } = useViewerStore();
  const [loadPhase, setLoadPhase] = useState<'wireframe' | 'lowpoly' | 'full'>('wireframe');
  const modelRef = useRef<THREE.Group>(null);

  // Load the model
  const { scene } = useGLTF(url, true, undefined, (loader) => {
    loader.manager.onProgress = (_url, loaded, total) => {
      const progress = (loaded / total) * 100;
      setLoadingProgress(progress);
    };
  });

  // Create wireframe material
  const wireframeMaterial = useMemo(() => {
    return new THREE.MeshBasicMaterial({
      color: 0x3b82f6,
      wireframe: true,
      transparent: true,
      opacity: 0.6,
    });
  }, []);

  // Create simple low-poly material
  const lowPolyMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: 0xcccccc,
      metalness: 0,
      roughness: 0.8,
      flatShading: true,
    });
  }, []);

  // Store original materials for restoration
  const originalMaterials = useRef<Map<THREE.Mesh, THREE.Material | THREE.Material[]>>(new Map());

  // Initial loading state
  useEffect(() => {
    setLoadingState('wireframe');
  }, [setLoadingState]);

  // Handle loading errors
  useEffect(() => {
    const handleError = (error: ErrorEvent) => {
      if (error.message.includes(url)) {
        setLoadingError('Failed to load 3D model');
      }
    };

    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, [url, setLoadingError]);

  // Progressive loading effect
  useEffect(() => {
    if (!scene) return;

    // Store original materials on first load
    if (originalMaterials.current.size === 0) {
      scene.traverse((child) => {
        if ('isMesh' in child && child.isMesh) {
          const mesh = child as THREE.Mesh;
          originalMaterials.current.set(mesh, mesh.material);
        }
      });
    }

    // Phase 1: Show wireframe immediately
    if (loadPhase === 'wireframe') {
      scene.traverse((child) => {
        if ('isMesh' in child && child.isMesh) {
          const mesh = child as THREE.Mesh;
          mesh.material = wireframeMaterial;
        }
      });
      setLoadingState('wireframe');

      // Transition to lowpoly after short delay
      const timer = setTimeout(() => {
        setLoadPhase('lowpoly');
      }, 500);
      return () => clearTimeout(timer);
    }

    // Phase 2: Show low-poly version
    if (loadPhase === 'lowpoly') {
      scene.traverse((child) => {
        if ('isMesh' in child && child.isMesh) {
          const mesh = child as THREE.Mesh;
          mesh.material = lowPolyMaterial;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
        }
      });
      setLoadingState('lowpoly');

      // Transition to full after delay for texture loading
      const timer = setTimeout(() => {
        setLoadPhase('full');
      }, 800);
      return () => clearTimeout(timer);
    }

    // Phase 3: Show full materials
    if (loadPhase === 'full') {
      scene.traverse((child) => {
        if ('isMesh' in child && child.isMesh) {
          const mesh = child as THREE.Mesh;
          const originalMaterial = originalMaterials.current.get(mesh);
          if (originalMaterial) {
            mesh.material = originalMaterial;
          }
          mesh.castShadow = true;
          mesh.receiveShadow = true;
        }
      });
      setLoadingState('full');

      // Mark as complete after final transition
      const timer = setTimeout(() => {
        setLoadingState('complete');
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [scene, loadPhase, wireframeMaterial, lowPolyMaterial, setLoadingState]);

  // Cleanup materials on unmount
  useEffect(() => {
    return () => {
      wireframeMaterial.dispose();
      lowPolyMaterial.dispose();
    };
  }, [wireframeMaterial, lowPolyMaterial]);

  if (!scene) return null;

  return (
    <primitive
      ref={modelRef}
      object={scene}
    />
  );
}

// Preload function for optimization
RoomModel.preload = (url: string) => {
  useGLTF.preload(url);
};
