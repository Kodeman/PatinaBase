import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FieldTaskRow } from '../field-actions';
import { reportProblem } from '../actions';
import { downscalePhoto } from '../downscale-photo';

jest.mock('../actions', () => ({
  completeItem: jest.fn(),
  confirmDelivery: jest.fn(),
  reportProblem: jest.fn(),
}));
jest.mock('../downscale-photo', () => ({
  downscalePhoto: jest.fn(),
}));

function makeFile(bytes: number, name = 'photo.jpg', type = 'image/jpeg'): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

function openProblemForm() {
  render(
    <FieldTaskRow token="tok" target={{ kind: 'task', id: 't1' }} title="Install trim" dueDate={null} />,
  );
  fireEvent.click(screen.getByText('Problem'));
}

function attachPhoto(file: File) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
}

describe('FieldTaskRow — Problem photo submit', () => {
  beforeEach(() => {
    (reportProblem as jest.Mock).mockResolvedValue({ ok: true, summaryText: 'Sent.' });
  });

  it('skips attaching an oversized fallback photo and warns the guest instead of hitting the action ceiling', async () => {
    const original = makeFile(11 * 1024 * 1024, 'big.heic');
    // Simulates downscale falling back to the original because of a codec/canvas failure.
    (downscalePhoto as jest.Mock).mockResolvedValue(original);

    openProblemForm();
    attachPhoto(original);

    await waitFor(() => expect(downscalePhoto).toHaveBeenCalled());

    fireEvent.click(screen.getByText('Send'));

    await waitFor(() => expect(reportProblem).toHaveBeenCalled());
    // formData arg (4th param) must be undefined — no oversized photo attached.
    expect((reportProblem as jest.Mock).mock.calls[0][3]).toBeUndefined();

    expect(
      await screen.findByText('Your photo was too large to send, so only your note went through.'),
    ).toBeInTheDocument();
  });

  it('attaches a photo that downscaled under the threshold', async () => {
    const small = makeFile(2 * 1024 * 1024, 'small.jpg');
    (downscalePhoto as jest.Mock).mockResolvedValue(small);

    openProblemForm();
    attachPhoto(makeFile(6 * 1024 * 1024, 'original.jpg'));

    await waitFor(() => expect(downscalePhoto).toHaveBeenCalled());

    fireEvent.click(screen.getByText('Send'));

    await waitFor(() => expect(reportProblem).toHaveBeenCalled());
    const formData = (reportProblem as jest.Mock).mock.calls[0][3] as FormData;
    expect(formData).toBeInstanceOf(FormData);
    expect(formData.get('photo')).toBe(small);
  });

  it('disables Send while the photo is still being downscaled, closing the fast-tap race', async () => {
    let resolveDownscale: (file: File) => void = () => {};
    (downscalePhoto as jest.Mock).mockReturnValue(
      new Promise<File>((resolve) => {
        resolveDownscale = resolve;
      }),
    );

    openProblemForm();
    const file = makeFile(6 * 1024 * 1024);
    attachPhoto(file);

    const sendButton = await screen.findByText('Processing photo…');
    expect(sendButton.closest('button')).toBeDisabled();

    fireEvent.click(sendButton);
    expect(reportProblem).not.toHaveBeenCalled();

    resolveDownscale(file);
    await waitFor(() => expect(screen.getByText('Send')).not.toBeDisabled());
  });
});
