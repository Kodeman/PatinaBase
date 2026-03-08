import type { Meta, StoryObj } from '@storybook/react'
import { AspectRatio } from './AspectRatio'

const meta: Meta<typeof AspectRatio> = {
  title: 'Layout/AspectRatio',
  component: AspectRatio,
  tags: ['autodocs'],
  argTypes: {
    ratio: {
      control: 'number',
    },
  },
}

export default meta
type Story = StoryObj<typeof AspectRatio>

export const Video16x9: Story = {
  args: {
    ratio: 16 / 9,
    children: (
      <img
        src="https://images.unsplash.com/photo-1588345921523-c2dcdb7f1dcd?w=800&h=450&fit=crop"
        alt="Landscape"
        className="object-cover w-full h-full rounded-md"
      />
    ),
  },
}

export const Square1x1: Story = {
  args: {
    ratio: 1,
    children: (
      <img
        src="https://images.unsplash.com/photo-1535025183041-0991a977e25b?w=400&h=400&fit=crop"
        alt="Square"
        className="object-cover w-full h-full rounded-md"
      />
    ),
  },
}

export const Photo4x3: Story = {
  args: {
    ratio: 4 / 3,
    children: (
      <img
        src="https://images.unsplash.com/photo-1682687220742-aba13b6e50ba?w=800&h=600&fit=crop"
        alt="Photo"
        className="object-cover w-full h-full rounded-md"
      />
    ),
  },
}

export const UltraWide21x9: Story = {
  args: {
    ratio: 21 / 9,
    children: (
      <img
        src="https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1400&h=600&fit=crop"
        alt="Ultra wide"
        className="object-cover w-full h-full rounded-md"
      />
    ),
  },
}

export const Portrait3x4: Story = {
  args: {
    ratio: 3 / 4,
    children: (
      <img
        src="https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=600&h=800&fit=crop"
        alt="Portrait"
        className="object-cover w-full h-full rounded-md"
      />
    ),
  },
}

export const WithVideo: Story = {
  args: {
    ratio: 16 / 9,
    children: (
      <iframe
        src="https://www.youtube.com/embed/dQw4w9WgXcQ"
        title="YouTube video"
        className="w-full h-full rounded-md"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    ),
  },
}

export const WithBackground: Story = {
  args: {
    ratio: 16 / 9,
    children: (
      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-500 to-pink-500 text-white text-2xl font-bold rounded-md">
        16:9 Aspect Ratio
      </div>
    ),
  },
}

export const Responsive: Story = {
  render: () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <AspectRatio ratio={16 / 9}>
        <div className="w-full h-full flex items-center justify-center bg-blue-500 text-white rounded-md">
          16:9
        </div>
      </AspectRatio>
      <AspectRatio ratio={4 / 3}>
        <div className="w-full h-full flex items-center justify-center bg-green-500 text-white rounded-md">
          4:3
        </div>
      </AspectRatio>
      <AspectRatio ratio={1}>
        <div className="w-full h-full flex items-center justify-center bg-purple-500 text-white rounded-md">
          1:1
        </div>
      </AspectRatio>
    </div>
  ),
}

export const ProductCard: Story = {
  render: () => (
    <div className="max-w-sm">
      <AspectRatio ratio={1}>
        <img
          src="https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&h=600&fit=crop"
          alt="Product"
          className="object-cover w-full h-full rounded-t-md"
        />
      </AspectRatio>
      <div className="p-4 border border-t-0 rounded-b-md">
        <h3 className="font-semibold text-lg">Product Name</h3>
        <p className="text-muted-foreground mt-1">Product description goes here</p>
        <p className="font-bold mt-2">$99.99</p>
      </div>
    </div>
  ),
}
