'use client';

import React, { useState, useCallback, useEffect } from 'react';
import {
  FolderPlus,
  Upload,
  Tag,
  History,
  BarChart3,
  Settings,
  X,
  Check,
  Loader2,
  Folder,
  ChevronRight,
  Home,
} from 'lucide-react';
import { cn } from '../../utils/cn';
import { Button } from '../Button';
import { Input } from '../Input';
import { Card } from '../Card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../Dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../Tabs';
import { MediaUploader } from './media-uploader';
import { MediaGallery } from './media-gallery';
import { ImageEditor } from './image-editor';
import { ModelViewer3D } from './model-viewer-3d';
import {
  MediaAsset,
  MediaFolder,
  MediaType,
  MediaFilter,
  ViewMode,
} from '@patina/types/media';

export interface MediaManagerFeatureToggles {
  versionHistory?: boolean;
  usageInsights?: boolean;
  bulkTagging?: boolean;
  folderCreation?: boolean;
}

export interface MediaManagerProps {
  initialAssets?: MediaAsset[];
  initialFolders?: MediaFolder[];
  onAssetsChange?: (assets: MediaAsset[]) => void;
  onAssetSelect?: (asset: MediaAsset) => void;
  onSelectionChange?: (selected: MediaAsset[]) => void;
  onAssetDelete?: (assetIds: string[]) => void;
  onAssetDownload?: (assetIds: string[]) => void;
  onAssetTag?: (assetIds: string[], tags: string[]) => void;
  onUploadComplete?: (assets: MediaAsset[]) => void;
  selectionMode?: 'single' | 'multiple' | 'none';
  acceptTypes?: MediaType[];
  className?: string;
  features?: MediaManagerFeatureToggles;
}

