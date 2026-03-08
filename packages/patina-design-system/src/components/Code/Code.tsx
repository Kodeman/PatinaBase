'use client'

import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../utils/cn'

const codeVariants = cva('font-mono', {
  variants: {
    variant: {
      inline: 'rounded bg-muted px-1.5 py-0.5 text-sm',
      block: 'block rounded-lg bg-muted p-4 text-sm overflow-x-auto',
    },
    colorScheme: {
      default: '',
      primary: 'bg-primary/10 text-primary',
      secondary: 'bg-secondary/10 text-secondary',
      success: 'bg-green-500/10 text-green-700 dark:text-green-400',
      warning: 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400',
      error: 'bg-red-500/10 text-red-700 dark:text-red-400',
    },
  },
  defaultVariants: {
    variant: 'inline',
    colorScheme: 'default',
  },
})

export interface CodeProps
  extends React.HTMLAttributes<HTMLElement>,
    VariantProps<typeof codeVariants> {
  /**
   * Show copy button (only for block variant)
   */
  showCopy?: boolean

  /**
   * Programming language (for syntax highlighting hint)
   */
  language?: string

  /**
   * Callback when code is copied
   */
  onCopy?: () => void
}

/**
 * Code component for displaying inline or block code
 *
 * @example
 * ```tsx
 * // Inline code
 * <Text>
 *   Use the <Code>npm install</Code> command to install packages.
 * </Text>
 *
 * // Block code
 * <Code variant="block">
 *   const greeting = "Hello World";
 *   console.log(greeting);
 * </Code>
 *
 * // With copy button
 * <Code variant="block" showCopy language="javascript">
 *   function add(a, b) {'{'}
 *     return a + b;
 *   {'}'}
 * </Code>
 *
 * // Colored code
 * <Code colorScheme="primary">API_KEY</Code>
 * ```
 */
const Code = React.forwardRef<HTMLElement, CodeProps>(
  (
    {
      className,
      variant,
      colorScheme,
      showCopy,
      language,
      onCopy,
      children,
      ...props
    },
    ref
  ) => {
    const [copied, setCopied] = React.useState(false)

    const handleCopy = React.useCallback(() => {
      const text = typeof children === 'string' ? children : ''
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true)
        onCopy?.()
        setTimeout(() => setCopied(false), 2000)
      })
    }, [children, onCopy])

    if (variant === 'block') {
      return (
        <div className="relative group">
          <pre
            ref={ref as any}
            className={cn(codeVariants({ variant, colorScheme, className }))}
            {...(language && { 'data-language': language })}
            {...props}
          >
            <code>{children}</code>
          </pre>
          {showCopy && (
            <button
              onClick={handleCopy}
              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-background border border-border rounded px-2 py-1 text-xs hover:bg-accent"
              aria-label="Copy code"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          )}
        </div>
      )
    }

    return (
      <code
        ref={ref as any}
        className={cn(codeVariants({ variant, colorScheme, className }))}
        {...(language && { 'data-language': language })}
        {...props}
      >
        {children}
      </code>
    )
  }
)

Code.displayName = 'Code'

export { Code, codeVariants }
