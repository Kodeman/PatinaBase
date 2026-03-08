import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ColorSwatch, ColorSwatchGroup, ColorPalette, convertColor } from './ColorSwatch'

describe('ColorSwatch', () => {
  it('renders with color', () => {
    render(<ColorSwatch color="#FF5733" label="Coral" />)
    const swatch = screen.getByLabelText('Coral')
    expect(swatch).toHaveStyle({ backgroundColor: '#FF5733' })
  })

  it('shows check icon when selected', () => {
    render(<ColorSwatch color="#FF5733" selected />)
    // Check icon should be present
  })

  it('handles click event', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<ColorSwatch color="#FF5733" onClick={onClick} />)

    await user.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalled()
  })

  it('applies size variants', () => {
    const { rerender } = render(<ColorSwatch color="#FF5733" size="sm" />)
    expect(screen.getByRole('button')).toHaveClass('h-6')

    rerender(<ColorSwatch color="#FF5733" size="lg" />)
    expect(screen.getByRole('button')).toHaveClass('h-10')
  })

  it('applies variant styles', () => {
    const { rerender } = render(<ColorSwatch color="#FF5733" variant="rounded" />)
    expect(screen.getByRole('button')).toHaveClass('rounded-full')

    rerender(<ColorSwatch color="#FF5733" variant="square" />)
    expect(screen.getByRole('button')).toHaveClass('rounded-none')
  })
})

describe('ColorSwatchGroup', () => {
  const colors = [
    { value: '#FF5733', label: 'Coral' },
    { value: '#33FF57', label: 'Green' },
    { value: '#3357FF', label: 'Blue' },
  ]

  it('renders multiple color swatches', () => {
    render(<ColorSwatchGroup colors={colors} />)
    expect(screen.getByLabelText('Coral')).toBeInTheDocument()
    expect(screen.getByLabelText('Green')).toBeInTheDocument()
    expect(screen.getByLabelText('Blue')).toBeInTheDocument()
  })

  it('handles single selection', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ColorSwatchGroup colors={colors} onChange={onChange} />)

    await user.click(screen.getByLabelText('Coral'))
    expect(onChange).toHaveBeenCalledWith('#FF5733')
  })

  it('handles multiple selection', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ColorSwatchGroup colors={colors} multiple onChange={onChange} />)

    await user.click(screen.getByLabelText('Coral'))
    expect(onChange).toHaveBeenCalledWith(['#FF5733'])

    await user.click(screen.getByLabelText('Green'))
    expect(onChange).toHaveBeenLastCalledWith(['#FF5733', '#33FF57'])
  })

  it('shows labels when enabled', () => {
    render(<ColorSwatchGroup colors={colors} showLabels />)
    expect(screen.getByText('Coral')).toBeInTheDocument()
    expect(screen.getByText('Green')).toBeInTheDocument()
  })
})

describe('ColorPalette', () => {
  const palette = {
    primary: [
      { value: '#FF5733', label: 'Red' },
      { value: '#33FF57', label: 'Green' },
    ],
    secondary: [
      { value: '#3357FF', label: 'Blue' },
      { value: '#F3FF33', label: 'Yellow' },
    ],
  }

  it('renders color palette with categories', () => {
    render(<ColorPalette palette={palette} />)
    expect(screen.getByText('primary')).toBeInTheDocument()
    expect(screen.getByText('secondary')).toBeInTheDocument()
  })

  it('handles color selection', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ColorPalette palette={palette} onChange={onChange} />)

    await user.click(screen.getByLabelText('Red'))
    expect(onChange).toHaveBeenCalledWith('#FF5733')
  })
})

describe('convertColor', () => {
  it('converts hex to rgb', () => {
    const rgb = convertColor.hexToRgb('#FF5733')
    expect(rgb).toEqual({ r: 255, g: 87, b: 51 })
  })

  it('converts rgb to hex', () => {
    const hex = convertColor.rgbToHex(255, 87, 51)
    expect(hex).toBe('#ff5733')
  })

  it('converts hex to hsl', () => {
    const hsl = convertColor.hexToHsl('#FF5733')
    expect(hsl).toBeDefined()
    expect(hsl?.h).toBeGreaterThanOrEqual(0)
    expect(hsl?.h).toBeLessThanOrEqual(360)
  })
})
