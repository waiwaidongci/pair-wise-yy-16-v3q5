/**
 * 策展合集规则（纯函数，无存储/无 React 依赖）。
 *
 * 需求映射：
 * - 合集按系列+版本唯一、只能选当前有效校样
 * - 未结束合集（draft）中照片只能出现一次；跨合集冲突 → 409 且不落库
 * - 发布前覆盖系列全部必选照片 + 说明/署名校验
 * - 撤换/更正 → 已发布合集转 pending_review（旧快照保留、不进推荐）
 * - 复核换人 + 连续两次版本指纹一致才能重新发布
 */
import type {
  Collection,
  CollectionEntry,
  PhotoProof,
  PublishedSnapshot,
  ReviewConfirmation,
} from './types'
import { collectionContentFingerprint } from './fingerprint'

/** 业务错误：携带 HTTP 风格状态码，UI 按 409/422 区分展示 */
export class CurationError extends Error {
  constructor(
    public code: 409 | 422 | 404,
    message: string,
    public details?: string[],
  ) {
    super(message)
    this.name = 'CurationError'
  }
}

export const isOpenCollection = (c: Collection): boolean => c.status === 'draft'

/** 取照片当前有效校样；无有效校样时返回 null（不可选入合集） */
export function activeProof(proof: PhotoProof | undefined): PhotoProof['versions'][number] | null {
  if (!proof || proof.activeVersion == null) return null
  return proof.versions.find((v) => v.version === proof.activeVersion) ?? null
}

/** 系列必选照片 id（权威内容数据，按 order 排序） */
export function requiredPhotoIds(
  seriesPhotoIds: string[],
  photoOrder: Record<string, number>,
): string[] {
  return [...seriesPhotoIds].sort((a, b) => (photoOrder[a] ?? 0) - (photoOrder[b] ?? 0))
}

/**
 * 规则 1：合集按「系列 + 版本」唯一。
 * 创建/恢复时若同系列已有相同 versionNo 的合集 → 409，调用方不得落库。
 */
export function assertSeriesVersionUnique(
  existing: Collection[],
  seriesId: string,
  versionNo: number,
  selfId?: string,
): void {
  const clash = existing.find(
    (c) => c.seriesId === seriesId && c.versionNo === versionNo && c.id !== selfId,
  )
  if (clash) {
    throw new CurationError(
      409,
      `系列 ${seriesId} 的 v${versionNo} 合集已存在（${clash.title}），系列与版本组合必须唯一`,
    )
  }
}

/**
 * 规则 2：只能选当前有效校样。
 */
export function assertSelectableProof(
  proof: PhotoProof | undefined,
  entry: { photoId: string; proofVersion: number },
): void {
  const active = activeProof(proof)
  if (!active) {
    throw new CurationError(422, `照片 ${entry.photoId} 尚无有效校样，不能选入合集`)
  }
  if (active.version !== entry.proofVersion) {
    throw new CurationError(
      422,
      `照片 ${entry.photoId} 当前有效校样为 v${active.version}，不能选用 v${entry.proofVersion}`,
    )
  }
}

/**
 * 规则 3：同一未结束合集（draft）内照片不可重复；
 * 跨未结束合集出现同一照片 → 409 冲突，且不落库。
 *
 * 返回 draft 中占用某照片的合集（用于冲突检测）。
 */
export function findPhotoConflict(
  openCollections: Collection[],
  photoId: string,
  selfId?: string,
): Collection | null {
  return (
    openCollections.find(
      (c) => c.id !== selfId && c.entries.some((e) => e.photoId === photoId),
    ) ?? null
  )
}

export function assertPhotoCanEnter(
  openCollections: Collection[],
  self: Collection,
  photoId: string,
): void {
  if (self.entries.some((e) => e.photoId === photoId)) {
    throw new CurationError(409, `照片 ${photoId} 已在本合集中，同一未结束合集内只能出现一次`)
  }
  const clash = findPhotoConflict(openCollections, photoId, self.id)
  if (clash) {
    throw new CurationError(
      409,
      `照片 ${photoId} 已被未结束合集「${clash.title}」占用，跨合集冲突；本次选择未保存`,
    )
  }
}

/** 说明非空、长度区间校验（条目标题级说明 / 合集整体说明共用） */
export function validateDescription(text: string, field: string): string | null {
  const t = text.trim()
  if (!t) return `${field}不能为空`
  if (t.length < 4) return `${field}至少需要 4 个字符`
  if (t.length > 600) return `${field}不能超过 600 个字符`
  return null
}

export function validateByline(text: string): string | null {
  const t = text.trim()
  if (!t) return '署名不能为空'
  if (t.length < 2) return '署名至少需要 2 个字符'
  return null
}

/**
 * 规则 4：发布前置校验（不通过 → 422，不改变状态、不落库）。
 * 必须覆盖系列全部必选照片；说明与署名有效；所有条目仍指向当前有效校样。
 */
export interface PublishContext {
  collection: Collection
  seriesRequiredPhotoIds: string[]
  proofs: Record<string, PhotoProof>
}

