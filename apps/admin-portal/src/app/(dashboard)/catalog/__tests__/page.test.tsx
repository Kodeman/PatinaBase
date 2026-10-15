import { render, screen, within } from '@/test-utils/render'
import userEvent from '@testing-library/user-event'
import {
  createMockProducts,
  createMockCatalogStats,
} from '@/test-utils'
import CatalogPage from '../page'
import { BulkActionDialogs } from '@/components/catalog/bulk-action-dialogs'

jest.mock('@/features/catalog/hooks/useAdminCatalogPresenter')

const mockUseAdminCatalogPresenter = require('@/features/catalog/hooks/useAdminCatalogPresenter').useAdminCatalogPresenter

const defaultPresenterState = {
  products: createMockProducts(3),
  isLoadingProducts: false,
  totalProducts: 100,
  totalPages: 5,
  currentPage: 1,
  pageSize: 20,
  hasNextPage: true,
  hasPreviousPage: false,
  searchQuery: '',
  selectedStatus: null,
  selectedCategory: null,
  selectedBrand: null,
  hasActiveFilters: false,
  activeFilterCount: 0,
  selectedIds: [],
  selectedCount: 0,
  hasSelection: false,
  stats: { ...createMockCatalogStats(), byStatus: { published: 120, draft: 30 }, withValidationIssues: 5 },
  isPublishModalOpen: false,
  isUnpublishModalOpen: false,
  isDeleteModalOpen: false,
  viewMode: 'grid',
  sortBy: 'createdAt',
  sortOrder: 'desc',
  isPublishing: false,
  isUnpublishing: false,
  isDeleting: false,
  isOperationInProgress: false,
  currentOperation: null,
  isEmpty: false,
  isEmptyState: false,
  isNoResults: false,
  handleSearchChange: jest.fn(),
  handleClearSearch: jest.fn(),
  handleStatusChange: jest.fn(),
  handleCategoryChange: jest.fn(),
  handleBrandChange: jest.fn(),
  handleClearFilters: jest.fn(),
  handlePageChange: jest.fn(),
  handlePageSizeChange: jest.fn(),
  handleProductToggle: jest.fn(),
  handleSelectAllOnPage: jest.fn(),
  handleClearSelection: jest.fn(),
  handleBulkPublish: jest.fn(),
  handleBulkUnpublish: jest.fn(),
  handleBulkDelete: jest.fn(),
  openPublishModal: jest.fn(),
  closePublishModal: jest.fn(),
  openUnpublishModal: jest.fn(),
  closeUnpublishModal: jest.fn(),
  openDeleteModal: jest.fn(),
  closeDeleteModal: jest.fn(),
  setViewMode: jest.fn(),
  handleSortChange: jest.fn(),
  refreshData: jest.fn(),
  refreshStats: jest.fn(),
}

