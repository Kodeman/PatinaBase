'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card } from '@patina/design-system';
import { Button } from '@patina/design-system';
import { Slider } from '@patina/design-system';
import { ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

// Question types
type QuestionType = 'single-image' | 'multi-select' | 'scale' | 'image-picker' | 'ranking';

interface Question {
  id: string;
  type: QuestionType;
  title: string;
  description?: string;
  options?: Array<{
    id: string;
    label: string;
    value: string;
    image?: string;
  }>;
  min?: number;
  max?: number;
  step?: number;
  labels?: { min: string; max: string };
}

const QUIZ_QUESTIONS: Question[] = [
  {
    id: 'q1',
    type: 'single-image',
    title: 'Which style resonates with you most?',
    description: 'Select the interior style that best matches your preferences',
    options: [
      { id: 'modern', label: 'Modern Minimalist', value: 'modern', image: '/styles/modern.jpg' },
      { id: 'classic', label: 'Classic Traditional', value: 'classic', image: '/styles/classic.jpg' },
      { id: 'bohemian', label: 'Bohemian Eclectic', value: 'bohemian', image: '/styles/bohemian.jpg' },
      { id: 'industrial', label: 'Industrial Loft', value: 'industrial', image: '/styles/industrial.jpg' },
    ],
  },
  {
    id: 'q2',
    type: 'multi-select',
    title: 'What materials do you prefer?',
    description: 'Select all that apply',
    options: [
      { id: 'wood', label: 'Natural Wood', value: 'wood' },
      { id: 'metal', label: 'Metal Accents', value: 'metal' },
      { id: 'glass', label: 'Glass & Chrome', value: 'glass' },
      { id: 'fabric', label: 'Soft Fabrics', value: 'fabric' },
      { id: 'leather', label: 'Leather', value: 'leather' },
      { id: 'stone', label: 'Stone & Marble', value: 'stone' },
    ],
  },
  {
    id: 'q3',
    type: 'scale',
    title: 'How important is sustainability to you?',
    description: 'Rate on a scale from 1-10',
    min: 1,
    max: 10,
    step: 1,
    labels: { min: 'Not Important', max: 'Very Important' },
  },
  {
    id: 'q4',
    type: 'image-picker',
    title: 'Select your favorite color palettes',
    description: 'Choose 2-3 palettes that appeal to you',
    options: [
      { id: 'neutral', label: 'Neutral Tones', value: 'neutral', image: '/palettes/neutral.jpg' },
      { id: 'earth', label: 'Earth Tones', value: 'earth', image: '/palettes/earth.jpg' },
      { id: 'cool', label: 'Cool Blues', value: 'cool', image: '/palettes/cool.jpg' },
      { id: 'warm', label: 'Warm Hues', value: 'warm', image: '/palettes/warm.jpg' },
      { id: 'bold', label: 'Bold & Vibrant', value: 'bold', image: '/palettes/bold.jpg' },
      { id: 'monochrome', label: 'Monochrome', value: 'monochrome', image: '/palettes/monochrome.jpg' },
    ],
  },
  {
    id: 'q5',
    type: 'ranking',
    title: 'Rank these room priorities',
    description: 'Drag to reorder from most to least important',
    options: [
      { id: 'living', label: 'Living Room', value: 'living' },
      { id: 'bedroom', label: 'Bedroom', value: 'bedroom' },
      { id: 'kitchen', label: 'Kitchen', value: 'kitchen' },
      { id: 'bathroom', label: 'Bathroom', value: 'bathroom' },
      { id: 'office', label: 'Home Office', value: 'office' },
    ],
  },
];

function NewQuizContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const clientId = searchParams.get('clientId');

  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [rankedItems, setRankedItems] = useState<string[]>([]);

  const question = QUIZ_QUESTIONS[currentQuestion];
  const progress = ((currentQuestion + 1) / QUIZ_QUESTIONS.length) * 100;

  const handleSingleSelect = (value: string) => {
    setAnswers({ ...answers, [question.id]: value });
  };

  const handleMultiSelect = (value: string) => {
    const current = answers[question.id] || [];
    const newValue = current.includes(value)
      ? current.filter((v: string) => v !== value)
      : [...current, value];
    setAnswers({ ...answers, [question.id]: newValue });
  };

  const handleScale = (value: number[]) => {
    setAnswers({ ...answers, [question.id]: value[0] });
  };

  const handleImagePicker = (value: string) => {
    const current = answers[question.id] || [];
    const newValue = current.includes(value)
      ? current.filter((v: string) => v !== value)
      : [...current, value];
    setAnswers({ ...answers, [question.id]: newValue });
  };

  const handleNext = () => {
    if (currentQuestion < QUIZ_QUESTIONS.length - 1) {
      setCurrentQuestion(currentQuestion + 1);
    } else {
      // Submit quiz
      console.log('Quiz completed:', answers);
      router.push('/demo/style-profile');
    }
  };

  const handlePrevious = () => {
    if (currentQuestion > 0) {
      setCurrentQuestion(currentQuestion - 1);
    }
  };

  const canProceed = () => {
    const answer = answers[question.id];
    if (!answer) return false;
    if (Array.isArray(answer)) return answer.length > 0;
    return true;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-50 dark:from-gray-900 dark:to-gray-800 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Question {currentQuestion + 1} of {QUIZ_QUESTIONS.length}
            </span>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {Math.round(progress)}%
            </span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div
              className="bg-purple-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Question Card */}
        <Card className="p-8">
          <h2 className="text-2xl font-bold mb-2">{question.title}</h2>
          {question.description && (
            <p className="text-gray-600 dark:text-gray-400 mb-6">{question.description}</p>
          )}

          {/* Single Image Select */}
          {question.type === 'single-image' && (
            <div className="grid grid-cols-2 gap-4">
              {question.options?.map((option) => (
                <button
                  key={option.id}
                  onClick={() => handleSingleSelect(option.value)}
                  className={cn(
                    'relative aspect-[4/3] rounded-lg overflow-hidden border-4 transition-all',
                    answers[question.id] === option.value
                      ? 'border-purple-600 ring-4 ring-purple-200'
                      : 'border-gray-200 hover:border-gray-300'
                  )}
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-800 flex items-center justify-center">
                    <span className="text-gray-500 dark:text-gray-400">{option.label}</span>
                  </div>
                  {answers[question.id] === option.value && (
                    <div className="absolute top-2 right-2 bg-purple-600 text-white rounded-full p-1">
                      <Check className="h-4 w-4" />
                    </div>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white p-3">
                    <p className="font-medium">{option.label}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Multi-Select */}
          {question.type === 'multi-select' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {question.options?.map((option) => {
                const isSelected = (answers[question.id] || []).includes(option.value);
                return (
                  <button
                    key={option.id}
                    onClick={() => handleMultiSelect(option.value)}
                    className={cn(
                      'p-4 rounded-lg border-2 transition-all text-left',
                      isSelected
                        ? 'border-purple-600 bg-purple-50 dark:bg-purple-900/20'
                        : 'border-gray-200 hover:border-gray-300'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{option.label}</span>
                      {isSelected && (
                        <Check className="h-5 w-5 text-purple-600" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Scale Slider */}
          {question.type === 'scale' && (
            <div className="py-8">
              <Slider
                value={[answers[question.id] || 5]}
                onValueChange={handleScale}
                min={question.min}
                max={question.max}
                step={question.step}
                showValue
              />
              {question.labels && (
                <div className="flex justify-between mt-4">
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {question.labels.min}
                  </span>
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {question.labels.max}
                  </span>
                </div>
              )}
              <div className="text-center mt-6">
                <span className="text-4xl font-bold text-purple-600">
                  {answers[question.id] || 5}
                </span>
              </div>
            </div>
          )}

          {/* Image Picker */}
          {question.type === 'image-picker' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {question.options?.map((option) => {
                const isSelected = (answers[question.id] || []).includes(option.value);
                return (
                  <button
                    key={option.id}
                    onClick={() => handleImagePicker(option.value)}
                    className={cn(
                      'relative aspect-square rounded-lg overflow-hidden border-4 transition-all',
                      isSelected
                        ? 'border-purple-600 ring-4 ring-purple-200'
                        : 'border-gray-200 hover:border-gray-300'
                    )}
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-800 flex items-center justify-center">
                      <span className="text-xs text-center px-2 text-gray-500 dark:text-gray-400">
                        {option.label}
                      </span>
                    </div>
                    {isSelected && (
                      <div className="absolute top-2 right-2 bg-purple-600 text-white rounded-full p-1">
                        <Check className="h-4 w-4" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Ranking */}
          {question.type === 'ranking' && (
            <div className="space-y-2">
              {(rankedItems.length ? rankedItems : question.options?.map((o) => o.id) || []).map(
                (id, index) => {
                  const option = question.options?.find((o) => o.id === id);
                  if (!option) return null;
                  return (
                    <div
                      key={option.id}
                      className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg cursor-move"
                    >
                      <span className="flex items-center justify-center w-8 h-8 bg-purple-600 text-white rounded-full font-bold text-sm">
                        {index + 1}
                      </span>
                      <span className="flex-1 font-medium">{option.label}</span>
                      <div className="flex flex-col gap-1">
                        <button
                          onClick={() => {
                            if (index > 0) {
                              const newRanked = [...(rankedItems.length ? rankedItems : question.options?.map((o) => o.id) || [])];
                              [newRanked[index], newRanked[index - 1]] = [newRanked[index - 1], newRanked[index]];
                              setRankedItems(newRanked);
                              setAnswers({ ...answers, [question.id]: newRanked });
                            }
                          }}
                          className="text-gray-400 hover:text-gray-600"
                        >
                          ▲
                        </button>
                        <button
                          onClick={() => {
                            const currentRanked = rankedItems.length ? rankedItems : question.options?.map((o) => o.id) || [];
                            if (index < currentRanked.length - 1) {
                              const newRanked = [...currentRanked];
                              [newRanked[index], newRanked[index + 1]] = [newRanked[index + 1], newRanked[index]];
                              setRankedItems(newRanked);
                              setAnswers({ ...answers, [question.id]: newRanked });
                            }
                          }}
                          className="text-gray-400 hover:text-gray-600"
                        >
                          ▼
                        </button>
                      </div>
                    </div>
                  );
                }
              )}
            </div>
          )}
        </Card>

        {/* Navigation */}
        <div className="mt-6 flex justify-between">
          <Button
            variant="outline"
            onClick={handlePrevious}
            disabled={currentQuestion === 0}
          >
            <ChevronLeft className="h-4 w-4 mr-2" />
            Previous
          </Button>
          <Button
            onClick={handleNext}
            disabled={!canProceed()}
          >
            {currentQuestion === QUIZ_QUESTIONS.length - 1 ? (
              <>
                <Check className="h-4 w-4 mr-2" />
                Complete Quiz
              </>
            ) : (
              <>
                Next
                <ChevronRight className="h-4 w-4 ml-2" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function NewQuizLoadingFallback() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-50 dark:from-gray-900 dark:to-gray-800 p-6">
      <div className="max-w-4xl mx-auto">
        <Card className="p-8">
          <div className="text-center">
            <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-4"></div>
            <p className="text-gray-600 dark:text-gray-400">Loading quiz...</p>
          </div>
        </Card>
      </div>
    </div>
  );
}

export default function NewQuizPage() {
  return (
    <Suspense fallback={<NewQuizLoadingFallback />}>
      <NewQuizContent />
    </Suspense>
  );
}
