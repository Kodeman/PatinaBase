'use client';

import * as React from 'react';
import { Search, Globe, Hash, ExternalLink, CheckCircle, AlertCircle } from 'lucide-react';
import { Input, Label, Textarea, Badge } from '@patina/design-system';
import { cn } from '@/lib/utils';
import type { Product } from '@patina/types';

interface SEOTabProps {
  product?: Product;
  onChange: (updates: Partial<Product>) => void;
}

export function SEOTab({ product, onChange }: SEOTabProps) {
  const [keywords, setKeywords] = React.useState<string[]>(
    product?.seoKeywords || []
  );
  const [keywordInput, setKeywordInput] = React.useState('');

  // Generate slug from product name
  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  };

  const handleInputChange = (field: keyof Product) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    onChange({ [field]: e.target.value });
  };

  const handleGenerateSlug = () => {
    if (product?.name) {
      const slug = generateSlug(product.name);
      onChange({ slug });
    }
  };

  const handleAddKeyword = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && keywordInput.trim()) {
      e.preventDefault();
      const newKeywords = [...keywords, keywordInput.trim()];
      setKeywords(newKeywords);
      onChange({ seoKeywords: newKeywords });
      setKeywordInput('');
    }
  };

  const handleRemoveKeyword = (index: number) => {
    const newKeywords = keywords.filter((_, i) => i !== index);
    setKeywords(newKeywords);
    onChange({ seoKeywords: newKeywords });
  };

  // Character counts
  const seoTitleLength = product?.seoTitle?.length || 0;
  const seoDescriptionLength = product?.seoDescription?.length || 0;

  // SEO Score calculation
  const calculateSEOScore = () => {
    let score = 0;
    let maxScore = 5;

    if (product?.seoTitle && seoTitleLength >= 30 && seoTitleLength <= 60) score++;
    if (product?.seoDescription && seoDescriptionLength >= 120 && seoDescriptionLength <= 160) score++;
    if (product?.slug) score++;
    if (keywords.length >= 3) score++;
    if (product?.name && product.seoTitle?.includes(product.name.split(' ')[0])) score++;

    return { score, maxScore };
  };

  const seoScore = calculateSEOScore();
  const seoPercentage = Math.round((seoScore.score / seoScore.maxScore) * 100);

  // Get SEO score color
  const getSEOScoreColor = () => {
    if (seoPercentage >= 80) return 'text-green-600';
    if (seoPercentage >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold mb-1">Search Engine Optimization</h3>
        <p className="text-sm text-muted-foreground">
          Optimize your product for search engines and improve discoverability.
        </p>
      </div>

      {/* SEO Score */}
      <div className="bg-gradient-to-br from-primary/5 to-primary/10 rounded-lg p-6 border border-primary/20">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="text-base font-semibold mb-1">SEO Score</h4>
            <p className="text-sm text-muted-foreground">
              Overall optimization rating
            </p>
          </div>
          <div className={cn('text-4xl font-bold', getSEOScoreColor())}>
            {seoPercentage}%
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Completed</span>
            <span className="font-medium">
              {seoScore.score} of {seoScore.maxScore} optimizations
            </span>
          </div>
          <div className="w-full bg-muted rounded-full h-2">
            <div
              className={cn(
                'h-2 rounded-full transition-all duration-300',
                seoPercentage >= 80
                  ? 'bg-green-600'
                  : seoPercentage >= 60
                  ? 'bg-yellow-600'
                  : 'bg-red-600'
              )}
              style={{ width: `${seoPercentage}%` }}
            />
          </div>
        </div>
      </div>

      {/* URL Slug */}
      <div className="space-y-4">
        <div>
          <h4 className="text-base font-semibold mb-3">URL Configuration</h4>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="product-slug">URL Slug*</Label>
            <button
              type="button"
              onClick={handleGenerateSlug}
              className="text-xs text-primary hover:underline"
            >
              Generate from name
            </button>
          </div>
          <div className="relative">
            <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              id="product-slug"
              placeholder="modern-velvet-sofa"
              value={product?.slug || ''}
              onChange={handleInputChange('slug')}
              className="pl-10"
              required
            />
          </div>
          <p className="text-xs text-muted-foreground">
            URL-friendly version of the product name (lowercase, hyphens only)
          </p>
          {product?.slug && (
            <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg text-sm">
              <Globe className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">Preview:</span>
              <code className="text-xs bg-background px-2 py-1 rounded">
                /products/{product.slug}
              </code>
              <ExternalLink className="w-3 h-3 text-muted-foreground ml-auto" />
            </div>
          )}
        </div>
      </div>

      {/* Meta Information */}
      <div className="space-y-4 pt-4 border-t border-border">
        <div>
          <h4 className="text-base font-semibold mb-3">Meta Information</h4>
          <p className="text-sm text-muted-foreground">
            Control how your product appears in search results
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="seo-title">SEO Title</Label>
          <Input
            id="seo-title"
            placeholder="e.g., Modern Velvet Sofa - Luxury Furniture | Brand Name"
            value={product?.seoTitle || ''}
            onChange={handleInputChange('seoTitle')}
            maxLength={60}
          />
          <div className="flex items-center justify-between text-xs">
            <p className="text-muted-foreground">
              Recommended: 30-60 characters
            </p>
            <p
              className={cn(
                'font-medium',
                seoTitleLength >= 30 && seoTitleLength <= 60
                  ? 'text-green-600'
                  : seoTitleLength > 60
                  ? 'text-red-600'
                  : 'text-muted-foreground'
              )}
            >
              {seoTitleLength}/60
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="seo-description">Meta Description</Label>
          <Textarea
            id="seo-description"
            placeholder="Write a compelling description that will appear in search results. Include key features and benefits."
            value={product?.seoDescription || ''}
            onChange={handleInputChange('seoDescription')}
            rows={4}
            maxLength={160}
          />
          <div className="flex items-center justify-between text-xs">
            <p className="text-muted-foreground">
              Recommended: 120-160 characters
            </p>
            <p
              className={cn(
                'font-medium',
                seoDescriptionLength >= 120 && seoDescriptionLength <= 160
                  ? 'text-green-600'
                  : seoDescriptionLength > 160
                  ? 'text-red-600'
                  : 'text-muted-foreground'
              )}
            >
              {seoDescriptionLength}/160
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="seo-keywords">Focus Keywords</Label>
          <Input
            id="seo-keywords"
            placeholder="Type a keyword and press Enter"
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            onKeyDown={handleAddKeyword}
          />
          <p className="text-xs text-muted-foreground">
            Add 3-5 keywords that best describe this product
          </p>
          {keywords.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2">
              {keywords.map((keyword, index) => (
                <Badge
                  key={index}
                  variant="secondary"
                  className="cursor-pointer"
                  onClick={() => handleRemoveKeyword(index)}
                >
                  {keyword}
                  <span className="ml-1 text-xs">×</span>
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Search Preview */}
      <div className="space-y-4 pt-4 border-t border-border">
        <div>
          <h4 className="text-base font-semibold mb-1">Search Result Preview</h4>
          <p className="text-sm text-muted-foreground">
            How your product will appear in search engines
          </p>
        </div>

        <div className="border border-border rounded-lg p-4 bg-muted/30">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Globe className="w-3 h-3" />
              <span>yoursite.com › products › {product?.slug || 'product-url'}</span>
            </div>
            <h5 className="text-lg text-primary hover:underline cursor-pointer">
              {product?.seoTitle || product?.name || 'Product Title'}
            </h5>
            <p className="text-sm text-muted-foreground line-clamp-2">
              {product?.seoDescription ||
                product?.shortDescription ||
                'Add a meta description to improve click-through rates from search results.'}
            </p>
          </div>
        </div>
      </div>

      {/* Social Media Preview */}
      <div className="space-y-4 pt-4 border-t border-border">
        <div>
          <h4 className="text-base font-semibold mb-1">Social Media Preview</h4>
          <p className="text-sm text-muted-foreground">
            How your product will appear when shared on social media
          </p>
        </div>

        <div className="border border-border rounded-lg overflow-hidden bg-muted/30">
          {/* Mock Social Card */}
          <div className="aspect-[1.91/1] bg-muted relative">
            {product?.images?.[0]?.url ? (
              <img
                src={product.images[0].url}
                alt={product.name || 'Product'}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Search className="w-12 h-12 text-muted-foreground" />
              </div>
            )}
          </div>
          <div className="p-3 bg-background">
            <p className="text-xs text-muted-foreground uppercase mb-1">
              yoursite.com
            </p>
            <p className="font-semibold text-sm mb-1 line-clamp-1">
              {product?.seoTitle || product?.name || 'Product Title'}
            </p>
            <p className="text-xs text-muted-foreground line-clamp-2">
              {product?.seoDescription || product?.shortDescription || ''}
            </p>
          </div>
        </div>
      </div>

      {/* SEO Checklist */}
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 space-y-3">
        <h4 className="text-sm font-semibold">SEO Checklist</h4>
        <div className="space-y-2">
          <div className="flex items-start gap-2 text-sm">
            {product?.seoTitle ? (
              <CheckCircle className="w-4 h-4 text-green-600 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 text-muted-foreground mt-0.5" />
            )}
            <span className={product?.seoTitle ? '' : 'text-muted-foreground'}>
              SEO title is set (30-60 characters)
            </span>
          </div>
          <div className="flex items-start gap-2 text-sm">
            {product?.seoDescription ? (
              <CheckCircle className="w-4 h-4 text-green-600 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 text-muted-foreground mt-0.5" />
            )}
            <span className={product?.seoDescription ? '' : 'text-muted-foreground'}>
              Meta description is set (120-160 characters)
            </span>
          </div>
          <div className="flex items-start gap-2 text-sm">
            {product?.slug ? (
              <CheckCircle className="w-4 h-4 text-green-600 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 text-muted-foreground mt-0.5" />
            )}
            <span className={product?.slug ? '' : 'text-muted-foreground'}>
              URL slug is configured
            </span>
          </div>
          <div className="flex items-start gap-2 text-sm">
            {keywords.length >= 3 ? (
              <CheckCircle className="w-4 h-4 text-green-600 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 text-muted-foreground mt-0.5" />
            )}
            <span className={keywords.length >= 3 ? '' : 'text-muted-foreground'}>
              At least 3 focus keywords added
            </span>
          </div>
          <div className="flex items-start gap-2 text-sm">
            {product?.images && product.images.length > 0 ? (
              <CheckCircle className="w-4 h-4 text-green-600 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 text-muted-foreground mt-0.5" />
            )}
            <span className={product?.images?.length ? '' : 'text-muted-foreground'}>
              Product has images for social sharing
            </span>
          </div>
        </div>
      </div>

      {/* SEO Tips */}
      <div className="bg-muted/50 rounded-lg p-4 space-y-2">
        <h4 className="text-sm font-semibold">SEO Best Practices</h4>
        <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
          <li>Include your main keyword in the SEO title</li>
          <li>Write unique descriptions for each product</li>
          <li>Use descriptive, keyword-rich URLs</li>
          <li>Add high-quality images with descriptive alt text</li>
          <li>Focus on long-tail keywords for better targeting</li>
          <li>Update content regularly to maintain relevance</li>
        </ul>
      </div>
    </div>
  );
}
