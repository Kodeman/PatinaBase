import fs from 'fs';
import path from 'path';
import { render, screen } from '@testing-library/react';
import type { EditableMoodBoardItem } from '@patina/types';
import { renderBoardRoomItem } from './board-item-renderer';

function item(overrides: Partial<EditableMoodBoardItem>): EditableMoodBoardItem {
  return {
    id: 'item-1',
    type: 'image',
    x: 0,
    y: 0,
    width: 200,
    height: 200,
    ...overrides,
  };
}

describe('renderBoardRoomItem — Edit-mode placeholder parity (VD12)', () => {
  it('captions an imageless image item with its name, like the Present-mode tile does', () => {
    render(
      <>
        {renderBoardRoomItem(
          item({ data: { name: 'Floor plan reference' } }),
        )}
      </>,
    );

    expect(screen.getByText('Floor plan reference')).toBeInTheDocument();
    expect(screen.queryByText('Missing image')).not.toBeInTheDocument();
  });

  it('falls back to a friendly "No image" caption when the item has no name at all', () => {
    render(<>{renderBoardRoomItem(item({}))}</>);

    expect(screen.getByText('No image')).toBeInTheDocument();
  });

  it('ignores a blank/whitespace-only name and falls back to "No image"', () => {
    render(<>{renderBoardRoomItem(item({ data: { name: '   ' } }))}</>);

    expect(screen.getByText('No image')).toBeInTheDocument();
  });

  it('renders the real image, not a placeholder, once image_url is set', () => {
    render(
      <>
        {renderBoardRoomItem(
          item({ imageUrl: 'https://images.example/plan.jpg', data: { name: 'Floor plan' } }),
        )}
      </>,
    );

    expect(screen.queryByText('Floor plan')).not.toBeInTheDocument();
    const image = screen.getByRole('img');
    expect(image).toHaveAttribute('src', 'https://images.example/plan.jpg');
  });

  it('still shows the item name as a caption for an imageless product pin (unchanged sibling behavior)', () => {
    render(
      <>
        {renderBoardRoomItem(
          item({ type: 'product', data: { name: 'Halyard chair' } }),
        )}
      </>,
    );

    expect(screen.getByText('Halyard chair')).toBeInTheDocument();
  });
});

describe('renderBoardRoomItem — note card tokens, not raw hex (VD1/VD18)', () => {
  it('renders the note content with no shadow-* utility on the card', () => {
    render(<>{renderBoardRoomItem(item({ type: 'note', content: 'Remember the trim' }))}</>);

    const card = screen.getByText('Remember the trim').parentElement as HTMLElement;
    expect(card.className).not.toMatch(/shadow-/);
  });

  it('draws the note as text on the house note edge, in tokens, never raw hex (US-28 S12)', () => {
    // jsdom's cssstyle validates color-typed CSS properties and silently
    // drops var(...) values from computed inline style, so the token swap
    // can't be asserted by inspecting rendered style — read the source
    // instead, the same grep-style check this repo's D4 shadow audit uses.
    const source = fs.readFileSync(
      path.join(__dirname, 'board-item-renderer.tsx'),
      'utf8',
    );
    const noteCardSource = source.slice(source.indexOf('function NoteCard'));
    expect(noteCardSource).not.toMatch(/#E0D2B8|#F3E9D5|#4A4137/i);
    // US-28 S12 (frame p1): the warm-paper sticky became text on the one
    // non-stage note edge, on the board's own stock.
    expect(noteCardSource).toContain('var(--edge-note)');
    expect(noteCardSource).not.toMatch(/shadow-|backgroundColor/);
  });
});

describe('renderBoardRoomItem — plate and caption (US-28 S12)', () => {
  it('prints a product as a plate and a whole caption: no shadow, clamp or truncate', () => {
    const { container } = render(
      <>
        {renderBoardRoomItem(
          item({
            type: 'product',
            data: { name: 'Arden lounge chair', vendor_name: 'Calloway & Brandt Upholstery', price_cents: 418000 },
          }),
        )}
      </>,
    );

    expect(screen.getByText('Arden lounge chair')).toBeInTheDocument();
    expect(screen.getByText('Calloway & Brandt Upholstery · $4,180')).toBeInTheDocument();
    expect(container.querySelector('.br-plate')).not.toBeNull();
    expect(container.innerHTML).not.toMatch(/shadow-|truncate|line-clamp/);
  });
});
