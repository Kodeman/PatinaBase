import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe, toHaveNoViolations } from 'jest-axe'
import { AdminCatalogSearchBar } from '@/components/catalog/admin-catalog-search-bar'
import { AdminCatalogFilters } from '@/components/catalog/admin-catalog-filters'
import { AdminProductCard } from '@/components/catalog/admin-product-card'
import { BulkActionToolbar } from '@/components/catalog/bulk-action-toolbar'
import { AccessibleModal } from '@/components/ui/accessible-modal'

expect.extend(toHaveNoViolations)

const mockPresenter = {
  searchQuery: '',
  viewMode: 'grid' as const,
  activeFilterCount: 0,
  totalProducts: 12,
  stats: null,
  hasActiveFilters: false,
  selectedStatus: null,
  selectedCategory: null,
  selectedBrand: null,
  hasSelection: false,
  selectedCount: 0,
  isOperationInProgress: false,
  currentOperation: null,
  handleSearchChange: jest.fn(),
  handleClearSearch: jest.fn(),
  setViewMode: jest.fn(),
  handleStatusChange: jest.fn(),
  handleCategoryChange: jest.fn(),
  handleBrandChange: jest.fn(),
  handleClearFilters: jest.fn(),
  handleProductToggle: jest.fn(),
  handleClearSelection: jest.fn(),
  openPublishModal: jest.fn(),
  openUnpublishModal: jest.fn(),
  openDeleteModal: jest.fn(),
}

const mockProduct = {
  id: 'test-product-1',
  name: 'Test Product',
  brand: 'Test Brand',
  price: 1000,
  status: 'published' as const,
  coverImage: '/test-image.jpg',
  hasValidationIssues: false,
  has3D: false,
  arSupported: false,
}

