import Link from 'next/link';

export default function UnauthorizedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900">Access Denied</h1>
        <p className="mt-4 text-lg text-gray-600">
          You do not have permission to access the admin portal.
        </p>
        <p className="mt-2 text-sm text-gray-500">
          Contact your administrator if you believe this is an error.
        </p>
        <Link
          href="/auth/signin"
          className="mt-8 inline-block rounded-md bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
        >
          Sign in with a different account
        </Link>
      </div>
    </div>
  );
}
