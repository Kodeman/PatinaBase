import { render, screen, waitFor } from '@testing-library/react'
import { axe } from 'vitest-axe'
import { Avatar } from './Avatar'

describe('Avatar', () => {
  it('renders image when src is provided', async () => {
    render(<Avatar src="/avatar.jpg" alt="John Doe" />)
    await waitFor(() => {
      const img = screen.getByRole('img')
      expect(img).toBeInTheDocument()
      expect(img).toHaveAttribute('src', '/avatar.jpg')
      expect(img).toHaveAttribute('alt', 'John Doe')
    })
  })

  it('renders fallback initials from name', async () => {
    render(<Avatar name="John Doe" fallbackDelay={0} />)
    await waitFor(() => {
      expect(screen.getByText('JD')).toBeInTheDocument()
    })
  })

  it('renders single letter initials for single word names', async () => {
    render(<Avatar name="Madonna" fallbackDelay={0} />)
    await waitFor(() => {
      expect(screen.getByText('MA')).toBeInTheDocument()
    })
  })

  it('renders question mark when no name is provided', async () => {
    render(<Avatar fallbackDelay={0} />)
    await waitFor(() => {
      expect(screen.getByText('?')).toBeInTheDocument()
    })
  })

  it('applies size variants correctly', () => {
    const { container } = render(<Avatar name="John" size="lg" />)
    expect(container.firstChild).toHaveClass('h-12', 'w-12')
  })

  it('applies shape variants correctly', () => {
    const { container: circleContainer } = render(
      <Avatar name="John" shape="circle" />
    )
    expect(circleContainer.firstChild).toHaveClass('rounded-full')

    const { container: squareContainer } = render(
      <Avatar name="John" shape="square" />
    )
    expect(squareContainer.firstChild).toHaveClass('rounded-md')
  })

  it('renders status indicator when status is provided', () => {
    render(<Avatar name="John Doe" status="online" />)
    expect(screen.getByLabelText('Status: online')).toBeInTheDocument()
  })

  it('applies correct status color', () => {
    const { rerender } = render(<Avatar name="John" status="online" />)
    expect(screen.getByLabelText('Status: online')).toHaveClass('bg-green-500')

    rerender(<Avatar name="John" status="offline" />)
    expect(screen.getByLabelText('Status: offline')).toHaveClass('bg-gray-400')

    rerender(<Avatar name="John" status="busy" />)
    expect(screen.getByLabelText('Status: busy')).toHaveClass('bg-red-500')

    rerender(<Avatar name="John" status="away" />)
    expect(screen.getByLabelText('Status: away')).toHaveClass('bg-yellow-500')
  })

  it('uses alt as fallback when name is not provided', async () => {
    render(<Avatar src="/avatar.jpg" alt="Jane Smith" />)
    const img = await screen.findByRole('img')
    expect(img).toHaveAttribute('alt', 'Jane Smith')
  })

  it('applies custom className', () => {
    const { container } = render(<Avatar name="John" className="custom-class" />)
    expect(container.firstChild).toHaveClass('custom-class')
  })

  it('handles extra long names gracefully', async () => {
    render(<Avatar name="Jean-Baptiste Emmanuel Zorg" fallbackDelay={0} />)
    await waitFor(() => {
      expect(screen.getByText('JZ')).toBeInTheDocument()
    })
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<Avatar name="John Doe" status="online" />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
