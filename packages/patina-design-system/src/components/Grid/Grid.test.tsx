import { render, screen } from '@testing-library/react'
import { axe } from 'vitest-axe'
import { Grid } from './Grid'

describe('Grid', () => {
  it('renders children correctly', () => {
    render(
      <Grid>
        <div>Item 1</div>
        <div>Item 2</div>
      </Grid>
    )
    expect(screen.getByText('Item 1')).toBeInTheDocument()
    expect(screen.getByText('Item 2')).toBeInTheDocument()
  })

  it('renders as div by default', () => {
    const { container } = render(<Grid>Content</Grid>)
    expect(container.firstChild?.nodeName).toBe('DIV')
  })

  it('renders as different element when "as" prop is provided', () => {
    const { container } = render(<Grid as="section">Content</Grid>)
    expect(container.firstChild?.nodeName).toBe('SECTION')
  })

  it('applies grid display', () => {
    const { container } = render(<Grid>Content</Grid>)
    expect(container.firstChild).toHaveClass('grid')
  })

  it('applies column classes correctly', () => {
    const { container } = render(<Grid columns={3}>Content</Grid>)
    expect(container.firstChild).toHaveClass('grid-cols-3')
  })

  it('applies row classes correctly', () => {
    const { container } = render(<Grid rows={2}>Content</Grid>)
    expect(container.firstChild).toHaveClass('grid-rows-2')
  })

  it('applies gap classes correctly', () => {
    const { container } = render(<Grid gap="lg">Content</Grid>)
    expect(container.firstChild).toHaveClass('gap-6')
  })

  it('applies default gap when not specified', () => {
    const { container } = render(<Grid>Content</Grid>)
    expect(container.firstChild).toHaveClass('gap-4')
  })

  it('applies flow classes correctly', () => {
    const { container } = render(<Grid flow="col">Content</Grid>)
    expect(container.firstChild).toHaveClass('grid-flow-col')
  })

  it('applies custom className', () => {
    const { container } = render(<Grid className="custom-class">Content</Grid>)
    expect(container.firstChild).toHaveClass('custom-class')
    expect(container.firstChild).toHaveClass('grid')
  })

  it('forwards ref correctly', () => {
    const ref = { current: null }
    render(<Grid ref={ref}>Content</Grid>)
    expect(ref.current).toBeInstanceOf(HTMLDivElement)
  })

  it('supports HTML attributes', () => {
    render(
      <Grid data-testid="test-grid" aria-label="Test grid">
        Content
      </Grid>
    )
    const grid = screen.getByTestId('test-grid')
    expect(grid).toHaveAttribute('aria-label', 'Test grid')
  })

  it('applies custom templateColumns style', () => {
    const { container } = render(
      <Grid templateColumns="1fr 2fr 1fr">Content</Grid>
    )
    const element = container.firstChild as HTMLElement
    expect(element.style.gridTemplateColumns).toBe('1fr 2fr 1fr')
  })

  it('applies custom templateRows style', () => {
    const { container } = render(<Grid templateRows="100px 1fr auto">Content</Grid>)
    const element = container.firstChild as HTMLElement
    expect(element.style.gridTemplateRows).toBe('100px 1fr auto')
  })

  it('applies custom templateAreas style', () => {
    const areas = '"header header" "sidebar main" "footer footer"'
    const { container } = render(<Grid templateAreas={areas}>Content</Grid>)
    const element = container.firstChild as HTMLElement
    expect(element.style.gridTemplateAreas).toBe(areas)
  })

  it('applies auto-fit with minChildWidth', () => {
    const { container } = render(
      <Grid autoFit minChildWidth="250px">
        Content
      </Grid>
    )
    const element = container.firstChild as HTMLElement
    expect(element.style.gridTemplateColumns).toBe(
      'repeat(auto-fit, minmax(250px, 1fr))'
    )
  })

  it('applies auto-fill with minChildWidth', () => {
    const { container } = render(
      <Grid autoFill minChildWidth="200px">
        Content
      </Grid>
    )
    const element = container.firstChild as HTMLElement
    expect(element.style.gridTemplateColumns).toBe(
      'repeat(auto-fill, minmax(200px, 1fr))'
    )
  })

  it('combines variants correctly', () => {
    const { container } = render(
      <Grid columns={4} gap="xl" flow="row">
        Content
      </Grid>
    )
    expect(container.firstChild).toHaveClass('grid')
    expect(container.firstChild).toHaveClass('grid-cols-4')
    expect(container.firstChild).toHaveClass('gap-8')
    expect(container.firstChild).toHaveClass('grid-flow-row')
  })

  it('merges custom styles with component styles', () => {
    const { container } = render(
      <Grid templateColumns="1fr 2fr" style={{ backgroundColor: 'red' }}>
        Content
      </Grid>
    )
    const element = container.firstChild as HTMLElement
    expect(element.style.gridTemplateColumns).toBe('1fr 2fr')
    expect(element.style.backgroundColor).toBe('red')
  })

  it('has no accessibility violations', async () => {
    const { container } = render(
      <Grid columns={3} gap="md">
        <div>Item 1</div>
        <div>Item 2</div>
        <div>Item 3</div>
      </Grid>
    )
    expect(await axe(container)).toHaveNoViolations()
  })

  it('supports all column values', () => {
    const columns = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const
    columns.forEach((col) => {
      const { container } = render(<Grid columns={col}>Content</Grid>)
      expect(container.firstChild).toHaveClass(`grid-cols-${col}`)
    })
  })

  it('supports all gap values', () => {
    const gaps = ['none', 'xs', 'sm', 'md', 'lg', 'xl', '2xl'] as const
    const gapClasses = {
      none: 'gap-0',
      xs: 'gap-1',
      sm: 'gap-2',
      md: 'gap-4',
      lg: 'gap-6',
      xl: 'gap-8',
      '2xl': 'gap-12',
    }

    gaps.forEach((gap) => {
      const { container } = render(<Grid gap={gap}>Content</Grid>)
      expect(container.firstChild).toHaveClass(gapClasses[gap])
    })
  })
})
