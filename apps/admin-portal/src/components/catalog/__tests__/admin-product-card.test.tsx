/**
 * AdminProductCard Component Tests
 *
 * Tests for the product card display component including rendering,
 * status badges, selection toggle, dropdown menu, and navigation.
 *
 * @module components/catalog/__tests__/admin-product-card
 */

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test-utils/render';
import { AdminProductCard } from '../admin-product-card';
import { createMockProduct } from '@/test-utils';
import type { ProductListItem } from '@/types';
import type { AdminCatalogPresenter } from '@/features/catalog/hooks/useAdminCatalogPresenter';

// Mock Next.js navigation
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
  }),
  usePathname: () => '/catalog',
}));

// Mock Next.js Image component
jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: any) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...props} />;
  },
}));

describe('AdminProductCard', () => {
  const mockPresenter: AdminCatalogPresenter = {
    selectedProducts: [],
    handleProductToggle: jest.fn(),
    handleSelectAll: jest.fn(),
    handleClearSelection: jest.fn(),
    isAllSelected: false,
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render product data correctly', () => {
      const product: ProductListItem = {
        id: 'product-1',
        name: 'Modern Sectional Sofa',
        brand: 'Herman Miller',
        price: 1299.99,
        status: 'draft',
        imageUrl: 'https://example.com/sofa.jpg',
        categoryName: 'Seating',
        variantCount: 3,
        hasValidationIssues: false,
        has3D: false,
        arSupported: false,
      } as ProductListItem;

      renderWithProviders(
        <AdminProductCard product={product} presenter={mockPresenter} />
      );

      // Check product name
      expect(screen.getByText('Modern Sectional Sofa')).toBeInTheDocument();

      // Check brand
      expect(screen.getByText('Herman Miller')).toBeInTheDocument();

      // Check price
      expect(screen.getByText('$1,299.99')).toBeInTheDocument();

      // Check category
      expect(screen.getByText('Seating')).toBeInTheDocument();

      // Check variant count
      expect(screen.getByText('3 variants')).toBeInTheDocument();
    });

    it('should render product image when available', () => {
      const product: ProductListItem = {
        id: 'product-1',
        name: 'Modern Sofa',
        brand: 'Test Brand',
        price: 999,
        status: 'draft',
        imageUrl: 'https://example.com/sofa.jpg',
      } as ProductListItem;

      renderWithProviders(
        <AdminProductCard product={product} presenter={mockPresenter} />
      );

      const image = screen.getByAltText(/modern sofa by test brand/i);
      expect(image).toBeInTheDocument();
      expect(image).toHaveAttribute('src', 'https://example.com/sofa.jpg');
    });

    it('should show placeholder when no image is available', () => {
      const product: ProductListItem = {
        id: 'product-1',
        name: 'Modern Sofa',
        brand: 'Test Brand',
        price: 999,
        status: 'draft',
        imageUrl: null,
      } as ProductListItem;

      renderWithProviders(
        <AdminProductCard product={product} presenter={mockPresenter} />
      );

      expect(screen.getByText('No image')).toBeInTheDocument();
    });

    it('should show 3D badge when has3D is true', () => {
      const product: ProductListItem = {
        id: 'product-1',
        name: 'Modern Sofa',
        brand: 'Test Brand',
        price: 999,
        status: 'draft',
        has3D: true,
        arSupported: false,
      } as ProductListItem;

      renderWithProviders(
        <AdminProductCard product={product} presenter={mockPresenter} />
      );

      expect(screen.getByText('3D')).toBeInTheDocument();
    });

    it('should show AR badge when arSupported is true', () => {
      const product: ProductListItem = {
        id: 'product-1',
        name: 'Modern Sofa',
        brand: 'Test Brand',
        price: 999,
        status: 'draft',
        has3D: false,
        arSupported: true,
      } as ProductListItem;

      renderWithProviders(
        <AdminProductCard product={product} presenter={mockPresenter} />
      );

      expect(screen.getByText('AR')).toBeInTheDocument();
    });

    it('should handle missing optional fields gracefully', () => {
      const product: ProductListItem = {
        id: 'product-1',
        name: 'Modern Sofa',
        brand: null,
        price: 999,
        status: 'draft',
        categoryName: null,
        variantCount: 0,
        hasValidationIssues: false,
      } as any;

      renderWithProviders(
        <AdminProductCard product={product} presenter={mockPresenter} />
      );

      // Should still render without crashing
      expect(screen.getByText('Modern Sofa')).toBeInTheDocument();
      expect(screen.getByText('$999.00')).toBeInTheDocument();
    });
  });

  describe('Status Badge', () => {
    const testCases = [
      { status: 'published' as const, expected: 'published' },
      { status: 'draft' as const, expected: 'draft' },
      { status: 'in_review' as const, expected: 'in_review' },
      { status: 'deprecated' as const, expected: 'deprecated' },
    ];

    testCases.forEach(({ status, expected }) => {
      it(`should show ${status} badge`, () => {
        const product: ProductListItem = {
          id: 'product-1',
          name: 'Modern Sofa',
          brand: 'Test Brand',
          price: 999,
          status,
        } as ProductListItem;

        renderWithProviders(
          <AdminProductCard product={product} presenter={mockPresenter} />
        );

        const badge = screen.getByLabelText(/status:/i);
        expect(badge).toHaveTextContent(expected);
      });
    });

    it('should show validation issues indicator', () => {
      const product: ProductListItem = {
        id: 'product-1',
        name: 'Modern Sofa',
        brand: 'Test Brand',
        price: 999,
        status: 'draft',
        hasValidationIssues: true,
      } as ProductListItem;

      renderWithProviders(
        <AdminProductCard product={product} presenter={mockPresenter} />
      );

      expect(screen.getByLabelText(/has validation issues/i)).toBeInTheDocument();
      expect(screen.getByText('Issues')).toBeInTheDocument();
    });

    it('should show no issues indicator when valid', () => {
      const product: ProductListItem = {
        id: 'product-1',
        name: 'Modern Sofa',
        brand: 'Test Brand',
        price: 999,
        status: 'draft',
        hasValidationIssues: false,
      } as ProductListItem;

      renderWithProviders(
        <AdminProductCard product={product} presenter={mockPresenter} />
      );

      expect(screen.getByLabelText(/no validation issues/i)).toBeInTheDocument();
    });
  });

  describe('Selection Toggle', () => {
    it('should render unchecked checkbox when not selected', () => {
      const product: ProductListItem = {
        id: 'product-1',
        name: 'Modern Sofa',
        brand: 'Test Brand',
        price: 999,
        status: 'draft',
      } as ProductListItem;

      renderWithProviders(
        <AdminProductCard product={product} presenter={mockPresenter} />
      );

      const checkbox = screen.getByRole('checkbox', { name: /select modern sofa/i });
      expect(checkbox).not.toBeChecked();
    });

    it('should render checked checkbox when selected', () => {
      const product: ProductListItem = {
        id: 'product-1',
        name: 'Modern Sofa',
        brand: 'Test Brand',
        price: 999,
        status: 'draft',
      } as ProductListItem;

      const presenterWithSelection = {
        ...mockPresenter,
        selectedProducts: ['product-1'],
      };

      renderWithProviders(
        <AdminProductCard product={product} presenter={presenterWithSelection} />
      );

      const checkbox = screen.getByRole('checkbox', { name: /select modern sofa/i });
      expect(checkbox).toBeChecked();
    });

    it('should call handleProductToggle when checkbox is clicked', async () => {
      const user = userEvent.setup();
      const product: ProductListItem = {
        id: 'product-1',
        name: 'Modern Sofa',
        brand: 'Test Brand',
        price: 999,
        status: 'draft',
      } as ProductListItem;

      const mockToggle = jest.fn();
      const presenterWithToggle = {
        ...mockPresenter,
        handleProductToggle: mockToggle,
      };

      renderWithProviders(
        <AdminProductCard product={product} presenter={presenterWithToggle} />
      );

      const checkbox = screen.getByRole('checkbox', { name: /select modern sofa/i });
      await user.click(checkbox);

      expect(mockToggle).toHaveBeenCalledWith('product-1');
    });
  });

  describe('Dropdown Menu', () => {
    it('should open dropdown menu on button click', async () => {
      const user = userEvent.setup();
      const product: ProductListItem = {
        id: 'product-1',
        name: 'Modern Sofa',
        brand: 'Test Brand',
        price: 999,
        status: 'draft',
      } as ProductListItem;

      renderWithProviders(
        <AdminProductCard product={product} presenter={mockPresenter} />
      );

      const moreButton = screen.getByRole('button', { name: /more actions/i });
      await user.click(moreButton);

      // Check that menu items are visible
      expect(screen.getByText('Edit')).toBeInTheDocument();
      expect(screen.getByText('Duplicate')).toBeInTheDocument();
      expect(screen.getByText('Delete')).toBeInTheDocument();
    });

    it('should show Publish option for non-published products', async () => {
      const user = userEvent.setup();
      const product: ProductListItem = {
        id: 'product-1',
        name: 'Modern Sofa',
        brand: 'Test Brand',
        price: 999,
        status: 'draft',
      } as ProductListItem;

      renderWithProviders(
        <AdminProductCard product={product} presenter={mockPresenter} />
      );

      const moreButton = screen.getByRole('button', { name: /more actions/i });
      await user.click(moreButton);

      expect(screen.getByText('Publish')).toBeInTheDocument();
      expect(screen.queryByText('Unpublish')).not.toBeInTheDocument();
    });

    it('should show Unpublish option for published products', async () => {
      const user = userEvent.setup();
      const product: ProductListItem = {
        id: 'product-1',
        name: 'Modern Sofa',
        brand: 'Test Brand',
        price: 999,
        status: 'published',
      } as ProductListItem;

      renderWithProviders(
        <AdminProductCard product={product} presenter={mockPresenter} />
      );

      const moreButton = screen.getByRole('button', { name: /more actions/i });
      await user.click(moreButton);

      expect(screen.getByText('Unpublish')).toBeInTheDocument();
      expect(screen.queryByText('Publish')).not.toBeInTheDocument();
    });
  });

  describe('Navigation', () => {
    it('should navigate to edit page when Edit is clicked', async () => {
      const user = userEvent.setup();
      const product: ProductListItem = {
        id: 'product-1',
        name: 'Modern Sofa',
        brand: 'Test Brand',
        price: 999,
        status: 'draft',
      } as ProductListItem;

      renderWithProviders(
        <AdminProductCard product={product} presenter={mockPresenter} />
      );

      const moreButton = screen.getByRole('button', { name: /more actions/i });
      await user.click(moreButton);

      const editLink = screen.getByRole('link', { name: /edit/i });
      expect(editLink).toHaveAttribute('href', '/catalog/product-1');
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels', () => {
      const product: ProductListItem = {
        id: 'product-1',
        name: 'Modern Sofa',
        brand: 'Herman Miller',
        price: 1299.99,
        status: 'draft',
      } as ProductListItem;

      renderWithProviders(
        <AdminProductCard product={product} presenter={mockPresenter} />
      );

      // Check article role and labels
      const article = screen.getByRole('article');
      expect(article).toHaveAttribute('aria-labelledby', 'product-product-1-name');
      expect(article).toHaveAttribute('aria-describedby', 'product-product-1-meta');

      // Check heading
      const heading = screen.getByRole('heading', { name: /modern sofa/i });
      expect(heading).toHaveAttribute('id', 'product-product-1-name');

      // Check checkbox label
      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toHaveAccessibleName(/select modern sofa by herman miller/i);

      // Check action buttons group
      const actionsGroup = screen.getByRole('group', { name: /actions for modern sofa/i });
      expect(actionsGroup).toBeInTheDocument();
    });

    it('should have semantic HTML structure', () => {
      const product: ProductListItem = {
        id: 'product-1',
        name: 'Modern Sofa',
        brand: 'Test Brand',
        price: 999,
        status: 'draft',
      } as ProductListItem;

      const { container } = renderWithProviders(
        <AdminProductCard product={product} presenter={mockPresenter} />
      );

      // Check for article element
      expect(container.querySelector('article')).toBeInTheDocument();

      // Check for heading
      const heading = screen.getByRole('heading', { name: /modern sofa/i });
      expect(heading.tagName).toBe('H3');
    });

    it('should provide screen reader text for icon buttons', async () => {
      const user = userEvent.setup();
      const product: ProductListItem = {
        id: 'product-1',
        name: 'Modern Sofa',
        brand: 'Test Brand',
        price: 999,
        status: 'draft',
      } as ProductListItem;

      renderWithProviders(
        <AdminProductCard product={product} presenter={mockPresenter} />
      );

      // More actions button should have accessible name
      const moreButton = screen.getByRole('button', { name: /more actions for modern sofa/i });
      expect(moreButton).toBeInTheDocument();

      // View button should have accessible name
      const viewButton = screen.getByRole('button', { name: /view details for modern sofa/i });
      expect(viewButton).toBeInTheDocument();
    });
  });

  describe('Price Formatting', () => {
    it('should format price correctly', () => {
      const testCases = [
        { price: 999, expected: '$999.00' },
        { price: 1299.99, expected: '$1,299.99' },
        { price: 10000, expected: '$10,000.00' },
        { price: 99.5, expected: '$99.50' },
      ];

      testCases.forEach(({ price, expected }) => {
        const product: ProductListItem = {
          id: 'product-1',
          name: 'Test Product',
          brand: 'Test Brand',
          price,
          status: 'draft',
        } as ProductListItem;

        const { unmount } = renderWithProviders(
          <AdminProductCard product={product} presenter={mockPresenter} />
        );

        expect(screen.getByText(expected)).toBeInTheDocument();
        unmount();
      });
    });
  });
});