export function MediaManager({
  initialAssets,
  initialFolders,
  onAssetsChange,
  onAssetSelect,
  onSelectionChange,
  onAssetDelete: onAssetDeleteProp,
  onAssetDownload: onAssetDownloadProp,
  onAssetTag: onAssetTagProp,
  onUploadComplete: onUploadCompleteProp,
  selectionMode = 'none',
  acceptTypes,
  className,
  features,
}: MediaManagerProps) {
  const [assets, setAssets] = useState<MediaAsset[]>(initialAssets || []);
  const [folders, setFolders] = useState<MediaFolder[]>(
    initialFolders || [
      { id: 'root', name: 'All Media', assetCount: 0, createdAt: new Date() },
    ]
  );
  const [currentFolder, setCurrentFolder] = useState<string>('root');
  const [showUploader, setShowUploader] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [showViewer, setShowViewer] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<MediaAsset | null>(null);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [filter, setFilter] = useState<MediaFilter>({});
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [showUsageTracker, setShowUsageTracker] = useState(false);
  const [showBulkTag, setShowBulkTag] = useState(false);
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [bulkTags, setBulkTags] = useState('');

  const featureConfig: Required<MediaManagerFeatureToggles> = {
    versionHistory: features?.versionHistory ?? true,
    usageInsights: features?.usageInsights ?? true,
    bulkTagging: features?.bulkTagging ?? true,
    folderCreation: features?.folderCreation ?? true,
  };

  useEffect(() => {
    if (initialAssets) {
      setAssets(initialAssets);
      return;
    }

    setAssets((prev) => {
      if (prev.length > 0) {
        return prev;
      }

      const mockAssets: MediaAsset[] = [
        {
          id: '1',
          name: 'product-hero.jpg',
          type: 'image',
          url: '/placeholder-image.jpg',
          size: 1024000,
          mimeType: 'image/jpeg',
          status: 'ready',
          createdAt: new Date(),
          updatedAt: new Date(),
          tags: ['hero', 'product'],
        },
        {
          id: '2',
          name: 'chair-3d-model.glb',
          type: '3d',
          url: '/models/chair.glb',
          size: 5120000,
          mimeType: 'model/gltf-binary',
          status: 'ready',
          createdAt: new Date(),
          updatedAt: new Date(),
          tags: ['furniture', '3d'],
        },
      ];

      return mockAssets;
    });
  }, [initialAssets]);

  useEffect(() => {
    if (initialFolders) {
      setFolders(initialFolders);
    }
  }, [initialFolders]);

  useEffect(() => {
    onAssetsChange?.(assets);
  }, [assets, onAssetsChange]);

  useEffect(() => {
    if (!onSelectionChange) return;
    const selected = assets.filter((asset) => selectedAssetIds.includes(asset.id));
    onSelectionChange(selected);
  }, [assets, onSelectionChange, selectedAssetIds]);

  const getFolderPath = (): MediaFolder[] => {
    const path: MediaFolder[] = [];
    let folderId = currentFolder;

    while (folderId) {
      const folder = folders.find((f) => f.id === folderId);
      if (!folder) break;
      path.unshift(folder);
      folderId = folder.parentId || '';
    }

    return path;
  };

  const createFolder = () => {
    if (!newFolderName.trim()) return;

    const newFolder: MediaFolder = {
      id: Math.random().toString(36).substring(7),
      name: newFolderName,
      parentId: currentFolder === 'root' ? undefined : currentFolder,
      assetCount: 0,
      createdAt: new Date(),
    };

    setFolders([...folders, newFolder]);
    setNewFolderName('');
    setShowNewFolder(false);
  };

  const handleAssetClick = (asset: MediaAsset) => {
    setSelectedAsset(asset);

    if (asset.type === 'image') {
      setShowEditor(true);
    } else if (asset.type === '3d') {
      setShowViewer(true);
    }

    if (onAssetSelect) {
      onAssetSelect(asset);
    }
  };

  const handleUploadComplete = (uploadedAssets: MediaAsset[]) => {
    onUploadCompleteProp?.(uploadedAssets);
    setAssets((prev) => [...prev, ...uploadedAssets]);
    setShowUploader(false);
  };

  const handleAssetDelete = async (assetIds: string[]) => {
    onAssetDeleteProp?.(assetIds);
    setAssets((prev) => prev.filter((a) => !assetIds.includes(a.id)));
    setSelectedAssetIds((prev) => prev.filter((id) => !assetIds.includes(id)));
  };

  const handleAssetDownload = async (assetIds: string[]) => {
    if (onAssetDownloadProp) {
      onAssetDownloadProp(assetIds);
      return;
    }

    assetIds.forEach((id) => {
      const asset = assets.find((a) => a.id === id);
      if (asset) {
        const link = document.createElement('a');
        link.href = asset.url;
        link.download = asset.name;
        link.click();
      }
    });
  };

  const handleBulkTag = () => {
    if (!bulkTags.trim()) return;

    const tags = bulkTags.split(',').map((t) => t.trim());
    setAssets((prev) =>
      prev.map((asset) =>
        selectedAssetIds.includes(asset.id)
          ? { ...asset, tags: [...(asset.tags || []), ...tags] }
          : asset
      )
    );

    onAssetTagProp?.(selectedAssetIds, tags);

    setBulkTags('');
    setShowBulkTag(false);
    setSelectedAssetIds([]);
  };

  const handleImageSave = (editedImage: Blob, edits: any) => {
    // In real implementation, upload edited image and create new version
    setShowEditor(false);
    setSelectedAsset(null);
  };

  const filteredAssets = React.useMemo(() => {
    let filtered = assets;

    if (currentFolder !== 'root') {
      filtered = filtered.filter((a) => a.folderId === currentFolder);
    }

    if (filter.type && filter.type.length > 0) {
      filtered = filtered.filter((a) => filter.type?.includes(a.type));
    }

    if (filter.tags && filter.tags.length > 0) {
      filtered = filtered.filter((a) =>
        filter.tags?.some((tag) => a.tags?.includes(tag))
      );
    }

    if (filter.search) {
      filtered = filtered.filter((a) =>
        a.name.toLowerCase().includes(filter.search!.toLowerCase())
      );
    }

    if (acceptTypes && acceptTypes.length > 0) {
      filtered = filtered.filter((a) => acceptTypes.includes(a.type));
    }

    return filtered;
  }, [assets, filter, currentFolder, acceptTypes]);

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold">Media Library</h2>
          <div className="flex items-center gap-1 text-sm text-gray-500">
            {getFolderPath().map((folder, index) => (
              <React.Fragment key={folder.id}>
                {index > 0 && <ChevronRight className="h-4 w-4" />}
                <button
                  onClick={() => setCurrentFolder(folder.id)}
                  className="hover:text-primary"
                >
                  {folder.id === 'root' ? (
                    <Home className="h-4 w-4" />
                  ) : (
                    folder.name
                  )}
                </button>
              </React.Fragment>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {featureConfig.bulkTagging && selectedAssetIds.length > 0 && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowBulkTag(true)}
              >
                <Tag className="h-4 w-4 mr-2" />
                Tag ({selectedAssetIds.length})
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleAssetDownload(selectedAssetIds)}
              >
                Download ({selectedAssetIds.length})
              </Button>
            </>
          )}
          {featureConfig.folderCreation && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowNewFolder(true)}
            >
              <FolderPlus className="h-4 w-4 mr-2" />
              New Folder
            </Button>
          )}
          <Button size="sm" onClick={() => setShowUploader(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Upload
          </Button>
        </div>
      </div>

      {/* Folders */}
      {currentFolder === 'root' && (
        <div className="p-4 border-b">
          <div className="grid grid-cols-6 gap-4">
            {folders
              .filter((f) => f.id !== 'root' && !f.parentId)
              .map((folder) => (
                <Card
                  key={folder.id}
                  className="p-4 cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => setCurrentFolder(folder.id)}
                >
                  <Folder className="h-8 w-8 text-blue-500 mb-2" />
                  <p className="font-medium truncate">{folder.name}</p>
                  <p className="text-xs text-gray-500">
                    {folder.assetCount} items
                  </p>
                </Card>
              ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="p-4 border-b">
        <div className="flex items-center gap-4">
          <Input
            placeholder="Search assets..."
            value={filter.search || ''}
            onChange={(e) => setFilter({ ...filter, search: e.target.value })}
            className="max-w-sm"
          />

          <div className="flex gap-2">
            <Button
              variant={
                filter.type?.includes('image') ? 'default' : 'outline'
              }
              size="sm"
              onClick={() =>
                setFilter({
                  ...filter,
                  type: filter.type?.includes('image')
                    ? filter.type.filter((t) => t !== 'image')
                    : [...(filter.type || []), 'image'],
                })
              }
            >
              Images
            </Button>
            <Button
              variant={
                filter.type?.includes('video') ? 'default' : 'outline'
              }
              size="sm"
              onClick={() =>
                setFilter({
                  ...filter,
                  type: filter.type?.includes('video')
                    ? filter.type.filter((t) => t !== 'video')
                    : [...(filter.type || []), 'video'],
                })
              }
            >
              Videos
            </Button>
            <Button
              variant={filter.type?.includes('3d') ? 'default' : 'outline'}
              size="sm"
              onClick={() =>
                setFilter({
                  ...filter,
                  type: filter.type?.includes('3d')
                    ? filter.type.filter((t) => t !== '3d')
                    : [...(filter.type || []), '3d'],
                })
              }
            >
              3D Models
            </Button>
          </div>
        </div>
      </div>

      {/* Gallery */}
      <div className="flex-1 overflow-hidden p-4">
        <MediaGallery
          assets={filteredAssets}
          viewMode={viewMode}
          selectionMode={selectionMode}
          enableBatchActions={selectionMode === 'multiple'}
          onSelectionChange={(selected) =>
            setSelectedAssetIds(selected.map((asset) => asset.id))
          }
          onAssetClick={handleAssetClick}
          onAssetDelete={handleAssetDelete}
          onAssetDownload={handleAssetDownload}
        />
      </div>

      {/* Upload Dialog */}
      <Dialog open={showUploader} onOpenChange={setShowUploader}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Upload Media</DialogTitle>
          </DialogHeader>
          <MediaUploader
            accept={acceptTypes}
            multiple={selectionMode === 'multiple'}
            onUploadComplete={handleUploadComplete}
          />
        </DialogContent>
      </Dialog>

      {/* Image Editor Dialog */}
      <Dialog open={showEditor} onOpenChange={setShowEditor}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] p-0">
          <DialogHeader className="sr-only">
            <DialogTitle>Edit Image</DialogTitle>
          </DialogHeader>
          {selectedAsset && (
            <ImageEditor
              imageUrl={selectedAsset.url}
              altText={selectedAsset.altText}
              onSave={handleImageSave}
              onCancel={() => {
                setShowEditor(false);
                setSelectedAsset(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* 3D Viewer Dialog */}
      <Dialog open={showViewer} onOpenChange={setShowViewer}>
        <DialogContent className="max-w-6xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>{selectedAsset?.name}</DialogTitle>
          </DialogHeader>
          {selectedAsset && (
            <ModelViewer3D
              modelUrl={selectedAsset.url}
              enableAR={true}
              enableMaterialSwitch={true}
              enableAnimations={true}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* New Folder Dialog */}
      {featureConfig.folderCreation && (
        <Dialog open={showNewFolder} onOpenChange={setShowNewFolder}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Folder</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <Input
                placeholder="Folder name"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createFolder()}
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowNewFolder(false)}
                >
                  Cancel
                </Button>
                <Button onClick={createFolder}>Create</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Bulk Tag Dialog */}
      {featureConfig.bulkTagging && (
        <Dialog open={showBulkTag} onOpenChange={setShowBulkTag}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Tags to {selectedAssetIds.length} Assets</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <Input
                placeholder="Enter tags separated by commas"
                value={bulkTags}
                onChange={(e) => setBulkTags(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleBulkTag()}
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowBulkTag(false)}
                >
                  Cancel
                </Button>
                <Button onClick={handleBulkTag}>Add Tags</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Version History Panel */}
      {featureConfig.versionHistory && showVersionHistory && selectedAsset && (
        <div className="absolute right-0 top-0 bottom-0 w-80 bg-white border-l p-4 shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold flex items-center gap-2">
              <History className="h-5 w-5" />
              Version History
            </h3>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowVersionHistory(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          {selectedAsset.versions?.map((version) => (
            <Card key={version.id} className="p-3 mb-2">
              <p className="text-sm font-medium">Version {version.version}</p>
              <p className="text-xs text-gray-500">
                {version.createdAt.toLocaleString()}
              </p>
              <p className="text-xs text-gray-500">by {version.createdBy}</p>
              <Button variant="link" size="sm" className="p-0 h-auto mt-1">
                Restore
              </Button>
            </Card>
          ))}
        </div>
      )}

      {/* Usage Tracker Panel */}
      {featureConfig.usageInsights && showUsageTracker && selectedAsset && (
        <div className="absolute right-0 top-0 bottom-0 w-80 bg-white border-l p-4 shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Asset Usage
            </h3>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowUsageTracker(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          {selectedAsset.usage?.map((usage) => (
            <Card key={usage.id} className="p-3 mb-2">
              <p className="text-sm font-medium">{usage.itemName}</p>
              <p className="text-xs text-gray-500 capitalize">{usage.type}</p>
              <p className="text-xs text-gray-500">
                Used {usage.usedAt.toLocaleDateString()}
              </p>
            </Card>
          ))}
          {(!selectedAsset.usage || selectedAsset.usage.length === 0) && (
            <p className="text-sm text-gray-500">No usage data available</p>
          )}
        </div>
      )}
    </div>
  );
}
