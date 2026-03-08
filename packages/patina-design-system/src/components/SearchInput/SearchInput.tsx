'use client'

import * as React from 'react'
import { cn } from '../../utils/cn'
import { Input, type InputProps } from '../Input'
import { Search, X, Loader2, type LucideProps } from 'lucide-react'

// Type helper for Lucide icons to work with React 19
const IconWrapper = ({ Icon, ...props }: { Icon: any } & LucideProps) => <Icon {...props} />

export interface SearchInputProps extends Omit<InputProps, 'type' | 'leftIcon'> {
  /**
   * Callback when search value changes (debounced)
   */
  onSearch?: (value: string) => void
  /**
   * Debounce delay in milliseconds
   */
  debounceMs?: number
  /**
   * Show loading indicator
   */
  isLoading?: boolean
  /**
   * Callback when search is cleared
   */
  onClear?: () => void
  /**
   * Show search results count
   */
  resultsCount?: number
}

/**
 * SearchInput component with debounced search callback
 *
 * @example
 * ```tsx
 * <SearchInput
 *   placeholder="Search products..."
 *   onSearch={(query) => searchProducts(query)}
 *   debounceMs={300}
 *   isLoading={isSearching}
 * />
 * ```
 */
export const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  (
    {
      className,
      onSearch,
      debounceMs = 300,
      isLoading = false,
      onClear,
      resultsCount,
      ...props
    },
    ref
  ) => {
    const [value, setValue] = React.useState(props.value || props.defaultValue || '')
    const timeoutRef = React.useRef<NodeJS.Timeout | undefined>(undefined)

    React.useEffect(() => {
      if (props.value !== undefined) {
        setValue(props.value)
      }
    }, [props.value])

    const handleChange = React.useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value
        setValue(newValue)
        props.onChange?.(e)

        // Clear existing timeout
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current)
        }

        // Set new timeout for debounced search
        if (onSearch) {
          timeoutRef.current = setTimeout(() => {
            onSearch(newValue)
          }, debounceMs)
        }
      },
      [onSearch, debounceMs, props.onChange]
    )

    const handleClear = React.useCallback(() => {
      setValue('')
      onClear?.()
      onSearch?.('')

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }, [onClear, onSearch])

    // Cleanup timeout on unmount
    React.useEffect(() => {
      return () => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current)
        }
      }
    }, [])

    return (
      <div className="relative w-full">
        <Input
          ref={ref}
          type="search"
          value={value}
          onChange={handleChange}
          leftIcon={<IconWrapper Icon={Search} className="h-4 w-4" />}
          rightIcon={
            isLoading ? (
              <IconWrapper Icon={Loader2} className="h-4 w-4 animate-spin" />
            ) : value ? (
              <button
                type="button"
                onClick={handleClear}
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Clear search"
                tabIndex={-1}
              >
                <IconWrapper Icon={X} className="h-4 w-4" />
              </button>
            ) : null
          }
          className={cn(className)}
          {...props}
        />

        {resultsCount !== undefined && value && (
          <div className="mt-1 text-xs text-muted-foreground">
            {resultsCount === 0
              ? 'No results found'
              : `${resultsCount} result${resultsCount !== 1 ? 's' : ''}`}
          </div>
        )}
      </div>
    )
  }
)

SearchInput.displayName = 'SearchInput'
