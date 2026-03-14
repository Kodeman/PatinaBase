'use client';

import * as React from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, X, FileImage, AlertCircle, CheckCircle2 } from 'lucide-react';
import {
  Alert,
  AlertDescription,
  Button,
} from '@patina/design-system';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import {
  formatFileSize,
  getImageDimensions,
  isImageFile,
  MAX_FILE_SIZE
} from '@/lib/admin/media-utils';
import { validateFileSecure } from '@/lib/admin/security/file-validation';

export interface UploadFile {
  file: File;
  id: string;
  preview?: string;
  progress: number;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
  dimensions?: { width: number; height: number };
}

export interface MediaUploaderProps {
  /**
   * Callback when files are ready to upload
   */
  onUpload: (files: UploadFile[]) => Promise<void>;

  /**
   * Callback when upload completes for a file
   */
  onUploadComplete?: (fileId: string, assetId: string) => void;

  /**
   * Callback for upload progress updates
   */
  onProgress?: (fileId: string, progress: number) => void;

  /**
   * Callback when a file is removed before upload
   */
  onRemove?: (fileId: string) => void;

  /**
   * Maximum file size in MB
   */
  maxSizeMB?: number;

  /**
   * Maximum number of files
   */
  maxFiles?: number;

  /**
   * Accepted file types
   */
  acceptedTypes?: string[];

  /**
   * Whether multiple files can be uploaded
   */
  multiple?: boolean;

  /**
   * Custom class name
   */
  className?: string;

  /**
   * Disabled state
   */
  disabled?: boolean;
}

