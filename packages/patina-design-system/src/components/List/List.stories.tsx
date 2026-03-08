import type { Meta, StoryObj } from '@storybook/react'
import { List, ListItem } from './List'

const meta: Meta<typeof List> = {
  title: 'Data Display/List',
  component: List,
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof List>

export const Unordered: Story = {
  render: () => (
    <List>
      <ListItem>First item</ListItem>
      <ListItem>Second item</ListItem>
      <ListItem>Third item</ListItem>
    </List>
  ),
}

export const Ordered: Story = {
  render: () => (
    <List variant="ordered">
      <ListItem>First step</ListItem>
      <ListItem>Second step</ListItem>
      <ListItem>Third step</ListItem>
    </List>
  ),
}

export const WithIcons: Story = {
  render: () => (
    <List variant="none">
      <ListItem icon={<span>✓</span>}>Completed task</ListItem>
      <ListItem icon={<span>✓</span>}>Another completed task</ListItem>
      <ListItem icon={<span>✗</span>}>Failed task</ListItem>
    </List>
  ),
}

export const Nested: Story = {
  render: () => (
    <List>
      <ListItem>
        Parent item 1
        <List spacing="sm">
          <ListItem>Child item 1.1</ListItem>
          <ListItem>Child item 1.2</ListItem>
        </List>
      </ListItem>
      <ListItem>Parent item 2</ListItem>
    </List>
  ),
}
