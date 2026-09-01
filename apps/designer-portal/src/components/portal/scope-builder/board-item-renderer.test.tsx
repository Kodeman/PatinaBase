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

  it('uses design tokens for the warm-paper palette, not raw parchment hex', () => {
    // jsdom's cssstyle validates color-typed CSS properties and silently
    // drops var(...) values from computed inline style, so the token swap
    // can't be asserted by inspecting rendered style — read the source
    // instead, the same grep-style check this repo's D4 shadow audit uses.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path');
    const source = fs.readFileSync(
      path.join(__dirname, 'board-item-renderer.tsx'),
      'utf8',
    );
    const noteCardSource = source.slice(source.indexOf('function NoteCard'));
    expect(noteCardSource).not.toMatch(/#E0D2B8|#F3E9D5|#4A4137/i);
    expect(noteCardSource).toContain('var(--bg-warm)');
    expect(noteCardSource).toContain('var(--border-warm)');
    expect(noteCardSource).toContain('var(--color-bark)');
  });
});
