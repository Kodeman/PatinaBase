import type { Meta, StoryObj } from '@storybook/react'
import { Blockquote } from './Blockquote'

const meta: Meta<typeof Blockquote> = {
  title: 'Typography/Blockquote',
  component: Blockquote,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'primary', 'success', 'warning', 'error'],
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg', 'xl'],
    },
  },
}

export default meta
type Story = StoryObj<typeof Blockquote>

export const Default: Story = {
  args: {
    children: 'Design is not just what it looks like and feels like. Design is how it works.',
  },
}

export const WithCitation: Story = {
  args: {
    children: 'Innovation distinguishes between a leader and a follower.',
    cite: 'Steve Jobs',
    showCite: true,
  },
}

export const Primary: Story = {
  args: {
    variant: 'primary',
    children: 'The only way to do great work is to love what you do.',
    cite: 'Steve Jobs',
    showCite: true,
  },
}

export const Success: Story = {
  args: {
    variant: 'success',
    children: 'Success is not final, failure is not fatal: it is the courage to continue that counts.',
    cite: 'Winston Churchill',
    showCite: true,
  },
}

export const Warning: Story = {
  args: {
    variant: 'warning',
    children: 'The greatest danger in times of turbulence is not the turbulence; it is to act with yesterday\'s logic.',
    cite: 'Peter Drucker',
    showCite: true,
  },
}

export const Error: Story = {
  args: {
    variant: 'error',
    children: 'Failure is simply the opportunity to begin again, this time more intelligently.',
    cite: 'Henry Ford',
    showCite: true,
  },
}

export const Small: Story = {
  args: {
    size: 'sm',
    children: 'Simplicity is the ultimate sophistication.',
    cite: 'Leonardo da Vinci',
    showCite: true,
  },
}

export const Large: Story = {
  args: {
    size: 'lg',
    children: 'Stay hungry, stay foolish.',
    cite: 'Steve Jobs',
    showCite: true,
  },
}

export const ExtraLarge: Story = {
  args: {
    size: 'xl',
    children: 'Think different.',
    cite: 'Apple Inc.',
    showCite: true,
  },
}

export const LongQuote: Story = {
  args: {
    children: `Your work is going to fill a large part of your life, and the only way to be
    truly satisfied is to do what you believe is great work. And the only way to do great
    work is to love what you do. If you haven't found it yet, keep looking. Don't settle.
    As with all matters of the heart, you'll know when you find it.`,
    cite: 'Steve Jobs',
    showCite: true,
  },
}
