import Link from 'next/link';
import { ArrowRight, Palette, Package, Users, TrendingUp, Sparkles, Home } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/5">
      {/* Header */}
      <header className="w-full px-6 py-4 border-b bg-background/80 backdrop-blur-sm">
        <nav className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-sm">P</span>
            </div>
            <span className="font-heading text-xl font-bold">Patina</span>
          </div>
          <Link
            href="/projects"
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Sign In
            <ArrowRight className="h-4 w-4" />
          </Link>
        </nav>
      </header>

      <main className="flex min-h-[calc(100vh-65px)] flex-col items-center justify-center px-6 py-12">
        {/* Hero Section */}
        <div className="max-w-5xl w-full text-center space-y-8">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium">
            <Sparkles className="h-4 w-4" />
            Designer Portal
          </div>

          {/* Main Heading */}
          <div className="space-y-4">
            <h1 className="text-5xl md:text-6xl font-heading font-bold tracking-tight">
              Welcome to Your
              <span className="block text-primary mt-2">Design Studio</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Create stunning custom home furnishing solutions for your clients with our comprehensive designer platform
            </p>
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-4">
            <Link
              href="/projects"
              className="group flex items-center gap-3 px-8 py-4 bg-primary text-primary-foreground rounded-lg font-medium text-lg hover:bg-primary/90 transition-all hover:scale-105 shadow-lg shadow-primary/20"
            >
              <Home className="h-5 w-5" />
              Enter Designer Portal
              <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link
              href="/auth/signin"
              className="flex items-center gap-3 px-8 py-4 bg-background border-2 border-border rounded-lg font-medium text-lg hover:bg-accent hover:border-accent transition-all"
            >
              Create Account
            </Link>
          </div>

          {/* Features Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 pt-16">
            <FeatureCard
              icon={<Palette className="h-6 w-6" />}
              title="Style Profiles"
              description="Create and manage personalized style profiles for each client"
            />
            <FeatureCard
              icon={<Package className="h-6 w-6" />}
              title="Product Catalog"
              description="Browse and customize our extensive furniture collection"
            />
            <FeatureCard
              icon={<Users className="h-6 w-6" />}
              title="Client Management"
              description="Organize projects and collaborate with your clients"
            />
            <FeatureCard
              icon={<TrendingUp className="h-6 w-6" />}
              title="Order Tracking"
              description="Monitor production and delivery status in real-time"
            />
          </div>

          {/* Quick Links */}
          <div className="pt-12 space-y-4">
            <p className="text-sm text-muted-foreground">Quick Access:</p>
            <div className="flex flex-wrap gap-4 justify-center">
              <QuickLink href="/projects" label="Projects" />
              <QuickLink href="/catalog" label="Catalog" />
              <QuickLink href="/clients" label="Clients" />
              <QuickLink href="/proposals" label="Proposals" />
              <QuickLink href="/demo" label="Demo" />
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full px-6 py-8 border-t bg-background/50">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-muted-foreground">
            © 2024 Patina. Custom furniture for discerning designers.
          </p>
          <div className="flex gap-6">
            <Link href="/support" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Support
            </Link>
            <Link href="/docs" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Documentation
            </Link>
            <Link href="/contact" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Contact
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="p-6 rounded-lg border bg-card hover:bg-accent/5 transition-colors group">
      <div className="flex flex-col items-center text-center space-y-3">
        <div className="p-3 rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
          {icon}
        </div>
        <h3 className="font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="px-4 py-2 rounded-lg bg-background border hover:bg-accent hover:border-accent-foreground/20 transition-all text-sm font-medium"
    >
      {label}
    </Link>
  );
}