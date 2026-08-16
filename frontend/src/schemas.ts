import { z } from 'zod'

/** Reusable Zod schemas for API responses. */

export const healthSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  environment: z.string(),
  database: z.enum(['connected', 'disconnected']),
})

export const userMeSchema = z.object({
  id: z.string(),
  email: z.string().email().nullable(),
  role: z.string().nullable(),
})

export type HealthResponse = z.infer<typeof healthSchema>
export type UserMeResponse = z.infer<typeof userMeSchema>
