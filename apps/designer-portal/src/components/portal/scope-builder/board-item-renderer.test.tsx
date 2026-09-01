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
