import { render, screen } from '@testing-library/react';
import { BoardCoverArt } from './board-cover-art';

describe('BoardCoverArt', () => {
  it('prefers a generated cover over pin images', () => {
    const { container } = render(
      <BoardCoverArt
        name="Living room"
        coverUrl="https://images.example/generated.jpg"
        fallbackUrls={['https://images.example/pin.jpg']}
      />,
    );

    const images = container.querySelectorAll('img');
    expect(images).toHaveLength(1);
    expect(images[0]).toHaveAttribute('src', 'https://images.example/generated.jpg');
  });

  it('renders at most four fallback pins as a mosaic', () => {
    const { container } = render(
      <BoardCoverArt
        name="Living room"
        fallbackUrls={['one.jpg', 'two.jpg', 'three.jpg', 'four.jpg', 'five.jpg']}
      />,
    );

    expect(container.querySelector('[data-board-cover="mosaic"]')).toBeInTheDocument();
    expect(
      Array.from(container.querySelectorAll('img')).map((image) => image.getAttribute('src')),
    ).toEqual(['one.jpg', 'two.jpg', 'three.jpg', 'four.jpg']);
  });

  it('falls back to a monogram when no image is available', () => {
    render(<BoardCoverArt name="  kitchen" fallbackUrls={[]} />);
    expect(screen.getByText('K')).toBeInTheDocument();
  });
});
