import { useId } from 'react'

interface FormFieldProps {
  label: string
  type?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  required?: boolean
  disabled?: boolean
  error?: string
  helpText?: string
  as?: 'input' | 'textarea' | 'select'
  options?: { value: string; label: string }[]
  autoComplete?: string
  min?: string
}

export default function FormField({
  label, type = 'text', value, onChange, placeholder, required, disabled,
  error, helpText, as = 'input', options, autoComplete, min,
}: FormFieldProps) {
  const id = useId()
  const errorId = `${id}-error`

  const sharedProps = {
    id,
    value,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      onChange(e.target.value),
    placeholder,
    required,
    disabled,
    className: `form-input${error ? ' form-input--error' : ''}`,
    'aria-invalid': !!error,
    'aria-describedby': error ? errorId : helpText ? `${id}-help` : undefined,
  }

  return (
    <div className="form-field">
      <label htmlFor={id} className="form-label">
        {label}
        {required && <span className="form-required">*</span>}
      </label>
      {as === 'textarea' ? (
        <textarea {...sharedProps} rows={3} />
      ) : as === 'select' ? (
        <select {...sharedProps}>
          <option value="">Select…</option>
          {options?.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      ) : (
        <input {...sharedProps} type={type} autoComplete={autoComplete} min={min} />
      )}
      {error && <p id={errorId} className="form-error">{error}</p>}
      {helpText && !error && <p id={`${id}-help`} className="form-help">{helpText}</p>}
    </div>
  )
}
