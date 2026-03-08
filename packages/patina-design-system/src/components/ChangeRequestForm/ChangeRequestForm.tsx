'use client'

import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Upload, X, AlertCircle, Clock, CheckCircle, FileText, Image as ImageIcon } from 'lucide-react'
import { cn } from '../../utils/cn'
import { Button } from '../Button'
import { Textarea } from '../Textarea'
import { Label } from '../Label'
import { Badge } from '../Badge'

export interface ChangeRequestFormData {
  category: 'design' | 'material' | 'timeline' | 'budget' | 'other'
  priority: 'low' | 'medium' | 'high' | 'urgent'
  title: string
  description: string
  attachments: File[]
  expectedResponse?: 'asap' | '24h' | '48h' | '1week'
}

export interface ChangeRequestFormProps {
  onSubmit: (data: ChangeRequestFormData) => void
  onCancel?: () => void
  initialData?: Partial<ChangeRequestFormData>
  approvalId?: string
  approvalTitle?: string
  maxAttachments?: number
  maxFileSize?: number // in MB
  className?: string
}

const CATEGORIES = [
  { value: 'design', label: 'Design Changes', icon: '🎨' },
  { value: 'material', label: 'Material Selection', icon: '🪵' },
  { value: 'timeline', label: 'Timeline Adjustment', icon: '📅' },
  { value: 'budget', label: 'Budget Concerns', icon: '💰' },
  { value: 'other', label: 'Other', icon: '📝' },
] as const

