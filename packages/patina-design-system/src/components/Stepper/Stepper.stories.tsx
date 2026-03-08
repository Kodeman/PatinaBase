import type { Meta, StoryObj } from '@storybook/react'
import { Stepper, type Step } from './Stepper'
import { useState } from 'react'

const steps: Step[] = [
  { id: '1', label: 'Account Details', description: 'Enter your information' },
  { id: '2', label: 'Verification', description: 'Verify your email' },
  { id: '3', label: 'Preferences', description: 'Set your preferences', optional: true },
  { id: '4', label: 'Complete', description: 'All done!' },
]

const meta: Meta<typeof Stepper> = {
  title: 'Navigation/Stepper',
  component: Stepper,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: 'A stepper component for multi-step workflows.',
      },
    },
  },
}

export default meta
type Story = StoryObj<typeof Stepper>

export const Default: Story = {
  args: {
    steps,
    currentStep: 1,
  },
}

export const Interactive: Story = {
  render: () => {
    const [currentStep, setCurrentStep] = useState(0)

    return (
      <div className="space-y-4">
        <Stepper
          steps={steps}
          currentStep={currentStep}
          clickable
          onStepClick={setCurrentStep}
        />
        <div className="flex gap-2">
          <button
            onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
            disabled={currentStep === 0}
            className="px-4 py-2 bg-primary text-white rounded disabled:opacity-50"
          >
            Previous
          </button>
          <button
            onClick={() => setCurrentStep(Math.min(steps.length - 1, currentStep + 1))}
            disabled={currentStep === steps.length - 1}
            className="px-4 py-2 bg-primary text-white rounded disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    )
  },
}

export const Vertical: Story = {
  args: {
    steps,
    currentStep: 1,
    orientation: 'vertical',
  },
}

export const WithIcons: Story = {
  args: {
    steps: [
      {
        id: '1',
        label: 'Cart',
        icon: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <circle cx="9" cy="21" r="1" />
            <circle cx="20" cy="21" r="1" />
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
          </svg>
        ),
      },
      {
        id: '2',
        label: 'Checkout',
        icon: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
            <line x1="1" y1="10" x2="23" y2="10" />
          </svg>
        ),
      },
      {
        id: '3',
        label: 'Confirmation',
        icon: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ),
      },
    ],
    currentStep: 1,
  },
}

export const Completed: Story = {
  args: {
    steps,
    currentStep: 3,
  },
}
