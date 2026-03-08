import type { Meta, StoryObj } from '@storybook/react'
import { Carousel, CarouselItem } from './Carousel'
import { Card } from '../Card'
import { Image } from '../Image'
import { ProductCard } from '../ProductCard'

const meta: Meta<typeof Carousel> = {
  title: 'Components/Carousel',
  component: Carousel,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
}

export default meta
type Story = StoryObj<typeof Carousel>

export const Basic: Story = {
  render: () => (
    <Carousel>
      <Card className="p-8 text-center">
        <h2 className="text-2xl font-bold mb-2">Slide 1</h2>
        <p className="text-muted-foreground">This is the first slide</p>
      </Card>
      <Card className="p-8 text-center">
        <h2 className="text-2xl font-bold mb-2">Slide 2</h2>
        <p className="text-muted-foreground">This is the second slide</p>
      </Card>
      <Card className="p-8 text-center">
        <h2 className="text-2xl font-bold mb-2">Slide 3</h2>
        <p className="text-muted-foreground">This is the third slide</p>
      </Card>
    </Carousel>
  ),
}

export const WithImages: Story = {
  render: () => (
    <Carousel loop autoPlay={3000}>
      <Image
        src="https://picsum.photos/seed/1/800/400"
        alt="Image 1"
        aspectRatio="2/1"
      />
      <Image
        src="https://picsum.photos/seed/2/800/400"
        alt="Image 2"
        aspectRatio="2/1"
      />
      <Image
        src="https://picsum.photos/seed/3/800/400"
        alt="Image 3"
        aspectRatio="2/1"
      />
      <Image
        src="https://picsum.photos/seed/4/800/400"
        alt="Image 4"
        aspectRatio="2/1"
      />
    </Carousel>
  ),
}

export const ProductCarousel: Story = {
  render: () => {
    const products = Array.from({ length: 6 }, (_, i) => ({
      id: `product-${i}`,
      name: `Product ${i + 1}`,
      brand: 'Design Co',
      price: Math.floor(Math.random() * 50000) + 5000,
      image: `https://picsum.photos/seed/${i}/300/400`,
      rating: Math.floor(Math.random() * 5) + 1,
      reviewCount: Math.floor(Math.random() * 100),
    }))

    return (
      <Carousel
        loop
        options={{
          align: 'start',
          slidesToScroll: 1,
        }}
      >
        {products.map((product) => (
          <div key={product.id} className="px-2">
            <ProductCard
              variant="grid"
              {...product}
              onAddToProposal={() => {}}
            />
          </div>
        ))}
      </Carousel>
    )
  },
}

export const WithoutNavigation: Story = {
  render: () => (
    <Carousel showNavigation={false}>
      <Card className="p-8 text-center bg-blue-100">
        <h2 className="text-2xl font-bold">Slide 1</h2>
      </Card>
      <Card className="p-8 text-center bg-green-100">
        <h2 className="text-2xl font-bold">Slide 2</h2>
      </Card>
      <Card className="p-8 text-center bg-purple-100">
        <h2 className="text-2xl font-bold">Slide 3</h2>
      </Card>
    </Carousel>
  ),
}

export const WithoutDots: Story = {
  render: () => (
    <Carousel showDots={false}>
      <Card className="p-8 text-center bg-blue-100">
        <h2 className="text-2xl font-bold">Slide 1</h2>
      </Card>
      <Card className="p-8 text-center bg-green-100">
        <h2 className="text-2xl font-bold">Slide 2</h2>
      </Card>
      <Card className="p-8 text-center bg-purple-100">
        <h2 className="text-2xl font-bold">Slide 3</h2>
      </Card>
    </Carousel>
  ),
}

export const AutoPlay: Story = {
  render: () => (
    <Carousel autoPlay={2000} loop>
      <Card className="p-8 text-center bg-gradient-to-r from-pink-500 to-purple-500 text-white">
        <h2 className="text-2xl font-bold mb-2">Auto Play 1</h2>
        <p>This carousel auto-plays every 2 seconds</p>
      </Card>
      <Card className="p-8 text-center bg-gradient-to-r from-blue-500 to-cyan-500 text-white">
        <h2 className="text-2xl font-bold mb-2">Auto Play 2</h2>
        <p>This carousel auto-plays every 2 seconds</p>
      </Card>
      <Card className="p-8 text-center bg-gradient-to-r from-green-500 to-teal-500 text-white">
        <h2 className="text-2xl font-bold mb-2">Auto Play 3</h2>
        <p>This carousel auto-plays every 2 seconds</p>
      </Card>
    </Carousel>
  ),
}

export const VerticalOrientation: Story = {
  render: () => (
    <Carousel orientation="vertical" className="h-96">
      <Card className="p-8 text-center bg-red-100">
        <h2 className="text-2xl font-bold">Slide 1</h2>
      </Card>
      <Card className="p-8 text-center bg-orange-100">
        <h2 className="text-2xl font-bold">Slide 2</h2>
      </Card>
      <Card className="p-8 text-center bg-yellow-100">
        <h2 className="text-2xl font-bold">Slide 3</h2>
      </Card>
    </Carousel>
  ),
}

export const MultipleSlides: Story = {
  render: () => (
    <Carousel
      options={{
        align: 'start',
        slidesToScroll: 2,
      }}
    >
      {Array.from({ length: 10 }, (_, i) => (
        <Card key={i} className="p-6 text-center">
          <h3 className="text-lg font-semibold">Item {i + 1}</h3>
        </Card>
      ))}
    </Carousel>
  ),
}
