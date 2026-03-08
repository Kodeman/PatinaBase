import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Icon, CustomIcon, registerIcon, getCustomIcon, hasCustomIcon } from './Icon'

describe('Icon', () => {
  it('renders a lucide icon', () => {
    const { container } = render(<Icon name="Heart" data-testid="heart-icon" />)
    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
  })

  it('applies size prop', () => {
    const { container } = render(<Icon name="Heart" size={32} />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('width', '32')
    expect(svg).toHaveAttribute('height', '32')
  })

  it('applies color prop', () => {
    const { container } = render(<Icon name="Heart" color="red" />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('color', 'red')
  })

  it('applies strokeWidth prop', () => {
    const { container } = render(<Icon name="Heart" strokeWidth={3} />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('stroke-width', '3')
  })

  it('applies className', () => {
    const { container } = render(<Icon name="Heart" className="custom-class" />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveClass('custom-class')
  })

  it('returns null for invalid icon name', () => {
    const { container } = render(<Icon name={'InvalidIcon' as any} />)
    expect(container.firstChild).toBeNull()
  })
})

describe('CustomIcon', () => {
  it('renders custom SVG icon', () => {
    const { container } = render(
      <CustomIcon data-testid="custom-icon">
        <circle cx="12" cy="12" r="10" />
      </CustomIcon>
    )
    const svg = container.querySelector('svg')
    const circle = container.querySelector('circle')
    expect(svg).toBeInTheDocument()
    expect(circle).toBeInTheDocument()
  })

  it('applies size prop', () => {
    const { container } = render(
      <CustomIcon size={48}>
        <circle cx="12" cy="12" r="10" />
      </CustomIcon>
    )
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('width', '48')
    expect(svg).toHaveAttribute('height', '48')
  })

  it('applies custom viewBox', () => {
    const { container } = render(
      <CustomIcon viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="40" />
      </CustomIcon>
    )
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('viewBox', '0 0 100 100')
  })

  it('applies className', () => {
    const { container } = render(
      <CustomIcon className="custom-svg-class">
        <circle cx="12" cy="12" r="10" />
      </CustomIcon>
    )
    const svg = container.querySelector('svg')
    expect(svg).toHaveClass('custom-svg-class')
  })
})

describe('Icon Registry', () => {
  it('registers and retrieves custom icons', () => {
    const BrandIcon = () => (
      <CustomIcon>
        <rect width="24" height="24" />
      </CustomIcon>
    )

    registerIcon('BrandLogo', BrandIcon)

    expect(hasCustomIcon('BrandLogo')).toBe(true)
    expect(getCustomIcon('BrandLogo')).toBe(BrandIcon)
  })

  it('returns undefined for unregistered icons', () => {
    expect(hasCustomIcon('NonExistent')).toBe(false)
    expect(getCustomIcon('NonExistent')).toBeUndefined()
  })
})
