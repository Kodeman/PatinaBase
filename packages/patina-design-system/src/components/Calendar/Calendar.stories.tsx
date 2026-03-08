import type { Meta, StoryObj } from '@storybook/react'
import { Calendar, DatePicker, DateRangePicker } from './Calendar'
import * as React from 'react'

const meta: Meta<typeof Calendar> = {
  title: 'Components/Calendar',
  component: Calendar,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
}

export default meta
type Story = StoryObj<typeof Calendar>

export const SingleDate: Story = {
  render: () => {
    const [date, setDate] = React.useState<Date>()
    return (
      <Calendar
        mode="single"
        selected={date}
        onSelect={setDate}
      />
    )
  },
}

export const MultipleDate: Story = {
  render: () => {
    const [dates, setDates] = React.useState<Date[]>([])
    return (
      <Calendar
        mode="multiple"
        selected={dates}
        onSelect={setDates as any}
      />
    )
  },
}

export const DateRange: Story = {
  render: () => {
    const [range, setRange] = React.useState<{ from: Date; to?: Date }>()
    return (
      <Calendar
        mode="range"
        selected={range}
        onSelect={setRange as any}
        numberOfMonths={2}
      />
    )
  },
}

export const DisabledDates: Story = {
  render: () => {
    const [date, setDate] = React.useState<Date>()
    const disabledDays = [
      new Date(2024, 0, 10),
      new Date(2024, 0, 15),
      new Date(2024, 0, 20),
    ]

    return (
      <Calendar
        mode="single"
        selected={date}
        onSelect={setDate}
        disabled={disabledDays}
      />
    )
  },
}

export const WithDatePicker: StoryObj<typeof DatePicker> = {
  render: () => {
    const [date, setDate] = React.useState<Date>()
    return (
      <div className="w-64">
        <DatePicker
          value={date}
          onChange={setDate}
          placeholder="Pick a date"
        />
      </div>
    )
  },
}

export const WithDateRangePicker: StoryObj<typeof DateRangePicker> = {
  render: () => {
    const [range, setRange] = React.useState<{ from: Date; to?: Date }>()
    return (
      <div className="w-80">
        <DateRangePicker
          value={range}
          onChange={setRange}
          placeholder="Pick a date range"
        />
      </div>
    )
  },
}

export const WithMinMax: Story = {
  render: () => {
    const [date, setDate] = React.useState<Date>()
    const today = new Date()
    const oneMonthFromNow = new Date()
    oneMonthFromNow.setMonth(oneMonthFromNow.getMonth() + 1)

    return (
      <Calendar
        mode="single"
        selected={date}
        onSelect={setDate}
        fromDate={today}
        toDate={oneMonthFromNow}
      />
    )
  },
}

export const CustomFormatting: StoryObj<typeof DatePicker> = {
  render: () => {
    const [date, setDate] = React.useState<Date>()
    return (
      <div className="w-64">
        <DatePicker
          value={date}
          onChange={setDate}
          formatDate={(date) =>
            date.toLocaleDateString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })
          }
        />
      </div>
    )
  },
}
