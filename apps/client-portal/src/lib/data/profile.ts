import 'server-only';

import { cache } from 'react';
import { createServerClient } from '@patina/supabase/server';

export interface ClientProfile {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
}

export const fetchClientProfile = cache(async (): Promise<ClientProfile | null> => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createServerClient()) as any;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, phone, avatar_url')
    .eq('id', user.id)
    .single();

  if (error || !data) {
    return {
      id: user.id,
      email: user.email ?? '',
      full_name: (user.user_metadata?.full_name as string) ?? null,
      phone: (user.user_metadata?.phone as string) ?? null,
      avatar_url: (user.user_metadata?.avatar_url as string) ?? null,
    };
  }

  return data as ClientProfile;
});
