export type PasswordStrength = {
  score: 0 | 1 | 2 | 3 | 4
  label: 'Too short' | 'Weak' | 'Fair' | 'Good' | 'Strong'
  suggestions: string[]
}

export const MINIMUM_PASSWORD_LENGTH = 8

/**
 * Lightweight, dependency-free strength estimate. It is advisory feedback for
 * the person choosing a password; Supabase remains the enforcing authority.
 */
export function assessPassword(password: string): PasswordStrength {
  const suggestions: string[] = []
  if (password.length < 12) suggestions.push('use 12 or more characters')
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password)) {
    suggestions.push('mix upper and lower case letters')
  }
  if (!/\d/.test(password)) suggestions.push('add a number')
  if (!/[^A-Za-z0-9]/.test(password)) suggestions.push('add a symbol')

  if (password.length < MINIMUM_PASSWORD_LENGTH) {
    return { score: 0, label: 'Too short', suggestions }
  }

  let points = 0
  if (password.length >= 8) points += 1
  if (password.length >= 12) points += 1
  if (password.length >= 16) points += 1
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) points += 1
  if (/\d/.test(password)) points += 1
  if (/[^A-Za-z0-9]/.test(password)) points += 1

  const score = Math.max(1, Math.min(4, Math.round((points / 6) * 4))) as 1 | 2 | 3 | 4
  const labels = { 1: 'Weak', 2: 'Fair', 3: 'Good', 4: 'Strong' } as const
  return { score, label: labels[score], suggestions }
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim())
}
