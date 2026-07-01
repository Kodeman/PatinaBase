import * as React from 'react';
import { DataTable } from "@ds-stories/packages/patina-design-system/src/components/DataTable/DataTable";
import { Checkbox } from "@ds-stories/packages/patina-design-system/src/components/Checkbox/Checkbox";
import { Button } from "@ds-stories/packages/patina-design-system/src/components/Button/Button";

// OWNED preview for DataTable.
//
// The generated compose() preview threw `Cannot read properties of undefined
// (reading '0')` on every data-heavy story (Default/WithSorting/WithPagination/
// WithRowSelection/WithActions) — the same error the sb-reference throws for
// them (verdict: sb-error). Only DataTable errors in the whole bundle and it is
// the sole @tanstack/react-table consumer, so this is a tanstack-in-bundle
// render fault, not a data-delivery problem. This owned preview inlines the
// story fixtures verbatim and mounts the real component directly (no storybook
// import) to test whether explicit data avoids the fault. `Empty` (data=[])
// renders cleanly on both panels and is the one gradeable story.

type User = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: 'active' | 'inactive';
};

const data: User[] = [
  { id: '1', name: 'John Doe', email: 'john@example.com', role: 'Admin', status: 'active' },
  { id: '2', name: 'Jane Smith', email: 'jane@example.com', role: 'User', status: 'active' },
  { id: '3', name: 'Bob Johnson', email: 'bob@example.com', role: 'User', status: 'inactive' },
  { id: '4', name: 'Alice Williams', email: 'alice@example.com', role: 'Manager', status: 'active' },
  { id: '5', name: 'Charlie Brown', email: 'charlie@example.com', role: 'User', status: 'active' },
  { id: '6', name: 'Diana Prince', email: 'diana@example.com', role: 'Admin', status: 'active' },
  { id: '7', name: 'Ethan Hunt', email: 'ethan@example.com', role: 'User', status: 'inactive' },
  { id: '8', name: 'Fiona Apple', email: 'fiona@example.com', role: 'Manager', status: 'active' },
  { id: '9', name: 'George Martin', email: 'george@example.com', role: 'User', status: 'active' },
  { id: '10', name: 'Hannah Montana', email: 'hannah@example.com', role: 'User', status: 'inactive' },
  { id: '11', name: 'Ian Malcolm', email: 'ian@example.com', role: 'Admin', status: 'active' },
  { id: '12', name: 'Julia Roberts', email: 'julia@example.com', role: 'Manager', status: 'active' },
];

const basicColumns: any[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'email', header: 'Email' },
  { accessorKey: 'role', header: 'Role' },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }: any) => {
      const status = row.getValue('status') as string;
      return (
        <span
          className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
            status === 'active'
              ? 'bg-green-100 text-green-800'
              : 'bg-gray-100 text-gray-800'
          }`}
        >
          {status}
        </span>
      );
    },
  },
];

const columnsWithSelection: any[] = [
  {
    id: 'select',
    header: ({ table }: any) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        onCheckedChange={(value: any) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }: any) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value: any) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  ...basicColumns,
];

const columnsWithActions: any[] = [
  ...basicColumns,
  {
    id: 'actions',
    header: 'Actions',
    cell: () => (
      <div className="flex gap-2">
        <Button size="sm" variant="outline">
          Edit
        </Button>
        <Button size="sm" variant="outline">
          Delete
        </Button>
      </div>
    ),
  },
];

// Data-heavy tables get a fixed width so the full-bleed preview page does not
// balloon them; the reference errors on these anyway (sb-error) so width is
// cosmetic. Empty stays full-width to keep parity with the reference render.
const box = (w: number, node: React.ReactNode) => () =>
  React.createElement('div', { style: { width: w, maxWidth: '100%', margin: '0 auto' } }, node);

export const Default = box(820, <DataTable columns={basicColumns} data={data} />);

export const WithSorting = box(820, <DataTable columns={basicColumns} data={data} enableSorting />);

export const WithPagination = box(
  820,
  <DataTable columns={basicColumns} data={data} enablePagination pageSize={5} />,
);

export const WithRowSelection = box(
  820,
  <DataTable
    columns={columnsWithSelection}
    data={data}
    enableRowSelection
    enablePagination
    pageSize={5}
  />,
);

export const WithActions = box(
  820,
  <DataTable
    columns={columnsWithActions}
    data={data}
    enableSorting
    enablePagination
    pageSize={5}
  />,
);

export const Empty = () => (
  <DataTable
    columns={basicColumns}
    data={[]}
    emptyMessage="No users found. Try adjusting your filters."
  />
);

export const SmallSize = box(
  820,
  <DataTable columns={basicColumns} data={data} size="sm" enablePagination pageSize={5} />,
);

export const LargeSize = box(
  820,
  <DataTable columns={basicColumns} data={data} size="lg" enablePagination pageSize={5} />,
);

export const AllFeatures = box(
  820,
  <DataTable
    columns={columnsWithSelection}
    data={data}
    enableSorting
    enableFiltering
    enablePagination
    enableRowSelection
    enableColumnVisibility
    pageSize={5}
  />,
);
