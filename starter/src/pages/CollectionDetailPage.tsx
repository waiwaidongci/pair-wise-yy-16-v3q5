import { useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useCuration, errorMessage } from '../store/curation'
import { photoById, photosBySeries, seriesById } from '../data/content'
import { RatioBox } from '../components/RatioBox'

const STATUS_LABEL: Record<string, string> = {
  draft: '草稿（未结束）',
  published: '已发布',
  pending_review: '待复核',
}

export function CollectionDetailPage() {
  const { id = '' } = useParams()
  const { data, api, actingCurator } = useCuration()
  const collection = data.collections[id]

  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [reviewer, setReviewer] = useState('')
  const [idemKey] = useState(() => `pub-${id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)

  const series = useMemo(() => (collection ? seriesById(collection.seriesId) : null), [collection])
  const seriesPhotos = useMemo(
    () => (collection ? photosBySeries(collection.seriesId) : []),
    [collection],
  )
  const snapshots = useMemo(
    () =>
      data.snapshots
        .filter((s) => s.collectionId === id)
        .sort((a, b) => b.generation - a.generation),
    [data.snapshots, id],
  )

  if (!collection || !series) {
    return (
      <div className="container narrow">
        <h1 className="page-title">合集不存在</h1>
        <Link to="/collections" className="btn">返回合集列表</Link>
      </div>
    )
  }

  const entryPhotoIds = new Set(collection.entries.map((e) => e.photoId))
  const required = series.photoIds
  const missing = required.filter((pid) => !entryPhotoIds.has(pid))

  const run = async (token: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(token)
    setNotice(null)
    try {
      await fn()
      if (ok) setNotice({ kind: 'ok', text: ok })
    } catch (err) {
      const info = errorMessage(err)
      setNotice({
        kind: 'err',
        text: info.code === 409 ? `409 冲突：${info.message}` : `错误：${info.message}${info.details ? `\n${info.details.join('\n')}` : ''}`,
      })
    } finally {
      setBusy(null)
    }
  }

  const addPhoto = (photoId: string) =>
    run(`add-${photoId}`, () => api.addEntry(collection.id, photoId, `${photoById(photoId).title} · 策展说明待补充`))

  const publish = (concurrent = false) =>
    run(concurrent ? 'publish-c' : 'publish', async () => {
      // 同一 idemKey 用于重复点击；并发按钮额外模拟双击竞态
      const tasks = concurrent
        ? [api.publish(collection.id, idemKey), api.publish(collection.id, idemKey)]
        : [api.publish(collection.id, idemKey)]
      await Promise.all(tasks)
    }, concurrent ? '并发的两次发布已合并，沿用首次结果' : '发布成功（重复提交将沿用本次结果）')

  const confirm = () =>
    run('confirm', () => api.confirmReview(collection.id, reviewer), '复核确认已记录')

  const readyConfirmCount = collection.reviewConfirmations.filter(
    (r) => r.fingerprint === collection.contentFingerprint,
  ).length

  return (
    <div className="container collection-detail">
      <p className="eyebrow">Collection Workbench</p>
      <div className="section-head-row">
        <div>
          <h1 className="page-title">{collection.title}</h1>
          <p className="mono">
            {series.title} · v{collection.versionNo} · 唯一键 {collection.seriesId}@v{collection.versionNo}
          </p>
        </div>
        <span className={`badge ${collection.status}`}>{STATUS_LABEL[collection.status]}</span>
      </div>

      {collection.invalidReason && (
        <div className="alert" role="alert">
          已发布版本已失效并转入待复核：{collection.invalidReason}。旧快照仍可查看，但已移出首页推荐。
        </div>
      )}
      {notice && (
        <div className={`action-notice ${notice.kind === 'ok' ? 'alert ok' : 'alert'}`} role="alert">
          {notice.text}
        </div>
      )}

      {/* 元数据：说明 + 署名（发布校验） */}
      <section className="panel">
        <h2>说明与署名</h2>
        <MetadataForm
          key={`${collection.description}|${collection.byline}`}
          collectionId={collection.id}
          defaultDescription={collection.description}
          defaultByline={collection.byline}
          disabled={busy !== null}
          onSave={(patch) => run('meta', () => api.updateMetadata(collection.id, patch), '说明/署名已保存')}
        />
        <p className="mono">当前内容指纹：{collection.contentFingerprint ?? '（尚未计算）'}</p>
      </section>

      {/* 选片 */}
      <section className="panel">
        <h2>系列必选照片（{required.length - missing.length}/{required.length} 已覆盖）</h2>
        <p className="form-hint">
          只能选入照片的<span className="hl">当前有效校样</span>；同一照片在未结束合集中只能出现一次，
          且不能被其它未结束合集占用（冲突返回 409，不会保存）。
        </p>
        <div className="pick-grid">
          {seriesPhotos.map((p) => {
            const entry = collection.entries.find((e) => e.photoId === p.id)
            const proof = data.proofs[p.id]
            const active = proof?.versions.find((v) => v.version === proof?.activeVersion)
            return (
              <div key={p.id} className={`pick-card ${entry ? 'selected' : ''}`}>
                <RatioBox width={p.width} height={p.height}>
                  <img src={`/${p.file}`} alt={p.altText} loading="lazy"
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                </RatioBox>
                <h3>{p.title}</h3>
                <p className="mono">
                  有效校样 v{active?.version} · {active?.fingerprint}
                </p>
                {entry ? (
                  <>
                    <p className="entry-caption">
                      入选 v{entry.proofVersion}：{entry.caption}
                    </p>
                    <CaptionEditor
                      key={entry.caption}
                      disabled={busy !== null}
                      initial={entry.caption}
                      warnPublished={collection.status === 'published'}
                      onSave={(caption) =>
                        run(`cap-${p.id}`, () => api.correctEntryCaption(collection.id, p.id, caption),
                          collection.status === 'published'
                            ? '说明已更正：已发布合集立即失效并转入待复核'
                            : '策展说明已更正')
                      }
                    />
                  </>
                ) : (
                  <button
                    type="button"
                    className="btn"
                    disabled={busy !== null || collection.status !== 'draft'}
                    onClick={() => addPhoto(p.id)}
                  >
                    {busy === `add-${p.id}` ? '加入中…' : '选入当前有效校样'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
        {missing.length > 0 && (
          <p className="missing-hint">发布前仍需覆盖：{missing.map((m) => photoById(m).title).join('、')}</p>
        )}
      </section>

      {/* 发布 / 复核 */}
      <section className="panel">
        <h2>{collection.status === 'pending_review' ? '复核与重新发布' : '发布'}</h2>

        {collection.status === 'draft' && (
          <>
            <p className="form-hint">
              发布前会校验：覆盖系列全部 {required.length} 张必选照片、合集说明、署名、各照片策展说明、所有校样仍有效。
            </p>
            <div className="action-row">
              <button type="button" className="btn btn-primary" disabled={busy !== null} onClick={() => publish(false)}>
                {busy === 'publish' ? '发布中…' : '发布合集'}
              </button>
              <button type="button" className="btn btn-ghost" disabled={busy !== null} onClick={() => publish(true)}>
                模拟并发双发
              </button>
            </div>
          </>
        )}

        {collection.status === 'published' && (
          <div className="published-box">
            <p>该合集当前为线上版本。任何照片校样撤换或说明更正都会使其<span className="hl">立即失效转待复核</span>。</p>
            <p className="mono">
              首次发布：{collection.firstPublishedAt} ｜ 最近发布：{collection.publishedAt}
            </p>
            <div className="action-row">
              <button type="button" className="btn" disabled={busy !== null} onClick={() => publish(false)}>
                重复发布（幂等，沿用首次结果）
              </button>
              <button type="button" className="btn btn-ghost" disabled={busy !== null} onClick={() => publish(true)}>
                模拟并发双发
              </button>
              <Link to="/proofs" className="btn btn-ghost">前往校样登记台撤换校样</Link>
            </div>
          </div>
        )}

        {collection.status === 'pending_review' && (
          <div className="review-box">
            <p className="form-hint">
              复核规则：必须由<span className="hl">非原策展人</span>（原策展人：{collection.curator}）
              进行确认；需要<span className="hl">两位不同复核人连续两次</span>确认当前版本指纹一致，
              才能重新发布。期间内容若再变化，确认进度清零。
            </p>
            <ul className="confirm-list" aria-label="已有复核确认">
              {collection.reviewConfirmations.length === 0 && <li className="empty-hint">暂无复核确认</li>}
              {collection.reviewConfirmations.map((r, i) => (
                <li key={i}>
                  <strong>{r.reviewer}</strong> 确认指纹 <span className="mono">{r.fingerprint}</span>
                </li>
              ))}
            </ul>
            <div className="review-form">
              <input
                aria-label="复核人标识"
                placeholder="输入复核人标识（不能与原策展人相同）"
                value={reviewer}
                onChange={(e) => setReviewer(e.target.value)}
              />
              <button
                type="button"
                className="btn"
                disabled={busy !== null || !reviewer.trim()}
                onClick={confirm}
              >
                {busy === 'confirm' ? '确认中…' : `确认版本指纹一致（${readyConfirmCount}/2）`}
              </button>
            </div>
            <div className="action-row">
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy !== null || readyConfirmCount < 2}
                onClick={() => publish(false)}
              >
                重新发布（生成新一代快照）
              </button>
              <button type="button" className="btn btn-ghost" disabled={busy !== null || readyConfirmCount < 2} onClick={() => publish(true)}>
                模拟并发重新发布
              </button>
            </div>
            <p className="form-hint">
              当前操作人：{actingCurator || '（未设置）'} —— 如与原策展人相同，请在上方改用其他标识演示换人。
            </p>
          </div>
        )}
      </section>

      {/* 快照 */}
      <section className="panel">
        <h2>发布快照（旧快照可查，不进入首页推荐）</h2>
        <div className="snapshot-list">
          {snapshots.length === 0 && <p className="empty-hint">尚无发布快照。</p>}
          {snapshots.map((s) => (
            <details key={s.snapshotId} className="snapshot-item" open={!s.superseded && snapshots[0]?.snapshotId === s.snapshotId}>
              <summary>
                第 {s.generation} 代 · {s.publishedAt}
                <span className={`badge ${s.superseded ? 'pending_review' : 'published'}`}>
                  {s.superseded ? '已失效（仅存档）' : '当前线上'}
                </span>
              </summary>
              <p className="mono">快照指纹：{s.contentFingerprint}</p>
              <p>{s.description}</p>
              <p className="byline-line">{s.byline}</p>
              <ol className="snapshot-entries">
                {s.entries.map((e) => {
                  const p = photoById(e.photoId)
                  return (
                    <li key={e.photoId}>
                      {p.title}（校样 v{e.proofVersion} · <span className="mono">{e.proofFingerprint}</span>）— {e.caption}
                    </li>
                  )
                })}
              </ol>
            </details>
          ))}
        </div>
      </section>
    </div>
  )
}

function MetadataForm({
  collectionId: _collectionId,
  defaultDescription,
  defaultByline,
  disabled,
  onSave,
}: {
  collectionId: string
  defaultDescription: string
  defaultByline: string
  disabled: boolean
  onSave: (patch: { description: string; byline: string }) => Promise<void> | void
}) {
  const [description, setDescription] = useState(defaultDescription)
  const [byline, setByline] = useState(defaultByline)
  return (
    <div>
      <div className="field">
        <label htmlFor="col-desc">合集说明（必填，至少 4 字）</label>
        <textarea id="col-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="col-byline">署名（必填）</label>
        <input id="col-byline" value={byline} onChange={(e) => setByline(e.target.value)} />
      </div>
      <button
        type="button"
        className="btn"
        disabled={disabled || (description === defaultDescription && byline === defaultByline)}
        onClick={() => onSave({ description, byline })}
      >
        保存说明与署名
      </button>
    </div>
  )
}

function CaptionEditor({
  initial,
  disabled,
  warnPublished,
  onSave,
}: {
  initial: string
  disabled: boolean
  warnPublished: boolean
  onSave: (caption: string) => void
}) {
  const [caption, setCaption] = useState(initial)
  return (
    <div className="caption-editor">
      <textarea
        aria-label="更正策展说明"
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
      />
      <button type="button" className="btn btn-ghost" disabled={disabled || caption === initial} onClick={() => onSave(caption)}>
        更正说明
      </button>
      {warnPublished && <em className="correction-warn">更正会使已发布合集立即失效</em>}
    </div>
  )
}
