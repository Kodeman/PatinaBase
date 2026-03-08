import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './Card'

describe('Card', () => {
  it('renders card with content', () => {
    render(<Card>Card Content</Card>)
    expect(screen.getByText('Card Content')).toBeInTheDocument()
  })

  it('renders compound components', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Card Title</CardTitle>
          <CardDescription>Card Description</CardDescription>
        </CardHeader>
        <CardContent>Content</CardContent>
        <CardFooter>Footer</CardFooter>
      </Card>
    )

    expect(screen.getByText('Card Title')).toBeInTheDocument()
    expect(screen.getByText('Card Description')).toBeInTheDocument()
    expect(screen.getByText('Content')).toBeInTheDocument()
    expect(screen.getByText('Footer')).toBeInTheDocument()
  })

  it('applies variant styles', () => {
    const { rerender, container } = render(<Card variant="outlined">Content</Card>)
    expect(container.firstChild).toHaveClass('border-2')

    rerender(<Card variant="elevated">Content</Card>)
    expect(container.firstChild).toHaveClass('shadow-md')
  })

  it('applies hoverable styles', () => {
    const { container } = render(<Card hoverable>Content</Card>)
    expect(container.firstChild).toHaveClass('hover:shadow-md')
  })

  it('applies clickable styles', () => {
    const { container } = render(<Card clickable>Content</Card>)
    expect(container.firstChild).toHaveClass('cursor-pointer')
  })

  it('forwards ref correctly', () => {
    const ref = vi.fn()
    render(<Card ref={ref}>Content</Card>)
    expect(ref).toHaveBeenCalled()
  })
})
