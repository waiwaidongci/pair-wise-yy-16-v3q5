// ============================================================
// 版本存储层（Version Storage）
// 负责：校样（proof）、合集（collection）、发布快照（snapshot）、
//       幂等记录（idempotency）的持久化与原子落盘。
// 不包含任何业务规则（规则见 rules.js），也不计算展示状态（见 readModel.js）。
// ============================================================
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'

export const DEFAULT_ATTRIBUTION = '林澜'

const EMPTY_DB = () => ({
  proofs: [],        // 校样版本：每张照片的每次撤换/说明更正都会产生一个新版本
  collections: [],   // 合集
  snapshots: [],     // 发布快照（不可变，旧快照永久可查）
  idempotency: [],   // 幂等记录：重复/并发发布沿用首次结果
  display: null,     // 展示状态投影（由 readModel.js 重建，存储在这里但归属展示层）
})

export class Store {
  constructor(file, photosData) {
    this.file = file
    this.photosData = photosData // 权威内容数据（mock-data/photos.json），只读
    this.db = null
  }

  load() {
    if (existsSync(this.file)) {
      this.db = JSON.parse(readFileSync(this.file, 'utf8'))
    } else {
      this.db = EMPTY_DB()
      this.#seedProofs()
      this.persist()
    }
    return this.db
  }

  // 首次启动：为每张照片建立 v1 校样，说明/署名取自权威数据
  #seedProofs() {
    const now = new Date().toISOString()
    for (const photo of this.photosData.photos) {
      this.db.proofs.push({
        id: `proof-${photo.id}-v1-${randomUUID().slice(0, 8)}`,
        photoId: photo.id,
        version: 1,
        file: photo.file,
        caption: photo.caption,
        attribution: DEFAULT_ATTRIBUTION,
        status: 'valid',
        kind: 'initial',
        changeNote: '初始校样',
        createdAt: now,
        createdBy: 'system',
        supersedes: null,
        supersededBy: null,
      })
    }
  }

  // 原子落盘：先写临时文件再 rename，避免半截写入
  persist() {
    mkdirSync(dirname(this.file), { recursive: true })
    const tmp = join(dirname(this.file), `.db-${process.pid}-${Date.now()}.tmp`)
    writeFileSync(tmp, JSON.stringify(this.db, null, 2))
    renameSync(tmp, this.file)
  }

  // ---------- 只读查询 ----------
  photoById(photoId) {
    return this.photosData.photos.find((p) => p.id === photoId) || null
  }

  seriesById(seriesId) {
    return this.photosData.series.find((s) => s.id === seriesId) || null
  }

  currentProof(photoId) {
    return this.db.proofs.find((pr) => pr.photoId === photoId && pr.status === 'valid') || null
  }

  proofById(proofId) {
    return this.db.proofs.find((pr) => pr.id === proofId) || null
  }

  proofsOf(photoId) {
    return this.db.proofs
      .filter((pr) => pr.photoId === photoId)
      .sort((a, b) => b.version - a.version)
  }

  collectionById(id) {
    return this.db.collections.find((c) => c.id === id) || null
  }

  snapshotById(id) {
    return this.db.snapshots.find((s) => s.id === id) || null
  }

  snapshotsOf(collectionId) {
    return this.db.snapshots
      .filter((s) => s.collectionId === collectionId)
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
  }

  idempotencyRecord(key, action) {
    return this.db.idempotency.find((r) => r.key === key && r.action === action) || null
  }
}
