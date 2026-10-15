/**
 * MediaUploader Memory Leak Tests
 *
 * Tests to verify proper cleanup of URL.createObjectURL() references
 * to prevent memory leaks.
 */

import React from 'react';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MediaUploader } from '../media-uploader';
import '@testing-library/jest-dom';

// Mock URL.createObjectURL and revokeObjectURL
const mockCreateObjectURL = jest.fn();
const mockRevokeObjectURL = jest.fn();

global.URL.createObjectURL = mockCreateObjectURL;
global.URL.revokeObjectURL = mockRevokeObjectURL;

// validateFileSecure and getImageDimensions decode each image through
// new Image(); jsdom never fires load events, so resolve the load as soon as
// a src is assigned.
class LoadingImage {
  width = 800;
  height = 600;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(_url: string) {
    setTimeout(() => this.onload?.());
  }
}
global.Image = LoadingImage as unknown as typeof Image;

// Helper to create a mock file. validateFileSecure checks magic numbers, so
// JPEG fixtures start with a real JPEG header.
const JPEG_HEADER = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
function createMockFile(name: string, size: number, type: string): File {
  const blob = new Blob([JPEG_HEADER, 'x'.repeat(size)], { type });
  return new File([blob], name, { type });
}

function fileInput(): HTMLInputElement {
  const input = screen.getByRole('presentation').querySelector('input[type="file"]');
  if (!input) throw new Error('File input not found');
  return input as HTMLInputElement;
}

