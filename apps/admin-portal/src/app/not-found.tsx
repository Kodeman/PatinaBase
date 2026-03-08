import Link from 'next/link';
import { Button } from '@patina/design-system';

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="space-y-2">
          <h1 className="text-6xl font-bold text-foreground">
            404
          </h1>
          <h2 className="text-3xl font-bold text-foreground">
            Page not found
          </h2>
          <p className="text-lg text-muted-foreground">
            The page you're looking for doesn't exist or has been moved.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link href="/">
            <Button variant="default" size="lg">
              Go to home
            </Button>
          </Link>
          <Link href="/users">
            <Button variant="outline" size="lg">
              Go to User Management
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
