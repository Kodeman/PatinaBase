'use client';

import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  MoreHorizontal,
  AlertCircle,
  CheckCircle2,
  Edit,
  Copy,
  Trash2,
  Eye,
  ArrowUpDown,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import Image from 'next/image';
import type { ProductListItem } from '@/types';
import type { AdminCatalogPresenter } from '@/features/catalog/hooks/useAdminCatalogPresenter';
import { useMemo } from 'react';

interface AdminProductTableProps {
  products: ProductListItem[];
  presenter: AdminCatalogPresenter;
}

export function AdminProductTable({ products, presenter }: AdminProductTableProps) {
  // Get status badge variant
  const getStatusVariant = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
      published: 'default',
      draft: 'secondary',
      in_review: 'outline',
      deprecated: 'destructive',
    };
    return variants[status] || 'secondary';
  };

  // Format price
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(price);
  };

  // Format date
  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Define columns
  const columns = useMemo<ColumnDef<ProductListItem>[]>(
    () => [
      {
        id: 'select',
        header: ({ table }) => (
          <Checkbox
            checked={table.getIsAllPageRowsSelected()}
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
            aria-label="Select all"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="Select row"
          />
        ),
        enableSorting: false,
        enableHiding: false,
      },
      {
        accessorKey: 'imageUrl',
        header: 'Image',
        cell: ({ row }) => {
          const imageUrl = row.getValue('imageUrl') as string | null;
          return (
            <div className="relative w-12 h-12 bg-gray-100 rounded">
              {imageUrl ? (
                <Image
                  src={imageUrl}
                  alt={row.original.name}
                  fill
                  className="object-cover rounded"
                  sizes="48px"
                />
              ) : (
                <div className="flex items-center justify-center h-full text-gray-400 text-xs">
                  No img
                </div>
              )}
            </div>
          );
        },
        enableSorting: false,
      },
      {
        accessorKey: 'name',
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
              className="-ml-4"
            >
              Product
              <ArrowUpDown className="ml-2 h-4 w-4" />
            </Button>
          );
        },
        cell: ({ row }) => {
          const name = row.getValue('name') as string;
          const brand = row.original.brand;
          return (
            <div className="max-w-xs">
              <div className="font-medium truncate" aria-label={name}>
                {name}
              </div>
              {brand && <div className="text-sm text-gray-500 truncate">{brand}</div>}
            </div>
          );
        },
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const status = row.getValue('status') as string;
          return (
            <Badge variant={getStatusVariant(status)} className="capitalize">
              {status}
            </Badge>
          );
        },
      },
      {
        accessorKey: 'price',
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
              className="-ml-4"
            >
              Price
              <ArrowUpDown className="ml-2 h-4 w-4" />
            </Button>
          );
        },
        cell: ({ row }) => {
          const price = row.getValue('price') as number;
          return <div className="font-medium">{formatPrice(price)}</div>;
        },
      },
      {
        accessorKey: 'categoryName',
        header: 'Category',
        cell: ({ row }) => {
          const category = row.getValue('categoryName') as string | null;
          return (
            <div className="max-w-[150px] truncate" aria-label={category || undefined}>
              {category || <span className="text-gray-400">-</span>}
            </div>
          );
        },
      },
      {
        accessorKey: 'variantCount',
        header: 'Variants',
        cell: ({ row }) => {
          const count = row.getValue('variantCount') as number;
          return <div className="text-center">{count || 0}</div>;
        },
      },
      {
        id: 'features',
        header: 'Features',
        cell: ({ row }) => {
          const has3D = row.original.has3D;
          const arSupported = row.original.arSupported;
          const hasIssues = row.original.hasValidationIssues;

          return (
            <div className="flex items-center gap-1">
              {has3D && (
                <Badge variant="secondary" className="text-xs">
                  3D
                </Badge>
              )}
              {arSupported && (
                <Badge variant="secondary" className="text-xs">
                  AR
                </Badge>
              )}
              {hasIssues ? (
                <AlertCircle className="h-4 w-4 text-red-500" aria-label="Has validation issues" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-green-500" aria-label="No issues" />
              )}
            </div>
          );
        },
      },
      {
        accessorKey: 'updatedAt',
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
              className="-ml-4"
            >
              Updated
              <ArrowUpDown className="ml-2 h-4 w-4" />
            </Button>
          );
        },
        cell: ({ row }) => {
          const date = row.getValue('updatedAt') as string;
          return <div className="text-sm text-gray-600">{formatDate(date)}</div>;
        },
      },
      {
        id: 'actions',
        enableHiding: false,
        cell: ({ row }) => {
          const product = row.original;

          return (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  // TODO: Open product detail modal
                  console.log('View product:', product.id);
                }}
              >
                <Eye className="h-4 w-4" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <span className="sr-only">Open menu</span>
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem>
                    <Edit className="mr-2 h-4 w-4" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Copy className="mr-2 h-4 w-4" />
                    Duplicate
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {product.status === 'published' ? (
                    <DropdownMenuItem>Unpublish</DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem>Publish</DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-red-600">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      },
    ],
    []
  );

  const table = useReactTable({
    data: products,
    columns,
    getCoreRowModel: getCoreRowModel(),
    onRowSelectionChange: (updater) => {
      // TODO: Sync selection with presenter
      console.log('Selection changed:', updater);
    },
    state: {
      rowSelection: {}, // TODO: Sync with presenter.bulkSelection
    },
  });

  return (
    <div className="rounded-md border bg-white">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b bg-gray-50">
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-4 py-3 text-left text-sm font-medium text-gray-700"
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b hover:bg-gray-50 transition-colors"
                  data-state={row.getIsSelected() && 'selected'}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="h-24 text-center">
                  <div className="text-gray-500">No products found</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
