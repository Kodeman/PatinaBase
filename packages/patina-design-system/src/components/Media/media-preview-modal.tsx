'use client';

import React from 'react';
import {
  X,
  Download,
  Share2,
  Edit,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Info,
} from 'lucide-react';
import { cn } from '../../utils/cn';
import { formatDate, formatFileSize } from '../../utils/format';
import { Button } from '../Button';
import { Dialog, DialogContent } from '../Dialog';
import { Card } from '../Card';
import { MediaAsset } from '@patina/types/media';
import { ModelViewer3D } from './model-viewer-3d';

export interface MediaPreviewModalProps {
  asset: MediaAsset | null;
  assets?: MediaAsset[];
  open: boolean;
  onClose: () => void;
  onEdit?: (asset: MediaAsset) => void;
  onDelete?: (asset: MediaAsset) => void;
  onDownload?: (asset: MediaAsset) => void;
  onShare?: (asset: MediaAsset) => void;
  showNavigation?: boolean;
}

export function MediaPreviewModal({
  asset,
  assets = [],
  open,
  onClose,
  onEdit,
  onDelete,
  onDownload,
  onShare,
  showNavigation = true,
}: MediaPreviewModalProps) {
  const [zoom, setZoom] = React.useState(1);
  const [showInfo, setShowInfo] = React.useState(false);

  const currentIndex = asset ? assets.findIndex((a) => a.id === asset.id) : -1;
  const hasNext = currentIndex < assets.length - 1;
  const hasPrev = currentIndex > 0;

  const handleNext = () => {
    if (hasNext && currentIndex >= 0) {
      const nextAsset = assets[currentIndex + 1];
      // In a real implementation, this would update the asset prop
    }
  };

  const handlePrev = () => {
    if (hasPrev && currentIndex >= 0) {
      const prevAsset = assets[currentIndex - 1];
      // In a real implementation, this would update the asset prop
    }
  };

  const resetZoom = () => setZoom(1);

  React.useEffect(() => {
    if (!open) {
      resetZoom();
      setShowInfo(false);
    }
  }, [open]);

  if (!asset) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 overflow-hidden">
        {/* Header */}
        <div className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-black/80 to-transparent p-4">
          <div className="flex items-center justify-between">
            <div className="text-white">
              <h3 className="font-semibold truncate max-w-md">{asset.name}</h3>
              <p className="text-sm text-gray-300">
                {formatFileSize(asset.size)} • {formatDate(asset.createdAt)}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowInfo(!showInfo)}
                className="text-white hover:bg-white/20"
              >
                <Info className="h-5 w-5" />
              </Button>
              {onEdit && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onEdit(asset)}
                  className="text-white hover:bg-white/20"
                >
                  <Edit className="h-5 w-5" />
                </Button>
              )}
              {onDownload && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onDownload(asset)}
                  className="text-white hover:bg-white/20"
                >
                  <Download className="h-5 w-5" />
                </Button>
              )}
              {onShare && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onShare(asset)}
                  className="text-white hover:bg-white/20"
                >
                  <Share2 className="h-5 w-5" />
                </Button>
              )}
              {onDelete && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onDelete(asset)}
                  className="text-white hover:bg-white/20 hover:text-red-400"
                >
                  <Trash2 className="h-5 w-5" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="text-white hover:bg-white/20"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="relative bg-black flex items-center justify-center min-h-[500px] max-h-[80vh]">
          {asset.type === 'image' && (
            <>
              <img
                src={asset.url}
                alt={asset.altText || asset.name}
                className="max-w-full max-h-full object-contain transition-transform"
                style={{ transform: `scale(${zoom})` }}
              />
              <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex items-center gap-2 bg-black/60 rounded-lg p-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setZoom(Math.max(0.1, zoom - 0.1))}
                  className="text-white hover:bg-white/20"
                >
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <span className="text-white text-sm min-w-[60px] text-center">
                  {Math.round(zoom * 100)}%
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setZoom(zoom + 0.1)}
                  className="text-white hover:bg-white/20"
                >
                  <ZoomIn className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={resetZoom}
                  className="text-white hover:bg-white/20"
                >
                  <Maximize2 className="h-4 w-4" />
                </Button>
              </div>
            </>
          )}

          {asset.type === 'video' && (
            <video
              src={asset.url}
              controls
              className="max-w-full max-h-full"
              autoPlay
            />
          )}

          {asset.type === '3d' && (
            <div className="w-full h-full p-4">
              <ModelViewer3D
                modelUrl={asset.url}
                enableAR={true}
                enableMaterialSwitch={true}
                enableAnimations={true}
                autoRotate={true}
              />
            </div>
          )}

          {asset.type === 'document' && (
            <div className="text-white text-center p-8">
              <p className="mb-4">Document preview not available</p>
              <Button
                onClick={() => onDownload?.(asset)}
                className="bg-white text-black hover:bg-gray-200"
              >
                <Download className="h-4 w-4 mr-2" />
                Download to view
              </Button>
            </div>
          )}

          {/* Navigation */}
          {showNavigation && assets.length > 1 && (
            <>
              {hasPrev && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handlePrev}
                  className="absolute left-4 top-1/2 transform -translate-y-1/2 text-white hover:bg-white/20 h-12 w-12"
                >
                  <ChevronLeft className="h-8 w-8" />
                </Button>
              )}
              {hasNext && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleNext}
                  className="absolute right-4 top-1/2 transform -translate-y-1/2 text-white hover:bg-white/20 h-12 w-12"
                >
                  <ChevronRight className="h-8 w-8" />
                </Button>
              )}
            </>
          )}
        </div>

        {/* Info Panel */}
        {showInfo && (
          <div className="absolute right-0 top-0 bottom-0 w-80 bg-white border-l shadow-lg overflow-y-auto">
            <div className="p-4 border-b">
              <h4 className="font-semibold">Asset Details</h4>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-500">Name</label>
                <p className="text-sm break-all">{asset.name}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Type</label>
                <p className="text-sm capitalize">{asset.type}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Size</label>
                <p className="text-sm">{formatFileSize(asset.size)}</p>
              </div>
              {asset.dimensions && (
                <div>
                  <label className="text-sm font-medium text-gray-500">
                    Dimensions
                  </label>
                  <p className="text-sm">
                    {asset.dimensions.width} x {asset.dimensions.height}
                  </p>
                </div>
              )}
              <div>
                <label className="text-sm font-medium text-gray-500">
                  Created
                </label>
                <p className="text-sm">{formatDate(asset.createdAt)}</p>
              </div>
              {asset.altText && (
                <div>
                  <label className="text-sm font-medium text-gray-500">
                    Alt Text
                  </label>
                  <p className="text-sm">{asset.altText}</p>
                </div>
              )}
              {asset.tags && asset.tags.length > 0 && (
                <div>
                  <label className="text-sm font-medium text-gray-500">Tags</label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {asset.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-xs px-2 py-1 bg-gray-100 rounded"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {asset.usage && asset.usage.length > 0 && (
                <div>
                  <label className="text-sm font-medium text-gray-500">
                    Used In
                  </label>
                  <div className="space-y-2 mt-2">
                    {asset.usage.map((usage) => (
                      <Card key={usage.id} className="p-2">
                        <p className="text-sm font-medium">{usage.itemName}</p>
                        <p className="text-xs text-gray-500 capitalize">
                          {usage.type}
                        </p>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
