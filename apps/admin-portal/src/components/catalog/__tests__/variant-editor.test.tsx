/**
 * VariantEditor Component Tests
 *
 * Comprehensive test suite for the VariantEditor component covering:
 * - Rendering and display
 * - CRUD operations
 * - CSV import/export
 * - Validation
 * - Optimistic updates
 * - Error handling
 * - Keyboard shortcuts
 *
 * @module components/catalog/__tests__/variant-editor.test
 */

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

import { VariantEditor } from '../variant-editor';
import * as variantHooks from '@/hooks/use-variants';
import type { Variant } from '@patina/types';

// Mock hooks
vi.mock('@/hooks/use-variants');
vi.mock('@/components/ui/use-toast');

// Mock data
const mockVariants: Variant[] = [
  {
    id: 'var-1',
    productId: 'prod-1',
    sku: 'SKU-001',
    name: 'Red Variant',
    barcode: '123456789',
    options: { color: 'Red', size: 'Large' },
    price: 99.99,
    quantity: 10,
    availabilityStatus: 'in_stock',
  },
  {
    id: 'var-2',
    productId: 'prod-1',
    sku: 'SKU-002',
    name: 'Blue Variant',
    barcode: '987654321',
    options: { color: 'Blue', size: 'Medium' },
    price: 89.99,
    quantity: 5,
    availabilityStatus: 'in_stock',
  },
];

