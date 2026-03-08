'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as Collapsible from '@radix-ui/react-collapsible';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@patina/design-system';
import { Badge } from '@patina/design-system';
import { ScrollArea } from '@patina/design-system';

export interface NavItem {
  title: string;
  href?: string;
  icon?: React.ComponentType<{ className?: string }>;
  badge?: number;
  children?: NavItem[];
}

export interface AnimatedSidebarProps {
  items: NavItem[];
  activeRoute?: string;
  className?: string;
}

interface NavItemComponentProps {
  item: NavItem;
  activeRoute: string;
  depth?: number;
}

function NavItemComponent({ item, activeRoute, depth = 0 }: NavItemComponentProps) {
  const pathname = usePathname();
  const currentPath = activeRoute || pathname;
  const [isOpen, setIsOpen] = React.useState(false);

  const isActive = item.href === currentPath;
  const hasChildren = item.children && item.children.length > 0;

  // Check if any child is active
  const isChildActive = React.useMemo(() => {
    if (!item.children) return false;
    const checkActive = (items: NavItem[]): boolean => {
      return items.some(child => {
        if (child.href === currentPath) return true;
        if (child.children) return checkActive(child.children);
        return false;
      });
    };
    return checkActive(item.children);
  }, [item.children, currentPath]);

  // Auto-expand if a child is active
  React.useEffect(() => {
    if (isChildActive) {
      setIsOpen(true);
    }
  }, [isChildActive]);

  const Icon = item.icon;
  const indentClass = depth > 0 ? `ml-${depth * 4}` : '';

  // If item has children, render as collapsible
  if (hasChildren) {
    return (
      <Collapsible.Root open={isOpen} onOpenChange={setIsOpen}>
        <Collapsible.Trigger asChild>
          <button
            className={cn(
              'w-full flex items-center justify-between px-3 py-2 text-sm font-medium rounded-md transition-all hover:bg-accent hover:text-accent-foreground',
              isChildActive && 'bg-accent/50',
              indentClass
            )}
          >
            <span className="flex items-center gap-2">
              {Icon && <Icon className="h-4 w-4" />}
              <span>{item.title}</span>
              {item.badge !== undefined && item.badge > 0 && (
                <Badge variant="default" className="ml-auto">
                  {item.badge}
                </Badge>
              )}
            </span>
            <ChevronRight
              className={cn(
                'h-4 w-4 transition-transform duration-200',
                isOpen && 'rotate-90'
              )}
            />
          </button>
        </Collapsible.Trigger>
        <Collapsible.Content className="overflow-hidden data-[state=closed]:animate-[collapsible-up_200ms_ease-out] data-[state=open]:animate-[collapsible-down_200ms_ease-out]">
          <div className="pl-4 space-y-1 mt-1">
            {item.children?.map((child, index) => (
              <NavItemComponent
                key={child.href || child.title || index}
                item={child}
                activeRoute={currentPath}
                depth={depth + 1}
              />
            ))}
          </div>
        </Collapsible.Content>
      </Collapsible.Root>
    );
  }

  // If item has href, render as link with button styling
  if (item.href) {
    return (
      <Link
        href={item.href as any}
        className={cn('block', indentClass)}
      >
        <Button
          variant={isActive ? 'secondary' : 'ghost'}
          className={cn(
            'w-full justify-start gap-2 transition-all',
            isActive && 'bg-secondary text-secondary-foreground'
          )}
          size="sm"
        >
          {Icon && <Icon className="h-4 w-4" />}
          <span className="flex-1 text-left">{item.title}</span>
          {item.badge !== undefined && item.badge > 0 && (
            <Badge variant="default">
              {item.badge}
            </Badge>
          )}
        </Button>
      </Link>
    );
  }

  // Render as plain button (no href)
  return (
    <button
      className={cn(
        'w-full flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-all hover:bg-accent hover:text-accent-foreground',
        indentClass
      )}
    >
      {Icon && <Icon className="h-4 w-4" />}
      <span className="flex-1 text-left">{item.title}</span>
      {item.badge !== undefined && item.badge > 0 && (
        <Badge variant="default">
          {item.badge}
        </Badge>
      )}
    </button>
  );
}

export function AnimatedSidebar({ items, activeRoute = '', className }: AnimatedSidebarProps) {
  return (
    <ScrollArea className={cn('h-full', className)}>
      <nav className="flex flex-col gap-1 p-4">
        {items.map((item, index) => (
          <NavItemComponent
            key={item.href || item.title || index}
            item={item}
            activeRoute={activeRoute}
          />
        ))}
      </nav>
    </ScrollArea>
  );
}
