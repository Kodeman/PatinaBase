import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'vitest-axe'
import { Breadcrumbs } from './Breadcrumbs'

describe('Breadcrumbs', () => {
  const items = [
    { label: 'Home', href: '/' },
    { label: 'Products', href: '/products' },
    { label: 'Shoes', href: '/products/shoes' },
    { label: 'Nike Air Max', current: true },
  ]

  it('renders breadcrumb items correctly', () => {
    render(<Breadcrumbs items={items} />)
    expect(screen.getByText('Home')).toBeInTheDocument()
    expect(screen.getByText('Products')).toBeInTheDocument()
    expect(screen.getByText('Shoes')).toBeInTheDocument()
    expect(screen.getByText('Nike Air Max')).toBeInTheDocument()
  })

  it('renders default separator', () => {
    const { container } = render(<Breadcrumbs items={items} />)
    const separators = container.querySelectorAll('[aria-hidden="true"]')
    expect(separators).toHaveLength(3) // 4 items = 3 separators
    expect(separators[0]).toHaveTextContent('/')
  })

  it('renders custom separator', () => {
    const { container } = render(<Breadcrumbs items={items} separator=">" />)
    const separators = container.querySelectorAll('[aria-hidden="true"]')
    expect(separators[0]).toHaveTextContent('>')
  })

  it('marks current page with aria-current', () => {
    render(<Breadcrumbs items={items} />)
    const currentItem = screen.getByText('Nike Air Max')
    expect(currentItem).toHaveAttribute('aria-current', 'page')
  })

  it('renders links for non-current items', () => {
    render(<Breadcrumbs items={items} />)
    const homeLink = screen.getByRole('link', { name: 'Home' })
    expect(homeLink).toHaveAttribute('href', '/')
  })

  it('calls onItemClick when link is clicked', async () => {
    const onItemClick = vi.fn()
    const user = userEvent.setup()

    render(<Breadcrumbs items={items} onItemClick={onItemClick} />)
    await user.click(screen.getByRole('link', { name: 'Home' }))

    expect(onItemClick).toHaveBeenCalledWith(items[0], 0)
  })

  it('supports icons in items', () => {
    const itemsWithIcons = [
      { label: 'Home', href: '/', icon: <span data-testid="home-icon">🏠</span> },
      { label: 'Products', current: true },
    ]

    render(<Breadcrumbs items={itemsWithIcons} />)
    expect(screen.getByTestId('home-icon')).toBeInTheDocument()
  })

  it('collapses items when maxItems is exceeded', () => {
    const manyItems = [
      { label: 'Home', href: '/' },
      { label: 'Category', href: '/category' },
      { label: 'Subcategory', href: '/category/sub' },
      { label: 'Product Type', href: '/category/sub/type' },
      { label: 'Product', current: true },
    ]

    render(
      <Breadcrumbs
        items={manyItems}
        maxItems={3}
        itemsBeforeCollapse={1}
        itemsAfterCollapse={1}
      />
    )

    expect(screen.getByText('Home')).toBeInTheDocument()
    expect(screen.getByText('...')).toBeInTheDocument()
    expect(screen.getByText('Product')).toBeInTheDocument()
    expect(screen.queryByText('Category')).not.toBeInTheDocument()
    expect(screen.queryByText('Subcategory')).not.toBeInTheDocument()
  })

  it('does not collapse when items are within maxItems', () => {
    render(<Breadcrumbs items={items} maxItems={10} />)
    expect(screen.queryByText('...')).not.toBeInTheDocument()
  })

  it('renders only current item when no href is provided', () => {
    const itemsWithoutHref = [
      { label: 'Home', href: '/' },
      { label: 'Current Page' },
    ]

    render(<Breadcrumbs items={itemsWithoutHref} />)
    const currentItem = screen.getByText('Current Page')
    expect(currentItem.tagName).toBe('SPAN')
  })

  it('applies custom className', () => {
    const { container } = render(
      <Breadcrumbs items={items} className="custom-class" />
    )
    expect(container.querySelector('nav')).toHaveClass('custom-class')
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<Breadcrumbs items={items} />)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('has correct aria-label', () => {
    render(<Breadcrumbs items={items} />)
    expect(screen.getByLabelText('Breadcrumb')).toBeInTheDocument()
  })
})
