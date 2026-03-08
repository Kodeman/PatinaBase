import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Carousel, CarouselItem } from './Carousel'

describe('Carousel', () => {
  it('renders carousel with slides', () => {
    render(
      <Carousel>
        <div>Slide 1</div>
        <div>Slide 2</div>
        <div>Slide 3</div>
      </Carousel>
    )

    expect(screen.getByText('Slide 1')).toBeInTheDocument()
    expect(screen.getByText('Slide 2')).toBeInTheDocument()
    expect(screen.getByText('Slide 3')).toBeInTheDocument()
  })

  it('renders navigation buttons', () => {
    render(
      <Carousel showNavigation>
        <div>Slide 1</div>
        <div>Slide 2</div>
      </Carousel>
    )

    expect(screen.getByLabelText('Previous slide')).toBeInTheDocument()
    expect(screen.getByLabelText('Next slide')).toBeInTheDocument()
  })

  it('hides navigation when disabled', () => {
    render(
      <Carousel showNavigation={false}>
        <div>Slide 1</div>
        <div>Slide 2</div>
      </Carousel>
    )

    expect(screen.queryByLabelText('Previous slide')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Next slide')).not.toBeInTheDocument()
  })

  it('renders dots indicator', () => {
    render(
      <Carousel showDots>
        <div>Slide 1</div>
        <div>Slide 2</div>
        <div>Slide 3</div>
      </Carousel>
    )

    expect(screen.getByLabelText('Go to slide 1')).toBeInTheDocument()
    expect(screen.getByLabelText('Go to slide 2')).toBeInTheDocument()
    expect(screen.getByLabelText('Go to slide 3')).toBeInTheDocument()
  })

  it('calls onSlideChange callback', async () => {
    const onSlideChange = vi.fn()

    render(
      <Carousel onSlideChange={onSlideChange}>
        <div>Slide 1</div>
        <div>Slide 2</div>
      </Carousel>
    )

    // Wait for initial render
    await vi.waitFor(() => {
      expect(onSlideChange).toHaveBeenCalled()
    })
  })

  it('renders CarouselItem', () => {
    render(
      <Carousel>
        <CarouselItem>
          <div>Content</div>
        </CarouselItem>
      </Carousel>
    )

    expect(screen.getByText('Content')).toBeInTheDocument()
  })
})
