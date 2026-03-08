import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RadioGroup, Radio } from './Radio'

describe('RadioGroup', () => {
  it('renders correctly', () => {
    const { container } = render(
      <RadioGroup>
        <Radio value="option1" id="option1" />
        <Radio value="option2" id="option2" />
      </RadioGroup>
    )
    expect(container.querySelector('[role="radiogroup"]')).toBeInTheDocument()
  })

  it('renders radio items', () => {
    const { container } = render(
      <RadioGroup>
        <Radio value="option1" id="option1" />
        <Radio value="option2" id="option2" />
      </RadioGroup>
    )
    const radios = container.querySelectorAll('[role="radio"]')
    expect(radios).toHaveLength(2)
  })

  it('handles value change', async () => {
    const user = userEvent.setup()
    const handleChange = vi.fn()

    const { container } = render(
      <RadioGroup onValueChange={handleChange}>
        <Radio value="option1" id="option1" />
        <Radio value="option2" id="option2" />
      </RadioGroup>
    )

    const radio = container.querySelectorAll('[role="radio"]')[0] as HTMLElement
    await user.click(radio)

    expect(handleChange).toHaveBeenCalledWith('option1')
  })

  it('handles controlled value', () => {
    const { container, rerender } = render(
      <RadioGroup value="option1">
        <Radio value="option1" id="option1" />
        <Radio value="option2" id="option2" />
      </RadioGroup>
    )

    const radios = container.querySelectorAll('[role="radio"]')
    expect(radios[0]).toHaveAttribute('data-state', 'checked')
    expect(radios[1]).toHaveAttribute('data-state', 'unchecked')

    rerender(
      <RadioGroup value="option2">
        <Radio value="option1" id="option1" />
        <Radio value="option2" id="option2" />
      </RadioGroup>
    )

    expect(radios[0]).toHaveAttribute('data-state', 'unchecked')
    expect(radios[1]).toHaveAttribute('data-state', 'checked')
  })

  it('applies vertical orientation by default', () => {
    const { container } = render(
      <RadioGroup>
        <Radio value="option1" />
      </RadioGroup>
    )
    const group = container.querySelector('[role="radiogroup"]')
    expect(group).toHaveClass('grid-flow-row')
  })

  it('applies horizontal orientation', () => {
    const { container } = render(
      <RadioGroup orientation="horizontal">
        <Radio value="option1" />
      </RadioGroup>
    )
    const group = container.querySelector('[role="radiogroup"]')
    expect(group).toHaveClass('grid-flow-col')
  })

  it('applies size variants to radio items', () => {
    const { container: smContainer } = render(
      <RadioGroup>
        <Radio value="option1" size="sm" />
      </RadioGroup>
    )
    const { container: mdContainer } = render(
      <RadioGroup>
        <Radio value="option1" size="md" />
      </RadioGroup>
    )
    const { container: lgContainer } = render(
      <RadioGroup>
        <Radio value="option1" size="lg" />
      </RadioGroup>
    )

    expect(smContainer.querySelector('[role="radio"]')).toHaveClass('h-4 w-4')
    expect(mdContainer.querySelector('[role="radio"]')).toHaveClass('h-5 w-5')
    expect(lgContainer.querySelector('[role="radio"]')).toHaveClass('h-6 w-6')
  })

  it('disables radio when disabled prop is set', () => {
    const { container } = render(
      <RadioGroup>
        <Radio value="option1" disabled />
      </RadioGroup>
    )
    const radio = container.querySelector('[role="radio"]')
    expect(radio).toBeDisabled()
  })

  it('does not trigger onChange when disabled', async () => {
    const user = userEvent.setup()
    const handleChange = vi.fn()

    const { container } = render(
      <RadioGroup onValueChange={handleChange}>
        <Radio value="option1" disabled />
      </RadioGroup>
    )

    const radio = container.querySelector('[role="radio"]') as HTMLElement
    await user.click(radio)

    expect(handleChange).not.toHaveBeenCalled()
  })

  it('can be used with labels', async () => {
    const user = userEvent.setup()
    const handleChange = vi.fn()

    render(
      <RadioGroup onValueChange={handleChange}>
        <div>
          <Radio value="option1" id="option1" />
          <label htmlFor="option1">Option 1</label>
        </div>
      </RadioGroup>
    )

    const label = screen.getByText('Option 1')
    await user.click(label)

    expect(handleChange).toHaveBeenCalledWith('option1')
  })

  it('only allows one radio to be selected', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <RadioGroup>
        <Radio value="option1" id="option1" />
        <Radio value="option2" id="option2" />
      </RadioGroup>
    )

    const radios = container.querySelectorAll('[role="radio"]') as NodeListOf<HTMLElement>

    await user.click(radios[0])
    expect(radios[0]).toHaveAttribute('data-state', 'checked')
    expect(radios[1]).toHaveAttribute('data-state', 'unchecked')

    await user.click(radios[1])
    expect(radios[0]).toHaveAttribute('data-state', 'unchecked')
    expect(radios[1]).toHaveAttribute('data-state', 'checked')
  })

  it('applies custom className to RadioGroup', () => {
    const { container } = render(
      <RadioGroup className="custom-class">
        <Radio value="option1" />
      </RadioGroup>
    )
    const group = container.querySelector('[role="radiogroup"]')
    expect(group).toHaveClass('custom-class')
  })

  it('applies custom className to Radio', () => {
    const { container } = render(
      <RadioGroup>
        <Radio value="option1" className="custom-radio" />
      </RadioGroup>
    )
    const radio = container.querySelector('[role="radio"]')
    expect(radio).toHaveClass('custom-radio')
  })

  it('forwards ref correctly for RadioGroup', () => {
    const ref = vi.fn()
    render(
      <RadioGroup ref={ref}>
        <Radio value="option1" />
      </RadioGroup>
    )
    expect(ref).toHaveBeenCalled()
  })

  it('forwards ref correctly for Radio', () => {
    const ref = vi.fn()
    render(
      <RadioGroup>
        <Radio value="option1" ref={ref} />
      </RadioGroup>
    )
    expect(ref).toHaveBeenCalled()
  })

  it('supports required attribute', () => {
    const { container } = render(
      <RadioGroup required>
        <Radio value="option1" />
      </RadioGroup>
    )
    const group = container.querySelector('[role="radiogroup"]')
    // Radix UI's RadioGroup supports 'required' but it's applied as aria-required
    // The HTML 'required' attribute is not standard for radiogroup elements
    expect(group).toHaveAttribute('aria-required', 'true')
  })

  it('has proper ARIA attributes', () => {
    const { container } = render(
      <RadioGroup aria-label="Choose an option">
        <Radio value="option1" />
      </RadioGroup>
    )
    const group = container.querySelector('[role="radiogroup"]')
    expect(group).toHaveAttribute('aria-label', 'Choose an option')
  })
})
