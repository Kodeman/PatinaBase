'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { VendorForm } from '@/components/vendors/vendor-form';

export default function NewVendorPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-patina-off-white">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-patina-mocha-brown mb-6">
          <Link href="/vendors" className="hover:text-patina-charcoal transition-colors">
            Vendors
          </Link>
          <span>/</span>
          <span className="text-patina-charcoal">Add Vendor</span>
        </nav>

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-display font-semibold text-patina-charcoal mb-2">
            Add New Vendor
          </h1>
          <p className="text-patina-mocha-brown">
            Add a furniture vendor to the directory. Other designers will be able to discover and review this vendor.
          </p>
        </div>

        {/* Form */}
        <div className="bg-white rounded-xl border border-patina-clay-beige/20 p-6 shadow-sm">
          <VendorForm
            mode="create"
            onCancel={() => router.push('/vendors')}
          />
        </div>
      </div>
    </div>
  );
}
