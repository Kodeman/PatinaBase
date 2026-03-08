'use client'

import * as React from 'react'
import { DayPicker, type DayPickerProps } from 'react-day-picker'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import { format } from 'date-fns'
import { cn } from '../../utils/cn'
import { Calendar as CalendarIcon } from 'lucide-react'
import { Button } from '../Button'
import { inputVariants } from '../Input'

export interface DatePickerProps extends Omit<DayPickerProps, 'mode'> {
  /**
   * Selected date
   */
  date?: Date
  /**
   * Callback when date changes
   */
  onDateChange?: (date: Date | undefined) => void
  /**
   * Placeholder text when no date is selected
   */
  placeholder?: string
  /**
   * Date format string
   */
  dateFormat?: string
  /**
   * Disable dates before this date
   */
  disableBefore?: Date
  /**
   * Disable dates after this date
   */
  disableAfter?: Date
  /**
   * Custom trigger class
   */
  triggerClassName?: string
  /**
   * Variant style
   */
  variant?: 'outline' | 'filled' | 'flushed'
  /**
   * Size variant
   */
  size?: 'sm' | 'md' | 'lg'
}

/**
 * DatePicker component with calendar popover
 * Built with react-day-picker and Radix UI Popover
 *
 * @example
 * ```tsx
 * <DatePicker
 *   date={date}
 *   onDateChange={setDate}
 *   placeholder="Select a date"
 *   disableBefore={new Date()}
 * />
 * ```
 */
