import type { Meta, StoryObj } from '@storybook/react'
import { ImagePaletteExtractor } from './ImagePaletteExtractor'

const meta = {
  title: 'Pickers/ImagePaletteExtractor',
  component: ImagePaletteExtractor,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
} satisfies Meta<typeof ImagePaletteExtractor>

export default meta
type Story = StoryObj<typeof meta>

// NOTE: Storybook needs an image that responds with permissive CORS so
// the canvas isn't tainted. Unsplash's CDN does. Real production images
// will come from the proposal-mood-boards bucket which is public-read.
const SAMPLE_IMAGE =
  'https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=800&q=80'

export const Default: Story = {
  args: {
    imageUrl: SAMPLE_IMAGE,
    k: 5,
    onExtracted: (swatches) => {
      // eslint-disable-next-line no-console
      console.log('Extracted swatches:', swatches)
    },
  },
  render: (args) => (
    <div style={{ width: 480 }}>
      <ImagePaletteExtractor {...args} />
    </div>
  ),
}

export const EightSwatches: Story = {
  args: {
    imageUrl: SAMPLE_IMAGE,
    k: 8,
    onExtracted: (swatches) => {
      // eslint-disable-next-line no-console
      console.log('Extracted swatches:', swatches)
    },
  },
  render: (args) => (
    <div style={{ width: 480 }}>
      <ImagePaletteExtractor {...args} />
    </div>
  ),
}
