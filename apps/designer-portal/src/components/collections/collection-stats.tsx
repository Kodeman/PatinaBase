'use client';

import { Card, CardContent } from '@patina/design-system';
import { Package, DollarSign, TrendingUp, Layers } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface CollectionStatsProps {
  productCount: number;
  totalValue?: number;
  averagePrice?: number;
  categoryCount?: number;
  categories?: Array<{ name: string; count: number }>;
}

export function CollectionStats({
  productCount,
  totalValue,
  averagePrice,
  categoryCount,
  categories = [],
}: CollectionStatsProps) {
  const stats = [
    {
      label: 'Total Products',
      value: productCount.toLocaleString(),
      icon: Package,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      label: 'Total Value',
      value: totalValue ? formatCurrency(totalValue) : 'N/A',
      icon: DollarSign,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
    },
    {
      label: 'Average Price',
      value: averagePrice ? formatCurrency(averagePrice) : 'N/A',
      icon: TrendingUp,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
    },
    {
      label: 'Categories',
      value: categoryCount?.toLocaleString() || categories.length.toString(),
      icon: Layers,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    {stat.label}
                  </p>
                  <p className="mt-2 text-2xl font-bold">{stat.value}</p>
                </div>
                <div className={`rounded-lg p-2.5 ${stat.bgColor}`}>
                  <stat.icon className={`h-5 w-5 ${stat.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Category Breakdown */}
      {categories.length > 0 && (
        <Card>
          <CardContent className="p-6">
            <h3 className="font-semibold mb-4">Category Breakdown</h3>
            <div className="space-y-3">
              {categories.slice(0, 5).map((category, index) => {
                const percentage = (category.count / productCount) * 100;
                return (
                  <div key={category.name} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{category.name}</span>
                      <span className="text-muted-foreground">
                        {category.count} ({percentage.toFixed(0)}%)
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              {categories.length > 5 && (
                <p className="text-sm text-muted-foreground text-center pt-2">
                  +{categories.length - 5} more categories
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
