/**
 * US-28 S10c (V20 U-Q20): each side of a style comparison is plate and
 * caption, never a card, and the whole unit is the one button that picks it.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { JudgmentCard } from '../judgment-card';

describe('JudgmentCard — plate and caption', () => {
  it('is one button: a plate mat over a caption naming the piece and maker', () => {
    const onPick = jest.fn();
    render(
      <JudgmentCard
        product={{
          name: 'Arden lounge chair',
          brand: 'Calloway & Brandt Upholstery',
          images: ['https://example.test/arden.jpg'],
        }}
        onPick={onPick}
      />,
    );

    const button = screen.getByRole('button', {
      name: /Arden lounge chair.*Calloway & Brandt Upholstery/,
    });
    expect(button).toHaveClass('judgment-plate');
    expect(button).not.toHaveClass('card');
    expect(button.className).not.toMatch(/rounded-\[4px\]|border|bg-/);

    const plate = button.querySelector('.plate') as HTMLElement;
    expect(plate).not.toBeNull();
    expect(plate.querySelector('img')).toHaveAttribute('src', 'https://example.test/arden.jpg');

    const caption = button.querySelector('.cap') as HTMLElement;
    expect(caption).toHaveTextContent('Arden lounge chair');
    expect(caption.querySelector('.name')).toHaveTextContent('Arden lounge chair');

    fireEvent.click(button);
    expect(onPick).toHaveBeenCalledTimes(1);
  });

  it('names the piece on the plate when there is no picture', () => {
    render(
      <JudgmentCard
        product={{ name: 'Halo floor lamp', brand: null, images: null }}
        onPick={jest.fn()}
      />,
    );
    const button = screen.getByRole('button');
    expect(button.querySelector('.plate')).toHaveTextContent('Halo floor lamp');
    expect(button.querySelector('.cap')).toHaveTextContent('Halo floor lamp');
  });
});