describe('Catalog Page', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUseAdminCatalogPresenter.mockReturnValue(defaultPresenterState)
  })

  describe('Page rendering', () => {
    it('renders the catalog heading and current product collection', () => {
      render(<CatalogPage />)
      expect(screen.getByRole('heading', { name: 'Catalog' })).toBeInTheDocument()
      for (const product of defaultPresenterState.products) {
        expect(screen.getByText(product.name)).toBeInTheDocument()
      }
    })

    it('offers product creation and CSV import actions', () => {
      render(<CatalogPage />)
      expect(screen.getByRole('button', { name: 'Create Product' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Import CSV' })).toBeInTheDocument()
    })

    it('renders a loading indicator while the presenter has no products yet', () => {
      mockUseAdminCatalogPresenter.mockReturnValue({ ...defaultPresenterState, products: [], isLoadingProducts: true })
      render(<CatalogPage />)
      for (const product of defaultPresenterState.products) expect(screen.queryByText(product.name)).not.toBeInTheDocument()
      expect(screen.queryByText('No products yet')).not.toBeInTheDocument()
    })

    it('renders the empty catalog state with create and import options', () => {
      mockUseAdminCatalogPresenter.mockReturnValue({ ...defaultPresenterState, products: [], isEmptyState: true, totalProducts: 0 })
      render(<CatalogPage />)
      expect(screen.getByRole('heading', { name: 'No products yet' })).toBeInTheDocument()
      expect(screen.getAllByRole('button', { name: 'Create Product' })).toHaveLength(2)
      expect(screen.getByRole('button', { name: 'Import Products' })).toBeInTheDocument()
    })

    it('renders a no-results state and routes clear actions to the presenter', async () => {
      const user = userEvent.setup()
      const handleClearSearch = jest.fn()
      const handleClearFilters = jest.fn()
      mockUseAdminCatalogPresenter.mockReturnValue({
        ...defaultPresenterState,
        products: [], isNoResults: true, hasActiveFilters: true,
        searchQuery: 'unmatched', activeFilterCount: 1,
        handleClearSearch, handleClearFilters,
      })
      render(<CatalogPage />)
      expect(screen.getByRole('heading', { name: 'No products found' })).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Clear search' }))
      await user.click(screen.getByRole('button', { name: 'Clear filters' }))
      expect(handleClearSearch).toHaveBeenCalledTimes(1)
      expect(handleClearFilters).toHaveBeenCalledTimes(1)
    })
  })

  describe('Statistics dashboard', () => {
    it('announces total, published, draft, and needs-attention counts', () => {
      render(<CatalogPage />)
      const results = screen.getAllByRole('status').find((status) => status.textContent?.includes('100 products'))
      expect(results).toBeDefined()
      expect(results).toHaveTextContent('100 products')
      expect(results).toHaveTextContent('120 published')
      expect(results).toHaveTextContent('30 drafts')
      expect(results).toHaveTextContent('5 need attention')
    })
  })

  describe('Search functionality', () => {
    it('passes the edited search query to the presenter', async () => {
      const user = userEvent.setup()
      const handleSearchChange = jest.fn()
      mockUseAdminCatalogPresenter.mockReturnValue({ ...defaultPresenterState, handleSearchChange })
      render(<CatalogPage />)
      await user.type(screen.getByRole('searchbox', { name: /search products/i }), 'modern')
      expect(handleSearchChange).toHaveBeenLastCalledWith('n')
    })

    it('clears a populated search query through its named action', async () => {
      const user = userEvent.setup()
      const handleClearSearch = jest.fn()
      mockUseAdminCatalogPresenter.mockReturnValue({ ...defaultPresenterState, searchQuery: 'sofa', handleClearSearch })
      render(<CatalogPage />)
      await user.click(screen.getByRole('button', { name: /clear search query: sofa/i }))
      expect(handleClearSearch).toHaveBeenCalledTimes(1)
    })

    it('clears active search and status filters from the filter chips', async () => {
      const user = userEvent.setup()
      const handleClearSearch = jest.fn()
      const handleStatusChange = jest.fn()
      mockUseAdminCatalogPresenter.mockReturnValue({
        ...defaultPresenterState, hasActiveFilters: true, searchQuery: 'sofa', selectedStatus: 'draft',
        handleClearSearch, handleStatusChange,
      })
      render(<CatalogPage />)
      await user.click(screen.getByRole('button', { name: 'Clear search filter' }))
      await user.click(screen.getByRole('button', { name: 'Clear status filter' }))
      expect(handleClearSearch).toHaveBeenCalledTimes(1)
      expect(handleStatusChange).toHaveBeenCalledWith(null)
    })
  })

  describe('Filter controls', () => {
    it('opens the labelled filter panel from the page action', async () => {
      const user = userEvent.setup()
      render(<CatalogPage />)
      await user.click(screen.getByRole('button', { name: 'Filters' }))
      expect(screen.getByRole('dialog', { name: 'Product Filters' })).toBeInTheDocument()
      expect(screen.getByRole('radio', { name: 'Published' })).toBeInTheDocument()
      expect(screen.getByPlaceholderText('Search categories...')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('Search brands...')).toBeInTheDocument()
    })

    it('routes status, category, and brand changes and clear-all to presenter handlers', async () => {
      const user = userEvent.setup()
      const handleStatusChange = jest.fn()
      const handleCategoryChange = jest.fn()
      const handleBrandChange = jest.fn()
      const handleClearFilters = jest.fn()
      mockUseAdminCatalogPresenter.mockReturnValue({
        ...defaultPresenterState, selectedCategory: 'Seating', selectedBrand: 'North House', hasActiveFilters: true,
        handleStatusChange, handleCategoryChange, handleBrandChange, handleClearFilters,
      })
      render(<CatalogPage />)
      await user.click(screen.getByRole('button', { name: /filters/i }))
      await user.click(screen.getByRole('radio', { name: 'Published' }))
      await user.type(screen.getByPlaceholderText('Search categories...'), 'Sofas')
      await user.type(screen.getByPlaceholderText('Search brands...'), 'Studio')
      expect(handleStatusChange).toHaveBeenCalledWith('published')
      expect(handleCategoryChange).toHaveBeenLastCalledWith('Seatings')
      expect(handleBrandChange).toHaveBeenLastCalledWith('North Houseo')
      await user.click(screen.getByRole('button', { name: 'Clear All' }))
      expect(handleClearFilters).toHaveBeenCalledTimes(1)
    })
  })

  describe('Product grid/list display', () => {
    it('renders each product name and its accessible selection checkbox in grid mode', () => {
      render(<CatalogPage />)
      const product = defaultPresenterState.products[0]
      expect(screen.getByText(product.name)).toBeInTheDocument()
      expect(screen.getByRole('checkbox', { name: new RegExp(`select ${product.name}`, 'i') })).toBeInTheDocument()
    })

    it('renders products in list mode when that view is selected', () => {
      mockUseAdminCatalogPresenter.mockReturnValue({ ...defaultPresenterState, viewMode: 'list' })
      render(<CatalogPage />)
      for (const product of defaultPresenterState.products) expect(screen.getByText(product.name)).toBeInTheDocument()
    })

    it('toggles a product selection through the presenter', async () => {
      const user = userEvent.setup()
      const products = createMockProducts(2)
      const handleProductToggle = jest.fn()
      mockUseAdminCatalogPresenter.mockReturnValue({ ...defaultPresenterState, products, handleProductToggle })
      render(<CatalogPage />)
      await user.click(screen.getByRole('checkbox', { name: new RegExp(`select ${products[0].name}`, 'i') }))
      expect(handleProductToggle).toHaveBeenCalledWith(products[0].id)
    })
  })

  describe('Bulk action toolbar', () => {
    it('shows the current selection count and action controls only when selected', () => {
      const { rerender } = render(<CatalogPage />)
      expect(screen.queryByRole('toolbar', { name: /bulk actions/i })).not.toBeInTheDocument()
      mockUseAdminCatalogPresenter.mockReturnValue({ ...defaultPresenterState, hasSelection: true, selectedCount: 3 })
      rerender(<CatalogPage />)
      expect(screen.getByRole('toolbar', { name: /bulk actions/i })).toBeInTheDocument()
      expect(within(screen.getByRole('toolbar', { name: /bulk actions/i })).getByRole('status')).toHaveTextContent('3 products selected')
      expect(screen.getByRole('button', { name: 'Publish 3 selected products' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Unpublish 3 selected products' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Delete 3 selected products' })).toBeInTheDocument()
    })

    it('opens publish, unpublish, and delete confirmation dialogs', async () => {
      const user = userEvent.setup()
      const openPublishModal = jest.fn()
      const openUnpublishModal = jest.fn()
      const openDeleteModal = jest.fn()
      mockUseAdminCatalogPresenter.mockReturnValue({
        ...defaultPresenterState, hasSelection: true, selectedCount: 2,
        openPublishModal, openUnpublishModal, openDeleteModal,
      })
      render(<CatalogPage />)
      await user.click(screen.getByRole('button', { name: 'Publish 2 selected products' }))
      await user.click(screen.getByRole('button', { name: 'Unpublish 2 selected products' }))
      await user.click(screen.getByRole('button', { name: 'Delete 2 selected products' }))
      expect(openPublishModal).toHaveBeenCalledTimes(1)
      expect(openUnpublishModal).toHaveBeenCalledTimes(1)
      expect(openDeleteModal).toHaveBeenCalledTimes(1)
    })

    it('disables bulk controls and announces work while an operation is in progress', () => {
      mockUseAdminCatalogPresenter.mockReturnValue({
        ...defaultPresenterState, hasSelection: true, selectedCount: 2,
        isOperationInProgress: true, currentOperation: 'Bulk Publish',
      })
      render(<CatalogPage />)
      expect(within(screen.getByRole('toolbar', { name: /bulk actions/i })).getByText('Bulk Publish in progress...')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Publish 2 selected products' })).toBeDisabled()
    })
  })

  describe('Pagination', () => {
    it('announces the current page and sends next and previous actions to the presenter', async () => {
      const user = userEvent.setup()
      const handlePageChange = jest.fn()
      mockUseAdminCatalogPresenter.mockReturnValue({ ...defaultPresenterState, currentPage: 2, hasPreviousPage: true, handlePageChange })
      render(<CatalogPage />)
      expect(screen.getAllByRole('status').find((status) => status.textContent?.includes('Page 2 of 5'))).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Go to next page' }))
      await user.click(screen.getByRole('button', { name: 'Go to previous page' }))
      expect(handlePageChange).toHaveBeenNthCalledWith(1, 3)
      expect(handlePageChange).toHaveBeenNthCalledWith(2, 1)
    })

    it('disables navigation at either end of the result set', () => {
      const { rerender } = render(<CatalogPage />)
      expect(screen.getByRole('button', { name: 'Go to previous page' })).toBeDisabled()
      mockUseAdminCatalogPresenter.mockReturnValue({ ...defaultPresenterState, currentPage: 5, hasNextPage: false })
      rerender(<CatalogPage />)
      expect(screen.getByRole('button', { name: 'Go to next page' })).toBeDisabled()
    })

    it('selects a page from the labelled page-number group', async () => {
      const user = userEvent.setup()
      const handlePageChange = jest.fn()
      mockUseAdminCatalogPresenter.mockReturnValue({ ...defaultPresenterState, handlePageChange })
      render(<CatalogPage />)
      const pages = screen.getByRole('group', { name: 'Page numbers' })
      await user.click(within(pages).getByRole('button', { name: 'Go to page 3' }))
      expect(handlePageChange).toHaveBeenCalledWith(3)
    })
  })

  describe('View mode toggle', () => {
    it('offers grid, list, and table view choices and reports a selection', async () => {
      const user = userEvent.setup()
      const setViewMode = jest.fn()
      mockUseAdminCatalogPresenter.mockReturnValue({ ...defaultPresenterState, setViewMode })
      render(<CatalogPage />)
      await user.click(screen.getByRole('radio', { name: 'List view' }))
      expect(setViewMode).toHaveBeenCalledWith('list')
      await user.click(screen.getByRole('radio', { name: 'Table view' }))
      expect(setViewMode).toHaveBeenCalledWith('table')
    })
  })

  describe('Action buttons', () => {
    it('exposes the current export action by its accessible name', () => {
      render(<CatalogPage />)
      expect(screen.getByRole('button', { name: 'Export products' })).toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    it('keeps search, view, and filter actions keyboard-accessible by role and name', () => {
      render(<CatalogPage />)
      expect(screen.getByRole('searchbox', { name: /search products/i })).toBeInTheDocument()
      expect(screen.getByRole('radio', { name: 'Grid view' })).toBeEnabled()
      expect(screen.getByRole('button', { name: 'Filters' })).toBeEnabled()
    })
  })

  describe('Confirmation modals', () => {
    const dialogPresenter = {
      ...defaultPresenterState,
      selectedCount: 2,
      isPublishModalOpen: true,
      isUnpublishModalOpen: false,
      isDeleteModalOpen: false,
    }

    it('confirms a publish action through the bulk handler', async () => {
      const user = userEvent.setup()
      const handleBulkPublish = jest.fn()
      render(<BulkActionDialogs presenter={{ ...dialogPresenter, handleBulkPublish } as any} />)
      expect(screen.getByRole('alertdialog', { name: 'Publish Products' })).toHaveTextContent('publish 2 products')
      await user.click(screen.getByRole('button', { name: 'Publish' }))
      expect(handleBulkPublish).toHaveBeenCalledTimes(1)
    })

    it('cancels a publish confirmation through the close handler', async () => {
      const user = userEvent.setup()
      const closePublishModal = jest.fn()
      render(<BulkActionDialogs presenter={{ ...dialogPresenter, closePublishModal } as any} />)
      await user.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(closePublishModal).toHaveBeenCalledWith(false)
    })

    it('confirms and cancels unpublish with its optional reason', async () => {
      const user = userEvent.setup()
      const handleBulkUnpublish = jest.fn()
      const closeUnpublishModal = jest.fn()
      render(<BulkActionDialogs presenter={{ ...dialogPresenter, isPublishModalOpen: false, isUnpublishModalOpen: true, handleBulkUnpublish, closeUnpublishModal } as any} />)
      await user.type(screen.getByRole('textbox', { name: 'Reason (optional)' }), 'Duplicate listing')
      await user.click(screen.getByRole('button', { name: 'Unpublish' }))
      expect(handleBulkUnpublish).toHaveBeenCalledWith('Duplicate listing')
      await user.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(closeUnpublishModal).toHaveBeenCalledWith(false)
    })

    it('confirms deletion and exposes its irreversible consequence', async () => {
      const user = userEvent.setup()
      const handleBulkDelete = jest.fn()
      render(<BulkActionDialogs presenter={{ ...dialogPresenter, isPublishModalOpen: false, isDeleteModalOpen: true, handleBulkDelete } as any} />)
      expect(screen.getByRole('alertdialog', { name: 'Delete Products' })).toHaveTextContent('cannot be undone')
      await user.click(screen.getByRole('button', { name: 'Delete Permanently' }))
      expect(handleBulkDelete).toHaveBeenCalledTimes(1)
    })
  })
})
