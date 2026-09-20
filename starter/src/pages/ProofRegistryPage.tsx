import { useState } from 'react'
import { Link } from 'react-router-dom'
import { photos, seriesById } from '../data/content'
import { useCuration, errorMessage } from '../store/curation'
import { RatioBox } from '../components/RatioBox'

/**
 * 校样登记台（版本存储层的管理界面）：
 * 查看每张照片的全部校样版本与当前有效校样；
 * 撤换（登记新版本并置为有效）会立即使引用旧校样的已发布合集转待复核。
 */
export function ProofRegistryPage() {
  const { data, api } = useCuration()
  const [note, setNote] = useState<Record<string, string>>({})
  const [busyId, setBusyId] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const rotate = async (photoId: string) => {
    const text = note[photoId] ?? ''
    setBusyId(photoId)
    setMsg(null)
    try {
      const r = await api.rotateProof(photoId, text)
      setMsg({ kind: 'ok', text: `${photoId} 已撤换到 v${r.version}（${r.fingerprint}）；引用它的已发布合集已转待复核。` })
      setNote((n) => ({ ...n, [photoId]: '' }))
    } catch (err) {
      setMsg({ kind: 'err', text: errorMessage(err).message })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="container proof-page">
      <p className="eyebrow">Proof Registry</p>
      <h1 className="page-title">校样登记台</h1>
      <p className="form-hint">
        每张照片保留全部校样版本；只有<span className="hl">当前有效校样</span>能被合集选用。
        撤换校样后，引用旧校样的已发布合集会立即失效、转入待复核，其旧快照保留可查但不再推荐。
      </p>
      {msg && <div className={msg.kind === 'ok' ? 'alert ok' : 'alert'} role="alert">{msg.text}</div>}

      <div className="proof-grid">
        {photos.map((p) => {
          const proof = data.proofs[p.id]
          const active = proof?.versions.find((v) => v.version === proof?.activeVersion)
          return (
            <article key={p.id} className="proof-card">
              <RatioBox width={p.width} height={p.height}>
                <img src={`/${p.file}`} alt={p.altText} loading="lazy"
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
              </RatioBox>
              <h3>{p.title}</h3>
              <p className="mono">{p.id} · 系列「{seriesById(p.seriesId).title}」</p>
              <ul className="proof-versions">
                {proof?.versions.map((v) => (
                  <li key={v.version} className={v.version === proof.activeVersion ? 'active' : ''}>
                    v{v.version} <span className="mono">{v.fingerprint}</span>
                    <em>{v.note}</em>
                    {v.version === proof.activeVersion && <strong className="hl"> · 当前有效</strong>}
                  </li>
                ))}
              </ul>
              <div className="proof-rotate">
                <input
                  aria-label={`${p.title} 新校样备注`}
                  placeholder="新校样备注（调色/裁切说明）"
                  value={note[p.id] ?? ''}
                  onChange={(e) => setNote((n) => ({ ...n, [p.id]: e.target.value }))}
                />
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={busyId !== null || !(note[p.id] ?? '').trim()}
                  onClick={() => rotate(p.id)}
                >
                  {busyId === p.id ? '撤换中…' : `撤换为 v${(active?.version ?? 0) + 1}`}
                </button>
              </div>
              <p className="mono">当前指纹：{active?.fingerprint}</p>
            </article>
          )
        })}
      </div>

      <p style={{ marginTop: 24 }}>
        <Link to="/collections" className="btn btn-ghost">返回合集列表</Link>
      </p>
    </div>
  )
}
