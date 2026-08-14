import { apiFetch } from './api'

const PLATFORM = '/api/v1/platform'
const LLM = '/api/v1/llm'

/* ------------------------------------------------------------------ types */
export type SessionInfo = {
  user_id: string
  email: string | null
  is_super_admin: boolean
  schools: { id: number; name: string; role: string }[]
  has_access: boolean
  access_request: {
    status: 'pending' | 'approved' | 'rejected'
    requested_role: string
    requested_school_name: string | null
    decision_note: string | null
  } | null
}

export type School = {
  id: number
  name: string
  slug: string
  timezone: string | null
  academic_year: string | null
  status: 'active' | 'inactive'
  users: number
  teachers: number
  classes: number
  created_at: string | null
}

export type PlatformOverview = {
  schools: number
  users: number
  teachers: number
  classes: number
  pending_requests: number
  super_admins: number
  recent: { at: string; actor: string | null; action: string; summary: string }[]
}

export type AccessRequest = {
  id: number
  email: string
  full_name: string | null
  requested_role: string
  requested_school_id: number | null
  requested_school_name: string | null
  note: string | null
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  decided_at: string | null
  decided_by: string | null
}

export type PlatformAdmin = {
  user_id: string
  email: string | null
  granted_by: string | null
  created_at: string
  is_self: boolean
}

export type SchoolUser = {
  user_id: string
  email: string | null
  role: string
  is_active: boolean
  created_at: string
}

/* LLM ---------------------------------------------------------------- */
export type ProviderStatus =
  | 'not_configured'
  | 'connected'
  | 'invalid_credential'
  | 'provider_unavailable'
  | 'connection_failed'

export type Provider = {
  provider: string
  label: string
  docs_url: string
  key_hint: string
  connected: boolean
  api_key_configured: boolean
  api_key_hint: string | null
  status: ProviderStatus
  last_tested_at: string | null
  last_error: string | null
  models_available: number
  models_catalogued: number
  models_enabled: number
}

export type LlmModel = {
  id: number
  provider: string
  model_id: string
  display_name: string | null
  context_window: number | null
  input_price: number | null
  output_price: number | null
  supports_tools: boolean | null
  supports_vision: boolean | null
  supports_reasoning: boolean | null
  enabled: boolean
  last_tested_at: string | null
  last_test_ok: boolean | null
  last_test_ms: number | null
  last_test_error: string | null
}

export type ModelTestResult = {
  ok: boolean
  category: string
  message: string
  latency_ms: number | null
  provider: string
  model_id: string
  sample: string | null
}

/* ----------------------------------------------------------------- client */
const get = <T,>(path: string) => apiFetch<T>(path)
const send = <T,>(path: string, method: string, body?: unknown) =>
  apiFetch<T>(path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  })

export const platform = {
  session: () => get<SessionInfo>(`${PLATFORM}/session`),

  // Public: the signup form needs this before the visitor has a session.
  requestOptions: () =>
    apiFetch<{ schools: { id: number; name: string }[]; roles: string[] }>(
      `${PLATFORM}/access-requests/options`,
      {},
      false,
    ),
  submitRequest: (payload: {
    requested_role: string
    school_id: number | null
    school_name: string | null
    note?: string | null
  }) => send<{ status: string }>(`${PLATFORM}/access-requests`, 'POST', payload),

  overview: () => get<PlatformOverview>(`${PLATFORM}/overview`),

  schools: (search?: string, status?: string) => {
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (status && status !== 'all') params.set('status', status)
    const query = params.toString()
    return get<School[]>(`${PLATFORM}/schools${query ? `?${query}` : ''}`)
  },
  school: (id: number) => get<School>(`${PLATFORM}/schools/${id}`),
  createSchool: (payload: { name: string; slug: string; timezone?: string }) =>
    send<School>(`${PLATFORM}/schools`, 'POST', payload),
  updateSchool: (id: number, payload: Record<string, unknown>) =>
    send<School>(`${PLATFORM}/schools/${id}`, 'PATCH', payload),
  setSchoolStatus: (id: number, active: boolean) =>
    send<School>(`${PLATFORM}/schools/${id}/status?active=${active}`, 'POST'),
  schoolUsers: (id: number) => get<SchoolUser[]>(`${PLATFORM}/schools/${id}/users`),
  addAdministrator: (id: number, email: string, role: string) =>
    send<unknown>(`${PLATFORM}/schools/${id}/administrators`, 'POST', { email, role }),
  removeAdministrator: (id: number, userId: string) =>
    send<void>(`${PLATFORM}/schools/${id}/administrators/${userId}`, 'DELETE'),

  accessRequests: (status = 'pending') =>
    get<AccessRequest[]>(`${PLATFORM}/access-requests?status=${status}`),
  decideRequest: (
    id: number,
    payload: { approve: boolean; role?: string; school_id?: number; note?: string },
  ) => send<{ status: string }>(`${PLATFORM}/access-requests/${id}/decide`, 'POST', payload),

  admins: () => get<PlatformAdmin[]>(`${PLATFORM}/administrators`),
  grantAdmin: (email: string) =>
    send<unknown>(`${PLATFORM}/administrators`, 'POST', { email, role: 'admin' }),
  revokeAdmin: (userId: string) =>
    send<void>(`${PLATFORM}/administrators/${userId}`, 'DELETE'),

  audit: (limit = 50) =>
    get<
      {
        id: number
        at: string
        actor: string | null
        action: string
        summary: string
      }[]
    >(`${PLATFORM}/audit?limit=${limit}`),
}

export const llm = {
  providers: () =>
    get<{ providers: Provider[]; encryption_configured: boolean }>(`${LLM}/providers`),
  connect: (provider: string, apiKey: string) =>
    send<Provider>(`${LLM}/providers/${provider}/connect`, 'POST', { api_key: apiKey }),
  test: (provider: string) =>
    send<{ ok: boolean; category: string; message: string; latency_ms: number | null }>(
      `${LLM}/providers/${provider}/test`,
      'POST',
    ),
  disconnect: (provider: string) =>
    send<void>(`${LLM}/providers/${provider}/credential`, 'DELETE'),

  models: (provider: string, search?: string) => {
    const query = search ? `?search=${encodeURIComponent(search)}` : ''
    return get<LlmModel[]>(`${LLM}/providers/${provider}/models${query}`)
  },
  refresh: (provider: string) =>
    send<{ models_available: number; added: number; withdrawn: number }>(
      `${LLM}/providers/${provider}/models/refresh`,
      'POST',
    ),
  setEnabled: (modelPk: number, enabled: boolean) =>
    send<LlmModel>(`${LLM}/models/${modelPk}`, 'PATCH', { enabled }),
  testModel: (modelPk: number) => send<ModelTestResult>(`${LLM}/models/${modelPk}/test`, 'POST'),

  getDefault: () => get<{ provider: string | null; model_id: string | null }>(`${LLM}/default`),
  setDefault: (provider: string | null, modelId: string | null) =>
    send<{ provider: string | null; model_id: string | null }>(`${LLM}/default`, 'PUT', {
      provider,
      model_id: modelId,
    }),
}

/** Human-readable label for a provider status. Never colour alone. */
export const PROVIDER_STATUS_LABEL: Record<ProviderStatus, string> = {
  not_configured: 'Not configured',
  connected: 'Connected',
  invalid_credential: 'Credential invalid',
  provider_unavailable: 'Provider unavailable',
  connection_failed: 'Connection failed',
}
