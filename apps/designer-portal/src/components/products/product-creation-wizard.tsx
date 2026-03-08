'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Package,
  Image as ImageIcon,
  DollarSign,
  Settings,
  Save,
  AlertCircle,
} from 'lucide-react';
import {
  Alert,
  AlertDescription,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  toast,
} from '@patina/design-system';
import { cn } from '@/lib/utils';
import { catalogApi } from '@/lib/api-client';
import { canCreateProducts } from '@/lib/permissions';
import { DetailsTab, MediaTab, PricingTab, InventoryTab, SEOTab } from './tabs';
import type { Product, UserRole } from '@patina/types';

interface WizardStep {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  isOptional?: boolean;
}

const WIZARD_STEPS: WizardStep[] = [
  {
    id: 'essentials',
    title: 'Essentials',
    description: 'Name, brand, category, and description',
    icon: Package,
  },
  {
    id: 'media',
    title: 'Media',
    description: 'Product images and 3D assets',
    icon: ImageIcon,
    isOptional: true,
  },
  {
    id: 'pricing',
    title: 'Pricing',
    description: 'Price, cost, and currency',
    icon: DollarSign,
  },
  {
    id: 'details',
    title: 'Details',
    description: 'Tags, dimensions, and inventory',
    icon: Settings,
    isOptional: true,
  },
];

interface ProductCreationWizardProps {
  onSuccess?: (product: Product) => void;
  onCancel?: () => void;
}

const createEmptyProduct = (): Partial<Product> => ({
  name: '',
  brand: '',
  description: '',
  shortDescription: '',
  price: 0,
  currency: 'USD',
  status: 'draft',
  category: 'sofa',
  tags: [],
  styleTags: [],
  images: [],
  variants: [],
  availability: 'in_stock',
});

