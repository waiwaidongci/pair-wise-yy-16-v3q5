import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api, ApiError } from '../api/client'
import type { CollectionListRow, CollectionStatus } from '../api/types'
import { seriesList } from '../data/photos'
import { StatusBadge } from '../components/StatusBadge'

const STATUS_OPTIONS: { id: CollectionStatus | ''; label: string }[] = [
  { id: '', label: '全部状态' },
  { id: 'draft', label: '草稿' },
  { id: 'published', label: '已发布' },
  { id: 'pending_review', label: '待复核' },
  { id: 'closed', label: '已结束' },
]

/**
 * 合集列表：筛选条件放在 URL 查询参数里，刷新 / 前进后退后列表与筛选保持一致；
 * 数据来自服务端展示层投影（与首页推荐同源）。
 */
export function CollectionsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [rows, setRows] = useState<CollectionListRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)

  const status = searchParams.get('status') ?? ''
  const seriesId = searchParams.get('series') ?? ''

  const load = useCallback(() => {
    const qs = new URLSearchParams()
    if (status) qs.set('status', status)
    if (seriesId) qs.set('seriesId', seriesId)
    api
      .get<{ collections: CollectionListRow[] }>(`/api/collections?${qs}`)
      .then((d) => {
        setRows(d.collections)
        setError(null)
      })
      .catch((e) => setError(e.message))
  }, [status, seriesId])

  useEffect(load, [load])

  const patchParams = (patch: Record<string, string>) => {
    const next = new URLSearchParams(searchParams)
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    setSearchParams(next)
  }

  return (
    <div className="container page">
      <h1 className="page-title">策展合集</h1>
      <p className="page-sub">
        每个合集按「系列 + 版本」唯一；照片在同一时间只能进入一个未结束合集。
      </p>

      <div className="toolbar">
        <div className="field">
          <label htmlFor="flt-status">状态</label>
          <select
            id="flt-status"
            data-testid="filter-status"
            value={status}
            onChange={(e) => patchParams({ status: e.target.value })}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="flt-series">系列</label>
          <select
            id="flt-series"
            data-testid="filter-series"
            value={seriesId}
            onChange={(e) => patchParams({ series: e.target.value })}
          >
            <option value="">全部系列</option>
            {seriesList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </div>
        <button className="btn" onClick={load}>
          刷新
        </button>
        <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => setShowNew(true)} data-testid="new-collection">
          ＋ 新建合集
        </button>
      </div>

      {error && <div className="alert error">{error}</div>}

      {rows === null ? (
        <div className="empty-state">加载中…</div>
      ) : rows.length === 0 ? (
        <div className="empty-state" data-testid="collections-empty">
          当前筛选条件下没有合集。
        </div>
      ) : (
        <table className="table" data-testid="collections-table">
          <thead>
            <tr>
              <th>合集</th>
              <th>系列</th>
              <th>版本</th>
              <th>状态</th>
              <th>照片数</th>
              <th>最近更新</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} data-collection-id={r.id}>
                <td>
                  <Link to={`/collections/${r.id}`}>{r.title}</Link>
                  {r.isRecommended && (
                    <>
                      {' '}
                      <span className="badge recommended">首页推荐</span>
                    </>
                  )}
                </td>
                <td>{r.seriesTitle}</td>
                <td>v{r.version}</td>
                <td>
                  <StatusBadge status={r.status} />
                </td>
                <td>{r.itemCount}</td>
                <td className="muted">{new Date(r.updatedAt).toLocaleString('zh-CN')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showNew && <NewCollectionModal onClose={() => setShowNew(false)} />}
    </div>
  )
}

function NewCollectionModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const [seriesId, setSeriesId] = useState(seriesList[0]?.id ?? '')
  const [version, setVersion] = useState(1)
  const [title, setTitle] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const d = await api.post<{ collection: { id: string } }>('/api/collections', {
        seriesId,
        version: Number(version),
        title,
      })
      navigate(`/collections/${d.collection.id}`)
    } catch (err) {
      // 409：同系列同版本已存在 —— 行内展示，不落库
      setError(err instanceof ApiError ? `${err.message}（${err.status}）` : '创建失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} data-testid="new-collection-modal">
        <h2>新建合集</h2>
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="nc-series">系列</label>
            <select id="nc-series" value={seriesId} onChange={(e) => setSeriesId(e.target.value)}>
              {seriesList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="nc-version">版本号（同系列内唯一）</label>
            <input
              id="nc-version"
              type="number"
              min={1}
              value={version}
              onChange={(e) => setVersion(Number(e.target.value))}
            />
          </div>
          <div className="field">
            <label htmlFor="nc-title">合集标题</label>
            <input
              id="nc-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：高原牧歌 · 2026 春策展"
            />
          </div>
          {error && (
            <div className="alert error" data-testid="new-collection-error">
              {error}
            </div>
          )}
          <div className="actions">
            <button type="button" className="btn" onClick={onClose}>
              取消
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy || !title.trim()}>
              {busy ? '创建中…' : '创建'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
