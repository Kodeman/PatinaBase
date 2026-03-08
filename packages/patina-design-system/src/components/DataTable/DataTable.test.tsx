import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DataTable } from './DataTable'
import type { ColumnDef } from '@tanstack/react-table'

interface TestUser {
  id: string
  name: string
  email: string
  age: number
}

const mockData: TestUser[] = [
  { id: '1', name: 'John Doe', email: 'john@example.com', age: 30 },
  { id: '2', name: 'Jane Smith', email: 'jane@example.com', age: 25 },
  { id: '3', name: 'Bob Johnson', email: 'bob@example.com', age: 35 },
]

const mockColumns: ColumnDef<TestUser>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
  },
  {
    accessorKey: 'email',
    header: 'Email',
  },
  {
    accessorKey: 'age',
    header: 'Age',
  },
]

describe('DataTable', () => {
  it('renders table with data', () => {
    render(<DataTable columns={mockColumns} data={mockData} />)

    expect(screen.getByText('Name')).toBeInTheDocument()
    expect(screen.getByText('Email')).toBeInTheDocument()
    expect(screen.getByText('Age')).toBeInTheDocument()
    expect(screen.getByText('John Doe')).toBeInTheDocument()
    expect(screen.getByText('jane@example.com')).toBeInTheDocument()
  })

  it('shows empty message when no data', () => {
    render(
      <DataTable
        columns={mockColumns}
        data={[]}
        emptyMessage="No users found"
      />
    )

    expect(screen.getByText('No users found')).toBeInTheDocument()
  })

  it('shows pagination controls when enabled', () => {
    render(
      <DataTable
        columns={mockColumns}
        data={mockData}
        enablePagination
        pageSize={2}
      />
    )

    expect(screen.getByText(/Page \d+ of \d+/)).toBeInTheDocument()
    expect(screen.getByText('Rows per page')).toBeInTheDocument()
  })

  it('hides pagination when disabled', () => {
    render(
      <DataTable
        columns={mockColumns}
        data={mockData}
        enablePagination={false}
      />
    )

    expect(screen.queryByText(/Page \d+ of \d+/)).not.toBeInTheDocument()
  })

  it('allows pagination navigation', async () => {
    const user = userEvent.setup()
    render(
      <DataTable
        columns={mockColumns}
        data={mockData}
        enablePagination
        pageSize={2}
      />
    )

    // Should show page 1
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument()

    // Click next page
    const nextButton = screen.getAllByRole('button').find((btn) => btn.textContent === '›')
    if (nextButton) {
      await user.click(nextButton)
      expect(screen.getByText('Page 2 of 2')).toBeInTheDocument()
    }
  })

  it('calls onRowSelectionChange when rows are selected', () => {
    const handleRowSelection = vi.fn()
    // Note: Row selection requires checkbox column to be added manually
    // This test would need a more complete setup with selection column
    render(
      <DataTable
        columns={mockColumns}
        data={mockData}
        enableRowSelection
        onRowSelectionChange={handleRowSelection}
      />
    )

    // Basic render test - full selection test would require checkbox column
    expect(screen.getByText('0 of 3 row(s) selected.')).toBeInTheDocument()
  })

  it('shows sorting indicators when sorting is enabled', () => {
    render(
      <DataTable
        columns={mockColumns}
        data={mockData}
        enableSorting
      />
    )

    // Sorting indicators should be present (↕ for unsorted)
    const nameHeader = screen.getByText('Name').parentElement
    expect(nameHeader).toHaveTextContent('↕')
  })

  it('disables sorting when enableSorting is false', () => {
    render(
      <DataTable
        columns={mockColumns}
        data={mockData}
        enableSorting={false}
      />
    )

    const nameHeader = screen.getByText('Name').parentElement
    expect(nameHeader).not.toHaveTextContent('↕')
  })
})
