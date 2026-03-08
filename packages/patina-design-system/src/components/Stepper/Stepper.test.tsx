import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Stepper, type Step } from './Stepper'

const mockSteps: Step[] = [
  { id: '1', label: 'Account', description: 'Create your account' },
  { id: '2', label: 'Profile', description: 'Setup your profile' },
  { id: '3', label: 'Complete', description: 'All done!' },
]

describe('Stepper', () => {
  it('renders all steps', () => {
    render(<Stepper steps={mockSteps} currentStep={0} />)

    expect(screen.getByText('Account')).toBeInTheDocument()
    expect(screen.getByText('Profile')).toBeInTheDocument()
    expect(screen.getByText('Complete')).toBeInTheDocument()
  })

  it('marks current step correctly', () => {
    render(<Stepper steps={mockSteps} currentStep={1} />)

    const profileButton = screen.getByRole('button', { name: /2/i })
    expect(profileButton).toHaveAttribute('aria-current', 'step')
  })

  it('shows checkmark for completed steps', () => {
    render(<Stepper steps={mockSteps} currentStep={2} />)

    // First two steps should be completed and show checkmarks
    const buttons = screen.getAllByRole('button')
    expect(buttons[0].querySelector('svg')).toBeInTheDocument()
    expect(buttons[1].querySelector('svg')).toBeInTheDocument()
  })

  it('calls onStepClick when clickable', async () => {
    const user = userEvent.setup()
    const handleStepClick = vi.fn()

    render(
      <Stepper
        steps={mockSteps}
        currentStep={1}
        clickable
        onStepClick={handleStepClick}
      />
    )

    const firstStep = screen.getByRole('button', { name: /1/i })
    await user.click(firstStep)

    expect(handleStepClick).toHaveBeenCalledWith(0)
  })

  it('does not call onStepClick when not clickable', async () => {
    const user = userEvent.setup()
    const handleStepClick = vi.fn()

    render(
      <Stepper
        steps={mockSteps}
        currentStep={1}
        clickable={false}
        onStepClick={handleStepClick}
      />
    )

    const firstStep = screen.getByRole('button', { name: /1/i })
    await user.click(firstStep)

    expect(handleStepClick).not.toHaveBeenCalled()
  })

  it('renders in vertical orientation', () => {
    const { container } = render(
      <Stepper steps={mockSteps} currentStep={0} orientation="vertical" />
    )

    const stepper = container.firstChild
    expect(stepper).toHaveClass('flex-col')
  })

  it('shows optional indicator', () => {
    const stepsWithOptional: Step[] = [
      ...mockSteps,
      { id: '4', label: 'Newsletter', optional: true },
    ]

    render(<Stepper steps={stepsWithOptional} currentStep={0} />)

    expect(screen.getByText('(Optional)')).toBeInTheDocument()
  })
})
