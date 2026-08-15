import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * When no Supabase project is configured the app runs in local mode: the
 * backend's own ``/api/v1/auth/login`` endpoint issues the access token and
 * it is stored on this device. Production always configures Supabase.
 */
export const supabaseAvailable = Boolean(supabaseUrl && supabaseAnonKey)

export const supabase: SupabaseClient | null = supabaseAvailable
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null

export function isLocalAuthMode(): boolean {
  return !supabaseAvailable
}
