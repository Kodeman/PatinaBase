'use client'

import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../utils/cn'
import { Eye, EyeOff, X, Search, type LucideProps } from 'lucide-react'

// Type helper for Lucide icons to work with React 19
const IconWrapper = ({ Icon, ...props }: { Icon: any } & LucideProps) => <Icon {...props} />

const inputVariants = cva(
  'flex w-full rounded-md border transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      variant: {
        outline: 'border-input bg-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        filled: 'border-transparent bg-muted focus-visible:bg-background focus-visible:border-input focus-visible:ring-2 focus-visible:ring-ring',
        flushed: 'border-0 border-b-2 border-input bg-transparent rounded-none px-0 focus-visible:border-primary',
      },
      size: {
        sm: 'h-8 px-3 py-1 text-xs',
        md: 'h-10 px-3 py-2 text-sm',
        lg: 'h-12 px-4 py-3 text-base',
      },
      state: {
        default: '',
        error: 'border-destructive focus-visible:ring-destructive',
        success: 'border-green-500 focus-visible:ring-green-500',
      },
    },
    defaultVariants: {
      variant: 'outline',
      size: 'md',
      state: 'default',
    },
  }
)

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'>,
    VariantProps<typeof inputVariants> {
  /**
   * Icon to display on the left side
   */
  leftIcon?: React.ReactNode
  /**
   * Icon to display on the right side
   */
  rightIcon?: React.ReactNode
  /**
   * Show clear button (X icon) when input has value
   */
  clearable?: boolean
  /**
   * Callback when clear button is clicked
   */
  onClear?: () => void
  /**
   * Show character counter
   */
  showCount?: boolean
  /**
   * Wrapper class name for container
   */
  wrapperClassName?: string
}

/**
 * Input component with multiple variants, sizes, and advanced features
 *
 * @example
 * ```tsx
 * <Input
 *   type="email"
 *   placeholder="Enter email"
 *   variant="outline"
 *   size="md"
 *   leftIcon={<Mail />}
 *   clearable
 * />
 * ```
 */
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      variant,
      size,
      state,
      type = 'text',
      leftIcon,
      rightIcon,
      clearable,
      onClear,
      showCount,
      maxLength,
      wrapperClassName,
      ...props
    },
    ref
  ) => {
    const [showPassword, setShowPassword] = React.useState(false)
    const [value, setValue] = React.useState(props.value || props.defaultValue || '')

    const inputRef = React.useRef<HTMLInputElement>(null)

    React.useImperativeHandle(ref, () => inputRef.current!)

    const isPassword = type === 'password'
    const isSearch = type === 'search'
    const hasIcons = leftIcon || rightIcon || isPassword || (isSearch && !rightIcon) || (clearable && value)

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setValue(e.target.value)
      props.onChange?.(e)
    }

    const handleClear = () => {
      setValue('')
      onClear?.()
      if (inputRef.current) {
        inputRef.current.value = ''
        inputRef.current.focus()
      }
    }

    const togglePasswordVisibility = () => {
      setShowPassword(!showPassword)
    }

    const actualType = isPassword && showPassword ? 'text' : type

    React.useEffect(() => {
      if (props.value !== undefined) {
        setValue(props.value)
      }
    }, [props.value])

    if (!hasIcons && !showCount) {
      return (
        <input
          type={actualType}
          className={cn(inputVariants({ variant, size, state, className }))}
          ref={inputRef}
          maxLength={maxLength}
          {...props}
          onChange={handleChange}
        />
      )
    }

    return (
      <div className={cn('relative', wrapperClassName)}>
        <div className="relative flex items-center">
          {leftIcon && (
            <div className="absolute left-3 flex items-center pointer-events-none text-muted-foreground">
              {leftIcon}
            </div>
          )}

          {isSearch && !leftIcon && (
            <div className="absolute left-3 flex items-center pointer-events-none text-muted-foreground">
              <IconWrapper Icon={Search} className="h-4 w-4" aria-hidden="true" />
            </div>
          )}

          <input
            type={actualType}
            className={cn(
              inputVariants({ variant, size, state, className }),
              {
                'pl-10': leftIcon || isSearch,
                'pr-10': rightIcon || isPassword || (clearable && value),
                'pr-20': isPassword && clearable && value,
              }
            )}
            ref={inputRef}
            maxLength={maxLength}
            {...props}
            onChange={handleChange}
          />

          <div className="absolute right-3 flex items-center gap-1">
            {clearable && value && (
              <button
                type="button"
                onClick={handleClear}
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Clear input"
                tabIndex={-1}
              >
                <IconWrapper Icon={X} className="h-4 w-4" />
              </button>
            )}

            {isPassword && (
              <button
                type="button"
                onClick={togglePasswordVisibility}
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                tabIndex={-1}
              >
                {showPassword ? (
                  <IconWrapper Icon={EyeOff} className="h-4 w-4" />
                ) : (
                  <IconWrapper Icon={Eye} className="h-4 w-4" />
                )}
              </button>
            )}

            {rightIcon && !isPassword && <div className="text-muted-foreground">{rightIcon}</div>}
          </div>
        </div>

        {showCount && maxLength && (
          <div className="mt-1 text-xs text-muted-foreground text-right">
            {String(value).length}/{maxLength}
          </div>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'

export { Input, inputVariants }
