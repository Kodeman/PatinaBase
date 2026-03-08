import {
  cn,
  formatDate,
  formatDateTime,
  formatCurrency,
  formatNumber,
  truncate,
  debounce,
  generateId,
  getInitials,
  parseJSON,
} from '../utils'

describe('utils', () => {
  describe('cn', () => {
    it('should merge class names correctly', () => {
      expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4')
    })

    it('should handle conditional classes', () => {
      expect(cn('base', true && 'active', false && 'disabled')).toBe('base active')
    })

    it('should handle arrays and objects', () => {
      expect(cn(['base', 'text-sm'], { active: true, disabled: false })).toBe('base text-sm active')
    })
  })

  describe('formatDate', () => {
    it('should format Date object correctly', () => {
      const date = new Date('2024-01-15')
      const formatted = formatDate(date)
      expect(formatted).toMatch(/Jan 1[45], 2024/)
    })

    it('should format date string correctly', () => {
      const formatted = formatDate('2024-03-20')
      expect(formatted).toMatch(/Mar 2[01], 2024/)
    })
  })

  describe('formatDateTime', () => {
    it('should format Date with time', () => {
      const date = new Date('2024-01-15T10:30:00')
      const formatted = formatDateTime(date)
      expect(formatted).toMatch(/Jan 1[45], 2024/)
      expect(formatted).toMatch(/10:30/)
    })
  })

  describe('formatCurrency', () => {
    it('should format USD currency by default', () => {
      expect(formatCurrency(1234.56)).toBe('$1,234.56')
    })

    it('should format other currencies', () => {
      expect(formatCurrency(1234.56, 'EUR')).toMatch(/1,234\.56/)
    })

    it('should handle zero', () => {
      expect(formatCurrency(0)).toBe('$0.00')
    })

    it('should handle negative numbers', () => {
      expect(formatCurrency(-100)).toBe('-$100.00')
    })
  })

  describe('formatNumber', () => {
    it('should format numbers with commas', () => {
      expect(formatNumber(1234567)).toBe('1,234,567')
    })

    it('should handle small numbers', () => {
      expect(formatNumber(42)).toBe('42')
    })

    it('should handle zero', () => {
      expect(formatNumber(0)).toBe('0')
    })
  })

  describe('truncate', () => {
    it('should truncate long strings', () => {
      expect(truncate('Hello World', 5)).toBe('Hello...')
    })

    it('should not truncate short strings', () => {
      expect(truncate('Hi', 10)).toBe('Hi')
    })

    it('should handle exact length', () => {
      expect(truncate('Hello', 5)).toBe('Hello')
    })
  })

  describe('debounce', () => {
    jest.useFakeTimers()

    it('should debounce function calls', () => {
      const func = jest.fn()
      const debouncedFunc = debounce(func, 100)

      debouncedFunc()
      debouncedFunc()
      debouncedFunc()

      expect(func).not.toHaveBeenCalled()

      jest.advanceTimersByTime(100)

      expect(func).toHaveBeenCalledTimes(1)
    })

    it('should pass arguments correctly', () => {
      const func = jest.fn()
      const debouncedFunc = debounce(func, 100)

      debouncedFunc('test', 123)

      jest.advanceTimersByTime(100)

      expect(func).toHaveBeenCalledWith('test', 123)
    })

    afterAll(() => {
      jest.useRealTimers()
    })
  })

  describe('generateId', () => {
    it('should generate a string', () => {
      const id = generateId()
      expect(typeof id).toBe('string')
    })

    it('should generate unique ids', () => {
      const id1 = generateId()
      const id2 = generateId()
      expect(id1).not.toBe(id2)
    })

    it('should generate ids of reasonable length', () => {
      const id = generateId()
      expect(id.length).toBeGreaterThan(0)
      expect(id.length).toBeLessThanOrEqual(13)
    })
  })

  describe('getInitials', () => {
    it('should get initials from full name', () => {
      expect(getInitials('John Doe')).toBe('JD')
    })

    it('should handle single name', () => {
      expect(getInitials('John')).toBe('J')
    })

    it('should handle three names', () => {
      expect(getInitials('John Paul Jones')).toBe('JP')
    })

    it('should uppercase initials', () => {
      expect(getInitials('alice bob')).toBe('AB')
    })
  })

  describe('parseJSON', () => {
    it('should parse valid JSON', () => {
      expect(parseJSON('{"key":"value"}')).toEqual({ key: 'value' })
    })

    it('should return undefined for invalid JSON', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation()
      expect(parseJSON('invalid')).toBeUndefined()
      consoleSpy.mockRestore()
    })

    it('should return undefined for null', () => {
      expect(parseJSON(null)).toBeUndefined()
    })

    it('should handle "undefined" string', () => {
      expect(parseJSON('undefined')).toBeUndefined()
    })

    it('should parse arrays', () => {
      expect(parseJSON('[1,2,3]')).toEqual([1, 2, 3])
    })
  })
})
