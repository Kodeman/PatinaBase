'use client'

import * as React from 'react'
import { cn } from '../../utils/cn'
import { Image } from '../Image'
import { Icon } from '../Icon'
import { Button } from '../Button'
import { DragDropContext, SortableList, DraggableItem } from '../DragDrop'
import type { DragEndEvent } from '@dnd-kit/core'

export type QuestionType = 'single-select' | 'multi-select' | 'scale' | 'image-picker' | 'ranking'

export interface QuizOption {
  id: string
  label: string
  value: string
  image?: string
}

export interface StyleQuizCardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {
  /**
   * Question type
   */
  type: QuestionType
  /**
   * Question text
   */
  question: string
  /**
   * Question description (optional)
   */
  description?: string
  /**
   * Available options
   */
  options: QuizOption[]
  /**
   * Selected values
   */
  value?: string | string[] | number
  /**
   * Callback when value changes
   */
  onChange?: (value: string | string[] | number) => void
  /**
   * Current step number
   */
  currentStep?: number
  /**
   * Total steps
   */
  totalSteps?: number
  /**
   * Scale configuration (for scale type)
   */
  scaleConfig?: {
    min: number
    max: number
    step?: number
    minLabel?: string
    maxLabel?: string
  }
  /**
   * Show progress indicator
   */
  showProgress?: boolean
  /**
   * Callback when next is clicked
   */
  onNext?: () => void
  /**
   * Callback when back is clicked
   */
  onBack?: () => void
  /**
   * Disable next button
   */
  disableNext?: boolean
}

/**
 * StyleQuizCard component for style profile quiz
 * Supports 5 question types: single-select, multi-select, scale, image-picker, ranking
 *
 * @example
 * ```tsx
 * <StyleQuizCard
 *   type="single-select"
 *   question="What's your preferred design style?"
 *   options={[
 *     { id: '1', label: 'Modern', value: 'modern', image: '/modern.jpg' },
 *     { id: '2', label: 'Traditional', value: 'traditional', image: '/trad.jpg' }
 *   ]}
 *   onChange={(value) => console.log(value)}
 * />
 * ```
 */
export const StyleQuizCard = React.forwardRef<HTMLDivElement, StyleQuizCardProps>(
  (
    {
      type,
      question,
      description,
      options,
      value,
      onChange,
      currentStep,
      totalSteps,
      scaleConfig = { min: 1, max: 5, step: 1 },
      showProgress = true,
      onNext,
      onBack,
      disableNext = false,
      className,
      ...props
    },
    ref
  ) => {
    const [localValue, setLocalValue] = React.useState<string | string[] | number>(
      value ?? (type === 'multi-select' ? [] : type === 'scale' ? scaleConfig.min : '')
    )

    React.useEffect(() => {
      if (value !== undefined) {
        setLocalValue(value)
      }
    }, [value])

    const handleChange = (newValue: string | string[] | number) => {
      setLocalValue(newValue)
      onChange?.(newValue)
    }

    const progressPercentage = currentStep && totalSteps
      ? ((currentStep / totalSteps) * 100)
      : 0

    return (
      <div
        ref={ref}
        className={cn('bg-card rounded-lg shadow-lg p-6 max-w-2xl mx-auto', className)}
        {...props}
      >
        {/* Progress Bar */}
        {showProgress && currentStep && totalSteps && (
          <div className="mb-6">
            <div className="flex justify-between text-sm text-muted-foreground mb-2">
              <span>Question {currentStep} of {totalSteps}</span>
              <span>{Math.round(progressPercentage)}%</span>
            </div>
            <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
          </div>
        )}

        {/* Question */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold mb-2">{question}</h2>
          {description && (
            <p className="text-muted-foreground">{description}</p>
          )}
        </div>

        {/* Answer Area */}
        <div className="mb-6">
          {type === 'single-select' && (
            <SingleSelectQuestion
              options={options}
              value={localValue as string}
              onChange={handleChange}
            />
          )}

          {type === 'multi-select' && (
            <MultiSelectQuestion
              options={options}
              value={localValue as string[]}
              onChange={handleChange}
            />
          )}

          {type === 'scale' && (
            <ScaleQuestion
              value={localValue as number}
              onChange={handleChange}
              config={scaleConfig}
            />
          )}

          {type === 'image-picker' && (
            <ImagePickerQuestion
              options={options}
              value={localValue as string}
              onChange={handleChange}
            />
          )}

          {type === 'ranking' && (
            <RankingQuestion
              options={options}
              value={localValue as string[]}
              onChange={handleChange}
            />
          )}
        </div>

        {/* Navigation */}
        <div className="flex justify-between gap-4">
          {onBack && (
            <Button variant="outline" onClick={onBack}>
              <Icon name="ChevronLeft" size={18} className="mr-1" />
              Back
            </Button>
          )}
          {onNext && (
            <Button
              onClick={onNext}
              disabled={disableNext}
              className="ml-auto"
            >
              Next
              <Icon name="ChevronRight" size={18} className="ml-1" />
            </Button>
          )}
        </div>
      </div>
    )
  }
)

StyleQuizCard.displayName = 'StyleQuizCard'

// Internal question type components

interface QuestionComponentProps {
  options?: QuizOption[]
  value: any
  onChange: (value: any) => void
  config?: any
}

const SingleSelectQuestion: React.FC<QuestionComponentProps> = ({
  options = [],
  value,
  onChange,
}) => {
  return (
    <div className="space-y-3">
      {options.map((option) => (
        <button
          key={option.id}
          onClick={() => onChange(option.value)}
          className={cn(
            'w-full flex items-center gap-4 p-4 rounded-lg border-2 transition-all',
            value === option.value
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-primary/50'
          )}
        >
          {option.image && (
            <Image
              src={option.image}
              alt={option.label}
              className="w-16 h-16 rounded"
              aspectRatio="1/1"
            />
          )}
          <span className="font-medium flex-1 text-left">{option.label}</span>
          {value === option.value && (
            <Icon name="Check" size={20} className="text-primary" />
          )}
        </button>
      ))}
    </div>
  )
}

const MultiSelectQuestion: React.FC<QuestionComponentProps> = ({
  options = [],
  value = [],
  onChange,
}) => {
  const toggleOption = (optionValue: string) => {
    const newValue = value.includes(optionValue)
      ? value.filter((v: string) => v !== optionValue)
      : [...value, optionValue]
    onChange(newValue)
  }

  return (
    <div className="space-y-3">
      {options.map((option) => {
        const isSelected = value.includes(option.value)
        return (
          <button
            key={option.id}
            onClick={() => toggleOption(option.value)}
            className={cn(
              'w-full flex items-center gap-4 p-4 rounded-lg border-2 transition-all',
              isSelected
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50'
            )}
          >
            {option.image && (
              <Image
                src={option.image}
                alt={option.label}
                className="w-16 h-16 rounded"
                aspectRatio="1/1"
              />
            )}
            <span className="font-medium flex-1 text-left">{option.label}</span>
            <div
              className={cn(
                'w-6 h-6 rounded border-2 flex items-center justify-center',
                isSelected ? 'bg-primary border-primary' : 'border-border'
              )}
            >
              {isSelected && <Icon name="Check" size={16} className="text-white" />}
            </div>
          </button>
        )
      })}
    </div>
  )
}

const ScaleQuestion: React.FC<QuestionComponentProps> = ({
  value,
  onChange,
  config,
}) => {
  const { min, max, step = 1, minLabel, maxLabel } = config

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center gap-4">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value || min}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 h-2 bg-muted rounded-lg appearance-none cursor-pointer"
        />
        <span className="text-2xl font-bold w-12 text-center">{value || min}</span>
      </div>

      {(minLabel || maxLabel) && (
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>{minLabel}</span>
          <span>{maxLabel}</span>
        </div>
      )}
    </div>
  )
}

