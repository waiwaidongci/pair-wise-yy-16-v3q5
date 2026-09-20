import { useCallback, useEffect, useMemo, useRef, useState, Fragment } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, ApiError } from '../api/client'
import type { Collection, MaterializedItem, Snapshot } from '../api/types'
import { photoById, photosOfSeries, seriesById } from '../data/photos'
import { useUser } from '../context/UserContext'
import { StatusBadge } from '../components/StatusBadge'
import { RatioImage } from '../components/RatioImage'

interface PublishError {
  field: string
  code: string
  photoId?: string
  message: string
}

interface CollectionDetail extends Collection {
  fingerprint: string
  materializedItems: MaterializedItem[]
  publishErrors: PublishError[]
  consecutiveMatches: number
  reviewRequired: number
}

/**
 * 合集详情：条目编辑（只能选当前有效校样）、发布校验清单、
 * 复核确认（换人 + 连续两次指纹一致）、幂等发布、历史快照查询。
 */
export function CollectionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { userId } = useUser()
  const [col, setCol] = useState<CollectionDetail | null>(null)
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // 幂等键：同一次「发布意图」重试时沿用，成功后换新 —— 重复/并发发布沿用首次结果
  const idemKey = useRef(`pub-${id}-${crypto.randomUUID()}`)

  const load = useCallback(async () => {
    if (!id) return
    try {
      const [c, s] = await Promise.all([
        api.get<{ collection: CollectionDetail }>(`/api/collections/${id}`),
        api.get<{ snapshots: Snapshot[] }>(`/api/collections/${id}/snapshots`),
      ])
      setCol(c.collection)
      setSnapshots(s.snapshots)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof ApiError ? `${e.message}（${e.status} ${e.code}）` : '操作失败')
    } finally {
      setBusy(false)
      await load()
    }
  }

  const publish = () =>
    run(async () => {
      const res = await api.post<{ reused?: boolean; replayed?: boolean; snapshot: Snapshot }>(
        `/api/collections/${id}/publish`,
        {},
        { 'Idempotency-Key': idemKey.current },
      )
      idemKey.current = `pub-${id}-${crypto.randomUUID()}` // 成功后更换幂等键
      setNotice(
        res.reused || res.replayed
          ? `重复发布：沿用首次结果（快照 ${res.snapshot.id}）`
          : `发布成功，快照 ${res.snapshot.id}`,
      )
    })

  const confirm = () =>
    run(async () => {
      const res = await api.post<{ consecutiveMatches: number; required: number }>(
        `/api/collections/${id}/confirm`,
      )
      setNotice(`已确认版本指纹一致（连续 ${res.consecutiveMatches}/${res.required} 次）`)
    })

  const close = () =>
    run(async () => {
      await api.post(`/api/collections/${id}/close`)
      setNotice('合集已结束，占用的照片已释放')
    })

  const series = col ? seriesById(col.seriesId) : undefined
  const editable = col?.status === 'draft' || col?.status === 'pending_review'
  const canPublish =
    col?.status === 'draft' ||
    (col?.status === 'pending_review' && col.consecutiveMatches >= (col?.reviewRequired ?? 2))

  if (!col) {
    return (
      <div className="container page">
        {error ? <div className="alert error">{error}</div> : <div className="empty-state">加载中…</div>}
      </div>
    )
  }

  return (
    <div className="container page">
      <p className="muted">
        <Link to="/collections">← 返回合集列表</Link>
      </p>
      <h1 className="page-title">
        {col.title} <StatusBadge status={col.status} />
      </h1>
      <p className="page-sub">
        系列《{series?.title}》 · 版本 v{col.version} · 创建人 {col.createdBy}
      </p>

      {error && (
        <div className="alert error" data-testid="detail-error">
          {error}
        </div>
      )}
      {notice && (
        <div className="alert ok" data-testid="detail-notice">
          {notice}
        </div>
      )}

      {col.status === 'pending_review' && (
        <ReviewPanel
          col={col}
          userId={userId}
          busy={busy}
          onConfirm={confirm}
        />
      )}

      <div className="panel">
        <h2>发布校验</h2>
        <PublishChecklist col={col} />
        <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
          <button
            className="btn btn-primary"
            disabled={busy || !canPublish || col.publishErrors.length > 0}
            onClick={publish}
            data-testid="publish-btn"
          >
            {col.status === 'pending_review' ? '重新发布' : '发布'}
          </button>
          {col.status !== 'closed' && (
            <button className="btn btn-danger" disabled={busy} onClick={close}>
              结束合集（释放照片）
            </button>
          )}
        </div>
        {col.status === 'pending_review' && col.consecutiveMatches < col.reviewRequired && (
          <p className="muted" style={{ marginBottom: 0 }}>
            重新发布需两名不同复核人连续两次确认版本指纹一致（当前 {col.consecutiveMatches}/
            {col.reviewRequired}）。
          </p>
        )}
      </div>

      <div className="panel">
        <h2>合集照片（{col.materializedItems.length}）</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          只能选用每张照片的当前有效校样；同一照片不能同时进入其他未结束合集（冲突返回 409，不落库）。
        </p>
        {editable && <AddItemRow col={col} busy={busy} onDone={load} onError={setError} />}
        {col.materializedItems.length === 0 ? (
          <div className="empty-state">还没有照片。</div>
        ) : (
          <div className="item-grid" data-testid="items-grid">
            {col.materializedItems.map((m) => (
              <ItemCard
                key={m.photoId}
                item={m}
                pinnedProofId={col.items.find((i) => i.photoId === m.photoId)?.proofId}
                editable={Boolean(editable)}
                busy={busy}
                onRemove={() =>
                  run(async () => {
                    await api.del(`/api/collections/${id}/items/${m.photoId}`)
                  })
                }
              />
            ))}
          </div>
        )}
      </div>

      <div className="panel">
        <h2>版本指纹</h2>
        <p className="fp" data-testid="fingerprint">
          {col.fingerprint}
        </p>
        <p className="muted">指纹由系列、版本与全部条目的当前有效校样（版本、说明、署名）规范化哈希得出。</p>
      </div>

      <div className="panel">
        <h2>发布快照（{snapshots.length}）</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          旧快照永久可查，但不计入首页推荐。
        </p>
        {snapshots.length === 0 ? (
          <div className="empty-state">尚未发布过。</div>
        ) : (
          <SnapshotList snapshots={snapshots} />
        )}
      </div>
    </div>
  )
}

