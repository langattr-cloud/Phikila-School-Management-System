import { apiFetch } from './api'

export type EmailTemplate = {
  id: string
  name: string
  category: string
  description: string
  default_subject: string
  sample_context: Record<string, unknown>
}

export type EmailStatus = {
  provider: string
  configured: boolean
  api_key_masked: string
  default_from: string
  templates_count: number
}

export type TemplatePreview = {
  template_id: string
  subject: string
  html: string
  text: string
}

export type SendEmailPayload = {
  to: string | string[]
  subject?: string
  template_id?: string
  context?: Record<string, unknown>
  html?: string
  text?: string
  from_email?: string
  reply_to?: string
}

export const emailApi = {
  getStatus: () => apiFetch<EmailStatus>('/email/status'),
  getTemplates: () => apiFetch<EmailTemplate[]>('/email/templates'),
  getTemplate: (id: string) => apiFetch<EmailTemplate & { preview: TemplatePreview }>(`/email/templates/${id}`),
  previewTemplate: (templateId: string, context?: Record<string, unknown>) =>
    apiFetch<TemplatePreview>('/email/preview', {
      method: 'POST',
      body: JSON.stringify({ template_id: templateId, context: context || {} }),
    }),
  sendTestEmail: (to: string, templateId?: string) =>
    apiFetch<{ success: boolean; id?: string; error?: string }>('/email/test', {
      method: 'POST',
      body: JSON.stringify({ to, template_id: templateId }),
    }),
  sendEmail: (payload: SendEmailPayload) =>
    apiFetch<{ success: boolean; id?: string; error?: string }>('/email/send', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
}
