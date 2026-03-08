'use client'

import * as React from 'react'
import { DayPicker } from 'react-day-picker'
import type { DayPickerSingleProps, DayPickerRangeProps, DayPickerMultipleProps } from 'react-day-picker'
import { cn } from '../../utils/cn'
import { Icon } from '../Icon'
import 'react-day-picker/dist/style.css'

export type CalendarProps =
  | (Omit<DayPickerSingleProps, 'className'> & { className?: string; showOutsideDays?: boolean })
  | (Omit<DayPickerRangeProps, 'className'> & { className?: string; showOutsideDays?: boolean })
  | (Omit<DayPickerMultipleProps, 'className'> & { className?: string; showOutsideDays?: boolean })

/**
 * Calendar component using react-day-picker
 * Supports single date, multiple dates, and date range selection
 *
 * @example
 * ```tsx
 * <Calendar
 *   mode="single"
 *   selected={date}
 *   onSelect={setDate}
 * />
 * ```
 */
export const Calendar = React.forwardRef<HTMLDivElement, any>(
  ({ className, showOutsideDays = true, ...props }, ref) => {
    return (
      <div ref={ref} className={cn('p-3', className)}>
        <DayPicker
          showOutsideDays={showOutsideDays}
          className={cn('border-0')}
          classNames={{
            months: 'flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0',
            month: 'space-y-4',
            caption: 'flex justify-center pt-1 relative items-center',
            caption_label: 'text-sm font-medium',
            nav: 'space-x-1 flex items-center',
            nav_button: cn(
              'h-7 w-7 bg-transparent p-0 hover:bg-accent hover:text-accent-foreground rounded-md inline-flex items-center justify-center'
            ),
            nav_button_previous: 'absolute left-1',
            nav_button_next: 'absolute right-1',
            table: 'w-full border-collapse space-y-1',
            head_row: 'flex',
            head_cell: 'text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]',
            row: 'flex w-full mt-2',
            cell: cn(
              'relative p-0 text-center text-sm focus-within:relative focus-within:z-20',
              '[&:has([aria-selected])]:bg-accent [&:has([aria-selected].day-outside)]:bg-accent/50',
              '[&:has([aria-selected].day-range-end)]:rounded-r-md'
            ),
            day: cn(
              'h-9 w-9 p-0 font-normal aria-selected:opacity-100',
              'hover:bg-accent hover:text-accent-foreground rounded-md',
              'inline-flex items-center justify-center'
            ),
            day_range_start: 'day-range-start',
            day_range_end: 'day-range-end',
            day_selected:
              'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground',
            day_today: 'bg-accent text-accent-foreground',
            day_outside:
              'day-outside text-muted-foreground opacity-50 aria-selected:bg-accent/50 aria-selected:text-muted-foreground aria-selected:opacity-30',
            day_disabled: 'text-muted-foreground opacity-50',
            day_range_middle: 'aria-selected:bg-accent aria-selected:text-accent-foreground',
            day_hidden: 'invisible',
          }}
          components={{
            IconLeft: () => <Icon name="ChevronLeft" size={16} />,
            IconRight: () => <Icon name="ChevronRight" size={16} />,
          }}
          {...props}
        />
      </div>
    )
  }
)

Calendar.displayName = 'Calendar'

/**
 * DatePicker component with input and popover
 */
export interface DatePickerProps {
  /**
   * Selected date
   */
  value?: Date
  /**
   * Callback when date changes
   */
  onChange?: (date: Date | undefined) => void
  /**
   * Placeholder text
   */
  placeholder?: string
  /**
   * Disabled state
   */
  disabled?: boolean
  /**
   * Format function for displaying date
   */
  formatDate?: (date: Date) => string
  /**
   * Calendar props
   */
  calendarProps?: Omit<CalendarProps, 'mode' | 'selected' | 'onSelect'>
  /**
   * Additional CSS classes
   */
  className?: string
}

export const DatePicker: React.FC<DatePickerProps> = ({
  value,
  onChange,
  placeholder = 'Pick a date',
  disabled = false,
  formatDate = (date) =>
    date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
  calendarProps,
  className,
}) => {
  const [isOpen, setIsOpen] = React.useState(false)

  return (
    <div className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={cn(
          'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm',
          'placeholder:text-muted-foreground',
          'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'justify-between items-center'
        )}
      >
        <span>{value ? formatDate(value) : placeholder}</span>
        <Icon name="Calendar" size={16} className="ml-2" />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute z-50 mt-2 rounded-md border bg-popover p-0 shadow-md">
            <DayPicker
              mode="single"
              selected={value}
              onSelect={(date: any) => {
                onChange?.(date)
                setIsOpen(false)
              }}
              {...calendarProps}
            />
          </div>
        </>
      )}
    </div>
  )
}

DatePicker.displayName = 'DatePicker'

/**
 * DateRangePicker component
 */
export interface DateRangePickerProps {
  /**
   * Selected date range
   */
  value?: { from: Date; to?: Date }
  /**
   * Callback when date range changes
   */
  onChange?: (range: { from: Date; to?: Date } | undefined) => void
  /**
   * Placeholder text
   */
  placeholder?: string
  /**
   * Disabled state
   */
  disabled?: boolean
  /**
   * Calendar props
   */
  calendarProps?: Omit<CalendarProps, 'mode' | 'selected' | 'onSelect'>
  /**
   * Additional CSS classes
   */
  className?: string
}

export const DateRangePicker: React.FC<DateRangePickerProps> = ({
  value,
  onChange,
  placeholder = 'Pick a date range',
  disabled = false,
  calendarProps,
  className,
}) => {
  const [isOpen, setIsOpen] = React.useState(false)

  const formatRange = (range: { from: Date; to?: Date }) => {
    const format = (date: Date) =>
      date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

    if (range.to) {
      return `${format(range.from)} - ${format(range.to)}`
    }
    return format(range.from)
  }

  return (
    <div className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={cn(
          'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm',
          'placeholder:text-muted-foreground',
          'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'justify-between items-center'
        )}
      >
        <span>{value ? formatRange(value) : placeholder}</span>
        <Icon name="Calendar" size={16} className="ml-2" />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute z-50 mt-2 rounded-md border bg-popover p-0 shadow-md">
            <DayPicker
              mode="range"
              selected={value}
              onSelect={(range: any) => {
                onChange?.(range)
                if (range?.to) {
                  setIsOpen(false)
                }
              }}
              numberOfMonths={2}
              {...calendarProps}
            />
          </div>
        </>
      )}
    </div>
  )
}

DateRangePicker.displayName = 'DateRangePicker'
