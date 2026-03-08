'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Package, Upload, Sparkles, ArrowRight, Plus, FileUp, Wand2 } from 'lucide-react';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@patina/design-system';

interface CatalogOnboardingProps {
  canCreate?: boolean;
  onCreateProduct?: () => void;
}

export function CatalogOnboarding({ canCreate = true, onCreateProduct }: CatalogOnboardingProps) {
  const router = useRouter();

  const handleCreateClick = () => {
    if (onCreateProduct) {
      onCreateProduct();
    } else {
      router.push('/catalog/new');
    }
  };

  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/5 via-background to-background p-8 md:p-12">
        <div className="relative z-10 max-w-2xl">
          <div className="flex items-center gap-2 mb-4">
            <div className="rounded-xl bg-primary/10 p-3">
              <Package className="h-8 w-8 text-primary" />
            </div>
            <span className="text-xs font-semibold uppercase tracking-widest text-primary">
              Get Started
            </span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
            Build Your Product Catalog
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Your catalog is the foundation of your design practice. Add products to start
            creating proposals, sourcing for projects, and delighting your clients.
          </p>
          {canCreate && (
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" onClick={handleCreateClick}>
                <Plus className="mr-2 h-5 w-5" />
                Create Your First Product
              </Button>
              <Button variant="outline" size="lg" asChild>
                <Link href="/demo/catalog-sandbox">
                  <Sparkles className="mr-2 h-5 w-5" />
                  Explore Demo Catalog
                </Link>
              </Button>
            </div>
          )}
        </div>
        {/* Decorative background elements */}
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-10 right-20 h-48 w-48 rounded-full bg-primary/10 blur-2xl" />
      </div>

      {/* Quick Actions */}
      <div className="grid gap-6 md:grid-cols-3">
        <Card className="group transition-all hover:border-primary/50 hover:shadow-md">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-emerald-100 p-2 dark:bg-emerald-900/30">
                <Wand2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <CardTitle className="text-lg">Guided Creation</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <CardDescription>
              Step-by-step wizard to add products with all the details your clients need.
              Perfect for getting started.
            </CardDescription>
            {canCreate && (
              <Button variant="ghost" className="w-full justify-between" onClick={handleCreateClick}>
                Start wizard
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </CardContent>
        </Card>

        <Card className="group transition-all hover:border-primary/50 hover:shadow-md">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-100 p-2 dark:bg-blue-900/30">
                <FileUp className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <CardTitle className="text-lg">Bulk Import</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <CardDescription>
              Import products from a CSV or spreadsheet. Great for migrating from
              another system or adding many items at once.
            </CardDescription>
            <Button variant="ghost" className="w-full justify-between" disabled>
              Coming soon
              <ArrowRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>

        <Card className="group transition-all hover:border-primary/50 hover:shadow-md">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-purple-100 p-2 dark:bg-purple-900/30">
                <Upload className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <CardTitle className="text-lg">Vendor Integration</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <CardDescription>
              Connect to vendor catalogs to automatically sync products and pricing.
              Set up once, stay updated forever.
            </CardDescription>
            <Button variant="ghost" className="w-full justify-between" disabled>
              Coming soon
              <ArrowRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Tips Section */}
      <Card className="bg-muted/30">
        <CardHeader>
          <CardTitle className="text-lg">Tips for a great catalog</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-4 md:grid-cols-2">
            <li className="flex items-start gap-3 text-sm">
              <div className="mt-0.5 h-2 w-2 rounded-full bg-primary/70" />
              <span className="text-muted-foreground">
                <strong className="text-foreground">Add high-quality images</strong> — Products with
                multiple angles and lifestyle shots get 3x more engagement
              </span>
            </li>
            <li className="flex items-start gap-3 text-sm">
              <div className="mt-0.5 h-2 w-2 rounded-full bg-primary/70" />
              <span className="text-muted-foreground">
                <strong className="text-foreground">Include dimensions</strong> — Clients need to
                know if pieces will fit their spaces
              </span>
            </li>
            <li className="flex items-start gap-3 text-sm">
              <div className="mt-0.5 h-2 w-2 rounded-full bg-primary/70" />
              <span className="text-muted-foreground">
                <strong className="text-foreground">Set accurate pricing</strong> — Keep your
                margins healthy with up-to-date cost and retail prices
              </span>
            </li>
            <li className="flex items-start gap-3 text-sm">
              <div className="mt-0.5 h-2 w-2 rounded-full bg-primary/70" />
              <span className="text-muted-foreground">
                <strong className="text-foreground">Use style tags</strong> — Help clients discover
                products that match their aesthetic preferences
              </span>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
