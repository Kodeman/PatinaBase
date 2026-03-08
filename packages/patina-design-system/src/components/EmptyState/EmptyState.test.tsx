import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import {
  EmptyState,
  EmptyStateActions,
  EmptyStateDescription,
  EmptyStateIcon,
  EmptyStateTitle,
} from './EmptyState'

describe('EmptyState', () => {
  it('renders with title and description', () => {
    render(
      <EmptyState
        title="No results found"
        description="Try adjusting your search terms"
      />
    )

    expect(screen.getByText('No results found')).toBeInTheDocument()
    expect(screen.getByText('Try adjusting your search terms')).toBeInTheDocument()
  })

  it('renders with icon', () => {
    const TestIcon = () => <div data-testid="test-icon">Icon</div>
    render(
      <EmptyState
        icon={<TestIcon />}
        title="Empty"
      />
    )

    expect(screen.getByTestId('test-icon')).toBeInTheDocument()
  })

  it('renders with action buttons', () => {
    render(
      <EmptyState
        title="No items"
        action={<button>Add Item</button>}
        secondaryAction={<button>Learn More</button>}
      />
    )

    expect(screen.getByText('Add Item')).toBeInTheDocument()
    expect(screen.getByText('Learn More')).toBeInTheDocument()
  })

  it('renders with custom children', () => {
    render(
      <EmptyState>
        <EmptyStateIcon>
          <span data-testid="custom-icon">🎨</span>
        </EmptyStateIcon>
        <EmptyStateTitle>Custom Title</EmptyStateTitle>
        <EmptyStateDescription>Custom description</EmptyStateDescription>
        <EmptyStateActions>
          <button>Action</button>
        </EmptyStateActions>
      </EmptyState>
    )

    expect(screen.getByTestId('custom-icon')).toBeInTheDocument()
    expect(screen.getByText('Custom Title')).toBeInTheDocument()
    expect(screen.getByText('Custom description')).toBeInTheDocument()
    expect(screen.getByText('Action')).toBeInTheDocument()
  })

  it('supports different sizes', () => {
    const { container, rerender } = render(
      <EmptyState size="sm" title="Small" />
    )
    let emptyState = container.firstChild
    expect(emptyState).toHaveClass('py-8', 'px-4')

    rerender(<EmptyState size="lg" title="Large" />)
    emptyState = container.firstChild
    expect(emptyState).toHaveClass('py-16', 'px-8')
  })

  it('applies custom className', () => {
    const { container } = render(
      <EmptyState className="custom-class" title="Test" />
    )
    expect(container.firstChild).toHaveClass('custom-class')
  })

  it('renders without icon when not provided', () => {
    const { container } = render(
      <EmptyState title="No icon" />
    )
    const icons = container.querySelectorAll('[class*="EmptyStateIcon"]')
    expect(icons.length).toBe(0)
  })

  it('renders without actions when not provided', () => {
    render(<EmptyState title="No actions" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('handles complex description content', () => {
    render(
      <EmptyState
        title="Complex Content"
        description={
          <div>
            <p>First paragraph</p>
            <p>Second paragraph</p>
          </div>
        }
      />
    )

    expect(screen.getByText('First paragraph')).toBeInTheDocument()
    expect(screen.getByText('Second paragraph')).toBeInTheDocument()
  })
})
