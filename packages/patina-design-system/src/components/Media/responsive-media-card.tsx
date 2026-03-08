'use client';

import React, { useState } from 'react';
import { MoreVertical, Download, Edit, Trash2, Share2 } from 'lucide-react';
import { cn } from '../../utils/cn';
import { formatFileSize } from '../../utils/format';
import { Button } from '../Button';
import { Card } from '../Card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../DropdownMenu';
import { MediaAsset } from '@patina/types/media';

export interface ResponsiveMediaCardProps {
  asset: MediaAsset;
  onClick?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onDownload?: () => void;
  onShare?: () => void;
  selected?: boolean;
  onSelect?: () => void;
  className?: string;
}

export function ResponsiveMediaCard({
  asset,
  onClick,
  onEdit,
  onDelete,
  onDownload,
  onShare,
  selected = false,
  onSelect,
  className,
}: ResponsiveMediaCardProps) {
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(
    null
  );
  const [touchEnd, setTouchEnd] = useState<{ x: number; y: number } | null>(
    null
  );

  // Swipe detection
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart({
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    });
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEnd({
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    });
  };

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;

    const deltaX = touchEnd.x - touchStart.x;
    const deltaY = touchEnd.y - touchStart.y;

    // Detect swipe left (threshold: 50px)
    if (Math.abs(deltaX) > 50 && Math.abs(deltaY) < 30) {
      if (deltaX < 0) {
        // Swipe left - show actions
        setShowActions(true);
      } else {
        // Swipe right - hide actions
        setShowActions(false);
      }
    }

    setTouchStart(null);
    setTouchEnd(null);
  };

  const [showActions, setShowActions] = useState(false);

  return (
    <Card
      className={cn(
        'group relative overflow-hidden transition-all',
        selected && 'ring-2 ring-primary',
        className
      )}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Main content */}
      <div
        className={cn(
          'transition-transform duration-200',
          showActions && 'transform -translate-x-24'
        )}
        onClick={onClick}
      >
        {/* Image/Thumbnail */}
        <div className="relative aspect-square bg-gray-100">
          <img
            src={asset.thumbnailUrl || asset.url}
            alt={asset.altText || asset.name}
            className="w-full h-full object-cover"
            loading="lazy"
          />

          {/* Mobile: Long press to select */}
          {onSelect && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSelect();
              }}
              className={cn(
                'absolute top-2 left-2 w-6 h-6 rounded-full border-2 transition-all',
                selected
                  ? 'bg-primary border-primary'
                  : 'bg-white/80 border-gray-300 md:opacity-0 md:group-hover:opacity-100'
              )}
            >
              {selected && (
                <svg
                  className="w-4 h-4 text-white mx-auto"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
            </button>
          )}

          {/* Desktop: Hover menu */}
          <div className="hidden md:block absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="icon" className="h-8 w-8">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {onEdit && (
                  <DropdownMenuItem onClick={onEdit}>
                    <Edit className="h-4 w-4 mr-2" />
                    Edit
                  </DropdownMenuItem>
                )}
                {onDownload && (
                  <DropdownMenuItem onClick={onDownload}>
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </DropdownMenuItem>
                )}
                {onShare && (
                  <DropdownMenuItem onClick={onShare}>
                    <Share2 className="h-4 w-4 mr-2" />
                    Share
                  </DropdownMenuItem>
                )}
                {onDelete && (
                  <DropdownMenuItem onClick={onDelete} className="text-red-600">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Info */}
        <div className="p-3">
          <p className="text-sm font-medium truncate">{asset.name}</p>
          <div className="flex items-center justify-between mt-1">
            <p className="text-xs text-gray-500">{formatFileSize(asset.size)}</p>
            {asset.tags && asset.tags.length > 0 && (
              <span className="text-xs px-2 py-0.5 bg-gray-100 rounded">
                {asset.tags[0]}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Mobile: Swipe actions */}
      <div
        className={cn(
          'md:hidden absolute right-0 top-0 bottom-0 w-24 bg-gray-100 flex items-center justify-center gap-1 transition-opacity',
          showActions ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
      >
        {onEdit && (
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
              setShowActions(false);
            }}
          >
            <Edit className="h-4 w-4" />
          </Button>
        )}
        {onDelete && (
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
              setShowActions(false);
            }}
            className="text-red-600"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </Card>
  );
}
