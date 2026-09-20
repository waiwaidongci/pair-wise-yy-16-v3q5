// ============================================================
// 合集规则层（Collection Rules）
// 负责：全部业务规则 ——
//   · 合集按 (系列, 版本) 唯一
//   · 只能选当前有效校样
//   · 照片在未结束合集中只能出现一次，跨合集冲突 409 且不落库
//   · 发布前校验：覆盖系列全部必选照片 + 说明/署名校验
//   · 照片撤换 / 说明更正 → 已发布合集立即失效转待复核
//   · 复核换人 + 连续两次版本指纹一致才可重新发布
//   · 重复 / 并发发布沿用首次结果（幂等）
// 不直接操作 HTTP，也不关心展示投影（由 readModel.js 负责）。
// ============================================================
import { createHash, randomUUID } from 'node:crypto'
import { rebuildDisplay } from './readModel.js'

export class ApiError extends Error {
  constructor(status, code, message, details = undefined) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

// 未结束 = 草稿 / 已发布 / 待复核；已结束的合集不再占用照片
export const UNFINISHED_STATUSES = ['draft', 'published', 'pending_review']

const now = () => new Date().toISOString()

// ---------- 版本指纹 ----------
// 对「当前若发布会得到的内容」做规范化哈希：照片按 id 排序，
// 每条目取该照片当前有效校样的 id/版本/说明/署名。
export function currentFingerprint(store, collection) {
  const material = materializeItems(store, collection)
  return fingerprintOf({
    seriesId: collection.seriesId,
    version: collection.version,
    items: material.map((m) => ({
      photoId: m.photoId,
      proofId: m.proofId,
      proofVersion: m.proofVersion,
      caption: m.caption,
      attribution: m.attribution,
    })),
  })
}

// 规范化序列化：对象键排序、数组保持顺序（items 已按 photoId 排序）
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    const body = Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`)
      .join(',')
    return `{${body}}`
  }
  return JSON.stringify(value)
}

export function fingerprintOf(payload) {
  return createHash('sha256').update(stableStringify(payload)).digest('hex')
}

// 把合集条目解析为「当前有效校样」的物化视图（发布/指纹/预览共用）
export function materializeItems(store, collection) {
  return collection.items
    .map((item) => {
      const proof = store.currentProof(item.photoId)
      const photo = store.photoById(item.photoId)
      if (!proof || !photo) return null
      return {
        photoId: item.photoId,
        proofId: proof.id,
        proofVersion: proof.version,
        title: photo.title,
        file: proof.file,
        caption: proof.caption,
        attribution: proof.attribution,
        width: photo.width,
        height: photo.height,
        order: photo.order,
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.photoId.localeCompare(b.photoId))
}

// ---------- 发布前校验：覆盖全部必选照片 + 说明/署名 ----------
export function validatePublishable(store, collection) {
  const errors = []
  const series = store.seriesById(collection.seriesId)
  const required = series?.photoIds ?? []
  const present = new Set(collection.items.map((i) => i.photoId))

  for (const photoId of required) {
    if (!present.has(photoId)) {
      errors.push({ field: 'items', code: 'REQUIRED_PHOTO_MISSING', photoId, message: `缺少系列必选照片 ${photoId}` })
    }
  }

  const material = materializeItems(store, collection)
  for (const m of material) {
    if (!m.caption || m.caption.trim().length < 4) {
      errors.push({ field: 'caption', code: 'CAPTION_INVALID', photoId: m.photoId, message: `照片 ${m.photoId} 的说明缺失或过短（至少 4 个字符）` })
    }
    if (!m.attribution || m.attribution.trim().length < 2) {
      errors.push({ field: 'attribution', code: 'ATTRIBUTION_INVALID', photoId: m.photoId, message: `照片 ${m.photoId} 的署名缺失或过短（至少 2 个字符）` })
    }
  }
  return errors
}

// 连续匹配当前指纹的确认次数（从确认记录尾部向前数）
export function consecutiveMatches(collection, fingerprint) {
  let n = 0
  for (let i = collection.reviewConfirmations.length - 1; i >= 0; i--) {
    if (collection.reviewConfirmations[i].fingerprint !== fingerprint) break
    n++
  }
  return n
}

function mustCollection(store, id) {
  const col = store.collectionById(id)
  if (!col) throw new ApiError(404, 'COLLECTION_NOT_FOUND', `合集 ${id} 不存在`)
  return col
}

// ============================================================
// 规则 1：创建合集 —— 按 (系列, 版本) 唯一
// ============================================================
export function createCollection(store, { seriesId, version, title }, user) {
  if (!store.seriesById(seriesId)) {
    throw new ApiError(422, 'SERIES_NOT_FOUND', `系列 ${seriesId} 不存在`)
  }
  if (!Number.isInteger(version) || version < 1) {
    throw new ApiError(400, 'VERSION_INVALID', '版本号必须是正整数')
  }
  if (!title || !title.trim()) {
    throw new ApiError(400, 'TITLE_REQUIRED', '合集标题不能为空')
  }
  const dup = store.db.collections.find((c) => c.seriesId === seriesId && c.version === version)
  if (dup) {
    throw new ApiError(409, 'DUPLICATE_COLLECTION_VERSION', `系列「${seriesId}」的版本 v${version} 合集已存在（${dup.title}）`, { existingId: dup.id })
  }
  const ts = now()
  const col = {
    id: `col-${randomUUID().slice(0, 8)}`,
    seriesId,
    version,
    title: title.trim(),
    status: 'draft',
    items: [],
    createdBy: user,
    createdAt: ts,
    updatedAt: ts,
    publishedAt: null,
    publishedSnapshotId: null,
    invalidatedAt: null,
    invalidatedBy: null,
    invalidationReason: null,
    reviewConfirmations: [],
    closedAt: null,
  }
  store.db.collections.push(col)
  rebuildDisplay(store)
  store.persist()
  return col
}

// ============================================================
// 规则 2/3：添加照片 —— 只能选当前有效校样；
//           照片在未结束合集中只能出现一次，跨合集冲突 409 且不落库
// ============================================================
export function addItem(store, collectionId, { photoId, proofId }, user) {
  const col = mustCollection(store, collectionId)
  if (!['draft', 'pending_review'].includes(col.status)) {
    throw new ApiError(409, 'COLLECTION_NOT_EDITABLE', `合集当前状态为 ${col.status}，不能编辑条目`)
  }
  const photo = store.photoById(photoId)
  if (!photo) throw new ApiError(404, 'PHOTO_NOT_FOUND', `照片 ${photoId} 不存在`)
  if (photo.seriesId !== col.seriesId) {
    throw new ApiError(422, 'PHOTO_NOT_IN_SERIES', `照片 ${photoId} 不属于系列「${col.seriesId}」`)
  }

  // 只能选当前有效校样：显式指定了过期校样 → 409
  const current = store.currentProof(photoId)
  if (!current) throw new ApiError(409, 'NO_VALID_PROOF', `照片 ${photoId} 当前没有有效校样`)
  if (proofId && proofId !== current.id) {
    throw new ApiError(409, 'STALE_PROOF', `只能选用当前有效校样（${current.id}，v${current.version}）；指定校样已失效`)
  }

  // 本合集内只能出现一次
  if (col.items.some((i) => i.photoId === photoId)) {
    throw new ApiError(409, 'DUPLICATE_ITEM', `照片 ${photoId} 已在本合集中`)
  }

  // 跨合集：照片在其他未结束合集中已出现 → 409，不落库（在任何写操作之前抛出）
  const holder = store.db.collections.find(
    (c) => c.id !== col.id && UNFINISHED_STATUSES.includes(c.status) && c.items.some((i) => i.photoId === photoId),
  )
  if (holder) {
    throw new ApiError(409, 'PHOTO_LOCKED', `照片 ${photoId} 已被未结束合集「${holder.title}」（${holder.id}）占用`, { holderId: holder.id })
  }

  col.items.push({ photoId, proofId: current.id, addedAt: now(), addedBy: user })
  col.updatedAt = now()
  rebuildDisplay(store)
  store.persist()
  return col
}

export function removeItem(store, collectionId, photoId) {
  const col = mustCollection(store, collectionId)
  if (!['draft', 'pending_review'].includes(col.status)) {
    throw new ApiError(409, 'COLLECTION_NOT_EDITABLE', `合集当前状态为 ${col.status}，不能编辑条目`)
  }
  const idx = col.items.findIndex((i) => i.photoId === photoId)
  if (idx === -1) throw new ApiError(404, 'ITEM_NOT_FOUND', `合集内没有照片 ${photoId}`)
  col.items.splice(idx, 1)
  col.updatedAt = now()
  rebuildDisplay(store)
  store.persist()
  return col
}

// ============================================================
// 规则 4/8：发布 / 重新发布 —— 校验 + 复核门禁 + 幂等
// 重复或并发发布沿用首次结果：
//   · 相同 Idempotency-Key → 原样回放首次响应
//   · 并发到达 → 挂到首次执行的同一个 Promise 上
//   · 内容未变的重复发布 → 返回首次快照，不产生新快照
// ============================================================
const inflightPublishes = new Map() // collectionId -> Promise

export function publishCollection(store, collectionId, { user, idempotencyKey }) {
  if (inflightPublishes.has(collectionId)) {
    return inflightPublishes.get(collectionId) // 并发发布：沿用首次执行
  }
  const promise = doPublish(store, collectionId, { user, idempotencyKey }).finally(() =>
    inflightPublishes.delete(collectionId),
  )
  inflightPublishes.set(collectionId, promise)
  return promise
}

async function doPublish(store, collectionId, { user, idempotencyKey }) {
  // 让出事件循环，使并发请求能挂到 inflight 上（也为持久化留出异步边界）
  await Promise.resolve()

  // 幂等键回放：同一 key 的重复发布直接返回首次结果
  if (idempotencyKey) {
    const rec = store.idempotencyRecord(idempotencyKey, 'publish')
    if (rec) return { status: rec.responseStatus, body: { ...rec.responseBody, replayed: true } }
  }

  const col = mustCollection(store, collectionId)
  const fingerprint = currentFingerprint(store, col)

  // 已发布且内容未变 → 重复发布沿用首次结果
  if (col.status === 'published') {
    const snap = store.snapshotById(col.publishedSnapshotId)
    if (snap && snap.fingerprint === fingerprint) {
      return {
        status: 200,
        body: { collection: col, snapshot: snap, reused: true, message: '内容未变化，沿用首次发布结果' },
      }
    }
    // 已发布合集的内容不可能在绕过失效规则的情况下变化；防御性兜底
    throw new ApiError(409, 'ALREADY_PUBLISHED', '合集已发布；如需变更请先触发校样更新进入复核流程')
  }
  if (col.status === 'closed') {
    throw new ApiError(409, 'COLLECTION_CLOSED', '合集已结束，不能再发布')
  }

  // 待复核 → 重新发布：需要连续两次指纹一致的复核确认，且两次确认须为不同复核人
  if (col.status === 'pending_review') {
    const confs = col.reviewConfirmations
    const last2 = confs.slice(-2)
    const eligible =
      last2.length === 2 &&
      last2[0].fingerprint === fingerprint &&
      last2[1].fingerprint === fingerprint &&
      last2[0].reviewer !== last2[1].reviewer
    if (!eligible) {
      throw new ApiError(409, 'REVIEW_REQUIRED', '重新发布前需要两名不同复核人连续两次确认版本指纹一致', {
        consecutiveMatches: consecutiveMatches(col, fingerprint),
        required: 2,
      })
    }
  }

  // 发布前校验：覆盖系列全部必选照片 + 说明/署名
  const errors = validatePublishable(store, col)
  if (errors.length > 0) {
    throw new ApiError(422, 'PUBLISH_VALIDATION_FAILED', '发布校验未通过', errors)
  }

  // 物化快照（不可变，旧快照永久保留可查）
  const ts = now()
  const material = materializeItems(store, col)
  const snapshot = {
    id: `snap-${randomUUID().slice(0, 8)}`,
    collectionId: col.id,
    seriesId: col.seriesId,
    version: col.version,
    fingerprint,
    items: material,
    publishedAt: ts,
    publishedBy: user,
    status: 'active', // active → superseded（被新发布取代）/ invalidated（合集失效）
    supersededAt: null,
    invalidatedAt: null,
  }
  for (const s of store.db.snapshots) {
    if (s.collectionId === col.id && s.status === 'active') {
      s.status = 'superseded'
      s.supersededAt = ts
    }
  }
  store.db.snapshots.push(snapshot)

  // 合集状态与条目同步到本次物化的校样
  col.status = 'published'
  col.publishedAt = ts
  col.publishedSnapshotId = snapshot.id
  col.items = material.map((m) => ({ photoId: m.photoId, proofId: m.proofId, addedAt: ts, addedBy: user }))
  col.reviewConfirmations = []
  col.invalidatedAt = null
  col.invalidatedBy = null
  col.invalidationReason = null
  col.updatedAt = ts

  const body = { collection: col, snapshot, reused: false }

  // 幂等记录与发布结果同一次落库，保证原子性
  if (idempotencyKey) {
    store.db.idempotency.push({
      key: idempotencyKey,
      action: 'publish',
      collectionId: col.id,
      responseStatus: 201,
      responseBody: body,
      createdAt: ts,
    })
  }

  rebuildDisplay(store)
  store.persist()
  return { status: 201, body }
}

// ============================================================
// 规则 5：照片撤换 / 说明更正 —— 产生新校样版本，
//         引用该照片的已发布合集立即失效转待复核（旧快照保留可查）
// ============================================================
export function createProofVersion(store, photoId, { caption, attribution, changeNote, kind }, user) {
  const photo = store.photoById(photoId)
  if (!photo) throw new ApiError(404, 'PHOTO_NOT_FOUND', `照片 ${photoId} 不存在`)
  const current = store.currentProof(photoId)
  if (!current) throw new ApiError(409, 'NO_VALID_PROOF', `照片 ${photoId} 当前没有有效校样`)

  const nextCaption = caption !== undefined ? caption : current.caption
  const nextAttribution = attribution !== undefined ? attribution : current.attribution
  if (!nextCaption || !nextCaption.trim()) throw new ApiError(400, 'CAPTION_REQUIRED', '说明不能为空')
  if (!nextAttribution || !nextAttribution.trim()) throw new ApiError(400, 'ATTRIBUTION_REQUIRED', '署名不能为空')
  if (kind === 'caption-fix' && nextCaption.trim() === current.caption.trim()) {
    throw new ApiError(400, 'NO_CHANGE', '说明更正必须与原说明不同')
  }

  const ts = now()
  const next = {
    id: `proof-${photoId}-v${current.version + 1}-${randomUUID().slice(0, 8)}`,
    photoId,
    version: current.version + 1,
    file: current.file, // 演示环境不处理新文件上传，撤换体现为校样版本更替
    caption: nextCaption.trim(),
    attribution: nextAttribution.trim(),
    status: 'valid',
    kind: kind === 'caption-fix' ? 'caption-fix' : 'replace',
    changeNote: changeNote?.trim() || (kind === 'caption-fix' ? '说明更正' : '照片撤换'),
    createdAt: ts,
    createdBy: user,
    supersedes: current.id,
    supersededBy: null,
  }
  current.status = 'superseded'
  current.supersededBy = next.id
  store.db.proofs.push(next)

  // 立即失效：所有引用了该照片的「已发布」合集 → 待复核
  const invalidated = []
  for (const col of store.db.collections) {
    if (col.status !== 'published') continue
    if (!col.items.some((i) => i.photoId === photoId)) continue
    col.status = 'pending_review'
    col.invalidatedAt = ts
    col.invalidatedBy = user
    col.invalidationReason = `${next.changeNote}（${photoId} → 校样 v${next.version}）`
    col.reviewConfirmations = []
    col.updatedAt = ts
    const snap = store.snapshotById(col.publishedSnapshotId)
    if (snap && snap.status === 'active') {
      snap.status = 'invalidated'
      snap.invalidatedAt = ts
    }
    invalidated.push(col)
  }

  rebuildDisplay(store)
  store.persist()
  return { proof: next, invalidatedCollections: invalidated }
}

// ============================================================
// 规则 6/7：复核确认 —— 必须换人；连续两次指纹一致才可重新发布
// ============================================================
export function confirmReview(store, collectionId, { user }) {
  const col = mustCollection(store, collectionId)
  if (col.status !== 'pending_review') {
    throw new ApiError(409, 'NOT_IN_REVIEW', `合集当前状态为 ${col.status}，不在待复核状态`)
  }
  // 复核需换人：不能由造成失效的操作者自审
  if (col.invalidatedBy && col.invalidatedBy === user) {
    throw new ApiError(403, 'REVIEWER_MUST_DIFFER', '复核需换人：不能由触发失效的操作者本人复核')
  }
  // 连续两次确认也须换人
  const last = col.reviewConfirmations[col.reviewConfirmations.length - 1]
  if (last && last.reviewer === user) {
    throw new ApiError(403, 'CONSECUTIVE_SAME_REVIEWER', '连续两次确认不能由同一人完成，请更换复核人')
  }

  const fingerprint = currentFingerprint(store, col)
  col.reviewConfirmations.push({ reviewer: user, fingerprint, confirmedAt: now() })
  col.updatedAt = now()
  rebuildDisplay(store)
  store.persist()

  return {
    collection: col,
    fingerprint,
    consecutiveMatches: consecutiveMatches(col, fingerprint),
    required: 2,
  }
}

// ============================================================
// 结束合集：释放其占用的照片
// ============================================================
export function closeCollection(store, collectionId) {
  const col = mustCollection(store, collectionId)
  if (col.status === 'closed') throw new ApiError(409, 'ALREADY_CLOSED', '合集已结束')
  col.status = 'closed'
  col.closedAt = now()
  col.updatedAt = col.closedAt
  rebuildDisplay(store)
  store.persist()
  return col
}
