'use client'

import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../utils/cn'

const textareaVariants = cva(
  'flex min-h-[80px] w-full rounded-md border transition-colors placeholder:text-muted-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      variant: {
        outline: 'border-input bg-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        filled: 'border-transparent bg-muted focus-visible:bg-background focus-visible:border-input focus-visible:ring-2 focus-visible:ring-ring',
        flushed: 'border-0 border-b-2 border-input bg-transparent rounded-none px-0 focus-visible:border-primary',
      },
      size: {
        sm: 'px-3 py-2 text-xs',
        md: 'px-3 py-2 text-sm',
        lg: 'px-4 py-3 text-base',
      },
      resize: {
        none: 'resize-none',
        vertical: 'resize-y',
        horizontal: 'resize-x',
        both: 'resize',
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
      resize: 'vertical',
      state: 'default',
    },
  }
)

export interface TextareaProps
  extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'size'>,
    VariantProps<typeof textareaVariants> {
  /**
   * Auto-resize textarea based on content
   */
  autoResize?: boolean
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
 * Textarea component with auto-resize and character counter
 *
 * @example
 * ```tsx
 * <Textarea
 *   placeholder="Enter your message"
 *   autoResize
 *   showCount
 *   maxLength={500}
 * />
 * ```
 */
const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      className,
      variant,
      size,
      resize,
      state,
      autoResize,
      showCount,
      maxLength,
      wrapperClassName,
      ...props
    },
    ref
  ) => {
    const [value, setValue] = React.useState(props.value || props.defaultValue || '')
    const textareaRef = React.useRef<HTMLTextAreaElement>(null)

    React.useImperativeHandle(ref, () => textareaRef.current!)

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setValue(e.target.value)
      props.onChange?.(e)

      if (autoResize && textareaRef.current) {
        // Reset height to auto to get the correct scrollHeight
        textareaRef.current.style.height = 'auto'
        // Set height to scrollHeight
        textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
      }
    }

    React.useEffect(() => {
      if (props.value !== undefined) {
        setValue(props.value)
      }
    }, [props.value])

    React.useEffect(() => {
      if (autoResize && textareaRef.current) {
        // Set initial height on mount
        textareaRef.current.style.height = 'auto'
        textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
      }
    }, [autoResize])

    if (!showCount) {
      return (
        <textarea
          className={cn(
            textareaVariants({ variant, size, resize: autoResize ? 'none' : resize, state, className })
          )}
          ref={textareaRef}
          maxLength={maxLength}
          {...props}
          onChange={handleChange}
        />
      )
    }

    return (
      <div className={cn('relative', wrapperClassName)}>
        <textarea
          className={cn(
            textareaVariants({ variant, size, resize: autoResize ? 'none' : resize, state, className })
          )}
          ref={textareaRef}
          maxLength={maxLength}
          {...props}
          onChange={handleChange}
        />

        {showCount && maxLength && (
          <div className="mt-1 text-xs text-muted-foreground text-right">
            {String(value).length}/{maxLength}
          </div>
        )}
      </div>
    )
  }
)

Textarea.displayName = 'Textarea'

export { Textarea, textareaVariants }
