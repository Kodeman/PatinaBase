import type { Meta, StoryObj } from '@storybook/react'
import { fn } from '@storybook/test'
import { MediaManager, type MediaManagerProps } from './media-manager'
import { MediaGallery, type MediaGalleryProps } from './media-gallery'
import { MediaUploader } from './media-uploader'
import { MobileMediaUploader } from './mobile-media-uploader'
import type { MediaAsset, MediaFolder } from '@patina/types/media'

const sampleAssets: MediaAsset[] = [
  {
    id: 'asset-1',
    name: 'Living Room Hero.jpg',
    type: 'image',
    url: 'https://images.unsplash.com/photo-1616628182501-1eefc8988b66',
    thumbnailUrl: 'https://images.unsplash.com/photo-1616628182501-1eefc8988b66?auto=format&w=300',
    size: 1_024_000,
    mimeType: 'image/jpeg',
    status: 'ready',
    createdAt: new Date('2024-02-11T10:00:00Z'),
    updatedAt: new Date('2024-02-11T10:00:00Z'),
    tags: ['hero', 'living room'],
  },
  {
    id: 'asset-2',
    name: 'Dining Chair Detail.jpg',
    type: 'image',
    url: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc',
    thumbnailUrl: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&w=300',
    size: 856_000,
    mimeType: 'image/jpeg',
    status: 'ready',
    createdAt: new Date('2024-02-12T14:30:00Z'),
    updatedAt: new Date('2024-02-12T14:30:00Z'),
    tags: ['product', 'detail'],
  },
  {
    id: 'asset-3',
    name: 'Modular Sofa Render.glb',
    type: '3d',
    url: '/models/modular-sofa.glb',
    size: 5_240_000,
    mimeType: 'model/gltf-binary',
    status: 'ready',
    createdAt: new Date('2024-02-10T08:00:00Z'),
    updatedAt: new Date('2024-02-10T08:00:00Z'),
    tags: ['3d', 'sofa'],
  },
  {
    id: 'asset-4',
    name: 'Brand Overview.mp4',
    type: 'video',
    url: 'https://storage.googleapis.com/patina-sample/brand-overview.mp4',
    size: 12_000_000,
    mimeType: 'video/mp4',
    status: 'ready',
    createdAt: new Date('2024-01-28T09:15:00Z'),
    updatedAt: new Date('2024-01-28T09:15:00Z'),
    tags: ['marketing'],
  },
]

const sampleFolders: MediaFolder[] = [
  { id: 'root', name: 'All Media', assetCount: 24, createdAt: new Date('2024-01-01T00:00:00Z') },
  { id: 'marketing', name: 'Marketing', assetCount: 12, createdAt: new Date('2024-01-05T00:00:00Z'), parentId: 'root' },
  { id: 'renders', name: '3D Renders', assetCount: 6, createdAt: new Date('2024-01-10T00:00:00Z'), parentId: 'root' },
]

const meta = {
  title: 'Media/Media Manager',
  component: MediaManager,
  parameters: {
    layout: 'fullscreen',
    chromatic: { disableSnapshot: false },
  },
  tags: ['autodocs'],
  args: {
    initialAssets: sampleAssets,
    initialFolders: sampleFolders,
    selectionMode: 'multiple',
    features: {
      versionHistory: true,
      usageInsights: true,
      bulkTagging: true,
      folderCreation: true,
    },
    onAssetSelect: fn(),
    onSelectionChange: fn(),
    onAssetsChange: fn(),
    onAssetDelete: fn(),
    onAssetDownload: fn(),
    onUploadComplete: fn(),
  } satisfies Partial<MediaManagerProps>,
} satisfies Meta<typeof MediaManager>

export default meta

type Story = StoryObj<typeof meta>

export const DefaultManager: Story = {
  name: 'Media Manager',
}

export const GalleryOverview: Story = {
  name: 'Media Gallery (Grid)',
  render: (args) => (
    <div className="h-[600px]">
      <MediaGallery
        assets={sampleAssets}
        viewMode="grid"
        selectionMode="multiple"
        enableBatchActions
        onAssetClick={fn()}
        onAssetDownload={fn()}
        onSelectionChange={fn()}
        {...(args as Partial<MediaGalleryProps>)}
      />
    </div>
  ),
}

export const FileUploader: Story = {
  name: 'Media Uploader',
  render: () => (
    <div className="max-w-2xl">
      <MediaUploader accept={['image', 'video', '3d']} onUploadComplete={fn()} />
    </div>
  ),
}

export const MobileUploader: Story = {
  name: 'Mobile Uploader',
  render: () => (
    <div className="max-w-sm">
      <MobileMediaUploader accept={['image', 'video']} onUploadComplete={fn()} />
    </div>
  ),
}
