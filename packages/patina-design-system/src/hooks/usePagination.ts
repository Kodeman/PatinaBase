import { useMemo } from 'react'

export interface UsePaginationProps {
  total: number
  currentPage: number
  pageSize: number
  siblings?: number
}

export interface UsePaginationReturn {
  pages: (number | 'ellipsis')[]
  totalPages: number
  hasNext: boolean
  hasPrevious: boolean
}

const range = (start: number, end: number) => {
  const length = end - start + 1
  return Array.from({ length }, (_, i) => start + i)
}

/**
 * Hook for calculating pagination pages with ellipsis
 *
 * @example
 * ```tsx
 * const { pages, totalPages, hasNext, hasPrevious } = usePagination({
 *   total: 100,
 *   currentPage: 5,
 *   pageSize: 10,
 *   siblings: 1
 * })
 * ```
 */
export function usePagination({
  total,
  currentPage,
  pageSize,
  siblings = 1,
}: UsePaginationProps): UsePaginationReturn {
  const totalPages = Math.ceil(total / pageSize)

  const pages = useMemo(() => {
    // Total page numbers to show
    const totalPageNumbers = siblings * 2 + 5 // siblings on each side + first + last + current + 2 ellipsis

    // Case 1: If total pages is less than total page numbers, show all
    if (totalPageNumbers >= totalPages) {
      return range(1, totalPages)
    }

    const leftSiblingIndex = Math.max(currentPage - siblings, 1)
    const rightSiblingIndex = Math.min(currentPage + siblings, totalPages)

    const shouldShowLeftEllipsis = leftSiblingIndex > 2
    const shouldShowRightEllipsis = rightSiblingIndex < totalPages - 1

    const firstPageIndex = 1
    const lastPageIndex = totalPages

    // Case 2: No left ellipsis, but right ellipsis
    if (!shouldShowLeftEllipsis && shouldShowRightEllipsis) {
      const leftItemCount = 3 + 2 * siblings
      const leftRange = range(1, leftItemCount)

      return [...leftRange, 'ellipsis' as const, totalPages]
    }

    // Case 3: Left ellipsis, but no right ellipsis
    if (shouldShowLeftEllipsis && !shouldShowRightEllipsis) {
      const rightItemCount = 3 + 2 * siblings
      const rightRange = range(totalPages - rightItemCount + 1, totalPages)

      return [firstPageIndex, 'ellipsis' as const, ...rightRange]
    }

    // Case 4: Both left and right ellipsis
    if (shouldShowLeftEllipsis && shouldShowRightEllipsis) {
      const middleRange = range(leftSiblingIndex, rightSiblingIndex)

      return [
        firstPageIndex,
        'ellipsis' as const,
        ...middleRange,
        'ellipsis' as const,
        lastPageIndex,
      ]
    }

    return []
  }, [totalPages, currentPage, siblings])

  return {
    pages,
    totalPages,
    hasNext: currentPage < totalPages,
    hasPrevious: currentPage > 1,
  }
}