const PRIORITIES = [
  { value: 'low', label: 'Low', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100' },
  { value: 'medium', label: 'Medium', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100' },
  { value: 'high', label: 'High', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-100' },
  { value: 'urgent', label: 'Urgent', color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100' },
] as const

const RESPONSE_TIMES = [
  { value: 'asap', label: 'ASAP', description: 'Within business hours' },
  { value: '24h', label: '24 Hours', description: 'Next business day' },
  { value: '48h', label: '48 Hours', description: 'Two business days' },
  { value: '1week', label: '1 Week', description: 'No rush, whenever convenient' },
] as const

/**
 * ChangeRequestForm - Structured feedback and change request form
 *
 * Allows clients to submit detailed change requests with categorization,
 * priority levels, attachments, and expected response times.
 *
 * @example
 * ```tsx
 * <ChangeRequestForm
 *   onSubmit={handleChangeRequest}
 *   onCancel={() => setShowForm(false)}
 *   approvalId="approval-123"
 *   approvalTitle="Living Room Design"
 * />
 * ```
 */
export const ChangeRequestForm = React.forwardRef<HTMLFormElement, ChangeRequestFormProps>(
  ({
    onSubmit,
    onCancel,
    initialData,
    approvalId,
    approvalTitle,
    maxAttachments = 5,
    maxFileSize = 10, // 10MB default
    className,
    ...props
  }, ref) => {
    const [formData, setFormData] = React.useState<ChangeRequestFormData>({
      category: initialData?.category || 'design',
      priority: initialData?.priority || 'medium',
      title: initialData?.title || '',
      description: initialData?.description || '',
      attachments: initialData?.attachments || [],
      expectedResponse: initialData?.expectedResponse || '24h',
    })

    const [errors, setErrors] = React.useState<Partial<Record<keyof ChangeRequestFormData, string>>>({})
    const [isDragging, setIsDragging] = React.useState(false)
    const fileInputRef = React.useRef<HTMLInputElement>(null)

    const validateForm = (): boolean => {
      const newErrors: Partial<Record<keyof ChangeRequestFormData, string>> = {}

      if (!formData.title.trim()) {
        newErrors.title = 'Title is required'
      }

      if (!formData.description.trim()) {
        newErrors.description = 'Description is required'
      } else if (formData.description.trim().length < 10) {
        newErrors.description = 'Description must be at least 10 characters'
      }

      if (formData.attachments.length > maxAttachments) {
        newErrors.attachments = `Maximum ${maxAttachments} attachments allowed`
      }

      setErrors(newErrors)
      return Object.keys(newErrors).length === 0
    }

    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault()
      if (validateForm()) {
        onSubmit(formData)
      }
    }

    const handleFileSelect = (files: FileList | null) => {
      if (!files) return

      const newFiles = Array.from(files).filter(file => {
        const sizeMB = file.size / (1024 * 1024)
        return sizeMB <= maxFileSize
      })

      const totalFiles = [...formData.attachments, ...newFiles].slice(0, maxAttachments)
      setFormData({ ...formData, attachments: totalFiles })
    }

    const removeAttachment = (index: number) => {
      const newAttachments = formData.attachments.filter((_, i) => i !== index)
      setFormData({ ...formData, attachments: newAttachments })
    }

    const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(true)
    }

    const handleDragLeave = (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
    }

    const handleDrop = (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      handleFileSelect(e.dataTransfer.files)
    }

    const getFileIcon = (file: File) => {
      if (file.type.startsWith('image/')) return <ImageIcon className="h-4 w-4" />
      return <FileText className="h-4 w-4" />
    }

    return (
      <form
        ref={ref}
        onSubmit={handleSubmit}
        className={cn('space-y-6', className)}
        {...props}
      >
        {/* Context Header */}
        {approvalTitle && (
          <div className="p-4 bg-muted rounded-lg">
            <p className="text-sm text-muted-foreground">Requesting changes for:</p>
            <p className="font-semibold mt-1">{approvalTitle}</p>
          </div>
        )}

        {/* Category Selection */}
        <div className="space-y-2">
          <Label htmlFor="category">Change Category</Label>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.value}
                type="button"
                onClick={() => setFormData({ ...formData, category: cat.value })}
                className={cn(
                  'p-3 rounded-lg border-2 transition-all text-left',
                  formData.category === cat.value
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                )}
              >
                <span className="text-xl mb-1 block">{cat.icon}</span>
                <span className="text-sm font-medium">{cat.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Priority Level */}
        <div className="space-y-2">
          <Label htmlFor="priority">Priority Level</Label>
          <div className="flex gap-2 flex-wrap">
            {PRIORITIES.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setFormData({ ...formData, priority: p.value })}
                className={cn(
                  'px-4 py-2 rounded-full text-sm font-medium transition-all',
                  formData.priority === p.value
                    ? p.color + ' ring-2 ring-offset-2 ring-primary'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Title */}
        <div className="space-y-2">
          <Label htmlFor="title">
            Change Title <span className="text-red-500">*</span>
          </Label>
          <input
            id="title"
            type="text"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            className={cn(
              'w-full px-3 py-2 rounded-md border bg-background',
              'focus:outline-none focus:ring-2 focus:ring-primary',
              errors.title && 'border-red-500'
            )}
            placeholder="Brief summary of what you'd like to change"
          />
          {errors.title && (
            <p className="text-sm text-red-500 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              {errors.title}
            </p>
          )}
        </div>

        {/* Description */}
        <div className="space-y-2">
          <Label htmlFor="description">
            Detailed Description <span className="text-red-500">*</span>
          </Label>
          <Textarea
            id="description"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            rows={6}
            className={cn(
              errors.description && 'border-red-500'
            )}
            placeholder="Please provide as much detail as possible about the changes you'd like to see..."
          />
          <div className="flex justify-between items-center">
            {errors.description ? (
              <p className="text-sm text-red-500 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {errors.description}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                {formData.description.length} characters
              </p>
            )}
          </div>
        </div>

        {/* Attachments */}
        <div className="space-y-2">
          <Label htmlFor="attachments">
            Attachments (Optional)
          </Label>
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
              'border-2 border-dashed rounded-lg p-6 transition-colors',
              isDragging
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50'
            )}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.pdf,.doc,.docx"
              onChange={(e) => handleFileSelect(e.target.files)}
              className="hidden"
            />
            <div className="text-center">
              <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm font-medium mb-1">
                Drop files here or{' '}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-primary hover:underline"
                >
                  browse
                </button>
              </p>
              <p className="text-xs text-muted-foreground">
                Max {maxAttachments} files, up to {maxFileSize}MB each
              </p>
            </div>
          </div>

          {/* Attachment List */}
          <AnimatePresence>
            {formData.attachments.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-2"
              >
                {formData.attachments.map((file, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="flex items-center gap-2 p-2 rounded-md bg-muted"
                  >
                    {getFileIcon(file)}
                    <span className="text-sm flex-1 truncate">{file.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {(file.size / 1024).toFixed(1)}KB
                    </span>
                    <button
                      type="button"
                      onClick={() => removeAttachment(index)}
                      className="p-1 hover:bg-background rounded"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Expected Response Time */}
        <div className="space-y-2">
          <Label htmlFor="response-time">Expected Response Time</Label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {RESPONSE_TIMES.map((time) => (
              <button
                key={time.value}
                type="button"
                onClick={() => setFormData({ ...formData, expectedResponse: time.value })}
                className={cn(
                  'p-3 rounded-lg border-2 transition-all text-left',
                  formData.expectedResponse === time.value
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                )}
              >
                <p className="text-sm font-medium">{time.label}</p>
                <p className="text-xs text-muted-foreground mt-1">{time.description}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Info Banner */}
        <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
          <div className="flex gap-3">
            <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                Your designer will be notified immediately
              </p>
              <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                You'll receive a response within your requested timeframe. Urgent requests are prioritized.
              </p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 justify-end pt-4 border-t">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type="submit" className="px-6">
            <CheckCircle className="h-4 w-4 mr-2" />
            Submit Change Request
          </Button>
        </div>
      </form>
    )
  }
)

ChangeRequestForm.displayName = 'ChangeRequestForm'