export const DatePicker = React.forwardRef<HTMLButtonElement, DatePickerProps>(
  (
    {
      date,
      onDateChange,
      placeholder = 'Pick a date',
      dateFormat = 'PPP',
      disableBefore,
      disableAfter,
      triggerClassName,
      variant = 'outline',
      size = 'md',
      className,
      ...props
    },
    ref
  ) => {
    const [open, setOpen] = React.useState(false)

    return (
      <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
        <PopoverPrimitive.Trigger asChild>
          <button
            ref={ref}
            type="button"
            className={cn(
              inputVariants({ variant, size }),
              'justify-start text-left font-normal',
              !date && 'text-muted-foreground',
              triggerClassName
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {date ? format(date, dateFormat) : <span>{placeholder}</span>}
          </button>
        </PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            align="start"
            className="w-auto p-0 bg-popover rounded-md border shadow-md z-50"
          >
            <DayPicker
              mode="single"
              selected={date}
              onSelect={(selectedDate) => {
                onDateChange?.(selectedDate)
                setOpen(false)
              }}
              disabled={[
                disableBefore && { before: disableBefore },
                disableAfter && { after: disableAfter },
              ].filter(Boolean)}
              initialFocus
              className={cn('p-3', className)}
              classNames={{
                months: 'flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0',
                month: 'space-y-4',
                caption: 'flex justify-center pt-1 relative items-center',
                caption_label: 'text-sm font-medium',
                nav: 'space-x-1 flex items-center',
                nav_button: cn(
                  'h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 inline-flex items-center justify-center rounded-md'
                ),
                nav_button_previous: 'absolute left-1',
                nav_button_next: 'absolute right-1',
                table: 'w-full border-collapse space-y-1',
                head_row: 'flex',
                head_cell: 'text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]',
                row: 'flex w-full mt-2',
                cell: 'h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20',
                day: cn(
                  'h-9 w-9 p-0 font-normal aria-selected:opacity-100 hover:bg-accent hover:text-accent-foreground rounded-md inline-flex items-center justify-center'
                ),
                day_range_end: 'day-range-end',
                day_selected:
                  'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground',
                day_today: 'bg-accent text-accent-foreground',
                day_outside:
                  'day-outside text-muted-foreground opacity-50 aria-selected:bg-accent/50 aria-selected:text-muted-foreground aria-selected:opacity-30',
                day_disabled: 'text-muted-foreground opacity-50',
                day_range_middle:
                  'aria-selected:bg-accent aria-selected:text-accent-foreground',
                day_hidden: 'invisible',
              }}
              {...props}
            />
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    )
  }
)

DatePicker.displayName = 'DatePicker'

export interface DateRangePickerProps extends Omit<DayPickerProps, 'mode'> {
  /**
   * Selected date range
   */
  dateRange?: { from: Date | undefined; to?: Date | undefined }
  /**
   * Callback when date range changes
   */
  onDateRangeChange?: (range: { from: Date | undefined; to?: Date | undefined } | undefined) => void
  /**
   * Placeholder text
   */
  placeholder?: string
  /**
   * Date format string
   */
  dateFormat?: string
  /**
   * Custom trigger class
   */
  triggerClassName?: string
  /**
   * Variant style
   */
  variant?: 'outline' | 'filled' | 'flushed'
  /**
   * Size variant
   */
  size?: 'sm' | 'md' | 'lg'
}

/**
 * DateRangePicker component for selecting date ranges
 *
 * @example
 * ```tsx
 * <DateRangePicker
 *   dateRange={dateRange}
 *   onDateRangeChange={setDateRange}
 *   placeholder="Select date range"
 * />
 * ```
 */
export const DateRangePicker = React.forwardRef<HTMLButtonElement, DateRangePickerProps>(
  (
    {
      dateRange,
      onDateRangeChange,
      placeholder = 'Pick a date range',
      dateFormat = 'PPP',
      triggerClassName,
      variant = 'outline',
      size = 'md',
      className,
      ...props
    },
    ref
  ) => {
    const [open, setOpen] = React.useState(false)

    return (
      <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
        <PopoverPrimitive.Trigger asChild>
          <button
            ref={ref}
            type="button"
            className={cn(
              inputVariants({ variant, size }),
              'justify-start text-left font-normal',
              !dateRange && 'text-muted-foreground',
              triggerClassName
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {dateRange?.from ? (
              dateRange.to ? (
                <>
                  {format(dateRange.from, dateFormat)} -{' '}
                  {format(dateRange.to, dateFormat)}
                </>
              ) : (
                format(dateRange.from, dateFormat)
              )
            ) : (
              <span>{placeholder}</span>
            )}
          </button>
        </PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            align="start"
            className="w-auto p-0 bg-popover rounded-md border shadow-md z-50"
          >
            <DayPicker
              mode="range"
              selected={dateRange}
              onSelect={onDateRangeChange}
              numberOfMonths={2}
              className={cn('p-3', className)}
              classNames={{
                months: 'flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0',
                month: 'space-y-4',
                caption: 'flex justify-center pt-1 relative items-center',
                caption_label: 'text-sm font-medium',
                nav: 'space-x-1 flex items-center',
                nav_button: cn(
                  'h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 inline-flex items-center justify-center rounded-md'
                ),
                nav_button_previous: 'absolute left-1',
                nav_button_next: 'absolute right-1',
                table: 'w-full border-collapse space-y-1',
                head_row: 'flex',
                head_cell: 'text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]',
                row: 'flex w-full mt-2',
                cell: 'h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20',
                day: cn(
                  'h-9 w-9 p-0 font-normal aria-selected:opacity-100 hover:bg-accent hover:text-accent-foreground rounded-md inline-flex items-center justify-center'
                ),
                day_range_end: 'day-range-end',
                day_selected:
                  'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground',
                day_today: 'bg-accent text-accent-foreground',
                day_outside:
                  'day-outside text-muted-foreground opacity-50 aria-selected:bg-accent/50 aria-selected:text-muted-foreground aria-selected:opacity-30',
                day_disabled: 'text-muted-foreground opacity-50',
                day_range_middle:
                  'aria-selected:bg-accent aria-selected:text-accent-foreground',
                day_hidden: 'invisible',
              }}
              {...props}
            />
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    )
  }
)

DateRangePicker.displayName = 'DateRangePicker'
