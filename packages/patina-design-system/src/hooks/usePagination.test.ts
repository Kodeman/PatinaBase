import { renderHook } from '@testing-library/react'
import { usePagination } from './usePagination'

describe('usePagination', () => {
  it('calculates total pages correctly', () => {
    const { result } = renderHook(() =>
      usePagination({
        total: 100,
        currentPage: 1,
        pageSize: 10,
      })
    )

    expect(result.current.totalPages).toBe(10)
  })

  it('shows all pages when total pages is small', () => {
    const { result } = renderHook(() =>
      usePagination({
        total: 50,
        currentPage: 3,
        pageSize: 10,
        siblings: 1,
      })
    )

    expect(result.current.pages).toEqual([1, 2, 3, 4, 5])
  })

  it('shows right ellipsis when needed', () => {
    const { result } = renderHook(() =>
      usePagination({
        total: 100,
        currentPage: 2,
        pageSize: 10,
        siblings: 1,
      })
    )

    expect(result.current.pages).toEqual([1, 2, 3, 4, 5, 'ellipsis', 10])
  })

  it('shows left ellipsis when needed', () => {
    const { result } = renderHook(() =>
      usePagination({
        total: 100,
        currentPage: 9,
        pageSize: 10,
        siblings: 1,
      })
    )

    expect(result.current.pages).toEqual([1, 'ellipsis', 6, 7, 8, 9, 10])
  })

  it('shows both ellipsis when in the middle', () => {
    const { result } = renderHook(() =>
      usePagination({
        total: 100,
        currentPage: 5,
        pageSize: 10,
        siblings: 1,
      })
    )

    expect(result.current.pages).toEqual([1, 'ellipsis', 4, 5, 6, 'ellipsis', 10])
  })

  it('calculates hasNext correctly', () => {
    const { result: resultWithNext } = renderHook(() =>
      usePagination({
        total: 100,
        currentPage: 5,
        pageSize: 10,
      })
    )

    expect(resultWithNext.current.hasNext).toBe(true)

    const { result: resultWithoutNext } = renderHook(() =>
      usePagination({
        total: 100,
        currentPage: 10,
        pageSize: 10,
      })
    )

    expect(resultWithoutNext.current.hasNext).toBe(false)
  })

  it('calculates hasPrevious correctly', () => {
    const { result: resultWithPrevious } = renderHook(() =>
      usePagination({
        total: 100,
        currentPage: 5,
        pageSize: 10,
      })
    )

    expect(resultWithPrevious.current.hasPrevious).toBe(true)

    const { result: resultWithoutPrevious } = renderHook(() =>
      usePagination({
        total: 100,
        currentPage: 1,
        pageSize: 10,
      })
    )

    expect(resultWithoutPrevious.current.hasPrevious).toBe(false)
  })

  it('supports custom siblings count', () => {
    const { result } = renderHook(() =>
      usePagination({
        total: 100,
        currentPage: 5,
        pageSize: 10,
        siblings: 2,
      })
    )

    expect(result.current.pages).toEqual([1, 'ellipsis', 3, 4, 5, 6, 7, 'ellipsis', 10])
  })

  it('handles edge case with 1 page', () => {
    const { result } = renderHook(() =>
      usePagination({
        total: 5,
        currentPage: 1,
        pageSize: 10,
      })
    )

    expect(result.current.pages).toEqual([1])
    expect(result.current.hasNext).toBe(false)
    expect(result.current.hasPrevious).toBe(false)
  })
})
