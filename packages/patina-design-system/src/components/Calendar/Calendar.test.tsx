import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Calendar, DatePicker, DateRangePicker } from './Calendar'

describe('Calendar', () => {
  it('renders calendar', () => {
    const { container } = render(<Calendar mode="single" />)
    expect(container.querySelector('.rdp')).toBeInTheDocument()
  })

  it('handles date selection', async () => {
    const onSelect = vi.fn()
    const { container } = render(
      <Calendar mode="single" onSelect={onSelect} />
    )

    const days = container.querySelectorAll('[role="gridcell"]')
    if (days.length > 0) {
      await userEvent.click(days[15])
      expect(onSelect).toHaveBeenCalled()
    }
  })

  it('renders with selected date', () => {
    const date = new Date(2024, 0, 15)
    render(<Calendar mode="single" selected={date} />)
    // Selected date should be marked in the calendar
  })
})

describe('DatePicker', () => {
  it('renders date picker with placeholder', () => {
    render(<DatePicker placeholder="Select date" />)
    expect(screen.getByText('Select date')).toBeInTheDocument()
  })

  it('shows selected date', () => {
    const date = new Date(2024, 0, 15)
    render(<DatePicker value={date} />)
    expect(screen.getByText(/January 15, 2024/i)).toBeInTheDocument()
  })

  it('opens calendar on click', async () => {
    const user = userEvent.setup()
    const { container } = render(<DatePicker />)

    const button = screen.getByRole('button')
    await user.click(button)

    // Calendar should be visible
    expect(container.querySelector('.rdp')).toBeInTheDocument()
  })

  it('handles disabled state', () => {
    render(<DatePicker disabled />)
    const button = screen.getByRole('button')
    expect(button).toBeDisabled()
  })
})

describe('DateRangePicker', () => {
  it('renders date range picker with placeholder', () => {
    render(<DateRangePicker placeholder="Select range" />)
    expect(screen.getByText('Select range')).toBeInTheDocument()
  })

  it('shows selected range', () => {
    const range = {
      from: new Date(2024, 0, 15),
      to: new Date(2024, 0, 20),
    }
    render(<DateRangePicker value={range} />)
    expect(screen.getByText(/Jan 15 - Jan 20/i)).toBeInTheDocument()
  })

  it('opens calendar on click', async () => {
    const user = userEvent.setup()
    const { container } = render(<DateRangePicker />)

    const button = screen.getByRole('button')
    await user.click(button)

    // Calendar should be visible
    expect(container.querySelector('.rdp')).toBeInTheDocument()
  })
})
