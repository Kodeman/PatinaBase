import type { Meta, StoryObj } from '@storybook/react'
import { Text } from './Text'

const meta: Meta<typeof Text> = {
  title: 'Typography/Text',
  component: Text,
  tags: ['autodocs'],
  argTypes: {
    as: {
      control: 'select',
      options: ['p', 'span', 'div', 'label', 'strong', 'em', 'small'],
    },
    variant: {
      control: 'select',
      options: ['body', 'caption', 'overline', 'label'],
    },
    size: {
      control: 'select',
      options: ['xs', 'sm', 'md', 'lg', 'xl', '2xl'],
    },
    weight: {
      control: 'select',
      options: ['normal', 'medium', 'semibold', 'bold'],
    },
    align: {
      control: 'select',
      options: ['left', 'center', 'right', 'justify'],
    },
  },
}

export default meta
type Story = StoryObj<typeof Text>

export const Default: Story = {
  args: {
    children: 'This is a paragraph of body text with comfortable line height for reading.',
  },
}

export const Body: Story = {
  args: {
    variant: 'body',
    children:
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
  },
}

export const Caption: Story = {
  args: {
    variant: 'caption',
    children: 'This is caption text, typically used for image captions or helper text.',
  },
}

export const Overline: Story = {
  args: {
    variant: 'overline',
    children: 'Section Label',
  },
}

export const Label: Story = {
  args: {
    variant: 'label',
    children: 'Form Label Text',
  },
}

export const Small: Story = {
  args: {
    size: 'sm',
    children: 'This is small text.',
  },
}

export const Large: Story = {
  args: {
    size: 'lg',
    children: 'This is large text.',
  },
}

export const ExtraLarge: Story = {
  args: {
    size: 'xl',
    children: 'This is extra large text.',
  },
}

export const Bold: Story = {
  args: {
    weight: 'bold',
    children: 'This text is bold.',
  },
}

export const Semibold: Story = {
  args: {
    weight: 'semibold',
    children: 'This text is semibold.',
  },
}

export const Medium: Story = {
  args: {
    weight: 'medium',
    children: 'This text is medium weight.',
  },
}

export const CenterAligned: Story = {
  args: {
    align: 'center',
    children: 'This text is center aligned.',
  },
}

export const RightAligned: Story = {
  args: {
    align: 'right',
    children: 'This text is right aligned.',
  },
}

export const Justified: Story = {
  args: {
    align: 'justify',
    children:
      'This text is justified. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.',
  },
}

export const Truncated: Story = {
  args: {
    truncate: true,
    className: 'max-w-xs',
    children:
      'This is a very long text that will be truncated with an ellipsis when it overflows the container width.',
  },
}

export const LineClamp2: Story = {
  args: {
    lineClamp: 2,
    className: 'max-w-md',
    children:
      'This text will be clamped to 2 lines. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.',
  },
}

export const LineClamp3: Story = {
  args: {
    lineClamp: 3,
    className: 'max-w-md',
    children:
      'This text will be clamped to 3 lines. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.',
  },
}

export const AsSpan: Story = {
  args: {
    as: 'span',
    children: 'This is inline span text',
  },
}

export const AsStrong: Story = {
  args: {
    as: 'strong',
    children: 'This is strong (important) text',
  },
}

export const AsEmphasis: Story = {
  args: {
    as: 'em',
    children: 'This is emphasized text',
  },
}

export const AsSmall: Story = {
  args: {
    as: 'small',
    children: 'This is small print text',
  },
}

export const AllSizes: Story = {
  render: () => (
    <div className="space-y-2">
      <Text size="xs">Extra small text (xs)</Text>
      <Text size="sm">Small text (sm)</Text>
      <Text size="md">Medium text (md) - default</Text>
      <Text size="lg">Large text (lg)</Text>
      <Text size="xl">Extra large text (xl)</Text>
      <Text size="2xl">2XL text (2xl)</Text>
    </div>
  ),
}

export const AllWeights: Story = {
  render: () => (
    <div className="space-y-2">
      <Text weight="normal">Normal weight text</Text>
      <Text weight="medium">Medium weight text</Text>
      <Text weight="semibold">Semibold weight text</Text>
      <Text weight="bold">Bold weight text</Text>
    </div>
  ),
}

export const CardExample: Story = {
  render: () => (
    <div className="max-w-md border rounded-lg overflow-hidden">
      <div className="aspect-video bg-muted flex items-center justify-center">
        <Text variant="caption">Image Placeholder</Text>
      </div>
      <div className="p-6">
        <Text variant="overline" size="sm" className="mb-2">
          Category
        </Text>
        <Text as="h3" weight="bold" size="xl" className="mb-2">
          Article Title Goes Here
        </Text>
        <Text variant="body" lineClamp={3} className="mb-4">
          This is a preview of the article content. It provides a brief summary of what the
          article is about and entices the reader to click and read more about the topic.
        </Text>
        <Text variant="caption" size="sm">
          Published on January 15, 2024
        </Text>
      </div>
    </div>
  ),
}

export const FormHelperText: Story = {
  render: () => (
    <div className="max-w-md space-y-4">
      <div>
        <Text as="label" variant="label" className="block mb-1">
          Email Address
        </Text>
        <input type="email" className="w-full px-3 py-2 border rounded" />
        <Text variant="caption" size="sm" className="mt-1">
          We'll never share your email with anyone else.
        </Text>
      </div>
      <div>
        <Text as="label" variant="label" className="block mb-1">
          Password
        </Text>
        <input type="password" className="w-full px-3 py-2 border rounded" />
        <Text variant="caption" size="sm" className="mt-1 text-red-600">
          Password must be at least 8 characters long.
        </Text>
      </div>
    </div>
  ),
}

export const ParagraphVariations: Story = {
  render: () => (
    <div className="max-w-2xl space-y-6">
      <Text variant="body">
        This is a standard body paragraph. Lorem ipsum dolor sit amet, consectetur adipiscing
        elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
      </Text>
      <Text variant="body" size="lg">
        This is a larger body paragraph, useful for introductions or important content. Ut enim
        ad minim veniam, quis nostrud exercitation ullamco laboris.
      </Text>
      <Text variant="caption">
        This is caption text, typically smaller and muted. Duis aute irure dolor in
        reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.
      </Text>
    </div>
  ),
}

export const ProductDescription: Story = {
  render: () => (
    <div className="max-w-2xl space-y-4">
      <Text variant="overline">Premium Quality</Text>
      <Text as="h2" size="2xl" weight="bold">
        Wireless Bluetooth Headphones
      </Text>
      <Text variant="body" size="lg">
        Experience premium sound quality with our latest wireless headphones. Featuring active
        noise cancellation, 30-hour battery life, and comfortable over-ear design.
      </Text>
      <Text variant="body">
        These headphones are perfect for music lovers, travelers, and anyone who appreciates
        high-quality audio. The advanced Bluetooth 5.0 technology ensures a stable connection up
        to 30 feet away.
      </Text>
      <Text as="div" weight="medium" className="flex items-baseline gap-2">
        <span className="text-3xl">$299</span>
        <Text as="span" variant="caption" className="line-through">
          $399
        </Text>
      </Text>
    </div>
  ),
}
