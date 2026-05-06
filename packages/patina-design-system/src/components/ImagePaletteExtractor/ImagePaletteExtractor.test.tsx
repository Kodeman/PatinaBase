import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ImagePaletteExtractor } from './ImagePaletteExtractor'

describe('ImagePaletteExtractor', () => {
  it('renders the source image preview', () => {
    render(
      <ImagePaletteExtractor
        imageUrl="https://example.com/test.jpg"
        k={5}
        onExtracted={vi.fn()}
      />
    )

    const img = screen.getByRole('img')
    expect(img).toHaveAttribute('src', 'https://example.com/test.jpg')
  })

  it('hides preview when showPreview is false', () => {
    render(
      <ImagePaletteExtractor
        imageUrl="https://example.com/test.jpg"
        k={5}
        showPreview={false}
        onExtracted={vi.fn()}
      />
    )
    expect(screen.queryByRole('img')).toBeNull()
  })

  // Note: a full extraction test would require:
  //   1. A jsdom canvas implementation (not present by default)
  //   2. A Worker shim (not present by default)
  // These are integration concerns and exercised in Storybook, not unit tests.
})
