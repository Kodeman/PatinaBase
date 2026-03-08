import { render, screen } from '@testing-library/react'
import { axe } from 'vitest-axe'
import { Stack, VStack, HStack } from './Stack'

describe('Stack', () => {
  it('renders children correctly', () => {
    render(
      <Stack>
        <div>Child 1</div>
        <div>Child 2</div>
      </Stack>
    )
    expect(screen.getByText('Child 1')).toBeInTheDocument()
    expect(screen.getByText('Child 2')).toBeInTheDocument()
  })

  it('applies default direction (column)', () => {
    const { container } = render(<Stack>Content</Stack>)
    expect(container.firstChild).toHaveClass('flex-col')
  })

  it('applies row direction', () => {
    const { container } = render(<Stack direction="row">Content</Stack>)
    expect(container.firstChild).toHaveClass('flex-row')
  })

  it('applies spacing', () => {
    const { container } = render(<Stack spacing="lg">Content</Stack>)
    expect(container.firstChild).toHaveClass('gap-6')
  })

  it('applies alignment', () => {
    const { container } = render(<Stack align="center">Content</Stack>)
    expect(container.firstChild).toHaveClass('items-center')
  })

  it('applies justification', () => {
    const { container } = render(<Stack justify="between">Content</Stack>)
    expect(container.firstChild).toHaveClass('justify-between')
  })

  it('forwards ref correctly', () => {
    const ref = { current: null }
    render(<Stack ref={ref}>Content</Stack>)
    expect(ref.current).toBeInstanceOf(HTMLDivElement)
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<Stack>Content</Stack>)
    expect(await axe(container)).toHaveNoViolations()
  })
})

describe('VStack', () => {
  it('renders as vertical stack', () => {
    const { container } = render(<VStack>Content</VStack>)
    expect(container.firstChild).toHaveClass('flex-col')
  })
})

describe('HStack', () => {
  it('renders as horizontal stack', () => {
    const { container } = render(<HStack>Content</HStack>)
    expect(container.firstChild).toHaveClass('flex-row')
  })
})
