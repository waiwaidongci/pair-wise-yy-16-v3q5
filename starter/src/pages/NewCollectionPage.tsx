import { useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { series } from '../data/content'
import { useCuration, errorMessage } from '../store/curation'

export function NewCollectionPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { api, actingCurator } = useCuration()
  const [seriesId, setSeriesId] = useState(params.get('seriesId') ?? series[0].id)
  const [title, setTitle] = useState('')
  const [curator, setCurator] = useState(actingCurator)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const c = await api.createCollection({ seriesId, title, curator })
      navigate(`/collections/${c.id}`)
    } catch (err) {
      setError(errorMessage(err).message)
      setBusy(false)
    }
  }

  return (
    <div className="container narrow">
      <p className="eyebrow">New Collection</p>
      <h1 className="page-title">新建策展合集</h1>
      <p className="form-hint">
        每个合集按「系列 + 版本」唯一：同一系列再次建集会自动递增版本号（v2、v3…）。
      </p>

      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="nc-series">系列</label>
          <select id="nc-series" value={seriesId} onChange={(e) => setSeriesId(e.target.value)}>
            {series.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}（{s.photoIds.length} 张必选）
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="nc-title">合集标题</label>
          <input id="nc-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="nc-curator">策展人标识</label>
          <input id="nc-curator" value={curator} onChange={(e) => setCurator(e.target.value)} required />
        </div>

        {error && <div className="alert" role="alert">{error}</div>}

        <div className="form-actions">
          <Link to="/collections" className="btn btn-ghost">取消</Link>
          <button type="submit" className="btn btn-primary" disabled={busy || !title.trim() || !curator.trim()}>
            {busy ? '创建中…' : '创建并进入工作台'}
          </button>
        </div>
      </form>
    </div>
  )
}
