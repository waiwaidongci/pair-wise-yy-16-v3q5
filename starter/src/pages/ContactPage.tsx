import { useMemo, useState } from 'react'

interface FormState {
  name: string
  email: string
  message: string
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validate(values: FormState) {
  const errors: Partial<Record<keyof FormState, string>> = {}
  if (!values.name.trim()) errors.name = '请填写您的称呼'
  if (!values.email.trim()) errors.email = '请填写邮箱'
  else if (!EMAIL_RE.test(values.email.trim())) errors.email = '邮箱格式不正确'
  if (!values.message.trim()) errors.message = '请写一点想聊的内容'
  else if (values.message.trim().length < 10) errors.message = '内容太短了，至少 10 个字符'
  return errors
}

/**
 * 联系表单：行内校验 + 校验未通过禁用提交 + 前端模拟提交成功态。
 */
export function ContactPage() {
  const [values, setValues] = useState<FormState>({ name: '', email: '', message: '' })
  const [touched, setTouched] = useState<Partial<Record<keyof FormState, boolean>>>({})
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  const errors = useMemo(() => validate(values), [values])
  const isValid = Object.keys(errors).length === 0

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setValues((v) => ({ ...v, [key]: e.target.value }))
  const blur = (key: keyof FormState) => () => setTouched((t) => ({ ...t, [key]: true }))

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setTouched({ name: true, email: true, message: true })
    if (!isValid || submitting) return
    setSubmitting(true)
    // 前端模拟提交，无真实后端
    window.setTimeout(() => {
      setSubmitting(false)
      setDone(true)
    }, 800)
  }

  if (done) {
    return (
      <div className="container page">
        <div className="success-panel" data-testid="contact-success">
          <div className="mark">✓</div>
          <h1 className="heading">已收到您的来信</h1>
          <p className="muted">
            谢谢 {values.name.trim()}，我会尽快通过 {values.email.trim()} 回复您。
          </p>
          <button
            className="btn"
            onClick={() => {
              setDone(false)
              setValues({ name: '', email: '', message: '' })
              setTouched({})
            }}
          >
            再写一封
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="container page" style={{ maxWidth: 640 }}>
      <h1 className="page-title">联系</h1>
      <p className="page-sub">约拍、展览与出版合作，都欢迎来信。</p>

      <form onSubmit={onSubmit} noValidate data-testid="contact-form">
        <div className={`field${touched.name && errors.name ? ' invalid' : ''}`}>
          <label htmlFor="cf-name">称呼</label>
          <input
            id="cf-name"
            value={values.name}
            onChange={set('name')}
            onBlur={blur('name')}
            aria-invalid={Boolean(touched.name && errors.name)}
          />
          {touched.name && errors.name && <div className="error-text">{errors.name}</div>}
        </div>
        <div className={`field${touched.email && errors.email ? ' invalid' : ''}`}>
          <label htmlFor="cf-email">邮箱</label>
          <input
            id="cf-email"
            type="email"
            value={values.email}
            onChange={set('email')}
            onBlur={blur('email')}
            aria-invalid={Boolean(touched.email && errors.email)}
          />
          {touched.email && errors.email && <div className="error-text">{errors.email}</div>}
        </div>
        <div className={`field${touched.message && errors.message ? ' invalid' : ''}`}>
          <label htmlFor="cf-message">想说的话</label>
          <textarea
            id="cf-message"
            rows={6}
            value={values.message}
            onChange={set('message')}
            onBlur={blur('message')}
            aria-invalid={Boolean(touched.message && errors.message)}
          />
          {touched.message && errors.message && <div className="error-text">{errors.message}</div>}
        </div>
        <button
          className="btn btn-primary"
          type="submit"
          disabled={!isValid || submitting}
          data-testid="contact-submit"
        >
          {submitting ? '发送中…' : '发送'}
        </button>
      </form>
    </div>
  )
}
