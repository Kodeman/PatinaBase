/**
 * A punch item raised from Field shows the photo it was taken from (FC-R15),
 * on the same line the GC's work is listed on. A task typed at the desk shows
 * nothing new — which is the "renders nothing on a field-less project" claim,
 * one surface further in.
 *
 * PunchPhoto takes a resolved url and no hooks at all: the query and the
 * signing are batched once in the Work block, over every task on the section.
 * leadPhotoUrls is the pure part of that batching and is tested here beside it.
 */
import { render, screen } from '@testing-library/react';
import { PunchPhoto, leadPhotoUrls } from '../work-block';

describe('PunchPhoto', () => {
  it('renders nothing for a task that came from no capture', () => {
    const { container } = render(<PunchPhoto url={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the photo the punch item was taken from', () => {
    render(<PunchPhoto url="https://signed/a" />);
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://signed/a');
  });
});

describe('leadPhotoUrls', () => {
  it('asks for one lead photo per punch item, and nothing for desk tasks', () => {
    expect(
      leadPhotoUrls(
        [
          { field_capture_id: 'cap-1' },
          { field_capture_id: null },
          { field_capture_id: 'cap-2' },
        ],
        { 'cap-1': ['a.heic', 'b.heic'], 'cap-2': ['c.heic'] },
        {},
      ).paths,
    ).toEqual(['a.heic', 'c.heic']);
  });

  it('resolves each task to its signed url, or to null while it is unsigned', () => {
    const { byTaskCapture } = leadPhotoUrls(
      [{ field_capture_id: 'cap-1' }, { field_capture_id: 'cap-2' }],
      { 'cap-1': ['a.heic'], 'cap-2': ['c.heic'] },
      { 'a.heic': 'https://signed/a' },
    );
    expect(byTaskCapture['cap-1']).toBe('https://signed/a');
    expect(byTaskCapture['cap-2']).toBeNull();
  });
});
