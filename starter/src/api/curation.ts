/**
 * 策展 API 层（前端模拟后端）。
 *
 * 所有写操作经此层：
 * - 业务校验调用 domain/rules.ts（409/422）；
 * - 冲突/校验失败时 repository 事务回滚，不落库；
 * - 发布支持幂等键 + 并发去重：同一发布意图的重复/并发请求沿用首次结果。
 */
import photoData from '../data/photos.json'
import type { Collection, CurationStoreData, PublishedSnapshot } from '../domain/types'
import {
  CurationError,
  applyReviewConfirmation,
  assertPhotoCanEnter,
  assertPublishable,
  assertReadyToRepublish,
  assertSeriesVersionUnique,
  buildEntry,
  fingerprintOf,
  isPublishedStale,
  validateByline,
  validateDescription,
} from '../domain/rules'
import { proofFingerprint } from '../domain/fingerprint'
import { CurationRepository } from '../store/repository'

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** 模拟网络延迟，让并发场景在 UI 中真实可观察 */
const LATENCY_MS = 180

const requiredOf = (seriesId: string): string[] => {
  const order: Record<string, number> = {}
  for (const p of photoData.photos) order[p.id] = p.order
  return photoData.series
    .find((s) => s.id === seriesId)!
    .photoIds.slice()
    .sort((a, b) => order[a] - order[b])
}

const openCollections = (d: CurationStoreData, selfId?: string): Collection[] =>
  Object.values(d.collections).filter((c) => c.status === 'draft' && c.id !== selfId)

const nextVersionNo = (d: CurationStoreData, seriesId: string): number => {
  const used = Object.values(d.collections)
    .filter((c) => c.seriesId === seriesId)
    .map((c) => c.versionNo)
  return used.length === 0 ? 1 : Math.max(...used) + 1
}

/** 校样撤换 / 说明更正后，把受影响的已发布合集转为 pending_review（保留旧快照） */
function invalidateStalePublished(draft: CurationStoreData, reason: string): string[] {
  const affected: string[] = []
  for (const c of Object.values(draft.collections)) {
    if (c.status !== 'published') continue
    const snap = draft.snapshots
      .filter((s) => s.collectionId === c.id)
      .sort((a, b) => b.generation - a.generation)[0]
    if (isPublishedStale(c, draft.proofs, snap)) {
      c.status = 'pending_review'
      c.reviewConfirmations = []
      c.updatedAt = new Date().toISOString()
      c.invalidReason = reason
      if (snap) snap.superseded = true
      affected.push(c.id)
    }
  }
  return affected
}

// 发布幂等表：idemKey -> 首次结果（合集状态）。同键重试直接沿用。
const publishResults = new Map<string, { at: string; collectionId: string; generation: number }>()
// 在途请求去重：同合集的并发发布共享同一个 Promise（沿用首个请求结果）
const inFlightPublishes = new Map<string, Promise<Collection>>()

export interface CreateCollectionInput {
  seriesId: string
  title: string
  curator: string
}

export class CurationApi {
  constructor(private repo: CurationRepository) {}

