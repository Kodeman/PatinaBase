import type { Meta, StoryObj } from '@storybook/react'
import { Grid } from './Grid'

const meta: Meta<typeof Grid> = {
  title: 'Layout/Grid',
  component: Grid,
  tags: ['autodocs'],
  argTypes: {
    columns: {
      control: 'select',
      options: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    },
    rows: {
      control: 'select',
      options: [1, 2, 3, 4, 5, 6],
    },
    gap: {
      control: 'select',
      options: ['none', 'xs', 'sm', 'md', 'lg', 'xl', '2xl'],
    },
    flow: {
      control: 'select',
      options: ['row', 'col', 'dense', 'row-dense', 'col-dense'],
    },
  },
}

export default meta
type Story = StoryObj<typeof Grid>

const Box = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`bg-primary text-primary-foreground px-4 py-8 rounded flex items-center justify-center ${className}`}>
    {children}
  </div>
)

export const Default: Story = {
  args: {
    columns: 3,
    gap: 'md',
    children: (
      <>
        <Box>1</Box>
        <Box>2</Box>
        <Box>3</Box>
        <Box>4</Box>
        <Box>5</Box>
        <Box>6</Box>
      </>
    ),
  },
}

export const TwoColumns: Story = {
  args: {
    columns: 2,
    gap: 'lg',
    children: (
      <>
        <Box>Item 1</Box>
        <Box>Item 2</Box>
        <Box>Item 3</Box>
        <Box>Item 4</Box>
      </>
    ),
  },
}

export const FourColumns: Story = {
  args: {
    columns: 4,
    gap: 'md',
    children: (
      <>
        {Array.from({ length: 8 }, (_, i) => (
          <Box key={i}>{i + 1}</Box>
        ))}
      </>
    ),
  },
}

export const WithRows: Story = {
  args: {
    columns: 3,
    rows: 2,
    gap: 'md',
    className: 'h-64',
    children: (
      <>
        <Box>1</Box>
        <Box>2</Box>
        <Box>3</Box>
        <Box>4</Box>
        <Box>5</Box>
        <Box>6</Box>
      </>
    ),
  },
}

export const AutoFit: Story = {
  args: {
    autoFit: true,
    minChildWidth: '200px',
    gap: 'md',
    children: (
      <>
        {Array.from({ length: 6 }, (_, i) => (
          <Box key={i}>{i + 1}</Box>
        ))}
      </>
    ),
  },
}

export const AutoFill: Story = {
  args: {
    autoFill: true,
    minChildWidth: '150px',
    gap: 'md',
    children: (
      <>
        <Box>1</Box>
        <Box>2</Box>
        <Box>3</Box>
      </>
    ),
  },
}

export const CustomTemplate: Story = {
  args: {
    templateColumns: '200px 1fr 200px',
    gap: 'md',
    className: 'h-64',
    children: (
      <>
        <Box>Sidebar</Box>
        <Box>Main Content</Box>
        <Box>Aside</Box>
      </>
    ),
  },
}

export const DashboardLayout: Story = {
  args: {
    templateAreas: '"header header header" "sidebar main aside" "footer footer footer"',
    templateColumns: '200px 1fr 200px',
    templateRows: '60px 1fr 60px',
    gap: 'md',
    className: 'h-screen',
    children: (
      <>
        <Box className="[grid-area:header]">Header</Box>
        <Box className="[grid-area:sidebar]">Sidebar</Box>
        <Box className="[grid-area:main]">Main</Box>
        <Box className="[grid-area:aside]">Aside</Box>
        <Box className="[grid-area:footer]">Footer</Box>
      </>
    ),
  },
}

export const ProductGrid: Story = {
  render: () => (
    <Grid columns={4} gap="lg" className="max-w-6xl">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="border rounded-lg overflow-hidden">
          <div className="aspect-square bg-muted flex items-center justify-center">
            Image {i + 1}
          </div>
          <div className="p-4">
            <h3 className="font-semibold">Product {i + 1}</h3>
            <p className="text-sm text-muted-foreground mt-1">Description</p>
            <p className="font-bold mt-2">${(i + 1) * 10}.00</p>
          </div>
        </div>
      ))}
    </Grid>
  ),
}

export const ResponsiveGrid: Story = {
  render: () => (
    <Grid
      columns={1}
      gap="md"
      className="md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
    >
      {Array.from({ length: 12 }, (_, i) => (
        <Box key={i}>{i + 1}</Box>
      ))}
    </Grid>
  ),
}

export const CardGrid: Story = {
  render: () => (
    <Grid columns={3} gap="lg">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="border rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-2">Card {i + 1}</h3>
          <p className="text-muted-foreground">
            This is a card description that provides more details.
          </p>
        </div>
      ))}
    </Grid>
  ),
}

export const ImageGallery: Story = {
  render: () => (
    <Grid autoFit minChildWidth="250px" gap="md">
      {Array.from({ length: 9 }, (_, i) => (
        <div key={i} className="aspect-square bg-muted rounded-lg flex items-center justify-center">
          Photo {i + 1}
        </div>
      ))}
    </Grid>
  ),
}

export const SmallGap: Story = {
  args: {
    columns: 4,
    gap: 'xs',
    children: (
      <>
        {Array.from({ length: 8 }, (_, i) => (
          <Box key={i}>{i + 1}</Box>
        ))}
      </>
    ),
  },
}

export const LargeGap: Story = {
  args: {
    columns: 3,
    gap: '2xl',
    children: (
      <>
        {Array.from({ length: 6 }, (_, i) => (
          <Box key={i}>{i + 1}</Box>
        ))}
      </>
    ),
  },
}
