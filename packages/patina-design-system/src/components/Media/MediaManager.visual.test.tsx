import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { composeStories } from '@storybook/react'
import * as stories from './MediaManager.stories'

const { DefaultManager, GalleryOverview, FileUploader } = composeStories(stories)

describe('Media components visual regression', () => {
  it('renders the media manager toolbar and search affordances', () => {
    const { container } = render(<DefaultManager />)
    expect(screen.getByText('Media Library')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Search assets...')).toBeInTheDocument()
    expect(container.querySelectorAll('button').length).toBeGreaterThan(0)
  })

  it('renders gallery asset cards with titles', () => {
    render(<GalleryOverview />)
    expect(screen.getByText('Living Room Hero.jpg')).toBeInTheDocument()
    expect(screen.getByText('Modular Sofa Render.glb')).toBeInTheDocument()
  })

  it('displays uploader dropzone guidance', () => {
    render(<FileUploader />)
    expect(screen.getByText(/Drag & drop files here/i)).toBeInTheDocument()
    expect(
      screen.getByText('Supports images, videos, 3D models, and documents')
    ).toBeInTheDocument()
  })
})
