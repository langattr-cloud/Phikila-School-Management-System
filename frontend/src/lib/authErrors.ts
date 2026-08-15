/**
 * Translate Supabase/auth failures into messages that are useful to a user
 * without leaking backend internals, provider wording, or account existence.
 */
export function friendlyAuthError(error: unknown, fallback: string): string {
  const raw =
    typeof error === 'string'
      ? error
      : error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string'
        ? (error as { message: string }).message
        : ''
  const message = raw.toLowerCase()

  if (!message) return fallback

  if (message.includes('invalid login credentials') || message.includes('invalid_credentials')) {
    return 'That email and password combination is not correct. Check both and try again.'
  }
  if (message.includes('email not confirmed')) {
    return 'This email address has not been confirmed yet. Open the confirmation link we sent you, then sign in.'
  }
  if (message.includes('user already registered') || message.includes('already been registered')) {
    return 'An account already exists for this email address. Try signing in instead.'
  }
  if (message.includes('password should be') || message.includes('password is too weak')) {
    return 'Choose a stronger password with at least 8 characters.'
  }
  if (message.includes('signups not allowed') || message.includes('signup is disabled')) {
    return 'New accounts are not open for self sign-up. Ask a school administrator to create your account.'
  }
  if (message.includes('rate limit') || message.includes('too many requests') || message.includes('over_email_send')) {
    return 'Too many attempts. Wait a minute before trying again.'
  }
  if (message.includes('same as the old password') || message.includes('should be different')) {
    return 'Choose a password you have not used on this account before.'
  }
  if (
    message.includes('token has expired') ||
    message.includes('invalid or has expired') ||
    message.includes('otp_expired')
  ) {
    return 'This link has expired. Request a new password reset email.'
  }
  if (message.includes('failed to fetch') || message.includes('networkerror') || message.includes('load failed')) {
    return 'We could not reach the server. Check your connection and try again.'
  }
  if (message.includes('please sign in again') || message.includes('jwt') || message.includes('401')) {
    return 'Your session has expired. Please sign in again.'
  }

  return fallback
}
