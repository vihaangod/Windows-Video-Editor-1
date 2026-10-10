import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? '';

const configuration = (() => {
  if (!supabaseUrl || !supabasePublishableKey) {
    return {
      client: null,
      error: 'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to the editor .env file.',
    };
  }

  try {
    const parsedUrl = new URL(supabaseUrl);
    if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
      throw new Error('Supabase URL must use HTTP or HTTPS.');
    }

    return {
      client: createClient(supabaseUrl, supabasePublishableKey, {
        auth: {
          autoRefreshToken: true,
          detectSessionInUrl: true,
          persistSession: true,
        },
      }),
      error: null,
    };
  } catch {
    return {
      client: null,
      error: 'Supabase configuration is invalid. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
    };
  }
})();

export const supabaseClient: SupabaseClient | null = configuration.client;
export const isSupabaseConfigured = supabaseClient !== null;
export const supabaseConfigurationError = configuration.error;

export function getSupabaseClient(): SupabaseClient {
  if (!supabaseClient) {
    throw new Error(supabaseConfigurationError ?? 'Supabase client is unavailable.');
  }
  return supabaseClient;
}
