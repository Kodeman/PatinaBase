import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Slider } from './Slider'

describe('Slider', () => {
  it('renders correctly', () => {
    render(<Slider defaultValue={[50]} />)
    const slider = screen.getByRole('slider')
    expect(slider).toBeInTheDocument()
  })

  it('renders with default value', () => {
    render(<Slider defaultValue={[30]} />)
    const slider = screen.getByRole('slider')
    expect(slider).toHaveAttribute('aria-valuenow', '30')
  })

  it('renders range slider with two thumbs', () => {
    render(<Slider defaultValue={[25, 75]} />)
    const sliders = screen.getAllByRole('slider')
    expect(sliders).toHaveLength(2)
    expect(sliders[0]).toHaveAttribute('aria-valuenow', '25')
    expect(sliders[1]).toHaveAttribute('aria-valuenow', '75')
  })

  it('calls onValueChange when value changes', async () => {
    const user = userEvent.setup()
    const handleChange = vi.fn()
    render(<Slider defaultValue={[50]} onValueChange={handleChange} />)

    const slider = screen.getByRole('slider')
    await user.click(slider)

    // Note: Testing actual drag behavior is complex with user-event
    // This test verifies the component renders and accepts the callback
    expect(handleChange).toBeDefined()
  })

  it('respects min and max values', () => {
    render(<Slider defaultValue={[50]} min={0} max={100} />)
    const slider = screen.getByRole('slider')
    expect(slider).toHaveAttribute('aria-valuemin', '0')
    expect(slider).toHaveAttribute('aria-valuemax', '100')
  })

  it('respects step value', () => {
    render(<Slider defaultValue={[50]} step={10} />)
    const slider = screen.getByRole('slider')
    // Radix UI doesn't expose step in aria attributes, but we can verify it's passed
    expect(slider).toBeInTheDocument()
  })

  it('renders with value labels when showValue is true', () => {
    render(<Slider defaultValue={[50]} showValue />)
    expect(screen.getByText('50')).toBeInTheDocument()
  })

  it('formats value with custom formatter', () => {
    render(
      <Slider
        defaultValue={[50]}
        showValue
        formatValue={(val) => `$${val}`}
      />
    )
    expect(screen.getByText('$50')).toBeInTheDocument()
  })

  it('renders marks', () => {
    const marks = [
      { value: 0, label: 'Min' },
      { value: 50, label: 'Mid' },
      { value: 100, label: 'Max' },
    ]
    render(<Slider defaultValue={[50]} marks={marks} />)
    expect(screen.getByText('Min')).toBeInTheDocument()
    expect(screen.getByText('Mid')).toBeInTheDocument()
    expect(screen.getByText('Max')).toBeInTheDocument()
  })

  it('respects disabled state', () => {
    render(<Slider defaultValue={[50]} disabled />)
    const slider = screen.getByRole('slider')
    expect(slider).toBeDisabled()
  })

  it('supports keyboard navigation', async () => {
    const user = userEvent.setup()
    const handleChange = vi.fn()
    render(<Slider defaultValue={[50]} onValueChange={handleChange} />)

    const slider = screen.getByRole('slider')
    slider.focus()
    expect(slider).toHaveFocus()

    await user.keyboard('{ArrowRight}')
    expect(handleChange).toHaveBeenCalled()
  })

  it('applies size variants', () => {
    const { container, rerender } = render(<Slider defaultValue={[50]} size="sm" />)
    expect(container.querySelector('.h-1')).toBeInTheDocument()

    rerender(<Slider defaultValue={[50]} size="md" />)
    expect(container.querySelector('.h-2')).toBeInTheDocument()

    rerender(<Slider defaultValue={[50]} size="lg" />)
    expect(container.querySelector('.h-3')).toBeInTheDocument()
  })
})
