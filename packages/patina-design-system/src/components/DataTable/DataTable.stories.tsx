import type { Meta, StoryObj } from '@storybook/react'
import { DataTable } from './DataTable'
import type { ColumnDef } from '@tanstack/react-table'
import { Checkbox } from '../Checkbox'
import { Button } from '../Button'

interface User {
  id: string
  name: string
  email: string
  role: string
  status: 'active' | 'inactive'
}

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
]

const basicColumns: ColumnDef<User>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
  },
  {
    accessorKey: 'email',
    header: 'Email',
  },
  {
    accessorKey: 'role',
    header: 'Role',
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => {
      const status = row.getValue('status') as string
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
      )
    },
  },
]

const columnsWithSelection: ColumnDef<User>[] = [
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
  ...basicColumns,
]

const columnsWithActions: ColumnDef<User>[] = [
  ...basicColumns,
  {
    id: 'actions',
    header: 'Actions',
    cell: ({ row }) => (
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
]

const meta: Meta<typeof DataTable> = {
  title: 'Data Display/DataTable',
  component: DataTable,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'A powerful data table component built with TanStack Table. Supports sorting, filtering, pagination, row selection, and more.',
      },
    },
  },
}

export default meta
type Story = StoryObj<typeof DataTable>

export const Default: Story = {
  args: {
    columns: basicColumns,
    data: data,
  },
}

export const WithSorting: Story = {
  args: {
    columns: basicColumns,
    data: data,
    enableSorting: true,
  },
  parameters: {
    docs: {
      description: {
        story: 'Click on column headers to sort the data.',
      },
    },
  },
}

export const WithPagination: Story = {
  args: {
    columns: basicColumns,
    data: data,
    enablePagination: true,
    pageSize: 5,
  },
  parameters: {
    docs: {
      description: {
        story: 'Navigate through pages of data with pagination controls.',
      },
    },
  },
}

export const WithRowSelection: Story = {
  args: {
    columns: columnsWithSelection,
    data: data,
    enableRowSelection: true,
    enablePagination: true,
    pageSize: 5,
  },
  parameters: {
    docs: {
      description: {
        story: 'Select individual rows or all rows with checkboxes.',
      },
    },
  },
}

export const WithActions: Story = {
  args: {
    columns: columnsWithActions,
    data: data,
    enableSorting: true,
    enablePagination: true,
    pageSize: 5,
  },
  parameters: {
    docs: {
      description: {
        story: 'Add action buttons for each row.',
      },
    },
  },
}

export const Empty: Story = {
  args: {
    columns: basicColumns,
    data: [],
    emptyMessage: 'No users found. Try adjusting your filters.',
  },
}

export const SmallSize: Story = {
  args: {
    columns: basicColumns,
    data: data,
    size: 'sm',
    enablePagination: true,
    pageSize: 5,
  },
}

export const LargeSize: Story = {
  args: {
    columns: basicColumns,
    data: data,
    size: 'lg',
    enablePagination: true,
    pageSize: 5,
  },
}

export const AllFeatures: Story = {
  args: {
    columns: columnsWithSelection,
    data: data,
    enableSorting: true,
    enableFiltering: true,
    enablePagination: true,
    enableRowSelection: true,
    enableColumnVisibility: true,
    pageSize: 5,
    onRowSelectionChange: (selectedRows) => {
      console.log('Selected rows:', selectedRows)
    },
  },
  parameters: {
    docs: {
      description: {
        story: 'All features enabled: sorting, filtering, pagination, row selection, and column visibility.',
      },
    },
  },
}
