import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const allowedPublicVariables = new Set([
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'VITE_API_URL',
])

// Vercel may inject its own VITE_VERCEL_* variables at build time. These are
// platform-managed public build metadata, not application secrets.
const isVercelManagedVariable = (name: string) => name.startsWith('VITE_VERCEL_')

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, '.', 'VITE_')

  // Both Supabase variables are required together for the production auth
  // path. When both are absent the app runs in local auth mode (the backend's
  // own token endpoint); a half-configured pair is a configuration error.
  const hasSupabaseUrl = Boolean(environment['VITE_SUPABASE_URL']?.trim())
  const hasSupabaseKey = Boolean(environment['VITE_SUPABASE_ANON_KEY']?.trim())
  if (hasSupabaseUrl !== hasSupabaseKey) {
    throw new Error(
      'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set together, or both omitted for local mode',
    )
  }

  const unexpected = Object.keys(environment).filter(
    (name) =>
      name.startsWith('VITE_') &&
      !allowedPublicVariables.has(name) &&
      !isVercelManagedVariable(name),
  )
  if (unexpected.length > 0) {
    throw new Error(
      `Unexpected VITE_* variables would be exposed to browsers: ${unexpected.join(', ')}`,
    )
  }

  return {
    plugins: [react()],
    server: {
      // Local development only. Vite rejects unknown Host headers, which blocks
      // remote dev/preview sandboxes (e.g. cloud workspaces). Production is
      // served by the Vercel static Vite deployment and never uses this dev server.
      allowedHosts: ['localhost', '127.0.0.1', '.e2b.app'],
      proxy: {
        // Forward API and health requests to the Cloudflare Worker backend
        // during local development (`wrangler dev` runs on :8787).
        '/api': {
          target: 'http://127.0.0.1:8787',
          changeOrigin: true,
        },
        '/health': {
          target: 'http://127.0.0.1:8787',
          changeOrigin: true,
        },
      },
    },
  }
})
