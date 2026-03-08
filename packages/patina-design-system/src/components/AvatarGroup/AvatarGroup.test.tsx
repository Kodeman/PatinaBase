import { render, screen } from '@testing-library/react'
import { axe } from 'vitest-axe'
import { Avatar } from '../Avatar'
import { AvatarGroup } from './AvatarGroup'

describe('AvatarGroup', () => {
  it('renders all avatars when below max', async () => {
    render(
      <AvatarGroup max={5}>
        <Avatar name="John Doe" fallbackDelay={0} />
        <Avatar name="Jane Smith" fallbackDelay={0} />
        <Avatar name="Bob Johnson" fallbackDelay={0} />
      </AvatarGroup>
    )

    // Wait for avatars to render
    expect(await screen.findByText('JD')).toBeInTheDocument()
    expect(await screen.findByText('JS')).toBeInTheDocument()
    expect(await screen.findByText('BJ')).toBeInTheDocument()
  })

  it('limits avatars to max and shows overflow count', async () => {
    render(
      <AvatarGroup max={2}>
        <Avatar name="John Doe" fallbackDelay={0} />
        <Avatar name="Jane Smith" fallbackDelay={0} />
        <Avatar name="Bob Johnson" fallbackDelay={0} />
        <Avatar name="Alice Williams" fallbackDelay={0} />
      </AvatarGroup>
    )

    expect(await screen.findByText('JD')).toBeInTheDocument()
    expect(await screen.findByText('JS')).toBeInTheDocument()
    expect(await screen.findByText('+2')).toBeInTheDocument()
    expect(screen.queryByText('BJ')).not.toBeInTheDocument()
  })

  it('does not show overflow when all avatars fit', async () => {
    render(
      <AvatarGroup max={3}>
        <Avatar name="John Doe" fallbackDelay={0} />
        <Avatar name="Jane Smith" fallbackDelay={0} />
      </AvatarGroup>
    )

    expect(await screen.findByText('JD')).toBeInTheDocument()
    expect(screen.queryByText(/^\+/)).not.toBeInTheDocument()
  })

  it('applies spacing correctly', () => {
    const { container, rerender } = render(
      <AvatarGroup spacing="tight">
        <Avatar name="John" />
        <Avatar name="Jane" />
      </AvatarGroup>
    )

    expect(container.firstChild).toHaveClass('-space-x-1')

    rerender(
      <AvatarGroup spacing="normal">
        <Avatar name="John" />
        <Avatar name="Jane" />
      </AvatarGroup>
    )

    expect(container.firstChild).toHaveClass('-space-x-2')

    rerender(
      <AvatarGroup spacing="loose">
        <Avatar name="John" />
        <Avatar name="Jane" />
      </AvatarGroup>
    )

    expect(container.firstChild).toHaveClass('-space-x-3')
  })

  it('passes size to all avatars', async () => {
    const { container } = render(
      <AvatarGroup size="lg">
        <Avatar name="John Doe" fallbackDelay={0} />
        <Avatar name="Jane Smith" fallbackDelay={0} />
      </AvatarGroup>
    )

    const avatars = container.querySelectorAll('[class*="h-12"]')
    expect(avatars.length).toBeGreaterThanOrEqual(2)
  })

  it('passes shape to all avatars', () => {
    const { container } = render(
      <AvatarGroup shape="square">
        <Avatar name="John" />
        <Avatar name="Jane" />
      </AvatarGroup>
    )

    const avatars = container.querySelectorAll('[class*="rounded-md"]')
    expect(avatars.length).toBeGreaterThanOrEqual(2)
  })

  it('applies custom className', () => {
    const { container } = render(
      <AvatarGroup className="custom-class">
        <Avatar name="John" />
      </AvatarGroup>
    )

    expect(container.firstChild).toHaveClass('custom-class')
  })

  it('handles single avatar', async () => {
    render(
      <AvatarGroup>
        <Avatar name="John Doe" fallbackDelay={0} />
      </AvatarGroup>
    )

    expect(await screen.findByText('JD')).toBeInTheDocument()
    expect(screen.queryByText(/^\+/)).not.toBeInTheDocument()
  })

  it('shows correct overflow count for many avatars', async () => {
    const avatars = Array.from({ length: 10 }, (_, i) => (
      <Avatar key={i} name={`User ${i}`} fallbackDelay={0} />
    ))

    render(<AvatarGroup max={3}>{avatars}</AvatarGroup>)

    expect(await screen.findByText('+7')).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(
      <AvatarGroup max={3}>
        <Avatar name="John Doe" />
        <Avatar name="Jane Smith" />
        <Avatar name="Bob Johnson" />
        <Avatar name="Alice Williams" />
      </AvatarGroup>
    )

    expect(await axe(container)).toHaveNoViolations()
  })
})
