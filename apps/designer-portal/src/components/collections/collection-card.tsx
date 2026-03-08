'use client';

import { Card, CardContent } from '@patina/design-system';
import { Badge } from '@patina/design-system';
import { Button } from '@patina/design-system';
import { Eye, Star, Package, Calendar, Edit, Trash } from 'lucide-react';
import type { Collection } from '@patina/types';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';

interface CollectionCardProps {
  collection: Collection;
  onClick?: () => void;
  onEdit?: (collection: Collection) => void;
  onDelete?: (collection: Collection) => void;
  canEdit?: boolean;
  canDelete?: boolean;
}

export function CollectionCard({
  collection,
  onClick,
  onEdit,
  onDelete,
  canEdit = false,
  canDelete = false,
}: CollectionCardProps) {
  const typeColors = {
    manual: 'blue' as const,
    rule: 'purple' as const,
    smart: 'green' as const,
  };

  const typeLabels = {
    manual: 'Curated',
    rule: 'Dynamic',
    smart: 'AI-Powered',
  };

  const statusColors = {
    draft: 'neutral' as const,
    published: 'green' as const,
    scheduled: 'blue' as const,
    archived: 'neutral' as const,
  };

  const handleClick = (e: React.MouseEvent) => {
    if (onClick) {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <Link href={`/catalog/collections/${collection.id}`} className="block">
      <Card
        className="group overflow-hidden hover:border-primary transition-all cursor-pointer h-full"
        onClick={handleClick}
      >
        <CardContent className="p-0">
          {/* Hero Image */}
          <div className="relative aspect-[16/9] overflow-hidden bg-gradient-to-br from-primary/10 to-primary/5">
            {collection.heroImage ? (
              <img
                src={collection.heroImage}
                alt={collection.name}
                className="h-full w-full object-cover transition-transform group-hover:scale-105"
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <Package className="h-16 w-16 text-muted-foreground/30" />
              </div>
            )}

            {/* Badges Overlay */}
            <div className="absolute top-3 left-3 flex gap-2">
              <Badge variant="solid" color={typeColors[collection.type]}>
                {typeLabels[collection.type]}
              </Badge>
              {collection.featured && (
                <Badge variant="solid" color="yellow" className="flex items-center gap-1">
                  <Star className="h-3 w-3 fill-current" />
                  Featured
                </Badge>
              )}
            </div>

            {/* Status Badge */}
            <div className="absolute top-3 right-3">
              <Badge variant="subtle" color={statusColors[collection.status]}>
                {collection.status === 'published' ? 'Live' : collection.status}
              </Badge>
            </div>

            {/* Product Count */}
            <div className="absolute bottom-3 right-3 bg-black/70 backdrop-blur-sm rounded-full px-3 py-1.5 text-white text-sm font-medium">
              {collection.productCount || 0} items
            </div>
          </div>

          {/* Content */}
          <div className="p-4 space-y-3">
            <div>
              <h3 className="font-semibold text-lg group-hover:text-primary transition-colors line-clamp-1">
                {collection.name}
              </h3>
              {collection.description && (
                <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                  {collection.description}
                </p>
              )}
            </div>

            {/* Tags */}
            {collection.tags && collection.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {collection.tags.slice(0, 3).map((tag) => (
                  <Badge key={tag} variant="subtle" color="neutral" className="text-xs">
                    {tag}
                  </Badge>
                ))}
                {collection.tags.length > 3 && (
                  <Badge variant="subtle" color="neutral" className="text-xs">
                    +{collection.tags.length - 3}
                  </Badge>
                )}
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between pt-3 border-t">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Calendar className="h-3.5 w-3.5" />
                <span>
                  {collection.publishedAt
                    ? `Published ${formatDistanceToNow(new Date(collection.publishedAt))} ago`
                    : collection.scheduledPublishAt
                    ? `Scheduled for ${new Date(collection.scheduledPublishAt).toLocaleDateString()}`
                    : 'Draft'}
                </span>
              </div>

              <div className="flex items-center gap-1">
                {canEdit && onEdit && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onEdit(collection);
                    }}
                    title="Edit collection"
                  >
                    <Edit className="h-3.5 w-3.5" />
                  </Button>
                )}
                {canDelete && onDelete && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onDelete(collection);
                    }}
                    title="Delete collection"
                  >
                    <Trash className="h-3.5 w-3.5" />
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (onClick) onClick();
                  }}
                >
                  <Eye className="mr-1.5 h-3.5 w-3.5" />
                  View
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
