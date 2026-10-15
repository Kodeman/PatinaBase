import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MediaUploader } from '../media-uploader';

// Mock media-utils
jest.mock('@/lib/media-utils', () => ({
  formatFileSize: jest.fn((bytes) => `${bytes} bytes`),
  getImageDimensions: jest.fn(() => Promise.resolve({ width: 1920, height: 1080 })),
  isImageFile: jest.fn(() => true),
}));

// Mock URL.createObjectURL
global.URL.createObjectURL = jest.fn(() => 'blob:mock-url');
global.URL.revokeObjectURL = jest.fn();

// validateFileSecure decodes each image through new Image(); jsdom never
// fires load events, so resolve the load as soon as a src is assigned.
class LoadingImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(_url: string) {
    setTimeout(() => this.onload?.());
  }
}
global.Image = LoadingImage as unknown as typeof Image;

// validateFileSecure checks magic numbers, so fixtures need a real JPEG header.
const JPEG_HEADER = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
function jpegFile(name: string, body = 'dummy'): File {
  return new File([JPEG_HEADER, body], name, { type: 'image/jpeg' });
}

describe('MediaUploader', () => {
  const mockOnUpload = jest.fn();
  const mockOnRemove = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the dropzone with correct text', () => {
    render(<MediaUploader onUpload={mockOnUpload} />);

    expect(
      screen.getByText(/drag & drop images here, or click to browse/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/jpeg, png, webp up to 10mb each/i)).toBeInTheDocument();
  });

  it('displays correct file size limit', () => {
    render(<MediaUploader onUpload={mockOnUpload} maxSizeMB={5} />);

    expect(screen.getByText(/up to 5mb/i)).toBeInTheDocument();
  });

  it('accepts valid image files via file input', async () => {
    const user = userEvent.setup();
    render(<MediaUploader onUpload={mockOnUpload} />);

    const file = jpegFile('test.jpg', 'dummy content');

    const input = screen.getByRole('presentation').querySelector('input[type="file"]');
    expect(input).toBeInTheDocument();

    if (input) {
      await user.upload(input as HTMLInputElement, file);

      await waitFor(() => {
        expect(screen.getByText('test.jpg')).toBeInTheDocument();
      });
    }
  });

  it('rejects files that fail validation', async () => {
    const user = userEvent.setup();
    render(<MediaUploader onUpload={mockOnUpload} />);

    const file = jpegFile('huge.jpg', 'x'.repeat(11 * 1024 * 1024));

    const input = screen.getByRole('presentation').querySelector('input[type="file"]');

    if (input) {
      await user.upload(input as HTMLInputElement, file);

      await waitFor(() => {
        expect(screen.getByText(/huge\.jpg: file size exceeds 10mb/i)).toBeInTheDocument();
      });
    }
  });

  it('rejects files whose content does not match the declared type', async () => {
    const user = userEvent.setup();
    render(<MediaUploader onUpload={mockOnUpload} />);

    const file = new File(['not a jpeg'], 'forged.jpg', { type: 'image/jpeg' });

    const input = screen.getByRole('presentation').querySelector('input[type="file"]');

    if (input) {
      await user.upload(input as HTMLInputElement, file);

      await waitFor(() => {
        expect(screen.getByText(/forged\.jpg: .*possible file forgery/i)).toBeInTheDocument();
      });
      expect(screen.queryByText('Files (1)')).not.toBeInTheDocument();
    }
  });

  it('shows file preview for images', async () => {
    const user = userEvent.setup();
    render(<MediaUploader onUpload={mockOnUpload} />);

    const file = jpegFile('preview.jpg');

    const input = screen.getByRole('presentation').querySelector('input[type="file"]');

    if (input) {
      await user.upload(input as HTMLInputElement, file);

      await waitFor(() => {
        const img = screen.getByAltText('preview.jpg');
        expect(img).toBeInTheDocument();
        expect(img).toHaveAttribute('src', 'blob:mock-url');
      });
    }
  });

  it('allows removing files before upload', async () => {
    const user = userEvent.setup();
    render(<MediaUploader onUpload={mockOnUpload} onRemove={mockOnRemove} />);

    const file = jpegFile('remove-me.jpg');

    const input = screen.getByRole('presentation').querySelector('input[type="file"]');

    if (input) {
      await user.upload(input as HTMLInputElement, file);

      await waitFor(() => {
        expect(screen.getByText('remove-me.jpg')).toBeInTheDocument();
      });

      const removeButton = screen.getByRole('button', { name: '' }); // X button
      await user.click(removeButton);

      await waitFor(() => {
        expect(screen.queryByText('remove-me.jpg')).not.toBeInTheDocument();
      });
    }
  });

  it('calls onUpload when upload button is clicked', async () => {
    const user = userEvent.setup();
    mockOnUpload.mockResolvedValue(undefined);

    render(<MediaUploader onUpload={mockOnUpload} />);

    const file = jpegFile('upload-test.jpg');

    const input = screen.getByRole('presentation').querySelector('input[type="file"]');

    if (input) {
      await user.upload(input as HTMLInputElement, file);

      await waitFor(() => {
        expect(screen.getByText('upload-test.jpg')).toBeInTheDocument();
      });

      const uploadButton = screen.getByRole('button', { name: /upload all/i });
      await user.click(uploadButton);

      await waitFor(() => {
        expect(mockOnUpload).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({
              file: expect.any(File),
              status: 'pending',
            }),
          ])
        );
      });
    }
  });

  it('disables dropzone when disabled prop is true', () => {
    render(<MediaUploader onUpload={mockOnUpload} disabled />);

    const dropzone = screen.getByRole('presentation');
    expect(dropzone).toHaveClass('cursor-not-allowed', 'opacity-50');
  });

  it('respects maxFiles limit', async () => {
    const user = userEvent.setup();
    render(<MediaUploader onUpload={mockOnUpload} maxFiles={2} />);

    const files = [jpegFile('file1.jpg', '1'), jpegFile('file2.jpg', '2'), jpegFile('file3.jpg', '3')];

    const input = screen.getByRole('presentation').querySelector('input[type="file"]');

    if (input) {
      await user.upload(input as HTMLInputElement, files);

      // react-dropzone rejects every file of an over-limit drop, one error each
      await waitFor(() => {
        expect(screen.getAllByText(/maximum 2 files allowed/i).length).toBeGreaterThan(0);
      });
      expect(screen.queryByText('file1.jpg')).not.toBeInTheDocument();
    }
  });

  it('displays file dimensions when available', async () => {
    const user = userEvent.setup();
    render(<MediaUploader onUpload={mockOnUpload} />);

    const file = jpegFile('dimensions.jpg');

    const input = screen.getByRole('presentation').querySelector('input[type="file"]');

    if (input) {
      await user.upload(input as HTMLInputElement, file);

      await waitFor(() => {
        expect(screen.getByText(/1920 × 1080/)).toBeInTheDocument();
      });
    }
  });

  it('handles multiple file uploads', async () => {
    const user = userEvent.setup();
    render(<MediaUploader onUpload={mockOnUpload} multiple />);

    const files = [jpegFile('file1.jpg', '1'), jpegFile('file2.jpg', '2')];

    const input = screen.getByRole('presentation').querySelector('input[type="file"]');

    if (input) {
      await user.upload(input as HTMLInputElement, files);

      await waitFor(() => {
        expect(screen.getByText('file1.jpg')).toBeInTheDocument();
        expect(screen.getByText('file2.jpg')).toBeInTheDocument();
        expect(screen.getByText('Files (2)')).toBeInTheDocument();
      });
    }
  });
});
