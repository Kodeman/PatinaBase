/**
 * React Hook Form Integration Utilities
 *
 * This file provides utilities for integrating form components with react-hook-form.
 * Install react-hook-form to use these utilities:
 *
 * npm install react-hook-form
 *
 * @example
 * ```tsx
 * import { useForm } from 'react-hook-form'
 * import { Input, FormField } from '@patina/design-system'
 *
 * function MyForm() {
 *   const { register, handleSubmit, formState: { errors } } = useForm()
 *
 *   return (
 *     <form onSubmit={handleSubmit(onSubmit)}>
 *       <FormField
 *         label="Email"
 *         error={errors.email?.message}
 *         required
 *       >
 *         <Input
 *           {...register('email', { required: 'Email is required' })}
 *           type="email"
 *           state={errors.email ? 'error' : 'default'}
 *         />
 *       </FormField>
 *     </form>
 *   )
 * }
 * ```
 */

export const formIntegrationExample = `
// Example: Complete form with react-hook-form integration

import { useForm, Controller } from 'react-hook-form'
import {
  Input,
  Textarea,
  Select,
  Checkbox,
  Radio,
  RadioGroup,
  Switch,
  Slider,
  DatePicker,
  FileUpload,
  PinInput,
  ColorPicker,
  FormField,
  Button,
} from '@patina/design-system'

interface FormData {
  name: string
  email: string
  bio: string
  country: string
  terms: boolean
  plan: string
  notifications: boolean
  volume: number[]
  birthdate: Date
  avatar: File[]
  pin: string
  brandColor: string
}

export function CompleteFormExample() {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    defaultValues: {
      volume: [50],
      notifications: false,
    },
  })

  const onSubmit = async (data: FormData) => {
    console.log('Form data:', data)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 max-w-2xl mx-auto p-6">
      {/* Text Input */}
      <FormField
        label="Full Name"
        error={errors.name?.message}
        required
        htmlFor="name"
      >
        <Input
          id="name"
          {...register('name', {
            required: 'Name is required',
            minLength: { value: 2, message: 'Name must be at least 2 characters' },
          })}
          state={errors.name ? 'error' : 'default'}
          placeholder="Enter your name"
        />
      </FormField>

      {/* Email Input */}
      <FormField
        label="Email Address"
        error={errors.email?.message}
        required
        htmlFor="email"
      >
        <Input
          id="email"
          type="email"
          {...register('email', {
            required: 'Email is required',
            pattern: {
              value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}$/i,
              message: 'Invalid email address',
            },
          })}
          state={errors.email ? 'error' : 'default'}
          placeholder="you@example.com"
        />
      </FormField>

      {/* Textarea */}
      <FormField
        label="Bio"
        description="Tell us about yourself"
        error={errors.bio?.message}
        htmlFor="bio"
      >
        <Textarea
          id="bio"
          {...register('bio', {
            maxLength: { value: 500, message: 'Bio must be less than 500 characters' },
          })}
          state={errors.bio ? 'error' : 'default'}
          placeholder="Your bio..."
          rows={4}
          showCount
          maxLength={500}
        />
      </FormField>

      {/* Select */}
      <FormField
        label="Country"
        error={errors.country?.message}
        required
        htmlFor="country"
      >
        <Controller
          name="country"
          control={control}
          rules={{ required: 'Please select a country' }}
          render={({ field }) => (
            <Select
              {...field}
              onValueChange={field.onChange}
              placeholder="Select your country"
              state={errors.country ? 'error' : 'default'}
              options={[
                { value: 'us', label: 'United States' },
                { value: 'uk', label: 'United Kingdom' },
                { value: 'ca', label: 'Canada' },
              ]}
            />
          )}
        />
      </FormField>

      {/* Checkbox */}
      <FormField error={errors.terms?.message}>
        <div className="flex items-center gap-2">
          <Controller
            name="terms"
            control={control}
            rules={{ required: 'You must accept the terms' }}
            render={({ field }) => (
              <Checkbox
                id="terms"
                checked={field.value}
                onCheckedChange={field.onChange}
              />
            )}
          />
          <label htmlFor="terms" className="text-sm cursor-pointer">
            I accept the terms and conditions
          </label>
        </div>
      </FormField>

      {/* Radio Group */}
      <FormField
        label="Select Plan"
        error={errors.plan?.message}
        required
      >
        <Controller
          name="plan"
          control={control}
          rules={{ required: 'Please select a plan' }}
          render={({ field }) => (
            <RadioGroup value={field.value} onValueChange={field.onChange}>
              <div className="flex items-center gap-2">
                <Radio value="basic" id="basic" />
                <label htmlFor="basic" className="text-sm cursor-pointer">
                  Basic ($9/month)
                </label>
              </div>
              <div className="flex items-center gap-2">
                <Radio value="pro" id="pro" />
                <label htmlFor="pro" className="text-sm cursor-pointer">
                  Pro ($29/month)
                </label>
              </div>
            </RadioGroup>
          )}
        />
      </FormField>

      {/* Switch */}
      <FormField>
        <Controller
          name="notifications"
          control={control}
          render={({ field }) => (
            <Switch
              id="notifications"
              checked={field.value}
              onCheckedChange={field.onChange}
              label="Enable email notifications"
              description="Receive updates about your account"
            />
          )}
        />
      </FormField>

      {/* Slider */}
      <FormField label="Volume" description="Adjust the volume level">
        <Controller
          name="volume"
          control={control}
          render={({ field }) => (
            <Slider
              value={field.value}
              onValueChange={field.onChange}
              min={0}
              max={100}
              step={1}
              showValue
            />
          )}
        />
      </FormField>

      {/* DatePicker */}
      <FormField
        label="Date of Birth"
        error={errors.birthdate?.message}
        htmlFor="birthdate"
      >
        <Controller
          name="birthdate"
          control={control}
          render={({ field }) => (
            <DatePicker
              date={field.value}
              onDateChange={field.onChange}
              placeholder="Select your birthdate"
              disableAfter={new Date()}
            />
          )}
        />
      </FormField>

      {/* FileUpload */}
      <FormField
        label="Profile Picture"
        description="Upload a profile picture (max 5MB)"
      >
        <Controller
          name="avatar"
          control={control}
          render={({ field }) => (
            <FileUpload
              accept="image/*"
              maxFiles={1}
              maxSize={5 * 1024 * 1024}
              onFilesChange={field.onChange}
              showPreview
            />
          )}
        />
      </FormField>

      {/* PinInput */}
      <FormField
        label="Verification Code"
        description="Enter the 6-digit code sent to your email"
        error={errors.pin?.message}
      >
        <Controller
          name="pin"
          control={control}
          rules={{
            required: 'Verification code is required',
            minLength: { value: 6, message: 'Code must be 6 digits' },
          }}
          render={({ field }) => (
            <PinInput
              length={6}
              type="number"
              value={field.value}
              onChange={field.onChange}
              onComplete={(code) => console.log('PIN complete:', code)}
              state={errors.pin ? 'error' : 'default'}
            />
          )}
        />
      </FormField>

      {/* ColorPicker */}
      <FormField label="Brand Color" description="Choose your brand color">
        <Controller
          name="brandColor"
          control={control}
          render={({ field }) => (
            <ColorPicker
              color={field.value}
              onColorChange={field.onChange}
              showPresets
              format="hex"
            />
          )}
        />
      </FormField>

      {/* Submit Button */}
      <div className="flex gap-4">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Submitting...' : 'Submit Form'}
        </Button>
        <Button type="button" variant="outline">
          Cancel
        </Button>
      </div>
    </form>
  )
}
`
