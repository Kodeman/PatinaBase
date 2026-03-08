'use client';

import React, { useCallback, useState, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  Upload,
  X,
  FileIcon,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Image as ImageIcon,
  Video,
  Box,
} from 'lucide-react';
import { cn } from '../../utils/cn';
import { Button } from '../Button';
import { Card } from '../Card';
import {
  MediaAsset,
  MediaType,
  UploadOptions,
  UploadChunk,
} from '@patina/types/media';
import {
  validateFile,
  formatFileSize,
  getMediaType,
  createChunks,
  generateThumbnail,
  getImageDimensions,
  extractVideoMetadata,
  CHUNK_SIZE,
} from './media-utils';

interface FileUploadState {
  file: File;
  id: string;
  progress: number;
  status: 'pending' | 'uploading' | 'processing' | 'complete' | 'error';
  error?: string;
  preview?: string;
  uploadId?: string;
  chunks?: Blob[];
  currentChunk?: number;
  asset?: MediaAsset;
}

export interface MediaUploaderProps {
  accept?: MediaType[];
  multiple?: boolean;
  maxFiles?: number;
  chunked?: boolean;
  resumable?: boolean;
  onUploadComplete?: (assets: MediaAsset[]) => void;
  onUploadError?: (error: Error) => void;
  className?: string;
}

