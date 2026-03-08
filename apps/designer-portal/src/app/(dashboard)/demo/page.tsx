'use client';

import Link from 'next/link';
import {
  Home,
  ShoppingBag,
  GraduationCap,
  Palette,
  Settings,
  User,
  Grid3x3,
  Users,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface DemoPage {
  title: string;
  description: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  category: 'concepts' | 'workflows' | 'account';
}

const demoPages: DemoPage[] = [
  {
    title: 'Dashboard',
    description: 'Studio dashboard with pipeline focus, teaching insights, and activity feed',
    href: '/demo/dashboard',
    icon: Home,
    category: 'concepts',
  },
  {
    title: 'Orders',
    description: 'Order management with tracking, payment status, and fulfillment workflows',
    href: '/demo/orders',
    icon: ShoppingBag,
    category: 'concepts',
  },
  {
    title: 'Teaching Console',
    description: 'Recommendation intelligence, feedback queue, and ML rule management',
    href: '/demo/teaching',
    icon: GraduationCap,
    category: 'concepts',
  },
  {
    title: 'Style Profiles',
    description: 'Client style preferences with quiz workflow and moodboard generation',
    href: '/demo/style-profile',
    icon: Palette,
    category: 'concepts',
  },
  {
    title: 'Catalog Sandbox',
    description: 'Advanced catalog management with dual-mode views and lifecycle tracking',
    href: '/demo/catalog-sandbox',
    icon: Grid3x3,
    category: 'workflows',
  },
  {
    title: 'Client Lifecycle',
    description: 'Client relationship pipeline from discovery to post-install care',
    href: '/demo/clients-lifecycle',
    icon: Users,
    category: 'workflows',
  },
  {
    title: 'Settings',
    description: 'Account, notification, and business preferences configuration',
    href: '/demo/settings',
    icon: Settings,
    category: 'account',
  },
  {
    title: 'Profile',
    description: 'User profile display with roles and permissions overview',
    href: '/demo/profile',
    icon: User,
    category: 'account',
  },
];

const categories = [
  { id: 'concepts', title: 'Concept Explorations', description: 'Feature prototypes using mock data' },
  { id: 'workflows', title: 'Workflow Sandboxes', description: 'Interactive workflow demonstrations' },
  { id: 'account', title: 'Account Screens', description: 'Settings and profile UI mockups' },
] as const;

export default function DemoHubPage() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="rounded-xl bg-primary/10 p-3">
          <Sparkles className="h-8 w-8 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Demo Workspace</h1>
          <p className="mt-1 text-lg text-muted-foreground">
            Explore prototype features and workflows using sample data
          </p>
        </div>
      </div>

      {/* Info Banner */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/20">
        <p className="text-sm text-amber-800 dark:text-amber-200">
          <strong>Note:</strong> These pages use mock data for demonstration purposes.
          For production features, visit{' '}
          <Link href="/catalog" className="font-medium underline underline-offset-2">
            Catalog
          </Link>
          ,{' '}
          <Link href="/projects" className="font-medium underline underline-offset-2">
            Projects
          </Link>
          ,{' '}
          <Link href="/clients" className="font-medium underline underline-offset-2">
            Clients
          </Link>
          , or{' '}
          <Link href="/messages" className="font-medium underline underline-offset-2">
            Messages
          </Link>
          .
        </p>
      </div>

      {/* Categories */}
      {categories.map((category) => {
        const categoryPages = demoPages.filter((page) => page.category === category.id);
        if (categoryPages.length === 0) return null;

        return (
          <div key={category.id} className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold">{category.title}</h2>
              <p className="text-sm text-muted-foreground">{category.description}</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {categoryPages.map((page) => {
                const Icon = page.icon;
                return (
                  <Link
                    key={page.href}
                    href={page.href}
                    className={cn(
                      'group flex flex-col rounded-lg border bg-card p-5 transition-all',
                      'hover:border-primary/50 hover:shadow-md'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg bg-muted p-2 transition-colors group-hover:bg-primary/10">
                        <Icon className="h-5 w-5 text-muted-foreground transition-colors group-hover:text-primary" />
                      </div>
                      <h3 className="font-semibold">{page.title}</h3>
                    </div>
                    <p className="mt-3 text-sm text-muted-foreground">
                      {page.description}
                    </p>
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
