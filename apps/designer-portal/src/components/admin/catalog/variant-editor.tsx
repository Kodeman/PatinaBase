/**
 * VariantEditor Component
 *
 * Advanced inline editing table for managing product variants with:
 * - Inline row editing with keyboard shortcuts
 * - Add/Edit/Delete operations
 * - Bulk CSV import
 * - Real-time validation
 * - Optimistic updates
 * - Loading states and error handling
 *
 * @module components/catalog/variant-editor
 */

'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Plus,
  Trash2,
  Edit3,
  Save,
  X,
  Upload,
  Download,
  Loader2,
  AlertCircle,
  CheckCircle2,
  FileSpreadsheet,
} from 'lucide-react';

// Hooks
import {
  useVariants,
  useCreateVariant,
  useUpdateVariant,
  useDeleteVariant,
  useBulkCreateVariants,
} from '@/hooks/admin/use-variants';

// CSV Utilities
import { generateCSV, parseCSV, downloadCSV, validateCSVStructure } from '@/lib/admin/csv-utils';

// UI Components
import {
  Button,
  Input,
  Label,
  Skeleton,
  useToast
} from '@patina/design-system';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@patina/design-system';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@patina/design-system';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@patina/design-system';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@patina/design-system';

// Types
import type { Variant, AvailabilityStatus } from '@patina/types';

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const variantSchema = z.object({
  sku: z.string().min(1, 'SKU is required').max(100, 'SKU too long'),
  name: z.string().optional(),
  barcode: z.string().optional(),
  price: z.number().min(0, 'Price must be positive').optional(),
  quantity: z.number().int('Must be an integer').min(0, 'Stock cannot be negative').optional(),
  availabilityStatus: z.enum(['in_stock', 'out_of_stock', 'preorder', 'discontinued', 'backorder']),
  options: z.record(z.string(), z.string()),
});

type VariantFormData = z.infer<typeof variantSchema>;

// ============================================================================
// TYPES
// ============================================================================

interface VariantEditorProps {
  productId: string;
  onVariantsChange?: (variants: Variant[]) => void;
}

interface EditingVariant extends Partial<Variant> {
  isNew?: boolean;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function VariantEditor({ productId, onVariantsChange }: VariantEditorProps) {
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showImportDialog, setShowImportDialog] = useState(false);

  // Fetch variants
  const { variants, isLoading, error, refetch } = useVariants(productId);

  // Mutations
  const createVariantMutation = useCreateVariant();
  const updateVariantMutation = useUpdateVariant();
  const deleteVariantMutation = useDeleteVariant();
  const bulkCreateMutation = useBulkCreateVariants();

  // Notify parent of changes
  useEffect(() => {
    if (onVariantsChange && variants) {
      onVariantsChange(variants);
    }
  }, [variants, onVariantsChange]);

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const handleAddNew = useCallback(() => {
    setIsAddingNew(true);
    setEditingId(null);
  }, []);

  const handleEdit = useCallback((variantId: string) => {
    setEditingId(variantId);
    setIsAddingNew(false);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
    setIsAddingNew(false);
  }, []);

  const handleSaveNew = useCallback(
    async (data: VariantFormData) => {
      try {
        await createVariantMutation.mutateAsync({
          productId,
          data: {
            ...data,
            productId,
          },
        });

        toast({
          title: 'Variant created',
          description: `SKU ${data.sku} has been added successfully.`,
        });

        setIsAddingNew(false);
      } catch (error) {
        toast({
          title: 'Failed to create variant',
          description: error instanceof Error ? error.message : 'An error occurred',
          variant: 'destructive',
        });
      }
    },
    [productId, createVariantMutation, toast]
  );

  const handleSaveEdit = useCallback(
    async (variantId: string, data: VariantFormData) => {
      try {
        await updateVariantMutation.mutateAsync({
          variantId,
          productId,
          data,
        });

        toast({
          title: 'Variant updated',
          description: `SKU ${data.sku} has been updated successfully.`,
        });

        setEditingId(null);
      } catch (error) {
        toast({
          title: 'Failed to update variant',
          description: error instanceof Error ? error.message : 'An error occurred',
          variant: 'destructive',
        });
      }
    },
    [productId, updateVariantMutation, toast]
  );

  const handleDelete = useCallback(
    async (variantId: string) => {
      try {
        const variant = variants.find(v => v.id === variantId);

        await deleteVariantMutation.mutateAsync({
          variantId,
          productId,
        });

        toast({
          title: 'Variant deleted',
          description: `SKU ${variant?.sku || ''} has been deleted.`,
        });

        setDeleteConfirmId(null);
      } catch (error) {
        toast({
          title: 'Failed to delete variant',
          description: error instanceof Error ? error.message : 'An error occurred',
          variant: 'destructive',
        });
      }
    },
    [productId, variants, deleteVariantMutation, toast]
  );

