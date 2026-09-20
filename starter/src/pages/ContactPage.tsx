import { useState } from 'react'

interface FormValues {
  name: string
  email: string
  message: string
}
type Errors = Partial<Record<keyof FormValues, string>>

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validate(v: FormValues): Errors {
  const errors: Errors = {}
  if (!v.name.trim()) errors.name = '请填写姓名'
  if (!v.email.trim()) errors.email = '请填写邮箱'
  else if (!EMAIL_RE.test(v.email.trim())) errors.email = '请输入有效的邮箱地址'
  if (!v.message.trim()) errors.message = '请填写留言内容'
  else if (v.message.trim().length < 10) errors.message = '留言至少需要 10 个字符'
  return errors
}

export function ContactPage() {
  const [values, setValues] = useState<FormValues>({ name: '', email: '', message: '' })
  const [errors, setErrors] = useState<Errors>({})
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)

  const showError = (field: keyof FormValues) => (touched[field] ? errors[field] : undefined)
  const isValid = Object.keys(validate(values)).length === 0

  const update = (field: keyof FormValues, raw: string) => {
    const next = { ...values, [field]: raw }
    setValues(next)
    setErrors(validate(next))
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const errs = validate(values)
    setErrors(errs)
    setTouched({ name: true, email: true, message: true })
    if (Object.keys(errs).length > 0) return
    setSubmitting(true)
    await new Promise((r) => setTimeout(r, 700))
    setSubmitting(false)
    setSent(true)
  }

  if (sent) {
    return (
      <div className="container narrow">
        <section className="success-panel" aria-live="polite">
          <p className="eyebrow">Message sent</p>
          <h1>谢谢你的来信</h1>
          <p>
            {values.name}，你的消息已经送达。我通常会在两个工作日内回复到 {values.email}。
          </p>
          <button type="button" className="btn" onClick={() => {
            setSent(false)
            setValues({ name: '', email: '', message: '' })
            setTouched({})
            setErrors({})
          }}>
            再写一封
          </button>
        </section>
      </div>
    )
  }

  return (
    <div className="container narrow">
      <h1 className="page-title">联系</h1>
      <form className="contact-form" onSubmit={submit} noValidate>
        <div className={`field ${showError('name') ? 'invalid' : ''}`}>
          <label htmlFor="cf-name">姓名</label>
          <input
            id="cf-name"
            value={values.name}
            onChange={(e) => update('name', e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, name: true }))}
            aria-invalid={!!showError('name')}
          />
          {showError('name') && <p className="error-text">{errors.name}</p>}
        </div>

        <div className={`field ${showError('email') ? 'invalid' : ''}`}>
          <label htmlFor="cf-email">邮箱</label>
          <input
            id="cf-email"
            type="email"
            value={values.email}
            onChange={(e) => update('email', e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, email: true }))}
            aria-invalid={!!showError('email')}
          />
          {showError('email') && <p className="error-text">{errors.email}</p>}
        </div>

        <div className={`field ${showError('message') ? 'invalid' : ''}`}>
          <label htmlFor="cf-message">留言</label>
          <textarea
            id="cf-message"
            value={values.message}
            onChange={(e) => update('message', e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, message: true }))}
            aria-invalid={!!showError('message')}
          />
          {showError('message') && <p className="error-text">{errors.message}</p>}
        </div>

        <button type="submit" className="btn btn-primary" disabled={!isValid || submitting}>
          {submitting ? '发送中…' : '发送消息'}
        </button>
      </form>
    </div>
  )
}
