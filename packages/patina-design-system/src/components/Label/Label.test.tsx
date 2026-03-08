import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Label } from './Label'

describe('Label', () => {
  it('renders correctly', () => {
    render(<Label>Test Label</Label>)
    expect(screen.getByText('Test Label')).toBeInTheDocument()
  })

  it('renders with htmlFor attribute', () => {
    render(<Label htmlFor="input-id">Test Label</Label>)
    const label = screen.getByText('Test Label')
    expect(label).toHaveAttribute('for', 'input-id')
  })

  it('shows required indicator when required is true', () => {
    const { container } = render(<Label required>Required Field</Label>)
    const label = container.querySelector('label')
    expect(label).toHaveClass("after:content-['*']")
  })

  it('shows optional indicator when optional is true', () => {
    const { container } = render(<Label optional>Optional Field</Label>)
    const label = container.querySelector('label')
    expect(label).toHaveClass("after:content-['(optional)']")
  })

  it('does not show required indicator by default', () => {
    const { container } = render(<Label>Default Label</Label>)
    const label = container.querySelector('label')
    expect(label).not.toHaveClass("after:content-['*']")
  })

  it('applies custom className', () => {
    render(<Label className="custom-class">Test Label</Label>)
    const label = screen.getByText('Test Label')
    expect(label).toHaveClass('custom-class')
  })

  it('forwards all props to underlying element', () => {
    render(
      <Label data-testid="label" id="custom-id">
        Test Label
      </Label>
    )
    const label = screen.getByTestId('label')
    expect(label).toHaveAttribute('id', 'custom-id')
  })

  it('renders as label element', () => {
    const { container } = render(<Label>Test Label</Label>)
    const label = container.querySelector('label')
    expect(label).toBeInTheDocument()
  })

  it('maintains accessibility with htmlFor', () => {
    const { container } = render(
      <div>
        <Label htmlFor="test-input">Test Label</Label>
        <input id="test-input" />
      </div>
    )
    const label = container.querySelector('label')
    const input = container.querySelector('input')
    expect(label).toHaveAttribute('for', 'test-input')
    expect(input).toHaveAttribute('id', 'test-input')
  })
})
