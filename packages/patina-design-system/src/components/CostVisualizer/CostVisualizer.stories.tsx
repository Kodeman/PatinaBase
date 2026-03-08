import type { Meta, StoryObj } from '@storybook/react'
import { CostVisualizer } from './CostVisualizer'

const meta: Meta<typeof CostVisualizer> = {
  title: 'Client Portal/CostVisualizer',
  component: CostVisualizer,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof CostVisualizer>

const mockBreakdown = [
  {
    id: '1',
    label: 'Furniture & Fixtures',
    amount: 15000,
    percentage: 37.5,
    category: 'materials' as const,
    description: 'Sofa, chairs, coffee table, and lighting',
  },
  {
    id: '2',
    label: 'Labor & Installation',
    amount: 12000,
    percentage: 30,
    category: 'labor' as const,
    description: 'Professional installation and setup',
  },
  {
    id: '3',
    label: 'Design Services',
    amount: 8000,
    percentage: 20,
    category: 'design' as const,
    description: 'Interior design consultation and planning',
  },
  {
    id: '4',
    label: 'Materials & Finishes',
    amount: 5000,
    percentage: 12.5,
    category: 'materials' as const,
    description: 'Paint, wallpaper, and decorative elements',
  },
]

const mockPaymentSchedule = [
  {
    id: '1',
    label: 'Initial Deposit',
    amount: 10000,
    dueDate: new Date('2025-10-15'),
    status: 'paid' as const,
  },
  {
    id: '2',
    label: 'Mid-Project Payment',
    amount: 15000,
    dueDate: new Date('2025-11-01'),
    status: 'pending' as const,
  },
  {
    id: '3',
    label: 'Final Payment',
    amount: 15000,
    dueDate: new Date('2025-11-15'),
    status: 'upcoming' as const,
  },
]

export const Default: Story = {
  args: {
    totalBudget: 50000,
    currentCost: 40000,
    currency: '$',
    breakdown: mockBreakdown,
    paymentSchedule: mockPaymentSchedule,
  },
}

export const WithSavings: Story = {
  args: {
    totalBudget: 50000,
    currentCost: 38000,
    projectedCost: 40000,
    currency: '$',
    breakdown: mockBreakdown,
    savings: 10000,
  },
}

export const WithROI: Story = {
  args: {
    totalBudget: 50000,
    currentCost: 42000,
    currency: '$',
    breakdown: mockBreakdown,
    roi: {
      percentage: 25,
      years: 5,
      description: 'Expected increase in property value based on similar renovations in your area',
    },
  },
}

export const OverBudget: Story = {
  args: {
    totalBudget: 50000,
    currentCost: 55000,
    currency: '$',
    breakdown: mockBreakdown,
  },
}

export const NearBudgetLimit: Story = {
  args: {
    totalBudget: 50000,
    currentCost: 47000,
    projectedCost: 49000,
    currency: '$',
    breakdown: mockBreakdown,
    showComparison: true,
  },
}

export const Minimal: Story = {
  args: {
    totalBudget: 50000,
    currentCost: 40000,
    currency: '$',
  },
}

export const Complete: Story = {
  args: {
    totalBudget: 50000,
    currentCost: 42000,
    projectedCost: 45000,
    currency: '$',
    breakdown: mockBreakdown,
    paymentSchedule: mockPaymentSchedule,
    savings: 5000,
    roi: {
      percentage: 30,
      years: 5,
      description: 'High-end finishes increase property value significantly',
    },
    showComparison: true,
  },
}
