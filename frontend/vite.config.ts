import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const allowedPublicVariables = new Set([
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'VITE_API_URL',
])

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
    server: {
      port: 5173,
      host: true,
    },
    build: {
      sourcemap: true,
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom'],
          } as Record<string, string[]>,
        },
      },
    },
  }
})