  async listCollections(): Promise<Collection[]> {
    await delay(40)
    return this.repo.listCollections().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  async getCollection(id: string): Promise<Collection> {
    await delay(40)
    const c = this.repo.findCollection(id)
    if (!c) throw new CurationError(404, `合集 ${id} 不存在`)
    return c
  }

  async createCollection(input: CreateCollectionInput): Promise<Collection> {
    await delay(LATENCY_MS)
    const title = input.title.trim()
    if (!title) throw new CurationError(422, '合集标题不能为空')
    if (!input.curator.trim()) throw new CurationError(422, '策展人标识不能为空')

    return this.repo.mutate((d) => {
      const versionNo = nextVersionNo(d, input.seriesId)
      // 系列+版本唯一（与 nextVersionNo 双保险，显式规则校验）
      assertSeriesVersionUnique(Object.values(d.collections), input.seriesId, versionNo)
      const id = `col-${input.seriesId}-v${versionNo}`
      const now = new Date().toISOString()
      const collection: Collection = {
        id,
        seriesId: input.seriesId,
        versionNo,
        title,
        description: '',
        byline: '',
        curator: input.curator.trim(),
        entries: [],
        status: 'draft',
        reviewConfirmations: [],
        updatedAt: now,
      }
      d.collections[id] = collection
      return collection
    })
  }

  /** 选入照片：仅当前有效校样；未结束合集内/跨未结束合集冲突 → 409，不落库 */
  async addEntry(collectionId: string, photoId: string, caption: string): Promise<Collection> {
    await delay(LATENCY_MS)
    return this.repo.mutate((d) => {
      const c = d.collections[collectionId]
      if (!c) throw new CurationError(404, '合集不存在')
      if (c.status !== 'draft') {
        throw new CurationError(409, '合集已结束（已发布/待复核），不能再增删照片')
      }
      assertPhotoCanEnter(openCollections(d, c.id), c, photoId)
      const entry = buildEntry(d.proofs, photoId, caption, new Date().toISOString())
      c.entries.push(entry)
      c.updatedAt = new Date().toISOString()
      return c
    })
  }

  /** 更正条目标题说明：draft 允许；若已发布则立即失效转待复核 */
  async correctEntryCaption(collectionId: string, photoId: string, caption: string): Promise<Collection> {
    await delay(LATENCY_MS)
    const capErr = validateDescription(caption, '策展说明')
    if (capErr) throw new CurationError(422, capErr)
    return this.repo.mutate((d) => {
      const c = d.collections[collectionId]
      if (!c) throw new CurationError(404, '合集不存在')
      const e = c.entries.find((x) => x.photoId === photoId)
      if (!e) throw new CurationError(404, '该照片不在合集中')
      if (caption.trim() === e.caption) return c
      e.caption = caption.trim()
      c.updatedAt = new Date().toISOString()
      c.contentFingerprint = fingerprintOf(c)
      c.reviewConfirmations = []
      if (c.status === 'published') {
        invalidateStalePublished(d, `照片 ${photoId} 的策展说明被更正`)
      }
      return d.collections[collectionId]
    })
  }

  /** 更正合集整体说明 / 署名 */
  async updateMetadata(
    collectionId: string,
    patch: { title?: string; description?: string; byline?: string },
  ): Promise<Collection> {
    await delay(LATENCY_MS)
    if (patch.description !== undefined) {
      const err = validateDescription(patch.description, '合集说明')
      if (err && patch.description.trim() !== '') throw new CurationError(422, err)
      // 允许 draft 中先清空（发布时再强制）
    }
    if (patch.byline !== undefined) {
      const err = validateByline(patch.byline)
      if (err && patch.byline.trim() !== '') throw new CurationError(422, err)
    }
    return this.repo.mutate((d) => {
      const c = d.collections[collectionId]
      if (!c) throw new CurationError(404, '合集不存在')
      if (patch.title !== undefined && patch.title.trim()) c.title = patch.title.trim()
      if (patch.description !== undefined) c.description = patch.description.trim()
      if (patch.byline !== undefined) c.byline = patch.byline.trim()
      c.updatedAt = new Date().toISOString()
      c.contentFingerprint = fingerprintOf(c)
      c.reviewConfirmations = []
      if (c.status === 'published') {
        invalidateStalePublished(d, '合集说明或署名被更正')
      }
      return c
    })
  }

  /**
   * 校样撤换：为照片登记新校样版本并置为当前有效；
   * 所有引用旧校样的已发布合集立即失效转待复核（旧快照保留可查）。
   */
  async rotateProof(photoId: string, note: string): Promise<{ version: number; fingerprint: string }> {
    await delay(LATENCY_MS)
    if (!note.trim()) throw new CurationError(422, '新校样备注不能为空')
    return this.repo.mutate((d) => {
      const p = d.proofs[photoId]
      if (!p) throw new CurationError(404, '照片不存在')
      const version = p.versions[p.versions.length - 1].version + 1
      const fingerprint = proofFingerprint(photoId, version, note.trim())
      p.versions.push({ version, fingerprint, note: note.trim(), createdAt: new Date().toISOString() })
      p.activeVersion = version
      // 所有引用该照片的合集条目：draft 直接跟随新有效校样继续编辑；
      // 已发布/待复核合集的条目指针也更新到新校样，使其内容指纹变化——
      // invalidateStalePublished 随即把已发布合集转待复核（旧快照保留）。
      for (const c of Object.values(d.collections)) {
        const e = c.entries.find((x) => x.photoId === photoId)
        if (e && e.proofVersion !== version) {
          e.proofVersion = version
          e.proofFingerprint = fingerprint
          c.contentFingerprint = fingerprintOf(c)
        }
      }
      invalidateStalePublished(d, `照片 ${photoId} 的校样被撤换为 v${version}`)
      return { version, fingerprint }
    })
  }

  /** 追加复核确认（必须换人）；返回是否已满足重新发布条件 */
  async confirmReview(
    collectionId: string,
    reviewer: string,
  ): Promise<{ collection: Collection; readyToRepublish: boolean }> {
    await delay(LATENCY_MS)
    return this.repo.mutate((d) => {
      const c = d.collections[collectionId]
      if (!c) throw new CurationError(404, '合集不存在')
      if (c.status !== 'pending_review') throw new CurationError(409, '该合集不在待复核状态')
      const current = fingerprintOf(c)
      const now = new Date().toISOString()
      const out = applyReviewConfirmation(c, reviewer, current, now)
      d.collections[collectionId] = out.collection
      return out
    })
  }

  /**
   * 发布（首次或复核后重新发布）。
   *
   * 幂等与并发：
   * - 调用方提供 idemKey（同一发布意图的重试必须复用）；同键直接返回首次结果；
   * - 同一合集、同内容指纹的无键并发请求共享在途 Promise，沿用首个请求结果；
   * - 首个请求失败时清除在途表，允许修正后重试。
   */
  async publish(collectionId: string, idemKey?: string): Promise<Collection> {
    if (idemKey) {
      const cached = publishResults.get(idemKey)
      if (cached && cached.collectionId === collectionId) {
        const existing = this.repo.findCollection(collectionId)
        if (existing) return existing // 重复请求沿用首次结果（不产生新一代快照）
      }
    }

    const inFlightKey = collectionId
    const running = inFlightPublishes.get(inFlightKey)
    if (running) return running

    const task = this.doPublish(collectionId, idemKey).finally(() => {
      inFlightPublishes.delete(inFlightKey)
    })
    inFlightPublishes.set(inFlightKey, task)
    return task
  }

  private async doPublish(collectionId: string, idemKey?: string): Promise<Collection> {
    await delay(LATENCY_MS)
    return this.repo.mutate((d) => {
      const c = d.collections[collectionId]
      if (!c) throw new CurationError(404, '合集不存在')

      // 公共发布校验：必选照片覆盖、说明署名、校样有效
      assertPublishable({
        collection: c,
        seriesRequiredPhotoIds: requiredOf(c.seriesId),
        proofs: d.proofs,
      })

      const now = new Date().toISOString()
      const fingerprint = fingerprintOf(c)

      if (c.status === 'published' && c.contentFingerprint === fingerprint) {
        // 已是该内容的发布态：天然幂等，沿用首次结果
        return c
      }

      if (c.status === 'pending_review') {
        // 重新发布：换人双确认 + 指纹一致
        assertReadyToRepublish(c, fingerprint)
      }

      // 写入发布态与新一代快照
      const previousMaxGeneration = d.snapshots
        .filter((s) => s.collectionId === c.id)
        .reduce((m, s) => Math.max(m, s.generation), 0)
      const generation = previousMaxGeneration + 1

      for (const s of d.snapshots.filter((s) => s.collectionId === c.id)) s.superseded = true

      const snapshot: PublishedSnapshot = {
        snapshotId: `snap-${c.id}-g${generation}`,
        collectionId: c.id,
        seriesId: c.seriesId,
        versionNo: c.versionNo,
        title: c.title,
        description: c.description,
        byline: c.byline,
        curator: c.curator,
        entries: c.entries.map((e) => ({ ...e })),
        contentFingerprint: fingerprint,
        publishedAt: now,
        generation,
        superseded: false,
      }
      d.snapshots.push(snapshot)

      c.status = 'published'
      c.publishedAt = now
      c.firstPublishedAt ??= now
      c.contentFingerprint = fingerprint
      c.reviewConfirmations = []
      c.updatedAt = now
      delete c.invalidReason
      if (idemKey) publishResults.set(idemKey, { at: now, collectionId: c.id, generation })
      return c
    })
  }

  listSnapshots(collectionId?: string): PublishedSnapshot[] {
    return this.repo.listSnapshots(collectionId)
  }

  /** 测试辅助：清空幂等记忆 */
  static __resetIdempotency(): void {
    publishResults.clear()
    inFlightPublishes.clear()
  }
}

let singleton: CurationApi | null = null
export function getCurationApi(repo?: CurationRepository): CurationApi {
  if (repo) singleton = new CurationApi(repo)
  if (!singleton) singleton = new CurationApi(CurationRepository.load())
  return singleton
}
