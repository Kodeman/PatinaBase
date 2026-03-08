'use client'

import * as React from 'react'
import { cn } from '../../utils/cn'
import { Upload, X, File, Image as ImageIcon, type LucideProps } from 'lucide-react'
import { Button } from '../Button'

// Type helper for Lucide icons to work with React 19
const IconWrapper = ({ Icon, ...props }: { Icon: any } & LucideProps) => <Icon {...props} />

export interface FileUploadProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'type'> {
  /**
   * Callback when files are selected
   */
  onFilesChange?: (files: File[]) => void
  /**
   * Maximum number of files
   */
  maxFiles?: number
  /**
   * Maximum file size in bytes
   */
  maxSize?: number
  /**
   * Show preview for image files
   */
  showPreview?: boolean
  /**
   * Custom upload text
   */
  uploadText?: string
  /**
   * Custom drop text
   */
  dropText?: string
  /**
   * Custom class for container
   */
  containerClassName?: string
}

/**
 * FileUpload component with drag-and-drop support
 *
 * @example
 * ```tsx
 * <FileUpload
 *   accept="image/*"
 *   maxFiles={5}
 *   maxSize={5 * 1024 * 1024} // 5MB
 *   showPreview
 *   onFilesChange={(files) => console.log(files)}
 * />
 * ```
 */
export const FileUpload = React.forwardRef<HTMLInputElement, FileUploadProps>(
  (
    {
      className,
      containerClassName,
      onFilesChange,
      maxFiles = Infinity,
      maxSize = Infinity,
      showPreview = true,
      uploadText = 'Click to upload or drag and drop',
      dropText = 'Drop files here',
      accept,
      multiple = true,
      disabled,
      ...props
    },
    ref
  ) => {
    const [files, setFiles] = React.useState<File[]>([])
    const [isDragging, setIsDragging] = React.useState(false)
    const [previews, setPreviews] = React.useState<Record<string, string>>({})
    const inputRef = React.useRef<HTMLInputElement>(null)

    React.useImperativeHandle(ref, () => inputRef.current!)

    const handleFiles = React.useCallback(
      (newFiles: FileList | File[]) => {
        const fileArray = Array.from(newFiles)
        const validFiles = fileArray.filter((file) => {
          if (file.size > maxSize) {
            console.warn(`File ${file.name} exceeds max size`)
            return false
          }
          return true
        })

        const updatedFiles = [...files, ...validFiles].slice(0, maxFiles)
        setFiles(updatedFiles)
        onFilesChange?.(updatedFiles)

        // Generate previews for images
        if (showPreview) {
          validFiles.forEach((file) => {
            if (file.type.startsWith('image/')) {
              const reader = new FileReader()
              reader.onloadend = () => {
                setPreviews((prev) => ({
                  ...prev,
                  [file.name]: reader.result as string,
                }))
              }
              reader.readAsDataURL(file)
            }
          })
        }
      },
      [files, maxFiles, maxSize, onFilesChange, showPreview]
    )

    const handleDragEnter = React.useCallback((e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(true)
    }, [])

    const handleDragLeave = React.useCallback((e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(false)
    }, [])

    const handleDragOver = React.useCallback((e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
    }, [])

    const handleDrop = React.useCallback(
      (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragging(false)

        if (disabled) return

        const droppedFiles = e.dataTransfer.files
        if (droppedFiles.length > 0) {
          handleFiles(droppedFiles)
        }
      },
      [disabled, handleFiles]
    )

    const handleChange = React.useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = e.target.files
        if (selectedFiles && selectedFiles.length > 0) {
          handleFiles(selectedFiles)
        }
      },
      [handleFiles]
    )

    const removeFile = React.useCallback(
      (index: number) => {
        const fileName = files[index].name
        const updatedFiles = files.filter((_, i) => i !== index)
        setFiles(updatedFiles)
        onFilesChange?.(updatedFiles)

        // Remove preview
        setPreviews((prev) => {
          const newPreviews = { ...prev }
          delete newPreviews[fileName]
          return newPreviews
        })
      },
      [files, onFilesChange]
    )

    const openFileDialog = () => {
      inputRef.current?.click()
    }

    const formatFileSize = (bytes: number) => {
      if (bytes === 0) return '0 Bytes'
      const k = 1024
      const sizes = ['Bytes', 'KB', 'MB', 'GB']
      const i = Math.floor(Math.log(bytes) / Math.log(k))
      return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
    }

    return (
      <div className={cn('w-full', containerClassName)}>
        <div
          className={cn(
            'relative border-2 border-dashed rounded-lg p-6 transition-colors',
            isDragging
              ? 'border-primary bg-primary/5'
              : 'border-muted-foreground/25 hover:border-muted-foreground/50',
            disabled && 'opacity-50 cursor-not-allowed',
            className
          )}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            onChange={handleChange}
            accept={accept}
            multiple={multiple && maxFiles > 1}
            disabled={disabled}
            {...props}
          />

          <div className="flex flex-col items-center justify-center text-center">
            <IconWrapper
              Icon={Upload}
              className={cn(
                'h-10 w-10 mb-4 text-muted-foreground',
                isDragging && 'text-primary'
              )}
            />
            <p className="text-sm font-medium mb-1">
              {isDragging ? dropText : uploadText}
            </p>
            <p className="text-xs text-muted-foreground mb-4">
              {accept || 'Any file type'} • Max {formatFileSize(maxSize)}
              {maxFiles !== Infinity && ` • Up to ${maxFiles} files`}
            </p>
            <Button type="button" variant="outline" size="sm" onClick={openFileDialog} disabled={disabled}>
              Browse Files
            </Button>
          </div>
        </div>

        {files.length > 0 && (
          <div className="mt-4 space-y-2">
            {files.map((file, index) => {
              const isImage = file.type.startsWith('image/')
              const preview = previews[file.name]

              return (
                <div
                  key={`${file.name}-${index}`}
                  className="flex items-center gap-3 p-3 rounded-md border bg-background"
                >
                  {showPreview && preview ? (
                    <img
                      src={preview}
                      alt={file.name}
                      className="h-10 w-10 rounded object-cover"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded bg-muted flex items-center justify-center">
                      {isImage ? (
                        <IconWrapper Icon={ImageIcon} className="h-5 w-5 text-muted-foreground" />
                      ) : (
                        <IconWrapper Icon={File} className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(file.size)}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeFile(index)}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                    aria-label={`Remove ${file.name}`}
                  >
                    <IconWrapper Icon={X} className="h-4 w-4" />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }
)

FileUpload.displayName = 'FileUpload'