function PublishChecklist({ col }: { col: CollectionDetail }) {
  const series = seriesById(col.seriesId)
  const required = series?.photoIds ?? []
  const present = new Set(col.items.map((i) => i.photoId))
  const missing = required.filter((p) => !present.has(p))
  const captionIssues = col.publishErrors.filter((e) => e.field !== 'items')

  return (
    <ul className="checklist" data-testid="publish-checklist">
      <li>
        <span className={missing.length === 0 ? 'ok' : 'bad'}>{missing.length === 0 ? '✓' : '✗'}</span>
        <span>
          覆盖系列全部必选照片（{required.length - missing.length}/{required.length}）
          {missing.length > 0 && <span className="muted">　缺少：{missing.join('、')}</span>}
        </span>
      </li>
      <li>
        <span className={captionIssues.length === 0 ? 'ok' : 'bad'}>
          {captionIssues.length === 0 ? '✓' : '✗'}
        </span>
        <span>
          说明与署名校验
          {captionIssues.length > 0 && (
            <span className="muted">　{captionIssues.map((e) => e.message).join('；')}</span>
          )}
        </span>
      </li>
      <li>
        <span className="ok">✓</span>
        <span>
          合集唯一性：{col.seriesId} · v{col.version}
        </span>
      </li>
    </ul>
  )
}

function ReviewPanel({
  col,
  userId,
  busy,
  onConfirm,
}: {
  col: CollectionDetail
  userId: string
  busy: boolean
  onConfirm: () => void
}) {
  const isInvalidator = col.invalidatedBy === userId
  const lastReviewer = col.reviewConfirmations[col.reviewConfirmations.length - 1]?.reviewer
  const isLastReviewer = lastReviewer === userId

  return (
    <div className="panel" data-testid="review-panel" style={{ borderColor: 'var(--gold-dim)' }}>
      <h2>待复核</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        {col.invalidationReason} · 触发人 {col.invalidatedBy} ·{' '}
        {col.invalidatedAt && new Date(col.invalidatedAt).toLocaleString('zh-CN')}
      </p>
      <h3>复核确认记录（{col.reviewConfirmations.length}）</h3>
      {col.reviewConfirmations.length === 0 ? (
        <p className="muted">尚无确认。复核需换人：触发失效的操作者不能自审，连续两次确认也须为不同人。</p>
      ) : (
        <ul className="confirm-list">
          {col.reviewConfirmations.map((c, i) => (
            <li key={i}>
              <strong>{c.reviewer}</strong> 于 {new Date(c.confirmedAt).toLocaleString('zh-CN')} 确认
              <br />
              <span className="fp">{c.fingerprint}</span>
            </li>
          ))}
        </ul>
      )}
      <button
        className="btn"
        disabled={busy || isInvalidator || isLastReviewer}
        onClick={onConfirm}
        data-testid="confirm-btn"
      >
        确认版本指纹一致（{col.consecutiveMatches}/{col.reviewRequired}）
      </button>
      {isInvalidator && <p className="muted">你是本次失效的触发人，不能自审，请切换身份。</p>}
      {isLastReviewer && <p className="muted">你已完成上一次确认，下一次确认须换人。</p>}
    </div>
  )
}

