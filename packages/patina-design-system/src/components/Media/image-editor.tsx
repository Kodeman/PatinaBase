'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  RotateCw,
  RotateCcw,
  FlipHorizontal,
  FlipVertical,
  Crop,
  Sliders,
  Download,
  X,
  Check,
  ZoomIn,
  ZoomOut,
  Move,
  Maximize2,
} from 'lucide-react';
import { cn } from '../../utils/cn';
import { Button } from '../Button';
import { Card } from '../Card';
import { Slider } from '../Slider';
import { Input } from '../Input';
import { Label } from '../Label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../Tabs';
import { ImageEditorState } from '@patina/types/media';

export interface ImageEditorProps {
  imageUrl: string;
  onSave?: (editedImage: Blob, edits: ImageEditorState) => void;
  onCancel?: () => void;
  altText?: string;
  className?: string;
}

const ASPECT_RATIOS = [
  { label: 'Free', value: undefined },
  { label: '1:1', value: 1 },
  { label: '4:3', value: 4 / 3 },
  { label: '16:9', value: 16 / 9 },
  { label: '3:2', value: 3 / 2 },
];

export function ImageEditor({
  imageUrl,
  onSave,
  onCancel,
  altText = '',
  className,
}: ImageEditorProps) {
  const [editorState, setEditorState] = useState<ImageEditorState>({
    rotation: 0,
    flip: { horizontal: false, vertical: false },
    adjustments: { brightness: 100, contrast: 100, saturation: 100 },
  });

  const [cropMode, setCropMode] = useState(false);
  const [cropStart, setCropStart] = useState<{ x: number; y: number } | null>(null);
  const [cropEnd, setCropEnd] = useState<{ x: number; y: number } | null>(null);
  const [selectedAspect, setSelectedAspect] = useState<number | undefined>(undefined);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [altTextValue, setAltTextValue] = useState(altText);
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      (imageRef as React.MutableRefObject<HTMLImageElement | null>).current = img;
      drawImage();
    };
    img.src = imageUrl;
  }, [imageUrl]);

  useEffect(() => {
    drawImage();
  }, [editorState, zoom, pan]);

  const drawImage = () => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size to match container
    const container = containerRef.current;
    if (container) {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    }

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Save context state
    ctx.save();

    // Apply pan and zoom
    ctx.translate(canvas.width / 2 + pan.x, canvas.height / 2 + pan.y);
    ctx.scale(zoom, zoom);

    // Apply rotation
    ctx.rotate((editorState.rotation * Math.PI) / 180);

    // Apply flip
    ctx.scale(
      editorState.flip.horizontal ? -1 : 1,
      editorState.flip.vertical ? -1 : 1
    );

    // Calculate image dimensions to fit canvas
    const scale = Math.min(
      canvas.width / img.width / zoom,
      canvas.height / img.height / zoom
    );
    const width = img.width * scale;
    const height = img.height * scale;

    // Apply filters
    ctx.filter = `brightness(${editorState.adjustments.brightness}%) contrast(${editorState.adjustments.contrast}%) saturate(${editorState.adjustments.saturation}%)`;

    // Draw image
    ctx.drawImage(img, -width / 2, -height / 2, width, height);

    // Restore context
    ctx.restore();

    // Draw crop overlay
    if (cropMode && cropStart && cropEnd) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const cropX = Math.min(cropStart.x, cropEnd.x);
      const cropY = Math.min(cropStart.y, cropEnd.y);
      const cropWidth = Math.abs(cropEnd.x - cropStart.x);
      const cropHeight = Math.abs(cropEnd.y - cropStart.y);

      ctx.clearRect(cropX, cropY, cropWidth, cropHeight);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.strokeRect(cropX, cropY, cropWidth, cropHeight);

      // Draw grid lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = 1;
      for (let i = 1; i < 3; i++) {
        const x = cropX + (cropWidth / 3) * i;
        const y = cropY + (cropHeight / 3) * i;
        ctx.beginPath();
        ctx.moveTo(x, cropY);
        ctx.lineTo(x, cropY + cropHeight);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cropX, y);
        ctx.lineTo(cropX + cropWidth, y);
        ctx.stroke();
      }
    }

    // Draw focus point
    if (focusPoint) {
      ctx.fillStyle = 'rgba(59, 130, 246, 0.3)';
      ctx.beginPath();
      ctx.arc(focusPoint.x, focusPoint.y, 30, 0, 2 * Math.PI);
      ctx.fill();
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  };

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (cropMode) {
      setCropStart({ x, y });
      setCropEnd({ x, y });
    } else {
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (cropMode && cropStart) {
      let newX = x;
      let newY = y;

      if (selectedAspect) {
        const width = Math.abs(newX - cropStart.x);
        const height = width / selectedAspect;
        newY = cropStart.y + (newY > cropStart.y ? height : -height);
      }

      setCropEnd({ x: newX, y: newY });
      drawImage();
    } else if (isDragging) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleCanvasMouseUp = () => {
    if (isDragging) {
      setIsDragging(false);
    }
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (cropMode) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setFocusPoint({ x, y });
    setEditorState((prev) => ({ ...prev, focusPoint: { x, y } }));
  };

  const rotate = (degrees: number) => {
    setEditorState((prev) => ({
      ...prev,
      rotation: (prev.rotation + degrees) % 360,
    }));
  };

  const flip = (direction: 'horizontal' | 'vertical') => {
    setEditorState((prev) => ({
      ...prev,
      flip: {
        ...prev.flip,
        [direction]: !prev.flip[direction],
      },
    }));
  };

  const updateAdjustment = (
    key: keyof ImageEditorState['adjustments'],
    value: number
  ) => {
    setEditorState((prev) => ({
      ...prev,
      adjustments: { ...prev.adjustments, [key]: value },
    }));
  };

  const applyCrop = () => {
    if (!cropStart || !cropEnd) return;

    const cropX = Math.min(cropStart.x, cropEnd.x);
    const cropY = Math.min(cropStart.y, cropEnd.y);
    const cropWidth = Math.abs(cropEnd.x - cropStart.x);
    const cropHeight = Math.abs(cropEnd.y - cropStart.y);

    setEditorState((prev) => ({
      ...prev,
      crop: {
        x: cropX,
        y: cropY,
        width: cropWidth,
        height: cropHeight,
        aspect: selectedAspect,
      },
    }));

    setCropMode(false);
    setCropStart(null);
    setCropEnd(null);
  };

  const resetCrop = () => {
    setCropMode(false);
    setCropStart(null);
    setCropEnd(null);
    setEditorState((prev) => ({ ...prev, crop: undefined }));
  };

  const handleSave = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !onSave) return;

    canvas.toBlob((blob) => {
      if (blob) {
        onSave(blob, { ...editorState, focusPoint: focusPoint || undefined });
      }
    }, 'image/jpeg', 0.95);
  };

  const resetAll = () => {
    setEditorState({
      rotation: 0,
      flip: { horizontal: false, vertical: false },
      adjustments: { brightness: 100, contrast: 100, saturation: 100 },
    });
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setFocusPoint(null);
    resetCrop();
  };

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => rotate(-90)}>
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => rotate(90)}>
            <RotateCw className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => flip('horizontal')}
          >
            <FlipHorizontal className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => flip('vertical')}>
            <FlipVertical className="h-4 w-4" />
          </Button>
          <Button
            variant={cropMode ? 'default' : 'outline'}
            size="sm"
            onClick={() => setCropMode(!cropMode)}
          >
            <Crop className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setZoom(zoom + 0.1)}>
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setZoom(Math.max(0.1, zoom - 0.1))}
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={resetAll}>
            Reset
          </Button>
          <Button variant="outline" size="sm" onClick={onCancel}>
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave}>
            <Check className="h-4 w-4 mr-2" />
            Save
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Canvas */}
        <div
          ref={containerRef}
          className="flex-1 bg-gray-100 relative overflow-hidden"
        >
          <canvas
            ref={canvasRef}
            className="w-full h-full cursor-crosshair"
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            onMouseLeave={handleCanvasMouseUp}
            onClick={handleCanvasClick}
          />

          {cropMode && (
            <div className="absolute top-4 left-4 bg-white p-3 rounded-lg shadow-lg">
              <p className="text-sm font-medium mb-2">Crop Aspect Ratio</p>
              <div className="flex gap-2">
                {ASPECT_RATIOS.map((ratio) => (
                  <Button
                    key={ratio.label}
                    variant={
                      selectedAspect === ratio.value ? 'default' : 'outline'
                    }
                    size="sm"
                    onClick={() => setSelectedAspect(ratio.value)}
                  >
                    {ratio.label}
                  </Button>
                ))}
              </div>
              <div className="flex gap-2 mt-3">
                <Button size="sm" onClick={applyCrop}>
                  <Check className="h-4 w-4 mr-2" />
                  Apply
                </Button>
                <Button variant="outline" size="sm" onClick={resetCrop}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Side Panel */}
        <div className="w-80 border-l overflow-y-auto">
          <Tabs defaultValue="adjustments" className="w-full">
            <TabsList className="w-full grid grid-cols-2">
              <TabsTrigger value="adjustments">
                <Sliders className="h-4 w-4 mr-2" />
                Adjustments
              </TabsTrigger>
              <TabsTrigger value="details">Details</TabsTrigger>
            </TabsList>

            <TabsContent value="adjustments" className="p-4 space-y-6">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Brightness</Label>
                  <span className="text-sm text-gray-500">
                    {editorState.adjustments.brightness}%
                  </span>
                </div>
                <Slider
                  value={[editorState.adjustments.brightness]}
                  onValueChange={([value]) =>
                    updateAdjustment('brightness', value)
                  }
                  min={0}
                  max={200}
                  step={1}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Contrast</Label>
                  <span className="text-sm text-gray-500">
                    {editorState.adjustments.contrast}%
                  </span>
                </div>
                <Slider
                  value={[editorState.adjustments.contrast]}
                  onValueChange={([value]) => updateAdjustment('contrast', value)}
                  min={0}
                  max={200}
                  step={1}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Saturation</Label>
                  <span className="text-sm text-gray-500">
                    {editorState.adjustments.saturation}%
                  </span>
                </div>
                <Slider
                  value={[editorState.adjustments.saturation]}
                  onValueChange={([value]) =>
                    updateAdjustment('saturation', value)
                  }
                  min={0}
                  max={200}
                  step={1}
                />
              </div>

              {focusPoint && (
                <Card className="p-3 bg-blue-50">
                  <p className="text-sm font-medium mb-1">Focus Point Set</p>
                  <p className="text-xs text-gray-600">
                    Click on the image to change focus point
                  </p>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="details" className="p-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="alt-text">Alt Text</Label>
                <Input
                  id="alt-text"
                  value={altTextValue}
                  onChange={(e) => setAltTextValue(e.target.value)}
                  placeholder="Describe this image for accessibility..."
                />
                <p className="text-xs text-gray-500">
                  Help screen readers understand this image
                </p>
              </div>

              <div className="space-y-2">
                <Label>Transformations</Label>
                <div className="text-sm space-y-1">
                  <p>Rotation: {editorState.rotation}°</p>
                  <p>
                    Flip: {editorState.flip.horizontal ? 'H' : ''}
                    {editorState.flip.vertical ? 'V' : ''}
                    {!editorState.flip.horizontal &&
                    !editorState.flip.vertical
                      ? 'None'
                      : ''}
                  </p>
                  {editorState.crop && (
                    <p>
                      Crop: {Math.round(editorState.crop.width)} x{' '}
                      {Math.round(editorState.crop.height)}
                    </p>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