export function ProductCreationWizard({ onSuccess, onCancel }: ProductCreationWizardProps) {
  const router = useRouter();
  const { user, isLoading: authLoading, status } = useAuth();
  const [currentStep, setCurrentStep] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [permissionChecked, setPermissionChecked] = useState(false);
  const [productData, setProductData] = useState<Partial<Product>>(createEmptyProduct());
  const [visitedSteps, setVisitedSteps] = useState<Set<number>>(new Set([0]));

  const sessionRoles = user?.roles ?? [];
  const userRole = (sessionRoles[0] as UserRole | undefined) ?? (user as any)?.role;
  const isDesigner = sessionRoles.includes('designer') || (user as any)?.role === 'designer';

  // Check permissions
  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      router.push('/auth/login');
      return;
    }

    if (!canCreateProducts(userRole)) {
      toast({
        title: 'Access Denied',
        description: 'You do not have permission to create products.',
        variant: 'destructive',
      });
      router.push('/catalog');
      return;
    }

    setPermissionChecked(true);
  }, [user, authLoading, router, userRole]);

  // Step validation
  const stepValidation = useMemo(() => {
    return {
      essentials: Boolean(
        productData.name?.trim() &&
        productData.brand?.trim() &&
        productData.category
      ),
      media: true, // Optional step
      pricing: productData.price !== undefined && productData.price >= 0,
      details: true, // Optional step
    };
  }, [productData]);

  const currentStepData = WIZARD_STEPS[currentStep];
  const isCurrentStepValid = stepValidation[currentStepData.id as keyof typeof stepValidation];
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === WIZARD_STEPS.length - 1;

  // Calculate overall completeness
  const completeness = useMemo(() => {
    let score = 0;
    let total = 0;

    // Essentials (required) - 40%
    total += 40;
    if (productData.name?.trim()) score += 10;
    if (productData.brand?.trim()) score += 10;
    if (productData.shortDescription?.trim()) score += 10;
    if (productData.category) score += 10;

    // Media (optional) - 20%
    total += 20;
    if (productData.images && productData.images.length > 0) score += 20;

    // Pricing (required) - 20%
    total += 20;
    if (productData.price && productData.price > 0) score += 20;

    // Details (optional) - 20%
    total += 20;
    if (productData.tags && productData.tags.length > 0) score += 10;
    if (productData.styleTags && productData.styleTags.length > 0) score += 10;

    return Math.round((score / total) * 100);
  }, [productData]);

  const handleProductChange = (updates: Partial<Product>) => {
    setProductData((prev) => ({ ...prev, ...updates }));
  };

  const handleNext = () => {
    if (currentStep < WIZARD_STEPS.length - 1) {
      const nextStep = currentStep + 1;
      setCurrentStep(nextStep);
      setVisitedSteps((prev) => new Set([...prev, nextStep]));
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleStepClick = (stepIndex: number) => {
    // Allow navigating to visited steps or the next step if current is valid
    if (visitedSteps.has(stepIndex) || (stepIndex === currentStep + 1 && isCurrentStepValid)) {
      setCurrentStep(stepIndex);
      setVisitedSteps((prev) => new Set([...prev, stepIndex]));
    }
  };

  const handleSave = async (asDraft = false) => {
    // Validate required fields
    if (!productData.name || !productData.brand) {
      toast({
        title: 'Validation Error',
        description: 'Product name and brand are required.',
        variant: 'destructive',
      });
      setCurrentStep(0); // Go back to essentials
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        ...productData,
        status: asDraft ? 'draft' : (productData.status || 'draft'),
      };
      const response = await catalogApi.createProduct(payload as Product);
      toast({
        title: 'Product created',
        description: 'The product has been successfully added to your catalog.',
      });
      if (onSuccess) {
        onSuccess(response.data);
      } else {
        router.push('/catalog');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create the product. Please try again.',
        variant: 'destructive',
      });
      console.error('Failed to create product:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    } else {
      router.push('/catalog');
    }
  };

  // Show loading while checking permissions
  if (!permissionChecked) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="text-muted-foreground">Checking permissions...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push('/catalog')}
              className="h-auto p-0 hover:bg-transparent"
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Catalog
            </Button>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Create New Product</h1>
          <p className="text-muted-foreground">
            Step {currentStep + 1} of {WIZARD_STEPS.length}: {currentStepData.title}
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-sm font-medium">{completeness}% complete</div>
            <div className="h-2 w-32 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${completeness}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Designer Notice */}
      {isDesigner && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            As a designer, you can create and edit products, but only administrators can publish or delete them.
          </AlertDescription>
        </Alert>
      )}

      {/* Step Indicator */}
      <nav aria-label="Progress" className="mb-8">
        <ol className="flex items-center justify-between">
          {WIZARD_STEPS.map((step, index) => {
            const StepIcon = step.icon;
            const isCompleted = visitedSteps.has(index) && index < currentStep;
            const isCurrent = index === currentStep;
            const isClickable = visitedSteps.has(index) || (index === currentStep + 1 && isCurrentStepValid);

            return (
              <li key={step.id} className="relative flex-1">
                {index > 0 && (
                  <div
                    className={cn(
                      'absolute left-0 top-5 -translate-y-1/2 h-0.5 w-full -ml-8',
                      isCompleted || isCurrent ? 'bg-primary' : 'bg-muted'
                    )}
                  />
                )}
                <button
                  type="button"
                  onClick={() => handleStepClick(index)}
                  disabled={!isClickable}
                  className={cn(
                    'relative flex flex-col items-center gap-2 group',
                    isClickable ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'
                  )}
                >
                  <span
                    className={cn(
                      'flex h-10 w-10 items-center justify-center rounded-full border-2 transition-colors',
                      isCompleted && 'border-primary bg-primary text-primary-foreground',
                      isCurrent && 'border-primary bg-background text-primary',
                      !isCompleted && !isCurrent && 'border-muted bg-background text-muted-foreground'
                    )}
                  >
                    {isCompleted ? (
                      <Check className="h-5 w-5" />
                    ) : (
                      <StepIcon className="h-5 w-5" />
                    )}
                  </span>
                  <span
                    className={cn(
                      'text-sm font-medium',
                      isCurrent ? 'text-primary' : 'text-muted-foreground'
                    )}
                  >
                    {step.title}
                  </span>
                  {step.isOptional && (
                    <span className="text-xs text-muted-foreground">Optional</span>
                  )}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {/* Step Content */}
      <Card>
        <CardHeader>
          <CardTitle>{currentStepData.title}</CardTitle>
          <CardDescription>{currentStepData.description}</CardDescription>
        </CardHeader>
        <CardContent>
          {currentStepData.id === 'essentials' && (
            <DetailsTab
              product={productData as Product}
              onChange={handleProductChange}
            />
          )}
          {currentStepData.id === 'media' && (
            <MediaTab
              product={productData as Product}
              onChange={handleProductChange}
            />
          )}
          {currentStepData.id === 'pricing' && (
            <PricingTab
              product={productData as Product}
              onChange={handleProductChange}
            />
          )}
          {currentStepData.id === 'details' && (
            <div className="space-y-8">
              <InventoryTab
                product={productData as Product}
                onChange={handleProductChange}
              />
              <div className="border-t pt-8">
                <h3 className="text-lg font-semibold mb-4">SEO & Metadata</h3>
                <SEOTab
                  product={productData as Product}
                  onChange={handleProductChange}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex items-center justify-between border-t border-border pt-6">
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleCancel} disabled={isSaving}>
            Cancel
          </Button>
          {!isFirstStep && (
            <Button variant="outline" onClick={handleBack} disabled={isSaving}>
              <ChevronLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          )}
        </div>

        <div className="flex gap-2">
          {!isLastStep && (
            <>
              <Button
                variant="outline"
                onClick={() => handleSave(true)}
                disabled={isSaving || !stepValidation.essentials}
              >
                Save as Draft
              </Button>
              <Button
                onClick={handleNext}
                disabled={!isCurrentStepValid && !currentStepData.isOptional}
              >
                {currentStepData.isOptional && !isCurrentStepValid ? 'Skip' : 'Continue'}
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </>
          )}
          {isLastStep && (
            <>
              <Button
                variant="outline"
                onClick={() => handleSave(true)}
                disabled={isSaving || !stepValidation.essentials}
              >
                Save as Draft
              </Button>
              <Button
                onClick={() => handleSave(false)}
                disabled={isSaving || !stepValidation.essentials || !stepValidation.pricing}
              >
                <Save className="mr-2 h-4 w-4" />
                {isSaving ? 'Creating...' : 'Create Product'}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