export function MediaUploader({
  accept,
  multiple = true,
  maxFiles = 10,
  chunked = true,
  resumable = true,
  onUploadComplete,
  onUploadError,
  className,
}: MediaUploaderProps) {
  const [files, setFiles] = useState<FileUploadState[]>([]);
  const uploadAbortControllers = useRef<Map<string, AbortController>>(new Map());

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const newFiles: FileUploadState[] = [];

      for (const file of acceptedFiles) {
        const validation = validateFile(file);
        if (!validation.valid) {
          newFiles.push({
            file,
            id: Math.random().toString(36).substring(7),
            progress: 0,
            status: 'error',
            error: validation.error,
          });
          continue;
        }

        const id = Math.random().toString(36).substring(7);
        const mediaType = getMediaType(file.type);
        let preview: string | undefined;

        // Generate preview for images
        if (mediaType === 'image') {
          try {
            preview = await generateThumbnail(file);
          } catch (error) {
            console.error('Failed to generate thumbnail:', error);
          }
        }

        newFiles.push({
          file,
          id,
          progress: 0,
          status: 'pending',
          preview,
        });
      }

      setFiles((prev) => [...prev, ...newFiles]);

      // Start uploads
      newFiles.forEach((fileState) => {
        if (fileState.status === 'pending') {
          uploadFile(fileState);
        }
      });
    },
    [chunked, resumable]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple,
    maxFiles,
    accept: accept
      ? accept.reduce((acc, type) => {
          const mimes: Record<string, string[]> = {
            image: ['image/*'],
            video: ['video/*'],
            '3d': ['.gltf', '.glb', '.obj', '.stl'],
            document: ['.pdf', '.doc', '.docx', '.txt'],
          };
          return { ...acc, ...mimes[type] };
        }, {})
      : undefined,
  });

  const uploadFile = async (fileState: FileUploadState) => {
    const { file, id } = fileState;
    const abortController = new AbortController();
    uploadAbortControllers.current.set(id, abortController);

    try {
      setFiles((prev) =>
        prev.map((f) =>
          f.id === id ? { ...f, status: 'uploading' as const } : f
        )
      );

      let asset: MediaAsset;

      if (chunked && file.size > CHUNK_SIZE) {
        asset = await uploadChunked(fileState, abortController);
      } else {
        asset = await uploadDirect(fileState, abortController);
      }

      setFiles((prev) =>
        prev.map((f) =>
          f.id === id
            ? { ...f, status: 'complete' as const, progress: 100, asset }
            : f
        )
      );
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return; // Upload was cancelled
      }

      setFiles((prev) =>
        prev.map((f) =>
          f.id === id
            ? {
                ...f,
                status: 'error' as const,
                error:
                  error instanceof Error ? error.message : 'Upload failed',
              }
            : f
        )
      );

      if (onUploadError && error instanceof Error) {
        onUploadError(error);
      }
    } finally {
      uploadAbortControllers.current.delete(id);
    }
  };

  const uploadDirect = async (
    fileState: FileUploadState,
    abortController: AbortController
  ): Promise<MediaAsset> => {
    const { file, id } = fileState;
    const formData = new FormData();
    formData.append('file', file);

    const mediaType = getMediaType(file.type);
    let metadata: any = {};

    if (mediaType === 'image') {
      const dimensions = await getImageDimensions(file);
      metadata.dimensions = dimensions;
    } else if (mediaType === 'video') {
      const videoMetadata = await extractVideoMetadata(file);
      metadata = videoMetadata;
    }

    formData.append('metadata', JSON.stringify(metadata));

    const xhr = new XMLHttpRequest();

    return new Promise((resolve, reject) => {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const progress = Math.round((e.loaded / e.total) * 100);
          setFiles((prev) =>
            prev.map((f) => (f.id === id ? { ...f, progress } : f))
          );
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText));
        } else {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      });

      xhr.addEventListener('error', () => {
        reject(new Error('Upload failed'));
      });

      abortController.signal.addEventListener('abort', () => {
        xhr.abort();
        reject(new Error('Upload cancelled'));
      });

      xhr.open('POST', '/api/media/upload');
      xhr.send(formData);
    });
  };

  const uploadChunked = async (
    fileState: FileUploadState,
    abortController: AbortController
  ): Promise<MediaAsset> => {
    const { file, id } = fileState;
    const chunks = createChunks(file);
    const uploadId = Math.random().toString(36).substring(7);

    setFiles((prev) =>
      prev.map((f) =>
        f.id === id ? { ...f, chunks, uploadId, currentChunk: 0 } : f
      )
    );

    for (let i = 0; i < chunks.length; i++) {
      if (abortController.signal.aborted) {
        throw new Error('Upload cancelled');
      }

      const chunk = chunks[i];
      const formData = new FormData();
      formData.append('chunk', chunk);
      formData.append('chunkNumber', i.toString());
      formData.append('totalChunks', chunks.length.toString());
      formData.append('uploadId', uploadId);
      formData.append('fileName', file.name);

      await fetch('/api/media/upload/chunk', {
        method: 'POST',
        body: formData,
        signal: abortController.signal,
      });

      const progress = Math.round(((i + 1) / chunks.length) * 100);
      setFiles((prev) =>
        prev.map((f) =>
          f.id === id ? { ...f, progress, currentChunk: i + 1 } : f
        )
      );
    }

    // Finalize upload
    const response = await fetch('/api/media/upload/finalize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uploadId, fileName: file.name }),
      signal: abortController.signal,
    });

    if (!response.ok) {
      throw new Error('Failed to finalize upload');
    }

    return response.json();
  };

  const cancelUpload = (id: string) => {
    const controller = uploadAbortControllers.current.get(id);
    if (controller) {
      controller.abort();
      uploadAbortControllers.current.delete(id);
    }
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const retryUpload = (fileState: FileUploadState) => {
    setFiles((prev) =>
      prev.map((f) =>
        f.id === fileState.id ? { ...f, status: 'pending' as const } : f
      )
    );
    uploadFile(fileState);
  };

  const getFileIcon = (file: File) => {
    const type = getMediaType(file.type);
    switch (type) {
      case 'image':
        return <ImageIcon className="h-8 w-8" />;
      case 'video':
        return <Video className="h-8 w-8" />;
      case '3d':
        return <Box className="h-8 w-8" />;
      default:
        return <FileIcon className="h-8 w-8" />;
    }
  };

  return (
    <div className={cn('space-y-4', className)}>
      <div
        {...getRootProps()}
        className={cn(
          'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
          isDragActive
            ? 'border-primary bg-primary/5'
            : 'border-gray-300 hover:border-primary/50'
        )}
      >
        <input {...getInputProps()} />
        <Upload className="h-12 w-12 mx-auto mb-4 text-gray-400" />
        <p className="text-lg font-medium mb-2">
          {isDragActive
            ? 'Drop files here'
            : 'Drag & drop files here, or click to select'}
        </p>
        <p className="text-sm text-gray-500">
          Supports images, videos, 3D models, and documents
        </p>
        <p className="text-xs text-gray-400 mt-2">
          Max file size: 500MB
          {chunked && ' (large files will be chunked automatically)'}
        </p>
      </div>

      {files.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">
            Uploads ({files.length}/{maxFiles})
          </h3>
          <div className="space-y-2">
            {files.map((fileState) => (
              <Card key={fileState.id} className="p-4">
                <div className="flex items-start gap-4">
                  {fileState.preview ? (
                    <img
                      src={fileState.preview}
                      alt={fileState.file.name}
                      className="w-16 h-16 object-cover rounded"
                    />
                  ) : (
                    <div className="w-16 h-16 flex items-center justify-center bg-gray-100 rounded">
                      {getFileIcon(fileState.file)}
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
                        <div className="mt-2 bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-primary h-2 rounded-full transition-all"
                            style={{ width: `${fileState.progress}%` }}
                          />
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          {fileState.progress}%
                          {chunked &&
                            fileState.currentChunk !== undefined &&
                            fileState.chunks &&
                            ` (Chunk ${fileState.currentChunk}/${fileState.chunks.length})`}
                        </p>
                      </>
                    )}

                    {fileState.status === 'error' && (
                      <p className="text-xs text-red-500 mt-1">
                        {fileState.error}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {fileState.status === 'uploading' && (
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    )}
                    {fileState.status === 'complete' && (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    )}
                    {fileState.status === 'error' && (
                      <AlertCircle className="h-5 w-5 text-red-500" />
                    )}

                    {fileState.status === 'uploading' ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => cancelUpload(fileState.id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    ) : fileState.status === 'error' ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => retryUpload(fileState)}
                      >
                        Retry
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeFile(fileState.id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
