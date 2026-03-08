'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  Grid3x3,
  List,
  Search,
  Filter,
  Download,
  Trash2,
  Eye,
  MoreVertical,
  CheckSquare,
  Square,
  Tag,
  Loader2,
} from 'lucide-react';
import { cn } from '../../utils/cn';
import { formatDate, formatFileSize } from '../../utils/format';
import { Button } from '../Button';
import { Input } from '../Input';
import { Card } from '../Card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../DropdownMenu';
import {
  MediaAsset,
  ViewMode,
  SortField,
  SortOrder,
  MediaFilter,
} from '@patina/types/media';

export interface MediaGalleryProps {
  assets: MediaAsset[];
  loading?: boolean;
  viewMode?: ViewMode;
  enableSelection?: boolean;
  enableBatchActions?: boolean;
  selectionMode?: 'single' | 'multiple' | 'none';
  onSelectionChange?: (selected: MediaAsset[]) => void;
  onViewModeChange?: (viewMode: ViewMode) => void;
  onSearchChange?: (query: string) => void;
  onSortChange?: (field: SortField, order: SortOrder) => void;
  onAssetClick?: (asset: MediaAsset) => void;
  onAssetDelete?: (assetIds: string[]) => void;
  onAssetDownload?: (assetIds: string[]) => void;
  onAssetTag?: (assetIds: string[], tags: string[]) => void;
  className?: string;
}

