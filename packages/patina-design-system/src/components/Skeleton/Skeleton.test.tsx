import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Skeleton, SkeletonAvatar, SkeletonText, SkeletonCard } from './Skeleton'

describe('Skeleton', () => {
  it('renders skeleton element', () => {
    render(<Skeleton />)
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByText('Loading...')).toHaveClass('sr-only')
  })

  it('renders different variants', () => {
    const { rerender, container } = render(<Skeleton variant="text" />)
    expect(container.querySelector('[role="status"]')).toHaveClass('h-4', 'w-full', 'rounded')

    rerender(<Skeleton variant="circular" />)
    expect(container.querySelector('[role="status"]')).toHaveClass('rounded-full')

    rerender(<Skeleton variant="rectangular" />)
    expect(container.querySelector('[role="status"]')).toHaveClass('rounded-md')
  })

  it('applies pulse animation by default', () => {
    const { container } = render(<Skeleton />)
    expect(container.querySelector('[role="status"]')).toHaveClass('animate-pulse')
  })

  it('applies wave animation', () => {
    const { container } = render(<Skeleton animation="wave" />)
    expect(container.querySelector('[role="status"]')).toHaveClass('animate-shimmer')
  })

  it('applies no animation', () => {
    const { container } = render(<Skeleton animation="none" />)
    const skeleton = container.querySelector('[role="status"]')
    expect(skeleton).not.toHaveClass('animate-pulse')
    expect(skeleton).not.toHaveClass('animate-shimmer')
  })

  it('applies custom width and height', () => {
    const { container } = render(<Skeleton width={100} height={50} />)
    const skeleton = container.querySelector('[role="status"]') as HTMLElement
    expect(skeleton.style.width).toBe('100px')
    expect(skeleton.style.height).toBe('50px')
  })

  it('applies string width and height', () => {
    const { container } = render(<Skeleton width="100%" height="10rem" />)
    const skeleton = container.querySelector('[role="status"]') as HTMLElement
    expect(skeleton.style.width).toBe('100%')
    expect(skeleton.style.height).toBe('10rem')
  })

  it('hides skeleton when show is false', () => {
    render(<Skeleton show={false} />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows skeleton when show is true', () => {
    render(<Skeleton show={true} />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('applies custom className', () => {
    const { container } = render(<Skeleton className="custom-class" />)
    expect(container.querySelector('[role="status"]')).toHaveClass('custom-class')
  })

  it('forwards ref correctly', () => {
    const ref = vi.fn()
    render(<Skeleton ref={ref} />)
    expect(ref).toHaveBeenCalled()
  })

  it('passes through additional props', () => {
    render(<Skeleton data-testid="custom-skeleton" />)
    expect(screen.getByTestId('custom-skeleton')).toBeInTheDocument()
  })
})

describe('SkeletonAvatar', () => {
  it('renders circular skeleton with default dimensions', () => {
    const { container } = render(<SkeletonAvatar />)
    const skeleton = container.querySelector('[role="status"]') as HTMLElement
    expect(skeleton).toHaveClass('rounded-full')
    expect(skeleton.style.width).toBe('40px')
    expect(skeleton.style.height).toBe('40px')
  })
})

describe('SkeletonText', () => {
  it('renders text variant skeleton', () => {
    const { container } = render(<SkeletonText />)
    expect(container.querySelector('[role="status"]')).toHaveClass('h-4', 'w-full', 'rounded')
  })
})

describe('SkeletonCard', () => {
  it('renders rectangular skeleton with default height', () => {
    const { container } = render(<SkeletonCard />)
    const skeleton = container.querySelector('[role="status"]')
    expect(skeleton).toHaveClass('h-48', 'w-full', 'rounded-md')
  })
})
