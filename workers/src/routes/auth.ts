import { Hono } from 'hono'
import { anonDb, db } from '../lib/db'
import { requireAuth } from '../lib/auth'

export const authRoutes = new Hono()

/** Legacy self-hosted password login → returns a signed access token. */
authRoutes.post('/login', async (c) => {
  const form = await c.req.formData()
  const email = String(form.get('username') ?? '').trim()
  const password = String(form.get('password') ?? '')
  if (!email || !password) return c.json({ detail: 'Email and password are required.' }, 400)

  // Mirror the legacy behaviour: super admins are seeded directly; everyone
  // else signs in through Supabase Auth (the primary path). Keep a fallback
  // for local development against the old user table.
  const supabase = anonDb()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error || !data.session) {
    return c.json({ detail: 'Incorrect email or password.' }, 401)
  }
  return c.json({ access_token: data.session.access_token })
})

/** Verified Supabase Auth identity. */
authRoutes.get('/me', async (c) => {
  const { error, user } = requireAuth(c as never)
  if (error) return error
  return c.json({ id: user!.id, email: user!.email })
})

/** Active local user table sync for super admins. */
export async function syncUserRecord(userId: string, email: string, fullName?: string) {
  const client = db()
  const { data } = await client.from('users').select('id').eq('id', userId).maybeSingle()
  if (data) {
    await client.from('users').update({ email, full_name: fullName ?? undefined }).eq('id', userId)
  } else {
    await client.from('users').insert({ id: userId, email, full_name: fullName ?? null })
  }
}