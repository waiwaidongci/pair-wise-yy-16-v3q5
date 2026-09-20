import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '../api/client'
import type { PhotoWithProof, Proof } from '../api/types'
import { RatioImage } from '../components/RatioImage'

interface PhotosResponse {
  photos: PhotoWithProof[]
}

/**
 * 校样管理：每张照片的当前有效校样（说明 / 署名 / 版本）。
 * 撤换照片或更正说明都会生成新校样版本，并使引用该照片的已发布合集立即失效转待复核。
 */
export function ProofsPage() {
  const [photos, setPhotos] = useState<PhotoWithProof[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ photoId: string; kind: 'replace' | 'caption-fix' } | null>(null)
  const [historyOf, setHistoryOf] = useState<string | null>(null)

  const load = useCallback(() => {
    api
      .get<PhotosResponse>('/api/photos')
      .then((d) => setPhotos(d.photos))
      .catch((e) => setError(e.message))
  }, [])

  useEffect(load, [load])

  const onSaved = (invalidated: { id: string; title: string }[], proof: Proof) => {
    setEditing(null)
    setNotice(
      invalidated.length > 0
        ? `已生成校样 v${proof.version}；${invalidated.length} 个已发布合集立即失效转待复核：${invalidated
            .map((c) => c.title)
            .join('、')}`
        : `已生成校样 v${proof.version}；没有已发布合集引用该照片。`,
    )
    load()
  }

  return (
    <div className="container page">
      <h1 className="page-title">校样管理</h1>
      <p className="page-sub">
        撤换照片或更正说明会产生新校样版本；引用该照片的已发布合集将立即失效，进入换人复核流程。
      </p>

      {error && <div className="alert error">{error}</div>}
      {notice && (
        <div className="alert ok" data-testid="proof-notice">
          {notice}
        </div>
      )}

      {photos === null ? (
        <div className="empty-state">加载中…</div>
      ) : (
        <table className="table" data-testid="proofs-table">
          <thead>
            <tr>
              <th>照片</th>
              <th>当前校样</th>
              <th>说明</th>
              <th>署名</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {photos.map((p) => (
              <ProofRow
                key={p.id}
                photo={p}
                expanded={historyOf === p.id}
                onToggleHistory={() => setHistoryOf(historyOf === p.id ? null : p.id)}
                onEdit={(kind) => setEditing({ photoId: p.id, kind })}
              />
            ))}
          </tbody>
        </table>
      )}

      {editing && (
        <ProofEditModal
          photoId={editing.photoId}
          kind={editing.kind}
          onClose={() => setEditing(null)}
          onSaved={onSaved}
        />
      )}
    </div>
  )
}

function ProofRow({
  photo,
  expanded,
  onToggleHistory,
  onEdit,
}: {
  photo: PhotoWithProof
  expanded: boolean
  onToggleHistory: () => void
  onEdit: (kind: 'replace' | 'caption-fix') => void
}) {
  const [history, setHistory] = useState<Proof[] | null>(null)

  useEffect(() => {
    if (expanded) {
      api
        .get<{ proofs: Proof[] }>(`/api/proofs?photoId=${photo.id}`)
        .then((d) => setHistory(d.proofs))
    }
  }, [expanded, photo.id])

  const proof = photo.currentProof
  return (
    <>
      <tr data-photo-id={photo.id}>
        <td style={{ width: 120 }}>
          <div style={{ width: 96 }}>
            <RatioImage photo={photo} alt={photo.altText} />
          </div>
          <div className="mono faint" style={{ marginTop: 4 }}>
            {photo.id}
          </div>
        </td>
        <td>
          {proof ? (
            <>
              <span className="badge">v{proof.version} 当前有效</span>
              <div className="faint" style={{ fontSize: 12, marginTop: 4 }}>
                {new Date(proof.createdAt).toLocaleString('zh-CN')} · {proof.createdBy}
              </div>
            </>
          ) : (
            <span className="badge stale">无有效校样</span>
          )}
        </td>
        <td style={{ maxWidth: 280 }}>{proof?.caption}</td>
        <td>{proof?.attribution}</td>
        <td>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-sm" onClick={() => onEdit('replace')} data-testid={`replace-${photo.id}`}>
              撤换照片
            </button>
            <button className="btn btn-sm" onClick={() => onEdit('caption-fix')} data-testid={`capfix-${photo.id}`}>
              更正说明
            </button>
            <button className="btn btn-sm" onClick={onToggleHistory}>
              {expanded ? '收起历史' : '版本历史'}
            </button>
          </div>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={5}>
            {history === null ? (
              <span className="muted">加载中…</span>
            ) : (
              <ul className="confirm-list">
                {history.map((h) => (
                  <li key={h.id}>
                    <span className={`badge${h.status === 'valid' ? '' : ' stale'}`}>
                      v{h.version} {h.status === 'valid' ? '当前有效' : '已失效'}
                    </span>{' '}
                    {h.changeNote} · {new Date(h.createdAt).toLocaleString('zh-CN')} · {h.createdBy}
                    <br />
                    <span className="muted">
                      说明「{h.caption}」 · 署名 {h.attribution}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

function ProofEditModal({
  photoId,
  kind,
  onClose,
  onSaved,
}: {
  photoId: string
  kind: 'replace' | 'caption-fix'
  onClose: () => void
  onSaved: (invalidated: { id: string; title: string }[], proof: Proof) => void
}) {
  const [caption, setCaption] = useState('')
  const [attribution, setAttribution] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const isCaptionFix = kind === 'caption-fix'

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const body: Record<string, string> = { kind, changeNote: note }
      if (caption.trim()) body.caption = caption.trim()
      if (attribution.trim()) body.attribution = attribution.trim()
      const res = await api.post<{
        proof: Proof
        invalidatedCollections: { id: string; title: string }[]
      }>(`/api/photos/${photoId}/proofs`, body)
      onSaved(res.invalidatedCollections, res.proof)
    } catch (err) {
      setError(err instanceof ApiError ? `${err.message}（${err.status}）` : '保存失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} data-testid="proof-modal">
        <h2>
          {isCaptionFix ? '更正说明' : '撤换照片'} · {photoId}
        </h2>
        <p className="muted" style={{ marginTop: 0 }}>
          将生成新校样版本；引用该照片的已发布合集会立即失效转待复核（旧快照保留可查）。
        </p>
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="pe-caption">{isCaptionFix ? '更正后的说明（必填）' : '新说明（留空则沿用）'}</label>
            <textarea
              id="pe-caption"
              rows={3}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="pe-attr">新署名（留空则沿用）</label>
            <input
              id="pe-attr"
              value={attribution}
              onChange={(e) => setAttribution(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="pe-note">变更备注</label>
            <input
              id="pe-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={isCaptionFix ? '例如：修正地名拼写' : '例如：替换为重新冲洗的版本'}
            />
          </div>
          {error && <div className="alert error">{error}</div>}
          <div className="actions">
            <button type="button" className="btn" onClick={onClose}>
              取消
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={busy || (isCaptionFix && !caption.trim())}
              data-testid="proof-submit"
            >
              {busy ? '提交中…' : '生成新校样'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
