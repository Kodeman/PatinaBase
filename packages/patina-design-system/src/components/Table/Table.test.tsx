import { render, screen } from '@testing-library/react'
import { axe } from 'vitest-axe'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
} from './Table'

describe('Table', () => {
  const TableExample = () => (
    <Table>
      <TableCaption>Test table</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Email</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>John Doe</TableCell>
          <TableCell>john@example.com</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>Jane Smith</TableCell>
          <TableCell>jane@example.com</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  )

  it('renders table correctly', () => {
    const { container } = render(<TableExample />)
    expect(container.querySelector('table')).toBeInTheDocument()
  })

  it('renders table headers', () => {
    render(<TableExample />)
    expect(screen.getByText('Name')).toBeInTheDocument()
    expect(screen.getByText('Email')).toBeInTheDocument()
  })

  it('renders table data', () => {
    render(<TableExample />)
    expect(screen.getByText('John Doe')).toBeInTheDocument()
    expect(screen.getByText('john@example.com')).toBeInTheDocument()
  })

  it('renders caption', () => {
    render(<TableExample />)
    expect(screen.getByText('Test table')).toBeInTheDocument()
  })

  it('applies sticky header when specified', () => {
    render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead sticky>Sticky Header</TableHead>
          </TableRow>
        </TableHeader>
      </Table>
    )
    expect(screen.getByText('Sticky Header')).toHaveClass('sticky')
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<TableExample />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
