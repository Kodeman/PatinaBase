import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PriceDisplay, calculateDiscount, formatPriceRange } from './PriceDisplay'

describe('PriceDisplay', () => {
  it('renders price in USD by default', () => {
    render(<PriceDisplay amount={9999} />)
    expect(screen.getByText('$99.99')).toBeInTheDocument()
  })

  it('renders price in different currency', () => {
    render(<PriceDisplay amount={9999} currency="EUR" locale="de-DE" />)
    const text = screen.getByText(/99,99/)
    expect(text).toBeInTheDocument()
  })

  it('renders sale price with strikethrough original', () => {
    render(<PriceDisplay amount={5999} originalPrice={9999} showSale />)
    expect(screen.getByText('$59.99')).toBeInTheDocument()
    expect(screen.getByText('$99.99')).toBeInTheDocument()
    expect(screen.getByText('$99.99')).toHaveClass('line-through')
  })

  it('does not show sale if original price is lower', () => {
    render(<PriceDisplay amount={9999} originalPrice={5999} showSale />)
    expect(screen.getByText('$99.99')).toBeInTheDocument()
    expect(screen.queryByText('$59.99')).not.toBeInTheDocument()
  })

  it('hides currency symbol when showCurrency is false', () => {
    render(<PriceDisplay amount={9999} showCurrency={false} />)
    expect(screen.getByText('99.99')).toBeInTheDocument()
  })

  it('hides decimals when showDecimals is false', () => {
    render(<PriceDisplay amount={9999} showDecimals={false} />)
    expect(screen.getByText('$100')).toBeInTheDocument()
  })

  it('applies size variant', () => {
    const { container } = render(<PriceDisplay amount={9999} size="lg" />)
    const span = container.querySelector('span')
    expect(span).toHaveClass('text-lg')
  })

  it('applies variant styling', () => {
    const { container } = render(<PriceDisplay amount={9999} variant="primary" />)
    const span = container.querySelector('span')
    expect(span).toHaveClass('text-primary')
  })

  it('applies custom className', () => {
    const { container } = render(<PriceDisplay amount={9999} className="custom-class" />)
    const span = container.querySelector('span')
    expect(span).toHaveClass('custom-class')
  })
})

describe('calculateDiscount', () => {
  it('calculates discount percentage correctly', () => {
    expect(calculateDiscount(10000, 7500)).toBe(25)
    expect(calculateDiscount(10000, 5000)).toBe(50)
    expect(calculateDiscount(10000, 9000)).toBe(10)
  })

  it('returns 0 for invalid prices', () => {
    expect(calculateDiscount(0, 5000)).toBe(0)
    expect(calculateDiscount(-1000, 5000)).toBe(0)
  })

  it('rounds to nearest integer', () => {
    expect(calculateDiscount(10000, 6666)).toBe(33)
  })
})

describe('formatPriceRange', () => {
  it('formats price range correctly', () => {
    const range = formatPriceRange(5000, 15000)
    expect(range).toBe('$50.00 - $150.00')
  })

  it('formats price range with different currency', () => {
    const range = formatPriceRange(5000, 15000, 'EUR', 'de-DE')
    expect(range).toContain('50')
    expect(range).toContain('150')
  })
})
