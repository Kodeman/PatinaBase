'use client'

import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../utils/cn'
import { usePagination } from '../../hooks/usePagination'

const paginationVariants = cva('flex items-center gap-1', {
  variants: {
    size: {
      sm: 'text-xs',
      md: 'text-sm',
      lg: 'text-base',
    },
  },
  defaultVariants: {
    size: 'md',
  },
})

const paginationItemVariants = cva(
  'inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'hover:bg-accent hover:text-accent-foreground data-[active=true]:bg-primary data-[active=true]:text-primary-foreground',
        outline:
          'border border-input hover:bg-accent hover:text-accent-foreground data-[active=true]:border-primary data-[active=true]:bg-primary data-[active=true]:text-primary-foreground',
      },
      size: {
        sm: 'h-7 min-w-7 px-2',
        md: 'h-9 min-w-9 px-3',
        lg: 'h-11 min-w-11 px-4',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  }
)

export interface PaginationProps
  extends React.ComponentPropsWithoutRef<'nav'>,
    VariantProps<typeof paginationVariants> {
  total: number
  currentPage: number
  pageSize: number
  siblings?: number
  variant?: 'default' | 'outline'
  compact?: boolean
  showFirstLast?: boolean
  onPageChange?: (page: number) => void
}

/**
 * Pagination component for navigating through pages
 *
 * @example
 * ```tsx
 * const [page, setPage] = useState(1)
 *
 * <Pagination
 *   total={100}
 *   currentPage={page}
 *   pageSize={10}
 *   onPageChange={setPage}
 * />
 * ```
 */
const Pagination = React.forwardRef<HTMLElement, PaginationProps>(
  (
    {
      total,
      currentPage,
      pageSize,
      siblings = 1,
      variant = 'default',
      size,
      compact = false,
      showFirstLast = true,
      onPageChange,
      className,
      ...props
    },
    ref
  ) => {
    const { pages, totalPages, hasNext, hasPrevious } = usePagination({
      total,
      currentPage,
      pageSize,
      siblings,
    })

    const handlePageChange = (page: number) => {
      if (page >= 1 && page <= totalPages) {
        onPageChange?.(page)
      }
    }

    if (compact) {
      return (
        <nav
          ref={ref}
          role="navigation"
          aria-label="Pagination"
          className={cn(paginationVariants({ size }), className)}
          {...props}
        >
          <button
            className={cn(paginationItemVariants({ variant, size }))}
            disabled={!hasPrevious}
            onClick={() => handlePageChange(currentPage - 1)}
            aria-label="Previous page"
          >
            ←
          </button>
          <span className="px-2 text-sm text-muted-foreground">
            Page {currentPage} of {totalPages}
          </span>
          <button
            className={cn(paginationItemVariants({ variant, size }))}
            disabled={!hasNext}
            onClick={() => handlePageChange(currentPage + 1)}
            aria-label="Next page"
          >
            →
          </button>
        </nav>
      )
    }

    return (
      <nav
        ref={ref}
        role="navigation"
        aria-label="Pagination"
        className={cn(paginationVariants({ size }), className)}
        {...props}
      >
        {showFirstLast && (
          <button
            className={cn(paginationItemVariants({ variant, size }))}
            disabled={!hasPrevious}
            onClick={() => handlePageChange(1)}
            aria-label="First page"
          >
            ««
          </button>
        )}

        <button
          className={cn(paginationItemVariants({ variant, size }))}
          disabled={!hasPrevious}
          onClick={() => handlePageChange(currentPage - 1)}
          aria-label="Previous page"
        >
          ←
        </button>

        {pages.map((page, index) => {
          if (page === 'ellipsis') {
            return (
              <span
                key={`ellipsis-${index}`}
                className="inline-flex h-9 min-w-9 items-center justify-center px-2"
                aria-hidden="true"
              >
                ...
              </span>
            )
          }

          return (
            <button
              key={page}
              className={cn(paginationItemVariants({ variant, size }))}
              data-active={currentPage === page}
              onClick={() => handlePageChange(page)}
              aria-label={`Page ${page}`}
              aria-current={currentPage === page ? 'page' : undefined}
            >
              {page}
            </button>
          )
        })}

        <button
          className={cn(paginationItemVariants({ variant, size }))}
          disabled={!hasNext}
          onClick={() => handlePageChange(currentPage + 1)}
          aria-label="Next page"
        >
          →
        </button>

        {showFirstLast && (
          <button
            className={cn(paginationItemVariants({ variant, size }))}
            disabled={!hasNext}
            onClick={() => handlePageChange(totalPages)}
            aria-label="Last page"
          >
            »»
          </button>
        )}
      </nav>
    )
  }
)
Pagination.displayName = 'Pagination'

export { Pagination, usePagination }
