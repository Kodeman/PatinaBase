import type { Meta, StoryObj } from '@storybook/react'
import { Breadcrumbs } from './Breadcrumbs'

const meta: Meta<typeof Breadcrumbs> = {
  title: 'Navigation/Breadcrumbs',
  component: Breadcrumbs,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
}

export default meta
type Story = StoryObj<typeof Breadcrumbs>

export const Default: Story = {
  args: {
    items: [
      { label: 'Home', href: '/' },
      { label: 'Products', href: '/products' },
      { label: 'Shoes', current: true },
    ],
  },
}

export const WithManyItems: Story = {
  args: {
    items: [
      { label: 'Home', href: '/' },
      { label: 'Category', href: '/category' },
      { label: 'Subcategory', href: '/category/sub' },
      { label: 'Product Type', href: '/category/sub/type' },
      { label: 'Brand', href: '/category/sub/type/brand' },
      { label: 'Product', current: true },
    ],
  },
}

export const WithCollapse: Story = {
  args: {
    items: [
      { label: 'Home', href: '/' },
      { label: 'Category', href: '/category' },
      { label: 'Subcategory', href: '/category/sub' },
      { label: 'Product Type', href: '/category/sub/type' },
      { label: 'Brand', href: '/category/sub/type/brand' },
      { label: 'Product', current: true },
    ],
    maxItems: 4,
    itemsBeforeCollapse: 1,
    itemsAfterCollapse: 2,
  },
}

export const CustomSeparator: Story = {
  args: {
    items: [
      { label: 'Home', href: '/' },
      { label: 'Products', href: '/products' },
      { label: 'Shoes', current: true },
    ],
    separator: '>',
  },
}

export const WithIcons: Story = {
  args: {
    items: [
      { label: 'Home', href: '/', icon: <span>🏠</span> },
      { label: 'Products', href: '/products', icon: <span>📦</span> },
      { label: 'Shoes', icon: <span>👟</span>, current: true },
    ],
  },
}

export const WithClickHandler: Story = {
  args: {
    items: [
      { label: 'Home', href: '/' },
      { label: 'Products', href: '/products' },
      { label: 'Shoes', current: true },
    ],
    onItemClick: (item, index) => {
      console.log('Clicked:', item.label, 'at index', index)
    },
  },
}

export const SingleItem: Story = {
  args: {
    items: [{ label: 'Home', current: true }],
  },
}

export const TwoItems: Story = {
  args: {
    items: [
      { label: 'Home', href: '/' },
      { label: 'Current Page', current: true },
    ],
  },
}
