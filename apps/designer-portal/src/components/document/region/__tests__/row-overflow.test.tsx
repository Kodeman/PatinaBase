import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { RowOverflow } from '../row-overflow';

function Rows() {
  const [openKey, setOpenKey] = useState<string | null>(null);
  return (
    <ul>
      {['a', 'b'].map((rowKey) => (
        <li key={rowKey}>
          <RowOverflow
            rowKey={rowKey}
            openKey={openKey}
            onOpenChange={setOpenKey}
            surfaceKey="document"
            regionKey="ffe"
            label={`More actions for ${rowKey}`}
          >
            <button type="button">verb {rowKey}</button>
          </RowOverflow>
        </li>
      ))}
    </ul>
  );
}

const glyph = (rowKey: string) =>
  screen.getByRole('button', { name: `More actions for ${rowKey}` });

describe('RowOverflow', () => {
  it('always shows the glyph, collapsed', () => {
    render(<Rows />);
    expect(glyph('a')).toHaveAttribute('aria-expanded', 'false');
    expect(glyph('b')).toBeInTheDocument();
  });

  it('unmounts collapsed verbs rather than hiding them', () => {
    render(<Rows />);
    expect(screen.queryByRole('button', { name: 'verb a' })).toBeNull();
    fireEvent.click(glyph('a'));
    expect(screen.getByRole('button', { name: 'verb a' })).toBeInTheDocument();
    expect(glyph('a')).toHaveAttribute('aria-expanded', 'true');
    expect(glyph('a')).toHaveAttribute('aria-controls', 'row-verbs-a');
    expect(document.getElementById('row-verbs-a')).not.toBeNull();
  });

  it('lets only one row hold its verbs open', () => {
    render(<Rows />);
    fireEvent.click(glyph('a'));
    fireEvent.click(glyph('b'));
    expect(screen.queryByRole('button', { name: 'verb a' })).toBeNull();
    expect(screen.getByRole('button', { name: 'verb b' })).toBeInTheDocument();
  });

  it('closes on Escape from inside the cluster and returns focus to the glyph', () => {
    render(<Rows />);
    fireEvent.click(glyph('a'));
    const verb = screen.getByRole('button', { name: 'verb a' });
    verb.focus();
    fireEvent.keyDown(verb, { key: 'Escape' });
    expect(screen.queryByRole('button', { name: 'verb a' })).toBeNull();
    expect(glyph('a')).toHaveFocus();
  });

  it('closes on a second press of the glyph', () => {
    render(<Rows />);
    fireEvent.click(glyph('a'));
    fireEvent.click(glyph('a'));
    expect(screen.queryByRole('button', { name: 'verb a' })).toBeNull();
  });
});
