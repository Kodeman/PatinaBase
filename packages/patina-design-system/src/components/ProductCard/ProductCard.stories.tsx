import type { Meta, StoryObj } from '@storybook/react'
import { ProductCard } from './ProductCard'

const meta: Meta<typeof ProductCard> = {
  title: 'Designer Portal/ProductCard',
  component: ProductCard,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof ProductCard>

const mockImage = 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=400'

export const Default: Story = {
  args: {
    image: mockImage,
    name: 'Modern Velvet Sofa',
    brand: 'Design Studio',
    price: 189900,
    onAddToProposal: () => console.log('Add to proposal'),
  },
}

export const WithSale: Story = {
  args: {
    image: mockImage,
    name: 'Scandinavian Armchair',
    brand: 'Nordic Home',
    price: 59900,
    originalPrice: 89900,
    badges: [{ label: 'Sale', variant: 'sale' }],
    onAddToProposal: () => console.log('Add to proposal'),
  },
}

export const Featured: Story = {
  args: {
    image: mockImage,
    name: 'Designer Coffee Table',
    brand: 'Luxury Living',
    price: 129900,
    badges: [{ label: 'Featured', variant: 'featured' }],
    rating: 4.5,
    reviewCount: 128,
    onAddToProposal: () => console.log('Add to proposal'),
  },
}

export const Favorited: Story = {
  args: {
    image: mockImage,
    name: 'Mid-Century Lounge Chair',
    brand: 'Retro Design',
    price: 79900,
    isFavorited: true,
    onFavoriteClick: () => console.log('Toggle favorite'),
    onAddToProposal: () => console.log('Add to proposal'),
  },
}

export const ListVariant: Story = {
  args: {
    image: mockImage,
    name: 'Contemporary Dining Table',
    brand: 'Modern Spaces',
    price: 249900,
    variant: 'list',
    rating: 4.8,
    reviewCount: 64,
    onAddToProposal: () => console.log('Add to proposal'),
  },
}

export const CompactVariant: Story = {
  args: {
    image: mockImage,
    name: 'Minimalist Shelf',
    brand: 'Simple Living',
    price: 29900,
    variant: 'compact',
    onAddToProposal: () => console.log('Add to proposal'),
  },
}

export const MultipleBadges: Story = {
  args: {
    image: mockImage,
    name: 'Limited Edition Sofa',
    brand: 'Exclusive Designs',
    price: 399900,
    badges: [
      { label: 'New', variant: 'new' },
      { label: 'Featured', variant: 'featured' },
    ],
    rating: 5,
    reviewCount: 12,
    onAddToProposal: () => console.log('Add to proposal'),
  },
}

export const Grid: Story = {
  render: () => (
    <div className="grid grid-cols-3 gap-4 w-full max-w-4xl">
      <ProductCard
        image={mockImage}
        name="Modern Sofa"
        brand="Design Co"
        price={189900}
        onAddToProposal={() => {}}
      />
      <ProductCard
        image={mockImage}
        name="Armchair"
        brand="Comfort Plus"
        price={79900}
        originalPrice={99900}
        badges={[{ label: 'Sale', variant: 'sale' }]}
        onAddToProposal={() => {}}
      />
      <ProductCard
        image={mockImage}
        name="Coffee Table"
        brand="Tables Inc"
        price={49900}
        badges={[{ label: 'New', variant: 'new' }]}
        isFavorited
        onFavoriteClick={() => {}}
        onAddToProposal={() => {}}
      />
    </div>
  ),
}

export const ListView: Story = {
  render: () => (
    <div className="flex flex-col gap-4 w-full max-w-2xl">
      <ProductCard
        variant="list"
        image={mockImage}
        name="Modern Velvet Sofa"
        brand="Design Studio"
        price={189900}
        rating={4.5}
        reviewCount={89}
        onAddToProposal={() => {}}
      />
      <ProductCard
        variant="list"
        image={mockImage}
        name="Scandinavian Armchair"
        brand="Nordic Home"
        price={59900}
        originalPrice={89900}
        badges={[{ label: 'Sale', variant: 'sale' }]}
        rating={4.8}
        reviewCount={156}
        onAddToProposal={() => {}}
      />
      <ProductCard
        variant="list"
        image={mockImage}
        name="Designer Coffee Table"
        brand="Luxury Living"
        price={129900}
        isFavorited
        onFavoriteClick={() => {}}
        onAddToProposal={() => {}}
      />
    </div>
  ),
}
