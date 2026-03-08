import { redirect } from 'next/navigation';

export default function HomePage() {
  // Redirect to user management (primary admin function)
  redirect('/users');
}