export function MediaUploader({
  onUpload,
  onUploadComplete,
  onProgress,
  onRemove,
  maxSizeMB = 10,
  maxFiles = 20,
  acceptedTypes = ['image/jpeg', 'image/png', 'image/webp'], // SVG removed for security
  multiple = true,
  className,
  disabled = false,
}: MediaUploaderProps) {
  const [files, setFiles] = React.useState<UploadFile[]>([]);
  const [errors, setErrors] = React.useState<string[]>([]);
  const [isUploading, setIsUploading] = React.useState(false);

  // Handle file drop/selection
  const onDrop = React.useCallback(
    async (acceptedFiles: File[], rejectedFiles: any[]) => {
      setErrors([]);
      const newErrors: string[] = [];

      // Handle rejected files
      if (rejectedFiles.length > 0) {
        rejectedFiles.forEach((rejected) => {
          const error = rejected.errors[0];
          if (error.code === 'file-too-large') {
            newErrors.push(`${rejected.file.name}: File size exceeds ${maxSizeMB}MB`);
          } else if (error.code === 'file-invalid-type') {
            newErrors.push(`${rejected.file.name}: Invalid file type`);
          } else if (error.code === 'too-many-files') {
            newErrors.push(`Maximum ${maxFiles} files allowed`);
          } else {
            newErrors.push(`${rejected.file.name}: ${error.message}`);
          }
        });
      }

      // Validate accepted files with secure validation
      const validatedFiles: UploadFile[] = [];

      for (const file of acceptedFiles) {
        // Size check first (fast rejection)
        if (file.size > MAX_FILE_SIZE) {
          newErrors.push(`${file.name}: File size exceeds ${formatFileSize(MAX_FILE_SIZE)} limit`);
          continue;
        }

        // Secure validation with magic number verification
        const validation = await validateFileSecure(file);

        if (!validation.valid) {
          newErrors.push(`${file.name}: ${validation.error}`);
          continue;
        }

        // Check if we've reached max files
        if (files.length + validatedFiles.length >= maxFiles) {
          newErrors.push(`Maximum ${maxFiles} files allowed`);
          break;
        }

        const uploadFile: UploadFile = {
          file,
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          progress: 0,
          status: 'pending',
        };

        // Generate preview for images
        if (isImageFile(file.type)) {
          try {
            const preview = URL.createObjectURL(file);
            uploadFile.preview = preview;

            // Get dimensions
            const dimensions = await getImageDimensions(file);
            uploadFile.dimensions = dimensions;
          } catch (error) {
            console.error('Error generating preview:', error);
          }
        }

        validatedFiles.push(uploadFile);
      }

      if (newErrors.length > 0) {
        setErrors(newErrors);
      }

      if (validatedFiles.length > 0) {
        setFiles((prev) => [...prev, ...validatedFiles]);
      }
    },
    [files.length, maxFiles, maxSizeMB]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: acceptedTypes.reduce((acc, type) => ({ ...acc, [type]: [] }), {}),
    maxSize: maxSizeMB * 1024 * 1024,
    maxFiles: multiple ? maxFiles : 1,
    multiple,
    disabled: disabled || isUploading,
  });

  // Remove a file from the list
  const handleRemove = (fileId: string) => {
    const file = files.find((f) => f.id === fileId);
    if (file?.preview) {
      URL.revokeObjectURL(file.preview);
    }
    setFiles((prev) => prev.filter((f) => f.id !== fileId));
    onRemove?.(fileId);
  };

  // Upload all pending files
  const handleUploadAll = async () => {
    if (files.length === 0) return;

    setIsUploading(true);
    setErrors([]);

    try {
      const pendingFiles = files.filter((f) => f.status === 'pending' || f.status === 'error');

      // Update status to uploading
      setFiles((prev) =>
        prev.map((f) =>
          pendingFiles.find((pf) => pf.id === f.id)
            ? { ...f, status: 'uploading' as const, progress: 0 }
            : f
        )
      );

      await onUpload(pendingFiles);
    } catch (error) {
      console.error('Upload error:', error);
      setErrors(['Upload failed. Please try again.']);
    } finally {
      setIsUploading(false);
    }
  };

  // Update file progress
  const updateFileProgress = React.useCallback((fileId: string, progress: number) => {
    setFiles((prev) =>
      prev.map((f) =>
        f.id === fileId ? { ...f, progress } : f
      )
    );
    onProgress?.(fileId, progress);
  }, [onProgress]);

  // Update file status
  const updateFileStatus = React.useCallback(
    (fileId: string, status: UploadFile['status'], error?: string, assetId?: string) => {
      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileId ? { ...f, status, error, progress: status === 'success' ? 100 : f.progress } : f
        )
      );

      if (status === 'success' && assetId) {
        onUploadComplete?.(fileId, assetId);
      }
    },
    [onUploadComplete]
  );

  // Expose methods via ref
  React.useImperativeHandle(
    React.useRef({ updateFileProgress, updateFileStatus }),
    () => ({ updateFileProgress, updateFileStatus })
  );

  // Cleanup previews when files change and on unmount
  React.useEffect(() => {
    // Cleanup function runs when files array changes or component unmounts
    return () => {
      files.forEach((file) => {
        if (file.preview) {
          URL.revokeObjectURL(file.preview);
        }
      });
    };
  }, [files]); // Re-run cleanup when files array changes

  const pendingCount = files.filter((f) => f.status === 'pending' || f.status === 'error').length;
  const successCount = files.filter((f) => f.status === 'success').length;

  return (
    <div className={cn('space-y-4', className)}>
      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={cn(
          'border-2 border-dashed rounded-lg p-8 transition-colors cursor-pointer',
          isDragActive && 'border-primary bg-primary/5',
          !isDragActive && 'border-border hover:border-primary/50',
          (disabled || isUploading) && 'cursor-not-allowed opacity-50'
        )}
      >
        <input {...getInputProps()} />

        <div className="flex flex-col items-center justify-center text-center space-y-4">
          <div className={cn(
            'w-16 h-16 rounded-full flex items-center justify-center',
            isDragActive ? 'bg-primary/10' : 'bg-muted'
          )}>
            {isUploading ? (
              <div className="animate-spin h-8 w-8 border-3 border-primary border-t-transparent rounded-full" />
            ) : (
              <Upload className={cn('w-8 h-8', isDragActive ? 'text-primary' : 'text-muted-foreground')} />
            )}
          </div>

          <div>
            <p className="text-base font-medium mb-1">
              {isDragActive
                ? 'Drop files here'
                : isUploading
                ? 'Uploading...'
                : 'Drag & drop images here, or click to browse'}
            </p>
            <p className="text-sm text-muted-foreground">
              {acceptedTypes.map(t => t.split('/')[1].toUpperCase()).join(', ')} up to {maxSizeMB}MB each
              {multiple && ` (max ${maxFiles} files)`}
            </p>
          </div>

          {!isUploading && files.length > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleUploadAll();
              }}
              disabled={pendingCount === 0}
            >
              <Upload className="w-4 h-4 mr-2" />
              Upload {pendingCount > 0 ? `${pendingCount} file${pendingCount > 1 ? 's' : ''}` : 'All'}
            </Button>
          )}
        </div>
      </div>

      {/* Errors */}
      {errors.length > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <ul className="list-disc list-inside space-y-1">
              {errors.map((error, index) => (
                <li key={index} className="text-sm">{error}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* File List */}
      {files.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">
              Files ({files.length})
              {successCount > 0 && (
                <span className="ml-2 text-green-600">
                  {successCount} uploaded
                </span>
              )}
            </p>
            {pendingCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleUploadAll}
                disabled={isUploading}
              >
                <Upload className="w-3 h-3 mr-1" />
                Upload All
              </Button>
            )}
          </div>

          <div className="space-y-2">
            {files.map((file) => (
              <div
                key={file.id}
                className={cn(
                  'flex items-center gap-3 p-3 rounded-lg border transition-colors',
                  file.status === 'success' && 'border-green-200 bg-green-50/50',
                  file.status === 'error' && 'border-destructive bg-destructive/5',
                  file.status === 'uploading' && 'border-primary bg-primary/5',
                  file.status === 'pending' && 'border-border bg-background'
                )}
              >
                {/* Preview */}
                {file.preview ? (
                  <div className="w-12 h-12 rounded overflow-hidden flex-shrink-0 bg-muted">
                    <img
                      src={file.preview}
                      alt={file.file.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="w-12 h-12 rounded flex items-center justify-center bg-muted flex-shrink-0">
                    <FileImage className="w-6 h-6 text-muted-foreground" />
                  </div>
                )}

                {/* File Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{file.file.name}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{formatFileSize(file.file.size)}</span>
                    {file.dimensions && (
                      <>
                        <span>•</span>
                        <span>{file.dimensions.width} × {file.dimensions.height}</span>
                      </>
                    )}
                  </div>

                  {/* Progress Bar */}
                  {file.status === 'uploading' && (
                    <div className="mt-2">
                      <Progress value={file.progress} className="h-1" />
                      <p className="text-xs text-muted-foreground mt-1">
                        {file.progress}%
                      </p>
                    </div>
                  )}

                  {/* Error Message */}
                  {file.status === 'error' && file.error && (
                    <p className="text-xs text-destructive mt-1">{file.error}</p>
                  )}
                </div>

                {/* Status Icon */}
                <div className="flex-shrink-0">
                  {file.status === 'success' && (
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                  )}
                  {file.status === 'error' && (
                    <AlertCircle className="w-5 h-5 text-destructive" />
                  )}
                  {file.status === 'uploading' && (
                    <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full" />
                  )}
                  {file.status === 'pending' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemove(file.id)}
                      className="h-8 w-8 p-0"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Export the hook for external progress updates
export function useMediaUploader() {
  return React.useRef<{
    updateFileProgress: (fileId: string, progress: number) => void;
    updateFileStatus: (fileId: string, status: UploadFile['status'], error?: string, assetId?: string) => void;
  }>(null);
}
