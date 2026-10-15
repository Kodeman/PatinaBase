// Learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom'
import { TextEncoder, TextDecoder } from 'util'

// Add TextEncoder/TextDecoder to global for tests that need them
global.TextEncoder = TextEncoder
global.TextDecoder = TextDecoder

// jsdom 20 (jest-environment-jsdom 29) has no Blob#arrayBuffer, which the
// media uploader's file-signature check calls on file.slice(...).
if (typeof Blob !== 'undefined' && !Blob.prototype.arrayBuffer) {
  Blob.prototype.arrayBuffer = function arrayBuffer() {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => reject(reader.error)
      reader.readAsArrayBuffer(this)
    })
  }
}

// Mock canvas to avoid native dependency issues in tests
jest.mock('canvas', () => {}, { virtual: true })

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter() {
    return {
      push: jest.fn(),
      replace: jest.fn(),
      prefetch: jest.fn(),
      back: jest.fn(),
      pathname: '/',
      query: {},
      asPath: '/',
    }
  },
  usePathname() {
    return '/'
  },
  useSearchParams() {
    return new URLSearchParams()
  },
}))

// Mock fetch globally
global.fetch = jest.fn()

// jsdom has no matchMedia implementation. useMediaQuery (the ambient QR
// badge's viewport gate) calls window.matchMedia on mount; without a stub
// every such test throws "matchMedia is not a function". Default to no
// match — tests that need the desktop breakpoint override this per-test.
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  })
}

// Reset all mocks between tests
beforeEach(() => {
  jest.clearAllMocks()
})