const ImagePickerQuestion: React.FC<QuestionComponentProps> = ({
  options = [],
  value,
  onChange,
}) => {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      {options.map((option) => (
        <button
          key={option.id}
          onClick={() => onChange(option.value)}
          className={cn(
            'relative rounded-lg overflow-hidden border-4 transition-all',
            value === option.value
              ? 'border-primary'
              : 'border-transparent hover:border-primary/50'
          )}
        >
          {option.image && (
            <Image
              src={option.image}
              alt={option.label}
              aspectRatio="4/3"
            />
          )}
          <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/70 to-transparent">
            <p className="text-white font-medium text-sm">{option.label}</p>
          </div>
          {value === option.value && (
            <div className="absolute top-2 right-2 bg-primary rounded-full p-1">
              <Icon name="Check" size={16} className="text-white" />
            </div>
          )}
        </button>
      ))}
    </div>
  )
}

const RankingQuestion: React.FC<QuestionComponentProps> = ({
  options = [],
  value = [],
  onChange,
}) => {
  const orderedOptions = React.useMemo(() => {
    if (value.length === 0) {
      return options.map(o => o.value)
    }
    return value
  }, [options, value])

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      const oldIndex = orderedOptions.indexOf(active.id as string)
      const newIndex = orderedOptions.indexOf(over.id as string)

      const newOrder = [...orderedOptions]
      const [movedItem] = newOrder.splice(oldIndex, 1)
      newOrder.splice(newIndex, 0, movedItem)

      onChange(newOrder)
    }
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <SortableList items={orderedOptions} strategy="vertical">
        <div className="space-y-2">
          {orderedOptions.map((optionValue: string, index: number) => {
            const option = options.find(o => o.value === optionValue)
            if (!option) return null

            return (
              <DraggableItem
                key={option.id}
                id={option.value}
                className={cn(
                  'flex items-center gap-4 p-4 rounded-lg border-2 border-border',
                  'bg-card hover:bg-accent/50 transition-colors'
                )}
              >
                <div className="flex items-center gap-3">
                  <Icon name="GripVertical" size={20} className="text-muted-foreground" />
                  <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center font-bold">
                    {index + 1}
                  </div>
                </div>
                {option.image && (
                  <Image
                    src={option.image}
                    alt={option.label}
                    className="w-12 h-12 rounded"
                    aspectRatio="1/1"
                  />
                )}
                <span className="font-medium flex-1">{option.label}</span>
              </DraggableItem>
            )
          })}
        </div>
      </SortableList>
    </DragDropContext>
  )
}
