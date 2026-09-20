/**
 * 版本存储层：负责校样版本、合集与快照的持久化（localStorage）。
 *
 * 与领域规则（rules.ts）、展示状态（store/curation.tsx）分离：
 * 本层只做加载/保存/版本演进，所有业务判定调用 rules.ts；
 * React 不直接读写 localStorage，而是经 api 层访问本仓储。
 */
import photoData from '../data/photos.json'
import type {
  Collection,
  CurationStoreData,
  PhotoProof,
  ProofVersion,
  PublishedSnapshot,
} from '../domain/types'
import { collectionContentFingerprint, proofFingerprint } from '../domain/fingerprint'

const STORAGE_KEY = 'curation-store-v1'

export function emptyStore(): CurationStoreData {
  return { schemaVersion: 1, proofs: {}, collections: {}, snapshots: [] }
}

/** 用权威内容数据生成初始校样登记：每张照片一个 v1 有效校样 */
export function seedProofs(now: string): Record<string, PhotoProof> {
  const proofs: Record<string, PhotoProof> = {}
  for (const p of photoData.photos) {
    const v: ProofVersion = {
      version: 1,
      fingerprint: proofFingerprint(p.id, 1, `初始校样 · ${p.title}`),
      note: `初始校样 · ${p.title}`,
      createdAt: now,
    }
    proofs[p.id] = { photoId: p.id, versions: [v], activeVersion: 1 }
  }
  return proofs
}

const orderedPhotoIds = (seriesId: string): string[] =>
  photoData.series
    .find((s) => s.id === seriesId)!
    .photoIds.slice()
    .sort(
      (a, b) =>
        photoData.photos.find((p) => p.id === a)!.order -
        photoData.photos.find((p) => p.id === b)!.order,
    )

/**
 * 种子合集：一个已发布（高原牧歌 v1，用于首页推荐/快照展示），
 * 一个草稿（凝视 v1，占用全部人像照片，便于演示跨合集 409 冲突）。
 */
export function seedCollections(
  now: string,
  proofs: Record<string, PhotoProof>,
): { collections: Record<string, Collection>; snapshots: PublishedSnapshot[] } {
  const mkEntries = (ids: string[], captions: Record<string, string>) =>
    ids.map((id) => {
      const active = proofs[id].versions.find((v) => v.version === proofs[id].activeVersion)!
      return {
        photoId: id,
        proofVersion: active.version,
        proofFingerprint: active.fingerprint,
        caption: captions[id] ?? `${id} 的策展说明`,
        addedAt: now,
      }
    })

  const pastoralIds = orderedPhotoIds('highland-pastoral')
  const pastoralCaptions: Record<string, string> = {}
  for (const id of pastoralIds) {
    const p = photoData.photos.find((x) => x.id === id)!
    pastoralCaptions[id] = `策展札记：${p.caption}`
  }

  const published: Collection = {
    id: 'col-pastoral-v1',
    seriesId: 'highland-pastoral',
    versionNo: 1,
    title: '高原牧歌 · 首展',
    description:
      '从木屋旁的独牛到铺满山坡的牛群，本合集按游牧一日的节奏编排四张照片，呈现高原牧场中人、畜与雪山之间的静默共生。',
    byline: '策展：林策',
    curator: 'lin-ce',
    entries: mkEntries(pastoralIds, pastoralCaptions),
    status: 'published',
    reviewConfirmations: [],
    firstPublishedAt: now,
    publishedAt: now,
    updatedAt: now,
  }
  published.contentFingerprint = collectionContentFingerprint(published)

  const draft: Collection = {
    id: 'col-gaze-v1',
    seriesId: 'gaze',
    versionNo: 1,
    title: '凝视 · 工作底稿',
    description: '',
    byline: '',
    curator: 'lin-ce',
    entries: mkEntries(orderedPhotoIds('gaze'), {}),
    status: 'draft',
    reviewConfirmations: [],
    updatedAt: now,
  }

  const snapshot: PublishedSnapshot = {
    snapshotId: 'snap-pastoral-v1-g1',
    collectionId: published.id,
    seriesId: published.seriesId,
    versionNo: published.versionNo,
    title: published.title,
    description: published.description,
    byline: published.byline,
    curator: published.curator,
    entries: published.entries.map((e) => ({ ...e })),
    contentFingerprint: published.contentFingerprint!,
    publishedAt: now,
    generation: 1,
    superseded: false,
  }

  return {
    collections: { [published.id]: published, [draft.id]: draft },
    snapshots: [snapshot],
  }
}

export function createSeededStore(now: string = new Date().toISOString()): CurationStoreData {
  const proofs = seedProofs(now)
  const { collections, snapshots } = seedCollections(now, proofs)
  return { schemaVersion: 1, proofs, collections, snapshots }
}

export class CurationRepository {
  private data: CurationStoreData
  private listeners = new Set<() => void>()

  private constructor(data: CurationStoreData) {
    this.data = data
  }

  /** 从 localStorage 加载；首次访问时写入种子数据 */
  static load(storage: Storage = localStorage): CurationRepository {
    let data: CurationStoreData
    try {
      const raw = storage.getItem(STORAGE_KEY)
      if (raw) {
        data = JSON.parse(raw) as CurationStoreData
        if (data.schemaVersion !== 1) throw new Error('unknown schema')
      } else {
        data = createSeededStore()
        storage.setItem(STORAGE_KEY, JSON.stringify(data))
      }
    } catch {
      data = createSeededStore()
      storage.setItem(STORAGE_KEY, JSON.stringify(data))
    }
    return new CurationRepository(data)
  }

  /** 测试/构造用 */
  static fromData(data: CurationStoreData): CurationRepository {
    return new CurationRepository(structuredClone(data))
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  private storageRef(): Storage | null {
    return typeof localStorage === 'undefined' ? null : localStorage
  }

  private persist(storage: Storage | null = this.storageRef()): void {
    if (storage) storage.setItem(STORAGE_KEY, JSON.stringify(this.data))
    for (const fn of this.listeners) fn()
  }

  getState(): CurationStoreData {
    return this.data
  }

  listCollections(): Collection[] {
    return Object.values(this.data.collections)
  }

  getCollection(id: string): Collection {
    const c = this.data.collections[id]
    if (!c) throw new Error(`collection not found: ${id}`)
    return c
  }

  findCollection(id: string): Collection | null {
    return this.data.collections[id] ?? null
  }

  getProof(photoId: string): PhotoProof | null {
    return this.data.proofs[photoId] ?? null
  }

  allProofs(): Record<string, PhotoProof> {
    return this.data.proofs
  }

  listSnapshots(collectionId?: string): PublishedSnapshot[] {
    const all = this.data.snapshots
    return (collectionId ? all.filter((s) => s.collectionId === collectionId) : all).slice()
  }

  latestSnapshot(collectionId: string): PublishedSnapshot | undefined {
    return this.data.snapshots
      .filter((s) => s.collectionId === collectionId)
      .sort((a, b) => b.generation - a.generation)[0]
  }

  /**
   * 事务式写操作：先在结构化副本上完成 fn，fn 抛错则整体放弃（不落库），
   * 成功后整体替换并持久化。保证「409 冲突不落库」。
   */
  mutate<T>(fn: (draft: CurationStoreData) => T, storage: Storage | null = this.storageRef()): T {
    const draft = structuredClone(this.data)
    const result = fn(draft)
    this.data = draft
    this.persist(storage)
    return result
  }

  /** 重置演示数据 */
  reset(now: string = new Date().toISOString(), storage: Storage | null = this.storageRef()): void {
    this.data = createSeededStore(now)
    this.persist(storage)
  }
}