export function validateForPublish(ctx: PublishContext): string[] {
  const errors: string[] = []
  const { collection: c, seriesRequiredPhotoIds: required, proofs } = ctx

  const descErr = validateDescription(c.description, '合集说明')
  if (descErr) errors.push(descErr)
  const byErr = validateByline(c.byline)
  if (byErr) errors.push(byErr)

  const entryIds = c.entries.map((e) => e.photoId)
  const missing = required.filter((id) => !entryIds.includes(id))
  if (missing.length > 0) {
    errors.push(`还需覆盖系列必选照片：${missing.join('、')}`)
  }
  const extra = entryIds.filter((id) => !required.includes(id))
  if (extra.length > 0) errors.push(`包含不属于该系列的照片：${extra.join('、')}`)

  for (const e of c.entries) {
    const capErr = validateDescription(e.caption, `照片 ${e.photoId} 的策展说明`)
    if (capErr) errors.push(capErr)
    const p = proofs[e.photoId]
    const active = activeProof(p)
    if (!active || active.version !== e.proofVersion) {
      errors.push(`照片 ${e.photoId} 的校样已失效，需要重新选入当前有效校样`)
    }
  }
  return errors
}

export function assertPublishable(ctx: PublishContext): void {
  const errors = validateForPublish(ctx)
  if (errors.length > 0) throw new CurationError(422, '发布校验未通过', errors)
}

/**
 * 规则 5：内容指纹。任一照片撤换或说明更正都会改变指纹。
 */
export function fingerprintOf(c: Pick<Collection, 'description' | 'byline' | 'entries'>): string {
  return collectionContentFingerprint(c)
}

/**
 * 规则 6：版本失效判定。
 * 已发布合集若条目中任何校样不再是照片的当前有效校样（撤换），
 * 或条目说明/整体说明与发布快照相比发生更正 → 立即失效转待复核。
 *
 * 该函数用于「校样撤换 / 说明更正」发生时批量找出受影响的已发布合集。
 */
export function isPublishedStale(
  c: Collection,
  proofs: Record<string, PhotoProof>,
  snapshot: PublishedSnapshot | undefined,
): boolean {
  if (c.status !== 'published') return false
  // 以最近一次发布快照为比较基准
  const base = snapshot
  if (!base) return true
  for (const e of c.entries) {
    const active = activeProof(proofs[e.photoId])
    if (!active || active.version !== e.proofVersion) return true
    const snapEntry = base.entries.find((s) => s.photoId === e.photoId)
    if (!snapEntry || snapEntry.caption !== e.caption) return true
    if (snapEntry.proofFingerprint !== e.proofFingerprint) return true
  }
  if (base.description !== c.description || base.byline !== c.byline) return true
  return false
}

/**
 * 规则 7：复核换人 + 连续两次指纹一致。
 *
 * - 复核人不能是创建/策展人；
 * - 两次确认必须是两个不同的复核人；
 * - 每次确认记录的指纹必须等于合集当前内容指纹；
 * - 任一条目内容变化（指纹变化）会使此前确认作废、计数清零；
 * 满足两次后允许重新发布。
 */
export function applyReviewConfirmation(
  c: Collection,
  reviewerInput: string,
  currentFingerprint: string,
  now: string,
): { collection: Collection; readyToRepublish: boolean } {
  const reviewer = reviewerInput.trim()
  if (!reviewer) throw new CurationError(422, '需要填写复核人标识')
  if (reviewer === c.curator.trim()) {
    throw new CurationError(409, '复核必须换人：复核人不能是原策展人')
  }

  // 指纹若与既有确认不一致（中途内容又被更正），此前确认全部作废重来
  let valid: ReviewConfirmation[] = c.reviewConfirmations.filter(
    (r) => r.fingerprint === currentFingerprint && r.reviewer !== reviewer,
  )
  if (c.reviewConfirmations.some((r) => r.fingerprint !== currentFingerprint)) {
    valid = []
  }
  if (valid.length >= 2) {
    return { collection: { ...c, reviewConfirmations: valid }, readyToRepublish: true }
  }

  const next = [
    ...valid,
    { reviewer, fingerprint: currentFingerprint, confirmedAt: now },
  ]
  return {
    collection: { ...c, reviewConfirmations: next },
    readyToRepublish: next.length >= 2,
  }
}

/** 重新发布前必须满足：两次换人复核，且指纹与当前内容一致 */
export function assertReadyToRepublish(c: Collection, currentFingerprint: string): void {
  const valid = c.reviewConfirmations.filter((r) => r.fingerprint === currentFingerprint)
  const reviewers = new Set(valid.map((r) => r.reviewer))
  if (valid.length < 2 || reviewers.size < 2) {
    throw new CurationError(
      409,
      '复核未完成：需要两位不同复核人连续确认当前版本指纹一致后才能重新发布',
    )
  }
  if (reviewers.has(c.curator.trim())) {
    throw new CurationError(409, '复核必须换人：确认记录中包含原策展人')
  }
}

/** 构造条目（校验当前有效校样） */
export function buildEntry(
  proofs: Record<string, PhotoProof>,
  photoId: string,
  caption: string,
  now: string,
): CollectionEntry {
  const proof = proofs[photoId]
  const active = activeProof(proof)
  if (!active) throw new CurationError(422, `照片 ${photoId} 尚无有效校样，不能选入合集`)
  const capErr = validateDescription(caption, `照片 ${photoId} 的策展说明`)
  if (capErr) throw new CurationError(422, capErr)
  return {
    photoId,
    proofVersion: active.version,
    proofFingerprint: active.fingerprint,
    caption: caption.trim(),
    addedAt: now,
  }
}