export function MediaGallery({
  assets,
  loading = false,
  viewMode: initialViewMode = 'grid',
  enableSelection = true,
  enableBatchActions = true,
  selectionMode: controlledSelectionMode,
  onSelectionChange,
  onViewModeChange,
  onSearchChange,
  onSortChange,
  onAssetClick,
  onAssetDelete,
  onAssetDownload,
  onAssetTag,
  className,
}: MediaGalleryProps) {
  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode);
  const [selectionMode, setSelectionMode] = useState<'single' | 'multiple' | 'none'>(
    controlledSelectionMode ?? (enableSelection ? 'multiple' : 'none')
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [visibleAssets, setVisibleAssets] = useState<MediaAsset[]>([]);
  const parentRef = useRef<HTMLDivElement>(null);
  const observerTargets = useRef<Map<string, HTMLDivElement>>(new Map());
  const allowSelection = selectionMode !== 'none';

  useEffect(() => {
    if (!controlledSelectionMode) return;
    setSelectionMode((prev) => {
      if (prev === controlledSelectionMode) return prev;
      if (controlledSelectionMode === 'none') {
        setSelectedIds(new Set());
      }
      return controlledSelectionMode;
    });
  }, [controlledSelectionMode]);

  useEffect(() => {
    if (!onSelectionChange) return;
    const selectedAssets = assets.filter((asset) => selectedIds.has(asset.id));
    onSelectionChange(selectedAssets);
  }, [assets, onSelectionChange, selectedIds]);

  useEffect(() => {
    onViewModeChange?.(viewMode);
  }, [viewMode, onViewModeChange]);

  useEffect(() => {
    onSearchChange?.(searchQuery);
  }, [searchQuery, onSearchChange]);

  useEffect(() => {
    onSortChange?.(sortField, sortOrder);
  }, [sortField, sortOrder, onSortChange]);

  // Filter and sort assets
  const filteredAssets = React.useMemo(() => {
    let filtered = assets;

    if (searchQuery) {
      filtered = filtered.filter(
        (asset) =>
          asset.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          asset.tags?.some((tag) =>
            tag.toLowerCase().includes(searchQuery.toLowerCase())
          )
      );
    }

    return filtered.sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'date':
          comparison =
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        case 'size':
          comparison = a.size - b.size;
          break;
        case 'type':
          comparison = a.type.localeCompare(b.type);
          break;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [assets, searchQuery, sortField, sortOrder]);

  // Virtual scrolling for grid view
  const gridVirtualizer = useVirtualizer({
    count: Math.ceil(filteredAssets.length / 4),
    getScrollElement: () => parentRef.current,
    estimateSize: () => 250,
    overscan: 2,
  });

  // Virtual scrolling for list view
  const listVirtualizer = useVirtualizer({
    count: filteredAssets.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 80,
    overscan: 5,
  });

  // Intersection observer for lazy loading images
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const assetId = entry.target.getAttribute('data-asset-id');
            if (assetId) {
              const asset = filteredAssets.find((a) => a.id === assetId);
              if (asset && !visibleAssets.find((a) => a.id === assetId)) {
                setVisibleAssets((prev) => [...prev, asset]);
              }
            }
          }
        });
      },
      { rootMargin: '50px' }
    );

    observerTargets.current.forEach((target) => {
      observer.observe(target);
    });

    return () => observer.disconnect();
  }, [filteredAssets]);

  const toggleSelection = (id: string) => {
    if (!allowSelection) return;

    setSelectedIds((prev) => {
      const next = new Set(prev);

      if (selectionMode === 'single') {
        if (next.has(id)) {
          next.clear();
        } else {
          next.clear();
          next.add(id);
        }
        return next;
      }

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAll = () => {
    if (!allowSelection) return;

    if (selectionMode === 'single') {
      const first = filteredAssets[0];
      if (first) {
        setSelectedIds(new Set([first.id]));
      }
      return;
    }

    setSelectedIds(new Set(filteredAssets.map((a) => a.id)));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const handleBatchDelete = () => {
    if (onAssetDelete && selectedIds.size > 0) {
      onAssetDelete(Array.from(selectedIds));
      setSelectedIds(new Set());
    }
  };

  const handleBatchDownload = () => {
    if (onAssetDownload && selectedIds.size > 0) {
      onAssetDownload(Array.from(selectedIds));
    }
  };

  const registerObserverTarget = useCallback((id: string, element: HTMLDivElement | null) => {
    if (element) {
      observerTargets.current.set(id, element);
    } else {
      observerTargets.current.delete(id);
    }
  }, []);

  const isAssetVisible = (assetId: string) => {
    return visibleAssets.some((a) => a.id === assetId);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-[300px]">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search assets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          {enableBatchActions && selectedIds.size > 0 && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleBatchDownload}
              >
                <Download className="h-4 w-4 mr-2" />
                Download ({selectedIds.size})
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleBatchDelete}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete ({selectedIds.size})
              </Button>
            </>
          )}

          <div className="flex items-center border rounded-md">
            <Button
              variant={viewMode === 'grid' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('grid')}
            >
              <Grid3x3 className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('list')}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {allowSelection && filteredAssets.length > 0 && (
        <div className="flex items-center gap-2 mb-4">
          <Button variant="outline" size="sm" onClick={selectAll}>
            Select All
          </Button>
          {selectedIds.size > 0 && (
            <Button variant="outline" size="sm" onClick={deselectAll}>
              Deselect All ({selectedIds.size})
            </Button>
          )}
        </div>
      )}

      {/* Gallery */}
      <div ref={parentRef} className="flex-1 overflow-auto">
        {filteredAssets.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <Search className="h-12 w-12 mb-4" />
            <p>No assets found</p>
          </div>
        ) : viewMode === 'grid' ? (
          <div
            style={{
              height: `${gridVirtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {gridVirtualizer.getVirtualItems().map((virtualRow) => {
              const startIndex = virtualRow.index * 4;
              const rowAssets = filteredAssets.slice(startIndex, startIndex + 4);

              return (
                <div
                  key={virtualRow.key}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  className="grid grid-cols-4 gap-4"
                >
                  {rowAssets.map((asset) => (
                    <div
                      key={asset.id}
                      ref={(el) => registerObserverTarget(asset.id, el)}
                      data-asset-id={asset.id}
                    >
                      <Card
                        className={cn(
                          'group cursor-pointer transition-all hover:shadow-lg',
                          selectedIds.has(asset.id) && 'ring-2 ring-primary'
                        )}
                        onClick={() => onAssetClick?.(asset)}
                      >
                        <div className="relative aspect-square">
                          {isAssetVisible(asset.id) ? (
                            <img
                              src={asset.thumbnailUrl || asset.url}
                              alt={asset.altText || asset.name}
                              className="w-full h-full object-cover rounded-t-lg"
                              loading="lazy"
                            />
                          ) : (
                            <div className="w-full h-full bg-gray-200 rounded-t-lg animate-pulse" />
                          )}

                          {allowSelection && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleSelection(asset.id);
                              }}
                              className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              {selectedIds.has(asset.id) ? (
                                <CheckSquare className="h-5 w-5 text-primary" />
                              ) : (
                                <Square className="h-5 w-5 text-white drop-shadow-lg" />
                              )}
                            </button>
                          )}

                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => onAssetClick?.(asset)}>
                                <Eye className="h-4 w-4 mr-2" />
                                View
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => onAssetDownload?.([asset.id])}
                              >
                                <Download className="h-4 w-4 mr-2" />
                                Download
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => onAssetDelete?.([asset.id])}
                                className="text-red-600"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>

                        <div className="p-3">
                          <p className="text-sm font-medium truncate">{asset.name}</p>
                          <p className="text-xs text-gray-500">
                            {formatFileSize(asset.size)}
                          </p>
                          {asset.tags && asset.tags.length > 0 && (
                            <div className="flex gap-1 mt-2">
                              {asset.tags.slice(0, 2).map((tag) => (
                                <span
                                  key={tag}
                                  className="text-xs px-2 py-1 bg-gray-100 rounded"
                                >
                                  {tag}
                                </span>
                              ))}
                              {asset.tags.length > 2 && (
                                <span className="text-xs px-2 py-1 bg-gray-100 rounded">
                                  +{asset.tags.length - 2}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </Card>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        ) : (
          <div
            style={{
              height: `${listVirtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {listVirtualizer.getVirtualItems().map((virtualItem) => {
              const asset = filteredAssets[virtualItem.index];

              return (
                <div
                  key={virtualItem.key}
                  ref={(el) => registerObserverTarget(asset.id, el)}
                  data-asset-id={asset.id}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualItem.size}px`,
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  <Card
                    className={cn(
                      'flex items-center gap-4 p-4 cursor-pointer hover:shadow-md transition-shadow',
                      selectedIds.has(asset.id) && 'ring-2 ring-primary'
                    )}
                    onClick={() => onAssetClick?.(asset)}
                  >
                    {allowSelection && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSelection(asset.id);
                        }}
                      >
                        {selectedIds.has(asset.id) ? (
                          <CheckSquare className="h-5 w-5 text-primary" />
                        ) : (
                          <Square className="h-5 w-5" />
                        )}
                      </button>
                    )}

                    {isAssetVisible(asset.id) ? (
                      <img
                        src={asset.thumbnailUrl || asset.url}
                        alt={asset.altText || asset.name}
                        className="w-16 h-16 object-cover rounded"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-16 h-16 bg-gray-200 rounded animate-pulse" />
                    )}

                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{asset.name}</p>
                      <div className="flex items-center gap-4 text-sm text-gray-500">
                        <span>{asset.type}</span>
                        <span>{formatFileSize(asset.size)}</span>
                        <span>{formatDate(asset.createdAt)}</span>
                      </div>
                    </div>

                    {asset.tags && asset.tags.length > 0 && (
                      <div className="flex gap-1">
                        {asset.tags.map((tag) => (
                          <span
                            key={tag}
                            className="text-xs px-2 py-1 bg-gray-100 rounded"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onAssetClick?.(asset)}>
                          <Eye className="h-4 w-4 mr-2" />
                          View
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => onAssetDownload?.([asset.id])}
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Download
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => onAssetDelete?.([asset.id])}
                          className="text-red-600"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </Card>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
