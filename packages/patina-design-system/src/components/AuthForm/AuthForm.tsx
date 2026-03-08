'use client'

import * as React from 'react'
import { cn } from '../../utils/cn'
import { Input } from '../Input'
import { Button } from '../Button'
import { FormField } from '../FormField'
import { Alert } from '../Alert'
import { Spinner } from '../Spinner'
import { Eye, EyeOff, Mail, Lock, User } from 'lucide-react'

export interface AuthFormField {
  /**
   * Field name/id
   */
  name: string
  /**
   * Field label
   */
  label: string
  /**
   * Field type
   */
  type: 'text' | 'email' | 'password' | 'tel'
  /**
   * Placeholder text
   */
  placeholder?: string
  /**
   * Whether field is required
   */
  required?: boolean
  /**
   * Validation pattern
   */
  pattern?: string
  /**
   * Error message for this field
   */
  error?: string
  /**
   * Auto-complete value
   */
  autoComplete?: string
}

export interface AuthFormProps extends Omit<React.FormHTMLAttributes<HTMLFormElement>, 'onSubmit'> {
  /**
   * Form title
   */
  title: string
  /**
   * Form description
   */
  description?: string
  /**
   * Form fields configuration
   */
  fields: AuthFormField[]
  /**
   * Submit button text
   */
  submitText?: string
  /**
   * Whether form is loading
   */
  isLoading?: boolean
  /**
   * Error message to display
   */
  error?: string
  /**
   * Success message to display
   */
  success?: string
  /**
   * Form submit handler
   */
  onSubmit: (data: Record<string, string>) => void | Promise<void>
  /**
   * Footer content (links, additional info)
   */
  footer?: React.ReactNode
  /**
   * Show logo/branding
   */
  showLogo?: boolean
  /**
   * Logo content
   */
  logo?: React.ReactNode
}

/**
 * AuthForm - Reusable authentication form component
 *
 * Provides a consistent authentication form with validation, loading states, and error handling
 *
 * @example
 * ```tsx
 * <AuthForm
 *   title="Sign In"
 *   description="Welcome back"
 *   fields={[
 *     { name: 'email', label: 'Email', type: 'email', required: true },
 *     { name: 'password', label: 'Password', type: 'password', required: true }
 *   ]}
 *   submitText="Sign In"
 *   onSubmit={handleSubmit}
 *   isLoading={isLoading}
 *   error={error}
 * />
 * ```
 */
export const AuthForm = React.forwardRef<HTMLFormElement, AuthFormProps>(
  (
    {
      className,
      title,
      description,
      fields,
      submitText = 'Submit',
      isLoading = false,
      error,
      success,
      onSubmit,
      footer,
      showLogo = true,
      logo,
      ...props
    },
    ref
  ) => {
    const [formData, setFormData] = React.useState<Record<string, string>>({})
    const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({})

    const handleInputChange = (name: string, value: string) => {
      setFormData((prev) => ({ ...prev, [name]: value }))
      // Clear field error when user types
      if (fieldErrors[name]) {
        setFieldErrors((prev) => {
          const newErrors = { ...prev }
          delete newErrors[name]
          return newErrors
        })
      }
    }

    const validateForm = (): boolean => {
      const errors: Record<string, string> = {}

      fields.forEach((field) => {
        const value = formData[field.name] || ''

        if (field.required && !value.trim()) {
          errors[field.name] = `${field.label} is required`
        } else if (field.pattern && value && !new RegExp(field.pattern).test(value)) {
          errors[field.name] = `Invalid ${field.label.toLowerCase()}`
        } else if (field.type === 'email' && value && !isValidEmail(value)) {
          errors[field.name] = 'Invalid email address'
        }
      })

      setFieldErrors(errors)
      return Object.keys(errors).length === 0
    }

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault()

      if (!validateForm()) {
        return
      }

      await onSubmit(formData)
    }

    const isValidEmail = (email: string): boolean => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      return emailRegex.test(email)
    }

    const getFieldIcon = (type: string) => {
      switch (type) {
        case 'email':
          return <Mail className="h-4 w-4" />
        case 'password':
          return <Lock className="h-4 w-4" />
        case 'text':
          return <User className="h-4 w-4" />
        default:
          return undefined
      }
    }

    return (
      <form
        ref={ref}
        onSubmit={handleSubmit}
        className={cn('w-full space-y-6', className)}
        {...props}
      >
        {/* Header */}
        <div className="text-center">
          {showLogo && (
            <div className="mx-auto mb-4">
              {logo || (
                <div className="mx-auto h-12 w-12 text-primary">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-full w-full"
                  >
                    <path
                      d="M12 2L2 7L12 12L22 7L12 2Z"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M2 17L12 22L22 17"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M2 12L12 17L22 12"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              )}
            </div>
          )}
          <h1 className="text-2xl font-bold text-foreground">{title}</h1>
          {description && (
            <p className="mt-2 text-sm text-muted-foreground">{description}</p>
          )}
        </div>

        {/* Alerts */}
        {error && (
          <Alert variant="error" title="Error" description={error} closable />
        )}
        {success && (
          <Alert variant="success" title="Success" description={success} closable />
        )}

        {/* Form Fields */}
        <div className="space-y-4">
          {fields.map((field) => (
            <FormField
              key={field.name}
              label={field.label}
              error={fieldErrors[field.name] || field.error}
              required={field.required}
              htmlFor={field.name}
            >
              <Input
                id={field.name}
                name={field.name}
                type={field.type}
                placeholder={field.placeholder}
                required={field.required}
                autoComplete={field.autoComplete}
                leftIcon={getFieldIcon(field.type)}
                value={formData[field.name] || ''}
                onChange={(e) => handleInputChange(field.name, e.target.value)}
                state={fieldErrors[field.name] || field.error ? 'error' : 'default'}
                disabled={isLoading}
              />
            </FormField>
          ))}
        </div>

        {/* Submit Button */}
        <Button
          type="submit"
          className="w-full"
          size="lg"
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <Spinner size="sm" color="white" />
              <span>Loading...</span>
            </>
          ) : (
            submitText
          )}
        </Button>

        {/* Footer */}
        {footer && (
          <div className="mt-4">
            {footer}
          </div>
        )}
      </form>
    )
  }
)

AuthForm.displayName = 'AuthForm'
