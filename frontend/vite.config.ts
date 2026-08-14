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
  const missing = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'].filter(
    (name) => !environment[name]?.trim(),
  )
  if (missing.length > 0) {
    throw new Error(`Missing required public build variables: ${missing.join(', ')}`)
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
  }
})
