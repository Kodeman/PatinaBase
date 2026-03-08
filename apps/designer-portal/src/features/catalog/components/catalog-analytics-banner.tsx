'use client';

import Link from 'next/link';
import { Layers, ArrowRight } from 'lucide-react';
import { Badge, Button, Card, CardContent } from '@patina/design-system';
import type { Collection } from '@patina/types';

interface CatalogAnalyticsBannerProps {
  collections: Collection[];
}

export function CatalogAnalyticsBanner({ collections }: CatalogAnalyticsBannerProps) {
  if (!collections || collections.length === 0) {
    return null;
  }

  return (
    <Card className="overflow-hidden bg-gradient-to-br from-primary/10 via-primary/5 to-background border-primary/20">
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-primary" />
              <h2 className="text-xl font-semibold">Browse Curated Collections</h2>
            </div>
            <p className="text-sm text-muted-foreground max-w-2xl">
              Explore expertly curated product collections organized by style, room, or theme
            </p>
            <div className="flex flex-wrap gap-2 pt-2">
              {collections.slice(0, 3).map((collection) => (
                <Link key={collection.id} href={`/catalog/collections/${collection.id}`}>
                  <Badge variant="subtle" color="neutral" className="hover:bg-primary/10 cursor-pointer transition-colors">
                    {collection.name}
                  </Badge>
                </Link>
              ))}
            </div>
          </div>
          <Link href="/catalog/collections">
            <Button>
              View All Collections
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
