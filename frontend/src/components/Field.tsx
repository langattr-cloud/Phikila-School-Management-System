import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode } from 'react'
import { EyeIcon, EyeOffIcon } from './icons'

type BaseProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string
  error?: string | null
  hint?: ReactNode
  /** Rendered under the input, e.g. a password strength meter. */
  footer?: ReactNode
}

export const Field = forwardRef<HTMLInputElement, BaseProps>(function Field(
  { label, error, hint, footer, id, required, className, ...rest },
  ref,
) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const hintId = `${inputId}-hint`
  const errorId = `${inputId}-error`
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ')

  return (
    <div className={`field ${className ?? ''}`.trim()}>
      <label className="field__label" htmlFor={inputId}>
        {label}
        {required ? (
          <span className="field__required"> (required)</span>
        ) : (
          <span className="field__optional"> (optional)</span>
        )}
      </label>
      {hint && (
        <p className="field__hint" id={hintId}>
          {hint}
        </p>
      )}
      <input
        ref={ref}
        id={inputId}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={`input ${error ? 'input--invalid' : ''}`.trim()}
        {...rest}
      />
      {footer}
      {error && (
        <p className="field__error" id={errorId}>
          <span className="visually-hidden">Error: </span>
          {error}
        </p>
      )}
    </div>
  )
})

type PasswordFieldProps = Omit<BaseProps, 'type'>

export const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(
  function PasswordField({ label, error, hint, footer, id, required, ...rest }, ref) {
    const generatedId = useId()
    const inputId = id ?? generatedId
    const hintId = `${inputId}-hint`
    const errorId = `${inputId}-error`
    const [visible, setVisible] = useState(false)
    const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ')

    return (
      <div className="field">
        <label className="field__label" htmlFor={inputId}>
          {label}
          {required && <span className="field__required"> (required)</span>}
        </label>
        {hint && (
          <p className="field__hint" id={hintId}>
            {hint}
          </p>
        )}
        <div className={`input-group ${error ? 'input-group--invalid' : ''}`.trim()}>
          <input
            ref={ref}
            id={inputId}
            // Toggling only the type keeps React's controlled value intact.
            type={visible ? 'text' : 'password'}
            required={required}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy || undefined}
            className="input input--with-affix"
            {...rest}
          />
          <button
            type="button"
            className="input-group__button"
            onClick={() => setVisible((current) => !current)}
            aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
            aria-pressed={visible}
          >
            {visible ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>
        {footer}
        {error && (
          <p className="field__error" id={errorId}>
            <span className="visually-hidden">Error: </span>
            {error}
          </p>
        )}
      </div>
    )
  },
)
