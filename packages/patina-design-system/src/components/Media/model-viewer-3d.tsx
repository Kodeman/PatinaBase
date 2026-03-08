'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  Play,
  Pause,
  RotateCw,
  Maximize2,
  Minimize2,
  Sun,
  Layers,
  Download,
  Share2,
  Eye,
} from 'lucide-react';
import { cn } from '../../utils/cn';
import { Button } from '../Button';
import { Slider } from '../Slider';
import { Card } from '../Card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../DropdownMenu';

export interface ModelViewer3DProps {
  modelUrl: string;
  textureUrls?: string[];
  enableAR?: boolean;
  enableMaterialSwitch?: boolean;
  enableAnimations?: boolean;
  autoRotate?: boolean;
  className?: string;
}

interface ViewerControls {
  autoRotate: boolean;
  rotationSpeed: number;
  zoom: number;
  lightIntensity: number;
  wireframe: boolean;
  showGrid: boolean;
}

export function ModelViewer3D({
  modelUrl,
  textureUrls = [],
  enableAR = true,
  enableMaterialSwitch = true,
  enableAnimations = true,
  autoRotate: initialAutoRotate = false,
  className,
}: ModelViewer3DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentMaterial, setCurrentMaterial] = useState(0);
  const [animations, setAnimations] = useState<string[]>([]);
  const [currentAnimation, setCurrentAnimation] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [controls, setControls] = useState<ViewerControls>({
    autoRotate: initialAutoRotate,
    rotationSpeed: 0.5,
    zoom: 1,
    lightIntensity: 1,
    wireframe: false,
    showGrid: true,
  });

  const viewerRef = useRef<{
    scene: any;
    camera: any;
    renderer: any;
    model: any;
    mixer: any;
    clock: any;
  } | null>(null);

  useEffect(() => {
    initializeViewer();

    return () => {
      cleanup();
    };
  }, [modelUrl]);

  useEffect(() => {
    updateViewerControls();
  }, [controls]);

  const initializeViewer = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      setIsLoading(true);

      // In a real implementation, we would use Three.js here
      // This is a simplified version showing the structure

      // Simulate loading
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Mock initialization
      viewerRef.current = {
        scene: {},
        camera: {},
        renderer: {},
        model: {},
        mixer: null,
        clock: {},
      };

      // Mock animations
      if (enableAnimations) {
        setAnimations(['idle', 'walk', 'run', 'jump']);
      }

      setIsLoading(false);
      startRenderLoop();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load 3D model');
      setIsLoading(false);
    }
  };

  const startRenderLoop = () => {
    // Animation loop would go here
    // In real implementation:
    // const animate = () => {
    //   requestAnimationFrame(animate);
    //   if (controls.autoRotate) {
    //     viewerRef.current?.model.rotation.y += controls.rotationSpeed * 0.01;
    //   }
    //   if (viewerRef.current?.mixer) {
    //     viewerRef.current.mixer.update(viewerRef.current.clock.getDelta());
    //   }
    //   viewerRef.current?.renderer.render(viewerRef.current.scene, viewerRef.current.camera);
    // };
    // animate();
  };

  const updateViewerControls = () => {
    if (!viewerRef.current) return;

    // Update Three.js controls
    // viewerRef.current.camera.zoom = controls.zoom;
    // viewerRef.current.light.intensity = controls.lightIntensity;
    // viewerRef.current.model.material.wireframe = controls.wireframe;
  };

  const cleanup = () => {
    if (viewerRef.current) {
      // Clean up Three.js resources
      // viewerRef.current.renderer.dispose();
      // viewerRef.current.scene.traverse((object) => {
      //   if (object.geometry) object.geometry.dispose();
      //   if (object.material) object.material.dispose();
      // });
      viewerRef.current = null;
    }
  };

  const toggleFullscreen = () => {
    const container = canvasRef.current?.parentElement;
    if (!container) return;

    if (!isFullscreen) {
      container.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
    setIsFullscreen(!isFullscreen);
  };

  const switchMaterial = (index: number) => {
    setCurrentMaterial(index);
    // In real implementation:
    // const texture = new THREE.TextureLoader().load(textureUrls[index]);
    // viewerRef.current?.model.material.map = texture;
  };

  const playAnimation = (animationName: string) => {
    setCurrentAnimation(animationName);
    setIsPlaying(true);
    // In real implementation:
    // const action = viewerRef.current?.mixer.clipAction(animation);
    // action.play();
  };

  const pauseAnimation = () => {
    setIsPlaying(false);
    // In real implementation:
    // viewerRef.current?.mixer.stopAllAction();
  };

  const resetCamera = () => {
    setControls((prev) => ({ ...prev, zoom: 1 }));
    // Reset camera position and rotation
  };

  const downloadModel = () => {
    // Implement model download
    const link = document.createElement('a');
    link.href = modelUrl;
    link.download = 'model.glb';
    link.click();
  };

  const openInAR = () => {
    // Open in AR viewer (iOS QuickLook or Android Scene Viewer)
    if ('xr' in navigator) {
      // WebXR implementation
    } else {
      // Fallback to AR Quick Look (iOS) or Scene Viewer (Android)
      const a = document.createElement('a');
      a.rel = 'ar';
      a.href = modelUrl;
      a.click();
    }
  };

  if (error) {
    return (
      <Card className={cn('p-8 text-center', className)}>
        <p className="text-red-500">Error loading 3D model: {error}</p>
        <Button variant="outline" className="mt-4" onClick={initializeViewer}>
          Retry
        </Button>
      </Card>
    );
  }

  return (
    <div className={cn('relative', className)}>
      {/* Canvas */}
      <div className="relative bg-gray-100 rounded-lg overflow-hidden">
        <canvas
          ref={canvasRef}
          className="w-full h-[600px]"
          style={{ touchAction: 'none' }}
        />

        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
              <p className="text-sm text-gray-600">Loading 3D model...</p>
            </div>
          </div>
        )}

        {/* Top Controls */}
        <div className="absolute top-4 left-4 right-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                setControls((prev) => ({
                  ...prev,
                  autoRotate: !prev.autoRotate,
                }))
              }
            >
              <RotateCw
                className={cn(
                  'h-4 w-4',
                  controls.autoRotate && 'animate-spin'
                )}
              />
            </Button>
            <Button variant="secondary" size="sm" onClick={resetCamera}>
              Reset View
            </Button>
          </div>

          <div className="flex items-center gap-2">
            {enableAR && (
              <Button variant="secondary" size="sm" onClick={openInAR}>
                <Eye className="h-4 w-4 mr-2" />
                View in AR
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={downloadModel}>
              <Download className="h-4 w-4" />
            </Button>
            <Button variant="secondary" size="sm" onClick={toggleFullscreen}>
              {isFullscreen ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Bottom Controls */}
        <div className="absolute bottom-4 left-4 right-4">
          <Card className="p-4 bg-white/95 backdrop-blur">
            <div className="space-y-4">
              {/* Animations */}
              {enableAnimations && animations.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Animation</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        isPlaying
                          ? pauseAnimation()
                          : currentAnimation && playAnimation(currentAnimation)
                      }
                    >
                      {isPlaying ? (
                        <Pause className="h-4 w-4" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {animations.map((anim) => (
                      <Button
                        key={anim}
                        variant={currentAnimation === anim ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => playAnimation(anim)}
                      >
                        {anim}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {/* Materials */}
              {enableMaterialSwitch && textureUrls.length > 1 && (
                <div>
                  <span className="text-sm font-medium mb-2 block">
                    Materials
                  </span>
                  <div className="flex gap-2">
                    {textureUrls.map((url, index) => (
                      <button
                        key={index}
                        onClick={() => switchMaterial(index)}
                        className={cn(
                          'w-12 h-12 rounded border-2 transition-all',
                          currentMaterial === index
                            ? 'border-primary scale-110'
                            : 'border-gray-300'
                        )}
                        style={{
                          backgroundImage: `url(${url})`,
                          backgroundSize: 'cover',
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Lighting & Zoom */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">
                      <Sun className="h-4 w-4 inline mr-1" />
                      Light
                    </span>
                    <span className="text-xs text-gray-500">
                      {Math.round(controls.lightIntensity * 100)}%
                    </span>
                  </div>
                  <Slider
                    value={[controls.lightIntensity * 100]}
                    onValueChange={([value]) =>
                      setControls((prev) => ({
                        ...prev,
                        lightIntensity: value / 100,
                      }))
                    }
                    min={0}
                    max={200}
                    step={10}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Zoom</span>
                    <span className="text-xs text-gray-500">
                      {Math.round(controls.zoom * 100)}%
                    </span>
                  </div>
                  <Slider
                    value={[controls.zoom * 100]}
                    onValueChange={([value]) =>
                      setControls((prev) => ({ ...prev, zoom: value / 100 }))
                    }
                    min={10}
                    max={500}
                    step={10}
                  />
                </div>
              </div>

              {/* View Options */}
              <div className="flex items-center gap-4 pt-2 border-t">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={controls.wireframe}
                    onChange={(e) =>
                      setControls((prev) => ({
                        ...prev,
                        wireframe: e.target.checked,
                      }))
                    }
                    className="rounded"
                  />
                  Wireframe
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={controls.showGrid}
                    onChange={(e) =>
                      setControls((prev) => ({
                        ...prev,
                        showGrid: e.target.checked,
                      }))
                    }
                    className="rounded"
                  />
                  Grid
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={controls.autoRotate}
                    onChange={(e) =>
                      setControls((prev) => ({
                        ...prev,
                        autoRotate: e.target.checked,
                      }))
                    }
                    className="rounded"
                  />
                  Auto Rotate
                </label>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Instructions */}
      <div className="mt-4 p-4 bg-blue-50 rounded-lg">
        <p className="text-sm text-blue-900">
          <strong>Controls:</strong> Left click + drag to rotate • Right click +
          drag to pan • Scroll to zoom
        </p>
      </div>
    </div>
  );
}
