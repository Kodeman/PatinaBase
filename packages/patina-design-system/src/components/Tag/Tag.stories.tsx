import type { Meta, StoryObj } from '@storybook/react'
import { Tag, TagGroup } from './Tag'

const meta: Meta<typeof Tag> = {
  title: 'Data Display/Tag',
  component: Tag,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: 'Tags are used to label, categorize, or organize items.',
      },
    },
  },
}

export default meta
type Story = StoryObj<typeof Tag>

export const Default: Story = {
  args: {
    children: 'Default Tag',
  },
}

export const Variants: Story = {
  render: () => (
    <TagGroup>
      <Tag variant="default">Default</Tag>
      <Tag variant="secondary">Secondary</Tag>
      <Tag variant="outline">Outline</Tag>
      <Tag variant="success">Success</Tag>
      <Tag variant="warning">Warning</Tag>
      <Tag variant="error">Error</Tag>
    </TagGroup>
  ),
}

export const Sizes: Story = {
  render: () => (
    <TagGroup>
      <Tag size="sm">Small</Tag>
      <Tag size="md">Medium</Tag>
      <Tag size="lg">Large</Tag>
    </TagGroup>
  ),
}

export const Removable: Story = {
  render: () => (
    <TagGroup>
      <Tag onRemove={() => console.log('Removed')}>React</Tag>
      <Tag onRemove={() => console.log('Removed')}>TypeScript</Tag>
      <Tag onRemove={() => console.log('Removed')}>TailwindCSS</Tag>
    </TagGroup>
  ),
}

export const WithIcons: Story = {
  render: () => (
    <TagGroup>
      <Tag
        icon={
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
        }
      >
        Featured
      </Tag>
      <Tag
        variant="success"
        icon={
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        }
      >
        Verified
      </Tag>
    </TagGroup>
  ),
}

export const MultipleRemovable: Story = {
  render: () => {
    const tags = ['Design', 'Development', 'Marketing', 'Sales', 'Support']

    return (
      <TagGroup>
        {tags.map((tag) => (
          <Tag key={tag} onRemove={() => console.log(`Removed ${tag}`)}>
            {tag}
          </Tag>
        ))}
      </TagGroup>
    )
  },
}
