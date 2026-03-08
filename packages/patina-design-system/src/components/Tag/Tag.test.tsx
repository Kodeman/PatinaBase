import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Tag, TagGroup } from './Tag'

describe('Tag', () => {
  it('renders correctly', () => {
    render(<Tag>Test Tag</Tag>)
    expect(screen.getByText('Test Tag')).toBeInTheDocument()
  })

  it('renders with different variants', () => {
    const { rerender } = render(<Tag variant="success">Success</Tag>)
    expect(screen.getByText('Success')).toHaveClass('bg-green-100')

    rerender(<Tag variant="error">Error</Tag>)
    expect(screen.getByText('Error')).toHaveClass('bg-red-100')

    rerender(<Tag variant="warning">Warning</Tag>)
    expect(screen.getByText('Warning')).toHaveClass('bg-yellow-100')
  })

  it('renders with remove button when onRemove is provided', () => {
    const handleRemove = vi.fn()
    render(<Tag onRemove={handleRemove}>Removable</Tag>)

    const removeButton = screen.getByRole('button', { name: /remove tag/i })
    expect(removeButton).toBeInTheDocument()
  })

  it('calls onRemove when remove button is clicked', async () => {
    const user = userEvent.setup()
    const handleRemove = vi.fn()

    render(<Tag onRemove={handleRemove}>Removable</Tag>)

    const removeButton = screen.getByRole('button', { name: /remove tag/i })
    await user.click(removeButton)

    expect(handleRemove).toHaveBeenCalledTimes(1)
  })

  it('does not show remove button when onRemove is not provided', () => {
    render(<Tag>Not Removable</Tag>)

    const removeButton = screen.queryByRole('button', { name: /remove tag/i })
    expect(removeButton).not.toBeInTheDocument()
  })

  it('renders with icon', () => {
    render(<Tag icon={<span>🔥</span>}>With Icon</Tag>)

    expect(screen.getByText('🔥')).toBeInTheDocument()
    expect(screen.getByText('With Icon')).toBeInTheDocument()
  })

  it('renders TagGroup with multiple tags', () => {
    render(
      <TagGroup>
        <Tag>Tag 1</Tag>
        <Tag>Tag 2</Tag>
        <Tag>Tag 3</Tag>
      </TagGroup>
    )

    expect(screen.getByText('Tag 1')).toBeInTheDocument()
    expect(screen.getByText('Tag 2')).toBeInTheDocument()
    expect(screen.getByText('Tag 3')).toBeInTheDocument()
  })
})
