'use client'

import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../utils/cn'

const pinInputVariants = cva(
  'text-center border rounded-md font-mono font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      variant: {
        outline: 'border-input bg-background',
        filled: 'border-transparent bg-muted',
      },
      size: {
        sm: 'h-10 w-10 text-base',
        md: 'h-12 w-12 text-lg',
        lg: 'h-14 w-14 text-xl',
      },
      state: {
        default: '',
        error: 'border-destructive focus:ring-destructive',
        success: 'border-green-500 focus:ring-green-500',
      },
    },
    defaultVariants: {
      variant: 'outline',
      size: 'md',
      state: 'default',
    },
  }
)

export interface PinInputProps extends VariantProps<typeof pinInputVariants> {
  /**
   * Number of input fields
   */
  length?: number
  /**
   * Callback when all fields are filled
   */
  onComplete?: (value: string) => void
  /**
   * Callback when value changes
   */
  onChange?: (value: string) => void
  /**
   * Input type (number or text)
   */
  type?: 'number' | 'text'
  /**
   * Mask characters (for password-like inputs)
   */
  mask?: boolean
  /**
   * Whether to auto-focus first field
   */
  autoFocus?: boolean
  /**
   * Placeholder character
   */
  placeholder?: string
  /**
   * Disabled state
   */
  disabled?: boolean
  /**
   * Allow paste
   */
  allowPaste?: boolean
  /**
   * Custom class for container
   */
  containerClassName?: string
  /**
   * Custom class for inputs
   */
  inputClassName?: string
  /**
   * Default value
   */
  defaultValue?: string
  /**
   * Controlled value
   */
  value?: string
}

/**
 * PinInput component for entering OTP codes or PIN numbers
 *
 * @example
 * ```tsx
 * <PinInput
 *   length={6}
 *   type="number"
 *   onComplete={(pin) => verifyOTP(pin)}
 *   autoFocus
 * />
 * ```
 */
export const PinInput = React.forwardRef<HTMLDivElement, PinInputProps>(
  (
    {
      length = 4,
      onComplete,
      onChange,
      type = 'number',
      mask = false,
      autoFocus = false,
      placeholder = '',
      disabled = false,
      allowPaste = true,
      variant,
      size,
      state,
      containerClassName,
      inputClassName,
      defaultValue = '',
      value: controlledValue,
      ...props
    },
    ref
  ) => {
    const [values, setValues] = React.useState<string[]>(
      controlledValue?.split('').slice(0, length) || defaultValue.split('').slice(0, length) || Array(length).fill('')
    )
    const inputRefs = React.useRef<(HTMLInputElement | null)[]>([])

    React.useEffect(() => {
      if (controlledValue !== undefined) {
        setValues(controlledValue.split('').slice(0, length).concat(Array(length).fill('')).slice(0, length))
      }
    }, [controlledValue, length])

    const focusInput = React.useCallback((index: number) => {
      const input = inputRefs.current[index]
      if (input) {
        input.focus()
        input.select()
      }
    }, [])

    const handleChange = React.useCallback(
      (index: number, value: string) => {
        // Filter based on type
        let filteredValue = value
        if (type === 'number') {
          filteredValue = value.replace(/[^0-9]/g, '')
        }

        // Take only the last character if multiple are entered
        const newValue = filteredValue.slice(-1)

        const newValues = [...values]
        newValues[index] = newValue
        setValues(newValues)

        const fullValue = newValues.join('')
        onChange?.(fullValue)

        // Auto-focus next field
        if (newValue && index < length - 1) {
          focusInput(index + 1)
        }

        // Call onComplete if all fields are filled
        if (newValues.every((val) => val !== '') && onComplete) {
          onComplete(fullValue)
        }
      },
      [values, length, type, onChange, onComplete, focusInput]
    )

    const handleKeyDown = React.useCallback(
      (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Backspace') {
          e.preventDefault()
          if (values[index]) {
            // Clear current field
            const newValues = [...values]
            newValues[index] = ''
            setValues(newValues)
            onChange?.(newValues.join(''))
          } else if (index > 0) {
            // Move to previous field and clear it
            focusInput(index - 1)
            const newValues = [...values]
            newValues[index - 1] = ''
            setValues(newValues)
            onChange?.(newValues.join(''))
          }
        } else if (e.key === 'ArrowLeft' && index > 0) {
          e.preventDefault()
          focusInput(index - 1)
        } else if (e.key === 'ArrowRight' && index < length - 1) {
          e.preventDefault()
          focusInput(index + 1)
        } else if (e.key === 'Delete') {
          e.preventDefault()
          const newValues = [...values]
          newValues[index] = ''
          setValues(newValues)
          onChange?.(newValues.join(''))
        }
      },
      [values, length, onChange, focusInput]
    )

    const handlePaste = React.useCallback(
      (e: React.ClipboardEvent) => {
        if (!allowPaste) {
          e.preventDefault()
          return
        }

        e.preventDefault()
        let pastedData = e.clipboardData.getData('text/plain')

        if (type === 'number') {
          pastedData = pastedData.replace(/[^0-9]/g, '')
        }

        const pastedChars = pastedData.split('').slice(0, length)
        const newValues = [...values]

        pastedChars.forEach((char, i) => {
          if (i < length) {
            newValues[i] = char
          }
        })

        setValues(newValues)
        const fullValue = newValues.join('')
        onChange?.(fullValue)

        // Focus the next empty field or last field
        const nextEmptyIndex = newValues.findIndex((val) => val === '')
        if (nextEmptyIndex !== -1) {
          focusInput(nextEmptyIndex)
        } else {
          focusInput(length - 1)
        }

        // Call onComplete if all fields are filled
        if (newValues.every((val) => val !== '') && onComplete) {
          onComplete(fullValue)
        }
      },
      [allowPaste, type, length, values, onChange, onComplete, focusInput]
    )

    React.useEffect(() => {
      if (autoFocus) {
        focusInput(0)
      }
    }, [autoFocus, focusInput])

    return (
      <div ref={ref} className={cn('flex gap-2', containerClassName)} {...props}>
        {Array.from({ length }).map((_, index) => (
          <input
            key={index}
            ref={(el: HTMLInputElement | null) => {
              inputRefs.current[index] = el
            }}
            type={mask ? 'password' : 'text'}
            inputMode={type === 'number' ? 'numeric' : 'text'}
            pattern={type === 'number' ? '[0-9]*' : undefined}
            maxLength={1}
            value={values[index]}
            onChange={(e) => handleChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            onPaste={handlePaste}
            onFocus={(e) => e.target.select()}
            disabled={disabled}
            placeholder={placeholder}
            className={cn(pinInputVariants({ variant, size, state }), inputClassName)}
            aria-label={`PIN digit ${index + 1}`}
          />
        ))}
      </div>
    )
  }
)

PinInput.displayName = 'PinInput'

export { pinInputVariants }