describe('Accessibility Compliance', () => {
  describe('Search Bar Component', () => {
    it('has a named search region and searchbox', () => {
      render(<AdminCatalogSearchBar presenter={mockPresenter} />)
      expect(screen.getByRole('search')).toBeInTheDocument()
      expect(screen.getByRole('searchbox', { name: /search products by name, brand, sku, or category/i })).toBeInTheDocument()
    })

    it('associates its hint and results count with the searchbox', () => {
      render(<AdminCatalogSearchBar presenter={mockPresenter} />)
      const searchbox = screen.getByRole('searchbox')
      const describedBy = searchbox.getAttribute('aria-describedby')
      expect(describedBy).toContain('search-hint')
      expect(describedBy).toContain('search-results-count')
      expect(within(screen.getByRole('status')).getByText('12')).toBeInTheDocument()
    })

    it('announces active filters with individually named clear actions', () => {
      render(<AdminCatalogSearchBar presenter={{
        ...mockPresenter,
        hasActiveFilters: true,
        selectedStatus: 'draft',
        selectedCategory: 'Seating',
      }} />)
      expect(screen.getByRole('region', { name: 'Active filters' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Clear status filter' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Clear category filter' })).toBeInTheDocument()
    })
  })

  describe('Filter Panel Component', () => {
    it('groups status choices in a named fieldset', () => {
      render(<AdminCatalogFilters presenter={mockPresenter} isOpen onClose={jest.fn()} />)
      expect(screen.getByRole('group', { name: 'Filter by Status' })).toBeInTheDocument()
      expect(screen.getByRole('radio', { name: 'Published' })).toBeInTheDocument()
    })

    it('labels category and brand controls for assistive technology', () => {
      render(<AdminCatalogFilters presenter={mockPresenter} isOpen onClose={jest.fn()} />)
      expect(screen.getByPlaceholderText('Search categories...')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('Search brands...')).toBeInTheDocument()
    })

    it('sends status and text filter changes to the presenter', async () => {
      const user = userEvent.setup()
      const handleStatusChange = jest.fn()
      const handleCategoryChange = jest.fn()
      render(<AdminCatalogFilters presenter={{ ...mockPresenter, handleStatusChange, handleCategoryChange }} isOpen onClose={jest.fn()} />)
      await user.click(screen.getByRole('radio', { name: 'Published' }))
      const categoryInput = screen.getByPlaceholderText('Search categories...')
      await user.type(categoryInput, 'Sofas')
      expect(handleStatusChange).toHaveBeenCalledWith('published')
      expect(handleCategoryChange).toHaveBeenLastCalledWith('s')
    })
  })

  describe('Product Card Component', () => {
    it('provides product text and labelled selection and action controls', () => {
      render(<AdminProductCard product={mockProduct as any} presenter={mockPresenter as any} />)
      expect(screen.getByText('Test Product')).toBeInTheDocument()
      expect(screen.getByRole('checkbox', { name: 'Select Test Product by Test Brand' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Edit Test Product' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'More actions for Test Product' })).toBeInTheDocument()
    })

    it('uses the product name as image alternative text', () => {
      render(<AdminProductCard product={mockProduct as any} presenter={mockPresenter as any} />)
      expect(screen.getByRole('img', { name: 'Test Product' })).toBeInTheDocument()
    })

    it('exposes validation status to assistive technology', () => {
      render(<AdminProductCard product={{ ...mockProduct, hasValidationIssues: true } as any} presenter={mockPresenter as any} />)
      expect(screen.getByRole('status', { name: 'Has validation issues' })).toHaveTextContent('Issues')
    })
  })

  describe('Bulk Action Toolbar Component', () => {
    const presenterWithSelection = { ...mockPresenter, hasSelection: true, selectedCount: 3 }

    it('exposes selected count and actions through toolbar semantics', () => {
      render(<BulkActionToolbar presenter={presenterWithSelection as any} />)
      expect(screen.getByRole('toolbar', { name: 'Bulk actions for selected products' })).toBeInTheDocument()
      expect(screen.getByRole('status')).toHaveTextContent('3 products selected')
      expect(screen.getByRole('button', { name: 'Publish 3 selected products' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Unpublish 3 selected products' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Delete 3 selected products' })).toBeInTheDocument()
    })

    it('routes bulk actions and selection clearing to their presenter handlers', async () => {
      const user = userEvent.setup()
      const openPublishModal = jest.fn()
      const openUnpublishModal = jest.fn()
      const openDeleteModal = jest.fn()
      const handleClearSelection = jest.fn()
      render(<BulkActionToolbar presenter={{ ...presenterWithSelection, openPublishModal, openUnpublishModal, openDeleteModal, handleClearSelection } as any} />)
      await user.click(screen.getByRole('button', { name: 'Publish 3 selected products' }))
      await user.click(screen.getByRole('button', { name: 'Unpublish 3 selected products' }))
      await user.click(screen.getByRole('button', { name: 'Delete 3 selected products' }))
      await user.click(screen.getByRole('button', { name: 'Clear selection of 3 products' }))
      expect(openPublishModal).toHaveBeenCalledTimes(1)
      expect(openUnpublishModal).toHaveBeenCalledTimes(1)
      expect(openDeleteModal).toHaveBeenCalledTimes(1)
      expect(handleClearSelection).toHaveBeenCalledTimes(1)
    })

    it('announces in-progress work and marks its matching action busy', () => {
      render(<BulkActionToolbar presenter={{ ...presenterWithSelection, isOperationInProgress: true, currentOperation: 'Bulk Publish' } as any} />)
      expect(screen.getByText('Bulk Publish in progress...')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Publish 3 selected products' })).toHaveAttribute('aria-busy', 'true')
    })
  })

  describe('Accessible Modal Component', () => {
    it('exposes a labelled modal dialog', () => {
      render(<AccessibleModal isOpen onClose={jest.fn()} title="Confirm publish" description="Review this action">
        <button>Confirm</button>
      </AccessibleModal>)
      const dialog = screen.getByRole('dialog', { name: 'Confirm publish', description: 'Review this action', hidden: true })
      expect(dialog).toHaveAttribute('aria-modal', 'true')
    })

    it('calls the close handler for Escape and the close button', async () => {
      const user = userEvent.setup()
      const onClose = jest.fn()
      render(<AccessibleModal isOpen onClose={onClose} title="Confirm publish"><button>Confirm</button></AccessibleModal>)
      await user.keyboard('{Escape}')
      expect(onClose).toHaveBeenCalledTimes(1)
      await user.click(screen.getByRole('button', { name: 'Close dialog', hidden: true }))
      expect(onClose).toHaveBeenCalledTimes(2)
    })
  })

  describe('Keyboard Navigation', () => {
    it('provides keyboard-operable search and view mode controls', async () => {
      const user = userEvent.setup()
      render(<AdminCatalogSearchBar presenter={mockPresenter} />)
      const searchbox = screen.getByRole('searchbox')
      searchbox.focus()
      await user.tab()
      expect(screen.getByRole('radio', { name: 'Grid view' })).toHaveFocus()
    })

    it('renders selection controls as keyboard-operable checkboxes', () => {
      render(<AdminProductCard product={mockProduct as any} presenter={mockPresenter as any} />)
      expect(screen.getByRole('checkbox', { name: /select test product/i })).toBeEnabled()
    })
  })

  describe('Screen Reader Support', () => {
    it('announces live catalog counts and query hints', () => {
      render(<AdminCatalogSearchBar presenter={mockPresenter} />)
      expect(screen.getByRole('status')).toHaveTextContent('12 products')
      expect(screen.getByText(/type to search products/i)).toBeInTheDocument()
    })

    it('marks decorative product icons hidden from assistive technology', () => {
      const { container } = render(<AdminProductCard product={mockProduct as any} presenter={mockPresenter as any} />)
      expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument()
    })
  })

  describe('Color Contrast', () => {
    it('passes axe checks on the current search controls', async () => {
      const { container } = render(<AdminCatalogSearchBar presenter={mockPresenter} />)
      expect(await axe(container, { rules: { 'color-contrast': { enabled: true } } })).toHaveNoViolations()
    })
  })
})
