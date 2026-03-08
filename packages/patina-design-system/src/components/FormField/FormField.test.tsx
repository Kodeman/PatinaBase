import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FormField } from './FormField'
import { Input } from '../Input'

describe('FormField', () => {
  it('renders with label and input', () => {
    render(
      <FormField label="Email" htmlFor="email">
        <Input id="email" />
      </FormField>
    )
    expect(screen.getByText('Email')).toBeInTheDocument()
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('renders without label', () => {
    render(
      <FormField>
        <Input />
      </FormField>
    )
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('displays description text', () => {
    render(
      <FormField label="Email" description="We'll never share your email">
        <Input />
      </FormField>
    )
    expect(screen.getByText("We'll never share your email")).toBeInTheDocument()
  })

  it('displays error message', () => {
    render(
      <FormField label="Email" error="Email is required">
        <Input />
      </FormField>
    )
    expect(screen.getByText('Email is required')).toBeInTheDocument()
  })

  it('displays success message', () => {
    render(
      <FormField label="Email" success="Email is valid">
        <Input />
      </FormField>
    )
    expect(screen.getByText('Email is valid')).toBeInTheDocument()
  })

  it('displays info message', () => {
    render(
      <FormField label="Email" info="This field is optional">
        <Input />
      </FormField>
    )
    expect(screen.getByText('This field is optional')).toBeInTheDocument()
  })

  it('shows required indicator on label', () => {
    const { container } = render(
      <FormField label="Email" required>
        <Input />
      </FormField>
    )
    const label = container.querySelector('label')
    expect(label).toHaveClass("after:content-['*']")
  })

  it('shows optional indicator on label', () => {
    const { container } = render(
      <FormField label="Phone" optional>
        <Input />
      </FormField>
    )
    const label = container.querySelector('label')
    expect(label).toHaveClass("after:content-['(optional)']")
  })

  it('connects label to input with htmlFor', () => {
    const { container } = render(
      <FormField label="Email" htmlFor="email-input">
        <Input id="email-input" />
      </FormField>
    )
    const label = container.querySelector('label')
    expect(label).toHaveAttribute('for', 'email-input')
  })

  it('prioritizes error over success message', () => {
    render(
      <FormField label="Email" error="Email is invalid" success="Email is valid">
        <Input />
      </FormField>
    )
    expect(screen.getByText('Email is invalid')).toBeInTheDocument()
    expect(screen.queryByText('Email is valid')).not.toBeInTheDocument()
  })

  it('prioritizes error over info message', () => {
    render(
      <FormField label="Email" error="Email is invalid" info="Optional field">
        <Input />
      </FormField>
    )
    expect(screen.getByText('Email is invalid')).toBeInTheDocument()
    expect(screen.queryByText('Optional field')).not.toBeInTheDocument()
  })

  it('prioritizes success over info message', () => {
    render(
      <FormField label="Email" success="Email is valid" info="Optional field">
        <Input />
      </FormField>
    )
    expect(screen.getByText('Email is valid')).toBeInTheDocument()
    expect(screen.queryByText('Optional field')).not.toBeInTheDocument()
  })

  it('hides description when error is shown', () => {
    render(
      <FormField
        label="Email"
        description="Enter your email"
        error="Email is required"
      >
        <Input />
      </FormField>
    )
    expect(screen.getByText('Email is required')).toBeInTheDocument()
    expect(screen.queryByText('Enter your email')).not.toBeInTheDocument()
  })

  it('renders in vertical orientation by default', () => {
    const { container } = render(
      <FormField label="Email">
        <Input />
      </FormField>
    )
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper).toHaveClass('space-y-2')
    expect(wrapper).not.toHaveClass('flex')
  })

  it('renders in horizontal orientation', () => {
    const { container } = render(
      <FormField label="Email" orientation="horizontal">
        <Input />
      </FormField>
    )
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper).toHaveClass('flex')
    expect(wrapper).toHaveClass('items-start')
  })

  it('applies custom className', () => {
    const { container } = render(
      <FormField className="custom-class" label="Email">
        <Input />
      </FormField>
    )
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper).toHaveClass('custom-class')
  })

  it('forwards ref correctly', () => {
    const ref = React.createRef<HTMLDivElement>()
    render(
      <FormField ref={ref} label="Email">
        <Input />
      </FormField>
    )
    expect(ref.current).toBeInstanceOf(HTMLDivElement)
  })

  it('renders with multiple children', () => {
    render(
      <FormField label="Name">
        <Input placeholder="First name" />
        <Input placeholder="Last name" />
      </FormField>
    )
    expect(screen.getByPlaceholderText('First name')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Last name')).toBeInTheDocument()
  })
})
