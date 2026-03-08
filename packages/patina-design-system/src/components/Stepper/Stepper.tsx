import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../utils/cn'

const stepperVariants = cva('flex', {
  variants: {
    orientation: {
      horizontal: 'flex-row items-start',
      vertical: 'flex-col items-start',
    },
  },
  defaultVariants: {
    orientation: 'horizontal',
  },
})

export interface Step {
  id: string
  label: string
  description?: string
  icon?: React.ReactNode
  optional?: boolean
}

export interface StepperProps
  extends React.ComponentPropsWithoutRef<'div'>,
    VariantProps<typeof stepperVariants> {
  steps: Step[]
  currentStep: number
  onStepClick?: (stepIndex: number) => void
  clickable?: boolean
}

/**
 * Stepper component for multi-step workflows
 *
 * @example
 * ```tsx
 * const steps = [
 *   { id: '1', label: 'Account Details', description: 'Enter your information' },
 *   { id: '2', label: 'Verification', description: 'Verify your email' },
 *   { id: '3', label: 'Complete', description: 'All done!' },
 * ]
 *
 * <Stepper
 *   steps={steps}
 *   currentStep={1}
 *   onStepClick={(index) => console.log('Clicked step', index)}
 * />
 * ```
 */
const Stepper = React.forwardRef<HTMLDivElement, StepperProps>(
  (
    {
      className,
      orientation = 'horizontal',
      steps,
      currentStep,
      onStepClick,
      clickable = false,
      ...props
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={cn(stepperVariants({ orientation, className }))}
        {...props}
      >
        {steps.map((step, index) => {
          const isComplete = index < currentStep
          const isCurrent = index === currentStep
          const isUpcoming = index > currentStep
          const isLast = index === steps.length - 1

          return (
            <React.Fragment key={step.id}>
              <div
                className={cn(
                  'flex items-start gap-3',
                  orientation === 'horizontal' ? 'flex-col' : 'flex-row',
                  orientation === 'vertical' && 'w-full'
                )}
              >
                {/* Step indicator */}
                <div
                  className={cn(
                    'flex items-center gap-2',
                    orientation === 'vertical' && 'flex-col items-start'
                  )}
                >
                  <button
                    onClick={() => clickable && onStepClick?.(index)}
                    disabled={!clickable}
                    className={cn(
                      'flex h-10 w-10 items-center justify-center rounded-full border-2 font-medium transition-colors',
                      isComplete &&
                        'border-primary bg-primary text-primary-foreground',
                      isCurrent && 'border-primary text-primary',
                      isUpcoming && 'border-muted-foreground/20 text-muted-foreground',
                      clickable && 'cursor-pointer hover:border-primary',
                      !clickable && 'cursor-default'
                    )}
                    aria-current={isCurrent ? 'step' : undefined}
                  >
                    {step.icon ? (
                      <span className="inline-flex shrink-0">{step.icon}</span>
                    ) : isComplete ? (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : (
                      <span className="text-sm">{index + 1}</span>
                    )}
                  </button>

                  {/* Step content */}
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'text-sm font-medium',
                          isCurrent && 'text-foreground',
                          isComplete && 'text-foreground',
                          isUpcoming && 'text-muted-foreground'
                        )}
                      >
                        {step.label}
                      </span>
                      {step.optional && (
                        <span className="text-xs text-muted-foreground">(Optional)</span>
                      )}
                    </div>
                    {step.description && (
                      <p className="text-xs text-muted-foreground max-w-[200px]">
                        {step.description}
                      </p>
                    )}
                  </div>
                </div>

                {orientation === 'vertical' && !isLast && (
                  <div className="ml-5 h-full min-h-[40px] w-0.5 bg-border" />
                )}
              </div>

              {/* Connector line for horizontal orientation */}
              {orientation === 'horizontal' && !isLast && (
                <div
                  className={cn(
                    'mt-5 h-0.5 flex-1 mx-2',
                    isComplete ? 'bg-primary' : 'bg-border'
                  )}
                />
              )}
            </React.Fragment>
          )
        })}
      </div>
    )
  }
)
Stepper.displayName = 'Stepper'

export { Stepper }
