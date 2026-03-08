'use client';

import { useState, useEffect } from 'react';
import { Button } from '@patina/design-system';
import { Badge } from '@patina/design-system';
import { ChevronLeft, ChevronRight, ArrowRight, Star } from 'lucide-react';
import type { Collection } from '@patina/types';
import Link from 'next/link';

interface CollectionHeroProps {
  collections: Collection[];
}

export function CollectionHero({ collections }: CollectionHeroProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const currentCollection = collections[currentIndex];

  // Auto-rotate every 5 seconds
  useEffect(() => {
    if (isPaused || collections.length <= 1) return;

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % collections.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [isPaused, collections.length]);

  const goToPrevious = () => {
    setCurrentIndex((prev) => (prev - 1 + collections.length) % collections.length);
  };

  const goToNext = () => {
    setCurrentIndex((prev) => (prev + 1) % collections.length);
  };

  if (!currentCollection || collections.length === 0) {
    return null;
  }

  return (
    <div
      className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary/20 via-primary/10 to-background"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className="grid lg:grid-cols-2 gap-8 p-8 lg:p-12">
        {/* Left Content */}
        <div className="flex flex-col justify-center space-y-6">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant="solid" color="yellow" className="flex items-center gap-1">
                <Star className="h-3 w-3 fill-current" />
                Featured Collection
              </Badge>
              <Badge variant="subtle" color="neutral">
                {currentCollection.productCount || 0} items
              </Badge>
            </div>

            <h2 className="text-4xl lg:text-5xl font-bold tracking-tight">
              {currentCollection.name}
            </h2>

            {currentCollection.description && (
              <p className="text-lg text-muted-foreground max-w-xl">
                {currentCollection.description}
              </p>
            )}
          </div>

          {/* Tags */}
          {currentCollection.tags && currentCollection.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {currentCollection.tags.slice(0, 5).map((tag) => (
                <Badge key={tag} variant="subtle" color="neutral">
                  {tag}
                </Badge>
              ))}
            </div>
          )}

          {/* CTA */}
          <div className="flex items-center gap-3">
            <Link href={`/catalog/collections/${currentCollection.id}`}>
              <Button size="lg">
                Explore Collection
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link href="/catalog/collections">
              <Button size="lg" variant="outline">
                Browse All Collections
              </Button>
            </Link>
          </div>

          {/* Navigation Dots */}
          {collections.length > 1 && (
            <div className="flex items-center gap-2">
              {collections.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentIndex(index)}
                  className={`h-2 rounded-full transition-all ${
                    index === currentIndex
                      ? 'w-8 bg-primary'
                      : 'w-2 bg-primary/30 hover:bg-primary/50'
                  }`}
                  aria-label={`Go to collection ${index + 1}`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Right Image */}
        <div className="relative aspect-[4/3] lg:aspect-auto">
          <div className="absolute inset-0 rounded-lg overflow-hidden bg-gradient-to-br from-primary/5 to-primary/10">
            {currentCollection.heroImage ? (
              <img
                src={currentCollection.heroImage}
                alt={currentCollection.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <div className="text-6xl text-muted-foreground/20">
                  {currentCollection.name.charAt(0)}
                </div>
              </div>
            )}
          </div>

          {/* Navigation Arrows */}
          {collections.length > 1 && (
            <>
              <button
                onClick={goToPrevious}
                className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white text-foreground rounded-full p-2 shadow-lg transition-all hover:scale-110"
                aria-label="Previous collection"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                onClick={goToNext}
                className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white text-foreground rounded-full p-2 shadow-lg transition-all hover:scale-110"
                aria-label="Next collection"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
