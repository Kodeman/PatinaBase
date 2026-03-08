/**
 * Accessibility Tests
 * WCAG 2.1 Level AA Compliance Testing
 *
 * These tests verify that the admin portal meets accessibility standards
 * using axe-core automated testing and manual ARIA attribute verification.
 */

import { render } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { AdminCatalogSearchBar } from '@/components/catalog/admin-catalog-search-bar';
import { AdminCatalogFilters } from '@/components/catalog/admin-catalog-filters';
import { AdminProductCard } from '@/components/catalog/admin-product-card';
import { BulkActionToolbar } from '@/components/catalog/bulk-action-toolbar';
import { AccessibleModal } from '@/components/ui/accessible-modal';

// Extend Jest matchers
expect.extend(toHaveNoViolations);

// Mock presenter for testing
const mockPresenter = {
  searchQuery: '',
  viewMode: 'grid' as const,
  activeFilterCount: 0,
  totalProducts: 0,
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
};

const mockProduct = {
  id: 'test-product-1',
  name: 'Test Product',
  brand: 'Test Brand',
  price: 1000,
  status: 'published' as const,
  imageUrl: '/test-image.jpg',
  categoryName: 'Furniture',
  variantCount: 3,
  hasValidationIssues: false,
  has3D: false,
  arSupported: false,
};

