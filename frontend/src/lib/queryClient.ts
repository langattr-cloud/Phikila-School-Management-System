import { QueryClient } from '@tanstack/react-query'

/**
 * Create a QueryClient with sensible defaults for a school-management UI.
 *
 * - 5-minute cache time so refetched data persists across route changes
 * - 3 retries with exponential backoff for transient network errors
 * - 10-second stale time for fast subsequent reads
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 10_000,
        gcTime: 300_000,
        retry: (failureCount, error) => {
          // Don't retry 4xx errors (auth, validation)
          if (error instanceof Error && 'status' in error) {
            const status = (error as { status: number }).status
            if (status >= 400 && status < 500) return false
          }
          return failureCount < 3
        },
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10_000),
      },
    },
  })
}
