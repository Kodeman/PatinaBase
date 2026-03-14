'use client';

import { useState, useMemo } from 'react';
import { ChevronRight, FolderTree } from 'lucide-react';
import {
  Button,
  Label,
  ScrollArea
} from '@patina/design-system';
import { cn } from '@/lib/utils';
import type { Category } from '@patina/types';

interface CategoryTreeSelectorProps {
  categories?: Category[];
  value?: string | null;
  onChange: (categoryId: string | null) => void;
  excludeIds?: string[];
  allowNull?: boolean;
  label?: string;
  className?: string;
}

export function CategoryTreeSelector({
  categories = [],
  value,
  onChange,
  excludeIds = [],
  allowNull = true,
  label = 'Parent Category',
  className,
}: CategoryTreeSelectorProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Build tree structure
  const categoryTree = useMemo(() => {
    const tree: Category[] = [];
    const map = new Map<string, Category & { children: Category[] }>();

    // Create map with children arrays
    categories.forEach((cat) => {
      map.set(cat.id, { ...cat, children: [] });
    });

    // Build tree
    categories.forEach((cat) => {
      const node = map.get(cat.id);
      if (!node) return;

      if (cat.parentId && map.has(cat.parentId)) {
        map.get(cat.parentId)?.children.push(node);
      } else {
        tree.push(node);
      }
    });

    return tree;
  }, [categories]);

  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expandedIds);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedIds(newExpanded);
  };

  const isDisabled = (id: string): boolean => {
    if (excludeIds.includes(id)) return true;

    // Check if any excluded ID is a child of this category
    const isChildExcluded = (cat: Category): boolean => {
      if (excludeIds.includes(cat.id)) return true;
      const children = categories.filter((c) => c.parentId === cat.id);
      return children.some(isChildExcluded);
    };

    const category = categories.find((c) => c.id === id);
    return category ? isChildExcluded(category) : false;
  };

  const renderCategory = (category: Category & { children?: Category[] }, level = 0) => {
    const hasChildren = category.children && category.children.length > 0;
    const isExpanded = expandedIds.has(category.id);
    const isSelected = value === category.id;
    const disabled = isDisabled(category.id);

    return (
      <div key={category.id}>
        <div
          className={cn(
            'flex items-center gap-2 py-2 px-3 rounded-md cursor-pointer hover:bg-accent transition-colors',
            isSelected && 'bg-primary/10 text-primary font-medium',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
          style={{ paddingLeft: `${level * 20 + 12}px` }}
          onClick={() => !disabled && onChange(category.id)}
        >
          {hasChildren ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleExpand(category.id);
              }}
              className="flex-shrink-0 hover:bg-muted rounded p-0.5"
            >
              <ChevronRight
                className={cn(
                  'h-4 w-4 transition-transform',
                  isExpanded && 'rotate-90'
                )}
              />
            </button>
          ) : (
            <div className="w-5" />
          )}
          <FolderTree className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
          <span className="flex-1 truncate">{category.name}</span>
        </div>
        {hasChildren && isExpanded && (
          <div>
            {category.children?.map((child) => renderCategory(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={cn('space-y-2', className)}>
      {label && <Label>{label}</Label>}
      <div className="border rounded-lg">
        <ScrollArea className="h-[300px] p-2">
          {allowNull && (
            <div
              className={cn(
                'flex items-center gap-2 py-2 px-3 rounded-md cursor-pointer hover:bg-accent transition-colors mb-1',
                value === null && 'bg-primary/10 text-primary font-medium'
              )}
              onClick={() => onChange(null)}
            >
              <div className="w-5" />
              <FolderTree className="h-4 w-4 text-muted-foreground" />
              <span>No Parent (Root Category)</span>
            </div>
          )}
          {categoryTree.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
              <FolderTree className="h-8 w-8 mb-2" />
              <p className="text-sm">No categories available</p>
            </div>
          ) : (
            categoryTree.map((cat) => renderCategory(cat))
          )}
        </ScrollArea>
      </div>
      {value && (
        <p className="text-xs text-muted-foreground">
          Selected: {categories.find((c) => c.id === value)?.name}
        </p>
      )}
    </div>
  );
}
