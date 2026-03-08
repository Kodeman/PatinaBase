import * as React from 'react'
import { cn } from '../../utils/cn'
import { Label } from '../Label'
import { FormError } from '../FormError'

export interface FormFieldProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Label text for the form field
   */
  label?: React.ReactNode
  /**
   * Description/help text for the form field
   */
  description?: React.ReactNode
  /**
   * Error message to display
   */
  error?: React.ReactNode
  /**
   * Success message to display
   */
  success?: React.ReactNode
  /**
   * Info message to display
   */
  info?: React.ReactNode
  /**
   * Whether the field is required
   */
  required?: boolean
  /**
   * Whether the field is optional (shows "(optional)" text)
   */
  optional?: boolean
  /**
   * ID for the form field (used to connect label)
   */
  htmlFor?: string
  /**
   * Layout orientation
   */
  orientation?: 'vertical' | 'horizontal'
  /**
   * The form control element (Input, Textarea, Select, etc.)
   */
  children: React.ReactNode
}

/**
 * FormField wrapper component that composes Label, Input/Control, Description, and Error
 *
 * @example
 * ```tsx
 * <FormField
 *   label="Email Address"
 *   description="We'll never share your email"
 *   error={errors.email?.message}
 *   required
 *   htmlFor="email"
 * >
 *   <Input id="email" type="email" />
 * </FormField>
 * ```
 */
const FormField = React.forwardRef<HTMLDivElement, FormFieldProps>(
  (
    {
      className,
      label,
      description,
      error,
      success,
      info,
      required,
      optional,
      htmlFor,
      orientation = 'vertical',
      children,
      ...props
    },
    ref
  ) => {
    const hasMessage = error || success || info
    const message = error || success || info
    const messageVariant = error ? 'error' : success ? 'success' : 'info'

    return (
      <div
        ref={ref}
        className={cn(
          'space-y-2',
          orientation === 'horizontal' && 'flex items-start gap-4',
          className
        )}
        {...props}
      >
        {label && (
          <div className={cn(orientation === 'horizontal' && 'min-w-[140px] pt-2')}>
            <Label htmlFor={htmlFor} required={required} optional={optional}>
              {label}
            </Label>
          </div>
        )}

        <div className={cn('space-y-2', orientation === 'horizontal' && 'flex-1')}>
          {children}

          {description && !hasMessage && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}

          {hasMessage && <FormError variant={messageVariant}>{message}</FormError>}
        </div>
      </div>
    )
  }
)

FormField.displayName = 'FormField'

export { FormField }
