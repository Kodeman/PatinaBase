import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'vitest-axe'
import React from 'react'
import { Code } from './Code'

describe('Code', () => {
  it('renders children correctly', () => {
    render(<Code>const x = 5;</Code>)
    expect(screen.getByText('const x = 5;')).toBeInTheDocument()
  })

  it('renders inline variant by default', () => {
    const { container } = render(<Code>inline code</Code>)
    const code = container.querySelector('code')
    expect(code).toBeInTheDocument()
    expect(code).toHaveClass('rounded')
  })

  it('renders block variant', () => {
    const { container } = render(<Code variant="block">block code</Code>)
    const pre = container.querySelector('pre')
    expect(pre).toBeInTheDocument()
    expect(pre).toHaveClass('block')
  })

  it('applies color scheme styles', () => {
    const { container } = render(
      <Code colorScheme="primary">primary code</Code>
    )
    const code = container.querySelector('code')
    expect(code).toHaveClass('bg-primary/10', 'text-primary')
  })

  it('applies success color scheme', () => {
    const { container } = render(
      <Code colorScheme="success">success code</Code>
    )
    const code = container.querySelector('code')
    expect(code).toHaveClass('bg-green-500/10')
  })

  it('applies warning color scheme', () => {
    const { container } = render(
      <Code colorScheme="warning">warning code</Code>
    )
    const code = container.querySelector('code')
    expect(code).toHaveClass('bg-yellow-500/10')
  })

  it('applies error color scheme', () => {
    const { container } = render(
      <Code colorScheme="error">error code</Code>
    )
    const code = container.querySelector('code')
    expect(code).toHaveClass('bg-red-500/10')
  })

  it('shows copy button when showCopy is true', () => {
    render(
      <Code variant="block" showCopy>
        copyable code
      </Code>
    )
    expect(screen.getByRole('button', { name: /copy code/i })).toBeInTheDocument()
  })

  it('does not show copy button for inline variant', () => {
    render(
      <Code variant="inline" showCopy>
        inline code
      </Code>
    )
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('copies code to clipboard when copy button is clicked', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      writable: true,
      configurable: true,
    })

    render(
      <Code variant="block" showCopy>
        code to copy
      </Code>
    )

    const copyButton = screen.getByRole('button', { name: /copy code/i })
    await user.click(copyButton)

    expect(writeText).toHaveBeenCalledWith('code to copy')
  })

  it('shows "Copied!" message after copying', async () => {
    const user = userEvent.setup()
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    })

    render(
      <Code variant="block" showCopy>
        code to copy
      </Code>
    )

    const copyButton = screen.getByRole('button', { name: /copy code/i })
    await user.click(copyButton)

    await waitFor(() => {
      expect(screen.getByText('Copied!')).toBeInTheDocument()
    })
  })

  it('calls onCopy callback when code is copied', async () => {
    const user = userEvent.setup()
    const onCopy = vi.fn()
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    })

    render(
      <Code variant="block" showCopy onCopy={onCopy}>
        code to copy
      </Code>
    )

    const copyButton = screen.getByRole('button', { name: /copy code/i })
    await user.click(copyButton)

    await waitFor(() => {
      expect(onCopy).toHaveBeenCalled()
    })
  })

  it('sets language data attribute', () => {
    const { container } = render(
      <Code variant="block" language="javascript">
        const x = 5;
      </Code>
    )
    const pre = container.querySelector('pre')
    expect(pre).toHaveAttribute('data-language', 'javascript')
  })

  it('forwards ref correctly for inline variant', () => {
    const ref = React.createRef<HTMLElement>()
    render(<Code ref={ref}>inline code</Code>)
    expect(ref.current).toBeInstanceOf(HTMLElement)
    expect(ref.current?.tagName).toBe('CODE')
  })

  it('forwards ref correctly for block variant', () => {
    const ref = React.createRef<HTMLElement>()
    render(
      <Code ref={ref} variant="block">
        block code
      </Code>
    )
    expect(ref.current).toBeInstanceOf(HTMLPreElement)
  })

  it('applies custom className', () => {
    const { container } = render(
      <Code className="custom-class">code</Code>
    )
    const code = container.querySelector('code')
    expect(code).toHaveClass('custom-class')
  })

  it('has no accessibility violations for inline variant', async () => {
    const { container } = render(<Code>inline code</Code>)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no accessibility violations for block variant', async () => {
    const { container } = render(
      <Code variant="block">block code</Code>
    )
    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no accessibility violations with copy button', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    })
    const { container } = render(
      <Code variant="block" showCopy>
        code
      </Code>
    )
    expect(await axe(container)).toHaveNoViolations()
  })

  it('renders all color schemes correctly', () => {
    const schemes = ['default', 'primary', 'secondary', 'success', 'warning', 'error'] as const
    schemes.forEach((scheme) => {
      const { container } = render(
        <Code colorScheme={scheme}>{scheme} code</Code>
      )
      const code = container.querySelector('code')
      expect(code).toBeInTheDocument()
    })
  })

  it('wraps block code in pre and code elements', () => {
    const { container } = render(
      <Code variant="block">const x = 5;</Code>
    )
    const pre = container.querySelector('pre')
    const code = container.querySelector('code')
    expect(pre).toBeInTheDocument()
    expect(code).toBeInTheDocument()
    expect(pre?.contains(code!)).toBe(true)
  })

  it('hides copy button initially and shows on hover', () => {
    const { container } = render(
      <Code variant="block" showCopy>
        code
      </Code>
    )
    const button = container.querySelector('button')
    expect(button).toHaveClass('opacity-0', 'group-hover:opacity-100')
  })

  it('handles multiline code in block variant', () => {
    const multilineCode = `function hello() {
  console.log("Hello");
}`
    const { container } = render(<Code variant="block">{multilineCode}</Code>)
    const code = container.querySelector('code')
    expect(code?.textContent).toBe(multilineCode)
  })
})