function AddItemRow({
  col,
  busy,
  onDone,
  onError,
}: {
  col: CollectionDetail
  busy: boolean
  onDone: () => Promise<void>
  onError: (msg: string | null) => void
}) {
  const candidates = useMemo(() => {
    const inCol = new Set(col.items.map((i) => i.photoId))
    return photosOfSeries(col.seriesId).filter((p) => !inCol.has(p.id))
  }, [col])
  const [photoId, setPhotoId] = useState('')

  if (candidates.length === 0) return null

  const add = async () => {
    if (!photoId) return
    onError(null)
    try {
      await api.post(`/api/collections/${col.id}/items`, { photoId })
      setPhotoId('')
    } catch (e) {
      // 409：照片被其他未结束合集占用 / 校样已失效 —— 行内展示，服务端不落库
      onError(e instanceof ApiError ? `${e.message}（${e.status} ${e.code}）` : '添加失败')
    } finally {
      await onDone()
    }
  }

  return (
    <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
      <select
        value={photoId}
        onChange={(e) => setPhotoId(e.target.value)}
        data-testid="add-item-select"
        style={{
          background: 'var(--bg-input)',
          color: 'var(--text)',
          border: '1px solid var(--line)',
          borderRadius: 4,
          padding: '8px 12px',
        }}
      >
        <option value="">选择要加入的照片…</option>
        {candidates.map((p) => (
          <option key={p.id} value={p.id}>
            {p.id} · {p.title}
          </option>
        ))}
      </select>
      <button className="btn" disabled={busy || !photoId} onClick={add} data-testid="add-item-btn">
        加入合集（当前有效校样）
      </button>
    </div>
  )
}

function ItemCard({
  item,
  pinnedProofId,
  editable,
  busy,
  onRemove,
}: {
  item: MaterializedItem
  pinnedProofId?: string
  editable: boolean
  busy: boolean
  onRemove: () => void
}) {
  const photo = photoById(item.photoId)
  const stale = pinnedProofId !== undefined && pinnedProofId !== item.proofId
  return (
    <article className="item-card" data-photo-id={item.photoId}>
      {photo && <RatioImage photo={photo} alt={item.title} />}
      <div className="meta">
        <div className="t">{item.title}</div>
        <div className="row">
          <span>校样 v{item.proofVersion}</span>
          {stale ? <span className="badge stale">校样已更新</span> : <span className="badge">当前有效</span>}
        </div>
        <div className="row">
          <span>说明</span>
          <span style={{ textAlign: 'right' }}>{item.caption}</span>
        </div>
        <div className="row">
          <span>署名</span>
          <span>{item.attribution}</span>
        </div>
        {editable && (
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn btn-sm btn-danger" disabled={busy} onClick={onRemove}>
              移出合集
            </button>
          </div>
        )}
      </div>
    </article>
  )
}

const SNAPSHOT_STATUS: Record<Snapshot['status'], string> = {
  active: '当前有效',
  superseded: '已被取代',
  invalidated: '已失效（待复核）',
}

function SnapshotList({ snapshots }: { snapshots: Snapshot[] }) {
  const [openId, setOpenId] = useState<string | null>(null)
  return (
    <table className="table" data-testid="snapshots-table">
      <thead>
        <tr>
          <th>快照</th>
          <th>状态</th>
          <th>发布时间</th>
          <th>指纹</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {snapshots.map((s) => (
          <Fragment key={s.id}>
            <tr data-snapshot-id={s.id}>
              <td className="mono">{s.id}</td>
              <td>
                <span className={`badge snap-${s.status}`}>{SNAPSHOT_STATUS[s.status]}</span>
              </td>
              <td className="muted">
                {new Date(s.publishedAt).toLocaleString('zh-CN')} · {s.publishedBy}
              </td>
              <td className="fp">{s.fingerprint.slice(0, 16)}…</td>
              <td>
                <button
                  className="btn btn-sm"
                  onClick={() => setOpenId(openId === s.id ? null : s.id)}
                >
                  {openId === s.id ? '收起' : '查看内容'}
                </button>
              </td>
            </tr>
            {openId === s.id && (
              <tr>
                <td colSpan={5}>
                  <ul className="confirm-list">
                    {s.items.map((it) => (
                      <li key={it.photoId}>
                        <strong>{it.photoId}</strong>（校样 v{it.proofVersion}）· {it.title} ·
                        说明「{it.caption}」 · 署名 {it.attribution}
                      </li>
                    ))}
                  </ul>
                </td>
              </tr>
            )}
          </Fragment>
        ))}
      </tbody>
    </table>
  )
}