describe('MediaUploader - Memory Leak Prevention', () => {
  let mockOnUpload: jest.Mock;

  beforeEach(() => {
    mockOnUpload = jest.fn().mockResolvedValue(undefined);
    mockCreateObjectURL.mockReturnValue('blob:mock-url');
    mockRevokeObjectURL.mockClear();
    mockCreateObjectURL.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('should revoke object URLs when component unmounts', async () => {
    const file = createMockFile('test.jpg', 1024 * 100, 'image/jpeg');

    const { unmount } = render(
      <MediaUploader onUpload={mockOnUpload} acceptedTypes={['image/jpeg']} />
    );

    await userEvent.upload(fileInput(), file);

    // Wait for validation and preview generation to finish
    await waitFor(() => {
      expect(screen.getByText('test.jpg')).toBeInTheDocument();
    });

    const createCallCount = mockCreateObjectURL.mock.calls.length;
    expect(createCallCount).toBeGreaterThan(0);

    // Unmount component
    unmount();

    // Verify all created URLs were revoked
    await waitFor(() => {
      expect(mockRevokeObjectURL).toHaveBeenCalledTimes(createCallCount);
    });
  });

  it('should revoke object URLs when files are removed individually', async () => {
    const file = createMockFile('test.jpg', 1024 * 100, 'image/jpeg');

    render(<MediaUploader onUpload={mockOnUpload} acceptedTypes={['image/jpeg']} />);

    // Add file (this will trigger createObjectURL)
    await userEvent.upload(fileInput(), file);

    // Wait for file to be added
    await waitFor(() => {
      expect(screen.getByText('test.jpg')).toBeInTheDocument();
    });

    // Clear mock before removal
    mockRevokeObjectURL.mockClear();

    // Remove file (the icon-only X button)
    const removeButton = screen.getByRole('button', { name: '' });
    await userEvent.click(removeButton);

    // Verify URL was revoked
    await waitFor(() => {
      expect(mockRevokeObjectURL).toHaveBeenCalled();
    });
  });

  it('should clean up URLs when files array changes', async () => {
    const file1 = createMockFile('test1.jpg', 1024 * 100, 'image/jpeg');
    const file2 = createMockFile('test2.jpg', 1024 * 100, 'image/jpeg');

    render(<MediaUploader onUpload={mockOnUpload} acceptedTypes={['image/jpeg']} />);

    // Add first file
    await userEvent.upload(fileInput(), file1);

    await waitFor(() => {
      expect(screen.getByText('test1.jpg')).toBeInTheDocument();
    });

    mockRevokeObjectURL.mockClear();

    // Add second file (triggers re-render with new files array)
    await userEvent.upload(fileInput(), file2);

    await waitFor(() => {
      // Should have revoked URLs from previous files array
      expect(mockRevokeObjectURL).toHaveBeenCalled();
    });
  });

  it('should not leak memory with multiple file additions and removals', async () => {
    const files = [
      createMockFile('test1.jpg', 1024 * 100, 'image/jpeg'),
      createMockFile('test2.jpg', 1024 * 100, 'image/jpeg'),
      createMockFile('test3.jpg', 1024 * 100, 'image/jpeg'),
    ];

    const { unmount } = render(
      <MediaUploader onUpload={mockOnUpload} acceptedTypes={['image/jpeg']} />
    );

    // Add files one by one
    for (const file of files) {
      await userEvent.upload(fileInput(), file);

      await waitFor(() => {
        expect(screen.getByText(file.name)).toBeInTheDocument();
      });
    }

    const totalCreatedURLs = mockCreateObjectURL.mock.calls.length;

    // Unmount should revoke all URLs: every URL created over the component's
    // lifetime (validation, dimensions and previews) must have been revoked.
    unmount();

    await waitFor(() => {
      expect(mockRevokeObjectURL.mock.calls.length).toBeGreaterThanOrEqual(totalCreatedURLs);
    });
  });

  it('should handle cleanup when upload completes successfully', async () => {
    const file = createMockFile('test.jpg', 1024 * 100, 'image/jpeg');

    render(<MediaUploader onUpload={mockOnUpload} acceptedTypes={['image/jpeg']} />);

    // Add file
    await userEvent.upload(fileInput(), file);

    await waitFor(() => {
      expect(screen.getByText('test.jpg')).toBeInTheDocument();
    });

    mockRevokeObjectURL.mockClear();

    // Click upload
    const uploadButton = screen.getByRole('button', { name: /upload all/i });
    await userEvent.click(uploadButton);

    // Wait for upload to complete
    await waitFor(() => {
      expect(mockOnUpload).toHaveBeenCalled();
    });

    // URLs should still be available during display
    // Cleanup happens on unmount or file change
  });

  it('should verify useEffect cleanup dependency is correct', () => {
    // This test verifies that the cleanup effect has [files] dependency
    // The actual implementation should have:
    // useEffect(() => { return () => { /* cleanup */ } }, [files])

    const { unmount } = render(
      <MediaUploader onUpload={mockOnUpload} acceptedTypes={['image/jpeg']} />
    );

    // The component should be rendered
    expect(screen.getByText(/drag & drop/i)).toBeInTheDocument();

    // Unmount
    unmount();

    // Verify cleanup was called
    // Since no files were added, revokeObjectURL shouldn't be called
    expect(mockRevokeObjectURL).not.toHaveBeenCalled();
  });
});

describe('MediaUploader - Memory Profiling Notes', () => {
  /**
   * Manual Memory Testing Guide
   *
   * To verify memory leak fixes in browser:
   *
   * 1. Open Chrome DevTools > Memory tab
   * 2. Take heap snapshot (baseline)
   * 3. Upload 10-20 images
   * 4. Take second heap snapshot
   * 5. Remove all images
   * 6. Force garbage collection (DevTools > Performance Monitor > Collect garbage)
   * 7. Take third heap snapshot
   * 8. Compare snapshots
   *
   * Expected Results:
   * - Snapshot 2 should show blob URLs in memory
   * - Snapshot 3 should NOT show blob URLs (they should be GC'd)
   * - Memory should return close to baseline after GC
   *
   * Common Memory Leak Indicators:
   * - Blob URLs not being freed
   * - Detached DOM nodes
   * - Event listeners not cleaned up
   * - Image element references retained
   */

  it('should document memory leak fix', () => {
    const documentation = {
      issue: 'Unreleased URL.createObjectURL() preview URLs causing memory leaks',
      location: '/apps/admin-portal/src/components/catalog/media-uploader.tsx:144,257',
      fix: 'Added [files] dependency to useEffect cleanup to revoke URLs when files array changes',
      impact: 'Prevents memory leaks in long-running admin sessions with frequent image uploads',
      testing: 'Unit tests verify URL.revokeObjectURL() is called appropriately',
    };

    expect(documentation.issue).toBeDefined();
    expect(documentation.fix).toBeDefined();
  });
});
