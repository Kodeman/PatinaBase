'use client';

import React, { useState, useRef } from 'react';
import { Upload, Camera, Image as ImageIcon, X, Check, Loader2 } from 'lucide-react';
import { cn } from '../../utils/cn';
import { Button } from '../Button';
import { Card } from '../Card';
import { MediaAsset, MediaType } from '@patina/types/media';
import {
  validateFile,
  formatFileSize,
  generateThumbnail,
  getMediaType,
} from './media-utils';

export interface MobileMediaUploaderProps {
  accept?: MediaType[];
  multiple?: boolean;
  onUploadComplete?: (assets: MediaAsset[]) => void;
  className?: string;
}

export function MobileMediaUploader({
  accept,
  multiple = true,
  onUploadComplete,
  className,
}: MobileMediaUploaderProps) {
  const [files, setFiles] = useState<Array<{
    file: File;
    preview?: string;
    progress: number;
    status: 'uploading' | 'complete' | 'error';
    error?: string;
  }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (selectedFiles: FileList | null) => {
    if (!selectedFiles) return;

    const newFiles = Array.from(selectedFiles).map(async (file) => {
      const validation = validateFile(file);
      const mediaType = getMediaType(file.type);
      let preview: string | undefined;

      if (mediaType === 'image') {
        try {
          preview = await generateThumbnail(file);
        } catch (error) {
          console.error('Failed to generate thumbnail:', error);
        }
      }

      return {
        file,
        preview,
        progress: 0,
        status: validation.valid ? ('uploading' as const) : ('error' as const),
        error: validation.error,
      };
    });

    const resolvedFiles = await Promise.all(newFiles);
    setFiles((prev) => [...prev, ...resolvedFiles]);

    // Start upload for valid files
    resolvedFiles.forEach((fileState) => {
      if (fileState.status === 'uploading') {
        uploadFile(fileState);
      }
    });
  };

  const uploadFile = async (fileState: typeof files[0]) => {
    const formData = new FormData();
    formData.append('file', fileState.file);

    try {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const progress = Math.round((e.loaded / e.total) * 100);
          setFiles((prev) =>
            prev.map((f) =>
              f.file === fileState.file ? { ...f, progress } : f
            )
          );
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          setFiles((prev) =>
            prev.map((f) =>
              f.file === fileState.file
                ? { ...f, status: 'complete' as const, progress: 100 }
                : f
            )
          );
        } else {
          setFiles((prev) =>
            prev.map((f) =>
              f.file === fileState.file
                ? {
                    ...f,
                    status: 'error' as const,
                    error: 'Upload failed',
                  }
                : f
            )
          );
        }
      });

      xhr.open('POST', '/api/media/upload');
      xhr.send(formData);
    } catch (error) {
      setFiles((prev) =>
        prev.map((f) =>
          f.file === fileState.file
            ? {
                ...f,
                status: 'error' as const,
                error: error instanceof Error ? error.message : 'Upload failed',
              }
            : f
        )
      );
    }
  };

  const removeFile = (file: File) => {
    setFiles((prev) => prev.filter((f) => f.file !== file));
  };

  return (
    <div className={cn('space-y-4', className)}>
      {/* Mobile-optimized upload buttons */}
      <div className="grid grid-cols-2 gap-4">
        <Button
          variant="outline"
          className="h-32 flex flex-col items-center justify-center gap-2"
          onClick={() => cameraInputRef.current?.click()}
        >
          <Camera className="h-8 w-8" />
          <span className="text-sm">Take Photo</span>
        </Button>
        <Button
          variant="outline"
          className="h-32 flex flex-col items-center justify-center gap-2"
          onClick={() => fileInputRef.current?.click()}
        >
          <ImageIcon className="h-8 w-8" />
          <span className="text-sm">Choose Files</span>
        </Button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        multiple={multiple}
        accept={accept ? accept.map((t) => `${t}/*`).join(',') : '*'}
        onChange={(e) => handleFileSelect(e.target.files)}
      />

      <input
        ref={cameraInputRef}
        type="file"
        className="hidden"
        accept="image/*"
        capture="environment"
        onChange={(e) => handleFileSelect(e.target.files)}
      />

      {/* File list with mobile-friendly layout */}
      {files.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Uploading {files.length} file(s)</h3>
          {files.map((fileState, index) => (
            <Card key={index} className="p-3">
              <div className="flex items-center gap-3">
                {fileState.preview ? (
                  <img
                    src={fileState.preview}
                    alt={fileState.file.name}
                    className="w-12 h-12 object-cover rounded"
                  />
                ) : (
                  <div className="w-12 h-12 bg-gray-100 rounded flex items-center justify-center">
                    <Upload className="h-6 w-6 text-gray-400" />
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {fileState.file.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatFileSize(fileState.file.size)}
                  </p>

                  {fileState.status === 'uploading' && (
                    <>
                      <div className="mt-1 bg-gray-200 rounded-full h-1.5">
                        <div
                          className="bg-primary h-1.5 rounded-full transition-all"
                          style={{ width: `${fileState.progress}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {fileState.progress}%
                      </p>
                    </>
                  )}

                  {fileState.status === 'error' && (
                    <p className="text-xs text-red-500 mt-1">
                      {fileState.error}
                    </p>
                  )}
                </div>

                <div className="flex-shrink-0">
                  {fileState.status === 'uploading' && (
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  )}
                  {fileState.status === 'complete' && (
                    <Check className="h-5 w-5 text-green-500" />
                  )}
                  {fileState.status === 'error' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeFile(fileState.file)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Upload tips for mobile */}
      <div className="text-xs text-gray-500 text-center p-3 bg-blue-50 rounded-lg">
        <p>Tip: You can also take photos directly or choose from your gallery</p>
      </div>
    </div>
  );
}
