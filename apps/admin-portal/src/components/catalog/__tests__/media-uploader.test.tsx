import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MediaUploader } from '../media-uploader';
import { validateFile } from '@/lib/media-utils';

// Mock media-utils
jest.mock('@/lib/media-utils', () => ({
  validateFile: jest.fn(),
  formatFileSize: jest.fn((bytes) => `${bytes} bytes`),
  getImageDimensions: jest.fn(() => Promise.resolve({ width: 1920, height: 1080 })),
  isImageFile: jest.fn(() => true),
}));

// Mock URL.createObjectURL
global.URL.createObjectURL = jest.fn(() => 'blob:mock-url');
global.URL.revokeObjectURL = jest.fn();

describe('MediaUploader', () => {
  const mockOnUpload = jest.fn();
  const mockOnRemove = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (validateFile as jest.Mock).mockReturnValue({ valid: true });
  });

  it('renders the dropzone with correct text', () => {
    render(<MediaUploader onUpload={mockOnUpload} />);

    expect(
      screen.getByText(/drag & drop images here, or click to browse/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/jpg, png, webp up to 10mb each/i)).toBeInTheDocument();
  });

  it('displays correct file size limit', () => {
    render(<MediaUploader onUpload={mockOnUpload} maxSizeMB={5} />);

    expect(screen.getByText(/up to 5mb/i)).toBeInTheDocument();
  });

  it('accepts valid image files via file input', async () => {
    const user = userEvent.setup();
    render(<MediaUploader onUpload={mockOnUpload} />);

    const file = new File(['dummy content'], 'test.jpg', { type: 'image/jpeg' });

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
    (validateFile as jest.Mock).mockReturnValue({
      valid: false,
      error: 'File too large',
    });

    render(<MediaUploader onUpload={mockOnUpload} />);

    const file = new File(['x'.repeat(11 * 1024 * 1024)], 'huge.jpg', {
      type: 'image/jpeg',
    });

    const input = screen.getByRole('presentation').querySelector('input[type="file"]');

    if (input) {
      await user.upload(input as HTMLInputElement, file);

      await waitFor(() => {
        expect(screen.getByText(/file too large/i)).toBeInTheDocument();
      });
    }
  });

  it('shows file preview for images', async () => {
    const user = userEvent.setup();
    render(<MediaUploader onUpload={mockOnUpload} />);

    const file = new File(['dummy'], 'preview.jpg', { type: 'image/jpeg' });

    const input = screen.getByRole('presentation').querySelector('input[type="file"]');

    if (input) {
      await user.upload(input as HTMLInputElement, file);

      await waitFor(() => {
        const img = screen.getByAlt('preview.jpg');
        expect(img).toBeInTheDocument();
        expect(img).toHaveAttribute('src', 'blob:mock-url');
      });
    }
  });

  it('allows removing files before upload', async () => {
    const user = userEvent.setup();
    render(<MediaUploader onUpload={mockOnUpload} onRemove={mockOnRemove} />);

    const file = new File(['dummy'], 'remove-me.jpg', { type: 'image/jpeg' });

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

    const file = new File(['dummy'], 'upload-test.jpg', { type: 'image/jpeg' });

    const input = screen.getByRole('presentation').querySelector('input[type="file"]');

    if (input) {
      await user.upload(input as HTMLInputElement, file);

      await waitFor(() => {
        expect(screen.getByText('upload-test.jpg')).toBeInTheDocument();
      });

      const uploadButton = screen.getByRole('button', { name: /upload/i });
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
    expect(dropzone.parentElement).toHaveClass('cursor-not-allowed', 'opacity-50');
  });

  it('respects maxFiles limit', async () => {
    const user = userEvent.setup();
    render(<MediaUploader onUpload={mockOnUpload} maxFiles={2} />);

    const files = [
      new File(['1'], 'file1.jpg', { type: 'image/jpeg' }),
      new File(['2'], 'file2.jpg', { type: 'image/jpeg' }),
      new File(['3'], 'file3.jpg', { type: 'image/jpeg' }),
    ];

    const input = screen.getByRole('presentation').querySelector('input[type="file"]');

    if (input) {
      await user.upload(input as HTMLInputElement, files);

      await waitFor(() => {
        expect(screen.getByText(/maximum 2 files allowed/i)).toBeInTheDocument();
      });
    }
  });

  it('displays file dimensions when available', async () => {
    const user = userEvent.setup();
    render(<MediaUploader onUpload={mockOnUpload} />);

    const file = new File(['dummy'], 'dimensions.jpg', { type: 'image/jpeg' });

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

    const files = [
      new File(['1'], 'file1.jpg', { type: 'image/jpeg' }),
      new File(['2'], 'file2.jpg', { type: 'image/jpeg' }),
    ];

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
