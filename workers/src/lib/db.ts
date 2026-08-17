import { createClient, SupabaseClient } from '@supabase/supabase-js'

let cached: SupabaseClient | null = null

/** Service-role Supabase client. Server-side only — never expose its key. */
export function db(): SupabaseClient {
  if (cached) return cached
  const url = (process.env.SUPABASE_URL as string | undefined) ?? ''
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY as string | undefined) ?? ''
  cached = createClient(url, key, { auth: { persistSession: false } })
  return cached
}

/** Public anon client used only for auth token verification helpers. */
let anonCached: SupabaseClient | null = null
export function anonDb(): SupabaseClient {
  if (anonCached) return anonCached
  const url = (process.env.SUPABASE_URL as string | undefined) ?? ''
  const key = (process.env.SUPABASE_ANON_KEY as string | undefined) ?? ''
  anonCached = createClient(url, key, { auth: { persistSession: false } })
  return anonCached
}