// Test wrapper
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('VariantEditor', () => {
  const mockToast = vi.fn();
  const mockRefetch = vi.fn();
  const mockCreateMutation = vi.fn();
  const mockUpdateMutation = vi.fn();
  const mockDeleteMutation = vi.fn();
  const mockBulkCreateMutation = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock useToast
    vi.mocked(require('@/components/ui/use-toast').useToast).mockReturnValue({
      toast: mockToast,
    });

    // Default mock implementations
    vi.mocked(variantHooks.useVariants).mockReturnValue({
      variants: mockVariants,
      isLoading: false,
      error: null,
      isEmpty: false,
      refetch: mockRefetch,
    } as any);

    vi.mocked(variantHooks.useCreateVariant).mockReturnValue({
      mutateAsync: mockCreateMutation,
      isPending: false,
    } as any);

    vi.mocked(variantHooks.useUpdateVariant).mockReturnValue({
      mutateAsync: mockUpdateMutation,
      isPending: false,
    } as any);

    vi.mocked(variantHooks.useDeleteVariant).mockReturnValue({
      mutateAsync: mockDeleteMutation,
      isPending: false,
    } as any);

    vi.mocked(variantHooks.useBulkCreateVariants).mockReturnValue({
      mutateAsync: mockBulkCreateMutation,
      isPending: false,
    } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================================================
  // RENDERING TESTS
  // ============================================================================

  describe('Rendering', () => {
    it('should render the component with variants', () => {
      render(<VariantEditor productId="prod-1" />, { wrapper: createWrapper() });

      expect(screen.getByText('Product Variants')).toBeInTheDocument();
      expect(screen.getByText(/Manage SKUs, pricing, and inventory/i)).toBeInTheDocument();
    });

    it('should display all variants in table', () => {
      render(<VariantEditor productId="prod-1" />, { wrapper: createWrapper() });

      expect(screen.getByText('SKU-001')).toBeInTheDocument();
      expect(screen.getByText('SKU-002')).toBeInTheDocument();
      expect(screen.getByText('Red Variant')).toBeInTheDocument();
      expect(screen.getByText('Blue Variant')).toBeInTheDocument();
    });

    it('should show loading state', () => {
      vi.mocked(variantHooks.useVariants).mockReturnValue({
        variants: [],
        isLoading: true,
        error: null,
        isEmpty: true,
        refetch: mockRefetch,
      } as any);

      render(<VariantEditor productId="prod-1" />, { wrapper: createWrapper() });

      // Should show skeleton loader
      expect(screen.getByRole('status', { hidden: true })).toBeInTheDocument();
    });

    it('should show error state', () => {
      vi.mocked(variantHooks.useVariants).mockReturnValue({
        variants: [],
        isLoading: false,
        error: new Error('Failed to load'),
        isEmpty: true,
        refetch: mockRefetch,
      } as any);

      render(<VariantEditor productId="prod-1" />, { wrapper: createWrapper() });

      expect(screen.getByText('Failed to load variants')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    });

    it('should show empty state when no variants', () => {
      vi.mocked(variantHooks.useVariants).mockReturnValue({
        variants: [],
        isLoading: false,
        error: null,
        isEmpty: true,
        refetch: mockRefetch,
      } as any);

      render(<VariantEditor productId="prod-1" />, { wrapper: createWrapper() });

      expect(screen.getByText('No variants yet')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /create first variant/i })).toBeInTheDocument();
    });
  });

  // ============================================================================
  // CREATE VARIANT TESTS
  // ============================================================================

  describe('Create Variant', () => {
    it('should open add variant form when clicking Add Variant button', async () => {
      const user = userEvent.setup();
      render(<VariantEditor productId="prod-1" />, { wrapper: createWrapper() });

      const addButton = screen.getByRole('button', { name: /add variant/i });
      await user.click(addButton);

      // Should show input fields in new row
      expect(screen.getByPlaceholderText('SKU-001')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Variant name')).toBeInTheDocument();
    });

    it('should create a new variant with valid data', async () => {
      const user = userEvent.setup();
      mockCreateMutation.mockResolvedValue({ data: { id: 'var-3' } });

      render(<VariantEditor productId="prod-1" />, { wrapper: createWrapper() });

      // Click add variant
      const addButton = screen.getByRole('button', { name: /add variant/i });
      await user.click(addButton);

      // Fill form
      await user.type(screen.getByPlaceholderText('SKU-001'), 'SKU-003');
      await user.type(screen.getByPlaceholderText('Variant name'), 'Green Variant');
      await user.type(screen.getByPlaceholderText('0.00'), '79.99');
      await user.type(screen.getByPlaceholderText('0'), '15');

      // Save
      const saveButton = screen.getByRole('button', { name: /save/i });
      await user.click(saveButton);

      await waitFor(() => {
        expect(mockCreateMutation).toHaveBeenCalledWith({
          productId: 'prod-1',
          data: expect.objectContaining({
            sku: 'SKU-003',
            name: 'Green Variant',
            price: 79.99,
            quantity: 15,
          }),
        });
      });

      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Variant created',
        })
      );
    });

    it('should validate required SKU field', async () => {
      const user = userEvent.setup();
      render(<VariantEditor productId="prod-1" />, { wrapper: createWrapper() });

      // Click add variant
      await user.click(screen.getByRole('button', { name: /add variant/i }));

      // Try to save without SKU
      await user.click(screen.getByRole('button', { name: /save/i }));

      // Should show validation error
      await waitFor(() => {
        expect(screen.getByText(/sku is required/i)).toBeInTheDocument();
      });

      expect(mockCreateMutation).not.toHaveBeenCalled();
    });

    it('should validate price is positive', async () => {
      const user = userEvent.setup();
      render(<VariantEditor productId="prod-1" />, { wrapper: createWrapper() });

      await user.click(screen.getByRole('button', { name: /add variant/i }));

      await user.type(screen.getByPlaceholderText('SKU-001'), 'SKU-003');
      await user.type(screen.getByPlaceholderText('0.00'), '-10');

      await user.click(screen.getByRole('button', { name: /save/i }));

      await waitFor(() => {
        expect(screen.getByText(/price must be positive/i)).toBeInTheDocument();
      });
    });

    it('should validate quantity is non-negative integer', async () => {
      const user = userEvent.setup();
      render(<VariantEditor productId="prod-1" />, { wrapper: createWrapper() });

      await user.click(screen.getByRole('button', { name: /add variant/i }));

      await user.type(screen.getByPlaceholderText('SKU-001'), 'SKU-003');
      await user.type(screen.getByPlaceholderText('0'), '-5');

      await user.click(screen.getByRole('button', { name: /save/i }));

      await waitFor(() => {
        expect(screen.getByText(/stock cannot be negative/i)).toBeInTheDocument();
      });
    });

    it('should cancel adding new variant', async () => {
      const user = userEvent.setup();
      render(<VariantEditor productId="prod-1" />, { wrapper: createWrapper() });

      await user.click(screen.getByRole('button', { name: /add variant/i }));

      // Should show form
      expect(screen.getByPlaceholderText('SKU-001')).toBeInTheDocument();

      // Click cancel
      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelButton);

      // Form should be hidden
      expect(screen.queryByPlaceholderText('SKU-001')).not.toBeInTheDocument();
    });
  });

  // ============================================================================
  // UPDATE VARIANT TESTS
  // ============================================================================

  describe('Update Variant', () => {
    it('should enable edit mode when clicking edit button', async () => {
      const user = userEvent.setup();
      render(<VariantEditor productId="prod-1" />, { wrapper: createWrapper() });

      const rows = screen.getAllByRole('row');
      const firstVariantRow = rows[1]; // Skip header row

      // Hover to show edit button
      await user.hover(firstVariantRow);

      const editButton = within(firstVariantRow).getByRole('button', { name: /edit variant/i });
      await user.click(editButton);

      // Should show input fields
      const skuInput = screen.getByDisplayValue('SKU-001');
      expect(skuInput).toBeInTheDocument();
      expect(skuInput).toHaveAttribute('type', 'text');
    });

    it('should update variant with modified data', async () => {
      const user = userEvent.setup();
      mockUpdateMutation.mockResolvedValue({ data: mockVariants[0] });

      render(<VariantEditor productId="prod-1" />, { wrapper: createWrapper() });

      // Enter edit mode
      const rows = screen.getAllByRole('row');
      await user.hover(rows[1]);
      await user.click(within(rows[1]).getByRole('button', { name: /edit variant/i }));

      // Update price
      const priceInput = screen.getByDisplayValue('99.99');
      await user.clear(priceInput);
      await user.type(priceInput, '109.99');

      // Save
      await user.click(screen.getByRole('button', { name: /save/i }));

      await waitFor(() => {
        expect(mockUpdateMutation).toHaveBeenCalledWith({
          variantId: 'var-1',
          productId: 'prod-1',
          data: expect.objectContaining({
            price: 109.99,
          }),
        });
      });
    });

    it('should cancel editing', async () => {
      const user = userEvent.setup();
      render(<VariantEditor productId="prod-1" />, { wrapper: createWrapper() });

      const rows = screen.getAllByRole('row');
      await user.hover(rows[1]);
      await user.click(within(rows[1]).getByRole('button', { name: /edit variant/i }));

      // Modify data
      const priceInput = screen.getByDisplayValue('99.99');
      await user.clear(priceInput);
      await user.type(priceInput, '109.99');

      // Cancel
      await user.click(screen.getByRole('button', { name: /cancel/i }));

      // Should exit edit mode and revert changes
      expect(screen.queryByDisplayValue('109.99')).not.toBeInTheDocument();
      expect(screen.getByText('$99.99')).toBeInTheDocument();
    });
  });

  // ============================================================================
  // DELETE VARIANT TESTS
  // ============================================================================

  describe('Delete Variant', () => {
    it('should show confirmation dialog when deleting', async () => {
      const user = userEvent.setup();
      render(<VariantEditor productId="prod-1" />, { wrapper: createWrapper() });

      const rows = screen.getAllByRole('row');
      await user.hover(rows[1]);

      const deleteButton = within(rows[1]).getByRole('button', { name: /delete variant/i });
      await user.click(deleteButton);

      // Should show confirmation dialog
      expect(screen.getByText(/are you sure you want to delete this variant/i)).toBeInTheDocument();
    });

    it('should delete variant when confirmed', async () => {
      const user = userEvent.setup();
      mockDeleteMutation.mockResolvedValue({ data: undefined });

      render(<VariantEditor productId="prod-1" />, { wrapper: createWrapper() });

      const rows = screen.getAllByRole('row');
      await user.hover(rows[1]);
      await user.click(within(rows[1]).getByRole('button', { name: /delete variant/i }));

      // Confirm deletion
      const confirmButton = screen.getByRole('button', { name: /^delete$/i });
      await user.click(confirmButton);

      await waitFor(() => {
        expect(mockDeleteMutation).toHaveBeenCalledWith({
          variantId: 'var-1',
          productId: 'prod-1',
        });
      });

      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Variant deleted',
        })
      );
    });

    it('should cancel deletion', async () => {
      const user = userEvent.setup();
      render(<VariantEditor productId="prod-1" />, { wrapper: createWrapper() });

      const rows = screen.getAllByRole('row');
      await user.hover(rows[1]);
      await user.click(within(rows[1]).getByRole('button', { name: /delete variant/i }));

      // Cancel
      await user.click(screen.getByRole('button', { name: /cancel/i }));

      // Dialog should close
      expect(screen.queryByText(/are you sure you want to delete this variant/i)).not.toBeInTheDocument();
      expect(mockDeleteMutation).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // CSV EXPORT TESTS
  // ============================================================================

  describe('CSV Export', () => {
    it('should export variants to CSV', async () => {
      const user = userEvent.setup();

      // Mock URL.createObjectURL
      const mockCreateObjectURL = vi.fn(() => 'blob:mock-url');
      const mockRevokeObjectURL = vi.fn();
      global.URL.createObjectURL = mockCreateObjectURL;
      global.URL.revokeObjectURL = mockRevokeObjectURL;

      // Mock createElement and click
      const mockClick = vi.fn();
      const mockAnchor = { click: mockClick, href: '', download: '' };
      vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor as any);

      render(<VariantEditor productId="prod-1" />, { wrapper: createWrapper() });

      const exportButton = screen.getByRole('button', { name: /export csv/i });
      await user.click(exportButton);

      expect(mockCreateObjectURL).toHaveBeenCalled();
      expect(mockClick).toHaveBeenCalled();
      expect(mockAnchor.download).toBe('variants-prod-1.csv');

      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Export successful',
        })
      );
    });

    it('should disable export when no variants', () => {
      vi.mocked(variantHooks.useVariants).mockReturnValue({
        variants: [],
        isLoading: false,
        error: null,
        isEmpty: true,
        refetch: mockRefetch,
      } as any);

      render(<VariantEditor productId="prod-1" />, { wrapper: createWrapper() });

      const exportButton = screen.queryByRole('button', { name: /export csv/i });
      expect(exportButton).toBeNull(); // Button not shown in empty state
    });
  });

  // ============================================================================
  // CSV IMPORT TESTS
  // ============================================================================

  describe('CSV Import', () => {
    it('should open import dialog', async () => {
      const user = userEvent.setup();
      render(<VariantEditor productId="prod-1" />, { wrapper: createWrapper() });

      const importButton = screen.getByRole('button', { name: /import csv/i });
      await user.click(importButton);

      expect(screen.getByText(/import variants from csv/i)).toBeInTheDocument();
    });

    it('should import variants from CSV file', async () => {
      const user = userEvent.setup();
      mockBulkCreateMutation.mockResolvedValue({
        successful: 2,
        failed: 0,
        total: 2,
      });

      render(<VariantEditor productId="prod-1" />, { wrapper: createWrapper() });

      await user.click(screen.getByRole('button', { name: /import csv/i }));

      // Mock CSV file
      const csvContent = `SKU,Name,Price,Quantity,Availability Status,Options
SKU-003,Green Variant,79.99,15,in_stock,"{""color"":""Green""}"
SKU-004,Yellow Variant,69.99,20,in_stock,"{""color"":""Yellow""}"`;

      const file = new File([csvContent], 'variants.csv', { type: 'text/csv' });

      const fileInput = screen.getByLabelText(/csv file/i);
      await user.upload(fileInput, file);

      // Click import
      const importButtonInDialog = screen.getByRole('button', { name: /^import$/i });
      await user.click(importButtonInDialog);

      await waitFor(() => {
        expect(mockBulkCreateMutation).toHaveBeenCalledWith({
          productId: 'prod-1',
          variants: expect.arrayContaining([
            expect.objectContaining({ sku: 'SKU-003' }),
            expect.objectContaining({ sku: 'SKU-004' }),
          ]),
        });
      });
    });
  });

  // ============================================================================
  // KEYBOARD SHORTCUTS TESTS
  // ============================================================================

  describe('Keyboard Shortcuts', () => {
    it('should save on Cmd+Enter', async () => {
      const user = userEvent.setup();
      mockCreateMutation.mockResolvedValue({ data: { id: 'var-3' } });

      render(<VariantEditor productId="prod-1" />, { wrapper: createWrapper() });

      await user.click(screen.getByRole('button', { name: /add variant/i }));
      await user.type(screen.getByPlaceholderText('SKU-001'), 'SKU-003');

      // Cmd+Enter to save
      await user.keyboard('{Meta>}{Enter}{/Meta}');

      await waitFor(() => {
        expect(mockCreateMutation).toHaveBeenCalled();
      });
    });

    it('should cancel on Escape', async () => {
      const user = userEvent.setup();
      render(<VariantEditor productId="prod-1" />, { wrapper: createWrapper() });

      await user.click(screen.getByRole('button', { name: /add variant/i }));

      // Should show form
      expect(screen.getByPlaceholderText('SKU-001')).toBeInTheDocument();

      // Press Escape
      await user.keyboard('{Escape}');

      // Form should be hidden
      expect(screen.queryByPlaceholderText('SKU-001')).not.toBeInTheDocument();
    });
  });

  // ============================================================================
  // ERROR HANDLING TESTS
  // ============================================================================

  describe('Error Handling', () => {
    it('should show error toast when create fails', async () => {
      const user = userEvent.setup();
      mockCreateMutation.mockRejectedValue(new Error('SKU already exists'));

      render(<VariantEditor productId="prod-1" />, { wrapper: createWrapper() });

      await user.click(screen.getByRole('button', { name: /add variant/i }));
      await user.type(screen.getByPlaceholderText('SKU-001'), 'SKU-001');
      await user.click(screen.getByRole('button', { name: /save/i }));

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Failed to create variant',
            variant: 'destructive',
          })
        );
      });
    });

    it('should show error toast when update fails', async () => {
      const user = userEvent.setup();
      mockUpdateMutation.mockRejectedValue(new Error('Network error'));

      render(<VariantEditor productId="prod-1" />, { wrapper: createWrapper() });

      const rows = screen.getAllByRole('row');
      await user.hover(rows[1]);
      await user.click(within(rows[1]).getByRole('button', { name: /edit variant/i }));

      await user.click(screen.getByRole('button', { name: /save/i }));

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Failed to update variant',
            variant: 'destructive',
          })
        );
      });
    });

    it('should show error toast when delete fails', async () => {
      const user = userEvent.setup();
      mockDeleteMutation.mockRejectedValue(new Error('Cannot delete'));

      render(<VariantEditor productId="prod-1" />, { wrapper: createWrapper() });

      const rows = screen.getAllByRole('row');
      await user.hover(rows[1]);
      await user.click(within(rows[1]).getByRole('button', { name: /delete variant/i }));
      await user.click(screen.getByRole('button', { name: /^delete$/i }));

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Failed to delete variant',
            variant: 'destructive',
          })
        );
      });
    });
  });
});
