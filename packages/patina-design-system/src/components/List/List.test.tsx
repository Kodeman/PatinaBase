import { render, screen } from '@testing-library/react'
import { axe } from 'vitest-axe'
import { List, ListItem } from './List'

describe('List', () => {
  it('renders unordered list by default', () => {
    const { container } = render(
      <List>
        <ListItem>Item 1</ListItem>
        <ListItem>Item 2</ListItem>
      </List>
    )
    expect(container.querySelector('ul')).toBeInTheDocument()
  })

  it('renders ordered list when variant is ordered', () => {
    const { container } = render(
      <List variant="ordered">
        <ListItem>Item 1</ListItem>
        <ListItem>Item 2</ListItem>
      </List>
    )
    expect(container.querySelector('ol')).toBeInTheDocument()
  })

  it('renders list items correctly', () => {
    render(
      <List>
        <ListItem>First item</ListItem>
        <ListItem>Second item</ListItem>
      </List>
    )
    expect(screen.getByText('First item')).toBeInTheDocument()
    expect(screen.getByText('Second item')).toBeInTheDocument()
  })

  it('applies spacing correctly', () => {
    const { container } = render(
      <List spacing="lg">
        <ListItem>Item 1</ListItem>
      </List>
    )
    expect(container.firstChild).toHaveClass('space-y-3')
  })

  it('renders icons in list items', () => {
    render(
      <List variant="none">
        <ListItem icon={<span data-testid="icon">✓</span>}>Item with icon</ListItem>
      </List>
    )
    expect(screen.getByTestId('icon')).toBeInTheDocument()
  })

  it('supports custom className', () => {
    const { container } = render(
      <List className="custom-class">
        <ListItem>Item</ListItem>
      </List>
    )
    expect(container.firstChild).toHaveClass('custom-class')
  })

  it('has no accessibility violations', async () => {
    const { container } = render(
      <List>
        <ListItem>Item 1</ListItem>
        <ListItem>Item 2</ListItem>
      </List>
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
