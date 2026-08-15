import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const allowedPublicVariables = new Set([
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'VITE_API_URL',
])

// Vercel injects VITE_VERCEL_OBSERVABILITY_CLIENT_CONFIG automatically at
// build time when the Observability / Speed Insights integration is enabled.
// It is Vercel-managed public client configuration (e.g. script/endpoint
// paths) intended to be read by the Vercel/Vite integration in the browser,
// not an application secret. Allow it explicitly while keeping strict
// validation for every other VITE_* variable.
const vercelManagedVariables = new Set([
  'VITE_VERCEL_OBSERVABILITY_CLIENT_CONFIG',
])

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
      !vercelManagedVariables.has(name),
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
      // served by FastAPI/Vercel and never uses this dev server.
      allowedHosts: ['localhost', '127.0.0.1', '.e2b.app'],
      proxy: {
        // Forward API and health requests to the FastAPI backend during local
        // development so the frontend can talk to the real server.
        '/api': {
          target: 'http://127.0.0.1:8000',
          changeOrigin: true,
        },
        '/health': {
          target: 'http://127.0.0.1:8000',
          changeOrigin: true,
        },
      },
    },
  }
})
