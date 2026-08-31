/**
 * FieldNoteMedia — the margin's play button and photo strip (§11.4), signed
 * through useCaptureMediaUrls (§11.1). One signing call for the audio and the
 * photos together: letterhead-instruments.tsx:123 is the in-repo precedent for
 * batching rather than one round-trip per path.
 */
import { render, screen } from '@testing-library/react';
import { FieldNoteMedia } from '../field-note-media';

const signed = jest.fn();
jest.mock('@patina/supabase', () => ({
  useCaptureMediaUrls: (paths: readonly string[], ttl?: number) => signed(paths, ttl),
}));

describe('FieldNoteMedia', () => {
  beforeEach(() => signed.mockReset());

  it('renders nothing at all when there is no field media', () => {
    signed.mockReturnValue({ data: undefined, isLoading: false });
    const { container } = render(
      <FieldNoteMedia audioPaths={[]} photoPaths={[]} durationSeconds={null} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('signs the audio and the photos in one batched call', () => {
    signed.mockReturnValue({ data: {}, isLoading: true });
    render(
      <FieldNoteMedia
        audioPaths={['a/voice-000.m4a', 'a/voice-001.m4a']}
        photoPaths={['a/photo-0.heic']}
        durationSeconds={64.5}
      />,
    );
    expect(signed).toHaveBeenCalledTimes(1);
    expect(signed.mock.calls[0][0]).toEqual([
      'a/voice-000.m4a',
      'a/voice-001.m4a',
      'a/photo-0.heic',
    ]);
  });

  it('plays the first segment and states how long the note runs', () => {
    signed.mockReturnValue({
      data: { 'a/voice-000.m4a': 'https://signed/voice-000' },
      isLoading: false,
    });
    render(
      <FieldNoteMedia audioPaths={['a/voice-000.m4a']} photoPaths={[]} durationSeconds={64.5} />,
    );
    const audio = screen.getByTestId('field-note-audio-0');
    expect(audio).toHaveAttribute('src', 'https://signed/voice-000');
    expect(screen.getByText('1:04')).toBeInTheDocument();
  });

  it('renders one player per segment, in capture order', () => {
    signed.mockReturnValue({
      data: {
        'a/voice-000.m4a': 'https://signed/voice-000',
        'a/voice-001.m4a': 'https://signed/voice-001',
      },
      isLoading: false,
    });
    render(
      <FieldNoteMedia
        audioPaths={['a/voice-000.m4a', 'a/voice-001.m4a']}
        photoPaths={[]}
        durationSeconds={null}
      />,
    );
    expect(screen.getByTestId('field-note-audio-0')).toHaveAttribute('src', 'https://signed/voice-000');
    expect(screen.getByTestId('field-note-audio-1')).toHaveAttribute('src', 'https://signed/voice-001');
  });

  it('shows the photos it could sign and says plainly when one would not', () => {
    signed.mockReturnValue({
      data: { 'a/photo-0.heic': 'https://signed/photo-0' },
      isLoading: false,
    });
    render(
      <FieldNoteMedia
        audioPaths={[]}
        photoPaths={['a/photo-0.heic', 'a/photo-1.heic']}
        durationSeconds={null}
      />,
    );
    expect(screen.getAllByRole('img')).toHaveLength(1);
    expect(screen.getByText('1 photo needs signal.')).toBeInTheDocument();
  });

  it('says it is still fetching rather than showing an empty strip', () => {
    signed.mockReturnValue({ data: undefined, isLoading: true });
    render(
      <FieldNoteMedia audioPaths={['a/voice-000.m4a']} photoPaths={[]} durationSeconds={null} />,
    );
    expect(screen.getByText('Fetching the recording…')).toBeInTheDocument();
    expect(screen.queryByTestId('field-note-audio-0')).not.toBeInTheDocument();
  });
});