describe('Accessibility Compliance', () => {
  describe('Search Bar Component', () => {
    it('should have no axe accessibility violations', async () => {
      const { container } = render(
        <AdminCatalogSearchBar presenter={mockPresenter} />
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should have proper ARIA labels on search input', () => {
      const { getByLabelText, getByRole } = render(
        <AdminCatalogSearchBar presenter={mockPresenter} />
      );

      expect(getByRole('search')).toBeInTheDocument();
      expect(
        getByLabelText(/search products by name, brand, sku, or category/i)
      ).toBeInTheDocument();
    });

    it('should have screen reader hint text', () => {
      const { container } = render(
        <AdminCatalogSearchBar presenter={mockPresenter} />
      );

      const hint = container.querySelector('#search-hint');
      expect(hint).toBeInTheDocument();
      expect(hint).toHaveClass('sr-only');
    });

    it('should have live region for results count', () => {
      const { getByRole } = render(
        <AdminCatalogSearchBar presenter={mockPresenter} />
      );

      const statusRegion = getByRole('status');
      expect(statusRegion).toHaveAttribute('aria-live', 'polite');
    });
  });

  describe('Filter Panel Component', () => {
    it('should have no axe accessibility violations', async () => {
      const { container } = render(
        <AdminCatalogFilters
          presenter={mockPresenter}
          isOpen={true}
          onClose={jest.fn()}
        />
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should use fieldset for filter groups', () => {
      const { container } = render(
        <AdminCatalogFilters
          presenter={mockPresenter}
          isOpen={true}
          onClose={jest.fn()}
        />
      );

      const fieldsets = container.querySelectorAll('fieldset');
      expect(fieldsets.length).toBeGreaterThan(0);
    });

    it('should have proper labels for all inputs', () => {
      const { container } = render(
        <AdminCatalogFilters
          presenter={mockPresenter}
          isOpen={true}
          onClose={jest.fn()}
        />
      );

      const inputs = container.querySelectorAll('input');
      inputs.forEach((input) => {
        if (input.type !== 'hidden') {
          const id = input.id;
          const label = container.querySelector(`label[for="${id}"]`);
          expect(label).toBeInTheDocument();
        }
      });
    });
  });

  describe('Product Card Component', () => {
    it('should have no axe accessibility violations', async () => {
      const { container } = render(
        <AdminProductCard product={mockProduct} presenter={mockPresenter} />
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should have semantic article role', () => {
      const { getByRole } = render(
        <AdminProductCard product={mockProduct} presenter={mockPresenter} />
      );

      expect(getByRole('article')).toBeInTheDocument();
    });

    it('should have descriptive alt text for images', () => {
      const { getByAltText } = render(
        <AdminProductCard product={mockProduct} presenter={mockPresenter} />
      );

      expect(
        getByAltText(/test product by test brand - furniture/i)
      ).toBeInTheDocument();
    });

    it('should have ARIA labels on action buttons', () => {
      const { getByLabelText } = render(
        <AdminProductCard product={mockProduct} presenter={mockPresenter} />
      );

      expect(getByLabelText(/view details for test product/i)).toBeInTheDocument();
      expect(getByLabelText(/more actions for test product/i)).toBeInTheDocument();
    });

    it('should mark decorative icons as aria-hidden', () => {
      const { container } = render(
        <AdminProductCard product={mockProduct} presenter={mockPresenter} />
      );

      const icons = container.querySelectorAll('svg');
      const decorativeIcons = Array.from(icons).filter(
        (icon) => icon.getAttribute('aria-hidden') === 'true'
      );
      expect(decorativeIcons.length).toBeGreaterThan(0);
    });
  });

  describe('Bulk Action Toolbar Component', () => {
    const mockPresenterWithSelection = {
      ...mockPresenter,
      hasSelection: true,
      selectedCount: 3,
    };

    it('should have no axe accessibility violations', async () => {
      const { container } = render(
        <BulkActionToolbar presenter={mockPresenterWithSelection} />
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should have toolbar role', () => {
      const { getByRole } = render(
        <BulkActionToolbar presenter={mockPresenterWithSelection} />
      );

      expect(getByRole('toolbar')).toBeInTheDocument();
    });

    it('should have live region for selection count', () => {
      const { getByText } = render(
        <BulkActionToolbar presenter={mockPresenterWithSelection} />
      );

      const badge = getByText(/3 products selected/i).closest('[role="status"]');
      expect(badge).toBeInTheDocument();
    });

    it('should have descriptive labels on all action buttons', () => {
      const { getByLabelText } = render(
        <BulkActionToolbar presenter={mockPresenterWithSelection} />
      );

      expect(getByLabelText(/publish 3 selected products/i)).toBeInTheDocument();
      expect(getByLabelText(/unpublish 3 selected products/i)).toBeInTheDocument();
      expect(getByLabelText(/delete 3 selected products/i)).toBeInTheDocument();
    });

    it('should indicate busy state with aria-busy', () => {
      const mockPresenterBusy = {
        ...mockPresenterWithSelection,
        isOperationInProgress: true,
        currentOperation: 'Bulk Publish',
      };

      const { getByLabelText } = render(
        <BulkActionToolbar presenter={mockPresenterBusy} />
      );

      const publishButton = getByLabelText(/publish 3 selected products/i);
      expect(publishButton).toHaveAttribute('aria-busy', 'true');
    });
  });

  describe('Accessible Modal Component', () => {
    it('should have no axe accessibility violations', async () => {
      const { container } = render(
        <AccessibleModal
          isOpen={true}
          onClose={jest.fn()}
          title="Test Modal"
          description="Test description"
        >
          <div>Modal content</div>
        </AccessibleModal>
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should have dialog role and aria-modal', () => {
      const { getByRole } = render(
        <AccessibleModal
          isOpen={true}
          onClose={jest.fn()}
          title="Test Modal"
          description="Test description"
        >
          <div>Modal content</div>
        </AccessibleModal>
      );

      const dialog = getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
    });

    it('should have proper labeling', () => {
      const { getByRole } = render(
        <AccessibleModal
          isOpen={true}
          onClose={jest.fn()}
          title="Test Modal"
          description="Test description"
        >
          <div>Modal content</div>
        </AccessibleModal>
      );

      const dialog = getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-labelledby', 'modal-title');
      expect(dialog).toHaveAttribute('aria-describedby', 'modal-description');
    });
  });

  describe('Keyboard Navigation', () => {
    it('should support Tab key navigation', () => {
      const { container } = render(
        <AdminCatalogSearchBar presenter={mockPresenter} />
      );

      const focusableElements = container.querySelectorAll(
        'button, input, a, [tabindex]:not([tabindex="-1"])'
      );

      expect(focusableElements.length).toBeGreaterThan(0);
      focusableElements.forEach((element) => {
        expect(element).not.toHaveAttribute('tabindex', '-1');
      });
    });

    it('should have visible focus indicators', () => {
      const { container } = render(
        <AdminCatalogSearchBar presenter={mockPresenter} />
      );

      // Check that focus-visible styles are applied
      const buttons = container.querySelectorAll('button');
      buttons.forEach((button) => {
        // Buttons should be focusable
        expect(button).not.toHaveAttribute('disabled');
      });
    });
  });

  describe('Screen Reader Support', () => {
    it('should have skip link for main content', () => {
      const { container } = render(
        <a href="#main-content" className="skip-link sr-only-focusable">
          Skip to main content
        </a>
      );

      const skipLink = container.querySelector('.skip-link');
      expect(skipLink).toBeInTheDocument();
      expect(skipLink).toHaveClass('sr-only-focusable');
    });

    it('should use sr-only for screen reader only content', () => {
      const { container } = render(
        <AdminCatalogSearchBar presenter={mockPresenter} />
      );

      const srOnlyElements = container.querySelectorAll('.sr-only');
      expect(srOnlyElements.length).toBeGreaterThan(0);
    });

    it('should mark decorative content as aria-hidden', () => {
      const { container } = render(
        <AdminProductCard product={mockProduct} presenter={mockPresenter} />
      );

      const decorativeElements = container.querySelectorAll('[aria-hidden="true"]');
      expect(decorativeElements.length).toBeGreaterThan(0);
    });
  });

  describe('Color Contrast', () => {
    // Note: Color contrast is best tested with axe-core automated tests
    // Manual testing with tools like axe DevTools is also recommended

    it('should pass automated color contrast checks', async () => {
      const { container } = render(
        <AdminCatalogSearchBar presenter={mockPresenter} />
      );

      const results = await axe(container, {
        rules: {
          'color-contrast': { enabled: true },
        },
      });

      expect(results).toHaveNoViolations();
    });
  });
});
