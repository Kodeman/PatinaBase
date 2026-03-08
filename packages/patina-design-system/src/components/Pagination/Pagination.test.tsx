import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'vitest-axe'
import { Pagination } from './Pagination'

describe('Pagination', () => {
  it('renders pagination correctly', () => {
    render(
      <Pagination total={100} currentPage={5} pageSize={10} onPageChange={() => {}} />
    )
    expect(screen.getByLabelText('Pagination')).toBeInTheDocument()
  })

  it('shows correct page numbers', () => {
    render(
      <Pagination total={50} currentPage={3} pageSize={10} onPageChange={() => {}} />
    )
    expect(screen.getByLabelText('Page 1')).toBeInTheDocument()
    expect(screen.getByLabelText('Page 2')).toBeInTheDocument()
    expect(screen.getByLabelText('Page 3')).toBeInTheDocument()
    expect(screen.getByLabelText('Page 4')).toBeInTheDocument()
    expect(screen.getByLabelText('Page 5')).toBeInTheDocument()
  })

  it('marks current page correctly', () => {
    render(
      <Pagination total={50} currentPage={3} pageSize={10} onPageChange={() => {}} />
    )
    const currentPage = screen.getByLabelText('Page 3')
    expect(currentPage).toHaveAttribute('aria-current', 'page')
    expect(currentPage).toHaveAttribute('data-active', 'true')
  })

  it('calls onPageChange when page is clicked', async () => {
    const onPageChange = vi.fn()
    const user = userEvent.setup()

    render(
      <Pagination total={50} currentPage={1} pageSize={10} onPageChange={onPageChange} />
    )

    await user.click(screen.getByLabelText('Page 3'))
    expect(onPageChange).toHaveBeenCalledWith(3)
  })

  it('navigates to previous page', async () => {
    const onPageChange = vi.fn()
    const user = userEvent.setup()

    render(
      <Pagination total={50} currentPage={3} pageSize={10} onPageChange={onPageChange} />
    )

    await user.click(screen.getByLabelText('Previous page'))
    expect(onPageChange).toHaveBeenCalledWith(2)
  })

  it('navigates to next page', async () => {
    const onPageChange = vi.fn()
    const user = userEvent.setup()

    render(
      <Pagination total={50} currentPage={3} pageSize={10} onPageChange={onPageChange} />
    )

    await user.click(screen.getByLabelText('Next page'))
    expect(onPageChange).toHaveBeenCalledWith(4)
  })

  it('navigates to first page', async () => {
    const onPageChange = vi.fn()
    const user = userEvent.setup()

    render(
      <Pagination total={100} currentPage={5} pageSize={10} onPageChange={onPageChange} />
    )

    await user.click(screen.getByLabelText('First page'))
    expect(onPageChange).toHaveBeenCalledWith(1)
  })

  it('navigates to last page', async () => {
    const onPageChange = vi.fn()
    const user = userEvent.setup()

    render(
      <Pagination total={100} currentPage={5} pageSize={10} onPageChange={onPageChange} />
    )

    await user.click(screen.getByLabelText('Last page'))
    expect(onPageChange).toHaveBeenCalledWith(10)
  })

  it('disables previous button on first page', () => {
    render(
      <Pagination total={50} currentPage={1} pageSize={10} onPageChange={() => {}} />
    )
    expect(screen.getByLabelText('Previous page')).toBeDisabled()
    expect(screen.getByLabelText('First page')).toBeDisabled()
  })

  it('disables next button on last page', () => {
    render(
      <Pagination total={50} currentPage={5} pageSize={10} onPageChange={() => {}} />
    )
    expect(screen.getByLabelText('Next page')).toBeDisabled()
    expect(screen.getByLabelText('Last page')).toBeDisabled()
  })

  it('shows ellipsis for many pages', () => {
    render(
      <Pagination total={100} currentPage={5} pageSize={10} onPageChange={() => {}} />
    )
    const ellipses = screen.getAllByText('...')
    expect(ellipses.length).toBeGreaterThan(0)
  })

  it('renders compact variant', () => {
    render(
      <Pagination
        total={100}
        currentPage={5}
        pageSize={10}
        compact
        onPageChange={() => {}}
      />
    )
    expect(screen.getByText(/Page 5 of 10/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Page 1')).not.toBeInTheDocument()
  })

  it('hides first/last buttons when showFirstLast is false', () => {
    render(
      <Pagination
        total={100}
        currentPage={5}
        pageSize={10}
        showFirstLast={false}
        onPageChange={() => {}}
      />
    )
    expect(screen.queryByLabelText('First page')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Last page')).not.toBeInTheDocument()
  })

  it('supports custom siblings count', () => {
    const { rerender } = render(
      <Pagination
        total={100}
        currentPage={5}
        pageSize={10}
        siblings={1}
        onPageChange={() => {}}
      />
    )

    const withOneSibling = screen.getAllByRole('button').length

    rerender(
      <Pagination
        total={100}
        currentPage={5}
        pageSize={10}
        siblings={2}
        onPageChange={() => {}}
      />
    )

    const withTwoSiblings = screen.getAllByRole('button').length

    expect(withTwoSiblings).toBeGreaterThan(withOneSibling)
  })

  it('applies size variants', () => {
    const { container } = render(
      <Pagination total={50} currentPage={1} pageSize={10} size="lg" onPageChange={() => {}} />
    )
    expect(container.querySelector('button')).toHaveClass('h-11')
  })

  it('applies variant styles', () => {
    const { container } = render(
      <Pagination
        total={50}
        currentPage={1}
        pageSize={10}
        variant="outline"
        onPageChange={() => {}}
      />
    )
    expect(container.querySelector('button')).toHaveClass('border')
  })

  it('has no accessibility violations', async () => {
    const { container } = render(
      <Pagination total={100} currentPage={5} pageSize={10} onPageChange={() => {}} />
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
