export type MediaAssetType = 'image' | 'video' | '3d' | 'document'
// MediaType for UI components (uses '3d' instead of catalog's 'model3d')
export type MediaType = MediaAssetType

export type MediaAssetStatus = 'uploading' | 'processing' | 'ready' | 'error'

export interface MediaLibraryAsset {
  id: string
  name: string
  type: MediaAssetType
  url: string
  thumbnailUrl?: string
  size: number
  mimeType: string
  dimensions?: {
    width: number
    height: number
  }
  metadata?: Record<string, unknown>
  altText?: string
  tags?: string[]
  folderId?: string
  createdAt: Date
  updatedAt: Date
  status: MediaAssetStatus
  uploadProgress?: number
  versions?: MediaVersion[]
  usage?: MediaUsage[]
}

export interface MediaVersion {
  id: string
  version: number
  url: string
  createdAt: Date
  createdBy: string
}

export interface MediaUsage {
  id: string
  type: 'product' | 'project' | 'proposal'
  itemId: string
  itemName: string
  usedAt: Date
}

export interface MediaFolder {
  id: string
  name: string
  parentId?: string
  assetCount: number
  createdAt: Date
}

export interface UploadChunk {
  chunk: Blob
  chunkNumber: number
  totalChunks: number
  uploadId: string
}

export interface UploadOptions {
  chunked?: boolean
  chunkSize?: number
  resumable?: boolean
  onProgress?: (progress: number) => void
  onComplete?: (asset: MediaLibraryAsset) => void
  onError?: (error: Error) => void
}

export interface ImageEditorState {
  crop?: {
    x: number
    y: number
    width: number
    height: number
    aspect?: number
  }
  rotation: number
  flip: {
    horizontal: boolean
    vertical: boolean
  }
  adjustments: {
    brightness: number
    contrast: number
    saturation: number
  }
  focusPoint?: {
    x: number
    y: number
  }
}

export interface MediaFilter {
  type?: MediaAssetType[]
  tags?: string[]
  folderId?: string
  dateRange?: {
    start: Date
    end: Date
  }
  search?: string
}

export type ViewMode = 'grid' | 'list'

export type SortField = 'name' | 'date' | 'size' | 'type'

export type SortOrder = 'asc' | 'desc'

// MediaAsset is an alias for MediaLibraryAsset for backwards compatibility with design-system
export type MediaAsset = MediaLibraryAsset

// Rendered Room v2 / CAD pipeline R2 bucket names — single source of truth so
// no worker or script hand-rolls a bucket-name string. Staging buckets were
// created directly (B-W1); prod buckets are NOT created — that's a separate,
// explicitly Kody-authorized GO after staging is proven end to end.
export const MEDIA_R2_BUCKETS = {
  staging: {
    originals: 'patina-staging-media-originals-us',
    artifacts: 'patina-staging-media-artifacts-us',
  },
  production: {
    originals: 'patina-media-originals-us',
    artifacts: 'patina-media-artifacts-us',
  },
} as const
