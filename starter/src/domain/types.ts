/**
 * 策展合集发布台 —— 领域类型定义。
 *
 * 三层分离中的「领域层」：只描述业务概念，不关心持久化（localStorage）
 * 与展示（React）。规则纯函数见 rules.ts。
 */

/** 合集生命周期状态（展示状态独立于版本存储，见 display.ts） */
export type CollectionStatus = 'draft' | 'published' | 'pending_review'

/**
 * 一张照片的「校样（proof）」。
 * 照片文件本身不变，但策展使用的校样有版本号与指纹；只有当前有效校样
 * （activeVersion 指向的那一个）才能被合集选用。
 */
export interface ProofVersion {
  /** 校样版本号，同一照片内单调递增 */
  version: number
  /** 校样指纹：对版本内容（文件引用、调色校样说明等）的稳定哈希 */
  fingerprint: string
  /** 校样说明（调色/裁切备注），属于版本内容，参与指纹计算 */
  note: string
  createdAt: string
}

export interface PhotoProof {
  photoId: string
  versions: ProofVersion[]
  /** 当前有效校样版本号；null 表示尚无效校样（不可选入合集） */
  activeVersion: number | null
}

/** 合集中的一个条目：选用了某张照片当前有效校样，并附带策展说明 */
export interface CollectionEntry {
  photoId: string
  /** 选用时的校样版本（必须是该照片当时的有效校样） */
  proofVersion: number
  /** 选用时的校样指纹快照 */
  proofFingerprint: string
  /** 条目级策展说明（可更正；更正后已发布合集失效） */
  caption: string
  addedAt: string
}

/**
 * 合集按「系列 + 版本」唯一。
 * seriesId + versionNo 构成业务唯一键（见 rules.ts#assertSeriesVersionUnique）。
 */
export interface Collection {
  id: string
  seriesId: string
  /** 同一系列内从 1 递增的合集版本号 */
  versionNo: number

  title: string
  /** 合集整体策展说明（必填，发布前校验） */
  description: string
  /** 署名（必填，发布前校验） */
  byline: string
  /** 创建/策展人标识；复核必须换人（见 rules.ts#applyReviewConfirmation） */
  curator: string

  entries: CollectionEntry[]

  status: CollectionStatus

  /** 两次复核确认记录（pending_review → published 必须换人且指纹一致） */
  reviewConfirmations: ReviewConfirmation[]

  /** 首次发布时间（重复发布沿用首次结果，见 api/publishing.ts） */
  firstPublishedAt?: string
  publishedAt?: string
  /** 当前条目内容指纹（entries 中各 proofFingerprint + caption 的聚合） */
  contentFingerprint?: string
  /** 发布时幂等键：同一发布意图重试/并发时沿用首次结果 */
  lastPublishIdemKey?: string
  /** 转待复核的原因（校样撤换 / 说明更正），仅展示用 */
  invalidReason?: string
  updatedAt: string
}

export interface ReviewConfirmation {
  reviewer: string
  fingerprint: string
  confirmedAt: string
}

/** 已发布合集的不可变快照（旧快照可查，但不计入首页推荐） */
export interface PublishedSnapshot {
  snapshotId: string
  collectionId: string
  seriesId: string
  versionNo: number
  title: string
  description: string
  byline: string
  curator: string
  /** 发布时刻的条目完整副本（含校样版本/指纹/说明） */
  entries: CollectionEntry[]
  contentFingerprint: string
  publishedAt: string
  /** 合集被第几代内容发布（首次=1，复核后重新发布递增） */
  generation: number
  /** 该快照是否仍代表当前线上版本；失效后变为 false，但记录保留可查 */
  superseded: boolean
}

export interface CurationStoreData {
  schemaVersion: 1
  proofs: Record<string, PhotoProof>
  collections: Record<string, Collection>
  snapshots: PublishedSnapshot[]
}
