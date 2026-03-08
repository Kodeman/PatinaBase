import Link from 'next/link';
import { Button } from '@patina/design-system';

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-canvas)] px-6">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="space-y-2">
          <h1 className="font-[var(--font-playfair)] text-6xl text-[var(--color-text)]">
            404
          </h1>
          <h2 className="font-[var(--font-playfair)] text-3xl text-[var(--color-text)]">
            Page not found
          </h2>
          <p className="text-lg text-[var(--color-muted)]">
            The page you&rsquo;re looking for doesn&rsquo;t exist or has been moved.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link href="/">
            <Button variant="default" size="lg">
              Go to home
            </Button>
          </Link>
          <Link href="/projects">
            <Button variant="outline" size="lg">
              View projects
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
