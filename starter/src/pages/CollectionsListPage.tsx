import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useCuration, applyListFilter } from '../store/curation'
import { series, seriesById, photoById } from '../data/content'
import { RatioBox } from '../components/RatioBox'

const STATUS_OPTIONS = [
  { id: 'all', label: '全部状态' },
  { id: 'draft', label: '草稿' },
  { id: 'published', label: '已发布' },
  { id: 'pending_review', label: '待复核' },
] as const

const STATUS_LABEL: Record<string, string> = {
  draft: '草稿',
  published: '已发布',
  pending_review: '待复核',
}

export function CollectionsListPage() {
  const { data, filter, setFilter, resetDemo, actingCurator, setActingCurator } = useCuration()

  // 列表数据始终来自仓储投影；筛选状态持久化（刷新后一致）
  const filtered = useMemo(
    () => applyListFilter(Object.values(data.collections), filter),
    [data.collections, filter],
  )

  return (
    <div className="container collections-page">
      <div className="section-head-row">
        <div>
          <p className="eyebrow">Curation Desk</p>
          <h1 className="page-title">策展合集</h1>
        </div>
        <div className="head-actions">
          <Link to="/collections/new" className="btn btn-primary">新建合集</Link>
          <button type="button" className="btn btn-ghost" onClick={resetDemo}>重置演示数据</button>
        </div>
      </div>

      <div className="desk-bar">
        <label className="inline-field">
          当前操作人
          <input
            value={actingCurator}
            onChange={(e) => setActingCurator(e.target.value)}
            aria-label="当前操作人标识"
          />
        </label>
        <Link to="/proofs" className="btn btn-ghost">校样登记台</Link>
      </div>

      <div className="filters collection-filters" role="group" aria-label="合集筛选">
        <button
          type="button"
          className="chip"
          aria-pressed={filter.seriesId === 'all'}
          onClick={() => setFilter({ seriesId: 'all' })}
        >
          全部系列
        </button>
        {series.map((s) => (
          <button
            key={s.id}
            type="button"
            className="chip"
            aria-pressed={filter.seriesId === s.id}
            onClick={() => setFilter({ seriesId: s.id })}
          >
            {s.title}
          </button>
        ))}
        <span className="filter-sep" aria-hidden />
        {STATUS_OPTIONS.map((o) => (
          <button
            key={o.id}
            type="button"
            className="chip"
            aria-pressed={filter.status === o.id}
            onClick={() => setFilter({ status: o.id })}
          >
            {o.label}
          </button>
        ))}
      </div>

      <p className="filter-count" aria-live="polite">{filtered.length} 个合集</p>

      <div className="collection-grid">
        {filtered.map((c) => {
          const coverId = c.entries[0]?.photoId
          const s = seriesById(c.seriesId)
          return (
            <Link key={c.id} to={`/collections/${c.id}`} className="collection-card">
              {coverId ? (
                <RatioBox
                  width={photoById(coverId).width}
                  height={photoById(coverId).height}
                >
                  <img
                    src={`/${photoById(coverId).file}`}
                    alt={photoById(coverId).altText}
                    loading="lazy"
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </RatioBox>
              ) : (
                <div className="empty-cover">尚无选片</div>
              )}
              <div className="collection-card-body">
                <span className={`badge ${c.status}`}>{STATUS_LABEL[c.status]}</span>
                <h3>{c.title}</h3>
                <p className="mono">
                  {s.title} · v{c.versionNo} · {c.entries.length}/{s.photoIds.length} 张
                </p>
                <p className="byline-line">署名：{c.byline || '未填写'}</p>
              </div>
            </Link>
          )
        })}
      </div>
      {filtered.length === 0 && <p className="empty-hint">没有符合筛选条件的合集。</p>}
    </div>
  )
}