  const handleExportCSV = useCallback(() => {
    if (variants.length === 0) {
      toast({
        title: 'No variants to export',
        description: 'Add variants before exporting.',
        variant: 'destructive',
      });
      return;
    }

    // Generate CSV content with sanitization to prevent formula injection
    const headers = ['SKU', 'Name', 'Barcode', 'Price', 'Quantity', 'Availability Status', 'Options'];
    const rows = variants.map(v => [
      v.sku,
      v.name || '',
      v.barcode || '',
      v.price?.toString() || '',
      v.quantity?.toString() || '',
      v.availabilityStatus,
      JSON.stringify(v.options),
    ]);

    // Use secure CSV generation with automatic sanitization
    const csv = generateCSV(headers, rows);

    // Download CSV with proper cleanup
    downloadCSV(csv, `variants-${productId}`);

    toast({
      title: 'Export successful',
      description: `Exported ${variants.length} variants to CSV.`,
    });
  }, [variants, productId, toast]);

  // ============================================================================
  // RENDER
  // ============================================================================

  if (isLoading) {
    return <VariantEditorSkeleton />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4 border-2 border-dashed rounded-lg">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <p className="text-muted-foreground">Failed to load variants</p>
        <Button onClick={() => refetch()} variant="outline">
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header Actions */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Product Variants</h3>
          <p className="text-sm text-muted-foreground">
            Manage SKUs, pricing, and inventory for product variations.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            disabled={variants.length === 0}
          >
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowImportDialog(true)}
          >
            <Upload className="mr-2 h-4 w-4" />
            Import CSV
          </Button>

          <Button
            onClick={handleAddNew}
            disabled={isAddingNew}
            size="sm"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Variant
          </Button>
        </div>
      </div>

      {/* Variants Table */}
      {variants.length === 0 && !isAddingNew ? (
        <EmptyVariantsState onAddFirst={handleAddNew} />
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[180px]">SKU</TableHead>
                <TableHead className="w-[150px]">Name</TableHead>
                <TableHead className="w-[150px]">Options</TableHead>
                <TableHead className="w-[120px]">Price</TableHead>
                <TableHead className="w-[100px]">Stock</TableHead>
                <TableHead className="w-[150px]">Availability</TableHead>
                <TableHead className="w-[100px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* Add New Row */}
              {isAddingNew && (
                <VariantRowEdit
                  key="new-variant"
                  isNew
                  onSave={handleSaveNew}
                  onCancel={handleCancelEdit}
                  existingSkus={variants.map(v => v.sku)}
                />
              )}

              {/* Existing Variants */}
              {variants.map(variant => (
                editingId === variant.id ? (
                  <VariantRowEdit
                    key={variant.id}
                    variant={variant}
                    onSave={(data) => handleSaveEdit(variant.id, data)}
                    onCancel={handleCancelEdit}
                    existingSkus={variants.filter(v => v.id !== variant.id).map(v => v.sku)}
                  />
                ) : (
                  <VariantRowDisplay
                    key={variant.id}
                    variant={variant}
                    onEdit={() => handleEdit(variant.id)}
                    onDelete={() => setDeleteConfirmId(variant.id)}
                  />
                )
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Import Dialog */}
      <ImportCSVDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        productId={productId}
        existingSkus={variants.map(v => v.sku)}
        onImportComplete={() => {
          setShowImportDialog(false);
          refetch();
        }}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Variant</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this variant? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

/**
 * Display mode for variant row
 */
interface VariantRowDisplayProps {
  variant: Variant;
  onEdit: () => void;
  onDelete: () => void;
}

function VariantRowDisplay({ variant, onEdit, onDelete }: VariantRowDisplayProps) {
  const getStatusBadgeColor = (status: AvailabilityStatus) => {
    switch (status) {
      case 'in_stock':
        return 'bg-green-100 text-green-800';
      case 'out_of_stock':
        return 'bg-red-100 text-red-800';
      case 'preorder':
        return 'bg-blue-100 text-blue-800';
      case 'backorder':
        return 'bg-yellow-100 text-yellow-800';
      case 'discontinued':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <TableRow className="group hover:bg-muted/50">
      <TableCell className="font-mono text-sm">{variant.sku}</TableCell>
      <TableCell className="text-sm">{variant.name || '—'}</TableCell>
      <TableCell className="text-sm">
        {Object.entries(variant.options || {}).length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {Object.entries(variant.options).map(([key, value]) => (
              <span
                key={key}
                className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-muted"
              >
                {key}: {value}
              </span>
            ))}
          </div>
        ) : (
          '—'
        )}
      </TableCell>
      <TableCell className="text-sm">
        {variant.price ? `$${variant.price.toFixed(2)}` : '—'}
      </TableCell>
      <TableCell className="text-sm">{variant.quantity ?? '—'}</TableCell>
      <TableCell>
        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusBadgeColor(variant.availabilityStatus)}`}>
          {variant.availabilityStatus.replace('_', ' ')}
        </span>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="sm"
            onClick={onEdit}
            className="h-8 w-8 p-0"
          >
            <Edit3 className="h-4 w-4" />
            <span className="sr-only">Edit variant</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            className="h-8 w-8 p-0 text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
            <span className="sr-only">Delete variant</span>
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

/**
 * Edit mode for variant row
 */
interface VariantRowEditProps {
  variant?: Variant;
  isNew?: boolean;
  onSave: (data: VariantFormData) => void | Promise<void>;
  onCancel: () => void;
  existingSkus: string[];
}

function VariantRowEdit({ variant, isNew, onSave, onCancel, existingSkus }: VariantRowEditProps) {
  const { register, handleSubmit, formState: { errors }, setValue, watch } = useForm<VariantFormData>({
    resolver: zodResolver(variantSchema),
    defaultValues: {
      sku: variant?.sku || '',
      name: variant?.name || '',
      barcode: variant?.barcode || '',
      price: variant?.price,
      quantity: variant?.quantity ?? 0,
      availabilityStatus: variant?.availabilityStatus || 'in_stock',
      options: variant?.options || {},
    },
  });

  const [isSaving, setIsSaving] = useState(false);
  const [optionsText, setOptionsText] = useState(
    variant?.options ? JSON.stringify(variant.options) : '{}'
  );

  const onSubmit = async (data: VariantFormData) => {
    // Validate SKU uniqueness
    if (existingSkus.includes(data.sku)) {
      return;
    }

    // Parse options
    try {
      data.options = JSON.parse(optionsText);
    } catch (e) {
      return;
    }

    setIsSaving(true);
    try {
      await onSave(data);
    } finally {
      setIsSaving(false);
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        handleSubmit(onSubmit)();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSubmit, onCancel, onSubmit]);

  return (
    <TableRow className="bg-blue-50/50">
      <TableCell>
        <Input
          {...register('sku')}
          placeholder="SKU-001"
          className="h-8 font-mono text-sm"
          autoFocus={isNew}
        />
        {errors.sku && (
          <p className="text-xs text-destructive mt-1">{errors.sku.message}</p>
        )}
      </TableCell>
      <TableCell>
        <Input
          {...register('name')}
          placeholder="Variant name"
          className="h-8 text-sm"
        />
      </TableCell>
      <TableCell>
        <Input
          value={optionsText}
          onChange={(e) => setOptionsText(e.target.value)}
          placeholder='{"color": "Red"}'
          className="h-8 text-sm font-mono"
        />
      </TableCell>
      <TableCell>
        <Input
          {...register('price', { valueAsNumber: true })}
          type="number"
          step="0.01"
          placeholder="0.00"
          className="h-8 text-sm"
        />
        {errors.price && (
          <p className="text-xs text-destructive mt-1">{errors.price.message}</p>
        )}
      </TableCell>
      <TableCell>
        <Input
          {...register('quantity', { valueAsNumber: true })}
          type="number"
          placeholder="0"
          className="h-8 text-sm"
        />
        {errors.quantity && (
          <p className="text-xs text-destructive mt-1">{errors.quantity.message}</p>
        )}
      </TableCell>
      <TableCell>
        <Select
          defaultValue={variant?.availabilityStatus || 'in_stock'}
          onValueChange={(value: string) => setValue('availabilityStatus', value as AvailabilityStatus)}
        >
          <SelectTrigger className="h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="in_stock">In Stock</SelectItem>
            <SelectItem value="out_of_stock">Out of Stock</SelectItem>
            <SelectItem value="preorder">Preorder</SelectItem>
            <SelectItem value="backorder">Backorder</SelectItem>
            <SelectItem value="discontinued">Discontinued</SelectItem>
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleSubmit(onSubmit)}
            disabled={isSaving}
            className="h-8 w-8 p-0"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4 text-green-600" />
            )}
            <span className="sr-only">Save</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={isSaving}
            className="h-8 w-8 p-0"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Cancel</span>
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

/**
 * Empty state when no variants exist
 */
function EmptyVariantsState({ onAddFirst }: { onAddFirst: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed rounded-lg">
      <FileSpreadsheet className="h-12 w-12 text-muted-foreground mb-4" />
      <p className="text-muted-foreground mb-4">No variants yet</p>
      <Button onClick={onAddFirst} variant="outline">
        <Plus className="mr-2 h-4 w-4" />
        Create First Variant
      </Button>
    </div>
  );
}

/**
 * Loading skeleton
 */
function VariantEditorSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-6 w-48 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-32" />
        </div>
      </div>
      <div className="border rounded-lg p-4 space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    </div>
  );
}

/**
 * CSV Import Dialog
 */
interface ImportCSVDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  existingSkus: string[];
  onImportComplete: () => void;
}

function ImportCSVDialog({
  open,
  onOpenChange,
  productId,
  existingSkus,
  onImportComplete,
}: ImportCSVDialogProps) {
  const { toast } = useToast();
  const bulkCreateMutation = useBulkCreateVariants();
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (!selectedFile.name.endsWith('.csv')) {
        toast({
          title: 'Invalid file type',
          description: 'Please select a CSV file.',
          variant: 'destructive',
        });
        return;
      }
      setFile(selectedFile);
    }
  };

  const parseVariantsFromCSV = (text: string): Partial<Variant>[] => {
    // Use secure CSV parser
    const rows = parseCSV(text);

    if (rows.length < 2) {
      return [];
    }

    // Validate CSV structure
    const validation = validateCSVStructure(rows);
    if (!validation.valid) {
      toast({
        title: 'Invalid CSV structure',
        description: validation.error,
        variant: 'destructive',
      });
      return [];
    }

    const headers = rows[0].map(h => h.trim().toLowerCase());
    const variants: Partial<Variant>[] = [];

    for (let i = 1; i < rows.length; i++) {
      const values = rows[i];
      const variant: Partial<Variant> = {
        availabilityStatus: 'in_stock',
        options: {},
      };

      headers.forEach((header, index) => {
        const value = values[index]?.trim();
        if (!value) return;

        // Remove leading single quote if present (CSV injection protection marker)
        const cleanValue = value.startsWith("'") ? value.substring(1) : value;

        switch (header) {
          case 'sku':
            variant.sku = cleanValue;
            break;
          case 'name':
            variant.name = cleanValue;
            break;
          case 'barcode':
            variant.barcode = cleanValue;
            break;
          case 'price':
            const priceValue = parseFloat(cleanValue);
            if (!isNaN(priceValue)) {
              variant.price = priceValue;
            }
            break;
          case 'quantity':
            const qtyValue = parseInt(cleanValue, 10);
            if (!isNaN(qtyValue)) {
              variant.quantity = qtyValue;
            }
            break;
          case 'availability status':
          case 'availabilitystatus':
            variant.availabilityStatus = cleanValue as AvailabilityStatus;
            break;
          case 'options':
            try {
              variant.options = JSON.parse(cleanValue);
            } catch (e) {
              // Ignore invalid JSON
            }
            break;
        }
      });

      if (variant.sku) {
        variants.push(variant);
      }
    }

    return variants;
  };

  const handleImport = async () => {
    if (!file) return;

    setIsProcessing(true);

    try {
      const text = await file.text();
      const variants = parseVariantsFromCSV(text);

      if (variants.length === 0) {
        toast({
          title: 'No variants found',
          description: 'The CSV file does not contain valid variant data.',
          variant: 'destructive',
        });
        setIsProcessing(false);
        return;
      }

      // Filter out duplicates
      const uniqueVariants = variants.filter(v => !existingSkus.includes(v.sku!));

      if (uniqueVariants.length === 0) {
        toast({
          title: 'No new variants',
          description: 'All SKUs in the CSV already exist.',
          variant: 'destructive',
        });
        setIsProcessing(false);
        return;
      }

      const result = await bulkCreateMutation.mutateAsync({
        productId,
        variants: uniqueVariants,
      });

      toast({
        title: 'Import complete',
        description: `Successfully imported ${result.successful} of ${result.total} variants.`,
      });

      onImportComplete();
      setFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      toast({
        title: 'Import failed',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import Variants from CSV</DialogTitle>
          <DialogDescription>
            Upload a CSV file with variant data. Expected columns: SKU, Name, Barcode, Price, Quantity, Availability Status, Options.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="csv-file">CSV File</Label>
            <Input
              ref={fileInputRef}
              id="csv-file"
              type="file"
              accept=".csv"
              onChange={handleFileChange}
            />
          </div>

          {file && (
            <div className="p-3 bg-muted rounded-md flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
              <div className="flex-1">
                <p className="text-sm font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(file.size / 1024).toFixed(2)} KB
                </p>
              </div>
            </div>
          )}

          <div className="p-4 bg-blue-50 border border-blue-200 rounded-md">
            <p className="text-sm text-blue-900 font-medium mb-2">CSV Format Example:</p>
            <pre className="text-xs bg-white p-2 rounded border overflow-x-auto">
              {`SKU,Name,Price,Quantity,Availability Status,Options
SKU-001,Red Variant,99.99,10,in_stock,"{""color"":""Red""}"`}
            </pre>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              setFile(null);
              if (fileInputRef.current) {
                fileInputRef.current.value = '';
              }
            }}
            disabled={isProcessing}
          >
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={!file || isProcessing}
          >
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Import
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
